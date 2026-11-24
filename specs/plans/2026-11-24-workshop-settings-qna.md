# Plan — Q&A block in Workshop Settings → Dashboard Access (2026-11-24)

**Ask (operator):** in the workshop config's Dashboard Access section, add a Q&A section with:
- **Title** (text input) and **Admin text** (text input)
- **Admins**: an "Add a person" picker, several people, **no new users**
- four switches: **Enable split**, **Enable video time**, **Same question**, **Allow like**

Stored in `workshopsettings/{workshop id}` as one map:

```
q&a: { title: "Q&A", admintext: "A&H Team", admin: ["3LVxKXuyxldYoRDEpx5s"],
       enablesplit: true, enablevideotime: false, samequestion: false, allowlike: false }
```

## What lands
- `settings/qna-settings.ts` (pure): `QNA_FIELD`, `readQnaSettings`, `buildQnaSettings` (trim, de-dup, strict booleans),
  `qnaFingerprint` (unsaved state). Unit spec `qna-settings.unit.spec.ts`.
- `workshop-settingsv2.component.ts`: the access section reads `workshopsettings/{id}` once for both grants and Q&A.
  Save Access writes `q&a` only when it changed, with `mergeFields: [workshopid, FieldPath('q&a')]`.
- `workshop-settingsv2.component.html`: Q&A block (`ws-qna-*` hooks) between "This workshop" and the Save Access bar.
  The admins picker reuses `accessPickerList(false)`: participant directory only, so new users are never offered.
- Hub: `workshops/workshop-settings-qna.spec.ts` (WSQ-01..03) + `workshopQna` / `seedWorkshopQna` in `support/wshop.ts`.
