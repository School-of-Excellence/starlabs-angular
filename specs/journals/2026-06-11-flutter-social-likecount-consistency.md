# 2026-06-11 — Flutter social `likecount` consistency

**Repo:** `breakthroughs-flutter` (nested git repo, branch `development`) — NOT the Angular `cicd` repo.
**Commit:** `7f30320 fix(social): seed likecount on post create + null-guard the dashboard reader` (2 files, +5/-4). Not pushed (gated).

## What was asked

Reported "inconsistency" in `lib/Services/AppServices.dart`: `likePost` maintains a denormalized `likecount` field (`FieldValue.increment(±1)`) *and* the `likes` subcollection, while `deletePost` clears the subcollections but never touches `likecount`. Two proposed fixes: (1) make `deletePost` zero/delete `likecount`; (2) if `likecount` is unused for display, drop the increment/decrement bookkeeping. Instruction: **grep for `likecount` usage before changing.**

## What the grep actually showed — both premises were wrong

- **`likecount` is NOT write-only/unused.** It is read by exactly one — but **live** — screen: `lib/Main Screen/myProfileDashboard.dart:1082-1089` (instantiated at `lib/home.dart:2109`; the `...old` variant is dead). It drives the heart icon (filled vs outline), its colour (red vs black) and the printed like number. So proposed fix (2) would have **broken** that screen.
- **`deletePost` has no `likecount` inconsistency.** It deletes the *entire post document* first (`AppServices.dart:687`); `likecount` is a field *on that doc*, so it dies with it. Writing `likecount: 0` there would **resurrect a phantom post document** — strictly harmful. Proposed fix (1) was unnecessary *and* a latent bug.
- **`likePost` is the sole writer** of both the field and the subcollection, and keeps them in lock-step. So the two never drift *from each other* via the like path.

### The like-total topology (why this matters)
- `myProfileDashboard` reads the **`likecount` field**.
- ~15 other live surfaces (`postItemWidget`, `breakthroughsnewPost`, `timeline`, `homeContent`, `exploreSocial`, `postGridWidget`, `expandPost`, `myjourney`, `listGridPersonal`, …) read **`likes.docs.length`** (the subcollection size). They never touch the field.

## The real bug (surfaced by the investigation)

Post creation never initialises `likecount`: `lib/Main Screen/shareMajorBreakthrough.dart` does `.set(newpost)` with no `likecount` key (newpost is built via `newpost["k"]=v` assignments). The field only springs into existence on the **first like**. So for every never-liked post, `post["likecount"]` is `null`, and the dashboard's null-naive checks (`!= 0`, `== 0`) render a **filled red heart + the literal text "null Likes"**. That — not `deletePost` — is the genuine write-side/read-side inconsistency.

## Decision (operator: "guard read + init at creation")

- **Write side** — `shareMajorBreakthrough.dart:55`: seed `newpost["likecount"] = 0;` so the field exists from birth.
- **Read side** — `myProfileDashboard.dart:1082/1083/1086/1089`: read via `(post["likecount"] ?? 0)`. The `?? 0` also fixes **already-created** never-liked posts (init alone only fixes future posts), so the pair is complete.
- **Unchanged on purpose:** `deletePost` (deletes the whole doc) and `likePost` bookkeeping (field is still read → load-bearing, not dead).

`flutter analyze` (3.44.1) on both files: 21 issues, **all pre-existing `info` lints**, none at the edited lines.

## Pending / latent (not done)

Two sources of truth remain: the `likecount` field (one screen) vs `likes.docs.length` (everywhere else). The cleaner long-term fix is to **converge `myProfileDashboard` onto the subcollection** like every other surface, then `likecount` becomes genuinely unused and the `likePost` increment bookkeeping *can* be removed (the original fix #2, finally unblocked). Deferred because the dashboard reads a static `post` map, so it needs a per-post likes read/StreamBuilder — a real UI change, out of scope for a minimal fix.
