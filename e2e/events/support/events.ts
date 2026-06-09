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
};

/** Seeded profileids (for asserting app-written refs / filtering rows by client name). */
export const evtProfileIds = {
  admin: `${RUN}_pf_admin`,
  p0: `${RUN}_pf_p0`,
  p1: `${RUN}_pf_p1`,
  p2: `${RUN}_pf_p2`,
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
