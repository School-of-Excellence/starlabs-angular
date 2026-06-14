# Prescribe ATC — How It Works

> A guide written so **anyone** can understand it.
> Part 1 is for everyone (no tech knowledge needed). Part 2 is for developers.

---

# PART 1 — For Everyone

## 1. What is this screen?

The **Prescribe ATC** screen is where a specialist writes an ATC for a participant.
Think of it like a smart form. While the specialist types, the form **saves itself
automatically** in the background — so nothing is lost, even if the laptop closes,
the browser crashes, or the internet drops.

When the specialist is finished, they press **Submit**, and the ATC becomes official.

## 2. The five ideas you need to know

| Idea | In plain words |
|------|----------------|
| **Draft** | A work-in-progress ATC that hasn't been submitted yet. It's saved continuously. |
| **Autosave** | The form quietly saves itself every time something changes. No "Save" button needed. |
| **Offline** | When there's no internet. The form **still works** and saves on the device. |
| **Media** | Audio recordings and images attached to the ATC. |
| **Submit** | Finalising the ATC. Once submitted, the draft is removed (hidden). |

## 3. The golden rule

> **Pick the participant first.**

The rest of the form is locked until a participant is chosen. This prevents the #1
mistake: typing a whole ATC and then realising it wasn't attached to anyone.

Once a participant is selected:
- their **name is locked** (you can't accidentally change who the ATC is for),
- the **full form opens up**,
- **autosave turns on**.

To work on a *different* participant, you use the **"Create New ATC"** button (it opens
a fresh screen in a new tab) — you don't change the name in place.

## 4. What the specialist sees and does (the journey)

```
1. Open the screen.
2. (If they have an assignment) a popup asks: use this assignment, or start fresh?
3. Choose a participant's name.            ← form unlocks here
4. (If drafts already exist) a popup asks: continue an old draft, or start new?
5. Fill in the ATC: directive, adjustments, notes, media, etc.
      → every change saves automatically (you'll see "Draft saved").
6. Press Submit.
      → the ATC is recorded, the draft is removed, the screen resets for the next one.
```

Three buttons sit under the participant name once selected:
- **Open & Continue Another Draft** — switch to another saved draft for the *same* participant (only shows if there's more than the current one).
- **Create New ATC** — start a brand-new ATC in a new tab.
- **Copy Link For Collaborators** — share a **view-only** link so others can watch (they cannot edit).

## 5. The important part: nothing gets lost

This is the promise of the screen: **an ATC is never lost.**

| What happens | What the system does |
|--------------|----------------------|
| Internet is fine | Saves to the cloud instantly. |
| Internet is weak | Text saves right away; media catches up when it can. |
| Internet is down | Saves **on the device**; syncs to the cloud automatically when internet returns. |
| Laptop/browser closes by accident | Everything written so far is kept. Reopen → the draft is right there. |
| Closed while offline, reopened later | Reopen (online **or** offline) → the draft and its media come back. When online again, it syncs to the cloud by itself. |

A small **status bar stays pinned at the top** of the screen (just under the app
toolbar) at all times, so the specialist can always see whether work is saving, saved,
or failed — without scrolling. When offline it reads:
> *"You're offline — changes are saved on this device and will sync when you reconnect."*

The specialist can keep working, or safely close — **their work is safe either way.**

**One thing to know:** you can only **Submit** when online (an ATC has to reach the
cloud to become official). Offline, Submit is blocked with a friendly message, and the
draft stays saved until the connection is back.

---

# PART 2 — For Developers

## 6. The big picture

```
        ┌────────────────────────────────────────────────────────┐
        │                 PrescribeATCComponent                   │
        │  (the screen: form, autosave, submit)                   │
        └───────────────┬──────────────────────┬─────────────────┘
                        │                      │
              text/draft│                      │ media blobs
                        ▼                      ▼
        ┌──────────────────────────┐  ┌──────────────────────────┐
        │  Firestore (cloud DB)     │  │  MediaCacheService        │
        │  collection temporary_ATC │  │  (IndexedDB on device)    │
        │  + OFFLINE PERSISTENCE    │  │  holds un-uploaded media  │
        │  (durable IndexedDB cache)│  └──────────────────────────┘
        └──────────────────────────┘
                        │   on success / online
                        ▼
        ┌──────────────────────────┐
        │  Firebase Storage         │  ← final home for audio/images
        └──────────────────────────┘
```

Two kinds of "save" happen:
1. **The draft text** is saved to Firestore (`temporary_ATC`). Firestore's **offline
   persistence** keeps a durable copy in the browser's IndexedDB and auto-syncs to the
   cloud when online. We did **not** write any sync code — Firestore does it.
2. **Media blobs** (audio/images) can't use Firestore. Firebase Storage has **no offline
   mode**, so we keep the raw blobs in our own IndexedDB store (`MediaCacheService`) until
   they can be uploaded.

## 7. Where things live

| Thing | Location |
|-------|----------|
| The screen | `src/app/ATC/prescribe-atc/prescribe-atc.component.ts` (+ `.html`) |
| Local media store | `src/app/shared/media-cache.service.ts` |
| Offline persistence switch | `src/main.ts` (`initializeFirestore` with `persistentLocalCache` + `persistentMultipleTabManager`) |
| Draft documents (cloud) | Firestore database `firestore-atc`, collection `temporary_ATC` |
| Submitted ATCs (cloud) | `atc_alpha` / `atc_to_validate` (+ `atc_notes`) |
| Local media (device) | IndexedDB database `atc_media_cache`, store `pending` |
| Firestore offline cache | IndexedDB (managed by Firestore, don't touch) |

## 8. The draft document (what a `temporary_ATC` record looks like)

```jsonc
{
  "date": "2026-06-10",
  "product": "…",
  "atcdirective": "…",
  "profileid": "…",            // the participant
  "author":  { ... },          // activity → specialist refs
  "observer":{ ... },
  "mentor":  { ... },
  "transcript": [ … ],         // adjustments + procedures
  "consultationsummary": "…",
  "consultationpoint": "…",
  "notes": "…",
  "mentornotes": "…",
  "audioRecordings": [ "https://…" ],   // URLs of UPLOADED audio
  "noteImageURLs":   [ "https://…" ],
  "atcImageURLs":    [ "https://…" ],
  "delete": false,             // true = soft-deleted (submitted/removed)
  "authorprofileid": [ … ],
  "lastupdated": <serverTimestamp>
}
```

Media that hasn't uploaded yet is **not** in this doc — it lives as a blob in
`atc_media_cache` and is merged back into the screen when the draft is reopened.

## 9. Key state on the component

| Field | Meaning |
|-------|---------|
| `autoSaveID` | The current draft's id. **`null` = no participant chosen** (form locked). Set once when a participant is confirmed. |
| `autoSaveInFlight` | A promise chain that keeps saves **serialized** (one at a time, in order). |
| `existingDraftIds` | Ids of this participant's drafts — used to show "Open Another Draft". |
| `aigeneratedEntry` | True when opened from an AI-generated link (hides "Open Another Draft"). |
| `draftStatus` | `{message, code}` for the status bar. `code`: `0`=saving, `1`=saved, `-1`=failed. |
| `existingAudioURLs` / `existingNoteImageURLs` / `existingATCImageURLs` | URLs of media already uploaded (so we don't re-upload). |

## 10. The save flow (function by function)

```
field changes
   └─ autoSave()           ── wrapper: chains onto autoSaveInFlight (keeps order, 1 at a time)
        └─ runAutoSave()
             1. snapshot un-uploaded media → MediaCacheService.replaceDraft()   (durable)
             2. build the draft object (text + already-known media URLs)
             3. setDoc(temporary_ATC/autoSaveID, data)
                  • ONLINE  → await it (confirm server write)
                  • OFFLINE → DON'T await (it's already durable in IndexedDB);
                              this is what lets EVERY offline edit persist
             4. status → "Draft saved" / "Saved on this device…"
             5. ONLINE only: upload media → patch URLs into the doc → clear local blobs
```

Why step 3 matters: a Firestore write **does not resolve its promise while offline**.
If we `await` it offline, the next save can't run and later offline edits would be lost.
So offline we issue the write (durable immediately) and move on.

## 11. Reopening a draft (resume)

```
getATCoptions()                       ── lists drafts
   ├─ online  → getDocs(query)          (server; also refreshes the local cache)
   ├─ offline → getDocsFromCache(query) (cache; INCLUDES your offline/pending drafts)
   └─ pick a draft
        ├─ re-read it with getDoc(id)    (loads the latest offline edits, not the stale list snapshot)
        ├─ load text from the doc
        ├─ load uploaded media (loadAudio/Note/ATCFromURLs):
        │     • always keep the uploaded URL (shows/plays when online)
        │     • offline: kept by URL with a null placeholder so the arrays stay
        │       index-aligned with existingAudioURLs / existingNoteImageURLs / existingATCImageURLs
        │     • loads sequentially (correct order); never aborts the import if a fetch fails
        └─ reattachPendingMedia()     ── pulls any un-uploaded blobs from MediaCacheService
                                         back onto the screen; uploads them if online
```

This is how a draft written offline (then closed) comes back complete — the text from
Firestore's cache, the already-uploaded media kept by its URL, and the not-yet-uploaded
media from `atc_media_cache`. Everything stays index-aligned, so on the next save nothing
is lost or duplicated.

**Why alignment matters:** the media arrays (`audioBlob`, `selectedNoteImages`,
`selectedATCImages`) are paired by position with the "already uploaded" URL lists. If a
position is dropped (e.g. an offline fetch failure), the upload step could overwrite the
wrong slot and lose URLs. Keeping a placeholder per uploaded item prevents that.

## 12. Submitting

```
submit()
   ├─ if OFFLINE → block with a message (draft kept), stop here
   ├─ await autoSaveInFlight            ── make sure the last save finished
   ├─ validate fields
   └─ uploadATC() → writes atc_alpha / atc_to_validate (+ notes)
        └─ uploadCompleted()
             ├─ soft-delete the draft (set delete:true) — AWAITED (so it can't reappear)
             ├─ clear the draft's local media from MediaCacheService
             └─ reset the screen (or, in arena mode, close the tab)
```

## 13. How to test it (manual)

Use Chrome DevTools → **Network → Offline** to simulate no internet, and
**Application → IndexedDB** to watch `atc_media_cache` and the Firestore cache.

1. **Offline text:** go offline, type → status shows "Saved on this device". Reopen offline → text is there.
2. **Offline close/reopen:** go offline, make several edits, **close the tab**, reopen → all edits present. Go online → check the cloud (`temporary_ATC`) updated.
3. **Offline media:** go offline, add audio/image → see the blob in `atc_media_cache`. Reopen → media shows. Go online → media uploads, blob disappears from cache.
4. **Submit offline:** click Submit while offline → blocked with a message, draft kept.
5. **Submit online:** Submit → ATC written, draft gone, screen resets.

## 14. Glossary

| Term | Meaning |
|------|---------|
| **Draft** | Unsubmitted ATC, stored in `temporary_ATC`. |
| **Soft-delete** | Marking `delete:true` instead of actually deleting — keeps history, hides it from lists. |
| **Offline persistence** | Firestore feature that caches data in IndexedDB so the app works offline and syncs later. |
| **IndexedDB** | The browser's built-in database. Survives closing the tab. |
| **Blob** | Raw binary data (an audio clip or image) before it's uploaded. |
| **Serialized saves** | Saves run one after another, never overlapping, so the newest data always wins. |
| **autoSaveID** | The id of the current draft; also the "gate" — no id means no participant selected. |

## 15. Known limitations / future work

- **Empty drafts:** a draft can be created with no real content. A future "don't save empty ATC" rule will clean this up.
- **Orphan media:** if a draft captured media offline and is *never reopened* after reconnecting, its blob stays in `atc_media_cache` (storage clutter, **not** data loss). It uploads the next time that draft is opened.
- **Offline view of already-uploaded media:** media that lives in the cloud is *listed* offline but can't play/preview until you're back online (it isn't cached locally). It is never lost — it reappears once online.
- **Collaborator link is view-only** (`/liveprescription/...`) — concurrent editing isn't supported by design.
- **Private/incognito mode:** IndexedDB may be unavailable; the app still works online but offline durability is reduced.

## 16. Where to start if you're new to this code

1. Read `runAutoSave()` — it's the heart of saving.
2. Read `getATCoptions()` — how drafts are listed and resumed.
3. Read `media-cache.service.ts` — small and self-contained.
4. Read `submit()` → `uploadATC()` → `uploadCompleted()` — the finish line.
5. Remember the golden rule: **`autoSaveID` is the gate.** Most behaviour keys off whether it's set.
