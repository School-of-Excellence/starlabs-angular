import { NgFor, NgIf } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, collectionData, deleteDoc, doc, Firestore, setDoc, updateDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-package-entry',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    NgIf,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './package-entry.component.html',
  styleUrl: './package-entry.component.css'
})
export class PackageEntryComponent {
  addPackageForm!:FormGroup
  packagearray = []
  dialogtitle:string
  submitbutton:string
  crossmatch:boolean
  croosmatcherrormessage:any
  delete:boolean = false
  packageSubscription:Subscription

  //collection variable
  packageRef;

  constructor(
    public dialogref:MatDialogRef<any>,
    private fb : FormBuilder,
    @Inject(MAT_DIALOG_DATA) public data : any,
    private afs: Firestore
    ) {
    this.packageRef = collection(this.afs,"package")
    this.submitbutton = this.data !== null ? "Update" : "Submit"
    this.dialogtitle = this.data !== null ? "Edit Package" : "Add Package"
    console.log(this.data);
    this.initializeForm();
    if(this.data){
      if(this.data.delete){
        this.delete = this.data.delete
      }
      if(this.data.package){
        this.addPackageForm.patchValue({
          package : data.package,
        })
      }
    }
    this.packageSubscription = collectionData(this.packageRef,{idField:'id'}).subscribe(doc =>{
        this.packagearray = doc
    })
  }
  private initializeForm(){
    this.addPackageForm = this.fb.group({
      package:[,{validators : [Validators.required],updateOn : "change"}],
    })
  }
  ngOnInit(): void {}

  onvaluechange(event){
    const match = this.packagearray.some((items) => {
      let a = event != null ? event.replace(/ /g, "").toLowerCase() : event
      let b = items.package.replace(/ /g, "").toLowerCase()
      return a === b
    })
    this.crossmatch = match
    return this.croosmatcherrormessage = match === true ? event + " already exist .Choose another package" : false
  }

  getErrorMessage(){
    if(this.addPackageForm.get('package').hasError('required')){
      return 'you must enter a package'
    } else {
      return ''
    }
  }

  async onformsubmit(value){
    this.addPackageForm.reset()
    const packageData = {
      package: value.package,
    }
    if (this.data !== null) {
      const packageDoc = doc(this.packageRef,this.data.id)
      await updateDoc(packageDoc,packageData)
      console.log("Document successfully updated");
      this.dialogref.close()
    }
    if (this.data === null) {
      const newPackageDoc = doc(this.packageRef)
      const newPackageData = {
        docid:newPackageDoc.id,
        ...packageData
      }
      await setDoc(newPackageDoc,newPackageData)
      console.log("Form successfully submitted");
      this.dialogref.close();
    }
  }
  ondelete(id){
    const packageDoc = doc(this.packageRef,id)
    deleteDoc(packageDoc).then(() =>{
      console.log("document successfully deleted");
      this.dialogref.close()
    })
  }
  onCancel(){
    this.dialogref.close()
  }
}
