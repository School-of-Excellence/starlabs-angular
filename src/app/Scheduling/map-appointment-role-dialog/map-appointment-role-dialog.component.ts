import { CommonModule } from '@angular/common';
import { Component, ElementRef, Inject, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { collection, doc, Firestore, getDocs, orderBy, query, setDoc } from '@angular/fire/firestore';
import { FormGroup, FormControl, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
    MatCheckboxModule,
    // mat-dialog-title / mat-dialog-content / mat-dialog-actions — without it the body never scrolls
    MatDialogModule
  ],
  templateUrl: './map-appointment-role-dialog.component.html',
  styleUrl: './map-appointment-role-dialog.component.css'
})
export class MapAppointmentRoleDialogComponent {
  appointmentTypeList = []
  appointmentRoleList = []
  // bigactivity docs that carry an atcproperty — the options for each role's ATC activity
  atcActivityList: { id: string, activity: string, atcproperty: string }[] = []
  // ATC model names (the "atc model" collection) — the same list prescribeATC offers as "What is the ATC given for?"
  atcModelList: string[] = []

  mapAppointmentRoleForm:FormGroup
  loading:boolean = false
  // Shown in the footer when the Firestore write fails; the dialog stays open so nothing is lost
  saveError: string = null
  private host = inject(ElementRef)

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
      atcmodel: [{ value: null, disabled: true }],  // required only while ATC is ticked (syncAtcRoles)
      // one control per required role (keyed by eisroles id), kept in sync by syncAtcRoles()
      atcrolemap: this.formBuilder.group({}),
    })

    this.appointmentTypeList = data["appointmentlist"]
    this.appointmentRoleList = data["rolelist"]

    // Subscribed before the edit-mode patch below, so patching required_role builds the ATC rows
    this.mapAppointmentRoleForm.get('required_role').valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncAtcRoles())
    this.mapAppointmentRoleForm.get('atcrequired').valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncAtcRoles())
    this.mapAppointmentRoleForm.get('additional_role').valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncAtcRoles())
    this.syncAtcRoles()
    this.loadAtcActivities()
    this.loadAtcModels()

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
        atcrequired: existingData.atcrequired === true,
        atcmodel: existingData.atcmodel ?? null
      })
      // The rows exist now (built by the valueChanges above); atcrolemap is {roleId: [activityId, …]}
      // (older docs stored a single activityId string — read either)
      var savedMap = existingData.atcrolemap ?? {}
      var atcGroup = this.atcRoleGroup
      for (const roleId of Object.keys(atcGroup.controls)) {
        var saved = savedMap[roleId]
        atcGroup.get(roleId).setValue(Array.isArray(saved) ? saved.filter(e => typeof e === 'string') : (typeof saved === 'string' ? [saved] : []))
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

  isAdditionalRole(roleId: string): boolean {
    return !(this.mapAppointmentRoleForm.get('required_role').value ?? []).includes(roleId)
  }

  roleName(roleId: string): string {
    return this.appointmentRoleList.find(e => e.id == roleId)?.role ?? roleId
  }

  // Keeps one required control per required role. Unticking ATC disables the group (so it neither
  // validates nor saves) but keeps the picks, so ticking it again restores them.
  private syncAtcRoles() {
    // One row per selected role: required roles must name an activity, additional roles may (a booking
    // doesn't always use them)
    var required: string[] = this.mapAppointmentRoleForm.get('required_role').value ?? []
    var additional: string[] = (this.mapAppointmentRoleForm.get('additional_role').value ?? []).filter(id => !required.includes(id))
    var atcGroup = this.atcRoleGroup
    // Re-use each role's existing control instance. A row on screen stays bound to the instance it was built
    // with (Angular does not re-bind controls replaced inside a nested group), so a fresh FormControl here
    // would leave the visible select writing into a dead control and the form silently invalid.
    var existing = { ...atcGroup.controls }
    for (const roleId of Object.keys(atcGroup.controls)) {
      atcGroup.removeControl(roleId, { emitEvent: false })
    }
    // removed and re-added (same instances) so the rows keep their order: required roles first, then additional
    for (const roleId of required) {
      var requiredControl = existing[roleId] ?? new FormControl([])
      requiredControl.setValidators(Validators.required)
      atcGroup.addControl(roleId, requiredControl, { emitEvent: false })
    }
    for (const roleId of additional) {
      var additionalControl = existing[roleId] ?? new FormControl([])
      additionalControl.clearValidators()
      atcGroup.addControl(roleId, additionalControl, { emitEvent: false })
    }
    Object.values(atcGroup.controls).forEach(control => control.updateValueAndValidity({ emitEvent: false }))
    var atcModel = this.mapAppointmentRoleForm.get('atcmodel')
    if (this.mapAppointmentRoleForm.get('atcrequired').value === true) {
      atcGroup.enable({ emitEvent: false })
      atcModel.setValidators(Validators.required)
      atcModel.enable({ emitEvent: false })
    } else {
      atcGroup.disable({ emitEvent: false })
      atcModel.clearValidators()
      atcModel.disable({ emitEvent: false })
    }
    atcGroup.updateValueAndValidity()
    atcModel.updateValueAndValidity({ emitEvent: false })
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

  private async loadAtcModels() {
    try {
      var snap = await getDocs(query(collection(this.firestore, "atc model"), orderBy("atcmodel")))
      this.atcModelList = Array.from(new Set(snap.docs
        .map(d => (d.data()["atcmodel"] ?? "").toString().trim())
        .filter(name => name.length != 0)))
    } catch (error) {
      console.error("Could not load ATC models", error)
    }
  }

  async onformsubmit(value){
    this.saveError = null
    console.log(value)
    if(!this.mapAppointmentRoleForm.valid){
      this.mapAppointmentRoleForm.markAllAsTouched()
      this.scrollToFirstError()
      return
    }
    this.loading = true
    try {
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
          atcrolemap[roleId] = [...(value.atcrolemap[roleId] ?? [])]
        }
        // additional roles: saved only when an activity was chosen for them
        for (const roleId of (value.additional_role ?? [])) {
          var picked = value.atcrolemap[roleId] ?? []
          if (!value.required_role.includes(roleId) && picked.length != 0) atcrolemap[roleId] = [...picked]
        }
      }
      var newData = {
        id: docid,
        assigned_appttype_ref: doc(this.firestore, "appointmenttype/"+value.selectedApptType),
        required_role: requiredlist,
        additional_role: additionallist,
        assigned_role: requiredlist.concat(additionallist),
        atcrequired: atcrequired,
        atcmodel: atcrequired ? (value.atcmodel ?? null) : null,
        atcrolemap: atcrolemap
      }
      console.log(newData)
      // mergeFields (not merge:true): these fields are replaced whole, so a role removed from atcrolemap
      // is really deleted; any other field on the doc is left untouched.
      await setDoc(doc(this.firestore, "AppointmentType-To-Roles/"+docid), newData, {mergeFields: Object.keys(newData)})
      this.mapAppointmentRoleForm.reset();
      this.close()
    } catch (error) {
      // Before this, a failed write left loading=true: the button stayed disabled with no message
      console.error("Could not save the appointment role mapping", error)
      this.saveError = (error?.message ?? error ?? "Unknown error").toString()
    } finally {
      this.loading = false
    }
  }

  // The body scrolls, so an error can sit below the visible area — bring the first one into view
  private scrollToFirstError() {
    setTimeout(() => {
      var invalid = this.host.nativeElement.querySelector('.mat-form-field-invalid')
      invalid?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  close(){
    this.dialogref.close()
  }
}
