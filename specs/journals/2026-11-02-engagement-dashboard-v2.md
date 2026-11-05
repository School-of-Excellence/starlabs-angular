# 2026-11-02 — Engagement dashboard v2 (content engagement)

New screen `/engagementdashboardv2` (`src/app/New-Workshop/engagementdashboardv2/`). It is built fresh;
the operator said not to reuse the old `engagement-dashboard`. The first section is **Content
engagement**, chosen month by month.

## Rules (operator spec) and why they landed this way
- **Population** = `participant metadata` where `customerstatus` in `['active', 'non active']`, read once
  per visit. This applies to the whole dashboard. `ed2People` re-checks the status, so a looser read can
  never widen it. One entry per profileid (the first doc wins).
- **Journey** = `activejourney` when it is set, else `lastcompletedjourney`, else a "No journey" row
  (always sorted last). Names come from the `journey` collection, keyed by both the doc id and its
  `id` field. An id not in that list shows as the raw id rather than disappearing.
- **Engaged** = the person's profileid has a `content analytics` doc with `logdate >= start` and
  `<= end` of the chosen local month. Everyone else in the population is not engaged.
  `totaltimespend` (seconds) is summed only for the panel's watch time.
- **Never the whole collection.** The month is read as 4 back-to-back slices in parallel, for speed.
  Inner cuts use `<` the next slice's start, so there is no gap or overlap. The month end is taken to
  the last *nanosecond* of 23:59:59. `logdate` is a microsecond-precision server timestamp, so a
  `.999` ms bound would drop a view at 23:59:59.9995 from both months (found by review).
- Activity is cached per month in memory, so going back to a month is instant. A response token
  drops stale months on fast switching. A failed population read is not cached, so Retry reads again
  (review found that the first version could get stuck on a rejected promise).

## UI
- Light, classic look: Fraunces serif for the title and figures, Plus Jakarta Sans for the text (this
  font is already loaded globally). Navy for selection, gold for the eyebrow, sage = engaged,
  terracotta = not engaged.
- Every class is `ed2-*` / `is-*`, so Bootstrap/Material globals cannot reach in. A `:host button`
  reset was removed: it outranked the single-class pill colours (found by review).
- The side panel and backdrop start below the app's sticky toolbar
  (`--ed2-toolbar-h: clamp(40px, 7.4vh, 64px)`, same as the ops dashboard). At `top: 0` the toolbar
  covered the close button, which e2e caught.
- The panel traps focus (`cdkTrapFocus` + auto-capture) and returns focus on close. Escape closes the
  picker, then the panel.
- On phones the page scrolls sideways by 178px. That comes from the app toolbar, which is just as wide
  on `/workshops`; this screen itself ends at the viewport edge.
- **The route has no `authGuard` yet**, by the operator's development pattern. Add the `dashboard`
  route-config entry before guarding it.

## Old vs v2 "non active" mismatch (operator question)
The old dashboard (`engagement-dashboard.component.ts:316-319`) counts non active only when
`customerstatus == 'non active'` **and** `lastsubscriptionend` is set **and** it is in the past. v2 counts
every `non active` person, as specified. The old dashboard also groups non active people by
`lastcompletedjourney` only, and leaves people with no journey out of its journey table.

## Tests
- Unit: `engagementdashboardv2.model.spec.ts`, 8 cases.
- Hub `workshops/engagement-dashboard-v2.spec.ts` ED2-01..05 (hook prefix `ed2`):
  - Seeded world: active engaged, non active via last journey, last-month-only, an expired person who
    viewed (never counted), and a stray view.
  - Rows are checked against the seed design; the cards against the independent `ed2Oracle`.
  - Ran 2× green; readiness gate clean. Route granted in seed ROUTES.

## Pending
- Next engagement sections (the operator said content comes first).
- Guard + route config before production.

## Follow-up 2026-11-03: From / Platform filters, per-source breakdown, Clear filters
- **Filters on `from` and `platform_name`** (multi-select each).
  - Both fields are free text in mixed case, so values are grouped by trimmed lower-case key. The label
    is the month's most common spelling (ties alphabetical), so it never flips with read order.
  - OR within one filter, AND across the two: a view must match both.
  - Nothing picked = every value. Every figure (cards, journeys, panel, CSV) counts only passing views.
- **Why activity is stored as (from, platform) pairs.** Two independent per-field maps cannot answer
  "workshop views on the web". The AND needs to know which values occurred on the same view.
- **Empty values.**
  - A view with no `platform_name` reads **"Breakthroughs app"** (operator). It is a real platform,
    sorted alphabetically and not muted.
  - A view with no `from` reads "Not set" and sorts last.
- **Labels survive month changes.** A picked value missing from a new month keeps the spelling seen in
  earlier months (`knownLabels`) and the same sort order (found by review).
- **Panel rows expand** to show watch time and views per From value and per Platform, most watched
  first. The CSV gained "Watched from" and "Watched on".
- **Layout must not move when a filter is picked** (operator: "its ui changing place to next line").
  - Filters now sit on their own row under the title, and the caption no longer grows with the picks.
  - The dropdown summaries are fixed width.
  - Clear filters is always laid out and only made visible, at the far right.
  - Below 1024px the row may wrap, the same way whatever is picked.
  - ED2-08 asserts the controls' positions before and after picking.
- **Clear filters** resets status, From and Platform. It keeps the month.
- Review fixes:
  - The month picker was hidden under the filter dropdowns (equal z-index), and ED2-03 caught it.
  - Dropdown menus ran off the left edge at 641–800px, so they now open rightwards.
  - An expanded box could stay open with no data, so it is now gated on data.
- Tests: unit 10/10; hub ED2-01..08 ran 2× green; readiness gate clean.

## Follow-up 2026-11-03: past months use subscription dates (operator chose "option 2")
- **Problem.** `customerstatus` / `activejourney` hold today's values, so every past month was counted
  with today's list.
- **Rejected alternatives:**
  - a month-end snapshot collection (exact, but no history before it starts; new collection);
  - a status-change log.
- **Why the dates are exact, not an estimate.** `participantmetadata.js` (cloud function, around lines
  311–400) sets:
  - `active` only for ONE live journey (`subscriptionstart/end`, `activejourney`);
  - `non active` only for ONE completed journey (`lastsubscriptionstart/end`, `lastcompletedjourney`).

  So everyone in this dashboard has one subscription period, and it is their whole history.
- **Rule for a past month** (operator: "any day in month"):
  - period ran on at least one day of the month → Active;
  - ended before the month → Non active;
  - began after the month → not a customer yet, left out;
  - no dates → left out.

  The **current month keeps the live status** (operator). A one-line note under the caption says which
  rule the month on screen uses and how many people were left out.
- **Journey** stays the person's one journey (the same in every month), for the same reason.
- **Limitation (accepted).** People who are `none` / `discontinued` / `banned` / `late` today are not in
  the population, so they don't appear in past months even if they were active then. This follows the
  operator's population rule.
- Tests:
  - unit: 12/12;
  - hub: ED2-01..09 ran 2× green. GAMMA seeds a person who was Active last month and is Non active today,
    plus one with no dates. The oracle applies the month rule independently and checks the left-out
    counts.

## Follow-up 2026-11-03: Free users
- **Free users** = `new_user_data` docs (doc id = profileid) whose `movedtoexist` is not true. Per the
  operator, `movedtoexist: true` people already live in participant metadata.
  - The collection is read whole once per visit and filtered in the browser. Firestore cannot match
    "is not true": docs without the field never match a query on it.
- **Paid wins.** A profile also in the paid population (active / non active today) is counted once, as
  paid, never again as free.
- **Display.**
  - Status switch: All · Active · Non active · **Free users**.
  - Free users have no journey and sit in a **"Free users" row that always sorts last**, after
    "No journey", then Total.
  - Cards gain a free split ("· N free", "Free x%"); the status pill reads "Free user"; the CSV Status
    column reads "Free user".
- **Past months** (operator: "based on created"). A free user counts only if `created` is on or before
  the month's last day. A later signup is "not yet a user" and is added to the note's left-out count.
  A missing `created` still counts: there is no date to exclude them on.
- Tests:
  - unit: 13/13;
  - hub: ED2-01..10 ran 2× green. ED2-10 seeds Hari (viewed) and Ivy (joined this month), plus negative
    controls Jai (`movedtoexist: true`, viewed) and Asha (paid, also in `new_user_data`). The oracle adds
    free users independently.

## Follow-up 2026-11-03: Send from the side panel (Email / WhatsApp / Notification)
- The operator asked for the workshop dashboard Communication dialog's three buttons, "exact" same
  composers, in v2's side panel.
- **Shared service, not a copy.** The three send paths were moved unchanged out of
  WorkshopDashboardComponent into `workshop-dashboard/communication/communication-senders.service.ts`
  (root). They are: EmailInputComponent → email archive / sendBatchEmail; SendmessagesComponent →
  chunked `workshopprogressmessage` with the progress dialog; AhNotificationComponent →
  `saveNotificationRecord`.
  - The dashboard's `sendEmailToSelectedParicipant` / `sendWatti` / `sendNotificationinBreakthrough`
    keep their `can('sendcommunication')` check and their side-panel default list, and delegate.
  - Both screens now send in exactly the same way, and a future fix lands in one place.
  - Unused helpers and imports were removed from the dashboard. Its mail path still uses
    `getCloudFunctionUrl`, so that stays.
  - Regression check:
    - workshop-dashboard-communication (incl. WDC-07, WDC-14 send) 20/20;
    - workshop-dashboard-access 16/16;
    - new-workshop-controls 16/16;
    - workshop-dashboard unit specs green, apart from the old empty "should create" stub.
- **Pre-existing, kept on purpose, flagged to the operator.** The dashboard imports `environment` from
  `environment.development` (production project `fir-sample-aae4a`), and that file is never swapped by
  any build. So the send URLs point at production even in emulator and test builds. The service keeps
  the same import: moving code must not change where it sends.
- **v2 buttons.**
  - They send to the people listed in the panel (tab + search), mapped exactly like the Communication
    dialog (`ed2Recipients`: `{ profileid, name, metadata{ name, email, phonenumber, countryCode,
    countrycode } }`).
  - Counts: Email = people with an address. WhatsApp = phone AND name, the sender's own rule (review
    found the dialog's count includes nameless people the sender skips). Notification = everyone listed.
  - The panel is now 500px so the three labelled buttons fit one row; phones show icon + count, each
    button keeping a spoken label.
- **Review fix.** v2's document Escape handler closed the panel under an open composer and pulled focus
  out of it. It now ignores Escape while any MatDialog is open. ED2-11 asserts this.
- **No access check in v2 yet.** `sendcommunication` is a per-workshop grant and v2 isn't
  workshop-scoped; access will come with the route guard / route config.
- Tests: unit 14/14; hub ED2-01..12 ran 2× green; readiness gate clean.
