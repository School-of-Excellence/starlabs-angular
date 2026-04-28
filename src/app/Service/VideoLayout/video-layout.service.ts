import { Injectable, signal } from '@angular/core';

export type LayoutMode = 'spotlight' | 'grid' | 'screen-share';
export type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

@Injectable({ providedIn: 'root' })
export class VideoLayoutService {

  // PiP corner position
  pipPosition = signal<PipPosition>('bottom-right');

  // Custom PiP coordinates when dragged freely (null = use corner position)
  pipCustomPosition = signal<{ x: number; y: number } | null>(null);

  // Is PiP minimized
  isPipMinimized = signal(false);

  // Toggle PiP minimized state
  togglePipSize() {
    this.isPipMinimized.update(v => !v);
    console.log(`PiP ${this.isPipMinimized() ? 'minimized' : 'expanded'}`);
  }

  // Snap PiP to nearest corner
  snapPipToCorner(containerWidth: number, containerHeight: number, pipX: number, pipY: number) {
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;

    let corner: PipPosition;
    if (pipX < centerX && pipY < centerY) corner = 'top-left';
    else if (pipX >= centerX && pipY < centerY) corner = 'top-right';
    else if (pipX < centerX && pipY >= centerY) corner = 'bottom-left';
    else corner = 'bottom-right';

    this.pipPosition.set(corner);
    this.pipCustomPosition.set(null);
    console.log(`PiP snapped to: ${corner}`);
  }
}
