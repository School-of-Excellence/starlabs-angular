# 2026-07-06 — studio step-URL: carry step on return, default to first step + sync URL

Two related fixes so the dynamic-studio `?step=` deep-link is always consistent with what's shown.

## 1. prescribe-atc → studio return carries the step
`prescribe-atc.moveToStudio()` (called after an ATC is submitted in arena mode, ~L2605) navigated to bare
`/dynamicstudio`, dropping the step — so the studio snapped to the first step instead of reopening the
prescribe stage. Changed to `/dynamicstudio?step=prescribe-atc`, mirroring the existing zoom-clientview
return URL (`zoom-clientview.component.ts` L1222). The studio reads `?step=` into `pendingDeepLinkStep`
and honours it.

(This surfaced now because the `development` merge pulled prescribe-atc changes in.)

## 2. Arriving WITHOUT a step → first step + URL updated
`dynamic-studio-v2.component.ts` `visibleSteps` getter already resolved the active step (deep-link if
valid, else `steps[0]`) and called `syncStepUrl(activeStepId)` — but only inside the
`if (signature !== lastStepSignature)` guard. So on a **re-entry** where the step list was unchanged but
the URL arrived with no `?step=`, the sync was skipped and the URL stayed bare.

Added an idempotent reinforcement AFTER the signature block:
```ts
if (this.activeStepId && this.route.snapshot.queryParamMap.get('step') !== this.activeStepId) {
  this.syncStepUrl(this.activeStepId)
}
```
Now the URL always reflects the resolved step — the first step by default when none is given.
`syncStepUrl` early-returns when `current === id`, so this no-ops on every other change-detection tick
(same safe-from-CD pattern the existing L888 call relies on). Deep-link logic is untouched, so a valid
`?step=prescribe-atc` still wins.

## Verify
`ng serve` rebuilt clean, `dynamic-studio-v2-component` chunk built, no errors. Runtime (auth-gated) not
exercised — the getter change is idempotent and reuses the established syncStepUrl mechanism.

## Revert
- `prescribe-atc.component.ts`: `"/dynamicstudio?step=prescribe-atc"` → `"/dynamicstudio"`.
- `dynamic-studio-v2.component.ts`: remove the added `if (this.activeStepId && ... !== ...) syncStepUrl`
  block after the signature block in the `visibleSteps` getter.
