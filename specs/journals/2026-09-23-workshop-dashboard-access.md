# 2026-09-23 — Workshop Dashboard Access

> WHY each constraint landed. The WHAT is in the code; read this before proposing an
> alternative shape for workshop permissions.

## The ask

The operator wanted per-person control over the workshop screens: pick a profileid, decide
what that person can do on a workshop dashboard, and separately decide who may edit
workshops at all and who may open the new users screen. Access is authored inside the
workshop editor (Settings tab, after the Communication sections) and enforced on the
dashboard, the workshops list, both workshop editors and the new users screen.

## Two documents, and why two

**`workshopsettings/{workshopconfiguration doc id}`** — per-workshop. Same document id as
the workshop, so one workshop has exactly one access document and no join is needed to find
it. Shape:

```
workshopid:      "<the same id>"          // so the collection reads on its own
dashboardaccess: { "<profileid>": ["qanda", "export", …] }
updatedat, updatedby
```

Keyed by profileid rather than by action because that is the shape the screen reads: the
dashboard asks one question — *what may I do here* — and gets its answer in a single map
lookup after a single document read. The editor's own shape (pick a person, tick actions)
matches it exactly, so nothing is transposed on the way in or out.

**`static meta data/Workshop Admin`** — global, three arrays:
`workshopdashboardadmin`, `workshopeditaccess`, `workshopnewusersaccess`. These are *not*
about the workshop you are editing; they apply everywhere. That is the single most
surprising thing about the screen, so the section says it in a banner above the pickers
(`ws-access-global-note`) rather than in a journal nobody reads at the time.

The eleven actions and their groupings come from the operator verbatim: the header
Communication button and the three side-panel send buttons are **one** permission because
they are the same act; the Participant Progress Details row click, Move next and Review are
**one** permission because the row *is* the participant; export is one permission spanning
three buttons; All Assignments / All Forms / All VideoAsk are **three** because they are
three different bodies of submitted work. The All Forms export needs `export` **and**
`allforms` — the operator asked for that intersection explicitly.

## Deny by default — the decision that changed twice

The first cut used the usual convention: an empty list means unrestricted, so nothing is
gated until the first name is added. The operator rejected it in one line — *"if no
profileid is selected then block everyone"*. So an empty list now blocks everyone, and a
person with zero grants on a workshop does not get a stripped-down dashboard: the dashboard
never loads. The blocked screens do not read their data either, which is the point.

That created a bootstrap hole, and the second cut filled it the obvious way — four
founding profileids (the ones that already held Clear rights) always passed every gate.
The operator rejected that too: *"i dont want to include these profilebypass.. here i want
from the dashboard access only"*. So there is now **no hard-coded id anywhere in the
permission path**. Two consequences, both deliberate:

1. The first names have to be written into `static meta data/Workshop Admin` by hand, once,
   before anyone can open the editor. There is no in-app way to bootstrap and there is not
   meant to be.
2. Anyone who removes themselves from `workshopeditaccess` and saves is locked out of the
   editor until someone else — or the console — puts them back.

Anyone tempted to re-add a bypass "for safety" should read those two rejections first.

## Things that are the way they are on purpose

- **The section saves itself.** It writes two documents that are not
  `workshopconfiguration`, and it must stay usable on a workshop that has never been saved
  (the Settings save bar blocks until the Enrollment page creates the document). Pulling it
  into `buildPayload` would have coupled access to a save that cannot happen yet.
- **Blocked means hidden, not disabled.** A section the person cannot use is removed, not
  greyed. The exception is the three switches on the workshops list, which are disabled
  rather than hidden because they *show state* — hiding them would hide whether a workshop
  is active.
- **Both guards, every time.** Every gated action is hidden in the template *and* returns
  early in its handler. The template is the UX; the handler is the rule.
- **Two hard-coded allow-lists were deleted**, not kept alongside the new gate. The header
  Clear/Enroll `*ngIf`, and a private list inside `moveParticipantToNext()` that popped
  `alert('No Access')` for everyone else. Leaving either would have meant a granted person
  still could not use the action they were granted.
- **`/workshopconfigold/:id` is gated too.** It is a second URL onto the same workshop
  document; leaving it open would have been a way around the editing gate.
- **People come from `participant metadata` only**, never `new_user_data` — the operator
  was explicit. That collection has no cached reader (unlike `profile_data`, which
  `getProfileMap` caches), so the first version re-read the whole collection every time the
  section opened. It is now cached as a compact `{id, name, email}` list in the same
  IndexedDB store (10-minute life) and warmed in the background when the Settings tab
  mounts.
- **Dropdown rows wrap.** `wc2-shared.css` used to ellipsise a picker row's name; a cut-off
  name is useless when the whole point of the row is to pick the right person.

## What this breaks, and how the suite copes

Every workshop e2e spec would have been blocked by deny-by-default, because the seeded
admin is on no list. `workshops/seed-workshops.js` §6c now seeds both access documents, and
the suite gained a `limited` actor with the same roles and the same route grants as `admin`
but on no shared list and with exactly two actions on `W_DASH` — so any difference the
access spec observes is the gate and not a role, a route guard or a missing seed.
`workshops/workshop-dashboard-access.spec.ts` (WDA-00…WDA-15) covers both halves of every
permission and reads the app's own writes back out of Firestore.

## Pending

- The `static meta data/Workshop Admin` document does not exist in production yet. Until it
  is created with at least one profileid in `workshopeditaccess`, nobody can open either
  workshop editor.
- The suite has not been run against the branch since these changes.
