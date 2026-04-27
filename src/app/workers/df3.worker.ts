// src/app/workers/df3.worker.ts
/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web';
import FFT from 'fft.js';

const FFT_SIZE      = 1024;
const HOP_SIZE      = 480;
const N_FREQS       = 513;
const N_ERB         = 32;
const N_DF_BINS     = 96;
const DF_ORDER      = 5;    // number of filter taps in coefs
const WARMUP_FRAMES = 10;

const fftInstance   = new FFT(FFT_SIZE);
const fftComplexBuf = fftInstance.createComplexArray();
const ifftComplexBuf= fftInstance.createComplexArray();

const DF3_MIN_FREQ = 0;      // Hz — DF3 starts from DC
const DF3_MAX_FREQ = 24000;  // Hz — Nyquist at 48kHz
const DF3_SAMPLE_RATE = 48000;

const hannWindow = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
}

const ERB_FILTERS = buildERBFilters(N_FREQS, N_ERB, 48000);

let enc: ort.InferenceSession;
let erbDec: ort.InferenceSession;
let dfDec: ort.InferenceSession;

let isReady = false;
let warmupFramesLeft = WARMUP_FRAMES;

// Ring buffer for deep filter — stores last DF_ORDER frames of spec
const dfSpecHistory: Float32Array[] = [];

self.onmessage = async (e: MessageEvent) => {

  if (e.data.type === 'init') {
  try {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = false;
    (ort.env.wasm as any).wasmPaths = {
      'ort-wasm.wasm':                    '/assets/ort-wasm/ort-wasm.wasm',
      'ort-wasm-simd.wasm':               '/assets/ort-wasm/ort-wasm.wasm',
      'ort-wasm-threaded.wasm':           '/assets/ort-wasm/ort-wasm.wasm',
      'ort-wasm-simd-threaded.wasm':      '/assets/ort-wasm/ort-wasm.wasm',
      'ort-wasm-simd.jsep.wasm':          '/assets/ort-wasm/ort-wasm.wasm',
      'ort-wasm-simd-threaded.jsep.wasm': '/assets/ort-wasm/ort-wasm.wasm',
      'ort-wasm-simd-threaded.jsep.mjs':  '/assets/ort-wasm/ort-wasm.wasm',
    };

    [enc, erbDec, dfDec] = await Promise.all([
      ort.InferenceSession.create('/assets/df3/enc.onnx',     { executionProviders: ['wasm'] }),
      ort.InferenceSession.create('/assets/df3/erb_dec.onnx', { executionProviders: ['wasm'] }),
      ort.InferenceSession.create('/assets/df3/df_dec.onnx',  { executionProviders: ['wasm'] }),
    ]);

    isReady = true;
    console.log('[DF3 Worker] ✅ Models loaded');
    console.log('[DF3] enc:', enc.inputNames, '->', enc.outputNames);
    console.log('[DF3] erbDec:', erbDec.inputNames, '->', erbDec.outputNames);
    console.log('[DF3] dfDec:', dfDec.inputNames, '->', dfDec.outputNames);
    self.postMessage({ type: 'ready', provider: 'wasm' });

    // ── Round-trip test (placed HERE, inside try, after models load) ──
    const testPcm = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      testPcm[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 48000);
    }
    const { real, imag } = computeSTFT(testPcm);
    const recovered = computeISTFT(real, imag);
    let inMax = 0, outMax = 0;
    for (let i = 0; i < HOP_SIZE; i++) {
      inMax  = Math.max(inMax,  Math.abs(testPcm[i] * hannWindow[i]));
      outMax = Math.max(outMax, Math.abs(recovered[i]));
    }
    console.log(`[DF3] Round-trip: inMax=${inMax.toFixed(4)} outMax=${outMax.toFixed(4)} ratio=${(outMax/inMax).toFixed(4)}`);

  } catch (err: any) {
    console.error('[DF3 Worker] ❌ Init failed:', err.message);
    self.postMessage({ type: 'error', message: err.message });
  }
}

  if (e.data.type === 'process' && isReady) {
    const inputPcm = new Float32Array(e.data.pcm);

    try {
      const cleanPcm = await processFrame(inputPcm);

      if (warmupFramesLeft > 0) {
        warmupFramesLeft--;
        const passthrough = new Float32Array(inputPcm);
        self.postMessage({ type: 'processed', pcm: passthrough, isWarmup: true },
          [passthrough.buffer]);
        return;
      }

      self.postMessage({ type: 'processed', pcm: cleanPcm, isWarmup: false },
        [cleanPcm.buffer]);

    } catch (err: any) {
      console.error('[DF3] ❌ processFrame error:', err?.message);
      const fallback = new Float32Array(inputPcm);
      self.postMessage({ type: 'processed', pcm: fallback, isWarmup: false },
        [fallback.buffer]);
    }
  }

  if (e.data.type === 'mute') {
    warmupFramesLeft = WARMUP_FRAMES;
    dfSpecHistory.length = 0;
    self.postMessage({ type: 'muted' });
  }

  if (e.data.type === 'unmute') {
    self.postMessage({ type: 'unmuted' });
  }

  if (e.data.type === 'reset') {
    warmupFramesLeft = WARMUP_FRAMES;
    dfSpecHistory.length = 0;
    self.postMessage({ type: 'reset_done' });
  }
};

async function processFrame(pcm: Float32Array): Promise<Float32Array> {
  const frameNum = (processFrame as any)._n = ((processFrame as any)._n || 0) + 1;

  // PURE PASSTHROUGH: STFT then immediately iSTFT, no model
  const { real, imag } = computeSTFT(pcm);
  const result = computeISTFT(real, imag);

  if (frameNum % 50 === 0) {
    let inMax = 0, outMax = 0;
    for (let i = 0; i < pcm.length; i++)    inMax  = Math.max(inMax,  Math.abs(pcm[i]));
    for (let i = 0; i < result.length; i++) outMax = Math.max(outMax, Math.abs(result[i]));
    console.log(`[DF3] f=${frameNum} pcmInMax=${inMax.toFixed(5)} pcmOutMax=${outMax.toFixed(5)}`);
  }

  return result;
}

function computeSTFT(pcm: Float32Array): { real: Float32Array, imag: Float32Array } {
  const windowed = new Float32Array(FFT_SIZE);
  for (let i = 0; i < Math.min(pcm.length, FFT_SIZE); i++) {
    windowed[i] = pcm[i] * hannWindow[i];
  }

  fftInstance.realTransform(fftComplexBuf, windowed);
  fftInstance.completeSpectrum(fftComplexBuf);

  const real = new Float32Array(N_FREQS);
  const imag = new Float32Array(N_FREQS);
  for (let i = 0; i < N_FREQS; i++) {
    real[i] = fftComplexBuf[i * 2];
    imag[i] = fftComplexBuf[i * 2 + 1];
  }
  return { real, imag };
}

function computeISTFT(real: Float32Array, imag: Float32Array): Float32Array {
  for (let i = 0; i < N_FREQS; i++) {
    ifftComplexBuf[i * 2]     = real[i];
    ifftComplexBuf[i * 2 + 1] = imag[i];
  }
  for (let i = 1; i < FFT_SIZE / 2; i++) {
    ifftComplexBuf[(FFT_SIZE - i) * 2]     =  real[i];
    ifftComplexBuf[(FFT_SIZE - i) * 2 + 1] = -imag[i];
  }

  const timeDomain = fftInstance.createComplexArray();
  fftInstance.inverseTransform(timeDomain, ifftComplexBuf);

  const output = new Float32Array(HOP_SIZE);
  // fft.js inverseTransform DOES divide by N internally.
  // We only need factor 2 for one-sided spectrum (we only set N/2+1 bins).
  const scale = 1.0;
  for (let i = 0; i < HOP_SIZE; i++) {
    output[i] = timeDomain[i * 2] * scale;
  }
  return output;
}
function computeERBFeatures(real: Float32Array, imag: Float32Array): Float32Array {
  const erbEnergy = new Float32Array(N_ERB);
  const nyquist = 24000;

  for (let i = 0; i < N_FREQS; i++) {
    const power = real[i] * real[i] + imag[i] * imag[i];
    const band = ERB_FILTERS[i]; // now float, not integer

    // Distribute energy to two neighbouring bands (linear interp)
    const lo = Math.floor(band);
    const hi = Math.ceil(band);
    const frac = band - lo;

    if (lo >= 0 && lo < N_ERB) erbEnergy[lo] += (1 - frac) * power;
    if (hi >= 0 && hi < N_ERB) erbEnergy[hi] += frac * power;
  }

  const features = new Float32Array(N_ERB);
  for (let b = 0; b < N_ERB; b++) {
    // DF3 uses 10*log10(energy) normalized — match training preprocessing
    features[b] = Math.log(Math.max(erbEnergy[b], 1e-10));
  }
  return features;
}

function applyERBGains(
  real: Float32Array, imag: Float32Array, gains: Float32Array
): { real: Float32Array, imag: Float32Array } {
  const outReal = new Float32Array(N_FREQS);
  const outImag = new Float32Array(N_FREQS);

  for (let i = 0; i < N_FREQS; i++) {
    const band = ERB_FILTERS[i];
    const lo = Math.floor(band);
    const hi = Math.min(Math.ceil(band), N_ERB - 1);
    const frac = band - lo;

    // Interpolate gain between two bands
    const gain = (1 - frac) * gains[lo] + frac * gains[Math.min(hi, N_ERB - 1)];
    outReal[i] = real[i] * gain;
    outImag[i] = imag[i] * gain;
  }
  return { real: outReal, imag: outImag };
}

function applyDFCoefs(
  real: Float32Array, imag: Float32Array,
  coefs: Float32Array // [N_DF_BINS * 2] interleaved real/imag for center tap
): { real: Float32Array, imag: Float32Array } {
  const outReal = new Float32Array(real);
  const outImag = new Float32Array(imag);
  for (let f = 0; f < N_DF_BINS; f++) {
    const cr = coefs[f * 2];
    const ci = coefs[f * 2 + 1];
    const xr = real[f];
    const xi = imag[f];
    outReal[f] = xr * cr - xi * ci;
    outImag[f] = xr * ci + xi * cr;
  }
  return { real: outReal, imag: outImag };
}

function buildERBFilters(nFreqs: number, nBands: number, sr: number): Float32Array {
  // DF3 uses mel-like ERB with these exact boundaries
  const nyquist = sr / 2;
  const filters = new Float32Array(nFreqs);

  // Compute ERB center frequencies the way DF3 does it:
  // erb_low = hz2erb(0), erb_high = hz2erb(nyquist)
  // bands are linearly spaced in ERB domain
  const erbLow  = hz2erb(0);
  const erbHigh = hz2erb(nyquist);

  // For each FFT bin, find which ERB band it belongs to
  for (let i = 0; i < nFreqs; i++) {
    const hz  = i * nyquist / (nFreqs - 1);
    const erb = hz2erb(hz);
    // Linear interpolation in ERB domain
    const band = (erb - erbLow) / (erbHigh - erbLow) * (nBands - 1);
    filters[i] = Math.max(0, Math.min(nBands - 1, band));
  }
  return filters;
}

function hz2erb(hz: number): number {
  // DF3 exact formula from df/transform.py
  return 9.265 * Math.log(1 + hz / (24.7 * 9.265));
}
