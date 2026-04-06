import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DeepAudioFilterService {

  constructor() { }

  async applyZoomNoiseCancellation(rawStream: MediaStream): Promise<MediaStream> {
    const ctx = new AudioContext({ sampleRate: 48000 });

    try {
      // 1. Fetch WASM and Model
      const [wasmResponse, modelResponse] = await Promise.all([
        fetch('/assets/deepfilter/df_bg.wasm'),
        fetch('/assets/deepfilter/DeepFilterNet3_onnx.tar.gz')
      ]);

      const wasmBuffer = await wasmResponse.arrayBuffer();
      const modelBuffer = await modelResponse.arrayBuffer();

      // 2. Load BOTH Worklets
      await ctx.audioWorklet.addModule('/assets/deepfilter/DeepFilterWorklet.js');
      await ctx.audioWorklet.addModule('/assets/deepfilter/vad-gate-processor.js'); // <-- NEW

      // 3. Create the DeepFilter Node (The Denoise AI)
      const filterNode = new AudioWorkletNode(ctx, 'deepfilter-audio-processor', {
        processorOptions: {
          wasmModule: wasmBuffer,
          modelBytes: modelBuffer,
          suppressionLevel: 100
        }
      });

      // 4. Create the VAD Gate Node (The Silence Maker) <-- NEW
      const vadNode = new AudioWorkletNode(ctx, 'vad-gate-processor');

      // 5. Connect the Chain: Mic -> DeepFilter -> VAD Gate -> OpenVidu
      const source = ctx.createMediaStreamSource(rawStream);
      const destination = ctx.createMediaStreamDestination();
      
      // Chain them together!
      source.connect(filterNode).connect(vadNode).connect(destination);

      console.log("Zoom-Standard Active: DeepFilterNet3 + VAD Gate running.");
      return destination.stream;

    } catch (error) {
      console.error("Failed to initialize AI Audio, falling back:", error);
      return rawStream; 
    }
  }
}


