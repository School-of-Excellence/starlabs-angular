import { Injectable, OnDestroy } from '@angular/core';
import {
  addDoc, collection, collectionData, doc, documentId, DocumentReference, getDoc, getDocs, getFirestore,
  limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where
} from '@angular/fire/firestore';
import { Subject, Subscription } from 'rxjs';
import { AuthguardService } from '../../authguard.service';

/**
 * LiveEventDataService — Phase 1 data layer for live-event-dashboard-v3.
 *
 * Every subscription/derivation here is LIFTED VERBATIM from an existing
 * component (cited per-method). No new Firestore queries were introduced.
 * Sources:
 *   FT = first-timers-dashboard.component.ts
 *   V1 = live-event-dashboard.component.ts
 *   V2 = live-event-dashboard-v2.component.ts
 *
 * The service owns the subscriptions; the component subscribes to `changed$`
 * and runs change detection when data updates (real-time preserved).
 */

export interface EventData { docref: DocumentReference; name: string; start_date: any; end_date: any; [key: string]: any; }
export interface QueueData { docref: DocumentReference; name: string; start_date: any; end_date: any; eventref?: DocumentReference; queuestartdate?: any; queueenddate?: any; [key: string]: any; }
export interface ProcedureStats { totalOpportunities: { count: number; data: any[] }; totalCompleted: { count: number; data: any[] }; doerNotStarted: { count: number; data: string[] }; doerCompleted: { count: number; data: string[] }; beneficierNotStarted: { count: number; data: string[] }; beneficierCompleted: { count: number; data: string[] }; liveChangework: { count: number; data: any[] }; }
export interface JourneyCount { journeyId: string; journeyName: string; count: number; profileIds: string[]; }
export interface AtcBuckets {
  full: number; partial: number; unvalidated: number; none: number;
  fullIds: string[]; partialIds: string[]; unvalidatedIds: string[]; noneIds: string[];
}
export interface PanelParticipant { docref: string; profileid: string; name: string; email: string; phone: string; photo?: string; activejourney?: string; profiletags?: string[]; isPresent: boolean; isSelected: boolean; isNotRegistered: boolean; [key: string]: any; }
export interface DayAttendance {
  day: number; date: string; displayLabel: string; count: number; percentage: number;
  isToday: boolean; isPast: boolean; isFuture: boolean;
  presentProfileIds: string[]; absentProfileIds: string[];
}
export interface ParticipantAtcAgg { adjTotal: number; adjDone: number; adjPending: number; procTotal: number; procDone: number; procPending: number; }

@Injectable()
export class LiveEventDataService implements OnDestroy {
  /** Emits whenever any owned state changes so the component can re-render. */
  changed$ = new Subject<void>();

  firestoreDefault = getFirestore();
  firestoreATC = getFirestore('firestore-atc');

  // ---- events / queues (FT loadData + loadQueues / V2 identical) --------------
  eventsList: EventData[] = [];
  ongoingEvents: EventData[] = [];
  queuesList: QueueData[] = [];
  ongoingQueues: QueueData[] = [];
  selectedEvent: EventData | null = null;
  selectedQueues: QueueData[] = [];
  selectedQueueRefs: DocumentReference[] = [];
  queueRangeStartDate: Date | null = null;
  queueRangeEndDate: Date | null = null;
  filterStartDate: Date | null = null;
  filterEndDate: Date | null = null;
  atcModels: string[] = [];

  // ---- participants / metadata / journeys (V2) --------------------------------
  eventParticipantProfileIds: string[] = [];
  registeredCount = 0;
  // "Generated" (V2 subscribeToETickets): unique profileids scanned in
  // (arena e-ticket, active==true) for this event.
  scannedProfileIds: string[] = [];
  scannedCount = 0;
  // full arena e-ticket doc per participant (for manual attendance marking).
  arenaETicketByProfile: { [profileid: string]: any } = {};
  notScannedProfileIds: string[] = [];
  notScannedCount = 0;
  eventParticipants: PanelParticipant[] = [];
  // O(1) lookups for buildParticipantFromProfileId (was O(n) find/includes → O(n²)
  // when called in per-participant loops). Same values, just indexed.
  private eventParticipantSet: Set<string> = new Set();
  private registeredByProfileId: { [id: string]: PanelParticipant } = {};
  // name fallback from the event participation request doc (V2 does this) — used
  // when a registered participant has no `participant metadata` doc.
  registeredNames: { [profileid: string]: string } = {};
  // product per participant from `event participation request` (productref → name via
  // authguard.getProductMap()). Surfaced in every drill-down list.
  productMap: { [productDocId: string]: string } = {};
  registeredProductIds: { [profileid: string]: string[] } = {};   // all eligible product ids
  participantMetadataMap: { [profileid: string]: any } = {};
  mapJourneyData: { [key: string]: any } = {};
  journeyCounts: JourneyCount[] = [];
  totalJourneyParticipants = 0;

  // ---- procedures (FT calculateProcedureData pipeline) ------------------------
  mapProcedureNames: { [key: string]: string } = {};
  mapProcedureData: { [key: string]: ProcedureStats } = {};
  sortedProcedureIds: string[] = [];
  atcDocs: any[] = [];
  private profileAtcMap: { [profileId: string]: any } = {};
  beneficierProfileIds: string[] = [];
  firstTimerProfileIds: string[] = [];         // only consulted when participantFilter==='firstTimers'
  participantFilter: 'all' | 'firstTimers' = 'all';
  liveChangeWorkData: any[] = [];
  liveChangeworkLiveData: any[] = [];
  liveChangeworkTotal = 0;
  doerTotal = 0;
  beneficierTotal = 0;

  // ---- adjustments (V1 scalar-field sums over atc_alpha) ----------------------
  totalAdjustmentCount = 0;
  totalAdjustmentCompletedCount = 0;
  totalAdjustmentPendingCount = 0;
  // per-participant ATC scalar aggregate (V1 basis) for the Participant Data table
  participantAtc: { [profileid: string]: ParticipantAtcAgg } = {};

  // ---- attendance (V2 generateDayWiseStructure + subscribeToAttendance) --------
  dayWiseAttendance: DayAttendance[] = [];
  mapAttendence: { [profileid: string]: any[] } = {};
  allDayAbsentProfileIds: string[] = [];
  todayAttendence = 0;

  // ---- video ask (V2 subscribeToVideoAsk) -------------------------------------
  // Tag taxonomy (C-7 = V2): classify/eventtags.videoasktags (global, loaded once).
  videoAskTags: string[] = [];
  // Participant-tag taxonomy (V2 "participant tags" collection): {docid, name, …}.
  // Source for the Video Ask Tags section (grouped by metadata `profiletags`).
  participantTags: any[] = [];
  // A&H CRM flag-status tags — "participant tags" with tagsfor 'live event'
  // (first-timers-dashboard source). Grouped by metadata `profiletags`.
  crmTags: any[] = [];
  // participantvideoask submissions bucketed by uploaded date → submitter profileids.
  videoAskByDay: { [date: string]: string[] } = {};
  // same, but only TAGGED submissions (participantvideoask.tags ∩ taxonomy) — a
  // tagged videoask counts as "reviewed" (operator rule).
  videoAskTaggedByDay: { [date: string]: string[] } = {};
  // per participant: their video-ask tags from submissions (∩ taxonomy). Drives the
  // frontend Video Ask Tags scroller — SAME source as the backend review.
  participantVideoAskTags: { [profileid: string]: string[] } = {};
  videoAskLoaded = false;

  // ---- customer support (event-scoped: reporteddate window + participant filter)
  clientIssues: any[] = [];              // in-scope tickets (any status), newest-first
  totalOpenIssues = 0;                   // = supportCounts.open (New-open)
  issueCategories: any[] = [];           // from chat config `categories`
  categoryCounts: { category: string; count: number; open: number; inProgress: number; resolved: number; profileIds: string[] }[] = [];
  supportCounts = { open: 0, inProgress: 0, resolved: 0 };   // open=New · inProgress=Responded · resolved=closed today
  supportResolutionHours = 0;            // mean open→close hours over closed-in-scope

  // ---- Arena Calling — event_caller_log (v3's ONLY write path) -----------------
  // Deduped by `${profileid}|${dayKey}`, latest updateAt wins. `day` is normalized
  // to start-of-day so the equality upsert-by-query matches.
  callLogMap: { [key: string]: { id: string; profileId: string; dayKey: string; status: string; calledAt: any; callerId: string | null; upd: number } } = {};
  loggedInProfileId: string | null = null;   // current user (AuthguardService.getRoles().profile_ref.id)

  // ---- Zones (READ-ONLY; Phase 5) — ZM event-zone-management + V2 subscribeToZones
  // v3 renders LIVE zone occupancy only; zone config / open-close toggle / allocation
  // editing stay in event-zone-management. NOTHING here writes.
  // Zone defs (ZM eventZoneList — "event zones"): docid, zonename, coordinators[],
  // mentors[], cohorts[], status ('open'|'close'). Sorted by zonename.
  eventZoneList: any[] = [];
  mapEventZoneData: { [zoneDocId: string]: any } = {};
  // Cohorts (ZM "big cohorts"): docid → {name, cohortCategory, participantidlist}.
  mapCohortsData: { [cohortDocId: string]: any } = {};
  mapCohortParticipants: { [cohortDocId: string]: string[] } = {};
  // Allocations ("event participant zones"): profileid → {selectedzone, eligiliblecohorts}.
  // V2 subscribeToZones reads only profileid; we EXTEND with selectedzone +
  // eligiliblecohorts (both read by ZM) so occupancy can place people in zones/cohorts.
  zoneAllocationMap: { [profileid: string]: { selectedzone: string; eligiliblecohorts: string[] } } = {};
  zoneParticipantIds: Set<string> = new Set();       // V2: profileids with any allocation
  noZoneProfileIds: string[] = [];                   // V2 calculateNoZoneParticipants
  noZoneCount = 0;
  // staff (coordinator/mentor) id → name, from ZM's authguard.getProfileMap().
  staffNameMap: { [profileid: string]: string } = {};

  // ---- procedure tracking filters (FT setFilter / participantFilter) ----------
  procDayFilter: string = 'all';   // 'all' | 'yyyy-mm-dd'

  // ---- ATC buckets (V2 basis: atc_alpha completed + atc_to_validate) ----------
  // full = validated only · partial = validated AND to-validate ·
  // unvalidated = to-validate only · none = neither (event participants).
  atcToValidateProfileIds: string[] = [];
  atcBuckets: AtcBuckets = { full: 0, partial: 0, unvalidated: 0, none: 0, fullIds: [], partialIds: [], unvalidatedIds: [], noneIds: [] };

  // ---- ATC in draft (V2 subscribeToDraftAtc) — temporary_ATC drafts -----------
  // A "draft" = a temporary_ATC doc (delete==false) whose transcript[0] carries an
  // adjustment and whose lastupdated falls in the queue range; counted as UNIQUE
  // participants in the registered universe. Read from the firestore-atc DB.
  draftAtcProfileIds: string[] = [];
  draftAtcCount = 0;

  isLoading = true;

  private eventSub: Subscription | null = null;
  private metadataSub: Subscription | null = null;
  private atcSub: Subscription | null = null;
  private atcToValidateSub: Subscription | null = null;
  private lcwSub: Subscription | null = null;
  private lcwLiveSub: Subscription | null = null;
  private attendanceSub: Subscription | null = null;
  private eTicketSub: Subscription | null = null;
  private videoAskSub: Subscription | null = null;
  private clientIssuesSub: Subscription | null = null;
  private callLogSub: Subscription | null = null;
  private draftAtcSub: Subscription | null = null;
  private eventZonesSub: Subscription | null = null;
  private bigCohortsSub: Subscription | null = null;
  private participantZonesSub: Subscription | null = null;

  constructor(private authguard: AuthguardService) {}

  // ==========================================================================
  // INIT
  // ==========================================================================
  async init(): Promise<void> {
    this.isLoading = true;

    // journey map (V2 ngOnInit)
    await getDocs(collection(this.firestoreDefault, 'journey')).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const journeyData = snap.docs[i].data();
        journeyData['docid'] = snap.docs[i].id;
        this.mapJourneyData[snap.docs[i].id] = journeyData;
      }
    });
    console.log('[v3][init] journey docs:', Object.keys(this.mapJourneyData).length);

    // procedures map (FT loadData procedures block)
    await getDocs(collection(this.firestoreDefault, 'procedures')).then(procedure => {
      procedure.docs.forEach(data => {
        const procedureData = data.data();
        this.mapProcedureNames[data.id] = procedureData['name'];
        this.mapProcedureData[data.id] = { totalCompleted: { count: 0, data: [] }, totalOpportunities: { count: 0, data: [] }, doerNotStarted: { count: 0, data: [] }, doerCompleted: { count: 0, data: [] }, beneficierNotStarted: { count: 0, data: [] }, beneficierCompleted: { count: 0, data: [] }, liveChangework: { count: 0, data: [] } };
      });
    });
    console.log('[v3][init] procedures docs:', Object.keys(this.mapProcedureNames).length);

    // video-ask tag taxonomy (V2: classify/eventtags.videoasktags) — global doc, once
    await getDoc(doc(collection(this.firestoreDefault, 'classify'), 'eventtags')).then(snap => {
      if (snap.exists()) { this.videoAskTags = snap.data()['videoasktags'] || []; }
    }).catch(err => console.error('Error loading classify/eventtags:', err));
    console.log('[v3][init] videoask tag taxonomy:', this.videoAskTags);

    // participant-tag taxonomy — VIDEO-ASK tags only (videoask-display pattern):
    // tagsfor array-contains 'video ask' AND isActive. docid→name; the Video Ask
    // Tags section groups participants by their `profiletags`.
    await getDocs(query(
      collection(this.firestoreDefault, 'participant tags'),
      where('tagsfor', 'array-contains', 'video ask'),
      where('isActive', '==', true)
    )).then(snap => {
      this.participantTags = snap.docs.map(d => ({ docid: d.id, ...d.data() }));
    }).catch(err => console.error('Error loading participant tags:', err));
    console.log('[v3][init] video-ask participant tags:', this.participantTags.length);

    // A&H CRM flag-status tags — "participant tags" with tagsfor 'live event'
    // (first-timers-dashboard pattern). Grouped by participants' `profiletags`.
    await getDocs(query(
      collection(this.firestoreDefault, 'participant tags'),
      where('tagsfor', 'array-contains', 'live event')
    )).then(snap => {
      this.crmTags = snap.docs.map(d => ({ docid: d.id, ...d.data() }));
    }).catch(err => console.error('Error loading A&H CRM tags:', err));
    console.log('[v3][init] A&H CRM flag tags:', this.crmTags.length);

    // participant metadata (V2 loadParticipantMetadata)
    await this.loadParticipantMetadata();

    // customer support categories config (global doc, loaded once); the tickets
    // themselves are event-scoped and (re)subscribed per selectEvent.
    await this.loadIssueCategories();

    // current user for call-log writes (same accessor as V1/zone-management)
    try {
      const roles: any = await this.authguard.getRoles();
      this.loggedInProfileId = roles?.['profile_ref']?.id || null;
    } catch (err) { console.error('Error resolving current user:', err); }
    console.log('[v3][init] logged-in profileId:', this.loggedInProfileId);

    // staff (coordinator/mentor) id→name map for the Zones view — reused verbatim
    // from event-zone-management (authguard.getProfileMap().map). Global, once.
    try {
      const pm: any = await this.authguard.getProfileMap();
      this.staffNameMap = pm?.['map'] || {};
    } catch (err) { console.error('Error loading profile map:', err); }
    console.log('[v3][zones] staff name-map entries:', Object.keys(this.staffNameMap).length);

    // product id→name map (authguard.getProductMap) for the drill-down lists.
    try {
      this.productMap = (await this.authguard.getProductMap()) || {};
    } catch (err) { console.error('Error loading product map:', err); }
    console.log('[v3][init] product map entries:', Object.keys(this.productMap).length);

    // events (FT loadData events block / V2 identical)
    try {
      const eventsSnapshot = await getDocs(query(collection(this.firestoreDefault, 'event collection'), orderBy('end_date', 'desc')));
      const today = new Date(); today.setHours(0, 0, 0, 0);
      eventsSnapshot.docs.forEach(d => {
        const data = d.data() as EventData;
        data['docref'] = d.ref;
        this.eventsList.push(data);
        const startDate = data['start_date']?.toDate ? data['start_date'].toDate() : new Date(data['start_date']);
        const endDate = data['end_date']?.toDate ? data['end_date'].toDate() : new Date(data['end_date']);
        startDate.setHours(0, 0, 0, 0); endDate.setHours(23, 59, 59, 999);
        if (startDate <= today && today <= endDate) { this.ongoingEvents.push(data); }
      });

      // queues (FT loadQueues / V2) — loaded once so chips can render both kinds
      const queuesSnapshot = await getDocs(query(collection(this.firestoreDefault, 'queue generation'), orderBy('queueenddate', 'desc')));
      queuesSnapshot.docs.forEach(d => {
        const data = d.data() as QueueData;
        data['docref'] = d.ref;
        this.queuesList.push(data);
        const startDate = data['queuestartdate']?.toDate ? data['queuestartdate'].toDate() : new Date(data['queuestartdate']);
        const endDate = data['queueenddate']?.toDate ? data['queueenddate'].toDate() : new Date(data['queueenddate']);
        startDate.setHours(0, 0, 0, 0); endDate.setHours(23, 59, 59, 999);
        if (startDate <= today && today <= endDate) { this.ongoingQueues.push(data); }
      });

      console.log('[v3][events] total:', this.eventsList.length, '| ongoing:', this.ongoingEvents.length,
        this.ongoingEvents.map(e => e['name']));
      console.log('[v3][queues] total:', this.queuesList.length, '| ongoing:', this.ongoingQueues.length,
        this.ongoingQueues.map(q => q['name'] || q['queuename']));
      if (this.ongoingEvents.length > 0) { await this.selectEvent(this.ongoingEvents[0]); }
    } catch (error) {
      console.error('Error loading events/queues:', error);
    } finally {
      this.isLoading = false;
      this.changed$.next();
    }
  }

  // ==========================================================================
  // METADATA (V2 loadParticipantMetadata)
  // ==========================================================================
  async loadParticipantMetadata(): Promise<void> {
    this.participantMetadataMap = {};
    try {
      const metadataSnapshot = await getDocs(query(collection(this.firestoreDefault, 'participant metadata'), orderBy('name', 'asc')));
      metadataSnapshot.docs.forEach(d => {
        const data = d.data();
        this.participantMetadataMap[d.id] = {
          profileid: d.id,
          name: data['name'] || data['fullname'] || data['displayName'] || '',
          email: data['email'] || '',
          phone: data['phone'] || data['mobile'] || data['number'] || '',
          photo: data['profile'] || data['profileimg'] || '',
          activejourney: data['activejourney'] || '',
          profiletags: data['profiletags'] || [],
          ...data
        };
      });
      console.log('[v3][metadata] participant metadata docs:', Object.keys(this.participantMetadataMap).length);
    } catch (error) {
      console.error('Error loading participant metadata:', error);
    }
  }

  // ==========================================================================
  // EVENT SELECTION — drives the whole pipeline (mirrors FT/V2 selectEvent)
  // ==========================================================================
  async selectEvent(event: EventData): Promise<void> {
    this.unsubscribeEventPipeline();
    this.selectedEvent = event;
    this.procDayFilter = 'all';
    this.participantFilter = 'all';

    // date window = whole event ("All Days"), per FT updateFilterDateRange('all')
    const start = event['start_date']?.toDate ? event['start_date'].toDate() : new Date(event['start_date']);
    const end = event['end_date']?.toDate ? event['end_date'].toDate() : new Date(event['end_date']);
    this.filterStartDate = new Date(start); this.filterStartDate.setHours(0, 0, 0, 0);
    this.filterEndDate = new Date(end); this.filterEndDate.setHours(23, 59, 59, 999);

    console.log('[v3][select] event:', event['name'], '| window:', this.filterStartDate, '→', this.filterEndDate);
    await this.loadParticipants();
    this.calculateJourneyCounts();
    this.subscribeToETickets();
    this.generateDayWiseStructure();
    this.applyDefaultProcedureDay();
    this.subscribeToAttendance();
    this.subscribeToVideoAsk();
    this.subscribeToClientIssues();
    this.subscribeToCallLog();
    this.subscribeToEventZones();
    this.subscribeToBigCohorts();
    this.subscribeToParticipantZones();

    // auto-select this event's ongoing queues → derives atcModels (FT/V2 default)
    this.selectedQueues = this.ongoingQueues.filter(q => q['eventref'] && this.selectedEvent && this.pathOf(q['eventref']) === this.pathOf(this.selectedEvent.docref));
    if (this.selectedQueues.length === 0 && this.ongoingQueues.length > 0) { this.selectedQueues = [this.ongoingQueues[0]]; }
    this.selectedQueueRefs = this.selectedQueues.map(q => q.docref);
    console.log('[v3][select] auto-selected queues:', this.selectedQueues.map(q => q['name'] || q['queuename']));
    this.updateQueueDateRange();
    await this.loadQueuevariation();

    this.changed$.next();
  }

  /** Chip toggle for a queue (mirrors FT toggleQueueSelection) — re-derives atcModels. */
  async toggleQueue(queue: QueueData): Promise<void> {
    const idx = this.selectedQueues.findIndex(q => this.pathOf(q.docref) === this.pathOf(queue.docref));
    if (idx > -1) { this.selectedQueues.splice(idx, 1); this.selectedQueueRefs.splice(idx, 1); }
    else { this.selectedQueues.push(queue); this.selectedQueueRefs.push(queue.docref); }
    this.updateQueueDateRange();
    if (this.selectedQueues.length > 0) { await this.loadQueuevariation(); }
    else { this.unsubscribeQueuePipeline(); this.resetProcedureState(); }
    this.changed$.next();
  }

  isQueueSelected(queue: QueueData): boolean {
    return this.selectedQueues.some(q => this.pathOf(q.docref) === this.pathOf(queue.docref));
  }

  // ---- participant UNIVERSE — V2 loadParticipants (event participation request,
  //      status in ['approved','attended'], dedup by profileid). Team-confirmed
  //      source for eventParticipantProfileIds. registeredCount = its size.
  private async loadParticipants(): Promise<void> {
    if (!this.selectedEvent) return;
    try {
      const snap = await getDocs(query(
        collection(this.firestoreDefault, 'event participation request'),
        where('eventref', '==', this.selectedEvent.docref),
        where('status', 'in', ['approved', 'attended'])
      ));
      const seen = new Set<string>();
      const docs: any[] = [];
      // A participant can have MULTIPLE request docs — one per eligible product.
      // Dedup the universe by profileid, but collect ALL productrefs per person.
      const productSets: { [pid: string]: Set<string> } = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const profileId = data['profileid'] || '';
        if (!profileId) return;
        const pref = data['productref']?.id;
        if (pref) { (productSets[profileId] = productSets[profileId] || new Set<string>()).add(pref); }
        if (seen.has(profileId)) return;
        seen.add(profileId);
        docs.push({ docref: d.id, profileid: profileId, ...data });
      });
      this.eventParticipantProfileIds = [...seen];
      this.eventParticipantSet = new Set(this.eventParticipantProfileIds);
      this.registeredCount = this.eventParticipantProfileIds.length;
      this.registeredNames = {};
      this.registeredProductIds = {};
      Object.keys(productSets).forEach(pid => { this.registeredProductIds[pid] = [...productSets[pid]]; });
      docs.forEach(d => {
        const n = d['name'] || d['fullname'] || d['displayName'] || ''; if (n) { this.registeredNames[d.profileid] = n; }
      });
      this.eventParticipants = docs.map(d => this.buildParticipantFromProfileId(d.profileid, false));
      this.registeredByProfileId = {};
      this.eventParticipants.forEach(p => { this.registeredByProfileId[p.profileid] = p; });
      const named = this.eventParticipantProfileIds.filter(id => this.participantMetadataMap[id]?.['name'] || this.registeredNames[id]).length;
      console.log('[v3][participants] event:', this.selectedEvent?.['name'],
        '| approved/attended (registered universe):', this.registeredCount, '| with a resolvable name:', named);
    } catch (error) {
      console.error('Error loading participants:', error);
    }
  }

  // "Generated"/hero — V2 subscribeToETickets (arena e-ticket, active==true).
  // A distinct set from the registered universe.
  private subscribeToETickets(): void {
    if (!this.selectedEvent) return;
    if (this.eTicketSub) { this.eTicketSub.unsubscribe(); this.eTicketSub = null; }
    this.eTicketSub = collectionData(query(
      collection(this.firestoreDefault, 'arena e-ticket'),
      where('eventref', '==', this.selectedEvent.docref),
      where('active', '==', true)
    )).subscribe({
      next: (list: any[]) => {
        const scanned = new Set<string>();
        this.arenaETicketByProfile = {};
        list.forEach((d: any) => { const pid = d['profileid']; if (pid) { scanned.add(pid); this.arenaETicketByProfile[pid] = d; } });
        this.scannedProfileIds = [...scanned];
        this.scannedCount = this.scannedProfileIds.length;
        this.recomputeNotScanned();
        console.log('[v3][hero/generated] e-ticket docs:', list.length,
          '| registered:', this.registeredCount, '| scanned (hero):', this.scannedCount,
          '| notScanned:', this.notScannedCount);
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to e-tickets:', error)
    });
  }

  private recomputeNotScanned(): void {
    const scanned = new Set(this.scannedProfileIds);
    this.notScannedProfileIds = this.eventParticipantProfileIds.filter(id => !scanned.has(id));
    this.notScannedCount = this.notScannedProfileIds.length;
  }

  // ---- attendance (V2 generateDayWiseStructure) ------------------------------
  private generateDayWiseStructure(): void {
    if (!this.selectedEvent) { this.dayWiseAttendance = []; return; }
    const startDate = this.selectedEvent['start_date']?.toDate ? this.selectedEvent['start_date'].toDate() : new Date(this.selectedEvent['start_date']);
    const endDate = this.selectedEvent['end_date']?.toDate ? this.selectedEvent['end_date'].toDate() : new Date(this.selectedEvent['end_date']);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    this.dayWiseAttendance = [];
    let currentDate = new Date(startDate); currentDate.setHours(0, 0, 0, 0);
    let dayNumber = 1;
    while (currentDate <= endDate) {
      const dateStr = currentDate.toLocaleDateString('en-CA');
      const todayStr = today.toLocaleDateString('en-CA');
      const isToday = dateStr === todayStr;
      this.dayWiseAttendance.push({
        day: dayNumber, date: dateStr, displayLabel: isToday ? 'Today' : 'DAY ' + dayNumber,
        count: 0, percentage: 0, isToday, isPast: currentDate < today, isFuture: currentDate > today,
        presentProfileIds: [], absentProfileIds: []
      });
      currentDate.setDate(currentDate.getDate() + 1); dayNumber++;
    }
    console.log('[v3][attendance] day structure:', this.dayWiseAttendance.length, 'days');
  }

  // V2 getEventDatesUntilToday
  get eventDatesUntilToday(): string[] {
    const today = new Date().toLocaleDateString('en-CA');
    return this.dayWiseAttendance.filter(d => d.date <= today).map(d => d.date);
  }

  // V2 subscribeToAttendance (attendance-grid slice only; Phase-3 followup calls dropped)
  private subscribeToAttendance(): void {
    if (!this.selectedEvent) return;
    if (this.attendanceSub) { this.attendanceSub.unsubscribe(); this.attendanceSub = null; }
    this.attendanceSub = collectionData(query(
      collection(this.firestoreDefault, 'arena e-ticket log'), where('eventref', '==', this.selectedEvent.docref)
    )).subscribe({
      next: (list: any[]) => {
        this.mapAttendence = {};
        for (let i = 0; i < list.length; i++) {
          const element = list[i];
          const profileId = element['profileid'];
          if (!profileId) continue;
          this.mapAttendence[profileId] = this.mapAttendence[profileId] || [];
          const existingDates = this.mapAttendence[profileId].map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA'));
          const logDate = new Date(element['logdate'].toDate()).toLocaleDateString('en-CA');
          if (!existingDates.includes(logDate)) { this.mapAttendence[profileId].push(element); }
        }
        this.recomputeAttendanceDays();
        console.log('[v3][attendance] e-ticket-log docs:', list.length,
          '| per-day present:', this.dayWiseAttendance.map(d => `${d.displayLabel}:${d.count}`),
          '| todayAttendence:', this.todayAttendence,
          '| neverAttended:', this.allDayAbsentProfileIds.length);
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to attendance:', error)
    });
  }

  // Recompute per-day present/absent from mapAttendence + the current universe.
  // Denominator for % is the arena e-ticket universe (eventParticipantProfileIds).
  private recomputeAttendanceDays(): void {
    const universe = this.eventParticipantProfileIds.length;
    this.dayWiseAttendance.forEach(day => {
      day.presentProfileIds = [];
      Object.keys(this.mapAttendence).forEach(profileId => {
        const attendedDates = this.mapAttendence[profileId].map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA'));
        if (attendedDates.includes(day.date)) { day.presentProfileIds.push(profileId); }
      });
      day.absentProfileIds = this.eventParticipantProfileIds.filter(profileId => !day.presentProfileIds.includes(profileId));
      day.count = day.presentProfileIds.length;
      const universeAttendees = day.presentProfileIds.filter(id => this.eventParticipantProfileIds.includes(id)).length;
      day.percentage = universe > 0 ? Math.round((universeAttendees / universe) * 100) : 0;
    });
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayDay = this.dayWiseAttendance.find(d => d.date === todayStr);
    this.todayAttendence = todayDay ? todayDay.count : 0;
    this.allDayAbsentProfileIds = this.eventParticipantProfileIds.filter(profileId => {
      const attendanceDates = this.mapAttendence[profileId]?.map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA')) || [];
      return this.eventDatesUntilToday.every(date => !attendanceDates.includes(date));
    });
    if (todayDay) {
      console.log('[v3][calls] today not-marked (absent):', todayDay.absentProfileIds.length,
        '| sample names:', todayDay.absentProfileIds.slice(0, 5).map(id => this.participantMetadataMap[id]?.['name'] || this.registeredNames[id] || 'Unknown'));
    }
  }

  // FT autoSelectToday — default the procedure Day filter to TODAY when the event
  // is ongoing (today falls inside the range); otherwise "All Days" (event already
  // completed, or not started yet). Sets the livechangework window accordingly,
  // before subscribeToArenaOverview runs.
  private applyDefaultProcedureDay(): void {
    const today = this.dayWiseAttendance.find(d => d.isToday);
    if (today) {
      this.procDayFilter = today.date;
      const [y, m, dd] = today.date.split('-').map(Number);
      this.filterStartDate = new Date(y, m - 1, dd, 0, 0, 0, 0);
      this.filterEndDate = new Date(y, m - 1, dd, 23, 59, 59, 999);
    } else {
      this.procDayFilter = 'all';
      // filterStartDate/End already span the whole event (set in selectEvent).
    }
    console.log('[v3][proc day default]', this.procDayFilter, '(ongoing today?', !!today, ')');
  }

  // ---- video ask submissions (V2 subscribeToVideoAsk) — per-day counts --------
  // arenavideoask (campaigns for the event) → participantvideoask (submissions),
  // bucketed by uploaded date. Enables the attendance grid's per-day Video Ask row.
  private async subscribeToVideoAsk(): Promise<void> {
    if (!this.selectedEvent) return;
    if (this.videoAskSub) { this.videoAskSub.unsubscribe(); this.videoAskSub = null; }
    this.videoAskByDay = {};
    this.videoAskTaggedByDay = {};
    this.participantVideoAskTags = {};
    this.videoAskLoaded = false;
    try {
      const snap = await getDocs(query(collection(this.firestoreDefault, 'arenavideoask'), where('eventref', '==', this.selectedEvent.docref)));
      let ids = snap.docs.map(d => d.id);
      if (ids.length === 0) {
        this.videoAskLoaded = true;
        console.log('[v3][videoask] no arenavideoask campaigns for event');
        this.changed$.next();
        return;
      }
      if (ids.length > 30) {
        console.warn('[v3][videoask] >30 arenavideoask campaigns — Firestore "in" caps at 30; using first 30');
        ids = ids.slice(0, 30);
      }
      this.videoAskSub = collectionData(query(
        collection(this.firestoreDefault, 'participantvideoask'), where('videoaskid', 'in', ids)
      )).subscribe({
        next: (docs: any[]) => {
          const byDay: { [date: string]: Set<string> } = {};
          const taggedByDay: { [date: string]: Set<string> } = {};
          const partTags: { [pid: string]: Set<string> } = {};
          docs.forEach((d: any) => {
            const pid = d['profileid'] || '';
            if (!pid) { return; }
            // CHANGED (operator): "reviewed" = the reviewer has GIVEN the submission a
            // tag. participantvideoask.tags holds participant-tag docids written by
            // videoask-display, so any non-empty tags array means it's reviewed.
            const tags: string[] = Array.isArray(d['tags']) ? d['tags'] : [];
            const isTagged = tags.length > 0;
            if (isTagged) { const set = partTags[pid] = partTags[pid] || new Set<string>(); tags.forEach((t: string) => set.add(t)); }
            const uploaded = d['uploaded']?.toDate ? d['uploaded'].toDate() : (d['uploaded'] ? new Date(d['uploaded']) : null);
            if (uploaded) {
              const ds = uploaded.toLocaleDateString('en-CA');
              (byDay[ds] = byDay[ds] || new Set<string>()).add(pid);
              if (isTagged) { (taggedByDay[ds] = taggedByDay[ds] || new Set<string>()).add(pid); }
            }
          });
          this.videoAskByDay = {};
          Object.keys(byDay).forEach(ds => { this.videoAskByDay[ds] = [...byDay[ds]]; });
          this.videoAskTaggedByDay = {};
          Object.keys(taggedByDay).forEach(ds => { this.videoAskTaggedByDay[ds] = [...taggedByDay[ds]]; });
          this.participantVideoAskTags = {};
          Object.keys(partTags).forEach(pid => { this.participantVideoAskTags[pid] = [...partTags[pid]]; });
          this.videoAskLoaded = true;
          console.log('[v3][videoask] participantvideoask docs:', docs.length,
            '| per-day submitters:', Object.keys(this.videoAskByDay).map(d => `${d}:${this.videoAskByDay[d].length}`),
            '| per-day tagged (reviewed):', Object.keys(this.videoAskTaggedByDay).map(d => `${d}:${this.videoAskTaggedByDay[d].length}`));
          this.changed$.next();
        },
        error: (e) => console.error('Error subscribing to participantvideoask:', e)
      });
    } catch (e) {
      console.error('Error loading arenavideoask:', e);
    }
  }

  // Category config (V2: chat config doc 0jqtiq3sxtbLVcEGMDhW → categories). Global, once.
  private async loadIssueCategories(): Promise<void> {
    try {
      const configDoc = await getDocs(query(collection(this.firestoreDefault, 'chat config'), where(documentId(), '==', '0jqtiq3sxtbLVcEGMDhW')));
      if (!configDoc.empty) { this.issueCategories = configDoc.docs[0].data()['categories'] || []; }
    } catch (err) { console.error('Error loading chat config:', err); }
  }

  // Event-scoped support tickets. Range-query clientissue by the OPEN timestamp
  // (reporteddate) over the event window server-side, then filter clientid ∈
  // eventParticipantProfileIds client-side (avoids an unbounded `in` on profileIds).
  // Field mapping (from Customer Support components): open=reporteddate,
  // close=status.date, closed=status.status==='Closed', assignee=assign[] .
  private subscribeToClientIssues(): void {
    if (!this.selectedEvent) return;
    if (this.clientIssuesSub) { this.clientIssuesSub.unsubscribe(); this.clientIssuesSub = null; }
    const s = this.selectedEvent['start_date']?.toDate ? this.selectedEvent['start_date'].toDate() : new Date(this.selectedEvent['start_date']);
    const e = this.selectedEvent['end_date']?.toDate ? this.selectedEvent['end_date'].toDate() : new Date(this.selectedEvent['end_date']);
    const startDate = new Date(s); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(e); endDate.setHours(23, 59, 59, 999);
    this.clientIssuesSub = collectionData(query(
      collection(this.firestoreDefault, 'clientissue'),
      where('reporteddate', '>=', startDate),
      where('reporteddate', '<=', endDate),
      orderBy('reporteddate', 'desc')
    ), { idField: 'id' }).subscribe({
      next: (issues: any[]) => {
        const universe = new Set(this.eventParticipantProfileIds);
        this.clientIssues = issues.filter(i => universe.has(i['clientid']));
        this.calculateSupport();
        console.log('[v3][support] window docs:', issues.length, '| in-scope (participant):', this.clientIssues.length,
          '| open/inProgress/resolvedToday:', JSON.stringify(this.supportCounts), '| mean resolution h:', this.supportResolutionHours);
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to client issues:', error)
    });
  }

  // Single source of truth for a ticket's status (KPIs, category bar AND feed all
  // use this — previously the KPI used a stricter rule and diverged):
  //   closed → resolved · open & (New | no chatstatus) → open (not yet worked) ·
  //   open & any other chatstatus (Responded / decision making / pending / …) → inProgress.
  ticketLabel(t: any): 'open' | 'inProgress' | 'resolved' {
    if (t['status']?.['status'] === 'Closed') { return 'resolved'; }
    const cs = t['chatstatus'];
    if (!cs || cs === 'New') { return 'open'; }
    return 'inProgress';
  }

  private calculateSupport(): void {
    const todayStr = new Date().toLocaleDateString('en-CA');
    let open = 0, inProgress = 0, resolvedToday = 0;
    const closedHours: number[] = [];
    this.clientIssues.forEach(t => {
      const label = this.ticketLabel(t);
      if (label === 'resolved') {
        const cd = t['status']?.['date']; const closeDate = cd?.toDate ? cd.toDate() : (cd ? new Date(cd) : null);
        const rd = t['reporteddate']; const openDate = rd?.toDate ? rd.toDate() : (rd ? new Date(rd) : null);
        if (closeDate && closeDate.toLocaleDateString('en-CA') === todayStr) { resolvedToday++; }
        if (closeDate && openDate) { closedHours.push((closeDate.getTime() - openDate.getTime()) / 3600000); }
      } else if (label === 'open') { open++; }
      else { inProgress++; }
    });
    this.supportCounts = { open, inProgress, resolved: resolvedToday };
    this.supportResolutionHours = closedHours.length ? Math.round((closedHours.reduce((a, b) => a + b, 0) / closedHours.length) * 10) / 10 : 0;
    this.totalOpenIssues = open;
    this.calculateCategoryCounts();
  }

  // V2 calculateCategoryCounts, over the scoped set + per-category status breakdown.
  private calculateCategoryCounts(): void {
    const build = (name: string, list: any[]) => {
      const profileIds = [...new Set(list.map(i => i['clientid']).filter((id: string) => id))] as string[];
      let o = 0, p = 0, r = 0;
      list.forEach(t => { const l = this.ticketLabel(t); if (l === 'open') { o++; } else if (l === 'inProgress') { p++; } else { r++; } });
      return { category: name, count: list.length, open: o, inProgress: p, resolved: r, profileIds };
    };
    this.categoryCounts = [];
    this.issueCategories.forEach((cat: any) => {
      const name = cat.category;
      this.categoryCounts.push(build(name, this.clientIssues.filter(i => i['category'] === name)));
    });
    const categorized = this.issueCategories.map((c: any) => c.category);
    const uncategorized = this.clientIssues.filter(i => !categorized.includes(i['category']));
    if (uncategorized.length > 0) { this.categoryCounts.push(build('Uncategorized', uncategorized)); }
  }

  // ==========================================================================
  // Manual attendance marking — writes `arena e-ticket log` docs in the QR-scanner
  // shape (docid/product/logdate/profileid/eventref/eticketref).
  //
  // OPERATOR RULE (2026-07-27): a manual mark REQUIRES an active arena e-ticket,
  // so `eticketref` and `product` are never null. No ticket → no write at all
  // (the old bare-log fallback is gone). The operator multi-selects from the
  // ticket's `producteligible`; ONE doc is written per selected product, with an
  // auto-generated id — repeat marks are allowed to create additional docs
  // (the attendance reader dedupes by calendar date, so per-day counts are safe).
  // ==========================================================================

  /** The participant's ACTIVE e-ticket for the selected event, or null. Fetched
   *  fresh at click time (authoritative) rather than read from the in-memory
   *  `arenaETicketByProfile` map. `active == true` mirrors the QR scanner, which
   *  refuses an inactive ticket. */
  async fetchActiveETicket(profileId: string): Promise<{ id: string; data: any } | null> {
    if (!this.selectedEvent) { throw new Error('NO_EVENT'); }
    const snap = await getDocs(query(
      collection(this.firestoreDefault, 'arena e-ticket'),
      where('eventref', '==', this.selectedEvent.docref),
      where('profileid', '==', profileId),
      where('active', '==', true)
    ));
    if (snap.empty) {
      console.log('[v3][attendance] no active e-ticket for', profileId);
      return null;
    }
    // The approve flow upserts one ticket per participant per event; if more than
    // one somehow exists, use the first and surface it rather than failing.
    if (snap.docs.length > 1) {
      console.warn('[v3][attendance] multiple active e-tickets for', profileId, '— using the first of', snap.docs.length);
    }
    const d = snap.docs[0];
    return { id: d.id, data: { docid: d.id, ...d.data() } };
  }

  /** Noon local on a 'yyyy-mm-dd' day. recomputeAttendanceDays buckets a log by the
   *  LOCAL calendar date of `logdate`, so a backdated mark has to land safely inside
   *  that day whatever the offset — midnight can slide into the neighbouring day
   *  across a timezone or DST boundary, noon cannot. */
  private noonOn(date: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  /** One `arena e-ticket log` doc per selected product. Ids are pre-generated so
   *  `docid` can carry the real id in the same single write.
   *
   *  `onDate` ('yyyy-mm-dd') backdates the mark — the operator marking from a PAST
   *  day's Unattended list means "this person was here that day", and stamping now
   *  would credit today instead, leaving that day's count untouched. Omitted for
   *  today's lists so the stamp stays the real click time (the Arena Followup
   *  irregular-arrival cutoff reads the time of day, not just the date). */
  async markAttendanceForProducts(profileId: string, eticketDocId: string, productIds: string[], onDate?: string): Promise<void> {
    if (!this.selectedEvent) { throw new Error('NO_EVENT'); }
    if (!eticketDocId) { throw new Error('NO_ETICKET'); }
    if (!productIds.length) { throw new Error('NO_PRODUCT'); }
    const col = collection(this.firestoreDefault, 'arena e-ticket log');
    const eticketref = doc(this.firestoreDefault, 'arena e-ticket', eticketDocId);
    // client now (avoids the pending serverTimestamp null the attendance read can't handle)
    const logdate = onDate ? Timestamp.fromDate(this.noonOn(onDate)) : Timestamp.now();
    await Promise.all(productIds.map(productId => {
      const id = doc(col).id;                     // auto id, known before the write
      return setDoc(doc(col, id), {
        docid: id,
        product: doc(this.firestoreDefault, 'products', productId),
        logdate,
        profileid: profileId,
        eventref: this.selectedEvent!.docref,
        eticketref,
        markedmanually: true,                     // audit flag — distinguishes manual marks from QR scans
      });
    }));
    console.log('[v3][attendance] manual mark:', profileId, '| eticket:', eticketDocId,
      '| products:', productIds, '| credited to:', onDate || 'today');
  }

  // ==========================================================================
  // Arena Calling — event_caller_log (read subscription + upsert write)
  // ==========================================================================
  // dayKey ('yyyy-mm-dd') → normalized start-of-day Timestamp (app timezone).
  private dayKeyToTimestamp(dayKey: string): Timestamp {
    const [y, m, d] = dayKey.split('-').map(Number);
    return Timestamp.fromDate(new Date(y, m - 1, d, 0, 0, 0, 0));
  }
  // `day` Timestamp → dayKey ('yyyy-mm-dd'), matching dayWiseAttendance keys.
  private dayTimestampToKey(day: any): string {
    const dt = day?.toDate ? day.toDate() : new Date(day);
    return dt.toLocaleDateString('en-CA');
  }

  // Real-time, dedup-tolerant read: latest updateAt per (profileid, dayKey).
  private subscribeToCallLog(): void {
    if (!this.selectedEvent) return;
    if (this.callLogSub) { this.callLogSub.unsubscribe(); this.callLogSub = null; }
    this.callLogSub = collectionData(query(
      collection(this.firestoreDefault, 'event_caller_log'), where('eventref', '==', this.selectedEvent.docref)
    ), { idField: 'id' }).subscribe({
      next: (docs: any[]) => {
        const map: LiveEventDataService['callLogMap'] = {};
        docs.forEach((d: any) => {
          if (!d['profileid'] || !d['day']) { return; }
          const dayKey = this.dayTimestampToKey(d['day']);
          const key = `${d['profileid']}|${dayKey}`;
          const upd = d['updateAt']?.toMillis ? d['updateAt'].toMillis() : 0;
          const prev = map[key];
          if (!prev || upd >= prev.upd) {
            map[key] = { id: d['id'], profileId: d['profileid'], dayKey, status: d['status'] || 'pending', calledAt: d['calledAt'] || null, callerId: d['callerId'] || null, upd };
          }
        });
        this.callLogMap = map;
        console.log('[v3][calls] event_caller_log docs:', docs.length, '| deduped entries:', Object.keys(map).length);
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to event_caller_log:', error)
    });
  }

  // Upsert-by-query: one record per (participant, normalized day); latest wins.
  // The ONLY write in v3. calledAt = exact marking time; updateAt = server time.
  async setCallOutcome(profileId: string, dayKey: string, status: string): Promise<void> {
    if (!this.selectedEvent) { return; }
    const dayTs = this.dayKeyToTimestamp(dayKey);
    const calledAt = Timestamp.now();
    const callerId = this.loggedInProfileId || null;
    const col = collection(this.firestoreDefault, 'event_caller_log');
    const existing = await getDocs(query(col,
      where('eventref', '==', this.selectedEvent.docref),
      where('profileid', '==', profileId),
      where('day', '==', dayTs),
      limit(1)
    ));
    if (!existing.empty) {
      await updateDoc(doc(this.firestoreDefault, 'event_caller_log', existing.docs[0].id), { status, calledAt, callerId, updateAt: serverTimestamp() });
    } else {
      await addDoc(col, { eventref: this.selectedEvent.docref, profileid: profileId, day: dayTs, status, calledAt, callerId, updateAt: serverTimestamp() });
    }
  }

  // ==========================================================================
  // ZONES — live occupancy (READ-ONLY). Zone defs + cohorts + staff names from
  // event-zone-management (ZM); allocations + no-zone from V2 (subscribeToZones /
  // calculateNoZoneParticipants). No writes — config/toggle stay in ZM.
  // ==========================================================================

  // ZM eventZoneList — "event zones" scoped to this event; sorted by zonename.
  private subscribeToEventZones(): void {
    if (!this.selectedEvent) return;
    if (this.eventZonesSub) { this.eventZonesSub.unsubscribe(); this.eventZonesSub = null; }
    this.eventZoneList = [];
    this.mapEventZoneData = {};
    this.eventZonesSub = collectionData(query(
      collection(this.firestoreDefault, 'event zones'), where('eventref', '==', this.selectedEvent.docref)
    ), { idField: 'docid' }).subscribe({
      next: (data: any[]) => {
        this.eventZoneList = [...data].sort((a, b) => (a['zonename'] || '').localeCompare(b['zonename'] || ''));
        this.mapEventZoneData = {};
        data.forEach((zone: any) => { this.mapEventZoneData[zone['docid']] = zone; });
        console.log('[v3][zones] event zones:', data.length,
          '| open:', this.eventZoneList.filter(z => z['status'] === 'open').length);
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to event zones:', error)
    });
  }

  // ZM cohort block — "big cohorts" scoped to this event; docid→data + members.
  private subscribeToBigCohorts(): void {
    if (!this.selectedEvent) return;
    if (this.bigCohortsSub) { this.bigCohortsSub.unsubscribe(); this.bigCohortsSub = null; }
    this.mapCohortsData = {};
    this.mapCohortParticipants = {};
    this.bigCohortsSub = collectionData(query(
      collection(this.firestoreDefault, 'big cohorts'), where('eventref', '==', this.selectedEvent.docref)
    ), { idField: 'docid' }).subscribe({
      next: (data: any[]) => {
        this.mapCohortsData = {};
        this.mapCohortParticipants = {};
        data.forEach((cohort: any) => {
          this.mapCohortsData[cohort['docid']] = cohort;
          this.mapCohortParticipants[cohort['docid']] = cohort['participantidlist'] || [];
        });
        console.log('[v3][zones] big cohorts:', data.length);
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to big cohorts:', error)
    });
  }

  // V2 subscribeToZones — "event participant zones"; EXTENDED to also capture
  // selectedzone + eligiliblecohorts (both read by ZM) for the occupancy view.
  private subscribeToParticipantZones(): void {
    if (!this.selectedEvent) return;
    if (this.participantZonesSub) { this.participantZonesSub.unsubscribe(); this.participantZonesSub = null; }
    this.zoneAllocationMap = {};
    this.zoneParticipantIds = new Set();
    this.participantZonesSub = collectionData(query(
      collection(this.firestoreDefault, 'event participant zones'), where('eventref', '==', this.selectedEvent.docref)
    )).subscribe({
      next: (docs: any[]) => {
        const alloc: LiveEventDataService['zoneAllocationMap'] = {};
        const ids = new Set<string>();
        docs.forEach((zone: any) => {
          const pid = zone['profileid'];
          if (!pid) { return; }
          ids.add(pid);   // V2: any allocation → "in a zone"
          alloc[pid] = { selectedzone: zone['selectedzone'] || '', eligiliblecohorts: zone['eligiliblecohorts'] || zone['eligiblecohorts'] || [] };
        });
        this.zoneAllocationMap = alloc;
        this.zoneParticipantIds = ids;
        this.calculateNoZoneParticipants();
        console.log('[v3][zones] participant-zone allocations:', docs.length,
          '| allocated profiles:', ids.size, '| no-zone:', this.noZoneCount);
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to participant zones:', error)
    });
  }

  // V2 calculateNoZoneParticipants — registered universe minus allocated.
  private calculateNoZoneParticipants(): void {
    this.noZoneProfileIds = this.eventParticipantProfileIds.filter(id => !this.zoneParticipantIds.has(id));
    this.noZoneCount = this.noZoneProfileIds.length;
  }

  // Earliest scan-in TODAY for a participant (from the already-subscribed
  // mapAttendence), formatted 'HH:MM' (app timezone). mapAttendence is
  // date-deduped, so in practice this is today's single kept scan record.
  firstScanTimeToday(profileId: string): string {
    const records = this.mapAttendence[profileId] || [];
    const todayStr = new Date().toLocaleDateString('en-CA');
    let earliest: Date | null = null;
    records.forEach(r => {
      const ld = r['logdate']?.toDate ? r['logdate'].toDate() : new Date(r['logdate']);
      if (ld.toLocaleDateString('en-CA') === todayStr && (!earliest || ld < earliest)) { earliest = ld; }
    });
    if (!earliest) { return ''; }
    return (earliest as Date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  // ---- procedure tracking: day + scope filters (FT setFilter/participantFilter)
  /** Day filter — narrows the livechangework createdon window (FT updateFilterDateRange). */
  setProcedureDay(dayKey: string): void {
    this.procDayFilter = dayKey;
    if (!this.selectedEvent) return;
    if (dayKey === 'all') {
      const start = this.selectedEvent['start_date']?.toDate ? this.selectedEvent['start_date'].toDate() : new Date(this.selectedEvent['start_date']);
      const end = this.selectedEvent['end_date']?.toDate ? this.selectedEvent['end_date'].toDate() : new Date(this.selectedEvent['end_date']);
      this.filterStartDate = new Date(start); this.filterStartDate.setHours(0, 0, 0, 0);
      this.filterEndDate = new Date(end); this.filterEndDate.setHours(23, 59, 59, 999);
    } else {
      const [y, m, dd] = dayKey.split('-').map(Number);
      this.filterStartDate = new Date(y, m - 1, dd, 0, 0, 0, 0);
      this.filterEndDate = new Date(y, m - 1, dd, 23, 59, 59, 999);
    }
    // Only livechangework depends on the day window; ATC opportunities use the
    // queue range and are unaffected (FT semantics).
    if (this.lcwSub) { this.lcwSub.unsubscribe(); this.lcwSub = null; }
    if (this.lcwLiveSub) { this.lcwLiveSub.unsubscribe(); this.lcwLiveSub = null; }
    this.subscribeToLiveChangeWork();
    this.subscribeToLiveChangeworkLive();
    this.changed$.next();
  }

  /** Scope filter — All vs First timers (FT participantFilter + getFilteredDoerIds). */
  setProcedureScope(scope: 'all' | 'firstTimers'): void {
    this.participantFilter = scope;
    this.calculateProcedureData();
    this.changed$.next();
  }

  /** First-timer set comes from the component's seam 3; kept in sync so scope=First
   *  timers resolves against the SAME registered universe. Empty while seam unfilled. */
  setFirstTimerIds(ids: string[]): void {
    const changed = ids.length !== this.firstTimerProfileIds.length || ids.some(id => !this.firstTimerProfileIds.includes(id));
    this.firstTimerProfileIds = ids;
    if (changed && this.participantFilter === 'firstTimers') { this.calculateProcedureData(); this.changed$.next(); }
  }

  // ---- queue variation → atcModels (FT loadQueuevariation, debug removed) -----
  private async loadQueuevariation(): Promise<void> {
    if (this.selectedQueues.length === 0) return;
    this.atcModels = [];
    try {
      const variationPromises = this.selectedQueueRefs.map(queueRef =>
        getDocs(query(collection(this.firestoreDefault, 'queue variation'), where('queueref', '==', queueRef))));
      const variationSnapshots = await Promise.all(variationPromises);
      const models: string[] = [];
      variationSnapshots.forEach(vs => vs.docs.forEach(d => models.push(d.data()['atcmodel'])));
      this.atcModels = [...new Set(models)];
      console.log('[v3][atcModels] from', variationSnapshots.reduce((n, s) => n + s.docs.length, 0),
        'queue-variation docs →', this.atcModels);
      this.subscribeToArenaOverview();
    } catch (error) {
      console.error('Error loading queue variation:', error);
    }
  }

  // ---- queue date range (FT updateQueueDateRange) ----------------------------
  private updateQueueDateRange(): void {
    if (this.selectedQueues.length === 0) { this.queueRangeStartDate = null; this.queueRangeEndDate = null; return; }
    let oldestStart: Date | null = null; let newestEnd: Date | null = null;
    this.selectedQueues.forEach(queue => {
      const startDate = queue['queuestartdate']?.toDate ? queue['queuestartdate'].toDate() : new Date(queue['queuestartdate']);
      const endDate = queue['queueenddate']?.toDate ? queue['queueenddate'].toDate() : new Date(queue['queueenddate']);
      if (!oldestStart || startDate < oldestStart) { oldestStart = new Date(startDate); }
      if (!newestEnd || endDate > newestEnd) { newestEnd = new Date(endDate); }
    });
    if (oldestStart) (oldestStart as Date).setHours(0, 0, 0, 0);
    if (newestEnd) (newestEnd as Date).setHours(23, 59, 59, 999);
    this.queueRangeStartDate = oldestStart;
    this.queueRangeEndDate = newestEnd;
    console.log('[v3][queueRange]', this.queueRangeStartDate, '→', this.queueRangeEndDate);
  }

  // ==========================================================================
  // ATC / LIVECHANGEWORK subscriptions (FT subscribeToArenaOverview)
  // ==========================================================================
  private subscribeToArenaOverview(): void {
    this.liveChangeWorkData = [];
    this.liveChangeworkLiveData = [];
    // atcModels no longer gates ATC — atc_alpha/atc_to_validate now scope by queueid.
    if (this.selectedQueues.length === 0 || !this.selectedEvent) return;
    if (!this.filterStartDate || !this.filterEndDate) return;
    this.unsubscribeQueuePipeline();
    this.subscribeToAtcAlpha();
    this.subscribeToAtcToValidate();
    this.subscribeToDraftAtc();
    this.subscribeToLiveChangeWork();
    this.subscribeToLiveChangeworkLive();
  }

  // V2 subscribeToDraftAtc — temporary_ATC drafts (delete==false) whose transcript[0]
  // has an adjustment and whose lastupdated is within the queue range; scoped to the
  // registered universe, counted as UNIQUE participants. Read from firestore-atc.
  private subscribeToDraftAtc(): void {
    if (this.draftAtcSub) { this.draftAtcSub.unsubscribe(); this.draftAtcSub = null; }
    if (!this.selectedEvent || !this.queueRangeStartDate) { this.draftAtcProfileIds = []; this.draftAtcCount = 0; return; }
    this.draftAtcSub = collectionData(query(
      collection(this.firestoreATC, 'temporary_ATC'), where('delete', '==', false)
    )).subscribe({
      next: (docs: any[]) => {
        const ids: string[] = [];
        docs.forEach((d: any) => {
          const transcript = d['transcript'] || [];
          if (transcript.length > 0 && ![null, undefined, ''].includes(transcript[0]['adjustment'])) {
            if (this.isDateInQueueRange(d['lastupdated'])) {
              const profileId = d['profileid'] || '';
              if (profileId && this.eventParticipantProfileIds.includes(profileId)) {
                const lastUpdated = d['lastupdated']?.toDate ? d['lastupdated'].toDate() : new Date(d['lastupdated']);
                if (this.queueRangeStartDate && lastUpdated >= this.queueRangeStartDate && !ids.includes(profileId)) { ids.push(profileId); }
              }
            }
          }
        });
        this.draftAtcProfileIds = ids;
        this.draftAtcCount = ids.length;
        console.log('[v3][atc] temporary_ATC draft docs:', docs.length, '| draft participants (event):', ids.length);
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to temporary_ATC drafts:', error)
    });
  }

  // V2 isDateInQueueRange
  private isDateInQueueRange(prescriptionDate: any): boolean {
    if (!this.queueRangeStartDate || !this.queueRangeEndDate || !prescriptionDate) return false;
    const prescDate = prescriptionDate?.toDate ? prescriptionDate.toDate() : new Date(prescriptionDate);
    return prescDate >= this.queueRangeStartDate && prescDate <= this.queueRangeEndDate;
  }

  // Selected queue doc ids (queue generation ids) — the value stamped on ATC docs
  // as `queueid` (prescribe-atc). Basis for scoping ATC by the SELECTED QUEUE(S).
  private selectedQueueIds(): string[] {
    return this.selectedQueues.map(q => q.docref?.id).filter((id): id is string => !!id);
  }

  // atc_to_validate half → atcToValidateProfileIds.
  // Query from V2 (product in atcModels). Unvalidated = any atc_to_validate doc
  // whose status is NOT 'validated' (operator-confirmed): the collection holds many
  // statuses, and only 'validated' ones are done — everything else is still pending.
  private subscribeToAtcToValidate(): void {
    if (this.atcToValidateSub) { this.atcToValidateSub.unsubscribe(); this.atcToValidateSub = null; }
    const queueIds = this.selectedQueueIds();
    if (queueIds.length === 0) { this.atcToValidateProfileIds = []; this.recomputeAtcBuckets(); return; }
    // CHANGED (operator): scope by the SELECTED QUEUE ID(s) — atc_to_validate.queueid
    // — instead of product-in-atcModels + queue date range.
    this.atcToValidateSub = collectionData(query(
      collection(this.firestoreATC, 'atc_to_validate'), where('queueid', 'in', queueIds)
    )).subscribe({
      next: (docs: any[]) => {
        const ids: string[] = [];
        let pendingDocs = 0;
        docs.forEach((d: any) => {
          // view-prescribed-atc rule: a prescription is UNVALIDATED iff status ===
          // 'atc given' (every other status is validated). Also mirror its doc
          // filters: isdelete==false and type=='online'.
          if (d['status'] === 'atc given' && d['isdelete'] !== true && d['type'] === 'online') {
            pendingDocs++;
            const profileId = d['profileid'] || '';
            if (profileId && this.eventParticipantProfileIds.includes(profileId) && !ids.includes(profileId)) { ids.push(profileId); }
          }
        });
        this.atcToValidateProfileIds = ids;
        console.log('[v3][atc] atc_to_validate docs:', docs.length,
          "| status=='atc given' (unvalidated) & online:", pendingDocs,
          '| unvalidated profiles (event-participant):', ids.length);
        this.recomputeAtcBuckets();
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to atc_to_validate:', error)
    });
  }

  // Partition event participants into full / partial / unvalidated / none.
  // "completed" = has an atc_alpha doc in scope (Object.keys(profileAtcMap),
  // built in subscribeToAtcAlpha — V2's atcCompleted basis, no status filter).
  private recomputeAtcBuckets(): void {
    const completed = new Set(Object.keys(this.profileAtcMap));
    const toValidate = new Set(this.atcToValidateProfileIds);
    const full: string[] = []; const partial: string[] = []; const unvalidated: string[] = []; const none: string[] = [];
    this.eventParticipantProfileIds.forEach(id => {
      const c = completed.has(id); const v = toValidate.has(id);
      if (c && v) { partial.push(id); }
      else if (c) { full.push(id); }
      else if (v) { unvalidated.push(id); }
      else { none.push(id); }
    });
    this.atcBuckets = {
      full: full.length, partial: partial.length, unvalidated: unvalidated.length, none: none.length,
      fullIds: full, partialIds: partial, unvalidatedIds: unvalidated, noneIds: none
    };
    const sum = full.length + partial.length + unvalidated.length + none.length;
    console.log('[v3][atc buckets] full:', full.length, '| partial:', partial.length,
      '| unvalidated:', unvalidated.length, '| none:', none.length,
      '| sum:', sum, '| eventParticipants:', this.eventParticipantProfileIds.length,
      '(sum should equal eventParticipants) | completed(atc_alpha) profiles:', Object.keys(this.profileAtcMap).length,
      '| toValidate profiles:', this.atcToValidateProfileIds.length);
  }

  // FT subscribeToAtcAlpha (adjustments sums added from V1, applied to the same docs)
  private subscribeToAtcAlpha(): void {
    const queueIds = this.selectedQueueIds();
    if (queueIds.length === 0) { return; }
    // CHANGED (operator): scope ATC by the SELECTED QUEUE ID(s) — atc_alpha.queueid —
    // instead of product-in-atcModels + queue date range. queueid is stamped on
    // submit (prescribe-atc) and is the read pattern eit-education-atc uses. isdelete
    // and latest-doc-per-profile are applied client-side to keep the query index-light.
    const atcQuery = query(collection(this.firestoreATC, 'atc_alpha'),
      where('queueid', 'in', queueIds));
    this.atcSub = collectionData(atcQuery).subscribe({
      next: (docs: any[]) => {
        this.atcDocs = docs.filter((d: any) => d['isdelete'] !== true);
        this.profileAtcMap = {};
        this.atcDocs.forEach((d: any) => {
          const profileId: string = d['profileid'] || '';
          if (!profileId || !this.eventParticipantProfileIds.includes(profileId)) return;
          const prescriptionDate = d['prescription_date']?.toDate ? d['prescription_date'].toDate() : new Date(d['prescription_date']);
          if (!this.profileAtcMap[profileId] || prescriptionDate > this.profileAtcMap[profileId]._date) { this.profileAtcMap[profileId] = { ...d, _date: prescriptionDate }; }
        });
        this.beneficierProfileIds = [];
        Object.keys(this.profileAtcMap).forEach(profileId => {
          const atcDoc = this.profileAtcMap[profileId];
          const procedurePendingList: string[] = atcDoc['procedurependinglist'] || [];
          const procedureCompletedList: string[] = atcDoc['procedurecompletedlist'] || [];
          if (procedurePendingList.length > 0 || procedureCompletedList.length > 0) { this.beneficierProfileIds.push(profileId); }
        });
        this.beneficierTotal = this.beneficierProfileIds.length;
        this.computeAdjustmentTotals();
        console.log('[v3][atc] atc_alpha docs:', docs.length,
          '| completed profiles (event-participant):', Object.keys(this.profileAtcMap).length,
          '| adj total/done/pending:', this.totalAdjustmentCount, this.totalAdjustmentCompletedCount, this.totalAdjustmentPendingCount);
        this.recomputeAtcBuckets();
        this.calculateProcedureData();
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to atc_alpha:', error)
    });
  }

  // Adjustments — V1 scalar-field sums (lines 723-744), over atcDocs scoped to
  // this event's participants. USER TO CONFIRM (C-12): same formula as V1, but
  // applied to FT's atc_alpha doc set (product-in-atcModels + queue range) rather
  // than V1's own query window (prescription_date last 4 months). Numbers may differ.
  private computeAdjustmentTotals(): void {
    this.totalAdjustmentCount = 0;
    this.totalAdjustmentCompletedCount = 0;
    this.totalAdjustmentPendingCount = 0;
    this.participantAtc = {};
    const num = (v: any) => (v && !Number.isNaN(v)) ? Number(v) : 0;
    this.atcDocs.forEach((atcData: any) => {
      const pid = atcData['profileid'];
      if (!this.eventParticipantProfileIds.includes(pid)) return;
      const total = num(atcData['totaladjustment']);
      const completed = num(atcData['totaladjustmentcompleted']);
      const pending = num(atcData['totaladjustmentpending']);
      this.totalAdjustmentCount += total;
      this.totalAdjustmentCompletedCount += completed;
      this.totalAdjustmentPendingCount += pending;
      // per-participant aggregate (V1 scalar-field sums across this person's docs)
      const agg = this.participantAtc[pid] || { adjTotal: 0, adjDone: 0, adjPending: 0, procTotal: 0, procDone: 0, procPending: 0 };
      agg.adjTotal += total; agg.adjDone += completed; agg.adjPending += pending;
      agg.procTotal += num(atcData['totalprocedure']);
      agg.procDone += num(atcData['totalprocedurecompleted']);
      agg.procPending += num(atcData['totalprocedurepending']);
      this.participantAtc[pid] = agg;
    });
  }

  // FT subscribeToLiveChangeWork (completed)
  private subscribeToLiveChangeWork(): void {
    const start = this.filterStartDate || this.queueRangeStartDate;
    const end = this.filterEndDate || this.queueRangeEndDate;
    if (!start || !end || !this.selectedEvent) return;
    const q = query(collection(this.firestoreDefault, 'livechangework'),
      where('eventref', '==', this.selectedEvent.docref),
      where('createdon', '>=', start),
      where('createdon', '<=', end),
      where('procedurestatus', '==', 'completed'));
    this.lcwSub = collectionData(q, { idField: 'id' }).subscribe({
      next: (docs: any[]) => {
        this.liveChangeWorkData = docs;
        console.log('[v3][lcw completed] docs:', docs.length);
        this.calculateProcedureData();
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to livechangework:', error)
    });
  }

  // FT subscribeToLiveChangeworkLive (live)
  private subscribeToLiveChangeworkLive(): void {
    const start = this.filterStartDate || this.queueRangeStartDate;
    const end = this.filterEndDate || this.queueRangeEndDate;
    if (!start || !end || !this.selectedEvent) return;
    const q = query(collection(this.firestoreDefault, 'livechangework'),
      where('eventref', '==', this.selectedEvent.docref),
      where('createdon', '>=', start),
      where('createdon', '<=', end),
      where('procedurestatus', '==', 'live'));
    this.lcwLiveSub = collectionData(q, { idField: 'id' }).subscribe({
      next: (docs: any[]) => {
        this.liveChangeworkLiveData = docs;
        console.log('[v3][lcw live] docs:', docs.length);
        this.calculateProcedureData();
        this.changed$.next();
      },
      error: (error) => console.error('Error subscribing to livechangework live:', error)
    });
  }

  private getFilteredDoerIds(): string[] {
    if (this.participantFilter === 'all') return this.eventParticipantProfileIds;
    return this.eventParticipantProfileIds.filter(id => this.firstTimerProfileIds.includes(id));
  }
  private getFilteredBeneficierIds(): string[] {
    if (this.participantFilter === 'all') return this.beneficierProfileIds;
    return this.beneficierProfileIds.filter(id => this.firstTimerProfileIds.includes(id));
  }

  // ==========================================================================
  // FT calculateProcedureData — lifted verbatim (TEMP DEBUG blocks removed,
  // cdr.detectChanges → changed$.next). Do not alter the derivation.
  // ==========================================================================
  private calculateProcedureData(): void {
    if (!this.participantMetadataMap || Object.keys(this.participantMetadataMap).length === 0) return;
    if (!this.eventParticipantProfileIds.length) return;
    const tempMap = { ...this.mapProcedureData };
    const filteredDoerIds = this.getFilteredDoerIds();
    const filteredBeneficierIds = this.getFilteredBeneficierIds();
    this.doerTotal = filteredDoerIds.length;
    this.beneficierTotal = filteredBeneficierIds.length;

    const beneficierPendingMap: { [procedureId: string]: Set<string> } = {};
    const beneficierCompletedFromAtcMap: { [procedureId: string]: Set<string> } = {};
    const totalOpportunitiesMap: { [procedureId: string]: string[] } = {};
    const totalCompletedMap: { [procedureId: string]: string[] } = {};

    const eventSet = new Set(this.eventParticipantProfileIds);
    const firstTimerSet = new Set(this.firstTimerProfileIds);

    this.atcDocs.forEach((atc: any) => {
      const profileId = atc.profileid;
      if (!profileId) return;
      if (!eventSet.has(profileId)) return;
      if (this.participantFilter === 'firstTimers' && !firstTimerSet.has(profileId)) return;
      const pending = atc.procedurependinglist || [];
      const completed = atc.procedurecompletedlist || [];
      pending.forEach((procId: string) => {
        if (!tempMap[procId]) return;
        if (!totalOpportunitiesMap[procId]) totalOpportunitiesMap[procId] = [];
        totalOpportunitiesMap[procId].push(profileId);
        if (!beneficierPendingMap[procId]) { beneficierPendingMap[procId] = new Set<string>(); }
        beneficierPendingMap[procId].add(profileId);
      });
      completed.forEach((procId: string) => {
        if (!tempMap[procId]) return;
        if (!totalCompletedMap[procId]) totalCompletedMap[procId] = new Array();
        if (!beneficierCompletedFromAtcMap[procId]) { beneficierCompletedFromAtcMap[procId] = new Set<string>(); }
        beneficierCompletedFromAtcMap[procId].add(profileId);
        totalCompletedMap[procId].push(profileId);
      });
    });

    Object.keys(tempMap).forEach(procId => {
      tempMap[procId].doerCompleted = { count: 0, data: [] };
      tempMap[procId].doerNotStarted = { count: 0, data: [] };
      tempMap[procId].beneficierCompleted = { count: 0, data: [] };
      tempMap[procId].beneficierNotStarted = { count: 0, data: [] };
      tempMap[procId].liveChangework = { count: 0, data: [] };
      const oppArr = totalOpportunitiesMap[procId] || [];
      const compArr = totalCompletedMap[procId] || [];
      const oppFrequency: any = {};
      oppArr.forEach(id => { oppFrequency[id] = (oppFrequency[id] || 0) + 1; });
      const oppDisplay = Object.keys(oppFrequency).map(id => ({ profileId: String(id), count: oppFrequency[id] }));
      tempMap[procId].totalOpportunities = { count: oppArr.length, data: oppDisplay };
      const compFrequency: any = {};
      compArr.forEach(id => { compFrequency[id] = (compFrequency[id] || 0) + 1; });
      const compDisplay = Object.keys(compFrequency).map(id => ({ profileId: String(id), count: compFrequency[id] }));
      tempMap[procId].totalCompleted = { count: compArr.length, data: compDisplay };
    });

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
      const beneficiaryName = this.participantMetadataMap?.[beneficiaryId]?.['name'] ?? lcw['beneficiaryname'] ?? 'Unknown';
      if (doerId && filteredDoerIds.includes(doerId)) {
        if (!doerCompletedMap[procedureId]) { doerCompletedMap[procedureId] = new Map<string, any>(); }
        if (!doerCompletedMap[procedureId].has(doerId)) {
          doerCompletedMap[procedureId].set(doerId, { doerId, doerName, beneficiaryId, beneficiaryName, procedureName, hours, hourType, sharedNotes, displayText: `${doerName} - ${beneficiaryName} (${procedureName})` });
        }
      }
      if (beneficiaryId && filteredBeneficierIds.includes(beneficiaryId)) {
        if (!beneficierCompletedMap[procedureId]) { beneficierCompletedMap[procedureId] = new Map<string, any>(); }
        if (!beneficierCompletedMap[procedureId].has(beneficiaryId)) {
          beneficierCompletedMap[procedureId].set(beneficiaryId, { doerId, doerName, beneficiaryId, beneficiaryName, procedureName, hours, hourType, sharedNotes, displayText: `${doerName} - ${beneficiaryName} (${procedureName})` });
        }
      }
    });

    const liveChangeworkMap: { [procedureId: string]: any[] } = {};
    this.liveChangeworkLiveData.forEach((lcw: any) => {
      const procedureId: string = lcw['procedureid'] || '';
      const doerId: string = lcw['doerid'] || '';
      const beneficiaryId: string = lcw['beneficiaryid'] || '';
      const procedureName: string = lcw['procedurename'] || this.mapProcedureNames[procedureId] || '';
      if (!procedureId || !tempMap[procedureId]) return;
      const doerInFilter = doerId && filteredDoerIds.includes(doerId);
      const beneficiaryInFilter = beneficiaryId && filteredBeneficierIds.includes(beneficiaryId);
      if (doerInFilter || beneficiaryInFilter) {
        if (!liveChangeworkMap[procedureId]) { liveChangeworkMap[procedureId] = []; }
        const doerName = this.participantMetadataMap[doerId]?.['name'] || 'Unknown';
        const beneficiaryName = this.participantMetadataMap[beneficiaryId]?.['name'] || 'Unknown';
        liveChangeworkMap[procedureId].push({ doerId, doerName, beneficiaryId, beneficiaryName, procedureName, displayText: `${doerName} - ${beneficiaryName} - (${procedureName})` });
      }
    });

    let totalLiveCount = 0;
    Object.keys(tempMap).forEach(procedureId => {
      const doerCompletedData = doerCompletedMap[procedureId] || new Map<string, any>();
      tempMap[procedureId].doerCompleted.count = doerCompletedData.size;
      tempMap[procedureId].doerCompleted.data = Array.from(doerCompletedData.values());
      const doerCompletedIds = new Set(doerCompletedData.keys());
      const doerNotStartedArray = filteredDoerIds.filter(id => !doerCompletedIds.has(id));
      tempMap[procedureId].doerNotStarted.count = doerNotStartedArray.length;
      tempMap[procedureId].doerNotStarted.data = doerNotStartedArray;
      const beneficierCompletedData = beneficierCompletedMap[procedureId] || new Map<string, any>();
      tempMap[procedureId].beneficierCompleted.count = beneficierCompletedData.size;
      tempMap[procedureId].beneficierCompleted.data = Array.from(beneficierCompletedData.values());
      const pendingSet = beneficierPendingMap[procedureId] || new Set<string>();
      const completedFromLive = new Set(beneficierCompletedData.keys());
      const beneficierNotStartedArray = [...pendingSet].filter(id => !completedFromLive.has(id));
      tempMap[procedureId].beneficierNotStarted.count = beneficierNotStartedArray.length;
      tempMap[procedureId].beneficierNotStarted.data = beneficierNotStartedArray;
      const liveData = liveChangeworkMap[procedureId] || [];
      tempMap[procedureId].liveChangework.count = liveData.length;
      tempMap[procedureId].liveChangework.data = liveData;
      totalLiveCount += liveData.length;
    });

    this.liveChangeworkTotal = totalLiveCount;
    this.mapProcedureData = { ...tempMap };
    this.applySort();
    const pt = this.procTotals;
    console.log('[v3][procData] procedures:', this.sortedProcedureIds.length,
      '| opportunities:', pt.total, '| done:', pt.done, '| pending:', pt.pending,
      '| overall %:', this.overallProgressPct, '| live total:', this.liveChangeworkTotal,
      '| scope:', this.participantFilter);
  }

  // FT applySort (live desc, tie-break completion %)
  private applySort(): void {
    const ids = Object.keys(this.mapProcedureData);
    ids.sort((a, b) => {
      const live = this.mapProcedureData[b].liveChangework.count - this.mapProcedureData[a].liveChangework.count;
      if (live !== 0) { return live; }
      return this.completionPct(b) - this.completionPct(a);
    });
    this.sortedProcedureIds = ids;
  }

  // FT completionPct (execution-based denominator) — CONFIRMED % basis (C-2)
  completionPct(procedureId: string): number {
    const d = this.mapProcedureData[procedureId];
    if (!d) { return 0; }
    const numerator = d.totalCompleted.count;
    const denominator = d.totalOpportunities.count + d.totalCompleted.count;
    if (denominator === 0) { return 0; }
    return Math.min(100, Math.round((numerator / denominator) * 100));
  }

  // FT overallProgressPct (sum of numerators / sum of denominators)
  get overallProgressPct(): number {
    let numerator = 0; let denominator = 0;
    for (const id of this.sortedProcedureIds) {
      const d = this.mapProcedureData[id];
      if (!d) { continue; }
      numerator += d.totalCompleted.count;
      denominator += d.totalOpportunities.count + d.totalCompleted.count;
    }
    if (denominator === 0) { return 0; }
    return Math.min(100, Math.round((numerator / denominator) * 100));
  }

  // Aggregate procedure totals for the apBody bar (same numerator/denominator
  // basis as overallProgressPct: done = Σ completed, total = Σ(opp + completed)).
  get procTotals(): { total: number; done: number; pending: number } {
    let done = 0; let opp = 0;
    for (const id of this.sortedProcedureIds) {
      const d = this.mapProcedureData[id];
      if (!d) { continue; }
      done += d.totalCompleted.count;
      opp += d.totalOpportunities.count;
    }
    return { total: opp + done, done, pending: opp };
  }

  /** Flattened LIVE-now who/what list from FT's live pipeline (mapProcedureData).
   *  Both parties of each live changework are listed — the doer AND the beneficiary
   *  — each tagged with its role + procedure. */
  get liveChangeworkList(): { profileId: string; name: string; proc: string }[] {
    const out: { profileId: string; name: string; proc: string }[] = [];
    for (const id of Object.keys(this.mapProcedureData)) {
      const d = this.mapProcedureData[id];
      (d.liveChangework.data || []).forEach((row: any) => {
        const procName = row.procedureName || this.mapProcedureNames[id] || '';
        if (row.doerId) { out.push({ profileId: row.doerId, name: row.doerName, proc: `Doer · ${procName}` }); }
        if (row.beneficiaryId) { out.push({ profileId: row.beneficiaryId, name: row.beneficiaryName, proc: `Beneficiary · ${procName}` }); }
      });
    }
    return out;
  }

  // ==========================================================================
  // JOURNEYS (V2 calculateJourneyCounts) — universe = registered participants
  // ==========================================================================
  calculateJourneyCounts(): void {
    this.journeyCounts = [];
    const journeyMap: { [journeyId: string]: string[] } = {};
    const participantsWithJourney: string[] = [];
    const currentList = this.eventParticipantProfileIds;

    currentList.forEach(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      const activeJourney = metadata?.activejourney;
      if (activeJourney && this.mapJourneyData[activeJourney]) {
        if (!journeyMap[activeJourney]) { journeyMap[activeJourney] = []; }
        journeyMap[activeJourney].push(profileId);
        participantsWithJourney.push(profileId);
      }
    });

    Object.keys(this.mapJourneyData).forEach(journeyId => {
      const journeyData = this.mapJourneyData[journeyId];
      const profileIds = journeyMap[journeyId] || [];
      this.journeyCounts.push({
        journeyId,
        journeyName: journeyData['journey'] || journeyData['name'] || 'Unknown Journey',
        count: profileIds.length,
        profileIds
      });
    });

    this.journeyCounts.sort((a, b) => b.count - a.count);
    this.totalJourneyParticipants = this.journeyCounts.reduce((sum, j) => sum + j.count, 0);
    console.log('[v3][journeyCounts] total-with-journey:', this.totalJourneyParticipants,
      '| of registered:', this.eventParticipantProfileIds.length,
      '|', this.journeyCounts.filter(j => j.count > 0).map(j => `${j.journeyName}:${j.count}`));
  }

  // V2 buildParticipantFromProfileId
  buildParticipantFromProfileId(profileId: string, isPresent: boolean): PanelParticipant {
    const metadata = this.participantMetadataMap[profileId] || {};
    const registered = this.registeredByProfileId[profileId];
    const isNotRegistered = !this.eventParticipantSet.has(profileId);
    return {
      docref: registered?.docref || profileId,
      profileid: profileId,
      name: metadata['name'] || this.registeredNames[profileId] || registered?.name || 'Unknown',
      email: metadata['email'] || registered?.email || '',
      phone: metadata['phone'] || registered?.phone || '',
      photo: metadata['photo'] || registered?.photo || '',
      activejourney: metadata['activejourney'] || registered?.activejourney || '',
      profiletags: metadata['profiletags'] || registered?.profiletags || [],
      isPresent, isSelected: false, isNotRegistered
    };
  }

  // ==========================================================================
  // Arena Followup — derivations over already-subscribed data (NO new query).
  // All scoped to the current universe (eventParticipantProfileIds).
  // ==========================================================================

  // V2 calculateIrregularParticipants — participants who scanned in AFTER the
  // cutoff time on the target day (late arrivals). targetDate defaults to today;
  // timeFilter default '09:00'. Scoped to the universe (eventParticipantProfileIds).
  irregularParticipantIds(targetDate: string, timeFilter: string): string[] {
    if (!this.selectedEvent || !targetDate) { return []; }
    const [fh, fm] = timeFilter.split(':').map(Number);
    const [y, m, dd] = targetDate.split('-').map(Number);
    const cutoff = new Date(y, m - 1, dd, fh || 0, fm || 0, 0, 0);
    return this.eventParticipantProfileIds.filter(profileId => {
      const records = this.mapAttendence[profileId] || [];
      return records.some(r => {
        const ld = r['logdate']?.toDate ? r['logdate'].toDate() : new Date(r['logdate']);
        return ld.toLocaleDateString('en-CA') === targetDate && ld >= cutoff;
      });
    });
  }

  // doer / beneficiary id sets over already-subscribed livechangework
  // (completed ∪ live — both Phase-1 subscriptions). "Throughout event" scope,
  // matching the prototype's Followup cards (no today/overall toggle there).
  private changeworkDoerBeneficiarySets(): { doers: Set<string>; beneficiaries: Set<string> } {
    const doers = new Set<string>(); const beneficiaries = new Set<string>();
    [...this.liveChangeWorkData, ...this.liveChangeworkLiveData].forEach((d: any) => {
      if (d['doerid']) { doers.add(d['doerid']); }
      if (d['beneficiaryid']) { beneficiaries.add(d['beneficiaryid']); }
    });
    return { doers, beneficiaries };
  }

  // V2 changeWorkOverview.notDoneOthers — registered not a doer in any changework.
  get notDoingCWIds(): string[] {
    const { doers } = this.changeworkDoerBeneficiarySets();
    return this.eventParticipantProfileIds.filter(id => !doers.has(id));
  }

  // V2 changeWorkOverview.notDoneSelf — registered not a beneficiary in any changework.
  get cwNotReceivedIds(): string[] {
    const { beneficiaries } = this.changeworkDoerBeneficiarySets();
    return this.eventParticipantProfileIds.filter(id => !beneficiaries.has(id));
  }

  // ==========================================================================
  // teardown
  // ==========================================================================
  private resetProcedureState(): void {
    this.atcDocs = [];
    this.profileAtcMap = {};
    this.atcToValidateProfileIds = [];
    this.atcBuckets = { full: 0, partial: 0, unvalidated: 0, none: 0, fullIds: [], partialIds: [], unvalidatedIds: [], noneIds: [] };
    this.draftAtcProfileIds = [];
    this.draftAtcCount = 0;
    this.liveChangeWorkData = [];
    this.liveChangeworkLiveData = [];
    this.liveChangeworkTotal = 0;
    this.totalAdjustmentCount = 0;
    this.totalAdjustmentCompletedCount = 0;
    this.totalAdjustmentPendingCount = 0;
    this.participantAtc = {};
    Object.keys(this.mapProcedureData).forEach(procId => {
      this.mapProcedureData[procId] = { totalCompleted: { count: 0, data: [] }, totalOpportunities: { count: 0, data: [] }, doerNotStarted: { count: 0, data: [] }, doerCompleted: { count: 0, data: [] }, beneficierNotStarted: { count: 0, data: [] }, beneficierCompleted: { count: 0, data: [] }, liveChangework: { count: 0, data: [] } };
    });
  }

  private unsubscribeQueuePipeline(): void {
    if (this.atcSub) { this.atcSub.unsubscribe(); this.atcSub = null; }
    if (this.atcToValidateSub) { this.atcToValidateSub.unsubscribe(); this.atcToValidateSub = null; }
    if (this.draftAtcSub) { this.draftAtcSub.unsubscribe(); this.draftAtcSub = null; }
    if (this.lcwSub) { this.lcwSub.unsubscribe(); this.lcwSub = null; }
    if (this.lcwLiveSub) { this.lcwLiveSub.unsubscribe(); this.lcwLiveSub = null; }
  }

  private unsubscribeEventPipeline(): void {
    this.unsubscribeQueuePipeline();
    if (this.attendanceSub) { this.attendanceSub.unsubscribe(); this.attendanceSub = null; }
    if (this.eTicketSub) { this.eTicketSub.unsubscribe(); this.eTicketSub = null; }
    if (this.videoAskSub) { this.videoAskSub.unsubscribe(); this.videoAskSub = null; }
    if (this.clientIssuesSub) { this.clientIssuesSub.unsubscribe(); this.clientIssuesSub = null; }
    if (this.callLogSub) { this.callLogSub.unsubscribe(); this.callLogSub = null; }
    this.unsubscribeZonePipeline();
  }

  private unsubscribeZonePipeline(): void {
    if (this.eventZonesSub) { this.eventZonesSub.unsubscribe(); this.eventZonesSub = null; }
    if (this.bigCohortsSub) { this.bigCohortsSub.unsubscribe(); this.bigCohortsSub = null; }
    if (this.participantZonesSub) { this.participantZonesSub.unsubscribe(); this.participantZonesSub = null; }
  }

  private pathOf(ref: any): string { return ref && ref.path ? ref.path : String(ref); }

  ngOnDestroy(): void {
    this.unsubscribeQueuePipeline();
    if (this.attendanceSub) { this.attendanceSub.unsubscribe(); this.attendanceSub = null; }
    if (this.eTicketSub) { this.eTicketSub.unsubscribe(); this.eTicketSub = null; }
    if (this.videoAskSub) { this.videoAskSub.unsubscribe(); this.videoAskSub = null; }
    if (this.clientIssuesSub) { this.clientIssuesSub.unsubscribe(); this.clientIssuesSub = null; }
    if (this.callLogSub) { this.callLogSub.unsubscribe(); this.callLogSub = null; }
    this.unsubscribeZonePipeline();
    if (this.eventSub) { this.eventSub.unsubscribe(); this.eventSub = null; }
    if (this.metadataSub) { this.metadataSub.unsubscribe(); this.metadataSub = null; }
    this.changed$.complete();
  }
}
