# 2026-10-02 — surya-development → charan-release (merge --no-ff): event eligibility, Configure CTA, queued email

## What came in (merge of origin/surya-development @ 573e1f59; merge-base f87040e7)
| Screen | Commit | Change |
|---|---|---|
| Events / update-event-detail | 0e8f5685 | per-product eligibility: journeys, live-marathon cohorts, customer status, consumed-product rules; template restyle |
| Events / event-cta-config (new) + event-list button | 7b5b6c14 (squash of f2ab80aa) | dialog editing classify/eventcta + classify/eventstatusmessage (whole-doc setDoc) |
| Participants / email-input + participants-analytics | 0c32b01a | queued email → 'validated' → marked 'send' + sendBatchEmail, keeps servername |
| Events / confirmations + product-funnel | 573e1f59 | `participantBucket()` eligibility buckets — NOT called yet (new computePageEligibility is commented out) |
| New-Workshop / workshop-dashboard | Nanda 0e6494bd, 4db6890f | already on development (PR #327) — identical, came via Surya's development merge |
big-ladder: identical to charan-release already.

## Edits on top of the merge
| Edit | Why |
|---|---|
| `participantMetadata: Record<string, any> = {}` in EventParticipationConfirmationsComponent + ProductFunnelComponent | 573e1f59 reads `this.participantMetadata` but never declares it → TS2339, build broken on surya-development itself. Operator chose "declare the field": behaviour unchanged (function unused) |
| `evl-configure-cta` on the Configure CTA button | it reused `data-testid="evl-create-event"` → duplicate hook |
| 15 `ecta-*` hooks on event-cta-config | dialog had none; readiness gate |

## Behaviour change to know
**Eligible Journey is required** on every arena product (`eligibility.journeyid` Validators.required): an
event can't be created/updated until each arena product names ≥1 journey. Hub EVT-02 (create event) broke on
exactly this and was refit to pick one.

## e2e
Hub `events/event-eligibility-cta.spec.ts` UED-ELIG-01, ECTA-01..03 (+ seed 9d/9e). hook-diff aligned for
event-list, event-participation-confirmations (events) and workshop-dashboard (workshops).

## Revert guide (per screen)
- whole merge: `git revert -m 1 <merge commit>`
- event editor eligibility: `git checkout f87040e7 -- src/app/Events/event-list/update-event-detail`
- Configure CTA: `git checkout f87040e7 -- src/app/Events/event-list/event-list.component.* && git rm -r src/app/Events/event-list/event-cta-config`
- queued email: `git checkout f87040e7 -- "src/app/Participants Profile Management/participants-analytics/email-input" "src/app/Participants Profile Management/participants-analytics/participants-analytics.component.ts"`
- confirmations buckets: `git checkout f87040e7 -- src/app/Events/event-participation-confirmations`
