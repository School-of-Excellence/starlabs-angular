import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  collection, doc, DocumentReference, Firestore, getDoc, getDocs, onSnapshot,
  query, setDoc, where,
} from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AtcFirebaseService } from '../../ATC-Ops/atc-firebase.service';
import { AtcGenDoc, AtcStatus } from '../../ATC-Ops/atc-ops.types';

/**
 * ATC Transcript Ops — V2.
 *
 * V2 of `evolution-prep-participants`. Same job (find participants whose studio
 * transcript is missing and attach a Dropbox recording to produce one) but it
 * closes the loop: it shows, per participant, the whole funnel from "did they
 * cross the studio stage" through "is there a transcript" to "did an ATC doc get
 * generated and what is its status" — and after a transcript lands it re-runs the
 * ATC resolver automatically.
 *
 * What V1 got wrong, and V2 fixes:
 *
 *  1. QUEUE LIST IS DATA-DRIVEN AND MULTI-SELECT. V1 hardcoded four queue ids.
 *     V2 lists every `queue generation` doc carrying an `atcrequiredstages` config
 *     and lets several be inspected at once (participants routinely sit in a prep
 *     queue and a diagnostics queue).
 *
 *  2. THE CHAIN WALK IS REAL. V1's saveDropboxLink() ran ONE flat `queue stage log`
 *     query with no `queueref` filter and took the globally-latest studio session
 *     for the profile. The deployed resolver
 *     (atc_generation_resolver.resolveStageData) walks the transferredfrom lineage
 *     LEVEL BY LEVEL and only considers sessions logged under the queue at each
 *     level. When a participant has sessions in more than one queue the flat query
 *     silently picks the wrong one and the transcript lands on a live-assignment
 *     doc the resolver will never read. V2 mirrors the resolver's walk.
 *
 *  3. TRANSCRIPT STATUS COMES FROM THE SOURCE OF TRUTH. V1 inferred it from
 *     `queue_atc_generation.data.transcript_*` with `type == 'zoom'` — the
 *     PRE-2026-07-02 gen-doc shape. After the redesign that data lives under
 *     `stagedata.<stage>.data`, so V1's check reports "no transcript" for everyone
 *     on the current shape. V2 reads `transcript_text` off the `live assignment`
 *     doc, exactly as resolveStageSource() does.
 *
 * Pipeline this screen drives (already deployed):
 *     write `dropboxlink` on `live assignment/{id}`
 *       → seLiveTranscribeSubmit (fires on dropboxlink CHANGE)
 *       → RunPod WhisperX
 *       → seLiveTranscribeCallback writes transcript_text
 *       → [this screen] regenerateAtcDoc → gen doc leaves dataincomplete.
 */

// ── view models ──────────────────────────────────────────────────────────────

export interface QueueOpt {
  id: string;
  name: string;
  genStages: string[];   // atcrequiredstages entries with generateatc === true
  zoomStages: string[];  // their pairing stages that are studio (zoom) stages
}

export type CaptureStatus =
  | 'queued' | 'processing' | 'captured' | 'failed' | 'retrigger' | null;

/** One live-assignment doc discovered on a participant's transferredfrom lineage. */
export interface LiveAssignmentHit {
  laId: string;
  queueId: string;       // queue the studio session was logged under
  level: number;         // 0 = the participant's own queue, 1+ = ancestors
  /**
   * True when this is the NEWEST studio session at its level. The server resolver
   * takes orderBy('logdate','desc').docs[0] at each level, so only primary sessions
   * are visible to the ATC pipeline. A transcript on a non-primary (superseded)
   * session will never be read — see supersededOnly().
   */
  primary: boolean;
  exists: boolean;
  hasTranscript: boolean;
  status: CaptureStatus;
  dropboxlink: string;
  lastError?: string;
}

export interface Row {
  tokenId: string;
  queueId: string;
  queueName: string;
  profile_id: string;
  profile_name: string;
  currentstage: string;

  crossed: boolean | null;      // crossed the studio stage? null until walked
  walking: boolean;
  walkError: string | null;
  trail: string[];
  hits: LiveAssignmentHit[];
  targetLaId: string | null;

  genDocId: string | null;      // queue_atc_generation doc, if one exists
  genStatus: AtcStatus | null;
  genMissing: string[];         // stagedata entries still 'missing'

  dropboxLink: string;
  saving: boolean;
  rebuilding: boolean;
  _token: any;
}

@Component({
  selector: 'app-evolution-prep-participants-v2',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTableModule, MatPaginatorModule, MatSortModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatSelectModule,
    MatProgressSpinnerModule, MatTooltipModule, MatSnackBarModule,
  ],
  templateUrl: './evolution-prep-participants-v2.component.html',
  styleUrl: './evolution-prep-participants-v2.component.css',
})
export class EvolutionPrepParticipantsV2Component implements OnInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  // ---- pickers ----
  queues: QueueOpt[] = [];
  selectedQueueIds: string[] = [];
  selectedStage = '';
  queuesLoading = true;
  queuesError: string | null = null;

  // ---- table ----
  dataSource = new MatTableDataSource<Row>([]);
  allRows: Row[] = [];
  displayedColumns = [
    'profile_name', 'queue', 'currentstage', 'crossed',
    'transcript', 'sessions', 'genDoc', 'dropboxLink',
  ];

  loading = false;
  walkProgress = 0;
  walkTotal = 0;

  // ---- filters ----
  searchText = '';
  filterTranscript = '';   // '' | 'yes' | 'no' | 'superseded' | 'nosession'
  filterCrossed = '';      // '' | 'yes' | 'no'
  filterGen = '';          // '' | 'none' | AtcStatus

  readonly genStatusOptions: AtcStatus[] =
    ['dataincomplete', 'pending', 'processing', 'completed', 'error'];

  // ---- caches (bound the read volume of the walk) ----
  private queueDataCache = new Map<string, any>();
  private tokenCache = new Map<string, any>();
  private variationCache = new Map<string, string[] | null>();
  /** profileid → gen doc, per selected queue. */
  private genByProfile = new Map<string, { id: string; data: AtcGenDoc }>();

  /** Stages that are studio (zoom) stages ANYWHERE — see buildZoomCapableSet(). */
  private zoomCapable = new Set<string>();

  private laUnsubs = new Map<string, () => void>();
  private destroyed = false;

  constructor(
    private firestore: Firestore,
    private atcSvc: AtcFirebaseService,
    private snackbar: MatSnackBar,
  ) {}

  ngOnInit(): void { this.loadQueues(); }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.laUnsubs.forEach((u) => u());
    this.laUnsubs.clear();
  }

  // ── queue discovery ────────────────────────────────────────────────────────

  /**
   * Stages that are studio (zoom) stages anywhere in the system.
   *
   * This MUST be global, not per-queue. A pairing stage is often untyped at the
   * queue you select: for the Diagnostics queue, "Scope Enhancement" is absent from
   * `stages`, is enablezoom:false in `stageproperty`, and has no atcrequiredstages
   * entry — it types to null there. Its zoom-ness lives in the ANCESTOR prep queue,
   * which is precisely where the chain walk finds the session. Typing the stage
   * picker off the selected queue alone would offer nothing for that queue. Every
   * queue doc is already fetched for the dropdown, so this costs no extra reads.
   */
  private buildZoomCapableSet(queueDatas: any[]): Set<string> {
    const zoom = new Set<string>();
    for (const qd of queueDatas) {
      const sp = qd?.stageproperty ?? {};
      for (const stage of Object.keys(sp)) {
        if (sp[stage]?.enablezoom === true) zoom.add(stage);
      }
      for (const cfg of qd?.atcrequiredstages ?? []) {
        if (cfg?.type === 'zoom' && cfg?.stage) zoom.add(cfg.stage);
      }
    }
    return zoom;
  }

  /** pairingstages may be a legacy flat array OR {mandatory, atleastonerequired}. */
  private normalizePairing(raw: any): string[] {
    if (Array.isArray(raw)) return raw.slice();
    if (raw && typeof raw === 'object') {
      return [...(raw.mandatory ?? []), ...(raw.atleastonerequired ?? [])];
    }
    return [];
  }

  async loadQueues(): Promise<void> {
    this.queuesLoading = true;
    this.queuesError = null;
    try {
      const snap = await getDocs(collection(this.firestore, 'queue generation'));
      this.zoomCapable = this.buildZoomCapableSet(snap.docs.map((d) => d.data()));

      const opts: QueueOpt[] = [];
      snap.docs.forEach((d) => {
        const data: any = d.data();
        this.queueDataCache.set(d.id, data);
        const req: any[] = Array.isArray(data?.atcrequiredstages) ? data.atcrequiredstages : [];
        if (!req.length) return;                     // queue selection is driven by this field

        const genStages = req.filter((s) => s?.generateatc === true)
                             .map((s) => String(s?.stage ?? '')).filter(Boolean);
        const zoomStages = [...new Set(
          req.filter((s) => s?.generateatc === true)
             .flatMap((s) => this.normalizePairing(s?.pairingstages))
             .filter((s: string) => this.zoomCapable.has(s)),
        )];
        opts.push({ id: d.id, name: String(data?.queuename ?? d.id), genStages, zoomStages });
      });

      this.queues = opts.sort((a, b) => a.name.localeCompare(b.name));
      if (this.queues.length) {
        this.selectedQueueIds = [this.queues[0].id];
        this.selectedStage = this.queues[0].zoomStages[0] ?? '';
      }
    } catch (e: any) {
      console.error('loadQueues failed', e);
      this.queuesError = e?.message ?? 'Failed to load queues';
    } finally {
      this.queuesLoading = false;
    }
  }

  get selectedQueueOpts(): QueueOpt[] {
    return this.queues.filter((q) => this.selectedQueueIds.includes(q.id));
  }

  /** Studio stages offered = union across the selected queues. */
  get availableStages(): string[] {
    return [...new Set(this.selectedQueueOpts.flatMap((q) => q.zoomStages))];
  }

  get genStagesLabel(): string {
    return [...new Set(this.selectedQueueOpts.flatMap((q) => q.genStages))].join(', ') || '—';
  }

  onQueueChange(): void {
    if (!this.availableStages.includes(this.selectedStage)) {
      this.selectedStage = this.availableStages[0] ?? '';
    }
    this.allRows = [];
    this.dataSource.data = [];
  }

  // ── chain walk (mirrors atc_generation_resolver.resolveStageData) ───────────

  /** UNION of base stages and the token's variation stages — never variation-only. */
  private async activeStagesOf(queueData: any, tokenData: any): Promise<string[]> {
    const base: string[] = queueData?.stages ?? [];
    const vid = tokenData?.variationid;
    if (!vid) return base;
    if (!this.variationCache.has(vid)) {
      try {
        const v = await getDoc(doc(this.firestore, 'queue variation', vid));
        const s = v.exists() ? v.data()['stages'] : null;
        this.variationCache.set(vid, Array.isArray(s) ? s : null);
      } catch { this.variationCache.set(vid, null); }
    }
    const extra = this.variationCache.get(vid);
    return extra ? [...new Set([...base, ...extra])] : base;
  }

  /**
   * Type of `stageName` at ONE queue level — mirrors resolver.locatePairingStageType().
   * `stageproperty` is only consulted when the stage is actually active at this level
   * (it is a proven-unreliable superset); `atcrequiredstages` is a curated
   * registration and is trusted unconditionally.
   */
  private stageTypeAt(queueData: any, stageName: string, activeStages: string[]): string | null {
    if (activeStages.includes(stageName)) {
      const prop = (queueData?.stageproperty ?? {})[stageName];
      if (prop) {
        if (prop.actiontype === 'form') return 'form';
        if (prop.enablezoom === true) return 'zoom';
      }
    }
    const cfg = (queueData?.atcrequiredstages ?? []).find((s: any) => s?.stage === stageName);
    return cfg?.type ?? null;
  }

  /**
   * Has this participant moved PAST the studio stage in their own queue?
   *
   * A stage that is not in the active list at all counts as CROSSED, not "before".
   * Token variations legitimately drop trailing stages (Transfered / Completed), so
   * an indexOf-only test silently reports terminal participants as not-yet-crossed
   * and under-counts the population that should already have an ATC doc.
   */
  private isCrossed(activeStages: string[], currentstage: string, stage: string): boolean {
    const target = activeStages.indexOf(stage);
    if (target < 0) return true;                 // stage not on this flow → past it
    const at = activeStages.indexOf(currentstage);
    if (at < 0) return true;                     // off-list currentstage → terminal
    return at > target;
  }

  private async queueDataOf(id: string, ref: DocumentReference): Promise<any> {
    if (this.queueDataCache.has(id)) return this.queueDataCache.get(id);
    let data: any = null;
    try { const s = await getDoc(ref); data = s.exists() ? s.data() : null; } catch { data = null; }
    this.queueDataCache.set(id, data);
    return data;
  }

  /**
   * Collect EVERY live assignment for `stage` across a participant's whole
   * transferredfrom lineage, nearest level first.
   *
   * Ordering note: the server resolver uses orderBy('logdate','desc') on a query
   * that also filters `queueref`, which needs a composite index. The browser SDK
   * cannot create indexes, so this issues the same four EQUALITY filters (which
   * Firestore serves without one) and sorts logdate client-side. Same documents,
   * same order — just sorted locally.
   */
  private async walkChain(
    queueRef: DocumentReference, queueData: any, tokenData: any, tokenId: string, stage: string,
  ): Promise<{ hits: LiveAssignmentHit[]; trail: string[]; crossed: boolean }> {
    const hits: LiveAssignmentHit[] = [];
    const trail: string[] = [];
    const visited = new Set<string>([tokenId]);

    let lvlQ = queueRef, lvlQD = queueData, lvlT = tokenData, level = 0;
    let crossed = false;

    while (true) {
      const active = await this.activeStagesOf(lvlQD, lvlT);
      if (level === 0) crossed = this.isCrossed(active, tokenData?.currentstage ?? '', stage);

      const type = this.stageTypeAt(lvlQD, stage, active);
      let found = 0;

      if (type === 'zoom') {
        const snap = await getDocs(query(
          collection(this.firestore, 'queue stage log'),
          where('currentstage', '==', stage),
          where('status', '==', 'instudio'),
          where('profile_id', '==', lvlT?.profile_id),
          where('queueref', '==', lvlQ),
        ));
        const logs = snap.docs.map((d) => d.data())
          .sort((a, b) => (b['logdate']?.toMillis?.() ?? 0) - (a['logdate']?.toMillis?.() ?? 0));
        // Only the FIRST session at a level is primary — the single doc the resolver
        // reads there. Later ones are kept as evidence (a transcript on a superseded
        // session explains an otherwise baffling dataincomplete) but never count as
        // satisfying the pipeline.
        let seenAtLevel = 0;
        for (const l of logs) {
          const laId = l['liveassignmentid'];
          if (!laId || hits.some((h) => h.laId === laId)) continue;
          hits.push({
            laId, queueId: lvlQ.id, level, primary: seenAtLevel === 0,
            exists: false, hasTranscript: false, status: null, dropboxlink: '',
          });
          seenAtLevel++;
          found++;
        }
      }
      trail.push(`${this.queueLabel(lvlQ.id)}${type ? `[${type}]` : '[–]'}:${found}`);

      // climb one hop: BOTH refs are required, exactly as the resolver requires
      const aq = lvlT?.transferredfrom, at = lvlT?.tokentransferredfrom;
      if (!aq || !at || level >= 12 || visited.has(at.id)) break;
      visited.add(at.id);

      let prevToken = this.tokenCache.get(at.id);
      if (prevToken === undefined) {
        try { const s = await getDoc(at); prevToken = s.exists() ? s.data() : null; }
        catch { prevToken = null; }
        this.tokenCache.set(at.id, prevToken);
      }
      if (!prevToken) break;
      const prevQD = await this.queueDataOf(aq.id, aq);
      if (!prevQD) break;

      lvlQ = aq; lvlQD = prevQD; lvlT = prevToken; level++;
    }

    return { hits, trail, crossed };
  }

  private queueLabel(id: string): string {
    return this.queues.find((x) => x.id === id)?.name ?? id.slice(0, 6);
  }

  /** Read each discovered live assignment and record whether a transcript exists. */
  private async hydrateHits(hits: LiveAssignmentHit[]): Promise<void> {
    for (const h of hits) {
      try {
        const s = await getDoc(doc(this.firestore, 'live assignment', h.laId));
        const d: any = s.exists() ? s.data() : null;
        h.exists = s.exists();
        h.hasTranscript = !!(d?.transcript_text && String(d.transcript_text).trim());
        h.status = (d?.transcriptCaptureStatus ?? null) as CaptureStatus;
        h.dropboxlink = d?.dropboxlink ?? '';
        h.lastError = d?.transcriptCaptureLastError;
      } catch {
        h.exists = false;
      }
    }
  }

  // ── generation docs (the "did an ATC doc get made" half of the funnel) ──────

  /**
   * Load every queue_atc_generation doc for the selected queues, keyed by profile.
   * `queueref` is a DocumentReference whose path must be built on the firestore-atc
   * handle to match what the pipeline wrote.
   */
  private async loadGenDocs(): Promise<void> {
    this.genByProfile.clear();
    for (const qid of this.selectedQueueIds) {
      try {
        const snap = await getDocs(query(
          collection(this.atcSvc.atcDb, 'queue_atc_generation'),
          where('queueref', '==', doc(this.atcSvc.atcDb, 'queue generation', qid)),
        ));
        snap.docs.forEach((d) => {
          const data = d.data() as AtcGenDoc;
          const pid = (data as any).profileid;
          if (!pid) return;
          const prev = this.genByProfile.get(pid);
          // Prefer the most advanced doc if a profile somehow has several.
          const rank = (s?: AtcStatus | null) =>
            ['error', 'dataincomplete', 'pending', 'processing', 'completed'].indexOf(String(s));
          if (!prev || rank(data.status) > rank(prev.data.status)) {
            this.genByProfile.set(pid, { id: d.id, data });
          }
        });
      } catch (e) {
        console.error(`loadGenDocs failed for ${qid}`, e);
      }
    }
  }

  private applyGenDoc(row: Row): void {
    const g = this.genByProfile.get(row.profile_id);
    row.genDocId = g?.id ?? null;
    row.genStatus = (g?.data.status ?? null) as AtcStatus | null;
    row.genMissing = g
      ? Object.entries((g.data as any).stagedata ?? {})
          .filter(([, v]: any) => v?.status === 'missing')
          .map(([k]) => k)
      : [];
  }

  // ── load ───────────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (!this.selectedQueueIds.length || !this.selectedStage) return;

    this.loading = true;
    this.allRows = [];
    this.dataSource.data = [];
    this.walkProgress = 0;

    try {
      await this.loadGenDocs();

      const rows: Row[] = [];
      for (const qid of this.selectedQueueIds) {
        const qref = doc(this.firestore, 'queue generation', qid);
        // Active + Approved — the live-participant filter, same as the backend's
        // atc-generate-for-queue.js token selection.
        const snap = await getDocs(query(
          collection(this.firestore, 'queue_token'),
          where('queueref', '==', qref),
          where('tokenstatus', '==', 'Active'),
          where('stagestatus', '==', 'Approved'),
        ));
        snap.docs.forEach((d) => {
          const t: any = d.data();
          rows.push({
            tokenId: d.id,
            queueId: qid,
            queueName: this.queueLabel(qid),
            profile_id: t.profile_id ?? '',
            profile_name: t.profile_name ?? '',
            currentstage: t.currentstage ?? '',
            crossed: null,
            walking: true, walkError: null, trail: [], hits: [],
            targetLaId: null,
            genDocId: null, genStatus: null, genMissing: [],
            dropboxLink: '', saving: false, rebuilding: false,
            _token: t,
          });
        });
      }

      rows.forEach((r) => this.applyGenDoc(r));
      this.allRows = rows;
      this.walkTotal = rows.length;
      this.dataSource.data = rows;
      setTimeout(() => {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      });
      this.loading = false;

      await this.walkAll();
    } catch (e: any) {
      console.error('load failed', e);
      this.snackbar.open(`Load failed: ${e?.message ?? e}`, 'Close', { duration: 5000 });
      this.loading = false;
    }
  }

  /**
   * Walk every row through a BOUNDED pool. A queue can hold ~700 Active tokens and
   * each walk is several round-trips; firing them all at once (V1 used an unbounded
   * Promise.all) stalls the tab and can exhaust the SDK's connection pool.
   */
  private async walkAll(): Promise<void> {
    const POOL = 8;
    let cursor = 0;
    const rows = this.allRows;

    const worker = async (): Promise<void> => {
      while (cursor < rows.length && !this.destroyed) {
        const row = rows[cursor++];
        try {
          const qref = doc(this.firestore, 'queue generation', row.queueId);
          const { hits, trail, crossed } = await this.walkChain(
            qref, this.queueDataCache.get(row.queueId), row._token, row.tokenId, this.selectedStage);
          await this.hydrateHits(hits);
          row.hits = hits;
          row.trail = trail;
          row.crossed = crossed;
          // Paste target = the nearest PRIMARY session still lacking a transcript.
          // Primary because that is the only doc the resolver reads at a level;
          // nearest because that is the level the resolver reaches first. Writing to
          // a superseded session would produce a transcript the pipeline ignores.
          row.targetLaId = (
            hits.find((h) => h.primary && !h.hasTranscript) ??
            hits.find((h) => h.primary) ??
            hits[0]
          )?.laId ?? null;
          row.dropboxLink = hits.find((h) => h.dropboxlink)?.dropboxlink ?? '';
        } catch (e: any) {
          row.walkError = e?.message ?? 'walk failed';
        } finally {
          row.walking = false;
          if (++this.walkProgress % 10 === 0) this.applyFilters();
        }
      }
    };

    await Promise.all(Array.from({ length: POOL }, worker));
    this.applyFilters();
  }

  // ── row helpers (used by the template) ─────────────────────────────────────

  /**
   * Does the ATC pipeline have a usable transcript for this participant?
   *
   * Deliberately counts PRIMARY sessions only. A transcript on a superseded session
   * is invisible to resolveStageSource(), so treating it as "present" would paint a
   * row green while its gen doc sits dataincomplete forever.
   */
  hasTranscript(r: Row): boolean { return r.hits.some((h) => h.primary && h.hasTranscript); }

  /** Transcript exists, but only on a session the resolver will never read. */
  supersededOnly(r: Row): boolean {
    return !r.walking && !this.hasTranscript(r) && r.hits.some((h) => h.hasTranscript);
  }

  noSession(r: Row): boolean { return !r.walking && r.hits.length === 0; }
  needsLink(r: Row): boolean { return !r.walking && r.hits.length > 0 && !this.hasTranscript(r); }

  targetStatus(r: Row): CaptureStatus {
    return r.hits.find((x) => x.laId === r.targetLaId)?.status ?? null;
  }
  isBusy(r: Row): boolean {
    const s = this.targetStatus(r);
    return s === 'queued' || s === 'processing' || s === 'retrigger';
  }

  /**
   * The single most useful thing to do with this row — this is what makes the
   * screen actionable rather than merely informative.
   */
  nextAction(r: Row): string {
    if (r.walking) return 'checking…';
    if (r.walkError) return 'walk failed — retry';
    if (this.isBusy(r)) return 'transcribing…';
    if (this.targetStatus(r) === 'failed') return 'retry the recording';
    if (this.noSession(r)) return r.crossed ? 'no studio session logged — cannot fix here' : 'not in studio yet';
    if (this.supersededOnly(r)) return 're-attach to current session';
    if (!this.hasTranscript(r)) return 'attach a Dropbox recording';
    if (!r.genDocId) return r.crossed ? 'transcript ready — no ATC doc yet' : 'transcript ready — waiting to cross';
    if (r.genStatus === 'dataincomplete') {
      return r.genMissing.length ? `rebuild (missing: ${r.genMissing.join(', ')})` : 'rebuild';
    }
    if (r.genStatus === 'error') return 'ATC errored — inspect';
    if (r.genStatus === 'completed') return 'done';
    return `ATC ${r.genStatus}`;
  }

  // ── save + live status + auto-rebuild ──────────────────────────────────────

  /**
   * Turn whatever the operator pasted into a DIRECT-DOWNLOAD URL.
   *
   * Dropbox's UI hands out share links (`www.dropbox.com/...?dl=0`) which serve an
   * HTML preview page, not bytes. RunPod's WhisperX worker fetches the URL raw, so a
   * share link produces a failed job with no useful error. Every URL the backfill
   * script ever wrote went through this same rewrite; doing it here means an
   * operator can paste straight from the Dropbox UI and it just works.
   */
  normalizeDropboxUrl(raw: string): string {
    let u = (raw ?? '').trim();
    if (!u) return u;
    u = u.replace('://www.dropbox.com', '://dl.dropboxusercontent.com')
         .replace('://dropbox.com', '://dl.dropboxusercontent.com');
    if (/[?&]dl=0(&|$)/.test(u)) return u.replace(/([?&])dl=0(&|$)/, '$1dl=1$2');
    if (/[?&]dl=1(&|$)/.test(u)) return u;
    return u + (u.includes('?') ? '&' : '?') + 'dl=1';
  }

  /** Is this even a Dropbox URL? Catches a pasted local path / random link early. */
  private looksLikeDropbox(u: string): boolean {
    return /^https:\/\/(dl\.dropboxusercontent|www\.dropbox|dropbox)\.com\//i.test(u);
  }

  /**
   * Write the pasted Dropbox URL onto the resolved live-assignment doc.
   *
   * Only `dropboxlink` (plus `profile_name`) is written. `dropboxlink` CHANGING is
   * what seLiveTranscribeSubmit gates on, and nothing the pipeline writes back
   * touches it — that is what prevents a resubmit loop, so no status field may be
   * set here. `profile_name` is written because assignSpeakers() uses it to decide
   * which diarized speaker is the coach; V1 never wrote it, which is why some
   * backfilled transcripts came back with coach and participant swapped.
   *
   * V1 also wrote `needtranscriptsforse: true`. That flag was the trigger condition
   * before 712edc8 changed it to fire on dropboxlink change; it is now vestigial and
   * is deliberately not written.
   */
  async saveLink(row: Row): Promise<void> {
    const pasted = (row.dropboxLink ?? '').trim();
    if (!pasted) { this.snackbar.open('Paste a Dropbox link first', 'Close', { duration: 3000 }); return; }
    if (!this.looksLikeDropbox(pasted)) {
      this.snackbar.open('That does not look like a Dropbox URL', 'Close', { duration: 5000 });
      return;
    }
    const url = this.normalizeDropboxUrl(pasted);
    if (!row.targetLaId) {
      this.snackbar.open(`No studio session on ${row.profile_name}'s queue lineage — a recording cannot be attached`, 'Close', { duration: 6000 });
      return;
    }
    const target = row.hits.find((h) => h.laId === row.targetLaId);
    if (target?.hasTranscript &&
        !confirm(`${row.profile_name} already has a transcript. Replace it with a new one from this recording?`)) {
      return;
    }

    row.saving = true;
    try {
      await setDoc(
        doc(this.firestore, 'live assignment', row.targetLaId),
        { dropboxlink: url, profile_name: row.profile_name ?? '' },
        { merge: true },
      );
      row.dropboxLink = url;   // show the operator what was actually stored
      this.snackbar.open(`Submitted — transcribing ${row.profile_name}`, 'Close', { duration: 3000 });
      this.watch(row);
    } catch (e: any) {
      console.error('saveLink failed', e);
      this.snackbar.open(`Save failed: ${e?.message ?? e}`, 'Close', { duration: 5000 });
    } finally {
      row.saving = false;
    }
  }

  /** Live-follow the target live assignment until the transcript lands (or fails). */
  private watch(row: Row): void {
    if (!row.targetLaId) return;
    const laId = row.targetLaId;
    this.laUnsubs.get(laId)?.();
    const unsub = onSnapshot(
      doc(this.firestore, 'live assignment', laId),
      (snap) => {
        const d: any = snap.exists() ? snap.data() : null;
        const hit = row.hits.find((h) => h.laId === laId);
        if (!hit || !d) return;
        hit.status = (d.transcriptCaptureStatus ?? null) as CaptureStatus;
        hit.hasTranscript = !!(d.transcript_text && String(d.transcript_text).trim());
        hit.dropboxlink = d.dropboxlink ?? '';
        hit.lastError = d.transcriptCaptureLastError;

        if (hit.hasTranscript || hit.status === 'failed') {
          this.laUnsubs.get(laId)?.();
          this.laUnsubs.delete(laId);
          if (hit.hasTranscript) {
            this.snackbar.open(`Transcript captured for ${row.profile_name}`, 'Close', { duration: 4000 });
            void this.rebuild(row, true);   // close the loop automatically
          } else {
            this.snackbar.open(
              `Transcription FAILED for ${row.profile_name}: ${hit.lastError ?? 'unknown'}`,
              'Close', { duration: 6000 });
          }
        }
        this.applyFilters();
      },
      (err) => console.error('watch failed', err),
    );
    this.laUnsubs.set(laId, unsub);
  }

  /**
   * Re-run the ATC resolver for this participant's generation doc.
   *
   * Called automatically once a transcript lands, and available manually. Skipped
   * when the doc is already `completed`: regenerating a finished ATC would discard a
   * good result and re-queue GPU inference for nothing.
   */
  async rebuild(row: Row, auto = false): Promise<void> {
    if (!row.genDocId) {
      if (!auto) this.snackbar.open('No ATC generation doc exists for this participant yet', 'Close', { duration: 5000 });
      return;
    }
    if (row.genStatus === 'completed') {
      if (!auto) this.snackbar.open('Already completed — not regenerating', 'Close', { duration: 4000 });
      return;
    }

    row.rebuilding = true;
    try {
      const res = await this.atcSvc.regenerateAtcDoc({ docid: row.genDocId });
      const data: any = res?.data;
      row.genStatus = (data?.status ?? row.genStatus) as AtcStatus;
      row.genMissing = (data?.missing ?? []).map((m: any) => m.stage);
      this.snackbar.open(
        data?.status === 'pending'
          ? `${row.profile_name}: ATC doc is now PENDING (${data.resolvedStages} stages resolved)`
          : `${row.profile_name}: still dataincomplete — missing ${row.genMissing.join(', ') || 'sources'}`,
        'Close', { duration: 6000 });
      this.applyFilters();
    } catch (e: any) {
      console.error('rebuild failed', e);
      this.snackbar.open(`Rebuild failed: ${e?.message ?? e}`, 'Close', { duration: 6000 });
    } finally {
      row.rebuilding = false;
    }
  }

  // ── filters / telemetry ────────────────────────────────────────────────────

  applyFilters(): void {
    const term = this.searchText.toLowerCase().trim();
    const tx = this.filterTranscript;
    const cr = this.filterCrossed;
    const gen = this.filterGen;

    this.dataSource.data = this.allRows.filter((r) => {
      if (tx === 'yes' && !this.hasTranscript(r)) return false;
      if (tx === 'no' && !this.needsLink(r)) return false;
      if (tx === 'superseded' && !this.supersededOnly(r)) return false;
      if (tx === 'nosession' && !this.noSession(r)) return false;

      if (cr === 'yes' && r.crossed !== true) return false;
      if (cr === 'no' && r.crossed !== false) return false;

      if (gen === 'none' && r.genDocId) return false;
      if (gen && gen !== 'none' && r.genStatus !== gen) return false;

      if (term &&
          !r.profile_name.toLowerCase().includes(term) &&
          !r.profile_id.toLowerCase().includes(term)) return false;
      return true;
    });
    if (this.paginator) this.paginator.firstPage();
  }

  clearFilters(): void {
    this.searchText = '';
    this.filterTranscript = '';
    this.filterCrossed = '';
    this.filterGen = '';
    this.applyFilters();
  }

  /** One-click drill-downs from the telemetry tiles. */
  focus(kind: 'crossed' | 'needsLink' | 'superseded' | 'noSession' | 'noGen' | 'dataincomplete'): void {
    this.clearFilters();
    if (kind === 'crossed') this.filterCrossed = 'yes';
    if (kind === 'needsLink') { this.filterCrossed = 'yes'; this.filterTranscript = 'no'; }
    if (kind === 'superseded') this.filterTranscript = 'superseded';
    if (kind === 'noSession') { this.filterCrossed = 'yes'; this.filterTranscript = 'nosession'; }
    if (kind === 'noGen') { this.filterCrossed = 'yes'; this.filterGen = 'none'; }
    if (kind === 'dataincomplete') this.filterGen = 'dataincomplete';
    this.applyFilters();
  }

  get totalAll(): number { return this.allRows.length; }
  get totalFiltered(): number { return this.dataSource.data.length; }
  get walking(): boolean { return this.walkProgress < this.walkTotal; }

  // funnel: crossed → transcript → ATC doc → completed
  get countCrossed(): number { return this.allRows.filter((r) => r.crossed === true).length; }
  get countWith(): number { return this.allRows.filter((r) => this.hasTranscript(r)).length; }
  get countNeeds(): number {
    return this.allRows.filter((r) => r.crossed === true && this.needsLink(r)).length;
  }
  get countSuperseded(): number { return this.allRows.filter((r) => this.supersededOnly(r)).length; }
  get countNoSession(): number {
    return this.allRows.filter((r) => r.crossed === true && this.noSession(r)).length;
  }
  get countNoGen(): number {
    return this.allRows.filter((r) => r.crossed === true && !r.genDocId).length;
  }
  get countGen(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.allRows) if (r.genStatus) out[r.genStatus] = (out[r.genStatus] ?? 0) + 1;
    return out;
  }
  /** Ready to rebuild right now: transcript present but ATC doc still blocked. */
  get countRebuildable(): number {
    return this.allRows.filter(
      (r) => this.hasTranscript(r) && r.genDocId && r.genStatus === 'dataincomplete').length;
  }
}
