# 2026-11-12 — Queue creation: forms missing from the "Select Form Template" dropdown

Branch: `charan-release` · Status: committed `07d55dca` (not pushed)

## CHANGE LOG & REVERT GUIDE

| # | Scope | File(s) | Commit | Revert |
|---|---|---|---|---|
| 1 | Delete filter: hide only `delete === true` | `src/app/queue system/queue-creation-v3/queue-creation-v3.component.ts` (forms fetch, ~line 496) | 07d55dca | `git revert 07d55dca` (one commit: all three go together) |
| 2 | Search box on the Action Type → Form dropdown | same `.ts` (`filterFormTemplate`, `returnFormTemplates()`) + `queue-creation-v3.component.html` (`qcv3-sel-35-i`, new search hook `qcv3-inp-35s-i`) | 07d55dca | `git revert 07d55dca` (one commit: all three go together) |
| 3 | Search box on "Forms To Display" (multi-select) | same `.ts` (`filterParticipantForm`; `returnFormTemplates()` now takes search text + one id or an array of ids) + `.html` (`qcv3-sel-47-i`, new search hook `qcv3-inp-47s-i`) | 07d55dca | `git revert 07d55dca` (one commit: all three go together) |

All three landed in one commit and share the `.ts` file. To undo only the search boxes while keeping the delete fix, revert the commit, then re-apply the one-line `templateData['delete'] !== true` change.

## Why

**Report:** "CTD – Impact Valuation Activity" didn't appear in the form dropdown in prod.

**Root cause:** the dialog loads `delivery forms` with `orderBy('formname')` and kept a doc only if
`[null, undefined].includes(delete)`. The prod doc `xMVoKfqAJX8WU7Fa4Xrd` has `delete: false`,
which that check treats as deleted. Prod read (2026-11-12, read-only): 100 forms. 9 have `delete: false` and were hidden, 5 have
`delete: true`, and none are missing `formname`. Hidden live forms: 'That Must Have Deal' List,
ATC Understanding Validation, Accelerated Evolution Level, Aspiration Form, B!G/Legacy/uP! Life Report,
CTD Mastermind - Aspiration Form, CTD – Impact Valuation Activity, My Evolution Wishlist,
Winning Heart Readiness Form.

**Fix:** `templateData['delete'] !== true`. Missing/null/false are shown, true is hidden. The same
`formTemplateList` also feeds "Forms To Display" (`participantform`), so those 9 forms now appear there too.

**Search:** `ngx-mat-select-search` (already imported, same pattern as Queue Mentor). The filter text is
per stage (`filterFormTemplate[i]`), so a search in one stage doesn't empty another stage's list. The
selected form is always kept in the filtered list so the select doesn't lose its label mid-search.

## Verification
- `ng build --configuration development` passes (output in a scratch dir).
- Not exercised in the UI: the local dev env points at production (`fir-sample-aae4a`) and is
  login-gated, so the dialog wasn't opened.

## Pending
- Push (operator approval) and a UI check of both dropdowns against starlabs-test or the emulator.
