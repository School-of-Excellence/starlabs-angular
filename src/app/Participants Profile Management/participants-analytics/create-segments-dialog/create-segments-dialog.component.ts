import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl, FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Firestore, collection, addDoc, getDocs, query, updateDoc, arrayUnion, arrayRemove, doc, deleteDoc, collectionData, setDoc, writeBatch, where, orderBy, limit } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { MatOptionModule } from '@angular/material/core';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ActivatedRoute } from '@angular/router';
import { AuthguardService } from '../../../authguard.service';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

@Component({
  selector: 'app-create-segments-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatOptionModule,
    NgxMatSelectSearchModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatAutocompleteModule,
    MatDatepickerModule,   
    MatNativeDateModule,
  ],
  templateUrl: './create-segments-dialog.component.html',
  styleUrl: './create-segments-dialog.component.css'
})
export class CreateSegmentsDialogComponent implements OnInit {
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  @Input() loggedInUser: any = null
  reviewAccess: boolean = false;
  submissionAccess: boolean = false;
  constructor(
      private route: ActivatedRoute,
      private auth: AuthguardService,
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
        console.log("profileid from url", this.route.snapshot.queryParams['profileid']);
      })
    }
  // Table columns
  displayedColumns: string[] = ['segmentname', 'participantlists', 'tags', 'actions'];
  
  // Data
  segments = [];
  participantLists = [];
  participantTags = [];
  selectedSegment = null;
  availableListsForSelected = [];
  availableTagsForSelected = [];
  
  // Forms
  createSegmentForm!: FormGroup;
  editSegmentForm!: FormGroup;
  addListForm!: FormGroup;
  addTagForm!: FormGroup;
  tagSearchCtrl: FormControl = new FormControl('');
  
  // Loading states
  loading = false;
  submitting = false;
  updatingSegment = false;
  
  // UI states
  showCreateForm = false;
  sidePanelOpen = false;
  isEditingName = false;

  mapParticipantList = {};
  mapParticipantTag = {};

  // Observables for autocomplete
  filteredTags$!: Observable<any[]>;
  filteredEditTags$!: Observable<any[]>;

  // participant segment logs states
  historyPanelOpen = false;
  logs: any[] = [];
  logsLoading = false;
  logsPage = 0;
  logsPageSize = 15;
  expandedLogIds = new Set<string>();
  historySearchTerm = '';
  historyFilter = 'all';
  filteredLogs: any[] = [];
  historyDateStart: Date | null = null;
  historyDateEnd: Date | null = null;

mapUsers: Record<string, string> = {};

  ngOnInit(): void {
    this.initializeForms();
    this.loadData();
  }

  toggleLogExpand(docId: string): void {
  if (this.expandedLogIds.has(docId)) {
    this.expandedLogIds.delete(docId);
  } else {
    this.expandedLogIds.add(docId);
  }
  this.expandedLogIds = new Set(this.expandedLogIds);
}
  get pagedLogs() {
    const start = this.logsPage * this.logsPageSize;
    return this.logs.slice(start, start + this.logsPageSize);
  }

  get totalLogPages() {
    return Math.ceil(this.logs.length / this.logsPageSize);
  }

  toggleHistoryPanel() {
    this.historyPanelOpen = !this.historyPanelOpen;
    if (this.historyPanelOpen && this.logs.length === 0) {
      this.loadLogs();
    }
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
    const snap = await getDocs(q);
    this.logs = snap.docs
      .map(d => d.data())
      .filter(d => d?.['type'] === 'segment'); 
    this.filteredLogs = [...this.logs];
    console.log('Loaded logs:', this.logs.length);
  } catch(e) {
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

      const segName: string = (
        log.metadata?.current?.segmentname ||
        log.metadata?.previous?.segmentname || ''
      ).toLowerCase();

      const listIds: string[] = [
        ...(log.metadata?.current?.participantlistid  || []),
        ...(log.metadata?.previous?.participantlistid || []),
        ...(log.metadata?.current?.added_profiles     || []),
        ...(log.metadata?.current?.profilelist        || []),
      ];
      const listNamesMatch = listIds.some(id =>
        this.getListName(id).toLowerCase().includes(term)
      );

      textMatch = desc.includes(term) || segName.includes(term) || listNamesMatch;
    }

    return typeMatch && dateMatch && textMatch;
  });

  this.logsPage = 0;
}

getListName(listId: string): string {
  if (!listId) return '—';
  return this.mapParticipantList[listId]?.listname || listId;
}

getUserName(userId: string): string {
  if (!userId) return '—';
  return this.mapUsers[userId] || userId;
}

getLogCountByType(type: string): number {
  return this.logs.filter(l => l.action_type === type).length;
}

getLogProfiles(log: any): string[] {
  const listIds: string[] = (
    log.metadata?.current?.participantlistid ||
    log.metadata?.current?.added_profiles    ||
    log.metadata?.current?.profilelist       ||
    []
  );
  return listIds;
}

get pagedFilteredLogs(): any[] {
  const start = this.logsPage * this.logsPageSize;
  return this.filteredLogs.slice(start, start + this.logsPageSize);
}

get groupedPagedLogs(): { date: string; logs: any[] }[] {
  const groups: { date: string; logs: any[] }[] = [];
  let currentDate = '';
  for (const log of this.pagedFilteredLogs) {
    const d = log.created_date?.toDate?.();
    const label = d ? this.formatDateLabel(d) : 'Unknown date';
    if (label !== currentDate) {
      currentDate = label;
      groups.push({ date: label, logs: [] });
    }
    groups[groups.length - 1].logs.push(log);
  }
  return groups;
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

getLogParticipantsClass(actionType: string): string {
  const map: Record<string, string> = {
    create: 'participants-created', edit: 'participants-edited'
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

  initializeForms(): void {
    this.createSegmentForm = this.fb.group({
      segmentname: ['', [Validators.required, Validators.minLength(3)]],
      participantlistid: [[], [Validators.required]],
      tagids: [[]]
    });

    this.editSegmentForm = this.fb.group({
      segmentname: ['', [Validators.required, Validators.minLength(3)]]
    });

    this.addListForm = this.fb.group({
      participantlistid: ['', [Validators.required]]
    });

    this.addTagForm = this.fb.group({
      tagid: ['', [Validators.required]]
    });

    // Add real-time duplicate check for create form
    this.createSegmentForm.get('segmentname')?.valueChanges.subscribe(() => {
      this.checkSegmentNameDuplicate(this.createSegmentForm);
    });

    // Add real-time duplicate check for edit form
    this.editSegmentForm.get('segmentname')?.valueChanges.subscribe(() => {
      this.checkSegmentNameDuplicate(this.editSegmentForm, this.selectedSegment?.docid);
    });

    // Setup tag autocomplete for create form
    this.filteredTags$ = this.createSegmentForm.get('tagids')!.valueChanges.pipe(
      startWith([]),
      map(() => this.filterAvailableTags(this.createSegmentForm.get('tagids')?.value || []))
    );
  }

  filterAvailableTags(selectedTagIds: string[]): any[] {
    return this.participantTags.filter(tag => !selectedTagIds.includes(tag.docid));
  }

  checkSegmentNameDuplicate(form: FormGroup, excludeSegmentId?: string): void {
    const segmentNameControl = form.get('segmentname');
    const segmentName = segmentNameControl?.value?.trim().toLowerCase();
    
    if (!segmentName) {
      return;
    }

    const isDuplicate = this.segments.some(segment => 
      segment.segmentname.toLowerCase() === segmentName && 
      segment.docid !== excludeSegmentId
    );

    if (isDuplicate) {
      segmentNameControl?.setErrors({ ...segmentNameControl.errors, duplicate: true });
    } else {
      // Remove duplicate error if it exists
      if (segmentNameControl?.hasError('duplicate')) {
        const errors = { ...segmentNameControl.errors };
        delete errors['duplicate'];
        segmentNameControl?.setErrors(Object.keys(errors).length > 0 ? errors : null);
      }
    }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    
    // Load participant lists
    collectionData(collection(this.firestore, 'participant list')).subscribe((participantlist)=>{
      this.participantLists = [];
      this.mapParticipantList = {};
      for (let i = 0; i < participantlist.length; i++) {
        const participantlistData = participantlist[i];
        this.participantLists.push(participantlistData);
        this.mapParticipantList[participantlistData['docid']] = participantlistData;
}
    });

    // Load participant tags
    collectionData(collection(this.firestore, 'participant tags')).subscribe((tags)=>{
      this.participantTags = [];
      this.mapParticipantTag = {};
      for (let i = 0; i < tags.length; i++) {
        const tagData = tags[i];
        this.participantTags.push(tagData);
        this.mapParticipantTag[tagData['id']] = tagData;
      }
    });

    await this.loadSegments();
  }

  async loadSegments(): Promise<void> {
    try {
      const segmentsRef = collection(this.firestore, 'segments');
      const segmentsSnapshot = await getDocs(query(segmentsRef));
      this.segments = segmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.loading = false;
      
      // Re-check duplicate after loading segments
      this.checkSegmentNameDuplicate(this.createSegmentForm);
      if (this.selectedSegment) {
        this.checkSegmentNameDuplicate(this.editSegmentForm, this.selectedSegment.docid);
      }
    } catch (error) {
      console.error('Error loading segments:', error);
      throw error;
    }
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    if (!this.showCreateForm) {
      this.createSegmentForm.reset();
      this.createSegmentForm.patchValue({ 
        participantlistid: [],
        tagids: []
      });
    }
  }

  async onCreateSegment(): Promise<void> {
    let batch = writeBatch(this.firestore)
    if (this.createSegmentForm.invalid) {
      this.createSegmentForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const formValue = this.createSegmentForm.value;
    console.log(formValue);
    
    try {
      // Check for duplicate segment name
      const segmentName = formValue.segmentname.trim().toLowerCase();
      const isDuplicateName = this.segments.some(segment => 
        segment.segmentname.toLowerCase() === segmentName
      );

      if (isDuplicateName) {
        this.snackBar.open('Segment name already exists. Please choose a different name.', 'Close', { 
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.submitting = false;
        return;
      }

      // Check for duplicate participants
      const duplicateCheck = await this.checkDuplicateParticipants(formValue.participantlistid);

      if (duplicateCheck.isDuplicate) {
        const participantNames = duplicateCheck.duplicates.map(id => this.mapParticipantList[id]['listname']);
        
        const message = `The following participants already exist in other segments (${duplicateCheck.segmentNames.join(', ')}): ${participantNames}`;
        this.snackBar.open(message, 'Close', { 
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.submitting = false;
        return;
      }

      // Create segment document
      const segmentsRef = doc(collection(this.firestore, 'segments'));
      
      batch.set(segmentsRef, {
        docid: segmentsRef.id,
        segmentname: formValue.segmentname.trim(),
        participantlistid: formValue.participantlistid,
        tagids: formValue.tagids || [],
        createddate: new Date()
      });

      // Update participant lists with segment reference
      for (const participantlistid of formValue.participantlistid) {
        console.log(participantlistid);
        
        batch.update(doc(this.firestore, 'participant list', participantlistid), {
          segmentid: arrayUnion(segmentsRef.id),
        });
      }

      // Update participant tags with segment reference
      for (const tagid of (formValue.tagids || [])) {
        batch.update(doc(this.firestore, 'participant tags', tagid), {
          segmentid: arrayUnion(segmentsRef.id),
        });
      }

      await batch.commit().then(async()=>{
        this.snackBar.open('Segment created successfully!', 'Close', { duration: 3000 });
        this.createSegmentForm.reset();
        this.createSegmentForm.patchValue({ 
          participantlistid: [],
          tagids: []
        });
        this.showCreateForm = false;
        await this.loadSegments();
      }
    )
    // add activity log
    const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
    await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
      doc_id: activityDocId,
      action_type: 'create',
      created_date: new Date(),
      type: 'segment',
      edited_by: this.loggedInUser,
      referals: doc(this.firestore, 'segments', segmentsRef.id),
      metadata: {
        current: { segmentname: formValue.segmentname.trim(), participantlistid: formValue.participantlistid, tagids: formValue.tagids || [] },
        description: `Created segment "${formValue.segmentname.trim()}" with ${formValue.participantlistid.length} list(s).`
      }
    });
    } catch (error) {
      console.error('Error creating segment:', error);
      this.snackBar.open('Error creating segment. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.submitting = false;
    }
  }

  async checkDuplicateParticipants(selectedIds: string[], excludeSegmentId?: string): Promise<{ isDuplicate: boolean; duplicates: string[]; segmentNames: string[] }> {
    try {
      const duplicates: string[] = [];
      const segmentNames: string[] = [];

      this.segments.forEach(segment => {
        // Skip the current segment if we're editing
        if (excludeSegmentId && segment.docid === excludeSegmentId) {
          return;
        }

        const existingIds = segment.participantlistid || [];
        
        selectedIds.forEach(selectedId => {
          if (existingIds.includes(selectedId) && !duplicates.includes(selectedId)) {
            duplicates.push(selectedId);
            if (!segmentNames.includes(segment.segmentname)) {
              segmentNames.push(segment.segmentname);
            }
          }
        });
      });

      return {
        isDuplicate: duplicates.length > 0,
        duplicates,
        segmentNames
      };
    } catch (error) {
      console.error('Error checking duplicates:', error);
      throw error;
    }
  }

  onSelectSegment(segment): void {
    this.selectedSegment = segment;
    this.sidePanelOpen = true;
    this.isEditingName = false;
    this.editSegmentForm.patchValue({
      segmentname: segment.segmentname
    });
    this.updateAvailableLists();
    this.updateAvailableTags();
    this.addListForm.reset();
    this.addTagForm.reset();
  }

  updateAvailableLists(): void {
    if (!this.selectedSegment) {
      this.availableListsForSelected = [];
      return;
    }

    const currentListIds = this.selectedSegment.participantlistid || [];
    this.availableListsForSelected = this.participantLists.filter(list => !currentListIds.includes(list.docid));
  }

  updateAvailableTags(): void {
    if (!this.selectedSegment) {
      this.availableTagsForSelected = [];
      return;
    }

    const currentTagIds = this.selectedSegment.tagids || [];
    this.availableTagsForSelected = this.participantTags.filter(tag => !currentTagIds.includes(tag.docid));
  }

  closeSidePanel(): void {
    this.sidePanelOpen = false;
    this.selectedSegment = null;
    this.isEditingName = false;
    this.addListForm.reset();
    this.addTagForm.reset();
    this.editSegmentForm.reset();
  }

  toggleEditName(): void {
    this.isEditingName = !this.isEditingName;
    if (!this.isEditingName) {
      this.editSegmentForm.patchValue({
        segmentname: this.selectedSegment.segmentname
      });
    }
  }

  async saveSegmentName(): Promise<void> {
    if (this.editSegmentForm.invalid || !this.selectedSegment) {
      this.editSegmentForm.markAllAsTouched();
      return;
    }

    const newName = this.editSegmentForm.value.segmentname.trim();
    
    // Check if name actually changed
    if (newName === this.selectedSegment.segmentname) {
      this.isEditingName = false;
      return;
    }

    this.updatingSegment = true;
    const oldName = this.selectedSegment.segmentname;
    try {
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        segmentname: newName,
        updateddate: new Date()
      });

      // add activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { segmentname: oldName },
          current: { segmentname: newName },
          description: `Renamed segment from "${oldName}" to "${newName}".`
        }
      });

      this.snackBar.open('Segment name updated successfully', 'Close', { duration: 3000 });
      await this.loadSegments();
      
      // Update selected segment
      const updatedSegment = this.segments.find(s => s.docid === this.selectedSegment?.docid);
      if (updatedSegment) {
        this.selectedSegment = updatedSegment;
        this.isEditingName = false;
      }
    } catch (error) {
      console.error('Error updating segment name:', error);
      this.snackBar.open('Error updating segment name', 'Close', { duration: 3000 });
    } finally {
      this.updatingSegment = false;
    }
  }

  async removeListFromSegment(listId: string): Promise<void> {
    if (!this.selectedSegment) return;

    this.updatingSegment = true;
    const previousListIds = [...(this.selectedSegment.participantlistid || [])];
    const listName = this.mapParticipantList[listId]?.['listname'] || listId;

    try {
      // Update segment document
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        participantlistid: arrayRemove(listId),
        updateddate: new Date()
      });

      // add activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { participantlistid: previousListIds },
          current: { participantlistid: previousListIds.filter(id => id !== listId) },
          description: `Removed list "${listName}" from segment "${this.selectedSegment.segmentname}".`
        }
      });

      // Update participant list document
      await updateDoc(doc(this.firestore, 'participant list', listId), {
        segmentid: arrayRemove(this.selectedSegment.docid)
      });

      // add activity log
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { participantlistid: previousListIds },
          current: { participantlistid: previousListIds.filter(id => id !== listId) },
          description: `Removed list "${listName}" from segment "${this.selectedSegment.segmentname}".`
        }
      });

      this.snackBar.open('Participant list removed successfully', 'Close', { duration: 3000 });
      await this.loadSegments();
      
      // Update selected segment
      const updatedSegment = this.segments.find(s => s.docid === this.selectedSegment?.docid);
      if (updatedSegment) {
        this.selectedSegment = updatedSegment;
        this.updateAvailableLists();
      } else {
        this.closeSidePanel();
      }
    } catch (error) {
      console.error('Error removing list:', error);
      this.snackBar.open('Error removing participant list', 'Close', { duration: 3000 });
    } finally {
      this.updatingSegment = false;
    }
  }

  async addListToSegment(): Promise<void> {
    if (this.addListForm.invalid || !this.selectedSegment) {
      return;
    }

    const listId = this.addListForm.value.participantlistid;
    
    // Check if this list is already in another segment
    const duplicateCheck = await this.checkDuplicateParticipants([listId], this.selectedSegment.docid);
    
    if (duplicateCheck.isDuplicate) {
      const participantName = this.participantLists.find(p => p.docid === listId)?.listname || listId;
      const message = `"${participantName}" is already in segment: ${duplicateCheck.segmentNames.join(', ')}`;
      this.snackBar.open(message, 'Close', { 
        duration: 5000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    const previousListIds = [...(this.selectedSegment.participantlistid || [])];
    const listName = this.mapParticipantList[listId]?.['listname'] || listId;
    this.updatingSegment = true;
    try {
      // Update segment document
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        participantlistid: arrayUnion(listId),
        updateddate: new Date()
      });

      // add activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { participantlistid: previousListIds },
          current: { participantlistid: [...previousListIds, listId] },
          description: `Added list "${listName}" to segment "${this.selectedSegment.segmentname}".`
        }
      });

      // Update participant list document
      await updateDoc(doc(this.firestore, 'participant list', listId), {
        segmentid: arrayUnion(this.selectedSegment.docid)
      });

      // add activity log
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { participantlistid: previousListIds },
          current: { participantlistid: [...previousListIds, listId] },
          description: `Added list "${listName}" to segment "${this.selectedSegment.segmentname}".`
        }
      });

      this.snackBar.open('Participant list added successfully', 'Close', { duration: 3000 });
      this.addListForm.reset();
      await this.loadSegments();
      
      // Update selected segment
      const updatedSegment = this.segments.find(s => s.docid === this.selectedSegment?.docid);
      if (updatedSegment) {
        this.selectedSegment = updatedSegment;
        this.updateAvailableLists();
      }
    } catch (error) {
      console.error('Error adding list:', error);
      this.snackBar.open('Error adding participant list', 'Close', { duration: 3000 });
    } finally {
      this.updatingSegment = false;
    }
  }

  async removeTagFromSegment(tagId: string): Promise<void> {
    if (!this.selectedSegment) return;

    this.updatingSegment = true;
    const previousTagIds = [...(this.selectedSegment.tagids || [])];
    const tagName = this.mapParticipantTag[tagId]?.name || tagId;
    try {
      // Update segment document
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        tagids: arrayRemove(tagId),
        updateddate: new Date()
      });

      // add activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { tagids: previousTagIds },
          current: { tagids: previousTagIds.filter(id => id !== tagId) },
          description: `Removed tag "${tagName}" from segment "${this.selectedSegment.segmentname}".`
        }
      });

      // Update participant tag document
      await updateDoc(doc(this.firestore, 'participant tags', tagId), {
        segmentid: arrayRemove(this.selectedSegment.docid)
      });

      // add activity log
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { tagids: previousTagIds },
          current: { tagids: previousTagIds.filter(id => id !== tagId) },
          description: `Removed tag "${tagName}" from segment "${this.selectedSegment.segmentname}".`
        }
      });

      this.snackBar.open('Tag removed successfully', 'Close', { duration: 3000 });
      await this.loadSegments();
      
      // Update selected segment
      const updatedSegment = this.segments.find(s => s.docid === this.selectedSegment?.docid);
      if (updatedSegment) {
        this.selectedSegment = updatedSegment;
        this.updateAvailableTags();
      }
    } catch (error) {
      console.error('Error removing tag:', error);
      this.snackBar.open('Error removing tag', 'Close', { duration: 3000 });
    } finally {
      this.updatingSegment = false;
    }
  }

  async addTagToSegment(): Promise<void> {
    if (this.addTagForm.invalid || !this.selectedSegment) {
      return;
    }

    const tagId = this.addTagForm.value.tagid;

    const previousTagIds = [...(this.selectedSegment.tagids || [])];
    const tagName = this.mapParticipantTag[tagId]?.name || tagId;
    this.updatingSegment = true;
    try {
      // Update segment document
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        tagids: arrayUnion(tagId),
        updateddate: new Date()
      });

      // add activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { tagids: previousTagIds },
          current: { tagids: [...previousTagIds, tagId] },
          description: `Added tag "${tagName}" to segment "${this.selectedSegment.segmentname}".`
        }
      });

      // Update participant tag document
      await updateDoc(doc(this.firestore, 'participant tags', tagId), {
        segmentid: arrayUnion(this.selectedSegment.docid)
      });

      // add activity log
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'edit',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', this.selectedSegment.docid),
        metadata: {
          previous: { tagids: previousTagIds },
          current: { tagids: [...previousTagIds, tagId] },
          description: `Added tag "${tagName}" to segment "${this.selectedSegment.segmentname}".`
        }
      });

      this.snackBar.open('Tag added successfully', 'Close', { duration: 3000 });
      this.addTagForm.reset();
      await this.loadSegments();
      
      // Update selected segment
      const updatedSegment = this.segments.find(s => s.docid === this.selectedSegment?.docid);
      if (updatedSegment) {
        this.selectedSegment = updatedSegment;
        this.updateAvailableTags();
      }
    } catch (error) {
      console.error('Error adding tag:', error);
      this.snackBar.open('Error adding tag', 'Close', { duration: 3000 });
    } finally {
      this.updatingSegment = false;
    }
  }

  async deleteSegment(segment, event: Event): Promise<void> {
    event.stopPropagation();
    console.log(segment);
    
    if (!confirm(`Are you sure you want to delete segment "${segment.segmentname}"?`)) {
      return;
    }

    const previousData = { segmentname: segment.segmentname, participantlistid: [...(segment.participantlistid || [])], tagids: [...(segment.tagids || [])] };
    this.loading = true;
    try {
      // Remove segment reference from all participant lists
      for (const listId of (segment.participantlistid || [])) {
        console.log(listId);
        
        await updateDoc(doc(this.firestore, 'participant list', listId), {
          segmentid: arrayRemove(segment.docid)
        });
      }

      // Remove segment reference from all tags
      for (const tagId of (segment.tagids || [])) {
        await updateDoc(doc(this.firestore, 'participant tags', tagId), {
          segmentid: arrayRemove(segment.docid)
        });
      }
      
      // Delete segment document
      await deleteDoc(doc(this.firestore, 'segments', segment.docid));
      // add activity log
      const activityDocId = doc(collection(this.firestore, 'participant_list_log')).id;
      await setDoc(doc(this.firestore, 'participant_list_log', activityDocId), {
        doc_id: activityDocId,
        action_type: 'delete',
        created_date: new Date(),
        type: 'segment',
        edited_by: this.loggedInUser,
        referals: doc(this.firestore, 'segments', segment.docid),
        metadata: {
          previous: previousData,
          description: `Deleted segment "${segment.segmentname}".`
        }
      });

      this.snackBar.open('Segment deleted successfully', 'Close', { duration: 3000 });
      
      if (this.selectedSegment?.docid === segment.docid) {
        this.closeSidePanel();
      }
      
      await this.loadSegments();
    } catch (error) {
      console.error('Error deleting segment:', error);
      this.snackBar.open('Error deleting segment', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  getErrorMessage(fieldName: string, form: FormGroup): string {
    const control = form.get(fieldName);
    if (control?.hasError('required')) {
      if (fieldName === 'segmentname') return 'Segment name is required';
      if (fieldName === 'participantlistid') return 'Participant list is required';
      if (fieldName === 'tagid') return 'Tag is required';
      return 'This field is required';
    }
    if (control?.hasError('minlength')) {
      return 'Segment name must be at least 3 characters';
    }
    if (control?.hasError('duplicate')) {
      return 'This segment name already exists';
    }
    return '';
  }
}