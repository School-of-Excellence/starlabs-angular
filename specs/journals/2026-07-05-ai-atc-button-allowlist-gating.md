# Journal — AI-ATC button allowlist gating (Dynamic Studio v2)

**2026-07-05**

## What / why
Gated the "Use AI-Generated ATC" button in `dynamic-studio-v2` to configured users only.
Before: a single hardcoded `aiAtcFeatureEnabled` boolean — all-or-nothing, redeploy to change.
After: that boolean stays as a code-level kill-switch, and access is decided by an admin-editable
`classify/queue-atc-edit-config` doc supporting two modes — **global** (`global:true` → everyone)
and **allowed-users** (allowlist by profileid / email / role bypass) — read once at studio load.
Config lives in the `classify` collection (the app's existing config convention: wati, queuesystem,
adjustment_awareness, …). See plan `specs/plans/2026-07-05-ai-atc-button-allowlist.md`.

## Why these choices
- **Config doc over role-gating:** the ask was "only people we *configure*" — a named pilot set
  that changes over time. Role-gating (`isMentor`-style) flips it on for a whole role at once and
  needs a redeploy/role-doc edit to adjust. The `dashboard` collection already establishes the
  "profileid[] allowlist read from Firestore" pattern here, so we matched it.
- **Gate the specialist, not the participant:** the button-clicker is the operator we control.
  Note the existing `checkAiAtcAvailability()` query filters `queue_atc_generation` by the
  *participant's* profileid — that's a different axis and was left untouched.
- **Fail-closed:** missing/disabled config or any read error → no access. Preserves the prior
  safe default (feature held) and means a non-existent config doc = nobody sees the button, so
  arming `aiAtcFeatureEnabled = true` is safe to ship before the doc exists.

## Surprises / notes
- `email` is reliably available two ways (`currentuserData['email']`, used elsewhere at ~:3968;
  and `this.guard.email`, public) — so allowlist-by-email works without extra reads.
- Config lives in the **default** DB, not `firestore-atc` (which stays ATC-data-only). No ATC
  Firestore data was read/written — only the component source + a `feature_config` config doc.
- Type-check clean (`tsc --noEmit`, exit 0). Not built/run as the app per project rule.

## Pending
- Operator must create `classify/queue-atc-edit-config` in the Firestore console (see plan for shape).
- Optional: Firestore security rule on `queue_atc_generation` if hard enforcement is needed.
- Commit + push are operator-gated. Branch: `feature/queue-atc-generated-view`.
