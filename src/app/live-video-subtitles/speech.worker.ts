/// <reference lib="webworker" />
/**
 * Whisper speech-to-text for live video subtitles, off the page's main
 * thread. Runs on WebGPU when the browser has it (WASM otherwise). Models
 * download from Hugging Face on first use and are cached by the browser.
 *
 * Messages in:  {type:'load', highAccuracy}
 *               {type:'transcribe', id, audio: Float32Array (16 kHz mono),
 *                startMs, language: string | null}
 * Messages out: {type:'progress', file, loaded, total}
 *               {type:'ready', model, device, dtype}
 *               {type:'result', id, segments: SpeechSegment[], ms}
 *               {type:'error', id?, message}
 */
import {
  AutomaticSpeechRecognitionPipeline,
  pipeline,
} from '@huggingface/transformers';

import type { SpeechSegment } from './captions';

interface ModelChoice {
  model: string;
  device: 'webgpu' | 'wasm';
  dtype: Record<string, string>;
  label: string;
}

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<void> | null = null;
let loadedKey = '';

/**
 * High accuracy = Whisper large-v3-turbo (the reference transcript in the
 * mobile-app evaluation). Standard / no WebGPU = Whisper small (≈30% word
 * errors on the hall recording, vs 34.5% for base). Whisper hears the
 * original audio — noise removal before it made accuracy worse.
 */
async function chooseModel(highAccuracy: boolean): Promise<ModelChoice> {
  const gpu = (navigator as any).gpu;
  let adapter: any = null;
  try {
    adapter = gpu ? await gpu.requestAdapter() : null;
  } catch {
    adapter = null;
  }
  if (!adapter) {
    return {
      model: 'onnx-community/whisper-small',
      device: 'wasm',
      dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
      label: 'Whisper small (CPU)',
    };
  }
  const f16 = adapter.features?.has('shader-f16') === true;
  if (highAccuracy) {
    const q = f16 ? 'q4f16' : 'q4';
    return {
      model: 'onnx-community/whisper-large-v3-turbo',
      device: 'webgpu',
      dtype: { encoder_model: q, decoder_model_merged: q },
      label: `Whisper large-v3-turbo (${q})`,
    };
  }
  return {
    model: 'onnx-community/whisper-small',
    device: 'webgpu',
    dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' },
    label: 'Whisper small (q4)',
  };
}

async function load(highAccuracy: boolean): Promise<void> {
  const choice = await chooseModel(highAccuracy);
  const key = `${choice.model}|${choice.device}|${JSON.stringify(choice.dtype)}`;
  if (asr && key === loadedKey) {
    postMessage({ type: 'ready', model: choice.label, device: choice.device, dtype: choice.dtype });
    return;
  }
  if (asr) {
    await asr.dispose();
    asr = null;
  }
  asr = (await pipeline('automatic-speech-recognition', choice.model, {
    device: choice.device,
    dtype: choice.dtype as any,
    progress_callback: (p: any) => {
      if (p.status === 'progress') {
        postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
      }
    },
  })) as AutomaticSpeechRecognitionPipeline;
  loadedKey = key;
  // Warm up: the first WebGPU run compiles shaders (several seconds); do it
  // now on silence so the first real chunk isn't late.
  await asr(new Float32Array(16000), { return_timestamps: true });
  postMessage({ type: 'ready', model: choice.label, device: choice.device, dtype: choice.dtype });
}

async function transcribe(
  id: number,
  audio: Float32Array,
  startMs: number,
  language: string | null,
): Promise<void> {
  if (loading) await loading;
  if (!asr) throw new Error('Speech model is not loaded');
  const t0 = performance.now();
  const lenMs = (audio.length / 16000) * 1000;
  const out: any = await asr(audio, {
    return_timestamps: true,
    task: 'transcribe',
    ...(language ? { language } : {}),
  });
  const chunks: any[] = out?.chunks ?? [];
  const segments: SpeechSegment[] = chunks
    .map((c) => {
      const [s, e] = c.timestamp ?? [0, null];
      const a = Math.max(0, Math.round((s ?? 0) * 1000));
      const b = Math.min(lenMs, Math.round((e ?? lenMs / 1000) * 1000));
      return { startMs: startMs + a, endMs: startMs + Math.max(b, a), text: String(c.text ?? '') };
    })
    .filter((s) => s.text.trim().length > 0);
  postMessage({ type: 'result', id, segments, ms: performance.now() - t0 });
}

addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'load') {
      loading = load(!!data.highAccuracy);
      await loading;
      loading = null;
    } else if (data.type === 'transcribe') {
      await transcribe(data.id, data.audio, data.startMs, data.language ?? null);
    }
  } catch (e: any) {
    loading = null;
    postMessage({ type: 'error', id: data?.id, message: String(e?.message ?? e) });
  }
});
