import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface TranscriptDialogData {
  participant: string;
  laId: string;
  /** Loader is injected so the dialog holds no Firestore dependency of its own. */
  load: () => Promise<{
    transcript_text: string;
    coach?: string;
    confidence?: string;
    audio_sec?: number | null;
    capturedAt?: Date | null;
    dropboxlink?: string;
  } | null>;
}

/**
 * Read-only viewer for a captured studio transcript.
 *
 * Shows the diarized prose plus the speaker-assignment CONFIDENCE, which is the
 * point of having a viewer at all: assignSpeakers() falls back to
 * "first speaker is the coach" when nothing discriminates, and that fallback has
 * historically swapped coach and participant. A low-confidence transcript is
 * exactly the one an operator should eyeball before the ATC is generated from it.
 */
@Component({
  selector: 'app-transcript-viewer',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule,
            MatProgressSpinnerModule, MatTooltipModule],
  template: `
    <h2 mat-dialog-title class="tv-title">
      <mat-icon>record_voice_over</mat-icon>
      {{ data.participant }}
      <span class="tv-sub">transcript</span>
    </h2>

    <mat-dialog-content class="tv-body">
      <div class="tv-loading" *ngIf="loading">
        <mat-spinner diameter="28"></mat-spinner>
      </div>

      <div class="tv-error" *ngIf="!loading && error">
        <mat-icon>error_outline</mat-icon> {{ error }}
      </div>

      <ng-container *ngIf="!loading && !error">
        <div class="tv-meta">
          <span class="tv-chip" [class.tv-low]="isLowConfidence"
                [matTooltip]="isLowConfidence
                  ? 'Speaker roles were guessed by the first-speaker fallback — check that Coach and participant are not swapped'
                  : 'Speaker roles were decided from name-address and facilitator phrasing'">
            <mat-icon>{{ isLowConfidence ? 'warning' : 'verified' }}</mat-icon>
            speakers: {{ confidence || 'unknown' }}
          </span>
          <span class="tv-chip" *ngIf="audioSec">{{ (audioSec / 60) | number:'1.0-0' }} min</span>
          <span class="tv-chip" *ngIf="chars">{{ chars | number }} chars</span>
          <span class="tv-chip" *ngIf="capturedAt">{{ capturedAt | date:'medium' }}</span>
          <a class="tv-chip tv-link" *ngIf="dropboxlink" [href]="dropboxlink" target="_blank">
            <mat-icon>open_in_new</mat-icon> recording
          </a>
        </div>

        <div class="tv-warn" *ngIf="isLowConfidence">
          <mat-icon>warning</mat-icon>
          Speaker roles fell back to "first speaker is the coach". Verify the labels below
          before this transcript is used to generate an ATC.
        </div>

        <pre class="tv-text">{{ text }}</pre>
      </ng-container>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="copy()" [disabled]="!text">
        <mat-icon>content_copy</mat-icon> Copy
      </button>
      <button mat-flat-button color="primary" mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .tv-title { display: flex; align-items: center; gap: 8px; }
    .tv-sub { font-size: 12px; color: #9aa0ac; font-weight: 400; }
    .tv-body { min-width: min(760px, 88vw); max-height: 68vh; }
    .tv-loading { display: flex; justify-content: center; padding: 40px 0; }
    .tv-error { display: flex; align-items: center; gap: 8px; color: #b3261e; padding: 20px 0; }
    .tv-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .tv-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: #eef1f7; color: #48505f; border-radius: 12px;
      padding: 3px 10px; font-size: 11.5px; text-decoration: none;
    }
    .tv-chip mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .tv-chip.tv-low { background: #fff3e0; color: #e65100; }
    .tv-link { color: #3f51b5; }
    .tv-warn {
      display: flex; align-items: flex-start; gap: 8px;
      background: #fff8e1; color: #8a6100; border-radius: 6px;
      padding: 8px 12px; font-size: 12px; margin-bottom: 10px;
    }
    .tv-warn mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .tv-text {
      white-space: pre-wrap; word-break: break-word;
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 12.5px; line-height: 1.55; color: #2b3140;
      background: #fafbfd; border: 1px solid #eceff3; border-radius: 6px;
      padding: 12px; margin: 0;
    }
  `],
})
export class TranscriptViewerDialog {
  loading = true;
  error: string | null = null;
  text = '';
  confidence = '';
  audioSec: number | null = null;
  capturedAt: Date | null = null;
  dropboxlink = '';

  constructor(
    public dialogRef: MatDialogRef<TranscriptViewerDialog>,
    @Inject(MAT_DIALOG_DATA) public data: TranscriptDialogData,
  ) {
    this.data.load()
      .then((d) => {
        if (!d) { this.error = 'Live assignment not found.'; return; }
        this.text = d.transcript_text ?? '';
        this.confidence = d.confidence ?? '';
        this.audioSec = d.audio_sec ?? null;
        this.capturedAt = d.capturedAt ?? null;
        this.dropboxlink = d.dropboxlink ?? '';
        if (!this.text.trim()) this.error = 'No transcript on this session yet.';
      })
      .catch((e) => { this.error = e?.message ?? 'Failed to load transcript'; })
      .finally(() => { this.loading = false; });
  }

  get chars(): number { return this.text.length; }

  /** "low(first-speaker fallback)" / "single-speaker" / "no-speakers" are all suspect. */
  get isLowConfidence(): boolean {
    return /^low|single-speaker|no-speakers/i.test(this.confidence || '');
  }

  copy(): void { void navigator.clipboard?.writeText(this.text); }
}
