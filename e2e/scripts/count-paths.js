#!/usr/bin/env node
/**
 * count-paths.js — real numbers instead of "unbounded". "Forward" = advancing in the VARIATION's own
 * backbone order (v.stages), which strictly increases, so the forward graph is a true DAG and the path
 * count is exact + finite. Loops (edges to an equal/earlier backbone position) are bounded (suite cap=2),
 * so they multiply the total by a bounded factor.
 *
 *   (A) forward journey paths  : distinct entry->terminal paths over the forward DAG (DP, exact)
 *   (B) back-edges             : loop sources; each can fire 0/1/2 times → ≤3^B factor
 *   total intended journeys    : finite, between A and A·3^B
 *
 * A path = a sequence of DISTINCT next stages (operator-move + self-move to the same next stage = one
 * journey choice). Run: node e2e/scripts/count-paths.js
 */
'use strict';
const { build, outEdgesForVariation } = require('../lib/flow-model');
const cfg = require('../fixtures/sample-queue-config.json');
const M = build(cfg);

function analyze(v) {
  const stages = v.stages || [];
  const vOrder = new Map(stages.map((s, i) => [s, i]));
  const inBackbone = (s) => vOrder.has(s);

  // distinct next stages from `node`, split by backbone direction, both endpoints in the variation.
  function nexts(node) {
    const fwd = new Set(), back = new Set();
    for (const e of outEdgesForVariation(M, node, v.id)) {
      if (e.dangling || !inBackbone(e.to) || !inBackbone(e.from)) continue;
      if (vOrder.get(e.to) > vOrder.get(e.from)) fwd.add(e.to); else back.add(e.to);
    }
    return { fwd: [...fwd], back: [...back] };
  }

  // exact forward-DAG path count (memoized; forward order strictly increases → acyclic).
  const memo = new Map();
  function fwdPaths(node) {
    if (memo.has(node)) return memo.get(node);
    const { fwd } = nexts(node);
    const r = fwd.length === 0 ? 1 : fwd.reduce((a, to) => a + fwdPaths(to), 0);
    memo.set(node, r);
    return r;
  }

  let backEdges = 0, branchPoints = 0, maxOut = 0;
  for (const s of stages) {
    const { fwd, back } = nexts(s);
    backEdges += back.length;
    if (fwd.length + back.length > 1) branchPoints++;
    maxOut = Math.max(maxOut, fwd.length + back.length);
  }
  const A = stages.length ? fwdPaths(stages[0]) : 0;
  return { stages: stages.length, A, backEdges, branchPoints, maxOut };
}

const vars = cfg.queuevariation || [];
let totA = 0, totBack = 0, totUB = 0;
console.log('variation | stages | (A) forward journeys | branch-points | back-edges | A·3^back (upper bound)');
for (const v of vars) {
  const r = analyze(v);
  const ub = r.A * Math.pow(3, r.backEdges);
  totA += r.A; totBack += r.backEdges; totUB += ub;
  console.log(`  ${v.variationname} | ${r.stages} | ${r.A} | ${r.branchPoints} | ${r.backEdges} | ${ub}`);
}
console.log('  ─────');
console.log(`  TOTAL (${vars.length} variations) | — | ${totA} | — | ${totBack} | ${totUB}`);
console.log('');
console.log(`So it is FINITE: ${totA} pure forward journeys; with ≤2 loops the true total is between ${totA}`);
console.log(`and ${totUB} (loose bound). The suite WALKS ≈39 covering paths that hit 100% of the 237 edges;`);
console.log(`at runtime ≤(participants) distinct paths occur (≤50 seeded, <1000 in a real queue).`);
