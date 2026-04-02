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

  // Exposed so the metric overlay (Issue 2) can tap into these later
  inputAnalyser: AnalyserNode | null = null;
  outputAnalyser: AnalyserNode | null = null;

  // Whether RNNoise is active or we fell back to WebRTC
  isRnnoiseActive = false;

  async getCleanAudioTrack(inputStream: MediaStream): Promise<LocalAudioTrack> {

    // ✅ FIX 1: Use 'interactive' latency hint.
    //    Default 'balanced' adds ~40ms of extra buffering which
    //    worsens perceived compression and causes A/V drift.
    this.audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: 'interactive'
    });

    // Load worklet processor
    await this.audioContext.audioWorklet.addModule('/assets/wns/rnnoise/workletProcessor.js');

    // Load WASM binary
    const wasmBinary = await loadRnnoise({
      url: '/assets/wns/rnnoise.wasm',
      simdUrl: '/assets/wns/rnnoise_simd.wasm'
    });

    this.stream = inputStream;

    // ─────────────────────────────────────────────
    // Audio graph:
    //
    //  mic source
    //      │
    //  inputGain (0.8)      ← ✅ FIX 2: attenuate slightly before RNNoise
    //      │                   so hot mic signals don't saturate the model
    //  inputAnalyser        ← for metric overlay (Issue 2)
    //      │
    //  RnnoiseWorkletNode
    //      │
    //  outputGain (1.2)     ← ✅ FIX 3: restore natural speech dynamics
    //      │                   after RNNoise normalizes the signal down
    //  outputAnalyser       ← for metric overlay (Issue 2)
    //      │
    //  destination (MediaStream)
    // ─────────────────────────────────────────────

    const source = this.audioContext.createMediaStreamSource(this.stream);

    // ✅ FIX 2: Input gain — gently attenuate before RNNoise.
    //    At 1.0 (no gain) a hot mic can push RNNoise into treating
    //    the top of your speech waveform as noise and suppressing it.
    //    0.8 gives the model comfortable headroom.
    const inputGain = this.audioContext.createGain();
    inputGain.gain.value = 0.8;

    // Analyser for raw-mic level (used by metric overlay)
    this.inputAnalyser = this.audioContext.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.5;

    // Create RNNoise worklet node
    this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
      wasmBinary: wasmBinary,
      maxChannels: 1
    });

    // ✅ FIX 3: Output gain — compensate for RNNoise's normalized output.
    //    RNNoise outputs at a conservative level; boosting by 1.2
    //    brings speech back to a natural loudness without clipping.
    //    Adjust between 1.0–1.4 to taste.
    const outputGain = this.audioContext.createGain();
    outputGain.gain.value = 1.2;

    // Analyser for clean-mic level (used by metric overlay)
    this.outputAnalyser = this.audioContext.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.smoothingTimeConstant = 0.5;

    const destination = this.audioContext.createMediaStreamDestination();

    // Wire up the graph
    source.connect(inputGain);
    inputGain.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(outputGain);
    outputGain.connect(this.outputAnalyser);
    this.outputAnalyser.connect(destination);

    const processedTrack = destination.stream.getAudioTracks()[0];
    const localAudioTrack = new LocalAudioTrack(
      processedTrack,
      undefined,
      true
    );

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