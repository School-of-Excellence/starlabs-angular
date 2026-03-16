import { Component, OnInit, ViewChild, ChangeDetectorRef,TemplateRef } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ReactiveFormsModule, FormBuilder, FormControl, FormsModule, FormGroup, Validators } from '@angular/forms';
import { Firestore, collectionData, orderBy, query, where, collection, getDocs, doc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { CustomerChatScreenComponent } from '../customer-chat-screen/customer-chat-screen.component';
import { FlagReviewScreenComponent } from '../flag-review-screen/flag-review-screen.component';
import { MatTabsModule } from '@angular/material/tabs';
import { AddIssueComponent } from '../add-issue/add-issue.component';
import { MatDialog } from '@angular/material/dialog';
import { CustomerticketsComponent } from '../customertickets/customertickets.component';



@Component({
  selector: 'app-customer-ticket-new',
  imports: [MatChipsModule, MatFormFieldModule, MatInput, MatSelectModule,
    MatDatepickerModule, MatCardModule, MatIconModule, MatAutocompleteModule,
    ReactiveFormsModule, CommonModule, MatCheckboxModule, NgxMatSelectSearchModule,
    FormsModule, MatButtonModule, MatPaginatorModule, MatTabsModule,
    CustomerChatScreenComponent, FlagReviewScreenComponent, AddIssueComponent, CustomerticketsComponent
  ],
  templateUrl: './customer-ticket-new.component.html',
  styleUrl: './customer-ticket-new.component.css'
})
export class CustomerTicketNewComponent implements OnDestroy, OnInit {

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  subscribitons = {}
  tempIssues: any = []
  clientIssues: any = []
  isLoading: boolean = true
  isAllDataLoaded: boolean = false
  private loadingStates = {
    journeyData: false,
    profileData: false,
    userRole: false,
    chatConfig: false,
    clientTicket: false
  };

  form: any = new FormBuilder()
  initialFormValues

  journeyList = [];
  categoryList = [];
  assignToList = []
  chatStatusList = [];

  mapJourney = {};
  mapProfileData = {};
  mapProfileImage = {};

  // autocomplete helpers
  filteredJourney: string = "";
  filteredAssign: string = "";

  // filter
  filters = {
    category: [],
    chatStatus: [],
    status: ''
  }

  pageIndex: number = 0
  pageSize: number = 5
  popupData: any = null

  categories = []
  validators = [];
  statuslist = [];
  ticketArray: any[] = [{ label: "Customer Support Dashboard" }, { label: "Customer Tickets" }];
  negligencelist = [];
  loginRoles = {};
  mapUserId = {}
  profile_id: string = '';
  chatAdmin: string = "";
  selectedTabIndex: number = 0
  weekNumber!: number;
  weekYear!: number;

  recentTicketNumber = 0;

  // Tag dialog properties
  showTagDialog: boolean = false;
  showUntagDialog: boolean = false;
  currentTagTicket: any = null;
  tagForm: FormGroup;
  minDate: Date = new Date();
  taggedCalendarDialogRef: any = null;


  @ViewChild('taggedCalendarDialogTemplate') taggedCalendarDialogTemplate: TemplateRef<any>;
  selectedTagCalendarDate: Date = new Date();
  selectedDateTaggedTickets: any[] = [];

  timeOptions = [
  { label: '12:00 AM', value: '00:00' },
  { label: '12:30 AM', value: '00:30' },
  { label: '1:00 AM', value: '01:00' },
  { label: '1:30 AM', value: '01:30' },
  { label: '2:00 AM', value: '02:00' },
  { label: '2:30 AM', value: '02:30' },
  { label: '3:00 AM', value: '03:00' },
  { label: '3:30 AM', value: '03:30' },
  { label: '4:00 AM', value: '04:00' },
  { label: '4:30 AM', value: '04:30' },
  { label: '5:00 AM', value: '05:00' },
  { label: '5:30 AM', value: '05:30' },
  { label: '6:00 AM', value: '06:00' },
  { label: '6:30 AM', value: '06:30' },
  { label: '7:00 AM', value: '07:00' },
  { label: '7:30 AM', value: '07:30' },
  { label: '8:00 AM', value: '08:00' },
  { label: '8:30 AM', value: '08:30' },
  { label: '9:00 AM', value: '09:00' },
  { label: '9:30 AM', value: '09:30' },
  { label: '10:00 AM', value: '10:00' },
  { label: '10:30 AM', value: '10:30' },
  { label: '11:00 AM', value: '11:00' },
  { label: '11:30 AM', value: '11:30' },
  { label: '12:00 PM', value: '12:00' },
  { label: '12:30 PM', value: '12:30' },
  { label: '1:00 PM', value: '13:00' },
  { label: '1:30 PM', value: '13:30' },
  { label: '2:00 PM', value: '14:00' },
  { label: '2:30 PM', value: '14:30' },
  { label: '3:00 PM', value: '15:00' },
  { label: '3:30 PM', value: '15:30' },
  { label: '4:00 PM', value: '16:00' },
  { label: '4:30 PM', value: '16:30' },
  { label: '5:00 PM', value: '17:00' },
  { label: '5:30 PM', value: '17:30' },
  { label: '6:00 PM', value: '18:00' },
  { label: '6:30 PM', value: '18:30' },
  { label: '7:00 PM', value: '19:00' },
  { label: '7:30 PM', value: '19:30' },
  { label: '8:00 PM', value: '20:00' },
  { label: '8:30 PM', value: '20:30' },
  { label: '9:00 PM', value: '21:00' },
  { label: '9:30 PM', value: '21:30' },
  { label: '10:00 PM', value: '22:00' },
  { label: '10:30 PM', value: '22:30' },
  { label: '11:00 PM', value: '23:00' },
  { label: '11:30 PM', value: '23:30' }
  ];

  constructor(
    private firestore: Firestore,
    public authservice: AuthguardService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder
  ) {
    this.form = this.form.group({
      search: ['', []],
      journey: [[], []],
      assignto: [[], []],
      startDate: ['', []],
      endDate: ['', []],
      priority: ['', []]
    })

    // Initialize tag form
    this.tagForm = this.fb.group({
      date: ['', Validators.required],
      time: ['', Validators.required]
    });

    this.initialFormValues = this.form.getRawValue()
    this.setWeek()
    this.config()
    this.initTabs()
  }

  ngOnInit(): void {
    this.fetchClientIssues()

  }

  ngOnDestroy(): void {
    this.subscribitons['clientissue'].unsubscribe()
  }


  initTabs() {
    let ticketsArray = JSON.parse(localStorage.getItem('newtickets') || '[]')
    ticketsArray = ticketsArray.filter((tab) => !tab.label.includes('Dashboard') && !tab.label.includes('Tickets'))
    this.ticketArray = [...this.ticketArray, ...ticketsArray]
  }

  config() {
    this.fetchJourney()
    this.fetchProfileData()
    this.fetchChatConfig()
    this.fetchUserRole()
  }

  // Function to check if all data is loaded 
  private checkAllDataLoaded(): void {
    const allLoaded = Object.values(this.loadingStates).every(state => state === true);
    this.isAllDataLoaded = allLoaded
    if (allLoaded) {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // Function to view loading progress of the screen 
  getLoadingProgress(): number {
    const loaded = Object.values(this.loadingStates).filter(state => state === true).length;
    const total = Object.keys(this.loadingStates).length;
    return (loaded / total) * 100;
  }


  // function to fetch issues form "clientissue"
  fetchClientIssues() {
    const q = query(collection(this.firestore, 'clientissue'), orderBy('reporteddate', 'desc'))
    this.subscribitons['clientissue'] = collectionData(q, { idField: 'id' }).subscribe((issue) => {
      if (issue.length != 0) {
        this.recentTicketNumber = issue[0]['issueno'];
      } else {
        console.log("No Tickets Found");
      }
      this.clientIssues = issue
      this.tempIssues = issue.filter((clissue, index) => {
        const falseOptions = [null, undefined, '']
        const assign = clissue['assign']
        const category = clissue['category']
        const chatStatus = clissue['chatstatus']

        if (!falseOptions.includes(assign) && Array.isArray(assign)) {
          assign.forEach((userId) => {
            if (!this.assignToList.includes(userId)) {
              this.assignToList.push(userId)
            }
          })
        }

        if (!falseOptions.includes(category) && !this.categoryList.includes(category)) {
          this.categoryList.push(category)
        }

        if (!falseOptions.includes(chatStatus) && !this.chatStatusList.includes(chatStatus)) {
          this.chatStatusList.push(chatStatus)
        }

        return this.filterTicket(clissue)
      })
      this.isLoading = false
      this.loadingStates.clientTicket = true
      this.checkAllDataLoaded()
      
    })

  }

  // function to fetch list of journey's from "journey" collection
  async fetchJourney() {
    const journey = await this.authservice.getJourneyMap()
    this.mapJourney = journey;
    for (const key in this.mapJourney) {
      var map = {
        "id": key,
        "journey": this.mapJourney[key]
      }
      this.journeyList.push(map);
    }
    this.journeyList.sort((a, b) => a['journey'].localeCompare(b['journey']));
    this.loadingStates.journeyData = true
    this.checkAllDataLoaded()

  }

  // function to fetch profile data from "profile_data" collection using authservice
  async fetchProfileData() {
    const profileData = await this.authservice.getProfileMap();
    this.mapProfileData = profileData.docdata;
    this.mapProfileImage = profileData.profileimage
    this.loadingStates.profileData = true
    this.checkAllDataLoaded()
  }

  // function to fetch chat data from "chat config" collection using authservice
  async fetchChatConfig() {
    const chatconfigRef = collection(this.firestore, 'chat config');
    const chatConfig = await getDocs(chatconfigRef);

    if (chatConfig.docs.length != 0) {
      this.categories = chatConfig.docs[0].data()['categories'];
      this.statuslist = chatConfig.docs[0].data()['status'];
      this.validators = chatConfig.docs[0].data()['validators'] ?? [];
      this.negligencelist = chatConfig.docs[0].data()['negligencecategories'] ?? [];
    } else {
      console.log('No Chat Configuration Data Found :(');
    }
    this.loadingStates.chatConfig = true
    this.checkAllDataLoaded()
  }

  // function to fetch user role from "user_data" using authservice
  async fetchUserRole() {
    const userRole = await this.authservice.getRoles()
    this.loginRoles = userRole
    this.chatAdmin = userRole['chatxadmin'] ?? false
    this.profile_id = userRole['profile_ref'].id ?? null
    this.loadingStates.userRole = true
    this.checkAllDataLoaded()
  }

  // function to filter journy for autocomplete of journey filter
  returnFilterJourney() {
    return this.journeyList.filter(e => e.journey.toLowerCase().includes(this.filteredJourney?.toLowerCase())).sort((a, b) => a['journey'].localeCompare(b['journey']));
  }

  // function to filter assign to for autocomplete of assign filter
  returnFilterMember() {
    return this.assignToList.filter(e => this.mapProfileData[e]['name']?.toLowerCase().includes(this.filteredAssign?.toLowerCase())).sort((a, b) => this.mapProfileData[a]['name']?.toLowerCase().localeCompare(this.mapProfileData[b]['name']?.toLowerCase()))
  }

  // function to check whether the ticket passes the filters
  filterTicket(ticket: any) {
    let filterOptions = { ...this.filters, ...this.form.value }
    let startDate = new Date(filterOptions.startDate)
    startDate.setHours(0, 0, 0, 0)
    let endDate = new Date(filterOptions.endDate)
    endDate.setHours(23, 59, 59, 999)

    // Add tagged status check
    let statusMatch = true;
    if (![null, undefined, ''].includes(filterOptions.status)) {
      if (filterOptions.status === 'tagged') {
        statusMatch = ticket?.tag === true;
      } else {
        statusMatch = filterOptions.status.includes(ticket?.status?.status?.toLowerCase());
      }
    }

    if (((ticket.issue?.toLowerCase().trim().replace(/\s/g, "").indexOf(filterOptions.search != '' ? filterOptions.search?.toLowerCase().trim().replace(/\s/g, "") : '') > -1)
      || (ticket.name?.toLowerCase().trim().replace(/\s/g, "").indexOf(filterOptions.search != '' ? filterOptions.search?.toLowerCase().trim().replace(/\s/g, "") : '') > -1)
      || (ticket.issueno?.toString().trim().replace(/\s/g, "").indexOf(filterOptions.search != '' ? filterOptions.search.toString().toLowerCase().trim().replace(/\s/g, "") : '') > -1))
      && (filterOptions.journey.length != 0 ? filterOptions.journey.includes(ticket.journey?.id) : true)
      && (filterOptions.assignto.length != 0 ? filterOptions.assignto.some(item => ticket.assign?.includes(item)) : true) &&
      (filterOptions.category.length != 0 ? filterOptions.category.includes(ticket?.category?.toLowerCase()) : true) &&
      (filterOptions.chatStatus.length != 0 ? filterOptions.chatStatus.includes(ticket?.chatstatus?.toLowerCase()) : true) &&
      statusMatch && // Use the new status matching logic
      (![null, undefined, ''].includes(filterOptions.startDate) ? ticket.reporteddate?.toDate() >= startDate : true) &&
      (![null, undefined, ''].includes(filterOptions.endDate) ? ticket.reporteddate?.toDate() <= endDate : true)
    ) {
      return ticket
    }

    return false
  }
  // Function to format tag date and time for display
  formatTagDate(tagdate: any): string {
    if (![null, undefined, ''].includes(tagdate)) {
      let date: Date;
      
      if (tagdate.toDate && typeof tagdate.toDate === 'function') {
        date = tagdate.toDate();
      } else if (tagdate instanceof Date) {
        date = tagdate;
      } else {
        return '';
      }      
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      };
      
      return date.toLocaleString('en-US', options);
    }
    
    return '';
  }

  // Open tagged tickets calendar dialog
  openTaggedCalendarDialog() {
    this.taggedCalendarDialogRef = this.dialog.open(this.taggedCalendarDialogTemplate, {
      autoFocus: false,
      panelClass: 'calendar-dialog-container',
      width: '900px',
      maxHeight: '90vh'
    });

    this.selectedTagCalendarDate = new Date();
    this.onTagCalendarDateSelected(this.selectedTagCalendarDate);
  }

  closeTaggedCalendarDialog() {
    if (this.taggedCalendarDialogRef) {
      this.taggedCalendarDialogRef.close();
      this.taggedCalendarDialogRef = null;
    }
  }

  // Handle date selection in calendar
  onTagCalendarDateSelected(date: Date) {
    this.selectedTagCalendarDate = date;
    this.getTaggedTicketsForDate();
  }

  // Get tagged tickets for selected date
  getTaggedTicketsForDate() {
    if (!this.selectedTagCalendarDate) {
      this.selectedDateTaggedTickets = [];
      return;
    }

    const startDate = new Date(this.selectedTagCalendarDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(this.selectedTagCalendarDate);
    endDate.setHours(23, 59, 59, 999);

    this.selectedDateTaggedTickets = this.clientIssues.filter(ticket => {
      if (ticket.tag !== true || !ticket.tagdate) return false;
      
      let tagDate: Date;
      if (ticket.tagdate.toDate && typeof ticket.tagdate.toDate === 'function') {
        tagDate = ticket.tagdate.toDate();
      } else if (ticket.tagdate instanceof Date) {
        tagDate = ticket.tagdate;
      } else {
        return false;
      }
      
      return tagDate >= startDate && tagDate <= endDate;
    });
  }

  // Check if date has tagged tickets (for calendar dots)
  hasTaggedTicketsOnDate(date: Date): boolean {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    return this.clientIssues.some(ticket => {
      if (ticket.tag !== true || !ticket.tagdate) return false;
      
      let tagDate: Date;
      if (ticket.tagdate.toDate && typeof ticket.tagdate.toDate === 'function') {
        tagDate = ticket.tagdate.toDate();
      } else if (ticket.tagdate instanceof Date) {
        tagDate = ticket.tagdate;
      } else {
        return false;
      }
      
      return tagDate >= startDate && tagDate <= endDate;
    });
  }

  taggedDateClass = (date: Date): string => {
    const hasTickets = this.hasTaggedTicketsOnDate(date);
    return hasTickets ? 'has-schedule-dot' : '';
  };

  // Get count of tagged tickets for today
  getTodayTaggedCalendarCount(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.clientIssues.filter(ticket => {
      if (ticket.tag !== true || !ticket.tagdate) return false;
      
      let tagDate: Date;
      if (ticket.tagdate.toDate && typeof ticket.tagdate.toDate === 'function') {
        tagDate = ticket.tagdate.toDate();
      } else if (ticket.tagdate instanceof Date) {
        tagDate = ticket.tagdate;
      } else {
        return false;
      }
      
      return tagDate >= today && tagDate < tomorrow;
    }).length;
  }

  // Get count of tagged tickets for current month
  getMonthTaggedCalendarCount(): number {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return this.clientIssues.filter(ticket => {
      if (ticket.tag !== true || !ticket.tagdate) return false;
      
      let tagDate: Date;
      if (ticket.tagdate.toDate && typeof ticket.tagdate.toDate === 'function') {
        tagDate = ticket.tagdate.toDate();
      } else if (ticket.tagdate instanceof Date) {
        tagDate = ticket.tagdate;
      } else {
        return false;
      }
      
      return tagDate.getMonth() === currentMonth && tagDate.getFullYear() === currentYear;
    }).length;
  }

  // function to reset filters
  resetFilter() {
    this.form.reset(this.initialFormValues)
    this.filters = {
      category: [],
      chatStatus: [],
      status: ''
    }
    this.applyFilter()
  }


  // function to apply filters or trigger filter option
  applyFilter() {
    console.log('filter : ', this.filters)
    console.log(this.categoryList)
    
    this.pageIndex = 0
    this.paginator?.firstPage()
    this.tempIssues = this.clientIssues.filter((ticket) => this.filterTicket(ticket))
    
    // NEW: Sort tagged tickets by tagdate in ascending order
    if (this.filters.status === 'tagged') {
      this.tempIssues.sort((a, b) => {
        const dateA = this.getTagDateAsTimestamp(a.tagdate);
        const dateB = this.getTagDateAsTimestamp(b.tagdate);
        
        return dateA - dateB;         
      });
    }
    
    console.log('this is from apply filters : ', this.pageIndex)
  }

  private getTagDateAsTimestamp(tagdate: any): number {
    if (!tagdate) return 0;
    
    let date: Date;
    
    if (tagdate.toDate && typeof tagdate.toDate === 'function') {
      date = tagdate.toDate();
    } else if (tagdate instanceof Date) {
      date = tagdate;
    } else if (typeof tagdate === 'number') {
      return tagdate;
    } else {
      return 0;
    }
    
    return date.getTime();
  }

  // Function to check if tag date has expired/passed - DATE ONLY
  isTagExpired(tagdate: any): boolean {
    if (![null, undefined, ''].includes(tagdate)) {
      let tagDateObj: Date;
      
      // Handle Firestore Timestamp
      if (tagdate.toDate && typeof tagdate.toDate === 'function') {
        tagDateObj = tagdate.toDate();
      } else if (tagdate instanceof Date) {
        tagDateObj = tagdate;
      } else {
        return false;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tagDate = new Date(tagDateObj);
      tagDate.setHours(0, 0, 0, 0);
      return tagDate < today;
    }
    return false;
  }

  // Function to get count of tagged tickets for today
  getTaggedTodayCount(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.clientIssues.filter(ticket => {
      if (ticket.tag !== true || !ticket.tagdate) return false;
      
      let tagDate: Date;
      if (ticket.tagdate.toDate && typeof ticket.tagdate.toDate === 'function') {
        tagDate = ticket.tagdate.toDate();
      } else if (ticket.tagdate instanceof Date) {
        tagDate = ticket.tagdate;
      } else {
        return false;
      }
      
      return tagDate >= today && tagDate < tomorrow;
    }).length;
  }

  // Function to get count of upcoming tagged tickets (future dates)
  getTaggedUpcomingCount(): number {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.clientIssues.filter(ticket => {
      if (ticket.tag !== true || !ticket.tagdate) return false;
      
      let tagDate: Date;
      if (ticket.tagdate.toDate && typeof ticket.tagdate.toDate === 'function') {
        tagDate = ticket.tagdate.toDate();
      } else if (ticket.tagdate instanceof Date) {
        tagDate = ticket.tagdate;
      } else {
        return false;
      }
      
      return tagDate >= tomorrow;
    }).length;
  }

  // Function to get count of expired/overdue tagged tickets - DATE ONLY
  getTaggedExpiredCount(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    return this.clientIssues.filter(ticket => {
      if (ticket.tag !== true || !ticket.tagdate) return false;
      
      let tagDateObj: Date;
      if (ticket.tagdate.toDate && typeof ticket.tagdate.toDate === 'function') {
        tagDateObj = ticket.tagdate.toDate();
      } else if (ticket.tagdate instanceof Date) {
        tagDateObj = ticket.tagdate;
      } else {
        return false;
      }      
      const tagDate = new Date(tagDateObj);
      tagDate.setHours(0, 0, 0, 0);      
      return tagDate < today;
    }).length;
  }

  // Function to get total tagged tickets count
  getTotalTaggedCount(): number {
    return this.clientIssues.filter(ticket => ticket.tag === true).length;
  }

  // Function to filter and display tagged tickets by category
  filterTaggedTickets(category: 'today' | 'upcoming' | 'overdue') {
    this.resetFilter();    
    this.filters.status = 'tagged';
    this.applyFilter();
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.tempIssues = this.tempIssues.filter(ticket => {
      if (ticket.tag !== true || !ticket.tagdate) return false;
      
      let tagDateObj: Date;
      if (ticket.tagdate.toDate && typeof ticket.tagdate.toDate === 'function') {
        tagDateObj = ticket.tagdate.toDate();
      } else if (ticket.tagdate instanceof Date) {
        tagDateObj = ticket.tagdate;
      } else {
        return false;
      }
      
      const tagDate = new Date(tagDateObj);
      tagDate.setHours(0, 0, 0, 0);
      
      switch(category) {
        case 'today':
          return tagDate >= today && tagDate < tomorrow;
        case 'upcoming':
          return tagDate >= tomorrow;
        case 'overdue':
          return tagDate < today; 
        default:
          return false;
      }
    });
    
    // Sort by tagdate ascending
    this.tempIssues.sort((a, b) => {
      const dateA = this.getTagDateAsTimestamp(a.tagdate);
      const dateB = this.getTagDateAsTimestamp(b.tagdate);
      return dateA - dateB;
    });
    
    // Reset pagination
    this.pageIndex = 0;
    this.paginator?.firstPage();
  }

  // function to format user profile image
  getProfileImage(clientId: string) {
    if (![null, undefined, ''].includes(clientId) && ![null, undefined, ''].includes(this.mapProfileImage[clientId])) {
      return this.mapProfileImage[clientId]
    }
    return 'https://www.pngall.com/wp-content/uploads/5/Profile.png'
  }

  // function to format timestamp
  formatTimeStamp(timeStamp) {
    if (![null, undefined, ''].includes(timeStamp)) {
      const oneDay = 1000 * 60 * 60 * 24;
      const reportedDate = timeStamp.toDate()
      const currentDate = new Date()

      const diff = Math.abs(currentDate.getTime() - reportedDate.getTime());
      return Math.floor(diff / oneDay);

    }

    return ''
  }


  mapAssignTo(assignTo) {
    if (![null, undefined, ''].includes(assignTo)) {
      return assignTo.map((userId) => this.mapProfileData[userId]['name'])
    }
    return 'not assigned'
  }

  // function to handle pagination
  onPageChange(event: any) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  // function to showpopup with ticket details
  showPopup(row: any, event: MouseEvent) {
    const popupWidth = 300;
    const popupHeight = 200;
    const offset = 30;

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

  // function to hide ticket popup
  hidePopup() {
    this.popupData = null;
  }

  // function to open ticket review
  async messageIssue(event: MouseEvent, value, review) {

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
        if (event.ctrlKey || event.metaKey) {
          this.selectedTabIndex = 0;
        } else {
          this.selectedTabIndex = this.ticketArray.length;
        }
      } else {
        if (event.ctrlKey || event.metaKey) {
          this.selectedTabIndex = 0;
        } else {
          this.selectedTabIndex = index
        }
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
        if (event.ctrlKey || event.metaKey) {
          this.selectedTabIndex = 0;
        } else {
          this.selectedTabIndex = this.ticketArray.length;
        }
      } else {
        if (event.ctrlKey || event.metaKey) {
          this.selectedTabIndex = 0;
        } else {
          this.selectedTabIndex = index + 1;
        }
      }
    }

    // store tickets opened in localstorage for opening even after screen is closed 
    localStorage.setItem('newtickets', JSON.stringify(this.ticketArray));
  }

  // function to close tabs
  closeTab(index) {
    localStorage.removeItem('newtickets');
    this.ticketArray.splice(index, 1);
    localStorage.setItem('newtickets', JSON.stringify(this.ticketArray));
  }

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
      height: "95%",
      width: "95%",
      disableClose: true
    });
  }

  // function to check id present or not

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

  // function to get most recent timestamp
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

  // function to set weeknumber and weekyear
  setWeek(): void {
    const tempDate = new Date();
    tempDate.setHours(0, 0, 0, 0);

    this.weekYear = tempDate.getFullYear();

    const dayOffset = (tempDate.getDay() - 2 + 7) % 7;
    tempDate.setDate(tempDate.getDate() - dayOffset);

    const yearStart = new Date(tempDate.getFullYear(), 0, 1);
    const yearStartDay = (yearStart.getDay() - 2 + 7) % 7;
    yearStart.setDate(yearStart.getDate() + (yearStartDay === 0 ? 0 : 7 - yearStartDay));

    const daysSinceYearStart = Math.floor((tempDate.getTime() - yearStart.getTime()) / 86400000);
    const weekNumber = Math.floor(daysSinceYearStart / 7) + 1;

    this.weekNumber = weekNumber
  }

  tabChange(filter: any) {
    this.resetFilter()
    if (![null, undefined, ''].includes(filter?.category) && this.categoryList.some((cat) => cat.toLowerCase() === filter.category)) {
      this.filters.category.push(filter.category)
    }

    if (![null, undefined, ''].includes(filter?.chatStatus) && this.chatStatusList.some((chat) => chat.toLowerCase() === filter.chatStatus)) {
      this.filters.chatStatus.push(filter.chatStatus)
    }

    if (![null, undefined, ''].includes(filter?.date)) {
      switch (filter.date) {
        case 'under2':
          let date = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000))
          this.form.get('startDate')?.setValue(date)
          this.form.get('endDate')?.setValue(new Date())
          break;
        case '2to7':
          const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          this.form.get('startDate')?.setValue(sevenDaysAgo)
          this.form.get('endDate')?.setValue(twoDaysAgo)
          break

        case 'over7':
          const moreThan7Days = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
          this.form.get('endDate')?.setValue(moreThan7Days)
          break
        default:
          break;
      }
    }

    if (![null, undefined, ''].includes(filter?.status)) {
      this.filters.status = filter.status
    }

    console.log(this.form.value)
    this.applyFilter()

    this.selectedTabIndex = 1
  }

  onTabSwitch() {
    if (!this.isAllDataLoaded) {
      this.isLoading = true
    }
  }

  isTagged(ticket: any): boolean {
    return ticket?.tag === true;
  }

  // Function to handle tag icon click
  handleTagClick(event: MouseEvent, ticket: any) {
    event.stopPropagation(); 
    this.currentTagTicket = ticket;
    if (this.isTagged(ticket)) {
      this.showUntagDialog = true;
    } else {
      this.tagForm.reset();
      this.showTagDialog = true;
    }
  }

  closeTagDialog() {
    this.showTagDialog = false;
    this.tagForm.reset();
    this.currentTagTicket = null;
  }

  closeUntagDialog() {
    this.showUntagDialog = false;
    this.currentTagTicket = null;
  }

  async confirmTag() {
    if (this.tagForm.valid && this.currentTagTicket) {
      const date = this.tagForm.get('date')?.value;
      const time = this.tagForm.get('time')?.value;
      
      const [hours, minutes] = time.split(':');
      const tagDateTime = new Date(date);
      tagDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      await this.tagTicket(this.currentTagTicket.id, tagDateTime);
      this.closeTagDialog();
    }
  }
  async confirmUntag() {
    if (this.currentTagTicket) {
      await this.untagTicket(this.currentTagTicket.id);
      this.closeUntagDialog();
    }
  }
  async tagTicket(ticketId: string, tagdate: Date) {
    try {
      const ticketRef = doc(this.firestore, 'clientissue', ticketId);
      await updateDoc(ticketRef, {
        tag: true,
        tagdate: Timestamp.fromDate(tagdate)
      });
      console.log('Ticket tagged successfully');
    } catch (error) {
      console.error('Error tagging ticket:', error);
    }
  }
  async untagTicket(ticketId: string) {
    try {
      const ticketRef = doc(this.firestore, 'clientissue', ticketId);
      await updateDoc(ticketRef, {
        tag: false,
        tagdate: null
      });
      console.log('Ticket untagged successfully');
    } catch (error) {
      console.error('Error untagging ticket:', error);
    }
  }

}