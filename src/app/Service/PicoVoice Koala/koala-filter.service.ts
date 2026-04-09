import { Injectable } from '@angular/core';
import { Koala } from '@picovoice/koala-web';

const MODEL_URL =
  'https://raw.githubusercontent.com/Picovoice/koala/main/lib/common/koala_params.pv';

@Injectable({ providedIn: 'root' })
export class KoalaFilterService {
  private koala: Koala | null = null;

  // Input capture pipeline
  private inputCtx: AudioContext | null = null;
  private captureNode: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  // Live-playback pipeline
  private playbackCtx: AudioContext | null = null;
  private playbackNextTime = 0;
  private playbackTick: ReturnType<typeof setInterval> | null = null;
  private playbackQueue: number[] = [];

  // Recording state
  private isCollecting = false;
  private collectedFrames: Int16Array[] = [];

  // Energy accumulators (raw + clean)
  private rawEnergyAcc = 0;
  private rawEnergySamples = 0;
  private cleanEnergyAcc = 0;
  private cleanEnergySamples = 0;

  // Public metrics (set after init / startCapture)
  initTimeMs = 0;
  captureSetupMs = 0;
  delaySampleMs = 0;

  get sampleRate(): number { return this.koala?.sampleRate ?? 16000; }
  get frameLength(): number { return this.koala?.frameLength ?? 512; }

  // ── Init ─────────────────────────────────────────────────────────────────

  async init(accessKey: string): Promise<boolean> {
    try {
      const t0 = performance.now();

      // Fetch model from Picovoice GitHub (public, no auth needed)
      const res = await fetch(MODEL_URL);
      if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);
      const base64 = this.bufferToBase64(await res.arrayBuffer());

      this.koala = await Koala.create(
        accessKey,
        (enhanced: Int16Array) => this.onProcessed(enhanced),
        { base64 }
      );

      this.delaySampleMs = Math.round(
        (this.koala.delaySample / this.koala.sampleRate) * 1000
      );
      this.initTimeMs = Math.round(performance.now() - t0);
      console.log(
        `✅ Koala ready — init: ${this.initTimeMs}ms, delay: ${this.delaySampleMs}ms`
      );
      return true;

    } catch (err) {
      console.error('❌ Koala init failed:', err);
      return false;
    }
  }

  // ── Capture ───────────────────────────────────────────────────────────────

  /**
   * Wire the raw mic MediaStream into Koala.
   * The browser auto-resamples 48 kHz → 16 kHz when the AudioContext
   * is created at 16 kHz, so no manual resampling is needed.
   */
  startCapture(rawStream: MediaStream): void {
    const t0 = performance.now();

    this.inputCtx = new AudioContext({ sampleRate: this.sampleRate });
    this.micSource = this.inputCtx.createMediaStreamSource(rawStream);

    const fl = this.frameLength;
    this.captureNode = this.inputCtx.createScriptProcessor(fl, 1, 1);

    // Queue-based async drain — keeps frames in order without blocking the
    // audio thread (ScriptProcessorNode fires synchronously but process() is async)
    const pending: Int16Array[] = [];
    let draining = false;

    const drain = async () => {
      if (draining || !this.koala) return;
      draining = true;
      while (pending.length > 0) {
        await this.koala.process(pending.shift()!);
      }
      draining = false;
    };

    this.captureNode.onaudioprocess = (ev) => {
      const float32 = ev.inputBuffer.getChannelData(0);

      // Accumulate raw energy while recording
      if (this.isCollecting) {
        for (const s of float32) {
          this.rawEnergyAcc += s * s;
          this.rawEnergySamples++;
        }
      }

      pending.push(this.float32ToInt16(float32.slice(0, fl)));
      drain();
    };

    // Silent connection is required for onaudioprocess to fire in Chrome
    const silence = this.inputCtx.createGain();
    silence.gain.value = 0;
    this.micSource.connect(this.captureNode);
    this.captureNode.connect(silence);
    silence.connect(this.inputCtx.destination);

    this.captureSetupMs = Math.round(performance.now() - t0);
  }

  stopCapture(): void {
    try { this.captureNode?.disconnect(); } catch (_) {}
    try { this.micSource?.disconnect(); } catch (_) {}
    try { this.inputCtx?.close(); } catch (_) {}
    this.captureNode = null;
    this.micSource = null;
    this.inputCtx = null;
  }

  // ── Live Playback ─────────────────────────────────────────────────────────

  startLivePlayback(): void {
    this.playbackQueue = [];
    this.playbackCtx = new AudioContext({ sampleRate: this.sampleRate });
    this.playbackNextTime = this.playbackCtx.currentTime + 0.15;

    this.playbackTick = setInterval(() => {
      if (!this.playbackCtx) return;
      const fl = this.frameLength;
      while (this.playbackQueue.length >= fl) {
        const samples = this.playbackQueue.splice(0, fl);
        const buf = this.playbackCtx.createBuffer(1, fl, this.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < fl; i++) ch[i] = samples[i] / 32768;

        const src = this.playbackCtx.createBufferSource();
        src.buffer = buf;
        src.connect(this.playbackCtx.destination);
        src.start(Math.max(this.playbackNextTime, this.playbackCtx.currentTime));
        this.playbackNextTime += fl / this.sampleRate;
      }
    }, 20);
  }

  stopLivePlayback(): void {
    if (this.playbackTick !== null) {
      clearInterval(this.playbackTick);
      this.playbackTick = null;
    }
    try { this.playbackCtx?.close(); } catch (_) {}
    this.playbackCtx = null;
    this.playbackQueue = [];
  }

  // ── Recording capture ─────────────────────────────────────────────────────

  startRecordingCapture(): void {
    this.collectedFrames = [];
    this.rawEnergyAcc = 0;
    this.rawEnergySamples = 0;
    this.cleanEnergyAcc = 0;
    this.cleanEnergySamples = 0;
    this.isCollecting = true;
  }

  stopRecordingCapture(): void {
    this.isCollecting = false;
  }

  /** Encode all collected frames into a WAV Blob ready for an <audio> element */
  getRecordedWav(): Blob {
    return this.encodeWav(this.collectedFrames, this.sampleRate);
  }

  getRawEnergyDb(): number  { return this.rmsToDb(this.rawEnergyAcc,  this.rawEnergySamples); }
  getCleanEnergyDb(): number { return this.rmsToDb(this.cleanEnergyAcc, this.cleanEnergySamples); }

  // ── Destroy ───────────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    this.stopCapture();
    this.stopLivePlayback();
    try { await this.koala?.release(); } catch (_) {}
    this.koala = null;
    this.initTimeMs = 0;
    this.captureSetupMs = 0;
    this.delaySampleMs = 0;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private onProcessed(enhanced: Int16Array): void {
    // Feed live playback queue
    for (const s of enhanced) this.playbackQueue.push(s);

    // Collect for recording + clean energy
    if (this.isCollecting) {
      this.collectedFrames.push(new Int16Array(enhanced));
      for (const s of enhanced) {
        const f = s / 32768;
        this.cleanEnergyAcc += f * f;
        this.cleanEnergySamples++;
      }
    }
  }

  private float32ToInt16(src: Float32Array): Int16Array {
    const dst = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      dst[i] = Math.max(-32768, Math.min(32767, Math.round(src[i] * 32768)));
    }
    return dst;
  }

  private rmsToDb(acc: number, n: number): number {
    if (n === 0) return -100;
    const rms = Math.sqrt(acc / n);
    return rms > 0 ? parseFloat((20 * Math.log10(rms)).toFixed(1)) : -100;
  }

  private bufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...Array.from(bytes.slice(i, i + chunk)));
    }
    return btoa(bin);
  }

  private encodeWav(frames: Int16Array[], sr: number): Blob {
    const total = frames.reduce((n, f) => n + f.length, 0);
    const buf = new ArrayBuffer(44 + total * 2);
    const v = new DataView(buf);
    const w = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    w(0, 'RIFF'); v.setUint32(4, 36 + total * 2, true);
    w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true);  v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);   v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, total * 2, true);
    let off = 44;
    for (const fr of frames) {
      for (let i = 0; i < fr.length; i++) { v.setInt16(off, fr[i], true); off += 2; }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }
}
