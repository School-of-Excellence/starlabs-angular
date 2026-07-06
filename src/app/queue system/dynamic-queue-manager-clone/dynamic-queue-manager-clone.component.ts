import { AfterViewInit, Component, computed, ElementRef, HostListener, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { collection, collectionData, doc, DocumentData, onSnapshot, documentId, Firestore, getDoc, getDocs, getFirestore, orderBy, Query, query, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where, writeBatch,deleteDoc,or,and } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { combineLatest, firstValueFrom, Observable, Subject, Subscription } from 'rxjs';
import { CreateBulkInvitationComponent } from '../create-bulk-invitation/create-bulk-invitation.component';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { PeopleInvolvedComponent } from '../people-involved/people-involved.component';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import { environment } from '../../../environments/environment';
import { AssignQueueStudioComponent } from '../assign-queue-studio/assign-queue-studio.component';
import { AvTestComponent } from '../av-test/av-test.component';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { takeUntil } from 'rxjs/operators';
import { HoldAlertDialogComponent } from '../hold-alert-dialog/hold-alert-dialog.component';
import { NgZone } from '@angular/core';
import { QueueNotesComponent } from '../queue-notes/queue-notes.component';
import { MatSidenavModule } from '@angular/material/sidenav';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ThemePalette } from '@angular/material/core';
import { ViewNotificationParticipantsComponent } from '../view-notification-participants/view-notification-participants.component';
import { StudioPreassignDialogComponent } from '../studio-preassign-dialog/studio-preassign-dialog.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { MatChip, MatChipSet, MatChipsModule } from '@angular/material/chips';
import { SegmentNamePipe } from '../segment name.pipe';
import * as XLSX from 'xlsx';
import { Router } from '@angular/router';
import { QueryList, ViewChildren } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AddPendingActionComponent } from '../../AppEngagement/app-action-pending/add-pending-action/add-pending-action.component';
import { TagParticipantsComponent } from '../../Participants Profile Management/participants-analytics/tag-participants/tag-participants.component';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

interface SearchMatch {
  tokenId: string;
  stageIndex: number;
  tokenIndex: number;
  type: 'token' | 'stage'; // Track if match is token or stage name
}

interface NotificationEvent {
  channel: 'push' | 'whatsapp' | 'email';
  status:  'success' | 'failure' | 'pending';
  message: string;
  title:   string;
  logdate: any;
  templateName?: string;
}

interface ProfileNotificationSummary {
  profileId:         string;
  pushSent:          number;
  pushFailed:        number;
  whatsappSent:      number;
  whatsappFailed:    number;
  emailSent:         number;
  emailFailed:       number;
  totalSuccess:      number;
  totalFailed:       number;
  timeline:          NotificationEvent[];
  // pre-computed — no pipes needed
  pushTimeline:      NotificationEvent[];
  whatsappTimeline:  NotificationEvent[];
  emailTimeline:     NotificationEvent[];
  lastPushStatus:    'success' | 'failure' | null;
  lastWaStatus:      'success' | 'failure' | null;
  lastEmailStatus:   'success' | 'failure' | null;
}

@Component({
  selector: 'app-dynamic-queue-manager-clone',
  imports: [
    MatSidenavModule,
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    SegmentNamePipe,
    MatChipsModule,
    MatChip, 
    MatChipSet,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    ProfilePictureComponent,
  ],
  templateUrl: './dynamic-queue-manager-clone.component.html',
  styleUrl: './dynamic-queue-manager-clone.component.css'
})

export class DynamicQueueManagerCloneComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  color: ThemePalette = 'primary';
  activitySubscription: Subscription
  mapActivity = {}
  activityList = []
  profileSubscription: Subscription
  specialistList = []
  queueStudioSubscription: Subscription
  queueStudioList = []
  mapStudio = {}
  togglescroll: string = "vertical" // Queue Position
  roles = {}
  // mapProfile = {}
  mapProfileData: Record<string, object> = {}
  mapProfileIdToEmail: Record<string, string> = {}
  inActivetoken: boolean = false
  profileid
  queueSubscription: Subscription
  queueList = []
  liveQueueList = []
  selectedQueue = null
  stageSubscripiton: Subscription
  stageQueue = []
  availableStages = []
  // Stage log
  stagelogSubscription: Subscription
  queuehistory = {}
  // Variation
  variationSubscription: Subscription
  mapVariation = {}
  variationList = [];
  // Stage Message
  pinnedChatSubscription: Subscription
  messageCurrentlyTyped: string | null = null
  selectedChatStage: string | null = null
  selectedChatStageType: string | null = null
  onScreenrefreshed = true
  chatList: any = {}
  pinnedChatList: any = []
  chatlistsubscription: Subscription
  // deleteOption: boolean = false
  watiMessage: boolean = false;
  pushNotification: boolean = false;
  watiTemplate: string = '';
  selectedStageType: string = '';
  showStageLog: { [key: string]: boolean } = {};

  docsSubscription: Subscription;
  isWhatsAppActive: boolean = false;
  isEmailActive: boolean = false;
  currentQueueParticipants = [];
  appNotificationProfiles = {};

  participantSubscription: Subscription;
  participantMetaDataMap = {};

  // Set of profile ids approved for the selected queue's event (event participation
  // request with arenaeventid == arena docid and status == 'approved'). Used to mark
  // approved participants with a green check in the queue board.
  approvedProfileIds: Set<string> = new Set();
  // profileid -> event name they were approved for (arena event's `eventname`).
  approvedEventNameMap: { [profileid: string]: string } = {};

  selectedStages: string[] = [];
  availableStagesForComm: any[] = [];
  availableTags: any[] = [];
  selectedTags: string[] = [];
  tagsSubscription: Subscription;
  // harish
  searchQueue: string = '';
  totalParticipants: number = 0;
  selectedTokens: Set<any> = new Set();
  selectedCommType: 'whatsapp' | 'email' | 'notification' | 'appactionpending' | null = null;

  priorityModeProductIds: string[] = [];
  dfuFilterActive: boolean = false;

  // Signals
  allParticipants = signal<any[]>([]);
  mapProduct: any = {};

  //optimisation
  lastLogDate: Date

  stageSearchTerm: string = '';
  filteredAvailableStages: any[] = [];

  // Pagination Properties
  readonly PAGE_SIZE = 15;
  stageDisplayCounts: { [key: string]: number } = {}; // Track how many items to display per stage
  stageLoadingMore: { [key: string]: boolean } = {}; // Track loading state per stage
  allTokensData: any[] = []; // Store all tokens for filtering

  // Search & Filter Properties
  searchFilter: string = ''; // Single search field for name, email, phone
  selectedSegments: string[] = []; // Selected segment filters

  // Segment related
  availableSegments: any[] = []; // Segments available for filtering
  queuePlanningSegments: string[] = []; // Segments from queue planning doc
  participantListMap: { [profileId: string]: string[] } = {}; // profileId -> participantListIds
  segmentParticipantListMap: { [segmentId: string]: string[] } = {}; // segmentId -> participantListIds

  // Filtered stage queue for display
  segmentSearchTerm: string = '';
  tagSearchTerm: string = '';
  filteredSegments: any[] = [];
  filteredTags: any[] = [];

  private subscriptionHandle = new Subject<void>()
  private fcmTokenSubscription = new Subject<void>();
  private liveQueueSubscription = new Subject<void>();
  private storage = inject(Storage);

  pendingInvitationTokenIds: Set<string> = new Set();
  pendingInvitationPairingMap: { [tokenId: string]: string[] } = {};

  showMoveMenu: { [key: string]: boolean } = {};
  showTokenMenu: { [key: string]: boolean } = {};
  showVariationSubmenu = false;
  variations: any[] = [];

  searchMatches: SearchMatch[] = [];
  currentMatchIndex: number = -1;
  isSearchActive: boolean = false;
  searchHighlightMap: { [tokenId: string]: boolean } = {};
  stageHighlightMap: { [stageKey: string]: boolean } = {}; 
  currentHighlightTokenId: string | null = null;
  currentHighlightStageKey: string | null = null; 
  caseSensitiveSearch: boolean = false;
  segmentDropdownOpen: boolean = false;
  tagDropdownOpen: boolean = false;
  mapTagsName = {};
  mapTagsMetaData = {};
  preassignedFilter: 'all' | 'preassigned' | 'not-preassigned' = 'all';
  approvedFilter: 'all' | 'approved' | 'not-approved' = 'all';
  approvedDropdownOpen: boolean = false;
  slotTitleMap: { [key: string]: string } = {};

  roundRobbinformData = {
    howManyParticipantsNeeded:2,
    duration: 2,
    maxcycle:2
  };
  
  //dharshan
  availableStagesFromSlot: string[] = [];
  availableTimeSlots: { timeRange: string; count: number; title?: string }[] = [];
  quickLinks: Array<{ screenName: string; url: string; isInternal: boolean }> = [];
  activeStageCountFilter: string[] = []; 
  selectedTimeSlots: string[] = [];
  stageCountCards: any[] = [];
  reminders: any[] = [];

  selectedStageSlot: string | null = null;
  dateRangeStart: Date | null = null;
  dateRangeEnd: Date | null = null;
  editingReminderDate: Date | null = null;
  editingReminderId: string | null = null;
  newReminderDate: Date | null = null;

  showDateRangePicker: boolean = false;
  showTimeSlotPicker: boolean = false;
  showTimeDropdown: boolean = false;
  showStageCountPanel: boolean = false;

  showAddLinkDialog: boolean = false;
  showAddLinkForm: boolean = false;

  newLinkData = { screenName: '', url: '', isInternal: false };
  editingLinkData = { screenName: '', url: '', isInternal: false };
  
  // reminders
  selectedReminderFilter: 'overdue' | 'today' | 'upcoming' | 'all' | 'completed' = 'all';
  timeDropdownPosition = { top: '0px', right: '0px', left: 'auto' };
  activeReminderNotification: any = null;
  showReminderNotification: boolean = false;
  dueRemindersToShow: any[] = [];
  private reminderCheckInterval: any;
  private shownReminderIds: Set<string> = new Set();
  editingReminderTime: string ;
  showReminderDialog: boolean = false;
  showReminderListModal: boolean = false;
  reminderTodayFilterActive: boolean = false;
  showReminderBanner: boolean = true;
  stageCountSubscription: any;
  selectedStageCountCard: any = null;
  selectedReminderToken: any = null;
  remindersSubscription: Subscription;
  quickLinksSubscription: Subscription;
  editingReminderContext: string = '';
  newReminderContext: string = '';
  editingLinkIndex: number = -1;
  newReminderTime: string = '18:00';
  minReminderDate: Date = new Date();
  sidenavMode: 'comms' | 'filter' = 'comms';
  //stage slot
  preassignedDropdownOpen: boolean = false;
  stageSlotDropdownOpen: boolean = false;
  showStageCountDropdown: boolean = false;
  // customer support
  customerSupportDropdownOpen: boolean = false;
  customerSupportSubscription: Subscription;
  customerSupportMap: { [profileId: string]: any[] } = {};
  availableCustomerSupportCategories: string[] = [];
  selectedCustomerSupportCategories: string[] = [];
  // event participantion
  eventParticipationDropdownOpen: boolean = false;
  eventParticipationList: any[] = []; 
  eventParticipationListLoaded: boolean = false; 
  selectedEventParticipation: any = null; 
  arenaEventFilterList: Array<{ docid: string; name: string }> = [];
  arenaEventProfileMap: { [arenaeventid: string]: Set<string> } = {};
  selectedArenaEventId: string | null = null;
  arenaEventDropdownOpen: boolean = false;
  arenaEventLoading: boolean = false;
  eventParticipationSearchTerm: string = '';
  // atc filter 
  atcValidatedProfileIds: Set<string> = new Set();
  atcUnvalidatedProfileIds: Set<string> = new Set();
  atcAllProfileIds: Set<string> = new Set(); 
  atcFilterActive: boolean = false; 
  atcFilter: 'none' | 'validated' | 'unvalidated' = 'none'; 
  atcDataLoaded: boolean = false;
  atcDropdownOpen: boolean = false;
  atcDateRangeOnlyProfileIds: Set<string> = new Set();
  // no atc filter
  noAtcFilterActive: boolean = false;
  noAtcProfileIds: Set<string> = new Set();
  noAtcCount: number = 0;
  // timeline notification
  notificationTimelineMap: { [profileId: string]: any[] } = {};
  notificationTimelineLoading: boolean = false;
  selectedTimelineToken: any = null;
  showTimelineDialog: boolean = false;
  // notes filter
  showNotesListModal = false;
  notesSearch = '';
  notesDateStart: Date | null = null;
  notesDateEnd: Date | null = null;
  notesData: any[] = [];  
  // Bulk Move 
  showBulkMovePanel          = false;
  bulkMoveInProgress         = false;
  bulkMoveCompleted          = false;
  bulkMoveFailed             = false;
  bulkMoveTargetStageKey     = '';
  bulkMoveCurrentStageObj: any = null;
  availableStagesForBulkMove: any[] = [];
  bulkMoveResults: { token: any; variationName: string; isDFU: boolean }[] = [];
  bulkMoveComputedResult: {
    movable: { token: any; variationName: string; isDFU: boolean }[];
    skippedDFU: { token: any; variationName: string; isDFU: boolean }[];
    skippedVariation: { token: any; variationName: string; isDFU: boolean }[];
  } = { movable: [], skippedDFU: [], skippedVariation: [] };  
  // Stage Activity Panel
  showStageActivityPanel: boolean = false;
  selectedStageForActivity: string = '';
  selectedStageTypeForActivity: string | null = null;
  stageActivityTab: 'cameIn' | 'wentOut' = 'cameIn';
  stageActivityData: { cameIn: any[], wentOut: any[] } = { cameIn: [], wentOut: [] };
  stageActivityCache: any[] | null = null;
  stageActivityCacheQueueId: string | null = null;
  stageActivityCacheLoading: boolean = false;
  participantSearchTerm: string = '';
  //in evolution mapping
  evolutionMappingLiveFilter: 'all' | 'live' | 'unlive' = 'all';
  evolutionMappingLiveMap: { [profileId: string]: boolean } = {};
  evolutionMappingLiveLoaded: boolean = false;
  //variation filter
  selectedVariations: string[] = [];
  variationDropdownOpen: boolean = false;

  // Add this property
  isRoundRobinRunning = false;

  // Initialize status properly (add if missing)
  roundRobinStatus: {
    needed: number;
    approved: any[];
    denied: any[];
    sleeptimer: number;
    status: string;
    attempts:number;
    maxattempts:number;
    currentcycle:number;
    maxcycle:number;
  } = {
    needed: 0,
    approved: [],
    denied: [],
    sleeptimer: 0,
    status: 'Idle',
    attempts:0,
    maxattempts:0,  
    currentcycle:0,
    maxcycle:0
  };

  unsubscribeRR: Subscription | null = null;

  isRoundRobinCancelled:boolean = false  

  showQueueTimelineDialog = false;
  queueTimelineLoading = false;
  profileSummaries: ProfileNotificationSummary[] = [];
  expandedProfileId: string | null = null;
  showTimelineOverlay = false;
  private shouldScrollTracks = false;
  timelineSearchQuery = '';
  channelFilters: {
    push: 'success' | 'failure' | null;
    whatsapp: 'success' | 'failure' | null;
    email: 'success' | 'failure' | null;
  } = { push: null, whatsapp: null, email: null };
  selectedEmailPreview: { profileId: string; item: NotificationEvent } | null = null;
  selectedWhatsappPreview: { profileId: string; item: NotificationEvent } | null = null;

  // keep unsubscribe handles to tear down on close
  private timelineUnsubs: (() => void)[] = [];
  private pushDocs: any[] = [];
  private watiDocs: any[] = [];
  private emailDocs: any[] = [];

  @ViewChildren('tokenElement') tokenElements!: QueryList<ElementRef>;

  @ViewChild('searchBox') searchBox!: ElementRef;
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
   
    if ((event.ctrlKey || event.metaKey) && event.key === 'g') {
      event.preventDefault();
      this.focusSearchBox();
      this.isSearchActive = true;
    }

    // Escape to close search
    if (event.key === 'Escape' && this.isSearchActive) {
      this.clearSearch();
    }

    // Enter to go to next match
    if (event.key === 'Enter' && this.isSearchActive && this.searchMatches.length > 0) {
      event.preventDefault();
      if (event.shiftKey) {
        this.goToPreviousMatch();
      } else {
        this.goToNextMatch();
      }
    }

    // F3 to go to next match (keep this for F3 only, remove Ctrl+G)
    if (event.key === 'F3') {
      event.preventDefault();
      if (event.shiftKey) {
        this.goToPreviousMatch();
      } else {
        this.goToNextMatch();
      }
    }


  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    
    if (!target.closest('.move-menu-wrapper')) {
      this.closeMoveMenu();
    }
    
    if (!target.closest('.token-menu-wrapper')) {
      this.closeTokenMenu();
    }
    
    // Close filter dropdowns when clicking outside
    if (!target.closest('.filter-sidenav-body') && 
      !target.closest('.cdk-overlay-container')) { 
      this.segmentDropdownOpen = false;
      this.tagDropdownOpen = false;
      this.preassignedDropdownOpen = false;
      this.stageSlotDropdownOpen = false;
      this.customerSupportDropdownOpen = false;
      this.eventParticipationDropdownOpen = false;
      this.arenaEventDropdownOpen = false;
      this.atcDropdownOpen = false;
    }
    //dharshan
    if (!target.closest('.time-slot-dropdown-wrapper')) {
    this.showTimeDropdown = false;
    }
    if (!target.closest('.stage-count-chips-row')) {
      this.showStageCountDropdown = false;
    }
  }
  @HostListener('window:scroll')
  onWindowScroll() {
    if (this.showTimeDropdown) {
      this.showTimeDropdown = false;
    }
  }

  @HostListener('document:scroll')
  onDocumentScroll() {
    if (this.showTimeDropdown) {
      this.showTimeDropdown = false;
    }
  }

  focusSearchBox() {
    if (this.searchBox) {
      this.searchBox.nativeElement.focus();
      this.searchBox.nativeElement.select();
    }
  }

  onSearchChange() {
    this.processTokensIntoStages(this.allTokensData);
    this.performSearch();
  }

  // Filtered participants based on unconsumed match
  filteredParticipants = computed(() => {
    const queue = this.selectedQueue;
    const participants = this.allParticipants();

    if (!queue?.packageeligibility?.length) {
      return [];
    }

    const queueUnconsumedSet = new Set(queue.packageeligibility);

    const filtered = participants.filter(p => {
      const hasMatch = p.unconsumedproducts?.some((id: string) => queueUnconsumedSet.has(id));
      return hasMatch;
    });

    return filtered;
  });

  // Set of matched IDs for quick lookup in template
  filteredParticipantIds = computed(() =>
    new Set(this.filteredParticipants().map(p => p.profileid))
  );

  // Helper for template
  isParticipantMatched(participantId: string): boolean {
    return this.filteredParticipantIds().has(participantId);
  }

  // Function to return the matched products in the selected queue 
  getMatchTooltip(profileId: string): string {
    const queue = this.selectedQueue;
    const participant = this.participantMetaDataMap[profileId];

    if (!queue || !participant) {
      return 'No data available';
    }

    const eventProducts = queue.packageeligibility || [];
    const profileProducts = participant.unconsumedproducts || [];

    // Find matching product IDs
    const eventSet = new Set(eventProducts);
    const matchedProductIds = profileProducts.filter((id: string) => eventSet.has(id));

    if (matchedProductIds.length === 0) {
      return 'No matched products';
    }

    // Map IDs to names, line by line
    const productNames = matchedProductIds.map((id: string) =>
      this.mapProduct[id]
    );

    return productNames.join('\n');
  }

  hasPendingInvitation(token: any): boolean {
    return !!token?.docid && this.pendingInvitationTokenIds.has(token.docid);
  }

  getPendingInvitationPairingNames(token: any): string {
    if (!token?.docid) return '';
    const pairing = this.pendingInvitationPairingMap[token.docid] ?? [];
    const names = pairing
      .map(pid => this.mapProfileData[pid]?.['name'])
      .filter((n: string) => !!n);
    return names.join(', ');
  }

  getTokenHighlight(profileId: string): 'orange' | 'none' {
    const metadata = this.participantMetaDataMap[profileId];
    const activeProducts = metadata?.['activeproduct'] || [];

    const isCurrentlyPriority = activeProducts.some(
      (id: string) => this.priorityModeProductIds.includes(id)
    );

    return isCurrentlyPriority ? 'orange' : 'none';
  }

  getTotalDFUCount(): number {
    return this.stageQueue
      .filter(stage => stage.stagename !== 'Unattended Participants')
      .reduce((count, stage) => {
        return count + (stage.allTokens || stage.tokenlist || [])
          .filter((token: any) => this.getTokenHighlight(token.profile_id) === 'orange').length;
      }, 0);
  }

  toggleDFUFilter() {
    this.dfuFilterActive = !this.dfuFilterActive;
    this.processTokensIntoStages(this.allTokensData);
  }

  // Function to get finance status of each participant 
  getFinanceStatus(profileId: string): 'yellow' | 'orange' | 'red' | 'none' {
    const participant = this.participantMetaDataMap[profileId];
    const financeData = participant?.financedata;

    if (!financeData) return 'none';

    const status = financeData.activecustomerstatus?.toLowerCase();
    const paymentStatus = financeData.paymentstatus?.toLowerCase();

    // Red: locked
    if (status === 'locked') {
      return 'red';
    }

    // Orange: defaulted
    if (status === 'defaulted') {
      return 'orange';
    }

    // Yellow: regular + missed payment
    if (status === 'regular' && paymentStatus === 'missed') {
      return 'yellow';
    }

    return 'none';
  }

  // Function to get the tooltip for finance 
  getFinanceTooltip(profileId: string): string {
    const participant = this.participantMetaDataMap[profileId];
    const financeData = participant?.financedata;

    if (!financeData) return 'No finance data';

    const status = financeData.activecustomerstatus || 'N/A';
    const paymentStatus = financeData.paymentstatus || 'N/A';

    return `Status: ${status}\nPayment: ${paymentStatus}`;
  }

  performSearch() {
    this.searchMatches = [];
    this.searchHighlightMap = {};
    this.stageHighlightMap = {}; // Reset stage highlights
    this.currentMatchIndex = -1;
    this.currentHighlightTokenId = null;
    this.currentHighlightStageKey = null;

    if (!this.searchFilter || this.searchFilter.trim() === '') {
      this.isSearchActive = false;
      return;
    }

    this.isSearchActive = true;
    const searchTerm = this.caseSensitiveSearch
      ? this.searchFilter.trim()
      : this.searchFilter.toLowerCase().trim();

    // Search through stages
    this.stageQueue.forEach((stage, stageIndex) => {
      // Check if stage name matches
      const stageName = this.caseSensitiveSearch
        ? (stage.stagename || '')
        : (stage.stagename || '').toLowerCase();

      const stageType = stage.type
        ? (this.caseSensitiveSearch ? stage.type : stage.type.toLowerCase())
        : '';

      if (stageName.includes(searchTerm) || stageType.includes(searchTerm)) {
        this.stageHighlightMap[stage.stageKey] = true;
        this.searchMatches.push({
          tokenId: stage.stageKey,
          stageIndex: stageIndex,
          tokenIndex: -1, // -1 indicates stage match, not token
          type: 'stage'
        });
      }

      // Search through tokens in this stage
      const displayedTokens = this.getDisplayedTokens(stage);
      displayedTokens.forEach((token, tokenIndex) => {
        if (this.tokenMatchesSearch(token, searchTerm)) {
          const tokenId = token.profile_id || token.docid;
          this.searchHighlightMap[tokenId] = true;
          this.searchMatches.push({
            tokenId: tokenId,
            stageIndex: stageIndex,
            tokenIndex: tokenIndex,
            type: 'token'
          });
        }
      });
    });

    if (this.searchMatches.length > 0) {
      this.currentMatchIndex = 0;
      this.highlightCurrentMatch();
    }
  }

  tokenMatchesSearch(token: any, searchTerm: string): boolean {
    const profileData = this.mapProfileData[token.profile_id];
    if (!profileData) return false;

    const transform = (val: any) => this.caseSensitiveSearch
      ? (val || '').toString()
      : (val || '').toString().toLowerCase();

    const name = transform(profileData['name']);
    const email = transform(profileData['email']);
    const phone = transform(profileData['number']);
    const tokenNumber = transform(token.tokennumber);

    if (name.includes(searchTerm) ||
      email.includes(searchTerm) ||
      phone.includes(searchTerm) ||
      tokenNumber.includes(searchTerm)) {
      return true;
    }

    // Check people involved
    if (token.people_involved && Array.isArray(token.people_involved)) {
      return token.people_involved.some((specialistId: string) => {
        const specialistData = this.mapProfileData[specialistId];
        if (!specialistData) return false;
        return transform(specialistData['name']).includes(searchTerm) ||
          transform(specialistData['email']).includes(searchTerm);
      });
    }

    return false;
  }

  goToNextMatch() {
    if (this.searchMatches.length === 0) return;
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
    this.highlightCurrentMatch();
  }

  goToPreviousMatch() {
    if (this.searchMatches.length === 0) return;
    this.currentMatchIndex = this.currentMatchIndex - 1;
    if (this.currentMatchIndex < 0) {
      this.currentMatchIndex = this.searchMatches.length - 1;
    }
    this.highlightCurrentMatch();
  }

  highlightCurrentMatch() {
    if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.searchMatches.length) {
      return;
    }

    const match = this.searchMatches[this.currentMatchIndex];

    // Reset previous highlights
    this.currentHighlightTokenId = null;
    this.currentHighlightStageKey = null;

    if (match.type === 'stage') {
      this.currentHighlightStageKey = match.tokenId;
    } else {
      this.currentHighlightTokenId = match.tokenId;

      // Ensure the stage has enough items loaded to show the match
      const stage = this.stageQueue[match.stageIndex];
      if (stage) {
        const currentDisplayCount = this.stageDisplayCounts[stage.stageKey] || this.PAGE_SIZE;
        if (match.tokenIndex >= currentDisplayCount) {
          this.stageDisplayCounts[stage.stageKey] = match.tokenIndex + 5;
        }
      }
    }

    setTimeout(() => this.scrollToMatch(match), 100);
  }

  scrollToMatch(match: SearchMatch) {
    let element: Element | null = null;

    if (match.type === 'stage') {
      element = document.querySelector(`[data-stage-key="${match.tokenId}"]`);
    } else {
      element = document.querySelector(`[data-token-id="${match.tokenId}"]`);
    }

    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }

  isCurrentMatch(token: any): boolean {
    const tokenId = token.profile_id || token.docid;
    return this.currentHighlightTokenId === tokenId;
  }

  isSearchMatch(token: any): boolean {
    const tokenId = token.profile_id || token.docid;
    return this.searchHighlightMap[tokenId] === true;
  }

  isCurrentStageMatch(stageKey: string): boolean {
    return this.currentHighlightStageKey === stageKey;
  }

  isStageMatch(stageKey: string): boolean {
    return this.stageHighlightMap[stageKey] === true;
  }

  clearSearch() {
    this.searchFilter = '';
    this.searchMatches = [];
    this.searchHighlightMap = {};
    this.stageHighlightMap = {};
    this.currentMatchIndex = -1;
    this.currentHighlightTokenId = null;
    this.currentHighlightStageKey = null;
    this.isSearchActive = false;
    this.processTokensIntoStages(this.allTokensData);
  }

  toggleCaseSensitive() {
    this.caseSensitiveSearch = !this.caseSensitiveSearch;
    if (this.searchFilter) {
      this.performSearch();
    }
  }

  getMatchPositionText(): string {
    if (this.searchMatches.length === 0) {
      return this.searchFilter ? 'No matches' : '';
    }
    return `${this.currentMatchIndex + 1} of ${this.searchMatches.length}`;
  }

  /**
   * Highlight matching text in a string - returns SafeHtml
   */
  highlightText(text: string): SafeHtml {
    if (!this.searchFilter || !this.isSearchActive || !text) {
      return text;
    }

    const searchTerm = this.searchFilter.trim();
    const flags = this.caseSensitiveSearch ? 'g' : 'gi';
    const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, flags);

    const highlighted = text.replace(regex, '<mark class="search-highlight">$1</mark>');
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }

  /**
   * Check if text contains the search term
   */
  textContainsSearch(text: string): boolean {
    if (!this.searchFilter || !this.isSearchActive || !text) {
      return false;
    }

    const searchTerm = this.caseSensitiveSearch
      ? this.searchFilter.trim()
      : this.searchFilter.toLowerCase().trim();

    const compareText = this.caseSensitiveSearch
      ? text
      : text.toLowerCase();

    return compareText.includes(searchTerm);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Rename existing clearSearch for stages:
  clearStageSearch() {
    this.stageSearchTerm = '';
    this.filteredAvailableStages = [...this.availableStages];
  }

  //dharshan
  clearAllFilters() {
    this.searchFilter = '';
    this.selectedSegments = [];
    this.selectedTags = [];
    this.preassignedFilter = 'all';
    this.approvedFilter = 'all';
    this.approvedDropdownOpen = false;
    this.dfuFilterActive = false;
    this.reminderTodayFilterActive = false;
    this.selectedStageSlot = null;
    this.dateRangeStart = null;
    this.dateRangeEnd = null;
    this.showDateRangePicker = false;
    this.availableTimeSlots = [];
    this.selectedTimeSlots = [];
    this.selectedCustomerSupportCategories = [];
    this.customerSupportDropdownOpen = false;
    this.showTimeSlotPicker = false;
    this.showTimeDropdown = false;
    this.selectedArenaEventId = null;
    this.selectedEventParticipation = null;
    this.arenaEventFilterList = [];
    this.arenaEventProfileMap = {};
    this.arenaEventDropdownOpen = false;
    this.eventParticipationDropdownOpen = false;
    this.eventParticipationSearchTerm = '';
    this.atcFilterActive = false;
    this.atcFilter = 'none';
    this.atcDropdownOpen = false;
    this.noAtcFilterActive = false;
    this.noAtcProfileIds = new Set();
    this.noAtcCount = 0;
    this.evolutionMappingLiveFilter = 'all';
    this.evolutionMappingLiveMap = {};
    this.evolutionMappingLiveLoaded = false;
    this.clearSearch();
    this.processTokensIntoStages(this.allTokensData);
    this.selectedVariations = [];
    this.variationDropdownOpen = false;
  }

  areAllSelected(): boolean {
    let tokens: any[] = [];

    if (this.selectedStages.length > 0) {
      tokens = this.getMergedParticipants();
    } else {
      tokens = this.getStageParticipants(this.selectedChatStage)?.['tokenlist'] || [];
    }

    if (tokens.length === 0) return false;

    const selectedProfileIds = new Set(Array.from(this.selectedTokens).map(t => t.profile_id));
    return tokens.every(token => selectedProfileIds.has(token.profile_id));
  }

  toggleSelectAll() {
    if (this.areAllSelected()) {
      this.selectedTokens.clear();
    } else {
      let tokens: any[] = [];

      if (this.selectedStages.length > 0) {
        tokens = this.getMergedParticipants();
      } else {
        tokens = this.getStageParticipants(this.selectedChatStage)?.['tokenlist'] || [];
      }

      this.selectedTokens.clear();
      tokens.forEach(token => this.selectedTokens.add(token));
    }
  }

  getParticipantSegments(profileId: string): string[] {
    const profileParticipantLists = this.participantListMap[profileId] || [];
    const segmentNames: string[] = [];

    this.availableSegments.forEach(segment => {
      const segmentParticipantLists = this.segmentParticipantListMap[segment.id] || [];
      const isInSegment = profileParticipantLists.some(plId => segmentParticipantLists.includes(plId));
      if (isInSegment) {
        segmentNames.push(segment.segmentname || segment.name || segment.id);
      }
    });

    return segmentNames;
  }

  getParticipantTags(profileId: string): string[] {
    const metadata = this.participantMetaDataMap[profileId];
    if (!metadata) return [];

    const profileTags = metadata['profiletags'] || [];
    const tagNames: string[] = [];

    profileTags.forEach(tagId => {
      const tag = this.availableTags.find(t => t.docid === tagId);
      if (tag) {
        tagNames.push(tag.name);
      }
    });

    return tagNames;
  }

  // Method to get merged participants from selected stages
  getMergedParticipants(): any[] {
    const mergedTokens: any[] = [];
    const addedProfileIds = new Set<string>();

    this.selectedStages.forEach(stageKey => {
      const stage = this.stageQueue.find(s => s.stageKey === stageKey);
      if (stage && stage.tokenlist) {
        stage.tokenlist.forEach(token => {
          if (!addedProfileIds.has(token.profile_id)) {
            addedProfileIds.add(token.profile_id);
            mergedTokens.push({
              ...token,
              fromStage: stage.stagename,
              fromStageType: stage.type
            });
          }
        });
      }
    });

    return mergedTokens;
  }

  // Update onStageSelectionChange to use merged participants
  onStageSelectionChange() {
    this.selectedTokens.clear();

    const mergedParticipants = this.getMergedParticipants();
    mergedParticipants.forEach(token => {
      this.selectedTokens.add(token);
    });
  }

  // Add after getTagName method
  filterSegments() {
    if (!this.segmentSearchTerm || this.segmentSearchTerm.trim() === '') {
      this.filteredSegments = [...this.availableSegments];
    } else {
      const searchTerm = this.segmentSearchTerm.toLowerCase().trim();
      this.filteredSegments = this.availableSegments.filter(segment => {
        const name = (segment.segmentname || segment.name || segment.id || '').toLowerCase();
        return name.includes(searchTerm);
      });
    }
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

  clearSegmentSearch() {
    this.segmentSearchTerm = '';
    this.filteredSegments = [...this.availableSegments];
  }

  clearTagSearch() {
    this.tagSearchTerm = '';
    this.filteredTags = [...this.availableTags];
  }

  onSegmentDropdownOpen() {
    this.filteredSegments = [...this.availableSegments];
    this.segmentSearchTerm = '';
  }

  onTagDropdownOpen() {
    this.filteredTags = [...this.availableTags];
    this.tagSearchTerm = '';
  }

  isSegmentSelected(segmentId: string): boolean {
    return this.selectedSegments.includes(segmentId);
  }

  isTagSelected(tagId: string): boolean {
    return this.selectedTags.includes(tagId);
  }

  toggleSegmentSelection(segmentId: string) {
    const index = this.selectedSegments.indexOf(segmentId);
    if (index > -1) {
      this.selectedSegments.splice(index, 1);
    } else {
      this.selectedSegments.push(segmentId);
    }
    this.onSegmentFilterChange();
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

  getSegmentName(segmentId: string): string {
    const segment = this.availableSegments.find(s => s.id === segmentId);
    return segment?.segmentname || segment?.name || segmentId;
  }

  // Method to get preassigned specialists names
  getPreassignedNames(token: any): string {
    if (!token?.['preassigned']) return '';
    
    const names: string[] = [];
    const entries = this.getPreassignedEntries(token);
    
    entries.forEach(entry => {
      entry.value.forEach(studioId => {
        const studio = this.mapStudio[studioId];
        if (studio && studio['participants']) {
          studio['participants'].forEach(participantId => {
            const name = this.mapProfileData[participantId]?.['name'];
            if (name && !names.includes(name)) {
              names.push(name);
            }
          });
        }
      });
    });
    
    return names.join(', ');
  }

  // Method to get participant segment names for export
  getParticipantSegmentNames(profileId: string): string {
    return this.getParticipantSegments(profileId).join(', ');
  }

  // Method to get participant tag names for export
  getParticipantTagNames(profileId: string): string {
    const metadata = this.participantMetaDataMap[profileId];
    if (!metadata) return '';
    
    const profileTags = metadata['profiletags'] || [];
    const tagNames: string[] = [];
    
    profileTags.forEach(tagId => {
      const tagName = this.mapTagsName[tagId];
      if (tagName) {
        tagNames.push(tagName);
      }
    });
    
    return tagNames.join(', ');
  }

  // Method to handle preassigned filter change
  onPreassignedFilterChange() {
    this.processTokensIntoStages(this.allTokensData);
  }

  onApprovedFilterChange() {
    this.processTokensIntoStages(this.allTokensData);
  }

  //dharshan
  onStageSlotChange() {  
    if (!this.selectedStageSlot) {
      this.dateRangeStart = null;
      this.dateRangeEnd = null;
      this.availableTimeSlots = [];
      this.selectedTimeSlots = [];
      this.showTimeSlotPicker = false;
    }
    this.processTokensIntoStages(this.allTokensData);
  }

  onDateRangeChange() {
    if (this.dateRangeStart && this.dateRangeEnd) {
      this.dateRangeEnd.setHours(23, 59, 59, 999);
      this.selectedTimeSlots = [];
      this.extractUniqueTimeSlots();
      this.processTokensIntoStages(this.allTokensData);
    }
  }

  clearStageSlotFilter() {
    this.selectedStageSlot = null;
    this.dateRangeStart = null;
    this.dateRangeEnd = null;
    this.showDateRangePicker = false;
    this.availableTimeSlots = [];
    this.selectedTimeSlots = [];
    this.showTimeSlotPicker = false;
    this.showTimeDropdown = false;
    this.processTokensIntoStages(this.allTokensData);
  }
 
  //dharshan
  extractUniqueTimeSlots() {
    if (!this.dateRangeStart || !this.dateRangeEnd || !this.selectedStageSlot) {
      this.availableTimeSlots = [];
      this.selectedTimeSlots = [];
      this.showTimeSlotPicker = false;
      return;
    }
    const timeMap = new Map<string, { count: number; title?: string }>();
    this.allTokensData.forEach(token => {
      const slotData = token.selectedstageslot;
      if (!slotData) return;

      Object.values(slotData).forEach((slot: any) => {
        if (slot?.stagename !== this.selectedStageSlot) return;
        if (!slot?.startdate || !slot?.enddate) return;

        let startDate: Date;
        let endDate: Date;

        if (slot.startdate.toDate) {
          startDate = slot.startdate.toDate();
        } else if (slot.startdate instanceof Date) {
          startDate = slot.startdate;
        } else return;

        if (slot.enddate.toDate) {
          endDate = slot.enddate.toDate();
        } else if (slot.enddate instanceof Date) {
          endDate = slot.enddate;
        } else return;

        const endOfDay = new Date(this.dateRangeEnd!);
        endOfDay.setHours(23, 59, 59, 999);

        if (startDate >= this.dateRangeStart! && startDate <= endOfDay) {
          const startTime = startDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          const endTime = endDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });

          const key = `${startTime} – ${endTime}`;
          const existing = timeMap.get(key);
          const titleKey = `${this.selectedStageSlot}_${startDate.getTime()}_${endDate.getTime()}`;
          const title = this.slotTitleMap[titleKey] || '';
          timeMap.set(key, { count: (existing?.count || 0) + 1, title });
        }
      });
    });

    // Sort chronologically
    this.availableTimeSlots = Array.from(timeMap.entries())
      .sort((a, b) => {
        const timeA = new Date(`1970/01/01 ${a[0].split(' – ')[0]}`).getTime();
        const timeB = new Date(`1970/01/01 ${b[0].split(' – ')[0]}`).getTime();
        return timeA - timeB;
      })
      .map(([timeRange, data]) => ({ timeRange, count: data.count, title: data.title }));

    this.showTimeSlotPicker = this.availableTimeSlots.length > 0;
  }

  selectTimeSlot(time: string | null) { 
    if (time === null) {
      // Clicking "All" clears all selections
      this.selectedTimeSlots = [];
    } else {
      const index = this.selectedTimeSlots.indexOf(time);
      if (index > -1) {
        this.selectedTimeSlots.splice(index, 1);
      } else {
        this.selectedTimeSlots.push(time);
      }
    }
    this.processTokensIntoStages(this.allTokensData);
  }

  openTimeDropdown(event: MouseEvent) { //dharshan
    event.stopPropagation();
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const dropdownWidth = 300;
    const dropdownHeight = 280;

    // Check if dropdown would go off bottom of screen
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: string;
    if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
      // Flip upward
      top = (rect.top - dropdownHeight - 8) + 'px';
    } else {
      // Default below
      top = (rect.bottom + 8) + 'px';
    }

    if (rect.right - dropdownWidth < 0) {
      this.timeDropdownPosition = {
        top: top,
        left: rect.left + 'px',
        right: 'auto'
      };
    } else {
      this.timeDropdownPosition = {
        top: top,
        right: (window.innerWidth - rect.right) + 'px',
        left: 'auto'
      };
    }

    this.showTimeDropdown = !this.showTimeDropdown;
  }
  getTotalSlotCount(): number { //dharshan
    return this.availableTimeSlots.reduce((sum, slot) => sum + slot.count, 0);
  }

  getStageNamesForCount(stageCountDoc: any): string[] { //dharshan
    if (!stageCountDoc?.stage) return [];   
    return stageCountDoc.stage.map((s: any) => {
      const status = s['status'];
      const statusLabel = status === 'waiting' ? '(W)' 
        : status === 'instudio' ? '(A)' 
        : status === 'queued' ? '(Q)' 
        : '';
      return `${s['stagename']} ${statusLabel}`;
    });
  }

  fetchStageCountsForQueue() {
    if (!this.selectedQueue) {
      this.stageCountCards = [];
      return;
    }

    // Unsubscribe from previous subscription if it exists
    if (this.stageCountSubscription) {
      this.stageCountSubscription.unsubscribe();
    }

    this.stageCountSubscription = collectionData(query(collection(this.firestore, 'stage opportunity count'),where('queuelist', 'array-contains', this.selectedQueue.docid))).pipe(takeUntil(this.subscriptionHandle),takeUntil(this.liveQueueSubscription)).subscribe(data => 
    {
      this.stageCountCards = (data as any[])
        .filter((e: any) => e['kind'] !== 'phase')
        .sort((a: any, b: any) =>
          (a['sequence'] ?? 999) - (b['sequence'] ?? 999)
        );
    });
  }

  openStageCountPanel(card: any) { //dharshan
    if (this.selectedStageCountCard?.docid === card.docid) {
      this.clearStageCountFilter();
      return;
    }
    
    this.selectedStageCountCard = card;
    this.showStageCountPanel = true;
    this.activeStageCountFilter = card.stage?.map((s: any) => s.stagename) || [];
    this.stageQueue = [...this.stageQueue];
  }

  closeStageCountPanel() { //dharshan
    this.showStageCountPanel = false;
  }

  clearStageCountFilter() { //dharshan
    this.activeStageCountFilter = [];
    this.selectedStageCountCard = null;
    this.showStageCountPanel = false;
  }

  getStageCountTotal(stageCountDoc: any): number { //dharshan
    if (!stageCountDoc?.stage) return 0;
    let total = 0;
    stageCountDoc.stage.forEach((stageConfig: any) => {
      total += this.getIndividualStageCount(stageConfig);
    });
    return total;
  }

  getIndividualStageCount(stageConfig: any): number { //dharshan
    const stageName = stageConfig['stagename'];
    const status = stageConfig['status'];

    const stageColumn = this.stageQueue?.find((col: any) =>
      col.stagename === stageName
    );

    if (!stageColumn) return 0;

    let tokens = stageColumn.allTokens || stageColumn.tokenlist || [];

    if (status === 'waiting') {
      tokens = tokens.filter((t: any) => t['status'] === 'ready');
    } else if (status === 'queued') {
      tokens = tokens.filter((t: any) =>
        t['status'] == null || t['status'] === 'queued' || t['status'] === 'invited'
      );
    } else if (status === 'instudio') {
      tokens = tokens.filter((t: any) => t['status'] === 'instudio');
    }

    return tokens.length;
  }

  getStatusLabel(status: string | null): string { //dharshan
    if (!status) return 'All';
    switch (status) {
      case 'waiting': return 'Waiting';
      case 'queued': return 'Queued';
      case 'instudio': return 'In Studio';
      default: return status;
    }
  }

  get filteredStageQueue(): any[] {
    let queue = this.stageQueue;
    if (this.evolutionMappingLiveFilter !== 'all') {
      return queue.filter(
        column => column.stagename === 'In Evolution Mapping Activity'
      );
    }

    if (this.activeStageCountFilter.length === 0) {
      return queue;
    }

    return queue.filter(column =>
      this.activeStageCountFilter.includes(column.stagename)
    );
  }
  

  openAddLinkDialog() {
  this.newLinkData = { screenName: '', url: '', isInternal: false };
  this.showAddLinkDialog = true;
}

  closeAddLinkDialog() {
    this.showAddLinkDialog = false;
    this.newLinkData = { screenName: '', url: '', isInternal: false };
  }

  async saveQuickLink() {
    if (!this.newLinkData.screenName || !this.newLinkData.url) return;

    try {
      const docRef = doc(this.firestore, 'classify', 'queuesystem');
      const docSnap = await getDoc(docRef);
      
      let existingLinks = [];
      if (docSnap.exists() && docSnap.data()['quicklinks']) {
        existingLinks = docSnap.data()['quicklinks'];
      }

      existingLinks.push({
        screenName: this.newLinkData.screenName,
        url: this.newLinkData.url,
        isInternal: this.newLinkData.isInternal
      });

      await setDoc(docRef, { quicklinks: existingLinks }, { merge: true });
      
      this.newLinkData = { screenName: '', url: '', isInternal: false };
      this.guard.openSnackBar('Link added!', 'OK',600);
    } catch (error) {
      console.error('Error saving quick link:', error);
      this.guard.openSnackBar('Error saving link', 'OK',600);
    }
  }

  openLink(url: string, isInternal: boolean = false) {
    if (isInternal) {
      const baseUrl = window.location.origin;
      window.open(`${baseUrl}/${url}`, '_blank');
    } else {
      window.open(url, '_blank');
    }
  }

  async removeLink(index: number) {
    const link = this.quickLinks[index];
    if (!confirm(`Remove link "${link.screenName}"?`)) return;

    try {
      const docRef = doc(this.firestore, 'classify', 'queuesystem');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        let existingLinks = docSnap.data()['quicklinks'] || [];
        existingLinks.splice(index, 1);
        await setDoc(docRef, { quicklinks: existingLinks }, { merge: true });
        this.guard.openSnackBar('Link removed', 'OK',600);
      }
    } catch (error) {
      console.error('Error removing quick link:', error);
      this.guard.openSnackBar('Error removing link', 'OK',600);
    }
  }
  startEditLink(index: number) {
    this.editingLinkIndex = index;
    this.editingLinkData = { ...this.quickLinks[index] };
  }

  cancelEditLink() {
    this.editingLinkIndex = -1;
    this.editingLinkData = { screenName: '', url: '', isInternal: false };
  }

  async saveEditLink() {
    if (!this.editingLinkData.screenName || !this.editingLinkData.url) return;

    try {
      const docRef = doc(this.firestore, 'classify', 'queuesystem');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        let existingLinks = docSnap.data()['quicklinks'] || [];
        existingLinks[this.editingLinkIndex] = {
          screenName: this.editingLinkData.screenName,
          url: this.editingLinkData.url,
          isInternal: this.editingLinkData.isInternal
        };
        await setDoc(docRef, { quicklinks: existingLinks }, { merge: true });
        this.guard.openSnackBar('Link updated!', 'OK',600);
        this.cancelEditLink();
      }
    } catch (error) {
      console.error('Error updating link:', error);
      this.guard.openSnackBar('Error updating link', 'OK',600);
    }
  }

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public dialog: MatDialog,
    public datepipe: DatePipe,
    public http: HttpClient,
    public ngZone: NgZone,
    private sanitizer: DomSanitizer,
    private router: Router
  ) {
    guard.getRoles().then(roles => {
      this.roles = roles;
      this.profileid = roles.profile_ref.id;

      this.guard.getProductMap().then((product)=> this.mapProduct = product);

      // this.deleteOption = (
      //   (environment.firebase.projectId == "fir-sample-aae4a" && this.profileid == 'l0ApFnXuM5Ac8tpqJQnk') ||
      //   (environment.firebase.projectId == "test-environment-841c3" && this.profileid == 'g2mQ7GiD6PSV8oaZnZLb')
      // );

      const queueCollection = collection(this.firestore, "queue generation");
      let queueQuery: Query<DocumentData>;

      if (roles.ah || roles.admin) {
        queueQuery = query(queueCollection, orderBy("queuename"));
      } else {
        queueQuery = query(queueCollection, where("queueadmin", "array-contains", this.profileid), orderBy("queuename"));
      }

      this.queueSubscription = collectionData(queueQuery, { idField: 'id' }).pipe(takeUntil(this.subscriptionHandle)).subscribe(queue => {
        let tempSelectedQueue;
        this.queueList = queue;
        if(![null, undefined, ""].includes(this.selectedQueue)) {
          tempSelectedQueue = queue.find((e)=> e['docid'] == this.selectedQueue['docid']);
        }
        this.liveQueueList = queue.filter(e => e["queuestartdate"].toDate() <= new Date() && e["queueenddate"].toDate() >= new Date());
        this.selectedQueue = tempSelectedQueue;
      });

      const colRef = collection(this.firestore, 'classify');
      const q = query(colRef, where(documentId(), 'in', ['postmarkstatus', 'watistatus']));

      this.docsSubscription = collectionData(q, { idField: 'id' }).subscribe({
        next: (docs) => {
          for (let i = 0; i < docs.length; i++) {
            const element = docs[i];

            if (element['id'] == 'postmarkstatus') {
              this.isEmailActive = element['active'] ? true : false;
            } else if (element['id'] == 'watistatus') {
              this.isWhatsAppActive = element['eventwati'] ? true : false;;
            }
          }
        },
        error: (error) => {
          console.error('Error:', error);
        }
      });

    });
  }

  ngOnInit(): void {
    collectionData(query(collection(this.firestore, "users_roles"), orderBy("name"))).pipe(takeUntil(this.subscriptionHandle)).subscribe(profile => {
      var specialist = profile.filter(e => e["eis"] || e["changeagent"] || e["ahmember"])
      specialist.forEach(e => {
        e["value"] = e["profile_ref"].id
      })
      this.specialistList = specialist
    })
    collectionData(collection(this.firestore, "bigactivity")).pipe(takeUntil(this.subscriptionHandle)).subscribe(list => {
      this.activityList = list
      this.activityList.forEach(e => {
        this.mapActivity[e["docid"]] = e["activity"]
      })
    });

    collectionData(query(collection(this.firestore, "participant tags"), where("tagsfor", "array-contains", "queue event")), { idField: 'docid' }).pipe(takeUntil(this.subscriptionHandle)).subscribe(tags => {
      this.availableTags = tags;
      this.mapTagsName = {};
      this.mapTagsMetaData = {};
      this.filteredTags = [...tags];
      for (let i = 0; i < tags.length; i++) {
        const e = tags[i];
        this.mapTagsName[e['id']] = e['name'];
        this.mapTagsMetaData[e['id']] = e;
      }
    });
    const drawerContent = document.querySelector('mat-drawer-content');
      if (drawerContent) {
        drawerContent.addEventListener('scroll', () => {
          this.showTimeDropdown = false;
        });
      }

    getDocs(
      query(collection(this.firestore, 'products'), where('mode', '==', 'Priority Mode'))
    ).then(prioritySnap => {
      this.priorityModeProductIds = prioritySnap.docs.map(d => d.id);
    }); 

    this.quickLinksSubscription = collectionData(
      query(collection(this.firestore, 'classify'), where(documentId(), '==', 'queuesystem')),
      { idField: 'id' }
    ).pipe(takeUntil(this.subscriptionHandle)).subscribe(docs => {
      if (docs.length > 0) {
        const data = docs[0];
        this.quickLinks = data['quicklinks'] || [];
      }
    });
    if (this.selectedQueue) {
      this.loadReminders();
    }
    this.reminderCheckInterval = setInterval(() => {
      if (Object.keys(this.mapProfileData).length > 0) {
        this.checkForDueReminders();
      }
    }, 30000);
  }

  ngAfterViewInit(): void {
    this.guard.getProfileMap().then(data => {
      this.mapProfileData = data.docdata;
      this.mapProfileIdToEmail = Object.fromEntries(
        Object.entries(this.mapProfileData).map(([id, data]) => [id, data['email']])
      );

      this.checkForDueReminders();
    });

    this.participantSubscription = collectionData(collection(this.firestore, 'participant metadata'), { idField: 'id' }).pipe(takeUntil(this.subscriptionHandle)).subscribe((participantdoc) => {
      participantdoc.forEach((data) => {
        this.participantMetaDataMap[data['profileid']] = data;
      });
      this.allParticipants.set(participantdoc);
      if (this.dfuFilterActive && this.allTokensData.length > 0) {
        this.processTokensIntoStages(this.allTokensData);
      }
    });
  }

  ngOnDestroy() {
    this.subscriptionHandle.next();
    this.subscriptionHandle.complete();
    this.liveQueueSubscription.next();
    this.liveQueueSubscription.complete();
    this.participantSubscription.unsubscribe();
    if (this.docsSubscription) {
      this.docsSubscription.unsubscribe();
    }
    if (this.stageCountSubscription) {
      this.stageCountSubscription.unsubscribe();
    }
    if (this.quickLinksSubscription) {  
      this.quickLinksSubscription.unsubscribe();
    }
    const drawerContent = document.querySelector('mat-drawer-content');
    if (drawerContent) {
      drawerContent.removeEventListener('scroll', () => {});
    }
    if (this.reminderCheckInterval) {
      clearInterval(this.reminderCheckInterval);
      this.reminderCheckInterval = null;
    }
    if (this.remindersSubscription) {
      this.remindersSubscription.unsubscribe();
    }

    this.timelineUnsubs.forEach(u => u());
  }

  ngAfterViewChecked() {
    if (this.shouldScrollTracks) {
      this.shouldScrollTracks = false;
      this.scrollTracksToEnd();
    }
  }

  async onQueueSelect() {

    // Reset subscription
    this.liveQueueSubscription.next()
    this.liveQueueSubscription.complete()
    this.liveQueueSubscription = new Subject<void>();

    this.stageActivityCache = null;
    this.stageActivityCacheQueueId = null;
    this.stageActivityCacheLoading = false;
    this.showStageActivityPanel = false;
    
    // Reset pagination and filters
    this.stageDisplayCounts = {};
    this.stageLoadingMore = {};
    this.searchFilter = '';
    this.selectedSegments = [];
    this.allTokensData = [];
    this.selectedArenaEventId = null;
    this.selectedEventParticipation = null;
    this.arenaEventFilterList = [];
    this.arenaEventProfileMap = {};
    this.arenaEventDropdownOpen = false;
    this.eventParticipationDropdownOpen = false;
    this.eventParticipationListLoaded = false; 
    this.eventParticipationSearchTerm = '';
    this.atcValidatedProfileIds = new Set();
    this.atcUnvalidatedProfileIds = new Set();
    this.atcAllProfileIds = new Set();
    this.atcFilterActive = false;
    this.atcFilter = 'none';
    this.atcDataLoaded = false;
    this.atcDropdownOpen = false;
    this.noAtcFilterActive = false;
    this.noAtcProfileIds = new Set();
    this.noAtcCount = 0;
    this.customerSupportMap = {};
    this.availableCustomerSupportCategories = [];
    this.selectedCustomerSupportCategories = [];
    this.atcDateRangeOnlyProfileIds = new Set();
    this.evolutionMappingLiveFilter = 'all';
    this.evolutionMappingLiveMap = {};
    this.evolutionMappingLiveLoaded = false;
    this.selectedVariations = [];
    this.variationDropdownOpen = false;

    let count = 0
    this.currentQueueParticipants = [];
    this.approvedProfileIds = new Set();

    // Who got approved for this queue's event. Mirrors the chain used by Event
    // Participation Confirmations: queue -> arena events (eventref == queue) ->
    // event participation request (arenaeventid == arena docid, status approved).
    this.loadApprovedProfileIds(this.selectedQueue.docid);

    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Staging Queue..."
      },
      disableClose: true
    })


    // Fetch segments for this queue
    await this.fetchQueueSegments();

    
    collectionData(query(collection(this.firestore, "queue studio pairing"), where("queueref", "==", doc(this.firestore, "queue generation", this.selectedQueue["docid"])))).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe(studio => {
      this.queueStudioList = studio.filter(e => e["studioin"] == true && e["checkin"] == true)
      this.mapStudio = studio.reduce(function (r, a) {
        r[a["docid"]] = r[a["docid"]] || {},
          r[a["docid"]] = a
        return r
      }, {})
      count++
      if (count >= 6) {
        loading.close()
      }
    })

    this.pendingInvitationTokenIds = new Set();
    this.pendingInvitationPairingMap = {};
    collectionData(query(
      collection(this.firestore, "studioinvitation"),
      where("queueref", "==", doc(this.firestore, "queue generation", this.selectedQueue["docid"])),
      where("clientresponse", "==", null)
    )).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe(invitations => {
      const now = Date.now();
      const activeInvitations = invitations.filter(inv => {
        const expiry = inv['expirydate']?.toDate ? inv['expirydate'].toDate() : inv['expirydate'];
        return !expiry || expiry.getTime() >= now;
      });
      const tokenIds = new Set<string>();
      const pairingMap: { [tokenId: string]: string[] } = {};
      for (const inv of activeInvitations) {
        const tokenId = inv['tokenref']?.id;
        if (!tokenId) continue;
        tokenIds.add(tokenId);
        const pairing: string[] = inv['specialistpairing']
          ?? this.mapStudio[inv['studioid']]?.['pairing']
          ?? this.mapStudio[inv['studioid']]?.['participants']
          ?? [];
        pairingMap[tokenId] = pairing;
      }
      this.pendingInvitationTokenIds = tokenIds;
      this.pendingInvitationPairingMap = pairingMap;
    })

    // collectionData(query(collection(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat"), where("senderprofileid", '==', this.profileid), where("pinned", '==', true), orderBy("date", "desc")), { idField: 'id' }).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe(async snap => {
    //   this.pinnedChatList = snap
    //   count++
    //   if (count >= 6) {
    //     loading.close()
    //   }
    // })

    // collectionData(query(collection(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat"), orderBy("date", 'desc'))).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe((chatsnap) => {
    //   this.chatList = {}
    //   for (let i = 0; i < chatsnap.length; i++) {
    //     const element = chatsnap[i];
    //     this.chatList[element['stage']] = this.chatList[element['stage']] || []
    //     this.chatList[element['stage']].push(element)
    //   }
    //   count++
    //   if (count >= 6) {
    //     loading.close()
    //   }
    // });

    collectionData(query(collection(this.firestore, "queue variation"), where("queueref", '==', doc(this.firestore, "queue generation", this.selectedQueue["docid"]))), { idField: 'id' }).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe(variation => {
      this.variationList = [];
      variation.forEach(document => {
        this.mapVariation[document.id] = document
        this.variationList.push(document)
      })
      count++
      if (count >= 6) {
        loading.close()
      }
    });

    collectionData(query(collection(this.firestore, 'queue_token'), where("queueref", "==", doc(this.firestore, "queue generation", this.selectedQueue.docid)), orderBy("logdate", "asc"))).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe(token => {  
      this.allTokensData = token; 
      this.availableStagesFromSlot = this.extractUniqueStagesFromSlot(token);  
      this.processTokensIntoStages(token);
      

      const newProfileIds: string[] = [];

      token.forEach((e) => {
        if (!newProfileIds.includes(e['profile_id'])) {
          if (e['tokenstatus'].toLowerCase() == 'active')
            newProfileIds.push(e['profile_id']);
        }
      });

      const profileIdsChanged = JSON.stringify(this.currentQueueParticipants.sort()) !== JSON.stringify(newProfileIds.sort());

      if (profileIdsChanged) {
        this.currentQueueParticipants = [...new Set(newProfileIds)];

        this.fcmTokenSubscription.next();
        this.setupFcmTokenListener();
      }

      count++
      if (count >= 6) {
        loading.close();
      }
    });

    loading.close();
    this.fetchStageCountsForQueue(); 
    this.loadReminders();
    this.loadCustomerSupportData();
  }

  async fetchLogs(token) {
    const queueGenerationDocRef = doc(this.firestore, "queue generation", this.selectedQueue.docid);
    const stageLogCollection = collection(this.firestore, 'queue stage log');

    let stageLogQuery: Query<DocumentData> = query(
      stageLogCollection,
      where('queueref', '==', queueGenerationDocRef),
      where('profile_id', '==', token.profile_id),
      orderBy('logdate', 'asc')
    );

    await getDocs(stageLogQuery).then((snap) => {
      console.log("Fetched Logs", snap.docs.length);
      this.queuehistory = snap.docs.reduce((r, a) => {
        const data = a.data();
        const profileId = data['profile_id'];

        r[profileId] = r[profileId] || [];

        let peopleInvolvedNames = [];
        if (data['people_involved']) {
          peopleInvolvedNames = data['people_involved'].map(personId => this.mapProfileData[personId]['name'] || personId);
        }
        data['peopleinvolvedname'] = peopleInvolvedNames;

        if (data['logdate']) {
          if (data['logdate'] instanceof Timestamp) {
            this.lastLogDate = data['logdate'].toDate();
          } else if (data['logdate'].toDate && typeof data['logdate'].toDate === 'function') {
            this.lastLogDate = data['logdate'].toDate();
          } else if (data['logdate'] instanceof Date) {
            this.lastLogDate = data['logdate'];
          }
        }

        r[profileId].push(data);
        return r;
      }, {});

    }).then(() => {
      this.toggleStageLog(token);
    });

  }

  toggleStageLog(token: any): void {
    if (!this.showStageLog[token.profile_id]) {
      this.showStageLog[token.profile_id] = true;
    } else {
      this.showStageLog[token.profile_id] = false;
    }
  }

  processTokensIntoStages(token: any[]) {
    var stages = []
    let queryData = token

    // Apply search and filters
    queryData = this.applyFilters(queryData);

    for (let i = 0; i < this.selectedQueue.stages.length; i++) {
      const stage = this.selectedQueue.stages[i];
      var stageProperty = (this.selectedQueue["stageproperty"] ?? {})[stage]
      var compusloryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})

      const stageKey = `${stage}_${i}`;

      // Initialize display count if not set
      if (!this.stageDisplayCounts[stageKey]) {
        this.stageDisplayCounts[stageKey] = this.PAGE_SIZE;
      }

      if (compusloryActivity.length == 0) {
        const allTokens = queryData.filter(e => e["currentstage"] == stage && [null, undefined, false].includes(e['delete']) && e["tokenstatus"] === "Active");
        stages.push({
          stagename: stage,
          tokenlist: allTokens,
          allTokens: allTokens, // Keep all tokens for pagination
          type: null,
          stageKey: stageKey
        })
      }
      else {
        // Queued Token But not Ready
        const queuedKey = `${stage}_queued_${i}`;
        if (!this.stageDisplayCounts[queuedKey]) {
          this.stageDisplayCounts[queuedKey] = this.PAGE_SIZE;
        }
        var queuedToken = queryData.filter(e => e["currentstage"] == stage && (e["status"] == null || e["status"] == "queued" || e["status"] == "invited") && [null, undefined, false].includes(e['delete']) && e["tokenstatus"] === "Active")
        stages.push({
          stagename: stage,
          tokenlist: queuedToken,
          allTokens: queuedToken,
          type: "Queued",
          stageKey: queuedKey
        })

        // Token Ready for Studio
        const waitingKey = `${stage}_waiting_${i}`;
        if (!this.stageDisplayCounts[waitingKey]) {
          this.stageDisplayCounts[waitingKey] = this.PAGE_SIZE;
        }
        var waitingToken = queryData.filter(e => e["currentstage"] == stage && (e["status"] == "ready") && [null, undefined, false].includes(e['delete']) && e["tokenstatus"] === "Active")
        stages.push({
          stagename: stage,
          tokenlist: waitingToken,
          allTokens: waitingToken,
          type: "Waiting",
          stageKey: waitingKey
        })

        const activityKey = `${stage}_activity_${i}`;
        if (!this.stageDisplayCounts[activityKey]) {
          this.stageDisplayCounts[activityKey] = this.PAGE_SIZE;
        }
        var studioToken = queryData.filter(e => e["currentstage"] == stage && e["liveassignmentid"] != null && e["liveassignmentid"] != undefined && [null, undefined, false].includes(e['delete']) && e["tokenstatus"] === "Active")
        stages.push({
          stagename: stage,
          tokenlist: studioToken,
          allTokens: studioToken,
          type: "Activity",
          stageKey: activityKey
        })
      }
    }

    // Add Unattended tokens stage
    const unattendedKey = 'unattended';
    if (!this.stageDisplayCounts[unattendedKey]) {
      this.stageDisplayCounts[unattendedKey] = this.PAGE_SIZE;
    }
    var unattendedTokens = queryData.filter(e =>
      e["tokenstatus"] === "inActive" &&
      [null, undefined, false].includes(e['delete'])
    )

    if (unattendedTokens.length > 0) {
      stages.push({
        stagename: "Unattended Participants",
        tokenlist: unattendedTokens,
        allTokens: unattendedTokens,
        stageKey: unattendedKey
      })
    }

    this.stageQueue = stages

    this.totalParticipants = this.stageQueue.filter(stage => stage.stagename !== "Unattended Participants").reduce(function (sum, stage) {
      return sum + stage.allTokens.length;
    }, 0);
  }

  applyFilters(tokens: any[]): any[] {
    let filteredTokens = [...tokens];

    if (this.searchFilter && this.searchFilter.trim() !== '') {
      const searchTerm = this.searchFilter.toLowerCase().trim();
      filteredTokens = filteredTokens.filter(token => {
        const profileData = this.mapProfileData[token.profile_id];
        if (!profileData) return false;

        const name = (profileData['name'] || '').toLowerCase();
        const email = (profileData['email'] || '').toLowerCase();
        const phone = (profileData['number'] || '').toString().toLowerCase();

        let peopleInvolvedMatch = false;
        if (token.people_involved && Array.isArray(token.people_involved)) {
          peopleInvolvedMatch = token.people_involved.some((specialistId: string) => {
            const specialistData = this.mapProfileData[specialistId];
            if (!specialistData) return false;
            const specialistName = (specialistData['name'] || '').toLowerCase();
            const specialistEmail = (specialistData['email'] || '').toLowerCase();
            return specialistName.includes(searchTerm) || specialistEmail.includes(searchTerm);
          });
        }

        return name.includes(searchTerm) || email.includes(searchTerm) || phone.includes(searchTerm) || peopleInvolvedMatch;
      });
    }

    // Segment filter
    if (this.selectedSegments.length > 0) {
      filteredTokens = filteredTokens.filter(token => {
        const profileId = token.profile_id;
        const profileParticipantLists = this.participantListMap[profileId] || [];

        return this.selectedSegments.some(segmentId => {
          const segmentParticipantLists = this.segmentParticipantListMap[segmentId] || [];
          return profileParticipantLists.some(plId => segmentParticipantLists.includes(plId));
        });
      });
    }

    // Tag filter
    if (this.selectedTags.length > 0) {
      filteredTokens = filteredTokens.filter(token => {
        const profileId = token.profile_id;
        const metadata = this.participantMetaDataMap[profileId];
        if (!metadata) return false;

        const profileTags = metadata['profiletags'] || [];
        return this.selectedTags.some(tagId => profileTags.includes(tagId));
      });
    }

    // Preassigned filter
    if (this.preassignedFilter === 'preassigned') {
      filteredTokens = filteredTokens.filter(token => {
        return token['preassigned'] && Object.keys(token['preassigned']).length > 0 &&
          Object.values(token['preassigned']).some((val: any) => val && val.length > 0);
      });
    } else if (this.preassignedFilter === 'not-preassigned') {
      filteredTokens = filteredTokens.filter(token => {
        return !token['preassigned'] || Object.keys(token['preassigned']).length === 0 ||
          !Object.values(token['preassigned']).some((val: any) => val && val.length > 0);
      });
    }

    // Approved filter (approved for this queue's event)
    if (this.approvedFilter === 'approved') {
      filteredTokens = filteredTokens.filter(token => this.approvedProfileIds.has(token['profile_id']));
    } else if (this.approvedFilter === 'not-approved') {
      filteredTokens = filteredTokens.filter(token => !this.approvedProfileIds.has(token['profile_id']));
    }
    //dharshan
    if (this.selectedStageSlot) {
      filteredTokens = filteredTokens.filter(token => {
        if (!token.selectedstageslot) return false;

        let hasStage = false;
        let matchesDateRange = false;
        let matchesTimeSlot = false;

        Object.values(token.selectedstageslot).forEach((slot: any) => {
          if (slot && slot.stagename === this.selectedStageSlot) {
            hasStage = true;

            if (slot.startdate) {
              let tokenStartDate: Date;
              if (slot.startdate.toDate && typeof slot.startdate.toDate === 'function') {
                tokenStartDate = slot.startdate.toDate();
              } else if (slot.startdate instanceof Date) {
                tokenStartDate = slot.startdate;
              } else return;

              if (this.dateRangeStart && this.dateRangeEnd) {
                if (tokenStartDate >= this.dateRangeStart && tokenStartDate <= this.dateRangeEnd) {
                  matchesDateRange = true;
                  if (this.selectedTimeSlots.length > 0) {
                  let endDate: Date | null = null;

                  if (slot.enddate?.toDate) {
                    endDate = slot.enddate.toDate();
                  } else if (slot.enddate instanceof Date) {
                    endDate = slot.enddate;
                  }

                  const startTime = tokenStartDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  });

                  const endTime = endDate ? endDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }) : '';

                  const tokenTimeRange = endTime
                    ? `${startTime} – ${endTime}`
                    : startTime;

                  if (this.selectedTimeSlots.includes(tokenTimeRange)) {
                    matchesTimeSlot = true;
                  }
                } else {
                  matchesTimeSlot = true;
                }
                }
              } else {
                matchesDateRange = true;
                matchesTimeSlot = true;
              }
            }
          }
        });
        return hasStage && matchesDateRange && matchesTimeSlot;
      });
    }
    if (this.dfuFilterActive) {
      filteredTokens = filteredTokens.filter(
        token => this.getTokenHighlight(token.profile_id) === 'orange'
      );
    }
    if (this.selectedVariations.length > 0) {
      filteredTokens = filteredTokens.filter(token =>
        token.variationid && this.selectedVariations.includes(token.variationid)
      );
    }
    if (this.selectedCustomerSupportCategories.length > 0) {
      filteredTokens = filteredTokens.filter(token => {
        const entries = this.customerSupportMap[token.profile_id] || [];
        return entries.some(entry => 
          this.selectedCustomerSupportCategories.includes(entry.category)
        );
      });
    }
    if (this.selectedEventParticipation) {
    if (this.selectedArenaEventId) {
      const profileIds = this.arenaEventProfileMap[this.selectedArenaEventId];
      filteredTokens = filteredTokens.filter(token =>
        profileIds?.has(token.profile_id)
      );
    } else {
      const allProfileIds = new Set<string>();
      Object.values(this.arenaEventProfileMap).forEach(profileSet => {
        profileSet.forEach(id => allProfileIds.add(id));
      });
      filteredTokens = filteredTokens.filter(token =>
        allProfileIds.has(token.profile_id)
      );
    }
  }

    if (this.atcFilterActive) {
      if (this.atcFilter === 'validated') {
        filteredTokens = filteredTokens.filter(token =>
          this.atcValidatedProfileIds.has(token.profile_id) &&
          token.tokenstatus !== 'inActive'
        );
      } else if (this.atcFilter === 'unvalidated') {
        filteredTokens = filteredTokens.filter(token =>
          this.atcUnvalidatedProfileIds.has(token.profile_id) &&
          token.tokenstatus !== 'inActive'
        );
      } else {
        // Show all ATC participants
        filteredTokens = filteredTokens.filter(token =>
          this.atcAllProfileIds.has(token.profile_id) &&
          token.tokenstatus !== 'inActive'
        );
      }
    }

    if (this.noAtcFilterActive) {
      filteredTokens = filteredTokens.filter(token =>
        this.noAtcProfileIds.has(token.profile_id) &&
        token.tokenstatus !== 'inActive'
      );
    }

    if (this.reminderTodayFilterActive) {
      const todayProfileIds = new Set(this.todayReminders.map(r => r.profileid));
      filteredTokens = filteredTokens.filter(
        token => todayProfileIds.has(token.profile_id)
      );
    }

    if (this.evolutionMappingLiveFilter !== 'all') {
      filteredTokens = filteredTokens.filter(token => {
        if (token.currentstage !== 'In Evolution Mapping Activity') return true;
        const isLive = this.evolutionMappingLiveMap[token.profile_id] === true;
        if (this.evolutionMappingLiveFilter === 'live') return isLive;
        if (this.evolutionMappingLiveFilter === 'unlive') return !isLive;
        return true;
      });
    }

    return filteredTokens;
  }

  removeStage(stageKey: string) {
    this.selectedStages = this.selectedStages.filter(s => s !== stageKey);
    this.onStageSelectionChange();
  }

  // Add these methods after removeStage()
  getStageNameByKey(stageKey: string): string {
    const stage = this.stageQueue.find(s => s.stageKey === stageKey);
    return stage?.stagename || '';
  }

  getStageTypeByKey(stageKey: string): string | null {
    const stage = this.stageQueue.find(s => s.stageKey === stageKey);
    return stage?.type || null;
  }

  onTagFilterChange() {
    this.processTokensIntoStages(this.allTokensData);
  }

  removeTag(tagId: string) {
    this.selectedTags = this.selectedTags.filter(t => t !== tagId);
    this.onTagFilterChange();
  }

  getTagName(tagId: string): string {
    const tag = this.availableTags.find(t => t.docid === tagId);
    return tag?.name || tagId;
  }

  // Method to get available stages for communication dropdown
  getAvailableStagesForComm(): any[] {
    return this.stageQueue.filter(s => s.stagename !== "Unattended Participants");
  }

  // Method to handle stage selection change in sidenav
  // onStageSelectionChange() {
  //   this.selectedTokens.clear();

  //   this.selectedStages.forEach(stageKey => {
  //     const stage = this.stageQueue.find(s => s.stageKey === stageKey);
  //     if (stage && stage.tokenlist) {
  //       stage.tokenlist.forEach(token => {
  //         this.selectedTokens.add(token);
  //       });
  //     }
  //   });
  // }

  // Method to get display name for stage
  getStageDisplayName(stage: any): string {
    if (stage.type) {
      return `${stage.stagename} (${stage.type})`;
    }
    return stage.stagename;
  }

  // Add bulk tags to selected participants
  addBulkTags() {
    // const selectedParticipants = this.getSelectedTokens().map(e => e['profile_id']);
    const selectedParticipants = this.getSelectedTokens().map(e => ({
      profileid: e['profile_id'],
      name:this.mapProfileData[e['profile_id']]['name'],
      email:this.mapProfileData[e['profile_id']]['email']
    }));
    let list = []
    for (const docid in this.mapTagsName) {      
      list.push(docid)
    }  
      
    this.dialog.open(TagParticipantsComponent, {
      data: {
        data: selectedParticipants,
        tagList: list,
        mapfilter: this.mapTagsName,
        loggedInprofileid: this.profileid
      }
    })
    // if (selectedParticipants.length === 0) {
    //   alert('Please select at least one participant');
    //   return;
    // }

    // // Open a dialog or prompt for tag selection
    // const tagName = prompt('Enter tag name to add:');
    // if (!tagName || tagName.trim() === '') return;

    // // Find or create the tag
    // const existingTag = this.availableTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());

    // if (existingTag) {
    //   this.addTagToParticipants(selectedParticipants, existingTag.docid);
    // } else {
    //   // // Create new tag
    //   // const newTagId = doc(collection(this.firestore, 'participant tags')).id;
    //   // setDoc(doc(this.firestore, 'participant tags', newTagId), {
    //   //   docid: newTagId,
    //   //   name: tagName.trim(),
    //   //   isActive: true,
    //   //   createdAt: serverTimestamp()
    //   // }).then(() => {
    //   //   this.addTagToParticipants(selectedParticipants, newTagId);
    //   // });
    // }
  }

  // async addTagToParticipants(profileIds: string[], tagId: string) {
  //   const batch = writeBatch(this.firestore);

  //   for (const profileId of profileIds) {
  //     const metadataDoc = this.participantMetaDataMap[profileId];
  //     if (metadataDoc) {
  //       const currentTags = metadataDoc['profiletags'] || [];
  //       if (!currentTags.includes(tagId)) {
  //         batch.update(doc(this.firestore, 'participant metadata', metadataDoc['id']), {
  //           profiletags: [...currentTags, tagId]
  //         });
  //       }
  //     }
  //   }

  //   await batch.commit().then(() => {
  //     this.guard.openSnackBar(`Tag added to ${profileIds.length} participants`, 'OK',600);
  //     this.selectedTokens.clear();
  //   }).catch(err => {
  //     console.error('Error adding tags:', err);
  //     this.guard.openSnackBar('Error adding tags', 'OK',600);
  //   });
  // }

  async fetchQueueSegments() {
    try {
      // Fetch queue planning document
      const queuePlanningQuery = query(
        collection(this.firestore, 'queue planning'),
        where('queueid', '==', this.selectedQueue.docid)
      );
      const queuePlanningSnap = await getDocs(queuePlanningQuery);

      this.slotTitleMap = {};
      if (!queuePlanningSnap.empty) {
        const queuePlanningDoc = queuePlanningSnap.docs[0].data();
        this.queuePlanningSegments = queuePlanningDoc['segmentlist'] || [];

        const planning = queuePlanningDoc['planning'] || [];
        planning.forEach((v: any) => {
          (v.segments || []).forEach((s: any) => {
            (s.slots || []).forEach((slot: any) => {
              if (!slot.title || !slot.startdate || !slot.enddate) return;
              const sec = (d: any) => d?.seconds ? d.seconds * 1000 : d?.toDate?.().getTime() ?? 0;
              this.slotTitleMap[`${slot.stagename}_${sec(slot.startdate)}_${sec(slot.enddate)}`] = slot.title;
            });
          });
        });
      } else {
        this.queuePlanningSegments = [];
      }

      // Fetch all participant lists
      const participantListSnap = await getDocs(collection(this.firestore, 'participant list'));
      const participantLists = participantListSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Build profileId -> participantListIds map
      this.participantListMap = {};
      participantLists.forEach((pl: any) => {
        const profileList = pl.profilelist || [];
        profileList.forEach((profileId: string) => {
          if (!this.participantListMap[profileId]) {
            this.participantListMap[profileId] = [];
          }
          this.participantListMap[profileId].push(pl.id);
        });
      });

      // Fetch segments that match queue planning segments
      if (this.queuePlanningSegments.length > 0) {
        // Fetch segments in batches of 10 (Firestore limit)
        const segmentChunks = this.chunkArray(this.queuePlanningSegments, 10);
        const allSegments: any[] = [];

        for (const chunk of segmentChunks) {
          const segmentsQuery = query(
            collection(this.firestore, 'segments'),
            where(documentId(), 'in', chunk)
          );
          const segmentsSnap = await getDocs(segmentsQuery);
          segmentsSnap.docs.forEach(doc => {
            allSegments.push({
              id: doc.id,
              ...doc.data()
            });
          });
        }

        this.availableSegments = allSegments;

        this.segmentParticipantListMap = {};
        allSegments.forEach((segment: any) => {
          this.segmentParticipantListMap[segment.id] = segment.participantlistid || [];
        });
        this.filteredSegments = [...this.availableSegments];
      } else {
        this.availableSegments = [];
        this.segmentParticipantListMap = {};
      }

    } catch (error) {
      console.error('Error fetching queue segments:', error);
    }
  }

  extractUniqueStagesFromSlot(tokens: any[]): string[] { //dharshan
    const stageSet = new Set<string>();  
    tokens.forEach((token, index) => {
      const slotData = token.selectedstageslot; 
      
      if (slotData) {
        if (typeof slotData === 'object' && !Array.isArray(slotData)) {
          Object.entries(slotData).forEach(([key, slot]: [string, any]) => {
            if (index < 3) {
              console.log(` Slot key: ${key}, value:`, slot);
            }
            
            if (slot && typeof slot === 'object') {
              const stageName = slot.stagename || slot.stageName || slot.stage;
              if (stageName) {
                if (index < 3) {
                  console.log('Found stagename:', stageName);
                }
                stageSet.add(stageName);
              } else {
                if (index < 3) {
                  console.log(' No stagename found in slot:', Object.keys(slot));
                }
              }
            }
          });
        }
      } else {
        if (index < 3) { 
          console.log(`Token ${index} has no selectedstageslot field`);
        }
      }
    });
    
    const stages = Array.from(stageSet).sort();
    return stages;
  }

  getBookedSlotTitle(token: any): string {
    const slot = this.getBookedSlot(token);
    if (!slot) return '';
    const key = `${this.selectedStageSlot}_${slot.start.getTime()}_${slot.end.getTime()}`;
    return this.slotTitleMap[key] || '';
  }

  getBookedSlot(token: any): { start: Date; end: Date } | null { //dharshan
    if (!this.selectedStageSlot || !token.selectedstageslot) return null;

    const slots = Object.values(token.selectedstageslot) as any[];
    const matchedSlot = slots.find(slot => slot?.stagename === this.selectedStageSlot);

    if (!matchedSlot?.startdate) return null;

    let start: Date;
    let end: Date | null = null;

    if (matchedSlot.startdate.toDate) {
      start = matchedSlot.startdate.toDate();
    } else if (matchedSlot.startdate instanceof Date) {
      start = matchedSlot.startdate;
    } else return null;

    if (matchedSlot.enddate?.toDate) {
      end = matchedSlot.enddate.toDate();
    } else if (matchedSlot.enddate instanceof Date) {
      end = matchedSlot.enddate;
    }

    return { start, end };
  }
  removeSegment(segId) {
    return this.selectedSegments = this.selectedSegments.filter(s => s !== segId)
  }

  onSegmentFilterChange() {
    this.processTokensIntoStages(this.allTokensData);
  }

  getDisplayedTokens(stage: any): any[] {
    const displayCount = this.stageDisplayCounts[stage.stageKey] || this.PAGE_SIZE;
    return (stage.allTokens || stage.tokenlist).slice(0, displayCount);
  }

  hasMoreTokens(stage: any): boolean {
    const displayCount = this.stageDisplayCounts[stage.stageKey] || this.PAGE_SIZE;
    const allTokens = stage.allTokens || stage.tokenlist;
    return allTokens.length > displayCount;
  }

  loadMoreTokens(stage: any) {
    const currentCount = this.stageDisplayCounts[stage.stageKey] || this.PAGE_SIZE;
    this.stageDisplayCounts[stage.stageKey] = currentCount + this.PAGE_SIZE;
  }

  onStageScroll(event: Event, stage: any) {

    if (this.showTimeDropdown) {
      this.showTimeDropdown = false;
    }
    const element = event.target as HTMLElement;
    const threshold = 100; // pixels from bottom

    if (element.scrollHeight - element.scrollTop - element.clientHeight < threshold) {
      if (this.hasMoreTokens(stage) && !this.stageLoadingMore[stage.stageKey]) {
        this.stageLoadingMore[stage.stageKey] = true;

        // Simulate loading delay for smoother UX
        setTimeout(() => {
          this.loadMoreTokens(stage);
          this.stageLoadingMore[stage.stageKey] = false;
        }, 200);
      }
    }
  }

  getRemainingCount(stage: any): number {
    const displayCount = this.stageDisplayCounts[stage.stageKey] || this.PAGE_SIZE;
    const allTokens = stage.allTokens || stage.tokenlist;
    return Math.max(0, allTokens.length - displayCount);
  }

  // Function to open dialog for preassign studio participants 
  openPreAssignDialog(token) {
    this.dialog.open(StudioPreassignDialogComponent, {
      width: '90vw',
      height: '90vh',
      maxWidth: '1400px',
      maxHeight: '90vh',
      panelClass: 'custom-dialog-container',
      autoFocus: false,
      data: {
        token: token,
        selectedQueue: this.selectedQueue
      }
    })
  }

  // Build the set of approved profile ids for a queue, following the same chain
  // as Event Participation Confirmations (which keys requests by arenaeventid,
  // NOT by eventref). queue generation doc -> arena events whose eventref points
  // at it -> their docids -> event participation request with status 'approved'.
  async loadApprovedProfileIds(queueDocId: string) {
    try {
      const queueRef = doc(this.firestore, "queue generation", queueDocId);
      const arenaSnap = await getDocs(query(
        collection(this.firestore, 'arena events'), where('eventref', '==', queueRef)));
      // arenaeventid -> event name (from the arena event's own `eventname` field).
      const arenaEventName: { [arenaId: string]: string } = {};
      const arenaIds: string[] = [];
      arenaSnap.docs.forEach(d => {
        const a = d.data();
        if (a['delete'] == true || !a['docid']) return;
        arenaIds.push(a['docid']);
        arenaEventName[a['docid']] = a['eventname'] || '';
      });

      if (!arenaIds.length) {
        this.approvedProfileIds = new Set();
        this.approvedEventNameMap = {};
        return;
      }

      const ids = new Set<string>();
      const nameMap: { [profileid: string]: string } = {};
      for (let i = 0; i < arenaIds.length; i += 10) {
        const chunk = arenaIds.slice(i, i + 10);
        const reqSnap = await getDocs(query(collection(this.firestore, 'event participation request'),
          where('arenaeventid', 'in', chunk), where('status', '==', 'approved')));
        reqSnap.docs.forEach(d => {
          const x = d.data();
          if (!x['profileid']) return;
          ids.add(x['profileid']);
          nameMap[x['profileid']] = arenaEventName[x['arenaeventid']] || '';
        });
      }
      // Guard against a stale response after the user switched queues.
      if (this.selectedQueue?.docid === queueDocId) {
        this.approvedProfileIds = ids;
        this.approvedEventNameMap = nameMap;
      }
      console.log('approved profiles for queue', queueDocId, ids.size, 'from', arenaIds.length, 'arena(s)');
    } catch (e) {
      console.log('loadApprovedProfileIds failed', e);
    }
  }

  // True when this token's participant was approved for the event (event
  // participation request status == 'approved'). Drives the green check icon.
  isApproved(token: any): boolean {
    return !!token && this.approvedProfileIds.has(token['profile_id']);
  }

  // Event name this participant was approved for (from the arena event's
  // `eventname`); falls back to the queue name then a generic label.
  approvedEventName(token: any): string {
    return (token && this.approvedEventNameMap[token['profile_id']])
      || this.selectedQueue?.queuename || 'this event';
  }

  getPreassignedEntries(token: any): Array<{ key: string, value: string[] }> {
    if (!token?.['preassigned']) return [];

    return Object.entries(token['preassigned'])
      .map(([key, value]) => ({
        key,
        value: (value || []) as string[]
      }))
      .filter(entry => entry.value.length > 0);
  }

  // Function to fetch fcm tokens of current selected participants 
  setupFcmTokenListener() {
    if (this.currentQueueParticipants.length === 0) {
      this.appNotificationProfiles = {};
      return;
    }

    const now = new Date();
    const threeMonthsBefore = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    threeMonthsBefore.setHours(0, 0, 0, 0);
    const threeMonthsBeforeTimestamp = Timestamp.fromDate(threeMonthsBefore);

    const chunks = this.chunkArray(this.currentQueueParticipants, 10);

    const queries = chunks.map(chunk => {
      const profileRefs = chunk.map(profileId =>
        doc(this.firestore, 'profile_data', profileId)
      );

      return collectionData(
        query(collection(this.firestore, 'FCM_token'), where("device_os", "in", ["ios", "android"]), where("last_modified", ">=", threeMonthsBeforeTimestamp), where('profile_ref', 'in', profileRefs)),
        { idField: 'id' }
      );
    });

    combineLatest(queries).pipe(
      takeUntil(this.fcmTokenSubscription),
      takeUntil(this.subscriptionHandle)
    ).subscribe({
      next: (results) => {
        let fcmTokenData = results.flat();
        var map: { [profileId: string]: boolean } = {};

        fcmTokenData.forEach(token => {
          const profileId = token['profile_ref'].id;

          if (map[profileId] === undefined) {
            map[profileId] = false;
          }

          if (token['active'] === true) {
            map[profileId] = true;
          }
        });

        this.appNotificationProfiles = map;
      }
    });
  }

  // Function to chunk array to 10 
  chunkArray(array: any[], chunkSize: number): any[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Function to update variation for participant in queue 
  updateVariation(token, variationid) {
    const check = confirm("Are you sure want to change the Variation");

    if (check) {
      updateDoc(doc(this.firestore, "queue_token", token['docid']), {
        variationid: variationid
      }).then(() => {
        this.guard.openSnackBar("Variation Updated", "OK",600);
      }).catch((error) => {
        this.guard.openSnackBar("Error Updating Variation", "OK",600);
        console.log("Error", error);
      });
    }
  }

  onBulkInvite() {
    // console.log(this.getSelectedTokens());
    let selectedParticipants = this.getSelectedTokens().map(e => e['profile_id'])
    let bulkInviteDialog = this.dialog.open(CreateBulkInvitationComponent, {
      disableClose: true,
      data: { ...this.selectedQueue, ...{ 'selectedParticipants': selectedParticipants } },
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
  }

  onImportData(event: any): void {
    const file = event.target.files[0];
    if (file) {
      const fileExtension = file.name.split(".").pop()?.toLowerCase();
      console.log(fileExtension);

      if (fileExtension === 'csv') {
        this.importCSV(file).subscribe(
          (result) => {
            console.log(result);
            this.fileInput.nativeElement.value = null;
            if (result.length != 0) {
              this.selectParticipantsByEmail(result);
            } else {
              alert("Import file doesn't have any data");
            }
          },
          (error) => {
            console.error('Error importing CSV:', error);
          }
        );
      } else if (['xlsx', 'xls'].includes(fileExtension || '')) {
        this.importExcel(file).subscribe(
          (result) => {
            console.log(result);
            this.fileInput.nativeElement.value = null;
            if (result.length != 0) {
              this.selectParticipantsByEmail(result);
            } else {
              alert("Import file doesn't have any data");
            }
          },
          (error) => {
            console.error('Error importing Excel:', error);
          }
        );
      }
    }
  }

  // Add this new method after onImportData
  selectParticipantsByEmail(importedData: any[]) {
    const arrayOfEmailId = importedData.map(e => (e['email'] || '').toLowerCase().trim()).filter(email => email);
    console.log('Imported emails:', arrayOfEmailId);

    let tokensToSelect: any[] = [];

    if (this.selectedStages.length > 0) {
      const mergedParticipants = this.getMergedParticipants();
      tokensToSelect = mergedParticipants.filter(token => {
        const participantEmail = (this.mapProfileIdToEmail[token['profile_id']] || '').toLowerCase().trim();
        return arrayOfEmailId.includes(participantEmail);
      });
    } else {
      const stageData = this.getStageParticipants(this.selectedChatStage);
      if (stageData && stageData['tokenlist']) {
        tokensToSelect = stageData['tokenlist'].filter(token => {
          const participantEmail = (this.mapProfileIdToEmail[token['profile_id']] || '').toLowerCase().trim();
          return arrayOfEmailId.includes(participantEmail);
        });
      }
    }

    if (tokensToSelect.length > 0) {
      this.selectedTokens.clear();
      tokensToSelect.forEach(token => this.selectedTokens.add(token));
      this.guard.openSnackBar(`${tokensToSelect.length} participant(s) selected from import`, 'OK',600);
    } else {
      alert('No matching participants found for the imported emails');
    }

    console.log('Selected tokens:', tokensToSelect.length);
  }

  importExcel(file: File): Observable<any[]> {
    return new Observable((observer) => {
      const reader = new FileReader();

      reader.onload = (e: any) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, {
            type: 'array',
            cellDates: true,
            dateNF: 'yyyy-mm-dd'
          });

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false,
            dateNF: 'yyyy-mm-dd'
          });

          observer.next(jsonData);
          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      };

      reader.onerror = (error) => {
        observer.error(error);
      };

      reader.readAsArrayBuffer(file);
    });
  }

  importCSV(file: File): Observable<any[]> {
    return new Observable((observer) => {
      const reader = new FileReader();

      reader.onload = (e: any) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

          observer.next(jsonData);
          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      };

      reader.onerror = (error) => {
        observer.error(error);
      };

      reader.readAsArrayBuffer(file);
    });
  }

  openNotificationDialog() {
    this.dialog.open(ViewNotificationParticipantsComponent, {
      disableClose: true,
      data: {
        currentQueueParticipants: this.currentQueueParticipants,
        appNotificationProfiles: this.appNotificationProfiles,
        mapProfile: this.mapProfileData
      }
    })
  }

  checkAvailablestages(token: any, currentStageName: string, currentStageType: string) {
    console.log(token);
    this.availableStages = [];
    let stagesToShow = [];

    if (token['variationid'] && this.mapVariation[token['variationid']]) {
      stagesToShow = this.mapVariation[token['variationid']]['stages'];
      console.log('Using variation stages:', stagesToShow);
    } else {
      stagesToShow = this.selectedQueue.stages;
      console.log('Using all queue stages:', stagesToShow);
    }

    let availableStageOptions = [];
    const addedStages = new Set();
    const stageTypes = ['Queued', 'Waiting', 'Activity'];

    stagesToShow.forEach(stage => {
      const stageName = typeof stage === 'string' ? stage : stage.stagename;

      const queueStage = this.stageQueue.find(qs => qs.stagename === stageName);

      if (queueStage && queueStage.type) {
        stageTypes.forEach(type => {
          if (stageName === currentStageName && type.toLowerCase() === currentStageType.toLowerCase()) return;
          const stageOption = `${stageName} (${type})`;
          if (!addedStages.has(stageOption)) {
            availableStageOptions.push({
              stagename: stageOption,
              markascompleted: false
            });
            addedStages.add(stageOption);
          }
        });
      } else {
        if (!addedStages.has(stageName)) {
          availableStageOptions.push({
            stagename: stageName,
            markascompleted: false
          });
          addedStages.add(stageName);
        }
      }
    });

    this.availableStages = availableStageOptions;
    this.filteredAvailableStages = this.availableStages;

    console.log('Available stages:', this.availableStages);
  }

  filterStages() {
    if (!this.stageSearchTerm || this.stageSearchTerm.trim() === '') {
      this.filteredAvailableStages = [...this.availableStages];
    } else {
      const searchTerm = this.stageSearchTerm.toLowerCase().trim();
      this.filteredAvailableStages = this.availableStages.filter(stage =>
        stage.stagename.toLowerCase().includes(searchTerm)
      );
    }
  }

  // clearSearch() {
  //   this.stageSearchTerm = '';
  //   this.filteredAvailableStages = [...this.availableStages];
  // }

  async moveTokenToStage(token: any, fromStage: string, fromstagetype: string, toStage: string, markascompleted: any, prefilledPeople?: any) {
    console.log(fromStage, fromstagetype, toStage, markascompleted);
    let targetStageName = toStage;
    let targetStageType = null;

    const dragIndex = this.stageQueue.findIndex(e => e.stagename === fromStage && e.type === fromstagetype);
    console.log(dragIndex);

    if (dragIndex === -1) return;

    const typeMatch = toStage.match(/^(.*?)\s*\((.*?)\)$/);
    if (typeMatch) {
      targetStageName = typeMatch[1].trim();
      targetStageType = typeMatch[2].trim();
    }

    const dropIndex = this.stageQueue.findIndex(e =>
      e.stagename === targetStageName &&
      e.type === targetStageType
    );
    console.log(dropIndex);


    const dragStage = this.stageQueue[dragIndex];
    const dropStage = this.stageQueue[dropIndex];

    const dragType = dragStage.type;
    const dropType = dropStage.type;

    const loading = prefilledPeople == null ? this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Moving Token " + token.tokennumber + "..." },
      disableClose: true
    }) : null;

    let batch = writeBatch(this.firestore);

    try {
      if (dragIndex != dropIndex && dropType != "Activity") {
        let result = prefilledPeople ?? null;

        if (result == null) {
          const peopledata = {
            type: "general",
            personoption: this.specialistList,
            mentoroption: this.specialistList,
            shadowoption: this.specialistList,
            multiperson: true
          };
          result = await firstValueFrom(
            this.dialog.open(PeopleInvolvedComponent, { disableClose: true, data: peopledata }).afterClosed()
          );
          if (result == null) { return; }
        }

        if (result != null) {
          if (dragType == "Activity") {
            const liveassignmentid = token.liveassignmentid;
            const studioid = token.studioid;
            console.log("Closing Studio ID", studioid)
            if (dropStage['stagename'] == token['currentstage'] || (dropStage['stagename'] != token['currentstage'] && markascompleted != true)) {
              console.log("dragType == Activity", "in", dropStage['stagename'], token['currentstage'], markascompleted);

              batch.update(doc(this.firestore, 'live assignment/' + liveassignmentid), {
                isactivitydone: false,
                status: "completed",
                updated: serverTimestamp()
              })
              batch.update(doc(this.firestore, "queue studio pairing", studioid), { status: null })
            } else {
              var confirm = this.dialog.open(HoldAlertDialogComponent, {
                data: {}
              })

              const result = confirm.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe()
              if (result == null) {
                return;
              }
              this.ngZone.run(async () => {
                if (result != null) {
                  batch.update(doc(this.firestore, 'live assignment/' + liveassignmentid), {
                    isactivitydone: true,
                    status: "completed",
                    updated: serverTimestamp()
                  })
                  batch.update(doc(this.firestore, "queue studio pairing", studioid), { status: null })
                }
              })
            }
          }

          const data = {
            previousstage: dragStage.stagename,
            currentstage: dropStage.stagename,
            logdate: serverTimestamp(),
            stagestatus: "Approved",
            quicknotes: null,
            cwmentoring: null,
            cwshadowing: null,
            cwperson: null,
            diagnosticmentoring: null,
            diagnosticshadowing: null,
            diagnosticperson: null,
            people_involved: [...result.person ?? [], ...result.mentor ?? [], ...result.shadow ?? []],
            arenaid: null,
            liveassignmentid: null,
            studioid: null,
            manuallymoved: true,
            status: dropType == "Queued" ? "queued" : dropType == "Waiting" ? "ready" : null
          };

          const log = { ...token, ...data };

          batch.update(doc(this.firestore, "queue_token", log.docid), log);

          const logdocid = doc(collection(this.firestore, "queue stage log")).id;
          log.logdocid = logdocid;
          log["movedby"] = this.profileid
          log["movedthrough"] = 'queue manager'
          batch.set(doc(this.firestore, "queue stage log", logdocid), log);

          console.log("commit started", new Date());

          await batch.commit().then(() => {
            console.log("batch update done", new Date());

            if (dragIndex !== -1 && dropIndex !== -1) {
              const tokenIndex = this.stageQueue[dragIndex].tokenlist.findIndex(t => t.tokennumber === token.tokennumber);
              if (tokenIndex !== -1) {
                const [removedToken] = this.stageQueue[dragIndex].tokenlist.splice(tokenIndex, 1);
                this.stageQueue[dropIndex].tokenlist.push(removedToken);
              }
            }
          });

          if (dropIndex + 1 == this.stageQueue.length) {
            console.log('working...........')
            await this.guard.updateDeliveryStatus(doc(this.firestore, "/queue_token/" + token["docid"]).path, "completed", {
              eventRequestRef: query(collection(this.firestore, 'event participation request'), where('profileid', '==', token['profile_id']), where('eventref', '==', token['queueref']), where("status", "==", "approved"))
            })
          }
        }
      } else if (dragIndex != dropIndex && dropType == "Activity") {
        let availableStudio = [];
        var atcmodel = null
        if (![null, undefined].includes(token['variationid'])) {
          await getDoc(doc(this.firestore, "queue variation", token['variationid'])).then(async variationSnap => {
            if (variationSnap.exists()) {
              if (![null, undefined].includes(variationSnap.data()['atcmodel'])) {
                console.log("Atc model from queue variation", variationSnap.data()['atcmodel']);
                atcmodel = variationSnap.data()['atcmodel']
              }
            }
          })
        } else {
          await getDoc(doc(this.firestore, token['productref'].path)).then(productSnap => {
            atcmodel = productSnap.data()['atcmodel']
          })
        }

        console.log("Stage Activity", this.selectedQueue.stageproperty[dropStage.stagename].compulsoryactivity)
        const stageActivityParse = Object.values(
          this.selectedQueue.stageproperty[dropStage.stagename].compulsoryactivity ?? {}
        ).sort((a, b) => a.toString().localeCompare(b.toString())).join(",");
        console.log("Stage Activity Parse", stageActivityParse)

        this.queueStudioList.forEach(studio => {
          if (studio["participants"].includes("kKkttzuwapGSh07uS7tv")) {
            console.log("Vinita Studio", studio)
          }
          if (studio.status == null || studio.status == undefined) {
            const studioactivityParse = Object.values(studio.participantsactivity)
              .sort((a, b) => a.toString().localeCompare(b.toString())).join(",");

            if (stageActivityParse.includes(studioactivityParse)) {
              availableStudio.push(studio);
            }
          }
        });
        // console.log("Available Studio", availableStudio)

        const mandatoryStage = this.selectedQueue.stageproperty[dropStage.stagename].mandatorystagegrouping ?? [];
        const optionalStage = this.selectedQueue.stageproperty[dropStage.stagename].optionalstagegrouping ?? [];
        // console.log("Mandatory Stage", mandatoryStage)
        // console.log("Optional Stage", optionalStage)

        let mandatoryStudio = [];
        let optionalStudio = [];

        if (mandatoryStage.length != 0 || optionalStage.length != 0) {
          const previousStudio = await getDocs(query(collection(this.firestore, "live assignment"),
            where("queueid", "==", this.selectedQueue.docid),
            where("stagename", "in", [...mandatoryStage, ...optionalStage]),
            where("status", "==", "completed")
          ));


          const studioData = previousStudio.docs.map(e => e.data());
          studioData.sort((a, b) => b['created'].toDate() - a['created'].toDate());

          studioData.forEach(studio => {
            if (mandatoryStage.includes(studio['stagename']) &&
              mandatoryStudio.filter(e => e.stagename == studio['stagename']).length == 0) {
              mandatoryStudio.push(studio);
            }

            if (optionalStage.includes(studio['stagename']) &&
              optionalStudio.filter(e => e.stagename == studio['stagename']).length == 0) {
              optionalStudio.push(studio);
            }
          });
        }

        let additionalActivities = {};

        mandatoryStudio.forEach(studio => {
          const participantActivity = Object.keys(studio.participantsactivity ?? {});

          participantActivity.forEach(profile => {
            const transferActivity = this.selectedQueue.stageproperty[dropStage.stagename].transferactivity ?? {};
            const newActivity = transferActivity[studio.participantsactivity[profile]] ?? studio.participantsactivity[profile];

            additionalActivities[newActivity] = additionalActivities[newActivity] ?? [];
            additionalActivities[newActivity].push(profile);
          });
        });

        optionalStudio.forEach(studio => {
          const participantActivity = Object.keys(studio.participantsactivity ?? {});

          participantActivity.forEach(profile => {
            const transferActivity = this.selectedQueue.stageproperty[dropStage.stagename].transferactivity ?? {};
            const newActivity = transferActivity[studio.participantsactivity[profile]] ?? studio.participantsactivity[profile];

            additionalActivities[newActivity] = additionalActivities[newActivity] ?? [];
            additionalActivities[newActivity].push(profile);
          });
        });

        const mapProfileToName = Object.fromEntries(
          Object.entries(this.mapProfileData).map(([id, data]) => [id, data['name']])
        )

        const assignStudio = this.dialog.open(AssignQueueStudioComponent, {
          data: {
            title: "Assign Studio to the Participant",
            studiolist: availableStudio,
            mapprofile: mapProfileToName,
            mapactivity: this.mapActivity,
            additionalactivities: additionalActivities
          },
          autoFocus: false,
          maxWidth: "90vw",
          maxHeight: "90vh"
        });

        const result = await firstValueFrom(assignStudio.afterClosed());

        if (result != null) {
          if (dragType == "Activity") {
            const oldliveassignmentid = token.liveassignmentid;
            const oldstudioid = token.studioid;

            if (dropStage['stagename'] == token['currentstage'] || (dropStage['stagename'] != token['currentstage'] && markascompleted != true)) {
              console.log("in", dropStage['stagename'], token['currentstage'], markascompleted);
              batch.update(doc(this.firestore, 'live assignment/' + oldliveassignmentid), {
                status: "completed",
                updated: serverTimestamp()
              })
              batch.update(doc(this.firestore, "queue studio pairing", oldstudioid), { status: null })
            } else {
              var confirm = this.dialog.open(HoldAlertDialogComponent, {
                data: {}
              })

              const result = await firstValueFrom(confirm.afterClosed())
              if (result == null) {
                return;
              }
              this.ngZone.run(async () => {
                if (result != null) {
                  batch.update(doc(this.firestore, 'live assignment/' + liveassignmentid), {
                    isactivitydone: true,
                    status: "completed",
                    updated: serverTimestamp()
                  })
                }
              })
            }
          }

          batch.update(doc(this.firestore, "queue studio pairing", result.docid), {
            status: "live"
          });

          const liveassignmentid = doc(collection(this.firestore, 'live assignment')).id;
          const liveassignmentData = {
            docid: liveassignmentid,
            pairing: result.participants,
            participantid: token.profile_id,
            stagename: dropStage.stagename,
            status: 'live',
            atcmodel: atcmodel,
            queueid: this.selectedQueue.docid,
            created: serverTimestamp(),
            studioid: result.docid,
            participantsactivity: result.participantsactivity,
            bonusactivity: result.bonusactivity ?? null,
            bonusactivityparticipant: result.bonusactivity != null && result.bonusactivity != undefined ?
              Object.keys(result.bonusactivity) : null,
            zoomlinkrequired: this.selectedQueue.zoomlinkrequired ?? true
          };

          batch.set(doc(this.firestore, 'live assignment/' + liveassignmentid),
            liveassignmentData, { merge: true });

          const data = {
            previousstage: dragStage.stagename,
            currentstage: dropStage.stagename,
            logdate: serverTimestamp(),
            stagestatus: "Approved",
            quicknotes: null,
            cwmentoring: null,
            cwshadowing: null,
            cwperson: null,
            diagnosticmentoring: null,
            diagnosticshadowing: null,
            diagnosticperson: null,
            people_involved: Array.from(new Set(result.participants.concat(
              ...Object.keys(result.bonusactivity ?? {}) as string[]))),
            arenaid: null,
            liveassignmentid: liveassignmentid,
            studioid: result.docid,
            status: "instudio",
            manuallymoved: true
          };

          const log = { ...token, ...data };

          batch.update(doc(this.firestore, "queue_token", log.docid), log);

          const logdocid = doc(collection(this.firestore, "queue stage log")).id;
          log.logdocid = logdocid;
          log["movedby"] = this.profileid
          log["movedthrough"] = 'queue manager'
          batch.set(doc(this.firestore, "queue stage log", logdocid), log);

          console.log("commit started", new Date());
          await batch.commit().then(() => {
            console.log("batch update done", new Date());

            if (dragIndex !== -1 && dropIndex !== -1) {
              const tokenIndex = this.stageQueue[dragIndex].tokenlist.findIndex(t => t.tokennumber === token.tokennumber);
              if (tokenIndex !== -1) {
                const [removedToken] = this.stageQueue[dragIndex].tokenlist.splice(tokenIndex, 1);
                this.stageQueue[dropIndex].tokenlist.push(removedToken);
              }
            }
          });
        }
      }

    } catch (error) {
      console.error("Error moving token:", error);
    } finally {
      loading?.close();
    }
  }

  async updateQueueStage(log) {
    await updateDoc(doc(this.firestore, "queue_token", log["docid"]), log).catch(err => {
      console.log(err)
    })
    var logdocid = doc(collection(this.firestore, 'queue stage log')).id
    log["logdocid"] = logdocid
    log["movedby"] = this.profileid
    log["movedthrough"] = 'queue manager'
    await setDoc(doc(this.firestore, "queue stage log", logdocid), log).catch(err => {
      console.log(err)
    })
  }

  avTest(token) {
    this.dialog.open(AvTestComponent, {
      data: {
        token: token,
        avtestlink: this.selectedQueue["avtestlink"] ?? null,
        mapprofile: this.mapProfileData
      },
      maxHeight: "90vh",
      maxWidth: "90wh",
      disableClose: true
    }).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result => {
      if (result != null) {
        if (result["status"] == "invited") {
          var docid = doc(collection(this.firestore, "queue avtest")).id
          setDoc(doc(this.firestore, "queue avtest", docid), {
            docid: docid,
            profileid: token["profile_id"],
            tokenref: doc(this.firestore, "queue_token", token["docid"]),
            queuename: this.selectedQueue["queuename"],
            zoomlink: result["avtestlink"],
            created: serverTimestamp()
          })
        }
        updateDoc(doc(this.firestore, "queue_token", token["docid"]), {
          avtest: result["status"]
        })
        if (result["avtestlink"] != this.selectedQueue["avtestlink"]) {
          updateDoc(doc(this.firestore, token["queueref"].path), {
            avtestlink: result["avtestlink"],
          })
        }
      }
    });
  }

  async queueAdminTest() {
    let id = doc(collection(this.firestore, 'queue generation', this.selectedQueue['docid'], 'stagechat')).id
    await setDoc(doc(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat", id), {
      docid: id,
      stage: "queueadmin",
      senderprofileid: this.profileid,
      message: this.messageCurrentlyTyped,
      queueref: doc(this.firestore, "queue generation", this.selectedQueue['docid']),
      date: new Date(),
      pinned: false
    }).then(() => {

    }).catch(err => { console.log(err); })
  }

  sendingChatValidation(): boolean {
    return this.selectedChatStage === null || this.selectedQueue === null || this.profileid === null || this.messageCurrentlyTyped === "" || this.messageCurrentlyTyped === null;
  }

  async sendWatiMessage() {
    var apikey = null;
    var endpoint = null;
    await getDoc(doc(this.firestore, "classify", "wati")).then((wati) => {
      if (wati.exists()) {
        apikey = wati.data()['wati'][0]['watitoken'];
        endpoint = wati.data()['wati'][0]['endpoint'];
      }
    });

    var participants = this.stageQueue.filter((e: any) => e.stagename == this.selectedChatStage && e.type == this.selectedStageType);
    const check = confirm("Are you sure want to send this Template in WATI");

    if (check && apikey) {

      console.log('Sending in Wati');
      var requests = []
      for (let i = 0; i < participants[0]['tokenlist'].length; i++) {
        const element = participants[0]['tokenlist'][i];
        let countrycode = (![null, undefined].includes(this.mapProfileData[element['profile_id']]['countrycode']) ? this.mapProfileData[element['profile_id']]['countrycode'] : '+91').replace(/\+/g, "");
        let waticontent = {
          phonenumber: `${countrycode}${this.mapProfileData[element['profile_id']]['number']}`,
          body: {
            parameters: [
              { name: 'name', value: element['profile_name'] },
            ],
            broadcast_name: this.watiTemplate,
            template_name: this.watiTemplate,
          }
        }

        const url = endpoint + '/api/v1/sendTemplateMessage?whatsappNumber=' + waticontent.phonenumber;

        const request = await firstValueFrom(this.http.post(url, JSON.stringify(waticontent.body), {
          headers: new HttpHeaders()
            .set('Authorization', apikey)
            .set('Content-Type', 'application/json'),
        }));

        requests.push(request);
      }

      try {
        const results = await Promise.all(requests);
        console.log('All requests completed successfully:', results);
      } catch (error) {
        console.error('One or more requests failed:', error);
      }

      this.watiTemplate = '';

    }

  }

  async sendMessage() {
    var participants = this.stageQueue.filter((e: any) => e.stagename == this.selectedChatStage && e.type == this.selectedStageType);
    var notification = this.pushNotification ? ' and Notification in Breakthroughs' : '';

    const check = confirm("Are You Sure want to send in Chat" + notification);

    if (check) {

      let id = doc(collection(this.firestore, 'queue generation', this.selectedQueue['docid'], 'stagechat')).id
      setDoc(doc(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat", id), {
        docid: id,
        stage: this.selectedChatStage,
        senderprofileid: this.profileid,
        message: this.messageCurrentlyTyped,
        queueref: doc(this.firestore, "queue generation", this.selectedQueue['docid']),
        date: new Date(),
        pinned: false,
      }).then(() => {
        console.log('Message Sent Successfully');
      }).catch(err => {
        console.log(err);
      });

      if (this.pushNotification) {
        console.log('Sending Notification');
        var selectedProfileid = []
        var userRef = []
        for (let i = 0; i < participants[0]['tokenlist'].length; i++) {
          const selected = participants[0]['tokenlist'][i];

          var profiledata = this.mapProfileData[selected["profile_id"]];
          selectedProfileid.push(selected["profile_id"])
          if (profiledata["user_ref"] != null) {
            userRef.push(profiledata["user_ref"])
          }
        }

        this.guard.saveNotificationRecord({
          title: this.selectedChatStage + ' - ' + this.selectedChatStageType,
          message: this.messageCurrentlyTyped,
          notificationtype: "queuemessage",
          notificationimage: null,
          sticky: false,
          logged: true,
          landingpage: null,
          profileid: selectedProfileid,
          metadata: {
            queueref: doc(this.firestore, "queue generation", this.selectedQueue['docid']),
            messageref: doc(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat", id)
          },
        }).then(() => {
          alert("Queue Message notified " + selectedProfileid.length.toString())
        });

      }
      this.messageCurrentlyTyped = '';
    }
  }

  async onChatPinned(pinnedvalue, chatdoc) {
    await updateDoc(doc(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat", chatdoc['docid']), {
      pinned: pinnedvalue
    });
  }

  // getter function to get the loading component
  get exportloading() {
    return this.dialog.open(LoadingProgressComponent, { data: { msg: "Processing Please wait..." }, disableClose: true })
  }

  // Fetch logs for all profiles in the queue
  async fetchAllLogs(): Promise<{ [profileId: string]: any[] }> {
    const queueGenerationDocRef = doc(this.firestore, "queue generation", this.selectedQueue.docid);
    const stageLogCollection = collection(this.firestore, 'queue stage log');

    // Query all logs for this queue (no profile_id filter)
    let stageLogQuery: Query<DocumentData> = query(
      stageLogCollection,
      where('queueref', '==', queueGenerationDocRef),
      orderBy('logdate', 'asc')
    );

    const snap = await getDocs(stageLogQuery);

    // Group logs by profile_id
    const allLogs = snap.docs.reduce((r, a) => {
      const data = a.data();
      const profileId = data['profile_id'];

      r[profileId] = r[profileId] || [];

      let peopleInvolvedNames = [];
      if (data['people_involved']) {
        peopleInvolvedNames = data['people_involved'].map(personId =>
          this.mapProfileData[personId]?.['name'] || personId
        );
      }
      data['peopleinvolvedname'] = peopleInvolvedNames;

      r[profileId].push(data);
      return r;
    }, {} as { [profileId: string]: any[] });

    return allLogs;
  }

  async exportCSV() {

    let loadingref = this.exportloading;

    // Fetch all logs for all profiles first
    const allQueueHistory = await this.fetchAllLogs();

    var data = [];
    var allHeaders = new Set<string>(); // Track all unique headers

    for (let i = 0; i < this.stageQueue.length; i++) {
      const doc = this.stageQueue[i];
      for (const token of doc['tokenlist'] || []) {
        var map: any = {};

        // Use the fetched logs instead of this.queuehistory
        var stageLog = allQueueHistory[token.profile_id] ?? [];

        // Handle case when stageLog is empty - still create a row
        if (stageLog.length === 0) {
          // Add at least one empty stagelog entry
          map['stagelog 1'] = '';
          allHeaders.add('stagelog 1');
        } else {
          for (let a = 0; a < stageLog.length; a++) {
            const log = stageLog[a];
            var logStage = log["currentstage"] || '';
            var type = null;
            var stageProperty = ![null, undefined].includes(this.selectedQueue["stageproperty"])
              ? this.selectedQueue["stageproperty"][logStage] || {}
              : {};
            var compusloryActivity = Object.values(stageProperty["compulsoryactivity"] || {});

            if (compusloryActivity.length != 0) {
              if ([null, "queued", "invited"].includes(log["status"])) {
                type = "Queued";
              }
              else if (log["status"] == "waiting") {
                type = "Waiting";
              }
              else if (log["liveassignmentid"]) {
                type = "Activity";
              }
            }

            const stageLogKey = `stagelog ${a + 1}`;

            // Handle undefined/null values - show blank instead of undefined
            const formattedDate = (log["logdate"] && log["logdate"].toDate)
              ? this.datepipe.transform(log["logdate"].toDate(), "MMM d - h:mm a") || ''
              : '';

            map[stageLogKey] = formattedDate
              ? `${logStage}${type ? " - " + type : ''} (${formattedDate})`
              : (logStage || '');

            allHeaders.add(stageLogKey);
          }
        }

        let preAssignedNames = [];
        if (token['preassigned']) {
          let preassigned = this.getPreassignedEntries(token);
          let formattedParts = [];

          for (let i = 0; i < preassigned.length; i++) {
            const stage = preassigned[i];
            let stageParts = [];

            // Add stage key (e.g., "Stage1:")
            let stageNames = [];

            for (let j = 0; j < stage.value.length; j++) {
              const studioId = stage.value[j];

              if (this.mapStudio[studioId] && this.mapStudio[studioId]['participants']) {
                let participantNames = [];

                for (let k = 0; k < this.mapStudio[studioId]['participants'].length; k++) {
                  const participant = this.mapStudio[studioId]['participants'][k];

                  if (this.mapProfileData[participant] && this.mapProfileData[participant]['name']) {
                    participantNames.push(this.mapProfileData[participant]['name']);
                  }
                }

                if (participantNames.length > 0) {
                  stageNames.push(participantNames.join(', '));
                }
              }
            }

            if (stageNames.length > 0) {
              formattedParts.push(`${stage.key}: ${stageNames.join(' | ')}`);
            }
          }

          // Join all stages with " / " separator
          preAssignedNames = formattedParts.length > 0
            ? ['Preassigned To: ' + formattedParts.join(' / ')]
            : [];
        }

        // Add other properties - handle undefined/null values
        map['tokennumber'] = token['tokennumber'];
        map['name'] = this.mapProfileData[token['profile_id']]?.['name'] || '';
        map['email'] = this.mapProfileData[token['profile_id']]?.['email'] || '';
        map['currentstage'] = doc['stagename'] || '';
        map['stagestatus'] = doc['type'] || '';
        map['peopleinvolved'] = doc['peopleinvolvedname'] || '';
        map['preassigned'] = preAssignedNames || '';
        map['variation'] = (token['variationid'] && this.mapVariation[token['variationid']])
          ? (this.mapVariation[token['variationid']]['variationname'] || '')
          : '';
        map['notes'] = (token['notesList'] && Array.isArray(token['notesList']) && token['notesList'].length > 0)
          ? token['notesList'].map(e => e['text'] || '').filter(t => t).join(" | ")
          : "";
        map['tags'] = (token['tags'] && Array.isArray(token['tags']) && token['tags'].length > 0)
          ? token['tags'].join(" | ")
          : "";
        map['createdon'] = (token["createdon"] && token["createdon"].toDate)
          ? token["createdon"].toDate()
          : '';

        // Track non-stagelog headers
        allHeaders.add('tokennumber')
        allHeaders.add('name');
        allHeaders.add('email');
        allHeaders.add('currentstage');
        allHeaders.add('stagestatus');
        allHeaders.add('peopleinvolved');
        allHeaders.add('preassigned');
        allHeaders.add('variation');
        allHeaders.add('notes');
        allHeaders.add('tags');
        allHeaders.add('createdon');

        data.push(map);
      }
    }

    loadingref.close();

    // Handle case when no data at all
    if (data.length === 0) {
      console.warn('No data to export');
      return;
    }

    // Create ordered header array with stagelog columns first
    const stagelogHeaders = Array.from(allHeaders)
      .filter(h => h.startsWith('stagelog'))
      .sort((a, b) => {
        const numA = parseInt(a.split(' ')[1]);
        const numB = parseInt(b.split(' ')[1]);
        return numA - numB;
      });

    const otherHeaders = ['tokennumber', 'name', 'email', 'currentstage', 'stagestatus', 'peopleinvolved', 'preassigned', 'variation', 'notes', 'tags', 'createdon'];
    const header = [...otherHeaders, ...stagelogHeaders];

    // Ensure all rows have all stagelog columns (fill missing with empty string)
    const maxStageLog = stagelogHeaders.length;
    data.forEach(row => {
      for (let i = 1; i <= maxStageLog; i++) {
        const key = `stagelog ${i}`;
        if (!(key in row)) {
          row[key] = ''; // Add empty value for missing stagelogs
        }
      }
    });

    this.downloadFile(data, header, new Date().toDateString() + " " + this.selectedQueue.queuename);
  }
//  async exportCSV() {
//     var data = [];
//     var allHeaders = new Set<string>(); // Track all unique headers

//     for (let i = 0; i < this.stageQueue.length; i++) {
//       const doc = this.stageQueue[i];
//       for (const token of doc['tokenlist'] || []) {
//         var map: any = {};
//         var stageLog = this.queuehistory[token.profile_id] ?? [];

//         // Handle case when stageLog is empty - still create a row
//         if (stageLog.length === 0) {
//           // Add at least one empty stagelog entry
//           map['stagelog 1'] = '';
//           allHeaders.add('stagelog 1');
//         } else {
//           for (let a = 0; a < stageLog.length; a++) {
//             const log = stageLog[a];
//             var logStage = log["currentstage"] || '';
//             var type = null;
//             var stageProperty = ![null, undefined].includes(this.selectedQueue["stageproperty"])
//               ? this.selectedQueue["stageproperty"][logStage] || {}
//               : {};
//             var compusloryActivity = Object.values(stageProperty["compulsoryactivity"] || {});

//             if (compusloryActivity.length != 0) {
//               if ([null, "queued", "invited"].includes(log["status"])) {
//                 type = "Queued";
//               }
//               else if (log["status"] == "waiting") {
//                 type = "Waiting";
//               }
//               else if (log["liveassignmentid"]) {
//                 type = "Activity";
//               }
//             }

//             const stageLogKey = `stagelog ${a + 1}`;

//             // Handle undefined/null values - show blank instead of undefined
//             const formattedDate = (log["logdate"] && log["logdate"].toDate)
//               ? this.datepipe.transform(log["logdate"].toDate(), "MMM d - h:mm a") || ''
//               : '';

//             map[stageLogKey] = formattedDate
//               ? `${logStage}${type ? " - " + type : ''} (${formattedDate})`
//               : (logStage || '');

//             allHeaders.add(stageLogKey);
//           }
//         }

//         // Add other properties - handle undefined/null values
//         map['name'] = token['profile_name'] || '';
//         map['currentstage'] = doc['stagename'] || '';
//         map['stagestatus'] = doc['type'] || '';
//         map['variation'] = (token['variationid'] && this.mapVariation[token['variationid']])
//           ? (this.mapVariation[token['variationid']]['variationname'] || '')
//           : '';
//         map['notes'] = (token['notesList'] && Array.isArray(token['notesList']) && token['notesList'].length > 0)
//           ? token['notesList'].map(e => e['text'] || '').filter(t => t).join(" | ")
//           : "";
//         map['tags'] = (token['tags'] && Array.isArray(token['tags']) && token['tags'].length > 0)
//           ? token['tags'].join(" | ")
//           : "";
//         map['createdon'] = (token["createdon"] && token["createdon"].toDate)
//           ? token["createdon"].toDate()
//           : '';

//         // Track non-stagelog headers
//         allHeaders.add('name');
//         allHeaders.add('currentstage');
//         allHeaders.add('stagestatus');
//         allHeaders.add('variation');
//         allHeaders.add('notes');
//         allHeaders.add('tags');
//         allHeaders.add('createdon');

//         data.push(map);
//       }
//     }

//     // Handle case when no data at all
//     if (data.length === 0) {
//       console.warn('No data to export');
//       // Optionally show a message to user
//       return;
//     }

//     // Create ordered header array with stagelog columns first
//     const stagelogHeaders = Array.from(allHeaders)
//       .filter(h => h.startsWith('stagelog'))
//       .sort((a, b) => {
//         const numA = parseInt(a.split(' ')[1]);
//         const numB = parseInt(b.split(' ')[1]);
//         return numA - numB;
//       });

//     const otherHeaders = ['name', 'currentstage', 'stagestatus', 'variation', 'notes', 'tags', 'createdon'];
//     const header = [...otherHeaders, ...stagelogHeaders];

//     // Ensure all rows have all stagelog columns (fill missing with empty string)
//     const maxStageLog = stagelogHeaders.length;
//     data.forEach(row => {
//       for (let i = 1; i <= maxStageLog; i++) {
//         const key = `stagelog ${i}`;
//         if (!(key in row)) {
//           row[key] = ''; // Add empty value for missing stagelogs
//         }
//       }
//     });

//     this.downloadFile(data, header, new Date().toDateString() + " " + this.selectedQueue.queuename);
//   }

  downloadFile(data, header, filename = 'data') {
    let csvData = this.ConvertToCSV(data, header);
    let blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    let dwldLink = document.createElement("a");
    let url = URL.createObjectURL(blob);
    let isSafariBrowser = navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1;
    if (isSafariBrowser) {
      dwldLink.setAttribute("target", "_blank");
    }
    dwldLink.setAttribute("href", url);
    dwldLink.setAttribute("download", filename + ".csv");
    dwldLink.style.visibility = "hidden";
    document.body.appendChild(dwldLink);
    dwldLink.click();
    document.body.removeChild(dwldLink);
  }

  ConvertToCSV(objArray, headerList) {
    let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = '';

    for (let index in headerList) {
      row += headerList[index] + ',';
    }
    row = row.slice(0, -1);
    str += row + '\r\n';

    for (let i = 0; i < array.length; i++) {
      let line = "";
      for (let index in headerList) {
        let head = headerList[index];
        let value = array[i][head];

        // Handle null/undefined
        if (value === null || value === undefined) {
          value = '';
        } else {
          value = String(value);
        }

        // Escape values containing comma, newline, or quotes
        if (value.includes(',') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }

        line += value + ',';
      }
      line = line.slice(0, -1); // Remove trailing comma
      str += line + '\r\n';
    }
    return str;
  }

  async completeQueue(profilelist, dropStage) {
    if (confirm("This action marks the current product of these participants as completed. Continue?")) {
      let checkCompulsoryActivity = ![null, undefined].includes(this.selectedQueue['stageproperty'][dropStage]['compulsoryactivity']) ?
        Object.keys(this.selectedQueue['stageproperty'][dropStage]['compulsoryactivity']).length != 0 : false
      if (checkCompulsoryActivity) {
        var oldliveassignmentData = {
          status: 'completed',
          updated: serverTimestamp()
        }
        var studioloading = this.dialog.open(LoadingProgressComponent, {
          data: {
            msg: "Studio closing...."
          },
          disableClose: true
        })
        var closed = 0
        for (let i = 0; i < profilelist.length; i++) {
          const token = profilelist[i];
          this.updateArenaLiveAssignment(token["arenaid"] || [], token["liveassignmentid"] ?? token["liveassignementid"], oldliveassignmentData).then(() => {
            closed = closed + 1
            if (closed == profilelist.length) {
              studioloading.close()
            }
          }).catch(err => {
            alert(err)
          })
        }
      }
      var loading = this.dialog.open(LoadingProgressComponent, {
        data: {
          msg: "Completing Product...."
        },
        disableClose: true
      })
      var write = 0
      for (let i = 0; i < profilelist.length; i++) {
        const element = profilelist[i];
        await this.guard.updateDeliveryStatus(doc(this.firestore, "/queue_token/" + element["docid"]).path, "completed", {
          eventRequestRef: query(collection(this.firestore, 'event participation request'), where('profileid', '==', element['profile_id']), where('eventref', '==', element['queueref']), where("status", "==", "approved"))
        }).then(() => {
          write = write + 1
          console.log("write", write, "----", i + 1, "/", profilelist.length)
          if (i + 1 == profilelist.length) {
            console.log("Done")
            loading.close()
          }
        }).catch(err => {
          alert(err)
          loading.close()
        })
      }
    }
  }

  async updateArenaLiveAssignment(arenaid: Array<any> = [], liveassignmentid, data) {
    try {
      data["zoomlinkrequired"] = this.selectedQueue["zoomlinkrequired"] ?? true
      await setDoc(doc(this.firestore, 'live assignment/' + liveassignmentid), data, { merge: true }).catch(err => console.log(err))
      for (let i = 0; i < arenaid.length; i++) {
        const arena = arenaid[i];
        await updateDoc(doc(this.firestore, 'arena participant/' + arena), {
          liveassignmentstatus: data["status"]
        }).catch(err => console.log(err))
      }
    } catch (error) {
      console.log(error);
    }
  }

  // harish
  returnQueue() {
    return this.queueList.filter(e => e['queuename'].toLowerCase().trim().includes(this.searchQueue.toLowerCase().trim()))
  }

  //gokul
  capturePlannedOpportunity() {
    if (confirm("Are you sure")) {
      let filterWaitingStage = this.stageQueue.filter(e => e["type"] === "Waiting" && e['tokenlist'].length != 0)
      let mapWaitingStage = filterWaitingStage.reduce((a, c) => {
        a[c['stagename']] = c['tokenlist'].map((e: any) => e['docid'])
        return a
      }, {})
      let dateString = new Date().toISOString().substring(0, 10)
      let docid = `${this.selectedQueue['docid']}_${dateString}`
      setDoc(doc(this.firestore, "queue opportunity", docid), {
        docid: docid,
        date: dateString,
        siezedate: new Date(),
        planned: mapWaitingStage,
        queueid: this.selectedQueue["docid"]
      }, { merge: true }).then(() => {
        this.guard.openSnackBar("Successfully Submitted", "Close",600)
      })
    }
  }

  // deleteParticipant(token) {
  //   console.log(token);
  //   updateDoc(doc(this.firestore, 'queue_token', token['docid']), {
  //     delete: true
  //   })

  // }

  // meena
  openNotesTagsDialog(element) {
    console.log(element, "element notes ************");

    if (!element.notes) element.notes = '';
    if (!element.tags) element.tags = [];
    if (element.notesList && element.notesList.length != 0) {
      element.notesList.forEach(e => {
        console.log(e);

        e['updatedon'] = e['updatedon'].toDate()
      });
    }
    element['author'] = this.profileid
    const dialogRef = this.dialog.open(QueueNotesComponent, {
      data: element,
      width: '500px',
      autoFocus: false,
      panelClass: 'custom-dialog-container'
    });

    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(result => {
      if (result) {
        element.notes = result.notes;
        element.notesList = result.notesList;
        element.tags = result.tags;

        if (element.tags && element.tags.length === 0) {
          element.tags = null;
        }

        if ((!element.notes || element.notes.trim() === '') &&
          (!element.notesList || element.notesList.length === 0)) {
          element.notes = null;
          element.notesList = null;
        }
        this.saveParticipantData(element);
      }
    });
  }

  saveParticipantData(element) {
    const participantRef = doc(this.firestore, 'queue_token', element.docid);
    updateDoc(participantRef, {
      notes: element.notes,
      notesList: element.notesList || [],
      tags: element.tags,
      updatedAt: new Date()
    }).then(() => {
      console.log('Participant data updated successfully');
    }).catch(error => {
      console.error('Error updating participant data:', error);
    });
  }

  hasNotesOrTags(token: any): boolean {
    return (token.notes && token.notes.trim() !== '') || (token.notesList && token.notesList.length > 0) || (token.tags && token.tags.length > 0);
  }

  getNotesTagsBadge(token: any): string {
    let count = 0;

    if (token.notesList && token.notesList.length > 0) {
      count += token.notesList.length;
    } else if (token.notes && token.notes.trim() !== '') {
      count += 1;
    }

    if (token.tags && token.tags.length > 0) {
      count += token.tags.length;
    }

    return count > 0 ? count.toString() : '';
  }

  getNotesPreview(token: any, maxLength: number = 50): string {
    let noteText = '';
    if (token.notesList && token.notesList.length > 0) {
      return token.notesList[0].text;
    } else if (token.notes) {
      return token.notes;
    }
    if (noteText.length > maxLength) {
      return noteText.substring(0, maxLength) + '...';
    }

    return noteText;
  }

  // async onCheckboxChange(event: any, token: string) {
  //   const newStatus = event.checked ? 'inActive' : 'Active';
  //   const stage = event.checked ? null : 'Approved';
  //   const deleted = event.checked ? true : false;
  //   console.log(token);

  //   try {
  //     await updateDoc(doc(this.firestore, 'queue_token', token['docid']), {
  //       tokenstatus: newStatus,
  //       delete:deleted,
  //       stagestatus:stage,
  //     }).then(()=>{
  //       console.log(`${newStatus} updated....`);
  //     });
  //   } catch (error) {
  //     console.error("Error updating token status: ", error);
  //   }
  // }

  async onCheckboxChange(event: any, token: any) {
    // Get checked state from native checkbox
    const isChecked = event.target ? event.target.checked : event.checked;
    const newStatus = isChecked ? 'inActive' : 'Active';
    let confirmFlag = true;

    if(newStatus.toLowerCase() == 'inactive') {
      confirmFlag = confirm('Are you sure to mark unattended');
    }

    try {
      if(confirmFlag) {
        // Mark update token status in queue token 
        await updateDoc(doc(this.firestore, 'queue_token', token['docid']), {
          tokenstatus: newStatus
        });

        // if the status is inactive 
        if (newStatus.toLowerCase() == 'inactive') {
          // mark the product - cancelled 
          await updateDoc(doc(this.firestore, 'participantsproduct', token['participantproductid']), {
            status: 'cancelled'
          });

          // mark the status to unattended to unattended in event participation request
          const participation = await getDocs(query(
            collection(this.firestore, "event participation request" ),
            where("participantproductid", "==", token['participantproductid'])
          ));

          const approvedDocs = participation.docs.filter(doc => {
            const data = doc.data();
            return data['status'] === 'approved' && data['eventref'].path === token['queueref'].path;
          });

          const updatePromises = approvedDocs.map(doc =>
            updateDoc(doc.ref, { status: 'unattended' })
          );

          await Promise.all(updatePromises);

          // remove the profile id from segment involved in the current queue 
          const profileParticipantLists = this.participantListMap[token['profile_id']] || [];
          const segmentNames: string[] = [];
          const matchedPlIds: string[] = [];

          this.availableSegments.forEach(segment => {
            const segmentParticipantLists = this.segmentParticipantListMap[segment.id] || [];
            
            profileParticipantLists.forEach(plId => {
              if (segmentParticipantLists.includes(plId)) {
                if (!matchedPlIds.includes(plId)) {
                  matchedPlIds.push(plId);
                }
              }
            });
          });

          // Update each participant list doc - remove profile_id from profilelist array
          const listPromises = matchedPlIds.map(async (plId) => {
            const plDocRef = doc(this.firestore, 'participant list', plId);
            const plDoc = await getDoc(plDocRef);
            
            if (plDoc.exists()) {
              const profileList: string[] = plDoc.data()['profilelist'] || [];
              const updatedProfileList = profileList.filter(id => id !== token['profile_id']);
              
              await updateDoc(plDocRef, {
                profilelist: updatedProfileList
              });
            }
          });

          await Promise.all(listPromises);
        }

        // Manually update local token
        token.tokenstatus = newStatus;

        // Update in allTokensData array
        const idx = this.allTokensData.findIndex(t => t.docid === token.docid);
        if (idx !== -1) {
          this.allTokensData[idx].tokenstatus = newStatus;
        }

        // Reprocess to move token to correct stage
        this.processTokensIntoStages(this.allTokensData);

        // Close menu
        this.closeTokenMenu();

        console.log(`Token ${token.tokennumber} marked as ${newStatus}`);
      }
    } catch (error) {
      console.error("Error updating token status:", error);
      // Revert checkbox on error
      if (event.target) event.target.checked = !isChecked;
    }
  }

  

  async markProductCompleted(element) {
    if (confirm("This action marks the current product of these participants as completed. Continue?")) {
      try {
        var batch = writeBatch(this.firestore)
        const eventParticipationQuery = query(collection(this.firestore, 'event participation request'), where('profileid', '==', element['profile_id']), where('eventref', '==', element['queueref']), where("status", "==", "approved"));
        const querySnapshot = await getDocs(eventParticipationQuery);
        if (!querySnapshot.empty) {
          querySnapshot.docs.forEach(ref => {
            batch.update(ref.ref, {
              status: "attended"
            })
          });
        } else {
          console.warn("No event participation request found for the given profile ID and event reference.");
        }

        var deliverableQuery = query(collection(this.firestore, "deliverables"), where("fileref", "array-contains", doc(this.firestore, "/queue_token/" + element["docid"])))
        var deliverableSnapshot = await getDocs(deliverableQuery)
        if (!deliverableSnapshot.empty) {
          deliverableSnapshot.docs.forEach(ref => {
            batch.update(ref.ref, {
              status: "completed"
            })
          });
        }
        await batch.commit()
      } catch (error) {
        console.error("Error updating product status: ", error);
      }
    }
  }

  getStageParticipants(selectedstage) {
    let stage = this.stageQueue.find((e) => e['stagename'] == selectedstage);
    return stage;
  }

  selectCommType(type: 'whatsapp' | 'email' | 'notification' | 'appactionpending') {
    this.selectedCommType = this.selectedCommType === type ? null : type;
  }

  toggleTokenSelection(token: any) {
    const existingToken = Array.from(this.selectedTokens).find(t => t.profile_id === token.profile_id);

    if (existingToken) {
      this.selectedTokens.delete(existingToken);
      return;
    }

    if (this.selectedTokens.size >= 10) {
      this.guard.openSnackBar('Maximum 10 participants can be selected at a time', 'OK', 2000);
      return;
    }

    this.selectedTokens.add(token);
  }

  isTokenSelected(token: any): boolean {
    if (this.selectedTokens.size === 0) return false;

    // Check by profile_id instead of object reference
    return Array.from(this.selectedTokens).some(t => t.profile_id === token.profile_id);
  }

  getSelectedTokens(): any[] {
    const uniqueTokens = new Map<string, any>();

    Array.from(this.selectedTokens).forEach(token => {
      if (!uniqueTokens.has(token.profile_id)) {
        uniqueTokens.set(token.profile_id, token);
      }
    });

    return Array.from(uniqueTokens.values());
  }

  // areAllSelected(): boolean {
  //   const tokens = this.getStageParticipants(this.selectedChatStage)['tokenlist'] || [];
  //   return tokens.length > 0 && this.selectedTokens.size === tokens.length;
  // }

  // toggleSelectAll() {
  //   const tokens = this.getStageParticipants(this.selectedChatStage)['tokenlist'] || [];
  //   if (this.areAllSelected()) {
  //     this.selectedTokens.clear();
  //   } else {
  //     this.selectedTokens = new Set(tokens);
  //   }
  // }

  sendCommunication() {
    const selected = this.getSelectedTokens();
    switch (this.selectedCommType) {
      case 'whatsapp':
        this.sendWhatsApp(selected);
        break;
      case 'email':
        this.sendEmail(selected);
        break;
      case 'notification':
        this.sendNotification(selected);
        break;
      case 'appactionpending':
        this.addBulkActionPending(selected);
        break;
    }
  }

  addBulkActionPending(tokens) {
    const selectedParticipants = tokens.map((e) => e['profile_id']);
    console.log(selectedParticipants)

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    this.dialog.open(AddPendingActionComponent, {
      disableClose: true,
      autoFocus: false,
      data: {
        profilelist: selectedParticipants,
        formlist: [],
        mandatoryaction: [],
        videoask: [],
        data: null,
        bulk: true
      }
    });
  }

  async sendWhatsApp(tokens) {
    const selectedParticipants = tokens.map((e) => this.mapProfileData[e['profile_id']]);

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(WatiInputComponent, {
      data: selectedParticipants,
      width: "70vw",
      height: "80vh",
      disableClose: true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result => {
      if (!result) return;

      // Normalize: support both string and object result
      const status = typeof result === 'string' ? result : result.status;
      const archiveid = typeof result === 'object' ? result.archiveid : null;

      if (status === 'success') {
        this.guard.openSnackBar("Wati Message Sent Successfully", "OK", 600);

        if (archiveid) {
          const docRef = doc(collection(this.firestore, 'wati archive'), archiveid);
          await updateDoc(docRef, {
            templatevalidated: true,
            type: 'queue',
            metadata: {
              'queueref': doc(this.firestore, "queue generation", this.selectedQueue["docid"])
            }
          });
          this.selectedTokens.clear();
        }

      } else if (status === 'failed') {
        this.guard.openSnackBar("Sending Wati Message Failed", "OK", 600);
      }
    });
  }

  async sendEmail(tokens) {
    const selectedParticipants = tokens.map((e) => this.mapProfileData[e['profile_id']]);

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(EmailInputComponent, {
      data: selectedParticipants,
      minWidth: "600px",
      disableClose: true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result => {
      if (result != null && result != undefined) {
        console.log(result);

        const docRef = doc(collection(this.firestore, "email archive"), result['docid']);

        if(result) {
          result['type'] = 'queue';
          result['metadata'] = {
              'queueref': doc(this.firestore, "queue generation", this.selectedQueue["docid"])
            }
        }
        if (result['status'] == 'queued' || result['status'] == 'send') {
          await setDoc(docRef, result, { merge: true }).then(() => {
            this.guard.openSnackBar("Email Sent", "OK",600);
          }).catch(err => {
            console.log(err);
            this.guard.openSnackBar("Error Sending Email", "OK",600);
          });
        } else if (result['status'] == 'validated') {
          let url: string;
          if (environment.firebase.projectId == 'starlabs-test') {
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }
          console.log("EMAIL :", url);
          let data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url, JSON.stringify(data), {
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
          this.selectedTokens.clear();
        }
      }
    });
  }

  async sendNotification(tokens) {
    const selectedParticipants = tokens.map((e) => this.mapProfileData[e['profile_id']]);

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(AhNotificationComponent, {
      width: "60vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
    });
    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result => {
      console.log(result, 'send app notificationssss');
      if (result != null && result != undefined) {
        var userID = [];
        var profileID = [];
        console.log(selectedParticipants, "this.selection.selected");
        for (let i = 0; i < selectedParticipants.length; i++) {
          const selected = selectedParticipants[i];
          profileID.push(selected["profileid"])
        }

        var notificationimage = null
        if (result["notificationimage"] != null) {
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(this.storage, filepath)
            const uploadResult = await uploadBytes(storageRef, result["notificationimage"])
            notificationimage = await getDownloadURL(uploadResult.ref)
          } catch (error) {
            console.log("file upload error", error);
          }
        }
        console.log(profileID, "profileIDprofileIDprofileIDprofileID");
        this.guard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "queue",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true,
          landingpage: result["landingpage"],
          profileid: profileID,
          receivingapp: result["receivingapp"] ?? "breakthroughsapp",
          metadata: {
            'queueref': doc(this.firestore, "queue generation", this.selectedQueue["docid"])
          }
        }).then(() => {
          console.log(notificationimage);
          this.selectedTokens.clear();
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  }

  toggleMoveMenu(event: Event, token: any, stagename: string, type: string) {
    event.stopPropagation();

    const tokenId = token.profile_id || token.id;

    Object.keys(this.showMoveMenu).forEach(key => {
      this.showMoveMenu[key] = false;
    });

    this.showMoveMenu[tokenId] = !this.showMoveMenu[tokenId];

    if (this.showMoveMenu[tokenId]) {
      this.checkAvailablestages(token, stagename, type);
      this.stageSearchTerm = '';
    }
  }

  isMenuOpen(token: any): boolean {
    const tokenId = token.profile_id || token.id;
    return this.showMoveMenu[tokenId] === true;
  }

  closeMoveMenu() {
    this.showMoveMenu = {};
    this.stageSearchTerm = '';
  }

  toggleTokenMenu(event: Event, token: any) {
    event.stopPropagation();

    const tokenId = token.profile_id || token.id;

    this.closeMoveMenu();

    Object.keys(this.showTokenMenu).forEach(key => {
      if (key !== tokenId) {
        this.showTokenMenu[key] = false;
      }
    });

    this.showTokenMenu[tokenId] = !this.showTokenMenu[tokenId];

    this.showVariationSubmenu = false;
  }

  toggleVariationSubmenu(event: Event) {
    event.stopPropagation();
    this.showVariationSubmenu = !this.showVariationSubmenu;
  }

  isTokenMenuOpen(token: any): boolean {
    const tokenId = token.profile_id || token.id;
    return this.showTokenMenu[tokenId] === true;
  }

  closeTokenMenu() {
    this.showTokenMenu = {};
    this.showVariationSubmenu = false;
  }

  bulkAvTest() {
    this.dialog.open(AvTestComponent, {
      data: {
        avtestlink: this.selectedQueue["avtestlink"] ?? null,
        mapprofile: this.mapProfileData
      },
      maxHeight: "90vh",
      maxWidth: "90wh",
      disableClose: true
    }).afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result => {
      if (result != null) {
        //bulk av test invite to participant
        if (result["status"] == "invited") {
          let batch = writeBatch(this.firestore)
          let selectedParticipants = this.getSelectedTokens()
          let n = 0
          for (const token of selectedParticipants) {
            var docid = doc(collection(this.firestore, "queue avtest")).id
            batch.set(doc(this.firestore, "queue avtest", docid),{
              docid: docid,
              profileid: token["profile_id"],
              tokenref: doc(this.firestore, "queue_token", token["docid"]),
              queuename: this.selectedQueue["queuename"],
              zoomlink: result["avtestlink"],
              created: serverTimestamp()
            })
            n++
            if(n != 0 && n%450 === 0){
              await batch.commit().then(() => {
                batch = writeBatch(this.firestore)
              })
            }
          }
          await batch.commit()
        }
        // bult update avtest status invited/success to queue token
        let batch = writeBatch(this.firestore)
        let selectedParticipants = this.getSelectedTokens()
        let n = 0
        for (const token of selectedParticipants) {
          batch.update(doc(this.firestore, "queue_token", token["docid"]),{
            avtest: result["status"]
          })
          n++
          if(n != 0 && n%450 === 0){
            await batch.commit().then(() => {
              batch = writeBatch(this.firestore)
            })
          }
        }
        await batch.commit()
        //avtestlink update in queue generation document
        if (result["avtestlink"] != this.selectedQueue["avtestlink"]) {
          updateDoc(doc(this.firestore, this.selectedQueue["queueref"].path), {
            avtestlink: result["avtestlink"],
          })
        }
      }
    });
  }

  startRoundRobinSubscription(bulkInviteStartDate: Date, listofselectedprofileid: string[]) {
    const q = query(
      collection(this.firestore, "studioinvitation"),
      where("createddate", ">=", bulkInviteStartDate),
    );

    this.unsubscribeRR = collectionData(q).subscribe(snap => {
      if (this.isRoundRobinCancelled) return;
      this.roundRobinStatus.approved = snap.filter(e => e['clientresponse'] === 'approved' && listofselectedprofileid.includes(e['profileid']));
      this.roundRobinStatus.denied = snap.filter(e => e['clientresponse'] === 'denied' && listofselectedprofileid.includes(e['profileid']));
      if (this.roundRobinStatus.approved.length >= this.roundRobbinformData.howManyParticipantsNeeded) {
        this.roundRobinStatus.status = "Success";
        this.cancelRoundRobin();
      }
    });
  }

  stopRoundRobinProcess() {
    if (this.unsubscribeRR) {
      this.unsubscribeRR.unsubscribe();
      this.unsubscribeRR = null;
    }
    this.roundRobinStatus.sleeptimer = 0;
  }

  async roundRobin() {
    const selectedParticipants = this.getSelectedTokens();

    if(selectedParticipants.length === 0) return alert("Please select participants")

    this.isRoundRobinCancelled = false;
    this.isRoundRobinRunning = true; // Show status UI
    this.roundRobinStatus.status = 'Running';

    
    const listofselectedprofileid = selectedParticipants.map(e => e.profile_id);
    const howManyParticipantsNeeded = this.roundRobbinformData.howManyParticipantsNeeded;
    const bulkInviteStartDate = new Date();
    const duration = this.roundRobbinformData.duration;

    let nextindex = 0;
    this.roundRobinStatus.attempts = 0

    this.roundRobinStatus.currentcycle = 0
    this.roundRobinStatus.maxcycle = this.roundRobbinformData.maxcycle

    this.roundRobinStatus.maxattempts = Math.ceil(selectedParticipants.length / howManyParticipantsNeeded);

    this.roundRobinStatus.needed = howManyParticipantsNeeded;
    this.roundRobinStatus.approved = [];
    this.roundRobinStatus.denied = [];

    this.startRoundRobinSubscription(bulkInviteStartDate, listofselectedprofileid);

    while (this.roundRobinStatus.approved.length < howManyParticipantsNeeded && this.roundRobinStatus.currentcycle < this.roundRobbinformData.maxcycle) {
      if (this.isRoundRobinCancelled) break;

      const studioInvitedParticipantsData = [...this.roundRobinStatus.approved,...this.roundRobinStatus.denied].map(e => e['profileid']);

      let batch = writeBatch(this.firestore);
      let batchindex = 0;

      for (let i = nextindex; i < selectedParticipants.length; i++) {
        if (batchindex >= howManyParticipantsNeeded || this.isRoundRobinCancelled) break;

        const token = selectedParticipants[i];

        if (!studioInvitedParticipantsData.includes(token.profile_id)) {
          const id = doc(collection(this.firestore, "studioinvitation")).id;

          batch.set(doc(this.firestore, "studioinvitation", id), {
            clientresponse: null,
            createddate: serverTimestamp(),
            docid: id,
            expirydate: new Date(Date.now() + duration * 60000),
            // Intended countdown window (seconds) — the participant's timer counts
            // down from this plain number locally (skew/timezone-immune). `duration`
            // is in MINUTES here.
            durationSeconds: duration * 60,
            participantname: token.profile_name,
            profileid: token.profile_id,
            stage: this.selectedChatStage,
            type: "queued",
            tokenref: doc(this.firestore, "queue_token", token.docid),
            queueref: token.queueref,
          });
          batchindex++;
        }

        nextindex = i + 1;

        if (nextindex >= selectedParticipants.length){ 
          nextindex = 0;
          this.roundRobinStatus.currentcycle++
        }
      }

      

      if (batchindex > 0) {
        await batch.commit();
        this.roundRobinStatus.attempts++
      }

      if (!this.isRoundRobinCancelled && this.roundRobinStatus.approved.length < howManyParticipantsNeeded) {
        await this.sleepWithCountdown(duration * 60);
      }
    }

    if (this.roundRobinStatus.status !== 'Success') {
      this.roundRobinStatus.status = this.isRoundRobinCancelled ? 'Cancelled' : 'Completed';
      
    }
  }

  async sleepWithCountdown(seconds: number) {
    this.roundRobinStatus.sleeptimer = seconds;

    while (seconds > 0) {
      if (this.isRoundRobinCancelled) {
        this.roundRobinStatus.sleeptimer = 0;
        return;
      }

      await new Promise(res => setTimeout(res, 1000));
      seconds--;

      this.roundRobinStatus.sleeptimer = seconds;
    }
  }

  cancelRoundRobin() {
    this.isRoundRobinCancelled = true;
    this.stopRoundRobinProcess();
    this.isRoundRobinRunning = false; // Show form again
  }

  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  loadReminders() { //dharshan
    if (this.remindersSubscription) {
      this.remindersSubscription.unsubscribe();
    }

    if (!this.selectedQueue) return;

    this.remindersSubscription = collectionData(
    query(
      collection(this.firestore, 'queuereminder'),
      where('queueid', '==', this.selectedQueue.docid),
      where('status', 'in', ['pending', 'completed'])
    ),
      { idField: 'docid' }
    ).pipe(
      takeUntil(this.subscriptionHandle),
      takeUntil(this.liveQueueSubscription)
    ).subscribe((reminders: any[]) => {
      this.reminders = reminders;

    });
  }

  // Get reminders for a specific token
  getTokenReminders(profileId: string): any[] {
    return this.reminders.filter(r => r.profileid === profileId);
  }

  // Check if token has reminders
  hasReminders(profileId: string): boolean {
    return this.getTokenReminders(profileId).length > 0;
  }

  // Open reminder dialog
  openReminderDialog(token: any) {
    this.selectedReminderToken = token;
    this.newReminderContext = '';
    this.newReminderDate = null;
    this.showReminderDialog = true;
  }

  closeReminderDialog() {
    this.showReminderDialog = false;
    this.selectedReminderToken = null;
    this.newReminderContext = '';
    this.newReminderDate = null;
    this.newReminderTime = '18:00';
  }
  // Add a new reminder
  async addReminder() {
    if (!this.newReminderContext.trim() || !this.newReminderDate || !this.selectedReminderToken) {
      return;
    }

    try {
      const reminderDocId = doc(collection(this.firestore, 'queuereminder')).id;
      
      const reminderDateTime = new Date(this.newReminderDate);
      if (this.newReminderTime) {
        const [hours, minutes] = this.newReminderTime.split(':').map(Number);
        reminderDateTime.setHours(hours, minutes, 0, 0);
      } else {
        reminderDateTime.setHours(18, 0, 0, 0);
      }
      
      const reminderData = {
        docid: reminderDocId,
        queueid: this.selectedQueue.docid,
        queuetokenno: this.selectedReminderToken.tokennumber,
        profileid: this.selectedReminderToken.profile_id,
        context: this.newReminderContext.trim(),
        date: Timestamp.fromDate(reminderDateTime), 
        status: 'pending',
        userentry: {
          user: this.profileid,
          date: serverTimestamp()
        }
      };

      await setDoc(doc(this.firestore, 'queuereminder', reminderDocId), reminderData);
      
      this.guard.openSnackBar('Reminder added successfully', 'OK', 3000);
      this.newReminderContext = '';
      this.newReminderDate = null;
    } catch (error) {
      console.error('Error adding reminder:', error);
      this.guard.openSnackBar('Error adding reminder', 'OK', 3000);
    }
  }

  startEditReminder(reminder: any) {
    this.editingReminderId = reminder.docid;
    this.editingReminderContext = reminder.context;
    this.editingReminderDate = reminder.date?.toDate();

    const d = reminder.date?.toDate();
    if (d) {
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      this.editingReminderTime = `${hh}:${mm}`;
    } else {
      this.editingReminderTime = '18:00';
    }
  }

  cancelEditReminder() {
    this.editingReminderId = null;
    this.editingReminderContext = '';
    this.editingReminderDate = null;
  }

  async saveEditReminder() {
    if (!this.editingReminderContext.trim() || !this.editingReminderDate || !this.editingReminderId) return;

    try {
      const reminderDateTime = new Date(this.editingReminderDate);
      reminderDateTime.setHours(18, 0, 0, 0);

      await updateDoc(doc(this.firestore, 'queuereminder', this.editingReminderId), {
        context: this.editingReminderContext.trim(),
        date: Timestamp.fromDate(reminderDateTime),
        userentry: {
          user: this.profileid,
          date: serverTimestamp()
        }
      });

      this.guard.openSnackBar('Reminder updated successfully', 'OK', 3000);
      this.cancelEditReminder();
    } catch (error) {
      console.error('Error updating reminder:', error);
      this.guard.openSnackBar('Error updating reminder', 'OK', 3000);
    }
  }

  // Mark reminder as completed
  async markReminderCompleted(reminderId: string) {
    try {
      await updateDoc(doc(this.firestore, 'queuereminder', reminderId), {
        status: 'completed'
      });
      
      this.dueRemindersToShow = this.dueRemindersToShow.filter(r => r.docid !== reminderId);
      
      if (this.dueRemindersToShow.length === 0) {
        this.closeReminderNotification();
      }
      this.guard.openSnackBar('Reminder marked as completed', 'OK', 3000);
    } catch (error) {
      console.error('Error updating reminder:', error);
      this.guard.openSnackBar('Error updating reminder', 'OK', 3000);
    }
  }

  // Delete reminder
  async deleteReminder(reminderId: string) {
    if (!confirm('Are you sure you want to delete this reminder?')) return;

    try {
      await deleteDoc(doc(this.firestore, 'queuereminder', reminderId));
      this.guard.openSnackBar('Reminder deleted', 'OK', 3000); 
    } catch (error) {
      console.error('Error deleting reminder:', error);
      this.guard.openSnackBar('Error deleting reminder', 'OK', 3000);
    }
  }

  toggleSegmentDropdown() {
    if (this.dfuFilterActive || this.selectedStageSlot) return;
    this.segmentDropdownOpen = !this.segmentDropdownOpen;
    if (this.segmentDropdownOpen) this.onSegmentDropdownOpen();
  }

  toggleTagDropdown() {
    if (this.dfuFilterActive || this.selectedStageSlot) return;
    this.tagDropdownOpen = !this.tagDropdownOpen;
    if (this.tagDropdownOpen) this.onTagDropdownOpen();
  }

  togglePreassignedDropdown() {
    if (this.dfuFilterActive || !!this.selectedStageSlot) return;
    this.preassignedDropdownOpen = !this.preassignedDropdownOpen;
    this.segmentDropdownOpen = false;
    this.tagDropdownOpen = false;
    this.stageSlotDropdownOpen = false;
    this.approvedDropdownOpen = false;
  }

  toggleApprovedDropdown() {
    if (this.dfuFilterActive || !!this.selectedStageSlot) return;
    this.approvedDropdownOpen = !this.approvedDropdownOpen;
    this.segmentDropdownOpen = false;
    this.tagDropdownOpen = false;
    this.stageSlotDropdownOpen = false;
    this.preassignedDropdownOpen = false;
  }

  toggleStageSlotDropdown() {
    if (this.dfuFilterActive) return;
    this.stageSlotDropdownOpen = !this.stageSlotDropdownOpen;
    this.segmentDropdownOpen = false;
    this.tagDropdownOpen = false;
    this.preassignedDropdownOpen = false;
  }


  // Computed properties for reminder counts
  get overdueReminders(): any[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return this.reminders.filter(r => {
      if (r.status !== 'pending') return false;
      const reminderDate = r.date?.toDate();
      if (!reminderDate) return false;
      reminderDate.setHours(0, 0, 0, 0);
      return reminderDate < now;
    });
  }

  get todayReminders(): any[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return this.reminders.filter(r => {
      if (r.status !== 'pending') return false;
      const reminderDate = r.date?.toDate();
      if (!reminderDate) return false;
      reminderDate.setHours(0, 0, 0, 0);
      return reminderDate.getTime() === now.getTime();
    });
  }

  get upcomingReminders(): any[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return this.reminders.filter(r => {
      if (r.status !== 'pending') return false;
      const reminderDate = r.date?.toDate();
      if (!reminderDate) return false;
      reminderDate.setHours(0, 0, 0, 0);
      return reminderDate > now;
    });
  }

  get completedReminders(): any[] {
    return this.reminders.filter(r => r.status === 'completed');
  }

  get hasAnyReminders(): boolean {
    return this.reminders.length > 0;
  }

  // Methods for banner
  dismissReminderBanner() {
    this.showReminderBanner = false;
  }

  openReminderListModal(filter: 'overdue' | 'today' | 'upcoming' | 'all' | 'completed' = 'all') {
    this.selectedReminderFilter = filter;
    this.showReminderListModal = true;
  }

  closeReminderListModal() {
    this.showReminderListModal = false;
    this.selectedReminderFilter = 'all';
  }

  getFilteredReminders(): any[] {
    switch (this.selectedReminderFilter) {
      case 'overdue':
        return this.overdueReminders;
      case 'today':
        return this.todayReminders;
      case 'upcoming':
        return this.upcomingReminders;
      case 'completed':
        return this.completedReminders;
      default:
        return this.reminders.filter(r => r.status === 'pending');
    }
  }

  // Get participant name for reminder
  getReminderParticipantName(profileId: string): string {
    return this.mapProfileData[profileId]?.['name'] || 'Unknown Participant';
  }

  goToToken(reminder: any) {
    this.closeReminderListModal();

    setTimeout(() => {
      const element = document.querySelector(`[data-token-id="${reminder.profileid}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-token');
        setTimeout(() => {
          element.classList.remove('highlight-token');
        }, 3000);
      }
    }, 300);
  }
  
  toggleReminderTodayFilter() {
    this.reminderTodayFilterActive = !this.reminderTodayFilterActive;
    this.processTokensIntoStages(this.allTokensData);
  }

  checkForDueReminders() {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const dueReminders: any[] = [];
    
    
    this.reminders.forEach(reminder => {
      const reminderDate = reminder.date?.toDate();
      if (!reminderDate) return;  
      if (reminder.status === 'completed') return;    
      if (this.shownReminderIds.has(reminder.docid)) return;      
      const alreadyInPopup = this.dueRemindersToShow.some(r => r.docid === reminder.docid);
      if (alreadyInPopup) return;
      
      const isToday = reminderDate >= todayStart && reminderDate <= todayEnd;
      const isPast = reminderDate.getTime() <= now.getTime();

      if (isToday && isPast) {
        dueReminders.push(reminder);
        this.shownReminderIds.add(reminder.docid);
      }
    });

    if (dueReminders.length > 0) {
      if (this.showReminderNotification) {
        this.dueRemindersToShow = [...this.dueRemindersToShow, ...dueReminders];
      } else {
        this.dueRemindersToShow = dueReminders;
        this.showReminderNotification = true;
      }
    }
  }

  showReminderPopup(reminder: any) {
    this.activeReminderNotification = reminder;
    this.showReminderNotification = true;
  }

  closeReminderNotification() {
    this.showReminderNotification = false;
    this.dueRemindersToShow = [];
  }
  
  openNotesModal() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.notesSearch = '';
    this.notesDateStart = today;
    this.notesDateEnd = today;
    this.showNotesListModal = true;
    this.buildNotesGrouped();
  }

  buildNotesGrouped() {
    const map = new Map<string, any>();

    const end = this.notesDateEnd ? new Date(this.notesDateEnd) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const searchTerm = this.notesSearch.toLowerCase().trim();

    for (const token of this.allTokensData) {
      if (!token.notesList?.length || token.tokenstatus !== 'Active') continue;

      const name = this.mapProfileData[token.profile_id]?.['name'] || '';
      if (searchTerm && !name.toLowerCase().includes(searchTerm)) continue;

      for (const note of token.notesList) {
        const date: Date = note.updatedon?.toDate?.() ?? note.updatedon;
        if (!date) continue;

        if (this.notesDateStart && date < this.notesDateStart) continue;
        if (end && date > end) continue;

        if (!map.has(token.profile_id)) {
          map.set(token.profile_id, { token, notes: [] });
        }

        map.get(token.profile_id).notes.push({ note, date });
      }
    }

    this.notesData = Array.from(map.values());
  }

  closeNotesModal() {
    this.showNotesListModal = false;
    this.notesSearch = '';
    this.notesDateStart = null;
    this.notesDateEnd = null;
    this.notesData = [];
  }

  getActiveFilterCount(): number {
    let count = 0;
    if (this.searchFilter) count++;
    count += this.selectedSegments.length;
    count += this.selectedTags.length;
    if (this.preassignedFilter !== 'all') count++;
    if (this.approvedFilter !== 'all') count++;
    if (this.selectedStageSlot) count++;
    if (this.dateRangeStart && this.dateRangeEnd) count++;
    if (this.selectedTimeSlots?.length > 0) count++;
    if (this.dfuFilterActive) count++;
    if (this.reminderTodayFilterActive) count++;
    if (this.atcFilterActive) count++;
    if (this.noAtcFilterActive) count++;
    count += this.selectedCustomerSupportCategories.length;
    count += this.selectedVariations.length;
    if (this.selectedArenaEventId) count++;
    if (this.evolutionMappingLiveFilter !== 'all') count++;
    return count;
  }

  loadCustomerSupportData() {
    if (!this.selectedQueue) return;

    const queueStart = this.selectedQueue.queuestartdate;
    const queueEnd = this.selectedQueue.queueenddate;
    this.customerSupportMap = {};
    this.availableCustomerSupportCategories = [];
    this.selectedCustomerSupportCategories = [];

    collectionData( query(  collection(this.firestore, 'clientissue'), where('reporteddate', '>=', queueStart), where('reporteddate', '<=', queueEnd)),).pipe( takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription) ).subscribe(docs => {
      const categorySet = new Set<string>();
      const newMap: { [profileId: string]: any[] } = {};

      // Filter Open status in JS (avoids composite index issue)
      const openDocs = docs.filter(d => d['status']?.['status'] === 'Open');

      openDocs.forEach(doc => {
        const profileId = doc['clientid']; // link clientid → profileid
        if (!profileId) return;

        // Only care about participants in current queue
        const isInQueue = this.allTokensData.some(
          t => t.profile_id === profileId && t.tokenstatus !== 'inActive'
        );
        if (!isInQueue) return;

        if (!newMap[profileId]) {
          newMap[profileId] = [];
        }

        newMap[profileId].push({
          issueno: doc['issueno'],
          category: doc['category'],
          issue: doc['issue'],
          reporteddate: doc['reporteddate'],
          status: doc['status']?.['status'],
        });

        if (doc['category']) {
          categorySet.add(doc['category']);
        }
      });

      this.customerSupportMap = newMap;
      this.availableCustomerSupportCategories = Array.from(categorySet).sort();

      if (this.selectedCustomerSupportCategories.length > 0) {
        this.processTokensIntoStages(this.allTokensData);
      }
    });
  }

  hasCustomerSupport(profileId: string): boolean {
    return !!this.customerSupportMap[profileId]?.length;
  }

  getCustomerSupportEntries(profileId: string): any[] {
    return this.customerSupportMap[profileId] || [];
  }

  getCustomerSupportTooltip(profileId: string): string {
    const entries = this.getCustomerSupportEntries(profileId);
    return entries.map((e, i) =>
      `#${i + 1} Issue No: ${e.issueno}\nCategory: ${e.category}\nIssue: ${e.issue}`
    ).join('\n\n');
  }

  toggleCustomerSupportCategory(category: string) {
    const index = this.selectedCustomerSupportCategories.indexOf(category);
    if (index > -1) {
      this.selectedCustomerSupportCategories.splice(index, 1);
    } else {
      this.selectedCustomerSupportCategories.push(category);
    }
    this.processTokensIntoStages(this.allTokensData);
  }

  toggleVariationSelection(variationId: string) {
    const index = this.selectedVariations.indexOf(variationId);
    if (index > -1) {
      this.selectedVariations.splice(index, 1);
    } else {
      this.selectedVariations.push(variationId);
    }
    this.processTokensIntoStages(this.allTokensData);
  }

  getVariationName(variationId: string): string {
    return this.mapVariation[variationId]?.variationname || variationId;
  }

  getArenaEventName(docid: string): string {
    const event = this.arenaEventFilterList.find(e => e.docid === docid);
    return event?.name || docid;
  }

  getArenaEventQueueCount(arenaeventid: string): number {
    const profileIds = this.arenaEventProfileMap[arenaeventid];
    if (!profileIds) return 0;
    
    return this.allTokensData.filter(token => 
      profileIds.has(token.profile_id) && 
      token.tokenstatus === 'Active'
    ).length;
  }

  async loadEventParticipationList() {
    if (this.eventParticipationListLoaded) return; // already loaded

    this.arenaEventLoading = true;

    const [eventsSnap, queuesSnap] = await Promise.all([
      getDocs(query(
        collection(this.firestore, 'event collection'),
        orderBy('end_date', 'desc')
      )),
      getDocs(query(
        collection(this.firestore, 'queue generation'),
        orderBy('queueenddate', 'desc')
      ))
    ]);

    const events = eventsSnap.docs
      .map(d => ({ ...d.data(), docid: d.id, type: 'event' }))
      .filter(e => !e['delete']);

    const queues = queuesSnap.docs
      .map(d => ({ ...d.data(), docid: d.id, name: d.data()['queuename'], type: 'queue' }))
      .filter(e => !e['delete']);

    this.eventParticipationList = [...events, ...queues];
    this.eventParticipationListLoaded = true;
    this.arenaEventLoading = false;
  }

  async onEventParticipationSelect(eventOrQueue: any) {
    this.selectedEventParticipation = eventOrQueue;
    this.selectedArenaEventId = null;
    this.arenaEventFilterList = [];
    this.arenaEventProfileMap = {};
    this.arenaEventLoading = true;

    // Get docref based on type
    const docRef = eventOrQueue.type === 'queue'
      ? doc(this.firestore, 'queue generation', eventOrQueue.docid)
      : doc(this.firestore, 'event collection', eventOrQueue.docid);

    // Fetch arena events for this event/queue
    const arenaEventsSnap = await getDocs(
      query(
        collection(this.firestore, 'arena events'),
        where('eventref', '==', docRef)
      )
    );

    if (arenaEventsSnap.empty) {
      this.arenaEventLoading = false;
      return;
    }

    // Build filter list
    arenaEventsSnap.docs.forEach(d => {
      const data = d.data();
      this.arenaEventFilterList.push({
        docid: d.id,
        name: data['title']
          ? `${data['eventname']} - ${data['title']}`
          : data['eventname'] || this.mapProduct[data['productref']?.id] || d.id
      });
    });

    // Fetch participation requests
    const arenaEventIds = arenaEventsSnap.docs.map(d => d.id);
    const chunks = this.chunkArray(arenaEventIds, 10);

    const chunkPromises = chunks.map(chunk =>
      getDocs(query(
        collection(this.firestore, 'event participation request'),
        where('arenaeventid', 'in', chunk),
        where('status', 'in', ['approved', 'requested','attended'])
      ))
    );

    const results = await Promise.all(chunkPromises);

    results.forEach(snap => {
      snap.docs.forEach(d => {
        const data = d.data();
        const arenaeventid = data['arenaeventid'];
        const profileid = data['profileid'];

        if (!this.arenaEventProfileMap[arenaeventid]) {
          this.arenaEventProfileMap[arenaeventid] = new Set<string>();
        }
        this.arenaEventProfileMap[arenaeventid].add(profileid);
      });
    });

    this.arenaEventLoading = false;
  }

  get filteredEventParticipationList(): any[] {
    if (!this.eventParticipationSearchTerm.trim()) {
      return this.eventParticipationList;
    }
    const term = this.eventParticipationSearchTerm.toLowerCase().trim();
    return this.eventParticipationList.filter(item => {
      const name = (item.name || item.eventname || '').toLowerCase();
      return name.includes(term);
    });
  }
  async fetchATCParticipants() {
    if (!this.selectedQueue) return;
    const firestoreATC = getFirestore("firestore-atc")

    this.atcValidatedProfileIds = new Set<string>();
    this.atcUnvalidatedProfileIds = new Set<string>();
    this.atcAllProfileIds = new Set<string>();

    const queueStart = this.selectedQueue.queuestartdate;
    const queueEnd = this.selectedQueue.queueenddate;

    const activeProfileIds = new Set(
      this.allTokensData
        .filter(token => token.tokenstatus !== 'inActive')
        .map(token => token.profile_id)
    );

    const [atcAlphaSnap, atcValidateSnap] = await Promise.all([
      getDocs(query(
        collection(firestoreATC, 'atc_alpha'),
        or(
          where('queueid', '==', this.selectedQueue.docid),
          and(
            where('prescription_date', '>=', queueStart),
            where('prescription_date', '<=', queueEnd)
          )
        )
      )),
      getDocs(query(
        collection(firestoreATC, 'atc_to_validate'),
        or(
          where('queueid', '==', this.selectedQueue.docid),
          and(
            where('prescription_date', '>=', queueStart),
            where('prescription_date', '<=', queueEnd)
          )
        )
      ))
    ]);

    atcAlphaSnap.docs.forEach(d => {
      const profileid = d.data()['profileid'];
      const queueid = d.data()['queueid'];
      
      if (profileid && activeProfileIds.has(profileid)) {
        this.atcValidatedProfileIds.add(profileid);
        this.atcAllProfileIds.add(profileid);
        
        // track if they came in without queueid
        if (!queueid || queueid !== this.selectedQueue.docid) {
          this.atcDateRangeOnlyProfileIds.add(profileid);
        }
      }
    });

    atcValidateSnap.docs.forEach(d => {
      const profileid = d.data()['profileid'];
      const queueid = d.data()['queueid'];
      
      if (profileid && activeProfileIds.has(profileid)) {
        this.atcAllProfileIds.add(profileid);
        
        // track if they came in without queueid
        if (!queueid || queueid !== this.selectedQueue.docid) {
          this.atcDateRangeOnlyProfileIds.add(profileid);
        }
        
        if (!this.atcValidatedProfileIds.has(profileid)) {
          this.atcUnvalidatedProfileIds.add(profileid);
        }
      }
    });
    
    this.atcDataLoaded = true;
  }

  async toggleATCFilter() {
    if (!this.atcDataLoaded) {
      await this.fetchATCParticipants();
    }
    this.atcFilterActive = !this.atcFilterActive;
    // Reset sub filter when main toggle turns off
    if (!this.atcFilterActive) {
      this.atcFilter = 'none';
      this.atcDropdownOpen = false;
    }
    this.processTokensIntoStages(this.allTokensData);
  }

  async toggleNoAtcFilter() {
    if (!this.atcDataLoaded) {
      await this.fetchATCParticipants();
    }
    this.noAtcFilterActive = !this.noAtcFilterActive;
    if (this.noAtcFilterActive) {
      this.noAtcProfileIds = new Set(
        this.allTokensData
          .filter(t =>
            t.tokenstatus === 'Active' &&
            !this.atcAllProfileIds.has(t.profile_id)
          )
          .map(t => t.profile_id)
      );
    }
    this.processTokensIntoStages(this.allTokensData);
  }

  getTotalATCCount(): number {
    return this.stageQueue
      .filter(stage => stage.stagename !== 'Unattended Participants')
      .reduce((sum, stage) => {
        return sum + (stage.allTokens || stage.tokenlist || [])
          .filter((token: any) => this.atcAllProfileIds.has(token.profile_id))
          .length;
      }, 0);
  }

  getATCValidatedCount(): number {
    return this.stageQueue
      .filter(stage => stage.stagename !== 'Unattended Participants')
      .reduce((sum, stage) => {
        return sum + (stage.allTokens || stage.tokenlist || [])
          .filter((token: any) => this.atcValidatedProfileIds.has(token.profile_id))
          .length;
      }, 0);
  }

  getATCUnvalidatedCount(): number {
    return this.stageQueue
      .filter(stage => stage.stagename !== 'Unattended Participants')
      .reduce((sum, stage) => {
        return sum + (stage.allTokens || stage.tokenlist || [])
          .filter((token: any) => this.atcUnvalidatedProfileIds.has(token.profile_id))
          .length;
      }, 0);
  }

  getNoAtcCount(): number {
    return this.stageQueue
      .filter(stage => stage.stagename !== 'Unattended Participants')
      .reduce((sum, stage) => {
        return sum + (stage.allTokens || stage.tokenlist || [])
          .filter((token: any) => !this.atcAllProfileIds.has(token.profile_id))
          .length;
      }, 0);
  }
  
  selectATCFilter(type: 'validated' | 'unvalidated' | 'none') {
    this.atcFilter = this.atcFilter === type ? 'none' : type;
    this.atcDropdownOpen = false;
    this.processTokensIntoStages(this.allTokensData);
  }
  
  isATCDateRangeOnly(profileId: string): boolean {
    return this.atcDateRangeOnlyProfileIds.has(profileId);
  }

  async openNotificationTimeline(token: any) {
    this.selectedTimelineToken = token;
    this.showTimelineDialog = true;
    this.notificationTimelineLoading = true;

    // Fetch notificationrecord where metadata.queueref == selectedQueue
    const snap = await getDocs(query(
      collection(this.firestore, 'notificationrecord'),
      where("notificationtype", "==", "queue"),
      where('metadata.queueref', '==', doc(this.firestore, 'queue generation', this.selectedQueue.docid)),
      orderBy("date", "asc")
    ));

    const timeline: any[] = [];

    snap.docs.forEach(d => {
      const data = d.data();
      const profileids: string[] = data['profileid'] || [];
      const profileId = token.profile_id;

      // Check if this notification was sent to this participant
      if (!profileids.includes(profileId)) return;

      const profilesuccess: string[] = data['profilesuccess'] || [];
      const profilefailure: string[] = data['profilefailed'] || [];

      let status: 'success' | 'failure' | 'pending' = 'pending';
      if (profilesuccess.includes(profileId)) {
        status = 'success';
      } else if (profilefailure.includes(profileId)) {
        status = 'failure';
      }

      timeline.push({
        message: data['message'] || '',
        logdate: data['metadata']?.['logdate'],
        status: status,
        title: data['title'] || '',
        notificationtype: data['notificationtype'] || ''
      });
    });

    // Sort by date ascending 
    timeline.sort((a, b) => {
      const dateA = a.logdate?.toDate?.() || new Date(0);
      const dateB = b.logdate?.toDate?.() || new Date(0);
      return dateA.getTime() - dateB.getTime();
    });

    this.notificationTimelineMap[token.profile_id] = timeline;
    this.notificationTimelineLoading = false;
  }

  closeTimelineDialog() {
    this.showTimelineDialog = false;
    this.selectedTimelineToken = null;
  }

  // ── open ──────────────────────────────────────────────────────────────────
  openQueueTimeline() {
    this.showTimelineOverlay = true;
    this.queueTimelineLoading = true;
    this.profileSummaries = [];
    this.expandedProfileId = null;
    this.timelineSearchQuery = ''; // ← reset search
    this.channelFilters = { push: null, whatsapp: null, email: null };
    this.pushDocs = [];
    this.watiDocs = [];
    this.emailDocs = [];
    this.listenQueueNotifications();
  }

  // ── close ─────────────────────────────────────────────────────────────────
  closeQueueTimeline() {
    this.showTimelineOverlay = false;
    this.selectedEmailPreview = null;
    this.selectedWhatsappPreview = null;
    this.timelineUnsubs.forEach(u => u());
    this.timelineUnsubs = [];
  }

  // ── toggle row ────────────────────────────────────────────────────────────
  toggleProfileTimeline(profileId: string) {
    this.expandedProfileId =
      this.expandedProfileId === profileId ? null : profileId;

    if (this.expandedProfileId) {
      this.shouldScrollTracks = true;
    }
  }

  private scrollTracksToEnd() {
    const tracks = document.querySelectorAll('.h-track');
    if (!tracks.length) return;
    tracks.forEach((el: Element) => {
      const track = el as HTMLElement;
      track.scrollLeft = track.scrollWidth;
    });
  }

  // ── listeners ─────────────────────────────────────────────────────────────
  private listenQueueNotifications() {
    const queueRef = doc(
      this.firestore, 'queue generation', this.selectedQueue.docid
    );

    const unsub1 = onSnapshot(
      query(
        collection(this.firestore, 'notificationrecord'),
        where('notificationtype', '==', 'queue'),
        where('metadata.queueref', '==', queueRef),
        orderBy('date', 'asc')
      ),
      snap => {
        this.pushDocs = snap.docs.map(d => d.data());
        this.rebuildSummaries();
      }
    );

    const unsub2 = onSnapshot(
      query(
        collection(this.firestore, 'wati archive'),
        where('type', '==', 'queue'),
        where('metadata.queueref', '==', queueRef),
        orderBy('date', 'asc')
      ),
      snap => {
        this.watiDocs = snap.docs.map(d => d.data());
        this.rebuildSummaries();
      }
    );

    const unsub3 = onSnapshot(
      query(
        collection(this.firestore, 'email archive'),
        where('type', '==', 'queue'),
        where('metadata.queueref', '==', queueRef),
        orderBy('date', 'asc')
      ),
      snap => {
        this.emailDocs = snap.docs.map(d => d.data());
        this.rebuildSummaries();
      }
    );

    this.timelineUnsubs = [unsub1, unsub2, unsub3];
  }

  private rebuildSummaries() {
    const map = new Map<string, ProfileNotificationSummary>();

    const getOrCreate = (profileId: string): ProfileNotificationSummary => {
      if (!map.has(profileId)) {
        map.set(profileId, {
          profileId,
          pushSent: 0, pushFailed: 0,
          whatsappSent: 0, whatsappFailed: 0,
          emailSent: 0, emailFailed: 0,
          totalSuccess: 0, totalFailed: 0,
          timeline: [],
          pushTimeline: [],
          whatsappTimeline: [],
          emailTimeline: [],
          lastPushStatus: null,
          lastWaStatus: null,
          lastEmailStatus: null,
        });
      }
      return map.get(profileId)!;
    };

    // ── push ──────────────────────────────────────────────────────────────
    this.pushDocs.forEach(data => {
      const profileids: string[] = data['profileid'] || [];
      const profilesuccess: string[] = data['profilesuccess'] || [];
      const profilefailure: string[] = data['profilefailed'] || [];

      profileids.forEach(profileId => {
        const entry = getOrCreate(profileId);
        let status: 'success' | 'failure' | 'pending' = 'pending';

        if (profilesuccess.includes(profileId)) {
          status = 'success';
          entry.pushSent++;
          entry.totalSuccess++;
        } else if (profilefailure.includes(profileId)) {
          status = 'failure';
          entry.pushFailed++;
          entry.totalFailed++;
        }

        entry.timeline.push({
          channel: 'push', status,
          message: data['message'] || '',
          title: data['title'] || '',
          logdate: data['date'],
        });
      });
    });

    // ── whatsapp ──────────────────────────────────────────────────────────
    this.watiDocs.forEach(data => {
      const numbersmap: Record<string, string> = data['numbermap'] || {};
      const sent: string[] = data['sent'] || [];
      const failed: string[] = data['failed'] || [];

      const template = data['body'] || data['message'] || '';
      const parameterConfig = data['parameterConfig'] || data['parameterconfig'] || [];
      const templateName = data['template_name'] || data['templateName'] || '';

      sent.forEach(phone => {
        const profileId = numbersmap[phone];
        if (!profileId) return;
        const entry = getOrCreate(profileId);
        entry.whatsappSent++;
        entry.totalSuccess++;
        entry.timeline.push({
          channel: 'whatsapp', status: 'success',
          message: this.renderWhatsappMessage(template, parameterConfig, profileId),
          title: data['title'] || '',
          logdate: data['date'],
          templateName,
        });
      });

      failed.forEach(phone => {
        const profileId = numbersmap[phone];
        if (!profileId) return;
        const entry = getOrCreate(profileId);
        entry.whatsappFailed++;
        entry.totalFailed++;
        entry.timeline.push({
          channel: 'whatsapp', status: 'failure',
          message: this.renderWhatsappMessage(template, parameterConfig, profileId),
          title: data['title'] || '',
          logdate: data['date'],
          templateName,
        });
      });
    });

    // ── email ─────────────────────────────────────────────────────────────
    this.emailDocs.forEach(data => {
      const emailmap: Record<string, string> = data['emailmap'] || {};
      const datamodel: Record<string, any> = data['datamodel'] || {};
      const sent: string[] = data['sent'] || [];
      const failed: string[] = data['failed'] || [];

      sent.forEach(email => {
        const profileId = emailmap[email];
        if (!profileId) return;
        const entry = getOrCreate(profileId);
        entry.emailSent++;
        entry.totalSuccess++;
        entry.timeline.push({
          channel: 'email',
          status: 'success',
          message: this.renderMessage(data['body'] || '', datamodel),
          title: data['title'] || '',
          logdate: data['date'],
        });
      });

      failed.forEach(email => {
        const profileId = emailmap[email];
        if (!profileId) return;
        const entry = getOrCreate(profileId);
        entry.emailFailed++;
        entry.totalFailed++;
        entry.timeline.push({
          channel: 'email',
          status: 'failure',
          message: this.renderMessage(data['body'] || '', datamodel),
          title: data['title'] || '',
          logdate: data['date'],
        });
      });
    });

    // ── sort + pre-compute per-channel splits ─────────────────────────────
    const lastStatus = (arr: NotificationEvent[]) =>
      arr.length ? arr[arr.length - 1].status as 'success' | 'failure' : null;

    map.forEach(entry => {
      entry.timeline.sort((a, b) => {
        const da = a.logdate?.toDate?.() || new Date(0);
        const db = b.logdate?.toDate?.() || new Date(0);
        return da.getTime() - db.getTime();
      });

      entry.pushTimeline = entry.timeline.filter(e => e.channel === 'push');
      entry.whatsappTimeline = entry.timeline.filter(e => e.channel === 'whatsapp');
      entry.emailTimeline = entry.timeline.filter(e => e.channel === 'email');

      entry.lastPushStatus = lastStatus(entry.pushTimeline);
      entry.lastWaStatus = lastStatus(entry.whatsappTimeline);
      entry.lastEmailStatus = lastStatus(entry.emailTimeline);
    });

    this.profileSummaries = Array.from(map.values());
    this.queueTimelineLoading = false;

    setTimeout(() => {
      document.querySelectorAll('.h-track').forEach(el => {
        el.scrollLeft = el.scrollWidth;
      });
    }, 50);
  }

  renderWhatsappMessage(template: string, parameterConfig: any[], profileId: string): string {
    if (!template) return '';
    if (!Array.isArray(parameterConfig) || parameterConfig.length === 0) return template;

    const metadata: Record<string, any> = this.participantMetaDataMap[profileId] || {};
    const profile: Record<string, any> = (this.mapProfileData[profileId] as Record<string, any>) || {};
    const datamodel: Record<string, any> = {};

    for (const param of parameterConfig) {
      const name = param?.['name'];
      if (!name) continue;
      let value: any = '';
      const fillType = param?.['fillType'];
      if (fillType === 'metadata') {
        const field = param?.['metadataField'];
        value = (field != null ? (metadata[field] ?? profile[field]) : undefined) ?? '';
      } else if (fillType === 'static') {
        value = param?.['staticValue'] ?? '';
      }
      datamodel[name] = value;
    }

    return this.renderMessage(template, datamodel);
  }

  renderMessage(template: string, datamodel: Record<string, any>): string {
    if (!template || !datamodel) return template || '';

    let rendered = template;

    // simple {{variable}}
    rendered = rendered.replace(/\{\{([^#\/][^}]*)\}\}/g, (_match, key) => {
      const value = datamodel[key.trim()];
      return value !== undefined && value !== null ? String(value) : '';
    });

    // {{#section}}...{{.}}...{{/section}}
    rendered = rendered.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key, content) => {
      const value = datamodel[key.trim()];
      if (value !== undefined && value !== null && value !== '') {
        return content.replace(/\{\{\.\}\}/g, String(value));
      }
      return '';
    });

    return rendered;
  }

  get filteredProfileSummaries(): ProfileNotificationSummary[] {
    let list = [...this.profileSummaries];

    // sort alphabetically by name
    list.sort((a, b) => {
      const nameA = (this.mapProfileData[a.profileId]?.['name'] || '').toLowerCase();
      const nameB = (this.mapProfileData[b.profileId]?.['name'] || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // filter by search
    if (this.timelineSearchQuery.trim()) {
      const q = this.timelineSearchQuery.trim().toLowerCase();
      list = list.filter(p => {
        const name = (this.mapProfileData[p.profileId]?.['name'] || '').toLowerCase();
        const id = p.profileId.toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }

    // per-channel last-status filters (AND across channels)
    if (this.channelFilters.push) {
      list = list.filter(p => p.lastPushStatus === this.channelFilters.push);
    }
    if (this.channelFilters.whatsapp) {
      list = list.filter(p => p.lastWaStatus === this.channelFilters.whatsapp);
    }
    if (this.channelFilters.email) {
      list = list.filter(p => p.lastEmailStatus === this.channelFilters.email);
    }

    return list;
  }

  get channelLastStatusCounts() {
    const counts = {
      push:     { success: 0, failure: 0 },
      whatsapp: { success: 0, failure: 0 },
      email:    { success: 0, failure: 0 },
    };
    this.profileSummaries.forEach(p => {
      if (p.lastPushStatus  === 'success') counts.push.success++;
      if (p.lastPushStatus  === 'failure') counts.push.failure++;
      if (p.lastWaStatus    === 'success') counts.whatsapp.success++;
      if (p.lastWaStatus    === 'failure') counts.whatsapp.failure++;
      if (p.lastEmailStatus === 'success') counts.email.success++;
      if (p.lastEmailStatus === 'failure') counts.email.failure++;
    });
    return counts;
  }

  toggleChannelFilter(channel: 'push' | 'whatsapp' | 'email', status: 'success' | 'failure') {
    this.channelFilters[channel] = this.channelFilters[channel] === status ? null : status;
  }

  clearChannelFilters() {
    this.channelFilters = { push: null, whatsapp: null, email: null };
    this.timelineSearchQuery = '';
  }

  get hasActiveTimelineFilters(): boolean {
    return !!(
      this.timelineSearchQuery.trim() ||
      this.channelFilters.push ||
      this.channelFilters.whatsapp ||
      this.channelFilters.email
    );
  }

  toggleEmailPreview(item: NotificationEvent, profileId: string) {
    if (
      this.selectedEmailPreview?.profileId === profileId &&
      this.selectedEmailPreview?.item === item
    ) {
      this.selectedEmailPreview = null;
    } else {
      this.selectedEmailPreview = { profileId, item };
    }
  }

  toggleWhatsappPreview(item: NotificationEvent, profileId: string) {
    if (
      this.selectedWhatsappPreview?.profileId === profileId &&
      this.selectedWhatsappPreview?.item === item
    ) {
      this.selectedWhatsappPreview = null;
    } else {
      this.selectedWhatsappPreview = { profileId, item };
    }
  }

  async openBulkMovePanel(): Promise<void> {
    const selected = this.getSelectedTokens();

    if (!selected.length) {
      this.guard.openSnackBar('Please select participants first', 'OK', 2000);
      return;
    }

    // All selected tokens must belong to the same stage column
    const sourceStage = this.stageQueue.find(s =>
      s.tokenlist.some((t: any) => t.profile_id === selected[0].profile_id)
    );

    if (!sourceStage) {
      this.guard.openSnackBar('Could not identify source stage', 'OK', 2000);
      return;
    }

    const allSameStage = selected.every(token =>
      sourceStage.tokenlist.some((t: any) => t.profile_id === token.profile_id)
    );

    if (!allSameStage) {
      this.guard.openSnackBar('All selected participants must be from the same stage', 'OK', 3000);
      return;
    }

    // Reset state
    this.bulkMoveCurrentStageObj = sourceStage;
    this.bulkMoveTargetStageKey = '';
    this.bulkMoveCompleted = false;
    this.bulkMoveInProgress = false;
    this.bulkMoveFailed = false;
    this.availableStagesForBulkMove = [];

    this.bulkMoveResults = selected.map(token => ({
      token,
      variationName: token.variationid
        ? (this.mapVariation[token.variationid]?.variationname ?? 'Unknown')
        : 'Default',
      isDFU: this.getTokenHighlight(token.profile_id) === 'orange'
    }));

    const addedStages = new Set<string>();
    const allStageOptions: any[] = [];

    this.selectedQueue.stages.forEach((stage: string) => {
      const matchingColumns = this.stageQueue.filter(qs => qs.stagename === stage);

      if (matchingColumns.length > 1) {
        matchingColumns
          .filter(col => col.type && col.type !== 'Activity')
          .forEach(col => {
            const stageOption = `${stage} (${col.type})`;
            if (!addedStages.has(stageOption)) {
              allStageOptions.push({ stagename: stageOption, markascompleted: false });
              addedStages.add(stageOption);
            }
          });
      } else {
        if (!addedStages.has(stage)) {
          allStageOptions.push({ stagename: stage, markascompleted: false });
          addedStages.add(stage);
        }
      }
    });

    this.availableStagesForBulkMove = allStageOptions;

    this.bulkMoveComputedResult = { movable: [], skippedDFU: [], skippedVariation: [] };
    this.showBulkMovePanel = true;
  }

  onBulkTargetStageChange(targetStageName: string) {
    if (!targetStageName) {
      this.bulkMoveComputedResult = { movable: [], skippedDFU: [], skippedVariation: [] };
      return;
    }

    const typeMatch = targetStageName.match(/^(.*?)\s*\((.*?)\)$/);
    const baseName = typeMatch ? typeMatch[1].trim() : targetStageName;

    const movable: { token: any; variationName: string; isDFU: boolean }[] = [];
    const skippedDFU: { token: any; variationName: string; isDFU: boolean }[] = [];
    const skippedVariation: { token: any; variationName: string; isDFU: boolean }[] = [];

    for (const r of this.bulkMoveResults) {
      if (r.isDFU) {
        skippedDFU.push(r);
        continue;
      }

      const stageList: string[] = r.token.variationid && this.mapVariation[r.token.variationid]
        ? (this.mapVariation[r.token.variationid]['stages'] as string[]) ?? []
        : (this.selectedQueue?.stages as string[]) ?? [];

      if (!stageList.includes(baseName)) {
        skippedVariation.push(r);
      } else {
        movable.push(r);
      }
    }

    this.bulkMoveComputedResult = { movable, skippedDFU, skippedVariation };
  }


  async executeBulkMove(): Promise<void> {
    const target = this.availableStagesForBulkMove.find(s => s.stagename === this.bulkMoveTargetStageKey);
    if (!target) return;

    const tokensToMove = this.bulkMoveComputedResult.movable.map(r => r.token);
    if (!tokensToMove.length) return;

    const fromStageName = this.bulkMoveCurrentStageObj.stagename;
    const fromStageType = this.bulkMoveCurrentStageObj.type;

    const loading = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Moving Participants..." },
      disableClose: true
    });

    this.bulkMoveInProgress = true;

    try {
      for (const token of tokensToMove) {
        await this.moveTokenToStage(
          token, fromStageName, fromStageType,
          target.stagename, false,
          { person: [], mentor: [], shadow: [] }
        );
      }
      this.bulkMoveFailed = false;
    } catch (error) {
      console.error("Error moving tokens:", error);
      this.bulkMoveFailed = true;
    } finally {
      loading.close();
    }

    this.bulkMoveInProgress = false;
    this.bulkMoveCompleted = true;
  }

    get bulkMovableCount(): number {
      return this.bulkMoveComputedResult.movable.length;
    }

    get bulkDFUCount(): number {
      return this.bulkMoveComputedResult.skippedDFU.length;
    }

  closeBulkMovePanel(): void {
    if (this.bulkMoveInProgress) return;

    if (this.bulkMoveCompleted && !this.bulkMoveFailed) {
      this.selectedTokens.clear();
    }

    this.showBulkMovePanel = false;
    this.bulkMoveInProgress = false;
    this.bulkMoveCompleted = false;
    this.bulkMoveFailed = false;
    this.bulkMoveTargetStageKey = '';
    this.bulkMoveCurrentStageObj = null;
    this.availableStagesForBulkMove = [];
    this.bulkMoveResults = [];  
    this.bulkMoveComputedResult = { movable: [], skippedDFU: [], skippedVariation: [] };
  }

  async fetchStageActivity() {
    if (!this.selectedQueue) return;

    this.stageActivityCacheLoading = true;
    this.stageActivityCache = null;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const queueRef = doc(this.firestore, 'queue generation', this.selectedQueue.docid);

    try {
      const snap = await getDocs(
        query(
          collection(this.firestore, 'queue stage log'),
          where('queueref', '==', queueRef),
          where('logdate', '>=', Timestamp.fromDate(since))
        )
      );
      this.stageActivityCache = snap.docs.map(d => d.data());
      this.stageActivityCacheQueueId = this.selectedQueue.docid;
      this.stageActivityCacheLoading = false;
      if (this.showStageActivityPanel) {
        this.buildStageActivityData(this.selectedStageForActivity, this.selectedStageTypeForActivity);
      }
    } catch (err) {
      console.error('Stage activity fetch error:', err);
      this.stageActivityCacheLoading = false;
    }
  }

  openStageActivity(stageName: string, stageType: string | null, event: Event) {
    event.stopPropagation();
    this.selectedStageForActivity = stageName;
    this.selectedStageTypeForActivity = stageType;
    this.stageActivityTab = 'cameIn';
    this.showStageActivityPanel = true;
    this.fetchStageActivity();
  }

  buildStageActivityData(stageName: string, stageType: string | null) {
    const logs = this.stageActivityCache || [];

    const sortDesc = (a: any, b: any) => {
      const dateA = a['logdate']?.toDate?.() || new Date(0);
      const dateB = b['logdate']?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    };

    this.stageActivityData = {
      cameIn: logs.filter(log => {
        if (log['currentstage'] !== stageName) return false;
        if (!stageType) return true;
        if (stageType === 'Queued') {
          return [null, 'queued', 'invited'].includes(log['status']);
        }
        if (stageType === 'Waiting') return log['status'] === 'ready';
        if (stageType === 'Activity') return !!log['liveassignmentid'];
        return true;
      }).sort(sortDesc),
      wentOut: logs.filter(log =>
        log['previousstage'] === stageName
      ).sort(sortDesc)
    };
  }

  get uniqueActivityStages(): any[] {
    const seen = new Set<string>();
    return this.stageQueue.filter((s: any) => {
      if (s.stagename === 'Unattended Participants') return false;
      if (seen.has(s.stagename)) return false;
      seen.add(s.stagename);
      return true;
    });
  }

  onStageActivityFilterChange(stageName: string) {
    this.selectedStageTypeForActivity = null;
    this.buildStageActivityData(stageName, null);
  }

  closeStageActivityPanel() {
    this.showStageActivityPanel = false;
    this.stageActivityData = { cameIn: [], wentOut: [] };
  }

  exportStageActivity() {
    const rows: any[] = [];

    this.stageActivityData.cameIn.forEach(log => {
      rows.push({
        direction: 'Came In',
        name: this.mapProfileData[log['profile_id']]?.['name'] || '',
        email: this.mapProfileData[log['profile_id']]?.['email'] || '',
        from_stage: log['previousstage'] || '',
        to_stage: log['currentstage'] || '',
        time: log['logdate']?.toDate
          ? log['logdate'].toDate().toLocaleString() : '',
        moved_by: this.mapProfileData[log['movedby']]?.['name'] || '',
      });
    });

    this.stageActivityData.wentOut.forEach(log => {
      rows.push({
        direction: 'Went Out',
        name: this.mapProfileData[log['profile_id']]?.['name'] || '',
        email: this.mapProfileData[log['profile_id']]?.['email'] || '',
        from_stage: log['previousstage'] || '',
        to_stage: log['currentstage'] || '',
        time: log['logdate']?.toDate
          ? log['logdate'].toDate().toLocaleString() : '',
        moved_by: this.mapProfileData[log['movedby']]?.['name'] || '',
      });
    });

    const headers = [
      'direction', 'name', 'email',
      'from_stage', 'to_stage',
      'time', 'moved_by'
    ];
    const stagePart = this.selectedStageForActivity +
      (this.selectedStageTypeForActivity
        ? '_' + this.selectedStageTypeForActivity : '');

    this.downloadFile(
      rows, headers,
      `Stage_Activity_24h_${stagePart}_${new Date().toDateString()}`
    );
  }

  getFilteredMergedParticipants(): any[] {
    const tokens = this.getMergedParticipants();
    if (!this.participantSearchTerm.trim()) return tokens;
    const search = this.participantSearchTerm.toLowerCase().trim();
    return tokens.filter(token => {
      const name = (this.mapProfileData[token.profile_id]?.['name'] || '').toLowerCase();
      const email = (this.mapProfileData[token.profile_id]?.['email'] || '').toLowerCase();
      return name.includes(search) || email.includes(search);
    });
  }

  getFilteredSingleStageParticipants(): any[] {
    const tokens = this.getStageParticipants(this.selectedChatStage)?.['tokenlist'] || [];
    if (!this.participantSearchTerm.trim()) return tokens;
    const search = this.participantSearchTerm.toLowerCase().trim();
    return tokens.filter(token => {
      const name = (this.mapProfileData[token.profile_id]?.['name'] || '').toLowerCase();
      const email = (this.mapProfileData[token.profile_id]?.['email'] || '').toLowerCase();
      return name.includes(search) || email.includes(search);
    });
  }

  async setEvolutionMappingFilter(filter: 'all' | 'live' | 'unlive') {
    this.evolutionMappingLiveFilter = filter;

    if (filter === 'all') {
      this.processTokensIntoStages(this.allTokensData);
      return;
    }

    // Always fetch fresh data on filter selection
    const evolutionTokens = this.allTokensData.filter(
      t => t.currentstage === 'In Evolution Mapping Activity'
        && t.tokenstatus === 'Active'
    );

    await Promise.all(evolutionTokens.map(async token => {
      try {
        const snap = await getDoc(
          doc(this.firestore, 'liveevolutionmapping', token.profile_id)
        );
        this.evolutionMappingLiveMap[token.profile_id] =
          snap.exists() ? snap.data()['live'] === true : false;
      } catch {
        this.evolutionMappingLiveMap[token.profile_id] = false;
      }
    }));

    this.evolutionMappingLiveLoaded = true;

    this.processTokensIntoStages(this.allTokensData);
  }
  get hasEvolutionMappingParticipants(): boolean {
  return this.stageQueue.some(
    s => s.stagename === 'In Evolution Mapping Activity' 
      && s.tokenlist?.length > 0
  );
}

}
