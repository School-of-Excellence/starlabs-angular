# Field hints and a configuration guide for /workshopconfig/:id

**Date:** 2026-09-04 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, builds green, runtime unverified behind login

Operator: analyse the EiFlix Flutter app completely (read-only) and, on the workshop
configuration screen, give **every field a hint saying what it is for**, plus an **"i" button
opening a full configuration guide** — strictly grounded in that app.

---

## 1. How the content was produced

A 10-group workflow traced each field through `/Users/nanda/Documents/Development/workshop`,
which was **read and never written** (verified afterwards: no file outside build caches has
changed). Each group's hints were then re-checked by a skeptic that re-read the Dart source.

- **160 fields** traced across the enrollment page, settings and challenges.
- **160 verdicts** returned; **132 hints were corrected** by the verifier before use.
- **23 fields turned out to be dead** — nothing in the user app reads them.

Every hint states what the setting does *for a learner*, names real dependencies, and never
prints a stored field name (the standing rule, see `no-field-names-in-ui`).

## 2. The 23 settings that do nothing

This is the most useful thing the analysis produced, because these fields look configurable
and are not. Each now carries a hint saying so, and the guide lists them in one place.

- **Enrollment page:** product type, requirements, skills taught, the taxonomy picker.
  What you'll learn, testimonials and the whole bonus block belong to the previous
  generation of the workshop screen, which is no longer reachable.
- **Settings:** the older Active switch (Live on the app is the real one), trigger function,
  activity log channel, default log channel, mail template, WhatsApp enrol message. Among
  the hero settings: the mobile hero switch, the show type, and the separate mobile image —
  phones use the main hero image.
- **Challenges:** the retired live-link activity and its date, the assignment description
  (the rich description is used instead), the evolution playback title and description, and
  the completed-call link.

## 3. Behaviour worth knowing that the hints now surface

- The audience rules **do not hide** a workshop. They are checked only on tapping Enroll,
  in a fixed order, each with its own refusal message.
- A rule switched on with an **empty list blocks everyone** — an empty journey or tier list
  refuses every learner.
- The **tier check is the strictest rule**; the only way past it is the hand-picked access
  list on an always-on workshop. A valid tier never overrides that list.
- **Test mode overrides the live switch**, and test mode with an empty viewer list hides the
  workshop from everyone including the admin.
- A **set with no unlock date never opens**. Sets need both their date and the previous set
  completed; live calls are skipped when working out "the previous set".
- With focus groups on, an **untagged activity is invisible** to a learner who picked a group,
  and each learner's pick is permanent.
- Registration dates are **ignored entirely on always-on workshops**.
- The displayed price is **display only** — the real charge comes from the payment settings.

## 4. What was built

- `wc2-help.ts` — 160 verified hints, the long-form details, the list of dead fields, and
  the nine guide sections. Generated from the analysis, so it can be regenerated.
- `help/wc2-help-dialog.component.*` — the guide behind the "i" button: nine sections,
  a searchable rail, ordered checklists and highlighted warnings.
- A `Guide` button in the configuration header, and an `h(key)` helper on all three tab
  components so a template shows a hint with `{{ h('key') }}`.
- **86 hint lines** rendered across the three tabs, covering **96 of the 160** fields.
  Where a field already had a hand-written help line, the traced hint **replaced** it —
  the previous copy was my own guess, which is exactly what this task set out to fix.

Not shown as inline hints: fields whose UI was deliberately removed earlier (bonus block,
taxonomy picker, product type) and some deeply nested per-activity sub-fields. Their hints
exist in `wc2-help.ts` and their behaviour is covered by the guide, so nothing is lost —
but a later pass could attach them if the operator wants full inline coverage.

## 4b. The guide was incomplete on the first pass

The operator asked whether the dialog was finished — it was not. The first version rendered
only the nine narrative sections. The two richest products of the analysis, the **160
per-field explanations** and the **list of dead settings**, were generated into
`wc2-help.ts` and then never displayed, so an admin could not look a specific setting up.

The dialog now has two views:
- **Guide** — the nine sections, searchable.
- **Every setting** — all 160, grouped by tab, searchable, with a "Does nothing today (23)"
  filter and a *no effect* badge. Live settings sort ahead of inactive ones within each
  group, so the retired bonus fields no longer lead the list.

**Left as traced, worth reconciling:** the bonus fields and a few other legacy ones describe
themselves in their own text as never reaching a learner, but were not flagged as unused by
the tracer, so they carry no badge. The prose is accurate; only the flag is missing. It was
left alone rather than reclassified, because re-deriving a flag from prose would be guessing
where everything else here is traced.

## 4c. The nav was unclickable — an *ngFor identity bug

Operator: "there are 9 numbers, only the 1st [works], all others are not able to click."

**Cause, and it was not CSS.** A harness proved all nine rows rendered, were visible and
passed hit-testing, so the fault was in the component. `get shown()` rebuilt its rows on
every call:

```ts
const all = this.sections.map((s, i) => ({ s, i }));   // new objects, every CD cycle
```

`*ngFor` tracks by item identity. Fresh wrapper objects on every change-detection pass make
Angular **destroy and recreate all nine buttons continuously**, so a click's mousedown lands
on a node that no longer exists by mouseup and the click never completes. Section 1 looked
"selected" only because `active` never changed.

**Fix:** index the sections **once** into a `readonly` array and filter that, preserving
identities, plus `trackBy` on both loops as a second line of defence. The search haystack is
also pre-lowercased once rather than rebuilt per keystroke.

**Lesson worth keeping:** an `*ngFor` bound to a getter that constructs objects is a
click-eating bug, not just a performance smell. Audited the other components written this
session — the popup banner and the diagnostics dialog iterate stable array fields, so this
was the only instance.

**Verified end to end**, not just compiled: an interactive harness driven by the real guide
content clicked all nine sections and asserted each rendered its own title, paragraphs,
steps and warnings. The reference view was driven the same way — 160 listed, the inactive
filter exact, a search returning 9, and the empty state.

### One reclassification, and one rejected
The retired **bonus panel** fields led the reference list because they were never flagged
inactive. I flagged those six **by name** — their editor UI was removed earlier this
session and every traced detail says the current page has no bonus panel — taking the count
from 23 to 29.

I first tried deriving the flag from the traced prose ("never reaches a learner" and
similar) and **threw that away**: it also matched *Who can enrol*, *Paid enrolment* and
*Hand-picked people*, whose text says a learner is never shown *the price card*. That would
have stamped "no effect" on three of the most important settings on the screen. Flags stay
as traced except for the six named bonus fields.

## 5. Two process notes

- **The workflow's own post-processing had a bug** (`g is not defined`: a pipeline stage
  callback does not receive the loop variable). All 170 agents succeeded but the assembly
  threw, returning an empty result. Everything was recovered from `journal.jsonl` plus the
  per-agent transcripts, which carry the prompts — so the field-to-verdict mapping was
  rebuilt without re-running any agent. **Read the journal before re-running a workflow.**
- The final guide-writing agent hit the session limit, so the nine sections were written
  by hand from the ten verified group summaries rather than generated.

## 6. Verification

- Dev build green after every step; production build green.
- The guide was rendered in a harness carrying the real Bootstrap and Material stylesheets:
  nine sections, correct nav, warnings block. The Playfair title showing as Roboto there is
  the usual harness artifact — confirmed correct in the compiled bundle, where
  `.hlp-title[_ngcontent-%COMP%]` carries Playfair 23px.
- **Not verified at runtime**: the screen is behind login, so no hint has been seen in the
  real app. The operator pass should open each tab and read a few hints against reality,
  and open the guide.

---

## 2026-09-09 — Guide button hidden (operator request)

The **Guide** button in the configuration header is commented out; the operator will enable
it later. Everything behind it is deliberately left in place — `openHelp()` on the
component, `help/wc2-help-dialog.component.*`, and all the content in `wc2-help.ts` — so
re-enabling is uncommenting one block in the header of
`workshop-configurationv2.component.html`. The comment there says exactly that.

**The inline field hints are untouched and still visible** — 90 hint lines across the three
tabs. Only the entry point to the guide dialog is hidden, not the per-field help.

Dev build green after the change.


## 2026-09-09 — New setting: Workshop EiFlix Mobile

Operator: add a toggle after Workshop Active Web, stored as a boolean on the workshop, that
publishes the workshop in the EiFlix mobile app.

**Data change (requested):** one new root boolean. The Settings save now writes **54** fields
instead of 53. Wired the full round trip — form control, patched on load, written on save,
added to the section's control list and to the rail's "n on" count — so it behaves like
every other toggle in that card.

**Two things worth the operator's attention (raised, not acted on):**
1. The Flutter model **already has a field documented as "whether this workshop is exposed
   to the EiFlix mobile app"**, deliberately not applied in the web app because it gates the
   mobile app only. The new switch therefore risks being a second mobile gate alongside an
   existing one. The operator named the new field explicitly, so it was built as asked.
2. **Nothing reads the new flag yet** — a grep of the Flutter project returns no hits. The
   switch saves correctly but has no effect until the mobile app consumes it. The hint's
   longer text says so, so an admin does not assume it is live.

Its hint follows the house rule: purpose in plain language, no stored field name, and it
states the real dependency (the web switch does not control the mobile app).

Verified: dev build green; the row rendered beside the web toggle in a harness carrying the
real global stylesheets, with the correct title, state line and hint. Runtime unverified
behind login.


## 2026-09-09 — Curriculum rail needed two clicks (all three rails fixed)

Operator: clicking a Curriculum entry on the Challenges tab only worked on the second click.

**Cause.** `jumpToSet` expanded the set and scrolled to it **in the same tick**:

```ts
this.openSets.add(id);                       // Angular renders this AFTER the handler returns
document.getElementById('set-' + id)?.scrollIntoView(...);   // measures the pre-expansion DOM
```

Expanding a set changes the height of everything below it, so the scroll was computed
against a layout that was about to change. The second click worked only because the set was
already open by then, so nothing moved.

A second, smaller contributor: the smooth scroll fires the scroll-spy all the way down, and
the spy recomputed the highlight from mid-flight positions, dragging it off the set that was
just picked.

**Fix, applied to all three rails** — Challenges, Enrollment and Settings all had the
identical `expand-then-scroll-in-the-same-tick` shape, so fixing only the reported one would
have left two known-broken:
- scroll on the next tick, once the expansion has rendered;
- a `jumpingTo` guard so the spy leaves the highlight alone until the scroll settles
  (released after 800ms), cleared in `ngOnDestroy`.

**Reproduced and verified in a harness** that models Angular's real timing (state change in
the handler, render afterwards), measuring the target's offset inside the scroller:

| | first click | second click |
|---|---|---|
| before | **188px off** | 48px (correct) |
| after | **48px (correct)** | — |

Dev and production builds green. Runtime unverified behind login.


## 2026-09-09 — Schedule section repaired, and the time dropdown

Operator sent a screenshot: the Schedule section looked broken and the time picker was
unusable.

**My own bug, from the hint rollout.** The scripted inserter placed the hint lines
*inside* `<div class="win">` — a flex row — so each hint became a flex item wedged between
the date and time inputs and rendered as a tall, thin column of words. A scan found the
same mistake in 4 rows across two tabs (Enrollment schedule ×2, Challenges ×2); Settings was
clean. The hints are now lifted out of the row into a `win-notes` block underneath, styled
as two quiet lines with a rule down the left.

**The time dropdown was clipping to "00:".** Not a styling oversight — Material sizes the
timepicker overlay to the input it is attached to (`width: origin.offsetWidth` in
`timepicker.mjs`), and these time inputs are ~86px, while the panel is `width: 100%` of that
pane. Because the overlay renders outside the component, the fix has to be global: a
`min-width` on `.mat-timepicker-panel` in `src/styles.css`, plus house styling for the
options (navy selected state, tabular numerals, 34px rows).

**Row widths were measured, not guessed.** The column is 465px, leaving 441px for
two date+time pairs and the "to". Two earlier attempts failed in ways the browser showed
me: 126px dates stopped the clipping but made the row *wrap*, and 80px times were exactly
**1px** short of "00:00" — which a naive `scrollWidth > clientWidth` check reported as
fine while the screenshot clearly showed "00:0…". The final pass measures each value's
rendered text width against its box and requires real margin: gap 5px, dates 116px, times
86px, minimum margin **3px**, no wrap, nothing truncated.

**A harness-fidelity lesson:** the first harness used emoji for the field icons, which are
wider than the real 16px SVGs, so the measurements were wrong. Replacing them with the same
SVG markup the component uses is what made the numbers trustworthy.

Checked at 1120px (single clean row), 900px and 420px (wraps, no horizontal overflow).
Dev and production builds green. Runtime unverified behind login.


## 2026-09-09 — New setting: EiFlix mobile hero

Operator: alongside the existing web and mobile hero switches, add one more boolean that
shows the hero banner in the EiFlix mobile app.

**Data change (requested):** one new root boolean beside the other two hero flags. The
Settings save now writes **55** fields (53 originally, +1 for the workshop-level EiFlix
mobile switch added earlier today, +1 here). Full round trip wired — form control, patched
on load, written on save, added to the Hero section's control list, and folded into the
rail's summary chip, which now reads e.g. "Web · EiFlix".

The toggle row became three across (the grid collapses to two columns under 1200px, where
the third simply wraps — checked, nothing clips).

**Same two caveats as the workshop-level switch, and they compound:**
1. **Nothing reads it yet** — a grep of the Flutter project returns no hits for the new
   flag, so it saves correctly but has no effect until the mobile app consumes it. Said so
   in the setting's longer description rather than letting it look live.
2. The hero group now carries **three** switches of which only the web one demonstrably
   drives anything today: the existing mobile hero switch is one of the settings the
   analysis found dead ("the home banner on phones is driven by the Web hero switch, not by
   this one"). Worth deciding with the app team which of the three the mobile app should
   actually honour, so this does not become a third dead flag.

Verified: dev and production builds green; the three-toggle row rendered against the real
global stylesheets with correct labels, no clipping and no overflow. Runtime unverified
behind login.
