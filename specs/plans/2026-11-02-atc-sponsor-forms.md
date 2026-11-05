# 2026-11-02 — ATC sponsor forms + one forms query on View ATC

**Status:** agreed with the operator 2026-11-02 — waiting for "implement". The operator decides every requirement;
anything not written here is asked before it is built.

Replaces the parked idea `specs/plans/2026-10-29-atc-additional-forms-parked.md` for sponsors. Outside users are out
of scope (most sponsors are existing users).

## 1. ATC model config (web, `create-atcmodel`)
- "Filled by" gets a third option, **Sponsor**: `filledby: 'specialist' | 'participant' | 'sponsor'`.
- The config already refuses the same form twice, so each form has one row and one owner.

## 2. Specialist answers carry the specialist's profile id (web)
- View ATC **Fill form** / **Edit answer** links drop `profileid`. The form screen then saves the logged-in user's
  profile id (`initializeUserData`) on the answer and its draft.
- The answer viewer shows the name of the answer's own `profileid`.

## 3. View ATC — one forms query (web, `view-prescribed-atc`)
Run once the ATC's versions are known, on `firestore-forms · formsByClient`:

```
atcid in [ATC + all versions]
OR participantproductid == ATC participantproductid
OR (queueref == queue generation/{ATC queueid} AND profileid == ATC participant)
```
- A clause is used only when the ATC has that id. No `profileid` filter on the atcid / purchase clauses.
- **Queue clause matches the participant too (operator, 2026-11-02, during implementation):** a queue holds many
  participants, so without it Queue activities listed other participants' answers (caught by VATCA-03).
- Replaces the separate delivery and queue queries.
- Indexes: none needed (checked 2026-11-02 — no single-field exemptions on `formsByClient` / `atc_form_requests`
  in production or `starlabs-test`; no orderBy, rows are sorted on screen).

**Layout — Option A (operator):** the three parts stay.
- **Delivery activities** — answers matching `participantproductid`.
- **Queue activities** — answers matching `queueref`.
- **ATC forms** — answers matching `atcid`, put on their model-form row by `formid`. Three groups by the model config:
  Forms you fill · Forms the participant fills · {name} · Forms the sponsor fills · {name} (lock icon once locked).
  Who filled an answer comes from its `profileid` (participant = ATC `profileid`, sponsor = ATC `sponsorid`,
  specialist = the specialist's own id); specialist rows show "Filled by {name}".
- No de-duplication (operator rule): an answer that matches two clauses shows in both parts; two answers for one form
  both show.
- The collapsed "X of N forms submitted" tag is unchanged (reads `formsubmitted`).

**Requests listener:** `atc_form_requests where atcid in [ATC + all versions]` — the `profileid` filter is removed so
sponsor requests load.

## 4. Send to sponsor (web, View ATC)
- Sponsor rows: Not sent · Waiting for sponsor · Submitted · Waiting for update — Send, Withdraw, View answer, Ask to
  update (same as participant rows).
- **Send** opens a small dialog:
  - ATC `sponsorid` empty → search the sponsor in `participantList`; help text "You can change the sponsor until the
    first sponsor form is sent."
  - Sponsor locked → the name greyed out with a lock: "Locked: a form was already sent to {name}."
- The sponsor can be chosen or changed only while no sponsor request exists for this ATC and the sponsor has filled
  no form; after that it is locked. One sponsor per ATC.
- Send writes `atc_form_requests/{atcid}_{formid}`:
  `{atcid, formid, profileid: sponsor, participantid: ATC profileid, filledby: 'sponsor', product, sentby, sentat, formstatus: 'sent'}`
  and saves `sponsorid` on the ATC (Edit ATC copies all fields, so versions keep it).
- Participant Send writes `filledby: 'participant'` on its request.

## 5. Breakthroughs app (Flutter)
- Home "Forms to fill": the same filter (`profileid == me`, `formstatus == 'sent'`).
- A sponsor request's card gets a **Sponsor** tag and a **For {participant name}** line; the name is read once from
  `profile_data/{participantid}`.
- The answer's `filledby` comes from the request (`openAtcForm` metadata and `submitAtcForm`), not a fixed
  `participant`.
- Submit is otherwise unchanged (the `formsubmitted` transaction on the ATC).

## 6. Version chain on form submit (web `findCurrentAtc`, app `latestAtcVersionId`)
- No 20-version cap. Follow `upgradedto` until the version in use.
- A version seen twice (a loop) or an `upgradedto` that points nowhere → stop with
  "This ATC is corrupted — unable to find the stable version."
- A removed ATC keeps "This ATC was removed, so the form wasn't saved."

## 7. Tests (emulator only) and docs
- Hub seed: a sponsor, an ATC with versions, answers by participant / specialist / sponsor, negative controls (the
  sponsor's own unrelated answer, another participant's answer).
- Hub specs: sponsor send + lock, groups and who filled, the specialist answer's profile id, the single query's
  placement, the corrupted-chain message. Unit specs: model config, View ATC rows.
- Flutter: the sponsor card and a submit carrying `filledby: 'sponsor'`.
- Journal + PROGRESS at the end.

## Not covered (decided)
- Production Firestore rules — left as they are (operator).
- Outside users without an account.
