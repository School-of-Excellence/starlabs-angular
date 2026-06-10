# 2026-06-10 — Journey & Products e2e DEEPENED to full recon depth

> WHY this pass landed and WHY each hard case is shaped the way it is. The WHAT lives in
> `e2e/journey/journey-deep.spec.ts` + `e2e/journey/seed-journey.js`. Read this before changing those.

## Goal
Close the gap between the recon candidate list (`e2e/recon-allcomp/journey-products.md`) and the first
(render-only) journey suite. The first pass shipped catalog authoring (JP-01..04, JP-17) + purchase/support
RENDER (JP-05, JP-07) + a route smoke. This pass adds the deferred WRITE-mutation + CF/side-effect cases:
**JP-06** (purchase save), **JP-08** (mark onboarded), **JP-09** (onboarding email archive), **JP-10**
(sales-lead reject — the test-project-only sales decision), plus **product-delivery + deliverysequence
authoring** (JP-AUTH + JP-PD) and **formtemplate** render (JP-16). 7 new GREEN cases.

## What each case actually drives (and the anti-circular oracle)
- **JP-06** — the REAL purchase form for a CLEAN-slate participant (`p2`, 0 seeded purchases): add a journey
  purchase → pick the seeded journey (auto-populates the mapped product via `journey-to-product`) → fill
  subscription dates + package + min payment → Review → fill the required change-note → Update. The app's
  `updateProduct()` writeBatch mints `participantjourneyproduct` (journeystatus **initiated**, app-computed) +
  `journeyproductpurchase` + `participantsproduct`. Oracle: count 0 → 1 by `profileid` (app writes carry NO
  testrunid — read back by natural key). Using a dedicated clean profile keeps the 0→1 oracle exact and keeps
  JP-05's "exactly 2 seeded PJP" count for `p0` untouched.
- **JP-08** — journeysupport → the real `OnboardingRemarkComponent` dialog. The "Mark as Onboarded" button
  only renders when `paymentplan != null` (journeyplan.html:521), so `PJP_ONB` seeds `paymentplan:'EMI 3'` +
  `onboarded:false`. Submit is gated by `validateOnboard()` whose FINAL line enables it iff `referral` is set
  → we click the Referral "No" chip. `onSubmit()` always writes `onboarded:true` (line 873), parent does
  `updateDoc(participantjourneyproduct/{docid}, value)`. Oracle: `onboarded` false→true (precondition was
  explicitly false).
- **JP-09** — same dialog + "Send Onboarding Email" checkbox + select the seeded `email templates` doc →
  `createEmailArchive()` writes one `email archive` doc (`profileid:[pid]`, `type:'onboarding'`,
  `status:'send'`). Oracle: archive count (array-contains pid) 0→1.
- **JP-10** — salesleads Reject button (renders while `status==null`) → `UpdateDialogComponent` notes →
  `rejectSale()` does `updateDoc(salesleads/{id}, {status:'Rejected', rejectnotes})`. TEST-PROJECT ONLY: no
  Watson, no salescrm; the `breakthroughapprovedleads` HTTP CF it then fires is short-circuited by the prod
  firewall. We deliberately chose **reject** (not approve) because approve opens `CreateWatsonProfileComponent`
  which is hard-Watson-coupled (R-02). Reject is the faithful test-project-only sales-decision write.
- **JP-AUTH** — the deliverysequence authoring form: product select (`nonexistingproductlist`) → delivery type
  text → a "Delivery Activities" option from the seeded catalogs (our `delivery forms` "Form" activity) →
  label + description → Submit → `setDoc(productToDeliverySequence/{auto-id}, {product:ref, deliveryoptions:
  [{deliverytype, deliverysequence:[{activity:ref}]}]})`. Oracle: 0→1 docs referencing product `P2` (untagged),
  plus the `deliverytype` round-trips into the app-written doc.
- **JP-PD** — product-delivery LIST: mount + the "Map Products & Delivery Activities" authoring entry button.
- **JP-16** — formtemplate `?id=<deliveryFormId>`: the app builds the reactive form from the `delivery forms`
  doc's `formarray`; we assert the seeded `'Text'` field's `fieldname` renders (app-computed from Firestore).

## Surprises / gotchas (the load-bearing WHY)
1. **product-delivery LIST is a pre-existing broken read screen.** Its `collectionSnapshots(
   'productToDeliverySequence')` handler MUTATES each emitted doc in place
   (`snapdata['product'] = snapdata['product']['path']`), so the SECOND stream emit re-runs `['path']` on the
   now-string value and throws `Cannot read properties of undefined (reading 'length')`. Verified: the MatTable
   renders ZERO data rows (only the header tr) and emits a fatal console error. So JP-PD asserts the **shell +
   authoring entry button**, NOT the rows — and the product-delivery `describe` does NOT use `assertNoFatal`
   (same posture as JP-07's tolerated workshop-widget `.toDate()` bug). The substantive product-delivery
   coverage is the **authoring WRITE** (JP-AUTH), which doesn't depend on the broken list.
2. **formtemplate renders via the plain `?id=` route — but the field schema is capitalized.** The HTML field
   types are `'label'`, `'Text'`, `'number'`, `'date'`, `'DropDown'`… (NOT `'short'`), and fields render
   `{{form.fieldname}}` (NOT `form.label`). The seed's `delivery forms.formarray` had to match exactly. Also
   the form-build (`showcontent=true`) happens in `ngAfterViewInit` after a slow named-DB (`firestore-forms`)
   init, so JP-16 needs a generous visibility timeout (30s) — a 6s probe saw only "menu".
3. **`firestore-forms` named DB IS provisioned** on the cloud test project (probed). So formtemplate mounts
   despite the app only `provideFirestore(()=>getFirestore())` (default) — `getFirestore('firestore-forms')`
   lazily handles the named DB off the same app.
4. **`email templates` is a SHARED global collection** (only testrunid-scoped for teardown). A concurrent suite
   (comm) transiently swept it between our seed and JP-09 once → the dialog's template dropdown was empty and
   JP-09 failed. Fix: `ensureEmailTemplate()` re-asserts the active template at JP-09's precondition, making it
   immune to cross-suite races. (General lesson for shared-project suites: self-seed any precondition that
   lives in a non-run-isolated collection right before the test that needs it.)
5. **journeyplan selects `participantJourneyData` = the FIRST initiated journeyref PJP.** With two seeded
   onboard PJPs of equal `purchasedate` the dialog target was non-deterministic, so JP-08 could update a PJP
   JP-08 wasn't asserting. Fix: seed EXACTLY ONE initiated PJP for `p1` (`PJP_ONB`) — both JP-08 and JP-09 act
   on it deterministically.
6. **OnboardingRemark Submit gate is `referral`-only.** `validateOnboard()` returns through several branches
   but its last statement overwrites `disabled` purely from `referral` emptiness — so the ONLY thing that
   enables Submit is choosing a Referral chip. (The onboarded radio, specialist, date are red-herrings for the
   no-appointment path.)
7. **Purchase form has DUPLICATE controls in two sections** (top "Participant Journey Product" + bottom
   "Participant Purchase"), both bound to the same model. `.first()` on each combobox is correct; the
   subscription date inputs live in the TOP section for journey purchases, the product package/min-payment in
   the BOTTOM section.

## App-written-doc teardown (no testrunid)
JP-06's `journeyproductpurchase`/`participant purchase logs`/new `participantsproduct`/PJP and JP-09's
`email archive` are written by REAL product code → no testrunid stamp. The seed teardown sweeps them by their
natural key (`profileid`, scalar or array-contains), and each WRITE test cleans its own writes at start+end so
it is re-runnable. `cleanProductDeliveryFor(P2)` does the same for JP-AUTH's authoring doc.

## Validation
`node journey/seed-journey.js --teardown && --seed` clean (PJP count 3). `--list` compiles 15 tests
(8 existing + 7 new). Each new case run individually against the shared :4200 dev-build server: GREEN. Did NOT
run the full suite (orchestrator greens it serially). No composite indexes needed (every assertion uses a
single-field admin `countWhere`/`queryWhere`; journeyplan's `participantsproduct profileid+sequenceorder` index
is already deployed — JP-08 loaded fine).

## ATC / cross-project safety
atcmodel:null on all seeded products/journeys (ATC branches dead). NO Watson/salescrm doc seeded or written;
the only external (breakthroughapprovedleads on reject) is firewalled. Test-project only.
