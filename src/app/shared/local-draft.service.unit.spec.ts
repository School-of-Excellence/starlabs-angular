// local-draft.service.unit.spec.ts — unit tests for the offline form-draft cache.
//
// WHY UNIT: the service is a thin, synchronous wrapper over localStorage — no Firestore, no TestBed, just
// `new LocalDraftService()`. Karma runs in a real Chrome, so localStorage is REAL here rather than mocked,
// which means these tests exercise the actual storage semantics (string round-tripping, key enumeration)
// instead of a fake that agrees with itself.
//
// WHAT IT PROTECTS: this is a participant's unsent work. The failure that matters is a draft that cannot be
// read back, or one that survives deletion and resurfaces over newer data.
import { LocalDraftService } from './local-draft.service';

const svc = new LocalDraftService();
const PREFIX = 'form_draft_';

/** Only clear OUR keys — wiping all of localStorage could disturb whatever else the harness keeps there. */
const clearDrafts = () => {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
};

describe('LocalDraftService', () => {
  beforeEach(clearDrafts);
  afterAll(clearDrafts);

  // =============================================================================================
  // SHU-11 — save and read back
  // =============================================================================================
  describe('SHU-11 save / get', () => {
    it('round-trips a draft object', () => {
      svc.save('doc1', { answer: 'yes', score: 7 }, { formId: 'f1', profileId: 'p1' });
      expect(svc.get('doc1')).toEqual({ answer: 'yes', score: 7 });
    });

    it('round-trips nested structures and arrays', () => {
      const data = { items: [1, 2, { deep: true }], meta: { a: null } };
      svc.save('doc2', data, { formId: 'f1', profileId: 'p1' });
      expect(svc.get('doc2')).toEqual(data);
    });

    it('returns null for a document with no draft', () => {
      expect(svc.get('never-saved')).toBeNull();
    });

    it('overwrites an existing draft rather than merging into it', () => {
      svc.save('doc3', { a: 1, b: 2 }, { formId: 'f1', profileId: 'p1' });
      svc.save('doc3', { a: 9 }, { formId: 'f1', profileId: 'p1' });
      expect(svc.get('doc3')).toEqual({ a: 9 });   // `b` must be gone, not retained
    });

    it('returns null instead of throwing when the stored value is corrupt', () => {
      // Someone else's code, a truncated write, or a manual edit in devtools.
      localStorage.setItem(PREFIX + 'bad', '{not valid json');
      expect(svc.get('bad')).toBeNull();
    });

    it('keeps drafts for different documents apart', () => {
      svc.save('a', { v: 'A' }, { formId: 'f', profileId: 'p' });
      svc.save('b', { v: 'B' }, { formId: 'f', profileId: 'p' });
      expect(svc.get('a')).toEqual({ v: 'A' });
      expect(svc.get('b')).toEqual({ v: 'B' });
    });
  });

  // =============================================================================================
  // SHU-12 — metadata
  // =============================================================================================
  describe('SHU-12 getMeta', () => {
    it('stores the form and profile it was saved against', () => {
      svc.save('doc1', { a: 1 }, { formId: 'form-9', profileId: 'prof-9' });
      const meta = svc.getMeta('doc1')!;
      expect(meta.formId).toBe('form-9');
      expect(meta.profileId).toBe('prof-9');
    });

    it('stamps savedAt and echoes the docId back', () => {
      const before = Date.now();
      svc.save('doc1', { a: 1 }, { formId: 'f', profileId: 'p' });
      const meta = svc.getMeta('doc1')!;
      expect(meta.draftDocId).toBe('doc1');
      expect(meta.savedAt).toBeGreaterThanOrEqual(before);
      expect(meta.savedAt).toBeLessThanOrEqual(Date.now());
    });

    it('accepts null form and profile ids', () => {
      svc.save('doc1', { a: 1 }, { formId: null, profileId: null });
      expect(svc.getMeta('doc1')!.formId).toBeNull();
    });

    it('returns null when there is no metadata', () => {
      expect(svc.getMeta('never-saved')).toBeNull();
    });

    it('refreshes savedAt on re-save', async () => {
      svc.save('doc1', { a: 1 }, { formId: 'f', profileId: 'p' });
      const first = svc.getMeta('doc1')!.savedAt;
      await new Promise((r) => setTimeout(r, 5));
      svc.save('doc1', { a: 2 }, { formId: 'f', profileId: 'p' });
      expect(svc.getMeta('doc1')!.savedAt).toBeGreaterThanOrEqual(first);
    });
  });

  // =============================================================================================
  // SHU-13 — delete removes BOTH keys
  // =============================================================================================
  describe('SHU-13 delete', () => {
    it('removes the draft and its metadata together', () => {
      // Leaving orphaned metadata behind would make listPending/hasDraft disagree with get().
      svc.save('doc1', { a: 1 }, { formId: 'f', profileId: 'p' });
      svc.delete('doc1');
      expect(svc.get('doc1')).toBeNull();
      expect(svc.getMeta('doc1')).toBeNull();
      expect(svc.hasDraft('doc1')).toBeFalse();
    });

    it('is a no-op for a document with no draft', () => {
      expect(() => svc.delete('never-saved')).not.toThrow();
    });

    it('leaves the drafts of other documents intact', () => {
      svc.save('keep', { v: 1 }, { formId: 'f', profileId: 'p' });
      svc.save('drop', { v: 2 }, { formId: 'f', profileId: 'p' });
      svc.delete('drop');
      expect(svc.get('keep')).toEqual({ v: 1 });
    });
  });

  // =============================================================================================
  // SHU-14 — listPending / hasDraft
  // =============================================================================================
  describe('SHU-14 listPending / hasDraft', () => {
    it('lists the docIds that have a draft', () => {
      svc.save('a', { v: 1 }, { formId: 'f', profileId: 'p' });
      svc.save('b', { v: 2 }, { formId: 'f', profileId: 'p' });
      expect(svc.listPending().sort()).toEqual(['a', 'b']);
    });

    it('lists each document ONCE, not twice for its metadata key', () => {
      // Both keys share the prefix; only the non-_meta one counts. Getting this wrong would double every
      // "you have N unsent drafts" count the user sees.
      svc.save('a', { v: 1 }, { formId: 'f', profileId: 'p' });
      expect(svc.listPending()).toEqual(['a']);
    });

    it('returns an empty list when nothing is pending', () => {
      expect(svc.listPending()).toEqual([]);
    });

    it('ignores unrelated localStorage keys', () => {
      localStorage.setItem('some_other_app_key', 'x');
      svc.save('a', { v: 1 }, { formId: 'f', profileId: 'p' });
      expect(svc.listPending()).toEqual(['a']);
      localStorage.removeItem('some_other_app_key');
    });

    it('reports hasDraft accurately', () => {
      expect(svc.hasDraft('a')).toBeFalse();
      svc.save('a', { v: 1 }, { formId: 'f', profileId: 'p' });
      expect(svc.hasDraft('a')).toBeTrue();
    });

    it('treats a draft saved as null as PRESENT, because the key exists', () => {
      // JSON.stringify(null) is the string "null", not absence — so hasDraft is true while get returns null.
      // Pinned so nobody uses hasDraft as a proxy for "get will give me something".
      svc.save('a', null, { formId: 'f', profileId: 'p' });
      expect(svc.hasDraft('a')).toBeTrue();
      expect(svc.get('a')).toBeNull();
    });
  });
});
