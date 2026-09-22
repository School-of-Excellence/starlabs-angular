import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface AhFlagListEntry {
  profileid: string;   // '' when the source doc has no profileid (rendered non-clickable)
  name: string;
  created: number;     // ms epoch (0 when unknown); rows are pre-sorted newest-first by the caller
}

export interface AhFlagListData {
  title: string;       // e.g. "Love Letter · Needs Attention"
  entries: AhFlagListEntry[];
}

/** Drill-down list behind one Ask A&H / Love Letter flag count. Each row opens that participant's
 *  slide-over (the dialog closes with the chosen profileid; the dashboard opens the slide-over).
 *  Rows are one-per-source-document so the list length reconciles with the clicked cell's count. */
@Component({
  selector: 'app-ah-flag-list-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title class="afl-title">
      {{ data.title }}
      <span class="afl-count">{{ data.entries.length }}</span>
    </h2>
    <mat-dialog-content class="afl-content">
      <p *ngIf="!data.entries.length" class="afl-empty">No records in this window.</p>
      <button *ngFor="let e of data.entries" type="button" class="afl-row"
              [disabled]="!e.profileid" (click)="pick(e)">
        <span class="afl-name">{{ e.name }}</span>
        <span class="afl-date" *ngIf="e.created">{{ e.created | date:'d MMM y' }}</span>
        <mat-icon class="afl-chev" *ngIf="e.profileid">chevron_right</mat-icon>
      </button>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .afl-title { display: flex; align-items: center; gap: 10px; font-size: 16px; }
    .afl-count { font-size: 12px; font-weight: 600; color: #6b7280; background: #f1f3f5;
      border-radius: 999px; padding: 2px 9px; }
    .afl-content { display: flex; flex-direction: column; gap: 2px; padding-top: 6px;
      min-width: 340px; max-height: 60vh; }
    .afl-empty { color: #6b7280; font-size: 13px; padding: 12px 4px; }
    .afl-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
      border: none; background: none; font: inherit; cursor: pointer; padding: 9px 8px;
      border-radius: 9px; transition: background .12s ease; }
    .afl-row:hover:not([disabled]) { background: #f5f7fa; }
    .afl-row[disabled] { cursor: default; opacity: .55; }
    .afl-name { flex: 1 1 auto; font-size: 13.5px; color: #1f2430; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; }
    .afl-date { font-size: 12px; color: #8a93a2; font-variant-numeric: tabular-nums; }
    .afl-chev { color: #b6bdc8; font-size: 18px; width: 18px; height: 18px; }
  `],
})
export class AhFlagListDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<AhFlagListDialogComponent, string>,
    @Inject(MAT_DIALOG_DATA) public data: AhFlagListData,
  ) {}

  pick(e: AhFlagListEntry): void {
    if (e.profileid) this.dialogRef.close(e.profileid);
  }
  close(): void { this.dialogRef.close(); }
}
