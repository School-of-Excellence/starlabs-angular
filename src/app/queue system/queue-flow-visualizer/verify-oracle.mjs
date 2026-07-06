/**
 * Independent verification oracle for the Queue Flow Visualizer.
 *
 * Deliberately a SEPARATE implementation from queue-flow.model.ts — it re-derives
 * the expected graph metrics straight from each raw exported `queue generation`
 * config, so agreement between this, the model, and the rendered DOM is real
 * cross-validation rather than one source echoing itself.
 *
 * Run:  node src/app/queue\ system/queue-flow-visualizer/verify-oracle.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CFG_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../assets/queue-configs',
);

/** Recompute, from scratch, what the viewer must show for one config. */
function oracle(cfg) {
  const stageSet = new Set(cfg.stages);
  const idx = new Map(cfg.stages.map((s, i) => [s, i]));

  // --- operator edges (explicit nextstage buttons) ---
  let operatorEdges = 0;
  let dangling = 0;
  const indeg = new Map(cfg.stages.map((s) => [s, 0]));
  const outdeg = new Map(cfg.stages.map((s) => [s, 0]));
  const danglingTargets = new Set();
  // adjacency keyed by "stage|variationId-or-ALL" for reachability
  const opOut = new Map(); // from -> [{to, variations}]
  for (const s of cfg.stages) {
    const buttons = cfg.stageproperty[s]?.nextstage || [];
    for (const b of buttons) {
      operatorEdges++;
      const isDangling = !stageSet.has(b.stage);
      if (isDangling) {
        dangling++;
        danglingTargets.add(b.stage);
      } else {
        outdeg.set(s, outdeg.get(s) + 1);
        indeg.set(b.stage, indeg.get(b.stage) + 1);
        (opOut.get(s) || opOut.set(s, []).get(s)).push({
          to: b.stage,
          variations: b.variations || [],
        });
      }
    }
  }

  // --- self-move edges (synthesized along each variation backbone) ---
  // De-duplicate by from|to (an edge shared by N variations is ONE edge),
  // matching the renderer which draws one path per unique self-move pair.
  const selfMoveKeys = new Map(); // "a|b" -> Set(variationId)
  for (const v of cfg.queuevariation || []) {
    const vs = (v.stages || []).filter((s) => stageSet.has(s));
    for (let i = 0; i < vs.length - 1; i++) {
      const a = vs[i];
      const b = vs[i + 1];
      const buttons = cfg.stageproperty[a]?.nextstage || [];
      const explicit = buttons.some(
        (btn) => !btn.variations || !btn.variations.length || btn.variations.includes(v.id),
      );
      if (explicit) continue;
      const key = a + '|' + b;
      if (!selfMoveKeys.has(key)) {
        selfMoveKeys.set(key, new Set());
        outdeg.set(a, outdeg.get(a) + 1);
        indeg.set(b, indeg.get(b) + 1);
      }
      selfMoveKeys.get(key).add(v.id);
    }
  }
  const selfMoveEdges = selfMoveKeys.size;

  // --- orphans: no in AND no out (after self-move synthesis) ---
  const orphans = cfg.stages.filter((s) => indeg.get(s) === 0 && outdeg.get(s) === 0);

  // --- kinds ---
  const kinds = { spec: 0, self: 0, gate: 0, term: 0 };
  const kindOf = (s) => {
    const p = cfg.stageproperty[s] || {};
    const hasWidgets = Array.isArray(p.studiowidgets) && p.studiowidgets.length > 0;
    const hasCombos =
      p.compulsoryactivity && typeof p.compulsoryactivity === 'object' &&
      Object.keys(p.compulsoryactivity).length > 0;
    if (hasWidgets || hasCombos) return 'spec';
    if (outdeg.get(s) === 0 && indeg.get(s) > 0) return 'term';
    if (p.actiontype) return 'self';
    return 'gate';
  };
  for (const s of cfg.stages) kinds[kindOf(s)]++;
  const terminals = new Set(cfg.stages.filter((s) => kindOf(s) === 'term'));

  // --- per-variation reachability ---
  // Build a combined scoped adjacency: operator edges scoped to v (or ALL) + self-move edges of v.
  const unreachable = [];
  for (const v of cfg.queuevariation || []) {
    const vs = (v.stages || []).filter((s) => stageSet.has(s));
    if (!vs.length) {
      unreachable.push({ id: v.id, name: v.variationname, reason: 'no existing stages' });
      continue;
    }
    const adj = new Map();
    const addEdge = (a, b) => (adj.get(a) || adj.set(a, []).get(a)).push(b);
    for (const [from, outs] of opOut) {
      for (const e of outs) {
        if (e.variations.length === 0 || e.variations.includes(v.id)) addEdge(from, e.to);
      }
    }
    for (const [key, vids] of selfMoveKeys) {
      if (vids.has(v.id)) {
        const [a, b] = key.split('|');
        addEdge(a, b);
      }
    }
    const entry = vs[0];
    const declaredEnd = vs[vs.length - 1];
    const seen = new Set([entry]);
    const stack = [entry];
    while (stack.length) {
      const cur = stack.pop();
      for (const nx of adj.get(cur) || []) if (!seen.has(nx)) (seen.add(nx), stack.push(nx));
    }
    const reachesTerminal = [...seen].some((s) => terminals.has(s));
    if (!seen.has(declaredEnd) && !reachesTerminal) {
      unreachable.push({ id: v.id, name: v.variationname, reason: `cannot reach "${declaredEnd}"` });
    }
  }

  return {
    stages: cfg.stages.length,
    variations: (cfg.queuevariation || []).length,
    operatorEdges,
    selfMoveEdges,
    totalEdges: operatorEdges + selfMoveEdges,
    dangling,
    danglingTargets: [...danglingTargets],
    orphans,
    unreachableVariations: unreachable,
    kinds,
  };
}

const files = readdirSync(CFG_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
const out = {};
for (const f of files.sort()) {
  const cfg = JSON.parse(readFileSync(join(CFG_DIR, f), 'utf8'));
  const r = oracle(cfg);
  out[cfg.id || f] = { queuename: cfg.queuename, ...r };
  console.log(`\n=== ${cfg.queuename} (${cfg.id}) ===`);
  console.log(
    `  stages=${r.stages}  variations=${r.variations}  edges=${r.totalEdges} (op=${r.operatorEdges}, self=${r.selfMoveEdges})`,
  );
  console.log(`  kinds: spec=${r.kinds.spec} self=${r.kinds.self} gate=${r.kinds.gate} term=${r.kinds.term}`);
  console.log(`  dangling=${r.dangling}  orphans=${r.orphans.length} ${r.orphans.length ? '→ ' + r.orphans.join(', ') : ''}`);
  console.log(
    `  unreachable variations=${r.unreachableVariations.length}` +
      (r.unreachableVariations.length ? ' → ' + r.unreachableVariations.map((u) => u.name + ' (' + u.reason + ')').join('; ') : ''),
  );
}

// Machine-readable dump for the browser-side comparison.
console.log('\n__ORACLE_JSON__' + JSON.stringify(out));
