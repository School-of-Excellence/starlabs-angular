import { Component, ElementRef, inject, OnDestroy, OnInit, TemplateRef, ViewChild, AfterViewInit } from '@angular/core';
import { collection, collectionData, doc, DocumentData, Firestore, getDoc, getDocs, orderBy, Query, query,runTransaction, deleteField, setDoc, Timestamp, updateDoc, where } from '@angular/fire/firestore';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Subject, Subscription } from 'rxjs';
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatBadgeModule } from '@angular/material/badge';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { takeUntil } from 'rxjs/operators';
import { ManageParticipantlistDialogComponent } from '../../Participants Profile Management/participants-analytics/manage-participantlist-dialog/manage-participantlist-dialog.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { environment } from '../../../environments/environment.development';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { ChannelCommunicationComponent } from '../../Channel Communication/channel-communication/channel-communication.component';
import * as XLSX from 'xlsx';
import { T } from '@angular/cdk/keycodes';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

interface StageConfig {
  stageName: string;
  slotConfigured: boolean;
}

interface MergedSlot {
  startdate: Date;
  enddate: Date;
  starttime: string;
  endtime: string;
  stages: string[];
  segmentVariations: {
    segmentId: string;
    segmentName: string;
    variations: {
      variationId: string;
      variationName: string;
      stageData: {
        [stageName: string]: {
          maxslot: number;
          usedslot: number;
          title: string; 
          bigparticipants: any[];
          confirmedParticipants: any[];
          nonConfirmedParticipants: any[];
        }
      }
    }[]
  }[];
}

@Component({
  selector: 'app-queue-planning-review',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    NgxMatSelectSearchModule,
    MatInputModule,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinner,
    MatTableModule,
    MatDialogModule,
    MatTooltipModule,
    MatChipsModule,
    MatCheckboxModule,
    MatBadgeModule,
    ProfilePictureComponent,
  ],
  templateUrl: './queue-planning-review.component.html',
  styleUrl: './queue-planning-review.component.css'
})
export class QueuePlanningReviewComponent implements OnInit, OnDestroy, AfterViewInit {

  @ViewChild('slotplanner') slotPlanner: TemplateRef<Element>;
  @ViewChild('dayButtonsScroll') dayButtonsScroll!: ElementRef;

  searchQueue: string;
  profileid: string;

  selectedStage: string; //-- surya

  selectedQueue = null;
  mapProfile: object = {};
  mapProfileData: object = {};
  roles: object = {};

  queueSubscription: Subscription
  queueList = [];
  liveQueueList = [];
  queueVariationList = [];
  segmentList = [];
  queueTokenList = [];
  cohortQueuePlannerList = [];
  queueStages: string[] = [];
  queueStagesConfig: StageConfig[] = [];
  mergedSlots: MergedSlot[] = [];
  queuePlanningSegmentList: string[] = [];

  private subscriptionHandle = new Subject<void>()
  private subscriptions: Subscription[] = [];
  private destroy$ = new Subject<void>();

  loading: boolean = true;

  // Panel properties
  showSlotPanel: boolean = false;
  selectedSlot: MergedSlot | null = null;
  selectedStageForPanel: string | null = null;
  loadingPanel: boolean = false;
  expandAllRow = true;
  canScrollLeft: boolean = false;
  canScrollRight: boolean = false;
  showFromToday: boolean = true;

  // NEW: Panel view type
  panelViewType: 'slot' | 'queue-tokens' | 'segment-participants' | 'overall-queue-tokens' | 'overall-segment-participants' | null = null;
  selectedStageForCount: string | null = null;

  // Participant lists for panel
  confirmedParticipants: any[] = [];
  nonConfirmedParticipants: any[] = [];
  bigParticipants: any[] = [];
  participantLists: any[] = [];
  allParticipantsForStage: any[] = [];

  // Active panel section
  activePanelSection: 'confirmed' | 'non-confirmed' | 'big' | 'all' | null = null;
  private storage = inject(Storage);

  isStageRangeExpanded = false;

  // Expandable sections
  segmentsExpanded: boolean = false;
  variationsExpanded: boolean = false;
  nonSegmentedParticipants: boolean = false; // -- surya

  // NEW: Stage filter for participants list
  selectedStageFilter: string[] = [];
  // NEW: Segment filter for overall views
  selectedSegmentFilter: string[] = [];

  overallSegmentFilter: string[] = []; // -- surya

  // multi-queue export 
  liveQueueExportSelection: Set<string> = new Set();
  liveQueueExportRange = { startDate: null, endDate: null };
  liveQueueExportBusy: boolean = false;
  liveQueueExportModeOn: boolean = false;
  private liveQueueExportCache = new Map<string, {
    stages: string[];
    planningData: any;
    tokens: any[];
  }>();

  // NEW: Track current status view (confirmed/non-confirmed/all/deleted-slots)
  currentStatusView: 'confirmed' | 'non-confirmed' | 'all' | 'deleted-slots' | 'queue-participants' | 'non-queue' = 'all';
  // NEW: Deleted slots participants
  deletedSlotsParticipants: any[] = [];

  expandedRows: string[] = []
  expandedQueueRows: string[] = [];
  activeSlotPlannerTab: 'appointment' | 'queue' = 'appointment';

  // Cached planning data
  cachedPlanningData: any = null;
  private dataReadyFlags = { tokens: false, planners: false, planning: false };
  private planningSlotLookup = new Map<string, Set<string>>();

  // Queue tab panel
  showQueueTabPanel: boolean = false;
  queueTabPanelParticipants: any[] = [];
  queueTabPanelTitle: string = '';
  queueTabPanelType: 'confirmed' | 'non-confirmed' | 'all' = 'confirmed';
  queueTabPanelSegmentName: string = '';
  queueTabPanelSlotTime: string = '';
  selectedSegmentIds: Set<string> = new Set();
  currentPanelSlot: any = null;

  // Interim report filter
  interimDataLoaded: boolean = false;
  activeInterimCard: 'completed' | 'not-completed' | null = null;
  completedInterimProfileIds: Set<string> = new Set();
  notCompletedInterimProfileIds: Set<string> = new Set();
  allInterimProfileIds: Set<string> = new Set();
  interimCompletedCount: number = 0;
  interimNotCompletedCount: number = 0;
  interimReportLoading: boolean = false;
  interimReportStartDate: Date | null = null;
  interimReportEndDate: Date | null = null;
  showInterimDatePicker: boolean = false;
  
  // Slot booking/revert
  showBookSlotDialog: boolean = false;
  bookSlotParticipant: any = null;
  bookSlotStageName: string = '';
  bookSlotAvailableSlots: any[] = [];
  bookSlotSelectedIndex: number | null = null;
  bookSlotLoading: boolean = false;
  // Arena event id for selected queue
  selectedQueueArenaEventId: string | null = null;
  selectedQueueProductRef: any = null;

  // Event Participation Filter
  eventParticipationDataLoaded: boolean = false;
  eventParticipationLoading: boolean = false;
  showEventParticipationPicker: boolean = false;
  eventParticipationList: any[] = [];
  eventParticipationListLoaded: boolean = false;
  selectedEventParticipation: any = null;
  eventParticipationSearchTerm: string = '';
  arenaEventFilterList: Array<{ docid: string; name: string }> = [];
  selectedArenaEventId: string | null = null;
  arenaEventProfileMap: { [arenaeventid: string]: Set<string> } = {};
  eventParticipationProfileIds: Set<string> = new Set();
  //slot revert
  showOverallSlotRevertHistory: boolean = false;
  overallSlotRevertHistory: { profileId: string; stageName: string; log: any }[] = [];
  revertHistoryLoading: boolean = false;
  revertHistorySearchTerm: string = '';
  revertHistoryAllEntries: { profileId: string; stageName: string; type: string; log: any }[] = [];
  activeHistoryTab: 'reverted' | 'booked' = 'reverted';

  slotPlannerFilter = {
    startDate: null,
    endDate: null,
  }

  selectedDates = [];

  daysMap = {
    Mon: 'Monday',
    Tue: 'TuesDay',
    Wed: 'Wednesday',
    Thu: 'Thusday',
    Fri: 'Friday',
    Sat: 'Saturday',
    Sun: 'Sunday'
  };

  monthsMap = {
    Jan: 'January',
    Feb: 'February',
    Mar: 'March',
    Apr: 'April',
    May: 'May',
    Jun: 'June',
    Jul: 'July',
    Aug: 'Augest',
    Sep: 'September',
    Oct: 'October',
    Nov: 'November',
    Dec: 'December'
  };

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public dialog: MatDialog,
    private http: HttpClient
  ) {
    guard.getProfileMap().then(data => this.mapProfile = data.map);
    guard.getProfileMap().then(data => this.mapProfileData = data.docdata);
    guard.getRoles().then(roles => {
      this.roles = roles;
      this.profileid = roles.profile_ref.id;

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

      const segmentsSub = collectionData(collection(this.firestore, 'segments'), { idField: 'id' }).subscribe(segments => {
        this.segmentList = segments;
      });
      this.subscriptions.push(segmentsSub);

      const participantListsSub = collectionData(collection(this.firestore, 'participant list'), { idField: 'id' }).subscribe(lists => {
        this.participantLists = lists;
      });

      getDocs(queueQuery).then(queue => {
        this.queueList = queue.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        })).sort((a, b) => b['queuestartdate'] - a['queuestartdate']);
      }).then(() => {
        this.loading = false;
      });
    });
  }

  private initializeQueueStagesConfig(stages: string[]): void {
    this.queueStagesConfig = stages.map(stageName => ({
      stageName: stageName,
      slotConfigured: false
    }));
  }

  private updateSlotConfiguredFlags(planningData: any, variationId?: string, segmentId?: string): void {
    this.queueStagesConfig.forEach(stage => stage.slotConfigured = false);

    if (!planningData || !planningData.planning) return;

    const stagesWithSlots = new Set<string>();

    for (const variationPlanning of planningData.planning) {
      if (variationId && variationPlanning.variationid !== variationId) continue;

      if (variationPlanning.segments && variationPlanning.segments.length > 0) {
        for (const segmentData of variationPlanning.segments) {
          if (segmentId && segmentData.segmentid !== segmentId) continue;

          if (segmentData.slots && segmentData.slots.length > 0) {
            for (const slot of segmentData.slots) {
              if (slot.stagename) {
                stagesWithSlots.add(slot.stagename);
              }
            }
          }
        }
      }
    }

    this.queueStagesConfig.forEach(stage => {
      stage.slotConfigured = stagesWithSlots.has(stage.stageName);
    });
  }

  private getStageConfigForVariationSegment(variationId: string, segmentId: string): StageConfig[] {
    const stageConfig: StageConfig[] = this.queueStages.map(stageName => ({
      stageName: stageName,
      slotConfigured: false
    }));

    if (!this.cachedPlanningData || !this.cachedPlanningData.planning) {
      return stageConfig;
    }

    for (const variationPlanning of this.cachedPlanningData.planning) {
      if (variationPlanning.variationid !== variationId) continue;

      if (variationPlanning.segments) {
        for (const segmentData of variationPlanning.segments) {
          if (segmentData.segmentid !== segmentId) continue;

          if (segmentData.slots) {
            for (const slot of segmentData.slots) {
              const stageName = slot.stagename;
              const stageIdx = stageConfig.findIndex(s => s.stageName === stageName);
              if (stageIdx >= 0) {
                stageConfig[stageIdx].slotConfigured = true;
              }
            }
          }
        }
      }
    }

    return stageConfig;
  }

  private findLastPreviousStageWithSlot(
    currentStageIndex: number,
    stageConfig: StageConfig[]
  ): { index: number; stageName: string | null } {

    for (let i = currentStageIndex - 1; i >= 0; i--) {
      if (stageConfig[i].slotConfigured) {
        return {
          index: i,
          stageName: stageConfig[i].stageName
        };
      }
    }

    return { index: -1, stageName: null };
  }

  private findFirstStageWithSlot(stageConfig: StageConfig[]): { index: number; stageName: string | null } {
    for (let i = 0; i < stageConfig.length; i++) {
      if (stageConfig[i].slotConfigured) {
        return {
          index: i,
          stageName: stageConfig[i].stageName
        };
      }
    }

    return { index: -1, stageName: null };
  }

  async onQueueSelect() {
    this.queueStages = [];
    this.queueStagesConfig = [];
    this.queueVariationList = [];
    this.queueTokenList = [];
    this.cohortQueuePlannerList = [];
    this.mergedSlots = [];
    this.queuePlanningSegmentList = [];
    this.cachedPlanningData = null;
    this.dataReadyFlags = { tokens: false, planners: false, planning: false };
    this.selectedQueueArenaEventId = null;
    this.selectedQueueProductRef = null;

    this.closeSlotPanel();
    this.cancelSubscriptions();

    this.interimDataLoaded = false;
    this.activeInterimCard = null;
    this.completedInterimProfileIds = new Set();
    this.notCompletedInterimProfileIds = new Set();
    this.allInterimProfileIds = new Set();

    this.eventParticipationDataLoaded = false;
    this.eventParticipationLoading = false;
    this.showEventParticipationPicker = false;
    this.eventParticipationList = [];
    this.eventParticipationListLoaded = false;
    this.selectedEventParticipation = null;
    this.eventParticipationSearchTerm = '';
    this.arenaEventFilterList = [];
    this.selectedArenaEventId = null;
    this.arenaEventProfileMap = {};
    this.eventParticipationProfileIds = new Set();

    const loading = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Loading Queue Data..." },
      disableClose: true
    });

    try {
      const queueRef = doc(this.firestore, 'queue generation', this.selectedQueue['docid']);
      const queueDoc = await getDoc(queueRef);

      if (queueDoc.exists()) {
        this.queueStages = queueDoc.data()['stages'] || [];
        this.initializeQueueStagesConfig(this.queueStages);
      }

      const queuevariationdocs = await getDocs(
        query(collection(this.firestore, 'queue variation'),
          where('queueref', '==', queueRef))
      );

      if (queuevariationdocs.docs.length === 0) {
        loading.close();
        alert('There is no queue variation for this queue.');
        this.selectedQueue = null;
        return;
      }

      this.queueVariationList = queuevariationdocs.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      const queueTokenQuery = query(
        collection(this.firestore, 'queue_token'),
        where('queueref', '==', queueRef)
      );
      const queueTokenSub = collectionData(queueTokenQuery, { idField: 'id' }).subscribe(tokens => {
        this.queueTokenList = tokens;
        const seenProfileIds = new Set<string>();
        this.queueTokenList = tokens.filter(token => {
          const profileId = token['profile_id'] || token['profileid'];

          // For active, approved, non-deleted tokens - check for duplicates
          if (token['tokenstatus'] === 'Active' && token['stagestatus'] === 'Approved' && [null, undefined, false].includes(token['delete'])) {
            if (!profileId) return true; // Keep tokens without profile_id

            if (seenProfileIds.has(profileId)) {
              return false; // Skip duplicate
            }
            seenProfileIds.add(profileId);
          }
          return true;
        });
        this.dataReadyFlags.tokens = true;
        this.rebuildIfAllReady();
      });
      this.subscriptions.push(queueTokenSub);

      const cohortQueuePlannerQuery = query(
        collection(this.firestore, 'cohorts queue planner'),
        where('queueid', '==', this.selectedQueue['docid'])
      );
      const cohortPlannerSub = collectionData(cohortQueuePlannerQuery, { idField: 'id' }).subscribe(planners => {
        this.cohortQueuePlannerList = planners;
        this.dataReadyFlags.planners = true;
        this.rebuildIfAllReady();
      });
      this.subscriptions.push(cohortPlannerSub);

      const planningQuery = query(
        collection(this.firestore, 'queue planning'),
        where('queueid', '==', this.selectedQueue['docid'])
      );

      // Fetch arena event id 
      const arenaEventsResult = await getDocs(query(collection(this.firestore, 'arena events'),where('type', '==', 'queue'),where('eventref', '==', queueRef)));
      if (!arenaEventsResult.empty) {
        this.selectedQueueArenaEventId = arenaEventsResult.docs[0].data()['docid'] || arenaEventsResult.docs[0].id;
      } else {
        this.selectedQueueArenaEventId = null;
      }
      // Store product ref 
      const queueEligibleProduct = await getDocs(query(collection(this.firestore, 'products'), where('checkforqueue', '==', true)));
      this.selectedQueueProductRef = !queueEligibleProduct.empty ? queueEligibleProduct.docs[0].ref : null;

      const planningSub = collectionData(planningQuery, { idField: 'id' }).subscribe(async (planningDocs) => {
        if (planningDocs.length > 0) {
          this.updateSlotConfiguredFlags(planningDocs[0]);
          this.queuePlanningSegmentList = planningDocs[0]['segmentlist'] || [];
          this.cachedPlanningData = planningDocs[0];
          this.dataReadyFlags.planning = true;
          this.rebuildIfAllReady();
        }
      });
      this.subscriptions.push(planningSub);

      loading.close();
    } catch (error) {
      console.error('Error loading queue:', error);
      loading.close();
      alert('Error loading queue data. Please try again.');
    }
  }

  ngOnInit(): void { }

  ngOnDestroy() {
    this.cancelSubscriptions();
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.checkScrollButtons(), 100)
  }

  returnQueue() {
    return [null, undefined, ''].includes(this.searchQueue) ? this.queueList : this.queueList.filter(e => e['queuename'].toLowerCase().trim().includes(this.searchQueue?.toLowerCase().trim()));
  }

  private cancelSubscriptions() {
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];
  }

  async loadQueuePlanning(planningData: any) {
    this.cachedPlanningData = planningData;
    this.rebuildIfAllReady();
  }

  rebuildIfAllReady() {
    const { tokens, planners, planning } = this.dataReadyFlags;
    if (!tokens || !planners || !planning) return;
    this.rebuildMergedSlots();
    this.refreshSelectedSlot();
    if (this.activePanelSection === 'confirmed') {
      this.showAllConfirmedParticipants();
    } else if (this.activePanelSection === 'non-confirmed') {
      this.showAllNonConfirmedParticipants();
    }
  }

  processMergedSlots() {
    this.rebuildIfAllReady();
  }

  rebuildMergedSlots() {
    const planningData = this.cachedPlanningData;
    if (!planningData) return;

    const slotsMap = new Map<string, any>();

    if (planningData.planning && planningData.planning.length > 0) {
      for (const variationPlanning of planningData.planning) {
        const variationId = variationPlanning.variationid;

        if (variationPlanning.segments && variationPlanning.segments.length > 0) {
          for (const segmentData of variationPlanning.segments) {
            const segmentId = segmentData.segmentid;

            if (segmentData.slots && segmentData.slots.length > 0) {
              for (const slot of segmentData.slots) {
              const toSafeDate = (d: any): Date | null => {
                if (!d) return null;
                if (d.toDate && typeof d.toDate === 'function') return d.toDate();
                if (d.seconds !== undefined) return new Date(d.seconds * 1000);
                if (d instanceof Date) return d;
                return null;
              };

              const startDate = toSafeDate(slot.startdate);
              const endDate = toSafeDate(slot.enddate);
                const stageName = slot.stagename;

                if (startDate && endDate) {
                  const slotKey = this.generateSlotKey(startDate, endDate);

                  if (!slotsMap.has(slotKey)) {
                    slotsMap.set(slotKey, {
                      startdate: startDate,
                      enddate: endDate,
                      starttime: this.formatTimeTo24Hour(startDate),
                      endtime: this.formatTimeTo24Hour(endDate),
                      stages: new Set<string>(),
                      segmentVariationsData: new Map()
                    });
                  }

                  const slotData = slotsMap.get(slotKey);
                  slotData.stages.add(stageName);

                  const segmentVariationKey = `${segmentId}_${variationId}`;
                  if (!slotData.segmentVariationsData.has(segmentVariationKey)) {
                    slotData.segmentVariationsData.set(segmentVariationKey, {
                      segmentId,
                      variationId,
                      stageData: {}
                    });
                  }

                  const segVariationData = slotData.segmentVariationsData.get(segmentVariationKey);
                  segVariationData.stageData[stageName] = {
                    maxslot: slot.maxslot || 0,
                    usedslot: slot.usedslot || 0,
                    title: slot.title || '', 
                    startdate: startDate,
                    enddate: endDate
                  };
                }
              }
            }
          }
        }
      }
    }

    // BUILD LOOKUP MAP FIRST
    // Key: "startTs_endTs_stageName_segmentId" → true
    this.planningSlotLookup = new Map<string, Set<string>>();
    
    slotsMap.forEach((slotData, slotKey) => {
      slotData.segmentVariationsData.forEach((segVarData: any) => {
        Object.keys(segVarData.stageData).forEach((stageName: string) => {
          const lookupKey = `${slotData.startdate.getTime()}_${slotData.enddate.getTime()}_${stageName}`;
          if (!this.planningSlotLookup.has(lookupKey)) {
            this.planningSlotLookup.set(lookupKey, new Set<string>());
          }
          this.planningSlotLookup.get(lookupKey).add(segVarData.segmentId);
        });
      });
    });

    // BUILD mergedSlots normally in one pass
    this.mergedSlots = Array.from(slotsMap.values()).map(slotData => {
      const segmentVariations: any[] = [];

      slotData.segmentVariationsData.forEach((segVarData: any) => {
        const existingSegment = segmentVariations.find(
          sv => sv.segmentId === segVarData.segmentId
        );

        const variationEntry = {
          variationId: segVarData.variationId,
          variationName: this.getVariationName(segVarData.variationId),
          stageData: this.calculateStageData(
            segVarData.segmentId,
            segVarData.variationId,
            segVarData.stageData
          )
        };

        if (existingSegment) {
          existingSegment.variations.push(variationEntry);
        } else {
          segmentVariations.push({
            segmentId: segVarData.segmentId,
            segmentName: this.getSegmentName(segVarData.segmentId),
            variations: [variationEntry]
          });
        }
      });

      return {
        startdate: slotData.startdate,
        enddate: slotData.enddate,
        starttime: slotData.starttime,
        endtime: slotData.endtime,
        stages: Array.from(slotData.stages) as string[],
        segmentVariations: segmentVariations
      };
    });

    this.mergedSlots.sort((a, b) => a.startdate.getTime() - b.startdate.getTime());
  }

  recalculateMergedSlotParticipants() {
    const interimSet = this.activeInterimCard === 'completed' ? this.completedInterimProfileIds
      : this.activeInterimCard === 'not-completed' ? this.notCompletedInterimProfileIds
      : null;

    const eventSet = this.eventParticipationDataLoaded
      ? this.eventParticipationProfileIds
      : null;

    for (const slot of this.mergedSlots) {
      for (const segVar of slot.segmentVariations) {
        for (const variation of segVar.variations) {
          for (const stageName of Object.keys(variation.stageData)) {
            const sd: any = variation.stageData[stageName];

            if (!sd._allConfirmed) {
              sd._allConfirmed = sd.confirmedParticipants || [];
              sd._allNonConfirmed = sd.nonConfirmedParticipants || [];
            }

            if (interimSet || eventSet) {
              const pass = (p: any) => {
                const pid = p.profile_id || p.profileid;
                if (!pid) return false;
                if (interimSet && !interimSet.has(pid)) return false;
                if (eventSet && !eventSet.has(pid)) return false;
                return true;
              };
              sd.confirmedParticipants = sd._allConfirmed.filter(pass);
              sd.nonConfirmedParticipants = sd._allNonConfirmed.filter(pass);
            } else {
              sd.confirmedParticipants = sd._allConfirmed;
              sd.nonConfirmedParticipants = sd._allNonConfirmed;
            }
            sd.usedslot = sd.confirmedParticipants.length;
          }
        }
      }
    }
  }

  calculateStageData(segmentId: string, variationId: string, stageData: any): any {
    const result = {};

    Object.keys(stageData).forEach(stageName => {
      const slot = stageData[stageName];
      const startDateTime = slot.startdate;
      const endDateTime = slot.enddate;

      const bigparticipants = this.getBigParticipantsForSlot(
        variationId,
        segmentId,
        stageName,
        startDateTime,
        endDateTime
      );

      const confirmedParticipants = this.getConfirmedParticipantsForSlot(
        variationId,
        segmentId,
        stageName,
        startDateTime,
        endDateTime
      );

      const nonConfirmedParticipants = this.getNonConfirmedParticipantsForSlot(
        variationId,
        segmentId,
        stageName,
        startDateTime,
        endDateTime
      );

      result[stageName] = {
        maxslot: slot.maxslot || 0,
        usedslot: confirmedParticipants.length,
        title: slot.title || '',
        bigparticipants: bigparticipants,
        confirmedParticipants: confirmedParticipants,
        nonConfirmedParticipants: nonConfirmedParticipants
      };
    });

    return result;
  }

  generateSlotKey(startDate: Date, endDate: Date): string {
    return `${startDate.getTime()}_${endDate.getTime()}`;
  }

  getBigParticipantsForSlot(
    variationid: string,
    segmentid: string,
    stagename: string,
    startdate: Date,
    enddate: Date
  ): any[] {

    const toDate = (d: any): Date | null => {
      if (!d) return null;

      if (d.toDate && typeof d.toDate === 'function') {
        return d.toDate();
      }

      if (d instanceof Date) {
        return d;
      }

      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const formatDateForComparison = (date: Date): string => {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    const expectedStart = toDate(startdate);
    const expectedEnd = toDate(enddate);

    if (!expectedStart || !expectedEnd) {
      return [];
    }

    const expectedStartStr = formatDateForComparison(expectedStart);
    const expectedEndStr = formatDateForComparison(expectedEnd);

    const matchingParticipants: any[] = [];
    const addedProfileIds = new Set<string>();

    for (const planner of this.cohortQueuePlannerList) {
      const profileId = planner.profileid || planner.profile_id;

      if (!profileId || addedProfileIds.has(profileId)) {
        continue;
      }

      const slots = planner.selectedslots || [];

      for (const slot of slots) {
        if (slot.stagename !== stagename || slot.segmentid !== segmentid) {
          continue;
        }

        const slotStart = toDate(slot.startdate);
        const slotEnd = toDate(slot.enddate);

        if (!slotStart || !slotEnd) {
          continue;
        }

        const slotStartStr = formatDateForComparison(slotStart);
        const slotEndStr = formatDateForComparison(slotEnd);

        if (slotStartStr === expectedStartStr && slotEndStr === expectedEndStr) {
          addedProfileIds.add(profileId);
          matchingParticipants.push({
            ...planner,
            slotInfo: slot,
            isBigParticipant: true
          });
          break;
        }
      }
    }

    return matchingParticipants;
  }

  // NEW: Get overall deleted slots participants count
  getOverallDeletedSlotsCount(): number {
    const deletedSlotsParticipants = new Set<string>();

    this.queueTokenList.forEach(token => {
      const profileId = token.profile_id || token.profileid;
      const stages = Object.keys(token.selectedstageslot || {});

      stages.forEach(stageName => {
        const slotExists = this.checkParticipantSlotExistsInStage(token, stageName);
        if (!slotExists) {
          deletedSlotsParticipants.add(profileId);
        }
      });
    });

    return deletedSlotsParticipants.size;
  }

  // NEW: Get confirmed participants count for overall view
  getOverallConfirmedCount(): number {
    const confirmedParticipants = new Set<string>();

    this.queueTokenList.forEach(token => {
      if (token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete)) {
        const stages = Object.keys(token.selectedstageslot || {});
        if (stages.length > 0) {
          const profileId = token.profile_id || token.profileid;
          confirmedParticipants.add(profileId);
        }
      }
    });

    return confirmedParticipants.size;
  }

  // NEW: Get non-confirmed participants count for overall view
  getOverallNonConfirmedCount(): number {
    const allParticipants = new Set<string>();
    const confirmedParticipants = new Set<string>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const participants = this.getParticipantsForSegment(segmentId);
      participants.forEach(p => allParticipants.add(p));
    });

    this.queueTokenList.forEach(token => {
      if (token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete)) {
        const stages = Object.keys(token.selectedstageslot || {});
        if (stages.length > 0) {
          const profileId = token.profile_id || token.profileid;
          confirmedParticipants.add(profileId);
        }
      }
    });

    return allParticipants.size - confirmedParticipants.size;
  }

  checkSlotExistsInPlanning(variationid: string, segmentid: string, stagename: string, startTs: number, endTs: number): boolean {
    const lookupKey = `${startTs}_${endTs}_${stagename}`;
    const segmentSet = this.planningSlotLookup.get(lookupKey);
    
    if (segmentSet && segmentSet.has(segmentid)) {
      return true;
    }
    
    return false;
  }

  getNonConfirmedParticipantsForSlot(
    variationid: string,
    segmentid: string,
    stagename: string,
    startdate: Date,
    enddate: Date
  ): any[] {

    const currentStageIndex = this.queueStages.indexOf(stagename);
    if (currentStageIndex === -1) {
      return [];
    }

    const toTime = (d: any): number | null => {
      if (!d) return null;
      const dateObj = d.toDate ? d.toDate() : new Date(d);
      const t = new Date(dateObj).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const startTs = toTime(startdate);
    const endTs = toTime(enddate);

    if (startTs === null || endTs === null) return [];

    const nonConfirmedParticipants: any[] = [];
    const addedProfileIds = new Set<string>();

    const validParticipantIds = this.getParticipantsForSegment(segmentid);

    const stageConfig = this.getStageConfigForVariationSegment(variationid, segmentid);

    const firstStageWithSlot = this.findFirstStageWithSlot(stageConfig);
    const isFirstStageWithSlot = (currentStageIndex === firstStageWithSlot.index);

    let lastPreviousStageWithSlot = { index: -1, stageName: null };
    let checkFromStageIndex = currentStageIndex;

    if (!isFirstStageWithSlot) {
      lastPreviousStageWithSlot = this.findLastPreviousStageWithSlot(currentStageIndex, stageConfig);
      checkFromStageIndex = lastPreviousStageWithSlot.index >= 0
        ? lastPreviousStageWithSlot.index + 1
        : 0;
    } else {
      checkFromStageIndex = 0;
    }

    const checkFromStageName = this.queueStages[checkFromStageIndex] || '';

    (this.queueTokenList || []).forEach(token => {
      const profileId = token.profile_id || token.profileid;

      if (!validParticipantIds.includes(profileId)) return;

      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return;
      }

      const tokenCurrentStageIndex = this.queueStages.indexOf(token.currentstage);
      if (tokenCurrentStageIndex === -1) return;

      if (tokenCurrentStageIndex > currentStageIndex) return;

      if (tokenCurrentStageIndex >= checkFromStageIndex && tokenCurrentStageIndex <= currentStageIndex) {
        const stageSlots = token.selectedstageslot || {};

        const hasConfirmedThisStage = stageSlots[stagename] != null;
        if (!hasConfirmedThisStage) {

          if (this.activeInterimCard === 'completed' && !this.completedInterimProfileIds.has(profileId)) {
            return;
          }
          if (this.activeInterimCard === 'not-completed' && !this.notCompletedInterimProfileIds.has(profileId)) {
            return;
          }

          if (profileId && !addedProfileIds.has(profileId)) {
            addedProfileIds.add(profileId);
            const participantSegmentId = this.getParticipantSegment(profileId);

            nonConfirmedParticipants.push({
              ...token,
              isNonQueueParticipant: false,
              reason: isFirstStageWithSlot
                ? 'Slot not confirmed (First stage with slot)'
                : `Slot not confirmed (checking from stage ${checkFromStageIndex} after last slot at stage ${lastPreviousStageWithSlot.index})`,
              currentStageIndex: tokenCurrentStageIndex,
              checkFromStageIndex: checkFromStageIndex,
              checkFromStageName: checkFromStageName,
              checkToStageName: stagename,
              lastPreviousStageWithSlot: lastPreviousStageWithSlot.stageName,
              lastPreviousStageWithSlotIndex: lastPreviousStageWithSlot.index,
              isFirstStageWithSlot: isFirstStageWithSlot,
              firstStageWithSlot: firstStageWithSlot.stageName,
              firstStageWithSlotIndex: firstStageWithSlot.index,
              segmentId: segmentid,
              variationId: variationid,
              participantSegmentId: participantSegmentId
            });
          }
        }
      }
    });

    if (isFirstStageWithSlot) {
      validParticipantIds.forEach(profileId => {
        if (!profileId) return;

        if (addedProfileIds.has(profileId)) return;

        const hasQueueToken = this.queueTokenList.some(token =>
          (token.profile_id === profileId || token.profileid === profileId)
        );

        if (!hasQueueToken) {

          if (this.activeInterimCard === 'completed' && !this.completedInterimProfileIds.has(profileId)) {
            return;
          }
          if (this.activeInterimCard === 'not-completed' && !this.notCompletedInterimProfileIds.has(profileId)) {
            return;
          }

          addedProfileIds.add(profileId);
          const participantSegmentId = this.getParticipantSegment(profileId);

          const cohortPlanner = this.cohortQueuePlannerList.find(planner => {
            const plannerId = planner.profileid || planner.profile_id;
            return plannerId === profileId;
          });

          if (cohortPlanner) {
            nonConfirmedParticipants.push({
              ...cohortPlanner,
              isNonQueueParticipant: true,
              reason: 'No queue token - Awaiting first stage confirmation (from B!G list)',
              checkFromStageIndex: checkFromStageIndex,
              checkFromStageName: checkFromStageName,
              checkToStageName: stagename,
              lastPreviousStageWithSlot: lastPreviousStageWithSlot.stageName,
              lastPreviousStageWithSlotIndex: lastPreviousStageWithSlot.index,
              isFirstStageWithSlot: isFirstStageWithSlot,
              firstStageWithSlot: firstStageWithSlot.stageName,
              firstStageWithSlotIndex: firstStageWithSlot.index,
              segmentId: segmentid,
              variationId: variationid,
              participantSegmentId: participantSegmentId
            });
          } else {
            nonConfirmedParticipants.push({
              profile_id: profileId,
              profileid: profileId,
              isNonQueueParticipant: true,
              reason: 'No queue token - Awaiting first stage confirmation',
              checkFromStageIndex: checkFromStageIndex,
              checkFromStageName: checkFromStageName,
              checkToStageName: stagename,
              lastPreviousStageWithSlot: lastPreviousStageWithSlot.stageName,
              lastPreviousStageWithSlotIndex: lastPreviousStageWithSlot.index,
              isFirstStageWithSlot: isFirstStageWithSlot,
              firstStageWithSlot: firstStageWithSlot.stageName,
              firstStageWithSlotIndex: firstStageWithSlot.index,
              segmentId: segmentid,
              variationId: variationid,
              participantSegmentId: participantSegmentId
            });
          }
        }
      });
    }

    return nonConfirmedParticipants;
  }

  getConfirmedParticipantsForSlot(
    variationid: string,
    segmentid: string,
    stagename: string,
    startdate: Date,
    enddate: Date
  ): any[] {
    const toTime = (d: any): number | null => {
      if (!d) return null;
      if (d.seconds !== undefined) return d.seconds * 1000;
      if (d.toDate && typeof d.toDate === 'function') return d.toDate().getTime();
      if (d instanceof Date) return d.getTime();
      const t = new Date(d).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const startTs = toTime(startdate);
    const endTs = toTime(enddate);
    if (startTs === null || endTs === null) return [];

    const currentStageIndex = this.queueStages.indexOf(stagename);
    if (currentStageIndex === -1) return [];

    const matchingTokens: any[] = [];

    for (const token of this.queueTokenList || []) {
      if (token.tokenstatus !== 'Active') continue;
      if (token.stagestatus !== 'Approved') continue;
      if (![null, undefined, false].includes(token.delete)) continue;

      const stageSlots = token.selectedstageslot || {};
      const slot = stageSlots[stagename];

      if (
        slot &&
        slot.segmentid === segmentid &&
        slot.stagename === stagename &&
        toTime(slot.startdate) === startTs &&
        toTime(slot.enddate) === endTs
      ) {
        const profileId = token.profile_id || token.profileid;

        if (this.activeInterimCard === 'completed' && !this.completedInterimProfileIds.has(profileId)) {
          continue;
        }
        if (this.activeInterimCard === 'not-completed' && !this.notCompletedInterimProfileIds.has(profileId)) {
          continue;
        }

        const slotExistsInPlanning = this.checkSlotExistsInPlanning(
          slot.variationid || variationid,
          slot.segmentid || segmentid,
          stagename,
          toTime(slot.startdate),
          toTime(slot.enddate)
        );

        const participantSegmentId = this.getParticipantSegment(profileId);

        matchingTokens.push({
          ...token,
          hasInvalidSlot: !slotExistsInPlanning,
          invalidSlotReason: !slotExistsInPlanning ? 'Slot does not exist in queue planning' : null,
          participantSegmentId: participantSegmentId
        });
      }
    }

    return matchingTokens;
  }

  // NEW: Get queue token count for a specific stage
  getQueueTokenCountForStage(stage: string): number {
    if (!this.queueTokenList || this.queueTokenList.length === 0) return 0;

    return this.queueTokenList.filter(token => {
      return token.currentstage === stage && token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete);
    }).length;
  }

  // NEW: Get confirmed queue token count for a specific stage
  getConfirmedQueueTokenCountForStage(stage: string): number {
    if (!this.queueTokenList || this.queueTokenList.length === 0) return 0;

    return this.queueTokenList.filter(token => {
      if (token.currentstage !== stage || token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return false;
      }

      // Check if token has selected slot for this stage
      const stageSlots = token.selectedstageslot || {};
      return stageSlots[stage] != null;
    }).length;
  }

  // NEW: Get non-confirmed queue token count for a specific stage
  getNonConfirmedQueueTokenCountForStage(stage: string): number {
    if (!this.queueTokenList || this.queueTokenList.length === 0) return 0;

    return this.queueTokenList.filter(token => {
      if (token.currentstage !== stage || token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return false;
      }

      // Check if token does NOT have selected slot for this stage
      const stageSlots = token.selectedstageslot || {};
      return stageSlots[stage] == null;
    }).length;
  }

  // NEW: Get all segment participants count for a specific stage
  getSegmentParticipantsCountForStage(stage: string): number {
    const allParticipants = new Set<string>();

    // Get all segments
    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const participants = this.getParticipantsForSegment(segmentId);
      participants.forEach(p => allParticipants.add(p));
    });

    return allParticipants.size;
  }

  // NEW: Get confirmed segment participants count for a specific stage
  getConfirmedSegmentParticipantsCountForStage(stage: string): number {
    const confirmedParticipants = new Set<string>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        const queueToken = this.queueTokenList.find(token =>
          (token.profile_id === profileId || token.profileid === profileId)
        );

        if (queueToken) {
          const stageSlots = queueToken.selectedstageslot || {};
          if (stageSlots[stage] != null) {
            confirmedParticipants.add(profileId);
          }
        }
      });
    });

    return confirmedParticipants.size;
  }

  // NEW: Get non-confirmed segment participants count for a specific stage
  getNonConfirmedSegmentParticipantsCountForStage(stage: string): number {
    const nonConfirmedParticipants = new Set<string>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        const queueToken = this.queueTokenList.find(token =>
          (token.profile_id === profileId || token.profileid === profileId)
        );

        if (queueToken) {
          const stageSlots = queueToken.selectedstageslot || {};
          if (stageSlots[stage] == null) {
            nonConfirmedParticipants.add(profileId);
          }
        } else {
          // No queue token means non-confirmed
          nonConfirmedParticipants.add(profileId);
        }
      });
    });

    return nonConfirmedParticipants.size;
  }

  // NEW: Get overall queue token count (all stages)
  getOverallQueueTokenCount(): number {
    if (!this.queueTokenList || this.queueTokenList.length === 0) return 0;

    return this.queueTokenList.filter(token => {
      return token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete);
    }).length;
  }

  getOverallSegmentParticipantsCount(): number {
    return this.getAllSegmentParticipantIds().size;
  }

  // Add method to find duplicate participants (in both queue and appearing multiple times in segments)
  getDuplicateParticipantIds(): Set<string> {
    const duplicateIds = new Set<string>();
    const seenInSegments = new Map<string, string[]>(); // profileId -> segmentIds

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      if (!this.isSegmentInQueuePlanning(segmentId)) return;

      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        if (!profileId) return;

        if (!seenInSegments.has(profileId)) {
          seenInSegments.set(profileId, []);
        }
        seenInSegments.get(profileId).push(segmentId);
      });
    });

    // Find participants in multiple segments
    seenInSegments.forEach((segmentIds, profileId) => {
      if (segmentIds.length > 1) {
        duplicateIds.add(profileId);
      }
    });

    return duplicateIds;
  }

  // NEW: Check if participant's selected slot exists in any stage's slots
  checkParticipantSlotExistsInStage(participant: any, stageName: string): boolean {
    const stageSlots = participant.selectedstageslot || {};
    const selectedSlot = stageSlots[stageName];

    if (!selectedSlot) return true; // No slot selected, so not a deleted slot case

    const toTime = (d: any): number | null => {
      if (!d) return null;
      const dateObj = d.toDate ? d.toDate() : new Date(d);
      const t = new Date(dateObj).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const selectedStartTs = toTime(selectedSlot.startdate);
    const selectedEndTs = toTime(selectedSlot.enddate);

    if (selectedStartTs === null || selectedEndTs === null) return true;

    // Check if this slot exists in merged slots for this stage
    for (const mergedSlot of this.mergedSlots) {
      if (!mergedSlot.stages.includes(stageName)) continue;

      const slotStartTs = mergedSlot.startdate.getTime();
      const slotEndTs = mergedSlot.enddate.getTime();

      if (slotStartTs === selectedStartTs && slotEndTs === selectedEndTs) {
        // Slot time matches, now check if segment exists
        const segmentId = selectedSlot.segmentid;
        const segmentVar = mergedSlot.segmentVariations.find(sv => sv.segmentId === segmentId);

        if (segmentVar) {
          // Check if any variation has this stage configured
          const hasStageConfigured = segmentVar.variations.some(v =>
            v.stageData && v.stageData[stageName]
          );

          if (hasStageConfigured) {
            return true; // Slot exists
          }
        }
      }
    }

    return false; // Slot doesn't exist in planning
  }

  // NEW: Open panel for queue tokens
  openQueueTokensPanel(stage: string) {
    this.panelViewType = 'queue-tokens';
    this.selectedStageForCount = stage;
    this.selectedStageForPanel = stage;
    this.showSlotPanel = true;
    this.activePanelSection = null; // Don't show list initially - user must click confirmed/non-confirmed
    this.selectedStageFilter = [];
    this.allParticipantsForStage = []; // Clear any previous list
  }

  // NEW: Open panel for segment participants
  openSegmentParticipantsPanel(stage: string) {
    this.panelViewType = 'segment-participants';
    this.selectedStageForCount = stage;
    this.selectedStageForPanel = stage;
    this.showSlotPanel = true;
    this.activePanelSection = null; // Don't show list initially - user must click confirmed/non-confirmed
    this.selectedStageFilter = [];
    this.allParticipantsForStage = []; // Clear any previous list
  }

  // NEW: Open overall queue tokens panel
  openOverallQueueTokensPanel() {
    this.panelViewType = 'overall-queue-tokens';
    this.selectedStageForCount = null;
    this.selectedStageForPanel = null;
    this.showSlotPanel = true;
    this.activePanelSection = null;
    this.selectedStageFilter = [];
    this.selectedSegmentFilter = [];
    this.currentStatusView = 'queue-participants'; // -- surya
    this.nonSegmentedParticipants = false; // -- surya
    this.allParticipantsForStage = [];
    this.showOverallQueueParticipants();
  }

  // function to open invalid tokens panel - surya
  openOverallInvalidQueueTokensPanel() {
    this.openOverallQueueTokensPanel()
    if (this.nonSegmentParticipant() > 0) {
      this.nonSegmentedParticipants = true;
      this.showOverallQueueParticipants()
    }
  }

  // NEW: Open overall segment participants panel
  openOverallSegmentParticipantsPanel() {
    this.panelViewType = 'overall-segment-participants';
    this.currentStatusView = 'all'; // --- surya
    this.selectedStageForCount = null;
    this.selectedStageForPanel = null;
    this.showSlotPanel = true;
    this.activePanelSection = null;
    this.selectedStageFilter = [];
    this.selectedSegmentFilter = [];
    this.nonSegmentedParticipants = false; // -- surya
    this.allParticipantsForStage = [];
  }


  // NEW: Show confirmed participants for stage
  showConfirmedForStage() {
    this.activePanelSection = 'all';
    this.loadingPanel = true;
    this.allParticipantsForStage = [];
    this.selectedStageFilter = []; // Reset filter when switching views

    if (this.panelViewType === 'queue-tokens') {
      this.loadConfirmedQueueTokensForStage(this.selectedStageForCount);
    } else if (this.panelViewType === 'segment-participants') {
      this.loadConfirmedSegmentParticipantsForStage(this.selectedStageForCount);
    }
  }

  // NEW: Show all confirmed participants for overall view
  showOverallConfirmed() {
    this.activePanelSection = 'all';
    this.currentStatusView = 'confirmed';
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    if (this.panelViewType === 'overall-queue-tokens') {
      this.loadOverallConfirmedQueueTokens();
    } else if (this.panelViewType === 'overall-segment-participants') {
      this.loadOverallConfirmedSegmentParticipants();
    }
  }

  // NEW: Show all non-confirmed participants for overall view
  showOverallNonConfirmed() {
    this.activePanelSection = 'all';
    this.currentStatusView = 'non-confirmed';
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    if (this.panelViewType === 'overall-queue-tokens') {
      this.loadOverallNonConfirmedQueueTokens();
    } else if (this.panelViewType === 'overall-segment-participants') {
      this.loadOverallNonConfirmedSegmentParticipants();
    }
  }

  // NEW: Show all deleted slots participants
  showOverallDeletedSlots() {
    this.activePanelSection = 'all';
    this.currentStatusView = 'deleted-slots';
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    this.loadOverallDeletedSlotsParticipants();
  }

  // NEW: Load overall confirmed queue tokens
  loadOverallConfirmedQueueTokens() {
    const confirmedTokens = this.queueTokenList.filter(token => {
      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return false;
      }

      const stages = Object.keys(token.selectedstageslot || {});
      return stages.length > 0;
    });

    this.allParticipantsForStage = confirmedTokens.map(token => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegment(profileId);
      console.log('segmentid', participantSegmentId);

      return {
        ...token,
        selected: true,
        participantSegmentId: participantSegmentId,
        segmentName: this.getSegmentName(participantSegmentId),
        selectedSlots: this.getParticipantSelectedSlots(token)
      };
    });

    this.applyFilters();
    this.loadingPanel = false;
  }

  // NEW: Load overall non-confirmed queue tokens
  loadOverallNonConfirmedQueueTokens() {
    const nonConfirmedTokens = this.queueTokenList.filter(token => {
      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return false;
      }

      const stages = Object.keys(token.selectedstageslot || {});
      return stages.length === 0;
    });

    this.allParticipantsForStage = nonConfirmedTokens.map(token => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegment(profileId);
      console.log('segmentid2', participantSegmentId);

      return {
        ...token,
        selected: true,
        participantSegmentId: participantSegmentId,
        segmentName: this.getSegmentName(participantSegmentId),
        selectedSlots: this.getParticipantSelectedSlots(token)
      };
    });

    this.applyFilters();
    this.loadingPanel = false;
  }

  // NEW: Load overall confirmed segment participants
  loadOverallConfirmedSegmentParticipants() {
    const confirmedParticipants = new Map<string, any>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const segmentName = segment['segmentname'];
      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        const queueToken = this.queueTokenList.find(token =>
          (token.profile_id === profileId || token.profileid === profileId)
        );

        if (queueToken) {
          const stages = Object.keys(queueToken.selectedstageslot || {});
          if (stages.length > 0 && !confirmedParticipants.has(profileId)) {
            confirmedParticipants.set(profileId, {
              ...queueToken,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              selectedSlots: this.getParticipantSelectedSlots(queueToken)
            });
          }
        }
      });
    });

    this.allParticipantsForStage = Array.from(confirmedParticipants.values());
    this.applyFilters();
    this.loadingPanel = false;
  }

  // NEW: Load overall non-confirmed segment participants
  loadOverallNonConfirmedSegmentParticipants() {
    const nonConfirmedParticipants = new Map<string, any>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const segmentName = segment['segmentname'];
      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        const queueToken = this.queueTokenList.find(token =>
          (token.profile_id === profileId || token.profileid === profileId)
        );

        if (queueToken) {
          const stages = Object.keys(queueToken.selectedstageslot || {});
          if (stages.length === 0 && !nonConfirmedParticipants.has(profileId)) {
            nonConfirmedParticipants.set(profileId, {
              ...queueToken,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              selectedSlots: this.getParticipantSelectedSlots(queueToken)
            });
          }
        } else {
          if (!nonConfirmedParticipants.has(profileId)) {
            nonConfirmedParticipants.set(profileId, {
              profile_id: profileId,
              profileid: profileId,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              isNonQueueParticipant: true,
              selectedSlots: []
            });
          }
        }
      });
    });

    this.allParticipantsForStage = Array.from(nonConfirmedParticipants.values());
    this.applyFilters();
    this.loadingPanel = false;
  }

  // NEW: Load overall deleted slots participants
  loadOverallDeletedSlotsParticipants() {
    const deletedSlotsMap = new Map<string, any>();

    this.queueTokenList.forEach(token => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegment(profileId);
      const stages = Object.keys(token.selectedstageslot || {});
      console.log('segmentid3', participantSegmentId);

      stages.forEach(stageName => {
        const slotExists = this.checkParticipantSlotExistsInStage(token, stageName);
        if (!slotExists && !deletedSlotsMap.has(profileId)) {
          deletedSlotsMap.set(profileId, {
            ...token,
            selected: true,
            participantSegmentId: participantSegmentId,
            segmentName: this.getSegmentName(participantSegmentId),
            selectedSlots: this.getParticipantSelectedSlots(token),
            hasDeletedSlot: true,
            deletedSlotStages: []
          });
        }

        if (!slotExists && deletedSlotsMap.has(profileId)) {
          const participant = deletedSlotsMap.get(profileId);
          if (!participant.deletedSlotStages) {
            participant.deletedSlotStages = [];
          }
          if (!participant.deletedSlotStages.includes(stageName)) {
            participant.deletedSlotStages.push(stageName);
          }
        }
      });
    });

    this.allParticipantsForStage = Array.from(deletedSlotsMap.values());
    this.applyFilters();
    this.loadingPanel = false;
  }

  // applyFilters() {
  //   let filteredList = [...this.allParticipantsForStage];

  //   // Apply segment filter (multiselect)
  //   if (this.selectedSegmentFilter.length > 0) {
  //     filteredList = filteredList.filter(p =>
  //       this.selectedSegmentFilter.includes(p.participantSegmentId)
  //     );
  //   }

  //   // Apply stage filter (multiselect) - filter by current stage or selected slots
  //   if (this.selectedStageFilter.length > 0) {
  //     filteredList = filteredList.filter(p => {
  //       // Check if current stage matches
  //       if (p.currentstage && this.selectedStageFilter.includes(p.currentstage)) {
  //         return true;
  //       }
  //       // Check if any selected slot matches
  //       if (p.selectedSlots && p.selectedSlots.length > 0) {
  //         return p.selectedSlots.some(slot => this.selectedStageFilter.includes(slot.stageName));
  //       }
  //       return false;
  //     });
  //   }

  //   this.allParticipantsForStage = filteredList;
  // }

  // function to apply filters - surya
  applyFilters() {
    let filteredList = [...this.allParticipantsForStage];

    // Apply segment filter (multiselect)
    if (this.selectedSegmentFilter.length > 0) {
      filteredList = filteredList.filter(p =>
        this.selectedSegmentFilter.includes(p.participantSegmentId)
      );
    }

    // Apply stage filter (multiselect) - filter by current stage or selected slots
    if (this.selectedStageFilter.length > 0) {
      filteredList = filteredList.filter(p => {
        // Check if current stage matches
        if (p.currentstage && this.selectedStageFilter.includes(p.currentstage)) {
          return true;
        }
        // Check if any selected slot matches
        if (p.selectedSlots && p.selectedSlots.length > 0) {
          return p.selectedSlots.some(slot => this.selectedStageFilter.includes(slot.stageName));
        }
        return false;
      });
    }

    if (this.nonSegmentedParticipants && this.currentStatusView == "queue-participants") {
      filteredList = filteredList.filter((p) => {
        return p?.isNonSegmentParticipant;
      });
    }

    this.allParticipantsForStage = filteredList;
  }


  onSegmentFilterChange() {
    this.loadingPanel = true;

    // Reload the current view data
    if (this.currentStatusView === 'queue-participants') {
      this.allParticipantsForStage = this.getQueueParticipantsForOverall();
    } else if (this.currentStatusView === 'non-queue') {
      this.allParticipantsForStage = this.getNonQueueParticipantsForOverall();
    } else if (this.currentStatusView === 'deleted-slots') {
      this.allParticipantsForStage = this.getDeletedSlotsParticipantsForOverall();
    } else if (this.currentStatusView === 'confirmed') {
      if (this.panelViewType === 'overall-queue-tokens') {
        this.loadOverallConfirmedQueueTokens();
      } else if (this.panelViewType === 'overall-segment-participants') {
        this.loadOverallConfirmedSegmentParticipants();
      }
      return;
    } else if (this.currentStatusView === 'non-confirmed') {
      if (this.panelViewType === 'overall-queue-tokens') {
        this.loadOverallNonConfirmedQueueTokens();
      } else if (this.panelViewType === 'overall-segment-participants') {
        this.loadOverallNonConfirmedSegmentParticipants();
      }
      return;
    }

    this.applyFilters();
    this.loadingPanel = false;
  }
  // NEW: On stage filter change
  onStageFilterChange() {
    this.onSegmentFilterChange(); // Reuse the same logic
  }

  // filter data by non segment participant -- surya
  filterNonSegmentParticipants() {
    this.nonSegmentedParticipants = !this.nonSegmentedParticipants;
    this.onSegmentFilterChange();
  }

  // Export all queue tokens (overall)
  exportOverallQueueTokens() {
    const allQueueTokens = this.queueTokenList.filter(token => {
      return token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete);
    });

    if (allQueueTokens.length === 0) {
      alert('No queue tokens to export');
      return;
    }

    const exportData = allQueueTokens.map((token, index) => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegment(profileId);
      const variationName = this.getParticipantVariation(token);
      const selectedSlots = this.getParticipantSelectedSlots(token);
      const duplicateSegments = this.getParticipantSegments(profileId);
      const isDuplicate = duplicateSegments.length > 1;

      const slotsInfo = selectedSlots.map(slot =>
        `${slot.stageName}: ${slot.segmentName} (${this.formatDateTo12Hour(slot.startdate?.toDate())} - ${this.formatDateTo12Hour(slot.enddate?.toDate())})`
      ).join('; ') || 'No slots';

      // Check for deleted slots
      const stageSlots = token.selectedstageslot || {};
      const stages = Object.keys(stageSlots);
      const deletedSlotStages: string[] = [];
      stages.forEach(stageName => {
        const slotExists = this.checkParticipantSlotExistsInStage(token, stageName);
        if (!slotExists) {
          deletedSlotStages.push(stageName);
        }
      });

      return {
        'No': index + 1,
        'Name': this.getProfileName(profileId),
        'Profile ID': profileId,
        'Segment': this.getSegmentName(participantSegmentId) || 'N/A',
        'Segment ID': participantSegmentId || 'N/A',
        'Variation': variationName || 'N/A',
        'Current Stage': token.currentstage || 'N/A',
        'Token Status': token.tokenstatus || 'N/A',
        'Stage Status': token.stagestatus || 'N/A',
        'Selected Slots Count': selectedSlots.length,
        'Selected Slots': slotsInfo,
        'Has Deleted Slot': deletedSlotStages.length > 0 ? 'Yes' : 'No',
        'Deleted Slot Stages': deletedSlotStages.join(', ') || 'N/A',
        'Is Duplicate': isDuplicate ? 'Yes' : 'No',
        'Found In Segments': duplicateSegments.join(', ') || 'N/A',
        'Token ID': token.id || 'N/A',
        'Created At': token.createdon?.toDate ? token.createdon.toDate().toISOString() : 'N/A'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Queue Tokens');

    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.min(
        Math.max(
          key.length,
          ...exportData.map(row => String(row[key] || '').length)
        ),
        maxWidth
      )
    }));
    worksheet['!cols'] = colWidths;

    const fileName = `overall_queue_tokens_${this.selectedQueue?.['queuename'] || 'queue'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  // Export all segment participants (overall)
  exportOverallSegmentParticipants() {
    const allParticipants: any[] = [];
    const addedProfileIds = new Set<string>();
    const duplicateIds = this.getDuplicateParticipantIds();

    // Get queue token profile IDs for status check
    const queueTokenMap = new Map<string, any>();
    this.queueTokenList.forEach(token => {
      if (token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete)) {
        const profileId = token.profile_id || token.profileid;
        if (profileId) {
          queueTokenMap.set(profileId, token);
        }
      }
    });

    // Iterate through segments in queue planning
    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const segmentName = segment['segmentname'];

      if (!this.isSegmentInQueuePlanning(segmentId)) return;

      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        if (!profileId || addedProfileIds.has(profileId)) return;
        addedProfileIds.add(profileId);

        const queueToken = queueTokenMap.get(profileId);
        const isInQueue = !!queueToken;
        const isDuplicate = duplicateIds.has(profileId);
        const duplicateSegments = this.getParticipantSegments(profileId);

        let selectedSlots: any[] = [];
        let variationName = '';
        let currentStage = '';
        let tokenStatus = '';
        let stageStatus = '';
        let deletedSlotStages: string[] = [];

        if (queueToken) {
          selectedSlots = this.getParticipantSelectedSlots(queueToken);
          variationName = this.getParticipantVariation(queueToken);
          currentStage = queueToken.currentstage || '';
          tokenStatus = queueToken.tokenstatus || '';
          stageStatus = queueToken.stagestatus || '';

          // Check for deleted slots
          const stageSlots = queueToken.selectedstageslot || {};
          const stages = Object.keys(stageSlots);
          stages.forEach(stageName => {
            const slotExists = this.checkParticipantSlotExistsInStage(queueToken, stageName);
            if (!slotExists) {
              deletedSlotStages.push(stageName);
            }
          });
        }

        const slotsInfo = selectedSlots.map(slot =>
          `${slot.stageName}: ${slot.segmentName} (${this.formatDateTo12Hour(slot.startdate?.toDate())} - ${this.formatDateTo12Hour(slot.enddate?.toDate())})`
        ).join('; ') || 'No slots';

        allParticipants.push({
          profileId,
          segmentId,
          segmentName,
          isInQueue,
          variationName,
          currentStage,
          tokenStatus,
          stageStatus,
          selectedSlots,
          slotsInfo,
          deletedSlotStages,
          isDuplicate,
          duplicateSegments
        });
      });
    });

    if (allParticipants.length === 0) {
      alert('No segment participants to export');
      return;
    }

    const exportData = allParticipants.map((p, index) => ({
      'No': index + 1,
      'Name': this.getProfileName(p.profileId),
      'Email': this.getParticipantEmail(p.profileId) ?? 'N/A',
      'Profile ID': p.profileId,
      'Segment': p.segmentName || 'N/A',
      'Segment ID': p.segmentId || 'N/A',
      'Queue Status': p.isInQueue ? 'In-Queue' : 'Non-Queue',
      'Variation': p.variationName || 'N/A',
      'Current Stage': p.currentStage || 'N/A',
      'Token Status': p.tokenStatus || 'N/A',
      'Stage Status': p.stageStatus || 'N/A',
      'Selected Slots Count': p.selectedSlots.length,
      'Selected Slots': p.slotsInfo,
      'Has Deleted Slot': p.deletedSlotStages.length > 0 ? 'Yes' : 'No',
      'Deleted Slot Stages': p.deletedSlotStages.join(', ') || 'N/A',
      'Is Duplicate': p.isDuplicate ? 'Yes' : 'No',
      'Found In Segments': p.duplicateSegments.join(', ') || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Segment Participants');

    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.min(
        Math.max(
          key.length,
          ...exportData.map(row => String(row[key] || '').length)
        ),
        maxWidth
      )
    }));
    worksheet['!cols'] = colWidths;

    const fileName = `overall_segment_participants_${this.selectedQueue?.['queuename'] || 'queue'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  exportParticipantsToExcel() {
    const participantsToExport = this.getFilteredParticipantsList().filter(p => p.selected);

    if (participantsToExport.length === 0) {
      alert('Please select at least one participant to export');
      return;
    }

    const exportData = participantsToExport.map((p, index) => {
      const profileId = p.profile_id || p.profileid;
      const slotsInfo = p.selectedSlots?.map(slot =>
        `${slot.stageName}: ${slot.segmentName} (${this.formatDateTo12Hour(slot.startdate?.toDate())} - ${this.formatDateTo12Hour(slot.enddate?.toDate())})`
      ).join('; ') || 'No slots';

      return {
        'No': index + 1,
        'Name': this.getProfileName(profileId),
        'Profile ID': profileId,
        'Segment': p.segmentName || 'N/A',
        'Variation': p.variationName || 'N/A',
        'Current Stage': p.currentstage || 'N/A',
        'Status': p.isNonQueueParticipant ? 'Non-Queue' : 'In-Queue',
        'Token Status': p.tokenstatus || 'N/A',
        'Stage Status': p.stagestatus || 'N/A',
        'Selected Slots': slotsInfo,
        'Has Deleted Slot': p.hasDeletedSlot ? 'Yes' : 'No',
        'Deleted Slot Stages': p.deletedSlotStages?.join(', ') || 'N/A',
        'Is Duplicate': p.isDuplicate ? 'Yes' : 'No',
        'Duplicate In Segments': p.duplicateSegments?.join(', ') || 'N/A'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');

    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.min(
        Math.max(
          key.length,
          ...exportData.map(row => String(row[key] || '').length)
        ),
        maxWidth
      )
    }));
    worksheet['!cols'] = colWidths;

    const viewType = this.currentStatusView || this.panelViewType || 'participants';
    const fileName = `${viewType}_${this.selectedQueue?.['queuename'] || 'queue'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  // Fix 2: Export for Queue tab
  exportParticipantsDetailsForStage() {
    if (!this.selectedStage) return;

    if (this.activeSlotPlannerTab === 'queue') {
      this.exportQueueTabData();
    } else {
      this.exportAppointmentTabData();
    }
  }

  exportAppointmentTabData() {
    const allParticipants: any[] = [];

    const queueTokenMap = new Map<string, any>();
    this.queueTokenList.forEach(token => {
      if (token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete)) {
        const profileId = token.profile_id || token.profileid;
        if (profileId) queueTokenMap.set(profileId, token);
      }
    });

    const stage = this.selectedStage;
    const slots = this.getSlotsForStage(stage);

    slots.forEach((slot) => {
      const key = slot.startdate.toDateString();
      if (this.selectedDates.length > 0 && !this.selectedDates.includes(key)) return;

      const slotTiming = `${this.getBookedSlotFormatedString(slot.startdate)} - ${this.getBookedSlotFormatedString(slot.enddate)}`;
      slot.segmentVariations.forEach(segmentVar => {
        segmentVar.variations.forEach(variation => {
          if (variation.stageData && variation.stageData[stage]) {
            variation.stageData[stage].confirmedParticipants.forEach((participant) => {
              const participantId = participant.profile_id || participant.profileid;
              const slotTitle = this.getSlotTitle(slot, stage);
              if (participantId) {
                allParticipants.push({
                  participantId,
                  segmentName: segmentVar.segmentName,
                  variationName: variation.variationName,
                  stageName: stage,
                  slotTitle,
                  slotBooked: slotTiming,
                  slotBookedTiming: queueTokenMap.get(participantId)?.selectedstageslot[stage]?.slotconfirmation
                });
              }
            });
          }
        });
      });
    });

    if (allParticipants.length === 0) { alert('No participants to export'); return; }
    
    const exportData = allParticipants.map((p) => ({
      'Name': this.getProfileName(p.participantId) || 'N/A',
      'Email': this.getParticipantEmail(p.participantId) ?? 'N/A',
      'Phone Number': this.getParticipantPhoneNumber(p.participantId) ?? 'N/A',
      'Segment': p.segmentName || 'N/A',
      'Variation': p.variationName || 'N/A',
      'Current Stage': p.stageName || 'N/A',
      'Title': p.slotTitle || 'N/A',
      'Slot Booked': p.slotBooked || 'N/A',
      'SlotTiming': p.slotBookedTiming || '',
    }));

    this.downloadExcel(exportData, 'Appointment Participants');
  }

  exportQueueTabData() {
    const stage = this.selectedStage;
    const slots = this.getSlotsForStage(stage);
    const exportData: any[] = [];

    slots.forEach((slot) => {
      const key = slot.startdate.toDateString();
      if (this.selectedDates.length > 0 && !this.selectedDates.includes(key)) return;

      const slotTiming = `${this.getBookedSlotFormatedString(slot.startdate)} - ${this.getBookedSlotFormatedString(slot.enddate)}`;

      slot.segmentVariations.forEach(segmentVar => {
        // Apply segment filter
        if (this.overallSegmentFilter?.length > 0 && 
        !this.overallSegmentFilter.includes(segmentVar.segmentId)) return;

        segmentVar.variations.forEach(variation => {
          if (variation.stageData && variation.stageData[stage]) {
            const confirmed = variation.stageData[stage].confirmedParticipants || [];
            const nonConfirmed = variation.stageData[stage].nonConfirmedParticipants || [];
            const slotTitle = this.getSlotTitle(slot, stage);

            confirmed.forEach((p) => {
              const profileId = p.profile_id || p.profileid;
              exportData.push({
                'Title': slotTitle || 'N/A',
                'Slot': slotTiming,
                'Segment': segmentVar.segmentName,
                'Name': this.getProfileName(profileId) || 'N/A',
                'Email': this.getParticipantEmail(profileId) ?? 'N/A',
                'Phone': this.getParticipantPhoneNumber(profileId) ?? 'N/A',
                'Status': 'Confirmed',
              });
            });

            nonConfirmed.forEach((p) => {
              const profileId = p.profile_id || p.profileid;
              exportData.push({
                'Title': slotTitle || 'N/A',
                'Slot': slotTiming,
                'Segment': segmentVar.segmentName,
                'Name': this.getProfileName(profileId) || 'N/A',
                'Email': this.getParticipantEmail(profileId) ?? 'N/A',
                'Phone': this.getParticipantPhoneNumber(profileId) ?? 'N/A',
                'Status': 'Non-Confirmed',
              });
            });
          }
        });
      });
    });

    if (exportData.length === 0) { alert('No data to export'); return; }
    this.downloadExcel(exportData, 'Queue Tab');
  }

  // Helper to avoid duplicate Excel write code
  private downloadExcel(data: any[], sheetName: string) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const maxWidth = 50;
    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.min(Math.max(key.length, ...data.map(row => String(row[key] || '').length)), maxWidth)
    }));
    worksheet['!cols'] = colWidths;

    const fileName = `${sheetName.toLowerCase().replace(/ /g, '_')}_${this.selectedQueue?.['queuename'] || 'queue'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  toggleLiveQueueExportMode() {
    this.liveQueueExportModeOn = !this.liveQueueExportModeOn;
    if (!this.liveQueueExportModeOn) {
      this.liveQueueExportSelection.clear();
      this.liveQueueExportRange = { startDate: null, endDate: null };
    }
  }

  onLiveQueueClick(live: any) {
    if (this.liveQueueExportModeOn) {
      this.liveQueueExportSelection.has(live['docid'])
        ? this.liveQueueExportSelection.delete(live['docid'])
        : this.liveQueueExportSelection.add(live['docid']);
    } else {
      this.selectedQueue = live;
      this.onQueueSelect();
    }
  }

  async exportLiveQueuesByDateRange() {
    if (this.liveQueueExportSelection.size === 0) {
      alert('Select at least one live queue.');
      return;
    }
    if (!this.liveQueueExportRange.startDate || !this.liveQueueExportRange.endDate) {
      alert('Select a date range.');
      return;
    }

    const rangeStart = new Date(this.liveQueueExportRange.startDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(this.liveQueueExportRange.endDate);
    rangeEnd.setHours(23, 59, 59, 999);

    this.liveQueueExportBusy = true;
    const loading = this.dialog.open(LoadingProgressComponent, {
      data: { msg: 'Building export...' },
      disableClose: true
    });

    const exportData: any[] = [];

    try {
      const queues = this.liveQueueList.filter(q => this.liveQueueExportSelection.has(q['docid']));

      const queueDataResults = await Promise.all(
        queues.map(async (q): Promise<{ stages: string[]; slots: MergedSlot[]; tokens: any[] } | null> => {
          const docid = q['docid'];
          if (this.selectedQueue?.['docid'] === docid && this.cachedPlanningData) {
            return {
              stages: this.queueStages,
              slots: this.mergedSlots,
              tokens: this.queueTokenList
            };
          }

         const cached = this.liveQueueExportCache.get(docid);
          if (cached) {
            return {
              stages: cached.stages,
              slots: this.buildSlotsForExport(cached.planningData, cached.stages, cached.tokens),
              tokens: cached.tokens
            };
          }
          const queueRef = doc(this.firestore, 'queue generation', docid);
          const [queueDoc, planningDocs, tokenDocs] = await Promise.all([getDoc(queueRef),
            getDocs(query(collection(this.firestore, 'queue planning'), where('queueid', '==', docid))),
            getDocs(query(collection(this.firestore, 'queue_token'), where('queueref', '==', queueRef)))
          ]);

          if (!queueDoc.exists() || planningDocs.empty) return null;

          const stages: string[] = queueDoc.data()['stages'] || [];
          const tokens = tokenDocs.docs.map((d: any) => d.data());
          const planningData = planningDocs.docs[0].data();

          this.liveQueueExportCache.set(docid, { stages, planningData, tokens });

          return {
            stages,
            slots: this.buildSlotsForExport(planningData, stages, tokens),
            tokens
          };
        })
      );
      queues.forEach((q, idx) => {
      const result = queueDataResults[idx];
      if (!result) return;
      const { stages, slots, tokens } = result;
      const segmentIdToName = new Map<string, string>();
      slots.forEach(slot => {
        slot.segmentVariations.forEach((segVar: any) => {
          if (!segmentIdToName.has(segVar.segmentId)) {
            segmentIdToName.set(segVar.segmentId, segVar.segmentName);
          }
        });
      });
      const pidToSegmentName = new Map<string, string>();
      tokens.forEach(t => {
        const pid = t.profile_id || t.profileid;
        if (!pid) return;
        const otherSlots = Object.values(t.selectedstageslot || {});
        if (otherSlots.length > 0) {
          const segmentId = (otherSlots[0] as any).segmentid;
          const name = segmentIdToName.get(segmentId) || this.getSegmentName(segmentId);
          if (name) pidToSegmentName.set(pid, name);
        }
      });
      stages.forEach(stage => {
        const stageIdx = stages.indexOf(stage);

        const filteredSlots = slots.filter(s => {
          if (!s.stages.includes(stage)) return false;
          const slotTime = s.startdate.getTime();
          return slotTime >= rangeStart.getTime() && slotTime <= rangeEnd.getTime();
        });

        if (filteredSlots.length === 0) return;
        const confirmedIds = new Set<string>();
        filteredSlots.forEach(slot => {
          this.pushSlotRows(exportData, q['queuename'], stage, slot);
          slot.segmentVariations.forEach((segVar: any) => {
            segVar.variations.forEach((variation: any) => {
              (variation.stageData?.[stage]?.confirmedParticipants || []).forEach((p: any) => {
                const pid = p.profile_id || p.profileid;
                if (pid) confirmedIds.add(pid);
              });
            });
          });
        });
        const addedNonConfirmed = new Set<string>();
        (tokens || []).filter(t => {
          if (!this.isActiveToken(t)) return false;
          const currentIdx = stages.indexOf(t.currentstage);
          return currentIdx !== -1 &&
                currentIdx <= stageIdx &&
                t.selectedstageslot?.[stage] == null;
        }).forEach(t => {
          const pid = t.profile_id || t.profileid;
          if (!pid || addedNonConfirmed.has(pid) || confirmedIds.has(pid)) return;
          addedNonConfirmed.add(pid);
          exportData.push({
            'Queue': q['queuename'],
            'Title': 'N/A',
            'Slot': 'Not Booked',
            'Stage': stage,
            'Segment': pidToSegmentName.get(pid) || 'N/A',
            'Name': this.getProfileName(pid) || 'N/A',
            'Email': this.getParticipantEmail(pid) ?? 'N/A',
            'Phone': this.getParticipantPhoneNumber(pid) ?? 'N/A',
            'Status': 'Non-Confirmed',
          });
        });
      });
    });

      loading.close();
      this.liveQueueExportBusy = false;

      if (exportData.length === 0) {
        alert('No slots found for the selected queues and date range.');
        return;
      }

      this.downloadExcel(exportData, 'Live Queues Export');
    } catch (err) {
      console.error('exportLiveQueuesByDateRange', err);
      loading.close();
      this.liveQueueExportBusy = false;
      alert('Export failed. Please try again.');
    }
  }

private pushSlotRows(exportData: any[], queueName: string, stage: string, slot: any) {
  const slotTiming = `${this.getBookedSlotFormatedString(slot.startdate)} - ${this.getBookedSlotFormatedString(slot.enddate)}`;
  const slotTitle = this.getSlotTitle(slot, stage);
  const addedInSlot = new Set<string>();

  slot.segmentVariations.forEach((segVar: any) => {
    segVar.variations.forEach((variation: any) => {
      const stageData = variation.stageData?.[stage];
      if (!stageData) return;

      (stageData.confirmedParticipants || []).forEach((p: any) => {
        const pid = p.profile_id || p.profileid;
        if (!pid || addedInSlot.has(pid)) return;
        addedInSlot.add(pid);
        exportData.push({
          'Queue': queueName,
          'Title': slotTitle || 'N/A',
          'Slot': slotTiming,
          'Stage': stage,
          'Segment': segVar.segmentName,
          'Name': this.getProfileName(pid) || 'N/A',
          'Email': this.getParticipantEmail(pid) ?? 'N/A',
          'Phone': this.getParticipantPhoneNumber(pid) ?? 'N/A',
          'Status': 'Confirmed',
        });
      });
    });
  });
}

  private buildSlotsForExport(planningData: any, stages: string[], tokens: any[]): MergedSlot[] {
    const toDate = (d: any): Date | null => {
      if (!d) return null;
      if (d.toDate) return d.toDate();
      if (d.seconds !== undefined) return new Date(d.seconds * 1000);
      return d instanceof Date ? d : null;
    };

    const slotsMap = new Map<string, any>();
    (planningData?.planning || []).forEach((variationPlanning: any) => {
      const variationId = variationPlanning.variationid;
      (variationPlanning.segments || []).forEach((segmentData: any) => {
        const segmentId = segmentData.segmentid;
        (segmentData.slots || []).forEach((slot: any) => {
          const startdate = toDate(slot.startdate);
          const enddate = toDate(slot.enddate);
          if (!startdate || !enddate) return;

          const key = this.generateSlotKey(startdate, enddate);
          if (!slotsMap.has(key)) {
            slotsMap.set(key, {
              startdate,
              enddate,
              starttime: this.formatTimeTo24Hour(startdate),
              endtime: this.formatTimeTo24Hour(enddate),
              stages: new Set<string>(),
              segVar: new Map()
            });
          }

          const entry = slotsMap.get(key);
          entry.stages.add(slot.stagename);

          const svKey = `${segmentId}_${variationId}`;
          if (!entry.segVar.has(svKey)) {
            entry.segVar.set(svKey, { segmentId, variationId, stageData: {} });
          }
          entry.segVar.get(svKey).stageData[slot.stagename] = { startdate, enddate, title: slot.title || '' };
        });
      });
    });

    return Array.from(slotsMap.values()).map(entry => {
      const segmentVariations: any[] = [];

      entry.segVar.forEach((sv: any) => {
        const stageData: any = {};

        Object.keys(sv.stageData).forEach(stageName => {
          const { startdate, enddate, title } = sv.stageData[stageName];

          const confirmed = tokens.filter(t => {
            if (!this.isActiveToken(t)) return false;
            const slot = t.selectedstageslot?.[stageName];
            if (!slot || slot.segmentid !== sv.segmentId) return false;
            return toDate(slot.startdate)?.getTime() === startdate.getTime() && 
                  toDate(slot.enddate)?.getTime() === enddate.getTime();
          });

          const confirmedIds = new Set(confirmed.map(t => t.profile_id || t.profileid));
          const stageIdx = stages.indexOf(stageName);

          const nonConfirmed = tokens.filter(t => {
            if (!this.isActiveToken(t)) return false;
            const pid = t.profile_id || t.profileid;
            if (confirmedIds.has(pid)) return false;
            const currentIdx = stages.indexOf(t.currentstage);
            return currentIdx !== -1 && currentIdx <= stageIdx && t.selectedstageslot?.[stageName] == null;
          });

          stageData[stageName] = { title, confirmedParticipants: confirmed, nonConfirmedParticipants: nonConfirmed };
        });

        let segment = segmentVariations.find(s => s.segmentId === sv.segmentId);
        if (!segment) {
          segment = { segmentId: sv.segmentId, segmentName: this.getSegmentName(sv.segmentId), variations: [] };
          segmentVariations.push(segment);
        }
        segment.variations.push({ variationId: sv.variationId, stageData });
      });

      return {
        startdate: entry.startdate,
        enddate: entry.enddate,
        starttime: entry.starttime,
        endtime: entry.endtime,
        stages: Array.from(entry.stages),
        segmentVariations
      };
    });
  }

  private isActiveToken(t: any): boolean {
    return t.tokenstatus === 'Active' && t.stagestatus === 'Approved' && [null, undefined, false].includes(t.delete);
  }

  getSlotTitle(slot: any, stage: string): string {
    if (!slot || !stage) return '';
    for (const segVar of slot.segmentVariations || []) {
      for (const variation of segVar.variations || []) {
        const title = variation.stageData?.[stage]?.title;
        if (title) return title;
      }
    }
    return '';
  }

  // exportParticipantsDetailsForStage() {
  //   if (this.selectedStage) {
  //     const group = this.getSlotsGroupForStage();
  //     const sheetData: any[][] = [];

  //     // HEADER
  //     sheetData.push([
  //       'Slots',
  //       'Timing',
  //       'Booked',
  //       'Slots Available',
  //     ]);

  //     const merges: XLSX.Range[] = [];
  //     let rowIndex = 1;

  //     let totalBooked = 0;
  //     let totalAvailable = 0;

  //     group.forEach(section => {
  //       const startRow = rowIndex;

  //       section.slots.forEach((slot: MergedSlot, i) => {
  //         sheetData.push([
  //           i === 0 ? this.getDateAndMonthString(slot?.startdate) : '',
  //           this.getTimeString(slot?.startdate, slot?.enddate),
  //           this.getConfirmedCountForSlot(slot, this.selectedStage),
  //           this.getRemainingSlotsCount(slot, this.selectedStage),
  //         ]);

  //         rowIndex++;
  //       });

  //       // Merge date column
  //       merges.push({
  //         s: { r: startRow, c: 0 },
  //         e: { r: rowIndex - 1, c: 0 }
  //       });
  //       totalBooked += section.totalBooked;
  //       totalAvailable += section.totalOpen;
  //     });

  //     // TOTAL ROW
  //     sheetData.push([
  //       'Total',
  //       '',
  //       totalBooked,
  //       totalAvailable,
  //     ]);

  //     const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  //     // worksheet['!merges'] = merges;

  //     // Column widths
  //     worksheet['!cols'] = [
  //       { wch: 15 },
  //       { wch: 18 },
  //       { wch: 12 },
  //       { wch: 20 },
  //     ];

  //     const workbook = XLSX.utils.book_new();
  //     XLSX.utils.book_append_sheet(workbook, worksheet, 'Slot Planner');

  //     XLSX.writeFile(
  //       workbook,
  //       `slot_planner_${new Date().toISOString().split('T')[0]}.xlsx`
  //     );

  //   }
  // }

  getBookedSlotFormatedString(date : Date){
    if (!date) return '';

    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    const months = Object.keys(this.monthsMap);

    return `${date.getDate()} ${months[date.getMonth()]} ${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }


  // NEW: Format date to 12-hour format with AM/PM
  formatDateTo12Hour(date: Date): string {
    if (!date) return '';

    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;

    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  // NEW: Show non-confirmed participants for stage
  showNonConfirmedForStage() {
    this.activePanelSection = 'all';
    this.loadingPanel = true;
    this.allParticipantsForStage = [];
    this.selectedStageFilter = []; // Reset filter when switching views

    if (this.panelViewType === 'queue-tokens') {
      this.loadNonConfirmedQueueTokensForStage(this.selectedStageForCount);
    } else if (this.panelViewType === 'segment-participants') {
      this.loadNonConfirmedSegmentParticipantsForStage(this.selectedStageForCount);
    }
  }

  // NEW: Load confirmed queue tokens for stage
  loadConfirmedQueueTokensForStage(stage: string) {
    const tokens = this.queueTokenList.filter(token => {
      if (token.currentstage !== stage || token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return false;
      }

      const stageSlots = token.selectedstageslot || {};
      return stageSlots[stage] != null;
    });

    this.allParticipantsForStage = tokens.map(token => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegment(profileId);
      const slotExists = this.checkParticipantSlotExistsInStage(token, stage);

      return {
        ...token,
        selected: true,
        participantSegmentId: participantSegmentId,
        selectedSlots: this.getParticipantSelectedSlots(token),
        hasDeletedSlot: !slotExists,
        deletedSlotStage: !slotExists ? stage : null
      };
    });

    this.loadingPanel = false;
  }

  // NEW: Load non-confirmed queue tokens for stage
  loadNonConfirmedQueueTokensForStage(stage: string) {
    const tokens = this.queueTokenList.filter(token => {
      if (token.currentstage !== stage || token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return false;
      }

      const stageSlots = token.selectedstageslot || {};
      return stageSlots[stage] == null;
    });

    this.allParticipantsForStage = tokens.map(token => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegment(profileId);

      return {
        ...token,
        selected: true,
        participantSegmentId: participantSegmentId,
        selectedSlots: this.getParticipantSelectedSlots(token)
      };
    });

    this.loadingPanel = false;
  }

  // NEW: Load confirmed segment participants for stage
  loadConfirmedSegmentParticipantsForStage(stage: string) {
    const confirmedParticipants = new Map<string, any>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const segmentName = segment['segmentname'];
      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        const queueToken = this.queueTokenList.find(token =>
          (token.profile_id === profileId || token.profileid === profileId)
        );

        if (queueToken) {
          const stageSlots = queueToken.selectedstageslot || {};
          if (stageSlots[stage] != null && !confirmedParticipants.has(profileId)) {
            const slotExists = this.checkParticipantSlotExistsInStage(queueToken, stage);

            confirmedParticipants.set(profileId, {
              ...queueToken,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              selectedSlots: this.getParticipantSelectedSlots(queueToken),
              hasDeletedSlot: !slotExists,
              deletedSlotStage: !slotExists ? stage : null
            });
          }
        }
      });
    });

    this.allParticipantsForStage = Array.from(confirmedParticipants.values());
    this.loadingPanel = false;
  }

  // NEW: Load non-confirmed segment participants for stage
  loadNonConfirmedSegmentParticipantsForStage(stage: string) {
    const nonConfirmedParticipants = new Map<string, any>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const segmentName = segment['segmentname'];
      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        const queueToken = this.queueTokenList.find(token =>
          (token.profile_id === profileId || token.profileid === profileId)
        );

        if (queueToken) {
          const stageSlots = queueToken.selectedstageslot || {};
          if (stageSlots[stage] == null && !nonConfirmedParticipants.has(profileId)) {
            nonConfirmedParticipants.set(profileId, {
              ...queueToken,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              selectedSlots: this.getParticipantSelectedSlots(queueToken)
            });
          }
        } else {
          if (!nonConfirmedParticipants.has(profileId)) {
            nonConfirmedParticipants.set(profileId, {
              profile_id: profileId,
              profileid: profileId,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              isNonQueueParticipant: true,
              selectedSlots: []
            });
          }
        }
      });
    });

    this.allParticipantsForStage = Array.from(nonConfirmedParticipants.values());
    this.loadingPanel = false;
  }

  // NEW: Load overall queue tokens
  loadOverallQueueTokens() {
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    const tokens = this.queueTokenList.filter(token => {
      return token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete);
    });

    this.allParticipantsForStage = tokens.map(token => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegment(profileId);

      return {
        ...token,
        selected: true,
        participantSegmentId: participantSegmentId,
        selectedSlots: this.getParticipantSelectedSlots(token)
      };
    });

    this.loadingPanel = false;
  }

  // NEW: Load overall segment participants
  loadOverallSegmentParticipants() {
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    const allParticipants = new Map<string, any>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const segmentName = segment['segmentname'];
      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        if (!allParticipants.has(profileId)) {
          const queueToken = this.queueTokenList.find(token =>
            (token.profile_id === profileId || token.profileid === profileId)
          );

          if (queueToken) {
            allParticipants.set(profileId, {
              ...queueToken,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              selectedSlots: this.getParticipantSelectedSlots(queueToken)
            });
          } else {
            allParticipants.set(profileId, {
              profile_id: profileId,
              profileid: profileId,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              isNonQueueParticipant: true,
              selectedSlots: []
            });
          }
        }
      });
    });

    this.allParticipantsForStage = Array.from(allParticipants.values());
    this.loadingPanel = false;
  }

  // NEW: Load all queue tokens for a specific stage (for stage filter)
  loadQueueTokensForStage(stage: string) {
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    const tokens = this.queueTokenList.filter(token => {
      return token.currentstage === stage && token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete);
    });

    this.allParticipantsForStage = tokens.map(token => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegment(profileId);
      const slotExists = this.checkParticipantSlotExistsInStage(token, stage);

      return {
        ...token,
        selected: true,
        participantSegmentId: participantSegmentId,
        selectedSlots: this.getParticipantSelectedSlots(token),
        hasDeletedSlot: !slotExists,
        deletedSlotStage: !slotExists ? stage : null
      };
    });

    this.loadingPanel = false;
  }

  // NEW: Load all segment participants for a specific stage (for stage filter)
  loadSegmentParticipantsForStage(stage: string) {
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    const allParticipants = new Map<string, any>();

    // Get all segments
    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const segmentName = segment['segmentname'];
      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        if (!allParticipants.has(profileId)) {
          // Check if participant has queue token
          const queueToken = this.queueTokenList.find(token =>
            (token.profile_id === profileId || token.profileid === profileId)
          );

          if (queueToken) {
            const slotExists = this.checkParticipantSlotExistsInStage(queueToken, stage);

            allParticipants.set(profileId, {
              ...queueToken,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              selectedSlots: this.getParticipantSelectedSlots(queueToken),
              hasDeletedSlot: !slotExists,
              deletedSlotStage: !slotExists ? stage : null
            });
          } else {
            allParticipants.set(profileId, {
              profile_id: profileId,
              profileid: profileId,
              selected: true,
              participantSegmentId: segmentId,
              segmentName: segmentName,
              isNonQueueParticipant: true,
              selectedSlots: []
            });
          }
        }
      });
    });

    this.allParticipantsForStage = Array.from(allParticipants.values());
    this.loadingPanel = false;
  }

  // NEW: Get participant's selected slots
  getParticipantSelectedSlots(participant: any): any[] {
    const slots = [];

    if (participant.selectedstageslot) {
      Object.keys(participant.selectedstageslot).forEach(stageName => {
        const slot = participant.selectedstageslot[stageName];

        if ([null, undefined, ''].includes(slot.segmentid)) {
          console.log(participant.profile_name);
        }

        if (![null, undefined, ''].includes(slot.segmentid)) {
          slots.push({
            stageName: stageName,
            segmentId: slot.segmentid,
            segmentName: this.getSegmentName(slot.segmentid),
            startdate: slot.startdate,
            enddate: slot.enddate
          });
        }
      });
    }

    return slots;
  }

  // NEW: Get filtered participants list
  getFilteredParticipantsList(): any[] {
    if (this.activePanelSection === 'all') {
      return this.allParticipantsForStage;
    }

    // Original lists for slot view
    if (this.activePanelSection === 'confirmed') {
      return this.confirmedParticipants;
    } else if (this.activePanelSection === 'non-confirmed') {
      return this.nonConfirmedParticipants;
    } else if (this.activePanelSection === 'big') {
      return this.bigParticipants;
    }

    return [];
  }

  getSegmentsCountForSlot(slot: MergedSlot, stage: string): number {
    if (!slot || !stage) return 0;

    const uniqueSegments = new Set<string>();

    slot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          uniqueSegments.add(segmentVar.segmentId);
        }
      });
    });

    return uniqueSegments.size;
  }

getConfirmedCountForSlot(slot: MergedSlot, stage: string): number {
  if (!slot || !stage) return 0;
  let count = 0;
  slot.segmentVariations.forEach(segmentVar => {
    // SAFE: only filter when slot planner is open AND filter is selected
    if (this.overallSegmentFilter?.length > 0 && 
        !this.overallSegmentFilter.includes(segmentVar.segmentId)) return;
    
    segmentVar.variations.forEach(variation => {
      if (variation.stageData && variation.stageData[stage]) {
        count += (variation.stageData[stage].confirmedParticipants || []).length;
      }
    });
  });
  return count;
}

  getNonConfirmedCountForSlot(slot: MergedSlot, stage: string): number {
    if (!slot || !stage) return 0;

    let count = 0;

    slot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          const nonConfirmed = variation.stageData[stage].nonConfirmedParticipants || [];
          count += nonConfirmed.length;
        }
      });
    });

    return count;
  }

  getBigParticipantsCountForSlot(slot: MergedSlot, stage: string): number {
    if (!slot || !stage) return 0;

    let count = 0;

    slot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          const bigParticipants = variation.stageData[stage].bigparticipants || [];
          count += bigParticipants.length;
        }
      });
    });

    return count;
  }

  getRemainingSlotsCount(slot: MergedSlot, stage: string): number {
    if (!slot || !stage) return 0;
    let count = 0;
    slot.segmentVariations.forEach(segmentVar => {
      // SAFE: only filter when slot planner is open AND filter is selected
      if (this.overallSegmentFilter?.length > 0 && 
          !this.overallSegmentFilter.includes(segmentVar.segmentId)) return;
      
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          const maxSlot = variation.stageData[stage].maxslot || 0;
          const usedSlot = variation.stageData[stage].usedslot || 0;
          count += maxSlot - usedSlot;
        }
      });
    });
    return count;
  }

  getInvalidSlotsCountForSlot(slot: MergedSlot, stage: string): number {
    if (!slot || !stage) return 0;

    let count = 0;

    slot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          const confirmed = variation.stageData[stage].confirmedParticipants || [];
          confirmed.forEach(participant => {
            if (participant.hasInvalidSlot) {
              count++;
            }
          });
        }
      });
    });

    return count;
  }

  getStageRange(): string {
    if (!this.selectedSlot || !this.selectedStageForPanel) return '';

    const currentStageIndex = this.queueStages.indexOf(this.selectedStageForPanel);
    if (currentStageIndex === -1) return '';

    let minStageIndex = currentStageIndex;
    let lastPreviousStageWithSlot = -1;

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const nonConfirmed = variation.stageData[this.selectedStageForPanel].nonConfirmedParticipants || [];

          if (nonConfirmed.length > 0 && nonConfirmed[0].checkFromStageIndex !== undefined) {
            minStageIndex = nonConfirmed[0].checkFromStageIndex;
            if (nonConfirmed[0].lastPreviousStageWithSlotInPlanning !== undefined) {
              lastPreviousStageWithSlot = nonConfirmed[0].lastPreviousStageWithSlotInPlanning;
            }
          }
        }
      });
    });

    if (minStageIndex === currentStageIndex) {
      return this.selectedStageForPanel;
    }

    const fromStage = this.queueStages[minStageIndex] || '';
    const toStage = this.selectedStageForPanel;

    const stagesInRange = [];
    for (let i = minStageIndex; i <= currentStageIndex; i++) {
      stagesInRange.push(this.queueStages[i]);
    }

    return stagesInRange.join(' → ');
  }

  getStageRangeDetails(): {
    fromStage: string;
    toStage: string;
    stagesList: string[];
    lastStageWithSlot: string | null;
    hasNonConfirmed: boolean;
    explanation: string;
    checkFromIndex: number;
    checkToIndex: number;
  } {
    if (!this.selectedSlot || !this.selectedStageForPanel) {
      return {
        fromStage: '',
        toStage: '',
        stagesList: [],
        lastStageWithSlot: null,
        hasNonConfirmed: false,
        explanation: '',
        checkFromIndex: -1,
        checkToIndex: -1
      };
    }

    const currentStageIndex = this.queueStages.indexOf(this.selectedStageForPanel);
    if (currentStageIndex === -1) {
      return {
        fromStage: '',
        toStage: '',
        stagesList: [],
        lastStageWithSlot: null,
        hasNonConfirmed: false,
        explanation: '',
        checkFromIndex: -1,
        checkToIndex: -1
      };
    }

    let hasNonConfirmed = false;
    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const nonConfirmed = variation.stageData[this.selectedStageForPanel].nonConfirmedParticipants || [];
          if (nonConfirmed.length > 0) {
            hasNonConfirmed = true;
          }
        }
      });
    });

    if (!hasNonConfirmed) {
      return {
        fromStage: '',
        toStage: '',
        stagesList: [],
        lastStageWithSlot: null,
        hasNonConfirmed: false,
        explanation: '',
        checkFromIndex: -1,
        checkToIndex: -1
      };
    }

    const globalStageConfig: StageConfig[] = this.queueStages.map(stageName => ({
      stageName: stageName,
      slotConfigured: false
    }));

    this.mergedSlots.forEach(slot => {
      slot.segmentVariations.forEach(segmentVar => {
        segmentVar.variations.forEach(variation => {
          if (variation.stageData) {
            Object.keys(variation.stageData).forEach(stageName => {
              const stageIdx = globalStageConfig.findIndex(s => s.stageName === stageName);
              if (stageIdx >= 0) {
                globalStageConfig[stageIdx].slotConfigured = true;
              }
            });
          }
        });
      });
    });

    const firstStageWithSlot = this.findFirstStageWithSlot(globalStageConfig);
    const isFirstStageWithSlot = (currentStageIndex === firstStageWithSlot.index);

    let checkFromStageIndex = currentStageIndex;
    let lastPreviousStageWithSlot: { index: number; stageName: string | null } = { index: -1, stageName: null };
    let explanation = '';

    if (!isFirstStageWithSlot) {
      lastPreviousStageWithSlot = this.findLastPreviousStageWithSlot(currentStageIndex, globalStageConfig);
      checkFromStageIndex = lastPreviousStageWithSlot.index >= 0
        ? lastPreviousStageWithSlot.index + 1
        : 0;

      explanation = `Fetches queue_tokens from stage ${checkFromStageIndex} to ${currentStageIndex} (after stage ${lastPreviousStageWithSlot.index} slot)`;
    } else {
      checkFromStageIndex = 0;
      explanation = `Fetches queue_tokens from stage 0 to ${currentStageIndex} AND includes participants without queue_tokens`;
    }

    const stagesList = [];
    for (let i = checkFromStageIndex; i <= currentStageIndex; i++) {
      stagesList.push(this.queueStages[i]);
    }

    return {
      fromStage: this.queueStages[checkFromStageIndex] || '',
      toStage: this.selectedStageForPanel,
      stagesList: stagesList,
      lastStageWithSlot: lastPreviousStageWithSlot.stageName,
      hasNonConfirmed: true,
      explanation: explanation,
      checkFromIndex: checkFromStageIndex,
      checkToIndex: currentStageIndex
    };
  }

  getSegmentVariationsWithCounts(): Array<{
    segmentId: string;
    segmentName: string;
    confirmedCount: number;
    nonConfirmedCount: number;
    bigCount: number;
    variations: Array<{
      variationId: string;
      variationName: string;
      confirmedCount: number;
      nonConfirmedCount: number;
      bigCount: number;
    }>;
  }> {
    if (!this.selectedSlot || !this.selectedStageForPanel) return [];

    const result = [];

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      let segmentConfirmedCount = 0;
      let segmentNonConfirmedCount = 0;
      let segmentBigCount = 0;
      const variations = [];

      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const stageData = variation.stageData[this.selectedStageForPanel];
          const confirmedCount = (stageData.confirmedParticipants || []).length;
          const nonConfirmedCount = (stageData.nonConfirmedParticipants || []).length;
          const bigCount = (stageData.bigparticipants || []).length;

          segmentConfirmedCount += confirmedCount;
          segmentNonConfirmedCount += nonConfirmedCount;
          segmentBigCount += bigCount;

          variations.push({
            variationId: variation.variationId,
            variationName: variation.variationName,
            confirmedCount,
            nonConfirmedCount,
            bigCount
          });
        }
      });

      if (variations.length > 0) {
        result.push({
          segmentId: segmentVar.segmentId,
          segmentName: segmentVar.segmentName,
          confirmedCount: segmentConfirmedCount,
          nonConfirmedCount: segmentNonConfirmedCount,
          bigCount: segmentBigCount,
          variations
        });
      }
    });

    return result;
  }

  toggleSegmentsExpansion() {
    this.segmentsExpanded = !this.segmentsExpanded;
  }

  toggleVariationsExpansion() {
    this.variationsExpanded = !this.variationsExpanded;
  }

  // openSlotPanel(slot: MergedSlot, stage: string) {
  //   this.panelViewType = 'slot';
  //   this.selectedSlot = slot;
  //   this.selectedStageForPanel = stage;
  //   this.showSlotPanel = true;
  //   this.activePanelSection = 'confirmed';

  //   this.confirmedParticipants = [];
  //   this.nonConfirmedParticipants = [];
  //   this.bigParticipants = [];

  //   this.segmentsExpanded = false;
  //   this.variationsExpanded = false;
  // }

  openSlotPanel(slot: MergedSlot, stage: string) {
    this.panelViewType = 'slot';
    this.selectedSlot = slot;
    this.selectedStageForPanel = stage;
    this.showSlotPanel = true;
    this.activePanelSection = 'confirmed';
    this.currentStatusView = 'all'; // -- surya

    this.confirmedParticipants = [];
    this.nonConfirmedParticipants = [];
    this.bigParticipants = [];

    this.segmentsExpanded = false;
    this.variationsExpanded = false;
  }

  // closeSlotPanel() {
  //   this.showSlotPanel = false;
  //   this.selectedSlot = null;
  //   this.selectedStageForPanel = null;
  //   this.activePanelSection = null;
  //   this.panelViewType = null;
  //   this.selectedStageForCount = null;
  //   this.selectedStageFilter = []; // Reset to empty array
  //   this.selectedSegmentFilter = []; // Add this
  //   this.currentStatusView = 'all'; // Add this
  //   this.allParticipantsForStage = [];
  // }

  closeSlotPanel() {
    this.showSlotPanel = false;
    this.selectedSlot = null;
    this.selectedStageForPanel = null;
    this.activePanelSection = null;
    this.panelViewType = null;
    this.selectedStageForCount = null;
    this.selectedStageFilter = []; // Reset to empty array
    this.selectedSegmentFilter = []; // Add this
    this.nonSegmentedParticipants = false; // -- surya
    this.currentStatusView = 'all'; // Add this
    this.allParticipantsForStage = [];
  }

  showConfirmedParticipants(segmentId: string, variationId: string) {
    this.activePanelSection = 'confirmed';
    this.loadingPanel = true;
    this.confirmedParticipants = [];

    const variation = this.selectedSlot.segmentVariations
      .find(sv => sv.segmentId === segmentId)
      ?.variations.find(v => v.variationId === variationId);

    if (variation && variation.stageData[this.selectedStageForPanel]) {
      this.confirmedParticipants = variation.stageData[this.selectedStageForPanel].confirmedParticipants.map(p => ({
        ...p,
        selected: true
      }));
    }

    this.loadingPanel = false;
  }

  showNonConfirmedParticipants(segmentId: string, variationId: string) {
    this.activePanelSection = 'non-confirmed';
    this.loadingPanel = true;
    this.nonConfirmedParticipants = [];

    const variation = this.selectedSlot.segmentVariations
      .find(sv => sv.segmentId === segmentId)
      ?.variations.find(v => v.variationId === variationId);

    if (variation && variation.stageData[this.selectedStageForPanel]) {
      this.nonConfirmedParticipants = variation.stageData[this.selectedStageForPanel].nonConfirmedParticipants.map(p => ({
        ...p,
        selected: true
      }));
    }

    this.loadingPanel = false;
  }

  showBigParticipantsList(segmentId: string, variationId: string) {
    this.activePanelSection = 'big';
    this.loadingPanel = true;
    this.bigParticipants = [];

    const variation = this.selectedSlot.segmentVariations
      .find(sv => sv.segmentId === segmentId)
      ?.variations.find(v => v.variationId === variationId);

    if (variation && variation.stageData[this.selectedStageForPanel]) {
      this.bigParticipants = variation.stageData[this.selectedStageForPanel].bigparticipants.map(p => ({
        ...p,
        selected: true
      }));
    }

    this.loadingPanel = false;
  }

  getParticipantSegment(profileId: string): string | null {
    if (!profileId) return null;

    // Step 1: Find the participant list that contains this profile
    const participantList = this.participantLists.find(list => {
      const participants = list['profilelist'] || [];
      return participants.some((p: string) => p === profileId);
    });

    if (!participantList) return null;

    // Step 2: Get the segment ID from participant list or find via segment mapping
    let segmentId: string | null = null;

    if (participantList['segmentid']) {
      segmentId = participantList['segmentid'];
    } else {
      // Check if participant list is mapped to a segment
      const participantListId = participantList['id'];
      const segment = this.segmentList.find(seg => {
        const mappedLists = seg['participantlistid'] || [];
        return mappedLists.includes(participantListId);
      });
      segmentId = segment ? segment['id'] : null;
    }

    if (!segmentId) return null;

    // Step 3: Check if the segment exists in queue planning document's segmentlist
    if (this.queuePlanningSegmentList.length > 0) {
      const segmentExistsInQueuePlanning = this.queuePlanningSegmentList.includes(segmentId);
      if (!segmentExistsInQueuePlanning) {
        return null; // Segment not in queue planning
      }
    }

    return segmentId;
  }

  getParticipantsForSegment(segmentId: string): string[] {
    const profileIds: string[] = [];

    const participantListsForSegment = this.participantLists.filter(list => {
      if (list['segmentid'] === segmentId) return true;

      const listId = list['id'];
      const segment = this.segmentList.find(seg => seg['id'] === segmentId);
      if (segment) {
        const mappedLists = segment['participantlistid'] || [];
        return mappedLists.includes(listId);
      }

      return false;
    });

    participantListsForSegment.forEach(list => {
      const participants = list['profilelist'] || [];
      participants.forEach(p => {
        const pid = p;
        if (pid && !profileIds.includes(pid)) {
          profileIds.push(pid);
        }
      });
    });

    return profileIds;
  }

  getProfileName(profileId: string): string {
    if (this.mapProfile && this.mapProfile[profileId]) {
      return this.mapProfile[profileId];
    }
    return profileId;
  }
 
  // surya
  getParticipantEmail(profileId: string): string {
    if (this.mapProfileData && this.mapProfileData[profileId]) {
      return this.mapProfileData[profileId]?.email;
    }
    return profileId
  }

  // surya
  getParticipantPhoneNumber(profileId: string): string | null {
    if (this.mapProfileData && this.mapProfileData[profileId]) {
      const data = this.mapProfileData[profileId];
      const number = data?.number;
      const countryCode = data?.countrycode || '';
      return number ? `${countryCode} ${number}` : null;
    }
    return null;
  }

  formatTimeTo24Hour(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  formatTimeTo12Hour(time24: string): string {
    if (!time24) return '';

    const [hours24, minutes] = time24.split(':').map(Number);
    const period = hours24 >= 12 ? 'PM' : 'AM';
    let hours12 = hours24 % 12;
    hours12 = hours12 ? hours12 : 12;

    return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  getSegmentName(segmentId: string): string {
    if (![null, undefined, ''].includes(segmentId) && segmentId.length != 0) {
      const segment = this.segmentList.find(s => s.docid === segmentId);
      return segment?.['segmentname'] || ''
    } else {
      return '';
    }
  }

  getVariationName(variationId: string): string {
    const variation = this.queueVariationList.find(v => v.id === variationId);
    return variation ? variation['variationname'] : '';
  }

  toggleAllParticipants(checked: boolean, type: 'confirmed' | 'non-confirmed' | 'big' | 'all' | 'deleted-slots') {
    if (type === 'confirmed') {
      this.confirmedParticipants.forEach(p => p.selected = checked);
    } else if (type === 'non-confirmed') {
      this.nonConfirmedParticipants.forEach(p => p.selected = checked);
    } else if (type === 'big') {
      this.bigParticipants.forEach(p => p.selected = checked);
    } else if (type === 'all' || type === 'deleted-slots') {
      this.allParticipantsForStage.forEach(p => p.selected = checked);
    }
  }

  areAllParticipantsSelected(type: 'confirmed' | 'non-confirmed' | 'big' | 'all' | 'deleted-slots'): boolean {
    if (type === 'confirmed') {
      return this.confirmedParticipants.length > 0 && this.confirmedParticipants.every(p => p.selected);
    } else if (type === 'non-confirmed') {
      return this.nonConfirmedParticipants.length > 0 && this.nonConfirmedParticipants.every(p => p.selected);
    } else if (type === 'big') {
      return this.bigParticipants.length > 0 && this.bigParticipants.every(p => p.selected);
    } else if (type === 'all' || type === 'deleted-slots') {
      return this.allParticipantsForStage.length > 0 && this.allParticipantsForStage.every(p => p.selected);
    }
    return false;
  }

  areSomeParticipantsSelected(type: 'confirmed' | 'non-confirmed' | 'big' | 'all' | 'deleted-slots'): boolean {
    let selectedCount = 0;
    let totalCount = 0;

    if (type === 'confirmed') {
      selectedCount = this.confirmedParticipants.filter(p => p.selected).length;
      totalCount = this.confirmedParticipants.length;
    } else if (type === 'non-confirmed') {
      selectedCount = this.nonConfirmedParticipants.filter(p => p.selected).length;
      totalCount = this.nonConfirmedParticipants.length;
    } else if (type === 'big') {
      selectedCount = this.bigParticipants.filter(p => p.selected).length;
      totalCount = this.bigParticipants.length;
    } else if (type === 'all' || type === 'deleted-slots') {
      selectedCount = this.allParticipantsForStage.filter(p => p.selected).length;
      totalCount = this.allParticipantsForStage.length;
    }

    return selectedCount > 0 && selectedCount < totalCount;
  }

  getSelectedParticipantsCount(type: 'confirmed' | 'non-confirmed' | 'big' | 'all' | 'deleted-slots'): number {
    if (type === 'confirmed') {
      return this.confirmedParticipants.filter(p => p.selected).length;
    } else if (type === 'non-confirmed') {
      return this.nonConfirmedParticipants.filter(p => p.selected).length;
    } else if (type === 'big') {
      return this.bigParticipants.filter(p => p.selected).length;
    } else if (type === 'all' || type === 'deleted-slots') {
      return this.allParticipantsForStage.filter(p => p.selected).length;
    }
    return 0;
  }

  getActiveParticipantsList() {
    if (this.activePanelSection === 'confirmed') {
      return this.confirmedParticipants;
    } else if (this.activePanelSection === 'non-confirmed') {
      return this.nonConfirmedParticipants;
    } else if (this.activePanelSection === 'big') {
      return this.bigParticipants;
    } else if (this.activePanelSection === 'all') {
      return this.allParticipantsForStage;
    }
    return [];
  }

  // surya
  // getSlotsForStage(stage: string): MergedSlot[] {
  //   return this.mergedSlots.filter(slot => slot.stages.includes(stage));
  // }

  // surya
  getSlotsForStage(stage: string): MergedSlot[] {
    const slotsForStage = this.mergedSlots.filter(slot => slot.stages.includes(stage));
    return this.applySegmentFilter(slotsForStage, stage);
  }

  getUniqueSegments(): string[] {
    if (!this.selectedSlot || !this.selectedStageForPanel) return [];

    const segments = new Set<string>();

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData[this.selectedStageForPanel]) {
          segments.add(segmentVar.segmentName);
        }
      });
    });

    return Array.from(segments);
  }

  getUniqueVariations(): string[] {
    if (!this.selectedSlot || !this.selectedStageForPanel) return [];

    const variations = new Set<string>();

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData[this.selectedStageForPanel]) {
          variations.add(variation.variationName);
        }
      });
    });

    return Array.from(variations);
  }

  getFilteredSegmentVariations(): Array<{
    segmentId: string;
    segmentName: string;
    variations: Array<{
      variationId: string;
      variationName: string;
      stageData: any;
    }>;
  }> {
    if (!this.selectedSlot || !this.selectedStageForPanel) return [];

    const filtered = [];

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      const filteredVariations = segmentVar.variations.filter(variation =>
        variation.stageData && variation.stageData[this.selectedStageForPanel]
      );

      if (filteredVariations.length > 0) {
        filtered.push({
          segmentId: segmentVar.segmentId,
          segmentName: segmentVar.segmentName,
          variations: filteredVariations
        });
      }
    });

    return filtered;
  }

  getAllConfirmedCount(): number {
    if (!this.selectedSlot || !this.selectedStageForPanel) return 0;

    let totalCount = 0;

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const confirmed = variation.stageData[this.selectedStageForPanel].confirmedParticipants || [];
          totalCount += confirmed.length;
        }
      });
    });

    return totalCount;
  }

  getAllNonConfirmedCount(): number {
    if (!this.selectedSlot || !this.selectedStageForPanel) return 0;

    let totalCount = 0;

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const nonConfirmed = variation.stageData[this.selectedStageForPanel].nonConfirmedParticipants || [];
          totalCount += nonConfirmed.length;
        }
      });
    });

    return totalCount;
  }

  getAllBigParticipantsCount(): number {
    if (!this.selectedSlot || !this.selectedStageForPanel) return 0;

    let totalCount = 0;

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const bigparticipants = variation.stageData[this.selectedStageForPanel].bigparticipants || [];
          totalCount += bigparticipants.length;
        }
      });
    });

    return totalCount;
  }

  getAllInvalidSlotsCount(): number {
    if (!this.selectedSlot || !this.selectedStageForPanel) return 0;

    let totalCount = 0;

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const confirmed = variation.stageData[this.selectedStageForPanel].confirmedParticipants || [];
          confirmed.forEach(participant => {
            if (participant.hasInvalidSlot) {
              totalCount++;
            }
          });
        }
      });
    });

    return totalCount;
  }

  showAllConfirmedParticipants() {
    this.activePanelSection = 'confirmed';
    this.loadingPanel = true;
    this.confirmedParticipants = [];

    if (!this.selectedSlot || !this.selectedStageForPanel) {
      this.loadingPanel = false;
      return;
    }

    const participantsMap = new Map<string, any>();

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const confirmed = variation.stageData[this.selectedStageForPanel].confirmedParticipants || [];
          confirmed.forEach(p => {
            const participantId = p.profile_id || p.profileid;
            if (participantId && !participantsMap.has(participantId)) {
              participantsMap.set(participantId, {
                ...p,
                selected: true,
                segmentName: segmentVar.segmentName,
                variationName: variation.variationName
              });
            }
          });
        }
      });
    });

    this.confirmedParticipants = Array.from(participantsMap.values());
    this.loadingPanel = false;
  }

  showAllNonConfirmedParticipants() {
    this.activePanelSection = 'non-confirmed';
    this.loadingPanel = true;
    this.nonConfirmedParticipants = [];

    if (!this.selectedSlot || !this.selectedStageForPanel) {
      this.loadingPanel = false;
      return;
    }

    const participantsMap = new Map<string, any>();

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const nonConfirmed = variation.stageData[this.selectedStageForPanel].nonConfirmedParticipants || [];
          nonConfirmed.forEach(p => {
            const participantId = p.profile_id || p.profileid;
            if (participantId && !participantsMap.has(participantId)) {
              participantsMap.set(participantId, {
                ...p,
                selected: true,
                segmentName: segmentVar.segmentName,
                variationName: variation.variationName
              });
            }
          });
        }
      });
    });

    this.nonConfirmedParticipants = Array.from(participantsMap.values());
    this.loadingPanel = false;
  }

  showAllBigParticipants() {
    this.activePanelSection = 'big';
    this.loadingPanel = true;
    this.bigParticipants = [];

    if (!this.selectedSlot || !this.selectedStageForPanel) {
      this.loadingPanel = false;
      return;
    }

    const participantsMap = new Map<string, any>();

    this.selectedSlot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[this.selectedStageForPanel]) {
          const bigparticipants = variation.stageData[this.selectedStageForPanel].bigparticipants || [];
          bigparticipants.forEach(p => {
            const participantId = p.profileid || p.profile_id;
            if (participantId && !participantsMap.has(participantId)) {
              participantsMap.set(participantId, {
                ...p,
                selected: true,
                segmentName: segmentVar.segmentName,
                variationName: variation.variationName
              });
            }
          });
        }
      });
    });

    this.bigParticipants = Array.from(participantsMap.values());
    this.loadingPanel = false;
  }

  async sendNotification() {
    const selectedParticipants = this.getActiveParticipantsList()
      .filter(p => p.selected)
      .map(p => this.mapProfileData[p.profile_id])
      .filter(p => p != null);

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(AhNotificationComponent, {
      width: "60vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(result, 'send app notificationssss');
      if (result != null && result != undefined) {
        var userID = [];
        var profileID = [];
        console.log(selectedParticipants, "this.selection.selected");
        for (let i = 0; i < selectedParticipants.length; i++) {
          const selected = selectedParticipants[i];
          profileID.push(selected["profile_id"] || selected["profileid"])
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
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true,
          landingpage: result["landingpage"],
          profileid: profileID,
          receivingapp: result["receivingapp"] ?? "breakthroughsapp",
        }).then(() => {
          console.log(notificationimage)
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  }

  async sendWhatsApp() {
    const selectedParticipants = this.getActiveParticipantsList()
      .filter(p => p.selected)
      .map(p => this.mapProfileData[p.profile_id])
      .filter(p => p != null);

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

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        if (result == 'success') {
          this.guard.openSnackBar("Wati Message Sent Successfully", "OK",600);
          if (result['status'] == 'sendtoparticipants') {
            let url: string;

            if (environment.firebase.projectId == 'starlabs-test') {
              url = "https://us-central1-starlabs-test.cloudfunctions.net/sendWhatsAppBroadcast";
            } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
              url = ""
            }

            const docRef = doc(collection(this.firestore, 'wati archive'), result['archiveid']);
            await updateDoc(docRef, {
              templatestatus: "created",
              templatevalidated: true,
            }).then(() => {
              console.log("Wati Archive Document Created");
            }).catch((error) => {
              console.log("Error Creating Wati Archive");
            });

            const response = await this.http.post(url, { archiveid: result['archiveid'] }).toPromise();
            console.log("Response : ", response)

          }
        } else if (result == 'failed') {
          this.guard.openSnackBar("Sending Wati Message Failed", "OK",600);
        }
      }
    });
  }

  async sendEmail() {
    const selectedParticipants = this.getActiveParticipantsList()
      .filter(p => p.selected)
      .map(p => this.mapProfileData[p.profile_id])
      .filter(p => p != null);

      console.log("slecyec", selectedParticipants);
      
    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(EmailInputComponent, {
      data: selectedParticipants,
      minWidth: "600px",
      disableClose: true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        console.log(result);

        const docRef = doc(collection(this.firestore, "email archive"), result['docid']);
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
        }

      }
    })
  }
  sendChannel(): void {
    const selected = this.getActiveParticipantsList()
      .filter(p => p.selected)
      .map(p => ({
        profileid: p.profile_id || p.profileid,
        name:      this.getProfileName(p.profile_id || p.profileid),
        email:     this.getParticipantEmail(p.profile_id || p.profileid),
      }));

    if (selected.length === 0) return;

    this.dialog.open(ChannelCommunicationComponent, {
      data:       selected,
      width:      '860px',
      maxHeight:  '90vh',
      panelClass: 'ow-dialog-panel'
    });
  }

  toggleStageRange() {
    this.isStageRangeExpanded = !this.isStageRangeExpanded;
  }

  getParticipantSegmentForQueuePlanning(profileId: string): string | null {
    if (!profileId) return null;

    // Step 1: Find ALL participant lists containing this profile
    const participantLists = this.participantLists.filter(list => {
      const profiles = list['profilelist'] || [];
      return profiles.includes(profileId);
    });

    if (participantLists.length === 0) return null;

    // Step 2: Collect all participantList docids
    const participantListDocIds = participantLists.map(list => list['docid']);

    // Step 3: Find all segments matching those participant lists
    const matchedSegments = this.segmentList.filter(seg => {
      const mappedLists = seg['participantlistid'] || [];
      return participantListDocIds.some(id => mappedLists.includes(id));
    });

    if (matchedSegments.length === 0) return null;

    // Extract segment ids
    const segmentIds = matchedSegments.map(seg => seg['docid']);

    // Step 4: Return only the first segment that exists in queuePlanningSegmentList
    if (this.queuePlanningSegmentList?.length > 0) {
      const matched = segmentIds.find(id =>
        this.queuePlanningSegmentList.includes(id)
      );

      return matched || null;
    }

    // If queuePlanningSegmentList is empty, return the first segment found
    return segmentIds[0] || null;
  }


  // Add new method to get queue participants (all active queue tokens)
  getQueueParticipantsForOverall(): any[] {
    const duplicateIds = this.getDuplicateParticipantIds();

    return this.queueTokenList.filter(token => {
      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || token.delete == true) {
        return false;
      }
      const profileId = token.profile_id || token.profileid;
      return profileId;
    }).map(token => {
      const profileId = token.profile_id || token.profileid;
      const participantSegmentId = this.getParticipantSegmentForQueuePlanning(profileId);
      const isDuplicate = duplicateIds.has(profileId);
      const duplicateSegments = isDuplicate ? this.getParticipantSegments(profileId) : [];
      const isInSegment = participantSegmentId !== null;

      return {
        ...token,
        selected: true,
        participantSegmentId: participantSegmentId,
        segmentName: isInSegment ? this.getSegmentName(participantSegmentId) : null,
        variationName: this.getParticipantVariation(token),
        selectedSlots: this.getParticipantSelectedSlots(token),
        isDuplicate: isDuplicate,
        duplicateSegments: duplicateSegments,
        isNonSegmentParticipant: !isInSegment,
        tokenNumber: token.tokennumber || token.token_number || 'N/A',
        queuePosition: token.queueposition || token.queue_position || token.position || 'N/A'
      };
    });
  }

  getParticipantSegments(profileId: string): string[] {
    const segments: string[] = [];

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      if (!this.isSegmentInQueuePlanning(segmentId)) return;

      const participants = this.getParticipantsForSegment(segmentId);
      if (participants.includes(profileId)) {
        segments.push(segment['segmentname'] || segmentId);
      }
    });

    return segments;
  }

  // Add new method to get participant's variation
  getParticipantVariation(participant: any): string {
    if (!participant) return '';
    const stageSlots = participant.selectedstageslot || {};
    const stages = Object.keys(stageSlots);

    if (stages.length > 0) {
      const firstSlot = stageSlots[stages[0]];
      if (firstSlot && firstSlot.variationid) {
        return this.getVariationName(firstSlot.variationid);
      }
    }

    return '';
  }
  // Add new method to get non-queue participants (segment participants without queue tokens)
  getNonQueueParticipantsForOverall(): any[] {
    const nonQueueParticipants: any[] = [];
    const addedProfileIds = new Set<string>();
    const duplicateIds = this.getDuplicateParticipantIds();

    const queueTokenProfileIds = new Set<string>();
    this.queueTokenList.forEach(token => {
      if (token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete)) {
        const profileId = token.profile_id || token.profileid;
        if (profileId) {
          queueTokenProfileIds.add(profileId);
        }
      }
    });

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const segmentName = segment['segmentname'];

      if (!this.isSegmentInQueuePlanning(segmentId)) return;

      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        if (!profileId || addedProfileIds.has(profileId)) return;

        if (!queueTokenProfileIds.has(profileId)) {
          addedProfileIds.add(profileId);
          const isDuplicate = duplicateIds.has(profileId);
          const duplicateSegments = isDuplicate ? this.getParticipantSegments(profileId) : [];

          nonQueueParticipants.push({
            profile_id: profileId,
            profileid: profileId,
            selected: true,
            participantSegmentId: segmentId,
            segmentName: segmentName,
            isNonQueueParticipant: true,
            reason: 'No queue token - Not enrolled in queue',
            isDuplicate: isDuplicate,
            duplicateSegments: duplicateSegments
          });
        }
      });
    });

    return nonQueueParticipants;
  }

  // Add method to check if segment is in queue planning
  isSegmentInQueuePlanning(segmentId: string): boolean {
    for (const mergedSlot of this.mergedSlots) {
      const segmentVar = mergedSlot.segmentVariations.find(sv => sv.segmentId === segmentId);
      if (segmentVar) {
        return true;
      }
    }
    return false;
  }

  // Add new method to get deleted slots participants
  getDeletedSlotsParticipantsForOverall(): any[] {
    const deletedSlotsParticipants: any[] = [];
    const addedProfileIds = new Set<string>();
    const duplicateIds = this.getDuplicateParticipantIds();

    this.queueTokenList.forEach(token => {
      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return;
      }

      const profileId = token.profile_id || token.profileid;
      if (!profileId || addedProfileIds.has(profileId)) return;

      const stageSlots = token.selectedstageslot || {};
      const stages = Object.keys(stageSlots);
      const deletedSlotStages: string[] = [];

      stages.forEach(stageName => {
        const slotExists = this.checkParticipantSlotExistsInStage(token, stageName);
        if (!slotExists) {
          deletedSlotStages.push(stageName);
        }
      });

      if (deletedSlotStages.length > 0) {
        addedProfileIds.add(profileId);
        const participantSegmentId = this.getParticipantSegment(profileId);
        const isDuplicate = duplicateIds.has(profileId);
        const duplicateSegments = isDuplicate ? this.getParticipantSegments(profileId) : [];

        deletedSlotsParticipants.push({
          ...token,
          selected: true,
          participantSegmentId: participantSegmentId,
          segmentName: this.getSegmentName(participantSegmentId),
          variationName: this.getParticipantVariation(token),
          selectedSlots: this.getParticipantSelectedSlots(token),
          hasDeletedSlot: true,
          deletedSlotStages: deletedSlotStages,
          isDuplicate: isDuplicate,
          duplicateSegments: duplicateSegments
        });
      }
    });

    return deletedSlotsParticipants;
  }

  // Add new method to show queue participants
  showOverallQueueParticipants() {
    this.activePanelSection = 'all';
    this.currentStatusView = 'queue-participants';
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    setTimeout(() => {
      this.allParticipantsForStage = this.getQueueParticipantsForOverall();
      this.applyFilters();
      this.loadingPanel = false;
    }, 100);
  }

  getAllSegmentParticipantIds(): Set<string> {
    const allParticipantIds = new Set<string>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      // Only include segments that are in queue planning
      if (this.isSegmentInQueuePlanning(segmentId)) {
        const participants = this.getParticipantsForSegment(segmentId);
        participants.forEach(profileId => {
          if (profileId) {
            allParticipantIds.add(profileId);
          }
        });
      }
    });

    return allParticipantIds;
  }

  // Update the getOverallQueueParticipantsCount method (add this new method)
  getOverallQueueParticipantsCount(): number {
    // const segmentParticipantIds = this.getAllSegmentParticipantIds();

    return this.queueTokenList.filter(token => {
      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null, undefined, false].includes(token.delete)) {
        return false;
      }
      const profileId = token.profile_id || token.profileid;
      // return segmentParticipantIds.has(profileId);
      return profileId
    }).length;
  }
  // Update getNonQueueParticipantsCount method (add this new method)
  getOverallNonQueueParticipantsCount(): number {
    const queueTokenProfileIds = new Set<string>();
    this.queueTokenList.forEach(token => {
      if (token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null, undefined, false].includes(token.delete)) {
        const profileId = token.profile_id || token.profileid;
        if (profileId) {
          queueTokenProfileIds.add(profileId);
        }
      }
    });

    let count = 0;
    const countedProfileIds = new Set<string>();

    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];

      // Only count participants from segments in queue planning
      if (!this.isSegmentInQueuePlanning(segmentId)) {
        return;
      }

      const participants = this.getParticipantsForSegment(segmentId);

      participants.forEach(profileId => {
        if (!profileId || countedProfileIds.has(profileId)) return;

        if (!queueTokenProfileIds.has(profileId)) {
          countedProfileIds.add(profileId);
          count++;
        }
      });
    });

    return count;
  }

  // Update showOverallNonConfirmed to show non-queue participants
  showOverallNonQueueParticipants() {
    this.activePanelSection = 'all';
    this.currentStatusView = 'non-queue';
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    setTimeout(() => {
      this.allParticipantsForStage = this.getNonQueueParticipantsForOverall();
      this.applyFilters();
      this.loadingPanel = false;
    }, 100);
  }


  showOverallDeletedSlotsParticipants() {
    this.activePanelSection = 'all';
    this.currentStatusView = 'deleted-slots';
    this.loadingPanel = true;
    this.allParticipantsForStage = [];

    setTimeout(() => {
      this.allParticipantsForStage = this.getDeletedSlotsParticipantsForOverall();
      this.applyFilters();
      this.loadingPanel = false;
    }, 100);
  }

  // Add method to get segments used in queue planning
  getSegmentsInQueuePlanning(): any[] {
    const segmentIds = new Set<string>();

    this.mergedSlots.forEach(slot => {
      slot.segmentVariations.forEach(sv => {
        segmentIds.add(sv.segmentId);
      });
    });

    return this.segmentList.filter(segment => segmentIds.has(segment['id']));
  }

  // Add method to get duplicate count
  getOverallDuplicateCount(): number {
    return this.getDuplicateParticipantIds().size;
  }

  // surya
  nonSegmentParticipant() {
    return this.getQueueParticipantsForOverall().filter((participant) => participant?.isNonSegmentParticipant).length;
  }

  // surya
  applySegmentFilter(slots: MergedSlot[], stage: string): MergedSlot[] {
    if (this.overallSegmentFilter && this.overallSegmentFilter.length > 0) {
      const mergedSlots: MergedSlot[] = [];

      for (const slot of slots) {
        const updatedSlotConfig = {
          ...slot,
          segmentVariations: slot.segmentVariations.filter(({ segmentId }) => this.overallSegmentFilter.includes(segmentId))
        }

        if (updatedSlotConfig.segmentVariations.length > 0) {
          mergedSlots.push(updatedSlotConfig);
        }
      }
      return mergedSlots;
    }
    return slots
  }

  // method to get max slot count -- surya 
  getTotalMaxSlotCountForSlot(slot: MergedSlot, stage: string): number {
    if (!slot || !stage) return 0;

    let count = 0;

    slot.segmentVariations.forEach(segmentVar => {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          count += variation.stageData[stage].maxslot || 0;
        }
      });
    });

    return count;
  }

  // method to get total confirmed participants for stage --- surya
  getTotalConfirmedParticipantsForStage(): number {
    if (this.selectedStage) {
      const stage = this.selectedStage;
      const slots = this.getSlotsForStage(stage);

      return slots.reduce((total, slot) => total + this.getConfirmedCountForSlot(slot, stage), 0);
    }
    return 0
  }

  // method to open slot planner model -- surya
  openSlotPlannerForStage(stage: string) {
    this.selectedStage = stage;
    setTimeout(() => this.checkScrollButtons(), 300);

    this.dialog.open(this.slotPlanner, {
      width: '95vw',
      maxWidth: '95vw',
      height: '90vh',
    }).afterClosed().toPromise().then(() => {
      this.selectedStage = null;
      this.expandAllRow = true;
      this.expandedRows = [];
      this.selectedDates = [];
      this.showFromToday = true;
      this.activeSlotPlannerTab = 'appointment';
      this.expandedQueueRows = [];
      this.slotPlannerFilter = {
        startDate: null,
        endDate: null
      };
    });

    setTimeout(() => {
      this.scrollToActiveDate();
    }, 150);
  }

  scrollToActiveDate() {
  const scrollContainer = this.dayButtonsScroll?.nativeElement;
  if (!scrollContainer) return;

  const activeButton = scrollContainer.querySelector('.ctrl-btn.active');
  if (!activeButton) return;

  const containerWidth = scrollContainer.offsetWidth;
  const buttonLeft = (activeButton as HTMLElement).offsetLeft;
  const buttonWidth = (activeButton as HTMLElement).offsetWidth;

  scrollContainer.scrollLeft = buttonLeft - (containerWidth / 2) + (buttonWidth / 2);
  this.onScroll(); // updates arrow states
}

  // method to filter dates in date range filter --- surya
  allowedDateForFilter = (date: Date | null): boolean => {
    if (!date) return false;

    const dateString = date.toDateString();
    const allowedDates = this.getSlotDatesOfStage();

    return allowedDates.includes(dateString);
  }

  // method to get slot dates of stage --- surya
  getSlotDatesOfStage(): string[] {
    const dates: Set<string> = new Set();
    if (this.selectedStage) {
      const stage = this.selectedStage;
      const slots = this.getSlotsForStage(stage);

      slots.forEach((slot) => {
        if (slot.startdate) {
          const dateString = slot.startdate.toDateString();
          if (!dates.has(dateString)) {
            dates.add(dateString);
          }
        }
      })
    }
    return [...dates.values()];
  }

  // method to get total slots for stage --- surya
  getTotalSlotsForStage(): number {
    if (this.selectedStage) {
      const stage = this.selectedStage;
      const slots = this.getSlotsForStage(stage);

      let count = 0;

      slots.forEach((slot) => {
        slot.segmentVariations.forEach(segmentVar => {
          segmentVar.variations.forEach(variation => {
            if (variation.stageData && variation.stageData[stage]) {
              count += variation.stageData[stage].maxslot || 0;
            }
          });
        });
      })

      return count;
    }
    return 0
  }

  // method to get total slots open for stage -- surya 
  getTotalSlotsOpenForStage(): number {

    if (this.selectedStage) {
      const stage = this.selectedStage;
      const slots = this.getSlotsForStage(stage);

      let count = 0;

      slots.forEach((slot) => {
        slot.segmentVariations.forEach(segmentVar => {
          segmentVar.variations.forEach(variation => {
            if (variation.stageData && variation.stageData[stage]) {
              const maxSlot = variation.stageData[stage].maxslot || 0;
              const usedSlot = variation.stageData[stage].usedslot || 0;
                count += maxSlot - usedSlot;
            }
          });
        });
      })

      return count;
    }
    return 0
  }

  // method to get date and month string fromat --- surya
  getDateAndMonthString(date: string | Date) {
    if (date) {
      let dateString = date;
      if (typeof dateString !== 'string') {
        dateString = dateString.toDateString();
      }
      const dateSplit = dateString.split(' ');
      if (dateSplit.length === 4) {
        return `${dateSplit[2]} ${dateSplit[1]}`
      }
    }
    return ''
  }

  // method to filter slots based on date range filter -- surya
  onSlotPlannerDateFilter() {
    const selectedDates = [];
    if (this.slotPlannerFilter.startDate && this.slotPlannerFilter.endDate) {
      // Use toggle-aware slots as the base
      const baseSlots = this.showFromToday
        ? this.getSlotsFromToday()
        : this.getSlotsForStage(this.selectedStage);

      const groupDates = baseSlots.map(slot => slot.startdate.toDateString());

      let current = new Date(this.slotPlannerFilter.startDate);
      while (current <= new Date(this.slotPlannerFilter.endDate)) {
        const key = current.toDateString();
        if (groupDates.includes(key)) {
          selectedDates.push(key);
        }
        current.setDate(current.getDate() + 1);
      }
    }
    this.selectedDates = selectedDates;
  }

  // method to filter slots based on clicked date --- surya
  onDateClick(date: string) {
    if (this.selectedDates.includes(date)) {
      this.selectedDates = this.selectedDates.filter((d) => d !== date);
    } else {
      this.selectedDates.push(date);
    }
    if (this.slotPlannerFilter.startDate || this.slotPlannerFilter.endDate) {
      this.slotPlannerFilter = {
        startDate : null,
        endDate : null
      }
    }
  }

  // method to get slots as group for stage -- surya
  getSlotsGroupForStage(filter: boolean = true) {
    const group = new Map();
    if (this.selectedStage) {
      const stage = this.selectedStage;

      let baseSlots: any[];
      if (this.selectedDates.length > 0) {
        baseSlots = this.getSlotsForStage(stage);
      } else {
        baseSlots = this.showFromToday
          ? this.getSlotsFromToday()
          : this.getSlotsForStage(stage);
      }

      baseSlots.forEach((slot) => {
        const key = slot.startdate.toDateString();

        if (filter && this.selectedDates.length > 0 && !this.selectedDates.includes(key)) return;

        // Apply segment filter for Queue tab
        const filteredSlot = (this.activeSlotPlannerTab === 'queue' && this.overallSegmentFilter?.length > 0)
          ? {
              ...slot,
              segmentVariations: slot.segmentVariations.filter(sv =>
                this.overallSegmentFilter.includes(sv.segmentId)
              )
            }
          : slot;

        if (!group.has(key)) {
          group.set(key, { date: key, totalBooked: 0, totalOpen: 0, slots: [] });
        }

        const slotGroup = group.get(key);
        const confirmedCount = this.getConfirmedCountForSlot(filteredSlot, stage);
        const slotKey = `${slot.startdate.toDateString()}-${slot.starttime}-${slot.endtime}`;

        slotGroup.totalBooked += confirmedCount;
        slotGroup.totalOpen += this.getRemainingSlotsCount(filteredSlot, stage);
        slotGroup.slots.push({
          ...filteredSlot,
          showExpand: confirmedCount > 0,
          expanded: this.expandedRows.includes(slotKey),
        });

        group.set(key, slotGroup);
      });
    }
    return Array.from(group.values());
  }

    // method to get totoal confirmed participants count --- surya
  getTotalConfirmedParticipantInTable() {
    let count = 0;
    if (this.selectedStage) {
      const stage = this.selectedStage;
      const slots = this.selectedDates.length > 0
        ? this.getSlotsForStage(stage)
        : this.showFromToday
          ? this.getSlotsFromToday()
          : this.getSlotsForStage(stage);

      slots.forEach((slot) => {
        const key = slot.startdate.toDateString();
        if (this.selectedDates.length > 0 && !this.selectedDates.includes(key)) return;
        count += this.getConfirmedCountForSlot(slot, stage);
      });
    }
    return count;
  }

  getTotalSlotsOpenInTable() {
    if (this.selectedStage) {
      const stage = this.selectedStage;
      const slots = this.selectedDates.length > 0
        ? this.getSlotsForStage(stage)
        : this.showFromToday
          ? this.getSlotsFromToday()
          : this.getSlotsForStage(stage);

      let count = 0;
      slots.forEach((slot) => {
        const key = slot.startdate.toDateString();
        if (this.selectedDates.length > 0 && !this.selectedDates.includes(key)) return;
        slot.segmentVariations.forEach(segmentVar => {
          segmentVar.variations.forEach(variation => {
            if (variation.stageData && variation.stageData[stage]) {
              count += (variation.stageData[stage].maxslot || 0) - (variation.stageData[stage].usedslot || 0);
            }
          });
        });
      });
      return count;
    }
    return 0;
  }

  // method to select all days --- surya
  selectAllDays() {
    this.selectedDates = [];
  }

  // method to format and get date --- surya
  getDayLabel(date: string) {
    const dateSplit = date.split(' ');
    return `${this.daysMap[dateSplit[0] ?? ''] ?? ''}, ${dateSplit[2] ?? ''} ${this.monthsMap[dateSplit[1] ?? ''] ?? ''}`
  }

  // method to get time format string ---- surya 
  getTimeString(start: Date, end: Date) {
    let startTime = '';
    let endTime = '';
    const startHour = start.getHours();
    const endHour = end.getHours();


    if (![null, undefined].includes(startHour)) {
      if (startHour > 12) {
        startTime = `${startHour - 12} PM`
      } else {
        startTime = `${startHour} AM`
      }
    }

    if (![null, undefined].includes(endHour)) {
      if (endHour > 12) {
        endTime = `${endHour - 12} PM`
      } else {
        endTime = `${endHour} AM`
      }
    }
    return `${startTime} - ${endTime}`
  }

  // method to get slot filled percentage for slot --surya
  getSlotFilledPercentage(slot: MergedSlot) {
    if (this.selectedStage) {
      const maxSlotCount = this.getTotalMaxSlotCountForSlot(slot, this.selectedStage);
      if (maxSlotCount > 0) {
        return Math.floor((this.getConfirmedCountForSlot(slot, this.selectedStage) * 100) / maxSlotCount);
      }
    }
    return 0;
  }

  // method to get confirmed participants list -- surya
  getConfirmedParticipants(slot: MergedSlot, stage: string) {
    const group = new Map();

    if (slot && stage) {
      slot.segmentVariations.forEach(segmentVar => {
        segmentVar.variations.forEach(variation => {
          if (variation.stageData && variation.stageData[stage]) {
            const segmentId = segmentVar.segmentId;
            if (!group.has(segmentId)) {
              group.set(segmentId, {
                segmentId,
                segmentName: segmentVar.segmentName,
                participants: []
              })
            }
            const segment = group.get(segmentId);
            segment.participants = [...segment.participants, ...variation.stageData[stage].confirmedParticipants || []];
            group.set(segmentId, segment);
          }
        });
      });
    }

    const result = [...group.values()];
    if (this.overallSegmentFilter && this.overallSegmentFilter.length > 0) {
      return result.filter(segment =>
        this.overallSegmentFilter.includes(segment.segmentId)
      );
    }
    return result; 
  }

  // method to toggle row -- surya 
  toggleRow(slot: any) {
    if (!slot?.showExpand) {
      return
    }
    const key = `${slot.startdate.toDateString()}-${slot.starttime}-${slot.endtime}`;
    if (this.expandedRows.includes(key)) {
      this.expandedRows = this.expandedRows.filter((k) => k !== key);
    } else {
      this.expandedRows.push(key);
    }
  }

  // method to expand all row -- surya
  expandedAllRows() {
    if (this.activeSlotPlannerTab === 'queue') {
      const expandedQueueRows = [];
      const slotGroups = this.getSlotsGroupForStage();
      slotGroups.forEach((group) => {
        group.slots.forEach((slot: MergedSlot) => {
          const key = `${slot.startdate.getTime()}_${slot.enddate.getTime()}`;
          if (!expandedQueueRows.includes(key)) {
            expandedQueueRows.push(key);
          }
        });
      });
      this.expandedQueueRows = expandedQueueRows;
    } else {
      const expandedRows = this.expandedRows;
      const slotGroups = this.getSlotsGroupForStage();
      slotGroups.forEach((group) => {
        group.slots.forEach((slot: MergedSlot) => {
          const key = `${slot.startdate.toDateString()}-${slot.starttime}-${slot.endtime}`;
          if (!expandedRows.includes(key)) {
            expandedRows.push(key);
          }
        });
      });
      this.expandedRows = expandedRows;
    }
    this.expandAllRow = false;
  }
 
  // method to expand all row -- surya
  collapseAllRows() {
    this.expandAllRow = true;
    this.expandedRows = [];
    this.expandedQueueRows = [];
  }

  // method to get capcity fill class based on percentage of fill -- surya 
  getBarClass(slot: MergedSlot): string {
    const percentage = this.getSlotFilledPercentage(slot);
    return percentage >= 75 ? 'bar-red' : percentage >= 50 ? 'bar-yellow' : 'bar-green';
  }

  getPctClass(slot: MergedSlot): string {
    const percentage = this.getSlotFilledPercentage(slot);
    return percentage >= 75 ? 'pct-red' : percentage >= 50 ? 'pct-yellow' : 'pct-green';
  }

  // helper method to scroll -- surya
  onScroll() {
    this.checkScrollButtons();
  }

  // method to check the scroll button -- surya
  checkScrollButtons() {
    if (!this.dayButtonsScroll) return;

    const element = this.dayButtonsScroll.nativeElement;
    this.canScrollLeft = element.scrollLeft > 5;
    this.canScrollRight = element.scrollLeft < (element.scrollWidth - element.clientWidth - 5);
  }

  // method to scroll days in slot planner --- surya 
  scrollDays(direction: 'left' | 'right') {
    if (!this.dayButtonsScroll) return;

    const element = this.dayButtonsScroll.nativeElement;
    const scrollAmount = 250;

    if (direction === 'left') {
      element.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
      element.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }

    setTimeout(() => this.checkScrollButtons(), 300);
  }

  getMaxSlotsCount(slot: any, stage: string): number {
    let total = 0;
    slot.segmentVariations?.forEach((segVar: any) => {
      // SAFE: only filter when slot planner is open AND filter is selected
      if (this.overallSegmentFilter?.length > 0 && 
          !this.overallSegmentFilter.includes(segVar.segmentId)) return;
      
      segVar.variations?.forEach((variation: any) => {
        if (variation.stageData && variation.stageData[stage]) {
          total += variation.stageData[stage].maxslot || 0;
        }
      });
    });
    return total;
  }
  getTotalMaxSlotsInTable(): number {
    let total = 0;
    this.getSlotsGroupForStage().forEach(dayGroup => {
      dayGroup.slots.forEach((slot: any) => {
        total += this.getMaxSlotsCount(slot, this.selectedStage);
      });
    });
    return total;
  }
  
  // Returns slots from today onwards for the selected stage
  getSlotsFromToday(): any[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.getAllSlotsForStage().filter(slot => {
      const slotDate = new Date(slot.startdate);
      slotDate.setHours(0, 0, 0, 0);
      return slotDate >= today;
    });
  }

  // gets ALL slots for stage without any date filter
  getAllSlotsForStage(): any[] {
    if (!this.selectedStage || !this.mergedSlots) return [];
    return this.mergedSlots.filter(slot => 
      slot.stages && slot.stages.includes(this.selectedStage)
    );
  }

  // Total slots count based on toggle
  getTotalSlotsForScoreboard(): number {
    if (this.showFromToday) {
      return this.getSlotsFromToday().reduce((sum, slot) => {
        return sum + this.getMaxSlotsCount(slot, this.selectedStage);
      }, 0);
    }
    return this.getTotalSlotsForStage();
  }

  // Booked count based on toggle
  getTotalBookedForScoreboard(): number {
    if (this.showFromToday) {
      return this.getSlotsFromToday().reduce((sum, slot) => {
        return sum + this.getConfirmedCountForSlot(slot, this.selectedStage);
      }, 0);
    }
    return this.getTotalConfirmedParticipantsForStage();
  }

  // Open count based on toggle
  getTotalOpenForScoreboard(): number {
    if (this.showFromToday) {
      return this.getSlotsFromToday().reduce((sum, slot) => {
        return sum + this.getRemainingSlotsCount(slot, this.selectedStage);
      }, 0);
    }
    return this.getTotalSlotsOpenForStage();
  }

  toggleQueueRow(slot: MergedSlot) {
    const key = `${slot.startdate.getTime()}_${slot.enddate.getTime()}`;
    if (this.expandedQueueRows.includes(key)) {
      this.expandedQueueRows = this.expandedQueueRows.filter(k => k !== key);
    } else {
      this.expandedQueueRows.push(key);
      this.selectedSegmentIds = new Set();
    }
  }

  isQueueRowExpanded(slot: MergedSlot): boolean {
    const key = `${slot.startdate.getTime()}_${slot.enddate.getTime()}`;
    return this.expandedQueueRows.includes(key);
  }

  getConfirmedCountForSegmentSlot(slot: MergedSlot, stage: string, segmentId: string): number {
    let count = 0;
    const segmentVar = slot.segmentVariations.find(sv => sv.segmentId === segmentId);
    if (segmentVar) {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          count += (variation.stageData[stage].confirmedParticipants || []).length;
        }
      });
    }
    return count;
  }

  getNonConfirmedCountForSegmentSlot(slot: MergedSlot, stage: string, segmentId: string): number {
    let count = 0;
    const segmentVar = slot.segmentVariations.find(sv => sv.segmentId === segmentId);
    if (segmentVar) {
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          count += (variation.stageData[stage].nonConfirmedParticipants || []).length;
        }
      });
    }
    return count;
  }

  getTotalQueueNonConfirmedInTable(): number {
    if (!this.selectedStage) return 0;
    const stage = this.selectedStage;
    const slots = this.selectedDates.length > 0 ? this.getSlotsForStage(stage) : this.showFromToday ? this.getSlotsFromToday() : this.getSlotsForStage(stage);
    let count = 0;
    slots.forEach(slot => {
      const key = slot.startdate.toDateString();
      if (this.selectedDates.length > 0 && !this.selectedDates.includes(key)) return;
      count += this.getNonConfirmedCountForSlot(slot, stage);
    });
    return count;
  }

  openTotalPanelForStage(type: 'confirmed' | 'non-confirmed' | 'all') {
    const slots = this.getSlotsGroupForStage().flatMap(group => group.slots);
    const virtualSlot = {
      startdate: new Date(),
      enddate: new Date(),
      segmentVariations: [] as any[]
    };
    const addedPerSegment = new Map<string, any>();

    slots.forEach(slot => {
      slot.segmentVariations.forEach(segVar => {
        if (!addedPerSegment.has(segVar.segmentId)) {
          addedPerSegment.set(segVar.segmentId, {
            ...segVar,
            variations: segVar.variations.map(v => ({
              ...v,
              stageData: {
                [this.selectedStage]: {
                  confirmedParticipants: [],
                  nonConfirmedParticipants: []
                }
              }
            }))
          });
        }
        segVar.variations.forEach((variation, vi) => {
          const target = addedPerSegment.get(segVar.segmentId).variations[vi]?.stageData[this.selectedStage];
          if (!target || !variation.stageData?.[this.selectedStage]) return;
          (variation.stageData[this.selectedStage].confirmedParticipants || []).forEach(p => {
            if (!target.confirmedParticipants.some(x => (x.profile_id || x.profileid) === (p.profile_id || p.profileid)))
              target.confirmedParticipants.push(p);
          });
          (variation.stageData[this.selectedStage].nonConfirmedParticipants || []).forEach(p => {
            if (!target.nonConfirmedParticipants.some(x => (x.profile_id || x.profileid) === (p.profile_id || p.profileid)))
              target.nonConfirmedParticipants.push(p);
          });
        });
      });
    });

    virtualSlot.segmentVariations = Array.from(addedPerSegment.values());
    this.openQueueTabPanelForSlot(virtualSlot as any, this.selectedStage, type);
    this.queueTabPanelSlotTime = 'All Slots';
    this.queueTabPanelSegmentName = 'All Segments';
  }

  openQueueTabPanel(slot: MergedSlot, stage: string, segmentId: string, type: 'confirmed' | 'non-confirmed' | 'all') {
    const segmentVar = slot.segmentVariations.find(sv => sv.segmentId === segmentId);
    if (!segmentVar) return;
    const participants: any[] = [];
    const addedIds = new Set<string>();

    segmentVar.variations.forEach(variation => {
      if (variation.stageData && variation.stageData[stage]) {
      const list = type === 'all' ? [...(variation.stageData[stage].confirmedParticipants || []), ...(variation.stageData[stage].nonConfirmedParticipants || [])] : type === 'confirmed' ? variation.stageData[stage].confirmedParticipants: variation.stageData[stage].nonConfirmedParticipants;
          (list || []).forEach(p => {
          const profileId = p.profile_id || p.profileid;
          if (profileId && !addedIds.has(profileId)) {
            addedIds.add(profileId);
            participants.push({ ...p, selected: true });
          }
        });
      }
    });

    this.allParticipantsForStage = participants;
    this.activePanelSection = 'all';
    this.showQueueTabPanel = true;
    this.currentPanelSlot = slot;
    this.queueTabPanelType = type;
    this.queueTabPanelTitle = type === 'confirmed' ? 'Confirmed' : type === 'non-confirmed' ? 'Non-Confirmed' : 'All';
    this.queueTabPanelSegmentName = segmentVar.segmentName;
    const slotTitle = slot.segmentVariations[0]?.variations[0]?.stageData[stage]?.title;
    this.queueTabPanelSlotTime = (slotTitle ? slotTitle + ' · ' : '') + this.getDateAndMonthString(slot.startdate) + ' ' + this.getTimeString(slot.startdate, slot.enddate);
    this.selectedSegmentIds = new Set([segmentId]);
  }
  openQueueTabPanelForSlot(slot: MergedSlot, stage: string, type: 'confirmed' | 'non-confirmed' | 'all') {
    this.currentPanelSlot = slot;
    this.queueTabPanelType = type;
    const slotTitle = slot.segmentVariations[0]?.variations[0]?.stageData[stage]?.title;
    this.queueTabPanelSlotTime = (slotTitle ? slotTitle + ' · ' : '') + this.getDateAndMonthString(slot.startdate) + ' ' + this.getTimeString(slot.startdate, slot.enddate);
    this.selectedSegmentIds = new Set((slot.segmentVariations || []).map(sv => sv.segmentId));
    this.refreshQueuePanelParticipants(slot, stage, type);
    this.showQueueTabPanel = true;
    this.queueTabPanelTitle = type === 'confirmed' ? 'Confirmed' : type === 'non-confirmed' ? 'Non-Confirmed' : 'All';
    this.queueTabPanelSegmentName = 'All Segments';
  }

  toggleSegmentSelection(segmentId: string, checked: boolean, slot: any, stage: string) {
    if (checked) {
      this.selectedSegmentIds.add(segmentId);
    } else {
      this.selectedSegmentIds.delete(segmentId);
    }

    // Set panel context if not already open
    this.currentPanelSlot = slot;
    const slotTitle = slot.segmentVariations[0]?.variations[0]?.stageData[stage]?.title;
    this.queueTabPanelSlotTime = (slotTitle ? slotTitle + ' · ' : '') + this.getDateAndMonthString(slot.startdate) + ' ' + this.getTimeString(slot.startdate, slot.enddate);
    if (!this.showQueueTabPanel) {
      this.queueTabPanelType = 'confirmed';
      this.queueTabPanelTitle = 'Confirmed';
    }

    const selectedNames = (slot.segmentVariations || [])
      .filter(sv => this.selectedSegmentIds.has(sv.segmentId))
      .map(sv => sv.segmentName);
    this.queueTabPanelSegmentName = selectedNames.length === (slot.segmentVariations || []).length
      ? 'All Segments'
      : selectedNames.join(', ') || 'None';

    this.refreshQueuePanelParticipants(slot, stage, this.queueTabPanelType);

    if (this.selectedSegmentIds.size > 0) {
      this.showQueueTabPanel = true;
    } else {
      this.showQueueTabPanel = false;
    }
  }

  isSegmentSelected(segmentId: string): boolean {
    return this.selectedSegmentIds.has(segmentId);
  }

  refreshQueuePanelParticipants(slot: any, stage: string, type: 'confirmed' | 'non-confirmed' | 'all') {
    const participants: any[] = [];
    const addedIds = new Set<string>();

    (slot.segmentVariations || []).forEach(segmentVar => {
      if (!this.selectedSegmentIds.has(segmentVar.segmentId)) return;
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          const list = type === 'all'
            ? [
                ...(variation.stageData[stage].confirmedParticipants || []),
                ...(variation.stageData[stage].nonConfirmedParticipants || [])
              ]
            : type === 'confirmed'
            ? variation.stageData[stage].confirmedParticipants
            : variation.stageData[stage].nonConfirmedParticipants;
          (list || []).forEach(p => {
            const profileId = p.profile_id || p.profileid;
            if (profileId && !addedIds.has(profileId)) {
              addedIds.add(profileId);
              participants.push({ ...p, selected: true, segmentName: segmentVar.segmentName });
            }
          });
        }
      });
    });

    this.allParticipantsForStage = participants;
    this.activePanelSection = 'all';
  }

  isActivePanelSlot(slot: any): boolean {
    if (!this.showQueueTabPanel || !this.currentPanelSlot) return false;
    return this.getSlotKey(slot) === this.getSlotKey(this.currentPanelSlot);
  }

  getSlotKey(slot: any): string {
    return `${slot.startdate.getTime()}_${slot.enddate.getTime()}`;
  }

  switchPanelType(type: 'confirmed' | 'non-confirmed' | 'all') {
    if (!this.currentPanelSlot) return;
    this.queueTabPanelType = type;
    this.queueTabPanelTitle = type === 'confirmed' ? 'Confirmed' : type === 'non-confirmed' ? 'Non-Confirmed' : 'All';

    this.refreshQueuePanelParticipants(this.currentPanelSlot, this.selectedStage, type);
  }

  areAllQueuePanelSelected(): boolean {
    return this.allParticipantsForStage.length > 0 &&
      this.allParticipantsForStage.every(p => p.selected);
  }

  areSomeQueuePanelSelected(): boolean {
    const selected = this.allParticipantsForStage.filter(p => p.selected).length;
    return selected > 0 && selected < this.allParticipantsForStage.length;
  }

  toggleAllQueuePanel(checked: boolean) {
    this.allParticipantsForStage.forEach(p => p.selected = checked);
  }

  resetInterimReportFilter() {
    this.interimDataLoaded = false;
    this.activeInterimCard = null;
    this.completedInterimProfileIds = new Set();
    this.notCompletedInterimProfileIds = new Set();
    this.allInterimProfileIds = new Set();
    this.interimCompletedCount = 0;
    this.interimNotCompletedCount = 0;
    this.interimReportStartDate = null;
    this.interimReportEndDate = null;
    this.showInterimDatePicker = false;
    this.recalculateMergedSlotParticipants();
  }

  toggleInterimCard(card: 'completed' | 'not-completed') {
    if (this.activeInterimCard === card) {
      this.activeInterimCard = null;
    } else {
      this.activeInterimCard = card;
    }
    this.recalculateMergedSlotParticipants();
  }


  applyInterimReportFilter() {
    this.interimReportLoading = true;

    const startDate = new Date(this.interimReportStartDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(this.interimReportEndDate);
    endDate.setHours(23, 59, 59, 999);

    getDocs(query(
      collection(this.firestore, 'interimreport log'),
      where('createdon', '>=', Timestamp.fromDate(startDate)),
      where('createdon', '<=', Timestamp.fromDate(endDate))
    )).then(snap => {
      this.completedInterimProfileIds = new Set();
      this.notCompletedInterimProfileIds = new Set();
      this.allInterimProfileIds = new Set();
      let completedDocCount = 0;
      let notCompletedDocCount = 0;

      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const profileId = data['profileid'];
        if (!profileId) return;
        this.allInterimProfileIds.add(profileId);
        if (data['status'] === 'completed') {
          this.completedInterimProfileIds.add(profileId);
          completedDocCount++;
        } else {
          this.notCompletedInterimProfileIds.add(profileId);
          notCompletedDocCount++;
        }
      });

      this.interimCompletedCount = completedDocCount;
      this.interimNotCompletedCount = notCompletedDocCount;
      this.interimDataLoaded = true;
      this.activeInterimCard = null;
      this.showInterimDatePicker = false;
      this.interimReportLoading = false;

    }).catch(err => {
      console.error('Error loading interim reports:', err);
      this.interimReportLoading = false;
    });
  }

  cancelInterimReportFilter() {
    this.showInterimDatePicker = false;
    this.interimReportStartDate = null;
    this.interimReportEndDate = null;
  }

  getAvailableSlotsForParticipant(segmentId: string, variationId: string, stageName: string): any[] {
    const now = new Date();
    const availableSlots: any[] = [];

    for (const mergedSlot of this.mergedSlots) {
      if (!mergedSlot.stages.includes(stageName)) continue;
      if (mergedSlot.enddate < now) continue;

      for (const segVar of mergedSlot.segmentVariations) {
        if (segVar.segmentId !== segmentId) continue;

        for (const variation of segVar.variations) {
          if (variation.variationId !== variationId) continue;

          const stageData = variation.stageData[stageName];
          if (!stageData) continue;

          const maxSlot = stageData.maxslot || 0;
          const usedSlot = stageData.usedslot || 0;

          if (maxSlot !== 0 && usedSlot >= maxSlot) continue;

          availableSlots.push({
            startdate: mergedSlot.startdate,
            enddate: mergedSlot.enddate,
            stagename: stageName,
            segmentid: segmentId,
            variationid: variationId,
            maxslot: maxSlot,
            usedslot: usedSlot,
            queueplanid: this.cachedPlanningData.docid
          });
        }
      }
    }

    return availableSlots;
  }

  // Open book slot dialog
  openBookSlotDialog(participant: any, stageName: string) {

    const segmentId = participant.segmentId || participant.participantSegmentId;
    const variationId = participant.variationId;

    if (!segmentId || !variationId) {
      alert('Cannot determine segment or variation for this participant.');
      return;
    }

    const availableSlots = this.getAvailableSlotsForParticipant(segmentId, variationId, stageName);

    if (availableSlots.length === 0) {
      alert('No available slots for this stage.');
      return;
    }

    this.bookSlotParticipant = participant;
    this.bookSlotStageName = stageName;
    this.bookSlotAvailableSlots = availableSlots;
    this.bookSlotSelectedIndex = null;
    this.showBookSlotDialog = true;
  }

  // Close book slot dialog
  closeBookSlotDialog() {
    this.showBookSlotDialog = false;
    this.bookSlotParticipant = null;
    this.bookSlotStageName = '';
    this.bookSlotAvailableSlots = [];
    this.bookSlotSelectedIndex = null;
    this.bookSlotLoading = false;
  }

  // Format slot time for display
  formatSlotForDisplay(slot: any): string {
    const toDate = (d: any): Date => {
      if (d?.toDate) return d.toDate();
      return new Date(d);
    };

    const start = toDate(slot.startdate);
    const end = toDate(slot.enddate);

    const dayFormat = (d: Date) => `${d.getDate()} ${Object.keys(this.monthsMap)[d.getMonth()]}`;
    const timeFormat = (d: Date) => {
      const h = d.getHours();
      const m = d.getMinutes().toString().padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${m} ${ampm}`;
    };

    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) {
      return `${dayFormat(start)} ${timeFormat(start)} - ${timeFormat(end)}`;
    }
    return `${dayFormat(start)} ${timeFormat(start)} - ${dayFormat(end)} ${timeFormat(end)}`;
  }

  // Update slot count in queue planning 
  async updateSlotCount(
    queuePlanId: string,
    segmentId: string,
    stageName: string,
    variationId: string,
    increment: boolean,
    selectedSlot: any
  ): Promise<boolean> {

    const planningRef = doc(this.firestore, 'queue planning', queuePlanId);
    let updated = false;

    const toMillis = (d: any): number => {
      if (!d) return 0;
      if (d.seconds !== undefined) return d.seconds * 1000;
      if (d.toDate && typeof d.toDate === 'function') return d.toDate().getTime();
      if (d instanceof Date) return d.getTime();
      return new Date(d).getTime();
    };

    const selectedStart = toMillis(selectedSlot.startdate);
    const selectedEnd = toMillis(selectedSlot.enddate);

    try {
      await runTransaction(this.firestore, async (transaction) => {
        const queueDoc = await transaction.get(planningRef);
        if (!queueDoc.exists()) throw new Error('No Planning');

        const data = queueDoc.data();
        const planningList = data['planning'] as any[];
        let found = false;

        for (let i = 0; i < planningList.length; i++) {
          if (planningList[i]['variationid'] !== variationId) continue;

          const segments = planningList[i]['segments'] as any[];
          for (let j = 0; j < segments.length; j++) {
            if (segments[j]['segmentid'] !== segmentId) continue;

            const slots = segments[j]['slots'] as any[];
            for (let k = 0; k < slots.length; k++) {
              const slot = slots[k];

              const slotStart = toMillis(slot.startdate);
              const slotEnd = toMillis(slot.enddate);

              if (
                slot['stagename'] !== stageName ||
                slotStart !== selectedStart ||
                slotEnd !== selectedEnd
              ) continue;

              // Found the slot — update usedslot
              const currentUsed = slot['usedslot'] || 0;
              const maxSlot = slot['maxslot'] || 0;

              if (increment) {
                if (maxSlot === 0 || currentUsed < maxSlot) {
                  slot['usedslot'] = currentUsed + 1;
                  updated = true;
                  found = true;
                } else {
                  throw new Error('Slot Full');
                }
              } else {
                slot['usedslot'] = currentUsed > 0 ? currentUsed - 1 : 0;
                updated = true;
                found = true;
              }
              break;
            }
            if (found) break;
          }
          if (found) break;
        }

        if (updated) {
          transaction.update(planningRef, { 'planning': planningList });
        } else {
          throw new Error('Slot not found');
        }
      });
    } catch (err) {
      console.error('Transaction error:', err);
      updated = false;
    }

    return updated;
  }

  async confirmBookSlot() {
    if (this.bookSlotSelectedIndex === null) {
      alert('Please select a slot.');
      return;
    }

    this.bookSlotLoading = true;
    const participant = this.bookSlotParticipant;
    const stageName = this.bookSlotStageName;
    const selectedSlot = this.bookSlotAvailableSlots[this.bookSlotSelectedIndex];
    const profileId = participant.profile_id || participant.profileid;
    const segmentId = selectedSlot.segmentid;
    const variationId = selectedSlot.variationid;
    const queuePlanId = selectedSlot.queueplanid;

    try {
      // In-queue participant 
      if (!participant.isNonQueueParticipant) {
        const updated = await this.updateSlotCount(
          queuePlanId, segmentId, stageName, variationId, true, selectedSlot
        );

        if (!updated) {
          alert('Failed to book slot. Slot may be full. Please try again.');
          this.bookSlotLoading = false;
          return;
        }

        const tokenId = participant.tokenid || participant.id;
        const tokenRef = doc(this.firestore, 'queue_token', tokenId);
        const slotData = {
          ...selectedSlot,
          stagename: stageName,
          segmentid: segmentId,
          variationid: variationId,
          slotconfirmation: new Date().toISOString()
        };

        // Update selectedstageslot in queue_token
        await updateDoc(tokenRef, {
          [`selectedstageslot.${stageName}`]: slotData
        });

        const tokenIndex = this.queueTokenList.findIndex(t => t.tokenid === tokenId || t.id === tokenId);
        if (tokenIndex !== -1) {
          const updatedToken = { ...this.queueTokenList[tokenIndex] };
          const updatedStageSlot = { ...(updatedToken.selectedstageslot || {}) };
          updatedStageSlot[stageName] = slotData;
          updatedToken.selectedstageslot = updatedStageSlot;
          this.queueTokenList[tokenIndex] = updatedToken;
        }

        this.nonConfirmedParticipants = this.nonConfirmedParticipants.filter(p => (p.profile_id || p.profileid) !== profileId);
        this.allParticipantsForStage = this.allParticipantsForStage.filter(p => (p.profile_id || p.profileid) !== profileId);

        this.rebuildMergedSlots();
        this.refreshSelectedSlot();
        this.showAllConfirmedParticipants();
        this.closeBookSlotDialog();
        alert('Slot booked successfully!');
        return;
      }

      // Non-queue participant
      const queueRef = doc(this.firestore, 'queue generation', this.selectedQueue['docid']);

      if (!this.selectedQueueProductRef) {
        alert('No queue eligible product found.');
        this.bookSlotLoading = false;
        return;
      }

      // Find participantsproduct with status null
      const pendingProductResult = await getDocs(
        query(
          collection(this.firestore, 'participantsproduct'),
          where('profileid', '==', profileId),
          where('productref', '==', this.selectedQueueProductRef),
          where('status', '==', null)
        )
      );

      if (pendingProductResult.empty) {
        alert('No participant product found. Cannot complete booking.');
        this.bookSlotLoading = false;
        return;
      }

      const pendingProductDoc = pendingProductResult.docs[0];
      const pendingProductData = pendingProductDoc.data();

      // Increment usedslot
      const updated = await this.updateSlotCount(
        queuePlanId, segmentId, stageName, variationId, true, selectedSlot
      );

      if (!updated) {
        alert('Failed to book slot. Slot may be full. Please try again.');
        this.bookSlotLoading = false;
        return;
      }

      // Generate event participation request ID
      const eventParticipationRef = doc(collection(this.firestore, 'event participation request'));
      const eventParticipationId = eventParticipationRef.id;

      // Write participantsproduct + event participation request together
      await Promise.all([
        updateDoc(pendingProductDoc.ref, {
          'status': 'initiated',
          'eventref': queueRef,
          'requestedslot': selectedSlot,
          'queuevariationid': variationId,
          'statusdate.initiated': new Date(),
          'eventparticipationid': eventParticipationId,
          'arenaeventid': this.selectedQueueArenaEventId
        }),
        setDoc(eventParticipationRef, {
          'docid': eventParticipationId,
          'doccreateddate': new Date(),
          'eventref': queueRef,
          'productref': pendingProductData['productref'],
          'status': 'approved',
          'profileid': profileId,
          'participantproductid': pendingProductDoc.id,
          'arenaeventid': this.selectedQueueArenaEventId,
          'initiatedfrom': 'web'
        })
      ]);

      this.rebuildMergedSlots();
      this.refreshSelectedSlot();
      this.showAllNonConfirmedParticipants();
      this.closeBookSlotDialog();
      alert('Slot booked successfully!');
    } catch (err) {
      console.error('Error booking slot:', err);
      alert('Error booking slot. Please try again.');
      this.bookSlotLoading = false;
    }
  }

  refreshSelectedSlot() {
    if (!this.selectedSlot || !this.selectedStageForPanel) return;

    const updatedSlot = this.mergedSlots.find(slot =>
      slot.startdate.getTime() === this.selectedSlot.startdate.getTime() &&
      slot.enddate.getTime() === this.selectedSlot.enddate.getTime()
    );

    if (updatedSlot) {
      this.selectedSlot = updatedSlot;
    }
  }

  // slot revert
  async revertSlot(participant: any, stageName: string) {
    const profileId = participant.profile_id || participant.profileid;

    const confirmed = window.confirm(`Are you sure you want to revert the slot`);
    if (!confirmed) return;

    const stageSlots = participant.selectedstageslot || {};
    const selectedSlot = stageSlots[stageName];

    if (!selectedSlot) {
      alert('No slot found for this stage.');
      return;
    }

    const segmentId = selectedSlot.segmentid;
    const variationId = selectedSlot.variationid || participant.variationId;
    const queuePlanId = this.cachedPlanningData?.docid;

    if (!queuePlanId) {
      alert('Queue planning data not found.');
      return;
    }

    const loading = this.dialog.open(LoadingProgressComponent, {
      data: { msg: 'Reverting slot...' },
      disableClose: true
    });

    try {
      const updated = await this.updateSlotCount(
        queuePlanId, segmentId, stageName, variationId, false, selectedSlot
      );

      if (!updated) {
        loading.close();
        alert('Failed to revert slot. Please try again.');
        return;
      }

      const tokenId = participant.tokenid || participant.id;
      const tokenRef = doc(this.firestore, 'queue_token', tokenId);
      const logRef = doc(collection(this.firestore, 'queue_slot_log'));
      await Promise.all([
        updateDoc(tokenRef, {
          [`selectedstageslot.${stageName}`]: deleteField()
        }),
        setDoc(logRef, {
          docid:      logRef.id,
          ...selectedSlot,
          profileid:  profileId,
          tokenid:    tokenId,
          queueid:    this.selectedQueue['docid'],
          type:       'reverted',
          revertedby: this.profileid,
          createdon:  Timestamp.fromDate(new Date())
        })
      ]);

      const tokenIndex = this.queueTokenList.findIndex(t => t.tokenid === tokenId || t.id === tokenId);
      if (tokenIndex !== -1) {
        const updatedToken = { ...this.queueTokenList[tokenIndex] };
        const updatedStageSlot = { ...(updatedToken.selectedstageslot || {}) };
        delete updatedStageSlot[stageName];
        updatedToken.selectedstageslot = updatedStageSlot;
        this.queueTokenList[tokenIndex] = updatedToken;
      }
      this.confirmedParticipants = this.confirmedParticipants.filter(p => (p.profile_id || p.profileid) !== profileId);
      this.allParticipantsForStage = this.allParticipantsForStage.filter(p => (p.profile_id || p.profileid) !== profileId);

      this.rebuildMergedSlots();
      this.refreshSelectedSlot();
      this.showAllNonConfirmedParticipants();

      loading.close();
      alert('Slot reverted successfully!');

    } catch (err) {
      console.error('Error reverting slot:', err);
      loading.close();
      alert('Error reverting slot. Please try again.');
    }
  }

  async openOverallSlotRevertHistory() {
    this.overallSlotRevertHistory = [];
    this.revertHistoryAllEntries = [];
    this.revertHistorySearchTerm = '';
    this.activeHistoryTab = 'reverted';
    this.revertHistoryLoading = true;
    this.showOverallSlotRevertHistory = true;

    const snap = await getDocs(query(
      collection(this.firestore, 'queue_slot_log'),
      where('queueid', '==', this.selectedQueue['docid']),
      orderBy('createdon', 'desc')
    ));
    const revertedEntries = snap.docs.map(d => ({
      profileId: d.data()['profileid'],
      stageName: d.data()['stagename'],
      type:      'reverted',
      log:       d.data()
    }));
    const bookedEntries: any[] = [];
    (this.queueTokenList || []).forEach((t: any) => {
      const pid = t.profile_id || t.profileid;
      Object.entries(t.selectedstageslot || {}).forEach(([stageName, slot]: [string, any]) => {
        if (!slot.slotconfirmation) return;
        bookedEntries.push({
          profileId: pid,
          stageName,
          type:      'booked',
          log: {
            ...slot,
            profileid: pid,
            stagename: stageName,
            type:      'booked',
            createdon: slot.slotconfirmation,
            segmentName: this.segmentList.find((s: any) => s.docid === slot.segmentid)?.segmentname || 'N/A'
          }
        });
      });
    });

    this.revertHistoryAllEntries = [...revertedEntries, ...bookedEntries];
    this.revertHistoryLoading = false;
    this.filterRevertHistory();
  }

  filterRevertHistory() {
    const term = this.revertHistorySearchTerm.toLowerCase().trim();
    this.overallSlotRevertHistory = this.revertHistoryAllEntries.filter(entry => {
      const matchesTab = entry.type === this.activeHistoryTab;
      if (!term) return matchesTab;
      return matchesTab && (
        this.getProfileName(entry.profileId).toLowerCase().includes(term) ||
        entry.stageName.toLowerCase().includes(term)
      );
    });
  }
  
  switchHistoryTab(tab: 'reverted' | 'booked') {
    this.activeHistoryTab = tab;
    this.filterRevertHistory();
  }

  async loadEventParticipationList() {
    if (this.eventParticipationListLoaded) return;
    this.eventParticipationLoading = true;

    const [eventsSnap, queuesSnap] = await Promise.all([
      getDocs(query(collection(this.firestore, 'event collection'),orderBy('end_date', 'desc'))),
      getDocs(query(collection(this.firestore, 'queue generation'),orderBy('queueenddate', 'desc')))
    ]);

    this.eventParticipationList = [
      ...eventsSnap.docs
        .filter(d => !d.data()['delete'])
        .map(d => ({ ...d.data(), docid: d.id, type: 'event', name: d.data()['name'] })),
      ...queuesSnap.docs
        .filter(d => !d.data()['delete'])
        .map(d => ({ ...d.data(), docid: d.id, type: 'queue', name: d.data()['queuename'] }))
    ];

    this.eventParticipationListLoaded = true;
    this.eventParticipationLoading = false;
  }

  async onEventParticipationSelect(item: any) {
    this.selectedEventParticipation = item;
    this.selectedArenaEventId = null;
    this.arenaEventFilterList = [];
    this.arenaEventProfileMap = {};
    this.eventParticipationLoading = true;

    const docRef = item.type === 'queue'
      ? doc(this.firestore, 'queue generation', item.docid)
      : doc(this.firestore, 'event collection', item.docid);

    const arenaSnap = await getDocs(
      query(collection(this.firestore, 'arena events'), where('eventref', '==', docRef))
    );

    if (!arenaSnap.empty) {
      this.arenaEventFilterList = arenaSnap.docs.map(d => ({
        docid: d.id,
        name: d.data()['title']
          ? `${d.data()['eventname']} - ${d.data()['title']}`
          : d.data()['eventname'] || d.id
      }));

      const ids = arenaSnap.docs.map(d => d.id);
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

      const results = await Promise.all(chunks.map(chunk =>
        getDocs(query(
          collection(this.firestore, 'event participation request'),
          where('arenaeventid', 'in', chunk),
          where('status', 'in', ['approved', 'requested', 'attended'])
        ))
      ));

      results.forEach(snap => snap.docs.forEach(d => {
        const data = d.data();
        const aeid = data['arenaeventid'];
        const pid = data['profileid'];
        if (!this.arenaEventProfileMap[aeid]) {
          this.arenaEventProfileMap[aeid] = new Set<string>();
        }
        this.arenaEventProfileMap[aeid].add(pid);
      }));
    }

    this.eventParticipationLoading = false;
  }

  applyEventParticipationFilter() {
    if (!this.selectedArenaEventId) return;
    this.eventParticipationProfileIds = this.arenaEventProfileMap[this.selectedArenaEventId] || new Set<string>();
    this.eventParticipationDataLoaded = true;
    this.showEventParticipationPicker = false;
    this.recalculateMergedSlotParticipants();
  }

  resetEventParticipationFilter() {
    this.eventParticipationDataLoaded = false;
    this.showEventParticipationPicker = false;
    this.selectedEventParticipation = null;
    this.arenaEventFilterList = [];
    this.selectedArenaEventId = null;
    this.arenaEventProfileMap = {};
    this.eventParticipationProfileIds = new Set();
    this.recalculateMergedSlotParticipants();
  }

  get filteredEventParticipationList(): any[] {
    if (!this.eventParticipationSearchTerm.trim()) return this.eventParticipationList;
    const term = this.eventParticipationSearchTerm.toLowerCase().trim();
    return this.eventParticipationList.filter(e =>
      (e.name || '').toLowerCase().includes(term)
    );
  }

  get selectedArenaEventName(): string {
    if (!this.selectedArenaEventId) return 'Event Filter';
    return this.arenaEventFilterList.find(e => e.docid === this.selectedArenaEventId)?.name || 'Event Filter';
  }
}