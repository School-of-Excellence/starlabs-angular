import {
  Component,
  ElementRef,
  EnvironmentInjector,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore } from '@angular/fire/firestore';

import {
  SpeechSegment,
  markDone,
  nextUndone,
  shapeCaptions,
  trimToVoice,
  voiceFrames,
  VOICE_FRAME_MS,
} from './captions';
import { BASIS_LABEL, FaceSample, PeopleTracker, Person, Profile, SpeakerPick, TrackedFace, pickSpeaker } from './speakers';
import type { FaceAnalyser } from './face-analyser';
import { loadProfiles } from './profiles';
import { PlaybackDenoise } from './playback-denoise';

/** Whisper always encodes 30 s, so 30 s chunks are the cheapest. */
const CHUNK_MS = 30000;
/** Chunk ends are moved to the quietest point in this last stretch. */
const CUT_SEARCH_MS = 8000;
/** Pause the video when captions are less than this far ahead… */
const MIN_LEAD_MS = 500;
/** …and resume it once they are this far ahead (or done to the end). */
const RESUME_LEAD_MS = 8000;
/**
 * Speech stops this far ahead of the playhead and waits for it, instead of
 * transcribing the whole video at full GPU load (as on mobile).
 */
const SPEECH_LEAD_MS = 60000;
/** Keep a caption up through short gaps so it doesn't flash on and off. */
const CAPTION_HOLD_MS = 700;

// Faces (names on).
/** One analysed frame every… (lip movement compares back-to-back frames). */
const FACE_STEP_MS = 800;
/** Frames analysed per pass before re-checking the playhead. */
const FACE_BURST_MS = 3000;
/** How far ahead of the playhead faces may run… */
const FACE_LEAD_MS = 20000;
/** …and at most this far past the transcribed speech. */
const FACE_OVER_SPEECH_MS = 4000;
/** A caption's speaker may be decided from the first part of the line… */
const DECIDE_AFTER_MS = 1500;
/** …and if faces haven't reached even that by this far in, it's "Unknown". */
const GIVE_UP_AFTER_MS = 2500;

const PREF_LANGUAGE = 'lvs-language';
const PREF_ACCURACY = 'lvs-high-accuracy';
const PREF_NAMES = 'lvs-names';
const PREF_DENOISE = 'lvs-remove-noise';

/** Profiles stay loaded for the browser session (they rarely change). */
let profilesCache: Profile[] | null = null;

interface LanguageOption {
  code: string | null;
  label: string;
}

interface CaptionView {
  text: string;
  /** Null = words only (names off, or the name is still being worked out). */
  name: string | null;
  recognised: boolean;
}

interface SpeakerBox {
  left: number;
  top: number;
  width: number;
  height: number;
  name: string;
  recognised: boolean;
}

/**
 * Upload a video and play it with subtitles worked out live in the browser
 * (Whisper on WebGPU, in a Web Worker) and, when names are on, who said each
 * line (faces + lip movement, matched to profiles). Nothing is uploaded or
 * saved.
 */
@Component({
  selector: 'app-live-video-subtitles',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './live-video-subtitles.component.html',
  styleUrl: './live-video-subtitles.component.css',
})
export class LiveVideoSubtitlesComponent implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(EnvironmentInjector);

  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;
  /** A new <video> element (new file) is re-routed through noise removal. */
  @ViewChild('video') private set videoEl(el: ElementRef<HTMLVideoElement> | undefined) {
    if (el) this.denoise.elementChanged(el.nativeElement, this.removeNoise()).catch((e) => this.denoiseFailed(e));
  }
  @ViewChild('lines') private linesRef?: ElementRef<HTMLElement>;
  @ViewChild('stage') private stageRef?: ElementRef<HTMLElement>;
  /** The transcript is kept as tall as the video (desktop layout). */
  @ViewChild('player') private set playerEl(el: ElementRef<HTMLElement> | undefined) {
    this.playerObserver?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.playerObserver = new ResizeObserver(([e]) =>
      this.zone.run(() => this.playerHeight.set(Math.round(e.contentRect.height))),
    );
    this.playerObserver.observe(el.nativeElement);
  }
  private playerObserver?: ResizeObserver;

  readonly languages: LanguageOption[] = [
    { code: 'en', label: 'English' },
    { code: null, label: 'Auto-detect' },
    { code: 'hi', label: 'Hindi' },
    { code: 'ta', label: 'Tamil' },
    { code: 'te', label: 'Telugu' },
    { code: 'kn', label: 'Kannada' },
    { code: 'ml', label: 'Malayalam' },
    { code: 'mr', label: 'Marathi' },
    { code: 'bn', label: 'Bengali' },
    { code: 'gu', label: 'Gujarati' },
    { code: 'pa', label: 'Punjabi' },
    { code: 'ur', label: 'Urdu' },
  ];

  // ── UI state ──────────────────────────────────────────────────────────
  readonly videoUrl = signal<string | null>(null);
  readonly fileName = signal('');
  readonly status = signal('');
  readonly error = signal('');
  readonly decoding = signal(false);
  readonly modelReady = signal(false);
  readonly modelLabel = signal('');
  readonly device = signal('');
  readonly loadPct = signal<number | null>(null);
  readonly buffering = signal(false);
  readonly captions = signal<SpeechSegment[]>([]);
  readonly positionMs = signal(0);
  readonly durationMs = signal(0);
  readonly doneMs = signal(0);
  readonly speed = signal<number | null>(null);
  readonly showDiagnostics = signal(false);
  /** Transcript keeps the current line in view (off once the viewer scrolls). */
  readonly follow = signal(true);
  readonly dragOver = signal(false);
  readonly fullscreen = signal(false);
  private readonly playerHeight = signal(0);
  private readonly wide = signal(true);
  // Names.
  readonly namesOn = signal(false);
  /** Viewer hears background noise removed (Whisper always gets the original). */
  readonly removeNoise = signal(false);
  private readonly denoise = new PlaybackDenoise();
  readonly facesStatus = signal('');
  readonly faceDevice = signal('');
  readonly faceDoneMs = signal(0);
  readonly profileCount = signal<number | null>(null);
  readonly caption = signal<CaptionView | null>(null);
  readonly speakerBox = signal<SpeakerBox | null>(null);
  readonly captionBasis = signal('');
  readonly faceTimingText = signal('');
  /** Bumped when face results change, so transcript names refresh. */
  readonly faceVersion = signal(0);

  language: string | null = 'en';
  highAccuracy = true;

  readonly current = computed(() => this.lineAt(this.positionMs(), this.captions()));
  readonly coveragePct = computed(() => {
    const d = this.durationMs();
    return d ? Math.min(100, (this.doneMs() / d) * 100) : 0;
  });
  /** Transcript height: the video's on wide screens; CSS decides otherwise. */
  readonly transcriptHeight = computed(() =>
    !this.fullscreen() && this.wide() && this.playerHeight() > 0 ? Math.max(360, this.playerHeight()) : null,
  );
  readonly faceCoveragePct = computed(() => {
    const d = this.durationMs();
    return d ? Math.min(100, (this.faceDoneMs() / d) * 100) : 0;
  });

  // ── Speech state ──────────────────────────────────────────────────────
  private worker?: Worker;
  private pcm: Float32Array | null = null;
  private done: [number, number][] = [];
  private busy = false;
  /** Bumped on new file / language / model: stale results are dropped. */
  private generation = 0;
  private nextId = 1;
  private pending = new Map<number, { gen: number; startMs: number; endMs: number }>();
  private autoPaused = false;
  private tick?: ReturnType<typeof setInterval>;
  private audioMsDone = 0;
  private workMsDone = 0;
  private loadFiles = new Map<string, { loaded: number; total: number }>();

  // ── Face state (names on) ─────────────────────────────────────────────
  private analyser: FaceAnalyser | null = null;
  private tracker: PeopleTracker | null = null;
  private faceGen = 0;
  /** Analysed frames: time → faces, plus the times kept sorted. */
  private faces = new Map<number, TrackedFace[]>();
  private faceTimes: number[] = [];
  private faceDone: [number, number][] = [];
  /** Speaker per line, decided ONCE so the name never changes on screen. */
  private speakerCache = new Map<SpeechSegment, SpeakerPick>();
  /** Lines shown before their faces were analysed stay "Unknown" on screen. */
  private shownUnknown = new Set<SpeechSegment>();

  constructor() {
    if (!this.isBrowser) return;
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    const mq = window.matchMedia('(min-width: 901px)');
    this.wide.set(mq.matches);
    mq.addEventListener('change', (e) => this.zone.run(() => this.wide.set(e.matches)));
    this.language = this.pref(PREF_LANGUAGE, 'en') || null;
    this.highAccuracy = this.pref(PREF_ACCURACY, '1') === '1';
    this.namesOn.set(this.pref(PREF_NAMES, '0') === '1');
    this.removeNoise.set(this.pref(PREF_DENOISE, '0') === '1');
  }

  // ── Upload ────────────────────────────────────────────────────────────

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.loadFile(file);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('video/')) this.loadFile(file);
    else if (file) this.error.set('That file is not a video. Try an MP4 or WebM.');
  }

  private async loadFile(file: File): Promise<void> {
    if (!this.isBrowser) return;
    this.reset();
    this.fileName.set(file.name);
    const url = URL.createObjectURL(file);
    this.videoUrl.set(url);
    this.ensureWorker();
    this.decoding.set(true);
    this.status.set('Reading the soundtrack…');
    try {
      this.pcm = await this.decodeAudio(file);
      this.durationMs.set(Math.round((this.pcm.length / 16000) * 1000));
      this.status.set(this.modelReady() ? '' : 'Loading the speech model…');
      this.pump();
      if (this.namesOn()) this.startFaces();
    } catch (e: any) {
      this.error.set(
        `Couldn't read the audio from this file (${e?.message ?? e}). ` +
          'Try an MP4 (H.264/AAC) or WebM video.',
      );
      this.status.set('');
    } finally {
      this.decoding.set(false);
    }
  }

  /** Decode the whole soundtrack once, straight to 16 kHz mono. */
  private async decodeAudio(file: File): Promise<Float32Array> {
    const buf = await file.arrayBuffer();
    const ctx = new AudioContext({ sampleRate: 16000 });
    try {
      const audio = await ctx.decodeAudioData(buf);
      const n = audio.length;
      if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
      const out = new Float32Array(n);
      for (let ch = 0; ch < audio.numberOfChannels; ch++) {
        const d = audio.getChannelData(ch);
        for (let i = 0; i < n; i++) out[i] += d[i];
      }
      const k = 1 / audio.numberOfChannels;
      for (let i = 0; i < n; i++) out[i] *= k;
      return out;
    } finally {
      ctx.close();
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────

  onLanguageChange(): void {
    this.savePref(PREF_LANGUAGE, this.language ?? '');
    this.restartSpeech();
  }

  onAccuracyChange(): void {
    this.savePref(PREF_ACCURACY, this.highAccuracy ? '1' : '0');
    this.modelReady.set(false);
    this.restartSpeech();
    this.loadModel();
  }

  onNoiseChange(on: boolean): void {
    this.removeNoise.set(on);
    this.savePref(PREF_DENOISE, on ? '1' : '0');
    this.denoise.set(this.videoRef?.nativeElement ?? null, on).catch((e) => this.denoiseFailed(e));
  }

  /** Diagnostics: the delay noise removal adds to the sound. */
  noiseDelayText(): string {
    const ms = this.removeNoise() ? this.denoise.delayMs() : null;
    return ms === null ? 'off' : `on · about ${ms} ms added to the sound`;
  }

  private denoiseFailed(e: unknown): void {
    this.removeNoise.set(false);
    this.error.set(`Background noise removal isn't available in this browser (${(e as any)?.message ?? e}).`);
  }

  onNamesChange(on: boolean): void {
    this.namesOn.set(on);
    this.savePref(PREF_NAMES, on ? '1' : '0');
    if (on) {
      if (this.pcm) this.startFaces();
    } else {
      this.stopFaces();
    }
  }

  /** Throw away captions and transcribe again from the playhead. */
  private restartSpeech(): void {
    this.generation++;
    this.pending.clear();
    this.busy = false;
    this.done = [];
    this.captions.set([]);
    this.speakerCache.clear();
    this.shownUnknown.clear();
    this.doneMs.set(0);
    this.audioMsDone = 0;
    this.workMsDone = 0;
    this.speed.set(null);
    this.pump();
  }

  // ── Speech worker ─────────────────────────────────────────────────────

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL('./speech.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.zone.run(() => this.onWorker(data));
    this.worker.onerror = (e) =>
      this.zone.run(() => this.error.set(`Speech worker failed: ${e.message || 'unknown error'}`));
    this.loadModel();
    this.tick = setInterval(() => this.zone.run(() => this.onTick()), 100);
  }

  private loadModel(): void {
    this.loadFiles.clear();
    this.loadPct.set(0);
    this.status.set('Loading the speech model…');
    this.worker?.postMessage({ type: 'load', highAccuracy: this.highAccuracy });
  }

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
        this.onResult(data.id, data.segments, data.ms);
        break;
      case 'error': {
        const job = data.id != null ? this.pending.get(data.id) : undefined;
        if (data.id != null) this.pending.delete(data.id);
        this.busy = false;
        if (job && job.gen !== this.generation) return; // stale
        this.error.set(data.message);
        if (job) {
          // Skip the chunk that failed rather than stalling playback.
          markDone(this.done, job.startMs, job.endMs);
          this.pump();
        }
        break;
      }
    }
  }

  // ── Live transcription ────────────────────────────────────────────────

  /**
   * Transcribe the next not-yet-done chunk from the playhead, one at a time,
   * up to {@link SPEECH_LEAD_MS} ahead (the 100 ms tick resumes it as the
   * video plays).
   */
  private pump(): void {
    if (this.busy || !this.pcm || !this.modelReady() || !this.worker) return;
    const total = this.durationMs();
    const start = nextUndone(this.done, this.positionMs());
    if (start >= total || start > this.positionMs() + SPEECH_LEAD_MS) {
      this.status.set('');
      return;
    }
    const end = this.chunkEnd(start, total);
    const audio = this.pcm.slice(Math.floor(start * 16), Math.floor(end * 16));
    const id = this.nextId++;
    this.pending.set(id, { gen: this.generation, startMs: start, endMs: end });
    this.busy = true;
    this.worker.postMessage(
      { type: 'transcribe', id, audio, startMs: start, language: this.language },
      [audio.buffer],
    );
  }

  /**
   * End of the chunk starting at `start`: 30 s on, moved back to the middle
   * of the longest pause in its last {@link CUT_SEARCH_MS} so no word is cut
   * in half — and never past the next already-done stretch.
   */
  private chunkEnd(start: number, total: number): number {
    let end = Math.min(start + CHUNK_MS, total);
    for (const [s] of this.done) if (s > start && s < end) end = s;
    if (end >= total || end - start < CHUNK_MS || !this.pcm) return end;
    const from = end - CUT_SEARCH_MS;
    const voiced = voiceFrames(this.pcm.subarray(Math.floor(from * 16), Math.floor(end * 16)));
    let best = -1;
    let bestLen = 0;
    let runStart = -1;
    for (let i = 0; i <= voiced.length; i++) {
      if (i < voiced.length && !voiced[i]) {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        if (i - runStart >= bestLen) {
          bestLen = i - runStart;
          best = runStart + Math.floor((i - runStart) / 2);
        }
        runStart = -1;
      }
    }
    return best >= 0 ? Math.round(from + best * VOICE_FRAME_MS) : end;
  }

  private onResult(id: number, segments: SpeechSegment[], ms: number): void {
    const job = this.pending.get(id);
    this.pending.delete(id);
    this.busy = false;
    if (!job || job.gen !== this.generation || !this.pcm) return;
    const voiced = voiceFrames(
      this.pcm.subarray(Math.floor(job.startMs * 16), Math.floor(job.endMs * 16)),
    );
    const fresh = shapeCaptions(segments).map((s) => trimToVoice(s, voiced, job.startMs));
    this.captions.update((list) =>
      [...list.filter((c) => c.endMs <= job.startMs || c.startMs >= job.endMs), ...fresh].sort(
        (a, b) => a.startMs - b.startMs,
      ),
    );
    markDone(this.done, job.startMs, job.endMs);
    this.doneMs.set(this.done.reduce((a, [s, e]) => a + (e - s), 0));
    this.audioMsDone += job.endMs - job.startMs;
    this.workMsDone += ms;
    this.speed.set(this.workMsDone > 0 ? this.audioMsDone / this.workMsDone : null);
    this.pump();
  }

  // ── Faces: who is speaking ────────────────────────────────────────────

  private async startFaces(): Promise<void> {
    const url = this.videoUrl();
    if (!url || this.analyser) return;
    const gen = ++this.faceGen;
    this.facesStatus.set('Loading face models…');
    try {
      const { FaceAnalyser } = await import('./face-analyser');
      if (gen !== this.faceGen) return;
      this.analyser = new FaceAnalyser(url, (pct) =>
        this.zone.run(() => this.facesStatus.set(`Loading face models… ${pct}%`)),
      );
      const [device, profiles] = await Promise.all([this.analyser.init(), this.ensureProfiles()]);
      if (gen !== this.faceGen) return;
      this.faceDevice.set(device);
      this.tracker = new PeopleTracker(profiles, FACE_STEP_MS);
      this.facesStatus.set('');
      this.zone.runOutsideAngular(() => this.faceLoop(gen));
    } catch (e: any) {
      if (gen !== this.faceGen) return;
      this.facesStatus.set('');
      this.error.set(`Names unavailable: ${e?.message ?? e}`);
      this.stopFaces();
    }
  }

  private async ensureProfiles(): Promise<Profile[]> {
    if (profilesCache) {
      this.profileCount.set(profilesCache.length);
      return profilesCache;
    }
    try {
      const list = await loadProfiles(this.firestore, this.injector, (n) =>
        this.zone.run(() => this.profileCount.set(n)),
      );
      profilesCache = list;
      this.profileCount.set(list.length);
      return list;
    } catch (e: any) {
      // Faces still work (who is talking); everyone just shows as Unknown.
      this.error.set(`Couldn't load face profiles (${e?.message ?? e}) — speakers will show as Unknown.`);
      this.profileCount.set(0);
      return [];
    }
  }

  private stopFaces(): void {
    this.faceGen++;
    this.analyser?.dispose();
    this.analyser = null;
    this.tracker = null;
    this.faces.clear();
    this.faceTimes = [];
    this.faceDone = [];
    this.faceDoneMs.set(0);
    this.speakerCache.clear();
    this.shownUnknown.clear();
    this.caption.set(null);
    this.speakerBox.set(null);
    this.facesStatus.set('');
  }

  /**
   * Analyse frames every {@link FACE_STEP_MS} from the playhead forward, a
   * burst at a time, staying within {@link FACE_LEAD_MS} of the playhead and
   * {@link FACE_OVER_SPEECH_MS} of the transcribed speech.
   */
  private async faceLoop(gen: number): Promise<void> {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (gen === this.faceGen && this.analyser && this.tracker) {
      const total = this.durationMs();
      const pos = this.positionMs();
      const next = nextUndone(this.faceDone, pos);
      const speechReach = nextUndone(this.done, pos);
      if (next >= total || next > pos + FACE_LEAD_MS || next > speechReach + FACE_OVER_SPEECH_MS) {
        await sleep(200);
        continue;
      }
      let burstEnd = Math.min(next + FACE_BURST_MS, total);
      for (const [s] of this.faceDone) if (s > next && s < burstEnd) burstEnd = s;
      let t = next;
      try {
        for (; t < burstEnd; t += FACE_STEP_MS) {
          const { faces, embed } = await this.analyser.analyse(t);
          if (gen !== this.faceGen || !this.tracker) return;
          const tracked = await this.tracker.track(t, faces, embed);
          if (gen !== this.faceGen) return;
          this.addFaces(t, tracked);
        }
      } catch (e: any) {
        if (gen !== this.faceGen) return;
        this.zone.run(() => this.error.set(`Face analysis: ${e?.message ?? e}`));
        await sleep(1000);
      }
      if (gen !== this.faceGen) return;
      markDone(this.faceDone, next, Math.max(t, next + 1));
      const tm = this.analyser?.timings;
      this.zone.run(() => {
        this.faceDoneMs.set(this.faceDone.reduce((a, [s, e]) => a + (e - s), 0));
        this.faceVersion.update((v) => v + 1);
        if (tm && tm.frames) {
          const per = (x: number) => Math.round(x / tm.frames);
          this.faceTimingText.set(
            `${tm.frames} frames · ${per(tm.seekMs + tm.workerMs + tm.meshMs + tm.embedMs)} ms/frame ` +
              `(read ${per(tm.seekMs)}, detect ${per(tm.workerMs)}, lips ${per(tm.meshMs)} on ` +
              `${this.analyser?.meshDelegate || '?'}, ID ${per(tm.embedMs)}; ${tm.embeds} IDs) · ` +
              `yaw ${this.analyser?.lastYaws.join('/') || '—'}`,
          );
        }
      });
    }
  }

  private addFaces(t: number, list: TrackedFace[]): void {
    if (!this.faces.has(t)) {
      // Insert keeping faceTimes sorted.
      let lo = 0;
      let hi = this.faceTimes.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.faceTimes[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      this.faceTimes.splice(lo, 0, t);
    }
    this.faces.set(t, list);
  }

  /** Index of the first analysed frame at or after `t`. */
  private firstFaceIndex(t: number): number {
    let lo = 0;
    let hi = this.faceTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.faceTimes[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Faces on screen at `pos`: the nearest frame ≤ 700 ms before or ≤ 300 ms after. */
  private facesAt(pos: number): TrackedFace[] {
    const i = this.firstFaceIndex(pos + 1);
    const before = i > 0 ? this.faceTimes[i - 1] : null;
    const after = i < this.faceTimes.length ? this.faceTimes[i] : null;
    if (before !== null && pos - before <= 700) return this.faces.get(before)!;
    if (after !== null && after - pos <= 300) return this.faces.get(after)!;
    return [];
  }

  private facesCover(fromMs: number, toMs: number): boolean {
    const from = Math.max(0, fromMs);
    const to = Math.min(toMs, this.durationMs());
    return nextUndone(this.faceDone, from) >= to;
  }

  /**
   * Speaker for line `c`. With `forCaption`, a line on screen before its
   * faces are analysed is decided from its first {@link DECIDE_AFTER_MS}, or
   * stays "Unknown" while shown if faces haven't reached that by
   * {@link GIVE_UP_AFTER_MS} (the transcript fills the name in later).
   */
  private speakerOf(c: SpeechSegment, forCaption = false): SpeakerPick {
    if (forCaption && this.shownUnknown.has(c)) return { personId: null, basis: 'notAnalysed', activity: new Map() };
    const cached = this.speakerCache.get(c);
    if (cached) return cached;
    if (this.facesCover(c.startMs - 500, c.endMs + 500)) return this.decide(c);
    const pos = this.positionMs();
    if (forCaption && pos >= c.startMs) {
      if (this.facesCover(c.startMs - 500, Math.min(c.startMs + DECIDE_AFTER_MS, c.endMs))) {
        return this.decide(c);
      }
      if (pos >= c.startMs + GIVE_UP_AFTER_MS || pos >= c.endMs) {
        this.shownUnknown.add(c);
        return { personId: null, basis: 'notAnalysed', activity: new Map() };
      }
      return { personId: null, basis: 'pending', activity: new Map() };
    }
    return this.computeSpeaker(c); // provisional, not cached
  }

  private decide(c: SpeechSegment): SpeakerPick {
    const p = this.computeSpeaker(c);
    this.speakerCache.set(c, p);
    return p;
  }

  private computeSpeaker(c: SpeechSegment): SpeakerPick {
    // Turn continuity: who said the previous line, if it was recent.
    const list = this.captions();
    const i = list.indexOf(c);
    let previous: number | null = null;
    if (i > 0 && c.startMs - list[i - 1].endMs < 3000) {
      previous = this.speakerCache.get(list[i - 1])?.personId ?? null;
    }
    const samples: FaceSample[] = [];
    for (let k = this.firstFaceIndex(c.startMs - 500); k < this.faceTimes.length; k++) {
      const t = this.faceTimes[k];
      if (t > c.endMs + 500) break;
      for (const f of this.faces.get(t)!) {
        samples.push({ timeMs: t, personId: f.personId, area: f.box[2] * f.box[3], mouth: f.mouth });
      }
    }
    return pickSpeaker(c, samples, previous);
  }

  private person(id: number | null): Person | null {
    return id === null ? null : (this.tracker?.people[id] ?? null);
  }

  /** Name shown in the transcript for line `c` ('' when names are off). */
  transcriptName(c: SpeechSegment): { name: string; recognised: boolean } | null {
    this.faceVersion(); // re-read when faces change
    if (!this.namesOn() || !this.tracker) return null;
    if (!this.speakerCache.has(c) && !this.facesCover(c.startMs - 500, c.endMs + 500)) {
      return { name: '…', recognised: false };
    }
    const p = this.person(this.speakerOf(c).personId);
    return { name: p?.name ?? 'Unknown', recognised: p?.profileId != null };
  }

  // ── Playback ──────────────────────────────────────────────────────────

  /** The line to caption at `pos` (held {@link CAPTION_HOLD_MS} past its end). */
  private lineAt(pos: number, list: SpeechSegment[]): SpeechSegment | null {
    let recent: SpeechSegment | null = null;
    for (const s of list) {
      if (s.startMs > pos) break;
      if (pos < s.endMs) return s;
      if (pos - s.endMs <= CAPTION_HOLD_MS) recent = s;
    }
    return recent;
  }

  /** Every 100 ms: caption, speaker box, and wait for speech if it's behind. */
  private onTick(): void {
    const v = this.videoRef?.nativeElement;
    if (!v) return;
    const pos = Math.round(v.currentTime * 1000);
    this.positionMs.set(pos);
    this.updateCaption(v);
    this.followTranscript();
    const total = this.durationMs();
    if (!this.pcm || !total) return;
    const lead = nextUndone(this.done, pos) - pos;
    const toEnd = nextUndone(this.done, pos) >= total;
    if (!v.paused && !toEnd && lead < MIN_LEAD_MS) {
      this.autoPaused = true;
      this.buffering.set(true);
      v.pause();
    } else if (this.autoPaused && (toEnd || lead >= RESUME_LEAD_MS)) {
      this.autoPaused = false;
      this.buffering.set(false);
      v.play().catch(() => undefined);
    }
    if (!this.busy) this.pump();
  }

  private updateCaption(v: HTMLVideoElement): void {
    const line = this.current();
    if (!line) {
      this.caption.set(null);
      this.speakerBox.set(null);
      this.captionBasis.set('');
      return;
    }
    if (!this.namesOn() || !this.tracker) {
      this.caption.set({ text: line.text, name: null, recognised: false });
      this.speakerBox.set(null);
      this.captionBasis.set('');
      return;
    }
    const pick = this.speakerOf(line, true);
    const p = this.person(pick.personId);
    this.captionBasis.set(BASIS_LABEL[pick.basis]);
    // Speech always gets a caption; while the name is being worked out
    // (first ~1.5 s), just the words.
    const name =
      pick.basis === 'pending' ? null : p && pick.basis === 'mostVisible' ? `${p.name}?` : (p?.name ?? 'Unknown');
    this.caption.set({ text: line.text, name, recognised: p?.profileId != null });
    // Only the speaker gets a box.
    const face = p ? this.facesAt(this.positionMs()).find((f) => f.personId === p.id) : undefined;
    this.speakerBox.set(face && name ? this.toScreen(v, face.box, name, p!.profileId != null) : null);
  }

  /** Map a box in video pixels onto the displayed (letterboxed) video. */
  private toScreen(v: HTMLVideoElement, b: number[], name: string, recognised: boolean): SpeakerBox | null {
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return null;
    const s = Math.min(v.clientWidth / vw, v.clientHeight / vh);
    const ox = (v.clientWidth - vw * s) / 2;
    const oy = (v.clientHeight - vh * s) / 2;
    return { left: ox + b[0] * s, top: oy + b[1] * s, width: b[2] * s, height: b[3] * s, name, recognised };
  }

  onUserPlay(): void {
    if (this.removeNoise()) this.denoise.resume();
    // A play the viewer asked for while we were waiting keeps waiting.
    this.onTick();
  }

  onUserPause(): void {
    const v = this.videoRef?.nativeElement;
    if (v && !this.autoPaused) this.buffering.set(false);
  }

  onSeeked(): void {
    const v = this.videoRef?.nativeElement;
    if (!v) return;
    this.positionMs.set(Math.round(v.currentTime * 1000));
    // The next chunk is picked from the new playhead (the one in flight
    // finishes first — it's at most a few seconds on a GPU).
    this.pump();
  }

  // ── Transcript follow ─────────────────────────────────────────────────

  private followedLine: SpeechSegment | null = null;
  private followResume?: ReturnType<typeof setTimeout>;

  /** Scroll the transcript so the line being spoken sits near the top third. */
  private followTranscript(force = false): void {
    const line = this.current();
    if (!this.follow() || !line || (!force && line === this.followedLine)) return;
    this.followedLine = line;
    // After this tick's render, so the highlighted row exists.
    requestAnimationFrame(() => {
      const box = this.linesRef?.nativeElement;
      const el = box?.querySelector<HTMLElement>('.lvs-line-now');
      if (!box || !el) return;
      const offset = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
      box.scrollTo({ top: box.scrollTop + offset - box.clientHeight / 3, behavior: 'smooth' });
    });
  }

  /** The viewer scrolled the transcript: stop following for a few seconds. */
  pauseFollow(): void {
    this.follow.set(false);
    clearTimeout(this.followResume);
    this.followResume = setTimeout(() => this.zone.run(() => this.followNow()), 6000);
  }

  followNow(): void {
    clearTimeout(this.followResume);
    this.follow.set(true);
    this.followTranscript(true);
  }

  // ── Full screen (video + captions + speaker box + transcript) ─────────

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      this.stageRef?.nativeElement.requestFullscreen().catch(() => undefined);
    }
  }

  private readonly onFullscreenChange = () =>
    this.zone.run(() => {
      const stage = this.stageRef?.nativeElement;
      const el = document.fullscreenElement;
      // The browser's own video full screen hides captions and names: swap
      // it for ours.
      if (el && el === this.videoRef?.nativeElement && stage) {
        document.exitFullscreen().then(() => stage.requestFullscreen()).catch(() => undefined);
        return;
      }
      this.fullscreen.set(!!el && el === stage);
      this.followNow();
    });

  /** One line per person seen (diagnostics): name, closest profile, votes. */
  peopleSummary(): string[] {
    this.faceVersion();
    return (this.tracker?.people ?? []).map((p) => {
      const c = p.closest;
      const closest = c
        ? `closest ${c.name} ${c.score.toFixed(2)} (next ${c.second.toFixed(2)})`
        : this.profileCount() ? 'no frontal frame yet' : 'no profiles loaded';
      const votes = [...p.votes.values()].reduce((a, b) => Math.max(a, b), 0);
      return `#${p.id} ${p.profileId ? p.name : 'Unknown'} · ${closest}${votes ? ` · ${votes} votes` : ''}`;
    });
  }

  /** Avatar letters for a speaker name ('?' for Unknown). */
  initials(name: string): string {
    if (name === '…') return '…';
    if (name === 'Unknown') return '?';
    const parts = name.replace(/\?$/, '').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  }

  seekTo(c: SpeechSegment): void {
    const v = this.videoRef?.nativeElement;
    if (v) v.currentTime = c.startMs / 1000 + 0.01;
    this.followNow();
  }

  isCurrent(c: SpeechSegment): boolean {
    return this.current() === c;
  }

  fmt(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── Prefs (per browser; defaults if storage is unavailable) ───────────

  private pref(key: string, fallback: string): string {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  private savePref(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode etc. — the setting just isn't remembered */
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  private reset(): void {
    this.stopFaces();
    const url = this.videoUrl();
    if (url) URL.revokeObjectURL(url);
    this.videoUrl.set(null);
    this.pcm = null;
    this.error.set('');
    this.autoPaused = false;
    this.buffering.set(false);
    this.positionMs.set(0);
    this.durationMs.set(0);
    this.restartSpeech();
  }

  ngOnDestroy(): void {
    this.denoise.dispose();
    if (this.tick) clearInterval(this.tick);
    clearTimeout(this.followResume);
    this.playerObserver?.disconnect();
    if (this.isBrowser) document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.worker?.terminate();
    this.stopFaces();
    const url = this.videoUrl();
    if (url) URL.revokeObjectURL(url);
  }
}
