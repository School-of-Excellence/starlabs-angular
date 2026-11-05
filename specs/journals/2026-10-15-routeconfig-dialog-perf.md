# 2026-10-15 — Route Configuration edit dialog: lag on open, freeze on Update/Save

**Screen:** `/routeconfiguration` → `route-configuration-duplicate/` (`RouteConfigurationComponent`)
→ `createroutedialog/` (`CreateroutedialogComponent`).

## Symptom
Opening Edit lagged; clicking Update/Save froze the screen and took a long time to finish.

## Root cause (WHY)
The dialog eagerly rendered **every** option of every select, including selects that were never opened:

| Select | Options per select | Copies |
|---|---|---|
| Profiles (main + each sub-component) | one `mat-option` per profile in `profile_data` | 1 + children |
| Icon (main + each sub-component) | ~1000 `mat-option` + `mat-icon` (`icon-list.ts`) | 1 + children |

`mat-select` projects its options from the host template, so they are created even while the panel is
closed. Each profile option held an `<app-profile-picture>` with no `src`, so **each one ran its own
Firestore `getDocs(profile_data where profileid==…)`** and then called `detectChanges()`. That meant
thousands of concurrent reads per profile select on open, and the `updateDoc` on Save waited in the
same Firestore client queue behind them. Every change-detection pass also re-evaluated
`getProfileIds()` (a new `Object.keys` array), `filterProfilesIds` and a fresh `[style]` object per option.

## Fix
| File | Change |
|---|---|
| `createroutedialog/option-pipes.ts` (new) | Pure pipes. `profileOptions` returns only the selected profiles while the panel is closed. While open it returns selected profiles plus search matches, and keeps selected-but-not-matching ones rendered and hidden, so multi-select never drops them. `iconOptions` returns the full list only once that panel has opened. |
| `createroutedialog.component.ts` | Builds `profileIndex` once from the cached profile map: name, email, a lowercase search string, and a photo resolved with the same rule as ProfilePicture. Adds per-select "opened" flags, a `saving` guard against double-submit, and `trackProfile`. Removes `getProfileIds` and `filterProfilesIds`. |
| `createroutedialog.component.html` | Option loops go through the pipes. Avatars get `[src]="o.p.photo"`, which means **no Firestore reads**. Uses `[style.display]` instead of an object literal. Save shows "Saving…" and is disabled while in flight. |
| `route-configuration.component.{ts,html}` | `trackBy` on the mat-table (docid / parentId#childIndex), so the snapshot after each save patches rows instead of re-creating every `cdkDrag` row. |

A panel's full list stays rendered after its first open (the flag is sticky). This avoids options
vanishing during the close animation, because `openedChange(false)` fires before the CSS exit
animation finishes.

## Verification
- `ng build --configuration development` is green.
- The pipe logic was unit-checked in Node (closed/open, hidden-selected, case-insensitive search, icons).
- **Measured in the real app on a local emulator** (`starlabs-cicd`, auth and firestore only; production
  untouched). Seed: one developer user, 2,000 `profile_data` docs, 42 dashboard routes, and a parent
  route with 6 children that each have 5 profiles selected. The original code ran from a git worktree
  at HEAD on :4321 and the fixed code on :4320, with the same in-page script (long-task observer plus
  timings) after a page reload:

  | Edit "Perf Parent" | Original | Fixed |
  |---|---|---|
  | click → dialog ready | 6.0–6.2 s | 0.31 s |
  | main thread blocked while open | 5.0–10.8 s | 0 ms |
  | typing 3 chars into Label | up to 7.8 s | 31 ms |
  | after Update: main thread blocked | 3.3–14.9 s (one 7.7 s task) | 0 ms |

  The freeze after Update came mostly from destroying the thousands of option and avatar components
  when the dialog closed, not from `updateDoc`, which resolved in about 0.5 s in both versions.
- Emulator gotchas: login needs `number` on the profile (OTP is stubbed to true), and
  firebase-tools 15 needs Java 21. `npx firebase-tools@13.35.1` runs on Java 17, but it deletes the
  cached v1.20.2 Firestore emulator jar.

## Revert guide
Revert only this screen: `git checkout <pre-change-sha> -- src/app/route-configuration-duplicate/`
(this also deletes `option-pipes.ts`). No data or schema change: the saved `dashboard` doc shape is
unchanged, and the `iconOpened`/`profilesOpened` flags are never written because `save()` maps
children field by field.

## Pending
- No e2e change: no new `data-testid` hooks were added; the existing `rxd-*` and `rcx-*` hooks are unchanged.
- Trade-off: on a closed icon select, arrow keys no longer cycle through icons, because only the
  selected icon is rendered.
