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

/**
 * Reset an appointment + its linked deliverable back to the UNMARKED precondition (so the mark
 * tests are order- and re-run-independent). This is a PRECONDITION write only — the test asserts
 * the value the APP writes on the real mark action, never this reset value (anti-circularity).
 */
export async function resetAppointmentUnmarked(apptId: string, deliverableId?: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('appointments').doc(apptId).set(
    { attended: false, cancelled: false, cancelledon: null, cancelledreason: null }, { merge: true },
  );
  if (deliverableId) {
    await db.collection('deliverables').doc(deliverableId).set({ status: 'ongoing' }, { merge: true });
  }
}
