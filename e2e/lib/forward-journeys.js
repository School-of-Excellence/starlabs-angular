/**
 * forward-journeys.js — enumerate the FINITE set of distinct FORWARD journeys for a variation, so the
 * variation specs can walk ALL of them (not just a covering subset). "Forward" = advancing in the
 * variation's own backbone order (v.stages), which strictly increases, so the forward graph is a DAG and
 * the enumeration terminates. A journey = an entry->terminal sequence of stages where each step takes a
 * distinct forward next-stage (operator-move + self-move to the same next stage = one journey choice).
 *
 * This is the data source for the "walk every distinct journey" coverage (≈72 total across the 9
 * variations, ≈9 each — see e2e/scripts/count-paths.js). Loops (back-edges) are NOT enumerated here:
 * those are covered separately by each variation spec's bounded-loop (≤2) cases.
 *
 * Pure: flow-model only, no Firebase/I/O. Mirrors the classification in count-paths.js.
 */
'use strict';
const { build, outEdgesForVariation } = require('./flow-model');

/**
 * @param {object} cfg          the flow config (e2e/fixtures/sample-queue-config.json)
 * @param {string} variationId  the variation id
 * @returns {string[][]} list of journeys; each journey is a stage-name sequence entry->terminal
 */
function forwardJourneys(cfg, variationId) {
  const M = build(cfg);
  const v = (cfg.queuevariation || []).find((x) => x.id === variationId);
  const stages = (v && v.stages) || [];
  if (!stages.length) return [];
  const vOrder = new Map(stages.map((s, i) => [s, i]));
  const inBackbone = (s) => vOrder.has(s);

  function forwardNexts(node) {
    const s = new Set();
    for (const e of outEdgesForVariation(M, node, variationId)) {
      if (e.dangling || !inBackbone(e.from) || !inBackbone(e.to)) continue;
      if (vOrder.get(e.to) > vOrder.get(e.from)) s.add(e.to);
    }
    return [...s];
  }

  const journeys = [];
  (function dfs(node, path) {
    const nexts = forwardNexts(node);
    if (nexts.length === 0) { journeys.push(path); return; } // terminal
    for (const to of nexts) dfs(to, path.concat(to));
  })(stages[0], [stages[0]]);
  return journeys;
}

/** Count only (sanity/parity with count-paths.js). */
function forwardJourneyCount(cfg, variationId) {
  return forwardJourneys(cfg, variationId).length;
}

module.exports = { forwardJourneys, forwardJourneyCount };
