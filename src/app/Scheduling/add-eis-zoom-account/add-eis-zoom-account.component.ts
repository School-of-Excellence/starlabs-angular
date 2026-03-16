import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { Firestore, doc, collection, getDocs, orderBy, query, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-add-eis-zoom-account',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './add-eis-zoom-account.component.html',
  styleUrl: './add-eis-zoom-account.component.css'
})
export class AddEISZoomAccountComponent {

  eisForm: FormGroup
  profileList = []
  selectedProfile = null
  filteredProfile = ""

  constructor(@Inject(MAT_DIALOG_DATA) public dialogData : any, private dialogRef: MatDialogRef<any>, private formbuilder: FormBuilder, private firestore: Firestore){
    this.eisForm = this.formbuilder.group({   
      profileid: [,{Validators : [Validators.required], updateOn:"change"}],
      name: [,{Validators : [Validators.required], updateOn:"change"}],
      email: [, { validators: [Validators.required, Validators.email], updateOn: "change" }],
      phonenumber : [,{Validators: [Validators.required], updateOn:"change"}],
      zoomid : [,{Validators: [Validators.required], updateOn:"change"}],
      zoompassword : [,Validators.required],
      zoomurl : [,{Validators: [Validators.required], updateOn:"change"}],
    })

    if(dialogData["accountdata"] == null){
      this.fetchProfileList()
    }
    else{
      var existingData = dialogData["accountdata"]
      this.eisForm.patchValue({
        profileid: existingData["profileref"].id,
        name: existingData["name"],
        email: existingData["email"],
        phonenumber: existingData["phonenumber"], 
        zoomid: existingData["zoomid"],
        zoompassword: existingData["zoompassword"],
        zoomurl: existingData["zoomurl"]
      })
    }
  }

  fetchProfileList(){
    var profileCollection = collection(this.firestore, "profile_data")
    var profileFilter = query(profileCollection, orderBy("name"))
    getDocs(profileFilter).then(list =>{
      for (let i = 0; i < list.docs.length; i++) {
        const profileDoc = list.docs[i];
        var profileData = profileDoc.data()
        this.profileList.push(profileData)
      }
    })
  }

  returnProfile(){
    return this.profileList.filter(e => e["name"].toLowerCase().includes(this.filteredProfile))
  }

  onProfileSelected(profileData){
    this.eisForm.patchValue({
      profileid: profileData["profileid"],
      name: profileData["name"],
      email: profileData["email"],
      phonenumber: profileData["number"],
    })
  }

  close(){
    this.dialogRef.close()
  }

  submit(){
    var value = this.eisForm.value
    console.log(value)

    if(this.eisForm.valid){
      var documentRef = doc(this.firestore, "EISzoomcontact/"+value["profileid"])
      console.log(documentRef)
      var documentData = {
        profileref: documentRef,
        name: value.name,
        email: value.email,
        phonenumber: value.phonenumber,
        zoomurl: value.zoomurl,
        zoomid: value.zoomid,
        zoompassword: value.zoompassword
      }
      setDoc(documentRef, documentData, {merge: true}).then(() =>{
        this.close()
      }).catch(err =>{
        console.log(err)
      })
    }
  }

}
