// appt.ts — actors, login, and the per-test external/prod stub installer for the Appointments suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (Zoom/FCM/
// Wati/email/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no appointment
// screen can hit a real production Cloud Function (sendBatchEmail / appointmentLinkRegenarate /
// approveOfftime prod URLs) or open a real Zoom/OpenVidu window.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.APPT_RUNID || 'appt';
export const PASSWORD = 'Test!1234';

/** Seeded appointment actors (seed-appointments.js roster). */
export const apptActors = {
  admin: `admin+${RUN}@example.com`,        // roles {admin, ah} — super-role (sees all)
  scheduler: `scheduler+${RUN}@example.com`,
  eis0: `eis0+${RUN}@example.com`,
  eis1: `eis1+${RUN}@example.com`,
  participant0: `participant0+${RUN}@example.com`,
};

/** Seeded profileids (for asserting app-written authorizedby / refs). */
export const apptProfileIds = {
  admin: `${RUN}_pf_admin`,
  scheduler: `${RUN}_pf_scheduler`,
  eis0: `${RUN}_pf_eis0`,
  eis1: `${RUN}_pf_eis1`,
  participant0: `${RUN}_pf_p0`,
  participant1: `${RUN}_pf_p1`, // the BOOKING subject (no customer_eismapping → resolves via Roles-To-EIS)
};

/** Run-prefixed doc ids the deep specs assert against (mirror seed-appointments.js ID). */
export const apptDocIds = {
  AT1: `${RUN}_AT1`,
  AT2R: `${RUN}_AT2R`,
  AVBOOK: `${RUN}_AVBOOK`,
  DB: `${RUN}_DB`,
  PP2: `${RUN}_PP2`,
  APSTUDIO: `${RUN}_APSTUDIO`,
};

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installApptStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded super-role admin. */
export async function loginAsApptAdmin(page: Page): Promise<void> {
  await loginAs(page, apptActors.admin, PASSWORD);
}

/** Log in as a seeded EIS specialist (0 or 1). */
export async function loginAsEis(page: Page, i = 0): Promise<void> {
  await loginAs(page, i === 0 ? apptActors.eis0 : apptActors.eis1, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

// Re-runnable booking precondition reset (delegates to the seeder so the shape stays in one place).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const apptSeed = require('../seed-appointments');

/**
 * Reset an appointment + its linked deliverable to the UNMARKED precondition. FULLY RECONSTRUCTS the
 * appointment doc (not a merge) — the deep booking-flow spec runs first and DELETES appointments by
 * `bookedby == p1` (nuking the seeded AP2), so a merge-set couldn't restore the missing bookedby/hostRole/
 * appointment fields the status-pending screen reads. PRECONDITION write only (anti-circularity).
 */
export async function resetAppointmentUnmarked(apptId: string, deliverableId?: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const ID = apptSeed.ID; const PF = apptSeed.PF;
  const profileRef = (pf: string) => db.collection('profile_data').doc(pf);
  const apptTypeRef = (id: string) => db.collection('appointmenttype').doc(id);
  const roleRef = (id: string) => db.collection('eisroles').doc(id);
  const hoursAgo = (h: number) => admin.firestore.Timestamp.fromMillis(Date.now() - h * 3600e3);
  // AP1 is booked by p0 (→ APPT-05 attend); AP2 by p1 (→ APPT-06 cancel). Mirror seed mkAppt().
  const bookedPf = apptId === ID.AP2 ? PF.p1 : PF.p0;
  await db.collection('appointments').doc(apptId).set({
    docid: apptId,
    appointment: apptTypeRef(ID.AT1),
    appointmentrole: [roleRef(ID.R1)],
    hostRole: { [roleRef(ID.R1).path]: [profileRef(PF.eis0)] },
    hosts: [profileRef(PF.eis0)],
    bookedby: profileRef(bookedPf),
    starttime: hoursAgo(2), endtime: hoursAgo(1),
    cancelled: false, attended: false, cancelledon: null, cancelledreason: null,
    journeycoach: false, onboarding: false,
    // created/productid/slotdata keep the roster stream (APPT-07) from throwing on this reconstructed doc.
    productid: ID.P1, created: admin.firestore.Timestamp.now(), slotdata: [{ id: ID.AV1, index: 0 }],
    testrunid: apptSeed.TESTRUNID, _testdata: true,
  });
  if (deliverableId) {
    await db.collection('deliverables').doc(deliverableId).set({
      docid: deliverableId, profileid: PF.p0, type: 'appointment', status: 'ongoing',
      deliveryref: apptTypeRef(ID.AT1), fileref: [db.collection('appointments').doc(apptId)],
      testrunid: apptSeed.TESTRUNID, _testdata: true,
    });
  }
}

/** Restore the p1 booking subject + its free +2d slot, and delete any appointment a prior booking run
 *  created. Lets APPT-02/03 run idempotently. PRECONDITION only (anti-circular). */
export async function resetBookingSubject(): Promise<void> {
  await apptSeed.resetBookingSubject();
}
