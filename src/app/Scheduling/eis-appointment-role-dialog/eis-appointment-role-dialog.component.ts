import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, doc, Firestore, setDoc, updateDoc } from '@angular/fire/firestore';
import { FormGroup, FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-eis-appointment-role-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule
  ],
  templateUrl: './eis-appointment-role-dialog.component.html',
  styleUrl: './eis-appointment-role-dialog.component.css'
})
export class EisAppointmentRoleDialogComponent {

  roleList = []
  profileList = []  
  assignrolestoeisForm:FormGroup
  loading = false

  constructor( 
    @Inject(MAT_DIALOG_DATA) public data : any, 
    public dialogref: MatDialogRef<any>,
    private firestore : Firestore,
    private formbuilder : FormBuilder
  ) {
    this.assignrolestoeisForm = this.formbuilder.group({
      selectedRole:[,Validators.required],
      selectedEISNames:[,Validators.required]
    })
    console.log(this.data);

    this.roleList = this.data["rolelist"]
    this.profileList = this.data["profilelist"]

    var existingData = this.data["data"]
    if(existingData != null && existingData != undefined){      
      var eis = []
      for (let i = 0; i < existingData.assigned_eis.length; i++) {
        eis.push(existingData.assigned_eis[i].id);
      }

      this.assignrolestoeisForm.patchValue({
        selectedRole : existingData.assigned_role_ref.id,
        selectedEISNames: eis
      })
      this.assignrolestoeisForm.get('selectedRole').disable()
    }
  }

  getErrorMessage():string | null{
    if(this.assignrolestoeisForm.get("selectedRole").hasError("required")){
      return "please select a role"
    } if(this.assignrolestoeisForm.get("selectedEISNames").hasError("required")){
      return "please select aleast one EIS name"
    }
    return null
  }

  async onformsubmit(value){
    console.log(value);
    if(this.assignrolestoeisForm.valid){
      this.loading = true
      var eisList = []
      for (let i = 0; i < value.selectedEISNames.length; i++) {
        eisList.push(doc(this.firestore, "profile_data/"+value.selectedEISNames[i]))
      }

      var existingData = this.data["data"]
      if(existingData != null && existingData != undefined){
        await updateDoc(doc(this.firestore, "Roles-To-EIS/"+existingData["id"]), {
          assigned_eis : eisList
        })
      }
      else {
        var docID = doc(collection(this.firestore, 'Roles-To-EIS')).id
        await setDoc(doc(this.firestore, "Roles-To-EIS/"+docID), {
          id : docID,
          assigned_role_ref : doc(this.firestore, "eisroles/"+value.selectedRole),
          assigned_eis : eisList
        }).then(() => {
          console.log("document successfully submitted to database");
          this.assignrolestoeisForm.reset();
        }).catch(err => {
          console.log(err);
        })
      }

      this.assignrolestoeisForm.reset()
      this.close()
    }
  }

  close(){
    this.dialogref.close()
  }
}
