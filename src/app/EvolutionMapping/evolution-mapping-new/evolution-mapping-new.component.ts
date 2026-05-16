import { Component, OnInit, Injector, runInInjectionContext, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormBuilder, FormGroup, FormArray, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { collection, doc, Firestore, getDocs, getDoc, limit, orderBy, query, startAfter, where, addDoc, serverTimestamp, Timestamp,updateDoc,getCountFromServer } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { VideoPlayerComponent } from '../video-player.component';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-evolution-mapping-new',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    NgxMatSelectSearchModule,
    MatDatepickerModule,
    VideoPlayerComponent,
  ],
  templateUrl: './evolution-mapping-new.component.html',
  styleUrl: './evolution-mapping-new.component.css',
})
export class EvolutionMappingNewComponent implements OnInit, OnDestroy {
  
  // Participant table
  participantOptions: any[] = [];
  filteredParticipants: any[] = [];
  participantFilterCtrl = new FormControl('');
  selectedParticipants: any[] = [];
  mapProfiles: any = {};
  mapJourneys: any = {};
  mapEventCount: any = {};
  mapLastVideo: { [profileid: string]: { eventName: string; date: Date | null } } = {}; 
  mapVideoCount: { [profileid: string]: { [type: string]: number } } = {};
  // Pagination
  pageSize = 50;
  currentPage = 0;
  lastDoc: any = null;
  pageCache: Map<number, any[]> = new Map();
  totalRecords = 0;
  records: any[] = [];
  loading = false;
  initialLoading = true;
  displayedColumns: string[] = ['name', 'activejourney', 'eventsattended', 'videocount', 'lastvideo', 'actions'];
  loggedInProfileId: string = '';

  // VIEW LOG
  showLogOverlay = false;
  logLoading = false;
  logParticipantName = '';
  logEventCount = 0;
  currentLogProfileId = '';
  logEvents: {
    type: 'event' | 'video';
    eventName: string;
    date: Date | null;
    videoRecordedDate?: Date | null
    videoUrl?: string;
    videoTitle?: string;
    hasVideo?: boolean;
    eventId?: string;
    videoType?: string;
    docId?: string;
    linkedEventName?: string | null;
    remarks?: string | null;
    extraVideos?: { videoUrl: string; videoTitle: string; docId: string; videoType: string }[];
  }[] = [];
  dragCardIndex: number | null = null;
  dragOverIndex: number | null = null;
  logEventOrderMap: { [profileid: string]: string[] } = {};

  // IMAGE PREVIEW
  showImageOverlay = false;
  previewImageUrl = '';
  previewImageName = '';

  // ADD VIDEO
  showAddVideoOverlay = false;
  addVideoParticipantCtrl = new FormControl('');
  addVideoFilteredParticipants: any[] = [];
  addVideoSubmitted = false;
  addVideoForm!: FormGroup;
  private addVideoSearchSub: Subscription | null = null;
  showVideoPlayer = false;

  // NOTE OVERLAY
  showNoteOverlay = false;
  noteEventIndex: number | null = null;
  noteText = '';

  // SUBSCRIPTIONS
  private participantSearchSub: Subscription | null = null;
  private eventFilterSearchSub: Subscription | null = null;  
  private videoFilterSearchSub: Subscription | null = null;  

  //Edit
  showEditVideoOverlay = false;
  editVideoIndex: number | null = null;
  editVideoForm!: FormGroup;
  editVideoSaving = false;

  // Bulk import
  activeTab: 'manual' | 'bulk' = 'manual';
  bulkImportFile: File | null = null;
  bulkPreviewRows: {
    email: string;
    title: string;
    recordedDate: string;
    type: string;
    eventName: string;
    videoUrl: string;
    remarks?: string;
    participantName?: string;
    profileid?: string;
    eventId?: string;
    status: 'valid' | 'error';
    errors: string[];
  }[] = [];
  bulkImportLoading = false;
  bulkImportSaving = false;
  showBulkErrorDialog = false;
  bulkErrorMessages: string[] = [];
  bulkImportProcessed = false;
  //journey filter
  journeyOptions: { id: string; name: string }[] = [];
  selectedJourneyFilters: string[] = [];
  journeyFilterCtrl = new FormControl('');
  filteredJourneys: { id: string; name: string }[] = [];
  journeyTypeFilter: 'all' | 'active' | 'last' = 'all';
  //summary counts
  summaryStats = {totalParticipants: 0,videoCounts: {} as { [type: string]: number },};
  showVideoOverlay = false;
  overlayVideoUrl = '';
  overlayVideoTitle = '';
  activeWatchIndex: string | null = null;
  //event filter
  showEventFilterDropdown = false;
  selectedEventFilters: string[] = [];
  liveevent: { id: string; name: string; startDate: any }[] = [];
  eventFilterDropdownTop = 0;
  eventFilterDropdownLeft = 0;
  copiedEventId: string | null = null;
  //video event filter
  showVideoFilterDropdown = false;
  selectedVideoFilters: string[] = [];
  videoFilterDropdownTop = 0;
  videoFilterDropdownLeft = 0;
  eventFilterSearchCtrl = new FormControl('');
  filteredEventFilterOptions: { id: string; name: string }[] = [];
  videoFilterSearchCtrl = new FormControl('');
  private pendingLogEventIndex: number | null = null;
  // LOG FILTER
  logEventFilterOptions: { id: string; name: string }[] = [];
  selectedLogEventFilter: string[] = [];
  filteredLogEvents: typeof this.logEvents = [];
  logEventFilterCtrl = new FormControl('');
  filteredLogEventOptions: { id: string; name: string }[] = [];
  private logEventFilterSub: Subscription | null = null;
  showJourneyTypeDropdown = false;
  showOnlyWithVideos = false;
  exportLoading = false;
  journeyFilterDropdownTop = 0;
  journeyFilterDropdownLeft = 0;
  // Delete
  showDeleteVideoOverlay = false;
  deleteVideoCardIndex: number | null = null;
  deleteVideoIndex: number | null = null;
  deleteVideoSaving = false;
  //video types
  videoTypeMap: { [key: string]: string } = {
    'Event': 'Event',
    'Interview': 'Interview',
    'Testimonial': 'Testimonial',
  };
  videoTypeKeys = Object.keys(this.videoTypeMap);

  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private fb: FormBuilder,
  ) {}

  ngOnInit() {
    this.guard.getRoles().then(async (roles) => {
      this.loggedInProfileId = roles['profile_ref'].id ?? null;
      await Promise.all([
        this.fetchParticipants(),
        this.fetchLiveEvent()
      ]);
      this.fetchRecords();
    });
    this.participantSearchSub = this.participantFilterCtrl.valueChanges.pipe(debounceTime(300),distinctUntilChanged()).subscribe((search) => {
      this.filterParticipants(search || '');
    });
  }

  ngOnDestroy() {
    this.participantSearchSub?.unsubscribe();
    this.addVideoSearchSub?.unsubscribe();
    this.eventFilterSearchSub?.unsubscribe();  
    this.logEventFilterSub?.unsubscribe();
  }

  // Fetch participants for filter dropdown
  async fetchParticipants() {
    const snap = await getDocs(
      query(collection(this.firestore, 'participant metadata'), orderBy('name', 'asc'))
    );

    this.participantOptions = snap.docs.map((d) => ({
      id: d.id,
      name: d.data()['name'],
    }));
    this.filteredParticipants = [...this.participantOptions];

    this.mapProfiles = {};
    const journeyIdSet = new Set<string>();
    snap.docs.forEach((d) => {
      this.mapProfiles[d.id] = d.data();
      const journeyId = d.data()['activejourney'];
      if (journeyId) journeyIdSet.add(journeyId);
      const lastJourneyId = d.data()['lastcompletedjourney'];
      if (lastJourneyId) journeyIdSet.add(lastJourneyId);
    });

    if (journeyIdSet.size > 0) {
      const journeyDocs = await Promise.all(
        [...journeyIdSet].map((id) => getDoc(doc(this.firestore, 'journey', id)))
      );
      this.mapJourneys = {};
      journeyDocs.forEach((d) => {
        if (d.exists()) {
          this.mapJourneys[d.id] = d.data()['journey'] || 'No Journey';
        }
      });

      // Build journeyOptions from mapJourneys
      this.journeyOptions = Object.entries(this.mapJourneys).map(([id, name]) => ({
        id,
        name: name as string,
      })).sort((a, b) => a.name.localeCompare(b.name));

      this.filteredJourneys = [...this.journeyOptions];
      this.journeyFilterCtrl.valueChanges.pipe(debounceTime(200),distinctUntilChanged()).subscribe((search) => {
        const lower = (search || '').toLowerCase();
        this.filteredJourneys = this.journeyOptions.filter(j =>
          j.name.toLowerCase().includes(lower)
        );
      });
    }
    this.fetchSummaryStats();
  }

  getFilteredProfileIds(): string[] {
    return Object.entries(this.mapProfiles)
      .filter(([, profile]: [string, any]) => {
        // Journey name filter
        const matchesJourney = !this.selectedJourneyFilters.length ||
          this.selectedJourneyFilters.includes(profile['activejourney']) ||
          this.selectedJourneyFilters.includes(profile['lastcompletedjourney']);

        // Journey type filter
        const matchesType =
          this.journeyTypeFilter === 'all' ||
          (this.journeyTypeFilter === 'active' && !!profile['activejourney']) ||
          (this.journeyTypeFilter === 'last' && !profile['activejourney'] && !!profile['lastcompletedjourney']);

        return matchesJourney && matchesType;
      }).map(([id]) => id);
  }

  // Fetch event counts
  async fetchEventCounts(records: any[]) {
    const profileIds = records.map((r) => r['profileid']).filter(Boolean);
    if (profileIds.length === 0) return;

    const profileIdToMetadataId: { [profileid: string]: string } = {};
    records.forEach((r) => {
      if (r['profileid']) profileIdToMetadataId[r['profileid']] = r.id;
    });

    const chunks = this.chunkArray(profileIds, 30);
    const snaps = await Promise.all(
    chunks.map((chunk) => getDocs(query( collection(this.firestore, 'event participation request'), where('status', '==', 'attended'), where('profileid', 'in', chunk) )) ) );
    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const profileid = d.data()['profileid'];
        const eventref = d.data()['eventref'];
        const metadataId = profileIdToMetadataId[profileid];
        if (metadataId && eventref?.path?.startsWith('event collection/')) {
          this.mapEventCount[metadataId] = (this.mapEventCount[metadataId] || 0) + 1;
        }
      });
    });
  }

  //Fetch last video
  async fetchLastVideos(records: any[]) {
    const profileIds = records.map((r) => r['profileid']).filter(Boolean);
    if (profileIds.length === 0) return;

    const chunks = this.chunkArray(profileIds, 30);
    const snaps = await Promise.all(
      chunks.map((chunk) => getDocs(query(
        collection(this.firestore, 'participant videos'),
        where('profileid', 'in', chunk),
        where('delete', '==', false),
        orderBy('recordeddate', 'desc')
      )))
    );

    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const profileid = d.data()['profileid'];
        const type = d.data()['type'];
        if (!profileid) return;
        if (!this.mapVideoCount[profileid]) {
          this.mapVideoCount[profileid] = {};
        }
        if (type) {
          this.mapVideoCount[profileid][type] = (this.mapVideoCount[profileid][type] || 0) + 1;
        }
        // First occurrence per profileid 
        if (!this.mapLastVideo[profileid]) {
          let eventName = d.data()['title'] || '—';
          let date: Date | null = null;

          if (d.data()['eventref']?.path) {
            const eventId = d.data()['eventref'].path.replace('event collection/', '');
            const found = this.liveevent.find(e => e.id === eventId);
            if (found) eventName = found.name;
          }

          const rawDate = d.data()['recordeddate'] || null;
          if (rawDate?.toDate) date = rawDate.toDate();
          else if (rawDate) date = new Date(rawDate);

          this.mapLastVideo[profileid] = { eventName, date };
        }
      });
    });
  }

  async fetchSummaryStats() {
    const counts = await Promise.all(
      this.videoTypeKeys.map((type) =>
        getCountFromServer(query(
          collection(this.firestore, 'participant videos'),
          where('delete', '==', false),
          where('type', '==', type)
        ))
      )
    );

    const videoCounts: { [type: string]: number } = {};
    this.videoTypeKeys.forEach((type, index) => {
      videoCounts[type] = counts[index].data().count;
    });

    this.summaryStats = {
      totalParticipants: this.participantOptions.length,
      videoCounts,
    };
  }

  // Fetch profile photo
  async fetchProfilePhotos(records: any[]) {
    const profileIds = records.map((r) => r['profileid']).filter(Boolean);
    if (profileIds.length === 0) return;

    const profileIdToMetadataId: { [profileid: string]: string } = {};
    records.forEach((r) => {
      if (r['profileid']) profileIdToMetadataId[r['profileid']] = r.id;
    });

    const chunks = this.chunkArray(profileIds, 30);
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(
          collection(this.firestore, 'profile_data'),
          where('profileid', 'in', chunk)
        ))
      )
    );

    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const profileid = d.data()['profileid'];
        const photo = d.data()['profile'] || null;
        const profileImg = d.data()['profileimg'] || null;
        const resolvedPhoto = photo?.includes('profile-image-png-14') ? null : photo;
        const metadataId = profileIdToMetadataId[profileid];
        if (metadataId) {
          this.mapProfiles[metadataId] = {
            ...this.mapProfiles[metadataId],
            photo: resolvedPhoto || profileImg || null,
          };
        }
      });
    });
  }

  // FILTER PARTICIPANTS
  filterParticipants(search: string) {
    if (!search) {
      this.filteredParticipants = [...this.participantOptions];
      return;
    }
    const lower = search.toLowerCase();
    this.filteredParticipants = this.participantOptions.filter((p) =>
      p.name?.toLowerCase().includes(lower)
    );
  }

  openJourneyTypeDropdown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const btn = target.closest('button') ?? target;
    const rect = btn.getBoundingClientRect();
    this.journeyFilterDropdownTop = rect.bottom + 8;
    this.journeyFilterDropdownLeft = rect.left;
    this.showJourneyTypeDropdown = !this.showJourneyTypeDropdown;
    this.showEventFilterDropdown = false;
    this.showVideoFilterDropdown = false;
    event.stopPropagation();
  }

  setJourneyTypeFilter(type: 'all' | 'active' | 'last') {
    this.journeyTypeFilter = type;
    this.showJourneyTypeDropdown = false;
    this.resetPagination();
    this.fetchRecords();
  }

  onEventFilterChange(eventId: string, event: any) {
    if (event.target.checked) {
      this.selectedEventFilters = [...this.selectedEventFilters, eventId];
    } else {
      this.selectedEventFilters = this.selectedEventFilters.filter(id => id !== eventId);
    }
    this.resetPagination();
    this.fetchRecords();
  }

  copyToClipboard(text: string, eventId: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.copiedEventId = eventId;
      setTimeout(() => {
        this.copiedEventId = null;
      }, 2000);
    });
  }

  getJourneyTypeFilterLabel(): string {
    if (this.journeyTypeFilter === 'active') return 'Active';
    if (this.journeyTypeFilter === 'last') return 'Last';
    return '';
  }

  openEventFilterDropdown(event: MouseEvent) {
    const rect = (event.target as HTMLElement).closest('button')!.getBoundingClientRect();
    this.eventFilterDropdownTop = rect.bottom + 8;
    this.eventFilterDropdownLeft = rect.left;
    this.showEventFilterDropdown = !this.showEventFilterDropdown;
    event.stopPropagation();
  }

  openVideoFilterDropdown(event: MouseEvent) {
    const rect = (event.target as HTMLElement).closest('button')!.getBoundingClientRect();
    this.videoFilterDropdownTop = rect.bottom + 8;
    this.videoFilterDropdownLeft = rect.left;
    this.showVideoFilterDropdown = !this.showVideoFilterDropdown;
    this.showEventFilterDropdown = false;
    event.stopPropagation();
  }

  async getVideoFilteredIds(): Promise<string[]> {
    if (!this.selectedVideoFilters.length) return [];

    const chunks = this.chunkArray(this.selectedVideoFilters, 30);
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(
          collection(this.firestore, 'participant videos'),
          where('delete', '==', false),
          where('eventref', 'in', chunk.map(id => doc(this.firestore, 'event collection', id)))
        ))
      )
    );

    const profileIds = new Set<string>();
    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const profileid = d.data()['profileid'];
        if (profileid) profileIds.add(profileid);
      });
    });

    return Object.entries(this.mapProfiles)
      .filter(([, profile]: [string, any]) => profileIds.has(profile['profileid']))
      .map(([id]) => id);
  }

  onVideoFilterChange(eventId: string, event: any) {
    if (event.target.checked) {
      this.selectedVideoFilters = [...this.selectedVideoFilters, eventId];
    } else {
      this.selectedVideoFilters = this.selectedVideoFilters.filter(id => id !== eventId);
    }
    this.resetPagination();
    this.fetchRecords();
  }

  
  clearFilters() {
    this.selectedParticipants = [];
    this.selectedJourneyFilters = [];
    this.selectedEventFilters = [];
    this.selectedVideoFilters = [];
    this.journeyTypeFilter = 'all';
    this.showOnlyWithVideos = false;
    this.showJourneyTypeDropdown = false;          
    this.eventFilterSearchCtrl.setValue('');   
    this.videoFilterSearchCtrl.setValue('');   
    this.showEventFilterDropdown = false;
    this.showVideoFilterDropdown = false;
    this.resetPagination();
    this.fetchRecords();
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private async fetchSupportingData(records: any[]) {
    this.mapEventCount = {};
    this.mapLastVideo = {};
    this.mapVideoCount = {};
    await Promise.all([
      this.fetchProfilePhotos(records),
      this.fetchEventCounts(records),
      this.fetchLastVideos(records),
    ]);
  }

  private buildBaseQuery(idChunk?: string[], startAfterDoc?: any) {
    const ref = collection(this.firestore, 'participant metadata');
    const constraints: any[] = [orderBy('name', 'asc')];
    if (idChunk?.length) constraints.push(where('__name__', 'in', idChunk));
    if (startAfterDoc) constraints.push(startAfter(startAfterDoc));
    constraints.push(limit(this.pageSize));
    return query(ref, ...constraints);
  }

  async getEventFilteredIds(): Promise<string[]> {
    if (!this.selectedEventFilters.length) return [];

    const chunks = this.chunkArray(this.selectedEventFilters, 30);
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(
          collection(this.firestore, 'event participation request'),
          where('status', '==', 'attended'),
          where('eventref', 'in', chunk.map(id => doc(this.firestore, 'event collection', id)))
        ))
      )
    );

    const profileIds = new Set<string>();
    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const profileid = d.data()['profileid'];
        if (profileid) profileIds.add(profileid);
      });
    });

    // Convert profileids to metadata ids
    return Object.entries(this.mapProfiles)
      .filter(([, profile]: [string, any]) => profileIds.has(profile['profileid']))
      .map(([id]) => id);
  }

  private async executeQuery(snap: any, totalCount?: number) {
    this.records = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
    await this.fetchSupportingData(this.records);
    this.lastDoc = snap.docs[snap.docs.length - 1] || null;
    this.pageCache.set(this.currentPage, snap.docs);
    this.totalRecords = totalCount ?? (
      snap.docs.length < this.pageSize
        ? this.currentPage * this.pageSize + snap.docs.length
        : (this.currentPage + 2) * this.pageSize
    );
    this.summaryStats = {
      ...this.summaryStats,
      totalParticipants: this.showOnlyWithVideos
        ? this.totalRecords
        : this.participantOptions.length,
    };
    this.loading = false;
    this.initialLoading = false;
  }

  async fetchRecords(startAfterDoc?: any) {
    this.loading = true;
    let selectedIds = this.selectedParticipants.map((p) => p.id);
    if (this.selectedJourneyFilters.length || this.journeyTypeFilter !== 'all') {
      const filteredIds = this.getFilteredProfileIds();
      selectedIds = selectedIds.length > 0? selectedIds.filter(id => filteredIds.includes(id)): filteredIds;
    }
    // Apply event filter
    if (this.selectedEventFilters.length) {
      const eventIds = await this.getEventFilteredIds();
      selectedIds = selectedIds.length > 0? selectedIds.filter(id => eventIds.includes(id)): eventIds;
    }
    // Apply video filter
    if (this.selectedVideoFilters.length) {
      const videoIds = await this.getVideoFilteredIds();
      selectedIds = selectedIds.length > 0? selectedIds.filter(id => videoIds.includes(id)): videoIds;
    }

    if (this.showOnlyWithVideos) {
      const withVideoIds = await this.getParticipantsWithVideos();
      selectedIds = selectedIds.length > 0? selectedIds.filter(id => withVideoIds.includes(id)): withVideoIds;
    }

    const noFilters = !this.selectedParticipants.length &&!this.selectedJourneyFilters.length &&!this.selectedEventFilters.length &&!this.selectedVideoFilters.length&&this.journeyTypeFilter === 'all' && !this.showOnlyWithVideos;
    if (noFilters) {
        const snap = await getDocs(this.buildBaseQuery(undefined, startAfterDoc));
        await this.executeQuery(snap);
        return;
      }

      if (selectedIds.length === 0) {
        this.records = [];
        this.totalRecords = 0;
        this.loading = false;
        this.initialLoading = false;
        return;
      }

      if (selectedIds.length <= 30) {
        const snap = await getDocs(this.buildBaseQuery(selectedIds, startAfterDoc));
        await this.executeQuery(snap);
        return;
      }

      const chunks = this.chunkArray(selectedIds, 30);
      const snapshots = await Promise.all(chunks.map((chunk) => getDocs(this.buildBaseQuery(chunk, startAfterDoc))));
      const allDocs = snapshots.flatMap((s) => s.docs);
      allDocs.sort((a, b) =>
        (a.data()['name'] || '').toLowerCase().localeCompare((b.data()['name'] || '').toLowerCase())
      );
      const paginated = allDocs.slice(0, this.pageSize);
      await this.executeQuery({ docs: paginated }, allDocs.length);
    }
 
    async getParticipantsWithVideos(): Promise<string[]> {
      const snap = await getDocs(query(
        collection(this.firestore, 'participant videos'),
        where('delete', '==', false)
      ));
      const profileIds = new Set<string>(
        snap.docs.map(d => d.data()['profileid']).filter(Boolean)
      );
      return Object.entries(this.mapProfiles)
        .filter(([, profile]: [string, any]) => profileIds.has(profile['profileid']))
        .map(([id]) => id);
    }

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
        const cached = this.pageCache.get(this.currentPage)!;
        this.records = cached.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
        this.fetchSupportingData(this.records).catch(err => console.error('Error fetching supporting data:', err));
      } else {
        this.fetchRecords(this.lastDoc);
      }
    } else if (event.pageIndex < this.currentPage) {
      this.currentPage = event.pageIndex;
      const cached = this.pageCache.get(this.currentPage)!;
      this.records = cached.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
      this.lastDoc = cached[cached.length - 1];
      this.fetchSupportingData(this.records).catch(err => console.error('Error fetching supporting data:', err));
    }
  }

  resetPagination() {
    this.currentPage = 0;
    this.lastDoc = null;
    this.pageCache.clear();
    this.totalRecords = 0;
  }

  openLog(row: any) {
    this.logParticipantName = row['name'];
    this.logEventCount = this.mapEventCount[row.id] || 0;
    this.logEvents = [];
    this.filteredLogEvents = [];
    this.logEventFilterOptions = [];
    this.selectedLogEventFilter = [];
    this.showLogOverlay = true;
    const profileid = this.mapProfiles[row.id]?.['profileid'] || null;
    this.currentLogProfileId = profileid;
    this.loadEventLog(profileid);
  }

  closeLog() {
    this.showLogOverlay = false;
    this.logEvents = [];
  }

  async loadEventLog(profileid: string) {
    if (!profileid) {
      this.logLoading = false;
      return;
    }
    this.logLoading = true;

    const [eventSnap, videoSnap] = await Promise.all([
      getDocs(query(
        collection(this.firestore, 'event participation request'),
        where('status', '==', 'attended'),
        where('profileid', '==', profileid)
      )),
      getDocs(query(
        collection(this.firestore, 'participant videos'),
        where('profileid', '==', profileid),
        where('delete', '==', false)
      ))
    ]);

    // Build video map: eventref path -> video
    const videoByEventRef: { [path: string]: any[] } = {};
    const standaloneVideos: any[] = [];

    videoSnap.docs.forEach((d) => {
      const data = { ...d.data(), docId: d.id };
      if (data['eventref']?.path) {
        if (!videoByEventRef[data['eventref'].path]) {
          videoByEventRef[data['eventref'].path] = [];
        }
        videoByEventRef[data['eventref'].path].push(data);
      } else {
        standaloneVideos.push(data);
      }
    });

    // Build event items
    const eventItems = eventSnap.docs
      .filter((d) => {
          const eventref = d.data()['eventref'];
          return eventref?.path?.startsWith('event collection/');
        })
      .map((d) => {
        const data = d.data();
        const eventref = data['eventref'];
        let eventName = 'Unknown Event';
        let date: Date | null = null;
        const eventId = eventref.path.replace('event collection/', '');
        const found = this.liveevent.find(e => e.id === eventId);
        if (found) {
          eventName = found.name;
          const rawDate = found.startDate;
          if (rawDate?.toDate) date = rawDate.toDate();
          else if (rawDate) date = new Date(rawDate);
        }
        const matchedVideos = videoByEventRef[eventref.path] || [];
        const matchedVideo = matchedVideos[0] || null;
        let videoRecordedDate: Date | null = null;
        if (matchedVideo) {
          const rawVideoDate = matchedVideo['recordeddate'] || null;
          if (rawVideoDate?.toDate) videoRecordedDate = rawVideoDate.toDate();
          else if (rawVideoDate) videoRecordedDate = new Date(rawVideoDate);
        }
        return {
          type: 'event' as const,
          eventName,
          date,
          hasVideo: matchedVideos.length > 0,
          videoUrl: matchedVideo ? matchedVideo['videourl'] : null,
          videoTitle: matchedVideo?.['title'] || null,
          eventId: eventref.path,
          docId: matchedVideo?.['docId'] || null,
          videoType: matchedVideo?.['type'] || null,
          remarks: matchedVideo?.['remarks'] || null,
          extraVideos: matchedVideos.slice(1).map((v: any) => {
            let extraDate: Date | null = null;
            const rawExtraDate = v['recordeddate'] || null;
            if (rawExtraDate?.toDate) extraDate = rawExtraDate.toDate();
            else if (rawExtraDate) extraDate = new Date(rawExtraDate);
            return {
              videoUrl: v['videourl'],
              videoTitle: v['title'] || 'Untitled',
              docId: v['docId'],
              videoType: v['type'] || null,
              recordedDate: extraDate,
              eventId: eventref.path,
              remarks: v['remarks'] || null,
            };
          }),
        };
      })
    

    // Build standalone video items (Interview/Testimonial)
    const videoItems = standaloneVideos.map((v) => {
      let date: Date | null = null;
      if (v['recordeddate']?.toDate) date = v['recordeddate'].toDate();
      else if (v['recordeddate']) date = new Date(v['recordeddate']);
      return {
        type: 'video' as const,
        eventName: v['title'] || 'Untitled Video',
        date,
        hasVideo: true,
        videoUrl: v['videourl'],
        videoTitle: v['title'],
        videoType: v['type'],
        remarks: v['remarks'] || null,
        docId: v['docId'] || null,

      };
    });

    // Videos with eventref that didn't match any attended event card
    const matchedEventPaths = new Set(eventItems.map(e => (e as any).eventId));
    const unmatchedEntries = Object.entries(videoByEventRef)
      .filter(([path]) => !matchedEventPaths.has(path));

    const unmatchedEventVideos = unmatchedEntries.flatMap(([path, videos]) =>
      videos.map((v: any) => {
        let date: Date | null = null;
        if (v['recordeddate']?.toDate) date = v['recordeddate'].toDate();
        else if (v['recordeddate']) date = new Date(v['recordeddate']);

        const eventId = path.replace('event collection/', '');
        const found = this.liveevent.find(e => e.id === eventId);
        const linkedEventName = found?.name || null;

          return {
            type: 'video' as const,
            eventName: v['title'] || 'Untitled Video',
            date,
            hasVideo: true,
            videoUrl: v['videourl'],
            videoTitle: v['title'],
            videoType: v['type'],
            docId: v['docId'] || null,
            linkedEventName,  
            eventId: path,
            remarks: v['remarks'] || null,
            extraVideos: [],
          };
      })
    );

    // Merge and sort by date desc
    const allItems = [...eventItems, ...videoItems, ...unmatchedEventVideos];
    allItems.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.getTime() - a.date.getTime();
    });

    // Restore saved drag order if exists
    const savedOrder = this.logEventOrderMap[profileid];
    if (savedOrder && savedOrder.length === allItems.length) {
      const orderMap = new Map(savedOrder.map((key, idx) => [key, idx]));
      allItems.sort((a, b) => {
        const keyA = (a as any).eventId || a.eventName;
        const keyB = (b as any).eventId || b.eventName;
        return (orderMap.get(keyA) ?? 999) - (orderMap.get(keyB) ?? 999);
      });
    }
    this.logEvents = allItems;
    this.filteredLogEvents = [...allItems];
    this.selectedLogEventFilter = [];

    // Build filter options from attended event cards only
    this.logEventFilterOptions = allItems
      .filter((e) => e.type === 'event' && (e as any).eventId)
      .map((e) => ({
        id: (e as any).eventId,
        name: e.eventName,
      }));

    // Initialize search
    this.filteredLogEventOptions = [...this.logEventFilterOptions];
    this.logEventFilterCtrl.setValue('');

    // Subscribe to search input
    this.logEventFilterSub?.unsubscribe();
    this.logEventFilterSub = this.logEventFilterCtrl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe((search) => {
      const lower = (search || '').toLowerCase();
      this.filteredLogEventOptions = this.logEventFilterOptions.filter(o =>
        o.name.toLowerCase().includes(lower)
      );
    });
    this.logLoading = false;
  }

  onCardDragStart(event: DragEvent, i: number) {
    this.dragCardIndex = i;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onCardDragOver(event: DragEvent, i: number) {
    event.preventDefault();
    this.dragOverIndex = i;
  }

  onCardDrop(event: DragEvent, i: number) {
    event.preventDefault();
    if (this.dragCardIndex === null || this.dragCardIndex === i) return;

    const items = [...this.logEvents];
    const draggedItem = items.splice(this.dragCardIndex, 1)[0];
    items.splice(i, 0, draggedItem);
    this.logEvents = items;

    this.logEventOrderMap[this.currentLogProfileId] = items.map(
      (e) => (e as any).eventId || e.eventName
    );

    this.dragCardIndex = null;
    this.dragOverIndex = null;
  }

  onCardDragEnd() {
    this.dragCardIndex = null;
    this.dragOverIndex = null;
  }

  openNote(i: number) {
    this.noteEventIndex = i;
    this.noteText = (this.logEvents[i] as any)['note'] || '';
    this.showNoteOverlay = true;
  }

  closeNote() {
    this.showNoteOverlay = false;
    this.noteEventIndex = null;
    this.noteText = '';
  }

  saveNote() {
    if (this.noteEventIndex !== null) {
      const updated = [...this.logEvents];
      (updated[this.noteEventIndex] as any)['note'] = this.noteText;
      this.logEvents = updated;
    }
    this.closeNote();
  }

  openImage(photo: string, name: string) {
    this.previewImageUrl = photo || 'https://firebasestorage.googleapis.com/v0/b/fir-sample-aae4a.appspot.com/o/profile-image-png-14.png?alt=media&token=ce6361d2-690c-4742-bba7-dbb90e193080';
    this.previewImageName = name;
    this.showImageOverlay = true;
  }

  closeImage() {
    this.showImageOverlay = false;
    this.previewImageUrl = '';
    this.previewImageName = '';
  }

  // VIDEO PLAYER
  convertDropboxUrl(url: string): string {
    if (!url || !url.includes('dropbox.com')) return url;
    return url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/[?&]dl=\d/, '')
      .replace(/[?&]raw=\d/, '')
      + (url.includes('?') ? '&' : '?') + 'raw=1';
  }

  openVideoPlayer(url: string, title: string = '') {
    this.showVideoPlayer = false;
    this.overlayVideoUrl = this.convertDropboxUrl(url);
    this.overlayVideoTitle = title;
    setTimeout(() => {
      this.showVideoPlayer = true;
      this.showVideoOverlay = true;
    }, 50);
  }

  closeVideoOverlay() {
    this.showVideoOverlay = false;
    this.showVideoPlayer = false;
    this.overlayVideoUrl = '';
    this.overlayVideoTitle = '';
  }

  openVideoInNewTab(url: string) {
    window.open(url, '_blank');
  }

  applyLogEventFilter() {
    if (!this.selectedLogEventFilter.length) {
      this.filteredLogEvents = [...this.logEvents];
    } else {
      this.filteredLogEvents = this.logEvents.filter((e) => {
        const eventId = (e as any).eventId || null;
        return eventId && this.selectedLogEventFilter.includes(eventId);
      });
    }
  }

  removeLogEventFilter(id: string) {
    this.selectedLogEventFilter = this.selectedLogEventFilter.filter(f => f !== id);
    this.applyLogEventFilter();
  }

  getLogEventName(id: string): string {
    return this.logEventFilterOptions.find(o => o.id === id)?.name || id;
  }

  // ADD VIDEO FORM
  get entriesArray(): FormArray {
    return this.addVideoForm.get('entries') as FormArray;
  }

  buildAddVideoForm(): FormGroup {
    return this.fb.group({
      participantId: ['', Validators.required],
      entries: this.fb.array([this.buildEntry()])
    });
  }

  buildEntry(): FormGroup {
    return this.fb.group({
      title: ['', Validators.required],
      recordedDate: [null],
      type: ['', Validators.required],
      eventId: [''],
      videoUrl: ['', Validators.required],
      remarks: [''],
    });
  }

  openAddVideo() {
    this.addVideoSubmitted = false;
    this.addVideoForm = this.buildAddVideoForm();
    this.addVideoFilteredParticipants = [...this.participantOptions];
    this.showAddVideoOverlay = true;
    if (this.addVideoSearchSub) {
      this.addVideoSearchSub.unsubscribe();
    }
    this.addVideoSearchSub = this.addVideoParticipantCtrl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe((search) => {
      const lower = (search || '').toLowerCase();
      this.addVideoFilteredParticipants = this.participantOptions.filter((p) =>
        p.name?.toLowerCase().includes(lower)
      );
    });
  }

  closeAddVideo() {
    this.addVideoSubmitted = false;
    this.showAddVideoOverlay = false;
    this.activeTab = 'manual';
    this.bulkPreviewRows = [];
    this.bulkImportFile = null;
    this.bulkImportProcessed = false;
    this.bulkImportLoading = false;
    this.bulkImportSaving = false;
    this.pendingLogEventIndex = null; 
    if (this.addVideoSearchSub) {
      this.addVideoSearchSub.unsubscribe();
      this.addVideoSearchSub = null;
    }
  }

  openAddVideoForEvent(event: any) {
    this.addVideoSubmitted = false;
    this.addVideoForm = this.buildAddVideoForm();
    this.addVideoFilteredParticipants = [...this.participantOptions];

    // Pre-fill participant
    const participantEntry = this.participantOptions.find(
      (p) => this.mapProfiles[p.id]?.['profileid'] === this.currentLogProfileId
    );
    if (participantEntry) {
      this.addVideoForm.get('participantId')?.setValue(participantEntry.id);
    }

    // Pre-fill first entry
    const eventId = event.eventId?.replace('event collection/', '');
    const firstEntry = this.entriesArray.at(0) as FormGroup;
    firstEntry.get('type')?.setValue('Event');
    firstEntry.get('eventId')?.setValue(eventId || '');

    this.showAddVideoOverlay = true;
    this.pendingLogEventIndex = this.logEvents.indexOf(event);

    if (this.addVideoSearchSub) {
      this.addVideoSearchSub.unsubscribe();
    }
    this.addVideoSearchSub = this.addVideoParticipantCtrl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe((search) => {
      const lower = (search || '').toLowerCase();
      this.addVideoFilteredParticipants = this.participantOptions.filter((p) =>
        p.name?.toLowerCase().includes(lower)
      );
    });
  }

  async fetchLiveEvent() {
    if (this.liveevent.length > 0) return;
    const snap = await getDocs(
      query(collection(this.firestore, 'event collection'), orderBy('name', 'asc'))
    );
    this.liveevent = snap.docs.map((d) => ({
      id: d.id,
      name: d.data()['name'] || 'Unnamed Event',
      startDate: d.data()['start_date'] || null
    }));

    this.filteredEventFilterOptions = [...this.liveevent];

    this.eventFilterSearchSub = this.eventFilterSearchCtrl.valueChanges.pipe(
      debounceTime(200), distinctUntilChanged()
    ).subscribe((search) => {
      const lower = (search || '').toLowerCase();
      this.filteredEventFilterOptions = this.liveevent.filter(e =>
        e.name.toLowerCase().includes(lower)
      );
    });
  }

  async saveVideo() {
    this.addVideoSubmitted = true;
    this.addVideoForm.markAllAsTouched();
    if (!this.addVideoForm.valid) return;

    const formValue = this.addVideoForm.value;
    const participantMetadataId = formValue.participantId;
    const profileid = this.mapProfiles[participantMetadataId]?.['profileid'] || null;

    try {
      const savedRefs = await Promise.all(
        formValue.entries.map((entry: any) => {
          const eventRef = entry.eventId
            ? doc(this.firestore, 'event collection', entry.eventId)
            : null;

          return addDoc(collection(this.firestore, 'participant videos'), {
            profileid: profileid,
            title: entry.title,
            recordeddate: entry.recordedDate
              ? Timestamp.fromDate(new Date(entry.recordedDate))
              : null,
            type: entry.type,
            eventref: eventRef,
            videourl: entry.videoUrl,
            remarks: entry.remarks || null,
            uploadedon: serverTimestamp(),
            uploadedby: this.loggedInProfileId,
            delete: false,
          });
        })
      );

      if (this.showLogOverlay && this.pendingLogEventIndex !== null) {
        const idx = this.pendingLogEventIndex;
        const firstEntry = formValue.entries[0];
        const updated = [...this.logEvents];
        const current = updated[idx] as any;
        updated[idx] = {
          ...current,
          videoTitle: firstEntry.title,
          videoUrl: firstEntry.videoUrl,
          videoType: firstEntry.type,
          hasVideo: !!firstEntry.videoUrl,
          docId: savedRefs[0].id,
          remarks: firstEntry.remarks || null,
          date: firstEntry.recordedDate
            ? new Date(firstEntry.recordedDate)
            : current.date,
          extraVideos: formValue.entries.slice(1).map((e: any, i: number) => ({
            videoUrl: e.videoUrl,
            videoTitle: e.title,
            docId: savedRefs[i + 1].id,
            videoType: e.type,
            remarks: e.remarks || null,
          })),
        };
        this.logEvents = [...updated];
        this.pendingLogEventIndex = null;
      }
      this.closeAddVideo();
      this.fetchRecords();

    } catch (err) {
      console.error('Error saving video:', err);
    }
  }

  openEditVideo(event: any, i: number) {
    this.editVideoIndex = i;
    const allVideos = [
      {
        docId: event.docId || '',
        title: event.videoTitle || event.eventName || '',
        recordedDate: event.videoRecordedDate ?? null,
        type: event.videoType || 'Event',
        eventId: event.eventId ? event.eventId.replace('event collection/', '') : '',
        videoUrl: event.videoUrl || '',
        remarks: event.remarks || '',
      },
      ...(event['extraVideos'] || []).map((v: any) => ({
        docId: v.docId || '',
        title: v.videoTitle || '',
        recordedDate: v.recordedDate ?? null,
        type: v.videoType || 'Event',
        eventId: v.eventId ? v.eventId.replace('event collection/', '') : '',
        videoUrl: v.videoUrl || '',
        remarks: v.remarks || '',
      }))
    ];

    this.editVideoForm = this.fb.group({
      entries: this.fb.array(
        allVideos.map(v => this.fb.group({
          docId: [v.docId],
          title: [v.title, Validators.required],
          recordedDate: [v.recordedDate],
          type: [v.type, Validators.required],
          eventId: [v.eventId],
          videoUrl: [v.videoUrl, Validators.required],
          remarks: [v.remarks],
        }))
      )
    });
      this.showEditVideoOverlay = true;

  }
  closeEditVideo() {
    this.showEditVideoOverlay = false;
    this.editVideoIndex = null;
    this.editVideoSaving = false;
  }

  async saveEditVideo() {
    this.editVideoForm.markAllAsTouched();
    if (!this.editVideoForm.valid) return;
    this.editVideoSaving = true;

    const entries = (this.editVideoForm.get('entries') as FormArray).value;

    try {
      await Promise.all(
        entries.map((val: any) => {
          const eventRef = val.eventId
            ? doc(this.firestore, 'event collection', val.eventId)
            : null;

          return updateDoc(doc(this.firestore, 'participant videos', val.docId), {
            title: val.title,
            recordeddate: val.recordedDate
              ? Timestamp.fromDate(new Date(val.recordedDate))
              : null,
            type: val.type,
            eventref: eventRef,
            videourl: val.videoUrl,
            remarks: val.remarks || null,
          });
        })
      );

      if (this.editVideoIndex !== null) {
        const updated = [...this.logEvents];
        const current = updated[this.editVideoIndex] as any;
        const [primary, ...extras] = entries;
        const linkedEvent = primary.eventId? this.liveevent.find((e: any) => e.id === primary.eventId): null;

        updated[this.editVideoIndex] = {
          ...current,
          videoTitle: primary.title,
          eventName: current.type === 'video' ? primary.title : current.eventName,
          date: primary.recordedDate ? new Date(primary.recordedDate) : current.date,
          videoType: primary.type,
          eventId: primary.eventId ? `event collection/${primary.eventId}` : null,
          linkedEventName: linkedEvent ? linkedEvent.name : null,
          videoUrl: primary.videoUrl,
          hasVideo: !!primary.videoUrl,
          docId: primary.docId,
          remarks: primary.remarks || null,
          extraVideos: extras.map((e: any) => ({
            docId: e.docId,
            videoUrl: e.videoUrl,
            videoTitle: e.title,
            videoType: e.type,
            recordedDate: e.recordedDate ? new Date(e.recordedDate) : null,
            eventId: e.eventId ? `event collection/${e.eventId}` : null,
            remarks: e.remarks || null,
          })),
        };

        this.logEvents = [...updated];
      }
      this.closeEditVideo();
      this.fetchRecords();

    } catch (err) {
      console.error('Error saving video:', err);
      this.editVideoSaving = false;
    }
  }

  openDeleteVideo(cardIndex: number) {
    const card = this.logEvents[cardIndex] as any;
    this.deleteVideoCardIndex = cardIndex;
    if (card.extraVideos?.length > 0) {
      this.showDeleteVideoOverlay = true;
    } else {
      this.deleteVideoIndex = 0;
      this.Delete();
    }
  }

  closeDeleteVideo() {
    this.showDeleteVideoOverlay = false;
    this.deleteVideoCardIndex = null;
    this.deleteVideoIndex = null;
    this.deleteVideoSaving = false;
  }

  async Delete() {
    const confirmed = confirm('Are you sure you want to delete this video?');
    if (!confirmed) {
      this.closeDeleteVideo();
      return;
    }

    if (this.deleteVideoCardIndex === null || this.deleteVideoIndex === null) return;
    this.deleteVideoSaving = true;
    const card = this.logEvents[this.deleteVideoCardIndex] as any;
    const docIdToDelete = this.deleteVideoIndex === 0? card.docId: card.extraVideos[this.deleteVideoIndex - 1]?.docId;

    if (!docIdToDelete) {
      this.deleteVideoSaving = false;
      return;
    }

    try {
      await updateDoc(doc(this.firestore, 'participant videos', docIdToDelete), {
        delete: true
      });
      this.closeDeleteVideo();
      await Promise.all([
        this.loadEventLog(this.currentLogProfileId),
        this.fetchRecords()
      ]);
    } catch (err) {
      console.error('Error deleting video:', err);
      this.deleteVideoSaving = false;
    }
  }

  switchTab(tab: 'manual' | 'bulk') {
    this.activeTab = tab;
    this.bulkPreviewRows = [];
    this.bulkImportFile = null;
    this.bulkImportProcessed = false;
  }

  downloadSampleExcel() {
    const sampleData = [
      [
        'Email (Required)',
        'Title (Required)',
        'Recorded Date (Optional) - Format: YYYY-MM-DD',
        'Type (Required) - Event / Interview / Testimonial',
        'Event Name (Optional) - Must exactly match database name',
        'Video URL (Required)',
        'Remarks (Optional)'
      ],
      ['john@example.com', 'Pre Video', '2026-01-15', 'Event', 'BIG Accelerator', 'https://dropbox.com/video1'],
      ['jane@example.com', 'Interview Jan 2026', '2026-01-20', 'Interview', '', 'https://dropbox.com/video2'],
      ['mark@example.com', 'Testimonial', '2026-02-01', 'Testimonial', 'uP! Live 2025', 'https://dropbox.com/video3'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    ws['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 35 },
      { wch: 40 }, { wch: 45 }, { wch: 40 }, { wch: 30 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sample');
    XLSX.writeFile(wb, 'participant_videos_sample.xlsx');
  }

  onBulkFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.bulkImportFile = file;
    this.parseBulkExcel(file);
  }

  getBulkValidCount(): number {
    return this.bulkPreviewRows.filter(r => r.status === 'valid').length;
  }
  getBulkErrorCount(): number {
    return this.bulkPreviewRows.filter(r => r.status === 'error').length;
  }

  parseBulkExcel(file: File) {
    this.bulkImportLoading = true;
    this.bulkPreviewRows = [];
    this.bulkImportProcessed = false;

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

        if (rows.length < 2) {
          this.bulkErrorMessages = ['Excel file is empty or has no data rows.'];
          this.showBulkErrorDialog = true;
          this.bulkImportLoading = false;
          return;
        }

        // Skip header row
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell));
        const emailMap = this.buildEmailToParticipantMap();
        const eventNameMap = this.buildEventNameMap();
        this.bulkPreviewRows = dataRows.map((row) => {
          const email = String(row[0] || '').trim().toLowerCase();
          const title = String(row[1] || '').trim();
          const recordedDateRaw = row[2];
          const type = String(row[3] || '').trim();
          const eventName = String(row[4] || '').trim();
          const videoUrl = String(row[5] || '').trim();
          const remarks  = String(row[6] || '').trim();
          const errors: string[] = [];

          // Parse recorded date
          let recordedDate = '';
          if (recordedDateRaw) {
            if (typeof recordedDateRaw === 'number') {
              const parsed = XLSX.SSF.parse_date_code(recordedDateRaw);
              if (parsed) {
                const d = new Date(parsed.y, parsed.m - 1, parsed.d);
                recordedDate = d.toISOString().split('T')[0];
              }
            } else {
              recordedDate = String(recordedDateRaw).trim();
            }
          }

          // Validate fields
          if (!email) errors.push('Email is missing');
          if (!title) errors.push('Title is missing');
          if (!videoUrl) errors.push('Video URL is missing');
          if (!type) errors.push('Type is missing');
          if (!Object.keys(this.videoTypeMap).includes(type)) {
            errors.push(`Type must be one of: ${Object.keys(this.videoTypeMap).join(', ')} (got: "${type}")`);
          }

          // Match participant
          const participant = emailMap[email];
          if (!participant && email) {
            errors.push(`No participant found for email: ${email}`);
          }

          // Match event
          let eventId = '';
          if (eventName) {
            eventId = eventNameMap[eventName.toLowerCase()] || '';
            if (!eventId) {
              errors.push(`Event not found: "${eventName}" — Event Name must exactly match the name in database (case-sensitive)`);
            }
          }

          return {
            email,
            title,
            recordedDate,
            type,
            eventName,
            videoUrl,
            remarks,
            participantName: participant?.name || '',
            profileid: participant?.profileid || '',
            eventId,
            status: errors.length === 0 ? 'valid' as const : 'error' as const,
            errors,
          };
        });

        this.bulkImportProcessed = true;
        this.bulkImportLoading = false;

        // Show error dialog if any rows have errors
        const errorRows = this.bulkPreviewRows.filter((r) => r.status === 'error');
        if (errorRows.length > 0) {
          this.bulkErrorMessages = errorRows.flatMap((r, i) =>
            r.errors.map((e) => `Row ${i + 1} (${r.email || 'no email'}): ${e}`)
          );
          this.showBulkErrorDialog = true;
        }
      } catch (err) {
        this.bulkErrorMessages = ['Failed to parse Excel file. Please check the format.'];
        this.showBulkErrorDialog = true;
        this.bulkImportLoading = false;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  private buildEmailToParticipantMap() {
    const map: { [email: string]: { name: string; profileid: string; metadataId: string } } = {};
    this.participantOptions.forEach((p) => {
      const profile = this.mapProfiles[p.id];
      const email = (profile?.['email'] || '').toString().trim().toLowerCase();
      if (email) {
        map[email] = {
          name: p.name || '',
          profileid: profile?.['profileid'] || '',
          metadataId: p.id,
        };
      }
    });
    return map;
  }

  private buildEventNameMap() {
    const map: { [name: string]: string } = {};
    this.liveevent.forEach((e) => {
      const name = e.name.trim().toLowerCase();
      if (name) map[name] = e.id;
    });
    return map;
  }

  async saveBulkImport() {
    const validRows = this.bulkPreviewRows.filter((r) => r.status === 'valid');
    if (validRows.length === 0) return;
    this.bulkImportSaving = true;
    try {
      await Promise.all(
        validRows.map((row) => {
          const eventRef = row.eventId ? doc(this.firestore, 'event collection', row.eventId): null;
          const recordedDate = row.recordedDate? Timestamp.fromDate(new Date(row.recordedDate)): null;
          return addDoc(collection(this.firestore, 'participant videos'), {
            profileid: row.profileid,
            title: row.title,
            recordeddate: recordedDate,
            type: row.type,
            eventref: eventRef,
            videourl: row.videoUrl,
            remarks: row.remarks || null,
            uploadedon: serverTimestamp(),
            uploadedby: this.loggedInProfileId,
            delete: false,
          });
        })
      );
      this.bulkImportSaving = false;
      this.closeAddVideo();
      this.fetchRecords();
    } catch (err) {
      console.error('Bulk import error:', err);
      this.bulkErrorMessages = ['Error saving videos. Please try again.'];
      this.showBulkErrorDialog = true;
      this.bulkImportSaving = false;
    }
  }
  closeBulkErrorDialog() {
    this.showBulkErrorDialog = false;
    this.bulkErrorMessages = [];
  }

  async exportToExcel() {
    this.exportLoading = true;
    try {
      let selectedIds = this.selectedParticipants.map((p) => p.id);
      if (this.selectedJourneyFilters.length || this.journeyTypeFilter !== 'all') {
        const filteredIds = this.getFilteredProfileIds();
        selectedIds = selectedIds.length > 0? selectedIds.filter(id => filteredIds.includes(id)): filteredIds;
      }
      if (this.selectedEventFilters.length) {
        const eventIds = await this.getEventFilteredIds();
        selectedIds = selectedIds.length > 0? selectedIds.filter(id => eventIds.includes(id)): eventIds;
      }
      if (this.selectedVideoFilters.length) {
        const videoIds = await this.getVideoFilteredIds();
        selectedIds = selectedIds.length > 0? selectedIds.filter(id => videoIds.includes(id)): videoIds;
      }
      if (this.showOnlyWithVideos) {
        const withVideoIds = await this.getParticipantsWithVideos();
        selectedIds = selectedIds.length > 0? selectedIds.filter(id => withVideoIds.includes(id)): withVideoIds;
      }
      const allParticipants = selectedIds.length > 0
        ? selectedIds.map(id => ({
            metadataId: id,
            name: this.participantOptions.find(p => p.id === id)?.name || '',
            email: this.mapProfiles[id]?.['email'] || '',
            profileid: this.mapProfiles[id]?.['profileid'] || '',
          })).filter(p => p.profileid)
        : this.participantOptions.map(p => ({
            metadataId: p.id,
            name: p.name || '',
            email: this.mapProfiles[p.id]?.['email'] || '',
            profileid: this.mapProfiles[p.id]?.['profileid'] || '',
          })).filter(p => p.profileid);
      const profileIds = allParticipants.map(p => p.profileid);
      const chunks = this.chunkArray(profileIds, 30);
      const snaps = await Promise.all(
            chunks.map(chunk => getDocs(query(
              collection(this.firestore, 'participant videos'),
              where('profileid', 'in', chunk),
              where('delete', '==', false)
            )))
          );
      const videoMap: { [profileid: string]: { label: string; url: string; date: Date | null }[] } = {};
      snaps.forEach(snap => {
        snap.docs.forEach(d => {
          const data = d.data();
          const profileid = data['profileid'];
          if (!profileid) return;
          if (!videoMap[profileid]) videoMap[profileid] = [];
          let label = data['title'] || 'Untitled';
          if (data['eventref']?.path) {
            const eventId = data['eventref'].path.replace('event collection/', '');
            const found = this.liveevent.find(e => e.id === eventId);
            if (found) label = found.name;
          }
          let date: Date | null = null;
          const rawDate = data['recordeddate'] || null;
          if (rawDate?.toDate) date = rawDate.toDate();
          else if (rawDate) date = new Date(rawDate);
          videoMap[profileid].push({ label, url: data['videourl'] || '', date });
        });
      });
      Object.keys(videoMap).forEach(profileid => {
        videoMap[profileid].sort((a, b) => {
          if (!a.date && !b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return a.date.getTime() - b.date.getTime();
        });
      });
      const maxVideos = Math.max(0, ...Object.values(videoMap).map(v => v.length));
      const headers = [
        'Name',
        'Email',
        'Video Count',
        ...Array.from({ length: maxVideos }, (_, i) => `Video ${i + 1}`)
      ];

      const rows = allParticipants
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => {
          const videos = videoMap[p.profileid] || [];
          return [
            p.name,
            p.email,
            videos.length,
            ...videos.map(v => `${v.label}: ${v.url}`),
            ...Array(Math.max(0, maxVideos - videos.length)).fill(''),
          ];
        });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 25 },
        { wch: 30 },
        { wch: 12 },
        ...Array(maxVideos).fill({ wch: 60 }),
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Participant Videos');
      const fileName = `participant_videos_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

    } catch (err) {
      console.error('Export error:', err);
    } finally {
      this.exportLoading = false;
    }
  }

  getTotalVideoCount(profileid: string): number {
    if (!profileid || !this.mapVideoCount[profileid]) return 0;
    return Object.values(this.mapVideoCount[profileid]).reduce((sum, count) => sum + count, 0);
  }
    onParticipantFilterChange() {
    this.resetPagination();
    this.fetchRecords();
  }

  onJourneyFilterChange() {
    this.resetPagination();
    this.fetchRecords();
  }

  addVideoEntry() {
    this.entriesArray.push(this.buildEntry());
  }

  removeVideoEntry(index: number) {
    this.entriesArray.removeAt(index);
  }

  onEntryTypeChange(entry: FormGroup) {
    entry.get('eventId')?.setValue('');
  }
}