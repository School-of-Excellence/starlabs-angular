# 2026-11-17 — Workshop config → Settings → Mail template: email template mapping

The operator asked for a picker at the end of the Mail template section.
- It lists `email templates` with `active == true` and keeps only `postmarkstatus == 'approved'` in code.
- It shows `templatename` and has a search box.
- It shows one dropdown per `templatemodel` variable, with the options Name, Workshop name, Workshop URL and Static
  value. Static value shows a textarea.
- It saves to `workshopsettings/{workshop id}`:
  ```
  mail: {
    templateid: "<email templates doc id>",
    emailData: { <variable>: { type: "name" | "workshopname" | "workshopurl" } | { type: "static", value: "<text>" } }
  }
  ```

Plan: `specs/plans/2026-11-17-workshop-mail-template-mapping.md`.

## Why `emailData` is keyed by variable, with typed entries
The operator first picked the flat shape (`{ name: "name", signoff: "Team A&H" }`), then changed it to this one.
- **Flat:** a static text that happens to be "name" can't be told apart from the Name source.
- **Array by index:** gives duplicate rows when the same variable appears twice.
- **Keyed by variable:** matches Postmark's `TemplateModel`, so the future sender can build the model straight from
  it.

Nothing reads `mail` yet.

## Why it is built this way
- **It saves on its own button,** as Dashboard Access does. It writes a different document from the Save Settings
  bar, which writes only `workshopconfiguration`.
- **The write is `setDoc` with `mergeFields: ['workshopid', 'mail']`.** The `mail` map is replaced whole, so dropped
  variables don't linger. `dashboardaccess` in the same document is not touched; WMT-04 checks this.
- **Save needs a complete mapping:** every variable chosen and every Static value non-blank. An incomplete mapping
  would send emails with holes.
  - Remove + Save deletes `mail` with `deleteField`.
  - Save is blocked on a workshop the Enrollment page hasn't created yet, so no orphan `workshopsettings` documents.
- **Each variable gets one row,** and mustache control tags (`#each`, `/each`, `^x`, `>partial`) get none, because
  the map is keyed by variable.
- **The template list loads when the picker first opens.** The stored choice loads with the page: one `getDoc`, plus
  one for the saved template.

## What review and e2e changed (workflow `wf_e10b92e9-896`, 3 agents, ~35 min)
- **A mapping that has drifted shows as dirty.**
  - The saved state is fingerprinted from the stored map with all of its keys (`storedMailFingerprint`).
  - A template that has gained a variable, a stray key, or data in the old flat shape loads as "Saved choice is out
    of date". The block also shows what is missing without any edit.
- **`templatemodel` isn't always written.** `communication.component.ts` (~1121) creates templates without it, and
  Postmark approval never adds it. Such templates show "Variables not recorded" and can't be saved; the hook is
  `ws-mail-vars-unknown`. They were not guessed from the body.
- **A failed read of the saved template no longer locks the section.** Remove and picking another still work, and
  the failure is logged as a `console.warn`.
- **Smaller fixes:**
  - variable names shaped like `__x__`, which Firestore rejects, get their own blocker;
  - an empty Static value no longer counts as set;
  - the picker is full width on phones;
  - aria-labels name the current choice.
- **Not changed:** the section is not part of the leave-page guard, the same as Dashboard Access.

## Results
- **Unit:** `mail-template-map.spec.ts` 24/24.
- **Build:** clean, no warnings from this folder.
- **Hub:** `workshops/workshop-mail-template.spec.ts`, WMT-01..17, plus the `wsMail` seed helpers in `support/wshop.ts`.
  - The seeds are run-tagged in the emulator: two active+approved templates, one with no variables, one without
    `templatemodel`, and negative controls (active+pending, inactive+approved).
  - The oracles read the stored `mail` and check that `dashboardaccess` and `workshopconfiguration` are unchanged.
  - Targeted run: 50 passed, 0 failed. The 30 skips are the existing fixmes in `new-workshop-child-controls`.
  - Readiness gate MATCHED; 152 of 152 settings hooks are tested.
  - Hub commits `bfdf6a5` and `99e519a`, local.
- The servers are stopped and the cloud-function `package.json` is restored. The operator's 4200 server, now pid
  901, was untouched.

## What surprised us
- Some `email templates` docs have no `templatemodel` at all. Template creation in the Communication component never
  writes it.
- The emulator ran detached and ignored SIGINT. SIGTERM to the firebase process still triggered the script's trap,
  which restored `package.json`.
- Cloud functions don't load in the emulator: firebase-functions v7 dropped `functions.config()`. No current spec
  needs triggers, but one that does will fail.

## Pending
- **Operator:** commit the 5 settings files, the plan and this journal.
- **Hub push** on "push": run the full workshops suite first. Six local commits are waiting.
- **The sender:** something has to read `workshopsettings/{id}.mail` and send the email; nothing does yet.
- **Decide whether templates without `templatemodel` should get it filled in.** That means fixing the create path in
  the Communication component, or a backfill.

---

# 2026-11-17 (later): Workshop dashboard, tag chips on Exist Users Enrolled cards

The operator asked for the tag chips on the Exist Users Enrolled side panel too. Before this, only Total Enrolled
cards showed them (WNE-04, 2026-11-12).

- **What changed:** `workshop-dashboard.component.html` now draws the same `enrolled-tag` chips on Exist Users
  Enrolled cards. Two comments in `.ts` were updated.
- **No new reads.** The panel already loaded the tag names for its Tag filter (`TAG_FILTER_PANELS` →
  `loadEnrolledTagNames`, 2026-11-16). The chips have the same names, order and dead-id handling as Total Enrolled.
- **Why the chips have their own hook (`wd-side-exist-tag`):**
  - WNE-04 asserts that `wd-side-enrolled-tag` is absent on Exist Users. Reusing it would turn that case red.
  - A behaviour-only change with no new hook would also go red on branches without the change.
  - The new case therefore lives in its own gated file, `workshops/workshop-dashboard-exist-tags.spec.ts` (WNE-10),
    so the hub-ahead guard skips it where the hook is missing. Only WNE-04's message changed.
- **WNE-10 checks:**
  - a dead tag id shows nothing;
  - untagged p0 shows no chips, and the still-new user is not in the panel;
  - re-tagging shows every tag in stored order;
  - Total Enrolled keeps its own chips and never draws the Exist Users hook.
- **Results:**
  - WNE-10 plus WNE-01..09 in one targeted run: 10 passed, 0 failed.
  - Readiness gate MATCHED.
  - Hub commit `4d51924`, local.
- **New Users Enrolled** has the same Tag filter but still shows no chips. It was not asked for; it's a one-line
  change if wanted.
- **Surprise:** the firebase emulator hung on SIGTERM and needed SIGKILL, which left its Firestore java process
  orphaned on port 8080. That process was stopped too. The deploy script's trap still restored the cloud-function
  `package.json`.

---

# 2026-11-17 (later): Workshop dashboard, renamed cards and full width

**Renames.**
- **Cards:** "Exist Users Enrolled" is now **Existing Participants**. "New Users Enrolled" is now **New Users**, in
  all three card layouts.
- **Panel headings:** each one now repeats the card name.
  - Exist users: "All Participants - Existing Participants".
  - New users: "All Participants - New Users". It was "New Users - New Users Enrolled"; renaming only the
    subtitle would have read "New Users - New Users".
- **Panel big titles:** both used to titlecase the status key, so they read "Existusersenrolled" and
  "Totalnewusers". They are now set to the card names. Other panels are unchanged.
- **Hooks:**
  - new: `wdash-exist-users-label`, `wdash-new-users-label`, `wdash-panel-title`, `wdash-panel-heading`;
  - the new wording is pinned by WDL-01, in its own gated file `workshops/workshop-dashboard-labels.spec.ts`;
  - WDC-01 checked the card's old text, so it now accepts either wording. It sits in an ungated file and must stay
    green on branches without the rename.

**Full width.** `.dashboard-content` dropped `max-width: 1400px; margin: 0 auto`, which left empty bands on wide
screens. `.dashboard-main` padding went from 24px to 16px. At 1920 the content box is now 16 → 1904.

**Results.**
- Dashboard specs in one run: WDL-01, WDC 20, WNE-10, WNE-01..09, `workshop-dashboard.spec.ts` 9. Everything else
  passed; WDL-01 then passed alone after the fix below.
- Readiness gate MATCHED.
- Hub commit after `4d51924`, local.

**Found, not fixed.** The New Users panel lists the moved person (`movedtoexist: true`) although the New Users card
counts only the still-new user. WDL-01's first run caught this, and the check was taken out because membership is
not what the rename is about.
- `onMetricClick('totalNewUsers')` filters with `isNewUserProfile`, so another path must be adding the moved
  person. Not looked into yet.
- WNE-09 never asserted it either way.

**Correction (2026-11-18): this was not an app bug.** A test edit had moved the Total Enrolled block above WDL-01's
New Users membership lines, so "the moved person is not listed" ran in **Total Enrolled**, which rightly lists
everyone. The New Users panel never showed the moved person. The fix and the two real issues found along the way are
in `2026-11-17-workshop-dashboard-redesign.md`, section "2026-11-18 — the moved person in New Users".

**Surprise.** The first full-width screenshot still showed the 1400px cap, because the 4201 dev server was mid-rebuild.
Wait for "Component update sent" before shooting.
