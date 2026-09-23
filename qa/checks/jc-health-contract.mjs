#!/usr/bin/env node
/*
 * Contract guard for the three JC-Health fixes (qa/jc-health-3fixes.md) — the structural / template
 * invariants a Karma (browser) spec cannot reach. Exits non-zero (RED) if any fix is reverted.
 *   Run: node qa/checks/jc-health-contract.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dash = join(root, 'src', 'app', 'Journey Onboarding', 'journey-coach-health-dashboard');
const html = readFileSync(join(dash, 'journey-coach-health-dashboard.component.html'), 'utf8');
const ts = readFileSync(join(dash, 'journey-coach-health-dashboard.component.ts'), 'utf8');

const checks = [
  // Fix 1 — the coach "Viewing" select MUST be one-way [ngModel]. Two-way [(ngModel)] pre-writes
  // selectedCoachId before onCoachChange runs, so its guard no-ops and the table never re-scopes.
  ['Fix1  coach select is one-way [ngModel] (not two-way)',
    () => /data-testid="viewing-coach-select"[^>]*\[ngModel\]="selectedCoachId"/.test(html)
       && !/\[\(ngModel\)\]="selectedCoachId"/.test(html)],

  // Fix 2 — onboarding discriminator reads appointmenttype.onboardingcall; isOnboardingAppt exists.
  ['Fix2  onboarding split uses appointmenttype.onboardingcall + isOnboardingAppt',
    () => /where\(\s*['"]onboardingcall['"]\s*,\s*['"]==['"]\s*,\s*true\s*\)/.test(ts)
       && /isOnboardingAppt\s*\(/.test(ts)],

  // Fix 3 — A&H drill is the native in-page overlay, and the MatDialog component is gone.
  ['Fix3  native A&H overlay present in template',
    () => /class="ahd-backdrop"/.test(html) && /data-testid="ahd-overlay"/.test(html)],
  ['Fix3  ahDrill signal present; no AhFlagListDialogComponent import/usage',
    () => /ahDrill\s*=\s*signal/.test(ts)
       && !/import\s*\{[^}]*AhFlagListDialogComponent/.test(ts)
       && !/dialog\.open\(\s*AhFlagListDialogComponent/.test(ts)],
  ['Fix3  ah-flag-list-dialog.component.ts deleted',
    () => !existsSync(join(dash, 'ah-flag-list-dialog.component.ts'))],
];

let failed = 0;
for (const [name, fn] of checks) {
  let ok = false;
  try { ok = !!fn(); } catch { ok = false; }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`\n${failed} contract check(s) FAILED — a JC-Health fix has regressed.`);
  process.exit(1);
}
console.log('\nAll JC-Health contract checks passed.');
