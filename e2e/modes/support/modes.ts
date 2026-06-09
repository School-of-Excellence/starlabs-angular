// modes.ts — actors, login, and the per-test external/prod stub installer for the Product Modes &
// App Engagement suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (FCM/Wati/
// email/Zoom/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no mode screen
// can hit a real production Cloud Function (sendBatchEmail / sendWhatsAppBroadcast /
// workshopprogressmessage prod URLs) from the browser.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.MODE_RUNID || 'mode';
export const PASSWORD = 'Test!1234';

/** Seeded mode actors (seed-modes.js roster). */
export const modeActors = {
  admin: `admin+${RUN}@example.com`,         // roles {admin, ah} — super-role (sees all mode screens)
  developer: `developer+${RUN}@example.com`, // roles {admin, developer} — wishlist-log fullAccess
  participant0: `participant0+${RUN}@example.com`,
  participant1: `participant1+${RUN}@example.com`,
};

/** Seeded profileids (for asserting app-written refs / counts). */
export const modeProfileIds = {
  admin: `${RUN}_pf_admin`,
  developer: `${RUN}_pf_developer`,
  participant0: `${RUN}_pf_p0`,
  participant1: `${RUN}_pf_p1`,
};

/** Seeded doc-ids the specs assert against (mirror of seed-modes.js ID). */
export const modeIds = {
  P1: `${RUN}_P1`,
  P2: `${RUN}_P2`,
  PMC_P1_INTEG: `${RUN}_PMC_P1_integ`,
  PMC_P2_INTEG: `${RUN}_PMC_P2_integ`,
  PP1: `${RUN}_PP1`,
  EWL_INIT: `${RUN}_ewl_initiated`,
  EWL_CANCEL: `${RUN}_ewl_cancelled`,
};

/** Searchable product names the config UI renders (must match seed-modes.js). */
export const productNames = {
  P1: `TEST Mode CF Product ${RUN}`,
  P2: `TEST Mode Config Product ${RUN}`,
};

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installModeStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded super-role admin. */
export async function loginAsModeAdmin(page: Page): Promise<void> {
  await loginAs(page, modeActors.admin, PASSWORD);
}

/** Log in as the seeded developer (unlocks the wishlist-log destructive-action column). */
export async function loginAsModeDeveloper(page: Page): Promise<void> {
  await loginAs(page, modeActors.developer, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset the seeded "initiated" wishlist row back to its precondition (status:'initiated', no
 * closedbeforeshare). PRECONDITION write only — PM-07 asserts the value the APP writes on the real
 * cancel click, never this reset value (anti-circularity). Idempotent for re-runs.
 */
export async function resetWishlistInitiated(docid: string, profileid: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('evolutionwishlistlog').doc(docid).set(
    { docid, profileid, type: 'familyandpeers', status: 'initiated', closedbeforeshare: false, created: admin.firestore.Timestamp.now() },
    { merge: true },
  );
}

/**
 * PM-06 precondition reset: ensure participant1 has EXACTLY the seeded cancelled row and NO leftover
 * "initiated" row from a prior PM-06 run (so the post-action count of initiated rows is a clean 1).
 * Deletes any extra evolutionwishlistlog docs for participant1 that are NOT the seeded cancelled doc,
 * then re-asserts the cancelled doc. PRECONDITION only — the spec asserts the doc the APP creates.
 */
export async function resetReinitiateSubject(cancelDocId: string, profileid: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('evolutionwishlistlog').where('profileid', '==', profileid).get();
  const batch = db.batch();
  snap.docs.forEach((d) => { if (d.id !== cancelDocId) batch.delete(d.ref); });
  await batch.commit();
  await db.collection('evolutionwishlistlog').doc(cancelDocId).set(
    { docid: cancelDocId, profileid, type: 'familyandpeers', status: 'cancelled', closedbeforeshare: true, created: admin.firestore.Timestamp.fromMillis(Date.now() - 3600e3) },
    { merge: true },
  );
}

/**
 * PM-05 precondition reset: restore (P2, Integration Mode) config to EXACTLY 2 widgets so the
 * "add one → 3" assertion is re-run-stable. PRECONDITION only.
 */
export async function resetP2IntegConfig(docid: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('product mode config').doc(docid).set({
    docid,
    productref: db.collection('products').doc(modeIds.P2),
    mode: 'Integration Mode',
    widgets: [
      { widgetid: 'cycleofevolution', title: 'Start Cycle of Evolution', reference: [], dos: [], donts: [], mandatory: false },
      { widgetid: 'impactstats', title: 'Impact & Non Impact Stats', reference: [], dos: [], donts: [], mandatory: false },
    ],
    modetips: [], lastupdate: admin.firestore.Timestamp.now(),
  }, { merge: true });
}

/**
 * PM-04 precondition reset: ensure (P2, Performance Mode) has NO config doc, so the save creates a
 * brand-new one with widgets.length==1. Deletes any product mode config doc for (P2, Performance Mode)
 * (the app generates a random doc id on first save, so we sweep by query). PRECONDITION only.
 */
export async function resetP2PerfConfigAbsent(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('product mode config')
    .where('productref', '==', db.collection('products').doc(modeIds.P2))
    .where('mode', '==', 'Performance Mode').get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/**
 * PM-10/11 precondition reset: put the CF-completion subject back to status:'ongoing' with mode/
 * nextmode cleared, and remove any prior CF-written checklist / evolution-log / completion artifacts
 * so the assertion (count==1, participantmode=="Integration Mode") is re-run-stable. PRECONDITION
 * only — the spec asserts the value the CF writes after the real status→completed transition.
 */
export async function resetCfCompletionSubject(ppId: string, profileid: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // delete prior CF artifacts for this profile
  for (const col of ['participant mode checklist', 'evolution log']) {
    const s = await db.collection(col).where('profileid', '==', profileid).get();
    const b = db.batch();
    s.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  // put the product back to the ongoing precondition. DELETE statusdate entirely (FieldValue.delete) —
  // a `set({statusdate:{}},{merge:true})` does NOT remove a prior run's statusdate.completed (empty-map
  // merge is a no-op on existing keys), so the CF's completion branch (which requires NO pre-existing
  // statusdate.completed, participantmode.js:80) would never re-fire on the 2nd case. Deleting it makes
  // each completion re-trigger the branch.
  await db.collection('participantsproduct').doc(ppId).set({
    docid: ppId, profileid, productref: db.collection('products').doc(modeIds.P1),
    mode: 'Priority Mode', nextmode: null, nextmodedate: null,
    deliverymode: 'Priority Mode', status: 'ongoing', statusdate: admin.firestore.FieldValue.delete(), sequenceorder: 0, aelid: null,
  }, { merge: true });
  // clear the headline modes so the transition is observable
  await db.collection('profile_data').doc(profileid).set({ participantmode: null }, { merge: true });
  await db.collection('participant metadata').doc(profileid).set({ participantmode: null, customerstatus: 'active' }, { merge: true });
}
