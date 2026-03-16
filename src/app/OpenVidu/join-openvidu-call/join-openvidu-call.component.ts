import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, createLocalScreenTracks, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, LocalTrackPublication, } from 'livekit-client';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { ActivatedRoute } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { OpenviduVideoElementComponent } from '../openvidu-video-element/openvidu-video-element.component';
import { CommonModule } from '@angular/common';
import { OpenviduAudioElementComponent } from '../openvidu-audio-element/openvidu-audio-element.component';
import { NoiseCancellationService } from '../../Service/NoiseCancellation/noisecancellation.service';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';


type TrackInfo = {
  trackPublication: RemoteTrackPublication;
  participantIdentity: string;
  participantName: string
};

type RoomInfo = {
  roomId: string;
  title: string | undefined | null;
  hosts: Array<string> | undefined | null;
  egressId: string | undefined | null;
  roomstatus: "live" | "finished"
  recordingstatus: "started" | "ended" | "starting" | "ending" | "idle"
};

@Component({
  selector: 'app-join-openvidu-call',
  imports: [
    OpenviduVideoElementComponent,
    OpenviduAudioElementComponent,
    CommonModule,
    MatIconModule,
    MatMenuModule,
  ],
  templateUrl: './join-openvidu-call.component.html',
  styleUrl: './join-openvidu-call.component.css'
})
export class JoinOpenviduCallComponent implements AfterViewInit, OnDestroy {

  loggedinProfileid = null
  loggedinProfileRole = {}

  // Map Participant
  room = signal<Room | undefined>(undefined)
  localParticipant = signal<LocalVideoTrack | undefined>(undefined)
  remoteParticipants = signal<Map<string, TrackInfo>>(new Map());
  remoteParticipantsQuality = signal<Map<string, ConnectionQuality>>(new Map());
  remoteParticipantsMute = signal<Map<string, boolean>>(new Map());
  activeSpeakers:Array<string> = [];

  // Meta Data
  roomDetail: RoomInfo | undefined | null;
  roomSubscription = new Subject<void>();

  // UI States
  loading = true;
  isSharing = false;
  meetingRoomStatus: null | "connecting" | "connected" | "left" | "ended" = null
  // Fullscreen Enable
  isFullscreen = false;
  @ViewChild('meetingContainer') meetingContainer!: ElementRef;
  

  // Permission
  cameraStatus: 'granted' | 'denied' | 'prompt' = 'prompt';
  micStatus: 'granted' | 'denied' | 'prompt' = 'prompt';
  isRequesting = false;

  constructor(
    public firestore: Firestore,
    public route: ActivatedRoute,
    public httpClient: HttpClient,
    public guard: AuthguardService,
    public noiseCancellationService: NoiseCancellationService,
    public dialog: MatDialog
  ){}

  ngAfterViewInit(): void {
    var id = this.route.snapshot.paramMap.get("roomid")
    console.log("Router ID", id)
    if(id){
      this.guard.getRoles().then(roles =>{
        this.loggedinProfileid = roles["profile_ref"].id
        this.loggedinProfileRole = roles
      }).then(()=>{
        this.roomDetail = {
          roomId: id,
          title: "",
          hosts: [],
          egressId: null,
          roomstatus: null,
          recordingstatus: "starting"
        }

        docData(doc(this.firestore, "openviduroom", id)).pipe(
          takeUntil(this.roomSubscription)
        ).subscribe(data =>{
          if(data && data["active"]){

            // Prepare Call - Only when screen launched first time
            if(this.roomDetail.title == "") this.prepareParticipant()

            this.roomDetail = {
              roomId: id,
              title: data["title"],
              hosts: data["hosts"],
              egressId: (data["egressInfo"] ?? {})["egressId"],
              roomstatus: data["roomstatus"],
              recordingstatus: data["recordingstatus"]
            }
          }
          else{
            this.leaveRoom(false).then(() =>{
              this.meetingRoomStatus = "ended"
            })
          }
        })

        this.loading = false
      })
    }
  }

  ngOnDestroy(): void {
    this.leaveRoom(false)
    this.noiseCancellationService.cleanup()
    this.roomDetail = null
    this.roomSubscription?.next()
    this.roomSubscription?.complete()
  }

  // async prepareParticipant() {
  //   this.isRequesting = true;
  //   this.meetingRoomStatus = null

  //   try {
  //     // Try to request permission
  //     const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

  //     // Stop immediately to just preview
  //     // stream.getTracks().forEach(t => t.stop());

  //     // Create temporary LocalVideoTrack for preview
  //     const videoTrack = new LocalVideoTrack(stream.getVideoTracks()[0]);
  //     this.localParticipant.set(videoTrack);

  //     this.cameraStatus = 'granted';
  //     this.micStatus = 'granted';
  //     this.isRequesting = false;
  //     return true;
  //   } catch (err: any) {
  //     console.error("Permission error:", err);

  //     const isHardBlock = err.name === 'NotAllowedError' && err.message?.includes("Permission dismissed") === false;

  //     if (isHardBlock) {
  //       // HARD BLOCK → Chrome/Safari won’t prompt again
  //       this.cameraStatus = 'denied';
  //       this.micStatus = 'denied';

  //       this.isRequesting = false;
  //       return false;
  //     }

  //     // SOFT BLOCK or dismissed popup
  //     this.cameraStatus = 'prompt';
  //     this.micStatus = 'prompt';
  //     this.isRequesting = false;
  //     return false;
  //   }
  // }

  // async joinCall() {
  //   const allowed = await this.prepareParticipant();
  //   if (!allowed) {
  //     alert("Please allow Camera & Microphone to join the call.");
  //     return;
  //   }

  //   this.meetingRoomStatus = "connecting"

  //   // Create a new Room instance for this participant
  //   const room = new Room();
  //   this.room.set(room);

  //   // Handle incoming remote tracks
  //   room.on(
  //     RoomEvent.TrackSubscribed, 
  //     (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
  //       this.remoteParticipants.update((value) => {
  //         value.set(publication.trackSid, {
  //           trackPublication: publication,
  //           participantIdentity: participant.identity,
  //           participantName: participant.name ?? participant.identity
  //         })
  //         return value
  //       });
  //       console.log('Tracked', this.remoteParticipants());
  //     }
  //   );

  //   // Handle remote track removal
  //   room.on(
  //     RoomEvent.TrackUnsubscribed, 
  //     (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
  //       this.remoteParticipants.update((value) => {
  //         value.delete(publication.trackSid)
  //         return value
  //       });

  //       console.log('UnTracked', this.remoteParticipants());
  //     }
  //   );

  //   // Handle Quality Change
  //   room.on(
  //     RoomEvent.ConnectionQualityChanged, 
  //     (quality: ConnectionQuality, participant: Participant) => {
  //     console.log("Network quality changed:", participant.identity, quality);
  //     this.remoteParticipantsQuality.update((value) =>{
  //       value.set(participant.identity, quality)
  //       return value
  //     })
  //   });

  //   // Track Muted Participants
  //   room.on(RoomEvent.TrackMuted, (publication: RemoteTrackPublication, participant: Participant) => {
  //     if (publication.kind === Track.Kind.Audio) {
  //       this.remoteParticipantsMute.update((value) => {
  //         value.set(participant.identity, true);
  //         return value;
  //       });
  //       console.log('Audio muted:', participant.identity, this.remoteParticipantsMute().get(participant.identity));
  //     }
  //   });
  //   // Track unMuted Participants
  //   room.on(RoomEvent.TrackUnmuted, (publication: RemoteTrackPublication, participant: Participant) => {
  //     if (publication.kind === Track.Kind.Audio) {
  //       this.remoteParticipantsMute.update((value) => {
  //         value.delete(participant.identity);
  //         return value;
  //       });
  //       console.log('Audio unmuted:', participant.identity, this.remoteParticipantsMute().get(participant.identity));
  //     }
  //   });

  //   // Track Active Speakers
  //   room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
  //     var speakerID = speakers.map(e => e.identity)

  //     console.log("Active Speakers:", speakerID);
  //     this.activeSpeakers = speakerID
  //   });

  //   try {
  //     // Request a new token
  //     const response = await this.getToken();
  //     console.log('Token received:', response);

  //     // Connect to the LiveKit room
  //     // await ensures we wait until initial signaling is done
  //     await room.connect(response.url, response.token);
  //     this.meetingRoomStatus = "connected"
  //     console.log('Room connected:', this.loggedinProfileid);

  //     // Enable camera 
  //     await room.localParticipant.setCameraEnabled(true);
  //     // Set local video track
  //     const videoTrack = room.localParticipant.videoTrackPublications.values().next().value?.videoTrack;
  //     this.localParticipant.set(videoTrack);

  //     // Enable Microphone
  //     await room.localParticipant.setMicrophoneEnabled(true, {
  //       noiseSuppression: true,
  //       echoCancellation: true,
  //       voiceIsolation: true
  //     });

  //     // Enable camera and microphone for publishing - Default
  //     /*
  //     await room.localParticipant.enableCameraAndMicrophone();
  //     this.localParticipant.set(room.localParticipant.videoTrackPublications.values().next().value?.videoTrack); // Set Local Participant Video Track
  //     */

  //     // RNNoise Attempt
  //     /*
  //     try {
  //       // Get noise-suppressed audio track
  //       const cleanAudioTrack = await this.noiseCancellationService.getCleanAudioTrack();
  //       // Publish clean audio to LiveKit
  //       await room.localParticipant.publishTrack(cleanAudioTrack);

  //       console.log("Rnnoise successfull")
  //     } catch (audioCatch) { 
  //       console.log("Audio Catch", audioCatch) 
  //       console.log("Default Audio successfull")
  //     }
  //     */
  //   } catch (error: any) {
  //     // Handle connection errors gracefully
  //     console.log(error)
  //     console.log('There was an error connecting to the room:', error?.error?.errorMessage || error?.message || error);
  //     this.leaveRoom(false);
  //   }
  // }

  // // Get LiveKit Token
  // async getToken() {
  //   const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/createOpenViduToken`;

  //   // var randomID = Math.random().toString(36).substr(2, 9); // TODO: Remove ID
    
  //   const roomName = this.roomDetail.roomId
  //   const participantName = this.loggedinProfileRole["name"] // + " - " + randomID
  //   const participantId = this.loggedinProfileid // + " - " + randomID

  //   const response = await lastValueFrom(
  //     this.httpClient.post<{url: string, token: string }>(url, { roomName, participantName, participantId })
  //   );

  //   return response;
  // }

  // // Leave/Disconnect from the Room
  // async leaveRoom(confirmLeave: boolean) {

  //   var confirmed = confirmLeave ? confirm("Sure, do you want leave this meeting?") : true

  //   if(!confirmed) return

  //   // Leave the room by calling 'disconnect' method over the Room object
  //   await this.room()?.disconnect();
  //   this.room()?.removeAllListeners();

  //   // Reset all variables
  //   this.room.set(undefined);
  //   this.localParticipant.set(undefined);
  //   this.remoteParticipants.set(new Map());
  //   this.remoteParticipantsQuality.set(new Map());
  //   this.remoteParticipantsMute.set(new Map());
  //   this.activeSpeakers = [];
  //   this.meetingRoomStatus = "left"
  // }

  // // Close the Room and disconnect everyone
  // async endCall(){
  //   if(confirm("Sure, do you want to close this meeting for all?")){
  //     var progress = this.dialog.open(LoadingProgressComponent, {data:{msg: "Ending Call..."},disableClose:true})
  //     try {
  //       const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/openViduCloseRoom`;
  //       const response = await lastValueFrom(
  //         this.httpClient.post(url, {
  //           roomName: this.roomDetail["roomId"]
  //         })
  //       );

  //       console.log(response);
  //     } catch (error) {
  //       console.log(error)
  //     }
  //     this.leaveRoom(false);
  //     progress.close()
  //   }
  // }

  // // Check Remote Audio
  // isRemoteAudioMuted(participantIdentity: string): boolean {
  //   return this.remoteParticipantsMute().get(participantIdentity) ?? false;
  // }

  // // Audio Control
  // isAudioMuted():boolean{
  //   return this.room()?.localParticipant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true
  // }

  // toggleMute(){
  //   var value = this.isAudioMuted()
  //   if(value){
  //     this.room()?.localParticipant.getTrackPublication(Track.Source.Microphone).unmute()
  //   }
  //   else{
  //     this.room()?.localParticipant.getTrackPublication(Track.Source.Microphone).mute()
  //   }
  // }

  // // Video Control
  // isVideoHidden():boolean{
  //   return this.room()?.localParticipant.getTrackPublication(Track.Source.Camera)?.isMuted ?? true
  // }

  // toggleCamera(){
  //   var value = this.isVideoHidden()
  //   if(value){
  //     this.room()?.localParticipant.getTrackPublication(Track.Source.Camera).unmute()
  //   }
  //   else{
  //     this.room()?.localParticipant.getTrackPublication(Track.Source.Camera).mute()
  //   }
  // }

  // // Screen Share Control
  // async toggleScreenShare() {
  //   if (!this.isSharing) {
  //     await this.startScreenShare();
  //   } else {
  //     this.stopScreenShare();
  //   }
  //   this.isSharing = !this.isSharing;
  // }

  // async startScreenShare() {
  //   const screenTracks = await createLocalScreenTracks({
  //     audio: false,
  //     resolution: { width: 1920, height: 1080 }
  //   });

  //   for (const track of screenTracks) {
  //     await this.room()?.localParticipant.publishTrack(track);
  //   }

  //   console.log("Screen sharing started");
  // }

  // stopScreenShare() {
  //   const pub = this.room()?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  //   if (pub) {
  //     this.room()?.localParticipant.unpublishTrack(pub.track!);
  //     pub.track?.stop();
  //     console.log("Screen sharing stopped");
  //   }
  // }

  // // Recording Control
  // toggleRecording(){
  //   if(this.roomDetail.recordingstatus != "started"){
  //     this.startRecording()
  //   }
  //   else{
  //     this.stopRecording()
  //   }
  // }

  // async startRecording(){
  //   console.log("Recording started");
  //   this.roomDetail.recordingstatus = "starting";
  //   try {
  //     var roomId = this.roomDetail["roomId"]
  //     const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/openViduStartRecording`;
  //     const response = await lastValueFrom(
  //       this.httpClient.post(url, { roomId })
  //     );
  //     console.log(response)
  //   } catch (error) {
  //     console.log(error)
  //     this.roomDetail.recordingstatus = null;
  //   }
  // }

  // async stopRecording(){
  //   console.log("Recording stopped");
  //   var existingStatus = this.roomDetail.recordingstatus
  //   try {
  //     this.roomDetail.recordingstatus = "ending";
  //     var egressId = this.roomDetail["egressId"]
  //     if(egressId){
  //       const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/openViduStopRecording`;
  //       const response = await lastValueFrom(
  //         this.httpClient.post(url, { egressId: egressId, roomId: this.roomDetail.roomId })
  //       );
  //       console.log(response)
  //     }
  //     else{
  //       console.log("No Egress ID Found")
  //       this.roomDetail.recordingstatus = existingStatus;
  //     }
  //   } catch (error) { 
  //     console.log(error)
  //     this.roomDetail.recordingstatus = existingStatus;
  //   }
  // }

  // @HostListener('document:fullscreenchange')
  // onFullscreenChange() {
  //   this.isFullscreen = !!document.fullscreenElement;
  // }

  // toggleFullscreen() {
  //   const elem = this.meetingContainer.nativeElement;

  //   if (!document.fullscreenElement) {
  //     elem.requestFullscreen();
  //     this.isFullscreen = true;
  //   } else {
  //     document.exitFullscreen();
  //     this.isFullscreen = false;
  //   }
  // }

  // // Take reference snapshot
  // takeSnapshot() {
  //   console.log("Snapshot taken");
  //   // Implement your snapshot logic here
  // }

  // returnRemoteParticipantTrack() : TrackInfo[]{
  //   return Array.from(this.remoteParticipants().values())
  // }

  // getVideoParticipantCount(): number {
  //   // Count local participant (always has video) + remote video participants
  //   const remoteVideoCount = this.returnRemoteParticipantTrack().filter(
  //     remote => remote.trackPublication.kind === 'video'
  //   ).length;
  //   return 1 + remoteVideoCount;
  // }

  async prepareParticipant() {
    this.isRequesting = true;
    this.meetingRoomStatus = null

    try {
      // Try to request permission
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      // Stop immediately to just preview
      // stream.getTracks().forEach(t => t.stop());

      const videoTrack = new LocalVideoTrack(stream.getVideoTracks()[0]);
      this.localParticipant.set(videoTrack);

      this.cameraStatus = 'granted';
      this.micStatus = 'granted';
      this.isRequesting = false;
      return true;
    } catch (err: any) {
      console.error("Permission error:", err);

      const isHardBlock = err.name === 'NotAllowedError' && err.message?.includes("Permission dismissed") === false;

      if (isHardBlock) {
        // HARD BLOCK → Chrome/Safari won't prompt again
        this.cameraStatus = 'denied';
        this.micStatus = 'denied';

        this.isRequesting = false;
        return false;
      }

      // SOFT BLOCK or dismissed popup
      this.cameraStatus = 'prompt';
      this.micStatus = 'prompt';
      this.isRequesting = false;
      return false;
    }
  }

  async joinCall() {
    const allowed = await this.prepareParticipant();
    if (!allowed) {
      alert("Please allow Camera & Microphone to join the call.");
      return;
    }

    this.meetingRoomStatus = "connecting"

    // Create a new Room instance for this participant
    const room = new Room();
    this.room.set(room);

    // Handle incoming remote tracks
    room.on(
      RoomEvent.TrackSubscribed, 
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        this.remoteParticipants.update((value) => {
          value.set(publication.trackSid, {
            trackPublication: publication,
            participantIdentity: participant.identity,
            participantName: participant.name ?? participant.identity
          })
          return value
        });
        console.log('Tracked', this.remoteParticipants());
      }
    );

    // Handle remote track removal
    room.on(
      RoomEvent.TrackUnsubscribed, 
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        this.remoteParticipants.update((value) => {
          value.delete(publication.trackSid)
          return value
        });

        console.log('UnTracked', this.remoteParticipants());
      }
    );

    // Handle Quality Change
    room.on(
      RoomEvent.ConnectionQualityChanged, 
      (quality: ConnectionQuality, participant: Participant) => {
      console.log("Network quality changed:", participant.identity, quality);
      this.remoteParticipantsQuality.update((value) =>{
        value.set(participant.identity, quality)
        return value
      })
    });

    // Track Muted Participants
    room.on(RoomEvent.TrackMuted, (publication: RemoteTrackPublication, participant: Participant) => {
      if (publication.kind === Track.Kind.Audio) {
        this.remoteParticipantsMute.update((value) => {
          value.set(participant.identity, true);
          return value;
        });
        console.log('Audio muted:', participant.identity, this.remoteParticipantsMute().get(participant.identity));
      }
    });
    // Track unMuted Participants
    room.on(RoomEvent.TrackUnmuted, (publication: RemoteTrackPublication, participant: Participant) => {
      if (publication.kind === Track.Kind.Audio) {
        this.remoteParticipantsMute.update((value) => {
          value.delete(participant.identity);
          return value;
        });
        console.log('Audio unmuted:', participant.identity, this.remoteParticipantsMute().get(participant.identity));
      }
    });

    // Track Active Speakers
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      var speakerID = speakers.map(e => e.identity)

      console.log("Active Speakers:", speakerID);
      this.activeSpeakers = speakerID
    });

    try {
      // Request a new token
      const response = await this.getTokenWithRetry();
      console.log('Token received:', response);


      // Connect to the LiveKit room
      // await ensures we wait until initial signaling is done
      await room.connect(response.url, response.token);
      this.meetingRoomStatus = "connected"
      console.log('Room connected:', this.loggedinProfileid);

      // Enable camera 
      await room.localParticipant.setCameraEnabled(true);
      
      const videoTrack = room.localParticipant.videoTracks.values().next().value?.track;
      this.localParticipant.set(videoTrack);

      await room.localParticipant.setMicrophoneEnabled(true, {
        noiseSuppression: true,
        echoCancellation: true
      });

      // Enable camera and microphone for publishing - Default
      /*
      await room.localParticipant.enableCameraAndMicrophone();
      this.localParticipant.set(room.localParticipant.videoTracks.values().next().value?.track); // Set Local Participant Video Track
      */

      // RNNoise Attempt
      /*
      try {
        // Get noise-suppressed audio track
        const cleanAudioTrack = await this.noiseCancellationService.getCleanAudioTrack();
        // Publish clean audio to LiveKit
        await room.localParticipant.publishTrack(cleanAudioTrack);

        console.log("Rnnoise successfull")
      } catch (audioCatch) { 
        console.log("Audio Catch", audioCatch) 
        console.log("Default Audio successfull")
      }
      */
    } catch (error: any) {
      // Handle connection errors gracefully
      console.log(error)
      console.log('There was an error connecting to the room:', error?.error?.errorMessage || error?.message || error);
      this.leaveRoom(false);
    }
  }

 

  private async getTokenWithRetry(): Promise<any> {
    const roomName = this.roomDetail.roomId;
    const participantId = this.loggedinProfileid || `user-${Date.now()}`;
    const participantName = this.loggedinProfileRole["name"] || 'Guest';
    
    let retryCount = 0;

    while (retryCount <= 3) {
      try {
        return await firstValueFrom(
          this.httpClient.post<any>(`https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/createOpenViduToken`, {
            roomName,
            participantName,
            participantId
          })
        );
      } catch (error: any) {
        if (error.status === 503 && error.error?.code === 'SCALING_IN_PROGRESS') {
          retryCount++;
          if (retryCount > 3) throw new Error('System at capacity');
          
          const wait = error.error?.retryAfter || 60;
          console.log(`Scaling... retry in ${wait}s`);
          await new Promise(r => setTimeout(r, wait * 1000));
        } else {
          throw error;
        }
      }
    }
  }

  

  
  // Leave/Disconnect from the Room
  async leaveRoom(confirmLeave: boolean) {

    var confirmed = confirmLeave ? confirm("Sure, do you want leave this meeting?") : true

    if(!confirmed) return

    // Leave the room by calling 'disconnect' method over the Room object
    await this.room()?.disconnect();
    this.room()?.removeAllListeners();

    // Reset all variables
    this.room.set(undefined);
    this.localParticipant.set(undefined);
    this.remoteParticipants.set(new Map());
    this.remoteParticipantsQuality.set(new Map());
    this.remoteParticipantsMute.set(new Map());
    this.activeSpeakers = [];
    this.meetingRoomStatus = "left"
  }

  // Close the Room and disconnect everyone
  async endCall(){
    if(confirm("Sure, do you want to close this meeting for all?")){
      var progress = this.dialog.open(LoadingProgressComponent, {data:{msg: "Ending Call..."},disableClose:true})
      try {
        const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/openViduCloseRoom`;
        const response = await lastValueFrom(
          this.httpClient.post(url, {
            roomName: this.roomDetail["roomId"]
          })
        );

        console.log(response);
      } catch (error) {
        console.log(error)
      }
      this.leaveRoom(false);
      progress.close()
    }
  }

  // Check Remote Audio
  isRemoteAudioMuted(participantIdentity: string): boolean {
    return this.remoteParticipantsMute().get(participantIdentity) ?? false;
  }

  private getLocalTrackPublication(source: Track.Source): LocalTrackPublication | undefined {
    const room = this.room();
    if (!room) return undefined;

    if (source === Track.Source.Microphone) {
      return Array.from(room.localParticipant.audioTracks.values())
        .find(pub => pub.source === source);
    } else {
      return Array.from(room.localParticipant.videoTracks.values())
        .find(pub => pub.source === source);
    }
  }

  // Audio Control
  isAudioMuted():boolean{
    return this.getLocalTrackPublication(Track.Source.Microphone)?.isMuted ?? true
  }

  toggleMute(){
    var value = this.isAudioMuted()
    const micPub = this.getLocalTrackPublication(Track.Source.Microphone);
    if (!micPub) return;
    
    if(value){
      micPub.unmute()
    }
    else{
      micPub.mute()
    }
  }

  // Video Control
  isVideoHidden():boolean{
    return this.getLocalTrackPublication(Track.Source.Camera)?.isMuted ?? true
  }

  toggleCamera(){
    var value = this.isVideoHidden()
    const cameraPub = this.getLocalTrackPublication(Track.Source.Camera);
    if (!cameraPub) return;
    
    if(value){
      cameraPub.unmute()
    }
    else{
      cameraPub.mute()
    }
  }

  // Screen Share Control
  async toggleScreenShare() {
    if (!this.isSharing) {
      await this.startScreenShare();
    } else {
      this.stopScreenShare();
    }
    this.isSharing = !this.isSharing;
  }

  async startScreenShare() {
    const screenTracks = await createLocalScreenTracks({
      audio: false,
      resolution: { width: 1920, height: 1080 }
    });

    for (const track of screenTracks) {
      await this.room()?.localParticipant.publishTrack(track);
    }

    console.log("Screen sharing started");
  }

  stopScreenShare() {
    const pub = this.getLocalTrackPublication(Track.Source.ScreenShare);
    if (pub) {
      this.room()?.localParticipant.unpublishTrack(pub.track!);
      pub.track?.stop();
      console.log("Screen sharing stopped");
    }
  }

  // Recording Control
  toggleRecording(){
    if(this.roomDetail.recordingstatus != "started"){
      this.startRecording()
    }
    else{
      this.stopRecording()
    }
  }

  async startRecording(){
    console.log("Recording started");
    this.roomDetail.recordingstatus = "starting";
    try {
      var roomId = this.roomDetail["roomId"]
      const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/openViduStartRecording`;
      const response = await lastValueFrom(
        this.httpClient.post(url, { roomId })
      );
      console.log(response)
    } catch (error) {
      console.log(error)
      this.roomDetail.recordingstatus = null;
    }
  }

  async stopRecording(){
    console.log("Recording stopped");
    var existingStatus = this.roomDetail.recordingstatus
    try {
      this.roomDetail.recordingstatus = "ending";
      var egressId = this.roomDetail["egressId"]
      if(egressId){
        const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/openViduStopRecording`;
        const response = await lastValueFrom(
          this.httpClient.post(url, { egressId: egressId, roomId: this.roomDetail.roomId })
        );
        console.log(response)
      }
      else{
        console.log("No Egress ID Found")
        this.roomDetail.recordingstatus = existingStatus;
      }
    } catch (error) { 
      console.log(error)
      this.roomDetail.recordingstatus = existingStatus;
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }

  toggleFullscreen() {
    const elem = this.meetingContainer.nativeElement;

    if (!document.fullscreenElement) {
      elem.requestFullscreen();
      this.isFullscreen = true;
    } else {
      document.exitFullscreen();
      this.isFullscreen = false;
    }
  }

  // Take reference snapshot
  takeSnapshot() {
    console.log("Snapshot taken");
    // Implement your snapshot logic here
  }

  returnRemoteParticipantTrack() : TrackInfo[]{
    return Array.from(this.remoteParticipants().values())
  }

  getVideoParticipantCount(): number {
    // Count local participant (always has video) + remote video participants
    const remoteVideoCount = this.returnRemoteParticipantTrack().filter(
      remote => remote.trackPublication.kind === 'video'
    ).length;
    return 1 + remoteVideoCount;
  }
}