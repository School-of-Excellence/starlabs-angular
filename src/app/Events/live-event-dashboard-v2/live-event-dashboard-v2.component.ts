import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { collection, collectionData, getFirestore, getDocs, query, where, documentId, doc, setDoc, updateDoc, getDoc } from '@angular/fire/firestore';
import { DocumentReference, orderBy } from 'firebase/firestore';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TagParticipantsComponent } from '../../Participants Profile Management/participants-analytics/tag-participants/tag-participants.component';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { AuthguardService } from '../../authguard.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment.development';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { Storage,ref,uploadBytes,getDownloadURL } from '@angular/fire/storage';
import * as XLSX from 'xlsx';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

interface EventData {
  docref: DocumentReference;
  name: string;
  start_date: any;
  end_date: any;
  [key: string]: any;
}

interface QueueData {
  docref: DocumentReference;
  name: string;
  start_date: any;
  end_date: any;
  eventref?: DocumentReference;
  queuestartdate?: any;
  queueenddate?: any;
  [key: string]: any;
}

interface DayAttendance {
  day: number;
  date: string;
  displayLabel: string;
  count: number;
  percentage: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  presentProfileIds: string[];
  absentProfileIds: string[];
}

interface ParticipantMetadata {
  profileid: string;
  name: string;
  email: string;
  phone: string;
  photo?: string;
  activejourney?: string;
  profiletags?: string[];
  [key: string]: any;
}

interface Participant {
  docref: string;
  profileid: string;
  name: string;
  email: string;
  phone: string;
  photo?: string;
  activejourney?: string;
  profiletags?: string[];
  isPresent: boolean;
  isSelected: boolean;
  isNotRegistered: boolean;
  [key: string]: any;
}

interface AtcDocument {
  docref: string;
  profileid: string;
  prescription_date: any;
  [key: string]: any;
}

interface ArenaOverview {
  atcCompleted: number;
  atcCompletedProfileIds: string[];
  atcCompletedDocs: AtcDocument[];
  atcToValidate: number;
  atcToValidateProfileIds: string[];
  atcToValidateDocs: AtcDocument[];
  atcNotCompleted: number;
  atcNotCompletedProfileIds: string[];
  overallVideoAsk: number;
  overallVideoAskPercentage: number;
  overallVideoAskProfileIds: string[];
  overallVideoAskReviewedProfileIds: string[];
  todayVideoAsk: number;
  todayVideoAskPercentage: number;
  todayVideoAskProfileIds: string[];
  todayVideoAskReviewedProfileIds: string[];
}

interface IssueCategory {
  category: string;
  [key: string]: any;
}

interface ClientIssue {
  docref: string;
  profileid: string;
  category: string;
  status: string;
  [key: string]: any;
}

interface CategoryCount {
  category: string;
  count: number;
  profileIds: string[];
}

interface JourneyCount {
  journeyId: string;
  journeyName: string;
  count: number;
  profileIds: string[];
}

interface ChangeWorkOverview {
  notDoneOthers: number;
  notDoneOthersProfileIds: string[];
  notDoneSelf: number;
  notDoneSelfProfileIds: string[];
  nonAtcCW: number;
  nonAtcCWProfileIds: string[];
  liveCW: number;
  liveCWProfileIds: string[];
}

interface LiveChangeWorkDocument {
  docref: string;
  adjustment: string;
  beneficiaryid: string;
  beneficiarystatus: string | null;
  createdon: any;
  docid: string;
  doerid: string;
  doerstatus: string | null;
  participantsinvolved: string[];
  procedurestatus: string;
  procedureId: string;
  procedurename: string;
  procedureRef: any;
  [key: string]: any;
}

interface ParticipantWithIssues extends Participant {
  issues?: ClientIssue[];
}

// Add this interface after ArenaOverview interface
interface FilteredArenaOverview {
  overallVideoAsk: number;
  overallVideoAskProfileIds: string[];
  overallVideoAskReviewedProfileIds: string[];
  overallVideoAskPercentage: number;
  todayVideoAsk: number;
  todayVideoAskProfileIds: string[];
  todayVideoAskReviewedProfileIds: string[];
  todayVideoAskPercentage: number;
}

interface FilteredArenaOverview {
  overallVideoAsk: number;
  overallVideoAskProfileIds: string[];
  overallVideoAskReviewedProfileIds: string[];
  overallVideoAskPercentage: number;
  todayVideoAsk: number;
  todayVideoAskProfileIds: string[];
  todayVideoAskReviewedProfileIds: string[];
  todayVideoAskPercentage: number;
  // ATC fields
  atcCompleted: number;
  atcCompletedProfileIds: string[];
  atcCompletedDocs: AtcDocument[];
  atcToValidate: number;
  atcToValidateProfileIds: string[];
  atcToValidateDocs: AtcDocument[];
  atcNotCompleted: number;
  atcNotCompletedProfileIds: string[];
  // Participant history fields
  firstTimeCount: number;
  firstTimeProfileIds: string[];
  secondTimeCount: number;
  secondTimeProfileIds: string[];
}

const STORAGE_KEY_EVENT = 'live_dashboard_selected_event_id';
const STORAGE_KEY_QUEUE = 'live_dashboard_selected_queue_id';

@Component({
  selector: 'app-live-event-dashboard-v2',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatDialogModule,ProfilePictureComponent],
  templateUrl: './live-event-dashboard-v2.component.html',
  styleUrl: './live-event-dashboard-v2.component.css'
})
export class LiveEventDashboardV2Component implements OnInit, OnDestroy {

  @ViewChild('searchInput') searchInput!: ElementRef;
  @ViewChild('queueSearchInput') queueSearchInput!: ElementRef;

  eventsList: EventData[] = [];
  filteredEventsList: EventData[] = [];
  ongoingEvents: EventData[] = [];
  selectedEvent: EventData | null = null;
  selectedEventRef: {} = {};
  
  searchTerm: string = '';
  isDropdownOpen: boolean = false;
  highlightedIndex: number = -1;

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
  
  mapAttendence: { [key: string]: any[] } = {};
  participantMetadataMap: { [profileid: string]: ParticipantMetadata } = {};
  eventParticipants: Participant[] = [];
  eventParticipantProfileIds: string[] = [];
  registeredCount: number = 0;
  confirmedPercentage: number = 0;
  
  notScannedCount: number = 0;
  notScannedProfileIds: string[] = [];
  
  dayWiseAttendance: DayAttendance[] = [];
  todayAttendence: number = 0;
  allDayAbsent: number = 0;
  allDayAbsentProfileIds: string[] = [];

  atcModels: string[] = [];

  arenaOverview: ArenaOverview = {
    atcCompleted: 0, atcCompletedProfileIds: [], atcCompletedDocs: [],
    atcToValidate: 0, atcToValidateProfileIds: [], atcToValidateDocs: [],
    atcNotCompleted: 0, atcNotCompletedProfileIds: [],
    overallVideoAsk: 0, overallVideoAskPercentage: 0, overallVideoAskProfileIds: [], overallVideoAskReviewedProfileIds: [],
    todayVideoAsk: 0, todayVideoAskPercentage: 0, todayVideoAskProfileIds: [], todayVideoAskReviewedProfileIds: []
  };
  
  isLoading: boolean = false;
  isLoadingAttendance: boolean = false;
  isLoadingQueues: boolean = false;
  isLoadingArenaOverview: boolean = false;
  isLoadingCWOverview: boolean = false;
  isLoadingJourneys: boolean = false;

  isSidePanelOpen: boolean = false;
  sidePanelTitle: string = '';
  sidePanelDate: string = '';
  sidePanelType: 'day' | 'absent' | 'registered' | 'overallVideoAsk' | 'todayVideoAsk' | 'atcCompleted' | 'atcToValidate' | 'atcNotCompleted' | 'clientIssue' | 'journey' | 'notScanned' | 'scanned' | 'cwNotDoneOthers' | 'cwNotDoneSelf' | 'cwNonAtc' | 'cwLive' | 'journeyMissing' | 'newParticipants' | 'nonCohort' | 'firstTime' | 'secondTime' | 'actionQueue' | 'irregular' | 'arenaNotDoingCW' | 'arenaCWNotReceived' | 'arenaLiveCW' | 'registeredNotCome' | 'notFinance' | 'cameDay1NotToday' | 'noCohort' | 'noAtc' | 'firstTimeTag' | 'noZone' | 'draftAtc' = 'day';
  sidePanelDayIndex: number = -1;
  participantSearchTerm: string = '';
  participantFilter: 'all' | 'present' | 'absent' = 'all';
  filteredParticipants: Participant[] = [];
  panelParticipants: Participant[] = [];
  selectedParticipantsCount: number = 0;
  selectAll: boolean = false;
  
  notRegisteredCount: number = 0;

  issueCategories: IssueCategory[] = [];
  clientIssues: ClientIssue[] = [];
  categoryCounts: CategoryCount[] = [];
  totalOpenIssues: number = 0;
  isLoadingClientIssues: boolean = false;
  selectedIssueCategory: string = '';

  journeyCounts: JourneyCount[] = [];
  totalJourneyParticipants: number = 0;
  selectedJourneyId: string = '';

  filteredTags: any[] = [];
  availableTags: any[] = [];
  selectedTags: string[] = [];
  mapTagsMetaData: { [key: string]: any } = {};
  mapTagsName: { [key: string]: string } = {};
  tagSearchTerm: string = '';
  tagDropdownOpen: boolean = false;

  mapJourneyData: { [key: string]: any } = {};

  // ChangeWork Overview
  changeWorkViewMode: 'today' | 'overall' = 'today';
  liveChangeWorkDocs: LiveChangeWorkDocument[] = [];
  changeWorkOverview: ChangeWorkOverview = {
    notDoneOthers: 0, notDoneOthersProfileIds: [],
    notDoneSelf: 0, notDoneSelfProfileIds: [],
    nonAtcCW: 0, nonAtcCWProfileIds: [],
    liveCW: 0, liveCWProfileIds: []
  };

  panelParticipantsWithIssues: ParticipantWithIssues[] = [];
  missingJourneyCount: number = 0;
  missingJourneyProfileIds: string[] = [];

  // Add new properties after existing properties
  newParticipantsCount: number = 0;
  newParticipantsProfileIds: string[] = [];
  newUserDataMap: { [profileid: string]: any } = {};
  private newUserDataSubscription: Subscription | null = null;

  nonCohortCount: number = 0;
  nonCohortProfileIds: string[] = [];
  cohortsList: any[] = [];
  cohortParticipantIds: Set<string> = new Set();
  isLoadingCohorts: boolean = false;
  private cohortsSubscription: Subscription | null = null;

  firstTimeCount: number = 0;
  firstTimeProfileIds: string[] = [];
  secondTimeCount: number = 0;
  secondTimeProfileIds: string[] = [];
  isLoadingParticipantHistory: boolean = false;
  private participantHistorySubscription: Subscription | null = null;

  videoAskTags: string[] = [];
  actionQueueData: { [tag: string]: { profileId: string; name: string }[] } = {};
  isLoadingActionQueue: boolean = false;
  private actionQueueSubscription: Subscription | null = null;

  arenaFollowupTimeFilter: string = '09:00';
  selectedFollowupDayIndex: number = -1; // -1 means current day
  irregularParticipants: { profileId: string; name: string }[] = [];
  isLoadingIrregular: boolean = false;

  scannedCount: number = 0;
  scannedProfileIds: string[] = [];

  cameDay1NotTodayParticipants: { profileId: string; name: string }[] = [];
  // Live CW for Arena Followup
  liveCWDisplayList: { doerId: string; doerName: string; beneficiaryId: string; beneficiaryName: string; procedurename: string; displayText: string }[] = [];


  // Side Panel for Action Queue, Arena Followup, Participant Status
  actionQueueSelectedTag: string = '';
  arenaFollowupSelectedColumn: 'irregular' | 'notDoingCW' | 'cwNotReceived' | 'liveCW' | '' = '';
  participantStatusSelectedColumn: 'registeredNotCome' | 'notFinance' | 'cameDay1' | 'noCohort' | 'noAtc' | '' = '';

  // First Time Tags Widget
  firstTimeTags: string[] = [];
  firstTimeTagsData: { [tag: string]: { profileId: string; name: string }[] } = {};
  isLoadingFirstTimeTags: boolean = false;
  firstTimeTagsSelectedTag: string = '';

  participantViewMode: 'registered' | 'scanned' = 'scanned';
  scannedParticipantProfileIds: string[] = [];

  // Add this property after arenaOverview property
  filteredArenaOverview: FilteredArenaOverview = {
    overallVideoAsk: 0, 
    overallVideoAskProfileIds: [], 
    overallVideoAskReviewedProfileIds: [], 
    overallVideoAskPercentage: 0,
    todayVideoAsk: 0, 
    todayVideoAskProfileIds: [], 
    todayVideoAskReviewedProfileIds: [], 
    todayVideoAskPercentage: 0,
    atcCompleted: 0,
    atcCompletedProfileIds: [],
    atcCompletedDocs: [],
    atcToValidate: 0,
    atcToValidateProfileIds: [],
    atcToValidateDocs: [],
    atcNotCompleted: 0,
    atcNotCompletedProfileIds: [],
    firstTimeCount: 0,
    firstTimeProfileIds: [],
    secondTimeCount: 0,
    secondTimeProfileIds: []
  };

  // Add after nonCohortProfileIds declaration
  noZoneCount: number = 0;
  noZoneProfileIds: string[] = [];
  eventParticipantZones: any[] = [];
  zoneParticipantIds: Set<string> = new Set();
  isLoadingZones: boolean = false;
  private zonesSubscription: Subscription | null = null;
  registeredPanelFilter: 'all' | 'scanned' | 'notScanned' = 'all';

  // Draft ATC
  draftAtcCount: number = 0;
  draftAtcProfileIds: string[] = [];
  draftAtcDocs: any[] = [];
  isLoadingDraftAtc: boolean = false;
  private draftAtcSubscription: Subscription | null = null;

  private storedEventId: string | null = null;
  private storedQueueId: string[] | null = null;
  private eTicketSubscription: Subscription | null = null;

  private unsubscribe$ = new Subject<void>();
  private attendanceSubscription: Subscription | null = null;
  private atcCompletedSubscription: Subscription | null = null;
  private atcToValidateSubscription: Subscription | null = null;
  private videoAskSubscription: Subscription | null = null;
  private clientIssuesSubscription: Subscription | null = null;
  private changeWorkSubscription: Subscription | null = null;
  private storage = inject(Storage);

  loggedInProfileid

  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  constructor(private elementRef: ElementRef, public dialog: MatDialog, private guard : AuthguardService, public http : HttpClient) {
    guard.getRoles().then(roles =>{
      this.loggedInProfileid = roles["profile_ref"].id
    })
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const eventDropdown = this.elementRef.nativeElement.querySelector('.event-selector');
    const queueDropdown = this.elementRef.nativeElement.querySelector('.queue-selector');
    const tagDropdown = this.elementRef.nativeElement.querySelector('.filter-dropdown-wrapper');
    
    if (eventDropdown && !eventDropdown.contains(target)) {
      this.isDropdownOpen = false;
    }
    if (queueDropdown && !queueDropdown.contains(target)) {
      this.isQueueDropdownOpen = false;
    }
    if (tagDropdown && !tagDropdown.contains(target)) {
      this.tagDropdownOpen = false;
    }
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.isDropdownOpen) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredEventsList.length - 1);
        this.scrollToHighlighted('event');
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
        this.scrollToHighlighted('event');
        break;
      case 'Enter':
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.filteredEventsList[this.highlightedIndex]) {
          this.selectEvent(this.filteredEventsList[this.highlightedIndex]);
        }
        break;
      case 'Escape':
        this.isDropdownOpen = false;
        break;
    }
  }

  onQueueKeyDown(event: KeyboardEvent) {
    if (!this.isQueueDropdownOpen) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.queueHighlightedIndex = Math.min(this.queueHighlightedIndex + 1, this.filteredQueuesList.length - 1);
        this.scrollToHighlighted('queue');
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.queueHighlightedIndex = Math.max(this.queueHighlightedIndex - 1, 0);
        this.scrollToHighlighted('queue');
        break;
      case 'Enter':
        event.preventDefault();
        if (this.queueHighlightedIndex >= 0 && this.filteredQueuesList[this.queueHighlightedIndex]) {
          this.toggleQueueSelection(this.filteredQueuesList[this.queueHighlightedIndex]);
        }
        break;
      case 'Escape':
        this.isQueueDropdownOpen = false;
        break;
    }
  }

  scrollToHighlighted(type: 'event' | 'queue') {
    setTimeout(() => {
      const selector = type === 'event' ? '.event-dropdown .dropdown-item.highlighted' : '.queue-dropdown .dropdown-item.highlighted';
      const highlighted = document.querySelector(selector);
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 10);
  }

  private saveEventToStorage(eventId: string) {
    try { localStorage.setItem(STORAGE_KEY_EVENT, eventId); } catch (e) { console.warn('Failed to save event:', e); }
  }

  private saveQueueToStorage(queueIds: string[]) {
    try { localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queueIds)); } catch (e) { console.warn('Failed to save queues:', e); }
  }

  private getEventFromStorage(): string | null {
    try { return localStorage.getItem(STORAGE_KEY_EVENT); } catch (e) { return null; }
  }

  private getQueueFromStorage(): string[] | null {
    try { 
      const stored = localStorage.getItem(STORAGE_KEY_QUEUE);
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  }

  private clearEventFromStorage() {
    try { localStorage.removeItem(STORAGE_KEY_EVENT); localStorage.removeItem(STORAGE_KEY_QUEUE); } catch (e) {}
  }

  private clearQueueFromStorage() {
    try { localStorage.removeItem(STORAGE_KEY_QUEUE); } catch (e) {}
  }

  private getDocRefPath(docRef: DocumentReference): string {
    return docRef.path;
  }

  private unsubscribeEventSubscriptions() {
    if (this.attendanceSubscription) {
      this.attendanceSubscription.unsubscribe();
      this.attendanceSubscription = null;
    }
    if (this.eTicketSubscription) {
      this.eTicketSubscription.unsubscribe();
      this.eTicketSubscription = null;
    }
    if (this.videoAskSubscription) {
      this.videoAskSubscription.unsubscribe();
      this.videoAskSubscription = null;
    }
    if (this.cohortsSubscription) {
      this.cohortsSubscription.unsubscribe();
      this.cohortsSubscription = null;
    }
    if (this.newUserDataSubscription) {
      this.newUserDataSubscription.unsubscribe();
      this.newUserDataSubscription = null;
    }
    if (this.actionQueueSubscription) {
      this.actionQueueSubscription.unsubscribe();
      this.actionQueueSubscription = null;
    }
    if (this.zonesSubscription) {
      this.zonesSubscription.unsubscribe();
      this.zonesSubscription = null;
    }
  }

  private unsubscribeQueueSubscriptions() {
    if (this.atcCompletedSubscription) {
      this.atcCompletedSubscription.unsubscribe();
      this.atcCompletedSubscription = null;
    }
    if (this.atcToValidateSubscription) {
      this.atcToValidateSubscription.unsubscribe();
      this.atcToValidateSubscription = null;
    }
    if (this.changeWorkSubscription) {
      this.changeWorkSubscription.unsubscribe();
      this.changeWorkSubscription = null;
    }
    if (this.draftAtcSubscription) {
      this.draftAtcSubscription.unsubscribe();
      this.draftAtcSubscription = null;
    }
  }

  private unsubscribeAll() {
    this.unsubscribeEventSubscriptions();
    this.unsubscribeQueueSubscriptions();
    if (this.clientIssuesSubscription) {
      this.clientIssuesSubscription.unsubscribe();
      this.clientIssuesSubscription = null;
    }
  }

  async ngOnInit() {
    this.isLoading = true;
    this.isSidePanelOpen = false;
    this.storedEventId = this.getEventFromStorage();
    this.storedQueueId = this.getQueueFromStorage();
    
    await this.loadParticipantMetadata();
    this.subscribeToClientIssues();

    await getDocs(collection(this.firestoreDefault, "journey")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const journeyData = snap.docs[i].data();
        journeyData['docid'] = snap.docs[i].id;
        this.mapJourneyData[snap.docs[i].id] = journeyData;
      }
    });

    collectionData(query(collection(this.firestoreDefault, "participant tags")), { idField: 'docid' }).pipe(takeUntil(this.unsubscribe$)).subscribe(tags => {
      this.availableTags = tags;
      this.mapTagsName = {};
      this.mapTagsMetaData = {};
      this.filteredTags = [...tags];
      for (let i = 0; i < tags.length; i++) {
        const e = tags[i];
        this.mapTagsName[e['docid']] = e['name'];
        this.mapTagsMetaData[e['docid']] = e;
      }
    });
    
    try {
      const eventsSnapshot = await getDocs(query(collection(this.firestoreDefault, 'event collection'), orderBy('end_date', 'desc')));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      eventsSnapshot.docs.forEach((doc) => {
        const data = doc.data() as EventData;
        data['docref'] = doc.ref;
        this.eventsList.push(data);
        
        const startDate = data['start_date']?.toDate ? data['start_date'].toDate() : new Date(data['start_date']);
        const endDate = data['end_date']?.toDate ? data['end_date'].toDate() : new Date(data['end_date']);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        if (startDate <= today && today <= endDate) {
          this.ongoingEvents.push(data);
        }
      });
      
      this.filteredEventsList = [...this.eventsList];
      
      if (this.storedEventId) {
        const storedEvent = this.eventsList.find(e => this.getDocRefPath(e.docref) === this.storedEventId);
        if (storedEvent) {
          await this.selectEventWithoutSaving(storedEvent);
        } else if (this.ongoingEvents.length > 0) {
          this.selectEvent(this.ongoingEvents[0]);
        }
      } else if (this.ongoingEvents.length > 0) {
        this.selectEvent(this.ongoingEvents[0]);
      }
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      this.isLoading = false;
    }
  }

  calculateJourneyCounts() {
    this.journeyCounts = [];
    const journeyMap: { [journeyId: string]: string[] } = {};
    const participantsWithJourney: string[] = [];
    const currentList = this.getCurrentParticipantList();
    
    currentList.forEach(profileId => { 
      const metadata = this.participantMetadataMap[profileId];
      const activeJourney = metadata?.activejourney;
      
      if (activeJourney && this.mapJourneyData[activeJourney]) {
        if (!journeyMap[activeJourney]) {
          journeyMap[activeJourney] = [];
        }
        journeyMap[activeJourney].push(profileId);
        participantsWithJourney.push(profileId);
      }
    });
    
    // Calculate participants without any journey
    this.missingJourneyProfileIds = currentList.filter(
      profileId => !participantsWithJourney.includes(profileId)
    );
    this.missingJourneyCount = this.missingJourneyProfileIds.length;
    
    Object.keys(this.mapJourneyData).forEach(journeyId => {
      const journeyData = this.mapJourneyData[journeyId];
      const profileIds = journeyMap[journeyId] || [];
      
      this.journeyCounts.push({
        journeyId: journeyId,
        journeyName: journeyData['journey'] || journeyData['name'] || 'Unknown Journey',
        count: profileIds.length,
        profileIds: profileIds
      });
    });
    
    this.journeyCounts.sort((a, b) => b.count - a.count);
    this.totalJourneyParticipants = this.journeyCounts.reduce((sum, j) => sum + j.count, 0);
  }

  // Add method to open missing journey panel
  openMissingJourneyPanel() {
    if (this.missingJourneyCount === 0) return;
    
    this.sidePanelTitle = 'Missing Journey Assignment';
    this.sidePanelDate = '';
    this.sidePanelType = 'journeyMissing';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.selectedJourneyId = '';
    
    this.updatePanelParticipants(this.missingJourneyProfileIds, false);
    this.isSidePanelOpen = true;
  }


  private async selectEventWithoutSaving(event: EventData) {
    this.selectedEvent = event;
    this.selectedEventRef = event.docref;
    this.searchTerm = '';
    this.isDropdownOpen = false;
    await this.onEventSelectWithRestore();
  }

  private async onEventSelectWithRestore() {
    if (!this.selectedEventRef) {
      this.selectedEvent = null;
      this.dayWiseAttendance = [];
      this.registeredCount = 0;
      return;
    }
    
    this.selectedEvent = this.eventsList.find(e => e['docref'] === this.selectedEventRef) || null;
    
    if (this.selectedEvent) {
      this.isLoadingAttendance = true;
      await this.loadParticipants();
      this.generateDayWiseStructure();
      this.subscribeToETickets();
      this.subscribeToAttendance();
      this.calculateCameDay1NotToday();
      this.calculateIrregularParticipants();
      this.subscribeToNewUserData();
      this.subscribeToCohorts();
      await this.loadQueuesWithRestore();
      this.calculateJourneyCounts();
      await this.loadParticipantHistory();
      await this.loadActionQueue();
      await this.loadFirstTimeTags();
      this.subscribeToZones();
      // Subscribe to VideoAsk (event-related)
      const todayStr = new Date().toLocaleDateString('en-CA');
      this.subscribeToVideoAsk(todayStr);
    }
  }

  // Add new method to subscribe to cohorts
  subscribeToCohorts() {
    if (!this.selectedEvent) return;
    
    if (this.cohortsSubscription) {
      this.cohortsSubscription.unsubscribe();
    }
    
    this.isLoadingCohorts = true;
    
    this.cohortsSubscription = collectionData(
      query(collection(this.firestoreDefault, 'big cohorts'), where('eventref', '==', this.selectedEvent.docref))
    ).subscribe({
      next: (docs) => {
        console.log(docs);
        
        this.cohortsList = docs;
        this.cohortParticipantIds.clear();
        
        // Collect all participant IDs from all cohorts
        docs.forEach((cohort: any) => {
          const participantList = cohort['participantidlist'] || [];
          console.log(participantList);
          
          participantList.forEach((profileId: string) => {
            this.cohortParticipantIds.add(profileId);
          });
        });
        
        // Calculate non-cohort participants (registered but not in any cohort)
        this.calculateNonCohortParticipants();
        this.isLoadingCohorts = false;
        
        if (this.isSidePanelOpen && this.sidePanelType === 'nonCohort') {
          this.refreshNonCohortPanel();
        }
      },
      error: (error) => {
        console.error('Error subscribing to cohorts:', error);
        this.isLoadingCohorts = false;
      }      
    });
  }

  // Add method to calculate non-cohort participants
  calculateNonCohortParticipants() {
    const currentList = this.getCurrentParticipantList();
    this.nonCohortProfileIds = currentList.filter(
      profileId => !this.cohortParticipantIds.has(profileId)
    );
    this.nonCohortCount = this.nonCohortProfileIds.length;
  }

  // Add method to open non-cohort panel
  openNonCohortPanel() {
    if (this.nonCohortCount === 0) return;
    
    this.sidePanelTitle = 'Non-Cohort Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'nonCohort' as any;
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshNonCohortPanel();
    this.isSidePanelOpen = true;
  }

  private refreshNonCohortPanel() {
    this.panelParticipants = this.nonCohortProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
  }

  // Add new method to subscribe to new_user_data collection
  subscribeToNewUserData() {
    if (!this.selectedEvent) return;
    
    if (this.newUserDataSubscription) {
      this.newUserDataSubscription.unsubscribe();
    }
    
    // Get event start date
    const eventStartDate = this.selectedEvent['start_date']?.toDate 
      ? this.selectedEvent['start_date'].toDate() 
      : new Date(this.selectedEvent['start_date']);
    eventStartDate.setHours(0, 0, 0, 0);
    
    this.newUserDataSubscription = collectionData(
      query(collection(this.firestoreDefault, 'new_user_data'))
    ).subscribe({
      next: (docs) => {
        this.newUserDataMap = {};
        this.newParticipantsProfileIds = [];
        
        docs.forEach((doc: any) => {
          const createdDate = doc['created']?.toDate 
            ? doc['created'].toDate() 
            : (doc['created'] ? new Date(doc['created']) : null);
          
          if (createdDate && createdDate >= eventStartDate) {
            const profileId = doc['profileid'] || doc['uid'] || '';
            if (profileId) {
              this.newUserDataMap[profileId] = {
                profileid: profileId,
                name: doc['name'] || '',
                email: doc['email'] || '',
                phone: doc['phonenumber'] || '',
                countryCode: doc['countryCode'] || '',
                created: doc['created'],
                status: doc['status'] || '',
                registrationMethod: doc['registrationMethod'] || '',
                refferedby: doc['refferedby'] || '',
                workshoponly: doc['workshoponly'] || false,
                ...doc
              };
              
              if (!this.newParticipantsProfileIds.includes(profileId)) {
                this.newParticipantsProfileIds.push(profileId);
              }
            }
          }
        });
        
        this.newParticipantsCount = this.newParticipantsProfileIds.length;
        
        // Refresh side panel if viewing new participants
        if (this.isSidePanelOpen && this.sidePanelType === 'newParticipants') {
          this.refreshNewParticipantsPanel();
        }
      },
      error: (error) => {
        console.error('Error subscribing to new user data:', error);
      }
    });
  }

  // Add method to open new participants panel
  openNewParticipantsPanel() {
    if (this.newParticipantsCount === 0) return;
    
    this.sidePanelTitle = 'New Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'newParticipants' as any;
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshNewParticipantsPanel();
    this.isSidePanelOpen = true;
  }

  // Add method to refresh new participants panel
  private refreshNewParticipantsPanel() {
    this.panelParticipants = this.newParticipantsProfileIds.map(profileId => {
      const newUserData = this.newUserDataMap[profileId] || {};
      const metadata = this.participantMetadataMap[profileId] || {};
      const isRegistered = this.eventParticipantProfileIds.includes(profileId);
      
      return {
        docref: profileId,
        profileid: profileId,
        name: newUserData['name'] || metadata['name'] || 'Unknown',
        email: newUserData['email'] || metadata['email'] || '',
        phone: newUserData['phonenumber'] || newUserData['phone'] || metadata['phone'] || '',
        photo: metadata['photo'] || '',
        activejourney: metadata['activejourney'] || '',
        profiletags: metadata['profiletags'] || [],
        isPresent: isRegistered,
        isSelected: false,
        isNotRegistered: !isRegistered,
        registrationMethod: newUserData['registrationMethod'] || '',
        refferedby: newUserData['refferedby'] || '',
        created: newUserData['created'],
        workshoponly: newUserData['workshoponly'] || false
      } as Participant;
    });
    
    // Sort by creation date (newest first)
    this.panelParticipants.sort((a, b) => {
      const dateA = a['created']?.toDate ? a['created'].toDate() : new Date(a['created'] || 0);
      const dateB = b['created']?.toDate ? b['created'].toDate() : new Date(b['created'] || 0);
      return dateB.getTime() - dateA.getTime();
    });
    
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }


  private async loadQueuesWithRestore() {
    if (!this.selectedEvent) return;
    
    this.isLoadingQueues = true;
    this.queuesList = [];
    this.ongoingQueues = [];
    this.selectedQueues = [];
    this.selectedQueueRefs = [];
    this.queueRangeStartDate = null;
    this.queueRangeEndDate = null;
    
    try {
      const queuesSnapshot = await getDocs(query(collection(this.firestoreDefault, 'queue generation'), orderBy('queueenddate', 'desc')));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      queuesSnapshot.docs.forEach((doc) => {
        const data = doc.data() as QueueData;
        data['docref'] = doc.ref;
        this.queuesList.push(data);
        
        const startDate = data['queuestartdate']?.toDate ? data['queuestartdate'].toDate() : new Date(data['queuestartdate']);
        const endDate = data['queueenddate']?.toDate ? data['queueenddate'].toDate() : new Date(data['queueenddate']);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        if (startDate <= today && today <= endDate) {
          this.ongoingQueues.push(data);
        }
      });
      
      this.filteredQueuesList = [...this.queuesList];
      
      if (this.storedQueueId && this.storedQueueId.length > 0) {
        const storedQueues = this.queuesList.filter(q => this.storedQueueId!.includes(this.getDocRefPath(q.docref)));
        if (storedQueues.length > 0) {
          storedQueues.forEach(queue => {
            this.selectedQueues.push(queue);
            this.selectedQueueRefs.push(queue.docref);
          });
          this.queueSearchTerm = '';
          this.isQueueDropdownOpen = false;
          this.updateQueueDateRange();
          this.loadQueuevariation();
          this.subscribeToDraftAtc();
        } else if (this.ongoingQueues.length > 0) {
          this.toggleQueueSelection(this.ongoingQueues[0]);
        }
      } else if (this.ongoingQueues.length > 0) {
        this.toggleQueueSelection(this.ongoingQueues[0]);
      }
    } catch (error) {
      console.error('Error loading queues:', error);
    } finally {
      this.isLoadingQueues = false;
    }
  }

  async loadQueues() {
    if (!this.selectedEvent) return;
    
    this.isLoadingQueues = true;
    this.queuesList = [];
    this.ongoingQueues = [];
    this.selectedQueues = [];
    this.selectedQueueRefs = [];
    this.queueRangeStartDate = null;
    this.queueRangeEndDate = null;
    
    try {
      const queuesSnapshot = await getDocs(query(collection(this.firestoreDefault, 'queue generation'), orderBy('queueenddate', 'desc')));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      queuesSnapshot.docs.forEach((doc) => {
        const data = doc.data() as QueueData;
        data['docref'] = doc.ref;
        this.queuesList.push(data);
        
        const startDate = data['queuestartdate']?.toDate ? data['queuestartdate'].toDate() : new Date(data['queuestartdate']);
        const endDate = data['queueenddate']?.toDate ? data['queueenddate'].toDate() : new Date(data['queueenddate']);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        if (startDate <= today && today <= endDate) {
          this.ongoingQueues.push(data);
        }
      });
      
      this.filteredQueuesList = [...this.queuesList];
      
      if (this.ongoingQueues.length > 0) {
        this.toggleQueueSelection(this.ongoingQueues[0]);
      }
    } catch (error) {
      console.error('Error loading queues:', error);
    } finally {
      this.isLoadingQueues = false;
    }
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.isQueueDropdownOpen = false;
    if (this.isDropdownOpen) {
      this.filteredEventsList = [...this.eventsList];
      this.searchTerm = '';
      this.highlightedIndex = -1;
      setTimeout(() => { this.searchInput?.nativeElement?.focus(); }, 100);
    }
  }

  openDropdown() {
    if (!this.isDropdownOpen) {
      this.isDropdownOpen = true;
      this.isQueueDropdownOpen = false;
      this.filteredEventsList = [...this.eventsList];
      this.highlightedIndex = -1;
      setTimeout(() => { this.searchInput?.nativeElement?.focus(); }, 100);
    }
  }

  onSearchChange() {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredEventsList = [...this.eventsList];
    } else {
      this.filteredEventsList = this.eventsList.filter(event => {
        const name = (event.name || event['title'] || '').toLowerCase();
        return name.includes(term);
      });
    }
    this.highlightedIndex = this.filteredEventsList.length > 0 ? 0 : -1;
  }

  // Update selectEvent - DON'T reset queue selection
  selectEvent(event: EventData) {
    // Only unsubscribe event-related subscriptions
    this.unsubscribeEventSubscriptions();
    
    // Reset event-related data only
    this.journeyCounts = [];
    this.totalJourneyParticipants = 0;
    this.missingJourneyCount = 0;
    this.missingJourneyProfileIds = [];
    
    // Reset Non-Cohort data
    this.nonCohortCount = 0;
    this.nonCohortProfileIds = [];
    this.cohortsList = [];
    this.cohortParticipantIds.clear();
    
    // Reset New Participants
    this.newParticipantsCount = 0;
    this.newParticipantsProfileIds = [];
    this.newUserDataMap = {};

    this.videoAskTags = [];
    this.actionQueueData = {};
    
    this.selectedEvent = event;
    this.selectedEventRef = event.docref;
    this.searchTerm = '';
    this.isDropdownOpen = false;
    this.saveEventToStorage(this.getDocRefPath(event.docref));

    this.firstTimeCount = 0;
    this.firstTimeProfileIds = [];
    this.secondTimeCount = 0;
    this.secondTimeProfileIds = [];

    this.irregularParticipants = [];
    this.selectedFollowupDayIndex = -1;
    this.arenaFollowupTimeFilter = '09:00';

    this.cameDay1NotTodayParticipants = [];

    this.liveCWDisplayList = [];

    this.firstTimeTags = [];
    this.firstTimeTagsData = {};
    this.firstTimeTagsSelectedTag = '';

    this.noZoneCount = 0;
    this.noZoneProfileIds = [];
    this.eventParticipantZones = [];
    this.zoneParticipantIds.clear();

    this.draftAtcCount = 0;
    this.draftAtcProfileIds = [];
    this.draftAtcDocs = [];
    
    if (this.isSidePanelOpen) {
      this.closeSidePanel();
    }
    
    this.onEventSelect();
  }

  // Update clearSelection
  clearSelection(event: MouseEvent) {
    event.stopPropagation();
    
    this.unsubscribeEventSubscriptions();
    this.unsubscribeQueueSubscriptions();
    
    this.selectedEvent = null;
    this.selectedEventRef = null;
    this.dayWiseAttendance = [];
    this.registeredCount = 0;
    this.searchTerm = '';
    this.eventParticipants = [];
    this.eventParticipantProfileIds = [];
    this.mapAttendence = {};
    this.todayAttendence = 0;
    this.allDayAbsent = 0;
    this.allDayAbsentProfileIds = [];
    this.notScannedCount = 0;
    this.notScannedProfileIds = [];
    this.queuesList = [];
    this.ongoingQueues = [];
    this.selectedQueues = [];
    this.selectedQueueRefs = [];
    this.queueRangeStartDate = null;
    this.queueRangeEndDate = null;
    this.resetArenaOverview();
    this.resetChangeWorkOverview();
    this.clearEventFromStorage();
    
    // Reset Journey Overview
    this.journeyCounts = [];
    this.totalJourneyParticipants = 0;
    this.missingJourneyCount = 0;
    this.missingJourneyProfileIds = [];
    
    // Reset Non-Cohort data
    this.nonCohortCount = 0;
    this.nonCohortProfileIds = [];
    this.cohortsList = [];
    this.cohortParticipantIds.clear();
    
    // Reset New Participants
    this.newParticipantsCount = 0;
    this.newParticipantsProfileIds = [];
    this.newUserDataMap = {};

    this.firstTimeCount = 0;
    this.firstTimeProfileIds = [];
    this.secondTimeCount = 0;
    this.secondTimeProfileIds = [];

    this.irregularParticipants = [];
    this.selectedFollowupDayIndex = -1;
    this.arenaFollowupTimeFilter = '09:00';
    
    this.cameDay1NotTodayParticipants = [];

    this.videoAskTags = [];
    this.actionQueueData = {};

    this.liveCWDisplayList = [];

    this.firstTimeTags = [];
    this.firstTimeTagsData = {};
    this.firstTimeTagsSelectedTag = '';

    this.noZoneCount = 0;
    this.noZoneProfileIds = [];
    this.eventParticipantZones = [];
    this.zoneParticipantIds.clear();

    // Reset Draft ATC
    this.draftAtcCount = 0;
    this.draftAtcProfileIds = [];
    this.draftAtcDocs = [];
    
    if (this.isSidePanelOpen) {
      this.closeSidePanel();
    }
  }


  toggleQueueDropdown() {
    this.isQueueDropdownOpen = !this.isQueueDropdownOpen;
    this.isDropdownOpen = false;
    if (this.isQueueDropdownOpen) {
      this.filteredQueuesList = [...this.queuesList];
      this.queueSearchTerm = '';
      this.queueHighlightedIndex = -1;
      setTimeout(() => { this.queueSearchInput?.nativeElement?.focus(); }, 100);
    }
  }

  openQueueDropdown() {
    if (!this.isQueueDropdownOpen) {
      this.isQueueDropdownOpen = true;
      this.isDropdownOpen = false;
      this.filteredQueuesList = [...this.queuesList];
      this.queueHighlightedIndex = -1;
      setTimeout(() => { this.queueSearchInput?.nativeElement?.focus(); }, 100);
    }
  }

  onQueueSearchChange() {
    const term = this.queueSearchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredQueuesList = [...this.queuesList];
    } else {
      this.filteredQueuesList = this.queuesList.filter(queue => {
        const name = (queue.name || queue['title'] || queue['queuename'] || '').toLowerCase();
        return name.includes(term);
      });
    }
    this.queueHighlightedIndex = this.filteredQueuesList.length > 0 ? 0 : -1;
  }

  toggleQueueSelection(queue: QueueData) {
    const index = this.selectedQueues.findIndex(q => this.getDocRefPath(q.docref) === this.getDocRefPath(queue.docref));
    
    if (index > -1) {
      this.selectedQueues.splice(index, 1);
      this.selectedQueueRefs.splice(index, 1);
    } else {
      this.selectedQueues.push(queue);
      this.selectedQueueRefs.push(queue.docref);
    }
    
    this.queueSearchTerm = '';
    this.saveQueueToStorage(this.selectedQueues.map(q => this.getDocRefPath(q.docref)));
    this.updateQueueDateRange();
    
    if (this.selectedQueues.length > 0) {
      this.loadQueuevariation();
    } else {
      this.unsubscribeQueueSubscriptions();
      this.resetArenaOverview();
      this.resetDraftAtc(); // Add this line
    }
  }

  resetDraftAtc() {
    this.draftAtcCount = 0;
    this.draftAtcProfileIds = [];
    this.draftAtcDocs = [];
  }

  isQueueSelected(queue: QueueData): boolean {
    return this.selectedQueues.some(q => this.getDocRefPath(q.docref) === this.getDocRefPath(queue.docref));
  }

  updateQueueDateRange() {
    if (this.selectedQueues.length === 0) {
      this.queueRangeStartDate = null;
      this.queueRangeEndDate = null;
      return;
    }
    
    let oldestStart: Date | null = null;
    let newestEnd: Date | null = null;
    
    this.selectedQueues.forEach(queue => {
      const startDate = queue['queuestartdate']?.toDate ? queue['queuestartdate'].toDate() : new Date(queue['queuestartdate']);
      const endDate = queue['queueenddate']?.toDate ? queue['queueenddate'].toDate() : new Date(queue['queueenddate']);
      
      if (!oldestStart || startDate < oldestStart) {
        oldestStart = new Date(startDate);
      }
      if (!newestEnd || endDate > newestEnd) {
        newestEnd = new Date(endDate);
      }
    });
    
    if (oldestStart) oldestStart.setHours(0, 0, 0, 0);
    if (newestEnd) newestEnd.setHours(23, 59, 59, 999);
    
    this.queueRangeStartDate = oldestStart;
    this.queueRangeEndDate = newestEnd;
  }

  clearQueueSelection(event: MouseEvent) {
    event.stopPropagation();
    this.unsubscribeQueueSubscriptions();
    this.selectedQueues = [];
    this.selectedQueueRefs = [];
    this.queueRangeStartDate = null;
    this.queueRangeEndDate = null;
    this.queueSearchTerm = '';
    this.resetArenaOverview();
    this.resetChangeWorkOverview();
    this.clearQueueFromStorage();
    this.resetDraftAtc();
  }

  isOngoingEvent(event: EventData): boolean {
    return this.ongoingEvents.some(e => e.docref === event.docref);
  }

  isOngoingQueue(queue: QueueData): boolean {
    return this.ongoingQueues.some(q => q.docref === queue.docref);
  }

  // Update onEventSelect
  async onEventSelect() {
    if (!this.selectedEventRef) {
      this.selectedEvent = null;
      this.dayWiseAttendance = [];
      this.registeredCount = 0;
      return;
    }
    
    this.selectedEvent = this.eventsList.find(e => e['docref'] === this.selectedEventRef) || null;
    
    if (this.selectedEvent) {
      this.isLoadingAttendance = true;
      await this.loadParticipants();
      this.generateDayWiseStructure();
      this.subscribeToETickets();
      this.subscribeToAttendance();
      this.calculateCameDay1NotToday();
      this.calculateIrregularParticipants();
      this.subscribeToNewUserData();
      this.subscribeToCohorts();
      await this.loadQueues();
      this.calculateJourneyCounts();
      await this.loadParticipantHistory();
      await this.loadActionQueue();
      await this.loadFirstTimeTags();
      this.subscribeToZones();
      // Subscribe to VideoAsk (event-related)
      const todayStr = new Date().toLocaleDateString('en-CA');
      this.subscribeToVideoAsk(todayStr);
    }
  }
  
  async loadParticipants() {
    try {
      const participantsSnapshot = await getDocs(
        query(
          collection(this.firestoreDefault, 'event participation request'),
          where('eventref', '==', this.selectedEvent!.docref),
          where('status', 'in', ['approved', 'attended'])
        )
      );
      
      const seenProfileIds = new Set<string>();
      const participantDocs: any[] = [];
      
      participantsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const profileId = data['profileid'] || '';
        
        if (!profileId || seenProfileIds.has(profileId)) {
          return;
        }
        
        seenProfileIds.add(profileId);
        participantDocs.push({ docref: doc.id, profileid: profileId, ...data });
      });
      
      this.eventParticipantProfileIds = [...seenProfileIds];
      this.registeredCount = this.eventParticipantProfileIds.length;
      
      this.eventParticipants = participantDocs.map(doc => {
        const metadata = this.participantMetadataMap[doc.profileid] || {};
        return {
          docref: doc.docref,
          profileid: doc.profileid,
          name: metadata['name'] || doc['name'] || doc['fullname'] || doc['displayName'] || 'Unknown',
          email: metadata['email'] || doc['email'] || '',
          phone: metadata['phone'] || doc['phone'] || doc['mobile'] || doc['whatsapp'] || '',
          photo: metadata['profile'] || doc['photo'] || '',
          activejourney: metadata['activejourney'] || '',
          profiletags: metadata['profiletags'] || [],
          isPresent: false,
          isSelected: false,
          isNotRegistered: false,
          ...doc
        } as Participant;
      });
      
      const confirmedCount = this.eventParticipants.filter(p => 
        p['status'] === 'confirmed' || p['status'] === 'approved' || p['confirmation'] === true
      ).length;
      this.confirmedPercentage = this.registeredCount > 0 ? Math.round((confirmedCount / this.registeredCount) * 100) : 0;
    } catch (error) {
      console.error('Error loading participants:', error);
    }
  }

  async loadParticipantMetadata() {
    this.participantMetadataMap = {};
    try {
      const metadataSnapshot = await getDocs(query(collection(this.firestoreDefault, 'participant metadata'), orderBy('name', 'asc')));
      metadataSnapshot.docs.forEach(doc => {
        const data = doc.data();
        this.participantMetadataMap[doc.id] = {
          profileid: doc.id,
          name: data['name'] || data['fullname'] || data['displayName'] || '',
          email: data['email'] || '',
          phone: data['phone'] || data['mobile'] || data['number'] || '',
          photo: data['profile'] || data['profileimg'] || '',
          activejourney: data['activejourney'] || '',
          profiletags: data['profiletags'] || [],
          ...data
        };
      });
    } catch (error) {
      console.error('Error loading participant metadata:', error);
    }
  }

  subscribeToClientIssues() {
    if (this.clientIssuesSubscription) {
      this.clientIssuesSubscription.unsubscribe();
    }
    
    this.isLoadingClientIssues = true;
    
    getDocs(query(collection(this.firestoreDefault, 'chat config'), where(documentId(), '==', '0jqtiq3sxtbLVcEGMDhW')))
      .then(configDoc => {
        if (!configDoc.empty) {
          const configData = configDoc.docs[0].data();
          this.issueCategories = configData['categories'] || [];
        }
      });
    
    this.clientIssuesSubscription = collectionData(
      query(collection(this.firestoreDefault, 'clientissue'), where('status.status', '==', 'Open'))
    ).subscribe({
      next: (issues) => {
        this.clientIssues = issues.map((issue: any, index) => ({
          docref: index.toString(),
          profileid: issue['clientid'] || '',
          category: issue['category'] || '',
          status: issue['status'] || '',
          ...issue
        }));
        
        this.totalOpenIssues = this.clientIssues.length;
        this.calculateCategoryCounts();
        this.isLoadingClientIssues = false;
        
        if (this.isSidePanelOpen && this.sidePanelType === 'clientIssue') {
          this.refreshClientIssuePanel();
        }
      },
      error: (error) => {
        console.error('Error subscribing to client issues:', error);
        this.isLoadingClientIssues = false;
      }
    });
  }

  calculateCategoryCounts() {
    this.categoryCounts = [];
    
    this.issueCategories.forEach(cat => {
      const categoryName = cat.category;
      const issuesInCategory = this.clientIssues.filter(issue => issue.category === categoryName);
      const profileIds = [...new Set(issuesInCategory.map(issue => issue.profileid).filter(id => id))];
      this.categoryCounts.push({ category: categoryName, count: issuesInCategory.length, profileIds: profileIds });
    });
    
    const categorizedCategories = this.issueCategories.map(c => c.category);
    const uncategorizedIssues = this.clientIssues.filter(issue => !categorizedCategories.includes(issue.category));
    
    if (uncategorizedIssues.length > 0) {
      const uncategorizedProfileIds = [...new Set(uncategorizedIssues.map(issue => issue.profileid).filter(id => id))];
      this.categoryCounts.push({ category: 'Uncategorized', count: uncategorizedIssues.length, profileIds: uncategorizedProfileIds });
    }
  }

  refreshClientIssuePanel() {
    if (this.selectedIssueCategory) {
      const categoryCount = this.categoryCounts.find(c => c.category === this.selectedIssueCategory);
      if (categoryCount) {
        this.updatePanelParticipantsWithIssues(categoryCount.profileIds, this.selectedIssueCategory);
      }
    } else {
      const allProfileIds = [...new Set(this.clientIssues.map(issue => issue.profileid).filter(id => id))];
      this.updatePanelParticipantsWithIssues(allProfileIds, '');
    }
  }

  openClientIssuePanel(categoryCount: CategoryCount) {
    if (categoryCount.count === 0) return;
    
    this.sidePanelTitle = categoryCount.category + ' Issues';
    this.sidePanelDate = '';
    this.sidePanelType = 'clientIssue';
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.selectedIssueCategory = categoryCount.category;
    
    this.updatePanelParticipantsWithIssues(categoryCount.profileIds, categoryCount.category);
    this.isSidePanelOpen = true;
  }

  openAllClientIssuesPanel() {
    if (this.totalOpenIssues === 0) return;
    
    this.sidePanelTitle = 'All Open Issues';
    this.sidePanelDate = '';
    this.sidePanelType = 'clientIssue';
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.selectedIssueCategory = '';
    
    const allProfileIds = [...new Set(this.clientIssues.map(issue => issue.profileid).filter(id => id))];
    this.updatePanelParticipantsWithIssues(allProfileIds, '');
    this.isSidePanelOpen = true;
  }

  // New method to update panel participants with their issues
  private updatePanelParticipantsWithIssues(profileIds: string[], category: string) {
    this.panelParticipantsWithIssues = profileIds.map(profileId => {
      const participant = this.buildParticipantFromProfileId(profileId, true);
      
      // Get issues for this participant
      let participantIssues = this.clientIssues.filter(issue => issue.profileid === profileId);
      if (category) {
        participantIssues = participantIssues.filter(issue => issue.category === category);
      }
      
      return {
        ...participant,
        issues: participantIssues
      } as ParticipantWithIssues;
    });
    
    this.panelParticipantsWithIssues.sort((a, b) => {
      // Sort by number of issues descending, then by name
      const issuesDiff = (b.issues?.length || 0) - (a.issues?.length || 0);
      if (issuesDiff !== 0) return issuesDiff;
      return a.name.localeCompare(b.name);
    });
    
    // Also update panelParticipants for filtering
    this.panelParticipants = this.panelParticipantsWithIssues;
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  openJourneyPanel(journeyCount: JourneyCount) {
    if (journeyCount.count === 0) return;
    
    this.sidePanelTitle = journeyCount.journeyName;
    this.sidePanelDate = '';
    this.sidePanelType = 'journey';
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.selectedJourneyId = journeyCount.journeyId;
    
    this.updatePanelParticipants(journeyCount.profileIds, true);
    this.isSidePanelOpen = true;
  }

  openAllJourneysPanel() {
    if (this.totalJourneyParticipants === 0) return;
    
    this.sidePanelTitle = 'All Journey Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'journey';
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.selectedJourneyId = '';
    
    const allProfileIds = this.journeyCounts.flatMap(j => j.profileIds);
    const uniqueProfileIds = [...new Set(allProfileIds)];
    this.updatePanelParticipants(uniqueProfileIds, true);
    this.isSidePanelOpen = true;
  }

  refreshJourneyPanel() {
    if (this.selectedJourneyId) {
      const journeyCount = this.journeyCounts.find(j => j.journeyId === this.selectedJourneyId);
      if (journeyCount) {
        this.updatePanelParticipants(journeyCount.profileIds, true);
      }
    } else {
      const allProfileIds = this.journeyCounts.flatMap(j => j.profileIds);
      const uniqueProfileIds = [...new Set(allProfileIds)];
      this.updatePanelParticipants(uniqueProfileIds, true);
    }
  }

  // openNotScannedPanel() {
  //   if (this.notScannedCount === 0) return;
    
  //   this.sidePanelTitle = 'Not Scanned';
  //   this.sidePanelDate = '';
  //   this.sidePanelType = 'notScanned';
  //   this.sidePanelDayIndex = -1;
  //   this.participantSearchTerm = '';
  //   this.participantFilter = 'all';
  //   this.selectAll = false;
  //   this.notRegisteredCount = 0;
    
  //   this.panelParticipants = this.notScannedProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, false));
  //   this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
  //   this.applyParticipantFilters();
  //   this.isSidePanelOpen = true;
  // }

  openScannedPanel() {
    if (this.scannedCount === 0) return;
    
    this.sidePanelTitle = 'Scanned Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'scanned' as any;
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.notRegisteredCount = 0;
    
    this.panelParticipants = this.scannedProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, true));
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  private updatePanelParticipants(profileIds: string[], isPresent: boolean, sortNotRegisteredFirst: boolean = true) {
    this.panelParticipants = profileIds.map(profileId => this.buildParticipantFromProfileId(profileId, isPresent));
    
    if (sortNotRegisteredFirst) {
      this.panelParticipants.sort((a, b) => {
        if (a.isNotRegistered && !b.isNotRegistered) return -1;
        if (!a.isNotRegistered && b.isNotRegistered) return 1;
        return a.name.localeCompare(b.name);
      });
    } else {
      this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  getCategoryColor(index: number): string {
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
    return colors[index % colors.length];
  }

  getJourneyColor(index: number): string {
    const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6'];
    return colors[index % colors.length];
  }

  generateDayWiseStructure() {
    if (!this.selectedEvent) return;
    
    const startDate = this.selectedEvent['start_date']?.toDate ? this.selectedEvent['start_date'].toDate() : new Date(this.selectedEvent['start_date']);
    const endDate = this.selectedEvent['end_date']?.toDate ? this.selectedEvent['end_date'].toDate() : new Date(this.selectedEvent['end_date']);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    this.dayWiseAttendance = [];
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    let dayNumber = 1;
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toLocaleDateString('en-CA');
      const todayStr = today.toLocaleDateString('en-CA');
      const isToday = dateStr === todayStr;
      
      this.dayWiseAttendance.push({
        day: dayNumber, date: dateStr, displayLabel: isToday ? 'Today' : 'DAY ' + dayNumber,
        count: 0, percentage: 0, isToday: isToday, isPast: currentDate < today,
        isFuture: currentDate > today, presentProfileIds: [], absentProfileIds: []
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
      dayNumber++;
    }
  }

  get getEventDatesUntilToday(): string[] {
    const today = new Date().toLocaleDateString('en-CA');
    return this.dayWiseAttendance.filter(d => d.date <= today).map(d => d.date);
  }

  subscribeToAttendance() {
    if (!this.selectedEvent) return;
    
    if (this.attendanceSubscription) {
      this.attendanceSubscription.unsubscribe();
    }
    
    this.attendanceSubscription = collectionData(
      query(collection(this.firestoreDefault, 'arena e-ticket log'), where('eventref', '==', this.selectedEvent.docref))
    ).subscribe({
      next: (list) => {
        this.mapAttendence = {};
        
        for (let i = 0; i < list.length; i++) {
          const element = list[i];
          const profileId = element['profileid'];
          this.mapAttendence[profileId] = this.mapAttendence[profileId] || [];
          const existingDates = this.mapAttendence[profileId].map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA'));
          const logDate = new Date(element['logdate'].toDate()).toLocaleDateString('en-CA');
          if (!existingDates.includes(logDate)) {
            this.mapAttendence[profileId].push(element);
          }
        }
        
        this.dayWiseAttendance.forEach(day => {
          day.presentProfileIds = [];
          day.absentProfileIds = [];
          
          Object.keys(this.mapAttendence).forEach(profileId => {
            const attendedDates = this.mapAttendence[profileId].map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA'));
            if (attendedDates.includes(day.date)) {
              day.presentProfileIds.push(profileId);
            }
          });
          
          day.absentProfileIds = this.eventParticipantProfileIds.filter(profileId => !day.presentProfileIds.includes(profileId));
          day.count = day.presentProfileIds.length;
          const registeredAttendees = day.presentProfileIds.filter(id => this.eventParticipantProfileIds.includes(id)).length;
          day.percentage = this.registeredCount > 0 ? Math.round((registeredAttendees / this.registeredCount) * 100) : 0;
        });
        
        const todayStr = new Date().toLocaleDateString('en-CA');
        const todayDay = this.dayWiseAttendance.find(d => d.date === todayStr);
        this.todayAttendence = todayDay ? todayDay.count : 0;
        
        this.allDayAbsentProfileIds = this.eventParticipantProfileIds.filter(profileId => {
          const attendanceDates = this.mapAttendence[profileId]?.map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA')) || [];
          return this.getEventDatesUntilToday.every(date => !attendanceDates.includes(date));
        });
        
        this.allDayAbsent = this.allDayAbsentProfileIds.length;
        this.isLoadingAttendance = false;
        
        // Recalculate attendance-dependent widgets
        this.calculateCameDay1NotToday();
        this.calculateIrregularParticipants();
        
        if (this.isSidePanelOpen) {
          this.refreshSidePanelData();
        }
      },
      error: (error) => {
        console.error('Error subscribing to attendance:', error);
        this.isLoadingAttendance = false;
      }
    });
  }

  subscribeToETickets() {
    if (!this.selectedEvent) return;
    
    if (this.eTicketSubscription) {
      this.eTicketSubscription.unsubscribe();
    }
    
    this.eTicketSubscription = collectionData(
      query(collection(this.firestoreDefault, 'arena e-ticket'), where('eventref', '==', this.selectedEvent.docref),where('active','==',true))
    ).subscribe({
      next: (list) => {
        const scannedProfileIds = new Set<string>();
        
        for (let i = 0; i < list.length; i++) {
          const element = list[i];
          const profileId = element['profileid'];
          if (profileId) {
            scannedProfileIds.add(profileId);
          }
        }
        
        this.scannedParticipantProfileIds = [...scannedProfileIds];
        this.scannedProfileIds = [...scannedProfileIds];
        this.scannedCount = this.scannedProfileIds.length;
        this.notScannedProfileIds = this.eventParticipantProfileIds.filter(profileId => !scannedProfileIds.has(profileId));
        this.notScannedCount = this.notScannedProfileIds.length;
        
        // Recalculate all widgets after e-ticket data is loaded
        this.recalculateAllWidgetsAfterETicket();
        
        if (this.isSidePanelOpen) {
          this.refreshSidePanelData();
        }
      },
      error: (error) => {
        console.error('Error subscribing to e-tickets:', error);
      }
    });
  }

  private recalculateAllWidgetsAfterETicket() {
    // Only recalculate if we have the necessary data
    if (this.scannedProfileIds.length > 0 || this.eventParticipantProfileIds.length > 0) {
      this.calculateJourneyCounts();
      this.calculateNonCohortParticipants();
      this.calculateNoZoneParticipants();
      this.calculateCameDay1NotToday();
      this.calculateIrregularParticipants();
      this.calculateChangeWorkOverview();
      this.calculateLiveCWDisplayList();
      this.calculateFirstTimeTagsData();
      this.recalculateActionQueueData();
      this.recalculateVideoAskCounts();
      this.recalculateAtcCounts();
      this.recalculateParticipantHistoryCounts();
      this.calculateDraftAtcParticipants(); // Add this line
    }
  }

  private recalculateAllWidgetsAfterAttendance() {
    // Only recalculate if we have the necessary data
    if (this.scannedProfileIds.length > 0 || this.eventParticipantProfileIds.length > 0) {
      this.calculateJourneyCounts();
      this.calculateNonCohortParticipants();
      this.calculateNoZoneParticipants();
      this.calculateCameDay1NotToday();
      this.calculateIrregularParticipants();
      this.calculateChangeWorkOverview();
      this.calculateLiveCWDisplayList();
      this.calculateFirstTimeTagsData();
      this.recalculateActionQueueData();
      this.recalculateVideoAskCounts();
      this.recalculateAtcCounts();
      this.recalculateParticipantHistoryCounts();
    }
  }

  private refreshSidePanelData() {
    switch (this.sidePanelType) {
      case 'day':
        if (this.sidePanelDayIndex >= 0 && this.sidePanelDayIndex < this.dayWiseAttendance.length) {
          const day = this.dayWiseAttendance[this.sidePanelDayIndex];
          this.refreshDayPanel(day);
        }
        break;
      case 'absent': this.refreshAbsentPanel(); break;
      case 'registered': this.refreshRegisteredPanel(); break;
      case 'atcCompleted': this.refreshAtcCompletedPanel(); break;
      case 'atcToValidate': this.refreshAtcToValidatePanel(); break;
      case 'atcNotCompleted': this.refreshAtcNotCompletedPanel(); break;
      case 'overallVideoAsk': this.refreshOverallVideoAskPanel(); break;
      case 'todayVideoAsk': this.refreshTodayVideoAskPanel(); break;
      case 'clientIssue': this.refreshClientIssuePanel(); break;
      case 'journey': this.refreshJourneyPanel(); break;
      case 'noZone':
        this.refreshNoZonePanel();
      break;
      case 'scanned':
        this.panelParticipants = this.scannedProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, true));
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
      break;
      case 'notScanned':
        this.panelParticipants = this.notScannedProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, false));
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.applyParticipantFilters();
        break;
      case 'cwNotDoneOthers': this.refreshCWNotDoneOthersPanel(); break;
      case 'cwNotDoneSelf': this.refreshCWNotDoneSelfPanel(); break;
      case 'cwNonAtc': this.refreshCWNonAtcPanel(); break;
      case 'draftAtc':this.refreshDraftAtcPanel();break;
      case 'cwLive': this.refreshCWLivePanel(); break;
      case 'journeyMissing': 
        this.panelParticipants = this.missingJourneyProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, false));
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'newParticipants':this.refreshNewParticipantsPanel();break;
      case 'nonCohort':this.refreshNonCohortPanel();break;
      case 'firstTime':
        this.panelParticipants = this.firstTimeProfileIds.map(profileId => 
          this.buildParticipantFromProfileId(profileId, true)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'secondTime':
        this.panelParticipants = this.secondTimeProfileIds.map(profileId => 
          this.buildParticipantFromProfileId(profileId, true)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'actionQueue':
        if (this.actionQueueSelectedTag) {
          const participants = this.actionQueueData[this.actionQueueSelectedTag] || [];
          this.panelParticipants = participants.map(p =>
            this.buildParticipantFromProfileId(p.profileId, true)
          );
          this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
          this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
          this.applyParticipantFilters();
        }
        break;
      case 'irregular':
        this.panelParticipants = this.irregularParticipants.map(p =>
          this.buildParticipantFromProfileId(p.profileId, false)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'arenaNotDoingCW':
        this.panelParticipants = this.changeWorkOverview.notDoneOthersProfileIds.map(profileId =>
          this.buildParticipantFromProfileId(profileId, false)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'arenaCWNotReceived':
        this.panelParticipants = this.changeWorkOverview.notDoneSelfProfileIds.map(profileId =>
          this.buildParticipantFromProfileId(profileId, false)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'arenaLiveCW':
        const doerIds = [...new Set(this.liveCWDisplayList.map(item => item.doerId))];
        this.panelParticipants = doerIds.map(profileId =>
          this.buildParticipantFromProfileId(profileId, true)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'registeredNotCome':
      case 'notFinance':
        this.panelParticipants = this.notScannedProfileIds.map(profileId =>
          this.buildParticipantFromProfileId(profileId, false)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'cameDay1NotToday':
        this.panelParticipants = this.cameDay1NotTodayParticipants.map(p =>
          this.buildParticipantFromProfileId(p.profileId, false)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'noCohort':
        this.panelParticipants = this.nonCohortProfileIds.map(profileId =>
          this.buildParticipantFromProfileId(profileId, false)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'noAtc':
        this.panelParticipants = this.arenaOverview.atcNotCompletedProfileIds.map(profileId =>
          this.buildParticipantFromProfileId(profileId, false)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = 0;
        this.applyParticipantFilters();
        break;
      case 'firstTimeTag':
      if (this.firstTimeTagsSelectedTag) {
        const participants = this.firstTimeTagsData[this.firstTimeTagsSelectedTag] || [];
        this.panelParticipants = participants.map(p => 
          this.buildParticipantFromProfileId(p.profileId, true)
        );
        this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
        this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
        this.applyParticipantFilters();
      }
      break;
      case 'overallVideoAsk':
      const overallProfileIds = this.participantViewMode === 'scanned' 
        ? this.filteredArenaOverview.overallVideoAskProfileIds 
        : this.arenaOverview.overallVideoAskProfileIds;
      const overallReviewedIds = this.participantViewMode === 'scanned'
        ? this.filteredArenaOverview.overallVideoAskReviewedProfileIds
        : this.arenaOverview.overallVideoAskReviewedProfileIds;
      this.panelParticipants = overallProfileIds.map(profileId => {
        const isReviewed = overallReviewedIds.includes(profileId);
        return this.buildParticipantFromProfileId(profileId, isReviewed);
      });
      this.panelParticipants.sort((a, b) => { 
        if (a.isNotRegistered && !b.isNotRegistered) return -1; 
        if (!a.isNotRegistered && b.isNotRegistered) return 1; 
        return a.name.localeCompare(b.name); 
      });
      this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
      this.applyParticipantFilters();
      break;

      case 'todayVideoAsk':
      const todayProfileIds = this.participantViewMode === 'scanned' 
        ? this.filteredArenaOverview.todayVideoAskProfileIds 
        : this.arenaOverview.todayVideoAskProfileIds;
      const todayReviewedIds = this.participantViewMode === 'scanned'
        ? this.filteredArenaOverview.todayVideoAskReviewedProfileIds
        : this.arenaOverview.todayVideoAskReviewedProfileIds;
      this.panelParticipants = todayProfileIds.map(profileId => {
        const isReviewed = todayReviewedIds.includes(profileId);
        return this.buildParticipantFromProfileId(profileId, isReviewed);
      });
      this.panelParticipants.sort((a, b) => { 
        if (a.isNotRegistered && !b.isNotRegistered) return -1; 
        if (!a.isNotRegistered && b.isNotRegistered) return 1; 
        return a.name.localeCompare(b.name); 
      });
      this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
      this.applyParticipantFilters();
      break;
    }
  }
  // Helper method to get issues for a participant
  getParticipantIssues(profileId: string): ClientIssue[] {
    if (this.selectedIssueCategory) {
      return this.clientIssues.filter(
        issue => issue.profileid === profileId && issue.category === this.selectedIssueCategory
      );
    }
    return this.clientIssues.filter(issue => issue.profileid === profileId);
  }

  // Get issue status color
  getIssueStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'open': return '#dc2626';
      case 'in progress': return '#f59e0b';
      case 'resolved': return '#16a34a';
      default: return '#6b7280';
    }
  }

  // private refreshJourneyMissingPanel() {
  //   if (this.selectedJourneyId) {
  //     const journeyCount = this.journeyCounts.find(j => j.journeyId === this.selectedJourneyId);
  //     if (journeyCount) {
  //       this.updatePanelParticipants(journeyCount.missingProfileIds, false);
  //     }
  //   }
  // }


  private refreshDayPanel(day: DayAttendance) {
    const presentParticipants = day.presentProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, true));
    const absentParticipants = day.absentProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, false));
    presentParticipants.sort((a, b) => { 
      if (a.isNotRegistered && !b.isNotRegistered) return -1; 
      if (!a.isNotRegistered && b.isNotRegistered) return 1; 
      return a.name.localeCompare(b.name); 
    });
    absentParticipants.sort((a, b) => a.name.localeCompare(b.name));
    
    this.panelParticipants = [...presentParticipants, ...absentParticipants];
    this.notRegisteredCount = presentParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  private refreshAbsentPanel() {
    this.panelParticipants = this.allDayAbsentProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, false))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
  }

  private refreshRegisteredPanel() {
    this.panelParticipants = this.eventParticipants.map(participant => {
      const attendanceDates = this.mapAttendence[participant.profileid]?.map(e => new Date(e['logdate'].toDate()).toLocaleDateString('en-CA')) || [];
      const hasAttendedAnyDay = attendanceDates.length > 0 && attendanceDates.some(date => this.getEventDatesUntilToday.includes(date));
      return { ...participant, isPresent: hasAttendedAnyDay, isSelected: false, isNotRegistered: false };
    }).sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
  }

  private refreshAtcCompletedPanel() {
    this.updatePanelParticipants(this.arenaOverview.atcCompletedProfileIds, true);
  }

  private refreshAtcToValidatePanel() {
    this.updatePanelParticipants(this.arenaOverview.atcToValidateProfileIds, true);
  }

  private refreshAtcNotCompletedPanel() {
    this.panelParticipants = this.arenaOverview.atcNotCompletedProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, false));
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
  }

  private refreshOverallVideoAskPanel() {
    this.panelParticipants = this.arenaOverview.overallVideoAskProfileIds.map(profileId => {
      const isReviewed = this.arenaOverview.overallVideoAskReviewedProfileIds.includes(profileId);
      return this.buildParticipantFromProfileId(profileId, isReviewed);
    });
    this.panelParticipants.sort((a, b) => { 
      if (a.isNotRegistered && !b.isNotRegistered) return -1; 
      if (!a.isNotRegistered && b.isNotRegistered) return 1; 
      return a.name.localeCompare(b.name); 
    });
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  private refreshTodayVideoAskPanel() {
    this.panelParticipants = this.arenaOverview.todayVideoAskProfileIds.map(profileId => {
      const isReviewed = this.arenaOverview.todayVideoAskReviewedProfileIds.includes(profileId);
      return this.buildParticipantFromProfileId(profileId, isReviewed);
    });
    this.panelParticipants.sort((a, b) => { 
      if (a.isNotRegistered && !b.isNotRegistered) return -1; 
      if (!a.isNotRegistered && b.isNotRegistered) return 1; 
      return a.name.localeCompare(b.name); 
    });
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  resetArenaOverview() {
    this.arenaOverview = {
      atcCompleted: 0, atcCompletedProfileIds: [], atcCompletedDocs: [],
      atcToValidate: 0, atcToValidateProfileIds: [], atcToValidateDocs: [],
      atcNotCompleted: 0, atcNotCompletedProfileIds: [],
      overallVideoAsk: 0, overallVideoAskPercentage: 0, overallVideoAskProfileIds: [], overallVideoAskReviewedProfileIds: [],
      todayVideoAsk: 0, todayVideoAskPercentage: 0, todayVideoAskProfileIds: [], todayVideoAskReviewedProfileIds: []
    };
  }

  isDateInQueueRange(prescriptionDate: any): boolean {
    if (!this.queueRangeStartDate || !this.queueRangeEndDate || !prescriptionDate) return false;
    const prescDate = prescriptionDate?.toDate ? prescriptionDate.toDate() : new Date(prescriptionDate);
    return prescDate >= this.queueRangeStartDate && prescDate <= this.queueRangeEndDate;
  }

  async loadQueuevariation() {
    if (this.selectedQueues.length === 0) return;
    this.atcModels = [];
    
    try {
      const variationPromises = this.selectedQueueRefs.map(queueRef => 
        getDocs(query(collection(this.firestoreDefault, 'queue variation'), where('queueref', '==', queueRef)))
      );
      
      const variationSnapshots = await Promise.all(variationPromises);
      let models: string[] = [];
      
      variationSnapshots.forEach(variationSnapshot => {
        variationSnapshot.docs.forEach((doc) => { 
          models.push(doc.data()['atcmodel']); 
        });
      });
      
      this.atcModels = [...new Set(models)];
      this.subscribeToArenaOverview();
      this.subscribeToChangeWork();
    } catch (error) {
      console.error('Error loading queue variation:', error);
    } finally {
      this.isLoadingQueues = false;
    }
  }

  // Update subscribeToArenaOverview - remove VideoAsk subscription from here
  subscribeToArenaOverview() {
    if (this.selectedQueues.length === 0 || !this.selectedEvent || this.atcModels.length === 0) { 
      this.resetArenaOverview(); 
      return; 
    }
    
    this.isLoadingArenaOverview = true;
    
    // Unsubscribe only ATC subscriptions
    if (this.atcCompletedSubscription) {
      this.atcCompletedSubscription.unsubscribe();
      this.atcCompletedSubscription = null;
    }
    if (this.atcToValidateSubscription) {
      this.atcToValidateSubscription.unsubscribe();
      this.atcToValidateSubscription = null;
    }
    
    this.atcCompletedSubscription = collectionData(
      query(collection(this.firestoreATC, 'atc_alpha'), where('product', 'in', this.atcModels))
    ).subscribe({
      next: (docs) => {
        const atcCompletedDocs: AtcDocument[] = [];
        const atcCompletedProfileIds: string[] = [];
        
        docs.forEach((doc: any) => {
          if (this.isDateInQueueRange(doc['prescription_date'])) {
            const profileId = doc['profileid'] || '';
            if (profileId && this.eventParticipantProfileIds.includes(profileId)) {
              atcCompletedDocs.push({ docref: doc.id || '', profileid: profileId, prescription_date: doc['prescription_date'], ...doc });
              if (!atcCompletedProfileIds.includes(profileId)) atcCompletedProfileIds.push(profileId);
            }
          }
        });
        
        this.arenaOverview.atcCompleted = atcCompletedDocs.length;
        this.arenaOverview.atcCompletedProfileIds = atcCompletedProfileIds;
        this.arenaOverview.atcCompletedDocs = atcCompletedDocs;
        
        this.updateAtcNotCompleted();
        this.recalculateAtcCounts(); // Add this line
        this.isLoadingArenaOverview = false;
        
        if (this.isSidePanelOpen && (this.sidePanelType === 'atcCompleted' || this.sidePanelType === 'atcNotCompleted')) {
          this.refreshSidePanelData();
        }
      },
      error: (error) => console.error('Error subscribing to ATC completed:', error)
    });
    
    this.atcToValidateSubscription = collectionData(
      query(collection(this.firestoreATC, 'atc_to_validate'), where('product', 'in', this.atcModels))
    ).subscribe({
      next: (docs) => {
        const atcToValidateDocs: AtcDocument[] = [];
        const atcToValidateProfileIds: string[] = [];
        
        docs.forEach((doc: any) => {
          if (this.isDateInQueueRange(doc['prescription_date'])) {
            const profileId = doc['profileid'] || '';
            if (profileId && this.eventParticipantProfileIds.includes(profileId)) {
              atcToValidateDocs.push({ docref: doc.id || '', profileid: profileId, prescription_date: doc['prescription_date'], ...doc });
              if (!atcToValidateProfileIds.includes(profileId)) atcToValidateProfileIds.push(profileId);
            }
          }
        });
        
        this.arenaOverview.atcToValidate = atcToValidateDocs.length;
        this.arenaOverview.atcToValidateProfileIds = atcToValidateProfileIds;
        this.arenaOverview.atcToValidateDocs = atcToValidateDocs;
        
        this.updateAtcNotCompleted();
        this.recalculateAtcCounts(); // Add this line
        
        if (this.isSidePanelOpen && (this.sidePanelType === 'atcToValidate' || this.sidePanelType === 'atcNotCompleted')) {
          this.refreshSidePanelData();
        }
      },
      error: (error) => console.error('Error subscribing to ATC to validate:', error)
    });
  }

  private updateAtcNotCompleted() {
    const allAtcProfileIds = [...new Set([...this.arenaOverview.atcCompletedProfileIds, ...this.arenaOverview.atcToValidateProfileIds])];
    this.arenaOverview.atcNotCompletedProfileIds = this.eventParticipantProfileIds.filter(profileId => !allAtcProfileIds.includes(profileId));
    this.arenaOverview.atcNotCompleted = this.arenaOverview.atcNotCompletedProfileIds.length;
  }

  private async subscribeToVideoAsk(todayStr: string) {
    if (!this.selectedEvent) return;
    
    // Unsubscribe existing videoAsk subscription
    if (this.videoAskSubscription) {
      this.videoAskSubscription.unsubscribe();
      this.videoAskSubscription = null;
    }
    
    try {
      const videoAskSnapshot = await getDocs(query(collection(this.firestoreDefault, 'arenavideoask'), where('eventref', '==', this.selectedEvent.docref)));
      const arenavideoAskId: string[] = [];
      videoAskSnapshot.docs.forEach((doc) => { arenavideoAskId.push(doc.id); });
      
      if (arenavideoAskId.length > 0) {
        this.videoAskSubscription = collectionData(
          query(collection(this.firestoreDefault, 'participantvideoask'), where('videoaskid', 'in', arenavideoAskId))
        ).subscribe({
          next: (docs) => {
            const allVideoAskProfileIds: string[] = [];
            const reviewedVideoAskProfileIds: string[] = [];
            const todayVideoAskProfileIds: string[] = [];
            const todayReviewedVideoAskProfileIds: string[] = [];
            
            docs.forEach((doc: any) => {
              const profileId = doc['profileid'] || '';
              const isReviewed = doc['status'] === 'reviewed' || doc['reviewed'] === true;
              const createdAt = doc['uploaded']?.toDate ? doc['uploaded'].toDate() : null;
              const isToday = createdAt ? createdAt.toLocaleDateString('en-CA') === todayStr : false;
              
              if (profileId) {
                if (!allVideoAskProfileIds.includes(profileId)) allVideoAskProfileIds.push(profileId);
                if (isReviewed && !reviewedVideoAskProfileIds.includes(profileId)) reviewedVideoAskProfileIds.push(profileId);
                if (isToday) {
                  if (!todayVideoAskProfileIds.includes(profileId)) todayVideoAskProfileIds.push(profileId);
                  if (isReviewed && !todayReviewedVideoAskProfileIds.includes(profileId)) todayReviewedVideoAskProfileIds.push(profileId);
                }
              }
            });
            
            this.arenaOverview.overallVideoAsk = allVideoAskProfileIds.length;
            this.arenaOverview.overallVideoAskProfileIds = allVideoAskProfileIds;
            this.arenaOverview.overallVideoAskReviewedProfileIds = reviewedVideoAskProfileIds;
            this.arenaOverview.overallVideoAskPercentage = allVideoAskProfileIds.length > 0 ? Math.round((reviewedVideoAskProfileIds.length / allVideoAskProfileIds.length) * 100) : 0;
            this.arenaOverview.todayVideoAsk = todayVideoAskProfileIds.length;
            this.arenaOverview.todayVideoAskProfileIds = todayVideoAskProfileIds;
            this.arenaOverview.todayVideoAskReviewedProfileIds = todayReviewedVideoAskProfileIds;
            this.arenaOverview.todayVideoAskPercentage = todayVideoAskProfileIds.length > 0 ? Math.round((todayReviewedVideoAskProfileIds.length / todayVideoAskProfileIds.length) * 100) : 0;
            
            // Recalculate video ask counts based on current view mode
            this.recalculateVideoAskCounts();
            
            if (this.isSidePanelOpen && (this.sidePanelType === 'overallVideoAsk' || this.sidePanelType === 'todayVideoAsk')) {
              this.refreshSidePanelData();
            }
          },
          error: (error) => console.error('Error subscribing to video ask:', error)
        });
      } else {
        this.arenaOverview.overallVideoAsk = 0;
        this.arenaOverview.overallVideoAskProfileIds = [];
        this.arenaOverview.overallVideoAskReviewedProfileIds = [];
        this.arenaOverview.overallVideoAskPercentage = 0;
        this.arenaOverview.todayVideoAsk = 0;
        this.arenaOverview.todayVideoAskProfileIds = [];
        this.arenaOverview.todayVideoAskReviewedProfileIds = [];
        this.arenaOverview.todayVideoAskPercentage = 0;
        
        // Also reset filtered values
        this.recalculateVideoAskCounts();
      }
    } catch (error) {
      console.error('Error loading arena video ask:', error);
    }
  }

  buildParticipantFromProfileId(profileId: string, isPresent: boolean): Participant {
    const metadata = this.participantMetadataMap[profileId] || {};
    const registeredParticipant = this.eventParticipants.find(p => p.profileid === profileId);
    const isNotRegistered = !this.eventParticipantProfileIds.includes(profileId);
    
    return {
      docref: registeredParticipant?.docref || profileId,
      profileid: profileId,
      name: metadata['name'] || registeredParticipant?.name || 'Unknown',
      email: metadata['email'] || registeredParticipant?.email || '',
      phone: metadata['phone'] || registeredParticipant?.phone || '',
      photo: metadata['photo'] || registeredParticipant?.photo || '',
      activejourney: metadata['activejourney'] || registeredParticipant?.activejourney || '',
      profiletags: metadata['profiletags'] || registeredParticipant?.profiletags || [],
      isPresent: isPresent, isSelected: false, isNotRegistered: isNotRegistered
    };
  }

  openDayPanel(day: DayAttendance) {
    if (day.isFuture) return;
    
    this.sidePanelTitle = day.displayLabel;
    this.sidePanelDate = day.date;
    this.sidePanelType = 'day';
    this.sidePanelDayIndex = this.dayWiseAttendance.findIndex(d => d.date === day.date);
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshDayPanel(day);
    this.isSidePanelOpen = true;
  }

  openAbsentPanel() {
    this.sidePanelTitle = 'All Day Absent';
    this.sidePanelDate = '';
    this.sidePanelType = 'absent';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.notRegisteredCount = 0;
    
    this.refreshAbsentPanel();
    this.isSidePanelOpen = true;
  }

  openRegisteredPanel() {
    this.sidePanelTitle = 'Registered Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'registered';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.registeredPanelFilter = 'all'; // Reset this filter
    this.selectAll = false;
    this.notRegisteredCount = 0;
    
    this.refreshRegisteredPanel();
    this.isSidePanelOpen = true;
  }

  openOverallVideoAskPanel() {
    this.sidePanelTitle = 'Overall Video Ask';
    this.sidePanelDate = '';
    this.sidePanelType = 'overallVideoAsk';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    const profileIds = this.participantViewMode === 'scanned' 
      ? this.filteredArenaOverview.overallVideoAskProfileIds 
      : this.arenaOverview.overallVideoAskProfileIds;
    const reviewedIds = this.participantViewMode === 'scanned'
      ? this.filteredArenaOverview.overallVideoAskReviewedProfileIds
      : this.arenaOverview.overallVideoAskReviewedProfileIds;
    
    this.panelParticipants = profileIds.map(profileId => {
      const isReviewed = reviewedIds.includes(profileId);
      return this.buildParticipantFromProfileId(profileId, isReviewed);
    });
    this.panelParticipants.sort((a, b) => { 
      if (a.isNotRegistered && !b.isNotRegistered) return -1; 
      if (!a.isNotRegistered && b.isNotRegistered) return 1; 
      return a.name.localeCompare(b.name); 
    });
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openTodayVideoAskPanel() {
    this.sidePanelTitle = "Today's Video Ask";
    this.sidePanelDate = new Date().toLocaleDateString('en-CA');
    this.sidePanelType = 'todayVideoAsk';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    const profileIds = this.participantViewMode === 'scanned' 
      ? this.filteredArenaOverview.todayVideoAskProfileIds 
      : this.arenaOverview.todayVideoAskProfileIds;
    const reviewedIds = this.participantViewMode === 'scanned'
      ? this.filteredArenaOverview.todayVideoAskReviewedProfileIds
      : this.arenaOverview.todayVideoAskReviewedProfileIds;
    
    this.panelParticipants = profileIds.map(profileId => {
      const isReviewed = reviewedIds.includes(profileId);
      return this.buildParticipantFromProfileId(profileId, isReviewed);
    });
    this.panelParticipants.sort((a, b) => { 
      if (a.isNotRegistered && !b.isNotRegistered) return -1; 
      if (!a.isNotRegistered && b.isNotRegistered) return 1; 
      return a.name.localeCompare(b.name); 
    });
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openAtcCompletedPanel() {
    this.sidePanelTitle = 'ATC Completed';
    this.sidePanelDate = '';
    this.sidePanelType = 'atcCompleted';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.refreshAtcCompletedPanel();
    this.isSidePanelOpen = true;
  }

  openAtcToValidatePanel() {
    this.sidePanelTitle = 'ATC to Validate';
    this.sidePanelDate = '';
    this.sidePanelType = 'atcToValidate';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.refreshAtcToValidatePanel();
    this.isSidePanelOpen = true;
  }

  openAtcNotCompletedPanel() {
    this.sidePanelTitle = 'ATC Not Completed';
    this.sidePanelDate = '';
    this.sidePanelType = 'atcNotCompleted';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.refreshAtcNotCompletedPanel();
    this.isSidePanelOpen = true;
  }

  closeSidePanel() {
    this.isSidePanelOpen = false;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.registeredPanelFilter = 'all';
    this.selectAll = false;
    this.panelParticipants.forEach(p => p.isSelected = false);
    this.selectedParticipantsCount = 0;
    this.notRegisteredCount = 0;
    this.sidePanelDayIndex = -1;
    this.selectedTags = [];
  }

  // Update applyParticipantFilters to handle newParticipants type
  applyParticipantFilters() {
    let filtered = [...this.panelParticipants];
    
    // Special handling for registered panel with scanned/notScanned filter
    if (this.sidePanelType === 'registered') {
      if (this.registeredPanelFilter === 'scanned') {
        filtered = filtered.filter(p => this.scannedProfileIds.includes(p.profileid));
      } else if (this.registeredPanelFilter === 'notScanned') {
        filtered = filtered.filter(p => !this.scannedProfileIds.includes(p.profileid));
      }
      // Also apply the presence filter if not 'all'
      if (this.participantFilter === 'present') {
        filtered = filtered.filter(p => p.isPresent);
      } else if (this.participantFilter === 'absent') {
        filtered = filtered.filter(p => !p.isPresent);
      }
    } else if (this.sidePanelType === 'absent' || this.sidePanelType === 'atcNotCompleted' || 
      this.sidePanelType === 'notScanned' || this.sidePanelType === 'scanned' || 
      this.sidePanelType === 'journeyMissing' || 
      this.sidePanelType === 'nonCohort' || this.sidePanelType === 'actionQueue' ||
      this.sidePanelType === 'irregular' || this.sidePanelType === 'arenaNotDoingCW' ||
      this.sidePanelType === 'arenaCWNotReceived' || this.sidePanelType === 'arenaLiveCW' ||
      this.sidePanelType === 'registeredNotCome' || this.sidePanelType === 'notFinance' ||
      this.sidePanelType === 'cameDay1NotToday' || this.sidePanelType === 'noCohort' ||
      this.sidePanelType === 'noAtc' || this.sidePanelType === 'firstTimeTag' || 
      this.sidePanelType === 'noZone' || this.sidePanelType === 'draftAtc') {
      // These panels show participants who are missing/absent - no filter needed
    } else if (this.sidePanelType === 'overallVideoAsk' || this.sidePanelType === 'todayVideoAsk') {
      if (this.participantFilter === 'present') filtered = filtered.filter(p => p.isPresent);
      else if (this.participantFilter === 'absent') filtered = filtered.filter(p => !p.isPresent);
    } else if (this.sidePanelType === 'newParticipants') {
      if (this.participantFilter === 'present') filtered = filtered.filter(p => p.isPresent);
      else if (this.participantFilter === 'absent') filtered = filtered.filter(p => !p.isPresent);
    } else if (this.sidePanelType !== 'atcCompleted' && this.sidePanelType !== 'atcToValidate' && this.sidePanelType !== 'clientIssue' && this.sidePanelType !== 'journey') {
      if (this.participantFilter === 'present') filtered = filtered.filter(p => p.isPresent);
      else if (this.participantFilter === 'absent') filtered = filtered.filter(p => !p.isPresent);
    }
    
    // Apply tag filter
    if (this.selectedTags.length > 0) {
      filtered = filtered.filter(p => {
        const metadata = this.participantMetadataMap[p.profileid];
        const participantTags = metadata?.profiletags || p.profiletags || [];
        return this.selectedTags.some(tagId => participantTags.includes(tagId));
      });
    }
    
    if (this.participantSearchTerm.trim()) {
      const term = this.participantSearchTerm.toLowerCase().trim();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term) || p.phone.toLowerCase().includes(term));
    }
    
    this.filteredParticipants = filtered;
    this.updateSelectAllState();
  }

  onRegisteredFilterChange() {
    this.applyParticipantFilters();
  }

  // Helper method to get formatted date for new participants
  getNewParticipantCreatedDate(participant: Participant): Date | null {
    const created = participant['created'];
    if (!created) return null;
    return created?.toDate ? created.toDate() : new Date(created);
  }

  onParticipantSearchChange() { this.applyParticipantFilters(); }
  onFilterChange() { this.applyParticipantFilters(); }

  toggleParticipantSelection(participant: Participant) {
    participant.isSelected = !participant.isSelected;
    this.updateSelectedCount();
    this.updateSelectAllState();
  }

  toggleSelectAll() {
    this.selectAll = !this.selectAll;
    this.filteredParticipants.forEach(p => p.isSelected = this.selectAll);
    this.updateSelectedCount();
  }

  updateSelectedCount() { this.selectedParticipantsCount = this.panelParticipants.filter(p => p.isSelected).length; }

  updateSelectAllState() {
    if (this.filteredParticipants.length === 0) this.selectAll = false;
    else this.selectAll = this.filteredParticipants.every(p => p.isSelected);
    this.updateSelectedCount();
  }

  getSelectedParticipants(): Participant[] { return this.panelParticipants.filter(p => p.isSelected); }

  // sendNotification() {
  //   const selected = this.getSelectedParticipants();
  //   if (selected.length === 0) { alert('Please select at least one participant'); return; }
  //   console.log('Sending notification to:', selected.map(p => ({ name: p.name, profileid: p.profileid })));
  //   alert('Sending notification to ' + selected.length + ' participant(s)');
  // }

  sendNotification(){
    let dialogRef = this.dialog.open(AhNotificationComponent,{
      width : "60vw",
      maxHeight: "90vh",
      disableClose:true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.unsubscribe$)).subscribe(async result => {
      console.log(result,'send app notificationssss');
      if(result != null && result != undefined){
        var userID = [];
        var profileID = [];
        console.log(this.getSelectedParticipants(),"this.selection.selected");
        // var unsentProfiles = [];
        for (let i = 0; i < this.getSelectedParticipants().length; i++) {
          const selected = this.getSelectedParticipants()[i];
          if(selected["firebaseuserref"] != null){
            profileID.push(selected["profileid"])
          }
          // var profiledata = this.mapProfile[selected["profileid"]]
          // if(profiledata["user_ref"] != null) {
          //   userID.push(profiledata["user_ref"].id);
          //   profileID.push(selected['profileid']);
          // }

          // if(profiledata["user_ref"] == null) {
          //   unsentProfiles.push(profiledata);
          // }
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
        this.guard.saveNotificationRecord({
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
  }

  // sendWhatsApp() {
  //   const selected = this.getSelectedParticipants();
  //   if (selected.length === 0) { alert('Please select at least one participant'); return; }
  //   const phoneNumbers = selected.filter(p => p.phone).map(p => ({ name: p.name, phone: p.phone }));
  //   if (phoneNumbers.length === 0) { alert('No phone numbers available for selected participants'); return; }
  //   console.log('Sending WhatsApp to:', phoneNumbers);
  //   alert('Sending WhatsApp to ' + phoneNumbers.length + ' participant(s)');
  // }

  sendWhatsApp(){
    let dialogRef = this.dialog.open(WatiInputComponent,{
      data : this.getSelectedParticipants(),
      width : "70vw",
      height : "80vh",
      disableClose:true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.unsubscribe$)).subscribe(async result => {
      if(result != null && result != undefined){
        if(result == 'success') {
          this.guard.openSnackBar("Wati Message Sent Successfully", "OK",600);
          if(result['status'] == 'sendtoparticipants'){
            let url:string;

            if(environment.firebase.projectId == 'starlabs-test'){
              url = "https://us-central1-starlabs-test.cloudfunctions.net/sendWhatsAppBroadcast";
            }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
              url = ""
            } 

            const docRef = doc(collection(this.firestoreDefault , 'wati archive'), result['archiveid']);
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
          this.guard.openSnackBar("Sending Wati Message Failed", "OK", 600);
        }
      }
    });
  }

  // sendEmail() {
  //   const selected = this.getSelectedParticipants();
  //   if (selected.length === 0) { alert('Please select at least one participant'); return; }
  //   const emails = selected.filter(p => p.email).map(p => ({ name: p.name, email: p.email }));
  //   if (emails.length === 0) { alert('No email addresses available for selected participants'); return; }
  //   console.log('Sending email to:', emails);
  //   alert('Sending email to ' + emails.length + ' participant(s)');
  // }

  sendEmail(){
    let dialogRef = this.dialog.open(EmailInputComponent,{
      data : this.getSelectedParticipants(),
      minWidth : "600px",
      disableClose:true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.unsubscribe$)).subscribe(async result => {
      if(result != null && result != undefined){
        console.log(result);
        
        const docRef = doc(collection(this.firestoreDefault,"email archive"),result['docid']);
        if(result['status'] == 'queued' || result['status'] == 'send'){
          await setDoc(docRef,result,{merge:true}).then(() => {
            this.guard.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : "Email Sent Successfully", "OK",600);
          }).catch(err => {
            console.log(err);
            this.guard.openSnackBar("Error Sending Email", "OK",600);
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
    });
  }

  getPercentageColor(percentage: number): string {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 70) return 'text-blue-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  }

  onTagDropdownOpen() {
    this.filteredTags = [...this.availableTags];
    this.tagSearchTerm = '';
  }

  filterTags() {
    if (!this.tagSearchTerm || this.tagSearchTerm.trim() === '') {
      this.filteredTags = [...this.availableTags];
    } else {
      const searchTerm = this.tagSearchTerm.toLowerCase().trim();
      this.filteredTags = this.availableTags.filter(tag => {
        const name = (tag.name || '').toLowerCase();
        return name.includes(searchTerm);
      });
    }
  }

  clearTagSearch() {
    this.tagSearchTerm = '';
    this.filteredTags = [...this.availableTags];
  }

  isTagSelected(tagId: string): boolean {
    return this.selectedTags.includes(tagId);
  }

  toggleTagSelection(tagId: string) {
    const index = this.selectedTags.indexOf(tagId);
    if (index > -1) {
      this.selectedTags.splice(index, 1);
    } else {
      this.selectedTags.push(tagId);
    }
    this.onTagFilterChange();
  }

  onTagFilterChange() {
    this.applyParticipantFilters();
  }

  addBulkTags() {
    const selectedParticipants = this.getSelectedParticipants().map(e => ({
      profileid: e['profileid'],
      name: this.participantMetadataMap[e['profileid']]?.['name'],
      email: this.participantMetadataMap[e['profileid']]?.['email']
    }));
    let list = [];
    for (const docid in this.mapTagsName) {      
      list.push(docid);
    }  
      
    this.dialog.open(TagParticipantsComponent, {
      data: {
        data: selectedParticipants,
        tagList: list,
        mapfilter: this.mapTagsName,
        loggedInprofileid: this.loggedInProfileid
      }
    });
  }

  getInitials(text?: string): string {
    if (!text) return '';
    const words = text.trim().split(/\s+/);
    return words.length > 1 ? words.map(w => w[0].toUpperCase()).join('') : text;
  }

  // ChangeWork View Mode Toggle
  setChangeWorkViewMode(mode: 'today' | 'overall') {
    this.changeWorkViewMode = mode;
    this.calculateChangeWorkOverview();
    this.calculateLiveCWDisplayList();
  }

  // Subscribe to ChangeWork collection
  subscribeToChangeWork() {
    if (this.selectedQueues.length === 0 || !this.selectedEvent) { 
      this.resetChangeWorkOverview(); 
      return; 
    }
    
    this.isLoadingCWOverview = true;
    
    if (this.changeWorkSubscription) {
      this.changeWorkSubscription.unsubscribe();
    }
    
    this.changeWorkSubscription = collectionData(
      query(collection(this.firestoreDefault, 'livechangework'))
    ).subscribe({
      next: (docs) => {
        console.log(docs.length);
        
        this.liveChangeWorkDocs = docs.map((doc: any) => ({
          docref: doc.docid || '',
          adjustment: doc.adjustment || '',
          beneficiaryid: doc.beneficiaryid || '',
          beneficiarystatus: doc.beneficiarystatus || null,
          createdon: doc.createdon,
          docid: doc.docid || '',
          doerid: doc.doerid || '',
          doerstatus: doc.doerstatus || null,
          participantsinvolved: doc.participantsinvolved || [],
          procedurestatus: doc.procedurestatus || '',
          procedureId: doc.procedureId || '',
          procedurename: doc.procedurename || '',
          procedureRef: doc.procedureRef || null,
          ...doc
        }));
        
        this.calculateChangeWorkOverview();
        this.calculateLiveCWDisplayList();
        this.isLoadingCWOverview = false;
        
        if (this.isSidePanelOpen && ['cwNotDoneOthers', 'cwNotDoneSelf', 'cwNonAtc', 'cwLive'].includes(this.sidePanelType)) {
          this.refreshSidePanelData();
        }
      },
      error: (error) => {
        console.error('Error subscribing to change work:', error);
        this.isLoadingCWOverview = false;
      }
    });
  }

  resetChangeWorkOverview() {
    this.changeWorkOverview = {
      notDoneOthers: 0, notDoneOthersProfileIds: [],
      notDoneSelf: 0, notDoneSelfProfileIds: [],
      nonAtcCW: 0, nonAtcCWProfileIds: [],
      liveCW: 0, liveCWProfileIds: []
    };
    this.liveChangeWorkDocs = [];
    this.liveCWDisplayList = [];
  }

  // Calculate ChangeWork Overview based on view mode
  calculateChangeWorkOverview() {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const currentList = this.getCurrentParticipantList();

    this.changeWorkOverview = {
      notDoneOthers: 0,
      notDoneOthersProfileIds: [],
      notDoneSelf: 0,
      notDoneSelfProfileIds: [],
      nonAtcCW: 0,
      nonAtcCWProfileIds: [],
      liveCW: 0,
      liveCWProfileIds: []
    };

    if (!currentList?.length || !this.liveChangeWorkDocs?.length) {
      return;
    }

    const relevantDocs = this.changeWorkViewMode === 'today'
      ? this.liveChangeWorkDocs.filter(doc => {
          if (!doc.createdon) return false;
          const createdDate = doc.createdon.toDate 
            ? doc.createdon.toDate().toLocaleDateString('en-CA')
            : new Date(doc.createdon).toLocaleDateString('en-CA');
          return createdDate === todayStr;
        })
      : this.liveChangeWorkDocs;

    const doerIdSet = new Set<string>();
    const beneficiaryIdSet = new Set<string>();
    const notatc = new Set<string>();
    const livecw = new Set<string>();

    relevantDocs.forEach(doc => {
      if (doc.doerid) {
        doerIdSet.add(doc.doerid);
      }
      if (doc.beneficiaryid) {
        beneficiaryIdSet.add(doc.beneficiaryid);
      }
      if (doc.procedureRef == null) {
        notatc.add(doc.doerid);
      }
      if (doc.procedurestatus == 'live') {
        livecw.add(doc.doerid);
      }
    });

    currentList.forEach(profileId => {
      if (!doerIdSet.has(profileId)) {
        this.changeWorkOverview.notDoneOthers++;
        this.changeWorkOverview.notDoneOthersProfileIds.push(profileId);
      }

      if (!beneficiaryIdSet.has(profileId)) {
        this.changeWorkOverview.notDoneSelf++;
        this.changeWorkOverview.notDoneSelfProfileIds.push(profileId);
      }

      if (notatc.has(profileId)) {
        this.changeWorkOverview.nonAtcCW++;
        this.changeWorkOverview.nonAtcCWProfileIds.push(profileId);
      }

      if (livecw.has(profileId)) {
        this.changeWorkOverview.liveCW++;
        this.changeWorkOverview.liveCWProfileIds.push(profileId);
      }
    });
  }
  
  // ChangeWork Panel Refresh Methods
  private refreshCWNotDoneOthersPanel() {
    this.panelParticipants = this.changeWorkOverview.notDoneOthersProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, false));
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  private refreshCWNotDoneSelfPanel() {
    this.panelParticipants = this.changeWorkOverview.notDoneSelfProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, false));
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  private refreshCWNonAtcPanel() {
    this.panelParticipants = this.changeWorkOverview.nonAtcCWProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, true));
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  private refreshCWLivePanel() {
    this.panelParticipants = this.changeWorkOverview.liveCWProfileIds.map(profileId => this.buildParticipantFromProfileId(profileId, true));
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  get filteredJourneyCounts(): JourneyCount[] {
    return this.journeyCounts.filter(j => j.count > 0);
  }

  // Getter for filtered category counts (only non-zero)
  get filteredCategoryCounts(): CategoryCount[] {
    return this.categoryCounts.filter(c => c.count > 0);
  }

  // ChangeWork Panel Open Methods - UPDATE THESE
  openCWNotDoneOthersPanel() {
    if (this.changeWorkOverview.notDoneOthers === 0) return;
    
    this.sidePanelTitle = 'CW Not Done - Others';
    this.sidePanelDate = this.changeWorkViewMode === 'today' ? new Date().toLocaleDateString('en-CA') : '';
    this.sidePanelType = 'cwNotDoneOthers';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshCWNotDoneOthersPanel();
    this.isSidePanelOpen = true;
  }

  openCWNotDoneSelfPanel() {
    if (this.changeWorkOverview.notDoneSelf === 0) return;
    
    this.sidePanelTitle = 'CW Not Done - Self';
    this.sidePanelDate = this.changeWorkViewMode === 'today' ? new Date().toLocaleDateString('en-CA') : '';
    this.sidePanelType = 'cwNotDoneSelf';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshCWNotDoneSelfPanel();
    this.isSidePanelOpen = true;
  }

  openCWNonAtcPanel() {
    if (this.changeWorkOverview.nonAtcCW === 0) return;
    
    this.sidePanelTitle = 'Non ATC Change Work';
    this.sidePanelDate = this.changeWorkViewMode === 'today' ? new Date().toLocaleDateString('en-CA') : '';
    this.sidePanelType = 'cwNonAtc';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshCWNonAtcPanel();
    this.isSidePanelOpen = true;
  }

  openCWLivePanel() {
    if (this.changeWorkOverview.liveCW === 0) return;
    
    this.sidePanelTitle = 'Live Change Work';
    this.sidePanelDate = this.changeWorkViewMode === 'today' ? new Date().toLocaleDateString('en-CA') : '';
    this.sidePanelType = 'cwLive';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshCWLivePanel();
    this.isSidePanelOpen = true;
  }

  // // Journey Missing Panel
  // openJourneyMissingPanel(journeyCount: JourneyCount) {
  //   if (journeyCount.missingCount === 0) return;
    
  //   this.sidePanelTitle = 'Missing from ' + journeyCount.journeyName;
  //   this.sidePanelDate = '';
  //   this.sidePanelType = 'journeyMissing';
  //   this.participantSearchTerm = '';
  //   this.participantFilter = 'all';
  //   this.selectAll = false;
  //   this.selectedJourneyId = journeyCount.journeyId;
    
  //   this.updatePanelParticipants(journeyCount.missingProfileIds, false);
  //   this.isSidePanelOpen = true;
  // }

  // Update ngOnDestroy
  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.unsubscribeAll();
    if (this.cohortsSubscription) {
      this.cohortsSubscription.unsubscribe();
    }
    if (this.newUserDataSubscription) {
      this.newUserDataSubscription.unsubscribe();
    }
    if (this.participantHistorySubscription) {
      this.participantHistorySubscription.unsubscribe();
    }
    if (this.actionQueueSubscription) {
      this.actionQueueSubscription.unsubscribe();
    }
    if (this.zonesSubscription) {
      this.zonesSubscription.unsubscribe();
    }
    if (this.eTicketSubscription) {
      this.eTicketSubscription.unsubscribe();
    }
    if (this.draftAtcSubscription) {
      this.draftAtcSubscription.unsubscribe();
    }
  }

  async loadParticipantHistory() {
    if (!this.selectedEvent) return;
    
    this.isLoadingParticipantHistory = true;
    this.firstTimeCount = 0;
    this.firstTimeProfileIds = [];
    this.secondTimeCount = 0;
    this.secondTimeProfileIds = [];
    
    try {
      // Step 1: Find arena events where hero event is true for this event
      const arenaEventsSnapshot = await getDocs(
        query(
          collection(this.firestoreDefault, 'arena events'),
          where('eventref', '==', this.selectedEvent.docref),
          where('heroevent', '==', true)
        )
      );
      
      if (arenaEventsSnapshot.empty) {
        this.isLoadingParticipantHistory = false;
        this.recalculateParticipantHistoryCounts(); // Add this
        return;
      }
      
      // Collect all product ref IDs from arena events (hero events)
      const heroProductIds: string[] = [];
      arenaEventsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data['productref']) {
          // Get the document ID from the reference
          const productId = data['productref'].id || data['productref'];
          if (productId && !heroProductIds.includes(productId)) {
            heroProductIds.push(productId);
          }
        }
      });
      
      if (heroProductIds.length === 0) {
        this.isLoadingParticipantHistory = false;
        this.recalculateParticipantHistoryCounts(); // Add this
        return;
      }
      
      // Step 2: Check each registered participant's consumedproducts in metadata
      this.eventParticipantProfileIds.forEach(profileId => {
        const metadata = this.participantMetadataMap[profileId];
        const consumedProducts: string[] = metadata?.['consumedproducts'] || [];
        
        // Check if any hero product is in consumedproducts
        const hasConsumedHeroProduct = heroProductIds.some(heroProductId => 
          consumedProducts.includes(heroProductId)
        );
        
        if (!hasConsumedHeroProduct) {
          // 1st time participant: hero product NOT in consumedproducts
          this.firstTimeProfileIds.push(profileId);
        } else {
          // 2nd time+ participant: hero product IS in consumedproducts (at least once)
          this.secondTimeProfileIds.push(profileId);
        }
      });
      
      this.firstTimeCount = this.firstTimeProfileIds.length;
      this.secondTimeCount = this.secondTimeProfileIds.length;
      
      // Recalculate based on current view mode
      this.recalculateParticipantHistoryCounts();
      
    } catch (error) {
      console.error('Error loading participant history:', error);
    } finally {
      this.isLoadingParticipantHistory = false;
    }
  }

  openFirstTimeParticipantsPanel() {
    if (this.firstTimeCount === 0) return;
    
    this.sidePanelTitle = '1st Time Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'firstTime' as any;
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.panelParticipants = this.firstTimeProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, true)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openSecondTimeParticipantsPanel() {
    if (this.secondTimeCount === 0) return;
    
    this.sidePanelTitle = '2nd Time+ Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'secondTime' as any;
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.panelParticipants = this.secondTimeProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, true)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  async loadActionQueue() {
    if (!this.selectedEvent) return;
    
    this.isLoadingActionQueue = true;
    this.videoAskTags = [];
    this.actionQueueData = {};
    
    try {
      // Step 1: Fetch videoasktags from classify collection using eventref
      const classifySnapshot = await getDoc(
        doc(collection(this.firestoreDefault, 'classify',),'eventtags')
      );
      
      if (!classifySnapshot.exists()) {
        this.isLoadingActionQueue = false;
        return;
      }
      
      // Get videoasktags from the document
      const classifyDoc = classifySnapshot.data();

      this.videoAskTags = classifyDoc['videoasktags'] || [];
      
      if (this.videoAskTags.length === 0) {
        this.isLoadingActionQueue = false;
        return;
      }
      
      // Initialize actionQueueData with empty arrays for each tag
      this.videoAskTags.forEach(tag => {
        this.actionQueueData[tag] = [];
      });
      
      // Step 2: Subscribe to participantvideoask collection
      this.subscribeToActionQueue();
      
    } catch (error) {
      console.error('Error loading action queue:', error);
      this.isLoadingActionQueue = false;
    }
  }
  subscribeToActionQueue() {
    if (this.actionQueueSubscription) {
      this.actionQueueSubscription.unsubscribe();
      this.actionQueueSubscription = null;
    }
    this.videoAskTags.forEach(tag => {
      this.actionQueueData[tag] = [];
    });
    const currentList = this.getCurrentParticipantList();
    currentList.forEach(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      const videoAskTags = metadata?.['videoasktags'] || [];
      const participantName = metadata?.name || 'Unknown';

      if (videoAskTags.length > 0) {
        videoAskTags.forEach((tag: string) => {
          if (this.videoAskTags.includes(tag)) {
            const existingIndex = this.actionQueueData[tag].findIndex(p => p.profileId === profileId);
            if (existingIndex === -1) {
              this.actionQueueData[tag].push({
                profileId: profileId,
                name: participantName
              });
            }
          }
        });
      }
    });
    this.videoAskTags.forEach(tag => {
      this.actionQueueData[tag].sort((a, b) => a.name.localeCompare(b.name));
    });

    this.isLoadingActionQueue = false;
  }

  // subscribeToActionQueue() {
  //   if (this.actionQueueSubscription) {
  //     this.actionQueueSubscription.unsubscribe();
  //   }
  
  //   // Get arenavideoask IDs for this event (reuse existing logic)
  //   getDocs(query(collection(this.firestoreDefault, 'arenavideoask'), where('eventref', '==', this.selectedEvent!.docref))).then(videoAskSnapshot => {
  //     const arenaVideoAskIds: string[] = [];
  //     videoAskSnapshot.docs.forEach(doc => arenaVideoAskIds.push(doc.id));

  //     if (arenaVideoAskIds.length === 0) {
  //       this.isLoadingActionQueue = false;
  //       return;
  //     }

  //     this.actionQueueSubscription = collectionData(
  //       query(collection(this.firestoreDefault, 'participantvideoask'), where('tags','array-contains-any',this.videoAskTags))
  //     ).subscribe({
  //       next: (docs) => {
  //         // Reset actionQueueData
  //         this.videoAskTags.forEach(tag => {
  //           this.actionQueueData[tag] = [];
  //         });

  //         // Process each participant video ask document
  //         docs.forEach((doc: any) => {
  //           const profileId = doc['profileid'] || '';
  //           const tags = doc['tags'] || [];

  //           if (profileId && tags.length > 0) {
  //             const metadata = this.participantMetadataMap[profileId];
  //             const participantName = metadata?.name || 'Unknown';

  //             // Check each tag and add to appropriate column
  //             tags.forEach((tag: string) => {
  //               if (this.videoAskTags.includes(tag)) {
  //                 // Check if participant is not already in this tag's list
  //                 const existingIndex = this.actionQueueData[tag].findIndex(p => p.profileId === profileId);
  //                 if (existingIndex === -1) {
  //                   this.actionQueueData[tag].push({
  //                     profileId: profileId,
  //                     name: participantName
  //                   });
  //                 }
  //               }
  //             });
  //           }
  //         });

  //         this.isLoadingActionQueue = false;
  //       },
  //       error: (error) => {
  //         console.error('Error subscribing to action queue:', error);
  //         this.isLoadingActionQueue = false;
  //       }
  //     });
  //   })
  //   .catch(error => {
  //     console.error('Error fetching arena video ask:', error);
  //     this.isLoadingActionQueue = false;
  //   });
  // }

  getActionQueueCount(tag: string): number {
    return this.actionQueueData[tag]?.length || 0;
  }

  getTotalActionQueueCount(): number {
    let total = 0;
    this.videoAskTags.forEach(tag => {
      total += this.actionQueueData[tag]?.length || 0;
    });
    return total;
  }

  getTagIcon(tag: string): string {
    const tagLower = tag.toLowerCase();
    if (tagLower.includes('special') && tagLower.includes('cw')) return '🔴';
    if (tagLower.includes('framing')) return '🟡';
    if (tagLower.includes('hpc')) return '🟢';
    if (tagLower.includes('doubtful')) return '❓';
    if (tagLower.includes('poor') || tagLower.includes('video')) return '🎬';
    return '📋';
  }

  getFollowupDayOptions(): { index: number; label: string; date: string }[] {
    const options: { index: number; label: string; date: string }[] = [];
    
    // Add "Current Day" option
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayDay = this.dayWiseAttendance.find(d => d.date === todayStr);
    
    if (todayDay) {
      options.push({ index: -1, label: 'Today', date: todayStr });
    }
    
    // Add past days from day-wise attendance
    this.dayWiseAttendance.forEach((day, index) => {
      if (!day.isFuture) {
        options.push({ 
          index: index, 
          label: day.displayLabel, 
          date: day.date 
        });
      }
    });
    
    return options;
  }

  calculateIrregularParticipants() {
    if (!this.selectedEvent || !this.mapAttendence) {
      this.irregularParticipants = [];
      return;
    }
    
    this.isLoadingIrregular = true;
    
    let targetDate: string;
    if (this.selectedFollowupDayIndex === -1) {
      targetDate = new Date().toLocaleDateString('en-CA');
    } else if (this.selectedFollowupDayIndex >= 0 && this.selectedFollowupDayIndex < this.dayWiseAttendance.length) {
      targetDate = this.dayWiseAttendance[this.selectedFollowupDayIndex].date;
    } else {
      targetDate = new Date().toLocaleDateString('en-CA');
    }
    
    const [filterHours, filterMinutes] = this.arenaFollowupTimeFilter.split(':').map(Number);
    
    const cutoffTime = new Date(targetDate);
    cutoffTime.setHours(filterHours, filterMinutes, 0, 0);
    
    const irregularList: { profileId: string; name: string }[] = [];
    const currentList = this.getCurrentParticipantList();
    
    currentList.forEach(profileId => {
      const attendanceRecords = this.mapAttendence[profileId] || [];
      
      const targetDayRecords = attendanceRecords.filter(record => {
        const logDate = record['logdate']?.toDate ? record['logdate'].toDate() : new Date(record['logdate']);
        return logDate.toLocaleDateString('en-CA') === targetDate;
      });
      
      const hasLateLog = targetDayRecords.some(record => {
        const logDate = record['logdate']?.toDate ? record['logdate'].toDate() : new Date(record['logdate']);
        return logDate >= cutoffTime;
      });
      
      if (hasLateLog) {
        const metadata = this.participantMetadataMap[profileId];
        irregularList.push({
          profileId: profileId,
          name: metadata?.name || 'Unknown'
        });
      }
    });
    
    irregularList.sort((a, b) => a.name.localeCompare(b.name));
    
    this.irregularParticipants = irregularList;
    this.isLoadingIrregular = false;
  }

  onFollowupDayChange() {
    this.calculateIrregularParticipants();
  }

  onFollowupTimeChange() {
    this.calculateIrregularParticipants();
  }

  getNotDoingCWParticipants(): { profileId: string; name: string }[] {
    return this.changeWorkOverview.notDoneOthersProfileIds.map(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      return {
        profileId: profileId,
        name: metadata?.name || 'Unknown'
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  getCWNotReceivedParticipants(): { profileId: string; name: string }[] {
    return this.changeWorkOverview.notDoneSelfProfileIds.map(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      return {
        profileId: profileId,
        name: metadata?.name || 'Unknown'
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  getRegisteredNotComeParticipants(): { profileId: string; name: string }[] {
    return this.notScannedProfileIds.map(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      return {
        profileId: profileId,
        name: metadata?.name || 'Unknown'
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  getNotFinanceClearanceParticipants(): { profileId: string; name: string }[] {
    // Same as Registered Not Come - Not Scanned participants
    return this.notScannedProfileIds.map(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      return {
        profileId: profileId,
        name: metadata?.name || 'Unknown'
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  calculateCameDay1NotToday() {
    if (!this.selectedEvent || !this.mapAttendence || this.dayWiseAttendance.length === 0) {
      this.cameDay1NotTodayParticipants = [];
      return;
    }
    
    const todayStr = new Date().toLocaleDateString('en-CA');
    const day1 = this.dayWiseAttendance[0];
    
    if (!day1 || day1.date === todayStr) {
      this.cameDay1NotTodayParticipants = [];
      return;
    }
    
    const result: { profileId: string; name: string }[] = [];
    const currentList = this.getCurrentParticipantList();
    
    currentList.forEach(profileId => {
      const attendanceRecords = this.mapAttendence[profileId] || [];
      
      const attendedDates = attendanceRecords.map(record => {
        const logDate = record['logdate']?.toDate ? record['logdate'].toDate() : new Date(record['logdate']);
        return logDate.toLocaleDateString('en-CA');
      });
      
      const attendedDay1 = attendedDates.includes(day1.date);
      const attendedToday = attendedDates.includes(todayStr);
      
      if (attendedDay1 && !attendedToday) {
        const metadata = this.participantMetadataMap[profileId];
        result.push({
          profileId: profileId,
          name: metadata?.name || 'Unknown'
        });
      }
    });
    
    this.cameDay1NotTodayParticipants = result.sort((a, b) => a.name.localeCompare(b.name));
  }

  getNoCohortParticipants(): { profileId: string; name: string }[] {
    return this.nonCohortProfileIds.map(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      return {
        profileId: profileId,
        name: metadata?.name || 'Unknown'
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  getNoAtcParticipants(): { profileId: string; name: string }[] {
    return this.arenaOverview.atcNotCompletedProfileIds.map(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      return {
        profileId: profileId,
        name: metadata?.name || 'Unknown'
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  calculateLiveCWDisplayList() {
    if (!this.liveChangeWorkDocs || this.liveChangeWorkDocs.length === 0) {
      this.liveCWDisplayList = [];
      return;
    }
    
    const todayStr = new Date().toLocaleDateString('en-CA');
    
    // Filter based on changeWorkViewMode (today or overall)
    const relevantDocs = this.changeWorkViewMode === 'today'
      ? this.liveChangeWorkDocs.filter(doc => {
          if (!doc.createdon) return false;
            const createdDate = doc.createdon.toDate 
          ? doc.createdon.toDate().toLocaleDateString('en-CA')
          : new Date(doc.createdon).toLocaleDateString('en-CA');
        return createdDate === todayStr;
        })
      : this.liveChangeWorkDocs;
    
    // Filter only "live" procedure docs
    const liveDocs = relevantDocs.filter(doc => doc.procedurestatus === 'live');
    
    this.liveCWDisplayList = liveDocs.map(doc => {
      const doerId = doc.doerid || '';
      const beneficiaryId = doc.beneficiaryid || '';
      const procedurename = doc.procedurename || doc.procedurestatus || '';
      
      const doerMetadata = this.participantMetadataMap[doerId];
      const beneficiaryMetadata = this.participantMetadataMap[beneficiaryId];
      
      const doerName = doerMetadata?.name || 'Unknown';
      const beneficiaryName = beneficiaryMetadata?.name || 'Unknown';
      
      return {
        doerId: doerId,
        doerName: doerName,
        beneficiaryId: beneficiaryId,
        beneficiaryName: beneficiaryName,
        procedurename: procedurename,
        displayText: `${doerName} - ${beneficiaryName} (${procedurename})`
      };
    }).sort((a, b) => a.doerName.localeCompare(b.doerName));
  }

  // ============== ACTION QUEUE PANEL METHODS ==============

  openActionQueuePanel(tag: string) {
    const participants = this.actionQueueData[tag] || [];
    if (participants.length === 0) return;
    
    this.sidePanelTitle = tag;
    this.sidePanelDate = '';
    this.sidePanelType = 'actionQueue';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.actionQueueSelectedTag = tag;
    
    this.panelParticipants = participants.map(p => 
      this.buildParticipantFromProfileId(p.profileId, true)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  // ============== ARENA FOLLOWUP PANEL METHODS ==============

  openIrregularPanel() {
    if (this.irregularParticipants.length === 0) return;
    
    this.sidePanelTitle = 'Irregular Participants';
    this.sidePanelDate = this.selectedFollowupDayIndex === -1 ? 'Today' : this.dayWiseAttendance[this.selectedFollowupDayIndex]?.date || '';
    this.sidePanelType = 'irregular';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.arenaFollowupSelectedColumn = 'irregular';
    
    this.panelParticipants = this.irregularParticipants.map(p => 
      this.buildParticipantFromProfileId(p.profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openArenaNotDoingCWPanel() {
    if (this.changeWorkOverview.notDoneOthers === 0) return;
    
    this.sidePanelTitle = 'Not Doing CW';
    this.sidePanelDate = this.changeWorkViewMode === 'today' ? 'Today' : 'Overall';
    this.sidePanelType = 'arenaNotDoingCW';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.arenaFollowupSelectedColumn = 'notDoingCW';
    
    this.panelParticipants = this.changeWorkOverview.notDoneOthersProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openArenaCWNotReceivedPanel() {
    if (this.changeWorkOverview.notDoneSelf === 0) return;
    
    this.sidePanelTitle = 'CW Not Received';
    this.sidePanelDate = this.changeWorkViewMode === 'today' ? 'Today' : 'Overall';
    this.sidePanelType = 'arenaCWNotReceived';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.arenaFollowupSelectedColumn = 'cwNotReceived';
    
    this.panelParticipants = this.changeWorkOverview.notDoneSelfProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openArenaLiveCWPanel() {
    if (this.liveCWDisplayList.length === 0) return;
    
    this.sidePanelTitle = 'Live CW';
    this.sidePanelDate = this.changeWorkViewMode === 'today' ? 'Today' : 'Overall';
    this.sidePanelType = 'arenaLiveCW';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.arenaFollowupSelectedColumn = 'liveCW';
    
    // For Live CW, we'll show doers in the panel
    const doerIds = [...new Set(this.liveCWDisplayList.map(item => item.doerId))];
    this.panelParticipants = doerIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, true)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  // ============== PARTICIPANT STATUS PANEL METHODS ==============

  openRegisteredNotComePanel() {
    if (this.notScannedCount === 0) return;
    
    this.sidePanelTitle = 'Registered Not Come';
    this.sidePanelDate = '';
    this.sidePanelType = 'registeredNotCome';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.participantStatusSelectedColumn = 'registeredNotCome';
    
    this.panelParticipants = this.notScannedProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openNotFinanceClearancePanel() {
    if (this.notScannedCount === 0) return;
    
    this.sidePanelTitle = 'Not Finance Clearance';
    this.sidePanelDate = '';
    this.sidePanelType = 'notFinance';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.participantStatusSelectedColumn = 'notFinance';
    
    this.panelParticipants = this.notScannedProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openCameDay1NotTodayPanel() {
    if (this.cameDay1NotTodayParticipants.length === 0) return;
    
    this.sidePanelTitle = 'Came Day 1 but not today';
    this.sidePanelDate = '';
    this.sidePanelType = 'cameDay1NotToday';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.participantStatusSelectedColumn = 'cameDay1';
    
    this.panelParticipants = this.cameDay1NotTodayParticipants.map(p => 
      this.buildParticipantFromProfileId(p.profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openNoCohortStatusPanel() {
    if (this.nonCohortCount === 0) return;
    
    this.sidePanelTitle = 'No Cohorts Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'noCohort';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.participantStatusSelectedColumn = 'noCohort';
    
    this.panelParticipants = this.nonCohortProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  openNoAtcStatusPanel() {
    if (this.arenaOverview.atcNotCompleted === 0) return;
    
    this.sidePanelTitle = 'NO ATC';
    this.sidePanelDate = '';
    this.sidePanelType = 'noAtc';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.participantStatusSelectedColumn = 'noAtc';
    
    this.panelParticipants = this.arenaOverview.atcNotCompletedProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  // ============== EXCEL EXPORT METHOD ==============

  exportToExcel() {
    const participantsToExport = this.filteredParticipants.length > 0 ? this.filteredParticipants : this.panelParticipants;
    
    if (participantsToExport.length === 0) {
      alert('No participants to export');
      return;
    }
    
    const exportData: any[] = [];
    
    participantsToExport.forEach(participant => {
      const profileId = participant.profileid;
      const metadata = this.participantMetadataMap[profileId] || {};
      
      // Basic Info
      const row: any = {
        'Name': participant.name || metadata['name'] || '',
        'Email': participant.email || metadata['email'] || '',
        'Phone': participant.phone || metadata['phone'] || metadata['number'] || metadata['mobile'] || '',
        'Journey': this.mapJourneyData[metadata['activejourney']]?.['journey'] || 'No Journey',
        'Is Registered': this.eventParticipantProfileIds.includes(profileId) ? 'Yes' : 'No',
      };
      
      // Day-wise Attendance
      const attendanceRecords = this.mapAttendence[profileId] || [];
      const attendedDates = attendanceRecords.map(record => {
        const logDate = record['logdate']?.toDate ? record['logdate'].toDate() : new Date(record['logdate']);
        return logDate.toLocaleDateString('en-CA');
      });
      
      this.dayWiseAttendance.forEach(day => {
        const attended = attendedDates.includes(day.date);
        row[`${day.displayLabel} (${day.date})`] = attended ? 'Present' : 'Absent';
      });
      
      row['Total Days Attended'] = [...new Set(attendedDates)].length;
      
      // Scanned Status
      row['Scanned'] = this.scannedProfileIds.includes(profileId) ? 'Yes' : 'No';
      
      // Video Tags
      const participantTags = metadata['profiletags'] || participant.profiletags || [];
      const tagNames = participantTags.map((tagId: string) => this.mapTagsName[tagId] || tagId).join(', ');
      row['Profile Tags'] = tagNames || 'None';
      
      // Video Ask Status
      const hasOverallVideoAsk = this.arenaOverview.overallVideoAskProfileIds.includes(profileId);
      const isVideoAskReviewed = this.arenaOverview.overallVideoAskReviewedProfileIds.includes(profileId);
      row['Video Ask Submitted'] = hasOverallVideoAsk ? 'Yes' : 'No';
      row['Video Ask Reviewed'] = isVideoAskReviewed ? 'Yes' : 'No';
      
      // ATC Status
      const atcCompleted = this.arenaOverview.atcCompletedProfileIds.includes(profileId);
      const atcToValidate = this.arenaOverview.atcToValidateProfileIds.includes(profileId);
      const atcNotCompleted = this.arenaOverview.atcNotCompletedProfileIds.includes(profileId);
      row['ATC Status'] = atcCompleted ? 'Completed' : (atcToValidate ? 'To Validate' : (atcNotCompleted ? 'Not Completed' : 'N/A'));
      
      // ATC Count
      const atcCompletedCount = this.arenaOverview.atcCompletedDocs.filter(doc => doc.profileid === profileId).length;
      const atcToValidateCount = this.arenaOverview.atcToValidateDocs.filter(doc => doc.profileid === profileId).length;
      row['ATC Completed Count'] = atcCompletedCount;
      row['ATC To Validate Count'] = atcToValidateCount;

      // Draft ATC Status
      const hasDraftAtc = this.draftAtcProfileIds.includes(profileId);
      const draftAtcCount = this.draftAtcDocs.filter(doc => doc.profileid === profileId).length;
      row['Has Draft ATC'] = hasDraftAtc ? 'Yes' : 'No';
      row['Draft ATC Count'] = draftAtcCount;

      // Get draft ATC products
      const draftAtcProducts = this.draftAtcDocs
        .filter(doc => doc.profileid === profileId)
        .map(doc => doc.product || 'Unknown')
        .join(', ');
      row['Draft ATC Products'] = draftAtcProducts || 'None';
      
      // Change Work Status
      const notDoneOthers = this.changeWorkOverview.notDoneOthersProfileIds.includes(profileId);
      const notDoneSelf = this.changeWorkOverview.notDoneSelfProfileIds.includes(profileId);
      const hasNonAtcCW = this.changeWorkOverview.nonAtcCWProfileIds.includes(profileId);
      const hasLiveCW = this.changeWorkOverview.liveCWProfileIds.includes(profileId);
      
      row['CW Done for Others'] = notDoneOthers ? 'No' : 'Yes';
      row['CW Received from Others'] = notDoneSelf ? 'No' : 'Yes';
      row['Has Non-ATC CW'] = hasNonAtcCW ? 'Yes' : 'No';
      row['Has Live CW'] = hasLiveCW ? 'Yes' : 'No';
      
      // CW counts as doer and beneficiary
      const cwAsDoer = this.liveChangeWorkDocs.filter(doc => doc.doerid === profileId).length;
      const cwAsBeneficiary = this.liveChangeWorkDocs.filter(doc => doc.beneficiaryid === profileId).length;
      row['CW Done Count (as Doer)'] = cwAsDoer;
      row['CW Received Count (as Beneficiary)'] = cwAsBeneficiary;
      
      // Customer Support Issues
      const participantIssues = this.clientIssues.filter(issue => issue.profileid === profileId);
      row['Open Issues Count'] = participantIssues.length;
      row['Issue Categories'] = [...new Set(participantIssues.map(i => i.category))].join(', ') || 'None';
      
      // Cohort Status
      const isInCohort = this.cohortParticipantIds.has(profileId);
      row['In Cohort'] = isInCohort ? 'Yes' : 'No';
      
      // Zone Status
      const isInZone = this.zoneParticipantIds.has(profileId);
      row['In Zone'] = isInZone ? 'Yes' : 'No';
      row['No Zone'] = !isInZone ? 'Yes' : 'No';
      
      // Journey Status
      const hasJourney = metadata['activejourney'] && this.mapJourneyData[metadata['activejourney']];
      row['Has Journey'] = hasJourney ? 'Yes' : 'No';
      row['Missing Journey'] = !hasJourney ? 'Yes' : 'No';
      
      // 1st Time / 2nd Time+ Status
      const isFirstTime = this.firstTimeProfileIds.includes(profileId);
      const isSecondTime = this.secondTimeProfileIds.includes(profileId);
      row['Participant Type'] = isFirstTime ? '1st Time' : (isSecondTime ? '2nd Time+' : 'Unknown');
      
      // Action Queue Tags (if applicable)
      const actionQueueTags: string[] = [];
      this.videoAskTags.forEach(tag => {
        const tagParticipants = this.actionQueueData[tag] || [];
        if (tagParticipants.some(p => p.profileId === profileId)) {
          actionQueueTags.push(tag);
        }
      });
      row['Action Queue Tags'] = actionQueueTags.join(', ') || 'None';

      const firstTimeEventTags: string[] = [];
      this.firstTimeTags.forEach(tag => {
        const tagParticipants = this.firstTimeTagsData[tag] || [];
        if (tagParticipants.some(p => p.profileId === profileId)) {
          firstTimeEventTags.push(tag);
        }
      });
      row['First Time Event Tags'] = firstTimeEventTags.join(', ') || 'None';

      // Event Tags from Metadata
      const metadata2 = this.participantMetadataMap[profileId];
      const eventTagsFromMetadata = metadata2?.['eventtags'] || [];
      row['All Event Tags'] = eventTagsFromMetadata.join(', ') || 'None';
      
      // Missing Data Summary
      const missingData: string[] = [];
      if (!hasJourney) missingData.push('Journey');
      if (!isInCohort) missingData.push('Cohort');
      if (!isInZone) missingData.push('Zone');
      if (!atcCompleted && !atcToValidate && !hasDraftAtc) missingData.push('ATC'); // Updated condition
      if (!hasOverallVideoAsk) missingData.push('Video Ask');
      if (!this.scannedProfileIds.includes(profileId)) missingData.push('Not Scanned');

      row['Missing Data'] = missingData.length > 0 ? missingData.join(', ') : 'Complete';
      row['Missing Data Count'] = missingData.length;
      
      // Irregular Status (came after specified time)
      const isIrregular = this.irregularParticipants.some(p => p.profileId === profileId);
      row['Irregular Attendance'] = isIrregular ? 'Yes' : 'No';
      
      // Came Day 1 but not today
      const cameDay1NotToday = this.cameDay1NotTodayParticipants.some(p => p.profileId === profileId);
      row['Came Day 1 Not Today'] = cameDay1NotToday ? 'Yes' : 'No';
      
      exportData.push(row);
    });
    
    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-size columns
    const columnWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.max(key.length, ...exportData.map(row => String(row[key] || '').length)) + 2
    }));
    worksheet['!cols'] = columnWidths;
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');
    
    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const panelName = this.sidePanelTitle.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${panelName}_${timestamp}.xlsx`;
    
    // Download
    XLSX.writeFile(workbook, filename);
  }

  async loadFirstTimeTags() {
    if (!this.selectedEvent) return;
    
    this.isLoadingFirstTimeTags = true;
    this.firstTimeTags = [];
    this.firstTimeTagsData = {};
    
    try {
      // Fetch firsttimetags from classify collection, eventtags document
      const classifySnapshot = await getDoc(
        doc(collection(this.firestoreDefault, 'classify',),'eventtags')
      );
      
      if (!classifySnapshot.exists()) {
        this.isLoadingFirstTimeTags = false;
        return;
      }
      
      // Get firsttimetags from the document
      const classifyDoc = classifySnapshot.data();
      this.firstTimeTags = classifyDoc['firsttimetags'] || [];
      
      if (this.firstTimeTags.length === 0) {
        this.isLoadingFirstTimeTags = false;
        return;
      }
      
      // Initialize firstTimeTagsData with empty arrays for each tag
      this.firstTimeTags.forEach(tag => {
        this.firstTimeTagsData[tag] = [];
      });
      
      // Check each registered participant's eventtags in metadata
      this.calculateFirstTimeTagsData();
      
    } catch (error) {
      console.error('Error loading first time tags:', error);
      this.isLoadingFirstTimeTags = false;
    }
  }

  calculateFirstTimeTagsData() {
    this.firstTimeTags.forEach(tag => {
      this.firstTimeTagsData[tag] = [];
    });
    
    const currentList = this.getCurrentParticipantList();
    
    currentList.forEach(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      const eventTags = metadata?.['eventtags'] || [];
      
      eventTags.forEach((tag: string) => {
        if (this.firstTimeTags.includes(tag)) {
          const existingIndex = this.firstTimeTagsData[tag].findIndex(p => p.profileId === profileId);
          if (existingIndex === -1) {
            this.firstTimeTagsData[tag].push({
              profileId: profileId,
              name: metadata?.name || 'Unknown'
            });
          }
        }
      });
    });
    
    this.firstTimeTags.forEach(tag => {
      this.firstTimeTagsData[tag].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    this.isLoadingFirstTimeTags = false;
  }

  getFirstTimeTagCount(tag: string): number {
    return this.firstTimeTagsData[tag]?.length || 0;
  }

  getTotalFirstTimeTagCount(): number {
    let total = 0;
    this.firstTimeTags.forEach(tag => {
      total += this.firstTimeTagsData[tag]?.length || 0;
    });
    return total;
  }

  getFirstTimeTagIcon(tag: string): string {
    const tagLower = tag.toLowerCase();
    if (tagLower.includes('new') || tagLower.includes('first')) return '🆕';
    if (tagLower.includes('welcome')) return '👋';
    if (tagLower.includes('intro')) return '📝';
    if (tagLower.includes('onboard')) return '🚀';
    if (tagLower.includes('beginner')) return '🌱';
    if (tagLower.includes('start')) return '▶️';
    return '🏷️';
  }

  openFirstTimeTagPanel(tag: string) {
    const participants = this.firstTimeTagsData[tag] || [];
    if (participants.length === 0) return;
    
    this.sidePanelTitle = tag;
    this.sidePanelDate = '';
    this.sidePanelType = 'firstTimeTag' as any;
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    this.firstTimeTagsSelectedTag = tag;
    
    this.panelParticipants = participants.map(p => 
      this.buildParticipantFromProfileId(p.profileId, true)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
    this.isSidePanelOpen = true;
  }

  // Add this method to get the current participant list based on view mode
  getCurrentParticipantList(): string[] {
    if (this.participantViewMode === 'scanned') {
      return this.scannedParticipantProfileIds;
    }
    return this.eventParticipantProfileIds;
  }

  // Method to toggle view mode
  setParticipantViewMode(mode: 'registered' | 'scanned') {
    this.participantViewMode = mode;
    this.recalculateAllWidgets();
  }

  // Recalculate all widgets based on the current view mode
  recalculateAllWidgets() {
    this.calculateJourneyCounts();
    this.calculateNonCohortParticipants();
    this.calculateNoZoneParticipants();
    this.calculateCameDay1NotToday();
    this.calculateIrregularParticipants();
    this.calculateChangeWorkOverview();
    this.calculateLiveCWDisplayList();
    this.calculateFirstTimeTagsData();
    this.recalculateActionQueueData();
    this.recalculateVideoAskCounts();
    this.recalculateAtcCounts();
    this.recalculateParticipantHistoryCounts();
    this.calculateDraftAtcParticipants(); // Add this line
    this.loadActionQueue();
    this.loadFirstTimeTags();
    // Refresh side panel if open
    if (this.isSidePanelOpen) {
      this.refreshSidePanelData();
    }
  }

  // Recalculate action queue data based on view mode
  // recalculateActionQueueData() {
  //   const currentList = this.getCurrentParticipantList();
    
  //   this.videoAskTags.forEach(tag => {
  //     if (this.actionQueueData[tag]) {
  //       this.actionQueueData[tag] = this.actionQueueData[tag].filter(p => 
  //         currentList.includes(p.profileId)
  //       );
  //     }
  //   });
  // }

  recalculateActionQueueData() {
    this.videoAskTags.forEach(tag => {
      this.actionQueueData[tag] = [];
    });
    const currentList = this.getCurrentParticipantList();
    currentList.forEach(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      const videoAskTags = metadata?.['videoasktags'] || [];
      const participantName = metadata?.name || 'Unknown';

      if (videoAskTags.length > 0) {
        videoAskTags.forEach((tag: string) => {
          if (this.videoAskTags.includes(tag)) {
            const existingIndex = this.actionQueueData[tag].findIndex(p => p.profileId === profileId);
            if (existingIndex === -1) {
              this.actionQueueData[tag].push({
                profileId: profileId,
                name: participantName
              });
            }
          }
        });
      }
    });

    this.videoAskTags.forEach(tag => {
      this.actionQueueData[tag].sort((a, b) => a.name.localeCompare(b.name));
    });
  }
  recalculateVideoAskCounts() {
    const currentList = this.getCurrentParticipantList();
    
    // Filter overall video ask
    const filteredOverallVideoAskProfileIds = this.arenaOverview.overallVideoAskProfileIds.filter(
      id => currentList.includes(id)
    );
    const filteredOverallVideoAskReviewedProfileIds = this.arenaOverview.overallVideoAskReviewedProfileIds.filter(
      id => currentList.includes(id)
    );
    
    // Filter today video ask
    const filteredTodayVideoAskProfileIds = this.arenaOverview.todayVideoAskProfileIds.filter(
      id => currentList.includes(id)
    );
    const filteredTodayVideoAskReviewedProfileIds = this.arenaOverview.todayVideoAskReviewedProfileIds.filter(
      id => currentList.includes(id)
    );
    
    // Update filtered overview (preserve existing fields)
    this.filteredArenaOverview = {
      ...this.filteredArenaOverview,
      overallVideoAsk: filteredOverallVideoAskProfileIds.length,
      overallVideoAskProfileIds: filteredOverallVideoAskProfileIds,
      overallVideoAskReviewedProfileIds: filteredOverallVideoAskReviewedProfileIds,
      overallVideoAskPercentage: filteredOverallVideoAskProfileIds.length > 0 
        ? Math.round((filteredOverallVideoAskReviewedProfileIds.length / filteredOverallVideoAskProfileIds.length) * 100) 
        : 0,
      todayVideoAsk: filteredTodayVideoAskProfileIds.length,
      todayVideoAskProfileIds: filteredTodayVideoAskProfileIds,
      todayVideoAskReviewedProfileIds: filteredTodayVideoAskReviewedProfileIds,
      todayVideoAskPercentage: filteredTodayVideoAskProfileIds.length > 0 
        ? Math.round((filteredTodayVideoAskReviewedProfileIds.length / filteredTodayVideoAskProfileIds.length) * 100) 
        : 0
    };
  }

  // Add new method to subscribe to event participant zones
  subscribeToZones() {
    if (!this.selectedEvent) return;
    
    if (this.zonesSubscription) {
      this.zonesSubscription.unsubscribe();
    }
    
    this.isLoadingZones = true;
    
    this.zonesSubscription = collectionData(
      query(collection(this.firestoreDefault, 'event participant zones'), where('eventref', '==', this.selectedEvent.docref))
    ).subscribe({
      next: (docs) => {
        this.eventParticipantZones = docs;
        this.zoneParticipantIds.clear();
        
        // Collect all participant IDs from all zones
        docs.forEach((zone: any) => {
          const profileId = zone.profileid;
            this.zoneParticipantIds.add(profileId);
        });
        
        // Calculate no-zone participants
        this.calculateNoZoneParticipants();
        this.isLoadingZones = false;
        
        if (this.isSidePanelOpen && this.sidePanelType === 'noZone') {
          this.refreshNoZonePanel();
        }
      },
      error: (error) => {
        console.error('Error subscribing to zones:', error);
        this.isLoadingZones = false;
      }
    });
  }

  calculateNoZoneParticipants() {
    const currentList = this.getCurrentParticipantList();
    this.noZoneProfileIds = currentList.filter(
      profileId => !this.zoneParticipantIds.has(profileId)
    );
    this.noZoneCount = this.noZoneProfileIds.length;
  }

  // Add method to open no-zone panel
  openNoZonePanel() {
    if (this.noZoneCount === 0) return;
    
    this.sidePanelTitle = 'No Zone Participants';
    this.sidePanelDate = '';
    this.sidePanelType = 'noZone';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshNoZonePanel();
    this.isSidePanelOpen = true;
  }

  private refreshNoZonePanel() {
    this.panelParticipants = this.noZoneProfileIds.map(profileId => 
      this.buildParticipantFromProfileId(profileId, false)
    );
    this.panelParticipants.sort((a, b) => a.name.localeCompare(b.name));
    this.notRegisteredCount = 0;
    this.applyParticipantFilters();
  }

  getNoZoneParticipants(): { profileId: string; name: string }[] {
    return this.noZoneProfileIds.map(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      return {
        profileId: profileId,
        name: metadata?.name || 'Unknown'
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Add method to recalculate ATC counts based on view mode
  recalculateAtcCounts() {
    const currentList = this.getCurrentParticipantList();
    
    // Filter ATC completed
    const filteredAtcCompletedProfileIds = this.arenaOverview.atcCompletedProfileIds.filter(
      id => currentList.includes(id)
    );
    const filteredAtcCompletedDocs = this.arenaOverview.atcCompletedDocs.filter(
      doc => currentList.includes(doc.profileid)
    );
    
    // Filter ATC to validate
    const filteredAtcToValidateProfileIds = this.arenaOverview.atcToValidateProfileIds.filter(
      id => currentList.includes(id)
    );
    const filteredAtcToValidateDocs = this.arenaOverview.atcToValidateDocs.filter(
      doc => currentList.includes(doc.profileid)
    );
    
    // Calculate not completed for filtered list
    const filteredAtcNotCompletedProfileIds = currentList.filter(id => 
      !filteredAtcCompletedProfileIds.includes(id) && !filteredAtcToValidateProfileIds.includes(id)
    );
    
    // Update filtered counts
    this.filteredArenaOverview = {
      ...this.filteredArenaOverview,
      atcCompleted: filteredAtcCompletedDocs.length,
      atcCompletedProfileIds: filteredAtcCompletedProfileIds,
      atcCompletedDocs: filteredAtcCompletedDocs,
      atcToValidate: filteredAtcToValidateDocs.length,
      atcToValidateProfileIds: filteredAtcToValidateProfileIds,
      atcToValidateDocs: filteredAtcToValidateDocs,
      atcNotCompleted: filteredAtcNotCompletedProfileIds.length,
      atcNotCompletedProfileIds: filteredAtcNotCompletedProfileIds
    } as any;
  }

  recalculateParticipantHistoryCounts() {
    const currentList = this.getCurrentParticipantList();
    
    const filteredFirstTimeProfileIds = this.firstTimeProfileIds.filter(id => currentList.includes(id));
    const filteredSecondTimeProfileIds = this.secondTimeProfileIds.filter(id => currentList.includes(id));
    
    this.filteredArenaOverview = {
      ...this.filteredArenaOverview,
      firstTimeCount: filteredFirstTimeProfileIds.length,
      firstTimeProfileIds: filteredFirstTimeProfileIds,
      secondTimeCount: filteredSecondTimeProfileIds.length,
      secondTimeProfileIds: filteredSecondTimeProfileIds
    } as any;
  }

  subscribeToDraftAtc() {
    if (!this.selectedEvent || this.selectedQueues.length === 0 || !this.queueRangeStartDate) return;
    
    if (this.draftAtcSubscription) {
      this.draftAtcSubscription.unsubscribe();
    }
    
    this.isLoadingDraftAtc = true;
    
    this.draftAtcSubscription = collectionData(
      query(
        collection(this.firestoreATC, 'temporary_ATC'),
        where('delete', '==', false),
      )
    ).subscribe({
      next: (docs) => {
        
        this.draftAtcDocs = [];
        this.draftAtcProfileIds = [];
        const currentList = this.getCurrentParticipantList();
        
        docs.forEach((doc: any) => {
          if (doc['transcript'].length > 0 && ![null,undefined,''].includes(doc['transcript'][0]['adjustment'])) {
            if (this.isDateInQueueRange(doc['lastupdated'])) {
              const profileId = doc['profileid'] || '';

              // Check if participant is in current list (registered or scanned based on view mode)
              if (profileId && currentList.includes(profileId)) {
                // Check if lastupdated is within queue date range
                const lastUpdated = doc['lastupdated']?.toDate ? doc['lastupdated'].toDate() : new Date(doc['lastupdated']);

                if (this.queueRangeStartDate && lastUpdated >= this.queueRangeStartDate) {
                  this.draftAtcDocs.push({
                    docref: doc['docid'] || '',
                    profileid: profileId,
                    lastupdated: doc['lastupdated'],
                    product: doc['product'] || '',
                    ...doc
                  });

                  if (!this.draftAtcProfileIds.includes(profileId)) {
                    this.draftAtcProfileIds.push(profileId);
                  }
                }
              }
            }
          }
        });
        
        this.draftAtcCount = this.draftAtcProfileIds.length;
        this.isLoadingDraftAtc = false;
        
        if (this.isSidePanelOpen && this.sidePanelType === 'draftAtc') {
          this.refreshDraftAtcPanel();
        }
      },
      error: (error) => {
        console.error('Error subscribing to draft ATC:', error);
        this.isLoadingDraftAtc = false;
      }
    });
  }

  calculateDraftAtcParticipants() {
    if (!this.draftAtcDocs || this.draftAtcDocs.length === 0) {
      this.draftAtcProfileIds = [];
      this.draftAtcCount = 0;
      return;
    }
    
    const currentList = this.getCurrentParticipantList();
    
    this.draftAtcProfileIds = [];
    
    this.draftAtcDocs.forEach((doc: any) => {
      const profileId = doc['profileid'] || '';
      
      if (profileId && currentList.includes(profileId)) {
        if (!this.draftAtcProfileIds.includes(profileId)) {
          this.draftAtcProfileIds.push(profileId);
        }
      }
    });
    
    this.draftAtcCount = this.draftAtcProfileIds.length;
  }

  openDraftAtcPanel() {
    if (this.draftAtcCount === 0) return;
    
    this.sidePanelTitle = 'Draft ATC';
    this.sidePanelDate = '';
    this.sidePanelType = 'draftAtc';
    this.sidePanelDayIndex = -1;
    this.participantSearchTerm = '';
    this.participantFilter = 'all';
    this.selectAll = false;
    
    this.refreshDraftAtcPanel();
    this.isSidePanelOpen = true;
  }

  private refreshDraftAtcPanel() {
    this.panelParticipants = this.draftAtcProfileIds.map(profileId => {
      const participant = this.buildParticipantFromProfileId(profileId, true);
      
      // Get draft ATC count for this participant
      const draftCount = this.draftAtcDocs.filter(doc => doc.profileid === profileId).length;
      participant['draftAtcCount'] = draftCount;
      
      return participant;
    });
    
    this.panelParticipants.sort((a, b) => {
      // Sort by draft ATC count descending, then by name
      const countDiff = (b['draftAtcCount'] || 0) - (a['draftAtcCount'] || 0);
      if (countDiff !== 0) return countDiff;
      return a.name.localeCompare(b.name);
    });
    
    this.notRegisteredCount = this.panelParticipants.filter(p => p.isNotRegistered).length;
    this.applyParticipantFilters();
  }

  getDraftAtcParticipants(): { profileId: string; name: string; draftCount: number }[] {
    return this.draftAtcProfileIds.map(profileId => {
      const metadata = this.participantMetadataMap[profileId];
      const draftCount = this.draftAtcDocs.filter(doc => doc.profileid === profileId).length;
      return {
        profileId: profileId,
        name: metadata?.name || 'Unknown',
        draftCount: draftCount
      };
    }).sort((a, b) => {
      // Sort by draft count descending, then by name
      const countDiff = b.draftCount - a.draftCount;
      if (countDiff !== 0) return countDiff;
      return a.name.localeCompare(b.name);
    });
  }
}