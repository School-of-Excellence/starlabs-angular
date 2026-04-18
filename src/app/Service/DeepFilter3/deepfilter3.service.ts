/**
 * DeepFilter3Service
 * Wraps DeepFilterNet3 (ONNX + AudioWorklet + WASM) for in-browser noise cancellation.
 * No API key. Model ~7.7 MB, downloaded once and browser-cached from CDN.
 *
 * Pipeline (live):
 *   getUserMedia → MediaStreamSource → AudioWorkletNode (DF3) → GainBoost → MediaStreamDestination
 *
 * Pipeline (offline / file comparison):
 *   Float32Array → OfflineAudioContext + AudioWorkletNode → Float32Array (processed)
 *
 * VAD — Hybrid RMS + tap rejection:
 *   Primary:   RMS energy vs slow-adapting noise floor (proven, works in all conditions)
 *   Secondary: Frequency ratio guard — rejects broadband impulse noise (taps, knocks, keyboard)
 *              A sound is a tap if ratio < 0.15 AND RMS spiked > 3× smoothed value (sudden)
 *
 *   Speech  → suppressionLevel 30  (gentle — consonants preserved)
 *   Silence → suppressionLevel 80  (strong  — noise removed, signal above Opus DTX threshold)
 *   Hangover: 300 ms hold on speech mode to capture trailing phonemes.
 *
 *   Gain: fixed ×1.5 — DF3 at level 30 barely reduces volume so a large boost is not needed.
 *   A high gain caused clipping at the Opus encoder → distorted, unintelligible audio.
 *
 * Browser support: Chrome 91+, Edge 91+ ✅ | Firefox ⚠️ | Safari ❌
 * Package: deepfilternet3-noise-filter@1.2.1
 */

import { Injectable } from '@angular/core';
import { DeepFilterNet3Core, DeepFilterNoiseFilterProcessor } from 'deepfilternet3-noise-filter';
import { environment } from "../../../environments/environment";

@Injectable({ providedIn: 'root' })
export class DeepFilter3Service {

  private processor:    DeepFilterNet3Core | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode:  AudioWorkletNode | null = null;
  private gainBoost:    GainNode | null = null;
  private silentGain:   GainNode | null = null;
  private _isActive = false;

  // ── VAD fields ────────────────────────────────────────────────────────────
  private vadAnalyser:  AnalyserNode | null = null;
  private vadInterval:  ReturnType<typeof setInterval> | null = null;
  private noiseFloor  = 0.002;   // slow-adapting noise floor
  private smoothedRms = 0;       // exponentially smoothed RMS
  private hangover    = 0;       // frames remaining in hangover window

  /** DF3 native frame size at 48 kHz — 480 samples = 10 ms */
  readonly frameLength = 480;

  /** ms taken to load + compile the ONNX model. Set after init(). */
  initTimeMs = 0;
  /** ms taken to wire the audio graph. Set after processStream(). */
  processingLatencyMs = 0;

  // ── Init ──────────────────────────────────────────────────────────────────

  /**
   * Checks browser support, creates AudioContext (48 kHz), loads ONNX model.
   * Safe to call eagerly (pre-warm) — AudioContext is resumed in processStream().
   */
  async init(suppressionLevel = 80): Promise<boolean> {
    try {
      if (!DeepFilterNoiseFilterProcessor.isSupported()) {
        console.warn('⚠️ DeepFilterNet3 not supported on this browser');
        return false;
      }

      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.processor = new DeepFilterNet3Core({
        sampleRate: 48000,
        noiseReductionLevel: suppressionLevel,
        ...(environment["df3CdnUrl"] ? { assetConfig: { cdnUrl: environment["df3CdnUrl"] } } : {})
      });

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

  // ── Live stream processing ─────────────────────────────────────────────────

  /**
   * Wires the audio graph and returns the noise-suppressed MediaStream.
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

      // Resume AudioContext if pre-warmed without a user gesture (Chrome suspends it).
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('▶️ AudioContext resumed from suspended state');
      }

      this.workletNode = await this.processor.createAudioWorkletNode(this.audioContext);

      const ctx         = this.audioContext;
      const source      = ctx.createMediaStreamSource(raw);
      const destination = ctx.createMediaStreamDestination();

      // Fixed ×1.5 boost — compensates for the small volume reduction DF3 causes at
      // level 30 (speech mode). A higher value (2.5–3.25) caused clipping at the
      // Opus encoder, making the voice loud but unintelligible.
      this.gainBoost = ctx.createGain();
      this.gainBoost.gain.value = 1.5;

      // Silent keepalive — Chrome suspends AudioContext if nothing reaches ctx.destination.
      this.silentGain = ctx.createGain();
      this.silentGain.gain.value = 0;

      // VAD analyser — fftSize 512 → 256 freq bins (93.75 Hz each) + 512 time samples.
      // Supports both getFloatTimeDomainData (RMS) and getFloatFrequencyData (tap check).
      this.vadAnalyser = ctx.createAnalyser();
      this.vadAnalyser.fftSize = 512;
      this.vadAnalyser.smoothingTimeConstant = 0;

      // mic → DF3 worklet → gainBoost → destination (clean stream)
      //                              ↘ silentGain(0) → ctx.destination (keepalive)
      // mic → vadAnalyser (parallel tap, analysis only)
      source.connect(this.workletNode);
      this.workletNode.connect(this.gainBoost);
      this.gainBoost.connect(destination);
      this.gainBoost.connect(this.silentGain);
      this.silentGain.connect(ctx.destination);
      source.connect(this.vadAnalyser);

      this.processingLatencyMs = Math.round(performance.now() - t0);
      this._isActive = true;

      this._startVad();

      console.log(`✅ DeepFilterNet3 graph wired in ${this.processingLatencyMs}ms (hybrid VAD active)`);
      return destination.stream;

    } catch (err) {
      console.error('❌ DeepFilterNet3 processStream failed:', err);
      return raw;
    }
  }

  // ── VAD loop ──────────────────────────────────────────────────────────────

  /**
   * Hybrid RMS + tap-rejection VAD — runs every 20 ms.
   *
   * Primary detection — RMS vs noise floor:
   *   1. Measure RMS of the raw mic time-domain buffer.
   *   2. Exponentially smooth RMS (α=0.3) to avoid frame jitter.
   *   3. Slow-adapting noise floor — calibrates to room noise automatically.
   *   4. isSpeechCandidate = smoothedRms > noiseFloor × 3.5
   *
   * Secondary guard — tap / impulse rejection:
   *   5. Read frequency spectrum (FFT) from the same analyser frame.
   *   6. Compute ratio = voiceBandPower (300–3400 Hz) / totalPower.
   *   7. isTap = ratio < 0.15 AND rms > smoothedRms × 3.0
   *      → ratio < 0.15: energy is spread flat (broadband impulse, not voice)
   *      → rms spike × 3:  sudden onset (tap/knock, not gradual speech build-up)
   *      Both must be true to reject — prevents falsely classifying loud speech as a tap.
   *
   * Final: isSpeech = isSpeechCandidate AND NOT isTap
   *
   * Speech  → setSuppressionLevel(30) — gentle, consonants survive
   * Silence → setSuppressionLevel(80) — strong removal, signal stays above Opus DTX floor
   * Hangover: hold speech mode for 300 ms after speech ends (trailing phonemes)
   */
  private _startVad(): void {
    if (!this.vadAnalyser || !this.processor) return;

    const FRAME_MS        = 20;
    const HANGOVER_FRAMES = 15;       // 15 × 20ms = 300ms
    const SPEECH_RATIO    = 3.5;      // RMS must be 3.5× above noise floor
    const ALPHA_RMS       = 0.3;      // RMS smoothing factor
    const ALPHA_FLOOR     = 0.02;     // noise floor drift speed
    const TAP_RATIO       = 0.15;     // voice-band ratio below this = broadband = tap
    const TAP_SPIKE       = 3.0;      // RMS must spike 3× smoothed to qualify as tap
    const WARMUP_MS       = 500;
    const warmupUntil     = Date.now() + WARMUP_MS;

    // fftSize 512 → timeBuf needs 512 samples, freqBuf needs 256 bins
    const fftSize  = this.vadAnalyser.fftSize;             // 512
    const numBins  = this.vadAnalyser.frequencyBinCount;   // 256
    const timeBuf  = new Float32Array(fftSize);
    const freqBuf  = new Float32Array(numBins);

    // Voice band bin range at 93.75 Hz/bin
    const BIN_WIDTH      = 48000 / fftSize;                // 93.75 Hz
    const VOICE_LOW_BIN  = Math.floor(300  / BIN_WIDTH);   // bin 3
    const VOICE_HIGH_BIN = Math.floor(3400 / BIN_WIDTH);   // bin 36

    this.noiseFloor  = 0.002;
    this.smoothedRms = 0;
    this.hangover    = 0;

    this.vadInterval = setInterval(() => {
      if (!this.vadAnalyser || !this.processor) return;

      // ── Primary: RMS detection ──────────────────────────────────────────

      this.vadAnalyser.getFloatTimeDomainData(timeBuf);
      let sumSq = 0;
      for (let i = 0; i < fftSize; i++) sumSq += timeBuf[i] * timeBuf[i];
      const rms = Math.sqrt(sumSq / fftSize);

      this.smoothedRms = ALPHA_RMS * rms + (1 - ALPHA_RMS) * this.smoothedRms;

      // Noise floor: drops quickly when quiet, rises very slowly to avoid creep mid-sentence
      if (this.smoothedRms < this.noiseFloor) {
        this.noiseFloor = ALPHA_FLOOR * this.smoothedRms + (1 - ALPHA_FLOOR) * this.noiseFloor;
      } else {
        this.noiseFloor = 0.005 * this.smoothedRms + 0.995 * this.noiseFloor;
      }
      if (this.noiseFloor < 0.0008) this.noiseFloor = 0.0008;

      const isSpeechCandidate = this.smoothedRms > this.noiseFloor * SPEECH_RATIO;

      // ── Secondary: tap / impulse rejection ─────────────────────────────

      let isTap = false;
      if (isSpeechCandidate) {
        // Only run FFT when RMS says "maybe speech" — saves CPU during silence
        this.vadAnalyser.getFloatFrequencyData(freqBuf);
        let voicePower = 0, totalPower = 0;
        for (let i = 1; i < numBins; i++) {
          const dB = freqBuf[i];
          if (!isFinite(dB)) continue;
          const power = Math.pow(10, dB / 10);
          totalPower += power;
          if (i >= VOICE_LOW_BIN && i <= VOICE_HIGH_BIN) voicePower += power;
        }
        const ratio = totalPower > 0 ? voicePower / totalPower : 0;
        // Tap: broadband (low ratio) AND sudden onset (large spike above smoothed)
        isTap = ratio < TAP_RATIO && rms > this.smoothedRms * TAP_SPIKE;
      }

      // ── Warm-up guard ──────────────────────────────────────────────────
      if (Date.now() < warmupUntil) {
        this.processor.setSuppressionLevel(30);
        return;
      }

      // ── Final decision ─────────────────────────────────────────────────
      const isSpeech = isSpeechCandidate && !isTap;

      if (isSpeech) {
        this.hangover = HANGOVER_FRAMES;
        this.processor.setSuppressionLevel(30);   // gentle — consonants survive

      } else if (this.hangover > 0) {
        this.hangover--;
        this.processor.setSuppressionLevel(30);   // hold for trailing phonemes

      } else {
        this.processor.setSuppressionLevel(80);   // strong — stays above Opus DTX floor
      }

    }, FRAME_MS);
  }

  // ── Offline processing (file comparison) ─────────────────────────────────

  /**
   * Process an entire Float32Array offline through DeepFilterNet3.
   * Uses OfflineAudioContext — renders faster than realtime.
   */
  async processOffline(
    audio: Float32Array,
    onProgress?: (progress: number) => void
  ): Promise<Float32Array> {
    if (!this.processor) throw new Error('DeepFilter3Service: call init() before processOffline()');

    onProgress?.(0.05);

    try {
      const offCtx = new OfflineAudioContext(1, audio.length, 48000);
      const workletNode = await this.processor.createAudioWorkletNode(
        offCtx as unknown as AudioContext
      );

      const srcBuffer = offCtx.createBuffer(1, audio.length, 48000);
      srcBuffer.copyToChannel(new Float32Array(audio), 0);
      const src = offCtx.createBufferSource();
      src.buffer = srcBuffer;

      src.connect(workletNode);
      workletNode.connect(offCtx.destination);
      src.start(0);

      onProgress?.(0.2);

      const rendered = await offCtx.startRendering();
      onProgress?.(1);

      return rendered.getChannelData(0).slice();

    } catch (err) {
      console.error('❌ DeepFilterNet3 processOffline failed:', err);
      return audio;
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

  /** Mic input level in dBFS. Returns -60 if VAD analyser is not ready. */
  getMicLevelDb(): number {
    if (!this.vadAnalyser) return -60;
    const buf = new Float32Array(this.vadAnalyser.fftSize);
    this.vadAnalyser.getFloatTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);
    if (rms === 0) return -60;
    return parseFloat((20 * Math.log10(rms)).toFixed(1));
  }

  /** Current VAD decision based on smoothed RMS vs noise floor. */
  getVadState(): 'speech' | 'silence' {
    return this.smoothedRms > this.noiseFloor * 3.5 ? 'speech' : 'silence';
  }

  /** Active DF3 suppression level — 30 during speech, 80 during silence. */
  getCurrentSuppressionLevel(): number {
    return this.smoothedRms > this.noiseFloor * 3.5 ? 30 : 80;
  }

  /** True if the ONNX model is loaded and ready — init() has already succeeded. */
  isInitialized(): boolean {
    return !!this.processor;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /** Destroys the ONNX processor, closes AudioContext, resets all state. */
  destroy(): void {
    if (this.vadInterval !== null) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }

    try { this.vadAnalyser?.disconnect(); }  catch (_) {}
    try { this.workletNode?.disconnect(); }  catch (_) {}
    try { this.gainBoost?.disconnect(); }    catch (_) {}
    try { this.silentGain?.disconnect(); }   catch (_) {}
    try { this.processor?.destroy(); }       catch (_) {}
    try { this.audioContext?.close(); }      catch (_) {}

    this.processor           = null;
    this.audioContext        = null;
    this.workletNode         = null;
    this.gainBoost           = null;
    this.silentGain          = null;
    this.vadAnalyser         = null;
    this._isActive           = false;
    this.initTimeMs          = 0;
    this.processingLatencyMs = 0;
    this.noiseFloor          = 0.002;
    this.smoothedRms         = 0;
    this.hangover            = 0;
  }
}
