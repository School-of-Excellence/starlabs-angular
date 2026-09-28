# 2026-08-14 — Workshop config: enablesharemessage

## What was done (commit `74d40984`)
Settings tab → General tab → **Enable Share** row: when the toggle is on,
the row expands (same `.setting-row-expand` pattern as Test Mode) with a
**Share Message** textarea bound to a new string field
`enablesharemessage` on the `workshopconfiguration` doc.

Wired in the three standard places in
`workshop-configuration.component.ts`: `settingsForm` group (`['']`),
`patchSettingsData` (`data['enablesharemessage'] || ''`), and
`saveSettings` (`?.value || ''` — matching the no-trim style of the
neighbouring message fields like `referralmessage`).

## Notes
- Field is saved unconditionally (empty string when blank or when the
  toggle is off) — consistent with how every other settings field in
  `saveSettings` behaves; the textarea is merely hidden, not disabled,
  unlike the ads dialog's disable-orchestration. Deliberate: this form
  has no such machinery and the neighbours don't either.
- Trivial mechanical change following an in-file pattern — no
  verification workflow this round.
- The consumer (whatever renders/sends the share message in the app) is
  outside this repo change.
