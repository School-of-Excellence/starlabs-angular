# 2026-11-20 — JC Health: filters, health drill, Happiness quotient + logs, follow-up Mark done

Operator asks (5): filters not working + Journey only single-select; Coach-set health shows numbers but no
list; Happiness quotient by date (default this week); log totals + health counts for the range; follow-up
Mark done should open a note, log it, and close the follow-up.

## What changed and why
| # | Change | Why |
|---|---|---|
| 1a | `liteMatches` finance filter back to case-insensitive | The Sashong pull (same day) reverted the 2026-11-18 fix in the lite index only — in the All (paged) view "Defaulted" missed `defaulted` rows. |
| 1b | Initial paged load now reads the FULL `healthtracker_healthstate` map (`loadCoachHealthStates`) alongside the index | First load only read the current page's health docs, so the All-view Coach-set health card and the health filter treated nearly everyone as Not assessed until the coach selector was switched and back. |
| 1c | Coach-health filter applied in `liteMatches` (base-wide) | It only refined the loaded page, so "Happy" gave a near-empty page 1 of the whole base. Priority band is still page-local (needs computeRows). |
| 1d | Participants "Journey" pill → `mat-select multiple` bound to `journeyGroupFilter` | Was a native single `<select>`; now it shares one array with the panel chips. Blank/'-' journeys match "Unknown" via `journeyKey()`. Testid `jchd-sel-048` kept. |
| 1e | `jchd-fp-panel` dropdowns get their own light/dark tokens (`jchd-fp-dark` panelClass when isDark) | Found in browser verification: the select panels render outside `.jchd-wrap`, where `--surface`/`--ink` are undefined → transparent panel, dark text, invisible in dark mode. Hit Journey, Priority band, Coach health and Financial status. |
| 1f | `financeOptions` is a getter over the current view's base (case-insensitive de-dupe) | Captured once at load: opening on a coach's own base then switching to All reused the cached index, so the dropdown offered only "locked" while 20 were "defaulted". |
| 2 | Coach-set health legend items are buttons → `healthCardDrill()` opens the existing drill overlay (row → slide-over) | Same scope as the card (view + summary journey + lifecycle). |
| 3/4 | New "Happiness quotient" card under the summary filter bar | One range query on `healthtracker_activity.timestamp`; scoped client-side to the summary filter. HQ = Happy health logs ÷ all health logs in range (logs, not people). Shows % big + happy/total small, total logs + per-type split, health logs per state; every count drills. Presets: This week (Mon–Sun, default) / Last week / This month / Custom. `daily_snapshot` docs (no profileid) are excluded. |
| 5 | Slide-over follow-up "Mark done" opens the Log composer locked to Note; "Save & mark done" writes the note (`onLog('note')`) then `schedule_done` | Cancel leaves the follow-up open. |

## Open
- Verified in the browser on production data, read-only (All participants, dark mode): journey multi-select narrows to
  B!G+CTD = 37 and the panel chips agree; Happy filter = 8 base-wide; finance options follow the view; health legend
  drills (Happy 8, Not assessed 106); HQ presets/custom/drill; Mark done opens the locked Note composer and Cancel
  leaves it open. "Save & mark done" was NOT clicked (production write).
- Data note: this week's 29 health logs come from 8 people, one with 15 (testing). HQ by logs = 69%; by latest
  state per person it would be 100%. **Decided (operator, 2026-11-20): keep counting logs** — repeat logs on one
  participant are intended to weigh in.
- e2e: new hooks `jchd-hc-*`, `jchd-hq-*`, `jcso-comp-save`, `jcso-fu-done-ctx` need registering/driving in the `journey` suite before push.

## Revert guide (per screen)
- Whole change, before commit: `git diff` the four files below and drop the hunks, or after commit `git revert <sha>`.
- Files: `journey-coach-health-dashboard.component.{ts,html,css}`, `participant-slideover.component.ts`.
- Pieces are independent: HQ card = the `hq-card` section + `hq*` members + `loadHqLogs()` call in ngOnInit + `.hq-*` CSS;
  health drill = legend buttons + `healthCardDrill`; Journey pill = the `jchd-pill-mselect` block + `topJourneyLabel`/`journeyKey`;
  Mark done = `fuDoneFor` / `openFollowUpDone` and the `fu` lines in `submitComposer`.

## Follow-up: Export on every JC Health dialog (same day)
Operator: "in every dialog in the jc health need an export option". Every dialog that shows a list now has an
Export button that downloads `.xlsx` (the `xlsx` library the Onboarding tab already used, same `<name>_<YYYY-MM-DD>.xlsx` naming).

| Dialog | Where | What the file holds |
|---|---|---|
| Drill overlay (every Summary / Overall / Happiness quotient / A&H count) | `jchd-ahd-export` | Name, phone, journey, customer + financial status, date, profile ID |
| Participant side panel | `jcso-export` | Profile sheet + one sheet per section that has data (activity log, follow-ups, appointments, events, tickets, forms, reports, love letters, Ask A&H, breakthroughs, AEL, coach notes) |
| Onboarding tab: table modal (`openDialog`) | `jcd-btn-modal-export` | The same columns and cell text the table shows |
| Onboarding tab: CURA | `jcd-btn-cura-export` | All four tabs, one sheet each |
| Onboarding tab: Booking schedules | `jcd-btn-cal-export` | The selected day's bookings |
| Crossover metrics | `jcomd-btn-export`, `jcomd-btn-panel-export` | Combinations + every participant behind them; the side panel's list for one combination |

Already had Export (unchanged): Onboarding interim / health / subscription / customer-status / EP / Ask A&H / tag dialogs and the main table.
No Export, on purpose: form dialogs with nothing to export — Log call, Set health, Log composer, booking (Schedule), onboarding remark.
"All months overview" is commented out in the template, so it was left alone.

Shared helper: `journey-coach-health-dashboard/export-xlsx.ts` (`exportXlsx`, `objectsToRows`, `fmtExportDate`).
Verified in the browser on production data with the download intercepted in the page (nothing written to disk); each file
was read back and its sheets/headers/rows checked.

Revert: drop `export-xlsx.ts`, the Export buttons + `export*` methods in `journey-coach-health-dashboard.component.*`,
`participant-slideover.component.ts`, `journeycoach-dashboard.component.{ts,html}`, `cross-over-metrics-dialog.component.*`.
e2e: the new hooks above need registering in the `journey` suite before push.

## Follow-up: health descriptions (same day)
- Coach-set health card: visible line under the title — latest coach-set health per participant from the last
  `HEALTH_TTL_DAYS` (60) days, not affected by the Happiness quotient dates (`jchd-hc-desc`). Overall "Participant health"
  sub-line says the same.
- Not assessed: **hover tooltip only** (operator: "let the tooltip be in the hover only") on both legends — no health set
  in the last 60 days (never set, or expired). A visible note was tried and removed.
- HQ logs row: tooltips on "logs created", "Health logs", the happy/total fraction and every log type; the type chips now
  open their log list (`jchd-hq-type`). Coach changes are logged one per participant, so a bulk assignment inflates
  "logs created" — on 19 Nov 432 of this week's 502 coach-change logs came from one day.
- Later the same day (operator: "logs created is not required" → clarified "remove the overall logs created, show
  remaining"): only the overall "logs created" TOTAL was removed (`jchd-hq-total` gone). The per-type counts stay
  (`jchd-hq-type`, tooltip + click for the list), followed by the health logs per state.
- Coach changes list: each row shows **from coach → to coach · by <who made it>** (from the coach_change log's
  fromCoachName / toCoachName / actorName; 'assign' shows "Unassigned →", 'unassign' "→ Unassigned"). Other log lists show
  "by <who logged it>". The drill Export gains matching columns (From coach / To coach / Changed by, or Logged by) via the
  new optional `AhDrillEntry.detail` / `extra`. This week: 490 of 502 coach changes were first assignments, 406 by one person (19 Nov bulk).
- Drill dialog widened to 760px and made compact (one line per row: name column + detail + date; stacks under 600px).
  It is the shared drill overlay, so every count's list on the screen gets the same layout.

## Follow-up: name search in every list dialog (same day)
Shared `journey-coach-health-dashboard/name-search.pipe.ts` (`nameSearch` pipe + function): case-insensitive, every typed
word must appear, any order. Each dialog's **Export downloads only the matching rows**.
- JC Health drill dialog (`jchd-ahd-search`): matches the name and the second line (so a coach change is found by either
  coach or by who made it); count shows "x of y"; "No one matches" state. Cleared on open/close.
- Onboarding tab: interim list, health, subscription, customer status, EP, Ask A&H, tag, booking schedules, CURA, table
  modal (`jcd-inp-dlg-search-*`; one shared `dlgQuery`, cleared whenever a dialog opens). Table modal searches every
  visible cell. Ask A&H search composes with its Source/Resolved filters (memoised); its Export now follows those filters too.
- Crossover side panel (`jcomd-inp-panel-search`).
Verified on production data: each list narrows correctly, clears on reopen.

## e2e (same day, before push)
Gate (base origin/development) blocked on 47 unreferenced hooks + 10 unhooked search wrappers (`<div (click)=stopPropagation>`).
Wrappers hooked `jcd-dlg-search-wrap-<dialog>`; composer got `jcso-comp-note` / `jcso-comp-cancel` (the new Mark done
flow needs them). Hub branch `test/jc-health-hq-export-nov20`: JCH-16 rewritten for the note-first Mark done (Cancel keeps it
open, Save writes a note + schedule_done), JCH-18 Not-assessed drill + search + Export, JCH-19 Happiness quotient (seeded
health logs with off-base / discontinued / last-week controls), ADDR for the rest. Local lane: coach-health 19/19,
coach-dashboards 9/9 (fixmes skipped). Gate MATCHED.
Revert the hooks with the screen: drop the `jcd-dlg-search-wrap-*` attributes and the two `jcso-comp-*` ones.
