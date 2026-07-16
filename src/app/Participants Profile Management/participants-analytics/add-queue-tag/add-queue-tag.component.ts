import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { arrayRemove, arrayUnion, collection, collectionData, doc, Firestore, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-add-queue-tag',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    NgxMatSelectSearchModule,
    MatSelectModule
  ],
  templateUrl: './add-queue-tag.component.html',
  styleUrl: './add-queue-tag.component.css'
})
export class AddQueueTagComponent {

  activeTab: string = 'manage';

  // Tag Management
  mapTagID: any = {};
  allTags = [];
  filteredTags = [];
  newTagName: string = '';
  editTagId: string = '';
  filterAssignList: string = '';
  filterRemoveList: string = '';
  filterReplaceToList: string = '';
  filterReplaceWithList: string = '';

  isEditing: boolean = false;

  selectedParticipants = [];

  selectedTagToAssign = [];
  selectedTagToRemove = null;
  selectedTagToReplace = null;
  selectedTagReplaceWith = null;

  loggedInProfileid

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<AddQueueTagComponent>,
    private firestore: Firestore,
    private authService: AuthguardService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    if (data.data) {
      this.loggedInProfileid = data["loggedInprofileid"]
      this.selectedParticipants = data.data;
      this.filteredTags = data.tagList;
    }
  }

  ngOnInit(): void {
    this.loadTags();

    if (this.selectedParticipants.length > 0) {
      this.activeTab = 'assign';
    }
  }

  // Fetch all tags
  loadTags(): void {
    collectionData(
      query(
        collection(this.firestore, "queue tags"),
        orderBy("createdAt", "desc")
      )
    ).subscribe((tag) => {
      this.allTags = (tag || []).filter(t => t['isDelete'] !== true);
      this.mapTagID = {};
      this.allTags.forEach(t => {
        this.mapTagID[t['id']] = t['name'];
      });
    });
  }

  get loading() {
    return this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Processing Please Wait" },
      disableClose: true
    })
  }

  // Add Tag
  async addTag() {
    if (!this.newTagName.trim()) {
      alert('Please enter a tag name');
      return;
    }

    const isDuplicate = this.allTags.some(
      tag => tag.name.trim().toLowerCase() === this.newTagName.trim().toLowerCase()
    );

    if (isDuplicate) {
      alert('A tag with this name already exists');
      return;
    }

    const newTag = {
      id: doc(collection(this.firestore, 'queue tags')).id,
      name: this.newTagName.trim(),
      createdAt: new Date(),
      createdby: this.loggedInProfileid,
      isDelete: false
    };

    setDoc(doc(this.firestore, "queue tags", newTag.id), newTag).then(() => {
      this.showSnackBar("Tag Added Successfully");
      this.resetTagForm();
    }).catch((error) => {
      this.showSnackBar("Error Adding Tag");
      console.log(error);
    });
  }

  // Soft delete Queue Tag
  deleteTag(tag): void {
    const confirmDelete = confirm(`Delete tag "${tag.name}"? This won't remove the tag from participants already tagged with it.`);

    if (!confirmDelete) {
      return;
    }

    updateDoc(doc(this.firestore, "queue tags", tag.id), {
      isDelete: true
    }).then(() => {
      this.showSnackBar("Tag Deleted Successfully");
    }).catch((error) => {
      this.showSnackBar("Error Deleting Tag");
      console.log(error);
    });
  }

  private showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
    });
  }

  editTag(tag: any): void {
    this.isEditing = true;
    this.editTagId = tag.id;
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.editTagId = '';
    this.loadTags();
  }

  saveTagEdit(tag): void {
    if (!tag.name.trim()) {
      alert('Tag name cannot be empty');
      this.loadTags();
      return;
    }

    const isDuplicate = this.allTags.some(
      t => t.id !== tag.id && t.name.trim().toLowerCase() === tag.name.trim().toLowerCase()
    );

    if (isDuplicate) {
      alert('A tag with this name already exists');
      this.loadTags();
      return;
    }

    updateDoc(doc(this.firestore, "queue tags", tag.id), {
      name: tag.name.trim()
    }).then(() => {
      this.showSnackBar("Saved Successfully");
      this.isEditing = false;
      this.editTagId = '';
    }).catch((error) => {
      this.showSnackBar("Error Saving Tag");
      console.log(error);
    });
  }

  resetTagForm(): void {
    this.newTagName = '';
  }

  // bulk assign tags
  async bulkAssignTag(): Promise<void> {
    if (this.selectedTagToAssign.length == 0) {
      alert("Select a tag to assign");
      return;
    }

    if (this.selectedParticipants.length === 0) {
      alert("No participants selected");
      return;
    }

    var x = confirm(`Are you sure to Bulk Assign Tag`);
    if (x) {
      const loading = this.loading;
      const tagNamesToAssign = this.selectedTagToAssign.map(id => this.mapTagID[id]).filter(n => !!n);

      try {
        const BATCH_SIZE = 500;
        let assignedCount = 0;

        for (let i = 0; i < this.selectedParticipants.length; i += BATCH_SIZE) {
          const batch = writeBatch(this.firestore);
          const chunk = this.selectedParticipants.slice(i, i + BATCH_SIZE);

          for (const participant of chunk) {
            const tokenRef = doc(this.firestore, 'queue_token', participant.docid);
            const currentTags: string[] = Array.isArray(participant.tags) ? participant.tags : [];
            const mergedTags = Array.from(new Set([...currentTags, ...tagNamesToAssign]));

            batch.update(tokenRef, {
              tags: mergedTags
            });
            participant.tags = mergedTags;
            assignedCount++;
          }
          await batch.commit();
        }

        loading.close();
        alert(`Successfully assigned tag to ${assignedCount} participants`);

        this.selectedTagToAssign = [];
      } catch (error) {
        loading.close();
        console.error('Error in bulk queue tag assignment:', error);
        alert('Failed to assign tags. Please try again.');
      }
    }
  }

  //bulk remove tag
  async bulkRemoveTag(): Promise<void> {
    if (!this.selectedTagToRemove) {
      alert("Select a tag to assign");
      return;
    }

    if (this.selectedParticipants.length === 0) {
      alert("No participants selected");
      return;
    }

    const confirmRemove = confirm(
      `Are you sure you want to remove tag "${this.mapTagID[this.selectedTagToRemove]}" from ${this.selectedParticipants.length} participant(s)?`
    );

    if (!confirmRemove) {
      return;
    }

    const tagNameToRemove = this.mapTagID[this.selectedTagToRemove];
    const loading = this.loading;

    try {
      const BATCH_SIZE = 500;
      let removedCount = 0;

      for (let i = 0; i < this.selectedParticipants.length; i += BATCH_SIZE) {
        const batch = writeBatch(this.firestore);
        const chunk = this.selectedParticipants.slice(i, i + BATCH_SIZE);

        for (const participant of chunk) {
          const tokenRef = doc(this.firestore, 'queue_token', participant.docid);

          const currentTags: string[] = Array.isArray(participant.tags) ? participant.tags : [];
          const updatedTags = currentTags.filter(t => t !== tagNameToRemove);

          batch.update(tokenRef, {
            tags: updatedTags
          });

          participant.tags = updatedTags;

          removedCount++;
        }

        await batch.commit();
      }

      loading.close();
      alert(`Successfully removed tag for ${removedCount} participants`);

      this.selectedTagToRemove = null;
    } catch (error) {
      loading.close();
      console.error('Error in bulk queue tag removal:', error);
      alert('Failed to remove tags. Please try again.');
    }
  }

  //bulk replace tag
  async bulkReplaceTag(): Promise<void> {
    if (!this.selectedTagToReplace || !this.selectedTagReplaceWith) {
      return;
    }

    const confirmReplace = confirm(
      `Are you sure you want to replace "${this.mapTagID[this.selectedTagToReplace]}" with "${this.mapTagID[this.selectedTagReplaceWith]}" for ${this.selectedParticipants.length} participant(s)?`
    );

    if (!confirmReplace) {
      return;
    }

    const oldTagName = this.mapTagID[this.selectedTagToReplace];
    const newTagName = this.mapTagID[this.selectedTagReplaceWith];
    const loading = this.loading;

    try {
      const BATCH_SIZE = 250;
      let replacedCount = 0;

      for (let i = 0; i < this.selectedParticipants.length; i += BATCH_SIZE) {
        const batch = writeBatch(this.firestore);
        const chunk = this.selectedParticipants.slice(i, i + BATCH_SIZE);

        for (const participant of chunk) {
          const tokenRef = doc(this.firestore, 'queue_token', participant.docid);

          const currentTags: string[] = Array.isArray(participant.tags) ? participant.tags : [];
          const updatedTags = Array.from(
            new Set(currentTags.filter(t => t !== oldTagName).concat(newTagName))
          );

          // Single update per doc per batch — avoids issuing two separate field
          // transforms (remove then union) on the same field in one batch, which
          // is unreliable; here it's one plain array write instead.
          batch.update(tokenRef, {
            tags: updatedTags
          });

          participant.tags = updatedTags;

          replacedCount++;
        }

        await batch.commit();
      }

      loading.close();
      alert(`Successfully replaced tag for ${replacedCount} participants`);

      this.selectedTagToReplace = null;
      this.selectedTagReplaceWith = null;
    } catch (error) {
      loading.close();
      console.error('Error in bulk queue tag replacing:', error);
      alert('Failed to replace tags. Please try again.');
    }
  }

  getReplacementTags() {
    if (!this.selectedTagToReplace) {
      return [];
    }

    const filtered = this.allTags.filter(t => t.id !== this.selectedTagToReplace);

    const filterValue = (this.filterReplaceWithList != null && this.filterReplaceWithList != '') ? this.filterReplaceWithList.trim().toLowerCase() : ''
    return filtered.filter(e => e.name.trim().toLowerCase().indexOf(filterValue) === 0)
  }

  onfilterassignlist() {
    const filterValue = (this.filterAssignList != null && this.filterAssignList != '') ? this.filterAssignList.trim().toLowerCase() : ''
    return this.allTags.filter(e => e.name.trim().toLowerCase().indexOf(filterValue) === 0)
  }

  onfilterremovelist() {
    if (this.filteredTags != null) {
      const filterValue = (this.filterRemoveList != null && this.filterRemoveList != '') ? this.filterRemoveList.trim().toLowerCase() : ''
      return this.filteredTags.filter(e => this.mapTagID[e].trim().toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }

  onfilterreplacetolist() {
    const filterValue = (this.filterReplaceToList != null && this.filterReplaceToList != '') ? this.filterReplaceToList.trim().toLowerCase() : ''
    return this.allTags.filter(e => e.name.trim().toLowerCase().indexOf(filterValue) === 0)
  }
}