# EiFlix popup banner editor

**Date:** 2026-09-04 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, builds green, runtime unverified behind login

Operator: a **Popup Banner** button on `/workshops`, placed **before** New Users, opening a
dialog with rich-text fields (header, title, description, button 1 text, button 2 text,
footer), a plain-text button 1 link, **no** button 2 link, three image uploads whose URLs
land in `tablet` / `mobile` / `desktop`, a boolean `enable`, all saved into the single
document `classify/eiflixpopupbanner`. **Nothing is mandatory.**

---

## 1. Shape of the document

One document, created on first save. Keys follow the project's lowercase-no-spaces
convention (as `workshopconfiguration` does):

| Key | Type | Notes |
|---|---|---|
| `header`, `title`, `description`, `button1text`, `button2text`, `footer` | string (HTML) | rich text |
| `button1link` | string | plain, trimmed on save. **No `button2link` by design.** |
| `desktop`, `tablet`, `mobile` | string | Storage download URLs |
| `enable` | boolean | strict `=== true` on read |

Written with `setDoc(..., { merge: true })`: the first save creates the document, and a
later save never drops a key some other screen may add. No validators anywhere — every
field may be blank, and a blank save is a legitimate operation.

**Artwork sizes are the operator's, verbatim.** Note they are not a consistent family:
desktop is portrait (1356 × 1467, ratio 0.92) while tablet and wide mobile are landscape
(2.48 and 2.20). That is unusual enough to be worth confirming, but it was not changed.

## 2. Reuse rather than reinvention

- Rich text is the same ngx-editor setup as the workshop configuration editor, and the CSS
  `@import`s `wc2-shared.css` so the fields are pixel-identical and inherit its guards
  against the global Bootstrap / Material stylesheets.
- The Storage upload mirrors `workshop-settingsv2`'s `uploadFile`; `clearImage` clears the
  URL only and leaves the Storage object, exactly as that screen does.
- The single-document `classify/<id>` pattern already exists in
  `journey-onboarding-detail.component.ts`.
- The dialog panel class zeroes the Material surface padding the way
  `.jchd-logcomposer-panel` and friends do in `src/styles.css` — without it the component's
  edge-to-edge header and save bar sit inside 24px of Material padding.

## 3. Review — 5 dimensions, skeptic-verified: 5 confirmed of 14 raised

All five were fixed. Four of them are the same class of bug: **state that changes while an
async operation is in flight.**

1. **MAJOR — `markAsPristine()` after the await.** An edit or an upload landing during the
   Firestore round trip was marked saved without being written; the bar said "Saved just
   now" and the close guard let the operator walk away. Now the payload is snapshotted and
   the dirty flag is cleared **only if the form still matches it**.
2. **MAJOR — no upload re-entry guard.** Two uploads into one slot raced, and the first to
   finish cleared the single `uploading` flag, defeating the Save button's own guard and
   leaving an arbitrary winner. Guarded at `upload()`, the one choke point every entry path
   (click, Enter, Space, drop) funnels through, plus `pointer-events: none` on a busy slot.
3. **MAJOR — `min-height: 100vh` inherited from `wc2-shared.css`.** Correct for the
   full-page configuration screens, wrong for a dialog host inside a 92vh surface that the
   panel class pins to `overflow: hidden`: the dialog was forced full height with the save
   bar stranded mid-page and no way to scroll. The local `:host` now sets `min-height: 0`.
   **A reuse hazard worth remembering: importing a page-level stylesheet drags its
   page-level assumptions with it.**
4. **MAJOR — trapped during a save.** `disableClose` routes the X, Close, Escape and the
   backdrop through `close()`, which returned silently while saving. A save that never
   settles (Firestore resolves only on server ack) left no exit at all. Closing during a
   save now asks and then allows it.
5. **MAJOR — double-click opened two dialogs.** The dynamic import leaves a window where a
   second click opens a second editor on the same document, and the stale one can revert
   the other's save. Guarded, and the guard is released on `afterClosed`.

**Added before the review, from the same reasoning:** an unsaved-changes confirm on close.
Six rich-text fields are too much work to lose to a stray Escape; the workshop configuration
editor has the same guard. The review independently raised it and then refuted its own
finding because the guard was already there.

Refuted and deliberately not acted on: the hint strings were called non-verbatim (they are
verbatim — the operator wrote `×` and `—`), and a claim that wrong-typed stored values get
rewritten (no second writer exists for this document).

## 4. Verification

- Dev build green after each step; production build green.
- Rendered in a harness carrying the real Bootstrap and Material stylesheets. Two apparent
  failures there — the Playfair title showing as Roboto, and the large description editor
  not being taller — were **harness artifacts**: the harness lacks Angular's `[_ngcontent]`
  attributes, so component specificity is understated. Confirmed against the compiled
  bundle, where `.pb-title[_ngcontent-%COMP%]` carries Playfair 24px and
  `.rt[_ngcontent] .rt-lg .NgxEditor__Content` carries `min-height: 140px`.
- **Not verified at runtime**: `/workshops` is behind login, so no upload has actually run
  and no document has been written. The operator pass should save once with everything
  blank, upload all three images, reopen to confirm they round-trip, and toggle `enable`.
