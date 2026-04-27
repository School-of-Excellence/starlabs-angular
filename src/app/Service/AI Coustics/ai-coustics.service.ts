import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';



@Injectable({
  providedIn: 'root'
})
export class AiCousticsService {

  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private cleanStream: MediaStream | null = null;
  private outputNode: MediaStreamAudioDestinationNode | null = null;
  private socket: WebSocket | null = null;

  // Replace with your EC2 public IP
  private readonly AIC_WS_URL = 'ws://54.227.170.44:8080';

  async createCleanStream(rawStream: MediaStream): Promise<MediaStream> {
    await this.stop();

  this.audioContext = new AudioContext({ sampleRate: 48000 });

  if (this.audioContext.state === 'suspended') {
    await this.audioContext.resume();
  }

  // await this.audioContext.audioWorklet.addModule('/assets/audio-processor.js');
  await this.audioContext.audioWorklet.addModule(
  `/assets/audio-processor.js?v=${Date.now()}`
);

  const source = this.audioContext.createMediaStreamSource(rawStream);

  this.workletNode = new AudioWorkletNode(this.audioContext, 'aic-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });

  this.outputNode = this.audioContext.createMediaStreamDestination();

  this.socket = new WebSocket(this.AIC_WS_URL);
  this.socket.binaryType = 'arraybuffer';

  // ✅ Return a Promise that resolves only after first enhanced chunk arrives
  return new Promise((resolve, reject) => {
    let resolved = false;

    this.socket!.onopen = () => {
      console.log('✅ Connected to ai-coustics server');
    };

    this.socket!.onerror = (err) => {
      console.error('❌ ai-coustics WebSocket error:', err);
      if (!resolved) reject(err);
    };

    this.socket!.onclose = () => {
      console.warn('⚠️ ai-coustics WebSocket closed');
    };

    // Server → worklet
    this.socket!.onmessage = (event: MessageEvent) => {
      if (this.workletNode) {
        const buffer = event.data as ArrayBuffer;
        this.workletNode.port.postMessage(
          { type: 'enhanced', buffer },
          [buffer]
        );

        // ✅ Resolve only after first enhanced audio arrives
        if (!resolved) {
          resolved = true;
          console.log('🎙️ First enhanced chunk received — stream ready');
          resolve(this.outputNode!.stream);
        }
      }
    };

    // Worklet → server
    this.workletNode!.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'raw' &&
          this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(event.data.buffer);
      }
    };

    // Connect audio graph
    source.connect(this.workletNode!);
    this.workletNode!.connect(this.outputNode!);

    // Safety timeout — if no enhanced audio in 3s, fall back to raw stream
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('⚠️ ai-coustics timeout — falling back to raw stream');
        resolve(rawStream);
      }
    }, 3000);
  });
}


  async stop() {
    this.socket?.close();
    this.workletNode?.disconnect();
    await this.audioContext?.close();
    this.audioContext = null;
    this.workletNode = null;
    this.cleanStream = null;
    this.outputNode = null;
  }


}
