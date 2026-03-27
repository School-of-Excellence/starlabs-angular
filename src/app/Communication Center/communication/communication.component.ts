import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, NgZone, ChangeDetectorRef, QueryList, ViewChildren, ChangeDetectionStrategy, SimpleChanges } from '@angular/core';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Firestore, CollectionReference, DocumentReference, DocumentSnapshot, doc, collection, docData, getDocs, query, where, orderBy, setDoc, getDoc, updateDoc, serverTimestamp, arrayUnion, collectionData } from '@angular/fire/firestore';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { AngularEditorComponent, AngularEditorConfig, AngularEditorModule } from '@kolkov/angular-editor';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ViewTemplateDialogComponent } from '../view-template-dialog/view-template-dialog.component';
import { NavigationEnd, Router } from '@angular/router';
import { MyOperatorService } from '../myoperator-service';
// import { WatiService } from '../wati-service';
import { filter, map } from 'rxjs/operators';
import { combineLatest } from 'rxjs';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatTabChangeEvent, MatTabsModule } from '@angular/material/tabs';
import { SendIndividualEmailComponent } from '../send-individual-email/send-individual-email.component';
import { AuthguardService } from '../../authguard.service';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatChipListbox, MatChipsModule, MatChipSelectionChange } from '@angular/material/chips';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ReleaselogdialogComponent } from '../../Customer Support/releaselogdialog/releaselogdialog.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { EmailValidationFromAnalyticsComponent } from "../email-validation-from-analytics/email-validation-from-analytics.component";

interface AudioState {
  isPlaying: boolean;
  isActive: boolean;
  isMuted: boolean;
  progress: number;
  currentTime: number;
  duration: number;
}

@Component({
  selector: 'app-communication',
  imports: [
    CommonModule,
    MatSidenavModule,
    MatIconModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatSelectModule,
    MatOptionModule,
    MatChipsModule,
    MatPaginatorModule,
    NgxMatSelectSearchModule,
    MatListModule,
    MatTabsModule,
    AngularEditorModule,
    MatSlideToggleModule,
    MatChipListbox,
    EmailValidationFromAnalyticsComponent,
    HttpClientModule
  ],
  changeDetection : ChangeDetectionStrategy.Default,
  templateUrl: './communication.component.html',
  styleUrls: ['./communication.component.css'],
  animations: [
    trigger('expandCollapse', [
      state('collapsed', style({
        height: '0px',
        overflow: 'hidden',
        opacity: '0',
        padding: '0px'
      })),
      state('expanded', style({
        height: '*',
        opacity: '1'
      })),
      transition('collapsed <=> expanded', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
    ]),
    trigger('rotateAnimation', [
      state('collapsed', style({ transform: 'rotate(0deg)' })),
      state('expanded', style({ transform: 'rotate(180deg)' })),
      transition('collapsed <=> expanded', animate('225ms'))
    ])
  ]
})

export class CommunicationComponent implements OnInit, AfterViewInit {
  @ViewChild('sidenav') sidenav: MatSidenav;
  view: string = 'dashboard';
  templatesExpanded: boolean = false;
  @ViewChildren('audioElement') audioElements: QueryList<ElementRef>;
  audioStates: AudioState[] = [];
  currentlyPlaying: number = -1;
  previewMode: string = 'web';
  needsValidationTemplates: any[] = [];
  validatedTemplates: any[] = [];
  activeMainTab = 0; // 0 for Needs Validation, 1 for Validated
  activeMediumTab = 0; // 0 for All, 1 for Email, 2 for WhatsApp, etc.
  profileData = [];
  tempProfileData = [];

  tableData: MatTableDataSource<any> = new MatTableDataSource();
  // profileData:MatTableDataSource<any> = new MatTableDataSource<any>([]);
  templateData: MatTableDataSource<any> = new MatTableDataSource();
  @ViewChild(MatSort) matsort!: MatSort
  @ViewChild(MatPaginator) paginator!: MatPaginator
  @ViewChild(AngularEditorComponent) editorComponent!: AngularEditorComponent;
  @ViewChild('editor', { static: true }) editorElement: any;
  sanitizedHtmlContent: SafeHtml | undefined;
  selectedImage: HTMLElement | null = null;

  // String declarations 
  chatAdmin: string = "";
  profile_id: string = "";
  profile_email: string = "";
  htmlContent: string = "";
  templateType: string = "Standard";
  notes: string = "";
  // view: string = "dashboard";
  viewmode: string = "create";
  templateHtml: SafeHtml | string = "";
  emailHtml: SafeHtml | string = "";
  buttonName: String = "";
  buttonSize: String = "";
  buttonAlign: string = 'center';
  buttonLink: string = "";
  searchCategory: string = "";
  searchSubCategory: string = "";
  templateSubject: string = "";
  searchprofile: string = "";
  editDocID: string = "";
  searchtemplate: string = "";
  message: string = "";
  landingPage: string = "";
  title: string = "";
  selectedTemplateType: string = "";
  filteredCalledBy: string = "";
  filteredCalledTo: string = "";
  loggedInProfileId: string = "";
  selectedlogtype: string = "";
  searchParticipants: string = "";
  notificationimage
  currentUrl: string = "";
  currentComponent: string = "";

  //Number Declarations
  selectedImageWidth: number = 100;
  selectedImageHeight: number = 100;

  // Array declarations
  selectedRows = [];
  templates: any[] = [];
  tableHeader = ["templatename", "category", "status", "lastupdate", "actions"];
  validatorHeader = ["select", "Name"];
  templateHeader = ["TemplateId", "TemplateName", "TemplateType", "TemplateAlias", "Category", "SubCategory", "postmark", "Actions"];
  templateCategories = [];
  templateSubCategories = [];
  validators = [];
  emailTemplatesArray = [];
  logDisplayData = [];
  templogDisplayData = [];
  selectedLogProfiles = [];
  myOperatorCalls = [];
  tempMyOperatorCalls = [];
  watiMessages = [];
  tempWatiMessages = [];
  templatesArray = [];
  tempTemplateArray = [];
  notificationList = [];
  tempnotificationList = [];
  inappmessageList = [];
  tempInappMessageList = [];
  tempTemplates = [];

  components = [
    { "name": "email", "displayName": "Email", "count": 0, "icon": "" },
    { "name": "whatsapp", "displayName": "WhatsApp", "count": 0, "icon": "" },
    { "name": "calls", "displayName": "Calls", "count": 0, "icon": "" },
    { "name": "notifications", "displayName": "Notifications", "count": 0, "icon": "" },
    { "name": "inappmessage", "displayName": "In App Message", "count": 0, "icon": "" },
  ];

  // {"name" : "templates", "displayName" : "Templates", "count" : 0, "icon" : ""},
  // {"name" : "validators", "displayName" : "Validators", "count" : 0, "icon" : ""},

  templatesCount = [
    { "name": "email", "displayName": "Email", "count": 0, "icon": "" },
    { "name": "whatsapp", "displayName": "WhatsApp", "count": 0, "icon": "" },
    { "name": "notification", "displayName": "Notifications", "count": 0, "icon": "" },
    { "name": "inappmessage", "displayName": "In App Message", "count": 0, "icon": "" },
  ];

  // Object declarations 
  mapProfiles = {};
  selectedTemplate:any = {};
  selectedLogTemplate = {};
  mapProfileData = {};
  mapEMailTemplates = {};
  mapMyOperator = {};
  mapNumber = {};
  mapProfileUid = {};
  emailDisplayData = {
    "Sent": 0,
    "Delivered": 0,
    "Opened": 0,
    "Clicked": 0,
    "Bounce": 0,
    "All": 0
  }

  bufferDoc = {
    profileid: [],
    createdby: null,
    date: new Date(),
    status: 'created',
    title: null,
    subtitle: null,
    message: null,
    notes: null
  }

  editorConfig: AngularEditorConfig = {
    editable: true,
    spellcheck: false,
    height: 'auto',
    minHeight: '200px',
    maxHeight: 'auto',
    width: 'auto',
    minWidth: '0',
    translate: 'yes',
    enableToolbar: true,
    showToolbar: true,
    placeholder: 'Enter text here...',
    defaultParagraphSeparator: '',
    defaultFontName: '',
    defaultFontSize: '',
    fonts: [
      {class: 'arial', name: 'Arial'},
      {class: 'times-new-roman', name: 'Times New Roman'},
      {class: 'calibri', name: 'Calibri'},
      {class: 'comic-sans-ms', name: 'Comic Sans MS'}
    ],
    customClasses: [
      {
        name: 'quote',
        class: 'quote',
      },
      {
        name: 'redText',
        class: 'redText'
      },
      {
        name: 'titleText',
        class: 'titleText',
        tag: 'h1',
      },
    ],

    sanitize: false,
    toolbarPosition: 'top',
    toolbarHiddenButtons: [],
  };

  // Boolean declarations
  displayTemplate: boolean = false;
  sendEmailTemplate: boolean = false;
  hideAddButton: boolean = true;
  isMobileSize: boolean = false;
  sticky: boolean = false;
  templateNameAvailable: boolean = false;
  loading: boolean = true;

  // pagination declarations
  paginatedData: any[] = [];
  pageSize: number = 10;
  currentPage: number = 0;

  emailcategoryDocumentRef: DocumentReference;
  emailvalidatorsDocumentRef: DocumentReference;

  emailarchiveCollection : CollectionReference;
  myoperatorcallsCollection : CollectionReference;
  watiarchiveCollection : CollectionReference;
  notificationrecordCollection : CollectionReference;
  innapptemplatesCollection : CollectionReference;
  notificationtemplatesCollection : CollectionReference;
  emailtemplatesCollection : CollectionReference;
  watitemplatesCollection : CollectionReference;

  templateForm: FormGroup;
  templateFilterForm: FormGroup;
  dateform: FormGroup;
  myOperatorForm: FormGroup;

  constructor(
    // private watiService: WatiService,
    private authguard: AuthguardService,
    public firestore: Firestore,
    private sanitizer: DomSanitizer,
    private formbuilder: FormBuilder,
    private zone: NgZone,
    public dialog: MatDialog,
    public router: Router,
    public http: HttpClient,
    private myoperator: MyOperatorService,
    private snackBar: MatSnackBar,
    private storage: AngularFireStorage,
    private cdr: ChangeDetectorRef
  ) {

    this.authguard.getRoles().then(async (roles) => {

      // if (roles["admin"] || roles["ah"] || roles["integrator"] || roles["scheduler"]) {

        this.loggedInProfileId = roles["profile_ref"].id;
          await this.authguard.getProfileMap().then((data) => {
            this.mapProfileData = data.docdata,
            this.mapProfileUid = data.mapUserId,
            this.mapMyOperator = data.myoperatoruid,
            this.mapNumber = data.number;
          });
        
      // } else {
      //   this.router.navigateByUrl("/");
      // }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['htmlContent']) {
      this.sanitizedHtmlContent = this.sanitizer.bypassSecurityTrustHtml(this.htmlContent);
    }
  }

  ngOnInit() {

    this.emailarchiveCollection = collection(this.firestore, 'email archive');
    this.emailtemplatesCollection = collection(this.firestore, 'email templates');
    this.myoperatorcallsCollection = collection(this.firestore, 'myoperator calls');
    this.watiarchiveCollection = collection(this.firestore, 'wati archive');
    this.watitemplatesCollection = collection(this.firestore, 'wati templates');
    this.notificationrecordCollection = collection(this.firestore, 'notificationrecord');
    this.notificationtemplatesCollection = collection(this.firestore, 'notification templates');
    this.innapptemplatesCollection = collection(this.firestore, 'inapp templates');
    this.emailcategoryDocumentRef = doc(collection(this.firestore, 'email validators'), 'templateCategories');
    this.emailvalidatorsDocumentRef = doc(collection(this.firestore, 'email validators'), 'validators');

    this.templateForm = this.formbuilder.group({
      templateName: ['', { validators: [Validators.required] }],
      templateAlias: ['', { validators: [Validators.required], updateOn: "change" }],
      templateCategory: ['', { validators: [Validators.required], updateOn: "change" }],
      templateSubCategory: ['', { validators: [Validators.required], updateOn: "change" }],
    });

    this.templateFilterForm = this.formbuilder.group({
      templateType: [''],
      templateName: ['',],
      templateCategory: ['',],
      templateSubCategory: ['',],
      startdate: ['',],
      enddate: ['',]
    });

    this.dateform = this.formbuilder.group({
      start: [new Date(),],
      end: [new Date(),],
    });

    this.myOperatorForm = this.formbuilder.group({
      search: ['',],
      calledby: ['',],
      calledto: ['',],
      callstatus: ['',],
      status: ['',],
    });

    window.addEventListener('message', (event) => {
      if (event.data.currentTime !== undefined && event.data.duration !== undefined) {
        let currentTime = event.data.currentTime;
        let duration = event.data.duration;
      }
    });

    docData(this.emailcategoryDocumentRef).subscribe((data) => {
      this.templateCategories = data["categories"] ?? [];
      this.templateSubCategories = data["subcategories"] ?? [];
    });

    this.filter(new Date(), new Date());
    this.fetchTemplates();
    this.fetchProfiles();
  }

  ngAfterViewInit() {
    const tabContainers = document.querySelectorAll('.neo-tabs');
    tabContainers.forEach(container => {
    const activeTab = container.querySelector('.tab-item.active') as HTMLElement;
    const indicator = container.querySelector('.tab-indicator') as HTMLElement;
      if (activeTab && indicator) {
        indicator.style.width = `${activeTab.offsetWidth}px`;
        indicator.style.left = `${activeTab.offsetLeft}px`;
      }
    });

    // this.profileData.sort = this.matsort;
    // this.profileData.paginator = this.paginator;

    const checkToolbarInterval = setInterval(() => {
      const toolbar = document.querySelector('.angular-editor-toolbar');
      if (toolbar) {
        clearInterval(checkToolbarInterval); // Stop checking once the toolbar is found

        const customButton = document.createElement('button');
        customButton.innerText = 'Add Button';
        customButton.style.marginBottom = '10px';
        customButton.style.marginLeft = '10px';
        customButton.style.padding = '5px 10px';
        customButton.style.backgroundColor = '#007BFF';
        customButton.style.color = '#FFF';
        customButton.style.border = 'none';
        customButton.style.cursor = 'pointer';

        // Add a click event with Angular's NgZone
        customButton.addEventListener('click', () => {
          this.zone.run(() => {
            this.hideAddButton = false;
          });
        });

        toolbar.appendChild(customButton);
      }
    }, 100); // Retry every 100ms until the toolbar is found
  }

  ngOnDestroy(): void {
    // Pause any playing audio when component is destroyed
    if (this.currentlyPlaying >= 0) {
      const audioElement = this.getAudioElement(this.currentlyPlaying);
      if (audioElement) {
        audioElement.pause();
      }
    }
  }

  sendemail() {
    this.dialog.open(SendIndividualEmailComponent, {
      data: {
        mailid: '3WJxaE8Dt8Y3RnA2bZbB'
      },
      panelClass: 'custom-dialog-container'
    })
  }

  separateTemplates(): void {
    this.needsValidationTemplates = this.templatesArray.filter(t => !t.templatevalidated);
    this.validatedTemplates = this.templatesArray.filter(t => t.templatevalidated);
  }

  updateTemplateCounts(): void {
    // Reset counts
    this.templatesCount[0].count = this.templatesArray.filter(t => t.type === 'email').length;
    this.templatesCount[1].count = this.templatesArray.filter(t => t.type === 'whatsapp').length;
    this.templatesCount[2].count = this.templatesArray.filter(t => t.type === 'notification').length;
    this.templatesCount[3].count = this.templatesArray.filter(t => t.type === 'inappmessage').length;

    // Update validation counts
    const needsValidationCount = this.needsValidationTemplates.length;
    const validatedCount = this.validatedTemplates.length;

    // You could add these to your template stats if needed
    console.log(`Templates requiring validation: ${needsValidationCount}`);
    console.log(`Validated templates: ${validatedCount}`);
  }

  // Tab change handler
  onTabChange(event: MatTabChangeEvent): void {
    // Track active main tab
    this.activeMainTab = event.index;

    // Reset filters when switching between validation status tabs
    this.resetValues();
  }

  // Medium tab change handler
  onMediumTabChange(event: MatTabChangeEvent): void {
    // Track active medium tab
    this.activeMediumTab = event.index;
  }

  getTemplatesByType(type: string, templateArray: any[]): any[] {
    return templateArray.filter(t => t.type === type);
  }

  // Get counts for validation status templates by type
  getTypeCount(type: string, validationStatus: boolean): number {
    if (validationStatus) {
      return this.validatedTemplates.filter(t => t.type === type).length;
    } else {
      return this.needsValidationTemplates.filter(t => t.type === type).length;
    }
  }

  // Get badge count for validation status
  getValidationCount(isValidated: boolean): number {
    if (isValidated) {
      return this.validatedTemplates.length;
    } else {
      return this.needsValidationTemplates.length;
    }
  }

  getAudioElement(index: number): HTMLAudioElement | null {
    if (this.audioElements && this.audioElements.toArray()[index]) {
      return this.audioElements.toArray()[index].nativeElement;
    }
    return null;
  }

  toggleAudio(item: any, index: number): void {
    const audioElement = this.getAudioElement(index);

    if (!audioElement) return;

    // If this is the first time playing this audio
    if (!this.audioStates[index].isActive) {
      // First close any currently active audio player
      this.closeAllAudio();

      // Then activate this one
      this.audioStates[index].isActive = true;

      // Wait a moment for the audio player to become visible
      setTimeout(() => {
        // Load metadata to get duration
        audioElement.addEventListener('loadedmetadata', () => {
          this.audioStates[index].duration = audioElement.duration;
        });

        // Play the audio
        audioElement.play()
          .then(() => {
            this.audioStates[index].isPlaying = true;
            this.currentlyPlaying = index;
          })
          .catch(error => {
            console.error('Error playing audio:', error);
          });
      }, 300);
    } else {
      // Toggle play/pause
      if (this.audioStates[index].isPlaying) {
        audioElement.pause();
      } else {
        audioElement.play()
          .then(() => {
            this.audioStates[index].isPlaying = true;
            this.currentlyPlaying = index;
          })
          .catch(error => {
            console.error('Error playing audio:', error);
          });
      }
    }
  }

  // Update progress bar
  updateProgress(event: Event, index: number): void {
    const audioElement = event.target as HTMLAudioElement;
    if (audioElement) {
      this.audioStates[index].currentTime = audioElement.currentTime;
      this.audioStates[index].progress = (audioElement.currentTime / audioElement.duration) * 100;
    }
  }

  getRecipientCount(data: any): number {
    if (!data) return 0;

    if (this.selectedTemplateType === 'whatsapp' || this.selectedTemplateType === 'email') {
      return data.profileid?.length || 0;
    } else {
      return data.userid?.length || 0;
    }
  }

  // Format time in MM:SS format
  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '00:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Handle audio ended event
  audioEnded(index: number): void {
    this.audioStates[index].isPlaying = false;
    this.audioStates[index].progress = 0;
    this.audioStates[index].currentTime = 0;
    this.currentlyPlaying = -1;
  }

  // Handle audio paused event
  audioPaused(index: number): void {
    this.audioStates[index].isPlaying = false;
  }

  // Handle audio played event
  audioPlayed(index: number): void {
    this.audioStates[index].isPlaying = true;
  }

  // Toggle mute
  toggleMute(audioElement: HTMLAudioElement, index: number): void {
    if (audioElement) {
      audioElement.muted = !audioElement.muted;
      this.audioStates[index].isMuted = audioElement.muted;
    }
  }

  // Change playback speed
  changePlaybackSpeed(event: Event, audioElement: HTMLAudioElement, index: number): void {
    const target = event.target as HTMLSelectElement;
    if (audioElement && target) {
      audioElement.playbackRate = parseFloat(target.value);
    }
  }

  // Close audio player
  closeAudio(index: number): void {
    const audioElement = this.getAudioElement(index);
    if (audioElement) {
      audioElement.pause();
    }

    this.audioStates[index].isPlaying = false;
    this.audioStates[index].isActive = false;
    this.audioStates[index].progress = 0;
    this.audioStates[index].currentTime = 0;

    if (this.currentlyPlaying === index) {
      this.currentlyPlaying = -1;
    }
  }

  // Close all audio players
  closeAllAudio(): void {
    this.audioStates.forEach((state, idx) => {
      if (state.isActive) {
        this.closeAudio(idx);
      }
    });
  }

  // Allow user to click on progress bar to seek
  seekAudio(event: MouseEvent, audioElement: HTMLAudioElement, index: number): void {
    if (!audioElement) return;

    const progressBar = event.currentTarget as HTMLElement;
    const rect = progressBar.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const percentage = offsetX / rect.width;

    audioElement.currentTime = audioElement.duration * percentage;
    this.audioStates[index].progress = percentage * 100;
  }

  toggleFilter(filterType: string, value: string) {
    const currentValues = this.myOperatorForm.get(filterType).value || [];
    const index = currentValues.indexOf(value);

    if (index === -1) {
      // Add to selected values
      this.myOperatorForm.get(filterType).setValue([...currentValues, value]);
    } else {
      // Remove from selected values
      const updatedValues = [...currentValues];
      updatedValues.splice(index, 1);
      this.myOperatorForm.get(filterType).setValue(updatedValues);
    }

    this.myoperatorfilter(this.myOperatorForm.value);
  }

  switchTab(event: Event, tabIndex: number) {
    const tabElement = event.currentTarget as HTMLElement;
    const tabsContainer = tabElement.parentElement as HTMLElement;
    const contentContainer = tabsContainer.parentElement as HTMLElement;

    // Update active tab
    const tabs = tabsContainer.querySelectorAll('.tab-item');
    tabs.forEach(tab => tab.classList.remove('active'));
    tabElement.classList.add('active');

    // Update tab content
    const tabContents = contentContainer.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    tabContents[tabIndex].classList.add('active');

    // Move indicator
    const indicator = tabsContainer.querySelector('.tab-indicator') as HTMLElement;
    if (indicator) {
      indicator.style.width = `${tabElement.offsetWidth}px`;
      indicator.style.left = `${tabElement.offsetLeft}px`;
    }
  }

  toggleTemplatesMenu(): void {
    this.templatesExpanded = !this.templatesExpanded;
  }

  toggleSidenav(): void {
    this.sidenav.toggle();
  }

  formfilter(value) {
    this.templatesArray = this.tempTemplateArray.filter((e) => {
      const dateArray = e.date;
      const endDate = new Date(value.enddate);
      endDate.setHours(23, 59, 59, 999);

      if (((e.templatename?.toLowerCase().trim().replace(/\s/g, "").indexOf(value.templateName != '' ? value.templateName?.toLowerCase().trim().replace(/\s/g, "") : '') > -1))
        && (![null, undefined, ""].includes(value.templateType) ? value.templateType.includes(e.type) : true)
        && (![null, undefined, ""].includes(value.templateCategory) ? value.templateCategory.includes(e.category) : true)
        && (![null, undefined, ""].includes(value.templateSubCategory) ? value.templateSubCategory.includes(e.subcateogry) : true)
        && ((![null, undefined, ""].includes(value.startdate) ? (dateArray?.toDate() >= new Date(value.startdate)) : true)
          && (![null, undefined, ""].includes(value.enddate) ? (dateArray?.toDate() <= endDate) : true))) {
        return e;
      }
    });

    this.separateTemplates();
    this.updateTemplateCounts();
  }

  myoperatorfilter(value) {
    this.logDisplayData = this.tempMyOperatorCalls.filter((e) => {
      if ((e.calledto.indexOf(value.search != '' ? value.search : '') > -1)
        && (value.calledby.length != 0 ? value.calledby.some(item => this.mapMyOperator[e.calledby]?.name?.toLowerCase()?.includes(item?.toLowerCase())) : true)
        && (value.calledto.length != 0 ? value.calledto.some(item => this.mapNumber[e.calledto]?.name?.toLowerCase()?.includes(item?.toLowerCase())) : true)
        && (value.callstatus.length != 0 ? value.callstatus.some(item => e.callstatus?.toLowerCase()?.includes(item?.toLowerCase())) : true)
        && (value.status.length != 0 ? value.status.some(item => e.status?.toLowerCase()?.includes(item?.toLowerCase())) : true)) {
        return e;
      }
    });
    this.updatePaginatedData();
  }

  async filter(startdate, enddate) {
    
    this.loading = true;
    startdate = new Date(new Date(startdate).setHours(0, 0, 0, 0));
    enddate = new Date(new Date(enddate).setHours(23, 59, 59, 59));
    
    this.dateform.patchValue({
      start: startdate,
      end: enddate
    });

    this.selectedLogTemplate = {};
    this.logDisplayData = [];
    this.templogDisplayData = [];
    this.emailDisplayData = {
      "Sent": 0,
      "Delivered": 0,
      "Opened": 0,
      "Clicked": 0,
      "Bounce": 0,
      "All": 0
    }
    this.selectedLogProfiles = [];
    this.selectedTemplateType = "";
    this.emailTemplatesArray = [];
    this.myOperatorCalls = [];
    this.tempMyOperatorCalls = [];
    this.watiMessages = [];
    this.tempWatiMessages = [];
    this.selectedlogtype = "";

    await getDocs(query(this.emailarchiveCollection,where("date",">=", new Date(startdate)),where("date","<=", new Date(enddate)),orderBy("date","desc"))).then((email)=>{
      if(email.docs.length != 0) {
        this.components.find((e)=>e['name'] == "email")['count'] = email.docs.length;  

        for (let i = 0; i < email.docs.length; i++) {
          const element = email.docs[i].data();
          element['profileid'] = [null,undefined].includes(element['profileid']) ? [] : element['profileid'];
          this.emailTemplatesArray.push(element);
        }
      } else {
        console.log("No Email Data Found");
      }
    });

    getDocs(query(this.myoperatorcallsCollection,where("time",">=", new Date(startdate)),where("time","<=", new Date(enddate)),orderBy("time","desc"))).then((calls)=>{
      if(calls.docs.length != 0) {
        this.components.find((e)=>e['name'] == "calls")['count'] = calls.docs.length;  

        for (let i = 0; i < calls.docs.length; i++) {
          const element = calls.docs[i].data();
          this.audioStates[i] = {
            isPlaying: false,
            isActive: false,
            isMuted: false,
            progress: 0,
            currentTime: 0,
            duration: 0
          };
          this.myOperatorCalls.push(element);
          this.tempMyOperatorCalls.push(element);
        }
      } else {
        console.log("No Calls Data Found");
      }
    });

    getDocs(query(this.watiarchiveCollection,where("date",">=", new Date(startdate)),where("date","<=", new Date(enddate)),orderBy("date","desc"))).then((wati)=>{
      if(wati.docs.length != 0) {
        this.components.find((e)=>e['name'] == "whatsapp")['count'] = wati.docs.length;
        for (let i = 0; i < wati.docs.length; i++) {
          const element = wati.docs[i].data();
          this.watiMessages.push(element);
          this.tempWatiMessages.push(element);
        }
      } else {
        console.log("No Wati Data Found");
      }
    });

    getDocs(query(this.notificationrecordCollection,where("date",">=", new Date(startdate)),where("date","<=", new Date(enddate)),orderBy("date","desc"))).then((notifications)=>{
      if(notifications.docs.length != 0){
        for (let i = 0; i < notifications.docs.length; i++) {
          const notificationData = notifications.docs[i].data();
          if(!notificationData['sticky']) {
            this.notificationList.push(notificationData);
            this.tempnotificationList.push(notificationData);
            this.components.find((e)=>e['name'] == "notifications")['count'] = this.components.find((e)=>e['name'] == "notifications")['count'] + 1
          } else {
            this.inappmessageList.push(notificationData);
            this.tempInappMessageList.push(notificationData);
            this.components.find((e)=>e['name'] == "inappmessage")['count'] = this.components.find((e)=>e['name'] == "inappmessage")['count'] + 1;
          }
        }
      }else{
        console.log("No Notifications Found");
      }
    }).then(()=>{
      setTimeout(() => {
        this.loading = false;
      }, 1000);
    });
  }

  fetchHistory(data) {
    this.emailDisplayData = {
      "Sent": 0,
      "Delivered": 0,
      "Opened": 0,
      "Clicked": 0,
      "Bounce": 0,
      "All": 0
    }
    this.logDisplayData = [];
    this.templogDisplayData = [];
    this.selectedTemplateType = data.name;
    this.selectedLogTemplate = {};
    this.selectedLogProfiles = [];
    this.selectedlogtype = "";

    if (data.name == 'email') {
      this.logDisplayData = this.emailTemplatesArray;
      this.templogDisplayData = this.emailTemplatesArray;
    }

    if (data.name == 'calls') {
      this.logDisplayData = this.tempMyOperatorCalls;
      this.templogDisplayData = this.tempMyOperatorCalls;
    }

    if (data.name == 'whatsapp') {
      this.logDisplayData = this.tempWatiMessages;
      this.templogDisplayData = this.tempWatiMessages;
    }

    if (data.name == 'notifications') {
      this.logDisplayData = this.tempnotificationList;
      this.templogDisplayData = this.tempnotificationList;
    }

    if (data.name == 'inappmessage') {
      this.logDisplayData = this.tempInappMessageList;
      this.templogDisplayData = this.tempInappMessageList;
    }

    this.updatePaginatedData();
  }

  fetchLogProfiles(type) {
    let msgstatus;
    this.selectedLogProfiles = [];
    this.selectedlogtype = type;

    if (type == 'Sent') {
      msgstatus = 'sent'
    } else if (type == 'Delivered') {
      msgstatus = 'Delivery'
    } else if (type == 'Opened') {
      msgstatus = 'Open'
    } else if (type == 'Clicked') {
      msgstatus = 'Click'
    } else if (type == 'Bounce') {
      msgstatus = 'Bounce'
    } else if (type == 'All') {
      this.selectedLogProfiles.push(...[null, undefined, ""].includes(this.selectedLogTemplate['profileid']) ? [] : this.selectedLogTemplate['profileid']);
    }

    // this.firestore.collection('email logs', ref => ref.where("emailarchiveid","==",this.selectedLogTemplate['docid']).where("msgstatus","==",msgstatus)).get().toPromise()
    getDocs(query(collection(this.firestore, 'email log'),where("emailarchiveid","==",this.selectedLogTemplate['docid']),where("msgstatus","==",msgstatus))).then((log)=>{
      if(log.docs.length != 0) {
        for (let i = 0; i < log.docs.length; i++) {
          const element = log.docs[i].data();
          this.selectedLogProfiles.push(element['profileid'])
        }
      }
    });
  }

  resetFilter() {
    this.filter(new Date(), new Date());
  }

  async createInAppTemplate(formValue) {
    const templateNameControl = this.templateForm.get('templateName');
    if (this.viewmode == 'edit') {
      templateNameControl.setErrors(null);
    } else {
      await getDocs(query(this.innapptemplatesCollection,where("templatename","==", formValue['templateName']))).then((template)=>{      
        if(template.docs.length != 0) {
          this.templateNameAvailable = true;
          templateNameControl.setErrors(
            this.templateNameAvailable ? { 'duplicateName': true } : null
          );
        } else {
          this.templateNameAvailable = false;
          templateNameControl.setErrors(
            this.templateNameAvailable ? { 'duplicateName': true } : null
          );
        }
      })
    }

    if (!this.templateNameAvailable) {
      let check = confirm(`Are you sure to ${this.viewmode} the template`);
      let docID;

      if (this.viewmode == 'edit') {
        docID = this.editDocID;
      } else {
        docID = doc(this.innapptemplatesCollection).id;
      }

      if (check) {
        let data = {
          active: false,
          docid : docID,
          date : serverTimestamp(),
          createdby : this.authguard.uid,
          templatealias : formValue['templateAlias'],
          templatelayout : "",
          templatename : formValue['templateName'],
          templatetype : this.templateType,
          category : formValue['templateCategory'],
          subcategory : formValue['templateSubCategory'],
          templatevalidated : false,
          templatestatus : this.viewmode == 'edit' ? "updated" : "created" , 
          type : "inappmessage",
          title: [null, undefined, ""].includes(this.bufferDoc['title']) ? "" : this.bufferDoc['title'],
          subtitle: [null, undefined, ""].includes(this.bufferDoc['subtitle']) ? "" : this.bufferDoc['subtitle'],
          message: [null, undefined, ""].includes(this.bufferDoc['message']) ? "" : this.bufferDoc['message'],
          sticky: true,
          notes: [null, undefined, ""].includes(this.bufferDoc['notes']) ? "" : this.bufferDoc['notes']
        }
        await setDoc(doc(this.innapptemplatesCollection, docID),data, {merge: true}).then(()=>{
          console.log("Done Creating In App Message");
          this.openSnackBar("In App Message Template Created", "OK");
          this.resetValues();
        }).catch((error)=>{
          console.log("Error Creating In App Message", error);
          this.openSnackBar("Error Creating In App Message", "OK");
        })
      }
    }
  }

  async sendNotification(formValue) {
    const templateNameControl = this.templateForm.get('templateName');
    if (this.viewmode == 'edit') {
      templateNameControl.setErrors(null);
    } else {
      // await this.firestore.collection('notification templates', ref => ref.where("templatename","==", formValue['templateName'])).get().toPromise()
      getDocs(query(this.notificationtemplatesCollection,where("templatename","==", formValue['templateName']))).then((template)=>{      
        if(template.docs.length != 0) {
          this.templateNameAvailable = true;
          templateNameControl.setErrors(
            this.templateNameAvailable ? { 'duplicateName': true } : null
          );
        } else {
          this.templateNameAvailable = false;
          templateNameControl.setErrors(
            this.templateNameAvailable ? { 'duplicateName': true } : null
          );
        }
      })
    }

    if (!this.templateNameAvailable) {
      let check = confirm(`Are you sure to ${this.viewmode} the template`);
      let docID;

      if (this.viewmode == 'edit') {
        docID = this.editDocID;
      } else {
        docID = doc(this.notificationtemplatesCollection).id;
      }

      if (check) {
        if (this.message.trim().length != 0) {

          var notificationImage = null
          if (this.notificationimage != null) {
            const filepath = "Notification Images/" + new Date().toISOString() + this.notificationimage.name;
            await this.storage.upload(filepath, this.notificationimage).then(async completed => {
              await completed.ref.getDownloadURL().then(url => {
                notificationImage = url
              }).catch(err => { console.log(err); })
            }).catch(err => { console.log(err); })
          }

          let data = {
            active: false,
            docid : docID,
            date : serverTimestamp(),
            createdby : this.authguard.uid,
            templatealias : formValue['templateAlias'],
            templatelayout : "",
            templatename : formValue['templateName'],
            templatetype : this.templateType,
            category : formValue['templateCategory'],
            subcategory : formValue['templateSubCategory'],
            templatevalidated : false,
            templatestatus : this.viewmode == 'edit' ? "updated" : "created" , 
            type : "notification",
            title: this.title.trim().length != 0 ? this.title.trim() : null,
            message: this.message.trim(),
            landingpage: (this.landingPage ?? "").trim().length != 0 ? this.landingPage.trim() : null,
            sticky: false,
            notificationimage: notificationImage
          }

          await setDoc(doc(this.notificationtemplatesCollection, docID),data, {merge: true}).then(()=>{
            console.log("Template added Successfully");
            this.resetValues();
            this.viewmode = 'create';
            this.openSnackBar("Notification Template Created", "OK");
          }).catch((error)=>{
              console.log("Oops Error while creating Template",error);
              this.openSnackBar("Error Creating Notification Template", "OK");
          });
        }
      }
    }

  }

  async createEMailTemplate(formValue) {
    const templateNameControl = this.templateForm.get('templateName');
    if (this.viewmode == 'edit') {
      templateNameControl.setErrors(null);
    } else {
      await getDocs(query(this.emailtemplatesCollection,where("templatename","==", formValue['templateName']))).then((template)=>{      
        if(template.docs.length != 0) {
          this.templateNameAvailable = true;
          templateNameControl.setErrors(
            this.templateNameAvailable ? { 'duplicateName': true } : null
          );
        } else {
          this.templateNameAvailable = false;
          templateNameControl.setErrors(
            this.templateNameAvailable ? { 'duplicateName': true } : null
          );
        }
      })
    }

    if (!this.templateNameAvailable) {
      var oParser = new DOMParser();
      var oDOM = oParser.parseFromString(this.htmlContent, "text/html");
      var textContent = oDOM.body.innerText;

      let check = confirm(`Are you sure to ${this.viewmode} the template`);
      let docID;

      if (this.viewmode == 'edit') {
        docID = this.editDocID;
      } else {
        docID = doc(this.emailtemplatesCollection).id;
      }
      if(check) {      
        let data = {
          active: false,
          docid : docID,
          date : serverTimestamp(),
          createdby : this.authguard.uid,
          textbody : textContent,
          templatealias : formValue['templateAlias'],
          htmlbody : this.htmlContent,
          templatelayout : "",
          templatename : formValue['templateName'],
          subject : this.templateSubject,
          templatetype : this.templateType,
          category : formValue['templateCategory'],
          subcategory : formValue['templateSubCategory'],
          templatevalidated : false,
          templatestatus : this.viewmode == 'edit' ? "updated" : "created" , 
          postmarkstatus : "pending", 
          notes : this.notes,
          type : "email"
        }

        await setDoc(doc(this.emailtemplatesCollection,docID), data, {merge: true}).then(()=>{
          console.log("Template added Successfully");
          this.resetValues();
          this.viewmode = 'create';
          this.templateForm.controls['templateName'].enable();
          this.templateForm.controls['templateAlias'].enable();
          this.openSnackBar("Email Template Created", "OK");
        }).catch((error)=>{
          console.log("Oops Error while creating Template",error);
          this.openSnackBar("Error Creating Email Template", "OK");
        });
      }
    }
  }

  updatePaginatedData() {
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedData = this.logDisplayData.slice(startIndex, endIndex);
  }

  onPageChange(event: PageEvent) {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updatePaginatedData();
  }

  updateLogDisplayData(newData: any[]) {
    this.logDisplayData = newData;
    if (this.paginator) {
      this.paginator.firstPage();
    }
    this.updatePaginatedData();
  }

  async toggleActive(template) {
    await updateDoc(doc(this.emailtemplatesCollection,template['docid']),{
      active: template['active']
    }).then(()=>{
      this.openSnackBar("Active Updated Successfully", "OK");
    }).catch((error)=>{
      this.openSnackBar("Error Updating Active", "OK");
    });
  }

  getTruncatedText(text: string, limit: number = 300): string {
    if (!text) return '';
    return text.length > limit ? text.slice(0, limit) + '...' : text;
  }

  async addCategory() {
    await setDoc(this.emailcategoryDocumentRef,{
      categories : arrayUnion(this.searchCategory),
    },{merge:true}).then(()=>{
      console.log("Category Added Successfully");
      this.templateForm.controls['templateCategory'].setValue(this.searchCategory);
      this.searchCategory = "";
    }).catch((error)=>{
      console.log("Oops Error While Adding Category",error);
    });
  }


  async addSubCategory() {
    await setDoc(this.emailcategoryDocumentRef,{
      subcategories : arrayUnion(this.searchSubCategory)
    },{merge:true}).then(()=>{
      console.log("Category Added Successfully");
      this.templateForm.controls['templateSubCategory'].setValue(this.searchSubCategory);
      this.searchSubCategory = "";
    }).catch((error)=>{
      console.log("Oops Error While Adding Category",error);
    });
  }

  onSearchCategory() {
    let returnData = this.templateCategories;
    if (![null, undefined, ""].includes(this.searchCategory)) {
      return returnData.filter((e) => e.includes(this.searchCategory));
    } else {
      return this.templateCategories;
    }
  }

  onSearchCalledBy(): any {
    return Object.values(this.mapMyOperator).filter((e) => e['name']?.toLowerCase().includes(this.filteredCalledBy?.toLowerCase()));
  }

  onSearchCalledTo(): any {
    return Object.values(this.mapProfiles).filter(e => e['name']?.toLowerCase().includes(this.filteredCalledTo?.toLowerCase()));
  }

  onSearchSubCategory() {
    let returnData = this.templateSubCategories;
    if (![null, undefined, ""].includes(this.searchSubCategory)) {
      return returnData.filter((e) => e.includes(this.searchSubCategory));
    } else {
      return this.templateSubCategories;
    }
  }

  searchBroadcast(value) {
    let filterValue = value.target.value;
    this.logDisplayData = this.templogDisplayData.filter((e) => {
      if (![null, undefined].includes(e.broadcastname) ? e.broadcastname?.toLowerCase().includes(filterValue.trim().toLowerCase()) : true) {
        return e;
      }
    });
    this.updatePaginatedData();
  }

  returnParticipants() {
    let x;

    if (['notifications', 'inappmessage'].includes(this.selectedTemplateType)) {
      x = this.selectedLogProfiles.filter((e) => {
        if ((![null, undefined].includes(e) ? this.mapProfileUid[e]['name']?.toLowerCase().includes(this.searchParticipants.trim().toLowerCase()) : true)
          || (![null, undefined].includes(e) ? this.mapProfileUid[e]['email']?.toLowerCase().includes(this.searchParticipants.trim().toLowerCase()) : true)) {
          return e;
        }
      })
    } else {
      x = this.selectedLogProfiles.filter((e) => {
        if ((![null, undefined].includes(e) ? this.mapProfiles[e]['name']?.toLowerCase().includes(this.searchParticipants.trim().toLowerCase()) : true)
          || (![null, undefined].includes(e) ? this.mapProfiles[e]['email']?.toLowerCase().includes(this.searchParticipants.trim().toLowerCase()) : true)) {
          return e;
        }
      })
    }

    return x;
  }

  applyFilter(filterValue) {
    if (this.view == 'template') {
      this.tableData.filter = filterValue.trim().toLowerCase();
    } else if (['validators', 'email'].includes(this.view)) {
      this.profileData.filter = filterValue.trim().toLowerCase();
    }
  }

  async fetchTemplates() {
    // Create observables for each collection
    const emailTemplates$ = collectionData(query(this.emailtemplatesCollection,orderBy("date", "desc"))).pipe(map(templates => {
      if (templates.length === 0) {
        console.log("Email Templates Not Found");
        return [];
      }

      const emailArray = templates.map(templatedata => {
        this.mapEMailTemplates[templatedata['templatealias']] = templatedata;
        return templatedata;
      });
      // this.templatesCount.find(e => e['name'] === "email")['count'] = templates.length;
      return emailArray;
    }));

    const watiTemplates$ = collectionData(query(this.watitemplatesCollection,orderBy("date", "desc"))).pipe(map(templates => {
      if (templates.length === 0) {
        console.log("Wati Templates Not Found");
        return [];
      }

      const watiArray = templates.map(templatedata => templatedata);
      this.templateData.data = watiArray;
      this.tempTemplates = watiArray;
      this.templateData.sort = this.matsort;
      this.templateData.paginator = this.paginator;
      // this.templatesCount.find(e => e['name'] === "whatsapp")['count'] = templates.length;
      return watiArray;
    }));

     const notificationTemplates$ = collectionData(query(this.notificationtemplatesCollection,orderBy("date", "desc"))).pipe(map(templates => {
        if (templates.length === 0) {
          console.log("Notification Templates Not Found");
          return [];
        }

        const notificationArray = templates.map(templatedata => templatedata);
        // this.templatesCount.find(e => e['name'] === "notification")['count'] = templates.length;
        return notificationArray;
      })
    );

    const inappTemplates$ = collectionData(query(this.innapptemplatesCollection,orderBy("date", "desc"))).pipe(map(templates => {
        if (templates.length === 0) {
          console.log("Inapp Templates Not Found");
          return [];
        }

        const inappArray = templates.map(templatedata => templatedata);
        // this.templatesCount.find(e => e['name'] === "inappmessage")['count'] = templates.length;
        return inappArray;
      })
    );

    // Combine all observables to handle real-time updates
    combineLatest([
      emailTemplates$,
      watiTemplates$,
      notificationTemplates$,
      inappTemplates$
    ]).subscribe({
      next: ([emailArray, watiArray, notificationArray, inappArray]) => {
        this.templatesArray = [...emailArray, ...watiArray, ...notificationArray, ...inappArray];
        this.tempTemplateArray = [...this.templatesArray];
        this.separateTemplates();

        this.updateTemplateCounts();
      },
      error: (error) => {
        console.error('Error fetching templates:', error);
      }
    });
  }

  async fetchProfiles() {
    getDocs(collection(this.firestore, 'profile_data')).then((profile)=>{
      let tempArray = [];
      if(profile.docs.length != 0) {
        for (let i = 0; i < profile.docs.length; i++) {
          const profiledata = profile.docs[i].data();
          this.mapProfiles[profiledata['profileid']] = profiledata;
          tempArray.push(profiledata);
        }
        this.profileData = tempArray;
        this.tempProfileData = tempArray;

      } else {
        console.log("No Data Found");
      }
    })

    getDoc(this.emailvalidatorsDocumentRef).then(async (snap) => {
      if (snap.exists) {
        this.validators = snap.data()["profilelist"] || [];
        this.selectedRows = snap.data()["profilelist"];
      } else {
        console.log("No Validators");
      }
    });
  }

  closeTemplate() {
    this.displayTemplate = false;
    this.selectedTemplate = {};
  }

  viewTemplate(row) {
    this.selectedTemplate = row;
    let dialogRef = this.dialog.open(ViewTemplateDialogComponent, {
      data: this.selectedTemplate,
      width: "60vw",
    });

    dialogRef.afterClosed().toPromise().then((result) => {
      if (result != null && result != undefined) {
        let collectionname = "";

        if (this.selectedTemplate['type'] == 'email') {
          collectionname = "email templates"
        }

        if (this.selectedTemplate['type'] == 'whatsapp') {
          collectionname = "wati templates"
        }

        if (this.selectedTemplate['type'] == 'notification') {
          collectionname = "notification templates"
        }

        if (this.selectedTemplate['type'] == 'inappmessage') {
          collectionname = "inapp templates"
        }

        if (![null, undefined, ""].includes(collectionname)) {
          updateDoc(doc(collection(this.firestore, collectionname), result['template']['docid']), {
            templatestatus: "created",
            templatevalidated: true,
          }).then(() => {
            console.log("TEMPLATE APPROVED SUCCESSFULLY");
          }).catch(err => {
            console.log("ERROR WHILE APPROVING TEMPLATE", err);
          });
        }
      }
    });
  }

  toggleRowSelection(row, isChecked: boolean) {
    if (isChecked) {
      this.selectedRows.push(row.profileid);
    } else {
      this.selectedRows = this.selectedRows.filter((e) => e != row.profileid);
    }
  }

  isRowSelected(row: any): boolean {
    if (this.selectedRows.includes(row.profileid)) {
      return true;
    } else {
      return false
    }
  }

  // toggleSelectAll(isChecked: boolean) {
  //   this.selectedRows = [];    
  //   if (isChecked) {
  //     this.profileData.data.forEach((data) => this.selectedRows.push(data.profileid));
  //   }
  // }

  // isAllSelected() {
  //   return this.selectedRows.length === this.profileData.data.length;
  // }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }

  updateEmailValidator() {
    setDoc(doc(collection(this.firestore, "email validators"), "validators"), {
      profilelist: this.selectedRows
    }, { merge: true }).then(() => {
      this.openSnackBar("Updated EMail Validators", "OK");
      // this.selectedRows = [];
    }).catch((err) => {
      console.log(err);
    })
  }

  modifyTemplate(template, type) {

    let x = confirm(`Are you sure to ${type} ${template['templatename']} template`);

    if (x) {
      if (template['type'] == 'email') {
        this.templateForm.patchValue({
          templateName: type == 'edit' ? template['templatename'] : '',
          templateAlias: type == 'edit' ? template['templatealias'] : '',
          templateCategory: template['category'],
          templateSubCategory: template['subcategory']
        });
        this.templateSubject = template['subject'];
        this.htmlContent = template['htmlbody'];
        this.notes = template['notes'];
        this.sanitizedHtmlContent = this.sanitizer.bypassSecurityTrustHtml(template['htmlbody']);
        this.view = 'createemail';
      } else if (template['type'] == 'inappmessage') {
        this.templateForm.patchValue({
          templateName: type == 'edit' ? template['templatename'] : '',
          templateAlias: type == 'edit' ? template['templatealias'] : '',
          templateCategory: template['category'],
          templateSubCategory: template['subcategory']
        });

        this.bufferDoc = {
          profileid: [],
          createdby: null,
          date: new Date(),
          status: 'created',
          title: template['title'],
          subtitle: template['subtitle'],
          message: template['message'],
          notes: template['notes']
        }
        this.view = 'createinappmessage';
      } else if (template['type'] == 'notification') {
        this.view = 'createnotification';
      }

      this.viewmode = type == 'duplicate' ? 'duplicate' : 'edit';
      if (type == 'edit') {
        this.editDocID = template['docid'];
      }
    }
  }

  patchEmailValidator() {
    this.validators.forEach((profile) => {
      console.log("profile", profile);
      console.log("data", this.mapProfileData[profile]);


      // if (!this.selectedRows.includes(profile)) {
      // this.selectedRows.push(this.mapProfileData[profile]);
      // }
    });
  }

  statusUpdate(action, row) {
    let x = confirm(`Are You Sure To ${action}`);
    if (x) {
      updateDoc(doc(collection(this.firestore, "email templates"), row['docid']), {
        templatevalidated: true,
        templatestatus: "created"
      }).then(() => {
        console.log("Status Updated Successfully");
      }).catch((error) => {
        console.log("Error Updating Status", error);
      })
    }
  }

  sendEmailToSelectedParicipant() {
    let docRef = doc(collection(this.firestore, 'email archive'));
    let result = {
      profileid: this.selectedRows,
      createdby: this.authguard.uid,
      date: new Date(),
      status: 'created',
      subject: this.selectedTemplate['subject'],
      body: this.selectedTemplate['htmlbody'],
      templateid: this.selectedTemplate['templatename'],
      notes: this.selectedTemplate['notes'] ?? ""
    }
    result['docid'] = docRef.id;

    // this.firestore.collection("email validators").doc("validators").get().toPromise()
    getDoc(doc(collection(this.firestore, 'email validators'), 'validators')).then(async (validatorsnap) => {
      if (validatorsnap.exists) {
        result['emailvalidators'] = validatorsnap.data()['profilelist']
      } else {
        result['emailvalidators'] = this.authguard.uid
      }
    });

    setDoc(docRef, result).then(() => {
      console.log("message to participants email created to send test user");
      this.openSnackBar("EMail Sent Successfully", "OK");
      this.selectedRows = [];
      this.selectedTemplate = {};
      this.emailHtml = "";
      this.sendEmailTemplate = false;
    }).catch(err => {
      console.log(err);
    });
  }

  async sendWatiMessage(selectedTemplate) {
    const check = confirm("Are you sure want to send this Template in WATI");

    if (check) {

      console.log('Sending in Wati');
      let participants = []
      for (let i = 0; i < participants.length; i++) {
        const element = participants[i];

        let countrycode = (![null, undefined].includes(this.mapProfileData[element['profile_id']]['countrycode']) ? this.mapProfileData[element['profile_id']]['countrycode'] : '+91').replace(/\+/g, "");
        let waticontent = {
          phonenumber: `${countrycode}${this.mapProfileData[element['profile_id']]['number']}`,
          body: {
            parameters: [
              { name: 'name', value: element['name'] },
            ],
            broadcast_name: selectedTemplate,
            template_name: selectedTemplate,
          }
        }

        // this.watiService.sendTemplateMessage(waticontent.body, waticontent.phonenumber).subscribe((response) => {
        //   console.log('Template Message Sent successfully:', response);
        //   if (participants.length == i) {
        //     alert("Template Message Sent Fully")
        //   }
        // }, (error) => {
        //   console.error('Error creating template:', error);
        // });
      }
    }
  }

  createBroadcastTemplate() {
    if (window.location.port.includes('4200')) {
      window.open('http://localhost:4200/create-broadcast-template', '_blank')
    } else if (environment.firebase.projectId == 'test-environment-841c3') {
      window.open('https://star-labs-test.web.app/create-broadcast-template', '_blank')
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open('https://breakthroughs.app/create-broadcast-template', '_blank')
    }
  }

  // Handle image upload locally
  handleImageUpload(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const imageDataUrl = reader.result as string;
        resolve(imageDataUrl);
      };

      reader.onerror = () => reject('Error reading file');
      reader.readAsDataURL(file);
    });
  }

  resetValues() {
    this.templateForm.controls['templateName'].setValue("");
    this.templateForm.controls['templateAlias'].setValue("");
    this.templateForm.controls['templateCategory'].setValue("");
    this.templateForm.controls['templateSubCategory'].setValue("");

    this.templateFilterForm.controls['templateType'].setValue("");
    this.templateFilterForm.controls['templateName'].setValue("");
    this.templateFilterForm.controls['templateCategory'].setValue("");
    this.templateFilterForm.controls['templateSubCategory'].setValue("");
    this.templateFilterForm.controls['startdate'].setValue("");
    this.templateFilterForm.controls['enddate'].setValue("");

    this.templateSubject = "";
    this.templateType = "";
    this.sanitizedHtmlContent = "";
    this.htmlContent = "";
    this.notes = "";
    this.searchprofile = "";
    this.editDocID = "";
    this.message = "";
    this.sticky = false;
    this.landingPage = "";
    this.notificationimage = null;
    this.title = "";
    this.templatesArray = this.tempTemplateArray;

    this.bufferDoc = {
      profileid: [],
      createdby: null,
      date: new Date(),
      status: 'created',
      title: null,
      subtitle: null,
      message: null,
      notes: null
    }

    this.separateTemplates();
    this.updateTemplateCounts();
  }

  onContentChange() {
    console.log(this.htmlContent);
    
    this.sanitizedHtmlContent = this.sanitizer.bypassSecurityTrustHtml(this.htmlContent);
    console.log(this.sanitizedHtmlContent);
    
    this.cdr.markForCheck();
    this.cdr.detectChanges();

  }

  sanitizeHTML(html) {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  onParticipantSelect(profile) {
    this.selectedRows.push(profile)
    this.profileData = this.tempProfileData.filter(e => !this.selectedRows.includes(e['profileid']));

    this.updateEmailValidator();
  }

  onParticipantSearch(event: any) {
    let value = ![null, undefined, ""].includes(event.target.value) ? event.target.value.trim().toLowerCase() : "";
    this.profileData = this.tempProfileData.filter((e) => this.mapProfiles[e['profileid']]['name']?.toLowerCase().indexOf(value) === 0)
  }

  onParticipantRemove(index) {
    this.selectedRows.splice(index, 1)
    this.profileData = this.tempProfileData.filter(e => !this.selectedRows.includes(e['profileid']));
    this.updateEmailValidator();
  }

  isObjectEmpty(object) {
    return Object.keys(object).length != 0;
  }

  assignData(data) {
    this.selectedLogTemplate = data;
    this.emailDisplayData = {
      "Sent": 0,
      "Delivered": 0,
      "Opened": 0,
      "Clicked": 0,
      "Bounce": 0,
      "All": 0
    }
    this.selectedLogProfiles = [];
    if (['notifications', 'inappmessage'].includes(this.selectedTemplateType)) {
      this.selectedLogProfiles.push(...[null, undefined, ""].includes(this.selectedLogTemplate['userid']) ? [] : this.selectedLogTemplate['userid']);

    } else if (['email', 'whatsapp'].includes(this.selectedTemplateType)) {

      if (this.selectedTemplateType == 'email') {
        this.selectedlogtype = 'All';
        this.emailDisplayData['All'] = ([null, undefined, ""].includes(this.selectedLogTemplate['profileid']) ? 0 : this.selectedLogTemplate['profileid'].length);
        this.selectedLogProfiles.push(...[null, undefined, ""].includes(this.selectedLogTemplate['profileid']) ? [] : this.selectedLogTemplate['profileid']);

        getDocs(query(collection(this.firestore, 'email logs'), where("emailarchiveid", "==", this.selectedLogTemplate['docid']))).then((log) => {
          if (log.docs.length != 0) {
            for (let i = 0; i < log.docs.length; i++) {
              const element = log.docs[i].data();
              if (element['msgstatus'].toLowerCase() == 'sent') {
                this.emailDisplayData['Sent']++;
              } else if (element['msgstatus'].toLowerCase() == 'delivery') {
                this.emailDisplayData['Delivered']++;
              } else if (element['msgstatus'].toLowerCase() == 'click') {
                this.emailDisplayData['Clicked']++;
              } else if (element['msgstatus'].toLowerCase() == 'bounce') {
                this.emailDisplayData['Bouce']++;
              } else if (element['msgstatus'].toLowerCase() == 'open') {
                this.emailDisplayData['Opened']++;
              }
            }
          }
        });
      } else {
        this.selectedLogProfiles.push(...[null, undefined, ""].includes(this.selectedLogTemplate['profileid']) ? [] : this.selectedLogTemplate['profileid']);
      }
    }
  }

  fetchNotificationData(data) {
    this.selectedLogTemplate = data;
  }

  validateButton() {
    return this.buttonName == "" || this.buttonSize == "" || this.buttonAlign == "" || this.buttonLink == "" ? true : false;
  }

  insertButton(buttonName, buttonSize, buttonLink, buttonAlign) {
    const sizeStyles = {
      small: 'padding: 5px 10px; font-size: 12px;',
      medium: 'padding: 10px 20px; font-size: 16px;',
      large: 'padding: 15px 30px; font-size: 20px;'
    };

    const alignStyles = {
      left: 'text-align: left;',
      center: 'text-align: center;',
      right: 'text-align: right;'
    };

    const buttonStyle = sizeStyles[buttonSize] || sizeStyles['medium'];
    const alignStyle = alignStyles[buttonAlign] || alignStyles['center'];
    const link = this.buttonLink ? `onclick=\"window.open('${buttonLink}', '_blank')\"` : '';
    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);

    const buttonHtml = `<br><div style="${alignStyle}"><button style="background-color: green; color: white; border-radius: 10px; ${buttonStyle}" ${link}>${buttonName || ""}</button><br><br></div>`;

    if (range) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = buttonHtml;
      const fragment = document.createDocumentFragment();
      let node;
      while ((node = tempDiv.firstChild)) {
        fragment.appendChild(node);
      }
      range.deleteContents();
      range.insertNode(fragment);
    } else {
      this.htmlContent += buttonHtml;
    }

    this.buttonName = "";
    this.buttonSize = "";
    this.buttonAlign = "";
    this.buttonLink = "";
    this.hideAddButton = true;
    this.onContentChange();
  }

  importImages(imported) {
    var selectedImage = imported.target.files[0]
    if (selectedImage.size < 1000000) {
      if (selectedImage) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.notificationimage = e.target.result;
        };
        reader.readAsDataURL(selectedImage);
      }
    }
    else {
      this.notificationimage = null
      alert("Image must be less than 1 MB")
    }
  }

  onEditorClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (target.tagName === 'IMG') {
      this.selectedImage = target;
      this.selectedImageWidth = parseInt(target.style.width || '100', 10);
      this.selectedImageHeight = parseInt(target.style.height || '100', 10);
    } else {
      this.selectedImage = null;
    }
  }

  resizeImage(value) {
    if (this.selectedImage) {
      this.selectedImage.style.width = `${this.selectedImageWidth}px`;
      this.selectedImage.style.height = `${this.selectedImageHeight}px`;
    }
  }

  setSize(view: 'mobile' | 'web') {
    const contentContainer = document.getElementById('contentContainer');
    if (contentContainer) {
      if (view === 'mobile') {
        contentContainer.style.fontSize = '14px';
        contentContainer.style.padding = '10px';
        contentContainer.style.width = '412px';
        contentContainer.style.height = '80vh';

      } else if (view === 'web') {
        contentContainer.style.fontSize = '18px';
        contentContainer.style.padding = '20px';
        contentContainer.style.width = '100%';
        contentContainer.style.overflow = 'auto';
        contentContainer.style.height = '80vh';
      }
    }

    this.previewMode = view;
  }

  async fetchMyOperatorUsers() {

    this.myoperator.fetchUsers().subscribe(
      (data) => {
        console.log("Data", data);
        // this.users = data;
      },
      (error) => {
        console.error('Error fetching users:', error);
      }
    );

  }

  openDialog(): void {
    const dialogRef = this.dialog.open(ReleaselogdialogComponent, {
      width: '100%',
      height:'85%',
      data: {
        currentUrl: this.router.url,
        currentComponent: this.router.url.split('/').pop() || ''
      }
    });
  }
}
