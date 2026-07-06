import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  Firestore, collection, collectionData, query, where, getDocs, getDoc, orderBy,
  doc, setDoc, updateDoc, deleteDoc, DocumentReference
} from '@angular/fire/firestore';
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { PlanningDataService } from './planning-data.service';
import { AuthguardService } from '../../../authguard.service';

interface PhaseStageRow { queueid: string; stagename: string; }
type Col = 'c_a' | 'c_na' | 'c_d' | 'n_a' | 'n_na' | 'n_d';
interface Cells { c_a: number; c_na: number; c_d: number; n_a: number; n_na: number; n_d: number; total: number; }
interface MatrixLine { key: string; label: string; kind: 'stage' | 'slot' | 'rate'; cells: Cells; stages: PhaseStageRow[]; }
interface MatrixRow { phase: any; pct: number; target: number | null; status: 'ontrack' | 'risk' | 'behind' | 'none'; pop: number; lines: MatrixLine[]; }
interface CardDef { key: string; label: string; value: number; desc?: string; }
interface DrillRow { name: string; phone: string; status: string; confirmed: boolean; inQueue: boolean; }
interface CellDrillRow { name: string; phone: string; queueName: string; stage: string; status: string; confirmed: boolean; slot: string; }
interface CellRef { phaseDocid: string; lineKey: string; col: Col | 'total'; label: string; }
/** A phase as stored inside a saved filter (self-contained snapshot). */
interface FilterPhase { phasename: string; targetPct: number | null; rows: { [key: string]: PhaseStageRow[] }; }
/** A saved filter = a named bundle of {queue selection, event selection, phases}. */
interface PlanningFilter { docid: string; title: string; queueIds: string[]; eventIds: string[]; phases: FilterPhase[]; created?: any; updated?: any; }

@Component({
  selector: 'app-planning-tab',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, DragDropModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule, MatButtonModule, MatTooltipModule, MatSnackBarModule
  ],
  templateUrl: './planning-tab.component.html',
  styleUrl: './planning-tab.component.css'
})
export class PlanningTabComponent implements OnInit, OnChanges, OnDestroy {

  @Input() selectedQueueList: string[] = [];
  @Input() mapQueue: any = {};
  @Input() mapData: any = {};
  @Input() queueTokens: any[] = [];
  @Input() allCompletedStageCount: any = {};
  @Input() mapProfile: any = {};
  @Input() mapNumber: any = {};
  @Input() refreshKey = 0;
  /** True only while the Planning tab is the visible tab. Gates the expensive recompute. */
  @Input() active = false;
  /** Events ('event collection' docs: {id, ref, name}). */
  @Input() eventList: any[] = [];
  /** Active queues ('queue generation' docs). */
  @Input() queueList: any[] = [];
  /** Current logged-in user's profileid — stamped onto saved filters as lasteditedby. */
  @Input() currentProfileId: string = '';
  /** Selected events (multi) — APPLIED (data loaded for these). */
  selectedEventIds: string[] = [];
  /** Dropdown selections pending a "Get" — nothing loads until the button is clicked. */
  pendingEvents: string[] = [];
  pendingQueues: string[] = [];

  /** "Get": apply the pending event + queue picks and load their data (the only fetch trigger). */
  loadPlanningData(): void {
    this.selectedEventIds = [...this.pendingEvents];
    this.selectedCardKey = null; this.drillList = [];
    this.selectedCell = null; this.cellDrillRows = [];
    this.drillPage = 0;
    this.dataLoading = true;
    // Apply the queue selection UP to the dashboard (loads its tokens; queueChanged → eligibility + recompute).
    this.queueSelectionChange.emit([...this.pendingQueues]);
    // Load the event sets for the chosen events, then recompute. (loader cleared in recompute's finally)
    if (this.selectedEventRefs.length) {
      this.loadEventSets().then(() => this.recompute());
    } else {
      this.approvedSet = new Set(); this.requestedSet = new Set(); this.ownerSet = new Set(); this.potentialTotal = 0;
      this.recompute();
    }
  }

  // ---------- Journey filter + DFU-ongoing omit ----------
  /** journeyid → journey name (from the 'journey' collection). */
  journeyMap: { [id: string]: string } = {};
  journeyList: { id: string; name: string }[] = [];
  /** Selected journey ids (a filter criterion). */
  selectedJourneys: string[] = [];
  /** Whether "DFU ongoing" is part of the filter. */
  dfuOn = false;
  /** ONE overall mode: 'only' = show only participants matching the active filters; 'remove' = exclude them. */
  filterMode: 'only' | 'remove' = 'only';

  // ---------- Cohort filter (current marathon's big cohorts) ----------
  /** Current marathon title (for the cohort filter label). */
  currentMarathonTitle = '';
  /** Cohorts of the current marathon: id + name + member profileids. */
  cohortList: { id: string; name: string; members: Set<string> }[] = [];
  /** Selected cohort ids (a filter criterion). */
  selectedCohorts: string[] = [];
  /** Union of the selected cohorts' member profileids (rebuilt on change). */
  private selectedCohortMembers = new Set<string>();

  onCohortsChange(ids: string[]): void {
    this.selectedCohorts = ids || [];
    this.selectedCohortMembers = new Set<string>();
    for (const c of this.cohortList) {
      if (this.selectedCohorts.includes(c.id)) c.members.forEach(m => this.selectedCohortMembers.add(m));
    }
    this.selectedCardKey = null; this.drillList = [];
    this.recomputeView();
  }
  /** profileid → participant-metadata doc (activeproduct, currentjourney, lastcompletedjourney, lastsubscribedjourney). */
  private participantMeta: { [id: string]: any } = {};
  /** ids whose metadata we've already fetched this session (so we never re-query them). */
  private metaFetched = new Set<string>();
  /** product ids with mode == 'Priority Mode' — holding one of these = DFU ongoing. */
  private priorityProductIds = new Set<string>();

  onJourneysChange(names: string[]): void {
    this.selectedJourneys = names || [];
    this.selectedCardKey = null; this.drillList = [];
    this.recomputeView();
  }
  /** Set the overall filter mode (show only / remove) — applies to every active filter. */
  setFilterMode(m: 'only' | 'remove'): void {
    this.filterMode = m;
    if (this.selectedJourneys.length || this.dfuOn) { this.selectedCardKey = null; this.drillList = []; this.recomputeView(); }
  }
  /** Toggle whether DFU-ongoing is part of the filter. */
  toggleDfu(): void {
    this.dfuOn = !this.dfuOn;
    this.selectedCardKey = null; this.drillList = [];
    this.recomputeView();
  }

  /** DFU ongoing = holds a Priority-Mode product (mirrors dynamic-queue-manager-clone). */
  private isDfuOngoing(id: string): boolean {
    const active = this.participantMeta?.[id]?.['activeproduct'] || [];
    return Array.isArray(active) && active.some((pid: string) => this.priorityProductIds.has(pid));
  }
  /**
   * The participant's journey id(s), chosen by customer status — mirrors journeycoach-dashboard's
   * mapCustomerStatusVariable: active→activejourney, non active→lastcompletedjourney,
   * discontinued→lastsubscribedjourney. Fields hold journey IDs (scalar or array).
   */
  private journeyIdsFor(id: string): string[] {
    const meta = this.participantMeta?.[id];
    if (!meta) return [];
    const status = (this.statusMap.get(id) || '').toLowerCase();
    const field = status === 'active' ? 'activejourney'
      : status === 'discontinued' ? 'lastsubscribedjourney'
      : 'lastcompletedjourney';
    const v = meta[field];
    if (v == null) return [];
    return Array.isArray(v) ? v.flat().filter(Boolean).map(String) : [String(v)];
  }
  private passesParticipantFilters(id: string): boolean {
    const journeyActive = this.selectedJourneys.length > 0;
    const cohortActive = this.selectedCohorts.length > 0;
    if (!journeyActive && !this.dfuOn && !cohortActive) return true;
    const journeyMatch = journeyActive && this.journeyIdsFor(id).some(j => this.selectedJourneys.includes(j));
    const dfuMatch = this.dfuOn && this.isDfuOngoing(id);
    const cohortMatch = cohortActive && this.selectedCohortMembers.has(id);
    if (this.filterMode === 'only') {
      // keep only participants who match EVERY active filter
      if (journeyActive && !journeyMatch) return false;
      if (this.dfuOn && !dfuMatch) return false;
      if (cohortActive && !cohortMatch) return false;
      return true;
    }
    // 'remove': drop participants who match ANY active filter
    if (journeyMatch || dfuMatch || cohortMatch) return false;
    return true;
  }

  /**
   * The Planning tab now has its OWN, independent queue selection — owned by the parent
   * as `planningQueues` and fed back through the `selectedQueueList` input. `scope` is
   * simply that selection (separate from the Board's own queue selection).
   */
  get scope(): string[] { return [...(this.selectedQueueList || [])]; }

  /** Emits the Planning tab's own queue selection up to the dashboard (loads its data). */
  @Output() queueSelectionChange = new EventEmitter<string[]>();

  /** Restore a saved filter's queue selection UP to the dashboard so its data loads. Apply-only. */
  @Output() patchQueues = new EventEmitter<string[]>();

  /** Planning's own queue picker changed → tell the parent to load these queues. */
  onPlanningQueuesChange(ids: string[]): void {
    this.selectedCardKey = null; this.drillList = [];
    this.selectedCell = null; this.cellDrillRows = [];
    this.queueSelectionChange.emit([...(ids || [])]);
  }

  /** trackBy for the all-queues option list ('queue generation' docs). */
  trackByQueueDoc(_i: number, q: any): string { return q?.['docid']; }

  /** trackBy for the matrix — keeps DOM (incl. open stage dropdowns) alive across recomputes. */
  trackByPhaseRow(_i: number, row: MatrixRow): string { return row?.phase?.['docid']; }
  trackByLineKey(_i: number, ln: MatrixLine): string { return ln?.key; }

  // ---------- Saved filters ----------
  savedFilters: PlanningFilter[] = [];
  activeFilterId: string | null = null;
  private filtersSub?: Subscription;

  // Save widget (floating)
  showSaveWidget = false;
  saveTitle = '';
  saveMode: 'new' | 'update' = 'new';
  pendingChanges: string[] = [];

  private get activeFilter(): PlanningFilter | null {
    return this.savedFilters.find(f => f.docid === this.activeFilterId) || null;
  }

  /** True when the current phases/selection differ from the applied filter (or there's unsaved new work). */
  get isDirty(): boolean {
    const active = this.activeFilter;
    if (!active) return this.planningPhases.length > 0;
    return this.filterSignature(active) !== this.currentSignature();
  }

  /** Stable string signature of the current working state (queues + events + phases). */
  private currentSignature(): string {
    return this.signature([...this.selectedQueueList], [...this.selectedEventIds],
      this.planningPhases.map(p => ({ phasename: p['phasename'], targetPct: p['targetPct'] ?? null, rows: p['rows'] || {} })));
  }
  private filterSignature(f: PlanningFilter): string {
    return this.signature(f.queueIds || [], f.eventIds || [], f.phases || []);
  }
  private signature(queueIds: string[], eventIds: string[], phases: FilterPhase[]): string {
    const stageRowKeys = this.rowDefs.filter(rd => rd.kind !== 'rate').map(rd => rd.key);
    return JSON.stringify({
      q: [...queueIds].sort(),
      e: [...eventIds].sort(),
      p: phases.map(p => ({
        n: p.phasename, t: p.targetPct ?? null,
        r: stageRowKeys.map(k => (p.rows?.[k] || []).map(s => `${s.queueid}|${s.stagename}`).sort())
      }))
    });
  }

  /** Phase roll-up: 'all' = clear every member stage. */
  phaseRollupRule: 'all' | 'any' = 'all';

  // Column groups (Confirmed / Not confirmed × Active / Non-Active / Discontinued)
  readonly confirmedCols: { k: Col; label: string }[] = [
    { k: 'c_a', label: 'Active' }, { k: 'c_na', label: 'Non Active' }, { k: 'c_d', label: 'Discontinued' }
  ];
  readonly notConfirmedCols: { k: Col; label: string }[] = [
    { k: 'n_a', label: 'Active' }, { k: 'n_na', label: 'Non Active' }, { k: 'n_d', label: 'Discontinued' }
  ];
  get allCols(): { k: Col; label: string }[] { return [...this.confirmedCols, ...this.notConfirmedCols]; }

  /**
   * Readiness rows (Categories), in the order the Planning table renders them.
   * 'rate' rows are derived percentages (not stage-configurable, not drillable).
   */
  readonly rowDefs: { key: string; label: string; kind: 'stage' | 'slot' | 'rate' }[] = [
    { key: 'notComplete', label: 'Not Completed', kind: 'stage' },
    { key: 'slotConfirmed', label: 'Slot Confirmed', kind: 'slot' },
    { key: 'confRate', label: 'Confir. rate', kind: 'rate' },
    { key: 'slotNotConfirmed', label: 'Not Confirmed', kind: 'slot' },
    { key: 'complete', label: 'Completed', kind: 'stage' }
  ];

  getRowStages(phase: any, key: string): PhaseStageRow[] {
    return (phase?.['rows']?.[key] || []) as PhaseStageRow[];
  }

  setRowStages(phase: any, key: string, stages: PhaseStageRow[]): void {
    // In-memory only — persisted when the working draft is saved as a filter.
    phase['rows'] = { ...(phase['rows'] || {}), [key]: stages || [] };
    this.rebuildMatrix();
  }

  // Event-derived sets
  private approvedSet = new Set<string>();
  private requestedSet = new Set<string>();
  private ownerSet = new Set<string>();
  private statusMap = new Map<string, string>();
  potentialTotal = 0;
  dataLoading = false;

  cards: CardDef[] = [];
  matrixRows: MatrixRow[] = [];

  // Phase config
  planningPhases: any[] = [];
  stageOptions: PhaseStageRow[] = [];
  phaseForm: FormGroup;
  showPhaseForm = false;
  isEditMode = false;
  editingPhase: any = null;

  // Card drill-down
  selectedCardKey: string | null = null;
  drillList: DrillRow[] = [];
  readonly drillCap = 300;

  // Matrix cell drill-down
  selectedCell: CellRef | null = null;
  cellDrillRows: CellDrillRow[] = [];

  // Client-side pagination for both drill tables
  readonly pageSize = 15;
  drillPage = 0;
  cellPage = 0;

  // Search + filter state for both drill tables
  drillSearch = '';
  cellSearch = '';
  drillFilters = new Set<string>();
  cellFilters = new Set<string>();

  private statusKey(status: string): 'a' | 'na' | 'd' {
    const s = (status || '').toLowerCase();
    return s === 'active' ? 'a' : s === 'discontinued' ? 'd' : 'na';
  }
  /** active tokens are "dim:value"; within a dimension OR, across dimensions AND; empty = pass all. */
  private passesFilters(active: Set<string>, dims: Record<string, string>): boolean {
    if (!active.size) return true;
    const byDim: Record<string, string[]> = {};
    active.forEach(t => { const d = t.split(':')[0]; (byDim[d] = byDim[d] || []).push(t); });
    return Object.keys(byDim).every(d => byDim[d].includes(d + ':' + dims[d]));
  }
  get filteredDrill(): DrillRow[] {
    const q = this.drillSearch.trim().toLowerCase();
    return this.drillList.filter(r =>
      (!q || String(r.name ?? '').toLowerCase().includes(q) || String(r.phone ?? '').toLowerCase().includes(q)) &&
      this.passesFilters(this.drillFilters, { conf: r.confirmed ? 'yes' : 'no', st: this.statusKey(r.status), inq: r.inQueue ? 'in' : 'out' }));
  }
  get filteredCellDrill(): CellDrillRow[] {
    const q = this.cellSearch.trim().toLowerCase();
    return this.cellDrillRows.filter(r =>
      (!q || String(r.name ?? '').toLowerCase().includes(q) || String(r.phone ?? '').toLowerCase().includes(q)) &&
      this.passesFilters(this.cellFilters, { conf: r.confirmed ? 'yes' : 'no', st: this.statusKey(r.status), slot: (r.slot && r.slot !== '—') ? 'has' : 'none' }));
  }
  toggleDrillFilter(t: string): void { this.drillFilters.has(t) ? this.drillFilters.delete(t) : this.drillFilters.add(t); this.drillPage = 0; }
  toggleCellFilter(t: string): void { this.cellFilters.has(t) ? this.cellFilters.delete(t) : this.cellFilters.add(t); this.cellPage = 0; }
  isDrillFilter(t: string): boolean { return this.drillFilters.has(t); }
  isCellFilter(t: string): boolean { return this.cellFilters.has(t); }
  onDrillSearch(): void { this.drillPage = 0; }
  onCellSearch(): void { this.cellPage = 0; }

  get drillPageCount(): number { return Math.max(1, Math.ceil(this.filteredDrill.length / this.pageSize)); }
  get cellPageCount(): number { return Math.max(1, Math.ceil(this.filteredCellDrill.length / this.pageSize)); }
  get pagedDrill(): DrillRow[] { const s = this.drillPage * this.pageSize; return this.filteredDrill.slice(s, s + this.pageSize); }
  get pagedCellDrill(): CellDrillRow[] { const s = this.cellPage * this.pageSize; return this.filteredCellDrill.slice(s, s + this.pageSize); }
  get drillRangeStart(): number { return this.filteredDrill.length ? this.drillPage * this.pageSize + 1 : 0; }
  get drillRangeEnd(): number { return Math.min(this.filteredDrill.length, (this.drillPage + 1) * this.pageSize); }
  get cellRangeStart(): number { return this.filteredCellDrill.length ? this.cellPage * this.pageSize + 1 : 0; }
  get cellRangeEnd(): number { return Math.min(this.filteredCellDrill.length, (this.cellPage + 1) * this.pageSize); }
  prevDrillPage(): void { this.drillPage = Math.max(0, this.drillPage - 1); }
  nextDrillPage(): void { this.drillPage = Math.min(this.drillPageCount - 1, this.drillPage + 1); }
  prevCellPage(): void { this.cellPage = Math.max(0, this.cellPage - 1); }
  nextCellPage(): void { this.cellPage = Math.min(this.cellPageCount - 1, this.cellPage + 1); }
  private clampDrillPage(): void { this.drillPage = Math.min(this.drillPage, this.drillPageCount - 1); }
  private clampCellPage(): void { this.cellPage = Math.min(this.cellPage, this.cellPageCount - 1); }

  readonly ringCircumference = 163;
  private phasesSub?: Subscription;

  constructor(
    private firestore: Firestore,
    private fb: FormBuilder,
    private planningData: PlanningDataService,
    private snackBar: MatSnackBar,
    private guard: AuthguardService
  ) {
    this.phaseForm = this.fb.group({
      phasename: [null, Validators.required],
      targetPct: [null, [Validators.min(0), Validators.max(100)]]
    });
  }

  ngOnInit(): void {
    this.pendingQueues = [...(this.selectedQueueList || [])];
    this.pendingEvents = [...this.selectedEventIds];
    this.loadFilters();
    this.loadStageOptions();
    this.loadJourneysAndMeta();
    this.loadCohorts();
    this.loadQueueEligibility();
    this.requestRecompute();
  }

  /** Load the journey list, participant-metadata map, and Priority-Mode product ids (for the filters). */
  private async loadJourneysAndMeta(): Promise<void> {
    try {
      this.journeyMap = await this.guard.getJourneyMap();
      this.journeyList = Object.entries(this.journeyMap)
        .map(([id, name]) => ({ id, name: String(name ?? id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) { console.error('Journey map load failed', e); }
    // Participant metadata is now loaded targeted (per-id) inside recompute — no whole-collection read.
    try {
      const snap = await getDocs(query(collection(this.firestore, 'products'), where('mode', '==', 'Priority Mode')));
      this.priorityProductIds = new Set(snap.docs.map(d => d.id));
    } catch (e) { console.error('Priority products load failed', e); }
    if (this.active) this.recomputeView();
  }

  /** Load the CURRENT marathon (latest by startdate) and its big-cohorts (id, name, member profileids). */
  private async loadCohorts(): Promise<void> {
    try {
      const mSnap = await getDocs(query(collection(this.firestore, 'big marathon'), orderBy('startdate', 'asc')));
      if (!mSnap.docs.length) return;
      const currentMarathon: any = mSnap.docs[mSnap.docs.length - 1].data();
      const currentMarathonId = currentMarathon['docid'] || mSnap.docs[mSnap.docs.length - 1].id;
      this.currentMarathonTitle = String(currentMarathon['title'] ?? '');
      const cSnap = await getDocs(collection(this.firestore, 'big cohorts'));
      this.cohortList = cSnap.docs
        .map(d => d.data() as any)
        .filter(c => c['marathonref']?.id === currentMarathonId)
        .map(c => ({
          id: c['docid'],
          name: String(c['name'] ?? c['docid']),
          members: new Set<string>(((c['participantidlist'] || []) as string[]).filter(Boolean))
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) { console.error('Cohort load failed', e); }
    if (this.active) this.recomputeView();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const queueChanged = !!changes['selectedQueueList'] && !changes['selectedQueueList'].firstChange;
    const refreshChanged = !!changes['refreshKey'] && !changes['refreshKey'].firstChange;
    const tokensChanged = !!changes['queueTokens'] && !changes['queueTokens'].firstChange;
    const completionChanged = !!changes['allCompletedStageCount'] && !changes['allCompletedStageCount'].firstChange;
    // mapData carries each queue's stage list — the "Total in the queue" count needs it, and it
    // arrives asynchronously (often AFTER tokens), so recompute when it lands or the total is stale.
    const mapDataChanged = !!changes['mapData'] && !changes['mapData'].firstChange;
    const becameActive = !!changes['active'] && !changes['active'].firstChange && this.active;
    // Queue/refresh: refresh stage options. Phases are in-memory (owned by the active filter /
    // working draft), so they are NOT reloaded/wiped when the queue list moves.
    if (queueChanged) this.pendingQueues = [...(this.selectedQueueList || [])];
    if (queueChanged || refreshChanged) {
      this.loadStageOptions();
      if (queueChanged) this.loadQueueEligibility();
      if (this.active && this.scope.length) this.dataLoading = true; // show the loader during a queue reload
      this.requestRecompute();
    } else if (tokensChanged || completionChanged || mapDataChanged) {
      // queueTokens / completion / stage-map arrive asynchronously (and in bursts during queue load).
      this.requestRecompute();
    }
    // Becoming visible: run any recompute that was deferred while the tab was hidden.
    if (becameActive && this.pendingRecompute) this.runRecompute();
  }

  ngOnDestroy(): void {
    this.phasesSub?.unsubscribe();
    this.filtersSub?.unsubscribe();
    if (this.recomputeTimer) clearTimeout(this.recomputeTimer);
  }

  // ---- Recompute scheduling: gate on visibility + coalesce bursts ----
  private pendingRecompute = false;
  private recomputeTimer: any = null;

  /** Ask for a recompute. Deferred while the tab is hidden; debounced while visible to tame bursts. */
  private requestRecompute(): void {
    if (!this.active) { this.pendingRecompute = true; return; }
    if (this.recomputeTimer) clearTimeout(this.recomputeTimer);
    this.recomputeTimer = setTimeout(() => this.runRecompute(), 200);
  }

  private runRecompute(): void {
    this.pendingRecompute = false;
    if (this.recomputeTimer) { clearTimeout(this.recomputeTimer); this.recomputeTimer = null; }
    this.recompute();
  }

  queueName(queueId: string): string { return this.mapQueue?.[queueId]?.['queuename'] || queueId; }
  trackByQueueId(_i: number, id: string): string { return id; }

  get selectedEventRefs(): DocumentReference[] {
    return (this.eventList || []).filter(e => this.selectedEventIds.includes(e['id'])).map(e => e['ref']);
  }

  // ---------- Filters ----------

  onEventChange(ids: string[]): void {
    this.selectedEventIds = ids || [];
    this.selectedCardKey = null;
    this.drillPage = 0;
    this.dataLoading = true;
    this.loadEventSets().then(() => this.recompute()).finally(() => this.dataLoading = false);
  }


  // ---------- Data ----------

  private async loadEventSets(): Promise<void> {
    const sets = await this.planningData.loadEventSets(this.selectedEventRefs);
    this.approvedSet = sets.approvedIds;
    this.requestedSet = sets.requestedIds;
    this.ownerSet = sets.ownerIds;
    this.potentialTotal = sets.potential;
  }

  private async recompute(): Promise<void> {
    // Load statuses for the RAW (unfiltered) holders so the journey filter (which needs
    // customerstatus) has data to work with; filtering happens after in queueHolderIds().
    const holders = this.rawQueueHolderIds();
    const ids = [...new Set<string>([...holders, ...this.approvedSet, ...this.requestedSet])];
    try {
      // Cache: only fetch metadata for ids we haven't fetched before. Repeated Gets / recomputes
      // (and re-selecting the same queue) reuse the cache instead of re-calling Firestore.
      const missing = ids.filter(id => !this.metaFetched.has(id));
      if (missing.length) {
        const meta = await this.planningData.loadParticipantMeta(missing);
        Object.assign(this.participantMeta, meta);
        missing.forEach(id => this.metaFetched.add(id));
      }
      this.statusMap = new Map<string, string>();
      for (const id of ids) this.statusMap.set(id, String(this.participantMeta[id]?.['customerstatus'] ?? '').toLowerCase());
    } finally {
      this.recomputeView();
      this.dataLoading = false;
    }
  }

  /**
   * Recompute cards + matrix + drills from already-loaded data (statusMap, tokens,
   * completion) with NO Firestore fetch. Used by the local queue filter so narrowing
   * the Planning view is instant and never reloads.
   */
  private recomputeView(): void {
    this.computeCards();
    this.rebuildMatrix();
    this.refreshDrill();
    this.refreshCellDrill();
  }

  /** All token holders across the planning scope — unfiltered (for status loading). */
  private rawQueueHolderIds(): Set<string> {
    const s = new Set<string>();
    for (const q of this.scope) {
      this.tokensForQueue(q).forEach(t => { if (t['profile_id']) s.add(t['profile_id']); });
    }
    return s;
  }

  /**
   * The queue's configured stages (from the queue-generation doc, same source the clone uses).
   * Prefer mapQueue (loaded with the queue list) over mapData (arrives late) so the total is
   * correct immediately rather than settling after mapData lands.
   */
  private queueStages(queueId: string): string[] {
    return (this.mapQueue?.[queueId]?.['stages'] || this.mapData?.[queueId]?.['stages'] || []) as string[];
  }

  /** Holders after applying the journey filter + DFU-ongoing omit — used by every number/list. */
  private queueHolderIds(): Set<string> {
    const raw = this.rawQueueHolderIds();
    if (!this.selectedJourneys.length && !this.dfuOn && !this.selectedCohorts.length) return raw;
    const out = new Set<string>();
    raw.forEach(id => { if (this.passesParticipantFilters(id)) out.add(id); });
    return out;
  }

  // ---------- Type #2 : eligible-but-unbooked (in queue-planning segment, not in queue_token) ----------
  /** profileids who belong to any segment that appears in the selected queue's `queue planning`. */
  private planningSegmentMembers = new Set<string>();

  /** Load the segment membership for the current queue scope (queue planning → participant list). */
  private async loadQueueEligibility(): Promise<void> {
    this.planningSegmentMembers = new Set<string>();
    const queues = this.scope;
    // Type #2 = Potential ∩ segment-members; Potential needs an event. Skip the (slow) segment
    // load entirely when no event is chosen — the card would be 0 regardless.
    if (!queues.length || !this.selectedEventIds.length) { if (this.active) this.recomputeView(); return; }
    try {
      // 1) segment ids configured in this queue's planning (queues in parallel)
      const segIds = new Set<string>();
      const planSnaps = await Promise.all(queues.map(qid =>
        getDocs(query(collection(this.firestore, 'queue planning'), where('queueid', '==', qid)))));
      planSnaps.forEach(planSnap => planSnap.docs.forEach(d => {
        ((d.data() as any)['planning'] || []).forEach((v: any) =>
          (v['segments'] || []).forEach((s: any) => { if (s['segmentid']) segIds.add(s['segmentid']); }));
      }));
      // 2) each segment doc lists its participant lists (participantlistid) — all in parallel
      const listIds = new Set<string>();
      const segDocs = await Promise.all([...segIds].map(sid => getDoc(doc(this.firestore, 'segments', sid))));
      segDocs.forEach(segDoc => {
        if (segDoc.exists()) ((segDoc.data() as any)['participantlistid'] || []).forEach((lid: string) => { if (lid) listIds.add(lid); });
      });
      // 3) participant list → union of profilelist — all in parallel
      const listDocs = await Promise.all([...listIds].map(lid => getDoc(doc(this.firestore, 'participant list', lid))));
      listDocs.forEach(listDoc => {
        if (listDoc.exists()) ((listDoc.data() as any)['profilelist'] || []).forEach((p: string) => { if (p) this.planningSegmentMembers.add(p); });
      });
    } catch (e) { console.error('Queue eligibility (Type #2) load failed', e); }
    if (this.active) this.recomputeView();
  }

  /** The Potential set (product owners not already approved/requested for the event). */
  private potentialIds(): string[] {
    return [...this.ownerSet].filter(o => !this.approvedSet.has(o) && !this.requestedSet.has(o));
  }

  /** Type #2 = Potential ∩ (in queue-planning segment) ∩ (NOT in queue_token). */
  private type2Ids(): string[] {
    if (!this.planningSegmentMembers.size) return [];
    const holders = this.rawQueueHolderIds();
    return this.potentialIds().filter(id => this.planningSegmentMembers.has(id) && !holders.has(id));
  }

  private statusBucket(id: string): 'a' | 'na' | 'd' {
    const raw = this.statusMap.get(id) || '';
    return raw === 'active' ? 'a' : raw === 'discontinued' ? 'd' : 'na';
  }

  private colKey(id: string, confirmed: boolean): Col {
    return `${confirmed ? 'c' : 'n'}_${this.statusBucket(id)}` as Col;
  }

  statusLabel(id: string): string {
    const raw = this.statusMap.get(id) || '';
    if (raw === 'active') return 'Active';
    if (raw === 'discontinued') return 'Discontinued';
    if (!raw) return '—';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // ---------- Cards ----------

  private computeCards(): void {
    const ap = this.approvedSet;
    const holders = this.queueHolderIds(); // distinct in-queue people (for the "not in queue" split)
    // Token-based in-queue counts — same population/logic as "Total in the queue" (no dedup).
    const filtering = this.selectedJourneys.length > 0 || this.dfuOn || this.selectedCohorts.length > 0;
    let inQueueTokens = 0, confInQueueTokens = 0;
    for (const q of this.scope) {
      for (const t of this.tokensForQueue(q)) {
        const pid = t['profile_id'];
        if (!pid) continue;
        if (filtering && !this.passesParticipantFilters(pid)) continue;
        inQueueTokens++;
        if (ap.has(pid)) confInQueueTokens++;
      }
    }
    const confNotInQueue = [...ap].filter(id => !holders.has(id)).length;
    this.cards = [
      { key: 'confEvent', label: 'Confirmed for the event', value: ap.size, desc: 'Approved/attended event requests' },
      { key: 'inQueue', label: 'Total in the queue', value: inQueueTokens, desc: 'Active tokens in the selected queue' },
      { key: 'confInQueue', label: 'Confirmed + in queue', value: confInQueueTokens, desc: 'Event-confirmed AND in the queue' },
      { key: 'confNotInQueue', label: 'Confirmed + not in queue', value: confNotInQueue, desc: 'Event-confirmed but no queue token' },
      { key: 'notConfInQueue', label: 'Not confirmed + in queue', value: Math.max(0, inQueueTokens - confInQueueTokens), desc: 'In queue but not event-confirmed' },
      { key: 'potential', label: 'Potential', value: this.potentialTotal, desc: 'Own the product, not yet in the event' },
      { key: 'type2', label: 'Eligible · not in queue', value: this.type2Ids().length, desc: 'Potential in a queue segment, not in queue' }
    ];
  }

  // ---------- Token / completion helpers ----------

  private tokensForQueue(queueId: string): any[] {
    // The single "in queue" definition used by EVERY planning number (matches Total in the queue
    // and dynamic-queue-manager-clone): Active + not-deleted + currentstage is a real queue stage.
    const stages = this.queueStages(queueId);
    return (this.queueTokens || []).filter(t =>
      t?.['queueref']?.id === queueId &&
      [null, undefined, false].includes(t?.['delete']) &&
      String(t?.['tokenstatus'] ?? '').toLowerCase() === 'active' &&
      (!stages.length || stages.includes(t?.['currentstage'])));
  }

  private confirmedSlotSetForStage(queueId: string, stageName: string): Set<string> {
    const out = new Set<string>();
    const now = Date.now();
    this.tokensForQueue(queueId).forEach(t => {
      const pid = t['profile_id'];
      if (!pid) return;
      const slot = (t['selectedstageslot'] || {})[stageName];
      if (!slot || !slot['slotconfirmation']) return;
      // Only count a confirmed slot whose end time is still in the future (upcoming, not past).
      const end = this.toDate(slot['enddate']);
      if (end && end.getTime() > now) out.add(pid);
    });
    return out;
  }

  private completedSetForStage(queueId: string, stageName: string): Set<string> {
    const out = new Set<string>();
    const map = this.allCompletedStageCount?.[queueId]?.[stageName];
    if (!map) return out;
    Object.keys(map).forEach(k => {
      (map[k] || []).forEach((d: any) => {
        const pid = d['participantid'] || d['profile_id'];
        if (pid) out.add(pid);
      });
    });
    return out;
  }

  memberStagesInScope(phase: any): PhaseStageRow[] {
    return (phase?.['stages'] || []).filter((s: any) => this.selectedQueueList.includes(s['queueid']));
  }

  phaseStageLabel(phase: any): string {
    return ((phase?.['stages'] || []) as PhaseStageRow[]).map(s => s.stagename).join(', ');
  }

  // ---------- Matrix ----------

  private rebuildMatrix(): void {
    const holders = [...this.queueHolderIds()];
    const scope = this.scope;
    this.matrixRows = (this.planningPhases || []).map(phase => {
      const z = (): Cells => ({ c_a: 0, c_na: 0, c_d: 0, n_a: 0, n_na: 0, n_d: 0, total: 0 });
      const lines: MatrixLine[] = this.rowDefs.map(rd => {
        const cells = z();
        if (rd.kind !== 'rate') {
          const stages = this.getRowStages(phase, rd.key).filter(s => scope.includes(s.queueid));
          for (const id of holders) {
            if (!this.rowMatches(rd, stages, id)) continue;
            const col = this.colKey(id, this.approvedSet.has(id));
            cells[col]++; cells.total++;
          }
        }
        return { key: rd.key, label: rd.label, kind: rd.kind, cells, stages: this.getRowStages(phase, rd.key) };
      });
      // Confirmation rate = Slot Confirmed ÷ Not Completed, per column (0 when the denominator is 0).
      const rateLine = lines.find(l => l.kind === 'rate');
      const notCompCells = lines.find(l => l.key === 'notComplete')?.cells;
      const slotConfCells = lines.find(l => l.key === 'slotConfirmed')?.cells;
      if (rateLine && notCompCells && slotConfCells) {
        (['c_a', 'c_na', 'c_d', 'n_a', 'n_na', 'n_d', 'total'] as (Col | 'total')[]).forEach(k => {
          rateLine.cells[k] = notCompCells[k] > 0 ? Math.round((slotConfCells[k] / notCompCells[k]) * 100) : 0;
        });
      }
      const completeLine = lines.find(l => l.key === 'complete');
      const pct = holders.length > 0 && completeLine ? Math.round((completeLine.cells.total / holders.length) * 100) : 0;
      const rawTarget = phase['targetPct'];
      const target = (rawTarget === null || rawTarget === undefined || rawTarget === '') ? null : Number(rawTarget);
      const status: MatrixRow['status'] = target == null ? 'none' : pct >= target ? 'ontrack' : pct >= target - 10 ? 'risk' : 'behind';
      return { phase, pct, target, status, pop: holders.length, lines } as MatrixRow;
    });
  }

  /** Does a queue participant match a readiness row's predicate over that row's configured stages? */
  private rowMatches(rd: { key: string; kind: 'stage' | 'slot' | 'rate' }, stages: PhaseStageRow[], id: string): boolean {
    if (!stages.length) return false;
    const all = (sets: Set<string>[]) =>
      this.phaseRollupRule === 'any' ? sets.some(s => s.has(id)) : sets.every(s => s.has(id));
    if (rd.kind === 'stage') {
      const done = all(stages.map(s => this.completedSetForStage(s.queueid, s.stagename)));
      return rd.key === 'complete' ? done : !done;
    }
    const conf = all(stages.map(s => this.confirmedSlotSetForStage(s.queueid, s.stagename)));
    return rd.key === 'slotConfirmed' ? conf : !conf;
  }

  ringDash(pct: number): string {
    return `${Math.round(this.ringCircumference * pct / 100)} ${this.ringCircumference}`;
  }

  get eventDate(): Date | null {
    const dates = (this.eventList || [])
      .filter(e => this.selectedEventIds.includes(e['id']))
      .map(e => this.toDate(e['start_date']))
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime());
    if (!dates.length) return null;
    const now = Date.now();
    return dates.find(d => d.getTime() >= now) || dates[dates.length - 1];
  }
  get eventName(): string {
    const sel = (this.eventList || []).filter(e => this.selectedEventIds.includes(e['id']));
    if (!sel.length) return '';
    if (sel.length === 1) return sel[0]['name'] || '';
    const d = this.eventDate;
    const match = d ? sel.find(e => { const ed = this.toDate(e['start_date']); return !!ed && ed.getTime() === d.getTime(); }) : null;
    return (match || sel[0])['name'] || (sel.length + ' events');
  }
  get daysToEvent(): number | null {
    const d = this.eventDate; if (!d) return null;
    const a = new Date(d); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }
  get countdownLabel(): string {
    const n = this.daysToEvent; if (n == null) return '';
    if (n > 1) return 'in ' + n + ' days';
    if (n === 1) return 'tomorrow';
    if (n === 0) return 'today';
    if (n === -1) return 'yesterday';
    return Math.abs(n) + ' days ago';
  }
  phaseStatusLabel(s: string): string { return s === 'ontrack' ? 'On track' : s === 'risk' ? 'At risk' : s === 'behind' ? 'Behind' : ''; }

  // ---------- Card drill-down ----------

  selectCard(key: string): void {
    this.selectedCardKey = this.selectedCardKey === key ? null : key;
    this.drillPage = 0;
    this.drillSearch = '';
    this.drillFilters.clear();
    this.refreshDrill();
  }

  cardLabel(key: string | null): string {
    return this.cards.find(c => c.key === key)?.label || '';
  }

  private drillIds(): string[] {
    const holders = this.queueHolderIds();
    const ap = this.approvedSet;
    switch (this.selectedCardKey) {
      case 'confEvent': return [...ap];
      case 'inQueue': return [...holders];
      case 'confInQueue': return [...holders].filter(id => ap.has(id));
      case 'confNotInQueue': return [...ap].filter(id => !holders.has(id));
      case 'notConfInQueue': return [...holders].filter(id => !ap.has(id));
      case 'potential': return this.potentialIds();
      case 'type2': return this.type2Ids();
      default: return [];
    }
  }

  private refreshDrill(): void {
    if (!this.selectedCardKey) { this.drillList = []; return; }
    const holders = this.queueHolderIds();
    const ap = this.approvedSet;
    this.drillList = this.drillIds().map(id => ({
      name: this.mapProfile?.[id] || id,
      phone: this.mapNumber?.[id] || '',
      status: this.statusLabel(id),
      confirmed: ap.has(id),
      inQueue: holders.has(id)
    })).sort((a, b) => a.name.localeCompare(b.name));
    this.clampDrillPage();
  }

  // ---------- Matrix cell drill-down ----------

  isCellSel(phase: any, line: MatrixLine, col: Col | 'total'): boolean {
    return !!this.selectedCell
      && this.selectedCell.phaseDocid === phase['docid']
      && this.selectedCell.lineKey === line.key
      && this.selectedCell.col === col;
  }

  selectCell(phase: any, line: MatrixLine, col: Col | 'total'): void {
    // Derived rate rows show percentages, not a participant set — nothing to drill into.
    if (line.kind === 'rate') return;
    const count = line.cells[col];
    if (this.isCellSel(phase, line, col) || !count) { this.closeCell(); return; }
    this.cellPage = 0;
    this.cellSearch = '';
    this.cellFilters.clear();
    this.selectedCell = {
      phaseDocid: phase['docid'],
      lineKey: line.key,
      col,
      label: `${phase['phasename']} · ${line.label} · ${this.colLabel(col)}`
    };
    this.computeCellDrill(phase, line.key, col);
  }

  closeCell(): void { this.selectedCell = null; this.cellDrillRows = []; this.cellSearch = ''; this.cellFilters.clear(); }

  colLabel(col: Col | 'total'): string {
    if (col === 'total') return 'Total';
    const c = this.allCols.find(x => x.k === col);
    return `${col.startsWith('c_') ? 'Confirmed' : 'Not confirmed'} · ${c?.label || col}`;
  }

  private cellIds(phase: any, lineKey: string, col: Col | 'total'): string[] {
    const rd = this.rowDefs.find(r => r.key === lineKey);
    if (!rd) return [];
    const stages = this.getRowStages(phase, lineKey).filter(s => this.scope.includes(s.queueid));
    return [...this.queueHolderIds()].filter(id => {
      if (!this.rowMatches(rd, stages, id)) return false;
      return col === 'total' || this.colKey(id, this.approvedSet.has(id)) === col;
    });
  }

  /**
   * The participant's queue name + currentstage from their token in the selected queue(s).
   * When a participant sits in several selected queues, prefer the queue that this row's
   * configured stages belong to, so the drill agrees with why the cell matched.
   */
  private participantQueueStage(id: string, preferQueueIds?: Set<string>): { queueName: string; stage: string } {
    const lookup = (queues: string[]) => {
      for (const q of queues) {
        const tok = this.tokensForQueue(q).find(t => t['profile_id'] === id);
        if (tok) return { queueName: this.queueName(q), stage: tok['currentstage'] || '—' };
      }
      return null;
    };
    if (preferQueueIds && preferQueueIds.size) {
      const preferred = lookup(this.scope.filter(q => preferQueueIds.has(q)));
      if (preferred) return preferred;
    }
    return lookup(this.scope) || { queueName: '—', stage: '—' };
  }

  /** Whether the currently-open cell belongs to a slot row (drives the "Selected slot" column). */
  get cellIsSlot(): boolean {
    if (!this.selectedCell) return false;
    return this.rowDefs.find(r => r.key === this.selectedCell!.lineKey)?.kind === 'slot';
  }

  private computeCellDrill(phase: any, lineKey: string, col: Col | 'total'): void {
    const isSlot = this.rowDefs.find(r => r.key === lineKey)?.kind === 'slot';
    const stagesInScope = this.getRowStages(phase, lineKey).filter(s => this.scope.includes(s.queueid));
    const prefer = new Set(stagesInScope.map(s => s.queueid));
    this.cellDrillRows = this.cellIds(phase, lineKey, col).map(id => {
      const qs = this.participantQueueStage(id, prefer);
      return {
        name: this.mapProfile?.[id] || id,
        phone: this.mapNumber?.[id] || '',
        queueName: qs.queueName,
        stage: qs.stage,
        status: this.statusLabel(id),
        confirmed: this.approvedSet.has(id),
        slot: isSlot ? this.participantSlot(id, stagesInScope) : ''
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    this.clampCellPage();
  }

  /** The slot a participant picked for this row's configured slot stage(s): first stage with a dated slot. */
  private participantSlot(id: string, stages: PhaseStageRow[]): string {
    for (const s of stages) {
      const tok = this.tokensForQueue(s.queueid).find(t => t['profile_id'] === id);
      const slot = tok?.['selectedstageslot']?.[s.stagename];
      const label = this.formatSlot(slot);
      if (label) return label;
    }
    return '—';
  }

  private formatSlot(slot: any): string {
    const start = this.toDate(slot?.['startdate']);
    if (!start) return '';
    const date = start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const end = this.toDate(slot?.['enddate']);
    const endTime = end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    return endTime ? `${date}, ${startTime}–${endTime}` : `${date}, ${startTime}`;
  }

  /** Coerce a Firestore Timestamp / Date / parseable value to a Date. */
  private toDate(v: any): Date | null {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  private refreshCellDrill(): void {
    if (!this.selectedCell) { this.cellDrillRows = []; return; }
    const phase = this.planningPhases.find(p => p['docid'] === this.selectedCell!.phaseDocid);
    if (!phase) { this.closeCell(); return; }
    this.computeCellDrill(phase, this.selectedCell.lineKey, this.selectedCell.col);
    // A recompute can empty a previously-populated cell — don't leave a stale panel open.
    if (!this.cellDrillRows.length) this.closeCell();
  }

  // ---------- Saved filters (load / apply / save / diff) ----------

  private newId(): string { return doc(collection(this.firestore, 'planning_phases')).id; }

  private loadFilters(): void {
    this.filtersSub?.unsubscribe();
    this.filtersSub = collectionData(collection(this.firestore, 'planning_phases')).subscribe({
      next: (docs: any[]) => {
        this.savedFilters = docs
          .map(d => d as PlanningFilter)
          .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      },
      error: err => console.error('Load filters failed', err)
    });
  }

  private cloneRows(rows: { [key: string]: PhaseStageRow[] } | undefined): { [key: string]: PhaseStageRow[] } {
    const out: { [key: string]: PhaseStageRow[] } = {};
    Object.keys(rows || {}).forEach(k => out[k] = (rows![k] || []).map(s => ({ queueid: s.queueid, stagename: s.stagename })));
    return out;
  }

  /** Apply a saved filter: restore queues (→ Board loads data), events and phases, then recompute. */
  applyFilter(f: PlanningFilter): void {
    // Already applied → do nothing (no redundant refetch/reload).
    if (this.activeFilterId === f.docid) return;
    this.activeFilterId = f.docid;
    this.selectedEventIds = [...(f.eventIds || [])];
    this.pendingEvents = [...(f.eventIds || [])];
    this.pendingQueues = [...(f.queueIds || [])];
    this.planningPhases = (f.phases || []).map(p => ({
      docid: this.newId(), phasename: p.phasename, targetPct: p.targetPct ?? null, rows: this.cloneRows(p.rows)
    }));
    this.selectedCardKey = null; this.drillList = [];
    this.selectedCell = null; this.cellDrillRows = [];
    this.showSaveWidget = false;
    // Show the loader while the filter's data is (re)loaded.
    this.dataLoading = true;
    // Push the queue set up so the Board loads its data; tokens arriving will trigger recompute.
    this.patchQueues.emit([...(f.queueIds || [])]);
    const done = () => this.dataLoading = false;
    if (this.selectedEventRefs.length) this.loadEventSets().then(() => this.recompute()).finally(done);
    else { this.approvedSet = new Set(); this.requestedSet = new Set(); this.ownerSet = new Set(); this.potentialTotal = 0; Promise.resolve(this.recompute()).finally(done); }
  }

  isActiveFilter(f: PlanningFilter): boolean { return this.activeFilterId === f.docid; }

  /** Start a brand-new filter: reset EVERY selection (queue, event, journey, DFU) + phases. */
  newFilter(): void {
    this.activeFilterId = null;
    this.planningPhases = [];
    this.showSaveWidget = false;
    // Reset all dropdowns/toggles
    this.selectedEventIds = [];
    this.pendingEvents = [];
    this.pendingQueues = [];
    this.selectedJourneys = [];
    this.dfuOn = false;
    this.filterMode = 'only';
    this.selectedCohorts = [];
    this.selectedCohortMembers = new Set<string>();
    // Reset event-derived sets so cards zero out
    this.approvedSet = new Set(); this.requestedSet = new Set(); this.ownerSet = new Set(); this.potentialTotal = 0;
    // Drills / form
    this.selectedCardKey = null; this.drillList = [];
    this.selectedCell = null; this.cellDrillRows = [];
    this.closePhaseForm();
    // Clear the planning queue selection up in the parent (empties its data too)
    this.queueSelectionChange.emit([]);
    this.rebuildMatrix();
  }

  /** Open the floating save panel: compute the diff vs the applied filter and prefill the title. */
  openSaveWidget(): void {
    const active = this.activeFilter;
    this.saveMode = active ? 'update' : 'new';
    this.saveTitle = active ? (active.title || '') : '';
    this.pendingChanges = this.computeChanges(active);
    this.showSaveWidget = true;
  }

  closeSaveWidget(): void { this.showSaveWidget = false; }

  /** Save the current working state as a new filter, or update the applied one. */
  saveFilter(): void {
    const title = (this.saveTitle || '').trim();
    if (!title) return;
    const phases: FilterPhase[] = this.planningPhases.map(p => ({
      phasename: p['phasename'], targetPct: p['targetPct'] ?? null, rows: this.cloneRows(p['rows'])
    }));
    const base = { title, queueIds: [...this.selectedQueueList], eventIds: [...this.selectedEventIds], phases, lasteditedby: this.currentProfileId || null };
    const active = this.activeFilter;
    if (this.saveMode === 'update' && active) {
      updateDoc(doc(this.firestore, 'planning_phases', active.docid), { ...base, updated: new Date() })
        .then(() => { this.showSaveWidget = false; this.toast('Filter updated'); })
        .catch(err => { console.error('Update filter failed', err); alert('Could not save filter: ' + (err?.code || err?.message || err)); });
    } else {
      const docid = this.newId();
      setDoc(doc(this.firestore, 'planning_phases', docid), { ...base, docid, created: new Date() })
        .then(() => { this.activeFilterId = docid; this.showSaveWidget = false; this.toast('Filter created'); })
        .catch(err => { console.error('Create filter failed', err); alert('Could not save filter: ' + (err?.code || err?.message || err)); });
    }
  }

  private toast(msg: string): void {
    this.snackBar.open(msg, 'Close', { duration: 2500, horizontalPosition: 'center', verticalPosition: 'bottom' });
  }

  deleteFilter(f: PlanningFilter, ev?: Event): void {
    ev?.stopPropagation();
    if (!confirm(`Delete the filter "${f.title}"?`)) return;
    deleteDoc(doc(this.firestore, 'planning_phases', f.docid))
      .then(() => { if (this.activeFilterId === f.docid) this.activeFilterId = null; })
      .catch(err => console.error('Delete filter failed', err));
  }

  private eventLabel(id: string): string {
    return (this.eventList || []).find(e => e['id'] === id)?.['name'] || id;
  }

  private readonly rowLabel = (k: string) => this.rowDefs.find(rd => rd.key === k)?.label || k;
  private stageNames(arr: PhaseStageRow[]): string[] { return (arr || []).map(s => s.stagename); }

  /** Every configured line of a phase, e.g. `Not Completed: StageA, StageB`. */
  private phaseDetailLines(name: string, targetPct: any, rows: any, prefix = ''): string[] {
    const out: string[] = [];
    const t = targetPct ?? null;
    out.push(`${prefix}Phase "${name}"${t != null ? ` · target ${t}%` : ''}`);
    for (const rd of this.rowDefs) {
      if (rd.kind === 'rate') continue;
      const stages = this.stageNames((rows || {})[rd.key] || []);
      if (stages.length) out.push(`${prefix}   ${this.rowLabel(rd.key)}: ${stages.join(', ')}`);
    }
    return out;
  }

  /** FULL list of what is being saved (new) or what changed vs the applied filter (update). */
  private computeChanges(active: PlanningFilter | null): string[] {
    // NEW filter — list everything that will be saved, in full.
    if (!active) {
      const out: string[] = [];
      out.push(`Queues: ${this.selectedQueueList.length ? this.selectedQueueList.map(q => this.queueName(q)).join(', ') : '—'}`);
      out.push(`Events: ${this.selectedEventIds.length ? this.selectedEventIds.map(e => this.eventLabel(e)).join(', ') : '—'}`);
      out.push(`Phases: ${this.planningPhases.length}`);
      for (const p of this.planningPhases) out.push(...this.phaseDetailLines(p['phasename'], p['targetPct'], p['rows'], '  '));
      return out;
    }
    // UPDATE — every difference, spelled out.
    const lines: string[] = [];
    if (active.title !== (this.saveTitle || '').trim() && (this.saveTitle || '').trim()) {
      lines.push(`Title: "${active.title}" → "${(this.saveTitle || '').trim()}"`);
    }
    const diffSet = (oldArr: string[], curArr: string[], label: string, name: (x: string) => string) => {
      const oldS = new Set(oldArr), curS = new Set(curArr);
      const added = curArr.filter(x => !oldS.has(x)).map(name);
      const removed = oldArr.filter(x => !curS.has(x)).map(name);
      if (added.length) lines.push(`${label} added: ${added.join(', ')}`);
      if (removed.length) lines.push(`${label} removed: ${removed.join(', ')}`);
    };
    diffSet(active.queueIds || [], this.selectedQueueList, 'Queue', q => this.queueName(q));
    diffSet(active.eventIds || [], this.selectedEventIds, 'Event', e => this.eventLabel(e));
    const oldByName = new Map((active.phases || []).map(p => [p.phasename, p]));
    const curByName = new Map(this.planningPhases.map(p => [p['phasename'], p]));
    for (const [name, cur] of curByName) {
      const old = oldByName.get(name);
      if (!old) { lines.push(...this.phaseDetailLines(name, cur['targetPct'], cur['rows'], 'Added ')); continue; }
      const oldT = old.targetPct ?? null, newT = cur['targetPct'] ?? null;
      if (oldT !== newT) lines.push(`"${name}" target: ${oldT ?? '—'}% → ${newT ?? '—'}%`);
      for (const rd of this.rowDefs) {
        if (rd.kind === 'rate') continue;
        const oldStages = this.stageNames(old.rows?.[rd.key] || []);
        const curStages = this.stageNames((cur['rows'] || {})[rd.key] || []);
        const oldS = new Set(oldStages), curS = new Set(curStages);
        const added = curStages.filter(s => !oldS.has(s));
        const removed = oldStages.filter(s => !curS.has(s));
        if (added.length) lines.push(`"${name}" · ${this.rowLabel(rd.key)} +${added.join(', ')}`);
        if (removed.length) lines.push(`"${name}" · ${this.rowLabel(rd.key)} −${removed.join(', ')}`);
      }
    }
    for (const name of oldByName.keys()) if (!curByName.has(name)) lines.push(`Phase removed: "${name}"`);
    if (!lines.length) lines.push('No changes');
    return lines;
  }

  private async loadStageOptions(): Promise<void> {
    this.stageOptions = [];
    if (!this.selectedQueueList.length) return;
    const snap = await getDocs(query(
      collection(this.firestore, 'queue generation'),
      where('docid', 'in', this.selectedQueueList)
    ));
    const opts: PhaseStageRow[] = [];
    snap.docs.forEach(d => {
      const x: any = d.data();
      (x['stages'] || []).forEach((st: string) => opts.push({ queueid: x['docid'], stagename: st }));
    });
    this.stageOptions = opts;
  }

  comparePhaseStage(a: any, b: any): boolean {
    return a && b ? `${a.queueid}${a.stagename}` === `${b.queueid}${b.stagename}` : a === b;
  }

  openAddPhase(): void {
    this.isEditMode = false;
    this.editingPhase = null;
    this.phaseForm.reset({ phasename: null, targetPct: null });
    this.showPhaseForm = true;
  }

  editPhase(phase: any): void {
    this.isEditMode = true;
    this.editingPhase = phase;
    this.phaseForm.patchValue({ phasename: phase['phasename'], targetPct: phase['targetPct'] ?? null });
    this.showPhaseForm = true;
  }

  submitPhase(): void {
    if (!this.phaseForm.valid) return;
    const name = this.phaseForm.value.phasename;
    const t = this.phaseForm.value.targetPct;
    const targetPct = (t === null || t === undefined || t === '') ? null : Math.max(0, Math.min(100, Number(t)));
    if (this.isEditMode && this.editingPhase) {
      this.editingPhase['phasename'] = name;
      this.editingPhase['targetPct'] = targetPct;
    } else {
      this.planningPhases = [...this.planningPhases, {
        docid: this.newId(), phasename: name, targetPct,
        rows: { notComplete: [], slotConfirmed: [], slotNotConfirmed: [], complete: [] }
      }];
    }
    this.closePhaseForm();
    this.rebuildMatrix();
  }

  deletePhase(phase: any): void {
    const ok = confirm(`Are you sure you want to delete the phase "${phase['phasename']}"?`);
    if (!ok) return;
    this.planningPhases = this.planningPhases.filter(p => p !== phase);
    this.rebuildMatrix();
  }

  onPhaseDrop(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.planningPhases, event.previousIndex, event.currentIndex);
    this.planningPhases = [...this.planningPhases];
    this.rebuildMatrix();
  }

  closePhaseForm(): void {
    this.showPhaseForm = false;
    this.isEditMode = false;
    this.editingPhase = null;
    this.phaseForm.reset({ phasename: null, targetPct: null });
  }
}
