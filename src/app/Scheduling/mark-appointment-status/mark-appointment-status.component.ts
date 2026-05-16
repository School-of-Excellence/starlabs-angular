import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDocs, serverTimestamp, updateDoc, writeBatch } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MarkAppointmentProcedureComponent } from '../mark-appointment-procedure/mark-appointment-procedure.component';

@Component({
  selector: 'app-mark-appointment-status',
  imports: [
    CommonModule,
    MatInputModule,
    FormsModule,
    MatFormFieldModule,
    MatCheckboxModule,
    MatSelectModule,
    MatButtonModule,
    ReactiveFormsModule,
  ],
  templateUrl: './mark-appointment-status.component.html',
  styleUrl: './mark-appointment-status.component.css'
})
export class MarkAppointmentStatusComponent implements OnInit {
  start
  end
  productType = null
  appointmentType = null
  loading:boolean = true
  attended:boolean = true
  apptdata = null
  journeyData = {
    name: null,
    start: null,
    end: null,
    status: null
  }
  journeyEnding:boolean = false
  cancelledReason:string = null
  cancelledReasonList = ["Client didn't show up", "Cancelled By Specialist", "Cancelled By Client", "Cancelled By Integrator"]
  completedProcedure = []
  mapProfile = {}
  mapAppointment = {}

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public datepipe: DatePipe,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<any>,
    public http: HttpClient,
    ) {
    console.log(data)
    this.data = data
    this.start = this.datepipe.transform(data["starttime"].toDate(), "HH:mm")
    this.end = this.datepipe.transform(data["endtime"].toDate(), "HH:mm")
  }

  async ngOnInit() {
    var productCollection = collection(this.firestore, "products")
    await getDocs(productCollection).then(product=>{
      for (let i = 0; i < product.docs.length; i++) {
        const productDoc = product.docs[i];
        var productData = productDoc.data()
        var productName = productData["product"].toLowerCase().replace(" ", "").trim()
        var appointmentName = this.data["appointmenttype"].toLowerCase().replace(" ", "").trim()
        if(productName.includes(appointmentName) && (productData["atcmodel"] ?? "").trim().length != 0){
          this.productType = productData["atcmodel"]
          break
        }
      }
    })
    console.log("Product Model", this.productType)
    this.loading = false
    /*
    // Depreciated Logic
    if(this.data["participantjourneyid"] != null){
      await this.firestore.collection("deliverables", ref=>ref.where("fileref", "array-contains", this.firestore.collection("appointments").doc(this.data["bookingid"]).ref)).get().toPromise().then(async delivery=>{
        if(delivery.size != 0){
          var deliverablepath = delivery.docs[0].ref.path
          await this.firestore.collection("participantJourneySequence").doc(this.data["participantjourneyid"]).get().toPromise().then(sequence=>{
            var productList = sequence.data()["products"].filter(e => e["productref"]["id"] == this.data["productid"] && (e["status"] == "initiated" || e["status"] == "ongoing"))
            for (let i = 0; i < productList.length; i++) {
              const deliveryList = productList[i]["delivery"];
              for (let j = 0; j < deliveryList.length; j++) {
                const delivery = deliveryList[j];
                if(delivery["sequenceref"]["path"] == deliverablepath){
                  this.journeyEnding = (j + 1 == deliveryList.length)
                  j = deliveryList.length + 1
                  i = productList.length + 1
                  break;
                }
              }
            }
          })
        }
      })
      
    }
    else{
      await this.firestore.collection("productToDeliverySequence", ref=>ref.where("deliverysequence", "array-contains", this.firestore.collection("appointmenttype").doc(this.data["appointmentid"]).ref)).get().toPromise().then(sequence=>{
        if(sequence.docs.length != 0){
          var docSequence = sequence.docs[0].data()["deliverysequence"] ?? []
          for (let i = 0; i < docSequence.length; i++) {
            const data = docSequence[i];
            if(data.path == "appointmenttype/"+this.data["appointmentid"] && ((i+1) == docSequence.length)){
              this.journeyEnding = true
              break
            }
          }
        }
      })
    }

    var dataAppointment = this.data["appointmenttype"]["appointmenttype"].toLowerCase().replace(" ", "").trim()
    await this.firestore.collection("appointment session", ref=>ref.orderBy("session")).get().toPromise().then(session=>{
      for (let i = 0; i < session.docs.length; i++) {
        const sessionName = session.docs[i].data()["session"];
        const dataSession = session.docs[i].data()["session"].toLowerCase().replace(" ", "").trim();
        if(dataAppointment.includes(dataSession)){
          this.appointmentType = sessionName
          break
        }
      }
    })
    */
  }

  ngAfterViewInit() {
    // Force enable all buttons in the dialog
    setTimeout(() => {
      const buttons = document.querySelectorAll('.mat-dialog-container button');
      buttons.forEach(btn => {
        (btn as HTMLElement).style.pointerEvents = 'auto';
        (btn as HTMLElement).style.zIndex = '10001';
      });
    }, 100);
  }


  close(){
    this.dialogRef.close()
  }

  async submit(){
    console.log(this.attended, this.journeyData.status)
    this.loading = true
    await this.markProcedure()
    this.loading = false
  }

  async markProcedure(){
    var ischangeworkrequired = (this.data["appointmenttype"]["ischangeworkrequired"] ?? false)
    if(ischangeworkrequired && this.attended){
      var procedureStatus = this.dialog.open(MarkAppointmentProcedureComponent,{
        data: {
          profileid: this.data["bookedby"].id,
          specialist: this.data["hostpath"].map(e => doc(this.firestore, e).id),
          product: this.productType
        },
        height: "90vh",
        width: "90vw"
      })
      procedureStatus.afterClosed().toPromise().then(data=>{
        console.log(data)
        if(data != null){
          this.completedProcedure = data
          this.updateAppointmentStatus()
        }
      })
    }
    else{
      this.updateAppointmentStatus()
    }
  }

  async updateAppointmentStatus(){
    var splitStart = this.start.split(":")
    var newStart = new Date(new Date(this.data["starttime"].toDate()).setHours(splitStart[0], splitStart[1]))
    var splitEnd = this.end.split(":")
    var newEnd = new Date(new Date(this.data["endtime"].toDate()).setHours(splitEnd[0], splitEnd[1]))
    console.log(newStart)
    console.log(newEnd)
    var totalMinutes = ((newEnd.getHours()*60 + newEnd.getMinutes()) - (newStart.getHours()*60 + newStart.getMinutes()))

    if(!this.attended){
      if (this.data['journeycoach'] == true || this.data['onboarding'] == true) {
        const Ref = doc(this.firestore,'participantjourneyproduct', (this.data['participantjourneyproductid'] ?? this.data['participantjourneyproduct']))
        updateDoc(Ref, {
          onboardingscheduled: null,
          onreschedule: true,
        })
      }
    }

    var appointmentDoc = doc(this.firestore, "appointments/"+this.data["bookingid"])
    await updateDoc(appointmentDoc, {
      attended: this.attended,
      cancelled: !this.attended,
      cancelledon: !this.attended ? serverTimestamp() : null, 
      cancelledreason: !this.attended ? this.cancelledReason : null,
      appointmentstart: newStart,
      appointmentend: newEnd,
      totalminutes: totalMinutes
    })
    var apptStatus = this.attended ? "completed" : "ready"
    await this.guard.updateDeliveryStatus(doc(this.firestore, "appointments/"+this.data["bookingid"]).path, apptStatus, {eventRequestRef: null})

    var batch = writeBatch(this.firestore)
    for (let i = 0; i < this.completedProcedure.length; i++) {
      const procedure = this.completedProcedure[i];
      var procedureDoc = doc(this.firestore, procedure.procedurepath)
      batch.update(procedureDoc, {
        status: "completed",
        autogenralized: procedure.autogenralized
      })
    }
    if(this.completedProcedure.length != 0){
      await batch.commit()
    }
    this.dialogRef.close()

    /*
    // Roadtime: Depreciated
    // var roadtimeDialog = this.dialog.open(AddRoadtimeComponent, {
    //   data: {
    //     client: this.data["bookedby"].id,
    //     host: this.data["hostpath"],
    //     product: this.productType,
    //     appointment: this.appointmentType,
    //     roadtime: null,
    //     roadtimeDate: null,
    //     from: "appointment",
    //     recommendation: null,
    //     id: this.data["bookingid"],
    //     skiproadtime: this.journeyEnding && this.attended
    //   },
    //   disableClose: true,
    //   autoFocus: false
    // })
    // await roadtimeDialog.afterClosed().toPromise().then(async data=>{
    //   if(data != null){
        await this.firestore.collection("appointments").doc(this.data["bookingid"]).update({
          attended: this.attended,
          cancelled: !this.attended,
          cancelledon: !this.attended ? firebase.default.firestore.FieldValue.serverTimestamp() : null, 
          cancelledreason: !this.attended ? this.cancelledReason : null,
          appointmentstart: newStart,
          appointmentend: newEnd,
          totalminutes: totalMinutes
        }).then(async ()=>{
          var status = this.attended ? "completed" : "ready"
          // if(this.data["journeycoach"]){
          //   await this.guard.updateJourneyCoach({
          //     profileid: this.data["bookedby"].id,
          //     participantjourneyid: this.data["participantjourneyid"]
          //   })
          // }
          // else{
            await this.guard.updateDeliveryStatus(this.firestore.collection("appointments").doc(this.data["bookingid"]).ref.path, status)
          // }
          for (let i = 0; i < this.completedProcedure.length; i++) {
            const procedure = this.completedProcedure[i];
            this.firestore.doc(procedure.procedurepath).update({
              status: "completed",
              autogenralized: procedure.autogenralized
            })
          }
          this.dialogRef.close()
        })
    //   }
    // })
    */
  }
}
