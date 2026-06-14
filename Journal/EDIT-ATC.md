# Edit ATC — Offline Draft Layer

> The Edit ATC screen (route `/editATC`) lets a specialist revise an already-submitted ATC.
> It shares the same offline ideas as Prescribe ATC — read **[PRESCRIBE-ATC.md](PRESCRIBE-ATC.md)**
> first for the core concepts (draft, autosave, offline persistence, media cache). This note
> only covers what is **different** for Edit ATC.

---

## How it differs from Prescribe ATC

| Thing | Prescribe ATC | Edit ATC |
|-------|---------------|----------|
| Entry | pick a participant (gate) | the ATC is fixed by the route (`:type/:atcID`) |
| Draft collection | `temporary_ATC` (many per participant) | **`temporary_edit_ATC`** (one per ATC, keyed by `atcid`) |
| Find draft | query + `getDocsFromCache` offline | **direct `getDoc(atcid)`** — already offline-safe |
| Participant lock / "New ATC" / "Open Another" buttons | yes | **not applicable** (single ATC, single draft) |
| Media in the draft | URLs in the doc + blob cache | **only newly-added media** is cached (existing ATC media stays on the server); media is uploaded at submit, as before |
| Soft-delete on submit | separate awaited update | already part of the submit **batch** (`delete:true`) — unchanged |

## What the offline layer added (additive only — edit/submit logic untouched)

1. **Serialized autosave** — `autoSave()` is now a chain (`autoSaveInFlight`) → `runAutoSave()`,
   so rapid edits never overwrite each other.
2. **Offline-durable text** — `setDoc` to `temporary_edit_ATC`; **online** awaits it, **offline**
   doesn't block (the write is already durable in Firestore's IndexedDB cache). Every offline
   edit persists and syncs on reconnect. (Persistence itself is enabled globally in `src/main.ts`.)
3. **Offline-durable media** — new recordings/images are snapshotted to `MediaCacheService`
   (IndexedDB `atc_media_cache`) on every media change and on each save; they're re-attached
   when the draft is reopened, and cleared after a successful submit. The existing submit-time
   upload (`updateChangeWorkBrief`) is unchanged — it just receives the re-attached blobs.
4. **Submit offline guard** — `submit()` is blocked while offline (the draft stays saved);
   it also flushes the in-flight save first.
5. **Status bar + messaging** — fixed just under the toolbar (always visible), friendly
   messages ("Saved on this device…"), no raw error JSON, and a Retry button on failure.

## Where things live (Edit ATC specifics)

| Thing | Location |
|-------|----------|
| The screen | `src/app/ATC/edit-atc/edit-atc.component.ts` (+ `.html`, `.css`) |
| Edit-draft documents (cloud) | Firestore `firestore-atc`, collection `temporary_edit_ATC` (id = `atcid`) |
| Local media (device) | IndexedDB `atc_media_cache` (shared with Prescribe; keyed by id) |
| Save heart | `runAutoSave()` |
| Resume | `getATCoptions()` (re-attaches cached media) |
| Finish | `submit()` → `updateChangeWorkBrief()` (batch update + soft-delete + cache clear) |

## Manual test (verify on your side)

1. Edit offline → status shows "Saved on this device". Reopen offline → text is back.
2. Add audio/image offline → close → reopen → media re-attaches (check `atc_media_cache`).
3. Submit offline → blocked with a message; the draft stays.
4. Submit online → ATC updated, `temporary_edit_ATC` marked `delete:true`, media cache cleared.
5. Scroll → the status message stays pinned under the toolbar.
