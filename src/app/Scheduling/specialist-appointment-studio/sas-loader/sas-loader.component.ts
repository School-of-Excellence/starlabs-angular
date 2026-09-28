import { Component, Input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/* Inline loader for the Specialist Appointment Studio: the app's Material spinner plus a line of text.
   (LoadingProgressComponent is dialog-only, so it can't sit inside a card.) Hook prefix: sal */
@Component({
  selector: 'app-sas-loader',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="sas-loader" [class.is-sm]="size === 'sm'" role="status" aria-live="polite" data-testid="sal-loader">
      <mat-progress-spinner mode="indeterminate" color="primary" [diameter]="size === 'sm' ? 20 : 36" [strokeWidth]="size === 'sm' ? 2.5 : 3.5" />
      @if (msg) { <span>{{ msg }}</span> }
    </div>`,
})
export class SasLoaderComponent {
  @Input() msg = 'Loading…';
  @Input() size: 'sm' | 'md' = 'md';
}
