# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-31 (queue slot/capacity flow — baseline before logic change)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/QUEUE-SLOT-BOOKING-FLOW.md` + `specs/journals/2026-08-31-queue-slot-flow-baseline.md`.

## Current state
- Branch `dynamic-studio-update` @ `65992247`. Working tree carries only
  documentation added this session plus one pre-existing, unrelated
  `group-chat-screen.component.css` edit. Nothing committed, nothing
  pushed, nothing deployed — operator commits manually (standing directive).
- **No queue code was changed.** The slot/capacity flow is documented and
  frozen as a baseline so a planned logic change can be made and reverted
  safely. `breakthroughs-flutter` @ `development` `8cc6b02` was read only.

## Last session changes (2026-08-31)
- Added `specs/QUEUE-SLOT-BOOKING-FLOW.md` — the cross-repo as-is flow:
  the slot atom (`queue planning.planning[].segments[].slots[]`, no id,
  identified by a 5-tuple on exact-ms equality), **7 write paths + 3 read
  paths** across Angular `queue-planner` / `queue-planner-review` and the
  three Flutter cards, three mermaid flowcharts, a **divergence register
  D-01…D-10**, six invariants, and the change/revert protocol.
- Added `specs/journals/2026-08-31-queue-slot-flow-baseline.md` — WHY, the
  four surprises, an append-only change log (CL-000) and the per-screen +
  data-side revert playbook.
- Indexed both in `specs/ORIENTATION.md` doc map. Also published as a
  rendered reference artifact for the operator.
- **Headline finding (D-02):** `queue-planner.savePlanning()` assigns
  `usedslot = matching-token count` and every planner mutation auto-saves,
  so it overwrites the counter that the four transactional booking paths
  maintain — erasing Flutter self-service bookings and B!G pre-placements
  that have no `queue_token` yet. Paired with D-01 (review offers slots
  from a *derived* count while the transaction gates on the *stored* one),
  this is the double-booking root cause.

## Pending
- **The logic change itself is unspecified** — awaiting the operator's
  statement of the new rule. Recommended first target: D-02 + D-01
  (one agreed source of truth for capacity). Follow §7 of the flow doc:
  delta vs the register → check the six invariants → name the blast radius
  across W1–W7 / R1–R3 → Angular and Flutter as separately revertable commits.
- Before any write-shape change: export the affected `queue planning`
  doc(s) to `specs/journals/2026-08-31-queue-slot-flow-artifacts/`; array
  fields have no history. First run against `starlabs-test` only.
- Carried from 2026-08-27: operator visual pass of the redesigned
  `/eiflixhomeconfig` tab 1 and of `/videodashboard[/upload]`; EiFlix
  consumers to wire; newusertags backfill; `eiflixcampaign` rules
  unverified; eiflix register backfill + `/eiflixoperationsdashboard`
  route guard; episode-delete gaps.
