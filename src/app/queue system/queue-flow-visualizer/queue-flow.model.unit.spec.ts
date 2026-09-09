// queue-flow.model.unit.spec.ts — unit tests for the queue flow derivation + validation model.
//
// WHY UNIT: this module is framework-free by design and its own header names three consumers — the viewer
// component, the e2e/CI config-validity ORACLE, and a future GUI builder. The e2e suite already leans on it
// to decide whether a queue config is valid, so a silent change here would move the goalposts the queue
// gates measure against. It had no direct tests; `oracle-selftest.spec.ts` exercises the hub's own copy of
// the flow model, not this one.
//
// Two behaviours below are DELIBERATE CORRECTIONS over the prototype the module was ported from, both
// documented in its header. Those are pinned explicitly (OPU-03), because a "fix" that gets reverted by
// someone porting the prototype again would be invisible otherwise.
import {
  FlowConfig,
  buildFlow,
  summarize,
  validateFlow,
} from './queue-flow.model';

/** Minimal config builder — stages in order, properties keyed by stage, variations optional. */
const cfg = (over: Partial<FlowConfig> = {}): FlowConfig => ({
  stages: [],
  queuevariation: [],
  stageproperty: {},
  ...over,
});

const btn = (stage: string, over: Partial<{ calltoaction: string; markascompleted: boolean; variations: string[] }> = {}) => ({
  stage,
  calltoaction: over.calltoaction ?? 'Go',
  markascompleted: over.markascompleted ?? false,
  variations: over.variations ?? [],
});

/** A -> B -> C with one variation walking all three. */
const LINEAR = (): FlowConfig => cfg({
  stages: ['A', 'B', 'C'],
  queuevariation: [{ id: 'v1', variationname: 'V1', stages: ['A', 'B', 'C'] }],
  stageproperty: {},
});

describe('queue-flow.model', () => {
  // =============================================================================================
  // OPU-01 — operator nextstage buttons become explicit edges
  // =============================================================================================
  describe('OPU-01 operator edges', () => {
    it('creates one edge per nextstage button, carrying its call to action', () => {
      const m = buildFlow(cfg({
        stages: ['A', 'B'],
        stageproperty: { A: { nextstage: [btn('B', { calltoaction: 'Send to B' })] } },
      }));
      const e = m.edges.filter((x) => x.type === 'next');
      expect(e.length).toBe(1);
      expect(e[0].from).toBe('A');
      expect(e[0].to).toBe('B');
      expect(e[0].label).toBe('Send to B');
    });

    it('counts in/out degree only for edges that land somewhere real', () => {
      const m = buildFlow(cfg({
        stages: ['A', 'B'],
        stageproperty: { A: { nextstage: [btn('B'), btn('Nowhere')] } },
      }));
      expect(m.nodeBy['A'].outN).toBe(1);   // the dangling button must NOT inflate the degree
      expect(m.nodeBy['B'].inN).toBe(1);
    });

    it('flags a target that is not a declared stage as dangling, and ghosts it', () => {
      const m = buildFlow(cfg({
        stages: ['A'],
        stageproperty: { A: { nextstage: [btn('Typo Stage')] } },
      }));
      expect(m.edges[0].dangling).toBeTrue();
      expect(m.ghosts.map((g) => g.name)).toEqual(['Typo Stage']);
    });

    it('ghosts a missing target only once even when several buttons point at it', () => {
      const m = buildFlow(cfg({
        stages: ['A', 'B'],
        stageproperty: { A: { nextstage: [btn('Gone')] }, B: { nextstage: [btn('Gone')] } },
      }));
      expect(m.ghosts.length).toBe(1);
    });

    it('marks a self-pointing button as a loop', () => {
      const m = buildFlow(cfg({ stages: ['A'], stageproperty: { A: { nextstage: [btn('A')] } } }));
      expect(m.edges[0].loop).toBeTrue();
    });

    it('marks an edge to an earlier stage as a back edge', () => {
      const m = buildFlow(cfg({
        stages: ['A', 'B'],
        stageproperty: { B: { nextstage: [btn('A')] } },
      }));
      expect(m.edges[0].back).toBeTrue();
    });

    it('never marks a dangling edge as a back edge', () => {
      // order[to] is undefined; comparing it would produce a meaningless NaN comparison.
      const m = buildFlow(cfg({ stages: ['A'], stageproperty: { A: { nextstage: [btn('Ghost')] } } }));
      expect(m.edges[0].back).toBeFalse();
    });

    it('carries markascompleted through as done', () => {
      const m = buildFlow(cfg({
        stages: ['A', 'B'],
        stageproperty: { A: { nextstage: [btn('B', { markascompleted: true })] } },
      }));
      expect(m.edges[0].done).toBeTrue();
    });
  });

  // =============================================================================================
  // OPU-02 — implicit self-move synthesis along each variation's backbone
  // =============================================================================================
  describe('OPU-02 self-move edges', () => {
    it('synthesises an edge between consecutive backbone stages', () => {
      const m = buildFlow(LINEAR());
      const self = m.edges.filter((e) => e.type === 'selfmove');
      expect(self.map((e) => `${e.from}->${e.to}`)).toEqual(['A->B', 'B->C']);
    });

    it('labels a selfmovable source "on submit" and anything else "advance"', () => {
      const c = LINEAR();
      c.stageproperty = { A: { selfmovable: true } };
      const m = buildFlow(c);
      const ab = m.edges.find((e) => e.type === 'selfmove' && e.from === 'A')!;
      const bc = m.edges.find((e) => e.type === 'selfmove' && e.from === 'B')!;
      expect(ab.label).toBe('on submit');
      expect(ab.selfmv).toBeTrue();
      expect(bc.label).toBe('advance');
      expect(bc.selfmv).toBeFalse();
    });

    it('does NOT synthesise where an operator button already routes that variation', () => {
      const c = LINEAR();
      c.stageproperty = { A: { nextstage: [btn('B')] } };
      const m = buildFlow(c);
      expect(m.edges.some((e) => e.type === 'selfmove' && e.from === 'A')).toBeFalse();
      expect(m.edges.some((e) => e.type === 'selfmove' && e.from === 'B')).toBeTrue();
    });

    it('treats a button scoped to ANOTHER variation as not routing this one', () => {
      const c = cfg({
        stages: ['A', 'B'],
        queuevariation: [
          { id: 'v1', variationname: 'V1', stages: ['A', 'B'] },
          { id: 'v2', variationname: 'V2', stages: ['A', 'B'] },
        ],
        stageproperty: { A: { nextstage: [btn('B', { variations: ['v2'] })] } },
      });
      const m = buildFlow(c);
      const self = m.edges.find((e) => e.type === 'selfmove' && e.from === 'A');
      expect(self).toBeDefined();
      expect(self!.variations).toEqual(['v1']);   // synthesised for v1 only
    });

    it('merges one self-move edge across variations that share the hop', () => {
      const c = cfg({
        stages: ['A', 'B'],
        queuevariation: [
          { id: 'v1', variationname: 'V1', stages: ['A', 'B'] },
          { id: 'v2', variationname: 'V2', stages: ['A', 'B'] },
        ],
      });
      const m = buildFlow(c);
      const self = m.edges.filter((e) => e.type === 'selfmove');
      expect(self.length).toBe(1);
      expect(self[0].variations.sort()).toEqual(['v1', 'v2']);
      expect(m.nodeBy['A'].outN).toBe(1);   // degree counted once, not per variation
    });

    it('skips backbone stages that are not declared in stages[]', () => {
      const c = cfg({
        stages: ['A', 'B'],
        queuevariation: [{ id: 'v1', variationname: 'V1', stages: ['A', 'Missing', 'B'] }],
      });
      const m = buildFlow(c);
      expect(m.edges.filter((e) => e.type === 'selfmove').length).toBe(0);
    });
  });

  // =============================================================================================
  // OPU-03 — stage kinds, including the two documented corrections over the prototype
  // =============================================================================================
  describe('OPU-03 stage kind derivation', () => {
    it('is specialist when studio widgets are present', () => {
      const m = buildFlow(cfg({ stages: ['A'], stageproperty: { A: { studiowidgets: ['w1'] } } }));
      expect(m.nodeBy['A'].kind).toBe('spec');
    });

    it('is specialist when compulsoryactivity defines at least one combo', () => {
      const m = buildFlow(cfg({
        stages: ['A'],
        stageproperty: { A: { compulsoryactivity: { '0': ['act'] } } },
      }));
      expect(m.nodeBy['A'].kind).toBe('spec');
    });

    it('is NOT specialist for an EMPTY compulsoryactivity {} — the ported prototype bug', () => {
      // The prototype's `|| p.compulsoryactivity` mis-flagged every `{}` stage as specialist, because {} is
      // truthy. The brief's rule is NON-EMPTY combos ⇒ specialist. If this ever goes red, the prototype's
      // bug has been reintroduced and every `{}` stage is silently mis-rendered as a studio stage.
      const m = buildFlow(cfg({ stages: ['A'], stageproperty: { A: { compulsoryactivity: {} } } }));
      expect(m.nodeBy['A'].kind).not.toBe('spec');
    });

    it('treats a null compulsoryactivity as no combos', () => {
      const m = buildFlow(cfg({ stages: ['A'], stageproperty: { A: { compulsoryactivity: null } } }));
      expect(m.nodeBy['A'].kind).not.toBe('spec');
    });

    it('is terminal when something arrives and nothing leaves', () => {
      const m = buildFlow(cfg({
        stages: ['A', 'B'],
        stageproperty: { A: { nextstage: [btn('B')] } },
      }));
      expect(m.nodeBy['B'].kind).toBe('term');
    });

    it('is a self stage when it has an actiontype but is not terminal or specialist', () => {
      const c = LINEAR();
      c.stageproperty = { A: { actiontype: 'form' } };
      expect(buildFlow(c).nodeBy['A'].kind).toBe('self');
    });

    it('is a gate by default', () => {
      expect(buildFlow(LINEAR()).nodeBy['A'].kind).toBe('gate');
    });

    it('ranks specialist above terminal when a stage qualifies for both', () => {
      const m = buildFlow(cfg({
        stages: ['A', 'B'],
        stageproperty: { A: { nextstage: [btn('B')] }, B: { studiowidgets: ['w'] } },
      }));
      expect(m.nodeBy['B'].kind).toBe('spec');
    });
  });

  // =============================================================================================
  // OPU-04 — orphans are computed AFTER self-move synthesis
  // =============================================================================================
  describe('OPU-04 orphan detection', () => {
    it('flags a stage with no edges at all', () => {
      const m = buildFlow(cfg({ stages: ['A', 'Lonely', 'B'], stageproperty: { A: { nextstage: [btn('B')] } } }));
      expect(m.nodeBy['Lonely'].orphan).toBeTrue();
    });

    it('does NOT flag a self-movable form reached only by a synthesised edge', () => {
      // The whole reason synthesis runs before orphan detection: without it, every selfmovable form on a
      // variation backbone would report as an orphan and the config would look broken.
      const c = LINEAR();
      c.stageproperty = { B: { selfmovable: true, actiontype: 'form' } };
      expect(buildFlow(c).nodeBy['B'].orphan).toBeFalse();
    });

    it('flags a stage whose only edge is dangling', () => {
      const m = buildFlow(cfg({ stages: ['A'], stageproperty: { A: { nextstage: [btn('Ghost')] } } }));
      expect(m.nodeBy['A'].orphan).toBeTrue();
    });
  });

  // =============================================================================================
  // OPU-05 — variation membership per node
  // =============================================================================================
  describe('OPU-05 node variation membership', () => {
    it('treats an operator edge with no variations as belonging to ALL of them', () => {
      const c = cfg({
        stages: ['A', 'B'],
        queuevariation: [
          { id: 'v1', variationname: 'V1', stages: ['A', 'B'] },
          { id: 'v2', variationname: 'V2', stages: ['A', 'B'] },
        ],
        stageproperty: { A: { nextstage: [btn('B', { variations: [] })] } },
      });
      const m = buildFlow(c);
      expect([...m.nodeBy['A'].vars].sort()).toEqual(['v1', 'v2']);
    });

    it('scopes membership to the named variation when a button is scoped', () => {
      const c = cfg({
        stages: ['A', 'B'],
        queuevariation: [{ id: 'v1', variationname: 'V1', stages: [] }, { id: 'v2', variationname: 'V2', stages: [] }],
        stageproperty: { A: { nextstage: [btn('B', { variations: ['v2'] })] } },
      });
      expect([...buildFlow(c).nodeBy['A'].vars]).toEqual(['v2']);
    });

    it('never counts a dangling edge towards membership', () => {
      const c = cfg({
        stages: ['A'],
        queuevariation: [{ id: 'v1', variationname: 'V1', stages: ['A'] }],
        stageproperty: { A: { nextstage: [btn('Ghost')] } },
      });
      expect(buildFlow(c).nodeBy['A'].vars.size).toBe(0);
    });
  });

  // =============================================================================================
  // OPU-06 — validateFlow, the config-validity oracle
  // =============================================================================================
  describe('OPU-06 validateFlow', () => {
    it('passes a clean linear config', () => {
      const r = validateFlow(LINEAR());
      expect(r.ok).toBeTrue();
      expect(r.dangling).toEqual([]);
      expect(r.orphans).toEqual([]);
      expect(r.unreachableVariations).toEqual([]);
    });

    it('reports dangling targets with both ends', () => {
      const r = validateFlow(cfg({ stages: ['A'], stageproperty: { A: { nextstage: [btn('Ghost')] } } }));
      expect(r.dangling).toEqual([{ from: 'A', to: 'Ghost' }]);
      expect(r.ok).toBeFalse();
    });

    it('reports orphan stages by name', () => {
      const c = LINEAR();
      c.stages = ['A', 'B', 'C', 'Island'];
      expect(validateFlow(c).orphans).toEqual(['Island']);
    });

    it('reports a variation whose stages do not exist at all', () => {
      const c = cfg({
        stages: ['A'],
        queuevariation: [{ id: 'v9', variationname: 'Ghost Variation', stages: ['Nope'] }],
      });
      const r = validateFlow(c);
      expect(r.unreachableVariations.length).toBe(1);
      expect(r.unreachableVariations[0].reason).toContain('no stages that exist');
    });

    it('reports a variation that cannot reach its declared final stage', () => {
      // A and B are wired, C is declared in the backbone but nothing routes into it from A.
      const c = cfg({
        stages: ['A', 'B', 'C'],
        queuevariation: [{ id: 'v1', variationname: 'V1', stages: ['A', 'C'] }],
        stageproperty: { A: { nextstage: [btn('B')] }, B: { nextstage: [btn('A')] } },
      });
      const r = validateFlow(c);
      expect(r.unreachableVariations.length).toBe(1);
      expect(r.unreachableVariations[0].unreachableStages).toContain('C');
      expect(r.ok).toBeFalse();
    });

    it('accepts a variation that reaches a global terminal even if not its declared end', () => {
      const c = cfg({
        stages: ['A', 'B'],
        queuevariation: [{ id: 'v1', variationname: 'V1', stages: ['A', 'B'] }],
        stageproperty: { A: { nextstage: [btn('B')] } },
      });
      expect(validateFlow(c).unreachableVariations).toEqual([]);
    });

    it('reuses a supplied model rather than rebuilding it', () => {
      const c = LINEAR();
      const model = buildFlow(c);
      expect(validateFlow(c, model)).toEqual(validateFlow(c));
    });

    it('is ok only when all three checks are clean', () => {
      const c = LINEAR();
      c.stages = [...c.stages, 'Island'];
      expect(validateFlow(c).ok).toBeFalse();   // orphan alone is enough to fail
    });
  });

  // =============================================================================================
  // OPU-07 — summarize, used by the status bar and the headless oracle
  // =============================================================================================
  describe('OPU-07 summarize', () => {
    it('counts stages, variations and both edge types', () => {
      const c = LINEAR();
      c.stageproperty = { A: { nextstage: [btn('B')] } };
      const s = summarize(c);
      expect(s.stages).toBe(3);
      expect(s.variations).toBe(1);
      expect(s.operatorEdges).toBe(1);
      expect(s.selfMoveEdges).toBe(1);          // B->C only; A->B is routed by the button
      expect(s.totalEdges).toBe(2);
    });

    it('tallies every stage into exactly one kind', () => {
      const s = summarize(LINEAR());
      const total = s.kinds.spec + s.kinds.self + s.kinds.gate + s.kinds.term;
      expect(total).toBe(s.stages);
    });

    it('surfaces the validation counts alongside the metrics', () => {
      const c = LINEAR();
      c.stages = [...c.stages, 'Island'];
      c.stageproperty = { A: { nextstage: [btn('Ghost')] } };
      const s = summarize(c);
      expect(s.dangling).toBe(1);

      // TWO orphans, not one — and the second is the interesting one. 'Island' is orphaned for the obvious
      // reason (no edges at all). 'A' is orphaned because its button COUNTS AS EXPLICIT ROUTING for v1
      // (synthesis at model:163-166 only checks that a button is scoped to the variation, not that its
      // target exists), so the implicit A->B advance is suppressed — while the button itself dangles and
      // contributes no degree. A single typo'd nextstage target therefore both breaks the link AND silently
      // strands its source stage. Pinned deliberately: this is real, non-obvious behaviour of the oracle.
      expect(s.orphans).toBe(2);
    });

    it('a dangling button suppresses the self-move that would otherwise route its variation', () => {
      // The mechanism behind the two orphans above, isolated.
      const c = LINEAR();
      c.stageproperty = { A: { nextstage: [btn('Ghost')] } };
      const m = buildFlow(c);
      expect(m.edges.some((e) => e.type === 'selfmove' && e.from === 'A')).toBeFalse();
      expect(m.nodeBy['A'].orphan).toBeTrue();
    });
  });
});
