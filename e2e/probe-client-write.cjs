#!/usr/bin/env node
/**
 * probe-client-write.cjs — WIRE step W0. Does a signed-in PARTICIPANT *client* (not Admin SDK)
 * have permission to write the collections the Flutter app writes on the cloud test project?
 *
 * Uses the Firebase web apiKey + Identity Toolkit + Firestore REST as the participant — exactly the
 * permission path the Flutter client will hit (Admin SDK bypasses rules, so this CANNOT be tested
 * with the existing harness). Read-only to prod by construction: only ever touches the TEST project.
 *
 * Exit 0 = client writes allowed (no rules deploy needed). Exit 1 = blocked (deploy permissive
 * test rules to slabs-queue-e2e-exdcz). Cleans up the scratch log doc it creates.
 */
'use strict';
const PROJECT = 'slabs-queue-e2e-exdcz';
const API_KEY = 'AIzaSyBaqfEYFbvNV1dCLTZ86R1HowQOT2cpuWA'; // test-project WEB apiKey (firebase apps:sdkconfig)
const EMAIL = 'participant0+run1@example.com';
const PASSWORD = 'Test!1234';
const TOKEN_ID = 'run1_tok_run1_profile_0';

if (PROJECT !== 'slabs-queue-e2e-exdcz') { console.error('refusing: not the test project'); process.exit(2); }
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function main() {
  // 1) sign in as the participant (client auth)
  const signInRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }) });
  const signIn = await signInRes.json();
  if (!signInRes.ok) { console.error('SIGN-IN FAILED:', JSON.stringify(signIn.error || signIn)); process.exit(1); }
  const idToken = signIn.idToken;
  console.log(`✓ signed in as ${EMAIL} (localId ${signIn.localId})`);
  const auth = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };

  // 2) UPDATE the participant's own queue_token (the field moveQueueStage updates)
  const patchRes = await fetch(
    `${DOCS}/queue_token/${TOKEN_ID}?updateMask.fieldPaths=_smoke_probe&currentDocument.exists=true`,
    { method: 'PATCH', headers: auth,
      body: JSON.stringify({ fields: { _smoke_probe: { stringValue: 'probe' } } }) });
  console.log(`  queue_token PATCH (own token): ${patchRes.status} ${patchRes.statusText}`);
  const patchOk = patchRes.ok;
  if (!patchOk) console.log('    ', JSON.stringify((await patchRes.json()).error || {}).slice(0, 300));

  // 3) CREATE a scratch 'queue stage log' doc (the collection moveQueueStage appends to)
  const logRes = await fetch(
    `${DOCS}/queue stage log?documentId=_smoke_probe_doc`.replace(/ /g, '%20'),
    { method: 'POST', headers: auth,
      body: JSON.stringify({ fields: { docid: { stringValue: TOKEN_ID }, _smoke_probe: { booleanValue: true } } }) });
  console.log(`  'queue stage log' CREATE: ${logRes.status} ${logRes.statusText}`);
  const logOk = logRes.ok;
  if (!logOk) console.log('    ', JSON.stringify((await logRes.json()).error || {}).slice(0, 300));
  // cleanup the scratch log doc (best-effort)
  if (logOk) await fetch(`${DOCS}/queue stage log/_smoke_probe_doc`.replace(/ /g, '%20'), { method: 'DELETE', headers: auth });

  // 4) named DB firestore-forms: CREATE a scratch formsByClient (the form-submit target)
  const FORMS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/firestore-forms/documents`;
  const fbcRes = await fetch(`${FORMS}/formsByClient?documentId=_smoke_probe_fbc`,
    { method: 'POST', headers: auth, body: JSON.stringify({ fields: { _smoke_probe: { booleanValue: true } } }) });
  console.log(`  formsByClient CREATE (firestore-forms): ${fbcRes.status} ${fbcRes.statusText}`);
  const fbcOk = fbcRes.ok;
  if (!fbcOk) console.log('    ', JSON.stringify((await fbcRes.json()).error || {}).slice(0, 300));
  if (fbcOk) await fetch(`${FORMS}/formsByClient/_smoke_probe_fbc`, { method: 'DELETE', headers: auth });

  console.log('');
  if (patchOk && logOk && fbcOk) { console.log('✅ CLIENT WRITES ALLOWED — no rules deploy needed.'); process.exit(0); }
  console.log('🛑 CLIENT WRITES BLOCKED — deploy permissive test rules to', PROJECT, '(both DBs).');
  process.exit(1);
}
main().catch(e => { console.error('probe error:', e); process.exit(1); });
