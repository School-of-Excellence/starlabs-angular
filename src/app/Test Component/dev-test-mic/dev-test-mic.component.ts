import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeepFilter3Service } from '../../Service/DeepFilter3/deepfilter3.service';
import { KoalaFilterService } from '../../Service/PicoVoice Koala/koala-filter.service';

// ── Interfaces — mirror OpenViduCallQualitySnapshot structure ─────────────────

/** Per-channel audio metrics — one instance for RAW, one for Processed. */
interface AudioChannelMetrics {
  levelDb: number;            // RMS level in dBFS (average loudness)
  peakDb: number;             // Peak level in dBFS (loudest sample)
  durationSec: number;        // Duration in seconds
  sampleRate: number;         // Hz
  echoCancellation: boolean;  // Browser AEC state on the source stream
  noiseSuppression: boolean;  // True when DF3 is actively processing this channel
  autoGainControl: boolean;   // Browser AGC state on the source stream
}

/** Derived comparison between the raw and processed channels. */
interface AudioComparisonMetrics {
  noiseReductionDb: number;    // raw.levelDb − processed.levelDb (positive = noise removed)
  initTimeMs: number;          // DF3 ONNX model load time in ms
  processingLatencyMs: number; // Audio graph wire-up latency in ms
  suppressionLevel: number;    // Fixed DF3 suppression level used this session
  filterName: string;          // 'DeepFilterNet3' or 'Koala (Picovoice)'
}

/** Full test report — three-section structure: RAW · Processed · Comparison. */
interface AudioTestReport {
  testedAt: string;               // ISO timestamp
  browser: string;                // navigator.userAgent
  mode: 'file' | 'live' | 'abc'; // Which mode produced this report
  raw: AudioChannelMetrics;       // Metrics for the unprocessed channel
  processed: AudioChannelMetrics; // Metrics for the DF3-processed channel
  comparison: AudioComparisonMetrics;
  koala?: {                       // Mode 3 only — present when Koala access key provided
    processed: AudioChannelMetrics;
    comparison: AudioComparisonMetrics;
  };
  notes: string;
}

/** Live PCM capture via ScriptProcessorNode — lossless, no codec. */
interface PcmCapture {
  ctx: AudioContext;
  processor: ScriptProcessorNode;
  samples: Float32Array[];
}

type Status = 'idle' | 'loading' | 'live' | 'live-error' | 'recording' | 'processing' | 'done' | 'error';
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
  status: Status = 'idle';
  statusMessage = '';
  isLive = false;
  /** Tracks which mode last produced results — drives player visibility in template. */
  resultMode: 'file' | 'live' | 'abc' | null = null;

  // ── Filter settings ───────────────────────────────────────────────────────
  suppressionLevel = 80;
  accessKey = '';
  liveFilter: 'df3' | 'koala' = 'df3';

  // ── Audio streams ─────────────────────────────────────────────────────────
  private micStream: MediaStream | null = null;  // echoCancellation:true  → feeds DF3 / Koala
  private rawStream: MediaStream | null = null;  // echoCancellation:false → raw WAV reference
  private df3Stream: MediaStream | null = null;

  // ── Live preview ──────────────────────────────────────────────────────────
  private liveAudioEl: HTMLAudioElement | null = null;
  /** ScriptProcessorNode capture of raw stream during live preview. */
  private liveRawCapture: PcmCapture | null = null;
  /** ScriptProcessorNode capture of DF3 / Koala stream during live preview. */
  private liveProcessedCapture: PcmCapture | null = null;

  // ── A/B/C recording ───────────────────────────────────────────────────────
  /** ScriptProcessorNode capture of rawStream during ABC recording. */
  private abcRawCapture: PcmCapture | null = null;
  /** ScriptProcessorNode capture of df3Stream during ABC recording (replaces MediaRecorder). */
  private abcDf3Capture: PcmCapture | null = null;
  private recordingStartTime = 0;
  private koalaWasActive = false;

  // ── Result URLs (Modes 2 + 3) ─────────────────────────────────────────────
  rawUrl: string | null = null;    // Raw WAV (live / abc)
  df3Url: string | null = null;    // DF3 WAV  (live / abc)
  koalaUrl: string | null = null;  // Koala WAV (abc only)
  recordingTimestamp = '';

  // ── File mode (Mode 1) ────────────────────────────────────────────────────
  fileStatus: FileStatus = 'idle';
  fileStatusMsg = '';
  fileProgress = 0;
  fileInputUrl: string | null = null;   // Original uploaded file (for playback + download)
  fileOutputUrl: string | null = null;  // DF3-processed WAV (for playback + download)
  fileProcessingMs = 0;

  // ── Report ────────────────────────────────────────────────────────────────
  report: AudioTestReport | null = null;
  userNotes = '';


  constructor(
    private df3: DeepFilter3Service,
    private koala: KoalaFilterService
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Pre-warm DF3: download + compile ONNX model so init is instant when user clicks Start.
    if (!this.df3.isInitialized()) {
      this.df3.init(this.suppressionLevel).catch(() => {});
    }
  }

  ngOnDestroy(): void {
    this.stopLivePreview();
    this.teardownCaptures();
    this.teardownStreams();
    [this.rawUrl, this.df3Url, this.koalaUrl].forEach(u => { if (u) URL.revokeObjectURL(u); });
    this.resetFileResults();
  }

  // ── Slider / key changes ──────────────────────────────────────────────────

  onSuppressionChange(): void {
    if (this.isLive && this.liveFilter === 'df3') {
      this.df3.setSuppressionLevel(this.suppressionLevel);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 1 — File Comparison
  // ─────────────────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.processFileComparison(file);
  }

  async processFileComparison(file: File): Promise<void> {
    this.fileStatus = 'loading';
    this.fileStatusMsg = 'Reading file…';
    this.fileProgress = 0;
    this.resetFileResults();
    this.report = null;
    this.resultMode = null;

    const t0 = performance.now();

    try {
      // 1 — Keep original file as a playback / download URL
      const rawBuffer = await file.arrayBuffer();
      this.fileInputUrl = URL.createObjectURL(new Blob([rawBuffer], { type: file.type || 'audio/webm' }));

      // 2 — Decode to PCM at 48 kHz
      this.fileStatusMsg = 'Decoding audio to PCM…';
      this.fileProgress = 10;
      const decodeCtx = new AudioContext({ sampleRate: 48000 });
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await decodeCtx.decodeAudioData(rawBuffer.slice(0));
      } finally {
        await decodeCtx.close();
      }

      // Mix to mono channel 0
      let rawPcm = audioBuffer.getChannelData(0) as Float32Array<ArrayBuffer>;

      // 3 — Resample to 48 kHz if source differs
      if (audioBuffer.sampleRate !== 48000) {
        this.fileStatusMsg = `Resampling ${audioBuffer.sampleRate} Hz → 48 000 Hz…`;
        this.fileProgress = 20;
        rawPcm = await this.resampleTo48k(rawPcm, audioBuffer.sampleRate);
      }
      this.fileProgress = 25;

      // 4 — Init DF3
      this.fileStatusMsg = `Loading DeepFilterNet3… (suppression: ${this.suppressionLevel}/100)`;
      const initOk = await this.df3.init(this.suppressionLevel);
      if (!initOk) {
        this.fileStatus = 'error';
        this.fileStatusMsg = 'DeepFilterNet3 init failed — try Chrome 91+.';
        return;
      }
      this.fileProgress = 40;

      // 5 — Offline processing
      const totalFrames = Math.ceil(rawPcm.length / this.df3.frameLength);
      this.fileStatusMsg = `Processing ${totalFrames} frames…`;
      const processedPcm = await this.df3.processOffline(rawPcm, (pct) => {
        this.fileProgress = 40 + Math.round(pct * 55);
      });
      this.fileProgress = 95;

      // 6 — Encode processed PCM as WAV
      this.fileStatusMsg = 'Encoding output WAV…';
      this.fileOutputUrl = URL.createObjectURL(this.encodeWav(processedPcm, 48000));

      this.fileProcessingMs = Math.round(performance.now() - t0);
      this.fileProgress = 100;
      this.fileStatus = 'done';
      this.fileStatusMsg =
        `Done — ${(rawPcm.length / 48000).toFixed(1)}s processed in ${(this.fileProcessingMs / 1000).toFixed(1)}s`;

      // 7 — Build report from decoded PCM arrays
      this.report = this.buildReport('file', rawPcm, processedPcm, {
        rawEc: false, rawNs: false, rawAgc: false
      });
      this.resultMode = 'file';
      this.recordingTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    } catch (err) {
      console.error('[File] error:', err);
      this.fileStatus = 'error';
      this.fileStatusMsg = `Error: ${String(err)}`;
    } finally {
      this.df3.destroy();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 2 — Live Preview  (records both channels; WAVs ready on stop)
  // ─────────────────────────────────────────────────────────────────────────

  async startLivePreview(): Promise<void> {
    this.status = 'loading';
    this.resetResults();
    this.report = null;
    this.resultMode = null;

    if (this.liveFilter === 'koala' && !this.accessKey.trim()) {
      this.status = 'live-error';
      this.statusMessage = 'Enter your Picovoice access key to test Koala.';
      return;
    }

    this.statusMessage = this.liveFilter === 'df3'
      ? 'Loading DeepFilterNet3 model (~7.7 MB)…'
      : 'Loading Koala model (~3.8 MB)…';

    try {
      // Production-matching stream (echoCancellation: true) → feeds DF3 / Koala
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 }
      });
      // Zero-processing stream (echoCancellation: false) → raw WAV reference
      this.rawStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 }
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
    let ok: boolean;
    if (this.df3.isInitialized()) {
      ok = true;
    } else {
      this.statusMessage = 'Loading DeepFilterNet3 model (~7.7 MB)…';
      ok = await this.df3.init(this.suppressionLevel);
    }
    if (!ok) {
      this.status = 'live-error';
      this.statusMessage = 'DeepFilterNet3 not supported on this browser (try Chrome 91+).';
      this.teardownStreams();
      return;
    }

    this.df3Stream = await this.df3.processStream(this.micStream!);

    // Play clean DF3 audio through speakers / headphones
    this.liveAudioEl = new Audio();
    this.liveAudioEl.srcObject = this.df3Stream;
    this.liveAudioEl.muted = false;
    await this.liveAudioEl.play().catch(() => {});

    // Record both channels simultaneously as lossless PCM
    this.liveRawCapture = this.startPcmCapture(this.rawStream!);
    this.liveProcessedCapture = this.startPcmCapture(this.df3Stream!);

    this.isLive = true;
    this.status = 'live';
    this.statusMessage = 'LIVE — DeepFilterNet3 active. Listen through headphones.';
  }

  private async startKoalaLivePreview(): Promise<void> {
    const ok = await this.koala.init(this.accessKey.trim());
    if (!ok) {
      this.status = 'live-error';
      this.statusMessage = 'Koala init failed. Check your access key.';
      this.teardownStreams();
      return;
    }

    this.koala.startCapture(this.micStream!);
    this.koala.startLivePlayback();
    this.koala.startRecordingCapture();

    // Record raw reference while Koala plays
    this.liveRawCapture = this.startPcmCapture(this.rawStream!);

    this.isLive = true;
    this.status = 'live';
    this.statusMessage = 'LIVE — Koala active. Listen through headphones (~150ms delay).';
  }

  async stopLivePreview(): Promise<void> {
    // Update UI immediately — don't wait for WAV encoding
    this.isLive = false;
    this.status = 'processing';
    this.statusMessage = 'Encoding WAV files…';

    // Mute playback before stopping mic (prevents feedback glitch)
    if (this.liveAudioEl) {
      this.liveAudioEl.muted = true;
      this.liveAudioEl.pause();
      this.liveAudioEl.srcObject = null;
      this.liveAudioEl = null;
    }

    // Flatten captures
    const rawPcm = this.liveRawCapture ? this.stopPcmCapture(this.liveRawCapture) : null;
    this.liveRawCapture = null;

    let processedPcm: Float32Array | null = null;

    if (this.liveFilter === 'df3') {
      processedPcm = this.liveProcessedCapture ? this.stopPcmCapture(this.liveProcessedCapture) : null;
      this.liveProcessedCapture = null;
      this.df3.destroy();

    } else {
      // Koala: get recorded WAV; decode to PCM for metrics
      this.koala.stopRecordingCapture();
      const koalaWav = this.koala.getRecordedWav();
      this.df3Url = URL.createObjectURL(koalaWav); // reuse df3Url slot for Koala output

      try {
        const ab = await koalaWav.arrayBuffer();
        const decodeCtx = new AudioContext({ sampleRate: 48000 });
        const buf = await decodeCtx.decodeAudioData(ab);
        await decodeCtx.close();
        processedPcm = new Float32Array(buf.getChannelData(0));
      } catch { /* metrics skipped if decode fails */ }

      this.koala.stopCapture();
      this.koala.stopLivePlayback();
      this.koala.destroy();
    }

    this.teardownStreams();

    // Encode WAVs
    if (rawPcm && rawPcm.length > 0) {
      this.rawUrl = URL.createObjectURL(this.encodeWav(rawPcm, 48000));
    }
    if (processedPcm && processedPcm.length > 0 && !this.df3Url) {
      // DF3 path — Koala already set df3Url above
      this.df3Url = URL.createObjectURL(this.encodeWav(processedPcm, 48000));
    }

    // Build report
    if (rawPcm && rawPcm.length > 0 && processedPcm && processedPcm.length > 0) {
      const filterName = this.liveFilter === 'df3' ? 'DeepFilterNet3' : 'Koala (Picovoice)';
      this.report = this.buildReport('live', rawPcm, processedPcm, {
        rawEc: false, rawNs: false, rawAgc: false, filterName
      });
    }

    this.resultMode = 'live';
    this.recordingTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.status = rawPcm ? 'done' : 'idle';
    this.statusMessage = rawPcm ? 'Recorded. Compare RAW vs Processed and check the report below.' : '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 3 — A/B/C Comparison Recording
  // ─────────────────────────────────────────────────────────────────────────

  async startABCRecording(): Promise<void> {
    const hasKoala = !!this.accessKey.trim();

    this.status = 'loading';
    this.statusMessage = hasKoala ? 'Initialising both filters…' : 'Initialising DeepFilterNet3…';
    this.resetResults();
    this.report = null;
    this.resultMode = null;
    this.koalaWasActive = false;

    try {
      // Production-matching stream → DF3 / Koala
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 }
      });
      // Raw reference stream (zero browser processing)
      this.rawStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 }
      });
    } catch {
      this.status = 'error';
      this.statusMessage = 'Microphone access denied.';
      return;
    }

    // Init DF3
    let df3Ok: boolean;
    if (this.df3.isInitialized()) {
      df3Ok = true;
    } else {
      this.statusMessage = 'Loading DeepFilterNet3 (~7.7 MB)…';
      df3Ok = await this.df3.init(this.suppressionLevel);
    }
    if (!df3Ok) {
      this.status = 'error';
      this.statusMessage = 'DeepFilterNet3 not supported on this browser.';
      this.teardownStreams();
      return;
    }

    // Init Koala (optional)
    if (hasKoala) {
      this.statusMessage = 'Loading Koala (~3.8 MB)…';
      const koalaOk = await this.koala.init(this.accessKey.trim());
      if (!koalaOk) {
        this.status = 'error';
        this.statusMessage = 'Koala init failed. Check your access key.';
        this.teardownStreams();
        this.df3.destroy();
        return;
      }
      this.koalaWasActive = true;
    }

    // Wire DF3
    this.df3Stream = await this.df3.processStream(this.micStream!);

    // Wire Koala
    if (this.koalaWasActive) {
      this.koala.startCapture(this.micStream!);
      this.koala.startRecordingCapture();
    }

    // Start lossless PCM captures (ScriptProcessorNode — no codec, no compression)
    this.abcRawCapture = this.startPcmCapture(this.rawStream!);
    this.abcDf3Capture = this.startPcmCapture(this.df3Stream!);
    this.recordingStartTime = Date.now();

    this.status = 'recording';
    this.statusMessage = this.koalaWasActive
      ? 'Recording Raw + DF3 + Koala simultaneously… click Stop when done.'
      : 'Recording Raw + DF3 simultaneously… click Stop when done.';
  }

  async stopABCRecording(): Promise<void> {
    this.status = 'processing';
    this.statusMessage = 'Encoding WAV files…';

    const duration = parseFloat(((Date.now() - this.recordingStartTime) / 1000).toFixed(1));
    this.recordingTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Flatten PCM captures (sync — all samples already in memory)
    const rawPcm = this.abcRawCapture ? this.stopPcmCapture(this.abcRawCapture) : new Float32Array(0);
    const df3Pcm = this.abcDf3Capture ? this.stopPcmCapture(this.abcDf3Capture) : new Float32Array(0);
    this.abcRawCapture = null;
    this.abcDf3Capture = null;

    if (this.koalaWasActive) { this.koala.stopRecordingCapture(); }
    this.teardownStreams();
    this.df3.destroy();

    // Encode WAVs (16-bit PCM, 48 kHz — lossless)
    if (rawPcm.length > 0) this.rawUrl = URL.createObjectURL(this.encodeWav(rawPcm, 48000));
    if (df3Pcm.length > 0) this.df3Url = URL.createObjectURL(this.encodeWav(df3Pcm, 48000));

    // Koala — get WAV + decode PCM for metrics
    let koalaPcm: Float32Array | undefined;
    if (this.koalaWasActive) {
      const koalaWav = this.koala.getRecordedWav();
      this.koalaUrl = URL.createObjectURL(koalaWav);
      this.koala.stopCapture();
      this.koala.destroy();

      try {
        const ab = await koalaWav.arrayBuffer();
        const decodeCtx = new AudioContext({ sampleRate: 48000 });
        const buf = await decodeCtx.decodeAudioData(ab);
        await decodeCtx.close();
        koalaPcm = new Float32Array(buf.getChannelData(0));
      } catch { /* metrics skipped */ }
    }

    // Build report
    if (rawPcm.length > 0 && df3Pcm.length > 0) {
      this.report = this.buildReport('abc', rawPcm, df3Pcm, { rawEc: false, rawNs: false, rawAgc: false });

      // Append Koala section when PCM was decoded successfully
      if (koalaPcm && koalaPcm.length > 0 && this.report) {
        const koalaMetrics = this.channelMetrics(koalaPcm, {
          ec: false, ns: true, agc: false, sampleRate: this.koala.sampleRate || 16000
        });
        this.report.koala = {
          processed: koalaMetrics,
          comparison: {
            noiseReductionDb: parseFloat((this.report.raw.levelDb - koalaMetrics.levelDb).toFixed(1)),
            initTimeMs: this.koala.initTimeMs,
            processingLatencyMs: this.koala.captureSetupMs,
            suppressionLevel: 0,
            filterName: 'Koala (Picovoice)'
          }
        };
      }
    }

    this.resultMode = 'abc';
    this.status = 'done';
    this.statusMessage = this.koalaWasActive
      ? `Done! ${duration}s recorded. Compare three players and check the report.`
      : `Done! ${duration}s recorded. Raw vs DF3 comparison ready.`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PCM capture helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Attach a ScriptProcessorNode to a stream and begin collecting Float32 PCM. */
  private startPcmCapture(stream: MediaStream): PcmCapture {
    const samples: Float32Array[] = [];
    const ctx = new AudioContext({ sampleRate: 48000 });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      // Copy immediately — the underlying buffer is reused each callback
      samples.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    return { ctx, processor, samples };
  }

  /** Disconnect, close context, and flatten all chunks into a single Float32Array. */
  private stopPcmCapture(capture: PcmCapture): Float32Array {
    capture.processor.disconnect();
    capture.ctx.close();
    const total = capture.samples.reduce((s, c) => s + c.length, 0);
    const flat = new Float32Array(total);
    let offset = 0;
    for (const chunk of capture.samples) { flat.set(chunk, offset); offset += chunk.length; }
    return flat;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Report  (RAW · Processed · Comparison — mirrors OpenViduCallQualitySnapshot)
  // ─────────────────────────────────────────────────────────────────────────

  private buildReport(
    mode: 'file' | 'live' | 'abc',
    rawPcm: Float32Array,
    processedPcm: Float32Array,
    opts: { rawEc: boolean; rawNs: boolean; rawAgc: boolean; filterName?: string }
  ): AudioTestReport {
    const raw = this.channelMetrics(rawPcm, {
      ec: opts.rawEc, ns: opts.rawNs, agc: opts.rawAgc
    });
    const processed = this.channelMetrics(processedPcm, {
      ec: true, ns: true, agc: false
    });

    return {
      testedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      mode,
      raw,
      processed,
      comparison: {
        noiseReductionDb: parseFloat((raw.levelDb - processed.levelDb).toFixed(1)),
        initTimeMs: this.df3.initTimeMs,
        processingLatencyMs: this.df3.processingLatencyMs,
        suppressionLevel: this.suppressionLevel,
        filterName: opts.filterName ?? 'DeepFilterNet3'
      },
      notes: this.userNotes.trim()
    };
  }

  private channelMetrics(
    pcm: Float32Array,
    flags: { ec: boolean; ns: boolean; agc: boolean; sampleRate?: number }
  ): AudioChannelMetrics {
    const sr = flags.sampleRate ?? 48000;
    return {
      levelDb: this.rmsDb(pcm),
      peakDb: this.peakDb(pcm),
      durationSec: parseFloat((pcm.length / sr).toFixed(2)),
      sampleRate: sr,
      echoCancellation: flags.ec,
      noiseSuppression: flags.ns,
      autoGainControl: flags.agc
    };
  }

  private rmsDb(pcm: Float32Array): number {
    if (pcm.length === 0) return -96;
    let sumSq = 0;
    for (let i = 0; i < pcm.length; i++) sumSq += pcm[i] * pcm[i];
    const rms = Math.sqrt(sumSq / pcm.length);
    return rms === 0 ? -96 : parseFloat((20 * Math.log10(rms)).toFixed(1));
  }

  private peakDb(pcm: Float32Array): number {
    if (pcm.length === 0) return -96;
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
    return peak === 0 ? -96 : parseFloat((20 * Math.log10(peak)).toFixed(1));
  }

  downloadReport(): void {
    if (!this.report) return;
    const out = { ...this.report, notes: this.userNotes.trim() };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio-test-report-${this.recordingTimestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WAV encoding  — 16-bit PCM, mono
  // ─────────────────────────────────────────────────────────────────────────

  private encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const numChannels = 1, bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataBytes = samples.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    this.writeStr(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    this.writeStr(view, 8, 'WAVE');
    this.writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
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
  // Resample  (file mode — source rate ≠ 48 kHz)
  // ─────────────────────────────────────────────────────────────────────────

  private async resampleTo48k(
    pcm: Float32Array<ArrayBuffer>,
    srcRate: number
  ): Promise<Float32Array<ArrayBuffer>> {
    const targetRate = 48000;
    const targetLength = Math.ceil(pcm.length * targetRate / srcRate);
    const offCtx = new OfflineAudioContext(1, targetLength, targetRate);
    const srcBuf = offCtx.createBuffer(1, pcm.length, srcRate);
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

  get isRecording(): boolean { return this.status === 'recording'; }
  get isBusy(): boolean { return this.status === 'loading' || this.status === 'processing'; }
  get isFileProcessing(): boolean { return this.fileStatus === 'loading'; }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup helpers
  // ─────────────────────────────────────────────────────────────────────────

  private teardownStreams(): void {
    this.micStream?.getTracks().forEach(t => t.stop());
    this.rawStream?.getTracks().forEach(t => t.stop());
    this.micStream = null;
    this.rawStream = null;
    this.df3Stream = null;
  }

  private teardownCaptures(): void {
    if (this.liveRawCapture) { this.stopPcmCapture(this.liveRawCapture); this.liveRawCapture = null; }
    if (this.liveProcessedCapture) { this.stopPcmCapture(this.liveProcessedCapture); this.liveProcessedCapture = null; }
    if (this.abcRawCapture) { this.stopPcmCapture(this.abcRawCapture); this.abcRawCapture = null; }
    if (this.abcDf3Capture) { this.stopPcmCapture(this.abcDf3Capture); this.abcDf3Capture = null; }
  }

  private resetResults(): void {
    [this.rawUrl, this.df3Url, this.koalaUrl].forEach(u => { if (u) URL.revokeObjectURL(u); });
    this.rawUrl = null;
    this.df3Url = null;
    this.koalaUrl = null;
  }

  private resetFileResults(): void {
    if (this.fileInputUrl) { URL.revokeObjectURL(this.fileInputUrl); this.fileInputUrl = null; }
    if (this.fileOutputUrl) { URL.revokeObjectURL(this.fileOutputUrl); this.fileOutputUrl = null; }
    this.fileProcessingMs = 0;
  }
}
