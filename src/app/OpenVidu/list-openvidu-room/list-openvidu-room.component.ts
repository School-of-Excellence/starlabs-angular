import { Component } from '@angular/core';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, doc, Firestore, getDocs, query, where, getDoc, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
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

  loggedinProfileID
  liveAssignmentList = []
  openViduStudio = []

  mapProfile = {}
  mapAppointmenttype = {}

  subscription = new Subject<void>()
  openViduAppointments = [];
  AppointmentList = []
  

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
    if(profileid.length != 0){
      await getDocs(query(collection(this.firestore, "profile_data"), where("profileid", "in", profileid))).then(list =>{
        list.docs.forEach(document =>{
          this.mapProfile[document.id] = document.data()["name"]
        })
      })
    }
  }

  joinRoom(assignment){
    console.log(assignment)
    if(this.openViduStudio.includes(assignment["studioid"])){
      console.log("OpenVidu")
      var hostname = window.location.origin
      window.open(`${hostname}/joinroom/${assignment["docid"]}`, '_blank')
    }
    else{
      console.log("Zoom")
      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/openmeeting', assignment['docid']])
      );
      window.open(url, "_blank");
    }
  }

  async joinRoom_Appointment(appointment){
    console.log(appointment)
    if(this.openViduAppointments.includes(appointment["docid"])){
      console.log("OpenVidu")

      var loading = this.dialog.open(LoadingProgressComponent, {
        data: {msg: "Setting uP!..."},
        disableClose: true
      })

      try{
        var appointmentId = appointment["docid"]
        var roomDoc = doc(this.firestore, "openviduroom", appointmentId)

        await getDoc(roomDoc).then(async doc =>{
          if(!doc.exists()){
            var roomData = {
              active: true,
              createddate: serverTimestamp(),
              sessiontype: "appointment",
              sessionid: appointmentId,
              roomid: appointmentId,
              hosts: appointment["hostIds"],
              participantid: appointment["bookedbyId"],
              title: `${this.mapProfile[appointment["bookedbyId"]]} - ${this.mapAppointmenttype[appointment["appointment"].id]} (${appointment["hostIds"].map(e => this.mapProfile[e]).join(", ")})`,
              metadata: {
                appointmentid: appointmentId
              }
            }
            await setDoc(roomDoc, roomData)
          }
          else{
            if(!doc.data()["active"]){
              await updateDoc(roomDoc, {active: true})
            }
          }
        })
        loading.close();
  
        var hostname = window.location.origin
        window.open(`${hostname}/joinroom/${appointment["docid"]}`, '_blank')
      } catch(err){
        loading.close()
        console.log(err)
      }
      
    }
    else{
      console.log("Zoom")
      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/openmeeting', appointment['docid']])
      );
      window.open(url, "_blank");
    }
  }



  loadAppointments() {
    const appointmentCollection = collection(this.firestore, "appointments");
    const now = new Date();
    const liveQuery = query(
      appointmentCollection,
      where("platform", "==", "openvidu"),
      where("starttime", ">", now),
      where("cancelled", "==", false),
      where("attended", "==", false),
    );

    collectionData(liveQuery).pipe(takeUntil(this.subscription))
      .subscribe(data => {
        const userAppointments = data
        .map(appointment => {
          const hosts = appointment["hosts"] || [];
          const bookedby = appointment["bookedby"];

          const hostIds = hosts.map(ref => ref.path?.split('/').pop());
          const bookedbyId = bookedby?.path?.split('/').pop();

          return {
            ...appointment,
            hostIds,
            bookedbyId,
          };
        })
        .filter(appointment =>
          appointment.hostIds.includes(this.loggedinProfileID)
        );
        
        
        console.log("My appointments:", userAppointments);
        this.AppointmentList = userAppointments;
        this.openViduAppointments = userAppointments.map(e => e["docid"]);

        let profileIds = []
        for (let i = 0; i < this.AppointmentList.length; i++) {
          const appointment = this.AppointmentList[i];
          profileIds = [...appointment['hostIds'], appointment['bookedbyId']] 
          this.getProfileMap(profileIds.filter(e => !this.mapProfile[e]) as [])
        }
      });
  }

}
