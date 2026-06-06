/**
 * path-generator.js — model-based test-path generation (the core of Phase 3).
 *
 * Given the FlowConfig + the graph from flow-model.js, produce, for EACH of the 9
 * variations, a small SET of paths that together cover:
 *   - the variation's backbone (its stages[] happy path),
 *   - every operator `nextstage` edge scoped to that variation,
 *   - every self-move / auto-advance edge,
 * with loops bounded to <=2 traversals (the config has back-edges → naive walks never
 * terminate; brute-force permutations are infinite). This is coverage, not exhaustion.
 *
 * It also produces the production-mirrored participant distribution: how many of the N
 * fake participants land in each variation (proportional to the real journey×cycle mix
 * measured in qtrace_out.json), so concurrency/surge is realistic.
 *
 * Pure: no Firebase, no I/O. The seeder and the Playwright suite both consume this.
 */
const { build, outEdgesForVariation, reachableInVariation } = require('./flow-model');

const MAX_LOOP = 2; // each edge traversed at most twice within a single path

// Real per-variation population measured from production (qtrace_out.json), keyed by
// variationname. Used only to shape the proportional distribution — never seeds real data.
const REAL_COUNTS = {
  'B!G - Next Cycle': 190,
  'uP! - First Cycle': 187,
  'uP! - Next Cycle': 120,
  'LYL - First Cycle': 48,
  'uP! - 3rd Cycle': 41,
  'LYL - Next Cycle': 26,
  'Prodigies - Next Cycle': 25,
  'Prodigies - First Cycle': 14,
  'uP! - Prep Hold': 3,
};

const edgeKey = e => `${e.from}${e.to}${e.type}`;

/**
 * Distribute `total` participants across the variations proportional to REAL_COUNTS,
 * using largest-remainder rounding, guaranteeing >=1 per variation so every variation
 * is exercised with multiple-per-variation where the proportion allows.
 * @returns {{id:string, variationname:string, count:number}[]}
 */
function distribute(cfg, total) {
  const vars = cfg.queuevariation.map(v => ({
    id: v.id, variationname: v.variationname, weight: REAL_COUNTS[v.variationname] ?? 1,
  }));
  const sumW = vars.reduce((a, v) => a + v.weight, 0);

  // floor + guarantee >=1
  let alloc = vars.map(v => ({ ...v, raw: (v.weight / sumW) * total }));
  alloc.forEach(v => { v.count = Math.max(1, Math.floor(v.raw)); });

  // reconcile to exactly `total` via largest fractional remainder (add) or smallest (remove)
  let diff = total - alloc.reduce((a, v) => a + v.count, 0);
  if (diff > 0) {
    alloc.slice().sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)))
      .slice(0, diff).forEach(v => { v.count++; });
  } else if (diff < 0) {
    alloc.slice().filter(v => v.count > 1)
      .sort((a, b) => (a.raw - Math.floor(a.raw)) - (b.raw - Math.floor(b.raw)))
      .slice(0, -diff).forEach(v => { v.count--; });
  }
  return alloc.map(({ id, variationname, count }) => ({ id, variationname, count }));
}

/** Out-edges for a variation restricted to the `allowed` coverable set (keeps the walker
 *  consistent with the edges we're actually counting/covering). */
function allowedOut(M, vid, stage, allowed) {
  return outEdgesForVariation(M, stage, vid).filter(e => allowed.has(edgeKey(e)));
}

/** BFS from `start` to the nearest stage that has an uncovered out-edge; returns the
 *  first edge to step along that shortest route (respecting the per-path loop cap). */
function stepTowardUncovered(M, vid, start, uncovered, perPath, allowed) {
  const prev = new Map(); // node -> {edge, from}
  const seen = new Set([start]);
  const q = [start];
  let goal = null;
  while (q.length) {
    const cur = q.shift();
    for (const e of allowedOut(M, vid, cur, allowed)) {
      if ((perPath[edgeKey(e)] || 0) >= MAX_LOOP) continue;
      if (!prev.has(e.to)) prev.set(e.to, { edge: e, from: cur });
      if (uncovered.has(edgeKey(e))) { goal = cur; break; }
      if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
    }
    if (goal) break;
  }
  if (goal === null) return null;
  // walk back from goal to start to find the first edge
  let node = goal, firstEdge = null;
  // goal is the node FROM which an uncovered edge leaves; route start->goal
  while (node !== start) {
    const p = prev.get(node);
    if (!p) return null;
    firstEdge = p.edge;
    node = p.from;
  }
  // if goal === start, step the uncovered edge directly
  if (firstEdge === null) {
    return allowedOut(M, vid, start, allowed)
      .find(e => uncovered.has(edgeKey(e)) && (perPath[edgeKey(e)] || 0) < MAX_LOOP) || null;
  }
  return firstEdge;
}

/** Greedy single walk from `start`, preferring uncovered edges, bounded by MAX_LOOP per edge. */
function walkOnce(M, vid, start, uncovered, allowed) {
  const steps = [];
  const perPath = {};
  let cur = start, guard = 0;
  while (guard++ < 1000) {
    const outs = allowedOut(M, vid, cur, allowed).filter(e => (perPath[edgeKey(e)] || 0) < MAX_LOOP);
    if (!outs.length) break; // terminal or capped-out
    let pick = outs.find(e => uncovered.has(edgeKey(e)))
      || stepTowardUncovered(M, vid, cur, uncovered, perPath, allowed);
    if (!pick) break; // nothing uncovered remains reachable
    perPath[edgeKey(pick)] = (perPath[edgeKey(pick)] || 0) + 1;
    uncovered.delete(edgeKey(pick));
    steps.push({
      from: pick.from, to: pick.to, type: pick.type, label: pick.label,
      selfmove: pick.type === 'selfmove', selfmovable: !!pick.selfmv, markascompleted: !!pick.done,
    });
    cur = pick.to;
  }
  return steps;
}

/**
 * Generate the covering path-set for one variation.
 * @returns {{id,variationname,backbone:string[],paths:Array,edgeCount:number,covered:number}}
 */
function generateForVariation(cfg, variationId) {
  const M = build(cfg);
  const v = cfg.queuevariation.find(x => x.id === variationId);
  if (!v) throw new Error(`unknown variation ${variationId}`);
  const start = (v.stages || [])[0];

  // Coverable edges = those scoped to this variation (explicit OR global) whose `from`
  // stage is actually REACHABLE from the variation's first stage. This bounds each
  // variation to its own drivable subgraph (so a 1-stage variation has 0 edges, not the
  // global empty-variation edges from unrelated stages).
  const reachable = reachableInVariation(M, variationId, start);
  const applicable = M.edges.filter(e =>
    !e.dangling && reachable.has(e.from) &&
    (e.variations.length === 0 || e.variations.includes(variationId)),
  );
  const allowed = new Set(applicable.map(edgeKey));
  const uncovered = new Set(allowed);
  const totalEdges = uncovered.size;

  const paths = [];
  let safety = 0;
  while (uncovered.size && safety++ < totalEdges + 5) {
    const before = uncovered.size;
    const steps = walkOnce(M, variationId, start, uncovered, allowed);
    if (steps.length === 0 || uncovered.size === before) break; // no progress
    paths.push(steps);
  }
  // single-stage variations (e.g. uP! - Prep Hold) have no edges: emit a trivial 1-node path
  if (!paths.length && start) paths.push([]);

  return {
    id: variationId, variationname: v.variationname, backbone: v.stages || [],
    paths, edgeCount: totalEdges, covered: totalEdges - uncovered.size,
  };
}

/** Generate the full plan: per-variation path-sets + the participant distribution. */
function generatePlan(cfg, totalParticipants = 50) {
  const distribution = distribute(cfg, totalParticipants);
  const variations = cfg.queuevariation.map(v => {
    const gen = generateForVariation(cfg, v.id);
    const d = distribution.find(x => x.id === v.id);
    return { ...gen, participants: d ? d.count : 0 };
  });
  return {
    totalParticipants,
    distribution,
    variations,
    summary: {
      stages: cfg.stages.length,
      variations: cfg.queuevariation.length,
      totalEdges: variations.reduce((a, v) => a + v.edgeCount, 0),
      coveredEdges: variations.reduce((a, v) => a + v.covered, 0),
      totalPaths: variations.reduce((a, v) => a + v.paths.length, 0),
    },
  };
}

module.exports = { generatePlan, generateForVariation, distribute, REAL_COUNTS, edgeKey };
