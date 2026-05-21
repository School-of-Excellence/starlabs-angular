import { Injectable } from '@angular/core';

const DRAFT_PREFIX = 'form_draft_';
const META_SUFFIX = '_meta';

export interface DraftMeta {
  savedAt: number;
  formId: string | null;
  profileId: string | null;
  draftDocId: string;
}

@Injectable({ providedIn: 'root' })
export class LocalDraftService {

  save(docId: string, data: any, meta: Omit<DraftMeta, 'savedAt' | 'draftDocId'>): void {
    try {
      const payload: DraftMeta = { ...meta, savedAt: Date.now(), draftDocId: docId };
      localStorage.setItem(DRAFT_PREFIX + docId, JSON.stringify(data));
      localStorage.setItem(DRAFT_PREFIX + docId + META_SUFFIX, JSON.stringify(payload));
    } catch (e) {
      // localStorage can throw if storage is full (QuotaExceededError).
      // Non-fatal — Firestore will still try to sync.
      console.warn('LocalDraftService: could not save draft', e);
    }
  }

  get(docId: string): any | null {
    try {
      const raw = localStorage.getItem(DRAFT_PREFIX + docId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  getMeta(docId: string): DraftMeta | null {
    try {
      const raw = localStorage.getItem(DRAFT_PREFIX + docId + META_SUFFIX);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  delete(docId: string): void {
    localStorage.removeItem(DRAFT_PREFIX + docId);
    localStorage.removeItem(DRAFT_PREFIX + docId + META_SUFFIX);
  }

  // Returns all draft docIds that have a pending local draft saved. 
  listPending(): string[] {
    const docIds: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX) && !key.endsWith(META_SUFFIX)) {
        docIds.push(key.replace(DRAFT_PREFIX, ''));
      }
    }
    return docIds;
  }

  hasDraft(docId: string): boolean {
    return localStorage.getItem(DRAFT_PREFIX + docId) !== null;
  }
}