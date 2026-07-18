import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment'
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { InstanceStatusService } from '../../instance-status.service';
import { Firestore, collection, query, orderBy, getDocs, where, collectionData, Timestamp, serverTimestamp, setDoc, doc } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from "@angular/material/button";
import { AuthguardService } from '../../authguard.service';

interface OpenViduRoom {
  roomid: string;
  title: string;
  createddate: Timestamp;
  active: boolean;
  host: string[];
  metadata: {};
  participantid: null | string;
  participantjoined: string[];
  participantlive: string[];
  recordingstatus: null | string;
  roomstatus: null | string;
  sessionid: string;
  sessiontype: string;
}

interface EgressFile {
  duration: string;
  filename: string;
  size: string;
  startedAt: string;
}

interface OpenViduEvent {
  docid: string
  // Cloud that produced the recording (stamped by the webhook since multi-provider).
  // Absent on historical events = recorded on AWS.
  mediaProvider?: 'aws' | 'oci' | 'do';
  payload: {
    egressInfo: {
      roomId: string;
      file: EgressFile;
    };
  };
}

@Component({
  selector: 'app-openvidu-recording',
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule
],
  templateUrl: './openvidu-recording.component.html',
  styleUrl: './openvidu-recording.component.css'
})
export class OpenviduRecordingComponent {

  loggedInProfileid
  loggedInProfileRoles = {}

  liveRooms: OpenViduRoom[] = [];
  rooms: OpenViduRoom[] = [];
  selectedRoom: OpenViduRoom | null = null;
  events: OpenViduEvent[] = [];
  loading = false;
  eventsLoading = false;

  roomSubscription = new Subject<void>();

  constructor(
    private firestore: Firestore,
    public httpClient: HttpClient,
    public dialog: MatDialog,
    public guard: AuthguardService,
    private router: Router,
    private infraService: InstanceStatusService
  ){
    guard.getRoles().then(roles =>{
      this.loggedInProfileRoles = roles
      this.loggedInProfileid = this.loggedInProfileRoles["profile_ref"].id
    })
  }

  async ngOnInit() {
    await this.loadRooms();
  }

  async loadRooms() {
    this.loading = true;
    try {
      const roomsCollection = collection(this.firestore, 'openviduroom');
      const roomQuery = query(roomsCollection, orderBy('createddate', 'desc'));

      collectionData(roomQuery).pipe(
        takeUntil(this.roomSubscription)
      ).subscribe(data =>{
        var roomOnline = []
        var roomOffline = []
        for (let i = 0; i < data.length; i++) {
          const roomData = data[i];
          if(roomData["active"]){
            roomOnline.push(roomData)
          }
          else{
            roomOffline.push(roomData)
          }
        }
        this.rooms = roomOffline
        this.liveRooms = roomOnline
      })
      
    } catch (error) {
      console.error('Error loading rooms:', error);
    } finally {
      this.loading = false;
    }
  }

  // A live room is one currently in the Live Rooms list (active === true).
  isLiveRoom(room: OpenViduRoom | null): boolean {
    if (!room) return false;
    return this.liveRooms.some(r => r.roomid === room.roomid);
  }

  // Join an already-live room. The room doc carries mediaProvider, so /joinroom (LiveKit
  // component) routes to the right cluster and gates on server readiness — no server start
  // needed here (a live room's server is already up).
  joinRoom(room: OpenViduRoom) {
    this.router.navigate(['/joinroom', room.roomid]);
  }

  async selectRoom(room: OpenViduRoom) {
    console.log(room)
    this.selectedRoom = room;
    this.eventsLoading = true;
    this.events = [];
    
    try {
      const eventsCollection = collection(this.firestore, 'openvidu event');
      const eventQuery = query(
        eventsCollection,
        where('payload.egressInfo.roomName', '==', room.roomid),
        where('payload.event', '==', "egress_ended")
      );
      const querySnapshot = await getDocs(eventQuery);
      console.log(querySnapshot.size)

      var eventData = querySnapshot.docs.map(document => {
        var data = document.data()
        data["docid"] = document.id
        return data
      })
      eventData.sort((a, b) => b["time"].toDate() - a["time"].toDate())
      this.events = eventData as any
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      this.eventsLoading = false;
    }
  }

  formatDuration(nanoseconds: string): string {
    const totalSeconds = Math.floor(parseInt(nanoseconds) / 1000000000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  formatStartedAt(nanoseconds: string): string {
    const milliseconds = parseInt(nanoseconds) / 1000000;
    const date = new Date(milliseconds);
    
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  formatFileSize(bytes: string): string {
    const size = parseInt(bytes);
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB';
    if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + ' MB';
    return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  onPlay(event: OpenViduEvent) {
    // Placeholder function - implement your play logic here
    console.log('Play clicked for event:', event);
    // You can emit an event or call a service method here
  }

  async getVideoURL(event: OpenViduEvent){
    console.log(event)
    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Fetching Video. The link expires in 5 Mins"
      }
    })
    const videoKey = event.payload.egressInfo.file.filename
    // Presign against the storage of the cloud that made the recording.
    const signFn = event.mediaProvider === 'oci' ? 'getSignedUrlOci' : 'getSignedUrlAWS';
    const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/${signFn}`;
    const response = await lastValueFrom(
      this.httpClient.post(url, { videoKey })
    );
    console.log(response);

    loading.close()

    if(response["url"]){
      window.open(response["url"], "_blank")
    }
  }

  // Instant meeting: create the room stamped with the ACTIVE provider, wake that
  // provider's server if it's off, and take the creator straight into the room (the
  // join screen shows "server starting…" until the cluster is ready).
  async createNewRoom(){
    if(confirm("Sure, do you want to create a New Room?")){
      var RoomTitle = prompt("Enter Title for Room")
      if(RoomTitle.trim().length > 0){
        const collectionName = "openviduroom"
        const roomId = this.guard.generateId(this.firestore, collectionName)

        // Which cloud hosts this room — from openvidu server/mediaprovider (default aws).
        var activeProvider: 'aws' | 'oci' = 'aws'
        try {
          const providerData = await firstValueFrom(this.infraService.getActiveProvider())
          if (providerData?.activeprovider === 'oci') activeProvider = 'oci'
        } catch (e) {
          console.log("Active provider read failed, defaulting to aws", e)
        }

        await this.guard.createOpenViduRoom({
          active: true,
          createddate: serverTimestamp(),
          sessiontype: "private",
          sessionid: roomId,
          roomid: roomId,
          hosts: [this.loggedInProfileid],
          participantid: null,
          title: RoomTitle,
          metadata: {},
          mediaProvider: activeProvider,
        })

        // Wake the provider's server. A 400 means "already running" — that's success here.
        const startFn = activeProvider === 'oci' ? 'startOciMasterHTTP' : 'startMasterNodeHTTP'
        try {
          await lastValueFrom(this.httpClient.post(
            `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/${startFn}`, {}
          ))
          console.log(`[Instant meeting] ${activeProvider} server starting`)
        } catch (error: any) {
          if (error?.status === 400) {
            console.log(`[Instant meeting] ${activeProvider} server already running`)
          } else {
            console.error(`[Instant meeting] ${startFn} failed:`, error)
            alert("Room created, but the server could not be started. Check the monitor screen.")
          }
        }

        // Straight into the room — join screen gates on server readiness.
        this.router.navigate(['/joinroom', roomId])

        // var roomData = {
        //   active: true,
        //   createddate: serverTimestamp(),
        //   sessiontype: "private",
        //   sessionid: roomId,
        //   roomid: roomId,
        //   hosts: [this.loggedInProfileid],
        //   participantid: null,
        //   title: RoomTitle,
        //   metadata: {}
        // }
        // await setDoc(roomDoc, roomData)
      }
      else{
        alert("Need Room Title")
      }
    }
  }
}
