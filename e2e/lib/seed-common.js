// @ts-nocheck
/**
 * seed-common.js — shared seed primitives for the NON-queue concept-group e2e suites.
 *
 * Every group suite (appointments, events, content, modes, …) reuses the PROVEN queue-suite
 * foundation in fixtures/seed-test-project.js (allowlist-guarded admin init, the staff roster,
 * the staff/participant auth chain, the dashboard route-grant doc shape). This module adds the ONE
 * thing the queue seeder bakes in as a module-const (DRIVEN_ROUTES) but each new group needs to set
 * dynamically: dashboard route-config grants for that group's own routes — without which the data-
 * driven authGuard (auth.guard.ts:35) shows "No roles or profiles configured for screen: X" and
 * redirects every screen to root (the root cause of the OP-02/BIG failures).
 *
 * SAFETY: all writes go through fixtures/seed-test-project.initAdmin(), which hard-aborts unless the
 * resolved project is the dedicated disposable test project (lib/test-project allowlist). ATC is never
 * seeded. Every doc is tagged `{testrunid, _testdata:true}` for clean teardown.
 */
'use strict';

const seed = require('../fixtures/seed-test-project');

/** `{testrunid, _testdata:true}` — same tag the queue seeder uses (teardown keys off testrunid). */
const TAG = seed.TAG;

/**
 * Write a `dashboard` route-config doc per route so the authGuard admits the seeded staff (and,
 * for routes flagged `participant:true`, the seeded participants). Mirrors seed-test-project.js
 * seedAuthChain's dashboard loop (:417-424) exactly — same field shape the guard reads.
 *
 * @param {object} db admin.firestore()
 * @param {string} testrunid
 * @param {Array<{route:string,label:string,participant?:boolean,roles?:string[]}>} routes
 * @param {{staffProfileIds:string[], allRoles:string[], participantProfileIds?:string[]}} grants
 */
async function seedDashboardRoutes(db, testrunid, routes, grants) {
  const { staffProfileIds, allRoles, participantProfileIds = [] } = grants;
  for (const r of routes) {
    const roles = r.roles
      ? [...new Set([...allRoles, ...r.roles])]
      : (r.participant ? [...new Set([...allRoles, 'participant'])] : allRoles);
    const profileid = r.participant ? [...staffProfileIds, ...participantProfileIds] : staffProfileIds;
    await db.collection('dashboard').doc(`${testrunid}_dash_${r.route.replace(/\W+/g, '_')}`).set({
      route: r.route, label: r.label || r.route, roles, profileid,
      showInSidenav: true, order: 0, children: [], ...TAG(testrunid),
    });
  }
}

/**
 * Bootstrap a group run: allowlist-guarded admin, the shared staff roster, the staff/participant
 * auth chain (so the actors.ts emails log in), and dashboard grants for THIS group's routes.
 * Idempotent. Returns the admin handles + roster for the group seeder to add its data docs.
 *
 * @param {string} testrunid
 * @param {{routes:Array, participants?:object[]}} opts  routes = this group's driven routes;
 *        participants = extra participant roster entries that also need an auth chain + landing grants.
 * @returns {Promise<{admin,db,auth,staff,operators,specialists,bigProviders,participants}>}
 */
async function bootstrapGroup(testrunid, opts = {}) {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  const auth = admin.auth();
  const { operators, specialists, bigProviders, staff } = seed.makeStaff(testrunid);
  const participants = opts.participants || [];

  // Reuse the proven auth chain (creates Auth users + user_data/profile_data/users_roles + the queue
  // DRIVEN_ROUTES grants — harmless extra grants; some groups link back to queue screens).
  await seed.seedAuthChain(db, auth, testrunid, { staff, operators, participants });

  // Grant THIS group's own routes.
  if (opts.routes && opts.routes.length) {
    const staffProfileIds = staff.map((s) => s.profileid);
    const allRoles = [...new Set(staff.flatMap((s) => s.roles || ['admin']))];
    const participantProfileIds = participants.map((p) => p.profileid).filter(Boolean);
    await seedDashboardRoutes(db, testrunid, opts.routes, { staffProfileIds, allRoles, participantProfileIds });
  }

  return { admin, db, auth, staff, operators, specialists, bigProviders, participants };
}

/**
 * Delete every doc tagged with this run in the given collections (batched). Reuses the queue
 * seeder's teardownCollections so the spaced-collection + named-DB handling stays in one place.
 * @param {string} testrunid
 * @param {string[]} collections default-DB collection names to sweep for this run.
 */
async function teardownGroup(testrunid, collections) {
  const admin = seed.initAdmin();
  const db = admin.firestore();
  // seed-test-project signature is teardownCollections(database, cols, testrunid).
  await seed.teardownCollections(db, collections, testrunid);
}

module.exports = { TAG, seedDashboardRoutes, bootstrapGroup, teardownGroup, seed };
