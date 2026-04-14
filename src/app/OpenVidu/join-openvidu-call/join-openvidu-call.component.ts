import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, computed, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, createLocalScreenTracks, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, LocalTrackPublication, VideoPresets } from 'livekit-client';
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
// import { DeepAudioFilterService } from '../../Service/Deep Audio Filter/deep-audio-filter.service';
// ── [DF3] DeepFilterNet3 noise cancellation service (ONNX · AudioWorklet · no API key needed)
// Replaces Amazon Voice Focus as the active filter. VoiceFocus import + service kept intact below
// so it can be re-enabled by swapping the method body back.
import { DeepFilter3Service } from '../../Service/DeepFilter3/deepfilter3.service';
import { AdaptiveQualityService } from '../../Service/AdaptiveQuality/adaptive-quality.service';

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

  blurLevel: 'none' | 'mid' | 'high' = 'none';
  localParticipantIdentity = '';

  private previewStream: MediaStream | null = null;
  private canvasPipelineCleanup: (() => void) | null = null;

  constructor(
    public firestore: Firestore,
    public route: ActivatedRoute,
    public httpClient: HttpClient,
    public guard: AuthguardService,
    public dialog: MatDialog,
    private infraService: InstanceStatusService,
    // private audiofilterservice : DeepAudioFilterService, // kept — not removed, used in debugAudioLevels()
    private deepFilter3: DeepFilter3Service,              // [DF3] active noise cancellation filter
    private adaptiveQuality: AdaptiveQualityService
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
    this.adaptiveQuality.stopMonitoring();
    this.canvasPipelineCleanup?.();
    this.canvasPipelineCleanup = null;
    this.leaveRoom(false)
    this.roomDetail = null
    this.roomSubscription?.next()
    this.roomSubscription?.complete()
  }

  

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

    // Detect device capabilities and pick the best starting quality tier
    const initialTier = this.adaptiveQuality.detectInitialQuality();

    // Create a new Room instance with adaptive quality config
    const room = new Room(this.adaptiveQuality.getRoomConfig(initialTier));
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

      // Enable camera at the adaptive tier's resolution
      const cameraConstraints = this.adaptiveQuality.getCameraConstraints(initialTier);
      await room.localParticipant.setCameraEnabled(true, cameraConstraints);

      const videoTrack = room.localParticipant.videoTracks.values().next().value?.track;
      this.localParticipant.set(videoTrack);

      // ── Raw track constraint enforcement ─────────────────────────────────
      const tierCfg = cameraConstraints.resolution;
      const rawMediaTrack = videoTrack?.mediaStreamTrack;
      if (rawMediaTrack) {
        try {
          await rawMediaTrack.applyConstraints({
            width:     { ideal: tierCfg.width, max: tierCfg.width },
            height:    { ideal: tierCfg.height, max: tierCfg.height },
            frameRate: { ideal: tierCfg.frameRate, max: tierCfg.frameRate },
          });
          const settings = rawMediaTrack.getSettings();
          console.log(`Camera constrained: ${settings.width}x${settings.height}@${settings.frameRate}fps`);
        } catch (constraintErr) {
          console.warn('applyConstraints() failed (non-critical):', constraintErr);
        }
      }

      // Apply blur based on tier — skip on low-end devices to save CPU
      if (initialTier === 'low' || initialTier === 'minimal') {
        console.log('⚡ Skipping blur (low-end device)');
      } else {
        // 'mid' blur for both medium and high/ultra tiers (blurRadius 6)
        await this.applyBlur('mid');
      }

      // Start adaptive quality monitoring
      this.adaptiveQuality.startMonitoring(room);

      // ── OffscreenCanvas pipeline (optional) ────────────────────────────────
      // Enforces exact 20fps draw rate independent of camera hardware.
      // Disabled by default — uncomment to activate. Note: if BackgroundProcessor
      // (blur) is active, it already controls frame processing. Enable this only
      // if you need frame-rate clamping WITHOUT blur, or for future per-frame
      // processing (watermarks, overlays).
      // this.canvasPipelineCleanup = this.startCanvasProcessingPipeline(room, 20);

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
   * OffscreenCanvas video pre-processing pipeline.
   *
   * Decouples the camera capture rate from the encode rate by drawing frames
   * onto an OffscreenCanvas at exactly `targetFps`. This gives precise frame-rate
   * control even when the camera hardware returns a higher native rate.
   *
   * The processed canvas stream replaces the raw camera track on the local
   * participant — the original audio track is merged back into the new stream.
   *
   * ── Why OffscreenCanvas instead of regular Canvas? ────────────────────────
   * OffscreenCanvas.getContext('2d') doesn't trigger main-thread reflow/repaint,
   * reducing jank when DF3 WASM is also running on the main thread.
   *
   * ── Browser support ───────────────────────────────────────────────────────
   * Chrome 69+, Edge 79+, Firefox 105+.  Safari 16.4+ supports OffscreenCanvas
   * but NOT captureStream() on it — falls back to regular <canvas> for Safari.
   *
   * @returns cleanup function to stop the pipeline
   */
  private startCanvasProcessingPipeline(
    room: Room,
    targetFps: number = 20,
  ): (() => void) | null {
    const cameraPub = Array.from(room.localParticipant.videoTracks.values())
      .find(pub => pub.source === Track.Source.Camera);
    if (!cameraPub?.track) {
      console.warn('Canvas pipeline: no camera track to process');
      return null;
    }

    const srcTrack = cameraPub.track.mediaStreamTrack;
    const settings = srcTrack.getSettings();
    const w = settings.width  || 640;
    const h = settings.height || 480;

    // Safari doesn't support captureStream() on OffscreenCanvas — use regular canvas
    const usesOffscreen = typeof OffscreenCanvas !== 'undefined';
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

    if (usesOffscreen) {
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext('2d');
    }

    if (!ctx) {
      console.warn('Canvas pipeline: could not get 2d context');
      return null;
    }

    // Create a hidden <video> element to feed frames from the raw camera track
    const video = document.createElement('video');
    video.srcObject = new MediaStream([srcTrack]);
    video.muted = true;
    video.playsInline = true;
    video.play();

    const intervalMs = 1000 / targetFps;
    let stopped = false;

    const drawLoop = setInterval(() => {
      if (stopped || video.readyState < 2) return;
      (ctx as CanvasRenderingContext2D).drawImage(video, 0, 0, w, h);
    }, intervalMs);

    // Get the output stream from the canvas
    let processedStream: MediaStream;
    if (canvas instanceof HTMLCanvasElement) {
      processedStream = canvas.captureStream(targetFps);
    } else {
      // OffscreenCanvas doesn't have captureStream — transfer to regular canvas
      // This path is a progressive enhancement; we fall back safely
      console.log('Canvas pipeline: using OffscreenCanvas draw loop (no captureStream)');
      const fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = w;
      fallbackCanvas.height = h;
      const fallbackCtx = fallbackCanvas.getContext('2d')!;

      // Override the draw loop to also copy to fallback canvas
      clearInterval(drawLoop);
      const dualDrawLoop = setInterval(() => {
        if (stopped || video.readyState < 2) return;
        (ctx as OffscreenCanvasRenderingContext2D).drawImage(video, 0, 0, w, h);
        fallbackCtx.drawImage(video, 0, 0, w, h);
      }, intervalMs);

      processedStream = fallbackCanvas.captureStream(targetFps);

      // Replace cleanup for the dual loop
      const cleanup = () => {
        stopped = true;
        clearInterval(dualDrawLoop);
        video.srcObject = null;
      };

      // Publish the processed video track, keeping original audio
      const processedVideoTrack = processedStream.getVideoTracks()[0];
      room.localParticipant.publishTrack(processedVideoTrack, {
        source: Track.Source.Camera,
        name: 'canvas-camera',
      }).then(() => {
        console.log(`Canvas pipeline (OffscreenCanvas fallback): ${w}x${h}@${targetFps}fps`);
      }).catch(err => {
        console.warn('Canvas pipeline: failed to publish processed track:', err);
      });

      return cleanup;
    }

    // Publish the canvas-processed video track
    const processedVideoTrack = processedStream.getVideoTracks()[0];
    room.localParticipant.publishTrack(processedVideoTrack, {
      source: Track.Source.Camera,
      name: 'canvas-camera',
    }).then(() => {
      console.log(`Canvas pipeline active: ${w}x${h}@${targetFps}fps`);
    }).catch(err => {
      console.warn('Canvas pipeline: failed to publish processed track:', err);
    });

    return () => {
      stopped = true;
      clearInterval(drawLoop);
      video.srcObject = null;
    };
  }

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
 
}