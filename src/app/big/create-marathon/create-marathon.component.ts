import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AutoCompleteWithChipComponent } from "../../form-element/auto-complete-with-chip/auto-complete-with-chip.component";
import { MatDatepickerComponent } from "../../form-element/mat-datepicker/mat-datepicker.component";
import { TextComponent } from "../../form-element/text/text.component";
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { collection, doc, Firestore, getDocs, } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';


@Component({
  selector: 'app-create-marathon',
  imports: [
    ReactiveFormsModule,
    AutoCompleteWithChipComponent,
    MatDatepickerComponent,
    TextComponent,
    MatButtonModule
],
  templateUrl: './create-marathon.component.html',
  styleUrl: './create-marathon.component.css'
})
export class CreateMarathonComponent {

  bigMarathonForm:FormGroup;

  eventCollectionList = []

  constructor(
    private fb : FormBuilder,
    public dialogRef: MatDialogRef<CreateMarathonComponent>,
    private firestore : Firestore,
    @Inject(MAT_DIALOG_DATA) public data:any
  ){
    this.bigMarathonForm = this.fb.group({
      title:[null,{Validators:[Validators.required]}],
      // eventcollectionref:[null,Validators.required],
      startdate:[null,Validators.required],
      tentativeenddate:[null,Validators.required],
      enddate:[null,],
      docid:[null,Validators.required],
      status:[null,Validators.required]
    })
    getDocs(collection(this.firestore,"event collection")).then(snap => {
      this.eventCollectionList = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
    })
    if(this.data != null && this.data != undefined){
      console.log("update");
      this.bigMarathonForm.patchValue({
        title:this.data.title,
        startdate:this.data.startdate.toDate(),
        tentativeenddate:this.data.tentativeenddate.toDate(),
        enddate:this.data.enddate != null ? this.data.enddate.toDate() : null,
        docid:this.data.docid,
        status:this.data.status
      })
    }else{
      console.log("create");
      this.bigMarathonForm.patchValue({
        docid: doc(collection(this.firestore, 'big marathon')).id
      });
    }
  }

  ngOnInit(): void {}

  onCancel(){
    this.dialogRef.close()
  }

  onSubmit(){
    this.dialogRef.close(this.bigMarathonForm.value);
  }

}
