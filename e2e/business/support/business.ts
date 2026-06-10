// business.ts — actors, login, and the per-test external/prod stub installer for the Business
// Dashboard & Misc suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (Zoom/FCM/
// Wati/email/OpenVidu), and the prod-endpoint firewall (e2e/_shared/prod-firewall). None of the
// business screens call an external HTTP CF on the test project (the expense-planner Watson webhook is
// dead code — environment.firebase.projectId matches neither starlabs-test nor fir-sample-aae4a, so
// watsonurl1 stays empty and the fetch is never issued; recon §External services), but we install the
// firewall anyway for defence-in-depth so a stray hardcoded prod URL can never fire.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.BIZ_RUNID || 'biz';
export const PASSWORD = 'Test!1234';

/** Seeded business actors (seed-business.js roster). */
export const bizActors = {
  admin: `admin+${RUN}@example.com`,                 // roles {admin} — primary actor for ALL screens
  participant0: `participant0+${RUN}@example.com`,    // owns the seeded HPC / touchpoint / quiz-response data
};

/** Seeded profileids (for asserting app-written entryby / lastupdatedby refs). */
export const bizProfileIds = {
  admin: `${RUN}_pf_admin`,
  participant0: `${RUN}_pf_p0`,
};

/** Seeded data ids the specs assert against (mirror seed-business.js ID map). */
export const bizIds = {
  event: `${RUN}_bizevt_0`,
  cohort0: `${RUN}_bizcoh_0`,
  cohort1: `${RUN}_bizcoh_1`,
  zone0: `${RUN}_bizzone_0`,
  zone1: `${RUN}_bizzone_1`,
  expensePast: `${RUN}_bizexp_past`,
  adsPast: `${RUN}_bizads_past`,
  quiz: `${RUN}_bizquiz_0`,
};

/** The seeded active quiz question (BM-14 reconciliation key). Mirrors seed-business.js QUESTION. */
export const bizQuizQuestion = `BIZ Which mode do you prefer? ${RUN}`;

/** The run-unique participant-touchpoint type (BM-15 filter key). Mirrors seed-business.js TP_TYPE. */
export const bizTouchpointType = `BIZ Touch ${RUN}`;

/** Install the prod firewall + all external stubs. Call in beforeEach BEFORE navigating. */
export async function installBizStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
}

/** Log in via the real Angular login form as the seeded super-role admin. */
export async function loginAsBizAdmin(page: Page): Promise<void> {
  await loginAs(page, bizActors.admin, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

/**
 * Reset the seeded baseline expense back to its UNDELETED precondition (so the soft-delete test is
 * order- and re-run-independent). PRECONDITION write only — the test asserts the value the APP writes
 * on the real delete click (delete:true + lastupdatedby = admin pid), never this reset value.
 */
export async function resetExpenseUndeleted(expenseId: string): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  await db.collection('expenseplanning').doc(expenseId).set(
    { delete: false, lastupdatedby: '__seed__', lastupdatedtime: admin.firestore.Timestamp.now() },
    { merge: true },
  );
}

/**
 * Delete any expenseplanning doc the APP created for "today" in a previous run of the expense-add test,
 * so the add dialog's dateExist() finds no collision and re-renders the description form. The add test
 * creates a doc with a known unique description name + lastupdatedby = admin pid; we sweep by that name.
 * PRECONDITION cleanup only (keeps the write test idempotent across re-runs).
 */
export async function clearAppCreatedExpensesByName(name: string): Promise<number> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('expenseplanning').where('lastupdatedby', '==', bizProfileIds.admin).get();
  let n = 0;
  for (const d of snap.docs) {
    const desc = (d.data() || {}).description || [];
    if (Array.isArray(desc) && desc.some((x) => x && x.name === name)) { await d.ref.delete().catch(() => {}); n++; }
  }
  return n;
}

/**
 * Delete any adsinvestment doc the APP created for "today" in a previous run of the ads-add test (by
 * entryby = admin pid), along with its logs subcollection, so the add dialog's dateExist() finds no
 * collision. PRECONDITION cleanup only.
 */
export async function clearAppCreatedAds(): Promise<number> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const snap = await db.collection('adsinvestment').where('entryby', '==', bizProfileIds.admin).get();
  let n = 0;
  for (const d of snap.docs) {
    const logs = await d.ref.collection('logs').get();
    for (const l of logs.docs) await l.ref.delete().catch(() => {});
    await d.ref.delete().catch(() => {});
    n++;
  }
  return n;
}
