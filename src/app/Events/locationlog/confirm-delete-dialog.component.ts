/**
 * Confirmation for deleting location logs.
 *
 * Deletion here is permanent — there is no recycle bin in Firestore and no undo
 * in this dashboard. So the dialog states the exact count, names the affected
 * participants, and puts the destructive action behind a warn-coloured button
 * that is not the default focus. Cancel is the easy path on purpose.
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDeleteData {
  /** How many log documents will be removed. */
  readonly count: number;
  /** Distinct participant names involved, for the summary line. */
  readonly participants: readonly string[];
}

@Component({
  selector: 'app-confirm-delete-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="cdd-title">
      <mat-icon color="warn">delete_forever</mat-icon>
      Delete {{ data.count }} log{{ data.count === 1 ? '' : 's' }}?
    </h2>

    <mat-dialog-content>
      <p class="cdd-lead">
        This permanently removes {{ data.count === 1 ? 'this location report' : 'these location reports' }}
        from Firestore. It cannot be undone.
      </p>

      @if (data.participants.length > 0) {
        <p class="cdd-participants">
          <span class="cdd-label">Affects</span>
          {{ data.participants.join(', ') }}
        </p>
      }

      <p class="cdd-note">
        Deleting a participant's most recent report will change what the Live
        Tracking tab shows for them.
      </p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button cdkFocusInitial (click)="dialogRef.close(false)">Cancel</button>
      <button mat-flat-button color="warn" (click)="dialogRef.close(true)">
        <mat-icon>delete_forever</mat-icon>
        Delete permanently
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .cdd-title {
        display: flex;
        align-items: center;
        gap: 9px;
      }

      .cdd-lead {
        margin: 0 0 12px;
        color: #334155;
      }

      .cdd-participants {
        margin: 0 0 12px;
        padding: 10px 13px;
        border-radius: 10px;
        background: #f8fafc;
        border: 1px solid #e6eaf2;
        font-size: 0.87rem;
        color: #0f172a;
      }

      .cdd-label {
        display: block;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 3px;
      }

      .cdd-note {
        margin: 0;
        font-size: 0.8rem;
        color: #64748b;
      }

      mat-dialog-actions button mat-icon {
        margin-right: 5px;
      }
    `,
  ],
})
export class ConfirmDeleteDialogComponent {
  constructor(
    readonly dialogRef: MatDialogRef<ConfirmDeleteDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) readonly data: ConfirmDeleteData,
  ) {}
}
