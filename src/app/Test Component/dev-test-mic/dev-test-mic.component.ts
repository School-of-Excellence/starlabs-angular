import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeepFilter3Service } from '../../Service/DeepFilter3/deepfilter3.service';
import { KoalaFilterService } from '../../Service/PicoVoice Koala/koala-filter.service';

type Status =
  | 'idle' | 'loading' | 'live' | 'live-error'
  | 'recording' | 'processing' | 'done' | 'error';

export interface FilterMetrics {
  filterName: string;
  initTimeMs: number;
  setupMs: number;
  rawEnergyDb: number;
  cleanEnergyDb: number;
  noiseReductionDb: number;
  sampleRate: number;
  extraInfo: string; // e.g. suppression level or delay sample ms
}

@Component({
  standalone: true,
  selector: 'app-dev-test-mic',
  imports: [CommonModule, FormsModule],
  templateUrl: './dev-test-mic.component.html',
  styleUrl: './dev-test-mic.component.css'
})
export class DevTestMicComponent implements OnDestroy {

  // ── UI state ─────────────────────────────────────────────────────────────
  status: Status = 'idle';
  statusMessage = '';
  isLive = false;

  // ── Filter settings ───────────────────────────────────────────────────────
  suppressionLevel = 50;          // DeepFilterNet3 (package default; 80 is too aggressive for speech)
  accessKey = '';                 // Picovoice Koala
  liveFilter: 'df3' | 'koala' = 'df3'; // which filter for Live Preview

  // ── Audio streams ─────────────────────────────────────────────────────────
  private micStream: MediaStream | null = null;
  private df3Stream: MediaStream | null = null;

  // ── Live preview ──────────────────────────────────────────────────────────
  private liveAudioEl: HTMLAudioElement | null = null;

  // ── A/B/C recording (raw + DF3 + Koala simultaneously) ───────────────────
  private rawRecorder: MediaRecorder | null = null;
  private df3Recorder: MediaRecorder | null = null;
  private rawChunks: Blob[] = [];
  private df3Chunks: Blob[] = [];
  private recordingStartTime = 0;

  rawUrl: string | null = null;
  df3Url: string | null = null;
  koalaUrl: string | null = null;

  // ── DF3 energy measurement ────────────────────────────────────────────────
  private analysisCtx: AudioContext | null = null;
  private rawAnalyser: AnalyserNode | null = null;
  private df3Analyser: AnalyserNode | null = null;
  private energyInterval: ReturnType<typeof setInterval> | null = null;
  private rawSamples: number[] = [];
  private df3Samples: number[] = [];

  // ── Results ───────────────────────────────────────────────────────────────
  df3Metrics: FilterMetrics | null = null;
  koalaMetrics: FilterMetrics | null = null;
  userNotes = '';

  constructor(
    private df3: DeepFilter3Service,
    private koala: KoalaFilterService
  ) {}

  // ─── Slider / key changes ─────────────────────────────────────────────────

  onSuppressionChange(): void {
    if (this.isLive && this.liveFilter === 'df3') {
      this.df3.setSuppressionLevel(this.suppressionLevel);
    }
  }

  // ─── Live Preview ─────────────────────────────────────────────────────────

  async startLivePreview(): Promise<void> {
    this.status = 'loading';
    this.resetResults();

    if (this.liveFilter === 'koala' && !this.accessKey.trim()) {
      this.status = 'live-error';
      this.statusMessage = 'Enter your Picovoice access key to test Koala.';
      return;
    }

    this.statusMessage = this.liveFilter === 'df3'
      ? 'Loading DeepFilterNet3 model (~7.7 MB)…'
      : 'Loading Koala model (~3.8 MB) from GitHub…';

    try {
      // Keep browser echo cancellation ON for live preview — without it the
      // Audio element playing through speakers feeds directly back into the mic,
      // creating a feedback loop / echo that never stops. EC is safe here because
      // DF3 handles the actual noise; we just need the browser to prevent mic↔speaker loop.
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 }
      });
    } catch {
      this.status = 'live-error';
      this.statusMessage = 'Microphone access denied.';
      return;
    }

    if (this.liveFilter === 'df3') {
      await this.startDF3LivePreview();
    } else {
      await this.startKoalaLivePreview();
    }
  }

  private async startDF3LivePreview(): Promise<void> {
    const ok = await this.df3.init(this.suppressionLevel);
    if (!ok) {
      this.status = 'live-error';
      this.statusMessage = 'DeepFilterNet3 not supported on this browser (try Chrome 91+).';
      this.micStream!.getTracks().forEach(t => t.stop());
      return;
    }

    this.df3Stream = await this.df3.processStream(this.micStream!);
    this.liveAudioEl = new Audio();
    this.liveAudioEl.srcObject = this.df3Stream;
    this.liveAudioEl.muted = false;
    await this.liveAudioEl.play().catch(() => {});

    this.isLive = true;
    this.status = 'live';
    this.statusMessage = 'LIVE — DeepFilterNet3 active. Listen through headphones.';
  }

  private async startKoalaLivePreview(): Promise<void> {
    const ok = await this.koala.init(this.accessKey.trim());
    if (!ok) {
      this.status = 'live-error';
      this.statusMessage = 'Koala init failed. Check your access key and internet connection.';
      this.micStream!.getTracks().forEach(t => t.stop());
      return;
    }

    this.koala.startCapture(this.micStream!);
    this.koala.startLivePlayback();

    this.isLive = true;
    this.status = 'live';
    this.statusMessage = 'LIVE — Koala active. Listen through headphones (expect ~150ms delay).';
  }

  stopLivePreview(): void {
    // Mute + pause audio element FIRST to immediately break any speaker→mic feedback loop
    if (this.liveAudioEl) {
      this.liveAudioEl.muted = true;
      this.liveAudioEl.pause();
      this.liveAudioEl.srcObject = null;
      this.liveAudioEl = null;
    }
    // Stop mic tracks next (destroys the audio source)
    this.micStream?.getTracks().forEach(t => t.stop());
    // Destroy service last (drains queue, closes AudioContext, terminates worker)
    this.df3.destroy();
    this.koala.stopCapture();
    this.koala.stopLivePlayback();
    this.koala.destroy();
    this.micStream = null;
    this.df3Stream = null;
    this.isLive = false;
    this.status = 'idle';
    this.statusMessage = '';
  }

  // ─── A/B/C Recording ─────────────────────────────────────────────────────

  async startABCRecording(): Promise<void> {
    const hasKoala = !!this.accessKey.trim();

    this.status = 'loading';
    this.statusMessage = hasKoala ? 'Initialising both filters…' : 'Initialising DeepFilterNet3 (Koala skipped — no access key)…';
    this.resetResults();

    // 1. Get mic
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 }
      });
    } catch {
      this.status = 'error';
      this.statusMessage = 'Microphone access denied.';
      return;
    }

    // 2. Init DF3
    this.statusMessage = 'Loading DeepFilterNet3 (~7.7 MB)…';
    const df3Ok = await this.df3.init(this.suppressionLevel);
    if (!df3Ok) {
      this.status = 'error';
      this.statusMessage = 'DeepFilterNet3 not supported on this browser.';
      this.micStream.getTracks().forEach(t => t.stop());
      return;
    }

    // 3. Init Koala (optional — skipped if no access key)
    let koalaOk = false;
    if (hasKoala) {
      this.statusMessage = 'Loading Koala model (~3.8 MB) from GitHub…';
      koalaOk = await this.koala.init(this.accessKey.trim());
      if (!koalaOk) {
        this.status = 'error';
        this.statusMessage = 'Koala init failed. Check your access key.';
        this.micStream.getTracks().forEach(t => t.stop());
        this.df3.destroy();
        return;
      }
    }

    // 4. Wire DF3 audio graph
    this.df3Stream = await this.df3.processStream(this.micStream);

    // 5. Wire Koala capture if available
    if (koalaOk) { this.koala.startCapture(this.micStream); }

    // 6. Attach DF3 energy analysers
    this.setupAnalysers();

    // 7. Set up MediaRecorders for raw + DF3
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/mp4';

    this.rawChunks = [];
    this.df3Chunks = [];

    this.rawRecorder = new MediaRecorder(this.micStream, { mimeType });
    this.rawRecorder.ondataavailable = e => { if (e.data.size > 0) this.rawChunks.push(e.data); };

    this.df3Recorder = new MediaRecorder(this.df3Stream, { mimeType });
    this.df3Recorder.ondataavailable = e => { if (e.data.size > 0) this.df3Chunks.push(e.data); };

    const rawDone = new Promise<void>(r => { this.rawRecorder!.onstop = () => r(); });
    const df3Done = new Promise<void>(r => { this.df3Recorder!.onstop = () => r(); });

    // 8. Start everything
    this.recordingStartTime = Date.now();
    this.startEnergySampling();
    if (koalaOk) { this.koala.startRecordingCapture(); }

    this.rawRecorder.start(100);
    this.df3Recorder.start(100);

    this.status = 'recording';
    this.statusMessage = koalaOk
      ? 'Recording Raw + DF3 + Koala simultaneously… click Stop when done.'
      : 'Recording Raw + DF3 simultaneously (Koala skipped)… click Stop when done.';

    await Promise.all([rawDone, df3Done]);
    this.finalizeRecording(mimeType, koalaOk);
  }

  stopABCRecording(): void {
    this.rawRecorder?.stop();
    this.df3Recorder?.stop();
    this.koala.stopRecordingCapture();
    this.micStream?.getTracks().forEach(t => t.stop());
    this.stopEnergySampling();
    this.status = 'processing';
    this.statusMessage = 'Finalising recordings…';
  }

  private finalizeRecording(mimeType: string, koalaOk: boolean): void {
    const duration = parseFloat(((Date.now() - this.recordingStartTime) / 1000).toFixed(1));

    // Raw player
    this.rawUrl = URL.createObjectURL(new Blob(this.rawChunks, { type: mimeType }));

    // DF3 player
    this.df3Url = URL.createObjectURL(new Blob(this.df3Chunks, { type: mimeType }));

    // Koala player (only if Koala was active)
    this.koalaUrl = koalaOk
      ? URL.createObjectURL(this.koala.getRecordedWav())
      : null;

    // DF3 metrics
    const rawAvg = this.mean(this.rawSamples);
    const df3Avg = this.mean(this.df3Samples);
    this.df3Metrics = {
      filterName: 'DeepFilterNet3',
      initTimeMs: this.df3.initTimeMs,
      setupMs: this.df3.processingLatencyMs,
      rawEnergyDb: parseFloat(rawAvg.toFixed(1)),
      cleanEnergyDb: parseFloat(df3Avg.toFixed(1)),
      noiseReductionDb: parseFloat((rawAvg - df3Avg).toFixed(1)),
      sampleRate: 48000,
      extraInfo: `Suppression level: ${this.suppressionLevel}/100`
    };

    // Koala metrics (only if Koala was active)
    if (koalaOk) {
      const koalaRaw = this.koala.getRawEnergyDb();
      const koalaClean = this.koala.getCleanEnergyDb();
      this.koalaMetrics = {
        filterName: 'Koala (Picovoice)',
        initTimeMs: this.koala.initTimeMs,
        setupMs: this.koala.captureSetupMs,
        rawEnergyDb: koalaRaw,
        cleanEnergyDb: koalaClean,
        noiseReductionDb: parseFloat((koalaRaw - koalaClean).toFixed(1)),
        sampleRate: this.koala.sampleRate,
        extraInfo: `Model delay: ${this.koala.delaySampleMs} ms`
      };
    }

    // Cleanup
    this.teardownAnalysers();
    this.df3.destroy();
    if (koalaOk) { this.koala.stopCapture(); this.koala.destroy(); }
    this.micStream = null;
    this.df3Stream = null;

    this.status = 'done';
    this.statusMessage = koalaOk
      ? `Done! ${duration}s recorded. Compare three players and download your report.`
      : `Done! ${duration}s recorded. Raw vs DeepFilterNet3 comparison ready.`;
  }

  // ─── Energy measurement (DF3 via AnalyserNode) ───────────────────────────

  private setupAnalysers(): void {
    this.analysisCtx = new AudioContext({ sampleRate: 48000 });
    this.rawAnalyser = this.analysisCtx.createAnalyser();
    this.df3Analyser = this.analysisCtx.createAnalyser();
    this.rawAnalyser.fftSize = 2048;
    this.df3Analyser.fftSize = 2048;
    this.analysisCtx.createMediaStreamSource(this.micStream!).connect(this.rawAnalyser);
    this.analysisCtx.createMediaStreamSource(this.df3Stream!).connect(this.df3Analyser);
    this.rawSamples = [];
    this.df3Samples = [];
  }

  private startEnergySampling(): void {
    this.energyInterval = setInterval(() => {
      if (this.rawAnalyser) this.rawSamples.push(this.averageDb(this.rawAnalyser));
      if (this.df3Analyser) this.df3Samples.push(this.averageDb(this.df3Analyser));
    }, 200);
  }

  private stopEnergySampling(): void {
    if (this.energyInterval !== null) { clearInterval(this.energyInterval); this.energyInterval = null; }
  }

  private teardownAnalysers(): void {
    this.stopEnergySampling();
    try { this.analysisCtx?.close(); } catch (_) {}
    this.analysisCtx = null;
    this.rawAnalyser = null;
    this.df3Analyser = null;
  }

  private averageDb(analyser: AnalyserNode): number {
    const buf = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(buf);
    const valid = Array.from(buf).filter(v => isFinite(v) && v > -150);
    if (valid.length === 0) return -100;
    return valid.reduce((s, v) => s + v, 0) / valid.length;
  }

  private mean(arr: number[]): number {
    return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  // ─── Report download ──────────────────────────────────────────────────────

  downloadReport(): void {
    if (!this.df3Metrics) return;

    const report: Record<string, unknown> = {
      testedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      results: {
        deepFilterNet3: { ...this.df3Metrics, package: 'deepfilternet3-noise-filter@1.1.4' },
        ...(this.koalaMetrics ? { koala: { ...this.koalaMetrics, package: '@picovoice/koala-web@3.0.0' } } : {})
      },
      winner: this.pickWinner(),
      notes: this.userNotes.trim()
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `noise-filter-comparison-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private pickWinner(): string {
    if (!this.df3Metrics) return 'unknown';
    if (!this.koalaMetrics) return 'DeepFilterNet3 (only filter tested)';
    return this.df3Metrics.noiseReductionDb >= this.koalaMetrics.noiseReductionDb
      ? 'DeepFilterNet3' : 'Koala (Picovoice)';
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  get isRecording(): boolean { return this.status === 'recording'; }
  get isBusy(): boolean { return this.status === 'loading' || this.status === 'processing'; }
  get hasResults(): boolean { return this.status === 'done'; }

  private resetResults(): void {
    [this.rawUrl, this.df3Url, this.koalaUrl].forEach(u => { if (u) URL.revokeObjectURL(u); });
    this.rawUrl = null; this.df3Url = null; this.koalaUrl = null;
    this.df3Metrics = null; this.koalaMetrics = null;
    this.userNotes = '';
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.stopLivePreview();
    this.teardownAnalysers();
    [this.rawUrl, this.df3Url, this.koalaUrl].forEach(u => { if (u) URL.revokeObjectURL(u); });
  }
}
