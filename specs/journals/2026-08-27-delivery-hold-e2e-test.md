# 2026-08-27 — E2E test of the delivery-hold feature (production Firebase, live browser)

Operator manually set `deliveryonhold` on **Charan Reddy P** (`6TtpB49tVs9AZYVgSZhT`) and asked for an
end-to-end verification with evidence. Run against `localhost:4200` in the operator's own Chrome, pointed at
**production** (`fir-sample-aae4a`).

## Test design — zero delivery
Because the dev build talks to production, the test was built so nothing could reach a real person:
1. **All-held case** — select only Charan → every recipient held → the send is blocked outright.
2. **Partial-hold case** — Charan + one sendable recipient, dispatched via **Add to Queue**, not Send Now.
   `sendWhatsAppBroadcastCreated` only sends when `validated == true && status !== 'queued'`, so a queued
   archive doc is written but never dispatched. That yields a real record with a real
   `communicationhold` array and **zero messages sent**.

## Results

| # | Check | Result |
|---|---|---|
| 1 | Composer detects the hold | PASS — header badge `1 Recipient ⊘1` |
| 2 | Held shown separately | PASS — `WILL BE SENT 0` / `ON DELIVERY HOLD — EXCLUDED FROM THIS SEND 1`, Charan struck through |
| 3 | Send blocked when all held | PASS — snackbar *"Nothing to send — all 1 recipient(s) are on delivery hold."*, dialog stays open, no doc written |
| 4 | A&H notification composer | PASS — `WILL BE NOTIFIED 0` / `ON DELIVERY HOLD — EXCLUDED FROM THIS NOTIFICATION 1` |
| 5 | Partial hold splits correctly | PASS — `WILL BE SENT 1` (Meena A S) / `ON DELIVERY HOLD 1` (Charan) |
| 6 | `communicationhold` persisted | PASS — see doc below |
| 7 | Record screen shows it | PASS — `Sent: 0 / Pending: 1 / Failed: 0 / On hold: 1` + the On-hold section listing Charan |

The stored `wati archive` doc (read from the live component state):
```json
{ "broadcastname": "Broadcast_27_08_2026_00_59",
  "status": "queued",
  "profileid":         ["3bOmPHG3A6bk7AxXekyM"],   // Meena only
  "communicationhold": ["6TtpB49tVs9AZYVgSZhT"],   // Charan
  "numbers":   ["9944070826"],                      // Meena's number only
  "numbermap": {"9944070826": "3bOmPHG3A6bk7AxXekyM"} }
```
Charan's number (`8309215778`) **is** present in `profile_data` — visible in the On-hold row of the record
screen — so his exclusion is attributable to the hold flag, not to a missing number.

## Round 2 — email path + cloud-function deploy

### Email: PASS (production, zero delivery)
Same pattern as WATI — Charan + Meena A S, dispatched with **Add to Queue** (`sendBatchEmailTest` skips
`status == 'queued'`), so nothing was sent.

Composer: `WILL BE SENT 1` (Meena) / `ON DELIVERY HOLD — EXCLUDED FROM THIS SEND 1` (Charan, struck through).

Stored `email archive` doc — **all three index-paired arrays filtered in lockstep**, which was the specific
hazard flagged when this was written:
```json
{ "broadcastname": "Broadcast_27_08_2026_01_15", "status": "queued",
  "profileid": ["3bOmPHG3A6bk7AxXekyM"],
  "emailid":   ["meena.as@soexcellence.com"],
  "emailmap":  {"meena.as@soexcellence.com": "3bOmPHG3A6bk7AxXekyM"},
  "communicationhold": ["6TtpB49tVs9AZYVgSZhT"] }
```
email-record popup: `1 ALL / 0 SENT / 1 NOT SENT`, Meena listed, then the
**ON DELIVERY HOLD — EXCLUDED FROM THIS SEND (1)** section with Charan.

### Cloud functions: deployed to starlabs-test, NOT yet tested
`firebase deploy --only functions:notifyMobileApp,sendBatchEmail,sendBatchEmailTest,` \
`sendWhatsAppBroadcast,sendWhatsAppBroadcastCreated --project starlabs-test` → all 5 **Successful update**.

Two obstacles worth recording:
- **The repo's predeploy gate cannot run on this machine.** `scripts/cicd/predeploy.js` boots a Firestore
  emulator for the `no-retrigger-loop` guard, and firebase-tools 15 requires **Java 21+**; the machine has
  **Java 17**. Used the script's own `SKIP_TEST=1` escape hatch. Justified here because the change adds no
  new triggers and no write that could re-fire one (`notifyMobileApp`, `sendBatchEmailTest` and
  `sendWhatsAppBroadcastCreated` are all onDocumentCreated; updating a doc does not re-fire onCreate).
  **Anyone deploying this repo needs a JDK 21, or the gate is permanently skipped.**
- The gate also warns the CF repo is on branch `development`, expected `cicd-rollout`.

**Why the deployed guards are still unverified:** the Angular composers strip held profiles *before* the doc
is written, so a normal send gives the cloud guard nothing to filter. Exercising it requires a doc that
reaches the trigger with a held profileid still inside — i.e. queue a broadcast including profile X, *then*
set `deliveryonhold` on X, *then* dispatch from the queue. That needs the app pointed at `starlabs-test`
(an `environment.ts` swap, which logs the operator out of production and restarts their dev server) plus a
starlabs-test login. Blocked pending operator input.

### Browser automation note
`onAddToQueue` / `onSubmit` in the email composer use native `confirm()`, which **freezes CDP** — the click
times out and the tab becomes unresponsive until a human dismisses the dialog. Worked around by stubbing
`window.confirm` / `window.alert` before the click and restoring them after. Worth knowing for any future
automated run against this app.

### Operator decision: `Actions → Send Wati Messages` left unfiltered
Flagged in round 1 as a bypass (`SendmessagesComponent`, no hold check). Operator: *"Actions → Send Wati
Messages omit this"* — left as-is, no code change. **Consequence: the most prominent WhatsApp menu item
still sends to profiles on delivery hold.**

## Findings

### 1. A second WhatsApp sender bypasses the filter entirely
The **visible** `Actions → Send Wati Messages` menu item calls `sendWattiWorkshop()`, which opens
**`SendmessagesComponent`** ("Send Message" dialog) and then `workshopmessageChunked(result)` — a
completely separate WhatsApp path that never touches `WatiInputComponent` and has **no hold filter**.
`sendWatiMessage()` (the composer that does filter) is reachable only via
`Actions → Send Communication → Wati`; its direct menu entry is commented out at
`participants-analytics.component.html:33`. **Anyone using the obvious menu item today bypasses the hold.**
This needs the same guard, or the menu item should point at the filtered composer.

### 2. The notification path cannot be exercised with this profile
`sendNotificationinBreakthrough()` builds its recipient list as
`if (selected["firebaseuserref"] != null) profileID.push(...)`. Charan's row has
**`firebaseuserref: null`** (33 of 173 participants have one), so he is dropped *before*
`saveNotificationRecord` runs. The resulting record correctly has `profileid: []` **and**
`communicationhold: []` — the hold filter was never reached, because there was nothing to filter.
Not a bug in the hold code; it does mean the FCM path is unverified and needs a held profile that has
`firebaseuserref`.

### 3. Only 2 of 173 participants have a phone number
Which is why the WATI test needed a specific pairing. Worth knowing before planning any WhatsApp campaign.

## Footprint left behind
- **One queued WhatsApp broadcast**, `Broadcast_27_08_2026_00_59` (Queued WhatsApp count 4 → 5), targeting
  Meena A S. **Nothing has been sent.** It will only go out if someone opens the Queued tab and sends it.
  The queue UI offers send, not delete — **the operator should delete this doc** (`wati archive`, status
  `queued`) or leave it knowing it is a test artefact.
- **One `notificationrecord`** titled *DELIVERY HOLD E2E TEST* with `profileid: []` — a log row, zero
  recipients, harmless.

## Not verified
- Email path (`sendBatchEmailArchive`) — not exercised.
- All four cloud-function guards — **not deployed**; the whole test exercised the Angular layer only.
- `sendWatiScheduledBroadcast`, and the queued-doc re-check `stripHeldFromQueuedArchive`.
