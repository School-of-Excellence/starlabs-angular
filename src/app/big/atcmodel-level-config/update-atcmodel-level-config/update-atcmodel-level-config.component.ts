import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask } from '@angular/fire/storage';
import { FormGroup, FormBuilder, Validators, FormArray, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';


@Component({
  selector: 'app-update-atcmodel-level-config',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    CommonModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './update-atcmodel-level-config.component.html',
  styleUrl: './update-atcmodel-level-config.component.css'
})
export class UpdateAtcmodelLevelConfigComponent {
 configForm!: FormGroup
  activityList = []
  levelList = []
  atcmodelList = []
  loading:boolean = false

  constructor(
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public dailogData,
    public dialogRef: MatDialogRef<any>,
    public firestore: Firestore,
    public storage: Storage
  ) {
    this.configForm = this.formbuilder.group ({
      docid: [, {validators: [], updateOn:"change"}],
      atcmodel: [, {validators: [Validators.required], updateOn:"change"}],
      level: [, {validators: [Validators.required], updateOn:"change"}],
      primaryactivity: [, {validators: [Validators.required], updateOn:"change"}],
      metrics: this.formbuilder.array([]),
      validation: this.formbuilder.array([]),
      stabilization: this.formbuilder.array([]),
    })
    this.activityList = this.dailogData["activitylist"]
    this.levelList = this.dailogData["levellist"]
    this.atcmodelList = this.dailogData["atcmodellist"]
    var existingConfig = this.dailogData["configdata"]
    if(existingConfig != null){
      console.log(existingConfig)
      this.configForm.patchValue({
        docid: existingConfig["docid"] ?? null,
        atcmodel: existingConfig["atcmodel"],
        level: existingConfig["level"].id,
        primaryactivity: existingConfig["primaryactivity"].id,
      })
      existingConfig["metrics"].forEach((e, i) => {
        this.addMetrics()
        this.metricFormArray().at(i).patchValue({
          activity: e["activity"].id,
          metric: e["metric"]
        })
      }),
      existingConfig["validation"].forEach((e, i) => {
        this.addValidation()
        this.validationFormArray().at(i).patchValue({
          activity: e["activity"].id,
          metric: e["metric"],
          // validity:e['validity'] ?? null
        })
      }),
      existingConfig["stabilization"].forEach((e, i) => {
        this.addStabilization()
        this.stabilizationFormArray().at(i).patchValue({
          activity: e["activity"].id,
          metric: e["metric"],
          validity:e['validity'] ?? null
        })
      })
      this.onPrimaryActivityChange()
    }
  }

  ngOnInit(): void {
  }

  countProperties(){
    return this.formbuilder.group({
      activity: [, {validators: [Validators.required], updateOn: "change"}],
      metric: [, {validators: [Validators.required], updateOn: "change"}],
    })
  }

  /*
  countPropertiesV2(){
    return this.formbuilder.group({
      activity: [, {validators: [Validators.required], updateOn: "change"}],
      metric: [, {validators: [Validators.required], updateOn: "change"}],
      validity: [, {validators: [Validators.required], updateOn: "change"}],
    })
  }
  */

  // Metric
  metricFormArray():FormArray{
    return this.configForm.controls['metrics'] as FormArray
  }

  addMetrics(){
    this.metricFormArray().push(this.countProperties())
  }

  removeMetrics(i:number) {
    this.metricFormArray().removeAt(i)
  }

  // Validation
  validationFormArray():FormArray{
    return this.configForm.controls['validation'] as FormArray
  }

  addValidation(){
    this.validationFormArray().push(this.formbuilder.group({
      activity: [, {validators: [Validators.required], updateOn: "change"}],
      metric: [, {validators: [Validators.required], updateOn: "change"}],
      // validity: [, {validators: [Validators.required], updateOn: "change"}],
    }))
  }

  removeValidation(i:number) {
    this.validationFormArray().removeAt(i)
  }

  // Stabilization
  stabilizationFormArray():FormArray{
    return this.configForm.controls['stabilization'] as FormArray
  }

  addStabilization(){
    this.stabilizationFormArray().push(this.formbuilder.group({
      activity: [, {validators: [Validators.required], updateOn: "change"}],
      metric: [, {validators: [Validators.required], updateOn: "change"}],
      validity: [, {validators: [Validators.required], updateOn: "change"}],
    }))
  }

  removeStabilization(i:number) {
    this.stabilizationFormArray().removeAt(i)
  }

  onPrimaryActivityChange(){
    //validation
    if(this.validationFormArray().value.length != 0){
      this.validationFormArray().at(0).patchValue({
        activity:this.configForm.value['primaryactivity']
      })
      if(this.validationFormArray().length > 1){
        for (let i = 0; i < this.validationFormArray().value.length; i++) {
          if(i != 0 )this.validationFormArray().removeAt(i)
        }
      }
    }else{
      this.validationFormArray().push(
        this.formbuilder.group({
          activity: [this.configForm.value['primaryactivity'], {validators: [Validators.required], updateOn: "change"}],
          metric: [, {validators: [Validators.required], updateOn: "change"}],
          // validity: [, {validators: [Validators.required], updateOn: "change"}],
        })
      )
    }
    //stabiliztion
    if(this.stabilizationFormArray().value.length != 0){
      this.stabilizationFormArray().at(0).patchValue({
        activity:this.configForm.value['primaryactivity']
      })
      if(this.stabilizationFormArray().length > 1){
        for (let i = 0; i < this.stabilizationFormArray().value.length; i++) {
          if(i != 0 )this.stabilizationFormArray().removeAt(i)
        }
      }
    }else{
      this.stabilizationFormArray().push(
        this.formbuilder.group({
          activity: [this.configForm.value['primaryactivity'], {validators: [Validators.required], updateOn: "change"}],
          metric: [, {validators: [Validators.required], updateOn: "change"}],
          validity: [, {validators: [Validators.required], updateOn: "change"}],
        })
      )
    }
  }

  async submit(){
    var value = this.configForm.value
    console.log(value)
    if(this.configForm.valid){
      this.loading = true
      var data = {
        docid: value["docid"] ?? doc(collection(this.firestore,'atcmodel level config')).id,
        atcmodel: value["atcmodel"],
        level: doc(this.firestore,"biglevel",value["level"]),
        primaryactivity: doc(this.firestore,"bigactivity",value["primaryactivity"]),
        metrics: value["metrics"].map(e => {
          return {
            activity: doc(this.firestore,"bigactivity",e["activity"]),
            metric: e["metric"]
          }
        }),
        validation: value["validation"].map(e => {
          return {
            activity: doc(this.firestore,"bigactivity",e["activity"]),
            metric: e["metric"],
            // validity:e["validity"]
          }
        }),
        stabilization: value["stabilization"].map(e => {
          return {
            activity: doc(this.firestore,"bigactivity",e["activity"]),
            metric: e["metric"],
            validity:e["validity"]
          }
        })
      }
      console.log(data)
      await setDoc(doc(this.firestore,"atcmodel level config",data["docid"]),data, {merge: true}).then(()=>{
        this.dialogRef.close()
      }).catch(err=>{
        console.log(err)
      })
      this.loading = false
    }
    else{
      alert("Fill every inputs")
    }
  }

  close(){
    this.dialogRef.close(null)
  }

}
