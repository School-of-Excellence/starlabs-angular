# Delivery hold — starlabs-cloud-function

**Repo:** `/Users/macbook/Projects/Functions/starlabs-cloud-function`
**Rule:** `profile_data.deliveryonhold === true` ⇒ skip that profile. Store nothing, log to console.
**All 4 edits are in `functions/components/communication.js`.**

| # | Function | Line | Edit | Watch out |
|---|---|---|---|---|
| 1 | `sendBatchEmailArchive` | 1858 | Add `profile_data.where('deliveryonhold','==',true)` → Set near L1890. In the loop at L1972, after `const profileId = archiveData['profileid'][i]` → `if (heldSet.has(profileId)) continue;` | Only one needing an extra read. `emailid[i]`/`profileid[i]` are index-paired — `continue` is safe, pre-filtering the arrays is not. Covers both email triggers. |
| 2 | `notifyMobileApp` | 60 | L79 `const profileID` → `let`. In the loop at L135, after `foundProfileIds.push(profileId)`, collect held into a Set + `continue`. Then filter `profileID` **before L167 (STEP 2)**. | Must be before STEP 2 (writes in-app logs) and STEP 3 (fetches FCM tokens). Don't add held to `failedlist`. `new_user_data` docs share the loop and lack the flag — use a Set, filter once. |
| 3 | `sendWatiBroadCast` | 2830 | In the loop at L2896, after `const profile = mapProfile[profileId]` (L2899) → `if (profile['deliveryonhold'] === true) continue;` | Do **not** push to `numbersWithMissingCountryCode` — it feeds `failedNumbers` (L2949). Held ≠ failed. |
| 4 | `sendWatiScheduledBroadcast` | 3295 | Same guard at L3352, before `receivers.push` (L3363). | Last chance — at L3385 WATI takes the whole list and sends on its own clock. |

Profiles are already in memory for 2, 3 and 4. No extra reads there.

## Order
1 → 2 → 3 → 4. (1 is highest volume and closes the `status: 'queued'` gap the client can't; 2 is free and covers 62 send origins.)

## Decide first
- **Fail-open or fail-closed** on a profile-read error? Angular fails open (user waiting). These are retryable triggers — fail-closed is safer.
- **Broadcasts only, or all messages?** This plan covers broadcasts. Transactional sends bypass the archives (8 direct WATI call sites in 6 files, no shared client; `wishlist.js:5` has its own Postmark client). Including them blocks OTPs, appointment confirmations and ticket replies for held profiles.

## Already done (starlabs-angular)
Composers filter at send: `wati-input`, `email-input`, `ah-notification`, `authguard.saveNotificationRecord`.
Backend work is defence-in-depth + covers queued/scheduled items the client can't.
