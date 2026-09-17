# 2026-08-26 — `deliveryonhold` extended to email + A&H notifications

Companion to [2026-08-26-delivery-hold-wati.md](2026-08-26-delivery-hold-wati.md), which established the
rule (`profile_data.deliveryonhold === true` ⇒ never send, show held recipients as their own group) for
WhatsApp. Operator: *"implement this in email record and ah-notification also?"*

## Where each channel's choke point actually is
The three channels have **three different architectures**, so "the same feature" landed in three different
kinds of place. This was the main finding of the session.

| Channel | Who decides the recipient list at send time | Filter installed in |
|---|---|---|
| WhatsApp | `WatiInputComponent` rebuilds `numbers` from `profileid` on submit | the composer (done previously) |
| Email | `EmailInputComponent` closes with a payload; the **caller** writes `email archive` | the composer, before `closeWithPayload` |
| A&H notification | the composer never carries recipients — the **caller** builds `profileID` and calls a service | `AuthguardService.saveNotificationRecord()` |

### Email — `participants-analytics/email-input/`
The composer does not write the archive doc; it `dialogRef.close(...)`s a payload that ~20 callers persist.
So the filter is `applyDeliveryHoldFilter()`, called at the top of `onSubmit()` and `onAddToQueue()`. It
rewrites three parallel structures that must stay consistent — `profileid[]`, `emailid[]`, and
`emailmap{email→profileid}` — dropping held profiles from each, and aborts with an alert if no address
survives. Nothing is recorded about who was dropped (see *Operator decision* below).

**`onSendTest()` is deliberately NOT filtered.** It overwrites the payload with `testEmailRecipients`, which
are addresses a user typed or picked explicitly to validate a template — not a participant broadcast.
Filtering there would silently drop a tester who happens to be a held participant and make the template look
broken. The filter lives in the two participant-facing paths rather than in the shared `closeWithPayload()`
precisely so the test path stays untouched.

The hold set is built inside the **existing** live `fetchProfiles()` subscription (`collectionData` over
`profile_data`, now with `{ idField: '_docid' }`) — no extra read, and it updates live if a hold is toggled
while the composer is open. Note the pre-existing `id: p['profileid']` mapping in that same subscription is
*not* the doc id; the hold set uses `_docid`, which is.

### A&H notification — `authguard.service.ts`
`AhNotificationComponent` returns only the message body. Every one of the **22** senders then calls
`this.guard.saveNotificationRecord({ ..., profileid })`, which writes the `notificationrecord` doc a backend
delivers from. That service method is the single point every notification passes through, so the filter went
there — no per-caller edits, and no way for a new sender to bypass it.

`filterDeliveryOnHold()` reads `profile_data` **fresh** — `where('deliveryonhold','==',true)`, one small
equality query — rather than using `getProfileMap()`, which is IndexedDB-cached and could be hours stale.
A "never send" rule cannot run off a stale cache.

**It fails OPEN.** If that read throws, the notification goes out unfiltered and a `console.error` is
logged. Blocking every notification app-wide on a transient Firestore error is a worse failure than missing
one hold. The first version also stamped the record `deliveryholdcheckfailed: true`; that was removed under
the operator decision below, so the console is now the only signal.

The record is written **even when every recipient is held** (with `profileid: []`). Skipping the write would
be tidier, but callers alert `"sent to N"` from their own unfiltered count and ignore the return value;
writing the doc keeps the discrepancy visible instead of hiding it.

The composer's own scheduled path (`savednotifications`, `profiles: this.profiles`) is filtered separately,
inside `refreshRecipientBuckets()` — `this.profiles` is now derived from the sendable bucket.

## Display
- **email-input** — same two-group drawer as the WATI composer: `WILL BE SENT · M` / `ON DELIVERY HOLD —
  EXCLUDED FROM THIS SEND · N`, held pills struck through, red count badge on the header recipients chip.
  Same cached-bucket + `trackBy` approach, for the same reason (see the WATI journal).
- **ah-notification** — this dialog had **no recipient UI at all**. Added a collapsible recipients bar
  (`Will be notified` / `On delivery hold`), which is also the first time this screen shows who it is
  about to notify.
- **email-record** — briefly gained the same badge. **Removed** later the same session for the reason in
  the WATI journal (*no hold display on record screens*): held profiles are filtered before the send, so
  they are never recipients on a record, and a badge there could only show present-day hold state on a
  historical row. The screen is untouched.
- **notification-record** — briefly gained an **On hold (N)** tab reading the record's stored held ids.
  **Removed** later the same session with the field it depended on (see below); the screen is back to
  Success / Failed.

## Surprises / gotchas
- **`DialogBox/ah-notification/` is dead code.** There are two `AhNotificationComponent`s; all 18 real
  importers resolve to `Participants Profile Management/participants-analytics/ah-notification/`, and the
  DialogBox copy is referenced only by its own `.spec.ts`. Only the live one was changed. Deleting the
  duplicate is worth a separate task — right now it is a trap for exactly this kind of edit.
- **`selectedTab` narrowing does not survive into a callback.** Adding `'held'` to the union broke
  `loadLogsForVisibleItems()`: an early `if (this.selectedTab === 'held') return;` does not narrow
  `this.selectedTab` inside the `forEach` arrow that follows, because it is a mutable property. Fixed at the
  time by capturing `const tab: 'success' | 'failed' = this.selectedTab` after the guard. Both the tab and
  this workaround were later removed — noted here because the trap will bite again if anyone widens that
  union.
- **Email's three parallel recipient structures can already disagree.** Selecting a queued email overwrites
  `bufferDoc.profileid` from the queued doc but leaves `emailid`/`emailmap` from the dialog data. The filter
  is keyed on held profileids and applied to all three independently, so it is correct either way — but the
  underlying inconsistency is pre-existing and untouched.

## Not covered (deliberate / can't be done client-side)
- **Scheduled notifications already in `savednotifications`.** The filter runs when the schedule is written.
  A profile put on hold *after* scheduling will still be sent, because the delivery is a backend job this
  code never runs through. The WATI equivalent was fixable (`stripHeldFromQueuedArchive` rewrites the doc
  right before the client POSTs to the send function); there is no such client-side moment here. **Enforcing
  the hold for scheduled notifications requires the same check in the cloud function.**
- Same for the email queue: `applyDeliveryHoldFilter()` runs at queue time, not at the eventual send.
- `onSendTest()` (email test sends) — see above.
- The two direct-API WATI senders in `dynamic-queue-manager{,-clone}` — see the WATI journal.

## Operator decision: no stored hold data (same session)
Asked whether held profileids were being stored, the operator's answer was **"dont store that data of
delivery on hold"**. Every write was removed:

| Removed from | Field |
|---|---|
| `wati archive` (`buildArchiveDoc`, `stripHeldFromQueuedArchive`) | `deliveryonholdprofileid` |
| `email archive` payload (`applyDeliveryHoldFilter`) | `deliveryonholdprofileid` |
| `notificationrecord` (`saveNotificationRecord`) | `deliveryonholdprofileid`, `deliveryholdcheckfailed` |

…and with them the notification-record *On hold* tab, which had no data source left.

The **filtering is unchanged** — held profiles are still never sent to on any channel. What is gone is the
persisted trace. See the same section in the WATI journal for the consequences; the important one is that
"why didn't X get this?" is now answerable only from the *current* value of `profile_data.deliveryonhold`,
which may differ from its value at send time. The in-composer display (held recipients shown as their own
group before you send) is untouched, as are the hold badges in wati-record / email-record, which read
`profile_data` live rather than any stored field.

## Verification
`npx tsc --noEmit -p tsconfig.app.json` clean; `npx ng build --configuration development` succeeds, no new
errors or warnings. Not exercised against live Firestore.

## Revert guide (per-screen)

**`src/app/Participants Profile Management/participants-analytics/email-input/`**
1. `.ts` — delete the `heldProfileIds` / `sendableRecipients` / `heldRecipients` fields, the
   `// ─── Delivery hold ───` block (`isDeliveryOnHold`, `refreshRecipientBuckets`, `trackRecipient`,
   `applyDeliveryHoldFilter`), the two `if (!this.applyDeliveryHoldFilter()) return;` lines in `onSubmit`
   and `onAddToQueue`, the `refreshRecipientBuckets()` call in the constructor, and in `fetchProfiles()`
   restore `collectionData(collection(this.firestore, 'profile_data'))` (drop `{ idField: '_docid' }`) and
   the two lines that build the hold set.
2. `.html` — remove the `.hold-count-badge` span from the recipients chip; replace the two `.rc-group-head`
   sections + two grids with the original single `.recipients-grid` iterating `getRecipientList()`.
3. `.css` — delete the trailing `/* ── Delivery hold ── */` block.

**`src/app/authguard.service.ts`**
4. Delete `filterDeliveryOnHold()` and, in `saveNotificationRecord()`, the two `holdResult` lines.

**`src/app/Participants Profile Management/participants-analytics/ah-notification/`**
5. `.ts` — delete `heldProfileIds` / `sendableRecipients` / `heldRecipients` / `showRecipients` fields, the
   trailing `// ─── Delivery hold ───` block, and the `this.loadDeliveryHolds();` call in `ngOnInit`.
   (`this.profiles` then keeps its original `ngOnInit` value.)
6. `.html` — remove the `<!-- RECIPIENTS -->` `.rc-bar` block above `.mainscreen`.
7. `.css` — delete the trailing `/* ── Recipients / delivery hold ── */` block.

**`src/app/AppEngagement/email-record/`**
8. Nothing to revert — the badges added earlier in the session were removed again; the screen is back to
   its original state. (While they existed, email-record had no `.hold-pill` CSS of its own and borrowed
   wati-record's — which only worked because notification-record renders both components as siblings.
   A trap to avoid if any of this is ever re-added.)

**`src/app/AppEngagement/notification-record/`**
9. Nothing to revert — the On-hold tab added earlier in the session was removed again with the stored
   field, so this screen is back to its original state.
