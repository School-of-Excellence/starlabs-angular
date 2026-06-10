import { Component, ElementRef, ViewChild } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subscription } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, Firestore, getDocs, orderBy, query, where } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import * as XLSX from 'xlsx';
import { MatTabsModule } from '@angular/material/tabs';
import { EmailRecordComponent } from "../email-record/email-record.component";
import { CallsRecordComponent } from "../calls-record/calls-record.component";
import { WatiRecordComponent } from "../wati-record/wati-record.component";
import { doc } from 'firebase/firestore';
import { MatTooltip } from "@angular/material/tooltip";
import { ChannelRecordComponent } from '../channel-record/channel-record.component';

@Component({
  selector: 'app-notification-record',
  standalone: true,
  imports: [
    CommonModule,
    MatInputModule,
    MatFormFieldModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    FormsModule,
    MatButtonModule,
    MatTabsModule,
    EmailRecordComponent,
    CallsRecordComponent,
    WatiRecordComponent,
    MatTooltip,
    ChannelRecordComponent
],
  templateUrl: './notification-record.component.html',
  styleUrl: './notification-record.component.css'
})
export class NotificationRecordComponent {

  @ViewChild(MatPaginator) paginator: MatPaginator
  @ViewChild(MatSort) sort: MatSort
  @ViewChild('Table') table: ElementRef;
  displayedColumns: string[] = ['logDateTime', 'notificationTitle', 'message', 'category', 'sentTo', 'receivedRate'];
  notificationDataSource = new MatTableDataSource()
  notificationSubscription: Subscription
  mapProfile = {};
  mapProfiledata = {};

  // Filter properties
  searchText: string = '';
  selectedDate: Date = new Date();
  startDate: Date | null = null;
  endDate: Date | null = null;
  selectedCategoryType: string = '';
  selectedNotificationType: string = '';
  selectedNotificationStatus: string = '';
  selectedPersonName: string = '';

  // Statistics
  totalNotifications: number;
  newlyNotifications: any = [];
  notificationSentRate: string;
  newNotificationSentIncrease: number;
  notificationSentFailure: number;
  newNotificationSentFailed: number;
  failedNotifications: number;
  newlysentnotificationRate: string

  // Dropdown options
  // categoryTypes = ['Customer Support', 'Slot Confirmation', 'General', 'Marketing'];
  notificationTypes = [];
  notificationStatuses = ['Sent', 'Failed'];
  notificationFailedPercentage: number;
  currentfailedRate: number;
  filteredNotifications: any;
  allNotifications: any;
  searchPersonName: string;
  showRecipientsDialog: boolean;
  selectedNotificationRecipients: any[];
  filteredRecipients: any[];
  recipientSearchText: '';
  showLogs = false;

  selectedTab: 'success' | 'failed' = 'success';
  successRecipients: any[] = [];
  failedRecipients: any[] = [];
  filteredSuccessRecipients: any[] = [];
  filteredFailedRecipients: any[] = [];
  currentNotificationData: any = null;

  // Pagination properties
  successPageIndex: number = 0;
  failedPageIndex: number = 0;
  pageSize: number = 10;
  pageSizeOptions: number[] = [10, 25, 50];

  // Loading state
  logsLoadingCount: number = 0;
  isExporting: boolean = false;
  totalRecipientsWithUserRef: number = 0;
  logsCheckedCount: number = 0;
  isLoadingAllLogs: boolean = false;

  NotificationReadUserID: string[] = [];


  constructor(
    public firestore: Firestore,
    public guard: AuthguardService
  ) {
    // guard.getRoles().then(roles => {
    //   if (roles["admin"] || roles["developer"]) {
        this.setDefaultDates();
        this.setupFilterPredicate();
        getDocs(query(collection(this.firestore, "notifications"), where("read", "==", true)))
          .then(list => {
            this.NotificationReadUserID = list.docs.map(e => e.id);
            console.log('Users with read notifications:', this.NotificationReadUserID);
          })
          .then(() => {
            this.fetchData();
          });
        // this.fetchData()
    //   }
    // })
  }

  ngOnInit(): void {
    this.guard.getProfileMap().then(data => {this.mapProfiledata = data.docdata; this.mapProfile = data.map})
  }

  ngOnDestroy(): void {
    this.notificationSubscription?.unsubscribe()
  }

  setDefaultDates() {
    this.endDate = new Date();
    this.endDate.setHours(23, 59, 59, 999);

    this.startDate = new Date();
    this.startDate.setDate(this.startDate.getDate() - 7);
    this.startDate.setHours(0, 0, 0, 0);
  }


  async fetchReadClickedStatus(profileId: string, notificationData: any): Promise<{read: boolean, clicked: boolean}> {
    const userRef = this.mapProfiledata[profileId]?.user_ref;
    if (!userRef) {
      return { read: false, clicked: false };
    }
    try {
      const notificationsCollectionRef = collection(
        this.firestore,
        "notifications",
        userRef.id,
        "logs"
      );
      const recordQuery = query(
        notificationsCollectionRef,
        where("recordid", "==", notificationData.docid),
      );
      const snapshot = await getDocs(recordQuery);
      if (!snapshot.empty) {
        const logData = snapshot.docs[0].data();
        return {
          read: logData['read'] === true || false,
          clicked: logData['clicked'] === true || false
        };
      }
      return { read: false, clicked: false };
    } catch (error) {
      console.error('Error fetching read/clicked status:', error);
      return { read: false, clicked: false };
    }
  }
  fetchData() {
    console.log("Last 30 days range", this.startDate, this.endDate);

    const recordCollection = collection(this.firestore, "notificationrecord");
    const recordQuery = query(
      recordCollection,
      where("date", ">=", this.startDate),
      where("date", "<=", this.endDate),
      orderBy("date", "desc")
    );
    this.notificationSubscription = collectionData(recordQuery,{ idField: 'id' }).subscribe(list => {
      for (let i = 0; i < list.length; i++) {
        const element = list[i]
        element['docid'] = element.id; 
        element['receivedRate'] = (element['profileid'] && element['profileid'].length > 0)
        ? ((element['profilesuccess']?.length || 0) / element['profileid'].length * 100).toFixed(2)
        : '0.00';
      }   
      this.allNotifications = list
      this.extractFilters(list);
      this.notificationDataSource.data = list
      this.notificationDataSource.sort = this.sort
      this.notificationDataSource.paginator = this.paginator
      this.updateStatistics(list);
    })
  }

  applyFilter(event: Event) {
    this.notificationDataSource.filter = (event.target as HTMLInputElement).value;
  }

  showMore(row) {
    console.log(row)
  }

  // updateStatistics(data: any[]) {
  //   this.totalNotifications = data.length;
  //   const today = new Date().toDateString();
  //   this.newlyNotifications = data.filter(item =>
  //     new Date(item.date.toDate()).toDateString() === today
  //   );
  //   // Count successful and failed notifications
  //   const successfulNotifications = data.filter(item => item.success === true).length;
  //   const currentsuccessfulRate = this.newlyNotifications.filter(item => item.success === true).length
  //   this.currentfailedRate = this.newlyNotifications.filter(item => item.success === false).length
  //   this.failedNotifications = data.filter(item => item.success === false).length;
  //   // console.log(this.failedNotifications);


  //   // Calculate percentages
  //   this.notificationSentRate = this.totalNotifications > 0
  //     ? ((successfulNotifications / this.totalNotifications) * 100).toFixed(2)
  //     : "0";



  //   this.newlysentnotificationRate = this.newlyNotifications.length > 0
  //     ? ((currentsuccessfulRate / this.newlyNotifications.length) * 100).toFixed(2)
  //     : "0.00";

  //   // const successfulNotifications = data.reduce((total, item) => {
  //   //   return total + (item.profilesuccess?.length || 0);
  //   // }, 0);
  //   // const currentsuccessfulRate = this.newlyNotifications.reduce((total, item) => {
  //   //   return total + (item.profilesuccess?.length || 0);
  //   // }, 0);
  //   // this.currentfailedRate = this.newlyNotifications.reduce((total, item) => {
  //   //   return total + (item.profilefailed?.length || 0);
  //   // }, 0);
  //   // this.failedNotifications = data.reduce((total, item) => {
  //   //   return total + (item.profilesuccess?.length || 0);
  //   // }, 0);
  // }

  updateStatistics(data: any[]) {
    this.totalNotifications = data.length;
    const today = new Date().toDateString();
    this.newlyNotifications = data.filter(item =>
      new Date(item.date.toDate()).toDateString() === today
    );
    const totalProfileIds = data.reduce((total , notification)=> total + notification?.profileid?.length || 0 , 0);
    const totalNewlyNotifications = this.newlyNotifications.reduce((total , notification)=> total + notification?.profileid?.length || 0 , 0);
    // Count successful and failed notifications
    const successfulNotifications = data.reduce((total , notification)=> total + notification?.profilesuccess?.length || 0 , 0);
    const currentsuccessfulRate = this.newlyNotifications.reduce((total , notification)=> total + notification?.profilesuccess?.length || 0 , 0);
    this.currentfailedRate = this.newlyNotifications.reduce((total , notification)=> total + notification?.profilefailed?.length || 0 , 0);
    this.failedNotifications = data.reduce((total , notification)=> total + notification?.profilefailed?.length || 0 , 0);
    // console.log(this.failedNotifications);


    // Calculate percentages
    this.notificationSentRate = totalProfileIds > 0
      ? ((successfulNotifications / totalProfileIds) * 100).toFixed(2)
      : "0";



    this.newlysentnotificationRate = this.newlyNotifications.length > 0
      ? ((currentsuccessfulRate / totalNewlyNotifications) * 100).toFixed(2)
      : "0.00";

    // const successfulNotifications = data.reduce((total, item) => {
    //   return total + (item.profilesuccess?.length || 0);
    // }, 0);
    // const currentsuccessfulRate = this.newlyNotifications.reduce((total, item) => {
    //   return total + (item.profilesuccess?.length || 0);
    // }, 0);
    // this.currentfailedRate = this.newlyNotifications.reduce((total, item) => {
    //   return total + (item.profilefailed?.length || 0);
    // }, 0);
    // this.failedNotifications = data.reduce((total, item) => {
    //   return total + (item.profilesuccess?.length || 0);
    // }, 0);
  }

  onSearchChange() {
    this.customfilter()
  }

  onDateChange() {
    this.fetchData();
  }

  onCategoryFilterChange() {
    this.customfilter();
  }

  onNotificationTypeFilterChange() {
    this.customfilter();
  }

  onNotificationStatusFilterChange() {
    this.customfilter();
  }

  onPersonNameFilterChange() {
    this.customfilter();
  }

  extractFilters(list: any[]) {
    const types = new Set<string>();

    list.forEach(e => {
      if (e.notificationtype) types.add(e.notificationtype);
    });

    this.notificationTypes = Array.from(types);
  }

  setupFilterPredicate() {
    this.notificationDataSource.filterPredicate = (data, filter) => {

      if (!filter || filter.trim() === '') {
        return true;
      }
      const filterObj = JSON.parse(filter);

      // Notification type filter
      const typeMatch = !filterObj.notificationType ||
        filterObj.notificationType?.toLowerCase() === data['notificationtype']?.toLowerCase();

      // Status filter
      const statusMatch = !filterObj.notificationStatus ||
        this.checkStatusMatch(data['success'], filterObj.notificationStatus);

      // Person name filter
      const personMatch = !filterObj.personName ||
        (data['profileid'] && Array.isArray(data['profileid']) &&
          data['profileid'].some(profileId =>
            this.mapProfile[profileId]?.toLowerCase().trim().replace(/\s/g, "")
              .indexOf(filterObj.personName?.toLowerCase().trim().replace(/\s/g, "")) > -1
          ));

      const searchMatch = !filterObj.searchText ||
        (data['title']?.toLowerCase().includes(filterObj.searchText.toLowerCase()) ||
          data['message']?.toLowerCase().includes(filterObj.searchText.toLowerCase()) ||
          data['notificationtype']?.toLowerCase().includes(filterObj.searchText.toLowerCase()));

      return typeMatch && statusMatch && personMatch && searchMatch;
    };
  }


  // Filter function 
  customfilter() {
    // Update the table
    const filterValue = JSON.stringify({
      notificationType: this.selectedNotificationType || '',
      notificationStatus: this.selectedNotificationStatus || '',
      personName: this.searchPersonName || '',
      searchText: this.searchText || ''
    });

    this.notificationDataSource.filter = filterValue.trim();
    this.updateStatistics(this.notificationDataSource.filteredData);
  }

  checkStatusMatch(itemStatus: any, selectedStatus: string): boolean {
    if (selectedStatus === 'Sent') {
      return itemStatus === true || itemStatus === 'true';
    } else if (selectedStatus === 'Failed') {
      return itemStatus === false || itemStatus === 'false';
    } else {
      return itemStatus?.toString().toLowerCase() === selectedStatus.toLowerCase();
    }
  }

  // Clear filters
  clearFilters() {
    this.selectedNotificationType = '';
    this.selectedNotificationStatus = '';
    this.searchPersonName = '';
    this.searchText = '';
    this.notificationDataSource.filter = '';
    this.updateStatistics(this.allNotifications);
  }

  // openRecipientsDialog(notificationData) {
  //   this.showRecipientsDialog = true;
  //   this.selectedNotificationRecipients = [];
  //   console.log("notificationData",notificationData.docid);
    

  //   if (notificationData.profileid && Array.isArray(notificationData.profileid)) {
  //     this.selectedNotificationRecipients = notificationData.profileid.map(profileId => {
  //       const profile = this.mapProfile[profileId];
  //       const isSuccess = notificationData.profilesuccess?.includes(profileId);
  //       const isFailed = notificationData.profilefailed?.includes(profileId);
  //       const isappSuccess = notificationData.appFCMSuccess?.includes(profileId);
  //       const isappFailure = notificationData.appFCMFailed?.includes(profileId);
  //       const iswebSuccess = notificationData.webFCMSuccess?.includes(profileId);
  //       const iswebFailure = notificationData.webFCMFailed?.includes(profileId);
        
  //       console.log(isappFailure, iswebFailure);
  //       console.log("this.mapProfileuserref",this.mapProfiledata[profileId]);
        
  //       let logCount = 0;
  //       let hasLogs = false;
  //       const userRef = this.mapProfiledata[profileId]?.user_ref ?? null;
  //       const hasUserRef = !!userRef;

  //       if(this.mapProfiledata[profileId].user_ref != null ){
  //         const notificationsCollectionRef = collection(this.firestore,"notifications",this.mapProfiledata[profileId].user_ref.id ,"logs");
  //         const recordQuery = query(
  //           notificationsCollectionRef,
  //           where("recordid", "==",notificationData.docid),
  //         );
  //         collectionData(recordQuery,{ idField: 'id' }).subscribe(list => {
  //           const logCount = list.length;
  //           const hasLogs = logCount > 0;
  //           const recipientIndex = this.selectedNotificationRecipients.findIndex(r => r.profileId === profileId);
  //           if (recipientIndex > -1) {
  //             this.selectedNotificationRecipients[recipientIndex] = {
  //               ...this.selectedNotificationRecipients[recipientIndex],
  //               logCount,
  //               hasLogs
  //             };
  //             this.filteredRecipients = [...this.selectedNotificationRecipients];
  //           }
  //         });
  //       }else{
  //         console.log("this.mapProfileuserref null --------",this.mapProfiledata[profileId]);

  //       }

  //       return {
  //         profileId: profileId, 
  //         name: profile,
  //         status: isSuccess ? 'success' : (isFailed ? 'failed' : 'pending'),
  //         appstatus: isappSuccess ? 'sent in app' :(isappFailure ? 'failed in app' : null),
  //         webstatus: iswebSuccess ? 'sent in web' : (iswebFailure ? 'failed in web' : null),
  //         statusColor: isSuccess ? '#4caf50' : (isFailed ? '#f44336' : '#ff9800'),
  //         statusIcon: isSuccess ? 'check_circle' : (isFailed ? 'error' : 'schedule'),
  //         logCount,
  //         hasLogs,
  //         hasUserRef
  //       }
  //     });
  //   }
  //   // this.filteredRecipients = [...this.selectedNotificationRecipients];
  // }

  closeRecipientsDialog() {
    this.showRecipientsDialog = false;
  }

  // filterRecipients() {
    
  //   if (!this.recipientSearchText.trim()) {
  //     this.filteredRecipients = [...this.selectedNotificationRecipients];
  //     return;
  //   }

  //   const searchTerm = this.recipientSearchText.toLowerCase().trim();
    
  //   this.filteredRecipients = this.selectedNotificationRecipients.filter(recipient =>
  //     recipient.name.toLowerCase().includes(searchTerm)
  //   );
  // }

  exportData() {
    console.log('Exporting data...');
    const ws: XLSX.WorkSheet = XLSX.utils.table_to_sheet(this.table.nativeElement)
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'sheet1');
    XLSX.writeFile(wb, 'participant.csv')
  }



  getReceivedRateColor(rate: number): string {
    if (rate >= 70) return '#4CAF50'; // Green
    if (rate >= 40) return '#FF9800'; // Orange
    return '#F44336'; // Red
  }

  openRecipientsDialog(notificationData) {
    this.showRecipientsDialog = true;
    this.currentNotificationData = notificationData;
    this.selectedTab = 'success';
    this.successRecipients = [];
    this.failedRecipients = [];
    this.recipientSearchText = '';
    this.successPageIndex = 0;
    this.failedPageIndex = 0;
    this.logsLoadingCount = 0;
    this.logsCheckedCount = 0;
    this.totalRecipientsWithUserRef = 0;
    this.isLoadingAllLogs = false;

    // Process SUCCESS recipients
    if (notificationData.profilesuccess && Array.isArray(notificationData.profilesuccess)) {
      this.successRecipients = notificationData.profilesuccess.map(profileId => {
        const profile = this.mapProfile[profileId];
        const isappSuccess = notificationData.appFCMSuccess?.includes(profileId);
        const iswebSuccess = notificationData.webFCMSuccess?.includes(profileId);
        const userRef = this.mapProfiledata[profileId]?.user_ref ?? null;
        const hasUserRef = !!userRef;

        if (hasUserRef) this.totalRecipientsWithUserRef++;

        return {
          profileId: profileId,
          name: profile || 'Unknown',
          status: 'Success',
          reason: '-',
          appstatus: isappSuccess ? 'App: Sent' : null,
          webstatus: iswebSuccess ? 'Web: Sent' : null,
          logCount: 0,
          hasLogs: false,
          hasUserRef,
          logsLoading: false,
          logsChecked: false,
          read: false,
          clicked: 'unknown',  // Default to 'unknown'
          // Client-side deep-link tracking (written back by the app onto the record)
          ...this.buildClientTracking(notificationData, profileId)
        };
      });
    }
    this.filteredSuccessRecipients = [...this.successRecipients];

    // Process FAILED recipients
    if (notificationData.profilefailed && Array.isArray(notificationData.profilefailed)) {
      this.failedRecipients = notificationData.profilefailed.map(profileId => {
        const profile = this.mapProfile[profileId];
        const failedReason = notificationData.failedlist?.[profileId] || 'Unknown error';
        const isappFailed = notificationData.appFCMFailed?.includes(profileId);
        const iswebFailed = notificationData.webFCMFailed?.includes(profileId);
        const userRef = this.mapProfiledata[profileId]?.user_ref ?? null;
        const hasUserRef = !!userRef;

        if (hasUserRef) this.totalRecipientsWithUserRef++;

        return {
          profileId: profileId,
          name: profile || 'Unknown',
          status: 'Failed',
          reason: failedReason,
          appstatus: isappFailed ? 'App: Failed' : null,
          webstatus: iswebFailed ? 'Web: Failed' : null,
          logCount: 0,
          hasLogs: false,
          hasUserRef,
          logsLoading: false,
          logsChecked: false,
          read: false,
          clicked: 'unknown',
          // Client-side deep-link tracking (written back by the app onto the record)
          ...this.buildClientTracking(notificationData, profileId)
        };
      });
    }
    this.filteredFailedRecipients = [...this.failedRecipients];

    // Load logs only for visible items initially
    this.loadLogsForVisibleItems();
  }

  // Check if all logs are loaded
  get allLogsLoaded(): boolean {
    return this.totalRecipientsWithUserRef === 0 || this.logsCheckedCount >= this.totalRecipientsWithUserRef;
  }

  // Get loading progress percentage
  get logsLoadingProgress(): number {
    if (this.totalRecipientsWithUserRef === 0) return 100;
    return Math.round((this.logsCheckedCount / this.totalRecipientsWithUserRef) * 100);
  }

  // Load all logs for export
  loadAllLogsForExport() {
    if (this.allLogsLoaded || this.isLoadingAllLogs) return;

    this.isLoadingAllLogs = true;
    const allRecipients = [...this.successRecipients, ...this.failedRecipients];

    allRecipients.forEach(recipient => {
      if (!recipient.logsChecked && recipient.hasUserRef) {
        const type = this.successRecipients.includes(recipient) ? 'success' : 'failed';
        this.fetchRecipientLogs(recipient.profileId, this.currentNotificationData.docid, type);
      }
    });
  }

  // Add method to load logs only for visible items (pagination optimization)
  loadLogsForVisibleItems() {
    const currentList = this.selectedTab === 'success' ? this.filteredSuccessRecipients : this.filteredFailedRecipients;
    const pageIndex = this.selectedTab === 'success' ? this.successPageIndex : this.failedPageIndex;
    const startIndex = pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    const visibleItems = currentList.slice(startIndex, endIndex);

    visibleItems.forEach(recipient => {
      if (!recipient.logsChecked && recipient.hasUserRef) {
        this.fetchRecipientLogs(recipient.profileId, this.currentNotificationData.docid, this.selectedTab);
      }
    });
  }
  // Derive the client-side deep-link outcome for a profile from the fields the
  // app writes back onto the notificationrecord doc:
  //   clientClicked[], clientLanded[], clientFailed[] (arrays of profileid)
  //   clientFailures{profileid:{stage,reason,at}}, clientClickScenario{profileid:scenario}
  //   clientevents{profileid:{clicked|landed|failed:{at,scenario,stage,reason}}}
  // Outcome:
  //   Landed              -> tap routed to its destination
  //   Broke midway        -> routing failed (stage + reason)
  //   Clicked, no landing  -> tapped but never landed/failed (silent midway break)
  buildClientTracking(notificationData: any, profileId: string) {
    const inArr = (a: any) => Array.isArray(a) && a.includes(profileId);
    const landed = inArr(notificationData?.clientLanded);
    const failed = inArr(notificationData?.clientFailed);
    const appClicked = inArr(notificationData?.clientClicked);
    const failure = notificationData?.clientFailures?.[profileId] || null;
    const scenario = notificationData?.clientClickScenario?.[profileId]
      || notificationData?.clientevents?.[profileId]?.clicked?.scenario
      || null;

    let outcome = '—';
    let outcomeClass = 'none';
    if (failed) { outcome = 'Broke midway'; outcomeClass = 'failed'; }
    else if (landed) { outcome = 'Landed'; outcomeClass = 'landed'; }
    else if (appClicked) { outcome = 'Clicked, no landing'; outcomeClass = 'partial'; }

    return {
      appClicked,
      landed,
      clientFailedFlag: failed,
      scenario: scenario || '-',
      failStage: failure?.stage || null,
      failReason: failure?.reason || null,
      failReadable: failed ? this.humanizeFailure(failure?.stage, failure?.reason) : null,
      outcome,
      outcomeClass
    };
  }

  // Turn the app's internal stage/reason codes into a plain-English explanation
  // a non-technical user can understand. The raw code stays available on hover.
  humanizeFailure(stage: string | null | undefined, reason: string | null | undefined): string {
    const s = (stage || '').toLowerCase();
    const r = (reason || '').toLowerCase();
    if (r.includes('doc_not_found')) return 'The linked content no longer exists — it may have been removed.';
    if (r.includes('profile_mismatch')) return 'This content belongs to a different user account.';
    if (r.includes('malformed_landingpage')) return 'The notification link was malformed, so the page could not open.';
    if (r.includes('missing_content_segments') || r.includes('missing_contentid')) return 'The notification link was incomplete (missing the content reference).';
    if (r.includes('cannot_launch')) return 'The external link could not be opened on this device.';
    if (r.includes('no_handler')) return 'This notification type has no screen to open in the app.';
    if (r.includes('missing_ticketid')) return 'The support-ticket reference was missing from the notification.';
    if (r.includes('missing_aelid')) return 'A required reference was missing from the notification.';
    if (r.includes('unavailable')) return 'Could not reach the server to load the page — check the connection.';
    if (r.includes('permission-denied') || r.includes('permission_denied')) return 'The app was not allowed to open this content.';
    if (r.startsWith('exception:') || s === 'navigation') return 'Something went wrong while opening the notification.';
    if (s === 'parse') return 'The notification link could not be read.';
    // Fallback: tidy up the raw reason so it is at least legible.
    return reason ? reason.replace(/_/g, ' ').replace(/:/g, ': ') : 'The notification could not be opened.';
  }

  async fetchRecipientLogs(profileId: string, docId: string, type: 'success' | 'failed') {
    const userRef = this.mapProfiledata[profileId]?.user_ref;
    if (!userRef) return;
    // Check if already being processed
    const recipient = type === 'success'
      ? this.successRecipients.find(r => r.profileId === profileId)
      : this.failedRecipients.find(r => r.profileId === profileId);
    if (recipient?.logsChecked || recipient?.logsLoading) return;
    // Mark as loading
    this.updateRecipientLogStatus(profileId, type, { logsLoading: true });
    this.logsLoadingCount++;
    const notificationsCollectionRef = collection(this.firestore, "notifications", userRef.id, "logs");
    const recordQuery = query(
      notificationsCollectionRef,
      where("recordid", "==", docId),
    );
    try {
      const list = await getDocs(recordQuery);
      const logCount = list.size;
      const hasLogs = logCount > 0;
      // Initialize with default values
      let read: boolean = false;
      let clicked: string = 'unknown';
      if (!list.empty) {
        const logData = list.docs[0].data();
        // MATCHING NOTIFICATION LOG LOGIC:
        // Read is true if EITHER:
        // 1. The log's read field is true, OR
        // 2. The user ID is in NotificationReadUserID (parent notification has read=true)
        read = (logData['read'] === true) || this.NotificationReadUserID.includes(userRef.id);
        // Clicked status - only 'Yes' if explicitly true, otherwise 'unknown'
        clicked = logData['clicked'] === true ? 'Yes' : 'unknown';
      } else {
        // Even if no log exists, check if user has read notification at parent level
        read = this.NotificationReadUserID.includes(userRef.id);
      }
      this.updateRecipientLogStatus(profileId, type, {
        logCount,
        hasLogs,
        logsLoading: false,
        logsChecked: true,
        read,
        clicked
      });
      this.logsLoadingCount--;
      this.logsCheckedCount++;
      // Check if all logs loaded after loading all
      if (this.isLoadingAllLogs && this.allLogsLoaded) {
        this.isLoadingAllLogs = false;
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      this.updateRecipientLogStatus(profileId, type, {
        logsLoading: false,
        logsChecked: true
      });
      this.logsLoadingCount--;
      this.logsCheckedCount++;
    }
  }
  // Optimized fetchRecipientLogs with take(1) to avoid continuous subscription
  // fetchRecipientLogs(profileId: string, docId: string, type: 'success' | 'failed') {
  //   const userRef = this.mapProfiledata[profileId]?.user_ref;
  //   if (!userRef) return;

  //   // Check if already being processed
  //   const recipient = type === 'success' 
  //     ? this.successRecipients.find(r => r.profileId === profileId)
  //     : this.failedRecipients.find(r => r.profileId === profileId);
    
  //   if (recipient?.logsChecked || recipient?.logsLoading) return;

  //   // Mark as loading
  //   this.updateRecipientLogStatus(profileId, type, { logsLoading: true });
  //   this.logsLoadingCount++;

  //   const notificationsCollectionRef = collection(this.firestore, "notifications", userRef.id, "logs");
  //   const recordQuery = query(
  //     notificationsCollectionRef,
  //     where("recordid", "==", docId),
  //   );

  //   // Use first() or take(1) equivalent - subscribe and immediately unsubscribe
  //   const subscription = collectionData(recordQuery, { idField: 'id' }).subscribe(list => {
  //     const logCount = list.length;
  //     const hasLogs = logCount > 0;

  //     this.updateRecipientLogStatus(profileId, type, {
  //       logCount,
  //       hasLogs,
  //       logsLoading: false,
  //       logsChecked: true
  //     });

  //     this.logsLoadingCount--;
  //     this.logsCheckedCount++;
  //     subscription.unsubscribe(); // Unsubscribe immediately after first result

  //     // Check if all logs loaded after loading all
  //     if (this.isLoadingAllLogs && this.allLogsLoaded) {
  //       this.isLoadingAllLogs = false;
  //     }
  //   });
  // }

  // Helper method to update recipient log status
  updateRecipientLogStatus(profileId: string, type: 'success' | 'failed', updates: any) {
    if (type === 'success') {
      const index = this.successRecipients.findIndex(r => r.profileId === profileId);
      if (index > -1) {
        this.successRecipients[index] = { ...this.successRecipients[index], ...updates };
        this.filteredSuccessRecipients = [...this.successRecipients];
      }
    } else {
      const index = this.failedRecipients.findIndex(r => r.profileId === profileId);
      if (index > -1) {
        this.failedRecipients[index] = { ...this.failedRecipients[index], ...updates };
        this.filteredFailedRecipients = [...this.failedRecipients];
      }
    }
  }

  // Replace filterRecipients method:
  filterRecipients() {
    const searchTerm = this.recipientSearchText?.toLowerCase().trim() || '';

    if (!searchTerm) {
      this.filteredSuccessRecipients = [...this.successRecipients];
      this.filteredFailedRecipients = [...this.failedRecipients];
    } else {
      this.filteredSuccessRecipients = this.successRecipients.filter(r =>
        r.name?.toLowerCase().includes(searchTerm)
      );
      this.filteredFailedRecipients = this.failedRecipients.filter(r =>
        r.name?.toLowerCase().includes(searchTerm) || r.reason?.toLowerCase().includes(searchTerm)
      );
    }

    // Reset pagination on filter
    this.successPageIndex = 0;
    this.failedPageIndex = 0;
    this.loadLogsForVisibleItems();
  }

  // Add tab switch method:
  switchTab(tab: 'success' | 'failed') {
    this.selectedTab = tab;
    this.recipientSearchText = '';
    this.filterRecipients();
    this.loadLogsForVisibleItems();
  }

  // Pagination handlers
  onSuccessPageChange(event: any) {
    this.successPageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLogsForVisibleItems();
  }

  onFailedPageChange(event: any) {
    this.failedPageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLogsForVisibleItems();
  }

  // Get paginated data
  getPaginatedSuccessRecipients(): any[] {
    const startIndex = this.successPageIndex * this.pageSize;
    return this.filteredSuccessRecipients.slice(startIndex, startIndex + this.pageSize);
  }

  getPaginatedFailedRecipients(): any[] {
    const startIndex = this.failedPageIndex * this.pageSize;
    return this.filteredFailedRecipients.slice(startIndex, startIndex + this.pageSize);
  }
  exportRecipientsToExcel() {
    if (!this.allLogsLoaded) return;
    this.isExporting = true;
    // Combine all recipients for export
    const allRecipients = [
      ...this.successRecipients.map(r => ({
        Name: r.name || 'Unknown',
        Status: 'Success',
        Reason: '-',
        Channel: [r.appstatus, r.webstatus].filter(Boolean).join(', ') || '-',
        Read: r.read ? 'true' : 'false',
        Clicked: r.clicked,  // Will be 'Yes' or 'unknown'
        'Tap Outcome': r.outcome || '—',
        Landed: r.landed ? 'Yes' : (r.appClicked ? 'No' : '-'),
        Scenario: r.scenario || '-',
        'Fail Stage': r.failStage || '-',
        'Fail Reason': r.failReason || '-',
        'Log Created': this.getLogStatusText(r)
      })),
      ...this.failedRecipients.map(r => ({
        Name: r.name || 'Unknown',
        Status: 'Failed',
        Reason: r.reason || 'Unknown error',
        Channel: [r.appstatus, r.webstatus].filter(Boolean).join(', ') || '-',
        Read: r.read ? 'true' : 'false',
        Clicked: r.clicked,  // Will be 'Yes' or 'unknown'
        'Tap Outcome': r.outcome || '—',
        Landed: r.landed ? 'Yes' : (r.appClicked ? 'No' : '-'),
        Scenario: r.scenario || '-',
        'Fail Stage': r.failStage || '-',
        'Fail Reason': r.failReason || '-',
        'Log Created': this.getLogStatusText(r)
      }))
    ];
    // Create workbook
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(allRecipients);
    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, // Name
      { wch: 10 }, // Status
      { wch: 30 }, // Reason
      { wch: 20 }, // Channel
      { wch: 10 }, // Read
      { wch: 10 }, // Clicked
      { wch: 18 }, // Tap Outcome
      { wch: 8 },  // Landed
      { wch: 12 }, // Scenario
      { wch: 22 }, // Fail Stage
      { wch: 40 }, // Fail Reason
      { wch: 15 }  // Log Created
    ];
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recipients');
    const title = this.currentNotificationData?.title || 'notification';
    const fileName = `recipients_${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    this.isExporting = false;
  }
  // // Export to Excel (only callable when all logs loaded)
  // exportRecipientsToExcel() {
  //   if (!this.allLogsLoaded) return;

  //   this.isExporting = true;

  //   // Combine all recipients for export
  //   const allRecipients = [
  //     ...this.successRecipients.map(r => ({
  //       Name: r.name || 'Unknown',
  //       Status: 'Success',
  //       Reason: '-',
  //       Channel: [r.appstatus, r.webstatus].filter(Boolean).join(', ') || '-',
  //       'Log Created': this.getLogStatusText(r)
  //     })),
  //     ...this.failedRecipients.map(r => ({
  //       Name: r.name || 'Unknown',
  //       Status: 'Failed',
  //       Reason: r.reason || 'Unknown error',
  //       Channel: [r.appstatus, r.webstatus].filter(Boolean).join(', ') || '-',
  //       'Log Created': this.getLogStatusText(r)
  //     }))
  //   ];

  //   // Create workbook
  //   const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(allRecipients);

  //   // Set column widths
  //   ws['!cols'] = [
  //     { wch: 25 }, // Name
  //     { wch: 10 }, // Status
  //     { wch: 30 }, // Reason
  //     { wch: 20 }, // Channel
  //     { wch: 15 }  // Log Created
  //   ];

  //   const wb: XLSX.WorkBook = XLSX.utils.book_new();
  //   XLSX.utils.book_append_sheet(wb, ws, 'Recipients');

  //   const title = this.currentNotificationData?.title || 'notification';
  //   const fileName = `recipients_${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

  //   XLSX.writeFile(wb, fileName);
  //   this.isExporting = false;
  // }

  // Helper to get log status text for export
  getLogStatusText(recipient: any): string {
    if (!recipient.hasUserRef) return 'No User Ref';
    if (recipient.hasLogs) return `Yes (${recipient.logCount})`;
    return 'No';
  }

}
