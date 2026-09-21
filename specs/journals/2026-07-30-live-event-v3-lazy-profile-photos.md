# 2026-07-30 — Live Event Dashboard v3: lazy profile photos in the drill-down panel

Branch: `dynamic-studio-update`.
Screen: **Live Event Dashboard v3** — the right-hand drill-down **panel/sidenav**
that lists participants (`LiveEventDashboardV3Component`,
`src/app/Events/live-event-dashboard-v3/live-event-dashboard-v3.component.*`).

## What
The panel list rows showed an **initials-only** avatar. Added a per-row avatar
**button** AND made the **participant name clickable**: either one, on click,
mounts `<app-profile-picture>` for that one row and fetches that participant's
photo. No photos download while the list is just being displayed.

Both the avatar button and the name call `showPhoto(profileId)`. First click adds
the id to `revealedPhotos` (mounts the picture → `autoOpen` enlarges on load); a
later click, when the picture is already mounted, re-opens the overlay directly
on that instance (looked up via `@ViewChildren(ProfilePictureComponent)`).

Applied to all three avatar spots in the panel list:
- the standard single-participant row,
- the changework-group **lead**,
- the changework-group **kids** (counterparts, small `sm` variant).

The click **enlarges directly**: the mounted `app-profile-picture` is given a new
`[autoOpen]="true"` input, so it opens its full-size preview overlay as soon as
the photo finishes loading — no second click on the thumbnail. After the operator
closes the overlay, the loaded thumbnail remains in the row and is still clickable
to re-open.

## Why
Operator request. The panel can list hundreds of participants; eagerly mounting
`app-profile-picture` per row would fire one Firestore `profile_data` query +
image download **per participant** the moment a panel opens — expensive and
mostly wasted. `ProfilePictureComponent` fetches in `ngOnInit`, so the cheapest
way to make the download opt-in is to **not mount** the component until asked.
A `revealedPhotos: Set<string>` gates the mount via `*ngIf`; the initials button
is the `else` template. The component's module-level `photoCache` still de-dupes
if the same participant is revealed again later.

## Files touched
- `ProfilePicture/profile-picture/profile-picture.component.ts` (shared component)
  - Added opt-in `@Input() autoOpen = false`. When true, `ngOnInit` calls
    `openPreview()` after the photo resolves (both the cache-hit and `fetchPhoto`
    paths). Made `openPreview(event?: MouseEvent)` param optional (`event?.stop…`)
    so it can be invoked programmatically. Default false → unchanged everywhere else.
- `live-event-dashboard-v3.component.ts`
  - Import `ProfilePictureComponent`; add it to the component `imports` array.
  - Import `QueryList, ViewChildren` from `@angular/core`.
  - Add field `revealedPhotos = new Set<string>()`, a
    `@ViewChildren(ProfilePictureComponent) photoRefs` query, and the method
    `showPhoto(profileId, event?)` — first click adds the id; a repeat click
    calls `openPreview()` on the mounted instance. Placed just after `markingId`.
- `live-event-dashboard-v3.component.html` (panel list, ~lines 977–1035)
  - Single row: replaced `<span class="p-avatar">{{ initials(p.name) }}</span>`
    with an `*ngIf="revealedPhotos.has(p.profileid); else avaSingle"`
    `<app-profile-picture [autoOpen]="true">` + `#avaSingle` button template.
    All three mounts pass `[autoOpen]="true"` (direct enlarge on click).
  - Each `.p-name` got a `.p-name-photo` inner span/class with
    `(click)="showPhoto(<profileid>, $event)"`; the avatar buttons also call
    `showPhoto` (renamed from `revealPhoto`). Kid name is wrapped in the span so
    the `×N` repeat badge stays non-clickable.
  - Group lead: same pattern wrapped in `<ng-container *ngIf="p['lead']">` with
    `#avaLead`; the `p-dim` "—" span for the no-lead case is unchanged.
  - Group kid: same pattern with `#avaKid`, `sm` sizing (`[size]="24"`).
- `live-event-dashboard-v3.component.css`
  - Added `.p-avatar-btn` (button reset + hover), `.p-avatar-btn::after` (camera
    badge via inline-SVG data URI), `.p-avatar-btn.sm::after` (smaller badge),
    `.p-avatar-pic` (alignment for the mounted picture), and `.p-name-photo`
    (cursor + hover underline/accent for the clickable name). Inserted right after
    the `.p-avatar.sm` rule.

## Bugfix (same day) — previews stacked / reappeared

Reported: open one image, close it, open another, then click a name on the main
screen — when the sidenav reopened, **every image previously opened popped up at
once**. Two independent causes:

1. **`revealedPhotos` persisted across panels.** The set was never reset, so
   reopening a panel re-mounted every previously-revealed row, and `autoOpen`
   fired one preview per row. Fix: clear `revealedPhotos` (and `pendingOpenId`) in
   both `openPanelRows` and `closePanel`.
2. **Auto-open fired on every re-mount, not just the clicked row.** Replaced the
   blanket `[autoOpen]="true"` with a one-shot `[autoOpen]="pendingOpenId === <id>"`
   set by `showPhoto`; the picture emits a new `(opened)` output that nulls
   `pendingOpenId`, so a later re-mount (e.g. filtered out then back in) never
   re-opens by itself. Only an explicit click opens a preview.
3. **Overlays could stack (shared component).** `ProfilePictureComponent` appended
   its enlarge overlay to `document.body` and `closePreview()` only removed *its
   own*. Added a module-level `activePreview` singleton: `openPreview()` tears down
   whatever overlay is currently showing (any instance) before creating a new one;
   `closePreview()` clears the global handle only when this instance owns it, so
   destroying an old row can't yank a preview a newer row just opened.
   (`queueMicrotask` defers the cache-hit auto-open one tick to avoid
   ExpressionChangedAfterItHasBeenChecked.)

## Verification
- Typecheck: `npx tsc --noEmit -p tsconfig.app.json` → exit 0.
- `ng serve` build: "Application bundle generation complete" — v3 chunk built
  clean; no new warnings referencing this component (all warnings pre-existing,
  in other components).
- Not committed (operator gates commits/pushes — see [[feedback_no-autocommit]]).

## Revert guide (per-screen)

### Screen — Live Event Dashboard v3 (drill-down panel avatars)
0. `profile-picture.component.ts` (shared — revert only if fully removing this feature):
   delete the `autoOpen` `@Input` and the `opened` `@Output` (+ `Output, EventEmitter`
   from the import); remove the two auto-open blocks in `ngOnInit` (the
   `queueMicrotask` cache-hit one and the post-`fetchPhoto` one); change
   `openPreview(event?: MouseEvent)` / `event?.stopPropagation()` back to
   `openPreview(event: MouseEvent)` / `event.stopPropagation()`. The
   `activePreview` singleton (module var + the teardown in `openPreview` and the
   owner-check in `closePreview`) is a general robustness fix — **keep it**; it's
   inert for all other callers. (The whole `autoOpen`/`opened` surface is also safe
   to leave — inert unless a caller sets `autoOpen`.)
1. `live-event-dashboard-v3.component.ts`:
   - Remove the `import { ProfilePictureComponent } ...` line and drop
     `ProfilePictureComponent` from the `imports:` array.
   - Remove `QueryList, ViewChildren` from the `@angular/core` import (leave `ViewChild`).
   - Delete the `revealedPhotos` field, `pendingOpenId` field, the
     `@ViewChildren(...) photoRefs` query, and the `showPhoto(...)` method.
   - Remove the `revealedPhotos.clear()` + `pendingOpenId = null` lines from
     `openPanelRows` and `closePanel`.
2. `live-event-dashboard-v3.component.html`: in the panel list, restore each of
   the three avatars to its original single line, and restore the names —
   - single row: `<span class="p-avatar">{{ initials(p.name) }}</span>` and
     `<div class="p-name">{{ p.name }}</div>` (drop the `p-name-photo` class + click).
   - group lead: `<span class="p-avatar" *ngIf="p['lead']">{{ initials(p['lead'].name) }}</span>`
     (the adjacent `p-dim` "—" span stays); remove the `<ng-container>`/`#avaLead`
     wrapper; restore `<div class="p-name" *ngIf="p['lead']">{{ p['lead'].name }}</div>`.
   - group kid: `<span class="p-avatar sm">{{ initials(c.name) }}</span>`; restore
     `<div class="p-name">{{ c.name }}<span class="p-rep" …>…</span></div>` (unwrap
     the `p-name-photo` span).
   Delete the three `<app-profile-picture>` elements (incl. their
   `[autoOpen]="pendingOpenId === …"` + `(opened)="pendingOpenId = null"` bindings)
   and their `#avaSingle` / `#avaLead` / `#avaKid` `<ng-template>` buttons.
3. `live-event-dashboard-v3.component.css`: delete the `.p-avatar-btn`,
   `.p-avatar-btn:hover`, `.p-avatar-btn::after`, `.p-avatar-btn.sm::after`,
   `.p-avatar-pic`, `.p-name-photo`, and `.p-name-photo:hover` rules (the block
   added right after `.p-avatar.sm`).
