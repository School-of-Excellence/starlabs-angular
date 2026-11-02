# 2026-11-02 — /formtemplate execution map (every system)

Reference for the ATC form web-link feature. Everything below is read from
`src/app/Product Designer/delivery-set/formtemplate/formtemplate.component.ts` (1188 lines) at commit
`1b767788`. Line numbers are that file unless another file is named.

The screen is **entirely query-param driven**. There is no mode enum — each system is a different
combination of params, and the branches are scattered. That is why the same component serves six flows.

## Databases it touches

| Handle | Database | Collections used here |
|---|---|---|
| `firestoreDefault` (96) | *(default)* | `delivery forms`, `big participants assignments`, `queue generation`, `queue_token`, `queue stage log`, `formsByClient` *(ref only)* |
| `firestoreForms` (97) | `firestore-forms` | `formsByClient`, `formsByClient log`, `temporary_forms` |
| `firestoreATC` (98) | `firestore-atc` | `atc_alpha` |

## Entry points

| # | Opened from | URL | System |
|---|---|---|---|
| 1 | `delivery-set.component.ts:209` | `?id={docid}&type={type}` | Product design preview |
| 2 | `queue-creation-v3.component.ts:943` | `https://star-labs.web.app/formtemplate?id={formid}&type=form&queueid={queueid}` | **Queue — shareable absolute link** |
| 3 | `userprofile.component.ts:1346`, `userprofile_old:846` | `{origin}/formtemplate?id={formid}&type=form&queueid={queueid}` | Queue, new tab |
| 4 | `participant-assignment-board.component.ts:544` | `?id&type=form&queueid={assignmentId}&profileid={profileId}&participantAssignmentId={paId}&source=participant` | B!G activity |
| 5 | `participant-assignment-board.component.ts:593,595` | same + `patchdata`, `viewCompleted`/`viewFilledForm`, `reviewNotes` | B!G activity review |
| 6 | `userprofile.component.ts:997`, `dynamic-studio:1660` | `?id&type=form&patchdata={path}` | Edit an answer |
| 7 | `view-participants-form.component.ts:765` | `?id&type=form&patchdata={path}&viewFilledForm=true` | Read-only view |
| 8 | `view-prescribed-atc.component.ts:1285` / `:1292` | `?id={formid}&type=form&atcid={atcid}` *(+ `patchdata=formsByClient/{answerid}`)* | **ATC specialist** |

Note on #2: a **shareable, absolute, unrestricted** form link already exists in this codebase for queues.
It carries no identity and anyone signed in who holds the route's role can open it. The ATC link we are
adding is the first one that is restricted to a named person.

## Query parameters

| Param | Read at | Effect |
|---|---|---|
| `id` | 239, 246 | the `delivery forms` doc id → the form template. Also becomes `formid` on the answer (628). |
| `type` | — | **never read.** Dead param, passed by every caller. |
| `profileid` | 157 | overrides whose answer this is (609). Falls back to the logged-in profile at 361. |
| `atcid` | 158 | ATC mode: enables `resolveAtcForSubmit` (522) and `recordOnAtc` (639). |
| `patchdata` | 222, 281, 866 | edit mode: `formsByClient/{id}` path, loaded at 281, merged at 894. `onUpdate` does an unguarded `.split('/')` at 866. |
| `queueid` | 195 | queue mode: `initializeQueueData` (368) + token advance on submit. |
| `participantAssignmentId` | 160, 196 | B!G activity mode. Drives the review/submission access flags (162-175). |
| `source` | 166 | `'participant'` suppresses `reviewAccess`. |
| `viewFilledForm`, `viewCompleted` | 222, 335, 514 | read-only; also force `formpatch`. |
| `data` | 786 | a doc path that gets `status: "completed"` + `fileref` arrayUnion on submit. |
| `reviewNotes` | *(caller only)* | passed by #5, consumed by the preview dialog. |

### Derived mode flags

```
formpatch  = patchdata present OR viewFilledForm=='true' OR viewCompleted=='true' OR participantformtemplateid   (222)
queueId    = inlineQueueId ?? queryParams.queueid                                                                (195)
profileid  = queryParams.profileid ?? roles.profile_ref.id                                                       (157, 361)
atcid      = queryParams.atcid                                                                                   (158)
```

`formpatch` is the master switch for drafts: when true, **both** `getFormsOption` (1009) and
`_performAutoSave` (936) return immediately. So every edit/review flow has no draft at all.

## Per-system execution

### A. Product design preview (#1)

Load `delivery forms/{id}` → render blank → autosave draft → `onSubmit`.
Writes `formsByClient/{draftDocid}` with `profileid` = the logged-in designer, no `queueref`, no `atcid`.
Finish: `navigateByUrl("/")` (657). Nothing else is updated. This is the "bare screen" path — the one that
becomes reachable by everyone if `/formtemplate` is granted to the participant role.

### B. Queue (#2, #3)

1. `initializeQueueData` (368): reads `queue generation/{queueid}` from **default**, then queries
   `queue_token` where `queueref == queue generation/{queueid}`, `stagestatus == 'Approved'`,
   `tokenstatus == 'Active'`, `profile_id == profileid` → `participantQueueToken`.
2. `getNextStage` (740): the stage after `token.currentstage` in `queueData.stages`, else null.
3. On submit the answer gains `queueref`, `queuetokenref`, `stagename` (617-620).
4. `updateQueueToken` (805): `updateDoc` on `queue_token/{docid}` with `previousstage`/`currentstage`/
   `stagestatus: "Approved"` and ~12 fields reset to null, then creates `queue stage log/{logDocId}`
   with `movedby = profileid`, `movedthrough = 'form'`.
5. Finish: `submissionComplete = true` → in-page confirmation (648). No tab close, no navigation.

If no active token matches, `participantQueueToken` is null → no token advance, answer still saved.

### C. B!G activity (#4, #5)

`queueid` is reused to carry the **assignment id**, so step B.1 runs against
`queue generation/{assignmentId}` and finds nothing — `queueData` stays undefined and `getNextStage`
returns null. Harmless, but it means the queue branch executes pointlessly for every activity form.

- `ngOnInit` (196) reads `big participants assignments/{paId}` from **default** for `status`,
  `cohortsref`, `marathonref`.
- Access flags (162-175): `reviewAccess` true only for `ah`/`admin`/`developer` **and**
  `roles.profile_ref.id !== profileid` **and** not `source=participant` **and** not rework;
  `submissionAccess` true when `roles.profile_ref.id === profileid`.
- Submit: answer gains `bigparticipantassignmentref` (615), then `big participants assignments/{paId}`
  is updated with `status: dialogResponse.status`, `activityref`, `formtemplate` (765-773).
- Review path (`onUpdate`, 906): same doc updated with `status: 'review'`.

### D. Read-only view (#7)

`viewFilledForm=true` → `formpatch` true → no draft, no autosave. The preview dialog gets
`viewOnly: true` (514). Nothing is written.

### E. ATC specialist — new (#8 without `patchdata`)

1. `atcid` set; form loads blank.
2. Draft active (not `formpatch`): `temporary_forms/{draftDocid}`, keyed `(formid, profileid)`.
3. `onSubmit` → `resolveAtcForSubmit` (548) → `findCurrentAtc` (531) follows `upgradedto` /
   `status == 'upgraded'` to the newest version; `isdelete` → `'deleted'`; a repeat id or dangling
   pointer → `'corrupted'`. Sets `atcTargetId`.
4. Answer written to `formsByClient/{draftDocid}` on **firestore-forms** with
   `submittedin: 'starlabs'`, `filledby: 'specialist'`, `atcid: atcTargetId` (627-631).
5. Draft **hard-deleted** (779-781) — before the ATC link is confirmed.
6. `recordOnAtc` (568): its own transaction, re-walks the chain, sets
   `formsubmitted.{formid} = answerId` via `FieldPath`. On failure: alert naming the answer id.
7. Finish: `closeAtcFormTab` (583) → `window.close()`, fallback `navigateByUrl("/")` after 300ms.

### F. ATC specialist — edit (#8 with `patchdata`)

`onUpdate` (837): copies the existing answer to `formsByClient log/{draftDocid}` (877), merges into
`formsByClient/{originalDocId}` (894), sets `submittedin: 'starlabs'` again (891) and `atcid` (892) but
**not** `filledby` — so a participant's answer edited by a specialist keeps `filledby: 'participant'`.
Then `recordOnAtc(formid, originalDocId)` and close.

### G. ATC participant / sponsor — PROPOSED

Not implemented. Nothing in the component reads `atc_form_requests`; the request is only written and
deleted by View ATC (`formRequest` 1300, `sendAtcForm` 1310, `confirmSponsorSend` 1340, `revokeAtcForm` 1352).
Today the collection's `formstatus` is advanced only by the Flutter app
(`FillForm.dart:2344`, `transaction.update(request, {"formstatus": "submitted"})`).

Proposed, as the single-route decision: `?request={atcid}_{formid}&id={formid}&atcid={atcid}`.

| Step | Behaviour |
|---|---|
| Guard | `authGuard` exception: request doc exists, `formstatus == 'sent'`, `profileid == logged-in profileid`, `formid == queryParams.id`. Else denied with a reason. |
| Params | `filledby`, `answerid`, `atcid` from the doc; `?profileid=` ignored. |
| New vs edit | `request.answerid == null` → path E; non-null → path F. Mirrors `isAtcResubmission` (`homeContent.dart:70`). |
| Draft | as E, plus `atcid` and `delete: false` stamped; `getFormsOption` filters on `atcid` only when set. |
| Submit | one `firestore-atc` transaction: request still exists (else `revoked`) → `formsubmitted.{formid}` → `formstatus: 'submitted'`. |
| Draft disposal | after the transaction commits, not before. |
| Finish | specialist → `window.close()`; participant/sponsor → `navigateByUrl('/')` (→ `/EISDashboard`, which `authGuard` always allows at line 31). |

## Answer document — every field written

| Field | Source | Systems |
|---|---|---|
| *(form template fields)* | the `delivery forms` doc, loaded at 247 | all |
| `loginid` | `currentUserId` — the Firebase **auth uid** (608) | all |
| `profileid` | `?profileid` ?? logged-in profile (609) | all |
| `date` | `new Date()` client time (626) | all |
| `docid` | `draftDocid` (627) | all |
| `submittedin` | `'starlabs'` (627, 891) | all |
| `formid` | `inlineFormId ?? patchformid` (628) | all |
| `bigparticipantassignmentref` | (615) | C |
| `queueref`, `queuetokenref`, `stagename` | (617-620) | B |
| `atcid` | `atcTargetId` (630, 892) | E, F, G |
| `filledby` | `'specialist'` hardcoded (631) → *from the request in G* | E, G |

## Draft lifecycle

| | Web (`_performAutoSave` 936) | App (`FillForm.dart`) |
|---|---|---|
| Collection | `temporary_forms` on `firestore-forms` | same |
| Key | `(formid, profileid)` (1023) | `(formid, profileid, delete == false)` (304) |
| `delete` field | never written | `false` while active |
| Disposal | hard `deleteDoc` (780) | soft: `set({delete: true}, merge)` (471) |
| Local mirror | `LocalDraftService` (146), synced on reconnect (986) | — |
| Skipped when | `formpatch` | viewing |

Consequence: a web draft is **invisible to the app** (its `delete` field is missing, so `== false`
never matches). Adding `delete: false` to the web autosave fixes start-in-web/finish-in-app.

## Observations worth a decision (all pre-existing)

1. **Cross-database references.** `bigparticipantassignmentref`, `queueref` and `queuetokenref` are
   built with `doc(this.firestoreForms, …)` (615-620), but those collections are *read* from
   `firestoreDefault` (196, 369-371). `activityref` is built with `doc(this.firestoreDefault,
   'formsByClient', …)` (762, 908) while the answer itself is written to `firestore-forms`. A
   `DocumentReference` carries its database id, so these stored refs point at databases where the
   document does not exist. `seed-atc.js:632` documents the same hazard for ATC refs.
2. **`?profileid=` is trusted** (157 → 609) on every flow, with role checks only inside the
   `participantAssignmentId` branch.
3. **Draft destroyed before the ATC link is confirmed** (780 then 639).
4. **`recordOnAtc` never touches the request**, so a web submission would leave `formstatus: 'sent'`.
5. **`type` is dead** — eight callers pass it, nothing reads it.
6. **`/formtemplate` is first on the ATC-coupling backlog** (`check-atc-coupling.mjs`, exits 1,
   17 routes) and is owned by the **queue** and **journey** e2e suites, not `atc`.
