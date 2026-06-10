// events.ts — actors, login, and the per-test external/prod stub installer for the Events, Arena &
// Calendar suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (Zoom/FCM/
// Wati/email/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no events
// screen can hit a real production Cloud Function (sendWhatsAppBroadcast / sendBatchEmail prod URLs)
// or open a real window. The initiate-event-product comms buttons are NOT driven by any shipped case
// (cross-project Wati/email — see blockers); the firewall is belt-and-suspenders.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.EVT_RUNID || 'evt';
export const PASSWORD = 'Test!1234';

/** Seeded events actors (seed-events.js roster). */
export const evtActors = {
  admin: `admin+${RUN}@example.com`,                 // roles {admin, ah, eventcoordinator, developer, floor, mentor}
  participant0: `participant0+${RUN}@example.com`,
  participant1: `participant1+${RUN}@example.com`,
  participant2: `participant2+${RUN}@example.com`,
  participant3: `participant3+${RUN}@example.com`,    // initiate cohort (EVT-10/11)
  participant4: `participant4+${RUN}@example.com`,
  participant5: `participant5+${RUN}@example.com`,
};

/** Seeded profileids (for asserting app-written refs / filtering rows by client name). */
export const evtProfileIds = {
  admin: `${RUN}_pf_admin`,
  p0: `${RUN}_pf_p0`,
  p1: `${RUN}_pf_p1`,
  p2: `${RUN}_pf_p2`,
  p3: `${RUN}_pf_p3`,
  p4: `${RUN}_pf_p4`,
  p5: `${RUN}_pf_p5`,
};

/** Seeded doc ids the specs assert against (must mirror seed-events.js ID). */
export const evtIds = {
  event1: `${RUN}_event_1`,
  arenaEvent1: `${RUN}_arenaevent_1`,
  product1: `${RUN}_P1`,
  epr0: `${RUN}_epr_0`,
  epr1: `${RUN}_epr_1`,
  d0: `${RUN}_D0`,
  etlog0: `${RUN}_etlog_0`,
  layer1: `${RUN}_layer_1`,
  // deep-suite ids
  productInstall: `${RUN}_P_inst`,
  venue1: `${RUN}_venue_1`,
  eticketP0: `${RUN}_eticket_p0`,
  etlogDup: `${RUN}_etlog_dup`,
  event2: `${RUN}_event_2`,
  arenaEvent2: `${RUN}_arenaevent_2`,
  pp3: `${RUN}_pp_3`,
  pp4: `${RUN}_pp_4`,
  pp5: `${RUN}_pp_5`,
  space1: `${RUN}_space_1`,
  spaceType1: `${RUN}_spacetype_1`,
  videoask1: `${RUN}_videoask_1`,
  pvideoask0: `${RUN}_pvideoask_0`,
  tag1: `${RUN}_tag_1`,
};

/** Run-unique display strings the specs type into search/forms and assert against rendered rows. */
export const evtNames = {
  installProduct: `TEST Install Product ${RUN}`,
  venue: `TEST Location ${RUN}`,
  host: `TEST Host ${RUN}`,
  initiateEvent: `TEST Initiate Event ${RUN}`,
  initiateArenaProduct: `TEST Install Product ${RUN}`, // arena row title in initiate = product name
  deliverySet: `TEST Delivery Set ${RUN}`,
  space: `TEST Space ${RUN}`,
  engagement: `TEST Engagement ${RUN}`,
  videoaskTag: `TEST Tag ${RUN}`,
  eodQueue: `TEST EOD Queue ${RUN}`,
  stageA: 'Stage A',
};

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installEvtStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded super-role events admin. */
export async function loginAsEvtAdmin(page: Page): Promise<void> {
  await loginAs(page, evtActors.admin, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset the EPR0 participation request + its linked deliverable back to the APPROVED/ongoing
 * precondition (so the mark-attended test is order- and re-run-independent: the EPR re-appears in the
 * "Mark Attendence" tab and the deliverable can transition again). Also deletes any events_profiles
 * doc a prior run created for this EPR — the app writes those with NO testrunid (so the seed teardown
 * can't sweep them), and clearing them keeps the EVT-04 "events_profiles created" assertion strictly
 * about THIS run's write. PRECONDITION write only — the test asserts the value the APP writes on the
 * real mark action (attended/completed/the new events_profiles doc), never this reset.
 */
export async function resetEprApproved(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('event participation request').doc(evtIds.epr0).set({ status: 'approved' }, { merge: true });
  await db.collection('deliverables').doc(evtIds.d0).set({ status: 'ongoing' }, { merge: true });
  const eprRef = db.collection('event participation request').doc(evtIds.epr0);
  const prior = await db.collection('events_profiles').where('eventrequest', '==', eprRef).get();
  for (const d of prior.docs) await d.ref.delete();
}

/** Build an admin DocumentReference (for asserting app-written ref fields against a known seeded id). */
export function refTo(collection: string, id: string) {
  return seed.initAdmin().firestore().collection(collection).doc(id);
}

/**
 * Reset the e-ticket issuance precondition: delete any `arena e-ticket` previously created for
 * participant1's profileid (the screen renders the "Approve" button only when no e-ticket exists for
 * that profileid — `mapArenaETicket[profileid] === undefined`). Deleting the prior run's ticket makes
 * the issuance case re-runnable. PRECONDITION cleanup only — the test asserts the doc the APP creates.
 */
export async function resetEticketForP1(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // The APP writes arena e-ticket docs with NO testrunid tag, so clean by the (run-unique) profileid
  // only — a testrunid filter misses the app-written doc and leaves it, flipping the row to "Generated".
  const snap = await db.collection('arena e-ticket')
    .where('profileid', '==', evtProfileIds.p1)
    .get();
  for (const d of snap.docs) await d.ref.delete();
}

// =====================================================================================================
// Deep-suite precondition resets (events-deep.spec.ts). Each is a PRECONDITION write only — the spec
// asserts the value the APP/CF writes on the real action, never the value these helpers set.
// =====================================================================================================

/** Re-issue p0's QR e-ticket to the ACTIVE precondition (active:true, producteligible:[P1]) and clear
 *  any `arena e-ticket log` rows whose docid != the seeded duplicate-guard id (so EVT-07's fresh scan
 *  writes a NEW log, and EVT-08's seeded duplicate row survives). Idempotent / re-runnable. */
export async function resetQrEticketForP0(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const T = admin.firestore.Timestamp;
  const daysFromNow = (d: number) => T.fromMillis(Date.now() + d * 86400e3);
  // EPR0 must be "approved" so p0 appears on the arena-e-ticket-approve screen (EVT-06). EVT-04 (a
  // different spec file) flips EPR0 → "attended"; restore it here so EVT-06 is order-independent.
  await db.collection('event participation request').doc(evtIds.epr0).set({ status: 'approved' }, { merge: true });
  await db.collection('arena e-ticket').doc(evtIds.eticketP0).set({
    docid: evtIds.eticketP0, profileid: evtProfileIds.p0,
    eventref: db.collection('event collection').doc(evtIds.event1),
    producteligible: [evtIds.product1], active: true,
    eventstartdate: daysFromNow(-2), eventenddate: daysFromNow(7),
    testrunid: RUN, _testdata: true,
  }, { merge: true });
  // Re-assert the seeded duplicate-guard log row (EVT-08 may have run; setDoc on the same uniqueid is
  // idempotent). The APP-written fresh-scan log (EVT-07) carries NO testrunid → delete it by its
  // run-unique uniqueid so EVT-07 re-runs from a no-log state.
  await db.collection('arena e-ticket log').doc(evtIds.etlogDup).set({
    docid: evtIds.etlogDup, profileid: evtProfileIds.p0,
    eventref: db.collection('event collection').doc(evtIds.event1),
    product: db.collection('products').doc(evtIds.product1), logdate: T.now(),
    eticketref: db.collection('arena e-ticket').doc(evtIds.eticketP0),
    testrunid: RUN, _testdata: true,
  }, { merge: true });
}

/** Delete the fresh-scan QR log the app wrote for a given uniqueid (EVT-07 re-runnability + EVT-08
 *  precondition: only the seeded duplicate row must exist for that uniqueid). */
export async function deleteQrLog(uniqueid: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('arena e-ticket log').doc(uniqueid).delete().catch(() => {});
}

/** Read the e-ticket active flag (EVT-06 pre/post assertion of the value the toggle WROTE). */
export async function getEticketP0Active(): Promise<boolean | undefined> {
  const admin = seed.initAdmin();
  const snap = await admin.firestore().collection('arena e-ticket').doc(evtIds.eticketP0).get();
  return snap.exists ? snap.data().active : undefined;
}

/** Reset the initiate-event-product cohort (EVT-10/11): p3..p5 participantsproduct back to status:null
 *  and delete any EPR the prior Initiate created for them (the APP writes EPRs with a fresh auto-id and
 *  NO testrunid → clean by arenaeventid2 + profileid). Re-runnable. */
export async function resetInitiateCohort(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const productRef = db.collection('products').doc(evtIds.productInstall);
  for (const [ppId, pf] of [[evtIds.pp3, evtProfileIds.p3], [evtIds.pp4, evtProfileIds.p4], [evtIds.pp5, evtProfileIds.p5]] as const) {
    await db.collection('participantsproduct').doc(ppId).set({
      docid: ppId, profileid: pf, productref: productRef, status: null,
      // clear the fields the Initiate batch writes so the row is a clean uninitiated precondition
      arenaeventid: admin.firestore.FieldValue.delete(),
      eventref: admin.firestore.FieldValue.delete(),
      eventparticipationid: admin.firestore.FieldValue.delete(),
      deliverytype: admin.firestore.FieldValue.delete(),
      statusdate: admin.firestore.FieldValue.delete(),
      testrunid: RUN, _testdata: true,
    }, { merge: true });
  }
  // Delete any EPR the Initiate created for arenaevent2 (app-written, no testrunid → by arenaeventid).
  const eprs = await db.collection('event participation request').where('arenaeventid', '==', evtIds.arenaEvent2).get();
  for (const d of eprs.docs) await d.ref.delete();
}

/** Delete any `arenaspace` doc the create-arena-space test wrote (app writes with NO testrunid → clean
 *  by the run-unique summary the test types). EVT-13 re-runnability. */
export async function cleanArenaSpaceForSummary(summary: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('arenaspace').where('summary', '==', summary).get();
  for (const d of snap.docs) await d.ref.delete();
}

/** Reset the videoask submission tags to [] and clear p0's tag denorm + audit (EVT-14 re-runnability).
 *  participant tag logs / participant metadata are app-written; clean by the run-unique profileid. */
export async function resetVideoAskTags(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('participantvideoask').doc(evtIds.pvideoask0).set({ tags: [] }, { merge: true });
  await db.collection('participant metadata').doc(evtProfileIds.p0).set(
    { profileid: evtProfileIds.p0, profiletags: [], testrunid: RUN, _testdata: true }, { merge: true });
  const logs = await db.collection('participant tag logs').where('profileid', '==', evtProfileIds.p0).get();
  for (const d of logs.docs) await d.ref.delete();
}

/** Delete any `stage opportunity count` doc the EOD test wrote (app writes with NO testrunid → clean by
 *  the run-unique stagename). EVT-15 re-runnability. */
export async function cleanStageOpportunity(stagename: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('stage opportunity count').where('stagename', '==', stagename).get();
  for (const d of snap.docs) await d.ref.delete();
}
