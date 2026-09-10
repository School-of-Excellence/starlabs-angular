/* eslint-disable */
import type { RemoteTrack } from 'livekit-client';

/**
 * Closed-loop receiver jitter-buffer controller for a remote audio track.
 * Raises the playout target whenever the decoder has to conceal audio (late/jittered
 * packets), and eases it back down after clean seconds. Tuned from real India->Mumbai
 * logs where the default buffer underran (concealment with 0 packet loss).
 *
 * A/V SYNC (2026-07-18): the audio playout delay set here is NOT applied to video, so a
 * large audio buffer drifts audio behind video (lip-sync). Option 1: cap the ceiling lower
 * (JB_MAX) and ease down faster (fewer clean seconds, bigger decrement) to roughly halve
 * worst-case drift while keeping most of the anti-choppy benefit. JB_MAX is runtime-tunable
 * (setJitterMax) so the A/B test can compare the old 600 ms ceiling against the new one.
 */
let JB_MAX = 300;          // was 600 — Option 1 ceiling
const JB_MIN = 120;
const JB_START = 200;
const JB_UP = 60;          // bump on concealment
const JB_DOWN = 30;        // was 20 — ease down faster
const JB_CLEAN_STREAK = 2; // was 4 — ease down sooner

/** A/B knob: set the jitter ceiling at runtime (e.g. __lk.jitterMax(600) to compare). */
export function setJitterMax(ms: number): void {
  JB_MAX = Math.max(JB_MIN, Math.min(1000, Math.round(ms)));
  console.log(`[jitter] JB_MAX set to ${JB_MAX} ms`);
}
export function getJitterMax(): number { return JB_MAX; }

// Live per-track playout target (ms), keyed by track sid — read by audioDiag for the A/B.
export const jitterTargets = new Map<string, number>();

// getVideoTrack: optional accessor for the SAME participant's camera track. We hold the
// video to the same playout delay as the audio buffer so the browser renders them together
// (lip-sync). Without this, audio sits at the anti-choppy floor (~120 ms) while video plays
// at the browser default (~20 ms) → audio lags video by ~100 ms, uncompensated. Delaying
// video (not shrinking the audio buffer) fixes sync with ZERO risk to audio quality.
export function startJitterController(track: RemoteTrack, getVideoTrack?: () => RemoteTrack | undefined): () => void {
  let jbTarget = JB_START; // ms
  let concealStreak = 0;
  let lastConceal: number | null = null;
  let stopped = false;
  const sid = (track as any).sid || (track as any).mediaStreamID || String(Math.random());

  const setDelay = (t: any, ms: number) => {
    try { t?.setPlayoutDelay?.(ms / 1000); } catch {}
    try {
      const r = t?.receiver;
      if (r && 'jitterBufferTarget' in r) r.jitterBufferTarget = ms;
    } catch {}
  };

  const apply = () => {
    setDelay(track, jbTarget);
    // Mirror onto the paired camera track so video waits for audio → synced playout.
    const vt = getVideoTrack ? getVideoTrack() : undefined;
    if (vt) setDelay(vt, jbTarget);
  };
  apply();

  const timer = setInterval(async () => {
    if (stopped) return;
    try {
      const getStats = (track as any).getRTCStatsReport as undefined | (() => Promise<RTCStatsReport>);
      const rep: any = getStats ? await getStats.call(track) : undefined;
      let inb: any = null;
      rep?.forEach((s: any) => {
        if (s && s.type === 'inbound-rtp') inb = s;
      });
      let concealMs = 0;
      if (inb && typeof inb.concealedSamples === 'number') {
        if (lastConceal != null) concealMs = (inb.concealedSamples - lastConceal) / 48;
        lastConceal = inb.concealedSamples;
      }
      if (concealMs > 5) {
        jbTarget = Math.min(JB_MAX, jbTarget + JB_UP);
        concealStreak = 0;
      } else if (++concealStreak >= JB_CLEAN_STREAK) {
        jbTarget = Math.max(JB_MIN, jbTarget - JB_DOWN);
        concealStreak = 0;
      }
      // Re-clamp in case JB_MAX was lowered at runtime (A/B) below the current target.
      if (jbTarget > JB_MAX) jbTarget = JB_MAX;
      jitterTargets.set(sid, jbTarget);
      apply();
    } catch {}
  }, 1000);

  return () => {
    stopped = true;
    clearInterval(timer);
    jitterTargets.delete(sid);
  };
}
