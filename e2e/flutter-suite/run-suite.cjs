#!/usr/bin/env node
/**
 * run-suite.cjs — the Flutter e2e SUITE orchestrator. Seeds the cohort + per-bucket feature
 * preconditions, then drives the journey-flow test + the 10 individual-functionality bucket tests
 * serially on the booted iOS simulator (one sim → serial), capturing real per-step OS screenshots and
 * writing a RESULTS.md (pass/fail + screenshot counts + honest blocked-feature notes). Anti-circular;
 * test-project only; ATC never driven.
 *
 * Modes:
 *   node flutter-suite/run-suite.cjs --seed     # (re)seed cohort + guards + all bucket preconditions
 *   node flutter-suite/run-suite.cjs --run      # run journey-flow + all bucket tests (assumes seeded)
 *   node flutter-suite/run-suite.cjs --all      # seed then run (default)
 *   ONLY=queue,forms node ... --run             # run a subset
 *   SKIP_PUBGET handled by run-flutter-test (we pass it after the first build)
 */
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUITE_DIR = __dirname;
const E2E_DIR = path.resolve(SUITE_DIR, '..');
const ROOT = path.resolve(E2E_DIR, '..');
const RUNNER = path.join(SUITE_DIR, 'run-flutter-test.cjs');
const EVIDENCE_ROOT = path.join(ROOT, 'breakthroughs-flutter', 'mobile-evidence');
const RESULTS = path.join(SUITE_DIR, 'RESULTS.md');
const RUN = process.env.JRNY_RUNID || 'jrny';
const email = (i) => `participant${i}+${RUN}@example.com`;

// bucket key → cohort user index + the integration_test target. Order = run order.
const STEPS = [
  { key: 'journeyflow', user: 170, target: 'integration_test/journey_flow_test.dart', kind: 'journey-flow' },
  { key: 'auth', user: 90, target: 'integration_test/features/auth_test.dart', kind: 'bucket' },
  { key: 'shell', user: 91, target: 'integration_test/features/shell_test.dart', kind: 'bucket' },
  { key: 'journey', user: 92, target: 'integration_test/features/journey_test.dart', kind: 'bucket' },
  { key: 'queue', user: 93, target: 'integration_test/features/queue_test.dart', kind: 'bucket' },
  { key: 'forms', user: 94, target: 'integration_test/features/forms_test.dart', kind: 'bucket' },
  { key: 'appointments', user: 95, target: 'integration_test/features/appointments_test.dart', kind: 'bucket' },
  { key: 'events', user: 96, target: 'integration_test/features/events_test.dart', kind: 'bucket' },
  { key: 'content', user: 97, target: 'integration_test/features/content_test.dart', kind: 'bucket' },
  { key: 'workshops', user: 150, target: 'integration_test/features/workshops_test.dart', kind: 'bucket' },
  { key: 'social', user: 151, target: 'integration_test/features/social_test.dart', kind: 'bucket' },
];
// per-bucket seeders (run-scoped); journeyflow has its own.
const SEEDERS = ['seed-journeyflow.cjs', 'seed-auth.cjs', 'seed-shell.cjs', 'seed-journey.cjs', 'seed-queue.cjs',
  'seed-forms.cjs', 'seed-appointments.cjs', 'seed-events.cjs', 'seed-content.cjs', 'seed-workshops.cjs', 'seed-social.cjs'];

function seedAll() {
  console.log('[run-suite] seeding cohort + guards + bucket preconditions …');
  execFileSync('node', [path.join(E2E_DIR, 'journey-cohort', 'seed-cohort.js'), '--seed'], { stdio: 'inherit' });
  execFileSync('node', [path.join(E2E_DIR, 'journey-cohort', 'mobile-guards.cjs')], { stdio: 'inherit' });
  for (const s of SEEDERS) {
    const p = path.join(SUITE_DIR, s);
    if (!fs.existsSync(p)) { console.warn(`  ⚠ ${s} not present yet — skipping`); continue; }
    try { execFileSync('node', [p, '--seed'], { stdio: 'inherit' }); }
    catch (e) { console.error(`  ✗ ${s} seed failed: ${e.message}`); }
  }
}

function runStep(step, firstBuild) {
  if (!fs.existsSync(path.join(ROOT, 'breakthroughs-flutter', step.target))) {
    return { ...step, status: 'MISSING', shots: 0, note: 'test file not present' };
  }
  const env = { ...process.env, TEST_TARGET: step.target, E2E_EMAIL: email(step.user), E2E_LABEL: step.key,
    E2E_EVIDENCE: step.key };
  if (!firstBuild) env.SKIP_PUBGET = '1';
  const r = spawnSync('node', [RUNNER], { env, stdio: 'inherit', timeout: 20 * 60_000 });
  const dir = path.join(EVIDENCE_ROOT, step.key);
  const shots = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length : 0;
  return { ...step, status: r.status === 0 ? 'PASS' : 'FAIL', shots };
}

function writeResults(results) {
  const ts = execFileSync('date', ['-u', '+%Y-%m-%dT%H:%M:%SZ']).toString().trim();
  const pass = results.filter((r) => r.status === 'PASS').length;
  let md = `# Flutter e2e suite — RESULTS\n\n> Generated ${ts} · run=${RUN} · project=slabs-queue-e2e-exdcz (test).\n`;
  md += `> Driven on the booted iOS simulator; screenshots are real-screen captures under \`breakthroughs-flutter/mobile-evidence/<bucket>/\`.\n\n`;
  md += `**${pass}/${results.length} steps PASS.**\n\n`;
  md += `| Step | Kind | User | Status | Screenshots | Target |\n|---|---|---|---:|---:|---|\n`;
  for (const r of results) md += `| ${r.key} | ${r.kind} | ${email(r.user)} | ${r.status === 'PASS' ? '✅ PASS' : (r.status === 'FAIL' ? '❌ FAIL' : '⚠ ' + r.status)} | ${r.shots} | \`${r.target}\` |\n`;
  md += `\n_See \`specs/flutter-app/FEATURE-CATALOG.md\` for the per-feature coverage each bucket asserts, and each test's structured run notes for the honest assert/render-only/blocked breakdown._\n`;
  fs.writeFileSync(RESULTS, md);
  console.log(`\n[run-suite] ${pass}/${results.length} PASS → ${RESULTS}`);
}

function main() {
  const mode = process.argv[2] || '--all';
  if (mode === '--seed' || mode === '--all') seedAll();
  if (mode === '--seed') return;
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const steps = only ? STEPS.filter((s) => only.has(s.key)) : STEPS;
  const results = [];
  let first = true;
  for (const step of steps) { results.push(runStep(step, first)); first = false; }
  writeResults(results);
}
main();
