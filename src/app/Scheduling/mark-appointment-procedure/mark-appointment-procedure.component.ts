import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDocs, getFirestore, query, where } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthguardService } from '../../authguard.service';

@Component({
  selector: 'app-mark-appointment-procedure',
  imports: [
    CommonModule,
    FormsModule,
    MatProgressBarModule,
    MatCheckboxModule,
    MatButtonModule
  ],
  templateUrl: './mark-appointment-procedure.component.html',
  styleUrl: './mark-appointment-procedure.component.css'
})
export class MarkAppointmentProcedureComponent implements OnInit {

  loading:boolean
  relevantProduct = null
  profileid = null
  specialist = []
  adjustmentList = [{
    adjusmtent: "",
    procedure: [{
      name: "",
      completed: false,
      autogenralized: false,
      procedurepath: "",
    }]
  }]
  procedureMap = {}

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    @Inject(MAT_DIALOG_DATA) public dialogdata: any,
    public dialogRef: MatDialogRef<any>,
  ) {
    console.log(this.dialogdata)
    this.adjustmentList = []
    this.profileid = dialogdata["profileid"]
    this.specialist = dialogdata["specialist"]
    this.relevantProduct = dialogdata["product"]
  }

  async ngOnInit() {
    this.loading = true
    await this.guard.getProcedureMap().then(data => this.procedureMap = data)
    await this.getATC()
    this.loading = false
  }

  async getATC(){
    const firestoreATC = getFirestore("firestore-atc")
    var data = []
    var specialistRef = this.specialist.map(e => doc(firestoreATC, "profile_data/"+e))
    var collectionRef = collection(firestoreATC, "atc_alpha")
    var queryFilter = query(collectionRef, where("profileid", "==", this.profileid), where("implementationagent", "array-contains-any", this.specialist), where("isdelete", "==", false))
    await getDocs(queryFilter).then(async atclist=>{
      var relevantATC = atclist.docs.sort((a, b) => b.data()["prescription_date"].toDate() - a.data()["prescription_date"].toDate())
      console.log(relevantATC.map(e => e.data()))
      relevantATC.sort((x, y) => {
        if (x.data()["product"] == this.relevantProduct) {
          return - 1;
        }
        else {
          return 0;
        }
      });
      console.log(relevantATC.map(e => e.data()))
      for (let i = 0; i < relevantATC.length; i++) {
        const atc = relevantATC[i];
        var adjCollection = collection(firestoreATC, atc.ref.path+"/corrections")
        var adjQuery = query(adjCollection, where("isdelete", "==", false), where("implementationagent", "array-contains-any", this.specialist))
        await getDocs(adjQuery).then(async adjustmentList=>{
          for (let j = 0; j < adjustmentList.docs.length; j++) {
            const adjustment = adjustmentList.docs[j];
            var context = adjustment.data()["name"]
            var changework = []
            var procedureCollection = collection(firestoreATC, adjustment.ref.path+"/procedures")
            var procedureQuery = query(procedureCollection, where("isdelete", "==", false), where("status", "==", "yet to start"), where("assigned_to", "array-contains-any", specialistRef))
            await getDocs(procedureQuery).then(procedureList =>{
              for (let k = 0; k < procedureList.docs.length; k++) {
                const procedure = procedureList.docs[k];
                changework.push({
                  name: this.procedureMap[procedure.data()["name"].id],
                  completed: false,
                  autogenralized: false,
                  procedurepath: procedure.ref.path,
                })
              }
            })
            if(changework.length != 0){
              data.push({
                adjusmtent: context,
                procedure: changework
              })
            }
          }
        })
      }
    })
    this.adjustmentList = data
    console.log(this.adjustmentList)
  }

  close(){
    this.dialogRef.close(null)
  }

  submit(){
    var data = []
    var completedAdj = this.adjustmentList.filter(a => a.procedure.filter(b => b.completed).length != 0)
    for (let i = 0; i < completedAdj.length; i++) {
      const procedure = completedAdj[i].procedure;
      for (let j = 0; j < procedure.length; j++) {
        const element = procedure[j];
        if(element.completed){
          data.push(element)
        }
      }
    }
    if(data.length == 0 && this.adjustmentList.length != 0){
      alert("Mark At least one procedure as completed")
    }
    else{
      this.dialogRef.close(data)
    }
  }

}
