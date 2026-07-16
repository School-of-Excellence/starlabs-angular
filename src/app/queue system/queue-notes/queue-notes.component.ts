import { Component, Inject, ElementRef, ViewChild, OnInit, HostListener } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { Observable, Subject } from 'rxjs';
import { map, startWith, takeUntil } from 'rxjs/operators';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { collectionData, Firestore, collection, doc, setDoc, query, where } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

interface Note {
  text: string;
  updatedon: Date;
  author?: string;
  stage: string;
}

@Component({
  selector: 'app-queue-notes',
  imports: [
    MatDividerModule,
    MatIconModule,
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatProgressSpinner
  ],
  templateUrl: './queue-notes.component.html',
  styleUrl: './queue-notes.component.css'
})
export class QueueNotesComponent {
  separatorKeysCodes: number[] = [ENTER, COMMA];
  tagCtrl = new FormControl('');
  newNoteCtrl = new FormControl('');
  filteredTags: Observable<string[]>;
  selectedTags: string[] = [];
  allTags: string[] = [];
  notesList = [];
  loading = true;
  mapProfile = {}
   private subscriptionHandle = new Subject<void>()
  @ViewChild('tagInput') tagInput: ElementRef<HTMLInputElement>;

  constructor( public dialogRef: MatDialogRef<QueueNotesComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore,
    public guard: AuthguardService,) {
      guard.getProfileMap().then(data => this.mapProfile = data.map);
      this.selectedTags = this.data.tags || [];
    
      this.notesList = this.data.notesList && Array.isArray(this.data.notesList) ? [...this.data.notesList] : [];
      console.log('Initial notesList:', this.notesList);
    
    }

  ngOnInit(): void {

    this.loadTagsFromFirestore();
    
    this.filteredTags = this.tagCtrl.valueChanges.pipe(
      startWith(null),
      map((tag: string | null) => tag 
        ? this._filter(tag) 
        : this.allTags.filter(t => !this.selectedTags.includes(t))
      )
    );
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey && event.key === 'Enter') {
      this.addNote();
      event.preventDefault(); 
    }
  }

 
  addNote(): void {
    console.log('asdftghujkl;');
    
    if (this.newNoteCtrl.value && this.newNoteCtrl.value.trim() !== '') {
      const newNote = {
        text: this.newNoteCtrl.value.trim(),
        updatedon: new Date(), 
        author: this.data.author || 'Current User',
        stage: this.data.currentstage || ''
      };
      
      this.notesList.unshift(newNote);
      this.newNoteCtrl.setValue(''); // Clear the input after adding the note
      
      console.log('Note added successfully');
      console.log('Current notes list:', this.notesList);
    } else {
      console.warn('Note cannot be empty');
    }
  }
  
  // Remove a note from the list
  removeNote(index: number): void {
    this.notesList.splice(index, 1);
  }
  
  // Load all existing tags from Firestore
  loadTagsFromFirestore(): void {
    this.loading = true;
    collectionData(query(collection(this.firestore, 'queue tags')))
    .pipe(takeUntil(this.subscriptionHandle))
    .subscribe({
      next: (tagsData: any[]) => {
        this.allTags = tagsData.filter(t => t.isDelete !== true).map(t => t.name);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading tags:', error);
        this.loading = false;
      }
    });
  }

  add(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value && !this.selectedTags.includes(value)) {
      this.selectedTags.push(value);
      
      if (!this.allTags.includes(value)) {
        this.addTagToFirestore(value);
      }
    }

    // Clear the input value
    // event.chipInput!.clear();
    this.tagCtrl.setValue(null);
  }

  addTagToFirestore(tagName: string): void {
    const tagId = doc(collection(this.firestore,'queue tags')).id; 
    setDoc(doc(this.firestore,'queue tags',tagId),{
      id: tagId,
      name: tagName,
      createdAt: new Date(),
      isDelete: false
    })
    .then(() => {
      console.log('Tag added to Firestore:', tagName);
      if (!this.allTags.includes(tagName)) {
        this.allTags.push(tagName);
      }
    })
    .catch(error => {
      console.error('Error adding tag to Firestore:', error);
    });
  }

  remove(tag: string): void {
    const index = this.selectedTags.indexOf(tag);
    if (index >= 0) {
      this.selectedTags.splice(index, 1);
    }
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.viewValue;
    if (!this.selectedTags.includes(value)) {
      this.selectedTags.push(value);
    }
    this.tagInput.nativeElement.value = '';
    this.tagCtrl.setValue(null);
  }

  addQuickTag(tag: string): void {
    if (!this.selectedTags.includes(tag)) {
      this.selectedTags.push(tag);
    }
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.allTags.filter(tag => 
      tag.toLowerCase().includes(filterValue) && 
      !this.selectedTags.includes(tag)
    );
  }

  save(): void {
    const result = {
      notesList: this.notesList,
      notes: this.notesList.length > 0 ? this.notesList[0].text : '',
      tags: this.selectedTags
    };
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close();
  }
  ngOnDestroy(){
    this.subscriptionHandle.complete();
    this.subscriptionHandle.next();
  }

}


