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
  // App-Engagement deep cases
  EWL_FORM: `${RUN}_ewl_form`,
  EWL_CFDONE: `${RUN}_ewl_cfdone`,
  EWQ_Q1: `${RUN}_ewq_q1`,
  ASKAH_FLAG: `${RUN}_askah_flag`,
  ASKAH_RENDER: `${RUN}_askah_render`,
  IRL_COMPLETED: `${RUN}_irl_completed`,
  IRL_ONGOING: `${RUN}_irl_ongoing`,
  BUF1: `${RUN}_buffermix1`,
  RMP1: `${RUN}_rmp1`,
  RMP2: `${RUN}_rmp2`,
  AAP_NONEMPTY: `${RUN}_pf_p0`,
  AAP_EMPTY: `${RUN}_pf_p1`,
};

/** Run-unique content strings the specs assert against (mirror of seed-modes.js). */
export const modeContent = {
  askahFlag: `ASKAH flag subject ${RUN}`,
  askahRender: `ASKAH render subject ${RUN}`,
  bufGroupTitle: `TEST Mode Playlist Group ${RUN}`,
  formContact: 'formtester@example.com',
  cfContact: 'cftester@example.com',
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

/**
 * PM-14 precondition reset: restore the seeded `ask AH` row to tagged:false (no tagdetails) so the
 * flag-click → tagged:true assertion is re-run-stable. PRECONDITION only — PM-14 asserts the value the
 * APP writes on the real flag click (tagged:true + tagdetails.user), never this reset value.
 */
export async function resetAskAhUnflagged(docid: string, profileid: string, askah: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('ask AH').doc(docid).set(
    { docid, profileid, askah, tagged: false, tagdetails: null, liked: false, created: admin.firestore.Timestamp.now() },
    { merge: true },
  );
}

/**
 * PM-16 precondition reset: restore the buffermix-archive group + its 2 linked playlist docs to
 * delete:false so the disable-cascade assertion (group→true, both linked→true) is re-run-stable.
 * PRECONDITION only — PM-16 asserts the delete:true the APP's cascade writes. The buffermix `date` is
 * refreshed to now() so it stays inside the screen's default 3-month load window on re-runs.
 */
export async function resetPlaylistGroupEnabled(bufId: string, rmpIds: string[]): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const bufRef = db.collection('buffermix archive').doc(bufId);
  await bufRef.set({ delete: false, date: admin.firestore.Timestamp.now() }, { merge: true });
  for (const id of rmpIds) {
    await db.collection('recommended mix playlist').doc(id).set(
      { delete: false, bufferdocref: bufRef, date: admin.firestore.Timestamp.now() }, { merge: true },
    );
  }
}

/**
 * PM-08 precondition reset: restore the public-form wishlist doc to status:'sended' with its single
 * gmail contact submitted:false (and strip any prior-run wishlistquestionmap). PRECONDITION only —
 * PM-08 asserts the contact.submitted:true + wishlistquestionmap the APP writes on the real form submit.
 * The doc is reset to 'sended' (NEVER 'sent'), so no external Wati/Postmark send is ever triggered.
 */
export async function resetWishlistFormSubject(docid: string, profileid: string, contact: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('evolutionwishlistlog').doc(docid).set({
    docid, profileid, type: 'familyandpeers', status: 'sended',
    contacts: [{ name: 'Form Tester', type: 'gmail', contact, submitted: false, status: 'sended' }],
    created: admin.firestore.Timestamp.now(),
  }, { merge: false });
}

/**
 * PM-09 precondition reset: restore the CF-subject wishlist doc to status:'sended' with its single
 * contact already status:'received' (the all-received precondition the CF's :91 branch tallies).
 * PRECONDITION only — PM-09 asserts the status:'completed' the CF writes. NEVER 'sent'.
 */
export async function resetWishlistCfDoneSubject(docid: string, profileid: string, contact: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('evolutionwishlistlog').doc(docid).set({
    docid, profileid, type: 'familyandpeers', status: 'sended',
    contacts: [{ name: 'CF Tester', type: 'gmail', contact, submitted: true, status: 'received' }],
    created: admin.firestore.Timestamp.now(),
  }, { merge: false });
}

/**
 * Build the `?data=` query param the public form parses: `JSON.parse(decodeURIComponent(data))`.
 * The form needs `docid` (to load the wishlist doc) + `contact` (to find the matching contact);
 * `profilename` is shown in the form copy.
 */
export function encodeWishlistFormData(docid: string, contact: string, profilename: string): string {
  return encodeURIComponent(JSON.stringify({ docid, contact, profilename }));
}

/**
 * Runtime probe: does the `interimreport log` composite index (lastupdate DESC, createdon DESC) —
 * required by fetchInterimLog()'s orderBy('lastupdate') + range(createdon) query — exist in the test
 * project? We replicate the exact query; a missing index throws FAILED_PRECONDITION (code 9). Returns
 * true iff the query succeeds. PM-15 skip-guards on this: the index is shared infra we must NOT add to
 * firestore.indexes.json (it races other agents) — it is RETURNED in the deepening run's neededIndexes
 * instead, and PM-15 becomes GREEN once it is deployed. Mirrors the CF skip-guard discipline.
 */
export async function isInterimLogIndexReady(): Promise<boolean> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setMonth(end.getMonth() + 1); end.setDate(0); end.setHours(23, 59, 59, 999);
  try {
    await db.collection('interimreport log')
      .orderBy('lastupdate', 'desc')
      .where('createdon', '>=', T.fromDate(start))
      .where('createdon', '<=', T.fromDate(end))
      .limit(1)
      .get();
    return true;
  } catch (e) {
    const code = (e as { code?: number | string }).code;
    if (code === 9 || code === 'failed-precondition' || /requires an index/i.test((e as Error).message)) return false;
    throw e; // an unexpected error should surface, not silently skip
  }
}

/**
 * Runtime probe: is `evolutionFamilyWishlistOnWrite` (wishlist.js) DEPLOYED to the test project?
 * This CF is NOT in the project's deployed set (only calculateParticipantMode + the *_to_pmd family +
 * the queue CFs are), so PM-09 must skip-guard. We seed a disposable `status:'sended' + all-received`
 * doc, write a trivial re-trigger, and watch for the CF's status→'completed'. Returns true iff it fires
 * within the window. Cleans up its probe doc. Used by PM-09 to test.skip with a documented reason.
 */
export async function isWishlistCfDeployed(timeoutMs = 25_000): Promise<boolean> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const probeId = `${RUN}_cfprobe_wishlist`;
  const ref = db.collection('evolutionwishlistlog').doc(probeId);
  try {
    await ref.set({
      docid: probeId, profileid: `${RUN}_pf_p0`, type: 'familyandpeers', status: 'sended',
      contacts: [{ name: 'Probe', type: 'gmail', contact: 'probe@example.com', submitted: true, status: 'received' }],
      _testdata: true, testrunid: RUN,
    });
    await ref.update({ _probe_touch: Date.now() }); // re-trigger the onWrite
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const snap = await ref.get();
      if (snap.exists && (snap.data() as Record<string, unknown>).status === 'completed') return true;
      if (Date.now() >= deadline) return false;
    }
  } finally {
    await ref.delete().catch(() => {});
  }
}
