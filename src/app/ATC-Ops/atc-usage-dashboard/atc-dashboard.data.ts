import { inject, Injectable } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from '@angular/fire/firestore';
import { AtcFirebaseService } from '../atc-firebase.service';
import {
  AtcGenDoc,
  BacklogGauge,
  DailyRollup,
  DropoffsDoc,
  LifetimeRollup,
  PodWorker,
} from '../atc-ops.types';
import {
  istDateWindow,
  todayIST,
  todayStartIST,
  toMillis,
} from '../ist-time.util';

const QUEUE = 'queue_atc_generation';
const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * The SINGLE data-access layer for the ATC usage dashboard.
 * Every Firestore read lives here — no reads inline in components.
 *
 * DB routing (critical — a wrong-handle query is a silent bug):
 *   [atc]     → queue_atc_generation (named DB firestore-atc, via AtcFirebaseService.atcDb)
 *   [default] → classify/pod_worker + all scope_enhancement_atc_usage_* (injected Firestore)
 *
 * All Firestore Timestamps are normalized to millis/Date at this layer's edge.
 */
@Injectable({ providedIn: 'root' })
export class AtcDashboardDataService {
  private readonly atc = inject(AtcFirebaseService);
  private readonly dbDefault = inject(Firestore);

  private get dbAtc() {
    return this.atc.atcDb;
  }

  // --- IST helpers re-exposed so components never touch tz math ---
  todayIST(): string {
    return todayIST();
  }
  backlogWindow(days: number): string[] {
    return istDateWindow(days);
  }

  // =========================================================================
  // Panel A — Pod status  [default · realtime]
  // =========================================================================
  subscribePodWorker(
    onData: (pod: PodWorker | null) => void,
    onError: (err: unknown) => void,
  ): () => void {
    const ref = doc(this.dbDefault, 'classify', 'pod_worker');
    return onSnapshot(
      ref,
      (snap) => onData(snap.exists() ? (snap.data() as PodWorker) : null),
      onError,
    );
  }

  // =========================================================================
  // Panel F — Drop-offs today  [default · realtime on today's day-doc]
  // =========================================================================
  subscribeDropoffsToday(
    onData: (d: DropoffsDoc | null) => void,
    onError: (err: unknown) => void,
  ): () => void {
    const ref = doc(
      this.dbDefault,
      'scope_enhancement_atc_usage_dropoffs',
      todayIST(),
    );
    // Missing doc is a legitimate zero-state, not an error.
    return onSnapshot(
      ref,
      (snap) => onData(snap.exists() ? (snap.data() as DropoffsDoc) : null),
      onError,
    );
  }

  // =========================================================================
  // Panel B — Data-incomplete NOW  [atc · count() + drill-in getDocs]
  // =========================================================================
  async getDataIncompleteCount(): Promise<number> {
    const q = query(
      collection(this.dbAtc, QUEUE),
      where('status', '==', 'dataincomplete'),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  }

  async listDataIncomplete(limitN = 50): Promise<AtcGenDoc[]> {
    const q = query(
      collection(this.dbAtc, QUEUE),
      where('status', '==', 'dataincomplete'),
      limit(limitN),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ docid: d.id, ...(d.data() as any) }));
  }

  // =========================================================================
  // Panel C — Backlog (pending / processing) + oldest-pending age  [atc · count()]
  // =========================================================================
  async getBacklogCounts(): Promise<{ pending: number; processing: number }> {
    const col = collection(this.dbAtc, QUEUE);
    const [p, proc] = await Promise.all([
      getCountFromServer(query(col, where('status', '==', 'pending'))),
      getCountFromServer(query(col, where('status', '==', 'processing'))),
    ]);
    return { pending: p.data().count, processing: proc.data().count };
  }

  /** Oldest pending age in minutes (null when there is no pending job). */
  async getOldestPendingAgeMin(): Promise<number | null> {
    const q = query(
      collection(this.dbAtc, QUEUE),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc'),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const createdAt = toMillis((snap.docs[0].data() as any).createdAt);
    if (createdAt == null) return null;
    return Math.max(0, Math.round((Date.now() - createdAt) / 60000));
  }

  // =========================================================================
  // Panel D — Stuck now  [atc · count(), composite index status+startedAt]
  // =========================================================================
  async getStuckCount(): Promise<number> {
    const cutoff = Timestamp.fromMillis(Date.now() - STUCK_THRESHOLD_MS);
    const q = query(
      collection(this.dbAtc, QUEUE),
      where('status', '==', 'processing'),
      where('startedAt', '<=', cutoff),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  }

  // =========================================================================
  // Panel E — Done / errors today  [atc · count(), finalizedAt >= todayStartIST]
  // =========================================================================
  async getTodayDoneErrorCounts(): Promise<{ done: number; errors: number }> {
    const col = collection(this.dbAtc, QUEUE);
    const start = todayStartIST();
    const [done, err] = await Promise.all([
      getCountFromServer(
        query(
          col,
          where('finalizedAt', '>=', start),
          where('status', '==', 'completed'),
        ),
      ),
      getCountFromServer(
        query(
          col,
          where('finalizedAt', '>=', start),
          where('status', '==', 'error'),
        ),
      ),
    ]);
    return { done: done.data().count, errors: err.data().count };
  }

  // =========================================================================
  // Panel G — Backlog trend  [default · hourly gauge docs, one-time]
  // =========================================================================
  async getBacklogTrend(days = 7): Promise<BacklogGauge[]> {
    const dates = istDateWindow(days);
    const results = await Promise.all(
      dates.map(async (date) => {
        const ref = doc(
          this.dbDefault,
          'scope_enhancement_atc_usage_backlog',
          date,
        );
        const snap = await getDoc(ref);
        return snap.exists()
          ? ({ ...(snap.data() as BacklogGauge), collectionName: date } as BacklogGauge)
          : null;
      }),
    );
    return results.filter((r): r is BacklogGauge => r !== null);
  }

  async getBacklogLatest(): Promise<BacklogGauge | null> {
    const ref = doc(this.dbDefault, 'scope_enhancement_atc_usage_backlog', 'latest');
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as BacklogGauge) : null;
  }

  // =========================================================================
  // Panel H — Daily throughput / turnaround  [default · nightly rollup, one-time]
  // =========================================================================
  async getDailyRollups(days = 14, profileid = '__ALL'): Promise<DailyRollup[]> {
    const dates = istDateWindow(days);
    const results = await Promise.all(
      dates.map(async (date) => {
        const id = `${date}_${profileid}`; // '{date}___ALL' for org-wide
        const ref = doc(this.dbDefault, 'scope_enhancement_atc_usage_daily', id);
        const snap = await getDoc(ref);
        return snap.exists()
          ? ({ date, ...(snap.data() as DailyRollup) })
          : ({ date, total: 0, completed: 0, failed: 0 } as DailyRollup);
      }),
    );
    return results;
  }

  // =========================================================================
  // Panel I — Lifetime totals  [default · nightly incremental, one-time]
  // =========================================================================
  async getLifetime(profileid = '__ALL'): Promise<LifetimeRollup | null> {
    const ref = doc(
      this.dbDefault,
      'scope_enhancement_atc_usage_lifetime',
      profileid,
    );
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as LifetimeRollup) : null;
  }

  // =========================================================================
  // Panel J — Error breakdown by failureCategory  [default trend from _daily.byFailure]
  // =========================================================================
  aggregateFailure(rollups: DailyRollup[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rollups) {
      const bf = r.byFailure ?? {};
      for (const [k, v] of Object.entries(bf)) {
        out[k] = (out[k] ?? 0) + (v ?? 0);
      }
    }
    return out;
  }
}
