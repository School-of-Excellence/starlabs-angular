/**
 * Microphone → phrases for Whisper, for live camera mode.
 *
 * The mic is captured at its own rate (an AudioWorklet) and converted to
 * 16 kHz mono here — some Chrome versions refuse to connect a microphone to
 * a 16 kHz audio context. A simple voice
 * detector (loudness above an adaptive noise floor, per 20 ms frame) cuts
 * the sound into phrases: a phrase ends after a short pause, or is cut at
 * {@link MAX_PHRASE_MS} so captions keep flowing during long speeches. Only
 * the last {@link KEEP_MS} of audio is kept in memory; nothing is saved.
 *
 * Times are in ms since capture started, counted in audio samples — the
 * clock the rest of live mode (faces, captions) uses.
 */

const RATE = 16000;
const FRAME = 320; // 20 ms
const FRAME_MS = 20;
/** A phrase ends after this much silence… */
const END_SILENCE_MS = 700;
/**
 * …but a phrase with less speech than this waits (up to {@link HOLD_SILENCE_MS}
 * of silence) for more: Whisper guesses wildly on one-word clips.
 */
const MIN_SPEECH_TO_SEND_MS = 1500;
const HOLD_SILENCE_MS = 2000;
/** …or is cut when it gets this long. */
const MAX_PHRASE_MS = 10000;
/** Phrases shorter than this (a cough, a click) are dropped. */
const MIN_PHRASE_MS = 500;
/** Sound kept before the first voiced frame (soft word starts). */
const PRE_ROLL_MS = 250;
/** …and after the last one. */
const POST_ROLL_MS = 200;
/** Voiced frames in a row that count as speech starting (not a click). */
const START_FRAMES = 3;
/**
 * Audio kept: enough for a 28 s background pass to be cut from it even when
 * the page's timers are slowed (tab in the background).
 */
const KEEP_MS = 120000;
/** Frames kept for the live waveform (20 ms each → 2.4 s). */
export const WAVE_FRAMES = 120;
/** The noise floor is the quiet level (10th percentile) of the last… */
const FLOOR_WINDOW_FRAMES = 250; // 5 s
/** Frames below this are digital silence (mic starting up), not room noise. */
const SILENCE_DB = -100;
/** Speech is this far above the floor… */
const VOICE_OVER_FLOOR_DB = 10;
/** …and at least this loud (quiet laptop mics sit well below normal levels). */
const MIN_VOICE_DB = -65;
/** Speech is brought up to about this RMS level for Whisper (≈ −22 dBFS)… */
const TARGET_RMS = 0.08;
/** …boosting at most this much (more would mostly amplify room noise). */
const MAX_GAIN = 8;

const WORKLET = `
class LvsCapture extends AudioWorkletProcessor {
  process(inputs) {
    // No input (a track sending nothing for a while) counts as silence, so
    // the live clock keeps real time — recordings' subtitles are timed by it.
    const ch = inputs[0] && inputs[0][0];
    this.port.postMessage(ch ? ch.slice(0) : new Float32Array(128));
    return true;
  }
}
registerProcessor('lvs-capture', LvsCapture);
`;

export interface Phrase {
  pcm: Float32Array;
  startMs: number;
  endMs: number;
  /** How far the speech stands above the room noise (dB). */
  snrDb: number;
  /** Milliseconds of actual speech in it. */
  speechMs: number;
}

export class LiveAudio {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  // Ring buffer of the last KEEP_MS of samples, by absolute sample index.
  private ring = new Float32Array((RATE * KEEP_MS) / 1000);
  private written = 0;
  // Voice detection.
  private frame = new Float32Array(FRAME);
  private frameFill = 0;
  private prev = 0;
  private floor = -60;
  private recent: number[] = [];
  private run = 0;
  private speaking = false;
  private phraseStart = 0; // sample index
  private lastVoice = 0; // sample index
  private voicedFrames = 0;
  private voicedDbSum = 0;

  /** Voice heard in the last frame (for the "listening" light). */
  voiced = false;
  /**
   * The last {@link WAVE_FRAMES} frames' level (dB) and whether each was
   * speech — drawn as the live mic waveform. `wavePos` is the next slot.
   */
  readonly waveDb = new Float32Array(WAVE_FRAMES).fill(-100);
  readonly waveVoiced = new Uint8Array(WAVE_FRAMES);
  wavePos = 0;
  /** Diagnostics: last frame's level and the noise floor (dB), phrases cut. */
  levelDb = -100;
  floorDb = -100;
  phrases = 0;
  // Resampling to 16 kHz: input samples per output sample, and position.
  private step = 1;
  private pos = 0;
  private acc = 0;
  private accN = 0;

  constructor(private readonly onPhrase: (p: Phrase) => void) {}

  /**
   * Create the audio context. Call this straight from the click that starts
   * the camera — browsers only let audio start right after a user action,
   * and the camera/mic permission prompt uses that moment up.
   */
  prepare(): void {
    this.ctx ??= new AudioContext();
    this.ctx.resume().catch(() => undefined);
  }

  /** Diagnostics: the audio context's state and rate ('none' before start). */
  get stateText(): string {
    return this.ctx ? `${this.ctx.state} at ${this.ctx.sampleRate / 1000} kHz` : 'none';
  }

  /** The browser is still holding audio back (it needs a click on the page). */
  get suspended(): boolean {
    return this.ctx?.state === 'suspended';
  }

  /** Try again to start audio (call from any user click). */
  resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  /** Milliseconds since speech was last heard (Infinity before any). */
  msSinceVoice(): number {
    return this.lastVoice ? ((this.written - this.lastVoice) / RATE) * 1000 : Infinity;
  }

  /** Milliseconds of audio captured so far — the live clock. */
  clockMs(): number {
    return (this.written / RATE) * 1000;
  }

  async start(stream: MediaStream): Promise<void> {
    this.prepare();
    const ctx = this.ctx!;
    this.step = ctx.sampleRate / RATE;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    this.source = ctx.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(ctx, 'lvs-capture');
    this.node.port.onmessage = ({ data }) => this.resample(data as Float32Array);
    this.source.connect(this.node);
    // Keep the graph pulling without playing anything back (no echo).
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(ctx.destination);
    // Not awaited: if the browser holds audio back, resume() on a later
    // click releases it (awaiting here would wait forever).
    this.resume();
  }

  /** Mic-rate samples → 16 kHz (box average over each output sample: a cheap low-pass). */
  private resample(chunk: Float32Array): void {
    if (this.step === 1) return this.push(chunk);
    const out: number[] = [];
    for (let i = 0; i < chunk.length; i++) {
      this.acc += chunk[i];
      this.accN++;
      this.pos += 1;
      if (this.pos >= this.step) {
        this.pos -= this.step;
        out.push(this.acc / this.accN);
        this.acc = 0;
        this.accN = 0;
      }
    }
    if (out.length) this.push(Float32Array.from(out));
  }

  /**
   * Send the phrase in progress now (cut where it is) and carry on listening —
   * used when a recording stops, so its last words go straight to Whisper.
   */
  flush(): void {
    if (!this.speaking) return;
    this.emit(this.written);
    this.phraseStart = this.written;
    this.voicedFrames = 0;
    this.voicedDbSum = 0;
  }

  /** Stop capturing; a phrase in progress is sent as it is. */
  stop(): void {
    if (this.speaking) this.emit(this.written);
    this.speaking = false;
    this.node?.port.close();
    this.node?.disconnect();
    this.source?.disconnect();
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.node = null;
    this.source = null;
  }

  private push(chunk: Float32Array): void {
    for (let i = 0; i < chunk.length; i++) {
      this.ring[this.written % this.ring.length] = chunk[i];
      this.written++;
      this.frame[this.frameFill++] = chunk[i];
      if (this.frameFill === FRAME) {
        this.frameFill = 0;
        this.onFrame();
      }
    }
  }

  private onFrame(): void {
    let sum = 0;
    for (let i = 0; i < FRAME; i++) {
      const x = this.frame[i] - 0.97 * this.prev; // pre-emphasis: ignore rumble
      this.prev = this.frame[i];
      sum += x * x;
    }
    const db = 20 * Math.log10(Math.sqrt(sum / FRAME) + 1e-9);
    this.levelDb = db;
    // Noise floor: the quiet level of the last few seconds (a percentile,
    // so it follows the room both ways), ignoring digital silence.
    if (db > SILENCE_DB) {
      this.recent.push(db);
      if (this.recent.length > FLOOR_WINDOW_FRAMES) this.recent.shift();
      if (this.recent.length >= 25) {
        const sorted = [...this.recent].sort((x, y) => x - y);
        this.floor = sorted[Math.floor(sorted.length * 0.1)];
      }
    }
    this.floorDb = this.floor;
    // No decisions until the floor has ~0.5 s of room sound to go on.
    const voiced = this.recent.length >= 25 && db > Math.max(this.floor + VOICE_OVER_FLOOR_DB, MIN_VOICE_DB);
    this.voiced = voiced;
    this.waveDb[this.wavePos] = db;
    this.waveVoiced[this.wavePos] = voiced ? 1 : 0;
    this.wavePos = (this.wavePos + 1) % WAVE_FRAMES;
    const now = this.written;
    if (voiced) {
      this.run++;
      this.lastVoice = now;
      if (this.speaking) {
        this.voicedFrames++;
        this.voicedDbSum += db - this.floor;
      }
      if (!this.speaking && this.run >= START_FRAMES) {
        this.speaking = true;
        this.voicedFrames = this.run;
        this.voicedDbSum = (db - this.floor) * this.run;
        const start = now - (START_FRAMES * FRAME_MS + PRE_ROLL_MS) * (RATE / 1000);
        this.phraseStart = Math.max(start, this.written - this.ring.length, 0);
      }
    } else {
      this.run = 0;
    }
    if (!this.speaking) return;
    const ms = (n: number) => (n / RATE) * 1000;
    const silence = ms(now - this.lastVoice);
    const speechMs = this.voicedFrames * FRAME_MS;
    if (silence >= END_SILENCE_MS && (speechMs >= MIN_SPEECH_TO_SEND_MS || silence >= HOLD_SILENCE_MS)) {
      this.emit(Math.min(now, this.lastVoice + (POST_ROLL_MS * RATE) / 1000));
      this.speaking = false;
    } else if (ms(now - this.phraseStart) >= MAX_PHRASE_MS) {
      this.emit(now);
      this.phraseStart = now;
      this.voicedFrames = 0;
      this.voicedDbSum = 0;
    }
  }

  /** Earliest live time (ms) still kept. */
  keptFromMs(): number {
    return (Math.max(0, this.written - this.ring.length) / RATE) * 1000;
  }

  /**
   * Audio between two live times (ms), if it's still kept — used to send
   * several waiting phrases to Whisper as one stretch.
   */
  slice(startMs: number, endMs: number): Float32Array | null {
    const s = Math.round((startMs / 1000) * RATE);
    const e = Math.round((endMs / 1000) * RATE);
    if (s < this.written - this.ring.length || e > this.written || e <= s) return null;
    const out = new Float32Array(e - s);
    for (let i = s; i < e; i++) out[i - s] = this.ring[i % this.ring.length];
    return out;
  }

  private emit(end: number): void {
    const start = this.phraseStart;
    if (((end - start) / RATE) * 1000 < MIN_PHRASE_MS) return;
    this.phrases++;
    const pcm = new Float32Array(end - start);
    for (let i = start; i < end; i++) pcm[i - start] = this.ring[i % this.ring.length];
    const snrDb = this.voicedFrames ? this.voicedDbSum / this.voicedFrames : 0;
    this.onPhrase({
      pcm,
      startMs: (start / RATE) * 1000,
      endMs: (end / RATE) * 1000,
      snrDb,
      speechMs: this.voicedFrames * FRAME_MS,
    });
  }
}

/**
 * Bring a phrase up to a normal speaking level for Whisper. Whisper reads
 * loudness as a cue: quiet laptop-mic speech (−45…−60 dB) came back as
 * "[BLANK_AUDIO]" or fragments. Gain is set from the louder half of the
 * 20 ms frames (the speech, not the pauses) and never clips.
 */
export function normalizeForWhisper(pcm: Float32Array): Float32Array {
  const n = 320;
  const energies: number[] = [];
  let peak = 0;
  for (let f = 0; f + n <= pcm.length; f += n) {
    let s = 0;
    for (let i = f; i < f + n; i++) {
      s += pcm[i] * pcm[i];
      const a = Math.abs(pcm[i]);
      if (a > peak) peak = a;
    }
    energies.push(s / n);
  }
  if (!energies.length || peak === 0) return pcm;
  energies.sort((x, y) => y - x);
  const loud = energies.slice(0, Math.max(1, Math.floor(energies.length / 2)));
  const rms = Math.sqrt(loud.reduce((x, y) => x + y, 0) / loud.length);
  const gain = Math.min(MAX_GAIN, TARGET_RMS / (rms || 1e-9), 0.95 / peak);
  if (gain <= 1.05) return pcm;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * gain;
  return out;
}

/**
 * Whisper's loops and sound tags, cleaned:
 * - "*Burps*", "(laughing)", "[Music]", "♪" → removed;
 * - "Okay. Okay. Okay." → "Okay." (a repeated sentence);
 * - "of the bottom of the bottom of the bottom" → once (a phrase of 2–6
 *   words repeated 3+ times in a row; a single word only at 5+, since people
 *   do say "no, no, no, no").
 */
export function collapseRepeats(text: string): string {
  let t = text.replace(/\*[^*]*\*|\[[^\]]*\]|\([^)]*\)|♪/g, ' ').replace(/\s+/g, ' ').trim();
  // Repeated sentences.
  const parts = t.split(/(?<=[.?!])\s+/);
  const kept: string[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  for (const p of parts) {
    if (kept.length && norm(p) && norm(p) === norm(kept[kept.length - 1])) continue;
    kept.push(p);
  }
  // Repeated phrases inside a sentence.
  const words = kept.join(' ').split(' ');
  const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
  for (let n = 6; n >= 1; n--) {
    for (let i = 0; i + 3 * n <= words.length; i++) {
      let reps = 1;
      while (i + (reps + 1) * n <= words.length) {
        let same = true;
        for (let k = 0; k < n && same; k++) same = key(words[i + k]) === key(words[i + reps * n + k]);
        if (!same) break;
        reps++;
      }
      // Single words repeat for real ("no, no, no, no"): only 5+ is a loop.
      if (reps >= (n === 1 ? 5 : 3)) words.splice(i + n, (reps - 1) * n);
    }
  }
  return words.join(' ').trim();
}

/** What Whisper says when it hears near-silence or noise (not real speech). */
const FILLERS = new Set([
  'thank you', 'thanks', 'thank you very much', 'thank you so much', 'bye', 'bye bye', 'you',
  'thanks for watching', 'thank you for watching', 'please subscribe', 'subscribe',
  "i'm back with another video",
]);

/**
 * A known filler hallucination, from a short or barely-audible phrase —
 * dropped instead of captioned. (Real "Thank you." from clear, longer
 * speech is kept.)
 */
export function isFillerHallucination(text: string, p: { speechMs: number; snrDb: number }): boolean {
  const key = text.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  return FILLERS.has(key) && (p.speechMs < 1500 || p.snrDb < 15);
}
