import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  Firestore, collection, collectionData, query, where, getDocs,
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

import { PlanningDataService } from './planning-data.service';

interface PhaseStageRow { queueid: string; stagename: string; }
type Col = 'c_a' | 'c_na' | 'c_d' | 'n_a' | 'n_na' | 'n_d';
interface Cells { c_a: number; c_na: number; c_d: number; n_a: number; n_na: number; n_d: number; total: number; }
interface MatrixLine { key: string; label: string; kind: 'stage' | 'slot'; cells: Cells; stages: PhaseStageRow[]; }
interface MatrixRow { phase: any; pct: number; pop: number; lines: MatrixLine[]; }
interface CardDef { key: string; label: string; value: number; }
interface DrillRow { name: string; phone: string; status: string; confirmed: boolean; inQueue: boolean; }
interface CellDrillRow { name: string; phone: string; queueName: string; stage: string; status: string; confirmed: boolean; slot: string; }
interface CellRef { phaseDocid: string; lineKey: string; col: Col | 'total'; label: string; }

@Component({
  selector: 'app-planning-tab',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, DragDropModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule, MatButtonModule, MatTooltipModule
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
  /** Events ('event collection' docs: {id, ref, name}). */
  @Input() eventList: any[] = [];
  /** Active queues ('queue generation' docs). */
  @Input() queueList: any[] = [];
  /** Emits the new queue selection up to the dashboard (drives the live data). */
  @Output() queueChange = new EventEmitter<string[]>();

  /** Selected events (multi). */
  selectedEventIds: string[] = [];
  /** Local mirror of the parent-owned queue selection, for stable two-way binding. */
  queueModel: string[] = [];

  /** Phase roll-up: 'all' = clear every member stage. */
  phaseRollupRule: 'all' | 'any' = 'all';

  // Column groups (Confirmed / Not confirmed × Active / Non-Active / Discontinued)
  readonly confirmedCols: { k: Col; label: string }[] = [
    { k: 'c_a', label: 'Active' }, { k: 'c_na', label: 'Non-Active' }, { k: 'c_d', label: 'Discont' }
  ];
  readonly notConfirmedCols: { k: Col; label: string }[] = [
    { k: 'n_a', label: 'Active' }, { k: 'n_na', label: 'Non-Active' }, { k: 'n_d', label: 'Discont' }
  ];
  get allCols(): { k: Col; label: string }[] { return [...this.confirmedCols, ...this.notConfirmedCols]; }

  /** The four readiness rows, each independently configured with its own stages. */
  readonly rowDefs: { key: string; label: string; kind: 'stage' | 'slot' }[] = [
    { key: 'complete', label: 'Complete', kind: 'stage' },
    { key: 'notComplete', label: 'Not complete', kind: 'stage' },
    { key: 'slotConfirmed', label: 'Slot confirmation', kind: 'slot' },
    { key: 'slotNotConfirmed', label: 'Slot not confirmed', kind: 'slot' }
  ];

  getRowStages(phase: any, key: string): PhaseStageRow[] {
    return (phase?.['rows']?.[key] || []) as PhaseStageRow[];
  }

  setRowStages(phase: any, key: string, stages: PhaseStageRow[]): void {
    const rows = { ...(phase['rows'] || {}), [key]: stages || [] };
    updateDoc(doc(this.firestore, 'stage opportunity count', phase['docid']),
      { rows, queuelist: this.selectedQueueList, kind: 'phase', updated: new Date() })
      .catch(err => console.error('Save phase row failed', err));
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
    private planningData: PlanningDataService
  ) {
    this.phaseForm = this.fb.group({
      phasename: [null, Validators.required]
    });
  }

  ngOnInit(): void {
    this.queueModel = [...(this.selectedQueueList || [])];
    this.loadPhases();
    if (this.selectedEventRefs.length) this.loadEventSets().then(() => this.recompute());
    else this.recompute();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedQueueList']) {
      this.queueModel = [...(this.selectedQueueList || [])];
    }
    const queueChanged = !!changes['selectedQueueList'] && !changes['selectedQueueList'].firstChange;
    const refreshChanged = !!changes['refreshKey'] && !changes['refreshKey'].firstChange;
    const tokensChanged = !!changes['queueTokens'] && !changes['queueTokens'].firstChange;
    const completionChanged = !!changes['allCompletedStageCount'] && !changes['allCompletedStageCount'].firstChange;
    // Queue/refresh: reload phases + recompute. Don't rely solely on refreshKey moving with the queue list.
    if (queueChanged || refreshChanged) {
      this.loadPhases();
      this.recompute();
    } else if (tokensChanged || completionChanged) {
      // The parent loads queueTokens / completion counts asynchronously, often arriving in a
      // later change-detection pass than the refreshKey bump. Recompute when they land so the
      // cards don't stay stuck on stale (empty) data while the matrix shows the real numbers.
      this.recompute();
    }
  }

  ngOnDestroy(): void { this.phasesSub?.unsubscribe(); }

  queueName(queueId: string): string { return this.mapQueue?.[queueId]?.['queuename'] || queueId; }

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

  onQueueChange(ids: string[]): void {
    this.queueModel = ids || [];
    this.selectedCell = null;
    this.cellDrillRows = [];
    this.cellPage = 0;
    this.queueChange.emit(this.queueModel);
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
    const holders = this.queueHolderIds();
    const ids = [...new Set<string>([...holders, ...this.approvedSet, ...this.requestedSet])];
    this.statusMap = await this.planningData.loadCustomerStatus(ids);
    this.computeCards();
    this.rebuildMatrix();
    this.refreshDrill();
    this.refreshCellDrill();
  }

  private queueHolderIds(): Set<string> {
    const s = new Set<string>();
    for (const q of this.selectedQueueList) {
      this.tokensForQueue(q).forEach(t => { if (t['profile_id']) s.add(t['profile_id']); });
    }
    return s;
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
    const holders = this.queueHolderIds();
    const ap = this.approvedSet;
    let confInQ = 0;
    holders.forEach(id => { if (ap.has(id)) confInQ++; });
    this.cards = [
      { key: 'confEvent', label: 'Confirmed for the event', value: ap.size },
      { key: 'inQueue', label: 'Total in the queue', value: holders.size },
      { key: 'confInQueue', label: 'Confirmed + in queue', value: confInQ },
      { key: 'confNotInQueue', label: 'Confirmed + not in queue', value: Math.max(0, ap.size - confInQ) },
      { key: 'notConfInQueue', label: 'Not confirmed + in queue', value: Math.max(0, holders.size - confInQ) },
      { key: 'potential', label: 'Potential', value: this.potentialTotal }
    ];
  }

  // ---------- Token / completion helpers ----------

  private tokensForQueue(queueId: string): any[] {
    return (this.queueTokens || []).filter(t => t?.['queueref']?.id === queueId);
  }

  private confirmedSlotSetForStage(queueId: string, stageName: string): Set<string> {
    const out = new Set<string>();
    this.tokensForQueue(queueId).forEach(t => {
      const pid = t['profile_id'];
      if (!pid) return;
      const slot = (t['selectedstageslot'] || {})[stageName];
      if (slot && slot['slotconfirmation']) out.add(pid);
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
    this.matrixRows = (this.planningPhases || []).map(phase => {
      const z = (): Cells => ({ c_a: 0, c_na: 0, c_d: 0, n_a: 0, n_na: 0, n_d: 0, total: 0 });
      const lines: MatrixLine[] = this.rowDefs.map(rd => {
        const stages = this.getRowStages(phase, rd.key).filter(s => this.selectedQueueList.includes(s.queueid));
        const cells = z();
        for (const id of holders) {
          if (!this.rowMatches(rd, stages, id)) continue;
          const col = this.colKey(id, this.approvedSet.has(id));
          cells[col]++; cells.total++;
        }
        return { key: rd.key, label: rd.label, kind: rd.kind, cells, stages: this.getRowStages(phase, rd.key) };
      });
      const completeLine = lines.find(l => l.key === 'complete');
      const pct = holders.length > 0 && completeLine ? Math.round((completeLine.cells.total / holders.length) * 100) : 0;
      return { phase, pct, pop: holders.length, lines } as MatrixRow;
    });
  }

  /** Does a queue participant match a readiness row's predicate over that row's configured stages? */
  private rowMatches(rd: { key: string; kind: 'stage' | 'slot' }, stages: PhaseStageRow[], id: string): boolean {
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
      case 'potential': return [...this.ownerSet].filter(o => !ap.has(o) && !this.requestedSet.has(o));
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
    const stages = this.getRowStages(phase, lineKey).filter(s => this.selectedQueueList.includes(s.queueid));
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
      const preferred = lookup(this.selectedQueueList.filter(q => preferQueueIds.has(q)));
      if (preferred) return preferred;
    }
    return lookup(this.selectedQueueList) || { queueName: '—', stage: '—' };
  }

  /** Whether the currently-open cell belongs to a slot row (drives the "Selected slot" column). */
  get cellIsSlot(): boolean {
    if (!this.selectedCell) return false;
    return this.rowDefs.find(r => r.key === this.selectedCell!.lineKey)?.kind === 'slot';
  }

  private computeCellDrill(phase: any, lineKey: string, col: Col | 'total'): void {
    const isSlot = this.rowDefs.find(r => r.key === lineKey)?.kind === 'slot';
    const stagesInScope = this.getRowStages(phase, lineKey).filter(s => this.selectedQueueList.includes(s.queueid));
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

  // ---------- Phase config ----------

  private loadPhases(): void {
    this.phasesSub?.unsubscribe();
    if (!this.selectedQueueList.length) { this.planningPhases = []; this.rebuildMatrix(); return; }
    this.loadStageOptions();
    this.phasesSub = collectionData(query(
      collection(this.firestore, 'stage opportunity count'),
      where('queuelist', 'array-contains-any', this.selectedQueueList)
    )).subscribe({
      next: (docs: any[]) => {
        this.planningPhases = docs
          .filter(d => d['kind'] === 'phase')
          .filter(d => (d['queuelist'] || []).every((q: string) => this.selectedQueueList.includes(q)))
          .sort((a, b) => (a['sequence'] ?? 999) - (b['sequence'] ?? 999));
        this.rebuildMatrix();
      },
      error: err => console.error('Load phases failed', err)
    });
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
    this.phaseForm.reset({ phasename: null });
    this.showPhaseForm = true;
  }

  editPhase(phase: any): void {
    this.isEditMode = true;
    this.editingPhase = phase;
    this.phaseForm.patchValue({ phasename: phase['phasename'] });
    this.showPhaseForm = true;
  }

  submitPhase(): void {
    if (!this.phaseForm.valid) return;
    const name = this.phaseForm.value.phasename;
    if (this.isEditMode && this.editingPhase) {
      updateDoc(doc(this.firestore, 'stage opportunity count', this.editingPhase['docid']),
        { phasename: name, queuelist: this.selectedQueueList, kind: 'phase', updated: new Date() })
        .then(() => this.closePhaseForm())
        .catch(err => { console.error('Save phase failed', err); alert('Could not save phase: ' + (err?.code || err?.message || err)); });
    } else {
      const docid = doc(collection(this.firestore, 'stage opportunity count')).id;
      const docData = {
        phasename: name,
        rows: { complete: [], notComplete: [], slotConfirmed: [], slotNotConfirmed: [] },
        queuelist: this.selectedQueueList, kind: 'phase', docid, sequence: this.planningPhases.length, created: new Date()
      };
      setDoc(doc(this.firestore, 'stage opportunity count', docid), docData)
        .then(() => this.closePhaseForm())
        .catch(err => { console.error('Create phase failed', err); alert('Could not create phase: ' + (err?.code || err?.message || err)); });
    }
  }

  deletePhase(phase: any): void {
    const ok = confirm(`Are you sure you want to delete the phase "${phase['phasename']}"?`);
    if (!ok) return;
    deleteDoc(doc(this.firestore, 'stage opportunity count', phase['docid']))
      .catch(err => console.error('Delete phase failed', err));
  }

  onPhaseDrop(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.planningPhases, event.previousIndex, event.currentIndex);
    this.planningPhases = [...this.planningPhases];
    this.rebuildMatrix();
    const updates = this.planningPhases.map((item, index) => {
      item.sequence = index;
      return updateDoc(doc(this.firestore, 'stage opportunity count', item.docid), { sequence: index });
    });
    Promise.all(updates).catch(err => console.error('Error updating phase sequence:', err));
  }

  closePhaseForm(): void {
    this.showPhaseForm = false;
    this.isEditMode = false;
    this.editingPhase = null;
    this.phaseForm.reset({ phasename: null });
  }
}
