# 2026-06-03 — Watson finance project correlation: decoding "shifted", journey/product/package, blank journeyref

**Headline:** Connected the newly-provided **Watson production project** (`watsonproduction-becde` — the finance/billing backend) read-only and correlated it with StarLabs. Decoded `journeystatus='shifted'`, grounded the journey/product/package model, and explained the 395 blank-`journeyref` purchases. **The cross-project join key is EMAIL, not id.**

## Context / why
Operator added Watson (purchase + payment data) and asked: make sense of "shifted" by correlation; clarify journey/product/package; pick 5 users with >3 products/journey + diagram; cross-check blank journeyref (human error vs undocumented case) → TD; check if `participant metadata` is a cloud-function aggregate; and challenged my use of the word "cross-sell".

## What we did
- Watson SA had a `"Service Account for Watson Production: "` text prefix + **NBSP (U+00A0) indentation** → normalize before `JSON.parse` (`split(String.fromCharCode(160)).join(' ')`).
- Explored Watson (read-only): finance backend — `ParticipantPurchases` (5,461), `ParticipantPurchases_history` (470), `ParticipantPayments` (24k), `Payment Schedule` (46k), `Invoice`, NACH/EMI mandates, `addproduct` (104), its own activity `Journey` (8,899).
- Correlated via **email** (the real key, per `journeyplan.component.ts:557`).

## Findings (evidence-backed)
- **"shifted" (38/5,144) = journey shift with payment carryover.** Watson records it as a new purchase whose `product` is the literal transition (**"FTO to BiG"**, **"uP! to FTM"**, **"uP! to Launch Your Legacy L2"**), old purchase → `cancelled`, salenotes *"Sale reuploaded to change the journey"*; SL note *"paid 10000 for uP! — move that towards her LYL journey."* Email match 6/6. Full journeystatus tally: completed 1525, upgraded 1124, ongoing 828, cancelled 518, initiated 423, downgraded 344, (none) 344, shifted 38.
- **Journey / Product / Package** (Watson `purchasetype` ∈ journey|product|addons): journey = program purchase; product = deliverable (standalone or add-on); **package = `packagedesignid` = pricing/installment design** (not a content bundle).
- **Cardinality:** 1 journey purchase → 1 `participantjourneyproduct` → MANY `participantproducts` (57-68 for B!G/FTO cohorts), while Watson shows only 1-4 actual purchases → SL "products" are *delivery units*, not purchases.
- **Blank journeyref (395):** real participants; mix of add-ons (no parent journey) + incomplete placeholder rows → TD-014.
- **participant metadata:** client-maintained rollup (8 writer screens); no `functions/` in this repo → cannot confirm a cloud-function aggregate (needs the functions repo).
- **"cross-sell" was my term, imprecise** — the 33% multi-journey are upgrade/shift/continuity *progression chains* (uP!→FTM→BiG→BiG Continuity), not cross-sell. Awaiting operator's canonical term.

## Surprises
- **profileid ≠ participantid** across projects — first correlation returned 0/everything; the join is **email** (TD-015, fragile).
- Watson stores journey changes as human-readable **"<A> to <B>"** purchase rows — a narrative finance ledger.

## Artifacts / harness (in-repo, git-tracked)
`./2026-06-03-watson-finance-and-shifted-artifacts/` — query scripts (`watson_explore.js`, `watson_purchase_probe.js`, `shifted_correlation2.js`, `watsonid_check.js`/`watsonid_check2.js`, `journey_taxonomy.js`) **plus `DATA_OUTPUTS.txt`** = captured Watson data (collections, purchase/payment shapes, `purchasetype`/`purchasestatus` tallies, the literal "shifted" salenotes). (Originals/scratch: `~/Downloads/svstats/`.) New TDs: TD-014 (blank journeyref), TD-015 (email join). 

## Pending / proposed
Propose a new subsystem doc **`specs/WATSON-FINANCE.md`** (purchases/payments/EMI/NACH/invoices + the email join + the shift mechanism + journey/product/package), and update `JOURNEY-LIFECYCLE.md` with the validated `shifted` definition — after operator validation.

## Addendum (2026-06-03) — watson-id linkage is NOT abandoned + group-1 validated
- Operator asked whether recent entries still carry an explicit watson id. Answer: **YES, maintained** — `journeyproductpurchase` 100% (`watsonpurchaseid`+`watsonpurchaselabel`), `salesleads` 2025 & 2026 = 100% (`watsonparticipantid`/`watsonpurchaseid` + `upgrade/downgrade-from/to-watsonpurchaseid`). **0%** on `participantjourneyproduct`/`participantsproduct`/`profile_data`. So the join is **explicit-id primary + email fallback** (`journeyplan.ts:557`), not email-only. TD-015 corrected. (`watsonid_check.js`, `watsonid_check2.js`.)
- Documented as **operator-validated**: `specs/validated/01-journey-and-products.md` (separate from the auto-docs, per D-009). `specs/validated/README.md` defines the validated-vs-auto split.
