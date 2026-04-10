/**
 * DeepFilter3Service
 * Wraps DeepFilterNet3 (ONNX + AudioWorklet + WASM) for in-browser noise cancellation.
 * No API key. Model ~7.7 MB, downloaded once and browser-cached.
 *
 * Pipeline:
 *   getUserMedia → MediaStreamSource → AudioWorkletNode (DF3) → MediaStreamDestination → cleanStream
 *
 * Browser support: Chrome 91+, Edge 91+ ✅ | Firefox ⚠️ | Safari ❌
 * Package: deepfilternet3-noise-filter@1.2.1
 */

import { Injectable } from '@angular/core';
import { DeepFilterNet3Core, DeepFilterNoiseFilterProcessor } from 'deepfilternet3-noise-filter';

@Injectable({ providedIn: 'root' })
export class DeepFilter3Service {

  private processor: DeepFilterNet3Core | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private _isActive = false;

  /** ms taken to load + compile the ONNX model. Set after init(). */
  initTimeMs = 0;
  /** ms taken to wire the audio graph. Set after processStream(). */
  processingLatencyMs = 0;

  // ── Init ──────────────────────────────────────────────────────────────────

  /**
   * Checks browser support, creates AudioContext (48 kHz), loads ONNX model.
   * @param suppressionLevel  0–100, default 80
   * @returns false if unsupported or load fails
   */
  async init(suppressionLevel = 80): Promise<boolean> {
    try {
      if (!DeepFilterNoiseFilterProcessor.isSupported()) {
        console.warn('⚠️ DeepFilterNet3 not supported on this browser');
        return false;
      }

      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.processor = new DeepFilterNet3Core({ sampleRate: 48000, noiseReductionLevel: suppressionLevel });

      const t0 = performance.now();
      await this.processor.initialize();
      this.initTimeMs = Math.round(performance.now() - t0);

      console.log(`✅ DeepFilterNet3 initialized in ${this.initTimeMs}ms`);
      return true;

    } catch (err) {
      console.error('❌ DeepFilterNet3 init failed:', err);
      return false;
    }
  }

  // ── Process ───────────────────────────────────────────────────────────────

  /**
   * Wires the audio graph and returns the noise-suppressed stream.
   * Falls back to the raw stream on error — audio always works.
   * Must be called after a successful init().
   */
  async processStream(raw: MediaStream): Promise<MediaStream> {
    if (!this.processor || !this.audioContext) {
      console.warn('DeepFilter3Service: not initialised, returning raw stream');
      return raw;
    }

    try {
      const t0 = performance.now();

      this.workletNode = await this.processor.createAudioWorkletNode(this.audioContext);

      const source      = this.audioContext.createMediaStreamSource(raw);
      const destination = this.audioContext.createMediaStreamDestination();

      // mic → DF3 worklet → clean output
      source.connect(this.workletNode);
      this.workletNode.connect(destination);

      this.processingLatencyMs = Math.round(performance.now() - t0);
      this._isActive = true;

      console.log(`✅ DeepFilterNet3 graph wired in ${this.processingLatencyMs}ms`);
      return destination.stream;

    } catch (err) {
      console.error('❌ DeepFilterNet3 processStream failed:', err);
      return raw;
    }
  }

  // ── Runtime controls ──────────────────────────────────────────────────────

  /** Change suppression strength (0–100) without restarting the graph. */
  setSuppressionLevel(level: number): void {
    this.processor?.setSuppressionLevel(level);
  }

  /** Bypass (false) or re-enable (true) filtering without tearing down the graph. */
  setEnabled(on: boolean): void {
    this.processor?.setNoiseSuppressionEnabled(on);
  }

  /** True once processStream() succeeds; false after destroy(). */
  isActive(): boolean {
    return this._isActive;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /** Destroys the ONNX processor, closes AudioContext, resets all state. */
  destroy(): void {
    try { this.processor?.destroy(); } catch (_) {}
    try { this.audioContext?.close(); } catch (_) {}
    this.processor           = null;
    this.audioContext        = null;
    this.workletNode         = null;
    this._isActive           = false;
    this.initTimeMs          = 0;
    this.processingLatencyMs = 0;
  }
}
