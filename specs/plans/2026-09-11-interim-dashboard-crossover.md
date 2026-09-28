# Plan — Interim Report Dashboard: real data for Summary strip + Crossover Meter
Approved by operator 2026-09-11. Journal: `specs/journals/2026-09-11-interim-report-dashboard-tab.md`.

## Data (read-only, default DB, no ATC collections)
| Collection | Query | Used for |
|---|---|---|
| `interimreport log` | `createdon` between the dashboard's start/end date (same field as the Log tab) | one member per log; summary counts |
| `interim crossover` | `interimlogid in [...]` chunks of 30, latest `created` per log | per-area metric + level changes (studio-validation docs have no `interimlogid` → excluded) |
| `profile_data` | reuse the Log tab's `mapProfiles` via `@Input` | names |

## Rules
| Item | Rule |
|---|---|
| Members sent | logs in range |
| Submitted | `status == "completed"` |
| Ongoing | not completed and `reports.length > 0` |
| Not started | `reports` empty |
| Life areas | Business, Career, Family, Health, Personal Genius |
| Bands | 0 / not progressed = metric null or 0 · 1–3 · 4–7 · 8–10 |
| Areas changed | area changed when metric ≥ 8; buckets 0–5 over members with a crossover doc |
| Upgraded their level | area with `jumpedfrom` set; before = `jumpedfrom`, after = `endpoint` |
| Moved to | grouped by level name (no L1–L11 — `accelerated evolution level` has no order field) |
| Journey / Event filters | stay visible, do not filter real data (Journey column shows "—") |

## Edits
| File | Change |
|---|---|
| `interim-report-dashboard.component.ts` | inject Firestore, `@Input() profiles`, loader for logs + crossover by date range, pass `{ load }` into the script, refresh on profile changes |
| `interim-report-dashboard.script.ts` | strip + Crossover section (matrix, areas changed, level changes, their drill-downs) read the real pool; date change reloads; Evolution / Love Letter / Asks / By participant stay on design mock data |
| `interim-report-log.component.html` | `[profiles]="mapProfiles"` |

## Addenda (operator asks, same session)
| Ask | Change |
|---|---|
| single date range picker | Material `mat-date-range-input` in the DATE pill; component owns the range |
| open on today | default range = today (Clear resets to today) |
| dialogs centred | `#ov` / `#lg` → native `<dialog>` + `showModal()` |
| show jumped from | `Jumped from` column in crossover cell dialog; level dialogs `Jumped from / Jumped to` |
| By participant for Crossover | By participant view reads the real pool: row per interim report, real crossover levels, real status; Evolution / Love letter / Asks columns + detail sections show done / not done from `reports` until wired |
| not started → no section | `sectionPool()` = ongoing or submitted only; used by the Crossover section, every drill-down list and By participant. The summary strip still counts everyone (Members sent / Not started). |
