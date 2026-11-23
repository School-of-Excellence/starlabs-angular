# Delivery Dashboard — Delivered / Total / Stuck / Weekly / "Why not here?" (approved 2026-11-19)

Component: `src/app/Journey Onboarding/delivery-dashboard-clone/` (live `/delivery-dashboard`).

| # | Ask | Edit | Effect |
|---|---|---|---|
| 1a | Delivered: include discontinued | Load completed records of discontinued customers too, used only for Delivered | Delivered / Done / Avg Start→Done rise; Total, Eligible, Stages, Stuck, Weekly unchanged |
| 1b | Delivered: earlier cycles | Delivered = every completed record completed in the period, not only the latest cycle | Multi-cycle participants show their earlier completed cycle |
| 2 | Total: no initiated | Overview "not started" pool = no status only | Overall, Eligible, Not Eligible, Purchased, Bonus, Add-on, This/Next Month drop initiated. Stages Total Eligible keeps initiated (Onboarding Waiting pool) |
| 3 | Stuck: last booked appointment | Latest non-cancelled appointment that has started, attended or not | Days Stuck counts from it; status Attended / Not attended; future booking still excludes |
| 4 | Needs Attention: 7 days | `STUCK_DAYS` 15 → 7 | "stuck >7d" |
| 5 | Weekly Report: cancelled | Stop dropping cancelled appointments; add Cancelled status + filter | Shown in table and export |
| 6 | "Why not here?" dialog | Name + section → per product ✓ In / ✗ reason, from shared rule checks | Overview chips, funnel steps, Awaiting / Ready, Stuck, Not consuming |
| 7 | Tooltips | Rewrite affected tooltips | |

Out of scope: Stages board columns in the dialog.
