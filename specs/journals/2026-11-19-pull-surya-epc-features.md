# 2026-11-19 — Pull from surya-development: participation confirmations (new features only) + chat-screen null-safety

**Operator ask:** "pull 1 new features only and 2". surya-development tip `6ca7e600`; it already contains charan-release
`4df90055`, so the diff is Surya's side only. Skipped: `big/big-ladder` (#3) — its only change was reverting our 9 `bld-*`
hooks and the null-safety / undated-cohort sort fixes.

## Taken
| Component | From Surya (`81b32533`, 2026-11-18) |
|---|---|
| `customer-chat-screen` | `assign?.includes`, `category?.toUpperCase()` — whole file |
| `event-participation-confirmations` (overview) | copy event link (`epc-copy-link`), sort: upcoming by start / past by end, snapshot rows carry upgrade / addon / continuity / noteligible, deleted arenas greyed and not clickable, styling |
| `product-funnel` | Segment column (+ in export for Requested / Overall requested), Export always visible (no selection needed), sheet named after the segment, "Journey Group" toggle moved into the Approved panel, action buttons by segment (Approve, Request Revoke, Approved Request Revoke), Mark as Attended / Mark as Not Attended / Mark as Attended + restore product (Unattended), `statuslog` on attended / unattended writes, confirm before marking attended, enum filter options from the filtered rows, row Revoke on requested + approved rows |

## Kept from charan-release (Surya's file removed them)
- **No-show**: the segment row, its count (`attendance_state === 'no_show'`), the finalize write, the "No-show" label. Surya had
  commented all four out.
- **Finance + Customer status filters** in the selection bar, and `financeMatches` in `segmentRows` (third time this was
  dropped — see 2026-11-05-epc-surya-rewrite-hooks in the hub).
- **Selection rules**: `selectionMode` / `isSelectable` restored (checkbox disabled on rows no action can use), WIDENED for
  Surya's new actions — `attend` now covers Unattended (restore) and `request` covers requested / upgrade / addon /
  continuity / noteligible (Request Revoke on not-yet-approved requests). Select column hidden where nothing is selectable.

## Hooks
`pf-journey-card-toggle` moved onto the new Journey Group button. Surya's `epa-attend-*` ids (EventParticipationAttendance's
prefix, and one id on two buttons) → `pf-bar-mark-attended`, `pf-bar-mark-restore`, `pf-bar-mark-notattended`.
`pf-row-revoke-attend` is gone (his single row Revoke covers approved rows). Hub `events-controls-addressable.spec.ts`
updated on hub branch `test/epc-surya-nov19` (uncommitted). Gate (base origin/development): MATCHED, suites `support` + `events`.

## Revert guide
Per screen: `git checkout 4df90055 -- "src/app/Events/event-participation-confirmations/"` (overview + funnel) or
`git checkout 4df90055 -- "src/app/Customer Support/customer-chat-screen/customer-chat-screen.component.html"`.
Revert the hub addressable-spec edit with it.

## Open
Uncommitted. Before push: run `support` + `events` suites (emulator lane), commit hub change on `test/epc-surya-nov19`.
