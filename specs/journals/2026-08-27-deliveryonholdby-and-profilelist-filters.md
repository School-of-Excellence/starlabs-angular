# 2026-08-27 — `deliveryonholdby` audit stamp + profilelist filter toggles

## 1. `deliveryonholdby` on profile_data
Operator: *"when i update deliveryonhold in profile_data add a field as deliveryonholdby, in that store
user: loggedinprofileid and time."*

`src/app/Participants Profile Management/updateprofile/updateprofile.component.ts` — `createProfile()`, the
single place the profile form is persisted (`batch.set(profile_dataRef, {...profilevalue}, {merge:true})`).

```ts
deliveryonholdby: { user: <logged-in profileid>, time: serverTimestamp() }
```

**Written only when the value actually changes** (`newHold !== prevHold`). Deliberate: `createProfile()`
runs on *every* profile save, so stamping unconditionally would rewrite the timestamp on unrelated edits
and destroy the trail. Covers both directions — set *and* cleared — and a new profile created already on
hold (`prevHold` is false when `dialogData.profile` is null).

The logged-in profileid comes from `authguard.getRoles()?.['profile_ref']?.id`, the same pattern the
composers use for `createdby`. Note `getRoles()` returns the **users_roles** doc, not the profile — it is
that doc which carries `profile_ref`. Wrapped in try/catch: a lookup failure stores `user: null` rather
than losing the whole stamp.

`serverTimestamp()` rather than `new Date()` — an audit field should not depend on the client clock. It is
a nested sentinel inside a map, which Firestore supports in `set`/`update`.

`AuthguardService` had to be injected; this component did not have it.

## 1b. Showing the stamp in the dialog
Operator: *"show in the dialog only, the name and date for on hold."*

Under the "Delivery Onhold" checkbox in the same dialog:

> **On hold by Charan Reddy P · 27 Aug 2026, 2:35 AM**

`loadHoldStamp()` runs when the form is patched. It resolves `deliveryonholdby.user` (a profileid) to a
name with a **single `getDoc`** on that profile rather than pulling `getProfileMap()` — one read instead of
the whole collection, and never stale.

Three deliberate details:
- **It reflects the SAVED state, not the live checkbox.** `holdWasOn` comes from `dialogData.profile`, so
  ticking or unticking the box without saving does not change what the line says.
- **The wording flips**: `deliveryonholdby` is written on *both* set and clear, so the field alone is
  ambiguous. Paired with the saved `deliveryonhold` it reads either "On hold by …" or
  "Hold removed by …". Red when currently held, grey when not.
- **Time handles both shapes**: `t?.toDate ? t.toDate() : new Date(t)` — a Firestore Timestamp from
  `serverTimestamp()`, or a raw date if anything ever wrote one.
- On a name-lookup failure it falls back to showing the raw profileid rather than hiding the stamp.

## 2. profilelist filter toggles
Operator: *"i need a toggle in the profilelist screen for filtering delivery hold participants, and also
for the who have access to ahcrm app, these both check boxes are in same dialog only."*

Both flags come from the same updateprofile dialog: `deliveryonhold` (checkbox "Delivery Onhold") and
`enableahcrm` ("Enable ahcrm App").

`src/app/Participants Profile Management/profilelist/profilelist.component.*` — two `mat-slide-toggle`s
beside the existing name filter, each with a live count badge (`holdCount` / `ahcrmCount` getters).

**The three filters combine.** `filterData()` previously assigned the raw string to
`tableData.filter`; it now feeds `applyFilters()`, which serialises `{name, hold, ahcrm}` as JSON into
`tableData.filter` and is decoded by a custom `filterPredicate`. Pagination resets to page 1 on any change.

**The name box behaviour is preserved exactly.** The predicate rebuilds the same haystack
MatTableDataSource creates by default — `Object.keys(row).reduce((acc,k) => acc + row[k] + '◬', '')` — so
the name box still matches across every column as it did before. Writing a narrower haystack
(name/email/number) would have silently broken searches on other columns.

Toggles are AND, not OR: both on shows profiles that are held *and* have AHCRM access. That is the useful
combination; say so if OR is wanted.

Needed `MatSlideToggleModule` + `MatTooltipModule` in the standalone imports; `FormsModule` was already
there for `ngModel`.

## Verified
`tsc` and `ng build` clean. Exercised live at `localhost:4200/profilelist` (starlabs-test):
- **Delivery on hold** → `1 – 1 of 1`, Charan Reddy P only.
- **AHCRM access** → 46 profiles.
- Counts render on the badges before either toggle is used.

`deliveryonholdby` **is** now confirmed end to end: opening Charan Reddy P's profile shows
*"On hold by Charan Reddy P · 27 Aug 2026, 2:35 AM"* — a stamp written by this code when the operator
saved the profile with the checkbox flipped, then read back and name-resolved on reopen.
