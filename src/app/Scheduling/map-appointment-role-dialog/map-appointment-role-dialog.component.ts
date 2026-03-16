import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { FormGroup, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-map-appointment-role-dialog',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatFormFieldModule,
    MatButtonModule,
    MatSelectModule
  ],
  templateUrl: './map-appointment-role-dialog.component.html',
  styleUrl: './map-appointment-role-dialog.component.css'
})
export class MapAppointmentRoleDialogComponent {
  appointmentTypeList = []
  appointmentRoleList = []

  mapAppointmentRoleForm:FormGroup
  loading:boolean = false

  constructor(
    @Inject(MAT_DIALOG_DATA) public data : any, 
    public dialogref: MatDialogRef<any>,
    private firestore : Firestore,
    private formBuilder : FormBuilder
  ){
    this.mapAppointmentRoleForm = this.formBuilder.group({
      selectedApptType: [,{validators : [Validators.required],updateOn : "change"}],
      required_role: [,{validators : [Validators.required],updateOn : "change"}],
      additional_role: [[],{validators : [],updateOn : "change"}],
    })

    this.appointmentTypeList = data["appointmentlist"]
    this.appointmentRoleList = data["rolelist"]

    var existingData = data["data"]
    if(existingData != null && existingData != undefined){
      var required = []
      var additional = []
      if(existingData.required_role != null){
        for (let i = 0; i < existingData.required_role.length; i++) {
          var rolePath = existingData.required_role[i].id
          required.push(rolePath)
        }
      }
      if(existingData.additional_role != null){
        for (let i = 0; i < existingData.additional_role.length; i++) {
          var rolePath = existingData.additional_role[i].id
          additional.push(rolePath)
        }
      }
      this.mapAppointmentRoleForm.patchValue({
        selectedApptType : existingData.assigned_appttype_ref.id,
        required_role: required,
        additional_role: additional
      })
    }
  }

  async onformsubmit(value){
    this.loading = true
    console.log(value)
    if(this.mapAppointmentRoleForm.valid){
      var requiredlist = []
      for (let i = 0; i < value.required_role.length; i++) {
        requiredlist.push(doc(this.firestore, "eisroles/"+value.required_role[i])); 
      }
      var additionallist = []
      for (let i = 0; i < value.additional_role.length; i++) {
        additionallist.push(doc(this.firestore, "eisroles/"+value.additional_role[i]));
      }
      var existingData = this.data["data"]
      var docid = existingData != null ? existingData.id : doc(collection(this.firestore, "AppointmentType-To-Roles")).id
      var newData = {
        id: docid,
        assigned_appttype_ref: doc(this.firestore, "appointmenttype/"+value.selectedApptType),
        required_role: requiredlist,
        additional_role: additionallist,
        assigned_role: requiredlist.concat(additionallist)
      }
      console.log(newData)
      await setDoc(doc(this.firestore, "AppointmentType-To-Roles/"+docid), newData, {merge: true})
      this.mapAppointmentRoleForm.reset();
      this.close()
    }
    this.loading = false
  }

  close(){
    this.dialogref.close()
  }
}
