// wshop.ts — actors, login, and the per-test external/prod stub installer for the Workshops suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (Zoom/FCM/
// Wati/email/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no workshop
// screen can hit a real production Cloud Function (workshopprogressmessage / sendBatchEmail prod URLs)
// or open a real Zoom window. NOTE: on the test project getCloudFunctionUrl() returns '' for
// workshopprogressmessage (the project isn't in its URL map, workshop-dashboard.component.ts:481), so
// the comms HTTP path is inert here regardless — the firewall is belt-and-suspenders.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.WSHOP_RUNID || 'wshop';
export const PASSWORD = 'Test!1234';

/** Seeded product-page products (seed-workshops.js Product Page doc). The product-page screen renders
 *  one row per entry — the deep case asserts the app drew exactly these names from the doc it read. */
export const wsProductNames = [
  `WS Product Alpha ${RUN}`,
  `WS Product Bravo ${RUN}`,
];

/** Seeded workshop actors (seed-workshops.js roster). */
export const wsActors = {
  admin: `admin+${RUN}@example.com`,        // roles {admin, ah} — super-role (list/config/dashboard)
  mover: `mover+${RUN}@example.com`,        // profileid is the hardcoded move-next id (WS-12)
  participant0: `participant0+${RUN}@example.com`,
  participant1: `participant1+${RUN}@example.com`,
  participant2: `participant2+${RUN}@example.com`,
};

/** Seeded profileids (for asserting app-written refs / progress rows). */
export const wsProfileIds = {
  admin: `${RUN}_pf_admin`,
  mover: '3LVxKXuyxldYoRDEpx5s', // == seed-workshops MOVER_PID (hardcoded dashboard allow-list id)
  p0: `${RUN}_pf_p0`,
  p1: `${RUN}_pf_p1`,
  p2: `${RUN}_pf_p2`,
};

/** Seeded doc ids the specs assert against (mirror seed-workshops.js ID). */
export const wsIds = {
  W_INACTIVE: `${RUN}_W_inactive`,
  W_ACTIVE: `${RUN}_W_active`,
  W_DASH: `${RUN}_W_dash`,
  ENR_A: `${RUN}_enr_a`,
  ENR_B: `${RUN}_enr_b`,
  PW_A: `${RUN}_pw_a`,
  PW_B: `${RUN}_pw_b`,
};

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installWshopStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/**
 * Like installWshopStubs, but returns the live array of PRODUCTION endpoint URLs the firewall blocked.
 * Used by the comms-safety case (WS-09/WS-14): after driving the workshop comms path, the array must
 * stay empty for any *production* CF host (no real Wati/Postmark/sendBatchEmail escaped). The array is
 * mutated in place as requests are intercepted, so read it AFTER the action.
 */
export async function installWshopStubsCapturingProdBlocks(page: Page): Promise<string[]> {
  const blocked = await installProdFirewall(page);
  installAllExternalStubs(page);
  return blocked;
}

/** Log in via the real Angular login form as the seeded super-role admin. */
export async function loginAsWshopAdmin(page: Page): Promise<void> {
  await loginAs(page, wsActors.admin, PASSWORD);
}

/** Log in as the seeded "mover" admin (profileid in the hardcoded move-next allow-list). */
export async function loginAsWshopMover(page: Page): Promise<void> {
  await loginAs(page, wsActors.mover, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset the W_INACTIVE workshop back to the INACTIVE precondition (so the activate-toggle test WS-04 is
 * order- and re-run-independent). PRECONDITION write only — the test asserts the value the APP writes on
 * the real toggle, never this reset value (anti-circularity).
 */
export async function resetWorkshopInactive(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('workshopconfiguration').doc(wsIds.W_INACTIVE).set({ active: false }, { merge: true });
}

/**
 * Reset p0's participant-workshop challenges back to the 1-of-2-complete precondition (so the manual
 * move-next test WS-12 is re-run-stable). PRECONDITION write only.
 */
export async function resetParticipantWorkshopP0(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('participant workshop').doc(wsIds.PW_A).set({
    challenges: [
      {
        type: 'challenge', challengeid: `${RUN}_ch0`, heading: 'Module One',
        challenges: [
          { type: 'video', challengeid: `${RUN}_ch0_s0`, heading: 'Intro Video', status: 'completed' },
          { type: 'video', challengeid: `${RUN}_ch0_s1`, heading: 'Deep Dive', status: '' },
        ],
      },
    ],
  }, { merge: true });
}

/**
 * Reset the INACTIVE workshop's challenges to a KNOWN single-curriculum array (WS-06 asserts the app
 * grew the array by exactly 1 after adding a curriculum in the UI). Also clears triggerFunction so the
 * settings-toggle test WS-10 starts from false. PRECONDITION write only.
 */
export async function resetWorkshopConfigBaseline(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('workshopconfiguration').doc(wsIds.W_INACTIVE).set({
    triggerFunction: false,
    challenges: [
      {
        type: 'challenge', challengeid: `${RUN}_cfg_ch0`, heading: 'Config Module One', subheading: 'Baseline',
        challenges: [{ type: 'video', challengeid: `${RUN}_cfg_ch0_s0`, heading: 'Baseline Video', status: '' }],
      },
    ],
  }, { merge: true });
}

/**
 * Delete any enrollment docs the WS-08 enroll flow created for p2 on the dashboard workshop, so the test
 * is re-runnable (it asserts a +1 delta). App-written docs carry NO testrunid — we key them by their
 * natural key (workshopref==W_DASH AND profileid==p2). PRECONDITION reset only.
 */
export async function cleanEnrollmentForP2(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const dashRef = db.collection('workshopconfiguration').doc(wsIds.W_DASH);
  for (const col of ['workshop participant enrolled', 'participant workshop']) {
    const snap = await db.collection(col).where('workshopref', '==', dashRef).where('profileid', '==', wsProfileIds.p2).get();
    for (const d of snap.docs) await d.ref.delete();
  }
}

/**
 * Delete any duplicate workshopconfiguration docs the WS-13 duplicate flow created (a copy of the ACTIVE
 * workshop with active:false and the SAME title). App-written → NO testrunid; key by the duplicated
 * title + active:false. PRECONDITION reset only (the assertion reads the post-state count, not this).
 */
export async function cleanDuplicateWorkshops(title: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // The duplicate copies detailpage wholesale, so detailpage.title === the source title. We can't query
  // a nested field cheaply without an index, so scan the small active:false set and match in memory.
  const snap = await db.collection('workshopconfiguration').where('active', '==', false).get();
  for (const d of snap.docs) {
    const data = d.data() || {};
    const isDup = (data.detailpage && data.detailpage.title === title) && data.testrunid !== RUN;
    if (isDup) await d.ref.delete();
  }
}
