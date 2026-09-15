/**
 * deepfilter3.service.unit.spec.ts — UNIT tests for DeepFilter3Service.
 *
 * WHY UNIT AND NOT E2E
 * --------------------
 * Everything worth protecting in this service is *arithmetic and state machinery* that an e2e test
 * physically cannot observe: the VAD's RMS smoothing (alpha 0.3), the asymmetric noise-floor drift
 * (0.02 down / 0.005 up) and its 0.0008 clamp, the 3.5x speech ratio, the 500 ms warm-up window, the
 * 15-frame (300 ms) hangover, the tap/impulse rejection guard (voice-band ratio < 0.15 AND a sudden
 * RMS spike), and the fixed x1.5 gain / 0.0 keepalive gain in the audio graph. In a browser e2e run
 * these are invisible: the only externally visible artefact is "the audio sounds cleaner", which is
 * not assertable, requires a real microphone, a real AudioWorklet, and a ~7.7 MB ONNX/WASM download
 * from a CDN. Driving the service directly with hand-rolled AudioContext / analyser / processor
 * doubles plus jasmine.clock() makes every one of those numbers deterministic.
 *
 * WHAT THIS FILE PROTECTS
 * -----------------------
 *   - The VAD decision rules and their exact constants (levels 30 vs 80, warm-up, hangover, tap guard).
 *   - Noise-floor adaptation rates and the hard lower clamp.
 *   - The live audio graph topology and the two hard-coded gains (1.5 boost, 0.0 keepalive) — a change
 *     to either caused audible clipping / Chrome context suspension in the past.
 *   - The "audio always works" fallbacks: processStream() returning the raw stream and processOffline()
 *     returning the untouched samples when anything downstream fails.
 *   - destroy() fully resetting state and swallowing teardown errors.
 *
 * NOT COVERED HERE (needs real WASM / AudioWorklet — deliberately out of scope):
 *   - init()'s success path. It constructs a real DeepFilterNet3Core and awaits initialize(), which
 *     downloads and compiles the ONNX model from a CDN. DeepFilterNet3Core is imported as a hard module
 *     binding (not injected), so it cannot be substituted without changing application code. Only the
 *     two deterministic failure paths are covered below.
 *   - The assetConfig/df3CdnUrl branch in init(), for the same reason — it is only observable on the
 *     real DeepFilterNet3Core constructor.
 *   - Actual noise suppression quality / the worklet's DSP. That belongs to the vendored package.
 *
 * Case IDs: SHU-40 .. SHU-53.
 */

import { DeepFilterNoiseFilterProcessor } from 'deepfilternet3-noise-filter';
import { DeepFilter3Service } from './deepfilter3.service';

// ─────────────────────────────────────────────────────────────────────────────
// Doubles
// ─────────────────────────────────────────────────────────────────────────────

/** Analyser double. Time-domain data is a constant sample value, so RMS === |amplitude|. */
class FakeAnalyser {
  __name = 'analyser';
  fftSize = 512;
  smoothingTimeConstant = 0.8;
  get frequencyBinCount() { return this.fftSize / 2; }

  /** every time-domain sample takes this value → rms === Math.abs(amplitude) */
  amplitude = 0;
  /** how getFloatFrequencyData fills the dB bin buffer */
  freqFill: (buf: Float32Array) => void = (buf) => buf.fill(-Infinity);

  timeBufLengths: number[] = [];
  freqCallCount = 0;
  disconnectCalls = 0;
  disconnectThrows = false;

  getFloatTimeDomainData(buf: Float32Array) {
    this.timeBufLengths.push(buf.length);
    buf.fill(this.amplitude);
  }
  getFloatFrequencyData(buf: Float32Array) {
    this.freqCallCount++;
    this.freqFill(buf);
  }
  connect(t: any) { return t; }
  disconnect() {
    this.disconnectCalls++;
    if (this.disconnectThrows) throw new Error('analyser disconnect boom');
  }
}

/** DeepFilterNet3Core double — records every runtime control call. */
class FakeProcessor {
  levels: number[] = [];
  enabledCalls: boolean[] = [];
  destroyCalls = 0;
  destroyThrows = false;
  workletNode: any = null;
  createRejectsWith: any = null;
  ctxSeen: any = null;

  setSuppressionLevel(l: number) { this.levels.push(l); }
  setNoiseSuppressionEnabled(on: boolean) { this.enabledCalls.push(on); }
  destroy() {
    this.destroyCalls++;
    if (this.destroyThrows) throw new Error('processor destroy boom');
  }
  async createAudioWorkletNode(ctx: any) {
    if (this.createRejectsWith) throw this.createRejectsWith;
    this.ctxSeen = ctx;
    return this.workletNode;
  }
}

/** Named graph node that records every connect() into a shared edge list. */
function makeNode(name: string, edges: string[][]) {
  return {
    __name: name,
    __disconnects: 0,
    __throwOnDisconnect: false,
    connect(t: any) { edges.push([name, t.__name]); return t; },
    disconnect() {
      (this as any).__disconnects++;
      if ((this as any).__throwOnDisconnect) throw new Error(name + ' disconnect boom');
    },
  } as any;
}

/** AudioContext double for processStream(). */
class FakeAudioContext {
  __name = 'ctx';
  state: AudioContextState = 'running';
  resumeCalls = 0;
  closeCalls = 0;
  closeThrows = false;

  edges: string[][] = [];
  destination = makeNode('ctxDestination', this.edges);
  analyser = new FakeAnalyser();
  gains: any[] = [];
  msDestination = makeNode('msDestination', this.edges);
  source = makeNode('source', this.edges);
  sourceArg: any = null;

  constructor() {
    (this.msDestination as any).stream = { __name: 'cleanStream' };
  }

  async resume() { this.resumeCalls++; this.state = 'running'; }
  // NOTE: deliberately NOT `async`. destroy() wraps close() in a synchronous try/catch, which cannot
  // catch a rejected promise — an async double would surface as an unhandled rejection rather than as
  // the swallowed-error path this suite is exercising. (The real AudioContext.close() is promise-based,
  // so a genuine close() rejection would indeed escape destroy()'s try/catch — noted, not asserted here.)
  close(): Promise<void> {
    this.closeCalls++;
    if (this.closeThrows) throw new Error('close boom');
    return Promise.resolve();
  }

  createMediaStreamSource(s: any) { this.sourceArg = s; return this.source; }
  createMediaStreamDestination() { return this.msDestination; }
  createGain() {
    const g = makeNode(this.gains.length === 0 ? 'gainBoost' : 'silentGain', this.edges);
    g.gain = { value: 1 };
    this.gains.push(g);
    return g;
  }
  createAnalyser() { return this.analyser as any; }
}

// ── Spectrum helpers ────────────────────────────────────────────────────────
// fftSize 512 @ 48 kHz → 93.75 Hz/bin → voice band = bins 3..36 inclusive (34 bins of 255 scanned).

/** Voice-like: all energy inside the 300–3400 Hz band → ratio ≈ 1.0, never a tap. */
const voiceSpectrum = (buf: Float32Array) => {
  buf.fill(-100);
  for (let i = 3; i <= 36; i++) buf[i] = 0;
};
/** Broadband impulse: flat spectrum → ratio = 34/255 ≈ 0.133, below the 0.15 tap threshold. */
const flatSpectrum = (buf: Float32Array) => buf.fill(0);

/** Wires a service instance up with VAD doubles and starts the (private) VAD loop. */
function startVad(svc: DeepFilter3Service, analyser: FakeAnalyser, proc: FakeProcessor) {
  (svc as any).vadAnalyser = analyser;
  (svc as any).processor = proc;
  (svc as any)._startVad();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('DeepFilter3Service', () => {

  let svc: DeepFilter3Service;

  beforeEach(() => {
    svc = new DeepFilter3Service();
    spyOn(console, 'log');
    spyOn(console, 'warn');
    spyOn(console, 'error');
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-40 init() — support guard and failure paths', () => {

    let originalAudioContext: any;

    beforeEach(() => { originalAudioContext = (window as any).AudioContext; });
    afterEach(() => { (window as any).AudioContext = originalAudioContext; });

    it('returns false and never touches AudioContext when the browser is unsupported', async () => {
      spyOn(DeepFilterNoiseFilterProcessor, 'isSupported').and.returnValue(false);
      let constructed = 0;
      (window as any).AudioContext = function () { constructed++; };

      const ok = await svc.init();

      expect(ok).toBe(false);
      expect(constructed).toBe(0);
      expect(svc.isInitialized()).toBe(false);
      expect(svc.initTimeMs).toBe(0);
    });

    it('swallows an AudioContext construction failure and returns false rather than throwing', async () => {
      spyOn(DeepFilterNoiseFilterProcessor, 'isSupported').and.returnValue(true);
      (window as any).AudioContext = function () { throw new Error('no audio device'); };

      const ok = await svc.init();

      expect(ok).toBe(false);
      expect(svc.isInitialized()).toBe(false);
      expect(svc.isActive()).toBe(false);
    });

    it('leaves the service in the "not initialised" state so processStream() falls back to the raw stream', async () => {
      spyOn(DeepFilterNoiseFilterProcessor, 'isSupported').and.returnValue(true);
      (window as any).AudioContext = function () { throw new Error('no audio device'); };
      await svc.init();

      const raw = { __name: 'rawStream' } as any;
      await expectAsync(svc.processStream(raw)).toBeResolvedTo(raw);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-41 processStream() — audio graph wiring', () => {

    let ctx: FakeAudioContext;
    let proc: FakeProcessor;
    let worklet: any;
    let raw: any;

    beforeEach(() => {
      ctx = new FakeAudioContext();
      proc = new FakeProcessor();
      worklet = makeNode('worklet', ctx.edges);
      proc.workletNode = worklet;
      raw = { __name: 'rawStream' };
      (svc as any).audioContext = ctx;
      (svc as any).processor = proc;
    });

    afterEach(() => svc.destroy());

    it('returns the MediaStreamDestination stream, not the raw stream', async () => {
      const out = await svc.processStream(raw);
      expect(out as any).toBe((ctx.msDestination as any).stream);
      expect(ctx.sourceArg).toBe(raw);
    });

    it('wires mic → worklet → gainBoost → destination, with the silent keepalive branch', async () => {
      await svc.processStream(raw);
      expect(ctx.edges).toEqual([
        ['source', 'worklet'],
        ['worklet', 'gainBoost'],
        ['gainBoost', 'msDestination'],
        ['gainBoost', 'silentGain'],
        ['silentGain', 'ctxDestination'],
        ['source', 'analyser'],
      ]);
    });

    it('sets the boost gain to exactly 1.5 (higher values clipped the Opus encoder)', async () => {
      await svc.processStream(raw);
      expect(ctx.gains[0].gain.value).toBe(1.5);
    });

    it('sets the keepalive gain to exactly 0 so nothing is audible on ctx.destination', async () => {
      await svc.processStream(raw);
      expect(ctx.gains[1].gain.value).toBe(0);
    });

    it('configures the VAD analyser with fftSize 512 and no smoothing', async () => {
      await svc.processStream(raw);
      expect(ctx.analyser.fftSize).toBe(512);
      expect(ctx.analyser.smoothingTimeConstant).toBe(0);
    });

    it('marks the service active and hands the AudioContext to the worklet factory', async () => {
      expect(svc.isActive()).toBe(false);
      await svc.processStream(raw);
      expect(svc.isActive()).toBe(true);
      expect(proc.ctxSeen).toBe(ctx as any);
      expect(svc.processingLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-42 processStream() — guards, resume and fallback', () => {

    let ctx: FakeAudioContext;
    let proc: FakeProcessor;
    let raw: any;

    beforeEach(() => {
      ctx = new FakeAudioContext();
      proc = new FakeProcessor();
      proc.workletNode = makeNode('worklet', ctx.edges);
      raw = { __name: 'rawStream' };
    });

    afterEach(() => svc.destroy());

    it('returns the raw stream untouched when init() has not run', async () => {
      const out = await svc.processStream(raw);
      expect(out as any).toBe(raw);
      expect(svc.isActive()).toBe(false);
    });

    it('returns the raw stream when the AudioContext exists but the processor does not', async () => {
      (svc as any).audioContext = ctx;
      const out = await svc.processStream(raw);
      expect(out as any).toBe(raw);
      expect(ctx.edges.length).toBe(0);
    });

    it('resumes a suspended AudioContext, and leaves a running one alone', async () => {
      ctx.state = 'suspended';
      (svc as any).audioContext = ctx;
      (svc as any).processor = proc;
      await svc.processStream(raw);
      expect(ctx.resumeCalls).toBe(1);

      const ctx2 = new FakeAudioContext();
      const svc2 = new DeepFilter3Service();
      (svc2 as any).audioContext = ctx2;
      (svc2 as any).processor = new FakeProcessor();
      ((svc2 as any).processor as FakeProcessor).workletNode = makeNode('worklet', ctx2.edges);
      await svc2.processStream(raw);
      expect(ctx2.resumeCalls).toBe(0);
      svc2.destroy();
    });

    it('falls back to the raw stream and stays inactive when the worklet cannot be created', async () => {
      proc.createRejectsWith = new Error('worklet module missing');
      (svc as any).audioContext = ctx;
      (svc as any).processor = proc;

      const out = await svc.processStream(raw);

      expect(out as any).toBe(raw);
      expect(svc.isActive()).toBe(false);
      expect(ctx.edges.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-43 VAD — 500 ms warm-up window', () => {

    let analyser: FakeAnalyser;
    let proc: FakeProcessor;

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate();
      analyser = new FakeAnalyser();
      proc = new FakeProcessor();
    });
    afterEach(() => { svc.destroy(); jasmine.clock().uninstall(); });

    it('holds the gentle level 30 during warm-up even though the input is pure silence', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);

      jasmine.clock().tick(480);   // frames at t = 20..480 → 24 frames, all inside the warm-up window

      expect(proc.levels.length).toBe(24);
      expect(proc.levels.every(l => l === 30)).toBe(true);
    });

    it('switches to the strong level 80 on the first frame at/after 500 ms', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);

      jasmine.clock().tick(500);   // the 25th frame lands exactly on warmupUntil → no longer < warmupUntil

      expect(proc.levels.length).toBe(25);
      expect(proc.levels[23]).toBe(30);
      expect(proc.levels[24]).toBe(80);
    });

    it('still adapts the noise floor during warm-up (the early return happens after the update)', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);
      expect((svc as any).noiseFloor).toBe(0.002);

      jasmine.clock().tick(200);   // 10 warm-up frames

      expect((svc as any).noiseFloor).toBeLessThan(0.002);
      expect((svc as any).noiseFloor).toBeCloseTo(0.002 * Math.pow(0.98, 10), 8);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-44 VAD — RMS speech vs silence decision', () => {

    let analyser: FakeAnalyser;
    let proc: FakeProcessor;

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate();
      analyser = new FakeAnalyser();
      proc = new FakeProcessor();
    });
    afterEach(() => { svc.destroy(); jasmine.clock().uninstall(); });

    it('keeps level 80 for sustained silence once warm-up is over', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);

      jasmine.clock().tick(1000);   // 50 frames

      expect(proc.levels.slice(24).every(l => l === 80)).toBe(true);
      expect(proc.levels.slice(24).length).toBe(26);
    });

    it('holds level 30 for sustained voice-band speech well above the noise floor', () => {
      analyser.amplitude = 0.1;
      analyser.freqFill = voiceSpectrum;
      startVad(svc, analyser, proc);

      jasmine.clock().tick(700);

      expect(proc.levels.length).toBe(35);
      expect(proc.levels.slice(24).every(l => l === 30)).toBe(true);
    });

    it('runs the FFT only when RMS already says "maybe speech" (CPU guard)', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);
      jasmine.clock().tick(1000);
      expect(analyser.freqCallCount).toBe(0);

      analyser.amplitude = 0.1;
      analyser.freqFill = voiceSpectrum;
      jasmine.clock().tick(60);     // 3 candidate frames
      expect(analyser.freqCallCount).toBe(3);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-45 VAD — tap / broadband impulse rejection', () => {

    let analyser: FakeAnalyser;
    let proc: FakeProcessor;

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate();
      analyser = new FakeAnalyser();
      proc = new FakeProcessor();
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);
      jasmine.clock().tick(500);          // clear the warm-up window on silence
      proc.levels.length = 0;
    });
    afterEach(() => { svc.destroy(); jasmine.clock().uninstall(); });

    it('rejects a sudden broadband impulse and stays at the strong level 80', () => {
      analyser.amplitude = 0.1;
      analyser.freqFill = flatSpectrum;   // ratio 34/255 ≈ 0.133 < 0.15, and rms spikes off a 0 baseline

      jasmine.clock().tick(20);           // one frame

      expect(proc.levels).toEqual([80]);
    });

    it('accepts the identical loudness when the energy sits in the voice band', () => {
      analyser.amplitude = 0.1;
      analyser.freqFill = voiceSpectrum;  // ratio ≈ 1.0 → the tap guard cannot fire

      jasmine.clock().tick(20);

      expect(proc.levels).toEqual([30]);
    });

    // ── PINNED CURRENT BEHAVIOUR — looks wrong ────────────────────────────────
    // The header documents the tap guard as "rms spiked > 3x smoothed value (sudden)". But smoothedRms is
    // updated with THIS frame before the comparison (smoothed = 0.3*rms + 0.7*prev), so
    //     rms > 3 * (0.3*rms + 0.7*prev)  ⇔  rms > 21 * prev
    // The effective bar is ~21x the PREVIOUS smoothed value, not 3x. Consequence, asserted below:
    // only the very first frame of a broadband noise burst is rejected; from frame 2 the smoothed value
    // has caught up, the spike test can never pass again, and sustained broadband noise (fan, keyboard
    // rattle, air-con) is classified as SPEECH and gets the gentle level 30. If the guard is later
    // fixed to compare against the pre-update smoothed value, this test goes red and should be reviewed.
    it('PINNED: only the FIRST frame of sustained broadband noise is rejected — the rest are treated as speech', () => {
      analyser.amplitude = 0.1;
      analyser.freqFill = flatSpectrum;

      jasmine.clock().tick(200);          // 10 frames of continuous broadband noise

      expect(proc.levels[0]).toBe(80);                       // rejected
      expect(proc.levels.slice(1)).toEqual(Array(9).fill(30)); // then accepted as "speech"
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-46 VAD — 300 ms hangover', () => {

    let analyser: FakeAnalyser;
    let proc: FakeProcessor;

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate();
      analyser = new FakeAnalyser();
      proc = new FakeProcessor();
    });
    afterEach(() => { svc.destroy(); jasmine.clock().uninstall(); });

    it('holds level 30 for exactly 15 frames (300 ms) after speech stops, then drops to 80', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);
      jasmine.clock().tick(500);           // 25 frames: 24 warm-up + 1 post-warm-up silence frame
      expect(proc.levels.length).toBe(25);

      // One short voice-band burst, sized so the smoothed RMS falls back under the speech
      // threshold on the very next frame — isolating the hangover from the smoothing decay.
      analyser.amplitude = 0.019;
      analyser.freqFill = voiceSpectrum;
      jasmine.clock().tick(20);
      expect(proc.levels[25]).toBe(30);    // the speech frame itself

      analyser.amplitude = 0;
      jasmine.clock().tick(20 * 20);       // 20 further silent frames

      const after = proc.levels.slice(26);
      expect(after.slice(0, 15)).toEqual(Array(15).fill(30));  // HANGOVER_FRAMES = 15
      expect(after[15]).toBe(80);
    });

    it('re-arms the full hangover on every fresh speech frame', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);
      jasmine.clock().tick(500);

      analyser.amplitude = 0.019;
      analyser.freqFill = voiceSpectrum;
      jasmine.clock().tick(20);
      expect((svc as any).hangover).toBe(15);

      analyser.amplitude = 0;
      jasmine.clock().tick(20 * 5);
      expect((svc as any).hangover).toBe(10);

      analyser.amplitude = 0.019;
      jasmine.clock().tick(20);
      expect((svc as any).hangover).toBe(15);   // re-armed, not incremented
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-47 VAD — noise-floor adaptation and clamp', () => {

    let analyser: FakeAnalyser;
    let proc: FakeProcessor;

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate();
      analyser = new FakeAnalyser();
      proc = new FakeProcessor();
    });
    afterEach(() => { svc.destroy(); jasmine.clock().uninstall(); });

    it('resets the VAD state to its published defaults when the loop starts', () => {
      (svc as any).noiseFloor = 0.5;
      (svc as any).smoothedRms = 0.5;
      (svc as any).hangover = 9;

      startVad(svc, analyser, proc);

      expect((svc as any).noiseFloor).toBe(0.002);
      expect((svc as any).smoothedRms).toBe(0);
      expect((svc as any).hangover).toBe(0);
    });

    it('drops fast (alpha 0.02) below the floor and rises slowly (0.005) above it', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);
      jasmine.clock().tick(20);                                    // smoothed 0 < floor → fast decay
      expect((svc as any).noiseFloor).toBeCloseTo(0.02 * 0 + 0.98 * 0.002, 10);

      const svc2 = new DeepFilter3Service();
      const a2 = new FakeAnalyser();
      a2.amplitude = 0.1;
      a2.freqFill = voiceSpectrum;
      startVad(svc2, a2, new FakeProcessor());
      jasmine.clock().tick(20);                                    // smoothed 0.03 > floor → slow rise
      // 7dp, not more: the analyser buffer is a Float32Array, so a 0.1 sample is really 0.10000000149.
      expect((svc2 as any).smoothedRms).toBeCloseTo(0.03, 7);
      expect((svc2 as any).noiseFloor).toBeCloseTo(0.005 * 0.03 + 0.995 * 0.002, 10);
      svc2.destroy();
    });

    it('never lets the noise floor fall below the 0.0008 clamp, however long the silence', () => {
      analyser.amplitude = 0;
      startVad(svc, analyser, proc);

      jasmine.clock().tick(20 * 300);   // 300 frames of digital silence

      expect((svc as any).noiseFloor).toBe(0.0008);
    });

    it('smooths RMS with alpha 0.3 rather than tracking it instantly', () => {
      analyser.amplitude = 0.1;
      analyser.freqFill = voiceSpectrum;
      startVad(svc, analyser, proc);

      jasmine.clock().tick(20);
      // 7dp, not more: the analyser buffer is a Float32Array, so a 0.1 sample is really 0.10000000149.
      expect((svc as any).smoothedRms).toBeCloseTo(0.03, 7);
      jasmine.clock().tick(20);
      expect((svc as any).smoothedRms).toBeCloseTo(0.3 * 0.1 + 0.7 * 0.03, 7);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-48 getMicLevelDb()', () => {

    let analyser: FakeAnalyser;

    beforeEach(() => { analyser = new FakeAnalyser(); });

    it('returns the -60 sentinel when the VAD analyser is not wired yet', () => {
      expect(svc.getMicLevelDb()).toBe(-60);
    });

    it('returns the -60 sentinel for digital silence rather than -Infinity', () => {
      analyser.amplitude = 0;
      (svc as any).vadAnalyser = analyser;
      expect(svc.getMicLevelDb()).toBe(-60);
    });

    it('converts full scale to 0 dBFS and half scale to -6.0 dBFS, rounded to 1 decimal', () => {
      (svc as any).vadAnalyser = analyser;
      analyser.amplitude = 1;
      expect(svc.getMicLevelDb()).toBe(0);
      analyser.amplitude = 0.5;
      expect(svc.getMicLevelDb()).toBe(-6);      // 20*log10(0.5) = -6.0206 → "-6.0"
      analyser.amplitude = 0.1;
      expect(svc.getMicLevelDb()).toBe(-20);
    });

    it('sizes the sample buffer from the analyser\'s current fftSize', () => {
      analyser.fftSize = 1024;
      analyser.amplitude = 0.5;
      (svc as any).vadAnalyser = analyser;
      svc.getMicLevelDb();
      expect(analyser.timeBufLengths).toEqual([1024]);
    });

    // ── PINNED CURRENT BEHAVIOUR — looks wrong ────────────────────────────────
    // The doc comment says "Returns -60 if VAD analyser is not ready", which reads as a floor, and -60 is
    // also the value returned for true silence. But any non-zero signal below -60 dBFS is returned verbatim,
    // so a caller drawing a meter cannot distinguish "quieter than the floor" from "louder than the floor"
    // by value alone, and a very quiet mic reports below the sentinel. Pinning, not asserting a clamp.
    it('PINNED: very quiet non-zero input returns values BELOW the -60 sentinel (no clamping)', () => {
      analyser.amplitude = 0.0001;
      (svc as any).vadAnalyser = analyser;
      expect(svc.getMicLevelDb()).toBe(-80);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-49 getVadState() / getCurrentSuppressionLevel()', () => {

    it('reports silence / level 80 from the published initial state', () => {
      expect((svc as any).smoothedRms).toBe(0);
      expect((svc as any).noiseFloor).toBe(0.002);
      expect(svc.getVadState()).toBe('silence');
      expect(svc.getCurrentSuppressionLevel()).toBe(80);
    });

    it('reports speech / level 30 once smoothed RMS exceeds 3.5x the noise floor', () => {
      (svc as any).noiseFloor = 0.002;
      (svc as any).smoothedRms = 0.00701;
      expect(svc.getVadState()).toBe('speech');
      expect(svc.getCurrentSuppressionLevel()).toBe(30);
    });

    it('treats the 3.5x boundary as strictly-greater, so exactly at the ratio is still silence', () => {
      (svc as any).noiseFloor = 0.002;
      (svc as any).smoothedRms = 0.002 * 3.5;
      expect(svc.getVadState()).toBe('silence');
      expect(svc.getCurrentSuppressionLevel()).toBe(80);
    });

    it('tracks a rising noise floor — the same RMS becomes silence when the room gets louder', () => {
      (svc as any).smoothedRms = 0.01;
      (svc as any).noiseFloor = 0.002;
      expect(svc.getVadState()).toBe('speech');
      (svc as any).noiseFloor = 0.004;
      expect(svc.getVadState()).toBe('silence');
    });

    // ── PINNED CURRENT BEHAVIOUR — looks wrong ────────────────────────────────
    // getCurrentSuppressionLevel() is documented as "Active DF3 suppression level", but it recomputes the
    // RMS test from scratch and knows nothing about the hangover window or the tap guard that the real VAD
    // loop applies. During the 300 ms hangover the loop is genuinely holding level 30 while this getter
    // reports 80, so any UI bound to it shows the wrong state for up to 300 ms after every utterance.
    it('PINNED: reports 80 during the hangover window while the VAD loop is actually holding 30', () => {
      jasmine.clock().install();
      jasmine.clock().mockDate();
      try {
        const analyser = new FakeAnalyser();
        const proc = new FakeProcessor();
        analyser.amplitude = 0;
        startVad(svc, analyser, proc);
        jasmine.clock().tick(500);

        analyser.amplitude = 0.019;
        analyser.freqFill = voiceSpectrum;
        jasmine.clock().tick(20);          // speech frame → hangover armed
        analyser.amplitude = 0;
        jasmine.clock().tick(20);          // first hangover frame

        expect((svc as any).hangover).toBe(14);
        expect(proc.levels[proc.levels.length - 1]).toBe(30);   // what the loop actually pushed
        expect(svc.getCurrentSuppressionLevel()).toBe(80);      // what the getter claims
        expect(svc.getVadState()).toBe('silence');
      } finally {
        svc.destroy();
        jasmine.clock().uninstall();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-50 runtime controls', () => {

    let proc: FakeProcessor;

    beforeEach(() => { proc = new FakeProcessor(); });

    it('forwards setSuppressionLevel() to the processor', () => {
      (svc as any).processor = proc;
      svc.setSuppressionLevel(45);
      expect(proc.levels).toEqual([45]);
    });

    it('forwards both enable and bypass to setNoiseSuppressionEnabled()', () => {
      (svc as any).processor = proc;
      svc.setEnabled(false);
      svc.setEnabled(true);
      expect(proc.enabledCalls).toEqual([false, true]);
    });

    it('is a silent no-op — not a throw — when the processor is absent', () => {
      expect(() => svc.setSuppressionLevel(50)).not.toThrow();
      expect(() => svc.setEnabled(true)).not.toThrow();
    });

    // ── PINNED CURRENT BEHAVIOUR — looks wrong ────────────────────────────────
    // The doc says "Change suppression strength (0–100)" but nothing validates or clamps the argument;
    // out-of-range and non-finite values are handed straight to the ONNX processor.
    it('PINNED: passes out-of-range levels through unclamped despite the documented 0–100 range', () => {
      (svc as any).processor = proc;
      svc.setSuppressionLevel(-25);
      svc.setSuppressionLevel(9999);
      svc.setSuppressionLevel(NaN);
      expect(proc.levels.length).toBe(3);
      expect(proc.levels[0]).toBe(-25);
      expect(proc.levels[1]).toBe(9999);
      expect(proc.levels[2]).toBeNaN();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-51 processOffline()', () => {

    let originalOffline: any;
    let proc: FakeProcessor;
    let built: any[];
    let rendered: Float32Array;
    let renderRejectsWith: any;
    let calls: string[];

    beforeEach(() => {
      originalOffline = (window as any).OfflineAudioContext;
      proc = new FakeProcessor();
      proc.workletNode = { __name: 'worklet', connect: (t: any) => { calls.push('worklet->' + t.__name); return t; } };
      built = [];
      calls = [];
      rendered = new Float32Array([9, 8, 7, 6]);
      renderRejectsWith = null;

      const copied: Float32Array[] = [];
      (window as any).OfflineAudioContext = class {
        __name = 'offCtx';
        destination = { __name: 'offDestination' };
        constructor(public channels: number, public length: number, public rate: number) {
          built.push({ channels, length, rate, ctx: this });
        }
        createBuffer(_c: number, _l: number, _r: number) {
          return { copyToChannel: (arr: Float32Array, ch: number) => { copied.push(arr); calls.push('copyToChannel:' + ch); } };
        }
        createBufferSource() {
          return {
            __name: 'src',
            buffer: null as any,
            connect: (t: any) => { calls.push('src->' + t.__name); return t; },
            start: (w: number) => calls.push('start:' + w),
          };
        }
        async startRendering() {
          if (renderRejectsWith) throw renderRejectsWith;
          return { getChannelData: (_ch: number) => rendered };
        }
      };
      (built as any).copied = copied;
    });

    afterEach(() => { (window as any).OfflineAudioContext = originalOffline; });

    it('rejects with a clear message when init() has not run', async () => {
      await expectAsync(svc.processOffline(new Float32Array(4)))
        .toBeRejectedWithError('DeepFilter3Service: call init() before processOffline()');
    });

    it('builds a mono OfflineAudioContext sized to the input at 48 kHz', async () => {
      (svc as any).processor = proc;
      await svc.processOffline(new Float32Array(1234));
      expect(built.length).toBe(1);
      expect(built[0].channels).toBe(1);
      expect(built[0].length).toBe(1234);
      expect(built[0].rate).toBe(48000);
    });

    it('copies the input into channel 0 and wires src → worklet → destination before starting at t=0', async () => {
      (svc as any).processor = proc;
      const input = new Float32Array([1, 2, 3]);
      await svc.processOffline(input);
      expect(calls).toEqual(['copyToChannel:0', 'src->worklet', 'worklet->offDestination', 'start:0']);
      const copied = (built as any).copied[0];
      expect(copied).not.toBe(input);            // defensive copy, caller's array is not aliased
      expect(Array.from(copied)).toEqual([1, 2, 3]);
    });

    it('reports progress 0.05 → 0.2 → 1 in order', async () => {
      (svc as any).processor = proc;
      const seen: number[] = [];
      await svc.processOffline(new Float32Array(4), p => seen.push(p));
      expect(seen).toEqual([0.05, 0.2, 1]);
    });

    it('works without a progress callback', async () => {
      (svc as any).processor = proc;
      await expectAsync(svc.processOffline(new Float32Array(4))).toBeResolved();
    });

    it('returns a detached copy of the rendered channel, not the live buffer', async () => {
      (svc as any).processor = proc;
      const out = await svc.processOffline(new Float32Array(4));
      expect(Array.from(out)).toEqual([9, 8, 7, 6]);
      expect(out).not.toBe(rendered);
      out[0] = 0;
      expect(rendered[0]).toBe(9);
    });

    // ── PINNED CURRENT BEHAVIOUR — worth a look ───────────────────────────────
    // On a rendering failure the original samples are returned (the "audio always works" fallback), but
    // onProgress is left stranded at 0.2 and the caller gets no signal that the returned samples are
    // unprocessed. A progress bar bound to this sticks at 20% forever.
    it('PINNED: falls back to the untouched input on a render failure, and progress never reaches 1', async () => {
      (svc as any).processor = proc;
      renderRejectsWith = new Error('render blew up');
      const input = new Float32Array([4, 5, 6]);
      const seen: number[] = [];

      const out = await svc.processOffline(input, p => seen.push(p));

      expect(out).toBe(input);
      expect(seen).toEqual([0.05, 0.2]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-52 destroy()', () => {

    let ctx: FakeAudioContext;
    let proc: FakeProcessor;
    let worklet: any;

    beforeEach(async () => {
      jasmine.clock().install();
      jasmine.clock().mockDate();
      ctx = new FakeAudioContext();
      proc = new FakeProcessor();
      worklet = makeNode('worklet', ctx.edges);
      proc.workletNode = worklet;
      (svc as any).audioContext = ctx;
      (svc as any).processor = proc;
      await svc.processStream({ __name: 'rawStream' } as any);
      svc.initTimeMs = 123;
    });
    afterEach(() => jasmine.clock().uninstall());

    it('stops the VAD interval so no further suppression changes are pushed', () => {
      jasmine.clock().tick(100);
      const before = proc.levels.length;
      expect(before).toBeGreaterThan(0);

      svc.destroy();
      jasmine.clock().tick(1000);

      expect(proc.levels.length).toBe(before);
      expect((svc as any).vadInterval).toBeNull();
    });

    it('disconnects every graph node, destroys the processor and closes the context', () => {
      svc.destroy();
      expect(ctx.analyser.disconnectCalls).toBe(1);
      expect(worklet.__disconnects).toBe(1);
      expect(ctx.gains[0].__disconnects).toBe(1);
      expect(ctx.gains[1].__disconnects).toBe(1);
      expect(proc.destroyCalls).toBe(1);
      expect(ctx.closeCalls).toBe(1);
    });

    it('resets every field back to the constructor defaults', () => {
      jasmine.clock().tick(100);
      svc.destroy();

      expect(svc.isActive()).toBe(false);
      expect(svc.isInitialized()).toBe(false);
      expect(svc.initTimeMs).toBe(0);
      expect(svc.processingLatencyMs).toBe(0);
      expect((svc as any).noiseFloor).toBe(0.002);
      expect((svc as any).smoothedRms).toBe(0);
      expect((svc as any).hangover).toBe(0);
      expect((svc as any).audioContext).toBeNull();
      expect((svc as any).workletNode).toBeNull();
      expect((svc as any).gainBoost).toBeNull();
      expect((svc as any).silentGain).toBeNull();
      expect((svc as any).vadAnalyser).toBeNull();
    });

    it('swallows teardown errors and still tears the rest of the graph down', () => {
      ctx.analyser.disconnectThrows = true;
      worklet.__throwOnDisconnect = true;
      proc.destroyThrows = true;
      ctx.closeThrows = true;

      expect(() => svc.destroy()).not.toThrow();

      expect(ctx.gains[0].__disconnects).toBe(1);
      expect(ctx.gains[1].__disconnects).toBe(1);
      expect(proc.destroyCalls).toBe(1);
      expect(ctx.closeCalls).toBe(1);
      expect(svc.isInitialized()).toBe(false);
    });

    it('is idempotent — a second destroy() is a harmless no-op', () => {
      svc.destroy();
      expect(() => svc.destroy()).not.toThrow();
      expect(proc.destroyCalls).toBe(1);
      expect(ctx.closeCalls).toBe(1);
    });

    it('leaves processStream() falling back to the raw stream after teardown', async () => {
      svc.destroy();
      const raw = { __name: 'rawAgain' } as any;
      await expectAsync(svc.processStream(raw)).toBeResolvedTo(raw);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('SHU-53 published constants and initial state', () => {

    it('exposes the DF3 native frame length of 480 samples (10 ms at 48 kHz)', () => {
      expect(svc.frameLength).toBe(480);
      expect(svc.frameLength / 48000 * 1000).toBe(10);
    });

    it('starts inactive, uninitialised and with zeroed timings', () => {
      expect(svc.isActive()).toBe(false);
      expect(svc.isInitialized()).toBe(false);
      expect(svc.initTimeMs).toBe(0);
      expect(svc.processingLatencyMs).toBe(0);
    });
  });
});
