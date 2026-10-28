# 2026-10-28 — pull from sashong-development: Journey Experience dashboard (loading, tickets, onboarding by product)

Operator: "pull from sashong-development" → "get journey experience dashboard" → "push it". Two of sashong's
commits were taken, on top of our file. The whole file was not taken: sashong's copy still lacks Joshua's 09-23
fixes, restored 09-29 in `3807e095` / `8fe7f186`.

| Commit | Area | Result | Why |
|---|---|---|---|
| `5676cc71` (10-21) | Upgrade EMI | sashong's: "upgrade from" sales fetched in batched `documentId() in` queries, not one `getDoc` per sale | The loading fix. Same numbers (a missing "from" sale = 0). |
| `5676cc71` | Health analytics start | sashong's: starts once the board's data is in (500 ms), not on a fixed 1200 ms timer | The loading fix |
| `5676cc71` | Tickets tile | **People with an open ticket** (sashong's meaning). Read with an open-only roster query; falls back to all the roster's tickets (status checked in the browser) when the (clientid + status.status) index is missing. | sashong's "tickets count fixed". The open-only query keeps the read small (Joshua's goal). |
| `5676cc71` | Outreach status line | **Joshua's kept** (priority reason, else a computed Lapsed / Renewal / Quiet / tickets line) | sashong's version prints "On track" on a row that needs attention |
| `6f7f512e` (10-22) | Onboarding by product | Each cell (To onboard / ≤7d / 7+ d / Not assured) opens its own list for that product; a new Not Assured table | Clicking a row used to always open To onboard |
| (ours) | Hooks | `jcd-onb-cell-toonboard` / `-within7` / `-plus7` / `-notassured` on the four cells | The gate flags clickable cells with no hook |

Kept as sashong wrote it: an unused private `onboardingProductName` helper.

NOT taken from sashong-development: the stale `app.routes.ts` (it would remove live routes), the queue-event-health
Reinitiate button, and an empty content-analytics-v2 unit stub.

e2e (hub `journey/coach-dashboards.spec.ts`):
- JCD-01 now pins "people, not tickets": X holds two open tickets, so the tile reads 1.
- JCD-07 (new) clicks each bucket cell for the seeded product P2. It checks each cell's list against the
  cell's number, and the seeded sale's bucket: in ≤7d, not in 7+ d, never in Not assured.

## Revert
Restore `src/app/Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component.{ts,html}` from the
commit before this one.
- Tickets tile only: put back the `getCountFromServer` block (`ticketsCount` = the sum of open tickets) and
  `ticketsCount,` in `data`.
- Onboarding cells only: restore the single row click `(click)="openOnboardingProduct(p)"` and the old
  `openOnboardingProduct(p)` (filters `all`, writes `toBeOnboardedProduct`). Drop `notAssuredProduct`
  from `originalData` and `tableConfigs`.
