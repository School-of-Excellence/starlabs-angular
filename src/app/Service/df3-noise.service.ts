// src/app/services/df3-noise.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Df3NoiseService {

  private audioCtx:    AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private worker:      Worker | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private rawStream:   MediaStream | null = null;

  // ── Point 2: Warmup state ─────────────────────────────
  private isWarmedUp = false;

  // ── Point 4: Which backend was selected ───────────────
  public executionProvider = 'unknown';

  // ─────────────────────────────────────────────────────
  async getCleanTrack(): Promise<MediaStreamTrack> {


    // 1. Capture raw mic at exactly 48kHz
    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate:        48000,
        channelCount:      { exact: 1 },
        echoCancellation:  true,
        noiseSuppression:  false, // replaced by DeepFilterNet3
        autoGainControl:   true,
      }
    });

    // 2. AudioContext at 48kHz
    this.audioCtx = new AudioContext({ sampleRate: 48000 });

    // 3. Start Web Worker
    this.worker = new Worker(
      new URL('../workers/df3.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // 4. Load ONNX models (wait for ready signal)
    await this._initWorker();

    // 5. Load AudioWorklet processor
    await this.audioCtx.audioWorklet.addModule('/assets/df3/df3-processor.js');

    // 6. Create worklet node
    this.workletNode = new AudioWorkletNode(
      this.audioCtx, 'df3-processor',
      { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 }
    );

    // 7. Bridge: worklet ↔ worker message passing
    this._bridgeWorkletToWorker();

    // 8. Build audio graph: mic → worklet → destination
    this.destination = this.audioCtx.createMediaStreamDestination();
    const source = this.audioCtx.createMediaStreamSource(this.rawStream);
    source.connect(this.workletNode);
    this.workletNode.connect(this.destination);

    return this.destination.stream.getAudioTracks()[0];
  }

  // ── Point 3: Call this when user clicks mute ──────────
  onMute() {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'mute' });
    this.isWarmedUp = false;
  }

  // ── Point 3: Call this when user clicks unmute ────────
  onUnmute() {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'unmute' });
    // isWarmedUp will be set back to true after warmup completes
  }

  // ── Manual reset (e.g. on reconnect) ─────────────────
  reset() {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'reset' });
    this.isWarmedUp = false;
  }

  // ── Cleanup ───────────────────────────────────────────
  async destroy() {
    this.worker?.terminate();
    this.workletNode?.disconnect();
    this.destination?.disconnect();
    await this.audioCtx?.close();
    this.rawStream?.getTracks().forEach(t => t.stop());

    this.worker      = null;
    this.workletNode = null;
    this.destination = null;
    this.audioCtx    = null;
    this.rawStream   = null;
    this.isWarmedUp  = false;
  }

  // ─────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────

  private _initWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('DeepFilterNet3 model load timeout (30s)'));
      }, 30_000);

      this.worker!.onmessage = (e) => {
        if (e.data.type === 'ready') {
          clearTimeout(timeout);
          // ── Point 4: Log which backend was selected ──
          this.executionProvider = e.data.provider;
          console.log(`[DF3] Running on: ${this.executionProvider}`);
          resolve();
        }
        if (e.data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(e.data.message));
        }
      };

      this.worker!.postMessage({ type: 'init' });
    });
  }

  // private _bridgeWorkletToWorker() {
  //   // Worklet → Worker: send raw 480-sample frames
  //   this.workletNode!.port.onmessage = (e) => {
  //     if (e.data.type === 'process') {
  //       if (e.data.isWarmup) {
  //         console.log('[DF3] 🔄 Warming up... frames remaining:', e.data.pcm?.length);
  //       }
  //     }
  //   };

  //   // Worker → Worklet: return clean processed frames
  //   this.worker!.onmessage = (e) => {
  //     if (e.data.type === 'processed') {
  //       // ── Point 2: Track warmup completion ──────────
  //       if (!e.data.isWarmup) {
  //         console.log('[DF3] ✅ Warmup complete — noise cancellation active');
  //         this.isWarmedUp = true;
  //       }
  //       this.workletNode!.port.postMessage(e.data,
  //         e.data.pcm.buffer ? [e.data.pcm.buffer] : []);
  //     }
  //   };
  // }

  private _bridgeWorkletToWorker() {
    // Tell worklet the worker is ready to receive frames
    this.workletNode!.port.postMessage({ type: 'worker_ready' });

    // Worklet → Worker
    this.workletNode!.port.onmessage = (e) => {
      if (e.data.type === 'process') {
        const buf = e.data.pcm?.buffer;
        if (buf && buf.byteLength > 0) {
          this.worker!.postMessage(e.data, [buf]);
        } else {
          this.worker!.postMessage(e.data);
        }
      }
    };

    // Worker → Worklet
    this.worker!.onmessage = (e) => {
      if (e.data.type === 'processed') {
        if (!e.data.isWarmup) {
          if (!this.isWarmedUp) {
            console.log('[DF3] ✅ Warmup complete — noise cancellation active');
            this.isWarmedUp = true;
          }
        }
        const buf = e.data.pcm?.buffer;
        if (buf && buf.byteLength > 0) {
          this.workletNode!.port.postMessage(e.data, [buf]);
        } else {
          this.workletNode!.port.postMessage(e.data);
        }
      }
    };
  }

  // New method — takes an EXISTING track instead of opening mic itself
  async getCleanTrackFromExisting(
    existingTrack: MediaStreamTrack
  ): Promise<MediaStreamTrack> {

    // Wrap existing track in a MediaStream
    this.rawStream = new MediaStream([existingTrack]);

    // Create AudioContext
    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    // Start worker
    this.worker = new Worker(
      new URL('../workers/df3.worker.ts', import.meta.url),
      { type: 'module' }
    );
    await this._initWorker();

    // Load worklet
    await this.audioCtx.audioWorklet.addModule('/assets/df3/df3-processor.js');
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    // Create worklet node
    this.workletNode = new AudioWorkletNode(
      this.audioCtx, 'df3-processor',
      { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 }
    );

    this._bridgeWorkletToWorker();

    // Connect graph using existing AEC-processed track
    this.destination = this.audioCtx.createMediaStreamDestination();
    const source = this.audioCtx.createMediaStreamSource(this.rawStream);
    source.connect(this.workletNode);
    this.workletNode.connect(this.destination);

    return this.destination.stream.getAudioTracks()[0];
    // DEBUG: pipe clean track to speakers to verify it has audio
    const debugCtx = new AudioContext();
    const debugSrc = debugCtx.createMediaStreamSource(this.destination!.stream);
    debugSrc.connect(debugCtx.destination);
    console.log('[DF3 DEBUG] Piping cleanTrack to local speakers for testing');
  }

  debugAudioPipeline() {
    console.log('[DF3 DEBUG] AudioContext state:', this.audioCtx?.state);
    console.log('[DF3 DEBUG] AudioContext sampleRate:', this.audioCtx?.sampleRate);
    console.log('[DF3 DEBUG] WorkletNode:', this.workletNode ? 'exists' : 'null');
    console.log('[DF3 DEBUG] Destination:', this.destination ? 'exists' : 'null');
    console.log('[DF3 DEBUG] RawStream tracks:',
      this.rawStream?.getAudioTracks().map(t => ({
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        label: t.label
      }))
    );
    console.log('[DF3 DEBUG] Clean track:',
      this.destination?.stream.getAudioTracks().map(t => ({
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
      }))
    );
  }
}
