import { Component } from '@angular/core';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, doc, Firestore, getDocs, query, where, getDoc, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { interval, Subject, Subscription, takeUntil } from 'rxjs';
import { MatButtonModule } from "@angular/material/button";
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-list-openvidu-room',
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './list-openvidu-room.component.html',
  styleUrl: './list-openvidu-room.component.css'
})
export class ListOpenviduRoomComponent {

  Array = Array

  loggedinProfileID
  liveAssignmentList = []
  openViduStudio = []

  mapProfile = {}
  mapAppointmenttype = {}

  subscription = new Subject<void>()
  openViduAppointments = [];
  AppointmentList = []
  // Live Appointment
  liveAppointmentStatus: any = '';
  timerSub?: Subscription = null;
  

  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public router: Router,
    public dialog: MatDialog,
  ){
    guard.getRoles().then(roles =>{
      this.loggedinProfileID = roles["profile_ref"].id
      this.loadLiveAssignment();
      this.loadAppointments();
    })
    
    this.guard.getAppointmentMap().then(data => this.mapAppointmenttype = data.map);
    console.log(this.mapAppointmenttype);
    
  }

  loadLiveAssignment(){
    var assignmentCollection = collection(this.firestore, "live assignment")
    var liveQuery = query(assignmentCollection, where("status", "==", "live"), where("participantid", "==", this.loggedinProfileID))

    collectionData(liveQuery).pipe(
      takeUntil(this.subscription)
    ).subscribe(data =>{
      var studioID = Array.from(new Set(data.map(e => e["studioid"])))
      console.log("Studio", studioID)

      if(studioID.length != 0){
        var studioCollection = collection(this.firestore, "queue studio pairing")
        var studioQuery = query(studioCollection, where("docid", "in", studioID))
        collectionData(studioQuery).pipe(
          takeUntil(this.subscription)
        ).subscribe(room =>{
          this.openViduStudio = room.filter(e => e["openvidu"]).map(e => e["docid"])
          this.liveAssignmentList = data

          for (let i = 0; i < this.liveAssignmentList.length; i++) {
            const assignment = this.liveAssignmentList[i];
            const pairing = assignment["pairing"] ?? []
            this.getProfileMap(pairing.filter(e => !this.mapProfile[e]))
          }
        })
      }
      else{
        this.liveAssignmentList = data
      }
    })
  }

  async getProfileMap(profileid:[]){
    for (let i = 0; i < profileid.length; i+=30) {
      const sublist = profileid.slice(i, i+30);
      getDocs(query(collection(this.firestore, "profile_data"), where("profileid", "in", sublist))).then(list =>{
        list.docs.forEach(document =>{
          this.mapProfile[document.id] = document.data()["name"]
        })
      }) 
    }
  }

  joinRoom_Queue(assignment){
    console.log(assignment)
    if(this.openViduStudio.includes(assignment["studioid"])){
      console.log("OpenVidu")
      var hostname = window.location.origin
      window.open(`${hostname}/joinroom/${assignment["docid"]}`, '_blank')
    }
    else{
      console.log("Zoom")
      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/openmeeting', assignment['docid'], 'queue'])
      );
      window.open(url, "_blank");
    }
  }

  async joinRoom_Appointment(appointment){
    console.log(appointment)

    if(appointment["platform"] == "openvidu"){
      var loading = this.dialog.open(LoadingProgressComponent, {
        data: {msg: "Setting uP!..."},
        disableClose: true
      })

      // Check Room Creation
      var roomDoc = doc(this.firestore, "openviduroom", appointment["docid"])

      await getDoc(roomDoc).then(async doc =>{
        if(!doc.exists()){
          await this.guard.createOpenViduRoom({
            active: true,
            createddate: serverTimestamp(),
            sessiontype: "appointment",
            sessionid: appointment["docid"],
            roomid: appointment["docid"],
            hosts: appointment["hosts"].map(e => e.id),
            participantid: appointment["bookedby"].id,
            title: `${this.mapProfile[appointment["bookedby"].id]} - ${this.mapAppointmenttype[appointment["appointment"].id]} (${appointment["hosts"].map(e => this.mapProfile[e.id]).join(", ")})`,
            metadata: {
              appointmentid: appointment["docid"]
            },
          })

          // var roomData = {
          //   active: true,
          //   createddate: serverTimestamp(),
          //   sessiontype: "appointment",
          //   sessionid: appointment["docid"],
          //   roomid: appointment["docid"],
          //   hosts: appointment["hosts"].map(e => e.id),
          //   participantid: appointment["bookedby"].id,
          //   title: `${this.mapProfile[appointment["bookedby"].id]} - ${this.mapAppointmenttype[appointment["appointment"].id]} (${appointment["hosts"].map(e => this.mapProfile[e.id]).join(", ")})`,
          //   metadata: {
          //     appointmentid: appointment["docid"]
          //   }
          // }
          // await setDoc(roomDoc, roomData)
        }
        else{
          if(!doc.data()["active"]){
            await updateDoc(roomDoc, {active: true})
          }
        }
      })

      // TODO: Check Server

      loading.close()

      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/joinroom', appointment["docid"]])
      );
      window.open(url, "_blank");
    }
    else{
      console.log("Zoom")
      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/openmeeting', appointment.meta["bookingid"], 'appointment'])
      );
      window.open(url, "_blank");
    }
  }

  loadAppointments() {
    const appointmentCollection = collection(this.firestore, "appointments");
    const now = new Date();
    now.setHours(0, 0, 0, 0)
    const liveQuery = query(
      appointmentCollection,
      // where("platform", "==", "openvidu"),
      where("bookedby", "==", doc(this.firestore, "profile_data", this.loggedinProfileID)),
      where("starttime", ">", now),
      where("cancelled", "==", false),
      where("attended", "==", false),
    );

    collectionData(liveQuery, {"idField": "docid"}).pipe(takeUntil(this.subscription)).subscribe(data => {
      var profileIDtoMap = []
      var upcomingAppointment = []
      for (let i = 0; i < data.length; i++) {
        var appointmentData = data[i];
        appointmentData["bookingid"] = appointmentData["docid"]

        // Skip if Cancelled or Marked Attended
        if(appointmentData["cancelled"] || appointmentData["attended"]) continue

        var endTime = new Date(appointmentData["endtime"].toDate())

        if(endTime.getTime() >= new Date().getTime()){
          appointmentData["appointmentrole"].forEach(role=>{
            appointmentData["hostRole"][role.path].forEach(host=>{
              if(!profileIDtoMap.includes(host.id)) profileIDtoMap.push(host.id)
            })
          })
          if(!profileIDtoMap.includes(appointmentData["bookedby"].id)) profileIDtoMap.push(appointmentData["bookedby"].id)
          upcomingAppointment.push(appointmentData)
        }
      }
      this.getProfileMap(profileIDtoMap.filter(e => !this.mapProfile[e]) as [])
      console.log("My appointments:", upcomingAppointment);
      this.AppointmentList = upcomingAppointment;

      this.timerSub = interval(1000).subscribe(() => this.checkLiveAppointment());

      // const userAppointments = data.map(appointment => {
      //   const hosts = appointment["hosts"] || [];
      //   const bookedby = appointment["bookedby"];

      //   const hostIds = hosts.map(ref => ref.id);
      //   const bookedbyId = bookedby?.id;

      //   return {
      //     ...appointment,
      //     hostIds,
      //     bookedbyId,
      //   };
      // })
      
      // console.log("My appointments:", userAppointments);
      // this.AppointmentList = userAppointments;
      // this.openViduAppointments = userAppointments.map(e => e["docid"]);

      // let profileIds = []
      // for (let i = 0; i < this.AppointmentList.length; i++) {
      //   const appointment = this.AppointmentList[i];
      //   profileIds = [...appointment['hostIds'], appointment['bookedbyId']] 
      //   this.getProfileMap(profileIds.filter(e => !this.mapProfile[e]) as [])
      // }
    });
  }

  checkLiveAppointment(){
    if(this.AppointmentList.length != 0){
      const now = new Date();
      var apptStart = this.AppointmentList[0]["starttime"].toDate()
      var apptend = this.AppointmentList[0]["endtime"].toDate()

      if (now >= apptStart && now <= apptend) {
        this.liveAppointmentStatus = 'LIVE';
      } else if (now < apptStart) {
        this.liveAppointmentStatus = this.getCountdown(apptStart, now);
      } else {
        this.liveAppointmentStatus = 'ENDED';
        this.timerSub?.unsubscribe(); // stop after end
        this.timerSub = null
        this.loadAppointments() // Again check next appointment
      }
    }
    else{
      this.timerSub?.unsubscribe()
      this.timerSub = null
    }
  }

  private getCountdown(target: Date, now: Date): Array<any> {
    const diff = target.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return [hours, minutes, seconds];
  }

}
