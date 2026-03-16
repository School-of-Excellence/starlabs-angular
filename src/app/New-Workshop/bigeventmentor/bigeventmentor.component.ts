import { Component, inject, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { collection, doc, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, arrayUnion } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Subject, takeUntil } from 'rxjs';
import { trigger, state, style, transition, animate } from '@angular/animations';

type ProfileStatus = 'reached' | 'registered' | 'notregistered' | 'noteligible';
type LevelStatus = 'current' | 'planning' | 'completed';

interface EventData { id: string; name?: string; venue?: string; address?: string; description?: string; start_date?: any; end_date?: any; lastregistrationdate?: any; [key: string]: any; }
interface Profile { profileid: string; name?: string; customerstatus?: string; [key: string]: any; }
interface BigLevel { docid: string; level: string; category: string; sequence: number; }
interface ParticipantPlanAction { biglevel: string; status: string; moveddate: Date; }
interface LevelParticipant { profileid: string; status: LevelStatus; moveddate: Date; }
interface StatusColumn { key: ProfileStatus; label: string; icon: string; headerClass: string; }

const STATUS_COLUMNS: StatusColumn[] = [
  { key: 'reached', label: 'Reached', icon: 'phone_callback', headerClass: 'reached-header' },
  { key: 'registered', label: 'Registered', icon: 'check_circle_outline', headerClass: 'registered-header' },
  { key: 'notregistered', label: 'Not Registered', icon: 'highlight_off', headerClass: 'notregistered-header' },
  { key: 'noteligible', label: 'Not Eligible', icon: 'block', headerClass: 'noteligible-header' }
];

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];
const STATUS_CONFIG: Record<LevelStatus, { icon: string; color: string }> = {
  current: { icon: 'tag_faces', color: '#0369a1' },
  planning: { icon: 'schedule', color: '#b45309' },
  completed: { icon: 'check_circle', color: '#15803d' }
};

@Component({
  selector: 'app-bigeventmentor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, MatProgressSpinnerModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatButtonModule, MatIconModule, MatTableModule, MatPaginatorModule, MatSortModule, MatMenuModule, MatCheckboxModule, MatDividerModule, MatTooltipModule, NgxMatSelectSearchModule],
  templateUrl: './bigeventmentor.component.html',
  styleUrl: './bigeventmentor.component.css',
  animations: [
    trigger('expandCollapse', [
      state('collapsed', style({ height: '0', overflow: 'hidden', opacity: 0 })),
      state('expanded', style({ height: '*', overflow: 'visible', opacity: 1 })),
      transition('collapsed <=> expanded', animate('300ms ease-in-out'))
    ])
  ]
})
export class BigeventmentorComponent implements OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly destroy$ = new Subject<void>();
  readonly statusColumns = STATUS_COLUMNS;
  readonly levelStatusOptions: LevelStatus[] = ['planning', 'current', 'completed'];
  
  liveeventList: EventData[] = [];
  selectedEvent: EventData | null = null;
  profilelist: Profile[] = [];
  filteredProfilelist: Profile[] = [];
  selectedProfiles: Profile[] = [];
  mapparticipant: Record<string, string> = {};
  sortedLevels: BigLevel[] = [];
  statusData: Record<ProfileStatus, string[]> = { reached: [], registered: [], notregistered: [], noteligible: [] };
  selectedItems: Record<ProfileStatus, string[]> = { reached: [], registered: [], notregistered: [], noteligible: [] };
  levelParticipants: Record<string, LevelParticipant[]> = {};
  selectedLevelItems: Record<string, string[]> = {};
  profilesWithCurrentStatus = new Set<string>();
  profilesWithCompletedStatus = new Set<string>();
  bigeventmentorExists = false;
  participantsLoaded = false;
  isCreating = false;
  biglevelupcount = 0;
  totalParticipantsWithPlan = 0;
  levelupcompleted = 0;
  totalParticipantsCompleted = 0;
  form: FormGroup;
  profileSearchCtrl = new FormControl('');
  private mapLevelToCategory: Record<string, string> = {};
  private mapLevelToSequence: Record<string, number> = {};
  private bigjourney: string[] = [];

  // New properties for filters and expand/collapse
  selectedStatusFilters: LevelStatus[] = [];
  selectedLevelFilters: string[] = [];
  statusSectionExpanded = true;

  constructor(public guard: AuthguardService, public router: Router, private fb: FormBuilder) {
    this.form = this.fb.group({ event: [null] });
    this.profileSearchCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(v => this.applyProfileFilters(v || ''));
    this.initializeData();
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // Get filtered levels based on status filter and level filter
  get filteredLevels(): BigLevel[] {
    let levels = this.sortedLevels;
    
    // Filter by selected levels
    if (this.selectedLevelFilters.length > 0) {
      levels = levels.filter(l => this.selectedLevelFilters.includes(l.docid));
    }
    
    // Filter by status (show only levels that have participants with selected statuses)
    if (this.selectedStatusFilters.length > 0) {
      levels = levels.filter(level => {
        const participants = this.levelParticipants[level.docid] || [];
        return participants.some(p => this.selectedStatusFilters.includes(p.status));
      });
    }
    
    return levels;
  }

  // Get filtered participants for a level based on status filter
  getFilteredLevelParticipants(levelDocId: string): LevelParticipant[] {
    const participants = this.levelParticipants[levelDocId] || [];
    if (this.selectedStatusFilters.length === 0) {
      return participants;
    }
    return participants.filter(p => this.selectedStatusFilters.includes(p.status));
  }

  toggleStatusSection(): void {
    this.statusSectionExpanded = !this.statusSectionExpanded;
  }

  onStatusFilterChange(): void {
    // Clear level selections when filter changes
    this.sortedLevels.forEach(l => this.selectedLevelItems[l.docid] = []);
  }

  onLevelFilterChange(): void {
    // Clear level selections when filter changes
    this.sortedLevels.forEach(l => this.selectedLevelItems[l.docid] = []);
  }

  clearFilters(): void {
    this.selectedStatusFilters = [];
    this.selectedLevelFilters = [];
  }

  private async initializeData(): Promise<void> {
    try {
      const [eventsSnap, journeysSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'event collection'), where('atcmodel', '==', 'B!G'))),
        getDocs(query(collection(this.firestore, 'journey'), where('atcmodel', '==', 'B!G')))
      ]);
      
      this.liveeventList = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EventData));
      this.bigjourney = journeysSnap.docs.map(d => d.id);
      
      const [activeSnap, nonActiveSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'participant metadata'), where('customerstatus', '==', 'active'), where('activejourney', 'in', this.bigjourney))),
        getDocs(query(collection(this.firestore, 'participant metadata'), where('customerstatus', '==', 'non active'), where('lastcompletedjourney', 'in', this.bigjourney)))
      ]);
      
      [...activeSnap.docs, ...nonActiveSnap.docs].forEach(d => {
        const data = d.data();
        this.mapparticipant[d.id] = data['name'];
        this.profilelist.push({ profileid: d.id, ...data } as Profile);
      });
      
      this.filteredProfilelist = [...this.profilelist];
      this.participantsLoaded = true;
      await this.loadBigLevels();
    } catch (e) { console.error('Init error:', e); }
  }

  private async loadBigLevels(): Promise<void> {
    const snap = await getDocs(query(collection(this.firestore, 'biglevel'), orderBy('sequence', 'asc')));
    const levels: BigLevel[] = [];
    snap.docs.forEach(d => {
      const el = d.data();
      const level: BigLevel = { docid: el['docid'], level: el['level'], category: el['category'], sequence: el['sequence'] || 0 };
      levels.push(level);
      this.mapLevelToCategory[level.docid] = level.category;
      this.mapLevelToSequence[level.docid] = level.sequence;
      this.selectedLevelItems[level.docid] = [];
      this.levelParticipants[level.docid] = [];
    });
    this.sortedLevels = levels.sort((a, b) => b.sequence - a.sequence);
  }

  async onEventChange(eventId: string): Promise<void> {
    this.resetState();
    try {
      const snap = await getDoc(doc(this.firestore, 'bigeventmentor', eventId));
      if (snap.exists()) {
        const data = snap.data();
        this.selectedEvent = { id: snap.id, ...data } as EventData;
        this.bigeventmentorExists = true;
        (['reached', 'registered', 'notregistered', 'noteligible'] as ProfileStatus[]).forEach(k => this.statusData[k] = data[k] ?? []);
        await this.loadLevelParticipants(eventId);
      } else {
        this.selectedEvent = this.liveeventList.find(e => e.id === eventId) ?? null;
      }
      this.applyProfileFilters();
    } catch (e) { console.error('Event load error:', e); }
  }

  private async loadLevelParticipants(eventId: string): Promise<void> {
    const snap = await getDocs(query(collection(this.firestore, 'bigeventparticipantsplan'), where('eventid', '==', eventId)));
    this.sortedLevels.forEach(l => this.levelParticipants[l.docid] = []);
    this.profilesWithCurrentStatus.clear();
    this.profilesWithCompletedStatus.clear();
    let totalDifference = 0;
    let participantsWithBothStatuses = 0;
    let completedDifference = 0;
    let participantsCompleted = 0;
    
    snap.docs.forEach(d => {
      const data = d.data();
      const profileId = data['profileid'];
      const actions = (data['actions'] as ParticipantPlanAction[]) || [];
      const mostRecent: Record<string, { levelDocId: string; moveddate: Date; idx: number }> = {};
      
      actions.forEach((a, i) => {
        if (a.status === 'current') this.profilesWithCurrentStatus.add(profileId);
        if (a.status === 'completed') this.profilesWithCompletedStatus.add(profileId);
        if (!mostRecent[a.status] || i > mostRecent[a.status].idx) {
          mostRecent[a.status] = { levelDocId: a.biglevel, moveddate: a.moveddate, idx: i };
        }
      });
      if (mostRecent['current'] && mostRecent['planning']) {
        const currentSeq = this.mapLevelToSequence[mostRecent['current'].levelDocId] || 0;
        const planningSeq = this.mapLevelToSequence[mostRecent['planning'].levelDocId] || 0;
        const diff = currentSeq - planningSeq;
        totalDifference += diff;
        participantsWithBothStatuses++;
      }
      if (mostRecent['planning'] && mostRecent['completed'] && mostRecent['current']) {
        const currentSeq = this.mapLevelToSequence[mostRecent['current'].levelDocId] || 0;
        const planningSeq = this.mapLevelToSequence[mostRecent['planning'].levelDocId] || 0;
        const completedSeq = this.mapLevelToSequence[mostRecent['completed'].levelDocId] || 0;
        completedDifference += currentSeq - completedSeq;
        participantsCompleted++;
      }
      
      Object.entries(mostRecent).forEach(([status, { levelDocId, moveddate }]) => {
        if (this.levelParticipants[levelDocId] && !this.levelParticipants[levelDocId].some(p => p.profileid === profileId && p.status === status)) {
          this.levelParticipants[levelDocId].push({ profileid: profileId, status: status as LevelStatus, moveddate });
        }
      });
    });
    
    this.biglevelupcount = totalDifference;
    this.totalParticipantsWithPlan = participantsWithBothStatuses;
    this.levelupcompleted = completedDifference;
    this.totalParticipantsCompleted = participantsCompleted;
  }

  private resetState(): void {
    this.selectedEvent = null;
    this.bigeventmentorExists = false;
    this.selectedProfiles = [];
    this.statusData = { reached: [], registered: [], notregistered: [], noteligible: [] };
    this.selectedItems = { reached: [], registered: [], notregistered: [], noteligible: [] };
    this.profilesWithCurrentStatus.clear();
    this.profilesWithCompletedStatus.clear();
    this.biglevelupcount = 0;
    this.totalParticipantsWithPlan = 0;
    this.levelupcompleted = 0;
    this.totalParticipantsCompleted = 0;
    this.sortedLevels.forEach(l => { this.levelParticipants[l.docid] = []; this.selectedLevelItems[l.docid] = []; });
    // Reset filters
    this.selectedStatusFilters = [];
    this.selectedLevelFilters = [];
  }

  async createBigEventMentor(): Promise<void> {
    if (!this.selectedEvent?.id) return;
    this.isCreating = true;
    try {
      const { id, ...eventData } = this.selectedEvent;
      await setDoc(doc(this.firestore, 'bigeventmentor', id), { ...eventData, reached: [], registered: [], notregistered: [], noteligible: [], createdAt: new Date() });
      this.bigeventmentorExists = true;
      this.applyProfileFilters();
    } catch (e) { console.error('Create error:', e); }
    finally { this.isCreating = false; }
  }
  applyProfileFilters(search = ''): void {
    const assigned = new Set([
      ...this.statusData.reached, ...this.statusData.registered, ...this.statusData.notregistered, ...this.statusData.noteligible,
      ...Object.values(this.levelParticipants).flatMap(p => p.map(x => x.profileid))
    ]);
    const s = search.toLowerCase();
    this.filteredProfilelist = this.profilelist.filter(p => !assigned.has(p.profileid) && (!s || p.name?.toLowerCase().includes(s) || p.customerstatus?.toLowerCase().includes(s)));
  }
  async assignProfiles(status: ProfileStatus): Promise<void> {
    if (!this.selectedEvent?.id || !this.selectedProfiles.length) return;
    try {
      const newIds = this.selectedProfiles.map(p => p.profileid);
      const merged = [...new Set([...this.statusData[status], ...newIds])];
      await updateDoc(doc(this.firestore, 'bigeventmentor', this.selectedEvent.id), { [status]: merged });
      this.statusData[status] = merged;
      this.selectedProfiles = [];
      this.applyProfileFilters(this.profileSearchCtrl.value || '');
    } catch (e) { console.error('Assign error:', e); }
  }

  async moveSelected(from: ProfileStatus, to: ProfileStatus): Promise<void> {
    if (!this.selectedEvent?.id || !this.selectedItems[from].length) return;
    if (!confirm(`Move ${this.selectedItems[from].length} participant(s) to "${this.getStatusLabel(to)}"?`)) return;
    try {
      const ids = [...this.selectedItems[from]];
      this.statusData[from] = this.statusData[from].filter(id => !ids.includes(id));
      this.statusData[to] = [...new Set([...this.statusData[to], ...ids])];
      await updateDoc(doc(this.firestore, 'bigeventmentor', this.selectedEvent.id), { [from]: this.statusData[from], [to]: this.statusData[to] });
      this.selectedItems[from] = [];
      this.applyProfileFilters(this.profileSearchCtrl.value || '');
    } catch (e) { console.error('Move error:', e); }
  }

  async moveSelectedToLevel(from: ProfileStatus, toLevelDocId: string, status: LevelStatus): Promise<void> {
    if (!this.selectedEvent?.id || !this.selectedItems[from].length || from !== 'reached') return;
    let ids = [...this.selectedItems[from]];
    
    if (status === 'current') {
      const withCurrent = ids.filter(id => this.profilesWithCurrentStatus.has(id));
      if (withCurrent.length) {
        alert(`Skipping participants with "Current" status: ${withCurrent.map(id => this.mapparticipant[id] || id).join(', ')}`);
        ids = ids.filter(id => !this.profilesWithCurrentStatus.has(id));
      }
      if (!ids.length) return;
    }
    
    const levelName = this.sortedLevels.find(l => l.docid === toLevelDocId)?.level || toLevelDocId;
    if (!confirm(`Move ${ids.length} participant(s) to "${levelName}" as "${status}"?`)) return;
    
    try {
      const now = new Date();
      for (const profileId of ids) {
        const docId = `${profileId}_${this.selectedEvent.id}`;
        const ref = doc(this.firestore, 'bigeventparticipantsplan', docId);
        const snap = await getDoc(ref);
        const action: ParticipantPlanAction = { biglevel: toLevelDocId, status, moveddate: now };
        
        if (snap.exists()) await updateDoc(ref, { actions: arrayUnion(action) });
        else await setDoc(ref, { profileid: profileId, eventid: this.selectedEvent.id, createddate: now, actions: [action] });
        
        if (status === 'current') this.profilesWithCurrentStatus.add(profileId);
        if (status === 'completed') this.profilesWithCompletedStatus.add(profileId);
      }
      
      this.levelParticipants[toLevelDocId] = [
        ...this.levelParticipants[toLevelDocId].filter(p => !ids.includes(p.profileid) || p.status !== status),
        ...ids.map(profileid => ({ profileid, status, moveddate: now }))
      ];
      this.selectedItems[from] = [];
      this.recalculateBigLevelPlanCount();
      this.applyProfileFilters(this.profileSearchCtrl.value || '');
    } catch (e) { console.error('Move to level error:', e); }
  }

  async moveLevelToLevel(fromLevelDocId: string, toLevelDocId: string, status: LevelStatus): Promise<void> {
    if (!this.selectedEvent?.id || !this.selectedLevelItems[fromLevelDocId]?.length) return;
    const ids = [...this.selectedLevelItems[fromLevelDocId]];
    const levelName = this.sortedLevels.find(l => l.docid === toLevelDocId)?.level || toLevelDocId;
    if (!confirm(`Move ${ids.length} participant(s) to "${levelName}" as "${status}"?`)) return;
    
    try {
      const now = new Date();
      const movingParticipants = this.levelParticipants[fromLevelDocId].filter(p => ids.includes(p.profileid));
      
      for (const profileId of ids) {
        const docId = `${profileId}_${this.selectedEvent.id}`;
        const ref = doc(this.firestore, 'bigeventparticipantsplan', docId);
        const snap = await getDoc(ref);
        const action: ParticipantPlanAction = { biglevel: toLevelDocId, status, moveddate: now };
        
        if (snap.exists()) await updateDoc(ref, { actions: arrayUnion(action) });
        else await setDoc(ref, { profileid: profileId, eventid: this.selectedEvent.id, createddate: now, actions: [action] });
        
        if (status === 'current') this.profilesWithCurrentStatus.add(profileId);
        if (status === 'completed') this.profilesWithCompletedStatus.add(profileId);
      }
      
      ids.forEach(profileid => {
        const old = movingParticipants.find(p => p.profileid === profileid);
        if (old?.status === status) this.levelParticipants[fromLevelDocId] = this.levelParticipants[fromLevelDocId].filter(p => p.profileid !== profileid);
        this.levelParticipants[toLevelDocId] = this.levelParticipants[toLevelDocId].filter(p => !(p.profileid === profileid && p.status === status));
        this.levelParticipants[toLevelDocId].push({ profileid, status, moveddate: now });
      });
      
      this.selectedLevelItems[fromLevelDocId] = [];
      this.recalculateBigLevelPlanCount();
      this.applyProfileFilters(this.profileSearchCtrl.value || '');
    } catch (e) { console.error('Level move error:', e); }
  }

  private recalculateBigLevelPlanCount(): void {
    const profileStatuses: Record<string, { current?: string; planning?: string; completed?: string }> = {};
    
    this.sortedLevels.forEach(level => {
      this.levelParticipants[level.docid]?.forEach(p => {
        if (!profileStatuses[p.profileid]) profileStatuses[p.profileid] = {};
        if (p.status === 'current') profileStatuses[p.profileid].current = level.docid;
        if (p.status === 'planning') profileStatuses[p.profileid].planning = level.docid;
        if (p.status === 'completed') profileStatuses[p.profileid].completed = level.docid;
      });
    });
    
    let totalDifference = 0;
    let participantsWithBothStatuses = 0;
    let completedDifference = 0;
    let participantsCompleted = 0;
    
    Object.values(profileStatuses).forEach(statuses => {
      if (statuses.current && statuses.planning) {
        const currentSeq = this.mapLevelToSequence[statuses.current] || 0;
        const planningSeq = this.mapLevelToSequence[statuses.planning] || 0;
        totalDifference += currentSeq - planningSeq;
        participantsWithBothStatuses++;
      }
      
      if (statuses.planning && statuses.completed && statuses.current) {
        const currentSeq = this.mapLevelToSequence[statuses.current] || 0;
        const planningSeq = this.mapLevelToSequence[statuses.planning] || 0;
        const completedSeq = this.mapLevelToSequence[statuses.completed] || 0;
        completedDifference += currentSeq - completedSeq;
        participantsCompleted++;
      }
    });
    
    this.biglevelupcount = totalDifference;
    this.totalParticipantsWithPlan = participantsWithBothStatuses;
    this.levelupcompleted = completedDifference;
    this.totalParticipantsCompleted = participantsCompleted;
  }

  async removeSelected(status: ProfileStatus): Promise<void> {
    if (!this.selectedEvent?.id || !this.selectedItems[status].length) return;
    if (!confirm(`Remove ${this.selectedItems[status].length} participant(s) from "${this.getStatusLabel(status)}"?`)) return;
    try {
      const toRemove = new Set(this.selectedItems[status]);
      this.statusData[status] = this.statusData[status].filter(id => !toRemove.has(id));
      await updateDoc(doc(this.firestore, 'bigeventmentor', this.selectedEvent.id), { [status]: this.statusData[status] });
      this.selectedItems[status] = [];
      this.applyProfileFilters(this.profileSearchCtrl.value || '');
    } catch (e) { console.error('Remove error:', e); }
  }

  async removeParticipant(status: ProfileStatus, id: string): Promise<void> {
    if (!this.selectedEvent?.id || !confirm(`Remove "${this.mapparticipant[id] || id}" from "${this.getStatusLabel(status)}"?`)) return;
    try {
      this.statusData[status] = this.statusData[status].filter(pid => pid !== id);
      this.selectedItems[status] = this.selectedItems[status].filter(pid => pid !== id);
      await updateDoc(doc(this.firestore, 'bigeventmentor', this.selectedEvent.id), { [status]: this.statusData[status] });
      this.applyProfileFilters(this.profileSearchCtrl.value || '');
    } catch (e) { console.error('Remove error:', e); }
  }

  async removeLevelSelected(levelDocId: string): Promise<void> {
    if (!this.selectedEvent?.id || !this.selectedLevelItems[levelDocId]?.length) return;
    const toRemove = this.levelParticipants[levelDocId].filter(p => this.selectedLevelItems[levelDocId].includes(p.profileid));
    const levelName = this.sortedLevels.find(l => l.docid === levelDocId)?.level || levelDocId;
    if (!confirm(`Remove ${toRemove.length} participant(s) from "${levelName}"?`)) return;
    
    try {
      for (const p of toRemove) await this.removeStatusFromFirestore(p.profileid, p.status);
      this.levelParticipants[levelDocId] = this.levelParticipants[levelDocId].filter(p => !this.selectedLevelItems[levelDocId].includes(p.profileid));
      this.updateStatusSets();
      this.selectedLevelItems[levelDocId] = [];
      this.recalculateBigLevelPlanCount();
      this.applyProfileFilters(this.profileSearchCtrl.value || '');
    } catch (e) { console.error('Remove error:', e); }
  }

  async removeLevelParticipant(levelDocId: string, id: string): Promise<void> {
    if (!this.selectedEvent?.id) return;
    const p = this.levelParticipants[levelDocId]?.find(x => x.profileid === id);
    if (!p || !confirm(`Remove "${this.mapparticipant[id] || id}" (${p.status}) from this level?`)) return;
    
    try {
      await this.removeStatusFromFirestore(id, p.status);
      this.levelParticipants[levelDocId] = this.levelParticipants[levelDocId].filter(x => x.profileid !== id);
      this.selectedLevelItems[levelDocId] = this.selectedLevelItems[levelDocId]?.filter(x => x !== id) || [];
      this.updateStatusSets();
      this.recalculateBigLevelPlanCount();
      this.applyProfileFilters(this.profileSearchCtrl.value || '');
    } catch (e) { console.error('Remove error:', e); }
  }

  private async removeStatusFromFirestore(profileId: string, status: string): Promise<void> {
    if (!this.selectedEvent?.id) return;
    const ref = doc(this.firestore, 'bigeventparticipantsplan', `${profileId}_${this.selectedEvent.id}`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const filtered = ((snap.data()['actions'] as ParticipantPlanAction[]) || []).filter(a => a.status !== status);
      await updateDoc(ref, { actions: filtered });
    }
  }

  private updateStatusSets(): void {
    this.profilesWithCurrentStatus.clear();
    this.profilesWithCompletedStatus.clear();
    this.sortedLevels.forEach(l => this.levelParticipants[l.docid]?.forEach(p => {
      if (p.status === 'current') this.profilesWithCurrentStatus.add(p.profileid);
      if (p.status === 'completed') this.profilesWithCompletedStatus.add(p.profileid);
    }));
  }

  isSelected(status: ProfileStatus, id: string): boolean { return this.selectedItems[status].includes(id); }
  isSelectedLevel(levelDocId: string, id: string): boolean { return this.selectedLevelItems[levelDocId]?.includes(id) ?? false; }
  
  toggleSelect(status: ProfileStatus, id: string): void {
    const idx = this.selectedItems[status].indexOf(id);
    idx === -1 ? this.selectedItems[status].push(id) : this.selectedItems[status].splice(idx, 1);
  }
  
  toggleSelectLevel(levelDocId: string, id: string): void {
    this.selectedLevelItems[levelDocId] ??= [];
    const idx = this.selectedLevelItems[levelDocId].indexOf(id);
    idx === -1 ? this.selectedLevelItems[levelDocId].push(id) : this.selectedLevelItems[levelDocId].splice(idx, 1);
  }

  getSelectableIds(status: ProfileStatus): string[] {
    return status === 'reached' ? this.statusData.reached.filter(id => !this.profilesWithCompletedStatus.has(id)) : this.statusData[status];
  }

  isAllSelected(status: ProfileStatus): boolean {
    const selectable = this.getSelectableIds(status);
    return selectable.length > 0 && this.selectedItems[status].length === selectable.length;
  }

  isPartialSelected(status: ProfileStatus): boolean {
    const sel = this.selectedItems[status].length;
    return sel > 0 && sel < this.getSelectableIds(status).length;
  }

  toggleSelectAll(status: ProfileStatus): void {
    this.selectedItems[status] = this.isAllSelected(status) ? [] : [...this.getSelectableIds(status)];
  }

  getSelectableLevelIds(levelDocId: string): string[] {
    return this.getFilteredLevelParticipants(levelDocId)?.filter(p => this.canSelectParticipant(levelDocId, p.profileid, p.status)).map(p => p.profileid) || [];
  }

  isAllSelectedLevel(levelDocId: string): boolean {
    const selectable = this.getSelectableLevelIds(levelDocId);
    return selectable.length > 0 && (this.selectedLevelItems[levelDocId]?.length ?? 0) === selectable.length;
  }

  isPartialSelectedLevel(levelDocId: string): boolean {
    const sel = this.selectedLevelItems[levelDocId]?.length ?? 0;
    return sel > 0 && sel < this.getSelectableLevelIds(levelDocId).length;
  }

  toggleSelectAllLevel(levelDocId: string): void {
    this.selectedLevelItems[levelDocId] = this.isAllSelectedLevel(levelDocId) ? [] : [...this.getSelectableLevelIds(levelDocId)];
  }
  canSelectInReached(id: string): boolean { return !this.profilesWithCompletedStatus.has(id); }
  
  canRemoveFromReached(id: string): boolean { return !this.profilesWithCurrentStatus.has(id); }

  canSelectParticipant(levelDocId: string, profileId: string, status: LevelStatus): boolean {
    if (this.profilesWithCompletedStatus.has(profileId) || status === 'completed') return false;
    if (status === 'current') return !this.sortedLevels.some(l => this.levelParticipants[l.docid]?.some(p => p.profileid === profileId && p.status === 'planning'));
    return true;
  }

  canRemoveFromLevel(profileId: string, status: LevelStatus): boolean {
    if (status === 'completed') return false;
    if (status === 'current') return !this.sortedLevels.some(l => this.levelParticipants[l.docid]?.some(p => p.profileid === profileId && p.status === 'planning'));
    if (status === 'planning') return !this.profilesWithCompletedStatus.has(profileId);
    return true;
  }

  hasAnySelectedWithCurrentStatus(): boolean { return this.selectedItems.reached.some(id => this.profilesWithCurrentStatus.has(id)); }
  allSelectedHaveCurrentStatus(): boolean { return this.selectedItems.reached.length > 0 && this.selectedItems.reached.every(id => this.profilesWithCurrentStatus.has(id)); }
  
  allSelectedHavePlanningStatus(levelDocId: string): boolean {
    const sel = this.selectedLevelItems[levelDocId] || [];
    if (!sel.length) return false;
    return sel.every(id => this.levelParticipants[levelDocId]?.find(p => p.profileid === id)?.status === 'planning');
  }

  getLevelParticipants(levelDocId: string): LevelParticipant[] { return this.levelParticipants[levelDocId] || []; }
  getStatusLabel(status: ProfileStatus): string { return STATUS_COLUMNS.find(c => c.key === status)?.label || status; }
  getStatusIcon(status: LevelStatus): string { return STATUS_CONFIG[status]?.icon || 'help'; }
  getStatusColor(status: LevelStatus): string { return STATUS_CONFIG[status]?.color || '#666'; }
  getInitial(id: string): string { return this.mapparticipant[id]?.charAt(0).toUpperCase() || '?'; }
  
  getAvatarColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  formatDate(ts: any): string {
    return ts?.seconds ? new Date(ts.seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  }

  getOtherStatuses(current: ProfileStatus): ProfileStatus[] {
    return (['reached', 'registered', 'notregistered', 'noteligible'] as ProfileStatus[]).filter(s => s !== current);
  }

  getOtherLevels(currentDocId: string): BigLevel[] {
    return this.sortedLevels.filter(l => l.docid !== currentDocId);
  }

  getCurrentLevel(docid: string): BigLevel | undefined {
    return this.sortedLevels.find(l => l.docid === docid);
  }

  getTotalStatusCount(): number {
    return this.statusData.reached.length + this.statusData.registered.length + 
           this.statusData.notregistered.length + this.statusData.noteligible.length;
  }
}