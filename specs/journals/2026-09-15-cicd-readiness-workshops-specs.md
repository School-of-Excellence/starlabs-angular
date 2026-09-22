# Clearing the console's "Blocked" for the workshop dashboard: what the gate really checks

**Date:** 2026-09-15 · **Branch:** `nanda-development` (app edits uncommitted; hub spec untracked) · **Status:** app side clean by the gate's own script; hub spec written, compiled, reviewed; NOT run locally (see §5)

Operator: the Release Console shows the branch **Blocked** — "Selectors gone from the app: ett-settab …",
"New elements no spec references: … (39 wdash ids)", "8 new interactive element(s) have no data-testid",
"Nothing exercises: communication-dialog.component, workshop-dashboard.component". Fix it the way the other
components pass — with test cases.

---

## 1. Where the rules live, and how to reproduce the verdict locally

The gate is **not** in this repo. It is `scripts/readiness/{readiness,lib}.cjs` in the hub repo
`School-of-Excellence/starlabs-e2e-tests`, which I cloned to
`/Users/nanda/Documents/Development/starlabs-e2e-tests` (sibling of this repo; `npm ci` done there).
The console's verdict for a branch is exactly:

```bash
cd ../starlabs-e2e-tests && node scripts/readiness/readiness.cjs \
  --app ../starlabs-angular --base origin/development --head HEAD --json
```

Four checks, in blocking order (lib.cjs `verdictOf`):
1. **NEEDS_UPDATE / "Selectors gone"** — a spec in the suites this diff locks (here `workshops`, because
   `src/app/New-Workshop/**`) references a `data-testid` the app no longer declares anywhere in `src/**`.
2. **MISSING_TEST_CASES** — per changed component (`.ts`+`.html` grouped): `untestedNew` = ids this diff
   added that **no spec in the whole hub references as a literal** `getByTestId('id')`; `newUnhooked` =
   opening tags that are `<button>`/`<a>` or carry `(click)`/`(change)`/`routerLink`/`(submit)` and have no
   `data-testid`, HEAD count minus base count; `noTestAtAll` = the component has ids but none referenced;
   plus any **added** `*.component.ts` whose ids nothing references.
3. NOT_APPLICABLE / MATCHED.

Two things that are easy to misread: the console **truncates the drift list to 5 ids**
(`working-branches.component.ts:692`), and `unhookedInteractive` counts a `<div (click)="$event.stopPropagation()">`
as interactive — three menu bodies and a table cell were part of my "8".

## 2. The "Selectors gone" half is not ours — and cannot be fixed from this branch

The real drift count is **1,076 ids across four hub specs** (`*-controls-addressable`, `new-workshop-*`),
from meena's "Interactive-Control Coverage Program". Those hooks exist only on `origin/meena-development`
(26 commits ahead of `development`, rollout approved in the console). Proven three ways: readiness on a
worktree of her branch → MATCHED, drift 0; every one of the remaining 90 ids after a trial merge is present
in her dashboard files; `git grep` finds them on no other ref.

So this half clears when **her branch lands in `development` and `development` is merged into
`nanda-development`**. A trial merge of her branch into ours conflicts in
`workshop-dashboard.component.{ts,html}` (she hooked the dashboard, including my Diagnose and Q&A
buttons as `wd-open-qadialog-2` / `wd-open-diagnose-dialog-3`), so that merge needs a hand: keep both
sides' hooks.

## 3. The "missing test cases" half — done

**App (this repo, uncommitted):**
- Hooked the 8 unhooked interactive elements — dialog: `wdash-comm-status-menu`, `-journey-menu`,
  `-country-menu` (menu bodies), `-clear-search`, `-select-cell`, `-row`, `-empty-clear`; dashboard:
  `wdash-exist-filter-body`.
- **An app bug the review caught:** the Exist panel's filter chips (`wdash-exist-status-chip`) sat inside the
  `categorybased && totalEnrolled` container, so they never rendered for the Exist panel — the earlier
  harness render hid it. The Exist container now has its own chip row (`wdash-exist-journey-chip`,
  `wdash-exist-status-chip`) and the category-based block is back to what `development` has.
- 48 `wdash-*` hooks in total. Readiness now: `newComponents 0`, no element flags. Prod build green;
  the three dashboard Karma suites (23 + 41 + 8) still pass.

**Hub (`workshops/workshop-dashboard-communication.spec.ts`, untracked):** real behaviour, not a
reference list — modelled on `workshop-dashboard.spec.ts`, using the seed's people:
- WDC-01 Exist Users Enrolled == an independent Firestore count of enrolled non-new profiles.
- WDC-02 Exist panel: status filter → chip; journey filter narrows to p0; Clear All restores.
- WDC-03 the dialog flags p0/p1 Enrolled (p1 is `enrollednotstarted` and still counts), p2 Not enrolled,
  NU Alpha New user, +91 rendered; close.
- WDC-04 audience / enrollment segments; new-users audience hides the existing-only filters; Clear N.
- WDC-05 **the operator's bug as a test**: search → tick → × → search → tick keeps both; selected panel,
  collapse/expand, show-only, chip ×, clear selection, row click via the name cell, select-all, empty state.
- WDC-06 status / journey / country menus and has-phone / has-email.
- WDC-07 WhatsApp / Notification / Email open the side panel's composers and are dismissed through
  **each composer's own close control** — the notification and email composers are opened with
  `disableClose: true`, so Escape is inert. This describe runs **without the console guard**, the same
  stance WS-14 takes: the composers read config the workshops seed does not carry (`classify/wati`,
  `classify/postmarkserver`, `email validators`) and log benign errors on open.
- A final "controls addressable" test references every hook literally (the program's convention).
Every checkbox is toggled through its native `input` and the toggle asserted — the menu hosts are
`display:block`, so a click on the host's centre lands on empty space and toggles nothing.

## 4. How it was reviewed (no emulator available — see §5)

Compiled and listed by Playwright (8 tests), then a 4-lens / 2-skeptic adversarial workflow (56 agents)
against the real templates, the seed and the Material/Playwright sources. It found, and I fixed:
`DocResult` is flat (no `.data`); the chip container bug above; block-level checkbox hosts; the two
`disableClose` composers; composers logging in the emulator; and the 120 s budget (now `test.setTimeout(180_000)`,
since login + header + full-collection load can approach it). Refuted: journey label (seed writes
`journeyname`, the dialog falls back to the id — the spec matches either), strict-mode worries (names
carry the run id), Escape on mat-menus.

## 5. Not verified: a real run

`java` on this Mac is Apple's stub ("Unable to locate a Java Runtime") so the Firestore emulator cannot
boot, and a hermetic run also needs the `STARLABS_CICD_SA` GitHub secret and a cloud-function checkout
(`SETUP.md` §2). The first real run is therefore the console's dispatch. If it fails, the evidence report
will say which step; the likeliest soft spots are the composer headings in WDC-07 and timing.

## 6. What has to land, in what order

1. **This repo:** commit the two templates (dialog + dashboard) on `nanda-development` and push — CI
   builds the pushed commit, so the spec's ids must be in it.
2. **Hub:** commit `workshops/workshop-dashboard-communication.spec.ts` and get it onto hub `main` —
   `workshops-e2e.yml` and `branch-suites.yml` read `e2e_ref: main`.
3. **Merge order:** meena-development → development → nanda-development (resolve the dashboard conflict
   keeping both sides' hooks). Until then the console keeps saying "Selectors gone" for everyone on
   `development`, regardless of specs.

## 7. Same day — platform per sub-challenge in Participant Data

Operator: each sub-challenge in `participant workshop` carries `platform_name` (string); show it on every
card in Participant Data › Challenge Progress Details (1.1, 1.2, …), and show **EiFlix Web** when it is
null or empty.

- One rule, one place: `platformNameOf(subChallenge)` on the dashboard — null/undefined/blank (after
  trim) → "EiFlix Web", otherwise the trimmed value. The display row gets `platformName` where
  `subChallengeType` and the dates are built, so the template only prints it.
- A `.pd-platform-pill` (`wdash-sub-platform`) beside the type pill — same family, tinted navy so it reads
  as a place rather than a kind, brand casing kept ("EiFlix Web", not "EIFLIX WEB"). Rendered against
  the compiled dashboard CSS + the real global sheet: "NOTE · EiFlix Web · 15 Sept 2026".
- Tests: 3 Karma cases on the rule (value / missing-null-empty-blank / padded); hub WDC-08 opens p0's
  Participant Data and checks both seeded cards read "EiFlix Web" (the seed has no platform_name, so the
  fallback is what the app chose). Readiness: still no element flags. Prod build green.
- Not a Firestore change: the field is read, never written.

## 8. Same day — "EiFlix App", the document-level platform, and a Platform Usage chart

Operator, after seeing the pill: map `eiflixapp` → **EiFlix App**; the progress document itself also
carries `platform_name` (beside `workshopparticipantenrolledRef`, `profileid`) — show it in Participant
Data; and put a chart on the dashboard from both levels.

- **Label map** (`platformLabel`, case-insensitive, punctuation-blind): blank → EiFlix Web; `eiflixweb`
  → EiFlix Web (that is what the Flutter web app stamps — checked read-only in `../workshop`);
  `eiflixapp` → EiFlix App; anything else shown as stored. `platformNameOf()` now goes through it.
- **Hero strip:** "via EiFlix App" beside the enrolment date (`wdash-pd-platform`), from
  `participantWorkshopData.platform_name`.
- **Platform Usage section** (after Challenge Progress Overview, `wdash-platform-section`), ng-apexcharts
  like the sales dashboards: a donut of participants by the platform on their progress document
  (legend rows with count + %) and a stacked horizontal bar of **touched** steps by the platform on the
  step, completed vs in progress. A step counts only once it has a status — untouched rows carry no
  platform yet, so counting them would inflate "EiFlix Web". Computed in `computePlatformStats()` from
  `participantWorkshopMap`, inside `recomputeDerivedState()`, so it follows the live snapshot.
- Tests: label map (3), stats (4) → the dashboard logic suite is 32 cases; hub WDC-08 extended (hero
  reads EiFlix Web) and WDC-09 (one enrolment row "EiFlix Web" = every progress doc, 100%; one step row
  with ≥1 completed / 0 in progress — the seed stores no platform anywhere, and WS-12's move-next stays
  on the same platform whichever order the files run). Readiness: no element flags. Prod build green.
- Rendered with a served harness running real ApexCharts on the component's exact options + the real
  global sheet: donut with "Participants 318" centre, legend, stacked bars with counts. No console errors.
- Read-only on Firestore. `ng-apexcharts` was already a dependency; no install.

## 9. Same day — merge of meena-development, gate MATCHED, pushes

Operator: pull `meena-development`, finish the workshop suite, push both repos.

- **Merge** `origin/meena-development` → `nanda-development` (`c7f57bab`). Two conflicts, both in the
  dashboard: her engine extraction (`isParticipantReadyForChallenge`, `isParticipantReadyForSubChallenge`,
  `getParticipantChallengeStatus` moved to `workshop-dashboard.engine.ts`; `normalizeStatus` now
  delegates) sat next to my additions. Resolved by dropping the moved methods and keeping mine; in the
  template, her `wd-*` hooks on the Q&A button and the New Users card kept beside my Communication
  button and Exist card. Her branch adds `amazon-chime-sdk-js` — installed `--no-save`, which again pruned
  the Zoom peers (react / redux / redux-thunk); restored the same way as on 09-10. Manifests are exactly
  the merged result.
- **Verified on the merged tree:** prod build green; 194/194 unit cases (her engine suite + my three);
  readiness **MATCHED** — drift 0, no element flags, no uncovered paths.
- **Hub:** spec + journal committed on local `main` (`e6d098a`). Push to the org repo refused —
  `Nandakumar23` has `pull` only on `starlabs-e2e-tests` (`gh api …/permissions` → `push:false`; SSH and
  HTTPS both denied), and opening a PR against it is refused as well (404 with a full-`repo`-scope token,
  i.e. org policy). So it is pushed to the only place this account can push: the fork
  **`Nandakumar23/starlabs-e2e-tests`, branch `test/workshops-dashboard-communication`** (same commit).
  A maintainer lands it with `git fetch https://github.com/Nandakumar23/starlabs-e2e-tests.git
  test/workshops-dashboard-communication && git push origin FETCH_HEAD:main` (or opens the PR from their
  account). A patch is also at `../0001-test-workshops-workshop-dashboard-communication-Exis.patch`.
- **App:** pushed `nanda-development`.

## 10. Same day — hub landed; Platform Usage moved to the bottom and made clickable

- **Hub:** write access granted → rebased `e6d098a` onto the 8 newer hub commits and pushed
  `a7ffe7c..93ff70d main -> main`. The console now has the spec.
- **Platform Usage** now renders at the bottom of the main column (after the three archive sections,
  before the side panel). "Enrolled via" is clickable — a legend row or a donut slice opens the **same
  side panel the metric cards open** (`onPlatformClick` → `selectedParticipants` → `applyFilterSide`),
  header "Enrolled via - EiFlix App", listing the people whose progress document carries that platform.
  The list is built from the progress documents — the same source the donut counts — so the panel
  count always equals the slice. ApexCharts fires `dataPointSelection` outside Angular's zone, so the
  donut handler goes through `ngZone.run`.
- Tests: 5 Karma cases (37 in the logic suite); hub WDC-09 extended — section order (below Participant
  Data), click the "EiFlix Web" row → panel opens, header names the platform, one card per progress
  document, close. Readiness on the working tree: MATCHED.
- Pulled `meena-development` again (one CI-workflow commit); prod build green.

## 11. Same day — platform pill only on completed steps; completed date with time; first CI run fixed

- **First CI run of the hub spec** (branch suites 34954615045): 6 of 10 failed on one cause —
  `participant metadata.name` is CF-owned (`profiledata_to_participantmetadata` mirrors `profile_data`,
  where the auth chain sets name = the actor email), so "WS Alpha wshop" is overwritten seconds after the
  seed. Fixed in the hub (`7563274`): `wsMetaNames` + `alignWorkshopMetadataNames()` precondition, and the
  spec keys metadata people on the actor email. evomap had documented the same trap.
- **Operator:** show the platform only on completed steps (an untouched step just printed the fallback),
  and give the completed date a time. `formatDateTime()` added to the engine beside `formatDate` (same
  locale: "15 Sept 2026, 8:05 pm"); the pill is `*ngIf` on `statusClass === 'completed'`. Unit case in the
  engine suite; WDC-08 now expects one pill per completed chip, none on untouched steps, and a time on the
  completed date. 151/151 unit cases; prod build green; readiness MATCHED.

## 12. Same day — "Users Not in Chat Group" card + panel actions; the content-suite red

Operator: `workshopconfiguration.selectedgroup` names a `supportchat` document whose `members[]` holds
Auth uids. Show enrolled people whose uid is missing, as a card after New Users Not Enrolled — only when
a group is set and the count is > 0 — with a side panel that can add each person, or everyone, to the group.

- **uid resolution** (`uidOf`): a still-new user → `new_user_data.uid`; an existing user → the id of
  `participant metadata.firebaseuserref` (a /user_data/{uid} reference; `user_ref` as an older fallback;
  either as a reference or a path string). Someone with no uid is still "not in the group" — they appear
  with a "No login yet" tag instead of an Add button, and Add-all skips them — so the operator can see who
  has never signed in rather than a count that silently excludes them.
- **Live**: the group document is followed with `onSnapshot` (subscribed when the workshop document
  arrives, unsubscribed on destroy); the card and an open panel drop people as they are added.
- **Writes**: `updateDoc(supportchat/{id}, { members: arrayUnion(uid…) })` — one write for Add-all — the
  only Firestore write in this session's dashboard work, and to an existing field, as requested.
- Tests: 9 Karma cases (46 in the logic suite); hub WDC-11 (card → panel → add one → Firestore shows the
  uid the APP wrote → panel/card follow; Add-all disabled with nobody addable) and WDC-11b (Add-all adds
  both in one write, card hides at zero). Both create the group + refs as preconditions and remove them in
  `finally`. Prod build green; readiness MATCHED (13 hub tests, 60 hooks).
- **The second CI run**: the workshops leg PASSED (the CF-owned-name fix held). The red leg was
  `content/deep.spec.ts` CN-04 — meena's spec, identical content code on both branches, passing on her
  runs by timing: an Escape meant for a closed mat-select panel reached the MatDialog and closed it
  (trace: file input at +6.4 s, dialog gone, Submit never found). Fixed in the hub (`0e4b026`): Escape only
  while a listbox is open, in the spec and in the shared `selectMatOptions` helper.
