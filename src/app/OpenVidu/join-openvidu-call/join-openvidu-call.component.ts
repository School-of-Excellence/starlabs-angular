import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { BackgroundProcessor } from "@livekit/track-processors";
import { InstanceStatusService } from '../../instance-status.service';
import { MatDividerModule } from '@angular/material/divider';
import { DeepAudioFilterService } from '../../Service/NoiseCancellation/deep-audio-filter.service';
// ── [DF3] DeepFilterNet3 noise cancellation service (ONNX · AudioWorklet · no API key needed)
// Replaces Amazon Voice Focus as the active filter. VoiceFocus import + service kept intact below
// so it can be re-enabled by swapping the method body back.
import { DeepFilter3Service } from '../../Service/DeepFilter3/deepfilter3.service';

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
    MatDividerModule
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

  // Server Subscription
  serverSubscription = new Subject<void>();

  // UI States
  loading = true;
  isSharing = false;
  meetingRoomStatus: null | "servercheck" | "serverstarting" | "serverfailed" | "connecting" | "connected" | "left" | "ended" = "servercheck"
  // Fullscreen Enable
  isFullscreen = false;
  @ViewChild('meetingContainer') meetingContainer!: ElementRef;
  
  // Permission
  cameraStatus: 'granted' | 'denied' | 'prompt' = 'prompt';
  micStatus: 'granted' | 'denied' | 'prompt' = 'prompt';
  isRequesting = false;

  isVideoBlurred:boolean = false;

  private previewStream: MediaStream | null = null;

  constructor(
    public firestore: Firestore,
    public route: ActivatedRoute,
    public httpClient: HttpClient,
    public guard: AuthguardService,
    public dialog: MatDialog,
    private infraService: InstanceStatusService,
    private audiofilterservice : DeepAudioFilterService, // kept — not removed, used in debugAudioLevels()
    private deepFilter3: DeepFilter3Service              // [DF3] active noise cancellation filter
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
            if(this.roomDetail.title == "") this.checkServer()

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

  isHost(): boolean {
    if (!this.roomDetail || !this.loggedinProfileid) return false;
    return this.roomDetail.hosts?.includes(this.loggedinProfileid) || false;
  }

  async checkServer(){
    this.infraService.getStatus().pipe(takeUntil(this.serverSubscription)).subscribe({
      next: (serverData) => {
        if (serverData) {
          const masterStatus = serverData["master"]["state"]
          const mediaNode = serverData["media"]["instanceStates"]["healthy"] || 0

          if(masterStatus == "running" && mediaNode > 0){
            this.prepareParticipant()
            this.serverSubscription?.next()
            this.serverSubscription?.complete()
          }
          else if(masterStatus == "running" || masterStatus == "starting"){
            this.meetingRoomStatus = "serverstarting"
          }
          else {
            this.meetingRoomStatus = "serverfailed"
          }
        }
      },
      error: (err) => {
        console.error('Infrastructure status error:', err);
      }
    });
  }

  async prepareParticipant() {
    this.isRequesting = true;
    this.meetingRoomStatus = null;
 
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
 
      // Store the full stream so joinCall() can stop the audio track later
      this.previewStream = stream;
 
      // Only use video for the preview tile — audio is not played back
      const videoTrack = new LocalVideoTrack(stream.getVideoTracks()[0]);
      this.localParticipant.set(videoTrack);
 
      this.cameraStatus = 'granted';
      this.micStatus = 'granted';
      this.isRequesting = false;
      return true;
    } catch (err: any) {
      console.error('Permission error:', err);
 
      const isHardBlock =
        err.name === 'NotAllowedError' &&
        err.message?.includes('Permission dismissed') === false;
 
      if (isHardBlock) {
        this.cameraStatus = 'denied';
        this.micStatus = 'denied';
      } else {
        this.cameraStatus = 'prompt';
        this.micStatus = 'prompt';
      }
 
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

    await this.enableMicrophoneWithNoiseCancellation(room);

    // await room.localParticipant.setMicrophoneEnabled(true, {
    //   noiseSuppression: true,
    //   echoCancellation: true
    // });

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

  isScreenSharing(): boolean {
    const screenSharePub = this.getLocalTrackPublication(Track.Source.ScreenShare);
    return screenSharePub !== undefined && !screenSharePub.isMuted;
  }

  isAnyoneScreenSharing(): boolean {
    const remoteTracks = Array.from(this.remoteParticipants().values());
    return remoteTracks.some(track => track.trackPublication.source === Track.Source.ScreenShare);
  }

  // Update toggleScreenShare to check this
  async toggleScreenShare() {
    if (!this.isScreenSharing()) {
      // Check if someone else is already sharing
      if (this.isAnyoneScreenSharing()) {
        alert("Someone else is already sharing their screen");
        return;
      }
      await this.startScreenShare();
    } else {
      this.stopScreenShare();
    }
  }

  // Get whoever is sharing screen (local or remote)
  getActiveScreenShare(): { track: any, isLocal: boolean, participantName: string } | null {
    // Check local first
    const localScreenShare = this.getLocalTrackPublication(Track.Source.ScreenShare);
    if (localScreenShare && !localScreenShare.isMuted) {
      return {
        track: localScreenShare.videoTrack,
        isLocal: true,
        participantName: this.loggedinProfileRole["name"]
      };
    }

    // Check remote participants
    const remoteTracks = Array.from(this.remoteParticipants().values());
    const remoteScreenShare = remoteTracks.find(
      track => track.trackPublication.source === Track.Source.ScreenShare
    );

    if (remoteScreenShare) {
      return {
        track: remoteScreenShare.trackPublication.videoTrack,
        isLocal: false,
        participantName: remoteScreenShare.participantName
      };
    }

    return null;
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

  // Add this method after toggleCamera()
  async toggleVideoBlur() {
    this.isVideoBlurred = !this.isVideoBlurred;
    
    const cameraPub = this.getLocalTrackPublication(Track.Source.Camera);

    if (!cameraPub || !cameraPub.videoTrack) return;

    const videoTrack = cameraPub.videoTrack;
    
    if (this.isVideoBlurred) {
      // Apply blur using CSS filter through processor
      const blur = BackgroundProcessor({
        mode: "background-blur",
        blurRadius: 10
      });
      videoTrack.setProcessor(blur)
    } else {
      // Remove blur
      await videoTrack.stopProcessor();
    }

    console.log(this.isVideoBlurred)
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

  // /**
  // * Enable microphone with RNNoise noise cancellation
  // */
  // async enableMicrophoneWithNoiseCancellation(room: Room) {
  //   try {
  //     console.log('🎙️ Enabling microphone with RNNoise...');
 
  //     // ✅ Stop the preview audio track before opening the RNNoise stream.
  //     // If the preview audio track is still running when we open a second
  //     // getUserMedia call, both captures are active simultaneously and their
  //     // AEC contexts are independent — causing echo on both sides.
  //     if (this.previewStream) {
  //       this.previewStream.getAudioTracks().forEach(t => t.stop());
  //     }
 
  //     // Open a fresh mic stream. echoCancellation is the browser's native AEC
  //     // — it runs at the OS driver level, before any Web Audio processing.
  //     // This is the correct layer to handle echo. RNNoise then handles
  //     // background noise on top of an already echo-cancelled signal.
  //     const rawStream = await navigator.mediaDevices.getUserMedia({
  //       audio: {
  //         echoCancellation: true,   // ← native AEC at OS level, handles echo
  //         noiseSuppression: false,  // ← RNNoise handles this instead
  //         autoGainControl: false,   // ← disabled; outputGain in service handles level
  //         sampleRate: 48000,
  //         channelCount: 1
  //       }
  //     });
 
  //     const cleanAudioTrack = await this.noiseCancellationService.getCleanAudioTrack(rawStream);
 
  //     await room.localParticipant.publishTrack(cleanAudioTrack, {
  //       source: Track.Source.Microphone,
  //       name: 'microphone'
  //     });
 
  //     console.log('✅ Microphone enabled with RNNoise');
 
  //   } catch (error) {
  //     console.error('❌ RNNoise failed, falling back to WebRTC:', error);
 
  //     // Fallback: stop preview audio track here too before re-opening mic
  //     if (this.previewStream) {
  //       this.previewStream.getAudioTracks().forEach(t => t.stop());
  //     }
 
  //     await room.localParticipant.setMicrophoneEnabled(true, {
  //       echoCancellation: true,
  //       noiseSuppression: true,
  //       autoGainControl: true,
  //       sampleRate: 48000,
  //       channelCount: 1
  //     });
 
  //     console.log('✅ Microphone enabled with WebRTC fallback');
  //   }
  // }

  /**
   * Enable microphone with DeepFilterNet3 noise cancellation.
   *
   * ── Audio pipeline ────────────────────────────────────────────────────────
   *
   *   getUserMedia (raw mic, 48 kHz)
   *       │
   *       ▼
   *   DeepFilter3Service.init()          — loads ONNX model + AudioWorklet
   *       │                                (~7.7 MB, one-time per session)
   *       ▼
   *   DeepFilter3Service.processStream() — wires audio graph:
   *       │   MediaStreamSource
   *       │       → AudioWorkletNode (deepfilternet3-noise-filter)
   *       │           → MediaStreamDestination
   *       ▼
   *   cleanStream (MediaStream)          — background noise removed
   *       │
   *       ▼
   *   room.localParticipant.publishTrack — LiveKit publishes clean audio
   *
   * ── Fallback ─────────────────────────────────────────────────────────────
   *   If DeepFilterNet3 is not supported (non-Chromium browsers without
   *   AudioWorklet) → native WebRTC noiseSuppression:true is used instead.
   *
   * ── Previous filter (Amazon Voice Focus) ─────────────────────────────────
   *   The original Voice Focus implementation is preserved below, commented
   *   out. To revert: comment the DF3 block, uncomment the Voice Focus block.
   * ─────────────────────────────────────────────────────────────────────────
   */
  async enableMicrophoneWithNoiseCancellation(room: Room) {
  try {

    // ── Step 1 — Stop preview track to prevent double capture ────────────
    if (this.previewStream) {
      this.previewStream.getAudioTracks().forEach(t => {
        t.stop();
        console.log('Stopped preview audio track');
      });
    }

    // ── Step 2 — Capture raw mic stream ──────────────────────────────────
    // noiseSuppression: false — DeepFilterNet3 handles this in the worklet.
    // echoCancellation: true  — browser AEC still runs (removes speaker echo
    //   before DF3 sees the signal, which improves DF3 accuracy).
    const rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,  // [DF3] DeepFilterNet3 handles noise
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1
      }
    });

    console.log('🎙️ Raw mic stream obtained:', rawStream.getAudioTracks()[0].getSettings());

    // ── Step 3 — Initialise DeepFilterNet3 ───────────────────────────────
    // Downloads the ONNX model (~7.7 MB) and registers the AudioWorklet
    // processor. Returns false on unsupported browsers (no AudioWorklet).
    console.log('🔄 Initialising DeepFilterNet3 (loading WASM + ONNX model)…');
    const df3Supported = await this.deepFilter3.init(80); // suppressionLevel 0–100

    let cleanAudioTrack: MediaStreamTrack;

    if (df3Supported) {
      // ── Step 4a — Wire the DF3 audio graph and get the clean stream ─────
      //
      //   rawStream (MediaStream)
      //       └─ MediaStreamAudioSourceNode
      //               └─ AudioWorkletNode  ← DeepFilterNet3 ONNX inference
      //                       └─ MediaStreamAudioDestinationNode
      //                               └─ cleanStream (MediaStream)
      //
      const cleanStream = await this.deepFilter3.processStream(rawStream);
      cleanAudioTrack = cleanStream.getAudioTracks()[0];

      console.log(
        `✅ DeepFilterNet3 active — init: ${this.deepFilter3.initTimeMs}ms,`,
        `graph setup: ${this.deepFilter3.processingLatencyMs}ms`
      );

    } else {
      // ── Step 4b — Fallback: raw stream (browser will apply its own AEC) ─
      console.warn('⚠️ DeepFilterNet3 not supported on this browser — using raw stream.');
      cleanAudioTrack = rawStream.getAudioTracks()[0];
    }

    // ── Step 5 — Publish clean audio track to LiveKit room ───────────────
    await room.localParticipant.publishTrack(cleanAudioTrack, {
      source: Track.Source.Microphone,
      name: 'microphone'
    });

    if (this.debugAudioLevels) this.debugAudioLevels();
    console.log('✅ Microphone published with DeepFilterNet3 noise cancellation');

    // ── [DISABLED] Amazon Voice Focus — original implementation ──────────
    // Kept intact for easy revert. To re-enable:
    //   1. Comment the DF3 block above (Steps 3–4b)
    //   2. Uncomment this block
    //
    // console.log('🎙️ Enabling microphone with Amazon Voice Focus...');
    //
    // // Step 2 — Init Voice Focus
    // const supported = await this.audiofilterservice.init();
    //
    // let cleanAudioTrack: MediaStreamTrack;
    //
    // if (supported) {
    //   // Step 3a — Apply Voice Focus
    //   const cleanStream = await this.audiofilterservice.processStream(rawStream);
    //   cleanAudioTrack = cleanStream.getAudioTracks()[0];
    //   console.log('✅ Amazon Voice Focus active');
    // }
    // ─────────────────────────────────────────────────────────────────────

  } catch (error) {
    console.error('❌ DeepFilterNet3 failed, falling back to native WebRTC:', error);

    // Destroy DF3 instance if it was partially initialised
    this.deepFilter3.destroy();

    // Stop preview audio
    if (this.previewStream) {
      this.previewStream.getAudioTracks().forEach(t => t.stop());
    }

    // ── Native browser fallback — always works on all browsers ───────────
    await room.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: true,
      noiseSuppression: true,   // WebRTC built-in suppression as last resort
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1
    });

    if (this.debugAudioLevels) this.debugAudioLevels();
    console.log('✅ Microphone enabled with WebRTC native fallback');
  }
}

// Keep your existing debugAudioLevels as-is
debugAudioLevels() {
  const micPub = this.getLocalTrackPublication(Track.Source.Microphone);
  if (micPub?.audioTrack) {
    const settings = micPub.audioTrack.mediaStreamTrack.getSettings();
    console.log('📊 Audio Track Settings:', {
      sampleRate: settings.sampleRate,
      channelCount: settings.channelCount,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      voiceFocusActive: this.audiofilterservice.isActive()
    });
  }
}

  

  /**
 *remove a participant from the room
 */
async removePanticipant(participantIdentity: string, participantName: string) {
  if (!this.isHost()) {
    alert('Only hosts can remove participants');
    return;
  }

  const confirmed = confirm(`Are you sure you want to remove ${participantName} from the call?`);
  if (!confirmed) return;

  try {
    const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/kickParticipant`;

    const response = await firstValueFrom(
      this.httpClient.post<{ success: boolean; message: string }>(
        url,
        {
          roomName: this.roomDetail.roomId,
          participantIdentity: participantIdentity,
          requesterId: this.loggedinProfileid
        }
      )
    );

    console.log('Participant kicked successfully:', response.message);
    
  } catch (error: any) {
    console.error('Failed to kick participant:', error);
    
    let errorMessage = 'Failed to remove participant. Please try again.';
    if (error.status === 403) {
      errorMessage = 'Only hosts can remove participants';
    } else if (error.status === 404) {
      errorMessage = 'Room not found';
    } else if (error.error?.message) {
      errorMessage = error.error.message;
    }
    
    alert(errorMessage);
  }
}

  /**
   * Mute/unmute a participant's audio
   */
  async toggleParticipantMute(participantIdentity: string, participantName: string, currentlyMuted: boolean) {
    if (!this.isHost()) {
      alert('Only hosts can mute/unmute participants');
      return;
    }

    const action = currentlyMuted ? 'unmute' : 'mute';
    const confirmed = confirm(`Are you sure you want to ${action} ${participantName}?`);
    if (!confirmed) return;

    try {
      
      const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/muteParticipant`;

      const response = await firstValueFrom(
        this.httpClient.post<{ success: boolean; message: string }>(
          url,
          {
            roomName: this.roomDetail.roomId,
            participantIdentity: participantIdentity,
            trackType: 'audio',
            muted: !currentlyMuted,
            requesterId: this.loggedinProfileid
          }
        )
      );

      console.log(`Participant ${action}d:`, response.message);
      
    } catch (error: any) {
      console.error(`Failed to ${action} participant:`, error);
      
      let errorMessage = `Failed to ${action} participant. Please try again.`;
      if (error.status === 403) {
        errorMessage = 'Only hosts can mute/unmute participants';
      } else if (error.status === 404) {
        errorMessage = 'Room not found';
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }
      
      alert(errorMessage);
    }
  }
 
}