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

  // ─── Hidden sink for AEC reference signal ────────────────────────────────
  // FIX (Issue 3 — Echo): The browser's AEC needs to "hear" what's being
  // played back in order to cancel it from the mic. When audio goes through
  // a Web Audio graph → MediaStreamDestination → LiveKit, the AEC loses its
  // playback reference and stops cancelling. We solve this by routing the
  // processed output to a SILENT (volume=0) <audio> element in the DOM.
  // This re-establishes the AEC reference path without the user hearing
  // themselves.
  private aecSinkElement: HTMLAudioElement | null = null;

  // Exposed for the metric overlay (Issue 2)
  inputAnalyser: AnalyserNode | null = null;
  outputAnalyser: AnalyserNode | null = null;
  isRnnoiseActive = false;

  async getCleanAudioTrack(inputStream: MediaStream): Promise<LocalAudioTrack> {

    // 'interactive' = minimum internal buffering (~5ms vs ~40ms for 'balanced')
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
    //  mic source (mono, 48kHz)
    //      │
    //  inputGain (1.0)         ← neutral; don't pre-attenuate
    //  inputAnalyser           ← metric tap (Issue 2)
    //      │
    //  RnnoiseWorkletNode
    //      │
    //  outputGain (2.0)        ← FIX 1: raised from 1.2 → 2.0
    //  outputAnalyser          ← metric tap (Issue 2)
    //      │
    //  channelMerger (1→2)     ← FIX 2: mono → explicit stereo
    //      │
    //  destination (MediaStream)
    //      ├─→ LiveKit publishTrack
    //      └─→ aecSinkElement (volume=0) ← FIX 3: AEC reference
    // ─────────────────────────────────────────────────────────────────────

    const source = this.audioContext.createMediaStreamSource(this.stream);

    // Neutral input gain — no pre-attenuation
    const inputGain = this.audioContext.createGain();
    inputGain.gain.value = 1.0;

    this.inputAnalyser = this.audioContext.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.5;

    this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
      wasmBinary: wasmBinary,
      maxChannels: 1
    });

    // FIX 1 — Low volume:
    // RNNoise applies a probability-weighted gate on each 480-sample frame.
    // Speech frames get weight ~0.9–1.0, silence frames ~0.0. This weighted
    // averaging drops the overall RMS amplitude to roughly 50% of the input.
    // 2.0 restores perceived loudness back to match a normal unprocessed mic.
    // If still too quiet on a specific device, raise to 2.5. If it clips
    // (distortion on loud voices), lower to 1.7.
    const outputGain = this.audioContext.createGain();
    outputGain.gain.value = 2.0;

    this.outputAnalyser = this.audioContext.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.smoothingTimeConstant = 0.5;

    // FIX 2 — One speaker side only:
    // RNNoise outputs mono (1 channel). createMediaStreamDestination()
    // inherits that channel count. When the browser plays a mono MediaStream
    // on a stereo device, OS behaviour is inconsistent:
    //   Chrome/Windows → left channel only
    //   macOS          → both channels
    //   Firefox        → varies by driver
    // Explicitly merging mono into both L and R channels of a ChannelMerger
    // guarantees both speakers always carry the signal on every platform.
    const merger = this.audioContext.createChannelMerger(2);

    const destination = this.audioContext.createMediaStreamDestination();

    // Wire the graph
    source.connect(inputGain);
    inputGain.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(outputGain);
    outputGain.connect(this.outputAnalyser);
    this.outputAnalyser.connect(merger, 0, 0); // mono → left channel
    this.outputAnalyser.connect(merger, 0, 1); // mono → right channel
    merger.connect(destination);

    // FIX 3 — Hearing own audio / echo:
    // When audio is routed through the Web Audio graph, the browser's
    // built-in AEC (Acoustic Echo Canceller) loses its playback reference —
    // it can no longer tell what "played back" audio to subtract from the mic.
    // Result: you hear yourself, and remote participants hear their own echo.
    //
    // The fix: attach the processed stream to a hidden <audio> element with
    // volume=0. This is purely a reference signal — the user hears nothing.
    // But the browser's AEC module sees this element playing, recognises the
    // audio as "local playback", and correctly cancels it from the mic input.
    //
    // IMPORTANT: volume=0 is correct. Do NOT use .muted=true — a muted
    // element is excluded from the AEC reference path entirely, which would
    // defeat the purpose. volume=0 plays silently but still registers.
    this.aecSinkElement = document.createElement('audio');
    this.aecSinkElement.srcObject = destination.stream;
    this.aecSinkElement.volume = 0;      // silent to user
    this.aecSinkElement.muted = false;   // must NOT be muted — see comment above
    this.aecSinkElement.autoplay = true;
    document.body.appendChild(this.aecSinkElement);
    this.aecSinkElement.play().catch(() => {});

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

    if (this.aecSinkElement) {
      this.aecSinkElement.pause();
      this.aecSinkElement.srcObject = null;
      this.aecSinkElement.remove();
      this.aecSinkElement = null;
    }

    this.audioContext = null;
    this.rnnoiseNode = null;
    this.stream = null;
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.isRnnoiseActive = false;
  }
}

