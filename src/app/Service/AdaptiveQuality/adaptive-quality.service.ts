import { Injectable, signal } from '@angular/core';
import { Room, VideoPresets, ConnectionQuality, VideoPreset } from 'livekit-client';

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'minimal';

interface TierConfig {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
  simulcastLayers: VideoPreset[];
}

const TIER_CONFIG: Record<QualityTier, TierConfig> = {
  ultra:   { width: 1920, height: 1080, frameRate: 30, maxBitrate: 2_500_000, simulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720] },
  high:    { width: 1280, height: 720,  frameRate: 24, maxBitrate: 1_500_000, simulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720] },
  medium:  { width: 640,  height: 480,  frameRate: 20, maxBitrate: 600_000,   simulcastLayers: [VideoPresets.h90, VideoPresets.h180] },
  low:     { width: 480,  height: 360,  frameRate: 15, maxBitrate: 400_000,   simulcastLayers: [VideoPresets.h90, VideoPresets.h180] },
  minimal: { width: 320,  height: 240,  frameRate: 12, maxBitrate: 200_000,   simulcastLayers: [VideoPresets.h90] },
};

const TIER_ORDER: QualityTier[] = ['minimal', 'low', 'medium', 'high', 'ultra'];

// Thresholds
const DOWNGRADE_CHECKS = 2;
const UPGRADE_CHECKS = 5;
const ULTRA_UPGRADE_CHECKS = 10;
const FPS_DOWNGRADE_RATIO = 0.70;
const FPS_UPGRADE_RATIO = 0.85;
const DOWNGRADE_COOLDOWN_MS = 30_000;
const CHECK_INTERVAL_MS = 3_000;

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

  // Monitoring handles
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private pressureObserver: any = null;
  private room: Room | null = null;
  private rafHandle: number | null = null;
  private rafLastTime = 0;
  private rafSlowFrames = 0;
  private rafTotalFrames = 0;

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

  getRoomConfig(tier: QualityTier) {
    const cfg = TIER_CONFIG[tier];
    return {
      adaptiveStream: {
        pixelDensity: 'screen' as const,
        pauseVideoInBackground: true,
      },
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

  getCameraConstraints(tier: QualityTier) {
    const cfg = TIER_CONFIG[tier];
    return {
      resolution: {
        width: cfg.width,
        height: cfg.height,
        frameRate: cfg.frameRate,
      },
    };
  }

  // ── Monitoring ─────────────────────────────────────────────────────────

  startMonitoring(room: Room): void {
    this.room = room;
    this.consecutiveGoodChecks = 0;
    this.consecutiveBadChecks = 0;

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

    // Network quality from LiveKit
    room.on('connectionQualityChanged' as any, (quality: ConnectionQuality) => {
      this.networkQuality.set(quality);
    });

    // Periodic stability check
    this.monitorInterval = setInterval(() => this.stabilityCheck(), CHECK_INTERVAL_MS);
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
    this.room = null;
    console.log('[AdaptiveQuality] Monitoring stopped');
  }

  // ── Apply quality tier to live video track ─────────────────────────────

  async setQualityTier(tier: QualityTier): Promise<void> {
    const oldTier = this.currentTier();
    if (tier === oldTier) return;

    this.currentTier.set(tier);
    const cfg = TIER_CONFIG[tier];

    // Apply constraints to the active camera track
    if (this.room) {
      const cameraPub = Array.from(this.room.localParticipant.videoTracks.values())
        .find(pub => pub.source === 'camera');
      const rawTrack = cameraPub?.track?.mediaStreamTrack;
      if (rawTrack) {
        try {
          await rawTrack.applyConstraints({
            width:     { ideal: cfg.width, max: cfg.width },
            height:    { ideal: cfg.height, max: cfg.height },
            frameRate: { ideal: cfg.frameRate, max: cfg.frameRate },
          });
        } catch (err) {
          console.warn('[AdaptiveQuality] applyConstraints failed:', err);
        }
      }
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
  }

  private stabilityCheck(): void {
    if (!this.room) return;

    const tier = this.currentTier();
    const cfg = TIER_CONFIG[tier];
    const cpu = this.cpuPressure();
    const net = this.networkQuality();

    // Get actual FPS from camera track
    const cameraPub = Array.from(this.room.localParticipant.videoTracks.values())
      .find(pub => pub.source === 'camera');
    const actualFps = cameraPub?.track?.mediaStreamTrack?.getSettings()?.frameRate ?? cfg.frameRate;
    const expectedFps = cfg.frameRate;
    const fpsRatio = actualFps / expectedFps;
    const fpsPercent = Math.round(fpsRatio * 100);

    console.log(
      `📊 [${tier.toUpperCase()}] ${actualFps}/${expectedFps}fps (${fpsPercent}%) | CPU: ${cpu} | Net: ${ConnectionQuality[net] ?? net} | Stable: ${this.consecutiveGoodChecks}/${UPGRADE_CHECKS}`
    );

    const cpuBad = cpu === 'critical' || cpu === 'serious';
    const fpsBad = fpsRatio < FPS_DOWNGRADE_RATIO;
    const fpsGood = fpsRatio >= FPS_UPGRADE_RATIO;
    const cpuGood = cpu === 'nominal';
    const netGood = net === ConnectionQuality.Good || net === ConnectionQuality.Excellent;
    const netExcellent = net === ConnectionQuality.Excellent;

    // ── Downgrade logic ──────────────────────────────────────────────────
    if (cpuBad || fpsBad) {
      this.consecutiveGoodChecks = 0;
      this.consecutiveBadChecks++;

      if (this.consecutiveBadChecks >= DOWNGRADE_CHECKS) {
        const reason = cpuBad ? `CPU ${cpu}` : `FPS drop ${fpsPercent}%`;
        this.downgrade(reason);
        this.consecutiveBadChecks = 0;
      }
      return;
    }

    // ── Upgrade logic ────────────────────────────────────────────────────
    this.consecutiveBadChecks = 0;

    if (fpsGood && cpuGood && netGood) {
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
          console.log(`⬆️ UPGRADE: ${tier} → ${nextTier}`);
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
    console.log(`⬇️ DOWNGRADE: ${tier} → ${newTier} (${reason})`);
    this.lastDowngradeTime = Date.now();
    this.setQualityTier(newTier);
  }
}
