/**
 * "Remove background noise" for what the VIEWER hears: the video's sound is
 * routed through RNNoise (an AudioWorklet) on its way to the speakers.
 * Whisper never hears this — it transcribes the original soundtrack, decoded
 * separately (noise removal before Whisper made accuracy worse on mobile).
 *
 * The sound reaches the speakers a few tens of ms later than the browser's
 * own video sound (Web Audio + RNNoise buffering), so voices trail the lips
 * slightly. Playing a hidden copy of the sound ahead to cancel that was tried
 * and dropped: keeping two players in step made the voice break up.
 *
 * Same idea as the AH-CRM app's playback option (ffmpeg `arnndn`, also
 * RNNoise), but live: nothing is re-encoded or saved.
 */
// Type-only: the library defines a class extending AudioWorkletNode, which
// doesn't exist during server rendering, so it's loaded on first use.
import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';

const BASE = 'assets/noise-suppressor/';

export class PlaybackDenoise {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private rnnoise: RnnoiseWorkletNode | null = null;
  private element: HTMLMediaElement | null = null;
  private on = false;
  /** Calls run one after another (a video can only be routed once). */
  private queue: Promise<void> = Promise.resolve();

  /**
   * Turn noise removal on/off for `video` (null = no video yet: just
   * remember it). Once a video is routed through Web Audio it stays routed;
   * "off" just bypasses RNNoise.
   */
  set(video: HTMLMediaElement | null, on: boolean): Promise<void> {
    this.on = on;
    const run = this.queue.then(async () => {
      if (!video || (!this.on && !this.source)) return; // plain element plays
      await this.attach(video);
      this.connect();
      this.resume(); // pending until a user gesture if there hasn't been one
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Delay noise removal adds to what you hear (ms), when on. */
  delayMs(): number | null {
    if (!this.on || !this.ctx || !this.source) return null;
    // Web Audio's own buffering + the output device + RNNoise's 10 ms frames.
    return Math.round(((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000 + 10);
  }

  /** Audio contexts start suspended until a user gesture: call on play. */
  resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  /** A new <video> element (new file): route it if noise removal is on. */
  elementChanged(video: HTMLMediaElement | null, on: boolean): Promise<void> {
    if (!video || video === this.element) return Promise.resolve();
    return this.set(video, on);
  }

  private async attach(video: HTMLMediaElement): Promise<void> {
    // RNNoise works on 48 kHz audio.
    this.ctx ??= new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    if (!this.rnnoise) {
      const { RnnoiseWorkletNode, loadRnnoise } = await import('@sapphi-red/web-noise-suppressor');
      const wasmBinary = await loadRnnoise({ url: BASE + 'rnnoise.wasm', simdUrl: BASE + 'rnnoise_simd.wasm' });
      await this.ctx.audioWorklet.addModule(BASE + 'rnnoise/workletProcessor.js');
      this.rnnoise = new RnnoiseWorkletNode(this.ctx, { wasmBinary, maxChannels: 2 });
      this.rnnoise.connect(this.ctx.destination);
    }
    if (this.element !== video) {
      this.source?.disconnect();
      this.source = this.ctx.createMediaElementSource(video);
      this.element = video;
    }
  }

  private connect(): void {
    if (!this.source || !this.ctx || !this.rnnoise) return;
    this.source.disconnect();
    this.source.connect(this.on ? this.rnnoise : this.ctx.destination);
  }

  dispose(): void {
    this.source?.disconnect();
    this.rnnoise?.disconnect();
    this.rnnoise?.destroy();
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.source = null;
    this.rnnoise = null;
    this.element = null;
  }
}
