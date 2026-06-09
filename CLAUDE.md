# CLAUDE.md — StarLabs (atctranscription)

> Project instructions for Claude Code sessions. Loaded automatically every session. These instructions OVERRIDE default behavior — follow them exactly as written.
>
> **Scope note:** Only the *journaling discipline* slice of the `pilot-bootstrap` velocity setup is installed (operator directive, 2026-06-02). The full substrate (Bug Protocol, Commit/Push rules, decision logs, gates) is intentionally deferred — run `/pilot-bootstrap` later to complete it.

---

## Project Overview

StarLabs / "Breakthroughs" — a coaching & customer-journey platform (workshops, journeys, scheduling, live conferencing, audio/video content) for participants, coaches, and admins.

- **Type:** Angular 19 (standalone components, SSR) + Firebase (Auth, Firestore, Storage, Functions, FCM) PWA
- **Primary language:** TypeScript
- **CI platform:** GitHub Actions → Firebase Hosting (`.github/workflows/deploy_19.yml`) — ⚠️ deploy-only today, **no test/build gate**
- **Team size:** TBD (operator interview not run — journaling-only install)

## Getting Started

```bash
npm install --legacy-peer-deps     # install (peer deps require the flag)
ng serve                           # dev
ng test                            # unit (Karma/Jasmine — 398/399 specs are empty CLI stubs today)
ng build --configuration production # build
```

Firebase projects: `fir-sample-aae4a` = **production**, `starlabs-test` = test, `launch-your-legacy-development` = staging.

## Critical Constraints — MUST FOLLOW

- **ATC data is OFF-LIMITS** for all CI/CD and automated testing. Never read, write, or seed ATC Firestore collections (`atc_alpha`, `atc_initiated`, `atc_notes`, `atc_to_validate`, `ai_generated_atc_summary(_backup)`, `triple atc`, `temporary_tripleatc`, `assignment_*atc*`, `atc assignment`, `big assignment atc_alpha`, `big assignment_*`, `big temporary_ATC`, `0 atcinvolved issue`). Exclude all `src/app/ATC/**` components and ATC readers from the test pipeline. Reference-only config (`atc taxonomy`, `atc model`, `atcmodel level config`) is safe.
- **Test users (including admin) live in `starlabs-test` / the emulator — NEVER production.** Production must stay untouched by test infrastructure.
- The production service account is sensitive; use it read-only and never commit it.

---

## Commit discipline

- **Commit after every self-contained piece of code.** The moment a change is coherent and green — a bug fixed, a test added and passing, a refactor step finished — commit it right away with a clear, scoped message. Prefer small, frequent commits over batching unrelated changes. This is a standing operator instruction: do not wait to be asked to commit.
- **Branch first if on a protected branch.** The working line is **`cicd`** (feature branches such as `test/queue-e2e` merge into it). **`main`** tracks the upstream School-of-Excellence repo — never merge or push to `main` without explicit operator approval.
- **Pushing is a separate, gated step** — `git push` publishes; do it only when the operator asks. Committing locally does not.

## Session Protocol

### Start of every session
1. **Read `specs/ORIENTATION.md` FIRST** — the new-session map (state, constraints, 3-project topology, doc map, data harness, open threads, gotchas).
2. Read `PROGRESS.md` (current state) + `specs/validated/README.md` (concept-group validation status; `validated/` supersedes the auto `specs/*.md`).
3. Read the relevant `specs/journals/` before proposing changes; skim `graphify-out/wiki/index.md` before deep codebase questions.
4. Ask the user what they want to work on.

### During the session
- Build before deploy — never deploy uncompiled code
- Run tests after non-trivial changes

### End of every session
**Rewrite** `PROGRESS.md` from scratch (max 1 page, 3 sections):
- **Current state** — what is deployed right now (~5 lines)
- **Last session changes** — what changed and *why*, including failures + root causes
- **Pending** — what is half-done or next

Drop anything older than the last session. History belongs in git and the journals.

---

## Plan Rule

Non-trivial features must have an approved plan before implementation. Approved plans go in `specs/plans/YYYY-MM-DD-topic.md`; drafts stay in `~/.claude/plans/`. Plans are git-tracked and survive across sessions.

## Journal Rule — MUST FOLLOW

When you make an architectural decision or land a load-bearing change, write a companion journal in `specs/journals/YYYY-MM-DD-topic.md` explaining **WHY** each constraint landed. Plans tell WHAT; journals tell WHY. Future sessions read BOTH before proposing alternatives.

**Journal after every session (operator directive, 2026-06-02):** at the end of *every* session — not only architectural ones — write or append a journal entry capturing what was done, what was found, what surprised us, and what's pending. A session without a journal is invisible to future sessions.

---

## graphify

This project has (or will have) a graphify knowledge graph at `graphify-out/`.

Rules:
- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` for central / hub nodes and community structure. In prose and reports always say "central nodes", "hub nodes", or "high-connectivity nodes" — never the metaphorical "god nodes".
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current.
- To rebuild from scratch (after a large refactor): `/graphify .`

---

*Journaling slice installed via `pilot-bootstrap` skill on 2026-06-02.*
