import { Injectable, signal } from '@angular/core';
import { Room, VideoPresets, ConnectionQuality, VideoPreset, VideoQuality, VideoCaptureOptions, TrackPublishOptions, RoomOptions } from 'livekit-client';
// RemoteTrackPublication, Track removed — remote subscription caps moved to comments (full native approach)

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'minimal';

interface TierConfig {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
  simulcastLayers: VideoPreset[];
}

// A2: Custom 126p preset — fills gap between h90 (160×90) and h180 (320×180) for very small grid tiles
// Not in LiveKit standard VideoPresets; 224×126 is 16:9 at 126p
// VideoPreset constructor: (width, height, maxBitrate, maxFramerate?, priority?)
const v126 = new VideoPreset(224, 126, 80_000, 12);

const TIER_CONFIG: Record<QualityTier, TierConfig> = {
  // A2: ultra captures at 1280×720 — max simulcast layer is h720 so capturing above that wastes CPU
  // VP8 is software-encoded in Chrome; 1080p capture with 720p max layer = 4× extra pixels to scale down
  // was: { width: 1920, height: 1080, ... } — caused 12fps encoder bottleneck
  ultra:   { width: 1280, height: 720,  frameRate: 30, maxBitrate: 2_500_000, simulcastLayers: [v126, VideoPresets.h540, VideoPresets.h720] },
  // high uses standard recommended LiveKit set [h180, h360, h720]
  high:    { width: 1280, height: 720,  frameRate: 24, maxBitrate: 1_500_000, simulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720] },
  // Full native: medium now captures 720p so adaptiveStream can serve h720 to large tiles.
  // Bitrate kept at 1Mbps (below high's 1.5Mbps) to stay within moderate uplink budget.
  // medium was: { width: 640, height: 480, maxBitrate: 600_000, simulcastLayers: [h180, h360] }
  medium:  { width: 1280, height: 720,  frameRate: 20, maxBitrate: 1_000_000, simulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720] },
  // low: 640×360 source — gives receivers up to 360p; [h180, h360] avoids 720p encode CPU overhead
  // low was: { width: 480, height: 360, simulcastLayers: [v126, h180] }
  low:     { width: 640,  height: 360,  frameRate: 15, maxBitrate: 400_000,   simulcastLayers: [VideoPresets.h180, VideoPresets.h360] },
  // minimal: single layer only — absolute minimum CPU; was [v126]
  minimal: { width: 320,  height: 240,  frameRate: 12, maxBitrate: 200_000,   simulcastLayers: [v126, VideoPresets.h180] },
};

const TIER_ORDER: QualityTier[] = ['minimal', 'low', 'medium', 'high', 'ultra'];

// Thresholds
const DOWNGRADE_CHECKS = 3;       // was 2 — require 3 consecutive bad checks (~24s) before downgrading
const UPGRADE_CHECKS = 8;         // was 5 — require 8 consecutive good checks (~64s) before upgrading
const ULTRA_UPGRADE_CHECKS = 15;  // was 10
const FPS_DOWNGRADE_RATIO = 0.70;
const FPS_UPGRADE_RATIO = 0.85;
const DOWNGRADE_COOLDOWN_MS = 60_000; // was 30s — 60s cooldown prevents bouncing after downgrade
const CHECK_INTERVAL_MS = 8_000;  // was 3s — check every 8s to reduce getStats() call frequency

@Injectable({ providedIn: 'root' })
export class AdaptiveQualityService {

  // Reactive state
  readonly currentTier = signal<QualityTier>('medium');
  readonly cpuPressure = signal<string>('nominal');
  readonly networkQuality = signal<ConnectionQuality>(ConnectionQuality.Unknown);

  // Stability tracking
  private consecutiveGoodChecks = 0;
  private consecutiveBadChecks = 0;
  private lastDowngradeTime = 0;
  private monitoringStartTime = 0;
  private readonly WARMUP_MS = 45_000; // was 15s — extended to let Koala+blur stabilize before any tier change

  // Monitoring handles
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private pressureObserver: any = null;
  private room: Room | null = null;
  private rafHandle: number | null = null;
  private rafLastTime = 0;
  private rafSlowFrames = 0;
  private rafTotalFrames = 0;
  // M4: store visibilitychange handler reference so it can be removed in stopMonitoring()
  private visibilityChangeHandler: (() => void) | null = null;

  // ── Device detection & initial tier ────────────────────────────────────

  detectInitialQuality(): QualityTier {
    const cores = navigator.hardwareConcurrency || 2;
    const memory = (navigator as any).deviceMemory || 4;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const downlink = (navigator as any).connection?.downlink ?? 10; // Mbps

    console.log(`[AdaptiveQuality] Device: cores=${cores}, memory=${memory}GB, mobile=${isMobile}, downlink=${downlink}Mbps`);

    let tier: QualityTier;

    if (isMobile || cores <= 2 || memory <= 2) {
      tier = 'minimal';
    } else if (cores <= 4 || memory <= 4 || downlink < 1) {
      tier = 'low';
    } else if (cores <= 6 || downlink < 3) {
      tier = 'medium';
    } else if (cores <= 8 || downlink < 5) {
      tier = 'high';
    } else {
      tier = 'ultra';
    }

    this.currentTier.set(tier);
    const cfg = TIER_CONFIG[tier];
    console.log(`[AdaptiveQuality] Initial tier: ${tier} | ${cfg.width}x${cfg.height}@${cfg.frameRate}fps | ${cfg.maxBitrate / 1000}kbps`);
    return tier;
  }

  // ── Room & camera config builders ──────────────────────────────────────

  getRoomConfig(tier: QualityTier): RoomOptions {
    const cfg = TIER_CONFIG[tier];
    return {
      adaptiveStream: true,
      dynacast: true,
      reconnectPolicy: {
        nextRetryDelayInMs: (context: { retryCount: number }) => {
          const delays = [500, 1000, 2000, 4000, 8000];
          if (context.retryCount >= delays.length) return null as any;
          return delays[context.retryCount];
        },
      },
      publishDefaults: {
        videoCodec: 'vp8' as const,
        simulcast: true,
        videoSimulcastLayers: cfg.simulcastLayers,
        videoEncoding: {
          maxBitrate: cfg.maxBitrate,
          maxFramerate: cfg.frameRate,
        },
      },
    };
  }

  getCameraConstraints(tier: QualityTier): VideoCaptureOptions {
    const cfg = TIER_CONFIG[tier];
    return {
      deviceId: "frontcamera",
      facingMode: "user",
      resolution: {
        width: cfg.width,
        height: cfg.height,
        frameRate: cfg.frameRate,
      },
    };
  }

  // Returns explicit simulcast publish options for the given tier.
  // Pass this as the third argument to setCameraEnabled() so simulcast is not silently relying on publishDefaults.
  getPublishOptions(tier: QualityTier): TrackPublishOptions {
    const cfg = TIER_CONFIG[tier];
    return {
      videoCodec: 'vp8' as const,
      simulcast: true,                           // publish multiple spatial layers
      videoSimulcastLayers: cfg.simulcastLayers, // tier-appropriate layer set
      videoEncoding: {
        maxBitrate:   cfg.maxBitrate,
        maxFramerate: cfg.frameRate,
      },
    };
  }

  // ── Monitoring ─────────────────────────────────────────────────────────

  startMonitoring(room: Room): void {
    this.room = room;
    this.consecutiveGoodChecks = 0;
    this.consecutiveBadChecks = 0;
    this.monitoringStartTime = Date.now();

    // CPU pressure via Compute Pressure API (Chrome 125+)
    if (typeof (window as any).PressureObserver !== 'undefined') {
      try {
        this.pressureObserver = new (window as any).PressureObserver(
          (records: any[]) => {
            const latest = records[records.length - 1];
            this.cpuPressure.set(latest.state);
          },
          { sampleInterval: 1000 }
        );
        this.pressureObserver.observe('cpu');
        console.log('[AdaptiveQuality] CPU monitoring: Compute Pressure API');
      } catch {
        this.startRafFallback();
      }
    } else {
      this.startRafFallback();
    }

    // Track local participant network quality only — remote quality events also fire here
    // and the old listener captured the last-fired event which could be any participant.
    room.on('connectionQualityChanged' as any, (quality: ConnectionQuality, participant: any) => {
      if (participant?.identity === room.localParticipant.identity) {
        this.networkQuality.set(quality);
      }
    });

    // Periodic stability check — void handles the returned Promise from async stabilityCheck
    this.monitorInterval = setInterval(() => void this.stabilityCheck(), CHECK_INTERVAL_MS);
    console.log('[AdaptiveQuality] Monitoring started (dynacast: enabled)');
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    if (this.pressureObserver) {
      this.pressureObserver.unobserve('cpu');
      this.pressureObserver = null;
    }
    if (this.rafHandle != null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    // M4: remove visibilitychange listener to avoid memory leak
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
    this.room = null;
    console.log('[AdaptiveQuality] Monitoring stopped');
  }

  // ── Apply quality tier to live video track ─────────────────────────────

  async setQualityTier(tier: QualityTier): Promise<void> {
    const oldTier = this.currentTier();
    if (tier === oldTier) return;

    this.currentTier.set(tier);
    const cfg = TIER_CONFIG[tier];

    if (this.room) {
      // Apply constraints to the local camera track (controls outgoing bitrate)
      const cameraPub = Array.from(this.room.localParticipant.videoTracks.values())
        .find(pub => pub.source === 'camera');
      const rawTrack = cameraPub?.track?.mediaStreamTrack;
      if (rawTrack) {
        try {
          // applyConstraints: changes camera capture resolution/fps
          await rawTrack.applyConstraints({
            width:     { ideal: cfg.width, max: cfg.width },
            height:    { ideal: cfg.height, max: cfg.height },
            frameRate: { ideal: cfg.frameRate, max: cfg.frameRate },
          });
        } catch (err) {
          console.warn('[AdaptiveQuality] applyConstraints failed:', err);
        }
      }

      // Full native: setPublishingQuality() removed — calling it pauses higher simulcast layers for
      // ALL subscribers including those on strong networks, defeating the native approach.
      // Dynacast (dynacast: true) already pauses layers with no active subscribers automatically.
      // M6 was: livekitTrack.setPublishingQuality(pubQuality) — commented for reference:
      // const livekitTrack = cameraPub?.track as any;
      // if (typeof livekitTrack?.setPublishingQuality === 'function') {
      //   const pubQuality = tierIdx2 <= 1 ? VideoQuality.LOW : tierIdx2 === 2 ? VideoQuality.MEDIUM : VideoQuality.HIGH;
      //   await livekitTrack.setPublishingQuality(pubQuality);
      // }

      // Full native: remote subscription caps also removed — adaptiveStream handles layer selection
      // via ResizeObserver on each <video> element; SFU congestion control handles network constraints.
      // Calling setVideoQuality() on remote subscriptions would override adaptiveStream's automatic choice.
      // Previous code (setQualityTier remote caps) kept as comment for reference:
      // remoteMap?.forEach((participant: any) => {
      //   pubs.forEach((pub: RemoteTrackPublication) => {
      //     if (pub.source === Track.Source.Camera && pub.isSubscribed && pub.track) {
      //       pub.setVideoQuality(subQuality);
      //     }
      //   });
      // });
    }

    console.log(`✅ Quality: ${tier} | ${cfg.width}x${cfg.height}@${cfg.frameRate}fps | ${cfg.maxBitrate / 1000}kbps`);
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  private startRafFallback(): void {
    console.log('[AdaptiveQuality] CPU monitoring: rAF timing fallback');
    this.rafLastTime = performance.now();
    this.rafSlowFrames = 0;
    this.rafTotalFrames = 0;

    const tick = () => {
      const now = performance.now();
      const delta = now - this.rafLastTime;
      this.rafLastTime = now;
      this.rafTotalFrames++;
      if (delta > 50) this.rafSlowFrames++; // >50ms = stressed

      // Evaluate every ~60 frames
      if (this.rafTotalFrames >= 60) {
        const ratio = this.rafSlowFrames / this.rafTotalFrames;
        if (ratio > 0.5) this.cpuPressure.set('critical');
        else if (ratio > 0.3) this.cpuPressure.set('serious');
        else if (ratio > 0.15) this.cpuPressure.set('fair');
        else this.cpuPressure.set('nominal');
        this.rafSlowFrames = 0;
        this.rafTotalFrames = 0;
      }

      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);

    // M4: rAF pauses when the tab is hidden — add visibilitychange listener to pause/resume
    // Without this, CPU pressure signal freezes at last value when user switches tabs
    this.visibilityChangeHandler = () => {
      if (document.visibilityState === 'hidden') {
        // Tab backgrounded — cancel rAF so we don't get stale long-delta readings on resume
        if (this.rafHandle != null) {
          cancelAnimationFrame(this.rafHandle);
          this.rafHandle = null;
        }
        console.log('[AdaptiveQuality] Tab hidden — rAF paused, pressure held at last value');
      } else {
        // Tab foregrounded — reset counters and resume rAF measurement
        this.rafSlowFrames = 0;
        this.rafTotalFrames = 0;
        this.rafLastTime = performance.now();
        this.rafHandle = requestAnimationFrame(tick);
        console.log('[AdaptiveQuality] Tab visible — rAF resumed');
      }
    };
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  private async stabilityCheck(): Promise<void> {
    if (!this.room) return;

    const tier = this.currentTier();
    const cfg = TIER_CONFIG[tier];
    const cpu = this.cpuPressure();
    const net = this.networkQuality();

    // Get camera publication
    const cameraPub = Array.from(this.room.localParticipant.videoTracks.values())
      .find(pub => pub.source === 'camera');

    // M3: Read actual encoded fps from WebRTC outbound-rtp stats instead of getSettings().frameRate
    // getSettings().frameRate returns the REQUESTED constraint (always = cfg.frameRate), not actual output
    // const actualFps = cameraPub?.track?.mediaStreamTrack?.getSettings()?.frameRate ?? cfg.frameRate;
    let actualFps = cfg.frameRate; // default if stats unavailable
    const sender = (cameraPub?.track as any)?.sender as RTCRtpSender | undefined;
    if (sender) {
      try {
        const stats = await sender.getStats();
        // Simulcast produces multiple outbound-rtp video streams (one per spatial layer, e.g. v126@12fps,
        // h360@24fps, h720@30fps). Take the MAX so the 12fps v126 layer doesn't mask the 30fps h720 layer.
        let maxFps = 0;
        let hasVideoStats = false;
        stats.forEach((stat: any) => {
          if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
            hasVideoStats = true;
            // Use || not ?? — dynacast pauses encoding when no subscribers, giving framesPerSecond=0
            // which is valid pause state, not a failure; || treats 0 as "no data" and falls back to expected
            const layerFps = Math.round(stat.framesPerSecond || cfg.frameRate);
            if (layerFps > maxFps) maxFps = layerFps;
          }
        });
        if (hasVideoStats) actualFps = maxFps;
      } catch {
        // Stats unavailable — use config default
      }
    }

    const expectedFps = cfg.frameRate;
    const fpsRatio = actualFps / expectedFps;
    const fpsPercent = Math.round(fpsRatio * 100);

    const logLine = `📊 [${tier.toUpperCase()}] ${actualFps}/${expectedFps}fps (${fpsPercent}%) | CPU: ${cpu} | Net: ${ConnectionQuality[net] ?? net} | Stable: ${this.consecutiveGoodChecks}/${UPGRADE_CHECKS}`;
    console.log(logLine);
    // Playwright e2e: expose logs + last FPS on window for test assertions
    (window as any).__e2eLogs ??= [];
    (window as any).__e2eLogs.push(logLine);
    (window as any).__lastFps = actualFps;

    const cpuBad = cpu === 'critical' || cpu === 'serious';
    // Full native: FPS-based downgrade removed — dynacast pauses layers (framesPerSecond=0) which
    // is expected behaviour, not a real encode failure. CPU pressure is the correct downgrade signal.
    // const fpsBad = fpsRatio < FPS_DOWNGRADE_RATIO;
    // const fpsGood = fpsRatio >= FPS_UPGRADE_RATIO;
    const cpuGood = cpu === 'nominal';
    const netGood = net === ConnectionQuality.Good || net === ConnectionQuality.Excellent;
    const netExcellent = net === ConnectionQuality.Excellent;

    // ── Downgrade logic ──────────────────────────────────────────────────
    if (cpuBad) {
      this.consecutiveGoodChecks = 0;
      this.consecutiveBadChecks++;

      // Skip downgrade during warm-up so blur startup CPU spike doesn't trigger it
      const warmupElapsed = (Date.now() - this.monitoringStartTime) >= this.WARMUP_MS;
      if (this.consecutiveBadChecks >= DOWNGRADE_CHECKS && warmupElapsed) {
        this.downgrade(`CPU ${cpu}`);
        this.consecutiveBadChecks = 0;
      }
      return;
    }

    // ── Upgrade logic ────────────────────────────────────────────────────
    this.consecutiveBadChecks = 0;

    if (cpuGood && netGood) {
      this.consecutiveGoodChecks++;

      const cooldownElapsed = (Date.now() - this.lastDowngradeTime) >= DOWNGRADE_COOLDOWN_MS;
      if (!cooldownElapsed) return;

      const tierIdx = TIER_ORDER.indexOf(tier);

      // Ultra requires stricter threshold
      if (tierIdx < TIER_ORDER.length - 1) {
        const nextTier = TIER_ORDER[tierIdx + 1];
        const requiredChecks = nextTier === 'ultra'
          ? ULTRA_UPGRADE_CHECKS
          : UPGRADE_CHECKS;

        if (nextTier === 'ultra' && !netExcellent) return; // ultra needs Excellent network

        if (this.consecutiveGoodChecks >= requiredChecks) {
          const upgradeMsg = `⬆️ UPGRADE: ${tier} → ${nextTier}`;
          console.log(upgradeMsg);
          (window as any).__e2eLogs ??= []; (window as any).__e2eLogs.push(upgradeMsg);
          this.setQualityTier(nextTier);
          this.consecutiveGoodChecks = 0;
        }
      }
    } else {
      // Not bad enough to downgrade, but not good enough to increment
      this.consecutiveGoodChecks = 0;
    }
  }

  private downgrade(reason: string): void {
    const tier = this.currentTier();
    const tierIdx = TIER_ORDER.indexOf(tier);
    if (tierIdx <= 0) return; // already at minimal

    const newTier = TIER_ORDER[tierIdx - 1];
    const downgradeMsg = `⬇️ DOWNGRADE: ${tier} → ${newTier} (${reason})`;
    console.log(downgradeMsg);
    (window as any).__e2eLogs ??= []; (window as any).__e2eLogs.push(downgradeMsg);
    this.lastDowngradeTime = Date.now();
    this.setQualityTier(newTier);
  }
}
