// Updated TypeScript component with better image handling

import { Component, Inject, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { 
  Firestore, 
  doc, 
  updateDoc, 
  Timestamp,
  getDoc
} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';

interface TrustedUrl {
  original: string;
  trusted: SafeResourceUrl | SafeUrl;
}

@Component({
  selector: 'app-assignment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule
  ],
  templateUrl: './assignment-dialog.component.html',
  styleUrls: ['./assignment-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssignmentDialogComponent implements OnInit {
  reviewNotesForm: FormArray<FormControl<string>>;
  currentUserId: string;
  isOldResult: boolean = false;
  status: string;
  oldResultNotes: string[] = [];
  oldResultDate: string | null = null;
  oldResultIndex: number | null = null;
  
  // Cache trusted URLs to prevent recreation on every change detection
  trustedUrls: TrustedUrl[] = [];
  
  // Add image loading state tracking
  imageLoadStates: { [index: number]: 'loading' | 'loaded' | 'error' } = {};

  // Computed properties to replace function bindings
  dialogTitle: string = '';
  bannerIcon: string = '';
  bannerTitle: string = '';
  bannerMessage: string = '';
  bannerSubMessage: string = '';
  submissionsTitle: string = '';
  notesTitle: string = '';
  notePlaceholder: string = '';
  readonlyHint: string = '';
  noNotesMessage: string = '';
  readonlyMessage: string = '';
  fileTypeLabel: string = '';
  fileCategory: string = '';
  
  // Boolean computed properties
  canPerformActionsValue: boolean = true;
  shouldShowNotesSectionValue: boolean = true;
  canAddNoteValue: boolean = false;
  canRemoveNoteValue: boolean = false;
  showStatusBanner: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<AssignmentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder,
    public sanitizer: DomSanitizer,
    private firestore: Firestore,
    private auth: AuthguardService,
    private cdr: ChangeDetectorRef
  ) {
    this.reviewNotesForm = this.fb.array([
      this.fb.control('')
    ]);
  }

  async ngOnInit() {
    this.currentUserId = await this.auth.getuid();
    console.log('Assignment status:', this.data.status);
    console.log('Assignment data:', this.data);
    
    // Check if this is viewing an old result
    this.isOldResult = this.data.isOldResult || false;
    this.status = this.data.status;
    this.oldResultNotes = this.data.oldResultNotes || [];
    this.oldResultDate = this.data.oldResultDate || null;
    this.oldResultIndex = this.data.oldResultIndex || null;
    
    // Pre-sanitize all URLs to prevent recreation
    this.initializeTrustedUrls();
    
    // Initialize image loading states
    this.initializeImageLoadStates();
    
    // Compute all display properties
    this.computeDisplayProperties();
    
    // Handle different scenarios for populating notes
    if (this.isOldResult && this.oldResultNotes.length > 0) {
      // Viewing old result with notes
      this.populateOldResultNotes();
    } else if (this.isOldResult && this.oldResultNotes.length === 0) {
      // Viewing old result with no notes
      this.populateEmptyOldResultNotes();
    } else if (this.status === 'completed' && this.data.completionNotes && this.data.completionNotes.length > 0) {
      // Viewing completed assignment with completion notes
      this.populateCompletionNotes();
    }
    
    // Update computed boolean properties
    this.updateComputedBooleans();
    
    // Trigger change detection after async operations
    this.cdr.detectChanges();
  }

  private initializeImageLoadStates() {
    if (this.data.assignmentresult && Array.isArray(this.data.assignmentresult)) {
      this.data.assignmentresult.forEach((_: string, index: number) => {
        this.imageLoadStates[index] = 'loading';
      });
    }
  }

  private computeDisplayProperties() {
    // Dialog title
    if (this.isOldResult) {
      this.dialogTitle = `Previous Assignment Submission #${(this.oldResultIndex || 0) + 1}`;
    } else if (this.status === 'completed') {
      this.dialogTitle = 'Completed Assignment Review';
    } else if (this.status === 'rework') {
      this.dialogTitle = 'Assignment Marked for Rework';
    } else {
      this.dialogTitle = 'Review Assignment';
    }

    // Banner properties
    this.showStatusBanner = this.isOldResult || this.status === 'completed' || this.status === 'rework';
    
    if (this.isOldResult) {
      this.bannerIcon = 'info';
      this.bannerTitle = 'Historical View';
      this.bannerMessage = `This is a previous submission from ${this.oldResultDate}.`;
      this.bannerSubMessage = 'Review notes below cannot be modified.';
    } else if (this.status === 'completed') {
      this.bannerIcon = 'check_circle';
      this.bannerTitle = 'Completed Assignment';
      this.bannerMessage = 'This assignment has been completed and reviewed.';
      this.bannerSubMessage = 'The completion notes from the review are shown below.';
    } else if (this.status === 'rework') {
      this.bannerIcon = 'refresh';
      this.bannerTitle = 'Rework Status';
      this.bannerMessage = 'This assignment has been marked for rework.';
      this.bannerSubMessage = 'Wait for the participant to complete the rework';
    }

    // Submissions title
    if (this.isOldResult) {
      this.submissionsTitle = `Previous Assignment Submissions #${(this.oldResultIndex || 0) + 1}`;
    } else if (this.status === 'completed') {
      this.submissionsTitle = 'Completed Assignment Submissions';
    } else if (this.status === 'rework') {
      this.submissionsTitle = 'Assignment Submissions (Marked for Rework)';
    } else {
      this.submissionsTitle = 'Assignment Submissions';
    }

    // Notes title
    if (this.isOldResult) {
      this.notesTitle = `Review Notes from Previous Submission #${(this.oldResultIndex || 0) + 1}`;
    } else if (this.status === 'completed') {
      this.notesTitle = 'Completion Notes';
    } else if (this.status === 'rework') {
      this.notesTitle = 'Previous Review Notes';
    } else {
      this.notesTitle = 'Add Review Notes';
    }

    // Notes placeholder
    if (this.isOldResult) {
      this.notePlaceholder = 'Review note from previous submission';
    } else if (this.status === 'completed') {
      this.notePlaceholder = 'Completion note from review';
    } else if (this.status === 'rework') {
      this.notePlaceholder = 'Previous review note';
    } else {
      this.notePlaceholder = 'Enter your review note here...';
    }

    // Readonly hint
    if (this.isOldResult) {
      this.readonlyHint = 'This note cannot be edited - historical view';
    } else if (this.status === 'completed') {
      this.readonlyHint = 'Completion note from review';
    } else if (this.status === 'rework') {
      this.readonlyHint = 'Previous review note - cannot be edited';
    }

    // No notes message
    if (this.isOldResult) {
      this.noNotesMessage = 'No review notes were added for this previous submission.';
    } else if (this.status === 'completed') {
      this.noNotesMessage = 'No completion notes were added during the review.';
    } else if (this.status === 'rework') {
      this.noNotesMessage = 'No review notes were added when marking for rework.';
    }

    // Readonly message
    if (this.isOldResult) {
      this.readonlyMessage = 'This is a historical view. To review the current submission, close this dialog and click on the current assignment.';
    } else if (this.status === 'completed') {
      this.readonlyMessage = 'This assignment has been completed. No further actions are available.';
    } else if (this.status === 'rework') {
      this.readonlyMessage = 'This assignment is marked for rework. Participant needs to resubmit before further review.';
    }

    // File type and category
    this.fileTypeLabel = this.data.uploadtype?.toUpperCase() || 'FILE';
    this.fileCategory = this.getFileCategory(this.data.uploadtype);

    // Boolean properties
    this.canPerformActionsValue = !this.isOldResult && this.status !== 'rework' && this.status !== 'completed';
    this.shouldShowNotesSectionValue = true; // Always show notes section
  }

  private updateComputedBooleans() {
    // Update boolean properties that depend on form state
    if (this.isOldResult || this.status === 'completed' || this.status === 'rework') {
      this.canAddNoteValue = false;
      this.canRemoveNoteValue = false;
    } else {
      const lastNoteIndex = this.reviewNotesForm.length - 1;
      const lastNote = this.reviewNotesForm.at(lastNoteIndex) as FormControl;
      this.canAddNoteValue = lastNote.value && lastNote.value.trim().length > 0;
      this.canRemoveNoteValue = this.reviewNotesForm.length > 1;
    }
  }

  private initializeTrustedUrls() {
    if (this.data.assignmentresult && Array.isArray(this.data.assignmentresult)) {
      this.trustedUrls = this.data.assignmentresult.map((url: string) => ({
        original: url,
        trusted: this.fileCategory === 'pdf' 
          ? this.sanitizer.bypassSecurityTrustResourceUrl(url)
          : this.sanitizer.bypassSecurityTrustUrl(url)
      }));
    }
  }

  // Image event handlers
  onImageLoad(index: number) {
    this.imageLoadStates[index] = 'loaded';
    this.cdr.detectChanges();
  }

  onImageError(index: number) {
    this.imageLoadStates[index] = 'error';
    console.error(`Failed to load image at index ${index}:`, this.data.assignmentresult[index]);
    this.cdr.detectChanges();
  }

  // Get raw URL for images (bypassing sanitizer issues)
  getRawImageUrl(index: number): string {
    return this.data.assignmentresult[index] || '';
  }

  // Method to get trusted URL without recreating it
  getTrustedUrl(index: number): SafeResourceUrl | SafeUrl {
    return this.trustedUrls[index]?.trusted || '';
  }

  // Method specifically for PDF resources
  getTrustedResourceUrl(index: number): SafeResourceUrl {
    // Always create a fresh SafeResourceUrl for PDFs to avoid type mismatch
    const url = this.data.assignmentresult[index];
    return this.sanitizer.bypassSecurityTrustResourceUrl(url || '');
  }

  // Method for other media types
  getTrustedMediaUrl(index: number): SafeUrl {
    const trustedUrl = this.trustedUrls[index]?.trusted;
    if (trustedUrl) {
      return trustedUrl as SafeUrl;
    }
    return this.sanitizer.bypassSecurityTrustUrl(this.data.assignmentresult[index] || '');
  }

  getFileCategory(uploadType: string): string {
    const type = uploadType?.toLowerCase();
    if (type === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'image'].includes(type)) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'video'].includes(type)) return 'video';
    if (['mp3', 'wav', 'aac', 'ogg', 'audio'].includes(type)) return 'audio';
    if (['doc', 'docx', 'txt', 'rtf'].includes(type)) return 'document';
    return 'unknown';
  }

  // Rest of your existing methods remain the same...
  private populateOldResultNotes() {
    console.log('Populating old result notes:', this.oldResultNotes);
    
    // Clear existing notes
    while (this.reviewNotesForm.length > 0) {
      this.reviewNotesForm.removeAt(0);
    }

    // Add old result notes as readonly
    this.oldResultNotes.forEach((note, index) => {
      const control = this.fb.control(note);
      control.disable(); // Make readonly
      this.reviewNotesForm.push(control);
      console.log(`Added old result note ${index + 1}:`, note);
    });

    console.log('Old result notes populated. Form length:', this.reviewNotesForm.length);
  }

  private populateEmptyOldResultNotes() {
    console.log('Populating empty old result notes');
    
    // Clear existing notes
    while (this.reviewNotesForm.length > 0) {
      this.reviewNotesForm.removeAt(0);
    }

    // Add one empty disabled note field
    const control = this.fb.control('No notes were added for this submission');
    control.disable();
    this.reviewNotesForm.push(control);
  }

  private populateCompletionNotes() {
    console.log('Populating completion notes:', this.data.completionNotes);
    
    // Clear existing notes
    while (this.reviewNotesForm.length > 0) {
      this.reviewNotesForm.removeAt(0);
    }

    // Parse completion notes if they're in string format
    let completionNotes = this.data.completionNotes;
    if (typeof completionNotes === 'string') {
      try {
        completionNotes = JSON.parse(completionNotes);
      } catch (error) {
        console.error('Error parsing completion notes:', error);
        completionNotes = [completionNotes];
      }
    }

    // Add completion notes as readonly
    if (Array.isArray(completionNotes) && completionNotes.length > 0) {
      completionNotes.forEach((note: string, index: number) => {
        const control = this.fb.control(note);
        control.disable(); // Make readonly
        this.reviewNotesForm.push(control);
        console.log(`Added completion note ${index + 1}:`, note);
      });
    } else {
      // Add empty disabled field if no completion notes
      const control = this.fb.control('No completion notes were added');
      control.disable();
      this.reviewNotesForm.push(control);
    }
  }

  // Enhanced notes management methods
  addNote() {
    if (this.canAddNoteValue) {
      this.reviewNotesForm.push(this.fb.control(''));
      this.updateComputedBooleans();
    }
  }

  removeNote(index: number) {
    if (this.canRemoveNoteValue) {
      this.reviewNotesForm.removeAt(index);
      this.updateComputedBooleans();
    }
  }

  getNotesControls(): FormControl[] {
    return this.reviewNotesForm.controls as FormControl[];
  }

  getNoteControl(index: number): FormControl {
    return this.reviewNotesForm.at(index) as FormControl;
  }

  getNonEmptyNotes(): string[] {
    return this.reviewNotesForm.value.filter((note: string) => note && note.trim().length > 0);
  }

  async completeAssignment() {
    if (!this.canPerformActionsValue) return;
    
    try {
      const notes = this.getNonEmptyNotes();
      await this.updateAssignmentStatus('completed', notes);
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error completing assignment:', error);
    }
  }

  async reworkAssignment() {
    if (!this.canPerformActionsValue) return;
    
    try {
      const notes = this.getNonEmptyNotes();
      await this.updateAssignmentStatus('rework', notes);
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error marking assignment for rework:', error);
    }
  }

  private async updateAssignmentStatus(status: 'completed' | 'rework', notes: string[] = []) {
    // Get the participant workshop document
    const workshopDocRef = doc(this.firestore, this.data.workshopref);
    const workshopSnap = await getDoc(workshopDocRef);

    if (!workshopSnap.exists()) {
      throw new Error('Workshop document not found');
    }

    const workshopData = workshopSnap.data();
    let challenges = [...(workshopData['challenges'] || [])];

    const subChallenge = challenges[this.data.challengeIndex].challenges[this.data.subChallengeIndex];

    if (status === 'completed') {
      // Handle completion
      subChallenge.status = status;
      subChallenge.completed = Timestamp.now();
      subChallenge.reviewedby = this.currentUserId;
      
      // Add notes if provided
      if (notes.length > 0) {
        subChallenge.completionNotes = notes;
      }

      // Check if this is the last sub-challenge in the main challenge
      const mainChallenge = challenges[this.data.challengeIndex];
      const allSubChallenges = mainChallenge.challenges;
      
      // Check if all sub-challenges in this main challenge are now completed
      const allSubChallengesCompleted = allSubChallenges.every((sub: any) => 
        sub.status === 'completed'
      );

      if (allSubChallengesCompleted) {
        // Mark the main challenge as completed
        challenges[this.data.challengeIndex] = {
          ...mainChallenge,
          status: 'completed',
          completed: Timestamp.now(),
          completedAt: Timestamp.now()
        };
        
        console.log(`Main challenge ${this.data.challengeIndex} marked as completed - all sub-challenges finished`);
      }
      
    } else if (status === 'rework') {
      if (!subChallenge.oldresult) {
        subChallenge.oldresult = [];
      }
      
      const oldResultEntry = {
        result: subChallenge.assignmentresult,
        date: Timestamp.now(),
        notes: notes
      };

      subChallenge.oldresult.push(oldResultEntry);
      subChallenge.status = status;
      subChallenge.reworkRequestedAt = Timestamp.now();
      subChallenge.reviewedby = this.currentUserId;
      
      const mainChallenge = challenges[this.data.challengeIndex];
      if (mainChallenge.status === 'completed') {
        challenges[this.data.challengeIndex] = {
          ...mainChallenge,
          status: 'inprogress',
          completed: null,
          completedAt: null
        };
      }
    }

    await updateDoc(workshopDocRef, {
      challenges: challenges
    });

    console.log(`Assignment status updated to: ${status}`);
  }

  openInNewTab(url: string) {
    window.open(url, '_blank');
  }

  closeDialog() {
    this.dialogRef.close(false);
  }

  // Update form value change detection
  onNoteChange() {
    this.updateComputedBooleans();
  }
}