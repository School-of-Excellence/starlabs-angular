/// <reference lib="webworker" />
/**
 * Speech-to-text for live video subtitles, off the page's main thread:
 * Whisper (turbo / small) or, for live camera captions, Moonshine base.
 * Runs on WebGPU when the browser has it (WASM otherwise). Models download
 * from Hugging Face on first use and are cached by the browser.
 *
 * Messages in:  {type:'load', highAccuracy, english, live}
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
  /** Moonshine: works on the phrase's own length (no 30 s window), no timestamps. */
  moonshine?: boolean;
  /** English-only (.en) models take no language/task options. */
  englishOnly?: boolean;
  device: 'webgpu' | 'wasm';
  dtype: Record<string, string>;
  label: string;
}

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<void> | null = null;
let loadedKey = '';
let englishOnly = false;
let moonshine = false;

/**
 * High accuracy = Whisper large-v3-turbo (the reference transcript in the
 * mobile-app evaluation). Standard / no WebGPU = Whisper small (≈30% word
 * errors on the hall recording, vs 34.5% for base). Whisper hears the
 * original audio — noise removal before it made accuracy worse.
 */
/**
 * Live camera captions (standard accuracy, English): Moonshine base. Measured
 * on the same live-style phrases on a MacBook: 0.4 s per phrase at ~5% GPU,
 * as accurate as Whisper small (1.2 s, ~15% GPU) — Whisper always encodes a
 * 30 s window however short the phrase; Moonshine only the phrase. Turbo
 * was 6.6 s per phrase at ~82% GPU.
 */
function moonshineChoice(gpu: boolean): ModelChoice {
  return {
    model: 'onnx-community/moonshine-base-ONNX',
    moonshine: true,
    device: gpu ? 'webgpu' : 'wasm',
    dtype: gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : { encoder_model: 'q8', decoder_model_merged: 'q8' },
    label: gpu ? 'Moonshine base' : 'Moonshine base (CPU)',
  };
}

async function chooseModel(highAccuracy: boolean, english: boolean, live = false): Promise<ModelChoice> {
  // Whisper small, multilingual. (The English-only small.en returns empty
  // text in transformers.js 3.8 with timestamps on — tried and dropped.)
  void english;
  const small = 'onnx-community/whisper-small';
  const smallName = 'Whisper small';
  const gpu = (navigator as any).gpu;
  let adapter: any = null;
  try {
    adapter = gpu ? await gpu.requestAdapter() : null;
  } catch {
    adapter = null;
  }
  if (live && !highAccuracy && english) return moonshineChoice(!!adapter);
  if (!adapter) {
    return {
      model: small,
      device: 'wasm',
      dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
      label: `${smallName} (CPU)`,
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
  // The encoder at fp16 (not 4-bit): it hears the audio, and 4-bit there
  // cost noticeably more wrong words.
  const enc = f16 ? 'fp16' : 'fp32';
  return {
    model: small,
    device: 'webgpu',
    dtype: { encoder_model: enc, decoder_model_merged: 'q4' },
    label: `${smallName} (${enc} encoder)`,
  };
}

async function load(highAccuracy: boolean, english: boolean, live = false): Promise<void> {
  const choice = await chooseModel(highAccuracy, english, live);
  const key = `${choice.model}|${choice.device}|${JSON.stringify(choice.dtype)}`;
  if (asr && key === loadedKey) {
    englishOnly = !!choice.englishOnly;
    moonshine = !!choice.moonshine;
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
  englishOnly = !!choice.englishOnly;
  moonshine = !!choice.moonshine;
  // Warm up: the first WebGPU run compiles shaders (several seconds); do it
  // now on silence so the first real chunk isn't late.
  await asr(new Float32Array(16000), choice.moonshine ? { max_new_tokens: 8 } : { return_timestamps: true });
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
  if (moonshine) {
    // Moonshine: one line for the phrase (it gives no timestamps; live
    // phrases are short, and long text is split by caption shaping).
    const res: any = await asr(audio, { max_new_tokens: Math.ceil((lenMs / 1000) * 6.5) + 10 });
    const text = String(res?.text ?? '').trim();
    const segments: SpeechSegment[] = text ? [{ startMs, endMs: startMs + lenMs, text }] : [];
    postMessage({ type: 'result', id, segments, ms: performance.now() - t0 });
    return;
  }
  const out: any = await asr(audio, {
    return_timestamps: true,
    ...(englishOnly ? {} : { task: 'transcribe', ...(language ? { language } : {}) }),
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

/**
 * Messages are handled strictly one at a time, in order. Otherwise a model
 * switch (High accuracy toggled mid-sentence) disposed the model while a
 * transcription was still running in it, and WebAssembly crashed ("table
 * index is out of bounds" / "null function").
 */
let queue: Promise<void> = Promise.resolve();
/** Only the newest model switch matters when several queue up (quick toggles). */
let latestLoad = 0;

async function handle(data: any, loadNo: number): Promise<void> {
  try {
    if (data.type === 'load') {
      if (loadNo !== latestLoad) return;
      loading = load(!!data.highAccuracy, !!data.english, !!data.live);
      await loading;
      loading = null;
    } else if (data.type === 'transcribe') {
      await transcribe(data.id, data.audio, data.startMs, data.language ?? null);
    }
  } catch (e: any) {
    loading = null;
    postMessage({ type: 'error', id: data?.id, message: String(e?.message ?? e) });
  }
}

addEventListener('message', ({ data }) => {
  const loadNo = data.type === 'load' ? ++latestLoad : 0;
  queue = queue.then(() => handle(data, loadNo));
});
