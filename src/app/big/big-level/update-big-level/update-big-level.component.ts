import { Component, Inject } from '@angular/core';
import { FormGroup, Validators, FormBuilder, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask } from '@angular/fire/storage';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-update-big-level',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    FormsModule,
    MatInputModule,
    MatButtonModule,
    CommonModule,
    MatSelectModule
  ],
  templateUrl: './update-big-level.component.html',
  styleUrl: './update-big-level.component.css'
})
export class UpdateBigLevelComponent {
levelForm!: FormGroup
  loading:boolean = false
  bigleveltypes:string [] = []

  constructor(
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public dailogData,
    public dialogRef: MatDialogRef<any>,
    public firestore: Firestore,
    public storage: Storage
  ) {
    getDoc(doc(this.firestore,'static meta data','B!G Level Type')).then((bigleveltype)=>{
      this.bigleveltypes = []
      if(bigleveltype.exists()){
        this.bigleveltypes = bigleveltype.data()['type'];
      }
    })
    this.levelForm = this.formbuilder.group ({
      level: [, {validators: [Validators.required], updateOn:"change"}],
      category: [, {validators: [Validators.required], updateOn:"change"}],
      sequence: [, {validators: [Validators.required], updateOn:"change"}],
      docid: [, {validators: [], updateOn:"change"}],
    })
    var existingAccount = this.dailogData["leveldata"]
    if(existingAccount != null){
      console.log(existingAccount)
      this.levelForm.patchValue(existingAccount)
    }
  }

  ngOnInit(): void {
  }

  async submit(){
    var value = this.levelForm.value
    console.log(value)
    if(this.levelForm.valid){
      this.loading = true
      value["docid"] = value["docid"] ?? doc(collection(this.firestore,'biglevel')).id
      await setDoc(doc(this.firestore,"biglevel",value["docid"]),value, {merge: true}).then(()=>{
        this.loading = false
        this.close()
      })
    }
    else{
      alert("Fill every inputs")
    }
  }

  close(){
    this.dialogRef.close(null)
  }

}
