import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDocs, limit, orderBy, query, where, writeBatch } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';


@Component({
  selector: 'app-assign-procedure-studio',
  imports: [
    MatProgressSpinnerModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule
  ],
  templateUrl: './assign-procedure-studio.component.html',
  styleUrl: './assign-procedure-studio.component.css'
})
export class AssignProcedureStudioComponent {
  loading:boolean = false
  mapProcedure = {}
  atcList = []
  mapStudio = {}
  mapProfile = {}
  mapPreassignedagent = {}
  mapPreassignedprocedure = {}
  sortedParticipant: any = [];
  allparticipants = []
  sortedParticipants: { participant: string, profile: string, preassignedCount: number, checkin: boolean, implementationexpert: boolean }[] = [];
  sortedParticipantsByStudio: {};
  studiolist: any = [];
  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogdata: any,
    public dialogref: MatDialogRef<any>,
    public firestore: Firestore,
    public guard: AuthguardService
  ) {

  }

  ngOnInit(): void {
    console.log(this.dialogdata.studiolist,'this.dialogdata.studiolist');
    
    this.mapProfile = this.dialogdata.mapprofile
    this.mapPreassignedagent = this.dialogdata.mappreassignedagent
    this.mapPreassignedprocedure = this.dialogdata.mappreassignedprocedure
    this.studiolist = this.dialogdata.studiolist
    console.log(this.mapPreassignedprocedure);
    this.dialogdata.studiolist.forEach(e =>{
      this.mapStudio[e["docid"]] = e
    })
    // console.log(this.dialogdata)
    console.log("start starting");
    
    // Log the sorted data to verify
    // console.log(this.dialogdata);
    
    this.loading = true
    
    var eisRef = this.dialogdata.authorid.map(e => doc(this.firestore,'profile_data',e))
    getDocs(query(collection(this.firestore,"atc_alpha"),where("author", "array-contains-any", eisRef),where("profileid", "==", this.dialogdata.participantid),where("isdelete", "==", false),orderBy("prescription_date", "desc"),limit(1))).then(async atc=>{
      if(atc.size != 0){
        this.guard.getProcedureMap().then(data => this.mapProcedure = data)
        for (let i = 0; i < atc.docs.length; i++) {
          const atcDoc = atc.docs[i];
          var atcData = atcDoc.data()
          this.atcList.push({
            date: atcData["prescription_date"].toDate(),
            product: atcData["product"],
            adjustment: []
          })
          getDocs(query(collection(atcDoc.ref, 'corrections'),where("isdelete", "==", false))).then(async adj=>{
            for (let j = 0; j < adj.docs.length; j++) {
              const adjDoc = adj.docs[j];
              var adjData = adjDoc.data()
              this.atcList[i].adjustment.push({
                name: adjData["name"],
                procedure: [],
                selected: true
              })
              getDocs(query(collection(adjDoc.ref, 'procedures'),where("isdelete", "==", false))).then(procedure=>{
                for (let k = 0; k < procedure.docs.length; k++) {
                  const prodoc = procedure.docs[k];
                  var proData = prodoc.data()
                  this.atcList[i].adjustment[j].procedure.push({
                    name: this.mapProcedure[proData["name"].id],
                    changeagents: proData["assigned_to"] != null ? proData["assigned_to"].map(e => e.id) : [],
                    path: prodoc.ref.path,
                    mandatory: proData["mandatory"],
                    status: proData["status"],
                    studioid: proData["studioid"] ?? null
                  })
                }
                if((i+1 == atc.docs.length) && (j+1 == adj.docs.length)){
                  this.loading = false
                }
              })
            }
          })
        }
      }
      else{
        this.loading = false
      }
    })
  }

  getSelectedParticipantNames(studioId: string): string {
    const studio = this.dialogdata.studiolist.find(s => s.docid === studioId);
    if (studio) {
      return studio.participants.map(agent => this.mapProfile[agent]).join(', ');
    }
    return '';
  }

  getSortedStudios() {
    return this.dialogdata.studiolist.sort((a, b) => {
      const aCount = a.participants.reduce((sum, agent) => sum + (this.mapPreassignedprocedure[agent] || 0), 0);
      const bCount = b.participants.reduce((sum, agent) => sum + (this.mapPreassignedprocedure[agent] || 0), 0);
      return aCount - bCount;
    });
  }

 
  

  async assignStudio(){
    this.loading = true
    var condition = false
    for (let i = 0; i < this.atcList.length; i++) {
      var adjustment = this.atcList[i].adjustment
      if(adjustment.length == 0){
        alert("No Adjustment available to update")
        return
      }
      for (let j = 0; j < adjustment.length; j++) {
        const adj = adjustment[j];
        var procedure = adj.procedure
        for (let k = 0; k < procedure.length; k++) {
          const pro = procedure[k];
          if(pro.mandatory && pro.studioid == null){
            alert("Change agent required for the mandatory procedures")
            i = this.atcList.length + 1
            j = adjustment.length + 1
            k = procedure.length + 1
            break
          }
          else if((i+1 == this.atcList.length) && (j+1 == adjustment.length) && (k+1 == procedure.length)){
            condition = true
          }
        }
      }
    }
    if(condition){
      var studioid = []
      var batch = writeBatch(this.firestore)
      for (let i = 0; i < this.atcList.length; i++) {
        var adjustment = this.atcList[i].adjustment
        for (let j = 0; j < adjustment.length; j++) {
          const adj = adjustment[j];
          var procedure = adj.procedure
          for (let k = 0; k < procedure.length; k++) {
            const pro = procedure[k];
            studioid.push(pro.studioid)
            batch.update(doc(this.firestore, pro.path), {
              mandatory: pro.mandatory,
              studioid: pro.studioid ?? null,
              assigned_to: (this.mapStudio[pro.studioid] ?? {})["participants"]?.map(e => doc(this.firestore,"profile_data",e)) ?? null
            })
          }
        }
      }
      await batch.commit().then(() =>{
        this.dialogref.close(studioid)
      })
    }
    this.loading = false
  }

}
