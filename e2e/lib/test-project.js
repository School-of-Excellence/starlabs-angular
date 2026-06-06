/**
 * test-project.js — the single source of truth for WHICH Firebase project the e2e
 * harness is allowed to touch, plus the hard safety guard.
 *
 * Per the test-environment guardrails, this harness must NEVER write any pre-existing
 * project — not production (`fir-sample-aae4a`), not the shared `starlabs-test`, not the
 * Watson/Sales-CRM instances. It targets ONE dedicated, disposable project created just
 * for this suite. The guard is an ALLOWLIST: only TEST_PROJECT_ID is writable; everything
 * else hard-aborts.
 */
'use strict';

// The dedicated, disposable project created for this suite (override via env for a fresh one).
const TEST_PROJECT_ID = process.env.TEST_PROJECT || 'slabs-queue-e2e-exdcz';

// Pre-existing projects that must never be written (informational — the allowlist already
// blocks them; this just yields a clearer abort message and documents intent).
const PROTECTED_IDS = [
  'fir-sample-aae4a',        // StarLabs production
  'watsonproduction-becde',  // Watson production
  'salesleadcrm',            // Sales CRM production
  'starlabs-test',           // shared test project — off-limits per "don't touch existing"
  'watson-test-19',
  'salescrm-test-19',
];

/**
 * Allowlist guard: abort unless `projectId` is exactly the dedicated test project.
 * @param {string} projectId
 */
function assertWritable(projectId) {
  if (!projectId) {
    console.error('REFUSING TO RUN: no project id resolved. Set TEST_PROJECT to the dedicated test project.');
    process.exit(1);
  }
  // Denylist FIRST — a protected project aborts even if TEST_PROJECT was (mis)pointed at it.
  if (PROTECTED_IDS.includes(projectId)) {
    console.error(`\n🛑 HARD ABORT: "${projectId}" is a PROTECTED pre-existing project — never written by this harness.`);
    console.error('   Production/shared/Watson/Sales-CRM are all off-limits.\n');
    process.exit(2);
  }
  if (projectId !== TEST_PROJECT_ID) {
    console.error(`\n🛑 HARD ABORT: "${projectId}" is not the dedicated test project.`);
    console.error(`   This harness may only write: ${TEST_PROJECT_ID}\n`);
    process.exit(2);
  }
}

module.exports = { TEST_PROJECT_ID, PROTECTED_IDS, assertWritable };
