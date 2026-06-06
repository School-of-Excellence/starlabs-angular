#!/bin/bash
# Fault-injection demo: prove the suite FAILS (goes RED) on each break class, with evidence.
# Each demo: inject a break -> run the relevant test (expected to FAIL) -> save its failure
# screenshot/log to evidence/ -> restore. Run from e2e/.
set +e
PID=slabs-queue-e2e-exdcz
CFG=playwright.queue.config.ts
mkdir -p evidence
shot() { find test-results -name 'test-failed-1.png' -newer /tmp/_mark 2>/dev/null | head -1; }

echo "############ DEMO A — SILENT DATA GAP (wrong numbers) ############"
touch /tmp/_mark
node -e "const a=require('firebase-admin');a.initializeApp({projectId:'$PID'});(async()=>{const db=a.firestore();const s=await db.collection('queue_token').where('testrunid','==','run1').get();const b=db.batch();s.docs.forEach(d=>b.update(d.ref,{tokenstatus:'Inactive'}));await b.commit();console.log('injected: '+s.size+' tokens -> Inactive (board will count 0, not 50)');process.exit(0)})()"
SKIP_SEED=1 npx playwright test --config $CFG operator.spec.ts -g "RIGHT NUMBERS" > evidence/FAIL-A-wrong-numbers.log 2>&1
echo "result: $(grep -E '[0-9]+ (passed|failed)' evidence/FAIL-A-wrong-numbers.log | tail -1)"
cp "$(shot)" evidence/FAIL-A-wrong-numbers.png 2>/dev/null && echo "screenshot -> evidence/FAIL-A-wrong-numbers.png"
TESTRUNID=run1 node fixtures/seed-test-project.js --seed >/dev/null 2>&1; echo "restored."

echo "############ DEMO B — UNUSABLE FOR AN ACTOR (access revoked) ############"
touch /tmp/_mark
node -e "const a=require('firebase-admin');a.initializeApp({projectId:'$PID'});(async()=>{const db=a.firestore();const s=await db.collection('dashboard').where('testrunid','==','run1').get();const b=db.batch();s.docs.forEach(d=>b.delete(d.ref));await b.commit();console.log('injected: deleted '+s.size+' dashboard route-configs (operator loses board access)');process.exit(0)})()"
SKIP_SEED=1 npx playwright test --config $CFG actors-health.spec.ts -g "OPERATOR" > evidence/FAIL-B-actor-unusable.log 2>&1
echo "result: $(grep -E '[0-9]+ (passed|failed)' evidence/FAIL-B-actor-unusable.log | tail -1)"
cp "$(shot)" evidence/FAIL-B-actor-unusable.png 2>/dev/null && echo "screenshot -> evidence/FAIL-B-actor-unusable.png"
TESTRUNID=run1 node fixtures/seed-test-project.js --seed >/dev/null 2>&1; echo "restored."

echo "############ DEMO C — LOGIC BREAK (weakened oracle detection) ############"
cp lib/flow-model.js /tmp/flow-model.bak
# simulate a code change that breaks dangling-edge detection
perl -0pi -e 's/const dangling = order\[b\.stage\] === undefined;/const dangling = false; \/* INJECTED BREAK *\//' lib/flow-model.js
SKIP_SEED=1 npx playwright test --config $CFG oracle-selftest.spec.ts > evidence/FAIL-C-logic-break.log 2>&1
echo "result: $(grep -E '[0-9]+ (passed|failed)' evidence/FAIL-C-logic-break.log | tail -1)"
cp /tmp/flow-model.bak lib/flow-model.js; echo "restored flow-model.js."

echo; echo "=== EVIDENCE (failure) ==="; ls -la evidence/FAIL-* 2>/dev/null | awk '{print $5, $9}'
