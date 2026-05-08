import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule , DatePipe} from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { arrayUnion, collection, collectionData, doc, Firestore, getDocs, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, updateDoc, where, setDoc } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTabChangeEvent, MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { SelectionModel } from '@angular/cdk/collections';
import { MatDialog } from '@angular/material/dialog';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment.development';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import * as XLSX from 'xlsx';


@Component({
  selector: 'app-interim-report-log',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './interim-report-log.component.html',
  styleUrl: './interim-report-log.component.css',
  providers : [DatePipe]
})
export class InterimReportLogComponent implements OnInit, OnDestroy {

  // ==========================================
  // INTERIM LOG
  // ==========================================
  @ViewChild('logPaginator') logPaginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  selection = new SelectionModel<any>(true, []);
  private destroy$ = new Subject<void>()
  logDisplayedColumns: string[] = ['select', 'name', 'reportlist', 'lastupdate', 'status', 'duedate', 'remainderdate', 'lockdate', 'createdon'];
  logDataSource = new MatTableDataSource();
  logData = [];
  interimlogSubscription: Subscription;
  mapReport = {
    'crossover': 'AEL Crossover Metric',
    'evolutionprogress': 'Evolution Progress',
    'loveletter': 'A&H Love Letter',
    'askah': 'Ask A&H'
  };
  logLoaded = false;
  showNotesOverlay = false;
  notesRecord: any = null;
  notesText = '';

  totalLetters = 0;
  totalHappy = 0;
  totalNeedsAttention = 0;
  totalOpportunity=0;
  totalCritical = 0;

  totalReports = 0;
  totalReportsCompleted = 0;
  totalReportsOngoing = 0;
  totalReportsNotStarted = 0;

  allLetters: any[] = [];       
  filteredLetters: any[] = []; 

  // ==========================================
  // ASK A&H / LOVE LETTER
  // ==========================================
  // Filters
  startDate = new FormControl<Date | null>(null);
  endDate = new FormControl<Date | null>(null);
  logStartDate = new FormControl<Date | null>(null);
  logEndDate = new FormControl<Date | null>(null);
  participantFilterCtrl = new FormControl('');
  participantOptions: any[] = [];
  filteredParticipants: any[] = [];
  selectedParticipant: any = null;

  // Pagination
  pageSize = 100;
  currentPage = 0;
  lastDoc: any = null;
  pageCache: Map<number, any[]> = new Map();
  totalRecords = 0;

  // Tab
  activeTab = 0;
  collectionMap: string[] = ['ask AH', 'love letter'];
  dateFieldMap: string[] = ['created', 'created'];

  // Data
  records: any[] = [];
  loading = false;
  mapProfiles: any = {};
  mapParticipantMetaData: { [key: string]: any } = {};
  selectedRecords: any[] = [];

  // Overlay
  showOverlay = false;
  overlayMode: 'individual' | 'merged' = 'merged';
  selectedFilterType : 'total' | 'completed' | 'ongoing' | 'notstarted' = 'total';
  selectedFilterTypes: string[] = [];
  overlayTitle = '';
  overlayRecords: any[] = [];
  overlayLoading = false;

  loggedInProfileId: string = '';

  // Field mapping
  fieldMap: { primary: string; secondary?: string; primaryLabel: string; secondaryLabel?: string }[] = [
    { primary: 'askah', secondary: 'installationaskah', primaryLabel: 'Ask A&H', secondaryLabel: 'Installation Ask A&H' },
    { primary: 'loveletter', primaryLabel: 'Love Letter' },
  ];

  // private destroy$ = new Subscription();

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private router: Router,
    private dialog: MatDialog,
    private storage: Storage,
    private _snackBar: MatSnackBar,
    private http: HttpClient,
    private datePipe : DatePipe
  ) {
    const logStartDate = new Date();
    const logEndDate = new Date();

    logStartDate.setDate(1);
    logEndDate.setMonth(logEndDate.getMonth() + 1);
    logEndDate.setDate(0);

    this.logStartDate.setValue(logStartDate);
    this.logEndDate.setValue(logEndDate);
  }

  ngOnInit() {
    this.guard.getRoles().then(async (roles) => {
      //   const superrole = roles['admin'] || roles['ah'] || roles['developer'];
      //   if (superrole) {
      this.loggedInProfileId = roles['profile_ref'].id ?? null
      this.fetchParticipants();
      this.fetchAskAH();

      this.participantFilterCtrl.valueChanges.subscribe((search) => {
        this.filterParticipants(search || '');
      });
      //   } else {
      //     alert('No Access');
      //     this.router.navigateByUrl('/');
      //   }
    });
  }

  ngOnDestroy() {
    this.interimlogSubscription?.unsubscribe();
    if (this.destroy$) {
      this.destroy$.next();
      this.destroy$.complete();
    }
  }

  // ==========================================
  // PARTICIPANTS
  // ==========================================
  fetchParticipants() {
    getDocs(collection(this.firestore, 'profile_data')).then((snap) => {
      this.participantOptions = snap.docs.map((doc) => ({
        id: doc.id,
        name: doc.data()['name']
      }));
      this.filteredParticipants = [...this.participantOptions];
      this.mapProfiles = {};
      snap.docs.forEach((doc) => {
        this.mapProfiles[doc.id] = doc.data();
      });
    });

    getDocs(collection(this.firestore, 'participant metadata')).then((snap) => {
      this.mapParticipantMetaData = {};
      snap.docs.forEach((doc) => {
        this.mapParticipantMetaData[doc.id] = doc.data();
      });
    });
  }

  filterParticipants(search: string) {
    if (!search) {
      this.filteredParticipants = [...this.participantOptions];
      return;
    }
    const lowerSearch = search.toLowerCase();
    this.filteredParticipants = this.participantOptions.filter(
      (p) => p.name?.toLowerCase().includes(lowerSearch)
    );
  }

  // ==========================================
  // INTERIM LOG
  // ==========================================
  fetchInterimLog() {
    const interimCollection = collection(this.firestore, 'interimreport log');
    const constraints: any[] = [orderBy('lastupdate', 'desc')];

    if (this.logStartDate.value && this.logEndDate.value) {
      const startDate = this.logStartDate.value;
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(this.logEndDate.value);
      endDate.setHours(23, 59, 59, 999);
      console.log(startDate, endDate)
      constraints.push(where('createdon', '>=', Timestamp.fromDate(startDate)));
      constraints.push(where('createdon', '<=', Timestamp.fromDate(endDate)));
    }

    const q = query(interimCollection, ...constraints);
    if (this.interimlogSubscription) {
      this.interimlogSubscription.unsubscribe();
    }
    this.interimlogSubscription = collectionData(q).subscribe((log) => {
      const logList = [];
      let totalReportsCompleted = 0;
      let totalReportsOngoing = 0;
      let totalReportsNotStarted = 0;

      log.forEach((data) => {
        data['name'] = this.mapProfiles[data['profileid']]?.['name'] || '-';
        data['reportlist'] = (data['reports'] ?? []).map((e) => '- ' + this.mapReport[e]).join('\n');
        data['lastupdate'] = data['lastupdate']?.toDate() ?? null;
        data['duedate'] = data['duedate']?.toDate() ?? null;
        data['lockdate'] = data['lockdate']?.toDate() ?? null;
        data['remainderdate'] = data['remainderdate']?.toDate() ?? null;
        data['createdon'] = data['createdon']?.toDate() ?? null;
        data['status'] = data['status']?.toString();
        logList.push(data);
        if (data['status'] === 'completed') totalReportsCompleted++;
        if ([null, undefined, ''].includes(data['status']) && data['reports']?.length > 0) totalReportsOngoing++;
        if (!Array.isArray(data['reports']) || data['reports']?.length === 0) totalReportsNotStarted++
        console.log(data['reports'])
      });

      this.totalReports = logList.length;
      this.totalReportsCompleted = totalReportsCompleted;
      this.totalReportsOngoing = totalReportsOngoing;
      this.totalReportsNotStarted = totalReportsNotStarted;

      this.logDataSource.data = logList.filter((data)=>this.matchLogDataFilter(data));
      this.logData = logList;
      setTimeout(() => {
        this.logDataSource.sort = this.sort;
        this.logDataSource.paginator = this.logPaginator;
      });
    });
  }

  clearInterimReportFilter() {
    const logStartDate = new Date();
    const logEndDate = new Date();

    logStartDate.setDate(1);
    logEndDate.setMonth(logEndDate.getMonth() + 1);
    logEndDate.setDate(0);

    this.logStartDate.setValue(logStartDate);
    this.logEndDate.setValue(logEndDate);
    this.fetchInterimLog()
  }

  filterLogData(value: string) { 
    this.logDataSource.filter = value;
  }

  filterLogDataWithBoxClick(type : 'total' | 'completed' | 'ongoing' | 'notstarted'){
    if (this.selectedFilterType === type) {
      this.selectedFilterType = 'total';
    } else {
      this.selectedFilterType = type;
    }
    this.logDataSource.data = this.logData.filter((data)=>this.matchLogDataFilter(data));
  }

  matchLogDataFilter(data : any){
    const type = this.selectedFilterType;
    if ((type === 'completed' && data['status'] !== 'completed') ||
    (type === 'ongoing' && !([null, undefined, ''].includes(data['status']) && data['reports']?.length > 0)) || 
    (type === 'notstarted' && !(!Array.isArray(data['reports']) || data['reports']?.length === 0))) {
      return false
    }
    return true;
  }

  // ==========================================
  // ASK A&H / LOVE LETTER QUERIES
  // ==========================================
  private buildQuery(collectionName: string, dateField: string, pageLimit: number, startAfterDoc?: any) {
    const ref = collection(this.firestore, collectionName);
    const constraints: any[] = [orderBy(dateField, 'desc')];

    if (this.startDate.value) {
      constraints.push(where(dateField, '>=', Timestamp.fromDate(this.startDate.value)));
    }
    if (this.endDate.value) {
      const endOfDay = new Date(this.endDate.value);
      endOfDay.setHours(23, 59, 59, 999);
      constraints.push(where(dateField, '<=', Timestamp.fromDate(endOfDay)));
    }

    if (this.selectedParticipant) {
      constraints.push(where('profileid', '==', this.selectedParticipant.id));
    }

    if (startAfterDoc) {
      constraints.push(startAfter(startAfterDoc));
    }

    constraints.push(limit(pageLimit));
    return query(ref, ...constraints);
  }

  private fetchRecords(startAfterDoc?: any) {
    this.loading = true;
    const collectionName = this.collectionMap[this.activeTab];
    const dateField = this.dateFieldMap[this.activeTab];
    const q = this.buildQuery(collectionName, dateField, this.pageSize, startAfterDoc);

    getDocs(q).then((snap) => {
      this.records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      this.allLetters = [...this.records];
      this.totalLetters = this.allLetters.length;
      this.totalHappy = this.allLetters.filter(item => item.liked === true).length;
      this.totalNeedsAttention = this.allLetters.filter(item => item.tagged === true).length;
      this.totalOpportunity = this.allLetters.filter(item => item.opportunity === true).length;
      this.totalCritical = this.allLetters.filter(item => item.critical === true).length;

      this.lastDoc = snap.docs[snap.docs.length - 1] || null;
      this.pageCache.set(this.currentPage, snap.docs as any);

      if (this.currentPage === 0) {
        this.totalRecords = snap.docs.length < this.pageSize ? snap.docs.length : snap.docs.length * 10;
      } else if (snap.docs.length < this.pageSize) {
        this.totalRecords = (this.currentPage * this.pageSize) + snap.docs.length;
      }

      this.loading = false;
    }).catch((err) => {
      console.error('Error fetching records:', err);
      this.loading = false;
    });
  }

    filterLetterDataWithBoxClick(
      type: 'totalletters' | 'happy' | 'attention' | 'opportunity' | 'critical'
    ) {
      if (type === 'totalletters') {
        this.selectedFilterTypes = [];
        this.records = [...this.allLetters];
        return;
      }

      const index = this.selectedFilterTypes.indexOf(type);
      if (index === -1) {
        this.selectedFilterTypes.push(type);
      } else {
        this.selectedFilterTypes.splice(index, 1);
      }

      if (this.selectedFilterTypes.length === 0) {
        this.records = [...this.allLetters];
        return;
      }

      const show = new Set<string>();

      this.records = this.allLetters.filter((item) => {
        const match =
          (this.selectedFilterTypes.includes('happy') && item.liked === true) ||
          (this.selectedFilterTypes.includes('attention') && item.tagged === true) ||
          (this.selectedFilterTypes.includes('opportunity') && item.opportunity === true) ||
          (this.selectedFilterTypes.includes('critical') && item.critical === true);

        if (!match) return false;

        const key = `${item.id}-${item.liked}-${item.tagged}-${item.opportunity}-${item.critical}`;
        if (show.has(key)) return false;

        show.add(key);
        return true;

      });
    }

  

  fetchAskAH() { this.resetPagination(); this.fetchRecords(); }
  fetchLoveLetter() { this.resetPagination(); this.fetchRecords(); }

  // ==========================================
  // TAB SWITCH
  // ==========================================
  onTabChange(event: MatTabChangeEvent) {
    this.activeTab = event.index;
    this.selectedRecords = [];
    this.selectedFilterTypes = [];

    switch (event.index) {
      case 0: this.fetchAskAH(); break;
      case 1: this.fetchLoveLetter(); break;
      case 2: this.fetchInterimLog(); break;
    }
  }

  // ==========================================
  // PAGINATION
  // ==========================================
  onPageChange(event: PageEvent) {
    if (event.pageSize !== this.pageSize) {
      this.pageSize = event.pageSize;
      this.resetPagination();
      this.fetchRecords();
      return;
    }

    if (event.pageIndex > this.currentPage) {
      this.currentPage = event.pageIndex;
      if (this.pageCache.has(this.currentPage)) {
        const cachedDocs = this.pageCache.get(this.currentPage)!;
        this.records = cachedDocs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      } else {
        this.fetchRecords(this.lastDoc);
      }
    } else if (event.pageIndex < this.currentPage) {
      this.currentPage = event.pageIndex;
      const cachedDocs = this.pageCache.get(this.currentPage)!;
      this.records = cachedDocs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      this.lastDoc = cachedDocs[cachedDocs.length - 1];
    }
  }

  // ==========================================
  // SELECTION
  // ==========================================
  isSelected(row: any): boolean {
    return this.selectedRecords.some((r) => r.id === row.id);
  }

  isAllSelected(): boolean {
    return this.records.length > 0 && this.selectedRecords.length === this.records.length;
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelectedLogs() {
    const numSelected = this.selection.selected.length;
    const numRows = this.logDataSource.data.length;
    return numSelected === numRows;
  }
  toggleRow(row: any, checked: boolean) {
    if (checked) {
      this.selectedRecords.push(row);
    } else {
      this.selectedRecords = this.selectedRecords.filter((r) => r.id !== row.id);
    }
  }

  toggleAll(checked: boolean) {
    this.selectedRecords = checked ? [...this.records] : [];
  }

  // ==========================================
  // OVERLAY - VIEW ROW
  // ==========================================
  viewRow(row: any) {
    const fields = this.fieldMap[this.activeTab];
    const tabNames = ['Ask A&H', 'Love Letter'];
    this.overlayTitle = tabNames[this.activeTab];
    this.overlayMode = 'individual';
    this.overlayRecords = [{
      name: this.mapProfiles[row.profileid]?.['name'] || '-',
      date: row.created?.toDate
        ? row.created.toDate().toLocaleDateString('en-IN', { dateStyle: 'medium' })
        : new Date(row.created).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
      content: row[fields.primary] || '-',
      contentLabel: fields.primaryLabel,
      content2: fields.secondary ? row[fields.secondary] || null : null,
      content2Label: fields.secondaryLabel || null,
    }];
    this.showOverlay = true;
  }

  // ==========================================
  // OVERLAY - VIEW MERGED
  // ==========================================
  viewMerged() {
    const tabNames = ['Ask A&H', 'Love Letter'];
    const fieldConfig = this.fieldMap[this.activeTab];
    this.overlayTitle = tabNames[this.activeTab] + ' (Merged)';
    this.overlayMode = 'merged';
    this.overlayRecords = this.selectedRecords.map((record) => ({
      name: this.mapProfiles[record.profileid]?.['name'] || '-',
      date: record.created?.toDate
        ? record.created.toDate().toLocaleDateString('en-IN', { dateStyle: 'medium' })
        : new Date(record.created).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
      content: record[fieldConfig.primary] || '-',
      contentLabel: fieldConfig.primaryLabel,
      content2: fieldConfig.secondary ? record[fieldConfig.secondary] || null : null,
      content2Label: fieldConfig.secondaryLabel || null,
    }));
    this.showOverlay = true;
  }

  closeOverlay() {
    this.showOverlay = false;
  }

  // ==========================================
  // FILTERS
  // ==========================================
  applyFilters() {
    this.selectedRecords = [];
    this.resetPagination();
    if (this.activeTab < 2) {
      this.fetchRecords();
    }
  }

  clearFilters() {
    this.startDate.reset();
    this.endDate.reset();
    this.selectedParticipant = null;
    this.resetPagination();
    if (this.activeTab < 2) {
      this.fetchRecords();
    }
  }
  
  private resetPagination() {
    this.currentPage = 0;
    this.lastDoc = null;
    this.pageCache.clear();
    this.totalRecords = 0;
  }
  
  toggleLike(row: any) {
    const newValue = !row.liked;
    row.liked = newValue;

    const collectionName = this.collectionMap[this.activeTab];
    const docRef = doc(this.firestore, collectionName, row.id);

    if (newValue) {
      this.totalHappy++;
      row.likedetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, {
        liked: true,
        likedetails: {
          user: this.loggedInProfileId,
          time: serverTimestamp()
        }
      });
    } else {
      this.totalHappy--;
      row.likedetails = null;
      updateDoc(docRef, {
        liked: false,
        likedetails: null
      });
    }
  }

  toggleFlag(row: any) {
    const newValue = !row.tagged;
    row.tagged = newValue;

    const collectionName = this.collectionMap[this.activeTab];
    const docRef = doc(this.firestore, collectionName, row.id);

    if (newValue) {
      this.totalNeedsAttention++;
      row.tagdetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, {
        tagged: true,
        tagdetails: {
          user: this.loggedInProfileId,
          time: serverTimestamp()
        }
      });
    } else {
      this.totalNeedsAttention--;
      row.tagdetails = null;
      updateDoc(docRef, {
        tagged: false,
        tagdetails: null
      });
    }
  }

  toggleResolved(row: any) {
    const newValue = !row.resolved;
    row.resolved = newValue;

    const collectionName = this.collectionMap[this.activeTab];
    const docRef = doc(this.firestore, collectionName, row.id);

    if (newValue) {
      row.resolveddetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, {
        resolved: true,
        resolveddetails: {
          user: this.loggedInProfileId,
          time: serverTimestamp()
        }
      });
    } else {
      row.resolveddetails = null;
      updateDoc(docRef, {
        resolved: false,
        resolveddetails: null
      });
    }
  }

  toggleCritical(row: any) {
    const newValue = !row.critical;
    row.critical = newValue;

    const collectionName = this.collectionMap[this.activeTab];
    const docRef = doc(this.firestore, collectionName, row.id);

    if (newValue) {
      this.totalCritical++;
      row.criticaldetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, {
        critical: true,
        criticaldetails: {
          user: this.loggedInProfileId,
          time: serverTimestamp()
        }
      });
    } else {
      this.totalCritical--;
      row.criticaldetails = null;
      updateDoc(docRef, {
        critical: false,
        criticaldetails: null
      });
    }
  }

  toggleOpportunity(row: any) {
    const newValue = !row.opportunity;
    row.opportunity = newValue;

    const collectionName = this.collectionMap[this.activeTab];
    const docRef = doc(this.firestore, collectionName, row.id);

    if (newValue) {
      this.totalOpportunity++;
      row.opportunitydetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, {
        opportunity: true,
        opportunitydetails: {
          user: this.loggedInProfileId,
          time: serverTimestamp()
        }
      });
    } else {
      this.totalOpportunity--;
      row.opportunitydetails = null;
      updateDoc(docRef, {
        opportunity: false,
        opportunitydetails: null
      });
    }
  }

  openNotes(row: any) {
    this.notesRecord = row;
    this.notesRecord.profileName = this.mapProfiles[row.profileid]?.['name'] || '-';
    this.notesText = '';
    this.showNotesOverlay = true;
  }

  closeNotes() {
    this.showNotesOverlay = false;
    this.notesRecord = null;
    this.notesText = '';
  }

  saveNotes() {
    if (this.notesRecord && this.notesText.trim()) {
      const newNote = {
        notes: this.notesText.trim(),
        user: this.loggedInProfileId,
        time: Timestamp.now()
      };

      // Update local array
      if (!this.notesRecord.notes) {
        this.notesRecord.notes = [];
      }
      this.notesRecord.notes.push(newNote);

      // Update Firestore
      const collectionName = this.collectionMap[this.activeTab];
      const docRef = doc(this.firestore, collectionName, this.notesRecord.id);
      updateDoc(docRef, {
        notes: arrayUnion({
          notes: this.notesText.trim(),
          user: this.loggedInProfileId,
          time: Timestamp.now()
        })
      });

      this.notesText = '';
    }
  }

  getReversedNotes(): any[] {
    if (!this.notesRecord?.notes) return [];
    return [...this.notesRecord.notes].reverse();
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {
    if (this.isAllSelectedLogs()) {
      this.selection.clear();
      return;
    }
    this.selection.select(...this.logDataSource.data);
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?: any): string {
    if (!row) {
      return `${this.isAllSelectedLogs() ? 'deselect' : 'select'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`;
  }

  sendNotificationinBreakthrough() {
    const selectedProfiles = this.selection.selected.map((p) => this.mapParticipantMetaData[p['profileid'] || '']);
    console.log(selectedProfiles)
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      data: selectedProfiles,
      width: "80vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        var userID = [];
        var profileID = [];
        console.log(selectedProfiles, "this.selection.selected");
        // var unsentProfiles = [];
        for (let i = 0; i < selectedProfiles.length; i++) {
          const selected = selectedProfiles[i];
          if (selected["firebaseuserref"] != null) {
            profileID.push(selected["profileid"])
          }
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
        this.guard.saveNotificationRecord({
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
  sendEmailToSelectedParicipant() {
    const selectedProfiles = this.selection.selected.map((p) => this.mapParticipantMetaData[p['profileid'] || '']);
    let dialogRef = this.dialog.open(EmailInputComponent, {
      data: selectedProfiles,
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
  openSnackBar(message: string, action: string) {
    this._snackBar.open(message, action);
  }

  sendWatiMessage() {
    const selectedProfiles = this.selection.selected.map((p) => this.mapParticipantMetaData[p['profileid'] || '']);

    let dialogRef = this.dialog.open(WatiInputComponent, {
      data: selectedProfiles,
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

  exportTable() {
    if (this.logDataSource.filteredData.length === 0) {
      alert('No Logs Found');
      return;
    }
    const exportData = this.logDataSource.filteredData.map((log) => ({
      'name': log["name"],
      'email' : this.mapParticipantMetaData[log['profileid'] || '']?.email ?? '' , 
      'reports done': log["reportlist"],
      'last update': this.datePipe.transform(log["lastupdate"], 'MMMM d, y, h:mm a'),
      'status': log["status"],
      'due date': this.datePipe.transform(log["duedate"]),
      'remainder date': this.datePipe.transform(log["remainderdate"]),
      'lock date': this.datePipe.transform(log["lockdate"]),
      'send date': this.datePipe.transform(log["createdon"], 'medium')
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');
    const fileName = `$interim_report_log${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

}