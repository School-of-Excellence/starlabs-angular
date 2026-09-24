import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
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
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';

import {
  ConfirmComponent,
  ConfirmDialogData,
} from '../../DialogBox/confirm/confirm.component';
import { mapAtcError } from '../atc-reason-map';
import {
  AtcGenDoc,
  AtcStatus,
  OpsNote,
  parseAtcOutput,
  ParsedAtcOutput,
  PodWorker,
  StageCategory,
  StageData,
} from '../atc-ops.types';
import { toDate, toMillis } from '../ist-time.util';
import { resolveProcedurePseudonym } from '../procedure-pseudonyms';
import { AtcGenDataService, DocLite, QueueOption } from './atc-gen-data.service';

type ChipKind = 'own' | 'resolved' | 'missing-mandatory' | 'atleastone';
interface StageChip {
  stage: string;
  kind: ChipKind;
}
interface RowBreakdown {
  own: StageChip[];
  mandatory: StageChip[];
  group: StageChip[];
  groupCount: number;
  groupSatisfied: boolean;
  missingSummary: string; // e.g. "2 mandatory, need-1"
}

interface AtcRow extends AtcGenDoc {
  name: string;
  queueId: string; // queue this doc belongs to
  queueName: string; // resolved queue display name
  ageMs: number | null; // time in current status
  stuck: boolean; // processing & started > 30m
  nearMax: boolean; // attempts >= 2
  missingStages: string[]; // stagedata stages with status === 'missing'
  breakdown: RowBreakdown;
}

const STUCK_MIN = 30;

const ALL_STATUSES: AtcStatus[] = [
  'dataincomplete',
  'pending',
  'processing',
  'completed',
  'error',
];

@Component({
  selector: 'app-atc-generation-ops',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatTabsModule,
    RouterModule,
  ],
  templateUrl: './atc-generation-ops.component.html',
  styleUrl: './atc-generation-ops.component.css',
})
export class AtcGenerationOpsComponent implements OnInit, OnDestroy {
  // ---- queue picker ----
  queues: QueueOption[] = [];
  queuesLoading = true;
  queuesError: string | null = null;
  selectedQueueIds: string[] = [];

  // ---- pod status ----
  pod: PodWorker | null = null;
  podLoaded = false;

  // ---- table ----
  readonly displayedColumns = [
    'status',
    'name',
    'queue',
    'stage',
    'type',
    'attempts',
    'age',
    'createdAt',
    'promptAt',
    'outputAt',
    'actions',
  ];
  dataSource = new MatTableDataSource<AtcRow>([]);
  listLoading = false;
  listError: string | null = null;
  totalRows = 0;
  diag: string | null = null; // diagnostic shown when a queue returns 0 docs

  @ViewChild(MatPaginator) set paginatorRef(p: MatPaginator | undefined) {
    if (p) this.dataSource.paginator = p;
  }
  @ViewChild(MatSort) set sortRef(s: MatSort | undefined) {
    if (s) this.dataSource.sort = s;
  }

  // ---- filters ----
  readonly statusOptions = ALL_STATUSES;
  filterStatus: AtcStatus[] = [];
  filterFailure = '';
  filterMissingStages: string[] = []; // dataincomplete: filter by missing stage(s), multi-select
  nameSearch = '';
  availableFailures: string[] = [];
  allStages: string[] = []; // every stage present across the queue's docs (stagedata keys)
  statusCounts: Record<string, number> = {};

  // ---- detail ----
  selectedDocid: string | null = null;
  selectedDoc: AtcGenDoc | null = null;
  detailLoading = false;
  detailNotFound = false;
  detailError: string | null = null;
  detailInFlight = false;
  parsedOutput: ParsedAtcOutput | null = null;
  outputView: 'structured' | 'raw' = 'structured';
  editingPrompt = false;
  promptDraft = '';
  savingPrompt = false;

  // ---- notes (append-only log on the selected doc) ----
  noteDraft = '';
  addingNote = false;

  // ---- resizable detail column ----
  detailWidth = 440; // px; the notes column is fixed, the table absorbs the rest
  readonly DETAIL_MIN = 340;
  readonly DETAIL_MAX = 820;
  resizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  authExpired = false;

  private mapProfileData: Record<string, string> = {};
  private procedureNames: string[] = []; // live `procedures.name` values, for pseudo-code resolution
  private queueUnsubs: Array<() => void> = []; // one live listener per selected queue
  private queueDocs = new Map<string, DocLite[]>(); // latest docs per queue id
  private queuesReported = new Set<string>(); // queues that have delivered a snapshot
  private detailUnsub: (() => void) | null = null;
  private podUnsub: (() => void) | null = null;

  constructor(
    private data: AtcGenDataService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    const savedWidth = this.readStoredWidth();
    if (savedWidth != null) this.detailWidth = savedWidth;
    this.configureDataSource();
    this.data.getProfileMap().then((m) => {
      this.mapProfileData = m;
      this.dataSource.data = this.dataSource.data.map((r) => ({
        ...r,
        name: this.resolveName(r.profileid),
      }));
    });
    this.podUnsub = this.data.subscribePod(
      (p) => {
        this.pod = p;
        this.podLoaded = true;
      },
      () => (this.podLoaded = true),
    );
    this.data.loadProcedureNames().then(
      (names) => (this.procedureNames = names),
      () => {}, // preview still works, just without live-name resolution
    );
    this.loadQueues();
  }

  ngOnDestroy(): void {
    this.queueUnsubs.forEach((u) => u());
    this.detailUnsub?.();
    this.podUnsub?.();
  }

  private configureDataSource(): void {
    this.dataSource.sortingDataAccessor = (row, col) => {
      switch (col) {
        case 'createdAt':
          return toMillis(row.createdAt) ?? 0;
        case 'promptAt':
          return toMillis(row.promptUpdatedAt) ?? 0;
        case 'outputAt':
          return toMillis(this.outputGeneratedAt(row)) ?? 0;
        case 'age':
          return row.ageMs ?? 0;
        case 'attempts':
          return row.attempts ?? 0;
        case 'name':
          return (row.name ?? '').toLowerCase();
        case 'queue':
          return (row.queueName ?? '').toLowerCase();
        default:
          return ((row as any)[col] ?? '').toString().toLowerCase();
      }
    };
    this.dataSource.filterPredicate = (row, filter) => {
      const f = JSON.parse(filter || '{}');
      const statusOk = !f.status?.length || f.status.includes(row.status);
      const failOk = !f.failure || (row.failureCategory ?? '') === f.failure;
      // missing-stage (multi): dataincomplete docs missing at ANY of the picked stages
      const missOk =
        !f.missingStages?.length ||
        (row.status === 'dataincomplete' &&
          row.missingStages.some((s: string) => f.missingStages.includes(s)));
      const nameOk =
        !f.name ||
        (row.name ?? '').toLowerCase().includes(f.name) ||
        (row.profileid ?? '').toLowerCase().includes(f.name);
      return statusOk && failOk && missOk && nameOk;
    };
  }

  // -------------------------------------------------------------------------
  // Queue picker
  // -------------------------------------------------------------------------
  async loadQueues(): Promise<void> {
    this.queuesLoading = true;
    this.queuesError = null;
    try {
      this.queues = await this.data.loadQueues();
    } catch (e: any) {
      this.queuesError =
        e?.code === 'permission-denied'
          ? 'You do not have access to the queue list.'
          : 'Could not load queues. Retry.';
    } finally {
      this.queuesLoading = false;
    }
  }

  onQueueChange(): void {
    this.closeDetail();
    this.queueUnsubs.forEach((u) => u());
    this.queueUnsubs = [];
    this.queueDocs.clear();
    this.queuesReported.clear();
    this.dataSource.data = [];
    this.availableFailures = [];
    this.allStages = [];
    this.statusCounts = {};
    this.totalRows = 0;
    this.listError = null;
    this.diag = null;
    if (!this.selectedQueueIds.length) return;

    // One live listener per selected queue; snapshots are merged in rebuildRows.
    this.listLoading = true;
    for (const qid of this.selectedQueueIds) {
      this.queueUnsubs.push(
        this.data.listenQueueDocs(
          qid,
          (docs) => {
            this.queueDocs.set(qid, docs);
            this.queuesReported.add(qid);
            // hide the spinner once every selected queue has reported once
            if (this.queuesReported.size >= this.selectedQueueIds.length)
              this.listLoading = false;
            this.rebuildRows();
          },
          (err) => {
            this.listLoading = false;
            this.listError =
              err?.code === 'permission-denied'
                ? 'Access denied reading the "firestore-atc" database. Its security rules are likely not deployed for client reads — deploy Firestore rules for the firestore-atc database (see firebase.json).'
                : 'Could not load ATC docs for these queues. Retry.';
          },
        ),
      );
    }
  }

  /** Merge every selected queue's latest snapshot into one sorted row set. */
  private rebuildRows(): void {
    const now = Date.now();
    const nameById = new Map(this.queues.map((q) => [q.id, q.name]));
    const rows: AtcRow[] = [];
    for (const [qid, docs] of this.queueDocs) {
      const qname = nameById.get(qid) ?? qid;
      for (const { id, data } of docs) rows.push(this.toRow(id, data, now, qid, qname));
    }
    rows.sort((a, b) => (toMillis(b.createdAt) ?? 0) - (toMillis(a.createdAt) ?? 0));
    this.dataSource.data = rows;
    this.totalRows = rows.length;
    this.availableFailures = this.distinct(
      rows.map((r) => r.failureCategory ?? undefined),
    );
    // all stages present across the selected queues' docs (every stagedata key)
    this.allStages = this.distinct(
      rows.flatMap((r) => (r.stagedata ? Object.keys(r.stagedata) : [])),
    );
    this.statusCounts = this.countBy(rows);
    this.applyFilters();
    // the 0-doc probe only makes sense for a single queue
    if (rows.length === 0 && this.selectedQueueIds.length === 1) this.runProbe();
    else this.diag = null;
  }

  retryQueueLoad(): void {
    this.onQueueChange();
  }

  /** When a queue returns 0 docs, probe the collection to explain why. */
  private async runProbe(): Promise<void> {
    const qid = this.selectedQueueIds[0];
    if (!qid) return;
    const p = await this.data.probeCollection(qid);
    console.warn('[ATC-ops] queue returned 0 docs — probe:', p);
    if (!p.readable) {
      this.diag = `Can't read the ATC collection in the "firestore-atc" database (${p.errorCode || 'permission/rules'}). Check Firestore rules for firestore-atc.`;
    } else if (p.total === 0) {
      this.diag = 'The queue_atc_generation collection in "firestore-atc" is empty — no generation docs have been written yet.';
    } else {
      this.diag =
        `The collection has docs, but none match this queue. ` +
        `Querying queueref == "${p.builtRefPath}"; a sample doc's queueref is "${p.sampleQueuerefPath}". ` +
        (p.sampleQueuerefPath && p.sampleQueuerefPath !== p.builtRefPath
          ? 'Those paths differ — this queue simply has no docs, or the id/path differs.'
          : 'Paths look aligned — this specific queue has no docs yet.');
    }
  }

  private toRow(
    id: string,
    data: AtcGenDoc,
    now: number,
    queueId: string,
    queueName: string,
  ): AtcRow {
    const started = toMillis(data.startedAt);
    const created = toMillis(data.createdAt);
    const finalized = toMillis(data.finalizedAt);
    let ageMs: number | null = null;
    if (data.status === 'processing') ageMs = started != null ? now - started : null;
    else if (data.status === 'completed' || data.status === 'error')
      ageMs = started != null && finalized != null ? finalized - started : null;
    else ageMs = created != null ? now - created : null;
    const stuck =
      data.status === 'processing' &&
      started != null &&
      now - started > STUCK_MIN * 60_000;
    const missingStages = data.stagedata
      ? Object.entries(data.stagedata)
          .filter(([, e]) => e && e.status === 'missing')
          .map(([stage]) => stage)
      : [];
    // Drop the heavy text fields from the row — the table never shows them and
    // the detail panel re-fetches the full doc on demand. Keeps rows light for
    // change detection / memory.
    const { prompt, systemprompt, output, raw_output, ...lean } = data as any;
    return {
      ...(lean as AtcGenDoc),
      docid: id,
      name: this.resolveName(data.profileid),
      queueId,
      queueName,
      ageMs,
      stuck,
      nearMax: (data.attempts ?? 0) >= 2,
      missingStages,
      breakdown: this.buildBreakdown(data.stagedata),
    };
  }

  private resolveName(profileid?: string): string {
    if (!profileid) return '—';
    return this.mapProfileData[profileid] || profileid;
  }
  private distinct(vals: (string | undefined)[]): string[] {
    return Array.from(
      new Set(vals.map((v) => (v ?? '').toString().trim()).filter(Boolean)),
    ).sort();
  }
  private countBy(rows: AtcRow[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------
  applyFilters(): void {
    this.dataSource.filter = JSON.stringify({
      status: this.filterStatus,
      failure: this.filterFailure,
      missingStages: this.filterMissingStages,
      name: this.nameSearch.trim().toLowerCase(),
    });
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  clearFilters(): void {
    this.filterStatus = [];
    this.filterFailure = '';
    this.filterMissingStages = [];
    this.nameSearch = '';
    this.applyFilters();
  }

  /** "All" status chip — show every status. */
  selectAllStatuses(): void {
    this.filterStatus = [];
    this.applyFilters();
  }

  toggleStatusChip(s: AtcStatus): void {
    const i = this.filterStatus.indexOf(s);
    if (i === -1) this.filterStatus = [...this.filterStatus, s];
    else this.filterStatus = this.filterStatus.filter((x) => x !== s);
    // the missing-stage filter only applies to dataincomplete — drop it if that's filtered out
    if (this.filterStatus.length && !this.filterStatus.includes('dataincomplete'))
      this.filterMissingStages = [];
    this.applyFilters();
  }

  get filteredCount(): number {
    return this.dataSource.filteredData.length;
  }
  get errorInView(): boolean {
    return !this.filterStatus.length || this.filterStatus.includes('error');
  }
  get dataincompleteInView(): boolean {
    return !this.filterStatus.length || this.filterStatus.includes('dataincomplete');
  }

  // -------------------------------------------------------------------------
  // stagedata breakdown
  // -------------------------------------------------------------------------
  private buildBreakdown(sd?: StageData): RowBreakdown {
    const out: RowBreakdown = {
      own: [],
      mandatory: [],
      group: [],
      groupCount: 0,
      groupSatisfied: false,
      missingSummary: '',
    };
    if (!sd) return out;
    for (const [stage, entry] of Object.entries(sd)) {
      if (!entry) continue;
      if (entry.category === 'own') {
        out.own.push({ stage, kind: 'own' });
      } else if (entry.category === 'mandatory') {
        out.mandatory.push({
          stage,
          kind: entry.status === 'resolved' ? 'resolved' : 'missing-mandatory',
        });
      } else if (entry.category === 'atleastonerequired') {
        out.group.push({
          stage,
          kind: entry.status === 'resolved' ? 'resolved' : 'atleastone',
        });
        out.groupCount++;
        if (entry.status === 'resolved') out.groupSatisfied = true;
      }
    }
    const missMand = out.mandatory.filter((c) => c.kind === 'missing-mandatory').length;
    const parts: string[] = [];
    if (missMand) parts.push(`${missMand} mandatory`);
    if (out.groupCount && !out.groupSatisfied) parts.push('need 1');
    out.missingSummary = parts.join(' · ');
    return out;
  }

  selectedBreakdown(): RowBreakdown {
    return this.buildBreakdown(this.selectedDoc?.stagedata);
  }

  // -------------------------------------------------------------------------
  // Detail
  // -------------------------------------------------------------------------
  openDetail(row: AtcRow): void {
    this.selectDoc(row.docid);
  }

  selectDoc(docid: string): void {
    if (!docid) return;
    this.selectedDocid = docid;
    this.selectedDoc = null;
    this.parsedOutput = null;
    this.detailError = null;
    this.detailNotFound = false;
    this.detailLoading = true;
    this.editingPrompt = false;
    this.noteDraft = '';
    this.detailUnsub?.();
    this.detailUnsub = this.data.listenDoc(
      docid,
      (exists, id, d) => {
        this.detailLoading = false;
        if (!exists || !d) {
          this.detailNotFound = true;
          this.selectedDoc = null;
          return;
        }
        this.detailNotFound = false;
        this.selectedDoc = { ...d, docid: id };
        this.parsedOutput =
          this.selectedDoc.status === 'completed'
            ? parseAtcOutput(this.selectedDoc.output)
            : null;
        if (this.parsedOutput && !this.parsedOutput.json) this.outputView = 'raw';
      },
      (err) => {
        this.detailLoading = false;
        this.detailError =
          err?.code === 'permission-denied'
            ? 'No access to this document.'
            : 'Could not load this document. Retry.';
      },
    );
  }

  closeDetail(): void {
    this.detailUnsub?.();
    this.detailUnsub = null;
    this.selectedDocid = null;
    this.selectedDoc = null;
    this.parsedOutput = null;
    this.editingPrompt = false;
  }

  copy(text?: string | null, label = 'Copied'): void {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => this.toast(`${label} to clipboard`, 'success'),
      () => this.toast('Copy failed', 'error'),
    );
  }

  // trajectory-shift tag check (quality signal)
  isTrajectory(tags?: string[]): boolean {
    return !!tags?.some((t) => /trajectory_shift/i.test(t));
  }

  /**
   * Resolve an adjustment's procedure pseudo-code ("A&H Procedure24",
   * "procedure24", "A&H_procedure24" — spacing/casing varies, the digits are
   * the stable key) to its real `procedures.name`. Same static-glossary →
   * live-collection strategy as prescribe-atc.component.ts's
   * patchAIAdjustments. Returns null when the code has no resolvable number.
   */
  resolveProcedureName(code: string): string | null {
    const realName = resolveProcedurePseudonym(code);
    if (!realName) return null;
    if (!this.procedureNames.length) return realName;
    const target = realName.toLowerCase().trim();
    return (
      this.procedureNames.find((n) => n.toLowerCase().trim() === target) ??
      this.procedureNames.find((n) => n.toLowerCase().includes(target)) ??
      realName
    );
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  async onGenerate(): Promise<void> {
    const docid = this.selectedDoc?.docid;
    if (!docid || this.detailInFlight) return;
    this.detailInFlight = true;
    try {
      const res = await this.data.regenerate(docid);
      if (res.data.status === 'pending')
        this.toast('Sources complete — queued for generation', 'success');
      else {
        const missing = res.data.missing.map((m) => `${m.stage} (${m.category})`).join(', ');
        this.toast(`Still missing: ${missing}`, 'warning');
      }
    } catch (err: any) {
      this.handleCallableError(err, 'regenerate');
    } finally {
      this.detailInFlight = false;
    }
  }

  startEditPrompt(): void {
    this.promptDraft = this.selectedDoc?.prompt ?? '';
    this.editingPrompt = true;
  }
  cancelEditPrompt(): void {
    this.editingPrompt = false;
    this.promptDraft = '';
  }
  async savePrompt(): Promise<void> {
    const docid = this.selectedDoc?.docid;
    if (!docid || this.savingPrompt) return;
    if (this.selectedDoc?.status !== 'pending') {
      this.toast('Prompt is only editable while the job is pending.', 'warning');
      return;
    }
    if (this.promptDraft === (this.selectedDoc?.prompt ?? '')) {
      this.editingPrompt = false;
      return;
    }
    this.savingPrompt = true;
    try {
      await this.data.savePrompt(docid, this.promptDraft);
      this.editingPrompt = false;
      this.toast('Prompt updated', 'success');
    } catch (e: any) {
      this.toast(
        e?.code === 'permission-denied'
          ? 'No permission to edit this prompt.'
          : 'Could not save the prompt. Try again.',
        'error',
      );
    } finally {
      this.savingPrompt = false;
    }
  }

  // -------------------------------------------------------------------------
  // Notes (append-only log on the selected doc)
  // -------------------------------------------------------------------------
  /** Notes on the selected doc, newest first. */
  get notes(): OpsNote[] {
    const list = this.selectedDoc?.opsNotes ?? [];
    return [...list].sort((a, b) => (toMillis(b.at) ?? 0) - (toMillis(a.at) ?? 0));
  }

  async addNote(): Promise<void> {
    const docid = this.selectedDoc?.docid;
    const text = this.noteDraft.trim();
    if (!docid || !text || this.addingNote) return;
    this.addingNote = true;
    try {
      await this.data.addNote(docid, text);
      this.noteDraft = '';
      this.toast('Note added', 'success');
    } catch (e: any) {
      this.toast(
        e?.code === 'permission-denied'
          ? 'No permission to add notes.'
          : 'Could not add note. Try again.',
        'error',
      );
    } finally {
      this.addingNote = false;
    }
  }

  // -------------------------------------------------------------------------
  // Resizable detail column (drag handle on its left edge)
  // -------------------------------------------------------------------------
  startResize(ev: PointerEvent): void {
    ev.preventDefault();
    this.resizing = true;
    this.resizeStartX = ev.clientX;
    this.resizeStartWidth = this.detailWidth;
    (ev.target as Element)?.setPointerCapture?.(ev.pointerId);
  }

  @HostListener('document:pointermove', ['$event'])
  onResizeMove(ev: PointerEvent): void {
    if (!this.resizing) return;
    // handle sits on the detail column's LEFT edge → dragging left widens it
    const dx = this.resizeStartX - ev.clientX;
    this.detailWidth = this.clampWidth(this.resizeStartWidth + dx);
  }

  @HostListener('document:pointerup')
  onResizeEnd(): void {
    if (!this.resizing) return;
    this.resizing = false;
    this.storeWidth(this.detailWidth);
  }

  /** Double-click the handle to snap between min and max width. */
  toggleDetailWidth(): void {
    const mid = (this.DETAIL_MIN + this.DETAIL_MAX) / 2;
    this.detailWidth = this.detailWidth > mid ? this.DETAIL_MIN : this.DETAIL_MAX;
    this.storeWidth(this.detailWidth);
  }

  private clampWidth(w: number): number {
    return Math.max(this.DETAIL_MIN, Math.min(this.DETAIL_MAX, Math.round(w)));
  }
  private readStoredWidth(): number | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const v = parseInt(localStorage.getItem('atcOps.detailWidth') || '', 10);
      return isNaN(v) ? null : this.clampWidth(v);
    } catch {
      return null;
    }
  }
  private storeWidth(w: number): void {
    try {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem('atcOps.detailWidth', String(w));
    } catch {
      /* ignore storage failures */
    }
  }

  async onRebuildPrompt(): Promise<void> {
    const docid = this.selectedDoc?.docid;
    if (!docid || this.detailInFlight) return;
    this.detailInFlight = true;
    try {
      const res = await this.data.rebuild(docid);
      this.toast(`Prompt rebuilt (${res.data.promptChars} chars)`, 'success');
    } catch (err: any) {
      this.handleCallableError(err, 'rebuild');
    } finally {
      this.detailInFlight = false;
    }
  }

  onRebuildRequeue(): void {
    const docid = this.selectedDoc?.docid;
    if (!docid || this.detailInFlight) return;
    const podWarn =
      this.pod && (this.pod.halted || this.pod.enabled === false)
        ? ' ⚠ The pod worker is currently ' +
          (this.pod.halted ? 'HALTED' : 'disarmed') +
          ' — requeued jobs will NOT drain until it is reset.'
        : '';
    const data: ConfirmDialogData = {
      title: 'Rebuild & requeue',
      message:
        'This rebuilds the prompt AND flips the doc back to "pending", clearing ' +
        'claim/terminal markers so a GPU pod re-claims it and re-runs inference ' +
        'from scratch. This consumes compute.' +
        podWarn +
        ' Continue?',
      confirmText: 'Rebuild & requeue',
      cancelText: 'Cancel',
    };
    const ref = this.dialog.open(ConfirmComponent, { data, disableClose: true });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      this.detailInFlight = true;
      try {
        await this.data.rebuild(docid, true);
        this.toast('Rebuilt & requeued', 'success');
      } catch (err: any) {
        this.handleCallableError(err, 'rebuild');
      } finally {
        this.detailInFlight = false;
      }
    });
  }

  private handleCallableError(err: any, source: 'regenerate' | 'rebuild'): void {
    const mapped = mapAtcError(err?.code, err?.message, source);
    if (mapped.action === 'signin') this.authExpired = true;
    if (mapped.action === 'requeue') {
      this.onRebuildRequeue();
      return;
    }
    const msg = mapped.detail ? `${mapped.message} — ${mapped.detail}` : mapped.message;
    this.toast(msg, mapped.severity === 'transient' ? 'warning' : 'error');
  }

  // -------------------------------------------------------------------------
  // pod-status helpers
  // -------------------------------------------------------------------------
  get podArmed(): boolean {
    return !!this.pod && this.pod.enabled !== false && !this.pod.halted;
  }
  get podBad(): boolean {
    return !!this.pod && (this.pod.halted === true || this.pod.enabled === false);
  }
  podLabel(): string {
    if (!this.pod) return 'pod: unknown';
    if (this.pod.halted) return `HALTED — ${this.pod.haltedReason || 'needs manual reset'}`;
    if (this.pod.enabled === false) return 'disarmed';
    return `armed · ${this.pod.state || '—'}`;
  }

  // -------------------------------------------------------------------------
  // template helpers
  // -------------------------------------------------------------------------
  resolveTitle(): string {
    return this.resolveName(this.selectedDoc?.profileid);
  }
  asDate(ts: any): Date | null {
    return toDate(ts);
  }
  /** When ATC output was generated — only meaningful for completed docs. */
  outputGeneratedAt(r: AtcGenDoc): any {
    return r.status === 'completed' ? (r.completedAt ?? r.finalizedAt) : null;
  }
  relativeTime(ts: any): string {
    return this.humanDur(this.msSince(ts));
  }
  private msSince(ts: any): number | null {
    const ms = toMillis(ts);
    return ms == null ? null : Date.now() - ms;
  }
  humanDur(ms: number | null): string {
    if (ms == null) return '—';
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
    return `${Math.round(h / 24)}d`;
  }
  statusClass(s?: string): string {
    return `st-${s ?? 'unknown'}`;
  }
  confidencePill(c?: string): string {
    switch ((c ?? '').toLowerCase()) {
      case 'high':
        return 'pill-green';
      case 'medium':
        return 'pill-amber';
      case 'low':
        return 'pill-red';
      default:
        return 'pill-gray';
    }
  }
  sourceLayerPill(l?: string): string {
    switch ((l ?? '').toLowerCase()) {
      case 'experiential':
        return 'pill-green';
      case 'both':
        return 'pill-teal';
      case 'aspirational':
        return 'pill-amber';
      default:
        return 'pill-gray';
    }
  }
  humanize(v?: string): string {
    return (v ?? '').replace(/_/g, ' ');
  }
  trackByDocid(_: number, r: AtcRow): string {
    return r.docid;
  }
  private toast(msg: string, kind: 'success' | 'error' | 'warning'): void {
    this.snackBar.open(msg, 'Close', { duration: 3000, panelClass: [`${kind}-snackbar`] });
  }
}
