/**
 * Caption shaping and timing for live video subtitles. Pure functions (no
 * Angular, no DOM) — ported from the AH-CRM mobile app, where these rules
 * were tuned on a real 15-minute hall recording.
 */

/** One transcribed stretch of speech, in video time (ms). */
export interface SpeechSegment {
  startMs: number;
  endMs: number;
  text: string;
}

/** Captions longer than this are split (one caption ≈ one speaker turn). */
const CAPTION_MAX_MS = 4000;

/**
 * Turn Whisper's sentence-level segments into captions: strip non-speech
 * tags ("[Music]", "(applause)"), drop empty ones, and split any segment
 * longer than {@link CAPTION_MAX_MS} at sentence/comma boundaries (else
 * between words), sharing its time out by text length.
 *
 * (Per-word timestamps were tried on mobile and rejected: their timing
 * jitters and chops phrases into "Thank" / "you very" / "much.")
 */
export function shapeCaptions(segments: SpeechSegment[]): SpeechSegment[] {
  const out: SpeechSegment[] = [];
  for (const s of segments) {
    const text = s.text
      .replace(/\[[^\]]*\]|\([^)]*\)|♪|\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || !/\w/.test(text)) continue;
    const start = s.startMs;
    const end = Math.max(s.endMs, s.startMs + 300);
    const dur = end - start;
    if (dur <= CAPTION_MAX_MS) {
      out.push({ startMs: start, endMs: end, text });
      continue;
    }
    const chunks = splitText(text, Math.ceil(dur / CAPTION_MAX_MS));
    const totalChars = chunks.reduce((a, c) => a + c.length, 0);
    let t = start;
    chunks.forEach((c, i) => {
      const share = (dur * c.length) / totalChars;
      const ce = i === chunks.length - 1 ? end : Math.round(t + share);
      out.push({ startMs: Math.round(t), endMs: ce, text: c });
      t += share;
    });
  }
  return out;
}

/**
 * Split text into about `pieces` similar-length chunks, preferring to cut
 * after sentence ends, then commas, then any word.
 */
export function splitText(text: string, pieces: number): string[] {
  const words = text.split(' ');
  if (pieces <= 1 || words.length < 2) return [text];
  const target = text.length / pieces;
  const out: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    curLen += w.length + 1;
    const remaining = words.length - i - 1;
    if (remaining === 0 || out.length === pieces - 1) continue;
    const strong = /[.?!]$/.test(w);
    const soft = /[,;:]$/.test(w);
    if (
      (strong && curLen >= target * 0.5) ||
      (soft && curLen >= target * 0.8) ||
      curLen >= target * 1.3
    ) {
      out.push(cur.join(' '));
      cur = [];
      curLen = 0;
    }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

export const VOICE_FRAME_MS = 20;

/**
 * Voice activity per {@link VOICE_FRAME_MS} frame of 16 kHz mono audio, from
 * loudness: a frame is voiced when it's well above the quiet floor of the
 * window. A pre-emphasis filter first removes rumble, which otherwise hides
 * speech onsets in hall recordings.
 */
export function voiceFrames(pcm: Float32Array): boolean[] {
  const n = 16 * VOICE_FRAME_MS;
  const count = Math.floor(pcm.length / n);
  if (count === 0) return [];
  const db = new Float64Array(count);
  let prev = 0;
  for (let f = 0; f < count; f++) {
    let sum = 0;
    for (let i = f * n; i < (f + 1) * n; i++) {
      const x = pcm[i] - 0.97 * prev; // pre-emphasis
      prev = pcm[i];
      sum += x * x;
    }
    db[f] = 20 * Math.log10(Math.sqrt(sum / n) + 1e-9);
  }
  const sorted = Array.from(db).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)];
  const threshold = Math.max(floor + 12, -50);
  return Array.from(db, (d) => d > threshold);
}

/**
 * Tighten a caption to where speech actually is inside it. Whisper's
 * segment times are "sticky" — a segment often starts where the previous
 * one ended, silence included — which made captions appear before the
 * person spoke. `windowStartMs` is the video time of frame 0 of `voiced`.
 */
export function trimToVoice(
  s: SpeechSegment,
  voiced: boolean[],
  windowStartMs: number,
): SpeechSegment {
  if (!voiced.length) return s;
  const frame = (ms: number) =>
    Math.min(voiced.length, Math.max(0, Math.floor((ms - windowStartMs) / VOICE_FRAME_MS)));
  const a = frame(s.startMs);
  const b = frame(s.endMs);
  let first = -1;
  for (let i = a; i + 2 < b; i++) {
    if (voiced[i] && voiced[i + 1] && voiced[i + 2]) {
      first = i; // ≥ 60 ms of voice, not a click
      break;
    }
  }
  if (first < 0) return s;
  let last = first;
  for (let i = b - 1; i >= first; i--) {
    if (voiced[i]) {
      last = i;
      break;
    }
  }
  const start = Math.max(s.startMs, windowStartMs + first * VOICE_FRAME_MS - 100);
  const end = Math.min(s.endMs, windowStartMs + (last + 1) * VOICE_FRAME_MS + 150);
  if (end - start < 300) return s;
  return { startMs: start, endMs: end, text: s.text };
}

/** Merged [start, end) ranges helpers: first time ≥ `from` not covered. */
export function nextUndone(ranges: [number, number][], from: number): number {
  let p = from;
  let moved = true;
  while (moved) {
    moved = false;
    for (const [s, e] of ranges) {
      if (s <= p && p < e) {
        p = e;
        moved = true;
      }
    }
  }
  return p;
}

/** Add [s, e) to `ranges` (kept sorted and merged, in place). */
export function markDone(ranges: [number, number][], s: number, e: number): void {
  ranges.push([s, e]);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  ranges.length = 0;
  ranges.push(...merged);
}
