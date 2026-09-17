# 2026-08-31 — Queue slot flow: baseline before the logic change

**Why this journal exists.** The operator wants to change the logic of the queue slot/capacity
flow. Before changing it, we froze the as-is behaviour into
[`specs/QUEUE-SLOT-BOOKING-FLOW.md`](../QUEUE-SLOT-BOOKING-FLOW.md) — every read path, every write
path, a flowchart, and a register of the places where the same fact is computed two different
ways. This journal holds the WHY, the surprises, and the **revert playbook**.

Repos read at this baseline:
- `starlabs-angular` @ `dynamic-studio-update`, HEAD `65992247` (working tree clean except an
  unrelated `group-chat-screen.component.css`).
- `breakthroughs-flutter` @ `development`, HEAD `8cc6b02`.

Prior art (do not re-derive): `journals/2026-07-07-queue-planner-slot-booking-model.md` (the
conceptual model, written for porting) and `journals/2026-07-03-self-queue-slot-booking-logic.md`
(the Flutter type-#2 self-booking flow). This baseline supersedes neither; it adds the
*cross-repo write-path map* neither of them had.

---

## What the flow actually is, in one paragraph

`queue planning/{doc}` holds one array — `planning[] → segments[] → slots[]`. A slot is a
`(variationid, segmentid, stagename, startdate, enddate)` tuple carrying `maxslot`/`usedslot`.
Four clients increment `usedslot` inside a Firestore transaction and then, in a *second* write,
record the booking on the person (`queue_token.selectedstageslot[stage]`, or for people not yet in
the queue, `participantsproduct.status = "initiated"` + an `event participation request`). A fifth
writer — the Angular **queue-planner** — rewrites the entire `planning[]` array on every edit and
sets `usedslot` to a *recomputed* count of matching tokens.

---

## The four surprises

**1. The planner overwrites the counter every other client maintains.** (D-02.)
`savePlanning()` writes `usedslot: participants.length`
([queue-planning.component.ts:1719](../../src/app/queue%20system/queue-planning/queue-planning.component.ts#L1719)),
where `participants` are `queue_token`s already holding this slot. Every planner mutation
auto-saves — editing a cohort on an unrelated cell rewrites all slots. So any reservation that
does **not yet have a token** is erased: Flutter self-service (type #2) bookings, which flip
`participantsproduct` to `initiated` and only get a token later, and every B!G pre-placement in
`cohorts queue planner`. The capacity silently re-opens and can be sold twice. This is the single
most consequential fact in the flow and the most likely thing the operator wants changed.

**2. `usedslot` means two different things on the same screen.** (D-01.)
The review grid *displays* a derived count (`confirmedParticipants.length`,
[queue-planning-review.component.ts:807](../../src/app/queue%20system/queue-planning-review/queue-planning-review.component.ts#L807)),
and `getAvailableSlotsForParticipant` decides what to offer an admin from that derived number —
but `updateSlotCount`'s transaction gates on the **stored** number. When the two have drifted (and
per D-02 they routinely have), the admin is offered slots the transaction rejects, or blocked from
slots that are actually free.

**3. Booking is two writes, not one.** (D-04.) In all four booking paths — Flutter in-queue,
Flutter self-serve, Angular admin-books-token, Angular admin-books-non-queue — the transaction
commits the counter, and *then* a separate `updateDoc` records the booking. Nothing repairs a
crash in between. The `queue_slot_log` audit exists only on the Angular paths; Flutter writes no
log at all, so a phantom increment from the app is invisible.

**4. "The first bookable stage" has three different definitions.** (D-07.) Flutter home uses
`slots.first["stagename"]` — array order — after a sort whose comparator compares `a` to `a`
(`homeContent.dart:848`, and the same typo again at `homeContent.dart:1131`), so the sort is a
no-op and "first" is really "whatever order the planner happened to write". Flutter in-queue scans
`queuestages` forward from `currentstage`. The Angular review uses the first stage in queue order
with any slot planned. These agree only by luck.

Also worth knowing, not surprising: the planner rejects any queue with zero `queue variation`
docs; the review screen renders **nothing** (not an empty state) until a `queue planning` doc
exists, because its `dataReadyFlags.planning` never flips.

**5. (Added after operator feedback — "there is no full view map of how the existing flow works".)
The first draft was organised around the capacity conflict, not around the journey, and it was
missing the piece that joins the two halves: *nothing in Angular or Flutter creates the
`queue_token`.* Two cloud functions do, in
`starlabs-cloud-function/functions/components/participantproduct.js`:

- `participantsproductinitiated` (`:6`) fires when `participantsproduct.status` goes `null →
  "initiated"`, expands `productToDeliverySequence` into `deliverables`, and marks the first `ready`.
- `startParticipantNextDeliverySequence` (`:293`), on that deliverable and `type == "queue"`,
  creates the `queue_token` — and **copies `participantsproduct.requestedslot` into
  `selectedstageslot[stagename]`** (`:476-479`).

That last line changes the reading of D-02: an app booking *is* meant to survive into the token,
so the loss isn't by design — it's a **race with a window** ("product initiated → deliverable ready
→ token created"). A planner save inside that window makes it permanent. Worth stating plainly
because the first draft implied token-less bookings were simply never reconciled.

Two new divergences fell out of reading it:

- **D-11** — CF2 pre-checks `queue generation.totalcapacity` (default 999) against active Approved
  tokens and, when the queue is full, **logs and returns without creating anything**. The seat is
  already spent on the plan and the product already says `initiated`, so the person exists in no
  queue list at all. Also settles an open question: `totalcapacity` is *not* vestigial
  (`QUEUE-AND-BIG.md §10 Q1`) — it is a hard, silent gate.
- **D-12** — the token's `currentstage` is seeded from `queue generation.stages[0]`, not from the
  variation's first stage, so a late-entry variation starts on a stage it doesn't contain.

---

## What we deliberately did NOT do this session

No code was changed. The Angular working tree carries only a pre-existing, unrelated
`src/app/Events/Chat/group-chat-screen/group-chat-screen.component.css` modification. The Flutter
repo was read-only.

---

## Change log

*(Append one entry per landed change. Each entry must carry its own revert steps.)*

### CL-000 — 2026-08-31 — baseline, documentation only
- Added `specs/QUEUE-SLOT-BOOKING-FLOW.md` (new file). Restructured the same day, on operator
  feedback, into **Part 1 plain English / Part 2 technical** — the first draft was one dense
  technical document and the operator needs a version the non-engineering side of the team can
  read before we discuss the change. Same facts, two registers of language; the D-ids are the
  link between them so a plain-English complaint maps to a code location.
- Added this journal (new file).
- **Revert:** `rm specs/QUEUE-SLOT-BOOKING-FLOW.md specs/journals/2026-08-31-queue-slot-flow-baseline.md`.
  No runtime effect — neither file is imported or built.

### CL-001 — 2026-08-31 — wireframes of all nine screens (documentation only)
- Published a companion wireframe page: layout sketches of the six web views and the three app
  cards, drawn from the real templates (`queue-planning.component.html`,
  `queue-planning-review.component.html`, `requestScopeEnhancement.dart`, `queueControl.dart`,
  `requestBigOpportunities.dart`) with **dummy data only**.
  URL: https://claude.ai/code/artifact/abe7e5c9-71d7-4257-a3e7-db77994339dc
- **Why dummy data, not screenshots:** both surfaces are auth-gated and I cannot enter credentials.
  The operator chose wireframes over staging a login. This is also the better baseline artefact —
  it survives data changes and can be annotated with the divergence ids, which a screenshot can't.
- Each screen carries numbered annotations tying its UI to the register: the Planner's read-only
  "Used Slot" field is the visible face of D-02; Review's "Invalid" count is D-05; the Book dialog's
  offer-vs-gate mismatch is D-01; the B!G card's availability-not-booking is D-09.
- **Revert:** none needed — no repo files, no runtime effect. Delete the artifact if unwanted.

---

## Revert guide — per screen

Standing operator rule: every screen change gets a revert entry here. Baseline state to return to:

| Screen / file | Baseline ref | How to restore |
|---|---|---|
| Angular `queue-planner` — [queue-planning.component.ts](../../src/app/queue%20system/queue-planning/queue-planning.component.ts) (.html/.css) | `65992247` | `git checkout 65992247 -- "src/app/queue system/queue-planning/"` |
| Angular `queue-planner-review` — [queue-planning-review.component.ts](../../src/app/queue%20system/queue-planning-review/queue-planning-review.component.ts) (.html/.css) | `65992247` | `git checkout 65992247 -- "src/app/queue system/queue-planning-review/"` |
| Flutter home card | `breakthroughs-flutter` `8cc6b02` | `git checkout 8cc6b02 -- "lib/Main Screen/homeContent.dart" "lib/Widgets/requestScopeEnhancement.dart"` |
| Flutter in-queue card | `breakthroughs-flutter` `8cc6b02` | `git checkout 8cc6b02 -- "lib/Delivery Queue/queueControl.dart"` |
| Flutter B!G card | `breakthroughs-flutter` `8cc6b02` | `git checkout 8cc6b02 -- "lib/Widgets/requestBigOpportunities.dart"` |

**Data-side revert.** Code revert is not enough if a change alters what is *written* to
`queue planning`. Before landing any write-shape change:
1. Export the affected `queue planning` doc(s) — the whole `planning[]` array — to
   `specs/journals/2026-08-31-queue-slot-flow-artifacts/` first. There is no history on an array
   field; a bad write is unrecoverable without this snapshot.
2. `queue_slot_log` is the only replayable record of bookings/reverts, and it covers the Angular
   paths only. Treat it as partial.
3. Do the first run against `starlabs-test`, never `fir-sample-aae4a`.

---

## Pending

- **The change itself is not yet specified.** Baseline is frozen; awaiting the operator's
  statement of the new logic. §7 of the flow doc is the protocol we agreed to follow: state the
  change as a delta against the divergence register, check it against the six invariants, name the
  blast radius across W1–W7 / R1–R3, land Angular and Flutter as separately revertable commits.
- Recommended first target when the change is specified: **D-02** (planner overwriting `usedslot`)
  and **D-01** (stored vs derived), because they are the same root cause — no agreed source of
  truth for capacity — and every other divergence is cosmetic next to double-booking.
