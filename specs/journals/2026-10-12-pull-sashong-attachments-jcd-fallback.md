# 2026-10-12 — sashong-development → charan-release: email attachment upload + JE product fallback (176ce857)

| Screen | How | Change |
|---|---|---|
| Journey Onboarding / onboarding-remark (dialog) | path-scoped checkout of the .ts (charan-release had no changes there since the merge-base) | "Add attachment" uploads each file to Firebase Storage `email-attachments/<id>` and attaches its download URL (was an in-memory data: URL); a failed upload alerts |
| Journey Onboarding / journeycoach-dashboard | 176ce857's 2-line hunk only (`git show … | git apply --3way`) | `getProductName` falls back to the sale's participantjourneyproduct productref (saleProductRefs / `_sid` from d86af3ea finally read) |

Not taken (again): queue-event-health Reinitiate, sashong's older app.routes.ts, cav-v2 unit stub, the rest of the jcd file
(it reverts our 09-29 fixes — verified intact after the patch: no getAtcAlpha calls, new-tab health board, server-side ticket count).

Notes: uploaded attachments stay in Storage (no cleanup) and are readable by anyone holding the download URL.

e2e: hub `journey/coach-dashboards.spec.ts` JCD-05 (Storage stubbed) + JCD-06; seed SLP note, SLQ + PJP_SLQ, classify/postmarkserver.

Revert: `git checkout 5577db76 -- "src/app/Journey Onboarding/onboarding-remark" "src/app/Journey Onboarding/journeycoach-dashboard"`
