# 2026-11-04 — /newusersprofile "Referred by" names new-user referrers

## Problem
- The Referred by column resolved `refferedprofile` (an id or a DocumentReference) through
  `metaMap` only. `metaMap` comes from `AuthguardService.getParticipantMetaMap()`: `participant metadata`
  names.
- A referrer who is a new user (a `new_user_data` doc) was not found there, so the column showed their
  raw profile id (operator: "some refferedprofile is from new_user_data").

## Fix (`newusersprofile.component.ts`)
- The screen already streams the whole `new_user_data` collection for its table. The same emission now
  also builds `nudNames` (doc id → name), so no extra read.
- `referredBy()` resolves: participant metadata name → new_user_data name → the id.
  - Metadata comes first: someone moved to existing has their live name there.
- Search, sort and the export all go through `referredBy()`, so they follow automatically.
- New hook `new-referred-by` on the name in that cell.

## Tests
- Hub WS-73 (`workshops/new-users-profile.spec.ts`) seeds four referred users whose referrer is:
  - a new user by id;
  - a new user by DocumentReference;
  - a participant (the metadata name must still win);
  - an unknown id (falls back to the id; negative control).
- The new-users spec runs 7/7; WS-73 fails without the fix.
