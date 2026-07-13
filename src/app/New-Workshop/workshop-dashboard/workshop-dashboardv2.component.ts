import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';
import { RouterModule } from '@angular/router';
import {
  Firestore, collection, doc, query, where,
  updateDoc, Timestamp, Unsubscribe,
  getDoc, getDocs, onSnapshot, getFirestore, documentId,
} from '@angular/fire/firestore';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthguardService } from '../../authguard.service';
import { MatDialog } from '@angular/material/dialog';
import { debounceTime, firstValueFrom, Subject, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment.development';
import { HttpClient } from '@angular/common/http';
import { SnackbarService } from '../../shared/snackbar.service';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { WhatsAppProgressData, WhatsappProgressDialogComponent } from '../whatsapp-progress-dialog.component';

@Component({
  selector: 'app-workshop-dashboardv2',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatCheckboxModule,
    MatProgressSpinnerModule, MatProgressBarModule, MatTableModule,
    MatPaginatorModule, MatSortModule, MatChipsModule, MatExpansionModule, MatSnackBarModule,
    MatListModule, MatTooltipModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    RouterModule, MatMenuModule, MatRadioModule, FormsModule, MatSelectModule
  ],
  templateUrl: './workshop-dashboardv2.component.html',
  styleUrls: ['./workshop-dashboardv2.component.css']
})
export class WorkshopDashboardV2Component implements OnInit, OnDestroy {
  @ViewChild(MatPaginator, { static: false }) paginator!: MatPaginator;
  @ViewChild(MatSort, { static: false }) sort!: MatSort;
  @ViewChild('participantDataSection', { static: false }) participantDataSection!: ElementRef;

  showParticipantPanel = false;
  selectedParticipants: any[] = [];
  selectedStatusInfo: any = null;

  // Evergreen-only referral metrics (workshopreferral collection)
  shareClickedProfileIds: string[] = [];
  shareClaimedProfileIds: string[] = [];
  // profileid -> name for referral sharers (resolved from profile_data,
  // since sharers are not necessarily enrolled and so aren't in mapProfile)
  shareProfileNames: { [id: string]: string } = {};
  // claimed sharer profileid -> their referralcode (used to find who enrolled via that code)
  shareClaimedReferralByProfile: { [id: string]: string } = {};

  // Evergreen day-journey distribution (only when evergreenWorkshop === true).
  // Each participant's "day" = floor((now - enrollmentdate) / 24h) + 1, exact to the second.
  evergreenDayDistribution: { day: number; count: number; profileIds: string[] }[] = [];
  evergreenCompletedBucket: { day: number; count: number; profileIds: string[]; completed: boolean } =
    { day: -1, count: 0, profileIds: [], completed: true };
  evergreenDayTotal = 0;

  selectedParticipantData: any = null;
  participantWorkshopData: any = null;
  loadingParticipantWorkshop = false;
  participantWorkshopError: string | null = null;

  displayChallenges: any[] = [];
  workshopTitle = '';
  workshopDescription = '';
  workshopType = '';
  workshopStartDateFormatted = '';
  workshopEndDateFormatted = '';

  workshopId: string | null = null;
  workshopData: any = null;
  enrolledParticipants: any[] = [];
  participantProgressList: any[] = [];
  challengeStatistics: any[] = [];
  objectKeys = Object.keys;
  dataSource = new MatTableDataSource<any>([]);
  displayedColumns: string[] = [
    'participantId', 'type', 'currentChallenge', 'progress', 'completed',
    'total', 'status', 'action', 'assignment'
  ];

  selectedJourneyFilters: string[] = [];
  selectedTierFilters: string[] = [];
  selectedCategoryFilters: string[] = [];
  selectedEnrollmentStatusFilters: string[] = [];
  selectedNotStartedTypeFilters: string[] = [];
  metrics = new Map<string, string[]>([
    ['totalEnrolled', []],
    ['totalStarted', []],
    ['notStarted', []],
    ['activeParticipants', []],
    ['completedParticipants', []],
  ]);
  filterOption: 'all' | 'new' | 'old' = 'all';
  cohortTypeFilter: 'all' | 'facilitator' | 'cohort' = 'all';
  filteredParticipants: any[] = [];
  loggedinProfile: string = null;
  mapProfile: any = {};
  mapProfileNew: any = {};
  loading = true;
  error: string | null = null;
  isMovingParticipant: string | null = null;

  subscriberCodes: string[] = [];
  selectedSubscriberCode: string[] = [];
  showReferredOnly: boolean = false;
  allSelected = false;

  unsubscribes: Unsubscribe[] = [];
  private destroyed = false;
  private destroy$ = new Subject<void>();
  private recalculateSubject$ = new Subject<void>();
  journeyData: any[] = [];

  statusDisplayMap = new Map([
    ['completed', 'Completed'], ['inreview', 'In Review'], ['rework', 'Rework Required'],
    ['readyformobile', 'Ready for Mobile'], ['inprogress', 'In Progress'], ['notstarted', 'Not Started'],
    ['enrolled', 'All Enrolled'], ['activeParticipants', 'Active Participants'],
    ['totalEnrolled', 'Total Enrolled'], ['totalStarted', 'Total Started'], ['notStarted', 'Not Started'],
    ['notstartedcurrent', 'Ready to Start']
  ]);

  statusIconMap = new Map([
    ['completed', 'check_circle'], ['inreview', 'visibility'], ['rework', 'refresh'],
    ['readyformobile', 'phone_android'], ['inprogress', 'schedule'], ['notstarted', 'pause'],
    ['enrolled', 'group'], ['activeParticipants', 'trending_up'], ['totalEnrolled', 'group']
  ]);

  JourneyMap = {};
  tierMap = {};
  assignmentsList: any[] = [];
  selectedAssignment: any = null;
  assignmentParticipants: any[] = [];
  private isCalculating = false;
  private pendingRecalculation = false;
  private participantDataCache = new Map<string, any>();
  private participantWorkshopMap = new Map<string, any>();
  challengeForms: any[] = [];
  // cp workshop
  categoryWiseEnrolled: { categoryId: string; categoryName: string; count: number; profileIds: string[] }[] = [];
  categoryNamesMap: Map<string, string> = new Map();
  loadingCategories = false;
  selectedCategoryFilter: string = 'all';
  tableTypeFilter: string = 'all';
  tableStatusFilter: string = 'all';
  cohortParticipantCount: number = 0;
  cohortParticipantProfileIds: string[] = [];
  participantCohortMap: Map<string, boolean> = new Map();
  participantWorkshopCategoryMap: Map<string, string> = new Map();
  facilitatorProfileIds: string[] = [];
  facilitatorCount: number = 0;
  categoryBasedMetrics: {
    overallAvgProgress: number;
    overallCompletionRate: number;
    categoryProgress: { categoryId: string; categoryName: string; avgProgress: number; completionRate: number; completedCount: number; totalCount: number }[];
    cohortAvgProgress: number;
    cohortCompletionRate: number;
    cohortCompletedCount: number;
    facilitatorAvgProgress: number;
    facilitatorCompletionRate: number;
    facilitatorCompletedCount: number;
    totalActive: number;
    totalActiveProfileIds: string[];
    totalCompleted: number;
    totalCompletedProfileIds: string[];
    totalNotStarted: number;
    totalNotStartedProfileIds: string[];
  } = {
      overallAvgProgress: 0,
      overallCompletionRate: 0,
      categoryProgress: [],
      cohortAvgProgress: 0,
      cohortCompletionRate: 0,
      cohortCompletedCount: 0,
      facilitatorAvgProgress: 0,
      facilitatorCompletionRate: 0,
      facilitatorCompletedCount: 0,
      totalActive: 0,
      totalActiveProfileIds: [],
      totalCompleted: 0,
      totalCompletedProfileIds: [],
      totalNotStarted: 0,
      totalNotStartedProfileIds: []
    };
  firestoreDefault = getFirestore()
  firestoreForms = getFirestore('firestore-forms')

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private guard: AuthguardService,
    public dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private http: HttpClient,
    private snackbarService: SnackbarService,
  ) {
    this.initializeProfileData();
    this.initializeJourneyData();
    this.setupRecalculationDebounce();
  }

  async getParticipantMetaMapForIds(profileIds: string[]) {
    var docdata = {};
    var map = {};
    var list = [];
    const BATCH_SIZE = 30;
    const batches: Promise<any>[] = [];
    for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
      const batchIds = profileIds.slice(i, i + BATCH_SIZE);
      const q = query(
        collection(this.firestoreDefault, 'participant metadata'),
        where('profileid', 'in', batchIds)
      );
      batches.push(getDocs(q));
    }

    const results = await Promise.all(batches);

    for (const snap of results) {
      for (const doc of snap.docs) {
        docdata[doc.id] = doc.data();
        map[doc.id] = doc.data()['name'];
        list.push({ name: doc.data()['name'], id: doc.id });
      }
    }

    return { docdata, map, list };
  }

  // new_user_data is loaded once (not live) — it drives only the peripheral
  // New Users counts and is a large, growing collection.
  private async initializeProfileData() {
    try {
      const userRef = collection(this.firestoreDefault, 'new_user_data');
      const userSnap = await getDocs(userRef);
      this.mapProfileNew = {};
      userSnap.forEach(doc => {
        const data = doc.data();
        data['id'] = doc.id;
        this.mapProfileNew[data['id']] = data;
      });
    } catch (err) {
      console.error('Error fetching new_user_data:', err);
    }
  }

  private initializeJourneyData() {
    const journeyRef = collection(this.firestoreDefault, 'journey');
    getDocs(journeyRef).then(snap => {
      snap.docs.forEach(e => {
        const element = e.data();
        element['id'] = e.id;
        this.JourneyMap[element['id']] = element['journey'];
      });
    });
    const tierRef = collection(this.firestoreDefault, 'tier');
    getDocs(tierRef).then(snaptier => {
      snaptier.docs.forEach(e => {
        const element = e.data();
        element['id'] = e.id;
        this.tierMap[element['id']] = element['tier'];
      });
    });
  }

  private setupRecalculationDebounce() {
    this.recalculateSubject$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => { this.performRecalculation(); });
  }

  async ngOnInit() {
    try {
      this.filteredParticipants = this.selectedParticipants;
      const roles = await this.guard.getRoles();
      this.loggedinProfile = roles["profile_ref"].id;
    } catch (error) {
      console.error("Error loading profile:", error);
    }
    this.workshopId = this.route.snapshot.paramMap.get('id');
    if (!this.workshopId) {
      this.workshopId = this.route.snapshot.queryParamMap.get('workshopId');
    }

    if (this.workshopId) {
      console.log('load dashboard....');
      this.loadWorkshopDashboard();
      this.loadSubscriberCodes();
    }
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.setupFilterPredicate();
  }

  private setupFilterPredicate() {
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const searchStr = filter.toLowerCase();
      const participantName = (this.mapProfile[data.profileid]?.['name'] || '').toLowerCase();

      let currentChallengeName = '';
      if (this.workshopData?.challenges[data.currentChallengeIndex]) {
        const challenge = this.workshopData.challenges[data.currentChallengeIndex];
        if (challenge.type === 'challenge' && challenge.challenges?.[data.currentSubChallengeIndex]) {
          currentChallengeName = challenge.challenges[data.currentSubChallengeIndex].name.toLowerCase();
        } else if (challenge.type === 'zoomcall') {
          currentChallengeName = `${challenge.heading}: ${challenge.subheading}`.toLowerCase();
        }
      }

      const status = data.progressPercentage === 100 ? 'completed' :
        data.progressPercentage > 0 ? 'active' : 'not started';
      const statusStr = status.toLowerCase();

      return participantName.includes(searchStr) ||
        currentChallengeName.includes(searchStr) ||
        statusStr.includes(searchStr) ||
        data.profileid.toLowerCase().includes(searchStr) ||
        data.completedChallenges.toString().includes(searchStr) ||
        data.totalChallenges.toString().includes(searchStr) ||
        data.progressPercentage.toString().includes(searchStr);
    };
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.clearSelectedParticipant();
    // Tear down every live Firestore listener (workshop config, enrolled,
    // participant workshop, and referral for evergreen). Guarded so one bad
    // unsubscribe can't leave the rest attached.
    this.unsubscribes.forEach(unsubscribe => {
      try { unsubscribe(); } catch (e) { console.error('unsubscribe failed', e); }
    });
    this.unsubscribes = [];
    this.destroy$.next();
    this.destroy$.complete();
    this.participantDataCache.clear();
    this.participantWorkshopMap.clear();
  }

  updateDataSource(data: any[]) {
    this.ngZone.run(() => {
      this.dataSource.data = data;
      if (this.paginator) {
        this.dataSource.paginator = this.paginator;
        this.paginator.firstPage();
      }
      this.cdr.detectChanges();
    });
  }

  async loadWorkshopDashboard() {
    try {
      this.loading = true;
      this.error = null;
      this.setupWorkshopSnapshot();
    } catch (error) {
      console.error('Error loading workshop dashboard:', error);
      this.error = 'Failed to load workshop dashboard data';
      this.loading = false;
    }
  }

  async setupWorkshopSnapshot() {
    if (!this.workshopId) return;

    let enrolledSnapshotInitialized = false;
    let referralSnapshotInitialized = false;

    const workshopRef = doc(this.firestoreDefault, 'workshopconfiguration', this.workshopId);
    const unsubscribe = onSnapshot(workshopRef, (docSnap) => {
      if (this.destroyed) return;
      if (docSnap.exists()) {
        this.workshopData = { ...docSnap.data(), docid: docSnap.id };
        this.updateWorkshopDisplayData();
        this.triggerRecalculation();

        if (this.workshopData.categorybased === true) {
          this.loadCategoryNames();
        }

        if (this.workshopData.evergreenWorkshop === true && !referralSnapshotInitialized) {
          referralSnapshotInitialized = true;
          this.setupWorkshopReferralSnapshot();
        }

        if (!enrolledSnapshotInitialized) {
          enrolledSnapshotInitialized = true;
          this.setupParticipantWorkshopSnapshot();
          this.setupEnrolledParticipantsSnapshot();
        }
      } else {
        this.error = 'Workshop not found';
        this.loading = false;
      }
    }, (error) => {
      this.error = `Error loading workshop: ${error.message}`;
      this.loading = false;
    });

    this.unsubscribes.push(unsubscribe);
  }

  // Evergreen only: live counts of share referrals for this workshop.
  // Share Clicked = docs with no/0 `claimed`; Share Claimed = docs with `claimed > 0`.
  setupWorkshopReferralSnapshot() {
    if (!this.workshopId) return;
    const workshopRef = doc(this.firestoreDefault, 'workshopconfiguration', this.workshopId);
    const referralQuery = query(
      collection(this.firestoreDefault, 'workshopreferral'),
      where('workshopref', '==', workshopRef)
    );
    const unsubscribe = onSnapshot(referralQuery, async (snap) => {
      const clicked: string[] = [];
      const claimed: string[] = [];
      const referralByProfile: { [id: string]: string } = {};
      snap.forEach(d => {
        const data: any = d.data();
        if (!data?.profileid) return;
        const claimedCount = Number(data?.claimed) || 0; // missing/0 => 0
        if (claimedCount > 0) {
          claimed.push(data.profileid);
          if (data?.referralcode) referralByProfile[data.profileid] = data.referralcode;
        } else {
          clicked.push(data.profileid);
        }
      });
      this.shareClickedProfileIds = clicked;
      this.shareClaimedProfileIds = claimed;
      this.shareClaimedReferralByProfile = referralByProfile;
      // Referral sharers may not be enrolled, so resolve their names from profile_data.
      const names = await this.getProfileNameMapForIds([...clicked, ...claimed]);
      if (this.destroyed) return; // component torn down while awaiting
      this.shareProfileNames = names;
    }, (err) => console.error('workshopreferral snapshot error', err));

    this.unsubscribes.push(unsubscribe);
  }

  // Batched profileid -> name lookup from the full profile_data directory.
  async getProfileNameMapForIds(profileIds: string[]): Promise<{ [id: string]: string }> {
    const nameMap: { [id: string]: string } = {};
    const uniqueIds = [...new Set(profileIds)].filter(Boolean);
    if (uniqueIds.length === 0) return nameMap;
    const BATCH_SIZE = 30; // Firestore 'in' query limit
    const batches: Promise<any>[] = [];
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
      const batchIds = uniqueIds.slice(i, i + BATCH_SIZE);
      const q = query(
        collection(this.firestoreDefault, 'profile_data'),
        where(documentId(), 'in', batchIds)
      );
      batches.push(getDocs(q));
    }
    const results = await Promise.all(batches);
    for (const snap of results) {
      for (const d of snap.docs) {
        nameMap[d.id] = d.data()?.['name'] || 'Unknown';
      }
    }
    return nameMap;
  }

  async loadSubscriberCodes(): Promise<void> {
    try {
      const ref = doc(this.firestoreDefault, 'static meta data', 'Subscriber Code');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
       this.subscriberCodes = Array.isArray(data?.['codes'])? [...data['codes']].reverse(): [];
      }
    } catch (error) {
      console.error('Error:'+ error);
    }
  }

  onCodeSelectionChange(event: any) {
    const selectedValues = event.value;
    const isAllSelected =
      selectedValues.includes('ALL');
    if (isAllSelected) {
      if (this.selectedSubscriberCode.length === this.subscriberCodes.length + 1) {
        this.selectedSubscriberCode = [];
      } else {
        this.selectedSubscriberCode = [
          'ALL',
          ...this.subscriberCodes
        ];

      }
    } else {
      this.selectedSubscriberCode =
        selectedValues.filter(
          (x: string) => x !== 'ALL'
        );

    }
    this.applyFilterSide();
  }

  async sendMail() {
    const { SendmessagesComponent } = await import('./sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'mail' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleDialogResult(result);
    });
  }

  async sendWatti() {
    const { SendmessagesComponent } = await import('./sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'whatsapp' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleWhatsappChunked(result);
    });
  }

  private readonly WHATSAPP_CHUNK_SIZE = 200;
  private readonly CHUNK_DELAY_MS = 1000;

  private async handleWhatsappChunked(result: any) {
    if (result?.action !== 'sent' || result.type !== 'whatsapp') {
      return;
    }

    const { templateName, customParams } = result;
    const participants = this.filteredParticipants
      .filter(participant => {
        const metadata = participant['metadata'];
        return metadata && metadata['phonenumber'] && metadata['name'];
      })
      .map(participant => {
        const metadata = participant['metadata'];
        const name = metadata['name'];
        let cc = metadata['countryCode'] || metadata['countrycode'] || '';
        cc = cc.trim();
        if (cc && !cc.startsWith('+')) cc = '+' + cc;
        let phone = metadata['phonenumber']?.toString().trim() || '';
        phone = phone.replace(/^\+/, '');
        const phonenumber = cc ? `${cc}${phone}` : phone;
        const processedParams = customParams.map((param: any) => ({
          name: param.name,
          value: param.value.replace(/\{\{name\}\}/g, name)
        }));
        return { phonenumber, name, customParams: processedParams };
      });

    if (participants.length === 0) {
      this.snackbarService.show('No valid participants found');
      return;
    }

    const progressDialog = this.dialog.open(WhatsappProgressDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        totalParticipants: participants.length,
        templateName: templateName
      } as WhatsAppProgressData
    });
    const progressComponent = progressDialog.componentInstance;
    const chunks = this.chunkArray(participants, this.WHATSAPP_CHUNK_SIZE);
    const totalChunks = chunks.length;
    progressComponent.updateProgress({ totalChunks });

    let totalSuccess = 0;
    let totalFailed = 0;
    let allErrors: string[] = [];
    let isCancelled = false;
    const cancelSubscription = progressComponent.cancel$.subscribe(() => {
      isCancelled = true;
    });

    const url = this.getCloudFunctionUrl('workshopprogressmessage');
    for (let i = 0; i < chunks.length; i++) {
      if (isCancelled) {
        console.log('Sending cancelled by user');
        break;
      }

      const chunk = chunks[i];
      const chunkIndex = i + 1;

      progressComponent.updateProgress({
        currentChunk: chunkIndex,
        isProcessingChunk: true
      });

      try {
        const chunkPayload = {
          type: 'whatsapp',
          templateName,
          participants: chunk,
          chunkInfo: {
            chunkIndex,
            totalChunks,
            chunkSize: chunk.length
          }
        };

        const response = await firstValueFrom(
          this.http.post<any>(url, chunkPayload, { responseType: 'json' })
        );

        console.log(`Chunk ${chunkIndex}/${totalChunks} response:`, response);
        const chunkSuccess = response.successCount || chunk.length;
        const chunkFailed = response.failureCount || 0;
        totalSuccess += chunkSuccess;
        totalFailed += chunkFailed;
        if (response.errors && Array.isArray(response.errors)) {
          allErrors = [...allErrors, ...response.errors];
        }

        progressComponent.updateProgress({
          processedCount: totalSuccess + totalFailed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          isProcessingChunk: false,
          errors: response.errors || [],
          watiErrors: response.watiErrors || []
        });

      } catch (error: any) {
        console.error(`Failed to send chunk ${chunkIndex}:`, error);
        totalFailed += chunk.length;
        const errorMessage = `Chunk ${chunkIndex} failed: ${error.message || 'Unknown error'}`;
        allErrors.push(errorMessage);

        progressComponent.updateProgress({
          processedCount: totalSuccess + totalFailed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          isProcessingChunk: false,
          errors: [errorMessage]
        });
      }
      if (i < chunks.length - 1 && !isCancelled) {
        await this.delay(this.CHUNK_DELAY_MS);
      }
    }
    cancelSubscription.unsubscribe();

    let finalStatus: 'success' | 'partial' | 'error';
    if (isCancelled) {
      finalStatus = totalSuccess > 0 ? 'partial' : 'error';
    } else if (totalFailed === 0) {
      finalStatus = 'success';
    } else if (totalSuccess > 0) {
      finalStatus = 'partial';
    } else {
      finalStatus = 'error';
    }
    progressComponent.complete(finalStatus);
    const dialogResult = await firstValueFrom(progressDialog.afterClosed());
    console.log('Final sending result:', dialogResult);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCloudFunctionUrl(functionName: string): string {
    const projectId = environment.firebase.projectId;
    const projectUrlMap: Record<string, string> = {
      'test-environment-841c3': `https://us-central1-test-environment-841c3.cloudfunctions.net/${functionName}`,
      'starlabs-test': `https://us-central1-starlabs-test.cloudfunctions.net/${functionName}`,
      'fir-sample-aae4a': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
      'launch-your-legacy-development': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
    };
    return projectUrlMap[projectId] || '';
  }

  private async handleDialogResult(result: any) {
    if (result?.action === 'sent') {
      if (result.type === 'mail') {
        const { subject, message } = result;
        const recipients = this.filteredParticipants
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['email'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            return { email: metadata['email'], name: metadata['name'] };
          });

        if (recipients.length === 0) {
          this.snackbarService.show('No valid recipients found');
          return;
        }

        const bulkPayload = { type: 'mail', subject, message, recipients };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        try {
          const response = await firstValueFrom(this.http.post(url, bulkPayload, { responseType: 'json' }));
          const res = response as any;
          const successfulSends = res.successCount || 0;
          const failedSends = res.failureCount || 0;
          const totalParticipants = recipients.length;

          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `Message successfully sent to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Sent to ${successfulSends} participants. Failed to send to ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);
        } catch (error) {
          console.error('Failed to send bulk emails:', error);
          this.snackbarService.show('Failed to send bulk emails');
        }

      } else if (result.type === 'whatsapp') {
        const { templateName, customParams } = result;
        const participants = this.filteredParticipants
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['phonenumber'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            const name = metadata['name'];
            let cc = metadata['countryCode'] || metadata['countrycode'] || '';
            cc = cc.trim();
            if (cc && !cc.startsWith('+')) cc = '+' + cc;
            let phone = metadata['phonenumber']?.toString().trim() || '';
            phone = phone.replace(/^\+/, '');
            const fullPhoneNumber = cc ? `${cc}${phone}` : phone;
            const processedParams = customParams.map((param: any) => ({
              name: param.name,
              value: param.value.replace(/\{\{name\}\}/g, name)
            }));
            return { phonenumber: fullPhoneNumber, name, customParams: processedParams };
          });

        if (participants.length === 0) {
          this.snackbarService.show('No valid participants found');
          return;
        }

        const bulkPayload = { type: 'whatsapp', templateName, participants };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        try {
          const response = await firstValueFrom(this.http.post(url, bulkPayload, { responseType: 'json' }));
          const res = response as any;
          const successfulSends = res.successCount || 0;
          const failedSends = res.failureCount || 0;
          const totalParticipants = participants.length;
          const broadcastName = res.broadcastName || ' ';
          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `WhatsApp broadcast "${broadcastName}" sent successfully to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Broadcast "${broadcastName}": Sent to ${successfulSends} participants. Failed: ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send WhatsApp message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);
        } catch (error) {
          console.error('Failed to send bulk WhatsApp:', error);
          this.snackbarService.show('Failed to send bulk WhatsApp messages');
        }
      }
    } else if (result?.action === 'closed') {
      console.log('closed');
    }
  }

  async sendNotificationinBreakthrough() {
    const { AhNotificationComponent } = await import(
      '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component'
    );
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      width: "60vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
      data: this.filteredParticipants
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        var profileID = this.filteredParticipants.map(p => p.profileid);
        var notificationimage = null;
        if (result["notificationimage"] != null) {
          const { getDownloadURL, ref, uploadBytes } = await import('@angular/fire/storage');
          const { inject } = await import('@angular/core');
          const { getStorage } = await import('firebase/storage');
          const { getApp } = await import('firebase/app');
          const storage = getStorage(getApp());
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(storage, filepath);
            const uploadResult = await uploadBytes(storageRef, result['notificationimage']);
            notificationimage = await getDownloadURL(uploadResult.ref);
          } catch (error) {
            console.log('file upload error', error);
          }
        }
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
          alert("A&H Update sent to App user " + profileID.length.toString());
        });
      }
    });
  }

  updateWorkshopDisplayData() {
    if (!this.workshopData) return;
    this.workshopTitle = this.workshopData.detailpage?.title || '';
    this.workshopDescription = this.workshopData.detailpage?.shortdescription || '';
    this.workshopType = this.workshopData.categorybased === true ? 'CP Workshop' : 'Workshop';
    this.workshopStartDateFormatted = this.formatDate(this.workshopData.detailpage?.workshopStartDate);
    this.workshopEndDateFormatted = this.formatDate(this.workshopData.detailpage?.workshopEndDate);
    if (this.workshopData.categorybased === true) {
      if (!this.displayedColumns.includes('type')) {
        const idx = this.displayedColumns.indexOf('participantId');
        this.displayedColumns.splice(idx + 1, 0, 'type');
      }
    } else {
      const typeIdx = this.displayedColumns.indexOf('type');
      if (typeIdx > -1) this.displayedColumns.splice(typeIdx, 1);
    }
  }

  updateParticipantDisplayData() {
    if (!this.participantWorkshopData || !this.selectedParticipantData) {
      this.displayChallenges = [];
      return;
    }

    const progressData = this.selectedParticipantData.progressData;

    this.displayChallenges = this.participantWorkshopData.challenges?.map((challenge: any, challengeIndex: number) => {
      const workshopChallenge = this.workshopData?.challenges?.[challengeIndex];
      const isCurrentChallenge = progressData?.currentChallengeIndex === challengeIndex;

      const challengeStatus = this.calculateChallengeDisplayStatus(challenge, challengeIndex);

      const displayChallenge = {
        challengeIndex,
        challengeName: workshopChallenge ? `${workshopChallenge.heading}: ${workshopChallenge.subheading}` : 'Unknown Challenge',
        challengeType: (challenge.type || '').charAt(0).toUpperCase() + (challenge.type || '').slice(1),
        statusClass: challengeStatus,
        statusDisplayName: this.statusDisplayMap.get(challengeStatus) || 'Unknown Status',
        isCurrentChallenge,
        challengeMetadata: {
          started: challenge.started ? this.formatDate(challenge.started) : null,
          completed: challenge.completed ? this.formatDate(challenge.completed) : null,
          manualCompletion: challenge.manualcompletion || false
        },
        subChallenges: []
      };

      if (challenge.type === 'challenge' && challenge.challenges) {
        displayChallenge.subChallenges = challenge.challenges.map((subChallenge: any, subIndex: number) => {
          const isCurrentSubChallenge = isCurrentChallenge && progressData?.currentSubChallengeIndex === subIndex;
          const subStatus = this.normalizeStatus(subChallenge.status);
          let oldResults = [];
          if (subChallenge.oldresult && subChallenge.oldresult.length > 0) {
            if (subChallenge.type === 'assignment' && subChallenge.assignmenttype === 'question') {
              oldResults = subChallenge.oldresult.map((oldItem: any, index: number) => ({
                index, result: oldItem.result,
                date: oldItem.date ? this.formatDate(oldItem.date) : null,
                notes: oldItem.notes || [], isQuestionAssignment: true
              }));
            } else {
              oldResults = subChallenge.oldresult.map((oldItem: any, index: number) => ({
                index, result: oldItem.result,
                date: oldItem.date ? this.formatDate(oldItem.date) : null,
                notes: oldItem.notes || [], isQuestionAssignment: false
              }));
            }
          }

          let quizResultsCount = 0;
          if (subChallenge.type === 'quiz' && subChallenge.status === 'completed') {
            if (subChallenge.quizResults && Array.isArray(subChallenge.quizResults)) {
              quizResultsCount = subChallenge.quizResults.length;
            } else if (subChallenge.result) {
              quizResultsCount = 1;
            }
          }

          return {
            subChallengeIndex: subIndex,
            subChallengeName: subChallenge.name || 'Unknown Sub-Challenge',
            subChallengeType: (subChallenge.type || '').charAt(0).toUpperCase() + (subChallenge.type || '').slice(1),
            statusClass: subStatus,
            statusDisplayName: this.statusDisplayMap.get(subStatus) || 'Unknown Status',
            isCurrentSubChallenge,
            startedDate: subChallenge.started ? this.formatDate(subChallenge.started) : '',
            completedDate: subChallenge.completed ? this.formatDate(subChallenge.completed) : '',
            canViewForm: subChallenge.type === 'form' && subChallenge.status === 'completed' && subChallenge.result,
            canViewQuiz: subChallenge.type === 'quiz' && subChallenge.status === 'completed' && (subChallenge.quizResults || subChallenge.result),
            quizResultsCount,
            canViewVA: subChallenge.type === 'videoask' && subChallenge.status === 'completed' && subChallenge.result,
            canViewAssignmentForm: subChallenge.type === 'assignment' && subChallenge.assignmenttype === 'form' && (subChallenge.status === 'completed' || subChallenge.status === 'inreview' || subChallenge.status === 'rework') && subChallenge.result,
            canViewAssignmentQuestion: subChallenge.type === 'assignment' && subChallenge.assignmenttype === 'question' && (subChallenge.status === 'completed' || subChallenge.status === 'inreview' || subChallenge.status === 'rework') && subChallenge.assignmentresult,
            canViewAssignmentQuestionText: subChallenge.type === 'assignment' && subChallenge.assignmenttype === 'question' && (subChallenge.status === 'completed' || subChallenge.status === 'inreview' || subChallenge.status === 'rework') && subChallenge.result && subChallenge.submissionformat === 'text',
            hasOldResults: subChallenge.oldresult && subChallenge.oldresult.length > 0,
            oldResults,
            hasAssignmentData: subChallenge.type === 'assignment' && (subChallenge.reviewassignemnt || subChallenge.result || subChallenge.assignmentresult),
            hasCompletionNotes: subChallenge.status === 'completed' && subChallenge.completionNotes && subChallenge.completionNotes.length > 0,
            completionNotes: subChallenge.completionNotes || [],
            metadata: {
              reviewRequired: subChallenge.reviewassignemnt || false,
              hasResult: !!(subChallenge.result || subChallenge.assignmentresult || subChallenge.quizResults),
              originalData: subChallenge
            }
          };
        });
      }

      return displayChallenge;
    }) || [];

    if (this.workshopData?.categorybased === true && this.selectedParticipantData) {
      this.displayChallenges = this.displayChallenges.filter(
        (dc: any) => this.doesParticipantHaveAccessToChallenge(this.selectedParticipantData.profileid, dc.challengeIndex)
      );
    }
  }

  async setupEnrolledParticipantsSnapshot() {
    if (!this.workshopId) return;

    const workshopRef = doc(this.firestoreDefault, 'workshopconfiguration', this.workshopId);
    const enrolledQuery = query(
      collection(this.firestoreDefault, 'workshop participant enrolled'),
      where('workshopref', '==', workshopRef)
    );

    const unsubscribe = onSnapshot(enrolledQuery, async (querySnap) => {
      this.enrolledParticipants = querySnap.docs.map(d => {
        const data = d.data();
        return {
          profileid: data['profileid'],
          participantworkshopref: data['participantworkshopref'],
          enrollmentdate: data['enrollmentdate'],
          workshopStartedAt: data['workshopStartedAt'],
          status: data['status'],
          workshopcategory: data['workshopcategory'] || null,
          referralcode: data['referralcode'] || null,
          id: d.id
        };
      });

      const enrolledProfileIds = this.enrolledParticipants.map(p => p.profileid);
      const participantData = await this.getParticipantMetaMapForIds(enrolledProfileIds);
      if (this.destroyed) return; // component torn down while awaiting
      this.mapProfile = { ...participantData.docdata, ...this.mapProfileNew };
      // Participant progress lives in its own snapshot (setupParticipantWorkshopSnapshot);
      // here we just re-derive from the current (live) participantWorkshopMap.
      this.recomputeDerivedState();

      if (this.loading) {
        this.loading = false;
        this.cdr.detectChanges();
      }
    }, (error) => {
      this.error = `Error loading participants: ${error.message}`;
      this.loading = false;
    });

    this.unsubscribes.push(unsubscribe);
  }

  // Live listener for participant progress (the 'participant workshop' collection).
  // Replaces the old one-time fetch + manual refresh button: any progress change
  // now re-derives the whole dashboard automatically.
  setupParticipantWorkshopSnapshot() {
    if (!this.workshopId) return;

    const workshopRef = doc(this.firestoreDefault, 'workshopconfiguration', this.workshopId);
    const pwQuery = query(
      collection(this.firestoreDefault, 'participant workshop'),
      where('workshopref', '==', workshopRef)
    );

    const unsubscribe = onSnapshot(pwQuery, (pwSnap) => {
      if (this.destroyed) return;
      this.participantWorkshopMap.clear();
      pwSnap.docs.forEach(d => {
        const data = d.data();
        const profileid: string = data['profileid'];
        if (profileid) {
          this.participantWorkshopMap.set(profileid, { id: d.id, ...data });
        }
      });
      this.recomputeDerivedState();
    }, (err) => {
      console.error('Error listening to participant workshop collection:', err);
    });

    this.unsubscribes.push(unsubscribe);
  }

  // Re-derives all dashboard state from the current live snapshots
  // (enrolledParticipants + participantWorkshopMap + mapProfile). Shared by the
  // enrolled-participants and participant-workshop snapshots so both stay in sync,
  // for evergreen, category-based, and plain workshops alike.
  private recomputeDerivedState() {
    if (this.workshopData?.categorybased === true) {
      this.participantCohortMap.clear();
      this.participantWorkshopCategoryMap.clear();
      for (const p of this.enrolledParticipants) {
        const pwData = this.participantWorkshopMap.get(p.profileid);
        if (pwData) {
          this.participantCohortMap.set(p.profileid, pwData['cohortparticipant'] === true);
          if (pwData['workshopcategory']) {
            this.participantWorkshopCategoryMap.set(p.profileid, pwData['workshopcategory']);
          }
        }
      }
      this.updateCohortCount();
    }

    this.rebuildProgressFromMap();
    this.updateMetrics();

    // Keep an open participant-detail panel live when its underlying data changes.
    if (this.selectedParticipantData) {
      const pid = this.selectedParticipantData.profileid;
      const pwData = this.participantWorkshopMap.get(pid) || null;
      if (pwData) {
        this.participantWorkshopData = pwData;
        this.updateParticipantDisplayData();
      }
    }

    this.triggerRecalculation();
  }

  private rebuildProgressFromMap(): void {
    this.participantProgressList = [];
    this.participantDataCache.clear();

    for (const p of this.enrolledParticipants) {
      if (p.status !== 'enrolled') continue;

      const pwData = this.participantWorkshopMap.get(p.profileid);
      if (!pwData) continue;

      const challenges = pwData['challenges'] || [];
      const progress = this.calculateParticipantProgress(p.profileid, challenges);
      this.participantDataCache.set(p.profileid, { progress, challenges });
      this.participantProgressList.push(progress);
    }
  }

  updateCohortCount() {
    this.cohortParticipantProfileIds = this.enrolledParticipants
      .filter(p => this.participantCohortMap.get(p.profileid) === true)
      .map(p => p.profileid);
    this.cohortParticipantCount = this.cohortParticipantProfileIds.length;
  }

  onParticipantClick(participant: any) {
    const enrolledParticipant = this.enrolledParticipants.find(
      ep => ep.profileid === participant.profileid
    );

    if (enrolledParticipant) {
      this.selectedParticipantData = {
        ...enrolledParticipant,
        progressData: participant
      };
      this.loadParticipantWorkshopDataFromCache(participant.profileid);
      setTimeout(() => { this.scrollToParticipantData(); }, 500);
    }
  }

  private loadParticipantWorkshopDataFromCache(profileId: string) {
    this.loadingParticipantWorkshop = true;
    this.participantWorkshopError = null;
    this.participantWorkshopData = null;

    const pwData = this.participantWorkshopMap.get(profileId);
    if (pwData) {
      this.participantWorkshopData = pwData;
      this.loadingParticipantWorkshop = false;
      this.updateParticipantDisplayData();
    } else {
      this.participantWorkshopError = 'Participant workshop data not found';
      this.loadingParticipantWorkshop = false;
    }
  }

  scrollToParticipantData(): void {
    const element = document.querySelector('.participant-data-card');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }
  }

  getParticipantProgress(profileId: string): number {
    const participant = this.participantProgressList.find(p => p.profileid === profileId);
    return participant ? Math.round(participant.progressPercentage) : 0;
  }

  clearSelectedParticipant() {
    this.selectedParticipantData = null;
    this.participantWorkshopData = null;
    this.displayChallenges = [];
    this.loadingParticipantWorkshop = false;
    this.participantWorkshopError = null;
  }

  private triggerRecalculation() {
    if (this.isCalculating) {
      this.pendingRecalculation = true;
      return;
    }
    this.recalculateSubject$.next();
  }

  private performRecalculation() {
    if (this.isCalculating) {
      this.pendingRecalculation = true;
      return;
    }

    this.isCalculating = true;
    requestAnimationFrame(() => {
      try {
        this.recalculateStatistics();
        this.updateDataSource(this.getFilteredTableParticipants());
        this.isCalculating = false;
        if (this.pendingRecalculation) {
          this.pendingRecalculation = false;
          this.triggerRecalculation();
        }
      } catch (error) {
        console.error('Error during recalculation:', error);
        this.isCalculating = false;
      }
    });
  }

  calculateParticipantProgress(profileId: string, challenges: any[]) {
    const cached = this.participantDataCache.get(profileId);
    if (cached && this.areChallengesEqual(cached.challenges, challenges)) {
      return cached.progress;
    }

    let currentChallengeIndex = 0;
    let currentSubChallengeIndex = 0;
    let completedChallenges = 0;
    let totalChallenges = 0;
    let foundCurrent = false;

    for (let i = 0; i < challenges.length; i++) {
      const challenge = challenges[i];
      const workshopChallenge = this.workshopData?.challenges?.[i];

      if (challenge.type === 'challenge' && challenge.challenges) {
        totalChallenges += challenge.challenges.length;

        for (let j = 0; j < challenge.challenges.length; j++) {
          const subChallenge = challenge.challenges[j];
          if (subChallenge.status === 'completed') {
            completedChallenges++;
          } else if (!foundCurrent && this.shouldSetAsCurrent(challenges, i, j)) {
            currentChallengeIndex = i;
            currentSubChallengeIndex = j;
            foundCurrent = true;
          }
        }
      } else if (challenge.type === 'zoomcall' && !foundCurrent) {
        if (this.shouldSetZoomCallAsCurrent(challenges, i, workshopChallenge)) {
          currentChallengeIndex = i;
          currentSubChallengeIndex = 0;
          foundCurrent = true;
        }
      }
    }

    if (!foundCurrent && challenges.length > 0) {
      this.setFallbackCurrent(challenges, (index, subIndex) => {
        currentChallengeIndex = index;
        currentSubChallengeIndex = subIndex;
      });
    }

    const progressPercentage = totalChallenges > 0 ? (completedChallenges / totalChallenges) * 100 : 0;

    return {
      profileid: profileId,
      challenges,
      currentChallengeIndex,
      currentSubChallengeIndex,
      completedChallenges,
      totalChallenges,
      progressPercentage
    };
  }

  private areChallengesEqual(challenges1: any[], challenges2: any[]): boolean {
    if (!challenges1 || !challenges2) return false;
    if (challenges1.length !== challenges2.length) return false;
    for (let i = 0; i < challenges1.length; i++) {
      const c1 = challenges1[i];
      const c2 = challenges2[i];
      if (c1?.status !== c2?.status) return false;
      if (c1?.challenges && c2?.challenges) {
        if (c1.challenges.length !== c2.challenges.length) return false;
        for (let j = 0; j < c1.challenges.length; j++) {
          if (c1.challenges[j]?.status !== c2.challenges[j]?.status) return false;
        }
      }
    }
    return true;
  }

  shouldSetAsCurrent(challenges: any[], i: number, j: number): boolean {
    if (j === 0) {
      return i === 0 || this.isPreviousChallengeCompleted(challenges, i);
    } else {
      return challenges[i].challenges![j - 1].status === 'completed';
    }
  }

  shouldSetZoomCallAsCurrent(challenges: any[], i: number, workshopChallenge: any): boolean {
    if (i === 0 || this.isPreviousChallengeCompleted(challenges, i)) {
      return workshopChallenge?.status !== 'completed';
    }
    return false;
  }

  setFallbackCurrent(challenges: any[], callback: (index: number, subIndex: number) => void) {
    for (let i = challenges.length - 1; i >= 0; i--) {
      if (challenges[i].type === 'challenge' && challenges[i].challenges) {
        callback(i, challenges[i].challenges!.length - 1);
        break;
      } else if (challenges[i].type === 'zoomcall') {
        callback(i, 0);
        break;
      }
    }
  }

  isPreviousChallengeCompleted(challenges: any[], currentIndex: number): boolean {
    if (currentIndex <= 0) return true;
    const previousChallenge = challenges[currentIndex - 1];
    const workshopPreviousChallenge = this.workshopData?.challenges?.[currentIndex - 1];
    return previousChallenge.type === 'zoomcall'
      ? workshopPreviousChallenge?.status === 'completed'
      : previousChallenge.status === 'completed';
  }

  updateMetrics() {
    const totalEnrolledParticipants = this.enrolledParticipants.map(p => p.profileid);
    const totalStartedParticipants = this.enrolledParticipants
      .filter(p => p.status === 'enrolled').map(p => p.profileid);
    const notStartedParticipants = this.enrolledParticipants
      .filter(p => p.status === 'enrollednotstarted').map(p => p.profileid);
    const activeParticipants = this.participantProgressList
      .filter(p => p.progressPercentage > 0).map(p => p.profileid);
    const completedParticipants = this.participantProgressList
      .filter(p => p.progressPercentage === 100).map(p => p.profileid);

    this.metrics.set('totalEnrolled', totalEnrolledParticipants);
    this.metrics.set('totalStarted', totalStartedParticipants);
    this.metrics.set('notStarted', notStartedParticipants);
    this.metrics.set('activeParticipants', activeParticipants);
    this.metrics.set('completedParticipants', completedParticipants);

    if (this.workshopData?.categorybased === true) {
      this.updateCategoryWiseEnrolled();
      this.updateCohortCount();
      const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
      const enrolledProfileIds = this.enrolledParticipants.map(p => p.profileid);
      this.facilitatorProfileIds = facilitatorProfiles.filter(id => enrolledProfileIds.includes(id));
      this.facilitatorCount = this.facilitatorProfileIds.length;
      this.updateCategoryBasedMetrics();
    }

    if (this.workshopData?.evergreenWorkshop === true) {
      this.computeEvergreenDayDistribution();
    }
  }

  // Buckets enrolled participants by their current workshop day, based on enrollmentdate.
  // day = floor((now - enrollmentdate) / 24h) + 1 (exact to the second). Days beyond
  // workshopDays fall into the "Completed" bucket.
  computeEvergreenDayDistribution() {
    const days = this.evergreenWorkshopDays;
    if (this.workshopData?.evergreenWorkshop !== true || days <= 0) {
      this.evergreenDayDistribution = [];
      this.evergreenCompletedBucket = { day: -1, count: 0, profileIds: [], completed: true };
      this.evergreenDayTotal = 0;
      return;
    }

    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const buckets: { day: number; count: number; profileIds: string[] }[] = [];
    for (let i = 1; i <= days; i++) buckets.push({ day: i, count: 0, profileIds: [] });
    const completed = { day: -1, count: 0, profileIds: [] as string[], completed: true };
    let total = 0;

    for (const p of this.enrolledParticipants) {
      const enrolledMs = this.toMillis(p.enrollmentdate);
      if (enrolledMs == null) continue;
      total++;
      let day = Math.floor((now - enrolledMs) / DAY_MS) + 1;
      if (day < 1) day = 1; // guard against clock skew / future-dated enrollment
      if (day > days) {
        completed.count++;
        completed.profileIds.push(p.profileid);
      } else {
        const b = buckets[day - 1];
        b.count++;
        b.profileIds.push(p.profileid);
      }
    }

    this.evergreenDayDistribution = buckets;
    this.evergreenCompletedBucket = completed;
    this.evergreenDayTotal = total;
  }

  private toMillis(ts: any): number | null {
    if (!ts) return null;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  async loadCategoryNames() {
    const categoryIds: string[] = this.workshopData?.categoriesforthisworkshop || [];
    if (categoryIds.length === 0) return;

    this.loadingCategories = true;
    try {
      const promises = categoryIds.map(async (catId: string) => {
        const catDoc = await getDoc(doc(this.firestoreDefault, 'workshopcategory', catId));
        if (catDoc.exists()) {
          this.categoryNamesMap.set(catId, catDoc.data()['name'] || 'Unknown');
        }
      });
      await Promise.all(promises);
      this.updateCategoryWiseEnrolled();
    } catch (err) {
      console.error('Error loading category names:', err);
    } finally {
      this.loadingCategories = false;
    }
  }

  updateCategoryWiseEnrolled() {
    const categoryIds: string[] = this.workshopData?.categoriesforthisworkshop || [];
    if (categoryIds.length === 0) { this.categoryWiseEnrolled = []; return; }

    this.categoryWiseEnrolled = categoryIds.map(catId => {
      const matchingParticipants = this.enrolledParticipants
        .filter(p => p.workshopcategory === catId)
        .map(p => p.profileid);
      return {
        categoryId: catId,
        categoryName: this.categoryNamesMap.get(catId) || 'Unknown',
        count: matchingParticipants.length,
        profileIds: matchingParticipants
      };
    });
  }

  onCategoryClick(category: any) {
    this.selectedParticipants = category.profileIds.map(id => this.buildParticipantEntry(id));
    this.selectedStatusInfo = {
      status: 'categoryEnrolled',
      challengeName: category.categoryName,
      subChallengeName: `${category.categoryName} Enrolled`,
      count: category.profileIds.length
    };
    this.showParticipantPanel = true;
    this.filterOption = 'all';
    this.applyFilterSide();
  }

  recalculateStatistics() {
    if (!this.workshopData) return;
    this.updateMetrics();
    this.challengeStatistics = [];

    this.workshopData.challenges?.forEach((challenge: any, challengeIndex: number) => {
      const progressList = this.getFilteredParticipantProgressList(challengeIndex);

      const challengeStats = {
        challengeIndex,
        challengeName: `${challenge.heading}: ${challenge.subheading}`,
        participantsByStatus: new Map(),
        subChallengeStats: [],
        workshopcategory: challenge.workshopcategory || []
      };

      if (challenge.type === 'challenge' && challenge.challenges) {
        this.calculateChallengeStats(challenge, challengeIndex, challengeStats, progressList);
      } else if (challenge.type === 'zoomcall') {
        this.calculateZoomCallStats(challenge, challengeIndex, challengeStats, progressList);
      }

      this.challengeStatistics.push(challengeStats);
    });

    this.prepareAssignmentsList();
    this.loadChallengeForms();
  }

  calculateChallengeStats(challenge: any, challengeIndex: number, challengeStats: any, progressList?: any[]) {
    const participants = progressList || this.participantProgressList;
    const statusMap = new Map<string, string[]>([
      ['completed', []], ['inprogress', []], ['notstarted', []], ['notstartedcurrent', []]
    ]);

    challenge.challenges?.forEach((subChallenge: any, subIndex: number) => {
      const subStats = {
        subChallengeIndex: subIndex,
        subChallengeName: subChallenge.name,
        type: subChallenge.type,
        participantsByStatus: new Map([
          ['completed', []], ['inprogress', []], ['inreview', []],
          ['rework', []], ['readyformobile', []], ['notstarted', []], ['notstartedcurrent', []]
        ])
      };

      participants.forEach(participant => {
        const participantSubChallenge = participant.challenges[challengeIndex]?.challenges?.[subIndex];
        const status = this.normalizeStatus(participantSubChallenge?.status);
        subStats.participantsByStatus.get(status)?.push(participant.profileid);
        if (status === 'notstarted') {
          const isReadyToStart = this.isParticipantReadyForSubChallenge(participant, challengeIndex, subIndex);
          if (isReadyToStart) {
            subStats.participantsByStatus.get('notstartedcurrent')?.push(participant.profileid);
          }
        }
      });
      challengeStats.subChallengeStats.push(subStats);
    });

    participants.forEach(participant => {
      const participantStatus = this.getParticipantChallengeStatus(participant, challengeIndex);
      statusMap.get(participantStatus)?.push(participant.profileid);
      if (participantStatus === 'notstarted') {
        const isReadyToStart = this.isParticipantReadyForChallenge(participant, challengeIndex);
        if (isReadyToStart) {
          statusMap.get('notstartedcurrent')?.push(participant.profileid);
        }
      }
    });

    challengeStats.participantsByStatus = statusMap;
  }

  calculateZoomCallStats(challenge: any, challengeIndex: number, challengeStats: any, progressList?: any[]) {
  }

  private isParticipantReadyForChallenge(participant: any, challengeIndex: number): boolean {
    if (challengeIndex === 0) return true;
    let previousNonZoomIndex = -1;
    for (let i = challengeIndex - 1; i >= 0; i--) {
      const workshopChallenge = this.workshopData?.challenges?.[i];
      if (workshopChallenge?.type !== 'zoomcall') { previousNonZoomIndex = i; break; }
    }
    if (previousNonZoomIndex === -1) return true;
    const previousStatus = this.getParticipantChallengeStatus(participant, previousNonZoomIndex);
    return previousStatus === 'completed';
  }

  private isParticipantReadyForSubChallenge(participant: any, challengeIndex: number, subChallengeIndex: number): boolean {
    if (subChallengeIndex === 0) {
      if (challengeIndex === 0) return true;
      let previousNonZoomIndex = -1;
      for (let i = challengeIndex - 1; i >= 0; i--) {
        const workshopChallenge = this.workshopData?.challenges?.[i];
        if (workshopChallenge?.type !== 'zoomcall') { previousNonZoomIndex = i; break; }
      }
      if (previousNonZoomIndex === -1) return true;
      const previousStatus = this.getParticipantChallengeStatus(participant, previousNonZoomIndex);
      return previousStatus === 'completed';
    }
    const challenge = participant.challenges[challengeIndex];
    if (!challenge?.challenges) return false;
    return challenge.challenges[subChallengeIndex - 1]?.status === 'completed';
  }

  get totalNewUsersEnrolled(): number {
    const enrolledProfileIds = this.enrolledParticipants.map(p => p.profileid);
    return Object.keys(this.mapProfileNew)
      .filter(profileId => enrolledProfileIds.includes(profileId)).length;
  }

  get totalNewUsersNotEnrolled(): number {
    const enrolledProfileIds = this.enrolledParticipants.map(p => p.profileid);
    return Object.keys(this.mapProfileNew)
      .filter(profileId => !enrolledProfileIds.includes(profileId)).length;
  }

  get totalEnrolled() { return this.metrics.get('totalEnrolled')?.length || 0; }
  get totalStarted() { return this.metrics.get('totalStarted')?.length || 0; }
  get notStarted() { return this.metrics.get('notStarted')?.length || 0; }
  get activeParticipants() { return this.metrics.get('activeParticipants')?.length || 0; }
  get shareClicked() { return this.shareClickedProfileIds.length; }
  get shareClaimed() { return this.shareClaimedProfileIds.length; }
  get evergreenWorkshopDays(): number {
    return Number(this.workshopData?.evergreenWorkshopMeta?.workshopDays) || 0;
  }
  get completionRate() {
    const total = this.totalEnrolled;
    const completed = this.metrics.get('completedParticipants')?.length || 0;
    return total > 0 ? (completed / total) * 100 : 0;
  }
  get averageProgress() {
    return this.participantProgressList.length > 0
      ? this.participantProgressList.reduce((sum, p) => sum + p.progressPercentage, 0) / this.participantProgressList.length
      : 0;
  }

  getFilteredTableParticipants(): any[] {
    if (this.workshopData?.categorybased !== true) return this.participantProgressList;

    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
    let list = this.participantProgressList;

    if (this.selectedCategoryFilter === 'cohort') {
      list = list.filter(p => this.participantCohortMap.get(p.profileid) === true);
    } else if (this.selectedCategoryFilter === 'facilitator') {
      list = list.filter(p => facilitatorProfiles.includes(p.profileid));
    } else if (this.selectedCategoryFilter !== 'all') {
      list = list.filter(p => {
        if (this.participantCohortMap.get(p.profileid) === true) return true;
        if (facilitatorProfiles.includes(p.profileid)) return true;
        return this.participantWorkshopCategoryMap.get(p.profileid) === this.selectedCategoryFilter;
      });
    }

    if (this.tableTypeFilter !== 'all') {
      list = list.filter(p => {
        if (this.tableTypeFilter === 'facilitator') return facilitatorProfiles.includes(p.profileid);
        if (this.tableTypeFilter === 'cohort') return this.participantCohortMap.get(p.profileid) === true;
        if (this.tableTypeFilter.startsWith('cat_')) {
          const catId = this.tableTypeFilter.slice(4);
          return !facilitatorProfiles.includes(p.profileid) &&
            !this.participantCohortMap.get(p.profileid) &&
            this.participantWorkshopCategoryMap.get(p.profileid) === catId;
        }
        return true;
      });
    }

    if (this.tableStatusFilter !== 'all') {
      list = list.filter(p => {
        const progress = this.calculateAccessBasedProgress(p);
        const pct = progress.progressPercentage;
        if (this.tableStatusFilter === 'completed') return pct === 100;
        if (this.tableStatusFilter === 'active') return pct > 0 && pct < 100;
        if (this.tableStatusFilter === 'notstarted') return pct === 0;
        return true;
      });
    }

    return list;
  }

  onTableTypeFilterChange() { this.updateDataSource(this.getFilteredTableParticipants()); }
  onTableStatusFilterChange() { this.updateDataSource(this.getFilteredTableParticipants()); }
  clearTableFilters() {
    this.tableTypeFilter = 'all';
    this.tableStatusFilter = 'all';
    this.updateDataSource(this.getFilteredTableParticipants());
  }

  onMetricClick(metricType: string) {
    if (metricType === 'totalNewUsers') {
      const newUserParticipants = this.enrolledParticipants
        .filter(p => this.mapProfileNew[p.profileid])
        .map(p => ({
          profileid: p.profileid,
          name: this.mapProfileNew[p.profileid]?.name || 'Unknown',
          metadata: this.mapProfileNew[p.profileid]
        }));
      this.selectedParticipants = newUserParticipants;
      this.selectedStatusInfo = {
        status: 'totalNewUsers',
        challengeName: 'New Users',
        subChallengeName: 'New Users Enrolled',
        count: newUserParticipants.length
      };
      this.showParticipantPanel = true;
      // ✅ Reset new user filters on open
      this.selectedSubscriberCode = [];
      this.showReferredOnly = false;
      this.filterOption = 'all';
      this.applyFilterSide();

    } else if (metricType === 'totalNewUsersNotEnrolled') {
      const enrolledProfileIds = this.enrolledParticipants.map(p => p.profileid);
      const notEnrolledNewUsers = Object.keys(this.mapProfileNew)
        .filter(profileId => !enrolledProfileIds.includes(profileId))
        .map(profileId => ({
          profileid: profileId,
          name: this.mapProfileNew[profileId]?.name || 'Unknown',
          metadata: this.mapProfileNew[profileId]
        }));
      this.selectedParticipants = notEnrolledNewUsers;
      this.selectedStatusInfo = {
        status: 'totalNewUsersNotEnrolled',
        challengeName: 'Not Enrolled',
        subChallengeName: 'New Users Not Enrolled',
        count: notEnrolledNewUsers.length
      };
      this.showParticipantPanel = true;
      // ✅ Reset new user filters on open
      this.selectedSubscriberCode = [];
      this.showReferredOnly = false;
      this.filterOption = 'all';
      this.applyFilterSide();

    } else if (metricType === 'shareClicked' || metricType === 'shareClaimed') {
      const isClaimed = metricType === 'shareClaimed';
      const ids = isClaimed ? this.shareClaimedProfileIds : this.shareClickedProfileIds;
      this.selectedParticipants = ids.map(id => {
        const entry: any = {
          profileid: id,
          name: this.shareProfileNames[id] || this.mapProfile[id]?.name || 'Unknown',
          metadata: this.mapProfile[id]
        };
        // For Share Claimed: show (display-only) who enrolled using this sharer's referral code.
        // These referred profileids are intentionally NOT added as participant entries, so they
        // are excluded from WhatsApp / notification / mail recipients (which use filteredParticipants).
        if (isClaimed) {
          const code = (this.shareClaimedReferralByProfile[id] || '').trim();
          if (code) {
            const seen = new Set<string>();
            const referredNames: string[] = [];
            for (const p of this.enrolledParticipants) {
              const pCode = (p.referralcode || '').trim();
              if (pCode && pCode === code && p.profileid && p.profileid !== id && !seen.has(p.profileid)) {
                seen.add(p.profileid);
                referredNames.push(this.mapProfile[p.profileid]?.name || this.shareProfileNames[p.profileid] || 'Unknown');
              }
            }
            if (referredNames.length) entry.referredNames = referredNames;
          }
        }
        return entry;
      });
      this.selectedStatusInfo = {
        status: metricType,
        challengeName: 'Share',
        subChallengeName: metricType === 'shareClicked' ? 'Share Clicked' : 'Share Claimed',
        count: this.selectedParticipants.length
      };
      this.showParticipantPanel = true;
      this.filterOption = 'all';
      this.applyFilterSide();
    } else {
      const participantIds = this.metrics.get(metricType);
      this.selectedParticipants = participantIds.map(id => this.buildParticipantEntry(id));
      this.selectedStatusInfo = {
        status: metricType, challengeName: 'All Participants',
        subChallengeName: this.statusDisplayMap.get(metricType) || metricType,
        count: participantIds.length
      };
      this.showParticipantPanel = true;
      this.filterOption = 'all';
      this.selectedJourneyFilters = [];
      this.selectedEnrollmentStatusFilters = [];
      this.selectedTierFilters = [];
      this.selectedCategoryFilters = [];
      this.selectedNotStartedTypeFilters = [];
      this.applyFilterSide();
    }
  }

  // Opens the shared side panel with the participants currently in the given evergreen day bucket.
  onDayClick(bucket: { day: number; count: number; profileIds: string[]; completed?: boolean }) {
    if (!bucket || bucket.count === 0) return;
    const label = bucket.completed ? 'Completed' : `Day ${bucket.day}`;
    this.selectedParticipants = bucket.profileIds.map(id => this.buildParticipantEntry(id));
    this.selectedStatusInfo = {
      status: label,
      challengeName: label,
      subChallengeName: bucket.completed
        ? `Past day ${this.evergreenWorkshopDays} of ${this.evergreenWorkshopDays}`
        : `Day ${bucket.day} of ${this.evergreenWorkshopDays}`,
      count: bucket.count
    };
    this.showParticipantPanel = true;
    this.filterOption = 'all';
    this.selectedJourneyFilters = [];
    this.selectedEnrollmentStatusFilters = [];
    this.selectedTierFilters = [];
    this.selectedCategoryFilters = [];
    this.selectedNotStartedTypeFilters = [];
    this.applyFilterSide();
  }

  onChallengeMainStatusClick(status: string, challengeIndex: number, count: number) {
    const challengeStats = this.challengeStatistics[challengeIndex];
    const participantIds = challengeStats?.participantsByStatus.get(status) || [];
    this.showParticipantList(participantIds, {
      status, challengeIndex, subChallengeIndex: -1,
      challengeName: challengeStats?.challengeName || 'Unknown Challenge',
      subChallengeName: 'Main Challenge Status', count
    });
  }

  onStatusClick(status: string, challengeIndex: number, subChallengeIndex: number, count: number) {
    const challengeStats = this.challengeStatistics[challengeIndex];
    const subStats = challengeStats?.subChallengeStats[subChallengeIndex];
    const participantIds = subStats?.participantsByStatus.get(status) || [];
    this.showParticipantList(participantIds, {
      status, challengeIndex, subChallengeIndex,
      challengeName: challengeStats?.challengeName || 'Unknown Challenge',
      subChallengeName: subStats?.subChallengeName || 'Unknown Sub-Challenge', count
    });
  }

  showParticipantList(participantIds: string[], statusInfo: any) {
    this.selectedParticipants = participantIds.map(id => this.buildParticipantEntry(id));
    this.selectedStatusInfo = statusInfo;
    this.showParticipantPanel = true;
    this.filterOption = 'all';
    this.applyFilterSide();
  }

  closeParticipantPanel() {
    this.showParticipantPanel = false;
    this.selectedParticipants = [];
    this.selectedStatusInfo = null;
  }

  async openQADialog() {
    const { QuestionandanswerComponent } = await import('./questionandanswer/questionandanswer.component');
    this.dialog.open(QuestionandanswerComponent, {
      width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh',
      data: { workshopId: this.workshopId, workshopTitle: this.workshopTitle },
      disableClose: false, panelClass: 'fullscreen-dialog',
      hasBackdrop: true, backdropClass: 'fullscreen-backdrop'
    });
  }

  async openClearDialog() {
    const { ClearWorkshopComponent } = await import('./clear-workshop/clear-workshop.component');
    this.dialog.open(ClearWorkshopComponent, {
      data: { participants: this.enrolledParticipants, mapProfile: this.mapProfile },
      width: '90vw', height: '90vh', maxWidth: '100vw', maxHeight: '100vh'
    });
  }

  // async openNewUserDialog() {
  //   const { NewusersComponent } = await import('../newusers/newusers.component');
  //   this.dialog.open(NewusersComponent, {
  //     data: { mapProfile: this.mapProfileNew, mapProfileold: this.mapProfile },
  //     width: '90vw', height: '90vh', maxWidth: '100vw', maxHeight: '100vh'
  //   });
  // }

  async openZoomDialog(zoomdata: any, index: number) {
    const { ZoomCallComponent } = await import('./zoom-call/zoom-call.component');
    const dialogRef = this.dialog.open(ZoomCallComponent, {
      data: { mapProfile: this.mapProfileNew, mapProfileold: this.mapProfile, zoomdata },
      width: '90vw', height: '90vh', maxWidth: '100vw', maxHeight: '100vh', disableClose: true
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result || !Array.isArray(result.profileIds)) { console.warn('No profile'); return; }
      const challengeId = zoomdata['challengeid'];
      const workshopId = this.workshopId;
      if (!challengeId || !workshopId) { console.error('Missing challengeId or workshopId'); return; }
      try {
        const workshopRef = doc(this.firestoreDefault, 'workshopconfiguration', workshopId);
        const updatedChallenges = [...this.workshopData.challenges];
        const challengeIndex = updatedChallenges.findIndex((c: any) => c.challengeid === challengeId);
        if (challengeIndex === -1) { console.error('Challenge not found'); return; }
        updatedChallenges[challengeIndex] = { ...updatedChallenges[challengeIndex], zoomattended: result.profileIds };
        await updateDoc(workshopRef, { challenges: updatedChallenges });
      } catch (error) {
        console.error('Errorzoom:', error);
      }
    });
  }

  async reviewAssignment(participant: any) {
    try {
      const enrolledParticipant = this.enrolledParticipants.find(ep => ep.profileid === participant.profileid);
      if (!enrolledParticipant) return;

      const currentChallenge = participant.challenges[participant.currentChallengeIndex];
      const currentSubChallenge = currentChallenge?.challenges?.[participant.currentSubChallengeIndex];

      if (currentSubChallenge?.type === 'assignment') {
        const assignmentData = {
          profileid: participant.profileid,
          workshopref: enrolledParticipant.participantworkshopref.path,
          challengeIndex: participant.currentChallengeIndex,
          subChallengeIndex: participant.currentSubChallengeIndex,
          ...currentSubChallenge
        };
        if (currentSubChallenge['assignmenttype'] === 'form') {
          this.handleFormAssignment(assignmentData);
        } else if (currentSubChallenge['assignmenttype'] === 'question') {
          this.openAssignmentDialog(assignmentData);
        }
      }
    } catch (err) {
      console.error('Error in reviewAssignment:', err);
    }
  }

  handleFormAssignment(assignmentData: any) {
    const resultRef: any = assignmentData.result;
    if (resultRef) {
      const formData = {
        formid: assignmentData.reviewid,
        docid: resultRef.id,
        profileid: assignmentData.profileid,
        workshopref: assignmentData.workshopref,
        challengeIndex: assignmentData.challengeIndex,
        subChallengeIndex: assignmentData.subChallengeIndex,
        reviewid: assignmentData.reviewid
      };
      this.onFormPreview(formData);
    }
  }

  async openAssignmentDialog(assignmentLog: any) {
    const { AssignmentDialogComponent } = await import('../assignment-dialog/assignment-dialog.component');
    this.dialog.open(AssignmentDialogComponent, {
      width: '90vw', maxWidth: '1200px', maxHeight: '90vh',
      data: assignmentLog, disableClose: true
    });
  }

  onFormPreview(form: any) {
    const path = doc(this.firestoreForms, 'formsByClient', form['docid']).path;
    const queryParams: any = {
      id: form.formid, type: 'form', patchdata: path,
      profileid: form.profileid, workshopref: form.workshopref,
      challengeIndex: form.challengeIndex, subChallengeIndex: form.subChallengeIndex,
      reviewid: form.reviewid
    };
    if (form.isOldResult) {
      queryParams.isOldResult = form.isOldResult;
      queryParams.oldResultIndex = form.oldResultIndex;
      queryParams.oldResultNotes = JSON.stringify(form.oldResultNotes || []);
    }
    if (form.isCompletedAssignment) {
      queryParams.isCompletedAssignment = form.isCompletedAssignment;
      queryParams.completionNotes = form.completionNotes;
    }
    const url = this.router.createUrlTree(['/formtemplateworkshop'], { queryParams });
    window.open(url.toString(), '_blank');
  }

  viewOldForm(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number, oldResultIndex: number): void {
    try {
      if (!this.selectedParticipantData || !displaySubChallenge.hasOldResults) return;
      const oldResult = displaySubChallenge.oldResults[oldResultIndex];
      const subChallenge = displaySubChallenge.metadata.originalData;
      const contentref = subChallenge.contentref;
      const formData = {
        formid: contentref.id, docid: oldResult.result.id,
        profileid: this.selectedParticipantData.profileid,
        workshopref: this.selectedParticipantData.participantworkshopref.path,
        challengeIndex, subChallengeIndex,
        reviewid: subChallenge.reviewid || subChallenge.formid,
        readonly: true, isOldResult: true, oldResultIndex,
        oldResultNotes: oldResult.notes || []
      };
      this.onFormPreview(formData);
    } catch (error) {
      console.error('Error opening old form view:', error);
      this.error = 'Failed to open old form view. Please try again.';
    }
  }

  viewOldQuestionAssignment(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number, oldResultIndex: number): void {
    try {
      if (!this.selectedParticipantData || !displaySubChallenge.hasOldResults) return;
      const oldResult = displaySubChallenge.oldResults[oldResultIndex];
      const subChallenge = displaySubChallenge.metadata.originalData;
      const assignmentData = {
        profileid: this.selectedParticipantData.profileid,
        workshopref: this.selectedParticipantData.participantworkshopref.path,
        challengeIndex, subChallengeIndex,
        assignmentresult: oldResult.result, uploadtype: subChallenge.uploadtype,
        isOldResult: true, oldResultIndex, oldResultNotes: oldResult.notes || [],
        oldResultDate: oldResult.date, assignmenttype: 'question', type: 'assignment',
        name: subChallenge.name, description: subChallenge.description
      };
      this.openAssignmentDialog(assignmentData);
    } catch (error) {
      console.error('Error opening old question assignment view:', error);
      this.error = 'Failed to open old question assignment view. Please try again.';
    }
  }

  handleOldResultClick(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number, oldResultIndex: number, oldResult: any): void {
    if (oldResult.isQuestionAssignment) {
      this.viewOldQuestionAssignment(displaySubChallenge, challengeIndex, subChallengeIndex, oldResultIndex);
    } else {
      this.viewOldForm(displaySubChallenge, challengeIndex, subChallengeIndex, oldResultIndex);
    }
  }

  getOldResultTooltip(oldResult: any): string {
    return oldResult.isQuestionAssignment
      ? `Click to view previous question assignment from ${oldResult.date}`
      : `Click to view previous form submission from ${oldResult.date}`;
  }

  viewQuestionAssignment(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number): void {
    try {
      if (!this.selectedParticipantData || !displaySubChallenge.canViewAssignmentQuestion) return;
      const subChallenge = displaySubChallenge.metadata.originalData;
      const assignmentData = {
        profileid: this.selectedParticipantData.profileid,
        workshopref: this.selectedParticipantData.participantworkshopref.path,
        challengeIndex, subChallengeIndex, status: subChallenge['status'],
        ...subChallenge
      };
      this.openAssignmentDialog(assignmentData);
    } catch (error) {
      console.error('Error opening question assignment view:', error);
      this.error = 'Failed to open question assignment view. Please try again.';
    }
  }

  viewForm(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number): void {
    try {
      if (!this.selectedParticipantData || !displaySubChallenge.metadata.hasResult) return;
      const subChallenge = displaySubChallenge.metadata.originalData;
      if (subChallenge.type !== 'form' && subChallenge.assignmenttype !== 'form') return;
      const resultRef = subChallenge.result;
      const contentref = subChallenge.contentref;
      const getStatus = subChallenge.status;
      const reviewid = getStatus === 'rework' ? null : subChallenge.reviewid || subChallenge.formid;
      const formData = {
        formid: contentref.id, docid: resultRef.id,
        profileid: this.selectedParticipantData.profileid,
        workshopref: this.selectedParticipantData.participantworkshopref.path,
        challengeIndex, subChallengeIndex, reviewid, readonly: true
      };
      if (getStatus === 'completed' && displaySubChallenge.hasCompletionNotes) {
        formData['isCompletedAssignment'] = true;
        formData['completionNotes'] = JSON.stringify(displaySubChallenge.completionNotes);
      }
      this.onFormPreview(formData);
    } catch (error) {
      console.error('Error opening form view:', error);
      this.error = 'Failed to open form view. Please try again.';
    }
  }

  async viewVideoAsk(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number): Promise<void> {
    try {
      if (!this.selectedParticipantData || !displaySubChallenge.canViewVA) return;
      const subChallenge = displaySubChallenge.metadata.originalData;
      const resultRef = subChallenge.result;
      if (!resultRef) { this.error = 'VideoAsk result not found'; return; }
      const docSnap = await getDoc(resultRef);
      if (!docSnap.exists()) { this.error = 'VideoAsk data not found'; return; }
      const downloadURL = docSnap.data()['fileurl'];
      if (!downloadURL) { this.error = 'VideoAsk URL not available'; return; }
      window.open(downloadURL, '_blank');
    } catch (error) {
      console.error('Error opening VideoAsk:', error);
      this.error = 'Failed to open VideoAsk. Please try again.';
    }
  }

  async viewQuiz(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number): Promise<void> {
    try {
      if (!this.selectedParticipantData || !displaySubChallenge.canViewQuiz) return;
      const subChallenge = displaySubChallenge.metadata.originalData;
      const resultRefs = subChallenge.quizResults;
      if (!resultRefs || !Array.isArray(resultRefs) || resultRefs.length === 0) {
        this.error = 'Quiz results not found'; return;
      }
      const quizResults = await Promise.all(
        resultRefs.map(async (resultRef: any) => {
          const docSnap = await getDoc(resultRef);
          return docSnap.exists() ? { id: docSnap.id, data: docSnap.data(), ref: resultRef } : null;
        })
      );
      const validQuizResults = quizResults.filter(r => r !== null);
      if (validQuizResults.length === 0) { this.error = 'Quiz data not found'; return; }
      const participantName = this.mapProfile[this.selectedParticipantData.profileid]['name'] || 'Unknown';
      const { QuizDialogComponent } = await import('./quizbyclients/quizbyclients-dialog.component');
      this.dialog.open(QuizDialogComponent, {
        width: '90vw', maxWidth: '900px', maxHeight: '90vh',
        data: { quizResults: validQuizResults, participantName, challengeIndex, subChallengeIndex },
        disableClose: false, panelClass: 'quiz-dialog-panel'
      });
    } catch (error) {
      console.error('Error opening Quiz:', error);
      this.error = 'Failed to open Quiz. Please try again.';
    }
  }

  async moveParticipantToNext(participant: any) {
    if (this.loggedinProfile !== null && (this.loggedinProfile === '3LVxKXuyxldYoRDEpx5s' || this.loggedinProfile === 'gtZHayfR3UpMbmKP9Uet' || this.loggedinProfile === 'SFrMh3ntKtNOo6MYN7dZ')) {
      if (participant.progressPercentage === 100) return;
      try {
        this.isMovingParticipant = participant.profileid;
        const enrolledParticipant = this.enrolledParticipants.find(ep => ep.profileid === participant.profileid);
        if (!enrolledParticipant) throw new Error('Enrolled participant record not found');

        let challenges = [...participant.challenges];
        const now = Timestamp.now();

        while (challenges.length <= participant.currentChallengeIndex) challenges.push({});

        const currentChallenge = { ...challenges[participant.currentChallengeIndex] };
        const workshopChallenge = this.workshopData!.challenges[participant.currentChallengeIndex];

        if (workshopChallenge.type === 'zoomcall') {
          console.log(`Skipping zoomcall challenge for participant ${participant.profileid}`);
          return;
        } else if (workshopChallenge.type === 'challenge') {
          this.updateChallengeProgress(currentChallenge, participant, workshopChallenge, now);
        }

        challenges[participant.currentChallengeIndex] = currentChallenge;
        await updateDoc(enrolledParticipant.participantworkshopref, { challenges });
        const pwData = this.participantWorkshopMap.get(participant.profileid);
        if (pwData) {
          pwData['challenges'] = challenges;
          this.participantWorkshopMap.set(participant.profileid, pwData);
        }
        const progress = this.calculateParticipantProgress(participant.profileid, challenges);
        this.participantDataCache.set(participant.profileid, { progress, challenges });
        const idx = this.participantProgressList.findIndex(p => p.profileid === participant.profileid);
        if (idx >= 0) this.participantProgressList[idx] = progress;
        this.triggerRecalculation();

        if (this.selectedParticipantData?.profileid === participant.profileid) {
          this.participantWorkshopData = pwData;
          this.updateParticipantDisplayData();
        }
      } catch (error) {
        console.error('Error moving participant to next challenge:', error);
        this.error = `Failed to move participant: ${error}`;
      } finally {
        this.isMovingParticipant = null;
      }
    } else {
      alert('No Access');
    }
  }

  getButtonText(participant: any): string {
    if (participant.progressPercentage === 100) return 'Completed';
    const currentChallenge = this.workshopData?.challenges[participant.currentChallengeIndex];
    if (currentChallenge?.type === 'zoomcall') return 'Zoom Call';
    return 'Move Next';
  }

  getButtonTooltip(participant: any): string {
    if (participant.progressPercentage === 100) return 'Workshop completed';
    const currentChallenge = this.workshopData?.challenges[participant.currentChallengeIndex];
    if (currentChallenge?.type === 'zoomcall') return 'Zoom call challenges cannot be moved manually';
    return 'Move to next challenge';
  }

  updateChallengeProgress(currentChallenge: any, participant: any, workshopChallenge: any, now: any) {
    if (!currentChallenge.challenges) currentChallenge.challenges = [];
    let subChallenges = [...currentChallenge.challenges];
    while (subChallenges.length <= participant.currentSubChallengeIndex) subChallenges.push({});

    const workshopSubChallenge = workshopChallenge.challenges![participant.currentSubChallengeIndex];
    subChallenges[participant.currentSubChallengeIndex] = {
      ...workshopSubChallenge, status: 'completed', completed: now, manualcompletion: true
    };
    currentChallenge.challenges = subChallenges;

    const totalSubChallenges = workshopChallenge.challenges!.length;
    const completedSubChallenges = subChallenges.filter(sc => sc.status === 'completed').length;
    if (completedSubChallenges === totalSubChallenges) {
      Object.assign(currentChallenge, {
        ...workshopChallenge, challenges: subChallenges,
        status: 'completed', completed: now, manualcompletion: true
      });
    }
  }

  canReviewAssignment(participant: any): boolean {
    try {
      const currentChallenge = participant.challenges[participant.currentChallengeIndex];
      const currentSubChallenge = currentChallenge?.challenges?.[participant.currentSubChallengeIndex];
      return currentSubChallenge?.type === 'assignment' &&
        currentSubChallenge?.reviewassignemnt === true &&
        currentSubChallenge?.status === 'inreview';
    } catch (error) { return false; }
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  applyFilterSide() {
    let base = this.selectedParticipants;

    if (this.filterOption === 'new') {
      base = base.filter(p => this.mapProfile[p.profileid]?.workshoponly === true);
    } else if (this.filterOption === 'old') {
      base = base.filter(p => !this.mapProfile[p.profileid]?.workshoponly);
    }

    if (this.workshopData?.categorybased === true &&
      this.selectedStatusInfo?.status === 'totalEnrolled' &&
      this.selectedJourneyFilters.length > 0) {
      base = base.filter(p => {
        const activeJourney: string = this.mapProfile[p.profileid]?.activejourney || '';
        return this.selectedJourneyFilters.includes(activeJourney);
      });
    }

    if (this.workshopData?.categorybased === true &&
      this.workshopData?.tierbased === true &&
      this.selectedStatusInfo?.status === 'totalEnrolled' &&
      this.selectedTierFilters.length > 0) {
      base = base.filter(p => {
        const profileTiers: string[] = this.mapProfile[p.profileid]?.tier || [];
        return this.selectedTierFilters.some(t => profileTiers.includes(t));
      });
    }

    if (this.workshopData?.categorybased === true &&
      this.selectedStatusInfo?.status === 'totalEnrolled' &&
      this.selectedCategoryFilters.length > 0) {
      base = base.filter(p => {
        const participantCat = this.participantWorkshopCategoryMap.get(p.profileid);
        return participantCat ? this.selectedCategoryFilters.includes(participantCat) : false;
      });
    }

    if (this.selectedStatusInfo?.status === 'totalEnrolled' &&
      this.selectedEnrollmentStatusFilters.length > 0) {
      base = base.filter(p => {
        const ep = this.enrolledParticipants.find(e => e.profileid === p.profileid);
        return ep ? this.selectedEnrollmentStatusFilters.includes(ep.status) : false;
      });
    }

    if (this.selectedStatusInfo?.status === 'cohortParticipants') {
      const facilitatorSet = new Set(this.facilitatorProfileIds);
      if (this.cohortTypeFilter === 'facilitator') {
        base = base.filter(p => facilitatorSet.has(p.profileid));
      } else if (this.cohortTypeFilter === 'cohort') {
        base = base.filter(p => !facilitatorSet.has(p.profileid));
      }
    }

    if (this.workshopData?.categorybased === true &&
      this.selectedStatusInfo?.status === 'notStarted') {
      const startedProfileIds = new Set(this.participantProgressList.map(p => p.profileid));
      if (this.selectedNotStartedTypeFilters.length > 0) {
        base = base.filter(p => {
          const isEnrolledNotStarted = !startedProfileIds.has(p.profileid);
          const isEnrolledZeroProgress = startedProfileIds.has(p.profileid);
          if (this.selectedNotStartedTypeFilters.includes('enrollednotstarted') && isEnrolledNotStarted) return true;
          if (this.selectedNotStartedTypeFilters.includes('enrolled_zero_progress') && isEnrolledZeroProgress) return true;
          return false;
        });
      }
      if (this.selectedCategoryFilters.length > 0) {
        base = base.filter(p => {
          const catFromDoc = this.participantWorkshopCategoryMap.get(p.profileid);
          if (catFromDoc) return this.selectedCategoryFilters.includes(catFromDoc);
          const enrolledRecord = this.enrolledParticipants.find(e => e.profileid === p.profileid);
          const catFromEnrolled = enrolledRecord?.workshopcategory || null;
          return catFromEnrolled ? this.selectedCategoryFilters.includes(catFromEnrolled) : false;
        });
      }
    }

    if (
      (this.selectedStatusInfo?.status === 'totalNewUsers' ||
        this.selectedStatusInfo?.status === 'totalNewUsersNotEnrolled') &&
      this.selectedSubscriberCode.length > 0
    ) {
      const enrolledProfileIds = new Set(this.enrolledParticipants.map(p => p.profileid));
      const isEnrolledView = this.selectedStatusInfo?.status === 'totalNewUsers';
      base = Object.entries(this.mapProfileNew)
        .filter(([profileId, p]: any) => {
          if (!this.selectedSubscriberCode.includes(p?.refferedby)) return false;
          if (p?.subscriber !== true) return false;
          const isEnrolled = enrolledProfileIds.has(profileId);
          return isEnrolledView ? isEnrolled : !isEnrolled;
        })
        .map(([profileId, p]: any) => ({
          profileid: profileId,
          name: p?.name || 'Unknown',
          created: p?.created || null,
          metadata: p
        }));

    }

    if (
      (this.selectedStatusInfo?.status === 'totalNewUsers' ||
        this.selectedStatusInfo?.status === 'totalNewUsersNotEnrolled') &&
      this.showReferredOnly
    ) {
      const enrolledProfileIds = new Set(this.enrolledParticipants.map(p => p.profileid));
      const isEnrolledView = this.selectedStatusInfo?.status === 'totalNewUsers';
      base = Object.entries(this.mapProfileNew)
        .filter(([profileId, p]: any) => {
          if (!p?.refferedby) return false;
          if (p?.subscriber === true) return false;
          const isEnrolled = enrolledProfileIds.has(profileId);
          return isEnrolledView ? isEnrolled : !isEnrolled;
        })
        .map(([profileId, p]: any) => ({
          profileid: profileId,
          name: p?.name || 'Unknown',
          created: p?.created || null,
          metadata: p
        }));
    }
    this.filteredParticipants = base;
  }

  toggleJourneyFilter(journey: string) {
    const idx = this.selectedJourneyFilters.indexOf(journey);
    if (idx >= 0) { this.selectedJourneyFilters.splice(idx, 1); } else { this.selectedJourneyFilters.push(journey); }
    this.applyFilterSide();
  }

  clearJourneyFilters() {
    this.selectedJourneyFilters = [];
    this.applyFilterSide();
  }

  toggleTierFilter(tier: string) {
    const idx = this.selectedTierFilters.indexOf(tier);
    if (idx >= 0) { this.selectedTierFilters.splice(idx, 1); } else { this.selectedTierFilters.push(tier); }
    this.applyFilterSide();
  }

  clearTierFilters() {
    this.selectedTierFilters = [];
    this.applyFilterSide();
  }

  toggleEnrollmentStatusFilter(status: string) {
    const idx = this.selectedEnrollmentStatusFilters.indexOf(status);
    if (idx >= 0) { this.selectedEnrollmentStatusFilters.splice(idx, 1); } else { this.selectedEnrollmentStatusFilters.push(status); }
    this.applyFilterSide();
  }

  clearEnrollmentStatusFilters() {
    this.selectedEnrollmentStatusFilters = [];
    this.applyFilterSide();
  }

  toggleNotStartedTypeFilter(type: string) {
    const idx = this.selectedNotStartedTypeFilters.indexOf(type);
    if (idx >= 0) { this.selectedNotStartedTypeFilters.splice(idx, 1); } else { this.selectedNotStartedTypeFilters.push(type); }
    this.applyFilterSide();
  }

  clearNotStartedTypeFilters() {
    this.selectedNotStartedTypeFilters = [];
    this.applyFilterSide();
  }

  toggleCategoryFilter(categoryId: string) {
    const idx = this.selectedCategoryFilters.indexOf(categoryId);
    if (idx >= 0) { this.selectedCategoryFilters.splice(idx, 1); } else { this.selectedCategoryFilters.push(categoryId); }
    this.applyFilterSide();
  }

  clearCategoryFilters() {
    this.selectedCategoryFilters = [];
    this.applyFilterSide();
  }

  onCategoryFilterChange() {
    this.recalculateStatistics();
    this.updateDataSource(this.getFilteredTableParticipants());
    if (this.selectedParticipantData) this.updateParticipantDisplayData();
  }



  getFilteredParticipantProgressList(challengeIndex?: number): any[] {
    if (this.workshopData?.categorybased !== true) return this.participantProgressList;
    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];

    if (this.selectedCategoryFilter === 'cohort')
      return this.participantProgressList.filter(p => this.participantCohortMap.get(p.profileid) === true);
    if (this.selectedCategoryFilter === 'facilitator')
      return this.participantProgressList.filter(p => facilitatorProfiles.includes(p.profileid));
    if (this.selectedCategoryFilter !== 'all') {
      return this.participantProgressList.filter(p => {
        if (this.participantCohortMap.get(p.profileid) === true) return true;
        if (facilitatorProfiles.includes(p.profileid)) return true;
        return this.participantWorkshopCategoryMap.get(p.profileid) === this.selectedCategoryFilter;
      });
    }

    if (challengeIndex !== undefined && challengeIndex !== null) {
      const challenge = this.workshopData?.challenges?.[challengeIndex];
      const challengeCatIds: string[] = challenge?.workshopcategory || [];
      const isFacilitatorOnly = challenge?.facilitatoronly === true;
      if (isFacilitatorOnly)
        return this.participantProgressList.filter(p => facilitatorProfiles.includes(p.profileid));
      if (challengeCatIds.length > 0) {
        return this.participantProgressList.filter(p => {
          if (this.participantCohortMap.get(p.profileid) === true) return true;
          if (facilitatorProfiles.includes(p.profileid)) return true;
          const participantCat = this.participantWorkshopCategoryMap.get(p.profileid);
          return participantCat && challengeCatIds.includes(participantCat);
        });
      }
      return this.participantProgressList.filter(p => {
        if (this.participantCohortMap.get(p.profileid) === true) return true;
        if (facilitatorProfiles.includes(p.profileid)) return true;
        return false;
      });
    }

    return this.participantProgressList;
  }

  getChallengeCategoryNames(challengeIndex: number): string {
    const challenge = this.workshopData?.challenges?.[challengeIndex];
    const catIds: string[] = challenge?.workshopcategory || [];
    if (catIds.length === 0) return '';
    return catIds.map((id: string) => this.categoryNamesMap.get(id) || 'Unknown').join(', ');
  }

  isChallengeVisibleForCategory(challengeIndex: number): boolean {
    if (this.selectedCategoryFilter === 'all' || this.selectedCategoryFilter === 'cohort' || this.workshopData?.categorybased !== true) return true;
    if (this.selectedCategoryFilter === 'facilitator') {
      const challenge = this.workshopData?.challenges?.[challengeIndex];
      return challenge?.facilitatoronly === true;
    }
    const challenge = this.workshopData?.challenges?.[challengeIndex];
    const catIds: string[] = challenge?.workshopcategory || [];
    return catIds.includes(this.selectedCategoryFilter);
  }

  onCohortClick() {
    this.selectedParticipants = this.cohortParticipantProfileIds.map(id => ({
      profileid: id, name: this.mapProfile[id]?.name || 'Unknown', metadata: this.mapProfile[id]
    }));
    this.selectedStatusInfo = {
      status: 'cohortParticipants', challengeName: 'Above Diagnostics',
      subChallengeName: 'Cohort Participants', count: this.cohortParticipantProfileIds.length
    };
    this.showParticipantPanel = true;
    this.filterOption = 'all';
    this.cohortTypeFilter = 'all';
    this.applyFilterSide();
  }

  onFacilitatorClick() {
    this.selectedParticipants = this.facilitatorProfileIds.map(id => ({
      profileid: id, name: this.mapProfile[id]?.name || 'Unknown', metadata: this.mapProfile[id]
    }));
    this.selectedStatusInfo = {
      status: 'facilitatorOnly', challengeName: 'Facilitator Only',
      subChallengeName: 'Facilitator Participants', count: this.facilitatorProfileIds.length
    };
    this.showParticipantPanel = true;
    this.filterOption = 'all';
    this.applyFilterSide();
  }

  getParticipantTypeLabel(profileid: string): string {
    if (this.workshopData?.categorybased !== true) return '';
    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
    if (facilitatorProfiles.includes(profileid)) return 'Facilitator';
    if (this.participantCohortMap.get(profileid) === true) return 'Above Diagnostics';
    const catId = this.participantWorkshopCategoryMap.get(profileid);
    if (catId) return this.categoryNamesMap.get(catId) || 'Category';
    return 'N/A';
  }

  getParticipantTypeClass(profileid: string): string {
    if (this.workshopData?.categorybased !== true) return '';
    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
    if (facilitatorProfiles.includes(profileid)) return 'type-facilitator';
    if (this.participantCohortMap.get(profileid) === true) return 'type-cohort';
    return 'type-category';
  }

  doesParticipantHaveAccessToChallenge(profileid: string, challengeIndex: number): boolean {
    if (this.workshopData?.categorybased !== true) return true;
    const challenge = this.workshopData?.challenges?.[challengeIndex];
    if (!challenge) return true;

    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
    const isFacilitator = facilitatorProfiles.includes(profileid);
    const isCohort = this.participantCohortMap.get(profileid) === true;
    const isFacilitatorOnly = challenge.facilitatoronly === true;
    const challengeCatIds: string[] = challenge.workshopcategory || [];

    if (isFacilitatorOnly) return isFacilitator;
    if (isCohort || isFacilitator) return true;
    if (challengeCatIds.length > 0) {
      const participantCat = this.participantWorkshopCategoryMap.get(profileid);
      return participantCat ? challengeCatIds.includes(participantCat) : false;
    }
    return false;
  }

  calculateAccessBasedProgress(participant: any): { completedChallenges: number; totalChallenges: number; progressPercentage: number } {
    if (this.workshopData?.categorybased !== true) {
      return {
        completedChallenges: participant.completedChallenges,
        totalChallenges: participant.totalChallenges,
        progressPercentage: participant.progressPercentage
      };
    }
    let completedChallenges = 0;
    let totalChallenges = 0;
    for (let i = 0; i < (participant.challenges || []).length; i++) {
      if (!this.doesParticipantHaveAccessToChallenge(participant.profileid, i)) continue;
      const challenge = participant.challenges[i];
      if (challenge.type === 'challenge' && challenge.challenges) {
        totalChallenges += challenge.challenges.length;
        for (let j = 0; j < challenge.challenges.length; j++) {
          if (challenge.challenges[j].status === 'completed') completedChallenges++;
        }
      }
    }
    const progressPercentage = totalChallenges > 0 ? (completedChallenges / totalChallenges) * 100 : 0;
    return { completedChallenges, totalChallenges, progressPercentage };
  }

  getAccessBasedProgressForProfile(profileid: string): number {
    const participant = this.participantProgressList.find(p => p.profileid === profileid);
    if (!participant) return 0;
    return Math.round(this.calculateAccessBasedProgress(participant).progressPercentage);
  }

  updateCategoryBasedMetrics() {
    if (this.workshopData?.categorybased !== true) return;

    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
    const categoryIds: string[] = this.workshopData?.categoriesforthisworkshop || [];
    const getProgress = (p: any) => this.calculateAccessBasedProgress(p);

    let totalProgress = 0;
    let totalCompletedCount = 0;
    const totalActiveIds: string[] = [];
    const totalCompletedIds: string[] = [];
    const totalNotStartedIds: string[] = [];

    this.participantProgressList.forEach(p => {
      const prog = getProgress(p);
      totalProgress += prog.progressPercentage;
      if (prog.progressPercentage === 100) { totalCompletedCount++; totalCompletedIds.push(p.profileid); }
      else if (prog.progressPercentage > 0) { totalActiveIds.push(p.profileid); }
      else { totalNotStartedIds.push(p.profileid); }
    });

    const startedProfileIds = this.participantProgressList.map(p => p.profileid);
    this.enrolledParticipants.filter(p => p.status === 'enrollednotstarted' && !startedProfileIds.includes(p.profileid))
      .forEach(p => totalNotStartedIds.push(p.profileid));

    const totalParticipants = this.participantProgressList.length;
    this.categoryBasedMetrics.overallAvgProgress = totalParticipants > 0 ? totalProgress / totalParticipants : 0;
    this.categoryBasedMetrics.overallCompletionRate = totalParticipants > 0 ? (totalCompletedCount / totalParticipants) * 100 : 0;
    this.categoryBasedMetrics.totalActive = totalActiveIds.length;
    this.categoryBasedMetrics.totalActiveProfileIds = totalActiveIds;
    this.categoryBasedMetrics.totalCompleted = totalCompletedIds.length;
    this.categoryBasedMetrics.totalCompletedProfileIds = totalCompletedIds;
    this.categoryBasedMetrics.totalNotStarted = totalNotStartedIds.length;
    this.categoryBasedMetrics.totalNotStartedProfileIds = totalNotStartedIds;

    this.categoryBasedMetrics.categoryProgress = categoryIds.map(catId => {
      const catParticipants = this.participantProgressList.filter(
        p => this.participantWorkshopCategoryMap.get(p.profileid) === catId
      );
      let catProgress = 0; let catCompleted = 0;
      catParticipants.forEach(p => {
        const prog = getProgress(p);
        catProgress += prog.progressPercentage;
        if (prog.progressPercentage === 100) catCompleted++;
      });
      return {
        categoryId: catId, categoryName: this.categoryNamesMap.get(catId) || 'Unknown',
        avgProgress: catParticipants.length > 0 ? catProgress / catParticipants.length : 0,
        completionRate: catParticipants.length > 0 ? (catCompleted / catParticipants.length) * 100 : 0,
        completedCount: catCompleted, totalCount: catParticipants.length
      };
    });

    const cohortParticipants = this.participantProgressList.filter(p => this.participantCohortMap.get(p.profileid) === true);
    let cohortProgress = 0; let cohortCompleted = 0;
    cohortParticipants.forEach(p => {
      const prog = getProgress(p);
      cohortProgress += prog.progressPercentage;
      if (prog.progressPercentage === 100) cohortCompleted++;
    });
    this.categoryBasedMetrics.cohortAvgProgress = cohortParticipants.length > 0 ? cohortProgress / cohortParticipants.length : 0;
    this.categoryBasedMetrics.cohortCompletionRate = cohortParticipants.length > 0 ? (cohortCompleted / cohortParticipants.length) * 100 : 0;
    this.categoryBasedMetrics.cohortCompletedCount = cohortCompleted;

    const facParticipants = this.participantProgressList.filter(p => facilitatorProfiles.includes(p.profileid));
    let facProgress = 0; let facCompleted = 0;
    facParticipants.forEach(p => {
      const prog = getProgress(p);
      facProgress += prog.progressPercentage;
      if (prog.progressPercentage === 100) facCompleted++;
    });
    this.categoryBasedMetrics.facilitatorAvgProgress = facParticipants.length > 0 ? facProgress / facParticipants.length : 0;
    this.categoryBasedMetrics.facilitatorCompletionRate = facParticipants.length > 0 ? (facCompleted / facParticipants.length) * 100 : 0;
    this.categoryBasedMetrics.facilitatorCompletedCount = facCompleted;
  }

  onCategoryBasedMetricClick(type: string, categoryId?: string) {
    let profileIds: string[] = [];
    let label = '';

    switch (type) {
      case 'active': profileIds = this.categoryBasedMetrics.totalActiveProfileIds; label = 'Active Participants'; break;
      case 'completed': profileIds = this.categoryBasedMetrics.totalCompletedProfileIds; label = 'Completed Participants'; break;
      case 'notStarted': profileIds = this.categoryBasedMetrics.totalNotStartedProfileIds; label = 'Not Started Participants'; break;
      case 'cohortCompleted':
        profileIds = this.participantProgressList
          .filter(p => this.participantCohortMap.get(p.profileid) === true && this.calculateAccessBasedProgress(p).progressPercentage === 100)
          .map(p => p.profileid);
        label = 'Above Diagnostics — Completed'; break;
      case 'facilitatorCompleted':
        const facProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
        profileIds = this.participantProgressList
          .filter(p => facProfiles.includes(p.profileid) && this.calculateAccessBasedProgress(p).progressPercentage === 100)
          .map(p => p.profileid);
        label = 'Facilitator — Completed'; break;
      case 'categoryCompleted':
        if (categoryId) {
          profileIds = this.participantProgressList
            .filter(p => this.participantWorkshopCategoryMap.get(p.profileid) === categoryId && this.calculateAccessBasedProgress(p).progressPercentage === 100)
            .map(p => p.profileid);
          label = (this.categoryNamesMap.get(categoryId) || 'Category') + ' — Completed';
        }
        break;
    }

    this.selectedParticipants = profileIds.map(id => ({
      profileid: id, name: this.mapProfile[id]?.name || 'Unknown', metadata: this.mapProfile[id]
    }));
    this.selectedStatusInfo = { status: type, challengeName: label, subChallengeName: label, count: profileIds.length };
    this.showParticipantPanel = true;
    this.filterOption = 'all';
    this.selectedCategoryFilters = [];
    this.selectedNotStartedTypeFilters = [];
    this.applyFilterSide();
  }

  private buildParticipantEntry(id: string): any {
    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
    const catFromDoc = this.participantWorkshopCategoryMap.get(id);
    const catFromEnrolled = this.enrolledParticipants.find(e => e.profileid === id)?.workshopcategory || null;
    const categoryId = catFromDoc || catFromEnrolled || null;
    return {
      profileid: id, name: this.mapProfile[id]?.name || 'Unknown', metadata: this.mapProfile[id],
      isFacilitator: facilitatorProfiles.includes(id),
      isCohort: this.participantCohortMap.get(id) === true,
      categoryId,
      categoryName: categoryId ? (this.categoryNamesMap.get(categoryId) || '—') : '—'
    };
  }

  openZoomAttendees(challenge: any, index: number) {
    const profileIds = challenge.zoomattended || [];
    if (!profileIds.length) { console.warn('No attendees found'); return; }
    this.selectedParticipants = profileIds.map((id: string) => ({
      profileid: id,
      name: this.mapProfile[id]?.name || this.mapProfileNew[id]?.name || 'Unknown',
      metadata: this.mapProfile[id] || this.mapProfileNew[id] || {}
    }));
    this.selectedStatusInfo = {
      status: 'zoomattended', challengeIndex: index,
      challengeName: challenge.heading || 'Zoom Call',
      subChallengeName: 'Zoom Attendees', count: profileIds.length
    };
    this.showParticipantPanel = true;
    this.filterOption = 'all';
    this.applyFilterSide();
  }

  getParticipantChallengeStatus(participant: any, challengeIndex: number): string {
    const challenge = participant.challenges[challengeIndex];
    const workshopChallenge = this.workshopData?.challenges?.[challengeIndex];
    if (!challenge) return 'notstarted';
    if (challenge.type === 'zoomcall') return workshopChallenge?.status === 'completed' ? 'completed' : 'notstarted';
    if (challenge.status === 'completed') return 'completed';
    if (challenge.challenges?.some((sc: any) => sc.status)) return 'inprogress';
    return 'notstarted';
  }

  normalizeStatus(status: string | undefined): string {
    if (!status) return 'notstarted';
    const statusMap = new Map([
      ['completed', 'completed'], ['inreview', 'inreview'], ['rework', 'rework'],
      ['readyformobile', 'readyformobile'], ['ready', 'inprogress'], ['ongoing', 'inprogress']
    ]);
    return statusMap.get(status.toLowerCase()) || 'notstarted';
  }

  calculateChallengeDisplayStatus(challenge: any, challengeIndex: number): string {
    if (!challenge) return 'notstarted';
    if (challenge.type === 'zoomcall') {
      const workshopChallenge = this.workshopData?.challenges?.[challengeIndex];
      return workshopChallenge?.status === 'completed' ? 'completed' : 'notstarted';
    }
    if (challenge.status === 'completed') return 'completed';
    if (challenge.challenges?.some((sc: any) => sc.status && sc.status !== 'notstarted')) return 'inprogress';
    return 'notstarted';
  }

  exportParticipantsToCSV() {
    const confirmDownload = window.confirm("Are you sure you want to export participants as CSV?");
    if (!confirmDownload) return;
    const csvData = this.prepareCSVData();
    const csvContent = this.createCSVContent(csvData);
    this.downloadCSV(
      csvContent,
      `workshop-participants-${this.workshopData?.detailpage?.title || 'workshop'}-${new Date().toISOString().split('T')[0]}.csv`
    );
  }

  private prepareCSVData(): any[] {
    const csvData: any[] = [];
    const workshopTitle = this.workshopData?.detailpage?.title || 'Unknown Workshop';
    this.enrolledParticipants.forEach(enrolledParticipant => {
      const participantProgress = this.participantProgressList.find(p => p.profileid === enrolledParticipant.profileid);
      const participantName = this.mapProfile[enrolledParticipant.profileid]['name'] || 'Unknown';
      let currentChallengeName = 'Not Started';
      let currentChallengeType = '';
      let challengeNumber = '';
      if (participantProgress) {
        const currentChallenge = this.workshopData?.challenges?.[participantProgress.currentChallengeIndex];
        if (currentChallenge) {
          if (currentChallenge.type === 'challenge' && currentChallenge.challenges?.[participantProgress.currentSubChallengeIndex]) {
            const subChallenge = currentChallenge.challenges[participantProgress.currentSubChallengeIndex];
            currentChallengeName = subChallenge.name;
            currentChallengeType = subChallenge.type;
            challengeNumber = `${participantProgress.currentChallengeIndex + 1}.${participantProgress.currentSubChallengeIndex + 1}`;
          } else if (currentChallenge.type === 'zoomcall') {
            currentChallengeName = `${currentChallenge.heading}: ${currentChallenge.subheading}`;
            currentChallengeType = 'zoomcall';
            challengeNumber = `${participantProgress.currentChallengeIndex + 1}`;
          }
        }
      }
      const enrollmentDate = enrolledParticipant.enrollmentdate ? this.formatDate(enrolledParticipant.enrollmentdate) : 'N/A';
      const workshopStartedDate = enrolledParticipant.workshopStartedAt ? this.formatDate(enrolledParticipant.workshopStartedAt) : 'Not Started';
      let overallStatus = 'Not Started';
      if (participantProgress) {
        if (participantProgress.progressPercentage === 100) overallStatus = 'Completed';
        else if (participantProgress.progressPercentage > 0) overallStatus = 'In Progress';
      }
      csvData.push({
        'Participant Name': participantName, 'Workshop Title': workshopTitle,
        'Enrollment Status': enrolledParticipant.status, 'Overall Progress Status': overallStatus,
        'Enrollment Date': enrollmentDate, 'Workshop Started Date': workshopStartedDate,
        'Challenge Number': challengeNumber, 'Current Challenge': currentChallengeName,
        'Current Challenge Type': currentChallengeType,
        'Completed Challenges': participantProgress ? participantProgress.completedChallenges : 0,
        'Total Challenges': participantProgress ? participantProgress.totalChallenges : 0,
        'Progress Percentage': participantProgress ? Math.round(participantProgress.progressPercentage) + '%' : '0%',
        'Workshop Start Date': this.workshopStartDateFormatted, 'Workshop End Date': this.workshopEndDateFormatted
      });
    });
    return csvData;
  }

  private createCSVContent(data: any[]): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => headers.map(header => {
      const value = row[header];
      if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(','));
    return [csvHeaders, ...csvRows].join('\n');
  }

  private downloadCSV(csvContent: string, filename: string) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  hasAssignmentData(displayChallenge: any): boolean {
    return displayChallenge.subChallenges.some((subChallenge: any) =>
      subChallenge.canViewAssignmentForm ||
      subChallenge.canViewAssignmentQuestion ||
      subChallenge.canViewAssignmentQuestionText ||
      subChallenge.hasOldResults
    );
  }

  hasAnyAssignmentData(): boolean {
    return this.displayChallenges.some(challenge => this.hasAssignmentData(challenge));
  }

  prepareAssignmentsList() {
    if (!this.participantProgressList || this.participantProgressList.length === 0) {
      this.assignmentsList = []; return;
    }
    const assignmentsMap = new Map<string, any>();
    this.participantProgressList.forEach(participant => {
      if (!participant.challenges || !Array.isArray(participant.challenges)) return;
      participant.challenges.forEach((challenge: any, challengeIndex: number) => {
        if (!challenge.challenges || !Array.isArray(challenge.challenges)) return;
        challenge.challenges.forEach((subChallenge: any, subChallengeIndex: number) => {
          if (subChallenge.type === 'assignment' &&
            (subChallenge.status === 'completed' || subChallenge.status === 'inreview' || subChallenge.status === 'rework')) {
            const assignmentKey = `${challengeIndex}-${subChallengeIndex}`;
            if (!assignmentsMap.has(assignmentKey)) {
              assignmentsMap.set(assignmentKey, {
                challengeIndex, subChallengeIndex,
                challengeName: `${challenge.heading || 'Challenge'}: ${challenge.subheading || ''}`,
                assignmentName: subChallenge.name || 'Untitled Assignment',
                assignmentType: subChallenge.assignmenttype || 'Unknown',
                description: subChallenge.description || '', participants: []
              });
            }
            assignmentsMap.get(assignmentKey)!.participants.push({
              profileid: participant.profileid,
              name: this.mapProfile[participant.profileid]?.['name'] || 'Unknown',
              status: subChallenge.status,
              completedDate: subChallenge.completed ? this.formatDate(subChallenge.completed) : null,
              assignmentType: subChallenge.assignmenttype,
              hasResult: !!(subChallenge.result || subChallenge.assignmentresult),
              result: subChallenge.result, assignmentresult: subChallenge.assignmentresult,
              reviewid: subChallenge.reviewid, contentref: subChallenge.contentref,
              uploadtype: subChallenge.uploadtype, submissionformat: subChallenge.submissionformat,
              oldResults: subChallenge.oldresult || [], completionNotes: subChallenge.completionNotes || [],
              enrolledParticipant: this.enrolledParticipants.find(ep => ep.profileid === participant.profileid)
            });
          }
        });
      });
    });
    this.assignmentsList = Array.from(assignmentsMap.values());
  }

  viewParticipantAssignment(assignment: any, participant: any) {
    const challengeIndex = assignment.challengeIndex;
    const subChallengeIndex = assignment.subChallengeIndex;
    if (participant.assignmentType === 'form') {
      const formData = {
        formid: participant.contentref.id, docid: participant.result.id,
        profileid: participant.profileid,
        workshopref: participant.enrolledParticipant.participantworkshopref.path,
        challengeIndex, subChallengeIndex, reviewid: participant.reviewid, readonly: true
      };
      if (participant.status === 'completed' && participant.completionNotes.length > 0) {
        formData['isCompletedAssignment'] = true;
        formData['completionNotes'] = JSON.stringify(participant.completionNotes);
      }
      this.onFormPreview(formData);
    } else if (participant.assignmentType === 'question' && participant.submissionformat === 'upload') {
      this.openAssignmentDialog({
        profileid: participant.profileid,
        workshopref: participant.enrolledParticipant.participantworkshopref.path,
        challengeIndex, subChallengeIndex,
        assignmentresult: participant.assignmentresult, uploadtype: participant.uploadtype,
        status: participant.status, assignmenttype: 'question', type: 'assignment',
        name: assignment.assignmentName, description: assignment.description
      });
    } else {
      return null;
    }
  }

  exportParticipants() {
    if (!this.filteredParticipants || this.filteredParticipants.length === 0) {
      alert("No participants selected to export."); return;
    }
    const confirmDownload = window.confirm("Are you sure you want to export participants as CSV?");
    if (!confirmDownload) return;
    const csvData = this.filteredParticipants.map((p: any) => ({
      'Participant Name': p.name || 'N/A',
      'Email': p['metadata']['email'] || '',
      'Phone': p['metadata']['phonenumber'] || '',
      'Active Journey': this.JourneyMap[p['metadata']['activejourney']] || '',
      'Last Journey': this.JourneyMap[p['metadata']['lastcompletedjourney']] || '',
      'Subscription End': this.formatDate(p['metadata']['subscriptionend']) || '',
    }));
    const csvContent = this.createCSVContent(csvData);
    const fileName = `workshop-participants-${this.workshopData?.detailpage?.title || 'workshop'}-${new Date().toISOString().split('T')[0]}.csv`;
    this.downloadCSV(csvContent, fileName);
  }

  // async manualenroll() {
  //   const { EnrollComponent } = await import('./enroll/enroll.component');
  //   const dialogRef = this.dialog.open(EnrollComponent, {
  //     width: '400px',
  //     data: { workshopId: this.workshopId, profiledata: this.mapProfile }
  //   });
  //   dialogRef.afterClosed().subscribe(result => { });
  // }
  async manualenroll() {
    const { EnrollComponent } = await import('./enroll/enroll.component');
    const dialogRef = this.dialog.open(EnrollComponent, {
      width: '400px',
      data: { workshopId: this.workshopId }
    });
    dialogRef.afterClosed().subscribe(result => { });
  }

  loadChallengeForms(): void {
    if (!this.participantProgressList || this.participantProgressList.length === 0) {
      this.challengeForms = []; return;
    }
    const formsMap = new Map<string, any>();
    this.participantProgressList.forEach(participant => {
      if (!participant.challenges || !Array.isArray(participant.challenges)) return;
      participant.challenges.forEach((challenge: any, challengeIdx: number) => {
        if (!challenge.challenges || !Array.isArray(challenge.challenges)) return;
        challenge.challenges.forEach((subchallenge: any, subIdx: number) => {
          if (subchallenge.type === 'form' && subchallenge.status === 'completed') {
            const formKey = `${challengeIdx}-${subIdx}`;
            if (!formsMap.has(formKey)) {
              formsMap.set(formKey, {
                title: subchallenge.name || subchallenge.title || 'Untitled Form',
                formlink: subchallenge.formlink || null,
                challengeTitle: challenge.heading || challenge.title || 'Challenge',
                subChallengeIndex: subIdx, challengeIndex: challengeIdx, participants: []
              });
            }
            formsMap.get(formKey)!.participants.push({
              name: this.mapProfile[participant.profileid]?.['name'] || 'Unknown',
              profileid: participant.profileid,
              profilePictureUrl: this.mapProfile[participant.profileid]?.['profilepic'] || null,
              status: subchallenge.status, submittedDate: subchallenge.completed || null,
              formSubmitted: subchallenge.status === 'completed'
            });
          }
        });
      });
    });
    this.challengeForms = Array.from(formsMap.values());
  }

  openChallengeFormReview(form: any, participant: any): void {
    const enrolledParticipant = this.enrolledParticipants.find(ep => ep.profileid === participant.profileid);
    if (!enrolledParticipant) { console.error('Enrolled participant not found'); return; }
    const participantProgress = this.participantProgressList.find(p => p.profileid === participant.profileid);
    const challenge = participantProgress?.challenges?.[form.challengeIndex];
    const subChallenge = challenge?.challenges?.[form.subChallengeIndex];
    if (!subChallenge || !subChallenge.result) { alert('This participant has not submitted the form yet.'); return; }
    const formData = {
      formid: subChallenge.contentref.id, docid: subChallenge.result.id,
      profileid: participant.profileid,
      workshopref: enrolledParticipant.participantworkshopref.path,
      challengeIndex: form.challengeIndex, subChallengeIndex: form.subChallengeIndex,
      reviewid: subChallenge.reviewid, readonly: true
    };
    if (subChallenge.status === 'completed' && subChallenge.completionNotes && subChallenge.completionNotes.length > 0) {
      formData['isCompletedAssignment'] = true;
      formData['completionNotes'] = JSON.stringify(subChallenge.completionNotes);
    }
    this.onFormPreview(formData);
  }
  formatDate(timestamp: any): string {
    if (!timestamp) return '';
    try {
      const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return ''; }
  }
}
