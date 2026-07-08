import { Component } from '@angular/core';
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { collection, collectionData, Firestore, getDoc, getDocs, orderBy, query, where, doc, deleteDoc, setDoc, updateDoc } from '@angular/fire/firestore';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { takeUntil } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EventOpportunityComponent } from './event-opportunity/event-opportunity.component';
import { EventsStageDataComponent } from '../../Events/events-stage-data/events-stage-data.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-event-opportunity-dashboard',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    EventOpportunityComponent,
    MatDialogModule,
    MatTooltipModule,
    MatIconModule,
    MatDatepickerModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    DragDropModule,
    MatMenuModule,
    MatChipsModule,
    EventsStageDataComponent
  ],
  templateUrl: './event-opportunity-dashboard.component.html',
  styleUrl: './event-opportunity-dashboard.component.css'
})
export class EventOpportunityDashboardComponent {

  showDetailPanel: boolean = false;
  selectedPanelQueueId: string = '';
  selectedPanelStage: string = '';
  selectedPanelQueue: any = null;
  panelFilter: 'all' | 'live' | 'idle' | 'completed-today' | 'completed-all' = 'all';

  // Top-level tab: the live board vs the planning view
  activeTab: 'board' | 'planning' = 'board';
  planningRefreshKey = 0;

  // Search
  completedSearchText: string = '';

  // Date Range Filter 
  fromDate: Date | null = null;
  toDate: Date | null = null;

  // Group by Studio
  groupByStudio: boolean = false;
  groupByActivity: boolean = false;
  expandedActivityGroups: { [key: string]: boolean } = {};

  expandedStudioGroups: { [key: string]: boolean } = {};
  isLiveExpanded: boolean = true;
  isIdleExpanded: boolean = false;
  isShadowingExpanded: boolean = false;
  isNotShadowingExpanded: boolean = false;
  isNoStudioShadowingExpanded: boolean = false;
  eventCohorts: { [eventId: string]: Array<{ bigactivity: string, participantidlist: string[] }> } = {};

  // Custom Stage Panel
  showCustomStagePanel: boolean = false;
  selectedCustomStage: any = null;
  customStageSearchText: string = '';

  selectedQueueList: string[] = []
  /** Planning tab's OWN, independent queue selection (separate from the Board's). */
  planningQueues: string[] = []
  /** Union of Board + Planning selections — the set data is actually loaded for. */
  get loadedQueues(): string[] { return [...new Set([...this.selectedQueueList, ...this.planningQueues])]; }
  queueList: any[]
  mapQueue = {}
  showQueueSelect: boolean = true
  mapData = {}
  mapLiveAssignmentData = {};
  mapProfile = {}
  mapEmail = {}
  mapNumber = {}
  stageSubscription: Subscription
  isContainerOpen: boolean = true;
  customValuesFromSelectedQueues = []
  completedStageCount = {}
  allCompletedStageCount = {}

  updatestages = [];
  notesForm: FormGroup;

  showCreateOpportunity: boolean = false;
  editingStageOpportunity: any = null;
  isEditMode: boolean = false;

  queueTokens: any[] = [];
  /** The single live queue_token listener. Re-created (and the previous one torn down)
   *  on every queue-selection change so exactly ONE listener is ever active — otherwise
   *  stacked listeners for different queue sets race to overwrite queueTokens and the
   *  counts become nondeterministic (differ machine-to-machine by click history). */
  private queueTokensSub?: Subscription;
  developerRole:boolean = false;
  currentProfileId: string = '';
  queueTokenMap: Map<string, any> = new Map();
  selectedProductFilter: string | null = null;
  expandedStages: Set<string> = new Set();
  private subscription = new Subject<void>()

  eventList:any[]=[]
  arenaeticket:any[]=[]
  mapEvent = {}

  // ===== Studio Watch =====================================================
  // A right-side panel that surfaces studios which have been occupied too long
  // and are holding up the queue. Two sources feed it (matching the Arena's
  // JOINED / ACTIVE columns):
  //   • JOINED  — participant pulled into the studio (no Zoom start yet) more
  //               than 4h ago  → measure from the live-assignment `created`.
  //   • ACTIVE  — the call has started; measure from `specialistJoinedAt`. We
  //               still flag it even when the call itself has ended (the
  //               assignment is `live` so the studio is not yet freed).
  // Only `status === 'live'` assignments count — a completed assignment has
  // already freed its studio.
  private readonly STUDIO_WATCH_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
  studioWatchOpen = false;         // collapsed pill by default; user expands
  private studioWatchTick = 0;     // bumped by a timer so elapsed labels refresh
  private studioWatchTimer: any = null;

  filteredProfileIds: Set<string> = new Set();
  selectedEventName: string = '';

  selectedStages: string[] = [];
  showStageConfig: boolean = false;
  hideParticipants: boolean = false;
  private initializedStagesPerQueue: Set<string> = new Set();
  private seenStageKeys: Set<string> = new Set();

  isStageVisibleOnScreen(queueid: string, stage: string): boolean {
    const opp = this.getStageTokenCount(queueid, stage, 'waiting') + this.getStageTokenCount(queueid, stage, 'queued');
    const studio = this.getStageTokenCount(queueid, stage, 'instudio') + this.getStageStudioIdleLength(queueid, stage);
    return opp > 0 || studio > 0;
  }

  toggleStageSelection(queueid: string, stage: string): void {
    const key = this.stageKey(queueid, stage);
    const idx = this.selectedStages.indexOf(key);
    if (idx >= 0) this.selectedStages.splice(idx, 1);
    else this.selectedStages.push(key);
  }

  getAvailableStages(): { queueid: string, queuename: string, stage: string }[] {
    const out: { queueid: string, queuename: string, stage: string }[] = [];
    for (const queueid of this.selectedQueueList) {
      const stages = this.mapData[queueid]?.['stages'] || [];
      for (const stage of stages) {
        const opp = this.getStageTokenCount(queueid, stage, 'waiting') + this.getStageTokenCount(queueid, stage, 'queued');
        const studio = this.getStageTokenCount(queueid, stage, 'instudio') + this.getStageStudioIdleLength(queueid, stage);
        if (opp === 0 && studio === 0) continue;
        out.push({ queueid, queuename: this.mapQueue[queueid]?.['queuename'] ?? queueid, stage });
      }
    }
    return out;
  }

  stageKey(queueid: string, stage: string): string {
    return `${queueid}::${stage}`;
  }

  isStageSelected(queueid: string, stage: string): boolean {
    return this.selectedStages.length === 0 || this.selectedStages.includes(this.stageKey(queueid, stage));
  }

  constructor(
    private firestore: Firestore,
    public guard: AuthguardService,
    private router: Router,
    public dialog: MatDialog,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute
  ) {
    if (this.route.snapshot.data['defaultTab'] === 'planning') {
      this.activeTab = 'planning';
    }

    this.notesForm = this.fb.group({
      stagename: [null, Validators.required],
      stage: [[], [Validators.required, Validators.minLength(1)]]
    })
    this.guard.getProfileMap().then(data => {
      this.mapProfile = data.map;
      this.mapNumber = data.phonenumber;
      this.mapEmail = data.email
    });

    guard.getRoles().then(async roleData => {
      // if (roleData["floor"] || roleData["ah"] || roleData["admin"] || roleData["mentor"] || roleData["developer"]) {
        if (roleData["developer"]) {
          this.developerRole = true;
        }
        this.currentProfileId = roleData?.['profile_ref']?.id || '';
        this.getQueueData()
      // } else {
      //   this.router.navigateByUrl("/")
      // }
    })

    // Refresh Studio Watch elapsed labels every 30s (Xh Ym granularity).
    this.studioWatchTimer = setInterval(() => { this.studioWatchTick++; }, 30000);
  }

  ngOnDestroy() {
    if (this.studioWatchTimer) clearInterval(this.studioWatchTimer);
    this.queueTokensSub?.unsubscribe();
    this.subscription.complete();
    this.subscription.next();
  }

  setActiveTab(tab: 'board' | 'planning'): void {
    // Both tabs stay alive (toggled via [hidden]) so switching never reloads/refetches.
    // Data stays fresh through queue-selection changes, not tab switches.
    this.activeTab = tab;
  }

  /** Queue selection coming from the Planning tab's own queue filter. */
  onPlanningQueueChange(ids: string[]): void {
    this.selectedQueueList = [...(ids || [])];
    this.getselectedStages();
    this.fetchQueueTokens();
    this.planningRefreshKey++;
  }
  print() {
    if (!this.selectedCustomStage) {
      this.snackBar.open('No stage selected to print', 'Close', { duration: 3000 });
      return;
    }
    const rows: string[][] = [];
    rows.push(['Stage Name', 'Queue Name', 'Participant Name', 'Product', 'Phone' , 'Mail']);

    const stages = this.getParticipantsByStage();

    stages.forEach(stage => {
      stage.participants.forEach(p => {
        rows.push([
          stage.stageName,
          stage.queueName,
          p.name,
          p.productName,
          this.mapNumber[p.profileId],
          this.mapEmail[p.profileId]
        ]);
      });
    });

    if (rows.length === 1) {
      this.snackBar.open('No participants to export', 'Close', { duration: 3000 });
      return;
    }

    const csvContent = rows
      .map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    this.downloadCSV(
      csvContent,
      `${this.selectedCustomStage.stagename}_participants.csv`
    );
  }
  private downloadCSV(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  onEventSelect(event: any) {
    console.log('selected Event ref:', event.ref);
    this.selectedEventName = event.name;
    
    const snackRef = this.snackBar.open(
      'Filtering… please wait',
      undefined,
      {
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: ['loading-snackbar']
      }
    );
    
    getDocs(query(collection(this.firestore,'arena e-ticket'), where('eventref','==',event.ref),where('active','==',true))).then(snap => {
      const map = new Map<string, any>();
      snap.docs.forEach(e => {
        const element: any = e.data();
        const profileId = element.profileid;
        if (!profileId) return;

        element.id = e.id;
        element.ref = e.ref;

        map.set(profileId, element);
      });

      this.arenaeticket = Array.from(map.values());
      
      this.filteredProfileIds = new Set(
        this.arenaeticket
          .map(ticket => ticket['profileid'])
          .filter(id => id != null)
      );
      
      console.log('Filtered Profile IDs:', Array.from(this.filteredProfileIds));
      snackRef.dismiss();
    }).catch(err => {
      snackRef.dismiss();
      this.snackBar.open('Failed to filter data', 'Close', {
        duration: 3000
      });
      console.error(err);
    });
  }
  clearEventFilter() {
    this.filteredProfileIds.clear();
    this.selectedEventName = '';
    this.arenaeticket = [];
  }

  async loadEventCohorts() {
    const now = new Date();
    const marathons = await getDocs(query(
      collection(this.firestore, 'big marathon'),
      where('startdate', '<=', now)
    ));
    const activeMarathonRefs = marathons.docs
      .filter(d => {
        const end = d.data()['enddate'];
        const endDate = end?.toDate ? end.toDate() : (end ? new Date(end) : null);
        return endDate && endDate >= now;
      })
      .map(d => d.ref);

    if (!activeMarathonRefs.length) return;

    const cohortsSnap = await getDocs(query(
      collection(this.firestore, 'big cohorts'),
      where('marathonref', 'in', activeMarathonRefs),
      where('cohortType', '==', 'event'),
      where('status', '==', 'active')
    ));

    const map: { [eventId: string]: Array<{ bigactivity: string, participantidlist: string[] }> } = {};
    cohortsSnap.docs.forEach(d => {
      const data: any = d.data();
      const eventRef = data['eventref'];
      const eventId = typeof eventRef === 'string' ? eventRef : eventRef?.id;
      if (!eventId || !data['bigactivity']) return;
      map[eventId] = map[eventId] || [];
      map[eventId].push({
        bigactivity: data['bigactivity'],
        participantidlist: data['participantidlist'] || [],
      });
    });
    this.eventCohorts = map;
  }

  getQueueData() {
    this.loadEventCohorts();
    getDocs(query(collection(this.firestore, 'queue generation'), where("queueenddate", ">=", new Date()))).then(async queueData => {
      this.queueList = queueData.docs.map(e => e.data())
      for (let i = 0; i < this.queueList.length; i++) {
        const element = this.queueList[i];
        element['docref'] = doc(this.firestore, 'queue generation', element['docid'])
        this.mapQueue[element['docid']] = element
      }
    })
    getDocs(query(collection(this.firestore,'event collection'), orderBy('start_date','desc'))).then(snap =>{
        this.eventList = snap.docs.map(e => {
        let element = e.data()
        element["id"] = e.id 
        element["ref"] = e.ref 
        this.mapEvent[e.id] = e.data()['name']
        return element
      })
    })
  }

  getselectedStages() {
    if (this.selectedQueueList.length !== 0) {

      collectionData(query(collection(this.firestore, "stage opportunity count"), where("queuelist", "array-contains-any", this.selectedQueueList))).subscribe((queueData) => {
        this.customValuesFromSelectedQueues = queueData.filter(e => e['kind'] !== 'phase' && e['queuelist'].every((item: string) => this.selectedQueueList.includes(item))).sort((a, b) => (a['sequence'] ?? 999) - (b['sequence'] ?? 999));
      })


    } else {
      console.log('No queues selected, skipping stage fetch');
    }
  }

  /** Top "Select queue" picker changed (ngModel gives the full new selection). */
  onQueueSelectionChange(ids: string[]): void {
    this.selectedQueueList = [...(ids || [])];
    this.getselectedStages();
    this.fetchQueueTokens();
    this.planningRefreshKey++;
  }

  /** Planning tab picked its OWN queues (independent of the Board). Loads data for the union. */
  onPlanningQueuesChange(ids: string[]): void {
    this.planningQueues = [...(ids || [])];
    this.fetchQueueTokens();
    this.planningRefreshKey++;
  }

  updateSelectedQueues(docid: any, event: any) {
    if (event.isUserInput) {
      if (event.source.selected) {
        this.selectedQueueList.push(docid);
      } else {
        const index = this.selectedQueueList.indexOf(docid);
        if (index >= 0) {
          this.selectedQueueList.splice(index, 1);
        }
      }
      this.getselectedStages();
      this.fetchQueueTokens();
      this.planningRefreshKey++;
    }
  }

  private rebuildCompletedMaps(queueId: string, liveAssignmentList: any[]): void {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

    const today: any = { ...this.completedStageCount };
    const all: any = { ...this.allCompletedStageCount };
    today[queueId] = {};
    all[queueId] = {};

    for (const element of liveAssignmentList) {
      if (element['status'] !== 'completed' || element['isactivitydone'] !== true) continue;
      const stagename = element['stagename'];
      if (!stagename) continue;

      const tsRaw = element['created'];
      const ts = tsRaw?.toDate ? tsRaw.toDate() : (tsRaw ? new Date(tsRaw) : null);
      const inToday = !!(ts && ts >= startOfDay && ts <= endOfDay);

      const bigPid = element['participantid'];
      if (!bigPid) continue;
      const pa = element['participantsactivity'] || {};
      const ba = element['bonusactivity'] || {};
      const activityid = pa[bigPid] || ba[bigPid] || Object.values(pa)[0] || Object.values(ba)[0];
      const document: any = {
        ...element,
        participantid: bigPid,
        profile_id: bigPid,
        activity: activityid,
        activitydate: tsRaw,
      };
      const key = element['id'] || element['docid'];

      all[queueId][stagename] = all[queueId][stagename] || {};
      all[queueId][stagename][key] = [document];

      if (inToday) {
        today[queueId][stagename] = today[queueId][stagename] || {};
        today[queueId][stagename][key] = [document];
      }
    }

    this.completedStageCount = today;
    this.allCompletedStageCount = all;
  }

  handleEventData(eventData: any, queueId: string): void {
    this.mapData[queueId] = eventData;
    this.mapLiveAssignmentData = eventData["mapLiveStudioToData"];
    this.rebuildCompletedMaps(queueId, eventData["liveAssignmentList"] || []);
    const stages: string[] = eventData["stages"] || [];
    const isFirstLoad = !this.initializedStagesPerQueue.has(queueId);
    for (const stage of stages) {
      const key = this.stageKey(queueId, stage);
      const isNewStage = !this.seenStageKeys.has(key);
      if (isFirstLoad || isNewStage) {
        if (!this.selectedStages.includes(key)) {
          this.selectedStages.push(key);
        }
      }
      this.seenStageKeys.add(key);
    }
    this.initializedStagesPerQueue.add(queueId);
  }

  getStageTokenCount(queueid: string, stage: string, type: string): number {
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['stageTokenMap'] ||
      !this.mapData[queueid]['stageTokenMap'][stage]) {
      return 0;
    }
    return this.mapData[queueid]['stageTokenMap'][stage][type] || 0;
  }

  // ===== Names modal: click any metric count to see who is behind the number =====
  showNamesModal: boolean = false;
  namesModalTitle: string = '';
  namesModalSubtitle: string = '';
  namesModalSearch: string = '';
  namesModalItems: Array<{ name: string, sub: string }> = [];

  openNamesModal(queueid: string, stage: string, type: string, label: string): void {
    this.namesModalItems = this.getMetricNames(queueid, stage, type);
    this.namesModalTitle = label;
    const queuename = this.mapQueue[queueid]?.['queuename'] || '';
    this.namesModalSubtitle = `${queuename} · ${stage} · ${this.namesModalItems.length} ${this.namesModalItems.length === 1 ? 'name' : 'names'}`;
    this.namesModalSearch = '';
    this.showNamesModal = true;
  }

  closeNamesModal(): void {
    this.showNamesModal = false;
    this.namesModalItems = [];
    this.namesModalSearch = '';
  }

  getFilteredNamesModalItems(): Array<{ name: string, sub: string }> {
    const q = this.namesModalSearch.trim().toLowerCase();
    if (!q) return this.namesModalItems;
    return this.namesModalItems.filter(item =>
      (item.name || '').toLowerCase().includes(q) || (item.sub || '').toLowerCase().includes(q));
  }

  private getMetricNames(queueid: string, stage: string, type: string): Array<{ name: string, sub: string }> {
    const out: Array<{ name: string, sub: string }> = [];
    const nameOf = (pid: string) => this.mapProfile[pid] || pid;

    switch (type) {
      case 'opportunities':
      case 'waiting':
      case 'queued': {
        const tokenlist = this.mapData[queueid]?.['stageTokenMap']?.[stage]?.['tokenlist'] || [];
        for (const t of tokenlist) {
          const name = this.mapProfile[t['profile_id']] || t['profile_name'] || '—';
          const isWaiting = t['status'] === 'ready';
          const isQueued = t['status'] == null || t['status'] === 'queued' || t['status'] === 'invited';
          if (type === 'waiting' && !isWaiting) continue;
          if (type === 'queued' && !isQueued) continue;
          if (!isWaiting && !isQueued) continue;
          out.push({ name, sub: isWaiting ? 'Waiting' : 'Queued' });
        }
        break;
      }
      case 'studio': {
        for (const studio of this.getStageStudioLive(queueid, stage)) {
          for (const p of studio['participants'] || []) {
            const act = this.getMapBigActivity(queueid, studio, p);
            out.push({ name: nameOf(p), sub: act ? `Live · ${act}` : 'Live' });
          }
        }
        for (const studio of this.getStageStudioIdle(queueid, stage)) {
          for (const p of studio['participants'] || []) {
            const act = this.getMapBigActivity(queueid, studio, p);
            out.push({ name: nameOf(p), sub: act ? `Idle · ${act}` : 'Idle' });
          }
        }
        break;
      }
      case 'live': {
        for (const studio of this.getStageStudioLive(queueid, stage)) {
          for (const p of studio['participants'] || []) {
            out.push({ name: nameOf(p), sub: this.getMapBigActivity(queueid, studio, p) || '' });
          }
        }
        break;
      }
      case 'idle': {
        for (const studio of this.getStageStudioIdle(queueid, stage)) {
          for (const p of studio['participants'] || []) {
            out.push({ name: nameOf(p), sub: this.getMapBigActivity(queueid, studio, p) || '' });
          }
        }
        break;
      }
      case 'shadowing': {
        for (const p of this.getShadowingParticipants(queueid, stage)) {
          out.push({ name: nameOf(p.profileid), sub: p.activity || '' });
        }
        break;
      }
      case 'notshadowing': {
        for (const p of this.getNotShadowingParticipants(queueid, stage)) {
          out.push({ name: nameOf(p.profileid), sub: p.activity || '' });
        }
        break;
      }
      case 'completed-today': {
        for (const n of this.getCompletedParticipantNames(queueid, stage, 'today')) {
          out.push({ name: n, sub: '' });
        }
        break;
      }
      case 'completed-all': {
        for (const n of this.getCompletedParticipantNames(queueid, stage, 'all')) {
          out.push({ name: n, sub: '' });
        }
        break;
      }
    }
    return out;
  }

  getPotentialTooltip(queueid: string, stage: string): string {
    if (!this.mapData[queueid] ||
        !this.mapData[queueid]['stageTokenMap'] ||
        !this.mapData[queueid]['stageTokenMap'][stage]) {
      return 'NA';
    }
    const tokenlist = this.mapData[queueid]['stageTokenMap'][stage]['tokenlist'] || [];
    const waiting: string[] = [];
    const queued: string[] = [];
    for (const t of tokenlist) {
      const name = this.mapProfile[t['profile_id']] || t['profile_name'] || '—';
      if (t['status'] === 'ready') {
        waiting.push(name);
      } else if (t['status'] == null || t['status'] === 'queued' || t['status'] === 'invited') {
        queued.push(name);
      }
    }
    const waitingBlock = `WAITING (${waiting.length})\n${waiting.length ? waiting.join('\n') : '—'}`;
    const queuedBlock = `QUEUED (${queued.length})\n${queued.length ? queued.join('\n') : '—'}`;
    return `${waitingBlock}\n\n${queuedBlock}`;
  }

  getStageName(queueid: string, stage: string, type: string): string {
    let array = [];
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['stageTokenMap'] ||
      !this.mapData[queueid]['stageTokenMap'][stage]) {
      return 'NA';
    }

    let totalParticipants = this.mapData[queueid]['stageTokenMap'][stage]['tokenlist'];

    if (totalParticipants.length == 0) {
      return 'NA'
    }

    if (type == 'waiting') {
      for (let i = 0; i < totalParticipants.length; i++) {
        const element = totalParticipants[i];
        if (element['status'] == 'ready') {
          array.push(this.mapProfile[element['profile_id']])
        }
      }
    }

    return array.join(', ');
  }
  
  sumOfStageTokenCount(stages: any[]): number {
    let total = 0;

    stages.forEach(stage => {
      const participants = this.getStageParticipants(
        stage.queueid,
        stage.stagename,
        stage.status
      );

      total += participants.length;
    });

    return total;
  }

  // sumOfStageTokenCount(stages: any[]): number {
  //   return stages.reduce((c, a) => {
  //     if (
  //       this.mapData[a['queueid']] &&
  //       this.mapData[a['queueid']]['stageTokenMap'] &&
  //       this.mapData[a['queueid']]['stageTokenMap'][a['stagename']]
  //     ) {
  //       return c + this.mapData[a['queueid']]['stageTokenMap'][a['stagename']][a['status'] != null ? a['status'] : 'total'];
  //     }
  //     return c;
  //   }, 0);
  // }

  getStageCountValue(queueid: string, stage: string): number {
    if (!this.completedStageCount[queueid] || !this.completedStageCount[queueid][stage]) {
      return 0;
    }
    return Object.keys(this.completedStageCount[queueid][stage]).length || 0
  }

  getTotalCompletedCountValue(queueid: string, stage: string): number {
    if (!this.allCompletedStageCount[queueid] || !this.allCompletedStageCount[queueid][stage]) {
      return 0;
    }
    return Object.keys(this.allCompletedStageCount[queueid][stage]).length || 0
  }

  getCompletedParticipants(queueid: string, stage: string, type: string): string[] {
    let map = {};
    if (type == 'today') {
      map = this.completedStageCount;
    } else if (type == 'all') {
      map = this.allCompletedStageCount;
    }
    if (!map[queueid] || !map[queueid][stage]) {
      return [];
    }

    const participantIds = new Set<string>();
    const stageData = map[queueid][stage];

    Object.keys(stageData).forEach(sourcePath => {
      const documents = stageData[sourcePath];
      documents.forEach((doc: any) => {
        if (doc['participantid'] || doc['profile_id']) {
          participantIds.add(doc['participantid'] || doc['profile_id']);
        }
      });
    });

    return Array.from(participantIds);
  }

  getCompletedParticipantNames(queueid: string, stage: string, type: string): string[] {
    const participantIds = this.getCompletedParticipants(queueid, stage, type);
    return participantIds.map(id => this.mapProfile[id] || id).filter(name => name);
  }

  getGroupActivities(participants: any[]): string {
    const names = new Set<string>();
    participants.forEach(p => names.add(this.getActivityName(p)));
    return Array.from(names).join(', ');
  }

  getActivityName(doc: any): string {
    const map = this.mapData[this.selectedPanelQueueId]?.['mapBigActivity'] ?? {};
    const pid = doc['participantid'] || doc['profile_id'];
    const id = doc['activity'] || doc['bigactivity'] || doc['participantsactivity']?.[pid];
    return map[id] || doc['activityname'] || doc['bigactivityname'] || 'Unknown';
  }

  getGroupedByActivity(type: 'today' | 'all'): Array<{ activity: string, participants: any[] }> {
    const documents = type === 'today'
      ? this.getFilteredCompletedTodayParticipants(this.selectedPanelQueueId, this.selectedPanelStage)
      : this.getFilteredCompletedAllParticipants(this.selectedPanelQueueId, this.selectedPanelStage);

    const groups = new Map<string, { activity: string, participants: any[] }>();
    documents.forEach(doc => {
      const activity = this.getActivityName(doc);
      if (!groups.has(activity)) groups.set(activity, { activity, participants: [] });
      groups.get(activity)!.participants.push(doc);
    });
    return Array.from(groups.values()).sort((a, b) => b.participants.length - a.participants.length);
  }

  onGroupByActivityChange(): void {
    this.expandedActivityGroups = {};
    if (this.groupByActivity) {
      this.groupByStudio = false;
      const type = this.panelFilter === 'completed-today' ? 'today' : 'all';
      const groups = this.getGroupedByActivity(type);
      if (groups.length > 0) {
        this.expandedActivityGroups[`${type}_${groups[0].activity}`] = true;
      }
    }
  }

  isActivityGroupExpanded(activity: string, type: 'today' | 'all'): boolean {
    return this.expandedActivityGroups[`${type}_${activity}`] === true;
  }

  toggleActivityGroupExpansion(activity: string, type: 'today' | 'all'): void {
    const key = `${type}_${activity}`;
    this.expandedActivityGroups[key] = !this.expandedActivityGroups[key];
  }

  onGroupByStudioChange(): void {
    this.expandedStudioGroups = {};

    if (this.groupByStudio) {
      this.groupByActivity = false;
      // Auto-expand first group
      const type = this.panelFilter === 'completed-today' ? 'today' : 'all';
      const groups = this.getGroupedByStudio(type);
      if (groups.length > 0) {
        const key = `${type}_${groups[0].studioId}`;
        this.expandedStudioGroups[key] = true;
      }
    }
  }

  /**
   * Check if studio group is expanded
   */
  isStudioGroupExpanded(studioId: string, type: 'today' | 'all'): boolean {
    const key = `${type}_${studioId}`;
    return this.expandedStudioGroups[key] === true;
  }

  /**
   * Toggle studio group expansion
   */
  toggleStudioGroupExpansion(studioId: string, type: 'today' | 'all'): void {
    const key = `${type}_${studioId}`;
    this.expandedStudioGroups[key] = !this.expandedStudioGroups[key];
  }

  getCompletedTooltip(queueid: string, stage: string, type: string): string {
    const names = this.getCompletedParticipantNames(queueid, stage, type);
    if (names.length === 0) {
      return 'No completed participants';
    }
    return names.join('\n');
  }

  getStageStudioIdleLength(queueid: string, stage: string): number {
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['newStageStudioMap'] ||
      !this.mapData[queueid]['newStageStudioMap'][stage] ||
      !this.mapData[queueid]['newStageStudioMap'][stage]['idle']) {
      return 0;
    }
    return this.mapData[queueid]['newStageStudioMap'][stage]['idle'].length;
  }

  getStageStudioLive(queueid: string, stage: string): any[] {
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['liveBigParticipantsByStage'] ||
      !this.mapData[queueid]['liveBigParticipantsByStage'][stage]
    ) {
      return [];
    }
    let data = []
    for (let i = 0; i < this.mapData[queueid]['liveBigParticipantsByStage'][stage].length; i++) {
      const e = this.mapData[queueid]['liveBigParticipantsByStage'][stage][i];
      if (this.mapData[queueid]['liveStudioMap'][e['studioid']] != undefined) {
        let obj = this.mapData[queueid]['liveStudioMap'][e['studioid']]
        if (this.filteredProfileIds.size > 0) {
          const hasFilteredParticipant = obj['participants']?.some((participantId: string) => 
            this.filteredProfileIds.has(participantId)
          );
          if (!hasFilteredParticipant) {
            continue;
          }
        }
        data.push(obj)
      }
    }
    const nameOf = (s: any) => (s?.participants || []).map((p: string) => this.mapProfile[p] || p).join(', ').toLowerCase();
    return data.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }

  getStageStudioIdle(queueid: string, stage: string): any[] {
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['newStageStudioMap'] ||
      !this.mapData[queueid]['newStageStudioMap'][stage] ||
      !this.mapData[queueid]['newStageStudioMap'][stage]['idle']) {
      return [];
    }
    const idle = [...this.mapData[queueid]['newStageStudioMap'][stage]['idle']];
    const nameOf = (s: any) => (s?.participants || []).map((p: string) => this.mapProfile[p] || p).join(', ').toLowerCase();
    return idle.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }

  getMapLiveAssignmentActivity(queueid, studio, participant) {
    var bonus = this.mapLiveAssignmentData[studio["docid"]]["bonusactivity"] ?? {}
    return (this.mapData[queueid]['mapBigActivity'] ?? {})[bonus[participant]] ?? ""
  }

  getMapBigActivity(queueid: string, studio: any, participant: string): string {
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['mapBigActivity'] ||
      !studio['participantsactivity'] ||
      !studio['participantsactivity'][participant]) {
      return '';
    }
    return this.mapData[queueid]['mapBigActivity'][studio['participantsactivity'][participant]] || '';
  }

  getParticipantName(queueid: string, studio: any): string {
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['mapLiveStudioToParticipants'] ||
      !studio['docid'] ||
      !this.mapData[queueid]['mapLiveStudioToParticipants'][studio['docid']] ||
      !this.mapProfile) {
      return '';
    }
    return this.mapProfile[this.mapData[queueid]['mapLiveStudioToParticipants'][studio['docid']]] || '';
  }

  hasStudioPreAssign(queueid: string, studio: any): boolean {
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['studioPreAssign'] ||
      !studio['docid']) {
      return false;
    }
    return !!this.mapData[queueid]['studioPreAssign'][studio['docid']];
  }

  getStudioPreAssign(queueid: string, studio: any): any[] {
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['studioPreAssign'] ||
      !studio['docid'] ||
      !this.mapData[queueid]['studioPreAssign'][studio['docid']]) {
      return [];
    }
    return this.mapData[queueid]['studioPreAssign'][studio['docid']];
  }

  private getShadowCohortParticipants(queueid: string, stage: string): Array<{ profileid: string, bigactivity: string }> {
    const eventId = this.mapQueue[queueid]?.['eventid'];
    const cohorts = eventId ? this.eventCohorts[eventId] : null;
    if (!cohorts?.length) return [];
    const shadowSet: Set<string> = this.mapData[queueid]?.['shadowActivityIds'] ?? new Set();
    const compulsory = this.mapQueue[queueid]?.['stageproperty']?.[stage]?.['compulsoryactivity'] ?? {};
    const stageActivityIds = new Set<string>();
    Object.values(compulsory).forEach((combo: any) => (combo || []).forEach((id: string) => stageActivityIds.add(id)));

    const out: Array<{ profileid: string, bigactivity: string }> = [];
    const seen = new Set<string>();
    for (const c of cohorts) {
      if (!shadowSet.has(c.bigactivity) || !stageActivityIds.has(c.bigactivity)) continue;
      for (const pid of c.participantidlist) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        out.push({ profileid: pid, bigactivity: c.bigactivity });
      }
    }
    return out;
  }

  private findLiveShadowAssignment(queueid: string, profileid: string, bigactivity: string): any | null {
    const liveList: any[] = this.mapData[queueid]?.['liveAssignmentList'] || [];
    return liveList.find(e => {
      if (e['status'] !== 'live') return false;
      const pa = e['participantsactivity'] || {};
      const ba = e['bonusactivity'] || {};
      return pa[profileid] === bigactivity || ba[profileid] === bigactivity;
    }) || null;
  }

  private isProfileInLiveShadow(queueid: string, stage: string, profileid: string, bigactivity: string): boolean {
    return !!this.findLiveShadowAssignment(queueid, profileid, bigactivity);
  }

  getShadowingParticipants(queueid: string, stage: string): Array<{ profileid: string, activity: string }> {
    const map = this.mapData[queueid]?.['mapBigActivity'] ?? {};
    const out: Array<{ profileid: string, activity: string }> = [];
    for (const p of this.getShadowCohortParticipants(queueid, stage)) {
      const assignment = this.findLiveShadowAssignment(queueid, p.profileid, p.bigactivity);
      if (!assignment) continue;
      const mainPid = assignment['participantid'];
      const mainActivityId = assignment['participantsactivity']?.[mainPid];
      const activity = map[mainActivityId] || mainActivityId || map[p.bigactivity] || p.bigactivity;
      out.push({ profileid: p.profileid, activity });
    }
    return out.sort((a, b) => (this.mapProfile[a.profileid] || a.profileid).localeCompare(this.mapProfile[b.profileid] || b.profileid));
  }

  getNotShadowingParticipants(queueid: string, stage: string): Array<{ profileid: string, activity: string }> {
    const map = this.mapData[queueid]?.['mapBigActivity'] ?? {};
    return this.getShadowCohortParticipants(queueid, stage)
      .filter(p => !this.isProfileInLiveShadow(queueid, stage, p.profileid, p.bigactivity))
      .map(p => ({ profileid: p.profileid, activity: map[p.bigactivity] || p.bigactivity }))
      .sort((a, b) => (this.mapProfile[a.profileid] || a.profileid).localeCompare(this.mapProfile[b.profileid] || b.profileid));
  }

  getNoStudioShadowingParticipants(queueid: string, stage: string): Array<{ profileid: string, activity: string }> {
    const eventId = this.mapQueue[queueid]?.['eventid'];
    const cohorts = eventId ? this.eventCohorts[eventId] : null;
    if (!cohorts?.length) return [];

    const shadowSet: Set<string> = this.mapData[queueid]?.['shadowActivityIds'] ?? new Set();
    const mapBigActivity = this.mapData[queueid]?.['mapBigActivity'] ?? {};
    const compulsory = this.mapQueue[queueid]?.['stageproperty']?.[stage]?.['compulsoryactivity'] ?? {};
    const stageActivityIds = new Set<string>();
    Object.values(compulsory).forEach((combo: any) => (combo || []).forEach((id: string) => stageActivityIds.add(id)));

    const inStudioProfiles = new Set<string>();
    const liveList: any[] = this.mapData[queueid]?.['liveAssignmentList'] || [];
    liveList.forEach(e => {
      if (e['stagename'] === stage && e['status'] === 'live') {
        Object.keys(e['participantsactivity'] || {}).forEach(p => inStudioProfiles.add(p));
        Object.keys(e['bonusactivity'] || {}).forEach(p => inStudioProfiles.add(p));
        if (e['participantid']) inStudioProfiles.add(e['participantid']);
      }
    });

    const seen = new Set<string>();
    const out: Array<{ profileid: string, activity: string }> = [];
    for (const cohort of cohorts) {
      if (!shadowSet.has(cohort.bigactivity)) continue;
      if (!stageActivityIds.has(cohort.bigactivity)) continue;
      for (const pid of cohort.participantidlist) {
        if (inStudioProfiles.has(pid) || seen.has(pid)) continue;
        seen.add(pid);
        out.push({ profileid: pid, activity: mapBigActivity[cohort.bigactivity] || cohort.bigactivity });
      }
    }
    return out.sort((a, b) => (this.mapProfile[a.profileid] || a.profileid).localeCompare(this.mapProfile[b.profileid] || b.profileid));
  }

  getNoStudioShadowingCount(queueid: string, stage: string): number {
    const eventId = this.mapQueue[queueid]?.['eventid'];
    const cohorts = eventId ? this.eventCohorts[eventId] : null;
    if (!cohorts?.length) return 0;

    const shadowSet: Set<string> = this.mapData[queueid]?.['shadowActivityIds'] ?? new Set();
    const compulsory = this.mapQueue[queueid]?.['stageproperty']?.[stage]?.['compulsoryactivity'] ?? {};
    const stageActivityIds = new Set<string>();
    Object.values(compulsory).forEach((combo: any) => (combo || []).forEach((id: string) => stageActivityIds.add(id)));

    const inStudioProfiles = new Set<string>();
    const liveList: any[] = this.mapData[queueid]?.['liveAssignmentList'] || [];
    liveList.forEach(e => {
      if (e['stagename'] === stage && e['status'] === 'live') {
        Object.keys(e['participantsactivity'] || {}).forEach(p => inStudioProfiles.add(p));
        Object.keys(e['bonusactivity'] || {}).forEach(p => inStudioProfiles.add(p));
        if (e['participantid']) inStudioProfiles.add(e['participantid']);
      }
    });

    const counted = new Set<string>();
    for (const cohort of cohorts) {
      if (!shadowSet.has(cohort.bigactivity)) continue;
      if (!stageActivityIds.has(cohort.bigactivity)) continue;
      for (const pid of cohort.participantidlist) {
        if (!inStudioProfiles.has(pid)) counted.add(pid);
      }
    }
    return counted.size;
  }

  getStudioAssignmentLength(queueid: string, studio: any): number {
    const studioid = studio?.['docid'];
    if (!studioid) return 0;
    const stages = this.allCompletedStageCount[queueid] || {};
    let count = 0;
    for (const stage in stages) {
      const entries = stages[stage];
      for (const key in entries) {
        const docs = entries[key] || [];
        if (docs[0]?.['studioid'] === studioid) count++;
      }
    }
    return count;
  }

  getStudioAssignmentParticipant(queueid: string, studio: any) {
    let array = [];
    if (!this.mapData[queueid] ||
      !this.mapData[queueid]['studioAssignmentMap'] ||
      !studio['docid'] ||
      !this.mapData[queueid]['studioAssignmentMap'][studio['docid']]) {
      return 'NA';
    }

    for (let i = 0; i < this.mapData[queueid]['studioAssignmentMap'][studio['docid']].length; i++) {
      const element = this.mapData[queueid]['studioAssignmentMap'][studio['docid']][i];
      array.push(this.mapProfile[element])
    }

    return array.join(', ');
  }

  toggleContainer() {
    this.isContainerOpen = !this.isContainerOpen;
  }

  onDeleteCustomStageCount(stageDoc: any) {
    var x = confirm(`Are you sure to delete ${stageDoc['stagename']} count`);

    if (x) {
      const ref = doc(this.firestore, 'stage opportunity count', stageDoc['docid']);
      deleteDoc(ref);
    }
  }

  openStagePanel(queueId: string, stage: string): void {
    // The expand button opens the full-screen Arena coordinator board in a
    // new browser tab so the dashboard stays put.
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/arena', queueId, stage])
    );
    window.open(url, '_blank');
    return;
    // (legacy side panel logic preserved below — currently unreachable)
    this.selectedPanelQueueId = queueId;
    this.selectedPanelStage = stage;
    this.selectedPanelQueue = this.mapQueue[queueId];
    this.panelFilter = 'all';
    this.completedSearchText = '';
    this.fromDate = null;
    this.toDate = null;
    this.groupByStudio = false;
    this.showDetailPanel = true;
    this.showCustomStagePanel = false;
  }

  closeDetailPanel(): void {
    this.showDetailPanel = false;
    this.selectedPanelQueueId = '';
    this.selectedPanelStage = '';
    this.selectedPanelQueue = null;
    this.completedSearchText = '';
    this.fromDate = null;
    this.toDate = null;
    this.groupByStudio = false;
  }

  openCustomStagePanel(doc: any): void {
    this.selectedCustomStage = doc;
    this.customStageSearchText = '';
    this.showCustomStagePanel = true;
    this.showDetailPanel = false;
    this.showCreateOpportunity = false;
    this.isEditMode = false;
    this.editingStageOpportunity = null;
    this.selectedProductFilter = null;
    this.expandedStages.clear();
  }

  closeCustomStagePanel(): void {
    this.showCustomStagePanel = false;
    this.selectedCustomStage = null;
    this.customStageSearchText = '';
    this.resetForm();
  }

  onCustomStageSearch(): void {
    // Search is reactive through the getter method
  }

  clearCustomStageSearch(): void {
    this.customStageSearchText = '';
  }

  getStageParticipants(queueId: string, stageName: string, status?: string): Array<{ name: string, queueName: string, profileId: string }> {
    const participants: Array<{ name: string, queueName: string, profileId: string }> = [];

    if (!this.mapData[queueId] ||
      !this.mapData[queueId]['stageTokenMap'] ||
      !this.mapData[queueId]['stageTokenMap'][stageName] ||
      !this.mapData[queueId]['stageTokenMap'][stageName]['tokenlist']) {
      return participants;
    }

    const queueName = this.mapQueue[queueId]?.queuename;
    const tokenList = this.mapData[queueId]['stageTokenMap'][stageName]['tokenlist'];

    let filteredTokens = tokenList;
    if (status != null) {
      if (status === 'waiting') {
        filteredTokens = tokenList.filter((token: any) => token['status'] === 'ready');
      } else if (status === 'queued') {
        filteredTokens = tokenList.filter((token: any) =>
          token['status'] == null || token['status'] === 'queued' || token['status'] === 'invited'
        );
      } else if (status === 'instudio') {
        filteredTokens = tokenList.filter((token: any) => token['status'] === 'instudio');
      }
    }

    filteredTokens.forEach((token: any) => {
      const profileId = token['profile_id'] || token['profileid'] || token['participantid'];
      const profileName = token['profile_name'] || this.mapProfile[profileId] || profileId;

      if (profileId) {
        if (this.filteredProfileIds.size > 0 && !this.filteredProfileIds.has(profileId)) {
          return;
        }
        participants.push({
          name: profileName,
          queueName: queueName,
          profileId: profileId
        });
      }
    });

    return participants;
  }

  setPanelFilter(filter: 'all' | 'live' | 'idle' | 'completed-today' | 'completed-all'): void {
    this.panelFilter = filter;
    if (filter !== 'completed-today' && filter !== 'completed-all') {
      this.completedSearchText = '';
      this.groupByStudio = false;
    }
    if (filter !== 'completed-all') {
      this.fromDate = null;
      this.toDate = null;
    }
  }

  onCompletedSearch(): void {
    // Search is reactive through the getter methods
  }

  clearCompletedSearch(): void {
    this.completedSearchText = '';
  }

  clearDateRange(): void {
    this.fromDate = null;
    this.toDate = null;
  }

  getCompletedDocuments(queueId: string, stage: string, type: 'today' | 'all'): any[] {
    const map = type === 'today' ? this.completedStageCount : this.allCompletedStageCount;

    if (!map[queueId] || !map[queueId][stage]) {
      return [];
    }

    const stageData = map[queueId][stage];
    const documents: any[] = [];

    Object.keys(stageData).forEach(sourcePath => {
      const docs = stageData[sourcePath];
      const doc = Array.isArray(docs) ? docs[0] : docs;

      if (doc) {
        const participantId = doc['participantid'] || doc['profile_id'];
        documents.push({
          ...doc,
          participantName: this.mapProfile[participantId] || participantId || 'Unknown',
          sourcePath: sourcePath
        });
      }
    });

    return documents;
  }

  getFilteredCompletedTodayParticipants(queueId: string, stage: string): any[] {
    let documents = this.getCompletedDocuments(queueId, stage, 'today');

    if (this.completedSearchText && this.completedSearchText.trim() !== '') {
      const searchLower = this.completedSearchText.toLowerCase().trim();
      documents = documents.filter(doc =>
        doc.participantName?.toLowerCase().includes(searchLower)
      );
    }

    return documents;
  }

  getFilteredCompletedAllParticipants(queueId: string, stage: string): any[] {
    let documents = this.getCompletedDocuments(queueId, stage, 'all');

    if (this.fromDate || this.toDate) {
      documents = documents.filter(doc => {
        if (!doc.activitydate) return false;

        const activityDate = doc.activitydate.toDate ? doc.activitydate.toDate() : new Date(doc.activitydate);

        if (this.fromDate) {
          const fromStart = new Date(this.fromDate);
          fromStart.setHours(0, 0, 0, 0);
          if (activityDate < fromStart) return false;
        }

        if (this.toDate) {
          const toEnd = new Date(this.toDate);
          toEnd.setHours(23, 59, 59, 999);
          if (activityDate > toEnd) return false;
        }

        return true;
      });
    }

    if (this.completedSearchText && this.completedSearchText.trim() !== '') {
      const searchLower = this.completedSearchText.toLowerCase().trim();
      documents = documents.filter(doc =>
        doc.participantName?.toLowerCase().includes(searchLower)
      );
    }

    return documents;
  }

  getGroupedByStudio(type: 'today' | 'all'): Array<{ studioId: string, studioName: string, participants: any[] }> {
    const documents = type === 'today'
      ? this.getFilteredCompletedTodayParticipants(this.selectedPanelQueueId, this.selectedPanelStage)
      : this.getFilteredCompletedAllParticipants(this.selectedPanelQueueId, this.selectedPanelStage);

    const studioMap = new Map<string, { studioId: string, studioName: string, participants: any[] }>();

    documents.forEach(doc => {
      const studioId = doc['studioid'] || doc['studio_id'] || 'unknown';
      const studioName = this.getStudioName(studioId, doc['queueid']);

      if (!studioMap.has(studioId)) {
        studioMap.set(studioId, {
          studioId: studioId,
          studioName: studioName,
          participants: []
        });
      }

      studioMap.get(studioId)!.participants.push(doc);
    });

    return Array.from(studioMap.values()).sort((a, b) => (a.studioName ?? '').localeCompare(b.studioName ?? ''));
  }

  getStudioName(studioId: string, queueid: string): string {
    const profileIds = this.mapData[queueid]['studioMap'][studioId]['participants'];

    if (!profileIds || !Array.isArray(profileIds) || profileIds.length === 0) {
      return studioId;
    }

    const names = profileIds
      .map((id: string) => this.mapProfile[id] || id)
      .filter((name: string) => name);

    return names.join(', ') || studioId;
  }

  // ===== Studio Watch =====================================================

  private tsToMillis(ts: any): number | null {
    if (!ts) return null;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    const d = new Date(ts);
    const t = d.getTime();
    return isNaN(t) ? null : t;
  }

  /**
   * Studios flagged by the 4-hour rule across the currently selected board
   * queues. JOINED assignments are measured from `created` (studio entry);
   * ACTIVE assignments (call started) from `specialistJoinedAt`. Sorted
   * longest-waiting first.
   */
  get studioWatchItems(): Array<{
    key: string;
    queueid: string;
    queuename: string;
    stage: string;
    type: 'joined' | 'active';
    participant: string;
    coach: string;
    studioLabel: string;
    elapsedMs: number;
  }> {
    void this.studioWatchTick; // re-evaluate on each tick so timers advance
    const now = Date.now();
    const out: Array<any> = [];

    for (const queueid of this.selectedQueueList) {
      const list: any[] = this.mapData[queueid]?.['liveAssignmentList'] || [];
      const queuename = this.mapQueue[queueid]?.['queuename'] ?? queueid;

      for (const a of list) {
        if (a?.['status'] !== 'live') continue;
        const stage = a?.['stagename'];
        if (!stage) continue;
        if (!this.isStageSelected(queueid, stage)) continue;

        const joinedMs = this.tsToMillis(a?.['specialistJoinedAt']);
        const type: 'joined' | 'active' = joinedMs != null ? 'active' : 'joined';
        const startMs = joinedMs != null ? joinedMs : this.tsToMillis(a?.['created']);
        if (startMs == null) continue;

        const elapsedMs = now - startMs;
        if (elapsedMs < this.STUDIO_WATCH_THRESHOLD_MS) continue;

        // Respect the active event filter when one is applied.
        const participantId = a?.['participantid'];
        if (this.filteredProfileIds.size > 0 && !this.filteredProfileIds.has(participantId)) continue;

        const pairing: string[] = a?.['pairing'] || [];
        const coach = pairing.map(pid => this.mapProfile[pid] || pid).filter(Boolean).join(', ');

        out.push({
          key: a?.['id'] || a?.['docid'] || `${queueid}-${a?.['studioid']}`,
          queueid,
          queuename,
          stage,
          type,
          participant: this.mapProfile[participantId] || participantId || '—',
          coach: coach || '—',
          studioLabel: this.getStudioWatchStudioLabel(queueid, a?.['studioid']) || queuename,
          elapsedMs,
        });
      }
    }

    return out.sort((x, y) => y.elapsedMs - x.elapsedMs);
  }

  get studioWatchCount(): number {
    return this.studioWatchItems.length;
  }

  private getStudioWatchStudioLabel(queueid: string, studioid: string): string {
    const studio = this.mapData[queueid]?.['studioMap']?.[studioid];
    if (!studio) return '';
    const named = studio['studioname'] || studio['name'];
    if (named && named !== 'Studio') return named;
    const participants: string[] = studio['participants'] || [];
    return participants.map(id => this.mapProfile[id] || id).filter(Boolean).join(', ');
  }

  /** "5h 12m" style elapsed label. */
  formatWatchElapsed(ms: number): string {
    if (ms == null || ms < 0) ms = 0;
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m}m`;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }

  formatActivityDate(timestamp: any): string {
    if (!timestamp) return '';

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }

  getTotalParticipantsCount(): number {
    const stages = this.getParticipantsByStage();
    return stages.reduce((total, stage) => total + stage.participants.length, 0);
  }

  async fetchdata() {
    if (this.selectedQueueList.length === 0) return;

    await getDocs(query(collection(this.firestore, 'queue generation'), where("docid", "in", this.selectedQueueList))).then(async queueData => {
      let allstages = [];
      for (let i = 0; i < queueData.docs.length; i++) {
        const queueDoc = queueData.docs[i].data()
        const stagenamelist = queueDoc['stages'];
        for (let j = 0; j < stagenamelist.length; j++) {
          const stagename = stagenamelist[j];
          if (queueDoc['stageproperty'][stagename] && Object.values(queueDoc['stageproperty'][stagename]['compulsoryactivity']).length != 0) {
            allstages.push({
              queueid: queueDoc['docid'],
              stagename: stagename,
              status: 'queued',
            })
            allstages.push({
              queueid: queueDoc['docid'],
              stagename: stagename,
              status: 'waiting',
            })
            allstages.push({
              queueid: queueDoc['docid'],
              stagename: stagename,
              status: 'instudio',
            })
          } else {
            allstages.push({
              queueid: queueDoc['docid'],
              stagename: stagename,
              status: null
            })
          }
        }
      }
      this.updatestages = allstages
    })
  }

  compareFnc(c1: any, c2: any): boolean {
    return c1 && c2 ? `${c1.queueid}${c1.stagename}${c1.status}` === `${c2.queueid}${c2.stagename}${c2.status}` : c1 === c2;
  }

  submitStageOpportunity() {
    if (!this.notesForm.valid) return;

    const formValues = this.notesForm.value;

    if (this.isEditMode && this.editingStageOpportunity) {
      const docData = {
        ...this.editingStageOpportunity,
        ...formValues,
        queuelist: this.selectedQueueList,
        updated: new Date()
      };

      updateDoc(doc(this.firestore, 'stage opportunity count', this.editingStageOpportunity.docid), docData).then(() => {
        this.closeCustomStagePanel();
        this.resetForm();
      });
    } else {
      const docid = doc(collection(this.firestore, 'stage opportunity count')).id;
      const sequence = this.customValuesFromSelectedQueues.length;
      const docData = {
        ...formValues,
        queuelist: this.selectedQueueList,
        docid: docid,
        sequence: sequence,
        created: new Date()
      };
      setDoc(doc(this.firestore, 'stage opportunity count', docid), docData).then(() => {
        this.closeCustomStagePanel();
        this.resetForm();
      });
    }
  }

  resetForm() {
    this.notesForm.reset();
    this.isEditMode = false;
    this.editingStageOpportunity = null;
    this.showCreateOpportunity = false;
  }

  onDrop(event: CdkDragDrop<any[]>) {
    if (event.previousIndex === event.currentIndex) return;

    moveItemInArray(this.customValuesFromSelectedQueues, event.previousIndex, event.currentIndex);

    this.customValuesFromSelectedQueues = [...this.customValuesFromSelectedQueues];

    const updatePromises = this.customValuesFromSelectedQueues.map((item, index) => {
      item.sequence = index;
      return updateDoc(doc(this.firestore, 'stage opportunity count', item.docid), {
        sequence: index
      });
    });

    Promise.all(updatePromises).then(() => {
      console.log('Sequence updated successfully');
    }).catch(err => {
      console.error('Error updating sequence:', err);
    });
  }

  fetchQueueTokens() {
    // Tear down the previous listener FIRST — a new selection must not leave the old
    // query streaming into queueTokens (that stacking is what made counts differ across
    // machines). Exactly one live queue_token listener at a time.
    this.queueTokensSub?.unsubscribe();
    const queues = this.loadedQueues;
    if (queues.length === 0) {
      this.queueTokens = [];
      this.queueTokenMap.clear();
      return;
    }
    const selectedQueueRef = queues.map((e) => this.mapQueue[e]['docref'])
    this.queueTokensSub = collectionData(query(
      collection(this.firestore, 'queue_token'),
      where('queueref', 'in', selectedQueueRef)
    )).pipe(takeUntil(this.subscription)).subscribe(tokens => {
      this.queueTokens = tokens;

      this.queueTokenMap.clear();
      tokens.forEach((token: any) => {
        const profileId = token['profile_id'];
        if (profileId) {
          if (this.queueTokenMap.has(profileId)) {
            const existing = this.queueTokenMap.get(profileId);
            if (Array.isArray(existing)) {
              existing.push(token);
            } else {
              this.queueTokenMap.set(profileId, [existing, token]);
            }
          } else {
            this.queueTokenMap.set(profileId, token);
          }
        }
      });

      console.log('Queue tokens loaded:', this.queueTokens.length);
    });
  }

  openAddStageCount() {
    this.isEditMode = false;
    this.editingStageOpportunity = null;
    this.notesForm.reset();
    this.fetchdata();
    this.showCreateOpportunity = true;
    this.showCustomStagePanel = true;
    this.showDetailPanel = false;
    this.selectedCustomStage = null;
  }

  editStageOpportunity() {
    if (!this.selectedCustomStage) return;

    this.isEditMode = true;
    this.editingStageOpportunity = this.selectedCustomStage;
    this.fetchdata();
    this.notesForm.patchValue({
      stagename: this.selectedCustomStage.stagename,
      stage: this.selectedCustomStage.stage
    });
    this.showCreateOpportunity = true;
  }

  cancelStageOpportunity() {
    this.resetForm();
    if (this.selectedCustomStage) {
      this.showCreateOpportunity = false;
    } else {
      this.closeCustomStagePanel();
    }
  }

  getProductBreakdownForStage(stageDoc: any): { productName: string, count: number }[] {
    if (!stageDoc || !stageDoc.stage) {
      return [];
    }

    const productMap = new Map<string, number>();
    const stages = stageDoc.stage;

    stages.forEach((stageConfig: any) => {
      const queueId = stageConfig['queueid'];
      const stageName = stageConfig['stagename'];
      const status = stageConfig['status'];

      const participants = this.getStageParticipants(queueId, stageName, status);

      participants.forEach(participant => {
        const profileId = participant.profileId;
        const tokenData = this.queueTokenMap.get(profileId);

        let productName = 'Unknown';
        if (tokenData) {
          if (Array.isArray(tokenData)) {
            productName = tokenData[0]['productname'] || 'Unknown';
          } else {
            productName = tokenData['productname'] || 'Unknown';
          }
        }

        productMap.set(productName, (productMap.get(productName) || 0) + 1);
      });
    });

    const result: { productName: string, count: number }[] = [];

    const sortedEntries = Array.from(productMap.entries()).sort((a, b) => b[1] - a[1]);

    sortedEntries.forEach(([productName, count]) => {
      result.push({
        productName,
        count
      });
    });

    return result;
  }

  setProductFilter(productName: string | null): void {
    if (this.selectedProductFilter === productName) {
      this.selectedProductFilter = null;
    } else {
      this.selectedProductFilter = productName;
    }
  }

  clearProductFilter(): void {
    this.selectedProductFilter = null;
  }

  getParticipantsByStage(): Array<{ stageName: string, queueId: string, queueName: string, status: string, participants: any[] }> {
    if (!this.selectedCustomStage || !this.selectedCustomStage.stage) {
      return [];
    }

    const stages = this.selectedCustomStage.stage;
    const result: Array<{ stageName: string, queueId: string, queueName: string, status: string, participants: any[] }> = [];

    stages.forEach((stageConfig: any) => {
      const queueId = stageConfig['queueid'];
      const stageName = stageConfig['stagename'];
      const status = stageConfig['status'];
      const queueName = this.mapQueue[queueId]?.queuename || queueId;

      let participants = this.getStageParticipantsWithProduct(queueId, stageName, status);

      if (this.selectedProductFilter) {
        participants = participants.filter(p => p.productName === this.selectedProductFilter);
      }

      if (this.customStageSearchText && this.customStageSearchText.trim() !== '') {
        const searchLower = this.customStageSearchText.toLowerCase().trim();
        participants = participants.filter(p =>
          p.name.toLowerCase().includes(searchLower) ||
          p.productName.toLowerCase().includes(searchLower) ||
          p.queueName.toLowerCase().includes(searchLower)
        );
      }

      result.push({
        stageName: stageName,
        queueId: queueId,
        queueName: queueName,
        status: status,
        participants: participants
      });
    });

    return result.sort((a, b) => b.participants.length - a.participants.length);
  }

  getStageParticipantsWithProduct(queueId: string, stageName: string, status?: string): any[] {
    const participants: any[] = [];

    if (!this.mapData[queueId] ||
      !this.mapData[queueId]['stageTokenMap'] ||
      !this.mapData[queueId]['stageTokenMap'][stageName] ||
      !this.mapData[queueId]['stageTokenMap'][stageName]['tokenlist']) {
      return participants;
    }

    const queueName = this.mapQueue[queueId]?.queuename || queueId;
    const tokenList = this.mapData[queueId]['stageTokenMap'][stageName]['tokenlist'];

    let filteredTokens = tokenList;
    if (status != null) {
      if (status === 'waiting') {
        filteredTokens = tokenList.filter((token: any) => token['status'] === 'ready');
      } else if (status === 'queued') {
        filteredTokens = tokenList.filter((token: any) =>
          token['status'] == null || token['status'] === 'queued' || token['status'] === 'invited'
        );
      } else if (status === 'instudio') {
        filteredTokens = tokenList.filter((token: any) => token['status'] === 'instudio');
      }
    }

    filteredTokens.forEach((token: any) => {
      const profileId = token['profile_id'] || token['profileid'] || token['participantid'];
      const profileName = token['profile_name'] || this.mapProfile[profileId] || profileId;

      if (profileId) {
        if (this.filteredProfileIds.size > 0 && !this.filteredProfileIds.has(profileId)) {
          return;
        }
        const tokenData = this.queueTokenMap.get(profileId);
        let productName = 'Unknown Product';

        if (tokenData) {
          if (Array.isArray(tokenData)) {
            productName = tokenData[0]['productname'] || 'Unknown Product';
          } else {
            productName = tokenData['productname'] || 'Unknown Product';
          }
        }

        participants.push({
          name: profileName,
          queueName: queueName,
          profileId: profileId,
          productName: productName,
          tokenData: tokenData
        });
      }
    });

    return participants;
  }

  getStageKey(stage: any): string {
    return `${stage.queueId}-${stage.stageName}-${stage.status}`;
  }

  toggleStageExpansion(stage: any): void {
    const key = this.getStageKey(stage);
    if (this.expandedStages.has(key)) {
      this.expandedStages.delete(key);
    } else {
      this.expandedStages.add(key);
    }
  }

  isStageExpanded(stage: any): boolean {
    return this.expandedStages.has(this.getStageKey(stage));
  }

  getStatusDisplayText(status: string | null): string {
    if (!status) return 'All';
    switch (status) {
      case 'waiting': return 'Waiting';
      case 'queued': return 'Queued';
      case 'instudio': return 'In Studio';
      default: return status;
    }
  }

  getTotalFilteredCount(): number {
    const stages = this.getParticipantsByStage();
    return stages.reduce((total, stage) => total + stage.participants.length, 0);
  }

  getProductCounts(): { productName: string, count: number }[] {
    if (!this.selectedCustomStage || !this.selectedCustomStage.stage) {
      return [];
    }

    const productMap = new Map<string, number>();
    const stages = this.selectedCustomStage.stage;

    stages.forEach((stageConfig: any) => {
      const queueId = stageConfig['queueid'];
      const stageName = stageConfig['stagename'];
      const status = stageConfig['status'];

      const participants = this.getStageParticipantsWithProduct(queueId, stageName, status);

      participants.forEach(participant => {
        const productName = participant.productName;
        productMap.set(productName, (productMap.get(productName) || 0) + 1);
      });
    });

    const result: { productName: string, count: number }[] = [];
    const sortedEntries = Array.from(productMap.entries()).sort((a, b) => b[1] - a[1]);

    sortedEntries.forEach(([productName, count]) => {
      result.push({ productName, count });
    });

    return result;
  }
}