# 2026-10-26 — WiSH / EI Solution parts + ATC model image in the participant ATC screen (Flutter, Breakthroughs app)

Status: **decided with the operator 2026-10-26. Show the screen design and get a yes before any code.**
App repo: `~/Documents/Flutter_Projects/Version_3.44.3/Breakthroughs-Achievement`, branch `atc-feature` (at `27a0ec0`).
**Implemented 2026-10-26 on `atc-feature`: steps 1–3 and the widget tests of step 4 (first version committed by the
operator; the move into the full ATC, below, is uncommitted).**
- `lib/Main Screen/atcTemplateSections.dart`: helpers + `AtcModelImage` (1:1, cropped to fill; nothing while loading,
  when missing, or on a load error) + `AtcTemplateSections`.
- `lib/Main Screen/participantATC.dart`: `mapATCModelImage` query, image beside the title, sections as the first item of
  the full ATC.
- `test/atc_template_sections_test.dart`: 12 tests, fake maps only.
Still open: the optional emulator test and step 5 (docs).

**The app is participant-only** (operator). There is no specialist view; leave all other existing ATC code as it is.

## Why
StarLabs (branch `atc-development`, pushed + CI green 2026-10-26) now prescribes ATCs from two templates, **EI Solution**
and **WiSH**, and saves new fields on the ATC doc. The participant's own ATC screen in the app must show them, plus the
ATC model's image on each ATC. Background in this repo:
- `specs/journals/2026-10-22-prescribe-atc-product-check.md`
- `specs/journals/2026-10-23-atc-edit-view-templates.md`
- `specs/journals/2026-10-24-review-log.md`
- `specs/plans/2026-10-23-wish-outcomes.md`

Prototypes (claude.ai, web screens; the app follows their sections, labels and order, inside the app's own card style):
- WiSH: https://claude.ai/artifact/Kw4Nz2NwXRjvpjyTwEKbxN
- EI Solution: https://claude.ai/artifact/AFHfhyBdxVgYjv1bsWkExc

## Decisions (operator, 2026-10-26)
- **Screen:** `ParticipantATC` only (`lib/Main Screen/participantATC.dart`), in its existing `atcType: "participant"` mode.
  `ClientATC` is deprecated: don't touch it. No specialist view in the app.
- **Which ATCs:** the participant's own, through the existing query (`atc_alpha`, `isdelete == false`,
  `profileid == loggedinProfile`, ordered by `prescription_date` desc). Retired versions stay hidden.
- **Ask / Outcomes:** participants **do** see them (a change from the web, where the participant view stayed unchanged).
  - EI Solution → "Ask · area of focus": No. · Asked by · Asked for.
  - WiSH → "WiSH outcomes": 01 · Outcome area · Outcomes expected.
- **Directive:** unchanged. It keeps showing as it does today, with no label, for every model (no "Immediate outcome" /
  "ATC directive" heading in the app).
- **Appointment (`appointmentid`):** skip.
- **Review log:** never shown in the app. Nothing reads or writes it.
- **ATC model image:** show the model's image on each ATC card, from the `image` field of the `atc model` collection.
  **Aspect ratio 1:1** (square; operator, 2026-10-26). **No image → show nothing** (no placeholder, no reserved space,
  no badge).
- **Look:** follow the prototypes' sections, labels and order, in `ParticipantATC`'s current card style (white cards,
  radius 15, `GoogleFonts.inter`, `#687684`). No new fonts or colours.
- **Testing:** tests only feed data; ATC is tested **against the Firebase emulator only**, never a real database. This
  mirrors the web's narrowed rule (CLAUDE.md, 2026-10-13) for the app. Widget tests with fake maps need no database at all.

## The data
ATC doc (database `firestore-atc`, collection `atc_alpha`):

| Field | Template | Shape | Shown to the participant |
|---|---|---|---|
| `product` | all | "EI Solution" / "WiSH" / other model; match on lowercase + trim | yes (title) |
| `directive` | all | string; shown as today, no label | yes (unchanged) |
| `ask` | EI Solution | `[{askedby, askedfor}]`; `askedby` ∈ self / spouse / family / friends / sponsors, display capitalised; skip incomplete rows | yes |
| `outcomes` | WiSH | `[{outcomearea, outcomeexpected}]`, numbered 01, 02, …; skip incomplete rows | yes |
| `reviewlog` | EI Solution | internal review notes | **never** |
| `appointmentid` | EI / WiSH | — | no (skipped) |

ATC model (**default** database, collection `atc model`):
- The image is the **`image`** field (operator, 2026-10-26). The web's Create / Edit ATC model form
  (`create-atcmodel.component.ts`) doesn't set it (its fields are `atcmodel`, `evolutiontype`, `description`, `category`,
  `videourl`, `directive`, `docid`), and the app reads no image from this collection anywhere yet. Treat a missing, null
  or empty `image` as no image.
- An ATC's `product` equals an `atc model` doc's `atcmodel` (prescribe lists the models from that field).
- **Map the images once, at setup:** read `atc model` once and build `atcmodel → image`. Every ATC of the same model shows
  that model's image (operator, 2026-10-26). `atc model` has no duplicate model names (operator).
- The app already reads this collection (`bigGamefication.dart:135`, `journeyOnboardingDetail.dart:77`).

## Screen design (to approve before building)
Revised 2026-10-26 (operator): the Ask / Outcomes block lives **inside the full ATC**, not in the closed card.

Closed card, top to bottom (new parts marked **new**):
1. **new** Model image (1:1, rounded square, left of the title) · "{product} ATC" · prescribed date (right). No image → the
   title row is exactly as today.
2. Role rows from `bigactivity`, Diagnostics Solo / Shadow, as today.
3. Directive text, as today (no label).
4. Adjustment progress, then "View Full ATC ↓", as today. **No Ask / Outcomes while closed.**

Full ATC (after "View Full ATC ↓"), top to bottom:
1. **new** WiSH → "WiSH outcomes" block, or EI Solution → "Ask · area of focus" block. Other models: nothing.
2. Adjustment strips and procedures, as today; then "Close Full ATC ↑".

The model image stays in the title row (shown open or closed). No "new" badges or tags of any kind appear on screen.
The block is a white strip like the adjustment strips (same margin and padding), holding a light grey (`#f2f2f2`)
panel, one row per entry: the number (01 / 1) in `#687684`,
the area or "Asked by" value in w600, and the expected outcome or "Asked for" text below it in w400. A block is hidden
when it has no complete rows.

## Implementation steps (after the design is approved)
1. **Read helpers** (pure Dart, no Firestore), e.g. `lib/Main Screen/atc_template_helpers.dart`:
   - `isWish(atc)` / `isEiSolution(atc)` on lowercase + trimmed `product`;
   - `askRows(atc)` and `outcomeRows(atc)`: complete rows only, in order, `askedby` capitalised;
   - `modelImageFor(product, mapATCModelImage)`: look up `product.toLowerCase().trim()`; the URL, or null when there is
     none.
2. **Section widgets** that take the ATC map (and, for the image, the URL) and nothing else: `AtcModelImage` (1:1; builds
   nothing when the URL is null or fails to load), `AtcAskSection`, `AtcOutcomesSection`. None of them reads `reviewlog`.
3. **`ParticipantATC`:** the `atc model` query and map are **already in place**: `mapATCModelImage` (state field) is filled
   in `initState` from the default database, keyed by lowercase + trimmed `atcmodel`, non-empty `image` values only. Use
   it; don't add a second query. Place the image in the title row and the sections as the first item of
   the full ATC (shown only when `expandedAdjustment[index]` is true), as in the design. Don't change the query, the directive or the adjustment code.
4. **Tests:**
   - Widget / unit tests (`test/`), fake maps only: WiSH shows outcomes and no Ask; EI shows Ask and no outcomes; other
     models show neither; no directive label appears for any model; incomplete rows are dropped; empty blocks are
     hidden; the image shows when `image` is set and nothing is built when it is missing / empty; **a map with `reviewlog` renders nothing of it** (participant guard).
   - Emulator only (optional, per the narrowed rule): wire `firestore-atc` in `integration_test/support/e2e_firebase.dart`
     (today only the default and `firestore-forms` databases point at the emulator), seed a WiSH, an EI and a plain ATC
     for the test participant plus their `atc model` docs, and drive `ParticipantATC`. Never seed or read ATC in the real
     test project `slabs-queue-e2e-exdcz` or any other real project.
5. **Docs:** update the app's `docs/flutter-app/README.md` firewall line and `docs/flutter-app/clusters/atc-offlimits.md`
   (ATC is emulator-only now; ClientATC entry points are dead; `shell-participant-atc` becomes testable on the emulator),
   and add a journal entry here.

## Out of scope
Web changes (done; an image upload in Create / Edit ATC model, if wanted, is its own web task), specialist views in the app, `ClientATC`,
the appointment link, any Review log access in the app.
