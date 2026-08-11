/**
 * Firestore access for the Live Location Tracking dashboard.
 *
 * ── Read strategy ────────────────────────────────────────────────────────────
 * Firestore has no "latest document per group" primitive, and the requirement is
 * explicitly *not* to pull every log into memory. So:
 *
 *   1. One query over /locationlogs ordered by `created` desc, capped at
 *      SCAN_LIMIT documents. Because it is ordered newest-first, the first row
 *      encountered for a given profileid *is* that participant's latest log —
 *      so a single client-side pass dedupes to one row per participant.
 *   2. Names come from /participant metadata, fetched by document id in `in`
 *      chunks of 30 and memoised for the lifetime of the page, so a Refresh
 *      re-reads locations but never re-reads names.
 *
 * Cost: SCAN_LIMIT reads on the first load, plus one read per *new* participant
 * name. The alternative — a `where(profileid) + limit(1)` query per participant
 * — costs one read each too, but N round trips and a composite index. That path
 * is still available as `latestForProfile()` for drill-downs.
 *
 * Trade-off worth knowing: a participant whose last report falls outside the
 * newest SCAN_LIMIT documents will not appear. Raise SCAN_LIMIT (it is a plain
 * constant) if the fleet ever reports densely enough for that to bite; the
 * dashboard surfaces the cap in its footer so the limit is never silent.
 */

import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  GeoPoint,
  QueryConstraint,
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, defer, map, of } from 'rxjs';

import { LocationLog } from './location.model';

/** Newest-first log documents scanned per refresh. See the strategy note above. */
export const SCAN_LIMIT = 1000;

/** Firestore caps `in` filters at 30 values. */
const IN_CHUNK_SIZE = 30;

/** Firestore caps a write batch at 500 operations. */
const WRITE_BATCH_LIMIT = 500;

/** Opaque pagination cursor — the previous page's last document snapshot. */
export type LogCursor = QueryDocumentSnapshot | null;

/** One page of raw logs from the "All logs" tab. */
export interface LogPage {
  readonly logs: readonly LocationLog[];
  readonly cursor: LogCursor;
  readonly hasMore: boolean;
}

const LOCATION_LOGS = 'locationlogs';
const PARTICIPANT_METADATA = 'participant metadata';

/** Raw document shape as stored in Firestore. */
interface LocationLogDoc {
  created?: Timestamp;
  geopoint?: GeoPoint;
  profileid?: string;
}

/** Result of one dashboard refresh. */
export interface LatestLocationsResult {
  readonly logs: readonly LocationLog[];
  /** True when the scan hit SCAN_LIMIT — older participants may be missing. */
  readonly truncated: boolean;
  /** Documents actually read, for the cost footer. */
  readonly documentsScanned: number;
}

@Injectable({ providedIn: 'root' })
export class LocationlogService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);

  /**
   * Names are stable, so memoise them across refreshes. Key is the profileid;
   * a value of `null` records "looked up, no metadata document" so we do not
   * re-query a missing participant on every refresh.
   */
  private readonly nameCache = new Map<string, string | null>();

  /**
   * The latest log for every participant seen in the newest SCAN_LIMIT reports.
   *
   * One-shot (`getDocs`, not `collectionData`) on purpose: the dashboard drives
   * its own manual Refresh and 30s auto-refresh, and a live listener would both
   * make those controls meaningless and hold an open stream against a
   * high-write collection.
   */
  latestLocations(): Observable<LatestLocationsResult> {
    return defer(() =>
      this.run(() =>
        getDocs(
          query(
            collection(this.firestore, LOCATION_LOGS),
            orderBy('created', 'desc'),
            limit(SCAN_LIMIT),
          ),
        ),
      ),
    ).pipe(
      map((snapshot) => {
        const latestByProfile = new Map<string, LocationLog>();

        // Snapshot is newest-first, so the first row per profileid wins.
        for (const docSnap of snapshot.docs) {
          const raw = docSnap.data() as LocationLogDoc;
          const parsed = this.toLocationLog(docSnap.id, raw);
          if (parsed && !latestByProfile.has(parsed.profileid)) {
            latestByProfile.set(parsed.profileid, parsed);
          }
        }

        return {
          logs: Array.from(latestByProfile.values()),
          truncated: snapshot.size >= SCAN_LIMIT,
          documentsScanned: snapshot.size,
        };
      }),
    );
  }

  /**
   * Latest single log for one participant, bypassing the scan window.
   *
   * Requires the composite index (profileid ASC, created DESC) on
   * /locationlogs. Kept for drill-downs — the dashboard grid does not use it.
   */
  /**
   * One page of raw log documents, newest first, for the "All logs" tab.
   *
   * Cursor pagination rather than an offset: Firestore has no offset that skips
   * reads, so `startAfter` on the previous page's last snapshot is both the
   * cheapest and the only correct way to walk a large collection.
   *
   * Only `orderBy(created)` + `limit` is used, so this needs no composite index
   * no matter how the UI filters afterwards. Participant and date narrowing are
   * applied client-side over the loaded pages, and the tab says so rather than
   * implying it searched the whole collection.
   */
  listLogs(pageSize: number, cursor: LogCursor = null): Observable<LogPage> {
    return defer(() =>
      this.run(() => {
        const constraints: QueryConstraint[] = [orderBy('created', 'desc')];
        if (cursor) constraints.push(startAfter(cursor));
        // Fetch one extra to learn whether another page exists without a
        // second round trip.
        constraints.push(limit(pageSize + 1));

        return getDocs(query(collection(this.firestore, LOCATION_LOGS), ...constraints));
      }),
    ).pipe(
      map((snapshot) => {
        const docs = snapshot.docs.slice(0, pageSize);
        const logs = docs
          .map((docSnap) => this.toLocationLog(docSnap.id, docSnap.data() as LocationLogDoc))
          .filter((log): log is LocationLog => log !== null);

        return {
          logs,
          cursor: docs.length ? docs[docs.length - 1] : null,
          hasMore: snapshot.docs.length > pageSize,
        };
      }),
    );
  }

  /**
   * Permanently delete log documents.
   *
   * Batched because Firestore caps a write batch at 500 operations, and
   * batching also makes each chunk atomic — a partial chunk cannot leave the
   * collection in a half-deleted state that the UI then misreports.
   *
   * There is no undo. The caller is responsible for confirming with the
   * operator first.
   */
  deleteLogs(ids: readonly string[]): Observable<number> {
    if (ids.length === 0) return of(0);

    return defer(() =>
      this.run(async () => {
        for (const batchIds of chunk(ids, WRITE_BATCH_LIMIT)) {
          const batch = writeBatch(this.firestore);
          for (const id of batchIds) {
            batch.delete(doc(this.firestore, LOCATION_LOGS, id));
          }
          await batch.commit();
        }
        return ids.length;
      }),
    );
  }

  latestForProfile(profileid: string): Observable<LocationLog | null> {
    return defer(() =>
      this.run(() =>
        getDocs(
          query(
            collection(this.firestore, LOCATION_LOGS),
            where('profileid', '==', profileid),
            orderBy('created', 'desc'),
            limit(1),
          ),
        ),
      ),
    ).pipe(
      map((snapshot) => {
        const first = snapshot.docs[0];
        return first ? this.toLocationLog(first.id, first.data() as LocationLogDoc) : null;
      }),
    );
  }

  /**
   * Resolve profile ids to display names, hitting Firestore only for ids that
   * are not already cached. Returns a name for *every* requested id — unknown
   * participants fall back to a short form of their id rather than a blank cell.
   */
  resolveNames(profileids: readonly string[]): Observable<ReadonlyMap<string, string>> {
    const unknown = profileids.filter((id) => !this.nameCache.has(id));

    if (unknown.length === 0) {
      return of(this.buildNameMap(profileids));
    }

    return defer(() =>
      this.run(() =>
        Promise.all(
          chunk(unknown, IN_CHUNK_SIZE).map((ids) =>
            getDocs(
              query(
                collection(this.firestore, PARTICIPANT_METADATA),
                where(documentId(), 'in', ids),
              ),
            ),
          ),
        ),
      ),
    ).pipe(
      map((snapshots) => {
        for (const snapshot of snapshots) {
          for (const docSnap of snapshot.docs) {
            const name = (docSnap.data() as { name?: unknown }).name;
            this.nameCache.set(docSnap.id, typeof name === 'string' && name.trim() ? name.trim() : null);
          }
        }
        // Record the misses so they are never re-queried.
        for (const id of unknown) {
          if (!this.nameCache.has(id)) {
            this.nameCache.set(id, null);
          }
        }
        return this.buildNameMap(profileids);
      }),
    );
  }

  /** Single-document name lookup, used by the details drawer for late arrivals. */
  fetchName(profileid: string): Observable<string> {
    const cached = this.nameCache.get(profileid);
    if (cached !== undefined) {
      return of(cached ?? fallbackName(profileid));
    }

    return defer(() =>
      this.run(() => getDoc(doc(this.firestore, PARTICIPANT_METADATA, profileid))),
    ).pipe(
      map((snap) => {
        const name = snap.exists() ? (snap.data() as { name?: unknown }).name : undefined;
        const resolved = typeof name === 'string' && name.trim() ? name.trim() : null;
        this.nameCache.set(profileid, resolved);
        return resolved ?? fallbackName(profileid);
      }),
    );
  }

  /**
   * AngularFire expects Firebase calls to happen inside an injection context so
   * its zone patching stays intact. These queries are built lazily inside RxJS
   * callbacks, which escapes that context — so re-enter it explicitly rather
   * than living with the "called outside injection context" warning.
   */
  private run<T>(work: () => Promise<T>): Promise<T> {
    return runInInjectionContext(this.injector, work);
  }

  private buildNameMap(profileids: readonly string[]): ReadonlyMap<string, string> {
    const result = new Map<string, string>();
    for (const id of profileids) {
      result.set(id, this.nameCache.get(id) ?? fallbackName(id));
    }
    return result;
  }

  /**
   * Normalise a raw document, dropping anything that cannot be plotted — a
   * missing geopoint, a missing profileid, or a `created` that has not been
   * materialised yet (serverTimestamp() writes land as null on the first
   * local snapshot).
   */
  private toLocationLog(id: string, raw: LocationLogDoc): LocationLog | null {
    const { created, geopoint, profileid } = raw;

    if (!profileid || !geopoint || !created) {
      return null;
    }
    if (typeof geopoint.latitude !== 'number' || typeof geopoint.longitude !== 'number') {
      return null;
    }

    return {
      id,
      profileid,
      latitude: geopoint.latitude,
      longitude: geopoint.longitude,
      created: created.toDate(),
    };
  }
}

/** Readable stand-in when a participant has no metadata document. */
function fallbackName(profileid: string): string {
  return `Unknown (${profileid.slice(0, 6)})`;
}

/** Split into fixed-size batches — Firestore `in` filters cap at 30 values. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
