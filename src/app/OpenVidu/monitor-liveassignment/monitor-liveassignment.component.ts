import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, signal } from '@angular/core';
import { lastValueFrom, Subject, takeUntil } from 'rxjs';
import { LocalVideoTrack, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent } from 'livekit-client';
import { collection, collectionData, Firestore, limit, query, where } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { OpenviduVideoElementComponent } from '../openvidu-video-element/openvidu-video-element.component';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { OpenviduAudioElementComponent } from '../openvidu-audio-element/openvidu-audio-element.component';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatDialog } from '@angular/material/dialog';

type TrackInfo = {
  trackPublication: RemoteTrackPublication;
  participantIdentity: string;
  participantName: string;
};

@Component({
  selector: 'app-monitor-liveassignment',
  imports: [
    CommonModule,
    OpenviduVideoElementComponent,
    OpenviduAudioElementComponent
  ],
  templateUrl: './monitor-liveassignment.component.html',
  styleUrl: './monitor-liveassignment.component.css'
})
export class MonitorLiveassignmentComponent implements OnDestroy {

  loggedinProfileid = null
  loggedinProfileRole = {}

  mapOpenViduRoom: {} = {}
  openViduRoomList = []
  mapOpenViduRooms = signal<Map<string, Map<string, TrackInfo>>>(new Map());
  roomConnections = new Map<string, Room>();

  subscription = new Subject<void>()

  listeningRoom: string

  ghostID: " - Ghost" = " - Ghost"

  constructor(
    public http: HttpClient,
    public firestore: Firestore,
    public guard: AuthguardService,
    public dialog: MatDialog
  ){
    this.guard.getRoles().then(roles =>{
      this.loggedinProfileid = roles["profile_ref"].id
      this.loggedinProfileRole = roles

      var roomCollection = collection(firestore, "openviduroom")
      var collectionQuery = query(roomCollection, where("active", "==", true), where("roomstatus", "==", "live"))
      collectionData(collectionQuery).pipe(takeUntil(this.subscription)).subscribe(rooms =>{
        this.openViduRoomList = rooms

        // If no live rooms, disconnect all
        if (rooms.length === 0) {
          this.roomConnections.forEach((room, roomId) => this.leaveRoom(roomId));
          return;
        }
        
        for (let i = 0; i < rooms.length; i++) {
          const roomData = rooms[i];
          const roomID = roomData["roomid"]
          const participantJoined = (roomData["participantjoined"] ?? []).filter(e => !e.includes(this.ghostID)) // Filter out Ghost
          const activeParticipant = (roomData["participantlive"] ?? []).filter(e => participantJoined.includes(e)) // Filter Active as Real Participants
          this.mapOpenViduRoom[roomID] = roomData
          if(!this.roomConnections.has(roomID) && activeParticipant.length != 0){
            this.joinRoom(roomID)
          }
        }
      })
    })
  }

  ngOnDestroy() {
    this.subscription.next();
    this.subscription.complete();

    this.roomConnections.forEach(room => {
      room.disconnect();
      room?.removeAllListeners();
    });
    this.roomConnections.clear();
  }

  async joinRoom(roomName:string){
    // Initialize a new Room object
    const room = new Room();
    this.roomConnections.set(roomName, room);
    this.mapOpenViduRooms.update((value) =>{
      value.set(roomName, new Map())
      return value;
    })

    // Handle incoming remote tracks
    room.on(
      RoomEvent.TrackSubscribed, 
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        this.mapOpenViduRooms.update((value) => {
          value.get(roomName).set(publication.trackSid, {
            trackPublication: publication,
            participantIdentity: participant.identity,
            participantName: participant.name ?? participant.identity
          })
          return value
        });
      }
    );

    // Handle remote track removal
    room.on(
      RoomEvent.TrackUnsubscribed, 
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        this.mapOpenViduRooms.update((value) => {
          value.get(roomName).delete(publication.trackSid)
          return value
        });
      }
    );

    // Handle when a Remote Participant left
    // room.on(
    //   RoomEvent.ParticipantDisconnected,
    //   (participant: RemoteParticipant) => {
    //     // Count non-ghost participants
    //     const participantJoined = (this.mapOpenViduRoom[roomName] ?? {})["participantjoined"] ?? []
    //     const nonGhostParticipants = Array.from(room.remoteParticipants.values()).filter(
    //       p => !p.identity.includes(this.ghostID) && participantJoined.includes(p.identity)
    //     );
        
    //     // Disconnect only if no real participants remain (only ghosts left)
    //     if (nonGhostParticipants.length === 0) {
    //       console.log('All real participants left, disconnecting ghost');
    //       this.leaveRoom(roomName);
    //     }
    //   }
    // );

    room.on(
      RoomEvent.ParticipantDisconnected,
      (participant: RemoteParticipant) => {
        // Count non-ghost participants
        const participantJoined = (this.mapOpenViduRoom[roomName] ?? {})["participantjoined"] ?? []
        
        // ✅ CHANGED: Use participants instead of remoteParticipants (v1.x)
        const nonGhostParticipants = Array.from(room.participants.values()).filter(
          (p: RemoteParticipant) => !p.identity.includes(this.ghostID) && participantJoined.includes(p.identity)
        );
        
        // Disconnect only if no real participants remain (only ghosts left)
        if (nonGhostParticipants.length === 0) {
          console.log('All real participants left, disconnecting ghost');
          this.leaveRoom(roomName);
        }
      }
    );

    try {
      // Request a new token
      const response = await this.getToken(roomName);
      console.log('Token received:', response);

      // Connect to the LiveKit room
      // await ensures we wait until initial signaling is done
      await room.connect(response.url, response.token);
      console.log('Room connected:', this.loggedinProfileid);

      // Enable camera 
      await room.localParticipant.setCameraEnabled(false);
      // Enable Microphone
      await room.localParticipant.setMicrophoneEnabled(false);

    } catch (error: any) {
      // Handle connection errors gracefully
      console.log('There was an error connecting to the room:', error?.error?.errorMessage || error?.message || error);
      this.leaveRoom(roomName);
    }
  }

  // Get LiveKit Token
  async getToken(roomName: string) {
    const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/createOpenViduToken`;

    const participantName = this.loggedinProfileRole["name"] + this.ghostID
    const participantId = this.loggedinProfileid + this.ghostID

    const response = await lastValueFrom(
      this.http.post<{url: string, token: string }>(url, { roomName, participantName, participantId })
    );

    return response;
  }

  async endCall(RoomId){
    if(confirm("Sure, do you want to close this meeting for all?")){
      var progress = this.dialog.open(LoadingProgressComponent, {data:{msg: "Ending Call..."},disableClose:true})
      try {
        const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/openViduCloseRoom`;
        const response = await lastValueFrom(
          this.http.post(url, {
            roomName: RoomId
          })
        );

        console.log(response);
      } catch (error) {
        console.log(error)
      }
      this.leaveRoom(RoomId);
      progress.close()
    }
  }

  async leaveRoom(RoomId) {
    const room = this.roomConnections.get(RoomId);
    if (!room) return;
  
    // Remove all event listeners before disconnect
    room?.removeAllListeners();

    // Disconnect from the Room
    await room?.disconnect();

    this.roomConnections.delete(RoomId); // Changed from set to delete
    this.mapOpenViduRooms.update(value =>{
      value.delete(RoomId) // Changed from set to delete
      return value
    })
  }

  toggleListening(roomId: string) {
    if (this.listeningRoom === roomId) {
      this.listeningRoom = null;
    } else {
      this.listeningRoom = roomId;
    }
  }

  getVideoParticipantCount(room: MapIterator<TrackInfo>): number {
    // Count local participant (always has video) + remote video participants
    const remoteVideoCount = this.returnRemoteParticipantTrack(room).filter(
      remote => remote.trackPublication.kind === 'video'
    ).length;
    return remoteVideoCount;
  }

  returnRemoteParticipantTrack(room: MapIterator<TrackInfo>) : TrackInfo[]{
    return Array.from(room)
  }
}
