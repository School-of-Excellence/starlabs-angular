import { Injectable } from '@angular/core';
import { KoalaWorker } from '@picovoice/koala-web';
import { WebVoiceProcessor } from '@picovoice/web-voice-processor';

@Injectable({ providedIn: 'root' })
export class PicoVoiceKoalaService {

  private koala: KoalaWorker | null = null;
  private audioContext: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private silentGain: GainNode | null = null;
  private _isActive = false;
  private _subscribed = false;

  initTimeMs = 0;
  processingLatencyMs = 0;

  // Koala outputs enhanced PCM — we queue and play through AudioContext
  private outputQueue: Int16Array[] = [];
  private scriptProcessor: ScriptProcessorNode | null = null;

  async init(accessKey: string): Promise<boolean> {
    try {
      if (!accessKey?.trim()) {
        console.error('❌ KoalaService: AccessKey required');
        return false;
      }

      const t0 = performance.now();

      // Create KoalaWorker — exactly as per official docs
      // Using publicPath — model served from Angular assets folder
      this.koala = await KoalaWorker.create(
        accessKey,
        (enhancedPcm: Int16Array) => {
          // Callback receives enhanced 512-sample frames
          this.outputQueue.push(new Int16Array(enhancedPcm));
        },
        {
          publicPath: 'assets/PicoVoice/koala_params.pv',
          forceWrite: true,
        }
      );

      this.initTimeMs = Math.round(performance.now() - t0);
      console.log(`✅ Koala initialized in ${this.initTimeMs}ms`);
      console.log(`   frameLength: ${this.koala.frameLength}`);
      console.log(`   sampleRate: ${this.koala.sampleRate}`);
      return true;

    } catch (err) {
      console.error('❌ Koala init failed:', err);
      return false;
    }
  }

  async processStream(): Promise<MediaStream> {
    if (!this.koala) {
      console.warn('KoalaService: not initialised');
      throw new Error('Koala not initialized');
    }

    const t0 = performance.now();
    const frameLength = 256 // this.koala.frameLength; // ← read AFTER init, will be 256

    console.log(`Koala frameLength: ${frameLength}, sampleRate: ${this.koala.sampleRate}`);

    this.audioContext = new AudioContext({ sampleRate: this.koala.sampleRate });

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const ctx = this.audioContext;
    this.destination = ctx.createMediaStreamDestination();
    this.silentGain = ctx.createGain();
    this.silentGain.gain.value = 0;

    // ── ScriptProcessor buffer MUST be a power of 2 AND match frameLength ──
    // Koala requires exactly frameLength (256) samples per process() call.
    // ScriptProcessor valid sizes: 256, 512, 1024, 2048, 4096...
    // Since frameLength=256 is already a valid buffer size, use it directly.
    const bufferSize = frameLength; // 256

    this.scriptProcessor = ctx.createScriptProcessor(bufferSize, 1, 1);
    this.scriptProcessor.onaudioprocess = (event) => {
      const outputData = event.outputBuffer.getChannelData(0);
      if (this.outputQueue.length > 0) {
        const frame = this.outputQueue.shift()!;
        for (let i = 0; i < outputData.length; i++) {
          outputData[i] = i < frame.length ? frame[i] / 32768 : 0;
        }
      } else {
        outputData.fill(0);
      }
    };

    this.scriptProcessor.connect(this.destination);
    this.scriptProcessor.connect(this.silentGain);
    this.silentGain.connect(ctx.destination);

    // WebVoiceProcessor opens mic internally, resamples to 16kHz,
    // and feeds exactly frameLength=256 samples to Koala per call
    await WebVoiceProcessor.subscribe(this.koala);
    this._subscribed = true;
    this._isActive = true;

    this.processingLatencyMs = Math.round(performance.now() - t0);
    console.log(`✅ Koala active in ${this.processingLatencyMs}ms`);

    return this.destination.stream;
  }

  isActive():      boolean { return this._isActive; }
  isInitialized(): boolean { return !!this.koala; }
  getMicLevelDb(): number  { return -60; }

  destroy(): void {
    // Unsubscribe WebVoiceProcessor first
    if (this._subscribed && this.koala) {
      WebVoiceProcessor.unsubscribe(this.koala);
      this._subscribed = false;
    }

    try { this.scriptProcessor?.disconnect(); } catch (_) {}
    try { this.silentGain?.disconnect(); }       catch (_) {}
    try { this.destination?.disconnect(); }      catch (_) {}
    try { this.koala?.release(); }               catch (_) {}
    try { this.audioContext?.close(); }          catch (_) {}

    this.koala           = null;
    this.audioContext    = null;
    this.scriptProcessor = null;
    this.silentGain      = null;
    this.destination     = null;
    this._isActive       = false;
    this._subscribed     = false;
    this.outputQueue     = [];
    this.initTimeMs      = 0;
    this.processingLatencyMs = 0;
  }
}