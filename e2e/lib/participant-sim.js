/**
 * participant-sim.js — Level-1 participant driver: replicate EXACTLY the Firestore writes
 * the real apps make to advance a queue_token, so the harness can drive a participant
 * through the queue without the (native Flutter) UI.
 *
 *  - self-move / auto-advance  (Flutter moveQueueStage, AppServices.dart:1261-1314)
 *  - operator nextstage move   (Angular board, dynamic-queue-manager-clone.ts:3215-3222)
 * Both write queue_token.{previousstage,currentstage,logdate,stagestatus} + a queue stage log doc.
 * Identical write shape — the only difference is intent (who would have clicked).
 *
 * Admin SDK, default DB. Pinned to the test project via the allowlist guard.
 */
'use strict';
const admin = require('firebase-admin');
const { TEST_PROJECT_ID, assertWritable } = require('./test-project');

function db() {
  assertWritable(process.env.TEST_PROJECT || TEST_PROJECT_ID);
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.TEST_PROJECT || TEST_PROJECT_ID });
  return admin.firestore();
}
const T = () => admin.firestore.Timestamp.now();

/** Read a token's current stage. */
async function currentStage(tokenDocId) {
  const d = await db().collection('queue_token').doc(tokenDocId).get();
  if (!d.exists) throw new Error(`queue_token ${tokenDocId} missing`);
  return d.data().currentstage;
}

/**
 * Advance a token from->to, exactly as the apps do, tagging the run for teardown.
 * @param {string} tokenDocId
 * @param {string} toStage
 * @param {{by?:'self'|'operator', testrunid?:string}} opts
 * @returns {Promise<string>} the queue stage log doc id written
 */
async function advance(tokenDocId, toStage, opts = {}) {
  const d = db();
  const tokRef = d.collection('queue_token').doc(tokenDocId);
  const snap = await tokRef.get();
  if (!snap.exists) throw new Error(`queue_token ${tokenDocId} missing`);
  const tok = snap.data();
  const fromStage = tok.currentstage;
  const move = {
    previousstage: fromStage, currentstage: toStage, logdate: T(),
    stagestatus: 'Approved', movedby: opts.by || 'self', people_involved: [],
  };
  await tokRef.update(move);
  const logId = d.collection('queue stage log').doc().id;
  await d.collection('queue stage log').doc(logId).set({
    ...tok, ...move, docid: tokenDocId, logdocid: logId,
    testrunid: opts.testrunid || tok.testrunid, _testdata: true,
  });
  return logId;
}

/** How many queue stage log rows exist for a token (silent-data-gap check: 1 per transition). */
async function logCount(tokenDocId) {
  const s = await db().collection('queue stage log').where('docid', '==', tokenDocId).get();
  return s.size;
}

/** Tokens for a variation in this run (sorted by queueposition for determinism). */
async function tokensForVariation(testrunid, variationId) {
  const s = await db().collection('queue_token')
    .where('testrunid', '==', testrunid).where('variationid', '==', variationId).get();
  return s.docs.map(x => ({ id: x.id, ...x.data() }))
    .sort((a, b) => (a.queueposition || 0) - (b.queueposition || 0));
}

module.exports = { advance, currentStage, logCount, tokensForVariation, db };
