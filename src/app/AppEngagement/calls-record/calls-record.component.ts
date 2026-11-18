import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Firestore, collection, query, where, orderBy, onSnapshot, Unsubscribe, getDocs } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { AtcAudioComponent } from '../../ATC/atc-audio/atc-audio.component';


@Component({
  selector: 'app-calls-record',
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
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCardModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    MatBadgeModule,
    MatTooltipModule,
    NgxMatSelectSearchModule,
    AtcAudioComponent
  ],
  templateUrl: './calls-record.component.html',
  styleUrl: './calls-record.component.css'
})
export class CallsRecordComponent implements OnInit, OnDestroy {
  displayedColumns: string[] = ['index', 'calledby', 'calledto', 'callstatus', 'duration', 'recording', 'status', 'time'];
  
  allCallsData = [];
  filteredData = [];
  paginatedData = [];
  newRecordIds: Set<string> = new Set();
  
  profiles = [];
  filteredProfiles = [];
  profileMap = {};
  profileNumberMap = {};
  
  filterForm: FormGroup;
  profileSearchCtrl
  isLoading = false;
  /** True while the calls listener is attached and has delivered its first snapshot. */
  isRealTimeActive = false;
  /** The date range the listener is actually serving — dates in the form only apply on Apply. */
  private appliedRange: { start: Date; end: Date } | null = null;
  
  // Pagination
  pageSize = 10;
  pageIndex = 0;
  
  // Sorting
  sortDirection: 'asc' | 'desc' = 'desc';
  sortColumn = 'time';

  // Real-time subscription
  private unsubscribe$ = new Subject<void>();
  private realtimeUnsubscribe: Unsubscribe | null = null;

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore
  ) {
    this.profileSearchCtrl = this.fb.control('');
    this.filterForm = this.fb.group({
      startDate: [this.getDateDaysAgo(7)],
      endDate: [new Date()],
      profile: [''],
      callStatus: [''],
      searchText: ['']
    });

    // Profile / status / search filter instantly in the browser. Dates are NOT watched:
    // they only take effect on Apply (or a quick-date button), which re-queries Firestore.
    for (const name of ['profile', 'callStatus', 'searchText']) {
      this.filterForm.get(name)!.valueChanges.pipe(
        takeUntil(this.unsubscribe$)
      ).subscribe(() => this.applyFilters());
    }

    // Watch for profile search changes
    this.profileSearchCtrl.valueChanges.pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(() => {
      this.filterProfiles();
    });
  }

  ngOnInit() {
    this.loadProfiles().then(() => this.subscribeToCalls());
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.stopRealTimeUpdates();
  }

  private getDateDaysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  async loadProfiles() {
    try {
      const profilesQuery = query(collection(this.firestore, 'profile_data'));
      const profileSnapshot = await getDocs(profilesQuery);
      
      this.profiles = [];
      this.profileMap = {};
      this.profileNumberMap = {};
      
      profileSnapshot.docs.forEach((doc: any) => {
        const profileData = doc.data();
        if (profileData.myoperatorid) {
          // only these can be picked in the Profile filter (its value is the MyOperator id)
          this.profiles.push(profileData);
          this.profileMap[profileData.myoperatorid] = profileData;
        }
        if (profileData.number) {
          this.profileNumberMap[profileData.number] = profileData;
        }
      });
      
      this.filteredProfiles = [...this.profiles];
      console.log('Loaded profiles:', this.profiles.length);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  }

  filterProfiles() {
    const searchValue = this.profileSearchCtrl.value?.toLowerCase() || '';
    if (!searchValue) {
      this.filteredProfiles = [...this.profiles];
      return;
    }

    // profile_data docs do not all carry name / number / myoperatorid.
    this.filteredProfiles = this.profiles.filter(profile =>
      [profile.name, profile.number, profile.myoperatorid]
        .some((v) => String(v ?? '').toLowerCase().includes(searchValue))
    );
  }

  private rangeFromForm(): { start: Date; end: Date } {
    const start = this.filterForm.get('startDate')?.value || this.getDateDaysAgo(7);
    const endDate = this.filterForm.get('endDate')?.value || new Date();
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  /**
   * ONE listener per applied date range — it is both the load and the live feed.
   *
   * Previously the tab ran a getDocs AND an onSnapshot over the same range (every call read
   * twice on open, with a race between them), and "Start Live" attached a fresh listener
   * that re-read the whole range each time. Now a listener is attached on open, replaced only
   * when the range changes (Apply / quick dates / Refresh), and detached on leave.
   */
  private subscribeToCalls() {
    this.stopRealTimeUpdates();
    const range = this.rangeFromForm();
    this.appliedRange = range;
    this.isLoading = true;
    let first = true;

    const q = query(
      collection(this.firestore, 'myoperator calls'),
      where("time", ">=", range.start),
      where("time", "<=", range.end),
      orderBy("time", "desc")
    );

    this.realtimeUnsubscribe = onSnapshot(q, (snapshot) => {
      // Only calls that arrive AFTER the first snapshot are "new"; the first one is the load.
      if (!first) {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const id = change.doc.data()['docid'];
          this.newRecordIds.add(id);
          setTimeout(() => this.newRecordIds.delete(id), 5000);
        });
      }
      this.allCallsData = snapshot.docs.map((d) => d.data());
      // A live update keeps the page you are on; only the first load starts at page 1.
      this.applyFilters(first);
      if (first) {
        first = false;
        this.isLoading = false;
        this.isRealTimeActive = true;
      }
    }, (error) => {
      console.error("Error listening to calls:", error);
      this.isLoading = false;
      this.isRealTimeActive = false;
    });
  }

  stopRealTimeUpdates() {
    if (this.realtimeUnsubscribe) {
      this.realtimeUnsubscribe();
      this.realtimeUnsubscribe = null;
    }
    this.isRealTimeActive = false;
  }

  isNewRecord(row): boolean {
    return this.newRecordIds.has(row.docid);
  }

  setQuickDate(days: number) {
    const endDate = new Date();
    const startDate = this.getDateDaysAgo(days);
    
    this.filterForm.patchValue({
      startDate: startDate,
      endDate: endDate
    });
    
    this.subscribeToCalls();
  }

  isQuickDateActive(days: number): boolean {
    const startDate = this.filterForm.get('startDate')?.value;
    const expectedStart = this.getDateDaysAgo(days);
    
    if (!startDate) return false;
    
    return startDate.getTime() === expectedStart.getTime();
  }

  /** The Apply button: re-query if the dates changed, then filter. */
  apply() {
    const r = this.rangeFromForm();
    const a = this.appliedRange;
    if (!a || a.start.getTime() !== r.start.getTime() || a.end.getTime() !== r.end.getTime()) {
      this.subscribeToCalls();     // the first snapshot runs applyFilters
    } else {
      this.applyFilters();
    }
  }

  /** Last 10 digits — MyOperator sends bare numbers, profiles may carry +91 / spaces. */
  private digits(v: any): string {
    return String(v ?? '').replace(/\D/g, '').slice(-10);
  }

  applyFilters(resetPage = true) {
    // getRawValue(), not .value: this runs from a CHILD control's valueChanges, which fires
    // before the parent group's .value is recomputed — .value would still hold the old text.
    const filters = this.filterForm.getRawValue();
    const profile = filters.profile ? this.profileMap[filters.profile] : null;
    const profileDigits = this.digits(profile?.number);
    const searchLower = (filters.searchText || '').trim().toLowerCase();
    
    this.filteredData = this.allCallsData.filter(call => {
      // Profile filter — the profile as caller (MyOperator id) OR as the number called.
      if (filters.profile) {
        const asCaller = call.calledby === filters.profile;
        const asCallee = !!profileDigits && this.digits(call.calledto) === profileDigits;
        if (!asCaller && !asCallee) return false;
      }
      
      // Call status filter
      if (filters.callStatus && (call.callstatus || '').toLowerCase() !== filters.callStatus.toLowerCase()) {
        return false;
      }
      
      // Search text filter — every field may be null (the webhook writes null when
      // MyOperator omits it), so nothing here may assume a string.
      if (searchLower) {
        const haystack = [
          call.calledby,
          call.calledto,
          this.getProfileName(call.calledby),
          this.profileNumberMap[call.calledto]?.name,
        ].map((v) => String(v ?? '').toLowerCase());
        if (!haystack.some((v) => v.includes(searchLower))) return false;
      }
      
      return true;
    });
    
    this.sortData({ active: this.sortColumn, direction: this.sortDirection });
    if (resetPage) {
      this.pageIndex = 0;
    } else {
      // keep the current page, unless the list shrank under it
      const lastPage = Math.max(0, Math.ceil(this.filteredData.length / this.pageSize) - 1);
      this.pageIndex = Math.min(this.pageIndex, lastPage);
    }
    this.updatePaginatedData();
  }

  clearFilters() {
    this.filterForm.patchValue({
      profile: '',
      callStatus: '',
      searchText: ''
    });
    this.profileSearchCtrl.setValue('');
  }

  /** Re-attach the listener for the form's dates (re-reads the range). */
  refreshData() {
    this.subscribeToCalls();
  }

  sortData(sort: Sort) {
    if (!sort.active || sort.direction === '') {
      return;
    }

    this.sortColumn = sort.active;
    this.sortDirection = sort.direction as 'asc' | 'desc';

    this.filteredData.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      
      switch (sort.active) {
        case 'calledby':
          return this.compare(this.getProfileName(a.calledby), this.getProfileName(b.calledby), isAsc);
        case 'calledto':
          return this.compare(this.getProfileName(a.calledto), this.getProfileName(b.calledto), isAsc);
        case 'callstatus':
          return this.compare(a.callstatus, b.callstatus, isAsc);
        case 'duration':
          return this.compare(a.duration, b.duration, isAsc);
        case 'status':
          return this.compare(a.status, b.status, isAsc);
        case 'time':
          return this.compare(a.time?.toDate?.() || a.time, b.time?.toDate?.() || b.time, isAsc);
        default:
          return 0;
      }
    });
    
    this.updatePaginatedData();
  }

  private compare(a: any, b: any, isAsc: boolean) {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  onPageChange(event: PageEvent) {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.updatePaginatedData();
  }

  private updatePaginatedData() {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedData = this.filteredData.slice(startIndex, endIndex);
  }

  getProfileName(profileId: string): string {
    const profile = profileId ? this.profileMap[profileId] : null;
    return profile?.name || profileId || '';
  }

  getStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'received':
        return 'call_received';
      case 'missed':
        return 'call_missed';
      default:
        return 'call';
    }
  }

  getCallStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
      case 'answer':
        return 'call_received';
      case 'busy':
        return 'phone_busy';
      case 'cancel':
        return 'call_end';
      default:
        return 'call';
    }
  }

  formatDateTime(timestamp: any, type: 'time' | 'date'): string {
    let date: Date;
    
    if (timestamp?.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    
    if (type === 'time') {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
  }
}