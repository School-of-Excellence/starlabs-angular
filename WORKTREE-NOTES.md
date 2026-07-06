# Worktree: `test/queue-e2e` — Queue Manager e2e test environment

Isolated git worktree for building the Queue Manager full-complexity e2e test environment.

- **Worktree path:** `/Users/antano/solarcode/ah/starlabs-angular-queue-e2e`
- **Branch:** `test/queue-e2e` (off `docs/concept-groups-wip`)
- **Main checkout:** `/Users/antano/solarcode/ah/starlabs-angular` (`docs/concept-groups-wip`)
- **Test Firebase project:** `slabs-queue-e2e-exdcz` (dedicated, disposable; billing = AgenticDemo)

## ⚠️ DUPLICATED-ON-DISK — DELETE WHEN MERGING THIS WORKTREE

These were **copied** into this worktree because they are gitignored / untracked by the
Angular repo and therefore are NOT carried by `git worktree`. They are duplicates of what
lives in the main checkout. **When this worktree is merged back, delete these copies and
remove the worktree** (they are excluded via the repo's local `info/exclude`, so they never
get committed to `test/queue-e2e`):

- `starlabs-cloud-function/`  (its own repo, branch `development`) — duplicate of main checkout
- `breakthroughs-flutter/`    (its own repo, branch `development`) — duplicate of main checkout
- `e2e/node_modules/`          — reinstall, not copied

### Cleanup checklist (run at merge time)
```bash
MAIN=/Users/antano/solarcode/ah/starlabs-angular
WT=/Users/antano/solarcode/ah/starlabs-angular-queue-e2e
# 1. merge test/queue-e2e into its target branch from $MAIN first
# 2. remove the duplicated nested repos in the worktree
rm -rf "$WT/starlabs-cloud-function" "$WT/breakthroughs-flutter" "$WT/e2e/node_modules"
# 3. remove the worktree
git -C "$MAIN" worktree remove "$WT"
```

## Rule for nested-repo changes
Any change inside `starlabs-cloud-function/` or `breakthroughs-flutter/` is made on a **new
branch within that nested repo** (not on their `development`). Track those branches here:

| Nested repo | Base | Work branch | Purpose |
|---|---|---|---|
| starlabs-cloud-function | development | _(created at deploy time)_ | deploy config / dummy secrets for test project |
| breakthroughs-flutter | development | _(only if Level-2 web is built)_ | web-build shims |

## What's in this worktree
- `e2e/lib/` — flow-model (oracle), path-generator, fake-data, test-project (allowlist guard)
- `e2e/fixtures/` — sample-queue-config, seed-test-project, sample-prod-schemas
- `specs/queue-participant-app-map.md`, `specs/queue-collection-schemas.json`