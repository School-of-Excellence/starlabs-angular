# Plans

This directory holds **approved implementation plans**. Drafts stay in `~/.claude/plans/` (personal, untracked); approved plans land here (git-tracked, surviving sessions).

## Convention

- Filename: `YYYY-MM-DD-topic.md` (use the date the plan was approved, not started)
- Sections: Context · Goals · Non-goals · Approach · Phases · Risks · Verification
- Locked at approval — no mid-stream edits without operator sign-off
- Always paired with a journal in `../journals/` that captures WHY each constraint landed

## When to write one

- Multi-day work
- Anything touching CI/CD, security boundaries, or production data shape
- Changes that need to be revisited / understood by future contributors

## When NOT to write one

- Bug fixes with obvious root cause
- Single-file additions
- Routine refactors with no behavior change

## Reading order

Future sessions should read the plan AND the companion journal together. The plan tells you WHAT; the journal tells you WHY each decision landed the way it did. Don't propose alternatives without reading both.
