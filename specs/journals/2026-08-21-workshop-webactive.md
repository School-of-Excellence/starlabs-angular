# 2026-08-21 — Workshop "Web Active" flag (webactive)

## What was asked
A second activation boolean, **web only**, alongside the app-facing
`active` flag: a "Workshop Active Web" toggle in `/workshopconfig` Settings
(right after "Workshop Active"), and a "Web Active" toggle column next to
"Active" in the `/workshops` list.

## What changed
Field name: **`webactive`** on `workshopconfiguration` docs (defaults false;
old docs without it read as false via `|| false`).

- `workshop-configuration.component.ts/.html`: `webactive: [false]` in
  settingsForm; patched in `patchSettingsData`; written in `saveSettings`
  updateDoc; added to the `onToggleChange` union; new setting-row after
  Workshop Active ("Workshop is visible/hidden on the web").
- `workshops.component.ts/.html`: `'webactive'` in displayedColumns after
  `'active'`; new column "Web Active" with a slide-toggle; new
  `onWorkshopWebStatusChange` mirroring `onWorkshopStatusChange` exactly
  (window.confirm, updateDoc {webactive}, snackbar, revert-on-error/cancel).

## Notes
- `WorkshopConfig` interface declares only `detailpage` — the codebase
  bracket-accesses undeclared fields (`data['active']`), so no interface
  change was needed for `data['webactive']`.
- **Nothing consumes `webactive` yet** — the web participant flow must
  read it wherever it currently checks `active` for visibility. That
  consumer change was NOT requested and is untouched.
- Verification: prod build green; both screens need auth so unauthenticated
  browser checks aren't meaningful — the change is a strict clone of the
  adjacent, already-working toggle patterns. Not committed.

---

## 2026-08-26 — paymentmap status selects (workshopconfig Settings)

When Payment is enabled, two new single mat-selects render AFTER
"Payment For" inside the paymentmap subsection:
- "Payment Based on Customer Status" → paymentmap.customerstatus:
  non active | active | discontinued | none | banned | late
- "Payment Based on Financial Status" → paymentmap.financialstatus:
  fully paid | regular | discontinued | locked | defaulted | banned | late
Option values stored EXACTLY as the operator specified (lowercase,
spaces — "case sensitive" directive). Controls added to the paymentmap
form group + patchSettingsData; save needs no change (paymentmap is
written wholesale via .value in saveSettings). Old docs without the
fields patch to ''. Prod build green. Not committed.

Correction (same day): operator wants both status selects as
MULTI-select storing ARRAYS (feature unused, no migration needed).
mat-selects got `multiple`; form controls init to []; patch coerces via
Array.isArray(...) ? value : [] so any non-array leftover reads as
empty. paymentmap.customerstatus / .financialstatus are now string[].
Prod build green.

---

## 2026-08-26 — eiflixhomeconfig Ads: adsfor field

/eiflixhomeconfig Ads tab (upcomingworkshops component → shared
CreateupcomingworkshopsComponent dialog, widgettype 'ads', collection
eiflixhomewidgets): new `adsfor` string field as a mat-select "Ads For"
placed after Navigation Link — values both | new | exist (lowercase,
labels Both/New/Exist, mirroring workshopconfig's paymentfor). Wired in
buildAdsForm ('' default), edit hydrate (w.adsfor || ''), and the ads
save payload. Old docs load as empty select. Nothing consumes adsfor
yet (participant app to filter later). Prod build green. Not committed.

---

## 2026-08-26 — adsfor REVERTED → home-config Ads section instead

Operator rejected adsfor ("revert this"): all three TS touch points +
the dialog select removed; zero adsfor references remain.

Replacement feature in the SAME /eiflixhomeconfig page, "create/assign
eiflix home" (EiflixHomeConfigComponent → classify/eiflixwebapp
homeconfig array):
- 'Ads' REMOVED from the static Widgets options.
- New "Ads (two per home row)" optgroup in the Home-items select,
  listing every ad from the Ads tab (eiflixhomewidgets where
  widgettype=='ads', label = ad title) — picked exactly like Home Series;
  each picked ad gets the SAME item row (Title / Subtitle / Show To,
  title prefilled with the ad name, drag-reorder, 'Ad' chip .tag-ad).
- SAVE structure (Firestore forbids nested arrays, so "one index, two
  maps" = an entry map with an ads array): consecutive ad rows pair into
  { type:'ads', label:'Ads', ads:[ {value: adId, label, adref:
  DocumentReference(eiflixhomewidgets/id), title, subtitle, showto},
  ≤2 ] }. Non-ad items between ad rows break a pair (each run chunks
  independently); odd runs save a 1-map entry.
- Hydrate: type=='ads' entries expand each ads[] map back into item rows
  (missing ads kept visible via fallback option); LEGACY ads-widget
  entries (old {type:'ads'} without ads[]) are DROPPED on load and thus
  removed on next save.
Prod build green. Not committed. The EiFlix web app must read the new
paired structure when rendering ads rows (consumer not in this repo's
scope today).

UI follow-up (operator screenshot): ad items must GROUP visually the way
they save — 2 per card. items-list now renders from a cached groupsView
(consecutive ads chunk ≤2 → one .ads-pair-card holding two sub-blocks,
each with its own name/Ad chip/✕/Title/Subtitle/Show To; other items = 1
card as before). Card numbers = home-row numbers. Drag reorders WHOLE
cards (dropGroup rebuilds the FormArray from the flattened group order,
emitEvent:false). groupsView recomputed only on structural changes
(hydrate/select/remove/drop) so typing never rebuilds DOM/loses focus.
Save/pairing logic untouched — UI now mirrors it 1:1. Prod build green.
