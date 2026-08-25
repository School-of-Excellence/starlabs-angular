import { CommonModule, DatePipe } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormGroup, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import * as XLSX from 'xlsx';
import { ReleaselogdialogComponent } from '../releaselogdialog/releaselogdialog.component';
import { AddIssueComponent } from '../add-issue/add-issue.component';
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { FlagReviewScreenComponent } from "../flag-review-screen/flag-review-screen.component";
import { CustomerChatScreenComponent } from "../customer-chat-screen/customer-chat-screen.component";
import { ChatConfigComponent } from '../chat-config/chat-config.component';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import html2canvas from 'html2canvas';

@Component({
  selector: 'app-customer-support-dashboard',
  imports: [
    MatProgressSpinnerModule,
    MatTabsModule,
    CommonModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatDividerModule,
    FormsModule,
    CommonModule,
    MatSelectModule,
    ReactiveFormsModule,
    NgxMatSelectSearchModule,
    MatDatepickerModule,
    MatMenuModule,
    FlagReviewScreenComponent,
    CustomerChatScreenComponent,
    ProfilePictureComponent
  ],
  templateUrl: './customer-support-dashboard.component.html',
  styleUrl: './customer-support-dashboard.component.css'
})
export class CustomerSupportDashboardComponent {

  // Decorators declarations
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;
  @ViewChild('menuTrigger') menuTrigger!: MatMenuTrigger;
  @ViewChild('tableContainer') tableContainer!: ElementRef;
  private savedScrollPosition: number = 0;

  // Array declarations
  clientIssues = [];
  tempIssues = [];
  journeyList = [];
  categories = [];
  validators = [];
  chatadminUsers = [];
  statuslist = [];
  ticketArray = [];
  negligencelist = [];
  severityList = ["Urgent", "Escalation", "Important", "Normal", "Critical", "Emergency"];

  // String declarations
  chatAdmin: string = "";
  profile_id: string = "";
  profile_email: string = "";
  filteredJourney: string = "";
  filteredMember: string = "";
  filteredReviewed: string = "";
  filteredCategory: string = "";
  viewOfCases: any;
  sortColumn: string = "";
  sortOrder: string = "";
  clickedFilter: string = "";
  tableView: any;
  flagseverity: string = "";

  // Object declarations
  mapProfileData = {};
  mapUserId = {};
  mapJourney = {};
  filterMap = {};
  categoryCountMap = {};
  loginRoles = {};
  chatConfigData = {};

  // Numeric declarations
  totaltickets = 0;
  newtickets = 0;
  opentickets = 0;
  closetickets = 0;
  respondedtickets = 0;
  pendingtickets = 0;
  flagtickets = 0;
  reviewpending = 0;
  reviewmarked = 0;
  grosstickets = 0;
  hightickets = 0;
  moderatetickets = 0;
  lowtickets = 0;
  notickets = 0;
  selectedTabIndex = 0;
  recentTicketNumber = 0;
  scrollAmount: number = 50;
  weekNumber!: number;
  weekYear!: number;

  // Boolean declarations
  open: boolean = true;
  loading: boolean = true;
  viewCalender: boolean = false;

  // date declarations
  currentdate = new Date();

  // null declarations 
  currentIssueData: any = null;
  popupData: any = null;
  assignData: any = null;
  selectedElementForFlag: any = null;
  currentPage;
  itemsPerPage;
  weekDate;

  filterform!: FormGroup;
  private subscription = new Subject<void>();

  reportData: any[] = [];
  allCategories: string[] = [];
  selectedCategories: string[] = [];
  showCategoryDialog = false;
  today = new Date();

  constructor(
    private formbuilder: FormBuilder,
    private datePipe: DatePipe,
    public authservice: AuthguardService,
    private firestore: Firestore,
    private snackbar: MatSnackBar,
    private dialog: MatDialog,
    public router: Router,
    private dateAdapter: DateAdapter<Date>
  ) {
    this.filterform = this.formbuilder.group({
      search: ['',],
      journey: [[],],
      status: ['',],
      category: [[],],
      assign: [[],],
      flag: [false,],
      peopleinvolved: [[],],
      chatstatus: ['',],
      priority: [[],],
      ticketstart: ['',],
      ticketend: ['',],
      closedstart: ['',],
      closedend: ['',],
      review: ['',],
      mandatereview: ['',],
      metrics: ['',],
      reviewedby: [[],]
    });
    // get role of login profile 
    authservice.getRoles().then(async (roles) => {
      this.chatAdmin = roles['chatxadmin'] ?? false
      this.loginRoles = roles;
      this.profile_id = roles['profile_ref'].id ?? null
      this.profile_email = authservice.email

      // if the login user have chat admin role 
      // if (this.chatAdmin) {
      this.configureDateAdapter();
      this.weekDate = this.currentdate;

      // const profileData = await this.authservice.getProfileMap();
      // const profileDataNew = await this.authservice.getProfileMapNewUser();
      // this.mapProfileData = profileData.docdata;
      // this.mapUserId = profileData.mapUserId;
      const [profileData, profileDataNew] = await Promise.all([
        this.authservice.getProfileMap(),
        this.authservice.getProfileMapNewUser()
      ]);
      this.mapProfileData = {
        ...(profileData.docdata || {}),
        ...(profileDataNew.docdata || {})
      };
      this.mapUserId = {
        ...(profileData.mapUserId || {}),
        ...(profileDataNew.mapUserId || {})
      };

      this.authservice.getJourneyMap().then((journey) => {
        this.mapJourney = journey;
        for (const key in this.mapJourney) {
          var map = {
            "id": key,
            "journey": this.mapJourney[key]
          }
          this.journeyList.push(map);
        }
        this.journeyList.sort((a, b) => a['journey'].localeCompare(b['journey']));
      });
      const chatconfigRef = collection(this.firestore, 'chat config');
      const chatConfig = await getDocs(chatconfigRef);

      if (chatConfig.docs.length != 0) {
        this.chatConfigData = chatConfig.docs[0].data();
        this.categories = chatConfig.docs[0].data()['categories'];
        this.statuslist = chatConfig.docs[0].data()['status'];
        this.validators = chatConfig.docs[0].data()['validators'] ?? [];
        this.negligencelist = chatConfig.docs[0].data()['negligencecategories'] ?? [];
      } else {
        console.log('No Chat Configuration Data Found :(');
      }

      // Initialize category count map
      for (let i = 0; i < this.categories.length; i++) {
        const element = this.categories[i].category;
        this.categoryCountMap[element] = { open: 0, close: 0 };
      }

      const usersrolesRef = collection(this.firestore, 'users_roles')
      const userrolesQuery = query(usersrolesRef, where("chatxadmin", "==", true))
      getDocs(userrolesQuery).then((users) => {
        for (let i = 0; i < users.docs.length; i++) {
          const element = users.docs[i];
          this.chatadminUsers.push(element.data()['profile_ref'].id)
        }
      });

      this.loading = false;

      this.ticketArray = JSON.parse('[{"label":"Dashboard"}]');
      const storedTickets = JSON.parse(localStorage.getItem('oldtickets')) || [];
      const existingLabels = this.ticketArray.map(item => item.label);
      const filteredTickets = storedTickets.filter(ticket => !existingLabels.includes(ticket.label));
      this.ticketArray.push(...filteredTickets);

      const clientissueref = collection(this.firestore, 'clientissue')
      const clientissueQuery = query(clientissueref, orderBy("reporteddate", "desc"))
      collectionSnapshots(clientissueQuery).pipe(takeUntil(this.subscription)).subscribe((clientissueData) => {
        let clientissue = clientissueData.map(doc => ({ id: doc.id, ...doc.data() }))
        if (clientissue.length != 0) {
          this.recentTicketNumber = clientissue[0]['issueno'];
        } else {
          console.log("No Tickets Found");
        }
      })

      this.onDateChange(this.currentdate);

      // } else {
      //   alert('You dont have access to the screen');
      //   this.router.navigateByUrl('/')
      // }
    });
  }

  ngOnInit(): void {
  }

  // ngOnDestroy() {
  //   this.unSubscribe();
  // }
  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  // Ensure the ViewChild is available
  ngAfterViewInit() {
    if (!this.scrollContainer) {
      console.error("Scroll container is not available");
    }
  }

  // function to filter form 
  formfilter(value, refreshpage) {

    let weekyear = `${this.weekNumber}${"-"}${this.weekYear}`;

    this.clientIssues = this.tempIssues.filter((e) => {
      const ticketDateArray = e.reporteddate;
      const endDate = new Date(value.ticketend);
      endDate.setHours(23, 59, 59, 999);

      const closedTicketDate = e.status?.date;
      const closedEndDate = new Date(value.closedend);
      closedEndDate.setHours(23, 59, 59, 999);

      if (((e.issue?.toLowerCase().trim().replace(/\s/g, "").indexOf(value.search != '' ? value.search?.toLowerCase().trim().replace(/\s/g, "") : '') > -1)
        || (e.name?.toLowerCase().trim().replace(/\s/g, "").indexOf(value.search != '' ? value.search?.toLowerCase().trim().replace(/\s/g, "") : '') > -1)
        || (e.email?.toLowerCase().trim().replace(/\s/g, "").indexOf(value.search != '' ? value.search?.toLowerCase().trim().replace(/\s/g, "") : '') > -1)
        || (e.issueno?.toString().trim().replace(/\s/g, "").indexOf(value.search != '' ? value.search.toString().toLowerCase().trim().replace(/\s/g, "") : '') > -1))
        && (value.status.length != 0 ? value.status?.toLowerCase().includes(e.status.status?.toLowerCase()) : true)
        && (value.category.length != 0 ? value.category.includes(e.category) : true)
        && (value.journey.length != 0 ? value.journey.includes(e.journey?.id) : true)
        && (value.assign.length != 0 ? value.assign.some(item => e.assign.includes(item)) : true)
        && (value.reviewedby.length != 0 ? value.reviewedby.some(item => ![null, undefined].includes(e.review) && Object.keys(e.review).includes(item)) : true)
        && (value.peopleinvolved.length != 0 ? value.peopleinvolved.some(item => e.peopleinvolved?.includes(item)) : true)
        && (value.chatstatus != '' ? value.chatstatus == e.chatstatus && ![null, undefined].includes(e.chatstatus) : true)
        && (value.flag ? value.flag == e.flag && ![null, undefined].includes(e.flag) : true)
        && (value.review != '' ? ![null, undefined].includes(e.review) && value.review == 'true' ? e.review && typeof e.review === 'object' && Object.keys(e.review).length != 0 : e.review && typeof e.review === 'object' && Object.keys(e.review).length == 0 : true)
        // && (value.mandatereview != '' ? ![null, undefined].includes(e.mandatereview) && value.mandatereview == 'true' ? e.mandatereview && typeof e.mandatereview === 'object' && e.mandatereview.hasOwnProperty(this.profile_id) : e.mandatereview && typeof e.mandatereview === 'object' && !(e.mandatereview.hasOwnProperty(this.profile_id)) : true)
        && (value.metrics != '' ? value.metrics == 'gross' ? ![null, undefined, ""].includes(e.negligencemetrics) && e.negligencemetrics.hasOwnProperty(weekyear) && e.negligencemetrics[weekyear] > 8 : value.metrics == 'high' ? ![null, undefined, ""].includes(e.negligencemetrics) && e.negligencemetrics.hasOwnProperty(weekyear) && e.negligencemetrics[weekyear] < 9 && e.negligencemetrics[weekyear] > 5 : ![null, undefined, ""].includes(e.negligencemetrics) && e.negligencemetrics.hasOwnProperty(weekyear) && [4, 5].includes(e.negligencemetrics[weekyear]) : true)
        && (value.priority.length != 0 ? value.priority.includes(e.priority) : true)
        && ((![null, undefined, ""].includes(value.ticketstart) ? (ticketDateArray?.toDate() >= new Date(value.ticketstart)) : true)
          && (![null, undefined, ""].includes(value.ticketend) ? (ticketDateArray?.toDate() <= endDate) : true))
        && ((![null, undefined, ""].includes(value.closedstart) ? (closedTicketDate?.toDate() >= new Date(value.closedstart)) : true)
          && (![null, undefined, ""].includes(value.closedend) ? (closedTicketDate?.toDate() <= closedEndDate) : true))) {
        return e;
      }
    });
    if (refreshpage) {
      this.currentPage = 1;
      this.itemsPerPage = 10;
    }
  }

  // function to fetch all tickets 
  async allCases() {
    // this.loading = true;
    this.currentPage = 1;
    this.itemsPerPage = 10;
    this.viewOfCases = "alltickets";
    // this.unSubscribe();
    const clientissueRef = collection(this.firestore, 'clientissue')
    const clientissueQuery = query(clientissueRef, orderBy('reporteddate', 'desc'))
    collectionSnapshots(clientissueQuery).pipe(takeUntil(this.subscription)).subscribe(async (resData) => {
      let res = resData.map(doc => ({ id: doc.id, ...doc.data() }))
      let temparray = [];

      Object.keys(this.categoryCountMap).forEach(category => {
        this.categoryCountMap[category] = { open: 0, close: 0 }
      });
      this.resetValues();

      if (res.length == 0) {
        this.openSnackBar("No Data Found", "OK");
        this.loading = false;
      } else {
        this.totaltickets = res.length;

        for (let i = 0; i < res.length; i++) {
          const element = res[i];
          element['notes'] = (element?.['notes'] ?? []).sort((a, b) => b['date'] - a['date']) ?? [];
          element['active'] = this.calculateDaysAgo(element['reporteddate']?.toDate());
          element['closed'] = this.calculateDaysClosed(element['reporteddate']?.toDate(), element['status']['date']?.toDate());

          // fetch messages of the ticket for unread count 
          // this.subscription['allmessages'] = this.firestore.collection('clientissue').doc(element['id']).collection('messages', ref => ref.where('pending', 'array-contains', 'admin')).valueChanges().subscribe(unread => {
          //   element['unread'] = unread.length > 0 ? unread.length : 0;
          // });

          // if flag true 
          if (element['flag']) {
            this.flagtickets = this.flagtickets + 1;
          }

          // filter negligence metrics 
          let weekyear = `${this.weekNumber}${"-"}${this.weekYear}`;

          if (![null, undefined, ""].includes(element['negligencemetrics']) && element['negligencemetrics'].hasOwnProperty(weekyear)) {
            if (element['negligencemetrics'][weekyear] > 8) {
              this.grosstickets = this.grosstickets + 1;
            } else if (element['negligencemetrics'][weekyear] < 9 && element['negligencemetrics'][weekyear] > 5) {
              this.hightickets = this.hightickets + 1;
            } else if ([4, 5].includes(element['negligencemetrics'][weekyear])) {
              this.moderatetickets = this.moderatetickets + 1;
            } else if ([1, 2, 3].includes(element['negligencemetrics'][weekyear])) {
              this.lowtickets = this.lowtickets + 1;
            } else if (element['negligencemetrics'][weekyear] == 0) {
              this.notickets = this.notickets + 1;
            }
          }

          // count of reviwed and unreviwed tickets 
          // if (![null, undefined].includes(element[this.validators.includes(this.profile_id) ? 'mandatereview' : 'review'])) {
          //   if (element[this.validators.includes(this.profile_id) ? 'mandatereview' : 'review'].hasOwnProperty(this.profile_id)) {
          //     this.reviewmarked = this.reviewmarked + 1;
          //   } else {
          //     this.reviewpending = this.reviewpending + 1;
          //   }
          // }

          if (![null, undefined, ""].includes(element['review'])) {
            if (Object.keys(element['review']).length != 0) {
              this.reviewmarked = this.reviewmarked + 1;
            } else {
              this.reviewpending = this.reviewpending + 1;
            }
          }

          // if the ticket is open 
          if (element['status']['status']?.toLowerCase().includes('open')) {
            this.opentickets = this.opentickets + 1;

            // increment open count based on category 
            ![null, undefined, ''].includes(this.categoryCountMap[element['category']]) ? this.categoryCountMap[element['category']].open++ : '';

            // check chatstatus 
            if (![null, undefined, ""].includes(element['chatstatus'])) {
              if (element['chatstatus'] == 'New') {
                this.newtickets = this.newtickets + 1;
              } else if (element['chatstatus']?.toLowerCase() == 'responded') {
                this.respondedtickets = this.respondedtickets + 1;
              } else if (['decision making', 'pending'].includes(element['chatstatus']?.toLowerCase())) {
                this.pendingtickets = this.pendingtickets + 1;
              }
            }

          } else if (element['status']['status']?.toLowerCase().includes('close')) {
            // increment close count based on category 
            ![null, undefined, ''].includes(this.categoryCountMap[element['category']]) ? this.categoryCountMap[element['category']].close++ : '';
            this.closetickets = this.closetickets + 1;
          }

          // condition to check reopen ticket 
          if (element['status']['status']?.toLowerCase().includes('open')) {
            if (![null, undefined, ''].includes(element['status']?.editedBy)) {
              if (!this.chatadminUsers.includes(element['status']?.editedBy)) {
                element['reopen'] = true;
              }
            }
          } else {
            element['reopen'] = false;
          }

          temparray.push(element);
          if (i == res.length - 1) {
            this.clientIssues = temparray;
            this.tempIssues = temparray;

            this.filterValues('tickets', this.clickedFilter == '' ? '' : this.clickedFilter != 'new' ? this.clickedFilter : 'new', false);

            if (this.sortColumn != '') {
              if (this.sortOrder == '') {
                this.sortOrder = 'desc'
              } else if (this.sortOrder == 'desc') {
                this.sortOrder = 'asc'
              } else if (this.sortOrder == 'asc') {
                this.sortOrder = ''
              }
              this.sortcolumn(this.sortColumn);
            }
          }
        }
      }
      // this.loading = false;
    });
  }

  trackByCategoryKey(index: number, item: any): any {
    return item.key;
  }

  // Stable identity for the ticket rows so live collectionSnapshots emits don't
  // recreate every row (and the embedded <app-profile-picture>). Without this the
  // open avatar preview blinks out/in on each snapshot = flicker (+ perf churn).
  trackByTicket(index: number, item: any): any {
    return item?.id ?? item?.issueno ?? index;
  }

  onItemsPerPageChange() {
    // Reset to first page when changing items per page
    this.currentPage = 1;
    // Add any other logic you need
  }

  // function to get login user tickets 
  async myCases() {
    // this.loading = true;
    this.currentPage = 1;
    this.itemsPerPage = 10;
    this.viewOfCases = "mytickets";
    // this.unSubscribe();
    const clientissueRef = collection(this.firestore, 'clientissue')
    const clientissueQuery = query(clientissueRef, where("assign", "array-contains", this.profile_id), orderBy('reporteddate', 'desc'))
    collectionSnapshots(clientissueQuery).pipe(takeUntil(this.subscription)).subscribe(async (resData) => {
      const clientissueQuery2 = query(clientissueRef, where('peopleinvolved', "array-contains", this.profile_id), orderBy('reporteddate', 'desc'))
      collectionSnapshots(clientissueQuery2).pipe(takeUntil(this.subscription)).subscribe(async (peopleData) => {
        let res = resData.map(doc => ({ id: doc.id, ...doc.data() }))
        let people = peopleData.map(doc => ({ id: doc.id, ...doc.data() }))
        res.push(...people)
        res = res.filter((obj, index, self) =>
          index === self.findIndex((t) => t['id'] === obj['id'])
        );

        let temparray = [];
        // empty all the values 
        this.resetValues();

        if (res.length == 0) {
          this.openSnackBar("No Data Found", "OK");
          this.loading = false;
        } else {
          this.totaltickets = res.length;

          Object.keys(this.categoryCountMap).forEach(category => {
            this.categoryCountMap[category] = { open: 0, close: 0 }
          });

          for (let i = 0; i < res.length; i++) {
            const element = res[i];
            element['notes'] = (element?.['notes'] ?? []).sort((a, b) => b['date'] - a['date']) ?? [];
            element['active'] = this.calculateDaysAgo(element['reporteddate'].toDate());
            element['closed'] = this.calculateDaysClosed(element['reporteddate'].toDate(), element['status']['date'].toDate());

            // this.subscription['mymessages'] = this.firestore.collection('clientissue').doc(element['id']).collection('messages', ref => ref.where('pending', 'array-contains', 'admin')).valueChanges().subscribe(unread => {
            //   element['unread'] = unread.length > 0 ? unread.length : 0;
            // });

            // if flag true 
            if (element['flag']) {
              this.flagtickets = this.flagtickets + 1;
            }

            // filter negligence metrics 
            let weekyear = `${this.weekNumber}${"-"}${this.weekYear}`;

            if (![null, undefined, ""].includes(element['negligencemetrics']) && element['negligencemetrics'].hasOwnProperty(weekyear)) {
              if (element['negligencemetrics'][weekyear] > 8) {
                this.grosstickets = this.grosstickets + 1;
              } else if (element['negligencemetrics'][weekyear] < 9 && element['negligencemetrics'][weekyear] > 5) {
                this.hightickets = this.hightickets + 1;
              } else if ([4, 5].includes(element['negligencemetrics'][weekyear])) {
                this.moderatetickets = this.moderatetickets + 1;
              } else if ([1, 2, 3].includes(element['negligencemetrics'][weekyear])) {
                this.lowtickets = this.lowtickets + 1;
              } else if (element['negligencemetrics'][weekyear] == 0) {
                this.notickets = this.notickets + 1;
              }
            }

            // count of reviwed and unreviwed tickets 
            // if (![null, undefined].includes(element[this.validators.includes(this.profile_id) ? 'mandatereview' : 'review'])) {
            //   if (element[this.validators.includes(this.profile_id) ? 'mandatereview' : 'review'].hasOwnProperty(this.profile_id)) {
            //     this.reviewmarked = this.reviewmarked + 1;
            //   } else {
            //     this.reviewpending = this.reviewpending + 1;
            //   }
            // }

            if (![null, undefined, ""].includes(element['review'])) {
              if (Object.keys(element['review']).length != 0) {
                this.reviewmarked = this.reviewmarked + 1;
              } else {
                this.reviewpending = this.reviewpending + 1;
              }
            }

            // if the ticket is open 
            if (element['status']['status']?.toLowerCase().includes('open')) {
              this.opentickets = this.opentickets + 1;

              // increment open count based on category 
              ![null, undefined, ''].includes(this.categoryCountMap[element['category']]) ? this.categoryCountMap[element['category']].open++ : '';

              // check chatstatus 
              if (![null, undefined, ""].includes(element['chatstatus'])) {
                if (element['chatstatus'] == 'New') {
                  this.newtickets = this.newtickets + 1;
                } else if (element['chatstatus']?.toLowerCase() == 'responded') {
                  this.respondedtickets = this.respondedtickets + 1;
                } else if (element['chatstatus']?.toLowerCase() == 'decision making') {
                  this.pendingtickets = this.pendingtickets + 1;
                }
              }

            } else if (element['status']['status']?.toLowerCase().includes('close')) {
              // increment close count based on category 
              ![null, undefined, ''].includes(this.categoryCountMap[element['category']]) ? this.categoryCountMap[element['category']].close++ : '';
              this.closetickets = this.closetickets + 1;
            }

            // condition to check reopen ticket 
            if (element['status']['status']?.toLowerCase().includes('open')) {
              if (![null, undefined, ''].includes(element['status']?.editedBy)) {
                if (!this.chatadminUsers.includes(element['status']?.editedBy)) {
                  element['reopen'] = true;
                }
              }
            } else {
              element['reopen'] = false;
            }

            temparray.push(element);
            if (i == res.length - 1) {
              this.clientIssues = temparray;
              this.tempIssues = temparray;
              this.filterValues('tickets', this.clickedFilter == '' ? '' : this.clickedFilter != 'new' ? this.clickedFilter : 'new', false);
              if (this.sortColumn != '') {
                if (this.sortOrder == '') {
                  this.sortOrder = 'desc'
                } else if (this.sortOrder == 'desc') {
                  this.sortOrder = 'asc'
                } else if (this.sortOrder == 'asc') {
                  this.sortOrder = ''
                }
                this.sortcolumn(this.sortColumn);
              }
              // this.loading = false;
            }
          }
        }
      });
    });
  }

  // function to manipulate table data based on the value clicked 
  filterValues(field, value, refreshpage) {

    // this.refresh();
    this.clickedFilter = value;

    // check the tbale to be displayed
    if (value == "") {
      this.tableView = "";
    } else if (value == "Closed") {
      this.tableView = "close"
    } else {
      this.tableView = "open"
    }

    // if the clicked field is tickets 
    if (field == 'tickets') {

      if (['Closed', '', 'Open'].includes(value)) {
        this.filterform.patchValue({
          status: value,
          chatstatus: '',
          flag: false,
          mandatereview: "",
          review: "",
          metrics: ""
        });
      }

      if (['New', 'Responded', 'Decision Making'].includes(value)) {
        this.filterform.patchValue({
          status: 'Open',
          chatstatus: value,
          flag: false,
          mandatereview: "",
          review: "",
          metrics: ""
        });
      }
    } else if (field == 'flag') {
      if (value == 'flag') {
        this.filterform.patchValue({
          status: '',
          flag: true,
          chatstatus: '',
          mandatereview: "",
          review: "",
          metrics: ""
        });
      }
    } else if (field == 'priority') {
      if (value == 'reviewpending') {
        this.filterform.patchValue({
          status: '',
          review: 'false',
          chatstatus: '',
          flag: false,
          mandatereview: "",
          metrics: ""
        });

        // if (this.validators.includes(this.profile_id)) {
        //   this.filterform.patchValue({
        //     status: '',
        //     mandatereview: 'false',
        //     review: "",
        //     chatstatus: '',
        //     flag: false,
        //     metrics: ""
        //   });
        // }
      } else if (value == 'reviewmarked') {
        this.filterform.patchValue({
          status: '',
          review: 'true',
          chatstatus: '',
          flag: false,
          mandatereview: "",
          metrics: ""
        });

        // if (this.validators.includes(this.profile_id)) {
        //   this.filterform.patchValue({
        //     status: '',
        //     mandatereview: 'true',
        //     review: "",
        //     chatstatus: '',
        //     flag: false,
        //     metrics: ""
        //   });
        // }
      }
    } else if (field == "metrics") {
      if (value == "gross") {
        this.filterform.patchValue({
          status: '',
          chatstatus: '',
          flag: false,
          mandatereview: "",
          review: "",
          metrics: "gross"
        })
      } else if (value == "high") {
        this.filterform.patchValue({
          status: '',
          chatstatus: '',
          flag: false,
          mandatereview: "",
          review: "",
          metrics: "high"
        })
      } else if (value == "moderate") {
        this.filterform.patchValue({
          status: '',
          chatstatus: '',
          flag: false,
          mandatereview: "",
          review: "",
          metrics: "moderate"
        })
      }
    }

    // call form filter function to fetch the pactched values 
    this.formfilter(this.filterform.value, refreshpage);
  }

  // function to flag and unflag ticket 
  updateFlag(currentIssueData) {
    const fieldsToRemove = ["flagdata"];
    this.selectedElementForFlag = currentIssueData;
    let currFlag = currentIssueData;

    if ([null, undefined, false].includes(currFlag['flag'])) {
      if (this.menuTrigger) {
        this.menuTrigger.openMenu();
      }
    } else {
      currFlag['flag'] = false;

      let x = confirm("Are you sure to unflag this ticket");

      if (x) {
        const clientissueDoc = doc(this.firestore, 'clientissue', currFlag['id'])
        updateDoc(clientissueDoc, currFlag).then(() => {
          currentIssueData['flag'] = currFlag['flag'];
          this.openSnackBar('Ticket Successfully Unflagged', 'OK');
        });
      }
    }
  }

  // function to save flag data 
  updateData(currentIssueData, event: Event) {
    let currFlag = currentIssueData;
    let x = confirm("Are you sure to flag this ticket");

    if (x) {
      currFlag['flag'] = true;
      currFlag['flagdata'] = {
        "severity": this.flagseverity,
        "flaggedby": this.profile_id,
        "time": new Date()
      };
      const clientissueDoc = doc(this.firestore, 'clientissue', currFlag['id'])
      updateDoc(clientissueDoc, currFlag).then(() => {
        currentIssueData['flag'] = currFlag['flag'];
        this.openSnackBar('Ticket Successfully Flagged', 'OK');
      });
    }
    this.flagseverity = "";
    this.selectedElementForFlag = "";
  }

  // function to raise the new ticket 
  async raiseIssue(existingIssue) {
    // this.unSubscribe();
    var data = {};
    if (existingIssue == null) {
      data = {
        metadata: {
        },
        categories: this.categories,
        type: 'new'
      }
    } else {
      data = {
        metadata: existingIssue,
        type: 'edit'
      }
    }

    data["categories"] = this.categories;
    data["status"] = this.statuslist;
    data["journey"] = this.journeyList;
    data["reportedBy"] = existingIssue ? existingIssue.reportedBy : 'Unknown';
    data["timestamp"] = existingIssue ? existingIssue.timestamp : new Date().toISOString();
    data['mapprofileUid'] = this.mapProfileData;
    data['recentticket'] = this.recentTicketNumber;

    // open dialog to enter details to raise ticket 
    let dialogref = this.dialog.open(AddIssueComponent, {
      data: data,
      autoFocus: false,
      // Sized to the form rather than a fixed 95% box, which left a large empty area and
      // scrolled sideways once the three fixed-width columns exceeded the viewport.
      width: "min(1150px, 96vw)",
      maxHeight: "92vh",
      disableClose: true
    });

    dialogref.afterClosed().toPromise().then(() => {
      if (this.viewOfCases == 'alltickets') {
        this.allCases();
      } else {
        this.myCases();
      }
    })
  }

  // function to open new chat tab 
  async messageIssue(event: MouseEvent, value, review) {

    // If Ctrl/Cmd key is pressed, open in new browser tab
    if (event.ctrlKey || event.metaKey) {
      const url = review
        ? `/customersupportdashboard/review/${value.id}/${value.clientid}`
        : `/customersupportdashboard/ticket/${value.id}/${value.issueno}`;
      window.open(url, '_blank');
      return;
    }

    // check if chat tab is already opened 
    var index = this.ticketArray.findIndex(ticket => review == false ? ticket['ticketid'] === value.id : value.name + '-' + 'Review' == ticket['label']);

    // if chat tab is already opened 
    if (this.ticketArray.length <= 10 || this.ticketArray.some(map => map.ticketid == value.id)) {
      if (index == -1) {
        var map = {
          'ticketid': value.id,
          'profileid': this.profile_id,
          'admin': this.chatAdmin,
          "clientid": value.clientid,
          'review': review
        }
        if (review) {
          map['label'] = (value.name + '-' + 'Review').toString();
        } else {
          map['label'] = value.issueno + '-' + value.name;
        }
        this.ticketArray.push(map);
        this.selectedTabIndex = this.ticketArray.length;
      } else {
        this.selectedTabIndex = index;
      }
    } else if (!this.ticketArray.some(map => map.ticketid == value.id)) {
      this.ticketArray.splice(1, 1);
      if (index == -1) {
        var map = {
          'ticketid': value.id,
          'profileid': this.profile_id,
          'admin': this.chatAdmin,
          "clientid": value.clientid,
          'review': review
        }
        if (review) {
          map['label'] = (value.name + '-' + 'Review').toString();
        } else {
          map['label'] = value.issueno + '-' + value.name;
        }
        this.ticketArray.push(map);
        this.selectedTabIndex = this.ticketArray.length;
      } else {
        this.selectedTabIndex = index + 1;
      }
    }

    // store tickets opened in localstorage for opening even after screen is closed 
    localStorage.setItem('oldtickets', JSON.stringify(this.ticketArray));
  }
  // async messageIssue(event: MouseEvent, value, review) {

  //   // check if chat tab is already opened 
  //   var index = this.ticketArray.findIndex(ticket => review == false ? ticket['ticketid'] === value.id : value.name + '-' + 'Review' == ticket['label']);

  //   // if chat tab is already opened 
  //   if (this.ticketArray.length <= 10 || this.ticketArray.some(map => map.ticketid == value.id)) {
  //     if (index == -1) {
  //       var map = {
  //         'ticketid': value.id,
  //         'profileid': this.profile_id,
  //         'admin': this.chatAdmin,
  //         "clientid": value.clientid,
  //         'review': review
  //       }
  //       if (review) {
  //         map['label'] = (value.name + '-' + 'Review').toString();
  //       } else {
  //         map['label'] = value.issueno + '-' + value.name;
  //       }
  //       this.ticketArray.push(map);
  //       if(event.ctrlKey || event.metaKey) {
  //         this.selectedTabIndex = 0;
  //       } else {
  //         this.selectedTabIndex = this.ticketArray.length;
  //       }
  //     } else {
  //       if(event.ctrlKey || event.metaKey) {
  //         this.selectedTabIndex = 0;
  //       } else {
  //         this.selectedTabIndex = index
  //       }
  //     }
  //   } else if (!this.ticketArray.some(map => map.ticketid == value.id)) {
  //     this.ticketArray.splice(1, 1);
  //     if (index == -1) {
  //       var map = {
  //         'ticketid': value.id,
  //         'profileid': this.profile_id,
  //         'admin': this.chatAdmin,
  //         "clientid": value.clientid,
  //         'review': review
  //       }
  //       if (review) {
  //         map['label'] = (value.name + '-' + 'Review').toString();
  //       } else {
  //         map['label'] = value.issueno + '-' + value.name;
  //       }
  //       this.ticketArray.push(map);
  //       if(event.ctrlKey || event.metaKey) {
  //         this.selectedTabIndex = 0;
  //       } else {
  //         this.selectedTabIndex = this.ticketArray.length;
  //       }
  //     } else {
  //       if(event.ctrlKey || event.metaKey) {
  //         this.selectedTabIndex = 0;
  //       } else {
  //         this.selectedTabIndex = index + 1;
  //       }
  //     }
  //   }

  //   // store tickets opened in localstorage for opening even after screen is closed 
  //   localStorage.setItem('oldtickets', JSON.stringify(this.ticketArray));
  // }

  // function to sort column when clicked on header 
  sortcolumn(column: string) {
    // if the column is already clicked 
    if (this.sortColumn == column) {
      if (this.sortOrder == "desc") {
        this.sortColumn = "";
        this.formfilter(this.filterform.value, false);
      } else if (this.sortOrder == 'asc') {
        this.sortOrder = "desc";
        this.sortColumn = column;
        this.descSorting(column);
      } else {
        this.sortOrder = "asc";
        this.sortColumn = column;
        this.ascSorting(column);
      }
    } else {
      // if the column is not clicked 
      this.sortOrder = "asc";
      this.sortColumn = column;
      this.ascSorting(column);
    }
  }

  // Opens category selection dialog with unique categories from open tickets
  openCategorySelector() {
    const openTickets = this.tempIssues;
    this.allCategories = [...new Set(openTickets.map(t => t.category).filter(c => c))].sort();
    this.selectedCategories = [...this.allCategories];
    this.showCategoryDialog = true;
  }

  // Toggles a category's selection state in the checkbox list
  toggleCategory(category: string) {
    const index = this.selectedCategories.indexOf(category);
    if (index > -1) {
      this.selectedCategories.splice(index, 1);
    } else {
      this.selectedCategories.push(category);
    }
  }

  // Selects all categories in the dialog
  selectAll() {
    this.selectedCategories = [...this.allCategories];
  }

  // Deselects all categories in the dialog
  deselectAll() {
    this.selectedCategories = [];
  }

  // Returns whether a category is currently selected
  isSelected(category: string): boolean {
    return this.selectedCategories.includes(category);
  }

  // Generates report data by grouping open tickets into time-based buckets per category
  generateReport() {
    const now = new Date();

    const openTickets = this.tempIssues.filter(
      t => t.status?.status?.toLowerCase() === 'open'
    );

    const closedTickets = this.tempIssues.filter(
      t => t.status?.status?.toLowerCase() === 'closed'
    );

    this.reportData = this.selectedCategories.sort().map(category => {
      const categoryTickets = openTickets.filter(t => t.category === category);
      const closedTicketsCategory = closedTickets.filter(t => t.category === category);

      let closedLast24 = 0;

      let last24 = 0, hrs48 = 0, hrs72 = 0, days7 = 0, month1 = 0, moreThan1Month = 0;
      let last24Unresponded = 0, hrs48Unresponded = 0, hrs72Unresponded = 0;
      let days7Unresponded = 0, month1Unresponded = 0, moreThan1MonthUnresponded = 0;

      categoryTickets.forEach(ticket => {
        let reportedDate: Date;

        if (ticket.reporteddate?.toDate) {
          reportedDate = ticket.reporteddate.toDate();
        } else if (ticket.reporteddate?.seconds) {
          reportedDate = new Date(ticket.reporteddate.seconds * 1000);
        } else {
          reportedDate = new Date(ticket.reporteddate);
        }

        const diffMs = now.getTime() - reportedDate.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        const diffDays = diffHours / 24;

        const chatStatus = ticket.chatstatus;
        const isUnresponded = [null, undefined, 'new'].includes(
          chatStatus != null ? chatStatus.toLowerCase() : chatStatus
        );

        if (diffHours <= 24) {
          last24++;
          if (isUnresponded) last24Unresponded++;
        } else if (diffHours <= 48) {
          hrs48++;
          if (isUnresponded) hrs48Unresponded++;
        } else if (diffHours <= 72) {
          hrs72++;
          if (isUnresponded) hrs72Unresponded++;
        } else if (diffDays <= 7) {
          days7++;
          if (isUnresponded) days7Unresponded++;
        } else if (diffDays <= 30) {
          month1++;
          if (isUnresponded) month1Unresponded++;
        } else {
          moreThan1Month++;
          if (isUnresponded) moreThan1MonthUnresponded++;
        }
      });

      closedTicketsCategory.forEach((ticket) => {
        let date: Date;

        if (ticket?.status?.date?.toDate) {
          date = ticket.status.date.toDate();
        } else if (ticket.status?.date?.seconds) {
          date = new Date(ticket.status?.date?.seconds * 1000);
        } else {
          date = new Date(ticket.date);
        }

        const diffMs = now.getTime() - date.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 24) {
          closedLast24++;
        }
      });

      return {
        category,
        total: categoryTickets.length,
        totalUnresponded: last24Unresponded + hrs48Unresponded + hrs72Unresponded
          + days7Unresponded + month1Unresponded + moreThan1MonthUnresponded,
        closedLast24,
        last24, last24Unresponded,
        hrs48, hrs48Unresponded,
        hrs72, hrs72Unresponded,
        days7, days7Unresponded,
        month01: month1,
        month01Unresponded: month1Unresponded,
        moreThan01: moreThan1Month,
        moreThan01Unresponded: moreThan1MonthUnresponded,
      };
    });
  }

  getTotal(field: string): number {
    return this.reportData.reduce((sum, row) => sum + row[field], 0);
  }

  async downloadReport() {
    if (this.selectedCategories.length === 0) {
      alert('Please select at least one category');
      return;
    }

    this.generateReport();
    this.showCategoryDialog = false;

    const headerRow1 = [
      { label: 'Category', colSpan: 1, rowSpan: 2 },
      { label: 'Total Open\nTickets', colSpan: 1, rowSpan: 2 },
      { label: 'Total\nUnresponded', colSpan: 1, rowSpan: 2 },
      { label: 'Tickets open\nin the last 24', colSpan: 1, rowSpan: 2 },
      { label: '24 Hours', colSpan: 2, rowSpan: 1 },
      { label: '48 Hours', colSpan: 2, rowSpan: 1 },
      { label: '72 Hours', colSpan: 2, rowSpan: 1 },
      { label: '07 Days', colSpan: 2, rowSpan: 1 },
      { label: '1 Month', colSpan: 2, rowSpan: 1 },
      { label: 'More than\n1 month', colSpan: 2, rowSpan: 1 },
      { label: 'Tickets closed\nin the last 24', colSpan: 1, rowSpan: 2 },
    ];

    const headerRow2 = [
      'Open Ticket', 'Unresponded',
      'Open Ticket', 'Unresponded',
      'Open Ticket', 'Unresponded',
      'Open Ticket', 'Unresponded',
      'Open Ticket', 'Unresponded',
      'Open Ticket', 'Unresponded',
    ];

    const rows = this.reportData.map(row => [
      row.category,
      row.total.toString(),
      row.totalUnresponded.toString(),
      row.last24.toString(),
      row.last24.toString(), row.last24Unresponded.toString(),
      row.hrs48.toString(), row.hrs48Unresponded.toString(),
      row.hrs72.toString(), row.hrs72Unresponded.toString(),
      row.days7.toString(), row.days7Unresponded.toString(),
      row.month01.toString(), row.month01Unresponded.toString(),
      row.moreThan01.toString(), row.moreThan01Unresponded.toString(),
      row.closedLast24.toString(),
    ]);

    rows.push([
      'Total',
      this.getTotal('total').toString(),
      this.getTotal('totalUnresponded').toString(),
      this.getTotal('last24').toString(),
      this.getTotal('last24').toString(), this.getTotal('last24Unresponded').toString(),
      this.getTotal('hrs48').toString(), this.getTotal('hrs48Unresponded').toString(),
      this.getTotal('hrs72').toString(), this.getTotal('hrs72Unresponded').toString(),
      this.getTotal('days7').toString(), this.getTotal('days7Unresponded').toString(),
      this.getTotal('month01').toString(), this.getTotal('month01Unresponded').toString(),
      this.getTotal('moreThan01').toString(), this.getTotal('moreThan01Unresponded').toString(),
      this.getTotal('closedLast24').toString(),
    ]);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const cellPadding = 12;
    const fontSize = 14;
    const headerFontSize = 13;
    const titleFontSize = 18;
    const headerHeight = 40;
    const lineHeight = 18;
    const minRowHeight = 40;

    const colWidths = [180, 120, 120, 170, 95, 105, 95, 105, 95, 105, 95, 105, 95, 105, 95, 105, 175];



    // grouped columns: 4–15 (the 6 pairs with Open Ticket / Unresponded sub-headers)
    const groupedColStart = 4;
    const groupedColEnd = 15;

    // single-span columns: 0,1,2,3,16 (rowSpan=2, no divider between header rows)
    const singleSpanCols = [0, 1, 2, 3, 16];

    const groupStartCols = [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16];

    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const titleHeight = 50;

    const wrapText = (text: string, maxWidth: number): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines;
    };

    ctx.font = `bold ${fontSize}px Arial`;
    const rowHeights = rows.map(row => {
      const lines = wrapText(row[0], colWidths[0] - cellPadding * 2);
      return Math.max(minRowHeight, lines.length * lineHeight + cellPadding);
    });

    const totalDataHeight = rowHeights.reduce((a, b) => a + b, 0);
    canvas.width = totalWidth + 40;
    canvas.height = titleHeight + headerHeight * 2 + totalDataHeight + 40;

    const getRowY = (index: number): number =>
      titleHeight + headerHeight * 2 +
      rowHeights.slice(0, index).reduce((a, b) => a + b, 0);

    const startX = 20;
    const startY = titleHeight;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── 2. Title ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#333333';
    ctx.font = `bold ${titleFontSize}px Arial`;
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    ctx.fillText(`Open Tickets Report - ${today}`, 20, 30);

    // ── 3. Header backgrounds ────────────────────────────────────────────────────
    // Step A: Paint entire double-height header area in light blue
    ctx.fillStyle = '#1A73E8';
    ctx.fillRect(startX, startY, totalWidth, headerHeight * 2);

    // Step B: Paint darker blue ONLY on row-2 of grouped columns (4–15)
    const groupedXStart = startX + colWidths.slice(0, groupedColStart).reduce((a, b) => a + b, 0);
    const groupedWidth = colWidths.slice(groupedColStart, groupedColEnd + 1).reduce((a, b) => a + b, 0);
    ctx.fillStyle = '#1558B0';
    ctx.fillRect(groupedXStart, startY + headerHeight, groupedWidth, headerHeight);

    // Step C: Repaint row-2 of single-span columns back to light blue (removing dark row-2)
    singleSpanCols.forEach(ci => {
      const colX = startX + colWidths.slice(0, ci).reduce((a, b) => a + b, 0);
      ctx.fillStyle = '#1A73E8';
      ctx.fillRect(colX, startY + headerHeight, colWidths[ci], headerHeight);
    });

    // ── 4. Data row backgrounds ──────────────────────────────────────────────────
    rows.forEach((row, rowIndex) => {
      const y = getRowY(rowIndex);
      const isLastRow = rowIndex === rows.length - 1;
      ctx.fillStyle = isLastRow ? '#E8F0FE' : rowIndex % 2 === 0 ? '#FFFFFF' : '#F5F5F5';
      ctx.fillRect(startX, y, totalWidth, rowHeights[rowIndex]);
    });

    // ── 5. Grid lines ─────────────────────────────────────────────────────────────
    const gridBottom = getRowY(rows.length);

    // Horizontal: top of header
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(startX + totalWidth, startY); ctx.stroke();

    // Horizontal: mid-line ONLY across grouped columns (no line through single-span cols)
    ctx.beginPath();
    ctx.moveTo(groupedXStart, startY + headerHeight);
    ctx.lineTo(groupedXStart + groupedWidth, startY + headerHeight);
    ctx.stroke();

    // Horizontal: bottom of header
    ctx.beginPath();
    ctx.moveTo(startX, startY + headerHeight * 2);
    ctx.lineTo(startX + totalWidth, startY + headerHeight * 2);
    ctx.stroke();

    // Horizontal: data row lines
    ctx.strokeStyle = '#CCCCCC';
    rows.forEach((_, i) => {
      const y = getRowY(i + 1);
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(startX + totalWidth, y); ctx.stroke();
    });

    // Vertical: group boundary lines (full height, white)
    const fullDividerCols = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 17]);
    ctx.lineWidth = 1;
    for (let ci = 0; ci <= colWidths.length; ci++) {
      const xPos = startX + colWidths.slice(0, ci).reduce((a, b) => a + b, 0);
      if (fullDividerCols.has(ci)) {
        // Full height: from top of header to bottom of data
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.moveTo(xPos, startY); ctx.lineTo(xPos, gridBottom); ctx.stroke();
      } else if (ci > groupedColStart && ci <= groupedColEnd) {
        // Sub-col dividers: only from row-2 header downward
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.moveTo(xPos, startY + headerHeight); ctx.lineTo(xPos, gridBottom); ctx.stroke();
      }
    }

    // Vertical: data area lines in grey (over data rows only, cleaner look)
    ctx.strokeStyle = '#DDDDDD';
    for (let ci = 1; ci < colWidths.length; ci++) {
      const xPos = startX + colWidths.slice(0, ci).reduce((a, b) => a + b, 0);
      ctx.beginPath();
      ctx.moveTo(xPos, startY + headerHeight * 2);
      ctx.lineTo(xPos, gridBottom);
      ctx.stroke();
    }

    // ── 6. Header Row 1 text ──────────────────────────────────────────────────────
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';

    headerRow1.forEach((group, gi) => {
      const groupStartCol = groupStartCols[gi];
      const groupWidth = colWidths.slice(groupStartCol, groupStartCol + group.colSpan).reduce((a, b) => a + b, 0);
      const groupX = startX + colWidths.slice(0, groupStartCol).reduce((a, b) => a + b, 0);

      // rowSpan:2 → text centered across full double-height; rowSpan:1 → centered in row 1 only
      const spanHeight = group.rowSpan === 2 ? headerHeight * 2 : headerHeight;
      const midY = startY + spanHeight / 2;

      const labelLines = group.label.split('\n');
      const lh = headerFontSize + 4;
      const blockH = labelLines.length * lh;
      const lineStartY = midY - blockH / 2 + lh / 2;

      ctx.font = `bold ${headerFontSize}px Arial`;

      if (gi === 0) {
        ctx.textAlign = 'left';
        labelLines.forEach((line, li) => {
          ctx.fillText(line, groupX + cellPadding, lineStartY + li * lh);
        });
      } else {
        ctx.textAlign = 'center';
        labelLines.forEach((line, li) => {
          ctx.fillText(line, groupX + groupWidth / 2, lineStartY + li * lh);
        });
      }
    });

    // ── 7. Header Row 2 sub-labels (Open Ticket / Unresponded) ───────────────────
    ctx.font = `bold ${headerFontSize - 1}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    const row2MidY = startY + headerHeight + headerHeight / 2;

    headerRow2.forEach((label, i) => {
      const ci = i + groupedColStart;
      const cx = startX + colWidths.slice(0, ci).reduce((a, b) => a + b, 0);
      ctx.fillText(label, cx + colWidths[ci] / 2, row2MidY);
    });

    ctx.textBaseline = 'alphabetic';

    // ── 8. Data rows ──────────────────────────────────────────────────────────────
    rows.forEach((row, rowIndex) => {
      const y = getRowY(rowIndex);
      const h = rowHeights[rowIndex];
      const isLastRow = rowIndex === rows.length - 1;
      let x = startX;

      row.forEach((cell, i) => {
        if (i === 0) {
          // Category column — bold, left-aligned, word-wrapped
          ctx.fillStyle = isLastRow ? '#1A73E8' : '#333333';
          ctx.textAlign = 'left';
          ctx.font = `bold ${fontSize}px Arial`;
          const lines = wrapText(cell, colWidths[0] - cellPadding * 2);
          const blockHeight = lines.length * lineHeight;
          const textStartY = y + (h - blockHeight) / 2 + lineHeight - 4;
          lines.forEach((line, li) => ctx.fillText(line, x + cellPadding, textStartY + li * lineHeight));
        } else {
          const isBold = isLastRow || i === 1 || i === 2 || i === 3;
          ctx.fillStyle = isBold ? '#222222' : '#555555';
          ctx.textAlign = 'center';
          ctx.font = isBold ? `bold ${fontSize}px Arial` : `${fontSize}px Arial`;
          ctx.fillText(cell, x + colWidths[i] / 2, y + h / 2 + fontSize / 3);
        }
        x += colWidths[i];
      });
    });

    // ── 9. Download ───────────────────────────────────────────────────────────────
    const link = document.createElement('a');
    link.download = `ticket-report-${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // function to sort columns in ascending order 
  ascSorting(column) {
    if (['category', 'name', 'chatstatus', 'priority'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => a[column]?.toLowerCase().localeCompare(b[column]?.toLowerCase()));
    }

    if (column == "severity") {
      this.clientIssues = this.clientIssues.sort((a, b) => a['flagdata']?.severity?.toLowerCase().localeCompare(b['flagdata']?.severity?.toLowerCase()));
    }

    if (['active', 'issueno', 'closed'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => a[column] - b[column]);
    }

    if (['happinessindex'].includes(column)) {
      this.clientIssues = this.clientIssues.filter((e) => ![null, undefined, ''].includes(e[column])).sort((a, b) => a[column] - b[column]);
      this.clientIssues.push(...this.clientIssues.filter((e) => [null, undefined, ''].includes(e[column])));
    }

    if (['reportedBy'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => this.mapProfileData[a[column]]?.name?.toLowerCase().localeCompare(this.mapProfileData[b[column]]?.name?.toLowerCase()));
    }
    if (['journey'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => this.mapJourney[a[column]?.id]?.toLowerCase().localeCompare(this.mapProfileData[b[column]?.id]?.toLowerCase()));
    }

    if (['reporteddate'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => a[column]?.toDate() - b[column]?.toDate());
    }

    if (['closeddate'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => a.status.date?.toDate() - b.status.date?.toDate());
    }
  }

  // function to sort columns in descending order 
  descSorting(column) {
    if (['category', 'name', 'chatstatus', 'priority'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => b[column]?.toLowerCase().localeCompare(a[column]?.toLowerCase()));
    }
    if (['active', 'issueno', 'closed'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => b[column] - a[column]);
    }

    if (column == "severity") {
      this.clientIssues = this.clientIssues.sort((a, b) => b['flagdata']?.severity?.toLowerCase().localeCompare(a['flagdata']?.severity?.toLowerCase()));
    }

    if (['happinessindex'].includes(column)) {
      this.clientIssues = this.clientIssues.filter((e) => ![null, undefined, ''].includes(e[column])).sort((a, b) => b[column] - a[column]);
      this.clientIssues.push(...this.clientIssues.filter((e) => [null, undefined, ''].includes(e[column])));
    }

    if (['reportedBy'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => this.mapProfileData[b[column]]?.name?.toLowerCase().localeCompare(this.mapProfileData[a[column]]?.name?.toLowerCase()));
    }
    if (['journey'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => this.mapJourney[b[column]?.id]?.toLowerCase().localeCompare(this.mapProfileData[a[column]?.id]?.toLowerCase()));
    }

    if (['reporteddate'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => b[column]?.toDate() - a[column]?.toDate());
    }

    if (['closeddate'].includes(column)) {
      this.clientIssues = this.clientIssues.sort((a, b) => b.status.date?.toDate() - a.status.date?.toDate());
    }
  }

  // function to refresh all the values to actual value 
  refresh() {
    this.filterform.controls['search'].setValue('');
    this.filterform.controls['status'].setValue('');
    this.filterform.controls['review'].setValue('');
    this.filterform.controls['mandatereview'].setValue('');
    this.filterform.controls['flag'].setValue(false);
    this.filterform.controls['journey'].setValue([]);
    this.filterform.controls['category'].setValue([]);
    this.filterform.controls['metrics'].setValue('');
    this.filterform.controls['assign'].setValue([]);
    this.filterform.controls['ticketstart'].setValue('');
    this.filterform.controls['ticketend'].setValue('');
    this.filterform.controls['closedstart'].setValue('');
    this.filterform.controls['closedend'].setValue('');
    this.filterform.controls['chatstatus'].setValue('');
    this.filterform.controls['priority'].setValue([]);
    this.filterform.controls['peopleinvolved'].setValue([]);
    this.clientIssues = this.tempIssues;
    this.formfilter(this.filterform.value, true)
  }

  // function to reset values to default
  resetValues() {
    this.totaltickets = 0;
    this.opentickets = 0;
    this.closetickets = 0;
    this.newtickets = 0;
    this.flagtickets = 0;
    this.respondedtickets = 0;
    this.pendingtickets = 0;
    this.grosstickets = 0;
    this.moderatetickets = 0;
    this.lowtickets = 0;
    this.notickets = 0;
    this.hightickets = 0;
    this.reviewpending = 0;
    this.reviewmarked = 0;
    // this.clientIssues = [];
    // this.tempIssues = [];
  }

  // function to slice tickets count based on items per page 
  get paginatedData() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    // if(this.tableView == "open") {
    //   this.clientIssues.sort((a,b)=>b.unread - a.unread)
    // }  
    return this.clientIssues.slice(startIndex, startIndex + this.itemsPerPage);
  }

  // function to get total no of pages 
  get totalPages() {
    return Math.ceil(this.clientIssues.length / this.itemsPerPage);
  }

  // function to go to next page in table 
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.scrollNext();
    }
  }

  // function to go to previous page in table 
  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.scrollPrev();
    }
  }

  // function to set page number 
  setPage(page: number) {
    this.currentPage = page;
  }

  // function to trigger popup of ticket after hovering on desired ticket 
  showPopup(row: any, event: MouseEvent) {
    const popupWidth = 300;
    const popupHeight = 200;
    const offset = 10;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = event.clientY + offset;
    let left = event.clientX + offset;

    if (left + popupWidth > viewportWidth) {
      left = event.clientX - popupWidth - offset;
    }

    if (top + popupHeight > viewportHeight) {
      top = viewportHeight - popupHeight - offset;
    }

    if (left < 0) {
      left = offset;
    }

    if (top < 0) {
      top = offset;
    }

    row['position'] = {
      top,
      left
    }
    this.popupData = row;
    const targetElement = event.target as HTMLElement;
    const rect = targetElement.getBoundingClientRect();
  }

  // function to close popup after removing mouse pointer 
  hidePopup() {
    this.popupData = null;
  }

  // function to trigger popup of assigned people after hovering on desired category 
  showAssigned(row: any, event: MouseEvent) {
    const popupWidth = 300;
    const popupHeight = 200;
    const offset = 10;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = event.clientY + offset;
    let left = event.clientX + offset;

    if (left + popupWidth > viewportWidth) {
      left = event.clientX - popupWidth - offset;
    }

    if (top + popupHeight > viewportHeight) {
      top = viewportHeight - popupHeight - offset;
    }

    if (left < 0) {
      left = offset;
    }

    if (top < 0) {
      top = offset;
    }

    this.assignData = this.categories.filter((e) => e['category'] == row)[0]
    this.assignData['position'] = {
      top,
      left
    }
    const targetElement = event.target as HTMLElement;
    const rect = targetElement.getBoundingClientRect();
  }

  // function to close popup after removing mouse pointer 
  hideAssigned() {
    this.assignData = null;
  }

  // function to scroll table pagination towards right  
  scrollNext() {
    this.scrollContainer.nativeElement.scrollLeft += this.scrollAmount;
  }

  // function to scroll table pagination towards left  
  scrollPrev() {
    this.scrollContainer.nativeElement.scrollLeft -= this.scrollAmount;
  }

  // function to export table data to excel 
  exportToExcel(): void {
    // Prepare the data to be exported
    const dataToExport = [];

    // Table Headers
    const headers = ['Status', 'Ticket No', 'Name', 'Email', 'Reported Date', 'Reported By', 'Category', 'Journey', 'Ticket', 'Chat Status', 'Priority'];
    if (this.clickedFilter == 'Closed') {
      headers.push('Closed Date')
      headers.push('Closed Duration')
    } else if (this.clickedFilter == 'Open') {
      headers.push('Active');
    }

    dataToExport.push(headers);

    // Table Rows
    this.clientIssues.forEach((data, index) => {
      const row = [
        data?.status?.status,
        data?.issueno,
        this.mapProfileData[data?.clientid]?.name,
        this.mapProfileData[data?.clientid]?.email,
        data?.reporteddate?.toDate(),
        this.mapProfileData[data?.reportedBy]?.name,
        data?.category,
        [null, undefined, ""].includes(data?.journey) ? 'No Journey' : this.mapJourney[data?.journey.id],
        data?.issue,
        data?.chatstatus ?? "",
        data?.priority ?? "",
      ];

      if (this.clickedFilter == 'Closed') {
        row.push(data?.status?.date.toDate())
        row.push(data?.closed)
      } else if (this.clickedFilter == 'Open') {
        row.push(data?.active)
      }

      dataToExport.push(row);
    });

    // Generate worksheet and workbook
    const worksheet: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(dataToExport);
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Support Dashboard');

    // Export to Excel
    XLSX.writeFile(workbook, 'Customer Support Dashboard.xlsx');
  }

  // function to unsubscribe all the subscriptions 
  // unSubscribe() {
  //   for (const keys in this.subscription) {
  //     if (Object.prototype.hasOwnProperty.call(this.subscription, keys)) {
  //       const element = this.subscription[keys];
  //       if (![null, undefined].includes(element)) {
  //         element.unsubscribe();
  //       }
  //     }
  //   }
  // }

  // function to configure calender to start from tuesday 
  configureDateAdapter(): void {
    this.dateAdapter.setLocale('en-US');
    this.dateAdapter.getFirstDayOfWeek = () => 2;
  }

  // function to change the weeknumber based on the date selected 
  async onDateChange(date: Date) {
    this.weekNumber = await this.getWeekNumber(date);
    if (this.viewOfCases == '' || this.viewOfCases == 'mytickets') {
      this.myCases();
    } else {
      this.allCases();
    }
  }

  // function to get week number of the date selected 
  getWeekNumber(date: Date): number {
    const tempDate = new Date(date);
    tempDate.setHours(0, 0, 0, 0);

    this.weekYear = tempDate.getFullYear();

    const dayOffset = (tempDate.getDay() - 2 + 7) % 7;
    tempDate.setDate(tempDate.getDate() - dayOffset);

    const yearStart = new Date(tempDate.getFullYear(), 0, 1);
    const yearStartDay = (yearStart.getDay() - 2 + 7) % 7;
    yearStart.setDate(yearStart.getDate() + (yearStartDay === 0 ? 0 : 7 - yearStartDay));

    const daysSinceYearStart = Math.floor((tempDate.getTime() - yearStart.getTime()) / 86400000);
    const weekNumber = Math.floor(daysSinceYearStart / 7) + 1;

    return weekNumber;
  }


  // function to open category configuring screen 
  openCategory() {
    if (window.location.port.includes('4200')) {
      window.open('http://localhost:4200/chat-config', '_blank');
    } else if (environment.firebase.projectId == 'test-environment-841c3') {
      window.open('https://star-labs-test.web.app/chat-config', '_blank');
    } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
      window.open('https://breakthroughs.app/chat-config', '_blank');
    } else if (environment.firebase.projectId == 'launch-your-legacy-development') {
      window.open('https://starlabs-staging.web.app/chat-config', '_blank');
    }
  }

  // function to close the tab of ticket 
  closeTab(index) {
    localStorage.removeItem('oldtickets');
    this.ticketArray.splice(index, 1);
    localStorage.setItem('oldtickets', JSON.stringify(this.ticketArray));
  }

  // function to calculate time taken to close ticket 
  calculateDaysClosed(reportedDate: Date, closedDate: Date): string {
    const daysDiff = Math.floor((closedDate?.getTime() - reportedDate?.getTime()) / (1000 * 3600 * 24));
    return daysDiff.toString() == '-1' ? '0' : daysDiff.toString();
  }

  // function to calculate active time for ticket that is opened 
  calculateDaysAgo(reportedDate: Date): string {
    const currentDate = new Date();
    const daysDiff = Math.floor((currentDate?.getTime() - reportedDate?.getTime()) / (1000 * 3600 * 24));
    return daysDiff.toString() == '-1' ? '0' : daysDiff.toString();
  }

  // function to return category 
  returnFilterCategory() {
    return this.categories.filter(e => e.category?.toLowerCase().includes(this.filteredCategory?.toLowerCase()))
  }

  // function to return journey 
  returnFilterJourney() {
    return this.journeyList.filter(e => e.journey.toLowerCase().includes(this.filteredJourney?.toLowerCase())).sort((a, b) => a['journey'].localeCompare(b['journey']));
  }

  // function to return user 
  returnFilterMember() {
    return this.chatadminUsers.filter(e => this.mapProfileData[e]['name']?.toLowerCase().includes(this.filteredMember?.toLowerCase())).sort((a, b) => this.mapProfileData[a]['name']?.toLowerCase().localeCompare(this.mapProfileData[b]['name']?.toLowerCase()))
  }

  // function to return user 
  returnReviewedUser() {
    return this.chatadminUsers.filter(e => this.mapProfileData[e]['name']?.toLowerCase().includes(this.filteredReviewed?.toLowerCase())).sort((a, b) => this.mapProfileData[a]['name']?.toLowerCase().localeCompare(this.mapProfileData[b]['name']?.toLowerCase()))
  }

  // function to open snack bar 
  openSnackBar(message: string, action: string) {
    this.snackbar.open(message, action, { duration: 2000 })
  }

  // function to get color of table based on the ticket status 
  getStatusColor(status: string): string {
    if (status['status'].toLowerCase() === "open") {
      return 'row-open';
    } else if (status['status'].toLowerCase() === "closed") {
      return 'row-closed';
    }
    return '';
  }

  // function to get scroll location 
  onTableScroll(event: Event): void {
    const target = event.target as HTMLElement;
    this.savedScrollPosition = target.scrollTop;
  }

  // function to retrieve back scroll position 
  onTabChange(event: any): void {
    if (event.index === 0) {
      setTimeout(() => {
        if (this.tableContainer) {
          this.tableContainer.nativeElement.scrollTop = this.savedScrollPosition;
        }
      });
    }
  }

  // function to check whether my profileid present in review 
  isIdPresent(myObject): boolean {
    if (![null, undefined, ""].includes(myObject['review'])) {
      if (Object.keys(myObject['review']).length != 0) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  // function to open dialog of release log of this screen 
  openDialog(): void {
    const dialogRef = this.dialog.open(ReleaselogdialogComponent, {
      width: '100%',
      height: '85%',
      data: {
        currentUrl: this.router.url,
        currentComponent: this.router.url.split('/').pop() || ''
      }
    });
  }

  getMostRecentTimestampKey(obj: Record<string, any>): string | null {
    if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
      return null;
    }

    let mostRecentKey: string = null;
    let mostRecentDate: Date = new Date(0); // Start with oldest possible date

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const timestamp = obj[key];
        let currentDate: Date = null;

        // Handle different timestamp formats
        if (timestamp instanceof Date) {
          currentDate = timestamp;
        } else if (timestamp && typeof timestamp.toDate === 'function') {
          currentDate = timestamp.toDate(); // Firestore Timestamp object
        } else if (timestamp && timestamp._seconds !== undefined) {
          currentDate = new Date(timestamp._seconds * 1000); // Firestore seconds/nanoseconds format
        } else if (typeof timestamp === 'number') {
          currentDate = new Date(timestamp); // Numeric timestamp (in milliseconds)
        } else if (typeof timestamp === 'string' && !isNaN(Date.parse(timestamp))) {
          currentDate = new Date(timestamp); // ISO string date
        }

        // If we got a valid date and it's more recent than our current most recent
        if (currentDate && currentDate > mostRecentDate) {
          mostRecentDate = currentDate;
          mostRecentKey = key;
        }
      }
    }

    return mostRecentKey;
  }

  chatConfig() {
    this.dialog.open(ChatConfigComponent)
  }

}