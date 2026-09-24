import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc, getDocs, setDoc, updateDoc, runTransaction, serverTimestamp } from '@angular/fire/firestore';
import {
  CachedDraft, SyncOutcome, draftKey, nextRev, computeDirty, decideSync, decideOpen, pickWinner
} from './atc-draft.logic';

const DB_NAME = 'atc_draft_cache';   // our OWN IndexedDB — independent of (and replacing) Firestore's persistence cache
const STORE = 'drafts';
const DEVICE_KEY = 'atc_device_id';
const FS_TIMEOUT_MS = 7000;          // bound every Firestore RPC so a hung / SW-corrupted call can't freeze the UI

// caller picks which side of a conflict to keep; the other is archived, never destroyed
export type ConflictPicker = (mine: any, theirs: any) => Promise<'mine' | 'theirs'>;

/**
 * Local-first draft cache for the Prescribe/Edit ATC flows. Replaces FirestoreRecoveryService.
 *
 * Contract:
 *  - saveLocal() writes the full ATC to our IndexedDB FIRST (durable across refresh/crash), every change.
 *  - sync() pushes to the Firestore draft doc when online, inside a transaction that compares a server `rev`
 *    counter so a second device's write is detected as a 'conflict' instead of being silently clobbered.
 *  - reconcileOnOpen() merges server + local when a draft is opened: clean side adopts the other; a true
 *    divergence asks the caller to pick, then ARCHIVES the loser to `…/{docId}/conflicts/{rev}` (no data loss).
 *  - finalizeSubmit() soft-deletes the server draft and purges the local copy.
 *
 * Media keeps its own MediaCacheService path; this service only owns the structured draft document.
 */
@Injectable({ providedIn: 'root' })
export class ATCDraftService {

  // stable per-device id so a conflict dialog can say "this device" vs "the other device"
  readonly deviceId: string = this.resolveDeviceId();

  private resolveDeviceId(): string {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = (crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return `dev-ephemeral`;
    }
  }

  // ---- public API ------------------------------------------------------------------------------

  /** Durable local write — keyed by the draft doc id. Recomputes `dirty` against the last-synced base. */
  async saveLocal(collection: string, docId: string, working: any): Promise<void> {
    try {
      const key = draftKey(collection, docId);
      const prev = await this.get(key);
      // Clone ONCE and use the serialized (plain-JSON) copy for BOTH storage and dirty-diffing.
      // Diffing the raw `working` would walk any native Firestore DocumentReference it contains into the
      // circular Firestore-instance graph → "Maximum call stack size exceeded". `base` is already stored in
      // this same serialized form, so map-vs-map is symmetric and dirty-detection stays correct.
      const cloned = this.clone(working);
      const entry: CachedDraft = {
        key, collection, docId,
        working: cloned,
        base: prev?.base ?? null,
        baseRev: prev?.baseRev ?? 0,
        dirty: computeDirty(cloned, prev?.base ?? null),
        deviceId: this.deviceId,
        updatedAt: Date.now(),
        pendingDelete: prev?.pendingDelete,
      };
      await this.put(entry);
    } catch (e) {
      // storage full / blocked (private mode): keep the in-memory copy, don't crash the save
      console.warn('ATCDraft: could not store draft locally', e);
    }
  }

  /**
   * Push the local draft to the server when online. Returns the outcome plus, on 'conflict'/'took-remote',
   * the remote document so the caller can react. Never throws, never discards local edits.
   */
  async sync(firestore: Firestore, collection: string, docId: string): Promise<{ outcome: SyncOutcome; remote?: any }> {
    const cached = await this.get(draftKey(collection, docId));
    if (!cached) return { outcome: 'unchanged' };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { outcome: cached.dirty ? 'pending-local' : 'unchanged' };
    }

    const pushed = cached.working;              // snapshot we attempt to push (user may type more meanwhile)
    const ref = doc(firestore, collection, docId);
    // a holder object (not a `let`) so the outcome set inside the transaction closure isn't literal-narrowed afterwards
    const r: { outcome: SyncOutcome; committedRev: number; remote?: any } = { outcome: 'unchanged', committedRev: 0 };

    try {
      await this.withTimeout(runTransaction(firestore, async (tx) => {
        const snap = await tx.get(ref);
        const remoteRev = snap.exists() ? (snap.data()['rev'] ?? 0) : null;
        r.outcome = decideSync({ baseRev: cached.baseRev, dirty: cached.dirty }, remoteRev, true);
        if (r.outcome === 'created' || r.outcome === 'updated') {
          r.committedRev = nextRev(remoteRev ?? 0);
          tx.set(ref, this.toServer(pushed, r.committedRev));
        } else if (r.outcome === 'took-remote' || r.outcome === 'conflict') {
          r.remote = snap.data();
        }
      }));
    } catch (e) {
      // offline, unreachable, or a hung/timed-out RPC: the edit is already safe in IndexedDB → keep it and retry.
      // (This is the timeout we lost with FirestoreRecoveryService — a bad connection must never freeze "Saving…".)
      console.warn('ATCDraft: sync could not reach the server (kept on this device)', e);
      return { outcome: cached.dirty ? 'pending-local' : 'unchanged' };
    }

    // post-commit local bookkeeping (outside the transaction). The server write already succeeded, so a local
    // store hiccup here must NOT report failure — worst case the draft stays dirty and re-syncs idempotently.
    try {
      if (r.outcome === 'created' || r.outcome === 'updated') {
        await this.advanceBase(collection, docId, pushed, r.committedRev);
      } else if (r.outcome === 'took-remote') {
        await this.adoptRemote(collection, docId, r.remote);
      }
    } catch (e) {
      console.warn('ATCDraft: post-sync local bookkeeping failed (will reconcile on next sync)', e);
    }
    return { outcome: r.outcome, remote: r.remote };
  }

  /**
   * Local-first OPEN: never blocks on the network. Renders whatever we have, then refines against the server.
   *  1. read the local copy,
   *  2. try a BOUNDED server fetch (timeout) — if the server is unreachable (offline / SW-broken / slow),
   *     return the local copy immediately and sync later,
   *  3. if the server answered, reconcile by `rev` (clean → adopt; local-ahead → keep local; divergence →
   *     pick + archive). Returns the value to hydrate the form, or null if nothing is available yet.
   */
  async openDraft(firestore: Firestore, collection: string, docId: string, pick: ConflictPicker): Promise<any | null> {
    const local = await this.get(draftKey(collection, docId));
    let remote: any = null;
    try {
      const snap = await this.withTimeout(getDoc(doc(firestore, collection, docId)));
      remote = snap.exists() ? snap.data() : null;
    } catch (e) {
      // server unreachable → never block; show the local copy and let reconnect reconcile later
      console.warn('ATCDraft: server unreachable on open — using local copy', e);
      return local?.working ?? null;
    }
    if (remote == null) return local?.working ?? null;     // server has no doc yet; keep local
    return await this.reconcileOnOpen(firestore, collection, docId, remote, pick);
  }

  /** Bounded single-doc server read; returns the data, or null if it doesn't exist OR the server is unreachable. */
  async fetchRemote(firestore: Firestore, collection: string, docId: string): Promise<any | null> {
    try {
      const snap = await this.withTimeout(getDoc(doc(firestore, collection, docId)));
      return snap.exists() ? snap.data() : null;
    } catch { return null; }
  }

  /**
   * Reconcile a freshly-read server doc with the local cache when a draft is opened/refreshed.
   * Returns the value to hydrate the form with (the "winner"). On conflict it prompts via `pick`, then
   * archives the rejected version. Call this only when online (the caller has a real server read).
   */
  async reconcileOnOpen(
    firestore: Firestore, collection: string, docId: string, remote: any, pick: ConflictPicker
  ): Promise<any> {
    const cached = await this.get(draftKey(collection, docId));
    const remoteRev = (remote && remote['rev']) ?? 0;
    const decision = decideOpen(cached, remoteRev);

    if (decision === 'use-remote') {
      await this.adoptRemote(collection, docId, remote);
      return remote;
    }
    if (decision === 'use-local') {
      return cached!.working;
    }

    // conflict — both sides advanced; keep both, let the user choose which to surface
    const choice = await pick(cached!.working, remote);
    const { winner, loser } = pickWinner(choice, cached!.working, remote);
    try {
      await this.withTimeout(this.archiveLoser(firestore, collection, docId, remoteRev, loser));
      const rev = nextRev(remoteRev);
      await this.withTimeout(setDoc(doc(firestore, collection, docId), this.toServer(winner, rev)));
      await this.setBaseExact(collection, docId, winner, rev);
    } catch (e) {
      // if we couldn't persist the resolution (e.g. dropped offline mid-pick), keep local intact for next time
      console.warn('ATCDraft: could not persist conflict resolution, keeping local copy', e);
      return choice === 'mine' ? cached!.working : winner;
    }
    return winner;
  }

  /** Offline draft list: cached drafts for a collection, shaped like Firestore query docs for the existing dialogs. */
  async listLocalDocs(collection: string, predicate: (data: any) => boolean): Promise<any[]> {
    const all = await this.all();
    return all
      .filter(c => c.collection === collection && !c.pendingDelete && predicate(c.working))
      .map(c => ({ id: c.docId, data: () => c.working, ref: { path: `${collection}/${c.docId}` } }));
  }

  /**
   * Draft list for the picker: a BOUNDED server query merged with local-only / unsynced drafts, so a draft
   * saved offline that never reached the server is still selectable. Falls back to local-only if the server
   * is unreachable. `serverQuery` is the Firestore Query the caller already built (with its where-clauses).
   */
  async listDrafts(collection: string, serverQuery: any, predicate: (data: any) => boolean): Promise<any[]> {
    let serverDocs: any[] | null = null;
    try {
      serverDocs = (await this.withTimeout(getDocs(serverQuery))).docs;
    } catch (e) {
      console.warn('ATCDraft: draft-list server query failed — using local cache', e);
      serverDocs = null;
    }
    const localDocs = await this.listLocalDocs(collection, predicate);
    if (serverDocs == null) {
      return localDocs.map(l => ({ ...l, source: 'local' }));        // server unreachable → local only
    }
    const serverIds = new Set(serverDocs.map((d: any) => d.id));
    // wrap server snapshots in the same shape as local shims + tag the origin so the picker can label each draft
    const serverWrapped = serverDocs.map((d: any) => ({ id: d.id, data: () => d.data(), ref: d.ref, source: 'server' }));
    const localOnly = localDocs.filter(l => !serverIds.has(l.id)).map(l => ({ ...l, source: 'local' })); // unsynced, not on server
    return [...serverWrapped, ...localOnly];
  }

  /** Read the local working copy of a single draft (used for offline open). */
  async loadLocal(collection: string, docId: string): Promise<any | null> {
    const c = await this.get(draftKey(collection, docId));
    return c?.working ?? null;
  }

  /** On screen load: push anything dirty that never reached the server, and self-heal pending soft-deletes. */
  async flushDirty(firestore: Firestore): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    for (const c of await this.all()) {
      try {
        if (c.pendingDelete) {
          await updateDoc(doc(firestore, c.collection, c.docId), { delete: true });
          await this.remove(c.key);
        } else if (c.dirty) {
          await this.sync(firestore, c.collection, c.docId);  // conflicts stay dirty; surfaced on next open
        }
      } catch (e) {
        console.warn('ATCDraft: flush skipped one entry, will retry', e);
      }
    }
  }

  /** Submit succeeded: soft-delete the server draft and drop the local copy. Idempotent / crash-safe. */
  async finalizeSubmit(firestore: Firestore, collection: string, docId: string): Promise<void> {
    try {
      await updateDoc(doc(firestore, collection, docId), { delete: true });
      await this.remove(draftKey(collection, docId));
    } catch (e) {
      // could not soft-delete now — mark so flushDirty retries; do NOT leave a live local draft to resurface
      console.warn('ATCDraft: finalizeSubmit deferred', e);
      await this.markPendingDelete(collection, docId);
    }
  }

  /** Drop the local cache copy of a draft (e.g. after a submit that soft-deleted the server doc via its own batch). */
  async purgeLocal(collection: string, docId: string): Promise<void> {
    await this.remove(draftKey(collection, docId));
  }

  /** Map an outcome to an honest, user-facing status (no false "network" claim; conflict reassures no loss). */
  statusFor(outcome: SyncOutcome): { message: string; code: number } {
    switch (outcome) {
      case 'created':
      case 'updated':
      case 'unchanged':
        return { message: 'Draft saved.', code: 1 };
      case 'took-remote':
        return { message: 'Loaded the latest version saved on another device.', code: 1 };
      case 'conflict':
        return { message: 'Also edited on another device — tap Retry to save.', code: -1 };
      case 'pending-local':
        return { message: 'Saved on this device — will sync automatically.', code: 1 };
      default:
        return { message: 'Couldn\'t save — kept on this device. Tap Retry.', code: -1 };
    }
  }

  // ---- internal: local cache bookkeeping --------------------------------------------------------

  // the snapshot we pushed becomes the new base; `working` may be newer (user kept typing) so recompute dirty
  private async advanceBase(collection: string, docId: string, pushed: any, rev: number): Promise<void> {
    const key = draftKey(collection, docId);
    const c = await this.get(key);
    if (!c) return;
    const base = this.clone(pushed);
    await this.put({ ...c, base, baseRev: rev, dirty: computeDirty(c.working, base) });
  }

  // adopt the server's version wholesale (local was clean, or remote won)
  private async adoptRemote(collection: string, docId: string, remote: any): Promise<void> {
    const key = draftKey(collection, docId);
    const c = await this.get(key);
    const snapshot = this.clone(remote);
    const rev = (remote && remote['rev']) ?? 0;
    await this.put({
      key, collection, docId,
      working: snapshot, base: this.clone(snapshot), baseRev: rev,
      dirty: false, deviceId: this.deviceId, updatedAt: Date.now(),
      pendingDelete: c?.pendingDelete,
    });
  }

  // after a conflict resolution: working == base == winner, clean, at the new rev
  private async setBaseExact(collection: string, docId: string, winner: any, rev: number): Promise<void> {
    const key = draftKey(collection, docId);
    const c = await this.get(key);
    const snapshot = this.clone(winner);
    await this.put({
      key, collection, docId,
      working: snapshot, base: this.clone(snapshot), baseRev: rev,
      dirty: false, deviceId: this.deviceId, updatedAt: Date.now(),
      pendingDelete: c?.pendingDelete,
    });
  }

  private async markPendingDelete(collection: string, docId: string): Promise<void> {
    const key = draftKey(collection, docId);
    const c = await this.get(key);
    if (c) await this.put({ ...c, pendingDelete: true });
  }

  // the rejected side of a conflict, parked where it can be recovered — never silently dropped
  private async archiveLoser(firestore: Firestore, collection: string, docId: string, rev: number, loser: any): Promise<void> {
    const ref = doc(firestore, `${collection}/${docId}/conflicts`, String(rev || Date.now()));
    await setDoc(ref, { ...this.clone(loser), archivedRev: rev, archivedAt: serverTimestamp(), reason: 'two-device-conflict' });
  }

  // add the server-only bookkeeping fields to a draft payload just before a Firestore write
  private toServer(working: any, rev: number): any {
    const out = { ...working, rev, lastWriterDevice: this.deviceId, serverUpdatedAt: serverTimestamp() };
    // clone()'s JSON fallback (old WebKit) turns Date fields into ISO strings; a
    // string lastupdated lands in Firestore's STRING type bracket, where the live
    // dashboard's `lastupdated >= <date>` range filter can never match it and the
    // draft silently vanishes from the Draft ATC count. Re-coerce just before the
    // write so the server always stores a real timestamp.
    if (out.lastupdated != null && !(out.lastupdated instanceof Date) && typeof out.lastupdated?.toDate !== 'function') {
      const d = new Date(out.lastupdated);
      if (!Number.isNaN(d.getTime())) { out.lastupdated = d; }
    }
    return out;
  }

  private clone<T>(v: T): T {
    try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v ?? null)); }
  }

  // bound a Firestore promise so a hung/SW-corrupted RPC rejects fast instead of hanging the draft path forever
  private withTimeout<T>(p: Promise<T>, ms = FS_TIMEOUT_MS): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = setTimeout(() => reject(new Error('firestore-timeout')), ms);
      p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
    });
  }

  // ---- internal: IndexedDB (mirrors MediaCacheService style) -----------------------------------

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async get(key: string): Promise<CachedDraft | null> {
    try {
      const db = await this.open();
      const row = await new Promise<CachedDraft | undefined>((resolve, reject) => {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result as CachedDraft | undefined);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return row ?? null;
    } catch { return null; }
  }

  private async all(): Promise<CachedDraft[]> {
    try {
      const db = await this.open();
      const rows = await new Promise<CachedDraft[]>((resolve, reject) => {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        r.onsuccess = () => resolve(r.result as CachedDraft[]);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return rows ?? [];
    } catch { return []; }
  }

  private async put(entry: CachedDraft): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(entry);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    db.close();
  }

  private async remove(key: string): Promise<void> {
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
      db.close();
    } catch (e) { console.warn('ATCDraft: remove failed', e); }
  }
}
