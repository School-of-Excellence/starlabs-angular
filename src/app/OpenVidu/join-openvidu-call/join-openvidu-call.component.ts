import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, computed, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, createLocalScreenTracks, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, LocalTrackPublication, VideoPresets, VideoQuality } from 'livekit-client';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
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
import { VideoLayoutService, LayoutMode } from '../../Service/VideoLayout/video-layout.service';

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
    MatDividerModule,
    CdkDrag
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

  // ── Layout: screen share tracking ──────────────────────────────────────
  screenShareTrack = signal<RemoteTrack | null>(null);
  screenShareParticipantId = signal<string | null>(null);
  localVideoStream = signal<MediaStream | null>(null);

  // Layout mode computed from participant count and screen share state
  layoutMode = computed<LayoutMode>(() => {
    const remoteVideoCount = this.getRemoteVideoCount();
    const hasScreenShare = this.screenShareTrack() !== null || this.isScreenSharing();
    return this.videoLayout.getLayoutMode(remoteVideoCount, hasScreenShare);
  });

  spotlightMain = computed(() => {
    const remotes = this.returnRemoteVideoTracks();

    if (this.screenShareTrack()) {
      const sharerId = this.screenShareParticipantId();
      const sharer = remotes.find(r => r.participantIdentity === sharerId);
      return {
        type: 'screen' as const,
        mediaStream: this.screenShareTrack()?.mediaStream || null,
        participantId: sharerId,
        participantName: sharer?.participantName || 'Screen'
      };
    }

    const remote = remotes[0];
    if (remote) {
      return {
        type: 'remote' as const,
        mediaStream: remote.trackPublication.videoTrack?.mediaStream || null,
        participantId: remote.participantIdentity,
        participantName: remote.participantName
      };
    }

    return null;
  });

  spotlightPip = computed(() => {
    return {
      type: 'local' as const,
      mediaStream: this.localVideoStream(),
      participantId: 'local',
      participantName: 'You'
    };
  });

  // Filmstrip scroll state
  @ViewChild('filmstripContainer') filmstripContainer!: ElementRef<HTMLDivElement>;
  canScrollLeft = false;
  canScrollRight = false;
  showFilmstripScrollButtons = false;

  constructor(
    public firestore: Firestore,
    public route: ActivatedRoute,
    public httpClient: HttpClient,
    public guard: AuthguardService,
    public dialog: MatDialog,
    private infraService: InstanceStatusService,
    // private audiofilterservice : DeepAudioFilterService, // kept — not removed, used in debugAudioLevels()
    private deepFilter3: DeepFilter3Service,              // [DF3] active noise cancellation filter
    private adaptiveQuality: AdaptiveQualityService,
    public videoLayout: VideoLayoutService
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
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }
    this.qualityChangeDebounce.forEach(timeout => clearTimeout(timeout));
    this.qualityChangeDebounce.clear();
    this.lastQualityChange.clear();

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
        if (track.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
          publication.setVideoQuality(VideoQuality.HIGH);
          publication.setVideoDimensions({ width: 1920, height: 1080 });

          console.log(`📺 Requested HIGH quality for: ${participant.identity}`, {
            simulcasted: publication.simulcasted,
            currentQuality: publication.videoQuality,
          });

          setTimeout(() => {
            console.log(`📊 Quality verify for ${participant.identity}:`, {
              quality: ['LOW', 'MEDIUM', 'HIGH'][publication.videoQuality as any] ?? publication.videoQuality,
              dimensions: publication.dimensions,
            });
          }, 2000);
        }

        this.remoteParticipants.update((prev) => {
          const next = new Map(prev);
          next.set(publication.trackSid, {
            trackPublication: publication,
            participantIdentity: participant.identity,
            participantName: participant.name ?? participant.identity
          });
          return next;
        });

        const mode = this.layoutMode();
        console.log('Tracked', this.remoteParticipants());
        console.log(`Layout after track subscribed: ${mode} (${this.remoteParticipants().size} remotes)`);

        // Screen share detection
        if (publication.source === Track.Source.ScreenShare && track.kind === Track.Kind.Video) {
          console.log('Screen share started:', participant.identity);
          this.screenShareTrack.set(track);
          this.screenShareParticipantId.set(participant.identity);
          this.videoLayout.setScreenShareActive(participant.identity, true);
        }

        // Check filmstrip scroll after new participant
        setTimeout(() => this.checkFilmstripScroll(), 100);
      }
    );

    // Handle remote track removal
    room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        this.remoteParticipants.update((prev) => {
          const next = new Map(prev);
          next.delete(publication.trackSid);
          return next;
        });

        console.log('UnTracked', this.remoteParticipants());

        // Screen share ended
        if (publication.source === Track.Source.ScreenShare && track.kind === Track.Kind.Video) {
          console.log('Screen share ended:', participant.identity);
          this.screenShareTrack.set(null);
          this.screenShareParticipantId.set(null);
          this.videoLayout.setScreenShareActive(participant.identity, false);
        }

        // Check filmstrip scroll after participant left
        setTimeout(() => this.checkFilmstripScroll(), 100);
      }
    );

    // Handle Quality Change
    room.on(
      RoomEvent.ConnectionQualityChanged,
      (quality: ConnectionQuality, participant: Participant) => {
        console.log("Network quality changed:", participant.identity, ConnectionQuality[quality]);
        this.remoteParticipantsQuality.update((prev) => {
          const next = new Map(prev);
          next.set(participant.identity, quality);
          return next;
        });

        this.handleConnectionQualityChange(quality, participant, room);
    });

    // Track Muted Participants
    room.on(RoomEvent.TrackMuted, (publication: RemoteTrackPublication, participant: Participant) => {
      if (publication.kind === Track.Kind.Audio) {
        this.remoteParticipantsMute.update((prev) => {
          const next = new Map(prev);
          next.set(participant.identity, true);
          return next;
        });
        console.log('Audio muted:', participant.identity);
      }
    });
    // Track unMuted Participants
    room.on(RoomEvent.TrackUnmuted, (publication: RemoteTrackPublication, participant: Participant) => {
      if (publication.kind === Track.Kind.Audio) {
        this.remoteParticipantsMute.update((prev) => {
          const next = new Map(prev);
          next.delete(participant.identity);
          return next;
        });
        console.log('Audio unmuted:', participant.identity);
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
      this.remoteParticipantsQuality.update(prev => { const next = new Map(prev); next.delete(participant.identity); return next; });
      this.remoteParticipantsMute.update(prev => { const next = new Map(prev); next.delete(participant.identity); return next; });
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

      this.startQualityMonitoring(room);

      setTimeout(() => this.forceHighQualityForRemotes(), 3000);
      setTimeout(() => this.forceHighQualityForRemotes(), 8000);

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log(`👤 Participant connected: ${participant.identity}`);
        setTimeout(() => this.forceHighQualityForRemotes(), 3000);
      });

      // Enable camera at the adaptive tier's resolution
      const cameraConstraints = this.adaptiveQuality.getCameraConstraints(initialTier);
      await room.localParticipant.setCameraEnabled(true, cameraConstraints);

      const videoTrack = room.localParticipant.videoTracks.values().next().value?.track;
      this.localParticipant.set(videoTrack);

      // ⬇️ ADD THIS: Store the MediaStream for local video
      if (videoTrack?.mediaStreamTrack) {
        const localStream = new MediaStream([videoTrack.mediaStreamTrack]);
        this.localVideoStream.set(localStream);
        console.log('📹 Local video stream stored');
      } else if (videoTrack?.mediaStream) {
        this.localVideoStream.set(videoTrack.mediaStream);
        console.log('📹 Local video mediaStream stored');
      }

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
    this.screenShareTrack.set(null);
    this.screenShareParticipantId.set(null);
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

  async toggleCamera(){
    const room = this.room();
    if (!room) return;

    const isCurrentlyEnabled = room.localParticipant.isCameraEnabled;

    if (isCurrentlyEnabled) {
      await room.localParticipant.setCameraEnabled(false);
      this.localVideoStream.set(null);
      console.log('📷 Camera disabled');
    } else {
      const cameraConstraints = this.adaptiveQuality.getCameraConstraints(this.adaptiveQuality.currentTier());
      await room.localParticipant.setCameraEnabled(true, cameraConstraints);

      await this.refreshLocalVideoStream();

      if (this.blurLevel !== 'none') {
        await this.applyBlur(this.blurLevel);
      }

      console.log('📷 Camera enabled');
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

    // Notify layout service about local screen share
    this.screenShareParticipantId.set(this.localParticipantIdentity);
    this.videoLayout.setScreenShareActive(this.localParticipantIdentity, true);
    console.log("Screen sharing started");
  }

  stopScreenShare() {
    const pub = this.getLocalTrackPublication(Track.Source.ScreenShare);
    if (pub) {
      this.room()?.localParticipant.unpublishTrack(pub.track!);
      pub.track?.stop();

      this.screenShareTrack.set(null);
      this.screenShareParticipantId.set(null);
      this.videoLayout.setScreenShareActive(this.localParticipantIdentity, false);
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
    if (!cameraPub || !cameraPub.videoTrack) {
      console.warn('⚠️ No camera track for blur');
      return;
    }

    const videoTrack = cameraPub.videoTrack;

    try {
      if (level === 'none') {
        await videoTrack.stopProcessor();
        console.log('🔲 Blur removed');
      } else {
        const blurRadius = level === 'mid' ? 6 : 15;
        const blur = BackgroundProcessor({ mode: 'background-blur', blurRadius });
        await videoTrack.setProcessor(blur);
        console.log(`🔲 Blur applied: ${level} (radius: ${blurRadius})`);
      }

      this.blurLevel = level;

      await this.refreshLocalVideoStream();
    } catch (error) {
      console.error('🔴 Blur error:', error);
    }
  }

  private async refreshLocalVideoStream(): Promise<void> {
    const room = this.room();
    if (!room) {
      console.warn('⚠️ No room for stream refresh');
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 150));

    const publication = this.getLocalTrackPublication(Track.Source.Camera);
    const track: any = publication?.track;

    if (!track) {
      console.warn('⚠️ No camera track found');
      return;
    }

    if (track.mediaStreamTrack) {
      const newStream = new MediaStream([track.mediaStreamTrack]);
      this.localVideoStream.set(newStream);
      console.log('📹 Local video stream refreshed');
    } else if (track.mediaStream) {
      this.localVideoStream.set(track.mediaStream);
      console.log('📹 Local video stream refreshed (mediaStream)');
    } else {
      console.warn('⚠️ Track has no mediaStreamTrack');
    }
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

  // ── Layout helpers ─────────────────────────────────────────────────────

  /** Returns only remote video (camera) tracks, excluding screen shares */
  returnRemoteVideoTracks(): TrackInfo[] {
    return this.returnRemoteParticipantTrack().filter(
      r => r.trackPublication.kind === 'video' && r.trackPublication.source !== Track.Source.ScreenShare
    );
  }

  /** Count of remote video (camera) participants */
  private getRemoteVideoCount(): number {
    return this.returnRemoteVideoTracks().length;
  }

  // ── Remote video quality monitoring ────────────────────────────────────

  private qualityChangeDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  private lastQualityChange = new Map<string, number>();
  private readonly QUALITY_CHANGE_COOLDOWN = 5000;
  private qualityCheckInterval: ReturnType<typeof setInterval> | null = null;

  private forceHighQualityForRemotes(): void {
    const room = this.room();
    if (!room) return;

    console.log('🔄 Forcing HIGH quality for all remote participants...');

    const remoteMap: Map<string, RemoteParticipant> =
      (room as any).participants ?? (room as any).remoteParticipants;
    if (!remoteMap) return;

    remoteMap.forEach((participant: RemoteParticipant, identity: string) => {
      const pubs: RemoteTrackPublication[] = Array.from(
        (participant as any).videoTrackPublications?.values?.()
          ?? (participant as any).videoTracks?.values?.()
          ?? []
      );
      pubs.forEach((publication: RemoteTrackPublication) => {
        if (publication.source === Track.Source.Camera && publication.isSubscribed && publication.track) {
          console.log(`📊 ${identity} before:`, {
            quality: ['LOW', 'MEDIUM', 'HIGH'][publication.videoQuality as any] ?? publication.videoQuality,
            dimensions: publication.dimensions,
            simulcasted: publication.simulcasted,
          });

          publication.setVideoQuality(VideoQuality.HIGH);
          publication.setVideoDimensions({ width: 1920, height: 1080 });

          console.log(`📺 Forced HIGH quality for: ${identity}`);
        }
      });
    });
  }

  private handleConnectionQualityChange(
    quality: ConnectionQuality,
    participant: Participant,
    room: Room
  ): void {
    if (participant.identity === room.localParticipant.identity) return;

    const remoteMap: Map<string, RemoteParticipant> =
      (room as any).participants ?? (room as any).remoteParticipants;
    const remoteParticipant = remoteMap?.get(participant.identity);
    if (!remoteParticipant) return;

    const pubs: RemoteTrackPublication[] = Array.from(
      (remoteParticipant as any).videoTrackPublications?.values?.()
        ?? (remoteParticipant as any).videoTracks?.values?.()
        ?? []
    );
    const videoPub = pubs.find((p: RemoteTrackPublication) => p.source === Track.Source.Camera);

    if (!videoPub || !videoPub.isSubscribed) return;

    let targetQuality: VideoQuality;
    let qualityName: string;

    switch (quality) {
      case ConnectionQuality.Excellent:
        targetQuality = VideoQuality.HIGH;
        qualityName = 'HIGH';
        break;
      case ConnectionQuality.Good:
        targetQuality = VideoQuality.HIGH;
        qualityName = 'HIGH';
        break;
      case ConnectionQuality.Poor:
        targetQuality = VideoQuality.MEDIUM;
        qualityName = 'MEDIUM';
        break;
      case ConnectionQuality.Lost:
      default:
        targetQuality = VideoQuality.LOW;
        qualityName = 'LOW';
        break;
    }

    videoPub.setVideoQuality(targetQuality);
    console.log(`📶 ${participant.identity} connection: ${ConnectionQuality[quality]} → Quality: ${qualityName}`);
  }

  private startQualityMonitoring(room: Room) {
    room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
      if (participant.identity === room.localParticipant.identity) return;

      console.log(`📶 ${participant.identity} connection: ${ConnectionQuality[quality] ?? quality}`);

      const remoteParticipant = (room as any).participants?.get(participant.identity)
        ?? (room as any).remoteParticipants?.get(participant.identity);
      if (!remoteParticipant) return;

      const videoPub = Array.from(remoteParticipant.videoTrackPublications?.values?.() ?? remoteParticipant.videoTracks?.values?.() ?? [])
        .find((p: any) => p.source === Track.Source.Camera) as RemoteTrackPublication | undefined;

      const targetQuality =
        quality === ConnectionQuality.Excellent ? VideoQuality.HIGH
        : quality === ConnectionQuality.Good ? VideoQuality.MEDIUM
        : VideoQuality.LOW;

      if (videoPub) {
        this.setParticipantQuality(videoPub, participant.identity, targetQuality);
      }
    });
  }

  private setParticipantQuality(
    publication: RemoteTrackPublication,
    participantId: string,
    quality: VideoQuality
  ) {
    const now = Date.now();
    const lastChange = this.lastQualityChange.get(participantId) || 0;

    if (now - lastChange < this.QUALITY_CHANGE_COOLDOWN) {
      console.log(`⏳ Skipping quality change for ${participantId} (cooldown)`);
      return;
    }

    const pending = this.qualityChangeDebounce.get(participantId);
    if (pending) clearTimeout(pending);

    const timeout = setTimeout(() => {
      publication.setVideoQuality(quality);
      this.lastQualityChange.set(participantId, Date.now());
      console.log(`📺 Quality applied: ${participantId} → ${VideoQuality[quality] ?? quality}`);
    }, 1000);

    this.qualityChangeDebounce.set(participantId, timeout);
  }

  // ── PiP interaction methods ────────────────────────────────────────────

  pipDragPosition = { x: 0, y: 0 };
  private isDragging = false;

  onPipClick() {
    // Swap feature removed
  }

  onPipDragStarted() {
    this.isDragging = true;
  }

  onPipDragEnd(event: CdkDragEnd) {
    const container = document.querySelector('.spotlight-layout') as HTMLElement;
    if (!container) {
      this.isDragging = false;
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const pipRect = event.source.element.nativeElement.getBoundingClientRect();

    const pipCenterX = pipRect.left - containerRect.left + pipRect.width / 2;
    const pipCenterY = pipRect.top - containerRect.top + pipRect.height / 2;

    this.videoLayout.snapPipToCorner(
      containerRect.width,
      containerRect.height,
      pipCenterX,
      pipCenterY
    );

    // Reset drag transform so CSS corner positioning takes over
    this.pipDragPosition = { x: 0, y: 0 };
    event.source.reset();

    // Delay clearing isDragging so the click handler (which fires after dragEnd) ignores it
    setTimeout(() => { this.isDragging = false; }, 50);
  }

  togglePipSize() {
    this.videoLayout.togglePipSize();
  }

  // ── Grid tile click → switch to spotlight ──────────────────────────────

  onGridTileClick(participantId: string) {
    console.log(`Grid tile clicked: ${participantId}`);
  }

  // ── Filmstrip methods ─────────────────────────────────────────────────

  checkFilmstripScroll() {
    const container = this.filmstripContainer?.nativeElement;
    if (!container) return;

    const hasOverflow = container.scrollWidth > container.clientWidth;
    this.showFilmstripScrollButtons = hasOverflow;
    this.canScrollLeft = container.scrollLeft > 0;
    this.canScrollRight = container.scrollLeft < (container.scrollWidth - container.clientWidth - 10);
  }

  scrollFilmstrip(direction: 'left' | 'right') {
    const container = this.filmstripContainer?.nativeElement;
    if (!container) return;

    const scrollAmount = 200;
    const targetScroll = direction === 'left'
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;

    container.scrollTo({ left: targetScroll, behavior: 'smooth' });
  }

  onFilmstripScroll() {
    this.checkFilmstripScroll();
  }

  onFilmstripTileClick(participantId: string) {
    console.log(`Filmstrip tile clicked: ${participantId}`);
  }

  getScreenShareParticipantName(): string {
    const id = this.screenShareParticipantId();
    if (!id) return 'Someone';
    if (id === this.localParticipantIdentity) return 'You';
    for (const p of this.remoteParticipants().values()) {
      if (p.participantIdentity === id) return p.participantName;
    }
    return 'Someone';
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