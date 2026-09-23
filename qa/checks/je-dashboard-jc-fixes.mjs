#!/usr/bin/env node
// Red-on-revert contract check for je-dashboard-jc-fixes.
// Reads the journeycoach-dashboard source and asserts each of the 6 fixes is present.
// Reverting any fix fails its assertion -> exit 1. Run: node qa/checks/je-dashboard-jc-fixes.mjs
import { readFileSync } from 'node:fs';

const base = 'src/app/Journey Onboarding/journeycoach-dashboard/';
const ts = readFileSync(base + 'journeycoach-dashboard.component.ts', 'utf8');
const css = readFileSync(base + 'journeycoach-dashboard.component.css', 'utf8');

const checks = [
  ['1 dark table',    () => /\.jcd-root\.jcd-dark\s+\.jcd-td\b/.test(css)],
  ['2 ATC not read',  () => !/\bthis\.getAtcAlpha\(\)/.test(ts)],
  ['3 health new tab',() => /goToHealthBoard\(\)\s*\{[^}]*window\.open\(/.test(ts)],
  ['5 tickets count', () => /getCountFromServer\(/.test(ts) && /where\('status\.status',\s*'==',\s*'open'\)/.test(ts) && !/scoped\('clientissue'/.test(ts)],
  ['6 outreach reason',() => /statusLine:\s*\(pr\.reason/.test(ts)],
  ['7 appts query',   () => /where\('journeycoach',\s*'==',\s*true\)/.test(ts) && /where\('attended',\s*'==',\s*true\)/.test(ts) && /where\('cancelled',\s*'==',\s*false\)/.test(ts)],
];

let fail = 0;
for (const [name, fn] of checks) {
  let ok = false; try { ok = fn(); } catch { ok = false; }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} (${checks.length} checks)`);
process.exit(fail === 0 ? 0 : 1);
