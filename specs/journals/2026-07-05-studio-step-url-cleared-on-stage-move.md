# 2026-07-05 — dynamic-studio-v2: clear the `?step=` URL when the live session ends

Operator: when you move the participant to the next/previous stage, the URL isn't updated — it stays on
the old `?step=<id>` (e.g. `/dynamicstudio?step=prescribe-atc`).

Working-tree only (ds-v2.ts has prior WIP; not committed). TS-only in dynamic-studio-v2.

## Root cause
The active session step is mirrored to the URL via `syncStepUrl(activeStepId)` (`?step=<id>`). When the
participant is moved to another stage / sent back / the studio closes, `liveAssignment` becomes null and
`activeStepId` resets to `''`. But `syncStepUrl` began with `if (!id) return` — so on an empty id it
no-op'd and left the stale `?step=` in the URL. Worse, once the live view is `*ngIf`'d out, the
`visibleSteps` getter (which drives the re-sync) may not run at all, so nothing cleared it.

## Fix (dynamic-studio-v2.component.ts)
1. `syncStepUrl(id)` now, when `id` is falsy, REMOVES the `step` query param
   (`navigate({ queryParams: { step: null }, queryParamsHandling: 'merge', replaceUrl: true })`) — still
   idempotent (only navigates if a param is present).
2. Explicitly reset `activeStepId = ''` + `syncStepUrl('')` at the session-end chokepoints so it clears
   regardless of whether the getter runs:
   - the live-assignment subscription's `else` branch (async path after Move Next Stage / Send back —
     assignment leaves the live query, `liveAssignment = null`),
   - `closeStudio()` (the markascompleted moveStage branch),
   - `backToStudios()` (leaving the studio for the lobby).

Deep-link still works: on a fresh `?step=X` load the intent is captured in `pendingDeepLinkStep` (memory)
before any clear, and re-applied (re-writing the URL) once the live assignment loads — so at worst a brief
param flicker, correct end state.

## Verification
- Build GREEN (dynamic-studio-v2 chunk recompiles, warnings only; the parallel zoom-clientview /
  web-studio-invitation errors were fixed, so the whole build is clean now).
- Not driven end-to-end (auth-gated, needs a live session). Operator to confirm: enter a studio (URL gets
  `?step=...`), Move Next Stage / Send back to Waiting — the `?step=` should disappear.

## Revert
Restore `syncStepUrl`'s `if (!id) return`, and remove the `activeStepId=''; syncStepUrl('')` lines added
to the subscription else-branch, `closeStudio()`, and `backToStudios()`.
