# Workshop Live: a live feed of completed sub challenges (2026-11-19)

The operator asked for this on 2026-11-19 and answered the open questions:
- **One row per completion:** a feed, newest first.
- **Access:** everyone signed in.
- **Which workshops:** the Live button shows only on Active rows. Active means any of the three switches is on (`active`, `webactive`, `eiflixmobileactive`) and the workshop is not marked completed. This is the green Active chip's rule (`isActiveWorkshop`).
- **Opens in:** a new tab.

## /workshops: the Live button

- **Where:** a new icon button in the Actions column, placed after Dashboard and before Edit.
- **When it shows:** `*ngIf="isActive(workshop)"`, which reuses the existing helper.
  - The operator said "mobileactive", but the only mobile switch is `eiflixmobileactive`, and the helper already uses it.
- **Looks:**
  - icon `sensors`;
  - tooltip "Live";
  - class `live-btn`, coloured green with the `--success` / `--success-bg` tokens to match the Active chip;
  - `.col-actions` is widened so four buttons fit.
- **Click:** `window.open('/workshoplive/' + workshop.id, '_blank')`, like the Dashboard button.
- **Hook:** `wor-live`, a literal. It is not `wor-type-filter-live`, which is the type filter.

## /workshoplive/:id (new screen, `src/app/New-Workshop/workshop-live/`)

- **Route:** `{path: 'workshoplive/:id', loadComponent: …WorkshopLiveComponent, canActivate:[authGuard]}`, placed next to `workshop_dashboard/:id`.
  - **No extra access check**, as the operator chose.
  - **Route-config entry:** authGuard is data-driven, so **each real environment needs a `/workshoplive` entry in the `dashboard` route-config collection** (via /routeconfiguration) with the roles that should see it. Without that entry, everyone gets "Contact Admin". The operator adds it; the emulator seed gets it in the hub.
- **Live data:** one listener, the same query the dashboard runs:
  `onSnapshot(query(collection(fs,'participant workshop'), where('workshopref','==', doc(fs,'workshopconfiguration', id))))`
  - It runs on the automatic single-field index, so no index deploy is needed.
  - It is unsubscribed on destroy. Updates go through NgZone and markForCheck.
- **Rows:** from each participant workshop doc, every sub challenge (`challenges[].challenges[]`) with `status === 'completed'` becomes one row. The row shows:
  - participant name;
  - phone (country code + number);
  - email;
  - main challenge name (`heading: subheading`);
  - sub challenge name (`name`, else `heading`);
  - completed date and time.
- **Order:** newest `completed` first.
  - A completed step with no date goes last and shows "—".
  - "Finished", "in review" and other statuses are not completions, matching the dashboard's rule.
  - Assignments use `completed`, which is the review approval time.
- **Names:** resolved by `challengeid` against the workshop config doc (read once), falling back to the participant doc's own copy. The copy can drift when the config sync does not run.
- **People:** looked up from `participant metadata` (`where profileid in` batches of 30), falling back to `new_user_data` by doc id.
  - **Rows render at once.** Names fill in when the lookup lands, so the screen never waits on it.
  - **People who appear later in the live feed** are looked up on their own.
  - **Not found:** a person in neither collection shows as "Unknown". Phone and email show "—".
- **Header:**
  - the workshop title;
  - a "Live" indicator (green dot);
  - the number of completions;
  - "Updated hh:mm:ss", from the last snapshot.
- **States:** loading, empty ("No completed steps yet"), and failed to load ("Couldn't load the live list" plus a Retry button).
- **Highlight:** rows that arrive while the page is open get a short highlight.
- **Layout:** a table on wide screens and stacked cards below 600px. White, light theme. No Firestore field names in the UI.
- **Pure logic in `workshop-live.engine.ts`** (no `.component` suffix), unit-tested in `workshop-live.engine.unit.spec.ts`:
  - flatten the docs into completion rows;
  - sort them;
  - resolve the names;
  - format the phone number;
  - work out which ids are missing.

### Hooks (prefix `wlive-`, all literal)

| Hook | Element |
|---|---|
| `wlive-title` | the workshop title |
| `wlive-live` | the Live indicator |
| `wlive-count` | the number of completions |
| `wlive-updated` | the "Updated" time |
| `wlive-loading` | the loading state |
| `wlive-empty` | the empty state |
| `wlive-error` | the error state |
| `wlive-retry` | the Retry button |
| `wlive-row` | one completion row |
| `wlive-name` | participant name |
| `wlive-phone` | phone |
| `wlive-email` | email |
| `wlive-main` | main challenge name |
| `wlive-sub` | sub challenge name |
| `wlive-completed-at` | completed date and time |

## Hub (starlabs-e2e-tests)

- **New gated file** `workshops/workshop-live.spec.ts` (WLV-xx), with header prefixes `wor-` and `wlive-`.
- **Seeds:**
  - add `/workshoplive` to ROUTES in `seed-workshops.js`;
  - add a completed-but-switch-on workshop for the negative control;
  - add participant workshop docs with distinct `completed` stamps, a completed step with no date, a 'finished' step, and a doc on another workshop.
  - New workshopconfiguration seeds carry **no** `testrunid` (WS-01 counts exactly 3).
- **Cases:**
  - **Live button visibility:** shown on active, web-only and mobile-only rows; hidden on inactive, done, and completed-with-a-switch-on rows.
  - **Clicking it** opens `/workshoplive/<id>` in a new tab.
  - **Rows:** they show name, phone and email; they are ordered newest first; a step with no date goes last; 'finished' steps and other workshops are not shown.
  - **Live updates:**
    - a completion written while the page is open moves to the top without a reload;
    - a new participant's name fills in.
  - **Empty state:** a workshop with no completed steps shows it.

## Note

`app.routes.ts` is cross-cutting in the suites manifest, so CI will run every ciReady suite for the branch.

## Addition: pagination and search (2026-11-19, operator)

- **The ask:** "pagination wise so show 20 1st then pagination and search filter".
  - **Server-side paging was asked about and declined.** "load 20 20" from Firestore is not possible: completion dates sit inside each doc's challenges array, and nothing at doc level can be ordered by them. The operator's answer: "dont create any colllection or cloud function for this". So this is browser-side only, with no new collection, no Cloud Function and no index.
- **Data loading is unchanged.** The single live listener and the people lookup stay exactly as they are. Only the display changes.
- **Pagination:**
  - **20 rows per page, newest first.** Page 1 shows the 20 most recent completions.
  - **Controls:**
    - Previous and Next buttons, disabled at either end;
    - "Page X of Y";
    - "Showing A–B of N".
  - **No pagination bar** when everything fits on one page.
  - **Live arrivals** keep the user on their current page; the counts update. On page 1 a new completion appears at the top, as now.
  - **Past the end:** if the page count shrinks below the current page, the view moves to the last page.
- **Search:** one box above the list that matches **name, phone or email**.
  - Case-insensitive and partial.
  - Phone matching ignores spaces, "+" and dashes, so "99999" matches "+91 9999900000".
  - Typing resets to page 1. A clear button empties the box.
  - When nothing matches, the list shows "No completions match your search" with a clear-search action.
  - A row whose person is still loading matches once their details arrive.
- **New hooks (literal, `wlive-` prefix):**

  | Hook | Element |
  |---|---|
  | `wlive-search` | the search input |
  | `wlive-search-clear` | the clear button |
  | `wlive-no-match` | the no-match state |
  | `wlive-no-match-clear` | its clear-search action |
  | `wlive-pager` | the pagination bar |
  | `wlive-prev` | Previous |
  | `wlive-next` | Next |
  | `wlive-page` | "Page X of Y" |
  | `wlive-range` | "Showing A–B of N" |

- **Pure logic** (filtering, phone normalising, page slicing and clamping) goes in `workshop-live.engine.ts`, with unit tests.
- **Hub:** new cases in `workshop-live.spec.ts`:
  - 25+ completions give pages of 20 and 5, newest first, with Previous and Next disabled at the ends;
  - search by part of a name, an email and a phone (in any format);
  - search resets to page 1;
  - the no-match state and clearing it;
  - a live arrival on page 1 goes to the top.

## Addition: Journey and Customer status columns (2026-11-19, operator)

The operator's request: "show the journey and customer status and also if the user is from new_user_data the journey i want as New User and customer status also i want as New user".

- **Two new columns after Email:** Journey and Customer status. On the card layout, they show as two more fields on each card.
- **Existing participants** (`participant metadata`):
  - **Journey** is the name of `activejourney` from the `journey` collection. The collection is read once, is small and never blocks the rows.
    - An id with no name shows "—" rather than the raw id.
    - No active journey also shows "—".
    - This follows the workshop dashboard's Existing Users journey filter.
  - **Customer status** is `customerstatus` in title case: "Active", "Non Active", "Discontinued", "Banned", "Late". Empty shows "—".
- **New users:** both columns read **New User**.
  - **The rule:** the dashboard's `isNewUserProfile`, meaning the person has a `new_user_data` doc whose `movedtoexist !== true`.
  - **Why it needs an extra lookup:** a still-new user can also have a `participant metadata` doc, so `new_user_data` is now asked for every person, not only for those metadata lacks. This is one more batched read per 30 people. It runs in parallel and never blocks the rows.
  - **Unchanged:** the name, phone and email precedence (metadata first).
  - **Converted users:** a user moved to existing shows their metadata journey and status.
- **While a person is loading,** both cells show the same quiet placeholder as the name. Someone found nowhere shows "—".
- **Search is unchanged:** name, phone and email only.
- **New hooks:** `wlive-journey` and `wlive-status` (literal).
- **Pure logic** goes in `workshop-live.engine.ts`, with unit tests:
  - the journey label;
  - the status label;
  - the new-user rule.
- **Hub:** new cases in `workshop-live.spec.ts`:
  - an existing participant with an active journey and a status;
  - one with no journey ("—");
  - a still-new user who has both a `new_user_data` doc and a metadata doc reads "New User" in both columns;
  - a converted user (`movedtoexist: true`) shows their metadata values;
  - live: a newly arrived new user reads "New User".
