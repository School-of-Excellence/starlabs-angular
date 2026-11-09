# Contract: jc-onboarding-usability
Surface: /onboarding-pipeline (OnboardingPipelineComponent)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4300
URL: http://localhost:4300/onboarding-pipeline

## Scope
Improve the usability of the EXISTING onboarding screen per the integrated mockup, keeping every existing element (tweak, not replace). Built incrementally:
- [x] Part 1 — Decouple the coach intake funnel from the salescrm gate (this commit).
- [ ] Part 2 — Re-theme (iOS tokens + dark mode), funnel layout, welcome-call surfacing, move-confirmation guards.

## User moves (Part 1)
1. Open the URL logged in as a journey coach (salescrm NOT configured).
2. See the "Sources" intake funnel render with real data: Not Assured / Not Assured·Welcome Call / To Be Onboarded / To Be Onboarded·Welcome Call / Onboarded This Month, each with counts and participant cards (Purchased/Scheduled dates, Welcome-call + Add-to-pipeline actions).
3. See the Pipelines section show an inline "Salescrm not configured" notice — not a full-screen block.

## Invariants (Part 1)
- The intake funnel (main Firestore `participantjourneyproduct`) renders even when salescrm is unconfigured or access is denied.
- Only a genuine non-salescrm init failure (`fatalError`) blanks the whole screen.
- A salescrm denial shows an inline notice in the pipelines section; the funnel stays usable.
- Stage definitions unchanged: Not Assured = `paymentplan == null`; To Be Onboarded = `paymentplan != null` AND not onboarded; Onboarded This Month = `onboarded` + `onboardedtime` in month; `welcomecall` splits the ·Welcome Call sub-buckets.
- No existing element removed; all source actions (welcome call, schedule, add to pipeline) preserved.

## Banned
- Gating the whole screen (or the intake funnel) on `accessDenied` / salescrm again.
- Removing any source bucket, action, or the salescrm pipelines section.
- Production Firebase; secrets in the diff; participant PII in logs/commits.

## Proof
- Check: qa/checks/jc-onboarding-decouple.mjs
- Command: node qa/checks/jc-onboarding-decouple.mjs
- Fail if reverted: yes
- Last run (2026-11-09): PATCHED 8/8 PASS (exit 0); REVERTED 6 FAIL (exit 1); RESTORED PASS.
- Live (starlabs-test, :4300, 2026-11-09): PASS — funnel renders with real intake data (Not Assured 60, To Be Onboarded 6, To Be Onboarded·WC 1); Pipelines shows the inline salescrm notice; no console errors from the change.
