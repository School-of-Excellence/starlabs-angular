# 2026-11-01 — Delivery and queue forms on View ATC (approved 2026-11-01)

Show the forms a participant filled in the product delivery sequence, or in the queue, on the ATC they belong to.
A participant can do a product several times, so the link is the purchase (`participantproductid`), not the product.

Rule for this feature (operator): only the conditions below. No extra filters, fallbacks or de-duplication; if a
form shows twice, it must stay visible so the flow can be traced and iterated.

## Flow 1 — Flutter: answers carry the step's purchase id
- `lib/Widgets/productDeliverySequence.dart` `completeFormWidget()` (home card FILL button, the only live
  delivery-sequence form entry) already reads the step doc `deliverables/{id}` into `formData`.
- Pass `metadata: {"participantproductid": formData["participantproductid"]}` (was the app's
  `activeparticipantproductid`). `FillForm.submitform()` merges `metadata` into the `formsByClient` answer.
- Offline: the id is part of the answer write, which Firestore queues and sends on reconnect.

## Flow 2 — Prescribe ATC saves the purchase id
- `prescribe-atc.component.ts`: `participantProductId` next to `appointmentId`.
- `prefillFromAppointment()`: once the appointment is found, `deliverables` where `fileref` array-contains
  `appointments/{id}` (limit 1) → `participantproductid`.
- Saved in the draft and patched back with `appointmentid`; cleared wherever `appointmentId` is cleared; written as
  `alphaData.participantproductid` next to `appointmentid`. Edit ATC copies all fields, so versions keep it.

## Flow 3 — View ATC Forms section (three parts)
Loaded once when an ATC is opened. Forms database, `formsByClient`:

| Part | Shows when | Query | Label |
|---|---|---|---|
| 1 | ATC has `participantproductid` | `profileid` == ATC participant, `participantproductid` == ATC's | Delivery activities |
| 2 | ATC has `queueid` | `profileid` == ATC participant, `queueref` == `queue generation/{queueid}` | Queue activities |
| 3 | existing rule: validated ATC whose model has forms | unchanged | ATC forms |

- Parts 1 and 2: every submitted answer, newest first — form name (from the answer), submitted date, View answer
  (existing overlay). A part with no answers is hidden.
- Part 3 unchanged in logic; when the ATC isn't validated yet it shows "These open once the ATC is validated".

## Tests — emulator only
- Seed: one participant, two WiSH purchases, each with its own appointment, ATC and delivery answers; a queue ATC
  with answers in its queue and in another queue.
- Hub `atc` suite: each ATC lists only its own purchase's / queue's answers; part 3 locked until validated.
- Flutter: an answer from the FILL button carries the step's `participantproductid`.

## Not covered (decided)
- Answers saved without `participantproductid` (before 2026-05-14, old journey screens) are not shown.
- ATCs with neither `participantproductid` nor `queueid` show no delivery / queue part.
