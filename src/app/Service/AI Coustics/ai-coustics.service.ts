import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const SAMPLE_RATE = 16000;
const NUM_FRAMES = 160;

const CAPTURE_WORKLET = `
  class CaptureProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this._buf = new Float32Array(${NUM_FRAMES});
      this._pos = 0;
    }
    process(inputs) {
      const ch = inputs[0]?.[0];
      if (!ch) return true;
      for (let i = 0; i < ch.length; i++) {
        this._buf[this._pos++] = ch[i];
        if (this._pos >= ${NUM_FRAMES}) {
          const copy = this._buf.slice().buffer;
          this.port.postMessage(copy, [copy]);
          this._pos = 0;
        }
      }
      return true;
    }
  }
  registerProcessor('aic-capture', CaptureProcessor);
`;

const PLAYBACK_WORKLET = `
  class PlaybackProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this._queue = [];
      this._current = null;
      this._offset = 0;
      this.port.onmessage = (e) => {
        this._queue.push(new Float32Array(e.data));
      };
    }
    process(_, outputs) {
      const out = outputs[0]?.[0];
      if (!out) return true;
      let i = 0;
      while (i < out.length) {
        if (!this._current || this._offset >= this._current.length) {
          this._current = this._queue.shift() ?? null;
          this._offset = 0;
        }
        if (!this._current) break;
        out[i++] = this._current[this._offset++];
      }
      return true;
    }
  }
  registerProcessor('aic-playback', PlaybackProcessor);
`;


@Injectable({
  providedIn: 'root'
})
export class AiCousticsService {

  constructor() { }

  private ws!: WebSocket;
  private audioCtx!: AudioContext;
  private playbackNode!: AudioWorkletNode;
  private captureNode!: AudioWorkletNode;
  private source!: MediaStreamAudioSourceNode;
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) {
      console.log('AudioFilterService already initialized');
      return;
    }

    const wsUrl = environment["aicWebSocketUrl"] ?? "";
    console.log(`🔌 Connecting to AIC backend: ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timed out after 10s'));
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('✅ AIC WebSocket connected');
        resolve();
      };

      this.ws.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error('WebSocket connection failed — is the AIC backend running?'));
      };
    });

    this.isInitialized = true;
  }

  async processStream(rawStream: MediaStream): Promise<MediaStream> {
  this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });

  // ✅ FIX 1: Resume AudioContext — browsers suspend it by default
  await this.audioCtx.resume();
  console.log('🔊 AudioContext state:', this.audioCtx.state); // must be "running"

  const captureBlob  = new Blob([CAPTURE_WORKLET],  { type: 'application/javascript' });
  const playbackBlob = new Blob([PLAYBACK_WORKLET], { type: 'application/javascript' });

  await this.audioCtx.audioWorklet.addModule(URL.createObjectURL(captureBlob));
  await this.audioCtx.audioWorklet.addModule(URL.createObjectURL(playbackBlob));

  this.source      = this.audioCtx.createMediaStreamSource(rawStream);
  this.captureNode = new AudioWorkletNode(this.audioCtx, 'aic-capture');

  let chunksSent = 0;
  this.captureNode.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      chunksSent++;
      // ✅ FIX 2: Log first 5 chunks to confirm mic audio is flowing
      if (chunksSent <= 5) {
        console.log(`📤 Sent chunk #${chunksSent} to backend (${data.byteLength} bytes)`);
      }
    }
  };

  this.source.connect(this.captureNode);

  this.playbackNode = new AudioWorkletNode(this.audioCtx, 'aic-playback');
  const destination = this.audioCtx.createMediaStreamDestination();
  this.playbackNode.connect(destination);

  let chunksReceived = 0;
  this.ws.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
    chunksReceived++;
    // ✅ FIX 3: Log first 5 responses to confirm backend is sending back audio
    if (chunksReceived <= 5) {
      console.log(`📥 Received chunk #${chunksReceived} from backend (${data.byteLength} bytes)`);
    }
    this.playbackNode.port.postMessage(data, [data]);
  };

  // ✅ FIX 4: Confirm the output stream has an audio track
  console.log('🎵 Output stream tracks:', destination.stream.getAudioTracks().length);
  console.log('🎵 Output track enabled:', destination.stream.getAudioTracks()[0]?.enabled);

  console.log('✅ AIC stream processing active');
  return destination.stream;
}

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  destroy(): void {
    try {
      this.captureNode?.disconnect();
      this.playbackNode?.disconnect();
      this.source?.disconnect();
      this.audioCtx?.close();
      this.ws?.close();
      this.isInitialized = false;
      console.log('🧹 AudioFilterService destroyed');
    } catch (err) {
      console.error('Error during AudioFilterService cleanup:', err);
    }
  }
}
