import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-assign-queue-studio',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './assign-queue-studio.component.html',
  styleUrl: './assign-queue-studio.component.css'
})
export class AssignQueueStudioComponent {
  activityForm : FormGroup
  studioList = []
  mapActivity = {}
  mapProfile = {}
  filterText = ""
  profileList = []

  title = "Assign Specialist"

  constructor(public formbuilder:FormBuilder, @Inject(MAT_DIALOG_DATA) dialogdata:any, public dialogRef: MatDialogRef<any>) {
    console.log(dialogdata, 'dialogdata');

    this.activityForm = this.formbuilder.group({
      selectedstudio: [, {validators: [Validators.required], updateOn : "change"}],
      bonusactivity: this.formbuilder.array([]),
    })
    
    if(dialogdata != null){
      this.title = dialogdata["title"] ?? this.title
      this.mapActivity = dialogdata["mapactivity"]
      this.mapProfile = dialogdata["mapprofile"]
      Object.keys(this.mapProfile).forEach(key=>{
        this.profileList.push({
          name: this.mapProfile[key],
          profileid: key
        })
      })
      this.profileList = this.profileList.sort((a, b) => a["name"].localeCompare(b["name"]))

      if(dialogdata["studiolist"] == null){
        this.activityForm.controls['selectedstudio'].disable()
        this.activityForm.controls['selectedstudio'].updateValueAndValidity()
        this.activityForm.updateValueAndValidity()
        this.addBonusArray()
      }
      else{
        dialogdata["studiolist"].forEach(studio=>{
          var participants = studio["participants"].map(e => this.mapProfile[e]).join(', ')
          this.studioList.push({
            name: participants,
            value: studio
          })
        })

        if(dialogdata["studiolist"].length == 1){
          this.activityForm.patchValue({
            selectedstudio: this.studioList[0]["value"]
          })
        }
      }

      // Additional Activities
      Object.keys(dialogdata["additionalactivities"] ?? {}).forEach(key=>{
        this.bonusActivityForm().push(
          this.formbuilder.group({
            activity: [key, {validators: [Validators.required], updateOn: "change"}],
            participants: [dialogdata["additionalactivities"][key], {validators: [Validators.required], updateOn: "change"}],
            mandatory: [false],
          })
        )
      })

      this.activityForm.controls['selectedstudio'].valueChanges.subscribe(studio => {
        this.applyMandatoryActivities(studio);
      });

      const preselected = this.activityForm.controls['selectedstudio'].value;
      if (preselected) {
        this.applyMandatoryActivities(preselected);
      }
    }
  }

  applyMandatoryActivities(studio: any) {
    const formArray = this.bonusActivityForm();
    for (let i = formArray.length - 1; i >= 0; i--) {
      if (formArray.at(i).get('mandatory')?.value) {
        formArray.removeAt(i);
      }
    }
    const mandatory: string[] = studio?.['mandatoryactivities'] ?? [];
    mandatory.forEach((activityId, index) => {
      const group = this.formbuilder.group({
        activity: [{value: activityId, disabled: true}, {validators: [Validators.required], updateOn: "change"}],
        participants: [null, {validators: [Validators.required], updateOn: "change"}],
        mandatory: [true],
      });
      formArray.insert(index, group);
    });
  }

  ngOnInit(): void {
  }

  filterProfileList(){
    return this.profileList.filter(e => e["name"].toLowerCase().includes(this.filterText.toLowerCase()))
  }
  
  bonusActivityForm():FormArray{
    return this.activityForm.controls['bonusactivity'] as FormArray
  }

  bonusProperties(){
    return this.formbuilder.group({
      activity: [, {validators: [Validators.required], updateOn: "change"}],
      participants: [, {validators: [Validators.required], updateOn: "change"}],
      mandatory: [false],
    })
  }

  addBonusArray(){
    this.bonusActivityForm().push(this.bonusProperties())
  }

  removeBonusArray(index){
    if (this.bonusActivityForm().at(index)?.get('mandatory')?.value) return;
    this.bonusActivityForm().removeAt(index)
  }

  submit(){
    var formvalue = this.activityForm.getRawValue()
    console.log(formvalue)
    if(this.activityForm.valid){
      var result = formvalue["selectedstudio"] ?? {}
      var bonusActivity = {}
      formvalue["bonusactivity"].forEach(bonus =>{
        bonus["participants"].forEach(participant=>{
          bonusActivity[participant] = bonus["activity"]
        })
      })
      if(Object.keys(bonusActivity).length != 0){
        result["bonusactivity"] = bonusActivity
      }
      console.log(result)
      this.dialogRef.close(result)
    }
  }
}
