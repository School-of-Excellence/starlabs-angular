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

  constructor(
    videoUrl: string,
    private readonly onProgress: (pct: number) => void,
  ) {
    this.worker = new Worker(new URL('./face.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.onWorker(data);
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.preload = 'auto';
    this.video.playsInline = true;
    this.video.src = videoUrl;
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
    this.ready = Promise.all([workerReady, meshReady, videoReady]).then(([device]) => device);
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
   * Measure the faces at video time `tMs`. `embed` gets identity vectors for
   * chosen faces of this frame (call it before analysing the next frame).
   */
  async analyse(tMs: number): Promise<{ faces: MeasuredFace[]; embed: EmbedFn }> {
    const t0 = performance.now();
    await this.seek(tMs / 1000);
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
    const bitmap = await createImageBitmap(this.canvas);
    this.timings.seekMs += performance.now() - t0;

    const id = this.nextId++;
    const found = await this.request<WorkerFace[]>(id, { type: 'frame', id, bitmap }, [bitmap]);

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
    side = Math.min(side, this.canvas.width, this.canvas.height);
    if (side < 24) return null; // too small to read lips
    const x0 = Math.min(Math.max(0, x + w / 2 - side / 2), this.canvas.width - side);
    const y0 = Math.min(Math.max(0, y + h / 2 - side / 2), this.canvas.height - side);
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
    this.video.removeAttribute('src');
    this.video.load();
    this.waiting.forEach((w) => w.reject(new Error('stopped')));
    this.waiting.clear();
  }
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
