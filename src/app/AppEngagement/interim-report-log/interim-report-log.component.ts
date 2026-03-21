import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { arrayUnion, collection, collectionData, doc, Firestore, getDocs, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, updateDoc, where } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
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
  styleUrl: './interim-report-log.component.css'
})
export class InterimReportLogComponent implements OnInit, OnDestroy {

  // ==========================================
  // INTERIM LOG
  // ==========================================
  @ViewChild('logPaginator') logPaginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  logDisplayedColumns: string[] = ['name', 'reportlist', 'lastupdate', 'status', 'duedate', 'remainderdate', 'lockdate'];
  logDataSource = new MatTableDataSource();
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

  // ==========================================
  // ASK A&H / LOVE LETTER
  // ==========================================
  // Filters
  startDate = new FormControl<Date | null>(null);
  endDate = new FormControl<Date | null>(null);
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
  selectedRecords: any[] = [];

  // Overlay
  showOverlay = false;
  overlayMode: 'individual' | 'merged' = 'merged';
  overlayTitle = '';
  overlayRecords: any[] = [];
  overlayLoading = false;

  loggedInProfileId: string = '';

  // Field mapping
  fieldMap: { primary: string; secondary?: string; primaryLabel: string; secondaryLabel?: string }[] = [
    { primary: 'askah', secondary: 'installationaskah', primaryLabel: 'Ask A&H', secondaryLabel: 'Installation Ask A&H' },
    { primary: 'loveletter', primaryLabel: 'Love Letter' },
  ];

  private destroy$ = new Subscription();

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private router: Router
  ) {}

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
    this.destroy$.unsubscribe();
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
    if (this.logLoaded) return;
    this.logLoaded = true;

    const interimCollection = collection(this.firestore, 'interimreport log');
    const q = query(interimCollection, orderBy('lastupdate', 'desc'));
    this.interimlogSubscription = collectionData(q).subscribe((log) => {
      const logList = [];
      log.forEach((data) => {
        data['name'] = this.mapProfiles[data['profileid']]?.['name'] || '-';
        data['reportlist'] = (data['reports'] ?? []).map((e) => '- ' + this.mapReport[e]).join('\n');
        data['lastupdate'] = data['lastupdate']?.toDate() ?? null;
        data['duedate'] = data['duedate']?.toDate() ?? null;
        data['lockdate'] = data['lockdate']?.toDate() ?? null;
        data['remainderdate'] = data['remainderdate']?.toDate() ?? null;
        data['status'] = data['status']?.toString();
        logList.push(data);
      });
      this.logDataSource.data = logList;
      setTimeout(() => {
        this.logDataSource.sort = this.sort;
        this.logDataSource.paginator = this.logPaginator;
      });
    });
  }

  filterLogData(value: string) {
    this.logDataSource.filter = value;
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

  fetchAskAH() { this.resetPagination(); this.fetchRecords(); }
  fetchLoveLetter() { this.resetPagination(); this.fetchRecords(); }

  // ==========================================
  // TAB SWITCH
  // ==========================================
  onTabChange(event: MatTabChangeEvent) {
    this.activeTab = event.index;
    this.selectedRecords = [];

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
      row.likedetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, {
        liked: true,
        likedetails: {
          user: this.loggedInProfileId,
          time: serverTimestamp()
        }
      });
    } else {
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
      row.tagdetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, {
        tagged: true,
        tagdetails: {
          user: this.loggedInProfileId,
          time: serverTimestamp()
        }
      });
    } else {
      row.tagdetails = null;
      updateDoc(docRef, {
        tagged: false,
        tagdetails: null
      });
    }
  }

  toggleOpportunity(row: any) {
    const newValue = !row.opportunity;
    row.opportunity = newValue;

    const collectionName = this.collectionMap[this.activeTab];
    const docRef = doc(this.firestore, collectionName, row.id);

    if (newValue) {
      row.opportunitydetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, {
        opportunity: true,
        opportunitydetails: {
          user: this.loggedInProfileId,
          time: serverTimestamp()
        }
      });
    } else {
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
}