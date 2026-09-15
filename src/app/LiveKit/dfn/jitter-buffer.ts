/* eslint-disable */
import type { RemoteTrack } from 'livekit-client';

/**
 * Closed-loop receiver jitter-buffer controller for a remote audio track.
 * Exact port of the videoconference meet `jitterBuffer.ts`. Raises the playout
 * target whenever the decoder has to conceal audio (late/jittered packets), and
 * eases it back down after several clean seconds. Tuned from real India->Mumbai
 * logs where the default buffer underran (concealment with 0 packet loss).
 */
export function startJitterController(track: RemoteTrack): () => void {
  let jbTarget = 200; // ms
  let concealStreak = 0;
  let lastConceal: number | null = null;
  let stopped = false;

  const apply = () => {
    try {
      (track as unknown as { setPlayoutDelay?: (s: number) => void }).setPlayoutDelay?.(jbTarget / 1000);
    } catch {}
    try {
      const r = (track as unknown as { receiver?: RTCRtpReceiver }).receiver;
      if (r && 'jitterBufferTarget' in r) (r as unknown as { jitterBufferTarget: number }).jitterBufferTarget = jbTarget;
    } catch {}
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
        jbTarget = Math.min(600, jbTarget + 60);
        concealStreak = 0;
      } else if (++concealStreak >= 4) {
        jbTarget = Math.max(120, jbTarget - 20);
        concealStreak = 0;
      }
      apply();
    } catch {}
  }, 1000);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
