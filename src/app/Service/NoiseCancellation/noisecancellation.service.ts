import { Injectable } from '@angular/core';
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import { LocalAudioTrack, Track } from 'livekit-client';

@Injectable({
  providedIn: 'root'
})
export class NoiseCancellationService {
  private audioContext: AudioContext | null = null;
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private stream: MediaStream | null = null;

  // Exposed for metric overlay (Issue 2)
  inputAnalyser: AnalyserNode | null = null;
  outputAnalyser: AnalyserNode | null = null;
  isRnnoiseActive = false;

  async getCleanAudioTrack(inputStream: MediaStream): Promise<LocalAudioTrack> {

    this.audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: 'interactive'
    });

    await this.audioContext.audioWorklet.addModule('/assets/wns/rnnoise/workletProcessor.js');

    const wasmBinary = await loadRnnoise({
      url: '/assets/wns/rnnoise.wasm',
      simdUrl: '/assets/wns/rnnoise_simd.wasm'
    });

    this.stream = inputStream;

    // ─────────────────────────────────────────────────────────────────────
    // Audio graph:
    //
    //  mic source (48kHz, echoCancellation handled by getUserMedia BEFORE
    //              this point — see enableMicrophoneWithNoiseCancellation)
    //      │
    //  inputGain (1.0)
    //  inputAnalyser           ← metric tap (Issue 2)
    //      │
    //  RnnoiseWorkletNode
    //      │
    //  outputGain (2.0)        ← compensates for RNNoise amplitude drop
    //  outputAnalyser          ← metric tap (Issue 2)
    //      │
    //  channelMerger (1→2)     ← guarantees both speakers on all platforms
    //      │
    //  destination (MediaStream) → LiveKit publishTrack
    // ─────────────────────────────────────────────────────────────────────

    const source = this.audioContext.createMediaStreamSource(this.stream);

    const inputGain = this.audioContext.createGain();
    inputGain.gain.value = 1.0;

    this.inputAnalyser = this.audioContext.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.5;

    this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
      wasmBinary: wasmBinary,
      maxChannels: 1
    });

    const outputGain = this.audioContext.createGain();
    outputGain.gain.value = 2.0;

    this.outputAnalyser = this.audioContext.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.smoothingTimeConstant = 0.5;

    const merger = this.audioContext.createChannelMerger(2);
    const destination = this.audioContext.createMediaStreamDestination();

    source.connect(inputGain);
    inputGain.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(outputGain);
    outputGain.connect(this.outputAnalyser);
    this.outputAnalyser.connect(merger, 0, 0); // mono → left
    this.outputAnalyser.connect(merger, 0, 1); // mono → right
    merger.connect(destination);

    const processedTrack = destination.stream.getAudioTracks()[0];
    const localAudioTrack = new LocalAudioTrack(processedTrack, undefined, true);
    localAudioTrack.source = Track.Source.Microphone;
    this.isRnnoiseActive = true;

    return localAudioTrack;
  }

  async cleanup() {
    this.rnnoiseNode?.destroy();
    this.rnnoiseNode?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    await this.audioContext?.close();

    this.audioContext = null;
    this.rnnoiseNode = null;
    this.stream = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.isRnnoiseActive = false;
  }
}

