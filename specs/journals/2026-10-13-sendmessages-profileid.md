# 2026-10-13 — profileid added to every SendmessagesComponent payload

Operator: "add profileid in both mail and whatsapp … in many we use SendmessagesComponent, for all."

## What changed — 15 lines, 6 files, payloads only

Every object the screens build for `workshopprogressmessage` now carries `profileid`:

| Screen | Mail | WhatsApp (single) | WhatsApp (chunked) | profileid source |
|---|---|---|---|---|
| newusersprofile | ✓ | ✓ | ✓ | `participant['profileid']` |
| workshop-dashboard | ✓ | ✓ | ✓ | `participant['profileid']` |
| workshop-dashboardv2 | ✓ | ✓ | ✓ | `participant['profileid']` |
| engagement-dashboard | ✓ | ✓ | — | `p.profileid` |
| manage-recommended-playlist | ✓ | ✓ | — | `participant['profileid']` |
| participants-analytics | — | ✓ (dead `workshopmessage`) | ✓ | `metadata['profileid']` (the row is the participant-metadata doc) |

`newusers.component.ts` also imports SendmessagesComponent but only in commented-out code — nothing live.

## Why it is safe to send

`workshopprogressmessage` (starlabs-cloud-function `components/communication.js`) copies fields
explicitly: mail uses `email`/`name` for Postmark, WhatsApp maps each participant to
`{ whatsappNumber, customParams }` for WATI. `profileid` is ignored today and never reaches Postmark or
WATI. **It does nothing until the Cloud Function is changed to read it** — that function lives in the
cloud-function repo and was not touched.

## What could and could not be verified

- `ng build` EXIT=0; every replacement asserted to match exactly once; the diff is only these lines.
- No hub test asserts this payload (on the test project the function URL resolves to `''`), so nothing
  breaks — and nothing in CI proves it either.
- A live attempt on `/newusersprofile` showed its **SendmessagesComponent mail button is commented out**
  ("Old email composer — replaced by the EmailInputComponent flow"). On that screen mail goes through
  `EmailInputComponent`, which already records `profileid` per recipient; only WhatsApp uses
  SendmessagesComponent there. WhatsApp cannot be driven on the emulator (templates come from WATI).
  So the payload change is verified statically, not by a live send.

---

## Follow-up — the Cloud Function now skips delivery-on-hold profiles

Repo: `/Users/nanda/Documents/Development/cloud-function` (branch `nanda-development`), file
`functions/components/communication.js`, function `workshopprogressmessage`. **Not committed or
deployed** — the operator handles that.

- **At the start** (before mail/WhatsApp branch): one query, `profile_data where deliveryonhold == true`,
  doc ids pushed into `heldProfileIds` (operator's name), with a Set for lookups. One equality filter →
  single-field index, no composite needed.
- **Mail and WhatsApp** split their list into held / sendable. Held people get nothing. WhatsApp builds
  the WATI `receivers` from the sendable list only, and if nobody is left it returns before fetching the
  WATI token — no empty broadcast.
- **No profileid → sent as before.** Older callers cannot be checked; blocking them would silently stop
  messages for every screen not yet sending a profileid.
- **Lookup fails → nothing sent (500).** Fail-closed on purpose: messaging someone on hold is the worse
  mistake, and every screen already shows a "failed" toast on error.
- **Held are reported, not failed:** responses gain `heldCount` and `heldProfileIds`; `failureCount`
  excludes held people. Everyone-held returns 200 with a clear message, not the old 400.

**Verified by running the real handler** (not a copy) against a throwaway Firestore emulator
(`demo-hold`), with Postmark and axios replaced by recorders so nothing was sent — 9/9:
mixed mail skips the held person and still mails ok + a no-profileid caller; all-held mail sends
nothing (200); mixed WhatsApp broadcast contains only the non-held number and no `profileid` reaches
WATI; all-held WhatsApp never calls WATI; a failed hold lookup sends nothing (500).

**Front-end consequence (not changed):** the screens compare `successCount` to the number they sent, so
with held people the mail toast reads "Sent to X participants. Failed to send to 0." — accurate but
unclear. Showing `heldCount` ("N on delivery hold") in the toasts is a small follow-up.
