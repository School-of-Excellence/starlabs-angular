import { Injectable } from '@angular/core';
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import { LocalAudioTrack, Track } from 'livekit-client';

@Injectable({
  providedIn: 'root'
})
export class NoiseCancellationService {
  // private audioContext: AudioContext | null = null;
  // private rnnoiseNode: RnnoiseWorkletNode | null = null;
  // private stream: MediaStream | null = null;

  private audioContext: AudioContext | null = null;
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private originalStream: MediaStream | null = null;

  // // Exposed for metric overlay (Issue 2)
  // inputAnalyser: AnalyserNode | null = null;
  // outputAnalyser: AnalyserNode | null = null;
  // isRnnoiseActive = false;

  inputAnalyser: AnalyserNode | null = null;
  outputAnalyser: AnalyserNode | null = null;
  isRnnoiseActive = false;

  // async getCleanAudioTrack(inputStream: MediaStream): Promise<LocalAudioTrack> {

  //   this.audioContext = new AudioContext({
  //     sampleRate: 48000,
  //     latencyHint: 'interactive'
  //   });

  //   await this.audioContext.audioWorklet.addModule('/assets/wns/rnnoise/workletProcessor.js');

  //   const wasmBinary = await loadRnnoise({
  //     url: '/assets/wns/rnnoise.wasm',
  //     simdUrl: '/assets/wns/rnnoise_simd.wasm'
  //   });

  //   this.stream = inputStream;

  //   // ─────────────────────────────────────────────────────────────────────
  //   // Audio graph:
  //   //
  //   //  mic source (48kHz, echoCancellation handled by getUserMedia BEFORE
  //   //              this point — see enableMicrophoneWithNoiseCancellation)
  //   //      │
  //   //  inputGain (1.0)
  //   //  inputAnalyser           ← metric tap (Issue 2)
  //   //      │
  //   //  RnnoiseWorkletNode
  //   //      │
  //   //  outputGain (2.0)        ← compensates for RNNoise amplitude drop
  //   //  outputAnalyser          ← metric tap (Issue 2)
  //   //      │
  //   //  channelMerger (1→2)     ← guarantees both speakers on all platforms
  //   //      │
  //   //  destination (MediaStream) → LiveKit publishTrack
  //   // ─────────────────────────────────────────────────────────────────────

  //   const source = this.audioContext.createMediaStreamSource(this.stream);

  //   const inputGain = this.audioContext.createGain();
  //   inputGain.gain.value = 1.0;

  //   this.inputAnalyser = this.audioContext.createAnalyser();
  //   this.inputAnalyser.fftSize = 256;
  //   this.inputAnalyser.smoothingTimeConstant = 0.5;

  //   this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
  //     wasmBinary: wasmBinary,
  //     maxChannels: 1
  //   });

  //   const outputGain = this.audioContext.createGain();
  //   outputGain.gain.value = 2.0;

  //   this.outputAnalyser = this.audioContext.createAnalyser();
  //   this.outputAnalyser.fftSize = 256;
  //   this.outputAnalyser.smoothingTimeConstant = 0.5;

  //   const merger = this.audioContext.createChannelMerger(2);
  //   const destination = this.audioContext.createMediaStreamDestination();

  //   source.connect(inputGain);
  //   inputGain.connect(this.inputAnalyser);
  //   this.inputAnalyser.connect(this.rnnoiseNode);
  //   this.rnnoiseNode.connect(outputGain);
  //   outputGain.connect(this.outputAnalyser);
  //   this.outputAnalyser.connect(merger, 0, 0); // mono → left
  //   this.outputAnalyser.connect(merger, 0, 1); // mono → right
  //   merger.connect(destination);

  //   const processedTrack = destination.stream.getAudioTracks()[0];
  //   const localAudioTrack = new LocalAudioTrack(processedTrack, undefined, true);
  //   localAudioTrack.source = Track.Source.Microphone;
  //   this.isRnnoiseActive = true;

  //   return localAudioTrack;
  // }

  // async cleanup() {
  //   this.rnnoiseNode?.destroy();
  //   this.rnnoiseNode?.disconnect();
  //   this.stream?.getTracks().forEach(track => track.stop());
  //   await this.audioContext?.close();

  //   this.audioContext = null;
  //   this.rnnoiseNode = null;
  //   this.stream = null;
  //   this.inputAnalyser = null;
  //   this.outputAnalyser = null;
  //   this.isRnnoiseActive = false;
  // }

  async getCleanAudioTrack(inputStream: MediaStream): Promise<LocalAudioTrack> {
    // ✅ Store original stream to stop it later
    this.originalStream = inputStream;

    this.audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: 'interactive'
    });

    await this.audioContext.audioWorklet.addModule('/assets/wns/rnnoise/workletProcessor.js');

    const wasmBinary = await loadRnnoise({
      url: '/assets/wns/rnnoise.wasm',
      simdUrl: '/assets/wns/rnnoise_simd.wasm'
    });

    // Audio graph (FIXED):
    // mic source → inputGain → inputAnalyser → RNNoise → outputGain (1.3x) → outputAnalyser → destination

    const source = this.audioContext.createMediaStreamSource(inputStream);

    const inputGain = this.audioContext.createGain();
    inputGain.gain.value = 1.0;

    this.inputAnalyser = this.audioContext.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.5;

    this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
      wasmBinary: wasmBinary,
      maxChannels: 1
    });

    // ✅ FIX 1: Reduced gain from 2.0 to 1.3 to prevent distortion
    const outputGain = this.audioContext.createGain();
    outputGain.gain.value = 1.3; // Was 2.0

    this.outputAnalyser = this.audioContext.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.smoothingTimeConstant = 0.5;

    // ✅ FIX 2: Removed stereo merger - use mono output directly
    const merger = this.audioContext.createChannelMerger(2);
    const destination = this.audioContext.createMediaStreamDestination();

    // Connect audio graph
    source.connect(inputGain);
    inputGain.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(outputGain);
    outputGain.connect(this.outputAnalyser);
    // this.outputAnalyser.connect(destination); // Direct mono connection

    // ✅ Split mono to stereo (left and right)
    this.outputAnalyser.connect(merger, 0, 0); // mono → left channel
    this.outputAnalyser.connect(merger, 0, 1); // mono → right channel
    merger.connect(destination);

    const processedTrack = destination.stream.getAudioTracks()[0];
    const localAudioTrack = new LocalAudioTrack(processedTrack, undefined, true);
    localAudioTrack.source = Track.Source.Microphone;
    this.isRnnoiseActive = true;

    console.log('✅ RNNoise enabled - Gain:', outputGain.gain.value, 'Stereo output');
//                                                                  

    return localAudioTrack;
  }

  async cleanup() {
    console.log('🧹 Cleaning up RNNoise...');
    
    // ✅ FIX 3: Stop original stream to prevent echo
    if (this.originalStream) {
      this.originalStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped original track:', track.kind);
      });
      this.originalStream = null;
    }

    this.rnnoiseNode?.destroy();
    this.rnnoiseNode?.disconnect();
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    await this.audioContext?.close();

    this.audioContext = null;
    this.rnnoiseNode = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.isRnnoiseActive = false;
    
    console.log('✅ RNNoise cleanup complete');
  }
}

