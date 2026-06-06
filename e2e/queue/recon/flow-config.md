# Variation Flow Config — the routing oracle (SOURCE OF TRUTH)

> **What this is.** The authoritative, per-variation, ordered stage list + legal edge set for
> the 9 variations of the seed queue, **derived from the scoped-edge oracle in
> `e2e/lib/flow-model.js` (`build()` + `outEdgesForVariation()`), NOT from the raw
> `stages[]` backbone array.** Every variation spec under `e2e/queue/variations/`
> (no-skip, selfmovable-gate, loop-bound, terminal) MUST cite this file. When the config
> changes, regenerate this file before trusting any hard-coded stage sequence (PLAN §6 risk 11).
>
> **Inputs.** `e2e/fixtures/sample-queue-config.json` (the exported `queue generation` doc —
> `stages[]`, `queuevariation[]`, `stageproperty{}`), driven through
> `e2e/lib/flow-model.js`. Cross-refs: PLAN `e2e/PLAN.md` §2.4 / §3.D / §6 (risks 11–13);
> validated spec `specs/validated/03-queue-manager.md` §2 (two transition types);
> participant map `specs/queue-participant-app-map.md` (self-move is a client write, no CF).
>
> **How to reproduce** (the numbers below are this command's output, verbatim):
> ```
> cd e2e && node -e 'const cfg=require("./fixtures/sample-queue-config.json");
>   const {oracle,build,outEdgesForVariation,reachableInVariation}=require("./lib/flow-model");
>   /* per-variation: outEdgesForVariation(build(cfg), stage, variationId) */'
> ```

---

## 0. The model — read this first (it changes how you read every table below)

There are **THREE** edge types in the oracle. The variation spec assertions hinge on telling
them apart (validated §2; participant map TL;DR):

| Oracle `type` | `selfmv` | Meaning | Who triggers it | Test treatment |
|---|---|---|---|---|
| `next` | — | **Operator `nextstage` button**, variation-scoped `{stage,calltoaction,markascompleted,variations[]}` | OPERATOR clicks on the live board (`[REAL-UI]`) | drive via queue-board page object; assert the move-dropdown offers exactly the scoped buttons |
| `selfmove` | `true` | **Self-move on form/videoask submit** — `selfmovable:true` form advances to the next stage in *that variation's* order. **Lives OUTSIDE `nextstage`.** Client writes `queue_token` directly + a `queue stage log` row (NO cloud function). | PARTICIPANT (`[SIM]` self-move via `participant-sim.js`) | SIM the `queue_token`+log write; this is a precondition/self-move stand-in only |
| `selfmove` | `false` | **Auto-advance gate** — a NON-self-movable stage (`actiontype:null` gate, or `link`) with no `nextstage` button for this variation auto-advances to the next backbone stage. Modeled by `flow-model` so these stages are not false orphans. | depends on stage (see per-stage notes) | treat as forward edge; on a pure gate the participant just waits — assert NO participant self-move write fires on a non-self-movable stage (PLAN P1 #6) |

**The flow = the self-move/auto backbone (per variation) + the operator `nextstage` branches at decision points.** (validated §2).

**Legend used in every variation table below:**
`OP` = operator `nextstage` edge · `SELF` = self-move on form submit (`selfmovable:true`) ·
`AUTO` = auto-advance gate (`selfmovable:false`, no scoped button) ·
`[LOOP]` = self-loop (`to == from`) · `[BACK]` = backward edge (`order[to] < order[from]`) ·
`done` = `markascompleted` on the operator button. `[idx]` = the stage's index in the global
`stages[]` array (0–29), shown so you can see forward/backward at a glance.

**Global stage index** (the 30-entry `stages[]` master order — variations are ordered SUBSETS of this):
`0 Evolution Prep Orientation · 1 uP! Prep Process - Hold · 2 Accelerated Evolution Level Form · 3 Prodigies Preparation Form · 4 uP! Life Aspiration Report · 5 ATC Orientation Form · 6 ATC Orientation Group Call · 7 uP! Life Report · 8 Scope Enhancement · 9 Evolution Mapping Activity · 10 In Evolution Mapping Activity · 11 Self Evaluation Form · 12 My Evolution Wishlist · 13 Guided Self ATC · 14 Ready for Diagnostics · 15 Diagnostics · 16 Diagnostics Readiness Changework · 17 ATC Preparation · 18 ATC Briefing · 19 Consultation · 20 Diagnostics In-person · 21 Consultation In-person · 22 In-person Completed · 23 Triple ATC · 24 Triple ATC Validation · 25 uP! Readiness Changework · 26 Review · 27 Expanding Horizon Consultation · 28 Self Evolution Report · 29 Completed`

---

## 1. Global oracle result (the static check that gates everything)

`oracle(cfg)` on the seed config returns:

- **`ok: false`** — solely because of the 2 known orphans below. **No dangling edges. No unreachable terminals.** Every multi-stage variation reaches `Completed`.
- **`orphans: ["uP! Prep Process - Hold", "My Evolution Wishlist"]`** (the 2 known orphans, see §4).
- **`dangling: []`**, **`unreachableTerminals: []`**.
- This is the exact baseline asserted by `e2e/queue/oracle-selftest.spec.ts` (must stay green).

> **Caveat for spec authors:** `oracle()` reports `ok:false` BECAUSE of the 2 expected orphans.
> Do NOT assert `o.ok === true`. Assert `o.orphans` equals the known-2 set and
> `o.dangling.length === 0`, exactly as the self-test does.

---

## 2. The 9 variations — authoritative ordered stage list + scoped edges

Universal facts that hold for ALL multi-stage variations (so they are not repeated per stage):

- **First stage** is always `Evolution Prep Orientation` [0] (a gate, `selfmovable:false`), which `AUTO`-advances to `Accelerated Evolution Level Form` [2]. (Exception: V9 Prep Hold.)
- **`Accelerated Evolution Level Form`** [2] is a `SELF` form whose self-move target DIFFERS per variation (it is the journey-family fork — see each table). This is the one stage with 4 distinct self-move edges across the config.
- **`Self Evolution Report`** [28] is the penultimate stage: a `SELF` form that self-moves to `Completed` [29]. `Completed` [29] is the sole **TERMINAL** (no scoped out-edge) for every multi-stage variation.
- **`Scope Enhancement`** [8] is the studio engine and always has a `[LOOP]` "Send Back" self-edge (bound ≤2) plus exactly ONE forward operator branch (the per-variation routing decision).
- **`Diagnostics`** [15] is the central hub; its forward operator branches are variation-scoped (see drift §3).
- **Loop/back edges are bound to ≤2 traversals** by the harness (PLAN risk 13); a 3rd traversal must FAIL the test.

---

### V1 · LYL - First Cycle · `K9PRd4PfWDWtaO0vSxy3` · backbone len 17
PLAN cases: LYL-FC-WF-01/02/03. Spec: `e2e/queue/variations/lyl-first-cycle.spec.ts`.

| # | [idx] Stage | selfmv / action | studiowidgets / compulsory(studio) | participantform | Scoped OUT-edges (the legal moves) |
|---|---|---|---|---|---|
| 1 | [0] Evolution Prep Orientation | false / null | — | — | `AUTO`→Accelerated Evolution Level Form |
| 2 | [2] Accelerated Evolution Level Form | **true** / form | — | — | `SELF`→uP! Life Aspiration Report |
| 3 | [4] uP! Life Aspiration Report | **true** / form | — | — | `SELF`→ATC Orientation Form |
| 4 | [5] ATC Orientation Form | **true** / form | — | — | `SELF`→ATC Orientation Group Call |
| 5 | [6] ATC Orientation Group Call | false / null | — | — | `AUTO`→Scope Enhancement |
| 6 | [8] Scope Enhancement | false / null | addunvalidatedatc, prescribedunvalidatedatc · compulsory keys 0–1 | — | `OP`→Guided Self ATC {done} · `OP`→Scope Enhancement **[LOOP]** {Send Back, ¬done} |
| 7 | [13] Guided Self ATC | **true** / form | — | — | `SELF`→Ready for Diagnostics |
| 8 | [14] Ready for Diagnostics | false / null | — | — | `AUTO`→Diagnostics |
| 9 | [15] Diagnostics | false / null | addunvalidatedatc, prescribedvalidatedatc, prescribedunvalidatedatc, assignprocedure, validateael · compulsory 0–12 · **enablezoom** | 8 forms | `OP`→Diagnostics Readiness Changework {¬done} · `OP`→Consultation {done} · `OP`→Diagnostics **[LOOP]** {Send Back} · `OP`→ATC Briefing {done} · `OP`→ATC Preparation {¬done, if ATC validation pending} |
| 10 | [16] Diagnostics Readiness Changework | false / null | prescribedvalidatedatc, assignedatc · compulsory 0–3 | — | `OP`→Diagnostics **[BACK]** {Send Again for Diagnostics, done} — **ONLY edge (dead-forward; see §3)** |
| 11 | [17] ATC Preparation | false / null | prescribedvalidatedatc, prescribedunvalidatedatc · compulsory 0–4 | 7 forms | `OP`→Consultation {done} · `OP`→ATC Preparation **[LOOP]** {Send Back} · `OP`→ATC Briefing {done} |
| 12 | [18] ATC Briefing | false / null | addunvalidatedatc, prescribedvalidatedatc, prescribedunvalidatedatc, assignedatc, assignprocedure · compulsory 0–4 | — | `OP`→Consultation {done} — single forward edge |
| 13 | [19] Consultation | false / null | 8 widgets (add/prescribe (un)validated, assignedatc, assignprocedure, viewtripleatc, validateael) · compulsory 0–2 | 6 forms | `OP`→uP! Readiness Changework {done} · `OP`→Self Evolution Report {done} · `OP`→Consultation **[LOOP]** {Send back} · `OP`→Diagnostics Readiness Changework **[BACK]** {¬done} |
| 14 | [25] uP! Readiness Changework | false / null | assignedatc · compulsory 0–3 | — | `OP`→Consultation **[BACK]** {Send Again, done} · `OP`→Review {Send for Review, done} |
| 15 | [26] Review | false / null | — | — | `OP`→Self Evolution Report {Completed, done} · `OP`→uP! Readiness Changework **[BACK]** {Send for Implementation, ¬done} |
| 16 | [28] Self Evolution Report | **true** / form | — | — | `SELF`→Completed |
| 17 | [29] **Completed** | false / null | — | — | **TERMINAL (no out-edge)** |

- **Self-move (SELF) stages:** AEL Form, uP! Life Aspiration Report, ATC Orientation Form, Guided Self ATC, Self Evolution Report (5).
- **Auto gates (AUTO):** Evolution Prep Orientation, ATC Orientation Group Call, Ready for Diagnostics (3).
- **Loops (≤2):** Scope Enhancement, Diagnostics, ATC Preparation, Consultation. **Back-edges:** DRC→Diagnostics, Consultation→DRC, uP!RCW→Consultation, Review→uP!RCW.
- **Edge totals:** OP=20, SELF=5, AUTO=3 (loop=4, back=4). **Terminal:** Completed.

---

### V2 · LYL - Next Cycle · `zxcF1MNH8Jp0eCxxXASY` · backbone len 18
PLAN case: LYL-NC-WF-01. Spec: `e2e/queue/variations/lyl-next-cycle.spec.ts`.
> ⚠ **PLAN §2.4 lists this variation's id as `41KiwsFl4dZ6JhtfPemA` / queue `BhQgc9dU9Q27skitBCUD`.** The SEED config (`sample-queue-config.json`) uses id **`zxcF1MNH8Jp0eCxxXASY`**. **Trust the seed id** (this file is derived from the seed). If your spec seeds the PLAN id it will not match the fixture — use `zxcF1MNH8Jp0eCxxXASY` against this fixture.

Diverges from V1 at the AEL fork (→ `uP! Life Report` instead of `uP! Life Aspiration Report`) and inserts the Evolution-Mapping block. Stages 9–17 (Diagnostics … Completed) are IDENTICAL to V1.

| # | [idx] Stage | selfmv / action | studio (widgets / compulsory) | Scoped OUT-edges |
|---|---|---|---|---|
| 1 | [0] Evolution Prep Orientation | false / null | — | `AUTO`→Accelerated Evolution Level Form |
| 2 | [2] Accelerated Evolution Level Form | **true** / form | — | `SELF`→uP! Life Report |
| 3 | [7] uP! Life Report | **true** / form | — | `SELF`→Scope Enhancement |
| 4 | [8] Scope Enhancement | false / null | studio (see V1) | `OP`→Evolution Mapping Activity {next-cycle, done} · `OP`→Scope Enhancement **[LOOP]** {Send Back} |
| 5 | [9] Evolution Mapping Activity | false / null | — | `AUTO`→In Evolution Mapping Activity |
| 6 | [10] In Evolution Mapping Activity | false / **link** | — | `AUTO`→Self Evaluation Form |
| 7 | [11] Self Evaluation Form | **true** / form | — | `SELF`→Guided Self ATC |
| 8 | [13] Guided Self ATC | **true** / form | — | `SELF`→Ready for Diagnostics |
| 9 | [14] Ready for Diagnostics | false / null | — | `AUTO`→Diagnostics |
| 10 | [15] Diagnostics | false / null | studio + enablezoom (see V1) | SAME 5 OP edges as V1: →DRC{¬done} · →Consultation{done} · →Diagnostics[LOOP] · →ATC Briefing{done} · →ATC Preparation{¬done} |
| 11 | [16] Diagnostics Readiness Changework | false / null | studio | `OP`→Diagnostics **[BACK]** {done} — **ONLY edge (dead-forward)** |
| 12 | [17] ATC Preparation | false / null | studio | →Consultation{done} · →ATC Preparation[LOOP] · →ATC Briefing{done} |
| 13 | [18] ATC Briefing | false / null | studio | `OP`→Consultation {done} — single forward |
| 14 | [19] Consultation | false / null | studio | →uP!RCW{done} · →Self Evolution Report{done} · →Consultation[LOOP] · →DRC[BACK] |
| 15 | [25] uP! Readiness Changework | false / null | studio | →Consultation[BACK]{done} · →Review{done} |
| 16 | [26] Review | false / null | — | →Self Evolution Report{done} · →uP!RCW[BACK]{¬done} |
| 17 | [28] Self Evolution Report | **true** / form | — | `SELF`→Completed |
| 18 | [29] **Completed** | false / null | — | **TERMINAL** |

- **SELF:** AEL, uP! Life Report, Self Evaluation Form, Guided Self ATC, Self Evolution Report (5). **AUTO:** Evolution Prep Orientation, Evolution Mapping Activity, In Evolution Mapping Activity (link), Ready for Diagnostics (4).
- **Note the `link` stage** [10] In Evolution Mapping Activity: in the participant app a `link` is "open URL, NO queue_token write" (participant map row 2). Here it is a non-self-movable AUTO gate. PLAN: link-stage **no-write** assertion (cf. V7).
- **Edge totals:** OP=20, SELF=5, AUTO=4 (loop=4, back=4). **Terminal:** Completed.

---

### V3 · B!G - Next Cycle · `mLAX7wA6n9XgkuTkGl7K` · backbone len 24
PLAN cases: BIGNC-00…06. Spec: `e2e/queue/variations/big-next-cycle.spec.ts`.
> ⚠ **PLAN §2.4 / §3.D describe B!G-NC as a synthetic 5-stage queue (`BIGNC`: Re-Engagement Form → Diagnostics → ATC Briefing → Scope Enhancement → Completed).** The SEED config's B!G - Next Cycle (`mLAX7wA6n9XgkuTkGl7K`) is the **real 24-stage** variation (the only one with the in-person + Triple-ATC sub-flow). **Trust the seed.** If the spec uses the PLAN's 5-stage synthetic queue it is a DIFFERENT fixture — reconcile before writing, and prefer the seeded 24-stage variation for the oracle.

The longest variation; the **only** one routing through the in-person + Triple-ATC sub-branch ([20]–[24], [27]).

| # | [idx] Stage | selfmv / action | studio | Scoped OUT-edges |
|---|---|---|---|---|
| 1 | [0] Evolution Prep Orientation | false / null | — | `AUTO`→Accelerated Evolution Level Form |
| 2 | [2] Accelerated Evolution Level Form | **true** / form | — | `SELF`→uP! Life Report |
| 3 | [7] uP! Life Report | **true** / form | — | `SELF`→Scope Enhancement |
| 4 | [8] Scope Enhancement | false / null | studio | `OP`→Evolution Mapping Activity {next-cycle, done} · `OP`→Scope Enhancement **[LOOP]** |
| 5 | [9] Evolution Mapping Activity | false / null | — | `AUTO`→In Evolution Mapping Activity |
| 6 | [10] In Evolution Mapping Activity | false / **link** | — | `AUTO`→Self Evaluation Form |
| 7 | [11] Self Evaluation Form | **true** / form | — | `SELF`→Guided Self ATC |
| 8 | [13] Guided Self ATC | **true** / form | — | `SELF`→Ready for Diagnostics |
| 9 | [14] Ready for Diagnostics | false / null | — | `AUTO`→Diagnostics |
| 10 | [15] Diagnostics | false / null | studio + enablezoom | SAME 5 OP edges as V1: →DRC{¬done} · →Consultation{done} · →Diagnostics[LOOP] · →ATC Briefing{done} · →ATC Preparation{¬done} |
| 11 | [16] Diagnostics Readiness Changework | false / null | studio | `OP`→Diagnostics **[BACK]** {done} — **ONLY edge (dead-forward)** |
| 12 | [17] ATC Preparation | false / null | studio | →Consultation{done} · →ATC Preparation[LOOP] · →ATC Briefing{done} |
| 13 | [18] ATC Briefing | false / null | studio | `OP`→Consultation {done} — single forward |
| 14 | [19] Consultation | false / null | studio | →uP!RCW{done} · →Self Evolution Report{done} · →Consultation[LOOP] · →DRC[BACK] |
| 15 | [20] Diagnostics In-person | false / null | addunvalidatedatc, prescribedvalidated/unvalidated, assignprocedure · compulsory 0–1 | `OP`→Consultation In-person {Completed, done} · `OP`→Diagnostics In-person **[LOOP]** {Send Back} |
| 16 | [21] Consultation In-person | false / null | add (un)validated, prescribed (un)validated, assignprocedure, validateael · compulsory 0 | `OP`→In-person Completed {Completed, done} |
| 17 | [22] In-person Completed | false / null | — | `AUTO`→Triple ATC |
| 18 | [23] Triple ATC | **true** / **link** | — | `OP`→Triple ATC Validation {¬done} |
| 19 | [24] Triple ATC Validation | false / null | viewtripleatc · compulsory 0 | `OP`→Consultation **[BACK]** {done} · `OP`→Self Evolution Report {ATC for uP! ready, done} |
| 20 | [25] uP! Readiness Changework | false / null | studio | →Consultation[BACK]{done} · →Review{done} |
| 21 | [26] Review | false / null | — | →Self Evolution Report{done} · →uP!RCW[BACK]{¬done} |
| 22 | [27] Expanding Horizon Consultation | false / null | add (un)validated, prescribed (un)validated · compulsory 0 | `AUTO`→Self Evolution Report |
| 23 | [28] Self Evolution Report | **true** / form | — | `SELF`→Completed |
| 24 | [29] **Completed** | false / null | — | **TERMINAL** |

- ⚠ **CRITICAL reachability fact (PLAN risk 11):** the in-person sub-branch (rows 15–22: Diagnostics In-person, Consultation In-person, In-person Completed, Triple ATC, Triple ATC Validation, Expanding Horizon Consultation — backbone positions 15–18,21) is **NOT forward-reachable from the variation's first stage through the scoped oracle.** No operator edge leads from `Consultation` (or anywhere on the main spine) INTO `Diagnostics In-person`. The `reachableInVariation` BFS reaches **18 of the 24** backbone stages. The 6 in-person/Triple-ATC stages are reachable in the model only via their own internal edges, not from the entry. **Consequence:** the deterministic oracle-driven happy-path walk for V3 ends at `Completed` via the main spine (Diagnostics→…→Consultation→uP!RCW→Review→Self Evolution Report→Completed), the SAME spine as V2 — it does NOT traverse the in-person branch. To exercise the in-person/Triple-ATC stages a spec must SEED a token directly onto `Diagnostics In-person` (an operator-drag entry, validated §2 item 3 — drag is runtime, not in the config). **Do NOT assert the in-person stages are part of the no-skip forward subsequence.**
- **SELF:** AEL, uP! Life Report, Self Evaluation Form, Guided Self ATC, **Triple ATC** (link+selfmovable — but its only configured move is an OP edge), Self Evolution Report. **AUTO:** Evolution Prep Orientation, Evolution Mapping Activity, In Evolution Mapping Activity (link), Ready for Diagnostics, In-person Completed, Expanding Horizon Consultation.
- **Edge totals (reachable spine):** OP=20, SELF=5, AUTO=4 (loop=4, back=4). **Terminal:** Completed.

---

### V4 · Prodigies - Next Cycle · `zvFQgmYarx1NKubIP70R` · backbone len 16
PLAN cases: PNC-WF-01/02/03. Spec: `e2e/queue/variations/prodigies-next-cycle.spec.ts`.

Diverges at AEL fork (→ `Prodigies Preparation Form`) and SKIPS the Self-Evaluation/Guided-Self-ATC pair: In Evolution Mapping Activity goes straight to Ready for Diagnostics. **`Diagnostics` and downstream use the uP!-family branch set (NO Diagnostics→Consultation edge).**

| # | [idx] Stage | selfmv / action | studio | Scoped OUT-edges |
|---|---|---|---|---|
| 1 | [0] Evolution Prep Orientation | false / null | — | `AUTO`→Accelerated Evolution Level Form |
| 2 | [2] Accelerated Evolution Level Form | **true** / form | — | `SELF`→Prodigies Preparation Form |
| 3 | [3] Prodigies Preparation Form | **true** / form | — | `SELF`→Scope Enhancement |
| 4 | [8] Scope Enhancement | false / null | studio | `OP`→Evolution Mapping Activity {next-cycle, done} · `OP`→Scope Enhancement **[LOOP]** |
| 5 | [9] Evolution Mapping Activity | false / null | — | `AUTO`→In Evolution Mapping Activity |
| 6 | [10] In Evolution Mapping Activity | false / **link** | — | `AUTO`→**Ready for Diagnostics** (Prodigies-NC self-move target — DIFFERS from V2/V3/V7/V8 which go to Self Evaluation Form) |
| 7 | [14] Ready for Diagnostics | false / null | — | `AUTO`→Diagnostics |
| 8 | [15] Diagnostics | false / null | studio + enablezoom | `OP`→DRC{¬done} · `OP`→Diagnostics **[LOOP]** · `OP`→ATC Briefing{done} · `OP`→uP! Readiness Changework{done} · `OP`→Self Evolution Report{done} · `OP`→ATC Preparation{¬done} — **6 edges; NO →Consultation** |
| 9 | [16] Diagnostics Readiness Changework | false / null | studio | `OP`→Diagnostics **[BACK]** {done} — **ONLY edge (dead-forward)** |
| 10 | [17] ATC Preparation | false / null | studio | `OP`→ATC Preparation **[LOOP]** · `OP`→ATC Briefing{done} · `OP`→Self Evolution Report{done} · `OP`→uP! Readiness Changework{done} — **NO →Consultation** |
| 11 | [18] ATC Briefing | false / null | studio | `OP`→Self Evolution Report {Completed, done} · `OP`→uP! Readiness Changework {¬done} — **NO →Consultation** |
| 12 | [19] Consultation | false / null | studio | →uP!RCW{done} · →Self Evolution Report{done} · →Consultation[LOOP] · →DRC[BACK] |
| 13 | [25] uP! Readiness Changework | false / null | studio | →Consultation **[BACK]**{done} · →Review{done} |
| 14 | [26] Review | false / null | — | →Self Evolution Report{done} · →uP!RCW[BACK]{¬done} |
| 15 | [28] Self Evolution Report | **true** / form | — | `SELF`→Completed |
| 16 | [29] **Completed** | false / null | — | **TERMINAL** |

- ⚠ **CRITICAL reachability fact (PLAN risk 11):** `Consultation` [19] (backbone row 12) is **NOT on the forward happy path.** For this variation `Diagnostics` does NOT offer →Consultation, and neither does ATC Preparation/Briefing. The ONLY ways into Consultation are the `Consultation` self-loop and the **`uP! Readiness Changework → Consultation` BACK-edge**. So the happy-path walk reaches the terminal via `Diagnostics → (ATC Briefing | uP!RCW | Self Evolution Report)` and visits Consultation ONLY if the operator sends back from uP!RCW. **The no-skip invariant must treat the legal forward subsequence as the ORACLE edge set, NOT the backbone array — the backbone lists Consultation between ATC Briefing and uP!RCW, but no forward edge connects ATC Briefing→Consultation here.**
- **SELF:** AEL, Prodigies Preparation Form, Self Evolution Report (3 — note: NO Guided Self ATC / Self Evaluation Form). **AUTO:** Evolution Prep Orientation, Evolution Mapping Activity, In Evolution Mapping Activity (link, →Ready for Diagnostics), Ready for Diagnostics (4).
- **Edge totals:** OP=23, SELF=3, AUTO=4 (loop=4, back=4). **Terminal:** Completed.

---

### V5 · Prodigies - First Cycle · `GHsYb6bRCg4qBWqgUKe6` · backbone len 13
PLAN case: PFC-WF-01. Spec: `e2e/queue/variations/prodigies-first-cycle.spec.ts`.
> ⚠ **PLAN §2.4 lists id `zUuoZoJHHDQnPTA6Ap68` / queue `vuvS7eBgTxLKufnesLQT` and a synthetic 5-stage path** (Evolution Prep Orientation → AEL → ATC Orientation Form → Scope Enhancement → Completed). The SEED Prodigies - First Cycle (`GHsYb6bRCg4qBWqgUKe6`) is **13 stages** with NO ATC Orientation Form and NO Guided Self ATC. **Trust the seed id `GHsYb6bRCg4qBWqgUKe6`** for the oracle; the PLAN's 5-stage description is a different (synthetic) fixture.

The shortest non-trivial variation. AEL self-moves DIRECTLY to Scope Enhancement; Scope Enhancement routes to **Ready for Diagnostics** (the Prodigies-FC-only branch); no Evolution-Mapping block.

| # | [idx] Stage | selfmv / action | studio | Scoped OUT-edges |
|---|---|---|---|---|
| 1 | [0] Evolution Prep Orientation | false / null | — | `AUTO`→Accelerated Evolution Level Form |
| 2 | [2] Accelerated Evolution Level Form | **true** / form | — | `SELF`→**Scope Enhancement** (Prodigies-FC fork — unique 4th AEL target) |
| 3 | [8] Scope Enhancement | false / null | studio | `OP`→**Ready for Diagnostics** {first-cycle Prodigie, done} · `OP`→Scope Enhancement **[LOOP]** |
| 4 | [14] Ready for Diagnostics | false / null | — | `AUTO`→Diagnostics |
| 5 | [15] Diagnostics | false / null | studio + enablezoom | `OP`→DRC{¬done} · `OP`→Diagnostics **[LOOP]** · `OP`→ATC Briefing{done} · `OP`→uP! Readiness Changework{done} · `OP`→Self Evolution Report{done} · `OP`→ATC Preparation{¬done} — **6 edges; NO →Consultation** |
| 6 | [16] Diagnostics Readiness Changework | false / null | studio | `OP`→Diagnostics **[BACK]** {done} — **ONLY edge (dead-forward)** |
| 7 | [17] ATC Preparation | false / null | studio | `OP`→ATC Preparation **[LOOP]** · →ATC Briefing{done} · →Self Evolution Report{done} · →uP! Readiness Changework{done} — **NO →Consultation** |
| 8 | [18] ATC Briefing | false / null | studio | `OP`→Self Evolution Report {Completed, done} · `OP`→uP! Readiness Changework {¬done} — **NO →Consultation** |
| 9 | [19] Consultation | false / null | studio | →uP!RCW{done} · →Self Evolution Report{done} · →Consultation[LOOP] · →DRC[BACK] |
| 10 | [25] uP! Readiness Changework | false / null | studio | →Consultation **[BACK]**{done} · →Review{done} |
| 11 | [26] Review | false / null | — | →Self Evolution Report{done} · →uP!RCW[BACK]{¬done} |
| 12 | [28] Self Evolution Report | **true** / form | — | `SELF`→Completed |
| 13 | [29] **Completed** | false / null | — | **TERMINAL** |

- ⚠ **Same Consultation reachability caveat as V4** — Consultation is reachable only via its self-loop or the uP!RCW back-edge, not on the forward happy path. Forward path: AEL→Scope Enhancement→Ready for Diagnostics→Diagnostics→(ATC Briefing|uP!RCW|Self Evolution Report)→…→Completed.
- **SELF:** AEL, Self Evolution Report (2 — fewest). **AUTO:** Evolution Prep Orientation, Ready for Diagnostics (2).
- **Edge totals:** OP=23, SELF=2, AUTO=2 (loop=4, back=4). **Terminal:** Completed.

---

### V6 · uP! - First Cycle · `M2wSxXnHYzvBRcpIlXYJ` · backbone len 17
PLAN cases: UPFC-HAPPY/LOOP/GAP. Spec: `e2e/queue/variations/up-first-cycle.spec.ts`.

**Stages 1–8 are IDENTICAL to V1 (LYL-FC)** (same AEL→uP! Life Aspiration Report→ATC Orientation Form→ATC Orientation Group Call→Scope Enhancement→Guided Self ATC→Ready for Diagnostics→Diagnostics). **From Diagnostics down it uses the uP!-family branch set (NO →Consultation forward), exactly like V4/V5/V7/V8** — this is the V1↔V6 divergence to watch.

| # | [idx] Stage | selfmv / action | studio | Scoped OUT-edges |
|---|---|---|---|---|
| 1 | [0] Evolution Prep Orientation | false / null | — | `AUTO`→Accelerated Evolution Level Form |
| 2 | [2] Accelerated Evolution Level Form | **true** / form | — | `SELF`→uP! Life Aspiration Report |
| 3 | [4] uP! Life Aspiration Report | **true** / form | — | `SELF`→ATC Orientation Form |
| 4 | [5] ATC Orientation Form | **true** / form | — | `SELF`→ATC Orientation Group Call |
| 5 | [6] ATC Orientation Group Call | false / null | — | `AUTO`→Scope Enhancement |
| 6 | [8] Scope Enhancement | false / null | studio | `OP`→Guided Self ATC {first-cycle, done} · `OP`→Scope Enhancement **[LOOP]** |
| 7 | [13] Guided Self ATC | **true** / form | — | `SELF`→Ready for Diagnostics |
| 8 | [14] Ready for Diagnostics | false / null | — | `AUTO`→Diagnostics |
| 9 | [15] Diagnostics | false / null | studio + enablezoom | `OP`→DRC{¬done} · `OP`→Diagnostics **[LOOP]** · `OP`→ATC Briefing{done} · `OP`→uP! Readiness Changework{done} · `OP`→Self Evolution Report{done} · `OP`→ATC Preparation{¬done} — **6 edges; NO →Consultation** |
| 10 | [16] Diagnostics Readiness Changework | false / null | studio | `OP`→Diagnostics **[BACK]** {done} — **ONLY edge (dead-forward)** |
| 11 | [17] ATC Preparation | false / null | studio | `OP`→ATC Preparation **[LOOP]** · →ATC Briefing{done} · →Self Evolution Report{done} · →uP! Readiness Changework{done} — **NO →Consultation** |
| 12 | [18] ATC Briefing | false / null | studio | `OP`→Self Evolution Report {Completed, done} · `OP`→uP! Readiness Changework {¬done} — **NO →Consultation** |
| 13 | [19] Consultation | false / null | studio | →uP!RCW{done} · →Self Evolution Report{done} · →Consultation[LOOP] · →DRC[BACK] |
| 14 | [25] uP! Readiness Changework | false / null | studio | →Consultation **[BACK]**{done} · →Review{done} |
| 15 | [26] Review | false / null | — | →Self Evolution Report{done} · →uP!RCW[BACK]{¬done} |
| 16 | [28] Self Evolution Report | **true** / form | — | `SELF`→Completed |
| 17 | [29] **Completed** | false / null | — | **TERMINAL** |

- ⚠ **Same Consultation reachability caveat as V4/V5.** The PLAN UPFC-HAPPY "canonical 17-stage forward (no loops)" CANNOT visit Consultation [19] on a pure-forward walk (no forward edge into it). The 17-step happy path is the backbone MINUS Consultation, reached via Diagnostics→ATC Briefing/uP!RCW→Review→Self Evolution Report→Completed. UPFC-GAP's oracle-parity sweep is exactly the `build()`/`oracle()` assertion this file documents.
- **SELF:** AEL, uP! Life Aspiration Report, ATC Orientation Form, Guided Self ATC, Self Evolution Report (5). **AUTO:** Evolution Prep Orientation, ATC Orientation Group Call, Ready for Diagnostics (3).
- **Edge totals:** OP=23, SELF=5, AUTO=3 (loop=4, back=4). **Terminal:** Completed.

---

### V7 · uP! - Next Cycle · `hdxaoI8zASDEk56OVIrk` · backbone len 18
PLAN case: WF-uPNextCycle-001. Spec: `e2e/queue/variations/up-next-cycle.spec.ts`.

**IDENTICAL to V2 (LYL-NC) in stage list AND self-move backbone** (same AEL→uP! Life Report→Scope Enhancement→Evolution Mapping block→Guided Self ATC→Diagnostics). **The ONLY difference from V2 is the Diagnostics-and-down branch set:** V7 uses the uP!-family branches (NO →Consultation from Diagnostics/ATC Prep/ATC Briefing), whereas V2 uses the LYL branches (Diagnostics→Consultation, ATC Briefing→Consultation only). **This is the headline V2↔V7 divergence — assert ATC Briefing must NOT offer Consultation for V7 (PLAN §3.D V7).**

| # | [idx] Stage | selfmv / action | studio | Scoped OUT-edges |
|---|---|---|---|---|
| 1 | [0] Evolution Prep Orientation | false / null | — | `AUTO`→Accelerated Evolution Level Form |
| 2 | [2] Accelerated Evolution Level Form | **true** / form | — | `SELF`→uP! Life Report |
| 3 | [7] uP! Life Report | **true** / form | — | `SELF`→Scope Enhancement |
| 4 | [8] Scope Enhancement | false / null | studio | `OP`→Evolution Mapping Activity {next-cycle, done} · `OP`→Scope Enhancement **[LOOP]** |
| 5 | [9] Evolution Mapping Activity | false / null | — | `AUTO`→In Evolution Mapping Activity |
| 6 | [10] In Evolution Mapping Activity | false / **link** | — | `AUTO`→Self Evaluation Form — **link stage: PLAN no-write assertion** |
| 7 | [11] Self Evaluation Form | **true** / form | — | `SELF`→Guided Self ATC |
| 8 | [13] Guided Self ATC | **true** / form | — | `SELF`→Ready for Diagnostics |
| 9 | [14] Ready for Diagnostics | false / null | — | `AUTO`→Diagnostics |
| 10 | [15] Diagnostics | false / null | studio + enablezoom | `OP`→DRC{¬done} · `OP`→Diagnostics **[LOOP]** · `OP`→ATC Briefing{done} · `OP`→uP! Readiness Changework{done} · `OP`→Self Evolution Report{done} · `OP`→ATC Preparation{¬done} — **6 edges; NO →Consultation** |
| 11 | [16] Diagnostics Readiness Changework | false / null | studio | `OP`→Diagnostics **[BACK]** {done} — **ONLY edge (dead-forward)** |
| 12 | [17] ATC Preparation | false / null | studio | `OP`→ATC Preparation **[LOOP]** · →ATC Briefing{done} · →Self Evolution Report{done} · →uP! Readiness Changework{done} — **NO →Consultation** |
| 13 | [18] ATC Briefing | false / null | studio | `OP`→Self Evolution Report {Completed, done} · `OP`→uP! Readiness Changework {¬done} — **NO →Consultation** |
| 14 | [19] Consultation | false / null | studio | →uP!RCW{done} · →Self Evolution Report{done} · →Consultation[LOOP] · →DRC[BACK] |
| 15 | [25] uP! Readiness Changework | false / null | studio | →Consultation **[BACK]**{done} · →Review{done} |
| 16 | [26] Review | false / null | — | →Self Evolution Report{done} · →uP!RCW[BACK]{¬done} |
| 17 | [28] Self Evolution Report | **true** / form | — | `SELF`→Completed |
| 18 | [29] **Completed** | false / null | — | **TERMINAL** |

- ⚠ **Same Consultation reachability caveat as V4/V5/V6.** Forward path skips Consultation [19].
- **SELF:** AEL, uP! Life Report, Self Evaluation Form, Guided Self ATC, Self Evolution Report (5). **AUTO:** Evolution Prep Orientation, Evolution Mapping Activity, In Evolution Mapping Activity (link), Ready for Diagnostics (4).
- **Edge totals:** OP=23, SELF=5, AUTO=4 (loop=4, back=4). **Terminal:** Completed.

---

### V8 · uP! - 3rd Cycle · `XmCS5togakPzWjfQvEe3` · backbone len 18
PLAN case: UP3-WF-01. Spec: `e2e/queue/variations/up-3rd-cycle.spec.ts`.

**Stage list IDENTICAL to V7 (uP!-NC).** The ONLY oracle difference: **`Diagnostics` has 5 forward edges (NOT 6) — it drops the `Diagnostics→Self Evolution Report` button.** Everything else equals V7.

| # | [idx] Stage | selfmv / action | studio | Scoped OUT-edges |
|---|---|---|---|---|
| 1–9 | identical to V7 rows 1–9 | — | — | (Evolution Prep Orientation→…→Ready for Diagnostics→Diagnostics) |
| 10 | [15] Diagnostics | false / null | studio + enablezoom | `OP`→DRC{¬done} · `OP`→Diagnostics **[LOOP]** · `OP`→ATC Briefing{done} · `OP`→uP! Readiness Changework{done} · `OP`→ATC Preparation{¬done} — **5 edges (NO →Self Evolution Report, NO →Consultation)** |
| 11 | [16] Diagnostics Readiness Changework | false / null | studio | `OP`→Diagnostics **[BACK]** {done} — **ONLY edge (dead-forward)** |
| 12 | [17] ATC Preparation | false / null | studio | `OP`→ATC Preparation **[LOOP]** · →ATC Briefing{done} · →Self Evolution Report{done} · →uP! Readiness Changework{done} — **NO →Consultation** |
| 13 | [18] ATC Briefing | false / null | studio | `OP`→Self Evolution Report {Completed, done} · `OP`→uP! Readiness Changework {¬done} — **NO →Consultation** |
| 14 | [19] Consultation | false / null | studio | →uP!RCW{done} · →Self Evolution Report{done} · →Consultation[LOOP] · →DRC[BACK] |
| 15 | [25] uP! Readiness Changework | false / null | studio | →Consultation **[BACK]**{done} · →Review{done} |
| 16 | [26] Review | false / null | — | →Self Evolution Report{done} · →uP!RCW[BACK]{¬done} |
| 17 | [28] Self Evolution Report | **true** / form | — | `SELF`→Completed |
| 18 | [29] **Completed** | false / null | — | **TERMINAL** |

- ⚠ **Same Consultation reachability caveat as V4–V7.**
- **SELF:** AEL, uP! Life Report, Self Evaluation Form, Guided Self ATC, Self Evolution Report (5). **AUTO:** Evolution Prep Orientation, Evolution Mapping Activity, In Evolution Mapping Activity (link), Ready for Diagnostics (4).
- **Edge totals:** OP=22, SELF=5, AUTO=4 (loop=4, back=4). **Terminal:** Completed.
- **Variation-scoping negative assertion (PLAN P1 #12 / §3.D V8):** the Diagnostics move-dropdown for a V8 token must offer EXACTLY these 5 buttons and MUST NOT offer `Diagnostics→Consultation` (an LYL/B!G-only edge) or `Diagnostics→Self Evolution Report` (a V4/V5/V6/V7 edge).

---

### V9 · uP! - Prep Hold · `PJQVQf9HU0PxSCIbH5re` · backbone len 1
PLAN cases: UPH-00/01/02. Spec: `e2e/queue/variations/up-prep-hold.spec.ts`.

| # | [idx] Stage | selfmv / action | studio | Scoped OUT-edges |
|---|---|---|---|---|
| 1 | [1] uP! Prep Process - Hold | false / null | — (no widgets, no compulsory) | **TERMINAL — entry IS terminal, ZERO out-edges, ZERO participant CTA** |

- The sole stage is a **parking stage**: `selfmovable:false`, `actiontype:null`, `nextstage:[]`, no studiowidgets, no compulsoryactivity. The participant has NO action (no self-move, no operator button) — they sit until manually moved by operator drag (runtime, off-config).
- **It is the entry AND the terminal.** PLAN UPH-01/02: `buildFlow` backbone length 1, `nextstage==[]`, move-dropdown EMPTY, `selfmovable==false`; no-move/no-log invariant (0 stage-log docs, vacuous every-move-logged 0==0). The participant simulator must NOT emit any self-move for this token.
- This stage is ALSO one of the 2 global orphans (§4) — it is an orphan in the *global* graph (no edge in or out) but a legitimate single-node terminal *within its own variation*. `oracle()` skips reachability for len-1 variations (`vs.length > 1` guard), so it does NOT count as an unreachable terminal.
- **Edge totals:** OP=0, SELF=0, AUTO=0. **Terminal:** uP! Prep Process - Hold (== entry).

---

## 3. BACKBONE vs ORACLE drift — the explicit disagreement flags (PLAN risk 11)

> **The rule:** the legal forward edge set is the **oracle (`outEdgesForVariation`)**, NOT the
> `stages[]` backbone array. The backbone is a display/ordering hint; it lists stages that the
> scoped operator/self-move edges may NOT actually connect in forward order. A no-skip assertion
> that trusts the backbone array will FALSELY pass an illegal skip or FALSELY fail a legal route.
> Below is every stage where the backbone order and the oracle disagree, by variation.

### D1 — `Diagnostics Readiness Changework` is DEAD-FORWARD in **all 8** multi-stage variations
- Backbone places DRC [16] immediately before `ATC Preparation` [17]. **The oracle gives DRC exactly ONE out-edge: a BACK-edge `DRC → Diagnostics` [16→15].** There is NO `DRC → ATC Preparation` edge in any variation.
- **Legal exit from DRC = back to Diagnostics, then re-route.** A `DRC → ATC Preparation` move is ILLEGAL and must be rejected by the no-skip invariant.
- Affects V1, V2, V3, V4, V5, V6, V7, V8 (every variation that contains DRC). PLAN names this for V1 (LYL-FC-WF-03) and V3.

### D2 — `Consultation` is OFF the forward happy path in the **5 uP!/Prodigies-family** variations
- Variations **V4 (Prodigies-NC), V5 (Prodigies-FC), V6 (uP!-FC), V7 (uP!-NC), V8 (uP!-3rd)**: backbone lists `Consultation` [19] between `ATC Briefing` [18] and `uP! Readiness Changework` [25], but **no forward operator edge enters Consultation** in these variations. `ATC Briefing → Consultation` does NOT exist here (it exists only in V1/V2/V3). Consultation is reachable ONLY via its self-`[LOOP]` and the **`uP! Readiness Changework → Consultation` BACK-edge** [25→19].
- **Consequence:** the deterministic forward walk reaches `Completed` WITHOUT visiting Consultation. Treat Consultation as an OPTIONAL back-loop node for these variations, not a mandatory backbone step. Do NOT assert it appears in the forward subsequence.
- Contrast V1/V2/V3 (LYL-FC, LYL-NC, B!G-NC): there `Diagnostics → Consultation` AND `ATC Briefing → Consultation` ARE forward edges, so Consultation IS on the happy path.

### D3 — `B!G - Next Cycle` in-person + Triple-ATC sub-branch is NOT entry-reachable (V3 only)
- Backbone positions 15–18 + 21 (`Diagnostics In-person` [20], `Consultation In-person` [21], `In-person Completed` [22], `Triple ATC` [23], `Triple ATC Validation` [24], `Expanding Horizon Consultation` [27]) are **unreachable from the variation's first stage via the scoped oracle** (no operator edge from the main spine into `Diagnostics In-person`). `reachableInVariation` reaches 18 of 24 stages.
- The forward oracle walk for V3 terminates via the SAME main spine as V2 (…→Consultation→uP!RCW→Review→Self Evolution Report→Completed). To exercise the in-person branch a spec must SEED a token directly onto `Diagnostics In-person` (operator-drag entry — runtime, off-config; validated §2 item 3).

### D4 — `Triple ATC` [23] is `selfmovable:true` + `link` yet its ONLY configured move is an OPERATOR edge (V3)
- `actiontype:"link"` + `selfmovable:true` would normally imply a self-move on link-complete, but the only `nextstage`/oracle edge is `OP Triple ATC → Triple ATC Validation`. There is NO selfmove edge out of Triple ATC (the next backbone stage, Triple ATC Validation, has an explicit operator button, so `flow-model` suppresses the implicit self-move — `explicit` check in `flow-model.js:65-68`). **Flag:** the `selfmovable` flag and the actual legal exit disagree; the legal exit is operator-driven. Assert no participant self-move advances a Triple ATC token.

### Drift summary table

| Variation | DRC dead-forward (D1) | Consultation off-happy-path (D2) | In-person unreachable (D3) | Triple-ATC selfmv mismatch (D4) |
|---|:--:|:--:|:--:|:--:|
| V1 LYL-FC | ✅ | — (Consultation on path via Diagnostics→/ATC Briefing→) | — | — |
| V2 LYL-NC | ✅ | — | — | — |
| V3 B!G-NC | ✅ | — | ✅ | ✅ |
| V4 Prodigies-NC | ✅ | ✅ | — | — |
| V5 Prodigies-FC | ✅ | ✅ | — | — |
| V6 uP!-FC | ✅ | ✅ | — | — |
| V7 uP!-NC | ✅ | ✅ | — | — |
| V8 uP!-3rd | ✅ | ✅ | — | — |
| V9 Prep-Hold | n/a (single stage) | n/a | n/a | n/a |

---

## 4. The 2 known orphans (validated §8; oracle baseline)

`oracle(cfg).orphans` = exactly these two (asserted by `oracle-selftest.spec.ts`):

1. **`My Evolution Wishlist`** [12] — `selfmovable:true`, `actiontype:form`, but `inN==0 && outN==0`. It is **configured in `stageproperty` but NOT present in ANY variation's `stages[]`** — no variation routes through it, and it has no `nextstage`. A genuine config orphan (a form stage nobody can reach). NOT in any of the 9 variation backbones. Specs must NOT seed a token here expecting a flow.
2. **`uP! Prep Process - Hold`** [1] — the V9 Prep-Hold sole stage. Orphan in the GLOBAL graph (no edge in/out) but a legitimate single-node terminal within variation V9 (see §2 V9). Its orphan status is EXPECTED and must remain in the baseline assertion.

> Do NOT "fix" these in the fixture — the suite's oracle-selftest depends on exactly this 2-orphan baseline to prove the detector is not vacuously green. A change to the orphan set is a real regression signal.

---

## 5. Quick-reference: what each variation spec asserts (maps to PLAN §3.D invariants)

For EVERY multi-stage variation the universal invariant set (PLAN §3.D) is:
- **ORPHAN** — exactly one token (the walked participant).
- **EVERY-MOVE-LOGGED** — one `queue stage log` row per transition (both SELF/SIM moves and OP moves write a log row; participant map row 3/6).
- **NO-STAGE-SKIPPED** — each observed `previousstage→currentstage` is an **oracle edge from this file**, NOT a mere backbone adjacency (see §3 drift). Use `outEdgesForVariation(M, prev, vid)` to validate.
- **TERMINAL-REACHED** — `currentstage == Completed`, `nextstage == []` (V9: `currentstage == uP! Prep Process - Hold`, entry==terminal).
- **COUNT-DRIFT** — src−1 / dst+1, Σ conserved on the board.
- **LOOP-BOUND** — each `[LOOP]`/`[BACK]` edge traversed ≤2; a 3rd FAILS (PLAN risk 13).
- **SELFMOVABLE-GATE** (PLAN P1 #6) — each stage's `selfmovable` matches this file; a SIM self-move on a `selfmovable:false` stage must produce NO `queue_token` write (negative assertion). The link stages [10] (V2/V3/V7/V8) and gate stages assert no participant write.

Per-variation specials:
- **V1 LYL-FC:** Scope Enhancement self-loop ≤2; Diagnostics↔DRC round-trip ≤2; assert DRC→ATC Preparation is illegal (D1).
- **V2 LYL-NC / V7 uP!-NC:** identical stage list; the DISCRIMINATOR is the Diagnostics/ATC-Briefing branch set (V2 has →Consultation, V7 does not). Link-stage no-write [10].
- **V3 B!G-NC:** in-person + Triple-ATC branch needs a seeded drag entry (D3); Triple ATC selfmv mismatch (D4); the longest happy path.
- **V4/V5/V6/V8:** Consultation off-happy-path (D2); variation-scoped Diagnostics dropdown (V8 = 5 buttons, V4/V5/V6 = 6 buttons; V8 omits →Self Evolution Report).
- **V9 Prep-Hold:** single-stage; no-move/no-log; move-dropdown empty; no participant CTA.

---

*Generated from `e2e/fixtures/sample-queue-config.json` via `e2e/lib/flow-model.js` (`build`+`oracle`+`outEdgesForVariation`+`reachableInVariation`). Regenerate after any config change (PLAN risk 11). All `[idx]` values are positions in the 30-entry global `stages[]` array.*
