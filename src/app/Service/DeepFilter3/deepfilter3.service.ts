/**
 * DeepFilter3Service
 * Runs DeepFilterNet3 WASM in a Web Worker (not AudioWorklet).
 *
 * Why Web Worker instead of AudioWorklet?
 *   The WASM binary uses SIMD instructions that trigger RuntimeError: unreachable
 *   specifically inside Chrome's AudioWorklet thread. The same WASM works fine
 *   in a regular Web Worker. Architecture:
 *
 *   Pipeline:
 *     getUserMedia (raw mic, 48 kHz)
 *       └─ MediaStreamAudioSourceNode
 *             └─ ScriptProcessorNode (main thread)
 *                   │  sends Float32 frames → Web Worker
 *                   │  Web Worker: df_process_frame(handle, frame) → WASM SIMD
 *                   │  receives denoised Float32 frames ← Web Worker
 *                   └─ MediaStreamAudioDestinationNode → cleanStream
 *
 * Assets (self-hosted, same origin → no CORS):
 *   /assets/deepfilter3/pkg/df_bg.wasm                    (8.8 MB)
 *   /assets/deepfilter3/models/DeepFilterNet3_onnx.tar.gz (7.6 MB)
 *   /assets/deepfilter3/df-worker.js                      (worker)
 *
 * Package: deepfilternet3-noise-filter@1.1.4 (asset loader only)
 * Browser support: Chrome 91+, Edge 91+ ✅ | Firefox ⚠️ | Safari ❌
 */

import { Injectable } from '@angular/core';
import { DeepFilterNoiseFilterProcessor } from 'deepfilternet3-noise-filter';

@Injectable({ providedIn: 'root' })
export class DeepFilter3Service {

  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private hpFilter: BiquadFilterNode | null = null;     // sub-80 Hz rumble cut
  private presence: BiquadFilterNode | null = null;     // 2.5 kHz presence boost
  private compressor: DynamicsCompressorNode | null = null; // gentle voice levelling
  private _isActive = false;
  private _stopping = false; // flip true in destroy() so onaudioprocess outputs silence immediately

  // Output queue — worker fills this, ScriptProcessorNode drains it
  private outputQueue: Float32Array[] = [];
  private frameLength = 480; // updated once worker signals ready

  /** ms taken to fetch + compile WASM and model. Set after init(). */
  initTimeMs = 0;
  /** ms taken to wire the audio graph. Set after processStream(). */
  processingLatencyMs = 0;

  // ── Init ──────────────────────────────────────────────────────────────────

  /**
   * Fetch WASM + model, spin up the Web Worker, wait for 'ready'.
   * @param suppressionLevel  0–100, default 80
   */
  async init(suppressionLevel = 80): Promise<boolean> {
    try {
      if (!DeepFilterNoiseFilterProcessor.isSupported()) {
        console.warn('⚠️ DeepFilterNet3: AudioWorklet not supported — WASM Worker may still work');
      }

      const base = `${window.location.origin}/assets/deepfilter3`;
      const t0 = performance.now();

      // Fetch WASM binary and model in parallel
      const [wasmBytes, modelBytes] = await Promise.all([
        fetch(`${base}/pkg/df_bg.wasm`).then(r => { if (!r.ok) throw new Error(`WASM fetch failed: ${r.status}`); return r.arrayBuffer(); }),
        fetch(`${base}/models/DeepFilterNet3_onnx.tar.gz`).then(r => { if (!r.ok) throw new Error(`Model fetch failed: ${r.status}`); return r.arrayBuffer(); })
      ]);

      // Start worker
      this.worker = new Worker(`${base}/df-worker.js`);

      // Wait for worker to signal 'ready' (WASM compiled + model loaded)
      await new Promise<void>((resolve, reject) => {
        this.worker!.onmessage = (e) => {
          if (e.data.type === 'ready') {
            this.frameLength = e.data.frameLength;
            console.log(`✅ DF3 Worker ready — frameLength: ${this.frameLength}`);
            resolve();
          } else if (e.data.type === 'error') {
            reject(new Error(`DF3 Worker init error: ${e.data.message}`));
          }
        };
        this.worker!.onerror = (err) => reject(err);

        // Send WASM + model bytes to worker (transferred for zero-copy)
        this.worker!.postMessage(
          { type: 'init', wasmBytes, modelBytes, suppressionLevel },
          [wasmBytes, modelBytes]
        );
      });

      // After worker is ready, hook up its processed frames into our output queue
      this.worker.onmessage = (e) => {
        if (e.data.type === 'processed') {
          this.outputQueue.push(e.data.outputFrame);
        }
      };

      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.initTimeMs = Math.round(performance.now() - t0);

      console.log(`✅ DeepFilterNet3 initialized in ${this.initTimeMs}ms (WASM in Web Worker)`);
      return true;

    } catch (err) {
      console.error('❌ DeepFilterNet3 init failed:', err);
      this.destroy();
      return false;
    }
  }

  // ── Process ───────────────────────────────────────────────────────────────

  /**
   * Wire the ScriptProcessorNode audio graph.
   *
   * Signal chain:
   *   mic → ScriptProcessor (DF3 WASM via Worker)
   *       → HighPassFilter (cut sub-80 Hz rumble)
   *       → Presence boost  (+4 dB at 2.5 kHz — voice articulation)
   *       → DynamicsCompressor (gentle levelling so voice stays prominent)
   *       → MediaStreamDestination (clean output stream)
   */
  async processStream(raw: MediaStream): Promise<MediaStream> {
    if (!this.worker || !this.audioContext) {
      console.warn('DeepFilter3Service: not initialised, returning raw stream');
      return raw;
    }

    try {
      const t0 = performance.now();
      const ctx = this.audioContext;

      this.source      = ctx.createMediaStreamSource(raw);
      this.destination = ctx.createMediaStreamDestination();

      // ── ScriptProcessorNode (DF3 WASM round-trip) ─────────────────────────
      // 1024 samples at 48 kHz = 21 ms per callback (was 85 ms).
      // Smaller buffer → more frequent callbacks → smoother, less "stuck" feel.
      const bufferSize   = 1024;
      // Pre-fill: hold back output until this many frames are queued.
      // Gives the Worker time to build a steady pipeline before we start draining.
      const preFillFrames = 6; // 6 × 480 samples = ~60 ms headroom
      let   started       = false;

      this.scriptNode = ctx.createScriptProcessor(bufferSize, 1, 1);

      let inputAccum: Float32Array = new Float32Array(0);

      this.scriptNode.onaudioprocess = (ev) => {
        const input  = ev.inputBuffer.getChannelData(0);
        const output = ev.outputBuffer.getChannelData(0);

        // Immediately silence on stop — breaks echo loop at once
        if (this._stopping) { output.fill(0); return; }

        // ── Feed input to Worker in exact frameLength chunks ───────────────
        const combined = new Float32Array(inputAccum.length + input.length);
        combined.set(inputAccum);
        combined.set(input, inputAccum.length);

        let offset = 0;
        while (offset + this.frameLength <= combined.length) {
          const frame = combined.slice(offset, offset + this.frameLength);
          this.worker!.postMessage({ type: 'process', inputFrame: frame }, [frame.buffer]);
          offset += this.frameLength;
        }
        inputAccum = combined.slice(offset);

        // ── Wait for pre-fill before starting output ───────────────────────
        if (!started) {
          if (this.outputQueue.length >= preFillFrames) {
            started = true;
          } else {
            output.fill(0);
            return;
          }
        }

        // ── Drain output queue → output buffer ────────────────────────────
        let outOffset = 0;
        while (outOffset < bufferSize && this.outputQueue.length > 0) {
          const chunk  = this.outputQueue[0];
          const needed = bufferSize - outOffset;
          if (chunk.length <= needed) {
            output.set(chunk, outOffset);
            outOffset += chunk.length;
            this.outputQueue.shift();
          } else {
            output.set(chunk.subarray(0, needed), outOffset);
            this.outputQueue[0] = chunk.subarray(needed);
            outOffset = bufferSize;
          }
        }
        // Queue ran dry mid-callback: silence (never mix raw + processed)
        if (outOffset < bufferSize) { output.fill(0, outOffset); }
      };

      // ── Voice clarity EQ chain ─────────────────────────────────────────────
      // 1) High-pass: cut sub-80 Hz room rumble / handling noise
      this.hpFilter = ctx.createBiquadFilter();
      this.hpFilter.type            = 'highpass';
      this.hpFilter.frequency.value = 80;
      this.hpFilter.Q.value         = 0.7;

      // 2) Presence boost: +4 dB at 2.5 kHz — the consonant/articulation range
      //    makes speech sound crisper and easier to understand
      this.presence = ctx.createBiquadFilter();
      this.presence.type            = 'peaking';
      this.presence.frequency.value = 2500;
      this.presence.gain.value      = 4;
      this.presence.Q.value         = 1.2;

      // 3) Dynamics compressor: gently levels voice so quiet words aren't lost
      //    threshold −24 dB, ratio 3:1, soft knee — transparent, not pumping
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value      = 12;
      this.compressor.ratio.value     = 3;
      this.compressor.attack.value    = 0.003;
      this.compressor.release.value   = 0.25;

      // ── Silent gain node keeps ScriptProcessorNode alive in Chrome ─────────
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      // ── Connect signal chain ───────────────────────────────────────────────
      this.source.connect(this.scriptNode);
      this.scriptNode.connect(this.hpFilter);
      this.hpFilter.connect(this.presence);
      this.presence.connect(this.compressor);
      this.compressor.connect(this.destination); // clean enhanced output
      this.compressor.connect(silentGain);
      silentGain.connect(ctx.destination);        // keeps graph alive

      this.processingLatencyMs = Math.round(performance.now() - t0);
      this._isActive = true;

      console.log(`✅ DeepFilterNet3 audio graph wired in ${this.processingLatencyMs}ms`);
      return this.destination.stream;

    } catch (err) {
      console.error('❌ DeepFilterNet3 processStream failed:', err);
      return raw;
    }
  }

  // ── Runtime controls ──────────────────────────────────────────────────────

  /** Adjust suppression level at runtime (0–100). */
  setSuppressionLevel(level: number): void {
    this.worker?.postMessage({ type: 'setLevel', level });
  }

  /** Bypass (false) or re-enable (true) noise suppression. */
  setEnabled(on: boolean): void {
    this.worker?.postMessage({ type: 'setBypass', bypass: !on });
  }

  /** True once processStream() succeeds. */
  isActive(): boolean {
    return this._isActive;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /** Terminate worker, close AudioContext, reset all state. */
  destroy(): void {
    // Flip stopping flag first — onaudioprocess will output silence on next tick
    this._stopping = true;
    this._isActive = false;
    this.outputQueue = []; // drain queue so no stale audio plays after stop

    try { this.scriptNode?.disconnect(); } catch (_) {}
    try { this.hpFilter?.disconnect(); }   catch (_) {}
    try { this.presence?.disconnect(); }   catch (_) {}
    try { this.compressor?.disconnect(); } catch (_) {}
    try { this.source?.disconnect(); }     catch (_) {}
    try { this.destination?.disconnect(); } catch (_) {}
    try { this.audioContext?.close(); }    catch (_) {}
    try { this.worker?.terminate(); }      catch (_) {}

    this.worker       = null;
    this.audioContext = null;
    this.scriptNode   = null;
    this.hpFilter     = null;
    this.presence     = null;
    this.compressor   = null;
    this.source       = null;
    this.destination  = null;
    this._stopping    = false;
    this.outputQueue  = [];
    this.initTimeMs   = 0;
    this.processingLatencyMs = 0;
  }
}
