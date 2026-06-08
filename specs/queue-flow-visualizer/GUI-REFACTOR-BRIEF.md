# Prompt — GUI-based refactor of `queue-creation-v3` (the visual queue builder)

> Paste to a fresh session in the `starlabs-angular` folder. This is the **editor** evolution of the read-only viewer in `BRIEF.md` — same model, same rendering, but now the **graph is how you build the queue**.

---

Refactor the queue **configuration screen** (`src/app/queue system/queue-creation-v3/`) from a large blind reactive form into a **GUI / graph-based queue builder**, reusing the flow-visualizer we already built. The designer should **construct the flow visually** — and the `queue generation` config is *generated from the graph*, so config and flow can never drift (the whole reason this exists).

## Why
Today the operator fills a ~1,280-line reactive form and can't see the flow they're building → orphan stages, dangling transitions, variations that dead-end. We already built a **read-only visualizer** (`specs/queue-flow-visualizer/prototype.html`, ported per `BRIEF.md`). **This task makes that graph editable** and promotes it to the primary authoring surface.

## Build on (don't start from scratch)
- `specs/queue-flow-visualizer/prototype.html` — the `build()` (config→graph), the SVG/node `render()`, the variation filter, and the **validation oracle** (dangling / orphan, with self-move synthesis). Reuse all of it; make the nodes/edges interactive.
- `specs/queue-flow-visualizer/BRIEF.md` — the **data contract + the exact form↔`FlowConfig` mapping** (esp. §4: `stageproperty` FormArray, `nextstage` FormArray, `queuevariation[].variation` = stage list, `selfmovable` at `component.ts:292`). The editor writes back into these same form structures.
- `specs/validated/03-queue-manager.md` — the model: **two transition types** (operator `nextstage` + self-move/auto-advance), variation = journey-family × cycle, the studio/ATC `studiowidgets`, `compulsoryactivity`.

## 🔒 The non-negotiable safety gate — round-trip parity
The `queue generation` document schema is consumed by the **deployed cloud functions** (`queuesystem.js`), the **live board** (`dynamic-queue-manager-clone`), and the **participant app** (`queue-web`). The refactor **must not change that schema.**
- **Load** any existing `queue generation` doc → render as an editable graph.
- **Save** → produce a `queue generation` doc that is **structurally identical** to what the current form produces (`stages[]`, `stageproperty{}` map keyed by name, `queuevariation[]` of docids, `studiostagegrouping`, etc.).
- **Prove it:** a round-trip test — load N real-shaped configs (e.g. the `L3rqCr` export via `qexport.js`), render, save with no edits, assert **deep-equal** to the original. This parity test is the gate before any UX polish.

## Core UX (the visual builder)
1. **Canvas of stage nodes** — add a stage, rename, delete, reorder (reorder = reorder `stages[]`). Nodes colored by kind (specialist / self-guided / gate / terminal), as in the prototype.
2. **Draw operator transitions** — drag from one node to another to create a `nextstage` button; inline-edit its `calltoaction` (label), `markascompleted` (✓), and **which variations it's scoped to** (chips). This replaces hand-editing the `nextstage` FormArray.
3. **Self-move backbone is implicit** — per variation, consecutive stages with no operator button auto-advance on submit; render these (dashed) and let the designer toggle `selfmovable`, but don't make them draw it manually.
4. **Node inspector** (side panel) — per-stage config: `actiontype`/`actionresource`, `participantform`, `studiowidgets`, `compulsoryactivity`, `enablezoom`, `checkfinance`, messages, waiting-minutes, `studiostagegrouping`. **Reuse the existing reactive-form controls** from `queue-creation-v3` here — don't rewrite them; just reorganize them around the selected node (the form's per-stage `FormGroup` IS the inspector's model).
5. **Variation manager** — create/name variations (journey-family × cycle), and for each pick its **ordered stage subset** (its path); operator transitions scope to variations from here too.
6. **Live validation (the oracle, inline)** — as the designer edits, flag dangling targets, orphan stages, and **per-variation reachability** (does every variation reach a terminal?). Surface at the offending node, not just a summary. This is the payoff: mistakes are visible *while building*.
7. **Two-way with the form (transition strategy)** — keep the existing reactive form as the single source of truth under the hood; the canvas reads from and writes to it (graph edits → `queueform` patches → graph re-renders). This guarantees parity and lets you ship incrementally (graph + form coexist, then the form recedes to the inspector).

## Tech
- Angular 19 **standalone** component(s), matching the codebase. Reuse the prototype's `build()`/layout/render (port to TS; it's framework-free by design). Imperative SVG + positioned node DOM (no `*ngFor`-per-node thrash on 30-stage queues).
- Graph editing: extend the prototype's renderer with drag-to-connect + node drag/reorder, or a light lib if justified — but the **data flows through `queueform`**, not a separate state.
- The validator/`build()` is shared with the read-only viewer **and** the e2e oracle (`specs/TEST-ENVIRONMENT-PROMPT.md`) — extract it as one module.

## Phasing
1. **Round-trip parity** — load existing config → editable graph + node inspector (reusing form controls) → save deep-equal. Ship behind a flag next to the current form.
2. **Draw transitions + variation scoping** on the canvas (the `nextstage` editing).
3. **Variation builder + inline live validation + self-move backbone**; then recede the raw form to the inspector.

## Guardrails
- **Never change the `queue generation` schema** (CF + live board + queue-web depend on it) — parity test is mandatory.
- The real screen is **`queue-creation-v3`** (not a clone). The live board is `dynamic-queue-manager-clone` (don't confuse).
- **ATC excluded** — `studiowidgets` that are ATC actions are just config values to set; don't pull in `src/app/ATC/**`.
- Backward-compatible: existing queues must load and edit losslessly.

## Acceptance criteria
- [ ] Round-trip deep-equal parity on real-shaped configs (incl. `L3rqCr`).
- [ ] Build a queue end-to-end on the canvas (stages + transitions + variations + per-stage config) → saved doc runs unchanged through the CF + live board.
- [ ] Drawing a transition / toggling self-move updates the flow live; dangling/orphan/unreachable flagged inline.
- [ ] Existing reactive-form logic reused (inspector), not duplicated.
- [ ] The `build()`+validator is a shared module (viewer, editor, e2e oracle).
