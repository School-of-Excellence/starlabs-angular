# 2026-10-09 — mahalakshmi-development → charan-release: formtemplate description formatting (6399b868)

| Screen | How | Change |
|---|---|---|
| Product Designer / delivery-set / formtemplate (`/formtemplate`) | path-scoped checkout of the .css (charan-release had no changes there since the merge-base) | `.form-description`: full width, left-aligned, `white-space: pre-line` — multi-line descriptions keep their line breaks |

e2e: hub `journey/journey-deep.spec.ts` JP-33 (+ DF1 seeded with a two-line description). CSS only — no hooks.

Revert: `git checkout 2a5f282e -- "src/app/Product Designer/delivery-set/formtemplate/formtemplate.component.css"`
