import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { collection, collectionData, DocumentReference, getDoc, getDocs, getFirestore, orderBy, query, where, doc } from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import { environment } from '../../../environments/environment';

interface Participant { name: string; cohort: string; initials: string; selected?: boolean; profileId?: string; displayText?: string; doerId?: string; beneficiaryId?: string; procedureName?: string; hours?: string; hourType?: string; sharedNotes?: string; count?: number}
interface Selection { cwName: string; role: string; status: string; count: number; }
interface EventData { docref: DocumentReference; name: string; start_date: any; end_date: any; [key: string]: any; }
interface QueueData { docref: DocumentReference; name: string; start_date: any; end_date: any; eventref?: DocumentReference; queuestartdate?: any; queueenddate?: any; [key: string]: any; }
interface TagColor { bg: string; bgGradient: string; border: string; title: string; countBg: string; countText: string; avatarGradient: string; }
interface ProcedureStats { totalOpportunities: { count: number; data: any[] }; totalCompleted: { count: number; data: any[] }; doerNotStarted: { count: number; data: string[] }; doerCompleted: { count: number; data: string[] }; beneficierNotStarted: { count: number; data: string[] }; beneficierCompleted: { count: number; data: string[] }; liveChangework: { count: number; data: any[] }; }

const STORAGE_KEY_EVENT = 'live_dashboard_selected_event_id';
const STORAGE_KEY_QUEUE = 'live_dashboard_selected_queue_id';
function getExcludedProductId(): string {
  if (environment.firebase.projectId === 'starlabs-test') {
    return 'BKqbQ5slQtuYhljMOkKk';
  } else if (environment.firebase.projectId === 'fir-sample-aae4a') {
    return '0ayiNALL1HDVvCXDHcZ4';
  }
  return '0ayiNALL1HDVvCXDHcZ4';
}

const EXCLUDED_PRODUCT_ID = getExcludedProductId();

@Component({
  selector: 'app-first-timers-dashboard',
  imports: [CommonModule, MatInputModule, ReactiveFormsModule, FormsModule],
  templateUrl: './first-timers-dashboard.component.html',
  styleUrl: './first-timers-dashboard.component.css'
})
export class FirstTimersDashboardComponent implements OnDestroy {
  @ViewChild('searchInput') searchInput!: ElementRef;
  @ViewChild('queueSearchInput') queueSearchInput!: ElementRef;

  panelTitle = 'Participant List';
  panelSubtitle = 'Click on any number to view participants';
  showActions = false;
  selectedParticipants: Participant[] = [];
  currentSelection: Selection | null = null;
  isSidePanelOpen: boolean = false;

  eventsList: EventData[] = [];
  filteredEventsList: EventData[] = [];
  ongoingEvents: EventData[] = [];
  selectedEvent: EventData | null = null;
  selectedEventRef: {} = {};
  searchTerm: string = '';
  isDropdownOpen: boolean = false;
  highlightedIndex: number = -1;
  private atcDocs: any[] = [];
  queuesList: QueueData[] = [];
  filteredQueuesList: QueueData[] = [];
  ongoingQueues: QueueData[] = [];
  selectedQueues: QueueData[] = [];
  selectedQueueRefs: DocumentReference[] = [];
  queueSearchTerm: string = '';
  isQueueDropdownOpen: boolean = false;
  queueHighlightedIndex: number = -1;
  queueRangeStartDate: Date | null = null;
  queueRangeEndDate: Date | null = null;

  private storedEventId: string | null = null;
  private storedQueueId: string[] | null = null;

  isLoadingQueues: boolean = false;
  isLoading: boolean = true;

  mapJourneyData: { [key: string]: any } = {};
  participantMetadataMap: { [key: string]: any } = {};
  mapTags: { [key: string]: string[] } = {};
  mapProcedureData: { [key: string]: ProcedureStats } = {};
  mapProcedureNames: { [key: string]: string } = {};
  sortedProcedureIds: string[] = [];

  eventParticipantProfileIds: string[] = [];
  private beneficierProfileIds: string[] = [];
  firstTimerProfileIds: string[] = [];
  availableTags: string[] = [];
  mapTagNames: {} = {}
  atcModels: string[] = [];
  doerTotal: number = 0;
  beneficierTotal: number = 0;
  liveChangeworkTotal: number = 0;

  participantFilter: 'all' | 'firstTimers' = 'firstTimers';

  eventDays: Array<{ day: string; dateObj: Date; displayText: string }> = [];
  currentFilter: string = 'all';
  scrollOffset: number = 0;
  maxVisibleDays: number = 7;
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;

  private atcSubscription: Subscription | null = null;
  private liveChangeWorkSubscription: Subscription | null = null;
  private liveChangeworkLiveSubscription: Subscription | null = null;
  private participantSubscription: Subscription | null = null;
  private metadataSubscription: Subscription | null = null;
  liveChangeWorkData: any[] = [];
  liveChangeworkLiveData: any[] = [];

  private tagColors: { [key: string]: TagColor } = {};
  private colorPalette: TagColor[] = [
    { bg: '#ecfdf5', bgGradient: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '#a7f3d0', title: '#15803d', countBg: '#bbf7d0', countText: '#15803d', avatarGradient: 'linear-gradient(135deg, #10b981, #059669)' },
    { bg: '#fef2f2', bgGradient: 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: '#fecaca', title: '#b91c1c', countBg: '#fecaca', countText: '#b91c1c', avatarGradient: 'linear-gradient(135deg, #ef4444, #dc2626)' },
    { bg: '#fff7ed', bgGradient: 'linear-gradient(135deg, #fff7ed, #ffedd5)', border: '#fed7aa', title: '#c2410c', countBg: '#fed7aa', countText: '#c2410c', avatarGradient: 'linear-gradient(135deg, #f97316, #ea580c)' },
    { bg: '#f5f3ff', bgGradient: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '#ddd6fe', title: '#7c3aed', countBg: '#ddd6fe', countText: '#7c3aed', avatarGradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
    { bg: '#eff6ff', bgGradient: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '#93c5fd', title: '#1d4ed8', countBg: '#bfdbfe', countText: '#1d4ed8', avatarGradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
    { bg: '#f0fdfa', bgGradient: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)', border: '#5eead4', title: '#0f766e', countBg: '#99f6e4', countText: '#0f766e', avatarGradient: 'linear-gradient(135deg, #14b8a6, #0d9488)' },
    { bg: '#fdf2f8', bgGradient: 'linear-gradient(135deg, #fdf2f8, #fce7f3)', border: '#f9a8d4', title: '#be185d', countBg: '#fbcfe8', countText: '#be185d', avatarGradient: 'linear-gradient(135deg, #ec4899, #db2777)' },
    { bg: '#fefce8', bgGradient: 'linear-gradient(135deg, #fefce8, #fef08a)', border: '#fde047', title: '#a16207', countBg: '#fef08a', countText: '#a16207', avatarGradient: 'linear-gradient(135deg, #eab308, #ca8a04)' },
    { bg: '#eef2ff', bgGradient: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '#a5b4fc', title: '#4338ca', countBg: '#c7d2fe', countText: '#4338ca', avatarGradient: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
    { bg: '#ecfeff', bgGradient: 'linear-gradient(135deg, #ecfeff, #cffafe)', border: '#67e8f9', title: '#0e7490', countBg: '#a5f3fc', countText: '#0e7490', avatarGradient: 'linear-gradient(135deg, #06b6d4, #0891b2)' },
    { bg: '#fff1f2', bgGradient: 'linear-gradient(135deg, #fff1f2, #ffe4e6)', border: '#fecdd3', title: '#be123c', countBg: '#fecdd3', countText: '#be123c', avatarGradient: 'linear-gradient(135deg, #f43f5e, #e11d48)' },
    { bg: '#f7fee7', bgGradient: 'linear-gradient(135deg, #f7fee7, #ecfccb)', border: '#bef264', title: '#4d7c0f', countBg: '#d9f99d', countText: '#4d7c0f', avatarGradient: 'linear-gradient(135deg, #84cc16, #65a30d)' }
  ];
  private colorIndex = 0;
  private profileAtcMap: { [profileId: string]: any } = {};

  firestoreDefault = getFirestore()

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit() { this.loadData(); }
  ngOnDestroy() { this.unsubscribeAllSubscriptions(); }

  // Set participant filter
  setParticipantFilter(filter: 'all' | 'firstTimers') {
    if (this.participantFilter === filter) return;
    this.participantFilter = filter;
    this.calculateProcedureData();
  }

  // Check if profile is first timer
  private isFirstTimer(profileId: string): boolean { return this.firstTimerProfileIds.includes(profileId); }

  // Get filtered doer IDs
  private getFilteredDoerIds(): string[] {
    if (this.participantFilter === 'all') return this.eventParticipantProfileIds;
    return this.eventParticipantProfileIds.filter(id => this.isFirstTimer(id));
  }

  // Get filtered beneficier IDs
  private getFilteredBeneficierIds(): string[] {
    if (this.participantFilter === 'all') return this.beneficierProfileIds;
    return this.beneficierProfileIds.filter(id => this.isFirstTimer(id));
  }

  // Load initial data
  async loadData() {
    this.isLoading = true;
    this.storedEventId = this.getEventFromStorage();
    this.storedQueueId = this.getQueueFromStorage();

    await getDocs(collection(this.firestoreDefault, "journey")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const journeyData = snap.docs[i].data();
        this.mapJourneyData[journeyData['id']] = journeyData;
      }
    });

    await getDocs(query(collection(this.firestoreDefault, "participant tags"), where("tagsfor", "array-contains", "live event"))).then(snap =>{
      var id = []
      snap.forEach(doc =>{
        this.mapTagNames[doc.id] = doc.data()["name"]
        id.push(doc.id)
      })
      this.availableTags = id
    })

    // await getDoc(doc(this.firestoreDefault, "classify", "eventtags")).then(tags => {
    //   if (tags.exists()) {
    //     this.availableTags = tags.data()['firsttimetags'] || [];
    //     for (let i = 0; i < this.availableTags.length; i++) { this.mapTags[this.availableTags[i]] = []; }
    //   }
    // });

    await getDocs(collection(this.firestoreDefault, "procedures")).then((procedure) => {
      if (procedure.docs.length != 0) {
        procedure.docs.forEach((data) => {
          const procedureData = data.data();
          this.mapProcedureNames[data.id] = procedureData['name'];
          this.mapProcedureData[data.id] = { totalCompleted: { count: 0, data: [] }, totalOpportunities: { count: 0, data: [] }, doerNotStarted: { count: 0, data: [] }, doerCompleted: { count: 0, data: [] }, beneficierNotStarted: { count: 0, data: [] }, beneficierCompleted: { count: 0, data: [] }, liveChangework: { count: 0, data: [] } };
        });
      }
    });

    this.loadParticipantMetadata();

    try {
      const eventsSnapshot = await getDocs(query(collection(this.firestoreDefault, 'event collection'), orderBy('end_date', 'desc')));
      const today = new Date(); today.setHours(0, 0, 0, 0);

      eventsSnapshot.docs.forEach((doc) => {
        const data = doc.data() as EventData;
        data['docref'] = doc.ref;
        this.eventsList.push(data);
        const startDate = data['start_date']?.toDate ? data['start_date'].toDate() : new Date(data['start_date']);
        const endDate = data['end_date']?.toDate ? data['end_date'].toDate() : new Date(data['end_date']);
        startDate.setHours(0, 0, 0, 0); endDate.setHours(23, 59, 59, 999);
        if (startDate <= today && today <= endDate) { this.ongoingEvents.push(data); }
      });

      this.filteredEventsList = [...this.eventsList];

      if (this.storedEventId) {
        const storedEvent = this.eventsList.find(e => this.getDocRefPath(e.docref) === this.storedEventId);
        if (storedEvent) { await this.selectEvent(storedEvent, true); }
        else if (this.ongoingEvents.length > 0) { this.selectEvent(this.ongoingEvents[0]); }
      } else if (this.ongoingEvents.length > 0) { this.selectEvent(this.ongoingEvents[0]); }
    } catch (error) { console.error('Error loading events:', error); }
    finally { this.isLoading = false; }
  }

  // Load participant metadata
  loadParticipantMetadata() {
    try {
      this.metadataSubscription = collectionData(query(collection(this.firestoreDefault, 'participant metadata'), orderBy('name', 'asc')), { idField: 'id' }).subscribe((metadataSnapshot) => {
        const tempParticipantMetadataMap: { [key: string]: any } = {};
        const tempTagsMap: { [key: string]: string[] } = {};
        const tempFirstTimerIds: string[] = [];
        this.availableTags.forEach(tag => { tempTagsMap[tag] = []; });

        metadataSnapshot.forEach((doc: any) => {
          const data = doc;
          const profileId = data['profileid'] || doc.id;
          const eventTags: string[] = data['profiletags'] || [];
          eventTags.forEach(tag => { if (tempTagsMap[tag] && !tempTagsMap[tag].includes(profileId)) { tempTagsMap[tag].push(profileId); } });
          const consumedProducts: string[] = data['consumedproducts'] || [];
          if (!consumedProducts.includes(EXCLUDED_PRODUCT_ID)) { tempFirstTimerIds.push(profileId); }
          tempParticipantMetadataMap[profileId] = data;
        });

        this.participantMetadataMap = tempParticipantMetadataMap;
        // Prevent Unknown names
        if (Object.keys(this.participantMetadataMap).length > 0) {
          this.calculateProcedureData();
        }
        this.mapTags = tempTagsMap;
        this.firstTimerProfileIds = tempFirstTimerIds;
        if (this.liveChangeWorkData.length > 0 || this.beneficierProfileIds.length > 0) { this.calculateProcedureData(); }
      });
    } catch (error) { console.error('Error loading participant metadata:', error); }
  }

  // Select event
  async selectEvent(event: EventData, restoreMode: boolean = false) {
    if (!restoreMode) { this.unsubscribeEventSubscriptions(); this.unsubscribeQueueSubscriptions(); }
    this.selectedEvent = event;
    this.selectedEventRef = event.docref;
    this.searchTerm = '';
    this.isDropdownOpen = false;

    if (event.start_date && event.end_date) {
      this.calculateEventDays(event.start_date, event.end_date);
      if (restoreMode) { await this.onEventSelect(true); }
      else { this.saveEventToStorage(this.getDocRefPath(event.docref)); this.clearQueueFromStorage(); this.storedQueueId = null; this.onEventSelect(false); }
    } else {
      if (restoreMode) { await this.onEventSelect(true); }
      else { this.saveEventToStorage(this.getDocRefPath(event.docref)); this.clearQueueFromStorage(); this.storedQueueId = null; this.onEventSelect(); }
    }
  }

  // Calculate event days
  private calculateEventDays(startDate: any, endDate: any): void {
    const start = startDate?.toDate ? startDate.toDate() : new Date(startDate);
    const end = endDate?.toDate ? endDate.toDate() : new Date(endDate);
    const days: Array<{ day: string; dateObj: Date; displayText: string }> = [];
    days.push({ day: 'all', dateObj: start, displayText: 'All Days' });
    const timeDiff = end.getTime() - start.getTime();
    const totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
    for (let i = 0; i < totalDays; i++) {
      const currentDay = new Date(start); currentDay.setDate(start.getDate() + i); currentDay.setHours(0, 0, 0, 0);
      const dayNum = i + 1;
      const weekday = currentDay.toLocaleDateString('en-IN', { weekday: 'short' });
      const monthDay = currentDay.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      days.push({ day: `day${dayNum}`, dateObj: currentDay, displayText: `Day ${dayNum} - ${weekday}, ${monthDay}` });
    }
    this.eventDays = days;
    setTimeout(() => this.autoSelectToday(), 0);
  }

  // Auto-select today
  private autoSelectToday(): void {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIndex = this.eventDays.findIndex((day, i) => i > 0 && day.dateObj.toDateString() === today.toDateString());
    if (todayIndex > 0) { this.currentFilter = this.eventDays[todayIndex].day; const arrayIndex = todayIndex - 1; this.scrollOffset = Math.max(0, arrayIndex - Math.floor(this.maxVisibleDays / 2)); }
    else { this.currentFilter = 'all'; this.scrollOffset = 0; }
    this.updateFilterDateRange(this.currentFilter);
    this.cdr.detectChanges();
  }

  // Handle event selection
  private async onEventSelect(restoreMode: boolean = false) {
    if (!this.selectedEventRef) { this.selectedEvent = null; return; }
    this.selectedEvent = this.eventsList.find(e => e['docref'] === this.selectedEventRef) || null;
    if (this.selectedEvent) { this.loadParticipants(); await this.loadQueues(restoreMode); }
  }

  // Load participants from arena e-ticket collection
  loadParticipants() {
    if (this.participantSubscription) { this.participantSubscription.unsubscribe(); this.participantSubscription = null; }
    try {
      const arenaETicketQuery = query(
        collection(this.firestoreDefault, 'arena e-ticket'),
        where('eventref', '==', this.selectedEvent!.docref)
      );
      this.participantSubscription = collectionData(arenaETicketQuery, { idField: 'id' }).subscribe((eTicketSnapshot) => {
        const seenProfileIds = new Set<string>();
        eTicketSnapshot.forEach((doc: any) => {
          const profileId = doc['profileid'] || '';
          if (!profileId || seenProfileIds.has(profileId)) return;
          seenProfileIds.add(profileId);
        });
        this.eventParticipantProfileIds = [...seenProfileIds];
        
        this.doerTotal = this.eventParticipantProfileIds.length;
        if (this.liveChangeWorkData.length > 0 || this.beneficierProfileIds.length > 0) { this.calculateProcedureData(); }
      });
    } catch (error) { console.error('Error loading participants from arena e-ticket:', error); }
  }

  // Load queues
  private async loadQueues(restoreFromStorage: boolean = false) {
    if (!this.selectedEvent) return;
    this.isLoadingQueues = true;
    this.queuesList = []; this.ongoingQueues = []; this.selectedQueues = []; this.selectedQueueRefs = [];
    this.queueRangeStartDate = null; this.queueRangeEndDate = null;

    try {
      const queuesSnapshot = await getDocs(query(collection(this.firestoreDefault, 'queue generation'), orderBy('queueenddate', 'desc')));
      const today = new Date(); today.setHours(0, 0, 0, 0);

      queuesSnapshot.docs.forEach((doc) => {
        const data = doc.data() as QueueData; data['docref'] = doc.ref; this.queuesList.push(data);
        const startDate = data['queuestartdate']?.toDate ? data['queuestartdate'].toDate() : new Date(data['queuestartdate']);
        const endDate = data['queueenddate']?.toDate ? data['queueenddate'].toDate() : new Date(data['queueenddate']);
        startDate.setHours(0, 0, 0, 0); endDate.setHours(23, 59, 59, 999);
        if (startDate <= today && today <= endDate) { this.ongoingQueues.push(data); }
      });

      this.filteredQueuesList = [...this.queuesList];

      if (restoreFromStorage && this.storedQueueId?.length) {
        const storedQueues = this.queuesList.filter(q => this.storedQueueId!.includes(this.getDocRefPath(q.docref)));
        if (storedQueues.length > 0) {
          storedQueues.forEach(queue => { this.selectedQueues.push(queue); this.selectedQueueRefs.push(queue.docref); });
          this.queueSearchTerm = ''; this.isQueueDropdownOpen = false; this.updateQueueDateRange(); this.loadQueuevariation(); return;
        }
      }
      if (this.ongoingQueues.length > 0) { this.toggleQueueSelection(this.ongoingQueues[0]); }
    } catch (error) { console.error('Error loading queues:', error); }
    finally { this.isLoadingQueues = false; }
  }

  // Toggle queue selection
  toggleQueueSelection(queue: QueueData) {
    const index = this.selectedQueues.findIndex(q => this.getDocRefPath(q.docref) === this.getDocRefPath(queue.docref));
    if (index > -1) { this.selectedQueues.splice(index, 1); this.selectedQueueRefs.splice(index, 1); }
    else { this.selectedQueues.push(queue); this.selectedQueueRefs.push(queue.docref); }
    this.queueSearchTerm = '';
    this.saveQueueToStorage(this.selectedQueues.map(q => this.getDocRefPath(q.docref)));
    this.updateQueueDateRange();
    if (this.selectedQueues.length > 0) { this.loadQueuevariation(); } else { this.unsubscribeQueueSubscriptions(); }
  }

  // Load queue variations
  async loadQueuevariation() {
    if (this.selectedQueues.length === 0) return;
    this.atcModels = [];
    try {
      const variationPromises = this.selectedQueueRefs.map(queueRef => getDocs(query(collection(this.firestoreDefault, 'queue variation'), where('queueref', '==', queueRef))));
      const variationSnapshots = await Promise.all(variationPromises);
      let models: string[] = [];
      variationSnapshots.forEach(variationSnapshot => { variationSnapshot.docs.forEach((doc) => { models.push(doc.data()['atcmodel']); }); });
      this.atcModels = [...new Set(models)];
      this.subscribeToArenaOverview();
    } catch (error) { console.error('Error loading queue variation:', error); }
    finally { this.isLoadingQueues = false; }
  }

  // Subscribe to arena overview
  subscribeToArenaOverview() {
    this.liveChangeWorkData = [];
    this.liveChangeworkLiveData = [];
    if (this.selectedQueues.length === 0 || !this.selectedEvent || this.atcModels.length === 0) return;
    if (!this.filterStartDate || !this.filterEndDate) return;
    this.unsubscribeQueueSubscriptions();
    // Load ATC ONLY once
    this.subscribeToAtcAlpha();
    this.subscribeToLiveChangeWork();
    this.subscribeToLiveChangeworkLive();
  }

  // Subscribe to atc_alpha
  private subscribeToAtcAlpha() {
    const firestoreATC = getFirestore("firestore-atc")
    const atcQuery = query(collection(firestoreATC, 'atc_alpha'), where('product', 'in', this.atcModels), where("isdelete","==", false), where("prescription_date", ">=", this.queueRangeStartDate), where("prescription_date", "<=", this.queueRangeEndDate), orderBy("prescription_date", "desc"));
    this.atcSubscription = collectionData(atcQuery).subscribe({
      next: (docs) => {
        console.log("Total ATC", docs.length)
        console.log("Models :",this.atcModels)
        this.atcDocs = docs;
        this.profileAtcMap = {};
        docs.forEach((doc: any) => {
          const profileId: string = doc['profileid'] || '';
          if (!profileId || !this.eventParticipantProfileIds.includes(profileId)) return;
          const prescriptionDate = doc['prescription_date']?.toDate ? doc['prescription_date'].toDate() : new Date(doc['prescription_date']);
          if (!this.profileAtcMap[profileId]) { this.profileAtcMap[profileId] = { ...doc, _date: prescriptionDate }; }
        });
        this.beneficierProfileIds = [];
        Object.keys(this.profileAtcMap).forEach(profileId => {
          const atcDoc = this.profileAtcMap[profileId];
          const procedurePendingList: string[] = atcDoc['procedurependinglist'] || [];
          const procedureCompletedList: string[] = atcDoc['procedurecompletedlist'] || [];
          if (procedurePendingList.length > 0 || procedureCompletedList.length > 0) { this.beneficierProfileIds.push(profileId); }
        });
        this.beneficierTotal = this.beneficierProfileIds.length;
        this.calculateProcedureData();
      },
      error: (error) => console.error('Error subscribing to atc_alpha:', error)
    });
  }

  private subscribeToLiveChangeWork() {
    if (this.liveChangeWorkSubscription) {
      this.liveChangeWorkSubscription.unsubscribe();
      this.liveChangeWorkSubscription = null;
    }
    const start = this.filterStartDate || this.queueRangeStartDate;
    const end   = this.filterEndDate   || this.queueRangeEndDate;
    if (!start || !end || !this.selectedEvent) return;

    const liveChangeWorkQuery = query(
      collection(this.firestoreDefault, 'livechangework'),
      where('eventref', '==', this.selectedEvent.docref),
      where('createdon', '>=', start),
      where('createdon', '<=', end),
      where('procedurestatus', '==', 'completed')
    );
    this.liveChangeWorkSubscription =
      collectionData(liveChangeWorkQuery, { idField: 'id' })
        .subscribe({
          next: (docs:any[]) => {
            console.log(" COMPLETED DOC COUNT:", docs.length);
            this.liveChangeWorkData = docs;
            // recalculation AFTER data update
            this.calculateProcedureData();
          },
          error: (error) =>
            console.error('Error subscribing to livechangework:', error)
        });
  }

  private subscribeToLiveChangeworkLive() {
    if (this.liveChangeworkLiveSubscription) {
      this.liveChangeworkLiveSubscription.unsubscribe();
      this.liveChangeworkLiveSubscription = null;
    }
    const start = this.filterStartDate || this.queueRangeStartDate;
    const end   = this.filterEndDate   || this.queueRangeEndDate;
    if (!start || !end || !this.selectedEvent) return;
    const liveQuery = query(
      collection(this.firestoreDefault, 'livechangework'),
      where('eventref', '==', this.selectedEvent.docref),
      where('createdon', '>=', start),
      where('createdon', '<=', end),
      where('procedurestatus', '==', 'live')
    );
    this.liveChangeworkLiveSubscription =
      collectionData(liveQuery, { idField: 'id' })
        .subscribe({
          next: (docs:any[]) => {
            this.liveChangeworkLiveData = docs;
            this.calculateProcedureData();
          },
          error: (error) =>
            console.error('Error subscribing to livechangework live:', error)
        });
  }

  // Calculate procedure data
  private calculateProcedureData() {
    if (!this.participantMetadataMap ||
        Object.keys(this.participantMetadataMap).length === 0) {
      return;
    }
    if (!this.participantMetadataMap ||
      Object.keys(this.participantMetadataMap).length === 0) return;
    if (!this.eventParticipantProfileIds.length) return;
    const tempMap = { ...this.mapProcedureData }; 
    const filteredDoerIds = this.getFilteredDoerIds();
    const filteredBeneficierIds = this.getFilteredBeneficierIds();
    this.doerTotal = filteredDoerIds.length;
    this.beneficierTotal = filteredBeneficierIds.length;

    // Step 1: Calculate from ATC data and build beneficiary pending map per procedure
    const beneficierPendingMap: { [procedureId: string]: Set<string> } = {};
    const beneficierCompletedFromAtcMap: { [procedureId: string]: Set<string> } = {};

    const totalOpportunitiesMap: { [procedureId:string]: string[] } = {};
    const totalCompletedMap: { [procedureId:string]: string[] } = {};

    const eventSet = new Set(this.eventParticipantProfileIds);
    const firstTimerSet = new Set(this.firstTimerProfileIds);

    this.atcDocs.forEach((atc:any) => {
      const profileId = atc.profileid;
      if (!profileId) return;
      // event filter
      if (!eventSet.has(profileId)) return;
      // first timer filter
      if (this.participantFilter === 'firstTimers' &&
          !firstTimerSet.has(profileId)) return;
      const pending = atc.procedurependinglist || [];
      const completed = atc.procedurecompletedlist || [];
      pending.forEach(procId => {
      if (!tempMap[procId]) return;
      if (!totalOpportunitiesMap[procId])
          totalOpportunitiesMap[procId] = [];
      totalOpportunitiesMap[procId].push(profileId);
      if (!beneficierPendingMap[procId]) {
          beneficierPendingMap[procId] = new Set<string>();
      }
      beneficierPendingMap[procId].add(profileId);
    });

    completed.forEach(procId => {
      if (!tempMap[procId]) return;
      if (!totalCompletedMap[procId])
        totalCompletedMap[procId] = new Array();
      if (!beneficierCompletedFromAtcMap[procId]) {
          beneficierCompletedFromAtcMap[procId] = new Set<string>();
      }
      beneficierCompletedFromAtcMap[procId].add(profileId);
      totalCompletedMap[procId].push(profileId);
    });
  });

  Object.keys(tempMap).forEach(procId => {
    tempMap[procId].doerCompleted = {count:0,data:[]};
    tempMap[procId].doerNotStarted = {count:0,data:[]};
    tempMap[procId].beneficierCompleted = {count:0,data:[]};
    tempMap[procId].beneficierNotStarted = {count:0,data:[]};
    tempMap[procId].liveChangework = {count:0,data:[]};
    const oppArr = totalOpportunitiesMap[procId] || [];
    const compArr = totalCompletedMap[procId] || [];
    const oppFrequency:any = {};

    oppArr.forEach(id=>{
      oppFrequency[id] = (oppFrequency[id] || 0) + 1;
    });

    const oppDisplay = Object.keys(oppFrequency)
      .map(id=>({
        profileId:String(id),
        count:oppFrequency[id]
      }));

    tempMap[procId].totalOpportunities = {
      count: oppArr.length,   // total executions
      data: oppDisplay        // grouped persons
    };
    
    const compFrequency:any = {};
    compArr.forEach(id=>{
      compFrequency[id] = (compFrequency[id] || 0) + 1;
    });

    const compDisplay = Object.keys(compFrequency)
      .map(id=>({
        profileId:String(id),
        count:compFrequency[id]
      }));

    tempMap[procId].totalCompleted = {
      count: compArr.length,
      data: compDisplay
    };
  });

    // Step 2: Process livechangework with filter (completed status)
    const doerCompletedMap: { [procedureId: string]: Map<string, any> } = {};
    const beneficierCompletedMap: { [procedureId: string]: Map<string, any> } = {};

    this.liveChangeWorkData.forEach((lcw: any) => {
      const procedureId: string = lcw['procedureid'] || '';
      const doerId: string = lcw['doerid'] || '';
      const beneficiaryId: string = lcw['beneficiaryid'] || '';
      const procedureName: string = lcw['procedurename'] || this.mapProcedureNames[procedureId] || '';
      const hours: string = lcw['hours'] || '';
      const hourType: string = lcw['hourtype'] || '';
      const sharedNotes: string = lcw['sharednotes'] || '';
      if (!procedureId || !tempMap[procedureId]) return;

      const doerName = this.participantMetadataMap[doerId]?.['name'] || 'Unknown';
      const beneficiaryName = this.participantMetadataMap?.[beneficiaryId]?.name ?? lcw['beneficiaryname'] ?? 'Unknown';

      // if (doerId) {
      if (doerId && filteredDoerIds.includes(doerId)) {
        if (!doerCompletedMap[procedureId]) { doerCompletedMap[procedureId] = new Map<string, any>(); }
        if (!doerCompletedMap[procedureId].has(doerId)) {
          doerCompletedMap[procedureId].set(doerId, {
            doerId,
            doerName,
            beneficiaryId,
            beneficiaryName,
            procedureName,
            hours,
            hourType,
            sharedNotes,
            displayText: `${doerName} - ${beneficiaryName} (${procedureName})`
          });
        }
      }
      // if (beneficiaryId) {
      if (beneficiaryId && filteredBeneficierIds.includes(beneficiaryId)) {
      if (!beneficierCompletedMap[procedureId]) { beneficierCompletedMap[procedureId] = new Map<string, any>(); }
        if (!beneficierCompletedMap[procedureId].has(beneficiaryId)) {
          beneficierCompletedMap[procedureId].set(beneficiaryId, {
            doerId,
            doerName,
            beneficiaryId,
            beneficiaryName,
            procedureName,
            hours,
            hourType,
            sharedNotes,
            displayText: `${doerName} - ${beneficiaryName} (${procedureName})`
          });
        }
      }
    });

    // Step 3: Process livechangework with live status
    const liveChangeworkMap: { [procedureId: string]: any[] } = {};
    this.liveChangeworkLiveData.forEach((lcw: any) => {
      const procedureId: string = lcw['procedureid'] || '';
      const doerId: string = lcw['doerid'] || '';
      const beneficiaryId: string = lcw['beneficiaryid'] || '';
      const procedureName: string = lcw['procedurename'] || this.mapProcedureNames[procedureId] || '';
      if (!procedureId || !tempMap[procedureId]) return;

      // Check if doer or beneficiary is in filtered lists
      const doerInFilter = doerId && filteredDoerIds.includes(doerId);
      const beneficiaryInFilter = beneficiaryId && filteredBeneficierIds.includes(beneficiaryId);
      
      if (doerInFilter || beneficiaryInFilter) {
        if (!liveChangeworkMap[procedureId]) { liveChangeworkMap[procedureId] = []; }
        const doerName = this.participantMetadataMap[doerId]?.['name'] || 'Unknown';
        const beneficiaryName = this.participantMetadataMap[beneficiaryId]?.['name'] || 'Unknown';
        liveChangeworkMap[procedureId].push({
          doerId,
          doerName,
          beneficiaryId,
          beneficiaryName,
          procedureName,
          displayText: `${doerName} - ${beneficiaryName} - (${procedureName})`
        });
      }
    });

    // Step 4: Calculate final stats
    let totalLiveCount = 0;
    Object.keys(tempMap).forEach(procedureId => {
      const doerCompletedData = doerCompletedMap[procedureId] || new Map<string, any>();
      tempMap[procedureId].doerCompleted.count = doerCompletedData.size;
      tempMap[procedureId].doerCompleted.data = Array.from(doerCompletedData.values());
      const doerCompletedIds = new Set(doerCompletedData.keys());
      const doerNotStartedArray = filteredDoerIds.filter(id => !doerCompletedIds.has(id));
      tempMap[procedureId].doerNotStarted.count = doerNotStartedArray.length;
      tempMap[procedureId].doerNotStarted.data = doerNotStartedArray;

      // Beneficiary completed from livechangework
      const beneficierCompletedData = beneficierCompletedMap[procedureId] || new Map<string, any>();
      tempMap[procedureId].beneficierCompleted.count = beneficierCompletedData.size;
      tempMap[procedureId].beneficierCompleted.data = Array.from(beneficierCompletedData.values());
      
      // Beneficiary Not Started: unique participants who have this procedure in pendinglist but not completed
      const beneficierCompletedIds = new Set(beneficierCompletedData.keys());
      const pendingSet = beneficierPendingMap[procedureId] || new Set<string>();
      const completedFromAtc = beneficierCompletedFromAtcMap[procedureId] || new Set<string>();
      const completedFromLive = new Set(beneficierCompletedData.keys());
      const beneficierNotStartedArray = [...pendingSet].filter(id => !completedFromAtc.has(id) && !completedFromLive.has(id));

      tempMap[procedureId].beneficierNotStarted.count = beneficierNotStartedArray.length;
      tempMap[procedureId].beneficierNotStarted.data = beneficierNotStartedArray;

      // Live changework stats
      const liveData = liveChangeworkMap[procedureId] || [];
      tempMap[procedureId].liveChangework.count = liveData.length;
      tempMap[procedureId].liveChangework.data = liveData;
      totalLiveCount += liveData.length;
    });

    this.mapProcedureData = { ...tempMap };
    this.cdr.detectChanges();

    // Sort procedures by completed count (doerCompleted + beneficierCompleted) descending
    this.sortedProcedureIds = Object.keys(tempMap).sort((a, b) =>
      tempMap[b].totalOpportunities.count - tempMap[a].totalOpportunities.count
    );
  }

  // Update queue date range
  updateQueueDateRange() {
    if (this.selectedQueues.length === 0) { this.queueRangeStartDate = null; this.queueRangeEndDate = null; return; }
    let oldestStart: Date | null = null; let newestEnd: Date | null = null;
    this.selectedQueues.forEach(queue => {
      const startDate = queue['queuestartdate']?.toDate ? queue['queuestartdate'].toDate() : new Date(queue['queuestartdate']);
      const endDate = queue['queueenddate']?.toDate ? queue['queueenddate'].toDate() : new Date(queue['queueenddate']);
      if (!oldestStart || startDate < oldestStart) { oldestStart = new Date(startDate); }
      if (!newestEnd || endDate > newestEnd) { newestEnd = new Date(endDate); }
    });
    if (oldestStart) oldestStart.setHours(0, 0, 0, 0);
    if (newestEnd) newestEnd.setHours(23, 59, 59, 999);
    this.queueRangeStartDate = oldestStart;
    this.queueRangeEndDate = newestEnd;
  }

  // Update filter date range
  updateFilterDateRange(filter: string): void {
    if (filter === 'all') {
      if (this.selectedEvent) {
        const start = this.selectedEvent['start_date']?.toDate ? this.selectedEvent['start_date'].toDate() : new Date(this.selectedEvent['start_date']);
        const end = this.selectedEvent['end_date']?.toDate ? this.selectedEvent['end_date'].toDate() : new Date(this.selectedEvent['end_date']);
        this.filterStartDate = new Date(start); this.filterStartDate.setHours(0, 0, 0, 0);
        this.filterEndDate = new Date(end); this.filterEndDate.setHours(23, 59, 59, 999);
      }
    } else if (filter.startsWith('day')) {
      const selectedDay = this.eventDays.find(day => day.day === filter);
      if (selectedDay) {
        this.filterStartDate = new Date(selectedDay.dateObj); this.filterStartDate.setHours(0, 0, 0, 0);
        this.filterEndDate = new Date(selectedDay.dateObj); this.filterEndDate.setHours(23, 59, 59, 999);
      }
    }
  }

  // Set day filter
  setFilter(filter: string): void {
    this.currentFilter = filter;
    this.updateFilterDateRange(filter);
    if (filter !== 'all' && filter.startsWith('day')) {
      const dayIndex = parseInt(filter.replace('day', '')) - 1;
      if (dayIndex < this.scrollOffset) { this.scrollOffset = dayIndex; }
      else if (dayIndex >= this.scrollOffset + this.maxVisibleDays) { this.scrollOffset = dayIndex - this.maxVisibleDays + 1; }
    }
    this.unsubscribeQueueSubscriptions();
    this.subscribeToArenaOverview();
  }

  // Unsubscribe queue subscriptions
  private unsubscribeQueueSubscriptions() {
    if (this.atcSubscription) { this.atcSubscription.unsubscribe(); this.atcSubscription = null; }
    if (this.liveChangeWorkSubscription) { this.liveChangeWorkSubscription.unsubscribe(); this.liveChangeWorkSubscription = null; }
    if (this.liveChangeworkLiveSubscription) { this.liveChangeworkLiveSubscription.unsubscribe(); this.liveChangeworkLiveSubscription = null; }
    this.liveChangeWorkData = []; this.liveChangeworkLiveData = []; this.beneficierProfileIds = [];
  }

  // Unsubscribe event subscriptions
  private unsubscribeEventSubscriptions() { if (this.participantSubscription) { this.participantSubscription.unsubscribe(); this.participantSubscription = null; } }

  // Unsubscribe all subscriptions
  private unsubscribeAllSubscriptions() {
    this.unsubscribeQueueSubscriptions(); this.unsubscribeEventSubscriptions();
    if (this.metadataSubscription) { this.metadataSubscription.unsubscribe(); this.metadataSubscription = null; }
  }

  getTagKeys(): string[] { return Object.keys(this.mapTags); }
  getCardStyles(tag: string): { [key: string]: string } { const color = this.getTagColor(tag); return { 'background': color.bgGradient, 'border-color': color.border }; }
  getTagColor(tag: string): TagColor { if (!this.tagColors[tag]) { this.tagColors[tag] = this.colorPalette[this.colorIndex % this.colorPalette.length]; this.colorIndex++; } return this.tagColors[tag]; }
  getTitleStyles(tag: string): { [key: string]: string } { const color = this.getTagColor(tag); return { 'color': color.title }; }
  getCountStyles(tag: string): { [key: string]: string } { const color = this.getTagColor(tag); return { 'background': color.countBg, 'color': color.countText }; }

  getVisibleDays(): Array<{ day: string; dateObj: Date; displayText: string }> {
    const allDays = this.eventDays.slice(1); const totalDays = allDays.length;
    if (totalDays <= this.maxVisibleDays) return allDays;
    const startIndex = Math.max(0, Math.min(this.scrollOffset, totalDays - this.maxVisibleDays));
    const endIndex = Math.min(totalDays, startIndex + this.maxVisibleDays);
    return allDays.slice(startIndex, endIndex);
  }

  isToday(date: Date): boolean { const today = new Date(); return date.toDateString() === today.toDateString(); }
  getDayLabel(day: { day: string; dateObj: Date; displayText: string }): string { const dayNum = day.day.replace('day', ''); const weekday = day.dateObj.toLocaleDateString('en-IN', { weekday: 'short' }); const monthDay = day.dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }); return `D${dayNum} · ${weekday}, ${monthDay}`; }
  getScrollRange(): string { const allDays = this.eventDays.slice(1); const start = this.scrollOffset + 1; const end = Math.min(this.scrollOffset + this.maxVisibleDays, allDays.length); return `${start}-${end} of ${allDays.length}`; }
  scrollDays(direction: 'left' | 'right'): void { const allDays = this.eventDays.slice(1); const totalDays = allDays.length; const step = 3; if (direction === 'left') { this.scrollOffset = Math.max(0, this.scrollOffset - step); } else { this.scrollOffset = Math.min(totalDays - this.maxVisibleDays, this.scrollOffset + step); } }
  hasMoreLeft(): boolean { return this.scrollOffset > 0; }
  hasMoreRight(): boolean { const allDays = this.eventDays.slice(1); return this.scrollOffset < allDays.length - this.maxVisibleDays; }

  // Show participants in side panel
  showParticipants(cwName: string, role: string, status: string, data: { count: number; data: any[] }): void {
    this.currentSelection = { cwName, role, status, count: data.count };
    this.panelTitle = `${this.mapProcedureNames[cwName] || cwName} - ${role}`;
    const uniquePeople = new Set( data.data.map((d:any)=> typeof d === 'string' ? d : d.profileId || d.beneficiaryId || d.doerId )).size;
    this.panelSubtitle = `${status} (${uniquePeople} participants • ${data.count} procedures)`;
    this.showActions = true;
    if (data.data && data.data.length > 0) {
      // Check if this is live changework or completed data (has displayText property)
      if (role === 'Live Changework') {
        this.selectedParticipants = data.data.map((item: any) => {
          const doerInitials = (item.doerName || 'UN').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
          return {
            name: item.displayText, count: item.count || 1,
            cohort: '',
            initials: doerInitials,
            selected: false,
            profileId: item.doerId,
            displayText: item.displayText,
            doerId: item.doerId,
            beneficiaryId: item.beneficiaryId,
            procedureName: item.procedureName,
            hours: item.hours || '',
            hourType: item.hourType || '',
            sharedNotes: item.sharedNotes || '',
            // count: item.count || 1
          };
        });
      } else {        
        this.selectedParticipants = data.data.map((item:any) => {
        // LIVE / COMPLETED objects
        if(item.doerName || item.beneficiaryName){
          const name = item.displayText || `${item.doerName} - ${item.beneficiaryName} (${item.procedureName})` || item.doerName || item.beneficiaryName || 'Unknown';
          const initials = name ? name.split(' ').map((n:string)=>n[0]).join('').substring(0,2).toUpperCase() : 'NA'
          return {
            name: name, //item.count > 1 ? `${name} (${item.count})`
            initials,
            cohort:'',
            selected:false,
            profileId: item.beneficiaryId || item.doerId,
            hours:item.hours,
            hourType:item.hourType,
            sharedNotes:item.sharedNotes,
            count:item.count || 1
          };
        }

        // ATC objects
        const profileId = typeof item === 'string' ? item: item.profileId;
        const metadata = this.participantMetadataMap[profileId];
        const name = metadata?.name || `User-${profileId?.slice(-4)}`;
        const initials = name.split(' ').map((n:string)=>n[0]).join('').substring(0,2).toUpperCase();
        return {
          name: name, //item.count > 1 ? `${name} (${item.count})` :
          cohort: metadata?.['cohort'] || '',
          initials,
          selected:false,
          profileId,
          count:item.count || 1
        };
      });
        // this.selectedParticipants.sort((a, b) => a.name.localeCompare(b.name));
      }
    } else { this.selectedParticipants = []; }
    this.isSidePanelOpen = true;
  }

  closeSidePanel(): void { this.isSidePanelOpen = false; }
  isActive(cwName: string, role: string, status: string): boolean { return this.isSidePanelOpen && this.currentSelection?.cwName === cwName && this.currentSelection?.role === role && this.currentSelection?.status === status; }
  toggleParticipant(participant: Participant): void { participant.selected = !participant.selected; }
  getSelectedCount(): number { return this.selectedParticipants.filter(p => p.selected).length; }

  sendNotification(): void { const count = this.getSelectedCount(); alert(count > 0 ? `🔔 Notification sent to ${count} selected participants` : '🔔 Please select participants first'); }
  initiateCalling(): void { const count = this.getSelectedCount(); alert(count > 0 ? `📞 Calling list generated for ${count} selected participants` : '📞 Please select participants first'); }
  sendToWall(): void { const count = this.getSelectedCount(); alert(count > 0 ? `📺 ${count} names sent to B!G Wall display` : '📺 Please select participants first'); }

  // Export to Excel
  exportToExcel(): void {
    if (this.selectedParticipants.length === 0) { alert('📊 No participants to export'); return; }
    const exportData = this.selectedParticipants.map((p, index) => ({ 'S.No': index + 1, 'Name': p.name, 'Cohort': p.cohort, 'Profile ID': p.profileId || '' }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');
    worksheet['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 20 }, { wch: 25 }];
    const fileName = `${this.panelTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  // Export all changework data to Excel (all data till current date)
  async exportAllChangework(): Promise<void> {
    if (!this.selectedEvent) { alert('📊 Please select an event first'); return; }

    try {
      // Fetch all changework data for this event till current date
      const currentDate = new Date();
      currentDate.setHours(23, 59, 59, 999);

      const allChangeworkQuery = query(
        collection(this.firestoreDefault, 'livechangework'),
        where('eventref', '==', this.selectedEvent.docref),
        where('createdon', '<=', currentDate),
        orderBy('createdon', 'desc')
      );

      const snapshot = await getDocs(allChangeworkQuery);
      
      if (snapshot.empty) { alert('📊 No changework data to export'); return; }

      const exportData: any[] = [];

      snapshot.docs.forEach((doc) => {
        const lcw = doc.data();
        const doerId = lcw['doerid'] || '';
        const beneficiaryId = lcw['beneficiaryid'] || '';
        const doerMetadata = this.participantMetadataMap[doerId];
        const beneficiaryMetadata = this.participantMetadataMap[beneficiaryId];
        const doerName = doerMetadata?.['name'] || 'Unknown';
        const beneficiaryName = beneficiaryMetadata?.['name'] || 'Unknown';
        const doerEmail = doerMetadata?.['email'] || '';
        const beneficiaryEmail = beneficiaryMetadata?.['email'] || '';
        const procedureName = lcw['procedurename'] || this.mapProcedureNames[lcw['procedureid']] || '';
        const status = lcw['procedurestatus'] || '';
        const createdOn = lcw['createdon']?.toDate ? lcw['createdon'].toDate() : new Date(lcw['createdon']);
        const dateStr = createdOn.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });

        // Add row for Doer
        if (doerId && this.getFilteredDoerIds().includes(doerId)) {
          exportData.push({
            'Name': doerName,
            'Email': doerEmail,
            'benefiers/doers': 'Doers',
            'changework': procedureName,
            'Date': dateStr,
            'changework Status': status
          });
        }

        // Add row for Beneficiary
        if (beneficiaryId && this.getFilteredBeneficierIds().includes(beneficiaryId)) {
          exportData.push({
            'Name': beneficiaryName,
            'Email': beneficiaryEmail,
            'benefiers/doers': 'Benefiers',
            'changework': procedureName,
            'Date': dateStr,
            'changework Status': status
          });
        }
      });

      if (exportData.length === 0) { alert('📊 No changework data to export'); return; }

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Changework Data');
      worksheet['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 18 }];
      const eventName = this.selectedEvent?.['name'] || 'Event';
      const fileName = `${eventName.replace(/[^a-zA-Z0-9]/g, '_')}_Changework_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exporting changework data:', error);
      alert('📊 Error exporting data. Please try again.');
    }
  }



  toggleDropdown() { this.isDropdownOpen = !this.isDropdownOpen; this.isQueueDropdownOpen = false; if (this.isDropdownOpen) { this.filteredEventsList = [...this.eventsList]; this.searchTerm = ''; this.highlightedIndex = -1; setTimeout(() => { this.searchInput?.nativeElement?.focus(); }, 100); } }
  openDropdown() { }
  onSearchChange() { const term = this.searchTerm.toLowerCase().trim(); if (!term) { this.filteredEventsList = [...this.eventsList]; } else { this.filteredEventsList = this.eventsList.filter(event => { const name = (event.name || event['title'] || '').toLowerCase(); return name.includes(term); }); } this.highlightedIndex = this.filteredEventsList.length > 0 ? 0 : -1; }
  clearSelection(event: MouseEvent) { }
  onKeyDown(event: KeyboardEvent) { if (!this.isDropdownOpen) return; switch (event.key) { case 'ArrowDown': event.preventDefault(); this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredEventsList.length - 1); this.scrollToHighlighted('event'); break; case 'ArrowUp': event.preventDefault(); this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0); this.scrollToHighlighted('event'); break; case 'Enter': event.preventDefault(); if (this.highlightedIndex >= 0 && this.filteredEventsList[this.highlightedIndex]) { this.selectEvent(this.filteredEventsList[this.highlightedIndex]); } break; case 'Escape': this.isDropdownOpen = false; break; } }
  scrollToHighlighted(type: 'event' | 'queue') { setTimeout(() => { const selector = type === 'event' ? '.event-dropdown .dropdown-item.highlighted' : '.queue-dropdown .dropdown-item.highlighted'; const highlighted = document.querySelector(selector); if (highlighted) { highlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, 10); }

  toggleQueueDropdown() { this.isQueueDropdownOpen = !this.isQueueDropdownOpen; this.isDropdownOpen = false; if (this.isQueueDropdownOpen) { this.filteredQueuesList = [...this.queuesList]; this.queueSearchTerm = ''; this.queueHighlightedIndex = -1; setTimeout(() => { this.queueSearchInput?.nativeElement?.focus(); }, 100); } }
  onQueueSearchChange() { const term = this.queueSearchTerm.toLowerCase().trim(); if (!term) { this.filteredQueuesList = [...this.queuesList]; } else { this.filteredQueuesList = this.queuesList.filter(queue => { const name = (queue.name || queue['title'] || queue['queuename'] || '').toLowerCase(); return name.includes(term); }); } this.queueHighlightedIndex = this.filteredQueuesList.length > 0 ? 0 : -1; }
  openQueueDropdown() { if (!this.isQueueDropdownOpen) { this.isQueueDropdownOpen = true; this.isDropdownOpen = false; this.filteredQueuesList = [...this.queuesList]; this.queueHighlightedIndex = -1; setTimeout(() => { this.queueSearchInput?.nativeElement?.focus(); }, 100); } }
  onQueueKeyDown(event: KeyboardEvent) { if (!this.isQueueDropdownOpen) return; switch (event.key) { case 'ArrowDown': event.preventDefault(); this.queueHighlightedIndex = Math.min(this.queueHighlightedIndex + 1, this.filteredQueuesList.length - 1); this.scrollToHighlighted('queue'); break; case 'ArrowUp': event.preventDefault(); this.queueHighlightedIndex = Math.max(this.queueHighlightedIndex - 1, 0); this.scrollToHighlighted('queue'); break; case 'Enter': event.preventDefault(); if (this.queueHighlightedIndex >= 0 && this.filteredQueuesList[this.queueHighlightedIndex]) { this.toggleQueueSelection(this.filteredQueuesList[this.queueHighlightedIndex]); } break; case 'Escape': this.isQueueDropdownOpen = false; break; } }
  clearQueueSelection(event: MouseEvent) { event.stopPropagation(); this.unsubscribeQueueSubscriptions(); this.selectedQueues = []; this.selectedQueueRefs = []; this.queueRangeStartDate = null; this.queueRangeEndDate = null; this.queueSearchTerm = ''; this.clearQueueFromStorage(); }
  isQueueSelected(queue: QueueData): boolean { return this.selectedQueues.some(q => this.getDocRefPath(q.docref) === this.getDocRefPath(queue.docref)); }
  isOngoingEvent(event: EventData): boolean { return this.ongoingEvents.some(e => e.docref === event.docref); }
  isOngoingQueue(queue: QueueData): boolean { return this.ongoingQueues.some(q => q.docref === queue.docref); }

  private getDocRefPath(docRef: DocumentReference): string { return docRef.path; }
  private saveEventToStorage(eventId: string) { try { localStorage.setItem(STORAGE_KEY_EVENT, eventId); } catch (e) { } }
  private saveQueueToStorage(queueIds: string[]) { try { localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queueIds)); } catch (e) { } }
  private getEventFromStorage(): string | null { try { return localStorage.getItem(STORAGE_KEY_EVENT); } catch (e) { return null; } }
  private getQueueFromStorage(): string[] | null { try { const stored = localStorage.getItem(STORAGE_KEY_QUEUE); return stored ? JSON.parse(stored) : null; } catch (e) { return null; } }
  private clearQueueFromStorage() { try { localStorage.removeItem(STORAGE_KEY_QUEUE); } catch (e) { } }

  getUniqueParticipants(data:any[]): number {
    if (!data || data.length === 0) return 0;
    const uniqueIds = new Set<string>();
    data.forEach(d => { let id = typeof d === 'string'? d : d?.profileId || d?.beneficiaryId || d?.doerId;
      //  Prevent undefined / null entering the Set
      if (id) {
        uniqueIds.add(id);
      }
    });
    return uniqueIds.size;
  }
}