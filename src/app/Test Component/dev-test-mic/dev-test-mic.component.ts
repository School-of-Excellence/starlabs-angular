import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeepFilter3Service } from '../../Service/DeepFilter3/deepfilter3.service';
import { KoalaFilterService } from '../../Service/PicoVoice Koala/koala-filter.service';
import { environment } from '../../../environments/environment'

// ── Interfaces ────────────────────────────────────────────────────────────────

/** One audio channel — WAV blob, playback URL, raw PCM, sample rate. */
interface ChannelResult {
  blob: Blob;
  url: string;
  pcm: Float32Array | null;   // null for Koala (16 kHz WAV, no Float32 kept)
  sampleRate: number;
}

/** PESQ/STOI scores returned by the Python quality server. */
interface QualityScore {
  pesq: number;         // -0.5 → 4.5  (MOS-LQO wideband)
  stoi: number;         // 0 → 1
  pesq_label: string;   // 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Bad'
}

/** Quality analysis state — drives the metrics table in the template. */
interface QualityMetrics {
  df3:         QualityScore | null;
  koala:       QualityScore | null;
  analyzing:   boolean;
  serverError: string | null;
}

/** Live PCM capture via ScriptProcessorNode — lossless, no codec. */
interface PcmCapture {
  ctx:       AudioContext;
  processor: ScriptProcessorNode;
  samples:   Float32Array[];
}

type Status     = 'idle' | 'loading' | 'live' | 'live-error' | 'recording' | 'processing' | 'done' | 'error';
type FileStatus = 'idle' | 'loading' | 'done' | 'error';

@Component({
  standalone: true,
  selector: 'app-dev-test-mic',
  imports: [CommonModule, FormsModule],
  templateUrl: './dev-test-mic.component.html',
  styleUrl: './dev-test-mic.component.css'
})
export class DevTestMicComponent implements OnInit, OnDestroy {

  // ── UI state ──────────────────────────────────────────────────────────────
  status: Status     = 'idle';
  statusMessage      = '';
  isLive             = false;
  resultMode: 'file' | 'live' | 'record' | null = null;

  // ── Filter settings ───────────────────────────────────────────────────────
  suppressionLevel = 80;
  accessKey        = '';

  // ── Shared results ────────────────────────────────────────────────────────
  results: { raw: ChannelResult; df3: ChannelResult; koala: ChannelResult } | null = null;
  quality: QualityMetrics | null = null;

  // ── Mode 1 — File ─────────────────────────────────────────────────────────
  fileStatus:    FileStatus = 'idle';
  fileStatusMsg  = '';
  fileProgress   = { df3: 0, koala: 0 };

  // ── Mode 2 — Live ─────────────────────────────────────────────────────────
  liveHear   = { raw: true, df3: true, koala: true };
  liveLevels = { raw: -96, df3: -96, koala: -96 };
  private levelTimer:      any = null;
  private rawAudioEl:      HTMLAudioElement | null = null;
  private df3AudioEl:      HTMLAudioElement | null = null;
  private rawAnalyser:     AnalyserNode | null = null;
  private df3Analyser:     AnalyserNode | null = null;
  private koalaAnalyser:   AnalyserNode | null = null;
  private rawAnalyserCtx:  AudioContext | null = null;
  private df3AnalyserCtx:  AudioContext | null = null;
  private koalaAnalyserCtx: AudioContext | null = null;

  // ── Mode 3 — Recording ────────────────────────────────────────────────────
  isRecording  = false;
  recordDuration = 0;
  private recordTimer: any = null;
  private rawCapture:  PcmCapture | null = null;
  private df3Capture:  PcmCapture | null = null;

  // ── Internal streams (two getUserMedia calls) ─────────────────────────────
  private rawBrowserStream: MediaStream | null = null;  // EC+NS on  → RAW channel
  private cleanMicStream:   MediaStream | null = null;  // EC+NS off → DF3 + Koala
  private df3Stream:        MediaStream | null = null;

  constructor(
    private df3:   DeepFilter3Service,
    private koala: KoalaFilterService
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.accessKey = environment.picovoiceAccessKey
    // Pre-warm DF3 model so Mode 2/3 init is faster
    if (!this.df3.isInitialized()) {
      this.df3.init(this.suppressionLevel).catch(() => {});
    }
  }

  ngOnDestroy(): void {
    this.stopLiveInternal();
    this.teardownStreams();
    this.resetResults();
  }

  // ── Slider ────────────────────────────────────────────────────────────────

  onSuppressionChange(): void {
    if (this.isLive) this.df3.setSuppressionLevel(this.suppressionLevel);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 1 — File Upload
  // ─────────────────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.processFileComparison(file);
  }

  async processFileComparison(file: File): Promise<void> {
    this.fileStatus    = 'loading';
    this.fileStatusMsg = 'Reading file…';
    this.fileProgress  = { df3: 0, koala: 0 };
    this.resetResults();
    this.quality    = null;
    this.resultMode = null;

    try {
      // 1 — Decode to 48 kHz Float32 PCM (mono ch 0)
      const rawBuffer = await file.arrayBuffer();
      this.fileStatusMsg = 'Decoding audio…';
      const decodeCtx = new AudioContext({ sampleRate: 48000 });
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await decodeCtx.decodeAudioData(rawBuffer.slice(0));
      } finally {
        await decodeCtx.close();
      }
      let rawPcm = audioBuffer.getChannelData(0) as Float32Array<ArrayBuffer>;
      if (audioBuffer.sampleRate !== 48000) {
        this.fileStatusMsg = `Resampling ${audioBuffer.sampleRate} Hz → 48 000 Hz…`;
        rawPcm = await this.resampleTo48k(rawPcm, audioBuffer.sampleRate);
      }
      const rawBlob = this.encodeWav(rawPcm, 48000);

      // 2 — DeepFilterNet3 offline processing
      this.fileStatusMsg = 'Loading DeepFilterNet3 model…';
      const df3Ok = await this.df3.init(this.suppressionLevel);
      if (!df3Ok) throw new Error('DeepFilterNet3 not supported — try Chrome 91+');

      this.fileStatusMsg = 'Processing with DeepFilterNet3…';
      const df3Pcm = await this.df3.processOffline(rawPcm, (pct) => {
        this.fileProgress = { ...this.fileProgress, df3: Math.round(pct * 100) };
      });
      this.df3.destroy();
      this.fileProgress = { ...this.fileProgress, df3: 100 };
      const df3Blob = this.encodeWav(df3Pcm, 48000);

      // 3 — Koala file processing (optional — requires access key)
      let koalaBlob: Blob;
      if (this.accessKey.trim()) {
        this.fileStatusMsg = 'Loading Koala model…';
        const koalaOk = await this.koala.init(this.accessKey.trim());
        if (koalaOk) {
          this.fileStatusMsg = 'Processing with Koala (real-time)…';
          const durationMs = (rawPcm.length / 48000) * 1000;
          koalaBlob = await this.processFileWithKoala(rawPcm, durationMs);
          this.fileProgress = { ...this.fileProgress, koala: 100 };
        } else {
          koalaBlob = this.encodeWav(new Float32Array(0), 16000);
          this.fileStatusMsg = 'Koala init failed — check access key.';
        }
        await this.koala.destroy();
      } else {
        koalaBlob = this.encodeWav(new Float32Array(0), 16000);
      }

      this.results = {
        raw:   { blob: rawBlob,   url: URL.createObjectURL(rawBlob),   pcm: rawPcm,  sampleRate: 48000 },
        df3:   { blob: df3Blob,   url: URL.createObjectURL(df3Blob),   pcm: df3Pcm,  sampleRate: 48000 },
        koala: { blob: koalaBlob, url: koalaBlob.size > 44 ? URL.createObjectURL(koalaBlob) : '', pcm: null, sampleRate: 16000 }
      };

      this.fileStatus    = 'done';
      this.fileStatusMsg = `Done — ${(rawPcm.length / 48000).toFixed(1)}s processed. Play each channel below.`;
      this.resultMode    = 'file';

    } catch (err) {
      console.error('[File] error:', err);
      this.fileStatus    = 'error';
      this.fileStatusMsg = `Error: ${String(err)}`;
      this.df3.destroy();
      await this.koala.destroy();
    }
  }

  /** Feed file audio through Koala's live pipeline via a synthesised MediaStream. */
  private processFileWithKoala(rawPcm: Float32Array, durationMs: number): Promise<Blob> {
    return new Promise<Blob>(resolve => {
      const ctx    = new AudioContext({ sampleRate: 48000 });
      const buffer = ctx.createBuffer(1, rawPcm.length, 48000);
      buffer.copyToChannel(rawPcm as Float32Array<ArrayBuffer>, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const dest = ctx.createMediaStreamDestination();
      source.connect(dest);

      this.koala.startCapture(dest.stream);   // auto-resamples 48→16 kHz internally
      this.koala.startRecordingCapture();
      source.start(0);

      const startTime = Date.now();
      const tick = setInterval(() => {
        const pct = Math.min((Date.now() - startTime) / durationMs, 0.98);
        this.fileProgress = { ...this.fileProgress, koala: Math.round(pct * 100) };
      }, 250);

      // Wait for playback duration + Koala's internal buffer delay (~800 ms)
      setTimeout(async () => {
        clearInterval(tick);
        this.koala.stopRecordingCapture();
        this.koala.stopCapture();
        await ctx.close();
        resolve(this.koala.getRecordedWav());
      }, durationMs + 800);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 2 — Live Mic  (hear all three channels simultaneously, no recording)
  // ─────────────────────────────────────────────────────────────────────────

  async startLivePreview(): Promise<void> {
    this.status        = 'loading';
    this.statusMessage = 'Requesting microphone…';
    this.resetResults();
    this.quality    = null;
    this.resultMode = null;

    if (!this.accessKey.trim()) {
      this.status        = 'live-error';
      this.statusMessage = 'Enter your Picovoice access key to enable Koala.';
      return;
    }

    try {
      // Channel A — browser EC+NS on  → RAW reference
      this.rawBrowserStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      // Channel B+C — browser processing off → DF3 + Koala
      this.cleanMicStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false,
                 sampleRate: 48000, channelCount: 1 }
      });
    } catch {
      this.status        = 'live-error';
      this.statusMessage = 'Microphone access denied.';
      return;
    }

    // Init DF3
    this.statusMessage = 'Loading DeepFilterNet3 model…';
    const df3Ok = this.df3.isInitialized() || await this.df3.init(this.suppressionLevel);
    if (!df3Ok) {
      this.status        = 'live-error';
      this.statusMessage = 'DeepFilterNet3 not supported — try Chrome 91+.';
      this.teardownStreams(); return;
    }
    this.df3Stream = await this.df3.processStream(this.cleanMicStream);

    // Init Koala
    this.statusMessage = 'Loading Koala model…';
    const koalaOk = await this.koala.init(this.accessKey.trim());
    if (!koalaOk) {
      this.status        = 'live-error';
      this.statusMessage = 'Koala init failed — check access key.';
      this.teardownStreams(); this.df3.destroy(); return;
    }
    this.koala.startCapture(this.cleanMicStream);
    this.koala.startLivePlayback();

    // Route RAW + DF3 to audio elements
    this.rawAudioEl = new Audio();
    (this.rawAudioEl as any).srcObject = this.rawBrowserStream;
    this.rawAudioEl.muted = !this.liveHear.raw;
    this.rawAudioEl.play().catch(() => {});

    this.df3AudioEl = new Audio();
    (this.df3AudioEl as any).srcObject = this.df3Stream;
    this.df3AudioEl.muted = !this.liveHear.df3;
    this.df3AudioEl.play().catch(() => {});

    // Setup AnalyserNodes for level meters
    this.setupAnalysers();
    this.levelTimer = setInterval(() => this.updateLiveLevels(), 100);

    this.isLive        = true;
    this.status        = 'live';
    this.statusMessage = 'LIVE — RAW (browser EC/NS) · DeepFilterNet3 · Koala all running.';
  }

  toggleHear(channel: 'raw' | 'df3' | 'koala'): void {
    this.liveHear[channel] = !this.liveHear[channel];
    if (channel === 'raw' && this.rawAudioEl) this.rawAudioEl.muted = !this.liveHear.raw;
    if (channel === 'df3' && this.df3AudioEl)  this.df3AudioEl.muted  = !this.liveHear.df3;
    if (channel === 'koala') {
      if (this.liveHear.koala) this.koala.startLivePlayback();
      else                     this.koala.stopLivePlayback();
    }
  }

  stopLivePreview(): void {
    this.stopLiveInternal();
    this.resultMode    = 'live';
    this.status        = 'idle';
    this.statusMessage = '';
  }

  private stopLiveInternal(): void {
    if (!this.isLive) return;
    this.isLive = false;

    clearInterval(this.levelTimer);
    this.levelTimer = null;

    if (this.rawAudioEl) { this.rawAudioEl.muted = true; this.rawAudioEl.pause(); this.rawAudioEl = null; }
    if (this.df3AudioEl)  { this.df3AudioEl.muted  = true; this.df3AudioEl.pause();  this.df3AudioEl  = null; }

    this.teardownAnalysers();
    this.koala.stopLivePlayback();
    this.koala.stopCapture();
    this.koala.destroy();
    this.df3.destroy();
    this.teardownStreams();
    this.liveLevels = { raw: -96, df3: -96, koala: -96 };
  }

  private setupAnalysers(): void {
    // RAW stream analyser
    this.rawAnalyserCtx = new AudioContext();
    const rawSrc = this.rawAnalyserCtx.createMediaStreamSource(this.rawBrowserStream!);
    this.rawAnalyser = this.rawAnalyserCtx.createAnalyser();
    this.rawAnalyser.fftSize = 2048;
    rawSrc.connect(this.rawAnalyser);

    // DF3 stream analyser (post-processing signal)
    this.df3AnalyserCtx = new AudioContext();
    const df3Src = this.df3AnalyserCtx.createMediaStreamSource(this.df3Stream!);
    this.df3Analyser = this.df3AnalyserCtx.createAnalyser();
    this.df3Analyser.fftSize = 2048;
    df3Src.connect(this.df3Analyser);

    // Koala input level (clean mic pre-Koala — shows voice activity)
    this.koalaAnalyserCtx = new AudioContext();
    const koalaSrc = this.koalaAnalyserCtx.createMediaStreamSource(this.cleanMicStream!);
    this.koalaAnalyser = this.koalaAnalyserCtx.createAnalyser();
    this.koalaAnalyser.fftSize = 2048;
    koalaSrc.connect(this.koalaAnalyser);
  }

  private teardownAnalysers(): void {
    this.rawAnalyser = null; this.df3Analyser = null; this.koalaAnalyser = null;
    this.rawAnalyserCtx?.close();   this.rawAnalyserCtx   = null;
    this.df3AnalyserCtx?.close();   this.df3AnalyserCtx   = null;
    this.koalaAnalyserCtx?.close(); this.koalaAnalyserCtx = null;
  }

  private updateLiveLevels(): void {
    this.liveLevels.raw   = this.analyserRms(this.rawAnalyser);
    this.liveLevels.df3   = this.analyserRms(this.df3Analyser);
    this.liveLevels.koala = this.analyserRms(this.koalaAnalyser);
  }

  private analyserRms(analyser: AnalyserNode | null): number {
    if (!analyser) return -96;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);
    return rms === 0 ? -96 : Math.max(-96, parseFloat((20 * Math.log10(rms)).toFixed(1)));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 3 — Recording
  // ─────────────────────────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    this.status        = 'loading';
    this.statusMessage = 'Initialising…';
    this.resetResults();
    this.quality       = null;
    this.resultMode    = null;
    this.recordDuration = 0;

    if (!this.accessKey.trim()) {
      this.status        = 'live-error';
      this.statusMessage = 'Enter your Picovoice access key to enable Koala.';
      return;
    }

    try {
      this.rawBrowserStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      this.cleanMicStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false,
                 sampleRate: 48000, channelCount: 1 }
      });
    } catch {
      this.status        = 'error';
      this.statusMessage = 'Microphone access denied.';
      return;
    }

    // Init DF3
    this.statusMessage = 'Loading DeepFilterNet3 model…';
    const df3Ok = this.df3.isInitialized() || await this.df3.init(this.suppressionLevel);
    if (!df3Ok) {
      this.status        = 'error';
      this.statusMessage = 'DeepFilterNet3 not supported — try Chrome 91+.';
      this.teardownStreams(); return;
    }
    this.df3Stream = await this.df3.processStream(this.cleanMicStream);

    // Init Koala
    this.statusMessage = 'Loading Koala model…';
    const koalaOk = await this.koala.init(this.accessKey.trim());
    if (!koalaOk) {
      this.status        = 'error';
      this.statusMessage = 'Koala init failed — check access key.';
      this.teardownStreams(); this.df3.destroy(); return;
    }
    this.koala.startCapture(this.cleanMicStream);
    this.koala.startRecordingCapture();

    // PCM captures for raw + DF3
    this.rawCapture = this.startPcmCapture(this.rawBrowserStream);
    this.df3Capture = this.startPcmCapture(this.df3Stream);

    this.isRecording   = true;
    this.status        = 'recording';
    this.statusMessage = 'Recording RAW + DeepFilterNet3 + Koala simultaneously…';
    this.recordTimer   = setInterval(() => this.recordDuration++, 1000);
  }

  async stopRecording(): Promise<void> {
    clearInterval(this.recordTimer);
    this.recordTimer    = null;
    this.isRecording    = false;
    this.status         = 'processing';
    this.statusMessage  = 'Encoding WAV files…';

    const rawPcm = this.rawCapture ? this.stopPcmCapture(this.rawCapture) : new Float32Array(0);
    const df3Pcm = this.df3Capture ? this.stopPcmCapture(this.df3Capture) : new Float32Array(0);
    this.rawCapture = null;
    this.df3Capture = null;

    this.koala.stopRecordingCapture();
    const koalaWav = this.koala.getRecordedWav();
    this.koala.stopCapture();
    await this.koala.destroy();
    this.df3.destroy();
    this.teardownStreams();

    const rawBlob = this.encodeWav(rawPcm, 48000);
    const df3Blob = this.encodeWav(df3Pcm, 48000);

    this.results = {
      raw:   { blob: rawBlob,  url: URL.createObjectURL(rawBlob),  pcm: rawPcm,  sampleRate: 48000 },
      df3:   { blob: df3Blob,  url: URL.createObjectURL(df3Blob),  pcm: df3Pcm,  sampleRate: 48000 },
      koala: { blob: koalaWav, url: URL.createObjectURL(koalaWav), pcm: null,    sampleRate: 16000 }
    };

    this.resultMode    = 'record';
    this.quality       = null;
    this.status        = 'done';
    this.statusMessage = `${this.recordDuration}s recorded. Listen to each channel, then run quality analysis.`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Quality Analysis — POST WAV files to Python quality server
  // ─────────────────────────────────────────────────────────────────────────

  async runQualityAnalysis(): Promise<void> {
    if (!this.results) return;
    this.quality = { df3: null, koala: null, analyzing: true, serverError: null };

    const formDf3 = new FormData();
    formDf3.append('reference', this.results.raw.blob,   'reference.wav');
    formDf3.append('degraded',  this.results.df3.blob,   'df3.wav');

    const formKoala = new FormData();
    formKoala.append('reference', this.results.raw.blob,   'reference.wav');
    formKoala.append('degraded',  this.results.koala.blob, 'koala.wav');

    try {
      const [df3Res, koalaRes] = await Promise.all([
        fetch('http://localhost:8000/api/quality', { method: 'POST', body: formDf3   }).then(r => r.json()),
        fetch('http://localhost:8000/api/quality', { method: 'POST', body: formKoala }).then(r => r.json()),
      ]);
      this.quality = { df3: df3Res, koala: koalaRes, analyzing: false, serverError: null };
    } catch {
      this.quality = {
        df3: null, koala: null, analyzing: false,
        serverError: 'Quality server offline — open a terminal and run: python quality_server.py'
      };
    }
  }

  downloadWav(channel: 'raw' | 'df3' | 'koala'): void {
    if (!this.results) return;
    const r = this.results[channel];
    if (!r.url) return;
    const a = document.createElement('a');
    a.href = r.url;
    a.download = `${channel}-${Date.now()}.wav`;
    a.click();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PCM capture helpers
  // ─────────────────────────────────────────────────────────────────────────

  private startPcmCapture(stream: MediaStream): PcmCapture {
    const samples: Float32Array[] = [];
    const ctx       = new AudioContext({ sampleRate: 48000 });
    const source    = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      samples.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    return { ctx, processor, samples };
  }

  private stopPcmCapture(capture: PcmCapture): Float32Array {
    capture.processor.disconnect();
    capture.ctx.close();
    const total = capture.samples.reduce((s, c) => s + c.length, 0);
    const flat  = new Float32Array(total);
    let offset  = 0;
    for (const chunk of capture.samples) { flat.set(chunk, offset); offset += chunk.length; }
    return flat;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WAV encoding — 16-bit PCM, mono
  // ─────────────────────────────────────────────────────────────────────────

  private encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const numChannels = 1, bitsPerSample = 16;
    const byteRate  = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataBytes  = samples.length * blockAlign;
    const buffer     = new ArrayBuffer(44 + dataBytes);
    const view       = new DataView(buffer);
    this.writeStr(view, 0,  'RIFF');
    view.setUint32(4,  36 + dataBytes, true);
    this.writeStr(view, 8,  'WAVE');
    this.writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16,           true);
    view.setUint16(20, 1,            true);
    view.setUint16(22, numChannels,  true);
    view.setUint32(24, sampleRate,   true);
    view.setUint32(28, byteRate,     true);
    view.setUint16(32, blockAlign,   true);
    view.setUint16(34, bitsPerSample,true);
    this.writeStr(view, 36, 'data');
    view.setUint32(40, dataBytes, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  private writeStr(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resample (file mode — source rate ≠ 48 kHz)
  // ─────────────────────────────────────────────────────────────────────────

  private async resampleTo48k(
    pcm: Float32Array<ArrayBuffer>,
    srcRate: number
  ): Promise<Float32Array<ArrayBuffer>> {
    const targetRate   = 48000;
    const targetLength = Math.ceil(pcm.length * targetRate / srcRate);
    const offCtx       = new OfflineAudioContext(1, targetLength, targetRate);
    const srcBuf       = offCtx.createBuffer(1, pcm.length, srcRate);
    srcBuf.copyToChannel(pcm, 0);
    const src = offCtx.createBufferSource();
    src.buffer = srcBuf;
    src.connect(offCtx.destination);
    src.start(0);
    const rendered = await offCtx.startRendering();
    return rendered.getChannelData(0) as Float32Array<ArrayBuffer>;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Template helpers
  // ─────────────────────────────────────────────────────────────────────────

  get isBusy(): boolean      { return this.status === 'loading' || this.status === 'processing'; }
  get isFileProcessing(): boolean { return this.fileStatus === 'loading'; }

  /** Convert dBFS (-96 → 0) to meter fill percentage (0 → 100). */
  meterPct(db: number): number { return Math.max(0, Math.round((db + 96) / 96 * 100)); }

  pesqColor(score: number | null): string {
    if (score === null) return '';
    if (score >= 3.5) return 'good';
    if (score >= 2.5) return 'fair';
    return 'poor';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup helpers
  // ─────────────────────────────────────────────────────────────────────────

  private teardownStreams(): void {
    this.rawBrowserStream?.getTracks().forEach(t => t.stop());
    this.cleanMicStream?.getTracks().forEach(t => t.stop());
    this.rawBrowserStream = null;
    this.cleanMicStream   = null;
    this.df3Stream        = null;
  }

  private resetResults(): void {
    if (this.results) {
      if (this.results.raw.url)   URL.revokeObjectURL(this.results.raw.url);
      if (this.results.df3.url)   URL.revokeObjectURL(this.results.df3.url);
      if (this.results.koala.url) URL.revokeObjectURL(this.results.koala.url);
    }
    this.results = null;
  }
}
