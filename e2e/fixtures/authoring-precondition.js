// @ts-nocheck
/**
 * authoring-precondition.js — PRECONDITION seeder for the queue-creation-v3 authoring smoke
 * (e2e/queue/authoring.spec.ts).
 *
 * WHY this exists (and why it is NOT an oracle): the authoring stepper can only SAVE when the
 * whole step-0 "Queue Details" block is valid (`proceedToNextstage()` gate, queue-creation-v3
 * .component.ts:1168-1179) and the final submit guard `queueform.valid` (ts:846) passes. Two of
 * those required fields are populated from FIRESTORE, not typed:
 *   - Venue       — options come from `event location` docs (`venueList`, component ts:405;
 *                   option `[value]="list.location"`, html:101-103). The main seeders do NOT seed
 *                   `event location`, so without this the Venue select is EMPTY and step-0 can
 *                   never validate.
 *   - Queue Admin / Queue Mentor — options come from `users_roles` → `profile_data` (the staff
 *                   auth chain, `returnprofile()` over ts:480-491). We reuse the EXISTING
 *                   `seedAuthChain` + `makeStaff` from `seed-test-project.js` (never re-implemented
 *                   here) so the same operator the spec logs in with also appears as a profile
 *                   option.
 *
 * This module writes ONLY preconditions (staff auth chain + one `event location`). The spec then
 * drives the REAL authoring UI and asserts the doc the COMPONENT wrote — it never asserts a value
 * THIS seeder wrote (anti-circularity): the only value the test carries through is the queue NAME,
 * used purely as the read-back lookup key, not as an asserted field.
 *
 * Target: the dedicated test project `slabs-queue-e2e-exdcz` (or the emulator when
 * FIRESTORE_EMULATOR_HOST is set). The allowlist guard inside `seeder.initAdmin()` hard-aborts on
 * production / starlabs-test / Watson / SalesCRM. CommonJS to match the rest of `fixtures/*`.
 */
'use strict';

const seeder = require('./seed-test-project');

/** Deterministic venue location string for a run (the value that round-trips into queue.venue). */
function venueLocation(testrunid) {
  return `E2E Venue ${testrunid}`;
}

/**
 * Seed the authoring preconditions and return the handles the spec needs.
 *
 * @param {{testrunid?:string}} [opts]
 * @returns {Promise<{
 *   testrunid:string,
 *   operatorEmail:string,
 *   operatorProfileId:string,
 *   venueLocation:string,
 *   eventLocationDocId:string,
 * }>}
 */
async function seedAuthoringPreconditions(opts = {}) {
  const testrunid = opts.testrunid || process.env.TESTRUNID || 'run1';

  // Allowlist-guarded admin (hard-aborts on any non-test project). Lazy: only on actual seed.
  const admin = seeder.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();

  // The SAME staff roster actors.ts logs in with (operator admin = makeStaff().operators[0]).
  const { staff, operators } = seeder.makeStaff(testrunid);
  const operatorAdmin = operators.find((o) => o.role === 'admin');

  // 1. Staff auth chain (Auth user + user_data + profile_data + users_roles + dashboard routes).
  //    Idempotent (overwrites docs / skips existing users) — safe to call even if the big seed ran.
  await seeder.seedAuthChain(db, auth, testrunid, { staff, operators });

  // 2. ONE `event location` so the Venue select renders a real option. The component reads only
  //    `.location` off each doc; we add `docid` (app-wide self-id convention) + the run tag so a
  //    `--teardown <testrunid>` style cleanup keyed on testrunid can reclaim it.
  const eventLocationDocId = `${testrunid}_evloc_0`;
  await db.collection('event location').doc(eventLocationDocId).set({
    docid: eventLocationDocId,
    location: venueLocation(testrunid),
    testrunid,
    _testdata: true,
  });

  return {
    testrunid,
    operatorEmail: operatorAdmin.email,
    // The authoring select binds option value = profile_ref.id = the staff profileid (ts:485-488).
    operatorProfileId: operatorAdmin.profileid,
    venueLocation: venueLocation(testrunid),
    eventLocationDocId,
  };
}

/**
 * Delete the `queue generation` doc(s) this spec CREATED for a given queue name, plus the seeded
 * `event location`. Best-effort cleanup so reruns don't accumulate authoring queues. Keyed by the
 * unique per-run queue NAME the spec used, and by testrunid for the venue. Never touches anything
 * outside the test project (the handle is the same allowlist-guarded admin).
 *
 * @param {{testrunid?:string, queueName?:string}} [opts]
 */
async function teardownAuthoring(opts = {}) {
  const testrunid = opts.testrunid || process.env.TESTRUNID || 'run1';
  const admin = seeder.initAdmin();
  const db = admin.firestore();

  if (opts.queueName) {
    const snap = await db.collection('queue generation').where('queuename', '==', opts.queueName).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
  }
  // Remove this run's seeded venue (idempotent).
  await db.collection('event location').doc(`${testrunid}_evloc_0`).delete().catch(() => undefined);
}

module.exports = { seedAuthoringPreconditions, teardownAuthoring, venueLocation };
