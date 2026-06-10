// profiles.ts — actors, login, and the per-test external/prod stub installer for the Participant
// Profiles & Analytics suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (FCM/Wati/
// email/Zoom/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall) so no profile
// screen can hit a real production Cloud Function (sendBatchEmail / sendWhatsAppBroadcast) or any
// prod HTTPS endpoint. The analytics screen also lazily initialises a secondary "watson" Firebase
// app (gRPC, NOT covered by the HTTP firewall) — we never drive a Watson-backed checklist, so the
// silent init failure is tolerated by the console guard (IGNORABLE includes the transport noise).
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.PROF_RUNID || 'prof';
export const PASSWORD = 'Test!1234';

/** Seeded profiles actors (seed-profiles.js roster). */
export const profActors = {
  admin: `admin+${RUN}@example.com`,            // roles {admin, ah, developer} — fullAccess super-role
  p0: `participant0+${RUN}@example.com`,
  p1: `participant1+${RUN}@example.com`,
  p2: `participant2+${RUN}@example.com`,
  p3: `participant3+${RUN}@example.com`,
};

/** Seeded profileids (doc ids in profile_data / participant metadata; the specs navigate to these). */
export const profProfileIds = {
  admin: `${RUN}_pf_admin`,
  p0: `${RUN}_pf_p0`,
  p1: `${RUN}_pf_p1`,
  p2: `${RUN}_pf_p2`,
  p3: `${RUN}_pf_p3`,
  cfProfile: `${RUN}_cfprofile`,
};

/** Seeded friendly display names (the UNIQUE text the specs filter table rows by). */
export const profNames = {
  p0: `Profile Test User Zero ${RUN}`,
  p1: `Profile Test User One ${RUN}`,
  p2: `Profile Test User Two ${RUN}`,
  p3: `Profile Test User Three ${RUN}`,
};

/** The uP! Life Report formid the form-tracker tab-2 query filters by. */
export const UP_LIFE_REPORT_FORMID = 'QundpMXgXlXiCJYZ7WU4';

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installProfileStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded super-role admin. */
export async function loginAsProfileAdmin(page: Page): Promise<void> {
  await loginAs(page, profActors.admin, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset a participant metadata doc's `customerstatus` back to a known PRECONDITION value (so the
 * customer-status-editor write test is order- and re-run-independent). PRECONDITION write only — the
 * test asserts the value the APP writes on the real Update Status click, never this reset value
 * (anti-circularity). Idempotent (admin set merge).
 */
export async function resetCustomerStatus(profileId: string, value = 'active'): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('participant metadata').doc(profileId).set({ customerstatus: value }, { merge: true });
}

/**
 * Reset the CF-only profile's `name` back to its ORIGINAL value so the metadata-sync CF test always
 * starts from a known baseline and the subsequent mutation is a real change (the CF only fires on a
 * field change — recon gotcha #8). PRECONDITION write only.
 */
export async function resetCfProfileName(profileId: string, originalName: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('profile_data').doc(profileId).set({ name: originalName }, { merge: true });
}

/** Set the CF-only profile's `name` to a NEW value via the admin SDK (the action the CF reacts to). */
export async function setCfProfileName(profileId: string, newName: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('profile_data').doc(profileId).set({ name: newName }, { merge: true });
}
