import { Injectable } from '@angular/core';

// one not-yet-uploaded media blob kept locally so offline recordings/images survive an app close
export interface PendingMedia {
  id: string;                       // deterministic local id (draftId + kind + index)
  draftId: string;                  // temporary_ATC doc id this media belongs to
  kind: 'audio' | 'note' | 'atc';
  blob: Blob;
  name: string;                     // file name used by the storage path
}

const DB_NAME = 'atc_media_cache';
const STORE = 'pending';

@Injectable({ providedIn: 'root' })
export class MediaCacheService {

  // open (or create) the IndexedDB store
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // replace all locally-cached media for a draft with the current pending set (non-fatal on failure/quota)
  async replaceDraft(draftId: string, records: PendingMedia[]): Promise<void> {
    try {
      await this.deleteByDraft(draftId);
      if (records.length === 0) return;
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        const store = t.objectStore(STORE);
        records.forEach(r => store.put(r));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
      db.close();
    } catch (e) {
      // storage full/unavailable (e.g. private mode) — keep the in-memory copy, don't crash the save
      console.warn('MediaCache: could not store media locally', e);
    }
  }

  // all pending media across drafts
  async listAll(): Promise<PendingMedia[]> {
    try {
      const db = await this.open();
      const all = await new Promise<PendingMedia[]>((resolve, reject) => {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        r.onsuccess = () => resolve(r.result as PendingMedia[]);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return all ?? [];
    } catch { return []; }
  }

  // pending media for one draft
  async listByDraft(draftId: string): Promise<PendingMedia[]> {
    return (await this.listAll()).filter(r => r.draftId === draftId);
  }

  // drop all locally-cached media for a draft (after upload or submit)
  async deleteByDraft(draftId: string): Promise<void> {
    try {
      const records = await this.listAll();
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        const store = t.objectStore(STORE);
        records.filter(r => r.draftId === draftId).forEach(r => store.delete(r.id));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
      db.close();
    } catch (e) {
      console.warn('MediaCache: delete failed', e);
    }
  }
}
