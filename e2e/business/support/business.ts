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
  participant1: `participant1+${RUN}@example.com`,    // 2nd zone-cohort member (COH2) → BM-08/09 conservation
};

/** Seeded profileids (for asserting app-written entryby / lastupdatedby refs). */
export const bizProfileIds = {
  admin: `${RUN}_pf_admin`,
  participant0: `${RUN}_pf_p0`,
  participant1: `${RUN}_pf_p1`,
};

/** Seeded data ids the specs assert against (mirror seed-business.js ID map). */
export const bizIds = {
  event: `${RUN}_bizevt_0`,
  cohort0: `${RUN}_bizcoh_0`,
  cohort1: `${RUN}_bizcoh_1`,
  zone0: `${RUN}_bizzone_0`,
  zone1: `${RUN}_bizzone_1`,
  zoneWrite: `${RUN}_bizzone_w`,   // BM-08 cohort-assign + BM-09 submit WRITE target
  expensePast: `${RUN}_bizexp_past`,
  adsPast: `${RUN}_bizads_past`,
  adsEdit: `${RUN}_bizads_edit`,   // BM-06 edit-appends-log target (seed = exactly 1 log)
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

/**
 * Restore the ads-edit baseline to EXACTLY ONE log (BM-06 precondition). Deletes every log on the edit
 * doc except the seeded `${adsEdit}_log0`, so the edit-appends-one-log conservation assertion (count
 * 1 → 2) is exact across re-runs. PRECONDITION reset only — the asserted +1 log is what the APP writes.
 */
export async function resetAdsEditSingleLog(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const editRef = db.collection('adsinvestment').doc(bizIds.adsEdit);
  const seedLogId = `${bizIds.adsEdit}_log0`;
  const logs = await editRef.collection('logs').get();
  for (const l of logs.docs) {
    if (l.id !== seedLogId) await l.ref.delete().catch(() => {});
  }
  // Restore the seeded baseline log + parent fields (in case a prior edit mutated campaigns/amount).
  await editRef.set({
    docid: bizIds.adsEdit, campaigns: 4, amount: 800, lastupdated: admin.firestore.Timestamp.now(),
  }, { merge: true });
  await editRef.collection('logs').doc(seedLogId).set({
    docid: seedLogId, editedby: '__seed__', updatedtime: admin.firestore.Timestamp.now(),
    campagins: 4, amount: 800, _testdata: true, testrunid: RUN,
  }, { merge: true });
}

/**
 * Reset the WRITE-target zone to NO cohorts AND delete every app-written `event participant zones` +
 * `event participant zones logs` doc for the seeded event, so BM-08 (assign) and BM-09 (submit) are
 * re-runnable from a clean baseline. App-written docs carry no testrunid → cleaned by natural key
 * (eventref / docid). PRECONDITION reset only — the asserted values are the ones the APP writes.
 */
export async function resetZoneWriteClean(): Promise<void> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // ZONE_W back to empty cohorts (the BM-07 read baseline zones are left untouched).
  await db.collection('event zones').doc(bizIds.zoneWrite).set({ cohorts: [] }, { merge: true });
  const evtRef = db.collection('event collection').doc(bizIds.event);
  for (const col of ['event participant zones', 'event participant zones logs']) {
    const snap = await db.collection(col).where('eventref', '==', evtRef).get();
    for (const d of snap.docs) await d.ref.delete().catch(() => {});
  }
}

/**
 * Independently re-derive the inflow-tab headline totals the EXPENSE-PLANNER computes for the CURRENT
 * month, by reading `participant metadata` (financedata != null) with the admin SDK and replicating the
 * component's own summation (loadInflows: thisMonthReceived = Σ financedata.receipt for the target month;
 * totalReceived = Σ all financedata.paymentmap values for the target month). This is the anti-circular
 * truth for BM-IN-*: the app renders these from its OWN Firestore stream; the test reconciles against an
 * INDEPENDENT read of the same collection (robust to however many financedata docs exist on the project).
 */
export async function computeInflowTotalsCurrentMonth(): Promise<{ received: number; paymentmapTotal: number }> {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const snap = await db.collection('participant metadata').where('financedata', '!=', null).get();
  let received = 0;
  let paymentmapTotal = 0;
  for (const d of snap.docs) {
    const fd = (d.data() || {}).financedata;
    if (!fd || !fd.date) continue;
    // mirror component convertToDate(): Firestore Timestamp → Date
    const ts = fd.date;
    const date = ts?.toDate ? ts.toDate() : (ts?._seconds ? new Date(ts._seconds * 1000) : (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts)));
    const financeDate = fd.paymentday;
    // The component adds receipt for EVERY financedata row (receivedAmount += receipt) regardless of month;
    // it accumulates paymentmap ONLY when the row's date is in the target month + paymentday is set.
    received += fd.receipt || 0;
    const inMonth = date.getFullYear() === year && date.getMonth() === month && ![null, undefined, ''].includes(financeDate);
    if (inMonth && fd.paymentmap) {
      for (const k of Object.keys(fd.paymentmap)) paymentmapTotal += fd.paymentmap[k];
    }
  }
  return { received, paymentmapTotal };
}
