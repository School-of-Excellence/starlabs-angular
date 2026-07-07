# Journal — AI-ATC studio→prescribe flow, end-to-end debug

**2026-07-06** · Continues `2026-07-05-ai-atc-button-allowlist-gating.md`. Plan:
`specs/plans/2026-07-05-ai-atc-button-allowlist.md` (Session update section).

## What we did
Took the gated "Use AI-Generated ATC" button from "shows nothing" to a working studio→prescribe
draft flow, fixing five distinct issues found by live testing on localhost (which uses
`environment.development.ts` → project **fir-sample-aae4a**, real Firestore, not the emulator).

## The chain of bugs (in the order they surfaced) + WHY each fix
1. **Button never showed** — config gate is fail-closed and the `classify/queue-atc-edit-config`
   doc must live in *fir-sample-aae4a* (the project `ng serve` actually uses). Also the availability
   query filtered `stage=='Scope Enhancement'` which excluded the real docs. → removed stage filter.
2. **Button showed but draft creation silently failed** — we'd dropped `status`, so the latest doc
   could be incomplete (no `output`). → pick the latest `status=='completed'` (client-side, index-free).
   Then per operator: removed `limit` entirely and scan all, newest-first.
3. **"doc matches but not showing"** — the query `orderBy('createdAt')` can silently drop docs missing
   that field; and there are TWO databases — confirmed the doc is only in `firestore-atc` (what we query).
4. **prescribe-atc "invalid json structure"** — schema mismatch: `queue_atc_generation.output` is
   `---JSON---`-delimited with top-level `adjustments`/`areas_needing_more_data`, NOT the legacy
   `ATC_Report` shape. → `parseAtcOutput()` + remap for `source=queueatc`.
5. **Procedures not converting** — AI emits pseudo-codes ("A&H Procedure24"); `extractProcedureKey`
   *stripped the number* (the actual key). → frozen `order→realName` glossary
   (`ATC-Ops/procedure-pseudonyms.ts`, mirror of sibling `atc-finetunning/procedures-cf/src/seed.js`),
   resolve then match `realName` → `procedures.name`. Offline harness proved all formats resolve+match.
6. **Duplicate drafts** — `getATCoptions()` always minted a random `autoSaveID` (`generateId`),
   clobbering the AI entry's deterministic `temporary_ATC/<docid>` → a new draft every open/refresh.
   → guard: `getATCoptions()` returns early on `?aigenerated`. AI flow = one deterministic docid.

## Surprises / gotchas for future sessions
- The operator's instinct pointed at the real cause twice: the `temporary_ATC` early-return (stale
  draft masks re-parse — why the debug logs never printed) and the duplicate-draft id churn.
- Two UI surfaces read `queue_atc_generation` from *different databases* (default vs firestore-atc);
  the studio uses `firestore-atc`. Don't assume one DB.
- `queue_atc_generation` `output` JSON schema ≠ `ai_generated_atc_summary`; they are NOT interchangeable
  despite the old comment in prescribe-atc claiming "the parse is identical".
- Procedure pseudonym glossary is a frozen curated artifact in a sibling repo — do not re-derive the
  number from a live `orderBy("name")` (it can drift). Map by `realName → procedures.name`.

## State
All changes type-check clean (`tsc --noEmit`, exit 0). Not built/run as the app (project rule).
Temporary debug logs stripped; kept the fail-closed config error + `[AI-ATC]` unmatched-procedure warns.
Committed on `feature/queue-atc-generated-view`. Config doc + duplicate cleanup are operator console tasks.
