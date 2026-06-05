# Queue Flow Visualizer — implementation brief (parallel session)

> **Goal:** give queue designers a **live flow diagram inside the `queue-creation-v3` config screen** so they can *see* the queue they're building instead of holding it in their head — and immediately catch where the config diverges from the intended flow. This is a self-contained feature; it also doubles as the basis for **config-validity assertions in the e2e/CI suite** (same graph-derivation logic).
>
> **Read first:** `specs/validated/03-queue-manager.md` and `specs/queue-flow-visualizer/prototype.html` — the working, framework-free prototype this brief asks you to port.
>
> **Two phases of this feature:** this brief = the **read-only viewer** (mirror the config as a graph). The **editable** evolution — refactoring the config screen into a GUI/graph *builder* — is `specs/queue-flow-visualizer/GUI-REFACTOR-BRIEF.md`. The viewer is the low-risk first step; the editor builds on the same `build()` + data contract.

---

## 1. Why
`queue-creation-v3` is a ~1,280-line reactive form. The operator defines an ordered `stages[]`, a `stageproperty{}` block per stage, and a set of `queuevariation[]` paths. The **real flow is a variation-scoped state machine** (loops, "Send Back", changework round-trips, per-variation forks) encoded in each stage's `nextstage[]` buttons — but the form shows **none of it**. Designers guess, and config silently drifts from intent (orphan stages, dangling transition targets, a variation that can't reach a terminal). The visualizer mirrors the form as a graph, live.

## 2. The prototype (what's already built)
`specs/queue-flow-visualizer/prototype.html` — one self-contained file, **no framework, no build step** (deliberately, so the port is clean). It demonstrates everything below against a sample config:
- Directed flow graph, stages as nodes (colored by the 4 kinds), `nextstage` as labelled edges, self-loops + back-edges drawn.
- **Variation filter** (the headline interaction): click a variation chip → that variation's path glows in its hue, everything else dims. "All" shows the full machine.
- Per-stage **detail drawer** on hover/click (kind, action, studio widgets, activity-combo count, in/out degree, every out-transition with its scope, variations-through count).
- **Drift detection**: dangling `nextstage` targets (not in `stages`) → red dashed edge to a ghost "missing stage" node; orphan stages (no in & no out) → dashed warning outline; a status bar tallies both ("config ⇄ flow consistent" vs "N orphan · M dangling — flow drift").
- `window.QueueFlow.render(config)` is the single entry point; the demo buttons call it to prove live re-render.

The aesthetic (control-room schematic, dark, blueprint grid) is intentional but **not load-bearing** — keep or restyle to match the host app's theme.

## 3. The data contract (exact — validated against production)
The visualizer consumes one object. The graph-derivation (`build()` in the prototype) is the part to reuse verbatim.

```ts
interface FlowConfig {
  stages: string[];                                  // ordered stage names
  queuevariation: { id: string; variationname: string;
                    stages: string[]; }[];           // ← REQUIRED: each variation's ORDERED stage subset (its backbone)
  stageproperty: Record<string, {
    selfmovable?: boolean;                            // ← participant auto-advances on submit (drives self-move edges)
    actiontype?: 'form'|'link'|'videoask'|'evolutionmapping'|null;
    studiowidgets?: string[];                         // ATC actions → marks stage SPECIALIST
    compulsoryactivity?: Record<string,string[]>;     // activity combos → also SPECIALIST
    participantform?: string[];
    enablezoom?: boolean;
    nextstage?: { stage: string; calltoaction: string;
                  markascompleted: boolean; variations: string[]; }[]; // variations = variation ids; [] = ALL
  }>;
}
```
**Stage-kind derivation** (already in `build()`): `studiowidgets|compulsoryactivity` ⇒ **specialist**; else no-outgoing+has-incoming ⇒ **terminal**; else `actiontype` ⇒ **self-guided**; else **gate**.

### ⚠ There are TWO transition types — both must be rendered (this was the #1 mistake to avoid)
1. **Operator `nextstage`** — explicit, variation-scoped buttons (loops, branches, send-backs). Found on specialist/decision stages.
2. **Self-move / auto-advance** — a `selfmovable` form (or a gate with no `nextstage`) **advances to the next stage in *that variation's* `stages[]` order on form submission** — this move is handled in the participant app / on submit, **NOT in `nextstage`**. `build()` synthesizes these implicit edges per variation: for each consecutive `(a,b)` in `variation.stages`, if `a` has no `nextstage` button scoped to that variation, add a self-move edge `a→b`. Render them **dashed/muted** (operator buttons solid). **Without these, ~13 self-movable form stages look like false orphans** — the exact bug this section exists to prevent. (The CF `particpantFormSubmit_SlackIntegration` only does notifications/touchpoints on submit; `selfmovable` is consumed in the participant app, so the advance is the implicit linear next-in-variation-order move.)

## 4. Mapping the real `queue-creation-v3` form → `FlowConfig`
The form's value is shaped slightly differently from the saved doc — derive `FlowConfig` from the **live form value**, not from a save:
- `stages` ← `queueform.get('stages').value` (string[]). (add/remove at `queue-creation-v3.component.ts:555/562`)
- `queuevariation` ← `queueform.get('queuevariation').value` → map each to `{ id: e.docid, variationname: e.variationname, stages: e.variation }`. **The variation's ordered stage list is the form's `variation` field** (`component.ts:249` builds `variation: [data["stages"] ?? []]`) — this is the backbone the self-move edges walk; don't skip it.
- `stageproperty` ← `queueform.get('stageproperty').value` is a **FormArray** (one entry per stage, each with a `stage` field) — reduce it into the `Record<stageName, {...}>` shape. Per-stage `nextstage` is itself a **FormArray** of `{ stage, calltoaction, markascompleted, variations }` (`component.ts:306, :767`); `variations` holds **variation docids** (same ids as `queuevariation[].docid`). `[]` / empty ⇒ applies to all variations.
- Studio property names are exactly: `selfmovable`, `actiontype`, `studiowidgets`, `compulsoryactivity`, `participantform`, `enablezoom`, `nextstage` (form builder at `component.ts:290-323`; `selfmovable` at `:292`).

(For reference, on save the form flattens `stageproperty` into a name-keyed map at `component.ts:916` and `queuevariation` into a docid array at `:895` — your derived `FlowConfig` is the same information, read live.)

## 5. Angular integration plan
1. **New standalone component** `QueueFlowVisualizerComponent` (Angular 19 standalone, matches the codebase). Mount it inside `queue-creation-v3` — recommend a **resizable side panel or a "Flow" tab** next to the stepper, so it's visible while editing stage properties.
2. **Inputs / reactivity:** subscribe to `queueform.valueChanges` (debounce ~150ms) → map to `FlowConfig` (section 4) → re-render. Prefer an Angular **signal/effect** or `ChangeDetectorRef` after an out-of-zone render; the renderer manipulates an SVG + absolutely-positioned node divs (see prototype), so keep it in a `@ViewChild` canvas element and avoid `*ngFor` re-creating nodes every keystroke (render imperatively, like the prototype, for perf on 30-stage queues).
3. **Port `build()` + layout + `render()`** from the prototype into the component (or a small `QueueFlowRenderer` service — pure TS, no Angular deps, which makes it **reusable in e2e tests**). The CSS moves into the component's styles.
4. **Outputs:** `@Output() stageFocus = EventEmitter<string>()` — emit on node click (the prototype already `console.log`s the hook). The host wires this to **scroll/expand that stage's form section** in the stepper. This closes the loop: see the node → jump to its config.
5. **Two-way nicety (optional, phase 2):** clicking a stage could also open an inline editor for its `nextstage` buttons — but **phase 1 is read-only mirror**; don't gold-plate.

## 6. Validation rules (the core value — must ship in phase 1)
Surface these as blocking-ish warnings the designer can see and fix:
- **Dangling transition** — a `nextstage.stage` that isn't in `stages[]` (typo / renamed stage). Red, with the missing name.
- **Orphan stage** — a stage with no incoming and no outgoing edge **of either type** (operator `nextstage` *or* self-move). Critically, compute orphans **after** synthesizing the self-move edges — otherwise every self-movable form (≈10 per queue) false-flags. On the real 30-stage queue this correctly drops from 13 false orphans to **2 genuine ones**: a stage no variation routes through (`My Evolution Wishlist`) and a parking stage with no configured exit (`uP! Prep Process - Hold`) — both worth surfacing.
- **Per-variation reachability (add in the port, beyond the prototype):** for each variation, from its entry, can it reach a terminal using only edges scoped to it (or `all`)? Flag variations that **dead-end or loop forever** — this is the highest-value check and the #1 thing designers get wrong. (The prototype computes per-variation membership already; extend it to a reachability walk.)

## 7. Acceptance criteria
- [ ] Renders the live flow from `queueform` and updates within ~150ms of an edit, on queues up to **30 stages / 10 variations** (the real max — e.g. queue `L3rqCr…`).
- [ ] Variation filter isolates a single variation's path (nodes + edges), dims the rest.
- [ ] Dangling + orphan + variation-dead-end warnings shown, with the offending stage named.
- [ ] Clicking a node emits `stageFocus` and the host scrolls to that stage's form section.
- [ ] No `*ngFor`-per-node re-render thrash; imperative render.
- [ ] Restyled to the host theme (or keep the schematic theme if approved).

## 8. e2e / CI tie-in (why this matters beyond UX)
The pure `build()` + reachability logic (section 6) is **the config-validity oracle** for the test suite: an e2e/unit test can load any `queue generation` doc, derive the graph, and assert *no dangling targets, no orphans, every variation reaches a terminal*. Ship the renderer and the validator as **separate modules** so the validator is importable headless. This is the first concrete piece of the "config is testable" goal.

## 9. Reference anchors
- `src/app/queue system/queue-creation-v3/queue-creation-v3.component.ts` — form `:120-148`, stageproperty builder `:290-323`, `nextstage` FormArray `:306/:767`, save/flatten `:865-905` (`stageproperty` map `:916`, `queuevariation` docids `:895`).
- Prototype: `specs/queue-flow-visualizer/prototype.html` (open it; the `build()`, `render()`, `apply()` functions are the port targets).
- Domain validation: `specs/validated/02-product-modes.md` (mode engine) and the queue-manager investigation (this session) — the `nextstage{stage,calltoaction,markascompleted,variations}` schema and the variation-scoped routing are confirmed against production queues `vuvS7…` (599 ppl) and `L3rqCr…` (655 ppl, 9 variations).
