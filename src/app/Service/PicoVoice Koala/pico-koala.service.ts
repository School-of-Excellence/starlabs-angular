import { Injectable } from '@angular/core';
import { KoalaWorker } from '@picovoice/koala-web';
import { WebVoiceProcessor } from '@picovoice/web-voice-processor';
import { Room, Track, LocalAudioTrack } from 'livekit-client';
import { environment } from "../../../environments/environment";

@Injectable({
  providedIn: 'root'
})
export class PicoKoalaService {

  constructor() { }

  private koala: KoalaWorker | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private blobUrl: string | null = null;
  private enhancedTrack: MediaStreamTrack | null = null;

  private async loadInlineWorklet(audioContext: AudioContext): Promise<AudioWorkletNode> {
    const processorCode = `
      class KoalaProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this._buffer = [];
          this.port.onmessage = (event) => {
            this._buffer.push(...event.data);
          };
        }
        process(inputs, outputs) {
          const output = outputs[0][0];
          if (!output) return true;
          if (this._buffer.length >= output.length) {
            for (let i = 0; i < output.length; i++) {
              output[i] = this._buffer.shift();
            }
          } else {
            output.fill(0);
          }
          return true;
        }
      }
      registerProcessor('koala-processor', KoalaProcessor);
    `;

    this.blobUrl = URL.createObjectURL(
      new Blob([processorCode], { type: 'text/javascript' })
    );
    await audioContext.audioWorklet.addModule(this.blobUrl);
    return new AudioWorkletNode(audioContext, 'koala-processor');
  }

   // ── Official Koala processCallback — receives enhanced Int16Array per frame ─
  private onEnhancedAudio = (enhancedPcm: Int16Array): void => {
    if (!this.workletNode) return;

    // Convert Int16Array → Float32Array (Web Audio API uses Float32)
    const float32 = new Float32Array(enhancedPcm.length);
    for (let i = 0; i < enhancedPcm.length; i++) {
      float32[i] = enhancedPcm[i] / 32768.0;
    }

    // Send enhanced audio to AudioWorklet processor thread via MessagePort
    this.workletNode.port.postMessage(float32);
  }


  async init(): Promise<MediaStreamTrack> {
    // Official Koala: KoalaWorker.create(accessKey, processCallback, model)
    this.koala = await KoalaWorker.create(
      environment["picovoiceAccessKey"],
      (enhancedPcm) => this.onEnhancedAudio(enhancedPcm),
      { publicPath: 'assets/PicoVoice Koala/koala_params.pv' }
    );

    this.audioContext = new AudioContext({ sampleRate: this.koala.sampleRate });
    this.workletNode = await this.loadInlineWorklet(this.audioContext);

    const destination = this.audioContext.createMediaStreamDestination();
    this.workletNode.connect(destination);

    this.enhancedTrack = destination.stream.getAudioTracks()[0];
    return this.enhancedTrack;
  }

  async start(): Promise<void> {
    if (!this.koala) return;
      // ✅ Official fix: set WebVoiceProcessor frame length to match Koala's required frame length
    // Koala requires 256 samples per frame — WebVoiceProcessor defaults to 512, causing the error
    WebVoiceProcessor.setOptions({ frameLength: this.koala.frameLength });
     // Official Koala: reset before subscribing
    await this.koala.reset();
    // Official: Subscribe KoalaWorker to WebVoiceProcessor to start processing audio frames
    await WebVoiceProcessor.subscribe(this.koala);
  }

   async publishToRoom(room: Room): Promise<void> {
    if (!this.enhancedTrack) {
      throw new Error('Call init() first');
    }

    await room.localParticipant.publishTrack(
      this.enhancedTrack,
      {
        source: Track.Source.Microphone,  // tag it as mic so LiveKit handles it correctly
        name: 'koala-enhanced-audio',
      }
    );
  }

  async stop(): Promise<void> {
    if (!this.koala) return;
    // Official: Unsubscribe to stop processing audio frames
    await WebVoiceProcessor.unsubscribe(this.koala);
  }

  async reset(): Promise<void> {
    if (!this.koala) return;
    // Official: In case the next audio frame does not directly follow the previous one,
    // reset Koala Noise Suppression's internal state
    await this.koala.reset();
    await WebVoiceProcessor.subscribe(this.koala);
  }

  async release(): Promise<void> {
    if (!this.koala) return;
    // Official: Release resources explicitly when done
    await this.koala.release();
    this.koala = null;
     this.workletNode?.disconnect();
    this.workletNode = null;
    await this.audioContext?.close();
    this.audioContext = null;
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    this.enhancedTrack = null;
  }

}




