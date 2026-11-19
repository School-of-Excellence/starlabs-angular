# 2026-11-11 — Delivery Activities form editor: copy / play the media URL

## What
Delivery Activities → edit a Form/Report delivery → a **video** or **audio** field. Once a URL is
pasted into "Media URL", two buttons appear under the field:
- **Copy link** — copies the URL (CDK `Clipboard`) and shows a "Link copied" snackbar.
- **Play / Hide player** — opens an inline player under the field:
  - video, YouTube (`watch?v=`, `youtu.be`, `shorts/`, `embed/`, `m.`) or Vimeo → `<iframe>` with the embed URL;
  - video, any other URL (e.g. Firebase Storage mp4) → `<video controls>`;
  - audio → `<audio controls>`.

Works for top-level fields and for sub-fields inside an Array field.

Files: `Product Designer/delivery-set/update-delivery/update-delivery.component.{ts,html,css}`.
Hooks (prefix `ud`): `ud-copy-media-url-25`, `ud-toggle-media-26`, `ud-media-embed-27`,
`ud-media-video-28`, `ud-media-audio-29`.

## Why it is shaped this way
- **One `<ng-template #mediaTools>`** rendered via `ngTemplateOutlet` for both the top-level and
  sub-field chip lists, so the two places can't drift.
- **Open state per field FormGroup (`WeakSet<AbstractControl>`)** — no index bookkeeping, survives
  drag-reorder and duplicate, and removed fields are collected.
- **Sanitized iframe URLs are cached by URL.** A new `SafeResourceUrl` each change-detection pass
  makes the iframe reload in a loop.
- **Watch links are converted to embed links for preview only.** The stored value is untouched;
  the existing hint still asks for the embed form, because the participant-side `formtemplate`
  plays video through `<video>`/mp4 and is not changed here.
- Player is capped at 560px wide, 16:9, so it fits the dialog card.

### Follow-up: long URL chip overflowed the field
MDC chips never wrap, so a pasted URL ran past the field edge. All three chip lists in this dialog
(options, flipping-question options, sub-field options) now carry `class="fb-chip"` + `[title]`:
the chip is capped at 100% width and its label ends in an ellipsis; hover shows the full value.
`::ng-deep` is scoped under `.fb-chip`, so it only reaches into these chips' internals
(`mdc-evolution-chip__cell/action--primary`, `__text-label`, verified present in Material 19.2.19).
Revert: drop the `class`/`[title]` lines on the three `<mat-chip-row>`s and the
`/* --- long chip values */` CSS section.

## Verification
- `ngc -p tsconfig.app.json --noEmit`: no errors in update-delivery.
- `toEmbedUrl` exercised on 9 URLs (YouTube variants, Vimeo, Storage mp4, garbage) — all mapped as expected.
- Not clicked through in the live app: localhost:4200 is behind Firebase login.

## Revert guide
Remove from `update-delivery.component.ts`: the `Clipboard` / `DomSanitizer` imports, the two
constructor params, and the block from `// ── media URL tools` down to just above `remove(`.
In the `.html`: the two `ngTemplateOutlet` blocks after the video/audio chip fields and the
`<ng-template #mediaTools>` at the end. In the `.css`: the `/* --- media URL tools */` section.

## Coverage
Hub `journey/update-delivery-media.spec.ts` UDM-01..04 (branch `test/delivery-form-media-copy-play`):
YouTube watch link → Copy (clipboard) + Play (iframe with the app-derived embed URL); mp4 → `<video>`
and the long chip ellipsizes inside the field; negative controls (video without URL, radio options) get
no tools; audio sub-field in an Array → `<audio>`. Green on the local emulator lane (5/5 with the ds1
routed case). `hook-diff` journey: aligned, 0 missing / 0 unreferenced.
