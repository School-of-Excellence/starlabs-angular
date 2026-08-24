import { Component, ElementRef, Input, ViewChild } from '@angular/core';
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
    <div class="ap" [class.light]="light">
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
    .ap {
      display: flex; align-items: center; gap: 9px; min-width: 230px; max-width: 320px;
      padding: 7px 9px; border-radius: 10px; background: #F4F5F7; border: 1px solid #E5E7EB;
    }
    .ap.light { background: rgba(255,255,255,0.16); border-color: rgba(255,255,255,0.28); color: white; }
    .ap-play {
      width: 32px; height: 32px; border-radius: 50%; border: none; flex-shrink: 0; cursor: pointer;
      background: #7C3AED; color: white; display: flex; align-items: center; justify-content: center;
    }
    .ap.light .ap-play { background: white; color: #7C3AED; }
    .ap-play mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .ap-body { flex: 1; min-width: 0; }
    .ap-name {
      font-size: 11px; font-weight: 600; margin-bottom: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ap-seek { width: 100%; height: 4px; accent-color: #7C3AED; cursor: pointer; margin: 3px 0 1px; }
    .ap.light .ap-seek { accent-color: white; }
    .ap-times { display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 600; opacity: 0.7; }
    .ap-rate {
      border: none; background: none; font-size: 10.5px; font-weight: 800; color: inherit;
      opacity: 0.75; cursor: pointer; flex-shrink: 0; padding: 0 2px;
    }
    .ap-dl { display: flex; color: inherit; opacity: 0.7; }
    .ap-dl mat-icon { font-size: 15px; width: 15px; height: 15px; }
  `],
})
export class ChatAudioComponent {
  @Input() src = '';
  @Input() name?: string;
  /** Renders for a dark (own-message) bubble. */
  @Input() light = false;
  @Input() download = true;

  @ViewChild('audio') audioRef!: ElementRef<HTMLAudioElement>;

  playing = false;
  current = 0;
  duration = 0;
  rate = 1;
  private durationFixed = false;

  toggle(): void {
    const a = this.audioRef?.nativeElement;
    if (!a) return;
    if (this.playing) a.pause();
    else a.play().catch(e => console.error('audio play failed', e));
  }

  seek(value: string | number): void {
    const a = this.audioRef?.nativeElement;
    if (!a) return;
    a.currentTime = Number(value);
    this.current = a.currentTime;
  }

  cycleRate(): void {
    const steps = [1, 1.5, 2];
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
