// atc-draft.logic.unit.spec.ts — unit tests for the local-first draft reconciliation rules.
//
// ATC SCOPE — read this first. The project rule is that ATC DATA is off-limits to automated testing. This
// file honours that: every input below is SYNTHETIC, constructed inline. No ATC Firestore collection is
// read, written or seeded; nothing here touches a database at all. The module under test is itself pure —
// its own header says it exists so these decisions "can be unit-tested in isolation against synthetic
// data — never touching real ATC collections". Tested on explicit operator approval, 2026-09-10.
//
// WHY UNIT: this is the logic that decides whether a participant's unsent edits are kept, adopted over, or
// flagged as a conflict. Getting it wrong loses work silently. It imports nothing — no Angular, no
// Firebase — so every rule is one function call away, and the failure modes (a clean local copy wrongly
// reported dirty, a conflict silently resolved) are invisible from the UI until someone loses an edit.
import {
  CachedDraft,
  VOLATILE_FIELDS,
  canonical,
  computeDirty,
  decideOpen,
  decideSync,
  draftKey,
  nextRev,
  pickWinner,
  sameContent,
} from './atc-draft.logic';

const draft = (over: Partial<CachedDraft> = {}): CachedDraft => ({
  key: 'c/d', collection: 'c', docId: 'd',
  working: { a: 1 }, base: { a: 1 }, baseRev: 1,
  dirty: false, deviceId: 'dev1', updatedAt: 0,
  ...over,
});

describe('atc-draft.logic', () => {
  // =============================================================================================
  // SHU-85 — keys and revisions
  // =============================================================================================
  describe('SHU-85 draftKey / nextRev', () => {
    it('builds a stable, idempotent key from collection and doc id', () => {
      expect(draftKey('temporary_forms', 'abc')).toBe('temporary_forms/abc');
      expect(draftKey('c', 'd')).toBe(draftKey('c', 'd'));
    });

    it('starts an absent revision at 1', () => {
      // A doc that does not exist server-side is created AT rev 1, never rev 0.
      expect(nextRev(null)).toBe(1);
      expect(nextRev(undefined)).toBe(1);
      expect(nextRev(0)).toBe(1);
    });

    it('increments an existing revision', () => {
      expect(nextRev(3)).toBe(4);
    });

    it('treats a nonsensical revision as absent rather than propagating it', () => {
      expect(nextRev(-5)).toBe(1);
      expect(nextRev('7' as any)).toBe(1);
    });
  });

  // =============================================================================================
  // SHU-86 — canonical serialisation is the basis of every equality decision
  // =============================================================================================
  describe('SHU-86 canonical', () => {
    it('is independent of key order', () => {
      // Firestore and IndexedDB round-trips reorder keys; without this every reload would look dirty.
      expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
    });

    it('strips every volatile field', () => {
      const withVolatile: any = { a: 1 };
      VOLATILE_FIELDS.forEach((f) => (withVolatile[f] = 'noise'));
      expect(canonical(withVolatile)).toBe(canonical({ a: 1 }));
    });

    it('normalises null and undefined to the same thing', () => {
      expect(canonical({ a: null })).toBe(canonical({ a: undefined }));
    });

    it('recurses into arrays and nested objects', () => {
      expect(canonical({ xs: [{ b: 1, a: 2 }] })).toBe(canonical({ xs: [{ a: 2, b: 1 }] }));
    });

    it('renders a Date and a Firestore Timestamp identically', () => {
      const iso = '2026-09-10T00:00:00.000Z';
      const d = new Date(iso);
      const ts = { seconds: d.getTime() / 1000, nanoseconds: 0, toDate: () => d };
      expect(canonical({ at: ts })).toBe(canonical({ at: d }));
    });

    it('renders the IndexedDB-serialized timestamp the same as the native one', () => {
      // The clone round-trip turns a Timestamp into a plain map; both must canonicalise alike or a draft
      // would read as dirty purely for having been stored locally.
      const d = new Date('2026-09-10T00:00:00.000Z');
      const native = { seconds: d.getTime() / 1000, nanoseconds: 0, toDate: () => d };
      const stored = { type: 'firestore/timestamp/1.0', seconds: d.getTime() / 1000, nanoseconds: 0 };
      expect(canonical({ at: stored })).toBe(canonical({ at: native }));
    });

    it('renders a DocumentReference as its path, native and stored forms alike', () => {
      const native = { type: 'document', path: 'profile_data/p1' };
      const stored = { type: 'firestore/documentReference/1.0', referencePath: 'profile_data/p1' };
      expect(canonical({ ref: stored })).toBe(canonical({ ref: native }));
      expect(canonical({ ref: native })).toContain('ref:profile_data/p1');
    });

    it('does NOT recurse into a DocumentReference, whose object graph is circular', () => {
      // THE REGRESSION THIS GUARDS, per the source comment: a real DocumentReference holds the Firestore
      // instance in its own fields, and that graph is circular. Recursing it threw "Maximum call stack
      // size exceeded", so the draft was neither stored nor synced — work simply vanished. The
      // `type === 'document'` short-circuit must stay ABOVE the generic recursion.
      const circular: any = { type: 'document', path: 'a/b' };
      circular.firestore = { app: {} };
      circular.firestore.app.self = circular.firestore;   // genuinely circular
      expect(() => canonical({ ref: circular })).not.toThrow();
      expect(canonical({ ref: circular })).toContain('ref:a/b');
    });

    it('distinguishes genuinely different content', () => {
      expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
    });
  });

  // =============================================================================================
  // SHU-87 — content equality and dirty detection
  // =============================================================================================
  describe('SHU-87 sameContent / computeDirty', () => {
    it('treats a re-save with only volatile changes as unchanged', () => {
      // An idempotent re-save, or a clock tick, must not register as a real edit.
      expect(sameContent({ a: 1, rev: 1 }, { a: 1, rev: 9 })).toBeTrue();
    });

    it('treats a real edit as different', () => {
      expect(sameContent({ a: 1 }, { a: 2 })).toBeFalse();
    });

    it('reports dirty when there is no base yet', () => {
      // Never synced, so everything local is unsynced by definition.
      expect(computeDirty({ a: 1 }, null)).toBeTrue();
      expect(computeDirty({ a: 1 }, undefined as any)).toBeTrue();
    });

    it('reports clean when working matches base', () => {
      expect(computeDirty({ a: 1 }, { a: 1 })).toBeFalse();
    });

    it('reports dirty when working diverges from base', () => {
      expect(computeDirty({ a: 2 }, { a: 1 })).toBeTrue();
    });
  });

  // =============================================================================================
  // SHU-88 — decideSync: never discards local edits
  // =============================================================================================
  describe('SHU-88 decideSync', () => {
    it('keeps work on the device when offline, whatever the server says', () => {
      expect(decideSync({ baseRev: 1, dirty: true }, 5, false)).toBe('pending-local');
      expect(decideSync({ baseRev: 1, dirty: false }, null, false)).toBe('pending-local');
    });

    it('creates the doc when the server has none', () => {
      expect(decideSync({ baseRev: 0, dirty: true }, null, true)).toBe('created');
      expect(decideSync({ baseRev: 0, dirty: false }, undefined as any, true)).toBe('created');
    });

    it('does nothing when clean and level with the server', () => {
      expect(decideSync({ baseRev: 3, dirty: false }, 3, true)).toBe('unchanged');
    });

    it('adopts the remote copy when clean and the server has moved on', () => {
      // Safe: there are no local edits to lose.
      expect(decideSync({ baseRev: 3, dirty: false }, 4, true)).toBe('took-remote');
    });

    it('pushes when dirty and based on the latest revision', () => {
      expect(decideSync({ baseRev: 3, dirty: true }, 3, true)).toBe('updated');
    });

    it('flags a CONFLICT when dirty and the server has moved on — never clobbers either side', () => {
      // The single most important rule in the module: two people edited, so neither write is discarded.
      expect(decideSync({ baseRev: 3, dirty: true }, 4, true)).toBe('conflict');
    });

    it('pushes rather than conflicting when the local base is somehow ahead', () => {
      expect(decideSync({ baseRev: 5, dirty: true }, 4, true)).toBe('updated');
    });
  });

  // =============================================================================================
  // SHU-89 — decideOpen: what to render when a draft is reopened
  // =============================================================================================
  describe('SHU-89 decideOpen', () => {
    it('takes the server copy when there is no local draft', () => {
      expect(decideOpen(null, 3)).toBe('use-remote');
    });

    it('takes the server copy when the local draft is clean', () => {
      // Local matches base, so the server is authoritative whether it is level or newer.
      expect(decideOpen(draft({ dirty: false, baseRev: 3 }), 3)).toBe('use-remote');
      expect(decideOpen(draft({ dirty: false, baseRev: 3 }), 9)).toBe('use-remote');
    });

    it('keeps local edits when the server copy is gone', () => {
      expect(decideOpen(draft({ dirty: true }), null)).toBe('use-local');
      expect(decideOpen(draft({ dirty: true }), undefined as any)).toBe('use-local');
    });

    it('keeps local edits when local is level with or ahead of the server', () => {
      expect(decideOpen(draft({ dirty: true, baseRev: 3 }), 3)).toBe('use-local');
      expect(decideOpen(draft({ dirty: true, baseRev: 4 }), 3)).toBe('use-local');
    });

    it('flags a conflict when both sides moved', () => {
      expect(decideOpen(draft({ dirty: true, baseRev: 3 }), 4)).toBe('conflict');
    });

    it('agrees with decideSync on the conflict case', () => {
      // The two decisions are taken at different moments; they must not disagree about what a conflict is.
      const local = { baseRev: 3, dirty: true };
      expect(decideSync(local, 4, true)).toBe('conflict');
      expect(decideOpen(draft(local), 4)).toBe('conflict');
    });
  });

  // =============================================================================================
  // SHU-90 — pickWinner returns the loser so it can be archived, never destroyed
  // =============================================================================================
  describe('SHU-90 pickWinner', () => {
    it('returns mine as winner and theirs as loser', () => {
      expect(pickWinner('mine', { a: 1 }, { a: 2 })).toEqual({ winner: { a: 1 }, loser: { a: 2 } });
    });

    it('returns theirs as winner and mine as loser', () => {
      expect(pickWinner('theirs', { a: 1 }, { a: 2 })).toEqual({ winner: { a: 2 }, loser: { a: 1 } });
    });

    it('ALWAYS hands back the losing side, so the caller can archive it', () => {
      // The rejected edit is never dropped on the floor — that is the whole contract of this function.
      (['mine', 'theirs'] as const).forEach((choice) => {
        const r = pickWinner(choice, { mine: true }, { theirs: true });
        expect(r.loser).toBeDefined();
        expect(r.winner).not.toEqual(r.loser);
      });
    });

    it('does not clone or mutate either side', () => {
      const mine = { a: 1 };
      const theirs = { a: 2 };
      const r = pickWinner('mine', mine, theirs);
      expect(r.winner).toBe(mine);     // same reference
      expect(r.loser).toBe(theirs);
      expect(mine).toEqual({ a: 1 });
    });
  });
});
