import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface SubscriptionResult {
  newEndIso: string;
  reason: string;
}

@Component({
  selector: 'app-subscription-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">event_repeat</span></span>
        <div>
          <h2>Extend subscription</h2>
          <p>{{ data.count }} participant{{ data.count === 1 ? '' : 's' }} selected.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <div class="dlg-field">
          <label class="dlg-label">Extend by</label>
          <div class="seg">
            <button [class.on]="mode() === 'duration'" (click)="mode.set('duration')">Duration</button>
            <button [class.on]="mode() === 'date'" (click)="mode.set('date')">Fixed date</button>
          </div>
        </div>

        @if (mode() === 'duration') {
          <div class="dlg-field">
            <label class="dlg-label">Months to add</label>
            <input class="dlg-input" type="number" min="1" [(ngModel)]="months" />
          </div>
        } @else {
          <div class="dlg-field">
            <label class="dlg-label">New end date</label>
            <input class="dlg-input" type="date" [(ngModel)]="date" />
          </div>
        }

        <div class="dlg-field">
          <label class="dlg-label">Reason</label>
          <input class="dlg-input" [(ngModel)]="reason" placeholder="e.g. goodwill extension, payment delay" />
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!valid()" (click)="confirm()">
          <span class="material-symbols-rounded">check</span> Extend {{ data.count }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .seg {
        display: inline-flex;
        border: 1px solid var(--pi-border-strong);
        border-radius: 9px;
        overflow: hidden;
      }
      .seg button {
        border: none;
        background: #fff;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        color: var(--pi-text-2);
        padding: 9px 18px;
        cursor: pointer;
      }
      .seg button.on {
        background: var(--pi-accent);
        color: #fff;
      }
    `,
  ],
})
export class SubscriptionDialogComponent {
  readonly ref = inject(MatDialogRef<SubscriptionDialogComponent>);
  readonly data = inject<{ count: number }>(MAT_DIALOG_DATA);

  readonly mode = signal<'duration' | 'date'>('duration');
  months = 3;
  date = '';
  reason = '';

  valid(): boolean {
    if (this.reason.trim().length < 2) return false;
    return this.mode() === 'duration' ? this.months > 0 : !!this.date;
  }

  confirm(): void {
    let newEnd: Date;
    if (this.mode() === 'duration') {
      newEnd = new Date(Date.UTC(2026, 5, 16));
      newEnd.setMonth(newEnd.getMonth() + Number(this.months));
    } else {
      newEnd = new Date(this.date);
    }
    this.ref.close({ newEndIso: newEnd.toISOString(), reason: this.reason.trim() } as SubscriptionResult);
  }
}
