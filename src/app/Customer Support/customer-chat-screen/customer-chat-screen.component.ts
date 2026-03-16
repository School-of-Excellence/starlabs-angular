import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, ViewChild } from '@angular/core';
import { FormGroup, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { InsertMessageDialogComponent } from '../insert-message-dialog/insert-message-dialog.component';
import { collection, collectionSnapshots, arrayUnion, arrayRemove, deleteDoc, doc, docSnapshots, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch, Timestamp } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
import { Subject, take, takeUntil } from 'rxjs';
import { CustomerTicketReviewComponent } from '../customer-ticket-review/customer-ticket-review.component';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LinebreaksPipe, LinkPipe } from "../../custompipe.pipe";
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { environment } from '../../../environments/environment';
import { Title } from '@angular/platform-browser';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-customer-chat-screen',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatMenuModule,
    MatButtonModule,
    MatInputModule,
    CommonModule,
    MatIconModule,
    FormsModule,
    NgxMatSelectSearchModule,
    MatTabsModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    LinebreaksPipe,
    LinkPipe
  ],
  templateUrl: './customer-chat-screen.component.html',
  styleUrl: './customer-chat-screen.component.css'
})
export class CustomerChatScreenComponent {

  @Input() ticketid: string = "";
  @Input() profileid: string = "";
  @Input() admin: boolean;
  @Input() roles: {};
  @Input() mapprofiledata: {};
  @Input() mapuserId: {};
  @Input() categories: any[] = [];
  @Input() status: any[] = [];
  @Input() validators: any[] = [];
  @Input() negligence: any[] = [];
  @Input() journeymap: {};
  @Input() chatconfigdatainput: {};
  @Input() type;
  @Input() screentab;
  @Input() selectedtab;

  private subscription = new Subject<void>();
  @ViewChild('fileInput') fileInput: ElementRef;
  [x: string]: any;
  routeData: any;
  popupData: any = null;
  popupStyle: { top: string, left: string } = { top: '0px', left: '0px' };
  @ViewChild('autosize') autosize: CdkTextareaAutosize;
  @ViewChild('messageTextarea') messageTextarea: ElementRef;
  filetype = ""

  // Array declarations
  categorylist = [];
  statuslist = [];
  negligencelist = [];
  chatadminUsers = [];
  clientTicketsLog = [];
  currentIssueChat = [];
  selectedFiles = [];
  profileNotesArray: any;
  priorityList = ["Urgent", "Escalation", "Important", "Normal", "Critical", "Emergency"];
  ratingList = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // String declarations
  category = "";
  filteredMember = "";
  notes = "";
  clientid = "";
  loggedinprofile_id = "";
  profile_email = "";
  ticket_id = "";
  profileNotes = "";
  activejourney = "";

  // Object declarations
  mapProfileData = {};
  mapUserId = {};
  mapUserRoles = {};
  currentIssueData = {};
  mapJourney = {};
  ticketParams = {};
  chatConfigData = {};
  ticketEditFormStatus = {
    category: false,
    peopleinvolved: false,
    notes: false,
  }
  filterFormInitialValue = {};


  // Numeric declarations
  unreadcount = 0;

  // Boolean declarations
  privatenotesview: boolean = false;
  isPopupVisible: boolean = false;
  chatloading: boolean = true;
  profileloading: boolean = true;
  editloading: boolean = true;
  chatType: boolean = false;
  // form for filters in details screen
  filterform!: FormGroup;
  showAllAssignTo: boolean = false;

  // form for message box
  messageform!: FormGroup

  // Flag related
  severityList = ["Urgent", "Escalation", "Important", "Normal", "Critical", "Emergency"];
  flagseverity: string = "";
  enableFlag: boolean = false;

  constructor(
    public firestore: Firestore,
    public authservice: AuthguardService,
    private route: ActivatedRoute,
    public snackbar: MatSnackBar,
    private formbuilder: FormBuilder,
    private storage: Storage,
    private dialog: MatDialog,
    private _ngZone: NgZone,
    private cdRef: ChangeDetectorRef,
    private titleService: Title
  ) {
    this.filterform = this.formbuilder.group({
      category: ['',],
      assignedto: ['',],
      peopleinvolved: [[],],
      chatstatus: ['',],
      priority: ['',],
      status: ['',],
      notes: ['',]
    });
    this.messageform = this.formbuilder.group({
      message: [''],
      files: [[],],
    });
    this.authservice.getUser().then((user) => {
      this.profile_email = user.email;
    });
  }

  // ngOnInit(): void {
  //   if (this.admin) {
  //     this.ticket_id = this.ticketid;
  //     this.loggedinprofile_id = this.profileid;
  //     this['chatAdmin'] = this.admin;
  //     this.mapProfileData = this.mapprofiledata;
  //     this.mapUserId = this.mapuserId;
  //     this.categorylist = this.categories;
  //     this.statuslist = this.status;
  //     this.negligencelist = this.negligence;
  //     this.mapJourney = this.journeymap;
  //     this.chatType = this.type;

  //     const usersrolesRef = collection(this.firestore, 'users_roles')
  //     const usersrolesQuery = query(usersrolesRef, where("chatxadmin", "==", true))
  //     getDocs(usersrolesQuery).then((users) => {
  //       for (let i = 0; i < users.docs.length; i++) {
  //         const element = users.docs[i];
  //         this.chatadminUsers.push(element.data()['profile_ref'].id)
  //       }
  //       this.editloading = false;
  //     });

  //   } else {
  //     // alert("You don't have access to the screen");
  //   }
  // }

  ngOnInit(): void {
    // Check if opened via route params (new tab)
    this.route.params.subscribe(async params => {
      this.ticketParams = params;
      if (params['ticketid']) {
        // Opened in new tab - load data independently
        this.ticket_id = params['ticketid'];
        this.titleService.setTitle(`${params['ticketno']}`);
        this.loadDataForNewTab();
      } else if (this.admin) {
        // Opened as child component - use @Input() data
        this.ticket_id = this.ticketid;
        this.loggedinprofile_id = this.profileid;
        this['chatAdmin'] = this.admin;
        this.mapProfileData = this.mapprofiledata;
        this.mapUserId = this.mapuserId;
        this.chatConfigData = this.chatconfigdatainput;
        this.categorylist = this.categories;
        this.statuslist = this.status;
        this.negligencelist = this.negligence;
        this.mapJourney = this.journeymap;
        this.chatType = this.type;

        const usersrolesRef = collection(this.firestore, 'users_roles');
        const usersrolesQuery = query(usersrolesRef, where("chatxadmin", "==", true));
        getDocs(usersrolesQuery).then((users) => {
          for (let i = 0; i < users.docs.length; i++) {
            const element = users.docs[i];
            this.chatadminUsers.push(element.data()['profile_ref'].id);
          }
          this.editloading = false;
        });
      }
    });
  }

  ngOnChanges() {
    if (this.screentab != this.selectedtab) {
      for (const keys in this.subscription) {
        if (Object.prototype.hasOwnProperty.call(this.subscription, keys)) {
          const element = this.subscription[keys];
          if (![null, undefined].includes(element)) {
            // element.unsubscribe();
          }
        }
      }
    } else if (this.screentab == this.selectedtab) {
      this.fetchTicket(this.ticket_id);
    }
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  async loadDataForNewTab() {
    const [
      roles,
      profileData,
      profileDataNew,
      journeyMap,
      chatConfig,
      chatAdminUsers
    ] = await Promise.all([
      this.authservice.getRoles(),
      this.authservice.getProfileMap(),
      this.authservice.getProfileMapNewUser(),
      this.authservice.getJourneyMap(),
      this.loadChatConfig(),
      this.loadChatAdminUsers()
    ]);

    // Set data
    this.loggedinprofile_id = roles?.['profile_ref']?.id ?? null;
    this['chatAdmin'] = roles?.['chatxadmin'] ?? false;

    this.mapProfileData = {
      ...(profileData?.docdata || {}),
      ...(profileDataNew?.docdata || {})
    };
    this.mapUserId = {
      ...(profileData?.mapUserId || {}),
      ...(profileDataNew?.mapUserId || {})
    };

    this.mapJourney = journeyMap;

    if (chatConfig) {
      this.chatConfigData = chatConfig;
      this.categorylist = chatConfig['categories'] || [];
      this.statuslist = chatConfig['status'] || [];
      this.validators = chatConfig['validators'] || [];
      this.negligencelist = chatConfig['negligencecategories'] || [];
    }

    this.chatadminUsers = chatAdminUsers || [];
    this.editloading = false;
    this.fetchTicket(this.ticket_id);
  }

  private async loadChatConfig(): Promise<any> {
    const chatconfigRef = collection(this.firestore, 'chat config');
    const chatConfig = await getDocs(chatconfigRef);
    return chatConfig.docs.length > 0 ? chatConfig.docs[0].data() : null;
  }

  private async loadChatAdminUsers(): Promise<string[]> {
    const usersrolesRef = collection(this.firestore, 'users_roles');
    const usersrolesQuery = query(usersrolesRef, where("chatxadmin", "==", true));
    const users = await getDocs(usersrolesQuery);
    return users.docs.map(doc => doc.data()['profile_ref']?.id).filter(id => id);
  }

  // async loadDataForNewTab() {
  //   // Get logged in user roles
  //   const roles = await this.authservice.getRoles();
  //   this.loggedinprofile_id = roles['profile_ref'].id ?? null;
  //   this['chatAdmin'] = roles['chatxadmin'] ?? false;

  //   // Load profile data
  //   const [profileData, profileDataNew] = await Promise.all([
  //     this.authservice.getProfileMap(),
  //     this.authservice.getProfileMapNewUser()
  //   ]);
  //   this.mapProfileData = {
  //     ...(profileData.docdata || {}),
  //     ...(profileDataNew.docdata || {})
  //   };
  //   this.mapUserId = {
  //     ...(profileData.mapUserId || {}),
  //     ...(profileDataNew.mapUserId || {})
  //   };

  //   // Load journey map
  //   this.mapJourney = await this.authservice.getJourneyMap();

  //   // Load chat config
  //   const chatconfigRef = collection(this.firestore, 'chat config');
  //   const chatConfig = await getDocs(chatconfigRef);
  //   if (chatConfig.docs.length != 0) {
  //     this.categorylist = chatConfig.docs[0].data()['categories'];
  //     this.statuslist = chatConfig.docs[0].data()['status'];
  //     this.validators = chatConfig.docs[0].data()['validators'] ?? [];
  //     this.negligencelist = chatConfig.docs[0].data()['negligencecategories'] ?? [];
  //   }

  //   // Load chat admin users
  //   const usersrolesRef = collection(this.firestore, 'users_roles');
  //   const usersrolesQuery = query(usersrolesRef, where("chatxadmin", "==", true));
  //   const users = await getDocs(usersrolesQuery);
  //   for (let i = 0; i < users.docs.length; i++) {
  //     const element = users.docs[i];
  //     this.chatadminUsers.push(element.data()['profile_ref'].id);
  //   }

  //   this.editloading = false;

  //   // Fetch the ticket
  //   this.fetchTicket(this.ticket_id);
  // }

  //   ngAfterViewInit() {
  //     setTimeout(() => {
  //       this.triggerResize();
  //       this.scrollToBottom();

  //       window.addEventListener('resize', () => {
  //         this.scrollToBottom();
  //       });
  //     }, 100);
  //   }

  //  triggerResize() {
  //     this._ngZone.onStable.pipe(take(1)).subscribe(() => {
  //       if (this.autosize) {
  //         this.autosize.resizeToFitContent(true);
  //       }
  //     });
  //   }

  //   onTextareaResize() {
  //     if (this.messageTextarea && this.messageTextarea.nativeElement) {
  //       const textareaElement = this.messageTextarea.nativeElement;
  //       const text = textareaElement.value;

  //       if (!text || text.length === 0) {
  //         textareaElement.style.overflowY = 'hidden';
  //       } else {
  //         const height = textareaElement.scrollHeight;

  //         if (height > 200) {
  //           textareaElement.style.overflowY = 'auto';
  //         } else {
  //           textareaElement.style.overflowY = 'hidden';
  //         }
  //       }

  //       this.cdRef.detectChanges();
  //       this.ensureChatScrollable();
  //       this.scrollToBottom();
  //     }
  //   }

  //   ensureChatScrollable() {
  //     const chatContainer = document.querySelector('.chat-container') as HTMLElement;
  //     if (chatContainer) {
  //       chatContainer.style.overflowY = 'auto';
  //       void chatContainer.offsetHeight;
  //     }
  //   }

  //   scrollToBottom() {
  //     setTimeout(() => {
  //       const chatContainer = document.querySelector('.chat-container') as HTMLElement;
  //       if (chatContainer) {
  //         chatContainer.scrollTop = 0;
  //       }
  //     }, 0);
  //   }

  //   resetTextareaHeight() {
  //     if (this.messageTextarea && this.messageTextarea.nativeElement) {
  //       const currentValue = this.messageTextarea.nativeElement.value;
  //       this.messageTextarea.nativeElement.value = '';

  //       setTimeout(() => {
  //         this.messageTextarea.nativeElement.value = currentValue;
  //         this.onTextareaResize();
  //       }, 0);
  //     }
  //   }

  relatedTicket(ticketId) {
    for (const keys in this.subscription) {
      if (Object.prototype.hasOwnProperty.call(this.subscription, keys)) {
        const element = this.subscription[keys];
        if (![null, undefined].includes(element)) {
          // element.unsubscribe();
        }
      }
    }
    this.chatloading = true;
    this.profileloading = true;
    this.currentIssueChat = [];
    this.unreadcount = 0;
    this.fetchTicket(ticketId['id']);
  }

  fetchTicket(ticketId) {
    this.chatloading = true;
    this.profileloading = true;
    this.currentIssueChat = [];
    this.unreadcount = 0;
    const clientissuedoc = doc(this.firestore, 'clientissue', ticketId)
    docSnapshots(clientissuedoc).pipe(takeUntil(this.subscription)).subscribe((clientissuedocData) => {
      let clientissuedoc = { id: clientissuedocData.id, ...clientissuedocData.data() };
      this.currentIssueData = clientissuedoc;

      if (this.ticketParams['ticketid']) {
        this.titleService.setTitle(`${this.currentIssueData['issueno']} - ${this.currentIssueData['name']}`);
      }
      console.log(this.currentIssueData['clientid'], "currentIssueData console");

      this.clientid = this.currentIssueData['clientid']
      console.log(this.clientid, "clientidclientid");

      this.fetchTicketMessages(this.currentIssueData);
      this.fetchClientProfileData(this.currentIssueData['clientid']);
      this.fetchClientTickets(this.currentIssueData['clientid']);

      this.filterform.patchValue({
        category: this.currentIssueData['category'] ?? null,
        assignedto: this.currentIssueData['assign'],
        status: this.currentIssueData['status']?.status,
        chatstatus: this.currentIssueData['chatstatus'],
        priority: this.currentIssueData['priority'],
        peopleinvolved: this.currentIssueData['peopleinvolved']
      });

      this.filterFormInitialValue = this.filterform.value;
      const participantjourneyproductRef = collection(this.firestore, 'participantjourneyproduct')
      const participantjourneyproductquery = query(participantjourneyproductRef, where("profileid", "==", this.clientid), where("journeystatus", "in", ["ongoing", "initiated", "completed"]), orderBy("subscriptionstart", "desc"))
      getDocs(participantjourneyproductquery).then((journey) => {
        if (journey.docs.length != 0) {
          this.activejourney = journey.docs[0].data()['journeyref'].id
        } else {
          console.log("No Journey");
        }
      });

    });

  }

  fetchTicketMessages(ticket) {
    this.ticket_id = ticket['id']
    const clientissueDoc = doc(this.firestore, 'clientissue', ticket['id'])
    const messageDoc = collection(clientissueDoc, 'messages')
    const messageQuery = query(messageDoc, orderBy("time", "desc"))
    collectionSnapshots(messageQuery).pipe(takeUntil(this.subscription)).subscribe((chatData) => {
      let chat = chatData.map(doc => ({ id: doc.id, ...doc.data() }))
      this.unreadcount = chat.filter((e) => e['pending'] != undefined && e['pending'].includes('admin')).length;
      var list = [];
      for (let i = 0; i < chat.length; i++) {
        const messagedata = chat[i];
        messagedata['originalmessage'] = messagedata['message']
        messagedata['message'] = [null, undefined, ''].includes(messagedata['message']) ? '' : messagedata['message'].replace(/\n/g, '<br>')
        list.push(messagedata);
        if (i == chat.length - 1) {
          this.currentIssueChat = list;
          this.chatloading = false;
        }
      }
    });

    this.filterform.patchValue({
      category: this.currentIssueData['category'],
      assignedto: this.currentIssueData['assign'],
      status: this.currentIssueData['status']?.status,
      chatstatus: this.currentIssueData['chatstatus'],
      priority: this.currentIssueData['priority'],
      peopleinvolved: this.currentIssueData['peopleinvolved']
    });
  }

  // fetchClientProfileData(clientProfileId) {
  //   const profiledataDoc = doc(this.firestore, 'profile_data', clientProfileId)
  //   docSnapshots(profiledataDoc).pipe(takeUntil(this.subscription)).subscribe((clientdata) => {
  //     if (![null, undefined].includes(clientdata.data()['notes'])) {
  //       var generalNotes = ![null, undefined].includes(clientdata.data()['notes']['generalnotes']) ? clientdata.data()['notes']['generalnotes'] : [];
  //       this.profileNotesArray = generalNotes.sort((a, b) => b['date'] - a['date']) ?? [];
  //     }
  //     this.profileloading = false;
  //   });
  // }
  // fetchClientProfileData(clientProfileId: string) {
  //   this.profileloading = true;
  //   const handleProfileSnapshot = (clientdata: any) => {
  //     const profile = clientdata.data();
  //     if (profile?.notes?.generalnotes) {
  //       const generalNotes = profile.notes.generalnotes || [];
  //       this.profileNotesArray = generalNotes.sort((a, b) => b['date'] - a['date']);
  //     } else {
  //       this.profileNotesArray = [];
  //     }
  //     this.profileloading = false;
  //   };
  //   const profileDocRef = doc(this.firestore, 'profile_data', clientProfileId);
  //   docSnapshots(profileDocRef)
  //     .pipe(takeUntil(this.subscription))
  //     .subscribe(async (clientdata) => {
  //       if (clientdata.exists()) {
  //         handleProfileSnapshot(clientdata);
  //       } else {
  //         const newUserDocRef = doc(this.firestore, 'new_user_data', clientProfileId);
  //         const newUserSnap = await getDoc(newUserDocRef);
  //         if (newUserSnap.exists()) {
  //           handleProfileSnapshot(newUserSnap);
  //         } else {
  //           console.warn('⚠️ Profile not found in both collections:', clientProfileId);
  //           this.profileNotesArray = [];
  //           this.profileloading = false;
  //         }
  //       }
  //     });
  // }
  async fetchClientProfileData(clientProfileId: string) {
    this.profileloading = true;
    const profiledataDoc = doc(this.firestore, 'profile_data', clientProfileId);
    const profileSnap = await getDoc(profiledataDoc);
    let profileData: any = profileSnap.exists() ? profileSnap.data() : null;
    if (!profileData) {
      const newUserDoc = doc(this.firestore, 'new_user_data', clientProfileId);
      const newUserSnap = await getDoc(newUserDoc);
      profileData = newUserSnap.exists() ? newUserSnap.data() : null;
    }
    if (profileData && profileData['notes']) {
      const generalNotes =
        profileData['notes']?.['generalnotes'] && Array.isArray(profileData['notes']?.['generalnotes'])
          ? profileData['notes']['generalnotes']
          : [];
      this.profileNotesArray = generalNotes.sort((a, b) => b['date'] - a['date']) ?? [];
    } else {
      console.warn('Profile not found or has no notes:', clientProfileId);
    }
    this.profileloading = false;
  }


  fetchClientTickets(clientid) {
    const clientissueRef = collection(this.firestore, 'clientissue')
    const clientissueQuery = query(clientissueRef, where("clientid", "==", clientid), orderBy("reporteddate", "desc"))
    getDocs(clientissueQuery).then((ticketdata) => {
      this.clientTicketsLog = [];
      for (let i = 0; i < ticketdata.docs.length; i++) {
        this.clientTicketsLog.push(ticketdata.docs[i].data());
      }
    });
  }

  // ngOnDestroy(){
  //   for (const keys in this.subscription) {
  //     if (Object.prototype.hasOwnProperty.call(this.subscription, keys)) {
  //       const element = this.subscription[keys];
  //       element.unsubscribe();
  //     }
  //   }
  // }



  // Flag/Unflag ticket
  updateFlag() {
    if ([null, undefined, false].includes(this.currentIssueData['flag'])) {
      this.enableFlag = !this.enableFlag;
    } else {
      const confirmUnflag = confirm("Are you sure to unflag this ticket?");
      if (confirmUnflag) {
        const clientissue = doc(this.firestore, 'clientissue', this.currentIssueData['id']);
        updateDoc(clientissue, { flag: false }).then(() => {
          this.openSnackBar('Ticket Successfully Unflagged', 'OK');
        });
      }
    }
  }

  // Confirm flag with severity
  confirmFlag() {
    if ([null, undefined, ""].includes(this.flagseverity)) {
      this.openSnackBar('Please select a severity level', 'OK');
      return;
    }

    const flagData = {
      flag: true,
      flagdata: {
        severity: this.flagseverity,
        flaggedby: this.loggedinprofile_id,
        time: new Date()
      }
    };

    const clientissue = doc(this.firestore, 'clientissue', this.currentIssueData['id']);
    updateDoc(clientissue, flagData).then(() => {
      this.openSnackBar('Ticket Successfully Flagged', 'OK');
      this.flagseverity = "";
      this.enableFlag = false;
    });
  }

  lastDisplayedDay: string | null = null;

  // isNewDay(time, index: number): boolean {
  //   // Convert time to Date object
  //   // const currentDate = time.toDate(); // Convert seconds to milliseconds
  //   // const currentDay = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;

  //   // // Check if this is a new day (i.e., different from the last displayed day)
  //   // if (this.lastDisplayedDay !== currentDay) {
  //   //   // Update last displayed day to the current day
  //   //   this.lastDisplayedDay = currentDay;
  //   //   return true;
  //   // }

  //   if(index != (this.currentIssueChat.length)-1 && (this.currentIssueChat[index+1]['time'] == null ? null : this.convertTimestamptoDate(this.currentIssueChat[index+1]['time'])) != this.convertTimestamptoDate(this.currentIssueChat[index]['time'])){
  //     return true
  //   }else if((index != (this.currentIssueChat.length)-1 && (this.currentIssueChat[index+1]['time'] == null ? null : this.convertTimestamptoDate(this.currentIssueChat[index+1]['time'])) != this.convertTimestamptoDate(this.currentIssueChat[index]['time'])) || index == (this.currentIssueChat.length -1)){
  //     return true
  //   }
  //   return false;
  // }

  isNotMatch(sender: string, index: number): boolean {
    if (index > 0 && ![null, undefined, ''].includes(this.currentIssueChat[index - 1]['sender_uid']) && this.currentIssueChat[index - 1]['sender_uid'] !== sender) {
      return true;
    }

    return false;
  }

  convertTimestamptoDate(timestamp) {
    const time = timestamp.toDate();
    const date = time.getDate();
    const month = time.getMonth() + 1;
    const year = time.getFullYear();
    return date + '-' + month + '-' + year;
  }

  // async addPrivateNotes() {
  //   let profiledata;
  //   const profiledataDoc = doc(this.firestore, 'profile_data', this.clientid)
  //   await getDoc(profiledataDoc).then((notes) => {
  //     if (notes.exists()) {
  //       profiledata = notes.data();
  //     }
  //   });

  //   if (![null, undefined, ""].includes(this.profileNotes)) {
  //     var profilenotes = profiledata['notes'];

  //     if ([null, undefined, ""].includes(profilenotes)) {
  //       var notes = {
  //         generalnotes: []
  //       }
  //       notes['generalnotes'].push({
  //         date: new Date(),
  //         givenBy: this.loggedinprofile_id,
  //         generalnotes: this.profileNotes
  //       });
  //       const profiledataUpdate = doc(this.firestore, 'profile_data', this.clientid)
  //       updateDoc(profiledataUpdate, {
  //         notes: notes
  //       }).then(() => {
  //         this.openSnackBar('Notes Added to the profile', 'OK');
  //         this.profileNotes = "";
  //       }).catch((error) => {
  //         this.openSnackBar('Error Occured while adding notes', 'OK');
  //         console.log('Error', error);
  //       })

  //     } else if ([null, undefined, ""].includes(profilenotes['generalnotes'])) {
  //       var gennotes = [];
  //       gennotes.push({
  //         date: new Date(),
  //         givenBy: this.loggedinprofile_id,
  //         generalnotes: this.profileNotes
  //       });
  //       profilenotes['generalnotes'] = gennotes
  //       const profiledataUpdate2 = doc(this.firestore, 'profile_data', this.clientid)
  //       updateDoc(profiledataUpdate2, {
  //         notes: profilenotes
  //       }).then(() => {
  //         this.openSnackBar('Notes Added to the profile', 'OK');
  //         this.profileNotes = "";
  //       }).catch((error) => {
  //         this.openSnackBar('Error Occured while adding notes', 'OK');
  //         console.log('Error', error);
  //       })
  //     } else {
  //       profilenotes['generalnotes'].push({
  //         date: new Date(),
  //         givenBy: this.loggedinprofile_id,
  //         generalnotes: this.profileNotes
  //       });
  //       const profiledataUpdate3 = doc(this.firestore, 'profile_data', this.clientid)
  //       updateDoc(profiledataUpdate3, {
  //         notes: profilenotes
  //       }).then(() => {
  //         this.openSnackBar('Notes Added to the profile', 'OK');
  //         this.profileNotes = "";
  //       }).catch((error) => {
  //         this.openSnackBar('Error Occured while adding notes', 'OK');
  //         console.log('Error', error);
  //       })
  //     }
  //   } else {
  //     alert('Enter Notes');
  //   }

  // }
  async addPrivateNotes() {
    let profiledata;
    let profileRef = doc(this.firestore, 'profile_data', this.clientid);
    let profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      profileRef = doc(this.firestore, 'new_user_data', this.clientid);
      profileSnap = await getDoc(profileRef);
    }
    if (!profileSnap.exists()) {
      this.openSnackBar('Profile not found in both collections', 'OK');
      return;
    }

    profiledata = profileSnap.data();

    if (![null, undefined, ""].includes(this.profileNotes)) {
      var profilenotes = profiledata['notes'];

      if ([null, undefined, ""].includes(profilenotes)) {
        var notes = {
          generalnotes: []
        }
        notes['generalnotes'].push({
          date: new Date(),
          givenBy: this.loggedinprofile_id,
          generalnotes: this.profileNotes
        });

        updateDoc(profileRef, {
          notes: notes
        }).then(() => {
          this.openSnackBar('Notes Added to the profile', 'OK');
          this.profileNotes = "";
        }).catch((error) => {
          this.openSnackBar('Error Occured while adding notes', 'OK');
          console.log('Error', error);
        })

      } else if ([null, undefined, ""].includes(profilenotes['generalnotes'])) {
        var gennotes = [];
        gennotes.push({
          date: new Date(),
          givenBy: this.loggedinprofile_id,
          generalnotes: this.profileNotes
        });
        profilenotes['generalnotes'] = gennotes

        updateDoc(profileRef, {
          notes: profilenotes
        }).then(() => {
          this.openSnackBar('Notes Added to the profile', 'OK');
          this.profileNotes = "";
        }).catch((error) => {
          this.openSnackBar('Error Occured while adding notes', 'OK');
          console.log('Error', error);
        })
      } else {
        profilenotes['generalnotes'].push({
          date: new Date(),
          givenBy: this.loggedinprofile_id,
          generalnotes: this.profileNotes
        });

        updateDoc(profileRef, {
          notes: profilenotes
        }).then(() => {
          this.openSnackBar('Notes Added to the profile', 'OK');
          this.profileNotes = "";
        }).catch((error) => {
          this.openSnackBar('Error Occured while adding notes', 'OK');
          console.log('Error', error);
        })
      }
    } else {
      alert('Enter Notes');
    }
  }


  copyMessage(val: string) {
    const selBox = document.createElement('textarea');
    selBox.style.position = 'fixed';
    selBox.style.left = '0';
    selBox.style.top = '0';
    selBox.style.opacity = '0';
    selBox.value = val;
    document.body.appendChild(selBox);
    selBox.focus();
    selBox.select();
    document.execCommand('copy');
    document.body.removeChild(selBox);
  }

  delectChat(docid) {
    var agree = confirm(" Are you sure want to delete the chat")
    const clientissueDoc = doc(this.firestore, 'clientissue', this.currentIssueData['id'])
    let chatSubCollection = doc(clientissueDoc, 'messages', docid)
    if (agree) {
      deleteDoc(chatSubCollection).then(() => {
        console.log("Chat Deleted Successfully");
        this.openSnackBar("Chat Deleted Successfully", "Ok");
      }).catch((error) => {
        console.log("Oops error while deleting chat", error);
        this.openSnackBar("Oops Something Went wrong", "Ok");
      });
    }
  }

  getAssigned(): Array<string[]> {
    const assignedTo: string[] = this.categorylist.filter((e) => this.filterform.controls['category'].value?.includes(e.category)).map((item) => item.assignto)[0] || [];
    return [assignedTo];
  }

  returnFilterMember() {
    return this.chatadminUsers.filter(e => this.mapProfileData[e]['name']?.toLowerCase().includes(this.filteredMember?.toLowerCase())).sort((a, b) => this.mapProfileData[a]['name']?.toLowerCase().localeCompare(this.mapProfileData[b]['name']?.toLowerCase()))
  }

  openSnackBar(message: string, action: string) {
    this.snackbar.open(message, action, { duration: 2000 })
  }

  onClick(event) {
    event.target.value = ''
  }

  openProfile(profileid) {
    if (window.location.port.includes('4200')) {
      window.open(`http://localhost:4200/participantpurchase/${profileid}`, '_blank');
    } else if (environment.firebase.projectId == 'starlabs-test') {
      window.open(`https://starlabs-test-19.web.app/participantpurchase/${profileid}`, '_blank');
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open(`https://breakthroughs.app/participantpurchase/${profileid}`, '_blank');
    }
  }

  chooseType(type) {

    if (type == 'image') {
      this['filetype'] = 'image/*';
    } else if (type == 'video') {
      this['filetype'] = 'video/*';
    } else if (type == 'audio') {
      this['filetype'] = 'audio/*';
    } else if (type == 'files') {
      this['filetype'] = 'application/*';
    }

    setTimeout(() => {
      this.fileInput.nativeElement.click();
    }, 50);
  }

  // updateTicketDetails(value) {
  //   // if (value['status']?.toLowerCase() == 'closed') {
  //   //   this.dialog.open(CustomerTicketReviewComponent, {
  //   //     disableClose: true,
  //   //     width: '26vw',
  //   //     data: {
  //   //       data: this.currentIssueData,
  //   //       type: 'happinessindex'
  //   //     }
  //   //   })
  //   // }

  //   // var status = {
  //   //   date: new Date(),
  //   //   editedBy: this.loggedinprofile_id,
  //   //   status: value['status']
  //   // }

  //   var notes = {
  //     remarks: value['notes'],
  //     date: new Date(),
  //     writtenBy: this.loggedinprofile_id
  //   }

  //   var categoryLog = {
  //     user : this.loggedinprofile_id,
  //     time : Timestamp.fromDate(new Date()),
  //     categoryprevious : this.currentIssueData['category'],
  //     categoryafter : value['category'],
  //   }

  //   var updatedDocument = {}

  //   console.log(this.currentIssueData['category'])

  //   if (![null, undefined, ""].includes(value['notes'])) {
  //     updatedDocument['notes'] = arrayUnion(notes);
  //   }

  //   if (value['category'] !== this.currentIssueData['category']) {
  //     updatedDocument['category'] = value['category'];
  //     updatedDocument['categorylog'] = arrayUnion(categoryLog);
  //   }
  //   const clientissue = doc(this.firestore, 'clientissue', this.currentIssueData['id'])

  //   console.log('updated document : ',updatedDocument);
  //   updateDoc(clientissue, updatedDocument).then(() => {
  //       console.log('Update Successfully');
  //       this.filterform.controls['notes'].setValue('')
  //       this.filterform.controls['category'].setValue('')
  //     }).catch((error) => {
  //       console.log('Error', error);
  //     });

  //   updateDoc(clientissue, {
  //     assign: this.getAssigned(),
  //     peopleinvolved: [null, undefined, ""].includes(value['peopleinvolved']) ? [] : value['peopleinvolved'],
  //     chatstatus: [null, undefined, ""].includes(value['chatstatus']) ? "" : value['chatstatus'],
  //     priority: [null, undefined, ""].includes(value['priority']) ? "" : value['priority'],
  //     // status: status
  //   }).then(() => {
  //     console.log('Client Details Updated Successfully');
  //     this.openSnackBar('Client Details Updated Successfully', 'ok')
  //   }).catch((error) => {
  //     console.log('Error', error);
  //   });
  // }

  updateTicketDetails(value) {
    console.log(value)
    // if (value['status']?.toLowerCase() == 'closed') {
    //   this.dialog.open(CustomerTicketReviewComponent, {
    //     disableClose: true,
    //     width: '26vw',
    //     data: {
    //       data: this.currentIssueData,
    //       type: 'happinessindex'
    //     }
    //   })
    // }

    // var status = {
    //   date: new Date(),
    //   editedBy: this.loggedinprofile_id,
    //   status: value['status']
    // }

    var notes = {
      remarks: value['notes'],
      date: new Date(),
      writtenBy: this.loggedinprofile_id
    }

    var categoryLog = {
      user: this.loggedinprofile_id,
      time: Timestamp.fromDate(new Date()),
      categoryprevious: this.currentIssueData['category'],
      categoryafter: value['category'],
    }

    const clientissue = doc(this.firestore, 'clientissue', this.currentIssueData['id']);

    updateDoc(clientissue, {
      assign: this.getAssigned()[0],
      peopleinvolved: [null, undefined, ""].includes(value['peopleinvolved']) ? [] : value['peopleinvolved'],
      chatstatus: [null, undefined, ""].includes(value['chatstatus']) ? "" : value['chatstatus'],
      priority: [null, undefined, ""].includes(value['priority']) ? "" : value['priority'],
      category: [null, undefined, ""].includes(value['category']) ? this.currentIssueData['category'] : value['category'],
      notes: [null, undefined, ""].includes(value['notes']) ? this.currentIssueData['notes'] || [] : arrayUnion(notes),
      categorylog: value['category'] === this.currentIssueData['category'] ? this.currentIssueData['categorylog'] || [] : arrayUnion(categoryLog)
    }).then(() => {
      console.log('Client Details Updated Successfully');
      this.filterform.controls['notes']?.setValue('');
      this.ticketEditFormStatus = {
        category: false,
        notes: false,
        peopleinvolved: false
      }
      this.openSnackBar('Client Details Updated Successfully', 'ok')
    }).catch((error) => {
      console.log('Error', error);
    });
  }

  async updateStatus(status: string) {
    if (status?.toLowerCase() == 'closed' && this.currentIssueData && this.currentIssueData['status']?.['status']?.toLowerCase() == 'open') {
      const closingMessage = this.chatConfigData['closingmessages'] && this.chatConfigData['closingmessages'][0] && this.chatConfigData['closingmessages'][0]['message'] ? this.chatConfigData['closingmessages'][0]['message'] : null;

      if (closingMessage) {
        const success = await this.sendClosingMessage(closingMessage, this.currentIssueData);
        if (!success) {
          return;
        }
      } else {
        return;
      }
    }

    const statusData = {
      date: new Date(),
      editedBy: this.loggedinprofile_id,
      status: status
    };

    const clientissue = doc(this.firestore, 'clientissue', this.currentIssueData['id']);
    updateDoc(clientissue, {
      status: statusData
    }).then(() => {
      console.log('Status Updated Successfully');
      this.openSnackBar('Status Updated Successfully', 'OK');
    }).catch((error) => {
      console.log('Error', error);
      this.openSnackBar('Error updating status', 'OK');
    });
  }

  calculateTimeToDelete(time) {
    if (![null, undefined, ""].includes(time)) {
      const twoMinutesInMilliseconds = 300 * 1000;
      const storedDate = time.toDate()
      const currentTime = new Date();
      const timeDifference = currentTime.getTime() - storedDate.getTime();
      return timeDifference < twoMinutesInMilliseconds ? true : false;
    }
    return false
  }

  formatMessage(text: string): string {
    if (!text) return text;

    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?"'\])>])/gi;
    let result = text.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
    });

    // Convert newlines to <br>
    result = result.replace(/\n/g, '<br>');

    return result;
  }

  async sendMessage(formvalue, SelectedChat) {
    if (SelectedChat['assign'].includes(this.loggedinprofile_id) || (SelectedChat['peopleinvolved'] && SelectedChat['peopleinvolved'].includes(this.loggedinprofile_id))) {
      if (this.selectFiles.length == 0 && formvalue.message == '' && formvalue.message == '\n') {
        alert("Oops, Please type a message....");
      } else {
        console.log("Sending Message");
        var msgData = {};
        var message = formvalue.message
        var files = this.selectedFiles
        this.selectedFiles = [];
        this.messageform.controls['message'].setValue('');
        this.messageform.controls['files'].setValue([])
        var extractedLinks = (formvalue.message.match(this['linkPattern']) || []).map(link => link.trim());
        console.log('uploading');
        var date = new Date()
        let docID = doc(collection(this.firestore, 'messages')).id
        const chatCollection = doc(this.firestore, 'clientissue', SelectedChat['id'])
        let chatSubCollection = doc(chatCollection, 'messages', docID)

        msgData = {
          "time": date,
          "message": message,
          "messageid": docID,
          "sender_profileid": this.loggedinprofile_id,
          "sender_email": this.profile_email,
          "sender_uid": this.authservice.uid,
          "pending": ['user'],
          "read_by": ['admin'],
          "links": extractedLinks,
          "files": [],
          "type": "chat",
          "clientid": SelectedChat['clientid'],
          "ticketid": SelectedChat['id']
        }
        await updateDoc(chatCollection, {
          "chatstatus": "Responded",
          "last_modification": new Date(),
          "last_pending": ['user'],
          "last_read_by": ['admin'],
        })

        if (SelectedChat['status']['status'].toLowerCase() != 'open') {
          await updateDoc(chatCollection, {
            "status": {
              "status": 'Open',
              "date": new Date(),
              "editedBy": this.loggedinprofile_id
            }
          })
        }

        const batch = writeBatch(this.firestore);
        batch.set(chatSubCollection, msgData);
        await batch.commit().then(async () => {
          console.log('Message sent successfully');
          this.openSnackBar("Message sent successfully", "Ok")
        }).catch((error) => {
          console.log('error', error);
          this.openSnackBar("Oops something went wrong", "Ok")
        });
        this.updateSupportchatMessage(SelectedChat['id'])
        if (files.length != 0) {
          this.uploadFiles(chatCollection, chatSubCollection, files);
        }
        // this.firestore.collection('notifications').doc(this.mapProfileData[SelectedChat.clientid]['user_ref'].id).set({
        //   name: this.mapProfileData[SelectedChat.clientid]['name'],
        //   read: false
        // },{merge:true}).then(() => {
        //   this.createNotfication(this.mapProfileData[SelectedChat['clientid']]['user_ref'].id,this.currentIssueData,message)
        // }).catch((error) => {
        //   console.log('Error Creating Notification Document',error);
        // });
      }
    } else {
      alert('Oops, This ticket is not assigned to you')
    }
  }

  async sendClosingMessage(message: string, SelectedChat: any): Promise<boolean> {
    try {
      if (!SelectedChat['assign'].includes(this.loggedinprofile_id) && (SelectedChat['peopleinvolved'] && !SelectedChat['peopleinvolved'].includes(this.loggedinprofile_id))) {
        alert('Oops, This ticket is not assigned to you');
        return false;
      }

      if (this.selectFiles.length == 0 && (message == '' || message == '\n')) {
        alert("Oops, Please type a message....");
        return false;
      }

      console.log("Sending Message");
      const files = this.selectedFiles;
      this.selectedFiles = [];
      this.messageform.controls['message'].setValue('');
      this.messageform.controls['files'].setValue([]);

      const extractedLinks = (message.match(this['linkPattern']) || []).map(link => link.trim());
      const date = new Date();
      const docID = doc(collection(this.firestore, 'messages')).id;
      const chatCollection = doc(this.firestore, 'clientissue', SelectedChat['id']);
      const chatSubCollection = doc(chatCollection, 'messages', docID);

      const msgData = {
        "time": date,
        "message": message,
        "messageid": docID,
        "sender_profileid": this.loggedinprofile_id,
        "sender_email": this.profile_email,
        "sender_uid": this.authservice.uid,
        "pending": ['user'],
        "read_by": ['admin'],
        "links": extractedLinks,
        "files": [],
        "type": "automated",
        "clientid": SelectedChat['clientid'],
        "ticketid": SelectedChat['id']
      };

      // Update chat status
      await updateDoc(chatCollection, {
        "chatstatus": "Responded",
        "last_modification": new Date(),
        "last_pending": ['user'],
        "last_read_by": ['admin'],
      });

      // Send message
      const batch = writeBatch(this.firestore);
      batch.set(chatSubCollection, msgData);
      await batch.commit();

      console.log('Message sent successfully');
      this.openSnackBar("Message sent successfully", "Ok");
      this.updateSupportchatMessage(SelectedChat['id']);

      // Upload files if any
      if (files.length != 0) {
        this.uploadFiles(chatCollection, chatSubCollection, files);
      }

      return true;

    } catch (error) {
      console.log('error', error);
      this.openSnackBar("Oops something went wrong", "Ok");
      return false;
    }
  }

  removeFile(index) {
    this.selectedFiles.splice(index, 1)
    var file = Object.assign([], this.messageform.get("files").value)
    file.splice(index, 1)
    this.messageform.patchValue({
      files: file
    });
  }

  downloadFiles(url) {
    window.open(url, '_blank')
  }

  openMenu(menuTrigger: MatMenuTrigger) {
    menuTrigger.openMenu();
  }

  closeMenu(menuTrigger: MatMenuTrigger) {
    menuTrigger.closeMenu();
  }

  selectFiles(value) {
    this.selectedFiles = []
    var localURL = []
    const target = value.target as HTMLInputElement;
    const files = target.files;
    if (!files) return;
    this.selectedFiles = Array.from(files)

    for (let i = 0; i < this.selectedFiles.length; i++) {
      const element = this.selectedFiles[i];
      const reader = new FileReader();
      reader.readAsDataURL(element);
      reader.onload = (event => {
        var map = {};
        map['filename'] = element.name
        map['type'] = element.type
        map['url'] = event.target.result
        console.log(map);

        localURL.push(map)
        console.log("map", map);

        this.messageform.patchValue({
          files: localURL
        });
      });
    }
  }

  async uploadFiles(chatCollection, chatSubCollection, files) {
    var uploadedFiles = [];

    if (files.length != 0) {
      console.log('file uploading...');

      for (let a = 0; a < files.length; a++) {
        const imageFile = files[a];
        const filePath = `Chat/${imageFile.name}_${imageFile.lastModified}_${imageFile.size}`;
        const fileRef = ref(this.storage, filePath);

        try {
          const uploadResult = await uploadBytes(fileRef, imageFile);
          const imageURL = await getDownloadURL(uploadResult.ref);

          const map: any = {
            filename: imageFile.name,
            filetype: imageFile.type,
            fileurl: imageURL,
            mediatype: imageFile.type.split('/')[0],
          };

          uploadedFiles.push(map);
          console.log('File uploaded:', map.filename);
        } catch (error) {
          console.error('Error uploading file:', imageFile.name, error);
        }
      }

      await updateDoc(chatSubCollection, {
        "files": uploadedFiles ?? [],
        "type": uploadedFiles.length == 0 ? 'text' : uploadedFiles[0]['filetype'],
      }).then(() => {
        console.log("file uploaded and updated successfully");
      }).catch((error) => {
        console.log('Oops error while uploading files', error);
      });

      await updateDoc(chatCollection, {
        "last_modification": new Date(),
        "files": uploadedFiles
      }).then(() => {
        console.log("file uploaded and updated successfully in main collection");
      }).catch((error) => {
        console.log('Oops error while uploading files in main collection', error);
      });

    } else {
      console.log("No files to upload");
    }
  }

  updateSupportchatMessage(chatid) {
    const clientissueDoc = doc(this.firestore, 'clientissue', chatid)
    const messagesRef = collection(clientissueDoc, 'messages')
    const messageQuery = query(messagesRef, where('pending', 'array-contains', 'admin'), orderBy("time", 'desc'))
    getDocs(messageQuery).then((newData) => {
      console.log("Pending Message count", newData.docs.length);
      if (newData.docs.length != 0) {
        for (let i = 0; i < newData.docs.length; i++) {
          const doc = newData.docs[i];
          updateDoc(doc.ref, {
            "read_by": arrayUnion('admin'),
            "pending": arrayRemove('admin')
          }).then(() => {
            console.log('reciept updated successfully');
          }).catch((error) => {
            console.log('Oops Error while updating reciept', error);
          });
        }
      } else {
        console.log("No Messages to update..");
      }
    });
  }

  // async createNotfication(receiverId,issueData,message){
  //   const docId = this.firestore.createId();
  //   issueData['date'] = firebase.default.firestore.FieldValue.serverTimestamp()
  //   issueData['message'] = message,
  //   issueData['read'] = false
  //   issueData['type'] = "ticket"
  //   await this.firestore.collection('notifications').doc(receiverId).collection('logs').doc(docId).set(issueData).then(()=>{
  //     console.log('Notofication Log has been created');
  //   }).catch((error)=>{
  //     console.log('Error Creating Notification Log',error);
  //   })
  // }

  showPopup(row: any, event: MouseEvent) {
    this.popupData = row;

    const targetElement = event.target as HTMLElement;
    const rect = targetElement.getBoundingClientRect();
  }

  hidePopup() {
    this.popupData = null;
  }

  updateValidators() {
    this.dialog.open(CustomerTicketReviewComponent, {
      disableClose: true,
      width: '26vw',
      data: {
        data: this.currentIssueData,
        type: 'validator'
      }
    })
  }

  async insertMessage(chat) {
    this.dialog.open(InsertMessageDialogComponent, {
      disableClose: true,
      width: '50vw',
      data: {
        data: chat,
        mapprofile: this.mapProfileData,
        clientid: this.clientid,
        ticketid: this.currentIssueData['id']
      }
    })
  }

  // surya
  getProfileName(profileId: string) {
    if (profileId && this.mapProfileData[profileId]) {
      return this.mapProfileData[profileId].name ?? ''
    }
    return profileId;
  }

  formatDate(date: any) {
    if (date?.toDate) {
      return date.toDate();
    }
    return date
  }

  getCategoryLogs() {
    const categoryLog = this.currentIssueData['categorylog'] || [];
    categoryLog.sort((a, b) => {
      return this.formatDate(b?.time) - this.formatDate(a?.time);
    })
    return categoryLog;
  }

  get getPeopleInvolved() {
    return (this.currentIssueData['peopleinvolved'] || []).map((id) => this.mapProfileData[id]['name'] || '').join(',')
  }

  get getNotes() {
    const notes = this.currentIssueData['notes'] || [];
    notes.sort((a, b) => {
      return this.formatDate(b?.date) - this.formatDate(a?.date);
    })
    return notes;
  }

  toggleAssignShow() {
    this.showAllAssignTo = !this.showAllAssignTo;
  }

  getAssignForToolTip() {
    return this.getAssigned()[0].map((assign) => this.mapProfileData[assign]?.name).join(',')
  }

  showEdit(ticketField: string) {
    if (Object.hasOwn(this.ticketEditFormStatus, ticketField)) {
      this.ticketEditFormStatus[ticketField] = true;
    }
  }

  cancelEdit(ticketField: string) {
    if (Object.hasOwn(this.ticketEditFormStatus, ticketField)) {
      this.ticketEditFormStatus[ticketField] = false;
      this.filterform.get(ticketField)?.setValue(this.filterFormInitialValue[ticketField]);
    }
  }

}