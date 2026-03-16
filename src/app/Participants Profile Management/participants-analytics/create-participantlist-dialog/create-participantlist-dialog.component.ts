import { Component, Inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { collection, collectionData, doc, Firestore, setDoc, Timestamp, updateDoc } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { NgFor, NgIf } from '@angular/common';
import { MatCheckbox } from '@angular/material/checkbox';

@Component({
  selector: 'app-create-participantlist-dialog',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    NgFor,
    NgIf,
    MatCheckbox
  ],
  templateUrl: './create-participantlist-dialog.component.html',
  styleUrl: './create-participantlist-dialog.component.css'
})
export class CreateParticipantlistDialogComponent {
  dataSource: MatTableDataSource<any> = new MatTableDataSource();
  newList: string = '';
  listData:any=[];
  selectedListId: string | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private formbuilder: FormBuilder,
    private firestore: Firestore
  ) {
    console.log(data);
    this.dataSource.data = data;
    
  }

  ngOnInit() {
    const listRef = collection(this.firestore, 'participant list');
    collectionData(listRef, { idField: 'id' }).subscribe((data) => {
      this.listData = data;
      console.log('Fetched lists:', this.listData);
    });
  }


  addList() {
    if (!this.newList.trim()) {
      alert('Please enter a list name');
      return;
    }

    const nameList = this.dataSource.data.map((item: any) => item.profileid).filter((profileid: string) => !!profileid);

    const docRef = doc(collection(this.firestore, 'participant list'));

    setDoc(docRef, {
      docid: docRef.id,
      profilelist: nameList,
      createddate: Timestamp.now(),
      listname: this.newList,
    }).then(() => {
      console.log('List created successfully');
      this.newList = '';
    });
    
  }

  async mergeToList() {
    if (!this.selectedListId) {
      alert('Please select a list');
      return;
    }

    const selectedRef = doc(this.firestore, 'participant list', this.selectedListId);
    const newProfiles = this.dataSource.data.map((p: any) => p.profileid).filter(Boolean);
    const existing = this.listData.find((item: any) => item.docid === this.selectedListId);
    const mergedList = Array.from(new Set([...existing.profilelist, ...newProfiles]));
    await updateDoc(selectedRef, {
      profilelist: mergedList,
      updateddate: Timestamp.now()
    });
    console.log('Profiles merged successfully');
    this.dialogRef.close(true);
  }
}
