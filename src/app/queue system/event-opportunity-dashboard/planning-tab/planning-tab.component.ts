import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  Firestore, collection, collectionData, query, where, getDocs,
  doc, setDoc, updateDoc, deleteDoc
} from '@angular/fire/firestore';
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { PlanningDataService, PlanningParticipant } from './planning-data.service';

interface PhaseStageRow { queueid: string; stagename: string; }
type Seg = 'ca' | 'na' | 'nc';
interface SegCounts { ca: number; na: number; nc: number; total: number; }
interface MatrixLine { label: string; cells: SegCounts; }
interface MatrixRow { phase: any; pct: number; pop: number; lines: MatrixLine[]; }

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

  /** Queues currently selected on the dashboard (mutated in place by the parent). */
  @Input() selectedQueueList: string[] = [];
  /** queueDocid -> queue 'generation' doc (carries docref + queuename). */
  @Input() mapQueue: any = {};
  /** queueDocid -> aggregated live data (carries 'stages'). */
  @Input() mapData: any = {};
  /** Raw queue_token docs for the selected queues (carry queueref + selectedstageslot). */
  @Input() queueTokens: any[] = [];
  /** All-time completion map: queueId -> stage -> key -> [doc]. */
  @Input() allCompletedStageCount: any = {};
  /** profileId -> display name. */
  @Input() mapProfile: any = {};
  /** profileId -> phone number. */
  @Input() mapNumber: any = {};
  /** Bumped by the parent to force a reload (selectedQueueList is mutated in place). */
  @Input() refreshKey = 0;

  /**
   * How a Phase rolls up across its member stages.
   * 'all' = participant must clear EVERY member stage (intersection). Tunable during config.
   */
  phaseRollupRule: 'all' | 'any' = 'all';

  readonly segCols: { k: Seg; label: string }[] = [
    { k: 'ca', label: 'uP! Confirmed · Active' },
    { k: 'na', label: 'Non-active' },
    { k: 'nc', label: 'Not confirmed' }
  ];

  // Roster (cohort) + segment totals
  roster: PlanningParticipant[] = [];
  potentialTotal = 0;
  rosterLoading = false;

  matrixRows: MatrixRow[] = [];

  planningPhases: any[] = [];
  stageOptions: PhaseStageRow[] = [];

  phaseForm: FormGroup;
  showPhaseForm = false;
  isEditMode = false;
  editingPhase: any = null;

  // Drill-down
  selectedPhaseKey: string | null = null;
  drillSeg: 'all' | Seg = 'all';

  readonly ringCircumference = 163;

  private phasesSub?: Subscription;

  constructor(
    private firestore: Firestore,
    private fb: FormBuilder,
    private planningData: PlanningDataService
  ) {
    this.phaseForm = this.fb.group({
      phasename: [null, Validators.required],
      stages: [[], [Validators.required, Validators.minLength(1)]]
    });
  }

  ngOnInit(): void { this.refresh(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshKey'] && !changes['refreshKey'].firstChange) this.refresh();
  }

  ngOnDestroy(): void { this.phasesSub?.unsubscribe(); }

  private refresh(): void {
    this.loadPhases();
    this.loadRoster();
  }

  queueName(queueId: string): string {
    return this.mapQueue?.[queueId]?.['queuename'] || queueId;
  }

  get cohortTotal(): number { return this.roster.length; }
  get confirmedTotal(): number { return this.roster.filter(p => p.confirmed).length; }

  // ---------- Roster ----------

  private async loadRoster(): Promise<void> {
    if (!this.selectedQueueList.length) {
      this.roster = []; this.potentialTotal = 0; this.rebuildMatrix(); return;
    }
    this.rosterLoading = true;
    const merged = new Map<string, PlanningParticipant>();
    let potential = 0;
    for (const queueId of [...this.selectedQueueList]) {
      const ref = this.mapQueue?.[queueId]?.['docref'];
      if (!ref) continue;
      const r = await this.planningData.loadParticipants(queueId, ref);
      potential += r.potential;
      for (const p of r.participants) {
        const ex = merged.get(p.profileId);
        if (!ex) merged.set(p.profileId, { ...p });
        else { ex.confirmed = ex.confirmed || p.confirmed; ex.requested = ex.requested || p.requested; ex.active = ex.active || p.active; }
      }
    }
    this.roster = [...merged.values()];
    this.potentialTotal = potential;
    this.rosterLoading = false;
    this.rebuildMatrix();
  }

  segmentOf(p: PlanningParticipant): Seg {
    return p.confirmed ? (p.active ? 'ca' : 'na') : 'nc';
  }

  // ---------- Token / completion helpers ----------

  private tokensForQueue(queueId: string): any[] {
    return (this.queueTokens || []).filter(t => t?.['queueref']?.id === queueId);
  }

  private bookedSetForStage(queueId: string, stageName: string): Set<string> {
    const out = new Set<string>();
    this.tokensForQueue(queueId).forEach(t => {
      const pid = t['profile_id'];
      if (!pid) return;
      const slots = t['selectedstageslot'] || {};
      if (slots[stageName] != null) out.add(pid);
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
    this.matrixRows = (this.planningPhases || []).map(phase => {
      const ms = this.memberStagesInScope(phase);
      const compSets = ms.map(s => this.completedSetForStage(s.queueid, s.stagename));
      const bookSets = ms.map(s => this.bookedSetForStage(s.queueid, s.stagename));
      const combine = (sets: Set<string>[], pid: string) =>
        sets.length > 0 && (this.phaseRollupRule === 'any'
          ? sets.some(s => s.has(pid))
          : sets.every(s => s.has(pid)));
      const z = (): SegCounts => ({ ca: 0, na: 0, nc: 0, total: 0 });
      const comp = z(), notc = z(), bk = z(), nbk = z();
      let pop = 0;
      for (const p of this.roster) {
        const sg = this.segmentOf(p);
        pop++;
        const done = combine(compSets, p.profileId);
        const booked = combine(bookSets, p.profileId);
        const inc = (o: SegCounts) => { o[sg]++; o.total++; };
        inc(done ? comp : notc);
        inc(booked ? bk : nbk);
      }
      const pct = pop > 0 ? Math.round((comp.total / pop) * 100) : 0;
      return {
        phase, pct, pop,
        lines: [
          { label: 'Completed', cells: comp },
          { label: 'Not completed', cells: notc },
          { label: 'Slot booked', cells: bk },
          { label: 'Slot not booked', cells: nbk }
        ]
      } as MatrixRow;
    });
  }

  ringDash(pct: number): string {
    return `${Math.round(this.ringCircumference * pct / 100)} ${this.ringCircumference}`;
  }

  // ---------- Drill-down ----------

  selectPhase(phase: any): void {
    this.selectedPhaseKey = this.selectedPhaseKey === phase['docid'] ? null : phase['docid'];
    this.drillSeg = 'all';
  }

  get selectedPhase(): any {
    return this.planningPhases.find(p => p['docid'] === this.selectedPhaseKey) || null;
  }

  setDrillSeg(s: 'all' | Seg): void { this.drillSeg = s; }

  drillRows(): Array<{ name: string; phone: string; seg: Seg; confirmed: boolean; completed: boolean; booked: boolean }> {
    const phase = this.selectedPhase;
    if (!phase) return [];
    const ms = this.memberStagesInScope(phase);
    const compSets = ms.map(s => this.completedSetForStage(s.queueid, s.stagename));
    const bookSets = ms.map(s => this.bookedSetForStage(s.queueid, s.stagename));
    const combine = (sets: Set<string>[], pid: string) =>
      sets.length > 0 && (this.phaseRollupRule === 'any' ? sets.some(s => s.has(pid)) : sets.every(s => s.has(pid)));
    return this.roster
      .filter(p => this.drillSeg === 'all' || this.segmentOf(p) === this.drillSeg)
      .map(p => ({
        name: this.mapProfile?.[p.profileId] || p.profileId,
        phone: this.mapNumber?.[p.profileId] || '',
        seg: this.segmentOf(p),
        confirmed: p.confirmed,
        completed: combine(compSets, p.profileId),
        booked: combine(bookSets, p.profileId)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  segLabel(s: Seg): string {
    return s === 'ca' ? 'Confirmed · Active' : s === 'na' ? 'Confirmed · Non-active' : 'Not confirmed';
  }

  // ---------- Phase config (mirrors the Stagescount card mechanism) ----------

  private loadPhases(): void {
    this.phasesSub?.unsubscribe();
    if (!this.selectedQueueList.length) { this.planningPhases = []; this.rebuildMatrix(); return; }
    this.phasesSub = collectionData(query(
      collection(this.firestore, 'stage opportunity count'),
      where('queuelist', 'array-contains-any', this.selectedQueueList)
    )).subscribe({
      next: (docs: any[]) => {
        this.planningPhases = docs
          .filter(d => d['kind'] === 'phase')
          .filter(d => (d['queuelist'] || []).every((q: string) => this.selectedQueueList.includes(q)))
          .sort((a, b) => (a['sequence'] ?? 999) - (b['sequence'] ?? 999));
        if (this.selectedPhaseKey && !this.planningPhases.some(p => p['docid'] === this.selectedPhaseKey)) {
          this.selectedPhaseKey = null;
        }
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
    this.phaseForm.reset({ phasename: null, stages: [] });
    this.loadStageOptions();
    this.showPhaseForm = true;
  }

  editPhase(phase: any): void {
    this.isEditMode = true;
    this.editingPhase = phase;
    this.loadStageOptions();
    this.phaseForm.patchValue({ phasename: phase['phasename'], stages: phase['stages'] });
    this.showPhaseForm = true;
  }

  submitPhase(): void {
    if (!this.phaseForm.valid) return;
    const values = this.phaseForm.value;
    if (this.isEditMode && this.editingPhase) {
      const docData = { ...this.editingPhase, ...values, queuelist: this.selectedQueueList, kind: 'phase', updated: new Date() };
      updateDoc(doc(this.firestore, 'stage opportunity count', this.editingPhase['docid']), docData)
        .then(() => this.closePhaseForm())
        .catch(err => { console.error('Save phase failed', err); alert('Could not save phase: ' + (err?.code || err?.message || err)); });
    } else {
      const docid = doc(collection(this.firestore, 'stage opportunity count')).id;
      const docData = { ...values, queuelist: this.selectedQueueList, kind: 'phase', docid, sequence: this.planningPhases.length, created: new Date() };
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
    this.phaseForm.reset({ phasename: null, stages: [] });
  }
}
