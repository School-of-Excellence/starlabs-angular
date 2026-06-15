# HANDOVER — Firestore slowness & media-not-loading (open issue)

> For the next session. Read this top-to-bottom before touching anything.
> Date of handover: continuation of the offline-ATC work.

---

## 1. The OPEN issue (this is what to solve)

After the offline-ATC feature shipped, the user reports **two app-wide problems**:

1. **Firestore reads are very slow across the WHOLE app** — every screen, not just ATC.
2. **Firebase Storage media (audio/images) does not load properly on every screen** — the user
   has to **hot reload** (sometimes more than once) to get media to appear.

**Scope is app-wide** → the cause is something shared by the entire app, not a single component.

**Status:** NOT fixed. Diagnosis below is a *hypothesis only* — not confirmed.

---

## 2. Prime suspect (hypothesis — unconfirmed)

The only app-wide change from the offline work is **global Firestore offline persistence in `src/main.ts`**:

```ts
const offlineCache = { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) };
const firestore = initializeFirestore(app, offlineCache);
initializeFirestore(app, offlineCache, 'firestore-atc');
```

Why it's suspected (reasoning, not yet verified by running):
- **No try/catch, runs at module top-level** → if IndexedDB persistence can't initialise on a browser
  (private mode, blocked storage, multiple tabs) it throws *before* bootstrap → whole app fails to load.
- **HMR re-runs `main.ts`** in dev → `initializeFirestore` can only run once per DB → throws
  "already started" → reload loops.
- **`persistentMultipleTabManager` on the DEFAULT db** (used by the entire app's real-time listeners)
  → IndexedDB writes on every snapshot + cross-tab lock → could explain app-wide slowness.

⚠️ This is a hypothesis. The user has NOT confirmed it. Do not assume it's the only cause.
Media lives in **Firebase Storage**, which persistence does NOT touch — so the "media not loading"
symptom is not fully explained by persistence alone and needs its own investigation.

---

## 3. What was already tried and then REVERTED (do not blindly re-apply)

In the previous session a fix was implemented WITHOUT the user's approval, and the user asked to revert it:
- `main.ts`: guarded persistence (skip in dev + try/catch fallback) — **REVERTED**.
- `prescribe-atc.component.ts`: 3 media loaders changed parallel→sequential earlier, then reverted
  back to parallel as part of the "fix", then **REVERTED back to sequential**.

Both files are now back to the exact state in which the user reported the issue. Lesson learned:
**the user wants diagnosis and options FIRST, and will choose the solution.** Do not implement a fix
until the user explicitly approves the approach.

---

## 4. HARD RULES (from saved memory — follow these)

1. **NEVER run, serve, build, preview, or test ATC features.** No `ng serve` / `ng build` / `ng test`,
   no Playwright/Karma, no preview/browser tools. Debug by **reading code only**. Hand all verification
   to the user with a manual checklist. (Running the app at all is effectively running ATC — avoid it.)
2. **Teach after every change** — explain what was done and define any new concept in plain language.
3. **Editing style:** show full file changes; never alter unrelated spaces/indentation.
4. **State facts + diagnosis first; let the USER decide the solution.** Do not make changes unless asked.

---

## 5. What is already SHIPPED (don't break it)

The offline draft feature is live in BOTH ATC screens:
- **Prescribe ATC** (`src/app/ATC/prescribe-atc/`) and **Edit ATC** (`src/app/ATC/edit-atc/`).
- Mechanisms: Firestore offline persistence (the `main.ts` change) for the draft document +
  `MediaCacheService` (`src/app/shared/media-cache.service.ts`, IndexedDB `atc_media_cache`) for media blobs.
- Also shipped: scroll-to-missing-field + inline "required" validation, fixed status bars,
  serialized autosave, offline submit guard.
- Full write-ups: **`Journal/PRESCRIBE-ATC.md`** and **`Journal/EDIT-ATC.md`**.

Any fix for the perf issue must NOT regress the shipped offline behaviour without the user agreeing.

---

## 6. Key files

| File | Role |
|------|------|
| `src/main.ts` | **Global Firestore persistence init** (prime suspect). |
| `src/app/app.config.ts` | `provideFirestore`, `provideFirebaseApp` (note: app is also init'd here AND in main.ts). |
| `src/app/shared/media-cache.service.ts` | IndexedDB blob cache for offline media. |
| `src/app/ATC/prescribe-atc/prescribe-atc.component.ts` | Prescribe screen (loaders, autosave, submit). |
| `src/app/ATC/edit-atc/edit-atc.component.ts` | Edit screen (same offline layer). |
| `Journal/` | Feature documentation. |

---

## 7. Suggested investigation (READ-ONLY — do not change code until user approves)

- Confirm whether the slowness/media issue reproduces with persistence **disabled** (user can test a
  build with `getFirestore()` instead of `initializeFirestore(...persistentLocalCache...)`).
- Investigate the **media** symptom separately: it's Firebase Storage, not Firestore. Check whether
  the service worker (`provideServiceWorker('ngsw-worker.js')` in `main.ts`) is caching/serving stale
  Storage responses — that would explain "hot reload fixes it". This is a strong, separate lead worth checking.
- Consider whether the **double `initializeApp`** (main.ts + `provideFirebaseApp` in app.config.ts)
  interacts badly with `initializeFirestore`.
- Possible scoping lever (only if approved): enable persistence on `firestore-atc` ONLY, leave the
  default DB on the in-memory cache, so the app-wide overhead is removed but ATC drafts stay offline.

**Present findings and options to the user. Let the user pick the fix.**
