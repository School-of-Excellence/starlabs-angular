import { AfterViewInit, Component, ElementRef, EventEmitter, Inject, NgZone, OnDestroy, Output, PLATFORM_ID, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { BrowserInfo, detectBrowser } from './browser-info';
import { DeviceKind, DeviceProblem, osSettingsUrl, problemHelp, problemMessage } from './device-help';
import { CheckItem, CheckKey, CheckState } from './precheck-recorder';

/**
 * Join "Ready check" (plan 2026-11-27-join-ready-check, Phases 2–4).
 * Runs from the moment /joinroom opens — also while the video server is still starting — and
 * explains every problem with its fix: browser, camera, microphone, speaker, network, computer.
 * Camera + microphone are mandatory (operator 2026-11-27); everything else only warns.
 *
 * e2e hook prefix: rck.
 */
@Component({
  selector: 'app-ready-check',
  imports: [CommonModule],
  templateUrl: './ready-check.component.html',
  styleUrl: './ready-check.component.css'
})
export class ReadyCheckComponent implements AfterViewInit, OnDestroy {
  /** Camera + mic acquired and the browser can run a call → Join may be enabled. */
  @Output() readyChange = new EventEmitter<boolean>();
  /** Every change of any check (for the specialist's "not joined yet" record). */
  @Output() checksChange = new EventEmitter<{ checks: CheckItem[]; retries: number }>();

  @ViewChild('preview') previewEl?: ElementRef<HTMLVideoElement>;

  info: BrowserInfo = detectBrowser('');
  checks: Record<CheckKey, CheckItem> = {
    browser:  { key: 'browser',  state: 'pending', code: '', message: 'Checking…' },
    camera:   { key: 'camera',   state: 'pending', code: '', message: 'Checking…' },
    mic:      { key: 'mic',      state: 'pending', code: '', message: 'Checking…' },
    speaker:  { key: 'speaker',  state: 'pending', code: 'untested', message: 'Play the test sound to check' },
    network:  { key: 'network',  state: 'pending', code: '', message: 'Checking…' },
    computer: { key: 'computer', state: 'pending', code: '', message: 'Checking…' },
  };
  help: Partial<Record<'camera' | 'mic' | 'speaker' | 'browser' | 'network' | 'computer', string>> = {};
  cameraProblem: DeviceProblem | null = null;
  micProblem: DeviceProblem | null = null;

  requesting = false;
  retries = 0;
  hasStream = false;
  ready = false;

  mics: MediaDeviceInfo[] = [];
  cameras: MediaDeviceInfo[] = [];
  speakers: MediaDeviceInfo[] = [];
  selectedMicId = '';
  selectedCameraId = '';
  selectedSpeakerId = '';
  canPickSpeaker = false;

  micLevel = 0;               // 0..1, drives the meter
  meterNeedsClick = false;    // AudioContext suspended until a click (autoplay rule)
  speakerTest: 'idle' | 'asked' = 'idle';
  linkCopied = false;

  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private meterTimer: any = null;
  private meterStartedAt = 0;
  private heardVoice = false;
  private testAudio: HTMLAudioElement | null = null;
  private isBrowser: boolean;
  private destroyed = false;
  private readonly onDeviceChange = () => void this.refreshDevices();
  private readonly onOnlineChange = () => void this.checkNetwork();

  private static readonly SILENT_AFTER_MS = 10_000;  // no voice for this long → "can't hear you"
  private static readonly VOICE_LEVEL = 0.06;

  constructor(@Inject(PLATFORM_ID) platformId: object, private zone: NgZone) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.info = detectBrowser();
    this.canPickSpeaker = typeof (HTMLMediaElement.prototype as any).setSinkId === 'function';
    // Defer one tick: the first emissions update the parent's template (avoids ExpressionChanged).
    setTimeout(() => {
      this.checkComputer();
      void this.checkNetwork();
      if (this.checkBrowser()) void this.requestDevices();
      else this.emit();
    });
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
    window.addEventListener('online', this.onOnlineChange);
    window.addEventListener('offline', this.onOnlineChange);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.release();
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    window.removeEventListener('online', this.onOnlineChange);
    window.removeEventListener('offline', this.onOnlineChange);
  }

  // ── Public API (used by the call page) ─────────────────────────────────────────────────────

  /** "Try again" / "Enable Access": re-request camera + mic. Resolves true when both work. */
  async retry(): Promise<boolean> {
    this.retries++;
    if (!this.checkBrowser()) { this.emit(); return false; }
    return this.requestDevices();
  }

  /** Free the camera / mic before the call opens them (avoids double capture). */
  release(): void {
    if (this.meterTimer) { clearInterval(this.meterTimer); this.meterTimer = null; }
    try { void this.audioCtx?.close(); } catch { /* ignore */ }
    this.audioCtx = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.hasStream = false;
    if (this.testAudio) { this.testAudio.pause(); this.testAudio = null; }
  }

  // ── Browser / computer / network ───────────────────────────────────────────────────────────

  private checkBrowser(): boolean {
    const md: any = navigator.mediaDevices;
    if (!window.isSecureContext) {
      this.set('browser', 'fail', 'insecure', 'This page must be opened with https://');
      this.help.browser = 'Open the meeting link exactly as it was sent to you (it starts with https://).';
      return false;
    }
    if (!md?.getUserMedia || typeof (window as any).RTCPeerConnection !== 'function') {
      this.set('browser', 'fail', 'unsupported', "This browser can't run video calls");
      this.help.browser = 'Open this link in Google Chrome, Microsoft Edge or Safari on a computer.';
      return false;
    }
    if (this.info.inApp) {
      const app = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn' }[this.info.inApp];
      this.set('browser', 'warn', 'in-app', `Opened inside ${app} — calls may not work here`);
      this.help.browser = 'Copy the link and open it in Chrome, Edge or Safari (on a computer if you can).';
      return true;
    }
    if (this.info.mobile) {
      this.set('browser', 'warn', 'mobile', 'Calls work best from a computer');
      this.help.browser = 'If you can, open this link on a laptop or desktop in Chrome, Edge or Safari.';
      return true;
    }
    this.set('browser', 'ok', 'ok', 'Supported');
    this.help.browser = undefined;
    return true;
  }

  private checkComputer(): void {
    const cores = navigator.hardwareConcurrency || 0;
    const mem = (navigator as any).deviceMemory || 0;   // Chrome / Edge only; rounded, capped at 8
    // Say exactly what was found, so the person knows WHY it isn't a tick (operator 2026-11-27).
    const reasons: string[] = [];
    if (cores && cores < 4) reasons.push(`it has ${cores} processor core${cores === 1 ? '' : 's'} (video calls run best with 4 or more)`);
    if (mem && mem < 4) reasons.push(`it has about ${mem} GB of memory (4 GB or more is recommended)`);
    if (reasons.length) {
      this.set('computer', 'warn', cores && cores < 4 ? 'low-cpu' : 'low-memory', 'May be slow for video calls');
      // Background blur and Deep Filter Noise are already off by default — keep it that way.
      this.help.computer = `This computer may struggle because ${reasons.join(' and ')}. ` +
        'Close other apps and browser tabs before joining. Background blur and extra noise filtering stay off to keep the call smooth.';
    } else {
      this.set('computer', 'ok', 'ok', 'Good');
      this.help.computer = undefined;
    }
  }

  /**
   * Basic connection check: online, plus round-trip time to this website. A test against the
   * media server itself needs a call token (and LiveKit's checker joins the room as the person),
   * so it is not run before joining.
   */
  async checkNetwork(): Promise<void> {
    if (!navigator.onLine) {
      this.set('network', 'fail', 'offline', "You're offline");
      this.help.network = 'Check your Wi-Fi or cable connection.';
      this.emit();
      return;
    }
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      try {
        await fetch(`assets/ah-black-logo-only.png?rc=${Date.now()}-${i}`, { method: 'HEAD', cache: 'no-store' });
        samples.push(performance.now() - t0);
      } catch { /* counted as missing */ }
    }
    if (this.destroyed) return;
    const conn: any = (navigator as any).connection;
    const slowType = conn && /(^|-)2g$/.test(conn.effectiveType || '');
    const lowDown = conn && typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 1;
    const rtt = samples.length ? samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)] : Infinity;
    if (!samples.length) {
      this.set('network', 'warn', 'unreachable', "Couldn't reach our server — the connection may be blocked");
      this.help.network = 'If you are on an office or hotel network, try another Wi-Fi or a phone hotspot.';
    } else if (slowType || lowDown || rtt > 800) {
      this.set('network', 'warn', 'slow', 'Your connection looks slow — video may freeze');
      this.help.network = 'Move closer to the Wi-Fi router, or pause downloads and other videos.';
    } else {
      this.set('network', 'ok', 'ok', 'Good');
      this.help.network = undefined;
    }
    this.emit();
  }

  // ── Camera + microphone ────────────────────────────────────────────────────────────────────

  private async requestDevices(): Promise<boolean> {
    if (this.requesting) return this.ready;
    this.requesting = true;
    this.release();
    this.cameraProblem = this.micProblem = null;
    this.set('camera', 'pending', '', 'Checking…');
    this.set('mic', 'pending', '', 'Checking…');
    this.emit();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: this.selectedCameraId ? { deviceId: { exact: this.selectedCameraId } } : true,
        audio: this.selectedMicId ? { deviceId: { exact: this.selectedMicId } } : true,
      });
      if (this.destroyed) { stream.getTracks().forEach(t => t.stop()); return false; }
      this.stream = stream;
      this.hasStream = true;
      this.set('camera', 'ok', 'ok', 'Working');
      this.set('mic', 'pending', 'listening', 'Say something — the bar should move');
      this.help.camera = this.help.mic = undefined;
      setTimeout(() => this.attachPreview());
      await this.refreshDevices();
      this.startMeter();
    } catch (err: any) {
      console.warn('[ready-check] camera/mic error:', err?.name, err?.message);
      // A device picked earlier was unplugged → fall back to the default once.
      if (err?.name === 'OverconstrainedError' && (this.selectedCameraId || this.selectedMicId)) {
        this.selectedCameraId = this.selectedMicId = '';
        this.requesting = false;
        return this.requestDevices();
      }
      await this.classify(err);
    } finally {
      this.requesting = false;
    }
    this.updateReady();
    this.emit();
    return this.ready;
  }

  /** Turn one getUserMedia error into a per-device problem with its own message and fix. */
  private async classify(err: any): Promise<void> {
    const name = err?.name || '';
    const msg = String(err?.message || '');
    let cam: DeviceProblem | null = null;
    let mic: DeviceProblem | null = null;

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      const [camPerm, micPerm] = await Promise.all([this.permission('camera'), this.permission('microphone')]);
      const bySystem = /system/i.test(msg);          // Chrome: "Permission denied by system"
      const dismissed = /dismiss/i.test(msg);
      const pick = (perm: string | null): DeviceProblem | null =>
        bySystem ? 'os-blocked'
        : perm === 'denied' ? 'site-blocked'
        : perm === 'granted' ? 'os-blocked'           // the site may use it, so the OS refused
        : dismissed || perm === 'prompt' ? 'dismissed'
        : 'site-blocked';                             // no Permissions API (older Safari / Firefox)
      cam = pick(camPerm);
      mic = pick(micPerm);
      // Only one of the two is the culprit when the other is known-good.
      if (camPerm === 'granted' && !bySystem && micPerm !== 'granted') cam = null;
      if (micPerm === 'granted' && !bySystem && camPerm !== 'granted') mic = null;
      if (!cam && !mic) cam = mic = pick(null);
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      if (!devices.some(d => d.kind === 'videoinput')) cam = 'missing';
      if (!devices.some(d => d.kind === 'audioinput')) mic = 'missing';
      if (!cam && !mic) cam = mic = 'error';
    } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      // Find which device is held by another app by trying each one alone.
      cam = (await this.tryAlone({ video: true })) ? null : 'busy';
      mic = (await this.tryAlone({ audio: true })) ? null : 'busy';
      if (!cam && !mic) cam = mic = 'busy';
    } else {
      cam = mic = 'error';
    }

    this.cameraProblem = cam;
    this.micProblem = mic;
    this.applyProblem('camera', cam);
    this.applyProblem('mic', mic);
  }

  private applyProblem(kind: DeviceKind, p: DeviceProblem | null): void {
    if (!p) {
      this.set(kind, 'warn', 'other-failed', 'Waiting for the other device to be fixed');
      this.help[kind] = undefined;
      return;
    }
    this.set(kind, 'fail', p, problemMessage(kind, p));
    this.help[kind] = problemHelp(kind, p, this.info);
  }

  private async permission(name: 'camera' | 'microphone'): Promise<string | null> {
    try { return (await (navigator as any).permissions.query({ name })).state; } catch { return null; }
  }

  private async tryAlone(c: MediaStreamConstraints): Promise<boolean> {
    try {
      const s = await navigator.mediaDevices.getUserMedia(c);
      s.getTracks().forEach(t => t.stop());
      return true;
    } catch { return false; }
  }

  osSettingsFor(kind: DeviceKind): string | null {
    const p = kind === 'camera' ? this.cameraProblem : this.micProblem;
    return p === 'os-blocked' ? osSettingsUrl(kind, this.info) : null;
  }

  openOsSettings(kind: DeviceKind): void {
    const url = osSettingsUrl(kind, this.info);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.click();
  }

  private attachPreview(): void {
    const el = this.previewEl?.nativeElement;
    if (!el || !this.stream) return;
    el.srcObject = new MediaStream(this.stream.getVideoTracks());
    el.muted = true;
    void el.play().catch(() => { /* muted autoplay is allowed; ignore */ });
  }

  // ── Mic level meter ────────────────────────────────────────────────────────────────────────

  private startMeter(): void {
    const track = this.stream?.getAudioTracks()[0];
    if (!track) return;
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AC();
      const src = this.audioCtx!.createMediaStreamSource(new MediaStream([track]));
      const analyser = this.audioCtx!.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      this.heardVoice = false;
      this.meterStartedAt = Date.now();
      this.meterNeedsClick = this.audioCtx!.state === 'suspended';
      if (this.meterNeedsClick) void this.audioCtx!.resume().then(() => { this.meterNeedsClick = this.audioCtx?.state === 'suspended'; });

      this.zone.runOutsideAngular(() => {
        this.meterTimer = setInterval(() => {
          if (!this.audioCtx || this.audioCtx.state !== 'running') return;
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const level = Math.min(1, Math.sqrt(sum / buf.length) * 5);
          this.zone.run(() => this.onLevel(level, track));
        }, 150);
      });
    } catch (e) {
      console.warn('[ready-check] mic meter unavailable:', e);
      this.set('mic', 'ok', 'ok', 'Working');
      this.updateReady();
      this.emit();
    }
  }

  private onLevel(level: number, track: MediaStreamTrack): void {
    this.micLevel = level;
    if (level >= ReadyCheckComponent.VOICE_LEVEL && !this.heardVoice) {
      this.heardVoice = true;
      this.set('mic', 'ok', 'ok', 'Working — we can hear you');
      this.help.mic = undefined;
      this.updateReady();
      this.emit();
      return;
    }
    if (!this.heardVoice && Date.now() - this.meterStartedAt > ReadyCheckComponent.SILENT_AFTER_MS && this.checks.mic.code !== 'silent') {
      this.set('mic', 'warn', 'silent', track.muted ? 'Your microphone is muted' : "We can't hear you yet");
      this.help.mic = 'Check the mute switch or key on your headset / laptop, speak closer, or pick another microphone below.';
      this.updateReady();
      this.emit();
    }
  }

  async startMeterByClick(): Promise<void> {
    try { await this.audioCtx?.resume(); } catch { /* ignore */ }
    this.meterNeedsClick = this.audioCtx?.state === 'suspended';
  }

  // ── Speaker test ───────────────────────────────────────────────────────────────────────────

  async playTestSound(): Promise<void> {
    if (this.testAudio) this.testAudio.pause();
    const audio = new Audio(ReadyCheckComponent.chimeUrl());
    this.testAudio = audio;
    if (this.selectedSpeakerId && typeof (audio as any).setSinkId === 'function') {
      try { await (audio as any).setSinkId(this.selectedSpeakerId); } catch { /* default output */ }
    }
    try {
      await audio.play();
      this.speakerTest = 'asked';
    } catch (e) {
      console.warn('[ready-check] test sound failed:', e);
      this.set('speaker', 'warn', 'play-failed', "Couldn't play the test sound");
      this.emit();
    }
  }

  heard(yes: boolean): void {
    this.speakerTest = 'idle';
    if (yes) {
      this.set('speaker', 'ok', 'ok', 'Working');
      this.help.speaker = undefined;
    } else {
      this.set('speaker', 'warn', 'not-heard', "You didn't hear the test sound");
      this.help.speaker = this.canPickSpeaker && this.speakers.length > 1
        ? 'Turn up the volume (and check the mute key), or pick your earphones / speaker below and play the sound again.'
        : 'Turn up the volume and check the mute key. If you use earphones, check they are connected and selected in your computer\'s sound settings, then play the sound again.';
    }
    this.updateReady();
    this.emit();
  }

  /** 1 s two-note chime as a WAV data URL (no asset to ship). */
  private static chimeCache = '';
  private static chimeUrl(): string {
    if (ReadyCheckComponent.chimeCache) return ReadyCheckComponent.chimeCache;
    const rate = 22050, len = rate;   // 1 s
    const data = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const f = t < 0.45 ? 660 : 880;
      const local = t < 0.45 ? t : t - 0.45;
      const env = Math.min(1, local * 40) * Math.exp(-local * 4);
      data[i] = Math.round(Math.sin(2 * Math.PI * f * t) * env * 0.5 * 32767);
    }
    const bytes = new Uint8Array(44 + data.length * 2);
    const dv = new DataView(bytes.buffer);
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, 'data'); dv.setUint32(40, data.length * 2, true);
    data.forEach((v, i) => dv.setInt16(44 + i * 2, v, true));
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    ReadyCheckComponent.chimeCache = 'data:audio/wav;base64,' + btoa(bin);
    return ReadyCheckComponent.chimeCache;
  }

  // ── Device pickers ─────────────────────────────────────────────────────────────────────────

  async refreshDevices(): Promise<void> {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      this.mics = list.filter(d => d.kind === 'audioinput' && d.deviceId);
      this.cameras = list.filter(d => d.kind === 'videoinput' && d.deviceId);
      this.speakers = list.filter(d => d.kind === 'audiooutput' && d.deviceId);
      const v = this.stream?.getVideoTracks()[0]?.getSettings().deviceId;
      const a = this.stream?.getAudioTracks()[0]?.getSettings().deviceId;
      if (v) this.selectedCameraId = v;
      if (a) this.selectedMicId = a;
    } catch { /* ignore */ }
  }

  /** True once the person chose a mic here — the call then uses it instead of its own default. */
  micPicked = false;
  pickMic(id: string): void { this.selectedMicId = id; this.micPicked = true; void this.requestDevices(); }
  pickCamera(id: string): void { this.selectedCameraId = id; void this.requestDevices(); }
  /** A different speaker must be tested again before Join. */
  pickSpeaker(id: string): void {
    this.selectedSpeakerId = id;
    this.speakerTest = 'idle';
    this.set('speaker', 'pending', 'untested', 'Play the test sound on this speaker');
    this.help.speaker = undefined;
    this.updateReady();
    this.emit();
  }

  async copyLink(): Promise<void> {
    try { await navigator.clipboard.writeText(window.location.href); this.linkCopied = true; }
    catch { window.prompt('Copy this link:', window.location.href); }
  }

  // ── State ──────────────────────────────────────────────────────────────────────────────────

  private set(key: CheckKey, state: CheckState, code: string, message: string): void {
    this.checks[key] = { key, state, code, message };
  }

  /** Join needs ALL of: camera working, microphone heard the person, speaker test answered "Yes"
   *  (operator 2026-11-27: Join must stay off until the mic and speaker are ticked). */
  private updateReady(): void {
    const ok = this.hasStream && this.checks.browser.state !== 'fail'
      && this.checks.camera.state === 'ok'
      && this.checks.mic.state === 'ok'
      && this.checks.speaker.state === 'ok';
    if (ok !== this.ready) { this.ready = ok; this.readyChange.emit(ok); }
  }

  private emit(): void {
    this.checksChange.emit({ checks: Object.values(this.checks).map(c => ({ ...c })), retries: this.retries });
  }

  /** How many of the three Join-required checks (camera, mic, speaker) are ticked. */
  requiredDone(): number {
    return (['camera', 'mic', 'speaker'] as CheckKey[]).filter(k => this.checks[k].state === 'ok').length;
  }

  icon(state: CheckState): string {
    return state === 'ok' ? 'check_circle' : state === 'warn' ? 'error' : state === 'fail' ? 'cancel' : 'hourglass_empty';
  }
}
