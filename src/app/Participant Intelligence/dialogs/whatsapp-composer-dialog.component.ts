import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ComposerResult } from './email-composer-dialog.component';

interface WaTemplate {
  id: string;
  name: string;
  body: string;
  params: string[];
}

const SERVERS = ['Breakthroughs Main', 'Breakthroughs Events'];
const TEMPLATES: WaTemplate[] = [
  { id: 'wt-renew', name: 'renewal_reminder', body: 'Hi {{1}}, your {{2}} subscription renews soon. Reply to keep your momentum going!', params: ['Name', 'Journey'] },
  { id: 'wt-event', name: 'event_invite', body: 'Hi {{1}}, you are invited to {{2}} on {{3}}. Tap to confirm your seat.', params: ['Name', 'Event', 'Date'] },
  { id: 'wt-winback', name: 'winback_offer', body: 'Hi {{1}}, we miss you. Here is a special offer to restart your journey.', params: ['Name'] },
];

@Component({
  selector: 'app-whatsapp-composer-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="dlg wide">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">chat</span></span>
        <div>
          <h2>WhatsApp campaign composer</h2>
          <p>Sending to <b>{{ data.count }}</b> selected participant{{ data.count === 1 ? '' : 's' }} via WATI.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <div class="grid2">
          <div class="dlg-field">
            <label class="dlg-label">WATI server</label>
            <select class="dlg-select" [(ngModel)]="server">
              @for (s of servers; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
          <div class="dlg-field">
            <label class="dlg-label">Approved template</label>
            <select class="dlg-select" [ngModel]="templateId()" (ngModelChange)="templateId.set($event)">
              @for (t of templates; track t.id) {
                <option [value]="t.id">{{ t.name }}</option>
              }
            </select>
          </div>
        </div>

        @if (current(); as t) {
          <label class="dlg-label">Parameters</label>
          <div class="params">
            @for (p of t.params; track p; let i = $index) {
              <div class="param">
                <span class="pk">{{ '{{' + (i + 1) + '}}' }}</span>
                <input class="dlg-input" [placeholder]="p" [(ngModel)]="paramValues[i]" />
              </div>
            }
          </div>

          <label class="dlg-label">Preview</label>
          <div class="preview">{{ preview() }}</div>
        }

        <div class="note">
          <span class="material-symbols-rounded">info</span>
          UI prototype — queued WhatsApp messages appear in the toolbar badge; nothing is actually sent.
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn btn-ghost spacer" (click)="ref.close()">Cancel</button>
        <button class="btn btn-ghost" (click)="close('queue')">
          <span class="material-symbols-rounded">schedule</span> Add to queue
        </button>
        <button class="btn btn-primary" (click)="close('send')">
          <span class="material-symbols-rounded">send</span> Send to {{ data.count }}
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
      .params {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
      }
      .param {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .pk {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        font-weight: 600;
        color: var(--pi-accent);
        background: var(--pi-accent-bg);
        padding: 6px 9px;
        border-radius: 7px;
        flex-shrink: 0;
      }
      .preview {
        background: #e6f6ea;
        border: 1px solid #bfe6cb;
        border-radius: 10px;
        padding: 12px 14px;
        font-size: 13.5px;
        line-height: 1.5;
        color: #14502c;
        margin-bottom: 16px;
        white-space: pre-wrap;
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
export class WhatsappComposerDialogComponent {
  readonly ref = inject(MatDialogRef<WhatsappComposerDialogComponent>);
  readonly data = inject<{ count: number }>(MAT_DIALOG_DATA);

  servers = SERVERS;
  templates = TEMPLATES;
  server = SERVERS[0];
  readonly templateId = signal(TEMPLATES[0].id);
  paramValues: string[] = [];

  readonly current = computed(() => this.templates.find((t) => t.id === this.templateId()) ?? null);

  readonly preview = computed(() => {
    const t = this.current();
    if (!t) return '';
    let body = t.body;
    t.params.forEach((_, i) => {
      body = body.replace(`{{${i + 1}}}`, this.paramValues[i] || `{{${i + 1}}}`);
    });
    return body;
  });

  close(action: 'send' | 'queue'): void {
    this.ref.close({ action, subject: this.current()?.name ?? 'whatsapp', channel: 'whatsapp' } as ComposerResult);
  }
}
