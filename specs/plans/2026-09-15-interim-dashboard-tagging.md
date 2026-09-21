# Plan — Interim Report Dashboard: tagging, notes, month default, wording
Approved by operator 2026-09-15 (7-point request). Follows `2026-09-12-interim-dashboard-letters-asks.md`.

| # | Change | Where |
|---|---|---|
| 1 | Visible text "member(s)" → "participant(s)" (strip, grid header, averages, empty states, list subtitles) | `interim-report-dashboard.script.ts` |
| 2 | Evolution grid: "All members" footer row removed | `evoGrid()` |
| 3 | Love Letter: "In progress" card removed (Open + Resolved only, 2-column row) | `escPanel()`, `.escp-row` CSS |
| 4 | Love letter / Ask A&H: tag (Happy, Needs Attention, Opportunity, Critical) in one click; Resolved on its own STATUS row, Mark resolved / Reopen confirmed inline first; add notes — in the lists and in By participant | `tagEditor()` / `notesBox()` / `toggleTag()` / `saveNote()`; component `setTag()` / `addNote()` |
| 5 | Date filter defaults to the current month (1st → last day); Clear resets to it. Calendar dot under days with an `interimreport log` (`createdon`), one month at a time with `getCountFromServer`: 1 count for the month, then 1 per day only if the month is non-zero | component `defaultRange()`, `dateClass`, `loadMonth()`; dot CSS in `src/styles.css` (overlay is outside the shadow root) |
| 6 | Evolution cell dialog: 2nd column = adjustments behind the %, out of the ones they answered — "5 of 18 adjustments" (was answered/total) | `openEvoCell()` |
| 7 | Removed notes: Evolution "a member shows…", Love Letter "click a number to read them · tags are changed…", Asks "two separate asks…", By participant "The adjustment text is confidential…" | `stepView()`, `pdetail()` |

## Writes (4) — same fields as the Love Letter / Ask A&H tabs
| Action | Firestore write on `love letter` / `ask AH` doc |
|---|---|
| Happy | `liked` + `likedetails {user, time}` |
| Needs Attention | `tagged` + `tagdetails` |
| Opportunity | `opportunity` + `opportunitydetails` |
| Critical | `critical` + `criticaldetails` |
| Resolved | `resolved` + `resolveddetails` |
| Note | `notes: arrayUnion({notes, user, time})` |
Off = flag `false`, details `null`. `user` = parent's `loggedInProfileId` (new `[profileId]` input). The ask AH doc holds both asks, so its tags/notes are shared by Installation Ask and Ask A&H.
