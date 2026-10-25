# 2026-10-24 — EI Solution Review log (View Prescribed + Edit ATC) — operator-approved ("implement")

Storage decided by the operator after comparing ATC doc / notes doc / subcollection / collection: **an array on the
ATC doc**. Open points 1–4 of the plan were taken as recommended.

1. **Data** (atc_alpha / atc_to_validate): `reviewlog: [{ id, note, createdby, createdon, isdelete, deletedby,
   deletedon }]`. EI Solution only (product lowercase "ei solution"). No migration.
2. **Who can add + soft-delete (View and Edit):** profile id in the ATC's `author`, or in any adjustment's
   `implementationagent`, or role mentor / admin / developer. Anyone allowed can soft-delete ANY review. Others read only.
3. **View Prescribed:** "Review log" card in the expanded EI ATC, before Ask (prototype). Composer ("Saved as <you> ·
   today", "Write the review first."); add via transaction (refuses on a retired ATC: "This ATC was updated — reload…",
   else atomic append); list newest first; inline delete confirm → soft delete (who + when), no restore;
   "Show deleted (N)"; "N reviews" tag on the title line; "Reviews" figure in the summary strip. Rows cached per
   snapshot (freeze lesson).
4. **Edit ATC:** live subscription to the ATC doc. Review log card (EI) after New adjustments: list, add, soft delete —
   written straight to the ATC (not the draft/save); live refresh from the subscription; panel "N reviews carry over".
   The new version takes the LATEST values of every field Edit does not set itself (reviewlog, status, validator,
   product, …) from the subscription, not the open-time copy. Upgraded / deleted elsewhere → Review and update + review
   add/delete disabled, banner: "This ATC was updated by someone else on <date>. Your changes can't be saved on this
   version. Open the latest version to continue." + **Open latest version**; deleted: "This ATC was deleted. Your changes
   can't be saved." The draft stays but can't be submitted.
5. Not changed: other ATC writers (all partial updates), participant screens, Excel export.
6. e2e (atc, emulator): VATT-03 (view), EATT-06 (live log in Edit), EATT-07 (save carries the latest log),
   EATT-08 (upgraded / deleted while editing).
