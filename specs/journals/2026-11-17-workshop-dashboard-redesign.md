# 2026-11-17 — Workshop dashboard (`/workshop_dashboard/:id`): full redesign, design only

The operator asked for a complete premium-classic redesign of the workshop dashboard. It must keep strictly
everything the screen shows today, and change the UI and UX only. It is to be shown first and built only after
approval. They also asked that it take much less time than the 2-hour New Users design run.

Deliverables (plain HTML+CSS, no scripts):
- `2026-11-17-workshop-dashboard-redesign/workshop-dashboard-ui.html`: the live screen (frame 1) and the participant
  panel open (frame 2).
- `2026-11-17-workshop-dashboard-redesign/workshop-dashboard-states.html`: 9 sections of numbered frames:
  1. page states;
  2. workshop variants (evergreen, category-based, Sale Achieved);
  3. challenge progress;
  4. the participant table;
  5. Participant Data;
  6. submissions archives;
  7. Platform usage;
  8. every participant-panel variant (8.1–8.23);
  9. tablet and phone.

## How it was made
Workflow `workshop-dashboard-redesign-design` (run `wf_d6e1847e-62e`, 5 agents, about 46 minutes, against about 2
hours for New Users).
- **Three readers** split the 2,399-line template (1–704, 705–1387, 1388–2399) and listed every label, value,
  control, condition and state. That came to 266 items.
- **One designer** built both files in the New Users design language and mapped every item to a frame
  (`wdx-coverage.md` in the session scratchpad).
- **One checker** probed 287 labels itself. It added the 13 that were missing, including a frame with the panel
  title for all 27 entry points. It also fixed 7 wording errors and 5 render bugs.
- **Checker's results:**
  - no sideways scroll at 1440, 1280, 820 or 390;
  - pixel-identical with the app's global sheets loaded (Bootstrap, both Material themes, `styles.css` without its
    imports, angular-calendar, the emoji picker).
- **Skipped compared with New Users:** the three-designer contest, the judges and the merge. The operator wanted speed,
  and the New Users design system already existed to reuse.

## Design decisions (and why)
- **The same language as New Users,** so the admin app reads as one product:
  - navy and gold, ruled lines, a white sheet;
  - Playfair 600 for headings only;
  - DM Sans with even-width figures;
  - every class prefixed `wdx-`, with tokens on the root.
- **Full width,** as asked on 2026-11-17.
- **Figures in two tiers instead of up to 20 equal cards.**
  - A headline row: Total Enrolled, Average Progress and Completion Rate with bars, and Sale Achieved.
  - Labelled groups below it: Participation, People, Referral & purchase, and on category-based workshops the
    group figures.
  - An "Open list" arrow marks only the figures you can click.
- **A sticky row of section links** (At a glance, Challenge progress, Participants, Participant data, Submissions,
  Platform usage). On a long page this is the main navigation aid; it changes no behaviour.
- **Challenges are one ruled list,** with chips on the right and a gold edge on the open one. Step rows keep
  "done/Total Enrolled" and the stacked bars.
- **Participant Data reads as a profile:** a header strip, challenge cards on the left, and Assignment Data on the
  right, which stays in view while scrolling.
- **One participant panel** for every list, with real filter menus and removable chips. Panel titles use proper
  labels instead of title-cased keys.
- **Every behaviour quirk is kept** (see the inventory notes). For example, Active includes people who completed,
  step bars divide by Total Enrolled, and Move Next also selects the row.

## For the operator to approve or veto
New text that isn't on today's screen:
- the section links bar;
- "Open list";
- "Current: 4.2";
- the "Submissions" heading;
- "Zoom call · no per-person status";
- "0 participants match" (frame 8.21).

Not drawn on purpose: the three browser confirm and alert pop-ups, which stay as they are.

## Pending
- Operator sign-off, then development: port the design and keep every `wd-*`/`wdash-*` hook. The inventory lists
  them all.
- The build sources (`build.py`, `wdx_lib.py`, `wdx_css.py`) are in the session scratchpad only. The two HTML files
  are the record.

---

# 2026-11-17 (later): development — the design is ported into the app

The operator approved development, asking for a deep check of the new structure against the current screen first.
Workflow `wf_33d6b55c-a61` ran 9 agents in about 1 h 45 min:
- a gap check: three readers over the 2,399-line template, plus a hub DOM-contract pass;
- three region builders;
- an assembler;
- an e2e stage.

## What the deep check found (96 gaps, all handled)
- **Hub specs found the metric cards by `mat-card.metric-card`.** WS-07, WS-DASH-SPLIT and WS-09/14 would break.
  - The new cards are `<button class="... metric-card">` and keep `.metric-value` as an unstyled class.
  - The three locators now accept `mat-card.metric-card, button.metric-card`, so the meaning is unchanged and they
    still pass on branches without the redesign.
- **`#` anchor links would leave the dashboard** because of `<base href="/">` and no anchor scrolling.
  - The section index uses buttons that scroll to template refs (`#wdxChallenges`, `#wdxParticipants`,
    `#wdxSubmissions`, `#wdxPlatform`).
  - Participant data uses the existing `scrollToParticipantData()`.
- **Refs inside an `*ngIf` can't be reached,** and a ref on a `mat-card` points to the component. Submissions and
  Participants therefore get always-present plain wrappers (`.wdx-anchor-blk`, hidden when empty).
- **The sticky index wouldn't stick under `overflow-x: hidden`** on the root. The root now uses `clip`. Every scroll
  target, `#participantDataCard` included, has a 60px scroll margin, so the 46px index doesn't cover it.
- **Index items follow the same rights as their sections:**
  - Participant data needs `can('participantprogress')`;
  - Submissions needs any of the three archive rights;
  - Participant journey shows only on evergreen workshops.
  - The counts reuse the existing expressions: `challengeStatistics.length`, and the table-subtitle count.
- **Tokens sit on `.workshop-dashboard` (`wdx-root`) only.** There is no container query or transform on the root,
  because either would capture the fixed side panel and overlay.
- **The loading, error and no-access states keep their four independent `*ngIf`s verbatim.** WDA-04 counts
  `.dashboard-content`.
- **`matTooltip` stays everywhere.** The mockup's CSS tooltips would be clipped by `overflow: hidden` groups and the
  phone day-track scroller.

## What changed in the app (UI only, no logic)
- **Template:** rewritten (1,992 lines, was 2,399), with all 152 old hooks kept literal and unique.
  - A parser-based binding diff shows every handler, condition, loop and interpolation kept with the same expression.
  - The deliberate retargets:
    - progress bars → `[style.width.%]`;
    - `[color]` → class bindings with identical conditions;
    - old state classes → `wdx-` equivalents (no hub spec used them);
    - the panel heading ternary → `@switch`, keeping the three titles the tests pin.
- **CSS:** fully replaced (1,258 lines, was 3,209). Every selector is under a `wdx-` class.
  - **Why the old CSS had to go:** with `ViewEncapsulation.None`, the old `.metric-card`, `.panel-header` and similar
    rules would leak app-wide (the engagement dashboard uses `.metric-card` too).
- **TS:**
  - `encapsulation: ViewEncapsulation.None`;
  - six Material modules the markup no longer uses were removed: Button, ProgressSpinner, ProgressBar, Expansion,
    FormField and Input;
  - no new members and no logic changes.
- **New hooks:** `wdash-nav-glance`, `-journey`, `-challenges`, `-participants`, `-pdata`, `-submissions` and
  `-platform`.

## Results
- **Build:** `ng build --configuration development` passes with no warnings from this folder.
- **Unit:** 262/268. The 6 failures are the baseline empty "should create" stubs (missing providers).
- **E2E:** 94 passed, 0 failed, 0 skipped across the 9 dashboard spec files, plus the new
  `workshops/workshop-dashboard-redesign.spec.ts` (WDR-01..05).
  - The first run failed 3, all the expected metric-card locators.
  - WDR checks the index links and their counts against Firestore, each link's scroll, the evergreen journey link,
    a limited user's missing links, and keyboard use with the URL unchanged.
- **Readiness gate:** MATCHED, 159 of 159 hooks tested.
- **Hub commit:** `dab0eb0`, local.
- **Fixed during e2e (CSS):**
  - the phone side panel's top now uses the toolbar's clamp height;
  - an opened last group no longer paints square corners over the card's rounded corners.
- **Screenshots** at 1440, 1280 and 390, plus category-based and evergreen worlds, are in the session scratchpad
  under `wdb/shots/`.

## Not done / watch
- Only the dashboard specs ran. The full workshops suite must run before any hub push.
- On category-based workshops, the index's Participants count calls `getFilteredTableParticipants()` on every
  change-detection pass. It is cheap on test data; watch it on big cohorts.
- On seeded data, step names are blank or read "Unknown Sub-Challenge": the seeds carry `heading` and the template
  reads `.name`, as before.
- The panel's Filter tooltip briefly shows under its open menu.
- The text "1 participants" is kept as before.
- **Open questions for the operator:**
  - The subtitle now dedupes "Purchase - Purchase" to "Purchase". Is that wanted?
  - Should "Enrolled via code:" be renamed "Referred:"?
  - Should New Users cards show tag chips?
- **The 390px sideways scroll comes from the app header** (the account chip). It was there before and is outside
  this component.

---

# 2026-11-17 (later): operator answers, and the At a glance cards

**Answers to the three open questions:**
- **Keep "Purchase".** The deduped subtitle stays.
- **Rename the Share Claimed line** from "Enrolled via code:" to **"Referred:"**. It has a new hook, `wd-side-referred`.
- **Add tag chips to New Users cards.** They use the same enrolled-doc tags and have their own hook, `wd-side-new-tag`. Total Enrolled and Existing Participants keep their own hooks, so WNE-04 and WNE-10 still hold.
- **Hub:** `workshops/workshop-dashboard-side-chips.spec.ts` holds WNE-11 and WDL-02 and is gated on the two new hooks.
  - WDL-02 seeds its own evergreen workshop with `workshopreferral` claims and enrolled codes.
  - WNE-11 deliberately says nothing about the moved person in the New Users panel; that bug is still open.
- **Results:**
  - dashboard set 96 passed, 0 failed;
  - gate MATCHED, 161 of 161 hooks tested;
  - hub commit `2878e73`, local.

**At a glance cards: design.** The operator picked six cards from my suggestions:
- Workshop timeline;
- Joined recently;
- Started but stuck;
- Completed;
- Inactive for 3+ days;
- Top tags.

The mockup is `workshop-dashboard-glance-cards.html` in this folder. It has a desktop frame, a frame of states, a phone frame, and a table of how each card counts.

**Why the cards count the way they do:**
- **Started but stuck and Inactive never overlap.** People at 0% are only in Stuck. Inactive needs some progress, so an admin nudging both lists never messages anyone twice.
- **Inactive uses the time each step was finished,** which the dashboard already loads. A person who has started but finished no step falls back to their workshop start time. Nobody is guessed.
- **Completed is the same list as Completion Rate,** shown as a number.
- **Top tags is the only card that adds a read:** the tag names now load with the page instead of when a panel opens. They load once, and again only when the set of tag ids changes.

The operator approved the design and development started (workflow `wf_2fc370c7-5b5`).

## At a glance cards, side-panel person menu: developed

**What the operator asked for while it was being built** (folded into the same run, not done as separate runs):
- **The side panel must not open `/userprofile`.** The name row is now a plain row; the external-link icon is gone. The row keeps its `wd-a-84` hook so existing hub references still resolve.
- **Top tags shows the whole tag name.** There is no ellipsis. A long name wraps inside its chip, the bar keeps at least 48px, and the count never wraps.
- **Clicking a name opens a menu** with the person's name and **View participant data** ("In <workshop>"). The item closes the panel and opens that person's Participant Data, the same as clicking their row in the progress table.
  - Without the participant-progress right, the name stays plain text.
  - The item is disabled when there's no progress row. The line under it says why: "Not enrolled in this workshop", "Not started — no data in this workshop yet", or "Started — no progress recorded yet" (`personMenuNoDataNote` in the engine).
  - New hooks: `wd-side-person-name`, `wd-side-person-view`.

**Glance code:** the rules are in a new pure file, `workshop-dashboard.glance.ts`, with "now" passed in, so they can be unit-tested without a clock (25 tests). The component only wires them in and adds 18 `wdash-*` hooks.

**What surprised us:**
- **"Day 12of 24".** Angular drops a whitespace-only text node before `<small>`, so the timeline title lost its space on screen and in the page text. The static visual check missed it because its harness filled the template in by hand. The hub caught it (WDG-01/07); it is fixed with `&ngsp;`. **Lesson:** a static harness proves the CSS, not the template.
- **The Sale Achieved purchases card covered the new menu.** It is `position:fixed` at z-index 1002, above the CDK overlay (1000). The card now clears when the menu opens and can't come back while it is open. On phones it goes below the row if it fits, otherwise above, and shrinks with a scrolling list. It used to be able to cover its own row's name.

**Other review fixes:**
- **Top tags:** no empty-state flash, because tags are marked ready only after the enrolled snapshot has arrived; old rows are kept while a new tag set loads.
- **`trackBy`** on the tag rows and bars, so a live update doesn't destroy focus or eat a click.
- **The clock re-runs every 5 minutes,** browser only and outside the zone, so the timeline and Inactive don't freeze overnight.
- **Focus moves to the Participant Data heading** after "View participant data".

**Skipped, for the operator to decide:** Top tags counts people, but Total Enrolled lists one card per enrolled doc. A person with two enrolled docs shows twice after a tag click. Removing the duplicates would change an existing panel.

**Results:**
- dashboard set 13 files, **110 passed, 0 failed**;
- unit 288/294 (the 6 are the baseline empty stubs);
- build clean;
- gate **MATCHED**, 181/181 hooks;
- hub commits `8b518f1` (WDG-01..07, WDP-01..04) and `f17c1d2` (WDG-08..10, WDP-02 focus), local only.

**Time:** about 66 minutes across build (cached on resume), e2e, review and fix. The operator found the overall pace too slow; the run was stopped and resumed twice to fold in new asks.

**Open:**
1. Should a Top tags click show each person once?
2. On phones the purchases card covers the next row until you tap elsewhere. This was already true before this work.
3. "Not enrolled in this workshop" is only unit-tested; no emulator world has a non-enrolled person in a panel.

## 2026-11-18 — closing the e2e gaps

The operator asked whether everything had e2e. Three gaps were open; two are closed.

- **"Not enrolled in this workshop" is now e2e** (hub `134c7a7`, WDP-05/06). It runs on real seeded panels: Share Clicked, Purchase and New Users Not Enrolled, in its own workshop world (`W_pmenu`, plus `W_pmenu_other` where the outsider IS enrolled, so a lookup that ignored the workshop would fail).
- **The review caught a vacuous check** (hub `d7739f2`). "Clicking the disabled item does nothing" could never fail: `viewPersonData()` returns early when there's no progress row, so even an enabled item left the panel open. The test now checks that the **menu stays open** after a click that actually lands on the item, once the menu has finished animating; an enabled mat-menu item always closes its menu. A throwaway probe proved the new check fails when the item is enabled. WDP-03 had the same pattern and was fixed too. **Lesson:** "nothing happened" assertions need a signal that differs between enabled and disabled, not just the absence of the downstream effect.
- **Full workshops suite: 231 passed, 0 failed, 33 skipped** (30 are the gated child-controls file), 26 min. Gate MATCHED, 181/181. No app files changed, so this run counts for the pre-push rule. Only the side-person spec changed afterwards, and it passed 3 runs in a row.
- **Blocked: the Sale Achieved purchases card.** Its rows come only from Watson (`Participants` → `ParticipantPurchases`), and the emulator build sets `watson: null` on purpose. WDC-15/16 assert "—". No seed can reach it. Options for the operator:
  - **A.** A test-only fake Watson (a `demo-` project id on the emulator, about 6 lines in `watson-purchases.ts`). It can never reach real Watson. WDC-15/16 would then read ₹0.
  - **B.** Leave it as is; the spec header records why it isn't covered.
- **Left (low):**
  - `workshopreferral` isn't in the reseed sweep list, so an aborted run can leave three run-tagged docs. They are overwritten by the next seed; W_referral already had the same gap.
  - The New Users Not Enrolled click in WDP-06 has no readiness wait of its own.
- **Noticed:** the operator's 4200 dev server is now pid 1710 (901 is gone).
- **Operator decision:** option **B**, so the Sale Achieved purchases card stays without e2e. **Hub pushed:** the 14 commits were rebased onto upstream `6fa1b71` (5 new upstream commits, all under `journey/`, so the workshops result still holds). Pushed through `05524ca`.

## 2026-11-18 — the moved person in New Users

- **It was not an app bug.** A 17 Nov edit to WDL-01 put the Total Enrolled block above the New Users membership lines. "The moved person is not listed" therefore ran in Total Enrolled, which lists everyone. The first WDL-01 run, with the lines in the right place, had passed.
- **How we checked:**
  - two read-only diagnoses: every path that fills the panel, and load order;
  - a replay of the exact failing sequence on a fresh server and after an HMR update;
  - a new permanent guard that tries every filter, a live update and reopening.
  None of these could make New Users list the moved person.
- **The review found two real issues nearby. Both are fixed in `workshop-dashboard.component.ts`:**
  1. **New Users, Existing Participants and New Users Not Enrolled could open wrong.** `new_user_data` was read once and nothing waited for it. Clicking those cards before it landed opened New Users empty and listed still-new people as Existing ("Unknown"). The panels are click-time snapshots and never refresh, so they stayed wrong. Now the enrolled snapshot waits for `newUserDataReady` together with the metadata batch. **Trade-off:** the first paint waits for the whole-collection read when it is the slower of the two.
  2. **New Users listed a person enrolled twice twice,** while the card counts people. The list is now built from the first enrolled doc per person, the same rule as the rest of the dashboard. WNU-02 failed before the fix.
- **Hub:**
  - `4cde14b` puts WDL-01's checks back in the New Users panel.
  - `58f94c4` moves the guard into its own gated file, `workshop-dashboard-new-users-panel.spec.ts` (WNU-01/02). It references hooks that are only in the uncommitted tree; in new-exist they would have made the hub-ahead guard skip all of WNE-01..11.
  - It also makes the Referred checks tell "filter ran" apart from "nothing changed".
- **Results:**
  - dashboard set (14 files) 114/0;
  - unit 160/160;
  - production build OK;
  - gate MATCHED 181/181.
- **Lesson:** before calling something an app bug, check that the failing assertion ran on the screen it names. A heading check next to each membership check would have caught this on 17 Nov.

## 2026-11-18 — the dashboard no longer waits for new_user_data

The morning fix made the whole dashboard wait for `new_user_data` (one whole-collection read). The operator said load time matters and chose the narrower option: **only what that read decides waits for it.**

- **Proof first.** WNU-03 holds the read in the browser and expects the headline while it is held. Run against the waiting code, it failed at "the Total Enrolled headline shows the real figure" (element not found). After the change it passes.
- **What waits now:**
  - The three People cards (Existing Participants, New Users, New Users Not Enrolled). They show a quiet bar instead of the number, with "Loading" for screen readers. They are disabled and `aria-busy`, and they keep their labels and hooks. New hooks: `wdash-exist-loading`, `wdash-new-loading`, `wdash-new-ne-loading`.
    - If the read fails, they show "—" and stay disabled. The error is logged as before.
  - The chat-group card. A new user's uid lives on `new_user_data`, so the card is hidden until the read lands, and stays hidden if it fails.
  - Sale Achieved. New users' emails come from `new_user_data`, so the lookup waits for it. The card shows "…" meanwhile, and "—" if the read failed. Before this change the lookup could start before the read landed and leave new users out.
- **When it lands** (`onNewUserDataSettled`):
  - It rebuilds the profile overlay from the latest participant metadata (kept in `participantMetaDocdata`).
  - An open side panel is patched in place by `panelEntryFill` (engine, unit-tested). Rows, filters, search and sort all stay. Share Claimed's "Referred:" names are filled in too, through the new `referredIds`.
  - Every figure is re-derived.
  - Only after that does `newUserDataReady` settle.
- **Waiting at the point of use.** These read new users' details, so they await `newUserDataReady` before acting:
  - both exports and the forms export;
  - the email, WhatsApp and notification senders;
  - the New/Exist pick;
  - the Clear, Zoom, Extended timeline and Quiz dialogs.

  `prepareCSVData` and `viewQuiz` also stopped throwing for a person who has no profile map entry.
- **Why Firestore Lite for this one read** (`workshop-dashboard.new-user-data.ts`):
  - The full SDK sends a one-shot `getDocs` over the same Listen WebChannel as the live listeners. The big result shares that pipe with the dashboard's own reads, and the hub cannot hold it alone: holding one Listen POST stalls every later read.
  - Lite sends a plain REST `runQuery`. It uses the same app, the same signed-in user's token and the same rules, and keeps no listener or cache.
  - It is pointed at the emulator in emulator builds. There is no AppCheck anywhere in the app. The build has no SSR (empty prerender list), and the file has no browser-only calls anyway.
  - **Cost:** +54.8 kB minified (about 14 kB gzip) in the lazy dashboard chunk only (417.3 kB raw / 78.3 kB transfer). The initial bundle is unchanged.
- **Results:**
  - WNU-03 passed 3 of 3 runs.
  - The new-users-panel file passed 4/4.
  - The dashboard set (14 files) passed 116/0.
  - Dashboard-folder unit tests: 297 passed. The 6 failures are the known empty "should create" stubs.
  - The production build is OK, with no dashboard warnings.
  - The gate is MATCHED, 184/184.
  - Hub commit `a71e3cf`, local only.
- **Surprises:**
  - Five component unit tests (in two spec files) build the component with `Object.create`, so field initialisers never run. They now set `newUserDataState = 'ready'` explicitly.
  - WNU-04's console guard also caught the Lite SDK's own `RPC_ERROR` line for the request the test aborts on purpose. The test now ignores that line, narrowly.
- **Open:** offline, Lite has no cache, so a dashboard opened offline shows "—" on the three cards. The full SDK's memory cache was empty at load time anyway.

## 2026-11-18 — review of the non-blocking load: two fixes

A review of the change above raised two medium findings. Both held up against the code, and both are fixed.

- **New / Exist could show the wrong people while new_user_data was out.**
  - **What went wrong:** the radios stayed enabled while loading and after a failed read. Picking New switched the heading to "Filter New" at once, but the list still showed everyone until the read landed. Any search, tag or date change in that window ran the split against an empty map, so New showed nobody and Exist showed everyone. After a failed read that was permanent, with nothing on screen saying so.
  - **Fix:** New and Exist are disabled until the read lands, and stay disabled if it failed. A quiet note under them (new hook `wd-side-filter-wait`) says "New and Exist are still loading…" or "…are unavailable right now." All stays available.
  - `applyFilterSide` also skips the New / Exist step unless the read has landed, as a second guard.
  - The "pick while loading, applied when it lands" path (`onSideFilterOptionChange`) is gone. The radios call `applyFilterSide` again, as before the redesign.
  - **Why disable rather than wait:** a pick that waits shows a heading that does not match the list. A disabled option with a note never shows a wrong list.
- **The Lite read had no retry and no timeout.**
  - **What went wrong:** one dropped connection left the three People cards, Sale Achieved and the chat card on "—" until a reload. A stalled request left the cards loading for good, which requirement 5 rules out. The full SDK it replaced retried by itself.
  - **Fix:** `retryRead` in the engine (unit-tested, with injectable sleep):
    - A dropped connection, a server hiccup or a rate limit is tried again twice, after 1s and then 3s. Lite reports a fetch that never got an HTTP answer as `unknown`, so that code counts as transient.
    - Rules, auth and a bad query are not retried, because they would fail the same way again.
    - The whole read gives up after 60s and counts as failed. The cards say "—", and the actions waiting on it go ahead.
    - A read that was already out and lands after the deadline still fills the dashboard in (`acceptLateNewUserData`). It only runs after the failed state has settled. No new attempt starts after the deadline.
  - **Why accept a late landing:** on a slow network a large collection can take longer than any fixed deadline. "—" followed by the real numbers is better than "—" until a reload.
  - **Not done:** a manual "retry" control on the "—" state. It was optional in the review, and it would need a hook and a hub case.
- **Hub** (`workshop-dashboard-new-users-panel.spec.ts`):
  - **WNU-03, while held:** New and Exist are disabled, the note says "loading", and a forced click picks nothing (still All, still everyone).
  - **WNU-03, after release:** the note is gone, New and Exist are enabled, and New and Exist each match the oracle.
  - **WNU-04:** the read is tried three times before it counts as failed. New and Exist stay disabled, and the note says "unavailable".
  - **New WNU-05:** the first attempt is dropped and the retry fills the cards in with the oracle numbers. "Error fetching new_user_data" is never logged.
  - The 60s deadline is pinned by unit tests, not e2e. A one-minute hold is not worth the run time.
- **Hub pushed through `3d6b1d5`** (2026-11-18 14:13): `4cde14b`, `58f94c4`, `a71e3cf`, `3d6b1d5`. The full workshops suite before the push: 235/1/33. The one failure was WS-40 (EiFlix Home config, a click timeout, unrelated); its file re-run alone was 7/7. Nothing new had landed upstream, so no rebase was needed.
