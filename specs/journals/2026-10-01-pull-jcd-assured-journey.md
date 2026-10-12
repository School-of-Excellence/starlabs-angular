# 2026-10-01 — sashong-development → charan-release: JE dashboard Assured Sales journey fallback (d86af3ea)

## What
| Screen | Source | How |
|---|---|---|
| journeycoach-dashboard (`/JourneycoachDashboard-new`), .ts only | sashong-development d86af3ea | `git show d86af3ea -- <file> \| git apply --3way` — that commit only |

## Why only the one commit
The rest of sashong's jcd delta vs charan-release is our 09-29 operator edits in reverse (in-tab Health board,
3 `getAtcAlpha()` ATC calls, Joshua's open-ticket server count + filtered appointments query, priority reason
statusLine, 4 debug console.logs). The patch applied cleanly; all of those stayed as they were.

## Change
`formatCellValue`: an empty `journey` cell (sales tables) now shows the row's product name via `getProductName`,
like `journeyref` already did. Also adds `saleProductRefs` (filled from participantjourneyproduct, never read)
and `idField: '_sid'` on the salesleads stream (unused) — dead weight, left as authored.

Not taken from sashong: queue-event-health Reinitiate, its older app.routes.ts, the cav-v2 unit stub.

## e2e
Hub `journey/coach-dashboards.spec.ts` JCD-04 + SLP/SLJ seed. No template change → no hooks; hook-diff aligned.

## Revert guide
`git checkout 1a9be8ed -- "src/app/Journey Onboarding/journeycoach-dashboard"` (and drop JCD-04 + SLP/SLJ in the hub)
