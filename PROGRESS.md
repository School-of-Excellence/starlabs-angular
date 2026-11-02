# PROGRESS

## Current state
- **starlabs-angular `atc-development`**: last pushed `916500d7` (delivery / queue forms). This session's sponsor-forms
  work is local (see below). NOT merged into `development` / `production`.
- **starlabs-e2e-tests `main`** (pushed `fafc6ee`) and **Flutter `atc-feature`** (pushed `ea71681`): this session's
  seed / specs / app change are local.
- **User manuals (private claude.ai pages, not yet shared):** WiSH https://claude.ai/artifact/2Z79mXkJJSL2imAuSvJXnW ·
  EI Solution https://claude.ai/artifact/Rw5tp9SQ5Zag8qUfNeqQWt
- Local harness stopped; `environment.emulator.ts` restored (checksum verified).

## Last session changes (2026-11-02) — journal `specs/journals/2026-11-02-atc-sponsor-forms.md`
- **Sponsor forms** (plan `specs/plans/2026-11-02-atc-sponsor-forms.md`): model config "Sponsor"; View ATC Send asks
  for the sponsor once (locked after the first sponsor request/answer), saves `sponsorid`; requests carry `filledby`
  (+ `participantid` for sponsors); the app card shows "Sponsor · For {name}" and writes `filledby` from the request.
- **One forms query on View ATC**: atcid in versions OR purchase OR (queue AND participant); who filled = the answer's
  `profileid`; Option A layout. The queue-participant match was added mid-build after VATCA-03 caught other
  participants' queue answers (operator chose it).
- **Specialist answers now save the specialist's profile id** (the old participant id was an unapproved choice).
- **Version chain**: no 20-hop cap; a loop / broken pointer says "This ATC is corrupted — unable to find the stable version."
- **Tests:** unit 30/31 (pre-existing `should create`), Flutter unit 17/17, hub atc 41/41 + journey AMF 5/5,
  readiness MATCHED. CI ECTA-02 earlier today: flaky, passed on re-run.

## Pending
1. **Operator:** commit/push the three repos (angular: src + plan + journal + PROGRESS; hub: seed + specs + support;
   Flutter: FillForm / homeContent / tests).
2. Run the Flutter sponsor integration test — needs port 8080 free (the Simulator Runner holds it) + the settings swap.
3. Earlier items still open: number fields save as text; overlay matches answers by position; legacy requests without
   `formstatus`; `delete:false` on delivery forms (real DB); local queue-suite failures (16); merge `atc-development`
   → `development` when approved; share the manuals; Firestore perf open issue.
