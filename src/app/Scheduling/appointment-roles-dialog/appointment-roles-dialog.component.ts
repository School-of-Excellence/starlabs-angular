import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDocs, setDoc } from '@angular/fire/firestore';
import { FormGroup, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';

@Component({
  selector: 'app-appointment-roles-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    MatButtonModule,
    MatRadioModule,
  ],
  templateUrl: './appointment-roles-dialog.component.html',
  styleUrl: './appointment-roles-dialog.component.css'
})
export class AppointmentRolesDialogComponent {

  apptRoleForm : FormGroup
  existingRoles = []
  experienceStage = []
  experienceLevel = {}
  loading:boolean = false

  constructor(
    @Inject(MAT_DIALOG_DATA) public data : any,
    public dialogref:MatDialogRef<any>,
    private fb : FormBuilder,
    private firestore: Firestore
  ) {
    this.apptRoleForm = this.fb.group ({
      role:["",{validators : [Validators.required],updateOn : "change"}],
      experienceStage:[,{validators : [],updateOn : "change"}],
      experienceLevel:[,{validators : [],updateOn : "change"}]
    })
    if(this.data != null){
      console.log(data,"consoling dialog log");
      
      this.apptRoleForm.patchValue({
        role: data.role,
        experienceStage: data.experiencestage,
        experienceLevel: data.experiencelevel
      })
    }
  }

  ngOnInit(): void {
    getDocs(collection(this.firestore, "eisroles")).then(snapshot =>{
      for (let i = 0; i < snapshot.docs.length; i++) {
        const element = snapshot.docs[i].data();
        this.existingRoles.push(element['role'])
      }
    })
    getDocs(collection(this.firestore, "ExperienceLevel")).then(snapshot =>{
      for (let i = 0; i < snapshot.docs.length; i++) {
        const element = snapshot.docs[i].data();
        this.experienceStage.push(element["stage"])
        this.experienceLevel[element["stage"]] = element["level"]
      }
    })
  }

  onvaluechange(event){
    const exists = this.existingRoles.some((items) => {
      let a = event?.toLowerCase().trim()
      let b = items?.toLowerCase().trim()
      return a === b
    })
    if(!exists){
      // if(this.apptRoleForm.controls["role"].value.length == 0){
      if(!this.apptRoleForm.controls["role"].value || this.apptRoleForm.controls["role"].value.trim().length === 0){
        this.apptRoleForm.controls["role"].setErrors({required: true})
      }
      else{
        this.apptRoleForm.controls["role"].setErrors(null)
      }
    }
    else{
      this.apptRoleForm.controls["role"].setErrors({exists: true})
    }
  }

  async onformsubmit(value){
    console.log(value);
    if(this.apptRoleForm.valid){
      this.loading = true
      var docid = this.data != null ? this.data["id"] : doc(collection(this.firestore, 'eisroles')).id
      await setDoc(doc(this.firestore, 'eisroles/'+docid), {
        id: docid,
        role : value.role,
        experiencestage: value.experienceStage,
        experiencelevel : value.experienceLevel
      }).then(() => {
        this.apptRoleForm.reset()
        this.close()
      }).catch((err) => {
        console.log(err)
      })
      this.loading = false
    }
  }

  close(){
    this.dialogref.close()
  }
}
