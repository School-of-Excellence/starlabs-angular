# 2026-11-20 — Pull from sashong-development: JC Health notes → SalesCRM

**Operator ask:** "pull from sashong-development" → "pull 1". Only `journey-coach-health-dashboard.component.ts` taken
(Sashong `47514a18` + `0464254e`, 2026-11-19, "Notes Integration to JECRM / POST Method"). Our side had not touched the
file since the merge base `2746a5c6`, so his version applies whole (+66/−4).

Not taken: journey-pipeline (no route or selector anywhere — unreachable), evolutionprep-variation, queue-event-health
bulk Reinitiate, content-analytics-v2 spec, and his `app.routes.ts` / `journeycoach-dashboard` (both mostly reverts of
newer development work; the latter would re-add the ATC fetch).

## What it does
After a JC Health log saves (Call outcome, Health state, Follow-up, Note), `sendNoteToCrm()` also POSTs
`{ email, note: "<label>: <note> | <details>" }` to SalesCRM `crmApi/v1/leads` — `salescrm-test-19` when the build's
`environment` project is `starlabs-test`, `salesleadcrm` when it is `fir-sample-aae4a`, nothing otherwise.
Bearer token = `slack webhookurls/SalesCRM Update Secret` (`webhookurl`), cached per session.
- Fire-and-forget: not awaited, errors caught → snackbar "CRM status: N" / "CRM call failed"; the local save is unaffected.
- No email on the participant → skipped with a snackbar.

## Worth knowing (not changed)
- The CRM token is read from Firestore by the browser, so anyone who can read `slack webhookurls` can read it.
- The request body (participant email + note text) is `console.log`ged.
- Sashong imported `environment.development`; changed to `environment` (operator, same day) so the hosted build picks
  the CRM by its real project. The 18 other screens that import `environment.development` were left as they are (operator).

## Revert guide
Before commit: `git checkout HEAD -- "src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.ts"`.
After commit: `git revert <that commit>`. Self-contained — no template, hook or other screen depends on it.
