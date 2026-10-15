# Participant Intelligence — round 5 (discussion draft 2026-10-01)

Source: 9 points from the operator. All discussed; not built.

| # | Change | Decision |
|---|---|---|
| 1 | Pinned header hidden on scroll | `.thead` z-index above `.td.frozen` (body frozen cells paint over the header today). CSS only. |
| 2 | Event / Queue option labels | Drop the date. Same-name events / queues merge into one option "Name (count)"; ticking it matches every id with that name. A–Z. Old saved ids map to the merged name. |
| 3 | Tag delete | Manage tags shows a per-tag participant count. Delete disabled while count > 0; "Remove from all N" (confirm, arrayRemove from `participant metadata.profiletags`, 400/batch); then Delete (confirm) = hard `deleteDoc` on `participant tags`. Anyone can delete. Unknown tag ids in saved filters / lists are ignored. |
| 4 | Finance insight | Remove the Integrity card `defaulted-but-active`; the Finance card `active-customer-finance-inactive` (5 statuses) stays. |
| 5 | New Finance card | "Active / non active customer, no finance status": customerstatus ∈ {active, non active} AND financialstatus none / blank / unknown. One card. |
| 6 | New Integrity card | "Onboarding not updated": customerstatus ∈ {active, non active} AND `currentjourneyonboarded` missing (not true / false). Map the field from participant metadata (no new read). |
| 7 | New Integrity card | "Age not updated": customerstatus ∈ {active, non active} AND age null (DOB missing / unreadable). |
| 8 | New Integrity card | "DFU and queue product ongoing together", any status: activeproduct has ≥ 1 DFU-type product AND ≥ 1 queue product. Queue product = `arena events` with type == 'queue', delete != true, enddate ≥ today (one read at page load: where type == 'queue'; dates filtered client-side, no new index). DFU products are never queue products. |
| 9 | Higher-order mismatch fix | Compare HOP with the status-based Journey (active → activejourney, non active → lastcompletedjourney, discontinued → lastsubscribedjourney). Skip rows with no journey (none / late / banned) and rows with no HOP. |

Flag list updates: onboarding (#6) and age (#7) insights move off the flag list.
Also: unit tests for 2, 3 (count / gating), 5–9; journal + revert guide.
