# 2026-07-06 — Invite More: hide specialists already in the live assignment

Operator: in the studio "Invite More" popup, picking an activity lists its specialists — but some have
already been called into this session. Those already in the live assignment shouldn't appear in the list.

## Change
The Invite-More popup is `EnterStudioAssignComponent` opened in `mode: 'invite'` from
`dynamic-studio-v2.component.ts inviteMore()`. Its per-activity list is built by
`specialistsFor(activityId)` from the `activityspecialists` map, with no exclusion.

- `enter-studio-assign.component.ts`: added `excludeProfileIds = new Set<string>()`, populated from
  `data['excludeprofileids']` in the constructor, and `specialistsFor()` now `.filter(id =>
  !this.excludeProfileIds.has(id))` before mapping/sorting. Empty set (any caller that doesn't pass it,
  e.g. the lobby 'enter' flow) = no filtering, so behaviour there is unchanged.
- `dynamic-studio-v2.component.ts inviteMore()`: builds `alreadyInAssignment` = union of the live
  assignment's `pairing` + `bonusactivityparticipant` + `bonusactivity` keys, passed as
  `excludeprofileids` to the invite dialog.

Result: the activity specialist chips in Invite More no longer show anyone already in the session, so you
can't double-invite them.

## Verify
`ng serve` rebuilt clean — `enter-studio-assign-component` + `dynamic-studio-v2-component` chunks built,
no errors. Runtime (auth-gated) not exercised; logic is a straight list filter over data already in the
live assignment.

## Revert
- `enter-studio-assign.component.ts`: drop the `excludeProfileIds` field, its `data['excludeprofileids']`
  read, and the `.filter(...)` in `specialistsFor`.
- `dynamic-studio-v2.component.ts`: remove `alreadyInAssignment` and the `excludeprofileids` data key.
