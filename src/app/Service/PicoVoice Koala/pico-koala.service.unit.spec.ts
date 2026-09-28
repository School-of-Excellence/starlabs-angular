/**
 * pico-koala.service.unit.spec.ts
 *
 * WHY UNIT, NOT E2E
 * -----------------
 * PicoKoalaService is the LiveKit-facing noise-suppression adapter. Its whole job
 * is lifecycle bookkeeping — build a KoalaWorker, hang an AudioWorklet off an
 * AudioContext, publish the resulting MediaStreamTrack to a Room, then subscribe/
 * unsubscribe/reset/release in the right order. None of that is observable from
 * the UI: an e2e run would need a microphone, a real PicoVoice access key, the
 * koala_params.pv WASM payload and a live LiveKit room, and even then could not
 * assert that (say) reset() unsubscribes BEFORE re-subscribing, which is the
 * exact bug the M8 comment in the source says was fixed there.
 *
 * WHAT THIS PROTECTS
 * ------------------
 *  - every "engine unavailable" guard: start/stop/reset/release must be silent
 *    no-ops when init() never ran or already failed, and must NOT touch
 *    WebVoiceProcessor (which would grab the microphone)
 *  - the M7 publish options (stopMicTrackOnMute:false) that stop LiveKit from
 *    tearing down the worklet destination track on mute
 *  - the M8 ordering in reset(): unsubscribe → reset → subscribe
 *  - the frame-length handshake in start(): WebVoiceProcessor must be told
 *    Koala's frameLength (256) before subscribing, or Koala throws
 *  - Int16→Float32 conversion of enhanced PCM and its null-worklet guard
 *  - release() freeing the worklet, the AudioContext and the worklet blob URL
 *
 * NOT COVERED (deliberately)
 * --------------------------
 *  - the real KoalaWorker: needs environment.picovoiceAccessKey and the WASM
 *    model; KoalaWorker.create is stubbed instead.
 *  - the inline AudioWorkletProcessor's own circular-buffer code. It is a string
 *    of source compiled on the audio render thread; it is unreachable from the
 *    main thread and cannot be imported. It is asserted only as a registered
 *    module, not executed.
 *  - real WebVoiceProcessor subscribe/unsubscribe (opens a live mic).
 */
import { PicoKoalaService } from './pico-koala.service';
import { KoalaWorker } from '@picovoice/koala-web';
import { WebVoiceProcessor } from '@picovoice/web-voice-processor';
import { Track } from 'livekit-client';

// ── Doubles ────────────────────────────────────────────────────────────────

/** Jasmine stamps a monotonic invocationOrder on every call; the typings omit it. */
function order(spy: any): number {
  return (spy.calls.mostRecent() as any).invocationOrder;
}

function fakeWorker(over: Partial<any> = {}) {
  return {
    sampleRate: 16000,
    frameLength: 256,
    reset: jasmine.createSpy('koala.reset').and.returnValue(Promise.resolve()),
    release: jasmine.createSpy('koala.release').and.returnValue(Promise.resolve()),
    ...over,
  };
}

class FakeWorkletNode {
  static lastArgs: any[] = [];
  port = { postMessage: jasmine.createSpy('port.postMessage'), onmessage: null as any };
  connect = jasmine.createSpy('worklet.connect');
  disconnect = jasmine.createSpy('worklet.disconnect');
  constructor(ctx: any, name: string) { FakeWorkletNode.lastArgs = [ctx, name]; }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  sampleRate: number;
  closed = false;
  addedModules: string[] = [];
  destinationNode = { stream: { getAudioTracks: () => [{ id: 'enhanced-track', kind: 'audio' }] } };
  audioWorklet = {
    addModule: (url: string) => { this.addedModules.push(url); return Promise.resolve(); },
  };
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 44100;
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamDestination() { return this.destinationNode as any; }
  close() { this.closed = true; return Promise.resolve(); }
}

const G: any = globalThis as any;
let origAudioContext: any;
let origWorkletNode: any;
let origCreateObjectURL: any;
let origRevokeObjectURL: any;

function stubAudioGlobals() {
  FakeAudioContext.instances = [];
  origAudioContext = G.AudioContext;
  origWorkletNode = G.AudioWorkletNode;
  origCreateObjectURL = URL.createObjectURL;
  origRevokeObjectURL = URL.revokeObjectURL;
  G.AudioContext = FakeAudioContext;
  G.AudioWorkletNode = FakeWorkletNode;
  (URL as any).createObjectURL = jasmine.createSpy('createObjectURL').and.returnValue('blob:koala-stub');
  (URL as any).revokeObjectURL = jasmine.createSpy('revokeObjectURL');
}

function restoreAudioGlobals() {
  G.AudioContext = origAudioContext;
  G.AudioWorkletNode = origWorkletNode;
  (URL as any).createObjectURL = origCreateObjectURL;
  (URL as any).revokeObjectURL = origRevokeObjectURL;
}

describe('SHU-57 PicoKoalaService — guards when the Koala engine is unavailable', () => {
  let svc: PicoKoalaService;
  let subscribe: jasmine.Spy;
  let unsubscribe: jasmine.Spy;
  let setOptions: jasmine.Spy;

  beforeEach(() => {
    svc = new PicoKoalaService();
    // Never let the real processor run: it would request microphone access.
    subscribe = spyOn(WebVoiceProcessor as any, 'subscribe').and.returnValue(Promise.resolve());
    unsubscribe = spyOn(WebVoiceProcessor as any, 'unsubscribe').and.returnValue(Promise.resolve());
    setOptions = spyOn(WebVoiceProcessor as any, 'setOptions');
  });

  it('starts with no engine loaded', () => {
    expect((svc as any).koala).toBeNull();
  });

  it('start() resolves as a no-op and never touches the voice processor', async () => {
    await expectAsync(svc.start()).toBeResolved();
    expect(setOptions).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('stop() resolves as a no-op and never unsubscribes', async () => {
    await expectAsync(svc.stop()).toBeResolved();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('reset() resolves as a no-op', async () => {
    await expectAsync(svc.reset()).toBeResolved();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('release() resolves as a no-op and is safe to call repeatedly', async () => {
    await expectAsync(svc.release()).toBeResolved();
    await expectAsync(svc.release()).toBeResolved();
  });

  it('publishToRoom() rejects with an actionable message instead of publishing a null track', async () => {
    const room: any = { localParticipant: { publishTrack: jasmine.createSpy('publishTrack') } };
    await expectAsync(svc.publishToRoom(room)).toBeRejectedWithError('Call init() first');
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
  });

  it('start() after a release still no-ops rather than resurrecting a dead worker', async () => {
    (svc as any).koala = fakeWorker();
    await svc.release();
    subscribe.calls.reset(); setOptions.calls.reset();
    await svc.start();
    expect(subscribe).not.toHaveBeenCalled();
    expect(setOptions).not.toHaveBeenCalled();
  });
});

describe('SHU-58 PicoKoalaService — enhanced PCM → worklet conversion', () => {
  let svc: PicoKoalaService;
  let worklet: FakeWorkletNode;

  beforeEach(() => {
    svc = new PicoKoalaService();
    worklet = new FakeWorkletNode({}, 'koala-processor');
    (svc as any).workletNode = worklet;
  });

  it('converts Int16 PCM to Float32 on the 1/32768 scale and posts it to the worklet', () => {
    (svc as any).onEnhancedAudio(new Int16Array([0, 16384, -16384, 32767, -32768]));

    expect(worklet.port.postMessage).toHaveBeenCalledTimes(1);
    const sent = worklet.port.postMessage.calls.mostRecent().args[0] as Float32Array;
    expect(sent instanceof Float32Array).toBeTrue();
    expect(sent.length).toBe(5);
    expect(sent[0]).toBe(0);
    expect(sent[1]).toBeCloseTo(0.5, 10);
    expect(sent[2]).toBeCloseTo(-0.5, 10);
    expect(sent[3]).toBeCloseTo(32767 / 32768, 10);
    expect(sent[4]).toBe(-1);
  });

  it('posts a copy, so the engine reusing its frame buffer cannot mutate what was sent', () => {
    const frame = new Int16Array([32768 / 2, 0]);
    (svc as any).onEnhancedAudio(frame);
    const sent = worklet.port.postMessage.calls.mostRecent().args[0] as Float32Array;
    frame[0] = -32768;
    expect(sent[0]).toBeCloseTo(0.5, 10);
  });

  it('handles an empty frame without posting garbage', () => {
    (svc as any).onEnhancedAudio(new Int16Array(0));
    const sent = worklet.port.postMessage.calls.mostRecent().args[0] as Float32Array;
    expect(sent.length).toBe(0);
  });

  it('drops frames silently when the worklet is gone (post-release race)', () => {
    (svc as any).workletNode = null;
    expect(() => (svc as any).onEnhancedAudio(new Int16Array([1, 2, 3]))).not.toThrow();
    expect(worklet.port.postMessage).not.toHaveBeenCalled();
  });
});

describe('SHU-59 PicoKoalaService — init / start / reset / publish / release lifecycle', () => {
  let svc: PicoKoalaService;
  let worker: any;
  let createSpy: jasmine.Spy;
  let subscribe: jasmine.Spy;
  let unsubscribe: jasmine.Spy;
  let setOptions: jasmine.Spy;

  beforeEach(() => {
    stubAudioGlobals();
    svc = new PicoKoalaService();
    worker = fakeWorker({ sampleRate: 16000, frameLength: 256 });
    createSpy = spyOn(KoalaWorker as any, 'create').and.returnValue(Promise.resolve(worker));
    subscribe = spyOn(WebVoiceProcessor as any, 'subscribe').and.returnValue(Promise.resolve());
    unsubscribe = spyOn(WebVoiceProcessor as any, 'unsubscribe').and.returnValue(Promise.resolve());
    setOptions = spyOn(WebVoiceProcessor as any, 'setOptions');
  });
  afterEach(restoreAudioGlobals);

  it('init() builds the AudioContext at the ENGINE sample rate, not the hardware default', async () => {
    await svc.init();
    expect(FakeAudioContext.instances.length).toBe(1);
    expect(FakeAudioContext.instances[0].sampleRate).toBe(16000);
  });

  it('init() loads the inline worklet from a blob URL and instantiates koala-processor', async () => {
    await svc.init();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0].addedModules).toEqual(['blob:koala-stub']);
    expect(FakeWorkletNode.lastArgs[1]).toBe('koala-processor');
    expect((svc as any).blobUrl).toBe('blob:koala-stub');
  });

  it('init() returns the worklet destination track and stores it for publishing', async () => {
    const track = await svc.init();
    expect(track.id).toBe('enhanced-track');
    expect((svc as any).enhancedTrack).toBe(track);
    expect((svc as any).workletNode.connect).toHaveBeenCalled();
  });

  it('init() wires a per-frame callback rather than polling', async () => {
    await svc.init();
    const args = createSpy.calls.mostRecent().args as any[];
    expect(typeof args[1]).toBe('function');
    expect(args[2].publicPath).toBe('assets/PicoVoice Koala/koala_params.pv');
  });

  it('init() rejection leaves no engine behind', async () => {
    createSpy.and.returnValue(Promise.reject(new Error('invalid access key')));
    await expectAsync(svc.init()).toBeRejectedWithError('invalid access key');
    expect((svc as any).koala).toBeNull();
    expect((svc as any).enhancedTrack).toBeNull();
  });

  it('start() tells the voice processor Koala\'s frame length BEFORE subscribing, and resets first', async () => {
    await svc.init();
    await svc.start();

    expect(setOptions).toHaveBeenCalledWith({ frameLength: 256 });
    expect(worker.reset).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith(worker as any);
    // ordering: setOptions → reset → subscribe
    expect(order(setOptions)).toBeLessThan(order(worker.reset));
    expect(order(worker.reset)).toBeLessThan(order(subscribe));
  });

  it('stop() unsubscribes the engine but keeps it loaded for a later start()', async () => {
    await svc.init();
    await svc.stop();
    expect(unsubscribe).toHaveBeenCalledWith(worker as any);
    expect((svc as any).koala).toBe(worker);
    expect(worker.release).not.toHaveBeenCalled();
  });

  it('reset() unsubscribes BEFORE re-subscribing (M8: prevents doubled audio frames)', async () => {
    await svc.init();
    await svc.reset();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(order(unsubscribe)).toBeLessThan(order(worker.reset));
    expect(order(worker.reset)).toBeLessThan(order(subscribe));
  });

  it('publishToRoom() publishes the enhanced track as a mic source with M7 mute protection', async () => {
    const track = await svc.init();
    const publishTrack = jasmine.createSpy('publishTrack').and.returnValue(Promise.resolve());
    await svc.publishToRoom({ localParticipant: { publishTrack } } as any);

    expect(publishTrack).toHaveBeenCalledTimes(1);
    const [publishedTrack, opts] = publishTrack.calls.mostRecent().args as any[];
    expect(publishedTrack).toBe(track);
    expect(opts.source).toBe(Track.Source.Microphone);
    expect(opts.name).toBe('koala-enhanced-audio');
    expect(opts.stopMicTrackOnMute).toBeFalse();
  });

  it('publishToRoom() propagates a LiveKit publish failure to the caller', async () => {
    await svc.init();
    const publishTrack = jasmine.createSpy('publishTrack').and.returnValue(Promise.reject(new Error('room disconnected')));
    await expectAsync(svc.publishToRoom({ localParticipant: { publishTrack } } as any))
      .toBeRejectedWithError('room disconnected');
  });

  it('release() frees the engine, the worklet, the context and the blob URL', async () => {
    await svc.init();
    const worklet = (svc as any).workletNode as FakeWorkletNode;
    const ctx = FakeAudioContext.instances[0];

    await svc.release();

    expect(worker.release).toHaveBeenCalled();
    expect(worklet.disconnect).toHaveBeenCalled();
    expect(ctx.closed).toBeTrue();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:koala-stub');
    expect((svc as any).koala).toBeNull();
    expect((svc as any).workletNode).toBeNull();
    expect((svc as any).audioContext).toBeNull();
    expect((svc as any).blobUrl).toBeNull();
    expect((svc as any).enhancedTrack).toBeNull();
  });

  it('PINS: release() does NOT unsubscribe from the voice processor first', async () => {
    // Looks wrong: release() calls koala.release() while WebVoiceProcessor may
    // still be subscribed to that worker, so the next audio frame is delivered
    // to a released engine. stop() has to be called explicitly beforehand.
    // Pinning current behaviour; adding an unsubscribe should turn this red.
    await svc.init();
    await svc.start();
    unsubscribe.calls.reset();

    await svc.release();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('PINS: release() bails out early when the engine failed to load, leaking the context and blob URL', async () => {
    // Looks wrong: the `if (!this.koala) return;` guard sits above the worklet /
    // AudioContext / blob-URL cleanup, so a service whose engine was already
    // cleared (or that only got as far as building the audio graph) can never
    // free those resources. Pinning current behaviour.
    await svc.init();
    const ctx = FakeAudioContext.instances[0];
    (svc as any).koala = null;

    await svc.release();

    expect(ctx.closed).toBeFalse();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect((svc as any).blobUrl).toBe('blob:koala-stub');
    expect((svc as any).enhancedTrack).not.toBeNull();
  });
});
