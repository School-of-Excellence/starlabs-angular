# Queue Flow Visualizer (Phase 1 — read-only viewer)

Live flow diagram for a queue config (`specs/queue-flow-visualizer/BRIEF.md`). Mirrors the
`queue-creation-v3` form as a variation-scoped state machine and surfaces config↔flow drift.

## Modules
| File | Role |
| --- | --- |
| `queue-flow.model.ts` | **Pure, framework-free** graph derivation + validation. `buildFlow()` (operator + synthesized self-move edges, stage kinds, orphans), `validateFlow()` (dangling / orphan / per-variation reachability), `summarize()`. Importable headless → this is the e2e/CI config-validity oracle (brief §8). |
| `queue-form-mapping.ts` | `formValueToFlowConfig()` — maps the live `queue-creation-v3` form value (FormArrays) → `FlowConfig` (brief §4). |
| `queue-flow-visualizer.component.ts` | Standalone Angular 19 component. Imperative SVG + node render (no `*ngFor`-per-node thrash), variation filter, detail drawer, status bar + warnings. `@Input() config`, `@Output() stageFocus`. |
| `queue-flow-demo.component.ts` | Demo/verification harness at **`/queue-flow`** (unguarded). Loads real exported configs from `assets/queue-configs`. |
| `verify-oracle.mjs` | **Independent** re-implementation of the metrics (NOT importing the model) — cross-check. |

Mounted in the real screen: `queue-creation-v3` has a **Show Flow** toggle that mirrors the live form (debounced 150ms).

## Navigation / usability
**Layout:** the canvas owns ~90% of the window. A single slim toolbar sits on top; the variation
rail, stats, drift report, zoom, and detail all **float as overlays** over the canvas. The `/queue-flow`
demo route renders chrome-free (added to `app.component.html`'s shell-bypass list) and full-bleed.

The canvas is a pan/zoom viewport (a 40-stage queue is ~7000px wide), so it's actually navigable:
- **Fit-to-view** on load — the whole graph at once; `F` to re-fit, `0` to reset, `+`/`-` to zoom, HUD cluster bottom-right.
- **Drag to pan**, **⌘/ctrl-scroll to zoom** (toward cursor), plain scroll to pan.
- **Stage search** (header, `/` to focus) → centers + pulses the stage and opens its drawer.
- **Drift report rows are clickable** → locate the offending stage (or activate + jump for an unreachable variation).
- **Active-filter tag** (top-left) with one-click clear; `Esc` clears filter + pin + search.
- Detail drawer pins on click (✕ to close), hover-previews otherwise; node click also emits `stageFocus`.

Type system: **Chakra Petch** (display HUD) / **JetBrains Mono** (data) / **Outfit** (body), loaded via `index.html`.

## Two transition types (the #1 thing to get right)
1. **Operator `nextstage`** — explicit variation-scoped buttons (solid edges).
2. **Self-move / auto-advance** — synthesized per variation along its `stages[]` backbone where no
   operator button is scoped (dashed edges). Without these, self-movable forms look like false orphans.

> Deviation from the prototype: an empty `compulsoryactivity {}` is **not** treated as a combo
> (the prototype's `||p.compulsoryactivity` mis-colored every `{}` stage as specialist). Brief §3 rule:
> non-empty combos ⇒ specialist.

## Verification (3-way agreement, all 6 configs)
`raw config → independent oracle (verify-oracle.mjs) → TS model (summarize) → rendered DOM` all agree.

```
node "src/app/queue system/queue-flow-visualizer/verify-oracle.mjs"
```

| queue | stages | op | self | orphans | dangling | unreach |
| --- | --- | --- | --- | --- | --- | --- |
| L3rqCr (Diagnostics & Consultation) | 30 | 34 | 19 | 2¹ | 0 | 0 |
| vuvS7 (A&H Evolution Prep) | 14 | 5 | 17 | 1 | 0 | 1² |
| BhQgc9 (Evolution Prep) | 18 | 4 | 20 | 0 | 0 | 0 |
| lWbXqj (Diagnostics Jul'24) | 28 | 16 | 20 | 1 | 0 | 0 |
| XI0RA (Legacy Consultations) | 40 | **0** | 47 | **0**³ | 0 | 0 |
| DRIFT-demo (synthetic) | 30 | 36 | 19 | 2 | **2** | 0 |

¹ Exactly the 2 genuine orphans the brief §6 predicted (`My Evolution Wishlist`, `uP! Prep Process - Hold`) — self-move synthesis drops 13 false orphans to 2 real ones.
² Real drift: variation `Scope Enhancement Changework` cannot reach `Completed`.
³ 40 stages, **zero** operator transitions, yet 0 orphans — the pure self-move backbone case. Without synthesis this would false-flag 40 orphans.

Screenshot evidence captured for L3rqCr (overview + variation filter + drawer/stageFocus), vuvS7, XI0RA, and the drift demo.

## Data
`assets/queue-configs/*.json` are real `queue generation` docs exported from production via the validated
`qexport` mapping (`specs/journals/2026-06-05-queue-manager-artifacts/qexport.js`). `DRIFT-demo.json` is a
synthetic clone of L3rqCr with two dangling `nextstage` targets injected, to exercise the ghost-node path.
