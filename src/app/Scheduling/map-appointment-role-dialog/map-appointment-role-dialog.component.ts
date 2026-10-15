import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { collection, doc, Firestore, getDocs, orderBy, query, setDoc } from '@angular/fire/firestore';
import { FormGroup, FormControl, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
    MatSelectModule,
    MatCheckboxModule
  ],
  templateUrl: './map-appointment-role-dialog.component.html',
  styleUrl: './map-appointment-role-dialog.component.css'
})
export class MapAppointmentRoleDialogComponent {
  appointmentTypeList = []
  appointmentRoleList = []
  // bigactivity docs that carry an atcproperty — the options for each role's ATC activity
  atcActivityList: { id: string, activity: string, atcproperty: string }[] = []

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
      atcrequired: [false],
      // one control per required role (keyed by eisroles id), kept in sync by syncAtcRoles()
      atcrolemap: this.formBuilder.group({}),
    })

    this.appointmentTypeList = data["appointmentlist"]
    this.appointmentRoleList = data["rolelist"]

    // Subscribed before the edit-mode patch below, so patching required_role builds the ATC rows
    this.mapAppointmentRoleForm.get('required_role').valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncAtcRoles())
    this.mapAppointmentRoleForm.get('atcrequired').valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncAtcRoles())
    this.syncAtcRoles()
    this.loadAtcActivities()

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
        additional_role: additional,
        atcrequired: existingData.atcrequired === true
      })
      // The rows exist now (built by the valueChanges above); one activity per role, stored as a 1-item array
      var savedMap = existingData.atcrolemap ?? {}
      var atcGroup = this.atcRoleGroup
      for (const roleId of Object.keys(atcGroup.controls)) {
        var saved = savedMap[roleId]
        atcGroup.get(roleId).setValue(Array.isArray(saved) ? (saved[0] ?? null) : null)
      }
    }
  }

  get atcRoleGroup(): FormGroup {
    return this.mapAppointmentRoleForm.get('atcrolemap') as FormGroup
  }

  // Required roles in picker order — one ATC row each
  get atcRoleIds(): string[] {
    return Object.keys(this.atcRoleGroup.controls)
  }

  roleName(roleId: string): string {
    return this.appointmentRoleList.find(e => e.id == roleId)?.role ?? roleId
  }

  // Keeps one required control per required role. Unticking ATC disables the group (so it neither
  // validates nor saves) but keeps the picks, so ticking it again restores them.
  private syncAtcRoles() {
    var required: string[] = this.mapAppointmentRoleForm.get('required_role').value ?? []
    var atcGroup = this.atcRoleGroup
    var previous = atcGroup.getRawValue()
    for (const roleId of Object.keys(atcGroup.controls)) {
      atcGroup.removeControl(roleId, { emitEvent: false })
    }
    for (const roleId of required) {
      atcGroup.addControl(roleId, new FormControl(previous[roleId] ?? null, Validators.required), { emitEvent: false })
    }
    if (this.mapAppointmentRoleForm.get('atcrequired').value === true) {
      atcGroup.enable({ emitEvent: false })
    } else {
      atcGroup.disable({ emitEvent: false })
    }
    atcGroup.updateValueAndValidity()
  }

  private async loadAtcActivities() {
    try {
      var snap = await getDocs(query(collection(this.firestore, "bigactivity"), orderBy("activity")))
      this.atcActivityList = snap.docs
        .map(d => ({ id: d.id, activity: d.data()["activity"], atcproperty: d.data()["atcproperty"] }))
        .filter(e => e.atcproperty != null && e.atcproperty !== "")
    } catch (error) {
      console.error("Could not load ATC activities", error)
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
      var atcrequired = value.atcrequired === true
      var atcrolemap = {}
      if (atcrequired) {
        for (const roleId of value.required_role) {
          atcrolemap[roleId] = [value.atcrolemap[roleId]]
        }
      }
      var newData = {
        id: docid,
        assigned_appttype_ref: doc(this.firestore, "appointmenttype/"+value.selectedApptType),
        required_role: requiredlist,
        additional_role: additionallist,
        assigned_role: requiredlist.concat(additionallist),
        atcrequired: atcrequired,
        atcrolemap: atcrolemap
      }
      console.log(newData)
      // mergeFields (not merge:true): these fields are replaced whole, so a role removed from atcrolemap
      // is really deleted; any other field on the doc is left untouched.
      await setDoc(doc(this.firestore, "AppointmentType-To-Roles/"+docid), newData, {mergeFields: Object.keys(newData)})
      this.mapAppointmentRoleForm.reset();
      this.close()
    } else {
      this.mapAppointmentRoleForm.markAllAsTouched()
    }
    this.loading = false
  }

  close(){
    this.dialogref.close()
  }
}
