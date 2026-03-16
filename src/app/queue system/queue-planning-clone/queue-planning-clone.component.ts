import { Component, inject, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { collection, collectionData, doc, DocumentData, Firestore, getDoc, getDocs, orderBy, Query, query, setDoc, Timestamp, updateDoc, where } from '@angular/fire/firestore';
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
import * as XLSX from 'xlsx';

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
          bigparticipants: any[];
          confirmedParticipants: any[];
          nonConfirmedParticipants: any[];
        }
      }
    }[]
  }[];
}

@Component({
  selector: 'app-queue-planning-clone',
  standalone: true,
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
  ],
  templateUrl: './queue-planning-clone.component.html',
  styleUrl: './queue-planning-clone.component.css'
})
export class QueuePlanningCloneComponent implements OnInit, OnDestroy {

  searchQueue: string;
  profileid: string;

  selectedQueue = null;
  mapProfile: object = {};
  mapProfileData: object = {};
  roles: object = {};

  queueList = [];
  queueVariationList = [];
  segmentList = [];
  queueTokenList = [];
  cohortQueuePlannerList = [];
  queueStages: string[] = [];
  queueStagesConfig: StageConfig[] = [];
  mergedSlots: MergedSlot[] = [];

  private subscriptions: Subscription[] = [];
  private destroy$ = new Subject<void>();

  loading: boolean = true;

  // Panel properties
  showSlotPanel: boolean = false;
  selectedSlot: MergedSlot | null = null;
  selectedStageForPanel: string | null = null;
  loadingPanel: boolean = false;

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

  // NEW: Stage filter for participants list
  selectedStageFilter: string[] = [];
    // NEW: Segment filter for overall views
  selectedSegmentFilter: string[] = [];
  
  // NEW: Track current status view (confirmed/non-confirmed/all/deleted-slots)
  currentStatusView: 'confirmed' | 'non-confirmed' | 'all' | 'deleted-slots' = 'all';

  // NEW: Deleted slots participants
  deletedSlotsParticipants: any[] = [];

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

    for (const mergedSlot of this.mergedSlots) {
      const segmentVar = mergedSlot.segmentVariations.find(sv => sv.segmentId === segmentId);
      if (segmentVar) {
        const variation = segmentVar.variations.find(v => v.variationId === variationId);
        if (variation && variation.stageData) {
          Object.keys(variation.stageData).forEach(stageName => {
            const stageIdx = stageConfig.findIndex(s => s.stageName === stageName);
            if (stageIdx >= 0) {
              stageConfig[stageIdx].slotConfigured = true;
            }
          });
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

    this.closeSlotPanel();
    this.cancelSubscriptions();

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
        this.processMergedSlots();
      });
      this.subscriptions.push(queueTokenSub);

      const cohortQueuePlannerQuery = query(
        collection(this.firestore, 'cohorts queue planner'),
        where('queueid', '==', this.selectedQueue['docid'])
      );
      const cohortPlannerSub = collectionData(cohortQueuePlannerQuery, { idField: 'id' }).subscribe(planners => {
        this.cohortQueuePlannerList = planners;
        this.processMergedSlots();
      });
      this.subscriptions.push(cohortPlannerSub);

      const planningQuery = query(
        collection(this.firestore, 'queue planning'),
        where('queueid', '==', this.selectedQueue['docid'])
      );

      const planningSub = collectionData(planningQuery, { idField: 'id' }).subscribe(async (planningDocs) => {
        if (planningDocs.length > 0) {
          this.updateSlotConfiguredFlags(planningDocs[0]);
          await this.loadQueuePlanning(planningDocs[0]);
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

  returnQueue() {
    return [null,undefined, ''].includes(this.searchQueue) ? this.queueList : this.queueList.filter(e => e['queuename'].toLowerCase().trim().includes(this.searchQueue?.toLowerCase().trim()))
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
    const slotsMap = new Map<string, any>();

    if (planningData.planning && planningData.planning.length > 0) {
      for (const variationPlanning of planningData.planning) {
        const variationId = variationPlanning.variationid;

        if (variationPlanning.segments && variationPlanning.segments.length > 0) {
          for (const segmentData of variationPlanning.segments) {
            const segmentId = segmentData.segmentid;

            if (segmentData.slots && segmentData.slots.length > 0) {
              for (const slot of segmentData.slots) {
                const startDate = slot.startdate ? slot.startdate.toDate() : null;
                const endDate = slot.enddate ? slot.enddate.toDate() : null;
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

    this.processMergedSlots();
  }

  processMergedSlots() {
    const slotsMap = new Map<string, any>();

    const planningQuery = query(collection(this.firestore, 'queue planning'), where('queueid', '==', this.selectedQueue['docid']));

    getDocs(planningQuery).then(planningDocs => {
      if (planningDocs.docs.length > 0) {
        const planningData = planningDocs.docs[0].data();

        if (planningData['planning'] && planningData['planning'].length > 0) {
          for (const variationPlanning of planningData['planning']) {
            const variationId = variationPlanning.variationid;

            if (variationPlanning.segments && variationPlanning.segments.length > 0) {
              for (const segmentData of variationPlanning.segments) {
                const segmentId = segmentData.segmentid;

                if (segmentData.slots && segmentData.slots.length > 0) {
                  for (const slot of segmentData.slots) {
                    const startDate = slot.startdate ? slot.startdate.toDate() : null;
                    const endDate = slot.enddate ? slot.enddate.toDate() : null;
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

        this.mergedSlots = Array.from(slotsMap.values()).map(slotData => {
          const segmentVariations = [];

          slotData.segmentVariationsData.forEach((segVarData, key) => {
            const existingSegment = segmentVariations.find(sv => sv.segmentId === segVarData.segmentId);

            if (existingSegment) {
              existingSegment.variations.push({
                variationId: segVarData.variationId,
                variationName: this.getVariationName(segVarData.variationId),
                stageData: this.calculateStageData(segVarData.segmentId, segVarData.variationId, segVarData.stageData)
              });
            } else {
              segmentVariations.push({
                segmentId: segVarData.segmentId,
                segmentName: this.getSegmentName(segVarData.segmentId),
                variations: [{
                  variationId: segVarData.variationId,
                  variationName: this.getVariationName(segVarData.variationId),
                  stageData: this.calculateStageData(segVarData.segmentId, segVarData.variationId, segVarData.stageData)
                }]
              });
            }
          });

          return {
            startdate: slotData.startdate,
            enddate: slotData.enddate,
            starttime: slotData.starttime,
            endtime: slotData.endtime,
            stages: Array.from(slotData.stages),
            segmentVariations: segmentVariations
          };
        });

        this.mergedSlots.sort((a, b) => a.startdate.getTime() - b.startdate.getTime());
      }
    });
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
      if (token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null,undefined,false].includes(token.delete)) {
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
      if (token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null,undefined,false].includes(token.delete)) {
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
    for (const mergedSlot of this.mergedSlots) {
      const slotStartTs = mergedSlot.startdate.getTime();
      const slotEndTs = mergedSlot.enddate.getTime();

      if (slotStartTs === startTs && slotEndTs === endTs && mergedSlot.stages.includes(stagename)) {
        const segmentVar = mergedSlot.segmentVariations.find(sv => sv.segmentId === segmentid);
        if (segmentVar) {
          const variation = segmentVar.variations.find(v => v.variationId === variationid);
          if (variation && variation.stageData && variation.stageData[stagename]) {
            return true;
          }
        }
      }
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

      if (!validParticipantIds.includes(profileId)) {
        return;
      }

      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null,undefined,false].includes(token.delete)) {
        return;
      }

      const tokenCurrentStageIndex = this.queueStages.indexOf(token.currentstage);
      if (tokenCurrentStageIndex === -1) return;

      if (tokenCurrentStageIndex > currentStageIndex) {
        return;
      }

      if (tokenCurrentStageIndex >= checkFromStageIndex && tokenCurrentStageIndex <= currentStageIndex) {
        const stageSlots = token.selectedstageslot || {};
        const selectedSlot = stageSlots[stagename];

        // const hasConfirmedThisSlot = selectedSlot &&
        //   selectedSlot.segmentid === segmentid &&
        //   selectedSlot.stagename === stagename &&
        //   toTime(selectedSlot.startdate) === startTs &&
        //   toTime(selectedSlot.enddate) === endTs;
        const hasConfirmedThisStage = stageSlots[stagename] != null;
        if (!hasConfirmedThisStage) {
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

        if (addedProfileIds.has(profileId)) {
          return;
        }

        const hasQueueToken = this.queueTokenList.some(token =>
          (token.profile_id === profileId || token.profileid === profileId)
        );

        if (!hasQueueToken) {
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
      const dateObj = d.toDate ? d.toDate() : new Date(d);
      const t = new Date(dateObj).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const startTs = toTime(startdate);
    const endTs = toTime(enddate);

    if (startTs === null || endTs === null) return [];

    const currentStageIndex = this.queueStages.indexOf(stagename);
    if (currentStageIndex === -1) return [];

    const validParticipantIds = this.getParticipantsForSegment(segmentid);

    const matchingTokens: any[] = [];

    for (const token of this.queueTokenList || []) {

      if (token.tokenstatus !== 'Active') continue;
      if (token.stagestatus !== 'Approved') continue;
      if(![null,undefined,false].includes(token.delete)) continue;

      const tokenCurrentStageIndex = this.queueStages.indexOf(token.currentstage);
      if (tokenCurrentStageIndex > currentStageIndex) continue;

      const profileId = token.profile_id || token.profileid;

      if (!validParticipantIds.includes(profileId)) {
        continue;
      }

      const stageSlots = token.selectedstageslot || {};
      const slot = stageSlots[stagename];

      if (
        slot &&
        slot.segmentid === segmentid &&
        slot.stagename === stagename &&
        toTime(slot.startdate) === startTs &&
        toTime(slot.enddate) === endTs
      ) {
        const slotExistsInPlanning = this.checkSlotExistsInPlanning(
          variationid,
          segmentid,
          stagename,
          toTime(slot.startdate),
          toTime(slot.enddate)
        );

        const participantSegmentId = this.getParticipantSegment(profileId);

        matchingTokens.push({
          ...token,
          hasInvalidSlot: !slotExistsInPlanning,
          invalidSlotReason: !slotExistsInPlanning ? 'Slot does not exist in queue planning' : null,
          currentStageIndex: tokenCurrentStageIndex,
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
      return token.currentstage === stage && token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null,undefined,false].includes(token.delete);
    }).length;
  }

  // NEW: Get confirmed queue token count for a specific stage
  getConfirmedQueueTokenCountForStage(stage: string): number {
    if (!this.queueTokenList || this.queueTokenList.length === 0) return 0;
    
    return this.queueTokenList.filter(token => {
      if (token.currentstage !== stage || token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null,undefined,false].includes(token.delete)) {
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
      if (token.currentstage !== stage || token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null,undefined,false].includes(token.delete)) {
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
      return token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null,undefined,false].includes(token.delete);
    }).length;
  }

  // NEW: Get overall segment participants count (all segments)
  getOverallSegmentParticipantsCount(): number {
    const allParticipants = new Set<string>();
    
    this.segmentList.forEach(segment => {
      const segmentId = segment['id'];
      const participants = this.getParticipantsForSegment(segmentId);
      participants.forEach(p => allParticipants.add(p));
    });
    
    return allParticipants.size;
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
    this.allParticipantsForStage = [];
  }

  // NEW: Open overall segment participants panel
  openOverallSegmentParticipantsPanel() {
    this.panelViewType = 'overall-segment-participants';
    this.selectedStageForCount = null;
    this.selectedStageForPanel = null;
    this.showSlotPanel = true;
    this.activePanelSection = null;
    this.selectedStageFilter = [];
    this.selectedSegmentFilter = [];
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
      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null,undefined,false].includes(token.delete)) {
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
      if (token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null,undefined,false].includes(token.delete)) {
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
      console.log('segmentid3',participantSegmentId);
      
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

  // NEW: Apply segment and stage filters
  applyFilters() {
    let filteredList = [...this.allParticipantsForStage];
    
    // Apply segment filter (multiselect)
    if (this.selectedSegmentFilter.length > 0) {
      filteredList = filteredList.filter(p => 
        this.selectedSegmentFilter.includes(p.participantSegmentId)
      );
    }
    
    // Apply stage filter (multiselect)
    if (this.selectedStageFilter.length > 0) {
      filteredList = filteredList.filter(p => 
        p.selectedSlots?.some(slot => this.selectedStageFilter.includes(slot.stageName))
      );
    }
    
    this.allParticipantsForStage = filteredList;
  }

  // NEW: On segment filter change
  onSegmentFilterChange() {
    this.loadingPanel = true;
    
    if (this.currentStatusView === 'confirmed') {
      if (this.panelViewType === 'overall-queue-tokens') {
        this.loadOverallConfirmedQueueTokens();
      } else if (this.panelViewType === 'overall-segment-participants') {
        this.loadOverallConfirmedSegmentParticipants();
      }
    } else if (this.currentStatusView === 'non-confirmed') {
      if (this.panelViewType === 'overall-queue-tokens') {
        this.loadOverallNonConfirmedQueueTokens();
      } else if (this.panelViewType === 'overall-segment-participants') {
        this.loadOverallNonConfirmedSegmentParticipants();
      }
    } else if (this.currentStatusView === 'deleted-slots') {
      this.loadOverallDeletedSlotsParticipants();
    }
  }

  // NEW: On stage filter change
  onStageFilterChange() {
    this.onSegmentFilterChange(); // Reuse the same logic
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
        `${slot.stageName}: ${this.formatDateTo12Hour(slot.startdate?.toDate())} - ${this.formatDateTo12Hour(slot.enddate?.toDate())}`
      ).join('; ') || 'No slots';

      return {
        'No': index + 1,
        'Name': this.getProfileName(profileId),
        'Profile ID': profileId,
        'Segment': p.segmentName || 'N/A',
        'Current Stage': p.currentstage || 'N/A',
        'Status': p.isNonQueueParticipant ? 'Non-In-Queue' : 'In-Queue',
        'Token Status': p.tokenstatus || 'N/A',
        'Stage Status': p.stagestatus || 'N/A',
        'Selected Slots': slotsInfo,
        'Has Deleted Slot': p.hasDeletedSlot ? 'Yes' : 'No',
        'Deleted Slot Stages': p.deletedSlotStages?.join(', ') || 'N/A'
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

    const fileName = `participants_${this.selectedQueue?.['queuename'] || 'queue'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
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
      if (token.currentstage !== stage || token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null,undefined,false].includes(token.delete)) {
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
      if (token.currentstage !== stage || token.tokenstatus !== 'Active' || token.stagestatus !== 'Approved' || ![null,undefined,false].includes(token.delete)) {
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
      return token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null,undefined,false].includes(token.delete);
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
      return token.currentstage === stage && token.tokenstatus === 'Active' && token.stagestatus === 'Approved' && [null,undefined,false].includes(token.delete);
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

        if([null,undefined,''].includes(slot.segmentid)){
          console.log(participant.profile_name);
        }

        if (![null,undefined,''].includes(slot.segmentid)) {
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
      segmentVar.variations.forEach(variation => {
        if (variation.stageData && variation.stageData[stage]) {
          const confirmed = variation.stageData[stage].confirmedParticipants || [];
          count += confirmed.length;
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

  openSlotPanel(slot: MergedSlot, stage: string) {
    this.panelViewType = 'slot';
    this.selectedSlot = slot;
    this.selectedStageForPanel = stage;
    this.showSlotPanel = true;
    this.activePanelSection = 'confirmed';

    this.confirmedParticipants = [];
    this.nonConfirmedParticipants = [];
    this.bigParticipants = [];

    this.segmentsExpanded = false;
    this.variationsExpanded = false;
  }

  closeSlotPanel() {
    this.showSlotPanel = false;
    this.selectedSlot = null;
    this.selectedStageForPanel = null;
    this.activePanelSection = null;
    this.panelViewType = null;
    this.selectedStageForCount = null;
    this.selectedStageFilter = []; // Reset to empty array
    this.selectedSegmentFilter = []; // Add this
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

    const participantList = this.participantLists.find(list => {
      const participants = list['profilelist'] || [];
      return participants.some((p: string) => {
        return p === profileId;
      });
    });

    if (!participantList) return null;

    if (participantList['segmentid']) {
      return participantList['segmentid'];
    }

    const participantListId = participantList['id'];
    const segment = this.segmentList.find(seg => {
      const mappedLists = seg['participantlistid'] || [];
      return mappedLists.includes(participantListId);
    });

    return segment ? segment['id'] : null;
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
    console.log(segmentId);
    if(![null,undefined,''].includes(segmentId) && segmentId.length != 0){
     const segment = this.segmentList.find(s => s.docid === segmentId);
      return segment?.['segmentname'] || ''
    }else{
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

  getSlotsForStage(stage: string): MergedSlot[] {
    return this.mergedSlots.filter(slot => slot.stages.includes(stage));
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
    const selectedParticipants = this.getActiveParticipantsList().filter(p => p.selected);

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
        }).then(() => {
          console.log(notificationimage)
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  }

  async sendWhatsApp() {
    const selectedParticipants = this.getActiveParticipantsList().filter(p => p.selected);

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
          this.guard.openSnackBar("Wati Message Sent Successfully", "OK");
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
          this.guard.openSnackBar("Sending Wati Message Failed", "OK");
        }
      }
    });
  }

  async sendEmail() {
    const selectedParticipants = this.getActiveParticipantsList().filter(p => p.selected);

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
            this.guard.openSnackBar("Email Sent", "OK");
          }).catch(err => {
            console.log(err);
            this.guard.openSnackBar("Error Sending Email", "OK");
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

  toggleStageRange() {
    this.isStageRangeExpanded = !this.isStageRangeExpanded;
  }

}