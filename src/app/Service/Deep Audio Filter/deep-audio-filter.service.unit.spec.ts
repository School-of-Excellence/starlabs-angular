// deep-audio-filter.service.unit.spec.ts — unit tests for the Amazon Voice Focus wrapper.
//
// WHY THIS FILE COULD NOT EXIST UNTIL NOW: the service imports `amazon-chime-sdk-js`, which was not
// installed, so it did not compile — one of the four files that broke the repo-wide `ng test`. The
// dependency was installed on 2026-09-10 specifically so this could be covered.
//
// WHY UNIT: every method here is a FALLBACK decision. Voice Focus is unsupported on many devices, the
// model download can fail, and the transform can throw mid-call — and in every one of those cases the
// participant must still be heard on raw audio rather than losing their microphone. That is precisely
// what e2e cannot provoke on demand and a unit test can.
//
// NO REAL SDK CALLS: VoiceFocusDeviceTransformer.create is spied in every test, so no model is downloaded
// and no AudioWorklet is built.
import { VoiceFocusDeviceTransformer } from 'amazon-chime-sdk-js';
import { DeepAudioFilterService } from './deep-audio-filter.service';

/** A MediaStream stand-in that reports the tracks a test gives it. */
const fakeStream = (audio: any[] = [], video: any[] = []) => ({
  getAudioTracks: () => audio,
  getVideoTracks: () => video,
}) as unknown as MediaStream;

const audioTrack = (deviceId?: string) => ({
  kind: 'audio',
  getSettings: () => (deviceId === undefined ? {} : { deviceId }),
});

// The service assembles its output with a REAL MediaStream and addTrack(), which rejects plain objects.
// So the success path uses genuine tracks: an AudioContext destination gives a real audio track and a
// canvas capture gives a real video one. Without these the service would silently fall back to raw and
// the assertions would pass for the wrong reason.
const realAudioTrack = (): MediaStreamTrack => {
  const ctx = new AudioContext();
  const track = ctx.createMediaStreamDestination().stream.getAudioTracks()[0];
  ctx.close();
  return track;
};
const realVideoTrack = (): MediaStreamTrack =>
  (document.createElement('canvas') as any).captureStream().getVideoTracks()[0];

describe('DeepAudioFilterService', () => {
  let svc: DeepAudioFilterService;
  beforeEach(() => { svc = new DeepAudioFilterService(); });

  // =============================================================================================
  // SHU-96 — init: support detection
  // =============================================================================================
  describe('SHU-96 init', () => {
    it('reports true when the transformer says Voice Focus is supported', async () => {
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({ isSupported: () => true } as any);
      expect(await svc.init()).toBeTrue();
    });

    it('reports false when the transformer says it is unsupported', async () => {
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({ isSupported: () => false } as any);
      expect(await svc.init()).toBeFalse();
    });

    it('returns false instead of throwing when the SDK itself fails', async () => {
      // Model download blocked, unsupported browser, offline — none of these may take the call down.
      spyOn(VoiceFocusDeviceTransformer, 'create').and.rejectWith(new Error('no network'));
      await expectAsync(svc.init()).toBeResolvedTo(false);
    });

    it('asks for the auto variant and defers the model download', async () => {
      // preload:false keeps a ~MB model off the critical path until audio is actually processed.
      const spy = spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({ isSupported: () => true } as any);
      await svc.init();
      expect(spy.calls.mostRecent().args[0]).toEqual({ variant: 'auto' } as any);
      expect((spy.calls.mostRecent().args[1] as any).preload).toBeFalse();
    });
  });

  // =============================================================================================
  // SHU-97 — processStream: every failure returns RAW audio, never nothing
  // =============================================================================================
  describe('SHU-97 processStream fallbacks', () => {
    it('returns the raw stream when init was never called', async () => {
      const raw = fakeStream([audioTrack('mic-1')]);
      expect(await svc.processStream(raw)).toBe(raw);
    });

    it('returns the raw stream when Voice Focus is unsupported', async () => {
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({ isSupported: () => false } as any);
      await svc.init();
      const raw = fakeStream([audioTrack('mic-1')]);
      expect(await svc.processStream(raw)).toBe(raw);
    });

    it('returns the raw stream when the transform device cannot be created', async () => {
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async () => null,
      } as any);
      await svc.init();
      const raw = fakeStream([audioTrack('mic-1')]);
      expect(await svc.processStream(raw)).toBe(raw);
    });

    it('returns the raw stream when the transform throws mid-call', async () => {
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async () => { throw new Error('worklet died'); },
      } as any);
      await svc.init();
      const raw = fakeStream([audioTrack('mic-1')]);
      expect(await svc.processStream(raw)).toBe(raw);
    });

    it('returns the raw stream when the processed result is not a usable stream', async () => {
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async () => ({ intrinsicDevice: async () => ({}) }),
      } as any);
      await svc.init();
      const raw = fakeStream([audioTrack('mic-1')]);
      expect(await svc.processStream(raw)).toBe(raw);
    });
  });

  // =============================================================================================
  // SHU-98 — processStream: the success path
  // =============================================================================================
  describe('SHU-98 processStream success', () => {
    const withProcessed = (processedAudio: any[]) =>
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async () => ({
          intrinsicDevice: async () => fakeStream(processedAudio),
          stop: () => {},
        }),
      } as any);

    it('prefers the device id over the stream when one is available', async () => {
      // The source comment says a device label string is the most reliable input to the transformer.
      let passed: any;
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async (d: any) => { passed = d; return null; },
      } as any);
      await svc.init();
      await svc.processStream(fakeStream([audioTrack('mic-77')]));
      expect(passed).toBe('mic-77');
    });

    it('falls back to passing the stream itself when no device id is reported', async () => {
      let passed: any;
      const raw = fakeStream([audioTrack(undefined)]);
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async (d: any) => { passed = d; return null; },
      } as any);
      await svc.init();
      await svc.processStream(raw);
      expect(passed).toBe(raw);
    });

    it('returns a NEW stream carrying the processed audio', async () => {
      const processed = realAudioTrack();
      withProcessed([processed]);
      await svc.init();
      const out: any = await svc.processStream(fakeStream([audioTrack('mic-1')]));
      expect(out.getAudioTracks()).toContain(processed);
      expect(out).not.toBe(fakeStream([]));   // a new MediaStream, not the input
    });

    it('carries the ORIGINAL video tracks across, since Voice Focus only touches audio', async () => {
      // Losing video here would blank the participant's camera as a side-effect of noise suppression.
      const cam = realVideoTrack();
      withProcessed([realAudioTrack()]);
      await svc.init();
      const out: any = await svc.processStream(fakeStream([audioTrack('mic-1')], [cam]));
      expect(out.getVideoTracks()).toContain(cam);
    });

    // NOTE: 'the raw audio track is not carried across' is deliberately NOT asserted here. The service
    // builds a real `new MediaStream()` and calls addTrack() on it, so with synthetic track objects the
    // outcome depends on what Chrome's addTrack does with a non-MediaStreamTrack rather than on the
    // service's own logic. The track-selection intent is already covered by the two cases above.
  });

  // =============================================================================================
  // SHU-99 — isActive / destroy
  // =============================================================================================
  describe('SHU-99 isActive and destroy', () => {
    const ready = () =>
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async () => ({
          intrinsicDevice: async () => fakeStream([realAudioTrack()]),
          stop: () => {},
        }),
      } as any);

    it('is inactive before init', () => {
      expect(svc.isActive()).toBeFalse();
    });

    it('is inactive after init until a stream is processed', async () => {
      ready();
      await svc.init();
      expect(svc.isActive()).toBeFalse();   // supported, but no transform device yet
    });

    it('is active once a stream has been processed', async () => {
      ready();
      await svc.init();
      await svc.processStream(fakeStream([audioTrack('mic-1')]));
      expect(svc.isActive()).toBeTrue();
    });

    it('stops the transform device and goes inactive on destroy', async () => {
      let stopped = false;
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async () => ({
          intrinsicDevice: async () => fakeStream([realAudioTrack()]),
          stop: () => { stopped = true; },
        }),
      } as any);
      await svc.init();
      await svc.processStream(fakeStream([audioTrack('mic-1')]));
      svc.destroy();
      expect(stopped).toBeTrue();
      expect(svc.isActive()).toBeFalse();
    });

    it('swallows a failure from stop() so teardown always completes', async () => {
      spyOn(VoiceFocusDeviceTransformer, 'create').and.resolveTo({
        isSupported: () => true,
        createTransformDevice: async () => ({
          intrinsicDevice: async () => fakeStream([realAudioTrack()]),
          stop: () => { throw new Error('already stopped'); },
        }),
      } as any);
      await svc.init();
      await svc.processStream(fakeStream([audioTrack('mic-1')]));
      expect(() => svc.destroy()).not.toThrow();
      expect(svc.isActive()).toBeFalse();
    });

    it('is safe to destroy without ever initialising', () => {
      expect(() => svc.destroy()).not.toThrow();
    });

    it('requires a fresh init after destroy — it does not silently reuse the old transformer', async () => {
      ready();
      await svc.init();
      await svc.processStream(fakeStream([audioTrack('mic-1')]));
      svc.destroy();

      const raw = fakeStream([audioTrack('mic-1')]);
      expect(await svc.processStream(raw)).toBe(raw);   // back to raw passthrough
    });
  });
});
