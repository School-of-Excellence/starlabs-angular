# 2026-11-19: Workshop Live: the Live button on /workshops and the /workshoplive/:id completion feed

Plan: `specs/plans/2026-11-19-workshop-live.md`.

## The operator's answers

- **Layout:** one row per completed sub challenge, newest first.
- **Access:** everyone signed in.
- **Which rows get the button:** only active ones (any switch on and not completed). This is the green Active chip's rule.
- **Opens in:** a new tab.

## What landed

Uncommitted in starlabs-angular; the operator commits.

- **/workshops** (`workshops.component.{html,ts,css}`):
  - **The button:** `wor-live` (green, icon `sensors` at 19px, tooltip and aria-label "Live").
  - **Placement:** it sits between Dashboard and Edit, and shows with `*ngIf="isActive(workshop)"`.
  - **Click:** `window.open('/workshoplive/' + id, '_blank')`.
  - **Width and alignment:** `.col-actions` is now 176px. An aria-hidden `span.live-slot` holds the button's place on rows that are not active, so the icons line up down the column.
- **Route:** `workshoplive/:id` with `authGuard` (`app.routes.ts`), placed next to `workshop_dashboard/:id`.
- **New screen** `src/app/New-Workshop/workshop-live/`:
  - `workshop-live.component.{ts,html,css}`, OnPush, with hook prefix `wlive-`;
  - `workshop-live.engine.ts`, pure;
  - `workshop-live.engine.unit.spec.ts`: 26 cases, run by CI's unit gate.

## Why each constraint landed

- **The mobile switch is `eiflixmobileactive`.** No field called `mobileactive` exists, and the existing `isActiveWorkshop` helper already uses the right field.
- **The same query as the dashboard, with sorting on the client.** `where('workshopref','==',ref)` runs on the automatic single-field index. Completion dates live inside the nested `challenges[].challenges[]` array, so Firestore cannot order by them.
- **Only `status === 'completed'` counts.** It is dated by the sub challenge's `completed` Timestamp. "finished" and "in review" are not completions, which is the dashboard's rule. For assignments, `completed` is the review approval time.
- **A completed step with no date goes last and shows "—".** Older data has these.
- **Names are resolved by `challengeid` against the workshop config, falling back to the participant's copy.** The copies drift whenever the config-sync cloud function does not run (`triggerFunction` off), so matching by index can show the wrong name.
- **People come from `participant metadata` first, then `new_user_data`.** This is the opposite of the dashboard, which overlays new-user data. The feed only needs name, phone and email, and metadata is the long-lived record.
  - **Rows never wait for names:** they render at once with placeholders, and names fill in per batch of 30.
  - **Reads come from the server, not the cache:** `getDocsFromServer` avoids an empty cache answer when offline.
  - **Not found:** someone found nowhere is asked again once, about 45s later, and then shows "Unknown".
- **Incremental updates** (review, high).
  - **The first build** rebuilt, re-sorted and re-formatted the whole feed on every snapshot, which is heavy for a large workshop.
  - **Now:** it keeps per-doc rows from `docChanges()`, merges them, caches view rows, and uses two `Intl.DateTimeFormat` objects. A unit test checks their output equals the dashboard's `formatDateTime`.
- **Only server-confirmed snapshots** set "Updated" and the highlight baseline.
  - **Why:** Firestore delivers a metadata-only, from-cache event when the connection drops. The first build treated it as fresh data, and a partial cache snapshot could become the baseline and highlight rows that were already there.
  - **What the chip shows:** "Live", "Connecting…" or "Reconnecting…".
- **The config read recovers.** A transient failure is retried on the next server snapshot, or by one queued 10s timer. A missing workshop shows "No workshop matches this link…" rather than a connection message.
- **Layout:**
  - **Wide screens:** `table-layout: fixed` with set column widths, because the Completed column was cut off at 600–1030px.
  - **Narrower:** cards below 1024px.
  - **Emails** break before the "@" (`<wbr>`), not mid-word.
  - **Roles:** explicit table roles keep the structure in card mode for screen readers.
- **Live chip contrast:** its text uses a darker green (5.33:1).
- **Hub `_shared/prod-firewall.ts`:** `installProdFirewall` now accepts a `BrowserContext`. The Live button opens a new tab, and `page.route` does not cover popups, so the tab would boot without the production firewall.

## Checks

- **Production build:** exit 0, with the same 36 warnings as before, all from other files.
- **Unit tests:** 26/26 in the CI way, plus 33/33 together with the workshops filters spec.
- **E2E:** 49 passed, 0 failed, 2 skipped (WS-65 and WS-04 were already skipped). The files:
  - `workshop-live.spec.ts`: WLV-01..07, 7/7;
  - `workshops-list`, `new-workshop-controls` and `workshop-dashboard-access`: all green.
- **What WLV covers:**
  - button visibility, with completed-with-a-switch-on as a negative control;
  - the new tab, firewalled;
  - the exact feed, column by column, in order;
  - an undated step goes last;
  - finished, in-review, zoom and other-workshop steps are absent;
  - a live arrival goes to the top with only that row highlighted;
  - a new person fills in;
  - the empty and error states;
  - the limited actor sees it.
- **Readiness gate:** MATCHED. `workshop-live.component` 15/15 hooks, `workshops.component` 29/29.
- **Hub:** committed locally as `15557cc` (4 files: the spec, `wshop.ts`, `seed-workshops.js` with the `/workshoplive` route, `_shared/prod-firewall.ts`). **Not pushed.**

## Before it works anywhere real

- **Route config:** authGuard is data-driven, so **each real environment needs a `/workshoplive` entry in the `dashboard` route-config collection** (via /routeconfiguration), with the same roles as /workshops. Without it, everyone gets "Contact Admin".
- **Wider CI run:** `app.routes.ts` is cross-cutting in the suites manifest, so CI runs every ciReady suite for this branch.

## Left open

- **The feed is uncapped.** Every completion is in the page. A "show newest 300 + Show more" cap needs the operator's say.
- **Not driven by e2e:** the offline states (Connecting / Reconnecting, the config-failure error, the 45s Unknown re-check) would need network emulation. They are checked only in code.
- **Pre-existing:** the app header is too wide at 390px (PROGRESS item 8), here and on /workshops.

## Addition: pagination and search (app side)

Plan section: "Addition: pagination and search". Browser-side only: no new collection, no Cloud Function, no index, and the one listener and the people lookup are unchanged.

- **Engine** (`workshop-live.engine.ts`, end of file): `PAGE_SIZE` (20), `normaliseSearch`, `phoneDigits`, `isPhoneTerm`, `rowMatchesSearch`, `filterRows`, `pageCountFor`, `clampPage`, `pageSlice`, `pageLabel`, `rangeLabel`, `matchesLabel`. 21 new unit cases (47 in the file).
- **Screen:** search box above the list, no-match state, and a pager below the list that shows only with more than one page. New hooks: `wlive-search`, `wlive-search-clear`, `wlive-no-match`, `wlive-no-match-clear`, `wlive-pager`, `wlive-prev`, `wlive-next`, `wlive-page`, `wlive-range`.

### Why each choice landed

- **Phone matching applies only to a phone-shaped term** (digits, with spaces, "+", "-" or brackets between them). Otherwise "ben2" would match every phone that has a 2 in it. Digits inside an email still match as text.
- **"Unknown" and "—" are never matched.** They are placeholders, not a person's details. Without this rule, typing "no" would list every person found nowhere.
- **A row whose person is still loading matches no search.** It appears once its details land, because the search runs again on every render.
- **No debounce.** Each search key is built once per view-row object (a WeakMap, and unchanged rows keep their objects), and only 20 rows render, so filtering on every keystroke is cheap. Specs need no waits.
- **A keystroke resets the page to 1 only when the normalised term changes.** A trailing space does not move the user.
- **Focus:**
  - The clear buttons put focus back in the box.
  - Previous or Next keeps focus on the pressed button. If the pressed button is now disabled at the end, focus moves to the other button.
  - The list top scrolls into view only when it is above the screen or under the 64px app toolbar. The scroll is instant under reduced motion.
- **Counts:** the header count stays the total of all completions. "Page X of Y" and "Showing A–B of N" count the searched rows.

### Review round (same day): what changed and why

A review of the pagination and search work found five issues and the screenshots showed two layout issues. All of these fixes are within search and paging. The listener, the people lookup and the reads did not change. Three unit cases were added, for 50 in the file.

- **Spoken updates follow the user, not the feed.** Before, the hidden status line was rewritten on every render. With a search on, every live completion and every batch of people would read "N matches" aloud. The "Page X of Y" label was also `aria-live`, so a live arrival that added a page was read out too. Now the status line changes only after the user searches, clears or presses Previous or Next (the page change is read as "Page 2 of 5" because focus stays on the button). `aria-live` on `wlive-page` is gone.
- **"No match" is not claimed while people are still loading.** A row whose person is still being looked up matches nothing, so a search typed straight after opening a big workshop used to say "No completions match your search", and the rows appeared a few seconds later. `searchAwaitingPeople` (engine) now makes the same `wlive-no-match` block show a spinner and "Still loading participant details…", and keeps its Clear search button. If some rows already match, a one-line hint beside the box says more matches may appear. The spoken count is held back until everyone has landed, then read once.
- **Phone search finds a number saved without its country code.** `peopleSendPhone` shows a bare number when no country code is stored. Typing "+91 98765 43210" or "098765 43210" used to find nothing, because the typed digits were longer than the saved ones. Now a phone term drops its leading zeros (a trunk "0" or an international "00", unless the term is all zeros). The term also matches when its digits end with a saved number of 7 or more digits. The 7-digit floor keeps a short saved fragment from standing in for a whole number.
- **Both sides are compared in one Unicode form (NFKC).** A composed "é" or Devanagari "क़" from one keyboard now matches the decomposed form from another, and full-width digits count as a phone term. The cost is only per row key, because keys are cached per view-row object.
- **The page fills exactly the scroll area.** `.wlv-root` had `min-height: 100vh`, but the page scrolls inside `mat-drawer-content`, which sits under the toolbar. That left 64px of empty scroll. From a scrolled position, a short page 2, a narrow search or the no-match state stayed scrolled up with the title half under the toolbar. The min-height is now the shell's own `.mainscreen` expression, `calc(100vh - clamp(40px, 7.4vh, 64px))`, and must be kept in sync with `app.component.css`.
- **A page change scrolls to the search row, not the list.** Before, the list was the scroll target (with a 76px margin). On a phone, a short last page could not scroll that far, so it stopped with only a sliver of the search box showing. Now the search row is the target, with a 12px margin, so the box shows whole above the list top. It is still only done when the list top is above the screen.

**Open question for the operator (not changed here):** the request also said "dont load all load recent wise … load by load from collection document". This screen still reads every participant doc of the workshop, and looks up every person, when it opens. Paging and search only change what is shown. Loading 20 at a time from Firestore needs a per-completion read model: completion times sit inside each doc's challenges array, and `participant workshop` has no doc-level time to order by. That read model needs a new collection or a Cloud Function, and the operator ruled both out. Their sign-off on loading everything in the browser is still to be recorded in the plan.

## Addition: Journey and Customer status (app side)

Plan section: "Addition: Journey and Customer status columns". App only (uncommitted; the operator commits). No new collection, no Cloud Function, no change to paging or search.

- **Engine** (`workshop-live.engine.ts`, end of file): `NEW_USER`, `journeyNameIndex`, `journeyLabel`, `customerStatusLabel`, `isStillNewUser`, `shownPerson`, `detailCells`. `liveViewRows` takes an optional 4th argument, `{ newUsers, journeyNames }`, and each view row gains `newUser`, `journey` / `journeyPending`, `status` / `statusPending`. There are 11 new unit cases, for 61 in the file (the 11th, `emailParts`, came with the review round below). The full CI glob passes 2548/2548.
- **Screen:** two cells after Email, `wlive-journey` and `wlive-status`. Their headers and card labels are "Journey" and "Customer status". "New User" is shown in navy semibold.

### Why each choice landed

- **Two people lookups side by side, not one after the other.**
  - **The old order:** metadata was asked first, then new_user_data only for whoever metadata lacked.
  - **Why that no longer works:** a still-new user can also have a metadata doc. So new_user_data is now asked for everyone, as one more batch of 30 that runs in parallel.
  - **What each lookup keeps:** its own answer per person, its own asked set, and its own retry (a failed batch is put back and asked again on the next snapshot or after 10s). A failure in one lookup does not throw away the other's answer.
  - **What decides the row:** `shownPerson` (pure) applies the old precedence (metadata first, else new_user_data), so name, phone and email read exactly as before.
- **Pending means the placeholder, never a guess.** The two cells show the placeholder until both the person and their new-user answer are known. Otherwise a still-new user would flash their metadata status ("Active") and then switch to "New User".
- **The journey cell alone also waits for the first journey read,** but only when the person has a journey. A failed read hands the rows an empty map instead of null, so the cells read "—" (never the raw id) and do not go back to the placeholder while the single retry runs.
- **A failed journey read is asked again, but never on a timer of its own.** It is asked again once with the next people lookup, on the next server-confirmed snapshot (the same rule as the workshop config: back online means ask again), and on Retry. `loadJourneys` marks the read pending at once, so only one is ever out. An answer that lands after the 20s deadline is still used (`onLate`, as the dashboard does for new_user_data). The first version only read the journeys when nothing had been asked yet: after a failure, Retry and a reconnect brought back names and statuses but every journey kept reading "—", which looks the same as "no active journey" (review finding, fixed in the same round).
- **The 45s second look changes a row once, with both answers.** It forgets the first look's two answers but keeps the row as it was ("Unknown", "—") until both lookups have answered again (`secondLook`). Clearing only the asked sets let the first look's "not a new user" mix with a fresh metadata answer: the row showed the metadata journey and status, then switched to "New User" (review finding).
- **The journey read uses `getDocsFromServer`,** like the people. Offline, `getDocs` would answer an empty cache list, and every journey would read "—" for good without the read being counted as failed.
- **Strict `movedtoexist !== true`**, which is the dashboard's `isNewUserProfile`. Only a real boolean `true` counts as moved. A string `'true'` still reads as new, which is what the dashboard does.
- **Title case word by word**, with spaces collapsed first. The data has 'non active', 'Non Active' and 'Non  Active'. A value like 'none' reads "None": only an empty value reads "—".
- **The view cache now compares the new-user answer and the journey-names map too.** A row is rebuilt only when one of its inputs changes. The journey names landing rebuilds every row once, which is the same cost as the config landing.
- **Column widths** were measured in a static harness with the real component CSS, the app's global sheets and DM Sans:
  - **1280px and up:** name 15%, phone 148px, email 14%, journey 11%, status 120px, Completed 180px. Main and sub share the rest. Completed is whole.
  - **1024-1279px:** name 14%, phone 140px, email 14.5%, journey 11%, status 112px, Completed 116px (date over time), and the page's side padding drops from 32px to 20px. With the padding at 32px, "@example.com" and the journey "Breakthrough" broke mid-word at 1024px. With 20px they stay whole, so the table can keep the 1024px breakpoint and the cards do not need to start earlier.
  - **Why email has its own share:** the first version split email, main and sub equally. Two more columns left email 150px at 1280 and 124px at 1024, so ordinary addresses ("firstname.lastname@…", 18 characters before the '@') broke mid-word, often over three lines. An email has no spaces; challenge names wrap at theirs. So email takes a share and main / sub split the rest: at 1280 the room for an address goes from 118px to 138px, at 1024 from 100px to 118px, main and sub still hold "Breakthrough", and the table is shorter overall at both widths (measured in the harness).
  - **Emails break at their marks, not mid-word.** Width alone cannot hold every address: a 22-character local part ("wlvk.divya.blank.wshop") is still wider than 138px. The email used to have one break point (a `<wbr>` before the '@'), so a long local part was cut wherever the line ran out ("wlvk.divya.blank.w / shop / @example.com"). `emailParts` (engine, unit-tested) now gives a break point before the '@' and before each '.', '_', '+' or '-', and the template puts a `<wbr>` between the pieces, so the same address wraps as "wlvk.divya.blank / .wshop@example / .com" at 1280 and 1024 (still three lines for this long test address, but every line ends at a mark; at 1440 it is "wlvk.divya.blank.wshop / @example.com"). The next line starts with the mark, so it reads as the same address going on. `<wbr>` adds no text: the cell's text, the search and every email assertion are unchanged. `overflow-wrap: anywhere` stays as the last resort for a piece that is wider than the column on its own.
  - **Status never breaks inside a word** (`overflow-wrap: normal` on that cell, like phone and Completed). "Discontinued" is 83px in an 84px text box in headless Chromium; another browser's metrics could split it as "Discontinue / d". The band's status column also went from 108px to 112px for margin.
  - **Headers:** "Customer status" wraps onto two lines in the table header (bottom-aligned with the rest). One line would cost 27px from the shared columns at 1280px.
  - **Cards:** the label column grew from 104px to 116px, so "Customer status" (110px) stays on one line. The cost is that from 600px to 609px a phone number wraps at its space in the two-column cards.
- **Search is untouched.** `SearchableRow` still reads only the name, phone and email. A unit case pins that "breakthrough", "banned" and "new user" match nothing.

### Notes

- graphify is not installed here (`import graphify` fails) and `graphify-out/` is gitignored, so the graph was not rebuilt.

## Hub push (2026-11-20)

- **Rebase:** the 4 local hub commits were rebased onto 8 upstream commits (events/journey/queue, no workshops or `_shared` files), with no conflicts. The new hashes are `d7cb681` (WPT), `9ff94c3`, `60daf50` and `97033dd` (WLV).
- **Checks before the push:**
  - `--list`: 308 tests in 37 files.
  - Type check: no new errors. 6 TS2339 errors predate our commits and are also on origin/main. The widened `installProdFirewall` type-checks against all 14 importers.
  - Readiness gate in working-tree mode over all 27 uncommitted app files: MATCHED. Every hook is tested: workshop-live 26/26, new-user-details-dialog 17/17, workshop-dashboard 188/188, workshops 29/29, newusersprofile 194/194.
  - **Full workshops suite: 275 passed, 0 failed, 33 skipped** (the 30 child-control fixmes, plus 2 and 1 existing skips). 0 emulator restarts, about 1 hour.
- **Pushed:** `d03caa2..97033dd`. The hub is even with origin and clean. The cloud-function repo was restored and is clean, and the test servers are stopped.
