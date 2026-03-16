import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDoc, setDoc } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { FormGroup, Validators, FormBuilder, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-add-big-activity',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatRadioModule,
    MatButtonModule,
    ReactiveFormsModule,
    CommonModule,
    FormsModule
  ],
  templateUrl: './add-big-activity.component.html',
  styleUrl: './add-big-activity.component.css'
})
export class AddBigActivityComponent {
  activityForm : FormGroup 
  atcPropertyList = []
  constructor(
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public dailogData,
    public dialogRef: MatDialogRef<any>,
    private domSanitizer: DomSanitizer,
    public firestore: Firestore,
    public storage: Storage
  ) { 
    this.activityForm  = this.formbuilder.group ({
      activity: [, {validators: [Validators.required], updateOn:"change"}],
      atcproperty:[,],
      shadow:[false,],
      // procedureproperty:[,],
      // assignmentproperty:[,],
      docid: [, {validators: [], updateOn:"change"}],
      activitytype: [, {validators: [], updateOn:"change"}]
    })
    var existingAccount = this.dailogData["accountdata"]
    if(existingAccount != null){
      console.log(existingAccount)
      this.activityForm.patchValue(existingAccount)
    }
    getDoc(doc(this.firestore,"classify","atcproperty")).then(async snap => {
      this.atcPropertyList = snap.data()['names']
    })
  }

  ngOnInit(): void {
  }

  async submit(){
    var value = this.activityForm.value
    console.log(value)
    if(this.activityForm.valid){
      value["docid"] = value["docid"] ?? doc(collection(this.firestore,'bigactivity')).id
      await setDoc(doc(this.firestore,"bigactivity",value["docid"]),value).then(()=>{
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
