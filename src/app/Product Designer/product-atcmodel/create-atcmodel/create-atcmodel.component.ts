import { CommonModule } from '@angular/common';
import { Component,OnInit,Inject } from '@angular/core';
import { collection, doc, Firestore, getDocs, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import {MatDialog, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TextComponent } from '../../../form-element/text/text.component';
import { AutoCompleteWithChipComponent } from '../../../form-element/auto-complete-with-chip/auto-complete-with-chip.component';
import { MatChipComponent } from '../../../form-element/mat-chip/mat-chip.component';
import { TextAreaComponent } from '../../../form-element/text-area/text-area.component';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-create-atcmodel',
  imports: [
    ReactiveFormsModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatButtonModule,
    TextComponent,
    AutoCompleteWithChipComponent,
    MatChipComponent,
    TextAreaComponent,
  ],
  templateUrl: './create-atcmodel.component.html',
  styleUrl: './create-atcmodel.component.css'
})
export class CreateAtcmodelComponent {

  form : FormGroup
  contentData = []

  constructor(
    private fb : FormBuilder,
    private firestore : Firestore,
    public dialogRef: MatDialogRef<CreateAtcmodelComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ){
    this.form = this.fb.group({
      atcmodel:[null,[Validators.required]],
      evolutiontype:[null,[Validators.required]],
      description:[null,[Validators.required]],
      category:[[],],
      videourl:[[],],
      docid: [doc(collection(this.firestore, 'atc model')).id]
    })
    const contentCollection = collection(this.firestore, 'content_urls')
    getDocs(contentCollection).then(snap => {
        this.contentData = snap.docs.map(e =>{
        const element = e.data()
        element['ref'] = e.ref
        return element
      })
    })

    if(this.data.type === 'edit'){
      this.form.patchValue(this.data.doc)
    }
    
  }

  ngOnInit() {
   
  }

  async onSubmit(){
    if (this.form.valid) {
      try {
        const docRef = doc(this.firestore, 'atc model', this.form.value.docid);
        await setDoc(docRef, this.form.value, { merge: true });
        this.dialogRef.close(this.form.value);
      } catch (error) {
        console.error('Error saving:', error);
      }
    }
  }
    

}
