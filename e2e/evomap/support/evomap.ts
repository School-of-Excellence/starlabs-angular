// evomap.ts — actors, login, per-test external/prod stub installer, and idempotent precondition
// resets for the Evolution Mapping suite.
//
// Reuses the queue suite's real-login form helper (actors.ts loginAs), external stubs (Zoom/FCM/Wati/
// email/OpenVidu — none of which this group actually fires, but installed for parity), and the prod-
// endpoint firewall (e2e/_shared/prod-firewall). The Evolution Mapping screens additionally open video
// players via window.open and embed Dropbox/Google-Drive media; we suppress new tabs and block the
// media CDNs so a test never hangs on a real media fetch or a popped browser tab.
import { Page } from '@playwright/test';
import { loginAs } from '../../queue/support/actors';
import { installAllExternalStubs } from '../../queue/stubs';
import { installProdFirewall } from '../../_shared/prod-firewall';

const RUN = process.env.EVOM_RUNID || 'evom';
export const PASSWORD = 'Test!1234';

// Stage names — kept in sync with seed-evomap.js (VARIATION_STAGES).
export const EVO_STAGE = 'Evolution Mapping Stage';
export const NEXT_STAGE = 'Closing Stage';
export const INTRO_STAGE = 'Intro Stage';

/** Seeded actors (seed-evomap.js roster). */
export const evoActors = {
  admin: `admin+${RUN}@example.com`,            // roles {admin} — full CRUD
  participant0: `participant-evo+${RUN}@example.com`,  // p0 — self-completes
  participantLive: `participant-evo1+${RUN}@example.com`, // pLive — Make-Live target
  participantDel: `participant-evo2+${RUN}@example.com`,  // pDel — deleteVideo target
  participantNew: `participant-evo3+${RUN}@example.com`,  // pNew — EM-13 add-video target
  participantVdel: `participant-evo4+${RUN}@example.com`, // pVdel — EM-14 delete-video target
  participantToggle: `participant-evo5+${RUN}@example.com`, // pToggle — EM-15 live-toggle target
};

/** Seeded profileids (for asserting app-written refs / scoping admin counts). */
export const evoProfileIds = {
  admin: `${RUN}_pf_admin`,
  p0: `${RUN}_pf_p0`,
  pLive: `${RUN}_pf_pLive`,
  pDel: `${RUN}_pf_pDel`,
  pNew: `${RUN}_pf_pNew`,
  pVdel: `${RUN}_pf_pVdel`,
  pToggle: `${RUN}_pf_pToggle`,
};

/** Seeded doc ids the specs assert against (mirror seed-evomap.js ID). */
export const evoIds = {
  QGEN: `${RUN}_qgen`,
  QVAR: `${RUN}_qvar`,
  TOKEN: `${RUN}_tok_p0`,
  EV_L1: `${RUN}_ev_L1`,
  EV_L2: `${RUN}_ev_L2`,
  EV_D1: `${RUN}_ev_D1`,
  EV_P1: `${RUN}_ev_P1`,
  EV_P2: `${RUN}_ev_P2`,
  EV_X1: `${RUN}_ev_X1`,
  EV_X2: `${RUN}_ev_X2`,
  EV_E1: `${RUN}_ev_E1`,
  EV_T1: `${RUN}_ev_T1`,
  EV_T2: `${RUN}_ev_T2`,
  PV_1: `${RUN}_pv_1`,
  PV_2: `${RUN}_pv_2`,
  PV_DEL: `${RUN}_pv_del`,
};

/** Seeded run-unique titles (the specs select MatTable rows by this UNIQUE text). */
export const evoTitles = {
  L1: `EVOM Live Pre ${RUN}`,
  L2: `EVOM Live Post ${RUN}`,
  D1: `EVOM Delete Target ${RUN}`,
  P1: `EVOM Participant Pre ${RUN}`,
  P2: `EVOM Participant Post ${RUN}`,
  X1: `EVOM DelVid One ${RUN}`,
  X2: `EVOM DelVid Two ${RUN}`,
  PV1: `EVOM Source Interview ${RUN}`,
  PV2: `EVOM Source Testimonial ${RUN}`,
  E1_BEFORE: `EVOM Edit Before ${RUN}`,
  E1_AFTER: `EVOM Edit After ${RUN}`,
  T1: `EVOM Toggle One ${RUN}`,
  T2: `EVOM Toggle Two ${RUN}`,
  PVDEL: `EVOM PVDel Standalone ${RUN}`,
};

/** Seeded run-unique video urls. */
export const evoUrls = {
  L1: `https://dl.dropboxusercontent.com/evomap/${RUN}/live-pre.mp4?raw=1`,
  L2: `https://dl.dropboxusercontent.com/evomap/${RUN}/live-post.mp4?raw=1`,
  P1: `https://dl.dropboxusercontent.com/evomap/${RUN}/part-pre.mp4?raw=1`,
  P2: `https://dl.dropboxusercontent.com/evomap/${RUN}/part-post.mp4?raw=1`,
  X1: `https://dl.dropboxusercontent.com/evomap/${RUN}/del-vid-1.mp4?raw=1`,
  X2: `https://dl.dropboxusercontent.com/evomap/${RUN}/del-vid-2.mp4?raw=1`,
  // EM-02 source video the add dialog converts (raw=1 already present → convertDropboxUrl is a no-op
  // for dl.dropboxusercontent.com hosts, so the stored url equals this string).
  PV1: `https://dl.dropboxusercontent.com/evomap/${RUN}/source-interview.mp4?raw=1`,
  E1: `https://dl.dropboxusercontent.com/evomap/${RUN}/edit-me.mp4?raw=1`,
  T1: `https://dl.dropboxusercontent.com/evomap/${RUN}/toggle-1.mp4?raw=1`,
  T2: `https://dl.dropboxusercontent.com/evomap/${RUN}/toggle-2.mp4?raw=1`,
  PVDEL: `https://dl.dropboxusercontent.com/evomap/${RUN}/pvdel.mp4?raw=1`,
};

/** Run-unique participant-video TYPE strings (the add dialog groups source videos by `type`). */
export const evoVideoTypes = {
  interview: `EVOMInterview ${RUN}`,
  testimonial: `EVOMTestimonial ${RUN}`,
};

/** Run-unique `participant metadata` display names (the /participant_videos_mapping filter search). */
export const evoMetaNames = {
  pNew: `EVOM Meta pNew ${RUN}`,
  pVdel: `EVOM Meta pVdel ${RUN}`,
  pToggle: `EVOM Meta pToggle ${RUN}`,
};

/**
 * Install the prod firewall + all external stubs + media blocks. Call in beforeEach BEFORE navigating.
 * Also suppresses any window.open new tab (the video-play buttons open videos in a new tab — left
 * un-suppressed they'd accumulate pages / could hang a test).
 */
export async function installEvomapStubs(page: Page): Promise<void> {
  await installProdFirewall(page);
  installAllExternalStubs(page);
  // Block media CDNs the video player would fetch (Dropbox direct + Google Drive embeds). The test only
  // asserts Firestore state + DOM presence, never playback — a 204 keeps the player from a real fetch.
  await page.route(/dl\.dropboxusercontent\.com|www\.dropbox\.com|drive\.google\.com|youtube\.com|youtu\.be|vimeo\.com/i,
    (route) => route.fulfill({ status: 204, body: '' }).catch(() => route.abort().catch(() => {})));
  // Auto-close any popup tab a video-play button opens via window.open.
  page.context().on('page', (pg) => { pg.close().catch(() => {}); });
}

/**
 * The /participant_videos_mapping screen's "Last Video" column query (fetchLastVideos:
 * `where('profileid','in') + where('delete','==') + orderBy('recordeddate','desc')`) needs a composite
 * index `participant videos (delete, profileid, recordeddate)` that is NOT provisioned on the disposable
 * test project (we must not edit the shared firestore.indexes.json). It is an AUXILIARY column query, not
 * the behavior any EM case asserts (EM-12 asserts the participant stat; EM-13/14 the video write). Pass
 * this to assertNoFatal's extraIgnorable on the /participant_videos_mapping cases. The needed index is
 * RETURNED in the structured result (neededIndexes) so the orchestrator can provision it.
 */
export const PVM_LASTVIDEO_INDEX_ERR = /requires an index|create_composite/i;

/** Log in via the real Angular login form as the seeded admin operator. */
export async function loginAsEvoAdmin(page: Page): Promise<void> {
  await loginAs(page, evoActors.admin, PASSWORD);
}

/** Log in as the self-completing participant (p0). */
export async function loginAsEvoParticipant(page: Page): Promise<void> {
  await loginAs(page, evoActors.participant0, PASSWORD);
}

// CommonJS — reuse the allowlist-guarded admin init (only ever the test project).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../../fixtures/seed-test-project');

function adminHandles() {
  const admin = seed.initAdmin();
  return { admin, db: admin.firestore(), T: admin.firestore.Timestamp };
}

/**
 * Reset pLive's Make-Live preconditions (EM-05/06): DELETE liveevolutionmapping/{pLive} so the app
 * CREATES it fresh (videolist.length asserted == exactly the selection size, no union), and flip the
 * two pLive catalogue rows back to urllive:false. PRECONDITION only — the test asserts the live doc +
 * urllive the APP writes on the real Make-Live click, never these reset values.
 */
export async function resetMakeLivePreconditions(): Promise<void> {
  const { db } = adminHandles();
  await db.collection('liveevolutionmapping').doc(evoProfileIds.pLive).delete().catch(() => {});
  await db.collection('evolutionmappingvideo').doc(evoIds.EV_L1).set({ urllive: false }, { merge: true });
  await db.collection('evolutionmappingvideo').doc(evoIds.EV_L2).set({ urllive: false }, { merge: true });
}

/**
 * Reset pDel's existing-live mapping (EM-07): restore liveevolutionmapping/{pDel}.videolist to BOTH
 * x-urls and the two catalogue rows to urllive:true, so deleteVideo always has 2 → 1 to work on.
 */
export async function resetDeleteVideoPreconditions(): Promise<void> {
  const { db, T } = adminHandles();
  await db.collection('liveevolutionmapping').doc(evoProfileIds.pDel).set({
    docid: evoProfileIds.pDel, profileid: evoProfileIds.pDel, title: `EVOM pDel Live ${RUN}`,
    live: true, videolist: [evoUrls.X1, evoUrls.X2], lastupdated: T.now(),
    testrunid: RUN, _testdata: true,
  });
  await db.collection('evolutionmappingvideo').doc(evoIds.EV_X1).set({ urllive: true }, { merge: true });
  await db.collection('evolutionmappingvideo').doc(evoIds.EV_X2).set({ urllive: true }, { merge: true });
}

/**
 * Reset p0's liveevolutionmapping to a known `live` state (EM-08 positive/negative). Idempotent.
 */
export async function setP0Live(live: boolean): Promise<void> {
  const { db, T } = adminHandles();
  await db.collection('liveevolutionmapping').doc(evoProfileIds.p0).set({
    docid: evoProfileIds.p0, profileid: evoProfileIds.p0, title: `EVOM p0 Live ${RUN}`,
    live, videolist: [evoUrls.P1, evoUrls.P2], lastupdated: T.now(),
    testrunid: RUN, _testdata: true,
  });
}

/**
 * Reset p0's queue_token back to the un-completed precondition (currentstage = EVO_STAGE, Approved,
 * Active) so the completion gate renders and EM-09/10 are re-run-stable. Also clears any stage-log row
 * the prior run wrote for this token. PRECONDITION only — the test asserts the advanced currentstage +
 * the new stage-log row the APP writes, never this reset value.
 */
export async function resetParticipantToken(): Promise<void> {
  const { db, T } = adminHandles();
  const qgenRef = db.collection('queue generation').doc(evoIds.QGEN);
  await db.collection('queue_token').doc(evoIds.TOKEN).set({
    docid: evoIds.TOKEN, profile_id: evoProfileIds.p0, profileid: evoProfileIds.p0,
    profile_name: evoActors.participant0, queueref: qgenRef, variationid: evoIds.QVAR,
    currentstage: EVO_STAGE, previousstage: INTRO_STAGE,
    stagestatus: 'Approved', tokenstatus: 'Active', status: 'queued',
    tokennumber: 1, queueposition: 1, delete: false,
    people_involved: [], liveassignmentid: null, manuallymoved: false,
    logdate: T.now(), updatedAt: T.now(), testrunid: RUN, _testdata: true,
  }, { merge: true });
  // Remove any stage-log row keyed to this token from a previous run (docid == token id).
  const logs = await db.collection('queue stage log').where('docid', '==', evoIds.TOKEN).get();
  for (const d of logs.docs) await d.ref.delete().catch(() => {});
}

/**
 * Restore the EM-04 soft-delete target row to deleted:false so the case is re-run-stable.
 * PRECONDITION only — the assertion is on the deleted:true the APP writes on the real Delete click.
 */
export async function resetDeleteTargetRow(): Promise<void> {
  const { db } = adminHandles();
  await db.collection('evolutionmappingvideo').doc(evoIds.EV_D1).set({ deleted: false }, { merge: true });
}

/**
 * Restore the EM-03 EDIT target row (EV_E1) to its BEFORE title + not-deleted + not-live, so the case
 * is re-run-stable and its Edit FAB is available (a urllive:true row renders "Live" with no checkbox,
 * but the Edit FAB is in a separate column and always present — we keep urllive:false for clarity).
 * PRECONDITION only — the assertion is on the AFTER title the APP setDoc-merges on the Update click.
 */
export async function resetEditTargetRow(): Promise<void> {
  const { db } = adminHandles();
  await db.collection('evolutionmappingvideo').doc(evoIds.EV_E1).set({
    title: evoTitles.E1_BEFORE, deleted: false, urllive: false,
  }, { merge: true });
}

/**
 * Restore the EM-14 standalone participant-video (PV_DEL) to delete:false so the log overlay renders it
 * as a deletable card and the case is re-run-stable. PRECONDITION only — the assertion is on the
 * delete:true the APP writes via updateDoc on the real Delete click.
 */
export async function resetPVdelTarget(): Promise<void> {
  const { db } = adminHandles();
  await db.collection('participant videos').doc(evoIds.PV_DEL).set({ delete: false }, { merge: true });
}

/**
 * Restore pToggle's live mapping to live:true (EM-15 toggle-off precondition). Idempotent.
 * PRECONDITION only — the assertion is on the live:false the APP writes on the toggle+Update click.
 */
export async function resetToggleLive(): Promise<void> {
  const { db, T } = adminHandles();
  await db.collection('liveevolutionmapping').doc(evoProfileIds.pToggle).set({
    docid: evoProfileIds.pToggle, profileid: evoProfileIds.pToggle, title: `EVOM pToggle Live ${RUN}`,
    live: true, videolist: [evoUrls.T1, evoUrls.T2], lastupdated: T.now(),
    testrunid: RUN, _testdata: true,
  });
}

/**
 * EM-12 anti-circular basis: count `participant metadata` docs that have a non-empty `name`. The screen's
 * fetchParticipants() runs `query(collection('participant metadata'), orderBy('name'))`; Firestore's
 * orderBy('name') SILENTLY excludes docs missing the field, so participantOptions.length (and thus the
 * rendered "Participants" stat) equals the name-having count — NOT the raw collection count. We mirror
 * orderBy('name') here (count docs with a non-empty name) so the assertion is the app's true derivation.
 */
export async function countMetadataWithName(): Promise<number> {
  const { db } = adminHandles();
  const snap = await db.collection('participant metadata').get();
  return snap.docs.filter((d) => {
    const n = d.data().name;
    return n != null && String(n).trim() !== '';
  }).length;
}

// ---------------------------------------------------------------------------------------------------
// INDEX-FREE admin read helpers. The anti-circular assertions need profileid-scoped counts of
// evolutionmappingvideo, but Firestore would require a COMPOSITE index for `profileid== AND deleted!=`
// (equality+inequality) or `profileid== AND urllive==` (equality+equality). Per the no-shared-index
// rule (we must not edit firestore.indexes.json), we instead do a SINGLE-equality query on `profileid`
// (served by the automatic single-field index) and filter the second predicate in JS. Same logical
// answer, zero composite-index dependency. The app's own table query is a single-field `deleted!=`
// (no composite needed) so the screen renders fine; only these admin assertions had to be reshaped.
// ---------------------------------------------------------------------------------------------------

/** Count NON-deleted evolutionmappingvideo rows for a profileid (mirrors the table's deleted!=true). */
export async function countNonDeletedFor(profileid: string): Promise<number> {
  const { db } = adminHandles();
  const snap = await db.collection('evolutionmappingvideo').where('profileid', '==', profileid).get();
  return snap.docs.filter((d) => d.data().deleted !== true).length;
}

/** Count evolutionmappingvideo rows with urllive==true for a profileid (Make-Live side-effect). */
export async function countUrlliveTrueFor(profileid: string): Promise<number> {
  const { db } = adminHandles();
  const snap = await db.collection('evolutionmappingvideo').where('profileid', '==', profileid).get();
  return snap.docs.filter((d) => d.data().urllive === true).length;
}

/** Does any NON-deleted evolutionmappingvideo row exist for this profileid with the given title? */
export async function hasNonDeletedTitleFor(profileid: string, title: string): Promise<boolean> {
  const { db } = adminHandles();
  const snap = await db.collection('evolutionmappingvideo').where('profileid', '==', profileid).get();
  return snap.docs.some((d) => d.data().title === title && d.data().deleted !== true);
}

/** Stage-log rows for a token (docid==tokenId) filtered to a given `movedthrough` in JS (no composite). */
export async function stageLogsThrough(tokenId: string, movedthrough: string): Promise<any[]> {
  const { db } = adminHandles();
  const snap = await db.collection('queue stage log').where('docid', '==', tokenId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r: any) => r.movedthrough === movedthrough);
}
