import { Component, inject, HostListener, ElementRef } from '@angular/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { CommonModule, DatePipe } from '@angular/common';
import { collection, collectionData, collectionSnapshots, doc, DocumentData, documentId, Firestore, getDoc, getDocs, orderBy, Query, query, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { combineLatest, firstValueFrom, Subject, Subscription } from 'rxjs';
import { CreateBulkInvitationComponent } from '../create-bulk-invitation/create-bulk-invitation.component';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { PeopleInvolvedComponent } from '../people-involved/people-involved.component';
import { environment } from '../../../environments/environment';
import { AssignQueueStudioComponent } from '../assign-queue-studio/assign-queue-studio.component';
import { AvTestComponent } from '../av-test/av-test.component';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { HoldAlertDialogComponent } from '../hold-alert-dialog/hold-alert-dialog.component';
import { NgZone } from '@angular/core';
import { QueueNotesComponent } from '../queue-notes/queue-notes.component';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ThemePalette } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { ViewNotificationParticipantsComponent } from '../view-notification-participants/view-notification-participants.component';
import { StudioPreassignDialogComponent } from '../studio-preassign-dialog/studio-preassign-dialog.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';

@Component({
  selector: 'app-dynamic-queue-manager',
  imports: [
    MatSidenavModule,
    CommonModule,
    MatSlideToggleModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatMenuModule,
    MatCheckboxModule,
    NgxMatSelectSearchModule,
    MatDividerModule
  ],
  templateUrl: './dynamic-queue-manager.component.html',
  styleUrl: './dynamic-queue-manager.component.css'
})
export class DynamicQueueManagerComponent {
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
  mapProfile = {}
  mapProfileData = {}
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
  deleteOption: boolean = false
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

  participantSubscription:Subscription;
  participantMetaDataMap = {};


  // harish
  searchQueue: string = '';
  totalParticipants: number = 0;
  selectedTokens: Set<any> = new Set();
  selectedCommType: 'whatsapp' | 'email' | 'notification' | null = null;

  //optimisation
  lastLogDate: Date

  stageSearchTerm: string = '';
  filteredAvailableStages: any[] = [];

  // Custom dropdown state management
  openMoveMenuId: string | null = null;
  openOptionsMenuId: string | null = null;
  openVariationMenuId: string | null = null;

  private subscriptionHandle = new Subject<void>()
  private fcmTokenSubscription = new Subject<void>(); 
  private liveQueueSubscription = new Subject<void>(); 
  private storage = inject(Storage);

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public dialog: MatDialog,
    public datepipe: DatePipe,
    public http: HttpClient,
    public ngZone: NgZone,
    private elementRef: ElementRef
  ) {
    // guard.getProfileMap().then(data => this.mapProfile = data.map);
    guard.getProfileMap().then(data => {
      this.mapProfileData = data.docdata
      this.mapProfile = data.map
    });
    guard.getRoles().then(roles => {
      this.roles = roles;
      this.profileid = roles.profile_ref.id;

      this.deleteOption = (
        (environment.firebase.projectId == "fir-sample-aae4a" && this.profileid == 'l0ApFnXuM5Ac8tpqJQnk') ||
        (environment.firebase.projectId == "test-environment-841c3" && this.profileid == 'g2mQ7GiD6PSV8oaZnZLb')
      );

      const queueCollection = collection(this.firestore, "queue generation");
      let queueQuery: Query<DocumentData>;

      if (roles.ah || roles.admin) {
        queueQuery = query(queueCollection, orderBy("queuename"));
      } else {
        queueQuery = query(
          queueCollection,
          where("queueadmin", "array-contains", this.profileid),
          orderBy("queuename")
        );
      }

      const colRef = collection(this.firestore, 'classify');
      const q = query(colRef, where(documentId(), 'in', ['postmarkstatus', 'watistatus']));

      this.docsSubscription = collectionData(q, { idField: 'id' }).subscribe({
        next: (docs) => {
          for (let i = 0; i < docs.length; i++) {
            const element = docs[i];

            if(element['id'] == 'postmarkstatus') {
              this.isEmailActive = element['active'] ? true : false;
            } else if(element['id'] == 'watistatus') {
              this.isWhatsAppActive = element['eventwati'] ? true : false;;
            }
          }
        },
        error: (error) => {
          console.error('Error:', error);
        }
      });

      this.queueSubscription = collectionData(queueQuery, { idField: 'id' }).pipe(takeUntil(this.subscriptionHandle)).subscribe(queue => {
        this.queueList = queue;
        this.liveQueueList = queue.filter(e => e["queuestartdate"].toDate() <= new Date() && e["queueenddate"].toDate() >= new Date())
      });

      this.participantSubscription = collectionData(collection(this.firestore, 'participant metadata'), { idField: 'id' }).pipe(takeUntil(this.subscriptionHandle)).subscribe((participantdoc) => {
        participantdoc.map((data)=>{
          this.participantMetaDataMap[data['profileid']] = data;
        });
      });

    });
  }

  // Close dropdowns when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    
    // Check if click is outside dropdown areas
    if (!target.closest('.custom-dropdown-container')) {
      this.closeAllDropdowns();
    }
  }

  // Close dropdowns on escape key
  @HostListener('document:keydown.escape')
  onEscapeKey() {
    this.closeAllDropdowns();
  }

  closeAllDropdowns() {
    this.openMoveMenuId = null;
    this.openOptionsMenuId = null;
    this.openVariationMenuId = null;
    this.stageSearchTerm = '';
  }

  toggleMoveMenu(event: Event, tokenId: string, token: any, stageName: string, stageType: string) {
    event.stopPropagation();
    
    if (this.openMoveMenuId === tokenId) {
      this.openMoveMenuId = null;
      this.stageSearchTerm = '';
    } else {
      this.closeAllDropdowns();
      this.checkAvailablestages(token, stageName, stageType);
      this.openMoveMenuId = tokenId;
    }
  }

  toggleOptionsMenu(event: Event, tokenId: string) {
    event.stopPropagation();
    
    if (this.openOptionsMenuId === tokenId) {
      this.openOptionsMenuId = null;
    } else {
      this.closeAllDropdowns();
      this.openOptionsMenuId = tokenId;
    }
  }

  toggleVariationMenu(event: Event, tokenId: string) {
    event.stopPropagation();
    
    if (this.openVariationMenuId === tokenId) {
      this.openVariationMenuId = null;
    } else {
      this.openVariationMenuId = tokenId;
    }
  }

  onMoveMenuItemClick(token: any, columnStagename: string, columnType: string, targetStagename: string, markascompleted: any) {
    this.closeAllDropdowns();
    this.moveTokenToStage(token, columnStagename, columnType, targetStagename, markascompleted);
  }

  onVariationSelect(token: any, variationId: string) {
    this.closeAllDropdowns();
    this.updateVariation(token, variationId);
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
    })
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
  }

  async onQueueSelect() {
    // Reset subscription
    this.liveQueueSubscription.next()
    this.liveQueueSubscription.complete()
    this.liveQueueSubscription = new Subject<void>();

    // console.log(this.selectedQueue)
    let count = 0
    this.currentQueueParticipants = [];
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Staging Queue..."
      },
      disableClose: true
    })

    // .where("studioin", "==", true).where("checkin", "==", true)
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

    const queueGenerationDocRef = doc(this.firestore, "queue generation", this.selectedQueue.docid);
    const stageLogCollection = collection(this.firestore, 'queue stage log');

    let stageLogQuery: Query<DocumentData> = query(
      stageLogCollection,
      where('queueref', '==', queueGenerationDocRef),
      orderBy('logdate', 'asc')
    );

    collectionData(stageLogQuery).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe((snap) => {
      console.log("stagelogSubscription", snap.length);

      // Reduce the snapshot to process documents
      this.queuehistory = snap.reduce((r, a) => {
        const data = a;
        const profileId = data['profile_id'];

        // Initialize profile array if not exists
        r[profileId] = r[profileId] || [];

        // Process people_involved names
        let peopleInvolvedNames = [];
        if (data['people_involved']) {
          peopleInvolvedNames = data['people_involved'].map(personId => this.mapProfileData[personId]['name'] || personId);
        }
        data['peopleinvolvedname'] = peopleInvolvedNames;

        // Update lastLogDate with proper type checking
        if (data['logdate']) {
          // Handle Firestore Timestamp
          if (data['logdate'] instanceof Timestamp) {
            this.lastLogDate = data['logdate'].toDate();
          } else if (data['logdate'].toDate && typeof data['logdate'].toDate === 'function') {
            this.lastLogDate = data['logdate'].toDate();
          } else if (data['logdate'] instanceof Date) {
            this.lastLogDate = data['logdate'];
          }
        }

        // Push data to the queuehistory array
        r[profileId].push(data);
        return r;
      }, {});

      count++;
      if (count >= 6) {
        loading.close();
      }
    });


    collectionData(query(collection(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat"), where("senderprofileid", '==', this.profileid), where("pinned", '==', true), orderBy("date", "desc")), { idField: 'id' }).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe(async snap => {
      this.pinnedChatList = snap
      count++
      if (count >= 6) {
        loading.close()
      }
    })

    //get chat message
    collectionData(query(collection(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat"), orderBy("date", 'desc'))).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe((chatsnap) => {
      this.chatList = {}
      for (let i = 0; i < chatsnap.length; i++) {
        const element = chatsnap[i];
        this.chatList[element['stage']] = this.chatList[element['stage']] || []
        this.chatList[element['stage']].push(element)
      }
      // console.log("chatlist",this.chatList);
      count++
      if (count >= 6) {
        loading.close()
      }
    });

    // Variation ID
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
    })

    collectionData(query(collection(this.firestore, 'queue_token'), where("queueref", "==", doc(this.firestore, "queue generation", this.selectedQueue.docid)), orderBy("logdate", "asc"))).pipe(takeUntil(this.subscriptionHandle), takeUntil(this.liveQueueSubscription)).subscribe(token => {
      var stages = []
      let queryData = token

      // Extract profile IDs
      const newProfileIds: string[] = [];
      
      token.forEach((e) => {
        if (!newProfileIds.includes(e['profile_id'])) {
          if(e['tokenstatus'].toLowerCase() == 'active')
          newProfileIds.push(e['profile_id']);
        }
      });

      // Check if profile IDs changed
      const profileIdsChanged = JSON.stringify(this.currentQueueParticipants.sort()) !== JSON.stringify(newProfileIds.sort());

      if (profileIdsChanged) {
        this.currentQueueParticipants = [...new Set(newProfileIds)];
        
        // Restart FCM token listener with new profile IDs
        this.fcmTokenSubscription.next(); // Stop old subscription
        this.setupFcmTokenListener();
      }

      for (let i = 0; i < this.selectedQueue.stages.length; i++) {
        const stage = this.selectedQueue.stages[i];
        var stageProperty = (this.selectedQueue["stageproperty"] ?? {})[stage]
        var compusloryActivity = Object.values(stageProperty["compulsoryactivity"] ?? {})
        if (compusloryActivity.length == 0) {
          stages.push({
            stagename: stage,
            tokenlist: queryData.filter(e => e["currentstage"] == stage && [null, undefined, false].includes(e['delete']) && e["tokenstatus"] === "Active"),
            type: null
          })
        }
        else {
          // Queued Token But not Ready
          var queuedToken = queryData.filter(e => e["currentstage"] == stage && (e["status"] == null || e["status"] == "queued" || e["status"] == "invited") && [null, undefined, false].includes(e['delete']) && e["tokenstatus"] === "Active")
          stages.push({
            stagename: stage,
            tokenlist: queuedToken,
            type: "Queued"
          })
          // Token Ready for Studio
          var waitingToken = queryData.filter(e => e["currentstage"] == stage && (e["status"] == "ready") && [null, undefined, false].includes(e['delete']) && e["tokenstatus"] === "Active")
          stages.push({
            stagename: stage,
            tokenlist: waitingToken,
            type: "Waiting"
          })
          var studioToken = queryData.filter(e => e["currentstage"] == stage && e["liveassignmentid"] != null && e["liveassignmentid"] != undefined && [null, undefined, false].includes(e['delete']) && e["tokenstatus"] === "Active")
          stages.push({
            stagename: stage,
            tokenlist: studioToken,
            type: "Activity"
          })
        }
      }

      // Add Unattended tokens stage (tokens with 'Inactive' status)
      var unattendedTokens = queryData.filter(e =>
        e["tokenstatus"] === "inActive" &&
        [null, undefined, false].includes(e['delete'])
      )

      if (unattendedTokens.length > 0) {
        stages.push({
          stagename: "Unattended Participants",
          tokenlist: unattendedTokens,
        })
      }
      this.stageQueue = stages
      console.log(this.stageQueue, 'this.stageQueue');


      // meena
      this.totalParticipants = this.stageQueue.filter(stage => stage.stagename !== "Unattended Participants").reduce(function (sum, stage) {
        return sum + stage.tokenlist.length;
      }, 0);

      count++
      if (count >= 6) {
        loading.close()
      }
    })
  }

  // Function to open dialog for preassign studio participants 
  openPreAssignDialog(token) {
    this.closeAllDropdowns();
    this.dialog.open(StudioPreassignDialogComponent, {
      width: '90vw',
      height: '90vh',  // Fixed height
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
        query(collection(this.firestore, 'FCM_token'), where("device_os", "in", ["ios", "android"]), where("last_modified", ">=", threeMonthsBeforeTimestamp), where('profile_ref', 'in', profileRefs) ),
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
    updateDoc(doc(this.firestore, "queue_token", token['docid']), {
      variationid: variationid
    }).then(()=> {
      this.guard.openSnackBar("Variation Updated", "OK");
    }).catch((error)=> {
      this.guard.openSnackBar("Error Updating Variation", "OK");
      console.log("Error", error);
    })
  }

  onBulkInvite() {
    let bulkInviteDialog = this.dialog.open(CreateBulkInvitationComponent, {
      disableClose: true,
      data: this.selectedQueue,
      maxHeight: "90vh",
      maxWidth: "90vw"
    })
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

    // Check if token has variation
    if (token['variationid'] && this.mapVariation[token['variationid']]) {
      // Use variation stages
      stagesToShow = this.mapVariation[token['variationid']]['stages'];
      console.log('Using variation stages:', stagesToShow);
    } else {
      // Use all queue stages
      stagesToShow = this.selectedQueue.stages;
      console.log('Using all queue stages:', stagesToShow);
    }

    let availableStageOptions = [];
    const addedStages = new Set();
    const stageTypes = ['Queued', 'Waiting', 'Activity'];
    // Process each stage
    stagesToShow.forEach(stage => {
      const stageName = typeof stage === 'string' ? stage : stage.stagename;

      // Check if this stage has queue configuration
      const queueStage = this.stageQueue.find(qs => qs.stagename === stageName);

      if (queueStage && queueStage.type) {
        // Add stage with different types
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
        // Add stage without type
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

  // Filter stages based on search term
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

  // Clear search and show all stages
  clearSearch() {
    this.stageSearchTerm = '';
    this.filteredAvailableStages = [...this.availableStages];
  }

  async moveTokenToStage(token: any, fromStage: string, fromstagetype: string, toStage: string, markascompleted: any) {
    console.log(fromStage, fromstagetype, toStage, markascompleted);
    let targetStageName = toStage;
    let targetStageType = null;
    // Find source column
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

    console.log(dragStage, token);


    const dragType = dragStage.type;
    const dropType = dropStage.type;

    // Show loading dialog
    const loading = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Moving Token " + token.tokennumber + "..."
      },
      disableClose: true
    });

    let batch = writeBatch(this.firestore);

    try {
      if (dragIndex != dropIndex && dropType != "Activity") {
        // Handle non-Activity movement
        const peopledata = {
          type: "general",
          personoption: this.specialistList,
          mentoroption: this.specialistList,
          shadowoption: this.specialistList,
          multiperson: true
        };

        const dialog = this.dialog.open(PeopleInvolvedComponent, {
          disableClose: true,
          data: peopledata
        });

        const result = await firstValueFrom(dialog.afterClosed());
        if (result == null) {
          return;
        }

        if (result != null) {
          // Close Studio
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
              // await this.firestore.collection("queue studio pairing").doc(studioid).update({
              //   status: null,
              // })
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

          // Update queue token
          batch.update(doc(this.firestore, "queue_token", log.docid), log);

          // Add to queue stage log
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
                // Remove from source
                const [removedToken] = this.stageQueue[dragIndex].tokenlist.splice(tokenIndex, 1);
                // Add to target
                this.stageQueue[dropIndex].tokenlist.push(removedToken);
              }
            }
          });

          // Check if this is the last stage
          if (dropIndex + 1 == this.stageQueue.length) {
            console.log('working...........')
            // await this.guard.updateDeliveryStatus(this.firestore.doc("/queue_token/" + token.docid).ref.path, "completed");
            await this.guard.updateDeliveryStatus(doc(this.firestore, "/queue_token/" + token["docid"]).path, "completed", {
              eventRequestRef: query(collection(this.firestore, 'event participation request'), where('profileid', '==', token['profile_id']), where('eventref', '==', token['queueref']), where("status", "==", "approved"))
            })
          }
        }
      } else if (dragIndex != dropIndex && dropType == "Activity") {
        // Handle Activity movement
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
          getDoc(doc(this.firestore, token['productref'].path)).then(productSnap => {
            atcmodel = productSnap.data()['atcmodel']
          })
        }
        // Get compulsory activities for this stage
        console.log("Stage Activity", this.selectedQueue.stageproperty[dropStage.stagename].compulsoryactivity)
        const stageActivityParse = Object.values(
          this.selectedQueue.stageproperty[dropStage.stagename].compulsoryactivity ?? {}
        ).sort((a, b) => a.toString().localeCompare(b.toString())).join(",");
        console.log("Stage Activity Parse", stageActivityParse)

        // Find available studios
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
        console.log("Available Studio", availableStudio)

        // Handle studio stage grouping
        const mandatoryStage = this.selectedQueue.stageproperty[dropStage.stagename].mandatorystagegrouping ?? [];
        const optionalStage = this.selectedQueue.stageproperty[dropStage.stagename].optionalstagegrouping ?? [];
        console.log("Mandatory Stage", mandatoryStage)
        console.log("Optional Stage", optionalStage)

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

        // Process additional activities
        let additionalActivities = {};

        // Process mandatory studios
        mandatoryStudio.forEach(studio => {
          const participantActivity = Object.keys(studio.participantsactivity ?? {});

          participantActivity.forEach(profile => {
            const transferActivity = this.selectedQueue.stageproperty[dropStage.stagename].transferactivity ?? {};
            const newActivity = transferActivity[studio.participantsactivity[profile]] ?? studio.participantsactivity[profile];

            additionalActivities[newActivity] = additionalActivities[newActivity] ?? [];
            additionalActivities[newActivity].push(profile);
          });
        });

        // Process optional studios
        optionalStudio.forEach(studio => {
          const participantActivity = Object.keys(studio.participantsactivity ?? {});

          participantActivity.forEach(profile => {
            const transferActivity = this.selectedQueue.stageproperty[dropStage.stagename].transferactivity ?? {};
            const newActivity = transferActivity[studio.participantsactivity[profile]] ?? studio.participantsactivity[profile];

            additionalActivities[newActivity] = additionalActivities[newActivity] ?? [];
            additionalActivities[newActivity].push(profile);
          });
        });

        // Open the assign studio dialog
        const assignStudio = this.dialog.open(AssignQueueStudioComponent, {
          data: {
            title: "Assign Studio to the Participant",
            studiolist: availableStudio,
            mapprofile: this.mapProfile,
            mapactivity: this.mapActivity,
            additionalactivities: additionalActivities
          },
          autoFocus: false,
          maxWidth: "90vw",
          maxHeight: "90vh"
        });

        const result = await firstValueFrom(assignStudio.afterClosed());

        if (result != null) {
          // Close previous studio if coming from an Activity stage
          if (dragType == "Activity") {
            const oldliveassignmentid = token.liveassignmentid;
            const oldstudioid = token.studioid;

            if (dropStage['stagename'] == token['currentstage'] || (dropStage['stagename'] != token['currentstage'] && markascompleted != true)) {
              console.log("in", dropStage['stagename'], token['currentstage'], markascompleted);
              batch.update(doc(this.firestore, 'live assignment/' + oldliveassignmentid), {
                status: "completed",
                updated: serverTimestamp()
              })
              // await this.firestore.collection("queue studio pairing").doc(studioid).update({
              //   status: null,
              // })
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

            // batch.update(this.firestore.doc('live assignment/' + oldliveassignmentid).ref, {
            //   status: "completed",
            //   updated: firebase.default.firestore.FieldValue.serverTimestamp()
            // });

            // batch.update(this.firestore.collection("queue studio pairing").doc(oldstudioid).ref, {
            //   status: null
            // });
          }

          // Update studio status
          batch.update(doc(this.firestore, "queue studio pairing", result.docid), {
            status: "live"
          });

          // Create live assignment
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

          // Update token
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

          // Update queue token
          batch.update(doc(this.firestore, "queue_token", log.docid), log);

          // Add to queue stage log
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
                // Remove from source
                const [removedToken] = this.stageQueue[dragIndex].tokenlist.splice(tokenIndex, 1);
                // Add to target
                this.stageQueue[dropIndex].tokenlist.push(removedToken);
              }
            }
          });
        }
      }

    } catch (error) {
      console.error("Error moving token:", error);
    } finally {
      // Close loading dialog
      loading.close();
    }
  }

  async updateQueueStage(log) {
    // console.log(log)
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
    })
  }

  queueAdminTest() {
    let id = doc(collection(this.firestore, 'queue generation', this.selectedQueue['docid'], 'stagechat')).id
    setDoc(doc(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat", id), {
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
    // console.log(this.selectedChatStage,this.messageCurrentlyTyped,this.selectedQueue,this.profileid);   
    return this.selectedChatStage === null || this.selectedQueue === null || this.profileid === null || this.messageCurrentlyTyped === "" || this.messageCurrentlyTyped === null;
  }

  async sendWatiMessage() {
    var apikey = null;
    var endpoint = null;
    await getDoc(doc(this.firestore, "classify", "wati")).then((wati) => {
      if (wati.exists()) {
        apikey = wati.data()['101723']['watitoken'];
        endpoint = wati.data()['101723']['endpoint'];
      }
    });

    var participants = this.stageQueue.filter((e: any) => e.stagename == this.selectedChatStage && e.type == this.selectedStageType);
    const check = confirm("Are you sure want to send this Template in WATI");

    if (check && apikey) {

      console.log('Sending in Wati');
      // console.log(this.watiTemplate);
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

        const url = endpoint+'/api/v1/sendTemplateMessage?whatsappNumber=' + waticontent.phonenumber;

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
        })

        // this.firestore.collection("A&H updates").add({
        //   date: firebaseApp.firestore.FieldValue.serverTimestamp(),
        //   users: userRef,
        //   title: this.selectedChatStage + ' - ' + this.selectedChatStageType,
        //   message: this.messageCurrentlyTyped,
        //   sticky: false,
        //   landingpage: null,
        //   notificationimage: null,
        // }).then((id)=>{
        //   console.log(id.id,"updated A&H Updates")
        // }).catch((error)=>{
        //   console.log("Oops error while updating A&H updates");
        // });

      }
      this.messageCurrentlyTyped = '';
    }
  }

  onChatPinned(pinnedvalue, chatdoc) {
    // console.log(pinnedvalue,chatdoc);
    updateDoc(doc(this.firestore, "queue generation", this.selectedQueue['docid'], "stagechat", chatdoc['docid']), {
      pinned: pinnedvalue
    })
  }

  async exportCSV() {
    var data = [];
    var allHeaders = new Set<string>(); // Track all unique headers

    for (let i = 0; i < this.stageQueue.length; i++) {
      const doc = this.stageQueue[i];
      for (const token of doc['tokenlist'] || []) {
        var map: any = {};
        var stageLog = this.queuehistory[token.profile_id] ?? [];

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
        map['name'] = token['profile_name'] || '';
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

    // Handle case when no data at all
    if (data.length === 0) {
      console.warn('No data to export');
      // Optionally show a message to user
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

  downloadFile(data, header, filename = 'data') {
    let csvData = this.ConvertToCSV(data, header);
    // console.log(csvData)
    let blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    let dwldLink = document.createElement("a");
    let url = URL.createObjectURL(blob);
    let isSafariBrowser = navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1;
    if (isSafariBrowser) {  //if Safari open in new window to save file with random filename.
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

        line += array[i][head] + ',';
      }
      str += line + '\r\n';
    }
    return str;
  }

  async completeQueue(profilelist, dropStage) {
    // console.log(profilelist,dropStage)
    if (confirm("This action marks the current product of these participants as completed. Continue?")) {
      let checkCompulsoryActivity = ![null, undefined].includes(this.selectedQueue['stageproperty'][dropStage]['compulsoryactivity']) ?
        Object.keys(this.selectedQueue['stageproperty'][dropStage]['compulsoryactivity']).length != 0 : false
      // Close Studio
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
        // const eventParticipationQuery = this.firestore.collection('event participation request', ref => 
        //   ref.where('profileid', '==', element['profile_id'])
        //      .where('eventref', '==', element['queueref'])
        // );

        // const querySnapshot = await eventParticipationQuery.get().toPromise();

        // if (!querySnapshot.empty) {
        //   const eventRef = querySnapshot.docs[0]; 
        //   await eventRef.ref.update({ status: 'attended' });
        // } else {
        //   console.warn("No event participation request found for the given profile ID and event reference.");
        // }
        // this.guard.updateDeliveryStatus(this.firestore.doc("/queue_token/" + element["docid"]).ref.path, "completed")
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
        this.guard.openSnackBar("Successfully Submitted", "Close")
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
    this.closeAllDropdowns();
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

        // const notesChanged = element.notes !== originalNotes;
        // const notesListChanged = JSON.stringify(element.notesList || []) !== JSON.stringify(originalNotesList);
        // const tagsChanged = JSON.stringify(element.tags || [].sort()) !== JSON.stringify(originalTags);

        // // Update history if there are changes
        // if (notesChanged || notesListChanged || tagsChanged) {
        //   if (!element.history) element.history = [];
        //   element.history.unshift({
        //     notes: element.notes,
        //     tags: element.tags,
        //     timestamp: new Date(),
        //     author: this.profileid || 'Current User'
        //   });
        // }

        // Save changes to Firestore
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
    })
      .then(() => {
        console.log('Participant data updated successfully');
      })
      .catch(error => {
        console.error('Error updating participant data:', error);
      });
  }

  hasNotesOrTags(token: any): boolean {
    return (token.notes && token.notes.trim() !== '') ||
      (token.notesList && token.notesList.length > 0) ||
      (token.tags && token.tags.length > 0);
  }

  // Get badge count for notes/tags icon
  getNotesTagsBadge(token: any): string {
    let count = 0;

    // Count notes
    if (token.notesList && token.notesList.length > 0) {
      count += token.notesList.length;
    } else if (token.notes && token.notes.trim() !== '') {
      count += 1;
    }

    // Count tags
    if (token.tags && token.tags.length > 0) {
      count += token.tags.length;
    }

    return count > 0 ? count.toString() : '';
  }

  // Get preview text of the most recent note
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

  toggleStageLog(token: any): void {
    if (!this.showStageLog[token.profile_id]) {
      this.showStageLog[token.profile_id] = true;
    } else {
      this.showStageLog[token.profile_id] = false;
    }
  }

  async onCheckboxChange(event: any, token: string) {
    this.closeAllDropdowns();
    const newStatus = event.checked ? 'inActive' : 'Active';

    try {
      await updateDoc(doc(this.firestore, 'queue_token', token['docid']), {
        tokenstatus: newStatus
      });
      console.log(`${newStatus} updated....`);
    } catch (error) {
      console.error("Error updating token status: ", error);
    }
  }

  async markProductCompleted(element) {
    if (confirm("This action marks the current product of these participants as completed. Continue?")) {
      try {
        // await this.guard.updateDeliveryStatus(this.firestore.doc("/queue_token/" + element["docid"]).ref.path, "completed");
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

  getStageParticipants(selectedstage){
    console.log(selectedstage);
    let stage = this.stageQueue.find((e)=>e['stagename'] == selectedstage);
    console.log(stage);
    return stage;
  }

  selectCommType(type: 'whatsapp' | 'email' | 'notification') {
    this.selectedCommType = this.selectedCommType === type ? null : type;
  }

  toggleTokenSelection(token: any) {
    if (this.selectedTokens.has(token)) {
      this.selectedTokens.delete(token);
    } else {
      this.selectedTokens.add(token);
    }
  }

  isTokenSelected(token: any): boolean {
    return this.selectedTokens.has(token);
  }

  getSelectedTokens(): any[] {
    return Array.from(this.selectedTokens);
  }

  areAllSelected(): boolean {
    const tokens = this.getStageParticipants(this.selectedChatStage)['tokenlist'] || [];
    return tokens.length > 0 && this.selectedTokens.size === tokens.length;
  }

  toggleSelectAll() {
    const tokens = this.getStageParticipants(this.selectedChatStage)['tokenlist'] || [];
    if (this.areAllSelected()) {
      this.selectedTokens.clear();
    } else {
      this.selectedTokens = new Set(tokens);
    }
  }

  sendCommunication() {
    const selected = this.getSelectedTokens();
    switch(this.selectedCommType) {
      case 'whatsapp':
        this.sendWhatsApp(selected);
        break;
      case 'email':
        this.sendEmail(selected);
        break;
      case 'notification':
        this.sendNotification(selected);
        break;
    }
  }

  async sendWhatsApp(tokens) {
    const selectedParticipants = tokens.map((e)=>this.mapProfileData[e['profile_id']]);

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

    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result => {
      if(result != null && result != undefined){
        if(result == 'success') {
          this.guard.openSnackBar("Wati Message Sent Successfully", "OK");
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
            console.log("Response : ",response);
            this.selectedTokens.clear();
          }
        } else if(result == 'failed') {
          this.guard.openSnackBar("Sending Wati Message Failed", "OK");
        }
      }
    });
  }

  async sendEmail(tokens) {
    const selectedParticipants = tokens.map((e)=>this.mapProfileData[e['profile_id']]);

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(EmailInputComponent,{
      data : selectedParticipants,
      minWidth : "600px",
      disableClose:true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result => {
      if(result != null && result != undefined){
        console.log(result);
        
        const docRef = doc(collection(this.firestore,"email archive"),result['docid']);
        if(result['status'] == 'queued' || result['status'] == 'send'){
          await setDoc(docRef,result,{merge:true}).then(() => {
            this.guard.openSnackBar("Email Sent", "OK");
          }).catch(err => {
            console.log(err);
            this.guard.openSnackBar("Error Sending Email", "OK");
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
          this.selectedTokens.clear();
        }
      }
    });
  }

async sendNotification(tokens) {
    const selectedParticipants = tokens.map((e)=>this.mapProfileData[e['profile_id']]);

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
    dialogRef.afterClosed().pipe(takeUntil(this.subscriptionHandle)).subscribe(async result => {
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
          console.log( notificationimage);
          this.selectedTokens.clear();
          alert("A&H Update sent to App user " + profileID.length.toString())
        })
      }
    })
  }

}