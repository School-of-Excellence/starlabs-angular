import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  collection, doc, DocumentReference, Firestore, getDoc, getDocs, onSnapshot,
  query, setDoc, where,
} from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
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
import { TranscriptViewerDialog } from './transcript-viewer.dialog';
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
 *  1. QUEUE LIST IS DATA-DRIVEN. V1 hardcoded four queue ids. V2 lists every
 *     `queue generation` doc carrying an `atcrequiredstages` config. One queue at a
 *     time, on purpose: a participant recurs across queues (prep -> diagnostics) but
 *     crosses a given stage only once, so a multi-select yields duplicate rows for
 *     the same person and double-counts every tile. Picking one queue loses nothing
 *     — the lineage walk already reaches back through the ancestor queues.
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

/** One pairing stage of an ATC entry, with the completeness rule it lives under. */
export interface PairingCfg {
  stage: string;
  category: 'mandatory' | 'atleastonerequired';
  /** Studio stage → a Dropbox recording can be attached to it. */
  zoom: boolean;
}

/** One `atcrequiredstages` entry with generateatc:true — what the picker offers. */
export interface AtcStageCfg {
  stage: string;                 // the .stage field, e.g. "Guided Self ATC"
  ownType: string | null;        // the entry's own `type` (form | zoom)
  ownFormId: string | null;      // stageproperty[stage].actionresource.id, when form-typed
  pairings: PairingCfg[];
}

export interface QueueOpt {
  id: string;
  name: string;
  atcStages: AtcStageCfg[];
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

/**
 * One pairing source for one participant.
 *
 * `status` comes from two places by design:
 *   - ZOOM pairings are resolved by the browser chain walk, because those are the
 *     ones an operator can act on (attach a recording) and the walk is what finds
 *     the live-assignment doc to attach to.
 *   - FORM pairings are read from the gen doc's `stagedata`, which is the
 *     pipeline's own already-computed answer. Re-resolving them here would mean a
 *     second Firestore handle (firestore-forms) and a query per stage per
 *     participant, to reproduce a verdict we can simply read.
 * With no gen doc and no zoom type, status is 'unknown' rather than a guess.
 */
export interface PairingView {
  stage: string;
  category: 'mandatory' | 'atleastonerequired';
  zoom: boolean;
  status: 'resolved' | 'missing' | 'unknown';
  source: 'walk' | 'gendoc' | 'none';
  hits: LiveAssignmentHit[];      // zoom only
  targetLaId: string | null;      // zoom only — where a pasted link is written
  trail: string[];                // zoom only
  /**
   * Studio sessions that exist for this participant but are logged under queues
   * NOT on their transferredfrom lineage. Only probed when the walk found nothing.
   * Their existence means the token is disconnected from the participant's history
   * — the fix is to link the token, not to attach a recording.
   */
  offLineage: Array<{ laId: string; queueId: string; hasTranscript: boolean }>;
  offLineageProbed: boolean;
  dropboxLink: string;
  saving: boolean;
}

export interface Row {
  tokenId: string;
  queueId: string;
  queueName: string;
  profile_id: string;
  profile_name: string;
  currentstage: string;

  crossed: boolean | null;      // crossed the ATC stage? null until walked
  /**
   * 'here'        — token has no transferredfrom: the participant started in THIS
   *                 queue, so the lineage is a single level and there is nothing to
   *                 climb.
   * 'transferred' — token carries transferredfrom + tokentransferredfrom, so the
   *                 walk can reach ancestor queues.
   */
  origin: 'here' | 'transferred';
  /**
   * Token has been transferred OUT of this queue — it carries `transferredto`
   * (destination queue ref) and `tokentransferredto` (destination token ref).
   */
  transferredOut: boolean;
  /** Destination queue, from `transferredto`. */
  toQueueId: string | null;
  toQueueName: string;
  /** Destination token, from `tokentransferredto` — the exact token to look up. */
  toTokenId: string | null;
  walking: boolean;
  walkError: string | null;

  pairings: PairingView[];

  genDocId: string | null;      // queue_atc_generation doc, if one exists
  genStatus: AtcStatus | null;
  /**
   * Which queue the gen doc was actually found in — this queue, or the queue the
   * token was transferred to. Being transferred does NOT by itself mean the doc
   * moved: 89 of 120 transferred-and-completed tokens still had their doc here.
   * So the destination is CHECKED rather than assumed.
   */
  genIn: 'this' | 'ancestor' | 'destination' | null;
  /** Display name of the queue the doc was found in, when not this queue. */
  genInQueueName: string;
  /**
   * A gen doc exists for this PROFILE but under a different queue_token. Not the
   * same as having one: docs are keyed to a token, so this is a data smell (a
   * duplicate/rebuilt token) rather than a satisfied requirement.
   */
  genOtherToken: boolean;
  genMissing: string[];         // what is ACTUALLY blocking — see blockingMissing()

  /**
   * Is the config stage's OWN source (its form) present for this participant in
   * THIS queue? The gate processStage checks: no own form under the queue => no gen
   * doc is ever created, by design. Set only for a crossed row with no doc anywhere
   * (where it explains the absence): true => doc SHOULD exist (recovery gap / needs
   * backfill); false => no ATC form submitted here => correctly no doc (expected).
   * null = not applicable (a doc exists, not crossed, or own source isn't a form).
   */
  ownFormPresent: boolean | null;

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
    MatIconModule, MatSelectModule, MatDialogModule,
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
  /**
   * SINGLE queue, deliberately not multi-select. A participant recurs across
   * queues (prep -> diagnostics) but crosses a given stage only once, so selecting
   * several queues produced one row per queue for the same person — each walking a
   * different lineage — and double-counted every funnel tile. The lineage walk
   * already reaches back through the ancestor queues, so one queue is all you pick.
   */
  selectedQueueId = '';
  /** The chosen atcrequiredstages[].stage, e.g. "Guided Self ATC". */
  selectedAtcStage = '';
  queuesLoading = true;
  queuesError: string | null = null;

  // ---- table ----
  dataSource = new MatTableDataSource<Row>([]);
  allRows: Row[] = [];
  // No 'queue' column: with a single-select queue every row shares it.
  displayedColumns = [
    'profile_name', 'currentstage', 'crossed',
    'sources', 'studio', 'genDoc',
  ];

  loading = false;
  walkProgress = 0;
  walkTotal = 0;

  // ---- filters ----
  searchText = '';
  filterTranscript = '';   // '' | 'yes' | 'no' | 'superseded' | 'nosession'
  filterCrossed = '';      // '' | 'yes' | 'no'
  filterGen: string[] = [];  // multi: 'none' | AtcStatus
  filterRebuildable = false;
  filterConfigData = '';   // '' | 'present' | 'missing' (own config form, among no-doc rows)
  filterOrigin = '';         // '' | 'here' | 'transferred'

  readonly genStatusOptions: AtcStatus[] =
    ['dataincomplete', 'pending', 'processing', 'completed', 'error'];

  // ---- caches (bound the read volume of the walk) ----
  private queueDataCache = new Map<string, any>();
  private tokenCache = new Map<string, any>();
  private variationCache = new Map<string, string[] | null>();
  /** profileid → gen doc, per selected queue. */
  /**
   * queue_token_id → gen doc (with the queue it lives in). Keyed by TOKEN, not
   * profile: a gen doc is written against one token, and 13 of 384 (queue, profile)
   * pairs in prod carry more than one doc, so a profile key is ambiguous. This is a
   * UNIFIED map across every queue loaded — this queue, transferredto destinations,
   * and transferredfrom ancestors discovered during the walk.
   */
  private genByToken = new Map<string, { id: string; data: AtcGenDoc; queueId: string }>();
  /** profileid → true, across every loaded queue. Detects a doc under a DIFFERENT token. */
  private genProfiles = new Set<string>();
  /** queueId → promise of its gen-doc load, so each queue is scanned at most once. */
  private genQueueLoads = new Map<string, Promise<void>>();
  /**
   * profileids who submitted the config stage's OWN form IN the selected queue —
   * bulk-loaded with ONE query, not one per participant. This is the gate
   * processStage checks (own source, queueref-scoped), so membership tells whether
   * a missing gen doc is a genuine gap (form present) or expected (no form).
   */
  private ownFormProfiles = new Set<string>();
  private ownFormLoaded = false;

  /** Stages that are studio (zoom) stages ANYWHERE — see buildZoomCapableSet(). */
  private zoomCapable = new Set<string>();

  private laUnsubs = new Map<string, () => void>();
  private destroyed = false;

  constructor(
    private firestore: Firestore,
    private atcSvc: AtcFirebaseService,
    private snackbar: MatSnackBar,
    private dialog: MatDialog,
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

  /**
   * pairingstages may be a legacy flat array OR {mandatory, atleastonerequired}.
   * A legacy array is treated as all-mandatory, matching resolver.normalizePairingStages.
   */
  private normalizePairing(raw: any): Array<{ stage: string; category: 'mandatory' | 'atleastonerequired' }> {
    const out: Array<{ stage: string; category: 'mandatory' | 'atleastonerequired' }> = [];
    if (Array.isArray(raw)) {
      raw.forEach((st: string) => out.push({ stage: st, category: 'mandatory' }));
    } else if (raw && typeof raw === 'object') {
      (raw.mandatory ?? []).forEach((st: string) => out.push({ stage: st, category: 'mandatory' }));
      (raw.atleastonerequired ?? []).forEach((st: string) => {
        if (!out.some((p) => p.stage === st)) out.push({ stage: st, category: 'atleastonerequired' });
      });
    }
    return out;
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

        // The picker is driven by atcrequiredstages[].stage — the ATC stage being
        // generated. Its pairingstages are the sources that must resolve for it.
        const atcStages: AtcStageCfg[] = req
          .filter((s) => s?.generateatc === true && s?.stage)
          .map((s) => ({
            stage: String(s.stage),
            ownType: s?.type ?? null,
            ownFormId: (data?.stageproperty ?? {})[String(s.stage)]?.actionresource?.id ?? null,
            pairings: this.normalizePairing(s?.pairingstages)
              .map((p) => ({ ...p, zoom: this.zoomCapable.has(p.stage) })),
          }));
        if (!atcStages.length) return;
        opts.push({ id: d.id, name: String(data?.queuename ?? d.id), atcStages });
      });

      this.queues = opts.sort((a, b) => a.name.localeCompare(b.name));
      if (this.queues.length) {
        this.selectedQueueId = this.queues[0].id;
        this.selectedAtcStage = this.queues[0].atcStages[0]?.stage ?? '';
      }
    } catch (e: any) {
      console.error('loadQueues failed', e);
      this.queuesError = e?.message ?? 'Failed to load queues';
    } finally {
      this.queuesLoading = false;
    }
  }

  get selectedQueueOpt(): QueueOpt | undefined {
    return this.queues.find((q) => q.id === this.selectedQueueId);
  }

  get availableAtcStages(): AtcStageCfg[] {
    return this.selectedQueueOpt?.atcStages ?? [];
  }

  /** Config for the currently picked ATC stage. */
  get atcCfg(): AtcStageCfg | undefined {
    return this.availableAtcStages.find((a) => a.stage === this.selectedAtcStage);
  }

  /** Pairings we can actually act on — a Dropbox recording only fits a studio stage. */
  get zoomPairings(): PairingCfg[] {
    return (this.atcCfg?.pairings ?? []).filter((p) => p.zoom);
  }

  get pairingSummary(): string {
    return (this.atcCfg?.pairings ?? [])
      .map((p) => `${p.stage}${p.category === 'atleastonerequired' ? ' (one-of)' : ''}`)
      .join(', ') || '—';
  }

  onQueueChange(): void {
    if (!this.availableAtcStages.some((a) => a.stage === this.selectedAtcStage)) {
      this.selectedAtcStage = this.availableAtcStages[0]?.stage ?? '';
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

  /**
   * Has this token left the queue?
   *
   * The authoritative signal is the pair `transferredto` (destination queue ref) +
   * `tokentransferredto` (destination token ref) — the mirror of the
   * transferredfrom / tokentransferredfrom pair the lineage walk climbs.
   * `currentstage === "Transfered"` is accepted as a fallback because one prod
   * token carries the stage without the refs. Spelling is matched loosely (the
   * configs use a single r) so a later correction cannot silently break this.
   *
   * NOTE this is only "has left", NOT "its ATC doc is elsewhere". Those are
   * different questions and conflating them is wrong in both directions: of 120
   * transferred tokens that had moved on to Completed, 89 still had their gen doc
   * in THIS queue. Where the doc lives is resolved by looking, in loadGenDocs().
   */
  private isTransferredOut(t: any): boolean {
    if (t?.transferredto && t?.tokentransferredto) return true;
    return /^transfer/i.test(String(t?.currentstage ?? '').trim());
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
  /**
   * Resolve EVERY zoom pairing of the selected ATC stage for one participant, in a
   * single pass over the transferredfrom lineage.
   *
   * Mirrors resolver.resolveStageData's loop: at each level only look at stages
   * that TYPE-MATCH there. A stage that does not type at this level is not
   * "missing" — it simply belongs to a deeper level of the lineage, so it is
   * retried on the next hop. One pass serves all pairings, so a second studio
   * stage costs no extra hops.
   *
   * The lineage is walked to EXHAUSTION rather than stopping at the first level
   * that yields a session. The resolver only stops when a source actually
   * RESOLVES; a level whose newest session carries no transcript does not stop it,
   * and the real transcript may sit one hop deeper. Stopping early here would
   * report "missing" for a participant the pipeline can resolve fine. Whether a
   * transcript exists is only known after hydrateHits() reads the docs, which is
   * why the decision cannot be made inside this loop.
   */
  private async walkPairings(
    queueRef: DocumentReference, queueData: any, tokenData: any, tokenId: string,
    pairings: PairingCfg[],
  ): Promise<{
    views: Map<string, { hits: LiveAssignmentHit[]; trail: string[] }>;
    crossed: boolean;
    lineage: Array<{ queueId: string; tokenId: string }>;
  }> {
    const views = new Map<string, { hits: LiveAssignmentHit[]; trail: string[] }>();
    pairings.forEach((p) => views.set(p.stage, { hits: [], trail: [] }));

    const visited = new Set<string>([tokenId]);
    // (queueId, tokenId) at each level the walk visits — this queue first, then
    // each transferredfrom ancestor. The ATC-doc lookup checks the participant's
    // doc against every token on this lineage, so an ancestor's doc is found.
    const lineage: Array<{ queueId: string; tokenId: string }> = [{ queueId: queueRef.id, tokenId }];
    let lvlQ = queueRef, lvlQD = queueData, lvlT = tokenData, level = 0;
    let crossed = false;

    while (true) {
      const active = await this.activeStagesOf(lvlQD, lvlT);
      if (level === 0) {
        crossed = this.isCrossed(active, tokenData?.currentstage ?? '', this.selectedAtcStage);
      }

      for (const { stage } of pairings) {
        const type = this.stageTypeAt(lvlQD, stage, active);
        const view = views.get(stage)!;
        if (type !== 'zoom') {
          // not a studio stage at THIS level — may still be one further back
          view.trail.push(`${this.queueLabel(lvlQ.id)}[${type ?? '–'}]:0`);
          continue;
        }

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
        let seenAtLevel = 0, found = 0;
        for (const l of logs) {
          const laId = l['liveassignmentid'];
          if (!laId || view.hits.some((h) => h.laId === laId)) continue;
          view.hits.push({
            laId, queueId: lvlQ.id, level, primary: seenAtLevel === 0,
            exists: false, hasTranscript: false, status: null, dropboxlink: '',
          });
          seenAtLevel++; found++;
        }
        view.trail.push(`${this.queueLabel(lvlQ.id)}[zoom]:${found}`);
      }

      // climb one hop: BOTH refs are required, exactly as the resolver requires
      const aq = lvlT?.transferredfrom, at = lvlT?.tokentransferredfrom;
      if (!aq || !at || level >= 12 || visited.has(at.id)) break;
      visited.add(at.id);

      let prevToken = this.tokenCache.get(at.id);
      if (prevToken === undefined) {
        try { const snap2 = await getDoc(at); prevToken = snap2.exists() ? snap2.data() : null; }
        catch { prevToken = null; }
        this.tokenCache.set(at.id, prevToken);
      }
      if (!prevToken) break;
      const prevQD = await this.queueDataOf(aq.id, aq);
      if (!prevQD) break;

      lvlQ = aq; lvlQD = prevQD; lvlT = prevToken; level++;
      lineage.push({ queueId: aq.id, tokenId: at.id });
    }

    return { views, crossed, lineage };
  }

  private queueLabel(id: string): string {
    return this.queues.find((x) => x.id === id)?.name ?? id.slice(0, 6);
  }

  /**
   * When the lineage walk found NO studio session, ask the blunt question: does one
   * exist for this participant ANYWHERE?
   *
   * This is the diagnosis for a token with no `transferredfrom`. Such a token has a
   * single-level lineage, so if the studio stage is not part of THIS queue's flow
   * there is nowhere to look — yet the participant may well have done the session
   * under a different queue. Both of bk2Fx9's originated-here participants are
   * exactly this: Scope Enhancement sessions logged under V3hxDt / L3rqCr, a token
   * that cannot reach them, and consequently no gen doc at all.
   *
   * Distinguishing "never did the session" from "did it, but the token is
   * disconnected" matters because the fixes are completely different: the first
   * needs a recording, the second needs the token's lineage repaired. Attaching a
   * recording to the second would be wrong.
   *
   * Deliberately a LAST-RESORT query — the same flat, queueref-less lookup that was
   * v1's central bug — run only for rows the walk already came up empty on, and
   * used only as evidence, never to pick an attach target.
   */
  private async probeOffLineage(row: Row, p: PairingView): Promise<void> {
    p.offLineageProbed = true;
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'queue stage log'),
        where('currentstage', '==', p.stage),
        where('status', '==', 'instudio'),
        where('profile_id', '==', row.profile_id),
      ));
      const seen = new Set<string>();
      const rows = snap.docs.map((d) => d.data()).filter((l: any) => {
        const id = l.liveassignmentid;
        if (!id || seen.has(id)) return false;
        seen.add(id); return true;
      });
      await Promise.all(rows.map(async (l: any) => {
        let hasTranscript = false;
        try {
          const la = await getDoc(doc(this.firestore, 'live assignment', l.liveassignmentid));
          const ld: any = la.exists() ? la.data() : null;
          hasTranscript = !!(ld?.transcript_text && String(ld.transcript_text).trim());
        } catch { /* evidence only */ }
        p.offLineage.push({ laId: l.liveassignmentid, queueId: l.queueref?.id ?? '?', hasTranscript });
      }));
    } catch (e) {
      console.error('probeOffLineage failed', e);
    }
  }

  /** Read each discovered live assignment and record whether a transcript exists. */
  private async hydrateHits(hits: LiveAssignmentHit[]): Promise<void> {
    // Independent reads — fetch them together rather than one at a time.
    await Promise.all(hits.map(async (h) => {
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
    }));
  }

  // ── generation docs (the "did an ATC doc get made" half of the funnel) ──────

  /**
   * Load every queue_atc_generation doc of ONE queue into the unified genByToken
   * map. Cached by queue id (shared promise) so a queue is scanned at most once no
   * matter how many participants' lineages pass through it — the 384 transferred
   * V3hx tokens all point at the same destination, and many share ancestors.
   */
  private loadQueueGenDocs(qid: string): Promise<void> {
    if (!this.genQueueLoads.has(qid)) {
      this.genQueueLoads.set(qid, (async () => {
        try {
          const snap = await getDocs(query(
            collection(this.atcSvc.atcDb, 'queue_atc_generation'),
            where('queueref', '==', doc(this.atcSvc.atcDb, 'queue generation', qid)),
          ));
          const rank = (x?: string | null) =>
            ['error', 'dataincomplete', 'pending', 'processing', 'completed'].indexOf(String(x));
          snap.docs.forEach((d) => {
            const data: any = d.data();
            if (data.profileid) this.genProfiles.add(data.profileid);
            if (!data.queue_token_id) return;
            const prev = this.genByToken.get(data.queue_token_id);
            // Prefer the most advanced doc if one token somehow has several.
            if (!prev || rank(data.status) > rank(prev.data.status)) {
              this.genByToken.set(data.queue_token_id, { id: d.id, data, queueId: qid });
            }
          });
        } catch (e) {
          console.error(`loadQueueGenDocs failed for ${qid}`, e);
        }
      })());
    }
    return this.genQueueLoads.get(qid)!;
  }

  private resetGenCaches(): void {
    this.genByToken.clear();
    this.genProfiles.clear();
    this.genQueueLoads.clear();
    this.ownFormProfiles.clear();
    this.ownFormLoaded = false;
  }

  /**
   * Bulk-load the set of profiles who submitted the config stage's own form in the
   * selected queue — a single formsByClient query (two equality filters: formid +
   * queueref, no composite index needed), not one read per participant. queueref in
   * formsByClient is a DocumentReference at path "queue generation/{id}" built on
   * the forms DB (that is what the pipeline's resolver matches against). Only
   * meaningful when the own source is a form; a zoom own stage leaves the set empty
   * and ownFormPresent stays null.
   */
  private async loadOwnFormProfiles(): Promise<void> {
    this.ownFormProfiles.clear();
    this.ownFormLoaded = false;
    const cfg = this.atcCfg;
    if (!cfg || cfg.ownType !== 'form' || !cfg.ownFormId) return;   // can't bulk-check a non-form own source
    try {
      const snap = await getDocs(query(
        collection(this.atcSvc.formsDb, 'formsByClient'),
        where('formid', '==', cfg.ownFormId),
        where('queueref', '==', doc(this.atcSvc.formsDb, 'queue generation', this.selectedQueueId)),
      ));
      snap.docs.forEach((d) => {
        const pid = (d.data() as any)?.profileid;
        if (pid) this.ownFormProfiles.add(pid);
      });
      this.ownFormLoaded = true;
    } catch (e) {
      console.error('loadOwnFormProfiles failed', e);
    }
  }

  /**
   * What is ACTUALLY blocking this gen doc — mirrors resolver.computeStatus().
   *
   * Listing every stagedata entry with status 'missing' is wrong and actively
   * misleading. `atleastonerequired` stages are alternatives: the group is
   * satisfied as soon as ONE of them resolves, so the others sit at 'missing'
   * forever by design. A doc can be perfectly healthy (status pending, prompt
   * built) while still showing a missing entry — e.g. "uP! Life Report" missing
   * because "uP! Life Aspiration Report" resolved instead. Showing that reads as a
   * problem to fix when there is nothing to fix.
   *
   * Rule, identical to the backend's:
   *   - mandatory missing        → always blocking, list each one
   *   - atleastonerequired       → blocking ONLY if none of the group resolved,
   *                                and then reported as one "need one of" item
   */
  private blockingMissing(stagedata: any): string[] {
    const entries = Object.entries(stagedata ?? {}) as Array<[string, any]>;
    const out = entries
      .filter(([, v]) => v?.category === 'mandatory' && v?.status === 'missing')
      .map(([k]) => k);

    const group = entries.filter(([, v]) => v?.category === 'atleastonerequired');
    if (group.length && !group.some(([, v]) => v?.status === 'resolved')) {
      out.push(`one of: ${group.map(([k]) => k).join(' / ')}`);
    }
    return out;
  }

  /**
   * Resolve the participant's ATC doc by walking their token lineage IN ORDER, the
   * same order the pipeline itself would attribute one:
   *
   *   1. this queue + this token        — the doc generated for them here
   *   2. transferredfrom ancestors      — they transferred IN; the doc may have been
   *                                       generated in the queue they came from
   *   3. transferredto destination      — they transferred OUT; the doc may have been
   *                                       generated in the queue they went to
   *
   * The first hit wins, so a doc "here" is always preferred over an inherited one.
   * Only when NO token on the whole lineage has a doc is the participant genuinely
   * missing one. `lineage` (this token + every transferredfrom ancestor) is collected
   * for free by the studio-session walk; the destination token is appended here.
   *
   * Every queue the lineage touches is loaded on demand and cached, so an ancestor
   * or destination queue is scanned at most once regardless of how many
   * participants pass through it.
   */
  private async applyGenDoc(
    row: Row, lineage: Array<{ queueId: string; tokenId: string }>,
  ): Promise<void> {
    // The ordered list of (queue, token) to check: own lineage, then destination.
    const chain = [...lineage];
    if (row.transferredOut && row.toQueueId && row.toTokenId) {
      chain.push({ queueId: row.toQueueId, tokenId: row.toTokenId });
    }
    // Load every queue involved (cached / shared).
    await Promise.all([...new Set(chain.map((c) => c.queueId))].map((q) => this.loadQueueGenDocs(q)));

    let hit: { id: string; data: AtcGenDoc; queueId: string } | undefined;
    let where: 'this' | 'ancestor' | 'destination' | null = null;
    for (const step of chain) {
      const g = this.genByToken.get(step.tokenId);
      if (!g) continue;
      hit = g;
      where = step.queueId === this.selectedQueueId ? 'this'
            : (row.toTokenId === step.tokenId ? 'destination' : 'ancestor');
      break;
    }

    row.genDocId = hit?.id ?? null;
    row.genStatus = (hit?.data.status ?? null) as AtcStatus | null;
    row.genIn = where;
    row.genOtherToken = !hit && this.genProfiles.has(row.profile_id);
    // Only explanatory for a crossed row with NO doc anywhere; otherwise n/a.
    row.ownFormPresent = (!hit && row.crossed && this.ownFormLoaded)
      ? this.ownFormProfiles.has(row.profile_id) : null;
    if (hit && where !== 'this') row.genInQueueName = this.queueLabel(hit.queueId);
    const sd: any = hit ? (hit.data as any).stagedata ?? {} : null;
    row.genMissing = hit ? this.blockingMissing(sd) : [];

    // Seed NON-studio pairings from the gen doc. The pipeline already resolved
    // them; re-deriving a form's status in the browser would need a second
    // Firestore handle (firestore-forms) and a query per stage per participant to
    // reproduce a verdict we can just read. Studio pairings are left alone — the
    // chain walk owns those, because those are the ones an operator can act on.
    for (const p of row.pairings) {
      if (p.zoom) continue;
      const entry = sd?.[p.stage];
      p.status = entry ? (entry.status === 'resolved' ? 'resolved' : 'missing') : 'unknown';
      p.source = entry ? 'gendoc' : 'none';
    }
  }

  // ── load ───────────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (!this.selectedQueueId || !this.selectedAtcStage) return;

    this.loading = true;
    this.allRows = [];
    this.dataSource.data = [];
    this.walkProgress = 0;

    try {
      this.resetGenCaches();
      await this.loadOwnFormProfiles();   // one query — the config-stage own-form gate
      const rows: Row[] = [];
      const cfgPairings = this.atcCfg?.pairings ?? [];
      {
        const qid = this.selectedQueueId;
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
            origin: (t.transferredfrom && t.tokentransferredfrom) ? 'transferred' : 'here',
            transferredOut: this.isTransferredOut(t),
            toQueueId: t.transferredto?.id ?? null,
            toQueueName: t.transferredto?.id ? this.queueLabel(t.transferredto.id) : '',
            toTokenId: t.tokentransferredto?.id ?? null,
            walking: true, walkError: null,
            pairings: cfgPairings.map((c) => ({
              stage: c.stage, category: c.category, zoom: c.zoom,
              status: 'unknown' as const, source: 'none' as const,
              hits: [], targetLaId: null, trail: [],
              offLineage: [], offLineageProbed: false,
              dropboxLink: '', saving: false,
            })),
            genDocId: null, genStatus: null, genMissing: [], genIn: null,
            genInQueueName: '', genOtherToken: false, ownFormPresent: null,
            rebuilding: false,
            _token: t,
          });
        });
      }

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
   * Walk rows through a bounded pool. A queue holds ~700 Active tokens and each walk
   * is several round-trips; an unbounded Promise.all (v1) stalls the tab and
   * exhausts the SDK's long-polling connection pool. 12 is a deliberate ceiling —
   * higher starts contending on that pool on this network. The per-row cost is also
   * cut by parallelising the independent reads inside each walk (see hydrateHits /
   * probeOffLineage) and by the token/queue/gen caches shared across all rows.
   */
  private readonly WALK_POOL = 12;
  private async walkAll(): Promise<void> {
    const POOL = this.WALK_POOL;
    let cursor = 0;
    const rows = this.allRows;

    const worker = async (): Promise<void> => {
      while (cursor < rows.length && !this.destroyed) {
        const row = rows[cursor++];
        try {
          const qref = doc(this.firestore, 'queue generation', row.queueId);
          const { views, crossed, lineage } = await this.walkPairings(
            qref, this.queueDataCache.get(row.queueId), row._token, row.tokenId,
            this.zoomPairings);
          row.crossed = crossed;

          // Resolve the ATC doc across the full token lineage (this token → every
          // transferredfrom ancestor → transferredto destination). lineage was
          // collected by the walk above, so this adds only the gen-doc reads.
          await this.applyGenDoc(row, lineage);

          for (const pv of row.pairings) {
            const v = views.get(pv.stage);
            if (!v) continue;                       // form pairing — status came from the gen doc
            await this.hydrateHits(v.hits);
            pv.hits = v.hits;
            pv.trail = v.trail;
            pv.source = 'walk';
            pv.status = v.hits.some((h) => h.primary && h.hasTranscript) ? 'resolved' : 'missing';
            // Paste target = the nearest PRIMARY session still lacking a transcript.
            // Primary because that is the only doc the resolver reads at a level;
            // nearest because that is the level the resolver reaches first. Writing
            // to a superseded session yields a transcript the pipeline ignores.
            pv.targetLaId = (
              v.hits.find((h) => h.primary && !h.hasTranscript) ??
              v.hits.find((h) => h.primary) ??
              v.hits[0]
            )?.laId ?? null;
            pv.dropboxLink = v.hits.find((h) => h.dropboxlink)?.dropboxlink ?? '';
            // nothing on the lineage — is there a session off it?
            if (!v.hits.length) await this.probeOffLineage(row, pv);
          }
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

  /** The studio pairings of this row (the ones a recording can be attached to). */
  studio(r: Row): PairingView[] { return r.pairings.filter((p) => p.zoom); }

  /**
   * Does the ATC pipeline have a usable transcript for every studio pairing?
   *
   * Counts PRIMARY sessions only. A transcript on a superseded session is invisible
   * to resolveStageSource(), so treating it as "present" would paint a row green
   * while its gen doc sits dataincomplete forever.
   */
  hasTranscript(r: Row): boolean {
    const st = this.studio(r);
    return st.length > 0 && st.every((p) => p.status === 'resolved');
  }

  /** Transcript exists, but only on a session the resolver will never read. */
  supersededOnly(r: Row): boolean {
    if (r.walking || this.hasTranscript(r)) return false;
    return this.studio(r).some(
      (p) => p.status !== 'resolved' && p.hits.some((h) => h.hasTranscript));
  }

  noSession(r: Row): boolean {
    if (r.walking) return false;
    const st = this.studio(r);
    return st.length > 0 && st.every((p) => p.hits.length === 0);
  }

  needsLink(r: Row): boolean {
    if (r.walking) return false;
    return this.studio(r).some((p) => p.status !== 'resolved' && p.hits.length > 0);
  }

  /** No session on the lineage, but sessions exist elsewhere — a broken token link. */
  offLineageOnly(r: Row): boolean {
    if (r.walking) return false;
    return this.studio(r).some((p) => !p.hits.length && p.offLineage.length > 0);
  }

  pairingStatus(p: PairingView): CaptureStatus {
    return p.hits.find((h) => h.laId === p.targetLaId)?.status ?? null;
  }
  pairingBusy(p: PairingView): boolean {
    const st = this.pairingStatus(p);
    return st === 'queued' || st === 'processing' || st === 'retrigger';
  }
  isBusy(r: Row): boolean { return this.studio(r).some((p) => this.pairingBusy(p)); }

  /** Transcript present but on a superseded session, for THIS pairing. */
  pairingSuperseded(p: PairingView): boolean {
    return p.status !== 'resolved' && p.hits.some((h) => h.hasTranscript);
  }

  /**
   * The single most useful thing to do with this row — this is what makes the
   * screen actionable rather than merely informative.
   */
  nextAction(r: Row): string {
    if (r.walking) return 'checking…';
    if (r.walkError) return 'walk failed — retry';
    if (this.isBusy(r)) return 'transcribing…';
    if (this.studio(r).some((p) => this.pairingStatus(p) === 'failed')) return 'retry the recording';
    if (this.offLineageOnly(r)) return 'session exists off-lineage — link the token';
    if (this.noSession(r)) return r.crossed ? 'no studio session logged — cannot fix here' : 'not in studio yet';
    if (this.supersededOnly(r)) return 're-attach to current session';
    if (!this.hasTranscript(r)) return 'attach a Dropbox recording';
    if (r.genIn === 'ancestor') return `ATC doc is in ${r.genInQueueName || 'the queue they came from'}`;
    if (r.genIn === 'destination') return `ATC doc is in ${r.genInQueueName || 'the queue they went to'}`;
    if (r.genOtherToken) return 'ATC doc exists under a DIFFERENT token — check for a duplicate';
    if (!r.genDocId) {
      if (r.crossed && r.ownFormPresent === true) return 'config form submitted — ATC doc missing (backfill)';
      if (r.crossed && r.ownFormPresent === false) return 'no config form submitted — no ATC doc expected';
      if (r.transferredOut) return `transferred out — no ATC doc in either queue`;
      return r.crossed ? 'crossed — no ATC doc yet' : 'not yet crossed';
    }
    if (r.genStatus === 'dataincomplete') {
      return r.genMissing.length ? `rebuild — needs ${r.genMissing.join('; ')}` : 'rebuild';
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
   * Write the pasted Dropbox URL onto the live-assignment doc resolved for ONE
   * studio pairing.
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
  async saveLink(row: Row, p: PairingView): Promise<void> {
    const pasted = (p.dropboxLink ?? '').trim();
    if (!pasted) { this.snackbar.open('Paste a Dropbox link first', 'Close', { duration: 3000 }); return; }
    if (!this.looksLikeDropbox(pasted)) {
      this.snackbar.open('That does not look like a Dropbox URL', 'Close', { duration: 5000 });
      return;
    }
    const url = this.normalizeDropboxUrl(pasted);
    if (!p.targetLaId) {
      this.snackbar.open(
        `No ${p.stage} session on ${row.profile_name}'s queue lineage — a recording cannot be attached`,
        'Close', { duration: 6000 });
      return;
    }
    const target = p.hits.find((h) => h.laId === p.targetLaId);
    if (target?.hasTranscript &&
        !confirm(`${row.profile_name} already has a ${p.stage} transcript. Replace it with a new one from this recording?`)) {
      return;
    }

    p.saving = true;
    try {
      await setDoc(
        doc(this.firestore, 'live assignment', p.targetLaId),
        { dropboxlink: url, profile_name: row.profile_name ?? '' },
        { merge: true },
      );
      p.dropboxLink = url;   // show the operator what was actually stored
      this.snackbar.open(`Submitted — transcribing ${row.profile_name}`, 'Close', { duration: 3000 });
      this.watch(row, p);
    } catch (e: any) {
      console.error('saveLink failed', e);
      this.snackbar.open(`Save failed: ${e?.message ?? e}`, 'Close', { duration: 5000 });
    } finally {
      p.saving = false;
    }
  }

  /** Live-follow the target live assignment until the transcript lands (or fails). */
  private watch(row: Row, p: PairingView): void {
    if (!p.targetLaId) return;
    const laId = p.targetLaId;
    this.laUnsubs.get(laId)?.();
    const unsub = onSnapshot(
      doc(this.firestore, 'live assignment', laId),
      (snap) => {
        const d: any = snap.exists() ? snap.data() : null;
        const hit = p.hits.find((h) => h.laId === laId);
        if (!hit || !d) return;
        hit.status = (d.transcriptCaptureStatus ?? null) as CaptureStatus;
        hit.hasTranscript = !!(d.transcript_text && String(d.transcript_text).trim());
        hit.dropboxlink = d.dropboxlink ?? '';
        hit.lastError = d.transcriptCaptureLastError;
        if (hit.primary && hit.hasTranscript) p.status = 'resolved';

        if (hit.hasTranscript || hit.status === 'failed') {
          this.laUnsubs.get(laId)?.();
          this.laUnsubs.delete(laId);
          if (hit.hasTranscript) {
            this.snackbar.open(`Transcript captured for ${row.profile_name}`, 'Close', { duration: 4000 });
            // Close the loop only once EVERY studio pairing is satisfied — rebuilding
            // while another mandatory transcript is still missing just re-reports
            // dataincomplete.
            if (this.hasTranscript(row)) void this.rebuild(row, true);
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

      // Re-read the doc rather than trusting the callable's `missing` array: that
      // array lists every unresolved stage, including atleastonerequired siblings
      // that are missing purely because another member of their group resolved.
      // blockingMissing() applies the resolver's own completeness rule.
      try {
        const fresh = await getDoc(doc(this.atcSvc.atcDb, 'queue_atc_generation', row.genDocId));
        const fd: any = fresh.exists() ? fresh.data() : null;
        if (fd) {
          row.genStatus = fd.status ?? row.genStatus;
          row.genMissing = this.blockingMissing(fd.stagedata);
        }
      } catch { /* keep the callable's answer */ }

      this.snackbar.open(
        row.genStatus === 'pending'
          ? `${row.profile_name}: ATC doc is now PENDING (${data?.resolvedStages ?? '?'} stages resolved)`
          : `${row.profile_name}: still dataincomplete — needs ${row.genMissing.join('; ') || 'sources'}`,
        'Close', { duration: 6000 });
      this.applyFilters();
    } catch (e: any) {
      console.error('rebuild failed', e);
      this.snackbar.open(`Rebuild failed: ${e?.message ?? e}`, 'Close', { duration: 6000 });
    } finally {
      row.rebuilding = false;
    }
  }

  /**
   * Open the captured transcript for one studio session.
   *
   * The dialog is handed a loader rather than the data, so the document is fetched
   * only when actually opened — the table never reads transcript bodies (they run
   * to ~90k chars; pre-loading hundreds would be pointless traffic).
   */
  viewTranscript(row: Row, p: PairingView, laId?: string): void {
    const id = laId ?? p.hits.find((h) => h.primary && h.hasTranscript)?.laId
                    ?? p.hits.find((h) => h.hasTranscript)?.laId;
    if (!id) { this.snackbar.open('No captured transcript for this session', 'Close', { duration: 4000 }); return; }

    this.dialog.open(TranscriptViewerDialog, {
      autoFocus: false,
      data: {
        participant: row.profile_name || row.profile_id,
        laId: id,
        load: async () => {
          const snap = await getDoc(doc(this.firestore, 'live assignment', id));
          if (!snap.exists()) return null;
          const d: any = snap.data();
          return {
            transcript_text: d.transcript_text ?? '',
            coach: d.coach,
            confidence: d.confidence,
            audio_sec: d.audio_sec ?? null,
            capturedAt: d.transcriptCapturedAt?.toDate?.() ?? null,
            dropboxlink: d.dropboxlink ?? '',
          };
        },
      },
    });
  }

  /** Any session on this pairing that has a transcript worth opening. */
  viewableLa(p: PairingView): string | null {
    return (p.hits.find((h) => h.primary && h.hasTranscript)
         ?? p.hits.find((h) => h.hasTranscript))?.laId ?? null;
  }

  // ── filters / telemetry ────────────────────────────────────────────────────

  applyFilters(): void {
    const term = this.searchText.toLowerCase().trim();
    const tx = this.filterTranscript;
    const cr = this.filterCrossed;
    const gen = this.filterGen;
    const or = this.filterOrigin;

    this.dataSource.data = this.allRows.filter((r) => {
      if (tx === 'yes' && !this.hasTranscript(r)) return false;
      if (tx === 'no' && !this.needsLink(r)) return false;
      if (tx === 'superseded' && !this.supersededOnly(r)) return false;
      if (tx === 'nosession' && !this.noSession(r)) return false;

      if (cr === 'yes' && r.crossed !== true) return false;
      if (cr === 'no' && r.crossed !== false) return false;

      if (this.filterRebuildable && !this.isRebuildable(r)) return false;
      if (this.filterConfigData === 'present' && !this.noDocFormPresent(r)) return false;
      if (this.filterConfigData === 'missing' && !this.noDocFormMissing(r)) return false;

      // multi-select: a row matches if it satisfies ANY chosen ATC-doc state.
      // 'none' means genuinely absent — a transferred-out token is not "missing"
      // a doc, its doc simply belongs to the destination queue.
      if (gen.length) {
        const ok = gen.some((g) => g === 'none' ? !r.genDocId
          : (g === 'out' || g === 'elsewhere') ? (r.genIn === 'ancestor' || r.genIn === 'destination')
          : r.genStatus === g);
        if (!ok) return false;
      }

      if (or === 'out' && !r.transferredOut) return false;
      if (or === 'instay' && r.transferredOut) return false;
      if (or === 'here' && r.origin !== 'here') return false;
      if (or === 'transferred' && r.origin !== 'transferred') return false;
      if (or === 'offlineage' && !this.offLineageOnly(r)) return false;

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
    this.filterGen = [];
    this.filterOrigin = '';
    this.filterRebuildable = false;
    this.filterConfigData = '';
    this.applyFilters();
  }

  /** One-click drill-downs from the telemetry tiles. */
  focus(kind: 'crossed' | 'needsLink' | 'superseded' | 'noSession' | 'noGen' | 'dataincomplete'
              | 'rebuildable' | 'here' | 'transferred' | 'offlineage' | 'transferredOut'
              | 'genElsewhere' | 'noDocFormPresent' | 'noDocFormMissing'): void {
    this.clearFilters();
    if (kind === 'crossed') this.filterCrossed = 'yes';
    if (kind === 'needsLink') { this.filterCrossed = 'yes'; this.filterTranscript = 'no'; }
    if (kind === 'superseded') this.filterTranscript = 'superseded';
    if (kind === 'noSession') { this.filterCrossed = 'yes'; this.filterTranscript = 'nosession'; }
    if (kind === 'noGen') { this.filterCrossed = 'yes'; this.filterGen = ['none']; }
    if (kind === 'transferredOut') this.filterOrigin = 'out';
    if (kind === 'genElsewhere') this.filterGen = ['elsewhere'];
    if (kind === 'dataincomplete') this.filterGen = ['dataincomplete'];
    if (kind === 'rebuildable') this.filterRebuildable = true;
    if (kind === 'noDocFormPresent') { this.filterCrossed = 'yes'; this.filterConfigData = 'present'; }
    if (kind === 'noDocFormMissing') { this.filterCrossed = 'yes'; this.filterConfigData = 'missing'; }
    if (kind === 'here') this.filterOrigin = 'here';
    if (kind === 'transferred') this.filterOrigin = 'transferred';
    if (kind === 'offlineage') this.filterOrigin = 'offlineage';
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
  /**
   * Crossed, still in this queue, and genuinely has no ATC doc.
   * Transferred-out tokens are excluded: their doc lives in the destination queue.
   */
  get countNoGen(): number {
    return this.allRows.filter((r) => r.crossed === true && !r.genDocId).length;
  }
  /** Doc exists, but in the queue this token was transferred to. */
  /** Doc found in another queue on the lineage (ancestor or destination). */
  get countGenElsewhere(): number {
    return this.allRows.filter((r) => r.genIn === 'ancestor' || r.genIn === 'destination').length;
  }
  get countGenAncestor(): number { return this.allRows.filter((r) => r.genIn === 'ancestor').length; }
  get countGenDestination(): number { return this.allRows.filter((r) => r.genIn === 'destination').length; }
  get countGenOtherToken(): number {
    return this.allRows.filter((r) => r.genOtherToken).length;
  }
  get countTransferredOut(): number {
    return this.allRows.filter((r) => r.transferredOut).length;
  }
  // origin metadata
  get countHere(): number { return this.allRows.filter((r) => r.origin === 'here').length; }
  get countTransferred(): number { return this.allRows.filter((r) => r.origin === 'transferred').length; }
  get countOffLineage(): number { return this.allRows.filter((r) => this.offLineageOnly(r)).length; }

  get countGen(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.allRows) if (r.genStatus) out[r.genStatus] = (out[r.genStatus] ?? 0) + 1;
    return out;
  }
  /**
   * Ready to rebuild right now: every studio transcript is present, the ATC doc is
   * still dataincomplete, AND it is owned by THIS queue (Rebuild calls
   * regenerateAtcDoc on it; a doc that belongs to an ancestor/destination queue
   * must not be regenerated from here, and its Rebuild button is hidden).
   */
  isRebuildable(r: Row): boolean {
    return r.genIn === 'this'
        && r.genStatus === 'dataincomplete'
        && this.hasTranscript(r);
  }
  get countRebuildable(): number { return this.allRows.filter((r) => this.isRebuildable(r)).length; }

  /** Crossed, no doc anywhere, and the config-stage OWN form IS present here. */
  noDocFormPresent(r: Row): boolean {
    return r.crossed === true && !r.genDocId && r.ownFormPresent === true;
  }
  /** Crossed, no doc anywhere, and the config-stage OWN form is MISSING here. */
  noDocFormMissing(r: Row): boolean {
    return r.crossed === true && !r.genDocId && r.ownFormPresent === false;
  }
  get countNoDocFormPresent(): number { return this.allRows.filter((r) => this.noDocFormPresent(r)).length; }
  get countNoDocFormMissing(): number { return this.allRows.filter((r) => this.noDocFormMissing(r)).length; }
}
