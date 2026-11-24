# Workshop dashboard: "Manage tag" in the side-panel person menu (2026-11-19)

The operator asked for this on 2026-11-19 and settled the open questions:
- **Access:** only the `clearworkshop` list. The per-workshop Clear tick does **not** grant it.
- **Tags:** segment tags only.
- **Behaviour:** add and remove.
- The operator says a person has one enrolment per workshop.

## What

Clicking a name in any side panel opens the person menu, which today has the name and **View participant data**. This adds a new item after it: **Manage tag**.

- **Who sees it:** Manage tag shows **only** when the signed-in profile id is in `static meta data/Workshop Admin.clearworkshop`.
  - The rule is the list alone, with no per-workshop grant and not through `can('clear')`.
  - It is added as its own method on the `WorkshopAccess` model. It is **not** a new `WORKSHOP_ACCESS_KEYS` entry, because that would add a tick to the Dashboard Access settings.
- **What it opens:** a nested `mat-menu` listing the **segment tags** (`newusertags` where `type == 'newusersegments'`, the same list as New Users).
  - Sorted A→Z, case-insensitive; tags with blank names are left out; scrollable.
  - Read once per visit, starting when the person menu first opens, so the list is ready when the submenu opens.
  - The names also fill the dashboard's tag-name cache.
- **What each tag shows:** a ✓ (`menuitemcheckbox`, `aria-checked`) when the person's enrolment already has it.
- **Choosing a tag:**
  - If the person **doesn't have it**, it is added: `arrayUnion(tagId)`.
  - If they **have it**, it is removed: `arrayRemove(tagId)`.
- **Where it writes:** the person's `workshop participant enrolled` doc for **this workshop**, and only its `tags` field.
  - If a second enrolment doc ever exists, it gets the same change, in one `writeBatch`, so the person's tags never disagree.
  - No other field is written and no other person is touched.
- **While it saves:** that item is disabled and shows a spinner, and double-clicks are ignored.
  - On success, the live enrolled snapshot updates the ✓, the tag chips and Top tags.
  - On failure there is a snackbar ("Could not update the tag") and nothing changes.
  - The submenu stays open after a choice so several tags can be set, if Material allows this cleanly. Otherwise it closes on a click; the build reports which.
- **The open panel catches up:** if it shows tag chips for this person, they update to match after a change. The panels are click-time snapshots, so that row is patched.
- **Person not enrolled in this workshop** (for example the New Users Not Enrolled panel, or Zoom attendees): Manage tag is shown **disabled** with a short reason, and nothing is written.
- **Plain wording:** no field names in the UI, and the existing light `wdx-` menu styles are reused.

## Hooks (literal; same prefix as the person menu)

- `wd-side-person-tags`: the Manage tag item, which opens the submenu.
- `wd-side-person-tag`: one per tag item.
- `wd-side-person-tags-note`: the loading, empty or failed text inside the submenu.

## Files

- **App:** `workshop-dashboard.component.{ts,html,css}`. Pure helpers (sorting, the checked set, the write plan) go in `workshop-dashboard.engine.ts` + its unit spec. The access method goes in `workshop-access/workshop-access.model.ts`, with a unit test if that file has a spec.
- **Hub:** a new gated file, `workshops/workshop-dashboard-person-tags.spec.ts` (new hooks), plus seeds in `support/wshop.ts`.

## Out of scope

- Creating new tags.
- Searching inside the tag list.
- Recording who changed a tag.
