import { Component, OnInit } from '@angular/core';
import { collection, collectionData, deleteDoc, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { TextComponent } from '../../form-element/text/text.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-create-ael-names',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    TextComponent,
    MatFormFieldModule,
    MatSelectModule,
    MatListModule,
    CommonModule
  ],
  templateUrl: './create-ael-names.component.html',
  styleUrl: './create-ael-names.component.css'
})
export class CreateAelNamesComponent {
  form:FormGroup
  evolutionData = []
  subscription = new Subject<void>();
  constructor(
    private fb : FormBuilder,
    private firestore : Firestore
  ){
    this.form = this.fb.group({
      startpoint:[null,[Validators.required]],
      endpoint:[null,[Validators.required]],
      docid:[doc(collection(this.firestore, 'accelerated evolution level')).id,]
    })
    
    const collectionRef = collection(this.firestore, 'accelerated evolution level')
    collectionData(collectionRef, {idField : 'id'}).pipe(takeUntil(this.subscription)).subscribe(snap => {
      this.evolutionData = snap
    })
    // this.evolutionDataSubscription = this.firestore.collection("accelerated evolution level").valueChanges().subscribe(snap => {
    //   this.evolutionData = snap
    // })
  }

  ngOnInit(): void {}

  ngOnDestroy(){
    this.subscription.next();
    this.subscription.complete();
  }

  onedit(event:MatSelectionListChange){
    // console.log(event.source._value[0]);
    const value = {
      docid :event.source._value[0]['docid'],
      startpoint:event.source._value[0]['startpoint'],
      endpoint:event.source._value[0]['endpoint'],
    }
    this.form.patchValue(value)
  }

  onSubmit(){
    // console.log(this.form.value);
    const formData = this.form.value;
    const docId = formData['docid'];

    const docRef = doc(this.firestore, `accelerated evolution level/${docId}`);

    try {
      setDoc(docRef, formData, { merge: true });
      console.log('Submitted');

      this.form.reset();
      const newId = doc(collection(this.firestore, 'accelerated evolution level')).id;
      this.form.get('docid')?.setValue(newId);
    } catch (err) {
      console.error('Error submitting form:', err);
    }
  }
  

  async onRemove() {
    const formData = this.form.value;
    const docId = formData['docid'];
  
    const docRef = doc(this.firestore, `accelerated evolution level/${docId}`);
  
    try {
      await deleteDoc(docRef); 
      console.log('Deleted');
  
      this.form.reset();
      const newId = doc(collection(this.firestore, 'accelerated evolution level')).id;
      this.form.get('docid')?.setValue(newId);
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  }
  
}
