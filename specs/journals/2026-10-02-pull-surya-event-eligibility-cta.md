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

---
## Second pull (same day): surya 7835cb21 — eligibility buckets wired
Merged --no-ff. The confirmations overview gains **Upgrade / Addon / Continuity** columns and Not eligible is now
the bucket count; the product-funnel breakdown replaces **No product** with Upgrade / Addon / Continuity / Not
Eligible. Both components now declare + load `participantMetadata` themselves, so the stopgap declarations
from the first merge were REMOVED (they became duplicate identifiers, TS2300).

Bucket rule (`participantBucket`): active → consumption/cohort fail = not eligible, journey mismatch = upgrade,
not owner = addon, else eligible; non active → (arena allows non active AND owner) = eligible, journey match =
continuity, else upgrade; anything else / no metadata = not eligible. Only REQUESTED, non-queue-active people count.

Flagged, not changed:
- Each component reads the WHOLE `participant metadata` collection in its constructor (two full scans when the
  funnel opens) — heavy on production-size data.
- Race: buckets are computed when the overview loads, not when metadata arrives; if metadata is slower (likely
  on prod), every requester classifies as "not eligible" until the page is reloaded/paged.
- Rows served from `epc_snapshot` / `event_stats` never set upgrade/addon/continuity → those cells show "…".
- Leftover `console.log`s (bucket per requester, cardMap).

e2e: hub EPC-ELIG-01 (one requester per bucket + an approved one excluded).
