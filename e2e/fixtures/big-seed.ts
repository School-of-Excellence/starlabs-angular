// @ts-nocheck
/**
 * big-seed.ts — BIG-surface preconditions for the analytics/cohorts spec (BIG-07 … BIG-11).
 *
 * WHY THIS EXISTS (and why it is NOT in seed-test-project.js): the main seeder
 * (fixtures/seed-test-project.js) stands up the QUEUE world (queue generation, queue_token,
 * studio pairings, the staff auth chain + a subset of `dashboard` route grants). It seeds NO
 * BIG-domain documents — there is no `big marathon`, `big cohorts`, `big assignment`,
 * `big participants assignments`, `big aggregate event level`, `biglevel`, or `atcmodel level
 * config` anywhere, and the seeded staff carry roles `['admin','eventcoordinator']`, NOT the
 * `mentor` flag the Validate screen's in-component gate requires (recon big.md §4b,
 * validate-…ts:185-192). The BIG analytics/cohorts screens therefore cannot mount with data
 * against the bare queue seed. This module adds exactly those BIG preconditions, idempotently,
 * tagged with the run's `testrunid` for teardown.
 *
 * ANTI-CIRCULARITY: this writes PRECONDITIONS ONLY (the brief's rule). Every value here is a
 * KNOWN-SEEDED number the spec asserts the APP recomputed (a kanban column count the board
 * re-rendered, a cohort card count the component rendered from its own read, the analytics
 * `filteredData.length`, the `big cohorts log` row the app wrote on a move). The spec NEVER reads
 * back a value this module wrote without the PRODUCT having recomputed/rewritten it first.
 *
 * SAFETY: all writes go through the SAME allowlist-pinned Admin handle the rest of the harness
 * uses (firestore-admin.db() → participant-sim.db() → test-project.assertWritable), so production /
 * starlabs-test / Watson / Sales-CRM can never be touched. CommonJS-friendly (no top-level await).
 *
 * SOURCES (read before editing the shapes):
 *   - recon e2e/queue/recon/big.md §0 (route map), §1 (selectors), §3d/§3e (write shapes),
 *     §4a/§4b (auth gates), §BIG-07/08/09/10/11.
 *   - validate-participants-assignment.component.ts: loadMarathons (`big marathon` orderBy title),
 *     loadAllCohorts (`big cohorts` orderBy name, filtered by marathonref.id), onMarathonChange
 *     (`big assignment` where marathonref==ref), onAssignmentChange (`big participants assignments`
 *     where assignmentref==ref → kanban grouped by `status`), getStatusCount (column count),
 *     ngOnInit `roles['mentor']` gate.
 *   - big-cohort-clone-2.component.ts: cohort load (`big cohorts`) + marathon load (`big marathon`
 *     orderBy startdate; auto-selects the LAST), onFilter (cohort shown when
 *     selectedMarathon == marathonref.id), getCohortParticipantCount (participantidlist.length),
 *     moveParticipantToCohort + createMoveLog (`big cohorts log` status:'moved'), mapProfile =
 *     authguard.getProfileMap().map (profile_data docid → name).
 *   - big-aggregate-event-level.component.ts: streams `big aggregate event level` orderBy atcmodel
 *     → dataSource.filteredData.length (ael-total-count), unfiltered by default.
 *   - big-level / atcmodel-level-config: stream `biglevel` / `atcmodel level config` → table rows.
 *   - monitor-activity-log.component.ts: needs `?queueid=<queueGenDocId>`; streams `queue_token`
 *     where queueref in [...] → filteredTokenData.length ("Participants").
 *   - zoom-meeting.component.ts: reads `big assignment/{assignmentid}`; only calls startmeeting()
 *     when that doc has `zoomdata` (graceful no-op otherwise).
 */

// firestore-admin is the READ-ONLY layer over the allowlist-pinned Admin handle; we reuse its db()
// for WRITES here (it is the same firebase-admin Firestore the simulator uses).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('../queue/support/firestore-admin');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminSdk = require('firebase-admin');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TEST_PROJECT_ID, assertWritable } = require('../lib/test-project');

const TESTRUNID = process.env.TESTRUNID || 'run1';
const QUEUE_ID = process.env.QUEUE_ID || 'L3rqCrqDBsshd7HM5YRn';
const PASSWORD = 'Test!1234';

/** Tag every doc for teardown (mirrors seed-test-project.js TAG). */
const TAG = (testrunid: string) => ({ testrunid, _testdata: true });

/** The Admin Auth handle (same app db() initialised; allowlist-guarded). */
function auth() {
  assertWritable(process.env.TEST_PROJECT || TEST_PROJECT_ID);
  return adminSdk.auth();
}
function T() {
  return adminSdk.firestore.Timestamp;
}

export interface BigSeedOptions {
  /** Run id namespacing every doc + Auth user (default env TESTRUNID or 'run1'). */
  testrunid?: string;
  /** Number of participant-assignment cards to seed in the kanban's `initiated` column (BIG-07). */
  initiatedCount?: number;
  /** Number of participants to place in the source cohort (BIG-08). */
  cohortSourceCount?: number;
  /** How many `big aggregate event level` rows to seed (BIG-10 analytics lower bound). */
  aelCount?: number;
  /** How many `biglevel` + `atcmodel level config` rows to seed (BIG-09 config tables). */
  configRows?: number;
}

export interface SeededBigParticipant {
  /** profile_data doc id (== the id stored in cohort.participantidlist and assignment.profileid). */
  profileid: string;
  /** the name the screens render (mapProfile[profileid] / mapProfile[p.profileid].name). */
  name: string;
}

export interface BigSeedResult {
  testrunid: string;
  /** The mentor-flagged actor's login email (passes the Validate `roles['mentor']` gate). */
  mentorEmail: string;
  /** `big marathon` doc id (auto-selected by both screens). */
  marathonId: string;
  marathonTitle: string;
  /** Source `big cohorts` doc id + title (BIG-08 move-from / BIG-07 cohort of the cards). */
  sourceCohortId: string;
  sourceCohortName: string;
  /** Target `big cohorts` doc id + title (BIG-08 move-to). */
  targetCohortId: string;
  targetCohortName: string;
  /** `big assignment` doc id (the assignment whose participant-assignments fill the kanban). */
  assignmentId: string;
  assignmentTitle: string;
  /** The participant-assignment docs seeded into the kanban (BIG-07), all status 'initiated'. */
  participantAssignments: { docid: string; profileid: string; name: string }[];
  /** Participants placed in the SOURCE cohort (BIG-08), by profile_data id + rendered name. */
  cohortParticipants: SeededBigParticipant[];
  /** The seeded `big aggregate event level` row count (BIG-10 analytics lower bound). */
  aelCount: number;
  /** The seeded config-table row counts (BIG-09). */
  bigLevelCount: number;
  modelConfigCount: number;
  /** The queue generation doc id the monitor must be opened with (`?queueid=`). */
  queueGenDocId: string;
  /** A seeded `queue_token` on that queue with stagestatus 'Approved' (the monitor's ≥1 floor). */
  monitorTokenId: string;
  /** A `big assignment` id WITH no zoomdata (BIG-11 graceful missing-zoomdata case). */
  zoomAssignmentId: string;
  /** A participant profileid for the zoom screen query params. */
  zoomProfileId: string;
}

/**
 * Seed the BIG preconditions for the analytics/cohorts spec and return the handles the spec needs.
 * Idempotent (deterministic doc ids; overwrites on re-run). Writes a self-contained BIG world:
 * one marathon, two cohorts, one assignment, N participant-assignments (kanban), config-table rows,
 * AEL analytics rows, a mentor-flagged login, and the `dashboard` route grants the authGuard needs.
 */
export async function seedBigWorld(opts: BigSeedOptions = {}): Promise<BigSeedResult> {
  const testrunid = opts.testrunid || TESTRUNID;
  const initiatedCount = Math.max(1, opts.initiatedCount ?? 3);
  const cohortSourceCount = Math.max(1, opts.cohortSourceCount ?? 3);
  const aelCount = Math.max(1, opts.aelCount ?? 3);
  const configRows = Math.max(1, opts.configRows ?? 2);

  const d = db();
  const Ts = T();
  const now = () => Ts.now();
  const tag = TAG(testrunid);

  // -- ids (deterministic, run-namespaced) --------------------------------------------------------
  const marathonId = `${testrunid}_bigm_0`;
  const marathonTitle = `TEST Marathon ${testrunid}`;
  const sourceCohortId = `${testrunid}_bigc_src`;
  const sourceCohortName = `TEST Cohort Source ${testrunid}`;
  const targetCohortId = `${testrunid}_bigc_tgt`;
  const targetCohortName = `TEST Cohort Target ${testrunid}`;
  const assignmentId = `${testrunid}_biga_0`;
  const assignmentTitle = `TEST Assignment ${testrunid}`;
  const zoomAssignmentId = `${testrunid}_biga_zoom`;
  const queueGenDocId = `${testrunid}_${QUEUE_ID}`;

  // Refs the BIG screens compare against (validate filters `big assignment` by marathonref==ref;
  // cohorts show when selectedMarathon == marathonref.id; participant-assignments by assignmentref).
  const marathonRef = d.collection('big marathon').doc(marathonId);
  const sourceCohortRef = d.collection('big cohorts').doc(sourceCohortId);
  const targetCohortRef = d.collection('big cohorts').doc(targetCohortId);
  const assignmentRef = d.collection('big assignment').doc(assignmentId);

  // -- 1. mentor-flagged login (passes Validate `roles['mentor']` gate, big.md §4b) ---------------
  // Full auth chain: Auth user → user_data/{uid} ; profile_data.user_ref → user_data ;
  // profile_data.role_ref → users_roles/{id} with mentor:true. getRoles()/username() resolve the
  // profile by `where user_ref == user_data/{uid}` (authguard.service.ts:311/356), so the chain
  // must point both ways. This actor is ALSO admin so the queue-side routes still admit it.
  const mentorUid = `${testrunid}_bigmentor_0`;
  const mentorProfileId = `${testrunid}_pf_bigmentor_0`;
  const mentorEmail = `bigmentor+${testrunid}@example.com`;
  const mentorRoleId = `${testrunid}_role_${mentorUid}`;
  await auth()
    .createUser({ uid: mentorUid, email: mentorEmail, password: PASSWORD, displayName: mentorEmail })
    .catch(async (e: any) => {
      if (e.code === 'auth/uid-already-exists' || e.code === 'auth/email-already-exists') return;
      throw e;
    });
  await auth().setCustomUserClaims(mentorUid, { testrunid, role: 'mentor' });
  const mentorUserDataRef = d.collection('user_data').doc(mentorUid);
  const mentorProfileRef = d.collection('profile_data').doc(mentorProfileId);
  const mentorRoleRef = d.collection('users_roles').doc(mentorRoleId);
  await mentorUserDataRef.set({ name: mentorEmail, email: mentorEmail, number: '9999900000', ...tag });
  await mentorRoleRef.set({
    id: mentorRoleId, name: mentorEmail, participant: false, profile_ref: mentorProfileRef,
    mentor: true, admin: true, eventcoordinator: true, ...tag,
  });
  await mentorProfileRef.set({
    docid: mentorProfileId, profileid: mentorProfileId, email: mentorEmail.toLowerCase(), name: mentorEmail,
    number: '9999900000', countrycode: '+91', user_ref: mentorUserDataRef, role_ref: mentorRoleRef, ...tag,
  });

  // -- 2. dashboard route grants for every BIG route this spec drives -----------------------------
  // The authGuard denies (ConfirmComponent dialog, no mount) when routeConfig() returns empty for a
  // route's cleanUrl (auth.guard.ts:44-78). seed-test-project.js grants only /bigcohorts (+ queue
  // routes) — the analytics/validate/zoom routes are NOT granted, so we grant them here, to BOTH the
  // mentor's roles and its profileid (either path satisfies hasAccess). cleanUrl = first path segment.
  const BIG_ROUTES = [
    { route: '/validateParticipantAssignments', label: 'Validate Participant Assignments' },
    { route: '/bigcohorts', label: 'BIG Cohorts' },
    { route: '/biglevel', label: 'BIG Level' },
    { route: '/modellevelconfig', label: 'ATC Model Level Config' },
    { route: '/big_aggregate', label: 'BIG Aggregate' },
    { route: '/bigaggregateeventlevel', label: 'BIG Aggregate Event Level' },
    { route: '/bigactivitymonitor', label: 'BIG Activity Monitor' },
    { route: '/bigactivitylog', label: 'BIG Activity Log' },
    { route: '/zoommeeting_bigparticipants', label: 'Zoom Meeting (BIG)' },
  ];
  const grantRoles = ['admin', 'eventcoordinator', 'mentor'];
  for (const r of BIG_ROUTES) {
    await d.collection('dashboard').doc(`${testrunid}_dash_${r.route.replace(/\W+/g, '_')}`).set({
      route: r.route, label: r.label, roles: grantRoles, profileid: [mentorProfileId],
      showInSidenav: true, order: 0, children: [], ...tag,
    });
  }

  // -- 3. marathon (auto-selected by both screens) ------------------------------------------------
  // Validate orders `big marathon` by title; Cohorts orders by startdate asc and auto-selects the
  // LAST. Give a far-future startdate so this run's marathon is the auto-selected one on Cohorts.
  await marathonRef.set({
    docid: marathonId, title: marathonTitle, name: marathonTitle, color: '#374151',
    startdate: Ts.fromMillis(Date.now() + 365 * 86400e3), // far future → last by startdate asc
    enddate: Ts.fromMillis(Date.now() + 400 * 86400e3),
    ...tag,
  });

  // -- 3b. event collection (BIG-08): ONE accelerator event tied to THIS marathon ----------------
  // big-cohort-clone-2 sets loading=false ONLY via getAssignmentData() ← onFilterAcceleratorEvent ←
  // toRunFilterFunctions, which is gated on acceleratorEventList.length != 0 (ts:1735). acceleratorEventList
  // is built from `event collection` filtered by bigmarathonref != undefined (ts:362-368). With NO event doc
  // loading stays true forever and the '.brand' mount anchor (behind *ngIf="!loading") never renders →
  // BigCohortsPage.open() times out. onFilterAcceleratorEvent (ts:1786) then matches
  // e['bigmarathonref'].id === selectedMarathon, so bigmarathonref.id MUST equal the auto-selected
  // marathon docid (== marathonId). Dates are optional (the component null-handles their absence).
  const eventId = `${testrunid}_bigevt_0`;
  await d.collection('event collection').doc(eventId).set({
    docid: eventId, name: `TEST Event ${testrunid}`, bigmarathonref: marathonRef,
    startdate: Ts.fromMillis(Date.now() + 365 * 86400e3),
    enddate: Ts.fromMillis(Date.now() + 400 * 86400e3),
    ...tag,
  });

  // -- 4. participants (profile_data) the screens render by name ----------------------------------
  // Cohorts mapProfile[id] = profile_data.name (docid → name); Validate participant-name =
  // mapProfile[p.profileid].name. Seed ONE pool used by both cohorts and the kanban cards.
  const poolCount = Math.max(initiatedCount, cohortSourceCount) + 1;
  const pool: SeededBigParticipant[] = [];
  for (let i = 0; i < poolCount; i++) {
    const profileid = `${testrunid}_bigp_${i}`;
    const name = `BIG Participant ${testrunid}-${i}`;
    await d.collection('profile_data').doc(profileid).set({
      docid: profileid, profileid, email: `bigp_${i}+${testrunid}@example.com`.toLowerCase(), name,
      number: '9999900000', countrycode: '+91', ...tag,
    });
    pool.push({ profileid, name });
  }

  // -- 5. cohorts (BIG-07 cards live in the source cohort; BIG-08 moves between the two) ----------
  // participantidlist = profile_data DOC IDS (mapProfile keys). Both cohorts reference THIS marathon
  // (so Cohorts' onFilter shows them) and carry the default filter-surviving fields (status active,
  // cohortCategory studio, cohortType general).
  const cohortCommon = {
    marathonref: marathonRef, eventref: null, status: 'active',
    cohortCategory: 'studio', cohortType: 'general', level: 'level1', contentview: 'participants',
    ...tag,
  };
  const sourceParticipants = pool.slice(0, cohortSourceCount);
  await sourceCohortRef.set({
    docid: sourceCohortId, name: sourceCohortName,
    participantidlist: sourceParticipants.map((p) => p.profileid), ...cohortCommon,
  });
  // Target starts EMPTY so a BIG-08 move makes its rendered count go 0 → 1 (app-recomputed).
  await targetCohortRef.set({
    docid: targetCohortId, name: targetCohortName, participantidlist: [], ...cohortCommon,
  });

  // -- 6. assignment + participant-assignments (BIG-07 kanban) ------------------------------------
  // Validate: `big assignment` where marathonref==ref → list item; selecting it streams
  // `big participants assignments` where assignmentref==ref → cards grouped by `status`. Seed all
  // in the 'initiated' column so a single move to 'completed'/'rework' shifts the rendered counts.
  await assignmentRef.set({
    docid: assignmentId, title: assignmentTitle, assignmenttype: 'Form',
    marathonref: marathonRef, cohortsref: sourceCohortRef, status: 'ongoing', ...tag,
  });
  const participantAssignments: { docid: string; profileid: string; name: string }[] = [];
  for (let i = 0; i < initiatedCount; i++) {
    const p = pool[i];
    const docid = `${testrunid}_bigpa_${i}`;
    await d.collection('big participants assignments').doc(docid).set({
      docid, profileid: p.profileid, assignmentref: assignmentRef, cohortsref: sourceCohortRef,
      marathonref: marathonRef, status: 'initiated', assignmenttype: 'Form', ...tag,
    });
    participantAssignments.push({ docid, profileid: p.profileid, name: p.name });
  }

  // -- 7. config tables (BIG-09): biglevel + atcmodel level config -------------------------------
  // biglevel: ['position','level','category'] columns; sorted by `sequence`. atcmodel level config:
  // streamed straight into the table. Seed `configRows` rows each (a KNOWN row count).
  let bigLevelCount = 0;
  for (let i = 0; i < configRows; i++) {
    const docid = `${testrunid}_biglevel_${i}`;
    await d.collection('biglevel').doc(docid).set({
      docid, level: `L${i + 1}`, category: 'TEST', position: i + 1, sequence: i + 1, ...tag,
    });
    bigLevelCount++;
  }
  let modelConfigCount = 0;
  for (let i = 0; i < configRows; i++) {
    const docid = `${testrunid}_mlc_${i}`;
    await d.collection('atcmodel level config').doc(docid).set({
      docid, atcmodel: `MODEL_${testrunid}`, level: `L${i + 1}`,
      // metrics/validation/stabilization MUST be ARRAYS: the template *ngFor's each of them
      // (atcmodel-level-config.component.html:36/45/54) — iterating an OBJECT throws RuntimeError
      // NG02200 ("NgFor only supports binding to Iterables"), which aborts row rendering (BIG-09b).
      // Empty arrays render no <li> and no crash. level/primaryactivity stay strings (row['level'].id
      // on a string is undefined → renders blank, not a crash).
      primaryactivity: 'TEST', metrics: [], validation: [], stabilization: [], ...tag,
    });
    modelConfigCount++;
  }

  // -- 8. AEL analytics rows (BIG-10): big aggregate event level ----------------------------------
  // Streamed orderBy('atcmodel') → dataSource.data; ael-total-count = filteredData.length
  // (unfiltered by default). `atcmodel` must be present (the orderBy key) + `profileid`.
  //
  // `regular` MUST be a NON-EMPTY ARRAY of {activity:<ref|obj-with-id>, completed, metric}:
  //   - the component builds mapActivityPerParticipant[profileid][atcmodel][queueid] ONLY by iterating
  //     non-empty regular/specialactivity/boosteractivity/warmup arrays (big-aggregate-event-level.ts:
  //     229-262); with regular:{} that map stays EMPTY and the participant column (html:92) does
  //     mapActivityPerParticipant[profileid][atcmodel][queueid] → "Cannot read properties of undefined
  //     (reading 'MODEL_run1')" — the per-row fatal that aborts the mount (BIG-10a loadsWithoutFatal).
  //   - the `regular` column template also *ngFor's row['regular'] (html:119) and reads list['activity'].id
  //     (html:120) — an OBJECT throws NG02200, and a missing `activity` throws on `.id`. So each element
  //     carries an `activity` DocumentReference (a bigactivity doc, seeded just below, so mapBigActivity
  //     resolves its name) plus a `completed` count the map sums.
  const bigActivityId = `${testrunid}_bigact_0`;
  await d.collection('bigactivity').doc(bigActivityId).set({
    docid: bigActivityId, activity: `TEST Activity ${testrunid}`, ...tag,
  });
  const bigActivityRef = d.collection('bigactivity').doc(bigActivityId);
  for (let i = 0; i < aelCount; i++) {
    const docid = `${testrunid}_ael_${i}`;
    await d.collection('big aggregate event level').doc(docid).set({
      docid, id: docid, atcmodel: `MODEL_${testrunid}`, profileid: pool[i % pool.length].profileid,
      level: `L${(i % configRows) + 1}`, queueid: queueGenDocId,
      regular: [{ activity: bigActivityRef, completed: 0, metric: 1 }], lastupdated: now(), ...tag,
    });
  }

  // -- 8b. monitor token (BIG-10b): a `queue_token` on the seeded queue the monitor will display --
  // The monitor streams `queue_token` where queueref ∈ [queue] and KEEPS only
  // stagestatus==='Approved' && tokenstatus==='Active' (monitor ts:174-175). The main seeder's tokens
  // are stagestatus 'Yet to Start' (filtered out), and which tokens a run has advanced is non-
  // deterministic — so seed ONE token that already satisfies the monitor's filter, giving BIG-10b a
  // KNOWN ≥1 floor. The spec computes the EXACT expected count from Firestore with the SAME filter.
  const monitorTokenId = `${testrunid}_bigtok_monitor`;
  await d.collection('queue_token').doc(monitorTokenId).set({
    docid: monitorTokenId, profile_id: pool[0].profileid, profile_name: pool[0].name,
    queueref: d.collection('queue generation').doc(queueGenDocId),
    variationid: `${testrunid}_bigvar_monitor`,
    currentstage: 'Diagnostics', previousstage: 'Diagnostics',
    status: 'queued', stagestatus: 'Approved', tokenstatus: 'Active',
    tokennumber: 9001, delete: false, queueposition: 9001, people_involved: [],
    liveassignmentid: null, manuallymoved: false, createdon: now(), logdate: now(), updatedAt: now(),
    ...tag,
  });

  // -- 9. zoom assignment (BIG-11): a `big assignment` WITHOUT zoomdata --------------------------
  // zoom-meeting reads `big assignment/{assignmentid}` and only drives the Zoom SDK when the doc has
  // `zoomdata`. Seed it WITHOUT zoomdata so the screen mounts gracefully (the "missing-zoomdata
  // graceful" half of the BIG-11 invariant) without attempting a real (un-stubbable) SDK join.
  await d.collection('big assignment').doc(zoomAssignmentId).set({
    docid: zoomAssignmentId, title: `TEST Zoom Assignment ${testrunid}`, assignmenttype: 'Zoom Call',
    marathonref: marathonRef, cohortsref: sourceCohortRef, status: 'upcoming', ...tag,
  });

  return {
    testrunid,
    mentorEmail,
    marathonId, marathonTitle,
    sourceCohortId, sourceCohortName,
    targetCohortId, targetCohortName,
    assignmentId, assignmentTitle,
    participantAssignments,
    cohortParticipants: sourceParticipants,
    aelCount,
    bigLevelCount, modelConfigCount,
    queueGenDocId,
    monitorTokenId,
    zoomAssignmentId,
    zoomProfileId: pool[0].profileid,
  };
}

/**
 * Reset the MUTATING preconditions to their seeded baseline so the kanban / cohort tests are
 * idempotent across retries (a Playwright retry does NOT re-run beforeAll). This is a PRECONDITION
 * write (the brief allows the simulator/seed to "set up preconditions"); the spec still asserts the
 * value the PRODUCT recomputes after a REAL move — never a read-back of this reset value.
 *
 * Restores: every seeded `big participants assignments` row → status 'initiated'; the source cohort
 * → its full seeded participant list; the target cohort → empty.
 */
export async function resetBigMutableState(r: BigSeedResult): Promise<void> {
  const d = db();
  for (const pa of r.participantAssignments) {
    await d.collection('big participants assignments').doc(pa.docid).set({ status: 'initiated' }, { merge: true });
  }
  await d
    .collection('big cohorts')
    .doc(r.sourceCohortId)
    .set({ participantidlist: r.cohortParticipants.map((p) => p.profileid) }, { merge: true });
  await d.collection('big cohorts').doc(r.targetCohortId).set({ participantidlist: [] }, { merge: true });
}

/**
 * Collections this module writes (default DB). Exposed so a teardown can clean them by testrunid
 * (seed-test-project.js's teardown does NOT know about these BIG collections). `dashboard`,
 * `profile_data`, `user_data`, `users_roles` are shared with the main seeder's teardown list.
 */
export const BIG_SEED_COLLECTIONS = [
  'big marathon', 'big cohorts', 'big cohorts log', 'big assignment',
  'big participants assignments', 'big aggregate event level',
  'biglevel', 'atcmodel level config',
  'event collection', 'bigactivity',
];

export default seedBigWorld;
