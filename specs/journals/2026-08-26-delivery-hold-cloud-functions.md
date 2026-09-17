# 2026-08-26 — Delivery hold implemented in starlabs-cloud-function

Plan: `specs/plans/2026-08-26-delivery-hold-cloud-functions.md`.
Repo: `/Users/macbook/Projects/Functions/starlabs-cloud-function`, branch `development`, **uncommitted**.
One file changed: `functions/components/communication.js`, +60 −1.

## What landed
Four guards, matching the plan:

| Function | Guard |
|---|---|
| `notifyMobileApp` (L79/L102/L139/L174) | held ids collected during the existing `profile_data` fetch; `profileID` filtered before STEP 2 |
| `sendBatchEmailArchive` (L1915/L2013) | new `where('deliveryonhold','==',true)` query → Set; `continue` in the index-paired loop |
| `sendWatiBroadCast` (L2947) | `continue` before the country-code guard |
| `sendWatiScheduledBroadcast` (L3407) | `continue` before `receivers.push` |

Skipped recipients appear in neither the sent nor the failed arrays.

## `communicationhold` — held profileids recorded on the record (operator request, same session)
First cut stored nothing, matching the Angular decision. Operator then asked for the held profileids on
the record **"like success and failed things"**, as `communicationhold`. This is not a reversal of that
decision: what was removed on the Angular side was a *pre-send annotation* written at compose time;
this is a *delivery outcome* written by the sender, next to `profilesuccess` / `sent` / `failed`.

Written at six points so the field is never silently absent:

| Record | Written where |
|---|---|
| `notificationrecord` | success update (L588), error handler (L607), and the all-held early return (L186) |
| `email archive` | once after the recipient loop, **before** the Postmark send loop (L2090) — so it survives a send failure |
| `wati archive` | `updatePayload` in `sendWatiBroadCast` (L3071) |
| `wati archive` (scheduled) | both the success (L3498) and `schedule_failed` (L3530) updates |

**The value is always an array of profileids**, as asked. Note this makes `wati archive` internally
inconsistent: its `sent` / `failed` arrays hold **phone numbers**, so `communicationhold` is the only
recipient array on that doc keyed by profileid. Anyone reading the doc has to know that.
`notificationrecord` has no such problem — `profilesuccess` / `profilefailed` are already profileids.

Also corrected while in there: `sendWatiScheduledBroadcast` reported
`totalSent: broadCastData['numbers'].length` — the pre-filter count. Now `receivers.length`, the number
actually scheduled.

## Decisions taken (the plan listed these as "decide first")
- **Fail-closed at the email path.** The new `profile_data` query is wrapped in try/catch that
  **rethrows**, so a read failure aborts the send and the trigger retries rather than sending
  unfiltered. This is the opposite of the Angular `filterDeliveryOnHold()`, which fails open because a
  user is waiting on a dialog. The other three inherit fail-closed behaviour for free: if a profile is
  missing from `mapProfile`, WATI drops it as "missing country code" and `notifyMobileApp` drops it as
  "no user_ref".
- **Broadcasts only.** Transactional sends (8 direct WATI call sites, `commonService.postmarkClient`,
  `wishlist.js`'s own Postmark client, `admin.messaging()` outside `notifyMobileApp`) are untouched —
  OTPs, appointment confirmations and ticket replies still reach held profiles. Extending to them is a
  policy question that has not been answered.

## `sendBatchEmailArchive` — held profiles dropped before the metadata lookups
Operator: *"in the profileids field itself we can skip the held profiles right, because unnecessarily we
are fetching participant metadata"* — correct, and it is safe. The local `profileIds` const feeds **only**
the `participant metadata` / `new_user_data` lookups; the send loop reads `archiveData['profileid'][i]`
directly, so filtering the local list cannot disturb the index pairing with `emailid`.

Two wins beyond the saved reads:
- The lookup branches on `< 30` — under 30 ids it runs a targeted `in` query, at 30+ it **scans the whole
  `participant metadata` collection**. Filtering can drop a broadcast under that threshold, turning a
  full-collection scan into a targeted query.
- `where('profileid','in',[])` throws `INVALID_ARGUMENT`. That was already reachable on an archive with no
  recipients, and filtering made it reachable on an all-held broadcast. The query is now `null` when there
  is nothing to look up, closing a latent crash.

First cut added two extra locals (`sendableProfileIds`, `lookupIds`) — the second stripped falsy ids so
that `null` profileids from test sends could not reach the `in` query. Operator: *"instead of introducing
new variable lookupIds, can filter in profileIds field only"* — right, and the null-stripping was
unjustified: the **original code already passed those nulls to the same query**, so removing them was a
behaviour change of my own making, not a fix. Collapsed to one filter:

```js
const allProfileIds     = archiveData['profileid'] || [];
const heldProfileIdList = allProfileIds.filter(id =>  heldProfileIds.has(id));
const profileIds        = allProfileIds.filter(id => !heldProfileIds.has(id));
```

`allProfileIds` exists only to compute the held list and the "N of M excluded" log — everything downstream
uses `profileIds`, exactly as before. Null handling is now byte-identical to the original. The real crash
guard was never the falsy filter but `profileIds.length === 0 → query = null`, which stays.

Also guarded: `batchEmailList` now only receives non-empty batches, and the function returns early with
`status: "completed"` if every recipient is held — otherwise a fully-held broadcast handed Postmark an
empty array, and the "mark completed on last batch" branch would never have run.

Side effect: 13 NBSP-indented lines were rewritten with ASCII spaces, so the file's
`no-irregular-whitespace` count dropped 223 → 210. An improvement, but it means the NBSP count is no
longer a clean "did I add any?" check — compare against 210 from here on.

## `communicationhold` written from both layers (operator decision)
The composers filter held profiles *before* the doc is written, so the cloud function would never see them
for anything sent from the app — `communicationhold` would have been permanently `[]` for the bulk of real
traffic, populated only for backend-originated sends and for holds set after queue/schedule time. Flagged;
operator chose to have the Angular side write the field too, **under the name `communicationhold` only** —
the removed `deliveryonholdprofileid` is not coming back.

**Angular writes it at compose time:**

| File | Where |
|---|---|
| `wati-input.component.ts` | `buildArchiveDoc()` (L865); `stripHeldFromQueuedArchive()` uses `arrayUnion` (L805) |
| `email-input.component.ts` | `applyDeliveryHoldFilter()` (L902) — merged with the queued doc's existing list, since re-sending a queued email writes back to the same doc |
| `authguard.service.ts` | `saveNotificationRecord()` (L1288) |

**The cloud function appends, never assigns.** All seven server-side writes are now
`FieldValue.arrayUnion(...)`, guarded on non-empty:
- a plain assignment would **wipe the composer's list** with `[]` on every app-originated send, which is
  the normal case — the two layers write the same field for the same doc;
- `arrayUnion()` with **zero arguments is rejected by Firestore**, so every call site is behind a
  `length > 0` / `size > 0` check. Two of them needed the update object restructured out of an inline
  literal to allow the conditional key.

Net effect: the field ends up holding compose-time holds ∪ dispatch-time holds, deduped by `arrayUnion`.

## Record screens show `communicationhold` (all three)
Once the field exists per record, the held list can be shown — and this is **not** the badge idea rejected
earlier. That badge failed because it painted *current* hold state onto a historical row; this reads the
record's own `communicationhold`, i.e. who was held **at send time**. It is a separate section in every
case, because held profiles are in none of the recipient arrays (`numbers`, `emailid`, `profilesuccess`)
and so have no row to badge.

| Screen | Where |
|---|---|
| `notification-record` | third tab beside Success / Failed in the recipients dialog |
| `wati-record` | `On hold: N` stat chip + a section under the participants list in the popup; the popup's search filters it too |
| `email-record` | a section under the recipients list in the popup |

Names/emails/numbers are resolved from `mapProfile` at read time; only the profileid is stored.

### notification-record: On-hold tab (re-added, now with a data source)
This tab existed briefly earlier in the session and was deleted along with the stored field. It is back,
reading `notificationrecord.communicationhold`.

`src/app/AppEngagement/notification-record/notification-record.component.*` — third tab beside
Success / Failed, shown only when the record has holds, listing name / email / profileid. A **tab, not a
badge**: held profiles appear in neither `profilesuccess` nor `profilefailed`, so there is no existing row
to mark.

`loadLogsForVisibleItems()` returns early on that tab — held profiles were never sent to, so no delivery
logs exist. The `selectedTab` union widening re-introduces the narrowing trap noted below: the early
`return` does not narrow `this.selectedTab` inside the `forEach` arrow that follows, so the tab is captured
into `const tab: 'success' | 'failed'` after the guard.

Not wired into `exportRecipientsToExcel()` — that export combines success + failed only. Worth adding if
the held list needs to leave the screen.

## Surprises
- **The file indents with non-breaking spaces (U+00A0) in places.** String-anchored edits failed
  silently against `sendBatchEmailArchive` for this reason, and the first successful insert copied the
  NBSP indent from its anchor line — adding 19 new `no-irregular-whitespace` lint errors on top of the
  223 already in the file. Normalised the inserted lines back to ASCII spaces; the file is at its
  original 223. **Anchor edits in this file by line number, and check `grep -c $'\xc2\xa0'` after.**
- `eslint` on this file reports 266 pre-existing errors and still exits 0, so it is not a useful gate.
  `node --check` is.
- `notifyMobileApp` returns early when every recipient is held — before STEP 2, so no in-app
  notification log rows are written either. The `notificationrecord` doc stays as written by the
  caller, with no success/failure arrays.

## Not verified
Not deployed, not run against the emulator. `node --check` passes; there is no test suite for this
component. Behaviour with a real held profile is unproven.

## Revert
`git diff` in that repo is entirely this change — `git checkout -- functions/components/communication.js`
restores it. Individually: remove the four guard blocks, the two `heldProfileIds` declarations, and
change `let profileID` back to `const` at L79.
