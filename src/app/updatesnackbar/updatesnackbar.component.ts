import { Component, ElementRef, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';

@Component({
  selector: 'app-updatesnackbar',
  imports: [
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './updatesnackbar.component.html',
  styleUrl: './updatesnackbar.component.css'
})
export class UpdatesnackbarComponent {
  /** The CDK overlay pane we translate while dragging (found lazily). */
  private pane: HTMLElement | null = null;
  /** Accumulated offset so drags are additive across multiple grabs. */
  private offsetX = 0;
  private offsetY = 0;
  /** Pointer position at the start of the current drag. */
  private startX = 0;
  private startY = 0;
  private dragging = false;

  constructor(
    @Inject(MAT_SNACK_BAR_DATA) public data: {
      onUpdate: () => void;
      // onDismiss: () => void;
    },
    private host: ElementRef<HTMLElement>
  ) {}

  update() {
    this.data.onUpdate();
  }

  // dismiss() {
  //   this.data.onDismiss();
  // }

  private resolvePane(): HTMLElement | null {
    if (!this.pane) {
      this.pane = this.host.nativeElement.closest('.cdk-overlay-pane');
    }
    return this.pane;
  }

  onDragStart(event: PointerEvent) {
    // Only start on primary button / touch, and never from the reload button.
    if (event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement).closest('.update-btn')) {
      return;
    }
    const pane = this.resolvePane();
    if (!pane) {
      return;
    }
    this.dragging = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onDragMove(event: PointerEvent) {
    if (!this.dragging) {
      return;
    }
    const pane = this.resolvePane();
    if (!pane) {
      return;
    }
    const x = this.offsetX + (event.clientX - this.startX);
    const y = this.offsetY + (event.clientY - this.startY);
    pane.style.transform = `translate(${x}px, ${y}px)`;
  }

  onDragEnd(event: PointerEvent) {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.offsetX += event.clientX - this.startX;
    this.offsetY += event.clientY - this.startY;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }
}
