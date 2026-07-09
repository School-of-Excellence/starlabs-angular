import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocalAudioTrack, Room, RoomEvent, Track, LocalTrackPublication } from 'livekit-client';
import { DfnStateService } from '../../LiveKit/dfn/dfn-state.service';
// Patched DFN build (adds makeupGain + post-DFN gate); vendored from the videoconference
// reference — the SAME engine the self-hosted /joinlivekit flow uses. DFN is single-threaded
// WASM with same-origin assets (/assets/df3), so it runs fine on this no-COEP Cloud route.
import { DeepFilterNoiseFilterProcessor } from '../../LiveKit/dfn/vendor/deepfilternet3-noise-filter';

/**
 * Off / Native / DFN / Krisp noise-filter selector for the LiveKit-Cloud room — a faithful port of
 * the reference meet app's DfnControls.tsx (lib/DfnControls.tsx). A track holds ONE processor at a
 * time, so the four modes are mutually exclusive:
 *
 *  - Off    — stopProcessor() + fully raw capture (ec/ns/agc off). Reference baseline.
 *  - Native — Chrome's own AEC + NS + AGC + voiceIsolation, no processor.
 *  - DFN    — DeepFilterNet3 worklet (vendored engine); tuning sliders visible only in this mode.
 *  - Krisp  — @livekit/krisp-noise-filter, lazy-loaded, guarded on browser support + Cloud edition.
 *
 * Krisp only actually processes on a LiveKit **Cloud** server, so we guard on both browser support
 * AND room.serverInfo.edition === Cloud. A 2s watchdog re-enables Krisp whenever a mic device-switch
 * / AdaptiveQuality track-restart silently disables it (attached-but-bypassed — emits no error).
 * Filter state is broadcast via DfnStateService so remote tiles badge the active filter.
 *
 * IMPORTANT: Krisp only works on a route WITHOUT COOP/COEP headers — under COEP `credentialless`
 * Krisp loads an opaque model/worker response and becomes a silent pass-through. See firebase.json
 * (/livekit-cloud-room has no COEP) and the coi-serviceworker opt-out.
 */
type FilterMode = 'off' | 'native' | 'dfn' | 'krisp';
const DFN_PROCESSOR_NAME = 'deepfilternet3-noise-filter';
const KRISP_PROCESSOR_NAME = 'livekit-noise-filter';
const CLOUD_EDITION = 1; // ServerInfo_Edition.Cloud
// DFN assets are self-hosted same-origin (immune to CORS/COEP) — same path the /joinlivekit flow uses.
const DFN_CDN_URL = '/assets/df3';

const CAPTURE_CONSTRAINTS: Record<FilterMode, any> = {
  // Off: fully raw mic. Native: Chrome's full DSP. DFN: Chrome defaults on, voiceIsolation off so we
  // don't double-process. Krisp: browser NS + voiceIsolation off so Krisp denoises (keep AEC + AGC).
  // Chrome ignores applyConstraints() for these on a live track, so we re-acquire via restartTrack().
  off:    { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false },
  native: { echoCancellation: true,  noiseSuppression: true,  autoGainControl: true,  voiceIsolation: true },
  dfn:    { echoCancellation: true,  noiseSuppression: true,  autoGainControl: true,  voiceIsolation: false },
  krisp:  { echoCancellation: true,  noiseSuppression: false, autoGainControl: true,  voiceIsolation: false },
};

@Component({
  selector: 'app-krisp-controls',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="krisp-controls" role="radiogroup" aria-label="Noise filter">
      <span class="krisp-label">Filter:</span>
      <button *ngFor="let m of modes"
              class="krisp-btn" [class.active]="mode === m"
              [attr.aria-pressed]="mode === m" [disabled]="pending"
              (click)="setMode(m)">{{ labels[m] }}</button>

      <span *ngIf="mode === 'krisp' && status" class="krisp-status"
            [class.ok]="status === 'Krisp active ✓'">{{ status }}</span>

      <!-- DFN tuning group — visible only while DFN is the selected filter -->
      <div *ngIf="mode === 'dfn'" class="dfn-tuning">
        <label class="dfn-row">
          Attenuation
          <input type="range" min="0" max="100" [value]="dfnAtten"
                 (input)="onAtten($any($event.target).value)" style="width:120px">
          <b class="dfn-num" style="width:28px">{{ dfnAtten }}</b>
        </label>

        <label class="dfn-row dfn-check">
          <input type="checkbox" [checked]="dfnNormOn" (change)="toggleNorm($any($event.target).checked)">
          Normalize
        </label>
        <label class="dfn-row" [style.opacity]="dfnNormOn ? 1 : 0.4">
          <input type="range" min="1" max="2.5" step="0.1" [value]="dfnNorm" [disabled]="!dfnNormOn"
                 (input)="onNorm($any($event.target).value)" style="width:110px">
          <b class="dfn-num" style="width:40px">{{ dfnNormOn ? (dfnNorm.toFixed(1) + '×') : 'off' }}</b>
        </label>

        <label class="dfn-row dfn-check" title="Suppresses background voices in your silences & word-gaps">
          <input type="checkbox" [checked]="dfnGateOn" (change)="toggleGate($any($event.target).checked)">
          Gate
        </label>
        <label class="dfn-row" [style.opacity]="dfnGateOn ? 1 : 0.4">
          <input type="range" min="-70" max="-25" step="1" [value]="dfnGateDb" [disabled]="!dfnGateOn"
                 (input)="onGateDb($any($event.target).value)" style="width:110px">
          <b class="dfn-num" style="width:52px">{{ dfnGateOn ? (dfnGateDb + ' dB') : 'off' }}</b>
        </label>
      </div>
    </div>
  `,
  styles: [`
    .krisp-controls { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font:13px system-ui; }
    .krisp-label { opacity:.8; margin-right:2px; }
    .krisp-btn { padding:6px 12px; border-radius:8px; border:1px solid #555; background:#3a3a3a;
                 color:#fff; cursor:pointer; font-weight:500; }
    .krisp-btn.active { border-color:#6c8; background:#1f9d55; font-weight:700; }
    .krisp-btn:disabled { opacity:.6; cursor:default; }
    .krisp-status { color:#ffcf6b; max-width:320px; }
    .krisp-status.ok { color:#7CFC98; }
    .dfn-tuning { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
    .dfn-row { display:flex; align-items:center; gap:8px; }
    .dfn-check { gap:6px; cursor:pointer; }
    .dfn-num { text-align:right; font-variant-numeric:tabular-nums; }
  `],
})
export class KrispControlsComponent implements OnChanges, OnDestroy {
  /** The live LiveKit Room (passed from the parent as [room]="room()"). */
  @Input() room: Room | undefined;

  modes: FilterMode[] = ['off', 'native', 'dfn', 'krisp'];
  labels: Record<FilterMode, string> = { off: 'Off', native: 'Native', dfn: 'DFN', krisp: 'Krisp' };
  mode: FilterMode = 'krisp';   // Krisp on by default — the whole point of the Cloud route
  status: string | null = null;
  pending = false;

  // DFN tuning state (mirrors the reference DfnControls defaults; sliders live in DFN mode only)
  dfnAtten = 80;        // attenuation / noiseReductionLevel (0–100)
  dfnNorm = 1.2;        // makeup gain when Normalize is on (1.0–2.5)
  dfnNormOn = true;
  dfnGateOn = true;
  dfnGateDb = -45;      // post-DFN gate threshold (−70…−25 dB)
  private dfnProc: DeepFilterNoiseFilterProcessor | null = null;
  /** Effective makeup gain: unity (1.0) when Normalize is toggled off. */
  private get dfnEffNorm(): number { return this.dfnNormOn ? this.dfnNorm : 1.0; }

  private watchdog: any = null;
  private boundRoom: Room | undefined;
  private onLocalPublished = (pub: LocalTrackPublication) => {
    if (pub.source === Track.Source.Microphone) this.apply(this.mode);
  };

  constructor(private dfnState: DfnStateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['room'] || this.room === this.boundRoom) return;
    if (this.boundRoom) this.boundRoom.off(RoomEvent.LocalTrackPublished, this.onLocalPublished as any);
    this.stopWatchdog();
    this.boundRoom = this.room;
    if (this.room) {
      this.room.on(RoomEvent.LocalTrackPublished, this.onLocalPublished as any);
      if (this.micTrack()) this.apply(this.mode); // mic already up (rejoin)
      this.startWatchdog();
    }
  }

  ngOnDestroy(): void {
    this.stopWatchdog();
    if (this.boundRoom) this.boundRoom.off(RoomEvent.LocalTrackPublished, this.onLocalPublished as any);
    const mic = this.micTrack();
    try { if (mic?.getProcessor()) mic.stopProcessor(); } catch (_) {}
    this.dfnProc = null;
  }

  private micTrack(): LocalAudioTrack | undefined {
    const pubs = this.room?.localParticipant?.audioTrackPublications;
    const pub = pubs ? [...pubs.values()].find(p => p.source === Track.Source.Microphone) : undefined;
    return pub?.track as LocalAudioTrack | undefined;
  }

  async setMode(m: FilterMode): Promise<void> {
    this.mode = m;
    await this.apply(m);
  }

  private async apply(mode: FilterMode): Promise<void> {
    const mic = this.micTrack();
    if (!mic) return;
    this.pending = true;
    this.status = null;
    try {
      // 1) Detach a processor that doesn't belong to this mode (one processor per track).
      const current: any = mic.getProcessor();
      const wanted = mode === 'dfn' ? DFN_PROCESSOR_NAME : mode === 'krisp' ? KRISP_PROCESSOR_NAME : null;
      if (current && current.name !== wanted) {
        if (current.name === DFN_PROCESSOR_NAME) this.dfnProc = null;
        await mic.stopProcessor();
      }

      // 2) Apply this mode's capture constraints (via restartTrack when they actually differ).
      await this.applyConstraints(mic, CAPTURE_CONSTRAINTS[mode]);

      // 3) Attach the processor this mode wants (if not already attached).
      if (mode === 'dfn') {
        if ((mic.getProcessor() as any)?.name !== DFN_PROCESSOR_NAME) {
          if (!DeepFilterNoiseFilterProcessor.isSupported()) {
            this.status = 'DFN not supported in this browser.';
          } else {
            // DFN needs a 48 kHz clock domain — force the mic onto a 48k AudioContext first.
            try {
              const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
              const t = mic as any;
              if (AC && typeof t.setAudioContext === 'function' && t.audioContext?.sampleRate !== 48000) {
                t.setAudioContext(new AC({ sampleRate: 48000 }));
              }
            } catch (_) {}
            const proc = new DeepFilterNoiseFilterProcessor({
              sampleRate: 48000,
              noiseReductionLevel: this.dfnAtten,
              enabled: true,
              makeupGain: this.dfnEffNorm,
              gateEnabled: this.dfnGateOn,
              gateThresholdDb: this.dfnGateDb,
              assetConfig: { cdnUrl: DFN_CDN_URL },
            } as any);
            this.dfnProc = proc;
            await mic.setProcessor(proc as any);
          }
        }
      } else if (mode === 'krisp') {
        if ((mic.getProcessor() as any)?.name !== KRISP_PROCESSOR_NAME) {
          const { KrispNoiseFilter, isKrispNoiseFilterSupported } = await import('@livekit/krisp-noise-filter');
          const isCloud = (this.room as any)?.serverInfo?.edition === CLOUD_EDITION;
          if (!isKrispNoiseFilterSupported()) {
            this.status = 'Krisp not supported in this browser (Chrome/Edge, or Safari ≥ 17.4).';
          } else if (!isCloud) {
            this.status = 'Krisp requires a LiveKit Cloud server — this call is not on Cloud.';
          } else {
            try {
              const krisp = KrispNoiseFilter({
                onBufferDrop: () => console.warn('[krisp] buffer drop (internal latency flush)'),
              }) as any;
              await mic.setProcessor(krisp);
              this.status = 'Krisp active ✓';
            } catch (e: any) {
              this.status = 'Krisp failed to attach: ' + (e?.message ?? e);
            }
          }
        }
      }
      // 'off' / 'native': no processor — detached in step 1, capture constraints set in step 2.
      this.broadcast();
    } catch (e: any) {
      console.error('Noise filter control error', e);
      this.status = 'Filter error: ' + (e?.message ?? e);
    } finally {
      this.pending = false;
    }
  }

  // ── DFN live-tuning: no-op when dfnProc is null (any non-DFN mode) ──────────
  onAtten(v: string | number): void {
    this.dfnAtten = Number(v);
    try { this.dfnProc?.setSuppressionLevel(this.dfnAtten); } catch (_) {}
    this.broadcast();
  }
  toggleNorm(on: boolean): void {
    this.dfnNormOn = on;
    try { this.dfnProc?.setMakeupGain(this.dfnEffNorm); } catch (_) {}
    this.broadcast();
  }
  onNorm(v: string | number): void {
    this.dfnNorm = Number(v);
    try { this.dfnProc?.setMakeupGain(this.dfnEffNorm); } catch (_) {}
    this.broadcast();
  }
  toggleGate(on: boolean): void {
    this.dfnGateOn = on;
    try { this.dfnProc?.setGateEnabled(on); } catch (_) {}
  }
  onGateDb(v: string | number): void {
    this.dfnGateDb = Number(v);
    try { this.dfnProc?.setGateThreshold(this.dfnGateDb); } catch (_) {}
  }

  private async applyConstraints(mic: LocalAudioTrack, spec: any): Promise<void> {
    try {
      const s: any = mic.mediaStreamTrack?.getSettings?.() ?? {};
      const keys = ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'voiceIsolation'];
      const differs = keys.some(k => s[k] !== undefined && s[k] !== spec[k]);
      if (differs) await mic.restartTrack({ deviceId: s.deviceId, ...spec } as any);
    } catch (e) {
      console.warn('Noise filter capture restart failed', e);
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      if (this.mode !== 'krisp') return;
      const p: any = this.micTrack()?.getProcessor();
      if (p?.name === KRISP_PROCESSOR_NAME && p.isEnabled?.() === false) {
        console.warn('[krisp] watchdog: processor found disabled (device switch?) — re-enabling');
        p.setEnabled?.(true).catch(() => {});
      }
    }, 2000);
  }

  private stopWatchdog(): void {
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
  }

  /** Broadcast filter state so remote tiles can badge it (reuses DfnState data messages). */
  private broadcast(): void {
    const room = this.room;
    if (!room) return;
    const id = room.localParticipant?.identity;
    if (!id) return;
    // Badge the active filter: DFN carries its atten/norm; Krisp shows active with neutral values.
    let info: { dfn: boolean; atten: number; norm: number };
    if (this.mode === 'dfn') {
      info = { dfn: true, atten: this.dfnAtten, norm: this.dfnEffNorm };
    } else if (this.mode === 'krisp' && this.status === 'Krisp active ✓') {
      info = { dfn: true, atten: 0, norm: 1 };
    } else {
      info = { dfn: false, atten: 0, norm: 1 };
    }
    this.dfnState.update(id, info as any);
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'dfn', ...info })),
        { reliable: true },
      );
    } catch (_) {}
  }
}
