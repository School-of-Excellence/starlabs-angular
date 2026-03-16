import { Component, OnInit, inject } from '@angular/core';
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
import { Firestore, collection, addDoc, getDocs, query, updateDoc, arrayUnion, arrayRemove, doc, deleteDoc, collectionData, setDoc, writeBatch, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { MatOptionModule } from '@angular/material/core';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

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
  ],
  templateUrl: './create-segments-dialog.component.html',
  styleUrl: './create-segments-dialog.component.css'
})
export class CreateSegmentsDialogComponent implements OnInit {
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

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
  tagSearchCtrl: FormControl
  
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

  ngOnInit(): void {
    this.initializeForms();
    this.loadData();
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
      })
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
    try {
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        segmentname: newName,
        updateddate: new Date()
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
    try {
      // Update segment document
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        participantlistid: arrayRemove(listId),
        updateddate: new Date()
      });

      // Update participant list document
      await updateDoc(doc(this.firestore, 'participant list', listId), {
        segmentid: arrayRemove(this.selectedSegment.docid)
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

    this.updatingSegment = true;
    try {
      // Update segment document
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        participantlistid: arrayUnion(listId),
        updateddate: new Date()
      });

      // Update participant list document
      await updateDoc(doc(this.firestore, 'participant list', listId), {
        segmentid: arrayUnion(this.selectedSegment.docid)
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
    try {
      // Update segment document
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        tagids: arrayRemove(tagId),
        updateddate: new Date()
      });

      // Update participant tag document
      await updateDoc(doc(this.firestore, 'participant tags', tagId), {
        segmentid: arrayRemove(this.selectedSegment.docid)
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

    this.updatingSegment = true;
    try {
      // Update segment document
      await updateDoc(doc(this.firestore, 'segments', this.selectedSegment.docid), {
        tagids: arrayUnion(tagId),
        updateddate: new Date()
      });

      // Update participant tag document
      await updateDoc(doc(this.firestore, 'participant tags', tagId), {
        segmentid: arrayUnion(this.selectedSegment.docid)
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