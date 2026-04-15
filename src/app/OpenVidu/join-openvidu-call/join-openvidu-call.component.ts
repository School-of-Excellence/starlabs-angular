import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, computed, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, createLocalScreenTracks, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, LocalTrackPublication, VideoPresets } from 'livekit-client';
import { doc, docData, Firestore, setDoc, updateDoc, getDocs, collection, query, where, orderBy, limit, arrayUnion, serverTimestamp, Timestamp } from '@angular/fire/firestore';
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
// import { DeepAudioFilterService } from '../../Service/Deep Audio Filter/deep-audio-filter.service';
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

interface OpenViduCallQualitySnapshot {
  minute: number;       // Which minute of the call this snapshot belongs to, starts at 1.
  timestamp: Timestamp; // Firestore server timestamp recorded when this snapshot was taken.
  video: {
    resolution: string;         // Actual frame size being encoded and sent (e.g. '1280x720'); drops when CPU or bandwidth constrained.
    fps: number;                // Frames per second the encoder is pushing; target is 24, below 15 looks choppy.
    bitrate: number;            // kbps of video data sent this minute; calculated from delta bytesSent × 8.
    qualityLimitReason: string; // Why the encoder reduced quality — 'none' healthy, 'cpu' device bottleneck, 'bandwidth' network bottleneck.
    packetLoss: number;         // % of outbound video packets that never reached the LiveKit server this minute.
    nackCount: number;          // Times receivers asked this participant to resend a lost video packet this minute.
    pliCount: number;           // Times a receiver's video decoder broke and requested a full keyframe reset this minute.
    freezeCount: number;        // Number of times received video froze on this participant's screen this minute.
    freezeDuration: number;     // Total seconds of frozen video seen by this participant this minute.
    mute: boolean;              // Camera Muted/Unmuted
  };
  audio: {
    bitrate: number;    // kbps of audio data sent; Opus target 32–64 kbps, always active since DTX is disabled.
    packetLoss: number; // % of outbound audio packets lost; above 3% causes audible cut-outs, more perceptible than video loss.
    jitter: number;     // ms of variation in incoming audio packet arrival timing; high jitter causes glitches and adds buffer delay.
    mute: boolean;      // Mic Muted/Unmuted
  };
  noiseCancellation: {
    df3Active: boolean;       // True if the DeepFilterNet3 ONNX pipeline is running; false means raw unfiltered audio is being published.
    echoCancellation: boolean; // True if browser AEC is removing speaker output from mic input; should always be true.
    noiseSuppression: boolean; // True if DF3 noise suppression is actively running; source of truth is DeepFilter3Service.isActive().
    agc: boolean;              // Browser AGC state; should always be false since DF3 uses a fixed ×1.5 gain boost instead.
  };
  mic: {
    levelDb: number;                  // Mic input level in dBFS (negative scale); sweet spot −20 to −10, below −30 too quiet, above −5 clips.
    vadState: 'speech' | 'silence';   // DF3 VAD decision at snapshot time; speech triggers suppression level 30, silence triggers 80.
    suppressionLevel: number;         // Active DF3 suppression strength — 30 gentle during speech to preserve consonants, 80 strong during silence.
  };
  network: {
    rtt: number;                 // ms round-trip time to the LiveKit server; one-way lag is roughly rtt ÷ 2, above 200 ms feels laggy.
    availableBandwidth: number;  // kbps WebRTC congestion control estimates as available outgoing bandwidth; drives simulcast layer selection.
    iceType: string;             // How the connection is routed — 'host' direct (best), 'srflx' through NAT (normal), 'relay' TURN (worst).
    connectionQuality: string;   // LiveKit's own quality score computed from RTT and loss — 'Excellent', 'Good', or 'Poor'.
  };
  inbound: {
    resolution: string; // Resolution this participant is receiving and seeing of others' video streams.
    fps: number;        // Frames per second being received from others; low value means others' video looks choppy on this screen.
    packetLoss: number; // % of incoming video packets lost in transit from the LiveKit server to this participant.
    freezeCount: number; // Number of freeze events on received video streams this minute.
    freezeDuration: number; // Total seconds others' video was frozen on this participant's screen this minute.
    jitter: number;         // ms of variation in incoming video packet timing; high value forces the jitter buffer to grow, adding delay.
  };
}

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

  blurLevel: 'none' | 'mid' | 'high' = 'none';
  localParticipantIdentity = '';

  private previewStream: MediaStream | null = null;

  // ── Call Quality Tracking ─────────────────────────────────────────────────
  private qualitySnapshots: OpenViduCallQualitySnapshot[] = [];
  private qualityMinuteTimer: ReturnType<typeof setInterval> | null = null;
  private qualityBatchTimer: ReturnType<typeof setInterval> | null = null;
  private qualityMinuteCount = 0;
  private qualityDocumentId: string | null = null;
  private qualityPrevStats: {
    bytesSentVideo: number;
    bytesSentAudio: number;
    packetsSentVideo: number;
    packetsLostVideo: number;
    packetsSentAudio: number;
    packetsLostAudio: number;
    packetsReceivedInbound: number;
    packetsLostInbound: number;
    freezeCount: number;
    freezeDuration: number;
    nackCount: number;
    pliCount: number;
    timestamp: number;
  } | null = null;

  constructor(
    public firestore: Firestore,
    public route: ActivatedRoute,
    public httpClient: HttpClient,
    public guard: AuthguardService,
    public dialog: MatDialog,
    private infraService: InstanceStatusService,
    // private audiofilterservice : DeepAudioFilterService, // kept — not removed, used in debugAudioLevels()
    private deepFilter3: DeepFilter3Service              // [DF3] active noise cancellation filter
  ){}

  ngAfterViewInit(): void {
    // Pre-warm DF3 — downloads ONNX model (~7.7 MB) in background so it is ready
    // before the user clicks Join. By the time enableMicrophoneWithNoiseCancellation()
    // runs, init() will already be done and audio starts with zero delay.
    this.deepFilter3.init(80).then(ok => {
      if (!ok) console.warn('⚠️ DF3 pre-warm failed — will retry when joining call');
    });

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
    return this.roomDetail.hosts?.includes(this.loggedinProfileid) || this.loggedinProfileRole["developer"] || this.loggedinProfileRole["tester"];
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
    const room = new Room({
      // adaptiveStream — automatically reduces video quality for receivers
      // who are CPU or bandwidth constrained. Prevents their side from freezing.
      adaptiveStream: true,

      // dynacast — pauses video layers that no subscriber is actively watching.
      // Saves encoder CPU when other participants minimise or stop viewing your video.
      dynacast: true,

      // publishDefaults — simulcast publishes 3 quality layers (180p, 360p, 720p).
      // If the 720p layer stutters under CPU load, viewers automatically receive
      // 360p or 180p. The call never fully freezes — always a layer available.
      publishDefaults: {
        videoCodec: 'h264',
        simulcast: true,
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
        videoEncoding: {
          maxBitrate: 1_200_000,   // 1.2 Mbps for 720p main layer
          maxFramerate: 24,
        },
      },
    });
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

    // Clean up state maps when a participant disconnects — prevents memory leak
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.remoteParticipantsQuality.update(map => { map.delete(participant.identity); return map; });
      this.remoteParticipantsMute.update(map => { map.delete(participant.identity); return map; });
      console.log('Participant disconnected, state cleaned:', participant.identity);
    });

    // Handle unexpected server disconnection (network drop, server kick)
    room.on(RoomEvent.Disconnected, () => {
      console.log('Room disconnected unexpectedly');
      this.leaveRoom(false);
    });

    try {
      // Request a new token
      const response = await this.getTokenWithRetry();
      console.log('Token received:', response);


      // ── Pre-call: start DF3 BEFORE connecting so VAD calibrates during room handshake ──
      // getUserMedia + processStream happen here. By the time room.connect() finishes
      // (~1-3 s), the VAD has already measured the noise floor and the AudioContext is
      // fully running. The cleanAudioTrack is ready to publish the moment we're in the room.
      const cleanAudioTrack = await this.prepareNoiseCancelledTrack();

      // Connect to the LiveKit room
      // await ensures we wait until initial signaling is done
      await room.connect(response.url, response.token);
      this.meetingRoomStatus = "connected"
      this.localParticipantIdentity = room.localParticipant.identity;
      console.log('Room connected:', this.loggedinProfileid);

      // ── Quality tracking ──────────────────────────────────────────────────
      try {
        await this.initQualityTracking();
        this.startQualityTimers();
      } catch (qualityTrackError) {
        console.log(qualityTrackError)
      }
      // ─────────────────────────────────────────────────────────────────────

      // Enable camera — capped at 720p 24fps.
      // Reduces video encoder CPU by ~65% vs browser default (1080p 30fps),
      // giving DF3 WASM inference the headroom it needs without starving the encoder.
      await room.localParticipant.setCameraEnabled(true, {
        resolution: { width: 1280, height: 720, frameRate: 24 }
      });

      const videoTrack = room.localParticipant.videoTracks.values().next().value?.track;
      this.localParticipant.set(videoTrack);

      // Apply default blur (Mid 60%) as soon as camera is ready
      await this.applyBlur('mid');

      await this.enableMicrophoneWithNoiseCancellation(room, cleanAudioTrack);

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

    // Guard: if already left/leaving, do nothing to prevent re-entrant calls
    // (RoomEvent.Disconnected also calls leaveRoom — without this guard it loops)
    if (this.meetingRoomStatus === 'left' || this.meetingRoomStatus === 'ended') return;
    this.meetingRoomStatus = 'left'; // set immediately so re-entrant Disconnected event is ignored

    await this.stopQualityTracking('left');

    const currentRoom = this.room();
    // Remove all listeners BEFORE disconnect so RoomEvent.Disconnected doesn't re-trigger leaveRoom
    currentRoom?.removeAllListeners();
    await currentRoom?.disconnect();

    // Tear down DF3 — stops AudioWorklet, closes AudioContext, frees WASM memory
    this.deepFilter3.destroy();

    // Reset all variables
    this.room.set(undefined);
    this.localParticipant.set(undefined);
    this.remoteParticipants.set(new Map());
    this.remoteParticipantsQuality.set(new Map());
    this.remoteParticipantsMute.set(new Map());
    this.activeSpeakers = [];
    this.localParticipantIdentity = '';
    this.blurLevel = 'none';
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
      await this.stopQualityTracking('ended');
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

  /** Apply background blur at a given level, or remove it. */
  async applyBlur(level: 'none' | 'mid' | 'high') {
    const cameraPub = this.getLocalTrackPublication(Track.Source.Camera);
    if (!cameraPub || !cameraPub.videoTrack) return;

    const videoTrack = cameraPub.videoTrack;

    if (level === 'none') {
      await videoTrack.stopProcessor();
    } else {
      const blurRadius = level === 'mid' ? 6 : 15;
      const blur = BackgroundProcessor({ mode: 'background-blur', blurRadius });
      videoTrack.setProcessor(blur);
    }

    this.blurLevel = level;
    console.log('Blur level set to:', level);
  }

  /** Returns mobile-style signal bar info for a remote participant. */
  getNetworkBars(identity: string): { bars: number; color: string } {
    const quality = this.remoteParticipantsQuality().get(identity);
    switch (quality) {
      case ConnectionQuality.Excellent: return { bars: 4, color: '#4caf50' };
      case ConnectionQuality.Good:      return { bars: 3, color: '#ffb300' };
      case ConnectionQuality.Poor:      return { bars: 1, color: '#e53935' };
      default:                          return { bars: 0, color: '#888' };
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
  /**
   * Prepares the noise-cancelled audio track BEFORE joining the room.
   * Called pre-connect so the VAD has time to calibrate during the room handshake.
   */
  async prepareNoiseCancelledTrack(): Promise<MediaStreamTrack> {
    // Stop any existing preview track
    if (this.previewStream) {
      this.previewStream.getAudioTracks().forEach(t => {
        t.stop();
        console.log('Stopped preview audio track');
      });
    }

    // Capture raw mic — autoGainControl OFF to avoid fighting DF3's gainBoost node.
    // echoCancellation ON — browser AEC removes speaker echo before DF3 sees the signal.
    const rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,   // DF3 handles noise
        autoGainControl: false,    // OFF — prevents browser AGC fighting our gainBoost
        sampleRate: 48000,
        channelCount: 1
      }
    });

    console.log('🎙️ Raw mic stream obtained:', rawStream.getAudioTracks()[0].getSettings());

    // Init DF3 — skip if already pre-warmed in ngAfterViewInit
    let df3Supported: boolean;
    if (this.deepFilter3.isInitialized()) {
      console.log('✅ DeepFilterNet3 already pre-warmed — skipping init');
      df3Supported = true;
    } else {
      console.log('🔄 DeepFilterNet3 not yet ready — initialising now…');
      df3Supported = await this.deepFilter3.init(80);
    }

    if (df3Supported) {
      const cleanStream = await this.deepFilter3.processStream(rawStream);
      console.log(
        `✅ DeepFilterNet3 active — init: ${this.deepFilter3.initTimeMs}ms,`,
        `graph: ${this.deepFilter3.processingLatencyMs}ms (VAD calibrating pre-connect…)`
      );
      return cleanStream.getAudioTracks()[0];
    }

    // Fallback — browser handles noise suppression
    console.warn('⚠️ DeepFilterNet3 not supported — using raw stream.');
    return rawStream.getAudioTracks()[0];
  }

  async enableMicrophoneWithNoiseCancellation(room: Room, cleanAudioTrack: MediaStreamTrack) {
    try {

      // ── Publish the pre-built clean track to LiveKit ─────────────────────
      // dtx: false — disables Opus Discontinuous Transmission. Without this,
      // when VAD sets suppression level high (silence), signal energy drops
      // near zero and Opus stops sending packets → remote participants hear
      // silence/breaks. With dtx: false packets flow continuously.
      await room.localParticipant.publishTrack(cleanAudioTrack, {
        source: Track.Source.Microphone,
        name: 'microphone',
        dtx: false
      });

      if (this.debugAudioLevels) this.debugAudioLevels();
      console.log('✅ Microphone published with DeepFilterNet3 noise cancellation (dtx: false)');

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
        // voiceFocusActive: this.audiofilterservice.isActive()
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
      alert('Only hosts can mute participants');
      return;
    }

    const action = 'mute';
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

  // ── Call Quality Tracking ─────────────────────────────────────────────────

  private getPublisherPC(): RTCPeerConnection | null {
    const room = this.room();
    if (!room) return null;
    // @ts-ignore — engine is not in the public typings but is stable
    return room.engine?.pcManager?.publisher?.pc ?? null;
  }

  private getSubscriberPC(): RTCPeerConnection | null {
    const room = this.room();
    if (!room) return null;
    // @ts-ignore
    return room.engine?.pcManager?.subscriber?.pc ?? null;
  }

  private async initQualityTracking(): Promise<void> {
    const profileId = this.loggedinProfileid;
    const roomId = this.roomDetail.roomId;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const baseDocId = `${profileId}_${roomId}_${today}`;

    const colRef = collection(this.firestore, 'openviduCallQuality');
    const q = query(colRef, where('profileId', '==', profileId), where('roomId', '==', roomId), orderBy('createdAt', 'desc'), limit(1));

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      const data = existingDoc.data();
      const sizeBytes = new TextEncoder().encode(JSON.stringify(data)).length;
      const sizePercent = (sizeBytes / 1_048_576) * 100;

      if (sizePercent < 85) {
        this.qualityDocumentId = existingDoc.id;
        console.log(`✅ Quality doc reused: ${existingDoc.id} (${sizePercent.toFixed(1)}% full)`);
        return;
      }

      console.warn(`⚠️ Quality doc at ${sizePercent.toFixed(1)}% — creating new document`);
    }

    this.qualityDocumentId = `${baseDocId}_${Date.now()}`;
    await setDoc(doc(this.firestore, 'openviduCallQuality', this.qualityDocumentId), {
      profileId,
      roomId,
      createdAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
      exitReason: null,
      snapshots: []
    });

    console.log(`✅ Quality doc created: ${this.qualityDocumentId}`);
  }

  private async buildSnapshot(): Promise<OpenViduCallQualitySnapshot | null> {
    const pubPC = this.getPublisherPC();
    const subPC = this.getSubscriberPC();
    if (!pubPC || !subPC) return null;

    const now = Date.now();

    // ── Publisher stats ──────────────────────────────────────────────────────
    const pubStats = await pubPC.getStats();

    let videoOut = { resolution: 'unknown', fps: 0, bytesSent: 0, qualityLimitReason: 'none', packetsSent: 0, packetsLost: 0, nackCount: 0, pliCount: 0 };
    let audioOut = { bytesSent: 0, packetsSent: 0, packetsLost: 0 };
    let network  = { rtt: 0, availableBandwidth: 0, iceType: 'unknown' };

    pubStats.forEach((stat: any) => {
      if (stat.type === 'outbound-rtp' && stat.kind === 'video' && stat.rid === 'f') {
        videoOut = {
          resolution: `${stat.frameWidth ?? 0}x${stat.frameHeight ?? 0}`,
          fps: Math.round(stat.framesPerSecond ?? 0),
          bytesSent: stat.bytesSent ?? 0,
          qualityLimitReason: stat.qualityLimitationReason ?? 'none',
          packetsSent: stat.packetsSent ?? 0,
          packetsLost: stat.packetsLost ?? 0,
          nackCount: stat.nackCount ?? 0,
          pliCount: stat.pliCount ?? 0
        };
      }
      if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
        audioOut = {
          bytesSent: stat.bytesSent ?? 0,
          packetsSent: stat.packetsSent ?? 0,
          packetsLost: stat.packetsLost ?? 0
        };
      }
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
        network.rtt = parseFloat(((stat.currentRoundTripTime ?? 0) * 1000).toFixed(1));
        network.availableBandwidth = Math.round((stat.availableOutgoingBitrate ?? 0) / 1000);
      }
      if (stat.type === 'local-candidate') {
        network.iceType = stat.candidateType ?? 'unknown';
      }
    });

    // ── Subscriber stats ─────────────────────────────────────────────────────
    const subStats = await subPC.getStats();

    let videoIn = { resolution: 'unknown', fps: 0, packetsReceived: 0, packetsLost: 0, freezeCount: 0, freezeDuration: 0, jitter: 0 };
    let audioIn = { jitter: 0 };

    subStats.forEach((stat: any) => {
      if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
        videoIn = {
          resolution: `${stat.frameWidth ?? 0}x${stat.frameHeight ?? 0}`,
          fps: Math.round(stat.framesPerSecond ?? 0),
          packetsReceived: stat.packetsReceived ?? 0,
          packetsLost: stat.packetsLost ?? 0,
          freezeCount: stat.freezeCount ?? 0,
          freezeDuration: parseFloat((stat.totalFreezesDuration ?? 0).toFixed(2)),
          jitter: parseFloat(((stat.jitter ?? 0) * 1000).toFixed(1))
        };
      }
      if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
        audioIn.jitter = parseFloat(((stat.jitter ?? 0) * 1000).toFixed(1));
      }
    });

    // ── Delta calculations ───────────────────────────────────────────────────
    const prev = this.qualityPrevStats;
    const elapsed = prev ? (now - prev.timestamp) / 1000 : 60;

    const videoBitrate = prev ? Math.round(((videoOut.bytesSent - prev.bytesSentVideo) * 8) / elapsed / 1000) : 0;
    const audioBitrate = prev ? Math.round(((audioOut.bytesSent - prev.bytesSentAudio) * 8) / elapsed / 1000) : 0;

    const videoLossDelta = prev ? (videoOut.packetsLost - prev.packetsLostVideo) : 0;
    const videoSentDelta = prev ? (videoOut.packetsSent - prev.packetsSentVideo) : 1;
    const videoPacketLossPct = parseFloat(((videoLossDelta / (videoLossDelta + videoSentDelta)) * 100).toFixed(2));

    const audioLossDelta = prev ? (audioOut.packetsLost - prev.packetsLostAudio) : 0;
    const audioSentDelta = prev ? (audioOut.packetsSent - prev.packetsSentAudio) : 1;
    const audioPacketLossPct = parseFloat(((audioLossDelta / (audioLossDelta + audioSentDelta)) * 100).toFixed(2));

    const inboundLossDelta     = prev ? (videoIn.packetsLost - prev.packetsLostInbound) : 0;
    const inboundReceivedDelta = prev ? (videoIn.packetsReceived - prev.packetsReceivedInbound) : 1;
    const inboundLossPct = parseFloat(((inboundLossDelta / (inboundLossDelta + inboundReceivedDelta)) * 100).toFixed(2));

    const freezeCountDelta    = prev ? Math.max(0, videoIn.freezeCount - prev.freezeCount) : 0;
    const freezeDurationDelta = prev ? parseFloat(Math.max(0, videoIn.freezeDuration - prev.freezeDuration).toFixed(2)) : 0;
    const nackCountDelta      = prev ? Math.max(0, videoOut.nackCount - prev.nackCount) : 0;
    const pliCountDelta       = prev ? Math.max(0, videoOut.pliCount - prev.pliCount) : 0;

    // ── Store prev ───────────────────────────────────────────────────────────
    this.qualityPrevStats = {
      bytesSentVideo: videoOut.bytesSent,
      bytesSentAudio: audioOut.bytesSent,
      packetsSentVideo: videoOut.packetsSent,
      packetsLostVideo: videoOut.packetsLost,
      packetsSentAudio: audioOut.packetsSent,
      packetsLostAudio: audioOut.packetsLost,
      packetsReceivedInbound: videoIn.packetsReceived,
      packetsLostInbound: videoIn.packetsLost,
      freezeCount: videoIn.freezeCount,
      freezeDuration: videoIn.freezeDuration,
      nackCount: videoOut.nackCount,
      pliCount: videoOut.pliCount,
      timestamp: now
    };

    // ── Mic track settings ───────────────────────────────────────────────────
    const micPub = this.getLocalTrackPublication(Track.Source.Microphone);
    const trackSettings = micPub?.audioTrack?.mediaStreamTrack?.getSettings() ?? {};

    // ── Connection quality ───────────────────────────────────────────────────
    const localQuality = this.remoteParticipantsQuality().get(this.localParticipantIdentity) ?? 'Unknown';

    this.qualityMinuteCount++;

    return {
      minute: this.qualityMinuteCount,
      timestamp: Timestamp.now(),

      video: {
        resolution: videoOut.resolution,
        fps: videoOut.fps,
        bitrate: videoBitrate,
        qualityLimitReason: videoOut.qualityLimitReason,
        packetLoss: Math.max(0, videoPacketLossPct),
        nackCount: nackCountDelta,
        pliCount: pliCountDelta,
        freezeCount: freezeCountDelta,
        freezeDuration: freezeDurationDelta,
        mute: this.isVideoHidden()
      },

      audio: {
        bitrate: audioBitrate,
        packetLoss: Math.max(0, audioPacketLossPct),
        jitter: audioIn.jitter,
        mute: this.isAudioMuted()
      },

      noiseCancellation: {
        df3Active: this.deepFilter3.isActive(),
        echoCancellation: (trackSettings as any)['echoCancellation'] ?? true,
        noiseSuppression: this.deepFilter3.isActive(),
        agc: (trackSettings as any)['autoGainControl'] ?? false
      },

      mic: {
        levelDb: this.deepFilter3.getMicLevelDb(),
        vadState: this.deepFilter3.getVadState(),
        suppressionLevel: this.deepFilter3.getCurrentSuppressionLevel()
      },

      network: {
        rtt: network.rtt,
        availableBandwidth: network.availableBandwidth,
        iceType: network.iceType,
        connectionQuality: String(localQuality)
      },

      inbound: {
        resolution: videoIn.resolution,
        fps: videoIn.fps,
        packetLoss: Math.max(0, inboundLossPct),
        freezeCount: freezeCountDelta,
        freezeDuration: freezeDurationDelta,
        jitter: videoIn.jitter
      }
    };
  }

  private startQualityTimers(): void {
    this.qualityMinuteTimer = setInterval(async () => {
      const snapshot = await this.buildSnapshot();
      if (snapshot) {
        this.qualitySnapshots.push(snapshot);
        console.log(`📊 Quality snapshot ${snapshot.minute} collected`);
      }
    }, 10_000);

    this.qualityBatchTimer = setInterval(async () => {
      await this.flushQualityBatch('batch');
    }, 300_000);

    window.addEventListener('pagehide', this.handleQualityBeacon);
  }

  private async flushQualityBatch(reason: string): Promise<void> {
    if (!this.qualityDocumentId || this.qualitySnapshots.length === 0) return;

    const toFlush = [...this.qualitySnapshots];
    this.qualitySnapshots = [];

    try {
      const ref = doc(this.firestore, 'openviduCallQuality', this.qualityDocumentId);
      await updateDoc(ref, {
        snapshots: arrayUnion(...toFlush),
        lastUpdatedAt: serverTimestamp()
      });
      console.log(`✅ Quality batch flushed (${reason}): ${toFlush.length} snapshots`);
    } catch (err) {
      this.qualitySnapshots = [...toFlush, ...this.qualitySnapshots];
      console.error('❌ Quality batch flush failed:', err);
    }
  }

  private async stopQualityTracking(exitReason: 'left' | 'ended'): Promise<void> {
    if (this.qualityMinuteTimer) { clearInterval(this.qualityMinuteTimer); this.qualityMinuteTimer = null; }
    if (this.qualityBatchTimer)  { clearInterval(this.qualityBatchTimer);  this.qualityBatchTimer = null; }

    window.removeEventListener('pagehide', this.handleQualityBeacon);

    await this.flushQualityBatch('exit');

    if (this.qualityDocumentId) {
      await updateDoc(doc(this.firestore, 'openviduCallQuality', this.qualityDocumentId), {
        exitReason,
        lastUpdatedAt: serverTimestamp()
      });
    }

    this.qualitySnapshots = [];
    this.qualityMinuteCount = 0;
    this.qualityDocumentId = null;
    this.qualityPrevStats = null;
  }

  private handleQualityBeacon = (): void => {
    if (!this.qualityDocumentId || this.qualitySnapshots.length === 0) return;

    const payload = JSON.stringify({
      documentId: this.qualityDocumentId,
      snapshots: this.qualitySnapshots,
      exitReason: 'tab_closed'
    });

    navigator.sendBeacon(
      `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/flushOpenviduCallQuality`,
      new Blob([payload], { type: 'application/json' })
    );
  };

}