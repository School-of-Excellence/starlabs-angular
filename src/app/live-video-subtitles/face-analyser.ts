/**
 * Reads frames AHEAD of the playhead (from a hidden second <video> on the
 * same file) and measures every conversation-sized face in them:
 *   - face box, 5 points and ArcFace identity vector → face.worker.ts
 *   - how open the mouth is and which way the head is turned → MediaPipe
 *     Face Mesh on a 1.5× crop around each face (the same detect-then-crop
 *     design as the mobile app; Face Mesh's own detector misses small faces).
 * Browser-only; created on demand when names are switched on.
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

import type { EmbedFn, MeasuredFace, WorkerFace } from './speakers';

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const FACE_MESH_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
/** Frames are read at most this wide (sharper faces than the 640 detector input). */
const MAX_FRAME_W = 1280;
const CROP_SIZE = 256;
/** Head turned more than this is "side-on": lips aren't read. */
export const MAX_YAW_DEG = 45;
/** Turned more than this: too side-on to match against profiles. */
export const MAX_ID_YAW_DEG = 60;
/**
 * A 2×2 multi-camera split screen is recognised by the edges down and across
 * the frame's middle: how many times stronger than a usual line of the
 * picture. Measured 8–21× on a multi-cam video, under 2.5× on a single camera.
 */
const SEAM_RATIO = 5;
/** Frames looked at to decide that; most must show both seams. */
const LAYOUT_FRAMES = 5;

export interface AnalyserTimings {
  frames: number;
  seekMs: number;
  workerMs: number;
  meshMs: number;
  embedMs: number;
  embeds: number;
}

export class FaceAnalyser {
  private worker: Worker;
  private video: HTMLVideoElement;
  /** Reading a live camera <video>: frames are taken as they are, no seeking. */
  private readonly live: boolean;
  private canvas = document.createElement('canvas');
  private crop = document.createElement('canvas');
  private mesh: FaceLandmarker | null = null;
  private nextId = 1;
  private waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private ready: Promise<string> | null = null;
  private onReady: ((device: string) => void) | null = null;
  private onFail: ((e: Error) => void) | null = null;
  readonly timings: AnalyserTimings = { frames: 0, seekMs: 0, workerMs: 0, meshMs: 0, embedMs: 0, embeds: 0 };
  /** Which MediaPipe delegate the lip reader runs on ('GPU' / 'CPU'). */
  meshDelegate = '';
  /** Last measured yaw values (diagnostics / calibration). */
  lastYaws: number[] = [];
  /** Cameras in a split screen (x, y, w, h in frame pixels); null = one picture. */
  panes: number[][] | null = null;
  private layoutSeen = 0;
  private layoutVotes = 0;

  /**
   * `source`: a file's URL (frames are read from a hidden copy, seeking
   * ahead of the playhead) or a live camera <video> (its current frame).
   */
  constructor(
    source: string | HTMLVideoElement,
    private readonly onProgress: (pct: number) => void,
  ) {
    this.worker = new Worker(new URL('./face.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.onWorker(data);
    this.live = typeof source !== 'string';
    if (typeof source === 'string') {
      this.video = document.createElement('video');
      this.video.muted = true;
      this.video.preload = 'auto';
      this.video.playsInline = true;
      this.video.src = source;
    } else {
      this.video = source;
    }
    this.crop.width = this.crop.height = CROP_SIZE;
  }

  /** Download/load the models; resolves with the device the worker uses. */
  init(): Promise<string> {
    if (this.ready) return this.ready;
    const workerReady = new Promise<string>((resolve, reject) => {
      this.onReady = resolve;
      this.onFail = reject;
    });
    this.worker.postMessage({ type: 'load' });
    const meshReady = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: FACE_MESH_MODEL, delegate },
        runningMode: 'IMAGE' as const,
        numFaces: 1,
        minFaceDetectionConfidence: 0.4,
        outputFacialTransformationMatrixes: true,
      });
      try {
        this.mesh = await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
        this.meshDelegate = 'GPU';
      } catch (e) {
        console.warn('Face Mesh GPU delegate unavailable, using CPU', e);
        this.mesh = await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
        this.meshDelegate = 'CPU';
      }
    })();
    const videoReady = new Promise<void>((resolve, reject) => {
      if (this.video.readyState >= 2) return resolve();
      this.video.addEventListener('loadeddata', () => resolve(), { once: true });
      this.video.addEventListener('error', () => reject(new Error('video could not be read for faces')), {
        once: true,
      });
    });
    const layoutReady = videoReady.then(() => (this.live ? undefined : this.scanLayout()));
    this.ready = Promise.all([workerReady, meshReady, layoutReady]).then(([device]) => device);
    return this.ready;
  }

  private onWorker(data: any): void {
    if (data.type === 'progress') {
      this.onProgress(Math.round((data.loaded / data.total) * 100));
    } else if (data.type === 'ready') {
      this.onReady?.(data.device);
    } else if (data.type === 'faces' || data.type === 'embeddings') {
      const w = this.waiting.get(data.id);
      this.waiting.delete(data.id);
      if (data.type === 'faces') {
        this.timings.workerMs += data.ms;
        w?.resolve(data.faces);
      } else {
        this.timings.embedMs += data.ms;
        this.timings.embeds += data.embeddings.length;
        w?.resolve(data.embeddings);
      }
    } else if (data.type === 'error') {
      const w = data.id != null ? this.waiting.get(data.id) : undefined;
      if (w) {
        this.waiting.delete(data.id);
        w.reject(new Error(data.message));
      } else {
        this.onFail?.(new Error(data.message));
      }
    }
  }

  /**
   * Measure the faces at video time `tMs` (live: the current frame, `tMs`
   * unused). `embed` gets identity vectors for chosen faces of this frame
   * (call it before analysing the next frame).
   */
  async analyse(tMs: number): Promise<{ faces: MeasuredFace[]; embed: EmbedFn }> {
    const t0 = performance.now();
    if (!this.live) await this.seek(tMs / 1000);
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return { faces: [], embed: async () => [] };
    const k = Math.min(1, MAX_FRAME_W / vw);
    const W = Math.round(vw * k);
    const H = Math.round(vh * k);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.video, 0, 0, W, H);
    // A camera feed can't be sampled ahead: its first frames decide.
    if (this.live && this.layoutSeen < LAYOUT_FRAMES) this.voteLayout(ctx, W, H);
    const bitmap = await createImageBitmap(this.canvas);
    this.timings.seekMs += performance.now() - t0;

    const id = this.nextId++;
    const panes = this.panes;
    const found = await this.request<WorkerFace[]>(id, { type: 'frame', id, bitmap, panes }, [bitmap]);

    const t1 = performance.now();
    const out: MeasuredFace[] = [];
    const yaws: number[] = [];
    for (const f of found) {
      const m = this.measureMouth(f);
      const yaw = m?.yaw ?? kpsYaw(f.kps);
      yaws.push(Math.round(yaw));
      out.push({
        // Boxes are reported in the frame's own pixels (videoWidth scale).
        box: [f.box[0] / k, f.box[1] / k, f.box[2] / k, f.box[3] / k],
        frontal: Math.abs(yaw) <= MAX_YAW_DEG,
        identifiable: Math.abs(yaw) <= MAX_ID_YAW_DEG,
        mouth: m?.mouth ?? null,
        pane: f.pane ?? 0,
      });
    }
    this.lastYaws = yaws;
    this.timings.meshMs += performance.now() - t1;
    this.timings.frames++;
    const embed: EmbedFn = (indices) =>
      indices.length ? this.request<Float32Array[]>(id, { type: 'embed', id, indices }) : Promise.resolve([]);
    return { faces: out, embed };
  }

  private request<T>(id: number, msg: any, transfer: Transferable[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage(msg, transfer);
    });
  }

  /** Inner-lip gap / mouth width and head yaw (degrees) from Face Mesh. */
  private measureMouth(f: WorkerFace): { mouth: number | null; yaw: number } | null {
    if (!this.mesh) return null;
    const [x, y, w, h] = f.box;
    let side = Math.max(w, h) * 1.5;
    // Stay inside this camera: Face Mesh reads one face, maybe the next camera's.
    const [ax, ay, aw, ah] = this.panes?.[f.pane ?? 0] ?? [0, 0, this.canvas.width, this.canvas.height];
    side = Math.min(side, aw, ah);
    if (side < 24) return null; // too small to read lips
    const x0 = Math.min(Math.max(ax, x + w / 2 - side / 2), ax + aw - side);
    const y0 = Math.min(Math.max(ay, y + h / 2 - side / 2), ay + ah - side);
    const cctx = this.crop.getContext('2d')!;
    cctx.drawImage(this.canvas, x0, y0, side, side, 0, 0, CROP_SIZE, CROP_SIZE);
    const r = this.mesh.detect(this.crop);
    const lm = r.faceLandmarks?.[0];
    if (!lm) return null;
    const d = (a: number, b: number) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y) * CROP_SIZE;
    // 13/14 = inner upper/lower lip centre, 78/308 = inner mouth corners.
    const width = d(78, 308);
    const mouth = width > 2 ? d(13, 14) / width : null;
    // Facial transformation matrix (column-major 4×4): the face's forward
    // axis is its third column; yaw is its angle off the camera axis.
    const mtx = r.facialTransformationMatrixes?.[0]?.data;
    const yaw = mtx ? (Math.atan2(mtx[8], mtx[10]) * 180) / Math.PI : kpsYaw(f.kps);
    return { mouth, yaw };
  }

  /** A file: look at frames spread through it, whatever is on screen at the start. */
  private async scanLayout(): Promise<void> {
    const v = this.video;
    if (!v.videoWidth || !v.videoHeight || !isFinite(v.duration)) return;
    const k = Math.min(1, MAX_FRAME_W / v.videoWidth);
    const W = Math.round(v.videoWidth * k);
    const H = Math.round(v.videoHeight * k);
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    for (let i = 0; i < LAYOUT_FRAMES; i++) {
      await this.seek((v.duration * (i + 0.5)) / LAYOUT_FRAMES);
      ctx.drawImage(v, 0, 0, W, H);
      this.voteLayout(ctx, W, H);
    }
  }

  private voteLayout(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    this.layoutSeen++;
    if (seamRatio(ctx, W, H, true) >= SEAM_RATIO && seamRatio(ctx, W, H, false) >= SEAM_RATIO) this.layoutVotes++;
    if (this.layoutSeen < LAYOUT_FRAMES) return;
    if (this.layoutVotes * 2 <= LAYOUT_FRAMES) return;
    const w = Math.round(W / 2);
    const h = Math.round(H / 2);
    this.panes = [
      [0, 0, w, h],
      [w, 0, W - w, h],
      [0, h, w, H - h],
      [w, h, W - w, H - h],
    ];
  }

  private seek(sec: number): Promise<void> {
    const v = this.video;
    const target = Math.min(sec, Math.max(0, v.duration - 0.05));
    if (Math.abs(v.currentTime - target) < 0.001 && v.readyState >= 2) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        v.removeEventListener('seeked', done);
        resolve();
      };
      const timer = setTimeout(done, 3000);
      v.addEventListener('seeked', done);
      v.currentTime = target;
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.mesh?.close();
    if (!this.live) {
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.waiting.forEach((w) => w.reject(new Error('stopped')));
    this.waiting.clear();
  }
}

/**
 * How much stronger the edge along the frame's middle (a column if
 * `vertical`, else a row) is than along a usual line of the picture.
 */
function seamRatio(ctx: CanvasRenderingContext2D, W: number, H: number, vertical: boolean): number {
  const along = vertical ? H : W;
  const across = vertical ? W : H;
  const edge = (at: number): number => {
    const d = vertical ? ctx.getImageData(at, 0, 2, along).data : ctx.getImageData(0, at, along, 2).data;
    const step = vertical ? 8 : 4; // to the next pixel along the line
    const next = vertical ? 4 : along * 4; // to its neighbour across it
    let sum = 0;
    for (let i = 0; i < along; i++) sum += Math.abs(d[i * step] - d[i * step + next]);
    return sum / along;
  };
  const mid = Math.round(across / 2);
  let seam = 0;
  for (let a = mid - 4; a < mid + 4; a++) seam = Math.max(seam, edge(a));
  const usual: number[] = [];
  for (let i = 1; i < 16; i++) {
    const a = Math.round((across * i) / 16);
    if (Math.abs(a - mid) > 8) usual.push(edge(a));
  }
  usual.sort((a, b) => a - b);
  return seam / Math.max(usual[usual.length >> 1], 0.5);
}

/**
 * Rough yaw from the 5 points (when Face Mesh couldn't read the crop): how
 * far the nose sits off the eyes' midpoint, relative to half the eye gap.
 */
function kpsYaw(kps: number[]): number {
  const mid = (kps[0] + kps[2]) / 2;
  const half = Math.abs(kps[2] - kps[0]) / 2 || 1;
  const r = Math.max(-1, Math.min(1, (kps[4] - mid) / half));
  return (Math.asin(r) * 180) / Math.PI;
}
