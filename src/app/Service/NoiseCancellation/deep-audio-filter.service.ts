import { Injectable } from '@angular/core';
import {
  VoiceFocusDeviceTransformer,
  VoiceFocusTransformDevice,
  VoiceFocusSpec
} from 'amazon-chime-sdk-js';


@Injectable({
  providedIn: 'root'
})
export class DeepAudioFilterService {
  private transformer: VoiceFocusDeviceTransformer | null = null;
  private transformDevice: VoiceFocusTransformDevice | null = null;
  private isSupported = false;


  constructor() { }

  // async applyZoomNoiseCancellation(rawStream: MediaStream): Promise<MediaStream> {
  //   const ctx = new AudioContext({ sampleRate: 48000 });

  //   try {
  //     // 1. Fetch WASM and Model
  //     const [wasmResponse, modelResponse] = await Promise.all([
  //       fetch('/assets/deepfilter/df_bg.wasm'),
  //       fetch('/assets/deepfilter/DeepFilterNet3_onnx.tar.gz')
  //     ]);

  //     const wasmBuffer = await wasmResponse.arrayBuffer();
  //     const modelBuffer = await modelResponse.arrayBuffer();

  //     // 2. Load BOTH Worklets
  //     await ctx.audioWorklet.addModule('/assets/deepfilter/DeepFilterWorklet.js');
  //     await ctx.audioWorklet.addModule('/assets/deepfilter/vad-gate-processor.js'); // <-- NEW

  //     // 3. Create the DeepFilter Node (The Denoise AI)
  //     const filterNode = new AudioWorkletNode(ctx, 'deepfilter-audio-processor', {
  //       processorOptions: {
  //         wasmModule: wasmBuffer,
  //         modelBytes: modelBuffer,
  //         suppressionLevel: 100
  //       }
  //     });

  //     // 4. Create the VAD Gate Node (The Silence Maker) <-- NEW
  //     const vadNode = new AudioWorkletNode(ctx, 'vad-gate-processor');

  //     // 5. Connect the Chain: Mic -> DeepFilter -> VAD Gate -> OpenVidu
  //     const source = ctx.createMediaStreamSource(rawStream);
  //     const destination = ctx.createMediaStreamDestination();
      
  //     // Chain them together!
  //     source.connect(filterNode).connect(vadNode).connect(destination);

  //     console.log("Zoom-Standard Active: DeepFilterNet3 + VAD Gate running.");
  //     return destination.stream;

  //   } catch (error) {
  //     console.error("Failed to initialize AI Audio, falling back:", error);
  //     return rawStream; 
  //   }
  // }

   async init(): Promise<boolean> {
    try {
      const spec: VoiceFocusSpec = { variant: 'auto' };

      this.transformer = await VoiceFocusDeviceTransformer.create(spec, {
        preload: false,  // don't load model until needed
        logger: undefined
      });

      this.isSupported = this.transformer.isSupported();
      console.log('✅ Voice Focus supported:', this.isSupported);
      return this.isSupported;

    } catch (err) {
      console.warn('⚠️ Voice Focus not supported on this device:', err);
      return false;
    }
  }

  async processStream(rawStream: MediaStream): Promise<MediaStream> {
    if (!this.transformer || !this.isSupported) {
      console.warn('Voice Focus not available, returning raw stream');
      return rawStream;
    }

    try {
      // Pass device label string or MediaStream — string is most reliable
      const deviceId = rawStream.getAudioTracks()[0]?.getSettings()?.deviceId;
      const device = deviceId ?? rawStream;

      this.transformDevice = await this.transformer
        .createTransformDevice(device as any);

      if (!this.transformDevice) {
        console.warn('Transform device creation failed');
        return rawStream;
      }

      // Get the processed audio stream
      const processedStream = await this.transformDevice
        .intrinsicDevice() as unknown as MediaStream;

      if (!processedStream || !processedStream.getAudioTracks) {
        return rawStream;
      }

      // Merge processed audio + original video (if any)
      const outputStream = new MediaStream();
      processedStream.getAudioTracks().forEach(t => outputStream.addTrack(t));
      rawStream.getVideoTracks().forEach(t => outputStream.addTrack(t));

      console.log('✅ Voice Focus applied successfully');
      return outputStream;

    } catch (err) {
      console.error('❌ Voice Focus processing failed:', err);
      return rawStream; // graceful fallback
    }
  }

  isActive(): boolean {
    return this.isSupported && this.transformDevice !== null;
  }

  destroy(): void {
    try {
      this.transformDevice?.stop();
    } catch (_) {}
    this.transformDevice = null;
    this.transformer = null;
    this.isSupported = false;
  }
}






