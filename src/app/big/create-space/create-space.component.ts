import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-create-space',
  imports: [
   MatFormFieldModule,
   MatInputModule,
   CommonModule,
   MatChipsModule,
   MatIconModule,
   MatButtonModule,
   FormsModule
  ],
  templateUrl: './create-space.component.html',
  styleUrl: './create-space.component.css'
})
export class CreateSpaceComponent {
 
    // Boolean declarations
    isEdit: boolean = false;
    adding: boolean = false;
    isTypeEdit: boolean = false;
    addingType: boolean = false;
    
    // String declarations
    inputValue: string = ''; 
    inputShortValue: string = ''; 
    docIdToEdit = '';
    private subscription = new Subject<void>();  
  
    // Object declarations
    spaceMap = {};

  constructor(private firestore: Firestore) {
    collectionSnapshots(collection(this.firestore,"A&H_Space_Name")).pipe(takeUntil(this.subscription)).subscribe(snapshot => {
      const data = snapshot.map(doc => doc.data());
      const map = {};
  
      data.forEach(item => {
        map[item["docid"]] = {
          spacename: item["spacename"],
          shortname: item["shortname"]
        };
      });
  
      this.spaceMap = map;
    }, error => {
      console.error('Error fetching fieldnames:', error);
    });
   }

  ngOnInit(): void {
  }

   // function to create space name 
   createField(fieldName: string,shortFieldName: string) {
    this.adding = true;
    if (!fieldName || !shortFieldName) {
      alert('Please enter a field & short name.'); 
      this.adding = false;
      return;
    }

    const spaceCollectionRef = collection(this.firestore,'A&H_Space_Name');
      getDocs(spaceCollectionRef).then(snapshot => {
        if (snapshot.size >= 8) {
          this.adding = false;
          alert('Cannot add more than 8 spaces.');
          return;
        }
        getDocs(query(spaceCollectionRef,where('spacename', '==', fieldName),where('shortname','==',shortFieldName))).then(spaceSnapshot => {
        if (spaceSnapshot.empty) {
          this.adding = true;
          const spaceDoc = doc(spaceCollectionRef);
          const docId = spaceDoc.id;
          setDoc(spaceDoc,{
            spacename: fieldName,
            shortname: shortFieldName,
            docid: docId
          }).then(() => {
            this.inputValue = '';
            this.inputShortValue = '';
            this.adding = false;
          });
        } else {
          this.adding = false;
          alert('Space name already exists. Please choose a unique name.');
        }
      });
    });
  }

  // function to update space name 
  updateField(){
    if (!this.inputValue) {
      alert("field is empty");
      return;
    }
    const spaceCollection = collection(this.firestore,'A&H_Space_Name');
    getDocs(query(spaceCollection,where('spacename', '==', this.inputValue),where('shortname','==',this.inputShortValue))).then(snapshot => {
      if (snapshot.empty) {
        this.adding = true;
        const spaceDoc = doc(spaceCollection,this.docIdToEdit);
        updateDoc(spaceDoc,{
          spacename: this.inputValue,
          shortname: this.inputShortValue
        }).then(()=>{
          this.inputValue =''
          this.inputShortValue =''
          this.isEdit = false
          this.adding = false;
        });
      } else {
        alert('Space name already exists. Please choose a unique name.');
      }
    });
  }

  // function to edit space name 
  editField(value: { spacename: string, shortname: string }, key: string) {
    this.inputValue = value.spacename;
    this.inputShortValue = value.shortname;
    this.isEdit = true;
    this.docIdToEdit = key;
  }

}
