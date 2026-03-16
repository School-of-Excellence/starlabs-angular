import { CommonModule, NgFor, NgIf } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-add-package-design',
  imports: [MatFormFieldModule,
            MatSelectModule,
            NgIf,
            NgFor,
            MatInputModule,
            MatButtonModule,
            ReactiveFormsModule,
            CommonModule,
            FormsModule,
            MatDialogModule,
            
          ],
  templateUrl: './add-package-design.component.html',
  styleUrl: './add-package-design.component.css'
})
export class AddPackageDesignComponent {

  loading:boolean = false
  journeyList = []
  journeyMap = {}
  packageStatusOption = [
    {value: "new", label: "New"},
    {value: "upgraded", label: "Upgraded"},
  ]
  subscriptionOption = [
    {value: "purchaseentered", label: "Purchased Entered"},
    {value: "previoussubscription", label: "Previous Subscription End"},
  ]
  productCancelOption = [
    {value: true, label: "Cancel Product"},
    {value: false, label: "Carry Forward"},
  ]
  packagedesignForm!: FormGroup; 
 

  constructor(
    public firestore: Firestore,
    public formbuilder: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public dialogdata : any,
    public dialogref: MatDialogRef<any>
  ) {
    this.packagedesignForm = this.formbuilder.group({
      docid: [null, {validators: [], updateOn: 'change'}],
      packagelabel: [null, {validators: [Validators.required], updateOn: 'change'}],
      currentjourney: [null, {validators: [Validators.required], updateOn: 'change'}],
      packagestatus: [null, {validators: [Validators.required], updateOn: 'change'}],
      newjourney: [null, {validators: [], updateOn: 'change'}],
      extentionmonths: [null, {validators: [Validators.required], updateOn: 'change'}],
      cancelproduct: [null, {validators: [], updateOn: 'change'}],
      subscriptionfrom: [null, {validators: [], updateOn: 'change'}],
      originalfee: [null, {validators: [Validators.required], updateOn: 'change'}],
    }, {updateOn: 'change'})

    this.journeyList = dialogdata["journeylist"]
    this.journeyMap = dialogdata["journeymap"]
    if(dialogdata["design"] != null){
      this.packagedesignForm.patchValue(dialogdata["design"])
    }
  }

  onPackageStatusChange(){
    if(this.packagedesignForm.get('packagestatus').value == 'upgraded'){
      this.packagedesignForm.get('newjourney').setValidators([Validators.required])
      this.packagedesignForm.get('cancelproduct').setValidators([Validators.required])
      this.packagedesignForm.get('subscriptionfrom').setValidators([Validators.required])
    }
    else{
      this.packagedesignForm.get('newjourney').setValidators([])
      this.packagedesignForm.get('cancelproduct').setValidators([])
      this.packagedesignForm.get('subscriptionfrom').setValidators([])
      this.packagedesignForm.patchValue({
        newjourney: null,
        cancelproduct: null,
        subscriptionfrom: null
      })
    }
    this.packagedesignForm.get('newjourney').updateValueAndValidity()
    this.packagedesignForm.get('cancelproduct').updateValueAndValidity()
    this.packagedesignForm.get('subscriptionfrom').updateValueAndValidity()
    this.packagedesignForm.updateValueAndValidity()
  }

  submit(){
    var designValue = this.packagedesignForm.value
    console.log(designValue)
    var docid
    if(this.packagedesignForm.valid){
      this.loading = true
      if (!designValue.docid) {
        const packageDesignRef = collection(this.firestore, 'package design');
        const newDocRef = doc(packageDesignRef);
        docid = newDocRef.id;
      }
      designValue["docid"] = designValue["docid"] ? designValue["docid"] : docid

      const packagedesignRef = doc(this.firestore, "package design", designValue["docid"])

      setDoc(packagedesignRef, designValue).then(() => {
        this.close()
      }).catch(err =>{
        alert(err)
        this.loading = false
      })
    }
  }


  close(){
    this.dialogref.close()
  }

  

}
