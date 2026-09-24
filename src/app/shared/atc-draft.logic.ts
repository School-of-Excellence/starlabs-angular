/**
 * Pure, side-effect-free reconciliation logic for the local-first ATC draft cache.
 *
 * This file imports NOTHING (no Angular, no Firebase). All decisions about "is this draft dirty?",
 * "should we push, adopt the server copy, or flag a conflict?", and "who wins a conflict?" live here so
 * they can be unit-tested in isolation against synthetic data — never touching real ATC collections.
 *
 * ATCDraftService is a thin IndexedDB + Firestore shell over these functions.
 */

// A draft as kept in our own IndexedDB (atc_draft_cache). `working` is the live local edit; `base` is the
// last snapshot we know reached/came-from the server, and is the ancestor used to tell "did this side change?".
export interface CachedDraft {
  key: string;          // `${collection}/${docId}` — stable, idempotent
  collection: string;
  docId: string;
  working: any;         // current local edits (full ATC draft)
  base: any | null;     // last-synced snapshot (conflict ancestor); null until first sync/open
  baseRev: number;      // server `rev` that `base` came from
  dirty: boolean;       // working differs (in content) from base
  deviceId: string;     // which device authored `working`
  updatedAt: number;    // advisory client time
  pendingDelete?: boolean; // submitted; server soft-delete + local purge still owed
}

// What a server push attempt resolved to (drives the honest status banner).
export type SyncOutcome =
  | 'created'        // doc did not exist server-side; we created it at rev 1
  | 'updated'        // local was based on the latest server rev; pushed cleanly as rev+1
  | 'unchanged'      // nothing dirty to push
  | 'took-remote'    // remote was newer and local was clean; adopted remote (no loss)
  | 'conflict'       // remote newer AND local has unsynced edits; must be reconciled (no side overwritten)
  | 'pending-local'  // offline; kept durably on this device, will retry
  | 'error';

// What to show when a draft is (re)opened and compared with the server copy.
export type OpenDecision = 'use-remote' | 'use-local' | 'conflict';

// Bookkeeping fields that change on every save but carry no user content — excluded from dirty/conflict
// comparison so an idempotent re-save isn't seen as a real edit, and a clock tick isn't seen as a conflict.
export const VOLATILE_FIELDS = ['lastupdated', 'rev', 'serverUpdatedAt', 'lastWriterDevice'];

export function draftKey(collection: string, docId: string): string {
  return `${collection}/${docId}`;
}

export function nextRev(rev: number | null | undefined): number {
  return (typeof rev === 'number' && rev > 0 ? rev : 0) + 1;
}

// Deterministic, key-order-independent serialization with volatile fields stripped — the basis for content equality.
export function canonical(value: any): string {
  return JSON.stringify(normalize(value));
}

function normalize(v: any): any {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object') {
    // Firestore Timestamp (native) / Date -> ISO string so two clocks of the "same" content differ only via VOLATILE keys
    if (typeof v.toDate === 'function' && typeof v.seconds === 'number') return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    // Firestore native DocumentReference -> stable path. MUST short-circuit BEFORE the generic recursion below:
    // a DocumentReference holds the Firestore instance in its own fields, and that object graph is circular —
    // recursing it overflows the stack (the "Maximum call stack size exceeded" that made saveLocal fail, so the
    // draft was neither stored nor synced). `type === 'document'` is the modular SDK marker for a doc ref.
    if (v.type === 'document' && typeof v.path === 'string') return `ref:${v.path}`;
    // The IndexedDB-serialized forms of the same types -> the SAME canonical primitives, so a native `working`
    // compares content-equal to a map-shaped `base` (keeps dirty-detection accurate across the clone round-trip).
    if (v.type === 'firestore/documentReference/1.0' && typeof v.referencePath === 'string') return `ref:${v.referencePath}`;
    if (v.type === 'firestore/timestamp/1.0' && typeof v.seconds === 'number') return new Date(v.seconds * 1000 + (v.nanoseconds ?? 0) / 1e6).toISOString();
    const out: Record<string, any> = {};
    for (const k of Object.keys(v).filter(k => !VOLATILE_FIELDS.includes(k)).sort()) {
      out[k] = normalize(v[k]);
    }
    return out;
  }
  return v;
}

// Two drafts are content-equal if they match once volatile fields and key order are ignored.
export function sameContent(a: any, b: any): boolean {
  return canonical(a) === canonical(b);
}

// Has the working copy diverged from the last-synced base?
export function computeDirty(working: any, base: any | null): boolean {
  if (base === null || base === undefined) return true;
  return !sameContent(working, base);
}

/**
 * Decide what an autosave's server push should do, WITHOUT ever choosing to discard local edits.
 * `remoteRev` is the rev currently on the server (null if the doc doesn't exist yet).
 */
export function decideSync(
  local: { baseRev: number; dirty: boolean },
  remoteRev: number | null,
  online: boolean
): SyncOutcome {
  if (!online) return 'pending-local';
  if (remoteRev === null || remoteRev === undefined) return 'created';
  if (!local.dirty) return remoteRev > local.baseRev ? 'took-remote' : 'unchanged';
  // local has unsynced edits:
  if (remoteRev > local.baseRev) return 'conflict';   // someone else advanced the doc — never clobber them
  return 'updated';                                   // we're based on the latest rev — safe to push
}

/**
 * Decide what to render when a draft is opened/refreshed, given the local cache and the server rev.
 * `null` local means "no local copy" → take the server's.
 */
export function decideOpen(local: CachedDraft | null, remoteRev: number | null): OpenDecision {
  if (!local) return 'use-remote';
  if (!local.dirty) return 'use-remote';                 // local matches base; server is authoritative (same or newer)
  if (remoteRev === null || remoteRev === undefined) return 'use-local'; // server gone/empty, keep our edits
  if (remoteRev > local.baseRev) return 'conflict';      // both sides moved → reconcile
  return 'use-local';                                    // local is ahead of (or level with) the server
}

// Resolve a conflict: the chosen side wins; the other is returned so the caller can ARCHIVE it (never destroy it).
export function pickWinner(
  choice: 'mine' | 'theirs',
  mine: any,
  theirs: any
): { winner: any; loser: any } {
  return choice === 'mine' ? { winner: mine, loser: theirs } : { winner: theirs, loser: mine };
}
