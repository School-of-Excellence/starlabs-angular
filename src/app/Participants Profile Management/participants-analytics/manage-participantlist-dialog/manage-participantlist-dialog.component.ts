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
import { Firestore, collection, addDoc, getDocs, query, updateDoc, arrayUnion, arrayRemove, doc, deleteDoc, getDoc, setDoc, where} from '@angular/fire/firestore';
import { MatOption, MatSelectModule } from "@angular/material/select";
import { MatTabGroup, MatTab } from "@angular/material/tabs";
import { CreateSegmentsDialogComponent } from "../create-segments-dialog/create-segments-dialog.component";
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatOptionModule } from '@angular/material/core';

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
    CreateSegmentsDialogComponent
  ],
  templateUrl: './manage-participantlist-dialog.component.html',
  styleUrls: ['./manage-participantlist-dialog.component.css']
})
export class ManageParticipantlistDialogComponent implements OnInit {

  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  // Table columns
  displayedColumns: string[] = ['listname', 'participants', 'actions'];

  // Data
  participantLists: ParticipantList[] = [];
  filteredParticipantLists: ParticipantList[] = [];
  allProfiles: Profile[] = [];
  selectedList: ParticipantList | null = null;
  availableProfilesForSelected: Profile[] = [];

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


  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<ManageParticipantlistDialogComponent>,
  ) {

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

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      await this.loadAllProfiles();
      await this.loadParticipantLists();
      // Initialize filtered list with all data
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
            segmentid: data['segmentid'] || []
          };
        })
      );

      // Update filtered list
      this.filteredParticipantLists = [...this.participantLists];
      console.log('Participant lists loaded:', this.participantLists.length);
    } catch (error) {
      console.error('Error loading participant lists:', error);
      throw error;
    }
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
      console.log(`Queue ${d.id}: start=${start}, end=${end}, isLive=${start && end && start <= now && end >= now}`);
      if (start && end && start <= now && end >= now) {
        liveQueueIds.push(d.id);
      }
    });
    console.log('Live queue IDs:', liveQueueIds);

    if (liveQueueIds.length === 0) {
      console.warn('STOPPED: No live queues found.');
      return;
    }

    const liveSegmentIds = new Set<string>();
    await Promise.all(
      liveQueueIds.map(async (queueId) => {
        const planSnap = await getDocs(
          query(collection(this.firestore, 'queue planning'), where('queueid', '==', queueId))
        );
        planSnap.docs.forEach(planDoc => {
          const planning: any[] = planDoc.data()['planning'] || [];
          planning.forEach((variation, vi) => {
            const segs = variation.segments || [];
            segs.forEach((seg: any) => {
              if (seg.segmentid) liveSegmentIds.add(seg.segmentid);
            });
          });
        });
      })
    );

    if (liveSegmentIds.size === 0) {
      return;
    }

    const profileToSegments = new Map<string, Set<string>>();
    await Promise.all(
      Array.from(liveSegmentIds).map(async (segmentId) => {
        const segDoc = await getDoc(doc(this.firestore, 'segments', segmentId));
        if (!segDoc.exists()) {
          return;
        }
        const segData = segDoc.data();
        const segmentName: string = segData['segmentname'] || segmentId;
        const participantListIds: string[] = segData['participantlistid'] || [];
        this.segmentNameMap.set(segmentId, segmentName);

        await Promise.all(
          participantListIds.map(async (listId) => {
            const listDoc = await getDoc(doc(this.firestore, 'participant list', listId));
            if (!listDoc.exists()) {
              console.warn(`Participant list ${listId} does NOT exist`);
              return;
            }
            const profileIds: string[] = listDoc.data()['profilelist'] || [];
            profileIds.forEach(profileId => {
              if (!profileToSegments.has(profileId)) {
                profileToSegments.set(profileId, new Set());
              }
              profileToSegments.get(profileId)!.add(segmentId);
            });
          })
        );
      })
    );

    profileToSegments.forEach((segs, pid) => {
      if (segs.size > 1) console.log(`CONFLICT: profile ${pid} in segments`, Array.from(segs));
    });

    profileToSegments.forEach((segIds, profileId) => {
      if (segIds.size > 1) {
        const segmentIds = Array.from(segIds);
        const segmentNames = segmentIds.map(id => this.segmentNameMap.get(id) || id);
        const profileName = this.allProfiles.find(p => p.id === profileId)?.name || profileId;
        this.globalConflictMap.set(profileId, { profileId, profileName, segmentIds, segmentNames });
      }
    });

    this.participantLists.forEach(list => {
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
        docid: listsRef.id
      };

      await setDoc(listsRef, listData);

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
      // Update participant list document
      await updateDoc(doc(this.firestore, 'participant list', this.selectedList.docid), {
        profilelist: arrayRemove(profileId),
        updateddate: new Date()
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
      id => !list.profileids.includes(id)
    );

    if (profileIdsToMerge.length === 0) {
      this.snackBar.open('All profile IDs are already in this list', 'Close', { duration: 3000 });
      return;
    }

    if (!confirm(`Merge ${profileIdsToMerge.length} new profile(s) into "${list.name}"?`)) {
      return;
    }

    this.loading = true;
    try {
      // Update participant list document with merged profile IDs
      const listRef = doc(this.firestore, 'participant list', list.docid);

      // Add each profile ID to the array
      for (const profileId of profileIdsToMerge) {
        await updateDoc(listRef, {
          profilelist: arrayUnion(profileId['profileid']),
          updateddate: new Date()
        });
      }

      this.snackBar.open(
        `Successfully merged ${profileIdsToMerge.length} profile(s) into "${list.name}"`,
        'Close',
        { duration: 3000 }
      );

      await this.loadParticipantLists();
      await this.computeLiveSegmentConflicts();

      // Re-apply filter if active
      if (this.isFiltering) {
        this.applyFilter(this.filterForm.value);
      }

      // Update selected list if it's the one being merged
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

      // Delete participant list document
      await deleteDoc(doc(this.firestore, 'participant list', list.docid));

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

  // Helper method to get profile name by ID
  getProfileName(profileId: string): string {
    const profile = this.allProfiles.find(p => p.id === profileId);
    return profile ? profile.name : 'Unknown';
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
  }

  // Helper method to check if there are profiles available to work with
  hasExternalProfiles(): boolean {
    return this.externalProfileIds && this.externalProfileIds.length > 0;
  }

  // Helper method to get the count of profiles that can be merged into a specific list
  getMergeableProfileCount(list: ParticipantList): number {
    if (!this.externalProfileIds || this.externalProfileIds.length === 0) {
      return 0;
    }
    return this.externalProfileIds.filter(id => !list.profileids.includes(id)).length;
  }

  // Helper to get filter type label
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
}