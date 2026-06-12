// @ts-nocheck
/**
 * seed-journey.cjs — Flutter e2e BUCKET seed: "Journey dashboard & Mode" (key `jrny`, user idx 92).
 *
 * EXTENDS the 200-user cohort (e2e/journey-cohort/seed-cohort.js) for the ONE driven user
 *   profileid `jrny_profile_92`  /  email `participant92+jrny@example.com`  /  pw `Test!1234`
 * with the feature preconditions the FEATURE-CATALOG.md §4 (journey-dashboard-mode) rows require —
 * ONLY what those features need ON TOP of the cohort baseline. The cohort already gives this user:
 *   profile_data (participantmode 'Event Mode'), the purchase quartet, participantsproduct ppA/ppB
 *   (ppA = product jrny_P_0, mode 'Event Mode'), queue_token + the full render chain,
 *   participantdeliverysequence, ≥4 attended events, content analytics, a 2nd-journey upgrade.
 * So here we add: the Mode-Widget engine config (`product mode config` + a real `participant mode
 * checklist.widget[]`), the wishlist/dodont/playlist/form widget sources, a `participant AEL` cycle
 * (+ `interim crossover`), the Evolve/Legacy/Impact/AHSpace static-meta + content sources, the
 * `participantJourneySequence` + `deliverables` rows the "My Journey" tab reads, and the `chat config`
 * + `counters/ticketCounter` the Request-Clarity-Call / Request-Interview ticket writes need.
 *
 * ANTI-CIRCULAR: these are PRECONDITIONS only. The bucket test asserts the doc the APP writes on the
 * action (clientissue / participant mode checklist.widget / evolution wishlist / participant AEL.mywishlist
 * / participantdashboard.livinglegacy) — NEVER a value seeded here.
 *
 * PRODUCTION-SAFE BY CONSTRUCTION: every write goes through seed.initAdmin() (hard-aborts off the test
 * project allowlist lib/test-project.js); every doc carries {testrunid:'jrny', _testdata:true} via TAG;
 * deterministic run+idx-prefixed doc ids (idempotent set/merge); atcmodel:null on every product/journey/
 * event; NO ATC collection is ever seeded and firestore-atc is never opened.
 *
 * Usage (from the e2e/ dir):
 *   node flutter-suite/seed-journey.cjs --seed
 *   node flutter-suite/seed-journey.cjs --teardown
 */
'use strict';

const { seed, TAG } = require('../lib/seed-common');

const RUN = 'jrny';                          // MUST match the cohort run (JRNY_RUNID default 'jrny')
const IDX = Number(process.env.JRNY_USER_IDX || 92); // the driven user index in the cohort
const P = `${RUN}_profile_${IDX}`;           // jrny_profile_92 — the driven user's profileid

// The cohort assigns user i: family = i % 4; PA = `${RUN}_P_${family}`; ppA = `${RUN}_pp_${i}_a`.
const FAMILY = IDX % 4;                       // 92 % 4 == 0 → family 0 (uP!)
const PA = `${RUN}_P_${FAMILY}`;              // jrny_P_0 — the active (queue-delivered) product
const PPA = `${RUN}_pp_${IDX}_a`;             // jrny_pp_92_a — the active participantproduct id
const J1 = `${RUN}_J_${FAMILY}`;              // jrny_J_0 — the user's first journey
const MODE = 'Event Mode';                    // ppA.mode == products.mode == profile_data.participantmode

// ── this bucket's own doc ids (run+user prefixed; never collide with cohort ids) ────────────────────
const B = {
  // Mode-Widget engine
  productModeConfig: `${RUN}_pmcfg_${IDX}`,       // product mode config (PA + MODE) — drives the checklist widgets[]
  modeChecklist: `${RUN}_pmc_${IDX}`,             // participant mode checklist — COHORT already writes this id; we OVERRIDE its widget[]
  ael: `${RUN}_ael_${IDX}`,                       // participant AEL cycle (validated) — wishlist-self + Evolve + AELVersion
  // form the mode checklist "form" widget points at
  modeForm: `${RUN}_modeform_${IDX}`,             // delivery forms template (default DB)
  // My-Journey tab
  pjsDoc: `${RUN}_pjs_${IDX}`,                     // participantJourneySequence doc (read by My Journey)
  pjsDeliverable: `${RUN}_pjsdel_${IDX}`,         // a deliverables row joined to the PJS by participantjourneyid
  // interim crossover history for the AEL cycle
  cross0: `${RUN}_xover_${IDX}_0`,                // first crossover (validatedby null)
  cross1: `${RUN}_xover_${IDX}_1`,                // later crossover (validatedby set)
  // A&H space
  ahSpace: `${RUN}_ahspace_${IDX}`,
  ahSpaceName: `${RUN}_ahname_${IDX}`,
  ahSpaceType: `${RUN}_ahtype_${IDX}`,
  ahEvent: `${RUN}_ahevent_${IDX}`,               // event collection doc the AHSpace + Impact read
  // content the playlist queues + legacy before/after read
  contentUrl: `${RUN}_cu_${IDX}`,                 // content_urls (general content + legacy before&after)
  solarVoice: `${RUN}_svp_${IDX}`,                // solar voice playlist
  adsPlaylist: `${RUN}_ads_${IDX}`,               // adsplaylist
  series: `${RUN}_series_${IDX}`,                 // series (eiflix)
  // impact Humans-of-Excellence + video-ask + interview summary
  communityPost: `${RUN}_cpost_${IDX}`,
  arenaVideoAsk: `${RUN}_ava_${IDX}`,
  ticketCounter: 'ticketCounter',                 // counters/ticketCounter — fixed id the ticket CF reads
};

// The fixed-id config docs the read paths use verbatim (NOT run-namespaced; tagged + merged so other
// runs/real data are not clobbered — teardown only removes our tag where the doc is run-owned, and these
// fixed docs are swept defensively by id at teardown).
const FIXED = {
  smWishlist: 'wishlist',                 // static meta data/wishlist  (family + self trailer)
  smEvolve: 'evolve',                     // static meta data/evolve    (Evolve video + latestupdates)
  smLegacy: 'Launch Your Legacy',         // static meta data/Launch Your Legacy
  smBigImpact: 'big impact',              // static meta data/big impact
  smBigProgram: 'big program',            // static meta data/big program
};

async function seedBucket() {
  const admin = seed.initAdmin();             // hard-aborts unless the dedicated test project
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const tag = TAG(RUN);
  const ref = (col, id) => db.collection(col).doc(id);
  const past = (d) => T.fromMillis(Date.now() - d * 86400e3);
  const future = (d) => T.fromMillis(Date.now() + d * 86400e3);

  console.log(`\n[seed-journey.cjs] bucket=jrny user=${P} (idx ${IDX}) PA=${PA} ppA=${PPA} → ${seed.TEST_PROJECT_ID || 'test project'}`);

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // 1) MODE-WIDGET ENGINE: product mode config + participant mode checklist widget[]
  //    homeContent.getParticipantModeTaskList (homeContent.dart:1722-1846) only builds the Mode
  //    Checklist tiles when a `product mode config` doc matches keyed by `${productref.id}${mode}`
  //    (== PA+MODE) AND the participantsproduct (ppA) mode == that mode (cohort gives ppA.mode='Event
  //    Mode'). The config's `widgets[]` is the template; the checklist's `widget[]` carries the runtime
  //    status/reference. Tiles surfaced: dodont + evolutionwishlist + evolutionwishlistself (via taskMode,
  //    homeContent.dart:148) and Mode-Based-Playlist + a Form tile (the playlist/form widgets).
  // ──────────────────────────────────────────────────────────────────────────────────────────────

  // The widget set (one of each testable kind). dos/donts live on the dodont widget (DoDont reads
  // widget["dos"]/["donts"] off the merged todo). reference arrays carry the content ids the playlist
  // queues + the form tile dereference. `form` widget reference → the modeForm `delivery forms` doc.
  const contentRefs = [ref('content_urls', B.contentUrl)];
  const formRef = [ref('delivery forms', B.modeForm)];
  const widgets = [
    { widgetid: 'dodont', title: `Journey Do's & Don'ts ${RUN}`, mandatory: false, reference: [],
      dos: ['Show up to every session on time.', 'Complete your mode checklist weekly.'],
      donts: ['Skip the orientation call.', 'Leave your evolution wishlist empty.'] },
    { widgetid: 'evolutionwishlist', title: `Evolution Wishlist (Family) ${RUN}`, mandatory: false, reference: [], dos: [], donts: [] },
    { widgetid: 'evolutionwishlistself', title: `Evolution Wishlist (Self) ${RUN}`, mandatory: false, reference: [], dos: [], donts: [] },
    { widgetid: 'generalcontent', title: `General Content ${RUN}`, mandatory: false, reference: contentRefs, dos: [], donts: [] },
    { widgetid: 'solarvoice', title: `Solar Voice ${RUN}`, mandatory: false, reference: [ref('solar voice playlist', B.solarVoice)], dos: [], donts: [] },
    { widgetid: 'adsplaylist', title: `Ads Playlist ${RUN}`, mandatory: false, reference: [ref('adsplaylist', B.adsPlaylist)], dos: [], donts: [] },
    { widgetid: 'eiflix', title: `EiFlix ${RUN}`, mandatory: false, reference: [ref('series', B.series)], dos: [], donts: [] },
    { widgetid: 'form', title: `Mode Form ${RUN}`, mandatory: false, reference: formRef, dos: [], donts: [] },
  ];

  // product mode config — keyed (productref, mode); widgets[] copied into the checklist by the home builder.
  await ref('product mode config', B.productModeConfig).set({
    docid: B.productModeConfig, productref: ref('products', PA), mode: MODE,
    widgets: widgets.map((w) => ({ ...w })), modetips: [], lastupdate: T.now(), ...tag,
  }, { merge: true });

  // participant mode checklist — the cohort seeds this id with widget:[] ; OVERRIDE with the real widget[]
  // (runtime status fields). MUST carry profileid + aelid + participantproductid + productref + mode + docid:
  // the wishlist forms read activeChecklist["profileid"]/["aelid"]/["participantproductid"]/["docid"], and the
  // home builder keys config by checklistData["productref"].id + ["mode"] and gates on participantproductid.
  await ref('participant mode checklist', B.modeChecklist).set({
    docid: B.modeChecklist, profileid: P, mode: MODE, productref: ref('products', PA),
    participantproductid: PPA, aelid: B.ael,
    widget: widgets.map((w) => ({ ...w, status: null, result: [], completed: [], completedcontent: [] })),
    createddate: past(30), ...tag,
  }, { merge: false });

  // ── the Form tile's `delivery forms` template (default DB). The mode-checklist Form tile reads
  //    `delivery forms` whereIn the form-widget reference ids and opens FillForm('/delivery forms/{docid}').
  //    A short, valid form (one optional Text field) so Preview→Confirm submits without a required-date crash.
  await ref('delivery forms', B.modeForm).set({
    docid: B.modeForm, formname: `Journey Mode Form ${RUN}`,
    formarray: [
      { type: 'label', fieldname: `Mode Reflection ${RUN}`, fielddescription: 'Seeded mode-checklist form.' },
      { type: 'Text', fieldname: `What did you learn ${RUN}`, required: false },
    ], ...tag,
  }, { merge: true });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // 2) participant AEL cycle (validated) — Evolve home (flag=='validated'), AELVersion details,
  //    evolution-wishlist-self (reads participant AEL/{aelid}.mywishlist → asserted after submit).
  //    crossovermetric all-null + participantresponse null = the accept/decline RECOMMENDATION precondition
  //    (the in-Dart changedMetrics gate also needs the interim crossover ordering seeded in (5)).
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  const metricKeys = ['Health', 'Personal Genius', 'Family', 'Career', 'Business'];
  const crossoverNull = {};
  metricKeys.forEach((k) => (crossoverNull[k] = { metric: null, jump: null }));
  await ref('participant AEL', B.ael).set({
    docid: B.ael, aelid: B.ael, profileid: P, atcmodel: null, flag: 'validated', status: 'ongoing',
    evolutiontype: 'uP!', evolutionyearsaved: 0, mywishlist: [], participantresponse: null,
    crossovermetric: crossoverNull, productref: ref('products', PA), participantproductid: PPA,
    // AELVersion.build (aelVersion.dart:302) renders "Updated on ${participantAEL["created"].toDate()}"
    // UNGUARDED — it reads `created`, NOT `createddate`; without it the build throws .toDate()-on-null.
    created: past(40), createddate: past(40), ...tag,
  }, { merge: true });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // 3) MY-JOURNEY tab — participantJourneySequence (read by getMyJourney where profileid==pid) +
  //    a deliverables row joined by participantjourneyid==<pjs doc id>. subscriptionstart/end MUST be
  //    Timestamps (.toDate() is called unguarded). journeyref deref'd by .path. The list rendering is the
  //    feature; the clarity-call button at i==0 (when the list is non-empty) is the write-asserted action.
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  await ref('participantJourneySequence', B.pjsDoc).set({
    docid: B.pjsDoc, profileid: P, journeyref: ref('journey', J1), journeystatus: 'ongoing',
    subscriptionstart: past(90), subscriptionend: future(90),
    // getMyJourney (participantJourneySequence.dart:176-188) iterates doc['products'] UNGUARDED (.length),
    // then each products[j].productref(.path)/['status'], then products[j]['delivery'].length (188) — all
    // unguarded. So products[] needs productref + status + a delivery[] list (empty is a valid just-started
    // state; the deliverable-sequence render is covered separately by F16). The "Request Clarity Call"
    // button (item 0) only needs the journey list non-empty, which this single product satisfies.
    products: [{ productref: ref('products', PA), tentativestart: past(80), status: 'ongoing', delivery: [] }],
    participantproducts: [PPA], productref: [ref('products', PA)], ...tag,
  }, { merge: true });
  await ref('deliverables', B.pjsDeliverable).set({
    docid: B.pjsDeliverable, profileid: P, participantjourneyid: B.pjsDoc, type: 'queue', status: 'ongoing',
    fileref: [], participantproductid: PPA, ...tag,
  }, { merge: true });
  // ParticipantDeliverySequence (F16) renders product["subscriptionstart"/"end"].toDate() per
  // participantsproduct (participantDeliverySequence.dart:270) UNGUARDED — the cohort's ppA/ppB carry no
  // subscription dates → null.toDate() crash. Merge them onto THIS user's two products (journey-bucket-scoped
  // so the cohort baseline is untouched; only the journey bucket drives DeliverySequence).
  const PPB = `${RUN}_pp_${IDX}_b`;
  await ref('participantsproduct', PPA).set({ subscriptionstart: past(90), subscriptionend: future(90) }, { merge: true });
  await ref('participantsproduct', PPB).set({ subscriptionstart: past(90), subscriptionend: future(90) }, { merge: true });
  // ParticipantDeliverySequence (F16) build line 372 reads sequence["sequenceref"].path UNGUARDED, but ONLY
  // when sequence["label"] is empty — the cohort's participantdeliverysequence delivery items carry no label.
  // Overwrite THIS user's participantdeliverysequence with LABELED delivery items (journey-bucket-scoped) so
  // the ternary takes the safe Text(label) branch and never dereferences a null/loose sequenceref. mapProduct-
  // Delivery is keyed by participantproductid (ppA/ppB), matching the participantsproduct docids the build iterates.
  await ref('participantdeliverysequence', P).set({
    docid: P, profileid: P, products: [
      { participantproductid: PPA, productref: ref('products', PA), delivery: [
        { type: 'queue', status: 'ongoing', label: `Queue Delivery ${RUN}`, sequenceref: ref('deliverables', B.pjsDeliverable) },
        { type: 'event', status: 'completed', label: `Event Session ${RUN}`, sequenceref: ref('deliverables', B.pjsDeliverable) },
      ] },
      { participantproductid: PPB, productref: ref('products', PA), delivery: [
        { type: 'appointment', status: 'completed', label: `Onboarding Call ${RUN}`, sequenceref: ref('deliverables', B.pjsDeliverable) },
      ] },
    ], ...tag,
  }, { merge: true });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // 4) STATIC META DATA — wishlist (family + self trailer), evolve (video), Launch Your Legacy,
  //    big impact, big program. Trailers point at a publit.io id (playback 404s in test — fine, we
  //    never assert playback; the screens render their text/fields regardless). Fixed doc ids; merged.
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  const trailer = { url: 'https://media.publit.io/file/e2e-journey-trailer.m3u8', responsepublitio: { id: 'e2e-journey-trailer' }, thumbnail: 'https://example.com/e2e-thumb.png' };
  await ref('static meta data', FIXED.smWishlist).set({ family: { ...trailer }, self: { ...trailer }, ...tag }, { merge: true });
  await ref('static meta data', FIXED.smEvolve).set({ ...trailer, latestupdates: [], ...tag }, { merge: true });
  await ref('static meta data', FIXED.smLegacy).set({
    ...trailer, quizurl: 'https://example.com/legacy-quiz', latestupdates: [],
    'before&after': [ref('content_urls', B.contentUrl)], ...tag,
  }, { merge: true });
  // ImpactScreen.initState (impact.dart:70) does impactVideo["videoquestion"]?.id — `?.` guards null but
  // NOT a String, so a docid-string throws "String has no getter id"; it must be a DocumentReference. And
  // impact.dart:68/74 maps videoask→.id then queries `community post where docid whereIn postIds`, which
  // throws on an EMPTY array — so videoask must be a non-empty list of refs whose .id is a community-post docid.
  await ref('static meta data', FIXED.smBigImpact).set({ ...trailer, learnmore: 'https://example.com/big-impact', videoquestion: ref('arenavideoask', B.arenaVideoAsk), videoask: [ref('community post', B.communityPost)], humansofexcellence: [ref('community post', B.communityPost)], ...tag }, { merge: true });
  await ref('static meta data', FIXED.smBigProgram).set({ ...trailer, ...tag }, { merge: true });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // 5) Evolve/AELVersion/uP-life-report extras + interim crossover history.
  //    uP Life Report Summary/{profileid} delete:false → the Evolve card + UPLifeReportSummary render.
  //    Two interim crossover docs for the AEL: first validatedby null, the later one validated (a metric
  //    value) — the AELVersion recommendation branch precondition (aelVersion.dart:67-121). Best-effort.
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  await ref('uP Life Report Summary', P).set({
    docid: P, profileid: P, delete: false, summary: `Your evolution is on track ${RUN}.`,
    evolutionyearsaved: 2, createddate: past(20), ...tag,
  }, { merge: true });
  // NOTE: AELVersion.getParticipantAEL (aelVersion.dart:138) sorts these by `a["created"].toDate()` —
  // it reads `created`, NOT `createddate`; without a `created` Timestamp the comparator does null.compareTo
  // and throws NoSuchMethodError (surfaces via FlutterError.onError → fails F8). Seed BOTH keys.
  await ref('interim crossover', B.cross0).set({
    docid: B.cross0, aelid: B.ael, profileid: P, validatedby: null, created: past(50), createddate: past(50),
    crossovermetric: { Health: { metric: null } }, ...tag,
  }, { merge: true });
  await ref('interim crossover', B.cross1).set({
    docid: B.cross1, aelid: B.ael, profileid: P, validatedby: ref('profile_data', `${RUN}_pf_eis`),
    validateddate: past(10), created: past(10), createddate: past(10),
    crossovermetric: { Health: { metric: 7 }, 'Personal Genius': { metric: 6 } }, ...tag,
  }, { merge: true });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // 6) IMPACT sources — community post (Humans of Excellence), arenavideoask (video question),
  //    Big Interview Summary/{profileid}, queue generation (count read — cohort already seeds jrny_QG;
  //    we add one extra so the count is non-zero regardless). + A&H Space sources.
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // ImpactScreen "Humans of Excellence" ListView (impact.dart:932) reads doc["videos"][0]["thumbnail"]
  // UNGUARDED → a community post without a videos[] list throws Null['[]']. Seed a non-empty videos[].
  await ref('community post', B.communityPost).set({ docid: B.communityPost, profileid: P, title: `Human of Excellence ${RUN}`, videos: [{ thumbnail: 'https://example.com/e2e-thumb.png', responsepublitio: { id: 'e2e-journey-trailer' }, thumbnailhls: { responsepublitio: { id: 'e2e-journey-trailer' } } }], ...trailer, ...tag }, { merge: true });
  await ref('arenavideoask', B.arenaVideoAsk).set({ docid: B.arenaVideoAsk, title: `BiG Impact Video Ask ${RUN}`, ...tag }, { merge: true });
  await ref('Big Interview Summary', P).set({ docid: P, profileid: P, summary: `BiG interview summary ${RUN}.`, ...tag }, { merge: true });

  // A&H Space — arenaspace MUST have delete==false & participantslist arrayContains the profileid.
  // AHSpace.build looks up spaceName/spaceType/eventCollection maps (keyed by docid) and reads sub-fields
  // the seed didn't write: spaceName[..]["spacename"](:373)/["shortname"](:538), spaceType[..]["typename"](:468),
  // eventCollection[..]["name"](:438) — and it keys those lookups off arenaspace["spaceid"]/["pivottype"]/
  // ["queue"] which were ALSO missing (→ map[null] → null["x"] NoSuchMethodError). Seed all of them.
  await ref('event collection', B.ahEvent).set({
    id: B.ahEvent, docid: B.ahEvent, eventname: `A&H Touchpoint Event ${RUN}`, name: `A&H Touchpoint Event ${RUN}`, atcmodel: null,
    start_date: future(7), eventdate: future(7), ...tag,
  }, { merge: true });
  await ref('A&H_Space_Name', B.ahSpaceName).set({ docid: B.ahSpaceName, name: `Excellence Space ${RUN}`, spacename: `Excellence Space ${RUN}`, shortname: 'EX', ...tag }, { merge: true });
  await ref('A&H_Space_Type', B.ahSpaceType).set({ docid: B.ahSpaceType, type: `Coaching ${RUN}`, typename: `Coaching ${RUN}`, ...tag }, { merge: true });
  await ref('arenaspace', B.ahSpace).set({
    docid: B.ahSpace, delete: false, participantslist: [P],
    // spaceid/pivottype/queue are the docid keys AHSpace indexes the name/type/event maps by.
    spaceid: B.ahSpaceName, pivottype: B.ahSpaceType, queue: B.ahEvent,
    spacename: ref('A&H_Space_Name', B.ahSpaceName), spacetype: ref('A&H_Space_Type', B.ahSpaceType),
    eventref: ref('event collection', B.ahEvent), createddate: past(15),
    summary: `Your A&H touchpoint summary ${RUN}.`, disclaimer: 'Auto-generated summary.', ...tag,
  }, { merge: true });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // 7) CONTENT the playlist queues + legacy before/after dereference (whereIn). docid set (some queues
  //    query by docid, some by id) — set both. atcmodel:null where relevant.
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  await ref('content_urls', B.contentUrl).set({ docid: B.contentUrl, id: B.contentUrl, videoname: `Journey Content ${RUN}`, type: 'generalcontent', ...trailer, ...tag }, { merge: true });
  await ref('solar voice playlist', B.solarVoice).set({ id: B.solarVoice, docid: B.solarVoice, playlistname: `Journey Solar Voice ${RUN}`, ...tag }, { merge: true });
  // AdsPlaylistQueue (F14 ModePlaylist ads row) reads adsthumbnail as a CachedNetworkImage imageUrl (String,
  // REQUIRED → null throws "Null is not a String", adsplaylistQueue.dart:134) and startdate/enddate.toDate()
  // (:201/:211). Seed all three (+ adstitle/adstype for the labels).
  await ref('adsplaylist', B.adsPlaylist).set({ docid: B.adsPlaylist, id: B.adsPlaylist, name: `Journey Ads ${RUN}`, adsthumbnail: 'https://example.com/e2e-ads.png', adstitle: `Journey Ad ${RUN}`, adstype: 'Promo', startdate: past(10), enddate: future(30), ...tag }, { merge: true });
  await ref('series', B.series).set({ id: B.series, docid: B.series, seriesname: `Journey EiFlix ${RUN}`, ...tag }, { merge: true });

  // ──────────────────────────────────────────────────────────────────────────────────────────────
  // 8) TICKET write deps — chat config (raiseTickets reads categories, matches category=='Journey
  //    Related') + counters/ticketCounter (getNextTicketNumber transaction). Without chat config the
  //    clientissue still writes (category null), but seeding it makes the category resolve.
  // ──────────────────────────────────────────────────────────────────────────────────────────────
  await ref('chat config', `${RUN}_chatconfig`).set({
    docid: `${RUN}_chatconfig`, raiseTickets: true,
    categories: [{ category: 'Journey Related', subcategory: 'Clarity Call', assignto: `${RUN}_pf_eis` }],
    ...tag,
  }, { merge: true });
  await ref('counters', B.ticketCounter).set({ currentNumber: 5000, ...tag }, { merge: true });

  console.log(`  ✓ seeded journey bucket: product mode config + checklist(8 widgets) + AEL + interim crossover×2`);
  console.log(`  ✓ participantJourneySequence + deliverable, static meta data×5, arenaspace, content×4, chat config, ticket counter`);
  return { RUN, IDX, P, PA, PPA, ael: B.ael, modeChecklist: B.modeChecklist, modeForm: B.modeForm };
}

// Collections this seed writes (run-scoped teardown sweeps by testrunid). App-written docs (the doc the
// APP writes on the asserted action) carry NO testrunid → swept by the user's profileid below.
const SEEDED = [
  'product mode config', 'participant mode checklist', 'participant AEL', 'delivery forms',
  'participantJourneySequence', 'deliverables', 'static meta data', 'uP Life Report Summary',
  'interim crossover', 'community post', 'arenavideoask', 'Big Interview Summary',
  'arenaspace', 'A&H_Space_Name', 'A&H_Space_Type', 'event collection',
  'content_urls', 'solar voice playlist', 'adsplaylist', 'series', 'chat config', 'counters',
];

// App-written collections (no testrunid tag) — swept by the driven user's profileid / membership.
//   clientissue        : Request Clarity Call + Request My Interview (reportedBy/clientid == profileid)
//   evolution wishlist : the family-wishlist submit (profileid == P)
//   participantdashboard: the living-legacy submit (doc id == profileid)
const APP_WRITE = { profileid: ['clientissue', 'evolution wishlist'], docIdIsProfile: ['participantdashboard'] };

async function teardownBucket() {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  let n = await seed.teardownCollections(db, SEEDED, RUN);

  // app-written docs keyed by a profileid FIELD (clientissue uses reportedBy/clientid/issueReportedBy;
  // evolution wishlist uses profileid). Sweep each candidate field.
  for (const col of APP_WRITE.profileid) {
    for (const field of ['profileid', 'reportedBy', 'clientid', 'issueReportedBy']) {
      const snap = await db.collection(col).where(field, '==', P).get().catch(() => ({ docs: [] }));
      for (const d of snap.docs) { await d.ref.delete().catch(() => {}); n++; }
    }
  }
  // app-written docs whose DOC ID is the profileid (participantdashboard/{profileid}).
  for (const col of APP_WRITE.docIdIsProfile) {
    const d = await db.collection(col).doc(P).get().catch(() => null);
    if (d && d.exists) { await d.ref.delete().catch(() => {}); n++; }
  }
  return n;
}

const SEEDED_OUT = SEEDED;
module.exports = { RUN, IDX, P, PA, PPA, B, FIXED, SEEDED: SEEDED_OUT, seedBucket, teardownBucket };

if (require.main === module) {
  const mode = process.argv[2];
  (async () => {
    if (mode === '--seed') { const r = await seedBucket(); console.log('[seed-journey.cjs] seeded for', r.P); }
    else if (mode === '--teardown') { const n = await teardownBucket(); console.log('[seed-journey.cjs] torn down', n, 'docs for', P, 'run', RUN); }
    else { console.log('usage: seed-journey.cjs --seed | --teardown'); process.exit(1); }
    process.exit(0);
  })().catch((e) => { console.error('FAILED:', e.message || e, e.stack); process.exit(1); });
}
