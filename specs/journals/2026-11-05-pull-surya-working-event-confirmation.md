
## Pull from surya-development (2026-11-05, later)
Operator: "get from surya-development" → "pull 1,2,3". On this branch Surya's `9d52356d` moved the rewrite
back into the ORIGINAL folder (clone folder deleted, route unchanged). Files taken whole from
`origin/surya-development` — charan-release had not touched them since merge-base `18d45a5e`, and no one but
Surya changed them on her side. Dev build green.

| # | Screen | Files |
|---|---|---|
| 1 | Event participation confirmation (rewrite in place) | `src/app/Events/event-participation-confirmations/event-participation-confirmations.component.{css,html,ts}`, `product-funnel.component.{css,html,ts}` |
| 2 | Update event detail (16:9 image check, form redesign) | `src/app/Events/event-list/update-event-detail/update-event-detail.component.{css,html,ts}` |
| 3 | Monitor activity log (`Events Data.xls`) | `src/app/big/monitor-activity-log/monitor-activity-log.component.ts` |

Not taken: B!G ladder (`3d690980`, removes hooks/null-safety); Nanda's `engagementdashboardv2` route.

Watch-out: #1 drops hooks `pf-bar-customer-status`, `pf-bar-finance`, `pf-table-clear-filter`, which the
hub's `events/events-controls-addressable.spec.ts` references → readiness gate blocks until restored or the
spec is updated. #1 writes event requests / participantsproduct / queue_token / e-tickets / checklists —
test on starlabs-test only.

Revert: restore each screen's files above from charan-release HEAD (whole files; nothing else in them).
Not committed.

## Hooks restored (2026-11-05, screen-e2e-coverage)
Surya's rewrite removed the Finance + Customer status dropdowns and the empty-table "Clear filter" button
(with their hooks `pf-bar-finance`, `pf-bar-customer-status`, `pf-table-clear-filter`, which the hub's events
spec asserts). Operator chose "re-add the controls". In `product-funnel.component.*`:
- html: both dropdowns back before `pf-bar-send`; "Clear filter" button back in the empty-row `<td>`
  (resets finance/customer/journey/fr filters, then her `clearAllFilters()` — which alone doesn't reset them).
- ts: `financeMatches` took the old `PRow` shape and was no longer called; now keyed by pid
  (`participantMetadata[pid].financialstatus`) and added to the `segmentRows` filter — otherwise the
  Finance dropdown would do nothing.
- css: `.sx-finance { width: 150px; }` (her stylesheet dropped it).
Hub: `test/epc-surya-rewrite-hooks` (worktree `~/Projects/Functions/starlabs-e2e-tests-epc-hooks`, off
origin/main) registers her 4 new hooks (`epc-tab-start-date`, `epc-tab-end-date`, `pf-potsplit-sales`,
`ued-cancel`). hook-diff aligned 0/0 for both folders. Revert: restore `product-funnel.component.{html,ts,css}`
to `origin/surya-development`.

## Rollout gate: 73 unhooked elements (2026-11-05, after push)
Console blocked the rollout on `27a3c74e`: the 4 new hooks only exist on the hub branch (not hub main), and
Surya's markup added 73 interactive elements with no `data-testid` (gate counts head − base unhooked
`<button>/<a>`/(click)/(change) tags per template). Hooked all 73 with literal ids, one prefix per component:
`ued-req-*` (8, the required-fields checklist), `epc-overview-create-event`, `epc-overview-configure-cta`,
`epc-row-edit(-loading)`, and 61 `pf-*` (arena cards, tickets, checklist, comms, bulk bar, result chips,
column filter, ticket dialog `pf-ticket-*`, filter popup `pf-fpop-*`, checklist dialog `pf-cl-*`). Hub branch
registers them in events-controls-addressable. Local gate: MATCHED. Revert: drop the `data-testid` attrs only.
