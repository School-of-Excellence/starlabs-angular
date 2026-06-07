#!/usr/bin/env node
/**
 * coverage-report.js — generate the AUDITABLE coverage artifacts for the Queue Manager e2e suite,
 * straight from the code (no emulator, no creds). Run: `node e2e/scripts/coverage-report.js`.
 *
 * Emits into specs/audit/:
 *   - participant-journey-coverage.csv  : one row per seeded participant (the 50) → variation → the
 *                                         journey spec that walks that variation end-to-end → edge coverage.
 *   - variation-edge-coverage.csv       : one row per variation → backbone size, config edges, edges
 *                                         covered by the generated walk-set, # paths, # seeded participants.
 *
 * HONEST FRAMING (do not let the CSV be read as more than it is):
 *   - The 50 participants are SEEDED to populate the board (realistic counts/conservation). They are not
 *     each walked individually.
 *   - Each VARIATION's full journey graph is walked by ONE representative token via its spec, and the
 *     generated walk-set covers 100% of that variation's config EDGES (every documented stage->stage
 *     transition) plus bounded loops (<=2). So coverage is EDGE-complete per variation, not an exhaustive
 *     enumeration of every participant's permutation.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const seed = require('../fixtures/seed-test-project');

const OUT_DIR = path.resolve(__dirname, '..', '..', 'specs', 'audit');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TESTRUNID = process.env.TESTRUNID || 'run1';
const { participants, plan } = seed.planSeed(TESTRUNID);

// variationname -> the spec file that walks that journey end-to-end (invariants per transition).
const SPEC_BY_VARIATION = {
  'LYL - First Cycle': 'e2e/queue/variations/lyl-first-cycle.spec.ts',
  'LYL - Next Cycle': 'e2e/queue/variations/lyl-next-cycle.spec.ts',
  'B!G - Next Cycle': 'e2e/queue/variations/big-next-cycle.spec.ts',
  'Prodigies - Next Cycle': 'e2e/queue/variations/prodigies-next-cycle.spec.ts',
  'Prodigies - First Cycle': 'e2e/queue/variations/prodigies-first-cycle.spec.ts',
  'uP! - First Cycle': 'e2e/queue/variations/up-first-cycle.spec.ts',
  'uP! - Next Cycle': 'e2e/queue/variations/up-next-cycle.spec.ts',
  'uP! - 3rd Cycle': 'e2e/queue/variations/up-3rd-cycle.spec.ts',
  'uP! - Prep Hold': 'e2e/queue/variations/up-prep-hold.spec.ts',
};
const byVar = Object.fromEntries(plan.variations.map((v) => [v.variationname, v]));

function csvCell(s) {
  const t = String(s ?? '');
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function writeCsv(file, headers, rows) {
  const body = [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, file), body);
  return rows.length;
}

// ---- participant-journey-coverage.csv (the "50 users and their paths" view) ----
const pHeaders = [
  'participant_profileid', 'email', 'variation', 'entry_stage', 'journey_stages', 'config_edges',
  'edges_covered_by_test', 'edge_coverage_pct', 'journey_walked_by_spec', 'journey_verified',
];
const pRows = participants.map((p) => {
  const v = byVar[p.variationname] || {};
  const edges = v.edgeCount || 0;
  const covered = v.covered || 0;
  const pct = edges ? Math.round((covered / edges) * 100) : 100;
  return [
    p.profileid, p.email, p.variationname, p.firststage, (v.backbone || []).length, edges, covered,
    pct + '%', SPEC_BY_VARIATION[p.variationname] || '(none)',
    // honest: the journey TYPE is walked once by a representative token; this seeded participant
    // populates the board but is not separately walked.
    'variation journey walked (representative token); participant seeded for board population',
  ];
});
const nP = writeCsv('participant-journey-coverage.csv', pHeaders, pRows);

// ---- variation-edge-coverage.csv ----
const vHeaders = [
  'variation', 'backbone_stages', 'config_edges', 'edges_covered', 'edge_coverage_pct', 'paths_generated',
  'seeded_participants', 'walked_by_spec',
];
const vRows = plan.variations.map((v) => {
  const pct = v.edgeCount ? Math.round((v.covered / v.edgeCount) * 100) : 100;
  return [
    v.variationname, (v.backbone || []).length, v.edgeCount, v.covered, pct + '%', v.paths.length,
    v.participants, SPEC_BY_VARIATION[v.variationname] || '(none)',
  ];
});
const nV = writeCsv('variation-edge-coverage.csv', vHeaders, vRows);

const totalEdges = plan.variations.reduce((a, v) => a + v.edgeCount, 0);
const totalCovered = plan.variations.reduce((a, v) => a + v.covered, 0);
console.log(`✓ specs/audit/participant-journey-coverage.csv  (${nP} participants)`);
console.log(`✓ specs/audit/variation-edge-coverage.csv       (${nV} variations)`);
console.log(`  seeded participants: ${participants.length}`);
console.log(`  config edges across all variations: ${totalCovered}/${totalEdges} covered (${Math.round((totalCovered / totalEdges) * 100)}%)`);
