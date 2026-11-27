import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { detectBrowser, popupHelp } from './browser-info';

// e2e hook prefix: ctb (call-tab-blocked). Plan 2026-11-27-join-ready-check, item 1b/1c.
@Component({
  selector: 'app-call-tab-blocked-dialog',
  template: `
    <div class="ctb" data-testid="ctb-dialog">
      <h3 class="ctb-title">Your browser blocked the meeting window</h3>
      <p class="ctb-text">Click the button below to open your meeting.</p>
      <button class="ctb-open" data-testid="ctb-open-btn" (click)="openMeeting()">Open meeting</button>
      <div class="ctb-help" data-testid="ctb-help">
        <div class="ctb-help-title">So this doesn't happen next time</div>
        <div>{{ help }}</div>
      </div>
      <button class="ctb-close" data-testid="ctb-close-btn" (click)="ref.close()">Cancel</button>
    </div>
  `,
  styles: [`
    .ctb { padding: 24px; max-width: 420px; font-family: inherit; text-align: center; }
    .ctb-title { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
    .ctb-text { margin: 0 0 16px; color: #555; }
    .ctb-open { width: 100%; padding: 12px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
    .ctb-help { margin-top: 16px; padding: 12px; border-radius: 8px; background: #f3f4f6; font-size: 13px; text-align: left; color: #374151; }
    .ctb-help-title { font-weight: 600; margin-bottom: 4px; }
    .ctb-close { margin-top: 12px; border: 0; background: none; color: #6b7280; cursor: pointer; }
  `]
})
export class CallTabBlockedDialogComponent {
  help = popupHelp(detectBrowser().browser);

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { url: string },
    public ref: MatDialogRef<CallTabBlockedDialogComponent>
  ) {}

  /** A fresh click — browsers always allow a new tab here. Same tab as the last resort. */
  openMeeting(): void {
    const win = window.open(this.data.url, '_blank');
    if (!win) window.location.href = this.data.url;
    this.ref.close();
  }
}
