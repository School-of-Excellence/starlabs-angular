// journey.ts — actors, login, the per-test external/prod stub installer, and a Watson/SalesCRM-tolerant
// console guard for the Journey & Products suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (FCM/Wati/email/
// Zoom/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no journey screen can
// hit a real production Cloud Function (breakthroughapprovedleads / sendBatchEmail / the overall-dashboard
// Watson+salescrm HTTP CFs) or any prod HTTPS endpoint.
//
// WATSON / SALESCRM (GROUP NOTES, recon R-02/R-03): journey-product-purchase + journeyplan lazily init a
// SEPARATE "watson" Firebase app via getApp("watson"); saleslead/onboarding-pipeline use getApp("salescrm").
// In the test build environment.ts carries NO `watson`/`salescrm` keys, so AuthguardService.initializeWatson()
// SKIPS initializeApp and getApp("watson") THROWS (gRPC app, NOT covered by the HTTP firewall). We NEVER
// drive a Watson/SalesCRM action — the screens we exercise (catalog authoring, purchase/journeysupport
// RENDER) only fail the init silently inside a .then() (an unhandled rejection / console error), never a
// functional break. attachJourneyGuard() therefore extends the queue IGNORABLE list with the EXACT
// "Firebase: No Firebase App 'watson'/'salescrm'" wording (anchored tightly so a genuine app error is
// still caught). NO Watson/SalesCRM doc is ever read for an assertion. See README/blockers.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';
import { attachConsoleGuard, IGNORABLE, isFatal, ConsoleGuard } from '../../queue/support/console-guard';

const RUN = process.env.JNY_RUNID || 'jny';
export const PASSWORD = 'Test!1234';

/** Seeded journey actors (seed-journey.js roster). */
export const journeyActors = {
  admin: `admin+${RUN}@example.com`,            // roles {admin, ah} — super-role (sees all catalog/participant screens)
  journeycoach: `journeycoach+${RUN}@example.com`,
  integrator: `integrator+${RUN}@example.com`,
  participant0: `participant0+${RUN}@example.com`,
  participant1: `participant1+${RUN}@example.com`,
  participant2: `participant2+${RUN}@example.com`,
};

/** Seeded profileids (doc ids in profile_data / participant metadata; the :pid routes navigate to these). */
export const journeyProfileIds = {
  admin: `${RUN}_pf_admin`,
  journeycoach: `${RUN}_pf_journeycoach`,
  integrator: `${RUN}_pf_integrator`,
  participant0: `${RUN}_pf_p0`,
  participant1: `${RUN}_pf_p1`,
  participant2: `${RUN}_pf_p2`,
};

/** The :pid for participantpurchase / journeysupport / participantdeliverysequence. */
export const PID = journeyProfileIds.participant0;
/** The :pid for the onboard / email-archive WRITE cases (JP-08/JP-09) — kept off PID. */
export const PID_ONB = journeyProfileIds.participant1;
/** The :pid for the purchase-save WRITE case (JP-06) — a clean-slate participant (0 seeded purchases). */
export const PID_PURCHASE = journeyProfileIds.participant2;

/** Seeded catalog + deep doc ids + the UNIQUE display text the specs assert against. */
export const journeyIds = {
  J1: `${RUN}_J1`, J2: `${RUN}_J2`, P1: `${RUN}_P1`, P2: `${RUN}_P2`,
  PKG1: `${RUN}_PKG1`, J2P1: `${RUN}_J2P1`, PDS1: `${RUN}_PDS1`,
  // deep
  PJP_ONB: `${RUN}_PJP_ONB`, SL1: `${RUN}_SL1`,
  DF1: `${RUN}_DF1`, APT1: `${RUN}_APT1`, EMT1: `${RUN}_EMT1`,
};
export const journeyNames = {
  journey1: `Test Journey ${RUN}`,
  journey2: `Test Journey Two ${RUN}`,
  product1: `Test Product ${RUN}`,
  product2: `Test Product Two ${RUN}`,
  package1: `Test Package ${RUN}`,
  salesLead: `Lead Reject Test ${RUN}`,
  deliveryForm: `Test Delivery Form ${RUN}`,
  apptType: `Test Appt Type ${RUN}`,
  emailTemplate: `Test Onboarding Template ${RUN}`,
  formField: `Participant Goal ${RUN}`,
};

/** Watson/SalesCRM "no app" inits that THROW by design in the test build (env has no watson/salescrm). */
const JOURNEY_IGNORABLE: RegExp[] = [
  /No Firebase App '?watson'?/i,
  /No Firebase App '?salescrm'?/i,
  // the SDK sometimes phrases the missing-app error differently depending on call site
  /Firebase App named '?watson'? already exists|app\/no-app/i,
];

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installJourneyStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/**
 * Console guard whose fatal filter ALSO tolerates the by-design Watson/SalesCRM "no app" init failures
 * (these screens lazily getApp("watson")/getApp("salescrm") and the test build never initialises those
 * apps — see file header). Everything else uses the shared queue IGNORABLE allowlist, so a genuine app
 * exception still fails the test.
 */
export function attachJourneyGuard(page: Page): ConsoleGuard {
  const guard = attachConsoleGuard(page);
  // Re-wrap: the underlying guard already filtered with the shared IGNORABLE; additionally drop any fatal
  // matching a Watson/SalesCRM no-app pattern (defensive — covers pageerror + console.error variants).
  const journeyFatal = (msg: string) => isFatal(msg) && !JOURNEY_IGNORABLE.some((re) => re.test(msg));
  return {
    get fatals() { return guard.fatals.filter(journeyFatal); },
    get all() { return guard.all; },
    dispose() { guard.dispose(); },
  } as ConsoleGuard;
}

/** Log in via the real Angular login form as the seeded super-role admin. */
export async function loginAsJourneyAdmin(page: Page): Promise<void> {
  await loginAs(page, journeyActors.admin, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Delete a catalog doc by its deterministic id (idempotent precondition reset for the WRITE tests, so a
 * re-run starts from the known "not yet added" state — anti-circularity: the test asserts the value the
 * APP writes on the real dialog Submit, never this reset). Safe: only ever the test project, only the
 * run-namespaced doc id. Used to remove a journey/journey-to-product the dialog re-creates.
 */
export async function deleteCatalogDoc(collection: string, docId: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection(collection).doc(docId).delete().catch(() => {});
}

/** True if a doc with this id currently exists (used to clean a dialog-created doc deterministically). */
export async function docExists(collection: string, docId: string): Promise<boolean> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection(collection).doc(docId).get();
  return snap.exists;
}

/**
 * Delete every doc in `collection` whose `field` equals `value` (idempotent precondition cleanup for the
 * dialog-WRITE tests, whose new doc gets an AUTO-GENERATED id we can't predict). The dialog-created journey
 * carries our unique test name, so we sweep by name before AND after the test. Anti-circular: this only
 * removes the test's OWN scaffolding; the assertion is the count the APP wrote, vs the count before. Safe:
 * only ever the test project (initAdmin allowlist).
 */
export async function deleteDocsByField(collection: string, field: string, value: unknown): Promise<number> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection(collection).where(field, '==', value).get();
  let n = 0;
  for (const d of snap.docs) { await d.ref.delete().catch(() => {}); n++; }
  return n;
}

// ── DEEP-case idempotent precondition resets (anti-circular: these only restore the KNOWN seeded
//    precondition; the asserted value is always the one the APP/CF writes on the real UI action). ──

/**
 * Reset an onboarding PJP to its not-yet-onboarded precondition (JP-08/JP-09 re-runnable). Restores
 * onboarded:false + clears the fields the OnboardingRemark submit sets, but KEEPS paymentplan truthy
 * (so the "Mark as Onboarded" button still renders) and journeystatus:'initiated' (so journeyplan
 * still selects this PJP as participantJourneyData). Pure setup — never the asserted value.
 */
export async function resetOnboardPjp(pjpId: string, profileId: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('participantjourneyproduct').doc(pjpId).set({
    docid: pjpId, profileid: profileId, journeyref: db.collection('journey').doc(`${RUN}_J1`),
    journeystatus: 'initiated', onboarded: false, paymentplan: 'EMI 3', purchaseref: null,
    participantproducts: [], opportunities: [], referral: null, appointmentid: null,
    onboardingscheduled: null, onboardedby: [], onboardedtime: null, onboardingreport: null,
    _testdata: true, testrunid: RUN,
  }, { merge: true });
}

/**
 * Re-assert the seeded onboarding `email templates` doc (active:true) for JP-09. `email templates` is a
 * GLOBAL collection on the shared cloud test project (only testrunid-scoped for teardown), so a concurrent
 * suite's teardown/seed can transiently sweep it between our seed and our test. Writing it again at the
 * test's precondition makes JP-09 immune to that race. Pure setup — the asserted value is the app's
 * email-archive write, not this template.
 */
export async function ensureEmailTemplate(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const id = `${RUN}_EMT1`;
  await db.collection('email templates').doc(id).set({
    docid: id, templatename: `Test Onboarding Template ${RUN}`, templatealias: `test_onboarding_${RUN}`,
    active: true, postmarkstatus: 'approved', subject: `Welcome ${RUN}`,
    htmlbody: '<p>Hello {{name}}, welcome to {{journey}}.</p>', attachments: [], servername: null,
    postmarktemplateid: null, templateid: `test_onboarding_${RUN}`, _testdata: true, testrunid: RUN,
  }, { merge: true });
}

/** Reset a salesleads doc to its pending precondition (status null, no reject notes) — JP-10 re-runnable. */
export async function resetSalesLeadPending(slId: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // FieldValue.delete() so the row reverts to the exact "no status yet" shape the Reject button gates on.
  await db.collection('salesleads').doc(slId).update({
    status: null, rejectnotes: admin.firestore.FieldValue.delete(),
    cancelled: admin.firestore.FieldValue.delete(),
  }).catch(() => {});
}

/**
 * Delete every APP-written doc for a profile that a deep WRITE case created (JP-06 purchase save:
 * journeyproductpurchase + participant purchase logs + the NEW participantsproduct/PJP docs the save
 * minted with auto-ids; JP-09 email archive). These carry NO testrunid, so we sweep by their natural
 * key (profileid). Anti-circular: this is teardown of the test's own scaffolding, never an assertion.
 * Returns counts so the spec can assert "0 before" deterministically.
 */
export async function cleanAppPurchaseWrites(profileId: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // Scalar-profileid collections.
  for (const col of ['journeyproductpurchase', 'participant purchase logs']) {
    const snap = await db.collection(col).where('profileid', '==', profileId).get().catch(() => ({ docs: [] as any[] }));
    for (const d of snap.docs) await d.ref.delete().catch(() => {});
  }
  // email archive stores profileid as an array.
  const ea = await db.collection('email archive').where('profileid', 'array-contains', profileId).get().catch(() => ({ docs: [] as any[] }));
  for (const d of ea.docs) await d.ref.delete().catch(() => {});
  // participantsproduct: the seeded ones (PP1/PP2 for p0) carry testrunid; the JP-06 save mints NEW
  // ones with auto-ids carrying profileid but NO testrunid → delete only the untagged extras so the
  // seeded baseline survives for the render cases.
  const pp = await db.collection('participantsproduct').where('profileid', '==', profileId).get().catch(() => ({ docs: [] as any[] }));
  for (const d of pp.docs) { if ((d.data() as any)?.testrunid !== RUN) await d.ref.delete().catch(() => {}); }
  // participantjourneyproduct: same — delete only auto-id (untagged) rows the save created.
  const pjp = await db.collection('participantjourneyproduct').where('profileid', '==', profileId).get().catch(() => ({ docs: [] as any[] }));
  for (const d of pjp.docs) { if ((d.data() as any)?.testrunid !== RUN) await d.ref.delete().catch(() => {}); }
}

/** Delete every productToDeliverySequence doc that references a given product PATH (JP-AUTH re-runnable
 *  — the authoring save mints an auto-id doc with NO testrunid; we sweep it by its product ref). */
export async function cleanProductDeliveryFor(productId: string): Promise<number> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('productToDeliverySequence').get();
  let n = 0;
  for (const d of snap.docs) {
    const ref = (d.data() as { product?: { id?: string } })?.product;
    // Skip the seeded baseline (PDS1, testrunid-tagged); delete only auto-id authoring writes for this product.
    if (ref?.id === productId && (d.data() as any)?.testrunid !== RUN) { await d.ref.delete().catch(() => {}); n++; }
  }
  return n;
}
