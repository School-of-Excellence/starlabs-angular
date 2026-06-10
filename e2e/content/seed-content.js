// @ts-nocheck
/**
 * seed-content.js — stand up the Content & Engagement world on the dedicated disposable test
 * project (slabs-queue-e2e-exdcz), reusing the proven queue-suite primitives (allowlist-guarded
 * admin init via seed-test-project, the staff auth chain, the dashboard route-grant doc shape).
 *
 * Mirrors e2e/recon-allcomp/content.md. PRODUCTION-SAFE BY CONSTRUCTION: every write goes through
 * seed.initAdmin() (hard-aborts off the test project), every data doc is tagged {testrunid:'cont',
 * _testdata:true}, and NO ATC collection is ever touched. The content screens read `atc taxonomy`
 * only as a cosmetic read-only tag lookup — we DELIBERATELY DO NOT seed it (CLAUDE.md), and the
 * dashboards render blank tag chips when it is absent, so no tested assertion depends on it.
 *
 * Actors (custom roster — content routes are gated to admin/ah/developer; an admin+ah super-role is
 * sufficient for every route guard in this group, see recon "Actors / roles"):
 *   admin+cont@example.com   roles {admin, ah}   — content operator: sees all content routes
 *
 * Usage:  node e2e/content/seed-content.js --seed | --teardown
 */
'use strict';

const { seed, seedDashboardRoutes, TAG } = require('../lib/seed-common');

const TESTRUNID = process.env.CONT_RUNID || 'cont';

// ---- deterministic doc ids (run-prefixed) -------------------------------------------------------
const ID = {
  // audio + playlist (Flow 1-4)
  AUD1: `${TESTRUNID}_AUD1`, AUD2: `${TESTRUNID}_AUD2`, AUD3: `${TESTRUNID}_AUD3`,
  PLAY1: `${TESTRUNID}_PLAY1`,
  // episodes + series (Flow 5-7)
  EP1: `${TESTRUNID}_EP1`, EP2: `${TESTRUNID}_EP2`,
  SER1: `${TESTRUNID}_SER1`,           // a "free" series (series dashboard tier filter, CN-05)
  SER2: `${TESTRUNID}_SER2`,           // an "exclusive" series
  // category (Flow 9 / CN-09, CN-10)
  CAT1: `${TESTRUNID}_CAT1`,
  // tiers + tier access config (Flow 10 / CN-11)
  TIER1: `${TESTRUNID}_TIER1`, TIER2: `${TESTRUNID}_TIER2`,
  TAC1: `${TESTRUNID}_TAC1`,
  // health stories (Flow 11 / CN-13)
  HS1: `${TESTRUNID}_HS1`,
  // playlist ads (Flow 12 / CN-14)
  ADS1: `${TESTRUNID}_ADS1`,
  // learning materials (CN-12 — not driven; reference doc)
  LM1: `${TESTRUNID}_LM1`,
  // content_urls (referenced by playlist ads + generalContentUpdate CF; CU1 = HLS-done precondition,
  //   CU2 = the generalContentUpdate CF subject CN-07 mutates, EPHLS = the ConvertUrltoHLS subject CN-06 writes)
  CU1: `${TESTRUNID}_CU1`,
  // buffermix → recommended-mix-playlist CF chain (Flow 13 / CN-15)
  BUF1: `${TESTRUNID}_BUF1`,
  // CN-16 recommended-mix-playlist direct CF subject (RecommendedPlaylistTrigger_to_pmd is a deployed
  //   *_to_pmd CF — seeding ONE recommended-mix doc fires it; assert the participant-metadata merge).
  RMP1: `${TESTRUNID}_RMP1`,
};

// content-analytics profileids (Flow 8 / CN-08) — 3 solarvoice-only, 2 eiflix-only. Run-scoped so the
// dashboard's app-computed "only solarvoice" bucket includes EXACTLY these 3 (lower-bound assertion).
const ANALYTICS_PF = {
  sv: [`${TESTRUNID}_ca_sv0`, `${TESTRUNID}_ca_sv1`, `${TESTRUNID}_ca_sv2`],
  ei: [`${TESTRUNID}_ca_ei0`, `${TESTRUNID}_ca_ei1`],
};
// buffermix target profileids (CN-15/16) — distinct from the analytics ones.
const BUF_PF = [`${TESTRUNID}_buf_p0`, `${TESTRUNID}_buf_p1`];
// CN-17 tier-bucket participants — participant metadata docs with firebaseuserref + name + tier:[TIER1]
// so /viewparticipantstieraccess buckets them under TIER1. Kept distinct from the analytics/buffer ids.
const TIER_PF = [`${TESTRUNID}_tier_p0`, `${TESTRUNID}_tier_p1`];

// Actors. The content routes are admin-gated; a single admin+ah super-role passes every guard.
const PF = { admin: `${TESTRUNID}_pf_admin` };
const EMAIL = { admin: `admin+${TESTRUNID}@example.com` };

function roster() {
  const staff = [{ uid: `${TESTRUNID}_u_admin`, profileid: PF.admin, email: EMAIL.admin, role: 'admin', roles: ['admin', 'ah'] }];
  return { staff, operators: [], participants: [] };
}

// Routes the content specs navigate to (each needs a dashboard route-config grant). The authGuard
// matches by the FIRST path segment only, so single-segment paths are granted verbatim.
const ROUTES = [
  { route: '/audiodashboard', label: 'Audio Dashboard' },
  { route: '/playlistdashboard', label: 'Playlist Dashboard' },
  { route: '/seriesdashboard', label: 'Series Dashboard' },
  { route: '/videodashboard', label: 'Video Dashboard' },
  { route: '/category-dashboard', label: 'Category Dashboard' },
  { route: '/healthstories', label: 'Health Stories' },
  { route: '/playlistads', label: 'Playlist Ads' },
  { route: '/content-analytics-dashboard', label: 'Content Analytics Dashboard' },
  { route: '/tieraccessconfig', label: 'Tier Access Config' },
  { route: '/viewparticipantstieraccess', label: 'View Participants Tier Access' }, // CN-17
  { route: '/learningmaterial', label: 'Learning Material' },
  { route: '/contentupload', label: 'Content Upload' },
];

async function seedContent() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const T = admin.firestore.Timestamp;
  const tag = TAG(TESTRUNID);

  const { staff, operators, participants } = roster();

  // 1) Auth chain for the roster (Auth user + user_data + profile_data + users_roles + queue grants).
  await seed.seedAuthChain(db, auth, TESTRUNID, { staff, operators, participants });

  // 2) Dashboard grants for THIS group's routes.
  const staffProfileIds = staff.map((s) => s.profileid);
  const allRoles = [...new Set(staff.flatMap((s) => s.roles))];
  await seedDashboardRoutes(db, TESTRUNID, ROUTES, { staffProfileIds, allRoles });

  // --- date helpers (seed-time Node Date — same machine/TZ as the test browser) ---
  const now = () => T.now();
  const recent = (daysAgo) => T.fromMillis(Date.now() - daysAgo * 86400e3); // within the analytics 9-day window
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);

  // --- refs ---
  const audioRef = (id) => db.collection('solar voice audios').doc(id);
  const episodeRef = (id) => db.collection('episodes').doc(id);
  const contentUrlRef = (id) => db.collection('content_urls').doc(id);

  // 3) AUDIO (Flow 1-2): 3 audios with run-unique names. url is a harmless example.com mp3 (read-path
  //    only — never played to completion in the render test; no Storage upload needed).
  for (const id of [ID.AUD1, ID.AUD2, ID.AUD3]) {
    await audioRef(id).set({
      docid: id, name: `TEST_AUDIO_${TESTRUNID}_${id.slice(-1)}`, description: 'seed audio',
      url: 'https://example.com/test.mp3', imageUrl: '', duration: 60, size: '1.2 MB',
      tags: [], date: now(), ...tag,
    });
  }

  // 4) PLAYLIST (Flow 3-4): one playlist whose `sequence` points at the 3 seeded audio refs.
  await db.collection('solar voice playlist').doc(ID.PLAY1).set({
    docid: ID.PLAY1, name: `TEST_PLAYLIST_${TESTRUNID}`, description: 'seed playlist',
    sequence: [audioRef(ID.AUD1), audioRef(ID.AUD2), audioRef(ID.AUD3)],
    date: now(), ...tag,
  });

  // 5) EPISODES (Flow 7): 2 episodes pre-marked convertedtohls:true so the ConvertUrltoHLS CF stays a
  //    no-op (no real Publitio upload). title is run-unique.
  for (const id of [ID.EP1, ID.EP2]) {
    await episodeRef(id).set({
      docid: id, title: `TEST_EPISODE_${TESTRUNID}_${id.slice(-1)}`, description: 'seed episode',
      videoUrl: 'https://example.com/test.mp4', imageUrl: 'https://example.com/test.jpg',
      convertedtohls: true, series: [], date: now(), ...tag,
    });
  }

  // 6) SERIES (Flow 5-6): one "free" + one "exclusive". `type` drives the series-dashboard tier filter
  //    (CN-05). sequence points at the seeded episodes. order set for the category drag-reorder (CN-10).
  await db.collection('series').doc(ID.SER1).set({
    docid: ID.SER1, seriesName: `TEST_SERIES_FREE_${TESTRUNID}`, type: 'free',
    sequence: [episodeRef(ID.EP1)], tier: [], category: ID.CAT1, order: 0, date: now(), ...tag,
  });
  await db.collection('series').doc(ID.SER2).set({
    docid: ID.SER2, seriesName: `TEST_SERIES_EXCL_${TESTRUNID}`, type: 'exclusive',
    sequence: [episodeRef(ID.EP2)], tier: [], category: ID.CAT1, order: 1, date: now(), ...tag,
  });

  // 7) CATEGORY (Flow 9).
  await db.collection('category').doc(ID.CAT1).set({ id: ID.CAT1, category: `TEST_CAT_${TESTRUNID}`, date: now(), ...tag });

  // 8) TIERS + TIER ACCESS CONFIG (Flow 10): 2 tiers + one config row.
  //    TIER1.order set so /viewparticipantstieraccess (CN-17) sorts the bucket deterministically.
  await db.collection('tier').doc(ID.TIER1).set({ id: ID.TIER1, tier: `TEST_TIER_BASIC_${TESTRUNID}`, order: 1, ...tag });
  await db.collection('tier').doc(ID.TIER2).set({ id: ID.TIER2, tier: `TEST_TIER_PREM_${TESTRUNID}`, order: 2, ...tag });
  await db.collection('tier access config').doc(ID.TAC1).set({
    docid: ID.TAC1, tierid: ID.TIER1, tieraccessby: 'product', productaccess: {}, date: now(), ...tag,
  });
  // TIER2 is left WITHOUT a tier-access-config row so the CN-11 add dialog (which filters out tiers that
  // already have a config, config-new-tier.component.ts:62) can offer TIER2 to add a fresh config for.

  // 8b) TIER-ACCESS-CONFIG dialog drivers (CN-11): the ConfigNewTier dialog reads journey/products/biglevel
  //     to populate its "Add Active Journey" + "Select Product" + big-level selects. Seed one of each so
  //     the "By Product" path is fillable. products carries atcmodel:null (ATC off-limits — never an
  //     atcmodel value). These are run-scoped config docs.
  await db.collection('journey').doc(`${TESTRUNID}_J1`).set({ id: `${TESTRUNID}_J1`, journey: `TEST_JOURNEY_${TESTRUNID}`, ...tag });
  await db.collection('products').doc(`${TESTRUNID}_PR1`).set({ id: `${TESTRUNID}_PR1`, docid: `${TESTRUNID}_PR1`, product: `TEST_PRODUCT_${TESTRUNID}`, atcmodel: null, ...tag });
  await db.collection('biglevel').doc(`${TESTRUNID}_BL1`).set({ docid: `${TESTRUNID}_BL1`, level: `TEST_LEVEL_${TESTRUNID}`, ...tag });

  // 9) HEALTH STORIES (Flow 11 / CN-13): one story with a non-empty images array (the update dialog
  //    requires images.length>0 to submit; with images already present the edit can re-submit text
  //    WITHOUT uploading a file → no Storage call). subject is run-unique.
  await db.collection('health stories').doc(ID.HS1).set({
    docid: ID.HS1, subject: `TEST_HEALTH_${TESTRUNID}`, description: 'seed health story',
    images: ['https://example.com/hs.jpg'], delete: false, date: now(), ...tag,
  });

  // 10) PLAYLIST ADS (Flow 12 / CN-14): one ads row, available, future window.
  await db.collection('adsplaylist').doc(ID.ADS1).set({
    docid: ID.ADS1, adstitle: `TEST_AD_${TESTRUNID}`, adsdescription: 'seed ad', adslink: 'https://example.com',
    adstype: 'banner', startdate: now(), enddate: future(7), available: true, playlist: [], ...tag,
  });

  // 11) CONTENT_URLS (referenced by playlist-ads contentMap; convertedtohls:true so the
  //     generalContentUpdate CF stays a no-op). title run-unique. CU1 also backs CN-14's adstrailer +
  //     ads-playlist selects (the create-ad dialog reads content_urls.title/url/docid).
  await contentUrlRef(ID.CU1).set({
    docid: ID.CU1, title: `TEST_CONTENT_${TESTRUNID}`, url: 'https://example.com/test.mp4',
    thumbnail: 'https://example.com/test.jpg', convertedtohls: true, available: true, added: now(), ...tag,
  });

  // 16) CN-16 — RecommendedPlaylistTrigger_to_pmd is a DEPLOYED *_to_pmd CF. The spec seeds a fresh
  //     `recommended mix playlist` doc itself (so the create fires the trigger) and asserts the
  //     participant-metadata merge; the seed only ensures the merge TARGET exists. We seed the two
  //     buffer profiles' participant metadata above (block 14). Nothing else needed here at seed time —
  //     the RMP doc is created/reset by the spec (resetRecommendedMix/createRecommendedMix) for re-runs.

  // 17) CN-17 — /viewparticipantstieraccess buckets `participant metadata` docs that carry a truthy
  //     `firebaseuserref` by their `tier[]` ids. Seed 2 such docs under TIER1 (+ a run-unique name the
  //     orderBy('name') query needs). The screen COMPUTES the per-tier grouping from this stream; the
  //     seeded count (2) is the known lower bound the spec asserts.
  let tpN = 0;
  for (const pf of TIER_PF) {
    await db.collection('participant metadata').doc(pf).set({
      docid: pf, profileid: pf, name: `TEST_TIERMEMBER_${TESTRUNID}_${tpN++}`,
      firebaseuserref: db.collection('user_data').doc(pf), tier: [ID.TIER1], ...tag,
    }, { merge: true });
  }

  // 12) LEARNING MATERIALS (CN-12 — reference; the add/edit/delete flow is a TODO, see spec).
  await db.collection('learning-materials').doc(ID.LM1).set({
    docid: ID.LM1, name: `TEST_LM_${TESTRUNID}`, description: 'seed learning material',
    files: [], tier: [], date: now(), ...tag,
  });

  // 13) CONTENT ANALYTICS (Flow 8 / CN-08): 3 solarvoice-only profiles (3 docs) + 2 eiflix-only
  //     profiles (2 docs). logdate WITHIN the dashboard's default 9-day window (setDateRange:
  //     today-9 .. today) so the onSnapshot range filter (logdate>=start && <=end) includes them.
  //     `type` MUST be 'solarvoice' / 'eiflixcontent' (the activePlatforms bucket key). These are
  //     PRECONDITIONS; the dashboard COMPUTES the only-solarvoice bucket from its own stream.
  const mkAnalytics = (profileid, type, n) => ({
    docid: `${TESTRUNID}_ca_${type}_${profileid}_${n}`,
    profileid, type, platform_name: type === 'solarvoice' ? 'SolarVoice' : 'Eiflix',
    videoid: `${TESTRUNID}_vid_${type}_${n}`, videoname: `TEST_VID_${type}_${n}`,
    totaltimespend: 1000, totalruntime: 1200, status: 'incomplete', logdate: recent(1), ...tag,
  });
  let caN = 0;
  for (const pf of ANALYTICS_PF.sv) await db.collection('content analytics').doc(`${TESTRUNID}_ca_${caN++}`).set(mkAnalytics(pf, 'solarvoice', caN));
  for (const pf of ANALYTICS_PF.ei) await db.collection('content analytics').doc(`${TESTRUNID}_ca_${caN++}`).set(mkAnalytics(pf, 'eiflixcontent', caN));

  // 14) BUFFERMIX → RECOMMENDED-MIX-PLAYLIST CF chain (Flow 13 / CN-15). Seed the participant metadata
  //     docs first (so RecommendedPlaylistTrigger_to_pmd has a merge target), then the buffermix doc.
  //     The CF fans out (#profileid × #non-empty-content-type) = 2×1 = 2 `recommended mix playlist`
  //     docs and sets status:'completed' back on the buffermix doc. We DELETE any prior fan-out +
  //     reset the buffermix below in resetBuffermix() so re-runs are deterministic; but the seed leaves
  //     it UN-fired (status:null) as the precondition.
  for (const pf of BUF_PF) {
    await db.collection('participant metadata').doc(pf).set({ docid: pf, profileid: pf, ...tag }, { merge: true });
  }
  await db.collection('buffermix archive').doc(ID.BUF1).set({
    docid: ID.BUF1, title: `TEST_BUF_${TESTRUNID}`, description: 'seed buffermix',
    profileid: BUF_PF,
    solarvoice: [audioRef(ID.AUD1)],   // ONE non-empty content type → the CF emits 1 doc per profile
    eiflix: [], generalcontent: [],
    personalised: false, status: null,
    date: now(), expiredate: future(7), ...tag,
  });

  return {
    TESTRUNID, ID, PF, EMAIL, ANALYTICS_PF, BUF_PF, TIER_PF,
    counts: {
      audios: 3, playlists: 1, episodes: 2, series: 2, category: 1, tiers: 2, tierAccessConfig: 1,
      healthStories: 1, ads: 1, learningMaterials: 1, contentAnalytics: 5, buffermix: 1,
      journey: 1, products: 1, biglevel: 1, tierParticipants: TIER_PF.length,
    },
  };
}

// Collections this seed writes (for teardown). NO ATC collections — never seeded.
const SEEDED = [
  'solar voice audios', 'solar voice playlist', 'episodes', 'series', 'category',
  'tier', 'tier access config', 'health stories', 'adsplaylist', 'content_urls',
  'learning-materials', 'content analytics', 'buffermix archive', 'recommended mix playlist',
  'participant metadata',
  // CN-11 dialog drivers + CN-04/12 series/learning-material catalog refs
  'journey', 'products', 'biglevel',
  // auth-chain + dashboard (shared shape; testrunid-scoped so other runs are untouched)
  'user_data', 'profile_data', 'users_roles', 'dashboard',
];

async function teardownContent() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, TESTRUNID);
  // Also delete the Auth users (emails carry the run id).
  const auth = admin.auth();
  for (const key of Object.keys(PF)) {
    await auth.deleteUser(`${TESTRUNID}_u_${key}`).catch(() => {});
  }
  return n;
}

module.exports = { TESTRUNID, ID, PF, EMAIL, ANALYTICS_PF, BUF_PF, TIER_PF, ROUTES, SEEDED, seedContent, teardownContent };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedContent(); console.log('[seed-content] seeded', JSON.stringify(r.counts), 'run=', r.TESTRUNID); }
    else if (mode === '--teardown') { const n = await teardownContent(); console.log('[seed-content] torn down', n, 'docs for run', TESTRUNID); }
    else { console.log('usage: seed-content.js --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });
}
