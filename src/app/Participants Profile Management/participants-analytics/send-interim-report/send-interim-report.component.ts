import { CommonModule, NgIf } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { doc, Firestore, getDocs, query, where, writeBatch,serverTimestamp, collection } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule} from '@angular/material/progress-bar';

@Component({
  selector: 'app-send-interim-report',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    MatDatepickerModule,
    NgIf,
    MatProgressBarModule,
    CommonModule
  ],
  templateUrl: './send-interim-report.component.html',
  styleUrl: './send-interim-report.component.css'
})
export class SendInterimReportComponent {

  manageReportForm: FormGroup 
  selectedProfile = []
  pendingReport = {}
  loading = true

  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogData : any,
    public dialogRef: MatDialogRef<any>,
    public formbuilder: FormBuilder,
    public firestore: Firestore
  ) {
    this.selectedProfile = dialogData
    console.log(dialogData)
    const collRef = collection(this.firestore,"interimreport log")
    const q = query(collRef,where("status", "==", null))
    getDocs(q).then(report=>{
      console.log("Total Report", report.size)
      for (let i = 0; i < report.docs.length; i++) {
        const element = report.docs[i];
        var data = element.data()
        this.pendingReport[data["profileid"]] = data["docid"]
      }
      this.loading = false
    })
  }

  ngOnInit(): void {
    this.manageReportForm = this.formbuilder.group({
      duedate : ['', { validators: [Validators.required], updateOn: "change" }],
      locktime: [15, { validators: [Validators.required], updateOn: "change" }],
      remaindertime: [5, { validators: [Validators.required], updateOn: "change" }],
    })
  }

  async updateInterimReport(){
    var value = this.manageReportForm.value
    console.log(value)
    if(this.manageReportForm.valid){
      var batch = writeBatch(this.firestore)
      var remainderdate = new Date(new Date(value["duedate"]).setDate(value["duedate"].getDate() - value["remaindertime"]))
      var lockdate = new Date(new Date(value["duedate"]).setDate(value["duedate"].getDate() + value["locktime"]))
      console.log("Remainder", remainderdate, "Lock Date", lockdate)
      for (let i = 0; i < this.selectedProfile.length; i++) {
        const profileid = this.selectedProfile[i];
        var data = {
          docid: this.pendingReport[profileid] ?? doc(collection(this.firestore,"interimreport log")).id,
          profileid: profileid,
          duedate: value["duedate"],
          lockdate: lockdate,
          remainderdate: remainderdate,
          lastupdate:serverTimestamp(),
          status: null
        }       
        batch.set(doc(this.firestore,"interimreport log",data['docid']), data, {merge: true}) 
      }
      this.loading = true
      await batch.commit().then(()=>{
        this.dialogRef.close()
      }).catch(err =>{
        console.log(err)
      })
      this.loading = false
    }
  }
}
