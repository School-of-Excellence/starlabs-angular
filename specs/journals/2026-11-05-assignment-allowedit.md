# 2026-11-05 — workshopconfig → Challenges: "Allow edit" on a Question assignment

## What
An assignment activity whose Assignment type is **Question** now has an **Allow edit** switch. It is
stored as the boolean `allowedit` on that activity inside `workshopconfiguration.challenges[].challenges[]`.

Files: `New-Workshop/workshop-configurationv2/challenges/workshop-challengesv2.component.{ts,html}`,
`New-Workshop/workshop-configurationv2/wc2-help.ts` (help entry).
Hook: `wc1-toggle-allowedit` (prefix `wc1`, the component's existing prefix).

## Why it is shaped this way
- **Always a boolean.** A new activity starts `false`. An older activity read from Firestore becomes
  `c.allowedit === true`, so a missing key reads as off. Every activity therefore saves `true` or `false`,
  never `null`.
- **Question only.** The switch renders only under Question. Switching the assignment to Form sets it
  `false`, so a Form assignment never stores `true`. Changing the activity type also resets it, with
  `false` rather than the `null` the other type fields get, because it is a boolean.
- It counts as "type data" in the change-type confirm, so turning it on and then changing the type
  asks first, like the other fields.
- It uses the same toggle row as "Review assignment", so it matches the screen.

- **The legacy editor carries it through.** `/workshopconfigold/:id` (`workshop-configuration.component.ts`)
  rebuilds every activity from a fixed field list. Its Challenges save writes the whole array back, so
  without the key it would silently wipe `allowedit` from every activity. It now holds `allowedit` (no UI)
  and saves it unchanged. Found by the review pass.

## Coverage
Hub `workshops/workshops-deep.spec.ts` WS-76, on a dedicated workshop doc copied from W_INACTIVE so it
does not race WS-06 and WS-10. It has no `active` key, because WS-13 counts inactive docs, and it has its own title,
because the list specs find rows by the W_INACTIVE title. The seed writes no `allowedit`. The case checks:
- the switch shows for the Question activity only and starts off;
- after Save, `true` is stored and the Form activity stores `false`;
- after a reload the switch reads on;
- switching to Form hides it and stores `false`.

`workshops-deep.spec.ts`: 11 passed / 0 failed.

## Pending
- The learner app has to read `allowedit` before it changes anything for learners. Today the
  assignment screen keeps the first submission read-only.
