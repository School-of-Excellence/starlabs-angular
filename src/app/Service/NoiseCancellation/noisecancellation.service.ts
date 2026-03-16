import { Injectable } from '@angular/core';
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import { LocalAudioTrack } from 'livekit-client';

@Injectable({
  providedIn: 'root'
})
export class NoiseCancellationService {
  private audioContext: AudioContext | null = null;
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private stream: MediaStream | null = null;

  async getCleanAudioTrack(): Promise<LocalAudioTrack> {
    // Create audio context
    this.audioContext = new AudioContext({ sampleRate: 48000 });

    // Add worklet module FIRST
    await this.audioContext.audioWorklet.addModule('/assets/wns/rnnoise/workletProcessor.js');

    // Load WASM binary
    const wasmBinary = await loadRnnoise({
      url: '/assets/wns/rnnoise.wasm',
      simdUrl: '/assets/wns/rnnoise.wasm'
    });

    // Get microphone stream
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        sampleRate: 48000
      }
    });

    // Create RNNoise worklet node
    this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
      wasmBinary: wasmBinary,
      maxChannels: 1
    });

    // Connect audio graph
    const source = this.audioContext.createMediaStreamSource(this.stream);
    const destination = this.audioContext.createMediaStreamDestination();
    
    source.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(destination);

    // Create LiveKit audio track
    const processedTrack = destination.stream.getAudioTracks()[0];
    return new LocalAudioTrack(processedTrack);
  }

  async cleanup() {
    this.rnnoiseNode?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    await this.audioContext?.close();
    
    this.audioContext = null;
    this.rnnoiseNode = null;
    this.stream = null;
  }
}