import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'failed';

@Component({
  selector: 'app-connectivity-alert',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="connectivity-alert">
      <mat-icon class="warn-icon" [class.offline]="offline()">
        {{ offline() ? 'wifi_off' : 'signal_wifi_bad' }}
      </mat-icon>
      <h2>{{ offline() ? 'No Internet Connection' : 'Poor Internet Connection' }}</h2>

      <div class="draft-status" [ngClass]="draftStatus()">
        <ng-container [ngSwitch]="draftStatus()">
          <ng-container *ngSwitchCase="'saving'">
            <mat-spinner diameter="22"></mat-spinner>
            <span>Saving your draft… please don't close this tab</span>
          </ng-container>
          <ng-container *ngSwitchCase="'saved'">
            <mat-icon class="ok">check_circle</mat-icon>
            <span>Draft saved successfully</span>
          </ng-container>
          <ng-container *ngSwitchCase="'failed'">
            <mat-icon class="err">error</mat-icon>
            <span>Draft save failed — will retry when connection returns</span>
          </ng-container>
          <ng-container *ngSwitchDefault>
            <mat-spinner diameter="22"></mat-spinner>
            <span>Preparing to save draft…</span>
          </ng-container>
        </ng-container>
      </div>

      <p *ngIf="draftStatus() === 'saved'" class="body">
        Please wait until connectivity is restored before continuing.
      </p>
      <p class="hint">Waiting for a stable connection…</p>
    </div>
  `,
  styles: [`
    .connectivity-alert { padding: 24px; text-align: center; max-width: 400px; }
    .warn-icon { font-size: 56px; width: 56px; height: 56px; color: #f59e0b; }
    .warn-icon.offline { color: #ef4444; }
    h2 { margin: 12px 0 8px; }
    .body { color: #555; margin: 8px 0; }
    .hint { font-size: 12px; color: #888; margin-top: 12px; }
    .draft-status {
      display: flex; align-items: center; gap: 10px; justify-content: center;
      padding: 10px 14px; border-radius: 8px; margin: 12px 0;
      font-size: 14px;
    }
    .draft-status.saving { background: #fff7e6; color: #8a5a00; }
    .draft-status.saved  { background: #e6f7ec; color: #186a3b; }
    .draft-status.failed { background: #fdecea; color: #8a1c1c; }
    .draft-status.idle   { background: #f1f3f5; color: #555; }
    .draft-status .ok  { color: #2e7d32; }
    .draft-status .err { color: #c62828; }
  `]
})
export class ConnectivityAlertComponent {
  offline = signal<boolean>(false);
  draftStatus = signal<DraftStatus>('idle');

  constructor(
    public dialogRef: MatDialogRef<ConnectivityAlertComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { offline: boolean; draftStatus?: DraftStatus }
  ) {
    this.offline.set(!!data.offline);
    this.draftStatus.set(data.draftStatus ?? 'idle');
  }

  setOffline(value: boolean) { this.offline.set(value); }
  setDraftStatus(status: DraftStatus) { this.draftStatus.set(status); }
}
