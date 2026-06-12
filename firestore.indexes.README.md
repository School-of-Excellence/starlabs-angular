# firestore.indexes.json — why these indexes

Deploy with: `firebase deploy --only firestore:indexes`

Single-field equality / `in` filters (e.g. `clientissue.status.status`, `coachedby ==`)
use Firestore's automatic single-field indexes and are deliberately NOT listed.

| Index | Used by | Effect |
|---|---|---|
| `participantjourneyproduct (journeystatus, onboarded)` | `loadServerCounts()` — `where(journeystatus in [...]) + where(onboarded ==)` (component line ~615) | Without it the not-started count query silently `.catch()`es and the card stays **0**. Deploying it makes an already-written aggregation count work. |
| `participantjourneyproduct (coachedby, __name__)` | Forward-looking | Enables a scoped, cursor-paginated coach view (`where(coachedby ==) + orderBy(documentId())`) to replace the full `participantjourneyproduct` scan in `loadFullPortfolio`. **Not used until that query is written** (Phase 2 item 2, pending sign-off). |
