// profiles.ts — actors, login, and the per-test external/prod stub installer for the Participant
// Profiles & Analytics suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (FCM/Wati/
// email/Zoom/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no profile
// screen can hit a real production Cloud Function (sendBatchEmail / sendWhatsAppBroadcast) or any
// prod HTTPS endpoint. The analytics screen also lazily initialises a secondary "watson" Firebase
// app (gRPC, NOT covered by the HTTP firewall) — we never drive a Watson-backed checklist, so the
// silent init failure is tolerated by the console guard (IGNORABLE includes the transport noise).
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.PROF_RUNID || 'prof';
export const PASSWORD = 'Test!1234';

/** Seeded profiles actors (seed-profiles.js roster). */
export const profActors = {
  admin: `admin+${RUN}@example.com`,            // roles {admin, ah, developer} — fullAccess super-role
  p0: `participant0+${RUN}@example.com`,
  p1: `participant1+${RUN}@example.com`,
  p2: `participant2+${RUN}@example.com`,
  p3: `participant3+${RUN}@example.com`,
};

/** Seeded profileids (doc ids in profile_data / participant metadata; the specs navigate to these). */
export const profProfileIds = {
  admin: `${RUN}_pf_admin`,
  p0: `${RUN}_pf_p0`,
  p1: `${RUN}_pf_p1`,
  p2: `${RUN}_pf_p2`,
  p3: `${RUN}_pf_p3`,
  cfProfile: `${RUN}_cfprofile`,
  prodProfile: `${RUN}_prodprofile`, // dedicated to the productsdata_to_pmd projection CF cases
};

/** Seeded doc ids the deep specs reference (mirror of seed-profiles.js ID map). */
export const profDocIds = {
  P1: `${RUN}_P1`,            // products ref the PPCF/PP0 point at
  P2: `${RUN}_P2`,            // second products ref (productcount-map case)
  PKG1: `${RUN}_PKG1`,        // package ref
  PPCF: `${RUN}_PP_cf`,       // the participantsproduct row the product-CF cases drive
  PPCF2: `${RUN}_PP_cf2`,     // a second product row (productcount-map case; created+deleted in-test)
  FBC0: `${RUN}_FBC0`,        // formsByClient row (forms DB) — PA-14 like toggle
};

/** Seeded friendly display names (the UNIQUE text the specs filter table rows by). */
export const profNames = {
  p0: `Profile Test User Zero ${RUN}`,
  p1: `Profile Test User One ${RUN}`,
  p2: `Profile Test User Two ${RUN}`,
  p3: `Profile Test User Three ${RUN}`,
};

/** The uP! Life Report formid the form-tracker tab-2 query filters by. */
export const UP_LIFE_REPORT_FORMID = 'QundpMXgXlXiCJYZ7WU4';

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installProfileStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded super-role admin. */
export async function loginAsProfileAdmin(page: Page): Promise<void> {
  await loginAs(page, profActors.admin, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset a participant metadata doc's `customerstatus` back to a known PRECONDITION value (so the
 * customer-status-editor write test is order- and re-run-independent). PRECONDITION write only — the
 * test asserts the value the APP writes on the real Update Status click, never this reset value
 * (anti-circularity). Idempotent (admin set merge).
 */
export async function resetCustomerStatus(profileId: string, value = 'active'): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('participant metadata').doc(profileId).set({ customerstatus: value }, { merge: true });
}

/**
 * Reset the CF-only profile's `name` back to its ORIGINAL value so the metadata-sync CF test always
 * starts from a known baseline and the subsequent mutation is a real change (the CF only fires on a
 * field change — recon gotcha #8). PRECONDITION write only.
 */
export async function resetCfProfileName(profileId: string, originalName: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('profile_data').doc(profileId).set({ name: originalName }, { merge: true });
}

/** Set the CF-only profile's `name` to a NEW value via the admin SDK (the action the CF reacts to). */
export async function setCfProfileName(profileId: string, newName: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('profile_data').doc(profileId).set({ name: newName }, { merge: true });
}

// ---------------------------------------------------------------------------------------------------
// view-participants-form like-toggle (PA-14) — forms DB (firestore-forms) read + precondition reset.
// ---------------------------------------------------------------------------------------------------

/** Read a formsByClient doc from the FORMS DB (firestore-forms) by id — the named-DB the app writes to
 *  via getFirestore("firestore-forms"). Returns `{ id, ...data }` or null. We assert the value the APP
 *  wrote on the real like click, never a value the test wrote. */
export async function getFormDoc(docId: string): Promise<Record<string, unknown> | null> {
  const admin = seed.initAdmin();
  const formsDb = seed.getFormsDb(admin);
  const snap = await formsDb.collection('formsByClient').doc(docId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}

/** Reset a formsByClient doc's `liked` flag back to a KNOWN baseline (false) in the FORMS DB so the
 *  like-toggle write case is order- and re-run-independent. PRECONDITION write only (anti-circular). */
export async function resetFormLike(docId: string, value = false): Promise<void> {
  const admin = seed.initAdmin();
  const formsDb = seed.getFormsDb(admin);
  await formsDb.collection('formsByClient').doc(docId).set({ liked: value, likedetails: null }, { merge: true });
}

// ---------------------------------------------------------------------------------------------------
// productsdata_to_pmd projection CF (PA-CF-04/05) — drive participantsproduct status, assert metadata.
// ---------------------------------------------------------------------------------------------------

/** Reset the product-CF subject (PPCF) to the ONGOING precondition and delete any sibling row a prior
 *  run left, so the projection cases start from one ongoing product (activeproduct=[P1]). The CF only
 *  fires on a real status/package change (participantmetadata.js:495), so the subsequent flip is a true
 *  change. PRECONDITION only — we assert the CF output (consumedproducts / productcount), not this. */
export async function resetProductCf(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const productRef = db.collection('products').doc(profDocIds.P1);
  const packageRef = db.collection('package').doc(profDocIds.PKG1);
  // delete the second row first so the rebuild starts from a single product
  await db.collection('participantsproduct').doc(profDocIds.PPCF2).delete().catch(() => {});
  await db.collection('participantsproduct').doc(profDocIds.PPCF).set({
    docid: profDocIds.PPCF, profileid: profProfileIds.prodProfile, productref: productRef,
    packageref: packageRef, status: 'ongoing', mode: 'Priority Mode', sequenceorder: 1,
    _testdata: true, testrunid: RUN,
  }, { merge: true });
}

/** Flip the product-CF subject (PPCF) to a new status (the action productsdata_to_pmd reacts to). */
export async function setProductCfStatus(status: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('participantsproduct').doc(profDocIds.PPCF).update({ status });
}

/** Create a SECOND participantsproduct row for the product-CF profile pointing at productId, at the
 *  given status — used to assert the productcount map aggregates across rows. Returns the row id. */
export async function addProductCfSibling(productId: string, status: string): Promise<string> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const productRef = db.collection('products').doc(productId);
  const packageRef = db.collection('package').doc(profDocIds.PKG1);
  await db.collection('participantsproduct').doc(profDocIds.PPCF2).set({
    docid: profDocIds.PPCF2, profileid: profProfileIds.prodProfile, productref: productRef,
    packageref: packageRef, status, mode: 'Priority Mode', sequenceorder: 2,
    _testdata: true, testrunid: RUN,
  });
  return profDocIds.PPCF2;
}

/** Delete the product-CF sibling row (cleanup so a later projection case starts clean). */
export async function deleteProductCfSibling(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('participantsproduct').doc(profDocIds.PPCF2).delete().catch(() => {});
}
