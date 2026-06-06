# Recon: Collection Schemas for Full Seeding

Source of truth for what the queue-e2e seeders must write into Firestore. Derived from
`specs/queue-collection-schemas.json` (redacted production skeletons, 22 collections) cross-checked
against the live app queries in `src/app/queue system/dynamic-queue-manager-clone/…` and
`…/dynamic-studio/…`. This drives the seeder expansion in `e2e/fixtures/seed-test-project.js`
and `e2e/lib/fake-data.js`.

> Type tokens (from the skeleton + generator `e2e/lib/fake-data.js`):
> `<string>` `<number>` `<boolean>` `<timestamp>` (Firestore Timestamp) `<null>`
> `<ref:COL>` = DocumentReference into collection COL · `<redacted>` = PII → harmless fake string
> `[<empty>]` = empty array · `<deep>` = nested beyond probe depth (treat as opaque map/array).

---

## 0. App-wide invariants (apply to EVERY collection below)

These are not optional. The board / studio / CF reads break silently without them.

1. **docid self-id convention.** Every doc stores its own document id in a `docid` field
   (`queue generation`, `queue variation`, `queue_token`, `queue stage log`, `queue planning`,
   `queue studio pairing`, `studioinvitation`, `live assignment`, `arena participant`,
   `participantsproduct`, `participantjourneyproduct`, `participant mode checklist`,
   `participantvideoask`, `arenavideoask`, `modes`, `delivery forms`, `formsByClient`).
   `users_roles` and `journey` use `id` instead of `docid`; `profile_data` uses `profileid`
   (and many writers also set `docid`). The board reads `idField: 'docid'`/`'id'` AND also reads
   the field off the doc body, so when you `db.collection(c).doc(X)` you MUST also `set({ docid: X })`.
   When the seeder lets Firestore auto-id, capture `ref.id` and write it back into `docid`/`id`.

2. **`queueref` is a DocumentReference, never a string.** Every queue-scoped collection points back
   to the queue with `queueref = doc('queue generation', <queueGenDocId>)`. The board's core token
   stream is `where("queueref","==", doc("queue generation", selectedQueue.docid))` + `orderBy("logdate","asc")`
   (`dynamic-queue-manager-clone.component.ts:1826`), and the variation stream is the same `queueref` ==
   filter (`:1814`). A string queueref returns ZERO rows and the board renders empty.

3. **`tokenstatus` must be the exact string `"Active"`.** The board buckets tokens with
   `e['tokenstatus'] === "Active"` (note the capital A; `:1935/1950/1964/1977`) AND
   `[null, undefined, false].includes(e['delete'])`. The "Unattended Participants" lane uses
   `tokenstatus === "inActive"` (`:1994`). Any other casing/value → the token is invisible on the board.
   (`queue_token` and `queue stage log` both carry `tokenstatus`; schema token is `<redacted>` only because
   the key name matches the PII regex — it is a plain status string, set it to `"Active"`.)

4. **Queue-variation `queueref` + docid==token.variationid.** The board fetches a token's atc model with
   `getDoc(doc("queue variation", token['variationid']))` (`:2991`). Therefore each `queue variation`
   doc's id MUST equal the `variationid` written onto its participants' tokens. Seed variation docs as
   `doc('queue variation', <variationId>)` and stamp the same id into `queue_token.variationid`.
   (Current seeder prefixes with testrunid on BOTH sides, which is internally consistent — keep them equal.)

5. **`queueid` (string) vs `queueref` (ref) are BOTH used, by different collections.**
   `live assignment`, `arena participant`, `queuereminder` filter by `queueid == selectedQueue.docid`
   (a plain string, `:4660`, `dynamic-studio:412/516/886`). The queue-token/variation/studio-pairing/
   studioinvitation families filter by the `queueref` DocumentReference. Seed the matching shape per
   collection (see each section) — do not substitute one for the other.

6. **Two Firestore databases.** Almost everything is in the default DB `(default)`. The two forms
   collections live in the **named** database `firestore-forms`, reached in-app via
   `getFirestore("firestore-forms")` (`dynamic-studio.component.ts:758,1652`). The emulator must run a
   second database id `firestore-forms`; the seeder must obtain that handle separately
   (`admin.firestore(app, 'firestore-forms')` — note: named-DB support requires firebase-admin ≥ 11.x).

7. **Composite indexes** (already in `firestore.indexes.json`; required or queries throw
   FAILED_PRECONDITION on the cloud project and the emulator with `--import`): see §C.

8. **Test markers.** Every seeded doc also carries `testrunid: <id>` and `_testdata: true`
   (added by `fake-data.makeDoc` / the seeder's `TAG`). Not part of the prod schema; used for teardown.

---

## A. Already-seeded collections (in `seed-test-project.js` today)

These are written by the current seeder; listed for completeness + the exact required fields the app reads.
The seeder currently writes a MINIMAL subset of each — the "required for the app" column is what the board
actually depends on.

### `queue generation`  — db `(default)`
The queue itself. 40 top-level fields in prod; the board needs only a handful.
Required for the board to select + render the queue:

| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id (§0.1) |
| `queuename` | `<string>` | board lists/orders by it; index `queueadmin CONTAINS + queuename ASC` (§C) |
| `queueadmin` | `[<string>]` | operator **profileids** (`profile_ref.id`, NOT auth uids — prod creation form stores `profile.id`, queue-creation-v3 html:62); board query is `where("queueadmin","array-contains", this.profileid)` (`:1546`) — but ONLY in the `else` branch: `if (roles.ah` / `roles.admin)` users skip the filter and see ALL queues (`:1543`), so the queueadmin value never gates an admin |
| `queuementor` | `[<string>]` | mentor profileids (`profile_ref.id`, same convention; queue-creation-v3 html:44) |
| `stages` | `[<string>]` | the 30 stage names (config order) |
| `stageproperty` | map keyed by **stage name** → per-stage props | see note below |
| `queuevariation` | `[<ref:queue variation>]` | array of refs to the variation docs |
| `queuestartdate`,`queueenddate` | `<timestamp>` | board filters `live` queues by start<=now<=end (`:1555`) — seed start in past, end in future |
| `lastregistrationdate` | `<timestamp>` | future |
| `zoomlinkrequired`,`enablezoommeetingsdk`,`showsnippet` | `<boolean>` | |
| `created`,`modified` | `<timestamp>` | |
| `delete` | `<boolean>` | seed `false` |

`stageproperty[<stageName>]` per-stage shape (≈30 keys; see the big block in the JSON, lines 43–2150):
`actiontype <string|null>`, `selfmovable <boolean>`, `calltoaction <string|null>`,
`nextstage [{stage,markascompleted,calltoaction}]` (operator buttons — drives the flow graph),
`actionresource <ref:delivery forms> | [<ref:arenavideoask>] | <string> | null`,
`studiowidgets [<string>]`, `compulsoryactivity {<idx>:[…]}`, `transferactivity {<formId>:<string>}`,
`participantform <redacted>`, `stagegroup <string|null>`, `implementationstages [<string>]`,
`maxwatingminutes/minwatingminutes <number|null>`, `messageheader/stagemessage/stageexplanation`,
`cwstage/cwcalltoaction/consultationstage/consultationcalltoaction/nextcalltoaction <string|null>`.
The seeder copies this verbatim from `sample-queue-config.json` (the exact L3rqCr 30-stage / 9-variation
config) — do not hand-author it. `flow-model.js` reads `nextstage` + variation `stages` to build the graph.

### `queue variation`  — db `(default)`  · only 4 fields
| field | type | notes |
|---|---|---|
| `variationname` | `<string>` | e.g. "LYL - First Cycle" |
| `queueref` | `<ref:queue generation>` | **must be a ref** (§0.2); board filters on it (`:1814`) |
| `stages` | `[<string>]` | the variation's ordered stage subset (13–24 stages; see config) |
| `atcmodel` | `<string>` | nullable; board reads it via `getDoc(variation)` (`:2994`) |

Plus `docid` (§0.1) = the variation id, which MUST equal `queue_token.variationid` (§0.4).
Example (LYL - First Cycle): `{docid:"K9PRd4PfWDWtaO0vSxy3", variationname:"LYL - First Cycle",
queueref: <ref queue generation/L3rqCr>, stages:["Evolution Prep Orientation", …17 stages], atcmodel:null}`.
The 9 variation ids/names are fixed in `sample-queue-config.json.queuevariation` (LYL First/Next,
B!G Next, Prodigies First/Next, uP! First/Next/3rd, uP! Prep-Hold).

### `queue_token`  — db `(default)`  · 44 fields (participant state — the heart of the board)
Required-for-board subset (everything else may be null/omitted; the CF fills the rest as it advances):

| field | type | required value | notes |
|---|---|---|---|
| `docid` | `<string>` | self-id | §0.1 |
| `profile_id` | `<string>` | participant profileid | board groups stage-log by it; index profile_id+createdon (§C) |
| `profile_name` | `<string>` | display name | shown on the card |
| `queueref` | `<ref:queue generation>` | ref to the queue | §0.2; primary board filter (`:1826`) |
| `variationid` | `<string>` | == a `queue variation` docid | §0.4 |
| `currentstage` | `<string>` | a stage name in the variation | board buckets by `currentstage == stage` (`:1935`) |
| `previousstage` | `<string\|null>` | | |
| `tokenstatus` | `<string>` | **`"Active"`** | §0.3 (or `"inActive"` for Unattended lane) |
| `delete` | `<boolean>` | `false` | §0.3 (`[null,undefined,false]` accepted) |
| `status` | `<string\|null>` | `null`/`"queued"`/`"ready"`/`"invited"`/`"instudio"` | sub-bucket within a stage (`:1950/1964`) |
| `stagestatus` | `<string>` | e.g. "Yet to Start" | |
| `logdate` | `<timestamp>` | set | board `orderBy("logdate","asc")` — REQUIRED (index, §C) |
| `createdon` | `<timestamp>` | set | |
| `queueposition` | `<number>` | 1-based | ordering |
| `tokennumber` | `<string>` | | (schema marks it `<redacted>` by name; it is a number-ish id) |
| `people_involved` | `[<empty>]` | `[]` | |
| `liveassignmentid` | `<string\|null>` | `null` until studio | `!=null` puts token in the "in studio" sub-bucket (`:1977`) |
| `productref` | `<ref:products>` | optional | |
| `formref` | `<ref:formsByClient>` | optional | form submission link (named DB) |
| `updatedAt` | `<timestamp>` | set | |
| `manuallymoved` | `<boolean>` | `false` | |

Rich optional maps the CF may populate (seed absent or `{}`): `selectedstageslot{<stage>:{…slot…}}`,
`preassigned{<stage>:[…]}`, `notesList[{text,updatedon,author,stage}]`, `transferredto/transferredfrom
<ref:queue generation>`, `deliveryRef <ref:deliverables>`, `arenaid/studioid <null>`,
`participantproductid <string>`.

### `queue stage log`  — db `(default)`  · 40 fields  (CF-written audit trail)
**SEEDER MUST NOT pre-write rows here** beyond at most an initial baseline — this is the collection the
**CF writes** on every stage move, and the anti-circularity invariant reads it as APP OUTPUT (a row the CF
created), never a value the test wrote. Schema mirrors `queue_token` plus log-specific fields:
`logdocid <string>`, `movedby <string>`, `movedthrough <string>`, `createdAttempt <number>`,
`currentstage/previousstage <string>`, `profile_id`, `queueref <ref>`, `logdate <timestamp>`,
`tokenstatus`, `selectedstageslot{…}`. Index: `profile_id ASC + createdon ASC` (§C).

### `profile_data`  — db `(default)`  · 17 fields (login + identity)
Required for login + route guard: `profileid <string>` (doc id), `email <string>` (lowercased — login
looks up by email), `name <string>`, `number <string>` (non-null — login requires it), `countrycode
<string>`, `role_ref <ref:users_roles>`, `user_ref <ref:user_data|null>`. Optional: `enable <boolean>`,
`testuser <boolean>`, `participantmode <string>`, `created/last_login/recentpurchasedate <timestamp>`,
`profileimg <string>`, `address/dateofbirth/profile`.

### `participantsproduct`  — db `(default)`  · 25 fields (what product/mode the participant is in)
Queried by `profileid == X && mode=='Event Mode' && status=='ongoing'` (`QueueWebVerison1:123`). Seed:
`docid`, `profileid <string>`, `productref <ref:products>`, `mode <string\|null>`, `status <string>`
(`"ongoing"`), `queuevariationid <string>` (== variation id; set by initiate-event-product `:517`),
`packageref <ref:package>`, `eventref <ref:event collection>`, `arenaeventid/eventparticipationid
<string>`, `deliverymode/deliverytype/deliveryplanning <string>`, `subscriptionstart/end <timestamp>`,
`statusdate{<modeName>:<timestamp>}` map, `sequenceorder <number>`, `unlimited <boolean>`.

### `participantjourneyproduct`  — db `(default)`  · 31 fields (journey purchase record)
Index: `profileid ASC + subscriptionstart DESC` (§C). Seed: `docid`, `profileid <string>`,
`journeyref <ref:journey>`, `journeystatus <string>`, `journeytype <string>`, `purchaseref
<ref:journeyproductpurchase>`, `productref [<ref:products>]`, `purchasedate/subscriptionstart/end
<timestamp>`, `onboarded <boolean>`, `orientationstatus <string>`, `salesperson <string>`,
`salesleadsref <ref:salesleads>`, `paymentplan <string>`. Rich optional: `onboardingreportlog[{updated,
report}]`, `onboardedby [<ref:profile_data>]`, `opportunities/generalnotes [<empty>]`.

### `user_data`  — db `(default)`  · 3 fields
`name <string>`, `email <string>`, `number <string>`. Doc id = the Auth uid. Target of
`profile_data.user_ref`.

### `users_roles`  — db `(default)`  · 15 fields (authorization)
Boolean role flags + back-ref. `id <string>` (self-id), `name <string>`, `profile_ref <ref:profile_data>`,
and boolean flags: `admin`, `participant`, `eventcoordinator`, `changeagent`, `transcriber`,
`supportdesk`, `chatxadmin`, `eitfellowship`, `eitcoordinator`, `verifier`, `eitapprentice`, `ahmember`.
Set the needed flags `true` (seeder sets `admin`/`eventcoordinator`/`changeagent` per staff kind).

### `dashboard`  — db `(default)`  · 8 fields (route-config / sidenav + access)
Grants a route to roles + profileids so the staff actor passes the route guard. Fields: `label <string>`,
`route <string\|null>`, `icon <string>`, `showInSidenav <boolean>`, `order <number>`, `roles [<string>]`,
`profileid [<string>]`, `children [{route,label,roles,icon,showInSidenav,profileid,favourites}]`.
Seed one doc per driven route (see `DRIVEN_ROUTES` in the seeder) with `roles` = all staff roles and
`profileid` = all staff profileids.

---

## B. NOT-YET-SEEDED collections (the seeder expansion target)

The current seeder stops after queue + tokens + auth. The CF transitions and the studio/arena flows need
these. Grouped by the flow that consumes them.

### `queue planning`  — db `(default)`  · 9 fields  (slot/segment plan per variation)
Consumed when a variation uses planned slots (`queue_token.selectedstageslot` references a `queueplanid`).
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `queueid` | `<string>` | queue docid (string) |
| `queueref` | `<ref:queue generation>` | ref (§0.2) |
| `variationlist` | `[<string>]` | variation ids covered |
| `segmentlist` | `[<string>]` | segment ids |
| `planning` | `[{variationid:<string>, segments:[{slots,segmentid,stagecohort}]}]` | the plan per variation; `<deep>` inner = opaque |
| `slotinterest` | `[<string>]` | |
| `createdAt`,`updatedAt` | `<timestamp>` | |

Example: `{docid:"plan1", queueid:"<L3rqCr>", queueref:<ref>, variationlist:["K9PRd4…"],
segmentlist:["seg1"], planning:[{variationid:"K9PRd4…", segments:[{segmentid:"seg1", slots:{}, stagecohort:{}}]}],
slotinterest:[]}`. Only required for variations whose stages carry `queueplanningslots:true` slots; the
simple LYL-first-cycle walk does not need it. Seed minimally per variation under test.

### `queue studio pairing`  — db `(default)`  · 10 fields  (a live studio room)
Board reads it (`where("queueref","==",ref)`, `:1752`) and filters `studioin==true && checkin==true` (`:1753`);
studio reads `where("studioin","==",true)` + `queueref` (`dynamic-studio:456`) and
`where("participants","array-contains", profileid)` (`:395`).
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `queueref` | `<ref:queue generation>` | ref (§0.2) |
| `participants` | `[<string>]` (redacted by name) | profileids in the room — `array-contains` queried |
| `participantsactivity` | map (redacted) | per-participant activity |
| `studioin` | `<boolean>` | **`true`** to surface on board (`:1753`) |
| `checkin` | `<boolean>` | **`true`** to surface on board |
| `openvidu` | `<boolean>` | video backend flag |
| `status` | `<string\|null>` | |
| `atcmodel` | `[<string>]` | |
| `created` | `<timestamp>` | |

### `studioinvitation`  — db `(default)`  · 19 fields  (invite a participant/specialist into a studio)
Studio queries: `type=="stagegrouping" && status=="pending" && invitedstudio array-contains-any […]`
(`dynamic-studio:484`); `specialistpairing array-contains profileid && queueref==ref && studioid in […]
&& expirydate>=now` (`:546`); `tokenref==doc('queue_token',id) && expirydate>=now` (`:974`).
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id (`doc(collection('studioinvitation')).id`, `:981`) |
| `studioid` | `<string>` | the room id |
| `queueref` | `<ref:queue generation>` | ref (§0.2) |
| `tokenref` | `<ref:queue_token>` | (redacted by name) ref to the invited participant's token |
| `profileid` | `<string>` | invited participant |
| `participantname` | `<string>` | display |
| `type` | `<string>` | e.g. `"stagegrouping"` |
| `status` | `<string>` | enum `"pending"` → `"success"`/`"cancelled"` (`:921/937/962`) |
| `stage` | `<string>` | stage name |
| `invitedstudio` | `[<string>]` | studio ids — `array-contains-any` queried |
| `mandatorystudio`,`optionalstudio`,`deniedstudio` | `[<string>]` | |
| `acceptedstudio` | `[<empty>]` | |
| `specialistpairing` | `[<string>]` | specialist profileids — `array-contains` queried |
| `clientresponse` | `<null>` | board filters `clientresponse==null` for active (`:1770`) |
| `createddate`,`expirydate` | `<timestamp>` | **expirydate must be in the FUTURE** (`expirydate>=now` filters) |
| `createdby` | `<string>` | |

### `live assignment`  — db `(default)`  · 19 fields  (the live studio session record; HUGE zoom map)
Queried by `queueid` (**string** ==, `:4660`), `status` (`"live"`/`"completed"`), `bonusactivityparticipant
array-contains profileid` (`dynamic-studio:412`), `studioid in […]` (`:516`),
`stagename in [mandatory+optional] && status=="completed"` (`:886`).
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id (`doc(collection('live assignment')).id`, `:1095`) |
| `queueid` | `<string>` | **plain string** = queue docid (§0.5) — NOT a ref |
| `studioid` | `<string>` | room id |
| `stagename` | `<string>` | (redacted by name) stage |
| `stagetype` | `<string>` | |
| `status` | `<string>` | enum `"live"`/`"completed"`/`"instudio"` |
| `participantid` | `<string>` | (redacted) |
| `participantsactivity` | map (redacted) | |
| `bonusactivity` | `<null>` | |
| `bonusactivityparticipant` | `[<string>]` | (redacted) profileids — `array-contains` queried |
| `pairing` | `[<string>]` | profileids paired |
| `shadowperson` | `[<empty>]` | |
| `changeworkbrief` | `[<string>]` | |
| `groupid` | `<string>` | (redacted) |
| `zoomlinkrequired` | `<boolean>` | |
| `signature` | `<string>` | (redacted) |
| `zoomdata` | large nested map | full Zoom meeting object: `{settings:{…40+ keys…}, join_url, start_url, id<number>, uuid, password, topic, status, …}`. With `iscommunicationsdisabled:true`/no real Zoom in test, seed a minimal stub or `{}` — nothing in the board reads individual zoom keys for the assertions. |
| `created`,`updated` | `<timestamp>` | |

### `arena participant`  — db `(default)`  · 8 fields  (a participant's live-arena enrolment/role)
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `queueid` | `<string>` | **string** = queue docid (§0.5) |
| `profileid` | `<string>` | |
| `pairingmode` | `<string>` | |
| `stagerole` | `[<string>]` | roles the participant can take |
| `liveassignmentstatus` | `<string>` | |
| `status` | `<string>` | |
| `tentativenextready` | `<null>` | |

### `participant mode checklist`  — db `(default)`  · 8 fields  (per-mode widget checklist)
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `profileid` | `<string>` | |
| `mode` | `<string>` | a mode name (see `modes`) |
| `aelid` | `<string>` | |
| `participantproductid` | `<string>` | (redacted) |
| `productref` | `<ref:products>` | |
| `createddate` | `<timestamp>` | |
| `widget` | `[{widgetid,title<string>, mandatory<boolean>, reference:[<ref:solar voice playlist>], dos:[],donts:[], result/completed/completedcontent/status:<null>}]` | the checklist items |

### `participantvideoask`  — db `(default)`  · 16 fields  (participant's uploaded video answer)
Queried by `profileid == X` (`big-profile:125`).
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `profileid` | `<string>` | |
| `videoaskid` | `<string>` | which arenavideoask it answers |
| `filename` | `<string>` (redacted) | |
| `filetype`,`mediatype` | `<string>` | |
| `fileurl` | `<string>` | |
| `created` | `<string>` | (note: a string, not Timestamp, in prod) |
| `uploaded` | `<timestamp>` | |
| `convertedtohls`,`addtohighlights` | `<boolean>` | |
| `workshopref` | `<ref:eiflix workshop>` | |
| `arenaevent` | `<ref:event collection>` | |
| `tags`,`watchedby` | `[<string>]` | |
| `hls` | large nested map (Streamable-style: `url_embed,url_stream,duration<number>,id,…`) | seed `{}` or stub — not asserted |

### `arenavideoask`  — db `(default)`  · 8 fields  (the video-ask QUESTION template)
Queried by `orderBy('title')` (`queue-creation-v3:393`); the "Video Ask" stage references it via
`stageproperty.actionresource = [<ref:arenavideoask>]`.
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `title` | `<string>` | orderBy key |
| `description` | `<string>` | |
| `questiontype` | `<string>` | |
| `questionurl` | `<string>` | |
| `eventref` | `<ref:event collection>` | |
| `active` | `<boolean>` | seed `true` |
| `createddate` | `<timestamp>` | |

### `modes`  — db `(default)`  · 4 fields  (the ordered mode list)
Read with `orderBy('sequence','asc')` (`journeycoach-dashboard:2621`, `mode-dashboard:128`).
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `mode` | `<string>` | mode name |
| `sequence` | `<number>` | ordering — REQUIRED for the orderBy |
| `info` | `<null>` | |

### `journey`  — db `(default)`  · 11 fields  (the journey catalog entry)
Read with `orderBy('sequence','asc')` (`addjourney:75`); `participantjourneyproduct.journeyref` points here.
| field | type | notes |
|---|---|---|
| `id` | `<string>` | self-id (uses `id`, not `docid`) |
| `journey` | `<string>` | journey name |
| `type` | `<string>` | |
| `sequence` | `<number>` | ordering |
| `originalfee` | `<number>` | |
| `atcmodel` | `<string>` | |
| `updatedAt` | `<timestamp>` | |
| `journeyupgrades`,`extras`,`addonproducts` | `[<empty>]` | |
| `playlist` | `<null>` | |

### `delivery forms`  — db **`firestore-forms`**  · 7 fields  (a FORM TEMPLATE)
Lives in the named DB (§0.6). Stage `actionresource <ref:delivery forms>` points here; the form a
participant fills at a "…Form" stage. The variation under test only needs the templates its stages
reference (each stageproperty `actionresource` ref).
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `formname` | `<string>` (redacted) | |
| `formdescription` | `<string>` | |
| `formtype`,`formfor` | `<string>` | |
| `formarray` | `[{fieldname<string>, type<string>, required<boolean>, options:[], maxitems<null>, maxcount/mincount/flipping<boolean>, array:[], fielddescription/fieldnotes<null>}]` | the field definitions |
| `delete` | `<boolean>` | seed `false` |

### `formsByClient`  — db **`firestore-forms`**  · 12 fields  (a SUBMITTED form instance)
Named DB (§0.6). This is what the participant app writes on form submit, and `queue_token.formref
<ref:formsByClient>` / `queue stage log.formref` point to it. The CF self-move on a form stage is driven by
a write here — so a SEED of this is only a precondition; the assertion reads the resulting token/log move
(anti-circularity §the brief).
| field | type | notes |
|---|---|---|
| `docid` | `<string>` | self-id |
| `formid` | `<string>` | the `delivery forms` template id this answers |
| `profileid` | `<string>` | submitter |
| `loginid` | `<string>` | |
| `submittedin` | `<string>` | |
| `formname` | `<string>` (redacted) | |
| `formarray` | `[{fieldname,type,required,fielddescription, options:[], array:[], maxcount/mincount/flipping<boolean>}]` | submitted field values |
| `stagename` | `<string>` (redacted) | the stage submitted at |
| `queueref` | `<ref:queue generation>` | ref (§0.2) — but in the named DB, the ref resolves within `firestore-forms` |
| `queuetokenref` | `<ref:queue_token>` (redacted) | back-ref to the token |
| `workshopref` | `<ref:eiflix workshop>` | |
| `date` | `<timestamp>` | |

> NAMED-DB REF CAVEAT: `formsByClient.queueref`/`queuetokenref` are DocumentReferences created with the
> `firestore-forms` handle. A ref created from one DB handle points within THAT database. The app reads
> these only for `.path` comparison, so a same-named-DB ref is fine for the seed; do not try to make a
> cross-database ref.

---

## C. Composite index requirements

From `firestore.indexes.json` (must be loaded into the emulator and exist on the cloud test project, or
the queries throw `FAILED_PRECONDITION`):

| collectionGroup | fields | who needs it |
|---|---|---|
| `queue_token` | `queueref ASC, logdate ASC` | board token stream (`:1826`) — **the** core query |
| `queue generation` | `queueadmin CONTAINS, queuename ASC` | board queue-picker (`:1546`) |
| `queue stage log` | `profile_id ASC, createdon ASC` | per-participant history read |
| `participantjourneyproduct` | `profileid ASC, subscriptionstart DESC` | latest-journey lookup |
| `appointments` | `attended ASC, starttime DESC` | (peripheral; pre-existing) |

Any NEW seeded query the specs add (e.g. compound filters on `studioinvitation`, `live assignment`) that
mix an equality + an inequality/orderBy will need its own composite index added here before it will run.
`array-contains` + equality combos (e.g. `studioinvitation.invitedstudio array-contains-any + status` ) may
also require indexes — add as the verify gate surfaces FAILED_PRECONDITION.

---

## D. Seeding order (referential integrity)

Write in this dependency order so refs resolve:
1. `user_data`, `users_roles`, `profile_data` (auth chain) + Auth users.
2. `dashboard` (route grants).
3. `journey`, `modes`, `delivery forms` (firestore-forms), `arenavideoask` (reference data, no deps).
4. `queue generation` (needs the variation refs → create variation docs first or two-pass).
5. `queue variation` (needs `queueref` → the queue gen doc).  (Seeder does queue+variation two-pass today.)
6. `participantsproduct`, `participantjourneyproduct`, `participant mode checklist`, `participantvideoask`
   (per participant; need `profile_data`, `journey`, `products`).
7. `queue_token` (needs `queueref` + `variationid` == a variation docid + `profile_id`).
8. Studio/arena flow (seed only as preconditions; the CF/app produces the asserted output):
   `queue studio pairing`, `studioinvitation`, `live assignment`, `arena participant`, `formsByClient`.
9. NEVER pre-seed `queue stage log` rows you intend to assert — the CF must write them.

> `<ref:products>`, `<ref:package>`, `<ref:event collection>`, `<ref:eiflix workshop>`,
> `<ref:solar voice playlist>`, `<ref:journeyproductpurchase>`, `<ref:salesleads>`, `<ref:deliverables>`
> are out-of-scope reference collections. `firestore-seed.json` already seeds `products`, `package`,
> `journey`, `event collection`, `deliverables`, `solar voice playlist`, etc. for the emulator — point the
> refs at those seeded ids, or at a harmless placeholder doc when the value is never read.
