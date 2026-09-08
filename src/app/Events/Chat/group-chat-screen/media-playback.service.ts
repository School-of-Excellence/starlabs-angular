import { Injectable } from '@angular/core';

/**
 * Keeps at most one piece of media playing at a time across the chat screen.
 *
 * Audio players are their own component, but videos are plain <video> elements scattered through
 * the thread template (message attachment, broadcast header, the lightbox), so a static on the
 * audio component could never see them. This is the one place both kinds meet.
 *
 * Registration is deliberately by element rather than by component: the same rule then covers a
 * <video> created and destroyed by *ngIf without any lifecycle wiring on the template side.
 */
@Injectable({ providedIn: 'root' })
export class MediaPlaybackService {
  private readonly players = new Set<HTMLMediaElement>();

  register(el: HTMLMediaElement): void { this.players.add(el); }

  release(el: HTMLMediaElement): void {
    this.players.delete(el);
    if (!el.paused) el.pause();
  }

  /**
   * Called when `el` starts playing: everything else stops. Muted elements are ignored on both
   * sides — the thumbnail previews in the composer and the info panel are muted and silent, so
   * they neither interrupt anything nor deserve to be interrupted.
   */
  playing(el: HTMLMediaElement): void {
    this.players.add(el);
    if (el.muted) return;
    this.players.forEach(other => {
      if (other !== el && !other.paused && !other.muted) other.pause();
    });
  }

  /** Stop everything — used when the thread changes out from under the player. */
  pauseAll(): void {
    this.players.forEach(el => { if (!el.paused) el.pause(); });
  }
}
