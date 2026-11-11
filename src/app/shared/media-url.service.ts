import { inject, Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { Functions, getFunctions, httpsCallable } from '@angular/fire/functions';

interface MediaUrlResult {
  ref: string;
  url?: string;
  expiresAt?: number;
  /** Seconds, measured server-side from the file. Null for images and unreadable audio. */
  duration?: number | null;
  error?: string;
}

interface MediaUrlsResponse {
  results: MediaUrlResult[];
}

/**
 * Turns whatever is stored in a Firestore media field into something an <img>, <audio>
 * or <video> can load.
 *
 * Contract and history: specs/journals/2026-11-12-atc-signed-urls-option-c.md, and the
 * Cloud Functions companion at docs/journals/2026-11-12-getmediaurls-atc-signed-urls.md.
 *
 * TWO KINDS OF STORED VALUE, two behaviours:
 *
 *   1. Already a fetchable URL (`http://` or `https://`) — returned UNCHANGED, with no
 *      callable and no signature. Legacy Firebase download URLs therefore keep working
 *      exactly as they do today, which is what makes the rollout incremental: a screen
 *      can be moved onto this service before a single database row is migrated, and
 *      nothing breaks at any point.
 *   2. Anything else — a `gs://bucket/path` ref or a bare object path — is sent to the
 *      getMediaUrls callable, which signs the object and returns a short-lived V4 URL.
 *
 * The trade-off in (1), stated plainly: a passed-through download URL still carries its
 * never-expiring token, so a legacy row keeps that exposure until it is migrated to a
 * path. The security win arrives with the data migration, not with this service.
 *
 * BATCHING — a note with six clips and four images should cost ONE round-trip, not ten.
 * Calls landing within BATCH_MS are coalesced into a single request, and a ref already in
 * flight attaches to the pending request instead of starting another.
 *
 * LIFETIME IS DECIDED SERVER-SIDE, and this service does not get a say. The callable reads
 * each clip's length from the file itself and grants `duration + 20 min`; images get 15
 * minutes. An earlier revision sent a `duration` up with the request, which meant anyone
 * signed in could ask for a year-long URL from the browser console. Nothing is sent now,
 * so there is nothing to forge.
 *
 * SHARING — the callable hands the same URL to everyone while it still carries
 * `duration + 5 min`, so viewers share a string and the browser can serve a large
 * recording from cache instead of downloading it again.
 */
@Injectable({ providedIn: 'root' })
export class MediaUrlService {

  private app = inject(FirebaseApp);
  // Same region and transport as atc-firebase.service.ts — built straight off the
  // FirebaseApp, so this needs no provideFunctions() in app.config.ts.
  private fn: Functions = getFunctions(this.app, 'us-central1');
  private call = httpsCallable<{ refs: string[] }, MediaUrlsResponse>(this.fn, 'getMediaUrls');

  /** A URL this close to expiry is treated as already stale. */
  private static readonly SKEW_MS = 60_000;
  /** Coalescing window — one animation frame is enough to collect a document's media. */
  private static readonly BATCH_MS = 16;
  /** Must not exceed MAX_REFS in the callable. */
  private static readonly MAX_PER_CALL = 200;

  private cache = new Map<string, { url: string; expiresAt: number; duration: number | null }>();
  private waiting = new Map<string, ((url: string | null) => void)[]>();
  private queue = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Readable from the console (or a test screen) to see the mechanism working. */
  readonly stats = { passthrough: 0, signed: 0, cacheHits: 0, failed: 0, calls: 0 };

  /** True when the stored value is already loadable as-is. */
  static isFetchableUrl(ref: string): boolean {
    return /^https?:\/\//i.test(ref.trim());
  }

  /**
   * Resolve a stored media value to a loadable URL, or null when it cannot be resolved.
   * Callers render their own placeholder on null.
   */
  resolve(ref: string): Promise<string | null> {
    if (!ref) return Promise.resolve(null);

    // (1) already a URL → hand it straight back, no network
    if (MediaUrlService.isFetchableUrl(ref)) {
      this.stats.passthrough++;
      return Promise.resolve(ref);
    }

    // (2) a path/gs:// ref → cache first, then the callable
    const hit = this.cache.get(ref);
    if (hit && hit.expiresAt - MediaUrlService.SKEW_MS > Date.now()) {
      this.stats.cacheHits++;
      return Promise.resolve(hit.url);
    }
    this.cache.delete(ref);

    return new Promise<string | null>(done => {
      const waiters = this.waiting.get(ref);
      if (waiters) { waiters.push(done); return; }   // already queued or in flight
      this.waiting.set(ref, [done]);
      this.queue.add(ref);
      if (this.flushTimer === null) {
        this.flushTimer = setTimeout(() => this.flush(), MediaUrlService.BATCH_MS);
      }
    });
  }

  /**
   * Warm the cache for a whole document's media in ONE call, fire-and-forget.
   *
   * Because the loop is synchronous every ref lands in the same BATCH_MS window, so a
   * screen that calls this once on load pays a single round-trip however many clips and
   * images the note holds. Elements that later call resolve() find the ref cached, or
   * attach to the request already in flight — never a second one.
   */
  prefetch(refs: string[]): void {
    for (const ref of refs) {
      if (!ref || MediaUrlService.isFetchableUrl(ref)) continue;
      const hit = this.cache.get(ref);
      if (hit && hit.expiresAt - MediaUrlService.SKEW_MS > Date.now()) continue;
      if (this.waiting.has(ref)) continue;
      void this.resolve(ref);
    }
  }

  /** When the current URL for `ref` expires, as epoch ms, or null if not cached. */
  expiryOf(ref: string): number | null {
    return this.cache.get(ref)?.expiresAt ?? null;
  }

  /**
   * The clip's length in seconds as the server measured it, or null for an image, an
   * unreadable file, or a ref that has not been resolved yet.
   *
   * Worth having because it is known before the browser has loaded any audio, so a caller
   * can reason about whether a URL will outlast playback without waiting for metadata.
   */
  durationOf(ref: string): number | null {
    return this.cache.get(ref)?.duration ?? null;
  }

  /** Drop a cached URL so the next resolve() re-requests. The expiry retry path. */
  invalidate(ref: string): void {
    this.cache.delete(ref);
  }

  /** Drop every cached URL — forces a re-request without waiting for expiry. */
  clear(): void {
    this.cache.clear();
  }

  private async flush(): Promise<void> {
    this.flushTimer = null;

    const refs = [...this.queue].slice(0, MediaUrlService.MAX_PER_CALL);
    refs.forEach(r => this.queue.delete(r));
    // Anything over the cap goes out on the next tick rather than being dropped.
    if (this.queue.size > 0 && this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), MediaUrlService.BATCH_MS);
    }
    if (refs.length === 0) return;

    try {
      this.stats.calls++;
      const { data } = await this.call({ refs });
      for (const r of data.results) {
        if (r.url && r.expiresAt) {
          this.cache.set(r.ref, { url: r.url, expiresAt: r.expiresAt, duration: r.duration ?? null });
          this.stats.signed++;
          this.settle(r.ref, r.url);
        } else {
          this.stats.failed++;
          console.warn(`[media-url] ${r.error ?? 'no url returned'} — ${r.ref}`);
          this.settle(r.ref, null);
        }
      }
      // A ref the response omitted entirely must still release its waiters.
      refs.forEach(r => this.settle(r, null));
    } catch (err) {
      // Whole call failed (offline, unauthenticated, function missing). Release every
      // waiter with null so the UI falls back instead of hanging on a pending promise.
      console.error('[media-url] getMediaUrls failed', err);
      this.stats.failed += refs.length;
      refs.forEach(r => this.settle(r, null));
    }
  }

  private settle(ref: string, url: string | null): void {
    const waiters = this.waiting.get(ref);
    if (!waiters) return;
    this.waiting.delete(ref);
    waiters.forEach(done => done(url));
  }
}
