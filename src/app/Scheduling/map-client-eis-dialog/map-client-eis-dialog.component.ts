import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, doc, Firestore, getDocs, setDoc } from '@angular/fire/firestore';
import { FormGroup, FormBuilder, Validators, FormArray, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-map-client-eis-dialog',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatButtonModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './map-client-eis-dialog.component.html',
  styleUrl: './map-client-eis-dialog.component.css'
})
export class MapClientEisDialogComponent {
  
  filteredProfile = ""
  filteredAppointmentRole = ""
  mapProfiles = {}
  profileList = []
  rolesList = []

  mapRoleEIS = {}

  assignEISForm : FormGroup

  constructor(
    @Inject(MAT_DIALOG_DATA) public data : any, 
    public dialogref: MatDialogRef<any>,
    private firestore: Firestore,
    private formbuilder : FormBuilder
  ) {
    this.assignEISForm = this.formbuilder.group({
      profile:[,Validators.required],
      eisWithRoles: this.formbuilder.array([]) ,
    });

    if(data["data"] == null){
      this.addEisRole()
    }
  }

  async ngOnInit() {
    this.profileList = this.data["profilelist"]
    this.rolesList = this.data["rolelist"]
    this.mapProfiles = this.data["mapprofile"]

    var collectionRef = collection(this.firestore, "Roles-To-EIS")
    await getDocs(collectionRef).then(eisRoles =>{
      for (let i = 0; i < eisRoles.docs.length; i++) {
        const doc = eisRoles.docs[i];
        var data = doc.data()
        this.mapRoleEIS[data["assigned_role_ref"].id] = data["assigned_eis"]?.map(e => e.id)
      }
    })

    // below code related mat-dialog data passing
    console.log(this.data);
    var existingData = this.data["data"]
    if(existingData != null && existingData != undefined){
      this.assignEISForm.patchValue({
        profile : existingData.id,
      })
      
      for (let i = 0; i < existingData["roles"].length; i++) {
        this.addEisRole()
        const roleid = existingData["roles"][i].id;
        var eisList = existingData["eisroles"]["eisroles/"+roleid]
        this.assignEISForm.get('eisWithRoles')['controls'][i].get('role').setValue(roleid)
        this.assignEISForm.get('eisWithRoles')['controls'][i].get('eis').setValue(eisList?.map(e => e.id) ?? [])
      }
    }
  }

  returnProfile(){
    return this.profileList.filter(e => e["name"].toLowerCase().includes(this.filteredProfile.toLowerCase()))
  }

  returnAppointmentRole(){
    return this.rolesList.filter(e => e["role"].toLowerCase().includes(this.filteredAppointmentRole.toLowerCase()))
  }

  eisWithRolesfunction() : FormArray {
    return this.assignEISForm.get("eisWithRoles") as FormArray
  }
   
  newEisRole(): FormGroup {
    var data = this.formbuilder.group({
      role: [null, Validators.required],
      eis: [[], Validators.required],
    })
    data.controls.role.updateValueAndValidity()
    data.controls.eis.updateValueAndValidity()
    return data
  }
   
  addEisRole(){
    this.eisWithRolesfunction().push(this.newEisRole());
  }
   
  removeEisRole(i:number) {
    this.eisWithRolesfunction().removeAt(i);
  }

  onformsubmit(value){
    console.log(value);
    if(this.assignEISForm.valid){
      var profileRef = doc(this.firestore, "profile_data/"+value.profile)

      var rolePathList = []
      var mapEisRoles = {}
      for (let i = 0; i < value.eisWithRoles.length; i++) {
        var element = value.eisWithRoles[i]
        var rolePath = "eisroles/"+element["role"]
        var profilePathList = element["eis"].map(e => "profile_data/"+e)

        rolePathList.push(rolePath)
        mapEisRoles[rolePath] = profilePathList?.map(e => doc(this.firestore, e))
      }
      rolePathList = Array.from(new Set(rolePathList))
      var newData = {
        profile_ref: profileRef,
        roles: rolePathList.map(e => doc(this.firestore, e)),
        eisroles: mapEisRoles
      }
      console.log(newData)
      setDoc(doc(this.firestore, "customer_eismapping/"+profileRef.id), newData)
      this.assignEISForm.reset()
      this.dialogref.close()
    }
  }

  onCancel(){
    this.dialogref.close()
  }
}
