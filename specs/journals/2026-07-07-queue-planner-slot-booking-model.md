# 2026-07-07 — Queue Planner Review: the slot/stage/booking mental model

**Why this journal exists:** The operator wants to port the *thinking* behind the
Queue Planning Review screen into another project. This captures the conceptual
model — the entities, how they nest, and how a booking flows — independent of the
StarLabs Firestore specifics, so it can be re-implemented elsewhere.

Source screen: `src/app/queue system/queue-planning-review/queue-planning-review.component.ts`
(and its `.html` / `.css`).

---

## The core idea in one sentence

> A **queue** moves people through an ordered list of **stages**; each stage is
> given a set of **slots** (time windows with a capacity); a person is **booked**
> into one slot per stage; the review screen is a **stage × time-slot grid** that
> shows, per cell, how much capacity is used and who is in it.

Everything else is bookkeeping around that sentence.

---

## The five entities (and how they nest)

```
Queue                       "a program people flow through"
 ├─ Stages[]                ordered steps: e.g. Registration → Interview → Final
 ├─ Variations[]            alternate paths through the stages (not everyone hits every stage)
 └─ Planning                the capacity plan for this queue
      └─ Variation
           └─ Segment       a cohort / group / batch of people
                └─ Slot[]   { stage, startdate, enddate, maxslot, usedslot }
                            ^ THE atom: one time-window of capacity, tied to ONE stage
```

And the person, tracked separately:

```
Token (one per participant in the queue)
 ├─ currentstage
 ├─ status (Active/…)
 └─ selectedstageslot: { [stageName]: slot }   ← their booking, one slot per stage
```

**The key modeling decisions worth stealing:**

1. **A slot belongs to exactly one stage.** Capacity is never "for the queue" —
   it is always "for *this stage* in *this segment* on *this variation* at *this
   time*." That four-way key (stage + segment + variation + time-window) is what
   makes a slot unique. Copy this: don't let capacity float above the stage.

2. **Capacity is a counter, not a list.** Each slot carries `maxslot` (given) and
   `usedslot` (booked). Booking = `usedslot++` guarded by `usedslot < maxslot`.
   The *identities* of who booked live on the tokens, not in the slot. The slot
   only knows the number. This keeps the two write paths independent (see below).

3. **The booking is stored on the person, keyed by stage.**
   `token.selectedstageslot[stageName] = slot`. A person holds at most one slot
   per stage. To ask "who is confirmed for slot X?" you scan tokens and match on
   the four-way key — you don't store a roster on the slot. Slot-count and roster
   are two views of the same fact, reconciled by the match.

4. **Variation = optional-path modeling.** Not everyone takes every stage.
   Variations let you plan different capacity for different paths without forking
   the whole queue. If your other project has "everyone does every stage," you can
   drop variations and collapse the nesting to Segment → Slot.

5. **Segment = the cohort dimension.** Slots are planned per group so two cohorts
   running the same stage at the same time don't share one capacity pool. Drop
   this too if you only ever run one group at a time.

Minimum viable version for a new project: **Queue → Stages[]; per stage a list of
Slots{time, max, used}; per person a map stage→slot.** Add Segment and Variation
only when you actually have multiple cohorts / optional paths.

---

## The review screen as a grid

The whole UI is one pivot table:

- **Columns = stages** (the ordered steps)
- **Rows = time slots** (start–end windows)
- **Cell = the slot** for that (stage, time) — shows `usedslot / maxslot` and,
  on drill-in, the roster split into:
  - **confirmed** — tokens whose `selectedstageslot[stage]` matches this slot
  - **non-confirmed** — eligible people at this stage with no slot booked yet
  - **big / pre-selected** — people slotted ahead of time from another source

That three-way split (confirmed / eligible-but-unbooked / pre-placed) is the
useful part of the review UX: it turns "plan capacity" and "fill capacity" into
the same screen. An admin sees the grid, sees the gaps, and books people into
them without leaving the view.

---

## Variations: how a participant's *path through the stages* is decided

This is the part that's easy to get wrong when porting, so it gets its own section.

**A variation is a named, ordered *subset* of the queue's stages.** The queue owns
the full ordered list; each variation picks some of them, in the same order.

```
Queue.stages   = ["Intake", "Assessment", "Counseling", "Final"]   ← the master order
Variation A    = ["Intake", "Assessment"]                          ← short path
Variation B    = ["Assessment", "Counseling", "Final"]             ← later-entry path
```

Variation shape (Firestore `queue variation`, keyed to the queue by `queueref`):
```
{ id, variationname, stages: string[] /* subset of queue stages, in order */, queueref }
```

**The non-obvious decision worth stealing: variation is NOT a field on the person.**
The `queue_token` has no `variationid` of its own. A participant's variation is
**inferred from the slots they've booked** — every booked slot carries the
`variationid` it was planned under, and the code reads it back off the *first*
booked slot:

```
getParticipantVariation(person):
    slots = person.selectedstageslot
    firstSlot = slots[ firstKey(slots) ]
    return variationName(firstSlot.variationid)   # all their slots share one variationid
```

Consequence: **a person's path is emergent, not assigned.** They "are on Variation
B" because they booked B's slots — not because someone stamped B on them at intake.
This keeps the token schema tiny and means the plan (not the person) is the single
source of truth for what paths exist. The trade-off: until they book their first
slot, their variation is unknown/undecided.

*If you port this and want variation decided up front* — assign at enrollment (put
`variationid` on the person) instead of inferring it. Either works; just pick one
and be consistent. StarLabs chose "infer from bookings"; document which you chose.

**Where the ordered subset actually lives for eligibility.** In practice the code
doesn't read `variation.stages` directly to decide "which stages does this person
owe a slot for." It derives it from the *plan*: for a given (variation, segment) it
walks the planning data and marks each stage `slotConfigured: true/false`. That
`slotConfigured` list — "which stages in this variation actually have slots planned
for this segment" — is the operative definition of the path.

```
getStageConfigForVariationSegment(variationId, segmentId):
    config = queue.stages.map(s => ({ stageName: s, slotConfigured: false }))
    for each planning row where row.variationid == variationId:
      for each segment in row where segment.segmentid == segmentId:
        for each slot in segment.slots:
          config[ indexOf(slot.stagename) ].slotConfigured = true
    return config
```

Steal the idea: **the path is "the stages that have slots planned," not a separate
declared list.** One less thing to keep in sync.

---

## Eligibility: which stage a participant may book *next*

Given a slot cell (stage + segment + variation + time), the grid asks "who belongs
in the non-confirmed / eligible bucket for this cell?" A person is eligible when
**all** of these hold:

1. **Status gate.** Token is `Active`, `stagestatus === 'Approved'`, and not
   soft-deleted (`delete ∈ {null, undefined, false}`). Dead/pending tokens never
   show.
2. **In the right cohort.** The person's segment matches the slot's segment
   (segment is derived from participant-list membership, then checked against the
   queue's planning segment list).
3. **Not past this stage.** `index(person.currentstage) <= index(slotStage)`.
   Someone already beyond this stage is not eligible for it.
4. **Not already booked here.** `person.selectedstageslot[slotStage]` is empty —
   if they already hold this stage's slot they're *confirmed*, not eligible.
5. **Within the stage range** (the subtle one, below).

**Confirmed vs. non-confirmed is the same match, inverted:**
- **Confirmed** for a cell = the person holds a slot for this stage whose
  `segmentid` + `startdate` + `enddate` equal the cell's (an exact four-way match).
- **Non-confirmed / eligible** = passes the gates above but holds *no* slot for
  this stage yet.

### The "stage range" rule — enforcing linear progress without gaps

Because a variation can *skip* stages (some stages have no slot), you can't just
say "eligible if currentstage == thisstage." A person's `currentstage` might sit on
a stage that has no slot, while the next *slotted* stage is the one they actually
need to book. So the code computes a **window** of stages a person may book into:

```
targetIdx      = index(slotStage)
firstSlotted   = first stage (by order) with slotConfigured    # earliest bookable stage
if targetStage is the first slotted stage:
    checkFrom = targetIdx
else:
    prevSlotted = last slotted stage before targetIdx
    checkFrom   = prevSlotted.index + 1        # start just after the previous slotted stage

# person is in range for this cell iff:
checkFrom <= index(person.currentstage) <= targetIdx
```

Plain English: **a person is eligible for stage X's slot if their current stage
falls in the gap between the previous *slotted* stage and X.** This lets a
participant sitting on a no-slot stage "reach forward" to the next real slot, while
still blocking anyone who hasn't yet cleared the prior slotted stage. It enforces
*book stages in order, one at a time, skipping the stages that were never slotted.*

Steal this whenever your stages aren't all bookable: **eligibility is a range
between adjacent slotted stages, not equality on a single stage index.**

---

## The booking flow (portable pseudocode)

```
bookSlot(person, stage, slot):
    # 1. guard + reserve capacity (do this atomically / in a transaction)
    if slot.usedslot >= slot.maxslot: reject "full"
    slot.usedslot += 1

    # 2. record the booking on the person, keyed by stage
    person.selectedstageslot[stage] = slot

revertSlot(person, stage):
    slot = person.selectedstageslot[stage]
    slot.usedslot -= 1
    delete person.selectedstageslot[stage]
    log the revert (who, when)   # keep an audit trail
```

**Two independent write paths, and why it matters:** the capacity counter
(`usedslot`) lives on the *plan*; the booking lives on the *person*. They are
updated together but stored apart. This is deliberate:

- The grid can render `used/max` from the plan alone, fast, without loading every
  person.
- The roster is derived on demand by matching tokens to the slot key.
- Consistency risk: the two can drift (counter says 3, only 2 tokens match). The
  StarLabs code accepts this and treats the counter as the gate and the token
  match as the truth for the roster. If you port this, decide up front whether you
  want the counter to be authoritative or derived — deriving `used` by counting
  matching tokens is simpler and can't drift, at the cost of a scan on every read.

**Reserve capacity inside a transaction.** The `usedslot < maxslot` check and the
`usedslot++` must be atomic, or two admins double-book the last slot. StarLabs does
this in a Firestore transaction (`updateSlotCount`). In any backend: check-and-
increment under a lock/transaction, not read-then-write.

**Always log reverts.** Freeing a slot writes an audit entry (who reverted, when).
Bookings/reverts are the kind of thing people argue about later — keep the trail.

---

## What to carry into the other project

- Model capacity as **per-stage slots with a `max`/`used` counter**, never as
  queue-level capacity.
- Store a person's booking as a **map keyed by stage** on the person record.
- Make the review UI a **stage × time-slot grid** with a **confirmed /
  eligible / pre-placed** split per cell.
- Do **check-and-increment atomically**; **log reverts**.
- Add **Segment** (cohort) and **Variation** (optional path) dimensions only if
  you have multiple groups or branching paths — otherwise collapse them out.
- **Variation = an ordered subset of stages.** Decide whether it's *assigned* at
  enrollment or *inferred* from the person's first booking (StarLabs infers). Pick
  one; don't do both.
- **Eligibility is a range, not an equality.** When some stages have no slots, a
  person may book stage X if their current stage sits between the previous slotted
  stage and X. Enforces in-order progress while skipping unslotted stages.
- Derive "the path" from **which stages have slots planned**, not from a separately
  declared list — one less thing to keep in sync.

---

## Pending / not covered here

- The "big participant" pre-selection source (`cohorts queue planner`) — where
  pre-placed people come from — is its own flow, not detailed here.
- The exact queue-specific predicates in `getNonConfirmedParticipantsForSlot()`
  (status strings, soft-delete sentinel values) are StarLabs conventions — port the
  *shape* documented above (status gate → cohort → not-past → not-booked → in
  range), not the literal field values.
