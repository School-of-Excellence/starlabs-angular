# Cluster: Profile (profile, summary, image, user model)

> Repo: `breakthroughs-flutter` (branch `development`). Static code+config map only — no build/run, no Firestore reads. Evidence cited as `file:line`.

## Overview
For the participant, this cluster is the "My Profile" area: viewing and maintaining their own identity card (avatar, name, email, phone, date of birth), uploading/changing a profile picture, completing the mandatory profile-photo "verification", requesting changes to locked personal details, resetting their password, and deleting their account. It also covers two read-only "view someone else's profile" surfaces used inside the social feed (a public posts page for another user, and an admin/AH "Profile Summary" with journey/product/recent-activity and a deep link into that user's ATC). The live identity screen is **`profileimage.dart` (`ProfileImage`)**; `profile.dart` is a legacy clone reached only through dead code.

## Screens

| Screen | file:line | Purpose |
| --- | --- | --- |
| `ProfileImage` ("My Profile") — **LIVE primary** | `profileimage.dart:25` (`class ProfileImage`), build `:219` | The participant's own profile: avatar with tap-to-change + camera button, profile-verification banner/badge, read-only Personal Details (name/email/phone/DOB), "Request Change" link, Logout, Change Password, Delete Account. |
| `Profile` ("My Profile") — **legacy clone, unreachable** | `profile.dart:25` (`class Profile`), build `:372` | Older self-profile screen: avatar (taps through to `ProfileImage`), read-only email/phone, Current Journey/Product, Recent Activity, journey extras/add-ons/upgrades, Logout, role-gated "ATC Upload Pending" button. Only built by dead `MoreMenu.dart:42`. |
| `ProfileSummary` ("Profile Summay") — admin/AH or self | `profileSummary.dart:10` (`class ProfileSummary`), build `:201` | Read-only summary of a target `profileid`: avatar/name/email, Current Journey/Product, Recent Activity, journey extras/add-ons/upgrades, and a role/self-gated "View ATC" button into `ClientATC`. |
| `User` (other participant's public profile) | `user.dart:17` (`class User`), build `:244` | Read-only feed of another participant's **public** Achievements posts (header avatar + name); per-post "Report Post"; AH/admin get a toolbar button into `ProfileSummary`. |

## Features

### View own profile identity card (name, email, phone, DOB)
- **What the user does:** Opens "My Profile" and sees their avatar, Full Name, Email, Phone Number, and Date of Birth rendered from the in-memory `appService.loggedinProfile`.
- **Nav/entry:** `ProfileImage` is pushed from the profile dashboards/menus — `home.dart:476` (auto-push when `profileimg == null`), `Main Screen/myProfileDashboard.dart:671/733`, `Main Screen/myjourney.dart:904`, `Widgets/Themes.dart:680/5089`, and from the legacy `profile.dart:430` avatar tap.
- **Reads:** No direct Firestore read in this screen; fields come from `appService.loggedinProfile` (`name`, `email`, `number`, `dateofbirth`, `profile`, `profileimg`, `profileid`) populated elsewhere by `AppService.mapProfile()` (`Services/AppServices.dart:913`, reads `profile_data` ordered by `name`). DOB formatted `dd MMM yyyy` at `profileimage.dart:647`.
- **Writes:** none.
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** support / account.
- **e2e-testability:** Yes — seed `profile_data/{pid}` with `name/email/number/dateofbirth` and assert the four detail rows render. (Depends on `loggedinProfile` being hydrated post-login.)

### Change profile picture (gallery → crop → upload)
- **What the user does:** Taps the avatar or the camera-icon button, picks an image from the gallery, crops it square (circle style), and the app uploads it and updates the profile.
- **Nav/entry:** Avatar `GestureDetector` (`profileimage.dart:243`, vibrates `:245`) and camera `IconButton` (`profileimage.dart:294`) → `updateProfile("profile")` (`profileimage.dart:96`).
- **Reads:** none for this action.
- **Writes:** `profile_data/{loggedinProfile["profileid"]}` `.update({'profile': <downloadURL>})` (`profileimage.dart:136`); also updates in-memory `loggedinProfile["profile"]` (`:140`).
- **Endpoints:** Firebase Storage — `FirebaseStorage.instance.ref().child(loggedinProfile["name"]).child("profile/<timestamp> <basename>")` (`profileimage.dart:133`); `getDownloadURL()` (`:135`). On error → `AppService().logException(...)` writes `app exception log` (`AppServices.dart:1364` → `.add` at `:1368`).
- **Config flags:** none. (Camera/storage/photos permissions are requested via `requestPermission()` `profileimage.dart:42` but the call site is commented out at `:97`; iOS path proceeds without the gate.)
- **Journey stage:** onboarding / account.
- **e2e-testability:** Partial — the gallery picker + native image cropper are OS dialogs not drivable by widget/integration tests without mocks; the resulting Firestore `profile` write and avatar re-render are assertable if the picker/cropper are stubbed. Mark drive-through as manual.

### Verify profile photo (mandatory front-camera "verification")
- **What the user does:** When unverified (`profileimg == null`), sees a "Verify Your Profile / Verification Pending" banner and taps "Verify Now"; the app opens the **front camera**, crops, runs on-device face detection, and on success uploads the verification photo. When verified, a "Profile Verified" badge shows instead.
- **Nav/entry:** "Verify Now" `GestureDetector` (`profileimage.dart:402`) → `updateProfile("profileimg")` (`:405`). Verified/unverified branch decided by `profileVerification = appService.loggedinProfile["profileimg"] != null` (`:53`).
- **Reads:** none.
- **Writes:** `profile_data/{profileid}` `.update({'profileimg': <downloadURL>})` (`profileimage.dart:136`, `field == "profileimg"`); sets `profileVerification = true` (`:143`).
- **Endpoints:** Firebase Storage upload (same ref pattern as above, `profileimage.dart:133`); on error `app exception log` via `logException`.
- **Config flags:** none.
- **Special logic:** On-device face detection gate `detectFaces()` using `google_mlkit_face_detection` (`profileimage.dart:68`); if no acceptable face and field is `profileimg`, shows "Unable to Detect Face" alert and aborts (`:126`). This is also enforced app-entry: `home.dart:474` auto-pushes `ProfileImage` when `profileimg == null`.
- **Journey stage:** onboarding.
- **e2e-testability:** Partial/No for the live drive — requires front-camera capture + ML Kit face detection on a real image; not drivable headless. The verified-vs-unverified UI branch IS assertable by seeding `profile_data.profileimg` present/absent. Mark capture as manual.

### Request change to locked personal details
- **What the user does:** Taps "Request Change →" next to Personal Details (details are read-only "for security"); lands on a multi-step `ProfileInfoRequest` form to select which fields to change, supply new values/date/supporting docs, review, and Submit — which raises an in-app support ticket.
- **Nav/entry:** `profileimage.dart:475` `GestureDetector` → `Navigator.pushReplacement` to `ProfileInfoRequest()` (`profileinforequest.dart:29`). Submit button `reviewAndSubmit` → `_submitRequest` (`profileinforequest.dart:213`, primary `:748`).
- **Reads:** `chat config` (first doc, `categories` where `category == "In-App Support"`) read inside `AppService.raiseTickets` (`AppServices.dart` raiseTickets `:7`).
- **Writes:** Creates support ticket — `clientissue/{auto-id}` (`.set` batch, `AppServices.dart` raiseTickets `:25/:61`) plus first message at `clientissue/{id}/messages/{auto-id}` (`:26`). (Support-cluster collection; triggered from Profile.)
- **Endpoints:** none direct here (Firestore batch write).
- **Config flags:** none; category name hardcoded `"In-App Support"` (`profileinforequest.dart:230`).
- **Journey stage:** support.
- **e2e-testability:** Yes (for the write) — drive the form steps and assert a `clientissue` doc is created with an `In-App Support` category; depends on a `chat config` doc existing in the test project. Document upload step may need stubbing.

### Reset / change password
- **What the user does:** Taps "Change Password?"; a "Reset your password?" dialog confirms the email; on "Yes, send reset email" a Firebase Auth password-reset email is sent, then a success/failure dialog shows.
- **Nav/entry:** `profileimage.dart:730` `GestureDetector` (guarded by `loggedinProfile['email'] != null`, `:732`) → `localTheme.forgotpasswordwidget(context)` (`Widgets/Themes.dart:8056`); confirm button → `forgotPassword(context)` (`Themes.dart:7835`).
- **Reads:** none.
- **Writes:** none (Firebase Auth side-effect only).
- **Endpoints:** Firebase Auth `auth.sendPasswordResetEmail(email: loggedinProfile['email'] ?? email)` (`Themes.dart:7851`).
- **Config flags:** none.
- **Journey stage:** support / account.
- **e2e-testability:** Yes — assert the dialog opens and shows the logged-in email and the success dialog appears; the actual email send hits Firebase Auth (test project, no inbox assertion). The inline commented-out `forgotPassword()` in `profileimage.dart:879-927` is dead.

### Delete account (with reason)
- **What the user does:** Taps "Delete Account" (red), a bottom sheet warns the action is permanent and requires a free-text reason; on confirm the account is flagged deleted and the user is logged out.
- **Nav/entry:** `profileimage.dart:817` `onPressed` → `showModalBottomSheet(... deleteReason())` (`:818`, sheet body `deleteReason()` `:966`); confirm "Delete Account" → `saveDeleteReason()` (`:1069` → def `:1094`).
- **Reads:** none.
- **Writes:** `profile_data/{loggedinProfile['profileid']}` `.update({"accountdeleted": true, "deletereason": <text>})` (`profileimage.dart:1122`), then `logoutUser()`.
- **Endpoints:** triggers logout chain (see Logout feature).
- **Config flags:** none; empty-reason guard at `:1096`.
- **Journey stage:** support / account.
- **e2e-testability:** Yes — drive sheet, enter reason, confirm, assert `profile_data.accountdeleted == true` + `deletereason` set and navigation to Login. Destructive: run on a disposable seeded user.

### Logout
- **What the user does:** Taps Logout (in `ProfileImage` `:715`, legacy `Profile` `:393`, and as the final step of delete), confirms in a platform dialog, and is signed out back to the Login screen.
- **Nav/entry:** `ProfileImage` Logout `TextButton` (`profileimage.dart:715`) → `logoutConfirmation()` (`:168`) → `logoutUser()` (`:211`) → `AppService().logoutUser(fcmToken, context)` (`:215`). Legacy `Profile` mirror at `profile.dart:393/316/319`.
- **Reads:** `FCM_token` where `FCM_id == token` and `uid == user_ref.id` (to delete) — `AppServices.dart` `deleteFCMNotificationToken` `:872`.
- **Writes:** Deactivates FCM token via `updateFCMToken(..., false)` (`AppServices.dart:838`); deletes matching `FCM_token` docs (`:879`); clears `SharedPreferences` (`:834`) and secure-storage user list (`UserData.removeUserFromStorage`, `:832`); clears in-memory `loggedinProfile`/roles (`:851`).
- **Endpoints:** Firebase Auth `auth.signOut()` (`AppServices.dart:849`); `FirebaseMessaging.instance.getToken()` (`:875`).
- **Config flags:** none.
- **Journey stage:** support / account.
- **e2e-testability:** Yes — assert confirm dialog → navigation to Login and that local prefs are cleared; FCM token cleanup needs a token present.

### View another participant's public posts ("User" profile)
- **What the user does:** From the social feed/comments, opens another participant's profile and scrolls their **public** Achievements posts (header avatar + name); can "Report Post" via the per-post menu; AH/admin see a summary button.
- **Nav/entry:** `User(...)` is pushed from `listGridPersonal.dart:414` and `commentlikes.dart:91`. Header/back via `AppTheme().localAppBar` (`user.dart:246`). Note: the posts list body is largely commented out (`user.dart:353-706`); the live `StreamBuilder` stream is wired (`user.dart:276`) but renders an empty `CustomScrollView` (only the header sliver `:299` is live; the post list slivers are inside the comment block).
- **Reads:** `Achievements/posts/postcollection` where `uid == otheruid` and `private == false`, `orderBy created desc` (`user.dart:279-285`); own role bootstrap reads `profile_data/{pid}` then `role_ref` doc (`user.dart:78-107`); `user_data/{uid}/trending/userposts` `postids` (`getTrending`, `user.dart:111-124`).
- **Writes:** Report → `Achievements/blacklist/blacklistrows` `.add({postid(ref), owner(ref user_data/{otheruid}), reportedby(ref user_data/{pid}), dateofreporting: serverTimestamp})` (`user.dart:148-163`). Comment helper `commenting()` (`:127`) calls `AppService().commentOnPost(...)` (`AppServices.dart:662`) but no live UI invokes it here (comment UI is in the commented block).
- **Endpoints:** none direct.
- **Config flags:** none.
- **Journey stage:** social / content.
- **e2e-testability:** Partial — the header (avatar/name) and the "Report Post" write are testable (seed a public post + open `User`), but the **post list rendering is dead/commented**, so post tiles won't appear; do not assert post tiles. Report write is assertable on `blacklistrows`.

### Report a post (from User profile)
- **What the user does:** Opens the per-post overflow menu and chooses "Report Post"; sees a "Reported" confirmation.
- **Nav/entry:** `postmenu()` (`user.dart:176`) → `reportpost(postid)` (`:147`). (Reachable only if a post tile is rendered — see caveat above; the menu trigger lives in the commented post list.)
- **Reads:** none.
- **Writes:** `Achievements/blacklist/blacklistrows` `.add(...)` (`user.dart:148`).
- **Endpoints:** none.
- **Config flags:** none.
- **Journey stage:** social / support.
- **e2e-testability:** Partial — write is assertable if invoked, but no live UI path renders the trigger in `user.dart` (post list commented out). Mark No for end-to-end via this screen until the list is restored.

### View Profile Summary (admin/AH or self) + open ATC
- **What the user does:** (AH/admin) From a `User` profile taps the summarize icon to open `ProfileSummary` for that person: avatar/name/email, Current Journey, Current Product, Recent Activity (last 3 attended appointment types), journey extras/add-ons/upgrades, and a "View ATC" button.
- **Nav/entry:** `user.dart:255` AH/admin `IconButton` (`Icons.summarize_outlined`) → `ProfileSummary(profileid: otherProfileID)` (`:262`). "View ATC" `OutlinedButton` (`profileSummary.dart:488`) gated by `loggedinPID == profileid || roles.ah || roles.admin` (`:482`).
- **Reads:** `profile_data/{profileid}` (`profileSummary.dart:123`) and its `role_ref` doc (`:126`); `appointments` where `attended == true` & `bookedby == <profileRef>` orderBy `starttime` desc limit 3 (`:138-144`) → `appointmenttype` where `id` in list (`:149-153`); `journey` where `journey == currentjourney` for extras/addonproducts/journeyupgrades (`:164-167`). [Note bug: `:148` uses `appoinmentList.isEmpty` so recent-activity is only fetched when the list is empty — recent activity effectively never populates.]
- **Writes:** Legacy `addNotes()` would write `profile_data/{profileid}.notes` (`profileSummary.dart:97-100`) but the notes UI is commented out (`:408-481`) → not live.
- **Endpoints:** none.
- **Config flags:** none; role-gated by `role_ref` doc fields `ah`/`admin`.
- **Journey stage:** progression / support (staff-facing).
- **e2e-testability:** Yes for the summary fields (seed `profile_data` + `journey`); the "View ATC" target is OFF-LIMITS (see below). Recent-activity has the `.isEmpty` bug, so don't assert it populates.

### Open client ATC from Profile Summary — ATC (OFF-LIMITS)
- **What the user does:** Taps "View ATC" in `ProfileSummary` to open `ClientATC` for that profile.
- **Nav/entry:** `profileSummary.dart:499` → `ClientATC(profileid: widget.profileid, atcType: "client", hideAppbar: false)` (`clientATC.dart`).
- **Reads/Writes:** ATC collections — **NOT mapped, CI-excluded.**
- **Journey stage:** content (ATC).
- **e2e-testability:** No — **ATC OFF-LIMITS, CI-excluded.** Maps that the entry exists; never seed/test.

### (Legacy `Profile` screen) ATC Upload Pending — ATC (OFF-LIMITS)
- **What the user does:** (role-gated `ah`/`floor`/`admin`) Taps "ATC Upload Pending" to open `ATCuploadPending`.
- **Nav/entry:** `profile.dart:832` → `ATCuploadPending()` (`atcUploadPending.dart`). Lives on the unreachable legacy `Profile` screen.
- **Reads/Writes:** ATC-adjacent — not mapped.
- **e2e-testability:** No — **ATC OFF-LIMITS** and on a dead screen (unreachable). Exists only; never test.

## Firestore collections

### Read
- `profile_data` — by doc id `{pid}` (own: `profile.dart:60/144`; via `getUserData` lookup by `email`+`user_ref` `UserData.dart:41`); by `{profileid}` (`profileSummary.dart:123`, `user.dart:79/93`); whole-collection ordered by `name` in `AppService.mapProfile` (`AppServices.dart:919`). Fields used: `name`, `email`, `number`, `dateofbirth`, `profile`, `profileimg`, `profileid`, `currentjourney`, `currentproduct`, `role_ref`, `notes`, `user_ref`, `voiptoken`, `accountdeleted`.
- `<role_ref path>` — role doc dereferenced from `profile_data.role_ref` (`profile.dart:69`, `profileSummary.dart:126`, `user.dart:83/100`). Fields: `admin`, `ah`, `floor` (and `chatxadmin` in commented code).
- `appointments` — where `attended == true`, `bookedby == <profileRef>`, orderBy `starttime` desc, limit 3 (`profile.dart:84-88`, `profileSummary.dart:138-144`). Field read: `appointment` (ref → `.id`).
- `appointmenttype` — where `id` whereIn `[appointment ids]` (`profile.dart:95`, `profileSummary.dart:150`). Field: `appointmenttype`.
- `journey` — where `journey == currentjourney` (`profile.dart:110`, `profileSummary.dart:165`). Fields: `extras`, `addonproducts`, `journeyupgrades`.
- `Achievements/posts/postcollection` — where `uid == otheruid` & `private == false`, orderBy `created` desc (`user.dart:279-285`). Fields: `uid`, `private`, `created`, `postimage(list)`, `postmessage`, `postcategory`, `significance`, `consequence`, `profileid`.
- `user_data/{uid}/trending/userposts` — `postids` (`user.dart:114-117`).
- `chat config` — first doc, `categories` (triggered by Request Change via `raiseTickets`) (`AppServices.dart`).
- `FCM_token` — where `FCM_id == token` & `uid == user_ref.id` (logout cleanup, `AppServices.dart:872`).

### Written
- `profile_data/{pid}` — `{profile: url}` (avatar, `profileimage.dart:136`/`profile.dart:358`), `{profileimg: url}` (verification, `profileimage.dart:136`), `{accountdeleted: true, deletereason}` (delete, `profileimage.dart:1122`), `{notes}` (legacy/commented note-add, `profile.dart:222`, `profileSummary.dart:97` — not live UI).
- `clientissue/{auto-id}` + `clientissue/{id}/messages/{auto-id}` — Request Change ticket via `raiseTickets` (`AppServices.dart` raiseTickets `:25/:26/:61`). (Support cluster; triggered from Profile.)
- `Achievements/blacklist/blacklistrows` — report post (`user.dart:148-163`): `postid`(ref), `owner`(ref), `reportedby`(ref), `dateofreporting`(serverTimestamp).
- `FCM_token` — deactivated/deleted on logout (`AppServices.dart:838/879`).
- `app exception log` — error logging on upload failure (`AppServices.dart:1368` via `logException`).

## Endpoints & external services
- **Firebase Storage** — profile/verification image upload: `ref().child(<name>).child("profile/...")` then `getDownloadURL()` (`profileimage.dart:133-135`, `profile.dart:349-357`).
- **Firebase Auth** — `sendPasswordResetEmail` (`Themes.dart:7851`); `signOut` (`AppServices.dart:849`).
- **Firebase Messaging (FCM)** — `getToken()` (`profile.dart:50`, `profileimage.dart:55`, `AppServices.dart:875`); token deactivate/delete on logout.
- **google_mlkit_face_detection** — on-device face detection for profile-photo verification (`profileimage.dart:68-94`).
- **image_picker / image_cropper** — gallery + front-camera capture and square/circle crop (`profile.dart:323-344`, `profileimage.dart:98-122`).
- **vibration** — haptic on avatar tap / delete confirm (`profileimage.dart:245/1070`).
- No HTTP/Dio/`httpsCallable`/Cloud Functions URLs and no RemoteConfig referenced in these files.

## Config & feature flags
- **No RemoteConfig / feature flags** gate anything in this cluster (no `remoteConfig`/`RemoteConfig` references in the four files or the helpers they call).
- **Role-based gating** (from `profile_data.role_ref` doc): `ah`/`floor`/`admin` show the legacy "ATC Upload Pending" button (`profile.dart:798`); `ah`/`admin` (or self) show "View ATC" (`profileSummary.dart:482`) and the `User`→`ProfileSummary` icon (`user.dart:254`).
- **Local infra:** `SharedPreferences` stores `useremail`/`useruid`/`userpid`/`watsonpackage` (`UserData.dart`); `flutter_secure_storage` stores the saved-users list; both cleared on logout.
- **Persona/verification gate:** app-entry redirect to `ProfileImage` when `profile_data.profileimg == null` (`home.dart:474`) — a soft onboarding lock, not a remote flag.

## Dead / clone / Old code
- **`profile.dart` (`Profile` screen)** — legacy clone of the self-profile, **effectively unreachable**: its only importer/builder is `MoreMenu.dart:42`, and `MoreMenu` has zero callers anywhere in the repo (only its own class definition). Superseded by `ProfileImage`. Its features (Current Journey/Product, Recent Activity, ATC Upload Pending button, in-screen avatar upload) should NOT be treated as live.
- **`MoreMenu.dart`** — dead file (no navigation references; the sole link to the legacy `Profile`).
- **Large commented blocks:**
  - `profile.dart:668-743` and `481-488` — General/Private Notes UI and a name `TextField` (commented out).
  - `profile.dart:745-796` — "Contact Support" button (commented out).
  - `profileSummary.dart:408-481` — Notes UI (commented out); `addNotes()` `:31` thus has no live caller.
  - `user.dart:353-706` — the entire grid/list post-rendering body is commented out; the live `StreamBuilder` renders only the header sliver, so `User` shows no post tiles and the post overflow/report trigger is not reachable from live UI. `commenting()`/`PostItemWidget` paths are dead here.
  - `profileimage.dart:156-165` (permission gate), `:733-772` & `:826-868` (old reset/delete confirmation dialogs), `:879-927` (`forgotPassword()` method) — all commented out.
- **`reportpost`/`postmenu`** in `user.dart` are live functions but only invoked from the commented post list, so no live entry point.

## Notes & open questions
- **Two self-profile screens exist.** `ProfileImage` is the live one (auto-entry from `home.dart`, linked from dashboards). `profile.dart` is a stranded clone behind dead `MoreMenu`. e2e should target `ProfileImage`.
- **Recent-activity bug in `ProfileSummary`:** the appointment-type fetch is guarded by `appoinmentList.isEmpty` (`profileSummary.dart:148`), the inverse of `profile.dart:93` (`length != 0`). So `ProfileSummary` recent activity will not populate from real data — don't assert it.
- **`appService.loggedinProfile` is the source of truth for `ProfileImage`.** It's hydrated outside this cluster (login/home via `mapProfile`/`onBoarding`). e2e for `ProfileImage` must ensure a logged-in, hydrated profile or fields render blank.
- **Verification vs. avatar are two different fields:** `profile` (display avatar, gallery) vs `profileimg` (verification, front camera + face detect). The "Verify Now" path writes `profileimg`; the avatar tap writes `profile`. Both upload to the same Storage folder.
- **ATC entries exist but are OFF-LIMITS:** `ProfileSummary` "View ATC" → `ClientATC`, and legacy `Profile` "ATC Upload Pending" → `ATCuploadPending`. Mapped as existing; never seed/test (CI-excluded).
- **Request Change is a cross-cluster write:** it creates `clientissue` support tickets (support cluster). Reading `chat config` is a prerequisite for that flow to succeed in a test project.
- No Firebase project IDs are referenced in these files (project selection is global, not per-screen).
