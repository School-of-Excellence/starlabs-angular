import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { FormGroup, Validators, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-add-zoom-account',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatButtonModule,
    CommonModule
  ],
  templateUrl: './add-zoom-account.component.html',
  styleUrl: './add-zoom-account.component.css'
})
export class AddZoomAccountComponent {
  zoomaccountForm : FormGroup 
  loading:boolean = false

  constructor(
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public dailogData,
    public dialogRef: MatDialogRef<any>,
    private domSanitizer: DomSanitizer,
    public firestore: Firestore,
    public storage: Storage
  ) {
    this.zoomaccountForm  = this.formbuilder.group ({
      email: [, {validators: [Validators.required, Validators.email], updateOn:"change"}],
      accounttype: [, {validators: [Validators.required], updateOn:"change"}],
      firstname: [, {validators: [Validators.required], updateOn:"change"}],
      lastname: [, {validators: [Validators.required], updateOn:"change"}],
      inuse: [false, {validators: [Validators.required], updateOn:"change"}],
      docid: [, {validators: [], updateOn:"change"}],
    })
    var existingAccount = this.dailogData["accountdata"]
    if(existingAccount != null){
      console.log(existingAccount)
      this.zoomaccountForm.patchValue(existingAccount)
    }
  }

  ngOnInit(): void {
  }

  async submit(){
    var value = this.zoomaccountForm.value
    console.log(value)
    if(this.zoomaccountForm.valid){
      this.loading = true
      value["docid"] = value["docid"] ?? doc(collection(this.firestore,'zoomaccount')).id
      value["inuse"] = value["inuse"] ?? false
      await setDoc(doc(this.firestore,"zoomaccount",value["docid"]),value).then(()=>{
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
