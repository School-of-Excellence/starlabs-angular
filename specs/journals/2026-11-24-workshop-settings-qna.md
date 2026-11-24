# Journal — Q&A block in Settings → Dashboard Access (2026-11-24)

Plan: `specs/plans/2026-11-24-workshop-settings-qna.md`.

## Why each choice
- **Inside Dashboard Access, saved by Save Access.** The operator asked for it inside that section. The section
  already loads the participant directory the admins picker needs, and it already saves itself to the same
  `workshopsettings/{id}` document. A second Save button in one section would be confusing.
- **Written only when it changed.** Save Access runs for every grant edit. Writing `q&a` every time would create an
  empty map on every workshop someone opens. WSQ-03 guards this.
- **`mergeFields` with `FieldPath('q&a')`.** The map is replaced whole, so a removed admin really leaves (the same
  lesson as `dashboardaccess`, 2026-11-12), and `dashboardaccess` / `mail` in the same document are left as they are.
  A FieldPath because the field name contains `&`.
- **One read for grants and Q&A.** The section used `getWorkshopGrants`, which turns a failed read into "no grants".
  It now reads the document once in the component. A failed read now fails the section (Save is unreachable)
  instead of showing empty values that a save would then store. This applies to the grants too, and is safer.
- **No new users in the picker.** `accessPickerList(false)` reads only the participant directory
  (`participant metadata`), which never includes `new_user_data` people. WSQ-01 checks this with NU Alpha.
- **Labels without explanations.** The operator gave names only ("split", "video time", "same question"). The
  switches show On/Off rather than an invented description. No Firestore field names appear on screen.
- **"Same question"** was added mid-feature, stored as `samequestion` in the same map. A map saved before it
  existed reads as off.
- **"Allow like"** was added after that, stored as `allowlike` in the same map, with the same rule (absent = off).

## Verified
- Unit: `qna-settings.unit.spec.ts` 8/8 (with samequestion and allowlike).
- Build: `ng build --configuration development` clean.
- Hub on the emulator: WSQ-01..03 3/3, `workshop-dashboard-access.spec.ts` 16/16 (shares W_DASH's settings doc).
- Readiness gate: matched, all selectors present.

## Surprise
- The first WSQ run after adding the third switch failed with "element not found". The `ng serve` test app was
  still rebuilding when the run started. Wait for "Page reload sent" in the app log before running a spec after an
  edit.

## Hub push
- Pushed `5442eae..6fd2ad7` (WSQ spec + the Allow like case). The full workshops suite was stopped at 36/40 files
  (225 passed, 0 failed). The operator ruled that the full suite is not run before every push any more: targeted
  runs (the touched spec + specs sharing the screen or seed) and careful spec writing instead. WSQ + the
  Dashboard Access spec (19/19) were the targeted run.

## Pending
- Operator: commit the app files (qna-settings.ts, its unit spec, workshop-settingsv2.component.ts/.html, this plan
  and journal).
- Nothing reads `q&a` yet on the participant side. This lands only the settings that the Q&A screens will read.
