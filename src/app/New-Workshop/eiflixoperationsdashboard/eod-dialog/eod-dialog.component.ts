import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface EodDialogField {
  key: string;
  label: string;
  type: 'number' | 'date' | 'text';
  value?: any;
  min?: number | string;
  max?: number | string;
  step?: number;
  required?: boolean;
  hint?: string;
  suffix?: string;
}

export interface EodDialogConfig {
  title: string;
  subtitle?: string;
  icon?: string;
  accent?: 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose';
  fields: EodDialogField[];
  submitLabel?: string;
  cancelLabel?: string;
  /** Cross-field check: return an error message to block submit, or null. */
  validate?: (values: Record<string, any>) => string | null;
}

/**
 * The operations dashboard's shared form dialog ("operations ledger" look).
 * Config-driven: pass a title + typed fields, get the entered values back.
 * Open it through EodDialogService — every dashboard dialog reuses this.
 */
@Component({
  selector: 'app-eod-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatDialogModule],
  templateUrl: './eod-dialog.component.html',
  styleUrl: './eod-dialog.component.css'
})
export class EodDialogComponent {
  readonly config = inject<EodDialogConfig>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<EodDialogComponent>);

  values: Record<string, any> = {};

  constructor() {
    for (const f of this.config.fields) {
      this.values[f.key] = f.value ?? (f.type === 'number' ? null : '');
    }
  }

  get crossError(): string | null {
    return this.config.validate?.(this.values) ?? null;
  }

  get valid(): boolean {
    if (this.crossError) return false;
    return this.config.fields.every(f => {
      const v = this.values[f.key];
      if (f.required && (v === null || v === undefined || v === '')) return false;
      if (f.type === 'number' && v !== null && v !== '') {
        const n = Number(v);
        if (Number.isNaN(n)) return false;
        if (f.min !== undefined && n < Number(f.min)) return false;
        if (f.max !== undefined && n > Number(f.max)) return false;
      }
      return true;
    });
  }

  submit(): void {
    if (this.valid) this.ref.close({ ...this.values });
  }

  cancel(): void {
    this.ref.close(undefined);
  }
}
