# Plan — New Users redesign: development (2026-11-16)

Operator approved the design (`specs/journals/2026-11-16-new-users-redesign/`) and said "go ahead start the
development" (2026-11-16). This plan covers the port, the screen-local load-time fixes, and test coverage.
The read-only mapping that fed it is in the session scratchpad (`devplan/inventory|contract|mainSpec|dialogSpec.json`).

## Scope
1. **Port the design** into `New-Workshop/newusersprofile/` (component, `assign-tags-dialog`). Every current
   feature stays; the design's additions ship (see the design journal's "What the design adds").
2. **Screen-local load-time fixes** (design journal findings 1, 3 (frame 1.2 only), 5, 6, 7, 8, 9, 10):
   - referrer names: read only the ids present, only when Referred by is shown, a search is typed or an export
     includes it, then re-run the filter (no more whole `participant metadata` read);
   - paint the page shell and skeleton rows as soon as access is confirmed (no lone spinner);
   - `workshopconfiguration` read on first need (Workshops panel / search suggestions), `evergreenWorkshop == true`
     while Funnel only is on;
   - `takeUntil(destroy$)` on both live listeners;
   - parse filter criteria once, precomputed per-row view model (search text, labels, tag names), 200ms debounce;
   - `trackBy`, panels rendered only while open;
   - `xlsx` and the email dialog loaded with `await import()`.
3. **Not in this step:** the shared guard / role-check speed-up (finding 2) and Firestore persistence (finding 4)
   touch every screen; they are the next step, with a full all-suites regression. The 1.3 "rows first, count later"
   preview is deferred: until the full list arrives, filters, search, select-all-matching and no-match counts
   would act on partial data. Revisit after measuring.

## Decisions (and why)
- **ViewEncapsulation.None** with every class `nx-` prefixed and tokens on `.nx-root` (screen root and each overlay
  root). The mockup's cascade was verified pixel-identical against the global sheets with exactly these selectors;
  Emulated would change specificity. No `nx-` class exists elsewhere in `src`.
- **Popovers are `cdkConnectedOverlay` with no backdrop**, closing on Escape and outside click (the trigger is
  excluded). Tests click other controls while panels are open; a backdrop would swallow those clicks.
- **Kept Material where tests depend on its DOM:** `mat-table` (`table.users-table`, `tr.mat-mdc-row`),
  `mat-sort-header` (aria-sort, click on the th), `mat-checkbox` in rows (skinned), `mat-slide-toggle` inside
  the Funnel-only wrapper. Replaced: mat-paginator (design pager), mat-menu (overlays), mat-date-range input,
  spinners.
- **Created** follows the design: a pill opening a panel with typable From/To, quick ranges and a month calendar.
  Typed dates read D/M/Y (India), "12 nov", "12 Nov 2026"; shown back as "12 Nov 2026". WS-56 (which types into
  always-visible M/D/Y inputs) moves to the new gated hub file and opens the pill first; the old copy is removed
  from `new-users-profile.spec.ts`. The development branch loses WS-56 until this lands; it is covered again after.
- **Copy kept for tests:** no-match heading "No users match these filters."; rename errors keep "Enter a name" /
  "already has this name"; the count hook stays "N of M users" (the hub regex widens to allow "1,284").
- **No-match primary button** (`new-no-match-clear-filters`) clears search and filters together (label adapts);
  each condition chip removes just that one. **Clear all filters** in the readout clears filters only (design).
- **Default Tags mode stays Match all + Include** (WS-22); the control shows both.
- **Conversion**: Everyone / Converted / Not converted; picking the active option keeps it (design).
- **Narrow layout**: CSS container queries restyle the same mat-table rows as cards; controls that exist only in
  one layout (card bar, Filters button/sheet) switch by a ResizeObserver flag on the same element, so no hook is
  duplicated in the DOM. SSR-safe (browser only).
- **Dialog surface** styled from the dialog's own None-encapsulated sheet under panelClass `atd-dialog-panel`;
  no edit to `src/styles.css`.
- **Fonts**: Playfair Display is loaded at 600 only; headings use 600 rather than touching `index.html`.

## Test contract (must stay green)
Hub `workshops/new-users-profile.spec.ts` (WS-21/22/23/57/63), `new-users-screen.spec.ts` (NUS-01..11),
`workshop-dashboard-access.spec.ts` WDA-06 (no `<table>` for a denied user). Every existing `new-*` / `atd-*` hook
stays declared, literal, on the equivalent element. The full checklist is `devplan/contract.json → mustKeep`.

## Coverage to add (hub, after the app hooks)
New gated file `workshops/new-users-redesign.spec.ts` (keys on new hooks, so the hub-ahead guard skips it on
branches without the port): WS-56 (moved), readout chips and Clear all, Tags rule sentence and counts,
Created quick ranges and typed dates, Conversion Everyone, select-all-matching and Only this page, cross-page
banner, not-shown chip, Export/Send counts, file-result banner, no-match condition chips, load-error state,
narrow cards and Filters sheet; dialog: people counts, bulk partial states and footer summary, segment links.
Every new hook that no case drives is registered reference-only.

## Order
1. App: data layer + dialog (parallel, disjoint files) → desktop template + CSS → panels, dock, narrow layout.
2. Build, unit tests (existing + new), readiness check.
3. Hub: new spec file, WS-56 move, NUS-04/08 regex; targeted e2e, then the full workshops suite.
4. Review (contract and design fidelity against the mockups at 1440/1280/820/390); fix; re-run.
5. Journal + PROGRESS. Operator commits the app; hub commits stay local until "push".
