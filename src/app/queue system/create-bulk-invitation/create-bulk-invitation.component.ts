import { CommonModule } from '@angular/common';
import { Component, OnInit,Inject } from '@angular/core';
import { collection, doc, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA,MatDialogRef} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';


@Component({
  selector: 'app-create-bulk-invitation',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    MatSelectModule
  ],
  templateUrl: './create-bulk-invitation.component.html',
  styleUrl: './create-bulk-invitation.component.css'
})
export class CreateBulkInvitationComponent {
  loading:boolean = false
  activityStage = []
  invitationForm:FormGroup

  constructor(public firestore: Firestore, @Inject(MAT_DIALOG_DATA) public dialogData:any, public dialogRef:MatDialogRef<any>, public formbuilder: FormBuilder) {
    this.invitationForm = this.formbuilder.group({
      stage: [, {validators: [Validators.required], updateOn:"change"}],
      totalinvited: [, {validators: [Validators.required], updateOn:"change"}],
      duration: [, {validators: [Validators.required], updateOn:"change"}],
      expirydate: [, {validators: [Validators.required], updateOn:"change"}],
    }) 
    console.log("Ongoing Queue", dialogData)
    if(this.dialogData != null && this.dialogData != undefined){
      var stageList = this.dialogData["stages"]
      stageList.forEach(stage=>{
        var property = (this.dialogData["stageproperty"] ?? {})[stage]
        if(Object.values(property["compulsoryactivity"] ?? {}).length > 0){
          this.activityStage.push(stage)
        }
      })
    }
  }

  ngOnInit(): void {}

  async sendInvitation(){
    var value = this.invitationForm.value
    console.log(value)
    if(this.invitationForm.valid){
      console.log('form vaild');
      this.loading = true
      value["expirydate"] = new Date(value["expirydate"])
      value["docid"] = doc(collection(this.firestore,'bulk invitation')).id
      await setDoc(doc(this.firestore,"bulk invitation",value["docid"]),{
        ...value,
        selectedparticipants:this.dialogData['selectedParticipants'],
        created: serverTimestamp(),
        queueref: doc(this.firestore,"queue generation",this.dialogData["docid"])
      })
      this.loading = false
      this.dialogRef.close(null)
    }
  }
}
