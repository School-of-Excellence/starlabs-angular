import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { EodDialogComponent, EodDialogConfig } from './eod-dialog.component';

/**
 * Shared dialog service for the operations dashboard. Any dashboard feature
 * that needs a form dialog calls open() with a config — one styled dialog
 * for the whole dashboard, no per-feature dialog components.
 *
 *   const result = await this.eodDialog.open({ title, fields: [...] });
 *   if (result) { ...result['fieldKey']... }   // undefined = cancelled
 */
@Injectable({ providedIn: 'root' })
export class EodDialogService {
  private dialog = inject(MatDialog);

  async open(config: EodDialogConfig): Promise<Record<string, any> | undefined> {
    const ref = this.dialog.open(EodDialogComponent, {
      data: config,
      panelClass: 'eod-dialog-panel',
      width: '420px',
      maxWidth: '92vw',
      maxHeight: '90vh',
      autoFocus: 'first-tabbable'
    });
    return await firstValueFrom(ref.afterClosed());
  }
}
