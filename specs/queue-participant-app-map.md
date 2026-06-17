# Queue — Participant App Action Map (Flutter `breakthroughs`, development branch)

Maps every action a **participant** takes while in a queue to the exact app code and its
Firestore effect. Feeds the e2e harness (it must drive/replicate the participant side).

Source app: `breakthroughs-flutter/lib` (Flutter, **native** — NOT the Angular PWA the
original test prompt assumed). Operator board is the Angular `dynamic-queue-manager-clone`.

## TL;DR — the two transition types, as actually implemented

| Transition | Who acts | Mechanism in the app | Firestore effect |
|---|---|---|---|
| **Self-move / auto-advance** | Participant | Form submit / VideoAsk complete / "Ready" tap → `moveQueueStage()` | **Client writes `queue_token` directly** (no CF): `currentstage = variationStages[i+1]`, `stagestatus:"Approved"`, `logdate`, optional `formref`/`videoaskref`; also appends a `queue stage log` doc. AppServices.dart:1261-1314 |
| **Operator `nextstage`** | Operator (Angular) | Participant just **waits** on a `compulsoryactivity` stage; the operator board moves them | Participant app issues **no write**; it reflects the change via a `queue_token` snapshot listener. queueStageDetail.dart:76-87 |

Implication: the **self-move half of the model is testable without deploying cloud
functions** — the harness can replicate the exact `queue_token` write. CFs/operator board
drive the other half.

## The participant action router (`queueStageDetail.dart` `actionButton()` / mirrored in `queueControl.dart`)

The button shown + action taken is decided by `stageproperty[currentstage]`, in this order
(queueStageDetail.dart:56-91):

| Order | Condition | Button | Participant action → effect |
|---|---|---|---|
| 1 | now < `queuestartdate` | "The Event Starts on …" | none (disabled) |
| 2 | `actiontype == "link"` | `calltoaction` / "Open Link" | `launchUrl(actionresource)` — **no queue_token write** (:98-106) |
| 3 | `actiontype == "form"` | `calltoaction` / "Click to Fill Form" | open `FillForm` → on return, **if `selfmovable`** → `moveQueueStage(formref)` (:107-132) |
| 4 | `actiontype == "videoask"` | `calltoaction` / "Open VideoAsk" | open `ArenaVideoAsk` → on return, **if `selfmovable`** → `moveQueueStage(videoask)` (:133-163) |
| 5 | `selfmovable == true` | `calltoaction` / "Ready for Next Stage" | `moveQueueStage()` (:164-166) |
| 6 | `compulsoryactivity` non-empty | "Queue Position N" / "In Studio" / "Awaiting" / "In Queue" | **wait** — operator-driven; no write (:76-87) |
| 7 | else | (nothing) | none |

## Action → code → Firestore (full)

| # | Action | Code (file:line) | Firestore effect | Stage type |
|---|---|---|---|---|
| 1 | Open external link | queueControl.dart:168-204 | none (opens URL) | `link` |
| 2 | Fill & submit a delivery form | FillForm.dart `submitform` :2176-2239 | write `formsByClient` (**DB: `firestore-forms`**): `formid, formarray, queueref, queuetokenref, stagename, date` | `form` |
| 3 | Auto-advance after form (if selfmovable) | queueStageDetail.dart:122-131 → AppServices :1284-1310 | update `queue_token` (default DB) + add `queue stage log`; sets `formref` | `form` + `selfmovable` |
| 4 | Open/answer VideoAsk | arenaListVideoAsk.dart:165-202 | completion tracked locally (SQLite) | `videoask` |
| 5 | Auto-advance after all VideoAsks | arenaListVideoAsk.dart:186-192 → AppServices :1286-1310 | update `queue_token` + `queue stage log`; sets `videoaskref` | `videoask` + `selfmovable` |
| 6 | Tap "Ready for Next Stage" | queueStageDetail.dart:164-166 → AppServices :1261-1314 | update `queue_token` + `queue stage log` | `selfmovable` gate |
| 7 | Book a slot | queueControl.dart:806-832, :1034 | txn on `queue planning` (`usedslot++`) + `queue_token.selectedstageslot.{stage}` | slot-gated stage |
| 8 | Decline slot ("Decide Later") | queueControl.dart:865-868 | local only | slot gate |
| 9 | Send stage-chat message | queueStageChat.dart:245-264 | write `queue generation/{id}/stagechat`: `message, stage, senderprofileid, queueref, date` | any |
| 10 | Receive/accept studio invitation | home.dart:1000-1024, 1059+ | operator creates `studioinvitation`; participant sets `clientresponse:"accepted"` → joins Zoom | `compulsoryactivity` / `status:"instudio"` |
| 11 | Watch/complete content | generalContentQueue.dart:71-84 etc. → AppServices `updateModePlaylistCompletion` :1386+ | `participant mode checklist` completion arrays | optional content |
| 12 | View timeline / position | queueStageList.dart:31-132 | none (display) | all |

## How the app knows the participant's position

- Auth: Firebase Auth; `loggedinProfile["profileid"]` ↔ `profile_data.profileid` (home.dart:985-989).
- Token: delivery deliverable `sequenceref`/`fileref[0]` → `queue_token` doc (home.dart:883-885) → `appService.queueDeliveryData["tokendata"]`.
- Queue: `queue_token.queueref` → `queue generation` (`stages`, `stageproperty`) merged into `queuemode` (home.dart:916).
- Stage list it walks for self-move = the participant's **variation** stage order (`queuestages`); `moveQueueStage` advances to `queuestages[currentIndex+1]` (AppServices.dart:1264-1269).
- Live updates: snapshot listeners on `queue_token` (883), stage chat (964), `studioinvitation` (1000).

## Named-database layout (the "named DBs" the test prompt referenced)

| Database | Collections (participant-relevant) |
|---|---|
| `(default)` | `queue generation`, `queue variation`, **`queue_token`**, `queue stage log`, `profile_data`, `queue planning`, `studioinvitation` |
| `firestore-forms` | `formsByClient` (form submissions); form/queueref refs rebuilt here (queueStageDetail.dart:96, FillForm.dart:60) |
| `firestore-atc` | ATC collections — **EXCLUDED** from this test scope |

→ The seed already placed queue mechanics in `(default)`, which is correct. To exercise
**form** self-moves end-to-end we additionally need a `firestore-forms` named DB (+ a form
template), OR we replicate the `queue_token` write directly and skip the form doc.

## Consequences for the test harness

1. **Participant app is native Flutter → Playwright device emulation cannot drive it.** Options:
   - (a) **Drive the participant side by replicating its Firestore writes** (Admin SDK) — exactly what `moveQueueStage`/form-submit/slot-book do. Deterministic, no UI. *Recommended for the participant half.*
   - (b) Flutter `integration_test` driver (separate toolchain) if real-UI participant coverage is required.
   - (c) Check for a Flutter **web** build target to reuse Playwright (needs verification).
2. **Operator side stays Playwright/web** (Angular `dynamic-queue-manager-clone`).
3. **Self-move needs no cloud function** — only operator `nextstage` + mode/studio side-effects do. This shrinks the mandatory CF-deploy surface.
4. Add a **second named DB** `firestore-forms` to the test project if form submissions are asserted at the document level.
