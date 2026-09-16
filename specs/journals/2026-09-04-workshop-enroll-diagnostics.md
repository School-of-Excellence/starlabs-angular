# Enrollment diagnostics in the workshop dashboard

**Date:** 2026-09-04 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, builds green, runtime unverified behind login

Operator: add a button next to Q&A / Clear on `/workshop_dashboard/:id` that opens a
dialog with a profileid input, a new-user / existing-user radio and a Check button, and
reports why that user can or cannot enroll — the same explanation the EiFlix Flutter app
prints to the browser console — using **where queries only**, scoped to the workshop the
dashboard is already showing.

---

## 1. Source of truth (read-only)

The rules were extracted from the Flutter project at
`/Users/nanda/Documents/Development/workshop`, which was **read and never written** per the
operator's instruction. Its own journal
`docs/eiflix-workshop-enroll-diagnostics-journal.md` (2026-09-04) is the spec: it documents
seven refusal paths collapsing into four dialog titles, and the asymmetry that makes support
cases unfalsifiable.

Deciding files, all read directly:
- `lib/workshop_v2/utils/workshop_enroll_eligibility.dart` — layer 1, four gates in order.
- `lib/workshop_v2/utils/workshop_enroll_policy.dart` — layer 2 (`evergreenDecision`) and
  the inline pay/coupon card (`inlinePaymentCardAccess`).
- `lib/workshop_v2/screens/workshop/workshop_detail_screen.dart` — `_onEnroll`,
  `_passesEligibility`, and the dialog title for each outcome.
- `lib/workshop_v2/services/workshop_service.dart` — `ParticipantMetadata`,
  `_validateAndWrite`, `isRegistrationOpen`, the enrollment ledger queries.
- `lib/workshop_v2/services/app_service.dart` — `isNewUserProfile()`.
- `lib/login/session_bootstrap.dart` — where the logged-in profile map comes from.

A 4-agent extraction workflow re-read the same source with skeptic verification (114 rules,
51 verdicts). Its corrections were almost entirely **off-by-one line citations** in the
agents' own notes; every load-bearing rule confirmed what the implementation already did.
Two findings were material and are reflected in the code (see §3).

---

## 2. The rules, as implemented

### Layer 0 — context, not a gate
`workshop participant enrolled` where `profileid == pid` **and** `workshopref ==
workshopconfiguration/<id>`. An `enrolled` doc means the user never sees ENROLL at all; an
`enrollednotstarted` doc **with** `waitingstartedat` means they are queued, not refused.

### Layer 1 — eligibility (first failing gate wins)
Short-circuits to PASS when `newusersonly`, `journeybased`, `tierbased` and
`activeparticipants` are **all** false — no metadata read happens at all.

| # | Gate | Rule | Dialog |
|---|---|---|---|
| 1 | `newusersonly` | blocks unless the profile has `workshoponly: true` | "You're not eligible" |
| 2 | `journeybased` | `activejourney` must be in `selectedjourneys`; a missing journey is never allowed; **skipped** for a workshop-only profile | "Contact Admin" |
| 3 | `tierbased` | the profile's `tier` list must intersect `selectedtiers`; applies to **every** profile including workshop-only | "Upgrade to Access!" |
| 4 | `activeparticipants` | blocks only a **present, non-`active`** `customerstatus`; an absent status passes; **skipped** for workshop-only | "Subscription Expired" |

`evergreenaccessto.selected` containing the profileid **exempts the tier gate only** (owner
rule, 2026-08-27). The other gates still apply.

### Layer 2 — the access list
Runs only when `evergreenWorkshop && (referralworkshop || evergreenaccessto is non-empty)`.
- New user → `evergreenaccessto.new == true` ? referral/Buy dialog : refused.
- Existing user → `all == true` ? allowed : `selected` contains the profileid ? allowed : refused.

Refusals show "Currently Unavailable for You" with `enrollmentnotallowedmessage` (existing)
or `enrollmentnotallowedmessagenew` (new), falling back to "Enrollment is not available."

**The asymmetry is the whole point of the tool:** `selected` exempts the tier gate, but a
valid tier never exempts the access list. A user with a perfect tier can still be refused.

### Layer 3 — the enrollment write
Even a user who clears every gate above is refused here, and both are workshop-wide:
- **Registration window** — `detailpage.registrationStartDate` / `registrationEndDate`,
  **skipped entirely for evergreen workshops**.
- **Challenges assigned** — a null `challenges` array refuses the write.

### The pay / coupon card
Decides whether ENROLL is *replaced* rather than refused. `paymentmap.paymentfor` gates the
whole offer; `paymentmap.customerstatus`, when non-empty, is the deciding pay condition for
existing users; a user with free access is never shown a pay card.

---

## 3. Two things the extraction changed

1. **New/existing is derived, never asked.** `AppService.isNewUserProfile()` runs three
   doc-id gets: `existing = participant metadata OR profile_data`, and
   `isNewUser = !existing && new_user_data exists`. So the operator's radio is a *statement
   of intent*, not the input. The dialog computes the app's own answer, follows it, and
   shows a blue notice when the two disagree — a mismatch is usually the actual bug.
2. **The write-path gates existed and were missing from the first cut.** The registration
   window and the challenges check live in `WorkshopService._validateAndWrite`, after every
   UX gate, and refuse everybody. They are now Layer 3.

---

## 4. Field-name traps (verified, not assumed)

- **`evergreenWorkshop` is camelCase** in Firestore. Every other flag here is lowercase
  (`referralworkshop`, `newusersonly`, `tierbased`, `journeybased`, `activeparticipants`,
  `evergreenaccessto`, `payment`, `paymentmap`).
- **`selectedtiers` is plural** and holds tier **document ids**, resolved to names through
  the `tier` collection (`doc.id → doc['tier']`). Same shape for `journey`.
- `paymentmap.paymentfor` is trimmed and lowercased on parse; `paymentmap.customerstatus`
  is a list, each entry trimmed and lowercased.
- `workshopref` is a **DocumentReference**, not a string, in every ledger collection.

## 4b. The input takes a profileid OR an email (added same day)

Operator follow-up: the field should accept either. Detection is deliberately in two parts,
because the two questions are different:

- **Which mode?** `value.includes('@')` — anything with an at-sign is *intended* as an email.
- **Is it valid?** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

Splitting them means `bad@` is rejected with "has an @ but is not a valid email address"
instead of being silently run as a profileid and reported as "profile not found", which
would send support down the wrong path. A value with no at-sign is always a profileid.

An email is resolved to a profileid **before** the diagnosis, with the same `where` shape:
`where('email','==',…)` on `participant metadata`, `profile_data` and `new_user_data`
(all three carry an `email` field). Firestore string matching is case-sensitive and these
documents are not normalised, so the **lowercased form is tried first and the original case
as a fallback** — the pattern already used in `onboarding-pipeline.component.ts`. The
profileid is the document id in `profile_data` / `new_user_data`; in `participant metadata`
the `profileid` field wins with the document id as fallback.

**One email matching several distinct profileids is not an error to paper over.** The dialog
lists the candidates (name, profileid, which collection matched) and the operator picks one.
A duplicate account across `profile_data` and `new_user_data` is frequently the actual cause
of the enrollment complaint, since the new-vs-existing classification depends on exactly
which of those documents exist.

The resolution appears as the first line of the report, with the query behind it, so the
reader always knows which profile was actually diagnosed.

## 4c. What the full extraction added (118 agents, completed after the first cut)

The verification workflow finished with 114 rules across the enroll path. It confirmed the
implementation and contributed three changes:

1. **`profileid` is a FIELD, not the document id — and the app treats the two as
   interchangeable.** `AppService.profileId` reads `loggedInProfile['profileid']`, then uses
   that value as a *document id* against `participant metadata`, `profile_data` and
   `new_user_data`. If a document's own field disagrees with the id it lives at, the app
   reads the document at one id and runs the access-list check, the tier exemption and the
   enrollment ledger with the other. The dialog now reports that mismatch as a failing
   step, and flags a non-string `profileid` separately. Email resolution keys on the
   **document id** (what actually addresses the documents) and warns when the field differs.
2. **`categorybased` is not a gate but produces a misleading status.** A category-based
   enrollment is written `enrollednotstarted` and never carries `waitingstartedat` — the
   user is choosing a focus group, not blocked. Noted so the status is not misread.
3. **Two confirmed non-gates, deliberately still absent:** there is no capacity/seat limit
   in the enroll path, and no `webactive` / `testmode` / `workshopcompleted` check either
   (those filter the workshop *list*, not enrollment). The tool does not invent them.

## 5. Where clauses only

The operator asked for where conditions throughout. The Flutter app reads several documents
by id; those are expressed here as `where(documentId(), '==', pid)` so every read in the
tool is a query. One deliberate exception in shape: `participant metadata` is queried by its
`profileid` **field** first (what the Angular dashboard already does) and falls back to a
document-id lookup, reporting which one matched — a document reachable only by id has no
`profileid` field, which is itself worth seeing.

Reads per check: the workshop doc, `participant metadata`, `profile_data`, `new_user_data`,
and four workshop-scoped queries (`workshop participant enrolled`, `participant workshop`,
`workshoppaymentlog`, `workshopreferral`), plus the small `tier` and `journey` name maps.
An email adds up to three `where('email','==',…)` queries first (six if the lowercase form
finds nothing and the original case is retried).

---

## 6. What it deliberately does NOT do

- **No writes.** It is a read-only explainer.
- **It does not check the user's other workshops**, so it cannot say whether an evergreen
  enrollment would be *queued*. The dialog says so rather than guessing.
- It describes the **V2 web screen only**. There is no Firestore-rules enforcement, and the
  legacy `/workshopold` route skips the access list entirely, so a user refused here may
  still get in elsewhere. The dialog carries that warning in its footer.

## 7. Files

New: `src/app/New-Workshop/workshop-dashboard/enroll-diagnostics/enroll-diagnostics.component.{ts,html,css}`.
Changed: the dashboard's header gains a Diagnose button, and `openDiagnoseDialog()` lazy-loads
the component exactly as `openQADialog()` does.

## 8. Verification

- Dev build green after every step.
- The dialog was rendered in a harness carrying the **real** global stylesheets (Bootstrap 5
  and the Material theme). Typography holds: the `h2` stays 20px with a normal line box
  rather than Material's Roboto 20px/32px, because `.ed-head h2` pins it. Every class is
  `ed-`-prefixed and no Bootstrap component name is reused — see the 2026-09-03 global-CSS
  journal for why that matters.
- The email/profileid classifier was exercised against ten inputs (profileids, mixed-case
  emails, plus-addressing, `bad@`, `@bad.com`, `a b@c.com`): every one routed as intended.
- **Not verified at runtime**: the dashboard is behind login, so the Firestore queries have
  never actually run. The operator pass should check one known-refused profile and one
  enrolled profile on a real workshop, and one lookup by email.
