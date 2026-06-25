import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { getAuth } from '@angular/fire/auth';
import { environment } from '../../environments/environment';

// what actually happened to a draft write, so the screen can show an honest status
export type DraftWriteOutcome = 'primary' | 'fallback' | 'pending-local' | 'error';

// a draft awaiting confirmation that it reached the Firestore server
interface OutboxEntry {
  key: string;          // `${collection}/${docId}` — stable, idempotent
  collection: string;
  docId: string;
  data: any;            // must be structured-cloneable (no serverTimestamp sentinels, no Blobs)
  savedAt: number;
}

const DB_NAME = 'atc_draft_outbox';   // our OWN IndexedDB — independent of Firestore's persistence
const STORE = 'drafts';
const WRITE_TIMEOUT_MS = 8000;        // the bricked SDK client hangs instead of rejecting — bound the wait
const FIRESTORE_DB_ID = 'firestore-atc';

/**
 * Survives Firestore's fatal internal assertion ("INTERNAL ASSERTION FAILED: Unexpected state", b815/ca9)
 * WITHOUT a page reload:
 *   1) every draft is mirrored to a durable local outbox first, so it can never be lost;
 *   2) the live Firestore client is used while healthy;
 *   3) if that client is bricked (or hangs), the draft is written to the server via a direct REST call
 *      using the signed-in user's token — bypassing the broken SDK client entirely;
 *   4) anything that still didn't reach the server is flushed on the next screen load.
 */
@Injectable({ providedIn: 'root' })
export class FirestoreRecoveryService {

  // true once the SDK has thrown its internal assertion this session (the client is bricked)
  readonly degraded$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.registerAssertionWatch();
  }

  isDegraded(): boolean { return this.degraded$.value; }

  // the assertion is thrown from the SDK's async queue, so a local try/catch around setDoc can miss it —
  // recognise it by message wherever it surfaces
  isFatalFirestoreError(e: any): boolean {
    const msg = `${(e && (e.message || e.code)) || e || ''}`;
    return /INTERNAL ASSERTION FAILED|Unexpected state/i.test(msg);
  }

  // catch the assertion globally (it usually arrives as an uncaught error / unhandled rejection)
  private registerAssertionWatch(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (ev: any) => {
      if (this.isFatalFirestoreError(ev?.error ?? ev?.message)) this.markDegraded();
    });
    window.addEventListener('unhandledrejection', (ev: any) => {
      if (this.isFatalFirestoreError(ev?.reason)) this.markDegraded();
    });
  }

  private markDegraded(): void {
    if (!this.degraded$.value) {
      console.warn('Firestore client degraded (internal assertion) — routing draft writes through the recovery path.');
      this.degraded$.next(true);
    }
  }

  /**
   * Save a draft so it can NEVER be lost. Durable local copy first, then the server (live client,
   * falling back to a direct REST write if the client is bricked). Never throws.
   */
  async writeDraft(firestore: Firestore, collection: string, docId: string, data: any): Promise<DraftWriteOutcome> {
    const key = `${collection}/${docId}`;

    // 1) durable local copy — survives reload, browser close, and the SDK crash (it's our own store)
    try {
      await this.put({ key, collection, docId, data, savedAt: Date.now() });
    } catch (e) {
      console.warn('Draft outbox: could not store draft locally', e);
    }

    // 2) live client while it is healthy and online
    if (!this.isDegraded() && navigator.onLine) {
      try {
        await this.withTimeout(setDoc(doc(firestore, collection, docId), data), WRITE_TIMEOUT_MS);
        await this.remove(key);
        return 'primary';
      } catch (e) {
        if (this.isFatalFirestoreError(e)) this.markDegraded();
        // fall through to the recovery path
      }
    }

    // 3) recovery path: direct REST write with the user's token (bypasses the bricked SDK client)
    if (navigator.onLine) {
      const ok = await this.restWrite(collection, docId, data);
      if (ok) { await this.remove(key); return 'fallback'; }
    }

    // 4) offline, or REST failed — the draft stays safe in the outbox and flushes on next load
    return 'pending-local';
  }

  // push any drafts that never reached the server (e.g. saved during a bricked session). Call on screen load.
  async flushPending(firestore: Firestore): Promise<void> {
    const pending = await this.all();
    for (const e of pending) {
      try {
        if (!this.isDegraded() && navigator.onLine) {
          await this.withTimeout(setDoc(doc(firestore, e.collection, e.docId), e.data), WRITE_TIMEOUT_MS);
          await this.remove(e.key);
          continue;
        }
      } catch (err) {
        if (this.isFatalFirestoreError(err)) this.markDegraded();
      }
      if (navigator.onLine) {
        const ok = await this.restWrite(e.collection, e.docId, e.data);
        if (ok) await this.remove(e.key);
      }
    }
  }

  // map an outcome to an honest, user-facing draft status (no more false "network" message)
  draftStatusFor(outcome: DraftWriteOutcome): { message: string; code: number } {
    switch (outcome) {
      case 'primary':
      case 'fallback':
        return { message: 'Draft saved.', code: 1 };
      case 'pending-local':
        return { message: 'Saved on this device — will sync automatically.', code: 1 };
      default:
        return { message: 'Could not save the draft just now — your changes are kept on this device and will retry.', code: -1 };
    }
  }

  // ---- direct REST write (server-side, auth'd, immune to the SDK assertion) ----
  private async restWrite(collection: string, docId: string, data: any): Promise<boolean> {
    try {
      const user = getAuth().currentUser;
      if (!user) return false;
      const token = await user.getIdToken();
      const projectId = environment.firebase.projectId;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${FIRESTORE_DB_ID}/documents/${collection}/${docId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: this.toFields(data) })
      });
      return res.ok;
    } catch (e) {
      console.warn('Recovery REST write failed (will retry on next load):', e);
      return false;
    }
  }

  // JS value -> Firestore REST typed value
  private toValue(v: any): any {
    if (v === null || v === undefined) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    const t = typeof v;
    if (t === 'boolean') return { booleanValue: v };
    if (t === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (t === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(x => this.toValue(x)) } };
    if (t === 'object') return { mapValue: { fields: this.toFields(v) } };
    return { stringValue: String(v) };
  }

  private toFields(obj: any): any {
    const fields: any = {};
    Object.keys(obj ?? {}).forEach(k => { fields[k] = this.toValue(obj[k]); });
    return fields;
  }

  // ---- durable outbox in our own IndexedDB ----
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

  private async put(entry: OutboxEntry): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(entry);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    db.close();
  }

  private async all(): Promise<OutboxEntry[]> {
    try {
      const db = await this.open();
      const rows = await new Promise<OutboxEntry[]>((resolve, reject) => {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        r.onsuccess = () => resolve(r.result as OutboxEntry[]);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return rows ?? [];
    } catch { return []; }
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
    } catch (e) { console.warn('Draft outbox: remove failed', e); }
  }

  // the bricked client hangs rather than rejecting — don't let a save freeze the screen
  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = setTimeout(() => reject(new Error('firestore-write-timeout')), ms);
      p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
    });
  }
}
