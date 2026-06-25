# 2026-06-03 — Product Modes investigation (and the off-disk mode engine)

**Headline:** Worked the Product Modes concept group hard with the operator. Established the two-mode model, the delivery taxonomy, field opportunities, and the `participant mode checklist` mechanism — but proved (4-agent code audit + exhaustive grep) that the **engine which writes participant mode is NOT in any local repo.** Stopping the hunt here; ping the developer.

## What we established (evidence-backed)
- **Two distinct "mode" concepts.** (A) **Delivery mode** on the product (`products.mode`, 5 values) → copied to `participantsproduct.deliverymode` → routes the delivery rail. (B) **Participant mode** (`participant metadata.participantmode`, the 15-state engagement machine in the `modes` catalog).
- **Delivery taxonomy (operator-validated), with inverted names:** Appointment = **Priority Mode** (1,505 appts); **Queue-during-event = "Event Mode"** (7,125 queue tokens, 98.6%); **Full event = "Installation Event Mode"** (no queue/appts); **Cohort/marathon = "Big Mode"** (big cohorts/assignment); Investment = trial (1 enrollment). `deliveryplanning` corroborates (priority 34 ≈ Priority Mode; normal 70 = rest).
- **A→B coupling is real but coarse:** `modeflow` resolves to 2 templates — Priority (uses *Journey Priority Planning*) vs Event/Installation/Big (share one, uses *Journey Planning*) — + optional Exploration/Snooze/Investment suffixes. `modeflow[0]==mode` only 65% (Priority leads with Integration).
- **Field opportunities CONFIRMED:** of 68 queue providers (cwperson/cwmentoring/cwshadowing/diagnosticperson on *others'* stages), **66 hold a Big Mode product** → BIG participants deliver change-work/diagnostics for others; pairing is manual.
- **`participantmode` rollup rule:** = the mode with the **lowest `modes.sequence`** among the participant's products (5/6 sampled). So `modes.sequence` = headline-mode precedence.
- **Mode behavior per mode = `product mode config` widgets** (cycleofevolution, solarvoice/eiflix/generalcontent, form, dodont, evolutionwishlist). Big/Snooze/Investment have **no widgets** → operator: "that mode hasn't had focused mobile-app personalization yet" (absence ≠ no purpose).
- **The real mode record = `participant mode checklist`** (27,496 docs): per participant×product×mode — `{mode, profileid, participantproductid, productref, aelid, createddate, widget[]}`. Current mode = latest entry; `participant metadata.participantmode` = its rollup. Tied to `aelid` (Accelerated Evolution Level) = delivery.

## The hunt and its honest conclusion (don't re-do this)
Operator was certain the mode set/advance logic is "here, connected to delivery." We chased it rigorously and it is **not in any local repo**:
- StarLabs Angular: every `participantmode` occurrence is a **READ** (grouping/counting/filtering in delivery screens); `participant metadata` writes set only `generalnotes`/`remarks`; `participant mode checklist` read once (`userprofile:814`), written nowhere.
- `firebasefunctions/index.js` (30 fns): **zero** mode refs (the "mode" hits were `TemplateModel`/`dataModel`). `watson-cloud-functions`: empty README. Sibling repos (AHExperts/AHgrowth/videoconference/atctranscription): none.
- `participantsproduct.mode`: only the **manual `mode-dashboard`** writes it on-disk (operator picks mode/nextmode/nextmodedate); product day-knobs (`modeflow`/`integrationdays`/`performancedays`/`extendedperformancedays`/`delaydays`/`diagnosticswithin4days`) are authored in Product Designer but **never consumed on-disk**.
- We initially mis-traced it to the Sales-CRM `breakthroughapprovedleads` CF (`salesleadcrm`); operator corrected — it's delivery-connected, not Sales-CRM.

**Conclusion (TD-016):** the participant-mode engine is a backend deployed outside the local repos — almost certainly a Cloud Function on `fir-sample-aae4a` (tied to AEL/delivery) not checked into `firebasefunctions`. **Developer question:** *"Where is the code that creates `participant mode checklist` docs and sets `participant metadata.participantmode` (the AEL/delivery-driven mode engine)?"*

## Also delivered
- `specs/validated/01-journey-and-products.md` (group #1, validated) earlier; group #2 (Product Modes) doc is pending the engine source.
- Config-authoring screens mapped → `CONFIGURATION.md` ("Config-authoring screens" + "Participant-mode engine is OFF-DISK" sections).

## Artifacts (in-repo, git-tracked)
`./2026-06-03-product-modes-investigation-artifacts/` — the 9 query scripts (`modes_probe{,2,3}.js`, `modes_intent_probe.js`, `evidence_modes.js`, `field_opp_probe.js`, `checklist_probe.js`, `delivery_probe.js`, `queue_mode_probe.js`) **plus `DATA_OUTPUTS.txt`** = the actual captured production data (catalog/intent, day-knobs, modeflow templates, delivery-by-mode, checklist shape). (Originals/scratch: `~/Downloads/svstats/`.)
