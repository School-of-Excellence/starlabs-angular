import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { map } from 'rxjs/operators';
import { ConfirmComponent } from '../../../DialogBox/confirm/confirm.component';
import { UploadStudioComponent } from './upload-studio.component';

export const pendingUploadsGuard: CanDeactivateFn<UploadStudioComponent> = (component) => {
  if (!component.hasActiveUploads()) return true;
  const dialog = inject(MatDialog);
  const active = component.jobs.filter(j => j.pending).length;
  return dialog.open(ConfirmComponent, {
    data: {
      title: 'Uploads in progress',
      message: `Leaving now will abort ${active} active upload${active > 1 ? 's' : ''}. Stay on this screen until they finish.`,
      confirmText: 'Abort & leave',
      cancelText: 'Keep uploading',
    },
    disableClose: true,
  }).afterClosed().pipe(map(confirmed => {
    if (confirmed) component.abortAll();
    return !!confirmed;
  }));
};
