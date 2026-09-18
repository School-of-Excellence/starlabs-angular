// jitter-buffer.unit.spec.ts — unit tests for the closed-loop receiver jitter-buffer controller.
//
// WHY UNIT: this is adaptive control logic — raise the playout target when the decoder conceals audio,
// ease it back after clean seconds — tuned from real India->Mumbai call logs. Verifying it in a live call
// means reproducing network jitter on demand; here a fake track and Jasmine's clock drive it exactly.
//
// TUNING: the cases pin the "Option 1" A/V-sync tuning in jitter-buffer.ts (2026-07-18) — ceiling 300ms,
// ease down 30ms after TWO clean cycles. The first draft of this file pinned the pre-retune numbers
// (600 / 20 / four) and failed OPU-19/20 from the day it merged; change these together with the constants.
//
// The track is a hand-rolled double: a getRTCStatsReport that returns whatever concealedSamples the test
// wants, and a setPlayoutDelay that records what it was told. No LiveKit, no TestBed.
import { getJitterMax, startJitterController } from './jitter-buffer';

/** Build a fake RemoteTrack whose stats the test controls. */
const makeTrack = () => {
  const delays: number[] = [];
  const receiver: any = { jitterBufferTarget: 0 };
  let concealedSamples = 0;
  const track: any = {
    setPlayoutDelay: (s: number) => delays.push(s),
    receiver,
    getRTCStatsReport: async () => ({
      forEach: (cb: (s: any) => void) => cb({ type: 'inbound-rtp', concealedSamples }),
    }),
    /** 48 samples == 1ms of concealment, matching the controller's /48 conversion. */
    concealMs: (ms: number) => { concealedSamples += ms * 48; },
  };
  return { track, delays, receiver };
};

/** Advance one controller cycle and let its awaited stats promise settle. */
const cycle = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    jasmine.clock().tick(1000);
    for (let j = 0; j < 8; j++) await Promise.resolve();
  }
};

describe('startJitterController', () => {
  beforeEach(() => jasmine.clock().install());
  afterEach(() => jasmine.clock().uninstall());

  // =============================================================================================
  // OPU-18 — the starting target is applied immediately
  // =============================================================================================
  describe('OPU-18 initial application', () => {
    it('applies a 200ms target as soon as it starts, before any stats arrive', () => {
      const { track, delays, receiver } = makeTrack();
      const stop = startJitterController(track);
      expect(delays[0]).toBe(0.2);              // setPlayoutDelay takes SECONDS
      expect(receiver.jitterBufferTarget).toBe(200);  // the receiver property takes MILLISECONDS
      stop();
    });

    it('does not throw when the track has no setPlayoutDelay', () => {
      // Optional-call guarded; older/other track implementations simply lack it.
      const track: any = { receiver: {}, getRTCStatsReport: async () => ({ forEach: () => {} }) };
      expect(() => startJitterController(track)()).not.toThrow();
    });

    it('does not throw when the track has no receiver', () => {
      const track: any = { setPlayoutDelay: () => {}, getRTCStatsReport: async () => ({ forEach: () => {} }) };
      expect(() => startJitterController(track)()).not.toThrow();
    });
  });

  // =============================================================================================
  // OPU-19 — concealment raises the target
  // =============================================================================================
  describe('OPU-19 raising on concealment', () => {
    it('raises by 60ms after a cycle with more than 5ms of concealment', async () => {
      const { track, receiver } = makeTrack();
      const stop = startJitterController(track);
      await cycle();          // first cycle only establishes the baseline sample count
      track.concealMs(20);
      await cycle();
      expect(receiver.jitterBufferTarget).toBe(260);
      stop();
    });

    it('does NOT raise on the first cycle, because there is no previous sample to diff against', async () => {
      const { track, receiver } = makeTrack();
      const stop = startJitterController(track);
      track.concealMs(50);
      await cycle();
      expect(receiver.jitterBufferTarget).toBe(200);
      stop();
    });

    it('caps the target at the 300ms ceiling however bad the line gets', async () => {
      // 300, not the old 600: audio delay is not applied to video, so a high ceiling drifts lip-sync.
      const { track, receiver } = makeTrack();
      const stop = startJitterController(track);
      await cycle();
      for (let i = 0; i < 20; i++) { track.concealMs(50); await cycle(); }
      expect(getJitterMax()).toBe(300);
      expect(receiver.jitterBufferTarget).toBe(300);
      stop();
    });

    it('ignores concealment of 5ms or less as noise', async () => {
      const { track, receiver } = makeTrack();
      const stop = startJitterController(track);
      await cycle();
      track.concealMs(5);     // the threshold is `> 5`, so exactly 5 does not raise…
      await cycle();
      // …it counts as a CLEAN cycle instead: that is the second in a row, so the target eases 200 → 170.
      expect(receiver.jitterBufferTarget).toBe(170);
      stop();
    });
  });

  // =============================================================================================
  // OPU-20 — clean seconds ease the target back down
  // =============================================================================================
  describe('OPU-20 easing back down', () => {
    it('drops by 30ms only after TWO consecutive clean cycles', async () => {
      const { track, receiver } = makeTrack();
      const stop = startJitterController(track);
      await cycle(1);
      expect(receiver.jitterBufferTarget).toBe(200);   // not yet
      await cycle(1);
      expect(receiver.jitterBufferTarget).toBe(170);   // second clean cycle
      await cycle(2);
      expect(receiver.jitterBufferTarget).toBe(140);   // and again after the next two
      stop();
    });

    it('floors the target at 120ms', async () => {
      const { track, receiver } = makeTrack();
      const stop = startJitterController(track);
      await cycle(40);
      expect(receiver.jitterBufferTarget).toBe(120);
      stop();
    });

    it('resets the clean streak when concealment reappears', async () => {
      // One clean cycle then concealment: the streak restarts, so the next clean cycle must NOT drop it —
      // had the earlier clean cycle carried over, that one would have been the second in a row.
      const { track, receiver } = makeTrack();
      const stop = startJitterController(track);
      await cycle(1);
      track.concealMs(20);
      await cycle();                                   // raises to 260 and clears the streak
      expect(receiver.jitterBufferTarget).toBe(260);
      await cycle(1);
      expect(receiver.jitterBufferTarget).toBe(260);   // one clean cycle: still one short of a drop
      await cycle(1);
      expect(receiver.jitterBufferTarget).toBe(230);   // the second eases it down
      stop();
    });
  });

  // =============================================================================================
  // OPU-21 — stopping, and surviving a broken stats source
  // =============================================================================================
  describe('OPU-21 stop and resilience', () => {
    it('stops adjusting once the returned function is called', async () => {
      const { track, receiver } = makeTrack();
      const stop = startJitterController(track);
      await cycle();
      stop();
      track.concealMs(100);
      await cycle(5);
      expect(receiver.jitterBufferTarget).toBe(200);
      stop();   // idempotent
    });

    it('keeps running when getRTCStatsReport rejects', async () => {
      const receiver: any = { jitterBufferTarget: 0 };
      const track: any = {
        setPlayoutDelay: () => {},
        receiver,
        getRTCStatsReport: async () => { throw new Error('stats unavailable'); },
      };
      const stop = startJitterController(track);
      await cycle(3);
      expect(receiver.jitterBufferTarget).toBe(200);   // unchanged, and no unhandled rejection
      stop();
    });

    it('keeps running when the track exposes no stats method at all', async () => {
      const receiver: any = { jitterBufferTarget: 0 };
      const track: any = { setPlayoutDelay: () => {}, receiver };
      const stop = startJitterController(track);
      await cycle(5);
      // No inbound-rtp stats means no concealment reading, so the clean-streak path still eases it down.
      expect(receiver.jitterBufferTarget).toBeLessThanOrEqual(200);
      stop();
    });
  });
});
