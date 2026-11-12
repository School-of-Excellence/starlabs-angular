---
type: doc
status: active
tags: [jc-health, journey-coach-health, theme, dark-mode, e2e, usability]
relatedTo: [qa/jc-health-dark-mode.md, qa/jc-health-tabs.md, qa/jc-health-onboarding-tab.md, qa/jc-evprep-board.md, qa/jc-overall-summary.md]
---

# UX review + e2e pass: /journey-coach-health (all 4 tabs)

Date: 2026-11-11. Reviewer: Claude (session jc-health-ux-e2e).
Env: starlabs-test (development config), `npx ng serve --configuration development --port 4301`, Claude in Chrome.
Code base: origin/joshua-development @ eb67431f. NOT yet included: the sibling branch
`claude/jc-health-four-items-732f6b` (Next 30 days, plan grid, follow-ups, Payment defaulted tile,
Needs-attention trend). Those surfaces need a second pass once they land.

Modes covered: OS dark (prefers-color-scheme: dark) with no stored choice; host toggle light; host toggle dark;
host light + stale `jcdTheme=dark` (set by the standalone /journeycoach-dashboard toggle); host dark + `jcdTheme`
unset. Viewports: 1272px and 1024px (no horizontal overflow on any tab at either width).
No production Firebase. No data was written (move boxes and log composer opened, validated and cancelled only).

## Root cause of the light/dark conflict

Two independent theme switches drive the page:

| Surface | Theme source | Palette |
| --- | --- | --- |
| Host (.jchd-wrap: Overall, Ev. Prep, Journey Planning, tab bar) | `jchd-theme` in localStorage, else OS prefers-color-scheme | `--canvas #0e0e11 / --surface #1b1b20 / --ink ...` |
| Embedded journeycoach-dashboard (Onboarding tab) | `jcdTheme` in localStorage only; ignores the OS and the host toggle | its own `--bg #0a0a0c / --panel #161619 / --ink ...` plus a legacy `--card/--text/--border` set |
| CDK overlays (MatDialogs, menus, selects) | host adds `jchd-overlay-dark` per dialog; the embed toggles `jcd-dark` on the GLOBAL `.cdk-overlay-container` and never removes it | 105 global `!important`-style rules in styles.css |

So the Onboarding tab is light whenever the host is dark through the OS (the default for a dark-mode Mac),
and dark whenever someone once toggled dark on /journeycoach-dashboard, whatever the host shows. The global
`jcd-dark` class then restyles every dialog opened anywhere (measured: slide-over surface rgb(22,22,25)
under a white `.so-root` while the host is light).

Screenshots (no participant data in frame):
- `qa/screens/jc-health-ux-onb-host-dark-embed-light.png`
- `qa/screens/jc-health-ux-onb-host-light-embed-dark.png`

## Findings

Severity: Critical = wrong theme on a whole tab; High = unreadable or broken control; Medium = wrong number,
misleading state or visible inconsistency; Low = polish.

| # | Tab | Element | Mode | Sev | Repro | Proposed fix |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Onboarding | whole embedded dashboard | both | Critical | OS dark, no stored theme: host dark, embed light (170 light surfaces >4000px2 measured). Toggle host light with `jcdTheme=dark`: embed dark on a light page | Embed takes its mode from the host (`@Input() hostDark`), ignores `jcdTheme` in embed mode, and in embed mode its palette variables are aliased to host tokens (one source) |
| T2 | All | MatDialogs (slide-over, log composer, schedule/remark dialogs) | light | High | Host light + `jcdTheme=dark`: `.cdk-overlay-container.jcd-dark`, slide-over white content on rgb(22,22,25) surface | Embed never sets `jcd-dark` from its own storage; in embed mode it follows the host; class removed in ngOnDestroy (also fixes the app-wide leak after leaving /journeycoach-dashboard) |
| T3 | Overall, Onboarding, Ev. Prep | theme toggle | both | High | The only light/dark button lives in the Journey Planning header; three tabs have no way to switch | Move the toggle to the right end of the tab bar so it is on every tab (same button, same storage key; nothing removed) |
| T4 | Journey Planning | Coach-set health legend (Happy/Neutral/...); participant email under the name | dark | High | Text is `rgba(60,60,67,.7)` hard-coded: contrast 1.57 on the dark card, effectively invisible | Use `var(--ink-2)` / `var(--muted)` |
| T5 | Ev. Prep | Next button, Done pill, In-stage 7d/14d chips, Design-preview banner, error text | dark | High | Hard-coded light pills (#fef3c7, #dcfce7, #fef2f2, #dc2626) glow on the dark board | Map to host semantic tokens (`--sem-orange-fg`, `--sem-green-fg`, `--sem-red` + washes) so both modes work |
| T6 | Ev. Prep | drag preview | dark | Medium | CDK drag preview is appended to body, outside `.jchd-wrap`, so it falls back to the light defaults (code-verified; CDK ignores synthetic mouse drags) | `cdkDragPreviewContainer="parent"` on the cards |
| T7 | Ev. Prep | column badge + journey chip (first stage accent #475569) | dark | Low | contrast 2.26-2.77 on dark | Neutral accent from `--ink-2` when no stage colour |
| T8 | Onboarding | date toolbar | both | Medium | Grey translucent bar (`--topbar`, sticky blur style) unlike the Overall date bar (plain pills on canvas) | In embed mode: transparent toolbar, host pill styling |
| T9 | All | card shell | both | Medium | Card radius 18 (Overall/Planning) vs 20 (Onboarding) vs 16 (Ev. Prep); Ev. Prep has a 1px border + slate shadow, host cards have no border; titles 16/600 (host) vs 11px caps eyebrow (Onboarding) vs 18/700 (Ev. Prep) | Embed + Ev. Prep read `--card-radius`, `--card-shadow`, `--hairline` from the host; title sizes aligned to the host scale. Layout and every element stay as they are |
| T10 | Onboarding | Pending approval chip, 7+ D cells, pipeline column subtitles, "15 records", "Showing" footer | light | Low | contrast 2.3-2.99 (amber #e5820a on amber wash; slate #94a3b8) | Comes out of T1 aliasing (`--sem-orange-fg #c25e00`, `--ink-3`) |
| F1 | Journey Planning > Participants | column sort (Participant, Priority, Renewal) | both | High | Click a header: arrow flips (aria-sort=ascending) but row order never changes. `@ViewChild(MatSort)` is read in ngAfterViewInit while the table is still behind `*ngIf`, so `dataSource.sort` stays undefined | ViewChild setter that binds sort + sortingDataAccessor when the table renders |
| F2 | Journey Planning + Overall | A&H "Critical + Attn" tile | both | Medium | Planning: tile 8, list 7. Overall: tile 6, list 5. Tile = critical + tagged, list = docs that are critical OR tagged, so a doc with both is counted twice | Tile counts the same OR predicate the list uses |
| F3 | Journey Planning + Overall | Schedule / Scheduled & completed cards | both | Medium | Single-coach view: "loading..." never clears (waited >60 s). `contactDataLoaded` is only set on the paged (All/Unassigned) path; the coach path loads the same events but never flips it | Mark schedule data ready after the coach-path `loadContactEvents()` (separate readiness flag so Going-quiet logic is untouched) |
| F4 | Journey Planning | Viewing select, "Unassigned · no coach (0)" | both | Medium | Option shows (0) in a coach view; selecting it lists 234 and the label then changes to (234) | Show "(...)" until the unassigned count is known |
| F5 | Onboarding | table footer | both | Low | Empty result (search with no match, or a 0 column) reads "Showing 1–0 of 0" | "Showing 0 of 0" when empty |
| F6 | Onboarding | Gross "Open table" link | both | Low | With the table open from the Pending chip, "Open table" closes the table instead of showing all Gross rows; label never changes | When the open table is the filtered one, switch to the unfiltered table; label "Close table" only when that exact table is open |
| F7 | Onboarding | Gross/Assured table header | both | Low | "Pre-Sales Perosn" | Fix typo (shared config, standalone gets it too) |
| F8 | Journey Planning > Participants | context line | both | Low | With a tile filter active (People with tickets 18) the line still says "53 participant(s) ... matched 53" | Append "· showing 18 (People with tickets)" when a tile filter is on |
| F9 | Ev. Prep | board | both | Low | Tab is destroyed on every switch, so each visit reloads ("Loading evolution prep...") and re-reads Firestore | Keep it mounted after first open (same pattern as the Onboarding embed) |
| F10 | Ev. Prep | move box | both | Low | Escape does not close it; focus stays on the page | Escape closes; focus moves to the note field |
| Q1 | All | default tab | - | Question | Page opens on tab 4 (Journey Planning) while the bar reads 1-4 | No change unless you want tab 1 as default |
| Q2 | Slide-over | Log composer Call / Health | - | Question | Save is enabled with an empty note (Schedule and Note are disabled until filled) | No change unless you want a note required |

Checked and fine: no console errors other than the FCM notification-permission message (unrelated);
no long tasks / change-detection loop on any tab (3 s idle sample, 0 ms long tasks, ~1 ms timer drift);
no horizontal overflow at 1024px or 1272px; A&H drill overlay, Overall, Coaches view and slide-over follow the
host tokens in both modes when `jcdTheme` is unset.

## E2E matrix

Data month for Onboarding/Overall drills: April 2026 (Nov 2026 has 2 sales). Viewing = logged-in coach unless stated.

| Element | Action | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| Tab bar | click each of 4 tabs | panel switches, one `.on` tab | as expected | PASS |
| Onboarding Gross Sales count | Open table | rows == count, footer of N | 15 == footer "of 15" (10/page) ; Nov: 2 == 2 | PASS |
| Onboarding Assured count | Open table | rows == count | 6 == 6 | PASS |
| Pending approval chip | click | Gross table, Status Pending, rows == chip | Nov: 1 == 1 == footer | PASS |
| Pipeline column counts (Not Assured / Ready / Scheduled / Onboarded) | click count | table rows == count == cards in column | 5/1/2/0 == tables == cards | PASS |
| Pipeline journey selector | each journey chip | counts partition the All counts | uP! 3/1/2/0 + B!G 1 + FTM 1 = 5/1/2/0 | PASS |
| Onboarding table search | no-match text | empty state | "No data available"; footer "Showing 1–0 of 0" | FAIL (F5) |
| Onboarding table sort | Purchase Value asc/desc | reorders | asc 0..3,25,000 / desc 15,00,000.. | PASS |
| Onboarding table paging | Next, rows 20 | 11–15 of 15; 1–15 of 15 | as expected | PASS |
| Onboarding table filters | Status APPROVED, Type NEW, Journey uP! | rows filtered, footer follows | 15 / 7 (all "new") / 4 | PASS |
| Onboarding month prev/next | 7 x prev | month 2026-04, counts reload | as expected | PASS |
| Gross Open table while Pending table open | click | all Gross rows | table closes | FAIL (F6) |
| Overall date bar | shared with Onboarding | same month both tabs | April 2026 both | PASS |
| Overall Sales by Journey cells (non-zero) | click | overlay rows == cell | 1==1 x5 | PASS |
| Overall Onboarding status tiles | click | Onboarding tab, table == tile | 7==7, 0==0, 7==7, 0==0 | PASS (empty footer F5) |
| Overall A&H cells (17 non-zero) | click | overlay rows == cell | all equal | PASS |
| Overall Critical + Attn | click | overlay rows == tile | 6 vs 5 | FAIL (F2) |
| Overall health legend Not assessed | click | overlay == 46 | 46 | PASS |
| Overall Scheduled & completed | wait | "loading..." clears | stuck | FAIL (F3) |
| Ev. Prep board totals | read | Total == sum of column counts == cards | 4==4==4, 6==6==6 | PASS |
| Ev. Prep Next | click | move box opens with from > to | opens | PASS |
| Ev. Prep Save without note | click | blocked with error | "A note is required..." | PASS |
| Ev. Prep Cancel / backdrop / back | click | closes; back opens move box | as expected | PASS |
| Ev. Prep Escape | key | closes | stays open | FAIL (F10) |
| Planning Needs attention | click | Participants rows == 37 | 37 of 37 | PASS |
| Planning Defaulted / Payments locked | click | rows == tile | 1==1, 28==28 | PASS |
| Planning People with tickets | click | rows == tile, tile outlined, Clear shown | 18==18 | PASS (context line F8) |
| Planning Ask AH / Love Letter / Unflagged / Positive | click | overlay == tile | 7,8,5,5 equal | PASS |
| Planning Critical + Attn | click | overlay == tile | 8 vs 7 | FAIL (F2) |
| Planning lifecycle tiles (Active/Non-active/No status) | click | summary filter toggles | is-on toggles (filter, not a list) | PASS |
| Viewing coach select | All / coach / coach / Unassigned | Participants table changes | 291 / 0 / 0 / 234 rows, columns switch for Unassigned | PASS |
| Unassigned option label | read before visiting | real count | "(0)" then "(234)" | FAIL (F4) |
| Participants search | no-match / "a" / clear | 0 of 0 + empty state / 39 / 53 | as expected | PASS |
| Participants paging | Next | 51–53 of 53 | as expected | PASS |
| Participants sort | Participant / Priority / Renewal | reorders | arrow flips, order unchanged | FAIL (F1) |
| Coaches view | every stat + JC pipeline cell on each card (24) | drill list == number | 24/24 equal | PASS |
| Slide-over | open from row; Log; Call/Health/Schedule/Note; Cancel; close | composer switches fields; closes cleanly | as expected (Q2 noted) | PASS |
| Theme: OS dark, nothing stored | each tab | all dark | Onboarding light | FAIL (T1) |
| Theme: host light + jcdTheme dark | each tab + dialog | all light | Onboarding dark, dialogs dark surface | FAIL (T1, T2) |
| Theme toggle reachable | each tab | toggle visible | Planning only | FAIL (T3) |
| Layout 1024px / 1272px | each tab | no horizontal page scroll | none | PASS |
| CPU idle | each tab, 3 s | no long tasks | 0 ms | PASS |

## Fix plan (awaiting sign-off; no code changed yet)

Shared theme-token approach: the host `.jchd-wrap` stays the single light/dark source. It publishes alias tokens
(`--jx-canvas`, `--jx-surface`, `--jx-surface-2`, `--jx-ink`, `--jx-ink-2`, `--jx-ink-3`, `--jx-line`,
`--jx-blue`, `--jx-red`, `--jx-amber`, `--jx-green`, `--jx-indigo`, `--jx-teal` + their washes, `--jx-radius`,
`--jx-shadow`) that resolve to the current mode. Custom properties inherit through Angular view encapsulation,
so the embedded dashboard and Ev. Prep read them directly. In embed mode the journeycoach-dashboard maps both
its palettes (`--bg/--panel/--ink/...` and the legacy `--card/--text/--border/...`) onto `--jx-*`, takes its
`darkMode` flag from a `hostDark` input, and never reads or writes `jcdTheme`. The standalone
/journeycoach-dashboard keeps its own toggle and palette unchanged.

Alternatives considered: (a) only sync the two localStorage keys - still two palettes and the overlay leak;
(b) move all tokens into styles.css under a global class - larger blast radius, touches every screen. The
alias-token route touches only these three components plus the existing overlay block.

1. Critical/High (theme): T1, T2, T3, T4, T5. Files: journeycoach-dashboard .ts/.html/.css (embed-only rules),
   journey-coach-health-dashboard .html/.css/.ts (alias tokens, toggle in the tab bar, `[hostDark]` binding,
   two hard-coded greys), jc-evprep-board .css/.html, styles.css (only if a jchd-overlay-dark rule must win).
2. High (function): F1 Participants sort.
3. Medium: F2 Critical + Attn count, F3 schedule "loading...", F4 Unassigned label, T6 drag preview, T8 toolbar, T9 card shell alignment.
4. Low: F5, F6, F7, F8, F9, F10, T7, T10.

Nothing is removed. T3 relocates the existing toggle (same button and storage key) from the Planning header to the
tab bar; if you would rather keep it in the Planning header as well, say so.

Proof to ship with the fixes:
- `qa/checks/jc-health-theme-consistency.mjs` (red on revert): embed binds `[hostDark]`, embed mode ignores
  `jcdTheme`, embed CSS maps to `--jx-*`, no `jcd-dark` on the overlay container from embed mode, toggle in the
  tab bar, no `rgba(60, 60, 67, 0.7)` text in the host, no light hex pills in Ev. Prep.
- `qa/checks/jc-health-ux-e2e.mjs` (red on revert): MatSort bound via setter, Critical + Attn tile uses the OR
  predicate, schedule readiness set on the coach path, empty footer, Unassigned placeholder, Escape handler.
- Live re-run of this matrix in both modes on :4301 after the sibling branch lands, then all `qa/checks/*.mjs`
  and `npx ng build --configuration production` exit 0.

Sequencing: the host-component edits (T3, T4, F1-F4, F8, alias tokens) wait until origin/joshua-development
contains 2a955c02 so they do not collide with the sibling branch; the embed and Ev. Prep work can start at once.

## Limitations

- The sibling's new elements (Next 30 days tile, plan grid, follow-ups, Payment defaulted, NA trend) are not
  reviewed yet; a second pass is needed after they merge.
- CDK drag (Ev. Prep, Onboarding board) cannot be driven by synthetic mouse events; T6 is code-verified.
- Saves (move, log, mark done, schedule) were not executed, to leave starlabs-test data untouched; validation
  and cancel paths were tested.
- Only the logged-in coach and two other coaches (0 participants each) were sampled in the Viewing select.

## Fix pass (2026-11-12, operator sign-off "Yes, proceed"; toggle in tab bar only; default tab and optional log note unchanged)

Base: origin/joshua-development @ 8793329c (includes the four-items work efa05ad1 and the Onboarding tab push).

Implemented: T1-T10, F1-F10 as planned, plus one addition found during the fix pass:
- F3 was deeper than a stale label: in a single-coach view the JC appointments were never loaded (only the All /
  Unassigned path read them), so the Schedule card, the JC pipeline tiles and Overall "Scheduled & completed"
  showed 0. The coach path now classifies its roster's appointments through the same classifier
  (`classifyJcAppt`) as the base-wide load. Live: JC done last month 2 == list 2 (was 0); Overall Completed 1 == 1.
- Ev. Prep count pills keep white text on stage accents (surface text failed contrast on slate accents); chip and
  column badge text mix the accent with ink so it reads in both modes.

Contract: `qa/jc-health-theme-consistency` + `qa/jc-health-ux-e2e`
Surface: /journey-coach-health, all four tabs
Env: starlabs-test (development config), never production
App command: npx ng serve --configuration development --port 4301
URL: http://localhost:4301/journey-coach-health

### Invariants
- One light/dark source: with host dark every tab and the embed are dark, with host light all are light, whatever
  `jcdTheme` holds (stale `jcdTheme=dark` tested).
- The theme toggle is in the tab bar and visible on all four tabs; exactly one toggle exists.
- Dialogs follow the host: host light + stale jcdTheme dark -> slide-over surface white; host dark -> rgb(27,27,32).
- Participants sort reorders rows (Participant asc/desc sorted; Renewal asc by date).
- Critical + Attn tile == drill list (Planning 7 == 7, Overall 5 == 5).
- Schedule cards leave "loading..." in coach view and their drills match.
- Viewing coach select still changes the Participants table (TB / UX13).
- Ev. Prep: Escape closes the move box, focus lands in the note; tab switch does not reload.

### Banned
- jcdTheme read or written in embed mode; `jcd-dark` left on the overlay container after the dashboard is destroyed
- hard-coded light fills (#fef3c7, #dcfce7, #fef2f2, ...) in Ev. Prep; `rgba(60, 60, 67, 0.7)` text in the host
- New MatDialog for any list; filter/transform/backdrop-filter on ancestors of position:fixed overlays
- Production Firebase as a test target; ATC collections and src/app/ATC/**

### Hooks
- jx-theme-toggle -> tab-bar light/dark button
- jchd-diag-showing -> Participants context line, filtered count

### Live matrix (re-run after fixes, 1512px window)
| Scenario | Overall | Onboarding | Ev. Prep | Planning |
| --- | --- | --- | --- | --- |
| OS dark, nothing stored | dark, 0 wrong-mode surfaces | dark (embed jcd-dark) , 0 | dark, 0 | dark, 0 |
| Host light, stale jcdTheme=dark | light, 0, 0 low-contrast | light (embed not dark), 0 | light, 0 | light, 0 |
| Toggle to dark from the tab bar | dark, 0 | dark, 0 | dark, 0 | dark, 0 |
Functional re-runs: Pending chip 1 == 1; Open table after Pending -> 2 rows of 2 (no close); second click closes;
empty column footer "Showing 0 of 0"; Overall plan grid non-zero cell 1 == 1; Next 30 days tiles 0 (no list);
filter context "showing 18 with the current filter" == paginator 18; Unassigned option "(...)".

### Proof
- Spec paths: qa/checks/jc-health-theme-consistency.mjs, qa/checks/jc-health-ux-e2e.mjs
- Command: node qa/checks/jc-health-theme-consistency.mjs && node qa/checks/jc-health-ux-e2e.mjs
- Fail if reverted: yes (source reverted: 13 of 16 and 11 of 13 FAIL; remaining are brace-balance / invariant guards)
- Last run: PASS (16/16, 13/13); all 22 qa/checks PASS (OV10, EB7, DM6, TB8 updated to the approved new structure)

### Not verified
- CDK drag preview (T6) by real drag; code-verified only.
- Saves (move, log, mark done, schedule) not executed, to keep starlabs-test data unchanged.
- 1024px layout re-check after the fixes (only re-run at 1512px; the fixes add no width).
- JC pipeline in coach view now counts sessions of the coach's roster; a session the coach hosted for someone
  outside their roster is not included there (the Coaches view still uses the base-wide load).
