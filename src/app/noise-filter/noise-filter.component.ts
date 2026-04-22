import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-noise-filter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './noise-filter.component.html',
  styleUrls: ['./noise-filter.component.css']
})
export class NoiseFilterComponent {

  mediaRecorder!: MediaRecorder;
  audioChunks: Blob[] = [];
  audioUrl: string | null = null;
  isRecording = false;

  audioContext!: AudioContext;
  destination!: MediaStreamAudioDestinationNode;

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        }
      });

      this.audioContext = new AudioContext();
const source = this.audioContext.createMediaStreamSource(stream);

// 🎯 High-pass (remove low rumble)
const highpass = this.audioContext.createBiquadFilter();
highpass.type = 'highpass';
highpass.frequency.value = 150;

// 🎯 Low-pass (remove harsh noise)
const lowpass = this.audioContext.createBiquadFilter();
lowpass.type = 'lowpass';
lowpass.frequency.value = 7000;

// 🔥 STRONG compressor (voice priority)
const compressor = this.audioContext.createDynamicsCompressor();
compressor.threshold.value = -35;
compressor.knee.value = 20;
compressor.ratio.value = 20;   // 🔥 stronger
compressor.attack.value = 0;
compressor.release.value = 0.2;

// 🔊 Gain boost (increase your voice)
const gain = this.audioContext.createGain();
gain.gain.value = 2.5; // 🔥 increase volume

// 🔥 Noise gate (KEY PART)
const analyser = this.audioContext.createAnalyser();
const dataArray = new Uint8Array(analyser.fftSize);

// Create gate gain
const gate = this.audioContext.createGain();
gate.gain.value = 1;

// Connect pipeline
source.connect(highpass);
highpass.connect(lowpass);
lowpass.connect(compressor);
compressor.connect(gain);
gain.connect(gate);
gate.connect(this.destination);

// 🔥 Noise gate logic
setInterval(() => {
  analyser.getByteTimeDomainData(dataArray);

  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += Math.abs(dataArray[i] - 128);
  }

  const volume = sum / dataArray.length;

  // 🔥 Adjust threshold here
  if (volume < 5) {
    gate.gain.value = 0; // mute background
  } else {
    gate.gain.value = 1; // allow voice
  }
}, 50);

// connect analyser
gain.connect(analyser);
      // 🎥 Record processed audio
      this.mediaRecorder = new MediaRecorder(this.destination.stream);

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.start();
      this.isRecording = true;

    } catch (err) {
      console.error('Mic error:', err);
    }
  }

  stopRecording() {
    this.mediaRecorder.stop();
    this.isRecording = false;

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioChunks = [];

      this.audioUrl = URL.createObjectURL(blob);
    };
  }
}
