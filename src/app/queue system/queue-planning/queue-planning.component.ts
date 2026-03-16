import { Component, inject, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { collection, collectionData, doc, DocumentData, Firestore, getDoc, getDocs, orderBy, Query, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from '@angular/fire/firestore';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatHint, MatInputModule } from '@angular/material/input';
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
import { Subject, Subscription, takeUntil } from 'rxjs';
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatTableModule } from '@angular/material/table';
import { DraftQueuePlanningDialogComponent } from '../draft-queue-planning-dialog/draft-queue-planning-dialog.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CohortsFilterPipe } from '../cohorts-filter';
import { MatTabGroup, MatTab } from "@angular/material/tabs";
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatBadgeModule } from '@angular/material/badge';
import { ManageParticipantlistDialogComponent } from '../../Participants Profile Management/participants-analytics/manage-participantlist-dialog/manage-participantlist-dialog.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { environment } from '../../../environments/environment.development';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { COMMA, ENTER } from '@angular/cdk/keycodes';

interface PlanningRow {
  id: string;
  selectedSegment: string | null;
  selectedVariation: string | null;
  stageData: {
    [stageName: string]: {
      cohortIds: string[];
      dates: Array<{
        startdate: Date | null;
        enddate: Date | null;
        starttime: string;
        endtime: string;
        maxslot: number;
        usedslot: number;
        bigparticipants: any[];
        participants: any[];
      }>;
    };
  };
}

interface NonSelectedParticipant {
  participantId: string;
  participantData: any;
  selected: boolean;
}

@Component({
  selector: 'app-queue-planning',
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
    CohortsFilterPipe,
    MatChipsModule,
    MatCheckboxModule,
    MatBadgeModule,
    MatHint,

  ],
  templateUrl: './queue-planning.component.html',
  styleUrl: './queue-planning.component.css'
})

export class QueuePlanningComponent implements OnInit, OnDestroy {

  @ViewChild('dateEditDialog') dateEditDialog: TemplateRef<any>;
  @ViewChild('segmentEditDialog') segmentEditDialog: TemplateRef<any>;
  @ViewChild('variationEditDialog') variationEditDialog: TemplateRef<any>;

  searchQueue: string;
  profileid: string;

  selectedQueue = null;
  existingPlanningDocId: string = null;
  currentDraftDocId: string = null;

  mapProfile: object = {};
  mapProfileData: object = {};
  roles: object = {};

  mapStageSlotBookedSlots = {}
  queueList = [];
  queueVariationList = [];
  segmentList = [];
  cohortsList = [];
  queueStages: string[] = [];
  queueTokenList = [];
  cohortQueuePlannerList = [];
  planningRows: PlanningRow[] = [];
  displayedColumns: string[] = [];
  private subscriptions: Subscription[] = [];

  searchCohort: string = '';

  // Filter properties
  participantTagsList: any[] = [];
  participantListsList: any[] = [];
  allParticipantsData: any[] = [];

  // Filter values
  filterSegmentSearch: string = '';
  filterDateStart: Date | null = null;
  filterDateEnd: Date | null = null;
  filterSelectedTags: string[] = [];
  filterSelectedLists: string[] = [];

  // For editing segment
  editingRowForSegment: PlanningRow = null;
  editingSegmentData: any = {
    selectedSegment: null
  };

  // For editing variation
  editingRowForVariation: PlanningRow = null;
  editingVariationData: any = {
    selectedVariation: null
  };

  // For editing cohort
  editingCohort: boolean = false;
  editingCohortData: any = {
    cohortIds: []
  };

  // For editing date entry
  editingRow: PlanningRow = null;
  editingStageName: string = null;
  editingDateIndex: number = null;
  editingDateEntry: any = {
    startdate: null,
    enddate: null,
    starttime: '09:00',
    endtime: '17:00',
    maxslot: 0,
    usedslot: 0,
    bigparticipants: [],
    participants: [],
  };

  // Add to component properties
  searchSegmentForMulti: string = '';
  multiSlotData: any = {
    selectedStage: null,
    selectedSegments: [],
    startdate: null,
    enddate: null,
    starttime: '09:00',
    endtime: '17:00',
    maxslot: 0
  };

  queueSubscription: Subscription;

  private subscriptionHandle = new Subject<void>();
  private autoSaveInterval: any;

  loading: boolean = true;

  // Participant Panel properties
  showParticipantPanel: boolean = false;
  selectedSegmentForPanel: string | null = null;
  nonSelectedParticipants: NonSelectedParticipant[] = [];
  availableSegmentsCache: Array<{rowId: string, segmentId: string, variationId: string, disabled: boolean}> = [];
  loadingParticipants: boolean = false;

  // Panel type and data
  panelType: 'non-queue' | 'big-participants' | 'used-slots' | 'non-confirmed' = 'non-queue';
  panelTitle: string = 'Participants';
  slotDialogMode: 'single' | 'multi' = 'single';
  currentSlotInfo: any = null;

  private storage = inject(Storage);
  private destroy$ = new Subject<void>();

  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public dialog: MatDialog,
    private http : HttpClient 
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

      const cohortsSub = collectionData(collection(this.firestore, 'big cohorts'), { idField: 'id' }).subscribe(cohorts => {
        this.cohortsList = cohorts;
      });
      this.subscriptions.push(cohortsSub);

      const tagsSub = collectionData(collection(this.firestore, 'participant tags'), { idField: 'id' }).subscribe(tags => {
        this.participantTagsList = tags;
      });
      this.subscriptions.push(tagsSub);

      const listsSub = collectionData(collection(this.firestore, 'participant list'), { idField: 'id' }).subscribe(lists => {
        this.participantListsList = lists;
      });
      this.subscriptions.push(listsSub);

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

  ngOnInit(): void { }

  ngOnDestroy() {
    this.cancelSubscriptions();
  }

  returnQueue() {
    return [null,undefined,''].includes(this.searchQueue) ? this.queueList : this.queueList.filter(e => e['queuename'].toLowerCase().trim().includes(this.searchQueue?.toLowerCase().trim()))
  }

  private cancelSubscriptions() {
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];
    console.log('All subscriptions cancelled');
  }

  getFilteredPlanningRows(): PlanningRow[] {
    return this.planningRows.filter(row => {
      if (this.filterSegmentSearch && row.selectedSegment) {
        const segmentName = this.getSegmentName(row.selectedSegment).toLowerCase();
        if (!segmentName.includes(this.filterSegmentSearch.toLowerCase())) {
          return false;
        }
      }

      if (this.filterSelectedTags.length > 0 && row.selectedSegment) {
        const segment = this.segmentList.find(s => s.id === row.selectedSegment);
        if (!segment || !segment['tagids']) {
          return false;
        }
        const hasMatchingTag = this.filterSelectedTags.some(tagId =>
          segment['tagids'].includes(tagId)
        );
        if (!hasMatchingTag) {
          return false;
        }
      }

      if (this.filterSelectedLists.length > 0 && row.selectedSegment) {
        const segment = this.segmentList.find(s => s.id === row.selectedSegment);
        if (!segment || !segment['participantlistid']) {
          return false;
        }
        const hasMatchingList = this.filterSelectedLists.some(listId =>
          segment['participantlistid'].includes(listId)
        );
        if (!hasMatchingList) {
          return false;
        }
      }

      if (this.filterDateStart || this.filterDateEnd) {
        let hasMatchingDate = false;

        for (const stageName of this.queueStages) {
          if (row.stageData[stageName] && row.stageData[stageName].dates) {
            for (const dateEntry of row.stageData[stageName].dates) {
              if (dateEntry.startdate && dateEntry.enddate) {
                const slotStart = new Date(dateEntry.startdate);
                const slotEnd = new Date(dateEntry.enddate);

                const matchesStart = !this.filterDateStart || slotEnd >= this.filterDateStart;
                const matchesEnd = !this.filterDateEnd || slotStart <= this.filterDateEnd;

                if (matchesStart && matchesEnd) {
                  hasMatchingDate = true;
                  break;
                }
              }
            }
            if (hasMatchingDate) break;
          }
        }

        if (!hasMatchingDate) {
          return false;
        }
      }

      return true;
    });
  }

  clearAllFilters() {
    this.filterSegmentSearch = '';
    this.filterDateStart = null;
    this.filterDateEnd = null;
    this.filterSelectedTags = [];
    this.filterSelectedLists = [];
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filterSegmentSearch ||
      this.filterDateStart ||
      this.filterDateEnd ||
      this.filterSelectedTags.length > 0 ||
      this.filterSelectedLists.length > 0
    );
  }

  getTagName(tagId: string): string {
    const tag = this.participantTagsList.find(t => t.id === tagId);
    return tag ? tag['name'] : tagId;
  }

  getParticipantListName(listId: string): string {
    const list = this.participantListsList.find(l => l.id === listId);
    return list ? list['listname'] : listId;
  }

  removeTagFilter(tagId: string) {
    this.filterSelectedTags = this.filterSelectedTags.filter(id => id !== tagId);
  }

  removeListFilter(listId: string) {
    this.filterSelectedLists = this.filterSelectedLists.filter(id => id !== listId);
  }

  async getNonSelectedParticipantsCount(segmentId: string): Promise<number> {
    if (!segmentId || !this.selectedQueue) return 0;

    const segment = this.segmentList.find(s => s.id === segmentId);
    if (!segment || !segment['participantlistid'] || segment['participantlistid'].length === 0) {
      return 0;
    }

    const allParticipantIds = new Set<string>();

    for (const listId of segment['participantlistid']) {
      const participantListDoc = await getDoc(doc(this.firestore, 'participant list', listId));
      if (participantListDoc.exists()) {
        const members = participantListDoc.data()['profilelist'] || [];
        members.forEach(memberId => allParticipantIds.add(memberId));
      }
    }

    const selectedParticipantIds = new Set<string>();

    for (const token of this.queueTokenList || []) {
      if (token.profile_id) {
        selectedParticipantIds.add(token.profile_id);
      }
    }

    let nonSelectedCount = 0;
    allParticipantIds.forEach(participantId => {
      if (!selectedParticipantIds.has(participantId)) {
        nonSelectedCount++;
      }
    });

    return nonSelectedCount;
  }

  getNonSelectedCount(segmentId: string): number {
    if (!segmentId || !this.selectedQueue) return 0;

    const segment = this.segmentList.find(s => s.id === segmentId);
    if (!segment || !segment['participantlistid'] || segment['participantlistid'].length === 0) {
      return 0;
    }

    const allParticipantIds = new Set<string>();

    segment['participantlistid'].forEach(listId => {
      const participantList = this.participantListsList.find(pl => pl.docid === listId);
      if (participantList && participantList['profilelist']) {
        participantList['profilelist'].forEach(memberId => allParticipantIds.add(memberId));
      }
    });

    const selectedParticipantIds = new Set<string>();

    (this.queueTokenList || []).forEach(token => {
      if (token.profile_id) {
        selectedParticipantIds.add(token.profile_id);
      }
    });

    let nonSelectedCount = 0;
    allParticipantIds.forEach(participantId => {
      if (!selectedParticipantIds.has(participantId)) {
        nonSelectedCount++;
      }
    });

    return nonSelectedCount;
  }

  async showNonSelectedParticipants(segmentId: string) {
    this.panelType = 'non-queue';
    this.panelTitle = 'Non-Selected Participants';
    this.selectedSegmentForPanel = segmentId;
    this.showParticipantPanel = true;
    this.loadingParticipants = true;
    this.nonSelectedParticipants = [];

    const segment = this.segmentList.find(s => s.id === segmentId);
    if (!segment || !segment['participantlistid'] || segment['participantlistid'].length === 0) {
      this.loadingParticipants = false;
      return;
    }

    const allParticipantsMap = new Map<string, any>();

    for (const listId of segment['participantlistid']) {
      const participantList = this.participantListsList.find(pl => pl.docid === listId);
      if (participantList && participantList['profilelist']) {
        for (const memberId of participantList['profilelist']) {
          if (!allParticipantsMap.has(memberId)) {
            allParticipantsMap.set(memberId, {
              id: memberId,
              ...this.mapProfileData[memberId]
            });
          }
        }
      }
    }

    const selectedParticipantIds = new Set<string>();

    (this.queueTokenList || []).forEach(token => {
      if (token.profile_id) {
        selectedParticipantIds.add(token.profile_id);
      }
    });

    allParticipantsMap.forEach((participantData, participantId) => {
      if (!selectedParticipantIds.has(participantId)) {
        this.nonSelectedParticipants.push({
          participantId: participantId,
          participantData: participantData,
          selected: true
        });
      }
    });

    this.loadingParticipants = false;
  }

  // Show B!G Participants in panel
  showBigParticipants(bigparticipants: any[], slotInfo: any = null) {
    this.panelType = 'big-participants';
    this.panelTitle = 'B!G Participants';
    this.currentSlotInfo = slotInfo;
    this.showParticipantPanel = true;
    this.loadingParticipants = false;
    this.nonSelectedParticipants = [];

    bigparticipants.forEach((participant, index) => {
      this.nonSelectedParticipants.push({
        participantId: participant.profileid,
        participantData: {
          id: participant.profileid,
          name: this.getProfileName(participant.profileid),
          ...participant
        },
        selected: true
      });
    });
  }

  // Show Used Slot Participants in panel
  showParticipants(participants: any[], slotInfo: any = null) {
    this.panelType = 'used-slots';
    this.panelTitle = 'Participants (Used Slots)';
    this.currentSlotInfo = slotInfo;
    this.showParticipantPanel = true;
    this.loadingParticipants = false;
    this.nonSelectedParticipants = [];

    participants.forEach((participant, index) => {
      this.nonSelectedParticipants.push({
        participantId: participant.profile_id,
        participantData: {
          id: participant.profile_id,
          name: this.getProfileName(participant.profile_id),
          tokenstatus: participant.tokenstatus,
          ...participant
        },
        selected: true
      });
    });
  }

  getNonConfirmedParticipants(variationId: string, segmentId: string, stageName: string, startDate: Date, endDate: Date): any[] {
    if (!variationId || !segmentId || !stageName || !startDate || !endDate) {
      return [];
    }

    const currentStageIndex = this.queueStages.indexOf(stageName);
    if (currentStageIndex === -1) return [];

    const toTime = (d: any): number | null => {
      if (!d) return null;
      const dateObj = d.toDate ? d.toDate() : new Date(d);
      const t = new Date(dateObj).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const slotStartTs = toTime(startDate);
    const slotEndTs = toTime(endDate);

    const nonConfirmedParticipants: any[] = [];

    // Get the variation to check which stages have slots
    const variation = this.queueVariationList.find(v => v.id === variationId);
    if (!variation || !variation.stages || !variation.stages.includes(stageName)) {
      return [];
    }

    const previousStagesWithSlots: string[] = [];
    for (let i = 0; i < currentStageIndex; i++) {
      const prevStageName = this.queueStages[i];
      if (variation.stages.includes(prevStageName)) {
        const hasSlots = this.planningRows.some(row =>
          row.selectedVariation === variationId &&
          row.stageData[prevStageName] &&
          row.stageData[prevStageName].dates &&
          row.stageData[prevStageName].dates.length > 0
        );
        if (hasSlots) {
          previousStagesWithSlots.push(prevStageName);
        }
      }
    }

    const lastStageWithSlots = previousStagesWithSlots.length > 0
      ? previousStagesWithSlots[previousStagesWithSlots.length - 1]
      : null;

    (this.queueTokenList || []).forEach(token => {
      if (token.variationid !== variationId) return;

      const tokenCurrentStageIndex = this.queueStages.indexOf(token.currentstage);

      if (tokenCurrentStageIndex === -1) return;

      let shouldHaveConfirmed = false;

      if (lastStageWithSlots) {
        const lastStageIndex = this.queueStages.indexOf(lastStageWithSlots);

        if (tokenCurrentStageIndex > lastStageIndex && tokenCurrentStageIndex <= currentStageIndex) {
          shouldHaveConfirmed = true;
        }
      } else {
        if (tokenCurrentStageIndex <= currentStageIndex) {
          shouldHaveConfirmed = true;
        }
      }

      if (shouldHaveConfirmed) {
        const stageSlots = token.selectedstageslot || {};
        const selectedSlot = stageSlots[stageName];

        // FIXED: Check if participant has selected ANY slot for this stage
        // Remove from non-confirmed if:
        // 1. They have selected a slot for this stage (any slot, not just this specific one)
        // 2. OR their current stage is the same as this stage (they're currently on this stage)
        
        const hasSelectedAnySlotForThisStage = selectedSlot !== undefined && selectedSlot !== null;
        const isOnThisStage = token.currentstage === stageName;

        if (!hasSelectedAnySlotForThisStage && !isOnThisStage) {
          nonConfirmedParticipants.push(token);
        }
      }
    });

    return nonConfirmedParticipants;
  }

  // Get non-confirmed count
  getNonConfirmedCount(variationId: string, segmentId: string, stageName: string, startDate: Date, endDate: Date): number {
    return this.getNonConfirmedParticipants(variationId, segmentId, stageName, startDate, endDate).length;
  }

  // Show non-confirmed participants in panel
  showNonConfirmedParticipants(variationId: string, segmentId: string, stageName: string, startDate: Date, endDate: Date, slotInfo: any = null) {
    this.panelType = 'non-confirmed';
    this.panelTitle = 'Non-Confirmed Participants';
    this.currentSlotInfo = slotInfo;
    this.showParticipantPanel = true;
    this.loadingParticipants = false;
    this.nonSelectedParticipants = [];

    const nonConfirmed = this.getNonConfirmedParticipants(variationId, segmentId, stageName, startDate, endDate);

    nonConfirmed.forEach((participant, index) => {
      this.nonSelectedParticipants.push({
        participantId: participant.profile_id,
        participantData: {
          id: participant.profile_id,
          name: this.getProfileName(participant.profile_id),
          currentstage: participant.currentstage,
          tokenstatus: participant.tokenstatus,
          ...participant
        },
        selected: true
      });
    });
  }

  closeParticipantPanel() {
    this.showParticipantPanel = false;
    this.selectedSegmentForPanel = null;
    this.nonSelectedParticipants = [];
    this.panelType = 'non-queue';
    this.panelTitle = 'Participants';
    this.currentSlotInfo = null;
  }

  toggleAllParticipants(checked: boolean) {
    this.nonSelectedParticipants.forEach(p => p.selected = checked);
  }

  areAllParticipantsSelected(): boolean {
    return this.nonSelectedParticipants.length > 0 &&
      this.nonSelectedParticipants.every(p => p.selected);
  }

  areSomeParticipantsSelected(): boolean {
    const selectedCount = this.nonSelectedParticipants.filter(p => p.selected).length;
    return selectedCount > 0 && selectedCount < this.nonSelectedParticipants.length;
  }

  getSelectedParticipantsCount(): number {
    return this.nonSelectedParticipants.filter(p => p.selected).length;
  }

  getSegmentInfoForPanel() {
    if (!this.selectedSegmentForPanel) return null;

    const segment = this.segmentList.find(s => s.id === this.selectedSegmentForPanel);
    if (!segment) return null;

    return {
      segmentName: segment['segmentname'] || 'Unknown Segment',
      participantLists: (segment['participantlistid'] || []).map(listId => this.getParticipantListName(listId)),
      tags: (segment['tagids'] || []).map(tagId => this.getTagName(tagId))
    };
  }

  async sendNotification() {
    const selectedParticipants = this.nonSelectedParticipants.filter(p => p.selected);

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

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
        console.log(selectedParticipants,"this.selection.selected");
        // var unsentProfiles = [];
        for (let i = 0; i < selectedParticipants.length; i++) {
          const selected = selectedParticipants[i];
          profileID.push(selected["profileid"])
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
        }).then(()=>{
          console.log( notificationimage)
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  }

  async sendWhatsApp() {
    const selectedParticipants = this.nonSelectedParticipants.filter(p => p.selected);

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(WatiInputComponent,{
      data : selectedParticipants,
      width : "70vw",
      height : "80vh",
      disableClose:true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
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
          this.guard.openSnackBar("Sending Wati Message Failed", "OK",600);
        }
      }
    });
  }

  async sendEmail() {
    const selectedParticipants = this.nonSelectedParticipants.filter(p => p.selected);

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

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
            this.guard.openSnackBar("Email Sent", "OK",600);
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
    })
  }

  async onQueueSelect() {
    this.queueStages = [];
    this.queueVariationList = [];
    this.queueTokenList = [];
    this.mapStageSlotBookedSlots = {}
    this.cohortQueuePlannerList = [];
    this.planningRows = [];
    this.existingPlanningDocId = null;

    this.clearAllFilters();
    this.closeParticipantPanel();

    this.cancelSubscriptions();

    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Loading Queue Data..."
      },
      disableClose: true
    });

    try {
      const queueRef = doc(this.firestore, 'queue generation', this.selectedQueue['docid']);

      const queueDoc = await getDoc(queueRef);
      if (queueDoc.exists()) {
        this.queueStages = queueDoc.data()['stages'] || [];
        this.setupDisplayedColumns();
      }

      const queuevariationdocs = await getDocs(query(collection(this.firestore, 'queue variation'), where('queueref', '==', queueRef)));

      if (queuevariationdocs.docs.length === 0) {
        loading.close();
        alert('There is no queue variation for this queue. Please create queue variations first.');
        this.selectedQueue = null;
        return;
      }

      this.queueVariationList = queuevariationdocs.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      const queueTokenQuery = query(
        collection(this.firestore, 'queue_token'),
        where('queueref', '==', queueRef),
        where("stagestatus", "==", "Approved"),
        where("tokenstatus", "==", "Active"),
      );
      const queueTokenSub = collectionData(queueTokenQuery, { idField: 'id' }).subscribe(tokens => {
        this.queueTokenList = tokens;
        var stageSlot = {}
        for (let i = 0; i < tokens.length; i++) {
          const tokenData = tokens[i];
          if(tokenData["selectedstageslot"]){
            Object.keys(tokenData["selectedstageslot"]).forEach(stage =>{
              var slotData = tokenData["selectedstageslot"][stage]
              slotData["startdate"] = slotData["startdate"].toDate()
              slotData["enddate"] = slotData["enddate"].toDate()
              stageSlot[stage] = stageSlot[stage] ?? []
              stageSlot[stage].push({
                ...slotData,
                profile: this.mapProfile[tokenData["profile_id"]],
                profileid: tokenData["profile_id"],
                queuetoken: tokenData["docid"]
              })
            })
          }
        }
        this.mapStageSlotBookedSlots = stageSlot
        this.updatePlanningRowsWithTokenData();
      });
      this.subscriptions.push(queueTokenSub);

      const cohortQueuePlannerQuery = query(
        collection(this.firestore, 'cohorts queue planner'),
        where('queueid', '==', this.selectedQueue['docid'])
      );
      const cohortPlannerSub = collectionData(cohortQueuePlannerQuery, { idField: 'id' }).subscribe(planners => {
        this.cohortQueuePlannerList = planners;
        this.updatePlanningRowsWithCohortData();
      });
      this.subscriptions.push(cohortPlannerSub);

      const draftQuery = query(
        collection(this.firestore, 'queue planning draft'),
        where('queueid', '==', this.selectedQueue['docid']),
        where('deleted', '==', false),
        orderBy('updatedAt', 'desc')
      );

      const draftDocs = await getDocs(draftQuery);

      if (draftDocs.docs.length > 0) {
        loading.close();
        const selectedDraft = await this.showDraftSelectionDialog(draftDocs.docs);

        if (selectedDraft) {
          loading = this.dialog.open(LoadingProgressComponent, {
            data: {
              msg: "Loading Draft..."
            },
            disableClose: true
          });
          await this.loadDraftFromFirestore(selectedDraft);
          loading.close();
          return;
        }
      }

      const planningQuery = query(collection(this.firestore, 'queue planning'), where('queueid', '==', this.selectedQueue['docid']));

      const planningSub = collectionData(planningQuery, { idField: 'id' }).subscribe(async (planningDocs) => {
        if (planningDocs.length > 0) {
          const existingPlanning = planningDocs[0];
          this.existingPlanningDocId = existingPlanning.id;

          await this.loadExistingPlanning(existingPlanning, this.queueTokenList || [], this.cohortQueuePlannerList || []);
        } else {
          this.addRow();
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

  async loadExistingPlanning(planningData: any, queuetokenlist: any, cohortqueueplannerlist: any) {
    this.queueTokenList = queuetokenlist;
    this.cohortQueuePlannerList = cohortqueueplannerlist;
    this.planningRows = [];

    if (planningData.planning && planningData.planning.length > 0) {
      for (const variationPlanning of planningData.planning) {
        const variationId = variationPlanning.variationid;

        if (variationPlanning.segments && variationPlanning.segments.length > 0) {
          for (const segmentData of variationPlanning.segments) {
            const segmentId = segmentData.segmentid;

            const newRow: PlanningRow = {
              id: this.generateRowId(),
              selectedSegment: segmentId,
              selectedVariation: variationId,
              stageData: {}
            };

            this.queueStages.forEach(stage => {
              newRow.stageData[stage] = {
                cohortIds: [],
                dates: []
              };
            });

            if (segmentData.stagecohort && segmentData.stagecohort.length > 0) {
              segmentData.stagecohort.forEach(stageCohort => {
                const stageName = stageCohort.stagename;
                if (this.queueStages.includes(stageName)) {
                  if (!newRow.stageData[stageName]) {
                    newRow.stageData[stageName] = { cohortIds: [], dates: [] };
                  }
                  if (stageCohort.cohort && Array.isArray(stageCohort.cohort)) {
                    newRow.stageData[stageName].cohortIds = stageCohort.cohort;
                  } else if (stageCohort.cohortid) {
                    newRow.stageData[stageName].cohortIds = [stageCohort.cohortid];
                  }
                }
              });
            }
            else if (segmentData.cohortid) {
              this.queueStages.forEach(stage => {
                if (newRow.stageData[stage]) {
                  newRow.stageData[stage].cohortIds = [segmentData.cohortid];
                }
              });
            }

            if (segmentData.slots && segmentData.slots.length > 0) {
              const stageMap = new Map<string, any[]>();

              segmentData.slots.forEach(slot => {
                const stageName = slot.stagename;
                if (!stageMap.has(stageName)) {
                  stageMap.set(stageName, []);
                }

                const startDate = slot.startdate ? slot.startdate.toDate() : null;
                const endDate = slot.enddate ? slot.enddate.toDate() : null;

                const bigparticipants = this.getBigParticipantsForSlot(
                  variationId,
                  segmentId,
                  stageName,
                  startDate,
                  endDate
                );

                const participants = this.getParticipantsForSlot(
                  variationId,
                  segmentId,
                  stageName,
                  startDate,
                  endDate
                );

                stageMap.get(stageName).push({
                  startdate: startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null,
                  enddate: endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : null,
                  starttime: startDate ? this.formatTimeTo24Hour(startDate) : '09:00',
                  endtime: endDate ? this.formatTimeTo24Hour(endDate) : '17:00',
                  maxslot: slot.maxslot || 0,
                  usedslot: slot.usedslot || 0,
                  bigparticipants: bigparticipants,
                  participants: participants
                });
              });

              stageMap.forEach((dates, stageName) => {
                if (this.queueStages.includes(stageName)) {
                  if (!newRow.stageData[stageName]) {
                    newRow.stageData[stageName] = { cohortIds: [], dates: [] };
                  }
                  newRow.stageData[stageName].dates = dates;
                }
              });
            }

            this.planningRows.push(newRow);
          }
        }
      }
    }

    if (this.planningRows.length === 0) {
      this.addRow();
    }
  }

  private updatePlanningRowsWithTokenData() {
    if (!this.planningRows || this.planningRows.length === 0) {
      return;
    }

    this.planningRows.forEach(row => {
      const variationId = row.selectedVariation;
      const segmentId = row.selectedSegment;

      this.queueStages.forEach(stageName => {
        if (row.stageData[stageName] && row.stageData[stageName].dates) {
          row.stageData[stageName].dates.forEach(dateSlot => {
            const startDate = dateSlot.startdate;
            const endDate = dateSlot.enddate;

            const participants = this.getParticipantsForSlot(
              variationId,
              segmentId,
              stageName,
              startDate,
              endDate
            );

            dateSlot.participants = participants;
            dateSlot.usedslot = participants.length;
          });
        }
      });
    });

    this.planningRows = [...this.planningRows];
  }

  private updatePlanningRowsWithCohortData() {
    if (!this.planningRows || this.planningRows.length === 0) {
      return;
    }

    this.planningRows.forEach(row => {
      const variationId = row.selectedVariation;
      const segmentId = row.selectedSegment;

      this.queueStages.forEach(stageName => {
        if (row.stageData[stageName] && row.stageData[stageName].dates) {
          row.stageData[stageName].dates.forEach(dateSlot => {
            const startDate = dateSlot.startdate;
            const endDate = dateSlot.enddate;

            const bigparticipants = this.getBigParticipantsForSlot(
              variationId,
              segmentId,
              stageName,
              startDate,
              endDate
            );

            dateSlot.bigparticipants = bigparticipants;

            const totalParticipants = (dateSlot.participants?.length || 0) + bigparticipants.length;
            dateSlot.usedslot = totalParticipants;
          });
        }
      });
    });

    this.planningRows = [...this.planningRows];
  }

  private recalculateParticipantsForRow(row: PlanningRow) {
    if (!row.selectedVariation || !row.selectedSegment) {
      return;
    }

    this.queueStages.forEach(stageName => {
      if (row.stageData[stageName] && row.stageData[stageName].dates) {
        row.stageData[stageName].dates.forEach(dateSlot => {
          if (dateSlot.startdate && dateSlot.enddate) {
            const startDateTime = this.combineDateAndTime(dateSlot.startdate, dateSlot.starttime);
            const endDateTime = this.combineDateAndTime(dateSlot.enddate, dateSlot.endtime);

            const bigparticipants = this.getBigParticipantsForSlot(
              row.selectedVariation,
              row.selectedSegment,
              stageName,
              startDateTime,
              endDateTime
            );

            const participants = this.getParticipantsForSlot(
              row.selectedVariation,
              row.selectedSegment,
              stageName,
              startDateTime,
              endDateTime
            );

            dateSlot.bigparticipants = bigparticipants;
            dateSlot.participants = participants;
            dateSlot.usedslot = participants.length;
          }
        });
      }
    });
  }

  setupDisplayedColumns() {
    this.displayedColumns = ['segment', 'variation'];
    this.displayedColumns.push(...this.queueStages);
    this.displayedColumns.push('actions');
  }

  getBigParticipantsForSlot(variationid: string, segmentid: string, stagename: string, startdate: Date, enddate: Date): any[] {

    const toTime = (d: Date | undefined | null): number | null => {
      if (d === undefined || d === null) return null;
      const t = new Date(d).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const startTs = toTime(startdate);
    const endTs = toTime(enddate);

    if (startTs === null || endTs === null) return [];

    const matchingParticipants: any[] = [];

    for (const planner of this.cohortQueuePlannerList || []) {
      const slots = planner.selectedslots || [];

      for (const slot of slots) {

        if (
          slot.stagename === stagename &&
          slot.variationid === variationid &&
          slot.segmentid === segmentid &&
          toTime(slot.startdate?.toDate ? slot.startdate.toDate() : slot.startdate) === startTs &&
          toTime(slot.enddate?.toDate ? slot.enddate.toDate() : slot.enddate) === endTs
        ) {
          matchingParticipants.push({
            ...planner,
            slotInfo: slot
          });
        }
      }
    }

    return matchingParticipants;
  }

  getParticipantsForSlot(variationid: string, segmentid: string, stagename: string, startdate: Date, enddate: Date): any[] {
    const toTime = (d: any): number | null => {
      if (!d) return null;
      const dateObj = d.toDate ? d.toDate() : new Date(d);
      const t = new Date(dateObj).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const startTs = toTime(startdate);
    const endTs = toTime(enddate);

    if (startTs === null || endTs === null) return [];

    const matchingTokens: any[] = [];

    for (const token of this.queueTokenList || []) {
      if (token.variationid !== variationid) continue;

      const stageSlots = token.selectedstageslot || {};
      const slot = stageSlots[stagename];

      if (
        slot &&
        slot.segmentid === segmentid &&
        slot.stagename === stagename &&
        toTime(slot.startdate) === startTs &&
        toTime(slot.enddate) === endTs
      ) {
        matchingTokens.push(token);
      }
    }

    return matchingTokens;
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

  combineDateAndTime(date: Date, time: string): Date {
    if (!date || !time) return null;

    const [hours, minutes] = time.split(':').map(Number);
    const combinedDate = new Date(date);
    combinedDate.setHours(hours, minutes, 0, 0);
    return combinedDate;
  }

  addRow() {
    const newRow: PlanningRow = {
      id: this.generateRowId(),
      selectedSegment: null,
      selectedVariation: null,
      stageData: {}
    };

    this.queueStages.forEach(stage => {
      newRow.stageData[stage] = {
        cohortIds: [],
        dates: []
      };
    });

    this.planningRows.push(newRow);
  }

  removeRow(rowId: string) {
    const confirmend = confirm('Are you sure want to delete this row?');
    if (!confirmend) {
      return
    }

    const index = this.planningRows.findIndex(row => row.id === rowId);
    if (index > -1) {
      this.planningRows.splice(index, 1);
    }
  }

  // addDateToStage(row: PlanningRow, stageName: string) {
  //   if (!row.stageData[stageName]) {
  //     row.stageData[stageName] = {
  //       cohortIds: [],
  //       dates: []
  //     };
  //   }
  //   row.stageData[stageName].dates.push({
  //     startdate: null,
  //     enddate: null,
  //     starttime: '09:00',
  //     endtime: '17:00',
  //     maxslot: 0,
  //     usedslot: 0,
  //     bigparticipants: [],
  //     participants: []
  //   });
  // }

  removeDateFromStage(row: PlanningRow, stageName: string, dateIndex: number) {
    const check = confirm('Are you sure want to remove the slot?');
    if (!check) {
      return null;
    } else {
      const dateRanges = row.stageData[stageName].dates;
      if (dateRanges.length > 0) {
        dateRanges.splice(dateIndex, 1);
        this.savePlanning();
      }
    }
  }

  isStageAvailableForVariation(row: PlanningRow, stageName: string): boolean {
    if (!row.selectedVariation) return false;

    const variation = this.queueVariationList.find(v => v.id === row.selectedVariation);
    if (!variation) return false;

    return variation.stages && variation.stages.includes(stageName);
  }

  getAvailableSegments(currentRowId: string): any[] {
    const currentRow = this.planningRows.find(row => row.id === currentRowId);
    if (!currentRow) return this.segmentList;

    const usedCombinations = this.planningRows
      .filter(row => row.id !== currentRowId && row.selectedSegment && row.selectedVariation)
      .map(row => `${row.selectedSegment}_${row.selectedVariation}`);

    return this.segmentList.filter(segment => {
      const combinationKey = `${segment.id}_${currentRow.selectedVariation}`;
      return !usedCombinations.includes(combinationKey);
    });
  }

  isSegmentDisabled(segmentId: string, currentRowId: string): boolean {
    const currentRow = this.planningRows.find(row => row.id === currentRowId);
    if (!currentRow) return true;

    if (!currentRow.selectedVariation) {
      return true;
    }

    const hasDuplicate = this.planningRows.some(row =>
      row.id !== currentRowId &&
      row.selectedSegment === segmentId &&
      row.selectedVariation === currentRow.selectedVariation
    );

    return hasDuplicate;
  }

  onSegmentChange(row: PlanningRow) {
    this.recalculateParticipantsForRow(row);
  }

  onVariationChange(row: PlanningRow) {
    this.recalculateParticipantsForRow(row);
  }

  // getSegmentName(segmentId: string): string {
  //   const segment = this.segmentList.find(s => s.id === segmentId);
  //   return segment ? segment['segmentname'] : segmentId;
  // }

  // Add this method to get segment tags
  getSegmentTags(segmentId: string): string[] {
    const segment = this.segmentList.find(s => s.id === segmentId);
    if (!segment || !segment['tagids']) return [];
    return segment['tagids'].map(tagId => this.getTagName(tagId));
  }

  // Update getSegmentName to handle deleted segments
  getSegmentName(segmentId: string): string {
    const segment = this.segmentList.find(s => s.id === segmentId);
    if (!segment) return 'Segment Deleted';
    return segment['segmentname'] || 'Segment Deleted';
  }

  checkSegmentVariationExists(segmentId: string, variationId: string, currentRowId: string): boolean {
    return this.planningRows.some(row =>
      row.id !== currentRowId &&
      row.selectedSegment === segmentId &&
      row.selectedVariation === variationId
    );
  }


  getVariationName(variationId: string): string {
    const variation = this.queueVariationList.find(v => v.id === variationId);
    return variation ? variation['variationname'] : '';
  }

  getCohortName(cohortId: string): string {
    const cohort = this.cohortsList.find(c => c.id === cohortId);
    return cohort ? cohort['cohortname'] || cohort['name'] || cohortId : cohortId;
  }

  getCohortsNames(cohortIds: string[]): string {
    if (!cohortIds || cohortIds.length === 0) return 'Cohorts Not Set';
    return cohortIds.map(id => this.getCohortName(id)).join(', ');
  }

  async showDraftSelectionDialog(draftDocs: any[]): Promise<any> {
    const drafts = draftDocs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const dialogRef = this.dialog.open(DraftQueuePlanningDialogComponent, {
      width: '600px',
      data: {
        drafts: drafts,
        profileid: this.profileid,
        queuename: this.selectedQueue['queuename']
      },
      disableClose: false
    });

    return dialogRef.afterClosed().toPromise();
  }

  async loadDraftFromFirestore(draftData: any) {
    try {
      this.currentDraftDocId = draftData.id;
      this.existingPlanningDocId = draftData.existingPlanningDocId;
      this.planningRows = this.deserializePlanningRows(draftData.planningRows);
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  }

  async clearDraft() {
    if (!this.currentDraftDocId) return;

    try {
      const draftRef = doc(this.firestore, 'queue planning draft', this.currentDraftDocId);
      await updateDoc(draftRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: this.profileid
      });

      this.currentDraftDocId = null;
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  }

  async saveDraft() {
    if (!this.selectedQueue) return;

    try {
      const draftDocId = this.currentDraftDocId || this.generateUniqueId();

      const draftData = {
        docid: draftDocId,
        queueid: this.selectedQueue['docid'],
        queuename: this.selectedQueue['queuename'],
        planningRows: this.serializePlanningRows(),
        deleted: false,
        updatedAt: serverTimestamp(),
        updatedby: this.guard.loggedinProfile['profileid'],
        updatedBy: this.profileid
      };

      if (!this.currentDraftDocId) {
        draftData['createdAt'] = serverTimestamp();
        draftData['createdBy'] = this.profileid;
      }

      const draftRef = doc(this.firestore, 'queue planning draft', draftDocId);
      await setDoc(draftRef, draftData);

      this.currentDraftDocId = draftDocId;
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  }

  serializePlanningRows(): any {
    return this.planningRows.map(row => ({
      ...row,
      stageData: Object.keys(row.stageData).reduce((acc, stageName) => {
        acc[stageName] = {
          cohortIds: row.stageData[stageName].cohortIds || [],
          dates: row.stageData[stageName].dates.map(date => ({
            startdate: date.startdate ? date.startdate.toISOString() : null,
            enddate: date.enddate ? date.enddate.toISOString() : null,
            starttime: date.starttime,
            endtime: date.endtime,
            maxslot: date.maxslot,
            usedslot: date.usedslot,
            bigparticipants: [],
            participants: []
          }))
        };
        return acc;
      }, {})
    }));
  }

  deserializePlanningRows(data: any): PlanningRow[] {
    return data.map(row => ({
      ...row,
      stageData: Object.keys(row.stageData).reduce((acc, stageName) => {
        acc[stageName] = {
          cohortIds: row.stageData[stageName].cohortIds || [],
          dates: row.stageData[stageName].dates.map(date => ({
            startdate: date.startdate ? new Date(date.startdate) : null,
            enddate: date.enddate ? new Date(date.enddate) : null,
            starttime: date.starttime || '09:00',
            endtime: date.endtime || '17:00',
            maxslot: date.maxslot || 0,
            usedslot: date.usedslot || 0,
            bigparticipants: [],
            participants: []
          }))
        };
        return acc;
      }, {})
    }));
  }

  async savePlanning() {
    const rowsToValidate = this.planningRows.filter(row => row.selectedSegment || row.selectedVariation);

    for (const row of rowsToValidate) {
      if (!row.selectedSegment) {
        alert('Please select a segment for all rows that have a variation selected');
        return;
      }
      if (!row.selectedVariation) {
        alert('Please select a variation for all rows that have a segment selected');
        return;
      }
    }

    const combinations = new Set<string>();
    for (const row of this.planningRows) {
      if (row.selectedSegment && row.selectedVariation) {
        const combinationKey = `${row.selectedSegment}_${row.selectedVariation}`;
        if (combinations.has(combinationKey)) {
          alert(`Duplicate combination found: ${this.getSegmentName(row.selectedSegment)} with ${this.getVariationName(row.selectedVariation)}. Each segment can only be used once per variation.`);
          return;
        }
        combinations.add(combinationKey);
      }
    }

    const loading = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Saving Queue Planning..."
      },
      disableClose: true
    });

    try {
      const docId = this.existingPlanningDocId || this.generateUniqueId();

      const variationMap = new Map<string, any[]>();

      this.planningRows.forEach(row => {
        if (row.selectedSegment && row.selectedVariation) {
          if (!variationMap.has(row.selectedVariation)) {
            variationMap.set(row.selectedVariation, []);
          }
          variationMap.get(row.selectedVariation).push(row);
        }
      });

      const planning = [];

      variationMap.forEach((rows, variationId) => {
        const variationPlanning = {
          variationid: variationId,
          segments: []
        };

        rows.forEach(row => {
          const stagecohort = [];
          Object.keys(row.stageData).forEach(stageName => {
            if (row.stageData[stageName].cohortIds && row.stageData[stageName].cohortIds.length > 0) {
              stagecohort.push({
                stagename: stageName,
                cohort: row.stageData[stageName].cohortIds
              });
            }
          });

          const slots = [];

          Object.keys(row.stageData).forEach(stageName => {
            row.stageData[stageName].dates.forEach(dateEntry => {
              if (dateEntry.startdate && dateEntry.enddate) {
                const startDateTime = this.combineDateAndTime(dateEntry.startdate, dateEntry.starttime);
                const endDateTime = this.combineDateAndTime(dateEntry.enddate, dateEntry.endtime);

                const bigparticipants = this.getBigParticipantsForSlot(
                  variationId,
                  row.selectedSegment,
                  stageName,
                  startDateTime,
                  endDateTime
                );

                const participants = this.getParticipantsForSlot(
                  variationId,
                  row.selectedSegment,
                  stageName,
                  startDateTime,
                  endDateTime
                );

                const slotObj: any = {
                  stagename: stageName,
                  startdate: Timestamp.fromDate(startDateTime),
                  enddate: Timestamp.fromDate(endDateTime),
                  maxslot: dateEntry.maxslot || 0,
                  usedslot: participants.length,
                  bigparticipants: bigparticipants.map(p => p.id)
                };

                slots.push(slotObj);
              }
            });
          });

          variationPlanning.segments.push({
            segmentid: row.selectedSegment,
            stagecohort: stagecohort,
            slots: slots
          });
        });

        if (variationPlanning.segments.length > 0) {
          planning.push(variationPlanning);
        }
      });

      const planningData = {
        docid: docId,
        queueid: this.selectedQueue['docid'],
        planning: planning,
        queueref: doc(this.firestore, 'queue generation', this.selectedQueue['docid']),
        segmentlist: Array.from(new Set(this.planningRows.map(r => r.selectedSegment).filter(s => s))),
        variationlist: Array.from(new Set(this.planningRows.map(r => r.selectedVariation).filter(v => v))),
        updatedAt: serverTimestamp()
      };

      if (!this.existingPlanningDocId) {
        planningData['createdAt'] = serverTimestamp();
      }

      const planningRef = doc(this.firestore, 'queue planning', docId);
      await setDoc(planningRef, planningData, { merge: true });

      this.existingPlanningDocId = docId;

      if (this.currentDraftDocId) {
        await this.clearDraft();
      }

      loading.close();
      this.guard.openSnackBar('Queue planning saved successfully', 'OK',600);

    } catch (error) {
      console.error('Error saving planning:', error);
      loading.close();
      alert('Error saving queue planning. Please try again.');
    }
  }

  generateUniqueId(): string {
    return doc(collection(this.firestore, 'queue planning')).id;
  }

  generateRowId(): string {
    return 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  editCohort(row: PlanningRow, stageName: string) {
    this.editingRow = row;
    this.editingStageName = stageName;
    this.editingCohort = true;
    this.editingCohortData = {
      cohortIds: [...(row.stageData[stageName].cohortIds || [])]
    };
  }

  saveCohortEdit() {
    if (this.editingRow && this.editingStageName) {
      this.editingRow.stageData[this.editingStageName].cohortIds = this.editingCohortData.cohortIds || [];

      this.savePlanning();

      this.editingRow = null;
      this.editingStageName = null;
      this.editingCohort = false;
    }
  }

  cancelCohortEdit() {
    this.editingRow = null;
    this.editingStageName = null;
    this.editingCohort = false;
  }

  editVariation(row: PlanningRow) {
    this.editingRowForVariation = row;
    this.editingVariationData = {
      selectedVariation: row.selectedVariation
    };

    const dialogRef = this.dialog.open(this.variationEditDialog, {
      width: '500px'
    });

    dialogRef.afterClosed().subscribe(() => {
      this.editingRowForVariation = null;
    });
  }

  // saveVariationEdit() {
  //   if (this.editingRowForVariation) {
  //     const oldVariation = this.editingRowForVariation.selectedVariation;
  //     const newVariation = this.editingVariationData.selectedVariation;

  //     if (!newVariation) {
  //       alert('Please select a variation');
  //       return;
  //     }

  //     this.editingRowForVariation.selectedVariation = newVariation;

  //     if (oldVariation !== newVariation && this.editingRowForVariation.selectedSegment) {
  //       const segmentStillValid = !this.isSegmentDisabled(
  //         this.editingRowForVariation.selectedSegment,
  //         this.editingRowForVariation.id
  //       );

  //       if (!segmentStillValid) {
  //         this.editingRowForVariation.selectedSegment = null;
  //         alert('Segment was cleared because it conflicts with the new variation selection.');
  //       }
  //     }

  //     if (oldVariation !== newVariation) {
  //       this.recalculateParticipantsForRow(this.editingRowForVariation);
  //     }

  //     this.dialog.closeAll();

  //     this.savePlanning();
  //   }
  // }

  saveVariationEdit() {
    if (this.editingRowForVariation) {
      const oldVariation = this.editingRowForVariation.selectedVariation;
      const newVariation = this.editingVariationData.selectedVariation;

      if (!newVariation) {
        alert('Please select a variation');
        return;
      }

      // Check if the combination already exists
      if (this.editingRowForVariation.selectedSegment) {
        const exists = this.checkSegmentVariationExists(
          this.editingRowForVariation.selectedSegment,
          newVariation,
          this.editingRowForVariation.id
        );

        if (exists) {
          alert(`The combination of ${this.getSegmentName(this.editingRowForVariation.selectedSegment)} and ${this.getVariationName(newVariation)} already exists in another row.`);
          return;
        }
      }

      this.editingRowForVariation.selectedVariation = newVariation;

      if (oldVariation !== newVariation && this.editingRowForVariation.selectedSegment) {
        const segmentStillValid = !this.isSegmentDisabled(
          this.editingRowForVariation.selectedSegment,
          this.editingRowForVariation.id
        );

        if (!segmentStillValid) {
          this.editingRowForVariation.selectedSegment = null;
          alert('Segment was cleared because it conflicts with the new variation selection.');
        }
      }

      if (oldVariation !== newVariation) {
        this.recalculateParticipantsForRow(this.editingRowForVariation);
      }

      this.dialog.closeAll();
      this.savePlanning();
    }
  }

  editSegment(row: PlanningRow) {
    if (!row.selectedVariation) {
      alert('Please select a variation first before selecting a segment.');
      return;
    }

    this.editingRowForSegment = row;
    this.editingSegmentData = {
      selectedSegment: row.selectedSegment
    };

    const dialogRef = this.dialog.open(this.segmentEditDialog, {
      width: '500px'
    });

    dialogRef.afterClosed().subscribe(() => {
      this.editingRowForSegment = null;
    });
  }

  saveSegmentEdit() {
    if (this.editingRowForSegment) {
      const oldSegment = this.editingRowForSegment.selectedSegment;
      const newSegment = this.editingSegmentData.selectedSegment;

      if (!newSegment) {
        alert('Please select a segment');
        return;
      }

      // Check if the combination already exists
      if (this.editingRowForSegment.selectedVariation) {
        const exists = this.checkSegmentVariationExists(
          newSegment,
          this.editingRowForSegment.selectedVariation,
          this.editingRowForSegment.id
        );

        if (exists) {
          alert(`The combination of ${this.getSegmentName(newSegment)} and ${this.getVariationName(this.editingRowForSegment.selectedVariation)} already exists in another row.`);
          return;
        }
      }

      this.editingRowForSegment.selectedSegment = newSegment;

      if (oldSegment !== newSegment) {
        this.recalculateParticipantsForRow(this.editingRowForSegment);
      }

      this.dialog.closeAll();
      this.savePlanning();
    }
  }

  // editDateEntry(row: PlanningRow, stageName: string, dateIndex: number) {
  //   this.editingRow = row;
  //   this.editingStageName = stageName;
  //   this.editingDateIndex = dateIndex;

  //   const dateEntry = row.stageData[stageName].dates[dateIndex];
  //   this.editingDateEntry = {
  //     startdate: dateEntry.startdate ? new Date(dateEntry.startdate) : null,
  //     enddate: dateEntry.enddate ? new Date(dateEntry.enddate) : null,
  //     starttime: dateEntry.starttime || '09:00',
  //     endtime: dateEntry.endtime || '17:00',
  //     maxslot: dateEntry.maxslot || 0,
  //     usedslot: dateEntry.usedslot || 0,
  //     bigparticipants: dateEntry.bigparticipants || [],
  //     participants: dateEntry.participants || []
  //   };

  //   const dialogRef = this.dialog.open(this.dateEditDialog, {
  //     width: '500px'
  //   });

  //   dialogRef.afterClosed().subscribe(() => {
  //     this.editingRow = null;
  //     this.editingStageName = null;
  //     this.editingDateIndex = null;
  //   });
  // }

  // saveDateEntry() {
  //   if (this.editingRow && this.editingStageName !== null && this.editingDateIndex !== null) {
  //     const startDateTime = this.combineDateAndTime(
  //       this.editingDateEntry.startdate,
  //       this.editingDateEntry.starttime
  //     );
  //     const endDateTime = this.combineDateAndTime(
  //       this.editingDateEntry.enddate,
  //       this.editingDateEntry.endtime
  //     );

  //     const bigparticipants = this.getBigParticipantsForSlot(
  //       this.editingRow.selectedVariation,
  //       this.editingRow.selectedSegment,
  //       this.editingStageName,
  //       startDateTime,
  //       endDateTime
  //     );

  //     const participants = this.getParticipantsForSlot(
  //       this.editingRow.selectedVariation,
  //       this.editingRow.selectedSegment,
  //       this.editingStageName,
  //       startDateTime,
  //       endDateTime
  //     );

  //     this.editingRow.stageData[this.editingStageName].dates[this.editingDateIndex] = {
  //       ...this.editingDateEntry,
  //       bigparticipants: bigparticipants,
  //       participants: participants,
  //       usedslot: participants.length
  //     };

  //     this.dialog.closeAll();

  //     this.savePlanning();
  //   }
  // }

  checkSlot(variationid: string, segmentid: string, stagename: string, slotstartdate: string | Date, slotenddate: string | Date): any | null {
    const toTime = (d: string | Date | undefined | null): number | null => {
      if (d === undefined || d === null) return null;
      const t = new Date(d).getTime();
      return Number.isNaN(t) ? null : t;
    };

    const startTs = toTime(slotstartdate);
    const endTs = toTime(slotenddate);

    if (startTs === null || endTs === null) return null;

    for (const planner of this.cohortQueuePlannerList || []) {
      const slots = planner.selectedslots || [];
      for (const slot of slots) {
        if (
          slot.stagename === stagename &&
          slot.variationid === variationid &&
          slot.segmentid === segmentid &&
          toTime(slot.startdate) === startTs &&
          toTime(slot.enddate) === endTs
        ) {
          return slot;
        }
      }
    }

    return null;
  }

  managelist() {
    const dialogRef = this.dialog.open(ManageParticipantlistDialogComponent, {
      width: '80vw',
      height: '85vh',
      data: [],
      autoFocus: false,
    });
  }

  // Update the createSlotMultipleSegments method
  createSlotMultipleSegments(stageName: string) {
  this.slotDialogMode = 'multi';
  this.editingStageName = stageName;
  
  // Reset the multi-slot data
  this.multiSlotData = {
    selectedStage: stageName,
    selectedSegments: [],
  };

  // Initialize editingDateEntry with the same data
  this.editingDateEntry = {
    startdate: null,
    enddate: null,
    starttime: '09:00',
    endtime: '17:00',
    maxslot: 0,
    usedslot: 0,
    bigparticipants: [],
    participants: [],
  };

  // Cache the available segments
  this.cacheAvailableSegments(stageName);

  // Use setTimeout to ensure the view is ready
  setTimeout(() => {
    const dialogRef = this.dialog.open(this.dateEditDialog, {
      width: '600px',
      maxHeight: '90vh',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(() => {
      this.searchSegmentForMulti = '';
      this.slotDialogMode = 'single';
      this.availableSegmentsCache = []; // Clear cache
    });
  }, 0);
}

cacheAvailableSegments(stageName: string) {
  if (!stageName) {
    this.availableSegmentsCache = [];
    return;
  }

  // Create a map of segments that exist in planning rows
  const segmentsInTable = new Map<string, {rowId: string, variationId: string}>();
  
  this.planningRows.forEach(row => {
    if (row.selectedSegment && row.selectedVariation) {
      // Check if this stage is available for this variation
      if (this.isStageAvailableForVariation(row, stageName)) {
        segmentsInTable.set(row.selectedSegment, {
          rowId: row.id,
          variationId: row.selectedVariation
        });
      }
    }
  });

  // Build the cache with ALL segments from segmentList
  this.availableSegmentsCache = this.segmentList.map(segment => {
    const inTable = segmentsInTable.get(segment.id);
    
    return {
      segmentId: segment.id,
      rowId: inTable ? inTable.rowId : null,
      variationId: inTable ? inTable.variationId : null,
      disabled: !inTable // Disable if not in table
    };
  });
}

// Update this method to use cached data with search filter
getFilteredSegmentsForMultiSlot(): Array<{rowId: string, segmentId: string, variationId: string, disabled: boolean}> {
  const searchTerm = this.searchSegmentForMulti?.toLowerCase() || '';
  
  if (!searchTerm) {
    return this.availableSegmentsCache;
  }

  return this.availableSegmentsCache.filter(segment => {
    const segmentName = this.getSegmentName(segment.segmentId).toLowerCase();
    const variationName = segment.variationId ? this.getVariationName(segment.variationId).toLowerCase() : '';
    
    return segmentName.includes(searchTerm) || variationName.includes(searchTerm);
  });
}

// Keep the old method name for backward compatibility but make it use the filtered version
getAvailableSegmentsForMultiSlot(): Array<{rowId: string, segmentId: string, variationId: string, disabled: boolean}> {
  return this.getFilteredSegmentsForMultiSlot();
}

  // Update the addDateToStage method to use single mode
  addDateToStage(row: PlanningRow, stageName: string) {
    this.slotDialogMode = 'single';
    this.editingRow = row;
    this.editingStageName = stageName;
    this.editingDateIndex = null; // null means we're adding, not editing

    if (!row.stageData[stageName]) {
      row.stageData[stageName] = {
        cohortIds: [],
        dates: []
      };
    }

    // Initialize with default values for new slot
    this.editingDateEntry = {
      startdate: null,
      enddate: null,
      starttime: '09:00',
      endtime: '17:00',
      maxslot: 0,
      usedslot: 0,
      bigparticipants: [],
      participants: []
    };

    const dialogRef = this.dialog.open(this.dateEditDialog, {
      width: '500px'
    });

    dialogRef.afterClosed().subscribe(() => {
      this.editingRow = null;
      this.editingStageName = null;
      this.editingDateIndex = null;
      this.slotDialogMode = 'single';
    });
  }

  // Update the editDateEntry method to use single mode
  editDateEntry(row: PlanningRow, stageName: string, dateIndex: number) {
    this.slotDialogMode = 'single';
    this.editingRow = row;
    this.editingStageName = stageName;
    this.editingDateIndex = dateIndex;

    const dateEntry = row.stageData[stageName].dates[dateIndex];
    this.editingDateEntry = {
      startdate: dateEntry.startdate ? new Date(dateEntry.startdate) : null,
      enddate: dateEntry.enddate ? new Date(dateEntry.enddate) : null,
      starttime: dateEntry.starttime || '09:00',
      endtime: dateEntry.endtime || '17:00',
      maxslot: dateEntry.maxslot || 0,
      usedslot: dateEntry.usedslot || 0,
      bigparticipants: dateEntry.bigparticipants || [],
      participants: dateEntry.participants || []
    };

    const dialogRef = this.dialog.open(this.dateEditDialog, {
      width: '500px'
    });

    dialogRef.afterClosed().subscribe(() => {
      this.editingRow = null;
      this.editingStageName = null;
      this.editingDateIndex = null;
      this.slotDialogMode = 'single';
    });
  }

  // Update saveDateEntry to handle both adding and editing
  saveDateEntry() {
    if (this.editingRow && this.editingStageName !== null) {
      const startDateTime = this.combineDateAndTime(
        this.editingDateEntry.startdate,
        this.editingDateEntry.starttime
      );
      const endDateTime = this.combineDateAndTime(
        this.editingDateEntry.enddate,
        this.editingDateEntry.endtime
      );

      if (!startDateTime || !endDateTime) {
        alert('Please select valid start and end dates');
        return;
      }

      if (endDateTime <= startDateTime) {
        alert('End date/time must be after start date/time');
        return;
      }

      const bigparticipants = this.getBigParticipantsForSlot(
        this.editingRow.selectedVariation,
        this.editingRow.selectedSegment,
        this.editingStageName,
        startDateTime,
        endDateTime
      );

      const participants = this.getParticipantsForSlot(
        this.editingRow.selectedVariation,
        this.editingRow.selectedSegment,
        this.editingStageName,
        startDateTime,
        endDateTime
      );

      const newDateEntry = {
        ...this.editingDateEntry,
        bigparticipants: bigparticipants,
        participants: participants,
        usedslot: participants.length
      };

      if (this.editingDateIndex !== null) {
        // Editing existing slot
        this.editingRow.stageData[this.editingStageName].dates[this.editingDateIndex] = newDateEntry;
      } else {
        // Adding new slot - check for duplicates
        const isDuplicate = this.editingRow.stageData[this.editingStageName].dates.some(dateEntry => {
          const existingStart = this.combineDateAndTime(dateEntry.startdate, dateEntry.starttime);
          const existingEnd = this.combineDateAndTime(dateEntry.enddate, dateEntry.endtime);
          
          return existingStart?.getTime() === startDateTime?.getTime() && 
                existingEnd?.getTime() === endDateTime?.getTime();
        });

        if (isDuplicate) {
          alert('A slot with the same date and time already exists for this stage');
          return;
        }

        // Add new slot
        this.editingRow.stageData[this.editingStageName].dates.push(newDateEntry);
      }

      this.dialog.closeAll();
      this.savePlanning();
    }
  }

  // Keep the saveMultiSegmentSlot method as is
  saveMultiSegmentSlot() {
    if (!this.isMultiSlotDataValid()) {
      alert('Please fill in all required fields');
      return;
    }

    // Use editingDateEntry values for the slot data
    const startDateTime = this.combineDateAndTime(this.editingDateEntry.startdate, this.editingDateEntry.starttime);
    const endDateTime = this.combineDateAndTime(this.editingDateEntry.enddate, this.editingDateEntry.endtime);

    if (!startDateTime || !endDateTime) {
      alert('Please select valid start and end dates');
      return;
    }

    if (endDateTime <= startDateTime) {
      alert('End date/time must be after start date/time');
      return;
    }

    const stageName = this.editingStageName;
    let slotsCreated = 0;
    let skippedDuplicates = 0;
    
    // Create slots for all selected segments - ONLY for the selected stage
    this.multiSlotData.selectedSegments.forEach(rowId => {
      const row = this.planningRows.find(r => r.id === rowId);
      
      if (row) {
        // Double-check stage is available for this variation
        if (!this.isStageAvailableForVariation(row, stageName)) {
          console.warn(`Stage ${stageName} is not available for variation ${this.getVariationName(row.selectedVariation)}`);
          return;
        }

        // Initialize stage data if it doesn't exist
        if (!row.stageData[stageName]) {
          row.stageData[stageName] = {
            cohortIds: [],
            dates: []
          };
        }

        // Check for duplicate slots
        const isDuplicate = row.stageData[stageName].dates.some(dateEntry => {
          const existingStart = this.combineDateAndTime(dateEntry.startdate, dateEntry.starttime);
          const existingEnd = this.combineDateAndTime(dateEntry.enddate, dateEntry.endtime);
          
          return existingStart?.getTime() === startDateTime?.getTime() && 
                existingEnd?.getTime() === endDateTime?.getTime();
        });

        if (isDuplicate) {
          console.warn(`Duplicate slot exists for ${this.getSegmentName(row.selectedSegment)} at ${stageName}`);
          skippedDuplicates++;
          return;
        }

        // Calculate participants for this slot
        const bigparticipants = this.getBigParticipantsForSlot(
          row.selectedVariation,
          row.selectedSegment,
          stageName,
          startDateTime,
          endDateTime
        );

        const participants = this.getParticipantsForSlot(
          row.selectedVariation,
          row.selectedSegment,
          stageName,
          startDateTime,
          endDateTime
        );

        // Add the new slot - ONLY to this specific stage
        row.stageData[stageName].dates.push({
          startdate: new Date(this.editingDateEntry.startdate),
          enddate: new Date(this.editingDateEntry.enddate),
          starttime: this.editingDateEntry.starttime,
          endtime: this.editingDateEntry.endtime,
          maxslot: this.editingDateEntry.maxslot,
          usedslot: participants.length,
          bigparticipants: bigparticipants,
          participants: participants
        });

        slotsCreated++;
      }
    });

    this.dialog.closeAll();

    if (slotsCreated > 0) {
      let message = `Successfully created ${slotsCreated} slot(s) for stage "${stageName}"`;
      if (skippedDuplicates > 0) {
        message += ` (${skippedDuplicates} duplicate(s) skipped)`;
      }
      this.guard.openSnackBar(message, 'OK',600);
      this.savePlanning();
    } else {
      if (skippedDuplicates > 0) {
        alert(`No new slots were created. ${skippedDuplicates} duplicate slot(s) were found.`);
      } else {
        alert('No slots were created. Please check the console for warnings.');
      }
    }
  }

  // Update isMultiSlotDataValid to use editingDateEntry
  isMultiSlotDataValid(): boolean {
    return !!(
      this.editingStageName &&
      this.multiSlotData.selectedSegments?.length > 0 &&
      this.editingDateEntry.startdate &&
      this.editingDateEntry.enddate &&
      this.editingDateEntry.starttime &&
      this.editingDateEntry.endtime &&
      this.editingDateEntry.maxslot >= 0
    );
  }

  getSegmentNameByRowId(rowId: string): string {
    const row = this.planningRows.find(r => r.id === rowId);
    return row ? this.getSegmentName(row.selectedSegment) : '';
  }

  getVariationNameByRowId(rowId: string): string {
    const row = this.planningRows.find(r => r.id === rowId);
    return row ? this.getVariationName(row.selectedVariation) : '';
  }

  removeSegmentFromMultiSlot(rowId: string) {
    this.multiSlotData.selectedSegments = this.multiSlotData.selectedSegments.filter(id => id !== rowId);
  }

  getConfirmedParticipantsCount(segmentId: string, variationId: string): number {
    return this.getConfirmedParticipantsForSegmentVariation(segmentId, variationId).length;
  }

  getConfirmedParticipantsForSegmentVariation(segmentId: string, variationId: string): any[] {
    if (!segmentId || !variationId || !this.queueTokenList) {
      return [];
    }

    const confirmedParticipants: any[] = [];

    this.queueTokenList.forEach(token => {
      if (token.variationid === variationId) {
        const stageSlots = token.selectedstageslot || {};
        
        // Check if any stage has this segment selected
        Object.keys(stageSlots).forEach(stageName => {
          const slot = stageSlots[stageName];
          if (slot && slot.segmentid === segmentId) {
            // Add participant with their slot details
            confirmedParticipants.push({
              ...token,
              selectedStage: stageName,
              selectedSlot: slot
            });
          }
        });
      }
    });

    return confirmedParticipants;
  }

  showConfirmedParticipants(segmentId: string, variationId: string) {
    this.panelType = 'used-slots';
    this.panelTitle = 'Confirmed Participants';
    this.currentSlotInfo = {
      segmentId: segmentId,
      variationId: variationId,
      segmentName: this.getSegmentName(segmentId),
      variationName: this.getVariationName(variationId)
    };
    this.showParticipantPanel = true;
    this.loadingParticipants = false;
    this.nonSelectedParticipants = [];

    const confirmedParticipants = this.getConfirmedParticipantsForSegmentVariation(segmentId, variationId);

    confirmedParticipants.forEach((participant) => {
      const slot = participant.selectedSlot;
      const startDate = slot.startdate?.toDate ? slot.startdate.toDate() : new Date(slot.startdate);
      const endDate = slot.enddate?.toDate ? slot.enddate.toDate() : new Date(slot.enddate);

      this.nonSelectedParticipants.push({
        participantId: participant.profile_id,
        participantData: {
          id: participant.profile_id,
          name: this.getProfileName(participant.profile_id),
          email: this.mapProfileData[participant.profile_id]?.email || '',
          phone: this.mapProfileData[participant.profile_id]?.phone || '',
          tokenstatus: participant.tokenstatus,
          currentstage: participant.currentstage,
          selectedStage: participant.selectedStage,
          slotStartDate: startDate,
          slotEndDate: endDate,
          slotStartTime: this.formatTimeTo12Hour(this.formatTimeTo24Hour(startDate)),
          slotEndTime: this.formatTimeTo12Hour(this.formatTimeTo24Hour(endDate)),
          segmentName: this.getSegmentName(segmentId),
          variationName: this.getVariationName(variationId),
          ...participant
        },
        selected: true
      });
    });
  }

}