import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

export interface LogCallResult {
  outcome: 'reached' | 'noanswer' | 'scheduled' | 'other';
  note: string;
  nextActionDate: Date | null;
}

/** Small dialog a coach fills after a call: outcome + note + optional next-action date. */
@Component({
  selector: 'app-log-call-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatNativeDateModule,
  ],
  template: `
    <h2 mat-dialog-title>Log call — {{ data.name }}</h2>
    <mat-dialog-content class="lc-content">
      <mat-form-field appearance="outline" class="lc-full">
        <mat-label>Outcome</mat-label>
        <mat-select [(ngModel)]="outcome">
          <mat-option value="reached">Reached</mat-option>
          <mat-option value="noanswer">No answer</mat-option>
          <mat-option value="scheduled">Scheduled</mat-option>
          <mat-option value="other">Other</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="lc-full">
        <mat-label>Note</mat-label>
        <textarea matInput rows="3" [(ngModel)]="note" placeholder="What was discussed / agreed"></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline" class="lc-full">
        <mat-label>Next action date (optional)</mat-label>
        <input matInput [matDatepicker]="picker" [(ngModel)]="nextActionDate" />
        <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
        <mat-datepicker #picker></mat-datepicker>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Cancel</button>
      <button mat-flat-button color="primary" (click)="save()">Log call</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .lc-content { display: flex; flex-direction: column; padding-top: 6px; min-width: 360px; }
    .lc-full { width: 100%; }
  `],
})
export class LogCallDialogComponent {
  outcome: LogCallResult['outcome'] = 'reached';
  note = '';
  nextActionDate: Date | null = null;

  constructor(
    private ref: MatDialogRef<LogCallDialogComponent, LogCallResult>,
    @Inject(MAT_DIALOG_DATA) public data: { name: string },
  ) {}

  close(): void { this.ref.close(); }
  save(): void {
    this.ref.close({ outcome: this.outcome, note: this.note.trim(), nextActionDate: this.nextActionDate });
  }
}
