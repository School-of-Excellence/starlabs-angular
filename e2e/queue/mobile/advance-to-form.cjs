#!/usr/bin/env node
/**
 * advance-to-form.cjs — SMOKE precondition. Parks a participant's token at a FORM self-move stage
 * with a clean log, so the Flutter smoke can tap the real form and we can assert exactly ONE new
 * queue stage log row. This is a precondition WRITE only (not an assertion target). Hard-gated to
 * the test project. Usage: TESTRUNID=run1 node advance-to-form.cjs [tokenId] [formStage]
 */
'use strict';
const { TEST_PROJECT_ID, assertWritable } = require('../../lib/test-project');
const TEST_PROJECT = process.env.TEST_PROJECT || TEST_PROJECT_ID;
const TESTRUNID = process.env.TESTRUNID || 'run1';
const TOKEN_ID = process.argv[2] || `${TESTRUNID}_tok_${TESTRUNID}_profile_0`;
const FORM_STAGE = process.argv[3] || 'Accelerated Evolution Level Form';

async function main() {
  assertWritable(TEST_PROJECT);
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ projectId: TEST_PROJECT });
  assertWritable(admin.app().options.projectId || TEST_PROJECT);
  const db = admin.firestore();

  // clean any prior log rows for this token (so the smoke's count delta is unambiguous)
  const logs = await db.collection('queue stage log').where('docid', '==', TOKEN_ID).get();
  let batch = db.batch();
  logs.docs.forEach(d => batch.delete(d.ref));
  if (logs.size) await batch.commit();

  await db.collection('queue_token').doc(TOKEN_ID).update({
    currentstage: FORM_STAGE,
    previousstage: null,
    status: 'queued',
    stagestatus: 'Yet to Start',
    logdate: admin.firestore.Timestamp.now(),
  });
  console.log(`✓ parked ${TOKEN_ID} at "${FORM_STAGE}" (cleared ${logs.size} log rows) on ${TEST_PROJECT}`);
  process.exit(0);
}
main().catch(e => { console.error('advance-to-form error:', e); process.exit(1); });
