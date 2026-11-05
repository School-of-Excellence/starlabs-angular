# 2026-10-13 — Live checks + amount in the panel exports

Continues `2026-10-12-users-section-date-range.md` (the Users-section work of 2026-10-12/13).

## Live render of the New Users to Paid card

The words and the ₹10,486,474 figure were first checked only by a unit test and a hand-written
mockup. They have now been checked on the **real component on the emulator**: the emulator build
has no Watson (by design), so a throwaway Playwright check used Angular's dev API
(`ng.getComponent` + `ng.applyChanges`) to give the paid rows the totals Watson would return. It
confirmed `₹10,486,474`, "One crore four lakh eighty-six thousand four hundred seventy-four",
"Purchased Journey", no "found" text, and the panel's "Amount high–low" sort putting that row first.
The check was **not committed** — injecting state through a debug API is fine for one-off proof
but not something CI should depend on.

## Export now carries the amount (operator: "in both … when i export i want with the amount")

- `exportPanel` was split: `panelExportRows(panel)` builds the sheet (header + rows) and
  `exportPanel` only writes it. The split exists so the rows can be unit-tested without triggering
  a browser download.
- **New Users to Paid → "Total Amount"**: the Watson total, rounded to the rupee (as Journey Support
  displays it), blank for people not found.
- **Master Class Purchase → "Amount"**: the payment's `amountRupees` (rows now carry a numeric
  `amountValue` beside the display label).
- Both are **numbers, not "₹…" text**, so the sheet can be summed in Excel. Other panels gain no
  column.
- Verified by a throwaway live check that clicked the real Export on both panels and read the
  downloaded files with the app's SheetJS: Master Class `NU Alpha … 499`, New Users to Paid
  `NU Charlie … 10486474`. The hub cannot read .xlsx (no SheetJS there — the reason WS-55 checks only
  file size), so committed coverage is the 3 unit tests on `panelExportRows`.

Verified: build EXIT=0 · unit 103/103. No hub change.

## 2026-10-14 — Payment-schedule hover card on the New Users to Paid panel

Hovering (or keyboard-focusing) a person in the New Users to Paid side panel shows their Watson payment
schedule date by date, excl. GST, with the total.

- **No extra reads.** `loadPlanTotals()` already fetched each person's Payment Schedule to compute the
  total; it now also keeps the rows (`journeySupportSchedule()`: same `schedulemodified != true` filter,
  each `amount ÷ 1.18`, date order), so the rows add up to the total beside them.
- **Amounts are excl. GST** so they reconcile with the panel total. Journey Support's EMI column shows the
  GST-inclusive figure — a different base; the card header says "excl. GST".
- **Why not matTooltip / CDK overlay:** a schedule can run to ~59 instalments (needs a scrollable card,
  not a text tooltip), and the side panel is `z-index: 1001` — above the CDK overlay layer (1000) — so
  an overlay would render underneath it. Raising the global overlay layer would affect every overlay in
  the app. Instead the card is a component-level `position: fixed` element at `z-index: 1002`, placed
  beside the panel level with the row; with no room beside a full-width panel (phones) it drops below
  the row. 140 ms close grace + `keepPlanTip()` lets the pointer move onto the card to scroll it.
- Only rows with a schedule open it — other panels and no-Watson builds never show it.

Verified: build EXIT=0 · unit 106/106 (3 new) · WS-62 now also hovers the paid row and requires no card
(no Watson on the emulator) — passed · a throwaway live check injected a 14-row schedule into the real
component and confirmed the card renders beside the panel, lists the dates, totals ₹320,610 to match
the row, and closes when the pointer leaves (not committed — it uses the dev debug API).

### 2026-10-14 (later) — the hover card shows PURCHASES, not instalments

Operator, after hovering on real data: the card listed EMI instalments (e.g. 83,333 × 3); what they want
is **each product the person bought** — purchase date, product, amount — adding up to their total
(e.g. 1 Apr 50,000 · 10 Jun 1,00,000 · 10 Sep 1,00,000 = 2,50,000).

- Source: Watson **`ParticipantPurchases`** where `participantid ==` the same participant id Journey
  Support's lookup finds (one doc per product). Fields: `product`, `purchasedate_ts` (falls back to the
  `purchasedate` 'yyyy-mm-dd' string, read as a LOCAL date), and **`fee`** — the price before GST; the
  doc stores `gst` and `gross` separately (`gross = fee + 18%`).
- Cancelled purchases (`cancelled: true` or `purchasestatus: 'cancelled'`) are left out. Other
  statuses (active, addons, …) are shown. Oldest first. Footer = sum of the shown fees.
- One extra **read** per person, in the same lookup that computes the total. **Watson is read-only**
  (operator directive, 2026-10-14) — the component has no write against the Watson handle.
- The row's TOTAL AMOUNT is unchanged (Journey Support's Payment Schedule rule), so the card footer
  (purchases) and the row (schedule) come from different Watson collections; if a person's schedule
  and purchases ever disagree, the two figures will too.
- The instalment helper `journeySupportSchedule` was removed; `watsonPurchaseRows()` replaces it.

Verified: build EXIT=0 · unit 107/107 · rendered with the real CSS. Real-data check is the operator's
(localhost reads production Watson).

## 2026-10-15 — Purchased Journey total amount: batched reads (same fix as Sale Achieved)
- **Why it was slow:** each paid person ran four reads in a row (profile, Participants, Payment
  Schedule, ParticipantPurchases), with only six people in flight. A few hundred people meant
  hundreds of round trips back to back.
- **Now:** every step reads 30 people per `in` query, and all queries run at once. That is three
  stages in total, with schedule and purchases read side by side.
- **The Journey Support result is unchanged.** Each person's `where ==` answer is rebuilt from the
  batch by `groupLikeEquality`: the field's exact value (case-sensitive, so a number and its text
  form stay apart), in document-id order.
- The schedule order follows `journeySupportScheduleOrder`, which matches `orderBy('date','asc')`:
  rows without `date` drop out, and ties break on document id.
- A profile whose email isn't text still runs the old single-person chain.
- If one chunk fails, the people in it show "—" (not found), as before.
- Watson is read only.
- Unit tests: 109/109, including two new cases.
- Not verified against production Watson here: the emulator has no Watson. The operator checks on
  localhost.

## 2026-10-17 — Master Class Purchase export: Workshop column
- `panelExportRows` adds a "Workshop" column, after User Type, whenever the panel's rows carry a
  `workshopTag`. Today that is only Master Class Purchase. The value is the same detail-page title
  the row shows ("Unknown workshop" when the reference no longer resolves). Other panels' exports
  are unchanged.
- Tests:
  - Unit: 109/109.
  - Hub WS-60 reads the downloaded file and checks the Workshop column holds `Dashboard Workshop
    <run>`; it passes.
  - The hub commit is local, waiting on the deferred Touch Point tests and a full-suite run before
    the next push.

## 2026-10-17 — Master Class: moved-to-existing payers are not "New User"
- Bug (operator): someone in both `new_user_data` (with `movedtoexist: true`) and participant metadata
  was tagged New User on the Master Class row, counted in the card's "new users", and exported with
  User Type "New User".
- Cause: the row tested only "is in new_user_data".
- Fix: it now uses the dashboard's existing `isNewUserProfile` rule ("in new_user_data and
  movedtoexist is not true"). That is the same rule the user counts and logs already use, so the row
  tag, the card count and the export's User Type all agree.
- Tests: a unit case for a payer in both with `movedtoexist: true` (110/110), and WS-60 still passes.

## 2026-10-17 — Whole dashboard: movedtoexist == true is never a New User (operator)
One rule everywhere: `isNewUserProfile`, meaning in new_user_data AND movedtoexist is not true.
Sites brought in line:
- Master Class Purchase rows and card count (earlier the same day).
- New Users to Paid rows. Everyone there has moved, so a row with no participant metadata no longer
  gets the New User tag; it shows as Existing in the filter and the export.
- Engagement new-vs-existing watch time. A moved person not in participant metadata now counts on
  the existing side; before, they counted as new.
- Non-Active Users / Device Breakdown. A moved person with no metadata doc stays listed, but as
  existing (isNud false), so they move out of the "New Users" bucket counts.
- `resolveProfiles`, shared by the Viewers, Hot Leads and Non-Active panels: no New User tag for moved
  docs, so cohort filters and export User Type follow.
Already correct: Total New Users (filters movedtoexist), App Logs and consumption cohorts (already
used isNewUserProfile).
Tests: a unit case for the paid rows, the resolver and the export User Type (111/111). The
eiflix-ops-dashboard e2e file was re-run; the machine was heavily loaded at the time.

## 2026-10-21 — Shared People Send dialog + Hot Leads "Send to Slack"
- New shared component `New-Workshop/people-send-dialog/`. The operator will reuse it on other screens.
  - It loads NOTHING: the caller passes `{ title, subtitle?, rows: [{ name, email, phonenumber,
    journey }] }` (`people-send-dialog.model.ts`).
  - The table has a checkbox column first, sortable Name / Email / Phone / Journey, a paginator
    (10/25/50/100), and a search box across all four fields.
  - The header box picks everyone the search shows, across pages. A "N selected · shown of total"
    count sits beside it.
  - **Send** is enabled only with at least one pick, and deliberately has no action yet; the
    operator will define it next.
  - Hook prefix `psd`.
- Layering: the dashboard's side panel (z-index 1001) sits above the CDK overlay container (1000). The
  dialog adds `psd-over-panels` to the overlay container while open (global rule in `styles.css`,
  z-index 1100) and removes it on destroy, so any screen with a high side panel works without
  per-screen CSS.
- Hot Leads panel only: a "Send to Slack" button (`eif-send-to-slack`) on its own full-width line
  under the toolbar. The toolbar now wraps; other panels are unchanged. It passes `panel.viewRows`,
  so the panel's search / cohort / journey filter applies, and journey comes from `journeyTag`
  (blank for new users).
- Tests:
  - Model unit spec: 2/2.
  - Hub WS-71: seeds two people over 3h and one under, then drives the button and the whole dialog;
    it passes.
  - The readiness gate is MATCHED (dialog 14/14 hooks, dashboard 119/119).
  - The hub commit is local, waiting for a full-suite run before push.
- 2026-10-22: **Export CSV** in the People Send dialog (`psd-export`), beside Send.
  - Enabled only with at least one pick.
  - Exports exactly the selected people (Name, Email, Phone, Journey), in the table's current sort
    order, from what the caller passed. No reads.
  - Includes a byte-order mark so Excel keeps names intact.
  - File name `<title-slug>-<yyyy-mm-dd>.csv`, e.g. `send-to-slack-2026-10-22.csv`.
  - CSV text and file name are pure helpers in `people-send-dialog.model.ts`; the unit spec is 4/4.
  - Hub WS-71 checks the button is disabled, enabled, the file name, the header, and that only the
    selected person is exported; it passes. Two hub commits are local.
- 2026-10-22: Send to Slack moved into the Default / Export row (operator). The three buttons don't
  fit beside the cohort switch in the 460px panel, so in the Hot Leads panel only
  (`eod-ptool-row-hot`) the switch takes its own full-width line and the three buttons share the next
  line, right-aligned. Other panels are unchanged. WS-71 still passes.

## 2026-10-23 — EiFlix App Logs: From–To date range
- The App Logs header has From / To date fields and Clear beside Today / 7D / 30D, the same markup and
  behaviour as the Users section.
  - The range applies once both dates are set; "Pick both dates to apply the range" shows while only
    one is.
  - Dates can be picked in either order, and nothing after today can be picked.
  - Clear (or any preset) empties the pickers and goes back to that preset.
- `logRange` gains 'custom'. `fetchLoginRows(days)` now wraps `fetchLoginRowsBetween(start, end)`,
  which adds an upper bound on `date`. That is still a single-field range, so no new index.
- The EiFlix Report keeps its own window. A custom range sets `logFetchedDays = 0`, so the report
  never borrows rows that aren't "the last N days".
- The count line reads "… EiFlix log(s) for Sep 28 – Oct 13".
- Hub WS-72 covers the hint, two windows (each holding exactly one seeded login) and Clear. WS-31 still
  passes. The hub commit is local.
- 2026-10-28: People Send dialog gains the **country code** with the phone and a **User Type** column.
  - The row model adds `countrycode`, read from either `countrycode` or `countryCode` (participant
    metadata and new_user_data spell it differently), with "+" added when missing.
  - It also adds `usertype`, which the caller decides. Phone shows as "+91 9876543210"
    (`peopleSendPhone`); with no code it shows just the number.
  - User Type is sortable, searchable, and shown as a chip (New user is orange, Existing grey).
  - The CSV is now Name, Email, Phone (with code), User Type, Journey.
  - The Hot Leads caller sets usertype with the panel's own rule: New user only when tagged, so
    movedtoexist people are Existing; unknown is ''.
  - Unit spec 5/5. WS-71 checks both spellings, both types and the CSV columns; it passes. Hub
    commits are local.

## 2026-10-28 — Send to Slack actually sends (eiflixtouchpoints -> cloud function -> Slack)
- Pattern chosen by the operator: the same app-writes-a-doc / cloud-function-posts flow as
  slackAskAH and slackLoveLetter. The webhook URL never reaches the browser; a browser JSON post to a
  Slack webhook is blocked by CORS anyway.
- **Dialog (shared, still Slack-agnostic):** `data.send(rows)` comes from the caller and returns
  `{ ok, message }`.
  - Send passes the selected people in table order and shows "Sending…".
  - The message appears on its own right-aligned line (`psd-send-status`).
  - Picks clear on success. Without `data.send`, Send does nothing.
- **Hot Leads caller:** writes ONE doc to the new collection `eiflixtouchpoints` (name chosen by the
  operator):
  `{ docid, webhookdoc: 'eiflixhotleads', heading, subheading, people: [{ name, email, phone, journey }], count, sentby, senton, status: 'pending' }`.
  - `heading` / `subheading` are the side panel's title / caption. The operator wants nothing fixed
    in the Slack message, because the dialog will be opened from other screens.
  - Journey (`slackJourneyLabel`): a new user gets "New user"; otherwise the journey, or
    "No journey".
  - The caller watches the doc for up to 60 s. 'sent' shows "Sent N people to <channel>", 'failed'
    shows the error, and no answer shows "Queued … no confirmation yet".
- **Cloud function** `eiflixtouchpointslack` in `cloud-function/functions/components/workshop.js`,
  exported in `index.js`. It is NOT committed or deployed; the operator handles that.
  - onDocumentCreated `eiflixtouchpoints/{docid}`.
  - Reads `slack webhookurls/<webhookdoc>` in production, or `slackDevTest` elsewhere, the same as
    the other Slack functions.
  - Posts via axios using the pure `eiflixTouchpointSlackMessages(people, heading, subheading)`:
    the heading, a context line with the subheading and head-count, then one section per person;
    45 people per message, under Slack's 50-block cap.
  - Writes back `status` / `channel` / `messages` / `webhookused` / `error` / `processedon`.
  - Checked locally with node: escaping, "—" for blanks, and 100 people split into 3 messages.
- Firestore rules are open (`allow read, write: if true`), so the new collection needs no rule change.
- Tests:
  - Unit 117/117, including `slackJourneyLabel`.
  - Hub WS-71 checks the written doc and plays the function's 'sent' and 'failed' verdicts. The hub's
    emulator runs the hub's copy of the functions, which won't have the new one until it is pushed.
    It passes. The hub commit is local.
- 2026-10-28 (after the first live post): the operator wanted the Slack message laid out in columns,
  with the summary line highlighted.
  - `eiflixTouchpointSlackMessages` now builds Slack's **table** block: a bold header row
    (Name | Email | Phone | Journey) and one row per person. Slack allows one table and 100 rows per
    message, so people go 99 per message.
  - The summary (subheading · head-count) is a bold section, no longer a grey context line.
  - If the workspace refuses the table block (HTTP 400, e.g. invalid_blocks), the handler re-sends
    the same columns as an aligned monospace block (`eiflixTouchpointSlackTextMessages`: padded,
    long values cut with "…", 25 rows per code block, which stays under the 3000-character limit).
  - The doc records `format: 'table' | 'text'`.
  - Checked locally with node (row counts, escaping, block sizes for 1200 people). It needs a
    redeploy of `eiflixtouchpointslack` only. The app is unchanged.
- 2026-10-28 (revised): the operator did NOT want a table, because the team copies the details out of
  Slack. Their chosen layout is one block per person as two columns, label | value, one field per row
  (Name / Email / Phone / Journey).
  - Built with section `fields` alternating label/value; fields fill left-to-right, so labels form
    one column and values the next.
  - The bold summary line stays.
  - The table block and the monospace fallback were removed, along with `format` on the doc.
  - 48 people per message (header + summary + 48 sections = Slack's 50-block cap).
  - Checked locally with node. Needs a redeploy of `eiflixtouchpointslack`.
