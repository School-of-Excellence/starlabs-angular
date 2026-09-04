import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

/**
 * Audio player for chat attachments.
 *
 * Written as its own component so every clip owns its state — the previous shared-key approach in the
 * parent made two clips fight over the same progress value.
 *
 * The awkward part is duration: a MediaRecorder webm (and some Storage URLs) reports
 * `duration === Infinity` until the file is seeked, which is what left the old player stuck at 0:00.
 * `resolveDuration()` applies the standard workaround — seek far past the end once, let the browser
 * settle on a real duration, then rewind.
 */
@Component({
  selector: 'app-chat-audio',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="ap">
      <audio #audio [src]="src" preload="metadata"
             (loadedmetadata)="onMeta()"
             (durationchange)="onMeta()"
             (timeupdate)="onTime()"
             (ended)="onEnded()"
             (play)="playing = true"
             (pause)="playing = false"></audio>

      <button class="ap-play" (click)="toggle()" [attr.aria-label]="playing ? 'Pause' : 'Play'">
        <mat-icon>{{ playing ? 'pause' : 'play_arrow' }}</mat-icon>
      </button>

      <div class="ap-body">
        <div class="ap-name" *ngIf="name">{{ name }}</div>
        <input class="ap-seek" type="range" min="0" [max]="duration || 0" step="0.01"
               [value]="current" [disabled]="!duration"
               (input)="seek($any($event.target).value)"/>
        <div class="ap-times">
          <span>{{ fmt(current) }}</span>
          <span>{{ duration ? fmt(duration) : '--:--' }}</span>
        </div>
      </div>

      <button class="ap-rate" (click)="cycleRate()" title="Playback speed">{{ rate }}×</button>
      <a class="ap-dl" *ngIf="download" [href]="src" [download]="name || ''" target="_blank" rel="noreferrer" title="Download">
        <mat-icon>download</mat-icon>
      </a>
    </div>
  `,
  styles: [`
    /* Tokens come from the host screen and inherit through the DOM, so this follows the theme. */
    .ap {
      display: flex; align-items: center; gap: 9px; min-width: 230px; max-width: 320px;
      padding: 7px 9px; border-radius: 12px;
      background: var(--sunken, #F4F6FA); border: 1px solid var(--line, rgba(60,60,67,.10));
      color: var(--ink, #14161A);
    }
    .ap-play {
      width: 32px; height: 32px; border-radius: 50%; border: none; flex-shrink: 0; cursor: pointer;
      background: var(--blue, #007AFF); color: var(--on-accent, #fff);
      display: flex; align-items: center; justify-content: center;
    }
    .ap-play mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .ap-body { flex: 1; min-width: 0; }
    .ap-name {
      font-size: 12px; font-weight: 600; margin-bottom: 2px; color: var(--ink, #14161A);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ap-seek { width: 100%; height: 4px; accent-color: var(--blue, #007AFF); cursor: pointer; margin: 3px 0 1px; }
    .ap-times { display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 600; color: var(--ink2, rgba(60,60,67,.62)); font-variant-numeric: tabular-nums; }
    .ap-rate {
      border: none; background: none; font-size: 11px; font-weight: 800; color: var(--ink2, rgba(60,60,67,.62));
      cursor: pointer; flex-shrink: 0; padding: 0 2px; min-width: 30px;
    }
    .ap-rate:hover { color: var(--blue-text, #0062CC); }
    .ap-dl { display: flex; color: var(--ink3, rgba(60,60,67,.48)); }
    .ap-dl:hover { color: var(--blue-text, #0062CC); }
    .ap-dl mat-icon { font-size: 15px; width: 15px; height: 15px; }
  `],
})
export class ChatAudioComponent implements AfterViewInit, OnDestroy {
  @Input() src = '';
  @Input() name?: string;
  /** Kept for compatibility; no bubble is dark in this design, so it no longer changes anything. */
  @Input() light = false;
  @Input() download = true;

  @ViewChild('audio') audioRef!: ElementRef<HTMLAudioElement>;

  playing = false;
  current = 0;
  duration = 0;
  rate = 1;
  private durationFixed = false;

  ngAfterViewInit(): void {
    const a = this.audioRef?.nativeElement;
    if (a) ChatAudioComponent.players.add(a);
  }

  ngOnDestroy(): void {
    const a = this.audioRef?.nativeElement;
    // Leaving a destroyed element in the set would keep it alive and let it be paused later.
    if (a) { ChatAudioComponent.players.delete(a); a.pause(); }
  }

  toggle(): void {
    const a = this.audioRef?.nativeElement;
    if (!a) return;
    if (this.playing) { a.pause(); return; }
    // Only one voice note plays at a time — starting this one stops whatever else was going.
    // Module-scoped rather than a service: every player on the screen is this component, and a
    // DI service would add a provider to wire up for behaviour that is purely local to them.
    ChatAudioComponent.stopOthers(a);
    a.play().catch(e => console.error('audio play failed', e));
  }

  /** Pause every other <audio> this component owns. */
  private static stopOthers(keep: HTMLAudioElement): void {
    ChatAudioComponent.players.forEach(el => {
      if (el !== keep && !el.paused) el.pause();
    });
  }

  private static players = new Set<HTMLAudioElement>();

  seek(value: string | number): void {
    const a = this.audioRef?.nativeElement;
    if (!a) return;
    a.currentTime = Number(value);
    this.current = a.currentTime;
  }

  cycleRate(): void {
    const steps = [0.5, 1, 1.5, 2];
    this.rate = steps[(steps.indexOf(this.rate) + 1) % steps.length];
    const a = this.audioRef?.nativeElement;
    if (a) a.playbackRate = this.rate;
  }

  onMeta(): void { this.resolveDuration(); }

  onTime(): void {
    const a = this.audioRef?.nativeElement;
    if (!a) return;
    this.current = a.currentTime;
    if (!this.duration) this.resolveDuration();
  }

  onEnded(): void { this.playing = false; this.current = 0; }

  /** Coax a real duration out of streamed/webm audio that first reports Infinity. */
  private resolveDuration(): void {
    const a = this.audioRef?.nativeElement;
    if (!a) return;
    if (Number.isFinite(a.duration) && a.duration > 0) { this.duration = a.duration; return; }
    if (this.durationFixed) return;
    this.durationFixed = true;
    const onSeeked = () => {
      if (Number.isFinite(a.duration)) this.duration = a.duration;
      a.currentTime = 0;
      a.removeEventListener('seeked', onSeeked);
    };
    a.addEventListener('seeked', onSeeked);
    try { a.currentTime = 1e101; } catch { /* some browsers refuse; duration just stays unknown */ }
  }

  fmt(sec: number): string {
    const s = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
