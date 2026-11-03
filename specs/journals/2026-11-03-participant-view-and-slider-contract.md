# 2026-11-03 — `participantview`, the preview gaps, and the slider / time contracts

Three pieces of work, two of them forced by the same underlying fault: **the web and the Flutter app disagreed
about what a stored answer means.** WHY each constraint landed is below; the WHAT is in the diffs.

## 1. `participantview` on the ATC model's forms

**Why.** An admin configures forms on an `atc model`, but the participant app showed all of them. The operator
wanted a per-form switch.

**Shape.** A third key on each row: `forms: [{ formid, filledby, participantview }]`.

**Two defaults that differ on purpose** (operator decision, do not "fix" this later):
- A row **read** from Firestore with no key is `false`. Every model configured before today therefore exposes
  nothing until an admin ticks it — day one changes nothing.
- A row **added** in the dialog starts `true`, because an admin adding a form usually means it to be seen.

The flag is per row **whatever `filledby` says**, so a specialist-filled form can be shown to the participant.
The Flutter side reads it with `atcParticipantViewFormIds()` and filters at the row build — no new query, it
piggybacks the existing `atc model` listener. An ATC whose product matches no model shows no forms, which is
the same absent-is-false rule.

## 2. Flipping answers were invisible in both previews

`grep -c flipping` was **0** in `form-overlay-view` and `form-template-preview`. The data was always there;
neither preview had code to render it. Added to both: the sub-question heading, the two end labels as a range,
and one line per chosen option.

The two needed different plumbing. `form-overlay-view` walks the *template's* formarray for headings while
pulling values from the *submitted* doc through a `control{n}` map, so the flipping answers are harvested into
a parallel map. `form-template-preview`'s `formData` **is** the submitted doc, so they are on the field.

## 3. The slider contract — the expensive one

**The fault.** `HEAD` had the web writing 1-based positions (`min: 1`) and the app reading 0-based indices
(`options[v]`). The flipping slider was worse: `[max]="10"` hardcoded, ignoring `options` entirely. So a
participant picking the 7th stop against a 3-option list stored `7`, and the app did `options[7]` →
`RangeError`. The *plain* slider had the same bug more quietly: picking the **last** option always crashed the
app, and picking the first showed the second label.

**Settled rule: a slider answer is a 0-BASED INDEX into that field's `options`.** `0` is the first option and
a valid default; `options.length - 1` is the last. Both apps, both slider kinds.

- Web: `[min]="0"`, `[max]="options.length - 1"`, and it now shows the **option label** (`displayWith` on the
  thumb, `sliderLabel` on the summary line) instead of a bare number.
- App: already 0-based; it gained the same clamp and now stores an integer rather than `"2.0"`.
- `sliderPosition` (both repos) clamps every read into range. This exists because answers outside the list are
  already in the data — the old 1-10 flipping scale produced them.

**Why 0-based and not 1-based.** 1-based needed no migration, and the operator chose 0-based anyway after the
`low / mid / high` example made indices the natural reading. The cost is accepted and open: see below.

**What went wrong in the doing, recorded so it is not repeated.** The slider was changed to 1-based, then
reverted, then changed to 0-based, and at one point the fill screens showed labels while the previews still
showed raw indices — which read as a one-off between the form and its preview on every slider. The lesson is
the one the operator named: establish which base each side uses *before* touching display code, and do not
implement through a change of direction.

## 4. Time answers — `"HH:mm"`

Angular's `matTimepicker` binds a `Date`, so the web stored a **Timestamp**; Flutter's `timeField` did
`.split(":")` on it and threw. The `date` field already handled this; `time` never got the treatment.

**Rule: a time answer is the string `"HH:mm"`, 24-hour, zero-padded.** Each UI converts at its own boundary
(`time-value.ts` in Angular, inline in `FillForm.dart`). Reads accept a Timestamp, an unpadded `"H:m"`, a
date-time string and `"HH:mm"`, so **no migration is needed** — an old answer heals the next time it is saved.
Ship the web first: an unpatched app build reads `"09:30"` correctly, so the web change alone stops the crash
on phones that never update.

## 5. Late findings — B!G, and why the local run never happened

**`form-based-submission` (B!G) is on a different contract entirely.** Its `onSliderValueChange` writes
`array[event.value - 1]` — **the option label**, not an index — and the flipping one does the same. So that
screen stores `"Mid"` where the other two store `1`, and Flutter's `double.tryParse("Mid") ?? 0` means every
B!G-filled slider has always shown the *first* option on mobile.

It is **deferred, and safely so**: `/formbasedsubmission` is registered at `app.routes.ts:259` but nothing
navigates to it. The in-app references are commented out and the live `reviewLastForm`
(`participant-assignment-board.component.ts:593,595`) opens `/formtemplate` with `participantAssignmentId`
and `source=participant`; the Cloud Functions repo and the Flutter app contain no link either. The live B!G
flow therefore already runs on the screen fixed today. Revisit with B!G work — and note the fix is **three**
changes, not two, since the range alone makes the first option store `array[-1]`.

**A trap left next door:** `form-assignment.component.ts:478-480` still carries the same label-writing
`onSliderValueChange`, harmless only because the template call is commented out at `:236`. It sits beside the
live slider, inviting someone to uncomment it. Delete the method.

**The ATC suite still has not run locally.** The overlay fixed the wiring (traffic reached
`localhost:8080` / `starlabs-cicd`, no real-DB hits), and it then failed on CORS: a running Flutter app
(process `Runner`, GCDWebServer) binds `[::1]:8080` while the Firestore emulator binds only
`127.0.0.1:8080`, and `localhost` resolves to `::1` first — so the browser talked to the app. Stop the
simulator app, or point the emulator host at `127.0.0.1`. Details in the hub journal.

## Open, deliberately

1. ~~The 1-based data already stored.~~ **Operator decision (2026-11-03): no migration.** Slider answers
   written before today display one option high, permanently; new submissions are correct. Recorded here so
   nobody "fixes" it later and shifts the correct ones.
2. **`form-based-submission` (B!G) is still 1-based** (`min="1"`, `[max]="options.length"`), writing into the
   same collections the new readers treat as 0-based.
3. ~~The e2e slider assertion~~ **fixed** — see the hub journal. Three assertions were wrong, not one: the
   two flipping ones (`> 1`) had been written for the old 1-10 scale and could never pass against a 2-option
   seed.
4. **Required sliders.** Flutter writes a default during build so a required slider can never fail; the web's
   flipping slider has no form control so its `required` is never evaluated; and on both, a required slider
   whose answer is the *first* option cannot be answered without moving away and back (no `dragEnd` commit).
5. A slider configured with one option gives `divisions: 0`, which Flutter rejects.
