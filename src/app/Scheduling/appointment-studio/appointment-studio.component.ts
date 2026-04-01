import { Component } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { Firestore, collection, query, orderBy, where, collectionSnapshots, Query, doc, limit, getDocs, getDoc, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, interval, Subject, Subscription, takeUntil } from 'rxjs';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { MarkAppointmentStatusComponent } from '../mark-appointment-status/mark-appointment-status.component';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatSlideToggleModule } from "@angular/material/slide-toggle";

@Component({
  selector: 'app-appointment-studio',
  imports: [
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    CommonModule,
    MatSlideToggleModule,
],
  templateUrl: './appointment-studio.component.html',
  styleUrl: './appointment-studio.component.css'
})
export class AppointmentStudioComponent {

  Array = Array

  loggedinPID;
  profileRoles = {}
  loading:boolean = true;
  superRole:boolean = false

  mapProfileMeta = {}
  mapProfile = {};
  mapAppointment = {};
  mapRoles:any = {};
  mapJourney = {}

  productType = null
  currentAppointments: any[] = []
  lastUnmarkedAppointment: any = null
  appointmentMessages: { [appointmentId: string]: { isLoading: boolean, error: string | null, success: string | null } } = {};

  // Live Appointment
  liveAppointmentStatus: any = '';
  timerSub?: Subscription = null;

  appointmentSubscription = new Subject<void>()

  zoomlinkGenerator: boolean = false;
  deliverablesRefs: any

  productOwnerAppointments = []
  upcomingAppointmentModel = []

  openViduAppointments = []

  constructor(public firestore: Firestore, public guard: AuthguardService, public datepipe: DatePipe, public matdialog: MatDialog, public router: Router, public route: ActivatedRoute, public dialog: MatDialog,public http: HttpClient) {

    guard.getRoles().then(async roleData=>{
      this.profileRoles = roleData
      this.superRole = roleData["developer"]
      this.loggedinPID = roleData["profile_ref"].id
      // if(this.superRole || roleData["eis"] || roleData["changeagent"]){
        await this.mapData()
        // this.dateChangeEvent(this.appointmentViewDate)
        this.fetchAppointment()
      // }
      if(roleData["productowner"] ?? [].length != 0){
        this.fetchproductownerAppointments(roleData["productowner"])
      }
    })
  }

  ngOnDestroy(): void {
    this.appointmentSubscription?.complete()
    this.timerSub?.unsubscribe()
    this.timerSub = null
  }

  async mapData(){
    var promises = [
      this.guard.getAppointmentRolesMap(),
      this.guard.getAppointmentMap(),
      this.guard.getParticipantMetaMap(),
      this.guard.getJourneyMap()
      // this.guard.getProductMap()
    ]
    await Promise.all(promises).then(result =>{
      var apptRoleMap = result[0]
      var apptMap = result[1]
      var profileMap = result[2]
      var journeyMap = result[3]
      this.mapRoles = apptRoleMap["mapbypath"]
      this.mapAppointment = apptMap["map"]
      this.mapProfile = profileMap["map"]
      this.mapProfileMeta = profileMap["docdata"]
      this.mapJourney = journeyMap
      // this.mapProduct = result[4]
    })
  }

  fetchAppointment(){
    this.appointmentSubscription?.next()
    this.appointmentSubscription?.complete()
    this.appointmentSubscription = new Subject<void>()
    
    var currentStartDate = new Date()
    currentStartDate.setHours(0, 0, 0, 0)
    var currentEndDate = new Date()
    currentEndDate.setHours(23, 59, 59, 59)
    
    var apptCollection = collection(this.firestore, "appointments")
    var queryOption = [
      where("hosts", "array-contains", doc(this.firestore, "profile_data/"+this.loggedinPID)),
      where("starttime", ">=", currentStartDate),
      // where("starttime", "<=", currentEndDate),
      orderBy("starttime")
    ]
  
    var apptQuery:Query = query(apptCollection, ...queryOption)
    
    collectionSnapshots(apptQuery).pipe(
      takeUntil(this.appointmentSubscription)
    ).subscribe(booked =>{
     
      this.loading = false
      this.checkUnmarkedPreviousAppointments()
      
      var currentAppointments: any[] = []
      
      for (let i = 0; i < booked.length; i++) {
        const appointment = booked[i];
        var appointmentData = appointment.data()
        
        // Skip if Cancelled or Marked Attended
        if(appointmentData["cancelled"] || appointmentData["attended"]) continue
        
        var hostData = []
        var hostNames = []
        var hostID = []
        
        appointmentData["appointmentrole"].forEach(role=>{
          var hostName = []
          appointmentData["hostRole"][role.path].forEach(host=>{
            hostName.push(this.mapProfile[host.id])
            hostNames.push(this.mapProfile[host.id])
            hostID.push(host.path)
          })
          var value = this.mapRoles[role.path] + ": " + hostName.join(', ')
          hostData.push(value)
        })
        
        hostData = Array.from(new Set(hostData))
        hostNames = Array.from(new Set(hostNames))
        hostID = Array.from(new Set(hostID))
        
        var metaData = appointmentData
        metaData["type"] = "appointment"
        metaData["clientname"] = this.mapProfile[appointmentData["bookedby"].id]
        metaData["bookingid"] = appointment.id
        metaData["appointmenttype"] = this.mapAppointment[appointmentData["appointment"].id]
        metaData["appointmentid"] = appointmentData["appointment"].id
        metaData["hostdata"] = hostData
        metaData["hostpath"] = hostID        
        metaData["activejourney"] = this.mapJourney[this.mapProfileMeta[appointmentData["bookedby"].id]["activejourney"]]
        
        
        var startTime = new Date(appointmentData["starttime"].toDate())
        var endTime = new Date(appointmentData["endtime"].toDate())
        var platform = appointmentData['platform']

        var calendarEvent = {
          start: startTime,
          end: endTime,
          title: `${metaData["clientname"]} - ${metaData["appointmenttype"]}`,
          meta: metaData,
          platform: platform
        }

        if(endTime.getTime() >= new Date().getTime()){
          currentAppointments.push(calendarEvent)
        }
      }
      
      this.currentAppointments = currentAppointments
      this.openViduAppointments = currentAppointments.filter(e => e['platform'] == 'openvidu').map(e => e['meta']["bookingid"]);

      
      this.timerSub = interval(1000).subscribe(() => this.checkLiveAppointment());
    })
  }

  async fetchproductownerAppointments(atcmodels: string[]) {
    console.log("ATC Models", atcmodels)

    var upcomingModel = []
    var mapProductModel = []
    var eligibleProduct = []
    if(atcmodels.length != 0){
      await getDocs(query(collection(this.firestore, 'products'), where("atcmodel", "in", atcmodels))).then(atcmodel => {
        atcmodel.docs.forEach(e => {
          eligibleProduct.push(e.id)
          mapProductModel[e.id] = e.data()["atcmodel"]
        })
      })
    }
    console.log("Eligible Products", eligibleProduct)
    
    if(eligibleProduct.length == 0){
      return
    }

    const currentStartDate = new Date()
    currentStartDate.setHours(0, 0, 0, 0)
    var currentEndDate = new Date()
    currentEndDate.setHours(23, 59, 59, 59)
    
    const apptCollection = collection(this.firestore, "appointments")
    const queryOption = [
      // where("productid", "in", eligibleProduct),
      where("starttime", ">=", currentStartDate),
      // where("starttime", "<=", currentEndDate),
      orderBy("starttime")
    ]
    
    const apptQuery: Query = query(apptCollection, ...queryOption)
    
    collectionSnapshots(apptQuery).pipe(
      takeUntil(this.appointmentSubscription)
    ).subscribe(async booked => {
      const matchedAppointments = []
      
      for (const appointment of booked) {
        const appointmentData = appointment.data()

        // Skip if Cancelled or Marked Attended
        if(appointmentData["cancelled"] || appointmentData["attended"]) continue

        if(eligibleProduct.includes(appointmentData["productid"]) || (this.superRole && appointmentData["onboarding"])){
          var hostData = []
          var hostNames = []
          var hostID = []
          
          appointmentData["appointmentrole"].forEach(role=>{
            var hostName = []
            appointmentData["hostRole"][role.path].forEach(host=>{
              hostName.push(this.mapProfile[host.id])
              hostNames.push(this.mapProfile[host.id])
              hostID.push(host.path)
            })
            var value = this.mapRoles[role.path] + ": " + hostName.join(', ')
            hostData.push(value)
          })
          
          hostData = Array.from(new Set(hostData))
          hostNames = Array.from(new Set(hostNames))
          hostID = Array.from(new Set(hostID))

          // Skip if Cancelled or Marked Attended
          if(hostID.includes("profile_data/"+this.loggedinPID)) {
            continue
          }
          
          var metaData = appointmentData
          metaData["type"] = "appointment"
          metaData["clientname"] = this.mapProfile[appointmentData["bookedby"].id]
          metaData["bookingid"] = appointment.id
          metaData["appointmenttype"] = this.mapAppointment[appointmentData["appointment"].id]
          metaData["appointmentid"] = appointmentData["appointment"].id
          metaData["hostdata"] = hostData
          metaData["hostpath"] = hostID
          metaData["activejourney"] = this.mapJourney[this.mapProfileMeta[appointmentData["bookedby"].id]["activejourney"]]

          var startTime = new Date(appointmentData["starttime"].toDate())
          var endTime = new Date(appointmentData["endtime"].toDate())

          var calendarEvent = {
            start: startTime,
            end: endTime,
            title: `${metaData["clientname"]} - ${metaData["appointmenttype"]}`,
            meta: metaData
          }

          if(endTime.getTime() >= new Date().getTime()){
            matchedAppointments.push(calendarEvent)
            const productModel = mapProductModel[appointmentData["productid"]]
            if(productModel){
              upcomingModel.push(productModel)
            }
            else if(appointmentData["onboarding"]){
              upcomingModel.push("Onboarding")
            }
          }
        }

        /*        
        // Get deliverables for this appointment
        const deliverableQuery = query(
          collection(this.firestore, 'deliverables'), 
          where("fileref", "array-contains", appointment.ref)
        )
        
        const deliverableSnapshot = await getDocs(deliverableQuery)
        
        // Check each deliverable
        for (const deliverableDoc of deliverableSnapshot.docs) {
          const deliverableData = deliverableDoc.data()
          
          // Get participant product
          const participantProductRef = doc(
            this.firestore, 
            'participantsproduct', 
            deliverableData['participantproductid']
          )
          const participantProductSnap = await getDoc(participantProductRef)
          
          if (participantProductSnap.exists()) {
            const productRefId = participantProductSnap.data()['productref'].id
            const atcmodel = this.mapProduct[productRefId]?.['atcmodel']
           
            if (atcmodel && atcmodels.includes(atcmodel)) {
              var metaData = appointmentData
              metaData["type"] = "appointment"
              metaData["clientname"] = this.mapProfile[appointmentData["bookedby"].id]
              metaData["bookingid"] = appointment.id
              metaData["appointmenttype"] = this.mapAppointment[appointmentData["appointment"].id]
              metaData["appointmentid"] = appointmentData["appointment"].id
              metaData["hostdata"] = hostData
              metaData["hostpath"] = hostID
              if(endTime.getTime() >= new Date().getTime()){
                matchedAppointments.push(calendarEvent)
              }
              break 
            }
          }
        }
        */
      }
      
      console.log('Matched appointments:', matchedAppointments)
      this.productOwnerAppointments = matchedAppointments 
      this.upcomingAppointmentModel = this.Array.from(new Set(upcomingModel))
    })
  }

  checkLiveAppointment(){
    if(this.currentAppointments.length != 0){
      const now = new Date();
      var apptStart = this.currentAppointments[0]["start"]
      var apptend = this.currentAppointments[0]["end"]

      if (now >= apptStart && now <= apptend) {
        this.liveAppointmentStatus = 'LIVE';
      } else if (now < apptStart) {
        this.liveAppointmentStatus = this.getCountdown(apptStart, now);
      } else {
        this.liveAppointmentStatus = 'ENDED';
        this.timerSub?.unsubscribe(); // stop after end
        this.timerSub = null
        this.fetchAppointment() // Again check next appointment
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
    return [hours, minutes, seconds];  `Starts in ${hours}H ${minutes}M ${seconds}S`;
  }
  
  async checkUnmarkedPreviousAppointments() {
    var appointmentCollection = collection(this.firestore, "appointments")
    var queryFilter = query(
      appointmentCollection, 
      where("hosts", "array-contains", doc(this.firestore, "profile_data/"+this.loggedinPID)), 
      where("endtime", "<=", new Date()), 
      orderBy("endtime", "desc"),
      limit(1)
    )
    
    await getDocs(queryFilter).then(previousAppt => {
      if (previousAppt.size > 0) {
        const lastAppt = previousAppt.docs[0]
        const apptData = lastAppt.data()
        var hostData = []
        var hostNames = []
        var hostID = []
        
        apptData["appointmentrole"].forEach(role=>{
          var hostName = []
          apptData["hostRole"][role.path].forEach(host=>{
            hostName.push(this.mapProfile[host.id])
            hostNames.push(this.mapProfile[host.id])
            hostID.push(host.path)
          })
          var value = this.mapRoles[role.path] + ": " + hostName.join(', ')
          hostData.push(value)
        })
        
        hostData = Array.from(new Set(hostData))
        hostNames = Array.from(new Set(hostNames))
        hostID = Array.from(new Set(hostID))
        
        // Check if last appointment status is not marked
        if (!apptData["cancelled"] && !apptData["attended"]) {
          apptData["type"] = "appointment"
          apptData["clientname"] = this.mapProfile[apptData["bookedby"].id]
          apptData['appointmenttype'] = this.mapAppointment[apptData["appointment"].id]
          apptData['bookingid'] = apptData['docid']
          apptData["appointmentid"] = apptData["appointment"].id
          apptData["hostdata"] = hostData
          apptData["hostpath"] = hostID
          apptData["name"] = this.mapProfile[apptData["bookedby"].id]
          apptData["appointmentname"] = this.mapAppointment[apptData["appointment"].id]["appointmenttype"]
          apptData["hosts"] = hostData.join("\n")
          apptData["slotdate"] = apptData["starttime"]
          this.lastUnmarkedAppointment = apptData
        } else {
          this.lastUnmarkedAppointment = null
        }
      } else {
        this.lastUnmarkedAppointment = null
      }
    })
  }
  
  
  startMeeting(appointment: any) {
    console.log(appointment);
    
    if (this.lastUnmarkedAppointment != null) {
      const clientName = this.mapProfile[this.lastUnmarkedAppointment['bookedby'].id] || 'Unknown Client';
      const message = `The last appointment with "${clientName}" status is not updated. Please update to proceed.`;
      
      if (confirm(message)) { // + "\n\nDo you want to update it now?"
        this.updateStatus(this.lastUnmarkedAppointment);
      }
      return;
    }

    this.joinRoom_Appointment(appointment)
    // let url = this.router.createUrlTree(['/openappointmentzoom/'+appointment.meta['docid']]);
    // window.open(url.toString(),"_blank");
  }

  async updateStatus(appointmentData){
    var response = this.dialog.open(MarkAppointmentStatusComponent, {
      data: appointmentData,
      disableClose: true,
      autoFocus: false
    })

    firstValueFrom(response.afterClosed()).then(() =>{
      this.checkUnmarkedPreviousAppointments()
    })
  }

  
  async regenerateZoomLink(appointment) {
    const appointmentId = appointment.bookingid || appointment.docid;
    
    // Initialize/clear message state
    this.appointmentMessages[appointmentId] = {
      isLoading: true,
      error: null,
      success: null
    };

    let url: string;
    
    if (environment.firebase.projectId == "starlabs-test") {
      console.log("test");
      console.log(appointment, 'appointment');
      url = "https://us-central1-starlabs-test.cloudfunctions.net/appointmentLinkRegenarate?appointmentid=" + appointment["docid"];
    }
    else if (environment.firebase.projectId == "fir-sample-aae4a" || environment.firebase.projectId == "launch-your-legacy-development") {
      console.log("Production");
      url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/appointmentLinkRegenarate?appointmentid=" + appointment["docid"];
    }
    else {
      console.error("Unknown project ID");
      this.appointmentMessages[appointmentId] = {
        isLoading: false,
        error: "Configuration error. Please contact support.",
        success: null
      };
      return;
    }

    try {
      const res: any = await firstValueFrom(this.http.get(url));
      console.log("Link generated successfully:", res);
      
      if (res && res.success) {
        // Success state
        this.appointmentMessages[appointmentId] = {
          isLoading: false,
          error: null,
          success: "Zoom link generated successfully!"
        };
        
        // Auto-clear success message after 5 seconds
        setTimeout(() => {
          if (this.appointmentMessages[appointmentId]) {
            this.appointmentMessages[appointmentId].success = null;
          }
        }, 5000);
        
        // Refresh appointment data
        this.fetchAppointment();
        
      } else {
        this.appointmentMessages[appointmentId] = {
          isLoading: false,
          error: "Unexpected response from server. Please try again.",
          success: null
        };
      }
      
    } catch (err: any) {
      console.error("Error generating link:", err);
      
      let errorMessage = "Failed to generate Zoom link. Please try again.";
      
      // Handle different error types
      if (err.status === 0) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (err.status === 400 && err.error?.error === 'NO_ZOOM_ACCOUNT_AVAILABLE') {
        errorMessage = "No Zoom account is currently available. All accounts are in use. Please try again later or contact admin.";
        alert(errorMessage)
      } else if (err.status === 429) {
        errorMessage = "Too many requests. Please wait a moment and try again.";
      } else if (err.status === 401) {
        errorMessage = "Authentication failed. Please contact support.";
      } else if (err.status === 404) {
        errorMessage = "Appointment not found. Please refresh the page.";
      } else if (err.status >= 500) {
        errorMessage = "Server error. Please try again or contact support.";
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      
      // Set error state
      this.appointmentMessages[appointmentId] = {
        isLoading: false,
        error: errorMessage,
        success: null
      };
      
    } finally {
      // Ensure loading is cleared
      if (this.appointmentMessages[appointmentId]) {
        this.appointmentMessages[appointmentId].isLoading = false;
      }
    }
    
    this.enableZoomLinkGenerator();
  }


  clearAppointmentMessage(appointmentId: string) {
    if (this.appointmentMessages[appointmentId]) {
      this.appointmentMessages[appointmentId] = {
        isLoading: false,
        error: null,
        success: null
      };
    }
  }


  enableZoomLinkGenerator(){
    this.zoomlinkGenerator = false
    setTimeout(() => this.zoomlinkGenerator = true, 10000)
  }

  getTimeUntilStart(startTime: Date): string {
    const now = new Date()
    const timeDiff = startTime.getTime() - now.getTime()
    
    if (timeDiff <= 0) {
      return 'Starting now'
    }
    
    const hours = Math.floor(timeDiff / (1000 * 60 * 60))
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))
    const days = Math.floor(hours / 24)
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`
    }
  }

  openMyCalendar(){
    const calendarWindow = window.open("/mycalendar", "_blank");
  
    // If window is blocked or null, handle it
    if (calendarWindow) {
      calendarWindow.focus(); // Switch to the tab if it's already open
    }
  }

  openProfile(profileid){
    const calendarWindow = window.open("/userprofile/"+profileid, "_blank");
  
    // If window is blocked or null, handle it
    if (calendarWindow) {
      calendarWindow.focus(); // Switch to the tab if it's already open
    }
  }

  async joinRoom_Appointment(selectedAppointment){
    console.log(selectedAppointment)

    var appointment = selectedAppointment["meta"]

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
            title: `${this.mapProfile[appointment["bookedby"].id]} - ${this.mapAppointment[appointment["appointment"].id]} (${appointment["hosts"].map(e => this.mapProfile[e.id]).join(", ")})`,
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
          //   title: `${this.mapProfile[appointment["bookedby"].id]} - ${this.mapAppointment[appointment["appointment"].id]} (${appointment["hosts"].map(e => this.mapProfile[e.id]).join(", ")})`,
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

    /*
    if(this.openViduAppointments.includes(appointment.meta["bookingid"])){
      console.log("OpenVidu")

      var loading = this.dialog.open(LoadingProgressComponent, {
        data: {msg: "Setting uP!..."},
        disableClose: true
      })

      try{
        var appointmentId = appointment.meta["bookingid"]
        console.log(appointment.meta);
        console.log(appointment.meta["bookedby"]);
        
        
        var roomDoc = doc(this.firestore, "openviduroom", appointmentId)
        const hostIds = appointment.meta["hosts"].map(ref => ref.id);

        await getDoc(roomDoc).then(async doc =>{
          if(!doc.exists()){
            var roomData = {
              active: true,
              createddate: serverTimestamp(),
              sessiontype: "appointment",
              sessionid: appointmentId,
              roomid: appointmentId,
              hosts: hostIds,
              participantid: appointment.meta["bookedby"].id,
              title: `${this.mapProfile[appointment.meta["bookedby"].id]} - ${this.mapAppointment[appointment.meta["appointment"].id]} (${hostIds.map(e => this.mapProfile[e]).join(", ")})`,
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
        window.open(`${hostname}/joinroom/${appointmentId}`, '_blank')
      } catch(err){
        loading.close()
        console.log(err)
      }
      
    }
    else{
      console.log("Zoom")
      const url = this.router.serializeUrl(
        this.router.createUrlTree(['/openmeeting', appointment.meta["bookingid"], 'appointment'])
      );
      window.open(url, "_blank");
    }
    */
  }

  onPlatformChange(enableOpenVidu, appointmentData){
    console.log(enableOpenVidu, appointmentData)
    updateDoc(doc(this.firestore, "appointments", appointmentData["docid"]), {
      platform: enableOpenVidu ? "openvidu" : "zoom"
    })
  }

  openJourneyPlan(appointment){
    console.log(appointment)
    const profileid = appointment.meta["bookedby"].id
    const url = this.router.createUrlTree(['/journeysupport', profileid]).toString();
    window.open(url, '_blank');
  }

}