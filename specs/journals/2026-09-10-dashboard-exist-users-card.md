# Workshop dashboard: Exist Users Enrolled, and the `movedtoexist` rule

**Date:** 2026-09-10 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, builds green, runtime unverified behind login

Operator: add an **Exist Users Enrolled** card before New Users Enrolled showing everyone
enrolled who is not a new user; treat a `new_user_data` doc with `movedtoexist: true` as an
existing user and read that person from `participant metadata` instead; put the journey
filter (the one the category-based workshops have on Total Enrolled) on the new card; and
add a customer-status filter beside it.

---

## 1. Which collection this screen uses — the operator asked

**`participant metadata`**, not `profile_data`. `getParticipantMetaMapForIds()` queries it
in batches of 30 with `where('profileid','in', …)` for the enrolled ids. `profile_data` is
not read anywhere in this component. `new_user_data` is loaded once, whole, and is only for
the New Users counts. `customerstatus` and `activejourney` both live on the metadata doc.

## 2. The bug behind the request

`mapProfile` was built as:

```ts
this.mapProfile = { ...participantData.docdata, ...this.mapProfileNew };
```

The new-user map was spread **last**, so for anyone present in both collections the
`new_user_data` document won. A person migrated to a full profile therefore kept resolving
through their stale new-user doc — which has no `activejourney` and no `customerstatus` —
so they were invisible to journey filters and counted as a new user forever.

The rule is now in one place and everything routes through it:

```ts
isNewUserProfile(id) => !!mapProfileNew[id] && mapProfileNew[id].movedtoexist !== true
```

and the overlay only carries the still-new entries, so a moved person keeps their metadata.

## 3. What changed

- **New card, `existUsersEnrolled`**, inserted before New Users Enrolled in **all three**
  layout blocks (the template repeats the metric grid for the category-based, evergreen and
  plain variants — a single insertion would have covered only one of them).
- **Counts corrected.** New Users Enrolled and New Users Not Enrolled now exclude moved
  users, so Exist + New now equals Total Enrolled exactly.
- **Two filters on the new panel**: journey and customer status. Options are derived from
  the people actually in the list rather than from the workshop config, so they are never
  empty — the existing Total Enrolled journey filter reads `selectedjourneys` off the
  workshop, which would be blank on most workshops.
- **Deliberate choice:** these two filters are **not** gated on `categorybased`. The
  existing Total Enrolled filter is, but this card appears on every workshop, so gating
  would hide its filters almost everywhere. Say the word if it should be gated instead.
- **Two filters I had to fix as well.** The subscriber-code and referred-only filters on the
  New Users panels rebuilt their list from the full new-user map, so a moved user would
  reappear in the panel while the card count excluded them. Both now apply the same rule.

## 4. Verification

- Dev and production builds green.
- The counting and filtering rules were run against a fixture (four enrolled: two plain
  existing, one moved-to-existing, one genuinely new):

  | | result | expected |
  |---|---|---|
  | Total Enrolled | 4 | 4 |
  | Exist Users Enrolled | 3 | 3 — includes the moved user |
  | New Users Enrolled | 1 | 1 — moved user excluded |
  | New Users Not Enrolled | 1 | 1 — moved user excluded |
  | Exist + New = Total | true | the two cards partition the set |

  The moved user resolved to the metadata journey and customer status, not the stale
  new-user doc, and both filters selected the right people.
- Card order and the filter menu rendered in a harness: the new card sits before New Users
  Enrolled, with Journey Filter and Customer Status sections and removable chips.
- **Not verified at runtime** — the dashboard is behind login. The operator pass should open
  a workshop that has at least one moved-to-existing user and check that Exist + New equals
  Total, then filter the new panel by a journey and by a customer status.

## 5. Note for later

`mapProfileNew` is still passed whole to the new-users dialog (`manualenroll` / the New
Users management screen). That is outside this card's scope and was left alone, but if that
dialog should also stop showing moved users, it needs the same rule.
