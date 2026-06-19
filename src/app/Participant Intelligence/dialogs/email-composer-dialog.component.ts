import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface ComposerResult {
  action: 'send' | 'queue';
  subject: string;
  channel: 'email' | 'whatsapp';
}

const TEMPLATES = ['Renewal reminder', 'Welcome series', 'Event invitation', 'Win-back offer', 'Custom message'];
const SENDERS = ['hello@breakthroughs.app', 'coach@breakthroughs.app', 'support@breakthroughs.app'];

@Component({
  selector: 'app-email-composer-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="dlg wide">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">mail</span></span>
        <div>
          <h2>Email campaign composer</h2>
          <p>Composing a draft for <b>{{ data.count }}</b> selected participant{{ data.count === 1 ? '' : 's' }}.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <div class="grid2">
          <div class="dlg-field">
            <label class="dlg-label">From</label>
            <select class="dlg-select" [(ngModel)]="from">
              @for (s of senders; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
          <div class="dlg-field">
            <label class="dlg-label">Template</label>
            <select class="dlg-select" [(ngModel)]="template">
              @for (t of templates; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
        </div>

        <div class="dlg-field">
          <label class="dlg-label">Subject</label>
          <input class="dlg-input" [(ngModel)]="subject" placeholder="Subject line" />
        </div>

        <div class="dlg-field">
          <label class="dlg-label">Message <span class="hint">use {{ '{{name}}' }} to personalise</span></label>
          <textarea class="dlg-textarea" rows="6" [(ngModel)]="body" placeholder="Hi {{ '{{name}}' }}, …"></textarea>
        </div>

        <div class="note">
          <span class="material-symbols-rounded">info</span>
          This is a UI prototype on mock data — queued messages appear in the toolbar badge but nothing is actually sent.
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn btn-ghost spacer" (click)="ref.close()">Cancel</button>
        <button class="btn btn-ghost" [disabled]="!valid()" (click)="close('queue')">
          <span class="material-symbols-rounded">schedule</span> Add to queue
        </button>
        <button class="btn btn-primary" [disabled]="!valid()" (click)="close('send')">
          <span class="material-symbols-rounded">edit_note</span> Compose draft
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .hint {
        font-weight: 400;
        color: var(--pi-text-3);
        font-size: 11.5px;
      }
      .note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 12.5px;
        color: var(--pi-text-2);
        background: var(--pi-surface-3);
        border-radius: 9px;
        padding: 10px 12px;
      }
      .note .material-symbols-rounded {
        font-size: 17px;
        color: var(--pi-accent);
      }
    `,
  ],
})
export class EmailComposerDialogComponent {
  readonly ref = inject(MatDialogRef<EmailComposerDialogComponent>);
  readonly data = inject<{ count: number }>(MAT_DIALOG_DATA);

  templates = TEMPLATES;
  senders = SENDERS;
  from = SENDERS[0];
  template = TEMPLATES[0];
  subject = '';
  body = '';

  valid(): boolean {
    return this.subject.trim().length > 1 && this.body.trim().length > 1;
  }
  close(action: 'send' | 'queue'): void {
    this.ref.close({ action, subject: this.subject.trim(), channel: 'email' } as ComposerResult);
  }
}
