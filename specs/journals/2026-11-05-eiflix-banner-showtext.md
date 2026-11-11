# 2026-11-05 — EiFlix Banner: "Show Text" dropdown

## What
EiFlix Banner dialog → Banner Details gets a single-select dropdown, label **Show Text**, options
Video / Image / Both. Stored on the `eiflixbanner` doc as the string field `showtext`:
`'video' | 'image' | 'both'`.

Files: `New-Workshop/eiflix-banner/eiflix-banner.component.{ts,html}`.
Hooks: `eb-showtext`, `eb-showtext-video`, `eb-showtext-image`, `eb-showtext-both` (prefix `eb`).

## Why it is shaped this way
- **Field name `showtext`** — operator asked for that name. The first cut used `show`. It was renamed
  before anything shipped, so no doc carries `show`.
- **mat-select, not a mat-menu.** It is a form value, so it sits in the reactive form like Mode does
  next to it. That gives single-select, keyboard use and edit reload for free.
- **New banner (and Reset) defaults to Both.** Every banner uploads web image, app image and video.
- **Older banners have no `showtext`.** Edit shows the dropdown empty rather than inventing a value.
  Saving without picking stores `''`, the same as the other optional text fields (`buttonname`, …).
- Options are three literal `<mat-option>`s (no `*ngFor`) so each hook is a literal `data-testid`.

## Coverage
Hub `workshops/workshops-list.spec.ts` WS-75. It checks that a new banner starts on Both, that the
pick Video is stored as `'video'`, and that the form resets to Both. It then edits the banner: Video
reloads, the change to Image is stored as `'image'`, and no second doc is created.
`workshops-list.spec.ts` ran 10 passed / 0 failed; WS-65 and WS-04 stay skipped as before.

## Pending
- The EiFlix web/app consumers need to read `showtext`, and need a rule for older banners that lack it.
