import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';
import { doc, Firestore, serverTimestamp, updateDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-draft-queue-planning-dialog',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatRadioModule,
    FormsModule
  ],
  templateUrl: './draft-queue-planning-dialog.component.html',
  styleUrl: './draft-queue-planning-dialog.component.css'
})
export class DraftQueuePlanningDialogComponent {

  selectedDraft: any[] = [];

  constructor(
    public firestore: Firestore,
    public dialogRef: MatDialogRef<DraftQueuePlanningDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { drafts, queuename: string, profileid:string }
  ) {
    // Pre-select the most recent draft
    if (data.drafts && data.drafts.length > 0) {
      this.selectedDraft = [data.drafts[0]];
    }
  }

  formatDateTime(timestamp: any): string {
    if (!timestamp) return 'N/A';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  onLoadDraft(): void {
    if (this.selectedDraft && this.selectedDraft.length > 0) {
      this.dialogRef.close(this.selectedDraft[0]);
    }
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  async deleteDraft(draft,index) {

    const confirmDelete = confirm('Are you sure you want to delete this draft? This action cannot be undone.');
    if (!confirmDelete) return;
    try {
      const draftRef = doc(this.firestore, 'queue planning draft', draft['docid']);
      await updateDoc(draftRef, {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: this.data.profileid
      });
      
      alert('Draft deleted successfully!');
      
      if (index !== -1) {
        this.data.drafts.splice(index, 1);
      }

      if(this.data.drafts.length == 0){
        this.onCancel();
      }

    } catch (error) {
      console.error('Error deleting draft:', error);
      alert('Error deleting draft. Please try again.');
    }
  }

}
