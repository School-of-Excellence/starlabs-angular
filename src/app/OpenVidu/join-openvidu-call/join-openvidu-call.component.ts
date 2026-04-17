import { PicoKoalaService } from './../../pico-koala.service';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, computed, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, createLocalScreenTracks, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, LocalTrackPublication, VideoPresets, VideoQuality } from 'livekit-client';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
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
  localNetworkQuality = signal<ConnectionQuality>(ConnectionQuality.Unknown);
  isMicMuted = signal<boolean>(false);
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
    const hasScreenShare = this.getActiveScreenShare() !== null;

    if (hasScreenShare) return 'screen-share';  // Screen share layout
    if (remoteVideoCount === 0) return 'grid';   // 1 participant = grid (not solo)
    if (remoteVideoCount === 1) return 'spotlight'; // 2 participants = spotlight
    return 'grid';  // 3+ participants = grid
  });


  // scroll state
  @ViewChild('filmstripContainer') filmstripContainer!: ElementRef<HTMLDivElement>;
  canScrollLeft = false;
  canScrollRight = false;
  showFilmstripScrollButtons = false;

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
    private adaptiveQuality: AdaptiveQualityService,
    public videoLayout: VideoLayoutService,
    public picoKoalaService : PicoKoalaService
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

        if (participant.identity === room.localParticipant.identity) {
          this.localNetworkQuality.set(quality);
          console.log("📶 Local network quality:", ConnectionQuality[quality]);
        }

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

      // ── KOALA: Init BEFORE room.connect() so it's ready the moment we join ──
      // This captures mic, runs the noise suppression pipeline, and produces
      // a clean MediaStreamTrack — all before the room handshake begins.
      await this.picoKoalaService.init();
      await this.picoKoalaService.start();


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


      try {
        await this.picoKoalaService.publishToRoom(room);
        console.log('🎙️ Koala noise-suppressed audio published');
      } catch (koalaPublishError) {
        // Fallback: if Koala publish fails, use standard mic
        console.warn('Koala publish failed, falling back to standard mic:', koalaPublishError);
        await room.localParticipant.setMicrophoneEnabled(true, {
          noiseSuppression: true,
          echoCancellation: true,
        });
      }
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

    // 3. Cleanup when leaving
    await this.picoKoalaService.stop();
    await this.picoKoalaService.release();
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
      this.isMicMuted.set(false);
    }
    else{
      micPub.mute()
      this.isMicMuted.set(true);
    }
  }

  getNetworkQualityClass(quality: ConnectionQuality | undefined): string {
    if (quality === undefined || quality === null) return 'unknown';
    switch (quality) {
      case ConnectionQuality.Excellent: return 'excellent';
      case ConnectionQuality.Good: return 'good';
      case ConnectionQuality.Poor: return 'poor';
      case ConnectionQuality.Lost: return 'lost';
      default: return 'unknown';
    }
  }

  getNetworkQualityLabel(quality: ConnectionQuality | undefined): string {
    if (quality === undefined || quality === null) return 'Unknown';
    switch (quality) {
      case ConnectionQuality.Excellent: return 'Excellent';
      case ConnectionQuality.Good: return 'Good';
      case ConnectionQuality.Poor: return 'Poor';
      case ConnectionQuality.Lost: return 'Disconnected';
      default: return 'Unknown';
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

  togglePipSize(): void {
    if (!this.isDragging) {
      this.videoLayout.togglePipSize();
    }
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
