import { Component, OnInit, Injector, runInInjectionContext, OnDestroy , NgZone} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormBuilder, FormGroup, FormArray, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { collection, doc, Firestore, getDocs, getDoc, limit, orderBy, query, startAfter, where, addDoc, serverTimestamp, Timestamp,updateDoc } from '@angular/fire/firestore';
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
  mapVideoCount: { [profileid: string]: { events: number; interviews: number; testimonials: number } } = {};

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
    videoUrl?: string;
    videoTitle?: string;
    hasVideo?: boolean;
    eventId?: string;
    videoType?: string;
    docId?: string;
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
  liveEvents: { id: string; name: string }[] = [];
  addVideoSubmitted = false;
  addVideoForm!: FormGroup;
  private addVideoSearchSub: Subscription | null = null;

  // NOTE OVERLAY
  showNoteOverlay = false;
  noteEventIndex: number | null = null;
  noteText = '';

  // SUBSCRIPTIONS
  private participantSearchSub: Subscription | null = null;
  private eventFilterSearchSub: Subscription | null = null;  
  private videoFilterSearchSub: Subscription | null = null;  

  showEditVideoOverlay = false;
  editVideoIndex: number | null = null;
  editVideoDocId: string = '';
  editVideoEventId: string = '';
  editVideoRecordedDate: Date | null = null;
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
  journeyOptions: { id: string; name: string }[] = [];
  selectedJourneyFilters: string[] = [];
  journeyFilterCtrl = new FormControl('');
  filteredJourneys: { id: string; name: string }[] = [];

  summaryStats = {
    totalParticipants: 0,
    totalEvents: 0,
    totalInterviews: 0,
    totalTestimonials: 0, 
  };

  showVideoOverlay = false;
  overlayVideoUrl = '';
  overlayVideoTitle = '';
  activeWatchIndex: string | null = null;
  journeyTypeFilter: 'all' | 'active' | 'last' = 'all';
  showEventFilterDropdown = false;
  selectedEventFilters: string[] = [];
  eventFilterOptions: { id: string; name: string }[] = [];
  eventFilterDropdownTop = 0;
  eventFilterDropdownLeft = 0;
  copiedEventId: string | null = null;
  showVideoFilterDropdown = false;
  selectedVideoFilters: string[] = [];
  videoFilterDropdownTop = 0;
  videoFilterDropdownLeft = 0;
  eventFilterSearchCtrl = new FormControl('');
  filteredEventFilterOptions: { id: string; name: string }[] = [];
  videoFilterSearchCtrl = new FormControl('');
  filteredVideoFilterOptions: { id: string; name: string }[] = [];

  
  constructor(
    private firestore: Firestore,
    private guard: AuthguardService,
    private router: Router,
    private injector: Injector,
    private fb: FormBuilder,
    private ngZone: NgZone

  ) {}

  ngOnInit() {
    this.guard.getRoles().then(async (roles) => {
      this.loggedInProfileId = roles['profile_ref'].id ?? null;
      await this.fetchParticipants();
      this.fetchEventFilterOptions();
      this.fetchRecords();
    });

    // Debounced participant filter search
    this.participantSearchSub = this.participantFilterCtrl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe((search) => {
      this.filterParticipants(search || '');
    });
  }

  ngOnDestroy() {
    this.participantSearchSub?.unsubscribe();
    this.addVideoSearchSub?.unsubscribe();
    this.eventFilterSearchSub?.unsubscribe();  
    this.videoFilterSearchSub?.unsubscribe();  
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

      this.journeyFilterCtrl.valueChanges.pipe(
        debounceTime(200),
        distinctUntilChanged()
      ).subscribe((search) => {
        const lower = (search || '').toLowerCase();
        this.filteredJourneys = this.journeyOptions.filter(j =>
          j.name.toLowerCase().includes(lower)
        );
      });
    }
    this.fetchSummaryStats();
  }

  getJourneyFilteredIds(): string[] {
    if (!this.selectedJourneyFilters.length) return [];
    return Object.entries(this.mapProfiles)
      .filter(([, profile]: [string, any]) =>
        this.selectedJourneyFilters.includes(profile['activejourney']) ||
        this.selectedJourneyFilters.includes(profile['lastcompletedjourney'])
      )
      .map(([id]) => id);
  }

  onParticipantFilterChange() {
  this.resetPagination();
  this.fetchRecords();
}

onJourneyFilterChange() {
  this.resetPagination();
  this.fetchRecords();
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
        // Store by metadataId so HTML row['id'] lookup works correctly
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
      chunks.map((chunk) => getDocs(query( collection(this.firestore, 'participant videos'), where('profileid', 'in', chunk), where('delete', '==', false), orderBy('recordeddate', 'desc') )) ) );
    // Group by profileid 
    const latestByProfile: { [profileid: string]: any } = {};
    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const profileid = d.data()['profileid'];
        const type = d.data()['type'];

        if (profileid) {
          // Keep latest for last video column
          if (!latestByProfile[profileid]) {
            latestByProfile[profileid] = d.data();
          }
          // Count by type
          if (!this.mapVideoCount[profileid]) {
            this.mapVideoCount[profileid] = { events: 0, interviews: 0, testimonials: 0 };
          }
          if (type === 'Event') {
            this.mapVideoCount[profileid].events++;
          } else if (type === 'Interview') {
            this.mapVideoCount[profileid].interviews++;
          } else if (type === 'Testimonial') {
            this.mapVideoCount[profileid].testimonials++;
          }
        }
      });
    });

    // Fetch event names for those that have eventref
    await Promise.all(
      Object.entries(latestByProfile).map(async ([profileid, data]) => {
        let eventName = data['title'] || '—';
        let date: Date | null = null;

        if (data['eventref']?.path) {
          try {
            const eventDoc = await runInInjectionContext(
              this.injector, () => getDoc(data['eventref'])
            );
            if (eventDoc.exists()) {
              eventName = eventDoc.data()['name'] || data['title'] || '—';
            }
          } catch (e) {}
        }

        const rawDate = data['recordeddate'] || null;
        if (rawDate?.toDate) date = rawDate.toDate();
        else if (rawDate) date = new Date(rawDate);

        this.mapLastVideo[profileid] = { eventName, date };
      })
    );
  }

  async fetchSummaryStats() {
    const snap = await getDocs(query(
      collection(this.firestore, 'participant videos'),
      where('delete', '==', false)
    ));

    let events = 0, interviews = 0, testimonials = 0;
    snap.docs.forEach((d) => {
      const type = d.data()['type'];
      if (type === 'Event') events++;
      else if (type === 'Interview') interviews++;
      else if (type === 'Testimonial') testimonials++;
    });

    this.ngZone.run(() => {
      this.summaryStats = {
        totalParticipants: this.participantOptions.length,
        totalEvents: events,
        totalInterviews: interviews,
        totalTestimonials: testimonials,
      };
    });
  }

  // Fetch profile data
  async fetchProfileData(records: any[]) {
    const profileIdSet = new Set<string>();
    records.forEach((r) => {
      if (r['profileid']) profileIdSet.add(r['profileid']);
    });

    if (profileIdSet.size === 0) return;

    const chunks = this.chunkArray([...profileIdSet], 30);
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(query(
          collection(this.firestore, 'profile_data'),
          where('__name__', 'in', chunk)
        ))
      )
    );

    const profileDataMap: any = {};
    snaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        const photo = d.data()['profile'] || null;
        const profileImg = d.data()['profileimg'] || null;
        const resolvedPhoto = photo?.includes('profile-image-png-14') ? null : photo;
        profileDataMap[d.id] = {
          photo: resolvedPhoto || profileImg,
          mobile: (d.data()['countrycode'] || '') + (d.data()['number'] || ''),
        };
      });
    });

    records.forEach((r) => {
      if (r['profileid'] && profileDataMap[r['profileid']]) {
        this.mapProfiles[r.id] = {
          ...this.mapProfiles[r.id],
          ...profileDataMap[r['profileid']],
        };
      }
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



  applyFilters() {
    this.resetPagination();
    this.fetchRecords();
  }

  toggleJourneyTypeFilter() {
    if (this.journeyTypeFilter === 'all') {
      this.journeyTypeFilter = 'active';
    } else if (this.journeyTypeFilter === 'active') {
      this.journeyTypeFilter = 'last';
    } else {
      this.journeyTypeFilter = 'all';
    }
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
    await Promise.all([
      this.fetchProfileData(records),
      this.fetchEventCounts(records),
      this.fetchLastVideos(records),
    ]);
  }

 //pagination
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

  async fetchRecords(startAfterDoc?: any) {
    this.loading = true;

    let selectedIds = this.selectedParticipants.map((p) => p.id);

    // Apply journey filter
    if (this.selectedJourneyFilters.length) {
      const journeyIds = this.getJourneyFilteredIds();
      selectedIds = selectedIds.length > 0
        ? selectedIds.filter(id => journeyIds.includes(id))
        : journeyIds;
    }

    // Apply event filter
    if (this.selectedEventFilters.length) {
      const eventIds = await this.getEventFilteredIds();
      selectedIds = selectedIds.length > 0
        ? selectedIds.filter(id => eventIds.includes(id))
        : eventIds;
    }

    // Apply video filter
    if (this.selectedVideoFilters.length) {
      const videoIds = await this.getVideoFilteredIds();
      selectedIds = selectedIds.length > 0
        ? selectedIds.filter(id => videoIds.includes(id))
        : videoIds;
    }

    const noFilters = !this.selectedParticipants.length &&
                    !this.selectedJourneyFilters.length &&
                    !this.selectedEventFilters.length &&
                    !this.selectedVideoFilters.length;

    if (noFilters) {
      this.executeSingleQuery(this.buildBaseQuery(undefined, startAfterDoc));
      return;
    }

    if (selectedIds.length === 0) {
      this.ngZone.run(() => {
        this.records = [];
        this.totalRecords = 0;
        this.loading = false;
        this.initialLoading = false;
      });
      return;
    }

    if (selectedIds.length <= 30) {
      this.executeSingleQuery(this.buildBaseQuery(selectedIds, startAfterDoc));
      return;
    }

    const chunks = this.chunkArray(selectedIds, 30);
    Promise.all(chunks.map((chunk) => getDocs(this.buildBaseQuery(chunk, startAfterDoc))))
      .then(async (snapshots) => {
        const allDocs = snapshots.flatMap((s) => s.docs);
        allDocs.sort((a, b) =>
          (a.data()['name'] || '').toLowerCase().localeCompare((b.data()['name'] || '').toLowerCase())
        );
        const paginated = allDocs.slice(0, this.pageSize);
        this.records = paginated.map((d) => ({ id: d.id, ...(d.data() as any) }));
        this.resetSupportingMaps();
        await this.fetchSupportingData(this.records);
        this.lastDoc = paginated[paginated.length - 1] || null;
        this.pageCache.set(this.currentPage, paginated as any);
        this.totalRecords = allDocs.length;
        this.ngZone.run(() => {
          this.loading = false;
          this.initialLoading = false;
        });
      });
  }

  private executeSingleQuery(q: any) {
    getDocs(q)
      .then(async (snap) => {
        this.records = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        this.resetSupportingMaps();
        await this.fetchSupportingData(this.records);
        this.lastDoc = snap.docs[snap.docs.length - 1] || null;
        this.pageCache.set(this.currentPage, snap.docs as any);
        // FIX #6 — accurate totalRecords for 3000+ participants
        if (snap.docs.length < this.pageSize) {
          this.totalRecords = this.currentPage * this.pageSize + snap.docs.length;
        } else {
          this.totalRecords = (this.currentPage + 2) * this.pageSize;
        }
        this.ngZone.run(() => {
          this.loading = false;
          this.initialLoading = false;
        });
      })
      .catch((err) => {
        console.error('Error fetching records:', err);
        this.loading = false;
        this.initialLoading = false;
      });
  }

  private resetSupportingMaps() {
    this.mapEventCount = {};
    this.mapLastVideo = {};
    this.mapVideoCount = {};
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
        this.resetSupportingMaps();
        this.fetchSupportingData(this.records);
      } else {
        this.fetchRecords(this.lastDoc);
      }
    } else if (event.pageIndex < this.currentPage) {
      this.currentPage = event.pageIndex;
      const cached = this.pageCache.get(this.currentPage)!;
      this.records = cached.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
      this.lastDoc = cached[cached.length - 1];
      this.resetSupportingMaps();
      this.fetchSupportingData(this.records);
    }
  }

  private resetPagination() {
    this.currentPage = 0;
    this.lastDoc = null;
    this.pageCache.clear();
    this.totalRecords = 0;
  }

  openLog(row: any) {
    this.logParticipantName = row['name'];
    this.logEventCount = this.mapEventCount[row.id] || 0;
    this.logEvents = [];
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
    const eventItems = await Promise.all(
      eventSnap.docs
        .filter((d) => {
          const eventref = d.data()['eventref'];
          return eventref?.path?.startsWith('event collection/');
        })
        .map(async (d) => {
          const data = d.data();
          const eventref = data['eventref'];
          let eventName = 'Unknown Event';
          let date: Date | null = null;

          try {
            const eventDoc = await runInInjectionContext(this.injector, () => getDoc(eventref));
            if (eventDoc.exists()) {
              eventName = eventDoc.data()['name'] || 'Unknown Event';
              const rawDate = eventDoc.data()['start_date'] || null;
              if (rawDate?.toDate) date = rawDate.toDate();
              else if (rawDate) date = new Date(rawDate);
            }
          } catch (e) {}

          const matchedVideos = videoByEventRef[eventref.path] || [];
          const matchedVideo = matchedVideos[0] || null;

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
            extraVideos: matchedVideos.slice(1).map((v: any) => ({
              videoUrl: v['videourl'],
              videoTitle: v['title'] || 'Untitled',
              docId: v['docId'],
              videoType: v['type'] || null,
            })),
          };
        })
    );

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
        docId: v['docId'] || null,

      };
    });

    // Videos with eventref that didn't match any attended event card
    const matchedEventPaths = new Set(eventItems.map(e => (e as any).eventId));
    const unmatchedEventVideos = Object.entries(videoByEventRef)
      .filter(([path]) => !matchedEventPaths.has(path))
      .flatMap(([, videos]) => videos.map((v: any) => {
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
          docId: v['docId'] || null,
          extraVideos: [],
        };
      }));

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

    this.ngZone.run(() => {
      this.logEvents = allItems;
      this.logLoading = false;
    });
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

  showVideoPlayer = false;

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
    });
  }

  openAddVideo() {
    this.addVideoSubmitted = false;
    this.addVideoForm = this.buildAddVideoForm();
    this.addVideoFilteredParticipants = [...this.participantOptions];
    this.showAddVideoOverlay = true;
    this.fetchLiveEvents();

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
    this.fetchLiveEvents();

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

  async fetchLiveEvents() {
    if (this.liveEvents.length > 0) return;
    const snap = await getDocs(
      query(collection(this.firestore, 'event collection'), orderBy('name', 'asc'))
    );
    this.liveEvents = snap.docs.map((d) => ({
      id: d.id,
      name: d.data()['name'] || 'Unnamed Event',
    }));
  }

  async fetchEventFilterOptions() {
    if (this.eventFilterOptions.length > 0) return;
    const snap = await getDocs(
      query(collection(this.firestore, 'event collection'), orderBy('name', 'asc'))
    );
    this.eventFilterOptions = snap.docs.map((d) => ({
      id: d.id,
      name: d.data()['name'] || 'Unnamed Event',
    }));

    this.filteredEventFilterOptions = [...this.eventFilterOptions];
    this.filteredVideoFilterOptions = [...this.eventFilterOptions];

    this.eventFilterSearchSub = this.eventFilterSearchCtrl.valueChanges.pipe(
      debounceTime(200), distinctUntilChanged()
    ).subscribe((search) => {
      const lower = (search || '').toLowerCase();
      this.filteredEventFilterOptions = this.eventFilterOptions.filter(e =>
        e.name.toLowerCase().includes(lower)
      );
    });

    this.videoFilterSearchSub = this.videoFilterSearchCtrl.valueChanges.pipe(
      debounceTime(200), distinctUntilChanged()
    ).subscribe((search) => {
      const lower = (search || '').toLowerCase();
      this.filteredVideoFilterOptions = this.eventFilterOptions.filter(e =>
        e.name.toLowerCase().includes(lower)
      );
    });
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

  async saveVideo() {
    this.addVideoSubmitted = true;
    this.addVideoForm.markAllAsTouched();
    if (!this.addVideoForm.valid) return;

    const formValue = this.addVideoForm.value;
    const participantMetadataId = formValue.participantId;
    const profileid = this.mapProfiles[participantMetadataId]?.['profileid'] || null;

    try {
      await Promise.all(
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
            uploadedon: serverTimestamp(),
            uploadedby: this.loggedInProfileId,
            delete: false,
          });
        })
      );

      this.ngZone.run(() => {
        this.closeAddVideo();
        this.fetchRecords();

      });
    } catch (err) {
      console.error('Error saving video:', err);
    }
  }

  openEditVideo(event: any, i: number) {
    this.editVideoIndex = i;
    this.editVideoDocId = event.docId || '';
    this.editVideoEventId = event.eventId
      ? event.eventId.replace('event collection/', '')
      : '';
    this.editVideoRecordedDate = event.date || null;
    this.showEditVideoOverlay = true;
    this.fetchLiveEvents();
  }

  closeEditVideo() {
    this.showEditVideoOverlay = false;
    this.editVideoIndex = null;
    this.editVideoDocId = '';
    this.editVideoEventId = '';
    this.editVideoRecordedDate = null;
    this.editVideoSaving = false;
  }

  async saveEditVideo() {
    if (!this.editVideoDocId) return;
    this.editVideoSaving = true;

    try {
      const eventRef = this.editVideoEventId
        ? doc(this.firestore, 'event collection', this.editVideoEventId)
        : null;

      await updateDoc(
        doc(this.firestore, 'participant videos', this.editVideoDocId),
        {
          eventref: eventRef,
          recordeddate: this.editVideoRecordedDate
            ? Timestamp.fromDate(new Date(this.editVideoRecordedDate))
            : null,
        }
      );

    this.ngZone.run(() => {
      if (this.editVideoIndex !== null) {
        const updated = [...this.logEvents];
        (updated[this.editVideoIndex] as any)['eventId'] = this.editVideoEventId
          ? `event collection/${this.editVideoEventId}`
          : null;
        updated[this.editVideoIndex].date = this.editVideoRecordedDate;
        this.logEvents = updated;
      }
      this.closeEditVideo();
      this.fetchRecords();
      if (this.currentLogProfileId) {
        this.loadEventLog(this.currentLogProfileId);
      }
    });
    } catch (err) {
      console.error('Error updating video:', err);
      this.editVideoSaving = false;
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
        'Video URL (Required)'
      ],
      ['john@example.com', 'Pre Video', '2026-01-15', 'Event', 'BIG Accelerator', 'https://dropbox.com/video1'],
      ['jane@example.com', 'Interview Jan 2026', '2026-01-20', 'Interview', '', 'https://dropbox.com/video2'],
      ['mark@example.com', 'Testimonial', '2026-02-01', 'Testimonial', 'uP! Live 2025', 'https://dropbox.com/video3'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    ws['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 35 },
      { wch: 40 }, { wch: 45 }, { wch: 40 }
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
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) {
          this.bulkErrorMessages = ['Excel file is empty or has no data rows.'];
          this.showBulkErrorDialog = true;
          this.bulkImportLoading = false;
          return;
        }

        // Skip header row
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell));

        // Fetch all participant metadata emails at once
        const emailMap = await this.buildEmailToParticipantMap();

        // Fetch all events for name matching
        const eventNameMap = await this.buildEventNameMap();

        this.ngZone.run(() => {
        this.bulkPreviewRows = dataRows.map((row) => {
          const email = String(row[0] || '').trim().toLowerCase();
          const title = String(row[1] || '').trim();
          const recordedDateRaw = row[2];
          const type = String(row[3] || '').trim();
          const eventName = String(row[4] || '').trim();
          const videoUrl = String(row[5] || '').trim();

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
          if (!['Event', 'Interview', 'Testimonial'].includes(type)) {
            errors.push(`Type must be Event, Interview or Testimonial (got: "${type}")`);
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
      });

      } catch (err) {
        this.bulkErrorMessages = ['Failed to parse Excel file. Please check the format.'];
        this.showBulkErrorDialog = true;
        this.bulkImportLoading = false;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  private async buildEmailToParticipantMap(): Promise<{
    [email: string]: { name: string; profileid: string; metadataId: string }
  }> {
    const snap = await getDocs(
      collection(this.firestore, 'participant metadata')
    );
    const map: { [email: string]: { name: string; profileid: string; metadataId: string } } = {};
    snap.docs.forEach((d) => {
      const email = (d.data()['email'] || '').toString().trim().toLowerCase();
      if (email) {
        map[email] = {
          name: d.data()['name'] || '',
          profileid: d.data()['profileid'] || '',
          metadataId: d.id,
        };
      }
    });
    return map;
  }

  private async buildEventNameMap(): Promise<{ [name: string]: string }> {
    const snap = await getDocs(collection(this.firestore, 'event collection'));
    const map: { [name: string]: string } = {};
    snap.docs.forEach((d) => {
      const name = (d.data()['name'] || '').toString().trim().toLowerCase();
      if (name) map[name] = d.id;
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
          const eventRef = row.eventId
            ? doc(this.firestore, 'event collection', row.eventId)
            : null;

          const recordedDate = row.recordedDate
            ? Timestamp.fromDate(new Date(row.recordedDate))
            : null;

          return addDoc(collection(this.firestore, 'participant videos'), {
            profileid: row.profileid,
            title: row.title,
            recordeddate: recordedDate,
            type: row.type,
            eventref: eventRef,
            videourl: row.videoUrl,
            uploadedon: serverTimestamp(),
            uploadedby: this.loggedInProfileId,
            delete: false,
          });
        })
      );

    this.ngZone.run(() => {
      this.bulkImportSaving = false;
      this.closeAddVideo();
      this.fetchRecords();
    });
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

}