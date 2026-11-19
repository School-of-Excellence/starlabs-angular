# 2026-11-12 — Workshop dashboard: who gets the Clear button

## What
The Clear button on `/workshop_dashboard/:id` (it clears participant progress) now shows only for:
1. a profileid in `static meta data/Workshop Admin` → `clearworkshop` (array, already in Firestore), or
2. a profileid whose `workshopsettings/<workshopId>.dashboardaccess[profileid]` includes `'clear'`.

**Full dashboard access (`workshopdashboardadmin`) no longer includes Clear.** Those people keep every
other action.

Files: `New-Workshop/workshop-access/workshop-access.model.ts` (rule), `workshop-access.service.ts`
(passes the list), `workshop-configurationv2/settings/workshop-settingsv2.component.{ts,html}` (copies the
list; the help text now reads "everything … except Clear"). New unit spec: `workshop-access.model.spec.ts`.

## Why it is shaped this way
- **Operator directive.** Clear destroys progress. Full dashboard access is handed out widely, so Clear
  gets its own short list.
- **The rule lives in `WorkshopAccess.can('clear')`.** The button's `*ngIf`, `openClearDialog()`'s guard
  and the access summary (`keys`) all go through it, so none of them can disagree.
- **`clearworkshop` does not open a dashboard by itself.** `isLockedOut` is unchanged. Someone on the
  list still needs full access, or any grant on that workshop, to get in, and the list only adds Clear
  there. This keeps the new list from quietly becoming a "see every dashboard" list. Easy to flip if the
  operator wants the list to open dashboards too.
- **The app never writes `clearworkshop`.** It is managed directly in Firestore. The editor's save is a
  `merge` of the other three lists only, so the stored list survives an editor save. The in-session cache
  copies it through, so a dashboard opened after a save still honours it.
- **A full-access person can't get the per-workshop tick from the editor.** The editor leaves full-access
  people out of the per-person rows, as before. For them, Clear comes only from `clearworkshop`.
- The unrouted `workshop-dashboardv2` still has its own hard-coded Clear ids. It has no route, so it is
  unreachable and left alone.

## Review fixes (two-reviewer pass)
- **The editor's grants save replaces the map now.** This bug was already there before this change.
  `saveWorkshopGrants` used `merge: true`, which deep-merges `dashboardaccess`. A person removed or set
  to None kept their stored actions, Clear included, whenever someone else still had a row. It now uses
  `mergeFields: ['workshopid','dashboardaccess','updatedat',('updatedby')]`, so the map is replaced
  whole and other fields stay as stored. WDA-12 missed it because it only ever removed the last person.
- **The e2e Clear cases moved to `workshop-dashboard-clear-access.spec.ts`**, which is gated on the new
  hook `ws-access-admins-help` (the "except Clear" help text). The hub's `main` runs against every app
  branch, and the hub-ahead guard can only skip a file that references a hook the branch lacks. Without
  a new hook, branches without this rule would have gone red.
- **Proving the list itself grants Clear.** mover's profile id is one of the old hard-coded founder ids,
  so WCA-03 empties the list and asserts that mover loses Clear on the same workshop.
- Known, not changed:
  - A full-access person's per-workshop row is hidden in the editor, as before. A leftover 'clear' tick
    from before they got full access would still give Clear and can't be seen there.
  - If the admin-lists read fails twice, the editor loads empty lists, and a save then writes them back
    empty. This was already possible before this change.

## Coverage
- Unit `workshop-access.model.spec.ts` (7/7): full access without the list → no Clear but everything else.
  The list or the tick → Clear. The list alone does not open a dashboard. Nobody else gets Clear. The
  list is read defensively.
- Hub `workshop-dashboard-access.spec.ts` + `workshop-dashboard-clear-access.spec.ts`, 22/22 on the emulator (see WCA-01..06 for the Clear cases):
  - The seed puts `mover` (who also has full access) on `clearworkshop`. `admin` has full access and is
    deliberately not on it.
  - WDA-00 audits that shape.
  - WDA-09 no longer asserts Clear either way.
  - WDA-14: an editor save keeps `clearworkshop` as stored, even when it changed after the editor loaded.
  - WCA-01: the help text says "except Clear". WCA-02: admin gets no Clear but still has Enroll and
    Diagnose.
  - WCA-03: mover gets Clear, then loses it once the list is emptied.
  - WCA-04: limited's own Clear tick gives Clear, still with no ungranted action.
  - WCA-05: limited on the list gets Clear on W_DASH without a tick, while W_ACTIVE (no grants) stays
    closed.
  - WCA-06: None on one of two people removes their stored grants; the other person's are untouched.
  - Hub commit `0259636` (local).

## Pending
- Production: make sure the right people are in `clearworkshop` before this ships. Full-access people
  lose Clear the moment it deploys.
- The hub changes are local until the operator says push (full workshops suite first).
