import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { addDoc, collection, collectionSnapshots, doc, Firestore, getDocs, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-create-space-type',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    FormsModule,
    MatChipsModule,
    CommonModule
  ],
  templateUrl: './create-space-type.component.html',
  styleUrl: './create-space-type.component.css'
})
export class CreateSpaceTypeComponent {
    // Boolean declarations
  isEdit: boolean = false;
  adding: boolean = false;
  isTypeEdit: boolean = false;
  addingType: boolean = false;
  
  // String declarations
  inputTypeValue: string = ''; 
  docIdToTypeEdit: string = '';

  // Object declarations
  typeMap = {};
  subscription = new Subject<void>

  constructor(private firestore: Firestore) { 
    collectionSnapshots(collection(this.firestore, 'A&H_Space_Type'))
  .pipe(takeUntil(this.subscription))
  .subscribe({
    next: (snapshot) => {
      this.typeMap = snapshot.reduce((map, doc) => {
        const data = doc.data();
        map[data["docid"]] = data["typename"];
        return map;
      }, {});
    },
    error: (error) => {
      console.error('Error fetching typenames:', error);
    }
  });
  }

  ngOnInit(): void {
  }

  // fucntion to create space type 
  async createType(fieldName: string) {
    this.addingType = true;
    if (!fieldName) {
      alert('Please enter a type name.'); 
      this.addingType = false;
      return;
    }
  
    const spaceTypeCollection = collection(this.firestore, 'A&H_Space_Type');
    const q = query(spaceTypeCollection, where('typename', '==', fieldName));
    const spaceTypeSnapshot = await getDocs(q);
    
    if (spaceTypeSnapshot.empty) {
      this.addingType = true;
      
      // addDoc automatically generates an ID
      const docRef = await addDoc(spaceTypeCollection, {
        typename: fieldName,
        docid: '' // Set this after creation if needed
      });
      
      // Update with the actual doc ID if needed
      await setDoc(docRef, { docid: docRef.id }, { merge: true });
      
      this.inputTypeValue = '';
      this.addingType = false;
    } else {
      this.addingType = false;
      alert('Type name already exists. Please choose a unique name.');
    }
  } 


  async updateTypeField() {
    if (!this.inputTypeValue?.trim()) {
      alert("Type field is empty");
      return;
    }
  
    try {
      this.addingType = true;
      
      // Check if typename already exists
      const spaceTypeCollection = collection(this.firestore, 'A&H_Space_Type');
      const q = query(spaceTypeCollection, where('typename', '==', this.inputTypeValue.trim()));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Update the document
        const docRef = doc(this.firestore, 'A&H_Space_Type', this.docIdToTypeEdit);
        await updateDoc(docRef, {
          typename: this.inputTypeValue.trim(),
          updatedAt: new Date() // Add timestamp
        });
        
        this.inputTypeValue = '';
        this.isTypeEdit = false;
        this.addingType = false;
        
        console.log('Type updated successfully!');
      } else {
        this.addingType = false;
        alert('Type name already exists. Please choose a unique name.');
      }
    } catch (error) {
      console.error('Error updating type:', error);
      alert('An error occurred while updating. Please try again.');
      this.addingType = false;
    }
  }

  // function to edit type name 
  editTypeField(key: string, value: string){
    this.inputTypeValue = key;
    this.isTypeEdit = true;
    this.docIdToTypeEdit = value;
  }
}
