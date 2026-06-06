/**
 * flow-model.js — the queue config graph builder + static oracle.
 *
 * This is a headless, dependency-free port of the `build()` function from
 * `specs/queue-flow-visualizer/prototype.html` (the queue-flow-visualizer).
 * It turns a FlowConfig (as produced by qexport.js → `e2e/fixtures/sample-queue-config.json`)
 * into a graph of nodes + edges, distinguishing the TWO transition types:
 *   1. operator `nextstage` edges   (a button the operator clicks on the live board)
 *   2. self-move / auto-advance edges (form submit advances to the next stage in the
 *      variation's order — lives OUTSIDE nextstage, handled in the participant app)
 *
 * Keeping this identical to the visualizer's logic means the same code is both the
 * test-path generator's source-of-truth AND the assertion oracle (see path-generator.js).
 *
 * Pure: no DOM, no Firebase, no I/O. Safe to import from Node or Playwright.
 */

/** @typedef {{stage:string, calltoaction:string, markascompleted:boolean, variations:string[]}} NextBtn */
/** @typedef {{selfmovable:boolean, actiontype:string|null, studiowidgets:string[], compulsoryactivity:object|null, participantform:string[], enablezoom:boolean, nextstage:NextBtn[]}} StageProp */
/** @typedef {{stages:string[], queuevariation:{id:string,variationname:string,stages:string[]}[], stageproperty:Record<string,StageProp>}} FlowConfig */

/**
 * Build the graph + oracle metadata from a FlowConfig.
 * Mirrors prototype.html build() exactly (orphan/dangling/back/loop classification,
 * implicit self-move edges, per-node variation membership).
 * @param {FlowConfig} cfg
 */
function build(cfg) {
  const order = {};
  cfg.stages.forEach((s, i) => { order[s] = i; });

  const nodes = cfg.stages.map((name, i) => ({
    name, i, prop: cfg.stageproperty[name] || {}, inN: 0, outN: 0, vars: new Set(),
  }));
  const nodeBy = {};
  nodes.forEach(n => { nodeBy[n.name] = n; });

  const ghosts = {};
  const edges = [];

  // --- explicit operator `nextstage` edges ---
  cfg.stages.forEach(s => {
    (cfg.stageproperty[s]?.nextstage || []).forEach(b => {
      const dangling = order[b.stage] === undefined;
      if (dangling && !ghosts[b.stage]) ghosts[b.stage] = { name: b.stage, ghost: true };
      edges.push({
        type: 'next', from: s, to: b.stage, label: b.calltoaction || '',
        done: !!b.markascompleted, variations: b.variations || [],
        loop: b.stage === s, dangling, back: !dangling && order[b.stage] < order[s],
      });
      if (!dangling) { nodeBy[s].outN++; nodeBy[b.stage].inN++; }
    });
  });

  // --- implicit self-move / auto-advance edges ---
  // A self-movable form (or a gate with no nextstage button for this variation) advances to
  // the NEXT stage in *that variation's* order on form submission. Without modelling this,
  // those stages look like false orphans.
  (cfg.queuevariation || []).forEach(v => {
    const vs = v.stages || [];
    for (let i = 0; i < vs.length - 1; i++) {
      const a = vs[i], b = vs[i + 1];
      if (order[a] === undefined || order[b] === undefined) continue;
      const ap = cfg.stageproperty[a] || {};
      const explicit = (ap.nextstage || []).some(
        btn => !btn.variations || !btn.variations.length || btn.variations.includes(v.id),
      );
      if (explicit) continue; // routed by operator buttons for this variation
      let e = edges.find(x => x.type === 'selfmove' && x.from === a && x.to === b);
      if (!e) {
        e = {
          type: 'selfmove', from: a, to: b, label: ap.selfmovable ? 'on submit' : 'advance',
          done: true, variations: [], loop: false, dangling: false, back: false,
          selfmv: !!ap.selfmovable, _v: new Set(),
        };
        edges.push(e); nodeBy[a].outN++; nodeBy[b].inN++;
      }
      e._v.add(v.id);
    }
  });
  edges.forEach(e => { if (e.type === 'selfmove') { e.variations = [...e._v]; delete e._v; } });

  // --- node kind + variation membership ---
  nodes.forEach(n => {
    const p = n.prop;
    if ((p.studiowidgets && p.studiowidgets.length) || p.compulsoryactivity) n.kind = 'spec';
    else if (n.outN === 0 && n.inN > 0) n.kind = 'term';
    else if (p.actiontype) n.kind = 'self';
    else n.kind = 'gate';
    n.selfmv = !!p.selfmovable;
    n.orphan = n.inN === 0 && n.outN === 0;
  });
  edges.forEach(e => {
    if (e.dangling) return;
    const vs = e.variations.length ? e.variations : cfg.queuevariation.map(v => v.id);
    vs.forEach(v => { nodeBy[e.from].vars.add(v); nodeBy[e.to].vars.add(v); });
  });

  return { nodes, ghosts: Object.values(ghosts), edges, order, nodeBy };
}

/**
 * Static oracle: structural integrity checks a valid queue config must pass
 * BEFORE we drive any participant through it (acceptance criterion: "assert the
 * static oracle first — no dangling/orphans; every variation reaches a terminal").
 * @param {FlowConfig} cfg
 * @returns {{ok:boolean, orphans:string[], dangling:{from:string,to:string}[], unreachableTerminals:string[], issues:string[]}}
 */
function oracle(cfg) {
  const M = build(cfg);
  const orphans = M.nodes.filter(n => n.orphan).map(n => n.name);
  const dangling = M.edges.filter(e => e.dangling).map(e => ({ from: e.from, to: e.to }));

  // Per-variation reachability: from the variation's first stage, can we reach a terminal
  // (a node with no outgoing edge within that variation)?
  const unreachableTerminals = [];
  (cfg.queuevariation || []).forEach(v => {
    const vs = v.stages || [];
    if (vs.length === 0) return;
    const reachable = reachableInVariation(M, v.id, vs[0]);
    const reachesTerminal = [...reachable].some(name => {
      const out = outEdgesForVariation(M, name, v.id);
      return out.length === 0; // terminal within this variation
    });
    if (!reachesTerminal && vs.length > 1) unreachableTerminals.push(v.variationname || v.id);
  });

  const issues = [];
  if (orphans.length) issues.push(`${orphans.length} orphan stage(s): ${orphans.join(', ')}`);
  if (dangling.length) issues.push(`${dangling.length} dangling edge(s): ${dangling.map(d => `${d.from}→${d.to}`).join(', ')}`);
  if (unreachableTerminals.length) issues.push(`variation(s) with no reachable terminal: ${unreachableTerminals.join(', ')}`);

  return { ok: issues.length === 0, orphans, dangling, unreachableTerminals, issues };
}

/** Edges leaving `stage` that apply to `variationId` (operator edges scoped to the variation + self-moves). */
function outEdgesForVariation(M, stage, variationId) {
  return M.edges.filter(e =>
    e.from === stage && !e.dangling &&
    (e.variations.length === 0 || e.variations.includes(variationId)),
  );
}

/** BFS of all stages reachable from `start` within a single variation. */
function reachableInVariation(M, variationId, start) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const e of outEdgesForVariation(M, cur, variationId)) {
      if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
    }
  }
  return seen;
}

module.exports = { build, oracle, outEdgesForVariation, reachableInVariation };
