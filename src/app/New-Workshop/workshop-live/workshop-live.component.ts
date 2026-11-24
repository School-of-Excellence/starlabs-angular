import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  DocumentReference, QuerySnapshot, Unsubscribe,
  collection, doc, documentId, getDoc, getDocsFromServer, getFirestore, onSnapshot, query, where,
} from '@angular/fire/firestore';
import { isTransientReadError, retryRead } from '../workshop-dashboard/workshop-dashboard.engine';
import {
  ChallengeNameIndex, CompletionRow, FALLBACK_TITLE, LiveViewRow, PageSlice, ViewRowCache,
  challengeNameIndex, chunk, completionStamps, completionsLabel, docCompletionRows, filterRows, formatClock, freshKeys,
  isLookupId, isStillNewUser, journeyNameIndex, liveViewRows, matchesLabel, mergeCompletions, missingIds,
  normaliseSearch, pageLabel, pageSlice, rangeLabel, searchAwaitingPeople, shownPerson, workshopTitle,
} from './workshop-live.engine';

type LiveState = 'loading' | 'ready' | 'empty' | 'error';
type ConfigState = 'pending' | 'ready' | 'missing' | 'failed';
/** The journey names: idle = not asked yet; failed = the last read failed (names unresolved, "—"). */
type JourneyState = 'idle' | 'pending' | 'ready' | 'failed';
/** connecting = no server answer yet; live = in sync with the server; offline = was live, now answering from the cache. */
type Connection = 'connecting' | 'live' | 'offline';
/** missing = no such workshop; failed = it could not be read or listened to. */
type ErrorKind = 'missing' | 'failed';

/** How long a fresh row stays highlighted (the CSS animation runs 2.4s). */
const FRESH_MS = 3000;
/** A failed people lookup or workshop read is asked again after this, even if no snapshot arrives meanwhile. */
const RETRY_MS = 10000;
/** A person found in neither people collection is asked once more after this (their profile may still be landing). */
const UNKNOWN_RECHECK_MS = 45000;
const READ_RETRY = { delaysMs: [1000, 3000], timeoutMs: 20000 };

/**
 * /workshoplive/:id — a live feed of completed sub challenges for one workshop, newest first
 * (plan specs/plans/2026-11-19-workshop-live.md). Rules live in workshop-live.engine.ts.
 *
 * Reads: ONE live listener on 'participant workshop' (the dashboard's query, automatic single-field index);
 * the workshop config once (title + challenge names); the 'journey' collection once (journey names); and the people
 * for the ids not asked yet, per batch of 30: participant metadata by profileid AND new_user_data by id, side by side
 * (new_user_data is asked for everyone, to know who is still a new user). Rows render from the listener alone; the
 * config, the journeys and the people fill in when they land (load time over blocking).
 *
 * Cost per snapshot: only the docs the snapshot changed are read and flattened again; unchanged rows keep their
 * view objects (ViewRowCache) and the component is OnPush, so a completion in a big workshop re-sorts the feed
 * but does not re-format or re-check every row.
 *
 * Search and pages (the plan's "Addition: pagination and search"): in the browser only. The listener still delivers
 * the whole feed; the search box keeps the rows whose person matches, and 20 of those show per page (pageRows).
 * A live arrival keeps the current page; a page that no longer exists becomes the last one.
 *
 * Journey and Customer status (the plan's "Addition: Journey and Customer status columns"): two cells after Email.
 * Name, phone and email keep their order (metadata first, new_user_data for whoever metadata lacks); the two new cells
 * read "New User" for a person whose new_user_data doc is not moved to existing, else the metadata's journey (by name)
 * and status. A person still loading shows the placeholder in both; the search does not look at them.
 */
@Component({
  selector: 'app-workshop-live',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workshop-live.component.html',
  styleUrl: './workshop-live.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkshopLiveComponent implements OnInit, OnDestroy {
  private readonly fs = getFirestore();

  workshopId = '';
  state: LiveState = 'loading';
  errorKind: ErrorKind = 'failed';
  connection: Connection = 'connecting';
  title = '';
  titlePending = true;
  /** Every row of the feed (the header count is of these). */
  rows: LiveViewRow[] = [];
  /** The rows on the current page, after the search. */
  pageRows: LiveViewRow[] = [];
  /** The search box text as typed. */
  searchText = '';
  /** The page shown (1-based), kept in range by pageSlice. */
  page = 1;
  pageCount = 1;
  /** Rows matching the search (all rows without one). */
  matchTotal = 0;
  pageText = '';
  rangeText = '';
  /**
   * The hidden status line, read out after the user's own action only (never on a live update): the search's count
   * ("3 matches", "No matches") or, after Previous / Next, the page ("Page 2 of 5").
   */
  statusText = '';
  /** A search is on and some people are still being looked up: its result is not final (see searchAwaitingPeople). */
  searchWaiting = false;
  countLabel = '';
  updatedLabel = '';
  /** Keys of rows that arrived after the first snapshot, until their highlight ends (key -> expiry ms). */
  fresh = new Map<string, number>();

  /** Per participant doc: its data and its completions (only the docs a snapshot changed are redone). */
  private docData = new Map<string, any>();
  private docRows = new Map<string, CompletionRow[]>();
  private completions: CompletionRow[] = [];
  private viewCache: ViewRowCache = new Map();
  private names: ChallengeNameIndex | null = null;
  private configRef: DocumentReference | null = null;
  private configState: ConfigState = 'pending';
  /** The first workshop read has finished (either way): an empty list may now say "nothing yet". */
  private configSettled = false;
  private configRetryQueued = false;
  private snapshotSeen = false;
  /** A server-confirmed snapshot has arrived since the listener (re)started. */
  private serverSeen = false;
  /** Stamps of the last server-confirmed rows; null until the first one (nothing highlights on first paint). */
  private stamps: Map<string, number | null> | null = null;
  /** profileid -> the person whose name, phone and email show, or null when found nowhere. Absent = not known yet. */
  private people = new Map<string, any | null>();
  /** profileid -> their participant metadata doc, or null when it has none. Absent = not answered yet. */
  private metaDocs = new Map<string, any | null>();
  /** profileid -> their new_user_data doc, or null when it has none. Absent = not answered yet. */
  private newUserDocs = new Map<string, any | null>();
  /** profileid -> still a new user (isStillNewUser of newUserDocs). Absent = not answered yet. */
  private newUsers = new Map<string, boolean>();
  /** Ids asked of participant metadata / of new_user_data (a failed batch is taken out again, to be asked again). */
  private askedMeta = new Set<string>();
  private askedNew = new Set<string>();
  /** Journey names by id: null until the first read answers; an empty map once a read has failed ("—", not ids). */
  private journeyNames: Map<string, string> | null = null;
  private journeyState: JourneyState = 'idle';
  /** A failed journey read is tried once more, with the next people lookup. */
  private journeyRetried = false;
  /** People found nowhere who have had (or have queued) their one second look. */
  private rechecked = new Set<string>();
  /** People whose second look is out: their row keeps the first answers until BOTH new answers are in. */
  private secondLook = new Set<string>();
  private unsub: Unsubscribe | null = null;
  private generation = 0;
  private destroyed = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private peopleRetryQueued = false;
  /** The normalised search term the rows were last filtered by. */
  private searchTerm = '';
  /** The user searched while people were still loading: read the count out once they have all landed. */
  private announceWhenSettled = false;

  @ViewChild('searchBox') private searchBox?: ElementRef<HTMLInputElement>;
  @ViewChild('tools') private tools?: ElementRef<HTMLElement>;
  @ViewChild('listTop') private listTop?: ElementRef<HTMLElement>;
  @ViewChild('prevBtn') private prevBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('nextBtn') private nextBtn?: ElementRef<HTMLButtonElement>;

  constructor(
    private route: ActivatedRoute,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.workshopId = (this.route.snapshot.paramMap.get('id') || '').trim();
    this.start();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopListening();
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
  }

  trackRow = (_: number, r: LiveViewRow): string => r.key;

  /** Typing in the search box: filter at once and go back to page 1 (when the term really changed). */
  onSearchInput(value: string): void {
    this.searchText = value ?? '';
    const term = normaliseSearch(this.searchText);
    if (term !== this.searchTerm) {
      this.searchTerm = term;
      this.page = 1;
    }
    this.updateView(true);
  }

  /** Escape in the box clears it (only when there is something to clear, so Escape still reaches the page otherwise). */
  onSearchEscape(event: Event): void {
    if (!this.searchText) return;
    event.preventDefault();
    this.clearSearch();
  }

  /** The clear buttons (in the box and in the no-match state): empty the box, page 1, focus back in the box. */
  clearSearch(): void {
    this.searchText = '';
    this.searchTerm = '';
    this.page = 1;
    this.updateView(true);
    // The button that was clicked is gone after this: keep the keyboard in the box.
    this.cdr.detectChanges();
    const box = this.searchBox?.nativeElement;
    if (box) {
      box.value = '';
      box.focus();
    }
  }

  /** Previous / Next. */
  goToPage(page: number, from: 'prev' | 'next'): void {
    const before = this.page;
    this.page = page;
    this.updateView();
    if (this.page === before) return;
    // Focus stays on the button, so the new page is read out from the status line.
    this.statusText = this.pageText;
    // Render the new page now, so the disabled state and the list's position below are the new ones.
    this.cdr.detectChanges();
    // The button pressed is disabled at the end it reached: move focus to the other one, not to the page body.
    const pressed = (from === 'prev' ? this.prevBtn : this.nextBtn)?.nativeElement;
    const other = (from === 'prev' ? this.nextBtn : this.prevBtn)?.nativeElement;
    if (pressed?.disabled && other && !other.disabled) other.focus({ preventScroll: true });
    this.scrollListIntoView();
  }

  /**
   * After a page change, when the top of the list is above the screen: bring the search row and the list top back
   * into view (smoothly, unless reduced motion). The search row is the target, not the list itself, so the box is
   * shown whole rather than as a sliver above the list.
   */
  private scrollListIntoView(): void {
    const list = this.listTop?.nativeElement;
    if (!list || typeof window === 'undefined') return;
    // The app's sticky toolbar is at most 64px tall: a list top under it is out of view too.
    if (list.getBoundingClientRect().top >= 64) return;
    const target = this.tools?.nativeElement ?? list;
    if (typeof target.scrollIntoView !== 'function') return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }

  /**
   * Search, then the page: what the list, the pager and the no-match state show. Marks the view for check.
   * `announce` = the user just searched (or cleared): only then does the status line change, so live updates and
   * people landing never talk over the user. A count that is not final yet (people still loading) is held back and
   * read once they have all landed.
   */
  private updateView(announce = false): void {
    const matched = filterRows(this.rows, this.searchTerm);
    const slice: PageSlice<LiveViewRow> = pageSlice(matched, this.page);
    this.page = slice.page;
    this.pageCount = slice.pageCount;
    this.pageRows = slice.pageRows;
    this.matchTotal = slice.total;
    this.pageText = pageLabel(slice.page, slice.pageCount);
    this.rangeText = rangeLabel(slice.from, slice.to, slice.total);
    this.searchWaiting = searchAwaitingPeople(this.rows, this.searchTerm);
    if (announce) this.announceWhenSettled = true;
    if (this.announceWhenSettled && !this.searchWaiting) {
      this.statusText = matchesLabel(slice.total, this.searchTerm);
      this.announceWhenSettled = false;
    } else if (announce) {
      this.statusText = '';
    }
    this.cdr.markForCheck();
  }

  /** The Retry button: listen again (and read the config again unless it already landed). */
  retry(): void {
    this.start();
    this.cdr.markForCheck();
  }

  private start(): void {
    const gen = ++this.generation;
    this.stopListening();
    this.state = 'loading';
    this.snapshotSeen = false;
    this.serverSeen = false;
    this.connection = 'connecting';
    // The new listener's first snapshot lists every doc again.
    this.docData.clear();
    this.docRows.clear();
    this.completions = [];
    if (!isLookupId(this.workshopId)) { this.fail('missing'); return; }
    let ref: DocumentReference;
    try {
      ref = doc(this.fs, 'workshopconfiguration', this.workshopId);
    } catch (err) {
      console.error('Workshop live: bad workshop id', err);
      this.fail('missing');
      return;
    }
    this.configRef = ref;
    if (this.configState !== 'ready') void this.loadConfig(ref, gen);
    // Side by side with the list (the rows never wait for it): once per screen, and again on Retry after a failure.
    if (this.journeyState === 'idle' || this.journeyState === 'failed') {
      this.journeyRetried = false;
      void this.loadJourneys();
    }
    try {
      const q = query(collection(this.fs, 'participant workshop'), where('workshopref', '==', ref));
      // Metadata changes too: offline, the first answer is an empty one from the cache, and only a
      // metadata event says the server has confirmed it (an empty workshop would otherwise load forever);
      // the same events say when the connection drops and comes back (the Live chip).
      this.unsub = onSnapshot(q, { includeMetadataChanges: true },
        snap => this.onSnapshot(snap, gen),
        err => this.onSnapshotError(err, gen));
    } catch (err) {
      console.error('Workshop live: could not listen', err);
      this.fail('failed');
    }
  }

  private stopListening(): void {
    if (!this.unsub) return;
    try { this.unsub(); } catch (e) { console.warn('Workshop live: unsubscribe failed', e); }
    this.unsub = null;
  }

  private fail(kind: ErrorKind): void {
    this.generation++;
    this.stopListening();
    this.state = 'error';
    this.errorKind = kind;
    if (this.titlePending || !this.title) this.title = FALLBACK_TITLE;
    this.titlePending = false;
    this.cdr.markForCheck();
  }

  private async loadConfig(ref: DocumentReference, gen: number): Promise<void> {
    this.configState = 'pending';
    // A second look keeps the heading it has ("Workshop live") instead of flashing the placeholder again.
    if (!this.title) this.titlePending = true;
    try {
      const snap = await retryRead(() => getDoc(ref), READ_RETRY);
      if (this.destroyed || gen !== this.generation) return;
      this.ngZone.run(() => {
        this.configSettled = true;
        if (!snap.exists()) {
          // No such workshop: nothing to list.
          this.configState = 'missing';
          this.title = FALLBACK_TITLE;
          this.fail('missing');
          return;
        }
        const data = snap.data();
        this.configState = 'ready';
        this.names = challengeNameIndex(data);
        this.title = workshopTitle(data);
        this.titlePending = false;
        // The names changed: every doc's rows again.
        this.docData.forEach((d, id) => this.docRows.set(id, docCompletionRows(id, d, this.names)));
        this.completions = mergeCompletions(this.docRows.values());
        this.render();
      });
    } catch (err) {
      if (this.destroyed || gen !== this.generation) return;
      // warn, not error: the screen carries on with the participants' copies (the hub fails a case on console.error).
      console.warn('Workshop live: could not read the workshop', err);
      this.ngZone.run(() => {
        this.configSettled = true;
        this.configState = 'failed';
        // A connection-type failure with no answer from the server either (most likely offline): say so, with
        // Retry, instead of loading forever.
        if (!this.serverSeen && isTransientReadError(err)) { this.fail('failed'); return; }
        // The rows still work from the participants' own copies of the names; the workshop is read again later.
        if (!this.title) this.title = FALLBACK_TITLE;
        this.titlePending = false;
        this.render();
        this.queueConfigRetry(gen);
      });
    }
  }

  private queueConfigRetry(gen: number): void {
    if (this.configRetryQueued) return;
    this.configRetryQueued = true;
    this.later(() => {
      this.configRetryQueued = false;
      if (gen === this.generation && this.configState === 'failed' && this.configRef) void this.loadConfig(this.configRef, gen);
    }, RETRY_MS);
  }

  private onSnapshot(snap: any, gen: number): void {
    if (this.destroyed || gen !== this.generation) return;
    const fromCache = !!snap.metadata?.fromCache;
    // An empty answer from the cache is not an answer yet: wait for the server.
    if (!this.snapshotSeen && snap.empty && fromCache) return;
    // Only the docs this snapshot changed are read (the first snapshot lists every doc as added); a
    // metadata-only event (the connection dropped or came back) changes none.
    const changes: { id: string; data: any }[] = snap.docChanges().map((c: any) => ({
      id: c.doc.id, data: c.type === 'removed' ? null : c.doc.data(),
    }));
    this.ngZone.run(() => {
      const first = !this.snapshotSeen;
      this.snapshotSeen = true;
      if (!fromCache) {
        this.serverSeen = true;
        // "Updated" is the last time the SERVER confirmed the list, never a cache answer while offline.
        this.updatedLabel = `Updated ${formatClock(Date.now())}`;
      }
      this.connection = !fromCache ? 'live' : this.serverSeen ? 'offline' : 'connecting';
      if (changes.length) {
        changes.forEach(c => {
          if (c.data === null) {
            this.docData.delete(c.id);
            this.docRows.delete(c.id);
          } else {
            this.docData.set(c.id, c.data);
            this.docRows.set(c.id, docCompletionRows(c.id, c.data, this.names));
          }
        });
        this.completions = mergeCompletions(this.docRows.values());
      }
      // Highlights compare server answers only: a partial cache answer must not become the baseline.
      if (!fromCache && (changes.length || !this.stamps)) {
        this.markFresh(freshKeys(this.stamps, this.completions));
        this.stamps = completionStamps(this.completions);
      }
      if (changes.length || first) {
        this.render();
        this.fillPeople();
      } else {
        this.cdr.markForCheck();
      }
      if (!fromCache && this.configState === 'failed' && this.configRef) void this.loadConfig(this.configRef, gen);
      // The same for a failed journey read (loadJourneys marks it pending at once, so only one read is ever out).
      if (!fromCache && this.journeyState === 'failed') void this.loadJourneys();
    });
  }

  private onSnapshotError(err: any, gen: number): void {
    if (this.destroyed || gen !== this.generation) return;
    console.error('Workshop live: the live list failed', err);
    this.ngZone.run(() => this.fail('failed'));
  }

  private render(): void {
    this.rows = liveViewRows(this.completions, this.people, this.viewCache,
      { newUsers: this.newUsers, journeyNames: this.journeyNames });
    // The current page stays (a live arrival on page 1 shows at its top); a page past the new end becomes the last.
    this.updateView();
    this.countLabel = completionsLabel(this.completions.length);
    if (this.state !== 'error') {
      if (!this.snapshotSeen) this.state = 'loading';
      else if (this.completions.length) this.state = 'ready';
      // An empty list waits for the first config read, so a wrong id shows the error, not "nothing yet".
      else this.state = this.configSettled ? 'empty' : 'loading';
    }
    this.cdr.markForCheck();
  }

  private markFresh(keys: string[]): void {
    if (!keys.length) return;
    const until = Date.now() + FRESH_MS;
    keys.forEach(k => this.fresh.set(k, until));
    this.later(() => {
      const now = Date.now();
      this.fresh.forEach((t, k) => { if (t <= now) this.fresh.delete(k); });
      this.cdr.markForCheck();
    }, FRESH_MS + 50);
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.destroyed) this.ngZone.run(fn);
    }, ms);
    this.timers.add(t);
  }

  /**
   * The journey names, read once (the collection is small). Never blocks the rows: a person with a journey shows the
   * placeholder in that cell until this lands. From the server only, like the people: offline, getDocs would answer
   * an empty list from the cache and every journey would read "—" for good. A failure leaves the names unresolved
   * (the cells read "—", never the raw id) and is asked again: once with the next people lookup, on the next
   * server-confirmed snapshot (back online), and on Retry. An answer that lands after the read gave up is still used.
   */
  private async loadJourneys(): Promise<void> {
    this.journeyState = 'pending';
    const land = (snap: QuerySnapshot): void => {
      if (this.destroyed) return;
      const names = journeyNameIndex(snap.docs.map(d => ({ id: d.id, data: d.data() })));
      this.ngZone.run(() => {
        this.journeyState = 'ready';
        this.journeyNames = names;
        this.render();
      });
    };
    try {
      land(await retryRead(() => getDocsFromServer(collection(this.fs, 'journey')), { ...READ_RETRY, onLate: land }));
    } catch (err) {
      if (this.destroyed) return;
      // warn, not error: the rows carry on without the names (the hub fails a case on console.error).
      console.warn('Workshop live: could not read the journeys', err);
      this.ngZone.run(() => {
        // An earlier read's late answer has landed meanwhile: the names are in, nothing failed.
        if (this.journeyState === 'ready') return;
        this.journeyState = 'failed';
        if (this.journeyNames === null) {
          this.journeyNames = new Map();
          this.render();
        }
      });
    }
  }

  private retryJourneysOnce(): void {
    if (this.journeyState !== 'failed' || this.journeyRetried) return;
    this.journeyRetried = true;
    void this.loadJourneys();
  }

  /**
   * Look up only the people not asked yet, a batch of 30 at a time, in both people collections side by side; rows
   * show a placeholder for them meanwhile.
   */
  private fillPeople(): void {
    const ids = this.completions.map(r => r.profileid);
    const metaIds = missingIds(ids, this.askedMeta);
    const newIds = missingIds(ids, this.askedNew);
    if (!metaIds.length && !newIds.length) return;
    metaIds.forEach(id => this.askedMeta.add(id));
    newIds.forEach(id => this.askedNew.add(id));
    this.retryJourneysOnce();
    chunk(metaIds).forEach(batch => void this.lookupMeta(batch));
    chunk(newIds).forEach(batch => void this.lookupNewUsers(batch));
  }

  /**
   * participant metadata by profileid for one batch (shown as soon as it lands). From the server only: offline,
   * getDocs would answer "nobody" from the empty memory cache and these people would read "Unknown";
   * getDocsFromServer fails instead, so they are asked again. A failure sends the batch back to be asked again.
   */
  private async lookupMeta(ids: string[]): Promise<void> {
    try {
      const snap = await retryRead(() => getDocsFromServer(
        query(collection(this.fs, 'participant metadata'), where('profileid', 'in', ids))), READ_RETRY);
      if (this.destroyed) return;
      const wanted = new Set(ids);
      const found = new Map<string, any>();
      snap.docs.forEach(d => {
        const data = d.data();
        const pid = String(data?.['profileid'] ?? d.id).trim();
        if (wanted.has(pid)) found.set(pid, data);
      });
      this.ngZone.run(() => {
        ids.forEach(id => this.metaDocs.set(id, found.get(id) ?? null));
        this.settlePeople(ids);
      });
    } catch (err) {
      if (this.destroyed) return;
      console.warn('Workshop live: could not look up participants', err);
      // Not "Unknown": the lookup failed. Ask again on the next snapshot, or shortly anyway.
      ids.forEach(id => this.askedMeta.delete(id));
      this.queuePeopleRetry();
    }
  }

  /**
   * new_user_data by id for one batch: for everyone, not only for whoever metadata lacks, because a person who is
   * still a new user can have a metadata doc too (and then reads "New User"). It also names whoever metadata lacks.
   * From the server only, and retried the same way as lookupMeta.
   */
  private async lookupNewUsers(ids: string[]): Promise<void> {
    try {
      const snap = await retryRead(() => getDocsFromServer(
        query(collection(this.fs, 'new_user_data'), where(documentId(), 'in', ids))), READ_RETRY);
      if (this.destroyed) return;
      const byId = new Map<string, any>(snap.docs.map(d => [d.id, d.data()] as [string, any]));
      this.ngZone.run(() => {
        ids.forEach(id => this.newUserDocs.set(id, byId.get(id) ?? null));
        this.settlePeople(ids);
      });
    } catch (err) {
      if (this.destroyed) return;
      console.warn('Workshop live: could not look up new users', err);
      ids.forEach(id => this.askedNew.delete(id));
      this.queuePeopleRetry();
    }
  }

  /**
   * After either lookup answered for these people: who each row shows (metadata first, else new_user_data) and
   * whether they are still new; a person found in neither collection gets their one second look. Then render.
   */
  private settlePeople(ids: string[]): void {
    const nowhere: string[] = [];
    ids.forEach(id => {
      const meta = this.metaDocs.get(id);
      const newUserDoc = this.newUserDocs.get(id);
      if (this.secondLook.has(id)) {
        // A second look changes the row once, with both answers: never the metadata's journey and status before
        // "New User", nor the new_user_data name before the metadata one. Until then it reads "Unknown" and "—".
        if (meta === undefined || newUserDoc === undefined) return;
        this.secondLook.delete(id);
      }
      const person = shownPerson(meta, newUserDoc);
      if (person !== undefined) this.people.set(id, person);
      if (person === null) nowhere.push(id);
      if (newUserDoc !== undefined) this.newUsers.set(id, isStillNewUser(newUserDoc));
    });
    this.recheckLater(nowhere);
    this.render();
  }

  private queuePeopleRetry(): void {
    if (this.peopleRetryQueued) return;
    this.peopleRetryQueued = true;
    this.later(() => { this.peopleRetryQueued = false; this.fillPeople(); }, RETRY_MS);
  }

  /**
   * Found nowhere: "Unknown" for now, and ONE more look a little later — a brand-new user's metadata doc is written
   * by a trigger and can land after their first completion. Still nowhere after that, "Unknown" stays.
   */
  private recheckLater(ids: string[]): void {
    const once = ids.filter(id => !this.rechecked.has(id));
    if (!once.length) return;
    once.forEach(id => this.rechecked.add(id));
    this.later(() => {
      once.forEach(id => {
        if (this.people.get(id) !== null) return;
        // Forget the first look's answers, so settlePeople can tell when both new ones are in (the row keeps showing
        // the first look meanwhile: people and newUsers are left as they are).
        this.secondLook.add(id);
        this.metaDocs.delete(id);
        this.newUserDocs.delete(id);
        this.askedMeta.delete(id);
        this.askedNew.delete(id);
      });
      this.fillPeople();
    }, UNKNOWN_RECHECK_MS);
  }
}
