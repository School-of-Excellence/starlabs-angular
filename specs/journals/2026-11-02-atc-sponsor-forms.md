# 2026-11-02 — ATC sponsor forms + one forms query on View ATC

Plan: `specs/plans/2026-11-02-atc-sponsor-forms.md` (agreed 2026-11-02, built the same day).

## What landed
- **Model config** (`create-atcmodel`): "Filled by" has a third option, Sponsor (`filledby: 'sponsor'`).
- **Specialist answers carry the specialist's profile id**: View ATC's Fill form / Edit answer links no longer pass
  `profileid`, so the form screen falls back to the logged-in user (`initializeUserData`). Drafts follow.
- **View ATC — one forms query** (`openActivityForms`, live while the ATC is open):
  `atcid in [ATC + versions] OR participantproductid == ATC's OR (queueref == ATC's queue AND profileid == participant)`.
  Rows: Delivery (purchase match), Queue (queue + participant), ATC forms (atcid match, row by `formid`). ATC form
  rows read their answer from this query, not from `formsubmitted` (the collapsed "X of N" tag still reads it).
- **Requests listener** loads by `atcid in [versions]` only, so sponsor requests load.
- **Option A layout**: the three parts stay; inside ATC forms, three groups by the model config (you / participant ·
  name / sponsor · name + lock). Specialist rows say "Filled by {name}" from the answer's `profileid`.
- **Send to sponsor**: an in-card dialog — search `participantList` while unlocked (prefilled with the ATC's sponsor),
  the locked name after. One batch: the request `{…, profileid: sponsor, participantid, filledby: 'sponsor'}` + ATC
  `sponsorid`. Participant requests now carry `filledby: 'participant'`. Withdraw wording follows who fills.
- **App**: sponsor cards get a "Sponsor" tag and "For {participant}" (name read once from `profile_data`, cached);
  the answer's `filledby` comes from the request.
- **Version chain** (web `findCurrentAtc`, app `latestAtcVersionId`): no 20-hop cap. A version seen twice, an empty
  `upgradedto`, or one pointing at a missing doc → "This ATC is corrupted — unable to find the stable version."

## Why it is shaped this way
- **The answer's `profileid` says who filled it.** The operator's rule: load forms by ATC id / purchase / queue, then
  group by `profileid`. That only works if every filler writes their own id — the specialist path wrote the
  participant's id, a choice made on 2026-10-29 without sign-off (the step-1 plan wrote `&profileid` but never whose).
- **The queue clause matches the participant (operator decision during implementation).** The agreed query had no
  `profileid` filter; the e2e run showed a queue holds many participants, so Queue activities listed another
  participant's answer (VATCA-03: 2 rows, expected 1). The operator chose "queue + participant". The purchase clause
  keeps no filter — a purchase id is one participant's; the seeded answer of another participant carrying tfp's
  purchase id now shows (VATCA-01 updated: duplicates stay visible).
- **Sponsor locks after the first sponsor request or answer** (operator): one sponsor per ATC, chosen once; Withdraw
  of every sponsor request with no sponsor answer frees it again.
- **Live forms listener, not a one-time read.** ATC form rows used to flip to Submitted through the live ATC list
  (`formsubmitted`); once they read answers from the query, a one-time read would have lost that.

## Tests (emulator only)
- Unit (Karma): View ATC 30/31 — sponsor rows / lock / duplicate rows added; the 1 failure is the pre-existing
  `should create` (no AngularFire provider). Flutter `test/atc_forms_test.dart` 17/17 (no-cap, corrupted, sponsor ids).
- Hub: seed phase 8 (tsp participant, tss sponsor, SPN / SP0→SP1 / SPX / COR); new
  `atc/view-prescribed-atc-sponsor.spec.ts` (VATCS-01..04); forms spec updated (no `profileid` in links, the
  specialist's id on answers / drafts, `filledby` on requests, group wording); `journey/atcmodel-forms.spec.ts`
  AMF-05 (Sponsor toggle). Runs: atc 41/41, journey AMF 5/5. Readiness: MATCHED (3177 selectors).
- Harness: port 8080 was held by the iOS Simulator's Runner, so the emulator ran on 8181 with a scratch config and the
  gitignored `environment.emulator.ts` pointed there for the run — restored (checksum bcd1a117…).

## Not run
- **Flutter integration test** `integration_test/features/atc_sponsor_form_test.dart` (sponsor card + submit) is
  written and analyzes clean, but not run: its emulator port is fixed at 8080 (held by the Runner) and the run needs
  the Firebase settings swap, which needs the operator's go-ahead.
- `atc/scenario-atc-forms.spec.ts` (web half of the mobile scenario) — needs the Flutter phases.
- `graphify` isn't installed here; the graph wasn't rebuilt.

## Pending
- Commit the three repos (and push when the operator says).
- Index check for the new `(queueref AND profileid)` branch on production — equality-only, expected to need none.
