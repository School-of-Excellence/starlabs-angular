import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

import { HealthState } from './health-score.engine';

export interface SetHealthStateResult {
  state: HealthState;
  note: string;
}

/**
 * Small dialog a coach fills to set a participant's coach-assessed Health State
 * (Happy / Neutral / Sad / Evangelist) plus an optional note. Pre-selects the
 * participant's current coach-set state if one is passed in via dialog data.
 * This is a manual assessment, separate from customerstatus (lifecycle).
 */
@Component({
  selector: 'app-set-health-state-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Set health state — {{ data.name }}</h2>
    <mat-dialog-content class="shs-content">
      <mat-form-field appearance="outline" class="shs-full">
        <mat-label>Health state</mat-label>
        <mat-select [(ngModel)]="state">
          <mat-option value="HAPPY">Happy</mat-option>
          <mat-option value="NEUTRAL">Neutral</mat-option>
          <mat-option value="SAD">Sad</mat-option>
          <mat-option value="EVANGELIST">Evangelist</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="shs-full">
        <mat-label>Note (optional)</mat-label>
        <textarea matInput rows="3" [(ngModel)]="note" placeholder="Why this assessment / context"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Cancel</button>
      <button mat-flat-button color="primary" (click)="save()">Save state</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .shs-content { display: flex; flex-direction: column; padding-top: 6px; min-width: 360px; }
    .shs-full { width: 100%; }
  `],
})
export class SetHealthStateDialogComponent {
  state: HealthState = 'NEUTRAL';
  note = '';

  constructor(
    private ref: MatDialogRef<SetHealthStateDialogComponent, SetHealthStateResult>,
    @Inject(MAT_DIALOG_DATA) public data: { name: string; current?: HealthState | null },
  ) {
    if (data.current) this.state = data.current;
  }

  close(): void { this.ref.close(); }
  save(): void {
    this.ref.close({ state: this.state, note: this.note.trim() });
  }
}
