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

interface Tag {
  id: number;
  name: string;
  color: string;
  participantCount: number;
  isEditing?: boolean;
  isActive: boolean;
}

interface Participant {
  id: number;
  name: string;
  email: string;
  initials: string;
  tags: Tag[];
}

@Component({
  selector: 'app-tag-participants',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    NgxMatSelectSearchModule,
    MatSelectModule
  ],
  templateUrl: './tag-participants.component.html',
  styleUrl: './tag-participants.component.css'
})
export class TagParticipantsComponent {

  activeTab: string = 'manage';
  
  // Tag Management
  mapTagID: any = {};
  allTags = [];
  activeTags = [];
  filteredTags = [];
  newTagName: string = '';
  editTagId: string = '';
  filterAssignList: string = '';
  filterRemoveList: string = '';
  filterReplaceToList: string = '';
  filterReplaceWithList: string = '';

  isEditing: boolean = false;
  categoryList: any[] = [];
  mapCategoryID: any = {};
  
  // Selected Participants
  selectedParticipants = [];
  
  // Bulk Action Selections
  selectedTagToAssign = [];
  selectedTagToRemove = null;
  selectedTagToReplace = null;
  selectedTagReplaceWith = null;
  tagsForOptions = ['live event', 'queue event', 'video ask', 'journey coach'];
  newTagsFor: string[] = [];

  loggedInProfileid

  constructor(
    @Inject(MAT_DIALOG_DATA) public data:any, 
    public dialogRef: MatDialogRef<TagParticipantsComponent>,
    private firestore: Firestore,
    private authService: AuthguardService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    if (data.data) {
      console.log(data);
      this.loggedInProfileid = data["loggedInprofileid"]
      this.selectedParticipants = data.data;
      this.filteredTags = data.tagList;
      this.mapTagID = data.mapfilter;
    }
  }

  ngOnInit(): void {
    this.loadTags();
    // collectionData(collection(this.firestore, "participant tags category")).subscribe((cats: any[]) => {
    //   this.categoryList = cats;
    //   cats.forEach(c => this.mapCategoryID[c['id']] = c['name']);
    // });
    
    if (this.selectedParticipants.length > 0) {
      this.activeTab = 'assign';
    }
  }

  // Function to open loading component 
  get loading() {
    return this.dialog.open(LoadingProgressComponent, { 
      data: { msg: "Processing Please Wait" }, 
      disableClose: true 
    })
  }

  // Function to fetch tags from collection 
  loadTags(): void {
    collectionData(query(collection(this.firestore, "participant tags"), orderBy("created", "desc"))).subscribe((tag)=> {
      if(tag.length != 0) {
        let tempTags = [];
        for (let i = 0; i < tag.length; i++) {
          const element = tag[i];
          tempTags.push(element);

          if(i+1 == tag.length) {
            this.allTags = tempTags;
            this.activeTags =  this.allTags.filter((e)=> e['isActive']);
          }
        }
      }
    });
  }

  // Function to create new tag 
  async addTag() {
    if (!this.newTagName.trim()) {
      alert('Please enter a tag name');
      return;
    }

    const isExists = this.allTags.find((e) => e['isActive'] == false && e['name'].trim().toLowerCase() === this.newTagName.trim().toLowerCase());

    const isDuplicate = this.activeTags.some(
      tag => tag.name.trim().toLowerCase() === this.newTagName.trim().toLowerCase()
    );

    if (isExists) {
      let existingTag = isExists;
      existingTag['isActive'] = true;
      existingTag['tagsfor'] = this.newTagsFor;

      await updateDoc(doc(this.firestore, "participant tags", existingTag.id), existingTag).then(() => {
        this.showSnackBar("Tag Added Successfully");
        this.resetTagForm();
      }).catch((error) => {
        this.showSnackBar("Error Adding Tag");
        console.log(error);
      });
    } else if (isDuplicate) {
      alert('A tag with this name already exists');
    } else {
      const newTag = {
        id: doc(collection(this.firestore, 'participant tags')).id,
        name: this.newTagName.trim(),
        tagsfor: this.newTagsFor,
        isActive: true,
        created: new Date(),
        createdby: this.loggedInProfileid
      };

      setDoc(doc(this.firestore, "participant tags", newTag.id), newTag).then(() => {
        this.showSnackBar("Tag Added Successfully");
        this.resetTagForm();
      }).catch((error) => {
        this.showSnackBar("Error Adding Tag");
        console.log(error);
      });
    }
  }

  // Function to delete tag 
  deleteTag(tag): void {
    const confirmDelete = confirm(`This is a soft delete, participant tagged with this tag will not be removed. Are you sure you want to delete "${tag.name}"?`);

    if (!confirmDelete) {
      return;
    }

    tag.isActive = false;

    updateDoc(doc(this.firestore, "participant tags", tag.id), tag).then(()=> {
      this.showSnackBar("Tag Deleted Successfully");
    }).catch((error)=> {
      this.showSnackBar("Error Deleting Tag");
      console.log(error);
    });
  }

  // Function to open snack bar 
  private showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
    });
  }

  // Function to edit tag 
  editTag(tag: any): void {
    this.isEditing = true;
    this.editTagId = tag.id;
  }
  
  cancelEdit(): void {
    this.isEditing = false;
    this.editTagId = '';
    this.loadTags(); // reload to reset any unsaved name changes
  }

  // Function to editing tag 
  saveTagEdit(tag): void {
    if (!tag.name.trim()) {
      alert('Tag name cannot be empty');
      this.loadTags();
      return;
    }

    const isDuplicate = this.activeTags.some(
      t => t.id !== tag.id && t.name.trim().toLowerCase() === tag.name.trim().toLowerCase()
    );

    if (isDuplicate) {
      alert('A tag with this name already exists');
      this.loadTags();
      return;
    }

    updateDoc(doc(this.firestore, "participant tags", tag.id), {
      name: tag.name.trim(),
      tagsfor: tag.tagsfor || []
    }).then(() => {
      this.showSnackBar("Saved Successfully");
      this.isEditing = false;
      this.editTagId = '';
    }).catch((error) => {
      this.showSnackBar("Error Saving Tag");
      console.log(error);
    });
  }

  // Function to reset tag 
  resetTagForm(): void {
    this.newTagName = '';
    this.newTagsFor = [];
  }

  updateTagsFor(tag: any): void {
    updateDoc(doc(this.firestore, "participant tags", tag.id), {
      tagsfor: tag.tagsfor || []
    }).then(() => {
      this.showSnackBar("Updated successfully");
    }).catch(err => {
      this.showSnackBar("Error updating");
      console.log(err);
    });
  }

  // Function to bulk assign tag 
  async bulkAssignTag(): Promise<void> {
    if (this.selectedTagToAssign.length == 0) {
      alert("Select a tag to assign");
      return;
    }

    if (this.selectedParticipants.length === 0) {
      alert("No participants selected");
      return;
    }

    var x  = confirm(`Are you sure to Bulk Assign Tag`);
    if (x) {
      const loading = this.loading;
      const tagToAssign = this.selectedTagToAssign;

      try {
        const BATCH_SIZE = 500;
        let assignedCount = 0;

        // Process in chunks of 500
        for (let i = 0; i < this.selectedParticipants.length; i += BATCH_SIZE) {
          const batch = writeBatch(this.firestore);
          const chunk = this.selectedParticipants.slice(i, i + BATCH_SIZE);

          for (const participant of chunk) {
            const participantRef = doc(this.firestore, 'participant metadata', participant.profileid);

            batch.update(participantRef, {
              profiletags: arrayUnion(...tagToAssign)
            });

            const logId = doc(collection(this.firestore, 'participant tag logs')).id;
            var log = {
              logid: logId,
              profileid: participant.profileid,
              type: "added",
              tags: tagToAssign,
              updated: new Date(),
              updatedby: this.loggedInProfileid,
              source: "bulk"
            }
            batch.set(doc(this.firestore, 'participant tag logs', logId), log);

            assignedCount++;
          }

          await batch.commit();
        }

        loading.close();
        alert(`Successfully assigned tag to ${assignedCount} participants`);

        this.selectedTagToAssign = [];
      } catch (error) {
        loading.close();
        console.error('Error in bulk tag assignment:', error);
        alert('Failed to assign tags. Please try again.');
      }
    }
  }

  // Function to bulk remove tag 
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

    const tagToRemove = this.selectedTagToRemove;
    const loading = this.loading;

    try {
      const BATCH_SIZE = 500;
      let removedCount = 0;

      // Process in chunks of 500
      for (let i = 0; i < this.selectedParticipants.length; i += BATCH_SIZE) {
        const batch = writeBatch(this.firestore);
        const chunk = this.selectedParticipants.slice(i, i + BATCH_SIZE);

        for (const participant of chunk) {
          const participantRef = doc(this.firestore, 'participant metadata', participant.profileid);

          batch.update(participantRef, {
            profiletags: arrayRemove(tagToRemove)
          });

          const logId = doc(collection(this.firestore, 'participant tag logs')).id;
          var log = {
            logid: logId,
            profileid: participant.profileid,
            type: "removed",
            tags: [tagToRemove],
            updated: new Date(),
            updatedby: this.loggedInProfileid,
            source: "bulk"
          }
          batch.set(doc(this.firestore, 'participant tag logs', logId), log);

          removedCount++;
        }

        await batch.commit();
      }

      loading.close();
      alert(`Successfully removed tag for ${removedCount} participants`);

      this.selectedTagToRemove = null;
    } catch (error) {
      loading.close();
      console.error('Error in bulk tag removal:', error);
      alert('Failed to remove tags. Please try again.');
    }
  }

  // Function to bulk replace tag 
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

    const oldTag = this.selectedTagToReplace;
    const newTag = this.selectedTagReplaceWith;
    const loading = this.loading;

    try {
      const BATCH_SIZE = 250;
      let replacedCount = 0;

      // Process in chunks of 500
      for (let i = 0; i < this.selectedParticipants.length; i += BATCH_SIZE) {
        const batch = writeBatch(this.firestore);
        const chunk = this.selectedParticipants.slice(i, i + BATCH_SIZE);

        for (const participant of chunk) {
          const participantRef = doc(this.firestore, 'participant metadata', participant.profileid);

          // Remove
          batch.update(participantRef, {
            profiletags: arrayRemove(oldTag)
          });

          const removeLogId = doc(collection(this.firestore, 'participant tag logs')).id;
          var removeLog = {
            logid: removeLogId,
            profileid: participant.profileid,
            type: "removed",
            tags: [oldTag],
            updated: new Date(),
            updatedby: this.loggedInProfileid,
            source: "bulk"
          }
          batch.set(doc(this.firestore, 'participant tag logs', removeLogId), removeLog);
          
          // Add
          batch.update(participantRef, {
            profiletags: arrayUnion(newTag)
          });
          const addLogId = doc(collection(this.firestore, 'participant tag logs')).id;
          var addLog = {
            logid: addLogId,
            profileid: participant.profileid,
            type: "added",
            tags: [newTag],
            updated: new Date(),
            updatedby: this.loggedInProfileid,
            source: "bulk"
          }
          batch.set(doc(this.firestore, 'participant tag logs', addLogId), addLog);

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
      console.error('Error in bulk tag replacing:', error);
      alert('Failed to replace tags. Please try again.');
    }
  }

  // Function to filter replace tags 
  getReplacementTags() {
    if (!this.selectedTagToReplace) {
      return [];
    }

    const filteredTags = this.activeTags.filter(
      t => t.isActive && t.id !== this.selectedTagToReplace
    );

    if (filteredTags != null) {
      const filterValue = (this.filterReplaceWithList != null && this.filterReplaceWithList != '') ? this.filterReplaceWithList.trim().toLowerCase() : ''
      return filteredTags.filter(e => e.name.trim().toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }

  // Function to filter assign tags on search
  onfilterassignlist() {
    if (this.activeTags != null) {
      const filterValue = (this.filterAssignList != null && this.filterAssignList != '') ? this.filterAssignList.trim().toLowerCase() : ''
      return this.activeTags.filter(e => e.name.trim().toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }

  // Function to filter remove tags on search
  onfilterremovelist() {
    if (this.filteredTags != null) {
      const filterValue = (this.filterRemoveList != null && this.filterRemoveList != '') ? this.filterRemoveList.trim().toLowerCase() : ''
      return this.filteredTags.filter(e => this.mapTagID[e].trim().toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }

  // Function to filter assign tags on search
  onfilterreplacetolist() {
    if (this.activeTags != null) {
      const filterValue = (this.filterReplaceToList != null && this.filterReplaceToList != '') ? this.filterReplaceToList.trim().toLowerCase() : ''
      return this.activeTags.filter(e => e.name.trim().toLowerCase().indexOf(filterValue) === 0)
    } else return []
  }
}
