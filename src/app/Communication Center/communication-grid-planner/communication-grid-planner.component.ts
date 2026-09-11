import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { arrayUnion, collection, collectionData, doc, Firestore, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, where, writeBatch } from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { forkJoin, Subject, Subscription, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { ParticipantsAnalyticsComponent } from '../../Participants Profile Management/participants-analytics/participants-analytics.component';
import { WatiService } from '../../wati.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

const FAVOURITES_KEY = 'wati_favourite_templates';

// calender day
export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean
}

// Interface for email log entry
interface EmailLog {
  docid: string;
  emailarchiveid: string;
  email: string;
  profileid?: string;
  msgstatus: string; // sent, delivery, open, click, bounce, subscriptionchange, failed
  timestamp?: any;
  metadata?: any;
}

// Interface for participant with all statuses
export interface Participant {
  email: string;
  profileid?: string;
  name?: string;
  statuses: {
    sent: boolean;
    delivery: boolean;
    open: boolean;
    click: boolean;
    bounce: boolean;
    subscriptionchange: boolean;
    failed: boolean;
    notSent: boolean;
  };
  statusTimestamps: {
    sent?: any;
    delivery?: any;
    open?: any;
    click?: any;
    bounce?: any;
    subscriptionchange?: any;
    failed?: any;
  };
  lastActivity?: any;
}

// Interface for status counts
interface StatusCounts {
  sent: number;
  delivery: number;
  open: number;
  click: number;
  bounce: number;
  subscriptionchange: number;
  failed: number;
  notSent: number;
  total: number;
}

@Component({
  selector: 'app-communication-grid-planner',
  imports: [
    CommonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatSelectModule,
    MatButtonModule,
    FormsModule,
    ParticipantsAnalyticsComponent,
    NgxMatSelectSearchModule
  ],
  templateUrl: './communication-grid-planner.component.html',
  styleUrl: './communication-grid-planner.component.css'
})

export class CommunicationGridPlannerComponent implements OnInit, OnDestroy {

  @ViewChild('commnunicationGridPlanner', { static: false }) commnunicationGridPlanner !: ElementRef;

  private destroy$ = new Subject<void>();

  activeTab: 'calendar' | 'library' = 'calendar';
  displayedMonth: Date = new Date();
  calendarDays = []
  months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  loggedInProfile = null;
  localStorageKey = 'communicationform';

  // communication planner
  dateBasedMap = {};
  communicationPlanner = [];
  eventBasedGroupMap = {};
  selectedCommunication = null;
  openedCommunications = [];

  // profile data
  mapProfile = {};

  // archive 
  emailArchieve = {};
  watiArchieve = {};
  appNotitication = {};

  // archive log for current month
  currentMonthEmail = [];
  currentMonthWati = [];
  currentMonthAppNotification = [];

  // email template
  emailTemplates = [];
  emailTemplateMap = {};

  // wati template
  serverUrls: any[] = [];
  watiTemplates = [];
  filteredTemplates = [];
  displayTemplates = [];
  favouriteIds: Set<string> = new Set<string>();
  favouriteTemplates: any[] = [];
  searchTemplate = '';
  iswatiSearching = false;
  isWatiTemplateAvailable = true;
  watiTemplateMap = {};
  readonly DISPLAY_LIMIT = 50;
  hasMoreTemplates = false;
  watiTemplateLoading = false;

  private searchSubject = new Subject<string>();

  // events data
  eventList = [];
  eventMap = {};
  selectedEvent = null;
  upcomingEvents = [];

  loadingStatus = {
    communicationPlanner: true,
    emailArchieve: true,
    watiArchieve: true,
    appNotitication: true
  }

  subscriptions: { [key: string]: Subscription } = {}

  // wati pop
  selectedRecord = signal<any>(null);
  showParticipantsPopup = signal<boolean>(false);
  filteredHeldParticipants: any[] = [];
  participantSearchText = '';
  filteredWatiParticipants = [];
  allWatiParticipants: any = []

  // communication form
  communicationForm: FormArray<FormGroup> = new FormArray<FormGroup>([]);
  communicationFormMode: 'add' | 'edit' | null = null;

  // communicationLog = {};
  communicationEmailLog = {};
  communicationwatilLog = {};
  communicationAppNotificationLog = {};

  // Unified Participants Popup Properties
  showParticipantsModal = false;
  selectedArchiveForPopup: any = null;
  allParticipants: Participant[] = [];
  filteredParticipants: Participant[] = [];
  participantSearchFilter = '';
  heldParticipants: any[] = [];
  selectedStatusFilters: string[] = ['all']; // 'all', 'sent', 'delivery', 'open', 'click', 'bounce', 'subscriptionchange', 'failed', 'notSent'
  participantStatusCounts: StatusCounts = {
    sent: 0,
    delivery: 0,
    open: 0,
    click: 0,
    bounce: 0,
    subscriptionchange: 0,
    failed: 0,
    notSent: 0,
    total: 0
  };

  constructor(
    private firestore: Firestore,
    private from: FormBuilder,
    private sanitizer: DomSanitizer,
    private router: Router,
    private authService: AuthguardService,
    private watiService: WatiService,
    private snackBar: MatSnackBar,
  ) {
    this.buildCalendar();
    this.authService.getRoles().then((data) => this.loggedInProfile = data);
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(t => { this.searchTemplate = t; this.applyFiltersAndLimit(); this.iswatiSearching = false; });
  }

  ngOnInit(): void {
    this.initializeProfileData();
    this.fetchCommunicationPlanner();
    this.subscribeCommunicationToCurrentMonth();
    this.fetchEmailArchieve();
    this.fetchWatiArchieve();
    this.fetchAppNotification();
    this.fetchEvents();
    this.fetchEmailTemplates();
    this.fetchWatiTemplates();
    this.loadTemplatesFromAllServers();
  }

  ngOnDestroy(): void {
    Object.keys(this.subscriptions).forEach((key) => {
      if (this.subscriptions[key]?.unsubscribe) { this.subscriptions[key]?.unsubscribe() }
    });
    this.destroy$.next(); this.destroy$.complete();
  }

  // function to initialize participants profiles
  private initializeProfileData(): void {
    this.authService.getProfileMap().then((data) => {
      this.mapProfile = data.docdata;
    });
  }

  // function to handle tab switch
  onActiveTabChange(tab) {
    if (tab !== this.activeTab) { this.activeTab = tab };
    this.communicationFormMode = null;
    this.communicationForm.clear();
    this.selectedCommunication = null;
    this.openedCommunications = [];
  }

  // is all load
  isAllLoaded() {
    return Object.values(this.loadingStatus).some((val) => val)
  }

  // function to select previous month
  prevMonth() {
    this.displayedMonth = new Date(
      this.displayedMonth.getFullYear(),
      this.displayedMonth.getMonth() - 1,
      1
    );
    this.buildCalendar();
    this.fetchCommunicationPlanner();
    this.fetchEmailArchieve();
    this.fetchWatiArchieve();
    this.fetchAppNotification()
  }

  // function to select next month
  nextMonth() {
    this.displayedMonth = new Date(
      this.displayedMonth.getFullYear(),
      this.displayedMonth.getMonth() + 1,
      1
    );
    this.buildCalendar();
    this.fetchCommunicationPlanner();
    this.fetchEmailArchieve();
    this.fetchWatiArchieve();
    this.fetchAppNotification()
  }

  // function to build calender view
  buildCalendar() {
    const year = this.displayedMonth.getFullYear();
    const month = this.displayedMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let offset = firstDay.getDay() - 1;
    if (offset < 0) offset = 6;

    const days: CalendarDay[] = [];

    for (let i = offset - 1; i >= 0; i--) {
      days.push(this.makeDay(new Date(year, month, -i), false));
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(this.makeDay(new Date(year, month, d), true));
    }

    let next = 1;
    while (days.length % 7 !== 0) {
      days.push(this.makeDay(new Date(year, month + 1, next++), false));
    }

    this.calendarDays = days;
  }

  // function to build calender days cell
  makeDay(date: Date, isCurrentMonth: boolean): CalendarDay {
    return {
      date,
      isCurrentMonth,
      isToday: this.isSameDay(date, new Date()),
    };
  }

  // function to compare two dates
  isSameDay(a: Date, b: Date): boolean {
    return a.getDate() === b.getDate() &&
      a.getMonth() === b.getMonth() &&
      a.getFullYear() === b.getFullYear();
  }

  // function to check is current date
  checkIsToday(date: any) {
    const d = this.toDate(date);
    if (d) {
      return this.isSameDay(new Date(), d);
    }
    return null
  }

  // check is current month
  isCurrentMonth() {
    const currentMonth = new Date();
    const selectedMonth = new Date(this.displayedMonth);

    return currentMonth.getMonth() === selectedMonth.getMonth() &&
      currentMonth.getFullYear() === selectedMonth.getFullYear();
  }

  // get communicatoins planned for day
  getCommunicationForDay(date: Date) {
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.dateBasedMap, key)) {
      return this.dateBasedMap[key];
    }
    return []
  }

  // get email communicatoins planned for day
  getEmailForDay(date: Date) {
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.emailArchieve, key)) {
      return this.emailArchieve[key];
    }
    return []
  }

  // get wati communicatoins planned for day
  getWatiForDay(date: Date) {
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.watiArchieve, key)) {
      return this.watiArchieve[key];
    }
    return []
  }

  // get app notification communicatoins planned for day
  getAppNotificationForDay(date: Date) {
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.appNotitication, key)) {
      return this.appNotitication[key];
    }
    return []
  }

  // ==================== COMMUNICATION FROM ====================

  // function to open form
  openCommunicationForm() {
    this.communicationFormMode = 'add';
    this.addCommunicationFrom();
  }

  // function to add new communication to form
  addCommunicationFrom(date = new Date()) {
    this.communicationForm.push(
      this.from.group({
        docid: [doc(collection(this.firestore, 'communication planner')).id],
        title: ['', { validators: [Validators.required], update: "change" }],
        date: [date, { validators: [Validators.required], update: "change" }],
        eventref: [null, { validators: [Validators.required], update: "change" }],
        type: 'event',
        emailtemplate: [null],
        watitemplate: [null],
        apptemplate: [null],
      })
    );
  }

  // function remove added communication from formarray
  removeCommunicationForm(index) {
    if (this.communicationForm?.controls.length === 1) {
      this.communicationFormMode = null;
    }
    this.communicationForm.removeAt(index);
  }

  // validate communication form
  validateFrom() {
    return this.communicationForm.controls.every((from) => from.valid);
  }

  // save communication form
  async saveCommunicationFrom() {
    if (this.validateFrom()) {
      try {
        const batch = writeBatch(this.firestore);
        this.communicationForm.controls.forEach((form) => {
          const values = form.value;
          const docref = values?.docid ? doc(collection(this.firestore, 'communication planner'), values?.docid) : doc(collection(this.firestore, 'communication planner'));
          const eventRef = doc(collection(this.firestore, 'event collection'), values.eventref);
          let lastupated = null
          if (this.communicationFormMode === 'add') {
            lastupated = [
              {
                updatedby: this.loggedInProfile['profile_ref']?.id,
                date: Timestamp.fromDate(new Date())
              }
            ];
          } else {
            lastupated = arrayUnion(
              {
                updatedby: this.loggedInProfile['profile_ref']?.id,
                date: Timestamp.fromDate(new Date())
              }
            )
          }
          const emailTemplate = this.getSelectedEmail(values.emailtemplate);
          const emailTemplateObject = values.emailtemplate ? { docid: values.emailtemplate, templatealias: emailTemplate?.templatealias, postmarktemplateid: emailTemplate.postmarktemplateid } : null
          const communicationDoc = {
            docid: docref.id,
            title: values?.title ?? '',
            date: values?.date ? Timestamp.fromDate(values.date) : null,
            eventref: eventRef,
            emailtemplate: emailTemplateObject ?? null,
            watitemplate: values.watitemplate ?? null,
            apptemplate: values.apptemplate ?? null,
            lastupated: lastupated,
            type: values?.type ?? null
          }
          if (this.communicationFormMode === 'add') {
            communicationDoc['created'] = Timestamp.fromDate(new Date());
          }
          batch.set(docref, communicationDoc, { merge: true });
        })
        await batch.commit();
        this.communicationFormMode = null;
        this.communicationForm.clear();
        console.log('Successfully saved communication')
        alert('Successfully saved communication');
      } catch (error) {
        console.log('error in saved communication : ', error)
      }
    } else {
      alert('Fill all the values')
    }
  }

  // to edit communication
  onCommunicationEditClick(communication: any) {
    if (!communication?.docid || this.communicationFormMode !== null) {
      return
    }
    this.communicationForm.push(
      this.from.group({
        docid: [communication?.docid],
        title: [communication?.title ?? '', { validators: [Validators.required], update: "change" }],
        date: [this.toDate(communication?.date), { validators: [Validators.required], update: "change" }],
        eventref: [communication?.eventref?.id ?? null, { validators: [Validators.required], update: "change" }],
        type: [communication?.type ?? null],
        emailtemplate: [communication?.emailtemplate?.docid ?? null],
        watitemplate: [communication?.watitemplate ?? null],
        apptemplate: [communication?.apptemplate ?? null],
      })
    );
    this.communicationFormMode = 'edit';
    this.commnunicationGridPlanner.nativeElement.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }
  
  // to handel day cell click
  onCommunicationAddClick(date: Date) {
    this.onActiveTabChange('library');

    this.communicationForm.push(
      this.from.group({
        docid: [doc(collection(this.firestore, 'communication planner')).id],
        title: ['', { validators: [Validators.required], update: "change" }],
        date: [date instanceof Date ? date : null, { validators: [Validators.required], update: "change" }],
        eventref: [this.selectedEvent ? this.selectedEvent : null, { validators: [Validators.required], update: "change" }],
        type: 'event',
        emailtemplate: [null],
        watitemplate: [null],
        apptemplate: [null],
      })
    );
    this.communicationFormMode = 'add';
  }

  // function to clear form
  clearForm() {
    this.communicationForm.clear();
    this.communicationFormMode = null;
  }

  // ==================== DATA LOAD AND FILTERS ====================

  // load communication planner
  fetchCommunicationPlanner() {
    this.loadingStatus.communicationPlanner = true;
    let { start, end } = this.getCurrentMonthDateRange();

    const q = query(collection(this.firestore, 'communication planner'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)), orderBy('date', 'desc'));

    if (this.subscriptions['communicationPlanner']?.unsubscribe) {
      this.subscriptions['communicationPlanner']?.unsubscribe();
    };

    this.subscriptions['communicationPlanner'] = collectionData(q).subscribe((communicationSnapShot) => {
      const dateBasedMap = {};
      const eventBasedGroupMap = {};
      this.communicationPlanner = communicationSnapShot;
      communicationSnapShot.forEach((communication) => {
        if (!this.applyFilter(communication)) { return }
        
        // Communication table
        const communicationDate: Date = communication['date']?.toDate() ?? 'Unknown';
        const key = communicationDate.toLocaleDateString();
        if (Object.hasOwn(dateBasedMap, key)) {
          dateBasedMap[key].push(communication);
        } else {
          dateBasedMap[key] = [communication];
        }

        // library event based
        const eventId = communication['eventref']?.id ?? 'Unknown';
        if (Object.hasOwn(eventBasedGroupMap, eventId)) {
          eventBasedGroupMap[eventId].push(communication);
        } else {
          eventBasedGroupMap[eventId] = [communication];
        }

      });
      this.dateBasedMap = dateBasedMap;
      this.eventBasedGroupMap = eventBasedGroupMap;
      this.loadingStatus.communicationPlanner = false;
    });
  }

  // function to apply filter
  applyFilter(communication) {
    if (this.selectedEvent !== null) {
      const eventId = communication?.eventref?.id ?? null;
      return this.selectedEvent === eventId;
    }
    return true
  }

  // function to filter communication
  filterCommunications() {
    const dateBasedMap = {};
    const eventBasedGroupMap = {};
    this.communicationPlanner.forEach((communication) => {

      if (!this.applyFilter(communication)) {
        return
      }

      // Communication table
      const communicationDate: Date = communication['date']?.toDate() ?? 'Unknown';
      const key = communicationDate.toLocaleDateString();
      if (Object.hasOwn(dateBasedMap, key)) {
        dateBasedMap[key].push(communication);
      } else {
        dateBasedMap[key] = [communication];
      }

      // library event based
      const eventId = communication['eventref']?.id ?? 'Unknown';
      if (Object.hasOwn(eventBasedGroupMap, eventId)) {
        eventBasedGroupMap[eventId].push(communication);
      } else {
        eventBasedGroupMap[eventId] = [communication];
      }

    });

    this.eventBasedGroupMap = eventBasedGroupMap;
    this.dateBasedMap = dateBasedMap;
  }

  // function to load archive data for current month
  subscribeCommunicationToCurrentMonth() {
    const { start, end } = this.getCurrentMonthDateRange();

    const emailQuery = query(collection(this.firestore, 'email archive'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))
    const watiQuery = query(collection(this.firestore, 'wati archive'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))
    const appNotificationQuery = query(collection(this.firestore, 'notificationrecord'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))

    this.subscriptions['email archive'] = collectionData(emailQuery).subscribe((email) => {
      this.currentMonthEmail = [...email];
      this.fetchEmailArchieve();
    });
    this.subscriptions['wati archive'] = collectionData(watiQuery).subscribe((wati) => {
      this.currentMonthWati = [...wati];
      this.fetchWatiArchieve();
    });
    this.subscriptions['notificationrecord'] = collectionData(appNotificationQuery).subscribe((app) => {
      this.currentMonthAppNotification = [...app];
      this.fetchAppNotification();
    });
  }

  // fetch events
  async fetchEvents() {
    const eventsList = [];
    const eventMap = {};
    const upcomingEvents = [];
    const today = new Date();
    const q = query(collection(this.firestore, 'event collection'));
    const eventsSnap = await getDocs(q);

    eventsSnap.docs.forEach((doc) => {
      const event = doc.data();
      const eventStartDate = this.toDate(event['start_date']);
      event['docid'] = doc.id;
      eventMap[doc.id] = event;
      eventsList.push(event);

      if (today < eventStartDate) {
        upcomingEvents.push(event)
      }
    });

    this.eventList = eventsList;
    this.eventMap = eventMap;
    this.upcomingEvents = upcomingEvents;
  }


  // fetch email archive data
  async fetchEmailArchieve() {
    this.loadingStatus.emailArchieve = true;
    const { start, end } = this.getCurrentMonthDateRange();
    let emails = [];
    const communicationEmailLog = {};
    const emailArchieve = {}

    if (this.isCurrentMonth()) {
      emails = [...this.currentMonthEmail];
    } else {
      const q = query(collection(this.firestore, 'email archive'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))
      const emailSnap = await getDocs(q);
      emails = emailSnap.docs.map((doc) => doc.data());
    }

    emails.forEach((email) => {
      const date = email['date']?.toDate();
      const key = date?.toLocaleDateString() ?? 'Unknown';
      const communicationDocid = email['communicationplannerid'] ?? null;

      if (Object.hasOwn(emailArchieve, key)) {
        emailArchieve[key].push(email);
      } else {
        emailArchieve[key] = [email];
      }

      if (communicationDocid) {
        communicationEmailLog[communicationDocid] = communicationEmailLog[communicationDocid] ?? [];
        communicationEmailLog[communicationDocid].push(email);
      }

    });
    this.emailArchieve = emailArchieve;
    this.communicationEmailLog = communicationEmailLog;
    this.loadingStatus.emailArchieve = false;
  }

  // fetch wati archieve data
  async fetchWatiArchieve() {
    this.loadingStatus.watiArchieve = true;
    const { start, end } = this.getCurrentMonthDateRange();
    const watiArchieve = {};
    const communicationwatilLog = {};
    let wati = []

    if (this.isCurrentMonth()) {
      wati = [...this.currentMonthWati];
    } else {
      const q = query(collection(this.firestore, 'wati archive'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))
      const watiSnap = await getDocs(q);
      wati = watiSnap.docs.map((doc) => doc.data());
    }

    wati.forEach((wati) => {
      const date = wati['date']?.toDate();
      const key = date?.toLocaleDateString() ?? 'Unknown';
      const communicationDocid = wati['communicationplannerid'] ?? null;

      if (Object.hasOwn(watiArchieve, key)) {
        watiArchieve[key].push(wati);
      } else {
        watiArchieve[key] = [wati];
      }

      if (communicationDocid) {
        communicationwatilLog[communicationDocid] = communicationwatilLog[communicationDocid] ?? [];
        communicationwatilLog[communicationDocid].push(wati);
      }

    });
    this.watiArchieve = watiArchieve;
    this.communicationwatilLog = communicationwatilLog;
    this.loadingStatus.watiArchieve = false;
  }

  // fetch app archive data
  async fetchAppNotification() {
    this.loadingStatus.appNotitication = true;
    const { start, end } = this.getCurrentMonthDateRange();
    const appNotitication = {};
    const communicationAppNotificationLog = {};
    let appNotificationArray = [];

    if (this.isCurrentMonth()) {
      appNotificationArray = [...this.currentMonthAppNotification]
    } else {
      const q = query(collection(this.firestore, 'notificationrecord'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))
      const appNotificationSnap = await getDocs(q);
      appNotificationArray = appNotificationSnap.docs.map((doc) => doc.data());
    }

    appNotificationArray.forEach((app) => {
      const date = app['date']?.toDate();
      const key = date?.toLocaleDateString() ?? 'Unknown';
      const communicationDocid = app['communicationplannerid'] ?? null;

      if (Object.hasOwn(appNotitication, key)) {
        appNotitication[key].push(key);
      } else {
        appNotitication[key] = [app];
      }
      if (communicationDocid) {
        communicationAppNotificationLog[communicationDocid] = communicationAppNotificationLog[communicationDocid] ?? [];
        communicationAppNotificationLog[communicationDocid].push(app);
      }

    });
    this.appNotitication = appNotitication;
    this.communicationAppNotificationLog = communicationAppNotificationLog;
    this.loadingStatus.appNotitication = false;
  }

  // fetch email templates
  async fetchEmailTemplates() {
    const q = query(
      collection(this.firestore, 'email templates'),
      where('postmarkstatus', '==', 'approved'),
      where('templatevalidated', '==', true),
      where('templatestatus', '!=', 'rejected'),
      where('type', '==', 'email'),
    );
    const emailTemplates = [];
    const emailTemplateMap = {}

    const templatesSnap = await getDocs(q);

    templatesSnap.docs.forEach((templateDoc) => {
      const template = templateDoc.data();
      emailTemplateMap[templateDoc.id] = template;
      emailTemplates.push(template);
    });

    this.emailTemplates = emailTemplates;
    this.emailTemplateMap = emailTemplateMap;
  }

  // fetch email logs
  async fetchEmailLogs(emailArchieveId: string) {
    const logsQuery = query(
      collection(this.firestore, 'email logs'),
      where('emailarchiveid', '==', emailArchieveId)
    );

    const snapshot = await getDocs(logsQuery);

    return snapshot.docs.map((doc) => ({ ...doc.data(), docid: doc.id } as EmailLog))
  }

  // fetch wati templates
  async fetchWatiTemplates() {
    const q = query(collection(this.firestore, 'wati templates'));
    const watiTemplateMap = {}
    const templatesSnap = await getDocs(q);
    templatesSnap.docs.forEach((templateDoc) => {
      const template = templateDoc.data();
      watiTemplateMap[template['templateid']] = template;
    });
    this.watiTemplateMap = watiTemplateMap;
  }

  // load wati templates from all server
  async loadTemplatesFromAllServers() {
    this.watiTemplateLoading = true;
    let watiData: Record<string, any> = {};
    const watiDoc = await getDoc(doc(this.firestore, 'classify', 'wati'));
    if (watiDoc.exists()) {
      watiData = watiDoc.data();
      this.serverUrls = Object.keys(watiData);
      this.authService.openSnackBar(`Fetching ${this.serverUrls.length} - Servers Templates`, 'OK', 600);
    } else { this.authService.openSnackBar('No Wati Server Found', 'OK', 600); this.watiTemplateLoading = false; return; }

    forkJoin(this.serverUrls.map(sid => this.watiService.getTemplates(sid, watiData))).subscribe({
      next: (responses: any[][]) => {
        this.watiTemplates = [];
        responses.forEach((templates, idx) => {
          const sid = this.serverUrls[idx], cfg = watiData[sid];
          templates.filter(t => t.status?.toLowerCase() === 'approved').forEach(t => {
            t.serverid = sid; t.servername = cfg.watiname; t.serverurl = cfg.endpoint;
            this.watiTemplates.push(t);
          });
        });
        this.watiTemplates.sort((a, b) => b['lastModified'] - a['lastModified']);
        this.applyFiltersAndLimit();
        this.watiTemplateLoading = false;
      },
      error: () => { this.snackBar.open('Error loading templates', 'Close', { duration: 3000 }); this.watiTemplateLoading = false; }
    });
  }

  applyFiltersAndLimit() {
    let filtered = [...this.watiTemplates];

    if (this.searchTemplate.trim()) {
      const s = this.searchTemplate.toLowerCase();
      filtered = filtered.filter(t =>
        t.elementName?.toLowerCase().includes(s) ||
        t.category?.toLowerCase().includes(s) ||
        t.servername?.toLowerCase().includes(s) ||
        t.bodyOriginal?.toLowerCase().includes(s));
    }

    this.filteredTemplates = filtered;
    this.hasMoreTemplates = filtered.length > this.DISPLAY_LIMIT;
    this.displayTemplates = filtered.slice(0, this.DISPLAY_LIMIT);
  }

  onSearchTemplate() { this.iswatiSearching = true; this.searchSubject.next(this.searchTemplate); }
  filterTemplates() { this.applyFiltersAndLimit(); }
  loadMoreTemplates() {
    const n = this.displayTemplates.length;
    this.displayTemplates = [...this.displayTemplates, ...this.filteredTemplates.slice(n, n + this.DISPLAY_LIMIT)];
    this.hasMoreTemplates = this.displayTemplates.length < this.filteredTemplates.length;
  }

  private persistFavourites() {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(this.favouriteTemplates));
    this.favouriteIds = new Set(this.favouriteTemplates.map((t: any) => this.favouriteKey(t)));
  }

  private favouriteKey(t: any): string { return `${t.elementName}__${t.serverid ?? t.servername ?? ''}`; }
  isFavourite(t: any): boolean { return this.favouriteIds.has(this.favouriteKey(t)); }

  toggleFavourite(event: Event, t: any) {
    event.stopPropagation();
    const key = this.favouriteKey(t);
    if (this.favouriteIds.has(key)) {
      if (!confirm('Remove from Favourites?')) return;
      this.favouriteTemplates = this.favouriteTemplates.filter(f => this.favouriteKey(f) !== key);
      this.snackBar.open('Removed from favourites', 'Close', { duration: 2000 });
    } else {
      this.favouriteTemplates = [t, ...this.favouriteTemplates];
      this.snackBar.open('Added to favourites ★', 'Close', { duration: 2000 });
    }
    this.persistFavourites();
  }

  getTemplatesCountInfo(): string {
    if (this.watiTemplateLoading) return 'Loading…';
    if (this.iswatiSearching) return 'Searching…';
    return `Showing ${this.displayTemplates.length} of ${this.filteredTemplates.length} templates`;
  }

  async onTemplateChange(event: any, index) {
    this.isWatiTemplateAvailable = false;
    this.communicationForm.controls[index]?.get('watitemplate')?.setValue(null);
    try {

      const template = this.watiTemplateMap[event.value['id']] ?? null
      if (template) {
        this.isWatiTemplateAvailable = true;

        this.communicationForm.controls[index]?.get('watitemplate')?.setValue({
          docid: template['docid'] ?? null,
          templateid: template['templateid'] ?? null,
          watitemplateid: template['watitemplateid'] ?? null,
        });
      } else {
        this.isWatiTemplateAvailable = false;
        alert('Wati template is not available')
      }
    } catch (e) { console.error(e); this.isWatiTemplateAvailable = false; alert('Wati template is not available') }
  }

  getFormattedPreviewHtml(selectedWatiTemplate): string {
    if (!selectedWatiTemplate?.['htmlbody']) return '';
    let body: string = selectedWatiTemplate['htmlbody'];
    body = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    body = body.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>').replace(/_([^_\n]+)_/g, '<em>$1</em>').replace(/\n/g, '<br>');
    return body;
  }

  // wati metrics
  getSentCount(record: any): number {
    return record.sent?.length || 0;
  }

  getPendingCount(record: any): number {
    const sent = record.sent?.length || 0;
    const failed = record.failed?.length || 0;
    const total = record.numbers?.length || 0;
    return Math.max(0, total - sent - failed);
  }

  getFailedCount(record: any): number {
    return record.failed?.length || 0;
  }

  openBroadcast(selected) {
    console.log(selected);
    let url = `https://live-${selected['serverid']}.wati.io/17187/history/`;
    window.open(url, '_blank')
  }

  // wati log popup
  openParticipantsPopupWati(record: any) {
    this.selectedRecord.set(record);
    this.initializeParticipants(record);
    this.showParticipantsPopup.set(true);
  }

  closeParticipantsPopup() {
    this.showParticipantsPopup.set(false);
    this.selectedRecord.set(null);
    this.participantSearchText = '';
    this.filteredWatiParticipants = [];
    this.allWatiParticipants = [];
    this.heldParticipants = [];
    this.filteredHeldParticipants = [];
  }

  filterParticipants() {
    this.filterHeldParticipants();
    if (!this.participantSearchText.trim()) {
      this.filteredWatiParticipants = [...this.allWatiParticipants];
      return;
    }

    const searchTerm = this.participantSearchText.toLowerCase();
    this.filteredWatiParticipants = this.allWatiParticipants.filter(participant =>
      participant.name.toLowerCase().includes(searchTerm) ||
      participant?.phone.includes(searchTerm)
    );
  }

  initializeParticipants(record: any) {
    const numbers = record.numbers || [];
    const numberMap = record.numbermap || {};

    this.allWatiParticipants = numbers.map((phone: string) => ({
      phone,
      name: numberMap[phone] || 'Unknown'
    }));

    this.filteredWatiParticipants = [...this.allWatiParticipants];

    // Profiles excluded by the delivery-hold filter. They are not in `numbers`, so
    // they cannot appear in the list above — hence a separate section, not a badge.
    const held: string[] = record.communicationhold || [];
    this.heldParticipants = held.map((pid: string) => ({
      profileid: pid,
      name: this.mapProfile[pid]?.['name'] || 'Unknown',
      email: this.mapProfile[pid]?.['email'] || '',
      phone: this.mapProfile[pid]?.['number'] || ''
    }));
    this.filteredHeldParticipants = [...this.heldParticipants];
  }

  private filterHeldParticipants() {
    const term = this.participantSearchText.toLowerCase().trim();
    this.filteredHeldParticipants = term
      ? this.heldParticipants.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.phone.includes(term))
      : [...this.heldParticipants];
  }

  getParticipantWatiStatus(phone: string): string {
    const record = this.selectedRecord();
    if (!record) return 'pending';

    if (record.sent?.includes(phone.toString())) return 'sent';
    if (record.failed?.includes(phone.toString())) return 'failed';
    return 'pending';
  }

  // to handel sending communication
  onSendCommunication(communication) {
    const selectedComm = communication?.docid
    if (selectedComm === this.selectedCommunication?.docid) {
      this.refresPage();
      this.selectedCommunication = null;
    } else {
      this.selectedCommunication = communication;
      setTimeout(() => this.commnunicationGridPlanner.nativeElement.scrollTo({
        top: 0,
        behavior: 'smooth'
      }), 1000)
    }
  }

  // event based communication group
  getEventGroupKeys() {
    const eventId = Object.keys(this.eventBasedGroupMap);

    eventId.sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;

      const dateA = this.toDate(this.eventMap[a]?.end_date);
      const dateB = this.toDate(this.eventMap[b]?.end_date);

      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;

      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
    return eventId
  }

  // event communications
  getEventCommunications(eventId: string) {
    if (![null, undefined, ''].includes(eventId)) {
      return this.eventBasedGroupMap[eventId] ?? [];
    }
    return [];
  }

  // get current data range
  getCurrentMonthDateRange() {
    const start = new Date(this.displayedMonth);
    const end = new Date(this.displayedMonth);

    start.setDate(1)
    start.setHours(0, 0, 0, 0);

    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);

    return {
      start, end
    }
  };

  // get selected email
  getSelectedEmail(templateId) {
    if ([null, undefined, ''].includes(templateId)) { return null }
    return this.emailTemplateMap[templateId];
  }

  // navigate to create email template
  navigateToCreateEmail() {
    this.router.navigateByUrl('/email-templates')
  }

  getDaysOffset(dateA: Date | null, dateB: Date | null) {
    if (!dateA || !dateB) { return null }
    const DateAtime = dateA?.getTime() ?? 0;
    const DateBtime = dateB?.getTime() ?? 0;
    const offset = DateBtime - DateAtime;
    const days = offset / (1000 * 60 * 60 * 24);
    return Math.floor(days)
  }

  getDaysFormat(date: any, eventStartDate: any) {
    const dateA = this.toDate(date);
    const dateB = this.toDate(eventStartDate);

    if (!dateA || !dateB) {
      return 'N/A'
    }
    const offset = Math.floor(this.getDaysOffset(dateA, dateB));
    if (offset > 0) {
      return `${offset} days before`
    } else if (offset < 0) {
      return `${Math.abs(offset)} days after`
    } else {
      return `Event Day`
    }
  }

  // ui helpers

  sanitizeHTML(html: string) { return this.sanitizer.bypassSecurityTrustHtml(html); }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  onEventChipClick(eventId: string) {
    if (this.selectedEvent == eventId) {
      this.selectedEvent = null;
    } else {
      this.selectedEvent = eventId;
    }
    this.filterCommunications()
  }

  toggleCommunications(docid) {
    if (!docid) { return }
    if (this.openedCommunications.includes(docid)) {
      this.openedCommunications = this.openedCommunications.filter((id) => id !== docid);
    } else {
      this.openedCommunications.push(docid);
    }
  }

  onCummunicationClick(comm) {
    this.onActiveTabChange('library');
    this.toggleCommunications(comm?.docid);
    setTimeout(() => this.scrollToCommunication(comm?.docid))
  }

  scrollToCommunication(commId: string): void {
    const element = document.getElementById(commId);
    if (!element) {
      console.warn(`Element with ID ${commId} not found.`);
      return;
    }
    const container = this.commnunicationGridPlanner.nativeElement;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const scrollTop =
        container.scrollTop +
        (elementRect.top - containerRect.top);
      container.scrollTo({
        top: scrollTop - 130,
        behavior: 'smooth'
      });
    }
  }

  // ==================== UNIFIED PARTICIPANTS POPUP ====================

  async openParticipantsPopup(record: any, initialStatusFilter: string = 'all') {
    this.selectedArchiveForPopup = record;
    this.selectedStatusFilters = [initialStatusFilter];
    this.participantSearchFilter = '';

    record['logs'] = await this.fetchEmailLogs(record?.docid);
    console.log(record)
    // Build participants list from logs and archive data
    this.buildParticipantsList(record);

    // Apply initial filter
    this.filterParticipantsInPopup();

    this.showParticipantsModal = true;
  }

  private buildParticipantsList(record: any): void {
    this.allParticipants = [];
    const logs: EmailLog[] = record.logs || [];
    const rawRecipients = record.emailid || [];
    const allRecipients: string[] = (Array.isArray(rawRecipients) ? rawRecipients : [rawRecipients])
      .filter((r: any): r is string => typeof r === 'string' && r.trim() !== '');
    // Create a map to track each participant's statuses
    const participantMap = new Map<string, Participant>();

    // Initialize all recipients
    allRecipients.forEach((emailOrProfileId: string) => {
      const email = emailOrProfileId.trim().toLowerCase();
      const profileId = record.emailmap?.[emailOrProfileId] || null;
      const profile = profileId ? this.mapProfile[profileId] : this.findProfileByEmail(email);

      participantMap.set(email, {
        email: emailOrProfileId,
        profileid: profileId || profile?.id,
        name: profile?.name || 'Unknown',
        statuses: {
          sent: false,
          delivery: false,
          open: false,
          click: false,
          bounce: false,
          subscriptionchange: false,
          failed: false,
          notSent: true // Initially true, will be set to false if sent
        },
        statusTimestamps: {},
        lastActivity: null
      });
    });

    // Process logs to update statuses
    logs.forEach(log => {
      const email = log.email?.toLowerCase();
      if (!email) return;

      let participant = participantMap.get(email);

      // If participant doesn't exist (email from log not in original recipients), add them
      if (!participant) {
        const profile = this.findProfileByEmail(email);
        participant = {
          email: log.email,
          profileid: log.profileid || profile?.id,
          name: profile?.name || 'Unknown',
          statuses: {
            sent: false,
            delivery: false,
            open: false,
            click: false,
            bounce: false,
            subscriptionchange: false,
            failed: false,
            notSent: true
          },
          statusTimestamps: {},
          lastActivity: null
        };
        participantMap.set(email, participant);
      }

      // Update status based on log
      const status = log.msgstatus?.toLowerCase();
      switch (status) {
        case 'sent':
          participant.statuses.sent = true;
          participant.statuses.notSent = false;
          participant.statusTimestamps.sent = log.timestamp;
          break;
        case 'delivery':
        case 'delivered':
          participant.statuses.delivery = true;
          participant.statusTimestamps.delivery = log.timestamp;
          break;
        case 'open':
        case 'opened':
          participant.statuses.open = true;
          participant.statusTimestamps.open = log.timestamp;
          break;
        case 'click':
        case 'clicked':
          participant.statuses.click = true;
          participant.statusTimestamps.click = log.timestamp;
          break;
        case 'bounce':
        case 'bounced':
          participant.statuses.bounce = true;
          participant.statusTimestamps.bounce = log.timestamp;
          break;
        case 'subscriptionchange':
        case 'unsubscribe':
        case 'unsubscribed':
          participant.statuses.subscriptionchange = true;
          participant.statusTimestamps.subscriptionchange = log.timestamp;
          break;
        case 'failed':
        case 'error':
          participant.statuses.failed = true;
          participant.statusTimestamps.failed = log.timestamp;
          break;
      }

      // Update last activity
      if (log.timestamp) {
        if (!participant.lastActivity || log.timestamp > participant.lastActivity) {
          participant.lastActivity = log.timestamp;
        }
      }
    });

    this.allParticipants = Array.from(participantMap.values());

    // Profiles excluded by the delivery-hold filter. They are not in `emailid`, so they
    // cannot appear in the list above — hence a separate section, not a badge.
    const held: string[] = record.communicationhold || [];
    this.heldParticipants = held.map((pid: string) => ({
      profileid: pid,
      name: this.mapProfile[pid]?.['name'] || 'Unknown',
      email: this.mapProfile[pid]?.['email'] || ''
    }));

    // Calculate status counts
    this.calculateParticipantStatusCounts();
  }

  private findProfileByEmail(email: string): any {
    const emailLower = email.toLowerCase();
    for (const profileId of Object.keys(this.mapProfile)) {
      const profile = this.mapProfile[profileId];
      if (profile.email?.toLowerCase() === emailLower) {
        return { ...profile, id: profileId };
      }
    }
    return null;
  }

  private calculateParticipantStatusCounts(): void {
    this.participantStatusCounts = {
      sent: 0,
      delivery: 0,
      open: 0,
      click: 0,
      bounce: 0,
      subscriptionchange: 0,
      failed: 0,
      notSent: 0,
      total: this.allParticipants.length
    };

    this.allParticipants.forEach(p => {
      if (p.statuses.sent) this.participantStatusCounts.sent++;
      if (p.statuses.delivery) this.participantStatusCounts.delivery++;
      if (p.statuses.open) this.participantStatusCounts.open++;
      if (p.statuses.click) this.participantStatusCounts.click++;
      if (p.statuses.bounce) this.participantStatusCounts.bounce++;
      if (p.statuses.subscriptionchange) this.participantStatusCounts.subscriptionchange++;
      if (p.statuses.failed) this.participantStatusCounts.failed++;
      if (p.statuses.notSent) this.participantStatusCounts.notSent++;
    });
  }

  toggleStatusFilter(statusValue: string): void {
    if (statusValue === 'all') {
      this.selectedStatusFilters = ['all'];
    } else {
      // Remove 'all' if selecting specific status
      const allIndex = this.selectedStatusFilters.indexOf('all');
      if (allIndex > -1) {
        this.selectedStatusFilters.splice(allIndex, 1);
      }

      const index = this.selectedStatusFilters.indexOf(statusValue);
      if (index > -1) {
        this.selectedStatusFilters.splice(index, 1);
        // If no filters selected, default to 'all'
        if (this.selectedStatusFilters.length === 0) {
          this.selectedStatusFilters = ['all'];
        }
      } else {
        this.selectedStatusFilters.push(statusValue);
      }
    }

    this.filterParticipantsInPopup();
  }

  isStatusFilterActive(statusValue: string): boolean {
    return this.selectedStatusFilters.includes(statusValue);
  }

  filterParticipantsInPopup(): void {
    let filtered = [...this.allParticipants];

    // Apply status filters
    if (!this.selectedStatusFilters.includes('all')) {
      filtered = filtered.filter(participant => {
        return this.selectedStatusFilters.some(status => {
          switch (status) {
            case 'sent': return participant.statuses.sent;
            case 'delivery': return participant.statuses.delivery;
            case 'open': return participant.statuses.open;
            case 'click': return participant.statuses.click;
            case 'bounce': return participant.statuses.bounce;
            case 'subscriptionchange': return participant.statuses.subscriptionchange;
            case 'failed': return participant.statuses.failed;
            case 'notSent': return participant.statuses.notSent;
            default: return true;
          }
        });
      });
    }

    // Apply search filter
    if (this.participantSearchFilter.trim()) {
      const searchLower = this.participantSearchFilter.toLowerCase();
      filtered = filtered.filter(participant =>
        participant.email.toLowerCase().includes(searchLower) ||
        participant.name?.toLowerCase().includes(searchLower) ||
        participant.profileid?.toLowerCase().includes(searchLower)
      );
    }

    this.filteredParticipants = filtered;
  }

  onParticipantSearchChange(): void {
    this.filterParticipantsInPopup();
  }

  closeParticipantsModal(): void {
    this.showParticipantsModal = false;
    this.selectedArchiveForPopup = null;
    this.allParticipants = [];
    this.heldParticipants = [];
    this.filteredParticipants = [];
    this.participantSearchFilter = '';
    this.selectedStatusFilters = ['all'];
  }

  getParticipantStatusBadges(participant: Participant): string[] {
    const badges: string[] = [];
    if (participant.statuses.sent) badges.push('sent');
    if (participant.statuses.delivery) badges.push('delivery');
    if (participant.statuses.open) badges.push('open');
    if (participant.statuses.click) badges.push('click');
    if (participant.statuses.bounce) badges.push('bounce');
    if (participant.statuses.subscriptionchange) badges.push('subscriptionchange');
    if (participant.statuses.failed) badges.push('failed');
    if (participant.statuses.notSent) badges.push('notSent');
    return badges;
  }

  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      sent: 'send',
      delivery: 'check_circle',
      open: 'visibility',
      click: 'mouse',
      bounce: 'error_outline',
      subscriptionchange: 'unsubscribe',
      failed: 'cancel',
      notSent: 'block'
    };
    return icons[status] || 'help';
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      sent: 'Sent',
      delivery: 'Delivered',
      open: 'Opened',
      click: 'Clicked',
      bounce: 'Bounced',
      subscriptionchange: 'Unsubscribed',
      failed: 'Failed',
      notSent: 'Not Sent'
    };
    return labels[status] || status;
  }

  refresPage() {
    this.fetchEmailArchieve();
    this.fetchWatiArchieve();
    this.fetchAppNotification();
  }
}
