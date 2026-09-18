# 2026-08-18 — content analytics dashboard: side-panel list truncation + related list bugs

Screen: Content Intelligence → `src/app/content/content-analytics-dashboard/content-analytics-dashboard.component.{ts,html}`
Complaint: "in the rising fans I'm seeing 31 count but when I click, the names are showing 6 only.
Also check the whole screen, where all the bug is there in viewing the list."

## The reported bug — why 31 became 6

`openDialogBox()` was:

```ts
this.dialogProfiles = profileid.map((p) => this.participantMetaDataMap[p]);
```

`participantMetaDataMap` is built from the **`participant metadata`** collection, but the profile
ids being mapped come from **`content analytics`**. Those two sets do not match: anyone who
watched content but has no `participant metadata` doc (guests, deleted/never-provisioned
profiles, ids logged as `UnKnown`) maps to `undefined`.

The panel template then did `p.name` and `getJourneyDetails(p.profileid)` with **no null guard**.
Reading `.name` off `undefined` throws a `TypeError` *during change detection of the `*ngFor`*,
which aborts the rest of the row rendering — so the rows before the first metadata-less profile
paint and everything after it does not. `dialogProfiles.length` (the "31 profiles" line) was
still correct, because the array really did have 31 entries; 25 of them were `undefined`
placeholders that killed the render at the 7th.

This is why the count and the visible list disagreed, and why the shortfall looks arbitrary —
it is simply "how many good profiles happen to sort before the first bad one."

**The count 31 was never the wrong number. The list was.**

## Other list-viewing bugs found on the same screen

### 1. KPI counters were never reset when the date range changed
`fetchContentAnalytics()` cleared `participantContentMap` / `contentMap` / `contentTypeMap` but
then seeded the counters from the *previous* range:
```ts
let totalUniqueUsers = this.totalUniqueUsers;   // <- carried over
```
`totalUniqueUsers`, `totalUniueContents` and `totalWatchHours` accumulate off `docChanges()`
deltas, so pressing **Apply** a second time left the Unique Users / Unique Videos / Content
Consumption cards showing *old range + new range* while every list underneath showed only the
new range. Same class of "card says X, list shows Y" as the reported bug.

### 2. `applyDateRangeFilter()` permanently killed `destroy$`
It called `this.ngOnDestroy()`, which does `destroy$.complete()`. A completed Subject can never
emit again, so from the second Apply onward `takeUntil(this.destroy$)` never tore anything down:
each Apply stacked another `recommended mix playlist` subscription, and the stale ones kept
firing and overwriting `playListTableDateSource` with data for an older date range.

### 3. Fan classification double-counted watch time
```ts
if (timeDelay / 86400000 === 1) {
  participant.maxContWatchDates.push(contDate);
  participant.maxWatch += totalTimeSpend;   // <- added here
}
...
participant.maxWatch += totalTimeSpend;     // <- and again here
```
Every log that continued a streak added its seconds twice, so `maxWatch` cleared the 18000s
(rising) and 36000s (superfan) thresholds roughly twice as fast as intended. **The Rising Fans
and SuperFans counts have been over-reported.** Expect both numbers to *drop* after this fix —
that is the fix working, not a new bug.

### 4. Platform Comparison panels crashed on an empty platform
`openPlatformComparView()` did `this.contentTypeMap[platform].completed.values()` unguarded. The
key only exists once at least one log of that type lands in the selected range, so clicking
Participants/Completed on a platform with no activity (commonly **General**) threw instead of
opening an empty panel.

### 5. Participant table search hid every profile with no metadata name
`filterParticipants` returned `false` when the metadata name was blank — the same metadata-gap
population as the reported bug, made invisible a second way. It also only ever matched on name.

### 6. `completedPlayList.delete(profileId)` — wrong id
`completedPlayList` is a Set of **playlist** ids; the code deleted a **profile** id from it, so
the "Playlists" column (`completedPlayList.size / recommendedPlaylist.size`) never decremented
when a playlist stopped being complete.

### 7. Loading bar ran backwards
`getLoadingProgress()` counted `state === true` as loaded, but `true` means *still loading* —
the bar started at 100% and fell to 0% as the screen finished.

## The change

`content-analytics-dashboard.component.ts`:
- **`openDialogBox()`** rewritten: drops null/empty ids, de-duplicates, and always emits a real
  object — `{...meta, profileid, name: meta?.name || 'Unknown participant', email, hasMetaData,
  journey}`. Never `undefined`, so one bad profile can no longer take the list down with it.
  `journey` is precomputed here via `getJourneyDetails()` instead of being called from the
  template (it was called 4× per row per change-detection cycle and returned a fresh object each
  time). Ends with `cdr.detectChanges()` (component is `OnPush`).
- **`trackByProfileId`** added for the panel `*ngFor`.
- `dialogProfiles` typed `any[]` (was implicitly `never[]`).
- **`exportdialogData()`** — null-safe, and now exports Profile Id, Customer Status, Last
  Completed Journey, Active Journey and Financial Status alongside Name/Email, matching the
  columns actually shown in the panel.
- **`fetchContentAnalytics()`** zeroes `totalUniqueUsers`, `totalUniueContents`,
  `totalWatchHours`, `totalSuperFans`, `totalRisingFans` next to the map resets.
- **Streak accumulate** — removed the duplicate `maxWatch += totalTimeSpend` in the
  consecutive-day branch; the single accumulate after the if/else now covers all branches.
- **`applyDateRangeFilter()`** no longer calls `ngOnDestroy()`; it does
  `destroy$.next(); destroy$.complete(); destroy$ = new Subject<void>()`.
- **`ngOnDestroy()`** now also calls `analyticsSubscribe()` — that listener is a raw
  `onSnapshot`, not routed through `destroy$`, and was leaking past component teardown.
- **`openPlatformComparView()`** reads through `contentType?.completed?.values() || []`.
- **`filterParticipants`** returns `true` for an empty search, and otherwise matches name **or**
  email **or** profile id, so metadata-less participants stay reachable.
- **`completedPlayList.delete(recommandedPlaylistId)`**.
- **`getLoadingProgress()`** counts `state === false`.

`content-analytics-dashboard.component.html` (panel `<tbody>` only):
- `*ngFor` gets `trackBy: trackByProfileId`.
- `p.name` → `p?.name || 'Unknown participant'`; `profiledetails(p?.profileid)`.
- The four `getJourneyDetails(p.profileid).x` calls → `p?.journey?.x`.

`ng build --configuration development` → success (only the pre-existing `journey-onboarding-detail`
CSS-nesting warnings).

### Revert guide (per-change, this screen only)
1. **Panel truncation fix** — `.ts`: restore
   `this.dialogProfiles = profileid.map((p) => this.participantMetaDataMap[p]);` and delete
   `trackByProfileId`. `.html`: restore `*ngFor="let p of dialogProfiles"`, `{{ p.name }}`,
   `profiledetails(p.profileid)` and the four `getJourneyDetails(p.profileid).status/.last/
   .active/.financeStatus` cells. (Reverting this brings the 31→6 truncation back.)
2. **Export columns** — `.ts` `exportdialogData()`: cut back to `Name` + `Email` only.
3. **KPI counter reset** — `.ts` `fetchContentAnalytics()`: delete the five `this.total* = 0` lines.
4. **Streak double-count** — `.ts`: re-add `participant.maxWatch += totalTimeSpend;` inside the
   `if (timeDelay / 86400000 === 1)` branch. (Rising/SuperFan counts go back up.)
5. **destroy$ recreate** — `.ts` `applyDateRangeFilter()`: replace the three lines with
   `this.ngOnDestroy();`.
6. **onSnapshot teardown** — `.ts` `ngOnDestroy()`: delete the `if (this.analyticsSubscribe)` block.
7. **Platform panel guard** — `.ts` `openPlatformComparView()`: restore the direct
   `this.contentTypeMap[platform.toLocaleLowerCase()].completed/.profileid` access.
8. **Participant search** — `.ts` `filterParticipants`: restore the name-only version that
   returns `false` on a blank name.
9. **completedPlayList id** — `.ts`: change `recommandedPlaylistId` back to `profileId`.
10. **Loading bar** — `.ts` `getLoadingProgress()`: `state === false` → `state === true`.

## Pending / caveats

- **Not verified in-browser.** The dashboard is Firebase-auth gated against live Firestore, so
  the preview cannot reach it; verified by clean development build + logic review only. Worth a
  real-data spot check: open Rising Fans and confirm the row count now equals the card, and that
  rows reading "Unknown participant" correspond to profiles genuinely absent from
  `participant metadata`.
- **Rising Fans / SuperFans numbers will drop** after the streak fix (#3). If the operator
  expects the old, larger numbers, the thresholds (`>=5 days / 18000s` rising, `>=10 days /
  36000s` superfan) are what to renegotiate — not the accumulate.
- **"Unknown participant" rows are a data signal, not cosmetic.** If many appear, `content
  analytics` is logging profile ids that `participant metadata` does not have. Worth a separate
  look at who writes those logs. `hasMetaData` is on each row for a future badge/filter.
- **Still unfixed (out of scope, cosmetic/known-stub):** playlist table `Started` sorts by a
  constant `0` and `Avg Watch Time` renders a hard-coded `N/A`; `contentCustomSorting`'s
  `hviewer` case has an operator-precedence quirk (`a / b || 1`); `ngAfterViewInit()` is
  re-invoked on every snapshot, which re-seats the paginator and can bounce a user off the page
  they were reading; `totalWatchHours` re-adds the full `totaltimespend` on a `modified`
  docChange rather than applying a delta.
