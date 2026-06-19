# 2026-06-11 — FillForm `fileref` cross-database investigation

**Topic:** Whether `FillForm.updateJourney()` builds its `fileref` DocumentReference
with the wrong Firestore database, and what the correct construction is.

## The reported concern

`breakthroughs-flutter/lib/Delivery Form/FillForm.dart` writes submitted forms to the
**named** `firestore-forms` database (`firestoreForm = FirebaseFirestore.instanceFor(
app: Firebase.app(), databaseId: "firestore-forms")`, line ~60; `submitform()` sets
`firestoreForm.collection(collectionName).doc(docID)` at line ~2237, with
`collectionName = "formsByClient"`). But `updateJourney(String formPath)` appended the
`fileref` entry using `firestoreDefault.doc(formPath)` — the **default** database. The
worry: the stored ref points at a `formsByClient/{id}` doc that doesn't exist in the
default DB (it exists only in `firestore-forms`).

## What the investigation found

**1. The only LIVE form-`fileref` consumer never uses the ref's database identity.**
The read-back at `FillForm.dart:222` resolves the prior submission by **doc-id** —
`firestoreForm.collection(collectionName).doc(widget.submittedForm)` — against the
correct `firestore-forms` instance. `submittedForm` is sourced from `fileref.last.id`
upstream. The journey/delivery-sequence consumers
(`participantJourneySequence.dart:1107`, `participantDeliverySequence.dart:331`) also
use only `.id`, and both sit inside `/* … */` block comments (dead code). The only live
`.path` re-resolvers — `home.dart:776` / `home.dart:883` — are **event/queue**
deliverables, not forms.

**2. Firestore forbids cross-database references; the hypothesized fix can't work.**
A `DocumentReference` field cannot point to a different database than its containing
document. The Firestore core **silently coerces** a foreign-db ref to the parent
document's database, logging only a warning — *"contains a document reference within a
different database … treated as a reference in the current database instead"*
(firebase-js-sdk #8166; core TODO `b/64130202`). The Flutter codec does serialize the
field-ref's `databaseId` Dart→native (`firestore_message_codec.dart:76-78,106-108`), but
the core applies the same coercion. Since the parent deliverable doc is
`firestoreDefault.doc(widget.deliverablepath)` (default DB), the stored `fileref`
round-trips as a **default-db** ref **whichever instance builds it**. So changing line
2319 to `firestoreForm.doc(formPath)` is a functional **no-op** that merely adds a
console warning on every read.

**3. The default-instance construction matches the app-wide convention.**
Every popped-path consumer rebuilds the form path with the **default** instance and
stores it into a default-db doc — `formQueue.dart:99`, `modeChecklist.dart`,
`bigactivity.dart:1107`, `queueControl`/`queueStageDetail` (`moveQueueStage`),
`workshopchallenges.dart:7814`. The only places that build a `firestore-forms` ref store
it into a `firestore-forms` doc (same-db), e.g. `workshopchallenges.dart:4059`. There is
no working precedent in the repo for a cross-db reference, because Firestore doesn't
allow one.

## Decision (operator-confirmed)

**Keep `firestoreDefault.doc(formPath)`** and document the invariant in code. No behavior
change — the form flow already works because reads resolve by doc-id against
`firestore-forms`. Rejected the hypothesized `firestoreForm.doc(formPath)` change: it
cannot make the ref resolve to `firestore-forms` and would only spam a per-read warning.

**Changed:** added an explanatory comment block above the `fileref` write in
`updateJourney()` (`FillForm.dart` ~2318) stating the DB topology, the cross-db coercion
rule, and an explicit "do NOT fix this to firestoreForm.doc(formPath)" so a future
session doesn't re-introduce the warning spam.

## What surprised us

The "obvious bug" was real as an *observation* (the stored ref does resolve to a
nonexistent default-db path) but **unfixable by instance choice** — the database identity
of a `fileref` on a default-db deliverable is forced to default by Firestore itself. The
flow is correct only because the live read path sidesteps the ref entirely and uses the
form doc-id.

## Pending / follow-ups (out of scope here)

- **Event/queue mode resolution in `home.dart`** (`:776` event request, `:883` queue
  token) re-resolve `fileref.first.path` via the **default** instance. If those tokens /
  request docs actually live in `firestore-forms`, this is the same mismatch but **live**
  (it dereferences via `.get()`/`.snapshots()`, not `.id`). Not traced to a conclusion
  this session — needs verification of where those deliverable `fileref`s are written
  (client vs. cloud function, which instance) before deciding if it's a real break.
- If robustness is ever wanted, store the form path/id as an explicit **string** field
  alongside `fileref` so no consumer depends on ref database identity. Deferred (schema
  addition; not needed today).
