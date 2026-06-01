import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subscription, Observable, startWith, map } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import {
  collection, collectionData, doc, Firestore, getDocs,
  orderBy, query, where, getDoc
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-channel-record',
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
    ReactiveFormsModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatTooltipModule,
  ],
  templateUrl: './channel-record.component.html',
  styleUrl: './channel-record.component.css'
})
export class ChannelRecordComponent implements OnInit, OnDestroy {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  displayedColumns: string[] = [
    'logDateTime', 'channelName', 'message', 'category', 'sentTo', 'receivedRate'
  ];

  notificationDataSource = new MatTableDataSource<any>();
  notificationSubscription: Subscription;

  // Profile maps
  mapProfile: any = {};
  mapProfiledata: any = {};

  // ── Category map: id -> name ──────────────────────────────────────────────
  categoryMap: { [id: string]: string } = {};

  // ── Channel map: id -> name ───────────────────────────────────────────────
  channelMap: { [id: string]: string } = {};

  // ── Filters ─────
  startDate: Date | null = null;
  endDate: Date | null = null;
  searchText: string = '';
  selectedCategory: string = '';
  selectedChannel: string = '';

  // Profile autocomplete
  profileSearchText: string = '';
  selectedProfileId: string | null = null;
  profileOptions: { id: string; name: string; email: string }[] = [];
  filteredProfileOptions: { id: string; name: string; email: string }[] = [];

  // Dropdown option lists — both hold { id, name } for ID-based filtering
  categoryOptions: { id: string; name: string }[] = [];
  channelOptions: { id: string; name: string }[] = [];

  // ── Statistics ────────────────────────────────────────────────────────────
  totalNotifications: number = 0;
  newlyNotifications: any[] = [];
  notificationSentRate: string = '0';
  newlysentnotificationRate: string = '0.00';
  failedNotifications: number = 0;
  currentfailedRate: number = 0;

  allNotifications: any[] = [];

  // ── Recipients dialog ─────────────────────────────────────────────────────
  showRecipientsDialog: boolean = false;
  currentNotificationData: any = null;
  selectedTab: 'success' | 'failed' = 'success';

  successRecipients: any[] = [];
  failedRecipients: any[] = [];
  filteredSuccessRecipients: any[] = [];
  filteredFailedRecipients: any[] = [];

  recipientSearchText: string = '';

  // Pagination inside dialog
  successPageIndex: number = 0;
  failedPageIndex: number = 0;
  pageSize: number = 10;
  pageSizeOptions: number[] = [10, 25, 50];

  // Log-loading state
  logsLoadingCount: number = 0;
  logsCheckedCount: number = 0;
  totalRecipientsWithUserRef: number = 0;
  isLoadingAllLogs: boolean = false;
  isExporting: boolean = false;

  NotificationReadUserID: string[] = [];

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private sanitizer: DomSanitizer
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.setDefaultDates();
    this.setupFilterPredicate();

    // Load categories from classify -> channelcategories document
    this.fetchCategories();

    // Load channels map (id -> name) from channels collection
    this.fetchChannelMap();

    // Load users that have read a notification at the parent level
    getDocs(query(collection(this.firestore, 'notifications'), where('read', '==', true)))
      .then(snap => {
        this.NotificationReadUserID = snap.docs.map(d => d.id);
      })
      .then(() => this.fetchData());

    // Load profile map
    this.guard.getProfileMap().then(data => {
      this.mapProfiledata = data.docdata;
      this.mapProfile = data.map;
      this.buildProfileOptions();
    });
  }

  ngOnDestroy(): void {
    this.notificationSubscription?.unsubscribe();
  }

  // ── Fetch categories from classify/channelcategories ──────────────────────

  private async fetchCategories(): Promise<void> {
    try {
      // Path: classify (collection) -> channelcategories (document)
      const docRef = doc(this.firestore, 'classify', 'channelcategories');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const categories: { id: string; name: string }[] = data['categories'] || [];

        // Build category map: id -> name
        this.categoryMap = {};
        categories.forEach(cat => {
          this.categoryMap[cat.id] = cat.name;
        });

        // Set dropdown options (sorted by name)
        this.categoryOptions = [...categories].sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (err) {
      console.error('Error fetching channel categories:', err);
    }
  }

  // ── Fetch channels from supportchat collection (type == 'channel') ────────

  private async fetchChannelMap(): Promise<void> {
    try {
      const q = query(
        collection(this.firestore, 'supportchat'),
        where('type', '==', 'channel'),
        where('isdelete', '==', false)
      );
      const snap = await getDocs(q);
      this.channelMap = {};
      const options: { id: string; name: string }[] = [];

      snap.docs.forEach(d => {
        const data = d.data();
        const name = data['group_name'] || d.id;
        this.channelMap[d.id] = name;
        options.push({ id: d.id, name });
      });

      // Sort alphabetically by name
      this.channelOptions = options.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error('Error fetching channels from supportchat:', err);
    }
  }

  // ── Resolve channel name from a notification record ───────────────────────

  getChannelName(element: any): string {
    // metadata.channelid -> channelMap lookup
    const channelId = element?.metadata?.channelid || element?.channelid;
    if (channelId && this.channelMap[channelId]) {
      return this.channelMap[channelId];
    }
    // Fallback to stored channelname/channel field
    return element.channelname || element.channel || '-';
  }

  // ── Resolve category name from a notification record ─────────────────────

  getCategoryName(element: any): string {
    const categoryId = element?.metadata?.category || element?.categoryid || element?.category;
    if (categoryId && this.categoryMap[categoryId]) {
      return this.categoryMap[categoryId];
    }
    return element.notificationtype || element.category || '-';
  }

  // ── Default date range (last 7 days) ─────────────────────────────────────

  private setDefaultDates(): void {
    this.endDate = new Date();
    this.endDate.setHours(23, 59, 59, 999);

    this.startDate = new Date();
    this.startDate.setDate(this.startDate.getDate() - 7);
    this.startDate.setHours(0, 0, 0, 0);
  }

  // ── Data fetching ─────────────────────────────────────────────────────────

  fetchData(): void {
    if (!this.startDate || !this.endDate) return;

    this.notificationSubscription?.unsubscribe();

    const recordQuery = query(
      collection(this.firestore, 'notificationrecord'),
      where('date', '>=', this.startDate),
      where('date', '<=', this.endDate),
      where('notificationtype', '==', 'channel'),
      orderBy('date', 'desc')
    );

    this.notificationSubscription = collectionData(recordQuery, { idField: 'id' })
      .subscribe((list: any[]) => {
        list.forEach(element => {
          element['docid'] = element.id;
          element['receivedRate'] = (element['profileid']?.length > 0)
            ? +((element['profilesuccess']?.length || 0) / element['profileid'].length * 100).toFixed(2)
            : 0;
        });

        this.allNotifications = list;
        this.extractFilterOptions(list);
        this.notificationDataSource.data = list;
        this.notificationDataSource.sort = this.sort;
        this.notificationDataSource.paginator = this.paginator;
        this.updateStatistics(list);
      });
  }

  onDateChange(): void {
    this.fetchData();
  }

  // ── Filter options extraction ─────────────────────────────────────────────
  // Channel options come from fetchChannelMap (supportchat collection).
  // Category options come from fetchCategories (classify/channelcategories).
  // Nothing to extract from the data list.
  private extractFilterOptions(_list: any[]): void {}

  // ── Profile autocomplete ──────────────────────────────────────────────────

  private buildProfileOptions(): void {
    this.profileOptions = Object.keys(this.mapProfiledata).map(id => {
      const p = this.mapProfiledata[id];
      return {
        id,
        name: p?.name || this.mapProfile[id] || id,
        email: p?.email || ''
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    this.filteredProfileOptions = [...this.profileOptions];
  }

  onProfileSearchChange(): void {
    const term = this.profileSearchText.toLowerCase().trim();
    this.filteredProfileOptions = this.profileOptions.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.email.toLowerCase().includes(term)
    );
  }

  onProfileSelected(event: MatAutocompleteSelectedEvent): void {
    const selected = this.profileOptions.find(p => p.name === event.option.value);
    if (selected) {
      this.selectedProfileId = selected.id;
      this.profileSearchText = selected.name;
    }
    this.customFilter();
  }

  // ── Filter predicate & application ───────────────────────────────────────

  private setupFilterPredicate(): void {
    this.notificationDataSource.filterPredicate = (data: any, filter: string): boolean => {
      if (!filter || filter.trim() === '') return true;

      let filterObj: any;
      try {
        filterObj = JSON.parse(filter);
      } catch {
        return true;
      }

      // ── Text search across title, message body, channel name, category name ──
      const searchTerm = filterObj.searchText?.toLowerCase() || '';
      const channelDisplayName = this.getChannelName(data).toLowerCase();
      const categoryDisplayName = this.getCategoryName(data).toLowerCase();
      const messageText = (
        data['metadata']?.htmlbody ||
        data['metadata']?.textbody ||
        data['textbody'] ||
        data['message'] || ''
      ).toLowerCase();

      const searchMatch = !searchTerm || (
        data['title']?.toLowerCase().includes(searchTerm) ||
        messageText.includes(searchTerm) ||
        channelDisplayName.includes(searchTerm) ||
        categoryDisplayName.includes(searchTerm)
      );

      // ── Category filter — match metadata.category ID exactly ──────────────
      const recordCategoryId = data?.metadata?.category || data?.categoryid || data?.category || '';
      const categoryMatch = !filterObj.categoryId ||
        recordCategoryId === filterObj.categoryId;

      // ── Channel filter — match metadata.channelid ID exactly ──────────────
      const recordChannelId = data?.metadata?.channelid || data?.channelid || '';
      const channelMatch = !filterObj.channelId ||
        recordChannelId === filterObj.channelId;

      // ── Profile filter ────────────────────────────────────────────────────
      const profileMatch = !filterObj.profileId ||
        (Array.isArray(data['profileid']) && data['profileid'].includes(filterObj.profileId));

      // All active filters must match (AND logic)
      return searchMatch && categoryMatch && channelMatch && profileMatch;
    };
  }

  customFilter(): void {
    const filterValue = JSON.stringify({
      searchText: this.searchText || '',
      categoryId: this.selectedCategory || '',   // holds category ID
      channelId: this.selectedChannel || '',     // holds channel ID
      profileId: this.selectedProfileId || ''
    });

    this.notificationDataSource.filter = filterValue.trim();
    this.updateStatistics(this.notificationDataSource.filteredData);
  }

  onSearchChange(): void { this.customFilter(); }
  onFilterChange(): void { this.customFilter(); }

  clearFilters(): void {
    this.searchText = '';
    this.selectedCategory = '';
    this.selectedChannel = '';
    this.selectedProfileId = null;
    this.profileSearchText = '';
    this.filteredProfileOptions = [...this.profileOptions];
    this.notificationDataSource.filter = '';
    this.updateStatistics(this.allNotifications);
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  updateStatistics(data: any[]): void {
    this.totalNotifications = data.length;

    const today = new Date().toDateString();
    this.newlyNotifications = data.filter(item =>
      new Date(item.date.toDate()).toDateString() === today
    );

    const totalProfileIds = data.reduce((t, n) => t + (n?.profileid?.length || 0), 0);
    const totalNewly = this.newlyNotifications.reduce((t, n) => t + (n?.profileid?.length || 0), 0);

    const successTotal = data.reduce((t, n) => t + (n?.profilesuccess?.length || 0), 0);
    const successNewly = this.newlyNotifications.reduce((t, n) => t + (n?.profilesuccess?.length || 0), 0);

    this.failedNotifications = data.reduce((t, n) => t + (n?.profilefailed?.length || 0), 0);
    this.currentfailedRate = this.newlyNotifications.reduce((t, n) => t + (n?.profilefailed?.length || 0), 0);

    this.notificationSentRate = totalProfileIds > 0
      ? ((successTotal / totalProfileIds) * 100).toFixed(2)
      : '0';

    this.newlysentnotificationRate = totalNewly > 0
      ? ((successNewly / totalNewly) * 100).toFixed(2)
      : '0.00';
  }

  // ── Receiving-rate bar color ──────────────────────────────────────────────

  getReceivedRateColor(rate: number): string {
    if (rate >= 70) return '#4CAF50';
    if (rate >= 40) return '#FF9800';
    return '#F44336';
  }

  // ── Safe HTML for message body ────────────────────────────────────────────

  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }

  // ── Recipients dialog ─────────────────────────────────────────────────────

  openRecipientsDialog(notificationData: any): void {
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

    // Build success recipients
    if (notificationData.profilesuccess?.length) {
      this.successRecipients = notificationData.profilesuccess.map((profileId: string) => {
        const userRef = this.mapProfiledata[profileId]?.user_ref ?? null;
        const hasUserRef = !!userRef;
        if (hasUserRef) this.totalRecipientsWithUserRef++;

        return {
          profileId,
          name: this.mapProfile[profileId] || 'Unknown',
          status: 'Success',
          reason: '-',
          appstatus: notificationData.appFCMSuccess?.includes(profileId) ? 'App: Sent' : null,
          webstatus: notificationData.webFCMSuccess?.includes(profileId) ? 'Web: Sent' : null,
          logCount: 0,
          hasLogs: false,
          hasUserRef,
          logsLoading: false,
          logsChecked: false,
          read: false,
          clicked: 'unknown'
        };
      });
    }
    this.filteredSuccessRecipients = [...this.successRecipients];

    // Build failed recipients
    if (notificationData.profilefailed?.length) {
      this.failedRecipients = notificationData.profilefailed.map((profileId: string) => {
        const userRef = this.mapProfiledata[profileId]?.user_ref ?? null;
        const hasUserRef = !!userRef;
        if (hasUserRef) this.totalRecipientsWithUserRef++;

        return {
          profileId,
          name: this.mapProfile[profileId] || 'Unknown',
          status: 'Failed',
          reason: notificationData.failedlist?.[profileId] || 'Unknown error',
          appstatus: notificationData.appFCMFailed?.includes(profileId) ? 'App: Failed' : null,
          webstatus: notificationData.webFCMFailed?.includes(profileId) ? 'Web: Failed' : null,
          logCount: 0,
          hasLogs: false,
          hasUserRef,
          logsLoading: false,
          logsChecked: false,
          read: false,
          clicked: 'unknown'
        };
      });
    }
    this.filteredFailedRecipients = [...this.failedRecipients];

    this.loadLogsForVisibleItems();
  }

  closeRecipientsDialog(): void {
    this.showRecipientsDialog = false;
  }

  // ── Log loading helpers ───────────────────────────────────────────────────

  get allLogsLoaded(): boolean {
    return this.totalRecipientsWithUserRef === 0 ||
      this.logsCheckedCount >= this.totalRecipientsWithUserRef;
  }

  get logsLoadingProgress(): number {
    if (this.totalRecipientsWithUserRef === 0) return 100;
    return Math.round((this.logsCheckedCount / this.totalRecipientsWithUserRef) * 100);
  }

  loadAllLogsForExport(): void {
    if (this.allLogsLoaded || this.isLoadingAllLogs) return;
    this.isLoadingAllLogs = true;

    [...this.successRecipients, ...this.failedRecipients].forEach(r => {
      if (!r.logsChecked && r.hasUserRef) {
        const type = this.successRecipients.includes(r) ? 'success' : 'failed';
        this.fetchRecipientLogs(r.profileId, this.currentNotificationData.docid, type);
      }
    });
  }

  private loadLogsForVisibleItems(): void {
    const list = this.selectedTab === 'success'
      ? this.filteredSuccessRecipients
      : this.filteredFailedRecipients;

    const pageIndex = this.selectedTab === 'success' ? this.successPageIndex : this.failedPageIndex;
    const start = pageIndex * this.pageSize;
    const visible = list.slice(start, start + this.pageSize);

    visible.forEach(r => {
      if (!r.logsChecked && r.hasUserRef) {
        this.fetchRecipientLogs(r.profileId, this.currentNotificationData.docid, this.selectedTab);
      }
    });
  }

  async fetchRecipientLogs(
    profileId: string,
    docId: string,
    type: 'success' | 'failed'
  ): Promise<void> {
    const userRef = this.mapProfiledata[profileId]?.user_ref;
    if (!userRef) return;

    const recipient = type === 'success'
      ? this.successRecipients.find(r => r.profileId === profileId)
      : this.failedRecipients.find(r => r.profileId === profileId);

    if (recipient?.logsChecked || recipient?.logsLoading) return;

    this.updateRecipientLogStatus(profileId, type, { logsLoading: true });
    this.logsLoadingCount++;

    const logsRef = collection(this.firestore, 'notifications', userRef.id, 'logs');
    const q = query(logsRef, where('recordid', '==', docId));

    try {
      const snap = await getDocs(q);
      const logCount = snap.size;
      const hasLogs = logCount > 0;

      let read = false;
      let clicked = 'unknown';

      if (!snap.empty) {
        const logData = snap.docs[0].data();
        read = (logData['read'] === true) || this.NotificationReadUserID.includes(userRef.id);
        clicked = logData['clicked'] === true ? 'Yes' : 'unknown';
      } else {
        read = this.NotificationReadUserID.includes(userRef.id);
      }

      this.updateRecipientLogStatus(profileId, type, {
        logCount, hasLogs, logsLoading: false, logsChecked: true, read, clicked
      });
    } catch (err) {
      console.error('Error fetching channel logs:', err);
      this.updateRecipientLogStatus(profileId, type, { logsLoading: false, logsChecked: true });
    } finally {
      this.logsLoadingCount--;
      this.logsCheckedCount++;
      if (this.isLoadingAllLogs && this.allLogsLoaded) {
        this.isLoadingAllLogs = false;
      }
    }
  }

  private updateRecipientLogStatus(
    profileId: string,
    type: 'success' | 'failed',
    updates: Partial<any>
  ): void {
    if (type === 'success') {
      const idx = this.successRecipients.findIndex(r => r.profileId === profileId);
      if (idx > -1) {
        this.successRecipients[idx] = { ...this.successRecipients[idx], ...updates };
        this.filteredSuccessRecipients = [...this.successRecipients];
      }
    } else {
      const idx = this.failedRecipients.findIndex(r => r.profileId === profileId);
      if (idx > -1) {
        this.failedRecipients[idx] = { ...this.failedRecipients[idx], ...updates };
        this.filteredFailedRecipients = [...this.failedRecipients];
      }
    }
  }

  // ── Recipient search & tabs ───────────────────────────────────────────────

  filterRecipients(): void {
    const term = this.recipientSearchText?.toLowerCase().trim() || '';

    if (!term) {
      this.filteredSuccessRecipients = [...this.successRecipients];
      this.filteredFailedRecipients = [...this.failedRecipients];
    } else {
      this.filteredSuccessRecipients = this.successRecipients.filter(r =>
        r.name?.toLowerCase().includes(term)
      );
      this.filteredFailedRecipients = this.failedRecipients.filter(r =>
        r.name?.toLowerCase().includes(term) || r.reason?.toLowerCase().includes(term)
      );
    }

    this.successPageIndex = 0;
    this.failedPageIndex = 0;
    this.loadLogsForVisibleItems();
  }

  switchTab(tab: 'success' | 'failed'): void {
    this.selectedTab = tab;
    this.recipientSearchText = '';
    this.filterRecipients();
    this.loadLogsForVisibleItems();
  }

  // ── Paginator handlers ────────────────────────────────────────────────────

  onSuccessPageChange(event: any): void {
    this.successPageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLogsForVisibleItems();
  }

  onFailedPageChange(event: any): void {
    this.failedPageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadLogsForVisibleItems();
  }

  getPaginatedSuccessRecipients(): any[] {
    const start = this.successPageIndex * this.pageSize;
    return this.filteredSuccessRecipients.slice(start, start + this.pageSize);
  }

  getPaginatedFailedRecipients(): any[] {
    const start = this.failedPageIndex * this.pageSize;
    return this.filteredFailedRecipients.slice(start, start + this.pageSize);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportRecipientsToExcel(): void {
    if (!this.allLogsLoaded) return;
    this.isExporting = true;

    const rows = [
      ...this.successRecipients.map(r => ({
        Name: r.name || 'Unknown',
        Status: 'Success',
        Reason: '-',
        Channel: [r.appstatus, r.webstatus].filter(Boolean).join(', ') || '-',
        Read: r.read ? 'true' : 'false',
        Clicked: r.clicked,
        'Log Created': this.getLogStatusText(r)
      })),
      ...this.failedRecipients.map(r => ({
        Name: r.name || 'Unknown',
        Status: 'Failed',
        Reason: r.reason || 'Unknown error',
        Channel: [r.appstatus, r.webstatus].filter(Boolean).join(', ') || '-',
        Read: r.read ? 'true' : 'false',
        Clicked: r.clicked,
        'Log Created': this.getLogStatusText(r)
      }))
    ];

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 25 }, { wch: 10 }, { wch: 30 },
      { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 15 }
    ];

    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recipients');

    const title = this.currentNotificationData?.title || 'channel';
    const fileName = `channel_recipients_${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    this.isExporting = false;
  }

  getLogStatusText(recipient: any): string {
    if (!recipient.hasUserRef) return 'No User Ref';
    if (recipient.hasLogs) return `Yes (${recipient.logCount})`;
    return 'No';
  }
}