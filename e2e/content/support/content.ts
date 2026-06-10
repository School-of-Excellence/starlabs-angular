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
  RMP1: `${RUN}_RMP1`,
  // CN-11 dialog drivers (journey/product/biglevel) — assert the new tier-access-config carries TIER2.
  J1: `${RUN}_J1`, PR1: `${RUN}_PR1`, BL1: `${RUN}_BL1`,
  // CN-06/07 CF subjects the deep spec seeds+mutates itself (gated: content CFs not deployed).
  EPHLS: `${RUN}_EPHLS`, CUHLS: `${RUN}_CUHLS`,
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
/** Seeded CN-17 tier-bucket participants (participant metadata with firebaseuserref + name + tier:[TIER1]). */
export const tierProfiles = [`${RUN}_tier_p0`, `${RUN}_tier_p1`];

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installContentStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/**
 * Stub Firebase Storage so the upload flows (CN-04 add-series thumbnail, CN-14 ads thumbnail) resolve
 * WITHOUT creating a real object in the test project's Storage bucket. The modular SDK's
 * `uploadBytes(ref,file)` POSTs to `firebasestorage.googleapis.com/v0/b/<bucket>/o?name=<path>` and reads
 * back JSON metadata; `getDownloadURL(ref)` then GETs the object metadata to read `downloadTokens`. We
 * fulfill both with a benign metadata body carrying a token, so the SDK returns a stable HTTPS URL the
 * app writes into Firestore. This keeps the assertion anti-circular (we assert the doc the APP wrote, the
 * url field is incidental) and avoids polluting Storage. Call AFTER installContentStubs (it adds a
 * narrower route that takes precedence over the firewall's catch-all for the Storage host).
 */
export async function installStorageStub(page: Page): Promise<void> {
  const TOKEN = 'e2e-stub-token';
  await page.route('**/firebasestorage.googleapis.com/**', async (route) => {
    const url = route.request().url();
    // object PATH is everything after `/o/` (or the `?name=` query on upload).
    let objectPath = '';
    const mName = /[?&]name=([^&]+)/.exec(url);
    const mO = /\/o\/([^?]+)/.exec(url);
    if (mName) objectPath = decodeURIComponent(mName[1]);
    else if (mO) objectPath = decodeURIComponent(mO[1]);
    const bucket = (/\/b\/([^/]+)\//.exec(url) || [])[1] || 'slabs-queue-e2e-exdcz.firebasestorage.app';
    // metadata body the Storage SDK accepts for both the upload response and the getDownloadURL read.
    const body = JSON.stringify({
      name: objectPath, bucket, contentType: 'image/png', size: '70', generation: '1',
      downloadTokens: TOKEN,
      mediaLink: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=${TOKEN}`,
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
}

/** A tiny 1x1 transparent PNG as a Playwright in-memory file payload (≤1 KB; never hits real Storage). */
export const TINY_PNG = {
  name: 'e2e-thumb.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
};

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

// ---- CN-04: create-series episode arrayUnion precondition -------------------------------------------
/**
 * Reset the seeded EP1 episode's `series` array to empty so CN-04's "the app's writeBatch arrayUnion adds
 * the NEW series ref" assertion is exact and re-runnable, and delete any prior run's app-created series.
 * Returns the episode id the spec selects. PRECONDITION write only.
 */
export async function resetSeriesEpisode(): Promise<string> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('episodes').doc(contentIds.EP1).set({ series: [] }, { merge: true });
  return contentIds.EP1;
}
/** Delete any `series` doc the prior CN-04 run created (matched by run-unique seriesName), so re-runs
 *  start clean. App-written docs carry NO testrunid → matched by their natural key (the name). */
export async function deleteCreatedSeries(seriesName: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('series').where('seriesName', '==', seriesName).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ---- CN-11: tier-access-config add precondition -----------------------------------------------------
/** Remove any tier-access-config row for TIER2 (so the CN-11 add dialog re-offers TIER2 and the post-
 *  submit count is exact). App-written → matched by tierid. PRECONDITION write only. */
export async function resetTierAccessConfigForTier2(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('tier access config').where('tierid', '==', contentIds.TIER2).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ---- CN-16: RecommendedPlaylistTrigger_to_pmd direct CF subject --------------------------------------
/** Clear the CN-16 merge target so the assertion is exact: delete the RMP1 doc and reset the target
 *  profile's `solarvoice` map to empty. PRECONDITION writes only — the spec asserts the CF's merge. */
export async function resetRecommendedMix(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('recommended mix playlist').doc(contentIds.RMP1).delete().catch(() => {});
  // reset the target profile metadata's solarvoice map (the CF merges INTO this).
  await db.collection('participant metadata').doc(bufferProfiles[0]).set(
    { profileid: bufferProfiles[0], solarvoice: {} }, { merge: true },
  );
}
/**
 * Create a single `recommended mix playlist` doc to FIRE RecommendedPlaylistTrigger_to_pmd (a deployed
 * *_to_pmd CF). The CF reads {id,list,profileid,type} and merges `{ [id]: list.map(e=>e.id) }` into
 * `participant metadata/{profileid}[type]`. Returns the content ref id the CF should merge in. The spec
 * asserts that CF-COMPUTED merge — never this seeded doc. PRECONDITION write only.
 */
export async function createRecommendedMix(): Promise<{ rmpKey: string; contentId: string }> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const rmpKey = `e2e_rmp_${RUN}_${Date.now()}`; // the map KEY the CF writes under (data['id'])
  const contentRef = db.collection('solar voice audios').doc(contentIds.AUD1);
  await db.collection('recommended mix playlist').doc(contentIds.RMP1).set({
    docid: contentIds.RMP1, id: rmpKey, profileid: bufferProfiles[0], type: 'solarvoice',
    list: [contentRef], title: `TEST_RMP_${RUN}`, date: T.now(), testrunid: RUN, _testdata: true,
  });
  return { rmpKey, contentId: contentIds.AUD1 };
}

// ---- CN-06 / CN-07: HLS Cloud-Function subjects (gated — content CFs NOT deployed) -------------------
/**
 * Seed the CN-06 episode subject as UN-converted (convertedtohls:false, no responsepublitio) so that
 * mutating its videoUrl can trigger ConvertUrltoHLS. Deletes-then-creates for a clean onWrite. Returns
 * the doc id. PRECONDITION write — the spec asserts the CF-set convertedtohls:true.
 */
export async function resetHlsEpisode(): Promise<string> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  await db.collection('episodes').doc(contentIds.EPHLS).set({
    docid: contentIds.EPHLS, title: `TEST_EP_HLS_${RUN}`, description: 'CN-06 HLS subject',
    videoUrl: 'https://example.com/cn06-base.mp4', imageUrl: 'https://example.com/cn06.jpg',
    convertedtohls: false, series: [], date: T.now(), testrunid: RUN, _testdata: true,
  });
  return contentIds.EPHLS;
}
/**
 * Seed the CN-07 content_urls subject as UN-converted (convertedtohls:false, hlsstatus:null) so mutating
 * its url can trigger generalContentUpdate → uploadContentToPublitio. Returns the doc id. PRECONDITION
 * write — the spec asserts the CF-set hlsstatus 'uploaded'.
 */
export async function resetHlsContentUrl(): Promise<string> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  await db.collection('content_urls').doc(contentIds.CUHLS).set({
    docid: contentIds.CUHLS, title: `TEST_CU_HLS_${RUN}`, url: 'https://example.com/cn07-base.mp4',
    thumbnail: 'https://example.com/cn07.jpg', convertedtohls: false, hlsstatus: null,
    available: true, added: T.now(), testrunid: RUN, _testdata: true,
  });
  return contentIds.CUHLS;
}
