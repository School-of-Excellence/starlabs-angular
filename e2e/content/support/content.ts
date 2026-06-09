// content.ts — actors, login, the per-test external/prod stub installer, and idempotent precondition
// resets for the Content & Engagement suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (Zoom/FCM/Wati/
// email/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no content screen can
// hit a real production Cloud Function (uploadContentToPublitio prod URL) or open a real external window.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.CONT_RUNID || 'cont';
export const PASSWORD = 'Test!1234';

/** Seeded content actor (seed-content.js roster) — admin+ah super-role passes every content guard. */
export const contentActors = {
  admin: `admin+${RUN}@example.com`,
};

/** Seeded ids the specs assert the app's reads/writes against. Keep in sync with seed-content.js ID. */
export const contentIds = {
  AUD1: `${RUN}_AUD1`, AUD2: `${RUN}_AUD2`, AUD3: `${RUN}_AUD3`,
  PLAY1: `${RUN}_PLAY1`,
  EP1: `${RUN}_EP1`, EP2: `${RUN}_EP2`,
  SER1: `${RUN}_SER1`, SER2: `${RUN}_SER2`,
  CAT1: `${RUN}_CAT1`,
  TIER1: `${RUN}_TIER1`, TIER2: `${RUN}_TIER2`, TAC1: `${RUN}_TAC1`,
  HS1: `${RUN}_HS1`,
  ADS1: `${RUN}_ADS1`,
  LM1: `${RUN}_LM1`,
  CU1: `${RUN}_CU1`,
  BUF1: `${RUN}_BUF1`,
};

/** Seeded run-unique TEXT the specs match MatTable rows by (most content screens have no data-testid). */
export const contentText = {
  audioNamePrefix: `TEST_AUDIO_${RUN}`,
  playlistName: `TEST_PLAYLIST_${RUN}`,
  seriesFree: `TEST_SERIES_FREE_${RUN}`,
  seriesExcl: `TEST_SERIES_EXCL_${RUN}`,
  category: `TEST_CAT_${RUN}`,
  health: `TEST_HEALTH_${RUN}`,
  ad: `TEST_AD_${RUN}`,
  buffermix: `TEST_BUF_${RUN}`,
};

/** Seeded content-analytics profileids (3 solarvoice-only, 2 eiflix-only). */
export const analyticsProfiles = {
  solarvoice: [`${RUN}_ca_sv0`, `${RUN}_ca_sv1`, `${RUN}_ca_sv2`],
  eiflix: [`${RUN}_ca_ei0`, `${RUN}_ca_ei1`],
};
export const bufferProfiles = [`${RUN}_buf_p0`, `${RUN}_buf_p1`];

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installContentStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded content admin (admin+ah super-role). */
export async function loginAsContentAdmin(page: Page): Promise<void> {
  await loginAs(page, contentActors.admin, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset the seeded health story back to its UN-edited subject, so CN-13's edit-then-assert is re-run
 * independent. PRECONDITION write only — the test asserts the value the APP writes on the real submit,
 * never this reset value (anti-circularity).
 */
export async function resetHealthStory(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('health stories').doc(contentIds.HS1).set(
    { subject: `TEST_HEALTH_${RUN}`, description: 'seed health story', images: ['https://example.com/hs.jpg'], delete: false },
    { merge: true },
  );
}

/**
 * Reset the buffermix → recommended-mix-playlist CF chain to its PRE-FIRED precondition: delete every
 * `recommended mix playlist` doc the prior run's CF emitted for this buffermix (matched by the run-unique
 * title), and rewrite the buffermix doc with status:null. The spec then re-triggers the CF and asserts
 * the CF-COMPUTED fan-out count — never this reset state. Idempotent.
 */
export async function resetBuffermix(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  // delete prior fan-out (CF output) so the count assertion is exact on re-run
  const prior = await db.collection('recommended mix playlist').where('title', '==', `TEST_BUF_${RUN}`).get();
  const batch = db.batch();
  prior.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  // rewrite the buffermix as un-fired (status:null). NOTE: this is a fresh set() — the onDocumentCreated
  // trigger fires on CREATE; to re-fire on a serial re-run we delete then recreate.
  await db.collection('buffermix archive').doc(contentIds.BUF1).delete().catch(() => {});
}

/**
 * (Re)create the buffermix doc to TRIGGER the onDocumentCreated CF. Separated from resetBuffermix so the
 * spec controls the create moment. PRECONDITION write — the assertion reads the CF's fan-out, not this.
 */
export async function createBuffermix(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const now = T.now();
  const future = T.fromMillis(Date.now() + 7 * 86400e3);
  await db.collection('buffermix archive').doc(contentIds.BUF1).set({
    docid: contentIds.BUF1, title: `TEST_BUF_${RUN}`, description: 'seed buffermix',
    profileid: bufferProfiles,
    solarvoice: [db.collection('solar voice audios').doc(contentIds.AUD1)],
    eiflix: [], generalcontent: [],
    personalised: false, status: null,
    date: now, expiredate: future, testrunid: RUN, _testdata: true,
  });
}
