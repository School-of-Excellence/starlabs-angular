// adaptive-quality.service.unit.spec.ts — unit tests for the adaptive video-quality tier engine.
//
// WHY UNIT RATHER THAN E2E: every decision this service makes is a pure function of four inputs
// (CPU-pressure string, LiveKit ConnectionQuality, elapsed wall time, current tier). Reproducing a
// "CPU is critical for three consecutive 8-second checks, but only after a 45s warm-up, and only if
// we are not inside a 60s post-downgrade cooldown" scenario in a real browser call would take ~10
// minutes of wall clock, needs a second participant, and cannot make the CPU actually saturate on
// demand. Driving `stabilityCheck()` directly with hand-rolled doubles turns that into milliseconds
// and makes the thresholds themselves the thing under test. The class has no constructor injection
// and no field-level `inject()`, so `new AdaptiveQualityService()` is enough — no TestBed.
//
// WHAT IT PROTECTS: the numbers. DOWNGRADE_CHECKS=3, UPGRADE_CHECKS=8, ULTRA_UPGRADE_CHECKS=15,
// WARMUP_MS=45_000, DOWNGRADE_COOLDOWN_MS=60_000, CHECK_INTERVAL_MS=8_000 and the five TIER_CONFIG
// rows are all tuned constants with comments recording what they used to be. They are exactly the
// sort of thing that gets "cleaned up" and silently reintroduces the tier-bouncing this tuning was
// meant to stop. These tests also pin the tier ladder order, the per-tier capture/bitrate/simulcast
// mapping, and the reconnect backoff sequence.
//
// NOT COVERED HERE (deliberate — see report):
//  * startRafFallback()'s slow-frame ratio buckets (>0.5 critical / >0.3 serious / >0.15 fair) need
//    real requestAnimationFrame timing pressure, which cannot be produced deterministically in Karma.
//  * the visibilitychange pause/resume path — document.visibilityState is not settable in a way the
//    real event listener would observe consistently across Chrome versions.
//  * real applyConstraints() on a real camera track (needs actual getUserMedia hardware).

import {
  ConnectionQuality,
  VideoPresets,
} from 'livekit-client';
import { AdaptiveQualityService, QualityTier } from './adaptive-quality.service';

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────

/** Temporarily override an own-property on `navigator`, returning an undo fn. */
function overrideNav(props: Record<string, any>): () => void {
  const had: Record<string, PropertyDescriptor | undefined> = {};
  Object.keys(props).forEach((k) => {
    had[k] = Object.getOwnPropertyDescriptor(navigator, k);
    Object.defineProperty(navigator, k, { value: props[k], configurable: true, writable: true });
  });
  return () => {
    Object.keys(props).forEach((k) => {
      const d = had[k];
      if (d) Object.defineProperty(navigator, k, d);
      else delete (navigator as any)[k];
    });
  };
}

interface FakeRoomOpts {
  /** stats entries returned by sender.getStats(); omit to have no sender at all */
  stats?: any[];
  /** make sender.getStats() reject */
  statsThrows?: boolean;
  /** spy installed as rawTrack.applyConstraints */
  applyConstraints?: jasmine.Spy;
  /** publication source string; anything but 'camera' means "no camera found" */
  source?: string;
  /** omit the publication entirely */
  noPublication?: boolean;
  /** publication exists but pub.track is undefined */
  noTrack?: boolean;
}

function makeRoom(opts: FakeRoomOpts = {}): any {
  const pubs = new Map<string, any>();
  if (!opts.noPublication) {
    const sender =
      opts.stats || opts.statsThrows
        ? {
            getStats: () =>
              opts.statsThrows
                ? Promise.reject(new Error('stats unavailable'))
                : Promise.resolve({ forEach: (cb: any) => (opts.stats ?? []).forEach(cb) }),
          }
        : undefined;
    pubs.set('pub0', {
      source: opts.source ?? 'camera',
      track: opts.noTrack
        ? undefined
        : {
            mediaStreamTrack: {
              applyConstraints:
                opts.applyConstraints ?? jasmine.createSpy('applyConstraints').and.resolveTo(undefined),
            },
            sender,
          },
    });
  }
  return {
    localParticipant: { identity: 'local-me', videoTrackPublications: pubs },
    on: jasmine.createSpy('room.on'),
  };
}

/** Put the service in a state where warm-up and downgrade-cooldown are both already satisfied. */
function armed(svc: AdaptiveQualityService, room: any, tier: QualityTier): void {
  (svc as any).room = room;
  svc.currentTier.set(tier);
  (svc as any).monitoringStartTime = 0; // Date.now() - 0 >> WARMUP_MS
  (svc as any).lastDowngradeTime = 0; // Date.now() - 0 >> DOWNGRADE_COOLDOWN_MS
  (svc as any).consecutiveGoodChecks = 0;
  (svc as any).consecutiveBadChecks = 0;
}

const check = (svc: AdaptiveQualityService): Promise<void> => (svc as any).stabilityCheck();

async function checkN(svc: AdaptiveQualityService, n: number): Promise<void> {
  for (let i = 0; i < n; i++) await check(svc);
}

let svc: AdaptiveQualityService;
beforeEach(() => {
  svc = new AdaptiveQualityService();
  svc.cpuPressure.set('nominal');
  svc.networkQuality.set(ConnectionQuality.Unknown);
  (window as any).__e2eLogs = [];
});

// =================================================================================================
// SHU-25 — detectInitialQuality: device-capability ladder
// =================================================================================================
describe('SHU-25 detectInitialQuality device ladder', () => {
  let undo: (() => void) | null = null;
  afterEach(() => {
    undo?.();
    undo = null;
  });

  /** desktop-ish baseline; individual tests override the fields they care about */
  const detect = (over: Record<string, any>): QualityTier => {
    undo = overrideNav({
      hardwareConcurrency: 16,
      deviceMemory: 16,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126',
      connection: { downlink: 100 },
      ...over,
    });
    return svc.detectInitialQuality();
  };

  it('any mobile user agent forces minimal regardless of cores/memory/downlink', () => {
    expect(detect({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe('minimal');
    undo!();
    expect(detect({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe('minimal');
    undo!();
    expect(detect({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' })).toBe('minimal');
  });

  it('cores <= 2 or memory <= 2 is minimal (boundary at 2/3)', () => {
    expect(detect({ hardwareConcurrency: 2 })).toBe('minimal');
    undo!();
    expect(detect({ deviceMemory: 2 })).toBe('minimal');
    undo!();
    expect(detect({ hardwareConcurrency: 3, deviceMemory: 3 })).toBe('low'); // 3 cores falls to the <=4 rung
  });

  it('cores <= 4, memory <= 4 or downlink < 1 is low', () => {
    expect(detect({ hardwareConcurrency: 4 })).toBe('low');
    undo!();
    expect(detect({ deviceMemory: 4 })).toBe('low');
    undo!();
    expect(detect({ connection: { downlink: 0.9 } })).toBe('low');
    undo!();
    expect(detect({ connection: { downlink: 1 } })).toBe('medium'); // downlink 1 is NOT < 1
  });

  it('cores <= 6 or downlink < 3 is medium', () => {
    expect(detect({ hardwareConcurrency: 6 })).toBe('medium');
    undo!();
    expect(detect({ connection: { downlink: 2.99 } })).toBe('medium');
  });

  it('cores <= 8 or downlink < 5 is high', () => {
    expect(detect({ hardwareConcurrency: 8 })).toBe('high');
    undo!();
    expect(detect({ connection: { downlink: 4.99 } })).toBe('high');
  });

  it('9+ cores with >=5Mbps downlink is ultra', () => {
    expect(detect({ hardwareConcurrency: 9, connection: { downlink: 5 } })).toBe('ultra');
  });

  it('falls back to cores=2 / memory=4 / downlink=10 when the APIs are absent — cores=2 pins minimal', () => {
    // hardwareConcurrency ?? 2 via `|| 2`, deviceMemory `|| 4`, connection?.downlink `?? 10`
    expect(detect({ hardwareConcurrency: undefined, deviceMemory: undefined, connection: undefined })).toBe(
      'minimal',
    );
  });

  it('hardwareConcurrency of 0 is treated as the fallback 2 because the code uses || not ??', () => {
    expect(detect({ hardwareConcurrency: 0 })).toBe('minimal');
  });

  it('writes the detected tier into the currentTier signal', () => {
    detect({ hardwareConcurrency: 6 });
    expect(svc.currentTier()).toBe('medium');
  });
});

// =================================================================================================
// SHU-26 — per-tier capture constraints
// =================================================================================================
describe('SHU-26 getCameraConstraints tier mapping', () => {
  const expected: Record<QualityTier, [number, number, number]> = {
    ultra: [1280, 720, 30],
    high: [1280, 720, 24],
    medium: [1280, 720, 20],
    low: [640, 360, 15],
    minimal: [320, 240, 12],
  };

  (Object.keys(expected) as QualityTier[]).forEach((tier) => {
    it(`${tier} captures at ${expected[tier][0]}x${expected[tier][1]}@${expected[tier][2]}fps`, () => {
      const r = svc.getCameraConstraints(tier).resolution as any;
      expect([r.width, r.height, r.frameRate]).toEqual(expected[tier]);
    });
  });

  it('frame rate is monotonically non-increasing as the tier drops', () => {
    const order: QualityTier[] = ['ultra', 'high', 'medium', 'low', 'minimal'];
    const fps = order.map((t) => (svc.getCameraConstraints(t).resolution as any).frameRate);
    fps.slice(1).forEach((f, i) => expect(f).toBeLessThan(fps[i]));
  });

  // PINNING SUSPECTED DEFECT (do not "fix" by changing this assertion):
  // getCameraConstraints() hardcodes `deviceId: "frontcamera"`. That is not a real MediaDeviceInfo
  // deviceId — real ones are long opaque base64-ish hashes (or the literal 'default'). A browser
  // asked for a non-existent deviceId either ignores it or throws OverconstrainedError. It reads
  // like a placeholder that was never replaced, and it is redundant with facingMode:'user' anyway.
  // Pinned so a later fix shows up as a red test and gets reviewed rather than landing silently.
  it('PINNED: emits the hardcoded placeholder deviceId "frontcamera" alongside facingMode user', () => {
    const c = svc.getCameraConstraints('high');
    expect(c.deviceId).toBe('frontcamera');
    expect(c.facingMode).toBe('user');
  });
});

// =================================================================================================
// SHU-27 — publish options / simulcast layer sets
// =================================================================================================
describe('SHU-27 getPublishOptions simulcast + encoding', () => {
  it('encodes at the tier bitrate and frame rate, vp8, simulcast on', () => {
    const o = svc.getPublishOptions('low');
    expect(o.videoCodec).toBe('vp8');
    expect(o.simulcast).toBeTrue();
    expect(o.videoEncoding).toEqual({ maxBitrate: 400_000, maxFramerate: 15 });
  });

  it('bitrate ladder is strictly decreasing ultra > high > medium > low > minimal', () => {
    const order: QualityTier[] = ['ultra', 'high', 'medium', 'low', 'minimal'];
    const br = order.map((t) => svc.getPublishOptions(t).videoEncoding!.maxBitrate!);
    expect(br).toEqual([2_500_000, 1_500_000, 1_000_000, 400_000, 200_000]);
  });

  it('high and medium share the standard [h180, h360, h720] layer set', () => {
    const std = [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720];
    expect(svc.getPublishOptions('high').videoSimulcastLayers).toEqual(std);
    expect(svc.getPublishOptions('medium').videoSimulcastLayers).toEqual(std);
  });

  it('ultra tops out at h720 — capturing above the max simulcast layer would waste encoder CPU', () => {
    const layers = svc.getPublishOptions('ultra').videoSimulcastLayers!;
    expect(layers[layers.length - 1]).toBe(VideoPresets.h720);
    expect(Math.max(...layers.map((l) => l.height))).toBe(720);
  });

  it('low drops the 720p layer entirely', () => {
    expect(svc.getPublishOptions('low').videoSimulcastLayers).toEqual([
      VideoPresets.h180,
      VideoPresets.h360,
    ]);
  });

  it('ultra and minimal both include the custom 224x126 v126 preset', () => {
    [('ultra' as QualityTier), ('minimal' as QualityTier)].forEach((t) => {
      const first = svc.getPublishOptions(t).videoSimulcastLayers![0];
      expect([first.width, first.height]).toEqual([224, 126]);
      expect(first.encoding.maxBitrate).toBe(80_000);
      expect(first.encoding.maxFramerate).toBe(12);
    });
  });

  it('no simulcast layer exceeds its tier capture resolution', () => {
    (['ultra', 'high', 'medium', 'low', 'minimal'] as QualityTier[]).forEach((t) => {
      const cap = svc.getCameraConstraints(t).resolution as any;
      svc.getPublishOptions(t).videoSimulcastLayers!.forEach((l) => {
        expect(l.height).withContext(`${t} layer ${l.width}x${l.height}`).toBeLessThanOrEqual(cap.height);
      });
    });
  });
});

// =================================================================================================
// SHU-28 — room config: adaptiveStream, dynacast, audio knobs, reconnect backoff
// =================================================================================================
describe('SHU-28 getRoomConfig', () => {
  it('enables adaptiveStream and dynacast (native layer selection + unsubscribed-layer pausing)', () => {
    const c = svc.getRoomConfig('medium');
    expect(c.adaptiveStream).toBeTrue();
    expect(c.dynacast).toBeTrue();
  });

  it('keeps RED on and DTX OFF — DTX plus the DFN silence gate causes audible breakup', () => {
    const pd = svc.getRoomConfig('high').publishDefaults as any;
    expect(pd.red).toBeTrue();
    expect(pd.dtx).toBeFalse();
  });

  it('mirrors the tier encoding into publishDefaults', () => {
    const pd = svc.getRoomConfig('minimal').publishDefaults as any;
    expect(pd.videoEncoding).toEqual({ maxBitrate: 200_000, maxFramerate: 12 });
    expect(pd.simulcast).toBeTrue();
    expect(pd.videoCodec).toBe('vp8');
  });

  it('reconnect backoff is 500/1000/2000/4000/8000ms then null (give up)', () => {
    const next = (svc.getRoomConfig('medium').reconnectPolicy as any).nextRetryDelayInMs;
    expect([0, 1, 2, 3, 4].map((retryCount) => next({ retryCount }))).toEqual([
      500, 1000, 2000, 4000, 8000,
    ]);
    expect(next({ retryCount: 5 })).toBeNull();
    expect(next({ retryCount: 99 })).toBeNull();
  });

  it('leaves audioCaptureDefaults empty so Chrome NS/EC/AGC defaults stay on', () => {
    expect(svc.getRoomConfig('medium').audioCaptureDefaults).toEqual({});
  });
});

// =================================================================================================
// SHU-29 — setQualityTier: signal update, applyConstraints shape, guards
// =================================================================================================
describe('SHU-29 setQualityTier', () => {
  it('is a no-op when the requested tier equals the current tier', async () => {
    const applyConstraints = jasmine.createSpy('applyConstraints').and.resolveTo(undefined);
    (svc as any).room = makeRoom({ applyConstraints });
    svc.currentTier.set('medium');
    await svc.setQualityTier('medium');
    expect(applyConstraints).not.toHaveBeenCalled();
  });

  it('applies ideal AND max constraints pinned to the new tier config', async () => {
    const applyConstraints = jasmine.createSpy('applyConstraints').and.resolveTo(undefined);
    (svc as any).room = makeRoom({ applyConstraints });
    await svc.setQualityTier('low');
    expect(svc.currentTier()).toBe('low');
    expect(applyConstraints).toHaveBeenCalledOnceWith({
      width: { ideal: 640, max: 640 },
      height: { ideal: 360, max: 360 },
      frameRate: { ideal: 15, max: 15 },
    });
  });

  it('still updates the tier signal when there is no room at all', async () => {
    (svc as any).room = null;
    await svc.setQualityTier('ultra');
    expect(svc.currentTier()).toBe('ultra');
  });

  it('swallows an applyConstraints rejection and keeps the new tier', async () => {
    const applyConstraints = jasmine
      .createSpy('applyConstraints')
      .and.rejectWith(new Error('OverconstrainedError'));
    (svc as any).room = makeRoom({ applyConstraints });
    await expectAsync(svc.setQualityTier('high')).toBeResolved();
    expect(svc.currentTier()).toBe('high');
  });

  it('ignores publications whose source is not camera (e.g. screenshare)', async () => {
    const applyConstraints = jasmine.createSpy('applyConstraints').and.resolveTo(undefined);
    (svc as any).room = makeRoom({ applyConstraints, source: 'screen_share' });
    await svc.setQualityTier('low');
    expect(applyConstraints).not.toHaveBeenCalled();
    expect(svc.currentTier()).toBe('low');
  });

  it('tolerates a publication with no track', async () => {
    (svc as any).room = makeRoom({ noTrack: true });
    await expectAsync(svc.setQualityTier('minimal')).toBeResolved();
    expect(svc.currentTier()).toBe('minimal');
  });
});

// =================================================================================================
// SHU-30 — stabilityCheck downgrade rules
// =================================================================================================
describe('SHU-30 stabilityCheck downgrade', () => {
  beforeEach(() => {
    armed(svc, makeRoom(), 'high');
    svc.cpuPressure.set('critical');
  });

  it('does NOT downgrade on the first two bad checks — DOWNGRADE_CHECKS is 3', async () => {
    await checkN(svc, 2);
    expect(svc.currentTier()).toBe('high');
    expect((svc as any).consecutiveBadChecks).toBe(2);
  });

  it('downgrades exactly one rung on the third consecutive bad check', async () => {
    await checkN(svc, 3);
    expect(svc.currentTier()).toBe('medium');
  });

  it("treats 'serious' as bad as 'critical'", async () => {
    svc.cpuPressure.set('serious');
    await checkN(svc, 3);
    expect(svc.currentTier()).toBe('medium');
  });

  it("does not treat 'fair' as bad (fair is neither good nor bad — it just stalls)", async () => {
    svc.cpuPressure.set('fair');
    svc.networkQuality.set(ConnectionQuality.Excellent);
    await checkN(svc, 20);
    expect(svc.currentTier()).toBe('high');
    expect((svc as any).consecutiveBadChecks).toBe(0);
    expect((svc as any).consecutiveGoodChecks).toBe(0);
  });

  it('resets the bad counter after a downgrade so the next drop needs 3 more checks', async () => {
    await checkN(svc, 3);
    expect(svc.currentTier()).toBe('medium');
    await checkN(svc, 2);
    expect(svc.currentTier()).toBe('medium');
    await check(svc);
    expect(svc.currentTier()).toBe('low');
  });

  it('a single good check clears the accumulated bad streak', async () => {
    await checkN(svc, 2);
    svc.cpuPressure.set('nominal');
    svc.networkQuality.set(ConnectionQuality.Good);
    await check(svc);
    expect((svc as any).consecutiveBadChecks).toBe(0);
    svc.cpuPressure.set('critical');
    await checkN(svc, 2);
    expect(svc.currentTier()).toBe('high');
  });

  it('never falls below minimal', async () => {
    svc.currentTier.set('minimal');
    await checkN(svc, 30);
    expect(svc.currentTier()).toBe('minimal');
  });

  it('suppresses downgrades during the 45s warm-up window', async () => {
    (svc as any).monitoringStartTime = Date.now() - 44_000;
    await checkN(svc, 5);
    expect(svc.currentTier()).toBe('high');
  });

  // PINNING CURRENT BEHAVIOUR (looks wrong, kept as-is so a fix is reviewed):
  // The warm-up gate is checked AFTER `consecutiveBadChecks++`, and the counter is never reset while
  // warm-up is in force. So a session that is CPU-critical throughout warm-up accumulates a large bad
  // streak and downgrades on the very FIRST check past the 45s mark, instead of needing 3 fresh bad
  // checks (~24s) after warm-up. The comment says warm-up exists so the blur startup spike does not
  // trigger a downgrade — but the spike's checks are still counted, they are only deferred.
  it('PINNED: bad checks accumulated during warm-up carry over and fire instantly once warm-up ends', async () => {
    (svc as any).monitoringStartTime = Date.now() - 44_000;
    await checkN(svc, 5); // all suppressed, but counted
    expect(svc.currentTier()).toBe('high');
    expect((svc as any).consecutiveBadChecks).toBe(5);
    (svc as any).monitoringStartTime = Date.now() - 46_000; // warm-up now over
    await check(svc);
    expect(svc.currentTier()).toBe('medium'); // one check, not three
  });

  it('stamps the downgrade cooldown clock when it drops a tier', async () => {
    const before = Date.now();
    await checkN(svc, 3);
    expect((svc as any).lastDowngradeTime).toBeGreaterThanOrEqual(before);
  });

  it('is a no-op with no room attached', async () => {
    (svc as any).room = null;
    await checkN(svc, 10);
    expect(svc.currentTier()).toBe('high');
    expect((svc as any).consecutiveBadChecks).toBe(0);
  });
});

// =================================================================================================
// SHU-31 — stabilityCheck upgrade rules
// =================================================================================================
describe('SHU-31 stabilityCheck upgrade', () => {
  beforeEach(() => {
    armed(svc, makeRoom(), 'medium');
    svc.cpuPressure.set('nominal');
    svc.networkQuality.set(ConnectionQuality.Good);
  });

  it('needs 8 consecutive good checks before medium -> high', async () => {
    await checkN(svc, 7);
    expect(svc.currentTier()).toBe('medium');
    await check(svc);
    expect(svc.currentTier()).toBe('high');
  });

  it('resets the good counter after upgrading', async () => {
    await checkN(svc, 8);
    expect((svc as any).consecutiveGoodChecks).toBe(0);
  });

  it('Excellent network also counts as good for a non-ultra upgrade', async () => {
    svc.networkQuality.set(ConnectionQuality.Excellent);
    await checkN(svc, 8);
    expect(svc.currentTier()).toBe('high');
  });

  it('Poor network zeroes the good streak — no upgrade ever accrues', async () => {
    await checkN(svc, 7);
    svc.networkQuality.set(ConnectionQuality.Poor);
    await check(svc);
    expect((svc as any).consecutiveGoodChecks).toBe(0);
    svc.networkQuality.set(ConnectionQuality.Good);
    await checkN(svc, 7);
    expect(svc.currentTier()).toBe('medium');
  });

  it('Unknown network is not good enough to accrue an upgrade', async () => {
    svc.networkQuality.set(ConnectionQuality.Unknown);
    await checkN(svc, 20);
    expect(svc.currentTier()).toBe('medium');
  });

  it('high -> ultra needs Excellent network; Good alone never promotes', async () => {
    svc.currentTier.set('high');
    await checkN(svc, 30);
    expect(svc.currentTier()).toBe('high');
  });

  it('high -> ultra needs 15 good checks, not 8', async () => {
    svc.currentTier.set('high');
    svc.networkQuality.set(ConnectionQuality.Excellent);
    await checkN(svc, 14);
    expect(svc.currentTier()).toBe('high');
    await check(svc);
    expect(svc.currentTier()).toBe('ultra');
  });

  it('ultra is the ceiling — no further promotion, and the good counter keeps climbing', async () => {
    svc.currentTier.set('ultra');
    svc.networkQuality.set(ConnectionQuality.Excellent);
    await checkN(svc, 40);
    expect(svc.currentTier()).toBe('ultra');
    expect((svc as any).consecutiveGoodChecks).toBe(40);
  });

  it('holds the upgrade during the 60s post-downgrade cooldown', async () => {
    (svc as any).lastDowngradeTime = Date.now() - 59_000;
    await checkN(svc, 20);
    expect(svc.currentTier()).toBe('medium');
  });

  // PINNING CURRENT BEHAVIOUR (looks wrong, kept as-is so a fix is reviewed):
  // `consecutiveGoodChecks++` happens BEFORE the cooldown early-return, so good checks pile up
  // throughout the 60s cooldown. The moment the cooldown expires the very next check sees a streak
  // well past 8 and promotes immediately — the cooldown delays the upgrade but does not require any
  // fresh evidence of stability after it, which is the opposite of what a bounce-prevention cooldown
  // is for. Same shape as the warm-up carry-over above.
  it('PINNED: good checks accrue during cooldown, so the first post-cooldown check upgrades at once', async () => {
    (svc as any).lastDowngradeTime = Date.now() - 59_000;
    await checkN(svc, 20);
    expect(svc.currentTier()).toBe('medium');
    expect((svc as any).consecutiveGoodChecks).toBe(20);
    (svc as any).lastDowngradeTime = Date.now() - 61_000;
    await check(svc);
    expect(svc.currentTier()).toBe('high');
  });

  // PINNING CURRENT BEHAVIOUR: the "ultra needs Excellent" gate is also a bare `return` placed after
  // the increment, so a long Good-network run at high tier banks an unbounded streak; the first
  // Excellent reading then jumps straight to ultra with no sustained-Excellent requirement at all.
  it('PINNED: a banked Good-network streak at high promotes to ultra on the first Excellent check', async () => {
    svc.currentTier.set('high');
    await checkN(svc, 20); // Good network — blocked by the ultra gate, but still counted
    expect(svc.currentTier()).toBe('high');
    svc.networkQuality.set(ConnectionQuality.Excellent);
    await check(svc);
    expect(svc.currentTier()).toBe('ultra');
  });

  it('climbs the whole ladder minimal -> low -> medium -> high with 8 checks per rung', async () => {
    svc.currentTier.set('minimal');
    await checkN(svc, 8);
    expect(svc.currentTier()).toBe('low');
    await checkN(svc, 8);
    expect(svc.currentTier()).toBe('medium');
    await checkN(svc, 8);
    expect(svc.currentTier()).toBe('high');
  });
});

// =================================================================================================
// SHU-32 — stabilityCheck fps derivation from WebRTC stats
// =================================================================================================
describe('SHU-32 stabilityCheck fps from outbound-rtp stats', () => {
  const lastFps = () => (window as any).__lastFps;

  beforeEach(() => {
    (window as any).__lastFps = undefined;
    svc.cpuPressure.set('nominal');
    svc.networkQuality.set(ConnectionQuality.Good);
  });

  it('takes the MAX framesPerSecond across simulcast layers, not the first or lowest', async () => {
    armed(
      svc,
      makeRoom({
        stats: [
          { type: 'outbound-rtp', kind: 'video', framesPerSecond: 12 },
          { type: 'outbound-rtp', kind: 'video', framesPerSecond: 29 },
          { type: 'outbound-rtp', kind: 'video', framesPerSecond: 24 },
        ],
      }),
      'high',
    );
    await check(svc);
    expect(lastFps()).toBe(29);
  });

  it('rounds fractional framesPerSecond', async () => {
    armed(svc, makeRoom({ stats: [{ type: 'outbound-rtp', kind: 'video', framesPerSecond: 23.6 }] }), 'high');
    await check(svc);
    expect(lastFps()).toBe(24);
  });

  it('treats framesPerSecond 0 (dynacast paused layer) as "no data" and substitutes the tier fps', async () => {
    // `stat.framesPerSecond || cfg.frameRate` — deliberate use of || over ?? so a paused layer does
    // not look like an encode failure. high tier expects 24fps.
    armed(svc, makeRoom({ stats: [{ type: 'outbound-rtp', kind: 'video', framesPerSecond: 0 }] }), 'high');
    await check(svc);
    expect(lastFps()).toBe(24);
  });

  it('ignores non-video and non-outbound-rtp stat entries', async () => {
    armed(
      svc,
      makeRoom({
        stats: [
          { type: 'outbound-rtp', kind: 'audio', framesPerSecond: 900 },
          { type: 'inbound-rtp', kind: 'video', framesPerSecond: 900 },
          { type: 'outbound-rtp', kind: 'video', framesPerSecond: 15 },
        ],
      }),
      'high',
    );
    await check(svc);
    expect(lastFps()).toBe(15);
  });

  it('falls back to the tier frame rate when no video outbound-rtp entry exists at all', async () => {
    armed(svc, makeRoom({ stats: [{ type: 'outbound-rtp', kind: 'audio', framesPerSecond: 50 }] }), 'low');
    await check(svc);
    expect(lastFps()).toBe(15); // low tier
  });

  it('falls back to the tier frame rate when getStats() rejects', async () => {
    armed(svc, makeRoom({ statsThrows: true }), 'minimal');
    await expectAsync(check(svc)).toBeResolved();
    expect(lastFps()).toBe(12); // minimal tier
  });

  it('falls back to the tier frame rate when the track has no sender', async () => {
    armed(svc, makeRoom(), 'ultra');
    await check(svc);
    expect(lastFps()).toBe(30);
  });

  it('falls back to the tier frame rate when there is no camera publication', async () => {
    armed(svc, makeRoom({ noPublication: true }), 'medium');
    await check(svc);
    expect(lastFps()).toBe(20);
  });

  it('pushes one telemetry line per check onto window.__e2eLogs including tier, fps%, cpu and net', async () => {
    armed(svc, makeRoom({ stats: [{ type: 'outbound-rtp', kind: 'video', framesPerSecond: 12 }] }), 'high');
    await check(svc);
    const logs: string[] = (window as any).__e2eLogs;
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[HIGH]');
    expect(logs[0]).toContain('12/24fps (50%)');
    expect(logs[0]).toContain('CPU: nominal');
  });

  it('logs the DOWNGRADE reason line to __e2eLogs', async () => {
    armed(svc, makeRoom(), 'high');
    svc.cpuPressure.set('critical');
    await checkN(svc, 3);
    const logs: string[] = (window as any).__e2eLogs;
    expect(logs.some((l) => l.includes('DOWNGRADE') && l.includes('high → medium') && l.includes('CPU critical')))
      .toBeTrue();
  });

  it('logs the UPGRADE line to __e2eLogs', async () => {
    armed(svc, makeRoom(), 'medium');
    svc.networkQuality.set(ConnectionQuality.Good);
    await checkN(svc, 8);
    expect(((window as any).__e2eLogs as string[]).some((l) => l.includes('UPGRADE: medium → high'))).toBeTrue();
  });
});

// =================================================================================================
// SHU-33 — startMonitoring / stopMonitoring lifecycle
// =================================================================================================
describe('SHU-33 monitoring lifecycle', () => {
  let hadPressure: PropertyDescriptor | undefined;

  beforeEach(() => {
    hadPressure = Object.getOwnPropertyDescriptor(window, 'PressureObserver');
  });

  afterEach(() => {
    if (hadPressure) Object.defineProperty(window, 'PressureObserver', hadPressure);
    else delete (window as any).PressureObserver;
    svc.stopMonitoring();
  });

  const installPressureObserver = (impl: any) =>
    Object.defineProperty(window, 'PressureObserver', { value: impl, configurable: true, writable: true });

  it('schedules a stability check every 8 seconds (CHECK_INTERVAL_MS)', () => {
    jasmine.clock().install();
    try {
      const spy = spyOn<any>(svc, 'stabilityCheck').and.resolveTo(undefined);
      installPressureObserver(
        class {
          observe() {}
          unobserve() {}
        },
      );
      svc.startMonitoring(makeRoom());
      jasmine.clock().tick(7_999);
      expect(spy).not.toHaveBeenCalled();
      jasmine.clock().tick(1);
      expect(spy).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(24_000);
      expect(spy).toHaveBeenCalledTimes(4);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('stopMonitoring cancels the interval, unobserves cpu and detaches the room', () => {
    jasmine.clock().install();
    try {
      const spy = spyOn<any>(svc, 'stabilityCheck').and.resolveTo(undefined);
      const unobserve = jasmine.createSpy('unobserve');
      installPressureObserver(
        class {
          observe() {}
          unobserve = unobserve;
        },
      );
      svc.startMonitoring(makeRoom());
      jasmine.clock().tick(8_000);
      svc.stopMonitoring();
      jasmine.clock().tick(80_000);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(unobserve).toHaveBeenCalledOnceWith('cpu');
      expect((svc as any).room).toBeNull();
      expect((svc as any).monitorInterval).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('stopMonitoring is safe to call twice / before ever starting', () => {
    expect(() => {
      svc.stopMonitoring();
      svc.stopMonitoring();
    }).not.toThrow();
  });

  it('mirrors the LAST PressureObserver record into cpuPressure', () => {
    let cb: (records: any[]) => void = () => {};
    installPressureObserver(
      class {
        constructor(fn: any) {
          cb = fn;
        }
        observe() {}
        unobserve() {}
      },
    );
    svc.startMonitoring(makeRoom());
    cb([{ state: 'fair' }, { state: 'serious' }, { state: 'critical' }]);
    expect(svc.cpuPressure()).toBe('critical');
  });

  it('falls back to the rAF sampler when PressureObserver.observe throws', () => {
    installPressureObserver(
      class {
        observe() {
          throw new Error('not allowed');
        }
        unobserve() {}
      },
    );
    svc.startMonitoring(makeRoom());
    expect((svc as any).pressureObserver).not.toBeNull();
    expect((svc as any).rafHandle).not.toBeNull(); // rAF fallback engaged
  });

  it('falls back to the rAF sampler when PressureObserver is absent entirely', () => {
    delete (window as any).PressureObserver;
    svc.startMonitoring(makeRoom());
    expect((svc as any).pressureObserver).toBeNull();
    expect((svc as any).rafHandle).not.toBeNull();
    svc.stopMonitoring();
    expect((svc as any).rafHandle).toBeNull();
    expect((svc as any).visibilityChangeHandler).toBeNull();
  });

  it('resets both stability counters on start so a rejoin does not inherit the old streak', () => {
    delete (window as any).PressureObserver;
    (svc as any).consecutiveGoodChecks = 99;
    (svc as any).consecutiveBadChecks = 99;
    svc.startMonitoring(makeRoom());
    expect((svc as any).consecutiveGoodChecks).toBe(0);
    expect((svc as any).consecutiveBadChecks).toBe(0);
  });

  it('only records connection quality for the LOCAL participant', () => {
    delete (window as any).PressureObserver;
    const room = makeRoom();
    svc.startMonitoring(room);
    const handler = room.on.calls.argsFor(0)[1];
    handler(ConnectionQuality.Poor, { identity: 'someone-else' });
    expect(svc.networkQuality()).toBe(ConnectionQuality.Unknown);
    handler(ConnectionQuality.Excellent, { identity: 'local-me' });
    expect(svc.networkQuality()).toBe(ConnectionQuality.Excellent);
  });

  it('ignores a quality event with no participant', () => {
    delete (window as any).PressureObserver;
    const room = makeRoom();
    svc.startMonitoring(room);
    const handler = room.on.calls.argsFor(0)[1];
    expect(() => handler(ConnectionQuality.Poor, undefined)).not.toThrow();
    expect(svc.networkQuality()).toBe(ConnectionQuality.Unknown);
  });
});

// =================================================================================================
// SHU-34 — default state
// =================================================================================================
describe('SHU-34 initial signal state', () => {
  it('starts at medium / nominal / Unknown before any detection runs', () => {
    const fresh = new AdaptiveQualityService();
    expect(fresh.currentTier()).toBe('medium');
    expect(fresh.cpuPressure()).toBe('nominal');
    expect(fresh.networkQuality()).toBe(ConnectionQuality.Unknown);
  });
});
