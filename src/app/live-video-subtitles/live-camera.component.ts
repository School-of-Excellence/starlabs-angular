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

import { SpeechSegment, VOICE_FRAME_MS, shapeCaptions, splitForWhisper, toSrt, trimToVoice, voiceFrames } from './captions';
import { LiveAudio, Phrase, WAVE_FRAMES, collapseRepeats, isFillerHallucination, normalizeForWhisper } from './live-audio';
import { loadProfilesCached } from './profiles';
import { BASIS_LABEL, FaceSample, PeopleTracker, Person, SpeakerPick, TrackedFace, pickSpeaker } from './speakers';
import type { FaceAnalyser } from './face-analyser';
import { RecordingStore } from './recording-store';
import { zipFiles } from './zip';

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

/** The subtitled copy is abandoned if converting makes no progress for this long. */
const CONVERT_STALL_MS = 20000;

/** Background turbo pieces: at most this long, ending in a pause. */
const BG_PIECE_MS = 28000;
/** A piece with less voice than this (20 ms frames) is silence: skipped. */
const MIN_VOICED_FRAMES = 15;
/** More silence than this (frames) before a piece's first words is cut off… */
const LEAD_SILENCE_FRAMES = 50;
/** …keeping this much before them. */
const LEAD_KEEP_FRAMES = 15;

/** A subtitle line, ms from the start of the recording. */
interface SubLine {
  startMs: number;
  endMs: number;
  text: string;
}

/** A ≤28 s stretch of a recording for turbo (ms from the recording's start). */
interface Piece {
  startMs: number;
  endMs: number;
  done: boolean;
  segs: SpeechSegment[];
  /** Voice per 20 ms frame (tightens caption times); dropped once done. */
  voiced: boolean[];
}

/**
 * One recording: its turbo pieces, the faces seen while it was made (for
 * names), and its finishing (final .srt, subtitled MP4). It finishes on its
 * own, so the next recording can start straight away.
 */
interface RecJob {
  name: string;
  toFolder: boolean;
  /** Its own folder (raw video, .srt, subtitled MP4), when saving to a folder. */
  dir: any;
  /** Live-clock time of the recording's first frame. */
  audio0: number;
  /** Live-clock time where the next turbo piece starts. */
  cut: number;
  /** Live-clock time it stopped. */
  endLive: number;
  pieces: Piece[];
  faces: { t: number; faces: TrackedFace[] }[];
  tracker: PeopleTracker | null;
  stopped: boolean;
  blob: Blob | null;
  finalizing: boolean;
  done: boolean;
  /** Replaced by a newer recording before it was saved anywhere. */
  cancelled: boolean;
  /** The finished subtitles. */
  final: SubLine[] | null;
}

function baseName(file: string): string {
  return file.replace(/\.(webm|mp4)$/, '');
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
 * + lip movement, matched to profiles). Optional recording, into a folder as
 * it records: Whisper turbo builds its accurate subtitles in the background
 * meanwhile (the live captions on screen stay fast), and after it stops a
 * copy with the subtitles drawn in is made.
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
   * After a recording stops: turbo's last piece, then the subtitled MP4.
   * Until they're done, Download / Replay of that recording wait (a loader
   * shows the progress); Record doesn't.
   */
  readonly srtWorking = signal(false);
  readonly srtPct = signal(0);
  readonly srtStage = signal('');
  readonly finishing = computed(() => (this.srtWorking() ? 1 : 0));
  /** Making the subtitled copy of the video (cancelled if the page closes). */
  private conversion: { cancel(): Promise<void> } | null = null;
  /** The recording being made, or the last one made. */
  private job: RecJob | null = null;
  readonly lineCount = signal(0);
  /** While recording: how far the accurate subtitles have got. */
  readonly accurateText = signal('');
  /** A previous recording still finishing in the background. */
  readonly prevStatus = signal('');
  // Turbo, making the accurate subtitles in the background.
  private bgWorker: Worker | null = null;
  private bgReady = false;
  private bgFailed = '';
  private bgNext = 1;
  private bgPieces = new Map<number, { job: RecJob; piece: Piece }>();
  private bgLoadFiles = new Map<string, { loaded: number; total: number }>();
  /** Subtitled copies are made one at a time. */
  private burnChain: Promise<void> = Promise.resolve();
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
  // Saving into a folder while recording (Chrome / Edge).
  readonly folderSupported = RecordingStore.supported();
  readonly saveToFolder = signal(RecordingStore.supported());
  readonly folderName = signal('');
  readonly savedToFolder = signal(false);
  readonly savedMb = signal(0);
  readonly unfinished = signal<string[]>([]);
  readonly preparingRec = signal(false);
  /** The download's .zip is being put together. */
  readonly zipping = signal(false);
  private readonly store = new RecordingStore();
  /** Template: this recording is being saved into the folder. */
  recordToFolderNow(): boolean {
    return this.recording() && !!this.job?.toFolder;
  }
  private liveSrtTimer?: ReturnType<typeof setInterval>;
  /**
   * Draw the face boxes and names into the recording. (Live captions aren't
   * drawn in: they arrive seconds after the words, so they'd sit that far
   * behind in the video. The accurate subtitles are drawn into a copy after
   * recording — see burnSubtitles — timed to the speech.)
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
  private recordedBlob: Blob | null = null;
  /**
   * The recording with its accurate subtitles drawn into the picture (MP4),
   * so they show in any player — a separate .srt is ignored by most.
   */
  private subtitledBlob: Blob | null = null;
  readonly subtitledName = signal('');
  // Faces.
  private analyser: FaceAnalyser | null = null;
  private tracker: PeopleTracker | null = null;
  private faceGen = 0;
  private faces = new Map<number, TrackedFace[]>();
  private faceTimes: number[] = [];

  constructor() {
    if (!this.isBrowser) return;
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.store.rememberedFolder().then((name) => {
      this.folderName.set(name);
      if (name) this.checkUnfinished();
    });
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
    this.releaseBgWorker();
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
    if (this.recording() && this.job) {
      this.cutPieces(this.job, false);
      this.updateAccurateText();
    }
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
        if (this.recording() && this.job) this.job.faces.push({ t, faces: tracked });
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

  /**
   * Name shown for a line: null when names are off, or when no face on
   * screen is saying it (no name rather than "Unknown", which is for a face
   * that isn't recognised).
   */
  nameOf(line: LiveLine): { name: string; recognised: boolean; guess: boolean } | null {
    this.faceVersion();
    if (!this.namesOn() || line.pick?.personId == null) return null;
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

  async startRecording(): Promise<void> {
    if (!this.stream || this.recording() || this.preparingRec()) return;
    // The folder first, straight from this click (the browser needs a click
    // to show its folder picker / to allow access again).
    let toFolder = false;
    if (this.folderSupported && this.saveToFolder()) {
      this.preparingRec.set(true);
      toFolder = await this.store.ensureFolder();
      this.preparingRec.set(false);
      if (!toFolder) {
        this.error.set('Recording not started — no folder was chosen. Untick “Save to folder” to record without one.');
        return;
      }
      this.folderName.set(this.store.folderName);
    }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    // With names on, record a drawn copy of the picture (camera + face
    // boxes, which are in sync) — the plain camera stream otherwise.
    const burnNames = this.recNames() && this.namesOn();
    const source = burnNames ? this.composedStream() : this.stream;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(source, type ? { mimeType: type } : undefined);
    } catch (e: any) {
      this.error.set(`Recording isn't available in this browser (${e?.message ?? e}).`);
      return;
    }
    this.recorder = recorder;
    // The previous recording, if still finishing, carries on in the
    // background when it's in the folder; one held only in the browser is
    // replaced (as before, a new recording replaces the last one).
    const prev = this.job;
    if (prev && !prev.done) {
      if (prev.toFolder) this.prevStatus.set('Previous recording: finishing…');
      else prev.cancelled = true;
    }
    // The loader below is for this recording from now on.
    this.srtWorking.set(false);
    this.srtStage.set('');
    this.clearRecording();
    const chunks: Blob[] = [];
    const mime = recorder.mimeType || type || 'video/webm';
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `live-recording-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
    this.recordedName.set(name);
    let dir: any = null;
    if (toFolder) {
      try {
        dir = await this.store.begin(name, baseName(name));
      } catch (e: any) {
        this.error.set(`Couldn't write to the folder (${e?.message ?? e}) — recording in the browser instead; use Download afterwards.`);
        toFolder = false;
      }
    }
    const clock = this.audio?.clockMs() ?? 0;
    const job: RecJob = {
      name,
      toFolder,
      dir,
      audio0: clock,
      cut: clock,
      endLive: clock,
      pieces: [],
      faces: [],
      tracker: this.tracker,
      stopped: false,
      blob: null,
      finalizing: false,
      done: false,
      cancelled: false,
      final: null,
    };
    this.job = job;
    this.lineCount.set(0);
    this.savedToFolder.set(false);
    this.savedMb.set(0);
    // The video's first frame: the accurate subtitles are timed from here.
    recorder.onstart = () => {
      job.audio0 = job.cut = this.audio?.clockMs() ?? job.audio0;
    };
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      if (job.toFolder) {
        // Into the folder as it records: an interruption keeps all but the
        // last few seconds.
        this.store.addPart(e.data);
        if (job === this.job) this.zone.run(() => this.savedMb.set(Math.round((this.store.savedBytes + e.data.size) / 1e5) / 10));
      } else {
        chunks.push(e.data);
      }
    };
    recorder.onstop = () =>
      this.zone.run(async () => {
        let blob: Blob;
        try {
          // Join the pieces into one file in the folder; use that file
          // (read from disk, not memory) for replay and subtitles.
          blob = job.toFolder ? await this.store.finish() : new Blob(chunks, { type: mime });
        } catch (e: any) {
          job.cancelled = true;
          if (job === this.job) {
            this.srtWorking.set(false);
            this.srtStage.set('');
          }
          this.error.set(`Couldn't finish saving the recording (${e?.message ?? e}). Its pieces are kept in the folder — use Recover.`);
          this.checkUnfinished();
          return;
        } finally {
          chunks.length = 0;
        }
        job.blob = blob;
        if (job === this.job) {
          this.recordedBlob = blob;
          this.recordedUrl.set(URL.createObjectURL(blob));
          this.savedToFolder.set(job.toFolder);
        }
        this.maybeFinish(job);
      });
    // Smaller pieces when saving to a folder (each is a crash-safe save point).
    recorder.start(toFolder ? 5000 : 1000);
    this.recordStart.set(this.nowMs());
    this.recording.set(true);
    // Turbo starts loading now; it works on a piece every ~28 s.
    this.ensureBgWorker();
    this.updateAccurateText();
    if (toFolder) {
      // The subtitles so far — accurate where turbo is done, live captions
      // after that — saved next to the video every 10 s, so an interrupted
      // recording keeps its subtitles too.
      this.liveSrtTimer = setInterval(() => this.saveSubtitles(job), 10000);
    }
  }

  /** Write a recording's subtitles (as far as they go) into the folder. */
  private saveSubtitles(job: RecJob): Promise<void> {
    if (!job.toFolder || job.cancelled) return Promise.resolve();
    return this.store.writeText(job.dir, baseName(job.name) + '.srt', toSrt(this.linesFor(job)));
  }

  /** Pick a different folder for recordings (from a click). */
  async changeFolder(): Promise<void> {
    if (await this.store.ensureFolder(true)) {
      this.folderName.set(this.store.folderName);
      this.checkUnfinished();
    }
  }

  private async checkUnfinished(): Promise<void> {
    this.unfinished.set(await this.store.unfinished().catch(() => []));
  }

  /** Join the pieces of recordings an interruption left unfinished. */
  async recoverUnfinished(): Promise<void> {
    if (!(await this.store.ensureFolder())) return;
    const done = await this.store.recover();
    await this.checkUnfinished();
    this.error.set(
      done.length
        ? `Recovered ${done.length} recording${done.length > 1 ? 's' : ''} in “${this.store.folderName}”: ${done.join(', ')}`
        : `Couldn't recover the recording${this.store.lastError ? ` (${this.store.lastError})` : ''}.`,
    );
  }

  stopRecording(): void {
    if (!this.recording()) return;
    const job = this.job;
    // The words being spoken right now go to the live captions at once.
    this.audio?.flush();
    this.recorder?.stop();
    this.recording.set(false);
    clearInterval(this.liveSrtTimer);
    clearInterval(this.recDraw);
    // Only the drawn picture's track: the audio track is the camera's own.
    this.recStream?.getVideoTracks().forEach((t) => t.stop());
    this.recStream = null;
    this.recCanvas = null;
    this.accurateText.set('');
    if (job) {
      job.stopped = true;
      job.endLive = this.audio?.clockMs() ?? job.cut;
      // Only the sound since the last piece is left for turbo.
      this.cutPieces(job, true);
      this.srtWorking.set(true);
      this.reportFinishing(job);
      this.maybeFinish(job);
    }
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
    // Opaque: a transparent canvas is recorded with an extra transparency
    // layer, which the subtitled-copy converter can't read (it stalls).
    const g = canvas.getContext('2d', { alpha: false })!;
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

  /** How many caption lines the last recording's subtitle file has. */
  recordedLineCount(): number {
    return this.lineCount();
  }

  /** The last recording's name without its extension (its folder's name). */
  recordedBaseName(): string {
    return baseName(this.recordedName());
  }

  // ── Accurate subtitles, in the background while recording ────────────

  /**
   * Turbo (Whisper large-v3-turbo) in its own worker, from the first
   * recording until the camera is turned off. It works on one ≤28 s piece
   * of the recording at a time — a few seconds of GPU every ~28 s.
   */
  private ensureBgWorker(): void {
    if (this.bgWorker || this.bgFailed) return;
    try {
      const w = new Worker(new URL('./speech.worker', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => this.zone.run(() => this.onBgWorker(data));
      w.onerror = (e) => this.zone.run(() => this.bgFail(e.message || 'speech worker failed'));
      w.postMessage({ type: 'load', highAccuracy: true, english: this.language() === 'en' });
      this.bgWorker = w;
      this.bgReady = false;
      this.bgLoadFiles.clear();
    } catch (e: any) {
      this.bgFail(String(e?.message ?? e));
    }
  }

  private onBgWorker(data: any): void {
    if (data.type === 'progress') {
      this.bgLoadFiles.set(data.file, { loaded: data.loaded ?? 0, total: data.total ?? 0 });
    } else if (data.type === 'ready') {
      this.bgReady = true;
    } else if (data.type === 'result' || data.type === 'error') {
      const entry = data.id != null ? this.bgPieces.get(data.id) : undefined;
      if (!entry) {
        if (data.type === 'error') this.bgFail(data.message);
        return;
      }
      this.bgPieces.delete(data.id);
      const { job, piece } = entry;
      piece.segs =
        data.type === 'result'
          ? shapeCaptions((data.segments as SpeechSegment[]).map((s) => ({ ...s, text: collapseRepeats(s.text) }))).map((s) =>
              trimToVoice(s, piece.voiced, piece.startMs),
            )
          : this.liveLines(job, piece.startMs, piece.endMs, false); // this piece: the live captions
      piece.done = true;
      piece.voiced = [];
      this.onJobProgress(job);
    }
    this.updateAccurateText();
  }

  /** Turbo can't run: recordings keep the live captions instead. */
  private bgFail(message: string): void {
    this.bgFailed = message;
    this.bgWorker?.terminate();
    this.bgWorker = null;
    const jobs = new Set<RecJob>();
    for (const { job, piece } of this.bgPieces.values()) {
      piece.segs = this.liveLines(job, piece.startMs, piece.endMs, false);
      piece.done = true;
      jobs.add(job);
    }
    this.bgPieces.clear();
    this.error.set(`Accurate subtitles unavailable (${message}) — recordings get the live captions.`);
    jobs.forEach((j) => this.onJobProgress(j));
  }

  /** Turbo is closed once the camera is off and no recording needs it. */
  private releaseBgWorker(): void {
    if (this.running() || this.bgPieces.size) return;
    this.bgWorker?.terminate();
    this.bgWorker = null;
    this.bgReady = false;
    this.bgFailed = '';
  }

  /**
   * Hand the next stretch of the recording's sound to turbo: a ≤28 s piece
   * ending in a pause, once that much has been heard — or everything left,
   * when the recording stops. The same cuts an uploaded video gets.
   */
  private cutPieces(job: RecJob, final: boolean): void {
    const a = this.audio;
    if (!a || this.bgFailed) return;
    const end = final ? job.endLive : a.clockMs();
    if (!final && end - job.cut < BG_PIECE_MS + 500) return;
    const from = Math.max(job.cut, a.keptFromMs());
    const pcm = end - from > 300 ? a.slice(from, end) : null;
    if (!pcm) {
      if (final) job.cut = end;
      return;
    }
    let cuts = splitForWhisper(pcm, BG_PIECE_MS);
    if (!final) cuts = cuts.slice(0, 1); // the rest waits for more sound
    for (const [s0, e] of cuts) {
      let s = s0;
      let voiced = voiceFrames(pcm.subarray(Math.floor(s * 16), Math.floor(e * 16)));
      // A long silence before the first words: start just before them.
      // (After a few seconds of silence Whisper put the first line at the
      // start of the piece — seconds early.)
      const first = voiced.findIndex((v, i) => v && voiced[i + 1] && voiced[i + 2]);
      if (first > LEAD_SILENCE_FRAMES) {
        const skip = first - LEAD_KEEP_FRAMES;
        s += skip * VOICE_FRAME_MS;
        voiced = voiced.slice(skip);
      }
      const audio = pcm.slice(Math.floor(s * 16), Math.floor(e * 16));
      const piece: Piece = { startMs: from + s - job.audio0, endMs: from + e - job.audio0, done: false, segs: [], voiced };
      job.pieces.push(piece);
      if (voiced.filter(Boolean).length < MIN_VOICED_FRAMES) {
        piece.done = true; // silence: nothing to transcribe (turbo would invent words)
        continue;
      }
      const id = this.bgNext++;
      this.bgPieces.set(id, { job, piece });
      this.bgWorker?.postMessage({ type: 'transcribe', id, audio, startMs: piece.startMs, language: this.language() }, [audio.buffer]);
    }
    job.cut = from + cuts[cuts.length - 1][1];
  }

  /** Recording time (ms) up to which turbo is done, piece by piece in order. */
  private doneMs(job: RecJob): number {
    let t = 0;
    for (const p of job.pieces) {
      if (!p.done) break;
      t = p.endMs;
    }
    return t;
  }

  /**
   * A recording's subtitles (ms from its start): turbo's where it's done,
   * the live captions after that (while recording, or if turbo failed).
   */
  private linesFor(job: RecJob): SubLine[] {
    if (job.final) return job.final;
    const doneMs = this.doneMs(job);
    const accurate = this.nameLines(
      job,
      job.pieces.filter((p) => p.done && p.endMs <= doneMs).flatMap((p) => p.segs),
    );
    const endRel = (job.stopped ? job.endLive : this.nowMs()) - job.audio0;
    return endRel > doneMs ? [...accurate, ...this.liveLines(job, doneMs, endRel, true)] : accurate;
  }

  /** Live captions said between two recording times (by their middle). */
  private liveLines(job: RecJob, fromMs: number, toMs: number, withNames: boolean): SubLine[] {
    const from = job.audio0 + fromMs;
    const to = job.audio0 + toMs;
    return this.lines()
      .filter((l) => {
        const mid = (l.seg.startMs + l.seg.endMs) / 2;
        return mid >= from && mid < to;
      })
      .map((l) => {
        const n = withNames ? this.nameOf(l) : null;
        return {
          startMs: Math.max(0, l.seg.startMs - job.audio0),
          endMs: Math.min(l.seg.endMs, to) - job.audio0,
          text: (n ? `${n.name}${n.guess ? '?' : ''}: ` : '') + l.seg.text,
        };
      });
  }

  /** Speaker names from the faces seen while each line was said. */
  private nameLines(job: RecJob, segs: SpeechSegment[]): SubLine[] {
    const tracker = (job.tracker ??= this.tracker);
    if (!this.namesOn() || !tracker) return segs.map((s) => ({ startMs: s.startMs, endMs: s.endMs, text: s.text }));
    let prevId: number | null = null;
    let prevEnd = -1e9;
    return segs.map((seg) => {
      const samples: FaceSample[] = [];
      for (const r of job.faces) {
        const t = r.t - job.audio0;
        if (t < seg.startMs - 500 || t > seg.endMs + 500) continue;
        for (const f of r.faces) samples.push({ timeMs: t, personId: f.personId, area: f.box[2] * f.box[3], mouth: f.mouth });
      }
      const pick = pickSpeaker(seg, samples, seg.startMs - prevEnd < TURN_GAP_MS ? prevId : null);
      prevId = pick.personId;
      prevEnd = seg.endMs;
      const p = pick.personId == null ? null : (tracker.people[pick.personId] ?? null);
      // No face saying it: no name (as on screen).
      const name = pick.personId == null ? '' : `${p?.name ?? 'Unknown'}${p && pick.basis === 'mostVisible' ? '?' : ''}: `;
      return { startMs: seg.startMs, endMs: seg.endMs, text: name + seg.text };
    });
  }

  /** A turbo piece finished: save the subtitles so far; finish if it was the last. */
  private onJobProgress(job: RecJob): void {
    this.saveSubtitles(job);
    if (job.stopped) this.reportFinishing(job);
    this.maybeFinish(job);
  }

  /** Progress of a stopped recording's last turbo pieces. */
  private reportFinishing(job: RecJob): void {
    const len = Math.max(1, job.endLive - job.audio0);
    const pct = Math.min(99, Math.round((100 * this.doneMs(job)) / len));
    if (job === this.job) {
      this.srtStage.set('Making accurate subtitles…');
      this.srtPct.set(pct);
    } else {
      this.prevStatus.set(`Previous recording: accurate subtitles ${pct}%`);
    }
  }

  private updateAccurateText(): void {
    const job = this.job;
    if (!job || !this.recording()) return this.accurateText.set('');
    if (this.bgFailed) return this.accurateText.set('Live captions only');
    if (!this.bgReady) {
      let loaded = 0;
      let total = 0;
      this.bgLoadFiles.forEach((f) => {
        loaded += f.loaded;
        total += f.total;
      });
      return this.accurateText.set(`Loading accurate subtitles${total ? ` ${Math.round((100 * loaded) / total)}%` : ''}…`);
    }
    const done = this.doneMs(job);
    this.accurateText.set(done > 0 ? `Accurate subtitles to ${this.fmt(done)}` : 'Accurate subtitles: building…');
  }

  /** Stopped, its file is complete and turbo is done: final .srt, then the subtitled MP4. */
  private maybeFinish(job: RecJob): void {
    if (!job.stopped || !job.blob || job.finalizing || job.cancelled || job.pieces.some((p) => !p.done)) return;
    job.finalizing = true;
    // Subtitled copies are made one at a time (a new recording may already be going).
    this.burnChain = this.burnChain.then(() => this.finishJob(job));
  }

  private async finishJob(job: RecJob): Promise<void> {
    try {
      if (job.cancelled) return;
      job.final = this.linesFor(job);
      job.faces = [];
      await this.saveSubtitles(job).catch(() => undefined);
      if (job === this.job) this.lineCount.set(job.final.length);
      await this.burnSubtitles(job);
    } finally {
      job.done = true;
      if (job === this.job) {
        this.srtWorking.set(false);
        this.srtStage.set('');
        this.srtPct.set(0);
      }
      this.prevStatus.set('');
      this.releaseBgWorker();
    }
  }

  /**
   * A copy of the recording with the subtitles drawn into the picture, as an
   * MP4 (H.264 + AAC — plays in QuickTime, Windows, phones, WhatsApp…). Made
   * with WebCodecs (the GPU's video encoder), faster than real time. Saved
   * next to the recording in the folder, or kept for Download.
   */
  private async burnSubtitles(job: RecJob): Promise<void> {
    const lines = job.final ?? this.linesFor(job);
    const blob = job.blob;
    if (!lines.length || !blob) return;
    const show = (pct: number) => {
      if (job === this.job) {
        this.srtStage.set('Adding subtitles to the video…');
        this.srtPct.set(pct);
      } else {
        this.prevStatus.set(`Previous recording: adding subtitles to the video ${pct}%`);
      }
    };
    show(0);
    const name = baseName(job.name) + '.subtitled.mp4';
    const toFolder = job.toFolder;
    let writable: (WritableStream & { abort(): Promise<void> }) | null = null;
    // If the converter stops making progress, give up rather than leave
    // Download waiting forever.
    let lastMove = performance.now();
    let stallTimer: ReturnType<typeof setInterval> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      stallTimer = setInterval(() => {
        if (performance.now() - lastMove > CONVERT_STALL_MS) reject(new Error('the video converter stopped responding'));
      }, 2000);
    });
    stalled.catch(() => undefined);
    try {
      const mb = await import('mediabunny');
      const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
      const video = await input.getPrimaryVideoTrack();
      if (!video) return;
      const first = await new mb.EncodedPacketSink(video).getFirstPacket();
      if (first?.sideData?.alpha) throw new Error('the recording has a transparency layer');
      const t0 = await input.getFirstTimestamp().catch(() => 0);
      const W = video.displayWidth;
      const H = video.displayHeight;
      let target: InstanceType<typeof mb.BufferTarget> | InstanceType<typeof mb.StreamTarget>;
      if (toFolder) {
        writable = await this.store.writable(job.dir, name);
        target = new mb.StreamTarget(writable as WritableStream<any>, { chunked: true });
      } else {
        target = new mb.BufferTarget();
      }
      const output = new mb.Output({
        format: new mb.Mp4OutputFormat({ fastStart: toFolder ? false : 'in-memory' }),
        target,
      });
      const canvas = new OffscreenCanvas(W, H);
      const g = canvas.getContext('2d')!;
      const avc = await mb.canEncodeVideo('avc', { width: W, height: H });
      const aac = await mb.canEncodeAudio('aac');
      const conversion = await Promise.race([
        stalled,
        mb.Conversion.init({
          input,
          output,
          video: {
            ...(avc ? { codec: 'avc' as const } : {}),
            forceTranscode: true,
            bitrate: mb.QUALITY_HIGH,
            process: (sample) => {
              lastMove = performance.now();
              sample.draw(g, 0, 0, W, H);
              const ms = (sample.timestamp - t0) * 1000;
              const line = lines.find((l) => ms >= l.startMs && ms < l.endMs);
              if (line) drawSubtitle(g, W, H, line.text);
              return canvas;
            },
          },
          audio: aac ? { codec: 'aac' } : {},
        }),
      ]);
      if (!conversion.isValid) throw new Error('this recording can’t be converted here');
      this.conversion = conversion;
      conversion.onProgress = (p) => this.zone.run(() => show(Math.round(p * 100)));
      await Promise.race([stalled, conversion.execute()]);
      let out: Blob;
      if (toFolder) {
        writable = null; // closed by the conversion
        out = await this.store.file(job.dir, name);
      } else {
        out = new Blob([(target as InstanceType<typeof mb.BufferTarget>).buffer!], { type: 'video/mp4' });
      }
      if (job === this.job && !job.cancelled) {
        this.subtitledBlob = out;
        this.subtitledName.set(name);
      }
    } catch (e: any) {
      await this.conversion?.cancel().catch(() => undefined);
      if (writable) {
        await writable.abort().catch(() => undefined);
        await this.store.remove(job.dir, name);
      }
      this.error.set(
        job === this.job
          ? `Couldn't add the subtitles into the video (${e?.message ?? e}) — the download has the video and a separate .srt.`
          : `Couldn't add the subtitles into ${job.name} (${e?.message ?? e}); its .srt is in the folder.`,
      );
    } finally {
      clearInterval(stallTimer);
      this.conversion = null;
    }
  }

  /**
   * The last recording as one .zip holding its folder, the same three files
   * as a folder recording: the raw video, the .srt (timed from its start,
   * with speakers' names when names are on) and the MP4 with the subtitles
   * in the picture (left out if it couldn't be made). One file, because
   * browsers block a second download from the same click.
   */
  async downloadAll(): Promise<void> {
    if (!this.recordedBlob || !this.job || this.finishing() || this.zipping()) return;
    const base = baseName(this.recordedName());
    const files = [
      { path: `${base}/${this.recordedName()}`, data: this.recordedBlob },
      { path: `${base}/${base}.srt`, data: new Blob([toSrt(this.linesFor(this.job))], { type: 'application/x-subrip;charset=utf-8' }) },
    ];
    if (this.subtitledBlob) files.push({ path: `${base}/${this.subtitledName()}`, data: this.subtitledBlob });
    this.zipping.set(true);
    try {
      this.save(await zipFiles(files), base + '.zip');
    } catch (e: any) {
      this.error.set(`Couldn't put the download together (${e?.message ?? e}).`);
    } finally {
      this.zipping.set(false);
    }
  }

  private save(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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
    this.subtitledBlob = null;
    this.subtitledName.set('');
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
    this.bgWorker?.terminate();
    this.conversion?.cancel().catch(() => undefined);
    clearInterval(this.liveSrtTimer);
    this.clearRecording();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }
}

/**
 * One subtitle, bottom-centre: white text on a dark band (wrapped to at most
 * three lines), the speaker's name ("Name: …") in green.
 */
function drawSubtitle(g: OffscreenCanvasRenderingContext2D, W: number, H: number, text: string): void {
  const m = /^([^:]{1,40}\??):\s+(.*)$/s.exec(text);
  const name = m ? m[1] + ':' : '';
  const body = (m ? m[2] : text).trim();
  const font = Math.max(18, Math.round(H / 22));
  g.font = `600 ${font}px Geist, Arial, sans-serif`;
  g.textBaseline = 'alphabetic';
  const maxW = W * 0.86;
  // Wrap: the name stays on the first line.
  const words = (name ? [name, ...body.split(/\s+/)] : body.split(/\s+/)).filter(Boolean);
  const rows: string[][] = [[]];
  for (const w of words) {
    const row = rows[rows.length - 1];
    if (row.length && g.measureText([...row, w].join(' ')).width > maxW) rows.push([w]);
    else row.push(w);
  }
  const shown = rows.slice(-3);
  const lineH = Math.round(font * 1.3);
  const pad = Math.round(font * 0.45);
  const widths = shown.map((r) => g.measureText(r.join(' ')).width);
  const boxW = Math.max(...widths) + pad * 2;
  const boxH = lineH * shown.length + pad;
  const bottom = H - Math.round(H * 0.06);
  g.fillStyle = 'rgba(0, 0, 0, 0.72)';
  g.fillRect((W - boxW) / 2, bottom - boxH, boxW, boxH);
  shown.forEach((r, i) => {
    let x = (W - widths[i]) / 2;
    const y = bottom - boxH + pad / 2 + lineH * (i + 1) - Math.round(font * 0.3);
    for (const [j, w] of r.entries()) {
      const isName = name && rows.indexOf(r) === 0 && j === 0;
      g.fillStyle = isName ? '#6ee7a0' : '#ffffff';
      const piece = j < r.length - 1 ? w + ' ' : w;
      g.fillText(piece, x, y);
      x += g.measureText(piece).width;
    }
  });
}
