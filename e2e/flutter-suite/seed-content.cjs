// @ts-nocheck
/**
 * seed-content.cjs — EXTENDS the Phase-2 journey cohort for the CONTENT bucket's driven user
 * (idx 97, profileid `jrny_profile_97`, email participant97+jrny@example.com) with the feature
 * preconditions the catalog rows in FEATURE-CATALOG.md §10 (content-eiflix) + §12
 * (content-audio-hpc-surprise) require.
 *
 * It does NOT re-seed the cohort baseline (seed-cohort.js already gives this user: profile_data +
 * the purchase quartet + queue_token render chain + ≥4 events + content analytics + a 2nd journey).
 * This file ONLY adds what the EiFlix / Solar Voice / HPC features read ON TOP of that baseline:
 *   • EiFlix world  : tier ladder + an UNLOCKED `series` (+ its `episodes`) + `category`,
 *                     a `tier access config` + `chat config`("Eiflix Workshop") for the tier-ticket,
 *                     a `recommended mix playlist` per type + the `content_urls`/`solar voice playlist`
 *                     docs its list[] refs resolve, an ads-playlist map (content_urls), a related-
 *                     content `content_urls` doc, and a pending `tv_auth_sessions` for TV-auth.
 *   • Solar Voice   : a public `solar voice playlist` (+ its `solar voice audios`) so the home
 *                     carousel/explore render and the bookmark/favourite WRITE has a target.
 *   • HPC           : completed `3minuteshpc` docs + `static meta data/HPC Config` (awards) +
 *                     `static meta data/Accelerator` so ViewHPC history renders. **NO `classify/
 *                     3minuteshpc` apikey is seeded** — the HPC record flow must show the
 *                     deterministic "Service Unavailable" screen in CI (never a real OpenAI call).
 *
 * ANTI-CIRCULARITY (the doc the APP writes is the assertion target — never a seeded value):
 *   • `participant metadata.eiflixmylist` / `.solarvoicemylist` are deliberately LEFT UNSEEDED
 *     (the cohort doesn't set them either) so the My-List / favourite-from-player toggle WRITE the
 *     app performs is the first thing to put the doc id there → a server read proves the app wrote it.
 *   • `solar voice playlist.likedby` is seeded WITHOUT this user's profileid → the favourite-from-card
 *     WRITE adds it → a server read proves the app wrote it.
 *   • `tv_auth_sessions.status` is seeded "pending" → the approve action flips it to "approved".
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts unless the
 * dedicated disposable test project slabs-queue-e2e-exdcz, per lib/test-project.js); every doc is
 * tagged {testrunid:'jrny', _testdata:true}; deterministic run-prefixed doc ids (idempotent set/merge);
 * atcmodel:null on every product/journey/event-shaped doc; NO ATC collection is ever touched and
 * firestore-atc is never opened. The whole content surface is ATC-free (catalog §10/§12 notes).
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-content.cjs --seed
 *   node flutter-suite/seed-content.cjs --teardown
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');

// Same run id the cohort uses — this user (jrny_profile_97) is a cohort member; we extend in-place.
const RUN = process.env.JRNY_RUNID || 'jrny';
const USER_IDX = Number(process.env.CONTENT_USER_IDX || 97);

const PID = `${RUN}_profile_${USER_IDX}`;                  // the driven user's profileid (== profile_data doc id)
const EMAIL = `participant${USER_IDX}+${RUN}@example.com`;

const tag = TAG(RUN);

// ── deterministic, run-prefixed doc ids for THIS bucket's extra fixtures ────────────────────────
const ID = {
  // tier ladder (the participant's own tier + a higher one for the tier-eligibility explainer)
  tierUser: `${RUN}_tier_user`,
  tierHigher: `${RUN}_tier_higher`,
  // EiFlix series + episodes (an UNLOCKED series so eiflix-open / mylist / search reach it)
  series: `${RUN}_series_0`,
  ep0: `${RUN}_ep_0`,
  ep1: `${RUN}_ep_1`,
  category: `${RUN}_eiflix_cat_0`,
  // tier-eligibility ticket plumbing
  tierAccessCfg: `${RUN}_tieraccess_0`,
  chatCfg: `${RUN}_chatconfig`,
  // recommended-mix-playlist (one buffer per type) + the docs its list[] refs resolve
  recEiflix: `${RUN}_recmix_eiflix`,
  recSolar: `${RUN}_recmix_solar`,
  recGeneral: `${RUN}_recmix_general`,
  // general content_urls (related-video + ads-playlist + recommended-general list item)
  contentUrl0: `${RUN}_curl_0`,
  contentUrl1: `${RUN}_curl_1`,
  // Solar Voice playlist + its audios (browse / favourite / play)
  svPlaylist: `${RUN}_svp_0`,
  svAudio0: `${RUN}_sva_0`,
  svAudio1: `${RUN}_sva_1`,
  // TV-auth pending session
  tvSession: `${RUN}_tvsession_0`,
  // HPC config + completed sessions (history render)
  hpcConfig: 'HPC Config',          // doc id is literal ('static meta data/HPC Config')
  accelerator: 'Accelerator',       // 'static meta data/Accelerator'
  hpcIndiv0: `${RUN}_hpc_indiv_0`,
  hpcIndiv1: `${RUN}_hpc_indiv_1`,
  hpcGroup0: `${RUN}_hpc_group_0`,
};

async function seedBucket() {
  const admin = seed.initAdmin();                 // hard-aborts unless the dedicated test project
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);

  console.log(`\n[seed-content] run=${RUN} user=${PID} (${EMAIL}) → extend cohort with content fixtures`);

  const bw = db.bulkWriter();
  bw.onWriteError((err) => err.failedAttempts < 5);
  let n = 0;
  const W = (r, d, opts) => { bw.set(r, d, opts || {}); n++; };

  // ── TIER LADDER ───────────────────────────────────────────────────────────────────────────────
  // `tier` docs: {tier, order}. The user holds tierUser (order 1); tierHigher (order 2) unlocks more
  // and is what the tier-eligibility explainer lists as a "locked" tier.
  W(ref('tier', ID.tierUser), { docid: ID.tierUser, tier: `Member ${RUN}`, order: 1, ...tag });
  W(ref('tier', ID.tierHigher), { docid: ID.tierHigher, tier: `Premium ${RUN}`, order: 2, ...tag });

  // ── PARTICIPANT METADATA: grant the user's tier so the seeded series UNLOCKS ────────────────────
  // MERGE onto the cohort's `participant metadata/{PID}` (it already set customerstatus:'active',
  // participantmode, activejourney, …). We add `tier:[tierUser]` so series access computes unlocked.
  // CRITICAL anti-circular: we DO NOT set `eiflixmylist`/`solarvoicemylist`/`generalcontentmylist`
  // here — the My-List / favourite toggles are the WRITES the test asserts; seeding them would make
  // the assertion circular. (The cohort also leaves them unset.)
  W(ref('participant metadata', PID), { tier: [ID.tierUser], ...tag }, { merge: true });

  // ── EIFLIX: an UNLOCKED series + 2 episodes + a category that lists it ──────────────────────────
  // series fields (cluster doc §read): seriesName, description, imageUrl, sequence[] (refs→episodes),
  // tier[] (refs→tier), type, id, date, keywords[]. type:'free' makes it unconditionally unlocked
  // (belt-and-suspenders with the tier grant above) so eiflix-open / mylist / search always reach it.
  W(ref('episodes', ID.ep0), { id: ID.ep0, title: `Pilot ${RUN}`, description: `Episode one ${RUN}`, hsl_stream: '', videoUrl: '', hsl_thumbnail: '', screenshot: '', imageUrl: 'https://example.com/e2e.png', date: past(30), ...tag });
  W(ref('episodes', ID.ep1), { id: ID.ep1, title: `Follow Up ${RUN}`, description: `Episode two ${RUN}`, hsl_stream: '', videoUrl: '', hsl_thumbnail: '', screenshot: '', imageUrl: 'https://example.com/e2e.png', date: past(29), ...tag });
  W(ref('series', ID.series), {
    id: ID.series, seriesName: `Content Series ${RUN}`, description: `A seeded EiFlix series for ${RUN}`,
    imageUrl: 'https://example.com/e2e.png', type: 'free',
    sequence: [ref('episodes', ID.ep0), ref('episodes', ID.ep1)],
    tier: [ref('tier', ID.tierUser)], keywords: ['content', RUN], date: past(30), ...tag,
  });
  // category: {sequence[] (refs→series), id, category} — lists the series in a home rail.
  W(ref('category', ID.category), { id: ID.category, category: `Featured ${RUN}`, sequence: [ref('series', ID.series)], ...tag });

  // ── TIER-ELIGIBILITY explainer + the support ticket it raises ───────────────────────────────────
  // tier access config: {tierid, productaccess{journeyid:[{productid}]}}. tier.dart reads it where
  // tierid whereIn [unlocked-or-higher]. Point it at the cohort's run journey/product ids.
  W(ref('tier access config', ID.tierAccessCfg), {
    docid: ID.tierAccessCfg, tierid: ID.tierHigher,
    productaccess: { [`${RUN}_J_1`]: [{ productid: `${RUN}_P_1` }] }, ...tag,
  });
  // chat config: first doc holds `categories` (filtered by category name) for raiseTickets. The
  // tier-ticket uses chatCategoryname "Eiflix Workshop" → clientissue (category "Eiflix Workshop").
  W(ref('chat config', ID.chatCfg), {
    docid: ID.chatCfg,
    categories: [
      { name: 'Eiflix Workshop', category: 'Eiflix Workshop', active: true },
      { name: 'General', category: 'General', active: true },
    ], ...tag,
  });

  // ── GENERAL content_urls (related-video player + ads playlist + recommended-general list item) ──
  // content_urls fields: title, thumbnail, tags[], available, url, hsl_stream, responsepublitio, docid.
  W(ref('content_urls', ID.contentUrl0), { docid: ID.contentUrl0, title: `General Content ${RUN}`, thumbnail: 'https://example.com/e2e.png', tags: ['content', RUN], available: true, url: '', hsl_stream: '', ...tag });
  W(ref('content_urls', ID.contentUrl1), { docid: ID.contentUrl1, title: `Ad Content ${RUN}`, thumbnail: 'https://example.com/e2e.png', tags: ['ads', RUN], available: true, url: '', hsl_stream: '', ...tag });

  // ── SOLAR VOICE: a public playlist + 2 audios (browse / favourite-from-card / favourite-from-player / play) ──
  // solar voice playlist fields: id, name, description, imageurl, private, likedby, sequence (refs→audios).
  // likedby is seeded WITHOUT this user's profileid (anti-circular: the card-bookmark WRITE adds it).
  W(ref('solar voice audios', ID.svAudio0), { id: ID.svAudio0, name: `Track One ${RUN}`, description: 'seeded audio', url: '', imageUrl: 'https://example.com/e2e.png', ...tag });
  W(ref('solar voice audios', ID.svAudio1), { id: ID.svAudio1, name: `Track Two ${RUN}`, description: 'seeded audio', url: '', imageUrl: 'https://example.com/e2e.png', ...tag });
  W(ref('solar voice playlist', ID.svPlaylist), {
    id: ID.svPlaylist, name: `Solar Voice Playlist ${RUN}`, description: `A seeded Solar Voice playlist ${RUN}`,
    imageurl: 'https://example.com/e2e.png', private: false, likedby: [`${RUN}_someoneelse`],
    sequence: [ref('solar voice audios', ID.svAudio0), ref('solar voice audios', ID.svAudio1)],
    date: past(20), ...tag,
  });

  // ── RECOMMENDED MIX PLAYLIST (one buffer per type) ──────────────────────────────────────────────
  // recommended mix playlist fields: type, list[] (refs), completedcontent[], completedplaylist[],
  // status, expiredate, date, delete, title, description. Read in home.dart (profileid==, date>now-2mo).
  // The Recommended block also needs appService.recommendedSolarVoice/Eiflix populated from these.
  // bufferdocref: recommenedmixplaylist.dart:59 reads doc['bufferdocref'].id UNGUARDED (group key); the
  // buffer doc itself is never fetched, so a valid ref suffices. Without it the Home recmix initState crashes.
  const recBufRef = ref('recommended mix playlist', `${RUN}_content_recbuf`);
  const mkRec = (id, type, listRefs) => ({
    docid: id, profileid: PID, type, list: listRefs, completedcontent: [], completedplaylist: [],
    bufferdocref: recBufRef,
    status: 'ongoing', delete: false, date: past(5), expiredate: future(30),
    title: `For You ${type} ${RUN}`, description: 'seeded recommended mix', ...tag,
  });
  W(ref('recommended mix playlist', ID.recEiflix), mkRec(ID.recEiflix, 'eiflix', [ref('series', ID.series)]));
  W(ref('recommended mix playlist', ID.recSolar), mkRec(ID.recSolar, 'solarvoice', [ref('solar voice playlist', ID.svPlaylist)]));
  W(ref('recommended mix playlist', ID.recGeneral), mkRec(ID.recGeneral, 'generalcontent', [ref('content_urls', ID.contentUrl0)]));

  // ── EIFLIX TV: a pending tv_auth_sessions (approve flips status→approved with user_data) ─────────
  W(ref('tv_auth_sessions', ID.tvSession), {
    docid: ID.tvSession, status: 'pending', expires_at: future(1),
    device_info: { device_brand: 'TestTV', device_model: `E2E ${RUN}` },
    created_at: past(0), ...tag,
  });

  // ── HPC: config + completed sessions for the history render. NO apikey (Service Unavailable). ───
  // static meta data/HPC Config: awards (badge thresholds/icons) + reminder copy. ViewHPC reads
  // `awards`; absent → badges hidden (we seed it so badges render).
  W(ref('static meta data', ID.hpcConfig), {
    awards: [
      { name: `First Step ${RUN}`, threshold: 1, icon: 'https://example.com/e2e.png' },
      { name: `Momentum ${RUN}`, threshold: 5, icon: 'https://example.com/e2e.png' },
    ],
    notificationindividual: { title: 'Log your achievement', description: 'Daily reflection' },
    notificationgroup: { title: 'Group achievement', description: 'Reflect together' },
    ...tag,
  }, { merge: true });
  // static meta data/Accelerator: accelerators list (HPC record flow chips — read even on the
  // Service-Unavailable path's initState; harmless to seed).
  W(ref('static meta data', ID.accelerator), {
    accelerators: [`Focus ${RUN}`, `Discipline ${RUN}`, `Courage ${RUN}`], ...tag,
  }, { merge: true });

  // completed 3minuteshpc sessions (status=='completed', profileid==me). Two individual + one group
  // so ViewHPC('individual') and ViewHPC('group') both render non-empty.
  const mkHpc = (id, multiple, daysAgo) => ({
    docid: id, profileid: PID, status: 'completed', multiple, currentStep: 3,
    createdAt: past(daysAgo + 1), updatedAt: past(daysAgo), completedAt: past(daysAgo), loggeddate: past(daysAgo),
    recordings: {}, choosedaccelerators: [`Focus ${RUN}`], customaccelerators: [], tellto: [],
    chatgptgeneratedtitle: `Logged Achievement ${RUN}`, chatgptgeneratedtitleedited: `Logged Achievement ${RUN}`,
    chatgptrawtitle: `Logged Achievement ${RUN}`, summaryofthis: `A seeded completed achievement ${RUN}`,
    chatgptgeneratedV1: 'v1', chatgptgeneratedV2: 'v2', chatgptgeneratedV3: 'v3',
    selectedContrastFrame: 'V1', selectedContrastFrameContent: 'v1',
    ...tag,
  });
  W(ref('3minuteshpc', ID.hpcIndiv0), mkHpc(ID.hpcIndiv0, false, 2));
  W(ref('3minuteshpc', ID.hpcIndiv1), mkHpc(ID.hpcIndiv1, false, 4));
  // group session adds the persons.personN substructure
  W(ref('3minuteshpc', ID.hpcGroup0), {
    ...mkHpc(ID.hpcGroup0, true, 3), totalPersons: 1, currentPerson: 0,
    persons: { person0: { personName: `Teammate ${RUN}`, recordings: {}, choosedaccelerators: [`Focus ${RUN}`], customaccelerators: [], tellto: [] } },
  });

  await bw.close();
  console.log(`  ✓ content fixtures: ${n} docs (series+episodes+category, tier ladder, tier-access+chat config, recommended-mix×3, content_urls×2, solar-voice playlist+audios, tv_auth_sessions, HPC config+Accelerator + 3 completed 3minuteshpc)`);
  console.log(`  ✓ deliberately UNSEEDED (anti-circular): participant metadata.eiflixmylist/solarvoicemylist, solar voice playlist.likedby[${PID}], classify/3minuteshpc.apikey`);
  console.log('[seed-content] done.');
  return { RUN, PID, EMAIL, ID, docs: n };
}

// Collections this seed writes (run-scoped teardown by testrunid). `participant metadata` is shared
// with the cohort (we only merged a `tier` field onto the user's doc) — the cohort's teardown owns
// that doc, so we DO NOT list it here (deleting it would remove the cohort's render-chain precondition).
const SEEDED = [
  'tier', 'series', 'episodes', 'category', 'tier access config', 'chat config',
  'content_urls', 'solar voice playlist', 'solar voice audios', 'recommended mix playlist',
  'tv_auth_sessions', '3minuteshpc',
  // NOTE: 'static meta data' docs (HPC Config / Accelerator) are merged shared-config singletons —
  // swept by testrunid below but harmless if other suites also use them (they re-merge).
  'static meta data',
];

// APP-WRITTEN docs (no testrunid tag) the content WRITES create for this user, swept by natural key:
//   • the tier-eligibility ticket: clientissue (+ messages subcollection) with profileid==PID.
// The toggles (eiflixmylist/solarvoicemylist/likedby) mutate EXISTING tagged docs, so the testrunid
// sweep above already covers them (solar voice playlist) or the cohort owns them (participant metadata).
const APP_WRITE_PROFILEIDS = [PID];

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const n = await seed.teardownCollections(db, SEEDED, RUN);

  // clientissue raised by the tier-eligibility "Help" action — app-written (no testrunid). Sweep by
  // profileid; delete its `messages` subcollection first, then the parent doc.
  let appDeleted = 0;
  for (const pid of APP_WRITE_PROFILEIDS) {
    const snap = await db.collection('clientissue').where('profileid', '==', pid).get().catch(() => ({ docs: [] }));
    for (const d of snap.docs) {
      const msgs = await d.ref.collection('messages').get().catch(() => ({ docs: [] }));
      for (const m of msgs.docs) { await m.ref.delete().catch(() => {}); appDeleted++; }
      await d.ref.delete().catch(() => {}); appDeleted++;
    }
  }
  return n + appDeleted;
}

module.exports = { RUN, PID, EMAIL, ID, SEEDED, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-content] seeded', JSON.stringify({ user: r.PID, docs: r.docs })); }
    else if (mode === '--teardown') { const c = await teardownBucket(); console.log('[seed-content] torn down', c, 'docs for run', RUN); }
    else { console.log('usage: seed-content.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
