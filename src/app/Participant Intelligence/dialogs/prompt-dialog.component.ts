import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface PromptData {
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  confirmText?: string;
  icon?: string;
  value?: string;
}

@Component({
  selector: 'app-prompt-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">{{ data.icon || 'bookmark_add' }}</span></span>
        <div>
          <h2>{{ data.title }}</h2>
          @if (data.subtitle) {
            <p>{{ data.subtitle }}</p>
          }
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="dlg-body">
        <div class="dlg-field">
          <label class="dlg-label">{{ data.label }}</label>
          <input
            class="dlg-input"
            [(ngModel)]="value"
            [placeholder]="data.placeholder || ''"
            (keyup.enter)="confirm()"
            autofocus
          />
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="value.trim().length < 2" (click)="confirm()">
          {{ data.confirmText || 'Save' }}
        </button>
      </div>
    </div>
  `,
})
export class PromptDialogComponent {
  readonly ref = inject(MatDialogRef<PromptDialogComponent>);
  readonly data = inject<PromptData>(MAT_DIALOG_DATA);
  value = this.data.value ?? '';

  confirm(): void {
    const v = this.value.trim();
    if (v.length >= 2) this.ref.close(v);
  }
}
