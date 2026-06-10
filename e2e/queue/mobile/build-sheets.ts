// build-sheets.ts — emit two CSVs (import directly into Google Sheets):
//   e2e/paths.csv       — all 72 forward paths (one row per path) from the queue oracle
//   e2e/test-cases.csv  — every test() case across all e2e suites (extracted from the spec files)
// Run: cd e2e && npx tsx queue/mobile/build-sheets.ts
import * as fs from 'fs';
import * as path from 'path';
import { classifyForwardHop, primaryJourney, buildTargets } from './walk-lib';
const cfg = require('../../fixtures/sample-queue-config.json');
const { forwardJourneys } = require('../../lib/forward-journeys');
const { generatePlan } = require('../../lib/path-generator');

const E2E = path.resolve(__dirname, '../..');
const csvCell = (v: any) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells: any[]) => cells.map(csvCell).join(',');
const sameJourney = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i]);

async function formNamesByStage(): Promise<Record<string, string>> {
  try {
    const admin = require('firebase-admin');
    const { TEST_PROJECT_ID } = require('../../lib/test-project');
    if (!admin.apps.length) admin.initializeApp({ projectId: TEST_PROJECT_ID });
    const db = admin.firestore();
    const gen = await db.collection('queue generation').doc(`run1_${process.env.QUEUE_ID || 'L3rqCrqDBsshd7HM5YRn'}`).get();
    const sp = gen.exists ? (gen.data()!.stageproperty || {}) : {};
    const out: Record<string, string> = {};
    for (const stage of Object.keys(sp)) {
      const ar = sp[stage]?.actionresource;
      if (ar && typeof ar.get === 'function') { try { const f = await ar.get(); if (f.exists) out[stage] = f.data().formname || ''; } catch {} }
    }
    return out;
  } catch { return {}; }
}

// ---- Sheet 1: all paths ----
async function buildPathsCsv() {
  const forms = await formNamesByStage();
  const plan = generatePlan(cfg, Number(process.env.TOTAL_PARTICIPANTS || 50));
  const rows = [csvRow(['Variation', 'Path #', 'Paths in variation', 'Stages', 'Self-moves', 'Board hops', 'Terminal', 'Walked today', 'Stage sequence (entry→terminal)', 'Forms used (real)'])];
  let total = 0;
  for (const v of plan.variations) {
    const journeys: string[][] = forwardJourneys(cfg, v.id);
    const primary = primaryJourney(v.id);
    journeys.forEach((j, ji) => {
      total++;
      const hops = j.slice(0, -1).map((from, i) => classifyForwardHop(from, j[i + 1], v.id));
      const selfN = hops.filter((h: any) => h.kind === 'SELF').length;
      const boardN = hops.filter((h: any) => h.kind !== 'SELF').length;
      const formsUsed = [...new Set(hops.filter((h: any) => h.kind === 'SELF').map((h: any) => forms[h.from]).filter(Boolean))].join(' · ');
      const walked = primary.length > 0 && sameJourney(j, primary) ? 'YES (primary)' : 'pending';
      rows.push(csvRow([v.variationname, ji + 1, journeys.length, j.length, selfN, boardN, j[j.length - 1], walked, j.join(' → '), formsUsed]));
    });
  }
  fs.writeFileSync(path.join(E2E, 'paths.csv'), rows.join('\n'));
  return total;
}

// ---- Sheet 2: all test cases ----
const SUITE_BY_DIR: Record<string, string> = {
  queue: 'Queue (desktop)', 'queue/variations': 'Queue · variations', 'queue/mobile': 'Mobile (real app)',
  appointments: 'Appointments', authroles: 'Auth & Roles', business: 'Business', comms: 'Comms', content: 'Content',
  events: 'Events', evomap: 'Evolution Map', journey: 'Journey', modes: 'Product Modes', profiles: 'Profiles',
  support: 'Support', workshops: 'Workshops',
};
function suiteFor(rel: string): string {
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '(root)';
  return SUITE_BY_DIR[dir] || (dir === '(root)' ? 'Root / Conferencing' : dir);
}
function listSpecs(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listSpecs(full, acc);
    else if (e.name.endsWith('.spec.ts')) acc.push(full);
  }
  return acc;
}
function buildTestCasesCsv() {
  const specs = listSpecs(E2E).sort();
  // handles escaped quotes inside the title (\\. ) so apostrophes don't truncate
  const re = /\btest(?:\.(?:skip|only|fixme))?\s*\(\s*([`'"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  const rows = [csvRow(['Suite', 'Spec file', 'Test case'])];
  let count = 0;
  for (const spec of specs) {
    const rel = path.relative(E2E, spec);
    // The mobile spec is a parameterized loop (1 test() over 9 variations) — list its 9 real cases.
    if (rel.endsWith('mobile/mobile-walk.spec.ts')) {
      for (const t of buildTargets() as any[]) {
        const selfN = t.hops.filter((h: any) => h.kind === 'SELF').length;
        const opN = t.hops.filter((h: any) => h.kind !== 'SELF').length;
        rows.push(csvRow([suiteFor(rel), rel, `${t.name} — entry→${t.terminal}: ${selfN} REAL Flutter self-move(s) + ${opN} board hop(s)`]));
        count++;
      }
      continue;
    }
    const src = fs.readFileSync(spec, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const title = m[2].replace(/\\(['"`\\])/g, '$1').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      rows.push(csvRow([suiteFor(rel), rel, title]));
      count++;
    }
  }
  fs.writeFileSync(path.join(E2E, 'test-cases.csv'), rows.join('\n'));
  return count;
}

(async () => {
  const paths = await buildPathsCsv();
  const cases = buildTestCasesCsv();
  console.log(`✓ e2e/paths.csv (${paths} paths)`);
  console.log(`✓ e2e/test-cases.csv (${cases} test cases)`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
