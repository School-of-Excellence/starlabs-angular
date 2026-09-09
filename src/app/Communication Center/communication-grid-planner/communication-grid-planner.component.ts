import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { arrayUnion, collection, collectionData, doc, Firestore , getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, where, writeBatch} from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { ParticipantsAnalyticsComponent } from '../../Participants Profile Management/participants-analytics/participants-analytics.component';


export interface CalendarDay {
  date : Date;
  isCurrentMonth : boolean;
  isToday : boolean
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
    ParticipantsAnalyticsComponent
  ],
  templateUrl: './communication-grid-planner.component.html',
  styleUrl: './communication-grid-planner.component.css'
})
export class CommunicationGridPlannerComponent implements OnInit , OnDestroy {

  @ViewChild('commnunicationGridPlanner' ,{ static: false }) commnunicationGridPlanner !: ElementRef;

  activeTab: 'calendar' | 'library' = 'calendar';
  displayedMonth: Date = new Date();
  calendarDays = []
  months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  dateBasedMap = {};
  communicationPlanner = [];
  eventBasedGroupMap = {}

  emailArchieve = {};
  watiArchieve = {};
  appNotitication = {};

  currentMonthEmail = [];
  currentMonthWati = [];
  currentMonthAppNotification = [];

  emailTemplates = [];
  emailTemplateMap = {};

  eventList = [];
  eventMap = {};
  selectedEvent = null

  loadingStatus = {
    communicationPlanner : true,
    emailArchieve : true,
    watiArchieve : true,
    appNotitication : true
  }

  communicationForm: FormArray<FormGroup> = new FormArray<FormGroup>([]);
  communicationFormMode : 'add' | 'edit' | null = null;

  subscriptions : {[key : string] : Subscription} = {}

  loggedInProfile = null;

  localStorageKey = 'communicationform';

  selectedCommunication = null;

  openedCommunications = [];

  constructor(private firestore: Firestore , private from : FormBuilder , private sanitizer : DomSanitizer , private router : Router , private authService : AuthguardService) {
    this.buildCalendar();
    this.authService.getRoles().then((data)=>this.loggedInProfile = data)
  }

  ngOnInit(): void {
    this.fetchCommunicationPlanner();
    this.subscribeCommunicationToCurrentMonth();
    this.fetchEmailArchieve();
    this.fetchWatiArchieve();
    this.fetchAppNotification();
    this.fetchEvents();
    this.fetchEmailTemplates();
  }

  ngOnDestroy(): void {
    Object.keys(this.subscriptions).forEach((key)=>{
      if (this.subscriptions[key]?.unsubscribe) {
        this.subscriptions[key]?.unsubscribe()
      }
    })
  }

  onActiveTabChange(tab) {
    if (tab !== this.activeTab) {
      this.activeTab = tab
    };
    this.communicationFormMode = null;
    this.communicationForm.clear();
    this.selectedCommunication = null
  }

  prevMonth() {
    this.displayedMonth = new Date(
      this.displayedMonth.getFullYear(),
      this.displayedMonth.getMonth() - 1, // JS handles year rollover automatically
      1
    );
    this.buildCalendar();
    this.fetchCommunicationPlanner();
    this.fetchEmailArchieve();
    this.fetchWatiArchieve();
    this.fetchAppNotification()
  }

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
    console.log(days)
  }


  makeDay(date: Date, isCurrentMonth: boolean): CalendarDay {
    return {
      date,
      isCurrentMonth,
      isToday: this.isSameDay(date, new Date()),
    };
  }

  isSameDay(a: Date, b: Date): boolean {
    return a.getDate() === b.getDate() &&
      a.getMonth() === b.getMonth() &&
      a.getFullYear() === b.getFullYear();
  }

  addCommunicationFrom(date = new Date()){
    this.communicationForm.push(
      this.from.group({
        docid: [doc(collection(this.firestore, 'communication planner')).id],
        title: ['', { validators: [Validators.required], update: "change" }],
        date: [date , { validators: [Validators.required], update: "change" }],
        eventref: [null, { validators: [Validators.required], update: "change" }],
        type: 'event',
        emailtemplate: [null],
        watitemplate: [null],
        apptemplate: [null],
      })
    );
  }

  clearForm(){
    this.communicationForm.clear();
    this.communicationFormMode = null;
  }

  toggleCommunicationFromMode(mode : any){
    this.communicationFormMode = mode;
    if (mode === 'add' && this.communicationForm.length <= 0) {
      this.addCommunicationFrom();
    } else if(mode === 'edit' && this.communicationForm.length <= 0){

    } else {
      this.communicationFormMode = null;
      this.communicationForm.clear()
    }
  }

  removeCommunicationForm(index){
    if (this.communicationForm?.controls.length === 1) {
      this.communicationFormMode = null;
    }
    this.communicationForm.removeAt(index);
  }

  fetchCommunicationPlanner(){
    this.loadingStatus.communicationPlanner = true;
    let { start , end } = this.getCurrentMonthDateRange();

    const q = query(collection(this.firestore , 'communication planner') , where('date' , '>=' , Timestamp.fromDate(start)), where('date' , '<=' , Timestamp.fromDate(end)), orderBy('date' , 'desc'));

    if (this.subscriptions['communicationPlanner']?.unsubscribe) {
      console.log('unsubscrips')
      this.subscriptions['communicationPlanner']?.unsubscribe();
    };
 
    this.subscriptions['communicationPlanner'] = collectionData(q).subscribe((communicationSnapShot)=>{
      const dateBasedMap = {};
      const eventBasedGroupMap = {};
      this.communicationPlanner = communicationSnapShot;
      communicationSnapShot.forEach((communication)=>{

        if (!this.applyFilter(communication)) {
          return
        }

        // Communication table
        const communicationDate : Date= communication['date']?.toDate() ?? 'Unknown';
        const key = communicationDate.toLocaleDateString();
        if (Object.hasOwn(dateBasedMap , key)) {
          dateBasedMap[key].push(communication);
        } else {
          dateBasedMap[key] = [communication];
        }

        // library event based
        const eventId = communication['eventref']?.id ?? 'Unknown';
        if (Object.hasOwn(eventBasedGroupMap , eventId)) {
          eventBasedGroupMap[eventId].push(communication);
        } else {
          eventBasedGroupMap[eventId] = [communication];
        }

      });

      console.log(dateBasedMap);
      this.dateBasedMap = dateBasedMap;
      this.eventBasedGroupMap = eventBasedGroupMap;
      this.loadingStatus.communicationPlanner = false;
    });
    
  }

  applyFilter(communication){
    if(this.selectedEvent !== null){
      const eventId = communication?.eventref?.id ?? null;
      return this.selectedEvent === eventId;
    }

    return true
  }

  filterCommunications(){
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

  subscribeCommunicationToCurrentMonth(){
    const { start , end } = this.getCurrentMonthDateRange();

    const emailQuery = query(collection(this.firestore , 'email archive') , where('date' , '>=' , Timestamp.fromDate(start)), where('date' , '<=' , Timestamp.fromDate(end)))
    const watiQuery = query(collection(this.firestore , 'wati archive') , where('date' , '>=' , Timestamp.fromDate(start)), where('date' , '<=' , Timestamp.fromDate(end)))
    const appNotificationQuery = query(collection(this.firestore , 'notificationrecord') , where('date' , '>=' , Timestamp.fromDate(start)), where('date' , '<=' , Timestamp.fromDate(end)))
    
    this.subscriptions['email archive'] = collectionData(emailQuery).subscribe((email)=>{
      this.currentMonthEmail = [...email];
      this.fetchEmailArchieve();
    });
    this.subscriptions['wati archive'] = collectionData(watiQuery).subscribe((wati)=>{
      this.currentMonthWati = [...wati];
      this.fetchWatiArchieve();
    });
    this.subscriptions['notificationrecord'] = collectionData(appNotificationQuery).subscribe((app)=>{
      this.currentMonthAppNotification = [...app];
      this.fetchAppNotification();
    });
  }

  async fetchEvents(){
    const eventsList = [];
    const eventMap = {};
   const q = query(collection(this.firestore , 'event collection'));
   const eventsSnap = await getDocs(q);
   
   eventsSnap.docs.forEach((doc)=>{
      const event = doc.data();
      event['docid'] = doc.id; 
      eventMap[doc.id] = event;
      eventsList.push(event);
   });

   this.eventList = eventsList;
   this.eventMap = eventMap;
  }

  async fetchEmailArchieve(){
    this.loadingStatus.emailArchieve = true;
    const { start , end } = this.getCurrentMonthDateRange();
    let emails = [];
    const emailArchieve = {}

    if (this.isCurrentMonth()) {
        emails = [...this.currentMonthEmail];
    } else {
      const q = query(collection(this.firestore, 'email archive'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))
      const emailSnap = await getDocs(q);
      emails = emailSnap.docs.map((doc)=>doc.data());
    }

    emails.forEach((email)=>{
      const date = email['date']?.toDate();
      const key = date?.toLocaleDateString() ?? 'Unknown';

      if(Object.hasOwn(emailArchieve , key)){
        emailArchieve[key].push(email);
      } else {
        emailArchieve[key] = [email];
      }

    });

    this.emailArchieve = emailArchieve;
    this.loadingStatus.emailArchieve = false;
  }

  async fetchWatiArchieve(){
    this.loadingStatus.watiArchieve = true;
    const { start , end } = this.getCurrentMonthDateRange();
    const watiArchieve = {}
    let wati = []
    
    if (this.isCurrentMonth()) {
      wati = [...this.currentMonthWati];
    } else {
      const q = query(collection(this.firestore, 'wati archive'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))
      const watiSnap = await getDocs(q);
      wati = watiSnap.docs.map((doc)=>doc.data());
    }

    wati.forEach((wati)=>{
      const date = wati['date']?.toDate();
      const key = date?.toLocaleDateString() ?? 'Unknown';

      if(Object.hasOwn(watiArchieve , key)){
        watiArchieve[key].push(wati);
      } else {
        watiArchieve[key] = [wati];
      }

    });

    this.watiArchieve = watiArchieve;
    this.loadingStatus.watiArchieve = false;
  }

  async fetchAppNotification(){
    this.loadingStatus.appNotitication = true;
    const { start , end } = this.getCurrentMonthDateRange();
    const appNotitication = {}
    let appNotificationArray = [];

    if (this.isCurrentMonth()) {
      appNotificationArray = [...this.currentMonthAppNotification]
    } else {
      const q = query(collection(this.firestore, 'notificationrecord'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)))
      const appNotificationSnap = await getDocs(q);
      appNotificationArray = appNotificationSnap.docs.map((doc)=>doc.data());
    }

    appNotificationArray.forEach((app) => {
      const date = app['date']?.toDate();
      const key = date?.toLocaleDateString() ?? 'Unknown';

      if (Object.hasOwn(appNotitication, key)) {
        appNotitication[key].push(key);
      } else {
        appNotitication[key] = [app];
      }

    });

    this.appNotitication = appNotitication;
    this.loadingStatus.appNotitication = false;
  }

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

    templatesSnap.docs.forEach((templateDoc)=>{
      const template = templateDoc.data();
      emailTemplateMap[templateDoc.id] = template;
      emailTemplates.push(template);
    });

    this.emailTemplates = emailTemplates;
    this.emailTemplateMap = emailTemplateMap;
  }

  getCommunicationForDay(date : Date){
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.dateBasedMap , key)) {
      return this.dateBasedMap[key];
    }
    return []
  }

  getEmailForDay(date : Date){
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.emailArchieve , key)) {
      return this.emailArchieve[key];
    }
    return []
  }

  getWatiForDay(date : Date){
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.watiArchieve , key)) {
      return this.watiArchieve[key];
    }
    return []
  }

  getAppNotificationForDay(date : Date){
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.appNotitication , key)) {
      return this.appNotitication[key];
    }
    return []
  }

  validateFrom(){
    return this.communicationForm.controls.every((from)=>from.valid);
  }

  async createCommunication(){
    if (this.validateFrom()) {
      try {
        const batch = writeBatch(this.firestore);

        this.communicationForm.controls.forEach((form) => {
          const values = form.value;

          const eventRef = doc(collection(this.firestore, 'event collection'), values.eventref);

          const lastupated = [
            {
              updatedby: this.loggedInProfile['profile_ref']?.id,
              date: Timestamp.fromDate(new Date())
            }
          ];

          const docref = values?.docid ? doc(collection(this.firestore, 'communication planner'), values?.docid) : doc(collection(this.firestore, 'communication planner'));

          const communicationDoc = {
            docid: docref.id,
            title: values?.title ?? '',
            date: values?.date ? Timestamp.fromDate(values.date) : null,
            eventref: eventRef,
            emailtemplate: values.emailtemplate ?? null,
            watitemplate: values.watitemplate ?? null,
            apptemplate: values.apptemplate ?? null,
            created: Timestamp.fromDate(new Date()),
            lastupated: lastupated,
            type: values?.type ?? null
          }

          batch.set(docref, communicationDoc, { merge: true });
        })

        await batch.commit();
        this.communicationForm.clear();
        this.communicationFormMode = null;
        console.log('Successfully added communication')
        alert('Successfully added communication');

      } catch (error) {
        console.log('error in adding communication : ' , error)
      }
    } else {
      alert('Fill all the values')
    }
  }

  async updateCommunication() {
    if (this.validateFrom()) {
      try {
        const batch = writeBatch(this.firestore);

        this.communicationForm.controls.forEach((form) => {
          const values = form.value;

          const eventRef = doc(collection(this.firestore, 'event collection'), values.eventref);

          const lastupated = {
            updatedby: this.loggedInProfile['profile_ref']?.id,
            date: Timestamp.fromDate(new Date())
          }

          const docref = values?.docid ? doc(collection(this.firestore, 'communication planner'), values?.docid) : doc(collection(this.firestore, 'communication planner'));

          const communicationDoc = {
            docid: docref.id,
            title: values?.title ?? '',
            date: values?.date ? Timestamp.fromDate(values.date) : null,
            eventref: eventRef,
            emailtemplate: values.emailtemplate ?? null,
            watitemplate: values.watitemplate ?? null,
            apptemplate: values.apptemplate ?? null,
            lastupated: arrayUnion(lastupated),
            type: values?.type ?? null,
          }

          console.log(communicationDoc)
          batch.set(docref, communicationDoc, { merge: true });
        });

        await batch.commit();
        this.communicationForm.clear();
        this.communicationFormMode = null;
        console.log('Successfully updated communication')
        alert('Successfully updated communication');

      } catch (error) {
        console.log('error in updating communication : ', error)
      }
    } else {
      alert('Fill all the values')
    }
  }

  async saveCommunicationFrom() {
    if (this.validateFrom()) {
      try {
        const batch = writeBatch(this.firestore);

        this.communicationForm.controls.forEach((form) => {
          const values = form.value;

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

          const docref = values?.docid ? doc(collection(this.firestore, 'communication planner'), values?.docid) : doc(collection(this.firestore, 'communication planner'));

          const emailTemplate = this.getSelectedEmail(values.emailtemplate);
          const emailTemplateObject = values.emailtemplate ? { docid : values.emailtemplate , templatealias : emailTemplate?.templatealias , postmarktemplateid : emailTemplate.postmarktemplateid } : null
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
            communicationDoc['created'] =  Timestamp.fromDate(new Date());
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

  onSendCommunication(communication){
    const selectedComm = communication?.docid
    if (selectedComm === this.selectedCommunication?.docid) {
      this.selectedCommunication = null;
    } else {
      this.selectedCommunication = communication;
    }
  }

  onCommunicationEditClick(communication : any){
    console.log(this.communicationFormMode)
    if (!communication?.docid || this.communicationFormMode !== null ) {
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
      top : 0,
      behavior: 'smooth'
    })
  }

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

  getEventCommunications(eventId : string){
    if (![null , undefined , ''].includes(eventId)) {
      return this.eventBasedGroupMap[eventId] ?? [];
    }
    return [];
  }

  getCurrentMonthDateRange(){
    const start = new Date(this.displayedMonth);
    const end = new Date(this.displayedMonth);

    start.setDate(1)
    start.setHours(0,0,0,0);

    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23,59,59,999);

    return {
      start , end
    }
  };
  
  isAllLoaded(){
    return Object.values(this.loadingStatus).some((val)=>val)
  }

  isCurrentMonth(){
    const currentMonth = new Date();
    const selectedMonth = new Date(this.displayedMonth);

    return currentMonth.getMonth() === selectedMonth.getMonth() &&
      currentMonth.getFullYear() === selectedMonth.getFullYear();
  }

  getSelectedEmail(templateId){
    if ([null, undefined , ''].includes(templateId)) {
      return null
    } 

    return this.emailTemplateMap[templateId];
  }

  navigateToCreateEmail(){
    this.router.navigateByUrl('/email-templates')
  }

  getDaysOffset(dateA : Date | null , dateB : Date | null ){
    if (!dateA || !dateB) {
      return null
    }
    // console.log(dateA,dateB)
    const DateAtime = dateA?.getTime() ?? 0;
    const DateBtime = dateB?.getTime() ?? 0;

    const offset = DateBtime - DateAtime;

    const days = offset / (1000 * 60 * 60 * 24);
    return Math.floor(days)
  }

  getDaysFormat(date : any , eventStartDate : any){
    const dateA = this.toDate(date);
    const dateB = this.toDate(eventStartDate);

    if (!dateA || !dateB) {
      return 'N/A'
    }

    const offset = Math.floor(this.getDaysOffset(dateA , dateB));


    if (offset > 0) {
      return `${offset} days before`
    } else if(offset < 0){
      return `${Math.abs(offset)} days after`
    } else {
      return `Event Day`
    }
  }

  onCommunicationAddClick(date : Date){
    this.onActiveTabChange('library');

    this.communicationForm.push(
      this.from.group({
        docid: [doc(collection(this.firestore, 'communication planner')).id],
        title: ['', { validators: [Validators.required], update: "change" }],
        date: [date instanceof Date ? date : null , { validators: [Validators.required], update: "change" }],
        eventref: [this.selectedEvent ? this.selectedEvent : null, { validators: [Validators.required], update: "change" }],
        type: 'event',
        emailtemplate: [null],
        watitemplate: [null],
        apptemplate: [null],
      })
    );
    this.communicationFormMode = 'add';
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
  
  toggleCommunications(docid){

    if (!docid) {
      return
    }
    if (this.openedCommunications.includes(docid)) {
      this.openedCommunications = this.openedCommunications.filter((id)=> id !== docid);
    } else {
      this.openedCommunications.push(docid);
    }
  }

  onCummunicationClick(comm){
    this.toggleCommunications(comm?.docid);
    this.onActiveTabChange('library');
    this.scrollToCommunication(comm?.docid);
  }

  scrollToCommunication(commId: string): void {
    const element = document.getElementById(commId);

    if (!element) {
      console.warn(`Element with ID ${commId} not found.`);
      return;
    }

    const container = document.querySelector(
      '.communication-container'
    ) as HTMLElement;

    if (container) {
      const elementTop = element.offsetTop;

      container.scrollTo({
        top: elementTop,
        behavior: 'smooth'
      });
    }
  }

}
