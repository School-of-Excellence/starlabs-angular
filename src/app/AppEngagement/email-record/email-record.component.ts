import { Component, OnInit, ViewChild, inject, AfterViewInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormsModule } from '@angular/forms';
import { collection, query, where, orderBy, Firestore, Timestamp, collectionData, getDocs } from '@angular/fire/firestore';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatBadgeModule } from '@angular/material/badge';
import { MatListModule } from '@angular/material/list';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthguardService } from '../../authguard.service';
import { Observable, startWith, map, Subscription, combineLatest, forkJoin, from } from 'rxjs';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

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
interface Participant {
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
  selector: 'app-email-record',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
    MatExpansionModule,
    MatBadgeModule,
    MatListModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatTabsModule,
    FormsModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './email-record.component.html',
  styleUrls: ['./email-record.component.css']
})
export class EmailRecordComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild(MatPaginator, { static: false }) paginator!: MatPaginator;
  @ViewChild(MatSort, { static: false }) sort!: MatSort;

  private firestore = inject(Firestore);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  // Subscriptions
  private emailArchiveSubscription?: Subscription;
  private profileSubscription?: Subscription;
  private filterSubscription?: Subscription;

  // category map
  private templateCategoryMap = new Map<string, string>();
  private templateSubCategoryMap = new Map<string, string>();
  private categorySubCategoriesMap = new Map<string, Set<string>>();

  // Data sources
  dataSource = new MatTableDataSource<any>([]);
  emailArchives: any[] = [];
  emailLogsMap: Map<string, EmailLog[]> = new Map();

  // Table configuration
  displayedColumns: string[] = ['time', 'templatename', 'subject', 'recipients', 'status', 'stats', 'deliveryRate'];

  // Loading states
  isLoading = false;
  isExporting = false;
  isLoadingLogs = false;

  // Filter form
  filterForm: FormGroup;

  // Statistics
  stats = {
    totalArchives: 0,
    sentRate: 0,
    deliveryRate: 0,
    openRate: 0,
    clickRate: 0,
    subscriptionChangeRate: 0,
    failedRate: 0,
    bounceRate: 0
  };

  // Filter options
  statusOptions = ['All Statuses'];
  profileOptions: any[] = [];
  filteredProfileOptions!: Observable<any[]>;

  // Selected record for details
  selectedRecord: any = null;
  mapProfile: any = {};

  // Unified Participants Popup Properties
  showParticipantsModal = false;
  selectedArchiveForPopup: any = null;
  allParticipants: Participant[] = [];
  filteredParticipants: Participant[] = [];
  participantSearchFilter = '';
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

  // Category / Sub-Category filter 
  categoryOptions: string[] = [];
  selectedCategory: string = 'All Categories';
  selectedSubCategory: string = 'All Sub-Categories';
  categorySearchTerm = '';
  subCategorySearchTerm = '';
  showCategoryDialog = false;
  categoryParticipants: any[] = [];
  filteredCategoryParticipants: any[] = [];
  categoryParticipantSearch = '';
  isCategoryLoading = false;

  // Pagination
  categoryPageSize = 30;
  categoryCurrentPage = 0;
  categoryDisplayedParticipants: any[] = [];
  categorySidebarColumns: string[] = ['email', 'templatename', 'sent', 'open', 'failed'];

  constructor(private authguard: AuthguardService) {
    this.filterForm = this.fb.group({
      search: [''],
      fromDate: [this.getDateDaysAgo(7)],
      toDate: [new Date()],
      status: ['All Statuses'],
      emailSearch: [''],
      profileSearch: [''],
      profileFilter: ['']
    });
  }

  ngOnInit(): void {
    this.initializeProfileData();
    this.setupFilterSubscriptions();
    this.loadInitialData();
    this.loadAllCategories(); 
  }

  ngAfterViewInit(): void {
    this.initializeTableControls();
    this.dataSource.connect().subscribe(() => {
      if (this.paginator && this.sort && this.dataSource.data.length > 0) {
        if (!this.dataSource.paginator) {
          this.dataSource.paginator = this.paginator;
        }
        if (!this.dataSource.sort) {
          this.dataSource.sort = this.sort;
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.emailArchiveSubscription?.unsubscribe();
    this.profileSubscription?.unsubscribe();
    this.filterSubscription?.unsubscribe();
  }

  private initializeTableControls(): void {
    this.dataSource.sortingDataAccessor = (item: any, property: string) => {
      switch (property) {
        case 'time':
          if (item.date && item.date.toDate) {
            return item.date.toDate().getTime();
          } else if (item.date) {
            return new Date(item.date).getTime();
          }
          return 0;
        case 'subject':
          return (item.subject || item.broadcastname || '').toLowerCase();
        case 'recipients':
          return item.statusCounts?.total || 0;
        case 'status':
          return (item.status || '').toLowerCase();
        case 'stats':
          return item.statusCounts?.sent || 0;
        case 'deliveryRate':
          return item.deliveryRate || 0;
        default:
          const value = item[property];
          return typeof value === 'string' ? value.toLowerCase() : (value || 0);
      }
    };

    this.dataSource.filterPredicate = (data: any, filter: string): boolean => {
      if (!filter.trim()) return true;
      try {
        const filterObj = JSON.parse(filter);
        return this.customFilterPredicate(data, filterObj);
      } catch {
        return true;
      }
    };

    setTimeout(() => {
      if (this.paginator && this.sort) {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      }
    }, 0);
  }

  private initializeProfileData(): void {
    this.authguard.getProfileMap().then((data) => {
      this.mapProfile = data.docdata;
      this.setupProfileOptions();
      this.setupProfileAutocomplete();
    });
  }

  private setupFilterSubscriptions(): void {
    this.filterSubscription = combineLatest([
      this.filterForm.get('search')!.valueChanges.pipe(startWith('')),
      this.filterForm.get('status')!.valueChanges.pipe(startWith('All Statuses')),
      this.filterForm.get('emailSearch')!.valueChanges.pipe(startWith('')),
      this.filterForm.get('profileSearch')!.valueChanges.pipe(startWith('')),
      this.filterForm.get('profileFilter')!.valueChanges.pipe(startWith(''))
    ]).subscribe(() => {
      this.applyFilters();
    });
  }

  get filteredCategoryOptionsForDropdown(): string[] {
    const term = this.categorySearchTerm.toLowerCase().trim();
    const withAll = ['All Categories', ...this.categoryOptions];
    if (!term) return withAll;
    return withAll.filter(c => c.toLowerCase().includes(term));
  }

  get filteredSubCategoryOptionsForDropdown(): string[] {
    const term = this.subCategorySearchTerm.toLowerCase().trim();
    const all = new Set<string>();

    if (this.selectedCategory === 'All Categories') {
      this.categorySubCategoriesMap.forEach(subs => subs.forEach(s => all.add(s)));
    } else {
      const subs = this.categorySubCategoriesMap.get(this.selectedCategory);
      if (subs) subs.forEach(s => all.add(s));
    }

    const withAll = ['All Sub-Categories', ...Array.from(all).sort()];
    if (!term) return withAll;
    return withAll.filter(s => s.toLowerCase().includes(term));
  }

  private setupProfileOptions(): void {
    this.profileOptions = [];
    Object.keys(this.mapProfile).forEach(profileId => {
      const profile = this.mapProfile[profileId];
      this.profileOptions.push({
        id: profileId,
        name: profile.name || profile.email || profileId,
        email: profile.email || ''
      });
    });
    this.profileOptions.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async loadAllCategories(): Promise<void> {
    try {
      const templatesSnapshot = await getDocs(
        collection(this.firestore, 'email templates')
      );

      const uniqueCategories = new Set<string>();
      this.templateCategoryMap.clear();
      this.templateSubCategoryMap.clear();
      this.categorySubCategoriesMap.clear();

      templatesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const category = data['category'];
        const subcategory = data['subcategory'];

        if (category) {
          uniqueCategories.add(category);
          this.templateCategoryMap.set(doc.id, category);
          if (data['templateid']) {
            this.templateCategoryMap.set(data['templateid'], category);
          }
          if (data['templatealias']) {
            this.templateCategoryMap.set(data['templatealias'], category);
          }

          if (subcategory) {
            if (!this.categorySubCategoriesMap.has(category)) {
              this.categorySubCategoriesMap.set(category, new Set<string>());
            }
            this.categorySubCategoriesMap.get(category)!.add(subcategory);
          }
        }

        if (subcategory) {
          this.templateSubCategoryMap.set(doc.id, subcategory);
          if (data['templateid']) {
            this.templateSubCategoryMap.set(data['templateid'], subcategory);
          }
          if (data['templatealias']) {
            this.templateSubCategoryMap.set(data['templatealias'], subcategory);
          }
        }
      });

      this.categoryOptions = Array.from(uniqueCategories).sort();
    } catch (error) {
      console.error('Error loading template categories:', error);
    }
  }

  private setupProfileAutocomplete(): void {
    this.filteredProfileOptions = this.filterForm.get('profileFilter')!.valueChanges.pipe(
      startWith(''),
      map(value => {
        const filterValue = typeof value === 'string' ? value : (value?.name || '');
        return this._filterProfiles(filterValue);
      })
    );
  }

  private _filterProfiles(value: string): any[] {
    const filterValue = value.toLowerCase();
    return this.profileOptions.filter(option =>
      option.name.toLowerCase().includes(filterValue) ||
      option.email.toLowerCase().includes(filterValue) ||
      option.id.toLowerCase().includes(filterValue)
    );
  }

  displayProfile(profile: any): string {
    return profile ? profile.name : '';
  }

  private getDateDaysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  async loadInitialData(): Promise<void> {
    this.isLoading = true;
    try {
      this.subscribeToEmailArchives();
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showSnackBar('Error loading data');
      this.isLoading = false;
    }
  }

  private subscribeToEmailArchives(): void {
    const fromDate = this.filterForm.get('fromDate')?.value;
    const toDate = this.filterForm.get('toDate')?.value;

    let emailArchiveQuery = query(
      collection(this.firestore, 'email archive'),
      orderBy('date', 'desc')
    );

    if (fromDate && toDate) {
      const fromTimestamp = Timestamp.fromDate(fromDate);
      const toTimestamp = Timestamp.fromDate(new Date(toDate.getTime() + 24 * 60 * 60 * 1000));

      emailArchiveQuery = query(
        collection(this.firestore, 'email archive'),
        where('date', '>=', fromTimestamp),
        where('date', '<=', toTimestamp),
        orderBy('date', 'desc')
      );
    }

    if (this.emailArchiveSubscription) {
      this.emailArchiveSubscription.unsubscribe();
    }

    this.emailArchiveSubscription = collectionData(emailArchiveQuery, { idField: 'docid' })
      .subscribe({
        next: async (data) => {
          console.log('Received email archives from Firestore:', data.length);
          this.emailArchives = data;

          // Fetch email logs for all archives
          await this.fetchEmailLogsForArchives(data);

          this.processData();
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error in email archive subscription:', error);
          this.showSnackBar('Error loading email archives');
          this.isLoading = false;
        }
      });
  }

  // Fetch email logs from 'email logs' collection for all archives
  private async fetchEmailLogsForArchives(archives: any[]): Promise<void> {
    this.isLoadingLogs = true;
    this.emailLogsMap.clear();

    const archiveIds = archives.map(a => a.docid).filter(id => id);

    if (archiveIds.length === 0) {
      this.isLoadingLogs = false;
      return;
    }

    try {
      // Fetch logs in batches (Firestore 'in' query supports max 30 items)
      const batchSize = 30;
      const batches: string[][] = [];

      for (let i = 0; i < archiveIds.length; i += batchSize) {
        batches.push(archiveIds.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const logsQuery = query(
          collection(this.firestore, 'email logs'),
          where('emailarchiveid', 'in', batch)
        );

        const snapshot = await getDocs(logsQuery);

        snapshot.docs.forEach(doc => {
          const logData = { docid: doc.id, ...doc.data() } as EmailLog;
          const archiveId = logData.emailarchiveid;

          if (!this.emailLogsMap.has(archiveId)) {
            this.emailLogsMap.set(archiveId, []);
          }
          this.emailLogsMap.get(archiveId)!.push(logData);
        });
      }

      console.log('Email logs fetched for', this.emailLogsMap.size, 'archives');
    } catch (error) {
      console.error('Error fetching email logs:', error);
      this.showSnackBar('Error fetching email logs');
    } finally {
      this.isLoadingLogs = false;
    }
  }

  private processData(): void {
    console.log('Processing data:', this.emailArchives.length, 'records');

    const processedData = this.emailArchives.map((archive: any) => {
      const archiveId = archive.docid;
      const logs = this.emailLogsMap.get(archiveId) || [];

      // Get all recipients from the archive
      const allRecipients = archive.emailid || archive.profileid || [];
      const totalRecipients = allRecipients.length;

      // Calculate status counts from logs
      const statusCounts: StatusCounts = {
        sent: 0,
        delivery: 0,
        open: 0,
        click: 0,
        bounce: 0,
        subscriptionchange: 0,
        failed: 0,
        notSent: 0,
        total: totalRecipients
      };

      // Create sets for unique emails per status
      const sentEmails = new Set<string>();
      const deliveredEmails = new Set<string>();
      const openedEmails = new Set<string>();
      const clickedEmails = new Set<string>();
      const bouncedEmails = new Set<string>();
      const subscriptionChangeEmails = new Set<string>();
      const failedEmails = new Set<string>();

      // Process logs to count unique statuses
      logs.forEach(log => {
        const email = log.email?.toLowerCase();
        if (!email) return;

        switch (log.msgstatus?.toLowerCase()) {
          case 'sent':
            sentEmails.add(email);
            break;
          case 'delivery':
          case 'delivered':
            deliveredEmails.add(email);
            break;
          case 'open':
          case 'opened':
            openedEmails.add(email);
            break;
          case 'click':
          case 'clicked':
            clickedEmails.add(email);
            break;
          case 'bounce':
          case 'bounced':
            bouncedEmails.add(email);
            break;
          case 'subscriptionchange':
          case 'unsubscribe':
          case 'unsubscribed':
            subscriptionChangeEmails.add(email);
            break;
          case 'failed':
          case 'error':
            failedEmails.add(email);
            break;
        }
      });

      statusCounts.sent = sentEmails.size;
      statusCounts.delivery = deliveredEmails.size;
      statusCounts.open = openedEmails.size;
      statusCounts.click = clickedEmails.size;
      statusCounts.bounce = bouncedEmails.size;
      statusCounts.subscriptionchange = subscriptionChangeEmails.size;
      statusCounts.failed = failedEmails.size;

      // Calculate not sent (recipients who don't have a 'sent' log)
      const allRecipientEmails = new Set<string>(allRecipients.map((r: string) => r.toLowerCase()));
      const notSentCount = [...allRecipientEmails].filter((email: string) => !sentEmails.has(email)).length;
      statusCounts.notSent = notSentCount;

      // Calculate rates
      const deliveryRate = statusCounts.sent > 0 ? Math.round((statusCounts.delivery / statusCounts.sent) * 100) : 0;
      const openRate = statusCounts.delivery > 0 ? Math.round((statusCounts.open / statusCounts.delivery) * 100) : 0;
      const clickRate = statusCounts.open > 0 ? Math.round((statusCounts.click / statusCounts.open) * 100) : 0;
      const bounceRate = statusCounts.sent > 0 ? Math.round((statusCounts.bounce / statusCounts.sent) * 100) : 0;
      const failedRate = totalRecipients > 0 ? Math.round((statusCounts.failed / totalRecipients) * 100) : 0;

      return {
        ...archive,
        logs,
        statusCounts,
        totalRecipients,
        deliveryRate,
        openRate,
        clickRate,
        bounceRate,
        failedRate,
        // Keep these for backward compatibility
        sentCount: statusCounts.sent,
        deliveredCount: statusCounts.delivery,
        openedCount: statusCounts.open,
        clickedCount: statusCounts.click,
        bounceCount: statusCounts.bounce,
        subscriptionChangeCount: statusCounts.subscriptionchange,
        failedCount: statusCounts.failed,
        notSentCount: statusCounts.notSent
      };
    });

    console.log('Processed data:', processedData.length, 'records');

    this.extractStatusOptions(processedData);
    this.dataSource.data = processedData;
    this.dataSource._updateChangeSubscription();

    setTimeout(() => {
      if (this.paginator && this.sort) {
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      }
      this.applyFilters();
      this.calculateStats();
      this.cdr.detectChanges();
    }, 0);
  }

  private extractStatusOptions(data: any[]): void {
    const uniqueStatuses = new Set<string>();
    data.forEach(record => {
      if (record.status) {
        uniqueStatuses.add(record.status);
      }
    });
    this.statusOptions = ['All Statuses', ...Array.from(uniqueStatuses).sort()];
  }

  private customFilterPredicate(data: any, filterObj: any): boolean {
    if (filterObj.search && filterObj.search.trim()) {
      const searchLower = filterObj.search.toLowerCase();
      const searchMatch =
        (data.subject && data.subject.toLowerCase().includes(searchLower)) ||
        (data.body && data.body.toLowerCase().includes(searchLower)) ||
        (data.broadcastname && data.broadcastname.toLowerCase().includes(searchLower));
      if (!searchMatch) return false;
    }

    if (filterObj.emailSearch && filterObj.emailSearch.trim()) {
      const emailSearchLower = filterObj.emailSearch.toLowerCase();
      const emailMatch =
        (data.emailid && data.emailid.some((email: string) => email.toLowerCase().includes(emailSearchLower))) ||
        (data.logs && data.logs.some((log: EmailLog) => log.email?.toLowerCase().includes(emailSearchLower)));
      if (!emailMatch) return false;
    }

    if (filterObj.profileSearch && filterObj.profileSearch.trim()) {
      const profileSearchLower = filterObj.profileSearch.toLowerCase();
      const profileMatch = data.profileid && data.profileid.some((profileId: string) => {
        const profile = this.mapProfile[profileId];
        return (profile && profile.name && profile.name.toLowerCase().includes(profileSearchLower)) ||
          (profile && profile.email && profile.email.toLowerCase().includes(profileSearchLower)) ||
          profileId.toLowerCase().includes(profileSearchLower);
      });
      if (!profileMatch) return false;
    }

    if (filterObj.profileFilter && typeof filterObj.profileFilter === 'object' && filterObj.profileFilter.id) {
      const selectedProfileId = filterObj.profileFilter.id;
      const profileMatch = data.profileid && data.profileid.includes(selectedProfileId);
      if (!profileMatch) return false;
    }

    if (filterObj.status && filterObj.status !== 'All Statuses') {
      const selectedStatus = filterObj.status.toLowerCase();
      let statusMatch = false;
      if (data.status && data.status.toLowerCase() === selectedStatus) {
        statusMatch = true;
      }
      if (!statusMatch) return false;
    }

    if (filterObj.category && filterObj.category !== 'All Categories') {
      const selectedCat = filterObj.category;

      const catMatch =
        data.category === selectedCat ||
        (data.templatedocid && this.templateCategoryMap.get(data.templatedocid) === selectedCat) ||
        (data.templateid && this.templateCategoryMap.get(data.templateid) === selectedCat) ||
        (data.templatealias && this.templateCategoryMap.get(data.templatealias) === selectedCat);

      if (!catMatch) return false;
    }

    if (filterObj.subCategory && filterObj.subCategory !== 'All Sub-Categories') {
      const selectedSub = filterObj.subCategory;

      const subMatch =
        data.subcategory === selectedSub ||
        (data.templatedocid && this.templateSubCategoryMap.get(data.templatedocid) === selectedSub) ||
        (data.templateid && this.templateSubCategoryMap.get(data.templateid) === selectedSub) ||
        (data.templatealias && this.templateSubCategoryMap.get(data.templatealias) === selectedSub);

      if (!subMatch) return false;
    }

    return true;
  }

  applyFilters(): void {
    const profileFilterValue = this.filterForm.get('profileFilter')?.value;
    const filterValue = JSON.stringify({
      search: this.filterForm.get('search')?.value || '',
      emailSearch: this.filterForm.get('emailSearch')?.value || '',
      profileSearch: this.filterForm.get('profileSearch')?.value || '',
      profileFilter: profileFilterValue || null,
      status: this.filterForm.get('status')?.value || 'All Statuses',
      category: this.selectedCategory,
      subCategory: this.selectedSubCategory
    });

    this.dataSource.filter = filterValue;
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
    this.calculateStats();
  }

  openCategorySidebar(category: string, subCategory: string): void {
    const hasCategory = category && category !== 'All Categories';
    const hasSubCategory = subCategory && subCategory !== 'All Sub-Categories';
    if (!hasCategory && !hasSubCategory) return;

    const categories = hasCategory ? [category] : [];
    const subCategories = hasSubCategory ? [subCategory] : [];
    this.categoryParticipantSearch = '';
    this.isCategoryLoading = true;
    this.showCategoryDialog = true;
    this.categoryCurrentPage = 0;
    this.buildCategoryParticipants(categories, subCategories);
  }

  private buildCategoryParticipants(categories: string[], subCategories: string[] = []): void {
  const matchingRecords = this.dataSource.data.filter((r: any) => {
    const catMatches = categories.length === 0 || categories.some(category =>
      r.category === category ||
      (r.templatedocid && this.templateCategoryMap.get(r.templatedocid) === category) ||
      (r.templateid && this.templateCategoryMap.get(r.templateid) === category) ||
      (r.templatealias && this.templateCategoryMap.get(r.templatealias) === category)
    );

    if (!catMatches) return false;
    if (subCategories.length === 0) return true;

    return subCategories.some(subCategory =>
      r.subcategory === subCategory ||
      (r.templatedocid && this.templateSubCategoryMap.get(r.templatedocid) === subCategory) ||
      (r.templateid && this.templateSubCategoryMap.get(r.templateid) === subCategory) ||
      (r.templatealias && this.templateSubCategoryMap.get(r.templatealias) === subCategory)
    );
  });

  const participantMap = new Map<string, {
    email: string;
    name: string;
    profileid: string;
    templates: Set<string>;
    sent: boolean;
    open: boolean;
    failed: boolean;
    notSent: boolean;
  }>();

  matchingRecords.forEach((record: any) => {
    const templateName = record.templateid || record.templatename || 'No Template';
    const logs: EmailLog[] = record.logs || [];
    const allRecipients: string[] = record.emailid || [];

    const sentSet = new Set<string>();
    const openSet = new Set<string>();
    const failedSet = new Set<string>();

    logs.forEach(log => {
      const email = log.email?.toLowerCase();
      if (!email) return;
      const s = log.msgstatus?.toLowerCase();
      if (s === 'sent') sentSet.add(email);
      if (s === 'open' || s === 'opened') openSet.add(email);
      if (s === 'failed' || s === 'error') failedSet.add(email);
    });

    allRecipients.forEach((rawEmail: string) => {
      const emailKey = rawEmail.toLowerCase();
      const profileId = record.emailmap?.[rawEmail] || record.emailmap?.[emailKey] || '';
      const profile = profileId
        ? this.mapProfile[profileId]
        : this.findProfileByEmail(emailKey);

      if (!participantMap.has(emailKey)) {
        participantMap.set(emailKey, {
          email: rawEmail,
          name: profile?.name || 'Unknown',
          profileid: profileId || profile?.id || '',
          templates: new Set<string>(),
          sent: false,
          open: false,
          failed: false,
          notSent: false
        });
      }

      const entry = participantMap.get(emailKey)!;
      entry.templates.add(templateName);
      if (sentSet.has(emailKey)) entry.sent = true;
      if (openSet.has(emailKey)) entry.open = true;
      if (failedSet.has(emailKey)) entry.failed = true;
      if (!sentSet.has(emailKey)) entry.notSent = true;
    });
  });

 this.categoryParticipants = Array.from(participantMap.values()).map(p => ({
    ...p,
    templateNames: Array.from(p.templates).join(', '),
    templateList: Array.from(p.templates)  
  }));

  this.enrichParticipantsWithTemplateStatus(this.categoryParticipants, categories, subCategories);

  this.filterCategoryParticipants();
  this.isCategoryLoading = false;
}

get isCategoriesIndeterminate(): boolean {
  const options = this.filteredCategoryOptionsForDropdown;
  const selectedCount = options.filter(c => this.selectedCategory.includes(c)).length;
  return selectedCount > 0 && selectedCount < options.length;
}

onCategorySelectionChange(): void {
  this.pruneInvalidSubCategorySelections();
  this.applyFilters();
}

onSubCategorySelectionChange(): void {
  this.applyFilters();
}

private pruneInvalidSubCategorySelections(): void {
  if (this.selectedCategory === 'All Categories') return;
  const validSubs = this.categorySubCategoriesMap.get(this.selectedCategory);
  if (!validSubs || !validSubs.has(this.selectedSubCategory)) {
    this.selectedSubCategory = 'All Sub-Categories';
  }
}

fetchSentCount(p: any): number {
  return (p.templateStatuses || []).filter((ts: any) => ts.sent && !ts.failed).length;
}
fetchOpenCount(p: any): number {
  return (p.templateStatuses || []).filter((ts: any) => ts.open).length;
}
fetchFailedCount(p: any): number {
  return (p.templateStatuses || []).filter((ts: any) => ts.failed).length;
}

private enrichParticipantsWithTemplateStatus(participants: any[], categories: string[], subCategories: string[] = []): void {
  const matchingRecords = this.dataSource.data.filter((r: any) => {
    const catMatches = categories.length === 0 || categories.some(category =>
      r.category === category ||
      (r.templatedocid && this.templateCategoryMap.get(r.templatedocid) === category) ||
      (r.templateid && this.templateCategoryMap.get(r.templateid) === category) ||
      (r.templatealias && this.templateCategoryMap.get(r.templatealias) === category)
    );

    if (!catMatches) return false;
    if (subCategories.length === 0) return true;

    return subCategories.some(subCategory =>
      r.subcategory === subCategory ||
      (r.templatedocid && this.templateSubCategoryMap.get(r.templatedocid) === subCategory) ||
      (r.templateid && this.templateSubCategoryMap.get(r.templateid) === subCategory) ||
      (r.templatealias && this.templateSubCategoryMap.get(r.templatealias) === subCategory)
    );
  });

  const emailTemplateMap = new Map<string, Map<string, { sent: boolean; open: boolean; failed: boolean }>>();

  matchingRecords.forEach((record: any) => {
    const templateName = record.templateid || record.templatename || 'No Template';
    const logs: EmailLog[] = record.logs || [];
    const recordRecipients = new Set<string>(
      (record.emailid || []).map((e: string) => e.toLowerCase())
    );

    if (recordRecipients.size === 0) return;

    const sentSet = new Set<string>();
    const openSet = new Set<string>();
    const failedSet = new Set<string>();

    logs.forEach((log: EmailLog) => {
      const email = log.email?.toLowerCase();
      if (!email) return;
      const s = log.msgstatus?.toLowerCase();
      if (s === 'sent') sentSet.add(email);
      if (s === 'open' || s === 'opened') openSet.add(email);
      if (s === 'failed' || s === 'error') failedSet.add(email);
    });

    recordRecipients.forEach((emailKey: string) => {
      if (!emailTemplateMap.has(emailKey)) {
        emailTemplateMap.set(emailKey, new Map());
      }
      const tMap = emailTemplateMap.get(emailKey)!;

      const wasSent = sentSet.has(emailKey);
      const wasFailed = failedSet.has(emailKey);
      const wasOpened = openSet.has(emailKey);

      if (wasSent || wasFailed || wasOpened) {
        tMap.set(templateName, {
          sent: wasSent,
          open: wasOpened,
          failed: wasFailed
        });
      }
    });
  });

  participants.forEach(p => {
    const emailKey = p.email.toLowerCase();
    const tMap = emailTemplateMap.get(emailKey);
    p.templateStatuses = tMap
      ? Array.from(tMap.entries()).map(([name, flags]) => ({
          templateName: name,
          sent: flags.sent,
          open: flags.open,
          failed: flags.failed
        }))
      : [];
  });
}

filterCategoryParticipants(): void {
  const search = this.categoryParticipantSearch.toLowerCase().trim();
  const base = !search
    ? [...this.categoryParticipants]
    : this.categoryParticipants.filter(p =>
        p.email.toLowerCase().includes(search) ||
        p.name.toLowerCase().includes(search) ||
        p.profileid.toLowerCase().includes(search) ||
        p.templateNames.toLowerCase().includes(search)
      );
  this.filteredCategoryParticipants = base;
  this.categoryCurrentPage = 0;
  this.updateCategoryPage();
}

updateCategoryPage(): void {
  const start = this.categoryCurrentPage * this.categoryPageSize;
  this.categoryDisplayedParticipants = this.filteredCategoryParticipants.slice(start, start + this.categoryPageSize);
}

get categoryTotalPages(): number {
  return Math.ceil(this.filteredCategoryParticipants.length / this.categoryPageSize);
}

categoryNextPage(): void {
  if (this.categoryCurrentPage < this.categoryTotalPages - 1) {
    this.categoryCurrentPage++;
    this.updateCategoryPage();
  }
}

categoryPrevPage(): void {
  if (this.categoryCurrentPage > 0) {
    this.categoryCurrentPage--;
    this.updateCategoryPage();
  }
}

onCategoryParticipantSearchChange(): void {
  this.filterCategoryParticipants();
}

closeCategorySidebar(): void {
  this.showCategoryDialog = false;
  this.categoryParticipants = [];
  this.filteredCategoryParticipants = [];
  this.categoryDisplayedParticipants = [];
  this.categoryParticipantSearch = '';
}

get categorySidebarSentCount(): number {
  return this.categoryParticipants.filter(p => p.sent).length;
}
get categorySidebarOpenCount(): number {
  return this.categoryParticipants.filter(p => p.open).length;
}
get categorySidebarFailedCount(): number {
  return this.categoryParticipants.filter(p => p.failed).length;
}

exportCategoryParticipants(): void {
  if (!this.filteredCategoryParticipants.length) {
    this.showSnackBar('No participants to export');
    return;
  }
  const headers = ['Email', 'Name', 'Profile ID', 'Templates', 'Sent', 'Opened', 'Failed'];
  const rows = [headers.join(',')];
  this.filteredCategoryParticipants.forEach(p => {
    rows.push([
      `"${p.email}"`,
      `"${p.name}"`,
      `"${p.profileid}"`,
      `"${p.templateNames}"`,
      p.sent ? 'Yes' : 'No',
      p.open ? 'Yes' : 'No',
      p.failed ? 'Yes' : 'No'
    ].join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `category-${this.selectedCategory}-participants.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  this.showSnackBar('Exported successfully');
}

  calculateStats(): void {
    const records = this.dataSource.filteredData || this.dataSource.data;
    const totalArchives = records.length;

    if (totalArchives === 0) {
      this.stats = {
        totalArchives: 0,
        sentRate: 0,
        deliveryRate: 0,
        openRate: 0,
        clickRate: 0,
        subscriptionChangeRate: 0,
        failedRate: 0,
        bounceRate: 0
      };
      return;
    }

    const totalSent = records.reduce((sum, record) => sum + (record.statusCounts?.sent || 0), 0);
    const totalDelivered = records.reduce((sum, record) => sum + (record.statusCounts?.delivery || 0), 0);
    const totalOpened = records.reduce((sum, record) => sum + (record.statusCounts?.open || 0), 0);
    const totalClicked = records.reduce((sum, record) => sum + (record.statusCounts?.click || 0), 0);
    const totalSubscriptionChanges = records.reduce((sum, record) => sum + (record.statusCounts?.subscriptionchange || 0), 0);
    const totalFailed = records.reduce((sum, record) => sum + (record.statusCounts?.failed || 0), 0);
    const totalBounced = records.reduce((sum, record) => sum + (record.statusCounts?.bounce || 0), 0);
    const totalRecipients = records.reduce((sum, record) => sum + (record.statusCounts?.total || 0), 0);

    this.stats = {
      totalArchives,
      sentRate: totalRecipients > 0 ? Math.round((totalSent / totalRecipients) * 100) : 0,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      openRate: totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 100) : 0,
      clickRate: totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0,
      subscriptionChangeRate: totalRecipients > 0 ? Math.round((totalSubscriptionChanges / totalRecipients) * 100) : 0,
      failedRate: totalRecipients > 0 ? Math.round((totalFailed / totalRecipients) * 100) : 0,
      bounceRate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0
    };
  }

  async applyDateFilter(): Promise<void> {
    this.isLoading = true;
    try {
      this.subscribeToEmailArchives();
      this.showSnackBar('Date filter applied successfully');
    } catch (error) {
      console.error('Error applying date filter:', error);
      this.showSnackBar('Error applying date filter');
      this.isLoading = false;
    }
  }

  clearFilters(): void {
    this.filterForm.patchValue({
      search: '',
      fromDate: this.getDateDaysAgo(7),
      toDate: new Date(),
      status: 'All Statuses',
      emailSearch: '',
      profileSearch: '',
      profileFilter: ''
    });
    this.selectedCategory = 'All Categories';
    this.selectedSubCategory = 'All Sub-Categories';
    this.applyDateFilter();
  }

  // ==================== UNIFIED PARTICIPANTS POPUP ====================

  openParticipantsPopup(record: any, initialStatusFilter: string = 'all'): void {
    this.selectedArchiveForPopup = record;
    this.selectedStatusFilters = [initialStatusFilter];
    this.participantSearchFilter = '';
    
    // Build participants list from logs and archive data
    this.buildParticipantsList(record);
    
    // Apply initial filter
    this.filterParticipantsInPopup();
    
    this.showParticipantsModal = true;
  }

  private buildParticipantsList(record: any): void {
    this.allParticipants = [];
    const logs: EmailLog[] = record.logs || [];
    const allRecipients: string[] = record.emailid || [];
    
    // Create a map to track each participant's statuses
    const participantMap = new Map<string, Participant>();
    
    // Initialize all recipients
    allRecipients.forEach((emailOrProfileId: string) => {
      const email = emailOrProfileId.toLowerCase();
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

  // Export participants list
  exportParticipants(): void {
    if (!this.filteredParticipants.length) {
      this.showSnackBar('No participants to export');
      return;
    }

    const headers = ['Email', 'Name', 'Profile ID', 'Sent', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Unsubscribed', 'Failed', 'Not Sent'];
    const csvRows = [headers.join(',')];

    this.filteredParticipants.forEach(participant => {
      const row = [
        `"${participant.email}"`,
        `"${participant.name || ''}"`,
        `"${participant.profileid || ''}"`,
        participant.statuses.sent ? 'Yes' : 'No',
        participant.statuses.delivery ? 'Yes' : 'No',
        participant.statuses.open ? 'Yes' : 'No',
        participant.statuses.click ? 'Yes' : 'No',
        participant.statuses.bounce ? 'Yes' : 'No',
        participant.statuses.subscriptionchange ? 'Yes' : 'No',
        participant.statuses.failed ? 'Yes' : 'No',
        participant.statuses.notSent ? 'Yes' : 'No'
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `participants-${this.selectedArchiveForPopup?.docid || 'export'}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    this.showSnackBar('Participants exported successfully');
  }

  // ==================== END UNIFIED PARTICIPANTS POPUP ====================

  async exportData(): Promise<void> {
    this.isExporting = true;
    try {
      const csvData = this.convertToCSV(this.dataSource.filteredData);
      this.downloadCSV(csvData, 'email-records.csv');
      this.showSnackBar('Data exported successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      this.showSnackBar('Error exporting data');
    } finally {
      this.isExporting = false;
    }
  }

  private convertToCSV(data: any[]): string {
    const headers = ['Time', 'Subject', 'Total Recipients', 'Status', 'Sent', 'Delivered', 'Opened', 'Clicked', 'Bounced', 'Subscription Changes', 'Failed', 'Not Sent', 'Delivery Rate', 'Open Rate', 'Click Rate'];
    const csvRows = [headers.join(',')];

    data.forEach(record => {
      const row = [
        this.formatDateTime(record.date),
        `"${record.subject || record.broadcastname || ''}"`,
        record.statusCounts?.total || 0,
        record.status || '',
        record.statusCounts?.sent || 0,
        record.statusCounts?.delivery || 0,
        record.statusCounts?.open || 0,
        record.statusCounts?.click || 0,
        record.statusCounts?.bounce || 0,
        record.statusCounts?.subscriptionchange || 0,
        record.statusCounts?.failed || 0,
        record.statusCounts?.notSent || 0,
        `${record.deliveryRate}%`,
        `${record.openRate}%`,
        `${record.clickRate}%`
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  private downloadCSV(csvData: string, filename: string): void {
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  formatDateTime(time: any): string {
    if (!time) return '';
    const t = time?.toDate ? time.toDate() : new Date(time);
    return t.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  formatDate(time: any): string {
    if (!time) return '';
    const t = time?.toDate ? time.toDate() : new Date(time);
    return t.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  }

  formatTime(time: any): string {
    if (!time) return '';
    const t = time?.toDate ? time.toDate() : new Date(time);
    return t.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  getStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'sent':
        return 'primary';
      case 'delivered':
      case 'completed':
        return 'accent';
      case 'failed':
        return 'warn';
      case 'pending':
        return '';
      default:
        return '';
    }
  }

  getDeliveryRateColor(rate: number): string {
    if (rate >= 90) return 'success';
    if (rate >= 70) return 'warning';
    return 'danger';
  }

  private showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

  debugTableState(): void {
    console.log('=== TABLE DEBUG INFO ===');
    console.log('DataSource data length:', this.dataSource.data.length);
    console.log('DataSource filtered data length:', this.dataSource.filteredData?.length);
    console.log('Email archives length:', this.emailArchives.length);
    console.log('Email logs map size:', this.emailLogsMap.size);
    console.log('Paginator connected:', !!this.dataSource.paginator);
    console.log('Sort connected:', !!this.dataSource.sort);
    console.log('Sample data item:', this.dataSource.data[0]);
    console.log('========================');
  }

  // Getter methods for template access
  get totalArchives() { return this.stats.totalArchives; }
  get sentRate() { return this.stats.sentRate; }
  get deliveryRate() { return this.stats.deliveryRate; }
  get openRate() { return this.stats.openRate; }
  get clickRate() { return this.stats.clickRate; }
  get subscriptionChangeRate() { return this.stats.subscriptionChangeRate; }
  get failedRate() { return this.stats.failedRate; }
  get bounceRate() { return this.stats.bounceRate; }
}