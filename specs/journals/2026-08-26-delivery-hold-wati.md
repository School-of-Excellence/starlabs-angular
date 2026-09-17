# 2026-08-26 — `deliveryonhold` enforced across WATI sending + shown in wati-record

## What was asked
Operator, in the context of the wati-record screen: *"in the profile_data there is deliveryonhold field which
is boolean, if the value is true, it should be shown that this profiles delivery is on hold and we should
filter that profiles from sending."*

## Where the two halves landed (and why they are in different components)
`wati-record` is a **read-only archive viewer** — it never sends. So the two clauses split:

- **"shown"** → `src/app/AppEngagement/wati-record/` (participants popup, category dialog, profile filter).
- **"filter from sending"** → `src/app/Participants Profile Management/participants-analytics/wati-input/`
  (the WhatsApp Campaign Composer).

The composer is the **single choke point for every WATI send in the app**: 15 screens open
`WatiInputComponent` as a dialog (participants-analytics, big-dashboard, big-cohort-clone{,-2},
dynamic-queue-manager{,-clone}, queue-planning{,-clone,-review}, initiate-event-product, channel-record,
interim-report-log, live-event-dashboard-v2/v3, product-funnel). Enforcing the hold *inside* the composer
covers all 15 with one implementation — no per-caller edits, and no way for a new caller to bypass it.

## How the check works
`wati-input.loadProfiles()` already reads all of `profile_data` into `mapProfile` keyed by profile doc id,
so `deliveryonhold` is already in memory — no extra reads.

```ts
isDeliveryOnHold(profileid) { return this.mapProfile[profileid]?.['deliveryonhold'] === true; }
```

Strict `=== true`: the field is absent on most docs, and `undefined`/`''`/`0` must mean *not* held. A
truthiness test would have been equivalent today but would silently hold profiles if the field ever became
a string.

Enforcement points, all in `wati-input.component.ts`:
1. **`populateNumbersAndMap()`** — held profileids are skipped, so their number never enters
   `bufferDoc.numbers` / `numbermap`. This is the real filter: the cloud send function
   (`sendwhatsappbroadcast`) reads `numbers`/`pending` off the archive doc, so a number that is not there
   cannot be dispatched by any path (send now, queue, schedule).
2. **`buildArchiveDoc()`** — persists `profileid: getSendableProfileIds()`. Held profiles are removed from
   `profileid` deliberately: that array is what wati-record renders as "who this broadcast went to", and
   leaving them in would show them forever as permanently-pending recipients.
   **No record of who was held is written** — see *Operator decision: no stored hold data* below.
3. **`assertHasSendableRecipients()`** — all three dispatch paths (`onSubmit`, `addtoQueueFunction`,
   `onScheduleSubmit`) abort with a snackbar when `numbers` is empty, rather than writing an archive doc
   that sends to nobody. The message distinguishes "all N are on hold" from "no valid phone numbers",
   because the second case (profile with no `number`) was previously an **existing silent failure** —
   the doc was written with an empty `numbers` array and nothing was ever sent, with no user feedback.
4. **`stripHeldFromQueuedArchive()`** — the queued path (`sendQueuedTemplate`) does not rebuild `numbers`;
   it POSTs an `archiveid` to the cloud function for a doc written possibly days earlier. A profile can go
   on hold *after* queueing, so before the POST the archive doc is re-checked against current
   `profile_data` and rewritten (`profileid`, `numbers`, `numbermap`, `pending`) with a snackbar saying how
   many were dropped. Without this, the hold would be bypassed by anything
   already sitting in the queue.

## Display
- **wati-input** — red "On hold" pill on the recipient chip (name struck through), a red count badge on the
  header `N Recipients` button, and a banner above the recipient grid: *"N recipient(s) on delivery hold —
  they are excluded from this broadcast, M will be sent"* plus the held names. The header count still shows
  the **total** selected, not the sendable count, so the number does not silently disagree with what the
  caller screen selected; the badge and banner carry the delta.
- **wati-record** — briefly gained a `.hold-pill` badge in three places. **Removed** later the same session;
  see *Operator decision: no hold display on record screens*. The screen is untouched.

## Surprises / gotchas
- **`numbermap` has two meanings in old vs new archive docs.** `wati-input` writes `numbermap[phone] =
  profileid`, and `wati-record`'s category dialog reads it that way. But
  `wati-record.initializeParticipants()` labels the popup row `name: numberMap[phone]` — treating the value
  as a *name*. The template then does `mapProfile[participant.name]?.['name']`, i.e. it treats that same
  value as a profileid again. The field name `name` is therefore a misnomer holding a profileid. Left as-is
  (renaming it touches the template and filter) — the hold lookup uses `mapProfile[numberMap[phone]]`,
  which is correct for docs written by the current composer. **Archive docs old enough to hold real names
  in `numbermap` will not resolve a hold badge in that popup** — they also do not resolve a name today, so
  this is not a regression.
- **`loadQueuedRecipients()` queries collection `'profiles'`, which does not exist** (everything else uses
  `profile_data`), so `queuedRecipients` is always empty. Not touched — out of scope, and the hold check
  does not depend on it (it reads `mapProfile`). Worth a separate fix.
- **Excel upload does not feed recipient numbers.** It supplies parameter values and a validation list only;
  `numbers` always comes from `profileid` → `profile_data.number`. So there is no second number source that
  could route around the hold filter.
- `deliveryonhold` is currently only writable from `updateprofile` (a checkbox, "Delivery Onhold"), and the
  one place it was ever displayed — a `block` icon in `profilelist.component.html:22` — is commented out.
  Before this change the field was write-only and had **no effect anywhere in the app**.

## Not covered (deliberate)
- **Email sending.** `email archive` / the email composer path was not touched. The operator's ask came in
  a WATI context; if the hold is meant to be channel-agnostic, the email composer needs the same treatment.
- **The direct-API senders** in `dynamic-queue-manager{,-clone}` that build a
  `sendTemplateMessage?whatsappNumber=` URL themselves (lines ~1219 / ~3683) rather than going through the
  composer. Those send single transactional queue messages from a phone number already in hand, not a
  profileid, so the hold check has nothing to key on without a reverse number→profile lookup.
- **Selection-time filtering** in the caller screens (e.g. participants-analytics). Held profiles can still
  be *selected* and opened in the composer; they are shown as held and dropped at send. Blocking selection
  would need an edit in each of the 15 callers.

## Verification
`npx tsc --noEmit -p tsconfig.app.json` clean; `npx ng build --configuration development` succeeds with no
errors (only pre-existing unrelated warnings). Not exercised against live Firestore — the app is auth-gated
and `deliveryonhold: true` docs would need a test profile in `starlabs-test`.

## Follow-up (same session) — held recipients shown as their own group
Operator: *"i need to able to see the delivery on hold participants seperately."* Chosen placement: the
composer.

The mixed recipient grid with inline red badges became **two labelled groups** inside the same recipients
panel — `WILL BE SENT · M` (green) and `ON DELIVERY HOLD — EXCLUDED FROM THIS SEND · N` (red, chips struck
through). The banner listing held names was removed; the group header carries the count, and the names are
the group. When nothing is held the panel renders exactly as it did before this feature — no headers, one
grid — so the common case is unchanged. If *everything* is held, the send group shows an inline note
instead of an empty grid, and submit is still blocked by `assertHasSendableRecipients()`.

**Why the buckets are cached fields, not template getters.** The first version had the template call
`getRecipientList()`, which mapped over `this.data` and returned a **new array on every change-detection
cycle** — that thrashes `*ngFor` on a broadcast with hundreds of recipients (the composer runs default CD
and re-evaluates on every keystroke in the parameter fields). `sendableRecipients` / `heldRecipients` are
now plain fields rebuilt by `refreshRecipientBuckets()` at the four points the input can actually change:
dialog data arriving (constructor), `loadProfiles()` resolving (this is the one that matters — the hold flag
is unknown until `profile_data` is in memory, so the buckets are seeded all-sendable and corrected a moment
later), `loadQueuedRecipients()`, and `resetQueuedTemplateState()`. `getRecipientList()` was restored to
returning `this.data` by reference. A `trackBy: trackRecipient` (keyed on profileid) was added so a
rebuild does not re-create every chip DOM node.

`getHeldNames()` and `getSendableCount()` were deleted — the split view made both dead.

Verified by rendering the panel markup against the real `wati-input.component.css` in a static harness
(the app is auth-gated, so the composer cannot be reached in a preview): both groups, counts, and the
struck-through held chips render as intended.

## Operator decision: no stored hold data (2026-08-26, same session)
The first implementation wrote a `deliveryonholdprofileid: []` array onto every `wati archive`,
`email archive` and `notificationrecord` doc, as an audit trail of who was skipped. Asked whether we were
storing that, the operator's answer was **"dont store that data of delivery on hold"** — so every such write
was removed, along with the notification-record *On hold* tab that read it back.

Consequences to be aware of before anyone re-adds it:
- A communication record now shows **only** who it was actually sent to. There is no persisted trace that
  anyone was excluded; the exclusion is visible in the composer *before* sending and nowhere afterwards.
- "Why didn't X get this?" can only be answered by checking `profile_data.deliveryonhold` **as it is now**,
  which may have changed since the send.
- The `saveNotificationRecord` hold check still fails OPEN on a Firestore read error, and now the *only*
  signal that it did is a `console.error` — nothing is written to the record.
- The hold badges in wati-record / email-record are unaffected: they read `profile_data` live, not stored
  data, so they show current hold state rather than hold-at-send-time.

## Operator decision: no hold display on record screens (2026-08-26, same session)
Badges were added to wati-record and email-record, then removed. The operator's reasoning, and it is the
correct one: **a held profile is filtered out before the send, so it is never a recipient on the record in
the first place.** The badge could therefore never mean "this one was skipped". All it could show was the
profile's hold state *today*, painted onto a record of something that already happened — so a participant
successfully messaged in March, put on hold in August, would render in that March broadcast as
`sent ✓` *and* `On hold`, which reads as "the message was blocked". Actively misleading.

This is not a gap left by the no-stored-data decision: even with hold-at-send-time stored, the held profiles
are not recipients, so there would be nothing to badge on an existing row. It would have to be a separate
list, which is what the (also removed) notification-record tab was.

**The hold belongs in the composers only**, where it is about to change what happens: you see who is
excluded before you press send. After the fact there is nothing useful to say on a delivery record.
wati-record, email-record and notification-record are all untouched by this feature.

## Revert guide (per-screen)

**Composer — `src/app/Participants Profile Management/participants-analytics/wati-input/`**

`wati-input.component.ts`
1. Delete the `// DELIVERY HOLD` block (`isDeliveryOnHold`, `getHeldProfileIds`, `getSendableProfileIds`,
   `getHeldCount`, `getSendableCount`, `getHeldNames`, `assertHasSendableRecipients`).
2. `populateNumbersAndMap()` — remove the `if (this.isDeliveryOnHold(id)) return;` line.
3. `getRecipientList()` — drop `onHold:` from the queued branch and restore `return this.data || [];`.
4. `buildArchiveDoc()` — remove the `profileid:` line from the object literal (the `...this.bufferDoc`
   spread restores the old `profileid`).
5. Remove the three `if (!this.assertHasSendableRecipients()) return;` lines in `onSubmit`,
   `addtoQueueFunction`, `onScheduleSubmit`.
6. Delete `stripHeldFromQueuedArchive()` and its call in `sendQueuedTemplate()`; drop `updateDoc` from the
   `@angular/fire/firestore` import.

6b. Delete `refreshRecipientBuckets()`, `trackRecipient()`, and the `sendableRecipients` /
   `heldRecipients` fields, plus the five `refreshRecipientBuckets()` calls (constructor, `loadProfiles`,
   `loadQueuedRecipients`, `resetQueuedTemplateState`).

`wati-input.component.html`
7. Remove the `.hold-count-badge` span from the `recipient-button`, and replace the two `.rc-group-head`
   sections + two `.recipients-grid` blocks with the original single grid iterating `getRecipientList()`.

`wati-input.component.css`
8. Delete the `/* ── Delivery hold ── */` block after `.rc-email` (`.rc-group-*`, `.recipient-chip.on-hold`,
   `.rc-empty-note`, `.hold-count-badge`).

**Archive viewer — `src/app/AppEngagement/wati-record/`**

9. Nothing to revert — the badges added earlier in the session were removed again; the screen is back to
   its original state.
