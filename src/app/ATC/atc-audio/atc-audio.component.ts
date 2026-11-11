import { Component, ElementRef, Input, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaUrlService } from '../../shared/media-url.service';

/**
 * One ATC audio note: resolves its own signed URL, plays it, and replaces the URL before
 * the listener can run out of it.
 *
 * BEFORE CHANGING THE RENEWAL RULES, read
 *   specs/journals/2026-11-12-atc-signed-urls-option-c.md
 * and its companion in the Cloud Functions repo. The expiry contract is shared with
 * getMediaUrls and was got wrong four times before it settled.
 *
 * WHY THIS IS A COMPONENT AND NOT NINE COPIES: all nine screens that play ATC audio had
 * the identical `*ngFor` + `<audio><source></audio>` block. Putting the mechanism here
 * means one implementation of the renewal rules, and it collapses the two markup shapes
 * (`[src]` on the element vs a `<source>` child, which needs an explicit load()) into one.
 *
 * LAZY: nothing is requested until the listener presses play. A note nobody opens costs no
 * signature, and the URL's clock starts at playback rather than at page load.
 *
 * WHO DECIDES THE LIFETIME: the server, from the file itself — `duration + 20 min` for
 * audio. This component sends nothing but the path. It also hands the same URL to every
 * viewer while it still carries `duration + 5 min`, so a link is always long enough to
 * play the clip through with five minutes spare.
 *
 * SO WHEN DOES RENEWAL HAPPEN? Rarely, and only after a break. Press play and listen
 * through and the URL outlasts the clip by construction. It is a long pause, a replay, or
 * a connection too slow to finish the transfer that brings the two close together.
 */
@Component({
  selector: 'app-atc-audio',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './atc-audio.component.html',
  styleUrl: './atc-audio.component.css',
})
export class AtcAudioComponent implements OnDestroy {

  /** Stored ref — an object path after migration, a legacy download URL before it. */
  @Input({ required: true }) path!: string;
  /** Shown beside the player, e.g. the clip's index in the note. */
  @Input() label = '';

  @ViewChild('el', { static: true }) elRef!: ElementRef<HTMLAudioElement>;

  private media = inject(MediaUrlService);

  /** Re-request once the link has less than this left — and only if more is still needed. */
  private static readonly RENEW_BELOW_MS = 2 * 60 * 1000;
  /** How often to compare the link's remaining life against the audio still to load. */
  private static readonly CHECK_EVERY_MS = 15_000;
  /** A URL this close to expiry counts as already stale. Matches the service's skew. */
  private static readonly SKEW_MS = 60_000;
  /** Element failures tolerated before the listener is told, rather than retried at. */
  private static readonly MAX_RENEWALS = 2;
  /** Buffered-to-the-end tolerance; browsers rarely report an exact match. */
  private static readonly BUFFER_EPSILON = 0.5;

  ready = false;      // a URL has been fetched at least once; native controls are live
  loading = false;
  failed = false;     // the link died and could not be replaced — offer "Try again"

  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;   // a swap is in flight; keeps the handlers re-entrant-safe
  // Element failures seen since the last deliberate start(). Without this the component
  // re-signed a missing object indefinitely, because signing a path always succeeds.
  private renewals = 0;

  private get el(): HTMLAudioElement { return this.elRef.nativeElement; }

  /** First press of our own button: native controls cannot start without a src. */
  async start(): Promise<void> {
    this.failed = false;
    this.renewals = 0;          // a fresh attempt gets the full retry budget back
    this.loading = true;
    await this.ensureFresh();
    this.loading = false;
    if (!this.el.src) { this.failed = true; return; }
    this.ready = true;
    try { await this.el.play(); } catch { /* user gesture lost; controls are live anyway */ }
    this.startWatch();
  }

  /** "Try again" after a failure — drop the dead URL and start over from the top. */
  async retry(): Promise<void> {
    this.media.invalidate(this.path);
    this.el.removeAttribute('src');
    this.ready = false;
    await this.start();
  }

  /**
   * Guarantee a live URL before the element issues any request. Bound to (play) and
   * (seeking) because those are the two moments a NEW request goes out after a break —
   * so any delay lands on the listener's own click instead of mid-sentence.
   * Returns immediately, at no cost, whenever the URL is healthy.
   */
  async ensureFresh(): Promise<void> {
    if (this.busy) return;
    const exp = this.media.expiryOf(this.path);
    if (this.el.src && exp && exp - AtcAudioComponent.SKEW_MS > Date.now()) return;
    await this.swap();
    this.startWatch();
  }

  /**
   * Is the whole clip already in the browser's buffer?
   *
   * If it is, the URL is no longer needed: continued playback and seeking both come from
   * memory, so there is nothing to renew. (A browser *can* evict buffered data under
   * memory pressure, in which case a later seek fails and the error handler picks it up.)
   */
  private fullyBuffered(): boolean {
    const el = this.el;
    if (!Number.isFinite(el.duration) || el.duration <= 0) return false;
    for (let i = 0; i < el.buffered.length; i++) {
      if (el.buffered.start(i) <= 0 && el.buffered.end(i) >= el.duration - AtcAudioComponent.BUFFER_EPSILON) {
        return true;
      }
    }
    return false;
  }

  /**
   * The rule: once the link has under two minutes left AND the browser has not finished
   * loading the clip, get a new one. Both halves matter — a fully-loaded clip needs no
   * link, and a link with plenty of time left needs no replacing.
   */
  private startWatch(): void {
    this.stopWatch();
    this.timer = setInterval(() => {
      if (this.busy || this.failed) return;
      const exp = this.media.expiryOf(this.path);
      if (!exp) return;
      const remaining = exp - Date.now();
      if (remaining < AtcAudioComponent.RENEW_BELOW_MS && !this.fullyBuffered()) {
        void this.swap();
      }
    }, AtcAudioComponent.CHECK_EVERY_MS);
  }

  private stopWatch(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }

  /**
   * Fetch a replacement URL, then pause / swap / seek / resume.
   *
   * Order matters: resolving BEFORE pausing keeps the round-trip out of the audible gap.
   * On WAV the seek is sample-accurate, because byte offset maps linearly to time.
   */
  private async swap(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    const el = this.el;
    try {
      this.media.invalidate(this.path);
      const fresh = await this.media.resolve(this.path);
      if (!fresh) return false;          // keep whatever is loaded; the element decides

      const pos = el.currentTime;
      const wasPlaying = !el.paused && !el.ended;
      el.pause();
      el.src = fresh;
      if (pos > 0) el.currentTime = pos;
      if (wasPlaying) { try { await el.play(); } catch { /* autoplay policy */ } }
      return true;
    } finally {
      this.busy = false;
    }
  }

  /**
   * The element itself failed. An <audio> error carries no HTTP status, so an expired 403
   * is indistinguishable from a deleted object's 404 — and a re-sign is NOT proof of
   * recovery, because signing a path whose object is gone succeeds every time. Count the
   * element's own failures, which is the only signal that reflects reality.
   */
  async onFail(): Promise<void> {
    if (this.busy) return;
    if (this.renewals++ >= AtcAudioComponent.MAX_RENEWALS) {
      this.stopWatch();
      this.failed = true;
      return;
    }
    await this.swap();
  }

  /** Nothing left to keep alive once the track has run out. */
  onEnded(): void {
    this.stopWatch();
  }

  // These rows live inside *ngFor over onSnapshot data, so components are destroyed and
  // recreated whenever the ATC document changes. An uncleared timer would fire against a
  // detached element.
  ngOnDestroy(): void {
    this.stopWatch();
  }
}
