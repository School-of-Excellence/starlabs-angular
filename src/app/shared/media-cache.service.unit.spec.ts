// media-cache.service.unit.spec.ts — unit tests for the offline pending-media cache.
//
// ATC SCOPE — read this first. The project rule is that ATC DATA is off-limits to automated testing. This
// file honours that: every blob and record below is SYNTHETIC, built inline from a string. No ATC
// Firestore collection is read, written or seeded, and no real recording is used. The store under test is
// a browser-local IndexedDB database, not Firestore. Tested on explicit operator approval, 2026-09-10.
//
// WHY UNIT: the service is a thin async wrapper over IndexedDB, and Karma runs a real Chrome — so these
// tests exercise the ACTUAL storage semantics (keyPath collisions, transaction completion, getAll
// ordering) rather than a fake that agrees with itself.
//
// WHAT IT PROTECTS: this is a participant's not-yet-uploaded media, kept so an offline recording survives
// an app close. The failures that matter are media that cannot be read back, media that survives a
// deletion, and one draft's cleanup taking another draft's files with it.
import { MediaCacheService, PendingMedia } from './media-cache.service';

const svc = new MediaCacheService();

const media = (over: Partial<PendingMedia> = {}): PendingMedia => ({
  id: 'd1_note_0',
  draftId: 'd1',
  kind: 'note',
  blob: new Blob(['synthetic bytes'], { type: 'text/plain' }),
  name: 'note-0.txt',
  ...over,
});

/** Remove every draft this file creates, so runs cannot pollute each other. */
const cleanup = async () => {
  for (const d of ['d1', 'd2', 'd3']) await svc.deleteByDraft(d);
};

describe('MediaCacheService', () => {
  beforeEach(async () => await cleanup());
  afterAll(async () => await cleanup());

  // =============================================================================================
  // SHU-91 — store and read back
  // =============================================================================================
  describe('SHU-91 replaceDraft / listByDraft', () => {
    it('stores records and reads them back for that draft', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a' }), media({ id: 'd1_b' })]);
      const got = await svc.listByDraft('d1');
      expect(got.map((r) => r.id).sort()).toEqual(['d1_a', 'd1_b']);
    });

    it('preserves the blob contents through the round trip', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a', blob: new Blob(['hello cache']) })]);
      const [rec] = await svc.listByDraft('d1');
      expect(await rec.blob.text()).toBe('hello cache');
    });

    it('preserves the fields the upload path depends on', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a', kind: 'audio', name: 'clip.webm' })]);
      const [rec] = await svc.listByDraft('d1');
      expect(rec.kind).toBe('audio');
      expect(rec.name).toBe('clip.webm');
      expect(rec.draftId).toBe('d1');
    });

    it('REPLACES the previous set rather than appending to it', async () => {
      // The method is replaceDraft, not addToDraft: a re-save with one file must not leave the old three.
      await svc.replaceDraft('d1', [media({ id: 'd1_a' }), media({ id: 'd1_b' })]);
      await svc.replaceDraft('d1', [media({ id: 'd1_c' })]);
      expect((await svc.listByDraft('d1')).map((r) => r.id)).toEqual(['d1_c']);
    });

    it('clears the draft when given an empty set', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a' })]);
      await svc.replaceDraft('d1', []);
      expect(await svc.listByDraft('d1')).toEqual([]);
    });

    it('returns an empty list for a draft that was never cached', async () => {
      expect(await svc.listByDraft('never-seen')).toEqual([]);
    });
  });

  // =============================================================================================
  // SHU-92 — drafts are isolated from each other
  // =============================================================================================
  describe('SHU-92 draft isolation', () => {
    it('keeps records of different drafts apart', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a', draftId: 'd1' })]);
      await svc.replaceDraft('d2', [media({ id: 'd2_a', draftId: 'd2' })]);
      expect((await svc.listByDraft('d1')).map((r) => r.id)).toEqual(['d1_a']);
      expect((await svc.listByDraft('d2')).map((r) => r.id)).toEqual(['d2_a']);
    });

    it('does not disturb another draft when one is replaced', async () => {
      // replaceDraft deletes by draftId first; a wrong predicate here would wipe a colleague's pending
      // upload rather than only this draft's.
      await svc.replaceDraft('d1', [media({ id: 'd1_a', draftId: 'd1' })]);
      await svc.replaceDraft('d2', [media({ id: 'd2_a', draftId: 'd2' })]);
      await svc.replaceDraft('d1', [media({ id: 'd1_b', draftId: 'd1' })]);
      expect((await svc.listByDraft('d2')).map((r) => r.id)).toEqual(['d2_a']);
    });

    it('lists every draft together in listAll', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a', draftId: 'd1' })]);
      await svc.replaceDraft('d2', [media({ id: 'd2_a', draftId: 'd2' })]);
      const ids = (await svc.listAll()).map((r) => r.id);
      expect(ids).toContain('d1_a');
      expect(ids).toContain('d2_a');
    });
  });

  // =============================================================================================
  // SHU-93 — deletion
  // =============================================================================================
  describe('SHU-93 deleteByDraft', () => {
    it('removes every record of that draft', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a' }), media({ id: 'd1_b' })]);
      await svc.deleteByDraft('d1');
      expect(await svc.listByDraft('d1')).toEqual([]);
    });

    it('leaves other drafts untouched', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a', draftId: 'd1' })]);
      await svc.replaceDraft('d2', [media({ id: 'd2_a', draftId: 'd2' })]);
      await svc.deleteByDraft('d1');
      expect((await svc.listByDraft('d2')).map((r) => r.id)).toEqual(['d2_a']);
    });

    it('is a no-op for a draft that has nothing cached', async () => {
      await expectAsync(svc.deleteByDraft('never-seen')).toBeResolved();
    });

    it('is idempotent', async () => {
      await svc.replaceDraft('d1', [media({ id: 'd1_a' })]);
      await svc.deleteByDraft('d1');
      await expectAsync(svc.deleteByDraft('d1')).toBeResolved();
      expect(await svc.listByDraft('d1')).toEqual([]);
    });
  });

  // =============================================================================================
  // SHU-94 — the id is the primary key
  // =============================================================================================
  describe('SHU-94 keying', () => {
    it('stores one record per id — a repeated id overwrites rather than duplicating', async () => {
      // The store uses keyPath 'id', and the ids are documented as deterministic
      // (draftId + kind + index). A re-save of the same slot must update it, not accumulate copies.
      await svc.replaceDraft('d1', [
        media({ id: 'd1_same', name: 'first.txt' }),
        media({ id: 'd1_same', name: 'second.txt' }),
      ]);
      const got = await svc.listByDraft('d1');
      expect(got.length).toBe(1);
      expect(got[0].name).toBe('second.txt');   // last write wins
    });

    it('accepts all three declared kinds', async () => {
      await svc.replaceDraft('d3', [
        media({ id: 'd3_a', draftId: 'd3', kind: 'audio' }),
        media({ id: 'd3_b', draftId: 'd3', kind: 'note' }),
        media({ id: 'd3_c', draftId: 'd3', kind: 'atc' }),
      ]);
      expect((await svc.listByDraft('d3')).map((r) => r.kind).sort()).toEqual(['atc', 'audio', 'note']);
    });
  });

  // =============================================================================================
  // SHU-95 — degradation is NOT covered here, deliberately
  // =============================================================================================
  //
  // The service wraps every IndexedDB call in try/catch so a full quota or a private-mode window keeps
  // the in-memory copy instead of crashing the save — the source comment is explicit about it. That path
  // cannot be exercised from a spec: `indexedDB` is a read-only global in Chrome, so assigning a throwing
  // stub over it silently does nothing and the test would run against the REAL database while appearing
  // to prove degradation. A vacuous green is worse than an acknowledged gap, so it is left uncovered and
  // recorded here. Making it testable would mean injecting the factory — an application change.
});
