# 2026-10-15 — profilelist: filter by role

Operator: *"in the profilelist screen, i need a filter to filter by role"*

`src/app/Participants Profile Management/profilelist/profilelist.component.*` (route `profilelist` loads
this component directly — no `-clone` variant).

## What changed

| File | Edit |
|---|---|
| `.ts` | `MatSelectModule` import; `roleFilter: string[]`; `savedRoles` map; predicate gains a `roles` clause; `applyFilters()` now builds its JSON via `filterValue()`; `roleOptions` / `roleCount()` / `clearRoleFilter()` |
| `.html` | Multi-select "Filter by role" at the start of `.filter-toggles`, a search box at the top of the dropdown, a count per option, a clear (×) suffix |
| `.css` | `.rolefilter` width transition, `.toggle-count.role` badge, `.role-more` |

## Why it is built this way

- **Roles come from `users_roles`, not the row.** `profile_data` rows have no role flags; the screen
  already loads every `users_roles` doc into `profilerole[profileid]` for the expanded "Update Role"
  panel. The filter reuses that load — no new reads.
- **Filters on a separate `savedRoles` snapshot, not `profilerole`.** The expanded panel's checkboxes
  `ngModel` straight into `profilerole[pid][role]` before "Update Role" is pressed. Filtering on it would
  make a row vanish/appear while someone is ticking boxes. `savedRoles` is a shallow copy taken on each
  `users_roles` emission, so it only changes once the role is actually saved.
- **ANY-of the picked roles (OR)**, then AND with name / hold / AHCRM. Picking ADMIN + COACH means "admins
  or coaches" — the natural reading of a multi-select. Say so if all-of is wanted.
- **Options = the string entries of `roleList`** (`starlabs roles/roles.name`, already hiding
  rolemanager/developer for non-developers). The trailing `{ productowner: [...] }` entry is skipped —
  product owner is an array, not a boolean role.
- **Late roles re-run the predicate without resetting the page.** `users_roles` arrives after the
  profiles; if a role is picked, `tableData.filter` is re-set to the same JSON so rows update, but the
  paginator is not sent to page one on every `users_roles` change.

## Search inside the dropdown
Operator, mid-change: *"i need search for the dropdown"*

`<ngx-mat-select-search>` in a leading `<mat-option>`, bound to `roleSearch` — the same pattern as
`in-app-message-input` (the library is already a dependency; `NgxMatSelectSearchModule` added to imports).
`roleOptions` filters on it, case-insensitive substring. The library keeps already-picked roles selected
when the search hides them, so searching "coach" after picking ADMIN does not drop ADMIN.

## Dynamic dropdown width
Operator: *"dynamically adjust the dropdown width"*

Replaced the fixed `.rolefilter { width: 220px }` with two computed widths:
- **Field** — `[style.width.px]="roleFieldWidth"`: width of what the trigger shows (the label, or
  "ROLE +N more") + arrow/padding, + 40px when the × shows. Clamped 200–420px, 150ms width transition.
- **Panel** — `[panelWidth]="rolePanelWidth"` (Material 19 accepts px): longest role name + checkbox,
  padding and count badge, never narrower than the field. Clamped at 480px.

Text is measured with a cached canvas `measureText` (16px Roboto, the mat-select font). There is no canvas
during SSR, so it falls back to ~10px per character there; the browser re-measures once it takes over.

## Verified

- `ng build --configuration development` EXIT=0 after each step (filter, search box, dynamic width) (only pre-existing CSS-nesting warnings from other files).
- **Not exercised live**: `localhost:4200/profilelist` is behind the login and this session had no test
  credentials. Needs a quick click-through: pick a role → rows narrow, counts match, search narrows options without dropping picks, field widens as roles are picked, long role names fit in the panel, × clears.
- e2e: hooks `pl-role-filter` / `pl-role-search` / `pl-role-option` / `pl-role-count` / `pl-role-clear`.
  Hub `profiles/profilelist.spec.ts` → PL-RF-01: `pltester` held by p2 only, and p3 is the negative control.
  The oracle is `users_roles where pltester == true`. The gate routes this folder to `modes` (first match), so
  PL-RF-01 runs when `profiles` is dispatched or on a full run.

## Revert

Revert just this screen: `git checkout <commit-before> -- "src/app/Participants Profile Management/profilelist"`
or remove the three rows in the table above (the `roles` clause in the predicate is the only logic change;
`applyFilters()` behaves exactly as before when `roleFilter` is empty).
