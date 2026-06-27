import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

// the two divergent versions to choose between; both are preserved regardless of the choice
export interface DraftConflictData {
  mine: any;     // this device's unsynced version
  theirs: any;   // the version another device saved to the server
}

/**
 * Shown only on a TRUE two-device divergence (both sides edited the same draft from a different base).
 * Whatever the user rejects is archived to `…/{docId}/conflicts/{rev}` by ATCDraftService — never lost.
 * Edit times are HINTS, not the deciding factor; the user decides.
 */
@Component({
  selector: 'app-draft-conflict-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>This draft was edited in two places</h2>
    <mat-dialog-content>
      <p class="intro">
        You have unsynced changes on this device, and a newer version was also saved elsewhere.
        Choose which one to keep — the other is archived and can be recovered, nothing is deleted.
      </p>
      <div class="cards">
        <div class="card">
          <div class="tag">This device</div>
          <ul>
            <li *ngFor="let row of summarize(data.mine)">{{ row }}</li>
          </ul>
        </div>
        <div class="card">
          <div class="tag">Other device</div>
          <ul>
            <li *ngFor="let row of summarize(data.theirs)">{{ row }}</li>
          </ul>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="choose('theirs')">Keep other device's</button>
      <button mat-flat-button color="primary" (click)="choose('mine')">Keep this device's</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .intro { margin: 0 0 16px; color: rgba(0,0,0,.7); }
    .cards { display: flex; gap: 16px; flex-wrap: wrap; }
    .card { flex: 1 1 220px; border: 1px solid rgba(0,0,0,.12); border-radius: 8px; padding: 12px 14px; }
    .tag { font-weight: 600; margin-bottom: 8px; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 2px 0; font-size: 13px; }
  `]
})
export class DraftConflictDialogComponent {
  constructor(
    private ref: MatDialogRef<DraftConflictDialogComponent, 'mine' | 'theirs'>,
    @Inject(MAT_DIALOG_DATA) public data: DraftConflictData
  ) {
    this.ref.disableClose = true;  // force an explicit choice so neither side is lost by an accidental dismiss
  }

  choose(which: 'mine' | 'theirs'): void {
    this.ref.close(which);
  }

  // a defensive, shape-agnostic summary that works for both Prescribe and Edit draft documents
  summarize(d: any): string[] {
    if (!d) return ['(empty)'];
    const rows: string[] = [];
    const directive = d.atcdirective ?? d.directive;
    if (directive) rows.push(`Directive: ${this.truncate(String(directive))}`);
    const adjustments = Array.isArray(d.transcript) ? d.transcript.length : null;
    if (adjustments !== null) rows.push(`${adjustments} adjustment${adjustments === 1 ? '' : 's'}`);
    if (d.notes) rows.push('Has case notes');
    if (d.consultationsummary) rows.push('Has consultation summary');
    const when = this.asDate(d.lastupdated ?? d.serverUpdatedAt);
    if (when) rows.push(`Last edited: ${when.toLocaleString()}`);
    return rows.length ? rows : ['(no summary available)'];
  }

  private truncate(s: string): string { return s.length > 60 ? s.slice(0, 57) + '…' : s; }

  private asDate(v: any): Date | null {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
}
