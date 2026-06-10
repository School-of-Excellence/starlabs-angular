// engine.spec.ts — the participant-mode ENGINE to full validated depth (validated/02-product-modes.md §7).
//
// These are CF-side-effect cases (no browser): they drive the deployed `calculateParticipantMode`
// (participantmode.js, onWrite participantsproduct) through its documented branches and assert the value
// the CF COMPUTED — never a value the test wrote. The engine reads `/Atestdate/date` as its "now"
// (participantmode.js:12-17), so we pin a FIXED clock and back-date `statusdate.completed` to walk the
// post-completion arc deterministically.
//
// Coverage vs the validated transition tables:
//   • Table B (post-completion arc): Integration is PM-10/11 (cf-mode.spec); here Performance / Extended
//     Performance / After-Extended (the 3 missing rungs) via the clock + back-dated completion (:105-133).
//   • Table D (headline rollup): MULTI-product lowest-`modes.sequence` pick (:201-216) + the
//     customerstatus='non active' → Exploration Mode override (:217-218).
//   • Table A (entry branches): the SEED branch (new product → Journey [Priority] Planning, :34-40),
//     CANCELLED → null (:162-172), and the pre-event TENTATIVE-date ramp → Early Preparation (:301-309).
//
// Anti-circularity: every precondition (reset to ongoing, set the clock, seed a sibling product) is a
// setup write; the asserted value (profile_data.participantmode / the product's CF-set mode) is the
// engine's output, polled. The day-knobs on the seeded product are I=P=E=30 (seed-modes.js:121).
import { test, expect } from '@playwright/test';
import { modeIds } from './support/modes';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.MODE_RUNID || 'mode';
const P1_PROFILE = `${RUN}_pf_p1`;
const SEED_PROFILE = `${RUN}_pf_p0`; // used for the seed-branch + multi-product cases (kept off p1)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../fixtures/seed-test-project');
const DAY = 86_400_000;

function admin() { return seed.initAdmin(); }
function db() { return admin().firestore(); }
function ts(d: Date) { return admin().firestore.Timestamp.fromDate(d); }

/** Pin the engine's "now" (participantmode.js reads /Atestdate/date). */
async function setClock(d: Date) {
  await db().collection('Atestdate').doc('date').set({ date: ts(d), _testdata: true, testrunid: RUN }, { merge: true });
}

/** Reset the CF subject to the ongoing precondition: status ongoing, a non-completed mode, statusdate
 *  cleared (FieldValue.delete — an empty-map merge would leave statusdate.completed), customerstatus
 *  active, participantmode null. PRECONDITION only. */
async function resetSubject(ppId: string, profileId: string, productId: string) {
  const a = admin();
  await db().collection('participantsproduct').doc(ppId).set({
    docid: ppId, profileid: profileId, productref: db().collection('products').doc(productId),
    mode: 'Priority Mode', nextmode: null, nextmodedate: null, deliverymode: 'Priority Mode',
    status: 'ongoing', statusdate: a.firestore.FieldValue.delete(), sequenceorder: 0, aelid: null,
    _testdata: true, testrunid: RUN,
  }, { merge: true });
  await db().collection('participant metadata').doc(profileId).set({ profileid: profileId, customerstatus: 'active', participantmode: null, _testdata: true, testrunid: RUN }, { merge: true });
  await db().collection('profile_data').doc(profileId).set({ participantmode: null }, { merge: true });
}

/** Flip the subject to completed with a back-dated completion (drives the arc else-branch :97-141). */
async function completeAt(ppId: string, completed: Date) {
  await db().collection('participantsproduct').doc(ppId).update({ status: 'completed', 'statusdate.completed': ts(completed) });
}

test.describe('Modes — calculateParticipantMode engine (validated §7e tables, CF-side-effect)', () => {
  // A FIXED reference "now" for the arc/ramp cases (any stable date; the rung depends only on the
  // offset between this and statusdate.completed, not on real wall-clock).
  const NOW = new Date('2026-06-01T00:00:00.000Z');

  // ===========================================================================================
  // Table B — post-completion arc: the 3 rungs above Integration (I=P=E=30 → boundaries 30/60/90)
  // ===========================================================================================
  test('PM-ARC-PERF completing 45d ago → Performance Mode (Table B rung [I, I+P))', async () => {
    await resetSubject(modeIds.PP1, P1_PROFILE, modeIds.P1);
    await setClock(NOW);
    await completeAt(modeIds.PP1, new Date(NOW.getTime() - 45 * DAY)); // 45 ∈ [30,60)
    const after = await pollUntil(
      () => getDoc('profile_data', P1_PROFILE),
      (d) => !!d && d.participantmode === 'Performance Mode',
      { label: 'PM-ARC-PERF: profile_data.participantmode → Performance Mode', timeoutMs: 60_000, intervalMs: 1000 },
    );
    expect(after!.participantmode).toBe('Performance Mode');
  });

  test('PM-ARC-EXT completing 75d ago → Extended Performance Mode (rung [I+P, I+P+E))', async () => {
    await resetSubject(modeIds.PP1, P1_PROFILE, modeIds.P1);
    await setClock(NOW);
    await completeAt(modeIds.PP1, new Date(NOW.getTime() - 75 * DAY)); // 75 ∈ [60,90)
    const after = await pollUntil(
      () => getDoc('profile_data', P1_PROFILE),
      (d) => !!d && d.participantmode === 'Extended Performance Mode',
      { label: 'PM-ARC-EXT: → Extended Performance Mode', timeoutMs: 60_000, intervalMs: 1000 },
    );
    expect(after!.participantmode).toBe('Extended Performance Mode');
  });

  test('PM-ARC-AFTER completing 95d ago → After Extended Performance Mode (terminal rung)', async () => {
    await resetSubject(modeIds.PP1, P1_PROFILE, modeIds.P1);
    await setClock(NOW);
    await completeAt(modeIds.PP1, new Date(NOW.getTime() - 95 * DAY)); // 95 ≥ 90
    const after = await pollUntil(
      () => getDoc('profile_data', P1_PROFILE),
      (d) => !!d && d.participantmode === 'After Extended Performance Mode',
      { label: 'PM-ARC-AFTER: → After Extended Performance Mode', timeoutMs: 60_000, intervalMs: 1000 },
    );
    expect(after!.participantmode).toBe('After Extended Performance Mode');
  });

  // ===========================================================================================
  // Table D — headline rollup is the LOWEST modes.sequence ACROSS the participant's products
  // ===========================================================================================
  test('PM-ROLLUP-MULTI headline = lowest-sequence mode across two products (not the just-changed one)', async () => {
    // Two ongoing products for p1: a sibling fixed at Integration (seq 900), and PP1 whose mode we flip
    // TO Performance (seq 901) as the final write. The rollup must pick Integration (lower sequence) —
    // proving it spans products, not just the row that changed. Both modes are IN the catalog, so no
    // transient out-of-catalog mode (indexOf==-1) can win a racing rollup; and PP1's flip is the LAST
    // write, so its rollup settles last. (status stays 'ongoing' — no completion arc, no clock needed.)
    const SIB = `${RUN}_PP_sibling`;
    await db().collection('participant metadata').doc(P1_PROFILE).set({ profileid: P1_PROFILE, customerstatus: 'active', participantmode: null, _testdata: true, testrunid: RUN }, { merge: true });
    await db().collection('participantsproduct').doc(SIB).set({
      docid: SIB, profileid: P1_PROFILE, productref: db().collection('products').doc(modeIds.P2),
      mode: 'Integration Mode', deliverymode: 'Priority Mode', status: 'ongoing', sequenceorder: 1,
      _testdata: true, testrunid: RUN,
    }, { merge: true });
    // PP1 starts at Integration too (in-catalog), then we change it to Performance (the triggering write).
    await db().collection('participantsproduct').doc(modeIds.PP1).set({
      docid: modeIds.PP1, profileid: P1_PROFILE, productref: db().collection('products').doc(modeIds.P1),
      mode: 'Integration Mode', deliverymode: 'Priority Mode', status: 'ongoing', sequenceorder: 0,
      _testdata: true, testrunid: RUN,
    }, { merge: true });
    await new Promise((r) => setTimeout(r, 3000)); // let the setup rollups settle before the triggering write
    try {
      await db().collection('participantsproduct').doc(modeIds.PP1).update({ mode: 'Performance Mode' }); // the LAST write
      const after = await pollUntil(
        () => getDoc('profile_data', P1_PROFILE),
        // Integration (900) < Performance (901) → headline Integration, though PP1 just became Performance.
        (d) => !!d && d.participantmode === 'Integration Mode',
        { label: 'PM-ROLLUP-MULTI: headline = Integration (lowest sequence across products)', timeoutMs: 60_000, intervalMs: 1000 },
      );
      expect(after!.participantmode, 'cross-product rollup picks the lowest-sequence mode, not the changed row')
        .toBe('Integration Mode');
    } finally {
      await db().collection('participantsproduct').doc(SIB).delete().catch(() => {});
    }
  });

  test('PM-ROLLUP-EXPLORE customerstatus "non active" overrides the headline to Exploration Mode', async () => {
    await resetSubject(modeIds.PP1, P1_PROFILE, modeIds.P1);
    // Override the customerstatus the rollup reads (participantmode.js:217) — as journey_to_pmd would set it.
    await db().collection('participant metadata').doc(P1_PROFILE).set({ customerstatus: 'non active' }, { merge: true });
    try {
      // A simple completion (no statusdate.completed → Integration) is enough to trigger a mode-change → rollup.
      await db().collection('participantsproduct').doc(modeIds.PP1).update({ status: 'completed' });
      const after = await pollUntil(
        () => getDoc('profile_data', P1_PROFILE),
        (d) => !!d && d.participantmode === 'Exploration Mode',
        { label: 'PM-ROLLUP-EXPLORE: non-active → Exploration Mode', timeoutMs: 60_000, intervalMs: 1000 },
      );
      expect(after!.participantmode).toBe('Exploration Mode');
    } finally {
      await db().collection('participant metadata').doc(P1_PROFILE).set({ customerstatus: 'active' }, { merge: true });
    }
  });

  // ===========================================================================================
  // Table A — entry branches
  // ===========================================================================================
  test('PM-SEED a new participantsproduct seeds the mode from deliveryplanning (normal→Journey Planning, priority→Journey Priority Planning)', async () => {
    // Two fresh products + their participantsproduct rows. Creating the row (no status) fires the CF's
    // seed branch (:29-40) which sets the initial mode from product.deliveryplanning.
    const PNORM = `${RUN}_P_seed_normal`, PPRIO = `${RUN}_P_seed_priority`;
    const PPN = `${RUN}_PP_seed_normal`, PPP = `${RUN}_PP_seed_priority`;
    await db().collection('products').doc(PNORM).set({ docid: PNORM, product: `TEST Seed Normal ${RUN}`, mode: 'Event Mode', deliveryplanning: 'normal', atcmodel: null, _testdata: true, testrunid: RUN });
    await db().collection('products').doc(PPRIO).set({ docid: PPRIO, product: `TEST Seed Priority ${RUN}`, mode: 'Priority Mode', deliveryplanning: 'priority', atcmodel: null, _testdata: true, testrunid: RUN });
    // Fresh-create (delete first so before.exists==false → the seed branch fires).
    await db().collection('participantsproduct').doc(PPN).delete().catch(() => {});
    await db().collection('participantsproduct').doc(PPP).delete().catch(() => {});
    try {
      await db().collection('participantsproduct').doc(PPN).set({ docid: PPN, profileid: SEED_PROFILE, productref: db().collection('products').doc(PNORM), status: null, _testdata: true, testrunid: RUN });
      await db().collection('participantsproduct').doc(PPP).set({ docid: PPP, profileid: SEED_PROFILE, productref: db().collection('products').doc(PPRIO), status: null, _testdata: true, testrunid: RUN });
      await pollUntil(() => getDoc('participantsproduct', PPN), (d) => !!d && d.mode === 'Journey Planning Mode',
        { label: 'PM-SEED: normal product → Journey Planning Mode', timeoutMs: 45_000, intervalMs: 1000 });
      await pollUntil(() => getDoc('participantsproduct', PPP), (d) => !!d && d.mode === 'Journey Priority Planning Mode',
        { label: 'PM-SEED: priority product → Journey Priority Planning Mode', timeoutMs: 45_000, intervalMs: 1000 });
    } finally {
      for (const x of [PPN, PPP]) await db().collection('participantsproduct').doc(x).delete().catch(() => {});
    }
  });

  test('PM-CANCEL cancelling an ongoing product clears mode/nextmode/nextmodedate to null', async () => {
    // Precondition: a product carrying a non-null mode + nextmode.
    await db().collection('participantsproduct').doc(modeIds.PP1).set({
      docid: modeIds.PP1, profileid: P1_PROFILE, productref: db().collection('products').doc(modeIds.P1),
      mode: 'Priority Mode', nextmode: 'Integration Mode', nextmodedate: ts(NOW), deliverymode: 'Priority Mode',
      status: 'ongoing', _testdata: true, testrunid: RUN,
    }, { merge: true });
    await db().collection('participantsproduct').doc(modeIds.PP1).update({ status: 'cancelled' });
    const after = await pollUntil(
      () => getDoc('participantsproduct', modeIds.PP1),
      (d) => !!d && d.status === 'cancelled' && d.mode === null && d.nextmode === null && d.nextmodedate === null,
      { label: 'PM-CANCEL: mode/nextmode/nextmodedate → null', timeoutMs: 45_000, intervalMs: 1000 },
    );
    expect(after!.mode, 'cancel clears the mode').toBeNull();
    expect(after!.nextmode, 'cancel clears the nextmode').toBeNull();
  });

  test('PM-RAMP setting a tentative date ≥30d out enters Early Preparation Mode', async () => {
    await resetSubject(modeIds.PP1, P1_PROFILE, modeIds.P1);
    await setClock(NOW);
    // tentative 40 days after "now" → timediff ≥ 30 → Early Preparation Mode (:301-309).
    await db().collection('participantsproduct').doc(modeIds.PP1).update({ participanttentativedate: ts(new Date(NOW.getTime() + 40 * DAY)) });
    const after = await pollUntil(
      () => getDoc('participantsproduct', modeIds.PP1),
      (d) => !!d && d.mode === 'Early Preparation Mode',
      { label: 'PM-RAMP: tentative ≥30d → Early Preparation Mode', timeoutMs: 45_000, intervalMs: 1000 },
    );
    expect(after!.mode).toBe('Early Preparation Mode');
    // clean the tentative date so it can't leak into a later p1 case.
    await db().collection('participantsproduct').doc(modeIds.PP1).update({ participanttentativedate: admin().firestore.FieldValue.delete() }).catch(() => {});
  });
});
