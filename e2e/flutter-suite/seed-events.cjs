// @ts-nocheck
/**
 * seed-events.cjs — Events & Arena (bucket `events`) preconditions for the breakthroughs-flutter
 * e2e suite. EXTENDS the Phase-2 journey cohort (e2e/journey-cohort/seed-cohort.js) for the ONE
 * driven user of this bucket — index 96, profileid `jrny_profile_96`, email
 * `participant96+jrny@example.com` — with exactly the docs the delivery-events-arena catalog rows
 * require ON TOP of the cohort baseline. Run the cohort seeder FIRST; this only adds the extras.
 *
 * WHY these extras (the cohort already gives profile_data, the purchase quartet, the queue render
 * chain, ≥4 ATTENDED events, content, a 2nd journey — but NOT a *live* arena event):
 *   • The cohort seeds its event-collection docs with `eventdate` (past) and its event delivery
 *     leaves as status:'completed'. The Flutter home `eventMode()` (home.dart:763) only resolves
 *     `appService.profileJourneyProduct["eventmode"]["eventref"]` when the ACTIVE product's
 *     participantdeliverysequence has an event leaf with status initiated/ongoing whose
 *     deliverables.fileref[0] → an `event participation request` → an `event collection`. Without a
 *     LIVE event, the whole arena hub (ArenaExplore / ParticipantReports / ArenaHighlights /
 *     LiveEventControl / ArenaParticipantZone) reads a null eventref and renders nothing. So we add
 *     ONE live event + an ongoing event-delivery leaf for user 96, then key every arena doc to it.
 *   • AvailableEvents (Event-Mode RSVP) needs a product with a `deliverytype` ref-array into
 *     `delivery events`, a `delivery events` doc whose `events[]` ref a FUTURE `event collection`
 *     (start_date > now). The cohort product PA is Event-Mode but has no deliverytype — we add it.
 *   • ArenaEventRequest needs a FUTURE non-deleted `arena events` (startdate>=now, delete:false)
 *     carrying eventref/deliveryref/type/productref. The cohort `arena events` have none of those.
 *   • The countdown banner (Eventcount) reads `event collection` orderBy start_date desc limit 1 —
 *     the cohort docs lack `start_date`, so our future-dated AvailableEvents event is the newest.
 *   • Tweet walls (AddTweets/PersonalTweets/SocialTweets) read/write the `{productCollection}`
 *     collection (here "CTD"); we seed two CTD tweets so the list/grid render.
 *   • post_categories (ArenaHighlights / CreatePost read it), static meta data (ImpactPeopleVideo),
 *     a participantvideoask list (ParticipantVideoAsk story player) round out the render-only legs.
 *
 * ANTI-CIRCULAR: the e2e test never asserts a value seeded here. It asserts the doc the APP writes
 * (event rsvp on YES, arenalayers.attended on Mark-Attended, arena highlights.anonymous on the
 * Share toggle, the {CTD} tweet doc on Post) — distinguished from cohort docs by MY live/future
 * event refs + EVENTS_TAG so the assertion can't read a pre-seeded RSVP.
 *
 * SAFETY: every write goes through seed.initAdmin() (hard-aborts off slabs-queue-e2e-exdcz); every
 * doc carries {testrunid:'jrny', _testdata:true} (TAG) so the cohort teardown sweep also covers it,
 * PLUS an extra `eventsbucket:true` marker for targeted teardown. atcmodel:null on every product/
 * journey/event. NO ATC collection is ever seeded; firestore-atc is never opened.
 *
 * Usage (from the e2e/ dir):
 *   node journey-cohort/seed-cohort.js --seed        # MUST run first (the baseline)
 *   node flutter-suite/seed-events.cjs --seed        # then this (the events extras for user 96)
 *   node flutter-suite/seed-events.cjs --teardown    # sweep this bucket's extras
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');

const RUN = process.env.JRNY_RUNID || 'jrny';
// The driven user for this bucket (cohort index 96 — an Auth user with ≥4 events + a 2nd journey).
const IDX = Number(process.env.EVENTS_IDX || 96);
const P = `${RUN}_profile_${IDX}`; // profileid == profile_data doc id (the cohort spine)

// Cohort-shared catalog ids we reference (must match seed-cohort.js CAT) — the active product PA is
// the Event-Mode queue product whose participantdeliverysequence carries the queue + event leaves.
const fam = IDX % 4;
const PA = `${RUN}_P_${fam}`; // products: active Event-Mode product for user IDX (CAT.product(fam))
const ppA = `${RUN}_pp_${IDX}_a`; // participantsproduct doc id (PA delivery unit) for user IDX

// ── run+bucket-scoped doc ids (deterministic; idempotent re-seed) ──────────────────────────────
const ID = {
  // the LIVE arena event (the one home.eventMode resolves → drives the whole arena hub)
  liveEvent: `${RUN}_ev_live_96`,
  liveDeliveryEvents: `${RUN}_de_live_96`,
  liveEventEpr: `${RUN}_epr_live_96`,
  liveEventDeliverable: `${RUN}_dele_live_96`,
  liveArena: `${RUN}_ae_live_96`,
  liveEticket: `${RUN}_etk_live_96`,
  // the FUTURE event (AvailableEvents Event-Mode RSVP target + countdown banner newest)
  futureEvent: `${RUN}_ev_future_96`,
  futureDeliveryEvents: `${RUN}_de_future_96`,
  // the FUTURE arena event (ArenaEventRequest RSVP target)
  futureArena: `${RUN}_ae_future_96`,
  futureArenaEvent: `${RUN}_ev_future_arena_96`,
  // arena-hub docs keyed to the LIVE event
  arenaLayer: `${RUN}_arenalayer_96`,
  highlightFeed: `${RUN}_hl_feed_96`,
  highlightReport: `${RUN}_hl_report_96`,
  zoneAssignment: `${RUN}_epz_96`,
  zone: `${RUN}_zone_96`,
  cohort: `${RUN}_bigcohort_96`,
  // story player + impact video + post categories
  participantVideoAsk: `${RUN}_pva_story_96`,
  staticImpact: `${RUN}_smd_impact`,
  postCatAchv: `${RUN}_postcat_achv`,
  postCatReport: `${RUN}_postcat_report`,
  // CTD tweet wall
  tweet1: `${RUN}_ctd_tweet_96_0`,
  tweet2: `${RUN}_ctd_tweet_96_1`,
};

// Extra marker on TOP of the TAG so this bucket's extras can be torn down on their own if desired.
const EXTRA = { eventsbucket: true };

// Collections this bucket writes (run-scoped teardown via testrunid). The cohort SEEDED list already
// covers the shared ones; we list every collection we touch so teardown is self-contained.
const SEEDED = [
  'event collection',
  'delivery events',
  'arena events',
  'arena e-ticket',
  'event participation request',
  'deliverables',
  'participantdeliverysequence',
  'arenalayers',
  'arena highlights',
  'event participant zones',
  'event zones',
  'big cohorts',
  'participantvideoask',
  'static meta data',
  'post_categories',
  'products',
  'CTD',
];

// App-written collections whose docs carry NO testrunid (the product code writes them on the driven
// action). Swept by the driven user's profileid on teardown. `arenalayers`/`arena highlights` ARE
// seeded-and-tagged (the app only UPDATES a field on them), so they fall out via testrunid; the NEW
// app-written docs are `event rsvp` (RSVP) and `CTD` tweets (the CTD doc the app .set()s).
const APP_WRITE = [
  { col: 'event rsvp', field: 'profileid', op: '==' },
  { col: 'CTD', field: 'profileid', op: '==' },
];

async function seedBucket() {
  const admin = seed.initAdmin(); // hard-aborts unless the dedicated test project
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const tag = { ...TAG(RUN), ...EXTRA };
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (days) => T.fromMillis(Date.now() - days * 86400e3);
  const future = (days) => T.fromMillis(Date.now() + days * 86400e3);

  console.log(`\n[seed-events] run=${RUN} user=${P} (idx ${IDX}) active product=${PA}`);

  const bw = db.bulkWriter();
  bw.onWriteError((err) => err.failedAttempts < 5);
  const W = (r, d, opts) => bw.set(r, d, opts || {});

  // ── 1) the LIVE arena event (drives home.eventMode → profileJourneyProduct.eventmode.eventref) ──
  // event collection: home reads requestData.eventref → this doc; ArenaExplore/Reports/Highlights
  // key on the SAME ref. `name` is read by home (currenteventname); also give start_date/end_date so
  // the calendar/AvailableEvents shapes are consistent. atcmodel:null (event-color key only).
  W(ref('event collection', ID.liveEvent), {
    id: ID.liveEvent, docid: ID.liveEvent, name: `LIVE Arena Event ${RUN}`, eventname: `LIVE Arena Event ${RUN}`,
    start_date: past(1), end_date: future(1), eventdate: past(1), arenaeventid: ID.liveArena,
    // delete:false — MastercalendarClone.getDataFromFireStore (F9) does `if(element["delete"])` UNGUARDED on
    // every start_date>=startOfMonth event; a missing field throws "Null is not a subtype of bool" (swallowed
    // un-awaited, but it aborts the calendar body). false lets the calendar/marathon list actually populate.
    delete: false,
    // atcmodel:'' not null — Mastercalendar.getATCModelColor(eventData['atcmodel']) (mastercalendar.dart:1203,
    // the appointments-bucket calendar, whose event query is GLOBAL by end_date) wants a non-null String; null
    // throws "Null is not a String". '' is the safe default-color else-branch (not ATC data — just a color key).
    eventtyperef: ref('delivery events', ID.liveDeliveryEvents), atcmodel: '', ...tag,
  });
  W(ref('delivery events', ID.liveDeliveryEvents), {
    docid: ID.liveDeliveryEvents, eventname: `LIVE Arena Delivery ${RUN}`,
    events: [ref('event collection', ID.liveEvent)], atcmodel: null, ...tag,
  });
  // the EPR the event-delivery leaf points at (home derefs fileref[0] → this → .eventref → liveEvent)
  W(ref('event participation request', ID.liveEventEpr), {
    docid: ID.liveEventEpr, profileid: P, eventref: ref('event collection', ID.liveEvent),
    productref: ref('products', PA), eventtyperef: ref('delivery events', ID.liveDeliveryEvents),
    status: 'ongoing', arenaeventid: ID.liveArena, participantproductid: ppA,
    eventdate: past(1), doccreateddate: past(2), ...tag,
  });
  // the ONGOING event deliverable leaf (home.eventMode firstWhere type==event && status ongoing)
  W(ref('deliverables', ID.liveEventDeliverable), {
    docid: ID.liveEventDeliverable, profileid: P, type: 'event', status: 'ongoing',
    fileref: [ref('event participation request', ID.liveEventEpr)], participantproductid: ppA,
    participantjourneyid: `${RUN}_pjp_${IDX}`, ...tag,
  });
  // the live arena event row (also used by Mastercalendar carousel; non-deleted, started)
  W(ref('arena events', ID.liveArena), {
    id: ID.liveArena, docid: ID.liveArena, eventref: ref('event collection', ID.liveEvent),
    deliveryref: ref('delivery events', ID.liveDeliveryEvents), productref: ref('products', PA),
    eventname: `LIVE Arena ${RUN}`, type: 'event', delete: false, heroevent: true,
    startdate: past(1), enddate: future(1), atcmodel: null, ...tag,
  });
  // arena e-ticket (active) for the live event → home sets profileJourneyProduct.arenaticket (unlocked
  // because we seed NO active arenavideoask for this event, so home does not flip arenaticket.lock).
  W(ref('arena e-ticket', ID.liveEticket), {
    docid: ID.liveEticket, profileid: P, eventref: ref('event collection', ID.liveEvent),
    eventparticipationref: ref('event participation request', ID.liveEventEpr),
    producteligible: [PA], active: true, lock: false,
    eventname: `LIVE Arena Event ${RUN}`, venue: 'Test Arena Hall',
    eventstartdate: past(1), eventenddate: future(1), ...tag,
  });

  // ── 2) splice the ongoing event leaf into the ACTIVE product's participantdeliverysequence ──────
  // home reads participantdeliverysequence/{P}.products[participantproductid==ppA].delivery; it must
  // contain our ONGOING event leaf so eventMode resolves. We REBUILD the cohort's sequence for user
  // 96 deterministically (cohort: queue ongoing + appointment completed + event leaves completed) and
  // ADD the live ongoing event leaf to PA's delivery. Idempotent overwrite of the {P} doc.
  const ppB = `${RUN}_pp_${IDX}_b`;
  const seqQ = `${RUN}_delq_${IDX}`, seqA = `${RUN}_dela_${IDX}`;
  const PB = `${RUN}_P_appt`;
  // cohort's completed event deliverables for user 96 (E = eventCountFor(96,200)). We re-list them so
  // the rebuilt sequence keeps the cohort's completed event leaves AND adds the new ongoing one.
  const E = 8 + (IDX % 5); // == seed-cohort eventCountFor heavy-band for idx 96 (8..12)
  const cohortEventLeaves = [];
  for (let k = 0; k < E; k++) {
    cohortEventLeaves.push({ type: 'event', status: 'completed', sequenceref: ref('deliverables', `${RUN}_dele_${IDX}_${k}`) });
  }
  W(ref('participantdeliverysequence', P), {
    docid: P, profileid: P, products: [
      {
        participantproductid: ppA, productref: ref('products', PA), delivery: [
          { type: 'queue', status: 'ongoing', sequenceref: ref('deliverables', seqQ) },
          { type: 'event', status: 'ongoing', sequenceref: ref('deliverables', ID.liveEventDeliverable) },
          ...cohortEventLeaves,
        ],
      },
      {
        participantproductid: ppB, productref: ref('products', PB), delivery: [
          { type: 'appointment', status: 'completed', sequenceref: ref('deliverables', seqA) },
        ],
      },
    ], ...tag,
  });

  // ── 3) give the ACTIVE product an Event-Mode deliverytype so AvailableEvents lists a future event ─
  // AvailableEvents reads products(mode in Event/Installation Event Mode).deliverytype[] (refs into
  // `delivery events`), then `event collection` where start_date>now referenced by that delivery doc.
  // We MERGE deliverytype onto PA (keeps the cohort product fields) and seed the future event + its
  // delivery doc. unlimited:true so the RSVP card is not capacity-gated.
  W(ref('products', PA), { id: PA, deliverytype: [ref('delivery events', ID.futureDeliveryEvents)], unlimited: true, atcmodel: null, ...tag }, { merge: true });
  W(ref('event collection', ID.futureEvent), {
    id: ID.futureEvent, docid: ID.futureEvent, name: `Upcoming Event ${RUN}`, eventname: `Upcoming Event ${RUN}`,
    start_date: future(14), end_date: future(15), eventdate: future(14),
    delete: false, // see liveEvent note — F9 calendar reads element["delete"] unguarded
    eventtyperef: ref('delivery events', ID.futureDeliveryEvents), atcmodel: '', ...tag, // '' not null — see liveEvent getATCModelColor note
  });
  W(ref('delivery events', ID.futureDeliveryEvents), {
    docid: ID.futureDeliveryEvents, eventname: `Upcoming Event Delivery ${RUN}`,
    events: [ref('event collection', ID.futureEvent)], atcmodel: null, ...tag,
  });

  // ── 4) a FUTURE non-deleted arena event for ArenaEventRequest ("Yes, I'm In!") ──────────────────
  W(ref('event collection', ID.futureArenaEvent), {
    id: ID.futureArenaEvent, docid: ID.futureArenaEvent, name: `Upcoming Arena ${RUN}`, eventname: `Upcoming Arena ${RUN}`,
    start_date: future(20), end_date: future(21), eventdate: future(20), delete: false, atcmodel: '', ...tag, // '' not null — getATCModelColor
  });
  W(ref('arena events', ID.futureArena), {
    id: ID.futureArena, docid: ID.futureArena, eventref: ref('event collection', ID.futureArenaEvent),
    deliveryref: ref('delivery events', ID.futureDeliveryEvents), productref: ref('products', PA),
    eventname: `Upcoming Arena Event ${RUN}`, type: 'event', delete: false,
    startdate: future(20), enddate: future(21), atcmodel: null, ...tag,
  });

  // ── 5) arena-hub docs keyed to the LIVE event (Explore / Highlights / Reports / Zone) ───────────
  // arenalayers — ArenaExplore "Mark Attended" toggles `attended` arrayUnion(profileid) (the app
  // write). We seed it WITHOUT user 96 in `attended` so the first tap is an arrayUnion add.
  W(ref('arenalayers', ID.arenaLayer), {
    docid: ID.arenaLayer, eventref: ref('event collection', ID.liveEvent), delete: false,
    title: `Arena Layer ${RUN}`, sequence: 0, images: ['https://example.com/e2e-layer.png'],
    description: ['Arena layer point one for e2e.', 'Arena layer point two for e2e.'],
    attended: [], ...tag,
  });
  // arena highlights — ArenaHighlights feed (render) + ParticipantReports (the "Share To Community"
  // anonymous toggle = the app write). created MUST be a Timestamp (both screens sort by .toDate()).
  W(ref('arena highlights', ID.highlightFeed), {
    docid: ID.highlightFeed, eventref: ref('event collection', ID.liveEvent), profileid: P,
    from: 'achievement', title: `Arena Highlight ${RUN}`, description: 'A seeded arena highlight for the feed.',
    anonymous: false, created: past(1), ...tag,
  });
  W(ref('arena highlights', ID.highlightReport), {
    docid: ID.highlightReport, eventref: ref('event collection', ID.liveEvent), profileid: P,
    from: 'participantreports', title: `My Participant Report ${RUN}`, description: 'My seeded arena report.',
    anonymous: true, created: past(1), ...tag,
  });
  // ArenaParticipantZone — banner from event participant zones + event zones(open) + big cohorts(active)
  W(ref('event participant zones', ID.zoneAssignment), {
    docid: ID.zoneAssignment, profileid: P, eventref: ref('event collection', ID.liveEvent),
    selectedzone: ID.zone, eveligiliblecohorts: [ID.cohort], eligiliblecohorts: [ID.cohort],
    mentors: [`${RUN}_pf_eis`], coordinators: [`${RUN}_pf_eis`], created: past(1), ...tag,
  });
  W(ref('event zones', ID.zone), {
    docid: ID.zone, zonename: 'Zone A', status: 'open', starttime: future(1),
    mentors: [`${RUN}_pf_eis`], coordinators: [`${RUN}_pf_eis`], ...tag,
  });
  W(ref('big cohorts', ID.cohort), { docid: ID.cohort, name: `Cohort A ${RUN}`, status: 'active', atcmodel: null, ...tag });

  // ── 6) story player + impact video + post categories (render-only legs) ─────────────────────────
  W(ref('participantvideoask', ID.participantVideoAsk), {
    docid: ID.participantVideoAsk, profileid: P, arenaevent: ref('event collection', ID.liveEvent),
    fileurl: 'https://example.com/e2e-story.mp4', created: '1/1/2026', addtohighlights: true, ...tag,
  });
  W(ref('static meta data', ID.staticImpact), {
    docid: ID.staticImpact, title: 'See How other Peoples Value',
    videoUrl: ['https://example.com/e2e-impact.m3u8'], ...tag,
  });
  W(ref('post_categories', ID.postCatAchv), { docid: ID.postCatAchv, type: 'Achievement', sequence: 0, ...tag });
  W(ref('post_categories', ID.postCatReport), { docid: ID.postCatReport, type: 'Report', sequence: 1, ...tag });

  // ── 7) CTD tweet wall (PersonalTweets/SocialTweets render; AddTweets writes a new CTD doc) ───────
  W(ref('CTD', ID.tweet1), { docid: ID.tweet1, profileid: P, name: `Cohort User ${IDX} ${RUN}`, tweet: 'My first CTD tweet (seeded).', time: past(3), ...tag });
  W(ref('CTD', ID.tweet2), { docid: ID.tweet2, profileid: P, name: `Cohort User ${IDX} ${RUN}`, tweet: 'My second CTD tweet (seeded).', time: past(2), ...tag });

  await bw.close();
  console.log('  ✓ events extras seeded: live event + arena hub + future event/arena RSVP + tweets/categories');
  return { RUN, IDX, P, PA, ID };
}

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // run-tagged docs (this bucket's extras carry {testrunid:RUN}).
  const n = await seed.teardownCollections(db, SEEDED, RUN);
  // app-written docs (no testrunid) — by the driven user's profileid.
  let appDeleted = 0;
  for (const { col, field, op } of APP_WRITE) {
    const snap = await db.collection(col).where(field, op, P).get().catch(() => ({ docs: [] }));
    for (const d of snap.docs) { await d.ref.delete().catch(() => {}); appDeleted++; }
  }
  return n + appDeleted;
}

module.exports = { RUN, IDX, P, PA, ID, SEEDED, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-events] seeded for', r.P); }
    else if (mode === '--teardown') { const n = await teardownBucket(); console.log('[seed-events] torn down', n, 'docs for run', RUN, '+ user', P); }
    else { console.log('usage: seed-events.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
