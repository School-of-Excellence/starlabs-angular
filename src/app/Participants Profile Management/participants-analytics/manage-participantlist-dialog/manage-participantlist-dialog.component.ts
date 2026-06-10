import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatBadgeModule } from '@angular/material/badge';
import { Firestore, collection, addDoc, getDocs, query, updateDoc, arrayUnion, arrayRemove, doc, deleteDoc, getDoc, setDoc, where, orderBy, limit} from '@angular/fire/firestore';
import { Firestore, collection, addDoc, getDocs, query, updateDoc, arrayUnion, arrayRemove, doc, deleteDoc, getDoc, setDoc, where, orderBy, limit} from '@angular/fire/firestore';
import { MatOption, MatSelectModule } from "@angular/material/select";
import { MatTabGroup, MatTab } from "@angular/material/tabs";
import { CreateSegmentsDialogComponent } from "../create-segments-dialog/create-segments-dialog.component";
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatOptionModule } from '@angular/material/core';
import { ProfilePictureComponent } from '../../../ProfilePicture/profile-picture/profile-picture.component';
import {  MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthguardService } from '../../../authguard.service';
import { ActivatedRoute } from '@angular/router';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

interface Profile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface ParticipantList {
  docid: string;
  name: string;
  profileids: string[];
  profiles?: Profile[];
  live?: boolean;
  live?: boolean;
}

interface FilterCriteria {
  searchTerm: string;
  filterType: 'all' | 'profileid' | 'name' | 'email' | 'phone';
}

interface SegmentConflict {
  profileId: string;
  profileName: string;
  segmentIds: string[];
  segmentNames: string[];
}

interface ListConflictSummary {
  count: number;
  conflicts: SegmentConflict[];
}
interface SegmentConflict {
  profileId: string;
  profileName: string;
  segmentIds: string[];
  segmentNames: string[];
}

interface ListConflictSummary {
  count: number;
  conflicts: SegmentConflict[];
}

@Component({
  selector: 'app-manage-participantlist-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatDialogModule,
    MatBadgeModule,
    MatOptionModule,
    MatSelectModule,
    MatTabGroup,
    MatTab,
    FormsModule,
    CreateSegmentsDialogComponent,
    ProfilePictureComponent,
    MatSlideToggleModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './manage-participantlist-dialog.component.html',
  styleUrls: ['./manage-participantlist-dialog.component.css']
})
export class ManageParticipantlistDialogComponent implements OnInit {

  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private _groupedCache: { date: string; logs: any[] }[] = [];
  private _groupedCacheKey = '';
  // participant list logs states
  historyPanelOpen = false;
  logs: any[] = [];
  logsLoading = false;
  logsPage = 0;
  logsPageSize = 15;
  historySearchTerm = '';
  historyFilter = 'all';
  filteredLogs: any[] = [];
  historyDateStart: Date | null = null;
  historyDateEnd: Date | null = null;
  mapUsers: Record<string, string> = {};
  showParticipantsPopup = false;
  participantsPopupProfiles: { index: number; name: string }[] = [];
  participantsPopupSearch = '';

  // Table columns
  displayedColumns: string[] = ['listname', 'participants', 'liveStatus', 'actions'];

  // Data
  participantLists: ParticipantList[] = [];
  filteredParticipantLists: ParticipantList[] = [];
  allProfiles: Profile[] = [];
  selectedList: ParticipantList | null = null;
  availableProfilesForSelected: Profile[] = [];

  // right-side panel search variable
  sidePanelSearchTerm: string = '';

  // Forms
  createListForm!: FormGroup;
  addProfileForm!: FormGroup;
  mergeProfilesForm!: FormGroup;
  filterForm!: FormGroup;

  // Loading states
  loading = false;
  submitting = false;
  updatingList = false;
  
  // UI states
  showCreateForm = false;
  sidePanelOpen = false;

  selectedTabIndex = 0;

  // Validation
  isListNameDuplicate = false;

  // Profile IDs from external source (passed when opening dialog)
  externalProfileIds: string[] = [];

  // Filter states
  isFiltering = false;
  activeFilterType: string = 'all';
  matchedProfiles: Profile[] = [];

  listConflictMap: Map<string, ListConflictSummary> = new Map();
  globalConflictMap: Map<string, SegmentConflict> = new Map();
  private segmentNameMap: Map<string, string> = new Map();

  showConflictDialog = false;

  // demerge states
  showDeMergeNotFoundPopup = false;
  deMergeFoundProfiles: Profile[] = [];
  deMergeNotFoundProfiles: Profile[] = [];
  pendingDeMergeTargetList: ParticipantList | null = null;
   
  // mergeconflictpopup state
  showMergeConflictPopup = false;
  loggedInUser: any = null
  reviewAccess: boolean = false;
  submissionAccess: boolean = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<ManageParticipantlistDialogComponent>,
    private auth: AuthguardService,
    private route: ActivatedRoute,
  ) {
    this.auth.getRoles().then(async roles => {
      if (roles["ah"] || roles["admin"] || roles["developer"]) {
        this.reviewAccess = true;
      }
      else {
        this.reviewAccess = false;
      }
      if (roles['profile_ref'].id === this.route.snapshot.queryParams['profileid']) {
        this.submissionAccess = true
      } else {
        this.submissionAccess = false
      }
      this.loggedInUser = roles['profile_ref'].id
      console.log("profileid from url", this.loggedInUser);
    })

    this.createListForm = this.fb.group({
      listname: ['', [Validators.required, Validators.minLength(3)]]
    });

    this.addProfileForm = this.fb.group({
      profile: [[], [Validators.required]]
    });

    this.mergeProfilesForm = this.fb.group({
      profileids: ['', [Validators.required]]
    });

    // Initialize filter form
    this.filterForm = this.fb.group({
      searchTerm: [''],
      filterType: ['all']
    });

    console.log('Dialog data received:', data);
    // Initialize externalProfileIds from the data passed to the dialog
    if (data && Array.isArray(data)) {
      this.externalProfileIds = data;
    } else if (data && data && Array.isArray(data)) {
      this.externalProfileIds = data;
    }
    console.log('External Profile IDs initialized:', this.externalProfileIds);

    // Subscribe to listname changes for duplicate validation
    this.createListForm.get('listname')?.valueChanges.subscribe((value) => {
      this.checkDuplicateListName(value);
    });

    // Subscribe to filter form changes
    this.filterForm.valueChanges.subscribe((value: FilterCriteria) => {
      this.applyFilter(value);
    });
  }

  ngOnInit(): void {
  this.loadData();
}

  // get list log

onViewParticipants(event : any, log: any): void {
  console.log('i have been clicked')
  // event.stopPropagation();
  // event.preventDefault();

  const rawIds = this.getLogProfiles(log);
  this.participantsPopupProfiles = rawIds.map((pid: string, i: number) => ({
    index: i + 1,
    name: this.getProfileName(pid) || pid
  }));

  this.showParticipantsPopup = true;
}

  get filteredParticipantsPopup() {
    const term = this.participantsPopupSearch.trim().toLowerCase();
    if (!term) return this.participantsPopupProfiles;
    return this.participantsPopupProfiles.filter(p =>
      p.name.toLowerCase().includes(term)
    );
  }

  getLogProfiles(log: any): string[] {
    const meta = log?.metadata || {};
    const ids =
      meta?.current?.added_profiles ||
      meta?.current?.profilelist ||
      meta?.previous?.profilelist ||
      [];
    return Array.isArray(ids) ? ids.filter((id: string) => !!id) : [];
  }

  get totalLogPages() {
    return Math.ceil(this.logs.length / this.logsPageSize);
  }

  toggleHistoryPanel() {
    console.log("toggle calling")
    this.historyPanelOpen = !this.historyPanelOpen;
    if (this.historyPanelOpen && this.logs.length === 0) {
      this.loadLogs();
    }
  }

  closeParticipantsPopup(): void {
    this.showParticipantsPopup = false;
    this.participantsPopupProfiles = [];
    this.participantsPopupSearch = '';
  }

  async loadLogs() {
    this.logsLoading = true;
    this.logsPage = 0;
    try {
      const q = query(
        collection(this.firestore, 'participant_list_log'),
        orderBy('created_date', 'desc'),
        limit(200)
      );
      console.log("log data console")
      const snap = await getDocs(q);
      this.logs = snap.docs
        .map(d => d.data())
        .filter(d => d?.['type'] === 'list');
      this.filteredLogs = [...this.logs];
      console.log('Loaded logs:', this.logs.length);
    } catch (e) {
      console.error('loadLogs error:', e);
    } finally {
      this.logsLoading = false;
    }
  }

setHistoryFilter(f: string): void {
  this.historyFilter = f;
  this.logsPage = 0;
  this.applyHistoryFilter();
}

applyHistoryFilter(): void {
  const term = this.historySearchTerm.trim().toLowerCase();

  let endDate: Date | null = null;
  if (this.historyDateEnd) {
    endDate = new Date(this.historyDateEnd);
    endDate.setHours(23, 59, 59, 999);
  }

  this.filteredLogs = this.logs.filter(log => {
    const typeMatch =
      this.historyFilter === 'all' || log.action_type === this.historyFilter;

    let dateMatch = true;
    if (this.historyDateStart || endDate) {
      const logDate: Date = log.created_date?.toDate?.() ?? new Date(0);
      if (this.historyDateStart && logDate < this.historyDateStart) dateMatch = false;
      if (endDate && logDate > endDate) dateMatch = false;
    }

    let textMatch = true;
    if (term) {
      const desc: string = (
        log.metadata?.description ||
        log.metadata?.current?.description || ''
      ).toLowerCase();

      const listName: string = (
        log.metadata?.current?.listname ||
        log.metadata?.previous?.listname || ''
      ).toLowerCase();

      const profileIds: string[] = [
        ...(log.metadata?.current?.profilelist    || []),
        ...(log.metadata?.previous?.profilelist   || []),
        ...(log.metadata?.current?.added_profiles || []),
      ];
      const profileNamesMatch = profileIds.some(id =>
        this.getProfileName(id).toLowerCase().includes(term)
      );

      textMatch = desc.includes(term) || listName.includes(term) || profileNamesMatch;
    }

    return typeMatch && dateMatch && textMatch;
  });

  this.logsPage = 0;
}

getLogCountByType(type: string): number {
  const term = this.historySearchTerm.trim().toLowerCase();

  let endDate: Date | null = null;
  if (this.historyDateEnd) {
    endDate = new Date(this.historyDateEnd);
    endDate.setHours(23, 59, 59, 999);
  }

  return this.logs.filter(log => {
    if (log.action_type !== type) return false;

    let dateMatch = true;
    if (this.historyDateStart || endDate) {
      const logDate: Date = log.created_date?.toDate?.() ?? new Date(0);
      if (this.historyDateStart && logDate < this.historyDateStart) dateMatch = false;
      if (endDate && logDate > endDate) dateMatch = false;
    }

    let textMatch = true;
    if (term) {
      const desc: string = (
        log.metadata?.description ||
        log.metadata?.current?.description || ''
      ).toLowerCase();
      const listName: string = (
        log.metadata?.current?.listname ||
        log.metadata?.previous?.listname || ''
      ).toLowerCase();
      const profileIds: string[] = [
        ...(log.metadata?.current?.profilelist    || []),
        ...(log.metadata?.previous?.profilelist   || []),
        ...(log.metadata?.current?.added_profiles || []),
      ];
      const profileNamesMatch = profileIds.some(id =>
        this.getProfileName(id).toLowerCase().includes(term)
      );
      textMatch = desc.includes(term) || listName.includes(term) || profileNamesMatch;
    }

    return dateMatch && textMatch;
  }).length;
}

trackByDate(index: number, group: { date: string; logs: any[] }): string {
  return group.date;
}

trackByLog(index: number, log: any): string {
  return log.doc_id || index;
}

get groupedPagedLogs(): { date: string; logs: any[] }[] {
  const paged = this.pagedFilteredLogs;
  const key = `${this.logsPage}-${this.filteredLogs.length}-${paged.length}-${paged[0]?.doc_id ?? ''}`;

  if (key === this._groupedCacheKey) {
    return this._groupedCache;
  }

  this._groupedCacheKey = key;
  const groups: { date: string; logs: any[] }[] = [];
  let currentDate = '';

  for (const log of paged) {
    const d = log.created_date?.toDate?.();
    const label = d ? this.formatDateLabel(d) : 'Unknown date';
    if (label !== currentDate) {
      currentDate = label;
      groups.push({ date: label, logs: [] });
    }
    groups[groups.length - 1].logs.push(log);
  }

  this._groupedCache = groups;
  return this._groupedCache;
}

getFilteredCountForAll(): number {
  const term = this.historySearchTerm.trim().toLowerCase();

  let endDate: Date | null = null;
  if (this.historyDateEnd) {
    endDate = new Date(this.historyDateEnd);
    endDate.setHours(23, 59, 59, 999);
  }

  if (!term && !this.historyDateStart && !endDate) return this.logs.length;

  return this.logs.filter(log => {
    let dateMatch = true;
    if (this.historyDateStart || endDate) {
      const logDate: Date = log.created_date?.toDate?.() ?? new Date(0);
      if (this.historyDateStart && logDate < this.historyDateStart) dateMatch = false;
      if (endDate && logDate > endDate) dateMatch = false;
    }

    let textMatch = true;
    if (term) {
      const desc = (log.metadata?.description || log.metadata?.current?.description || '').toLowerCase();
      const listName = (log.metadata?.current?.listname || log.metadata?.previous?.listname || '').toLowerCase();
      const profileIds: string[] = [
        ...(log.metadata?.current?.profilelist    || []),
        ...(log.metadata?.previous?.profilelist   || []),
        ...(log.metadata?.current?.added_profiles || []),
      ];
      const profileNamesMatch = profileIds.some(id =>
        this.getProfileName(id).toLowerCase().includes(term)
      );
      textMatch = desc.includes(term) || listName.includes(term) || profileNamesMatch;
    }

    return dateMatch && textMatch;
  }).length;
}

getUserName(userId: string): string {
  if (!userId) return '—';
  return this.mapUsers[userId] || userId;
}

get pagedFilteredLogs(): any[] {
  const start = this.logsPage * this.logsPageSize;
  return this.filteredLogs.slice(start, start + this.logsPageSize);
}

formatDateLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const fmt = (dt: Date) => dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (d.toDateString() === today.toDateString()) return `Today · ${fmt(d)}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${fmt(d)}`;
  return fmt(d);
}

getLogItemClass(actionType: string): string {
  const map: Record<string, string> = {
    create: 'hp-item-created',
    delete: 'hp-item-deleted',
    edit: 'hp-item-edited'
  };
  return map[actionType] ?? '';
}

getLogIconClass(actionType: string): string {
  const map: Record<string, string> = {
    create: 'log-icon-created', delete: 'log-icon-deleted', edit: 'log-icon-edited'
  };
  return map[actionType] ?? '';
}

getLogBadgeClass(actionType: string): string {
  const map: Record<string, string> = {
    create: 'badge-created', delete: 'badge-deleted', edit: 'badge-edited'
  };
  return map[actionType] ?? '';
}

getLogExpandClass(actionType: string): string {
  const map: Record<string, string> = {
    create: 'expand-created', edit: 'expand-edited'
  };
  return map[actionType] ?? '';
}

getLogExpandLabelClass(actionType: string): string {
  const map: Record<string, string> = {
    create: 'expand-label-created', edit: 'expand-label-edited'
  };
  return map[actionType] ?? '';
}

getLogLabel(actionType: string): string {
  const map: Record<string, string> = {
    create: 'Created', delete: 'Deleted', edit: 'Edited'
  };
  return map[actionType] ?? actionType;
}

scrollLogTop(): void {
  document.querySelector('.hp-body')?.scrollTo({ top: 0, behavior: 'smooth' });
}

  getLogIcon(actionType: string): string {
    const map: Record<string, string> = {
      edit: 'edit',
      create: 'add_circle',
      delete: 'delete'
    };
    return map[actionType] ?? 'history';
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      await this.loadAllProfiles();
      try {
        const usersSnap = await getDocs(collection(this.firestore, 'profile_data'));
        usersSnap.forEach(d => {
          const data = d.data() as any;
          const name = data['name'] || data['email'] || d.id;
          if (data['profileid']) this.mapUsers[data['profileid']] = name;
          this.mapUsers[d.id] = name;
        });
      } catch (e) {
        console.warn('Could not load users for name resolution', e);
      }
      await this.loadParticipantLists();
      this.filteredParticipantLists = [...this.participantLists];
      await this.computeLiveSegmentConflicts();
    } catch (error) {
      console.error('Error loading data:', error);
      this.snackBar.open('Error loading data', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  openConflictDialog(): void {
    this.showConflictDialog = true;
  }

  closeConflictDialog(): void {
    this.showConflictDialog = false;
  }

  getAllConflictsForDialog(): SegmentConflict[] {
    const conflicts: SegmentConflict[] = [];
    this.globalConflictMap.forEach(conflict => conflicts.push(conflict));
    return conflicts;
  }

  async loadAllProfiles(): Promise<void> {
    try {
      const profilesRef = collection(this.firestore, 'profile_data');
      const profilesSnapshot = await getDocs(profilesRef);

      this.allProfiles = profilesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data()['name'] || doc.data()['displayName'] || 'Unnamed',
        email: doc.data()['email'] || '',
        phone: doc.data()['phone'] || doc.data()['phoneNumber'] || doc.data()['mobile'] || '',
      }));

      console.log('All profiles loaded:', this.allProfiles.length);
    } catch (error) {
      console.error('Error loading profiles:', error);
      throw error;
    }
  }

  async loadParticipantLists(): Promise<void> {
  try {
    const listsRef = collection(this.firestore, 'participant list');
    const listsSnapshot = await getDocs(query(listsRef));

    this.participantLists = await Promise.all(
      listsSnapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        const profileids = data['profilelist'] || [];

          // Fetch profile details for each profile ID
        const profiles = profileids.map((id: string) =>
          this.allProfiles.find(p => p.id === id)
        ).filter((p: Profile | undefined) => p !== undefined) as Profile[];

        return {
          docid: docSnapshot.id,
          name: data['listname'],
          profileids: profileids,
          profiles: profiles,
          segmentid: data['segmentid'] || [],
          live: data['live'] ?? false   
        };
      })
    );

      // Update filtered list
    this.filteredParticipantLists = [...this.participantLists];
    this.sortListsLiveFirst();
    console.log('Participant lists loaded:', this.participantLists.length);
  } catch (error) {
    console.error('Error loading participant lists:', error);
    throw error;
  }
}

  private sortListsLiveFirst(): void {
    const sort = (arr: ParticipantList[]) =>
      [...arr].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
    this.participantLists = sort(this.participantLists);
    this.filteredParticipantLists = sort(this.filteredParticipantLists);
  }

  async computeLiveSegmentConflicts(): Promise<void> {
  this.globalConflictMap.clear();
  this.listConflictMap.clear();
  this.segmentNameMap.clear();

  try {
    const now = new Date();
    const queueSnap = await getDocs(collection(this.firestore, 'queue generation'));

    const liveQueueIds: string[] = [];
    queueSnap.docs.forEach(d => {
      const data = d.data();
      const start: Date = data['queuestartdate']?.toDate?.() ?? null;
      const end: Date   = data['queueenddate']?.toDate?.() ?? null;
      if (start && end && start <= now && end >= now) liveQueueIds.push(d.id);
    });

    const liveSegmentIds = new Set<string>();
    if (liveQueueIds.length > 0) {
      await Promise.all(liveQueueIds.map(async queueId => {
        const planSnap = await getDocs(
          query(collection(this.firestore, 'queue planning'), where('queueid', '==', queueId))
        );
        planSnap.docs.forEach(planDoc => {
          const planning: any[] = planDoc.data()['planning'] || [];
          planning.forEach(variation => {
            (variation.segments || []).forEach((seg: any) => {
              if (seg.segmentid) liveSegmentIds.add(seg.segmentid);
            });
          });
        });
      }));
    }
    const liveListMeta = new Map<string, string>();

    if (liveSegmentIds.size > 0) {
      await Promise.all(Array.from(liveSegmentIds).map(async segmentId => {
        const segDoc = await getDoc(doc(this.firestore, 'segments', segmentId));
        if (!segDoc.exists()) return;
        const segData = segDoc.data();
        const segmentName: string = segData['segmentname'] || segmentId;
        this.segmentNameMap.set(segmentId, segmentName);
        const participantListIds: string[] = segData['participantlistid'] || [];
        participantListIds.forEach(listId => {
          if (!liveListMeta.has(listId)) liveListMeta.set(listId, segmentName);
        });
      }));
    }

    this.participantLists.forEach(list => {
  if (list.live === true && !liveListMeta.has(list.docid)) {
    liveListMeta.set(list.docid, list.name);
  }
});

    if (liveListMeta.size === 0) return;

    const profileToLiveLists = new Map<string, { listId: string; listName: string; label: string }[]>();

    await Promise.all(Array.from(liveListMeta.entries()).map(async ([listId, label]) => {
      const listDoc = await getDoc(doc(this.firestore, 'participant list', listId));
      if (!listDoc.exists()) return;
      const listName = this.participantLists.find(l => l.docid === listId)?.name || listId;
      const profileIds: string[] = listDoc.data()['profilelist'] || [];
      profileIds.forEach(profileId => {
        if (!profileToLiveLists.has(profileId)) profileToLiveLists.set(profileId, []);
        profileToLiveLists.get(profileId)!.push({ listId, listName, label });
      });
    }));

    profileToLiveLists.forEach((entries, profileId) => {
      if (entries.length > 1) {
        const profileName = this.allProfiles.find(p => p.id === profileId)?.name || profileId;
        this.globalConflictMap.set(profileId, {
          profileId,
          profileName,
          segmentIds: entries.map(e => e.listId),
          segmentNames: entries.map(e => e.listName)
        });
      }
    });

    this.participantLists.forEach(list => {
      if (!liveListMeta.has(list.docid)) return;
      const conflicts: SegmentConflict[] = [];
      list.profileids.forEach(profileId => {
        const conflict = this.globalConflictMap.get(profileId);
        if (conflict) conflicts.push(conflict);
      });
      if (conflicts.length > 0) {
        this.listConflictMap.set(list.docid, { count: conflicts.length, conflicts });
      }
    });

  } catch (error) {
    console.error('Error computing live segment conflicts:', error);
  }
}
  getListConflicts(listDocId: string): ListConflictSummary | null {
    return this.listConflictMap.get(listDocId) ?? null;
  }
  isProfileConflicting(profileId: string): boolean {
    return this.globalConflictMap.has(profileId);
  }
  getProfileConflict(profileId: string): SegmentConflict | null {
    return this.globalConflictMap.get(profileId) ?? null;
  }
  getConflictTooltip(profileId: string): string {
    const conflict = this.globalConflictMap.get(profileId);
    if (!conflict) return '';
    return `In ${conflict.segmentNames.length} live segments: ${conflict.segmentNames.join(', ')}`;
  }
  getListConflictTooltip(listDocId: string): string {
    const summary = this.listConflictMap.get(listDocId);
    if (!summary) return '';
    const names = summary.conflicts.slice(0, 5).map(c => c.profileName).join(', ');
    const extra = summary.conflicts.length > 5 ? ` +${summary.conflicts.length - 5} more` : '';
    return `${summary.count} participant(s) in multiple live segments: ${names}${extra}`;
  }
  getConflictsForSelectedList(): SegmentConflict[] {
    if (!this.selectedList) return [];
    return this.listConflictMap.get(this.selectedList.docid)?.conflicts ?? [];
  }
  async removeConflictingProfile(profileId: string): Promise<void> {
    if (!this.selectedList) return;
    const conflict = this.globalConflictMap.get(profileId);
    const segNames = conflict?.segmentNames.join(', ') ?? '';
    if (!confirm(
      `Remove "${conflict?.profileName ?? profileId}" from list "${this.selectedList.name}"?\n\n` +
      `This participant appears in these live segments: ${segNames}`
    )) return;
    await this.removeProfileFromList(profileId);
    await this.computeLiveSegmentConflicts();
  }
  // Filter functionality
  applyFilter(criteria: FilterCriteria): void {
    const searchTerm = criteria.searchTerm?.trim().toLowerCase() || '';
    this.activeFilterType = criteria.filterType;

    if (!searchTerm) {
      // No search term - show all lists
      this.filteredParticipantLists = [...this.participantLists];
      this.isFiltering = false;
      this.matchedProfiles = [];
      return;
    }

    this.isFiltering = true;

    // First, find profiles that match the search criteria
    this.matchedProfiles = this.allProfiles.filter(profile => {
      switch (criteria.filterType) {
        case 'profileid':
          return profile.id.toLowerCase().includes(searchTerm);
        case 'name':
          return profile.name.toLowerCase().includes(searchTerm);
        case 'email':
          return profile.email?.toLowerCase().includes(searchTerm) || false;
        case 'phone':
          return profile.phone?.toLowerCase().includes(searchTerm) || false;
        case 'all':
        default:
          return profile.id.toLowerCase().includes(searchTerm) ||
                 profile.name.toLowerCase().includes(searchTerm) ||
                 (profile.email?.toLowerCase().includes(searchTerm) || false) ||
                 (profile.phone?.toLowerCase().includes(searchTerm) || false);
      }
    });

    const matchedProfileIds = new Set(this.matchedProfiles.map(p => p.id));

    // Filter participant lists that contain any of the matched profiles
    this.filteredParticipantLists = this.participantLists.filter(list => {
      return list.profileids.some(profileId => matchedProfileIds.has(profileId));
    });

    this.sortListsLiveFirst();
    console.log(`Filter applied: ${this.matchedProfiles.length} profiles matched, ${this.filteredParticipantLists.length} lists found`);
  }

  clearFilter(): void {
    this.filterForm.reset({ searchTerm: '', filterType: 'all' });
    this.filteredParticipantLists = [...this.participantLists];
    this.isFiltering = false;
    this.matchedProfiles = [];
  }

  // Get matched profiles count for a specific list
  getMatchedProfilesInList(list: ParticipantList): Profile[] {
    if (!this.isFiltering || this.matchedProfiles.length === 0) {
      return [];
    }
    const matchedIds = new Set(this.matchedProfiles.map(p => p.id));
    return (list.profiles || []).filter(p => matchedIds.has(p.id));
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (!this.showCreateForm) {
      this.createListForm.reset();
      this.isListNameDuplicate = false;
    }
  }

  // Check if list name already exists
  checkDuplicateListName(listName: string): void {
    if (!listName || listName.trim().length === 0) {
      this.isListNameDuplicate = false;
      return;
    }

    const trimmedName = listName.trim().toLowerCase();
    this.isListNameDuplicate = this.participantLists.some(
      list => list.name.toLowerCase() === trimmedName
    );
  }

  // Method to set external profile IDs (called from parent or dialog)
  setExternalProfileIds(profileIds: string[]): void {
    this.externalProfileIds = profileIds;
    console.log('External profile IDs updated:', this.externalProfileIds);
  }

  async onCreateList(): Promise<void> {
    if (this.createListForm.invalid || this.isListNameDuplicate) {
      this.createListForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const formValue = this.createListForm.value;

    try {
      // Create participant list document
      const listsRef = doc(collection(this.firestore, 'participant list'));
      const listData = {
        listname: formValue.listname.trim(),
        profilelist: this.externalProfileIds.map((e) => e['profileid']) || [],
        createddate: new Date().toISOString(),
        docid: listsRef.id,
        live: false
      };

      await setDoc(listsRef, listData);
      // add activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'create',
        created_date: new Date(),
        type: 'list',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'participant list', listsRef.id),
        metadata: {
          current: { listname: listData.listname, profilelist: listData.profilelist, live: false },
          description: `Created participant list "${listData.listname}" with ${listData.profilelist.length} profile(s).`
        }
      });
      console.log("activity log added")

      this.snackBar.open(
        `Participant list "${formValue.listname}" created successfully with ${this.externalProfileIds.length} profile(s)!`,
        'Close',
        { duration: 3000 }
      );

      this.createListForm.reset();
      this.showCreateForm = false;
      this.isListNameDuplicate = false;
      await this.loadParticipantLists();
      await this.computeLiveSegmentConflicts();
      // Re-apply filter if active
      if (this.isFiltering) {
        this.applyFilter(this.filterForm.value);
      }
    } catch (error) {
      console.error('Error creating participant list:', error);
      this.snackBar.open('Error creating participant list. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.submitting = false;
    }
  }

  async toggleListLive(list: ParticipantList, event: any): Promise<void> {
    const newLiveValue = !list.live;

    if (newLiveValue === true) {
      const confirmed = confirm(
        `Make "${list.name}" live?\nThis list will be marked as live List.`
      );
      if (!confirmed) {
        event.source.checked = false;
        return;
      }
    }

    try {
      await updateDoc(doc(this.firestore, 'participant list', list.docid), {
        live: newLiveValue,
        updateddate: new Date()
      });

      // add  activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'list',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'participant list', list.docid),
        metadata: {
          previous: { live: list.live },
          current: { live: newLiveValue },
          description: `Changed live status of "${list.name}" from ${list.live} to ${newLiveValue}.`
        }
      });

      list.live = newLiveValue;

      const filtered = this.filteredParticipantLists.find(l => l.docid === list.docid);
      if (filtered) filtered.live = newLiveValue;

      this.sortListsLiveFirst();

      if (this.selectedList?.docid === list.docid) {
        this.selectedList.live = newLiveValue;
      }

      this.snackBar.open(
        `"${list.name}" is now ${newLiveValue ? 'Live' : 'Unlive'}`,
        'Close', { duration: 2000 }
      );

      await this.computeLiveSegmentConflicts();

    } catch (error) {
      console.error('Error updating live status:', error);
      this.snackBar.open('Error updating live status', 'Close', { duration: 3000 });
      event.source.checked = list.live;
    }
  }

  getFilteredParticipants(): Profile[] {
    if (!this.selectedList?.profiles) return [];
    const term = this.sidePanelSearchTerm.trim().toLowerCase();
    if (!term) return this.selectedList.profiles;
    return this.selectedList.profiles.filter(p =>
      p.name?.toLowerCase().includes(term)
    );
  }

  onSelectList(list: ParticipantList): void {
    this.selectedList = list;
    this.sidePanelOpen = true;
    this.updateAvailableProfiles();
    this.addProfileForm.reset();
    console.log('List selected:', list);
  }

  updateAvailableProfiles(): void {
    if (!this.selectedList) {
      this.availableProfilesForSelected = [];
      return;
    }

    const currentProfileIds = this.selectedList.profileids || [];
    this.availableProfilesForSelected = this.allProfiles.filter(
      profile => !currentProfileIds.includes(profile.id)
    );
    console.log('Available profiles for selected list:', this.availableProfilesForSelected.length);
  }

  closeSidePanel(): void {
    this.sidePanelOpen = false;
    this.selectedList = null;
    this.sidePanelSearchTerm = ''; 
    this.addProfileForm.reset();
    this.mergeProfilesForm.reset();
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  async removeProfileFromList(profileId: string): Promise<void> {
    if (!this.selectedList) return;

    if (!confirm('Are you sure you want to remove this profile from the list?')) {
      return;
    }

    this.updatingList = true;
    try {
      const previousProfileIds = [...(this.selectedList.profileids || [])];
      const removedProfile = this.allProfiles.find(p => p.id === profileId);
      // Update participant list document
      await updateDoc(doc(this.firestore, 'participant list', this.selectedList.docid), {
        profilelist: arrayRemove(profileId),
        updateddate: new Date()
      });

      // Add to activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'list',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'participant list', this.selectedList.docid),
        metadata: {
          previous: { profilelist: previousProfileIds },
          current: { profilelist: previousProfileIds.filter(id => id !== profileId) },
          description: `Removed profile "${removedProfile?.name || profileId}" from list "${this.selectedList.name}".`
        }
      });

      this.snackBar.open('Profile removed successfully', 'Close', { duration: 3000 });
      await this.loadParticipantLists();
      await this.computeLiveSegmentConflicts();

      // Re-apply filter if active
      if (this.isFiltering) {
        this.applyFilter(this.filterForm.value);
      }

      // Update selected list
      const updatedList = this.participantLists.find(l => l.docid === this.selectedList?.docid);
      if (updatedList) {
        this.selectedList = updatedList;
        this.updateAvailableProfiles();
      } else {
        this.closeSidePanel();
      }
    } catch (error) {
      console.error('Error removing profile:', error);
      this.snackBar.open('Error removing profile', 'Close', { duration: 3000 });
    } finally {
      this.updatingList = false;
    }
  }

  async addProfileToList(): Promise<void> {
    if (this.addProfileForm.invalid || !this.selectedList) {
      return;
    }

    const profileId = this.addProfileForm.value.profile;
    console.log(profileId);

    this.updatingList = true;
    try {
      // Update participant list document
      await updateDoc(doc(this.firestore, 'participant list', this.selectedList.docid), {
        profilelist: arrayUnion([profileId]),
        updateddate: new Date()
      });

      this.snackBar.open('Profile added successfully', 'Close', { duration: 3000 });
      this.addProfileForm.reset();
      await this.loadParticipantLists();
      await this.computeLiveSegmentConflicts();

      // Re-apply filter if active
      if (this.isFiltering) {
        this.applyFilter(this.filterForm.value);
      }

      // Update selected list
      const updatedList = this.participantLists.find(l => l.docid === this.selectedList?.docid);
      if (updatedList) {
        this.selectedList = updatedList;
        this.updateAvailableProfiles();
      }
    } catch (error) {
      console.error('Error adding profile:', error);
      this.snackBar.open('Error adding profile', 'Close', { duration: 3000 });
    } finally {
      this.updatingList = false;
    }
  }

  async mergeProfiles(list: ParticipantList, event: Event): Promise<void> {
  event.stopPropagation();
 
  if (!this.externalProfileIds || this.externalProfileIds.length === 0) {
    this.snackBar.open('No profile IDs available to merge', 'Close', { duration: 3000 });
    return;
  }
 
  const profileIdsToMerge = this.externalProfileIds.filter(
    id => !list.profileids.includes(id['profileid'] || id)
  );
 
  if (profileIdsToMerge.length === 0) {
    this.snackBar.open('All profile IDs are already in this list', 'Close', { duration: 3000 });
    return;
  }
 
  this.loading = true;
  let conflicts: Awaited<ReturnType<typeof this.getMergeConflicts>> = [];
  try {
    conflicts = await this.getMergeConflicts(profileIdsToMerge, list);
  } catch (e) {
    console.error('Error checking merge conflicts:', e);
  } finally {
    this.loading = false;
  }
 
  if (conflicts.length > 0) {
    this.pendingMergeTargetList = list;
    this.pendingMergeProfileIds = profileIdsToMerge;
    this.mergeConflicts = conflicts;
    this.selectedMergeConflictIds = new Set(conflicts.map(c => c.profileId));
    this.showMergeConflictPopup = true;
    return; 
  }

  if (!confirm(`Merge ${profileIdsToMerge.length} profile(s) into "${list.name}"?`)) return;
  await this.executeMerge(list, profileIdsToMerge, []);
}

async confirmMergeWithSelection(): Promise<void> {
  if (!this.pendingMergeTargetList) return;

  const uncheckedConflictIds = new Set(
    this.mergeConflicts
      .filter(c => !this.selectedMergeConflictIds.has(c.profileId))
      .map(c => c.profileId)
  );

  const profileIdsToActuallyMerge = this.pendingMergeProfileIds.filter(idObj => {
    const rawId = idObj['profileid'] || idObj;
    return !uncheckedConflictIds.has(rawId);
  });

  const conflictsToRemove: { profileId: string; conflictingListId: string; profileName: string; conflictingListName: string; segmentName: string }[] = [];
  this.mergeConflicts
    .filter(c => this.selectedMergeConflictIds.has(c.profileId))
    .forEach(c => {
      c.conflictingLists.forEach(cl => {
        conflictsToRemove.push({
          profileId: c.profileId,
          profileName: c.profileName,
          conflictingListId: cl.listId,
          conflictingListName: cl.listName,
          segmentName: cl.segmentName
        });
      });
    });

  this.showMergeConflictPopup = false;
  await this.executeMerge(
    this.pendingMergeTargetList,
    profileIdsToActuallyMerge,
    conflictsToRemove
  );

  this.mergeConflicts = [];
  this.selectedMergeConflictIds = new Set();
  this.pendingMergeTargetList = null;
  this.pendingMergeProfileIds = [];
}

private async executeMerge(
  list: ParticipantList,
  profileIdsToMerge: any[],
  conflictsToRemove: {
    profileId: string;
    conflictingListId: string;
    profileName: string;
    conflictingListName: string;
    segmentName: string;
  }[]
): Promise<void> {
  this.loading = true;
  try {
    if (conflictsToRemove.length > 0) {
      const removalsByList = new Map<string, string[]>();
      conflictsToRemove.forEach(c => {
        if (!removalsByList.has(c.conflictingListId)) {
          removalsByList.set(c.conflictingListId, []);
        }
        removalsByList.get(c.conflictingListId)!.push(c.profileId);
      });
 
      await Promise.all(
        Array.from(removalsByList.entries()).map(async ([listId, profileIds]) => {
          const listRef = doc(this.firestore, 'participant list', listId);
          for (const profileId of profileIds) {
            await updateDoc(listRef, {
              profilelist: arrayRemove(profileId),
              updateddate: new Date()
            });
          }
        })
      );

      // add activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'list',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'participant list', list.docid),
        metadata: {
          current: { added_profiles: profileIdsToMerge.map(p => p['profileid'] || p) },
          description: `Merged ${profileIdsToMerge.length} profile(s) into list "${list.name}".`
        }
      });
      console.log("activity log added")

 
      this.snackBar.open(
        `Removed ${conflictsToRemove.length} participant(s) from their previous live segment list(s).`,
        'Close', { duration: 3000 }
      );
    }
 
    if (profileIdsToMerge.length === 0) {
      this.snackBar.open(
        'No profiles were merged',
        'Close', { duration: 4000 }
      );
      return;
    }
 
    const listRef = doc(this.firestore, 'participant list', list.docid);
    for (const profileId of profileIdsToMerge) {
      await updateDoc(listRef, {
        profilelist: arrayUnion(profileId['profileid'] || profileId),
        updateddate: new Date()
      });
    }

    // add activity log
    const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'list',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'participant list', list.docid),
        metadata: {
          current: { added_profiles: profileIdsToMerge.map(p => p['profileid'] || p) },
          description: `Merged ${profileIdsToMerge.length} profile(s) into list "${list.name}".`
        }
      });
      console.log("activity log added")
 
    this.snackBar.open(
      `Successfully merged ${profileIdsToMerge.length} profile(s) into "${list.name}"`,
        'Close',
        { duration: 3000 }
    );
 
    await this.loadParticipantLists();
    await this.computeLiveSegmentConflicts();
 
    if (this.isFiltering) {
      this.applyFilter(this.filterForm.value);
    }
 
    if (this.selectedList?.docid === list.docid) {
      const updatedList = this.participantLists.find(l => l.docid === list.docid);
      if (updatedList) {
        this.selectedList = updatedList;
        this.updateAvailableProfiles();
      }
    }
  } catch (error) {
    console.error('Error merging profiles:', error);
    this.snackBar.open('Error merging profiles', 'Close', { duration: 3000 });
  } finally {
    this.loading = false;
  }
}

mergeConflicts: {
  profileId: string;
  profileName: string;
  conflictingLists: { listId: string; listName: string; segmentName: string }[];
}[] = [];
selectedMergeConflictIds = new Set<string>();
pendingMergeTargetList: ParticipantList | null = null;
pendingMergeProfileIds: any[] = [];  
 
cancelMergeConflictPopup(): void {
  this.showMergeConflictPopup = false;
  this.mergeConflicts = [];
  this.selectedMergeConflictIds.clear();
  this.pendingMergeTargetList = null;
  this.pendingMergeProfileIds = [];
}
 
toggleMergeConflictSelection(profileId: string): void {
  if (this.selectedMergeConflictIds.has(profileId)) {
    this.selectedMergeConflictIds.delete(profileId);
  } else {
    this.selectedMergeConflictIds.add(profileId);
  }
  this.selectedMergeConflictIds = new Set(this.selectedMergeConflictIds);
}
 
allMergeConflictsSelected(): boolean {
  return (
    this.mergeConflicts.length > 0 &&
    this.mergeConflicts.every(c => this.selectedMergeConflictIds.has(c.profileId))
  );
}
 
someMergeConflictsSelected(): boolean {
  return (
    this.selectedMergeConflictIds.size > 0 &&
    !this.allMergeConflictsSelected()
  );
}
 
toggleAllMergeConflicts(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  if (checked) {
    this.selectedMergeConflictIds = new Set(this.mergeConflicts.map(c => c.profileId));
  } else {
    this.selectedMergeConflictIds.clear();
    this.selectedMergeConflictIds = new Set();
  }
}

  async deleteList(list: ParticipantList, event: Event): Promise<void> {
    event.stopPropagation();
    console.log(list);
    
    if (!confirm(`Are you sure you want to delete participant list "${list.name}"?`)) {
      return;
    }

    this.loading = true;
    try {

      if(list['segmentid'].length > 0){
        for (let i = 0; i < list['segmentid'].length; i++) {
          const segmentDocid = list['segmentid'][i];
          await updateDoc(doc(this.firestore, 'segments', segmentDocid), { participantlistid: arrayRemove(list.docid) })
        }
      }

      const previousData = { listname: list.name, profilelist: [...list.profileids], live: list.live ?? false };

      // Delete participant list document
      await deleteDoc(doc(this.firestore, 'participant list', list.docid));

      // Add to activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'delete',
        created_date: new Date(),
        type: 'list',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'participant list', list.docid),
        metadata: {
          previous: previousData,
          description: `Deleted participant list "${list.name}".`
        }
      });

      this.snackBar.open('Participant list deleted successfully', 'Close', { duration: 3000 });

      if (this.selectedList?.docid === list.docid) {
        this.closeSidePanel();
      }

      await this.loadParticipantLists();
      await this.computeLiveSegmentConflicts();

      // Re-apply filter if active
      if (this.isFiltering) {
        this.applyFilter(this.filterForm.value);
      }
    } catch (error) {
      console.error('Error deleting list:', error);
      this.snackBar.open('Error deleting participant list', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  getErrorMessage(fieldName: string, form: FormGroup): string {
    const control = form.get(fieldName);
    if (control?.hasError('required')) {
      return `${fieldName === 'listname' ? 'List name' : 'Profile'} is required`;
    }
    if (control?.hasError('minlength')) {
      return 'List name must be at least 3 characters';
    }
    return '';
  }

  getProfileName(profileId: string): string {
    const profile = this.allProfiles.find(p => p.id === profileId);
    return profile ? profile.name : 'Unknown';
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
  }

  hasExternalProfiles(): boolean {
    return this.externalProfileIds && this.externalProfileIds.length > 0;
  }

  getMergeableProfileCount(list: ParticipantList): number {
    if (!this.externalProfileIds || this.externalProfileIds.length === 0) {
      return 0;
    }
    return this.externalProfileIds.filter(id => !list.profileids.includes(id)).length;
  }

  getFilterTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'all': 'All Fields',
      'profileid': 'Profile ID',
      'name': 'Name',
      'email': 'Email',
      'phone': 'Phone'
    };
    return labels[type] || 'All Fields';
  }

  filterProfile(profileid){
    return this.matchedProfiles.some(p => p.id === profileid)
  }

  async getMergeConflicts(profileIdsToMerge: any[], targetList: ParticipantList): Promise<{
  profileId: string;
  profileName: string;
  conflictingLists: { listId: string; listName: string; segmentName: string }[];
}[]> {
  const now = new Date();

  const queueSnap = await getDocs(collection(this.firestore, 'queue generation'));
  const liveQueueIds: string[] = [];
  queueSnap.docs.forEach(d => {
    const data = d.data();
    const start: Date = data['queuestartdate']?.toDate?.() ?? null;
    const end: Date = data['queueenddate']?.toDate?.() ?? null;
    if (start && end && start <= now && end >= now) liveQueueIds.push(d.id);
  });

  const liveSegmentIds = new Set<string>();
  if (liveQueueIds.length > 0) {
    await Promise.all(liveQueueIds.map(async queueId => {
      const planSnap = await getDocs(
        query(collection(this.firestore, 'queue planning'), where('queueid', '==', queueId))
      );
      planSnap.docs.forEach(planDoc => {
        const planning: any[] = planDoc.data()['planning'] || [];
        planning.forEach(variation => {
          (variation.segments || []).forEach((seg: any) => {
            if (seg.segmentid) liveSegmentIds.add(seg.segmentid);
          });
        });
      });
    }));
  }

  const liveListMeta = new Map<string, string>();

  if (liveSegmentIds.size > 0) {
    await Promise.all(Array.from(liveSegmentIds).map(async segmentId => {
      const segDoc = await getDoc(doc(this.firestore, 'segments', segmentId));
      if (!segDoc.exists()) return;
      const segData = segDoc.data();
      const segmentName: string = segData['segmentname'] || segmentId;
      const listIds: string[] = segData['participantlistid'] || [];
      listIds.forEach(listId => {
        if (listId !== targetList.docid) liveListMeta.set(listId, segmentName);
      });
    }));
  }

  this.participantLists.forEach(list => {
  if (list.live === true && list.docid !== targetList.docid && !liveListMeta.has(list.docid)) {
    liveListMeta.set(list.docid, list.name);
  }
});

  if (liveListMeta.size === 0) return [];

  const profileConflictMap = new Map<string, { listId: string; listName: string; segmentName: string }[]>();

  await Promise.all(Array.from(liveListMeta.entries()).map(async ([listId, segmentName]) => {
    const listDoc = await getDoc(doc(this.firestore, 'participant list', listId));
    if (!listDoc.exists()) return;
    const existingProfiles: string[] = listDoc.data()['profilelist'] || [];
    const listName = this.participantLists.find(l => l.docid === listId)?.name || listId;
    for (const profileIdObj of profileIdsToMerge) {
  const rawId = profileIdObj['profileid'] || profileIdObj;
  if (existingProfiles.includes(rawId)) {
    if (!profileConflictMap.has(rawId)) profileConflictMap.set(rawId, []);
    const existing = profileConflictMap.get(rawId)!;
    // Only add if this listId not already present
    if (!existing.some(e => e.listId === listId)) {
      existing.push({ listId, listName, segmentName });
    }
  }
}
  }));

  return Array.from(profileConflictMap.entries()).map(([profileId, conflictingLists]) => ({
    profileId,
    profileName: this.allProfiles.find(p => p.id === profileId)?.name || profileId,
    conflictingLists
  }));
}

// demerge
getDeMergeableProfileCount(list: ParticipantList): number {
  if (!this.externalProfileIds || this.externalProfileIds.length === 0) return 0;
  return this.externalProfileIds.filter(idObj => {
    const rawId = idObj['profileid'] ?? idObj;
    return list.profileids.includes(rawId);
  }).length;
}

async deMergeProfiles(list: ParticipantList, event: Event): Promise<void> {
  event.stopPropagation();

  if (!this.externalProfileIds || this.externalProfileIds.length === 0) {
    this.snackBar.open('No profiles selected to de-merge', 'Close', { duration: 3000 });
    return;
  }

  this.pendingDeMergeTargetList = list;
  this.deMergeFoundProfiles = [];
  this.deMergeNotFoundProfiles = [];

  for (const idObj of this.externalProfileIds) {
    const rawId = idObj['profileid'] ?? idObj;
    const profile: Profile = this.allProfiles.find(p => p.id === rawId)
      ?? { id: rawId, name: rawId };

    if (list.profileids.includes(rawId)) {
      this.deMergeFoundProfiles.push(profile);
    } else {
      this.deMergeNotFoundProfiles.push(profile);
    }
  }

  console.log('De-merge found:', this.deMergeFoundProfiles.length, 
              'not found:', this.deMergeNotFoundProfiles.length);

  if (this.deMergeFoundProfiles.length === 0) {
    // None are in the list — show popup to inform
    this.showDeMergeNotFoundPopup = true;
    return;
  }

  if (this.deMergeNotFoundProfiles.length > 0) {
    // Some missing, some present — show popup
    this.showDeMergeNotFoundPopup = true;
    return;
  }

  // All profiles are present — remove directly without popup
  await this.executeDeMerge(list, this.deMergeFoundProfiles);
  this.cancelDeMergePopup();
}

async confirmDeMerge(): Promise<void> {
  if (!this.pendingDeMergeTargetList) return;
  this.showDeMergeNotFoundPopup = false;
  await this.executeDeMerge(this.pendingDeMergeTargetList, this.deMergeFoundProfiles);
  this.cancelDeMergePopup();
}

cancelDeMergePopup(): void {
  this.showDeMergeNotFoundPopup = false;
  this.deMergeFoundProfiles = [];
  this.deMergeNotFoundProfiles = [];
  this.pendingDeMergeTargetList = null;
}

private async executeDeMerge(list: ParticipantList, profilesToRemove: Profile[]): Promise<void> {
  if (profilesToRemove.length === 0) {
    this.snackBar.open('None of the selected profiles are in this list', 'Close', { duration: 3000 });
    return;
  }

  this.loading = true;
  try {
    const listRef = doc(this.firestore, 'participant list', list.docid);
    for (const profile of profilesToRemove) {
      await updateDoc(listRef, {
        profilelist: arrayRemove(profile.id),
        updateddate: new Date()
      });
    }

    this.snackBar.open(
      `Removed ${profilesToRemove.length} profile(s) from "${list.name}"`,
      'Close', { duration: 3000 }
    );

    await this.loadParticipantLists();
    await this.computeLiveSegmentConflicts();

    if (this.isFiltering) this.applyFilter(this.filterForm.value);

    if (this.selectedList?.docid === list.docid) {
      const updated = this.participantLists.find(l => l.docid === list.docid);
      if (updated) {
        this.selectedList = updated;
        this.updateAvailableProfiles();
      } else {
        this.closeSidePanel();
      }
    }
  } catch (error) {
    console.error('Error de-merging profiles:', error);
    this.snackBar.open('Error removing profiles', 'Close', { duration: 3000 });
  } finally {
    this.loading = false;
  }
}
}