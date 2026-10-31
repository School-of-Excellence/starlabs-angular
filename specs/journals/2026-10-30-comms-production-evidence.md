# 2026-10-30 — Comms problems checked against production records

**Asked:** link the 11 problems in the Comms Hub prototype to real communications, and say how Comms v2 answers each. Operator scoped the evidence to email, WATI and app notifications in production; Slack was excluded.

**Method:** read-only Firestore `runQuery` / `runAggregationQuery` on `fir-sample-aae4a` with the operator's gcloud login. Window 1–30 Oct 2026: 2,606 `email archive`, 372 `wati archive`, 4,621 `notificationrecord`. "Participant" means the profile has a `participant metadata` doc. The local copy of the records was deleted after analysis. No production writes.

## What surprised us
- **Pause is honoured on logged routes.** 31 profiles on hold, 0 logged messages after the hold was set. The real leak is that hold is separate from status: 577 of 577 discontinued and 23 of 24 banned participants were still targeted, mostly by `ahupdate`.
- **"Never retried" is too strong.** All 4 `schedule_failed` broadcasts on 3 Oct were resent within 24 hours. There is still no retry link or field, and failed app alerts usually get no follow-up on another channel.
- **The Postmark suppressions are not unsubscribes.** 249 suppressions: 244 hard bounce, 5 spam, 0 manual.
- **Broadcasts over 1,000 do break, but not in October.** October's largest was 627 numbers. All-time, 6 broadcasts exceeded 1,000: on 17 Sep, 1,631 numbers gave 385 accepted and 1,010 failed; three 2,808-number broadcasts on 9–10 Sep have no results and never left `scheduled` / `created`. `batchCount > 1` is 0 all-time, so none was split.
- **All-history check (Aug 2023 – 30 Oct 2026, every record):** 0 logged messages after a hold; 2,713 of 4,724 appointment reminder series have a duplicate, every month since Feb 2026; 24% of app notification targets failed; 17,751 WATI numbers went through `test`-named templates. Customer status is today's value, so status counts can include messages sent before someone was discontinued or banned.
- **`wati logs` stops on 13 Aug 2025**, although `watiResponseCapture` still writes to it. WATI results since then are "accepted by WATI", not delivered. Not yet checked in WATI's webhook settings.
- **Appointment reminders do duplicate.** 305 pairs with the same recipients within 10 minutes, across 306 of 309 appointment series.

## Gotchas for the next probe
- `date` and `time` are Firestore timestamps. Filter with `timestampValue`; a string filter silently returns 0.
- `wati archive.numbers` are mostly 10 digits, `sent` adds the country code. Compare on the last 10 digits.
- Exclude `supportticket` when measuring participant load: those alerts go to staff and dominate the top recipients.
- Staff who also hold participant profiles can't be separated, so use median and p90, not max.

## Gaps left in Comms v2 (prototype, not wired to the backend)
No retry or flag owner, no log for calls or Slack directives, no 48-hour clash check, no phone validation, no unsubscribe link, and only `active` / `non active` statuses. Weekly limits only alert; the only rule that holds messages is 5 a day. Group chat pushes, about half of participant volume, don't appear to count toward limits.

## 2026-10-31: scenarios replayed through the v2 rule code
Operator asked to recreate the scenarios from live data. One real case per problem went through the real `planLimits`, `applyPrefs`, `tplStatus`, `evalGroup`, `frequencyItems` and `manualItems`, loaded in a Node sandbox. Page: https://claude.ai/artifact/L7mxuPEfUvX6Y5dNjN9jD6. Local records deleted afterwards; no production writes; Comms v2 not edited.

**Score changed:** 1 fixed by design (2), 7 partly (1, 4, 5, 6, 7, 8, 11), 1 not fixed (9), 1 can't be tested (3), 1 didn't reproduce (10). This replaces the 3 / 7 / 1 above.

**Validation (operator asked to check the data):** problems 1, 2, 5, 6, 7 and 11 were recounted by a separate query route (ARRAY_CONTAINS or equality per case) and matched. Private check sheet sent to the operator with record links, sender names and categories; not published.

**Where senders and categories live:** `createdby` → `profile_data.name`; `role_ref` → `users_roles` (boolean role flags, no team name); email category and subcategory on the template via `templatedocid`; WhatsApp `watiCategory` → the `categories` array on `classify/waticategories` (first seen in this pull 4 Sep, 333 of 610 sends since 1 Sep unlabelled). `notificationrecord` has no sender: 0 of 9,705. `communicationhold` on sends lists held people removed, which supports hold working.
- **Problem 5 moved down.** `tplStatus` is right, but `frequencyItems` takes no template status, so "messages will not go out" is only wording in the prototype. Real case: `appointment-scheduled` unvalidated for 180 days and still sending.
- **Problem 10 didn't reproduce.** Staff labelled the 534-number `test_confirmation_update` send Interim Report; 7 of 9 test-named sends since 1 Sep carry that label. The 20 sends labelled test reached 26 numbers, 4 at most. The all-history "17,751 via test-named templates" figure above is name-only and overstates this. The real issue is template naming.
- **Problem 8: phone validation is not the main fix.** On the 17 Sep broadcast only 11 of 1,631 numbers are under 10 digits. The record gives no failure reason.
- **New gap:** `manualItems` with a hand-picked list ignores both hold and status. A held person stays in the audience; only saved segments filter them.
- **Correction:** v2 has a Phone call channel, so a call can be planned. What's missing is a log for unplanned calls and Slack instructions.

**Gotcha:** treating support-ticket recipients as staff is strict and drops real participants (venue-fee group: 131 people with it, 293 without). Fine for choosing a case; state which filter a count uses.

**Operator validation so far:** problem 5 confirmed (`templatevalidated: false` means unapproved). Problem 10 confirmed (the labels match the templates). The operator then asked me to settle problems 7 and 9 from the logs in the database.

**Log checks (all read-only):**
- **App failures were misread.** "24% of app targets failed" is mostly people the app can't reach, not send errors. Excluding group chat and support alerts: 283,210 of 625,300 failed; stored reasons (since Dec 2025) are led by no active FCM token (119,135) and no app account (44,081). On 29 Oct: 2,510 no token, 994 no account, 4 real errors. The fix is another channel, not a retry.
- **Support alerts have a separate issue.** Their failure reasons include 20,607 missing-authentication and about 7,000 invalid APNs credential errors. Dates not checked; worth a look.
- **Suppression doesn't stop mail.** My "Postmark blocks it" claim was wrong: 702 deliveries after suppression to 31 of 104 people, 416 to the same address. The 3 linked spam-complaint people got 4, 12 and 13. Cause unknown (lifted suppression or another stream).
- **Problem 7 classification (my judgement, from wording and timing):** 5,866 October venue-fee messages to 286 participants: 1,483 first, 404 identical within 10 minutes (all `venue_fee_reminder_v3`), 573 same-day, 3,406 later days. `workshoppaymentlog` has only 30 records, so who had paid is unknown.
- **Problem 9:** the three 9–10 Sep broadcasts have no accepted numbers, `sentAt` or message id, and no same-content or same-label send reached those numbers within 7 days. `pending` proves nothing: 270 `sent` records also keep it filled. `wati logs` ends 13 Aug 2025, so only WATI can prove they never went out.

**Names:** the operator asked for participant and sender names on the replay page. I held them back while it was open to anyone with the link; the operator made it private, I confirmed that from the publish result, and the names went on. The page holds 12,680 rows with no phone numbers, email addresses or profile ids. Don't re-share that link without removing them.

## 2026-10-31: How it works problems, tested as written
New tab on the replay page (`#how`): the 11 problems word for word from the Hub's How it works tab, tested against full production history. Result: 1 fixed by design (2), 6 partly (1, 4, 5, 7, 8, 11), 1 not fixed (9), 1 can't be tested (3), 2 didn't reproduce (6, 10).
- **"32 WhatsApp, 25 group, 8 appointment" holds:** 13 participants pass all three within 30 days and none within 7, so the original sample covered more than a week.
- **"1-hour reminders sent twice" holds:** 2,714 of 4,725 series, and 2,688 of 2,723 repeats came about 5 minutes later, which points to the 5-minute schedule.
- **"No country code" doesn't hold on the main route:** 90% of 10-digit numbers were accepted because the send adds the code. 560 of 649 numbers with 8–9 digits weren't. Direct queue sends leave no record.
- **"Big broadcasts cut off" is mixed:** of 6 over 1,000 numbers, 2 mostly worked, 1 was mostly lost and 3 show no result.
- **Hub features missing from v2:** flag owners, the desk, the 48-hour clash check. v2 is weaker than the Hub on problems 3, 4 and 9.
- **Unsubscribe:** 0 of 492 email templates mention it; no profile has the field set; no incoming WhatsApp message is simply "stop" (exact match only, logs end Aug 2025).

**Suggested fixes:** the How it works tab now has a suggested Comms v2 fix per problem, with an order: fix first 1, 5, 7, 9, 11; next 2, 3, 4, 8; later 6, 10. Suggestions only; Comms v2 is unchanged, per the 2026-10-22 planning-only directive.

## Pending
Check the 9–10 Sep broadcasts in WATI. Check why `wati logs` stopped. Campaign and backend-trigger work stays planning-only per the 2026-10-22 directive.
