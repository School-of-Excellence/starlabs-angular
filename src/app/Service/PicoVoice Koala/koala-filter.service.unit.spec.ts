/**
 * koala-filter.service.unit.spec.ts
 *
 * WHY UNIT, NOT E2E
 * -----------------
 * KoalaFilterService is a pure browser-audio plumbing class: no Angular DI beyond
 * `@Injectable`, no templates, no router. Everything interesting about it — the
 * dB arithmetic, the Float32→Int16 clamping, the WAV header byte layout, the
 * frame scheduling maths, the "engine is null" guards — is deterministic and can
 * be driven directly with hand-rolled doubles. Exercising it through the real UI
 * would require a microphone permission, a live PicoVoice access key and the
 * Koala WASM module, none of which exist in CI, and would still not let us assert
 * on individual sample values or on the 44-byte RIFF header.
 *
 * WHAT THIS PROTECTS
 * ------------------
 *  - the sampleRate/frameLength fallbacks used everywhere downstream (16000/512)
 *  - init() failing SOFT (returns false) instead of throwing when the model
 *    fetch fails, so callers can fall back to unfiltered audio
 *  - the capture graph being wired (mic → processor → muted gain → destination)
 *    and raw-energy accumulation only happening while recording
 *  - the live-playback scheduler's frame maths and its interval teardown
 *  - Float32→Int16 clamping (the asymmetric 32768 scale) and rmsToDb's -100 floor
 *  - the WAV container bytes handed to <audio>
 *  - teardown being exception-tolerant (a closed AudioContext must not break stop)
 *
 * NOT COVERED (deliberately)
 * --------------------------
 *  - the successful Koala.create() path beyond what a stubbed static allows: the
 *    real engine needs a valid access key and the koala_params.pv WASM payload.
 *  - onaudioprocess under a real ScriptProcessorNode; we invoke the handler
 *    directly with a fake AudioProcessingEvent.
 */
import { KoalaFilterService } from './koala-filter.service';
import { Koala } from '@picovoice/koala-web';

// ── Doubles ────────────────────────────────────────────────────────────────

class FakeAudioParam { value = 1; }

class FakeGainNode {
  gain = new FakeAudioParam();
  connect = jasmine.createSpy('gain.connect');
  disconnect = jasmine.createSpy('gain.disconnect');
}

class FakeScriptProcessor {
  onaudioprocess: ((ev: any) => void) | null = null;
  connect = jasmine.createSpy('proc.connect');
  disconnect = jasmine.createSpy('proc.disconnect');
  constructor(public bufferSize: number, public inCh: number, public outCh: number) {}
}

class FakeMediaStreamSource {
  connect = jasmine.createSpy('src.connect');
  disconnect = jasmine.createSpy('src.disconnect');
}

class FakeBufferSource {
  buffer: any = null;
  connect = jasmine.createSpy('bufsrc.connect');
  start = jasmine.createSpy('bufsrc.start');
}

class FakeAudioBuffer {
  private data: Float32Array;
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(_i: number): Float32Array { return this.data; }
}

/** Records every instance so tests can inspect what the service built. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static closeThrows = false;

  sampleRate: number;
  currentTime = 10;
  destination = { id: 'destination' } as any;
  createdProcessors: FakeScriptProcessor[] = [];
  createdSources: FakeBufferSource[] = [];
  createdGains: FakeGainNode[] = [];
  closed = false;

  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 44100;
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource(_s: MediaStream) { return new FakeMediaStreamSource() as any; }
  createScriptProcessor(size: number, i: number, o: number) {
    const p = new FakeScriptProcessor(size, i, o);
    this.createdProcessors.push(p);
    return p as any;
  }
  createGain() { const g = new FakeGainNode(); this.createdGains.push(g); return g as any; }
  createBuffer(ch: number, len: number, sr: number) { return new FakeAudioBuffer(ch, len, sr) as any; }
  createBufferSource() { const s = new FakeBufferSource(); this.createdSources.push(s); return s as any; }
  close() {
    if (FakeAudioContext.closeThrows) throw new Error('context already closed');
    this.closed = true;
    return Promise.resolve();
  }
}

/** Minimal Koala engine double — no WASM, no access key. */
function fakeKoala(over: Partial<any> = {}) {
  return {
    sampleRate: 16000,
    frameLength: 512,
    delaySample: 1600,
    process: jasmine.createSpy('koala.process').and.returnValue(Promise.resolve()),
    release: jasmine.createSpy('koala.release').and.returnValue(Promise.resolve()),
    ...over,
  };
}

function audioEvent(samples: Float32Array) {
  return { inputBuffer: { getChannelData: (_i: number) => samples } };
}

// ── Global stubbing helpers ────────────────────────────────────────────────

const G: any = globalThis as any;
let origAudioContext: any;
let origFetch: any;

function stubAudioContext() {
  FakeAudioContext.instances = [];
  FakeAudioContext.closeThrows = false;
  G.AudioContext = FakeAudioContext;
}

describe('SHU-50 KoalaFilterService — engine metadata getters & fallbacks', () => {
  let svc: KoalaFilterService;
  beforeEach(() => { svc = new KoalaFilterService(); });

  it('falls back to 16 kHz / 512-sample frames while no engine is loaded', () => {
    expect(svc.sampleRate).toBe(16000);
    expect(svc.frameLength).toBe(512);
  });

  it('reports the engine values once an engine is present', () => {
    (svc as any).koala = fakeKoala({ sampleRate: 24000, frameLength: 256 });
    expect(svc.sampleRate).toBe(24000);
    expect(svc.frameLength).toBe(256);
  });

  it('PINS: `?? ` only guards null/undefined, so a zero from the engine is passed through', () => {
    // Looks wrong: a 0 sampleRate/frameLength would be propagated into
    // `new AudioContext({ sampleRate: 0 })` and into `fl / this.sampleRate`
    // (Infinity) rather than falling back to the 16000/512 defaults.
    // Pinning current behaviour; a fix to `||` should turn this test red.
    (svc as any).koala = fakeKoala({ sampleRate: 0, frameLength: 0 });
    expect(svc.sampleRate).toBe(0);
    expect(svc.frameLength).toBe(0);
  });

  it('starts with all published metrics at zero', () => {
    expect(svc.initTimeMs).toBe(0);
    expect(svc.captureSetupMs).toBe(0);
    expect(svc.delaySampleMs).toBe(0);
  });
});

describe('SHU-51 KoalaFilterService — init() model fetch and failure handling', () => {
  let svc: KoalaFilterService;

  beforeEach(() => {
    svc = new KoalaFilterService();
    origFetch = G.fetch;
    spyOn(console, 'error');
    spyOn(console, 'log');
  });
  afterEach(() => { G.fetch = origFetch; });

  it('resolves false (never throws) when the model fetch returns a non-OK status', async () => {
    G.fetch = jasmine.createSpy('fetch').and.returnValue(
      Promise.resolve({ ok: false, status: 503, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
    );

    await expectAsync(svc.init('ak')).toBeResolvedTo(false);
    expect((svc as any).koala).toBeNull();
    expect(svc.initTimeMs).toBe(0);
    expect(svc.delaySampleMs).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });

  it('resolves false when the network rejects outright', async () => {
    G.fetch = jasmine.createSpy('fetch').and.returnValue(Promise.reject(new Error('offline')));
    await expectAsync(svc.init('ak')).toBeResolvedTo(false);
    expect((svc as any).koala).toBeNull();
  });

  it('resolves false when engine creation itself fails, leaving no half-built engine', async () => {
    G.fetch = jasmine.createSpy('fetch').and.returnValue(
      Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) })
    );
    spyOn(Koala as any, 'create').and.returnValue(Promise.reject(new Error('bad access key')));

    await expectAsync(svc.init('bad-key')).toBeResolvedTo(false);
    expect((svc as any).koala).toBeNull();
  });

  it('on success converts delaySample→ms against the engine sample rate and keeps the engine', async () => {
    G.fetch = jasmine.createSpy('fetch').and.returnValue(
      Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array([0, 255, 16]).buffer) })
    );
    const engine = fakeKoala({ sampleRate: 16000, delaySample: 1600 }); // 1600/16000 s = 100 ms
    const createSpy = spyOn(Koala as any, 'create').and.returnValue(Promise.resolve(engine));

    await expectAsync(svc.init('access-key')).toBeResolvedTo(true);

    expect(svc.delaySampleMs).toBe(100);
    expect(svc.sampleRate).toBe(16000);
    // access key is forwarded verbatim; model is passed as base64, never as a URL
    expect(createSpy).toHaveBeenCalled();
    const args = createSpy.calls.mostRecent().args as any[];
    expect(args[0]).toBe('access-key');
    expect(typeof args[1]).toBe('function');
    expect(typeof args[2].base64).toBe('string');
    expect(args[2].base64.length).toBeGreaterThan(0);
  });

  it('rounds the delay to whole milliseconds', async () => {
    G.fetch = jasmine.createSpy('fetch').and.returnValue(
      Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) })
    );
    // 999 / 16000 s = 62.4375 ms → 62
    spyOn(Koala as any, 'create').and.returnValue(
      Promise.resolve(fakeKoala({ sampleRate: 16000, delaySample: 999 }))
    );
    await svc.init('ak');
    expect(svc.delaySampleMs).toBe(62);
  });
});

describe('SHU-52 KoalaFilterService — capture graph wiring and frame pumping', () => {
  let svc: KoalaFilterService;
  let engine: any;

  beforeEach(() => {
    svc = new KoalaFilterService();
    engine = fakeKoala({ frameLength: 4, sampleRate: 16000 });
    (svc as any).koala = engine;
    origAudioContext = G.AudioContext;
    stubAudioContext();
  });
  afterEach(() => { G.AudioContext = origAudioContext; });

  function start() {
    svc.startCapture({ id: 'stream' } as any);
    return FakeAudioContext.instances[0];
  }

  it('builds the context at the engine sample rate and a processor of one frame', () => {
    const ctx = start();
    expect(ctx.sampleRate).toBe(16000);
    expect(ctx.createdProcessors.length).toBe(1);
    expect(ctx.createdProcessors[0].bufferSize).toBe(4);
    expect(ctx.createdProcessors[0].inCh).toBe(1);
    expect(ctx.createdProcessors[0].outCh).toBe(1);
  });

  it('routes mic → processor → SILENT gain → destination so Chrome keeps firing onaudioprocess', () => {
    const ctx = start();
    const gain = ctx.createdGains[0];
    const proc = ctx.createdProcessors[0];
    expect(gain.gain.value).toBe(0);
    expect(proc.connect).toHaveBeenCalledWith(gain as any);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
    expect(typeof proc.onaudioprocess).toBe('function');
  });

  it('records a non-negative setup duration', () => {
    start();
    expect(svc.captureSetupMs).toBeGreaterThanOrEqual(0);
  });

  it('converts each buffer to Int16 and forwards exactly frameLength samples to the engine', async () => {
    const ctx = start();
    const proc = ctx.createdProcessors[0];
    // 6 samples in, frameLength is 4 → only the first 4 reach the engine
    proc.onaudioprocess!(audioEvent(new Float32Array([1, -1, 0, 0.5, 0.25, 0.75])));
    await Promise.resolve(); await Promise.resolve();

    expect(engine.process).toHaveBeenCalledTimes(1);
    const frame = engine.process.calls.mostRecent().args[0] as Int16Array;
    expect(frame instanceof Int16Array).toBeTrue();
    expect(frame.length).toBe(4);
    expect(Array.from(frame)).toEqual([32767, -32768, 0, 16384]);
  });

  it('does not accumulate raw energy unless recording is armed', () => {
    const ctx = start();
    ctx.createdProcessors[0].onaudioprocess!(audioEvent(new Float32Array([0.5, 0.5, 0.5, 0.5])));
    expect((svc as any).rawEnergySamples).toBe(0);
    expect(svc.getRawEnergyDb()).toBe(-100);
  });

  it('accumulates raw energy over the WHOLE buffer once recording is armed', () => {
    const ctx = start();
    svc.startRecordingCapture();
    // 6 samples although only 4 are sent to the engine — energy counts all 6
    ctx.createdProcessors[0].onaudioprocess!(audioEvent(new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])));
    expect((svc as any).rawEnergySamples).toBe(6);
    expect((svc as any).rawEnergyAcc).toBeCloseTo(1.5, 10);
    expect(svc.getRawEnergyDb()).toBeCloseTo(-6.0, 1); // 20*log10(0.5)
  });

  it('drops frames silently when no engine is loaded rather than throwing on the audio thread', async () => {
    const ctx = start();
    (svc as any).koala = null;
    expect(() => ctx.createdProcessors[0].onaudioprocess!(audioEvent(new Float32Array([0.1, 0.2, 0.3, 0.4])))).not.toThrow();
    await Promise.resolve();
    expect(engine.process).not.toHaveBeenCalled();
  });

  it('stopCapture disconnects the graph, closes the context and clears the handles', () => {
    const ctx = start();
    const proc = ctx.createdProcessors[0];
    svc.stopCapture();
    expect(proc.disconnect).toHaveBeenCalled();
    expect(ctx.closed).toBeTrue();
    expect((svc as any).captureNode).toBeNull();
    expect((svc as any).micSource).toBeNull();
    expect((svc as any).inputCtx).toBeNull();
  });

  it('stopCapture survives an AudioContext that throws on close', () => {
    start();
    FakeAudioContext.closeThrows = true;
    expect(() => svc.stopCapture()).not.toThrow();
    expect((svc as any).inputCtx).toBeNull();
  });

  it('stopCapture is a safe no-op before any capture was started', () => {
    const fresh = new KoalaFilterService();
    expect(() => fresh.stopCapture()).not.toThrow();
  });
});

describe('SHU-53 KoalaFilterService — live playback scheduler', () => {
  let svc: KoalaFilterService;

  beforeEach(() => {
    jasmine.clock().install();
    svc = new KoalaFilterService();
    (svc as any).koala = fakeKoala({ frameLength: 4, sampleRate: 16000 });
    origAudioContext = G.AudioContext;
    stubAudioContext();
  });
  afterEach(() => {
    jasmine.clock().uninstall();
    G.AudioContext = origAudioContext;
  });

  it('opens a playback context at the engine rate and schedules 150 ms ahead of now', () => {
    svc.startLivePlayback();
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.sampleRate).toBe(16000);
    expect((svc as any).playbackNextTime).toBeCloseTo(ctx.currentTime + 0.15, 10);
    expect((svc as any).playbackQueue).toEqual([]);
  });

  it('emits nothing while the queue holds less than one frame', () => {
    svc.startLivePlayback();
    (svc as any).playbackQueue = [1, 2, 3]; // frameLength is 4
    jasmine.clock().tick(20);
    expect(FakeAudioContext.instances[0].createdSources.length).toBe(0);
    expect((svc as any).playbackQueue.length).toBe(3);
  });

  it('drains whole frames, scales samples by 1/32768 and advances the clock by frame duration', () => {
    svc.startLivePlayback();
    const ctx = FakeAudioContext.instances[0];
    const startTime = (svc as any).playbackNextTime;
    (svc as any).playbackQueue = [32768, -32768, 0, 16384, 7]; // 5 samples → one frame of 4, remainder 1

    jasmine.clock().tick(20);

    expect(ctx.createdSources.length).toBe(1);
    const src = ctx.createdSources[0];
    expect(Array.from(src.buffer.getChannelData(0))).toEqual([1, -1, 0, 0.5]);
    expect(src.connect).toHaveBeenCalledWith(ctx.destination);
    expect(src.start).toHaveBeenCalled();
    expect((svc as any).playbackQueue).toEqual([7]);
    // 4 samples at 16 kHz = 0.25 ms
    expect((svc as any).playbackNextTime).toBeCloseTo(startTime + 4 / 16000, 10);
  });

  it('never schedules a source in the past (clamps to the context clock)', () => {
    svc.startLivePlayback();
    const ctx = FakeAudioContext.instances[0];
    (svc as any).playbackNextTime = 0;   // stale, far behind ctx.currentTime (10)
    (svc as any).playbackQueue = [1, 2, 3, 4];
    jasmine.clock().tick(20);
    expect(ctx.createdSources[0].start).toHaveBeenCalledWith(ctx.currentTime);
  });

  it('drains a multi-frame backlog in one tick', () => {
    svc.startLivePlayback();
    const ctx = FakeAudioContext.instances[0];
    (svc as any).playbackQueue = new Array(12).fill(1024);
    jasmine.clock().tick(20);
    expect(ctx.createdSources.length).toBe(3);
    expect((svc as any).playbackQueue.length).toBe(0);
  });

  it('stopLivePlayback halts the timer, closes the context and empties the queue', () => {
    svc.startLivePlayback();
    const ctx = FakeAudioContext.instances[0];
    (svc as any).playbackQueue = [1, 2, 3, 4];
    svc.stopLivePlayback();

    jasmine.clock().tick(200);
    expect(ctx.createdSources.length).toBe(0);
    expect(ctx.closed).toBeTrue();
    expect((svc as any).playbackTick).toBeNull();
    expect((svc as any).playbackCtx).toBeNull();
    expect((svc as any).playbackQueue).toEqual([]);
  });

  it('stopLivePlayback tolerates a context that throws on close and is idempotent', () => {
    svc.startLivePlayback();
    FakeAudioContext.closeThrows = true;
    expect(() => svc.stopLivePlayback()).not.toThrow();
    expect(() => svc.stopLivePlayback()).not.toThrow();
  });
});

describe('SHU-54 KoalaFilterService — recording capture and energy metrics', () => {
  let svc: KoalaFilterService;

  beforeEach(() => {
    svc = new KoalaFilterService();
    (svc as any).koala = fakeKoala({ frameLength: 4, sampleRate: 16000 });
  });

  it('startRecordingCapture arms collection and zeroes every accumulator', () => {
    (svc as any).rawEnergyAcc = 9; (svc as any).rawEnergySamples = 9;
    (svc as any).cleanEnergyAcc = 9; (svc as any).cleanEnergySamples = 9;
    (svc as any).collectedFrames = [new Int16Array(2)];

    svc.startRecordingCapture();

    expect((svc as any).isCollecting).toBeTrue();
    expect((svc as any).collectedFrames).toEqual([]);
    expect((svc as any).rawEnergyAcc).toBe(0);
    expect((svc as any).rawEnergySamples).toBe(0);
    expect((svc as any).cleanEnergyAcc).toBe(0);
    expect((svc as any).cleanEnergySamples).toBe(0);
  });

  it('stopRecordingCapture disarms collection but keeps what was already collected', () => {
    svc.startRecordingCapture();
    (svc as any).onProcessed(new Int16Array([16384, 16384]));
    svc.stopRecordingCapture();
    expect((svc as any).isCollecting).toBeFalse();
    expect((svc as any).collectedFrames.length).toBe(1);
  });

  it('enhanced frames are copied, not aliased, so engine buffer reuse cannot corrupt the recording', () => {
    svc.startRecordingCapture();
    const reused = new Int16Array([100, 200]);
    (svc as any).onProcessed(reused);
    reused[0] = -1; reused[1] = -1;
    expect(Array.from((svc as any).collectedFrames[0])).toEqual([100, 200]);
  });

  it('accumulates clean energy only while armed', () => {
    (svc as any).onProcessed(new Int16Array([16384, 16384]));
    expect((svc as any).cleanEnergySamples).toBe(0);

    svc.startRecordingCapture();
    (svc as any).onProcessed(new Int16Array([16384, 16384])); // 0.5 full-scale
    expect((svc as any).cleanEnergySamples).toBe(2);
    expect(svc.getCleanEnergyDb()).toBeCloseTo(-6.0, 1);
  });

  it('PINS: enhanced frames are queued for playback even when playback was never started', () => {
    // Looks wrong: onProcessed always pushes into playbackQueue, and only
    // startLivePlayback()/stopLivePlayback() ever clear it. Processing audio
    // without live playback therefore grows an unbounded array. Pinning current
    // behaviour rather than asserting the (probably intended) guard.
    (svc as any).onProcessed(new Int16Array([1, 2, 3]));
    (svc as any).onProcessed(new Int16Array([4, 5, 6]));
    expect((svc as any).playbackQueue).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('both dB readings floor at -100 with no samples and with pure silence', () => {
    expect(svc.getRawEnergyDb()).toBe(-100);
    expect(svc.getCleanEnergyDb()).toBe(-100);

    svc.startRecordingCapture();
    (svc as any).onProcessed(new Int16Array([0, 0, 0, 0]));
    expect((svc as any).cleanEnergySamples).toBe(4);
    expect(svc.getCleanEnergyDb()).toBe(-100);
  });

  it('dB is reported to a single decimal place', () => {
    const db = (svc as any).rmsToDb(0.3, 7);
    expect(db).toBe(parseFloat(db.toFixed(1)));
    expect(db).toBeCloseTo(20 * Math.log10(Math.sqrt(0.3 / 7)), 1);
  });

  it('float→int16 conversion clamps both rails on the asymmetric 32768 scale', () => {
    const out = (svc as any).float32ToInt16(new Float32Array([2, -2, 1, -1, 0, 0.5, -0.5, 0.00001]));
    expect(Array.from(out)).toEqual([32767, -32768, 32767, -32768, 0, 16384, -16384, 0]);
  });
});

describe('SHU-55 KoalaFilterService — WAV encoding of the recorded frames', () => {
  let svc: KoalaFilterService;

  beforeEach(() => {
    svc = new KoalaFilterService();
    (svc as any).koala = fakeKoala({ sampleRate: 16000, frameLength: 4 });
  });

  async function bytesOf(blob: Blob): Promise<DataView> {
    return new DataView(await blob.arrayBuffer());
  }
  const ascii = (v: DataView, off: number, len: number) =>
    Array.from({ length: len }, (_, i) => String.fromCharCode(v.getUint8(off + i))).join('');

  it('produces an audio/wav blob of 44 header bytes plus 2 bytes per sample', async () => {
    svc.startRecordingCapture();
    (svc as any).onProcessed(new Int16Array([1, 2, 3]));
    (svc as any).onProcessed(new Int16Array([4, 5]));

    const blob = svc.getRecordedWav();
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 5 * 2);
  });

  it('writes a 16-bit mono PCM header carrying the engine sample rate', async () => {
    svc.startRecordingCapture();
    (svc as any).onProcessed(new Int16Array([7, 8]));
    const v = await bytesOf(svc.getRecordedWav());

    expect(ascii(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 4);
    expect(ascii(v, 8, 4)).toBe('WAVE');
    expect(ascii(v, 12, 4)).toBe('fmt ');
    expect(v.getUint32(16, true)).toBe(16);   // PCM chunk size
    expect(v.getUint16(20, true)).toBe(1);    // format = PCM
    expect(v.getUint16(22, true)).toBe(1);    // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(28, true)).toBe(32000); // byte rate = sr * blockAlign
    expect(v.getUint16(32, true)).toBe(2);     // block align
    expect(v.getUint16(34, true)).toBe(16);    // bits per sample
    expect(ascii(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(4);
  });

  it('writes samples little-endian, in frame order, preserving negatives', async () => {
    svc.startRecordingCapture();
    (svc as any).onProcessed(new Int16Array([1, -1]));
    (svc as any).onProcessed(new Int16Array([32767, -32768]));
    const v = await bytesOf(svc.getRecordedWav());

    expect(v.getInt16(44, true)).toBe(1);
    expect(v.getInt16(46, true)).toBe(-1);
    expect(v.getInt16(48, true)).toBe(32767);
    expect(v.getInt16(50, true)).toBe(-32768);
  });

  it('returns a valid header-only WAV when nothing was recorded', async () => {
    const blob = svc.getRecordedWav();
    expect(blob.size).toBe(44);
    const v = await bytesOf(blob);
    expect(ascii(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(40, true)).toBe(0);
  });

  it('base64 helper round-trips the raw model bytes', () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 65, 66]);
    const b64 = (svc as any).bufferToBase64(bytes.buffer);
    expect(b64).toBe(btoa(String.fromCharCode(...Array.from(bytes))));
  });
});

describe('SHU-56 KoalaFilterService — destroy / teardown', () => {
  let svc: KoalaFilterService;
  let engine: any;

  beforeEach(() => {
    svc = new KoalaFilterService();
    engine = fakeKoala({ frameLength: 4, sampleRate: 16000 });
    (svc as any).koala = engine;
    origAudioContext = G.AudioContext;
    stubAudioContext();
  });
  afterEach(() => { G.AudioContext = origAudioContext; });

  it('tears down capture and playback, releases the engine and resets the metrics', async () => {
    svc.startCapture({ id: 's' } as any);
    svc.startLivePlayback();
    svc.initTimeMs = 42; svc.captureSetupMs = 7; svc.delaySampleMs = 100;

    await svc.destroy();

    expect(engine.release).toHaveBeenCalled();
    expect((svc as any).koala).toBeNull();
    expect((svc as any).inputCtx).toBeNull();
    expect((svc as any).playbackCtx).toBeNull();
    expect((svc as any).playbackTick).toBeNull();
    expect(svc.initTimeMs).toBe(0);
    expect(svc.captureSetupMs).toBe(0);
    expect(svc.delaySampleMs).toBe(0);
    // getters fall back again now that the engine is gone
    expect(svc.sampleRate).toBe(16000);
    expect(svc.frameLength).toBe(512);
  });

  it('still clears the engine handle when release() rejects', async () => {
    engine.release.and.returnValue(Promise.reject(new Error('worker gone')));
    await expectAsync(svc.destroy()).toBeResolved();
    expect((svc as any).koala).toBeNull();
  });

  it('is safe to call on a service that was never initialised, and twice in a row', async () => {
    const fresh = new KoalaFilterService();
    await expectAsync(fresh.destroy()).toBeResolved();
    await expectAsync(fresh.destroy()).toBeResolved();
  });

  it('PINS: destroy() leaves the recording buffer and the collecting flag untouched', async () => {
    // Looks wrong: after destroy() the service still holds the previous
    // recording's frames and stays "collecting", so a later startCapture()
    // resumes accumulating raw energy into the old totals and getRecordedWav()
    // returns stale audio. startRecordingCapture() is the only reset.
    svc.startRecordingCapture();
    (svc as any).onProcessed(new Int16Array([1, 2, 3, 4]));
    await svc.destroy();

    expect((svc as any).isCollecting).toBeTrue();
    expect((svc as any).collectedFrames.length).toBe(1);
    expect(svc.getRecordedWav().size).toBe(44 + 8);
  });
});
