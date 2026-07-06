# Plan — Gate the Dynamic Studio v2 "Use AI-Generated ATC" button to configured users

**Date:** 2026-07-05 · **Component:** `src/app/queue system/dynamic-studio-v2/` · **Status:** implemented (uncommitted)

## Goal
The AI-ATC button in Dynamic Studio v2 (route `dynamicstudio`) must show only to a
controlled, admin-configurable set of specialists — not everyone, not a whole role.

## Decision
- **Mechanism:** admin-editable Firestore config doc + allowlist (chosen over role-only /
  hybrid). "People we configure" = a named, changeable pilot set → needs live edits without
  redeploy. Reuses the app's existing `dashboard`-collection allowlist precedent.
- **Managed via:** Firestore console (no admin UI built yet).
- **Gate subject:** the logged-in **specialist** (button-clicker), not the participant.

## Config doc (default DB — `classify` collection, the app's config convention)
`classify/queue-atc-edit-config`:
```jsonc
{
  "enabled": true,                       // master on/off for the whole feature (off => nobody)
  "global": false,                       // true => enabled for EVERYONE (allowlist ignored)
  "allowedProfileIds": ["<pid>", ...],   // used when global=false: specialists allowed (this.profileid)
  "allowedEmails": ["coach@…", ...],     // optional human-friendly alt key
  "allowAllForRoles": ["developer"]      // optional role bypass
}
```
Access = `aiAtcFeatureEnabled` (code kill-switch) AND `cfg.enabled` AND
( `cfg.global === true`  OR  profileid ∈ allowedProfileIds OR email ∈ allowedEmails OR any role ∈ allowAllForRoles ).
Two modes: **global** (`global:true` → everyone) and **allowed-users** (`global:false` → allowlist only).
**Fail-closed:** missing/disabled doc or any read error → no access, no query, no button.

## Changes (dynamic-studio-v2.component.ts)
1. `aiAtcFeatureEnabled` false→**true** (armed; config is now the live control).
2. New field `aiAtcAllowedForUser` (per-user verdict).
3. New `loadAiAtcAccess()` — reads `classify/queue-atc-edit-config` once, fail-closed, supports
   `global` (everyone) and allowlist modes; called in the constructor `getRoles().then` after
   `currentuserData` is set.
4. `checkAiAtcAvailability()` guard flipped `aiAtcFeatureEnabled` → `aiAtcAllowedForUser`.
5. `useAiAtc()` defensive `aiAtcAllowedForUser` check.
Template unchanged — `*ngIf="aiAtcAvailable"` already sits downstream of the access check.

## Session update (2026-07-06) — end-to-end wiring of the AI-ATC flow

Beyond gating, the full studio→prescribe flow was debugged and made to work. Final state:

**Availability query (`checkAiAtcAvailability`).** Removed BOTH the `stage=='Scope Enhancement'`
and the `status=='completed'` server filters (they excluded valid docs). Now queries
`profileid + queue_token_id + queueref`, `orderBy('createdAt','desc')`, **no limit**, and picks the
**latest `status=='completed'`** doc client-side (reuses the composite index; ordering by `createdAt`
means docs missing that field are excluded — backend sets it). Added `maybeRecheckAiAtc()` to
re-run availability if access resolved after the Prescribe-ATC step was already open (load-order race).

**prescribe-atc — schema normalization.** `queue_atc_generation.output` uses a different schema than
legacy `ai_generated_atc_summary`: Part-1 text + `---JSON---` + `{ adjustments:[{adjustment,outcome,
procedures}], areas_needing_more_data }` (no `ATC_Report`). For `source=queueatc` we parse with
`parseAtcOutput()` and remap into the `{ ATC_Report:{ Adjustments, Areas_that_need_to_be_explored_more }}`
shape the existing patch/areas logic expects. Legacy path untouched.

**prescribe-atc — procedure pseudonym mapping.** AI emits procedure pseudo-codes ("A&H Procedure24" /
"procedure24" / "A&H_procedure24") where the NUMBER is the key. New `src/app/ATC-Ops/procedure-pseudonyms.ts`
(frozen mirror of `atc-finetunning/procedures-cf/src/seed.js`) maps number→realName; `patchAIAdjustments`
resolves the code, then matches `realName` against `procedures.name`. Verified with an offline harness
(all code formats resolve+match). `extractProcedureKey` (which stripped the number) is now fallback-only.

**prescribe-atc — duplicate-draft fix.** `getATCoptions()` unconditionally minted a random `autoSaveID`
via `generateId`, clobbering the AI entry's deterministic `temporary_ATC/<docid>` and spawning a new
draft on every open/refresh. Guarded: `getATCoptions()` returns early when `?aigenerated` is present,
so the AI flow keeps the single deterministic docid — create-once, refresh/re-navigate reloads it,
all autosaves target the same id.

## Not in scope / follow-ups
- **Security rules:** this is UI gating + read-skip, not hard access control. True enforcement
  needs a Firestore security rule on `queue_atc_generation`. Separate task if required.
- In-app admin UI to edit the allowlist (console-only for now).
- **Procedure glossary drift:** `procedure-pseudonyms.ts` is a frozen mirror of the sibling repo's
  `seed.js`; regenerate both if procedures change. The `[AI-ATC]` warn flags unmatched names at runtime.
- **One-time cleanup:** duplicate drafts created before the fix need manual removal in the console.
- If the AI ever emits procedures as objects (not strings), harden `resolveProcedurePseudonym`.
