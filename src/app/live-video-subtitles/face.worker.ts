/// <reference lib="webworker" />
/**
 * Face detection + identity embeddings for live video subtitles, off the
 * page's main thread (ONNX Runtime Web, WebGPU when available).
 *
 * - Detection: InsightFace SCRFD-500M (`buffalo_s`), which finds the small,
 *   distant faces of a hall recording (MediaPipe's own detector is a
 *   short-range "selfie" model and misses them) and gives the 5 points
 *   ArcFace alignment needs.
 * - Identity: ArcFace MobileFaceNet from the same pack — the exact model the
 *   AH-CRM app used to make the `face_detection` vectors — on 112×112 faces
 *   aligned to the InsightFace template, L2-normalized.
 *
 * Messages in:  {type:'load'}
 *               {type:'frame', id, bitmap: ImageBitmap}
 *               {type:'embed', id, indices: number[]}  (faces of frame `id`)
 * Messages out: {type:'progress', loaded, total}
 *               {type:'ready', device}
 *               {type:'faces', id, faces: WorkerFace[], ms}  (no embeddings)
 *               {type:'embeddings', id, embeddings: Float32Array[], ms}
 *               {type:'error', id?, message}
 *
 * Identity vectors are computed only for the faces the tracker asks for
 * (new faces, and a periodic re-check), not for every face in every frame.
 */
import * as ort from 'onnxruntime-web/webgpu';

import type { WorkerFace } from './speakers';

const DET_URL = 'https://huggingface.co/immich-app/buffalo_s/resolve/main/detection/model.onnx';
const REC_URL = 'https://huggingface.co/immich-app/buffalo_s/resolve/main/recognition/model.onnx';
const DET_SIZE = 640;
const DET_SCORE = 0.5;
const NMS_IOU = 0.4;
const REC_SIZE = 112;
const MIN_FACE_FRAC = 0.1; // of frame height
const MAX_FACES = 4;
// InsightFace reference points for a 112×112 aligned face.
const REF = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

ort.env.wasm.wasmPaths =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/';
ort.env.wasm.numThreads = (self as any).crossOriginIsolated ? 4 : 1;

let det: ort.InferenceSession | null = null;
let rec: ort.InferenceSession | null = null;
let device = '';

/** Fetch a model once; kept in the Cache API so later visits skip the download. */
async function fetchModel(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open('lvs-face-models');
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  try {
    await cache?.put(url, new Response(out.slice()));
  } catch {
    /* cache full or unavailable: fine, it just downloads again next time */
  }
  return out;
}

async function load(): Promise<void> {
  if (det && rec) {
    postMessage({ type: 'ready', device });
    return;
  }
  const total = 2524817 + 13616099;
  let loaded = 0;
  const onBytes = (k: number) => {
    loaded += k;
    postMessage({ type: 'progress', loaded, total });
  };
  const [detBytes, recBytes] = await Promise.all([
    fetchModel(DET_URL, onBytes),
    fetchModel(REC_URL, onBytes),
  ]);
  const gpu = (navigator as any).gpu ? await (navigator as any).gpu.requestAdapter().catch(() => null) : null;
  const [d, dDev] = await createSession(detBytes, !!gpu);
  const [r, rDev] = await createSession(recBytes, !!gpu);
  det = d;
  rec = r;
  device = `detect ${dDev}, ID ${rDev}`;
  postMessage({ type: 'ready', device });
}

/**
 * WebGPU when it can run the model, else WASM. (ORT throws rather than
 * falling back when a WebGPU kernel is missing — ArcFace MobileFaceNet hits
 * this — so each model is tried on its own.)
 */
async function createSession(bytes: Uint8Array, gpu: boolean): Promise<[ort.InferenceSession, string]> {
  if (gpu) {
    try {
      return [await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] }), 'webgpu'];
    } catch {
      /* fall through to WASM */
    }
  }
  return [await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }), 'wasm'];
}

// ── Detection (SCRFD) ────────────────────────────────────────────────────

let detCanvas: OffscreenCanvas | null = null;

async function detect(bitmap: ImageBitmap): Promise<{ box: number[]; kps: number[]; score: number }[]> {
  const scale = Math.min(DET_SIZE / bitmap.width, DET_SIZE / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  detCanvas ??= new OffscreenCanvas(DET_SIZE, DET_SIZE);
  const ctx = detCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, DET_SIZE, DET_SIZE);
  ctx.drawImage(bitmap, 0, 0, w, h); // letterbox top-left, like insightface
  const px = ctx.getImageData(0, 0, DET_SIZE, DET_SIZE).data;
  const area = DET_SIZE * DET_SIZE;
  const input = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    input[i] = (px[i * 4] - 127.5) / 128;
    input[area + i] = (px[i * 4 + 1] - 127.5) / 128;
    input[2 * area + i] = (px[i * 4 + 2] - 127.5) / 128;
  }
  const feeds = { [det!.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, DET_SIZE, DET_SIZE]) };
  const out = await det!.run(feeds);

  // Group the 9 outputs by row count (one group per stride) and by width:
  // 1 = score, 4 = box distances, 10 = keypoints.
  const groups = new Map<number, { s?: Float32Array; b?: Float32Array; k?: Float32Array }>();
  for (const name of det!.outputNames) {
    const t = out[name];
    const dims = t.dims;
    const width = dims[dims.length - 1];
    const rows = (t.data as Float32Array).length / width;
    const g = groups.get(rows) ?? {};
    const data = t.data as Float32Array;
    if (width === 1) g.s = data;
    else if (width === 4) g.b = data;
    else if (width === 10) g.k = data;
    groups.set(rows, g);
  }
  const cands: { box: number[]; kps: number[]; score: number }[] = [];
  groups.forEach((g, rows) => {
    if (!g.s || !g.b || !g.k) return;
    // rows = (640/stride)² × anchors(2)
    const stride = Math.round(Math.sqrt((area * 2) / rows));
    const cols = DET_SIZE / stride;
    const anchors = rows / (cols * cols);
    for (let i = 0; i < rows; i++) {
      const score = g.s[i];
      if (score < DET_SCORE) continue;
      const cell = Math.floor(i / anchors);
      const cx = (cell % cols) * stride;
      const cy = Math.floor(cell / cols) * stride;
      const x1 = (cx - g.b[i * 4] * stride) / scale;
      const y1 = (cy - g.b[i * 4 + 1] * stride) / scale;
      const x2 = (cx + g.b[i * 4 + 2] * stride) / scale;
      const y2 = (cy + g.b[i * 4 + 3] * stride) / scale;
      const kps: number[] = [];
      for (let k = 0; k < 5; k++) {
        kps.push((cx + g.k[i * 10 + k * 2] * stride) / scale, (cy + g.k[i * 10 + k * 2 + 1] * stride) / scale);
      }
      cands.push({ box: [x1, y1, x2 - x1, y2 - y1], kps, score });
    }
  });
  cands.sort((a, b) => b.score - a.score);
  const keep: typeof cands = [];
  for (const c of cands) {
    if (keep.every((k) => iou(k.box, c.box) < NMS_IOU)) keep.push(c);
  }
  return keep;
}

function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return i / (a[2] * a[3] + b[2] * b[3] - i || 1);
}

// ── Identity (ArcFace) ───────────────────────────────────────────────────

/** Least-squares similarity transform [a, b, tx, ty] mapping src → dst. */
function similarity(src: number[][], dst: number[][]): number[] {
  const ata = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const atb = [0, 0, 0, 0];
  const add = (r: number[], d: number) => {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) ata[i][j] += r[i] * r[j];
      atb[i] += r[i] * d;
    }
  };
  for (let k = 0; k < src.length; k++) {
    const [sx, sy] = src[k];
    add([sx, -sy, 1, 0], dst[k][0]);
    add([sy, sx, 0, 1], dst[k][1]);
  }
  // Gaussian elimination with partial pivoting.
  const m = ata.map((row, i) => [...row, atb[i]]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c];
    if (Math.abs(d) < 1e-12) continue;
    for (let j = c; j <= 4; j++) m[c][j] /= d;
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = m[r][c];
      for (let j = c; j <= 4; j++) m[r][j] -= f * m[c][j];
    }
  }
  return [m[0][4], m[1][4], m[2][4], m[3][4]];
}

/** Warp the face onto the 112×112 template and build the NCHW input. */
function alignedInput(px: Uint8ClampedArray, W: number, H: number, kps: number[]): Float32Array {
  const src = [0, 1, 2, 3, 4].map((i) => [kps[i * 2], kps[i * 2 + 1]]);
  const [a, b, tx, ty] = similarity(src, REF);
  const det = a * a + b * b;
  const ia = a / det;
  const ib = b / det;
  const area = REC_SIZE * REC_SIZE;
  const out = new Float32Array(3 * area);
  const at = (x: number, y: number, c: number) =>
    px[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4 + c];
  for (let y = 0; y < REC_SIZE; y++) {
    for (let x = 0; x < REC_SIZE; x++) {
      const dx = x - tx;
      const dy = y - ty;
      const sx = ia * dx + ib * dy;
      const sy = -ib * dx + ia * dy;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const idx = y * REC_SIZE + x;
      for (let c = 0; c < 3; c++) {
        const top = at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx;
        const bot = at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx;
        const v = Math.round(top * (1 - fy) + bot * fy);
        out[c * area + idx] = (v - 127.5) / 127.5;
      }
    }
  }
  return out;
}

async function embed(input: Float32Array): Promise<Float32Array> {
  const out = await rec!.run({
    [rec!.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, REC_SIZE, REC_SIZE]),
  });
  const v = Float32Array.from(out[rec!.outputNames[0]].data as Float32Array);
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

// ── Frames ───────────────────────────────────────────────────────────────

let frameCanvas: OffscreenCanvas | null = null;
/** The last frame's pixels and faces, kept for a follow-up 'embed'. */
let last: { id: number; px: Uint8ClampedArray; W: number; H: number; kps: number[][] } | null = null;

async function onFrame(id: number, bitmap: ImageBitmap): Promise<void> {
  const t0 = performance.now();
  const W = bitmap.width;
  const H = bitmap.height;
  // Only the people in the conversation: small background faces (an
  // audience) cost time and can't be lip-read anyway.
  const found = (await detect(bitmap))
    .filter((f) => f.box[3] >= H * MIN_FACE_FRAC)
    .sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])
    .slice(0, MAX_FACES);
  last = null;
  if (found.length) {
    if (!frameCanvas || frameCanvas.width !== W || frameCanvas.height !== H) {
      frameCanvas = new OffscreenCanvas(W, H);
    }
    const ctx = frameCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    last = { id, px: ctx.getImageData(0, 0, W, H).data, W, H, kps: found.map((f) => f.kps) };
  }
  bitmap.close();
  const faces: WorkerFace[] = found.map((f) => ({ box: f.box as WorkerFace['box'], kps: f.kps, score: f.score }));
  postMessage({ type: 'faces', id, faces, ms: performance.now() - t0 });
}

async function onEmbed(id: number, indices: number[]): Promise<void> {
  const t0 = performance.now();
  if (!last || last.id !== id) throw new Error('frame is gone');
  const embeddings: Float32Array[] = [];
  for (const i of indices) embeddings.push(await embed(alignedInput(last.px, last.W, last.H, last.kps[i])));
  postMessage({ type: 'embeddings', id, embeddings, ms: performance.now() - t0 });
}

/** One message at a time, in order (ONNX Runtime sessions aren't re-entrant). */
let queue: Promise<void> = Promise.resolve();

async function handle(data: any): Promise<void> {
  try {
    if (data.type === 'load') await load();
    else if (data.type === 'frame') await onFrame(data.id, data.bitmap);
    else if (data.type === 'embed') await onEmbed(data.id, data.indices);
  } catch (e: any) {
    data?.bitmap?.close?.();
    postMessage({ type: 'error', id: data?.id, message: String(e?.message ?? e) });
  }
}

addEventListener('message', ({ data }) => {
  queue = queue.then(() => handle(data));
});
