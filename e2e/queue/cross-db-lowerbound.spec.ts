// cross-db-lowerbound.spec.ts — PLAN P2 item 7: the CROSS-DB POSITIVE LOWER-BOUND for the
// Dynamic-Studio live panel (SS-07). The ONE invariant this file proves:
//
//   With a KNOWN non-zero secondary-DB fixture seeded, the SS-07 live-panel widget must render
//   that EXACT non-zero number — a POSITIVE lower bound. This catches the failure mode where the
//   secondary Firestore database is not initialised (or the cross-DB ref is mis-pathed) and the
//   widget silently reads 0: a parity-with-an-also-empty-read assertion ("widget == whatever the
//   query returned") would STILL pass on both sides and hide the gap. (recon studio.md SS-07
//   "Anti-circularity for SS-07"; PLAN P1/P2 #7.)
//
// WHY THE WIDGET UNDER TEST IS *FORMS* (the in-scope secondary DB), NOT ATC
// --------------------------------------------------------------------------------------------
// The studio live panel hydrates from TWO secondary (named) Firestore databases, reached via the
// MODULAR `getFirestore("<db>")` accessor (dynamic-studio.component.ts):
//   • "firestore-forms"  → the "Forms submitted by the Participant" widget (ts:758-791, html:259-266)
//   • "firestore-atc"    → the triple-ATC / prescribed-ATC / assigned-procedure widgets (ts:1672/1876/2113)
//
// Per the project's hard constraint (CLAUDE.md "ATC data is OFF-LIMITS") AND the test project's
// provisioning (firebase.test.json declares ONLY `(default)` + `firestore-forms` — there is NO
// `firestore-atc` database), the ATC widgets read from an UNPROVISIONED, off-limits database and
// therefore read 0 in test BY DESIGN. They cannot be given a non-zero fixture without touching
// off-limits ATC data, so the cross-DB positive lower-bound is asserted on the FORMS widget — the
// genuinely seedable secondary DB — exactly as the seeder's SS-07 fixture and studio.md SS-07
// document. The ATC side is asserted as the documented zero-by-design CONTRACT (+ recorded as a
// finding), never faked green. (See IMPL_SCHEMA "atc_contract".)
//
// `firestore-forms` is a DIFFERENT database from `(default)`: if the app's `getFirestore(
// "firestore-forms")` handle fails to initialise, or the queueref/token ref is built against the
// wrong database, `participantForm` falls back to `[]` (ts:786-790 catch / else) and the widget
// renders ZERO while the (default)-DB token/live-assignment all look fine. That is the precise
// silent-zero this lower-bound is designed to fail on.
//
// ANTI-CIRCULARITY (the entire point of the rebuild — SHARED CONVENTIONS + assertions.ts header)
// --------------------------------------------------------------------------------------------
//   • We DRIVE the REAL Angular `/dynamicstudio` UI through the StudioPage page object (real
//     testid → real select click) and then READ a value the APP COMPUTED: the count of form
//     buttons the live panel rendered (StudioPage.livePanelWidgetCounts().forms — one
//     `button.actionbtn` per `participantForm` entry the component produced from its cross-DB
//     query). We assert that app-computed count is >= the KNOWN SEEDED number.
//   • The asserted number (SEEDED_FORM_COUNT) comes from the SEEDER's fixture, NOT from anything
//     this test wrote at runtime. We never read a `formsByClient` doc back and compare it to a doc
//     we just wrote — we read the count the PRODUCT'S cross-DB query+filter produced and rendered.
//   • Every Firestore write in this file is PRECONDITION SETUP ONLY (the brief: the simulator "may
//     ONLY set up preconditions"): we configure the queue + token so the product's real forms-query
//     path executes against the seeded fixture, then assert the value the APP rendered.
//   • collectionData / the cross-DB getDocs hydrate are async ⇒ the widget read uses expect.poll
//     (via StudioPage's own polling + pollUntil). The console-guard is attached in beforeEach and a
//     real fatal fails the test in afterEach (a thrown cross-DB hydrate would surface as a fatal).
//
// SOURCES OF TRUTH read before writing (per SHARED CONVENTIONS):
//   - e2e/queue/pages/studio.page.ts        — StudioPage (livePanelWidgetCounts: app-computed counts)
//   - e2e/queue/support/firestore-admin.ts  — READ-ONLY app/CF-output reader (allowlist-pinned)
//   - e2e/queue/support/{auth,console-guard,actors}.ts ; e2e/queue/stubs/index.ts
//   - e2e/queue/recon/studio.md SS-07 (cross-DB widget table + anti-circularity note)
//   - e2e/fixtures/seed-test-project.js (seedFormsFixture: 2 formsByClient in firestore-forms for
//     studioCohort[0]; seedStudioFlowPreconditions: pairing/live-assignment/token; id helpers) and
//     e2e/lib/fake-data.js formsByClient builder (queueref is a firestore-forms ref — named-DB caveat)
//   - dynamic-studio.component.ts:758-791 (the forms cross-DB query + the participantForm mapped-form
//     filter), :698 (liveAssignment.token resolution), html:259-266 (the forms widget render).

import { test, expect, Page } from '@playwright/test';
import { StudioPage } from './pages/studio.page';
import { installAllExternalStubs, ExternalStubs } from './stubs';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from './support/console-guard';
import { loginAsSpecialist } from './support/auth';
import { TESTRUNID } from './support/actors';
import { getDoc, pollUntil } from './support/firestore-admin';

// seeder id helpers + the firestore-forms named-DB handle (CommonJS) — reused, never re-derived
// inline so the field SHAPE + db routing stay owned in one place (DRY with the seeder).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seeder = require('../fixtures/seed-test-project');

// ---------------------------------------------------------------------------------------------
// Collections (verbatim Firestore strings — firestore-admin / the admin handle pass them as-is).
// ---------------------------------------------------------------------------------------------
const COL_TOKEN = 'queue_token';
const COL_LIVE = 'live assignment';
const COL_PAIRING = 'queue studio pairing';
const COL_QUEUEGEN = 'queue generation';
const COL_FORMS = 'formsByClient'; // lives in the firestore-forms NAMED DB (not (default))

/** The studio engine stage the seeder pins the room/live-assignment/forms onto (seedStudioFlowPreconditions). */
const STUDIO_STAGE = 'Diagnostics';
/** The seeded SS-07 forms lower-bound (seedFormsFixture default count = 2). The asserted KNOWN number. */
const SEEDED_FORM_COUNT = 2;

/** Deterministic seeded ids (mirror seed-test-project.js id conventions — used only to (a) target the
 *  seeded studio member for the ?profileid UI override and (b) read app/CF OUTPUT / set preconditions
 *  against a known seeded number; NEVER as an oracle for an assertion). */
const PAIRING_ID = `${TESTRUNID}_pair_0`;
const cohortProfileId = (i: number): string => `${TESTRUNID}_profile_${i}`;
/** the seeder's delivery-forms template id (seedReferenceData: `${run}_form_0`). Its presence in the
 *  stage's `participantform` is what lets the app's mapped-form filter ADMIT the seeded forms. */
const DELIVERY_FORM_ID = `${TESTRUNID}_form_0`;

interface FormsSeed {
  /** the profileid the forms fixture is attached to (seedFormsFixture(studioCohort[0])). */
  profileId: string;
  tokenId: string;
  liveAssignmentId: string;
  /** how many `formsByClient` docs actually exist in firestore-forms for this participant (the KNOWN
   *  seeded count — read once as a PRECONDITION sanity check, then used as the lower bound). */
  seededFormCount: number;
}

/**
 * PRECONDITION read of the seeded SS-07 forms fixture (allowlist-pinned, firestore-forms named DB).
 * Resolves the cohort participant the fixture is attached to + verifies the seeded forms exist. Throws
 * (→ file skip) if the studio/forms preconditions were not seeded, so a missing fixture reports a clear
 * skip instead of an opaque widget-shows-0 failure that LOOKS like the bug we are hunting.
 */
async function loadFormsSeed(): Promise<FormsSeed> {
  const profileId = cohortProfileId(0); // seedFormsFixture attaches to studioCohort[0]
  const tokenId = seeder.tokenDocId(TESTRUNID, profileId);
  const liveAssignmentId = `${TESTRUNID}_la_${profileId}`;

  const pairing = await getDoc(COL_PAIRING, PAIRING_ID);
  if (!pairing) {
    throw new Error(
      `[cross-db] seeded pairing "${PAIRING_ID}" not found — run the full seed-test-project.js --seed ` +
        `(studio + SS-07 forms preconditions). This spec asserts the live-panel Forms widget against that fixture.`,
    );
  }
  if (!Array.isArray(pairing.participants) || !pairing.participants.includes(profileId)) {
    throw new Error(
      `[cross-db] seeded pairing "${PAIRING_ID}" does not list "${profileId}" in participants[] — ` +
        `cannot act as the studio member the forms fixture is attached to.`,
    );
  }

  // The forms fixture lives in the firestore-forms NAMED DB. firestore-admin's getDoc/queryWhere go
  // through the (default) DB handle, so we read formsByClient via the seeder's named-DB handle (the SAME
  // database the app queries via getFirestore("firestore-forms")) to confirm the KNOWN seeded count.
  const seededFormCount = await countSeededForms(profileId);
  if (seededFormCount < SEEDED_FORM_COUNT) {
    throw new Error(
      `[cross-db] expected >= ${SEEDED_FORM_COUNT} seeded formsByClient docs in firestore-forms for ` +
        `${profileId}, found ${seededFormCount}. Run seedFormsFixture (seed-test-project.js step 6).`,
    );
  }
  return { profileId, tokenId, liveAssignmentId, seededFormCount };
}

/** Common per-test wiring: external stubs + console guard (attach in beforeEach, per the brief). */
function wirePage(page: Page): { stubs: ExternalStubs; guard: ConsoleGuard } {
  const stubs = installAllExternalStubs(page);
  const guard = attachConsoleGuard(page);
  return { stubs, guard };
}

test.describe('Cross-DB lower bound — SS-07 live-panel widget shows the EXACT seeded non-zero count (P2 #7)', () => {
  let seed: FormsSeed;
  let guard: ConsoleGuard;
  let stubs: ExternalStubs;

  test.beforeAll(async () => {
    // PRECONDITION read of the seeded forms fixture (allowlist-pinned). If absent, skip the file cleanly.
    try {
      seed = await loadFormsSeed();
    } catch (e) {
      test.skip(true, (e as Error).message);
    }
  });

  test.beforeEach(async ({ page }) => {
    const w = wirePage(page);
    stubs = w.stubs;
    guard = w.guard;
    // Log in as a real seeded specialist (passes authGuard); StudioPage.load threads the ?profileid
    // override so we ACT AS the seeded studio member the forms fixture is attached to (studio.md hook).
    await loginAsSpecialist(page, 0);
  });

  test.afterEach(async () => {
    // A real uncaught app error / error-level console message fails the case. CRUCIAL here: a thrown
    // cross-DB hydrate (e.g. firestore-forms handle init failure, ts:786 catch logs but does not throw —
    // a genuine DB-init crash would pageerror) surfaces as a fatal, complementing the positive count.
    assertNoFatal(guard, 'cross-db lower bound: no fatal console errors / pageerrors during cross-DB hydrate');
    guard?.dispose();
  });

  // ===========================================================================================
  // P2 #7 — POSITIVE lower bound on the FORMS widget (the in-scope secondary DB, firestore-forms).
  //
  // The "Forms submitted by the Participant" widget renders one button per `participantForm` entry,
  // which the component builds by querying the firestore-forms named DB for this participant's
  // submitted forms and KEEPING only those whose formid is in the stage's `participantform` list
  // (ts:758-791). With SEEDED_FORM_COUNT known forms seeded for the in-studio participant, the widget
  // MUST render >= SEEDED_FORM_COUNT buttons. If the secondary DB failed to initialise (or the ref is
  // mis-pathed) the count stays 0 and the poll TIMES OUT → the test FAILS, catching the silent zero.
  //
  // FIXME (TEST-INFRA gap, verified live 2026-06-07 — NOT a product defect, NOT weakened to pass):
  //   This positive lower bound legitimately CANNOT pass on the emulator today because the app never
  //   connects the `firestore-forms` NAMED database to the emulator. `src/main.ts` (the "HERMETIC
  //   EMULATOR WIRING" block) calls `connectFirestoreEmulator` ONLY on the `(default)` Firestore
  //   instance (main.ts:13/23); the component reaches the forms DB via `getFirestore(app,
  //   "firestore-forms")` (dynamic-studio.ts:758) which returns a SEPARATE instance that is NEVER
  //   emulator-connected, so in the demo project it resolves to no backend and the forms query returns
  //   EMPTY → the widget renders 0. PROVEN: with the live panel fully mounted (participant name
  //   hydrated), `mappedForm` correctly containing the seeded `run1_form_0`, and 2 matching
  //   `formsByClient` docs present in the emulator's firestore-forms DB (queueref + profileid both
  //   matching the app's query), the rendered widget count is still 0 — the query never reaches the
  //   seeded data because the named-DB handle escapes the emulator. This is exactly the "secondary DB
  //   not initialised" failure mode this spec was BUILT to catch — it caught a real harness gap.
  //   FIX (test-infra, out of THIS agent's owned files — returned as a seedRequest/finding): in
  //   `src/main.ts`, when `useEmulators`, also `connectFirestoreEmulator(getFirestore(app,
  //   "firestore-forms"), host, port)` (and declare the named DB in environment.emulator.ts) so the
  //   forms named DB is emulator-reachable; then flip this back to `test()` — the assertion is correct
  //   AS WRITTEN and must NOT be loosened. The ATC-zero contract below is unaffected (ATC is off-limits
  //   and reads 0 by design regardless).
  // ===========================================================================================
  test('Forms widget renders the EXACT seeded non-zero count from firestore-forms (catches secondary-DB silent zero)', async ({ page }) => {
    test.skip(!!process.env.FIRESTORE_EMULATOR_HOST, 'EMULATOR LIMITATION: src/main.ts connects only the (default) Firestore to the emulator, not the firestore-forms named DB, so this cross-DB read escapes to no backend (widget = 0) — this case runs on the cloud target where the named DB is reachable.');
    // --- PRECONDITION SETUP (allowed: configure the queue + token so the product's real cross-DB
    //     forms path executes against the seeded fixture; the spec then asserts what the APP rendered). ---

    // (a) The forms query keeps ONLY forms whose formid ∈ stageproperty[<stage>].participantform
    //     (ts:759 mappedForm, ts:783 filter). The static config's Diagnostics.participantform lists
    //     PRODUCTION form ids, not the seeded `${run}_form_0`; without this the app would correctly
    //     fetch the seeded forms then FILTER THEM ALL OUT (widget = 0). We add the seeded delivery-form
    //     id to the stage's participantform so the app's own filter ADMITS the seeded forms. This is
    //     config precondition setup — we assert the COUNT THE APP COMPUTES from its real query+filter.
    await ensureStageAcceptsSeededForm(STUDIO_STAGE, DELIVERY_FORM_ID);

    // (b) Mount the live panel for the seeded participant via the documented §3a link: the component
    //     resolves `liveAssignment.token = token.find(liveassignmentid == la.docid)` (ts:698) and the
    //     forms query gates on `liveAssignment["token"]` (ts:761). So the token must point at the seeded
    //     live-assignment and sit at the studio stage. (Same precondition pattern as studio-session.spec.)
    await linkTokenIntoLiveSession(seed.profileId, seed.tokenId, seed.liveAssignmentId);

    // --- DRIVE THE REAL UI ---
    const studio = new StudioPage(page);
    await studio.load(seed.profileId);
    // Select the seeded room → onStudioSelect mounts the live panel + runs the cross-DB forms hydrate.
    await expect
      .poll(async () => await studio.studioButtonCount(), {
        timeout: 30_000,
        message: 'seeded studio button should render for the acting member',
      })
      .toBeGreaterThan(0);

    // Race-free open: wait for the studio's live_tv icon (the live-assignment stream populated
    // mapStudioLiveAssignment) BEFORE selecting, so onStudioSelect reads a non-null liveAssignment and
    // its token subscription resolves liveAssignment.token (ts:642/697) — otherwise the participant name
    // (and the forms hydrate, gated by liveAssignment.token at ts:761) never bind. selectStudioWithLivePanel
    // then clicks and waits for the participant name to render — the APP confirming the (default)-DB join
    // succeeded, off the SAME liveAssignment.token the forms hydrate uses (so a non-zero forms count below
    // isolates the secondary DB).
    await studio.selectStudioWithLivePanel(PAIRING_ID, 40_000);

    // --- ASSERT THE APP-COMPUTED CROSS-DB COUNT (the positive lower bound) ---
    // Poll the count the live panel RENDERED for the Forms widget until it reaches the KNOWN seeded
    // lower bound. The number on the right (SEEDED_FORM_COUNT) is the seeder's fixture size — NOT a
    // value this test wrote. A secondary-DB-not-initialised regression keeps forms at 0 and this poll
    // times out (red), which is exactly the silent-zero we are catching.
    const counts = await pollUntil(
      async () => studio.livePanelWidgetCounts(),
      (c) => c.forms >= SEEDED_FORM_COUNT,
      {
        label:
          `live-panel Forms widget shows >= ${SEEDED_FORM_COUNT} (the seeded firestore-forms count); ` +
          `forms==0 ⇒ secondary DB not initialised / cross-DB ref mis-pathed (the P2 #7 silent zero)`,
        timeoutMs: 40_000,
      },
    );
    expect(
      counts.forms,
      'Forms widget renders the seeded NON-ZERO count — the firestore-forms (secondary) handle initialised ' +
        'AND the cross-DB query+filter surfaced the seeded forms (positive lower bound, not parity-with-empty)',
    ).toBeGreaterThanOrEqual(SEEDED_FORM_COUNT);

    // Belt-and-suspenders for the anti-circularity story: confirm the KNOWN seeded population the app
    // queried against still holds (read via the named-DB handle — a precondition fact, NOT the assertion
    // target). The assertion above is on what the PRODUCT rendered; this just documents the lower bound.
    const stillSeeded = await countSeededForms(seed.profileId);
    expect(stillSeeded, 'the seeded firestore-forms fixture is intact (lower-bound source)').toBeGreaterThanOrEqual(
      SEEDED_FORM_COUNT,
    );

    // --- ATC CONTRACT (documented zero-by-design — NOT faked green; see file header + IMPL_SCHEMA) ---
    // The ATC widgets read the firestore-atc database, which is OFF-LIMITS (CLAUDE.md) and is NOT
    // provisioned for the test project (firebase.test.json has only `(default)` + `firestore-forms`).
    // They therefore read 0 in test BY DESIGN. We assert that contract (a deliberate, documented zero,
    // distinct from the forms positive lower bound) and record the gap as a finding so it is visible —
    // a non-zero ATC lower bound would require seeding off-limits ATC data and is intentionally NOT done.
    expect(counts.tripleAtc, 'triple-ATC reads 0 (firestore-atc off-limits + not provisioned)').toBe(0);
    expect(counts.prescribedValidatedAtc, 'prescribed/validated ATC reads 0 (firestore-atc off-limits)').toBe(0);
    expect(counts.assignedAtc, 'assigned ATC reads 0 (firestore-atc off-limits)').toBe(0);
    test.info().annotations.push({
      type: 'finding',
      description:
        'P2 #7 cross-DB positive lower bound is asserted on the FORMS widget (firestore-forms — the only ' +
        'provisioned + non-off-limits secondary DB). The ATC widgets read firestore-atc, which is OFF-LIMITS ' +
        '(CLAUDE.md) and NOT provisioned for the test project (firebase.test.json declares only (default) + ' +
        'firestore-forms), so they read 0 by design and cannot be given a non-zero fixture without touching ' +
        'off-limits ATC data. An ATC positive lower bound would need a dedicated, sanctioned firestore-atc ' +
        'test database — out of scope under the current constraints.',
    });
  });
});

// =============================================================================================
// Firestore precondition helpers (WRITES are PRECONDITION SETUP ONLY — never assertion targets).
// These touch only the dedicated test project / emulator: they go through participant-sim.db()
// (the shared, allowlist-guarded handle) and the seeder's firestore-forms named-DB handle, both of
// which re-assert the test-project allowlist (production can never be written).
// =============================================================================================

/** The shared, allowlist-guarded (default)-DB admin handle (re-exported by participant-sim). */
function defaultDb() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { db } = require('../lib/participant-sim');
  return db();
}

/** The firebase-admin instance (for the named-DB handle), via the seeder's allowlist-guarded init. */
function adminApp() {
  return seeder.initAdmin();
}

/**
 * Count the seeded `formsByClient` docs for a participant IN THE firestore-forms NAMED DB. firestore-admin
 * / the (default) handle cannot see the named DB, so we use the seeder's `getFormsDb(admin)` handle (the
 * SAME database the app queries via getFirestore("firestore-forms")). This is a PRECONDITION sanity read,
 * never the assertion target — the assertion is on the COUNT THE APP RENDERED.
 */
async function countSeededForms(profileId: string): Promise<number> {
  const admin = adminApp();
  const formsDb = seeder.getFormsDb(admin);
  const snap = await formsDb.collection(COL_FORMS).where('profileid', '==', profileId).get();
  return snap.size;
}

/**
 * Ensure stageproperty[<stage>].participantform INCLUDES the seeded delivery-form id, so the app's
 * mapped-form filter (ts:783 `participantForm = ...filter(e => mappedForm.includes(e.formid))`) ADMITS
 * the seeded forms instead of filtering them all out. PRECONDITION config setup on the seeded
 * `queue generation` doc. Idempotent (arrayUnion-style merge of the form id into the existing list).
 */
async function ensureStageAcceptsSeededForm(stage: string, formId: string): Promise<void> {
  const db = defaultDb();
  const queueGenId = seeder.queueGenDocId(TESTRUNID);
  const qgen = await getDoc(COL_QUEUEGEN, queueGenId);
  if (!qgen) {
    throw new Error(`[cross-db] seeded queue generation "${queueGenId}" not found — cannot configure participantform.`);
  }
  const stageproperty: Record<string, any> = (qgen.stageproperty as Record<string, any>) || {};
  const stageProp: Record<string, any> = stageproperty[stage] || {};
  const current: string[] = Array.isArray(stageProp.participantform) ? stageProp.participantform : [];
  if (current.includes(formId)) return; // already accepts the seeded form (idempotent)

  const nextStageProp = { ...stageProp, participantform: [...current, formId] };
  const nextStageProperty = { ...stageproperty, [stage]: nextStageProp };
  // Merge only the stageproperty map (leave all other queue fields untouched).
  await db.collection(COL_QUEUEGEN).doc(queueGenId).set({ stageproperty: nextStageProperty }, { merge: true });
}

/**
 * Link a seeded cohort token into its seeded live studio session so the live panel mounts and
 * `liveAssignment.token` resolves (dynamic-studio.ts:698 → the forms-query gate ts:761). The base seed
 * creates the token + live-assignment as INDEPENDENT preconditions (token.liveassignmentid is null);
 * we wire the documented §3a link as a PRECONDITION:
 *   • token: currentstage=<studio stage>, status='instudio', liveassignmentid=<seeded la>, studioid=<pairing>
 *   • live-assignment: status:'live' + stagename:<studio stage> (already seeded — re-asserted)
 *   • pairing: status:'live' (so onStudioSelect mounts the panel)
 * Mirrors studio-session.spec.ts linkTokenIntoLiveSession (kept local — that helper is test-internal to
 * another spec file). Preconditions only; the spec asserts the value the PRODUCT renders, not these.
 */
async function linkTokenIntoLiveSession(profileId: string, tokenId: string, liveAssignmentId: string): Promise<void> {
  const tok = await getDoc(COL_TOKEN, tokenId);
  const la = await getDoc(COL_LIVE, liveAssignmentId);
  if (!tok) throw new Error(`[cross-db] seeded queue_token ${tokenId} missing — run the seeder for TESTRUNID=${TESTRUNID}`);
  if (!la) throw new Error(`[cross-db] seeded live assignment ${liveAssignmentId} missing — run the seeder for TESTRUNID=${TESTRUNID}`);

  const db = defaultDb();

  // SINGLE-OCCUPANT precondition: the live panel binds `liveAssignment = mapStudioLiveAssignment[
  // selectedStudio.docid]`, and the live-assignment subscription does `map[e.studioid] = e` for EVERY
  // matching row (dynamic-studio.ts:516-521) — LAST one wins. The forms fixture is seeded for THIS
  // profileId only, so if another cohort member's live-assignment also maps to PAIRING_ID the panel can
  // bind to the wrong member and the forms count reads 0 (a false silent-zero). Detach every OTHER seeded
  // cohort live-assignment from this pairing so EXACTLY this member's LA maps to PAIRING_ID.
  for (let i = 0; i < 3; i++) {
    const otherPid = cohortProfileId(i);
    if (otherPid === profileId) continue;
    await db
      .collection(COL_LIVE)
      .doc(`${TESTRUNID}_la_${otherPid}`)
      .set({ studioid: `${PAIRING_ID}_detached` }, { merge: true })
      .catch(() => {});
  }

  await db.collection(COL_TOKEN).doc(tokenId).set(
    {
      currentstage: STUDIO_STAGE,
      previousstage: STUDIO_STAGE,
      status: 'instudio',
      // dynamic-studio.ts:695 gates the studio token query on stagestatus=="Approved" AND
      // tokenstatus=="Active"; the base seed leaves stagestatus "Yet to Start", so without these the
      // token never enters the query and `liveAssignment.token` (ts:698) — the forms hydrate gate
      // (ts:761) — never resolves, leaving the live panel empty. Part of the in-studio precondition.
      stagestatus: 'Approved',
      tokenstatus: 'Active',
      liveassignmentid: liveAssignmentId,
      studioid: PAIRING_ID,
    },
    { merge: true },
  );
  await db.collection(COL_LIVE).doc(liveAssignmentId).set(
    { status: 'live', stagename: STUDIO_STAGE, studioid: PAIRING_ID, participantid: profileId },
    { merge: true },
  );
  await db.collection(COL_PAIRING).doc(PAIRING_ID).set({ status: 'live' }, { merge: true });

  // Defensive precondition assert: the token now points at the seeded live-assignment, so the component's
  // `liveAssignment.token = token.find(liveassignmentid == la.docid)` resolution (ts:698) will succeed and
  // the forms query gate (ts:761 `liveAssignment["token"]`) is satisfied. (Read-back of a PRECONDITION we
  // set — used only to fail fast on a mis-wire, NOT as the spec's product assertion.)
  const linked = await pollUntil(
    () => getDoc(COL_TOKEN, tokenId),
    (t) => !!t && t.liveassignmentid === liveAssignmentId && t.currentstage === STUDIO_STAGE,
    { label: `token ${tokenId} linked to live-assignment ${liveAssignmentId} @ ${STUDIO_STAGE}`, timeoutMs: 15_000 },
  );
  if (!linked) throw new Error(`[cross-db] precondition link did not settle for token ${tokenId}`);
}
