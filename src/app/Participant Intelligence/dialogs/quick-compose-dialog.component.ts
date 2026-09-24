import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface QuickField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'multiselect';
  placeholder?: string;
  options?: { value: string; label: string }[];
}
export interface QuickComposeData {
  icon: string;
  title: string;
  subtitle: string;
  fields: QuickField[];
  confirmText: string;
  confirmIcon: string;
  note?: string;
}

@Component({
  selector: 'app-quick-compose-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">{{ data.icon }}</span></span>
        <div>
          <h2>{{ data.title }}</h2>
          <p>{{ data.subtitle }}</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        @for (f of data.fields; track f.key) {
          <div class="dlg-field">
            <label class="dlg-label">{{ f.label }}</label>
            @switch (f.type) {
              @case ('text') {
                <input class="dlg-input" [placeholder]="f.placeholder || ''" [(ngModel)]="values[f.key]" />
              }
              @case ('textarea') {
                <textarea class="dlg-textarea" [placeholder]="f.placeholder || ''" [(ngModel)]="values[f.key]"></textarea>
              }
              @case ('multiselect') {
                <div class="ms">
                  @for (o of f.options; track o.value) {
                    <button class="mschip" [class.on]="isOn(f.key, o.value)" (click)="toggle(f.key, o.value)">
                      {{ o.label }}
                      @if (isOn(f.key, o.value)) {
                        <span class="material-symbols-rounded">check</span>
                      }
                    </button>
                  }
                </div>
              }
            }
          </div>
        }
        @if (data.note) {
          <div class="note"><span class="material-symbols-rounded">info</span>{{ data.note }}</div>
        }
      </div>

      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!valid()" (click)="confirm()">
          <span class="material-symbols-rounded">{{ data.confirmIcon }}</span> {{ data.confirmText }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .ms {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .mschip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: 1px solid var(--pi-border-strong);
        background: #fff;
        color: var(--pi-text);
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        padding: 7px 12px;
        border-radius: 999px;
        cursor: pointer;
      }
      .mschip:hover {
        border-color: var(--pi-accent);
      }
      .mschip.on {
        background: var(--pi-accent);
        border-color: var(--pi-accent);
        color: #fff;
      }
      .mschip .material-symbols-rounded {
        font-size: 16px;
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
export class QuickComposeDialogComponent {
  readonly ref = inject(MatDialogRef<QuickComposeDialogComponent>);
  readonly data = inject<QuickComposeData>(MAT_DIALOG_DATA);

  values: Record<string, string> = {};
  private readonly multi = signal<Record<string, Set<string>>>({});

  isOn(key: string, value: string): boolean {
    return this.multi()[key]?.has(value) ?? false;
  }
  toggle(key: string, value: string): void {
    this.multi.update((m) => {
      const next = { ...m };
      const set = new Set(next[key] ?? []);
      set.has(value) ? set.delete(value) : set.add(value);
      next[key] = set;
      return next;
    });
  }

  valid(): boolean {
    return this.data.fields.every((f) => {
      if (f.type === 'multiselect') return (this.multi()[f.key]?.size ?? 0) > 0;
      return (this.values[f.key]?.trim().length ?? 0) > 0;
    });
  }

  confirm(): void {
    const out: Record<string, unknown> = { ...this.values };
    for (const [k, set] of Object.entries(this.multi())) out[k] = [...set];
    this.ref.close(out);
  }
}
