import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface RemarksData {
  count: number;
}

@Component({
  selector: 'app-remarks-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">sticky_note_2</span></span>
        <div>
          <h2>Add remark</h2>
          <p>Applies to {{ data.count }} selected participant{{ data.count === 1 ? '' : 's' }}.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="dlg-body">
        <div class="dlg-field">
          <label class="dlg-label">Remark</label>
          <textarea class="dlg-textarea" [(ngModel)]="note" placeholder="Write a note that will be added to each participant's timeline…" autofocus></textarea>
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="note.trim().length < 2" (click)="ref.close(note.trim())">
          <span class="material-symbols-rounded">check</span> Add to {{ data.count }}
        </button>
      </div>
    </div>
  `,
})
export class RemarksDialogComponent {
  readonly ref = inject(MatDialogRef<RemarksDialogComponent>);
  readonly data = inject<RemarksData>(MAT_DIALOG_DATA);
  note = '';
}
