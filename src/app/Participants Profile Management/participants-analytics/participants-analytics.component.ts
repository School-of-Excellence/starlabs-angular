import { SelectionModel } from '@angular/cdk/collections';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { Firestore, collection, doc, getDocs, query, collectionData, orderBy, updateDoc, DocumentReference, deleteDoc, getDoc, where, writeBatch, serverTimestamp, setDoc, DocumentSnapshot, onSnapshot, limit, startAfter, Timestamp } from '@angular/fire/firestore';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { ExcludeFilterStringPipe, MessagePipe } from '../../custompipe.pipe';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { AuthguardService } from '../../authguard.service';
import { runInInjectionContext, Injector } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { FormArray, FormBuilder, FormGroup, FormsModule, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { AddRemarksComponent } from './add-remarks/add-remarks.component';
import { RemarkDialogComponent } from './remark-dialog/remark-dialog.component';
import { MapRecommendedplaylistToparticipantComponentComponent } from './map-recommendedplaylist-toparticipant.component/map-recommendedplaylist-toparticipant.component.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EmailInputComponent } from './email-input/email-input.component';
import { WatiInputComponent } from './wati-input/wati-input.component';
import { SubscriptionDialogComponent } from './subscription-dialog/subscription-dialog.component';
import { AhNotificationComponent } from './ah-notification/ah-notification.component';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { BroadcastComponent } from './broadcast/broadcast.component';
import { DataTransferService } from './data-transfer.service';
import { SendInterimReportComponent } from './send-interim-report/send-interim-report.component';
import { EvolutionWishlistLogComponent } from './evolution-wishlist-log/evolution-wishlist-log.component';
import * as XLSX from 'xlsx';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatBadgeModule } from '@angular/material/badge';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment.development';
import { ParticipantsChecklistsComponent } from './participants-checklists/participants-checklists.component';
import { BulkAddProductsComponent } from './bulk-add-products/bulk-add-products.component';
import { TagParticipantsComponent } from './tag-participants/tag-participants.component';
import { CreateParticipantlistDialogComponent } from './create-participantlist-dialog/create-participantlist-dialog.component';
import { ManageParticipantlistDialogComponent } from './manage-participantlist-dialog/manage-participantlist-dialog.component';
import { CreateSegmentsDialogComponent } from './create-segments-dialog/create-segments-dialog.component';
import { ExportWithFiltersComponent } from './export-with-filters/export-with-filters.component';
import { SendmessagesComponent } from '../../New-Workshop/workshop-dashboard/sendmessages/sendmessages.component';
import { WatiConfigDialogComponent } from './wati-config-dialog/wati-config-dialog.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AddPendingActionComponent } from '../../AppEngagement/app-action-pending/add-pending-action/add-pending-action.component';
import { WhatsAppProgressData, WhatsappProgressDialogComponent } from '../../New-Workshop/whatsapp-progress-dialog.component';

export class formelement {
  activejourney: Array<string[]> | null;
  lastcompletedjourney: Array<string[]> | null;
  activeproduct: Array<string[]> | null;
  subscriptionend: Object;
  consumedproducts: Array<string[]> | null;
  unconsumedproducts: Array<string[]> | null;
  purchase: Array<string[]> | null;
  purchasedate: Object;
  addons: Array<string[]> | null;
  gifts: Array<string[]> | null;
  bonus: Array<string[]> | null;
  atccount: Number | null
  customersupport: String | null;
  searchlabel: string | null;
  participantmode: string | null;
  registereduser: string | null;
}

export class dateElement {
  start: Date;
  end: Date;
}

export class numberElement {
  start: number;
  end: number;
  toObject(): any {
    return {
      start: this.start,
      end: this.end,
    };
  }
}

interface userRoles {
  profile_ref: DocumentReference
}

@Component({
  selector: 'app-participants-analytics',
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    TitleCasePipe,
    ExcludeFilterStringPipe,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatSelectModule,
    RouterLink,
    MatMenuModule,
    MatButtonModule,
    MatDividerModule,
    MatChipsModule,
    MatIconModule,
    MatTooltip,
    NgxMatSelectSearchModule,
    MatDatepickerModule,
    CommonModule,
    MatProgressBarModule,
    RouterModule,
    MatSlideToggleModule,
    MatBadgeModule,
    ReactiveFormsModule
  ],
  templateUrl: './participants-analytics.component.html',
  styleUrl: './participants-analytics.component.css',
  providers: [
    provideNativeDateAdapter()
  ]
})

export class ParticipantsAnalyticsComponent {
  //selection
  selection = new SelectionModel<any>(true, []); // single selection mode

  //mat table req
  dataSource = new MatTableDataSource()
  displayedColumns = ['select', 'name']

  @ViewChild(MatPaginator) paginator: MatPaginator
  @ViewChild(MatSort) sort: MatSort
  @ViewChild('Table') table: ElementRef;

  dashboardEntireData: any[] = []
  cloneddashboarddata: any[] = [];
  filtereddashboarddata: any[] = [];
  filteredDataWithoutProductFilter = new Set();
  //filter 
  filterdata: any
  filterForm!: FormGroup;
  filterunconsumedproductlist: string = '';


  //db data saving to variable
  productEventList: any[] = []
  mapPlaylist = {}

  productMap = {};

  queueventList: any[] = [];
  queueTokens: any[] = [];
  queueTokenMap: { [key: string]: any } = [];
  mapfiltervalues = {}

  emailList: any[] = []
  mapParticipantData = {}
  mapParticipantName = {}
  participantProductMap: { [key: string]: any } = {};

  modesList: any[] = []
  showTagHistory = false;
  selectedTagHistory: any[] = [];
  selectedTagHistoryName = '';
  atcModelList: any[] = []

  //search filter
  numberrange = ['age']
  range = ['subscriptionend', 'purchasedate', 'subscriptionstart', 'lastpaymentdate', 'lastsubscriptionstart', 'lastsubscriptionend', 'dateofbirth']
  arrayarray = ['purchase', 'consumedproducts', 'unconsumedproducts', 'activeproduct', 'addons', 'gifts', 'bonus', 'forms', 'reports', 'events', 'queue', 'tier', 'profiletags']
  string = ['kyj', 'testimonial', 'referred', 'directmailaddress', 'email', 'phonenumber'];
  object = ['customersupport', 'customersupportcategory']
  number = ['atccount', 'totaladjustmentaware', 'totaladjustmentunaware']
  stringarray = ['atcmodel']
  arraystring = ['participantmode', 'countrycode', 'currentcity', 'registeredcity', 'contract', 'paymentplan', 'financialstatus', 'customerstatus', 'lastsubscribedjourney', 'higherorderpurchase', 'registereduser']
  stringmaparray = ['productevent', 'queueevent']
  numbermapnumber = ['productcount'];
  computeColumns = ['UP! count' , 'CPM count'];
  nonColumnArrayString = ['activejourney' , 'lastcompletedjourney']
  columnsDisplayed = [...this.arraystring, ...this.numberrange, ...this.string, ...this.object, ...this.stringarray, ...this.number, ...this.arrayarray, , ...this.range, ...this.numbermapnumber, ...this.stringmaparray, ...this.computeColumns,
  ...['eiflix', 'solarvoice', 'generalcontent', 'remarks'],'totalpurchasevalue', 'journey', 'consumedproductcount', 'unconsumedproductcount' , 'emi status' , 'journeyonboarding']
  filterText = null
  showSectionType = null
  savedfilterquery: any = []
  searchsavedfilters: string | null = null
  nooftimesloaded: number = 0
  selectedSavedFilterQueryLabel: string

  // form parameters
  filterjourneylist: string;
  filterparticipantmode: string;
  filterevent: string;
  filterqueue: string;
  filterqueuestage: string;
  filtercategorys: string;
  journeylist: any = []

  filterproductlist: string
  productlist: any[] = []

  filterprofiletags: string

  customerSupportCategorys = []

  filtertier: string
  tierlist: any[] = []

  filterByProducts = {
    consumed: [],
    unconsumed: [],
    participants: {},
    rawProductsData: [],
  };

  mapOperator = {
    "is equal to": "===",
    "greater than": ">",
    "lesser than": "<"
  }

  //add column to table
  searchColumn: string = '';
  selectedColumns: any[] = [];

  // profile
  loggedInProfileId: any
  defaultSearchDocId: string
  mapProfile = {}
  workshopadmin = [];

  fullLoadStarted = false;
  isModalOpen = false;
  unsubscribeFullSnapshots: (() => void)[] = [];

  pendingEmailsList = [];
  pendingWatiList = [];

  filterTagList: string = '';
  tagList = [];

  //import 
  isExcelFile: boolean;
  @ViewChild('inputFile') inputFile: ElementRef;

  // injecting module
  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)
  private dialog = inject(MatDialog)
  private datepipe = inject(DatePipe)
  private authguard = inject(AuthguardService)
  private _snackBar = inject(MatSnackBar)
  private storage = inject(Storage)
  private snackBar = inject(MatSnackBar)
  private router = inject(Router)
  private datatransferservice = inject(DataTransferService)
  unsubscribeInitial: any;
  dashboardPageData: { docid: string; }[];
  initialLoadComplete: boolean;
  fullLoadComplete: boolean = false;
  private inactivityTimer: any;
  private lastActivity = Date.now();
  private countdownInterval: any;
  timeLeft = 600;

  //loading function
  get loading() {
    return this.dialog.open(LoadingProgressComponent, { data: { msg: 'Processing Please Wait ...' }, disableClose: true });
  }

  constructor(private http: HttpClient, private injector: Injector, private fb: FormBuilder,) {
    // get profileid
    this.authguard.getRoles().then(async roles => {
      this.loggedInProfileId = roles['profile_ref'].id
      // if(roles["admin"] || roles['developer']){
      this.fetchData()
      // }else{
      //   this.router.navigateByUrl('/')
      // }
    })

  }


  async ngOnInit() {
    this.filterForm = this.fb.group({
      consumedProducts: this.fb.array([]),
      unconsumedProducts: this.fb.array([])
    });

    // timer
    this.startInactivityTimer();
    this.bindActivityEvents();
    this.startCountdown();
    this.fetchQueuedEmails();
    this.fetchQueuedWati();
    // 
    try {
      const workshopmetadataRef = doc(this.firestore, 'static meta data', 'Workshop Admin');
      const workshopmetadataDoc = await getDoc(workshopmetadataRef);

      if (workshopmetadataDoc.exists()) {
        this.workshopadmin = workshopmetadataDoc.data()['adminprofiles'] || [];
      }
    } catch (error) {
      console.error('Error wrkadmin', error);
    }
  }

  get consumedProducts(): FormArray {
    return this.filterForm.get('consumedProducts') as FormArray;
  }
  // Unconsumed Products FormArray
  get unconsumedProducts(): FormArray {
    return this.filterForm.get('unconsumedProducts') as FormArray;
  }

  // function to remove consumed product
  removeConsumedProduct(index: number): void {
    this.consumedProducts.removeAt(index);
  }

  // function to remove unconsumed product
  removeUnconsumedProduct(index: number): void {
    this.unconsumedProducts.removeAt(index);
  }

  createConsumedProductGroup(): FormGroup {
    return this.fb.group({
      productId: ['',],
      count: [0, Validators.required],
      comparison: ['equalto', Validators.required]
    });
  }

  addConsumedProduct(): void {
    this.consumedProducts.push(this.createConsumedProductGroup());
  }

  createUnconsumedProductGroup(): FormGroup {
    return this.fb.group({
      productId: ['',],
      count: [0, Validators.required],
      comparison: ['equalto', Validators.required]
    });
  }

  addUnconsumedProduct(): void {
    this.unconsumedProducts.push(this.createUnconsumedProductGroup());
  }


  onfilterunconsumedproducts() {
    if (this.productlist != null) {
      const filterValue = (this.filterunconsumedproductlist != null && this.filterunconsumedproductlist != '') ? this.filterunconsumedproductlist.trim().toLowerCase() : ''
      return this.productlist.filter(e => e.product.trim().toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }

  fetchQueuedEmails() {

    collectionData(query(collection(this.firestore, 'email archive'), where('status', '==', 'queued'))).subscribe((emaildocs) => {
      if (emaildocs.length != 0) {
        this.pendingEmailsList = emaildocs.sort((a, b) => a['date'] - b['date']);
      } else {
        console.log('No Queued Emails Found');
      }
    });

  }

  fetchQueuedWati() {

    collectionData(query(collection(this.firestore, 'wati archive'), where('status', '==', 'queued'))).subscribe((watidocs) => {
      if (watidocs.length != 0) {
        this.pendingWatiList = watidocs.sort((a, b) => a['queuedAt'] - b['queuedAt']);
      } else {
        console.log('No Queued Emails Found');
      }
    });

  }

  async fetchData() {
    let loadingref = this.loading
    this.filterdata = new formelement
    this.filterdata.subscriptionstart = new dateElement
    this.filterdata.subscriptionend = new dateElement
    this.filterdata.purchasedate = new dateElement
    this.filterdata.age = new numberElement
    this.filterdata.profiletags = [];

    const categorys = new Set();

    // Parallel Firestore collections
    const [
      savedFiltersSnap,
      eventSnap,
      queueSnap,
      queueTokenSnap,
      tierSnap,
      journeySnap,
      modesSnap,
      productsSnap,
      tagsSnap,
      metadataSnap
    ] = await Promise.all([
      getDocs(collection(this.firestore, "searchquery")),
      getDocs(collection(this.firestore, "event collection")),
      getDocs(collection(this.firestore, "queue generation")),
      getDocs(query(collection(this.firestore, "queue_token"), where('stagestatus', '==', 'Approved'), where('tokenstatus', '==', 'Active'))),
      getDocs(collection(this.firestore, "tier")),
      getDocs(collection(this.firestore, "journey")),
      getDocs(collection(this.firestore, "modes")),
      getDocs(collection(this.firestore, "products")),
      getDocs(collection(this.firestore, "participant tags")),
      getDocs(query(collection(this.firestore, "participant metadata"), orderBy('name')))
    ]);

    // Saved filters
    this.savedfilterquery = savedFiltersSnap.docs.map(d => d.data());

    // Event collection
    this.productEventList = eventSnap.docs.map(e => {
      const element = e.data();
      this.mapfiltervalues[e.id] = element['name'];
      return ({
        ...e.data(),
        id: e.id,
        ref: e.ref
      })
    });

    // Queue generation
    this.queueventList = queueSnap.docs.map(e => {
      const element = e.data();
      element['id'] = e.id;
      element['ref'] = e.ref;
      this.mapfiltervalues[e.id] = element['queuename'];
      return element;
    });

    // Queue tokens
    queueTokenSnap.docs.forEach(e => {
      const element = e.data();
      // if (element['stagestatus']?.toLowerCase() !== 'approved' && element['tokenstatus']?.toLowerCase() !== 'active') {
      //   return
      // }
      const stage = element['currentstage'];
      const queueId = element['queueref']?.id || '';
      element['id'] = e.id;
      if (!Object.hasOwn(this.queueTokenMap, queueId)) {
        this.queueTokenMap[queueId] = {}
      }
      if (!Object.hasOwn(this.queueTokenMap[queueId], stage)) {
        this.queueTokenMap[queueId][stage] = []
      }
      this.queueTokenMap[queueId][stage].push(element);
    });


    // Tier
    this.tierlist = tierSnap.docs.map(e => {
      const element = e.data();
      this.mapfiltervalues[e.id] = element['tier'];
      return element;
    });

    // Journey
    this.journeylist = journeySnap.docs.map(e => {
      const element = e.data();
      this.mapfiltervalues[e.id] = element['journey'];
      return element;
    });

    // Modes
    this.modesList = modesSnap.docs.map(e => e.data());

    // Products
    const atcModelSet = new Set<string>();
    this.productlist = productsSnap.docs.map(e => {
      const element = e.data();
      this.productMap[e.id] = element;
      this.mapfiltervalues[e.id] = element['product'];
      const model = element['atcmodel'];
      if (model && !atcModelSet.has(model)) atcModelSet.add(model);
      return element;
    });
    this.atcModelList = Array.from(atcModelSet);

    // Participant Tags
    tagsSnap.docs.forEach(e => {
      const element = e.data();
      this.mapfiltervalues[e.id] = element['name'];
    })

    // participant products
    // const participantProductMap = {}
    // participantProductSnap.docs.forEach((productSnap) => {
    //   const data = productSnap.data();
    //   const profileid = data['profileid'];
    //   const status = data['status'];
    //   const product = data['productref'].id;

    //   if (![null, 'completed'].includes(status)) {
    //     return
    //   }

    //   if (!Object.hasOwn(participantProductMap, profileid)) {
    //     participantProductMap[profileid] = {};
    //   }
    //   if (!Object.hasOwn(participantProductMap[profileid], product)) {
    //     participantProductMap[profileid][product] = {
    //       consumedCount: 0,
    //       consumedDocuments: [],
    //       unConsumedCount: 0,
    //       unConsumedDocuments: [],
    //     }
    //   }

    //   if (status === 'completed') {
    //     participantProductMap[profileid][product].consumedCount++;
    //     participantProductMap[profileid][product].consumedDocuments.push(data)
    //   } else if (status == null) {
    //     participantProductMap[profileid][product].unConsumedCount++;
    //     participantProductMap[profileid][product].unConsumedDocuments.push(data)
    //   }
    // });

    // this.participantProductMap = participantProductMap;

    // Participant metadata
    const participantProductMap = {}
    metadataSnap.docs.forEach(e => {
      const element = e.data();
      const profileId = element['profileid'];
      const consumedProducts = element['consumedproducts']|| [];
      const unconsumedProducts = element['unconsumedproducts'] || [];
      element['registereduser'] = element['firebaseuserref'] != null ? 'registered' : 'non-registered';
      if (![null, undefined].includes(element['profiletags']) && element['profiletags'].length != 0) {
        for (let i = 0; i < element['profiletags'].length; i++) {
          const tag = element['profiletags'][i];

          if (!this.tagList.includes(tag)) {
            this.tagList.push(tag);
          }
        }
      }
      Object.values(element['customersupport'] || {}).forEach((t) => categorys.add(t['category']));
      this.emailList.push(element['email'])
      this.dashboardEntireData.push(element)

      if (!Object.hasOwn(participantProductMap, profileId)) {
        participantProductMap[profileId] = {};
      }

      consumedProducts.forEach((p) => {
        if (!Object.hasOwn(participantProductMap[profileId], p)) {
          participantProductMap[profileId][p] = {
            consumedCount: 0,
            unConsumedCount: 0,
          }
        }

        participantProductMap[profileId][p].consumedCount++;
      })

      unconsumedProducts.forEach((p) => {
        if (!Object.hasOwn(participantProductMap[profileId], p)) {
          participantProductMap[profileId][p] = {
            consumedCount: 0,
            unConsumedCount: 0,
          }
        }

        participantProductMap[profileId][p].unConsumedCount++;
      })

    })
    this.participantProductMap = participantProductMap;
    this.customerSupportCategorys = Array.from(categorys.values()).filter((c: any) => ![null, undefined, ''].includes(c));
    loadingref.close();

    this.onDataSearch()


    // Map Playlist - small collections, still done after the main load
    await this.loadMapPlaylist();
  }

  getProductForParticipant(profileId: string, key: string) {
    return Object.entries(this.participantProductMap[profileId] || {}).map((d) => ({ key: d[0], count: d[1][key] }));
  }

  getEventsForProduct(eventId: string[]) {
    return eventId.map((e) => this.mapfiltervalues[e]).join(', ')
  }

  getQueueForProduct(queueId: string[]) {
    return queueId.map((e) => this.mapfiltervalues[e]).join(', ')
  }

  private async loadMapPlaylist() {
    const collectionMap = {
      "series": "seriesName",
      "recommended mix playlist": "title",
      "solar voice playlist": "name",
      "content_urls": "title"
    };
    this.mapPlaylist = {};

    const promises = Object.entries(collectionMap).map(async ([coll, key]) => {
      const snap = await getDocs(collection(this.firestore, coll));
      snap.docs.forEach(doc => {
        this.mapPlaylist[doc.id] = doc.data()[key];
      });
    });

    await Promise.all(promises);
  }


  ngAfterViewInit() {
    this.dataSource.data = this.filtereddashboarddata
    this.dataSource.sort = this.dataSource.sort
    this.dataSource.paginator = this.paginator
  }

  ngOnDestroy(): void {
    if (this.unsubscribeInitial) {
      this.unsubscribeInitial(); // Firestore onSnapshot returns a function
    }

    if (this.unsubscribeFullSnapshots && this.unsubscribeFullSnapshots.length > 0) {
      for (const unsub of this.unsubscribeFullSnapshots) {
        if (typeof unsub === 'function') {
          unsub();
        }
      }
      this.unsubscribeFullSnapshots = []; // Clear the array
    }

    if (this.destroy$) {
      this.destroy$.next();
      this.destroy$.complete();
    }
    this.clearTimers();
  }


  private startInactivityTimer() {
    this.lastActivity = Date.now();
    this.clearTimers();

    this.inactivityTimer = setTimeout(() => {
      this.showInactivityAlert();
    }, 10 * 60 * 1000); // 10 minutes
  }

  private startCountdown() {
    this.countdownInterval = setInterval(() => {
      const elapsed = Date.now() - this.lastActivity;
      const remaining = Math.max(0, (10 * 60 * 1000) - elapsed);
      this.timeLeft = Math.floor(remaining / 1000);
    }, 1000);
  }

  private showInactivityAlert() {
    // // Show Material Snackbar
    // const snackBarRef = this.snackBar.open(
    //   '⚠️ You have been inactive for 10 minutes. Consider refreshing for better performance.',
    //   'Refresh Now',
    //   {
    //     duration: 10000, // Show for 10 seconds
    //     horizontalPosition: 'center',
    //     verticalPosition: 'top',
    //     panelClass: ['warning-snackbar']
    //   }
    // );

    // // Handle refresh button click
    // snackBarRef.onAction().subscribe(() => {
    //   this.refreshPage();
    // });

    // Also show browser confirm dialog
    setTimeout(() => {
      const userChoice = confirm(
        'You have been inactive for 10 minutes.\n\n' +
        'Click OK to refresh the page for better performance.\n' +
        'Click Cancel to continue without refreshing.'
      );

      if (userChoice) {
        this.refreshPage();
      } else {
        this.resetTimer(); // Reset timer and continue
      }
    }, 500);
  }

  async refreshPage() {
    try {
      const loadingRef = this.loading
      this.dashboardEntireData = [];

      // Fetch participant metadata
      const metadataSnap = await getDocs(
        query(collection(this.firestore, "participant metadata"), orderBy('name'))
      );

      // Update participant metadata
      for (let i = 0; i < metadataSnap.docs.length; i++) {
        const element = metadataSnap.docs[i].data();
        element['registereduser'] = element['firebaseuserref'] != null ? 'registered' : 'non-registered';
        this.dashboardEntireData.push(element);
      }

      // Refresh the table data with new metadata
      this.onDataSearch();

      // Close loading
      loadingRef.close();

    } catch (error) {
      console.error('Error refreshing participant metadata:', error);
      this.snackBar.open('Failed to refresh participant data', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  private bindActivityEvents() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    events.forEach(event => {
      document.addEventListener(event, () => {
        this.resetTimer();
      }, true);
    });
  }

  private resetTimer() {
    this.lastActivity = Date.now();
    this.timeLeft = 600;
    this.clearTimers();
    this.startInactivityTimer();
    this.startCountdown();
  }

  private clearTimers() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }
    this.selection.select(...this.dataSource.data);
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  //saved filter search
  savedfiltersearch() {
    var filtered = ![null, undefined, ''].includes(this.searchsavedfilters) ? this.savedfilterquery.filter((e: any) => e.label?.toLowerCase().trim().includes(this.searchsavedfilters?.toLowerCase().trim())) : this.savedfilterquery;
    return filtered;
  }

  onfilterjourneylist() {
    if (this.journeylist != null) {
      const filterValue = (this.filterjourneylist != null && this.filterjourneylist != '') ? this.filterjourneylist.trim().toLowerCase() : ''
      return this.journeylist.filter(e => e.journey.trim().toLowerCase().includes(filterValue))
    }
  }

  onParticipantMode() {
    if (this.modesList != null) {
      const filterValue = (this.filterparticipantmode != null && this.filterparticipantmode != '') ? this.filterparticipantmode.trim().toLowerCase() : ''
      return this.modesList.filter(e => e.mode.trim().toLowerCase().includes(filterValue))
    }
    return []
  }

  onEventSearch() {
    if (this.productEventList != null) {
      const filterValue = (this.filterevent != null && this.filterevent != '') ? this.filterevent.trim().toLowerCase() : ''
      return this.productEventList.filter(e => e.name.trim().toLowerCase().includes(filterValue))
    }
    return []
  }

  onQueueSearch() {
    if (this.queueventList != null) {
      const filterValue = (this.filterqueue != null && this.filterqueue != '') ? this.filterqueue.trim().toLowerCase() : ''
      return this.queueventList.filter(e => e.queuename.trim().toLowerCase().includes(filterValue))
    }
    return []
  }

  onQueueStageSearch() {
    if (this.queueTokens != null) {
      const filterValue = (this.filterqueuestage != null && this.filterqueuestage != '') ? this.filterqueuestage.trim().toLowerCase() : ''
      return this.queueTokens.filter(e => e.trim().toLowerCase().includes(filterValue))
    }
    return []
  }

  onCategorySearch() {
    if (this.customerSupportCategorys != null) {
      const filterValue = (this.filtercategorys != null && this.filtercategorys != '') ? this.filtercategorys.trim().toLowerCase() : ''
      return this.customerSupportCategorys.filter(e => e.trim().toLowerCase().includes(filterValue))
    }
    return []
  }

  onfilterproducts() {
    if (this.productlist != null) {
      const filterValue = (this.filterproductlist != null && this.filterproductlist != '') ? this.filterproductlist.trim().toLowerCase() : ''
      return this.productlist.filter(e => e.product.trim().toLowerCase().includes(filterValue))
    } else return []
  }

  // Function to filter tags on search
  onfiltertags() {
    if (this.tagList != null) {
      const filterValue = (this.filterTagList != null && this.filterTagList != '') ? this.filterTagList.trim().toLowerCase() : ''
      return this.tagList.filter(e => this.mapfiltervalues[e].trim().toLowerCase().includes(filterValue))
    } else return []
  }

  filterproducts(productarray: Array<any>, productvalue: string) {
    return productarray.filter(e => e === productvalue).length
  }

  filterAtcModel(atcmodelarray: Array<any>) {
    return atcmodelarray.filter(e => e === this.filterdata['atcmodel']).length
  }

  onfiltertier() {
    if (this.tierlist != null) {
      const filterValue = (this.filtertier != null && this.filtertier != '') ? this.filtertier.trim().toLowerCase() : ''
      return this.tierlist.filter(e => e.tier.toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }

  handleQueueSelection() {
    const queue = this.filterdata['queueevent'];
    let queueStages = [];
    console.log(Object.hasOwn(this.queueTokenMap, queue))
    if (queue && Object.hasOwn(this.queueTokenMap, queue)) {
      queueStages = Object.keys(this.queueTokenMap[queue]);
    }
    this.queueTokens = queueStages;
  }

  returnFilterText(): void {

    let data = Object.assign({}, this.filterdata)

    for (const key in data) {
      if (data[key] === null || data[key] === undefined) delete data[key]
      else if (this.range.includes(key)) {
        if (data[key]['start'] === null || data[key]['start'] === undefined || data[key]['end'] === null || data[key]['end'] === undefined) delete data[key]
      }
      else if ([...this.arraystring, ...this.arrayarray].includes(key)) {
        if (data[key].length === 0) delete data[key]
      }
      else if (this.numberrange.includes(key)) {
        if (data[key]['start'] === null || data[key]['start'] === undefined || data[key]['end'] === null || data[key]['end'] === undefined) delete data[key]
      }
    }
    // console.log(data);
    this.filterText = null
    let filterdata = Object.assign({}, data)
    for (const key in filterdata) {
      const element = filterdata[key];

      // console.log(key, filterdata[key], typeof element)
      // if(this.arraystring.includes(key) || this.arrayarray.includes(key)){
      //   var text = `${this.filterText == null ? '' : ' (AND) \n'}"${key}" is equal to ${this.mapfiltervalues[filterdata[key]] ? this.mapfiltervalues[filterdata[key]] : this.mapfiltervalues[filterdata[key]] .join(" (OR) ")}`
      //   this.filterText = (this.filterText ?? "") + text
      // }
      if (this.arraystring.includes(key) || this.arrayarray.includes(key)) {
        const filterValues = filterdata[key]; // Get the filter data for the key
        let text = "";
        // Check if the key belongs to arrayarray
        if (this.arrayarray.includes(key) && Array.isArray(filterValues)) {
          const mappedValues = filterValues
            .map(value => this.mapfiltervalues[value] || value)
            .join(" (OR) "); // Map and join values
          text = `${this.filterText == null ? '' : ' (AND) \n'}"${key}" is equal to ${mappedValues}`;
        }
        // Check if the key belongs to arraystring
        else if (this.arraystring.includes(key) && Array.isArray(filterValues)) {
          const mappedValues = filterValues
            .map(value => this.mapfiltervalues[value] || value)
            .join(" (OR) "); // Map and join values
          text = `${this.filterText == null ? '' : ' (AND) \n'}"${key}" is equal to ${mappedValues}`;
          // text = `${this.filterText == null ? '' : ' (AND) \n'}"${key}" is equal to ${mappedValue}`;
        }

        // Append the constructed text to the filterText
        this.filterText = (this.filterText ?? "") + text;
      }

      else if (this.string.includes(key) || this.number.includes(key) || this.stringarray.includes(key)) {
        var text = `${this.filterText == null ? '' : ' (AND) \n'}"${key}" is equal to ${this.mapfiltervalues[filterdata[key]] ? this.mapfiltervalues[filterdata[key]] : filterdata[key]}`
        this.filterText = (this.filterText ?? "") + text
      }
      else if (this.range.includes(key)) {
        var text = `${this.filterText == null ? '' : ' (AND) \n'}"${key}" From ${this.datepipe.transform(filterdata[key]["start"], 'MMM d, y')} To ${this.datepipe.transform(filterdata[key]["end"], 'MMM d, y')}`
        this.filterText = (this.filterText ?? "") + text
      }
      else if (this.numberrange.includes(key)) {
        var text = `${this.filterText == null ? '' : ' (AND) \n'}"${key}" From ${filterdata[key]["start"]} To ${filterdata[key]["end"]}`
        this.filterText = (this.filterText ?? "") + text
      }
    }
  }

  loadtabledata(value: any) {
    if (!this.selectedSavedFilterQueryLabel) {
      this.filterdata = new formelement
      this.filterdata.subscriptionstart = new dateElement
      this.filterdata.subscriptionend = new dateElement
      this.filterdata.purchasedate = new dateElement
      this.filterdata.age = new numberElement
      for (const key in value) {
        this.filterdata[key] = value[key]
      }
      this.selectedSavedFilterQueryLabel = value.label
      this.onDataSearch();
      this.returnFilterText();
    } else {
      this.selectedSavedFilterQueryLabel = null;
      this.onformreset();
    }
  }

  updateDefaultSearch(data: any) {
    if (confirm("are you want to update")) {
      const docRef = doc(this.firestore, 'profile_data', this.loggedInProfileId)
      updateDoc(docRef, {
        defaultsearchref: doc(this.firestore, 'searchquery', data['docid'])
      }).then(() => {
        console.log("successfully submitted");
        this.onInitiate()
      }).catch(err => {
        console.log(err);
      })
    }
  }

  ondeletefilterdata(value: any) {
    // console.log(value);
    if (confirm("are you sure want to delete tag")) {
      const docRef = doc(this.firestore, "searchquery", value['docid'])
      deleteDoc(docRef).then(() => {
        console.log("document successfully deleted");
        if (this.defaultSearchDocId === value['docid']) {
          const profileDocRef = doc(this.firestore, 'profile_data', this.loggedInProfileId)
          updateDoc(profileDocRef, { defaultsearchref: null }).then(() => {
            this.onInitiate()
          })
        }
      }).catch(err => { console.log(err); })
    }
  }

  onInitiate() {
    const profileDataDocRef = doc(this.firestore, "profile_data", this.loggedInProfileId)
    getDoc(profileDataDocRef).then(snap => {
      if (snap?.data()['defaultsearchref'] != null || snap?.data()['defaultsearchref'] != undefined) {
        this.defaultSearchDocId = snap.data()['defaultsearchref'].id
        getDoc(doc(this.firestore, snap.data()['defaultsearchref'].path)).then(searchsnap => {
          this.loadtabledata(searchsnap.data())
        })
      } else {
        this.onDataSearch()
      }
    })
  }

  async onDataSearch() {
    let loadingref = this.loading
    let data = Object.assign({}, this.filterdata);
    for (const key in data) {
      if (data[key] === null || data[key] === undefined) delete data[key]
      else if (this.range.includes(key)) {
        if (data[key]['start'] === null || data[key]['start'] === undefined || data[key]['end'] === null || data[key]['end'] === undefined) delete data[key]
      }
      else if ([...this.arraystring, ...this.arrayarray].includes(key)) {
        if (data[key].length === 0) delete data[key]
      }
      else if (this.numberrange.includes(key)) {
        if (data[key]['start'] === null || data[key]['start'] === undefined || data[key]['end'] === null || data[key]['end'] === undefined) delete data[key]
      }
    }

    const filteredDataWithoutProductFilter = new Set();
    this.cloneddashboarddata = this.dashboardEntireData.map(a => ({ ...a }))
    this.filtereddashboarddata = this.cloneddashboarddata.filter(e => {
      let booleanarray = []
      for (const key in data) {
        if (!['docid', 'profileid', 'label', 'createdby', 'productcount', 'operator', 'products', 'subscriptionend' , 'subscriptionstart'].includes(key)) {
          if (this.arraystring.includes(key)) { [null, undefined].includes(e[key]) ? e[key] = 'none' : null }

          if (['atccount'].includes(key) || (e[key] != undefined && e[key] != null)) {
            if (this.string.includes(key)) {
              if (data[key]?.toLowerCase().replace(/\s+/g, '') === e[key]?.toLowerCase().replace(/\s+/g, '')) { booleanarray.push(true) }
              else { booleanarray.push(false) }
            } else if (this.number.includes(key)) {
              if (data[key] === (e[key] ?? 0)) { booleanarray.push(true) }
              else { booleanarray.push(false) }
            } else if (this.arraystring.includes(key) || this.nonColumnArrayString.includes(key)) {
              if (data[key].includes(e[key])) { booleanarray.push(true) }
              else { booleanarray.push(false) }
            } else if (this.stringarray.includes(key)) {
              if (e[key].includes(data[key])) { booleanarray.push(true) }
              else { booleanarray.push(false) }
            } else if (this.arrayarray.includes(key)) {
              if (['consumedproducts', 'unconsumedproducts', 'activeproduct', 'tier'].includes(key) && data['productcount'] != null && data['operator'] != null) {
                const condition = `${e[key].filter((opt: string) => opt === data[key][0]).length}` + data['operator'] + `${data['productcount']}`
                if (condition) { booleanarray.push(true) }
                else { booleanarray.push(false) }
              }
              else if (data[key].some(item => e[key].includes(item))) { booleanarray.push(true) }
              else { booleanarray.push(false) }
            } else if (this.range.includes(key)) {
              if (![null, undefined].includes(e[key])) {
                if (e[key]?.toDate() >= new Date(data[key]['start']) && e[key]?.toDate() <= new Date(data[key]['end'])) {
                  booleanarray.push(true)
                }
                else {
                  booleanarray.push(false)
                }
              }
              else { booleanarray.push(false) }
            } else if (this.numberrange.includes(key)) {
              if (![null, undefined].includes(e[key])) {
                if (e[key] >= data[key]['start'] && e[key] <= data[key]['end']) { booleanarray.push(true) }
                else { booleanarray.push(false) }
              } else { booleanarray.push(false) }
            } else if (this.stringmaparray.includes(key)) {
              if ([null, undefined].includes(this.filterdata['products'])) {
                // console.log([].concat.apply([], Object.keys(e[key])), data[key])
                if ([].concat.apply([], Object.values(e[key])).includes(data[key])) {
                  booleanarray.push(true)
                }
                else { booleanarray.push(false) }
              } else {
                if (![null, undefined].includes(e[key])) {
                  if (![null, undefined].includes(e[key][data['products']])) {
                    if (e[key][data['products']].includes(data[key])) { booleanarray.push(true) }
                    else { booleanarray.push(false) }
                  } else { booleanarray.push(false) }
                }
              }
            }
          } else if (this.object.includes(key)) {
            if (key === 'customersupport') {
              const matches = Object.values(e['customersupport'] || {}).some((t) => t['status']?.toLowerCase() === data['customersupport']);
              if (matches) {
                booleanarray.push(true)
              } else {
                booleanarray.push(false)
              }
            } else if (key === 'customersupportcategory') {
              const matches = Object.values(e['customersupport'] || {}).some((t) => {
                console.log(t['category']?.toLowerCase() === data['customersupportcategory'])
                return t['category']?.toLowerCase() === data['customersupportcategory']
              });
              if (matches) {
                booleanarray.push(true)
              } else {
                booleanarray.push(false)
              }
            }
          } else {
            booleanarray.push(false)
          }
        }
        if (['subscriptionstart' ,'subscriptionend'].includes(key)) {
          const dateKey = e['customerstatus'] === 'active' ? key : ['discontinued', 'non active'].includes(e['customerstatus']) ? `last${key}` : null;
          if ([null, undefined, ''].includes(dateKey) || [null, undefined, ''].includes(e[dateKey])) {
            booleanarray.push(false)
          } else {
            if (e[dateKey]?.toDate() >= new Date(data[key]['start']) && e[dateKey]?.toDate() <= new Date(data[key]['end'])) {
              booleanarray.push(true)
            }
            else {
              booleanarray.push(false)
            }
          }
        }

        if (key === 'queuestage' && ![null, undefined, ''].includes(data['queueevent']) && ![null, undefined, ''].includes(data['queuestage'])) {
          const queue = data['queueevent'];
          const stage = data['queuestage'];
          if (this.queueTokenMap[queue] && this.queueTokenMap[queue][stage]) {
            const matches = this.queueTokenMap[queue][stage]?.some((t) => e['profileid'] === t['profile_id']);
            if (matches) {
              booleanarray.push(true)
            } else {
              booleanarray.push(false)
            }
          } else {
            booleanarray.push(false)
          }
        }

      }

      if (!booleanarray.includes(false)) {
        filteredDataWithoutProductFilter.add(e['profileid'])
      }

      // if ((this.filterByProducts.consumed.length > 0 || this.filterByProducts.unconsumed.length > 0)
      //   && (!Object.hasOwn(this.filterByProducts.participants, e['profileid']))) {
      //   booleanarray.push(false);
      // }

      const consumed = this.consumedProducts.value.filter((p: any) => p.productId !== '' && p.productId !== null);
      const unconsumed = this.unconsumedProducts.value.filter((p: any) => p.productId !== '' && p.productId !== null);
      let matchesConsumed = consumed.length === 0;
      let matchesUnconsumed = unconsumed.length === 0;

      // Check consumed filters (only if consumed filters exist)
      if (consumed.length > 0) {
        matchesConsumed = consumed.every(filter => {
          const productData = this.participantProductMap[e['profileid']] ? this.participantProductMap[e['profileid']][filter.productId] : null;
          if (!productData) return false;

          if (filter.comparison === 'equalto') {
            return productData.consumedCount == filter.count;
          } else if (filter.comparison === 'groreqto') {
            return productData.consumedCount >= filter.count;
          } else if (filter.comparison === 'lsoreqto') {
            return productData.consumedCount <= filter.count;
          }
          return productData.consumedCount == filter.count;
        });
      }

      // Check unconsumed filters (only if unconsumed filters exist)
      if (unconsumed.length > 0) {
        matchesUnconsumed = unconsumed.every(filter => {
          const productData = this.participantProductMap[e['profileid']] ? this.participantProductMap[e['profileid']][filter.productId] : null;
          if (!productData) return false;

          if (filter.comparison === 'equalto') {
            return productData.unConsumedCount == filter.count;
          } else if (filter.comparison === 'groreqto') {
            return productData.unConsumedCount >= filter.count;
          } else if (filter.comparison === 'lsoreqto') {
            return productData.unConsumedCount <= filter.count;
          }

          return productData.unConsumedCount == filter.count;
        });
      }

      if ((matchesConsumed && matchesUnconsumed)) {
        booleanarray.push(true)
      } else {
        booleanarray.push(false)
      }


      if (!booleanarray.includes(false)) {
        return e
      } else {
        // console.log(e)
        // console.log(booleanarray);
        // console.log(!booleanarray.includes(false));
      }
    })
    this.filteredDataWithoutProductFilter = filteredDataWithoutProductFilter;
    this.ngAfterViewInit()
    loadingref.close()
    this.nooftimesloaded = 1
    this.selection.clear()
  }

  searchValidation() {
    let validation = []
    if (this.filterdata['productcount'] != null && this.filterdata['productcount'] != undefined) {
      let productarray = Object.keys(this.filterdata).filter(e => ['unconsumedproducts', 'consumedproducts', 'activeproduct'].includes(e))
      for (let i = 0; i < productarray.length; i++) {
        const element = productarray[i];
        if (this.filterdata[element].length != 0) validation.push(true)
        else {
          delete this.filterdata[element]
          validation.push(false)
        }
      }
    }
    return validation.filter(e => e).length > 1
  }


  saveSearchedFilter(value) {
    this.closeModal()

    let loadingref = this.loading
    let data = Object.assign({}, this.filterdata)
    for (const key in data) {
      if (data[key] instanceof numberElement) {
        data[key] = data[key].toObject();
      }
      if (data[key] instanceof dateElement) {
        data[key] = {
          // start:data[key].start ,
          // end:data[key].end
          start: data[key].start ? this.datepipe.transform(data[key].start, 'yyyy-MM-dd') : null,
          end: data[key].end ? this.datepipe.transform(data[key].end, 'yyyy-MM-dd') : null,
        };
      }
      if (data[key] === null || data[key] === undefined) delete data[key]
      else if (this.range.includes(key)) {
        if (data[key]['start'] === null || data[key]['start'] === undefined || data[key]['end'] === null || data[key]['end'] === undefined) delete data[key]
      }
      else if ([...this.arraystring, ...this.arrayarray].includes(key)) {
        if (data[key].length === 0) delete data[key]
      }
      else if (this.numberrange.includes(key)) {
        if (data[key]['start'] === null || data[key]['start'] === undefined || data[key]['end'] === null || data[key]['end'] === undefined) delete data[key]
      }
    }
    if (Object.keys(data).length >= 2) {
      if (confirm("are you sure you want to submit")) {
        data['docid'] = data['docid'] ?? doc(collection(this.firestore, "searchquery")).id
        data['createdby'] = this.loggedInProfileId
        setDoc(doc(this.firestore, "searchquery", data['docid']), data, { merge: true }).then(() => {
          console.log("successfully saved search querysubmitted ");
          this.savedfilterquery.push(data)
          loadingref.close()
        })
      } else {
        loadingref.close()
      }
    } else {
      loadingref.close()
      alert("Please give label for the filter before you save it & atleast give one filter")
    }

  }

  onformreset() {
    this.filterdata = new formelement
    this.filterdata.subscriptionstart = new dateElement
    this.filterdata.subscriptionend = new dateElement
    this.filterdata.purchasedate = new dateElement
    this.filterdata.age = new numberElement
    this.filterText = null;
    this.filterByProducts = {
      consumed: [],
      unconsumed: [],
      participants: {},
      rawProductsData: []
    };
    this.selection.clear();
    this.consumedProducts.clear()
    this.unconsumedProducts.clear();
    this.onDataSearch();
  }

  onColumnNameSelect(value) {
    this.displayedColumns = ['select', 'name', ...value,];
  }

  // getColumnForTableHeader(columnKey: string) {
  //   const [type, productId, comparison, count] = columnKey.split('-');
  //   return `${type}( ${this.mapfiltervalues[productId]} )` || 'N/A';
  // }

  // getProductCountForParticipant(columnKey: string, profileId: string) {
  //   const [type, productId, comparison, count] = columnKey.split('-');
  //   const participant = this.participantProductMap[profileId];
  //   if (!participant) {
  //     return ''
  //   }
  //   const product = participant[productId];
  //   if (!product) return ''
  //   if (type === 'consumed') {
  //     return participant[productId].consumedCount;
  //   } else {
  //     return participant[productId].unConsumedCount;
  //   }
  // }

  returnTableColumns() {
    var columns = this.columnsDisplayed
    return columns.filter(e => e.toLowerCase().trim().includes(this.searchColumn.toLowerCase().trim()))
  }

  //remarks

  addremarks(profile) {
    let mapprofileremarks = {}
    var dialogRef = this.dialog.open(AddRemarksComponent, {
      data: {},
      autoFocus: false,
    })

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (value != null) {
        for (let i = 0; i < profile.length; i++) {
          const element = profile[i];
          mapprofileremarks[element['profileid']] = element
        }
        var remarks = {
          date: new Date(),
          note: value,
          givenby: this.loggedInProfileId
        }
        for (const key in mapprofileremarks) {
          if (Object.prototype.hasOwnProperty.call(mapprofileremarks, key)) {
            const element = mapprofileremarks[key];
            if (element['remarks'] == undefined) {
              element['remarks'] = [remarks]
            } else {
              element['remarks'].push(remarks)
            }
            updateDoc(doc(this.firestore, "participant metadata", key), {
              remarks: element['remarks']
            })
          }
        }
      }
    })
  }

  editremarks(profile) {
    if (profile != undefined) {
      profile.forEach(map => {
        const dialogRef = this.dialog.open(RemarkDialogComponent, {
          data: map['remarks'].map(e => Object.assign({}, e)),
          autoFocus: false,
        });

        let mapprofileremarks = {};
        dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(newRemarks => {
          newRemarks = newRemarks.filter(element => element.note.trim() !== "")
          if (newRemarks != null) {
            for (let i = 0; i < profile.length; i++) {
              const element = profile[i];
              mapprofileremarks[element['profileid']] = element;
            }
            for (const key in mapprofileremarks) {
              if (Object.prototype.hasOwnProperty.call(mapprofileremarks, key)) {
                updateDoc(doc(this.firestore, "participant metadata", key), {
                  remarks: newRemarks
                }).then(() => {
                  console.log("Remarks updated in Firebase");
                }).catch(error => {
                  console.error("Error updating remarks in Firebase:", error);
                });
              }
            }
          }
        });
      });
    }
  }

  // playlist
  onViewRecommendedPlaylist() {
    if (this.displayedColumns.some(e => ['eiflix', 'solarvoice', 'generalcontent'].includes(e))) {
      this.displayedColumns = this.displayedColumns.filter(e => !['eiflix', 'solarvoice', 'generalcontent'].includes(e))
    } else {
      this.displayedColumns = [...this.displayedColumns, ...['eiflix', 'generalcontent', 'solarvoice']]
    }
  }

  createRecommendedPlaylistToSelectedParticipant() {//map recommended playlist to selected participant to buffer collection
    let dialogRef = this.dialog.open(MapRecommendedplaylistToparticipantComponentComponent, {
      data: {
        participantlist: this.selection.selected,
        // personalised : personalised
      },
      minWidth: "500px",
      disableClose: true
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(result => {
      if (result != null && result != undefined) {
        let docid = doc(collection(this.firestore, "buffermix archive")).id
        result['docid'] = docid
        setDoc(doc(this.firestore, "buffermix archive", docid), result).then(() => {
          console.log("buffer document created");
        }).catch(err => {
          console.log(err);
        })
      }
    })
  }

  //email & communications

  openSnackBar(message: string, action: string) {
    this._snackBar.open(message, action);
  }

  sendEmailToSelectedParicipant() {
    let dialogRef = this.dialog.open(EmailInputComponent, {
      data: this.selection.selected,
      minWidth: "600px",
      disableClose: true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        console.log(result);

        const docRef = doc(collection(this.firestore, "email archive"), result['docid']);
        if (result['status'] == 'queued' || result['status'] == 'send') {
          await setDoc(docRef, result, { merge: true }).then(() => {
            this.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : "Email Sent Successfully", "OK");
          }).catch(err => {
            console.log(err);
            this.openSnackBar("Error Sending Email", "OK");
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

  updateEmailValidator() {
    let listofprofileid = this.selection.selected.map(e => e.profileid)
    setDoc(doc(this.firestore, "email validators", "validators"), {
      profilelist: listofprofileid
    }, { merge: true }).then(() => {
      this.openSnackBar("Updated EMail Validators", "close")
    }).catch(err => {
      console.log(err);
    })
  }

  patchEmailValidator() {
    getDoc(doc(this.firestore, "email validators", "validators")).then(async snap => {
      this.selection.clear()
      console.log("cleared");
      let filterDatasource = this.dataSource.data.filter(e => snap.data()['profilelist'].includes(e['profileid']))
      this.selection.select(...filterDatasource)
    })
  }

  sendWatiMessage() {
    let dialogRef = this.dialog.open(WatiInputComponent, {
      data: this.selection.selected,
      width: "70vw",
      height: "80vh",
      disableClose: true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        if (result == 'success') {
          this.openSnackBar("Wati Message Sent Successfully", "OK");
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
          this.openSnackBar("Sending Wati Message Failed", "OK");
        }
      }
    });
  }

  openWatiConfig() {
    let dialogRef = this.dialog.open(WatiConfigDialogComponent, {
      data: this.selection.selected,
      width: "70vw",
      height: "80vh",
      disableClose: true
    });
  }

  updatelist(profile) {
  }

  managelist(profile) {
    const dialogRef = this.dialog.open(ManageParticipantlistDialogComponent, {
      width: '80vw',
      height: '85vh',
      data: profile,
      autoFocus: false,
    });
  }

  addSubscription(profile) {
    const dialogRef = this.dialog.open(SubscriptionDialogComponent, {
      width: '80%',
      height: '80%',
      data: profile,
      autoFocus: false,
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (value != null) {
        value.data.forEach((profile: any) => {
          const purchaseRef = profile['customerstatus'] === 'active' ? profile['purchaseref'] : profile['customerstatus'] === 'non active' ? profile['lastsubscribedpurchaseref'] : null;
          if(!purchaseRef) return
          const docRef = doc(this.firestore, "participantjourneyproduct" , purchaseRef.id);
          getDoc(docRef).then(snap => {
              const element = snap.data();
              let subscriptionend = element['subscriptionend'].toDate();
              console.log(subscriptionend);
              let newsubscriptionend = null;
              if (value.input.extendtype === 'duration') {
                console.log('log' , value.input.duration)
                newsubscriptionend = subscriptionend.setMonth(subscriptionend.getMonth() + value.input.duration);
              } else {
                const date = new Date(value.input.date);
                date.setHours(23,59,59,999);
                newsubscriptionend = date.getTime();
              }
              console.log(subscriptionend, new Date(newsubscriptionend));
              element['extendreason'] = value.input.reason
              let currentdate = new Date()
              let journeystatus = (new Date(newsubscriptionend) < currentdate) ? "completed" : "ongoing"
              let id = doc(collection(this.firestore, 'subscription extend log')).id;
              setDoc(doc(this.firestore, "subscription extend log", id), element)
              updateDoc(doc(this.firestore, "participantjourneyproduct", element['docid']), {
                subscriptionend: new Date(newsubscriptionend),
                extendreason: value.input.reason,
                journeystatus: journeystatus
              })
            
          })
        })
      }
    })
  }

  //send in app messages to selected participant
  sendNotificationinBreakthrough() {
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      data: this.selection.selected,
      width: "80vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(result, 'send app notificationssss');
      if (result != null && result != undefined) {
        var userID = [];
        var profileID = [];
        console.log(this.selection.selected, "this.selection.selected");
        // var unsentProfiles = [];
        for (let i = 0; i < this.selection.selected.length; i++) {
          const selected = this.selection.selected[i];
          if (selected["firebaseuserref"] != null) {
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
        this.authguard.saveNotificationRecord({
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

  //send Broadcast in support desk
  sendChatBroadcast() {
    let dialogRef = this.dialog.open(BroadcastComponent, {
      data: {},
      minWidth: "50vw",
      maxWidth: "70vw",
      disableClose: true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (this.selection.selected.length === 0 && result != null) {
        alert("Please Select Participants")
      } else if (result != null && result != undefined) {

        var check = confirm("Are you sure want to send out the Broadcast for the selected Participants")
        if (check) {
          var broadcast = result;
          var mapProfileUid = {};
          const batch = writeBatch(this.firestore);

          const profileDataCollRef = collection(this.firestore, "profile_data")
          await getDocs(profileDataCollRef).then((profiledoc) => {
            for (let i = 0; i < profiledoc.docs.length; i++) {
              const element = profiledoc.docs[i];
              if (element.data()['user_ref'] != null) {
                mapProfileUid[element.data()['profileid']] = element.data()['user_ref'].id
              }
            }
          });

          const broadCastAnalyticsId = doc(this.firestore, "broadcast_analytics").id
          setDoc(doc(this.firestore, "broadcast_analytics", broadCastAnalyticsId), {
            docid: broadCastAnalyticsId,
          })

          const setbatchArray = []
          setbatchArray.push(batch)
          let setoperationCounter = 0;
          let setbatchIndex = 0;

          const setbatchArray2 = []
          setbatchArray2.push(batch)
          let setoperationCounter2 = 0;
          let setbatchIndex2 = 0;

          const setbatchArray3 = []
          setbatchArray3.push(batch)
          let setoperationCounter3 = 0;
          let setbatchIndex3 = 0;

          for (let j = 0; j < this.selection.selected.length; j++) {
            const element = this.selection.selected[j];

            var docid = doc(this.firestore, "supportdesk", mapProfileUid[element['profileid']], "messages").id;
            var deskdocRef = doc(this.firestore, "supportdesk", mapProfileUid[element['profileid']])
            var deskmsgdocRef = doc(this.firestore, "supportdesk", mapProfileUid[element['profileid']], "messages", docid)
            var bap_docid = doc(this.firestore, "broadcast_participants").id;
            var bap_docref = doc(this.firestore, "broadcast_participants", bap_docid);

            var supportDesk = {
              email: element['email'],
              files: broadcast['files'],
              last_message: broadcast['body'],
              last_modification: new Date(),
              last_pending: ['user'],
              last_read_by: ['admin'],
              last_sender_uid: mapProfileUid[this.loggedInProfileId],
              uid: mapProfileUid[element['profileid']]
            }

            var supportDeskMessage = {
              files: broadcast['files'],
              buttonlink: broadcast['link'] ?? null,
              buttonname: broadcast['buttonname'] ?? null,
              // message:this.pipe.transform(broadcast['body'],this.mapProfile,element['profileid']),
              message: new MessagePipe().transform(broadcast['body'], this.mapProfile, element['profileid']),
              messageid: docid,
              pending: ['user'],
              read_by: ['admin'],
              sender_email: this.mapParticipantData[this.loggedInProfileId]['email'],
              sender_uid: mapProfileUid[this.loggedInProfileId],
              time: new Date(),
            }

            var broadcast_participants = {
              docid: bap_docid,
              profile_id: mapProfileUid[element['profileid']],
              profile_uid: mapProfileUid[element['profileid']],
              date: serverTimestamp(),
              broadcast_templateid: result['docid'],
              // broadcastid:ba_docid,
              broadcastname: result['broadcastname'],
            }

            setbatchArray[setbatchIndex].set(deskdocRef, supportDesk, { merge: true });
            setbatchArray2[setbatchIndex2].set(deskmsgdocRef, supportDeskMessage, { merge: true });
            setbatchArray3[setbatchIndex3].set(bap_docref, broadcast_participants, { merge: true });

            setoperationCounter++;
            setoperationCounter2++;
            setoperationCounter3++;

            if (setoperationCounter === 499) {
              setbatchArray.push(batch);
              setbatchIndex++;
              setoperationCounter = 0;
            }

            if (setoperationCounter2 === 499) {
              setbatchArray2.push(batch);
              setbatchIndex2++;
              setoperationCounter2 = 0;
            }

            if (setoperationCounter3 === 499) {
              setbatchArray3.push(batch);
              setbatchIndex3++;
              setoperationCounter3 = 0;
            }

          }

          setbatchArray.forEach(async batch => await batch.commit().then(() => {
            console.log("Broadcast sent supportDesk Successfully");
          }).catch((error) => {
            console.log("Error While sending supportDesk Broadcast", error);;
          }))

          setbatchArray2.forEach(async batch => await batch.commit().then(() => {
            console.log("Broadcast sent supportDesk Message Successfully");
          }).catch((error) => {
            console.log("Error While supportDesk Message Broadcast", error);;
          }))

          setbatchArray3.forEach(async batch => await batch.commit().then(() => {
            console.log("Broadcast Analytics Participants created Successfully");
          }).catch((error) => {
            console.log("Error While creating Broadcast Analytics Participants", error);;
          }))

        }

      }
    });

  }

  async onParticipantEvolution(selectedDoc: any) {
    // let listofprofileid = doc.map((e:any) => e['profileid'])
    let listofdocs = selectedDoc
    this.datatransferservice.setData(listofdocs, "participant-evolution-summary", 'evolutionSharedData')
  }

  sendInterimReport(profile) {
    console.log(profile)
    var profileid = profile.map(e => e["profileid"])
    var dialogRef = this.dialog.open(SendInterimReportComponent, {
      data: profileid,
      autoFocus: false,
      disableClose: true,
      maxHeight: "90vh",
      maxWidth: "90vw"
    });
  }

  sendEvolutionWishList(profile) {
    console.log(profile)
    var profileid = profile.map(e => e["profileid"])
    var dialogRef = this.dialog.open(EvolutionWishlistLogComponent, {
      data: profileid,
      autoFocus: false,
      // disableClose: true,
      maxHeight: "90vh",
      maxWidth: "90vw"
    });
  }

  //export 
  // exportExcel() {
  //   // Get filtered data from MatTableDataSource
  //   const rawData = this.dataSource.filteredData ?? this.dataSource.data;

  //   // Create formatted data for export
  //   const formattedData = rawData.map(element => {
  //     const formattedRow: any = {};

  //     // Process each column according to your display logic
  //     this.displayedColumns.forEach(column => {
  //       if (column === 'select') {
  //         // Skip checkbox column
  //         return;
  //       }

  //       // Handle date columns
  //       if (['subscriptionend', 'purchasedate', 'subscriptionstart', 'lastpaymentdate', 'lastsubscriptionstart', 'lastsubscriptionend', 'dateofbirth'].includes(column)) {
  //         formattedRow[column] = element[column] != null
  //           ? new Date(element[column].toDate()).toLocaleDateString('en-US', {
  //             year: 'numeric',
  //             month: 'short',
  //             day: 'numeric'
  //           })
  //           : null;
  //       }
  //       // Handle array columns that use mapfiltervalues
  //       else if (['consumedproducts', 'unconsumedproducts', 'activeproduct', 'addons', 'gifts', 'bonus', 'forms', 'reports', 'events', 'queue', 'tier', 'purchase', 'profiletags'].includes(column)) {
  //         if (element[column] && Array.isArray(element[column])) {
  //           formattedRow[column] = element[column]
  //             .map(value => this.mapfiltervalues[value] || value)
  //             .join(', ');
  //         } else {
  //           formattedRow[column] = '';
  //         }
  //       }
  //       // Handle mapped single values
  //       else if (['activejourney', 'lastcompletedjourney', 'lastsubscribedjourney', 'higherorderpurchase'].includes(column)) {
  //         formattedRow[column] = this.mapfiltervalues[element[column]] || element[column];
  //       }
  //       // Handle ATC model with filter logic
  //       else if (column === 'atcmodel') {
  //         formattedRow[column] = ![null, undefined].includes(this.filterdata['atcmodel'])
  //           ? this.filterAtcModel(element[column])
  //           : element[column];
  //       }
  //       // Handle product count (complex display logic)
  //       else if (column === 'productcount') {
  //         let productCountDisplay = '';
  //         if (this.filterdata['productcount'] != null) {
  //           if (this.filterdata['unconsumedproducts'] != null) {
  //             const filtered = this.filterproducts(element['unconsumedproducts'], this.filterdata['unconsumedproducts'][0]);
  //             const count = element['productcount'] ? element['productcount'][this.filterdata['unconsumedproducts'][0]] || 0 : 0;
  //             productCountDisplay = `${filtered}, ${count}`;
  //           }
  //           else if (this.filterdata['consumedproducts'] != null) {
  //             const filtered = this.filterproducts(element['consumedproducts'], this.filterdata['consumedproducts'][0]);
  //             const count = element['productcount'] ? element['productcount'][this.filterdata['consumedproducts'][0]] || 0 : 0;
  //             productCountDisplay = `${filtered}, ${count}`;
  //           }
  //           else if (this.filterdata['activeproduct'] != null) {
  //             const filtered = this.filterproducts(element['activeproduct'], this.filterdata['activeproduct'][0]);
  //             const count = element['productcount'] ? element['productcount'][this.filterdata['activeproduct'][0]] || 0 : 0;
  //             productCountDisplay = `${filtered}, ${count}`;
  //           }
  //         }
  //         formattedRow[column] = productCountDisplay;
  //       }
  //       // Handle product events
  //       else if (column === 'productevent') {
  //         if (this.filterdata['productevent'] != null && this.filterdata['products'] != null) {
  //           const productEvents = element[column] && element[column][this.filterdata['products']]
  //             ? element[column][this.filterdata['products']].join(', ')
  //             : '';
  //           formattedRow[column] = `${this.filterdata['products']}: ${productEvents}`;
  //         } else {
  //           // Handle key-value display
  //           let eventsList = '';
  //           if (element[column]) {
  //             Object.keys(element[column]).forEach(key => {
  //               const mappedKey = this.mapfiltervalues[key] || key;
  //               const mappedValue = this.mapfiltervalues[element[column][key]] || element[column][key];
  //               eventsList += `${mappedKey}: ${mappedValue}; `;
  //             });
  //           }
  //           formattedRow[column] = eventsList.trim();
  //         }
  //       }
  //       // Handle queue events (similar to product events)
  //       else if (column === 'queueevent') {
  //         if (this.filterdata['queueevent'] != null && this.filterdata['products'] != null) {
  //           const queueEvents = element[column] && element[column][this.filterdata['products']]
  //             ? element[column][this.filterdata['products']].join(', ')
  //             : '';
  //           formattedRow[column] = `${this.filterdata['products']}: ${queueEvents}`;
  //         } else {
  //           let eventsList = '';
  //           if (element[column]) {
  //             Object.keys(element[column]).forEach(key => {
  //               const mappedKey = this.mapfiltervalues[key] || key;
  //               const mappedValue = this.mapfiltervalues[element[column][key]] || element[column][key];
  //               eventsList += `${mappedKey}: ${mappedValue}; `;
  //             });
  //           }
  //           formattedRow[column] = eventsList.trim();
  //         }
  //       }
  //       // Handle content columns (eiflix, solarvoice, generalcontent)
  //       else if (['eiflix', 'solarvoice', 'generalcontent'].includes(column)) {
  //         let contentList = '';
  //         if (element[column]) {
  //           Object.keys(element[column]).forEach(key => {
  //             const mappedKey = this.mapPlaylist[key] || key;
  //             if (element[column][key] && Array.isArray(element[column][key])) {
  //               const mappedValues = element[column][key]
  //                 .map(item => this.mapPlaylist[item] || item)
  //                 .join(', ');
  //               contentList += `${mappedKey} - ${mappedValues}; `;
  //             }
  //           });
  //         }
  //         formattedRow[column] = contentList.trim();
  //       }
  //       // Handle remarks
  //       else if (column === 'remarks') {
  //         if (element[column] && Array.isArray(element[column])) {
  //           formattedRow[column] = element[column]
  //             .map(item => `${item.note} - ${this.mapParticipantName[item.givenby] || item.givenby}`)
  //             .join('; ');
  //         } else {
  //           formattedRow[column] = '';
  //         }
  //       }
  //       // Handle name column (remove the link, just show text)
  //       else if (column === 'name') {
  //         formattedRow[column] = element[column];
  //       }
  //       // Handle KYJ column (remove link, just show value)
  //       else if (column === 'kyj') {
  //         formattedRow[column] = element[column];
  //       }
  //       // Default case for other columns
  //       else {
  //         formattedRow[column] = element[column];
  //       }
  //     });

  //     return formattedRow;
  //   });

  //   // Convert formatted data to worksheet
  //   const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(formattedData);

  //   // Set date format for date columns in Excel
  //   const dateColumns = ['subscriptionend', 'purchasedate', 'subscriptionstart', 'lastpaymentdate', 'dateofbirth'];
  //   const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  //   for (let row = range.s.r + 1; row <= range.e.r; row++) {
  //     dateColumns.forEach(dateCol => {
  //       const colIndex = this.displayedColumns.indexOf(dateCol);
  //       if (colIndex !== -1) {
  //         const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIndex });
  //         if (ws[cellAddress] && ws[cellAddress].v instanceof Date) {
  //           ws[cellAddress].t = 'd'; // Set cell type to date
  //           ws[cellAddress].z = 'mm/dd/yyyy'; // Set date format
  //         }
  //       }
  //     });
  //   }

  //   // Create workbook
  //   const wb: XLSX.WorkBook = XLSX.utils.book_new();
  //   XLSX.utils.book_append_sheet(wb, ws, 'Participants');

  //   // Export with timestamp in filename
  //   const timestamp = new Date().toISOString().slice(0, 10);
  //   // XLSX.writeFile(wb, `participants_${timestamp}.xlsx`);
  // }

  exportExcel(selected = false) {
    // Get filtered data from MatTableDataSource
    const rawData = selected ? this.dataSource.data : (this.dataSource.filteredData ?? this.dataSource.data);

    const consumedColumns = this.consumedProducts.value.filter((p: any) => p.productId !== '' && p.productId !== null).map((p) => (`consumedcount-${p.productId}-${p.comparison}-${p.count}`));
    const unconsumedColumns = this.unconsumedProducts.value.filter((p: any) => p.productId !== '' && p.productId !== null).map((p) => (`unconsumedcount-${p.productId}-${p.comparison}-${p.count}`));
    const columns = [...this.displayedColumns, ...consumedColumns, ...unconsumedColumns];
    // Create formatted data for export
    const formattedData = [];
    for (let element of rawData) {

      if (selected && !this.selection.isSelected(element)) {
        continue
      }
      const formattedRow: any = {};

      // Process each column according to your display logic
      columns.forEach(column => {
        if (column === 'select') {
          // Skip checkbox column
          return;
        }

        // Handle date columns
        if (['subscriptionend', 'purchasedate', 'subscriptionstart', 'lastpaymentdate', 'lastsubscriptionstart', 'lastsubscriptionend', 'dateofbirth'].includes(column)) {
          formattedRow[column] = element[column] != null
            ? new Date(element[column].toDate()).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })
            : null;
        }
        // Handle array columns that use mapfiltervalues
        else if (['consumedproducts', 'unconsumedproducts', 'activeproduct', 'addons', 'gifts', 'bonus', 'forms', 'reports', 'events', 'queue', 'tier', 'purchase', 'profiletags'].includes(column)) {
          if (element[column] && Array.isArray(element[column])) {
            formattedRow[column] = element[column]
              .map(value => this.mapfiltervalues[value] || value)
              .join(', ');
          } else {
            formattedRow[column] = '';
          }
        }
        // Handle mapped single values
        else if (['activejourney', 'lastcompletedjourney', 'lastsubscribedjourney', 'higherorderpurchase'].includes(column)) {
          formattedRow[column] = this.mapfiltervalues[element[column]] || element[column];
        }
        // Handle ATC model with filter logic
        else if (column === 'atcmodel') {
          formattedRow[column] = ![null, undefined].includes(this.filterdata['atcmodel'])
            ? this.filterAtcModel(element[column])
            : element[column];
        }
        // Handle product count (complex display logic)
        else if (column === 'productcount') {
          let productCountDisplay = '';
          if (this.filterdata['productcount'] != null) {
            if (this.filterdata['unconsumedproducts'] != null) {
              const filtered = this.filterproducts(element['unconsumedproducts'], this.filterdata['unconsumedproducts'][0]);
              const count = element['productcount'] ? element['productcount'][this.filterdata['unconsumedproducts'][0]] || 0 : 0;
              productCountDisplay = `${filtered}, ${count}`;
            }
            else if (this.filterdata['consumedproducts'] != null) {
              const filtered = this.filterproducts(element['consumedproducts'], this.filterdata['consumedproducts'][0]);
              const count = element['productcount'] ? element['productcount'][this.filterdata['consumedproducts'][0]] || 0 : 0;
              productCountDisplay = `${filtered}, ${count}`;
            }
            else if (this.filterdata['activeproduct'] != null) {
              const filtered = this.filterproducts(element['activeproduct'], this.filterdata['activeproduct'][0]);
              const count = element['productcount'] ? element['productcount'][this.filterdata['activeproduct'][0]] || 0 : 0;
              productCountDisplay = `${filtered}, ${count}`;
            }
          }
          formattedRow[column] = productCountDisplay;
        }
        // Handle product events
        else if (column === 'productevent') {
          if (this.filterdata['productevent'] != null && this.filterdata['products'] != null) {
            const productEvents = element[column] && element[column][this.filterdata['products']]
              ? element[column][this.filterdata['products']].join(', ')
              : '';
            formattedRow[column] = `${this.filterdata['products']}: ${productEvents}`;
          } else {
            // Handle key-value display
            let eventsList = '';
            if (element[column]) {
              Object.keys(element[column]).forEach(key => {
                const mappedKey = this.mapfiltervalues[key] || key;
                const mappedValue = this.mapfiltervalues[element[column][key]] || element[column][key];
                eventsList += `${mappedKey}: ${mappedValue}; `;
              });
            }
            formattedRow[column] = eventsList.trim();
          }
        }
        // Handle queue events (similar to product events)
        else if (column === 'queueevent') {
          if (this.filterdata['queueevent'] != null && this.filterdata['products'] != null) {
            const queueEvents = element[column] && element[column][this.filterdata['products']]
              ? element[column][this.filterdata['products']].join(', ')
              : '';
            formattedRow[column] = `${this.filterdata['products']}: ${queueEvents}`;
          } else {
            let eventsList = '';
            if (element[column]) {
              Object.keys(element[column]).forEach(key => {
                const mappedKey = this.mapfiltervalues[key] || key;
                const mappedValue = this.mapfiltervalues[element[column][key]] || element[column][key];
                eventsList += `${mappedKey}: ${mappedValue}; `;
              });
            }
            formattedRow[column] = eventsList.trim();
          }
        }
        // Handle content columns (eiflix, solarvoice, generalcontent)
        else if (['eiflix', 'solarvoice', 'generalcontent'].includes(column)) {
          let contentList = '';
          if (element[column]) {
            Object.keys(element[column]).forEach(key => {
              const mappedKey = this.mapPlaylist[key] || key;
              if (element[column][key] && Array.isArray(element[column][key])) {
                const mappedValues = element[column][key]
                  .map(item => this.mapPlaylist[item] || item)
                  .join(', ');
                contentList += `${mappedKey} - ${mappedValues}; `;
              }
            });
          }
          formattedRow[column] = contentList.trim();
        }
        // Handle remarks
        else if (column === 'remarks') {
          if (element[column] && Array.isArray(element[column])) {
            formattedRow[column] = element[column]
              .map(item => `${item.note} - ${this.mapParticipantName[item.givenby] || item.givenby}`)
              .join('; ');
          } else {
            formattedRow[column] = '';
          }
        }
        // Handle name column (remove the link, just show text)
        else if (column === 'name') {
          formattedRow[column] = element[column];
        }
        // Handle KYJ column (remove link, just show value)
        else if (column === 'kyj') {
          formattedRow[column] = element[column];
        } else if (column === 'journey') {
          formattedRow[column] = this.getJourneyForParticipant(element);
        } else if (column === 'age') {
          formattedRow[column] = this.calculateAge(element['dateofbirth']);
        }
        else if (['consumedproductcount', 'unconsumedproductcount'].includes(column)) {
          const type = column === 'consumedproductcount' ? 'consumedCount' : 'unConsumedCount';
          for (let product of this.getProductForParticipant(element['profileid'], type)) {
            const header = `${column}( ${this.productMap[product.key]?.product} )`;
            formattedRow[header] = product?.count;
          }
        }
        else if (column.startsWith('consumedcount') || column.startsWith('unconsumedcount')) {
          const [type, productId, comparison, count] = column.split('-');
          const participant = this.participantProductMap[element['profileid']] || '';
          const header = `${type}( ${this.mapfiltervalues[productId]} )` || 'N/A';

          if (type === 'consumedcount') {
            formattedRow[header] = participant[productId]?.consumedCount;
          } else {
            formattedRow[header] = participant[productId]?.unConsumedCount;
          }
        } else if (this.computeColumns.includes(column)) {
          let value: any = 0;
          if (column === 'UP! count') {
            value = this.getUpLiveCount(element['profileid']);
          } else {
            value = this.getCPMCount(element['profileid']);
          }
          formattedRow[column] = value;
        } else if(column === 'emi status'){
          formattedRow[column] = element['financedata']?.paymentstatus;
        }
        // Default case for other columns
        else {
          formattedRow[column] = element[column];
        }
      });

      if (this.filterByProducts.consumed.length > 0) {
        formattedRow['consumed products'] = this.filterByProducts.consumed.map((p) => this.getProductString(p)).join(',');
      }

      if (this.filterByProducts.unconsumed.length > 0) {
        formattedRow['unconsumed products'] = this.filterByProducts.unconsumed.map((p) => this.getProductString(p)).join(',');
      }

      formattedData.push(formattedRow);
    };

    // Convert formatted data to worksheet
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(formattedData);

    // Set date format for date columns in Excel
    const dateColumns = ['subscriptionend', 'purchasedate', 'subscriptionstart', 'lastpaymentdate', 'dateofbirth'];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      dateColumns.forEach(dateCol => {
        const colIndex = this.displayedColumns.indexOf(dateCol);
        if (colIndex !== -1) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIndex });
          if (ws[cellAddress] && ws[cellAddress].v instanceof Date) {
            ws[cellAddress].t = 'd'; // Set cell type to date
            ws[cellAddress].z = 'mm/dd/yyyy'; // Set date format
          }
        }
      });
    }

    // Create workbook
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');

    // Export with timestamp in filename
    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `participants_${timestamp}.xlsx`);
  }

  exportContentConsumption() {
    console.log(this.dataSource.filteredData);
    let getProfiles = []
    let mapProfiles = {}
    for (let i = 0; i < this.dataSource.filteredData.length; i++) {
      const element = this.dataSource.filteredData[i];
      getProfiles.push(element['profileid'])
      mapProfiles[element['profileid']] = element
    }
    //query
    let contentdata = []
    const collRef = collection(this.firestore, "content analytics")
    getDocs(collRef).then(snap => {
      contentdata = snap.docs.map(e => e.data())
      let filterdata = []
      filterdata = contentdata.filter(e => {
        if (getProfiles.includes(e['profileid'])) {
          e['name'] = mapProfiles[e['profileid']]['name']
          return e
        }
      })
      let headers = []
      let data = []
      if (filterdata.length != 0) {
        for (const key in filterdata[0]) {
          { headers.push(key) }
        }
        for (let i = 0; i < filterdata.length; i++) {
          let element = filterdata[i]
          data[i] = []
          for (let j = 0; j < headers.length; j++) {
            const headerElement = headers[j];
            data[i].push(element[headerElement])
          }
        }
      }
      // console.log(headers);
      // console.log(data);
      const csvContent = headers.join(',') + '\n' + data.map(row => row.join(',')).join('\n');
      // console.log(csvContent);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      // saveAs.saveAs(blob, 'biganalytics.csv');
    })
  }

  // import

  handleImportClick() {
    const sampleDownload = confirm('Do you want to download sample Import Excel');
    if (sampleDownload) {
      const data = [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' },
        { name: 'surya', email: 'surya.thiruvengadam@soexcellence.com' }
      ];

      const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);

      const workbook: XLSX.WorkBook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample');

      XLSX.writeFile(workbook, 'sample_format.xlsx');
      return
    }
    this.inputFile.nativeElement.click();
  }
  onChange(evt: Event) {
    const target = evt.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) return;

    this.isExcelFile = /\.(xls|xlsx)$/i.test(file.name);

    if (!this.isExcelFile) {
      this.inputFile.nativeElement.value = '';
      console.log("Invalid file type. Please upload an Excel file.");
      return;
    }

    if (target.files.length > 1) {
      this.inputFile.nativeElement.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;

      try {
        const wb: XLSX.WorkBook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

        const wsname: string = wb.SheetNames[0];
        const ws: XLSX.WorkSheet = wb.Sheets[wsname];

        const data = XLSX.utils.sheet_to_json(ws);

        console.log("Imported List", data.length)

        data
          // .filter((e: any) => this.emailList.includes(e.email))
          .forEach((g: any) => {
            const matched = this.dataSource.data.find((e) => e['email'] === g['email']);
            console.log(matched, 'matchd');

            if (matched) {
              this.selection.toggle(matched);
            }
            else {
              console.log("Unmatched", g["email"])
            }
          });

      } catch (error) {
        console.error("Error processing file:", error);
      }
    };

    this.inputFile.nativeElement.value = '';
    reader.readAsArrayBuffer(file);
  }

  // checklists
  navigateTochecklists(type) {
    if (type === 'higherorderpurchase') {
      // const data = this.dashboardEntireData.filter(e => ['active' , 'non active' , 'discontinued'].includes(e['customerstatus']));
      // let higherorderpurchaseData = data.map(e =>({
      //   name : e['name'],
      //   journey : e['customerstatus'] === 'active' ? e['activejourney'] != e['higherorderpurchase'] :
      // }))
      let higherorderpurchaseData = [];

      for(let metadata of this.dashboardEntireData){
        const customerStatus = metadata['customerstatus'];
        if(!['active' , 'non active'].includes(customerStatus)){
          continue
        }

        if(customerStatus === 'active' && metadata['activejourney'] != metadata['higherorderpurchase']){
          higherorderpurchaseData.push({
            name : metadata['name'],
            journey : metadata['activejourney'],
            higherorderpurchase : metadata['higherorderpurchase'],
            customerstatus : customerStatus
          })
        } else if(customerStatus === 'non active'  && metadata['lastcompletedjourney'] != metadata['higherorderpurchase'] ){
          higherorderpurchaseData.push({
            name : metadata['name'],
            journey : metadata['lastcompletedjourney'],
            higherorderpurchase : metadata['higherorderpurchase'],
            customerstatus : customerStatus
          })
        }
      }

      console.log(higherorderpurchaseData)
      const dialogRef = this.dialog.open(ParticipantsChecklistsComponent, {
        width: '90vw',
        height: '80vh',
        maxWidth: '1200px',
        data: {
          type: type,
          checklistData: higherorderpurchaseData,
          columns: [
            { key: 'name', header: 'Name' },
            { key: 'journey', header: 'Journey' },
            { key: 'higherorderpurchase', header: 'Higher Order Purchase' },
            { key: 'customerstatus', header: 'Customer Status' }
          ]
        }
      })

      // Handle dialog result if needed
      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          console.log('Dialog closed with result:', result);
        }
      });
    } else if (type === 'watsonstatus') {
      let data = this.dashboardEntireData.filter(p => ['late', 'banned', 'discontinued'].includes(p?.customerstatus) && p?.customerstatus !== p.financialstatus)
      const dialogRef = this.dialog.open(ParticipantsChecklistsComponent, {
        width: '90vw',
        height: '80vh',
        maxWidth: '1200px',
        data: {
          type: type,
          checklistData: data,
          columns: [
            { key: 'name', header: 'Name' },
            { key: 'customerstatus', header: 'Star Labs' },
            { key: 'financialstatus', header: 'Watson' }
          ]
        }
      })

      // Handle dialog result if needed
      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          console.log('Dialog closed with result:', result);
        }
      });
    }
  }

  // function to patch participant with no customer status
  patchCustomerStatus() {
    this.onformreset();
    this.selection.clear();
    const participants = this.dataSource.data.filter((p: any) => [null, undefined, ''].includes(p?.customerstatus));
    this.selection.select(...participants);
    this.dataSource.data = participants;
  }

  // function to clear participant with no customer status active option
  clearCustomerStatus() {
    this.selection.clear();
    this.onDataSearch();
  }

  openWatsonCustomerStatus() {

  }

  // Function to add products to participant Journey 
  bulkAddProducts() {
    this.dialog.open(BulkAddProductsComponent, {
      data: this.selection.selected
    })
  }

  // Function to tag participants 
  tagParticipants() {
    this.dialog.open(TagParticipantsComponent, {
      data: {
        data: this.selection.selected,
        tagList: this.tagList,
        mapfilter: this.mapfiltervalues,
        loggedInprofileid: this.loggedInProfileId
      }
    })
  }

  getTagsAdded(current: any, previous: any): string[] {
    const curr = current.profiletags || [];
    const prev = previous.profiletags || [];
    return curr.filter((t: string) => !prev.includes(t));
  }

  getTagsRemoved(current: any, previous: any): string[] {
    const curr = current.profiletags || [];
    const prev = previous.profiletags || [];
    return prev.filter((t: string) => !curr.includes(t));
  }

  openTagHistory(event: MouseEvent, element: any) {
    event.stopPropagation();
    event.preventDefault();

    runInInjectionContext(this.injector, () => {
      const versionsRef = collection(this.firestore, 'participant tag logs');
      const q = query(
        versionsRef,
        where('profileid', '==', element['profileid'])
      );

      collectionData(q).pipe(takeUntil(this.destroy$)).subscribe(snap => {
        console.log(snap.length)
        const versions = snap;
        versions.sort((a, b) => {
          const aTime = a['updated']?.toMillis?.() ?? 0;
          const bTime = b['updated']?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
        this.selectedTagHistory = versions;
        this.selectedTagHistoryName = element['name'];
        this.showTagHistory = true;
      })
    });
  }

  closeTagHistory() {
    this.showTagHistory = false;
    this.selectedTagHistory = [];
    this.selectedTagHistoryName = '';
  }

  // Function to export with fiiters 
  exportWithFilters() {
    const participants = this.filteredDataWithoutProductFilter;

    this.dialog.open(ExportWithFiltersComponent, {
      data: {
        consumed: this.filterByProducts.consumed,
        unconsumed: this.filterByProducts.unconsumed,
        participants,
        productsFilteredData: Object.values(this.filterByProducts.participants),
        rawProductsData: this.filterByProducts.rawProductsData
      }
    }).afterClosed().subscribe((data) => {
      if (data) {
        this.filterByProducts = data;
        this.onDataSearch();
      }
    })
  }

  addSegments() {
    const dialogRef = this.dialog.open(CreateSegmentsDialogComponent, {
      width: '80vw',
      height: '85vh',
      data: {},
      disableClose: false
    });
  }
  private readonly WHATSAPP_CHUNK_SIZE = 200;
  private readonly CHUNK_DELAY_MS = 1000;

  sendWattiWorkshop() {
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'whatsapp', selectedprofiles: this.selection.selected }
    });
    ref.afterClosed().subscribe(async (result) => {
      await this.workshopmessageChunked(result);
    });
  }

  async workshopmessageChunked(result: any) {
    if (result?.action !== 'sent' || result.type !== 'whatsapp') {
      if (result?.action === 'sent' && result.type === 'mail') {
        alert("Only Whatsapp");
      }
      return;
    }
    console.log(this.selection.selected, 'WhatsApp participants');
    console.log('WhatsApp message:', result);
    const { templateName, customParams } = result;
    const participants = this.selection.selected
      .filter(metadata => metadata && metadata['phonenumber'] && metadata['name'])
      .map(metadata => {
        const name = metadata['name'];
        let cc = metadata['countryCode'] || metadata['countrycode'] || '';
        cc = cc.trim();
        if (cc && !cc.startsWith('+')) {
          cc = '+' + cc;
        }
        let phone = metadata['phonenumber']?.toString().trim() || '';
        phone = phone.replace(/^\+/, '');
        const phonenumber = cc ? `${cc}${phone}` : phone;

        const processedParams = customParams.map((param: any) => ({
          name: param.name,
          value: param.value.replace(/\{\{name\}\}/g, name)
        }));

        return {
          phonenumber,
          name,
          customParams: processedParams
        };
      });

    if (participants.length === 0) {
      this.openSnackBar('No valid participants found', 'OK');
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
    const url = this.getWhatsAppFunctionUrl();
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
  private getWhatsAppFunctionUrl(): string {
    if (environment.firebase.projectId === 'test-environment-841c3') {
      return 'https://us-central1-test-environment-841c3.cloudfunctions.net/workshopprogressmessage';
    } else if (environment.firebase.projectId === 'starlabs-test') {
      return 'https://us-central1-starlabs-test.cloudfunctions.net/workshopprogressmessage';
    } else if (environment.firebase.projectId === 'fir-sample-aae4a') {
      return 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage';
    }
    return '';
  }

  // sendWattiWorkshop(){
  //   const ref = this.dialog.open(SendmessagesComponent, {
  //     width: '1000px',
  //     maxWidth: '95vw',
  //     maxHeight: '90vh',
  //     data: { type: 'whatsapp',selectedprofiles:this.selection.selected }
  //   });
  //   ref.afterClosed().subscribe(async (result) => {
  //     await this.workshopmessage(result);
  //   });
  // }
  private async workshopmessage(result: any) {
    if (result?.action === 'sent') {
      if (result.type === 'mail') {
        alert("Only Whatsapp");
      } else if (result.type === 'whatsapp') {
        console.log(this.selection.selected, 'WhatsApp participants');
        console.log('WhatsApp message:', result);
        const { templateName, customParams } = result;
        const participants = this.selection.selected
          .filter(metadata => metadata && metadata['phonenumber'] && metadata['name'])
          .map(metadata => {
            // const phonenumber = metadata['phonenumber'];
            const name = metadata['name'];
            let cc = metadata['countryCode'] || metadata['countrycode'] || '';
            cc = cc.trim();
            if (cc && !cc.startsWith('+')) {
              cc = '+' + cc;
            }
            let phone = metadata['phonenumber']?.toString().trim() || '';
            phone = phone.replace(/^\+/, '');
            const phonenumber = cc ? `${cc}${phone}` : phone;

            const processedParams = customParams.map((param: any) => ({
              name: param.name,
              value: param.value.replace(/\{\{name\}\}/g, name)
            }));
            console.log(
              phonenumber, "conslingggg fullnum"
            );
            return {
              phonenumber,
              name,
              customParams: processedParams
            };

          });

        if (participants.length === 0) {
          this.openSnackBar('No valid participants found', 'OK');
          return;
        }
        const bulkPayload = {
          type: 'whatsapp',
          templateName,
          participants
        };
        let url: string = '';
        if (environment.firebase.projectId === 'test-environment-841c3') {
          console.log('Test Env 1');
          url = 'https://us-central1-test-environment-841c3.cloudfunctions.net/workshopprogressmessage';
        } else if (environment.firebase.projectId === 'starlabs-test') {
          console.log('Test Env 2');
          url = 'https://us-central1-starlabs-test.cloudfunctions.net/workshopprogressmessage';
        } else if (environment.firebase.projectId === 'fir-sample-aae4a') {
          console.log('Production Env');
          url = 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage';
        }

        try {
          const response = await firstValueFrom(
            this.http.post(url, bulkPayload, { responseType: 'json' })
          );
          console.log('Bulk send response:', response);
          const result = response as any;
          const successfulSends = result.successCount || 0;
          const failedSends = result.failureCount || 0;
          const totalParticipants = participants.length;
          const broadcastName = result.broadcastName || '';
          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `WhatsApp broadcast "${broadcastName}" sent successfully to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Broadcast "${broadcastName}": Sent to ${successfulSends} participants. Failed: ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send messages`;
          }

          this.openSnackBar(snackBarMessage, "OK");

        } catch (error) {
          console.error('Failed to send bulk messages:', error);
          this.openSnackBar('Failed to send bulk messages', 'OK');
        }
      }
    } else if (result?.action === 'closed') {
      console.log('closed');
    }
  }

  addBulkActionPending() {
    const selectedParticipants = this.selection.selected.map((e) => e['profileid']);
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

  getProductString(product: any) {
    if (!product) return '';

    let comparison = product?.comparison;

    if (comparison == 'equalto') {
      comparison = 'Equal To';
    } else if (comparison == 'gtoreqto') {
      comparison = 'Greater than or Equal To';
    } else if (comparison == 'lsoreqto') {
      comparison = 'Less than or Equal To';
    }

    return `${this.productMap[product?.productId]?.product} ${comparison} ${product?.count}`;
  }

  unSelectConsumedProduct(productId: string) {
    const data = Object.assign({}, this.filterByProducts);
    data.consumed = data.consumed.filter((p) => p.productId !== productId);
    this.filterProductsFromFilters(data)
    this.onDataSearch();
  }

  unSelectUnconsumedProduct(productId: string) {
    const data = Object.assign({}, this.filterByProducts);
    data.unconsumed = data.unconsumed.filter((p) => p.productId !== productId);
    this.filterProductsFromFilters(data)
    this.onDataSearch();
  }

  filterProductsFromFilters(data: any) {
    const consumed = data.consumed;
    const unconsumed = data.unconsumed;
    const participants = {};
    if (data?.rawProductsData) {
      data?.rawProductsData.forEach((p) => {
        let matchesConsumed = consumed.length === 0;
        let matchesUnconsumed = unconsumed.length === 0;

        if (consumed.length > 0) {
          matchesConsumed = consumed.every(filter => {
            const productData = p.products[filter.productId];

            if (!productData) return false;

            if (filter.comparison === 'equalto') {
              return productData.consumedCount == filter.count;
            } else if (filter.comparison === 'groreqto') {
              return productData.consumedCount >= filter.count;
            } else if (filter.comparison === 'lsoreqto') {
              return productData.consumedCount <= filter.count;
            }
            return productData.consumedCount == filter.count;
          });
        }

        // Check unconsumed filters (only if unconsumed filters exist)
        if (unconsumed.length > 0) {
          matchesUnconsumed = unconsumed.every(filter => {
            const productData = p.products[filter.productId];
            if (!productData) return false;

            if (filter.comparison === 'equalto') {
              return productData.unConsumedCount == filter.count;
            } else if (filter.comparison === 'groreqto') {
              return productData.unConsumedCount >= filter.count;
            } else if (filter.comparison === 'lsoreqto') {
              return productData.unConsumedCount <= filter.count;
            }

            return productData.unConsumedCount == filter.count;
          });
        }

        if (matchesConsumed && matchesUnconsumed) {
          participants[p['profileId']] = p;
        }
      })
    }
    data.participants = participants;
    this.filterByProducts = data;
  }

  openModal() {
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('backdrop')) {
      this.closeModal();
    }
  }

  clearField() {
    this.filterdata['label'] = '';
  }

  calculateAge(d: any) {
    const date = d?.toDate ? d.toDate() : d;
    const currentDate: Date = new Date();
    currentDate.setHours(0, 0, 0, 0);
    if (!date?.toDateString) {
      return ''
    }
    const age = (currentDate.getFullYear() - date.getFullYear()) - 1;
    date.setFullYear(currentDate.getFullYear());
    console.log(date, currentDate)
    return date <= currentDate ? age + 1 : age;
  }

  getUpLiveCount(profileId : string) : number | string{
    if([null , undefined , ''].includes(profileId) || !this.participantProductMap[profileId]){
      return 0;
    }

    return ['0ayiNALL1HDVvCXDHcZ4' , 'N0MhGQnxP9S8TdavuRJR' , 'Rq9cu2Z3FSuILXdwYtca'].reduce((total , productId)=>{
      const count =  this.participantProductMap[profileId][productId]?.consumedCount || 0;
      return total + count;
    } , 0);
  }

  getCPMCount(profileId : string) : number | string{
    if([null , undefined , ''].includes(profileId) || !this.participantProductMap[profileId]){
      return 0;
    }

    return ['AED3TRIhKpyCtIWQvQMc' , 'TnlqL6gUvDSx105YIPC5' , 'TxnrP4kevFZCPHFtxj7Z' , 'ZvANGjeQnKeIbGXiY0un'].reduce((total , productId)=>{
      const count =  this.participantProductMap[profileId][productId]?.consumedCount || 0;
      return total + count;
    } , 0);
  }

  getJourneyForParticipant(metadata){
    const customerStatus = metadata['customerstatus'] ?? null;
    
    if (customerStatus === 'active') {
      return this.mapfiltervalues[metadata['activejourney']];
    } else if (customerStatus === 'non active') {
      return this.mapfiltervalues[metadata['lastcompletedjourney']];
    } else if (customerStatus === 'discontinued') {
      return this.mapfiltervalues[metadata['lastsubscribedjourney']];
    } 
    return ''
  }


  async openCheckListForQueueEvent(){
    let loadingref = this.loading
    const data = [];
    const queueTokenSnapMap = {};

    const queueRef = collection(this.firestore, 'queue_token');
    const q = query(queueRef,
      where("tokenstatus", "==", "Active"),
      where("stagestatus", "==", "Approved"),
      where("currentstage", "==", "Completed"))

    const queueTokenSnap = await getDocs(q);


    for(let doc of queueTokenSnap.docs){
      const data = doc.data();
      const profileid = data['profile_id'];
      if(![null , undefined , ''].includes(data['profile_id'])){
        queueTokenSnapMap[profileid] = queueTokenSnapMap[profileid] ?? [];
        queueTokenSnapMap[profileid].push(data);
      }
    }

    for (const metadata of this.dashboardEntireData) {
      const profileid = metadata.profileid;

      if ([null, undefined, ""].includes(profileid)) {
        console.log("Metadata not found for", metadata);
        continue;
      }

      const queueToken = queueTokenSnapMap[profileid] ?? [];

      metadata["queueevent"] =
        metadata["queueevent"] || {};

      var profileQueueAttended = {};
      for (let i = 0; i < queueToken.length; i++) {
        const attendedData = queueToken[i];
        profileQueueAttended[attendedData["productref"].id] = profileQueueAttended[attendedData["productref"].id] || [];
        profileQueueAttended[attendedData["productref"].id].push( attendedData["queueref"].id, );
      }

      let queue = '';

      Object.entries(profileQueueAttended).forEach(([key , value])=>{
        const product = this.mapfiltervalues[key] ?? '';
        // console.log(this.mapfiltervalues[(value as []).at(0)])
        const queues = (value as []).map((queue)=>this.mapfiltervalues[queue]).toString();
        queue += `${product} : ${queues}\n`
      })

      data.push({
        name: metadata.name ?? '',
        email: metadata.email ?? '',
        queueevent: queue,
      });
    }
    loadingref.close()
    const dialogRef = this.dialog.open(ParticipantsChecklistsComponent, {
        width: '90vw',
        height: '80vh',
        maxWidth: '1200px',
        data: {
          type: 'Participant Queue Event Details',
          checklistData: data,
          columns: [
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 'queueevent', header: 'Queue Event' },
          ]
        }
      })

      // Handle dialog result if needed
      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          console.log('Dialog closed with result:', result);
        }
      });
  }

   async openCheckListForHigherOrderPurchase(){
    let loadingref = this.loading
    const data = [];
    const participantJourneyProductSnapMap = {};

    const q = query(collection(this.firestore , 'participantjourneyproduct'));
    const participantJourneyProductSnap = await getDocs(q);

    for(let doc of participantJourneyProductSnap.docs){
      const data = doc.data();
      const profileid = data['profileid'];
      if(![null , undefined , ''].includes(data['profileid'])){
        participantJourneyProductSnapMap[profileid] = participantJourneyProductSnapMap[profileid] ?? [];
        participantJourneyProductSnapMap[profileid].push(data);
      }
    }

    for (const metadata of this.dashboardEntireData) {
      const profileid = metadata.profileid;

      if ([null, undefined, ""].includes(profileid)) {
        console.log("No Profile id : ", metadata['name']);
        continue;
      }
      
      let higherOrderPurchase = null;
      var liveJourney = null;

      var journeyProductProfile = participantJourneyProductSnapMap[profileid] ?? [];

      var activeJourneyList = journeyProductProfile.filter(
        (e) =>
          [null, "initiated", "ongoing", "completed"].includes(
            e["journeystatus"],
          ) && ![null, undefined, ""].includes(e["journeyref"]),
      );

      if (activeJourneyList.length != 0) {
        var ongoingJourney = [];
        var completedjourney = [];
        activeJourneyList.forEach((journeyElement) => {
          if (
            [null, "initiated", "ongoing"].includes(
              journeyElement["journeystatus"],
            )
          ) {
            ongoingJourney.push(journeyElement);
          } else if (journeyElement["journeystatus"] == "completed") {
            completedjourney.push(journeyElement);
          }
        });

        if (completedjourney.length != 0) {
          if (ongoingJourney.length == 0) {
            liveJourney = completedjourney[0];
          }
        }

        if (ongoingJourney.length != 0) {
          ongoingJourney = ongoingJourney.sort(
            (a, b) =>
              b["subscriptionend"].toDate() - a["subscriptionend"].toDate(),
          );
          var currentOngoing = ongoingJourney.find(
            (e) => e["journeystatus"] == "ongoing",
          );
          var currentInitiated = ongoingJourney.find(
            (e) => e["journeystatus"] == "initiated",
          );
          if (![null, undefined].includes(currentOngoing)) {
            liveJourney = currentOngoing;
          } else if (![null, undefined].includes(currentInitiated)) {
            liveJourney = currentInitiated;
          } else {
            liveJourney = ongoingJourney[0];
          }
        }

        higherOrderPurchase = activeJourneyList.reduce(
          (higherOrderJourney, currentJourney) => {
            if (
              ![null, undefined].includes(
                this.mapfiltervalues[currentJourney["journeyref"].id],
              ) &&
              ![null, undefined].includes(
                this.mapfiltervalues[higherOrderJourney["journeyref"].id],
              ) &&
              ![null, undefined].includes(
                this.mapfiltervalues[currentJourney["journeyref"].id]["sequence"],
              ) &&
              ![null, undefined].includes(
                this.mapfiltervalues[higherOrderJourney["journeyref"].id]["sequence"],
              )
            ) {
              return this.mapfiltervalues[currentJourney["journeyref"].id]["sequence"] <
                this.mapfiltervalues[higherOrderJourney["journeyref"].id]["sequence"]
                ? currentJourney
                : higherOrderJourney;
            }
            else if (![null, undefined].includes(
              this.mapfiltervalues[higherOrderJourney["journeyref"].id],
            ) && ![null, undefined].includes(
              this.mapfiltervalues[higherOrderJourney["journeyref"].id]["sequence"],
            )) {
              return higherOrderJourney
            } else {
              return currentJourney;
            }
          },
        );
      }
      let higherOrderPurchaseJourney = ![null, undefined].includes(
        higherOrderPurchase,
      )
        ? higherOrderPurchase["journeyref"].id
        : null;

      data.push({
        name: metadata["name"],
        email: metadata["email"],
        higherorderpurchase: higherOrderPurchaseJourney,
      });
    }
    loadingref.close()
    const dialogRef = this.dialog.open(ParticipantsChecklistsComponent, {
        width: '90vw',
        height: '80vh',
        maxWidth: '1200px',
        data: {
          type: 'Participant Queue Event Details',
          checklistData: data,
          columns: [
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 'higherorderpurchase', header: 'Higher Order Purchase' },
          ]
        }
      })

      // Handle dialog result if needed
      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          console.log('Dialog closed with result:', result);
        }
      });
  }


  // rawProductsData

  // private async workshopmessage(result: any) {
  //   if (result?.action === 'sent') {
  //     if (result.type === 'mail') {
  //       alert("Only Whatsapp")
  //     } else if (result.type === 'whatsapp') {
  //       console.log(this.selection.selected, 'WhatsApp participants');
  //       console.log('WhatsApp message:', result);

  //       const { templateName, customParams } = result;

  //       let successfulSends = 0;
  //       let failedSends = 0;

  //       for (let i = 0; i < this.selection.selected.length; i++) {
  //         const metadata = this.selection.selected[i];
  //         if (!metadata) continue;

  //         const phonenumber = metadata['phonenumber'];
  //         const name = metadata['name'];

  //         if (!phonenumber || !name) continue;
  //         const processedParams = customParams.map((param: any) => {
  //           return {
  //             name: param.name,
  //             value: param.value.replace(/\{\{name\}\}/g, name)
  //           };
  //         });

  //         const payload = { 
  //           type: 'whatsapp',
  //           phonenumber, 
  //           name,
  //           templateName,
  //           customParams: processedParams
  //         };

  //         let url: string = '';

  //         if (environment.firebase.projectId === 'test-environment-841c3') {
  //           console.log('Test Env 1');
  //           url = 'https://us-central1-test-environment-841c3.cloudfunctions.net/workshopprogressmessage';
  //         } else if (environment.firebase.projectId === 'starlabs-test') {
  //           console.log('Test Env 2');
  //           url = 'https://us-central1-starlabs-test.cloudfunctions.net/workshopprogressmessage';
  //         } else if (
  //           environment.firebase.projectId === 'fir-sample-aae4a'
  //         ) {
  //           console.log('Production Env');
  //           url = 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/workshopprogressmessage';
  //         }

  //         try {
  //           const response = await firstValueFrom(
  //             this.http.post(url, payload, { responseType: 'text' })
  //           );
  //           console.log(`sent to ${name} (${phonenumber}):`, response);
  //           successfulSends++;
  //         } catch (error) {
  //           console.error(`Failed to ${phonenumber}:`, error);
  //           failedSends++; 
  //         }
  //       }

  //       const totalParticipants = this.selection.selected.length;
  //       let snackBarMessage = '';

  //       if (successfulSends === totalParticipants) {
  //         snackBarMessage = `WhatsApp message successfully sent to all ${totalParticipants} participants!`;
  //       } else if (successfulSends > 0) {
  //         snackBarMessage = `Sent to ${successfulSends} participants. Failed to send to ${failedSends}.`;
  //       } else {
  //         snackBarMessage = `failed to send...`;
  //       }
  //       this.openSnackBar(snackBarMessage, "OK");
  //     }
  //   } else if (result?.action === 'closed') {
  //     console.log('closed');
  //   }
  // }
}


// listofcities:any [] = []
// paymentplanlist:any [] = []
// countrylist:any [] = []
// sourcelist:any [] = []
// contractlist:any [] = []
// emistatuslist:any [] = []

// classify
// const classifyCollRef = collection(this.firestore,"classify")
// getDocs(classifyCollRef).then(snap => {
//   for (const element of snap.docs) {
//     if(element.id === "cities") this.listofcities = element.data()['names']
//     else if(element.id === "paymentplan") this.paymentplanlist = element.data()['names']
//     else if(element.id === "country") this.countrylist = element.data()['names']
//     else if(element.id === "originalsource") this.sourcelist = element.data()['names']
//     else if(element.id === "contract") this.contractlist = element.data()['names']
//     else if(element.id === "emistatus") this.emistatuslist = element.data()['names']
//   }
// })