import { Injectable, signal } from '@angular/core';

export type LayoutMode = 'solo' | 'spotlight' | 'spotlight-filmstrip' | 'grid';
export type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface SpotlightState {
  mainParticipantId: string | null; // null = default (remote in main), 'local' = local in main
  isScreenShare: boolean;
}

@Injectable({ providedIn: 'root' })
export class VideoLayoutService {

  // PiP corner position
  pipPosition = signal<PipPosition>('bottom-right');

  // Custom PiP coordinates when dragged freely (null = use corner position)
  pipCustomPosition = signal<{ x: number; y: number } | null>(null);

  // Is PiP minimized
  isPipMinimized = signal(false);

  // Spotlight state - who is in main view
  spotlightState = signal<SpotlightState>({
    mainParticipantId: null,
    isScreenShare: false
  });

  // Determine layout mode based on participant count and screen share
  getLayoutMode(remoteCount: number, hasScreenShare: boolean): LayoutMode {
    if (hasScreenShare) return 'spotlight-filmstrip';
    if (remoteCount === 0) return 'solo';
    if (remoteCount === 1) return 'spotlight';
    return 'grid';
  }

  // Swap main and PiP videos
  swapSpotlight(participantId: string | 'local') {
    const current = this.spotlightState();
    if (current.isScreenShare) {
      console.log('Cannot swap during screen share');
      return;
    }

    this.spotlightState.set({
      ...current,
      mainParticipantId: participantId === 'local' ? 'local' : participantId
    });
    console.log(`Spotlight swapped to: ${participantId}`);
  }

  // Reset spotlight to default (remote as main)
  resetSpotlight() {
    this.spotlightState.set({
      mainParticipantId: null,
      isScreenShare: false
    });
    console.log('Spotlight reset to default');
  }

  // Set screen share as main
  setScreenShareActive(participantId: string, active: boolean) {
    this.spotlightState.set({
      mainParticipantId: active ? participantId : null,
      isScreenShare: active
    });
    console.log(`Screen share ${active ? 'started' : 'ended'}: ${participantId}`);
  }

  // Toggle PiP minimized state
  togglePipSize() {
    this.isPipMinimized.update(v => !v);
    console.log(`PiP ${this.isPipMinimized() ? 'minimized' : 'expanded'}`);
  }

  // Update PiP position when dragged
  updatePipPosition(x: number, y: number) {
    this.pipCustomPosition.set({ x, y });
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
