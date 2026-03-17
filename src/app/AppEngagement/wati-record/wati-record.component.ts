import { Component, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Firestore, collection, query, where, orderBy, limit, getDocs, Timestamp, getDoc, doc } from '@angular/fire/firestore';
import { Observable, map, startWith } from 'rxjs';
import { AuthguardService } from '../../authguard.service';

@Component({
  selector: 'app-wati-record',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatIconModule,
    MatAutocompleteModule
  ],
  templateUrl: './wati-record.component.html',
  styleUrl: './wati-record.component.css'
})
export class WatiRecordComponent implements OnInit {
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  // Form for filters
  filterForm!: FormGroup;
  
  // Table configuration
  displayedColumns: string[] = ['date', 'broadcastname', 'body', 'sentInfo', 'pendingInfo', 'failedInfo', 'receivedRate'];
  dataSource = new MatTableDataSource<any>([]);
  
  // Signals for reactive state management
  records = signal<any[]>([]);
  profiles = signal<any[]>([]);
  loading = signal<boolean>(false);
  loadingProfiles = signal<boolean>(false);

  mapProfile:any = {};
  endpoint:string = '';
  
  // Popup state
  showParticipantsPopup = signal<boolean>(false);
  selectedRecord = signal<any>(null);
  participantSearchText = '';
  filteredParticipants: any[] = [];
  allParticipants: any[] = [];
  
  // Autocomplete
  filteredProfileOptions!: Observable<any[]>;

  // Statistics computed values
  totalNotifications = computed(() => this.records().length);

  newlyCreatedToday = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.records().filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= today;
    }).length;
  });

  sentRate = computed(() => {
    const records = this.records();
    if (records.length === 0) return 100;
    
    const totalSent = records.reduce((sum, record) => sum + (record.sent?.length || 0), 0);
    const totalNumbers = records.reduce((sum, record) => sum + (record.numbers?.length || 0), 0);
    
    return totalNumbers > 0 ? (totalSent / totalNumbers) * 100 : 100;
  });

  sentRateChange = computed(() => {
    return 0; // Placeholder
  });

  failureCount = computed(() => {
    return this.records().reduce((sum, record) => sum + (record.failed?.length || 0), 0);
  });

  newFailures = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.records().filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= today;
    }).reduce((sum, record) => sum + (record.failed?.length || 0), 0);
  });

  constructor(private authguard: AuthguardService){
    

  }

  ngOnInit() {
    this.authguard.getProfileMap().then((data) => {
      this.mapProfile = data.docdata;
    });
    this.initializeForm();
    this.setupAutocomplete();
    this.setDefaultDateRange();
    this.fetchProfiles();
    this.fetchNotificationRecord();
  }

  initializeForm() {
    this.filterForm = this.fb.group({
      startDate: [null],
      endDate: [null],
      searchText: [''],
      profileFilter: [''],
      searchByPerson: ['']
    });

    // Subscribe to form changes for filtering
    this.filterForm.valueChanges.subscribe(() => {
      this.onFilterChange();
    });
  }

  setupAutocomplete() {
    this.filteredProfileOptions = this.filterForm.get('profileFilter')!.valueChanges.pipe(
      startWith(''),
      map(value => {
        const filterValue = typeof value === 'string' ? value : value?.name || '';
        return this.filterProfiles(filterValue);
      })
    );
  }

  private filterProfiles(value: string): any[] {
    if (!value || typeof value !== 'string') {
      return this.profiles();
    }
    
    const filterValue = value.toLowerCase();
    return this.profiles().filter(profile => 
      profile.name.toLowerCase().includes(filterValue) ||
      profile.email?.toLowerCase().includes(filterValue)
    );
  }

  displayProfile(profile: any): string {
    return profile ? profile.name : '';
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    
    // Custom filter predicate
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const filterObj = JSON.parse(filter);
      
      // Text search
      if (filterObj.searchText) {
        const searchTerm = filterObj.searchText.toLowerCase();
        const matchesText = data.body?.toLowerCase().includes(searchTerm) ||
                           data.broadcastname?.toLowerCase().includes(searchTerm) ||
                           data.createdby?.toLowerCase().includes(searchTerm);
        if (!matchesText) return false;
      }

      // Profile filter - check if autocomplete profile is selected
      if (filterObj.profileFilter && typeof filterObj.profileFilter === 'object') {
        const selectedProfileId = filterObj.profileFilter.id;
        const profileIds = data.profileid || [];
        if (!profileIds.includes(selectedProfileId)) {
          return false;
        }
      }

      // Person search
      if (filterObj.searchByPerson) {
        const personTerm = filterObj.searchByPerson.toLowerCase();
        if (!this.mapProfile[data.createdby]['name']?.toLowerCase().includes(personTerm)) {
          return false;
        }
      }

      // Date filters
      if (filterObj.startDate) {
        const startDate = new Date(filterObj.startDate);
        const recordDate = new Date(data.date);
        if (recordDate < startDate) return false;
      }

      if (filterObj.endDate) {
        const endDate = new Date(filterObj.endDate);
        endDate.setHours(23, 59, 59, 999);
        const recordDate = new Date(data.date);
        if (recordDate > endDate) return false;
      }

      return true;
    };
  }

  private setDefaultDateRange() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // Last 7 days

    this.filterForm.patchValue({
      startDate: startDate,
      endDate: endDate
    });
  }

  async fetchProfiles() {
    this.loadingProfiles.set(true);
    try {
      const profileCollection = collection(this.firestore, 'profile_data');
      const profileQuery = query(profileCollection, orderBy('name', 'asc'));
      const querySnapshot = await getDocs(profileQuery);
      const fetchedProfiles: any[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedProfiles.push({
          id: doc.id,
          ...data
        });
      });

      this.profiles.set(fetchedProfiles);
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      this.loadingProfiles.set(false);
    }
  }

  async fetchNotificationRecord() {
    this.loading.set(true);
    try {
      const watiArchiveCollection = collection(this.firestore, 'wati archive');
      let Query;

      // Add date filtering to the query if dates are provided
      if (this.filterForm.get('startDate')?.value && this.filterForm.get('endDate')?.value) {
        const startTimestamp = Timestamp.fromDate(this.filterForm.get('startDate')?.value);
        const endDate = new Date(this.filterForm.get('endDate')?.value);
        endDate.setHours(23, 59, 59, 999);
        const endTimestamp = Timestamp.fromDate(endDate);
        
        Query = query(watiArchiveCollection, 
          where('date', '>=', startTimestamp.toDate().toISOString()),
          where('date', '<=', endTimestamp.toDate().toISOString())
        );
      }

      Query = query(watiArchiveCollection, orderBy('date', 'desc'));

      const querySnapshot = await getDocs(Query);
      const fetchedRecords: any[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedRecords.push(data);
      });

      this.records.set(fetchedRecords);
      this.dataSource.data = fetchedRecords;
      this.applyFilters();
    } catch (error) {
      console.error('Error fetching notification records:', error);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilters() {
    const filterValue = JSON.stringify(this.filterForm.value);
    this.dataSource.filter = filterValue;
  }

  onFilterChange() {
    this.applyFilters();
  }

  clearFilters() {
    this.filterForm.patchValue({
      searchText: '',
      profileFilter: '',
      searchByPerson: ''
    });
    this.applyFilters();
  }

  openParticipantsPopup(record: any) {
    this.selectedRecord.set(record);
    this.initializeParticipants(record);
    this.showParticipantsPopup.set(true);
  }

  closeParticipantsPopup() {
    this.showParticipantsPopup.set(false);
    this.selectedRecord.set(null);
    this.participantSearchText = '';
    this.filteredParticipants = [];
    this.allParticipants = [];
  }

  initializeParticipants(record: any) {
    const numbers = record.numbers || [];
    const numberMap = record.numbermap || {};

    this.allParticipants = numbers.map((phone: string) => ({
      phone,
      name: numberMap[phone] || 'Unknown'
    }));

    this.filteredParticipants = [...this.allParticipants];
  }

  filterParticipants() {
    if (!this.participantSearchText.trim()) {
      this.filteredParticipants = [...this.allParticipants];
      return;
    }

    const searchTerm = this.participantSearchText.toLowerCase();
    this.filteredParticipants = this.allParticipants.filter(participant =>
      participant.name.toLowerCase().includes(searchTerm) ||
      participant.phone.includes(searchTerm)
    );
  }

  getParticipantStatus(phone: string): string {
    const record = this.selectedRecord();
    if (!record) return 'pending';
    
    if (record.sent?.includes(phone.toString())) return 'sent';
    if (record.failed?.includes(phone.toString())) return 'failed';
    return 'pending';
  }

  getProfileName(profileIds: string[]): string {
    if (!profileIds || profileIds.length === 0) return 'N/A';
    const profile = this.profiles().find(p => profileIds.includes(p.id));
    return profile?.name || 'Unknown Profile';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  truncateMessage(message: string): string {
    if (!message) return 'N/A';
    return message.length > 50 ? message.substring(0, 50) + '...' : message;
  }

  getReceivedRate(record: any): number {
    const sent = record.sent?.length || 0;
    const total = record.numbers?.length || 0;
    return total > 0 ? (sent / total) * 100 : 0;
  }

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

  openWatiInbox(selected){
    console.log(selected);
    let url = `https://live-${selected['serverid']}.wati.io/17187/teamInbox/`;
    window.open(url + '/teamInbox/', '_blank')
  }

  openBroadcast(selected){
    console.log(selected);
    let url = `https://live-${selected['serverid']}.wati.io/17187/history/`;
    window.open(url, '_blank')
  }
}