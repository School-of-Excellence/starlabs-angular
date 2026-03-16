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
  Firestore, collection, doc, query, where, onSnapshot, 
  updateDoc,Timestamp, Unsubscribe, 
  getDoc,getDocs,
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

@Component({
  selector: 'app-workshop-dashboard',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule,MatCheckboxModule,
    MatProgressSpinnerModule, MatProgressBarModule, MatTableModule,
    MatPaginatorModule, MatSortModule, MatChipsModule, MatExpansionModule,MatSnackBarModule,
    MatListModule, MatTooltipModule, MatDialogModule,MatFormFieldModule,MatInputModule,RouterModule,MatMenuModule,MatRadioModule,FormsModule,MatSelectModule
  ],
  templateUrl: './workshop-dashboard.component.html',
  styleUrls: ['./workshop-dashboard.component.css']
})
export class WorkshopDashboardComponent implements OnInit, OnDestroy {
  @ViewChild(MatPaginator, { static: false }) paginator!: MatPaginator;
  @ViewChild(MatSort, { static: false }) sort!: MatSort;
  @ViewChild('participantDataSection', { static: false }) participantDataSection!: ElementRef;

  showParticipantPanel = false;
  selectedParticipants: any[] = [];
  selectedStatusInfo: any = null;

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
    'participantId','type', 'currentChallenge', 'progress', 'completed', 
    'total', 'status', 'action', 'assignment'
  ];
  
  selectedJourneyFilters: string[] = [];
  selectedTierFilters: string[] = [];
  metrics = new Map<string, string[]>([
    ['totalEnrolled', []],
    ['totalStarted', []],
    ['notStarted', []],
    ['activeParticipants', []],
    ['completedParticipants', []],
  ]);
  filterOption: 'all' | 'new' | 'old' = 'all';
  filteredParticipants: any[] = [];
  loggedinProfile: string = null;
  mapProfile: any = {};
  mapProfileNew: any = {};
  loading = true;
  error: string | null = null;
  isMovingParticipant: string | null = null;
  
  unsubscribes: Unsubscribe[] = [];
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



  challengeForms: any[] = [];

  //cp workshop
  categoryWiseEnrolled: { categoryId: string; categoryName: string; count: number; profileIds: string[] }[] = [];
  categoryNamesMap: Map<string, string> = new Map();
  loadingCategories = false;
  selectedCategoryFilter: string = 'all';
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
  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    public router: Router,
    private guard: AuthguardService,
    public dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private http : HttpClient,
    private snackbarService: SnackbarService,

  ) {
    this.initializeProfileData();
    this.initializeJourneyData();
    this.setupRecalculationDebounce();
  }
  async getParticipantMetaMapForIds(profileIds: string[]) {
    var docdata = {}
    var map = {}
    var list = []
    const BATCH_SIZE = 30;
    const batches: Promise<any>[] = [];
    for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
      const batchIds = profileIds.slice(i, i + BATCH_SIZE);
      const q = query(
        collection(this.firestore, 'participant metadata'),
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
  private async initializeProfileData() {
    try {
      const userRef = collection(this.firestore, 'new_user_data');
      const userSnap = await getDocs(userRef);
      this.mapProfileNew = {};
      userSnap.forEach(doc => {
        const data = doc.data();
        data['id'] = doc.id;
        this.mapProfileNew[data['id']] = data;
      });
    } catch (err) {
      console.error('❌ Error fetching new_user_data:', err);
    }
  }
  // private async initializeProfileData() {
  //   try {

  //     const participantData = await this.guard.getParticipantMetaMap();
  //     this.mapProfile = participantData.docdata;

  //     const userRef = collection(this.firestore, 'new_user_data');
  //     const userSnap = await getDocs(userRef);

  //     this.mapProfileNew = {};

  //     userSnap.forEach(doc => {
  //       const data = doc.data();
  //       data['id'] = doc.id;

  //       this.mapProfile[data['id']] = data;
  //       this.mapProfileNew[data['id']] = data;
  //     });

  //   } catch (err) {
  //     console.error('❌ Error fetching profile data:', err);
  //   }
  // }
  // private async initializeProfileData() {
  //   const participantRef = collection(this.firestore, 'participant metadata');
  //   const userRef = collection(this.firestore, 'new_user_data');

  //   try {
  //     const [participantSnap, userSnap] = await Promise.all([
  //       getDocs(participantRef),
  //       getDocs(userRef).catch(() => null)
  //     ]);
  //     this.mapProfile = {};
  //     this.mapProfileNew = {};
  //     participantSnap.forEach(doc => {
  //       const data = doc.data();
  //       data['id'] = doc.id;
  //       this.mapProfile[data['id']] = data;
  //     });

  //     if (userSnap && !userSnap.empty) {
  //       userSnap.forEach(doc => {
  //         const data = doc.data();
  //         data['id'] = doc.id;
  //         this.mapProfile[data['id']] = data;
  //         this.mapProfileNew[data['id']] = data;
  //       });
  //     } else {
  //       console.warn('⚠️ "new_user_data" collection is missing or empty.');
  //     }

  //     console.log('✅ profile data:', this.mapProfile);
  //   } catch (err) {
  //     console.error('❌ Error fetching profile data:', err);
  //   }
  // }

  private initializeJourneyData() {
    const journeyRef = collection(this.firestore, 'journey');
    getDocs(journeyRef).then(snap => {
      snap.docs.forEach(e => {
        const element = e.data();
        element['id'] = e.id;
        this.JourneyMap[element['id']] = element['journey'];
      });
    });
    const tierRef = collection(this.firestore, 'tier');
    getDocs(tierRef).then(snaptier=> {
      snaptier.docs.forEach(e => {
        const element = e.data();
        element['id'] = e.id;
        this.tierMap[element['id']] = element['tier'];
      });
    });
  }

  private setupRecalculationDebounce() {
    this.recalculateSubject$
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.performRecalculation();
      });
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
      console.log('load dashboard....')
      this.loadWorkshopDashboard();
    }
  }
  // async ngOnInit() {
  //   try {
  //     this.filteredParticipants = this.selectedParticipants;
  //     const roles = await this.guard.getRoles();
  //     this.loggedinProfile = roles["profile_ref"].id;
  //   } catch (error) {
  //     console.error("Error loading profile:", error);
  //   }
  //   this.workshopId = this.route.snapshot.paramMap.get('id');
  //   // this.route.paramMap.subscribe(params => {
  //   //   this.workshopId = params.get('id');
  //   //   if (this.workshopId) this.loadWorkshopDashboard();
  //   // });

  //   // this.route.queryParamMap.subscribe(params => {
  //   //   if (!this.workshopId) {
  //   //     this.workshopId = params.get('workshopId');
  //   //     if (this.workshopId) this.loadWorkshopDashboard();
  //   //   }
  //   // });
  // }

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
    this.clearSelectedParticipant();
    this.unsubscribes.forEach(unsubscribe => unsubscribe());
    this.destroy$.next();
    this.destroy$.complete();
    this.participantDataCache.clear();
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

      await this.setupWorkshopSnapshot();
      await this.setupEnrolledParticipantsSnapshot();
      
      this.loading = false;
    } catch (error) {
      console.error('Error loading workshop dashboard:', error);
      this.error = 'Failed to load workshop dashboard data';
      this.loading = false;
    }
  }

  async setupWorkshopSnapshot() {
    if (!this.workshopId) return;

    const workshopRef = doc(this.firestore, 'workshopconfiguration', this.workshopId);
    const unsubscribe = onSnapshot(workshopRef, (docSnap) => {
      if (docSnap.exists()) {
        this.workshopData = { ...docSnap.data(), docid: docSnap.id };
        this.updateWorkshopDisplayData();
        this.triggerRecalculation();
        if (this.workshopData.categorybased === true) {
          this.loadCategoryNames();
        }
        // this.workshopData = { ...docSnap.data(), docid: docSnap.id };
        // this.updateWorkshopDisplayData();
        // this.triggerRecalculation();
      } else {
        this.error = 'Workshop not found';
      }
    }, (error) => {
      this.error = `Error loading workshop: ${error.message}`;
    });

    this.unsubscribes.push(unsubscribe);
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
      await this.handleDialogResult(result);
    });
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
      console.log(this.selectedParticipants, 'message participants');
      console.log('Message sent:', result);
      const { subject, message } = result;
      // const recipients = this.selectedParticipants
        const recipients = this.filteredParticipants
        .filter(participant => {
          const metadata = participant['metadata'];
          return metadata && metadata['email'] && metadata['name'];
        })
        .map(participant => {
          const metadata = participant['metadata'];
          return {
            email: metadata['email'],
            name: metadata['name']
          };
        });

      if (recipients.length === 0) {
        this.snackbarService.show('❌ No valid recipients found');
        return;
      }

      const bulkPayload = {
        type: 'mail',
        subject,
        message,
        recipients 
      };

      // let url: string = '';
      const url = this.getCloudFunctionUrl('workshopprogressmessage');

      // if (environment.firebase.projectId === 'test-environment-841c3') {
      //   console.log('Test Env 1');
      //   url = 'https://us-central1-test-environment-841c3.cloudfunctions.net/workshopprogressmessage';
      // } else if (environment.firebase.projectId === 'starlabs-test') {
      //   console.log('Test Env 2');
      //   url = 'https://us-central1-starlabs-test.cloudfunctions.net/workshopprogressmessage';
      // } else if (
      //   environment.firebase.projectId === 'fir-sample-aae4a' ||
      //   environment.firebase.projectId === 'launch-your-legacy-development'
      // ) {
      //   console.log('Production Env');
      //   url = 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage';
      // }

      try {
        const response = await firstValueFrom(
          this.http.post(url, bulkPayload, { responseType: 'json' })
        );

        console.log('Bulk email response:', response);

        const result = response as any;
        const successfulSends = result.successCount || 0;
        const failedSends = result.failureCount || 0;
        const totalParticipants = recipients.length;

        let snackBarMessage = '';
        if (successfulSends === totalParticipants) {
          snackBarMessage = `✅ Message successfully sent to all ${totalParticipants} participants!`;
        } else if (successfulSends > 0) {
          snackBarMessage = `⚠️ Sent to ${successfulSends} participants. Failed to send to ${failedSends}.`;
        } else {
          snackBarMessage = `❌ Failed to send message to all participants.`;
        }
        this.snackbarService.show(snackBarMessage);

      } catch (error) {
        console.error('Failed to send bulk emails:', error);
        this.snackbarService.show('❌ Failed to send bulk emails');
      }

    } else if (result.type === 'whatsapp') {
      console.log(this.selectedParticipants, 'WhatsApp participants');
      console.log('WhatsApp message:', result);
      const { templateName, customParams } = result;
      // const participants = this.selectedParticipants
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
            if (cc && !cc.startsWith('+')) {
              cc = '+' + cc;
            }
          let phone = metadata['phonenumber']?.toString().trim() || '';
          phone = phone.replace(/^\+/, '');
          const fullPhoneNumber = cc ? `${cc}${phone}` : phone;
          const processedParams = customParams.map((param: any) => ({
            name: param.name,
            value: param.value.replace(/\{\{name\}\}/g, name)
          }));

          return {
            phonenumber: fullPhoneNumber,
            name,
            customParams: processedParams
          };
        });

      if (participants.length === 0) {
        this.snackbarService.show('❌ No valid participants found');
        return;
      }

      const bulkPayload = {
        type: 'whatsapp',
        templateName,
        participants 
      };
      const url = this.getCloudFunctionUrl('workshopprogressmessage');
      // let url: string = '';

      // if (environment.firebase.projectId === 'test-environment-841c3') {
      //   console.log('Test Env 1');
      //   url = 'https://us-central1-test-environment-841c3.cloudfunctions.net/workshopprogressmessage';
      // } else if (environment.firebase.projectId === 'starlabs-test') {
      //   console.log('Test Env 2');
      //   url = 'https://us-central1-starlabs-test.cloudfunctions.net/workshopprogressmessage';
      // } else if (
      //   environment.firebase.projectId === 'fir-sample-aae4a' ||
      //   environment.firebase.projectId === 'launch-your-legacy-development'
      // ) {
      //   console.log('Production Env');
      //   url = 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage';
      // }

      try {
        const response = await firstValueFrom(
          this.http.post(url, bulkPayload, { responseType: 'json' })
        );

        console.log('Bulk WhatsApp response:', response);

        const result = response as any;
        const successfulSends = result.successCount || 0;
        const failedSends = result.failureCount || 0;
        const totalParticipants = participants.length;
        const broadcastName = result.broadcastName || ' ';
        let snackBarMessage = '';
        if (successfulSends === totalParticipants) {
          snackBarMessage = `WhatsApp broadcast "${broadcastName}" sent successfully to all ${totalParticipants} participants!`;
        } else if (successfulSends > 0) {
          snackBarMessage = `Broadcast "${broadcastName}": Sent to ${successfulSends} participants. Failed: ${failedSends}.`;
        } else {
          snackBarMessage = `❌ Failed to send WhatsApp message to all participants.`;
        }
        this.snackbarService.show(snackBarMessage);

      } catch (error) {
        console.error('Failed to send bulk WhatsApp:', error);
        this.snackbarService.show('❌ Failed to send bulk WhatsApp messages');
      }
    }
  } else if (result?.action === 'closed') {
    console.log('closed');
  }
}


async sendNotificationinBreakthrough(){
    console.log(this.selectedParticipants,"thisssssssss")
    const { AhNotificationComponent } = await import(
      '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component'
    );
    let dialogRef = this.dialog.open(AhNotificationComponent, {      width : "60vw",
      maxHeight: "90vh",
      disableClose:true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(profileID,"profile id worskshop notifiation");
      if(result != null && result != undefined){
        var userID = [];
        // var profileID = this.selectedParticipants.map(p => p.profileid);
        var profileID = this.filteredParticipants.map(p => p.profileid);
        console.log(profileID,"profile id worskshop notifiation");
        var notificationimage = null
        if(result["notificationimage"] != null){
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
        }).then(()=>{
          console.log( notificationimage)
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
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
        if (typeIdx > -1) {
          this.displayedColumns.splice(typeIdx, 1);
        }
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
              index: index,
              result: oldItem.result,
              date: oldItem.date ? this.formatDate(oldItem.date) : null,
              notes: oldItem.notes || [],
              isQuestionAssignment: true
            }));
          } else {
            oldResults = subChallenge.oldresult.map((oldItem: any, index: number) => ({
              index: index,
              result: oldItem.result,
              date: oldItem.date ? this.formatDate(oldItem.date) : null,
              notes: oldItem.notes || [],
              isQuestionAssignment: false
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
          quizResultsCount: quizResultsCount,
          canViewVA: subChallenge.type === 'videoask' && subChallenge.status === 'completed' && subChallenge.result,
          canViewAssignmentForm: subChallenge.type === 'assignment' && subChallenge.assignmenttype === 'form' && (subChallenge.status === 'completed' || subChallenge.status === 'inreview' || subChallenge.status === 'rework') && subChallenge.result,
          canViewAssignmentQuestion: subChallenge.type === 'assignment' && subChallenge.assignmenttype === 'question' && (subChallenge.status === 'completed' || subChallenge.status === 'inreview' || subChallenge.status === 'rework') && subChallenge.assignmentresult,
          canViewAssignmentQuestionText: subChallenge.type === 'assignment' && subChallenge.assignmenttype === 'question' && (subChallenge.status === 'completed' || subChallenge.status === 'inreview' || subChallenge.status === 'rework') && subChallenge.result && subChallenge.submissionformat === 'text',
          hasOldResults: subChallenge.oldresult && subChallenge.oldresult.length > 0,
          oldResults: oldResults,
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

    const workshopRef = doc(this.firestore, 'workshopconfiguration', this.workshopId);
    const enrolledQuery = query(
      collection(this.firestore, 'workshop participant enrolled'),
      where('workshopref', '==', workshopRef)
    );

  const unsubscribe = onSnapshot(enrolledQuery, async (querySnap) => {
        this.enrolledParticipants = querySnap.docs.map(doc => {
          const data = doc.data();
          return {
            profileid: data['profileid'],
            participantworkshopref: data['participantworkshopref'],
            enrollmentdate: data['enrollmentdate'],
            workshopStartedAt: data['workshopStartedAt'],
            status: data['status'],
            workshopcategory: data['workshopcategory'] || null,
            id: doc.id
          };
        });
        const enrolledProfileIds = this.enrolledParticipants.map(p => p.profileid);
        const participantData = await this.getParticipantMetaMapForIds(enrolledProfileIds);
        this.mapProfile = { ...participantData.docdata, ...this.mapProfileNew };
        if (this.workshopData?.categorybased === true) {
          this.participantCohortMap.clear();
          this.participantWorkshopCategoryMap.clear();
          const promises = this.enrolledParticipants.map(async (p) => {
            try {
              const snap = await getDoc(p.participantworkshopref);
              if (snap.exists()) {
                const data = snap.data();
                this.participantCohortMap.set(p.profileid, data['cohortparticipant'] === true);
                if (data['workshopcategory']) {
                  this.participantWorkshopCategoryMap.set(p.profileid, data['workshopcategory']);
                }
              }
            } catch (e) {
              console.error(`Error fetching participant workshop for ${p.profileid}:`, e);
            }
          });
          await Promise.all(promises);
          this.updateCohortCount();
        }

        this.updateMetrics();
        this.setupParticipantProgressSnapshots();
      }, (error) => {
        this.error = `Error loading participants: ${error.message}`;
      });

    this.unsubscribes.push(unsubscribe);
  }
  updateCohortCount() {
    this.cohortParticipantProfileIds = this.enrolledParticipants
      .filter(p => this.participantCohortMap.get(p.profileid) === true)
      .map(p => p.profileid);
    this.cohortParticipantCount = this.cohortParticipantProfileIds.length;
  }

  setupParticipantProgressSnapshots() {
    const enrolledParticipantsForProgress = this.enrolledParticipants.filter(p => p.status === 'enrolled');
    const allRefs = enrolledParticipantsForProgress.map(p => p.participantworkshopref);
    Promise.all(allRefs.map(ref => getDoc(ref))).then(snapshots => {
      snapshots.forEach((docSnap, idx) => {
        if (!docSnap.exists()) return;
        const participant = enrolledParticipantsForProgress[idx];
        const participantData = docSnap.data();
        const progress = this.calculateParticipantProgress(
          participant.profileid,
          participantData['challenges'] || []
        );
        this.participantDataCache.set(participant.profileid, {
          progress,
          challenges: participantData['challenges']
        });
        const existingIndex = this.participantProgressList.findIndex(
          p => p.profileid === participant.profileid
        );
        if (existingIndex >= 0) {
          this.participantProgressList[existingIndex] = progress;
        } else {
          this.participantProgressList.push(progress);
        }
      });
      this.triggerRecalculation();
      enrolledParticipantsForProgress.forEach(participant => {
        const unsubscribe = onSnapshot(participant.participantworkshopref, (docSnap) => {
          if (!docSnap.exists()) return;
          const participantData = docSnap.data();
          const progress = this.calculateParticipantProgress(
            participant.profileid,
            participantData['challenges'] || []
          );
          this.participantDataCache.set(participant.profileid, {
            progress,
            challenges: participantData['challenges']
          });
          const existingIndex = this.participantProgressList.findIndex(
            p => p.profileid === participant.profileid
          );
          if (existingIndex >= 0) {
            this.participantProgressList[existingIndex] = progress;
          } else {
            this.participantProgressList.push(progress);
          }
          this.triggerRecalculation();
          if (this.selectedParticipantData?.profileid === participant.profileid) {
            this.updateParticipantDisplayData();
          }
        }, (error) => {
          console.error(`Error loading progress for ${participant.profileid}:`, error);
        });

        this.unsubscribes.push(unsubscribe);
      });
    });
  }
  // setupParticipantProgressSnapshots() {
  //     const enrolledParticipantsForProgress = this.enrolledParticipants.filter(p => p.status === 'enrolled');
      
  //     enrolledParticipantsForProgress.forEach(participant => {
  //       const unsubscribe = onSnapshot(participant.participantworkshopref, (docSnap) => {
  //         if (docSnap.exists()) {
  //           const participantData = docSnap.data();
  //           const progress = this.calculateParticipantProgress(
  //             participant.profileid, 
  //             participantData['challenges'] || []
  //           );
  //           this.participantDataCache.set(participant.profileid, {
  //             progress,
  //             challenges: participantData['challenges']
  //           });
            
  //           const existingIndex = this.participantProgressList.findIndex(
  //             p => p.profileid === participant.profileid
  //           );
            
  //           if (existingIndex >= 0) {
  //             this.participantProgressList[existingIndex] = progress;
  //           } else {
  //             this.participantProgressList.push(progress);
  //           }
  //           this.triggerRecalculation();
            
  //           if (this.selectedParticipantData?.profileid === participant.profileid) {
  //             this.updateParticipantDisplayData();
  //           }
  //         }
  //       }, (error) => {
  //         console.error(`Error loading progress for ${participant.profileid}:`, error);
  //       });

  //       this.unsubscribes.push(unsubscribe);
  //     });
  //   }
  //   setupParticipantProgressSnapshots() {
  //   const enrolledParticipantsForProgress = this.enrolledParticipants.filter(p => p.status === 'enrolled');
    
  //   enrolledParticipantsForProgress.forEach(participant => {
  //     const unsubscribe = onSnapshot(participant.participantworkshopref, (docSnap) => {
  //       if (docSnap.exists()) {
  //         const participantData = docSnap.data();
  //         const progress = this.calculateParticipantProgress(
  //           participant.profileid, 
  //           participantData['challenges'] || []
  //         );
  //         this.participantDataCache.set(participant.profileid, {
  //           progress,
  //           challenges: participantData['challenges']
  //         });
          
  //         const existingIndex = this.participantProgressList.findIndex(
  //           p => p.profileid === participant.profileid
  //         );
          
  //         if (existingIndex >= 0) {
  //           this.participantProgressList[existingIndex] = progress;
  //         } else {
  //           this.participantProgressList.push(progress);
  //         }
  //         this.triggerRecalculation();
          
  //         if (this.selectedParticipantData?.profileid === participant.profileid) {
  //           this.updateParticipantDisplayData();
  //         }
  //       }
  //     }, (error) => {
  //       console.error(`Error loading progress for ${participant.profileid}:`, error);
  //     });

  //     this.unsubscribes.push(unsubscribe);
  //   });
  // }
 private triggerRecalculation() {
    if (this.isCalculating) {
      this.pendingRecalculation = true;
      return;
    }
    this.recalculateSubject$.next();
  }
  getFilteredTableParticipants(): any[] {
    if (this.workshopData?.categorybased !== true) {
      return this.participantProgressList;
    }

    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];

    if (this.selectedCategoryFilter === 'cohort') {
      return this.participantProgressList.filter(p => this.participantCohortMap.get(p.profileid) === true);
    }

    if (this.selectedCategoryFilter === 'facilitator') {
      return this.participantProgressList.filter(p => facilitatorProfiles.includes(p.profileid));
    }

    if (this.selectedCategoryFilter !== 'all') {
      return this.participantProgressList.filter(p => {
        if (this.participantCohortMap.get(p.profileid) === true) return true;
        if (facilitatorProfiles.includes(p.profileid)) return true;
        return this.participantWorkshopCategoryMap.get(p.profileid) === this.selectedCategoryFilter;
      });
    }

    return this.participantProgressList;
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
      return challenges[i].challenges![j-1].status === 'completed';
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
      .filter(p => p.status === 'enrolled')
      .map(p => p.profileid);
    const notStartedParticipants = this.enrolledParticipants
      .filter(p => p.status === 'enrollednotstarted')
      .map(p => p.profileid);
    const activeParticipants = this.participantProgressList
      .filter(p => p.progressPercentage > 0)
      .map(p => p.profileid);
    const completedParticipants = this.participantProgressList
      .filter(p => p.progressPercentage === 100)
      .map(p => p.profileid);

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
  }
async loadCategoryNames() {
    const categoryIds: string[] = this.workshopData?.categoriesforthisworkshop || [];
    if (categoryIds.length === 0) return;

    this.loadingCategories = true;
    try {
      const promises = categoryIds.map(async (catId: string) => {
        const catDoc = await getDoc(doc(this.firestore, 'workshopcategory', catId));
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
    if (categoryIds.length === 0) {
      this.categoryWiseEnrolled = [];
      return;
    }

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
    const participantIds = category.profileIds;
    this.selectedParticipants = participantIds.map((id: string) => ({
      profileid: id,
      name: this.mapProfile[id]?.name || 'Unknown',
      metadata: this.mapProfile[id]
    }));

    this.selectedStatusInfo = {
      status: 'categoryEnrolled',
      challengeName: category.categoryName,
      subChallengeName: `${category.categoryName} Enrolled`,
      count: participantIds.length
    };

    this.showParticipantPanel = true;
    this.filterOption = 'all';
    this.applyFilterSide();
  }
  // recalculateStatistics() {
  //   if (!this.workshopData) return;
    
  //   this.updateMetrics();
  //   this.challengeStatistics = [];
  //   const progressList = this.getFilteredParticipantProgressList();

  //   this.workshopData.challenges?.forEach((challenge: any, challengeIndex: number) => {
  //     const challengeStats = {
  //       challengeIndex,
  //       challengeName: `${challenge.heading}: ${challenge.subheading}`,
  //       participantsByStatus: new Map(),
  //       subChallengeStats: [],
  //       workshopcategory: challenge.workshopcategory || []
  //     };

  //     if (challenge.type === 'challenge' && challenge.challenges) {
  //       this.calculateChallengeStats(challenge, challengeIndex, challengeStats);
  //     } else if (challenge.type === 'zoomcall') {
  //       this.calculateZoomCallStats(challenge, challengeIndex, challengeStats);
  //     }

  //     this.challengeStatistics.push(challengeStats);
  //   });
    
  //   this.prepareAssignmentsList();
  //   this.loadChallengeForms()
  // }

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
  private isParticipantReadyForChallenge(participant: any, challengeIndex: number): boolean {
    if (challengeIndex === 0) {
      return true;
    }
    let previousNonZoomIndex = -1;
    for (let i = challengeIndex - 1; i >= 0; i--) {
      const workshopChallenge = this.workshopData?.challenges?.[i];
      if (workshopChallenge?.type !== 'zoomcall') {
        previousNonZoomIndex = i;
        break;
      }
    }
    
    if (previousNonZoomIndex === -1) {
      return true;
    }
    
    const previousStatus = this.getParticipantChallengeStatus(participant, previousNonZoomIndex);
    return previousStatus === 'completed';
  }
  private isParticipantReadyForSubChallenge(participant: any, challengeIndex: number, subChallengeIndex: number): boolean {
    const challenge = participant.challenges[challengeIndex];
    if (subChallengeIndex === 0) {
      if (challengeIndex === 0) {
        return true;
      }
      
      let previousNonZoomIndex = -1;
      for (let i = challengeIndex - 1; i >= 0; i--) {
        const workshopChallenge = this.workshopData?.challenges?.[i];
        if (workshopChallenge?.type !== 'zoomcall') {
          previousNonZoomIndex = i;
          break;
        }
      }
      
      if (previousNonZoomIndex === -1) {
        return true;
      }
      
      const previousStatus = this.getParticipantChallengeStatus(participant, previousNonZoomIndex);
      return previousStatus === 'completed';
    }
    const previousSubChallenge = challenge?.challenges?.[subChallengeIndex - 1];
    return previousSubChallenge?.status === 'completed';
  }
  calculateZoomCallStats(challenge: any, challengeIndex: number, challengeStats: any, progressList?: any[]) {
      const participants = progressList || this.participantProgressList;
      const isCompleted = challenge.status === 'completed';
      const allParticipants = participants.map(p => p.profileid);
      
      challengeStats.participantsByStatus.set('completed', isCompleted ? allParticipants : []);
      challengeStats.participantsByStatus.set('notstarted', isCompleted ? [] : allParticipants);
      
      const zoomCallStats = {
        subChallengeIndex: 0,
        subChallengeName: challenge.subheading || 'Zoom Call',
        type: 'zoomcall',
        participantsByStatus: new Map([
          ['completed', isCompleted ? allParticipants : []],
          ['notstarted', isCompleted ? [] : allParticipants]
        ])
      };

      challengeStats.subChallengeStats.push(zoomCallStats);
    }

  calculateChallengeDisplayStatus(challenge: any, challengeIndex: number): string {
    if (challenge.type === 'zoomcall') {
      return challenge.status || 'notstarted';
    }

    if (challenge.type === 'challenge' && challenge.challenges) {
      const subChallenges = challenge.challenges;
      
      const completedCount = subChallenges.filter((sc: any) => sc.status === 'completed').length;
      if (completedCount === subChallenges.length) {
        return 'completed';
      }
      
      const hasAnyProgress = subChallenges.some((sc: any) => 
        sc.status && sc.status !== 'notstarted'
      );
      
      if (hasAnyProgress) {
        return 'inprogress';
      }
    }
    
    return challenge.status || 'notstarted';
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }
  get totalNewUsers(): number {
    return Object.keys(this.mapProfileNew).length;
  }
  get totalNewUsersEnrolled(): number {
    const enrolledProfileIds = this.enrolledParticipants.map(p => p.profileid);
    return Object.keys(this.mapProfileNew)
      .filter(profileId => enrolledProfileIds.includes(profileId))
      .length;
  }
  get totalNewUsersNotEnrolled(): number {
    const enrolledProfileIds = this.enrolledParticipants.map(p => p.profileid);
    return Object.keys(this.mapProfileNew)
      .filter(profileId => !enrolledProfileIds.includes(profileId))
      .length;
  }

  get totalEnrolled() { return this.metrics.get('totalEnrolled')?.length || 0; }
  get totalStarted() { return this.metrics.get('totalStarted')?.length || 0; }
  get notStarted() { return this.metrics.get('notStarted')?.length || 0; }
  get activeParticipants() { return this.metrics.get('activeParticipants')?.length || 0; }
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

  onMetricClick(metricType: string) {
    if (metricType === 'totalNewUsers') {
      const newUserIds = Object.keys(this.mapProfileNew);
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
        subChallengeName: this.statusDisplayMap.get(metricType) || 'New Users',
        count: newUserParticipants.length
      };
      
      this.showParticipantPanel = true;
      this.filterOption = 'new'; 
      this.applyFilterSide();
    }else if (metricType === 'totalNewUsersNotEnrolled') {
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
      this.filterOption = 'new';
      this.applyFilterSide();
    }  
    else {
      const participantIds = this.metrics.get(metricType);
      this.selectedParticipants = participantIds.map(id => ({
        profileid: id,
        name: this.mapProfile[id]?.name || 'Unknown',
        metadata: this.mapProfile[id]
      }));
      
      this.selectedStatusInfo = {
        status: metricType,
        challengeName: 'All Participants',
        subChallengeName: this.statusDisplayMap.get(metricType) || metricType,
        count: participantIds.length
      };
      
      this.showParticipantPanel = true;
      this.filterOption = 'all';
      this.selectedJourneyFilters = [];
      this.selectedTierFilters = [];
      this.applyFilterSide();
    }
  }

  onChallengeMainStatusClick(status: string, challengeIndex: number, count: number) {
    const challengeStats = this.challengeStatistics[challengeIndex];
    const participantIds = challengeStats?.participantsByStatus.get(status) || [];

    this.showParticipantList(participantIds, {
      status,
      challengeIndex,
      subChallengeIndex: -1,
      challengeName: challengeStats?.challengeName || 'Unknown Challenge',
      subChallengeName: 'Main Challenge Status',
      count
    });
  }

  onStatusClick(status: string, challengeIndex: number, subChallengeIndex: number, count: number) {
    const challengeStats = this.challengeStatistics[challengeIndex];
    const subStats = challengeStats?.subChallengeStats[subChallengeIndex];
    const participantIds = subStats?.participantsByStatus.get(status) || [];

    this.showParticipantList(participantIds, {
      status,
      challengeIndex,
      subChallengeIndex,
      challengeName: challengeStats?.challengeName || 'Unknown Challenge',
      subChallengeName: subStats?.subChallengeName || 'Unknown Sub-Challenge',
      count
    });
  }

  showParticipantList(participantIds: string[], statusInfo: any) {
    this.selectedParticipants = participantIds.map(id => ({
      profileid: id,
      name: this.mapProfile[id]['name'] || 'Unknown',
      metadata : this.mapProfile[id]
    }));

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
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      data: {
        workshopId: this.workshopId,
        workshopTitle: this.workshopTitle
      },
      disableClose: false,
      panelClass: 'fullscreen-dialog',
      hasBackdrop: true,
      backdropClass: 'fullscreen-backdrop'
    });
  }

  async openClearDialog() {
    const { ClearWorkshopComponent } = await import('./clear-workshop/clear-workshop.component');
    this.dialog.open(ClearWorkshopComponent, {
      data: {
        participants: this.enrolledParticipants,
        mapProfile: this.mapProfile
      },
      width: '90vw',
      height: '90vh',
      maxWidth: '100vw',
      maxHeight: '100vh'
    });
  }

  async openNewUserDialog() {
    const { NewusersComponent } = await import('../newusers/newusers.component');
    this.dialog.open(NewusersComponent, {
      data: {
        mapProfile: this.mapProfileNew,
        mapProfileold: this.mapProfile
      },
      width: '90vw',
      height: '90vh',
      maxWidth: '100vw',
      maxHeight: '100vh'
    });
  }

  async openZoomDialog(zoomdata: any, index: number) {
    const { ZoomCallComponent } = await import('./zoom-call/zoom-call.component');
    const dialogRef = this.dialog.open(ZoomCallComponent, {
      data: {
        mapProfile: this.mapProfileNew,
        mapProfileold: this.mapProfile,
        zoomdata: zoomdata
      },
      width: '90vw',
      height: '90vh',
      maxWidth: '100vw',
      maxHeight: '100vh'
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result || !Array.isArray(result.profileIds)) {
        console.warn('No profileIds returned from dialog or profileIds is not an array');
        return;
      }
      console.log('Selected Profile IDs sheet:', result.profileIds);
    });
  }


  async reviewAssignment(participant: any) {
    console.log(participant,"review assignment clicked");
    
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
      width: '90vw',
      maxWidth: '1200px',
      maxHeight: '90vh',
      data: assignmentLog,
      disableClose: true
    });
  }
  onFormPreview(form: any) {
    const path = doc(this.firestore, 'formsByClient', form['docid']).path;
    const queryParams: any = {
      id: form.formid,
      type: 'form',
      patchdata: path,
      profileid: form.profileid,
      workshopref: form.workshopref,
      challengeIndex: form.challengeIndex,
      subChallengeIndex: form.subChallengeIndex,
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

    const url = this.router.createUrlTree(['/formtemplateworkshop'], {
      queryParams: queryParams
    });
    window.open(url.toString(), '_blank');
  }

  viewOldForm(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number, oldResultIndex: number): void {
    try {
      if (!this.selectedParticipantData || !displaySubChallenge.hasOldResults) {
        console.error('Missing required data for viewing old form');
        return;
      }

      const oldResult = displaySubChallenge.oldResults[oldResultIndex];
      const subChallenge = displaySubChallenge.metadata.originalData;
      const contentref = subChallenge.contentref;
      
      const formData = {
        formid: contentref.id,
        docid: oldResult.result.id,
        profileid: this.selectedParticipantData.profileid,
        workshopref: this.selectedParticipantData.participantworkshopref.path,
        challengeIndex: challengeIndex,
        subChallengeIndex: subChallengeIndex,
        reviewid: subChallenge.reviewid || subChallenge.formid,
        readonly: true,
        isOldResult: true,
        oldResultIndex: oldResultIndex,
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
    if (!this.selectedParticipantData || !displaySubChallenge.hasOldResults) {
      console.error('Missing required data for viewing old question assignment');
      return;
    }
    const oldResult = displaySubChallenge.oldResults[oldResultIndex];
    const subChallenge = displaySubChallenge.metadata.originalData;
    const assignmentData = {
      profileid: this.selectedParticipantData.profileid,
      workshopref: this.selectedParticipantData.participantworkshopref.path,
      challengeIndex: challengeIndex,
      subChallengeIndex: subChallengeIndex,
      assignmentresult: oldResult.result,
      uploadtype: subChallenge.uploadtype,
      isOldResult: true,
      oldResultIndex: oldResultIndex,
      oldResultNotes: oldResult.notes || [],
      oldResultDate: oldResult.date,
      assignmenttype: 'question',
      type: 'assignment',
      name: subChallenge.name,
      description: subChallenge.description
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
    if (oldResult.isQuestionAssignment) {
      return `Click to view previous question assignment from ${oldResult.date}`;
    } else {
      return `Click to view previous form submission from ${oldResult.date}`;
    }
  }
viewQuestionAssignment(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number): void {
  try {
    if (!this.selectedParticipantData || !displaySubChallenge.canViewAssignmentQuestion) {
      console.error('Missing required data for viewing question assignment');
      return;
    }

    const subChallenge = displaySubChallenge.metadata.originalData;
    const subChallengeStatus = subChallenge['status'];
    console.log(subChallengeStatus,"consolinggggg assignmenttttttttttttttttttt");
    
    const assignmentData = {
      profileid: this.selectedParticipantData.profileid,
      workshopref: this.selectedParticipantData.participantworkshopref.path,
      challengeIndex: challengeIndex,
      subChallengeIndex: subChallengeIndex,
      status:subChallengeStatus,
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
    if (!this.selectedParticipantData || !displaySubChallenge.metadata.hasResult) {
      console.error('Missing required data for viewing form');
      return;
    }

    const subChallenge = displaySubChallenge.metadata.originalData;
    
    if (subChallenge.type !== 'form' && subChallenge.assignmenttype !== 'form') {
      console.error('Invalid assignment type for form view');
      return;
    }

    const resultRef = subChallenge.result;
    const contentref = subChallenge.contentref;
    const getStatus = subChallenge.status;
    const reviewid = getStatus === 'rework' ? null : subChallenge.reviewid || subChallenge.formid;
    
    const formData = {
      formid: contentref.id,
      docid: resultRef.id,
      profileid: this.selectedParticipantData.profileid,
      workshopref: this.selectedParticipantData.participantworkshopref.path,
      challengeIndex: challengeIndex,
      subChallengeIndex: subChallengeIndex,
      reviewid: reviewid,
      readonly: true
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
    if (!this.selectedParticipantData || !displaySubChallenge.canViewVA) {
      console.error('Missing required data for viewing VideoAsk');
      return;
    }

    const subChallenge = displaySubChallenge.metadata.originalData;
    const resultRef = subChallenge.result;
    
    if (!resultRef) {
      console.error('No result reference found for VideoAsk');
      this.error = 'VideoAsk result not found';
      return;
    }

    const docSnap = await getDoc(resultRef);
    
    if (!docSnap.exists()) {
      console.error('VideoAsk result document not found');
      this.error = 'VideoAsk data not found';
      return;
    }

    const resultData = docSnap.data();
    const downloadURL = resultData['fileurl'];
    
    if (!downloadURL) {
      console.error('Download URL not found in VideoAsk result');
      this.error = 'VideoAsk URL not available';
      return;
    }

  
    window.open(downloadURL, '_blank');
    
  } catch (error) {
    console.error('Error opening VideoAsk:', error);
    this.error = 'Failed to open VideoAsk. Please try again.';
  }
}
async viewQuiz(displaySubChallenge: any, challengeIndex: number, subChallengeIndex: number): Promise<void> {
  try {
    if (!this.selectedParticipantData || !displaySubChallenge.canViewQuiz) {
      console.error('Missing required data for viewing Quiz');
      return;
    }

    const subChallenge = displaySubChallenge.metadata.originalData;
    const resultRefs = subChallenge.quizResults; 
    
    if (!resultRefs || !Array.isArray(resultRefs) || resultRefs.length === 0) {
      console.error('No quiz result references found');
      this.error = 'Quiz results not found';
      return;
    }

  
    const quizPromises = resultRefs.map(async (resultRef: any) => {
      const docSnap = await getDoc(resultRef);
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          data: docSnap.data(),
          ref: resultRef
        };
      }
      return null;
    });

    const quizResults = await Promise.all(quizPromises);
    const validQuizResults = quizResults.filter(result => result !== null);

    if (validQuizResults.length === 0) {
      console.error('No valid quiz result documents found');
      this.error = 'Quiz data not found';
      return;
    }

    console.log('Quiz Results:', validQuizResults);
    const participantName = this.mapProfile[this.selectedParticipantData.profileid]['name'] || 'Unknown';
    const { QuizDialogComponent } = await import('./quizbyclients/quizbyclients-dialog.component');
    const dialogRef = this.dialog.open(QuizDialogComponent, {
      width: '90vw',
      maxWidth: '900px',
      maxHeight: '90vh',
      data: {
        quizResults: validQuizResults,
        participantName: participantName,
        challengeIndex: challengeIndex,
        subChallengeIndex: subChallengeIndex
      },
      disableClose: false,
      panelClass: 'quiz-dialog-panel'
    });
    dialogRef.afterClosed().subscribe(result => {
      console.log('Quiz dialog was closed');
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
      
      while (challenges.length <= participant.currentChallengeIndex) {
        challenges.push({});
      }

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
      
      console.log(`Participant ${participant.profileid} moved to next challenge successfully`);
    } catch (error) {
      console.error('Error moving participant to next challenge:', error);
      this.error = `Failed to move participant: ${error}`;
    } finally {
      this.isMovingParticipant = null;
    } 
  } else {
    alert('No Access')
  }
  }
    getButtonText(participant: any): string {
      if (participant.progressPercentage === 100) {
        return 'Completed';
      }
      
      const currentChallenge = this.workshopData?.challenges[participant.currentChallengeIndex];
      if (currentChallenge?.type === 'zoomcall') {
        return 'Zoom Call';
      }
      
      return 'Move Next';
    }

    getButtonTooltip(participant: any): string {
      if (participant.progressPercentage === 100) {
        return 'Workshop completed';
      }
      
      const currentChallenge = this.workshopData?.challenges[participant.currentChallengeIndex];
      if (currentChallenge?.type === 'zoomcall') {
        return 'Zoom call challenges cannot be moved manually';
      }
      
      return 'Move to next challenge';
    }

  updateChallengeProgress(currentChallenge: any, participant: any, workshopChallenge: any, now: any) {
    if (!currentChallenge.challenges) currentChallenge.challenges = [];
    
    let subChallenges = [...currentChallenge.challenges];
    
    while (subChallenges.length <= participant.currentSubChallengeIndex) {
      subChallenges.push({});
    }

    const workshopSubChallenge = workshopChallenge.challenges![participant.currentSubChallengeIndex];
    
    subChallenges[participant.currentSubChallengeIndex] = {
      ...workshopSubChallenge,
      status: 'completed',
      completed: now,
      manualcompletion: true
    };

    currentChallenge.challenges = subChallenges;

    const totalSubChallenges = workshopChallenge.challenges!.length;
    const completedSubChallenges = subChallenges.filter(sc => sc.status === 'completed').length;
    
    if (completedSubChallenges === totalSubChallenges) {
      Object.assign(currentChallenge, {
        ...workshopChallenge,
        challenges: subChallenges,
        status: 'completed',
        completed: now,
        manualcompletion: true
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
    } catch (error) {
      return false;
    }
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
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
      
      this.loadParticipantWorkshopData(participant.profileid);
      
      setTimeout(() => {
        this.scrollToParticipantData();
      }, 500);
    }
  }

  scrollToParticipantData(): void {
    const element = document.querySelector('.participant-data-card');
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    }
  }

  async loadParticipantWorkshopData(profileId: string) {
    try {
      this.loadingParticipantWorkshop = true;
      this.participantWorkshopError = null;
      this.participantWorkshopData = null;

      const enrolledParticipant = this.enrolledParticipants.find(
        ep => ep.profileid === profileId
      );

      if (!enrolledParticipant) {
        throw new Error('Enrolled participant not found');
      }

      const unsubscribe = onSnapshot(
        enrolledParticipant.participantworkshopref,
        (docSnap) => {
          if (docSnap.exists()) {
            this.participantWorkshopData = {
              id: docSnap.id,
              ...docSnap.data()
            };
            this.loadingParticipantWorkshop = false;
            this.updateParticipantDisplayData();
          } else {
            this.participantWorkshopError = 'Participant workshop data not found';
            this.loadingParticipantWorkshop = false;
          }
        },
        (error) => {
          console.error('Error loading participant workshop data:', error);
          this.participantWorkshopError = `Error loading data: ${error.message}`;
          this.loadingParticipantWorkshop = false;
        }
      );
      this.unsubscribes.push(unsubscribe);

    } catch (error) {
      console.error('Error setting up participant workshop data listener:', error);
      this.participantWorkshopError = `Failed to load participant data: ${error}`;
      this.loadingParticipantWorkshop = false;
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

  getParticipantChallengeStatus(participant: any, challengeIndex: number): string {
    const challenge = participant.challenges[challengeIndex];
    const workshopChallenge = this.workshopData?.challenges?.[challengeIndex];
    
    if (!challenge) return 'notstarted';
    
    if (challenge.type === 'zoomcall') {
      return workshopChallenge?.status === 'completed' ? 'completed' : 'notstarted';
    }
    
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
  exportParticipantsToCSV() {
    const confirmDownload = window.confirm("Are you sure you want to export participants as CSV?");
    if (!confirmDownload) {
      return;
    }

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
      const participantProgress = this.participantProgressList.find(
        p => p.profileid === enrolledParticipant.profileid
      );
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
      const enrollmentDate = enrolledParticipant.enrollmentdate ? 
        this.formatDate(enrolledParticipant.enrollmentdate) : 'N/A';
      const workshopStartedDate = enrolledParticipant.workshopStartedAt ? 
        this.formatDate(enrolledParticipant.workshopStartedAt) : 'Not Started';
      let overallStatus = 'Not Started';
      if (participantProgress) {
        if (participantProgress.progressPercentage === 100) {
          overallStatus = 'Completed';
        } else if (participantProgress.progressPercentage > 0) {
          overallStatus = 'In Progress';
        }
      }
      const csvRow = {
        'Participant Name': participantName,
        'Workshop Title': workshopTitle,
        'Enrollment Status': enrolledParticipant.status,
        'Overall Progress Status': overallStatus,
        'Enrollment Date': enrollmentDate,
        'Workshop Started Date': workshopStartedDate,
        'Challenge Number': challengeNumber,
        'Current Challenge': currentChallengeName,
        'Current Challenge Type': currentChallengeType,
        'Completed Challenges': participantProgress ? participantProgress.completedChallenges : 0,
        'Total Challenges': participantProgress ? participantProgress.totalChallenges : 0,
        'Progress Percentage': participantProgress ? Math.round(participantProgress.progressPercentage) + '%' : '0%',
        'Workshop Start Date': this.workshopStartDateFormatted,
        'Workshop End Date': this.workshopEndDateFormatted
      };
      
      csvData.push(csvRow);
    });
    
    return csvData;
  }


  private createCSVContent(data: any[]): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header];
        if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
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
  console.log('Loading assignments from participant progress...');
  
  if (!this.participantProgressList || this.participantProgressList.length === 0) {
    console.log('No participant progress list available');
    this.assignmentsList = [];
    return;
  }

  
  const assignmentsMap = new Map<string, any>();

  this.participantProgressList.forEach(participant => {
    if (!participant.challenges || !Array.isArray(participant.challenges)) {
      return;
    }

    participant.challenges.forEach((challenge: any, challengeIndex: number) => {
      if (!challenge.challenges || !Array.isArray(challenge.challenges)) {
        return;
      }

      challenge.challenges.forEach((subChallenge: any, subChallengeIndex: number) => {
        if (subChallenge.type === 'assignment' && 
            (subChallenge.status === 'completed' || 
             subChallenge.status === 'inreview' || 
             subChallenge.status === 'rework')) {
          const assignmentKey = `${challengeIndex}-${subChallengeIndex}`;
          if (!assignmentsMap.has(assignmentKey)) {
            assignmentsMap.set(assignmentKey, {
              challengeIndex,
              subChallengeIndex,
              challengeName: `${challenge.heading || 'Challenge'}: ${challenge.subheading || ''}`,
              assignmentName: subChallenge.name || 'Untitled Assignment',
              assignmentType: subChallenge.assignmenttype || 'Unknown',
              description: subChallenge.description || '',
              participants: []
            });
          }
          const participantData = {
            profileid: participant.profileid,
            name: this.mapProfile[participant.profileid]?.['name'] || 'Unknown',
            status: subChallenge.status,
            completedDate: subChallenge.completed ? this.formatDate(subChallenge.completed) : null,
            assignmentType: subChallenge.assignmenttype,
            hasResult: !!(subChallenge.result || subChallenge.assignmentresult),
            result: subChallenge.result,
            assignmentresult: subChallenge.assignmentresult,
            reviewid: subChallenge.reviewid,
            contentref: subChallenge.contentref,
            uploadtype: subChallenge.uploadtype,
            submissionformat: subChallenge.submissionformat,
            oldResults: subChallenge.oldresult || [],
            completionNotes: subChallenge.completionNotes || [],
            enrolledParticipant: this.enrolledParticipants.find(ep => ep.profileid === participant.profileid)
          };

          assignmentsMap.get(assignmentKey)!.participants.push(participantData);
        }
      });
    });
  });
  this.assignmentsList = Array.from(assignmentsMap.values());
  
  console.log('Total assignments found:', this.assignmentsList.length);
  console.log('Assignments array:', this.assignmentsList);
}
viewParticipantAssignment(assignment: any, participant: any) {
  const challengeIndex = assignment.challengeIndex;
  const subChallengeIndex = assignment.subChallengeIndex;
  
  if (participant.assignmentType === 'form') {
    const formData = {
      formid: participant.contentref.id,
      docid: participant.result.id,
      profileid: participant.profileid,
      workshopref: participant.enrolledParticipant.participantworkshopref.path,
      challengeIndex: challengeIndex,
      subChallengeIndex: subChallengeIndex,
      reviewid: participant.reviewid,
      readonly: true
    };
    
    if (participant.status === 'completed' && participant.completionNotes.length > 0) {
      formData['isCompletedAssignment'] = true;
      formData['completionNotes'] = JSON.stringify(participant.completionNotes);
    }
    
    this.onFormPreview(formData);
  } else if (participant.assignmentType === 'question' && participant.submissionformat === 'upload' ) {
    const assignmentData = {
      profileid: participant.profileid,
      workshopref: participant.enrolledParticipant.participantworkshopref.path,
      challengeIndex: challengeIndex,
      subChallengeIndex: subChallengeIndex,
      assignmentresult: participant.assignmentresult,
      uploadtype: participant.uploadtype,
      status: participant.status,
      assignmenttype: 'question',
      type: 'assignment',
      name: assignment.assignmentName,
      description: assignment.description
    };
    
    this.openAssignmentDialog(assignmentData);
  } else {
    return null
  }
}
exportParticipants() {
  console.log(this.selectedParticipants,"this.selectedParticipantsthis.selectedParticipants");
  
  if (!this.selectedParticipants || this.selectedParticipants.length === 0) {
    alert("No participants selected to export.");
    return;
  }

  const confirmDownload = window.confirm("Are you sure you want to export participants as CSV?");
  if (!confirmDownload) {
    return;
  }
  const csvData = this.selectedParticipants.map((p: any) => ({
    'Participant Name': p.name || 'N/A',
    'Email': p['metadata']['email'] || '',
    'Phone': p['metadata']['phonenumber'] || '',
    'Active Journey': this.JourneyMap[p['metadata']['activejourney']] || '',
    'Last Journey': this.JourneyMap[p['metadata']['lastcompletedjourney']] || '',
    'Subscription End': this.formatDate(p['metadata']['subscriptionend']) || '',
    // 'Phone': p.phone || ''
  }));

  const csvContent = this.createCSVContent(csvData);
  const fileName = `workshop-participants-${this.workshopData?.detailpage?.title || 'workshop'}-${new Date().toISOString().split('T')[0]}.csv`;
  this.downloadCSV(csvContent, fileName);
}

  async manualenroll() {
    const { EnrollComponent } = await import('./enroll/enroll.component');
    const dialogRef = this.dialog.open(EnrollComponent, {
      width: '400px',
      data: {
        workshopId: this.workshopId,
        profiledata: this.mapProfile
      }
    });

    dialogRef.afterClosed().subscribe(result => {});
  }


loadChallengeForms(): void {
  console.log('Loading challenge forms from participant progress...');
  
  if (!this.participantProgressList || this.participantProgressList.length === 0) {
    console.log('No participant progress list available');
    this.challengeForms = [];
    return;
  }

  const formsMap = new Map<string, any>();

  this.participantProgressList.forEach(participant => {
    if (!participant.challenges || !Array.isArray(participant.challenges)) {
      return;
    }

    participant.challenges.forEach((challenge: any, challengeIdx: number) => {
      if (!challenge.challenges || !Array.isArray(challenge.challenges)) {
        return;
      }

      challenge.challenges.forEach((subchallenge: any, subIdx: number) => {
        if (subchallenge.type === 'form' && subchallenge.status && subchallenge.status === 'completed') {
          const formKey = `${challengeIdx}-${subIdx}`;
          if (!formsMap.has(formKey)) {
            formsMap.set(formKey, {
              title: subchallenge.name || subchallenge.title || 'Untitled Form',
              formlink: subchallenge.formlink || null,
              challengeTitle: challenge.heading || challenge.title || 'Challenge',
              subChallengeIndex: subIdx,
              challengeIndex: challengeIdx,
              participants: []
            });
          }
          const participantData = {
            name: this.mapProfile[participant.profileid]?.['name'] || 'Unknown',
            profileid: participant.profileid,
            profilePictureUrl: this.mapProfile[participant.profileid]?.['profilepic'] || null,
            status: subchallenge.status,
            submittedDate: subchallenge.completed || null,
            formSubmitted: subchallenge.status === 'completed'
          };

          formsMap.get(formKey)!.participants.push(participantData);
        }
      });
    });
  });
  this.challengeForms = Array.from(formsMap.values());
  
  console.log('✓ Total challenge forms found:', this.challengeForms.length);
  console.log('Challenge forms array:', this.challengeForms);
}



openChallengeFormReview(form: any, participant: any): void {
  console.log('Opening form review for:', participant.name);
  console.log('Form details:', form);
  const enrolledParticipant = this.enrolledParticipants.find(ep => ep.profileid === participant.profileid);
  if (!enrolledParticipant) {
    console.error('Enrolled participant not found');
    return;
  }
  
  const participantProgress = this.participantProgressList.find(p => p.profileid === participant.profileid);
  const challenge = participantProgress?.challenges?.[form.challengeIndex];
  const subChallenge = challenge?.challenges?.[form.subChallengeIndex];
  
  if (!subChallenge || !subChallenge.result) {
    console.log('No form submission found for this participant');
    alert('This participant has not submitted the form yet.');
    return;
  }
  
  const formData = {
    formid: subChallenge.contentref.id,
    docid: subChallenge.result.id,
    profileid: participant.profileid,
    workshopref: enrolledParticipant.participantworkshopref.path,
    challengeIndex: form.challengeIndex,
    subChallengeIndex: form.subChallengeIndex,
    reviewid: subChallenge.reviewid,
    readonly: true
  };
  
  if (subChallenge.status === 'completed' && subChallenge.completionNotes && subChallenge.completionNotes.length > 0) {
    formData['isCompletedAssignment'] = true;
    formData['completionNotes'] = JSON.stringify(subChallenge.completionNotes);
  }
  
  console.log('Opening form with data:', formData);
  this.onFormPreview(formData);
}
  applyFilterSide() {
    let base = this.selectedParticipants;

    if (this.filterOption === 'new') {
      base = base.filter(p => this.mapProfile[p.profileid]?.workshoponly === true);
    } else if (this.filterOption === 'old') {
      base = base.filter(p => !this.mapProfile[p.profileid]?.workshoponly);
    }

    if (
      this.workshopData?.categorybased === true &&
      this.selectedStatusInfo?.status === 'totalEnrolled' &&
      this.selectedJourneyFilters.length > 0
    ) {
      base = base.filter(p => {
        const activeJourney: string = this.mapProfile[p.profileid]?.activejourney || '';
        return this.selectedJourneyFilters.includes(activeJourney);
      });
    }

    if (
      this.workshopData?.categorybased === true &&
      this.workshopData?.tierbased === true &&
      this.selectedStatusInfo?.status === 'totalEnrolled' &&
      this.selectedTierFilters.length > 0
    ) {
      base = base.filter(p => {
        const profileTiers: string[] = this.mapProfile[p.profileid]?.tier || [];
        return this.selectedTierFilters.some(t => profileTiers.includes(t));
      });
    }

    this.filteredParticipants = base;
  }
  toggleTierFilter(tier: string) {
    const idx = this.selectedTierFilters.indexOf(tier);
    if (idx >= 0) {
      this.selectedTierFilters.splice(idx, 1);
    } else {
      this.selectedTierFilters.push(tier);
    }
    this.applyFilterSide();
  }

  clearTierFilters() {
    this.selectedTierFilters = [];
    this.applyFilterSide();
  }
  toggleJourneyFilter(journey: string) {
    const idx = this.selectedJourneyFilters.indexOf(journey);
    if (idx >= 0) {
      this.selectedJourneyFilters.splice(idx, 1);
    } else {
      this.selectedJourneyFilters.push(journey);
    }
    this.applyFilterSide();
  }

  clearJourneyFilters() {
    this.selectedJourneyFilters = [];
    this.applyFilterSide();
  }
  // applyFilterSide() {
  //   if (this.filterOption === 'new') {
  //     this.filteredParticipants = this.selectedParticipants.filter(
  //       p => this.mapProfile[p.profileid]?.workshoponly === true
  //     );
  //   } else if (this.filterOption === 'old') {
  //     this.filteredParticipants = this.selectedParticipants.filter(
  //       p => !this.mapProfile[p.profileid]?.workshoponly
  //     );
  //   } else {
  //     this.filteredParticipants = this.selectedParticipants;
  //   }
  // }
  onCategoryFilterChange() {
      this.recalculateStatistics();
      this.updateDataSource(this.getFilteredTableParticipants());
      if (this.selectedParticipantData) {
        this.updateParticipantDisplayData();
      }
    }

getFilteredParticipantProgressList(challengeIndex?: number): any[] {
    if (this.workshopData?.categorybased !== true) {
      return this.participantProgressList;
    }
    const facilitatorProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
    if (this.selectedCategoryFilter === 'cohort') {
      return this.participantProgressList.filter(p => this.participantCohortMap.get(p.profileid) === true);
    }
    if (this.selectedCategoryFilter === 'facilitator') {
      return this.participantProgressList.filter(p => facilitatorProfiles.includes(p.profileid));
    }
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
      if (isFacilitatorOnly) {
        return this.participantProgressList.filter(p => facilitatorProfiles.includes(p.profileid));
      }
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
      return catIds
        .map((id: string) => this.categoryNamesMap.get(id) || 'Unknown')
        .join(', ');
    }
  isChallengeVisibleForCategory(challengeIndex: number): boolean {
      if (this.selectedCategoryFilter === 'all' || this.selectedCategoryFilter === 'cohort' || this.workshopData?.categorybased !== true) {
        return true;
      }
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
        profileid: id,
        name: this.mapProfile[id]?.name || 'Unknown',
        metadata: this.mapProfile[id]
      }));

      this.selectedStatusInfo = {
        status: 'cohortParticipants',
        challengeName: 'Above Diagnostics',
        subChallengeName: 'Cohort Participants',
        count: this.cohortParticipantProfileIds.length
      };

      this.showParticipantPanel = true;
      this.filterOption = 'all';
      this.applyFilterSide();
    }
    onFacilitatorClick() {
      this.selectedParticipants = this.facilitatorProfileIds.map(id => ({
        profileid: id,
        name: this.mapProfile[id]?.name || 'Unknown',
        metadata: this.mapProfile[id]
      }));

      this.selectedStatusInfo = {
        status: 'facilitatorOnly',
        challengeName: 'Facilitator Only',
        subChallengeName: 'Facilitator Participants',
        count: this.facilitatorProfileIds.length
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
    if (isFacilitatorOnly) {
      return isFacilitator;
    }
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
          if (challenge.challenges[j].status === 'completed') {
            completedChallenges++;
          }
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
        if (prog.progressPercentage === 100) {
          totalCompletedCount++;
          totalCompletedIds.push(p.profileid);
        } else if (prog.progressPercentage > 0) {
          totalActiveIds.push(p.profileid);
        } else {
          totalNotStartedIds.push(p.profileid);
        }
      });

      const startedProfileIds = this.participantProgressList.map(p => p.profileid);
      this.enrolledParticipants
        .filter(p => p.status === 'enrollednotstarted' && !startedProfileIds.includes(p.profileid))
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
        let catProgress = 0;
        let catCompleted = 0;
        catParticipants.forEach(p => {
          const prog = getProgress(p);
          catProgress += prog.progressPercentage;
          if (prog.progressPercentage === 100) catCompleted++;
        });
        return {
          categoryId: catId,
          categoryName: this.categoryNamesMap.get(catId) || 'Unknown',
          avgProgress: catParticipants.length > 0 ? catProgress / catParticipants.length : 0,
          completionRate: catParticipants.length > 0 ? (catCompleted / catParticipants.length) * 100 : 0,
          completedCount: catCompleted,
          totalCount: catParticipants.length
        };
      });

      const cohortParticipants = this.participantProgressList.filter(
        p => this.participantCohortMap.get(p.profileid) === true
      );
      let cohortProgress = 0;
      let cohortCompleted = 0;
      cohortParticipants.forEach(p => {
        const prog = getProgress(p);
        cohortProgress += prog.progressPercentage;
        if (prog.progressPercentage === 100) cohortCompleted++;
      });
      this.categoryBasedMetrics.cohortAvgProgress = cohortParticipants.length > 0 ? cohortProgress / cohortParticipants.length : 0;
      this.categoryBasedMetrics.cohortCompletionRate = cohortParticipants.length > 0 ? (cohortCompleted / cohortParticipants.length) * 100 : 0;
      this.categoryBasedMetrics.cohortCompletedCount = cohortCompleted;

      const facParticipants = this.participantProgressList.filter(
        p => facilitatorProfiles.includes(p.profileid)
      );
      let facProgress = 0;
      let facCompleted = 0;
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
        case 'active':
          profileIds = this.categoryBasedMetrics.totalActiveProfileIds;
          label = 'Active Participants';
          break;
        case 'completed':
          profileIds = this.categoryBasedMetrics.totalCompletedProfileIds;
          label = 'Completed Participants';
          break;
        case 'notStarted':
          profileIds = this.categoryBasedMetrics.totalNotStartedProfileIds;
          label = 'Not Started Participants';
          break;
        case 'cohortCompleted':
          profileIds = this.participantProgressList
            .filter(p => this.participantCohortMap.get(p.profileid) === true && this.calculateAccessBasedProgress(p).progressPercentage === 100)
            .map(p => p.profileid);
          label = 'Above Diagnostics — Completed';
          break;
        case 'facilitatorCompleted':
          const facProfiles: string[] = this.workshopData?.facilitatorprofiles || [];
          profileIds = this.participantProgressList
            .filter(p => facProfiles.includes(p.profileid) && this.calculateAccessBasedProgress(p).progressPercentage === 100)
            .map(p => p.profileid);
          label = 'Facilitator — Completed';
          break;
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
        profileid: id,
        name: this.mapProfile[id]?.name || 'Unknown',
        metadata: this.mapProfile[id]
      }));
      this.selectedStatusInfo = {
        status: type, challengeName: label, subChallengeName: label, count: profileIds.length
      };
      this.showParticipantPanel = true;
      this.filterOption = 'all';
      this.applyFilterSide();
    }
}
