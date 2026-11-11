# 2026-11-11 · Segment Board: import a list → move to a manual segment, with a review list (plan, approved 2026-11-11)

Screen: `/segmentboard`. Reuses the file reader and matching of **Import & compare**, and `placeInManual` (the existing manual move).

## Operator decisions (2026-11-11)
| # | Decision |
|---|---|
| 1 | Entry point: **board level** (header button). Anyone in participant metadata can be matched. |
| 2 | People who are not in an automated segment are **shown unticked**, with their current segment. A tick moves them too. |
| 3 | Each move is **recorded** in `segmenthistory`. |

## Flow
| Step | What the user sees |
|---|---|
| 1. Import | Header → **Import & move**. Upload a CSV or XLSX file, or paste a list. Match by email (default) or by name. |
| 2. Target | Pick one active manual segment. |
| 3. Review | One row per imported value, showing name, email, journey, current segment(s), status and a tick box. Tiles: Will move · Not ticked · Already there · Not matched. Search and Export CSV. |
| 4. Confirm | "Move N participants to <segment>" runs `placeInManual` (one batch), then the automated lists resync. The review stays open with each row marked "Moved". |

## Row status
| Status | Default |
|---|---|
| In an automated segment (not placed by hand) | ticked |
| In another manual segment | unticked; a tick takes them out of that segment |
| Not in any segment | unticked |
| Doesn't meet the target's eligibility | as above, plus a "Not eligible" flag |
| Already in the target | shown, not movable |
| Not found · duplicate in the file · name shared by several people | shown under Not matched, not movable |

## Record (`segmentboardconfig/{id}/segmenthistory`, same batch as the list writes)
- Target segment: `action: 'members-added'`, `changes.members {from: null, to: [pids]}`, `source: {file | 'paste', matchedBy}`, `summary` "Imported 12 from list.xlsx", `updatedby`, `updatedat`.
- Each manual segment that people were taken out of: `members-removed`, with the pids.
- The History views show both entries; the from → to detail lists names.

## Code
| File | Change |
|---|---|
| engine | `openImportMove` / `renderImv` / `imvRows` / `runImportMove`, reusing `cmpKey`, `readTable` and `placeInManual(…, history)`; header button; `H_ACTION` for the two new actions |
| component | `saveLists(lists, history?)` writes the history entries in the same `writeBatch` |
| html / css | `#imvDlg` dialog, review table, status chips |
| hub | SGB-08: a seeded file of 5 values (automated member · manual member · unsegmented · not found · duplicate) checks the review counts and the default ticks, moves them, then checks `segmentboardlist` and the history entries as oracles. New hooks are registered. |

## Done when
- Build passes and hook-diff is aligned.
- Harness: review counts hand-checked; move → lists and history correct; a re-import shows them as "Already there".
- Journal entry with a revert guide. No commit until approved.
