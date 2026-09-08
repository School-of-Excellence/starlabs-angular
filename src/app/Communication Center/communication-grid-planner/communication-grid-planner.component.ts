import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { collection, collectionData, Firestore , getDocs, orderBy, query, Timestamp, where} from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { elementAt, Subscription } from 'rxjs';


export interface CalendarDay {
  date : Date;
  isCurrentMonth : boolean;
  isToday : boolean
}

@Component({
  selector: 'app-communication-grid-planner',
  imports: [
    CommonModule,
    MatIconModule
  ],
  templateUrl: './communication-grid-planner.component.html',
  styleUrl: './communication-grid-planner.component.css'
})
export class CommunicationGridPlannerComponent implements OnInit , OnDestroy {
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

  eventList = [];

  loadingStatus = {
    communicationPlanner : true,
    emailArchieve : true,
    watiArchieve : true,
    appNotitication : true
  }

  subscriptions : {[key : string] : Subscription} = {}

  constructor(private firestore: Firestore) {
    this.buildCalendar()
  }

  ngOnInit(): void {
    this.fetchCommunicationPlanner();
    this.subscribeCommunicationToCurrentMonth();
    this.fetchEmailArchieve();
    this.fetchWatiArchieve();
    this.fetchAppNotification()
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
    }
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

  subscribeCommunicationToCurrentMonth(){
    const { start , end } = this.getCurrentMonthDateRange();

    const emailQuery = query(collection(this.firestore , 'email archive') , where('date' , '>=' , Timestamp.fromDate(start)), where('date' , '<=' , Timestamp.fromDate(end)))
    const watiQuery = query(collection(this.firestore , 'wati archive') , where('date' , '>=' , Timestamp.fromDate(start)), where('date' , '<=' , Timestamp.fromDate(end)))
    const appNotificationQuery = query(collection(this.firestore , 'notificationrecord') , where('date' , '>=' , Timestamp.fromDate(start)), where('date' , '<=' , Timestamp.fromDate(end)))
    
    this.subscriptions['email archive'] = collectionData(emailQuery).subscribe((email)=>this.currentMonthEmail = [...email]);
    this.subscriptions['wati archive'] = collectionData(watiQuery).subscribe((wati)=>this.currentMonthEmail = [...wati]);
    this.subscriptions['notificationrecord'] = collectionData(appNotificationQuery).subscribe((app)=>this.currentMonthEmail = [...app]);
  }

  async fetchEvents(){
    const eventsList = [];
   const q = query(collection(this.firestore , 'event collection'));
   const eventsSnap = await getDocs(q);
   
   eventsSnap.docs.forEach((doc)=>{
      const event = doc.data();
      event['docid'] = doc.id; 
      eventsList.push(event);
   });
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

    wati.forEach((watiDoc)=>{
      const wati = watiDoc.data();
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

    appNotificationArray.forEach((appDoc) => {
      const app = appDoc.data();
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
  
  getCommunicationForDay(date : Date){
    const key = date.toLocaleDateString();
    if (Object.hasOwn(this.dateBasedMap , key)) {
      return this.dateBasedMap[key];
    }
    return []
  }

  isAllLoaded(){
    return Object.values(this.loadingStatus).some((val)=>val)
  }

  isCurrentMonth(){
    const currentMonth = new Date();
    const selectedMonth = new Date(this.displayedMonth);

    return currentMonth.getMonth() === selectedMonth.getMonth() &&
      currentMonth.getFullYear() === selectedMonth.getFullYear();
  }
}
