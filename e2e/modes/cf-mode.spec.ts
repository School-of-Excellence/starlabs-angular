// cf-mode.spec.ts — calculateParticipantMode CF side-effects on product completion.
//
// Recon: e2e/recon-allcomp/product-modes.md (PM-10 + PM-11, merged into one trigger). Trigger: a
// participantsproduct row flips status 'ongoing' → 'completed' (no pre-existing statusdate.completed).
// The CF (starlabs-cloud-function/functions/components/participantmode.js):
//   • completion branch (:80) sets mode:'Integration Mode' (a 2nd write that re-fires the CF),
//   • mode-changed branch (:188) then: (a) creates a `participant mode checklist` doc — ONLY when a
//     matching `product mode config` (productref==, mode=='Integration Mode') exists (:247), and
//     (b) writes profile_data.participantmode = lowest-sequence mode (= "Integration Mode" for this
//     single-product, customerstatus:'active' participant, :215-227).
//
// WHY one test, not two: the CF cascade keeps re-firing for several seconds after the trigger (each of
// its own participantsproduct writes re-invokes the onDocumentWritten CF), and the reset write ITSELF
// (status→ongoing) re-fires it. Two separate tests on the same subject race that churn. A single test
// with one trigger and two assertions is race-free and still asserts both CF outputs.
//
// Anti-circularity: the test seeds 0 checklist docs and participantmode≠"Integration Mode"; the CF
// computes 1 checklist + participantmode=="Integration Mode". The status:'completed' write is the
// TRIGGER (a precondition mutation), never an asserted value. The test clock (/Atestdate/date) pins the
// CF's "now" for deterministic completion-arc dates.
//
// NOTE (CF latency): cloud test-project CF execution can be 5-30s; the assertions poll up to 60s.
// NOTE (cross-project, see blockers): the downstream profiledata_to_participantmetadata CF makes a
// server-side axios.post to the TEST Watson (watson-test-19) — not production, and it does not gate the
// profile_data.participantmode write this case asserts. We deliberately do NOT assert the
// participant-metadata mirror (PM-12) to avoid coupling a green to that cross-project hop.
import { test, expect } from '@playwright/test';
import { modeIds, resetCfCompletionSubject } from './support/modes';
import { getDoc, countWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.MODE_RUNID || 'mode';
const P1_PROFILE = `${RUN}_pf_p1`;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../fixtures/seed-test-project');

/** Flip the CF-completion subject's status to 'completed' (the CF trigger). Admin write — this is the
 *  precondition mutation, NOT the asserted value (the spec asserts the CF's downstream output). */
async function completeProduct(ppId: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // Merge-set status:'completed' WITHOUT statusdate.completed → the CF's simple completion branch
  // (participantmode.js:82) sets mode:'Integration Mode'.
  await db.collection('participantsproduct').doc(ppId).set({ status: 'completed' }, { merge: true });
}

test.describe('Modes — calculateParticipantMode CF (completion side-effects, anti-circular)', () => {
  // ===========================================================================================
  // PM-10 + PM-11 — completing a product writes a `participant mode checklist` doc AND sets
  // profile_data.participantmode = "Integration Mode" (both CF-computed)
  // ===========================================================================================
  test('PM-10/11 completing a product writes a checklist doc + profile participantmode "Integration Mode"', async ({ page }) => {
    void page; // CF-side-effect test: no UI; the trigger is a precondition Firestore mutation.

    // Precondition (anti-circular): subject ongoing, 0 checklist docs. The reset write itself re-fires
    // the CF, so WAIT for the churn to settle to a non-target state before triggering completion (the
    // anti-circular guarantee is only that the test never WROTE the asserted "Integration Mode").
    await resetCfCompletionSubject(modeIds.PP1, P1_PROFILE);
    await pollUntil(
      async () => {
        const [checklist, prof] = await Promise.all([
          countWhere('participant mode checklist', [['profileid', '==', P1_PROFILE], ['mode', '==', 'Integration Mode']]),
          getDoc('profile_data', P1_PROFILE),
        ]);
        return { checklist, mode: (prof?.participantmode ?? null) as string | null };
      },
      (s) => s.checklist === 0 && s.mode !== 'Integration Mode',
      { label: 'PM-10/11: reset settled (0 Integration-Mode checklist docs, participantmode≠target)', timeoutMs: 30_000, intervalMs: 1000 },
    );

    // [TRIGGER] flip status → completed.
    await completeProduct(modeIds.PP1);

    // [ASSERT PM-10] the CF created exactly one "Integration Mode" checklist doc for this profile. The
    // COUNT is what the CF computed; the test seeded 0.
    await pollUntil(
      () => countWhere('participant mode checklist', [['profileid', '==', P1_PROFILE], ['mode', '==', 'Integration Mode']]),
      (n) => n === 1,
      { label: 'PM-10: exactly 1 "Integration Mode" checklist doc for the subject', timeoutMs: 60_000, intervalMs: 1000 },
    );

    // [ASSERT PM-11] the CF's mode-rollup wrote participantmode = lowest-sequence mode = "Integration
    // Mode" (single product, customerstatus:'active'). The value the CF computed (test seeded null).
    const after = await pollUntil(
      () => getDoc('profile_data', P1_PROFILE),
      (d) => !!d && d.participantmode === 'Integration Mode',
      { label: 'PM-11: profile_data.participantmode → "Integration Mode"', timeoutMs: 60_000, intervalMs: 1000 },
    );
    expect(after!.participantmode, 'PM-11: CF wrote the headline mode').toBe('Integration Mode');
  });
});
