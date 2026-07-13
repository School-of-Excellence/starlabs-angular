import { Component, HostListener, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { collection, collectionSnapshots, doc, Firestore, getDocs, orderBy, query, where, updateDoc, arrayRemove, arrayUnion, setDoc, deleteDoc } from '@angular/fire/firestore';
import { PlanActivityComponent } from '../plan-activity/plan-activity.component';
import { ManageCohertsComponent } from '../manage-coherts/manage-coherts.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { UnassignedParticipantsDialogComponent } from '../unassigned-participants-dialog/unassigned-participants-dialog.component';
import { environment } from '../../../environments/environment.development';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { Storage,ref,uploadBytes,getDownloadURL } from '@angular/fire/storage';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { MapRecommendedplaylistToparticipantComponentComponent } from '../../Participants Profile Management/participants-analytics/map-recommendedplaylist-toparticipant.component/map-recommendedplaylist-toparticipant.component.component';

@Component({
  selector: 'app-big-cohort-clone-2',
  imports: [
    MatFormFieldModule,
    CommonModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    MatInputModule,
    MatMenuModule
  ],
  templateUrl: './big-cohort-clone-2.component.html',
  styleUrl: './big-cohort-clone-2.component.css'
})
export class BigCohortClone2Component {

  // ==== Design B additions ====
  selectMode = false
  selectedCohortIds = new Set<string>()
  mobileSheetOpen = false
  private _sheetOpenedAt = 0

  openMobileSheet(ev: Event): void {
    ev.stopPropagation()
    this.mobileSheetOpen = true
    this._sheetOpenedAt = Date.now()
  }
  closeMobileSheet(ev: Event): void {
    // Guard against ghost/touch-through clicks within 350ms of opening
    if (Date.now() - this._sheetOpenedAt < 350) return
    const t = ev.target as HTMLElement
    if (!t.classList.contains('scrim')) return
    this.mobileSheetOpen = false
  }

  toggleSelectMode(): void {
    this.selectMode = !this.selectMode
    if (!this.selectMode) this.selectedCohortIds.clear()
  }
  isCohortSelected(id: string): boolean {
    return this.selectedCohortIds.has(id)
  }
  toggleCohortSelected(id: string): void {
    if (!id) return
    if (this.selectedCohortIds.has(id)) this.selectedCohortIds.delete(id)
    else this.selectedCohortIds.add(id)
  }
  selectAllCohorts(): void {
    const allIds = (this.filteredCohortsList || []).map((c: any) => c.docid).filter(Boolean)
    const anyUnchecked = allIds.some((id: string) => !this.selectedCohortIds.has(id))
    if (anyUnchecked) allIds.forEach((id: string) => this.selectedCohortIds.add(id))
    else this.selectedCohortIds.clear()
  }
  private mergedCohortForSelection(): any {
    const ids = Array.from(this.selectedCohortIds)
    const cohorts = (this.filteredCohortsList || []).filter((c: any) => ids.includes(c.docid))
    const participantidlist: string[] = []
    const mentors: string[] = []
    const seen = new Set<string>()
    cohorts.forEach((c: any) => {
      (c.participantidlist || []).forEach((p: string) => { if (!seen.has(p)) { seen.add(p); participantidlist.push(p) } })
      ;(c.mentors || []).forEach((m: string) => { if (!seen.has(m)) { seen.add(m); mentors.push(m) } })
    })
    return { name: `${cohorts.length} cohort(s)`, participantidlist, mentors }
  }
  sendSelectedCohortsNotification(): void {
    if (this.selectedCohortIds.size === 0) return
    ;(this as any).sendCohortNotification?.(this.mergedCohortForSelection())
  }
  sendSelectedCohortsEmail(): void {
    if (this.selectedCohortIds.size === 0) return
    ;(this as any).sendCohortEmail?.(this.mergedCohortForSelection())
  }
  sendSelectedCohortsWhatsapp(): void {
    if (this.selectedCohortIds.size === 0) return
    ;(this as any).sendCohortWhatsapp?.(this.mergedCohortForSelection())
  }

  sendSelectedCohortsPlaylist(): void {
    if (this.selectedCohortIds.size === 0) return
    ;(this as any).sendCohortRecommendedPlaylist?.(this.mergedCohortForSelection())
  }

  exportSelectedCohorts(): void {
    if (this.selectedCohortIds.size === 0) return
    // Temporarily narrow filteredCohortsList to the selected set, reuse existing export, then restore.
    const full = this.filteredCohortsList
    const subset = full.filter((c: any) => this.selectedCohortIds.has(c.docid))
    this.filteredCohortsList = subset
    try { (this as any).exportCohortsData?.() } finally { this.filteredCohortsList = full }
  }
  // ==== Participant multi-select (per cohort) ====
  participantSelectCohortId: string | null = null
  selectedParticipantIds = new Set<string>()

  toggleParticipantSelectMode(cohortId: string): void {
    if (this.participantSelectCohortId === cohortId) {
      this.participantSelectCohortId = null
      this.selectedParticipantIds.clear()
    } else {
      this.participantSelectCohortId = cohortId
      this.selectedParticipantIds.clear()
    }
  }
  isParticipantSelectActive(cohortId: string): boolean {
    return this.participantSelectCohortId === cohortId
  }
  isParticipantChecked(pid: string): boolean {
    return this.selectedParticipantIds.has(pid)
  }
  toggleParticipantChecked(pid: string, ev?: Event): void {
    if (ev) ev.stopPropagation()
    if (this.selectedParticipantIds.has(pid)) this.selectedParticipantIds.delete(pid)
    else this.selectedParticipantIds.add(pid)
  }
  private cohortForSelected(cohort: any): any {
    const ids = Array.from(this.selectedParticipantIds)
    return { ...cohort, participantidlist: ids, mentors: [] }
  }
  sendSelectedNotification(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortNotification?.(this.cohortForSelected(cohort))
  }
  sendSelectedEmail(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortEmail?.(this.cohortForSelected(cohort))
  }
  sendSelectedWhatsapp(cohort: any): void {
    if (this.selectedParticipantIds.size === 0) return
    ;(this as any).sendCohortWhatsapp?.(this.cohortForSelected(cohort))
  }

  async moveSelectedParticipantsTo(sourceCohort: any, targetCohort: any): Promise<void> {
    const ids = Array.from(this.selectedParticipantIds)
    for (const pid of ids) {
      // Await each move so the isMovingParticipant guard releases between calls
      await (this as any).moveParticipantToCohort?.(pid, sourceCohort, targetCohort)
    }
    this.selectedParticipantIds.clear()
    this.participantSelectCohortId = null
  }

  hasActiveFilters(): boolean {
    return !!this.selectedMarathon
      || (this.selectedAcceleratorEvent?.length || 0) > 0
      || (this.selectedQueueEvent?.length || 0) > 0
      || (this.selectedZoneEvent?.length || 0) > 0
      || this.statusFilter !== 'all'
      || this.categoryFilter !== 'all'
      || this.typeFilter !== 'all'
      || (this.selectedTags?.length || 0) > 0
  }

  clearAllFilters(): void {
    if (this.selectedMarathon) this.toggleMarathonSelection?.(this.selectedMarathon)
    this.clearEventSelection?.()
    this.clearQueueSelection?.()
    this.setStatusFilter?.('all')
    this.setCategoryFilter?.('all')
    this.setTypeFilter?.('all')
    this.clearZoneSelection?.();
    ;(this as any).clearTagSelection?.()
  }

  onCardClick(event: MouseEvent, cohort: any): void {
    if (!this.selectMode) return
    const target = event.target as HTMLElement
    if (target.closest('button, .card-menu, .row-action, .foot-btn, .seg button, mat-menu, .mat-menu-content')) return
    this.toggleCohortSelected(cohort.docid)
  }

  cohortsList: any[] = []
  filteredCohortsList: any[] = []
  groupedCohorts: { [key: string]: any[] } = {}
  groupedCohortsDateRange: { [key: string]: { cohorts: any[], startDate: Date, endDate: Date } } = {}
  marathonList: any[] = []
  filteredMarathonList: any[] = []
  participantlist: any = {};

  acceleratorEventList: any[] = []
  filteredAcceleratorEventList: any[] = []
  searchableEventList: any[] = []

  zoneEventEventList: any[] = []
  filteredZoneEventList: any[] = []
  searchableZoneEventList: any[] = []
  selectedZoneEvent: string[] = []
  zoneDropdownOpen: boolean = false
  zoneSearchQuery: string = ''
  mapZoneData: { [zoneId: string]: any } = {}
  zoneMappedCohortIds: Set<string> = new Set()

  mapProfile: any = {}
  mapParticipantMetaData = {};
  contentview = 'participants'
  selectedMarathon: string | null = null
  selectedAcceleratorEvent: string[] = []
  mapMarathon: any = {}
  mapAcceleratorEvent: any = {}
  mapBigCohortsToAssignment: any = {};
  mapZoneEvent: any = {};

  mapBigAssignment: any = {}
  private subscription = new Subject<void>();
  mapParticiantsAssignments: any = {}
  mapCompletedParticiantsAssignments: any = {}
  mapOngoingAssignments: any = {}
  mapCompletedAssignments: any = {}

  totalParticpantsEngagement = 0
  totalParticipantsInCohorts: any[] = []

  loading: boolean = true;

  loggedInProfile: any

  // UI State
  cohortSearchQuery: string = '';
  participantSearchQuery: string = '';
  marathonDropdownOpen: boolean = false
  eventDropdownOpen: boolean = false
  marathonSearchQuery: string = ''
  eventSearchQuery: string = ''

  // View Mode
  viewMode: 'horizontal' | 'vertical' = 'vertical'

  // Filter States
  statusFilter: 'all' | 'active' | 'nonactive' = 'all'
  categoryFilter: 'all' | 'studio' | 'readiness' | 'educational' | 'operational' = 'all'
  typeFilter: 'all' | 'general' | 'event' = 'all'

  // Filter Dropdown States
  statusDropdownOpen: boolean = false
  categoryDropdownOpen: boolean = false
  typeDropdownOpen: boolean = false
  taggingDropdownOpen: boolean = false

  // Grouping States
  groupBy: 'none' | 'levels' | 'daterange' = 'none'
  showTemporaryOnly: boolean = false
  showExpiredCohorts: boolean = false

  // Tags from participant tags collection
  participantTagsList: any[] = []
  filteredTagsList: any[] = []
  selectedTags: string[] = []
  tagSearchQuery: string = ''

  // Big Invitation data for unassigned participants
  bigInvitationList: any[] = []
  unassignedParticipants: any[] = []

  // Live Assignment data for participant status
  liveAssignmentList: any[] = []
  mapLiveParticipants: { [key: string]: boolean } = {}

  // Queue
  queueSearchQuery: string = ''
  searchableQueueList: any[] = [];
  queueDropdownOpen: boolean = false
  selectedQueueEvent: any[] = [];
  filteredQueueList: any[] = [];
  mapQueueName: any = {};
  liveassignmentSubscription: Subscription | null = null;

  // Studio
  studioPairingList: any[] = [];
  queuestudioSubscription: Subscription | null = null;

  // Studio mapping for participant status
  mapStudioPairing: { [studioId: string]: any } = {};
  mapParticipantStudios: { [participantId: string]: any[] } = {};
  mapLiveAssignmentByStudio: { [studioId: string]: any } = {};

  showProgressionDialog: boolean = false
  progressionLoading: boolean = false
  progressionData: any[] = []
  groupedProgressionData: { [profileId: string]: any[] } = {}
  progressionSearchQuery: string = ''
  filteredProgressionProfiles: string[] = []
  selectedMarathonEvent = [];
  eventParticipationList: any[] = [];

  bigActivityMap = {};

  // LocalStorage keys
  private readonly STORAGE_KEY_QUEUE = 'big_cohort_selected_queue';
  private readonly STORAGE_KEY_EVENT = 'big_cohort_selected_event';
  private readonly STORAGE_KEY_ZONE = 'big_cohort_selected_zone';

  private destroy$ = new Subject<void>()
  private storage = inject(Storage)
  private _snackBar = inject(MatSnackBar)

  constructor(
    private firestore: Firestore,
    public authguard: AuthguardService,
    private dialog: MatDialog,
    private router: Router,
    private http : HttpClient
  ) {
    this.contentview = 'participants';
    this.authguard.getProfileMap().then(e => this.mapProfile = e.map)
    this.authguard.username().then((e) => this.loggedInProfile = e)

    this.loadParticipantTags();
    this.loadBigInvitations();
    this.loadActivity();

    // Load saved selections from localStorage
    this.loadSavedSelections();

    collectionSnapshots(collection(this.firestore, "big cohorts"))
      .pipe(takeUntil(this.subscription))
      .subscribe(snapData => {
        this.cohortsList = snapData.map(d => {
          let element: any = d.data()
          const existing = this.cohortsList?.find((c: any) => c.docid === element.docid)
          element['contentview'] = existing?.['contentview'] ?? 'participants'
          return element
        })
        this.filteredCohortsList = this.cohortsList
        this.toRunFilterFunctions()
      })
    getDocs(query(collection(this.firestore, "big marathon"), orderBy("startdate", "asc"))).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element: any = snap.docs[i].data();
        element['ref'] = snap.docs[i].ref
        this.mapMarathon[element['docid']] = element
        this.marathonList.push(element)
      }
      this.filteredMarathonList = [...this.marathonList]

      this.selectedMarathon = this.marathonList[this.marathonList.length - 1]['docid']
      this.toRunFilterFunctions()
    })
    getDocs(collection(this.firestore, "event collection")).then(snap => {
      this.acceleratorEventList = snap.docs.map((e) => {
        let element: any = e.data()
        element['ref'] = e.ref
        this.mapAcceleratorEvent[element['ref'].id] = element['name']
        return element
      }).filter(e => e['bigmarathonref'] != undefined)

      // Sort events - ongoing first
      this.acceleratorEventList = this.sortEventsWithOngoingFirst(this.acceleratorEventList);

      this.filteredAcceleratorEventList = this.acceleratorEventList
      this.searchableEventList = [...this.acceleratorEventList]
      
      // Patch saved event selections
      this.patchSavedEventSelections();
      this.toRunFilterFunctions()
    });

    getDocs(collection(this.firestore, 'event zones')).then((zones) => {
      this.zoneEventEventList = zones.docs.map((e) => {
        let element: any = e.data();
        element['ref'] = e.ref;
        element['docid'] = element['docid'] || e.id;
        this.mapZoneEvent[e.ref.id] = element['name'];
        this.mapZoneData[e.ref.id] = element;
        return element;
      });
      this.filteredZoneEventList = [...this.zoneEventEventList];
      this.searchableZoneEventList = [...this.zoneEventEventList];

      // Patch saved zone selections
      this.patchSavedZoneSelections();
    });

    let collectionName = "participant metadata"

    getDocs(query(collection(this.firestore, "journey"), where("atcmodel", "==", "B!G"))).then((snap) => {
      if (!snap.empty) {
        let bigJourneyList = snap.docs.map(e => e.id)
      } else {
        console.log("No Participants list found");
      }
    });

    getDocs(query(collection(this.firestore, collectionName),orderBy('name','asc'))).then((participants) => {
      let participantsList = participants.docs.map(e => e.data())
      let list = participants.docs.forEach((e)=>this.mapParticipantMetaData[e.id] = e.data())
      this.participantlist = participantsList;
    })    

    getDocs(collection(this.firestore, "queue generation")).then(queue => {
      const queueData = queue.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          docid: doc.id,
          ...data
        };
      });
      
      // Sort queues - ongoing first
      const sortedQueueData = this.sortQueuesWithOngoingFirst(queueData);
      
      this.searchableQueueList = [...sortedQueueData];
      this.filteredQueueList = [...sortedQueueData];
      
      queue.docs.forEach((doc) => {
        this.mapQueueName[doc.id] = doc.data()['queuename'];
      });

      // Patch saved queue selections
      this.patchSavedQueueSelections();
    });

  }

  ngOnInit(): void {

  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  loadActivity(){
    getDocs(query(collection(this.firestore, 'bigactivity'),orderBy('activity','asc'))).then((activity)=>{
      this.bigActivityMap = {};
      activity.docs.map(e => {
        const data: any = e.data();
        return this.bigActivityMap[e.id] = data;
      });
      console.log(this.bigActivityMap);
    });
  }

  // Load saved selections from localStorage
  loadSavedSelections() {
    try {
      const savedQueue = localStorage.getItem(this.STORAGE_KEY_QUEUE);
      const savedEvent = localStorage.getItem(this.STORAGE_KEY_EVENT);
      const savedZone = localStorage.getItem(this.STORAGE_KEY_ZONE);

      if (savedQueue) {
        this.selectedQueueEvent = JSON.parse(savedQueue);
      }
      if (savedEvent) {
        this.selectedAcceleratorEvent = JSON.parse(savedEvent);
      }
      if (savedZone) {
        this.selectedZoneEvent = JSON.parse(savedZone);
      }
    } catch (e) {
      console.error('Error loading saved selections:', e);
    }
  }

  // Save queue selection to localStorage
  saveQueueSelection() {
    try {
      localStorage.setItem(this.STORAGE_KEY_QUEUE, JSON.stringify(this.selectedQueueEvent));
    } catch (e) {
      console.error('Error saving queue selection:', e);
    }
  }

  // Save event selection to localStorage
  saveEventSelection() {
    try {
      localStorage.setItem(this.STORAGE_KEY_EVENT, JSON.stringify(this.selectedAcceleratorEvent));
    } catch (e) {
      console.error('Error saving event selection:', e);
    }
  }

  // Patch saved queue selections after data loads
  patchSavedQueueSelections() {
    if (this.selectedQueueEvent.length > 0) {
      // Validate saved selections exist in the list
      this.selectedQueueEvent = this.selectedQueueEvent.filter(id => 
        this.filteredQueueList.some(q => q.id === id || q.docid === id)
      );
      if (this.selectedQueueEvent.length > 0) {
        this.loadLiveAssignments();
        this.calculateUnassignedParticipants();
      }
    }
  }

  // Patch saved event selections after data loads
  patchSavedEventSelections() {
    if (this.selectedAcceleratorEvent.length > 0) {
      // Validate saved selections exist in the list
      this.selectedAcceleratorEvent = this.selectedAcceleratorEvent.filter(id => 
        this.acceleratorEventList.some(e => e.ref?.id === id)
      );
      if (this.selectedAcceleratorEvent.length > 0) {
        this.loadEventParticipationRequests();
      }
    }
  }

  // Sort queues with ongoing first
  sortQueuesWithOngoingFirst(queueData: any[]): any[] {
    const now = new Date();
    
    return queueData.sort((a: any, b: any) => {
      const startA = a['queuestartdate']?.toDate ? a['queuestartdate'].toDate() : new Date(a['queuestartdate'] || 0);
      const endA = a['queueenddate']?.toDate ? a['queueenddate'].toDate() : new Date(a['queueenddate'] || 0);
      const startB = b['queuestartdate']?.toDate ? b['queuestartdate'].toDate() : new Date(b['queuestartdate'] || 0);
      const endB = b['queueenddate']?.toDate ? b['queueenddate'].toDate() : new Date(b['queueenddate'] || 0);
      
      const isOngoingA = now >= startA && now <= endA;
      const isOngoingB = now >= startB && now <= endB;
      
      // Ongoing queues first
      if (isOngoingA && !isOngoingB) return -1;
      if (!isOngoingA && isOngoingB) return 1;
      
      // Then sort by start date descending
      return endB.getTime() - endA.getTime();
    });
  }

  // Sort events with ongoing first
  sortEventsWithOngoingFirst(eventData: any[]): any[] {
    const now = new Date();
    
    return eventData.sort((a: any, b: any) => {
      const startA = a['startdate']?.toDate ? a['startdate'].toDate() : new Date(a['startdate'] || 0);
      const endA = a['enddate']?.toDate ? a['enddate'].toDate() : new Date(a['enddate'] || 0);
      const startB = b['startdate']?.toDate ? b['startdate'].toDate() : new Date(b['startdate'] || 0);
      const endB = b['enddate']?.toDate ? b['enddate'].toDate() : new Date(b['enddate'] || 0);
      
      const isOngoingA = now >= startA && now <= endA;
      const isOngoingB = now >= startB && now <= endB;
      
      // Ongoing events first
      if (isOngoingA && !isOngoingB) return -1;
      if (!isOngoingA && isOngoingB) return 1;
      
      // Then sort by end date descending
      return endB.getTime() - endA.getTime();
    });
  }

  // Check if queue is ongoing
  isQueueOngoing(queue: any): boolean {
    const now = new Date();
    const start = queue['queuestartdate']?.toDate ? queue['queuestartdate'].toDate() : new Date(queue['queuestartdate'] || 0);
    const end = queue['queueenddate']?.toDate ? queue['queueenddate'].toDate() : new Date(queue['queueenddate'] || 0);
    return now >= start && now <= end;
  }

  // Check if event is ongoing
  isEventOngoing(event: any): boolean {
    const now = new Date();
    const start = event['startdate']?.toDate ? event['startdate'].toDate() : new Date(event['startdate'] || 0);
    const end = event['enddate']?.toDate ? event['enddate'].toDate() : new Date(event['enddate'] || 0);
    return now >= start && now <= end;
  }

  loadParticipantTags() {
    getDocs(collection(this.firestore, "participant tags")).then(snap => {
      this.participantTagsList = snap.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
      this.filteredTagsList = [...this.participantTagsList];
    });
  }

  loadBigInvitations() {
    getDocs(query(collection(this.firestore, "biginvitation"), where("status", "==", "accepted"))).then(snap => {
      this.bigInvitationList = snap.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
      this.calculateUnassignedParticipants();
    });
  }

  loadEventParticipationRequests() {
    if (this.selectedAcceleratorEvent.length === 0) {
      this.eventParticipationList = [];
      this.calculateUnassignedParticipants();
      return;
    }

    const selectedEventRefs = this.selectedAcceleratorEvent.map(eventId => 
      doc(this.firestore, 'event collection', eventId)
    );

    getDocs(query(
      collection(this.firestore, "event participation request"),
      where("eventref", "in", selectedEventRefs),
      where("status", 'in', ["approved",'attended'])
    )).then(snap => {
      this.eventParticipationList = snap.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
      this.calculateUnassignedParticipants();
    }).catch(err => {
      console.error('Error fetching event participation requests:', err);
      this.eventParticipationList = [];
      this.calculateUnassignedParticipants();
    });
  }

  loadLiveAssignments() {
    if (this.liveassignmentSubscription) { this.liveassignmentSubscription.unsubscribe(); }
    if (this.queuestudioSubscription) { this.queuestudioSubscription.unsubscribe(); }

    if (this.selectedQueueEvent.length === 0) {
      this.liveAssignmentList = [];
      this.studioPairingList = [];
      this.mapLiveParticipants = {};
      this.mapStudioPairing = {};
      this.mapParticipantStudios = {};
      this.mapLiveAssignmentByStudio = {};
      return;
    }

    this.liveassignmentSubscription = collectionSnapshots(
      query(
        collection(this.firestore, "live assignment"),
        where("status", "==", "live"),
        where('queueid', 'in', this.selectedQueueEvent)
      )
    ).pipe(takeUntil(this.subscription)).subscribe(snapData => {
      this.liveAssignmentList = snapData.map(doc => ({ id: doc.id, ...doc.data() }));

      this.mapLiveAssignmentByStudio = {};
      this.liveAssignmentList.forEach((assignment: any) => {
        if (assignment['studioid']) {
          this.mapLiveAssignmentByStudio[assignment['studioid']] = assignment;
        }
      });

      this.updateParticipantStudioMappings();
    });

    const selectedQueueRef = this.selectedQueueEvent.map(id => doc(this.firestore, 'queue generation', id));
    console.log(selectedQueueRef[0].path);

    this.queuestudioSubscription = collectionSnapshots(
      query(
        collection(this.firestore, 'queue studio pairing'),
        where("queueref", "in", selectedQueueRef),
        orderBy("created", "desc")
      )
    ).pipe(takeUntil(this.subscription)).subscribe(snapData => {
      console.log(snapData.length);

      this.studioPairingList = snapData.map(doc => ({ id: doc.id, docid: doc.id, ...doc.data() }));

      this.mapStudioPairing = {};
      this.studioPairingList.forEach((studio: any) => {
        this.mapStudioPairing[studio.docid || studio.id] = studio;
      });

      this.updateParticipantStudioMappings();
    });
  }

  updateParticipantStudioMappings() {
    this.mapLiveParticipants = {};
    this.mapParticipantStudios = {};

    this.studioPairingList.forEach((studio: any) => {
      const studioId = studio.docid || studio.id;
      const participants = studio.participants || [];
      const liveAssignment = this.mapLiveAssignmentByStudio[studioId];
      const isLive = !!liveAssignment;

      participants.forEach((participantId: string) => {
        if (!this.mapParticipantStudios[participantId]) {
          this.mapParticipantStudios[participantId] = [];
        }

        this.mapParticipantStudios[participantId].push({
          studioId: studioId,
          isLive: isLive,
          checkin: studio.checkin || false,
          studioin: studio.studioin || false,
          liveAssignment: liveAssignment,
          studioData: studio
        });

        if (isLive) {
          this.mapLiveParticipants[participantId] = true;
        }
      });
    });

    this.liveAssignmentList.forEach((assignment: any) => {
      const allParticipants = [
        ...(assignment['pairing'] || []),
        ...(assignment['bonusactivityparticipant'] || [])
      ];

      allParticipants.forEach((pid: string) => {
        this.mapLiveParticipants[pid] = true;
      });
    });
  }

  isParticipantInStudio(participantId: string): boolean {
    return this.mapLiveParticipants[participantId] === true;
  }

  getParticipantStatus(participantId: string): string {
    return this.isParticipantInStudio(participantId) ? 'Live' : 'Idle';
  }

  getParticipantLiveStudioCount(participantId: string): number {
    const studios = this.mapParticipantStudios[participantId] || [];
    return studios.filter(s => s.isLive).length;
  }

  getParticipantStudios(participantId: string): any[] {
    return this.mapParticipantStudios[participantId] || [];
  }

  getParticipantTotalStudioCount(participantId: string): number {
    return (this.mapParticipantStudios[participantId] || []).length;
  }

  hasParticipantCheckedIn(participantId: string): boolean {
    const studios = this.mapParticipantStudios[participantId] || [];
    return studios.some(s => s.checkin === true);
  }

  isParticipantInStudioRoom(participantId: string): boolean {
    const studios = this.mapParticipantStudios[participantId] || [];
    return studios.some(s => s.studioin === true);
  }

  getParticipantStudioSummary(participantId: string): {
    totalStudios: number;
    liveStudios: number;
    checkedIn: boolean;
    inStudioRoom: boolean;
    studios: any[];
  } {
    const studios = this.mapParticipantStudios[participantId] || [];
    return {
      totalStudios: studios.length,
      liveStudios: studios.filter(s => s.isLive).length,
      checkedIn: studios.some(s => s.checkin === true),
      inStudioRoom: studios.some(s => s.studioin === true),
      studios: studios
    };
  }

  getIdleCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    return participants.filter((pid: string) => !this.isParticipantInStudio(pid)).length;
  }

  getInStudioCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    return participants.filter((pid: string) => this.isParticipantInStudio(pid)).length;
  }

  getCohortStudioStats(cohort: any): {
    totalLiveStudios: number;
    checkedInCount: number;
    inStudioRoomCount: number;
  } {
    const participants = cohort['participantidlist'] || [];
    let totalLiveStudios = 0;
    let checkedInCount = 0;
    let inStudioRoomCount = 0;

    participants.forEach((pid: string) => {
      const summary = this.getParticipantStudioSummary(pid);
      totalLiveStudios += summary.liveStudios;
      if (summary.checkedIn) checkedInCount++;
      if (summary.inStudioRoom) inStudioRoomCount++;
    });

    return { totalLiveStudios, checkedInCount, inStudioRoomCount };
  }

  getParticipantStudioInList(participantId: string): any[] {
    const studios = this.mapParticipantStudios[participantId] || [];
    return studios.filter(s => s.studioin === true);
  }

  getParticipantLiveAssignmentStats(participantId: string): {
    total: number;
    live: number;
    completed: number;
    assignments: any[];
  } {
    const participantAssignments: any[] = [];
    let liveCount = 0;
    let completedCount = 0;

    this.liveAssignmentList.forEach((assignment: any) => {
      const pairing = assignment['pairing'] || [];
      const bonusParticipants = assignment['bonusactivityparticipant'] || [];
      const allParticipants = [...pairing, ...bonusParticipants];

      if (allParticipants.includes(participantId)) {
        const status = assignment['status'] || 'live';
        participantAssignments.push({
          ...assignment,
          participantStatus: status
        });

        if (status === 'live' || status === 'ongoing') {
          liveCount++;
        } else if (status === 'completed') {
          completedCount++;
        }
      }
    });

    return {
      total: participantAssignments.length,
      live: liveCount,
      completed: completedCount,
      assignments: participantAssignments
    };
  }

  getStudioDisplayName(studio: any): string {
    return studio.studioData?.studioname ||
      studio.studioData?.name ||
      studio.studioId?.substring(0, 8) ||
      'Studio';
  }

  getParticipantCheckedInCount(participantId: string): number {
    const studios = this.mapParticipantStudios[participantId] || [];
    return studios.filter(s => s.checkin === true).length;
  }

  calculateUnassignedParticipants() {
    if (this.selectedAcceleratorEvent.length === 0 && this.selectedQueueEvent.length === 0) {
      this.unassignedParticipants = [];
      return;
    }

    const assignedParticipantIds = new Set<string>();
    this.cohortsList.forEach(cohort => {
      const eventRefId = cohort['eventref']?.id;
      const marathonRefId = cohort['marathonref']?.id;

      const matchesEvent = this.selectedAcceleratorEvent.length > 0 &&
        this.selectedAcceleratorEvent.includes(eventRefId);
      const matchesMarathon = this.selectedMarathon && marathonRefId === this.selectedMarathon;

      if (matchesEvent) {
        (cohort['participantidlist'] || []).forEach((id: string) => {
          assignedParticipantIds.add(id);
        });
      }
    });

    const useEventParticipation = this.selectedAcceleratorEvent.length > 0;
    const useBigInvitation = this.selectedQueueEvent.length > 0 || this.selectedAcceleratorEvent.length > 0;

    const participantMap = new Map<string, any>();

    if (useEventParticipation && this.eventParticipationList.length > 0) {
      this.eventParticipationList.forEach(request => {
        const eventRefId = request['eventref']?.id;
        const participantId = request['participantid'] || request['profileid'];

        if (!participantId || assignedParticipantIds.has(participantId)) return;
        if (!this.selectedAcceleratorEvent.includes(eventRefId)) return;
        const key = `${participantId}_${eventRefId}`;

        participantMap.set(key, {
          ...request,
          participantId: participantId,
          name: this.mapProfile[participantId] || this.mapParticipantMetaData[participantId]?.['name'] || participantId,
          eventName: this.mapAcceleratorEvent[eventRefId] || 'Unknown Event',
          sources: ['event_participation_request'],
          inEventRequest: true,
          inBigInvitation: false
        });
      });
    }

    if (useBigInvitation && this.bigInvitationList.length > 0) {
      this.bigInvitationList.forEach(invitation => {
        const eventRefId = invitation['eventref']?.id;
        const participantId = invitation['participantid'] || invitation['profileid'];

        if (!participantId || assignedParticipantIds.has(participantId)) return;

        if (this.selectedAcceleratorEvent.length > 0) {
          if (!this.selectedAcceleratorEvent.includes(eventRefId)) return;
        }

        const key = `${participantId}_${eventRefId}`;
        
        if (participantMap.has(key)) {
          const existing = participantMap.get(key);
          existing.sources.push('big_invitation');
          existing.inBigInvitation = true;
          existing.bigInvitationData = invitation;
          participantMap.set(key, existing);
        } else {
          participantMap.set(key, {
            ...invitation,
            participantId: participantId,
            name: this.mapProfile[participantId] || this.mapParticipantMetaData[participantId]?.['name'] || participantId,
            eventName: this.mapAcceleratorEvent[eventRefId] || 'Unknown Event',
            sources: ['big_invitation'],
            inEventRequest: false,
            inBigInvitation: true
          });
        }
      });
    }

    this.unassignedParticipants = Array.from(participantMap.values());
  }

  showUnassignedParticipants() {
    this.calculateUnassignedParticipants();
    const ref = this.dialog.open(UnassignedParticipantsDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      maxHeight: '80vh',
      panelClass: 'unassigned-dialog-container',
      data: {
        participants: this.unassignedParticipants,
        mapProfile: this.mapProfile,
        mapParticipantMetaData: this.mapParticipantMetaData,
        mapAcceleratorEvent: this.mapAcceleratorEvent,
        selectedEvents: this.selectedAcceleratorEvent,
        selectedQueues: this.selectedQueueEvent,
        cohortsList: this.selectedAcceleratorEvent.length > 0
          ? this.filteredCohortsList.filter(c => c['eventref'] && this.selectedAcceleratorEvent.includes(c['eventref'].id))
          : (this.filteredCohortsList.length > 0 ? this.filteredCohortsList : this.cohortsList)
      }
    });
    ref.afterClosed().subscribe((result: any) => {
      if (!result || result.action !== 'assign' || !result.cohort) return;
      this.assignUnassignedToCohort(result.participantIds || [], result.cohort);
    });
  }

  async assignUnassignedToCohort(participantIds: string[], targetCohort: any): Promise<void> {
    if (!participantIds?.length || !targetCohort?.docid) return;
    const targetRef = doc(this.firestore, 'big cohorts', targetCohort.docid);
    try {
      await updateDoc(targetRef, { participantidlist: arrayUnion(...participantIds) });
      if (!targetCohort.participantidlist) targetCohort.participantidlist = [];
      participantIds.forEach(pid => {
        if (!targetCohort.participantidlist.includes(pid)) targetCohort.participantidlist.push(pid);
      });
      this.unassignedParticipants = (this.unassignedParticipants || []).filter(
        (p: any) => !participantIds.includes(p.participantId || p.id)
      );
      alert(`Assigned ${participantIds.length} participant(s) to ${targetCohort.name}`);
    } catch (err) {
      console.error('Error assigning participants:', err);
      alert('Error assigning participants. Please try again.');
    }
  }
  
  openCohortChat(cohort: any) {
    const chatDocId = cohort['docid'];
    window.open(window.location.origin + '/group-chat');
  }

  sendCohortNotification(cohorts){    
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMetaData[e])
    let dialogRef = this.dialog.open(AhNotificationComponent,{
      width : "60vw",
      maxHeight: "90vh",
      disableClose:true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(result,'send app notificationssss');
      if(result != null && result != undefined){
        var userID = [];
        var profileID = [];
        console.log(selectedParticipants,"selectedParticipants");
        for (let i = 0; i < selectedParticipants.length; i++) {
          const selected = selectedParticipants[i];
          if(selected["firebaseuserref"] != null){
            profileID.push(selected["profileid"])
          }
        }

        var notificationimage = null
        if(result["notificationimage"] != null){
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(this.storage,filepath)
            const uploadResult = await uploadBytes(storageRef,result["notificationimage"])
            notificationimage = await getDownloadURL(uploadResult.ref)
          } catch (error) {
            console.log("file upload error",error);
          }
        }
        console.log(profileID,"profileIDprofileIDprofileIDprofileID");
        this.authguard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true, 
          landingpage: result["landingpage"],
          profileid: profileID,
          receivingapp: result["receivingapp"] ?? "breakthroughsapp",
        }).then(()=>{
          console.log( notificationimage)
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  };

  sendCohortEmail(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMetaData[e])
    console.log(selectedParticipants);
    
    let dialogRef = this.dialog.open(EmailInputComponent,{
      data : selectedParticipants,
      minWidth : "600px",
      disableClose:true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if(result != null && result != undefined){
        console.log(result);
        
        const docRef = doc(collection(this.firestore,"email archive"),result['docid']);
        if(result['status'] == 'queued' || result['status'] == 'send'){
          await setDoc(docRef,result,{merge:true}).then(() => {
            this.authguard.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : "Email Sent Successfully", "OK",600);
          }).catch(err => {
            console.log(err);
            this.authguard.openSnackBar("Error Sending Email", "OK",600);
          });
        }else if (result['status'] == 'validated'){
          let url:string;
          if(environment.firebase.projectId == 'starlabs-test'){
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }
          console.log("EMAIL :", url);
          let data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url, JSON.stringify(data),{
            responseType: 'text',
            headers: new HttpHeaders().set('Content-Type', 'application/json'),
          }).subscribe({
            next: (response) => {
              console.log('response', response);
            },
            error: (err) => {
              console.log(err);
              console.log("Error: " + err);
            }
          });
        }

      }
    })
  };

  sendCohortWhatsapp(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMetaData[e])
    
    let dialogRef = this.dialog.open(WatiInputComponent,{
      data : selectedParticipants,
      width : "70vw",
      height : "80vh",
      disableClose:true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if(result != null && result != undefined){
        if(result == 'success') {
          this.authguard.openSnackBar("Wati Message Sent Successfully", "OK",600);
          if(result['status'] == 'sendtoparticipants'){
            let url:string;

            if(environment.firebase.projectId == 'starlabs-test'){
              url = "https://us-central1-starlabs-test.cloudfunctions.net/sendWhatsAppBroadcast";
            }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
              url = ""
            } 

            const docRef = doc(collection(this.firestore , 'wati archive'), result['archiveid']);
            await updateDoc(docRef, {
              templatestatus: "created",
              templatevalidated: true,
            }).then(() => {
              console.log("Wati Archive Document Created");
            }).catch((error) => {
              console.log("Error Creating Wati Archive");
            });

            const response = await this.http.post(url, { archiveid: result['archiveid'] }).toPromise();
            console.log("Response : ",response)

          }
        } else if(result == 'failed') {
          this.authguard.openSnackBar("Sending Wati Message Failed", "OK",600);
        }
      }
    });
  };

  sendCohortRecommendedPlaylist(cohorts){
    let selected = cohorts['mentors'] != null && cohorts['mentors'].length > 0 ? [...cohorts['mentors'], ...cohorts['participantidlist']] : cohorts['participantidlist'];
    const selectedParticipants = selected.map((e)=>this.mapParticipantMetaData[e]);

    let dialogRef = this.dialog.open(MapRecommendedplaylistToparticipantComponentComponent, {
      data: {
        participantlist: selectedParticipants,
        // personalised : personalised
      },
      minWidth: "500px",
      disableClose: true
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
      if (result != null && result != undefined) {
        let docid = doc(collection(this.firestore, "buffermix archive")).id
        result['docid'] = docid
        setDoc(doc(this.firestore, "buffermix archive", docid), result).then(() => {
          console.log("buffer document created");
        }).catch(err => {
          console.log(err);
        })
      }
    });
  }

  moveMenuSearchQuery: string = '';
  moveMenuFilteredCohorts: any[] = [];
  isMovingParticipant: boolean = false;

  filterMoveMenuCohorts(sourceCohortId: string) {
    const query = this.moveMenuSearchQuery.toLowerCase().trim();
    let cohorts = this.filteredCohortsList.filter(c => c.docid !== sourceCohortId);

    if (query) {
      cohorts = cohorts.filter(c => c.name?.toLowerCase().includes(query));
    }

    this.moveMenuFilteredCohorts = cohorts;
  }

  onMoveMenuOpen(sourceCohortId: string) {
    this.moveMenuSearchQuery = '';
    this.filterMoveMenuCohorts(sourceCohortId);
  }

  onMoveMenuSearch(event: Event, sourceCohortId: string) {
    event.stopPropagation();
    this.filterMoveMenuCohorts(sourceCohortId);
  }

  async moveParticipantToCohort(participantId: string, sourceCohort: any, targetCohort: any) {
    if (this.isMovingParticipant) return;

    this.isMovingParticipant = true;

    try {
      const sourceCohortRef = doc(this.firestore, "big cohorts", sourceCohort.docid);
      await updateDoc(sourceCohortRef, {
        participantidlist: arrayRemove(participantId)
      });

      const targetCohortRef = doc(this.firestore, "big cohorts", targetCohort.docid);
      await updateDoc(targetCohortRef, {
        participantidlist: arrayUnion(participantId)
      });

      await this.createMoveLog(participantId, sourceCohort, targetCohort);

      const sourceIndex = sourceCohort.participantidlist?.indexOf(participantId);
      if (sourceIndex > -1) {
        sourceCohort.participantidlist.splice(sourceIndex, 1);
      }
      if (!targetCohort.participantidlist) {
        targetCohort.participantidlist = [];
      }
      if (!targetCohort.participantidlist.includes(participantId)) {
        targetCohort.participantidlist.push(participantId);
      }

      console.log(`Moved participant ${participantId} from ${sourceCohort.name} to ${targetCohort.name}`);

    } catch (error) {
      console.error('Error moving participant:', error);
      alert('Error moving participant. Please try again.');
    } finally {
      this.isMovingParticipant = false;
    }
  }

  async createMoveLog(participantId: string, sourceCohort: any, targetCohort: any) {
    const logDocId = doc(collection(this.firestore, "big cohorts log")).id;

    const logData = {
      docid: logDocId,
      createddate: new Date(),
      participantid: participantId,
      cohortid: targetCohort.docid,
      fromcohortid: sourceCohort.docid,
      fromcohortname: sourceCohort.name,
      tocohortname: targetCohort.name,
      eventref: targetCohort.eventref || null,
      addedby: this.loggedInProfile?.profileid || this.loggedInProfile?.uid || '',
      addeddate: new Date(),
      status: 'moved',
      level: targetCohort.level || 'level1',
      marathonref: targetCohort.marathonref || null,
      cohortType: targetCohort.cohortType || 'general',
      cohortCategory: targetCohort.cohortCategory || 'studio'
    };

    await setDoc(doc(this.firestore, "big cohorts log", logDocId), logData);
    console.log('Move log created:', logDocId);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    // Dialogs, the mobile sheet, and filter pills themselves are safe zones —
    // their own click handlers (scrim click / explicit close) control closing.
    if (target.closest('.dialog, .dialog-scrim, .sheet, .scrim, .fi, .fg, .mat-mdc-menu-panel')) return;
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'horizontal' ? 'vertical' : 'horizontal';
  }

  setViewMode(mode: 'horizontal' | 'vertical') {
    this.viewMode = mode;
  }

  onMarathonSearch() {
    const query = this.marathonSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredMarathonList = [...this.marathonList];
    } else {
      this.filteredMarathonList = this.marathonList.filter(m =>
        m['title']?.toLowerCase().includes(query)
      );
    }
  }

  selectMarathon(marathonId: string) {
    this.selectedMarathon = marathonId;
    this.marathonDropdownOpen = false;
    this.marathonSearchQuery = '';
    this.filteredMarathonList = [...this.marathonList];
    this.onFilterAcceleratorEvent();
    this.onFilter();
  }

  onEventSearch() {
    const query = this.eventSearchQuery.toLowerCase().trim();
    if (!query) {
      this.searchableEventList = [...this.filteredAcceleratorEventList];
    } else {
      this.searchableEventList = this.filteredAcceleratorEventList.filter(e =>
        e['name']?.toLowerCase().includes(query)
      );
    }
  }

  toggleEventSelection(eventId: string) {
    const index = this.selectedAcceleratorEvent.indexOf(eventId);
    if (index === -1) {
      this.selectedAcceleratorEvent.push(eventId);
    } else {
      this.selectedAcceleratorEvent.splice(index, 1);
    }
    this.saveEventSelection();
    this.onFilter();
    this.loadEventParticipationRequests();
  }

  clearEventSelection() {
    this.selectedAcceleratorEvent = [];
    this.eventParticipationList = [];
    this.saveEventSelection();
    this.onFilter();
    this.calculateUnassignedParticipants();
  }

  onQueueSearch() {
    const searchTerm = this.queueSearchQuery.toLowerCase().trim();
    if (!searchTerm) {
      this.searchableQueueList = [...this.filteredQueueList];
    } else {
      this.searchableQueueList = this.filteredQueueList.filter((e: any) => {
        const queueName = (e['queuename'] || '').toLowerCase();
        const queueId = (e['id'] || e['docid'] || '').toLowerCase();
        return queueName.includes(searchTerm) || queueId.includes(searchTerm);
      });
    }
  }
    
  toggleQueueSelection(queueId: string) {
    if (!queueId) return;
    
    const index = this.selectedQueueEvent.indexOf(queueId);
    if (index === -1) {
      this.selectedQueueEvent.push(queueId);
    } else {
      this.selectedQueueEvent.splice(index, 1);
    }
    this.saveQueueSelection();
    this.loadLiveAssignments();
    this.calculateUnassignedParticipants();
  }

  toggleMarathonSelection(marathonId){
    if (!marathonId) return;
    
    const index = this.selectedMarathonEvent.indexOf(marathonId);
    if (index === -1) {
      this.selectedMarathonEvent.push(marathonId);
    } else {
      this.selectedMarathonEvent.splice(index, 1);
    }
    this.selectMarathon(marathonId)
  }

  clearQueueSelection() {
    this.selectedQueueEvent = [];
    this.queueSearchQuery = '';
    this.searchableQueueList = [...this.filteredQueueList];
    this.saveQueueSelection();
    this.loadLiveAssignments();
    this.calculateUnassignedParticipants();
  }

  onQueueDropdownOpen() {
    this.queueSearchQuery = '';
    this.searchableQueueList = [...this.filteredQueueList];
  }

  onTagSearch() {
    const query = this.tagSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredTagsList = [...this.participantTagsList];
    } else {
      this.filteredTagsList = this.participantTagsList.filter(tag =>
        tag['name']?.toLowerCase().includes(query) ||
        tag['tagname']?.toLowerCase().includes(query)
      );
    }
  }

  toggleTagSelection(tagId: string) {
    const index = this.selectedTags.indexOf(tagId);
    if (index === -1) {
      this.selectedTags.push(tagId);
    } else {
      this.selectedTags.splice(index, 1);
    }
    this.onFilter();
  }

  clearTagSelection() {
    this.selectedTags = [];
    this.tagSearchQuery = '';
    this.filteredTagsList = [...this.participantTagsList];
    this.onFilter();
  }

  getTagName(tagId: string): string {
    const tag = this.participantTagsList.find(t => t.id === tagId);
    return tag?.name || tag?.tagname || tagId;
  }

  onFilter() {
    // const searchTerm = this.searchQuery?.toLowerCase().trim() || '';
    
    let filtered = this.cohortsList.filter(e => {
      const marathonMatch = this.selectedMarathon ? this.selectedMarathon == e['marathonref']?.id : true;

      let eventMatch = true;
      if (this.selectedAcceleratorEvent.length > 0) {
        eventMatch = this.selectedAcceleratorEvent.includes(e['eventref']?.id);
      }

      // Status filter - by default hide nonactive unless showExpiredCohorts is true
      let statusMatch = true;
      if (this.statusFilter === 'active') {
        statusMatch = e['status'] === 'active' || e['status'] === undefined;
      } else if (this.statusFilter === 'nonactive') {
        statusMatch = e['status'] === 'nonactive';
      } else {
        // 'all' filter - but still hide nonactive unless showExpiredCohorts is checked
        if (!this.showExpiredCohorts) {
          statusMatch = e['status'] !== 'nonactive';
        }
      }

      let categoryMatch = true;
      if (this.categoryFilter === 'studio') {
        categoryMatch = e['cohortCategory'] === 'studio' || e['cohortCategory'] === undefined;
      } else if (this.categoryFilter === 'readiness') {
        categoryMatch = e['cohortCategory'] === 'readiness';
      } else if (this.categoryFilter === 'educational') {
        categoryMatch = e['cohortCategory'] === 'educational';
      } else if (this.categoryFilter === 'operational') {
        categoryMatch = e['cohortCategory'] === 'operational';
      }

      let typeMatch = true;
      if (this.typeFilter === 'general') {
        typeMatch = e['cohortType'] === 'general' || e['cohortType'] === undefined || !e['eventref'];
      } else if (this.typeFilter === 'event') {
        typeMatch = e['cohortType'] === 'event' || e['eventref'] != null;
      }

      let temporaryMatch = true;
      if (this.showTemporaryOnly) {
        temporaryMatch = e['isTemporary'] === true;
      }

      let tagMatch = true;
      if (this.selectedTags.length > 0) {
        const cohortTags = e['tags'] || [];
        tagMatch = this.selectedTags.some(selectedTag =>
          cohortTags.includes(selectedTag) ||
          cohortTags.some((ct: any) => ct?.id === selectedTag || ct === selectedTag)
        );
      }

      let zoneMatch = true;
      if (this.selectedZoneEvent.length > 0) {
        zoneMatch = this.zoneMappedCohortIds.has(e['docid']);
      }

      let searchMatch = true;
      const cohortSearchTerm = this.cohortSearchQuery?.toLowerCase().trim() || '';
      const participantSearchTerm = this.participantSearchQuery?.toLowerCase().trim() || '';

      if (cohortSearchTerm) {
        const cohortName = (e['name'] || '').toLowerCase();
        const eventName = this.mapAcceleratorEvent[e['eventref']?.id]?.toLowerCase() || '';
        searchMatch = cohortName.includes(cohortSearchTerm) || eventName.includes(cohortSearchTerm);
      }

      if (searchMatch && participantSearchTerm) {
        const participants = e['participantidlist'] || [];
        const hasMatchingParticipant = participants.some((participantId: string) => {
          const participantName = (this.mapProfile[participantId] || participantId).toLowerCase();
          return participantName.includes(participantSearchTerm);
        });
        searchMatch = hasMatchingParticipant;
      }

      return marathonMatch && eventMatch && statusMatch && categoryMatch && typeMatch && temporaryMatch && tagMatch && zoneMatch && searchMatch;
    });

    this.filteredCohortsList = filtered;
    this.applySorting();

    let participantList = this.filteredCohortsList.map(e => e['participantidlist']);
    this.totalParticipantsInCohorts = [].concat(...participantList)
    this.totalParticipantsInCohorts = Array.from(new Set(this.totalParticipantsInCohorts))

    this.calculateUnassignedParticipants();

    return this.filteredCohortsList;
  }

  getCohortLiveAssignmentsCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    let totalLive = 0;
    
    participants.forEach((pid: string) => {
      const stats = this.getParticipantLiveAssignmentStats(pid);
      totalLive += stats.live;
    });
    
    return totalLive;
  }

  getCohortCompletedAssignmentsCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    let totalCompleted = 0;
    
    participants.forEach((pid: string) => {
      const stats = this.getParticipantLiveAssignmentStats(pid);
      totalCompleted += stats.completed;
    });
    
    return totalCompleted;
  }

  getCohortTotalStudiosCount(cohort: any): number {
    const participants = cohort['participantidlist'] || [];
    let totalStudios = 0;
    
    participants.forEach((pid: string) => {
      totalStudios += this.getParticipantStudioInList(pid).length;
    });
    
    return totalStudios;
  }

  getDaysRemaining(endDate: any): number {
    if (!endDate) return 0;
    const end = endDate?.toDate ? endDate.toDate() : new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysRemaining);
  }

  isExpired(endDate: any): boolean {
    return this.getDaysRemaining(endDate) <= 0;
  }

  getCohortEventName(cohort: any): string {
    if (cohort['eventref']) {
      return this.mapAcceleratorEvent[cohort['eventref'].id] || '';
    }
    return '';
  }

  applyGrouping() {
    this.groupedCohorts = {};
    this.groupedCohortsDateRange = {};

    if (this.groupBy === 'none') {
      this.groupedCohorts['All Cohorts'] = this.filteredCohortsList;
      return;
    }

    if (this.groupBy === 'levels') {
      this.filteredCohortsList.forEach(cohort => {
        const level = cohort['level'] || 'level1';
        const levelLabel = this.getLevelLabel(level);
        if (!this.groupedCohorts[levelLabel]) {
          this.groupedCohorts[levelLabel] = [];
        }
        this.groupedCohorts[levelLabel].push(cohort);
      });

      const sortedGroups: { [key: string]: any[] } = {};
      const levelOrder = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Unassigned'];
      levelOrder.forEach(level => {
        if (this.groupedCohorts[level]) {
          sortedGroups[level] = this.groupedCohorts[level];
        }
      });
      this.groupedCohorts = sortedGroups;
    }

    if (this.groupBy === 'daterange') {
      // Sort cohorts by created date based on sortOrder
      const sortedCohorts = [...this.filteredCohortsList].sort((a, b) => {
        const dateA = a['createddate']?.toDate ? a['createddate'].toDate() : new Date(a['createddate'] || 0);
        const dateB = b['createddate']?.toDate ? b['createddate'].toDate() : new Date(b['createddate'] || 0);
        const comparison = dateA.getTime() - dateB.getTime();
        return this.sortOrder === 'asc' ? comparison : -comparison;
      });

      // Group cohorts within 7 days of each other
      const groups: { cohorts: any[], startDate: Date, endDate: Date }[] = [];
      
      sortedCohorts.forEach(cohort => {
        const cohortDate = cohort['createddate']?.toDate ? cohort['createddate'].toDate() : new Date(cohort['createddate'] || 0);
        
        // Find existing group where this cohort fits (within 7 days of any cohort in the group)
        let foundGroup = false;
        for (let group of groups) {
          const daysDiffFromStart = Math.abs((cohortDate.getTime() - group.startDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysDiffFromEnd = Math.abs((cohortDate.getTime() - group.endDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiffFromStart <= 7 || daysDiffFromEnd <= 7) {
            group.cohorts.push(cohort);
            // Update start and end dates
            if (cohortDate < group.startDate) {
              group.startDate = cohortDate;
            }
            if (cohortDate > group.endDate) {
              group.endDate = cohortDate;
            }
            foundGroup = true;
            break;
          }
        }
        
        if (!foundGroup) {
          groups.push({
            cohorts: [cohort],
            startDate: cohortDate,
            endDate: cohortDate
          });
        }
      });

      // Sort groups by date based on sortOrder
      groups.sort((a, b) => {
        const comparison = a.startDate.getTime() - b.startDate.getTime();
        return this.sortOrder === 'asc' ? comparison : -comparison;
      });

      // Convert groups to the required format
      groups.forEach((group, index) => {
        const dateLabel = this.formatDateRangeLabel(group.startDate, group.endDate);
        this.groupedCohorts[dateLabel] = group.cohorts;
        this.groupedCohortsDateRange[dateLabel] = group;
      });
    }
  }

  formatDateRangeLabel(startDate: Date, endDate: Date): string {
    const formatOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    const startStr = startDate.toLocaleDateString('en-US', formatOptions);
    const endStr = endDate.toLocaleDateString('en-US', formatOptions);
    
    if (startStr === endStr) {
      return startStr;
    }
    return `${startStr} - ${endStr}`;
  }

  getLevelLabel(level: string): string {
    const levelMap: { [key: string]: string } = {
      'level1': 'Level 1',
      'level2': 'Level 2',
      'level3': 'Level 3',
      'level4': 'Level 4',
      'level5': 'Level 5'
    };
    return levelMap[level] || 'Unassigned';
  }

  getDateRangeLabel(date: Date): string {
    if (!date || isNaN(date.getTime())) return 'Unknown Date';

    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) return 'This Week';
    if (diffDays <= 30) return 'This Month';
    if (diffDays <= 90) return 'Last 3 Months';
    if (diffDays <= 180) return 'Last 6 Months';
    return 'Older';
  }

  getGroupKeys(): string[] {
    return Object.keys(this.groupedCohorts);
  }

  getGroupDateRange(groupKey: string): { startDate: Date, endDate: Date } | null {
    return this.groupedCohortsDateRange[groupKey] || null;
  }

  setStatusFilter(status: 'all' | 'active' | 'nonactive') {
    this.statusFilter = status;
    this.statusDropdownOpen = false;
    this.onFilter();
  }

  setCategoryFilter(category: 'all' | 'studio' | 'readiness' | 'educational' | 'operational') {
    this.categoryFilter = category;
    this.categoryDropdownOpen = false;
    this.onFilter();
  }

  setTypeFilter(type: 'all' | 'general' | 'event') {
    this.typeFilter = type;
    this.typeDropdownOpen = false;
    this.onFilter();
  }

  setGroupBy(groupBy: 'none' | 'levels' | 'daterange') {
    this.groupBy = groupBy;
    this.applyGrouping();
  }

  toggleTemporaryOnly() {
    this.showTemporaryOnly = !this.showTemporaryOnly;
    this.onFilter();
  }

  toggleExpiredCohorts() {
    this.showExpiredCohorts = !this.showExpiredCohorts;
    this.onFilter();
  }

  toggleCohortView(cohort: any) {
    cohort['contentview'] = cohort['contentview'] === 'activities' ? 'participants' : 'activities';
  }

  toRunFilterFunctions() {
    if (this.cohortsList && this.cohortsList.length != 0 && this.selectedMarathon) {
      this.onFilter();
    }
    if (this.selectedMarathon && this.acceleratorEventList && this.acceleratorEventList.length != 0) {
      this.onFilterAcceleratorEvent();
    }
  }

  onCreateAssignment(cohorts: any) {
    console.log(this.cohortsList.map((e)=> e.marathonref || null));
    console.log(this.cohortsList);
    console.log(this.selectedMarathon);
    let dialogref = this.dialog.open(PlanActivityComponent, {
      maxWidth: '100vw',
      width: '100vw',
      height: '100vh',
      panelClass: 'full-width-dialog',
      data: {
        type: 'new',
        doc: cohorts,
        cohortslist: this.cohortsList.filter(e => this.selectedMarathon === e['marathonref']?.id),
        mapProfile: this.mapProfile,
        participantList: this.participantlist ?? []
      },
      disableClose: true,
    })
    dialogref.afterClosed().subscribe((result) => {
      if (result) { }
    })
  }

  onEditAssignment(cohorts: any, assignment: any) {
    console.log(this.cohortsList.map((e)=> e?.marathonref?.id || null));
    console.log(this.selectedMarathon);
    let dialogref = this.dialog.open(PlanActivityComponent, {
      data: {
        type: 'edit',
        doc: cohorts,
        cohortslist: this.cohortsList.filter(e => this.selectedMarathon === e['marathonref']?.id),
        assignmentdoc: assignment,
        mapProfile: this.mapProfile,
      },
      disableClose: true,
      width: '95vw',
      height: '90vh',
      panelClass: 'full-width-dialog',
    })
    dialogref.afterClosed().subscribe((result) => {
      if (result) { }
    })
  }

  onFilterAcceleratorEvent() {
    this.getAssignmentData()
    this.filteredAcceleratorEventList = this.acceleratorEventList.filter(e => e['bigmarathonref'].id === this.selectedMarathon)
    // Sort with ongoing first
    this.filteredAcceleratorEventList = this.sortEventsWithOngoingFirst(this.filteredAcceleratorEventList);
    this.searchableEventList = [...this.filteredAcceleratorEventList]
    this.eventSearchQuery = ''
    return this.filteredAcceleratorEventList
  }

  getAssignmentData() {
    if (!this.selectedMarathon || !this.mapMarathon[this.selectedMarathon]) return;

    const bigassignmentQuery = query(collection(this.firestore, "big assignment"), where("marathonref", "==", this.mapMarathon[this.selectedMarathon]['ref']))
    collectionSnapshots(bigassignmentQuery).pipe(takeUntil(this.subscription)).subscribe((snapData) => {
      let snap = snapData.map(doc => ({ id: doc.id, ...doc.data() }))

      this.mapBigAssignment = {}
      for (let i = 0; i < snap.length; i++) {
        const element: any = snap[i];
        this.mapBigAssignment[element['docid']] = element
      }
    })

    const bigparticipantsassignmentsQuery = query(collection(this.firestore, "big participants assignments"), where("marathonref", "==", this.mapMarathon[this.selectedMarathon]['ref']))
    collectionSnapshots(bigparticipantsassignmentsQuery).pipe(takeUntil(this.subscription)).subscribe(snapData => {
      let snap = snapData.map(doc => ({ id: doc.id, ...doc.data() }))
      this.mapParticiantsAssignments = {}
      this.mapOngoingAssignments = {}
      this.mapCompletedAssignments = {}
      for (let i = 0; i < snap.length; i++) {
        const element: any = snap[i];
        this.mapParticiantsAssignments[element['cohortsref'].id] = this.mapParticiantsAssignments[element['cohortsref'].id] || {}
        this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id] = this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id] || []
        this.mapParticiantsAssignments[element['cohortsref'].id][element['assignmentref'].id].push(element)
        if (['initiated', 'ongoing'].includes(element['status'])) {
          this.mapOngoingAssignments[element['assignmentref'].id] = this.mapOngoingAssignments[element['assignmentref'].id] || []
          this.mapOngoingAssignments[element['assignmentref'].id].push(element)
        } else {
          this.mapCompletedAssignments[element['assignmentref'].id] = this.mapCompletedAssignments[element['assignmentref'].id] || []
          this.mapCompletedAssignments[element['assignmentref'].id].push(element)
        }
      }
      let totalparticipantengagement: any[] = []
      for (const cohorts in this.mapParticiantsAssignments) {
        for (const assignment in this.mapParticiantsAssignments[cohorts]) {
          totalparticipantengagement.push(this.mapParticiantsAssignments[cohorts][assignment])
        }
      }
      const participantEngagementArray = [].concat(...(totalparticipantengagement || []));
      const totalParticipantsCount = this.totalParticipantsInCohorts ? this.totalParticipantsInCohorts.length : 0;
      let percentage = 0;
      if (totalParticipantsCount > 0) {
        percentage = Math.ceil((participantEngagementArray.length / totalParticipantsCount) * 100)
      }
      this.totalParticpantsEngagement = percentage
    })
    this.loading = false
  }

  onStartMetting(assignmentid: string) {
    let url = this.router.createUrlTree(['/zoommeeting_bigparticipants/'], {
      queryParams: {
        assignmentid: assignmentid,
        profileid: this.loggedInProfile['profileid'],
        participantAssignmentId: null,
        type: 1
      }
    })
    window.open(url.toString(), "_blank")
  }

  onValidateParticipantAssignment(assignmentDocId: string, cohortId?: string) {
    let url = this.router.createUrlTree(['/validateParticipantAssignments/'], {
      queryParams: {
        assignmentid: assignmentDocId,
        marathonid: this.selectedMarathon || null,
        cohortid: cohortId || null,
      }
    })
    window.open(url.toString(), "_blank")
  }

  onCohortSearch() {
    this.onFilter();
  }

  onParticipantSearch() {
    if (this.participantSearchQuery && this.participantSearchQuery.trim()) {
      this.cohortsList.forEach(cohort => {
        cohort['contentview'] = 'participants';
      });
    }
    this.onFilter();
  }

  changeOverAllView(view){
    if (view == 'participants') {
      this.contentview = 'participants';
      this.cohortsList.forEach(cohort => {
        cohort['contentview'] = 'participants';
      });
    } else {
      this.contentview = 'activities';
      this.cohortsList.forEach(cohort => {
        cohort['contentview'] = 'activities';
      });
    }
  }

  getFilteredParticipants(participantList: string[]): string[] {
    if (!participantList || participantList.length === 0) return [];
    if (!this.participantSearchQuery || !this.participantSearchQuery.trim()) {
      return participantList;
    }
    
    const query = this.participantSearchQuery.toLowerCase().trim();
    return participantList.filter(participantId => {
      const name = (this.mapProfile[participantId] || participantId).toLowerCase();
      return name.includes(query);
    });
  }

  clearCohortSearch() {
    this.cohortSearchQuery = '';
    this.onCohortSearch();
  }

  clearParticipantSearch() {
    this.participantSearchQuery = '';
    this.onParticipantSearch();
  }

  isCohortNameMatch(cohort: any): boolean {
    if (!this.cohortSearchQuery || !this.cohortSearchQuery.trim()) return true;
    
    const searchTerm = this.cohortSearchQuery.toLowerCase().trim();
    const cohortName = (cohort['name'] || '').toLowerCase();
    const eventName = this.mapAcceleratorEvent[cohort['eventref']?.id]?.toLowerCase() || '';
    
    return cohortName.includes(searchTerm) || eventName.includes(searchTerm);
  }

  getMatchingParticipantCount(cohort: any): number {
    if (!this.participantSearchQuery || !this.participantSearchQuery.trim()) {
      return cohort['participantidlist']?.length || 0;
    }
    return this.getFilteredParticipants(cohort['participantidlist'] || []).length;
  }

  getSelectedEventNames(): string {
    if (this.selectedAcceleratorEvent.length === 0) {
      return 'Select Event';
    }
    const names = this.selectedAcceleratorEvent.map(id => this.mapAcceleratorEvent[id]).filter(Boolean);
    if (names.length === 1) {
      return names[0];
    }
    if (names.length > 1) {
      return `${names[0]} +${names.length - 1}`;
    }
    return 'Select Event';
  }

  getSelectedQueueNames(): string {
    if (this.selectedQueueEvent.length === 0) {
      return 'Select Queue';
    }
    const names = this.selectedQueueEvent.map(id => this.mapQueueName[id]).filter(Boolean);
    if (names.length === 1) {
      return names[0];
    }
    if (names.length > 1) {
      return `${names[0]} +${names.length - 1}`;
    }
    return 'Select Queue';
  }

  getSelectedTagNames(): string {
    if (this.selectedTags.length === 0) {
      return 'Tagging';
    }
    if (this.selectedTags.length === 1) {
      return this.getTagName(this.selectedTags[0]);
    }
    return `${this.getTagName(this.selectedTags[0])} +${this.selectedTags.length - 1}`;
  }

  onEditCohort(cohorts: any) {
    this.openCohortDialog('edit', cohorts);
  }

  onCreateCohort() {
    this.openCohortDialog('new', null);
  }

  openCohortDialog(type: string, cohortDoc: any) {
    const dialogRef = this.dialog.open(ManageCohertsComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'cohort-dialog-container',
      data: {
        type: type,
        doc: cohortDoc,
        selectedMarathon: this.mapMarathon[this.selectedMarathon!],
        selectedParticipants: [],
        totalParticipants: this.participantlist || [],
        eventCollectionList: this.filteredAcceleratorEventList,
        mapEventCollection: this.mapAcceleratorEvent,
        participantTagsList: this.participantTagsList,
        loggedInProfile: this.loggedInProfile
      },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe((result) => {
      // cohort list updates automatically via the live "big cohorts" listener
    });
  }

  getUnassignedCount(): number {
    if (this.unassignedParticipants.length > 0) return this.unassignedParticipants.length;
    // Live fallback: count big invitations whose participant isn't in any cohort.
    const assigned = new Set<string>();
    (this.cohortsList || []).forEach((c: any) => {
      (c.participantidlist || []).forEach((id: string) => assigned.add(id));
    });
    let count = 0;
    (this.bigInvitationList || []).forEach((inv: any) => {
      const pid = inv['participantid'] || inv['profileid'];
      if (pid && !assigned.has(pid)) count++;
    });
    return count;
  }

  getStatusFilterLabel(): string {
    switch (this.statusFilter) {
      case 'active': return 'Active/Non Active';
      case 'nonactive': return 'Non Active/Active';
      default: return 'All/Active/Non Active';
    }
  }

  getCategoryFilterLabel(): string {
    switch (this.categoryFilter) {
      case 'studio': return 'Studio Group/Readiness/Educational/Operational';
      case 'readiness': return 'Readiness/Studio Group/Educational/Operational';
      case 'educational': return 'Educational/Studio Group/Readiness/Operational';
      case 'operational': return 'Operational/Studio Group/Educational/Readiness';
      default: return 'All/Readiness/Studio Group';
    }
  }

  getTypeFilterLabel(): string {
    switch (this.typeFilter) {
      case 'general': return 'General/Event';
      case 'event': return 'Event/General';
      default: return 'All/General/Event';
    }
  }

  getActivitiesCount(cohortId: string): number {
    const assignments = this.mapParticiantsAssignments[cohortId];
    if (!assignments) return 0;
    return Object.keys(assignments).length;
  }

  // Temporary cohort date display methods
  getTemporaryCohortDateDisplay(cohort: any): string {
    if (!cohort['isTemporary']) return '';
    
    const startDate = cohort['startDate']?.toDate ? cohort['startDate'].toDate() : (cohort['startDate'] ? new Date(cohort['startDate']) : null);
    const endDate = cohort['endDate']?.toDate ? cohort['endDate'].toDate() : (cohort['endDate'] ? new Date(cohort['endDate']) : null);
    
    if (!startDate && !endDate) return '';
    
    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    
    if (this.isEndsToday(endDate)) {
      return 'Ends Today';
    }
    
    if (startDate && endDate) {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    } else if (endDate) {
      return `Ends ${formatDate(endDate)}`;
    } else if (startDate) {
      return `From ${formatDate(startDate)}`;
    }
    
    return '';
  }

  isEndsToday(endDate: any): boolean {
    if (!endDate) return false;
    const end = endDate instanceof Date ? endDate : (endDate?.toDate ? endDate.toDate() : new Date(endDate));
    const today = new Date();
    return end.getDate() === today.getDate() && 
           end.getMonth() === today.getMonth() && 
           end.getFullYear() === today.getFullYear();
  }

  isTemporaryCohortEndsToday(cohort: any): boolean {
    if (!cohort['isTemporary']) return false;
    const endDate = cohort['endDate']?.toDate ? cohort['endDate'].toDate() : (cohort['endDate'] ? new Date(cohort['endDate']) : null);
    return this.isEndsToday(endDate);
  }

  // Get cohort created date formatted
  getCohortCreatedDate(cohort: any): string {
    const createdDate = cohort['createddate']?.toDate ? cohort['createddate'].toDate() : (cohort['createddate'] ? new Date(cohort['createddate']) : null);
    if (!createdDate) return '';
    return createdDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Cohort sorting - simplified to date and name only
  sortBy: 'date' | 'name' = 'date';
  sortOrder: 'asc' | 'desc' = 'desc';

  setSorting(sortBy: 'date' | 'name') {
    if (this.sortBy === sortBy) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = sortBy;
      this.sortOrder = sortBy === 'name' ? 'asc' : 'desc';
    }
    this.applySorting();
  }

  toggleSortOrder() {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    this.applySorting();
  }

  applySorting() {
    this.filteredCohortsList.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'name':
          comparison = (a['name'] || '').localeCompare(b['name'] || '');
          break;
        case 'date':
          const dateA = a['createddate']?.toDate ? a['createddate'].toDate() : new Date(a['createddate'] || 0);
          const dateB = b['createddate']?.toDate ? b['createddate'].toDate() : new Date(b['createddate'] || 0);
          comparison = dateA.getTime() - dateB.getTime();
          break;
      }
      
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });
    
    this.applyGrouping();
  }

  exportCohortsData() {
    const exportData: any[] = [];

    this.filteredCohortsList.forEach(cohort => {
      const participants = cohort['participantidlist'] || [];

      if (participants.length === 0) {
        exportData.push({
          'Cohort Name': cohort['name'] || '',
          'Status': cohort['status'] || 'active',
          'Category': cohort['cohortCategory'] || 'studio',
          'Type': cohort['cohortType'] || 'general',
          'Level': this.getLevelLabel(cohort['level'] || 'level1'),
          'Event': this.getCohortEventName(cohort) || 'N/A',
          'Marathon': this.mapMarathon[cohort['marathonref']?.id]?.['title'] || '',
          'Total Participants': participants.length,
          'Participant Name': '',
          'Participant Status': '',
          'Studios In': '',
          'Checked In': '',
          'Live Assignments': '',
          'Completed Assignments': '',
          'Is Temporary': cohort['isTemporary'] ? 'Yes' : 'No',
          'Created Date': cohort['createddate']?.toDate ? cohort['createddate'].toDate().toLocaleDateString() : ''
        });
      } else {
        participants.forEach((participantId: string, index: number) => {
          const studioInList = this.getParticipantStudioInList(participantId);
          const checkedInCount = this.getParticipantCheckedInCount(participantId);
          const liveAssignmentStats = this.getParticipantLiveAssignmentStats(participantId);
          
          exportData.push({
            'Cohort Name': index === 0 ? cohort['name'] || '' : '',
            'Status': index === 0 ? cohort['status'] || 'active' : '',
            'Category': index === 0 ? cohort['cohortCategory'] || 'studio' : '',
            'Type': index === 0 ? cohort['cohortType'] || 'general' : '',
            'Level': index === 0 ? this.getLevelLabel(cohort['level'] || 'level1') : '',
            'Event': index === 0 ? this.getCohortEventName(cohort) || 'N/A' : '',
            'Marathon': index === 0 ? this.mapMarathon[cohort['marathonref']?.id]?.['title'] || '' : '',
            'Total Participants': index === 0 ? participants.length : '',
            'Participant Name': this.mapProfile[participantId] || participantId,
            'Participant Status': this.isParticipantInStudio(participantId) ? 'In Studio' : 'Idle',
            'Studios In': studioInList.length,
            'Checked In': checkedInCount,
            'Live Assignments': liveAssignmentStats.live,
            'Completed Assignments': liveAssignmentStats.completed,
            'Is Temporary': index === 0 ? (cohort['isTemporary'] ? 'Yes' : 'No') : '',
            'Created Date': index === 0 ? (cohort['createddate']?.toDate ? cohort['createddate'].toDate().toLocaleDateString() : '') : ''
          });
        });
      }
    });

    // ==== Activities sheet ====
    const activitiesData: any[] = [];
    this.filteredCohortsList.forEach(cohort => {
      const assignments = this.mapParticiantsAssignments[cohort['docid']] || {};
      const keys = Object.keys(assignments);
      if (keys.length === 0) {
        activitiesData.push({
          'Cohort Name': cohort['name'] || '',
          'Activity Title': '(no activities)',
          'Mode': '',
          'Created Date': '',
          'Total Assigned': 0,
          'Ongoing': 0,
          'Completed': 0,
          'Has Zoom': '',
          'Activity ID': ''
        });
      } else {
        keys.forEach((assignmentId, idx) => {
          const meta = this.mapBigAssignment[assignmentId];
          const total = (assignments[assignmentId] || []).length;
          const ongoing = this.mapOngoingAssignments[assignmentId]?.length || 0;
          const completed = this.mapCompletedAssignments[assignmentId]?.length || 0;
          activitiesData.push({
            'Cohort Name': idx === 0 ? (cohort['name'] || '') : '',
            'Activity Title': meta?.['title'] || '(deleted)',
            'Mode': meta?.['selectionMode'] ? String(meta['selectionMode']).toUpperCase() : '',
            'Created Date': meta?.['createddate']?.toDate ? meta['createddate'].toDate().toLocaleString() : '',
            'Total Assigned': total,
            'Ongoing': ongoing,
            'Completed': completed,
            'Has Zoom': meta?.['zoomdata']?.['start_url'] ? 'Yes' : 'No',
            'Activity ID': assignmentId
          });
        });
      }
    });

    const summaryData = [
      { 'Metric': 'Total Cohorts', 'Value': this.filteredCohortsList.length },
      { 'Metric': 'Total Participants', 'Value': this.totalParticipantsInCohorts.length },
      { 'Metric': 'Total Activities', 'Value': activitiesData.filter(a => a['Activity Title'] !== '(no activities)').length },
      { 'Metric': 'Active Cohorts', 'Value': this.filteredCohortsList.filter(c => c['status'] !== 'nonactive').length },
      { 'Metric': 'Non-Active Cohorts', 'Value': this.filteredCohortsList.filter(c => c['status'] === 'nonactive').length },
      { 'Metric': 'Studio Groups', 'Value': this.filteredCohortsList.filter(c => c['cohortCategory'] !== 'readiness').length },
      { 'Metric': 'Readiness Groups', 'Value': this.filteredCohortsList.filter(c => c['cohortCategory'] === 'readiness').length },
      { 'Metric': 'Event Cohorts', 'Value': this.filteredCohortsList.filter(c => c['eventref']).length },
      { 'Metric': 'General Cohorts', 'Value': this.filteredCohortsList.filter(c => !c['eventref']).length },
      { 'Metric': 'Temporary Cohorts', 'Value': this.filteredCohortsList.filter(c => c['isTemporary']).length },
      { 'Metric': 'Participants In Studio', 'Value': Object.keys(this.mapLiveParticipants).length },
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
    ];

    this.downloadExcel(exportData, summaryData, activitiesData);
  }

  downloadExcel(cohortsData: any[], summaryData: any[], activitiesData: any[] = []) {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.json_to_sheet(cohortsData);

      ws1['!cols'] = [
        { wch: 25 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
        { wch: 25 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 16 },
        { wch: 20 },
        { wch: 12 },
        { wch: 15 }
      ];

      XLSX.utils.book_append_sheet(wb, ws1, 'Cohorts & Participants');

      if (activitiesData && activitiesData.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(activitiesData);
        ws3['!cols'] = [
          { wch: 25 },
          { wch: 30 },
          { wch: 12 },
          { wch: 22 },
          { wch: 14 },
          { wch: 10 },
          { wch: 12 },
          { wch: 10 },
          { wch: 28 }
        ];
        XLSX.utils.book_append_sheet(wb, ws3, 'Activities');
      }

      const ws2 = XLSX.utils.json_to_sheet(summaryData);
      ws2['!cols'] = [
        { wch: 25 },
        { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

      const date = new Date();
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const filename = `BIG_Cohorts_Export_${dateStr}.xlsx`;

      XLSX.writeFile(wb, filename);
    }).catch(err => {
      console.error('Error loading xlsx library:', err);
      this.downloadCSV(cohortsData);
    });
  }

  downloadCSV(data: any[]) {
    if (data.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header]?.toString() || '';
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    link.setAttribute('href', url);
    link.setAttribute('download', `BIG_Cohorts_Export_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  openProgressionReport() {
    this.showProgressionDialog = true;
    this.progressionLoading = true;
    this.progressionSearchQuery = '';
    this.loadProgressionData();
  }

  closeProgressionDialog() {
    this.showProgressionDialog = false;
    this.progressionData = [];
    this.groupedProgressionData = {};
    this.filteredProgressionProfiles = [];
    this.progressionSearchQuery = '';
  }

  loadProgressionData() {
    getDocs(query(collection(this.firestore, "big cohorts log"), orderBy("createddate", "desc"))).then(snap => {
      this.progressionData = snap.docs.map(e => {
        const data: any = e.data();
        return { id: e.id, ...data };
      });
      
      this.groupedProgressionData = {};
      this.progressionData.forEach(log => {
        const profileId = log['participantid'] || log['profileid'];
        if (profileId) {
          if (!this.groupedProgressionData[profileId]) {
            this.groupedProgressionData[profileId] = [];
          }
          this.groupedProgressionData[profileId].push(log);
        }
      });
      
      Object.keys(this.groupedProgressionData).forEach(profileId => {
        this.groupedProgressionData[profileId].sort((a, b) => {
          const dateA = a['createddate']?.toDate ? a['createddate'].toDate() : new Date(a['createddate']);
          const dateB = b['createddate']?.toDate ? b['createddate'].toDate() : new Date(b['createddate']);
          return dateA.getTime() - dateB.getTime();
        });
      });
      
      this.filteredProgressionProfiles = Object.keys(this.groupedProgressionData);
      this.progressionLoading = false;
    }).catch(err => {
      console.error('Error loading progression data:', err);
      this.progressionLoading = false;
    });
  }

  onProgressionSearch() {
    const query = this.progressionSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredProgressionProfiles = Object.keys(this.groupedProgressionData);
    } else {
      this.filteredProgressionProfiles = Object.keys(this.groupedProgressionData).filter(profileId => {
        const name = (this.mapProfile[profileId] || profileId).toLowerCase();
        return name.includes(query);
      });
    }
  }

  getStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'added':
      case 'created':
        return '#27ae60';
      case 'moved':
        return '#3498db';
      case 'removed':
      case 'deleted':
        return '#e74c3c';
      case 'updated':
        return '#f39c12';
      default:
        return '#95a5a6';
    }
  }

  getStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'added':
      case 'created':
        return 'add_circle';
      case 'moved':
        return 'swap_horiz';
      case 'removed':
      case 'deleted':
        return 'remove_circle';
      case 'updated':
        return 'edit';
      default:
        return 'info';
    }
  }

  formatTimelineDate(date: any): string {
    if (!date) return 'Unknown';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async deleteCohort(cohort){
    const check = confirm('Are you sure do you want to delet this cohort?');
    if(check){
     await deleteDoc(doc(this.firestore, 'big cohorts',cohort.docid)).then(()=>{
        console.log('Cohort Deleted Successfully');
        this.authguard.openSnackBar('Cohort Deleted Successfully','ok',600);
      }).catch((error)=>{
        console.log('Error while Deleting',error);
        this.authguard.openSnackBar('Error while Deleting','ok',600);
      });
    }else{
      console.log('Not Deleted');
    }
  }

  saveZoneSelection() {
    try {
      localStorage.setItem(this.STORAGE_KEY_ZONE, JSON.stringify(this.selectedZoneEvent));
    } catch (e) {
      console.error('Error saving zone selection:', e);
    }
  }

  patchSavedZoneSelections() {
    if (this.selectedZoneEvent.length > 0) {
      this.selectedZoneEvent = this.selectedZoneEvent.filter(id =>
        this.zoneEventEventList.some(z => z.ref?.id === id || z.docid === id)
      );
      if (this.selectedZoneEvent.length > 0) {
        this.updateZoneMappedCohortIds();
        this.onFilter();
      }
    }
  }

  updateZoneMappedCohortIds() {
    this.zoneMappedCohortIds = new Set<string>();
    this.selectedZoneEvent.forEach(zoneId => {
      const zone = this.mapZoneData[zoneId];
      if (zone && Array.isArray(zone['cohorts'])) {
        zone['cohorts'].forEach((cid: string) => {
          if (cid) this.zoneMappedCohortIds.add(cid);
        });
      }
    });
  }

  onZoneSearch() {
    const query = this.zoneSearchQuery.toLowerCase().trim();
    if (!query) {
      this.searchableZoneEventList = [...this.zoneEventEventList];
    } else {
      this.searchableZoneEventList = this.zoneEventEventList.filter(z =>
        (z['name'] || '').toLowerCase().includes(query)
      );
    }
  }

  toggleZoneSelection(zoneId: string) {
    if (!zoneId) return;
    const index = this.selectedZoneEvent.indexOf(zoneId);
    if (index === -1) {
      this.selectedZoneEvent.push(zoneId);
    } else {
      this.selectedZoneEvent.splice(index, 1);
    }
    this.saveZoneSelection();
    this.updateZoneMappedCohortIds();
    this.onFilter();
  }

  clearZoneSelection() {
    this.selectedZoneEvent = [];
    this.zoneSearchQuery = '';
    this.searchableZoneEventList = [...this.zoneEventEventList];
    this.saveZoneSelection();
    this.updateZoneMappedCohortIds();
    this.onFilter();
  }

  onZoneDropdownOpen() {
    this.zoneSearchQuery = '';
    this.searchableZoneEventList = [...this.zoneEventEventList];
  }

  getSelectedZoneNames(): string {
    if (this.selectedZoneEvent.length === 0) {
      return 'Select Zone';
    }
    const names = this.selectedZoneEvent
      .map(id => this.mapZoneData[id]?.['name'] || this.mapZoneEvent[id])
      .filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length > 1) return `${names[0]} +${names.length - 1}`;
    return 'Select Zone';
  }
}