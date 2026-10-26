import {
  Component,
  ElementRef,
  EnvironmentInjector,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore } from '@angular/fire/firestore';

import { SpeechSegment, shapeCaptions, splitForWhisper, toSrt, trimToVoice, voiceFrames } from './captions';
import { LiveAudio, Phrase, WAVE_FRAMES, collapseRepeats, isFillerHallucination, normalizeForWhisper } from './live-audio';
import { loadProfilesCached } from './profiles';
import { BASIS_LABEL, FaceSample, PeopleTracker, Person, SpeakerPick, TrackedFace, pickSpeaker } from './speakers';
import type { FaceAnalyser } from './face-analyser';

/**
 * One analysed camera frame every 1.2 s while someone is speaking (lip
 * movement compares back-to-back frames), every 3 s when it's quiet — face
 * boxes stay up, at a fraction of the work.
 */
const FACE_STEP_MS = 1200;
const FACE_QUIET_STEP_MS = 3000;
/** "Speaking" = speech heard within this long. */
const SPEAKING_WINDOW_MS = 2000;
/** Face samples kept for naming lines (a line is at most ~10 s). */
const FACE_KEEP_MS = 60000;
/** A caption stays up at least this long after it appears. */
const CAPTION_MIN_MS = 4000;
const PREF_CAMERA = 'lvs-camera-id';
const PREF_MIC = 'lvs-mic-id';

export interface DeviceOption {
  id: string;
  label: string;
}

/** Lines this close are treated as the same turn (name continuity). */
const TURN_GAP_MS = 3000;
/**
 * Waiting phrases are sent to Whisper together, up to this long: Whisper
 * works on 30 s of audio per call however short the phrase, so one call for
 * several phrases clears a backlog several times faster.
 */
const MAX_BATCH_MS = 28000;
/** Phrases standing less than this above the room noise are noise, not speech. */
const MIN_SNR_DB = 8;

interface LiveLine {
  seg: SpeechSegment;
  pick: SpeakerPick | null;
  /** performance.now() when it appeared. */
  shownAt: number;
}

interface FaceBox {
  left: number;
  top: number;
  width: number;
  height: number;
  name: string;
  recognised: boolean;
  /** The person saying the caption on screen (strong box). */
  speaking: boolean;
}

/** A face in video pixels, for drawing on screen or into a recording. */
interface VideoFace {
  box: [number, number, number, number];
  name: string;
  recognised: boolean;
  speaking: boolean;
}

/**
 * Live camera mode: the laptop camera + microphone, with subtitles (Whisper
 * on WebGPU, phrase by phrase) and, when names are on, who is speaking (faces
 * + lip movement, matched to profiles). Optional recording, saved only when
 * the viewer downloads it.
 */
@Component({
  selector: 'app-live-camera',
  standalone: true,
  templateUrl: './live-camera.component.html',
  styleUrl: './live-video-subtitles.component.css',
})
export class LiveCameraComponent implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  readonly language = input<string | null>('en');
  readonly highAccuracy = input(true);
  readonly namesOn = input(false);
  readonly showDiagnostics = input(false);
  /** The viewer wants the recording replayed in upload mode (with subtitles). */
  readonly replay = output<File>();

  @ViewChild('cam') private camRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('lineList') private linesRef?: ElementRef<HTMLElement>;
  @ViewChild('stage') private stageRef?: ElementRef<HTMLElement>;
  @ViewChild('wave') private waveRef?: ElementRef<HTMLCanvasElement>;
  private waveFrame = 0;

  // ── UI state ──────────────────────────────────────────────────────────
  readonly running = signal(false);
  readonly starting = signal(false);
  readonly error = signal('');
  readonly status = signal('');
  readonly modelReady = signal(false);
  readonly modelLabel = signal('');
  readonly device = signal('');
  readonly loadPct = signal<number | null>(null);
  readonly lines = signal<LiveLine[]>([]);
  readonly nowMs = signal(0);
  readonly listening = signal(false);
  /** The browser hasn't let the microphone audio start yet (needs a click). */
  readonly audioHeld = signal(false);
  /** Diagnostics: microphone and speech pipeline, refreshed every tick. */
  readonly micText = signal('');
  readonly speechText = signal('');
  private transcribed = 0;
  private emptyResults = 0;
  private droppedNoise = 0;
  /** Diagnostics: Whisper's raw text for the last phrase (before filtering). */
  readonly lastRaw = signal('');
  readonly pendingPhrases = signal(0);
  /**
   * After a recording: Whisper turbo makes one pass over its audio for an
   * accurate, in-sync subtitle file. Until it's done, Record / Download /
   * Replay wait (a loader shows the progress).
   */
  readonly srtWorking = signal(false);
  readonly srtPct = signal(0);
  readonly srtStage = signal('');
  readonly finishing = computed(() => (this.srtWorking() ? 1 : 0));
  private srtWorker: Worker | null = null;
  /** The turbo subtitles for the last recording (ms from its start). */
  private accurateLines: { startMs: number; endMs: number; text: string }[] | null = null;
  /** Face samples during the recording (for the subtitle file's names). */
  private recFaces: { t: number; faces: TrackedFace[] }[] = [];
  readonly latencyMs = signal<number | null>(null);
  /** Every face in the latest frame (names on); the speaker's is strong. */
  readonly faceBoxes = signal<FaceBox[]>([]);
  readonly fullscreen = signal(false);
  // Devices (laptop camera, an ATEM Mini / capture card, USB mics…).
  readonly cameras = signal<DeviceOption[]>([]);
  readonly mics = signal<DeviceOption[]>([]);
  readonly cameraId = signal('');
  readonly micId = signal('');
  /** Names show only after the browser has been allowed camera access once. */
  readonly devicesNamed = signal(true);
  // Faces.
  readonly facesStatus = signal('');
  readonly faceDevice = signal('');
  readonly profileCount = signal<number | null>(null);
  readonly faceTimingText = signal('');
  readonly faceVersion = signal(0);
  // Recording.
  readonly recording = signal(false);
  readonly recordStart = signal(0);
  readonly recordedUrl = signal<string | null>(null);
  readonly recordedName = signal('');
  /** Live-clock span of the last recording (for its subtitle file). */
  private recSpan: [number, number] | null = null;
  /**
   * Draw the face boxes and names into the recording. (Captions aren't drawn
   * in: they arrive seconds after the words, so they'd sit that far behind
   * in the video — they go into the .srt file instead, timed to the speech.)
   */
  readonly recNames = signal(true);
  private recCanvas: HTMLCanvasElement | null = null;
  private recStream: MediaStream | null = null;
  private recDraw?: ReturnType<typeof setInterval>;

  /** The newest line, while it's fresh. */
  readonly current = computed(() => {
    const list = this.lines();
    const last = list[list.length - 1];
    if (!last) return null;
    this.nowMs();
    const shown = performance.now() - last.shownAt;
    return shown < Math.max(CAPTION_MIN_MS, last.seg.endMs - last.seg.startMs) ? last : null;
  });

  // ── Session ───────────────────────────────────────────────────────────
  private stream: MediaStream | null = null;
  private audio: LiveAudio | null = null;
  private worker?: Worker;
  private queue: Phrase[] = [];
  private busy = false;
  private nextId = 1;
  private jobs = new Map<number, Phrase & { sentAt: number }>();
  private tick?: ReturnType<typeof setInterval>;
  private recorder: MediaRecorder | null = null;
  private recordChunks: Blob[] = [];
  private recordedBlob: Blob | null = null;
  // Faces.
  private analyser: FaceAnalyser | null = null;
  private tracker: PeopleTracker | null = null;
  private faceGen = 0;
  private faces = new Map<number, TrackedFace[]>();
  private faceTimes: number[] = [];

  constructor() {
    if (!this.isBrowser) return;
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.cameraId.set(this.pref(PREF_CAMERA));
    this.micId.set(this.pref(PREF_MIC));
    this.refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', this.onDeviceChange);
    // Settings changed while the camera is on.
    effect(() => {
      this.highAccuracy();
      this.language() === 'en'; // English-only model when English
      untracked(() => {
        if (this.worker) {
          this.modelReady.set(false);
          this.loadModel();
        }
      });
    });
    effect(() => {
      const on = this.namesOn();
      untracked(() => {
        if (!this.running()) return;
        if (on) this.startFaces();
        else this.stopFaces();
      });
    });
  }

  // ── Start / stop ──────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running() || this.starting()) return;
    this.error.set('');
    this.starting.set(true);
    // Audio must be created during the click itself (see LiveAudio.prepare).
    const audio = new LiveAudio((p) => this.zone.run(() => this.onPhrase(p)));
    audio.prepare();
    let notice = '';
    try {
      try {
        this.stream = await this.openDevices(this.cameraId(), this.micId());
      } catch (e: any) {
        // The remembered device is unplugged (or its ID changed): forget it
        // and carry on with the default camera and microphone.
        const missing = e?.name === 'OverconstrainedError' || e?.name === 'NotFoundError';
        if (!missing || (!this.cameraId() && !this.micId())) throw e;
        this.setCamera('');
        this.setMic('');
        this.stream = await this.openDevices('', '');
        notice = 'The chosen camera or microphone isn\'t connected — using the default instead.';
      }
      this.refreshDevices(); // names are visible now that access is granted
    } catch (e: any) {
      audio.stop();
      this.starting.set(false);
      this.error.set(
        e?.name === 'NotAllowedError'
          ? 'Camera or microphone access was blocked. Allow it in the browser (the camera icon in the address bar) and try again.'
          : `Couldn't open the camera or microphone (${e?.message ?? e}).`,
      );
      return;
    }
    this.running.set(true);
    this.starting.set(false);
    if (notice) this.error.set(notice);
    this.lines.set([]);
    this.queue = [];
    this.jobs.clear();
    this.latencyMs.set(null);
    // Let the <video> render, then attach the stream.
    await new Promise((r) => setTimeout(r));
    const cam = this.camRef?.nativeElement;
    if (cam) {
      // Never play the microphone back: a `muted` attribute on an element
      // Angular creates isn't applied as the property, so the preview played
      // your own voice through the speakers (and back into the mic).
      cam.muted = true;
      cam.volume = 0;
      cam.srcObject = this.stream;
      await cam.play().catch(() => undefined);
    }
    this.ensureWorker();
    this.audio = audio;
    // The clock and faces run whatever happens with the microphone.
    this.tick = setInterval(() => this.zone.run(() => this.onTick()), 200);
    this.zone.runOutsideAngular(() => (this.waveFrame = requestAnimationFrame(this.drawWave)));
    if (this.namesOn()) this.startFaces();
    try {
      await audio.start(this.stream);
    } catch (e: any) {
      this.error.set(`Couldn't read the microphone (${e?.message ?? e}).`);
    }
  }

  /** Any click on the page lets a held-back audio context start. */
  resumeAudio(): void {
    this.audio?.resume();
  }

  stop(): void {
    if (this.recording()) this.stopRecording();
    clearInterval(this.tick);
    cancelAnimationFrame(this.waveFrame);
    this.audio?.stop();
    this.audio = null;
    this.stopFaces();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const cam = this.camRef?.nativeElement;
    if (cam) cam.srcObject = null;
    this.running.set(false);
    this.listening.set(false);
    this.faceBoxes.set([]);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }

  private onTick(): void {
    this.nowMs.set(this.audio?.clockMs() ?? 0);
    this.listening.set(!!this.audio?.voiced);
    this.audioHeld.set(!!this.audio?.suspended);
    const a = this.audio;
    const track = this.stream?.getAudioTracks()[0];
    this.micText.set(
      a
        ? `${a.stateText} · level ${Math.round(a.levelDb)} dB (floor ${Math.round(a.floorDb)}) · ` +
            `${track ? `${track.label || 'mic'} ${track.readyState}${track.muted ? ' (muted by system)' : ''}` : 'no audio track'}`
        : 'not started',
    );
    this.speechText.set(
      `${a?.phrases ?? 0} phrases heard (${this.droppedNoise} noise) · ${this.transcribed} transcribed (${this.emptyResults} empty) · ` +
        `${this.queue.length + (this.busy ? 1 : 0)} waiting · ` +
        `model ${this.modelReady() ? 'ready' : this.loadPct() !== null ? `loading ${this.loadPct()}%` : 'not loaded'}`,
    );
    this.updateBox();
  }

  /**
   * Live mic waveform: one bar per 20 ms frame over the last 2.4 s, height
   * from the level above the room's noise floor — green while it's speech,
   * grey for background sound. Flat means the mic isn't hearing you.
   */
  private readonly drawWave = () => {
    this.waveFrame = requestAnimationFrame(this.drawWave);
    const canvas = this.waveRef?.nativeElement;
    const a = this.audio;
    if (!canvas || !a) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 96;
    const cssH = canvas.clientHeight || 18;
    if (canvas.width !== Math.round(cssW * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    const bars = 48; // each bar = 2.5 frames (50 ms)
    const per = WAVE_FRAMES / bars;
    const step = W / bars;
    const floor = a.floorDb > -100 ? a.floorDb : -70;
    for (let b = 0; b < bars; b++) {
      let db = -100;
      let voiced = 0;
      for (let k = 0; k < per; k++) {
        const i = (a.wavePos + Math.floor(b * per + k)) % WAVE_FRAMES;
        db = Math.max(db, a.waveDb[i]);
        voiced |= a.waveVoiced[i];
      }
      const level = Math.max(0, Math.min(1, (db - floor + 4) / 40));
      const h = Math.max(2 * dpr, level * H);
      g.fillStyle = voiced ? '#3ad68a' : 'rgba(255, 255, 255, 0.45)';
      g.fillRect(b * step + step * 0.2, (H - h) / 2, Math.max(1, step * 0.6), h);
    }
  };

  // ── Speech ────────────────────────────────────────────────────────────

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL('./speech.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.zone.run(() => this.onWorker(data));
    this.worker.onerror = (e) => this.zone.run(() => this.error.set(`Speech worker failed: ${e.message || 'unknown error'}`));
    this.loadModel();
  }

  private loadModel(): void {
    this.loadPct.set(0);
    this.status.set('Loading the speech model…');
    // live: Moonshine for English at standard accuracy (fast, light).
    this.worker?.postMessage({ type: 'load', highAccuracy: this.highAccuracy(), english: this.language() === 'en', live: true });
  }

  private loadFiles = new Map<string, { loaded: number; total: number }>();

  private onWorker(data: any): void {
    switch (data.type) {
      case 'progress': {
        this.loadFiles.set(data.file, { loaded: data.loaded ?? 0, total: data.total ?? 0 });
        let loaded = 0;
        let total = 0;
        this.loadFiles.forEach((f) => {
          loaded += f.loaded;
          total += f.total;
        });
        if (total > 0) this.loadPct.set(Math.round((loaded / total) * 100));
        break;
      }
      case 'ready':
        this.modelReady.set(true);
        this.modelLabel.set(data.model);
        this.device.set(data.device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU (WASM)');
        this.loadPct.set(null);
        this.status.set('');
        this.pump();
        break;
      case 'result':
        this.onResult(data.id, data.segments);
        break;
      case 'error':
        if (data.id != null) this.jobs.delete(data.id);
        this.busy = false;
        this.error.set(data.message);
        this.pump();
        break;
    }
  }

  private onPhrase(p: Phrase): void {
    if (p.snrDb < MIN_SNR_DB) {
      this.droppedNoise++;
      return; // a cough, typing, a door — Whisper would invent words for it
    }
    this.queue.push(p);
    this.pendingPhrases.set(this.queue.length + (this.busy ? 1 : 0));
    this.pump();
  }

  /**
   * Send waiting phrases to Whisper, oldest first, one call at a time —
   * several at once (as one continuous stretch) when they've piled up.
   */
  private pump(): void {
    if (this.busy || !this.modelReady() || !this.worker || !this.queue.length) return;
    let p = this.queue.shift()!;
    if (this.queue.length && this.audio) {
      let end = p.endMs;
      let n = 0;
      while (n < this.queue.length && this.queue[n].endMs - p.startMs <= MAX_BATCH_MS) end = this.queue[n++].endMs;
      const pcm = n ? this.audio.slice(p.startMs, end) : null;
      if (pcm) {
        const merged = [p, ...this.queue.splice(0, n)];
        const speechMs = merged.reduce((s, x) => s + x.speechMs, 0);
        const snrDb = merged.reduce((s, x) => s + x.snrDb * x.speechMs, 0) / (speechMs || 1);
        p = { pcm, startMs: p.startMs, endMs: end, speechMs, snrDb };
      }
    }
    const id = this.nextId++;
    this.jobs.set(id, { ...p, sentAt: performance.now() });
    this.busy = true;
    this.pendingPhrases.set(this.queue.length + 1);
    const audio = normalizeForWhisper(p.pcm).slice();
    this.worker.postMessage({ type: 'transcribe', id, audio, startMs: p.startMs, language: this.language() }, [
      audio.buffer,
    ]);
  }

  private onResult(id: number, segments: SpeechSegment[]): void {
    const job = this.jobs.get(id);
    this.jobs.delete(id);
    this.busy = false;
    this.transcribed++;
    const raw = segments.map((s) => s.text).join(' ').trim();
    this.lastRaw.set(raw ? `“${raw.slice(0, 120)}”` : '(nothing)');
    if (job) {
      const fresh = shapeCaptions(
        segments.map((s) => ({ ...s, text: collapseRepeats(s.text) })).filter((s) => !isFillerHallucination(s.text, job)),
        { minSplitWords: 14 },
      ).map((seg) => ({ seg, pick: null as SpeakerPick | null, shownAt: performance.now() }));
      if (!fresh.length) this.emptyResults++;
      if (fresh.length) {
        const list = [...this.lines(), ...fresh];
        // Who said it: the faces seen while it was said are already analysed.
        for (let i = list.length - fresh.length; i < list.length; i++) list[i].pick = this.speakerFor(list, i);
        this.lines.set(list);
        this.scrollToEnd();
      }
      // End of the phrase → its caption on screen (live clock).
      this.latencyMs.set(Math.round((this.audio?.clockMs() ?? job.endMs) - job.endMs));
    }
    this.pendingPhrases.set(this.queue.length);
    this.pump();
  }

  // ── Faces: who is speaking ────────────────────────────────────────────

  private async startFaces(): Promise<void> {
    const cam = this.camRef?.nativeElement;
    if (!cam || this.analyser) return;
    const gen = ++this.faceGen;
    this.facesStatus.set('Loading face models…');
    try {
      const { FaceAnalyser } = await import('./face-analyser');
      if (gen !== this.faceGen) return;
      this.analyser = new FaceAnalyser(cam, (pct) => this.zone.run(() => this.facesStatus.set(`Loading face models… ${pct}%`)));
      // Profiles load alongside; faces (who is talking) start without them
      // and names join in once they arrive.
      const profiles = loadProfilesCached(this.firestore, this.injector, (n) =>
        this.zone.run(() => this.profileCount.set(n)),
      );
      const device = await this.analyser.init();
      if (gen !== this.faceGen) return;
      this.faceDevice.set(device);
      // Tracking spans the quiet-time gap between frames too.
      this.tracker = new PeopleTracker([], FACE_QUIET_STEP_MS);
      this.facesStatus.set('');
      this.zone.runOutsideAngular(() => this.faceLoop(gen));
      profiles.then(
        (list) => {
          if (gen !== this.faceGen) return;
          this.profileCount.set(list.length);
          this.tracker?.setProfiles(list);
        },
        (e) => this.error.set(`Couldn't load face profiles (${e?.message ?? e}) — speakers will show as Unknown.`),
      );
    } catch (e: any) {
      if (gen !== this.faceGen) return;
      this.facesStatus.set('');
      this.error.set(`Names unavailable: ${e?.message ?? e}`);
      this.stopFaces();
    }
  }

  private stopFaces(): void {
    this.faceGen++;
    this.analyser?.dispose();
    this.analyser = null;
    this.tracker = null;
    this.faces.clear();
    this.faceTimes = [];
    this.faceBoxes.set([]);
    this.facesStatus.set('');
  }

  /**
   * Analyse the camera's current frame every {@link FACE_STEP_MS} while
   * someone is speaking, every {@link FACE_QUIET_STEP_MS} otherwise.
   */
  private async faceLoop(gen: number): Promise<void> {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (gen === this.faceGen && this.analyser && this.tracker && this.audio) {
      const t0 = performance.now();
      const t = Math.round(this.audio.clockMs());
      try {
        const { faces, embed } = await this.analyser.analyse(t);
        if (gen !== this.faceGen || !this.tracker) return;
        const tracked = await this.tracker.track(t, faces, embed);
        if (gen !== this.faceGen) return;
        this.faces.set(t, tracked);
        this.faceTimes.push(t);
        if (this.recording()) this.recFaces.push({ t, faces: tracked });
        while (this.faceTimes.length && this.faceTimes[0] < t - FACE_KEEP_MS) this.faces.delete(this.faceTimes.shift()!);
      } catch (e: any) {
        if (gen !== this.faceGen) return;
        this.zone.run(() => this.error.set(`Face analysis: ${e?.message ?? e}`));
        await sleep(1000);
      }
      const tm = this.analyser?.timings;
      if (tm?.frames) {
        const per = (x: number) => Math.round(x / tm.frames);
        this.zone.run(() => {
          this.faceTimingText.set(
            `${tm.frames} frames · ${per(tm.seekMs + tm.workerMs + tm.meshMs + tm.embedMs)} ms/frame ` +
              `(detect ${per(tm.workerMs)}, lips ${per(tm.meshMs)}, ID ${per(tm.embedMs)})`,
          );
          this.faceVersion.update((v) => v + 1);
        });
      }
      const speaking = (this.audio?.msSinceVoice() ?? Infinity) < SPEAKING_WINDOW_MS;
      await sleep(Math.max(0, (speaking ? FACE_STEP_MS : FACE_QUIET_STEP_MS) - (performance.now() - t0)));
    }
  }

  /** Speaker of line `i` from the faces seen while it was said. */
  private speakerFor(list: LiveLine[], i: number): SpeakerPick | null {
    if (!this.tracker) return null;
    const seg = list[i].seg;
    const prev = list[i - 1];
    const previous = prev && seg.startMs - prev.seg.endMs < TURN_GAP_MS ? (prev.pick?.personId ?? null) : null;
    const samples: FaceSample[] = [];
    for (const t of this.faceTimes) {
      if (t < seg.startMs - 500 || t > seg.endMs + 500) continue;
      for (const f of this.faces.get(t)!) samples.push({ timeMs: t, personId: f.personId, area: f.box[2] * f.box[3], mouth: f.mouth });
    }
    return pickSpeaker(seg, samples, previous);
  }

  private person(id: number | null | undefined): Person | null {
    return id == null ? null : (this.tracker?.people[id] ?? null);
  }

  /** Name shown for a line ('' when names are off). */
  nameOf(line: LiveLine): { name: string; recognised: boolean; guess: boolean } | null {
    this.faceVersion();
    if (!this.namesOn() || !line.pick) return null;
    const p = this.person(line.pick.personId);
    return { name: p?.name ?? 'Unknown', recognised: p?.profileId != null, guess: !!p && line.pick.basis === 'mostVisible' };
  }

  basisOf(line: LiveLine | null): string {
    return line?.pick ? BASIS_LABEL[line.pick.basis] : '—';
  }

  peopleSummary(): string[] {
    this.faceVersion();
    return (this.tracker?.people ?? []).map((p) => {
      const c = p.closest;
      const closest = c ? `closest ${c.name} ${c.score.toFixed(2)} (next ${c.second.toFixed(2)})` : 'no frontal frame yet';
      return `#${p.id} ${p.profileId ? p.name : 'Unknown'} · ${closest}`;
    });
  }

  /** Faces in the latest analysed frame (video pixels), speaker marked. */
  private latestFaces(): VideoFace[] {
    const lastT = this.faceTimes[this.faceTimes.length - 1];
    if (lastT === undefined || this.nowMs() - lastT > FACE_QUIET_STEP_MS + 500) return [];
    const speaker = this.current()?.pick?.personId ?? null;
    return (this.faces.get(lastT) ?? []).map((f) => {
      const p = this.person(f.personId);
      return {
        box: f.box,
        name: p?.name ?? 'Unknown',
        recognised: p?.profileId != null,
        speaking: speaker !== null && f.personId === speaker,
      };
    });
  }

  /** Boxes on every face in the latest frame, mapped onto the displayed video. */
  private updateBox(): void {
    const cam = this.camRef?.nativeElement;
    const vw = cam?.videoWidth;
    const vh = cam?.videoHeight;
    if (!cam || !vw || !vh) {
      this.faceBoxes.set([]);
      return;
    }
    const s = Math.min(cam.clientWidth / vw, cam.clientHeight / vh);
    const ox = (cam.clientWidth - vw * s) / 2;
    const oy = (cam.clientHeight - vh * s) / 2;
    this.faceBoxes.set(
      this.latestFaces().map((f) => ({
        left: ox + f.box[0] * s,
        top: oy + f.box[1] * s,
        width: f.box[2] * s,
        height: f.box[3] * s,
        name: f.name,
        recognised: f.recognised,
        speaking: f.speaking,
      })),
    );
  }

  // ── Recording ─────────────────────────────────────────────────────────

  startRecording(): void {
    if (!this.stream || this.recording() || this.finishing()) return;
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    // With names on, record a drawn copy of the picture (camera + face
    // boxes, which are in sync) — the plain camera stream otherwise.
    const burnNames = this.recNames() && this.namesOn();
    const source = burnNames ? this.composedStream() : this.stream;
    try {
      this.recorder = new MediaRecorder(source, type ? { mimeType: type } : undefined);
    } catch (e: any) {
      this.error.set(`Recording isn't available in this browser (${e?.message ?? e}).`);
      return;
    }
    this.clearRecording();
    this.recordChunks = [];
    this.recorder.ondataavailable = (e) => e.data.size && this.recordChunks.push(e.data);
    this.recorder.onstop = () =>
      this.zone.run(() => {
        const mime = this.recorder?.mimeType || 'video/webm';
        this.recordedBlob = new Blob(this.recordChunks, { type: mime });
        this.recordChunks = [];
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        this.recordedName.set(
          `live-recording-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`,
        );
        this.recordedUrl.set(URL.createObjectURL(this.recordedBlob));
        if (this.recSpan) this.makeAccurateSubtitles(this.recordedBlob, this.recSpan);
      });
    this.recorder.start(1000);
    this.recordStart.set(this.nowMs());
    this.recSpan = null;
    this.recFaces = [];
    this.accurateLines = null;
    this.recording.set(true);
  }

  stopRecording(): void {
    if (!this.recording()) return;
    this.recSpan = [this.recordStart(), this.nowMs()];
    // The words being spoken right now go to the live captions at once.
    this.audio?.flush();
    this.recorder?.stop();
    this.recording.set(false);
    clearInterval(this.recDraw);
    // Only the drawn picture's track: the audio track is the camera's own.
    this.recStream?.getVideoTracks().forEach((t) => t.stop());
    this.recStream = null;
    this.recCanvas = null;
  }

  /**
   * The camera drawn at 30 fps with a box and name tag on each face. The
   * microphone sound is added unchanged.
   */
  private composedStream(): MediaStream {
    const cam = this.camRef!.nativeElement;
    const W = cam.videoWidth || 1280;
    const H = cam.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.recCanvas = canvas;
    const g = canvas.getContext('2d')!;
    const draw = () => {
      g.drawImage(cam, 0, 0, W, H);
      this.drawFaces(g, W);
    };
    draw();
    this.recDraw = setInterval(draw, 1000 / 30);
    const out = canvas.captureStream(30);
    this.stream?.getAudioTracks().forEach((t) => out.addTrack(t));
    this.recStream = out;
    return out;
  }

  private drawFaces(g: CanvasRenderingContext2D, W: number): void {
    const font = Math.max(14, Math.round(W / 70));
    g.font = `600 ${font}px Geist, Arial, sans-serif`;
    g.textBaseline = 'bottom';
    for (const f of this.latestFaces()) {
      const [x, y, w, h] = f.box;
      const color = f.recognised ? '#6ee7a0' : '#ffb547';
      g.setLineDash(f.speaking ? [] : [12, 8]);
      // Thick enough to survive video compression (thin lines fade out).
      g.lineWidth = f.speaking ? Math.max(4, W / 320) : Math.max(2.5, W / 640);
      g.strokeStyle = color;
      g.globalAlpha = f.speaking ? 1 : 0.75;
      g.strokeRect(x, y, w, h);
      const tw = g.measureText(f.name).width;
      g.fillStyle = 'rgba(0, 0, 0, 0.7)';
      g.fillRect(x, y - font - 10, tw + 14, font + 8);
      g.fillStyle = '#fff';
      g.fillText(f.name, x + 7, y - 6);
      g.globalAlpha = 1;
    }
    g.setLineDash([]);
  }

  /**
   * Subtitles for the last recording as a .srt file: the lines spoken while
   * it was recording, timed from its start, with the speaker's name when
   * names are on. Built on click, so lines still being transcribed when
   * recording stopped are included.
   */
  downloadSubtitles(): void {
    const span = this.recSpan;
    if (!span) return;
    const [from, to] = span;
    // The turbo pass when it finished (already timed to the recording),
    // else the live captions from the recording's time span.
    const lines = this.accurateLines ?? this.lines()
      .filter((l) => l.seg.endMs > from && l.seg.startMs < to)
      .map((l) => {
        const n = this.nameOf(l);
        const name = n ? `${n.name}${n.guess ? '?' : ''}: ` : '';
        return {
          startMs: Math.max(0, l.seg.startMs - from),
          endMs: Math.min(to, l.seg.endMs) - from,
          text: name + l.seg.text,
        };
      });
    const blob = new Blob([toSrt(lines)], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.recordedName().replace(/\.(webm|mp4)$/, '') + '.srt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** How many caption lines the last recording's subtitle file will have. */
  recordedLineCount(): number {
    if (this.accurateLines) return this.accurateLines.length;
    const span = this.recSpan;
    if (!span) return 0;
    return this.lines().filter((l) => l.seg.endMs > span[0] && l.seg.startMs < span[1]).length;
  }

  /**
   * One Whisper turbo pass over the recording's own audio (the way Replay
   * gets its accurate subtitles), in ≤28 s pieces cut at pauses. Times come
   * from the recording itself, so the .srt is in exact sync; names come from
   * the faces seen while each line was said. Turbo runs only for this burst
   * (its worker is closed afterwards), not throughout the live session.
   */
  private async makeAccurateSubtitles(blob: Blob, span: [number, number]): Promise<void> {
    this.accurateLines = null;
    this.srtWorking.set(true);
    this.srtPct.set(0);
    this.srtStage.set('Reading the recording…');
    try {
      const ctx = new AudioContext({ sampleRate: 16000 });
      let pcm: Float32Array;
      try {
        const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
        pcm = new Float32Array(ab.length);
        for (let ch = 0; ch < ab.numberOfChannels; ch++) {
          const d = ab.getChannelData(ch);
          for (let i = 0; i < d.length; i++) pcm[i] += d[i] / ab.numberOfChannels;
        }
      } finally {
        ctx.close();
      }
      const totalMs = (pcm.length / 16000) * 1000;
      const pieces = splitForWhisper(pcm);
      const segments: SpeechSegment[] = [];
      const worker = new Worker(new URL('./speech.worker', import.meta.url), { type: 'module' });
      this.srtWorker = worker;
      this.srtStage.set('Loading the accurate model…');
      await new Promise<void>((resolve, reject) => {
        let next = 0;
        const send = () => {
          if (next >= pieces.length) return resolve();
          const [s, e] = pieces[next++];
          const audio = pcm.slice(Math.floor(s * 16), Math.floor(e * 16));
          worker.postMessage({ type: 'transcribe', id: next, audio, startMs: s, language: this.language() }, [audio.buffer]);
        };
        worker.onmessage = ({ data }) =>
          this.zone.run(() => {
            if (data.type === 'ready') {
              this.srtStage.set('Making accurate subtitles…');
              send();
            } else if (data.type === 'result') {
              segments.push(...data.segments);
              this.srtPct.set(Math.round((100 * pieces[next - 1][1]) / (totalMs || 1)));
              send();
            } else if (data.type === 'error') {
              reject(new Error(data.message));
            }
          });
        worker.onerror = (e) => reject(new Error(e.message || 'speech worker failed'));
        worker.postMessage({ type: 'load', highAccuracy: true, english: this.language() === 'en' });
      });
      const voiced = voiceFrames(pcm);
      const shaped = shapeCaptions(segments.map((s) => ({ ...s, text: collapseRepeats(s.text) }))).map((s) =>
        trimToVoice(s, voiced, 0),
      );
      const out: { startMs: number; endMs: number; text: string }[] = [];
      let prevId: number | null = null;
      let prevEnd = -1e9;
      for (const seg of shaped) {
        let name = '';
        if (this.namesOn() && this.tracker) {
          const samples: FaceSample[] = [];
          for (const r of this.recFaces) {
            const t = r.t - span[0];
            if (t < seg.startMs - 500 || t > seg.endMs + 500) continue;
            for (const f of r.faces) samples.push({ timeMs: t, personId: f.personId, area: f.box[2] * f.box[3], mouth: f.mouth });
          }
          const pick = pickSpeaker(seg, samples, seg.startMs - prevEnd < TURN_GAP_MS ? prevId : null);
          prevId = pick.personId;
          prevEnd = seg.endMs;
          const p = this.person(pick.personId);
          name = `${p?.name ?? 'Unknown'}${p && pick.basis === 'mostVisible' ? '?' : ''}: `;
        }
        out.push({ startMs: seg.startMs, endMs: seg.endMs, text: name + seg.text });
      }
      this.accurateLines = out;
    } catch (e: any) {
      this.error.set(`Couldn't make the accurate subtitles (${e?.message ?? e}) — the download uses the live captions instead.`);
    } finally {
      this.srtWorker?.terminate();
      this.srtWorker = null;
      this.srtWorking.set(false);
      this.srtStage.set('');
    }
  }

  /** Save the video and its .srt together (same name, subtitles in sync). */
  downloadAll(): void {
    const url = this.recordedUrl();
    if (!url || this.finishing()) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = this.recordedName();
    a.click();
    // A moment apart: browsers handle two downloads from one click better.
    setTimeout(() => this.downloadSubtitles(), 400);
  }

  replayRecording(): void {
    if (!this.recordedBlob || this.finishing()) return;
    const file = new File([this.recordedBlob], this.recordedName(), { type: this.recordedBlob.type });
    this.stop();
    this.replay.emit(file);
  }

  private clearRecording(): void {
    const url = this.recordedUrl();
    if (url) URL.revokeObjectURL(url);
    this.recordedUrl.set(null);
    this.recordedBlob = null;
  }

  // ── Full screen ───────────────────────────────────────────────────────

  toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else this.stageRef?.nativeElement.requestFullscreen().catch(() => undefined);
  }

  private readonly onFullscreenChange = () =>
    this.zone.run(() => this.fullscreen.set(!!document.fullscreenElement && document.fullscreenElement === this.stageRef?.nativeElement));

  // ── Helpers ───────────────────────────────────────────────────────────

  private scrollToEnd(): void {
    requestAnimationFrame(() => {
      const box = this.linesRef?.nativeElement;
      if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
    });
  }

  initials(name: string): string {
    if (name === 'Unknown') return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  }

  fmt(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── Devices ───────────────────────────────────────────────────────────

  /** Open a camera + microphone ('' = the browser's default). */
  private openDevices(cam: string, mic: string): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      // Full HD when the source offers it (an ATEM Mini sends 1080p); the
      // laptop camera just gives its best.
      video: {
        ...(cam ? { deviceId: { exact: cam } } : { facingMode: 'user' }),
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      // The raw microphone. Chrome's echo cancellation chopped speech into
      // broken fragments on the MacBook mic (and this page plays no sound,
      // so there's no echo to cancel); its auto gain pumped the level.
      // Whisper does best on unprocessed sound — quiet phrases are brought
      // up to level in code instead (normalizeForWhisper).
      audio: {
        ...(mic ? { deviceId: { exact: mic } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  }

  private readonly onDeviceChange = () => this.refreshDevices();

  /** List cameras and microphones (an ATEM Mini shows up as both). */
  async refreshDevices(): Promise<void> {
    const devs = await navigator.mediaDevices?.enumerateDevices().catch(() => []);
    if (!devs) return;
    const pick = (kind: MediaDeviceKind, fallback: string) =>
      devs
        .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
    this.zone.run(() => {
      this.cameras.set(pick('videoinput', 'Camera'));
      this.mics.set(pick('audioinput', 'Microphone'));
      this.devicesNamed.set(devs.some((d) => d.label));
    });
  }

  setCamera(id: string): void {
    this.cameraId.set(id);
    this.savePref(PREF_CAMERA, id);
  }

  setMic(id: string): void {
    this.micId.set(id);
    this.savePref(PREF_MIC, id);
  }

  /** Label of the camera / mic actually in use (diagnostics). */
  activeDevices(): string {
    const v = this.stream?.getVideoTracks()[0];
    const a = this.stream?.getAudioTracks()[0];
    const s = v?.getSettings();
    return `${v?.label || '—'}${s?.width ? ` (${s.width}×${s.height})` : ''} · ${a?.label || '—'}`;
  }

  private pref(key: string): string {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  }

  private savePref(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* not remembered */
    }
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    navigator.mediaDevices?.removeEventListener('devicechange', this.onDeviceChange);
    this.stop();
    this.worker?.terminate();
    this.srtWorker?.terminate();
    this.clearRecording();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }
}
