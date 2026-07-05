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

## Not in scope / follow-ups
- **Security rules:** this is UI gating + read-skip, not hard access control. True enforcement
  needs a Firestore security rule on `queue_atc_generation`. Separate task if required.
- In-app admin UI to edit the allowlist (console-only for now).
