# 2026-11-02 — ATC form: participant / sponsor fill in web

Let a participant or sponsor fill an ATC form in the web app from a link the specialist copies, the same
way a specialist fills one. Single route, single component, one additive branch.

## Decisions (operator, 2026-11-02)

1. **Keep `authGuard`** on `/formtemplate`. Only a logged-in person reaches the screen.
2. **`participant` is the entry-level role**, held by everyone. It is added to the `dashboard` route-config
   doc for `/formtemplate`. A user with **no** role flags is denied — `authGuard` already does this
   (`rolesArray` is empty → `hasAccess` false), so no code is needed for it.
3. **Nothing in the existing four flows changes.** Direct form, queue (inline and standalone), B!G
   activity and ATC specialist keep their current behaviour, params, writes and finish. On-behalf via
   `?profileid=` stays exactly as it is for those four.
4. `submittedin` stays `'starlabs'`.
5. `atc_form_requests` docs are created with `formstatus: 'sent'`. Submission is allowed only while the
   status is `sent`.
6. `request.answerid == null` → new submit. `answerid` present → edit, **reusing the existing
   `patchdata` workflow**.
7. **The mode is decided by one thing: whether the request id is in the URL.** View Prescribed ATC
   passes `atcid` always, and the `atc_form_requests` document id only on the copy link.
   - `atcid` alone → specialist. Today's link, untouched.
   - `atcid` + `request` → participant / sponsor.
   Nothing else in the app sets `atcid`, so the discriminator is unambiguous.
8. Submission is the specialist's logic plus one write, matching the Flutter app: the answer is saved,
   the ATC document gets `formsubmitted.{formid}`, and the request document gets
   `formstatus: 'submitted'`.

Every change below is inside `if (atcFormRequest)`. With no `request` param the component behaves
byte-for-byte as today.

## Access

`authGuard` runs unchanged. For `/formtemplate` it resolves `cleanUrl` to `/formtemplate`
(`'/' + state.url.split('?')[0].split('/')[1]`), so a path param would not break the lookup — but we are
not adding one; the request id travels as a query param.

**Deploy step (operational, not code):** add `participant` to the `roles` array of the `dashboard`
document whose `route` is `/formtemplate`, via the `/routeconfiguration` screen.

Accepted consequence, stated once and agreed: this grants the URL, not just the link. Any signed-in
person can open `/formtemplate?id=<any delivery form>` with no request. That is the same exposure the
queue's existing shareable link already has (`queue-creation-v3.component.ts:943`).

## The link

`view-prescribed-atc.component.html:398`, a new button beside Withdraw, gated on the existing
`row.canWithdraw` — already true in exactly the two pending branches ("Waiting for …", "Waiting for
update"), so no new condition logic.

```ts
// Copy: the participant/sponsor fills the same form screen in web. The link carries the request id;
// who may use it is decided from the request doc + the login, never from the URL.
copyAtcFormLink(row: any) {
  var requestid = row.request.path.split('/').pop()
  var params: any = { request: requestid, id: row.formid, type: 'form', atcid: row.request['atcid'] }
  if (row.request['answerid']) params.patchdata = 'formsByClient/' + row.request['answerid']
  var url = window.location.origin + this.router.serializeUrl(this.router.createUrlTree(['/formtemplate'], { queryParams: params }))
  navigator.clipboard.writeText(url)
    .then(() => this.snackBar.open('Form link copied', 'Close', { duration: 3000 }))
    .catch(() => this.snackBar.open("Couldn't copy the link", 'Close', { duration: 3000 }))
}
```

`data-testid="vatc-form-copy"` — literal, per the e2e hook rule.

Putting `patchdata` in the link is what lets decision 6 reuse the existing workflow untouched:
`formpatch` (:222), the prefill (:281) and `onUpdate` (:866, unguarded `.split('/')`) all read
`patchdata` directly and need no change. The Update button at :684 (`*ngIf="formpatch && atcid"`) then
appears on its own.

## Component changes

### 1. Resolve the request before the form loads

`constructor` (:156). The fetch is async, so it is awaited in `ngOnInit` before `getFormsOption`, and
`ngAfterViewInit` already runs after it.

```ts
// ATC participant/sponsor form: everything that decides identity comes from the request doc.
this.atcRequestId = this.route.snapshot.queryParams['request'] || null
```

In `ngOnInit`, before `initializeUserData`:

```ts
if (this.atcRequestId && !(await this.loadAtcFormRequest())) return   // invalid → alerted + sent home
```

```ts
private async loadAtcFormRequest(): Promise<boolean> {
  const snap = await getDoc(doc(this.firestoreATC, 'atc_form_requests', this.atcRequestId))
  const myProfileId = (await this.auth.getRoles())?.['profile_ref']?.id ?? null
  const bad = !snap.exists() ? 'This form link is no longer valid.'
    : snap.data()['profileid'] != myProfileId ? 'This form was sent to someone else.'
    : snap.data()['formstatus'] != 'sent' ? 'This form has already been submitted.'
    : snap.data()['formid'] != this.route.snapshot.queryParams['id'] ? 'This form link is invalid.'
    : null
  if (bad) { alert(bad); this.router.navigateByUrl('/'); return false }
  this.atcFormRequest = { requestid: snap.id, ...snap.data() }
  this.profileid = myProfileId          // the request branch never trusts ?profileid=
  return true
}
```

**The `formid` check is mine, not agreed — say the word and it comes out.** It guards one case the
status check does not: a valid request for form A opened as `?id=B` records an answer at
`formsubmitted.B` on the ATC. The other three conditions are the operator's.

`/` redirects to `/EISDashboard`, which `authGuard` admits unconditionally (`auth.guard.ts:31`), so
"take them home" lands cleanly for a participant.

### 2. `filledby` from the request

`:631` currently hardcodes `'specialist'` whenever `atcTargetId` is set.

```ts
this.submittedClientForm['filledby'] = this.atcFormRequest?.filledby ?? 'specialist'
```

Required, not polish: View ATC groups form rows by `filledby`, so a participant answer tagged
`specialist` would land under "Forms you fill" and leave their own row reading "Not sent".
`onUpdate` does not set `filledby` at all, so the edit path needs nothing here.

### 3. Close the request in the submit transaction

`recordOnAtc` (:568) gains the request, mirroring `FillForm.dart:2336-2345`:

```ts
const request = this.atcFormRequest
  ? doc(this.firestoreATC, 'atc_form_requests', this.atcFormRequest.requestid) : null
const recorded = await runTransaction(this.firestoreATC, async transaction => {
  if (request && !(await transaction.get(request)).exists()) return 'revoked'
  const atc = await this.findCurrentAtc(ref => transaction.get(ref))
  if (typeof atc === 'string') return false
  transaction.update(atc, new FieldPath('formsubmitted', formid), answerId)
  if (request) transaction.update(request, { formstatus: 'submitted' })
  return true
})
```

Two jobs. `formstatus: 'submitted'` is what clears the card in the app, moves the specialist's row off
"Waiting for …", and makes the link single-use — without it the link stays `sent`, a second submit mints
a fresh `draftDocid` and creates a **second** answer with the first orphaned. The re-read inside the
transaction is what honours a Withdraw that lands mid-fill.

### 4. Draft carries the ids

`_performAutoSave` (:952-957) adds `atcid` and `delete: false` beside the `profileid`, `queueid`,
`formid`, `date`, `docid` it already writes.

`getFormsOption` scopes in two places. The `where` gains the `atcid` filter only when there is an atcid,
because an unconditional one would break every in-flight non-ATC draft — Firestore's `== null` matches only
documents that carry the field, and drafts written before this change have no `atcid`:

```ts
const draftFilters = [where('formid', '==', this.patchformid), where('profileid', '==', this.profileid)]
if (this.atcid) draftFilters.push(where('atcid', '==', this.atcid))
const draftSnapshot = await getDocs(query(tempFormsRef, ...draftFilters))
```

That alone is asymmetric: a session with no atcid applies no filter and so still matches ATC drafts for the
same `(formid, profileid)`. Operator decision 2026-11-02, after the first implementation: keep the `where` as
above and **scope the result as well**, which Firestore cannot express as a query at all.

```ts
// An ATC form's draft belongs to that ATC, so a session with no atcid must not be offered one.
const scoped = this.atcid ? drafts : drafts.filter(d => !d['atcid'])
```

`!d['atcid']` catches missing and null alike, so old and new drafts behave the same and no migration is needed.
The dedupe downstream reads `scoped`.

**A restored draft brings its own context back (operator decision 2026-11-02).** `_performAutoSave` has always
written `queueid` onto the draft, and now `atcid` too, but nothing ever read them back: `selectDraft` adopted
the draft's `docid` — which becomes the answer id at :689 — while `patchFromDraftData` restored field values
only. So a draft resumed under a different flow was written at the draft's answer id with the resuming
session's refs. `selectDraft` now restores both ids, and re-resolves the queue:

```ts
async selectDraft(draft: any) {
  ...
  this.atcid = draft['atcid'] ?? null
  this.queueId = draft['queueid'] ?? null
  if (this.queueId) await this.initializeQueueData()   // token + stages must follow the restored queue
  this.patchFromDraftData(draft)
}
```

The `initializeQueueData` call is load-bearing. `ngOnInit` resolved `participantQueueToken` and
`queueData.stages` for the session's queue; restoring `queueId` without re-resolving them would write an answer
whose `queueref` names one queue while its `queuetokenref`, `stagename` and stage advance came from another.
Accepted consequence: restoring a draft written under queue A, from a link opened on queue B, moves the whole
submission — answer, token advance and stage log — to A. FSR-04 pins that.

`delete: false` also makes a web-started draft visible to the app, whose query is
`(formid, profileid, delete == false)`. Disposal stays the hard `deleteDoc` at :780, moved to **after**
the transaction commits so a `revoked` outcome leaves the draft intact.

Edits have no draft at all — both `getFormsOption` and `_performAutoSave` return early on `formpatch`.
Same as the specialist edit today.

### 5. Finish

```ts
private closeAtcFormTab() {
  if (this.atcFormRequest) { this.router.navigateByUrl('/'); return }   // pasted link: nothing to close
  window.close(); setTimeout(() => this.router.navigateByUrl('/'), 300)
}
```

| Who | Finish |
|---|---|
| Specialist | save, then `window.close()` — unchanged |
| Participant / sponsor | save, then home |

## Not changing

Listed so nobody "tidies" them inside this change: the four existing flows; `?profileid=` on-behalf for
them; `submissionAccess` / `reviewAccess` (computed at :162-175, never used) and the hardcoded
`reviewaccess: false` at :508; the queue branch running pointlessly for B!G activity because `queueid`
carries the assignment id; B!G's in-page confirmation in a `window.open` tab; the cross-database refs at
:615-620, :762 and :908; the dead `type`, `reviewLast`, `reviewNotes` params; and the overloaded
`formpatch` flag. Splitting `formpatch` into `prefill` / `draftEnabled` / `submitMode` is the right
follow-up once this ships.

## e2e (starlabs-e2e-tests)

Seeds: `seedPhase9` in `atc/seed-atc.js` — `twp` the participant, `tws` the sponsor, `WL_MODEL` carrying a
participant form, a sponsor form and one already answered. One ATC per request state, because the cases run
in order in one worker and a request consumed by one case must not be the request another depends on:
`NEW` (sent), `EDIT` (sent + answerid), `SPON` (sponsor, sent), `DONE` (already submitted), `OTHER` and
`DRAFT` (sent, never consumed). `/formtemplate` is seeded with `participant: true`, which is what mirrors the
production dashboard change — without it the suite could not reach the screen either.

Specs: `atc/atc-form-web-link.spec.ts`, WL-01..08, and `atc/form-screen-regression.spec.ts`, FSR-01..04 —
the queue and B!G flows plus the two draft decisions above. FSR-01 a queue draft keeps its `queueid`, has no
`atcid` and is still offered on a reopen · FSR-02 a B!G form drafts on behalf of the participant, not the
signed-in staff · FSR-03 an ATC draft is never offered to a session with no `atcid` · FSR-04 restoring a draft
moves the submission to the queue the draft was written under.

FSR-01..04 live in the `atc` suite because they drive `/formtemplate`, which it owns. They deliberately do not
boot the queue suite's Cloud Functions, so the queue token advance, the `queue stage log` write and the
`big participants assignments` status update on submit remain uncovered by an automated run.

Cases, in the `atc` suite:
- participant opens their link, fills, submits → answer carries `filledby: 'participant'`,
  `submittedin: 'starlabs'`, ATC `formsubmitted` set, request `formstatus: 'submitted'`
- re-opening the same link → "already submitted", lands on the dashboard
- a second participant's link opened by the wrong login → "sent to someone else"
- a withdrawn request → "no longer valid"
- `?id=` swapped to another form → invalid
- `answerid` present → prefilled, submit merges the same answer and writes `formsByClient log`
- regression: specialist fill and edit unchanged

Gate notes: `formtemplate.component.ts` is owned by the **queue** and **journey** suites, so both become
mandatory on push. `/formtemplate` is already first on the `check-atc-coupling.mjs` backlog (17 routes,
exit 1); this adds `atc_form_requests` to a route already listed.

## Known gap

Production Firestore rules are not in this repo (`firestore.rules` is emulator-only and says so). Every
check here is client-side. A participant must be able to read only their own request, write only their
own answer, and update only `formsubmitted` on the ATC their request names. That review is a separate,
operator-owned step.
