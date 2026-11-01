# PROGRESS

## Current state
- **starlabs-angular `atc-development`**: last pushed `1bb069e8` ("ATC Form integration - 2"). This session's work is
  local and UNCOMMITTED (commit denied by permission). NOT merged into `development` / `production`.
- **starlabs-e2e-tests `main`**: pushed `9b05109`; this session's seed/specs uncommitted. **Flutter `atc-feature`**:
  pushed `06c1066`; this session's change + test uncommitted.
- **User manuals (private claude.ai pages, not yet shared):** WiSH https://claude.ai/artifact/2Z79mXkJJSL2imAuSvJXnW ·
  EI Solution https://claude.ai/artifact/Rw5tp9SQ5Zag8qUfNeqQWt
- Local harness stopped; Flutter Firebase settings files restored (checksums verified).

## Last session changes (2026-11-01) — journal `specs/journals/2026-11-01-atc-delivery-queue-forms.md`
- **Delivery and queue forms on View ATC** (plan `specs/plans/2026-11-01-atc-delivery-queue-forms.md`):
  - Flutter FILL button saves the delivery step's own `participantproductid` on the answer (was the app's "active" id).
  - Prescribe ATC saves `participantproductid` (the step holding the appointment) in the draft and on the ATC.
  - View ATC Forms card: Delivery activities (`participantproductid`) · Queue activities (`queueid` → `queueref`) ·
    ATC forms (locked note until validated). No extra filters/dedupe by operator rule — duplicates stay visible.
- **Why:** a participant can buy a product more than once; the purchase id, not the product, picks the right forms.
  Queue ATCs save only `queueid` (verified); queue answers already carry `queueref`.
- **Tests:** hub 37/37 on the emulator (new VATCA-01..04, PTPL-02/03/05, VATCF-03 updated); Flutter delivery-form test
  passed on the simulator.
- **Failures + causes:** Flutter run 1 — seeded participant not `profileverified` (fixed in seed phase 7); run 2 —
  test injected a typed list (test bug, fixed). `graphify` module isn't installed here, so the graph wasn't rebuilt.

## Pending
1. **Operator:** commit the three repos (angular: src + plan + journal + PROGRESS; hub: seed + specs + support;
   Flutter: `productDeliverySequence.dart` + new integration test). Push only when you say.
2. Production Firestore rules: specialists need list queries on `formsByClient`; also `atc_form_requests` /
   `formsubmitted` / `formsByClient log` (earlier item).
3. Earlier items still open: `delete:false` on existing `delivery forms` (real DB — operator); number fields save as
   text; the View overlay matches answers by position; legacy requests without `formstatus`; local queue-suite
   failures (16); merge `atc-development` → `development` when approved; the last session's manual kit + journal
   files are uncommitted too.
4. Operator: review and share the two manuals. Optional: Flutter procedure-row 2.2 px overflow.
