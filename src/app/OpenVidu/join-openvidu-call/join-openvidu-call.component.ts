import { PicoKoalaService } from './../../Service/PicoVoice Koala/pico-koala.service';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, computed, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, createLocalScreenTracks, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, LocalTrackPublication, VideoPresets, VideoQuality, ScreenSharePresets, LocalAudioTrack } from 'livekit-client';
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
import { Df3NoiseService } from '../../Service/df3-noise.service';
import { AiCousticsService } from '../../Service/AI Coustics/ai-coustics.service';


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
  remoteParticipantTracks = computed<TrackInfo[]>(() => Array.from(this.remoteParticipants().values()));
  remoteParticipantsQuality = signal<Map<string, ConnectionQuality>>(new Map());
  remoteParticipantsMute = signal<Map<string, boolean>>(new Map());
  localNetworkQuality = signal<ConnectionQuality>(ConnectionQuality.Unknown);
  isMicMuted = signal<boolean>(false);
  // M1: converted to signal — plain array not reactive in Angular 19 signals-first CD
  // activeSpeakers:Array<string> = [];
  activeSpeakers = signal<string[]>([]);
  private micPublication: LocalTrackPublication | null = null;


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

  blurLevel: 'none' | 'mid' | 'high' = 'high';
  localParticipantIdentity = '';

  // df3 ONNX
  isInRoom : boolean = false;
  get isWarmedUp() { return this.df3['isWarmedUp']; }

  private previewStream: MediaStream | null = null;
  private canvasPipelineCleanup: (() => void) | null = null;
  // Cache active blur processor — avoids recreating the canvas pipeline on every camera re-enable
  private cachedBlurProcessor: any = null;
  private cachedBlurRadius: number = 0;

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
    public picoKoalaService : PicoKoalaService,
    public df3: Df3NoiseService,
    public aicoustics: AiCousticsService
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
    // C7: ordered synchronous cleanup before async leaveRoom

    // 1. Stop quality snapshot timers
    if (this.qualityMinuteTimer) clearInterval(this.qualityMinuteTimer);
    if (this.qualityBatchTimer) clearTimeout(this.qualityBatchTimer);

    // C4: qualityCheckInterval was never assigned a setInterval — dead cleanup, commented out
    // if (this.qualityCheckInterval) {
    //   clearInterval(this.qualityCheckInterval);
    //   this.qualityCheckInterval = null;
    // }

    // 2. Clear quality debounce state
    this.qualityChangeDebounce.forEach(timeout => clearTimeout(timeout));
    this.qualityChangeDebounce.clear();
    this.lastQualityChange.clear();

    // 3. Stop adaptive quality monitoring (synchronous)
    this.adaptiveQuality.stopMonitoring();

    // 4. Cancel canvas pipeline (synchronous)
    this.canvasPipelineCleanup?.();
    this.canvasPipelineCleanup = null;
    this.cachedBlurProcessor = null;
    this.cachedBlurRadius = 0;

    // 5. Async teardown: Koala stop → Koala release → room disconnect
    //    void is intentional — ngOnDestroy cannot be async; cleanup fires in correct order inside leaveRoom()
    void this.leaveRoom(false);

    // 6. Complete observables and clear references (synchronous)
    this.roomDetail = null;
    this.roomSubscription?.next();
    this.roomSubscription?.complete();
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
      // C3: audio:true removed — mic is exclusively managed by PicoKoalaService via WebVoiceProcessor
      // Opening mic here would conflict with Koala's WebVoiceProcessor pipeline (double capture, AEC failure)
      // const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

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
    // Permissions were already obtained in prepareParticipant() during the pre-join screen.
    // Calling it again would open a second getUserMedia() on the same device, causing echo
    // and camera conflicts. Instead, release the preview stream here so LiveKit can open it.
    if (this.cameraStatus !== 'granted' || this.micStatus !== 'granted') {
      const allowed = await this.prepareParticipant();
      if (!allowed) {
        alert("Please allow Camera & Microphone to join the call.");
        return;
      }
    }

    // Stop preview tracks before LiveKit opens the device to avoid double capture
    if (this.previewStream) {
      this.previewStream.getTracks().forEach(t => t.stop());
      this.previewStream = null;
    }
    this.localParticipant.set(undefined);

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
          // Do NOT call setVideoDimensions() here — it overrides adaptiveStream's ResizeObserver
          // which automatically selects the simulcast layer matching the rendered tile size.
          // publication.setVideoDimensions({ width: 1920, height: 1080 }); // ← removed: forces full-HD regardless of tile size

          // Full native: NO setVideoQuality() calls for camera tracks at all.
          // adaptiveStream: true auto-selects simulcast layer via ResizeObserver on each <video> element.
          // SFU congestion control handles network constraints end-to-end without manual intervention.
          // A1 previous code (caps for Poor/Lost) removed — these overrode adaptiveStream's selection:
          // const localQuality = this.localNetworkQuality();
          // if (localQuality === ConnectionQuality.Poor) publication.setVideoQuality(VideoQuality.MEDIUM);
          // else if (localQuality === ConnectionQuality.Lost) publication.setVideoQuality(VideoQuality.LOW);
          console.log(`📺 Subscribed to ${participant.identity} | adaptiveStream active — no manual quality cap`);

          // Confirm active simulcast layer after SFU negotiation settles (~2s)
          setTimeout(() => {
            console.log(`📊 Quality verify for ${participant.identity}:`, {
              quality: ['LOW', 'MEDIUM', 'HIGH'][publication.videoQuality as any] ?? publication.videoQuality,
              dimensions: publication.dimensions,
            });
          }, 2000);
        }

        // A4: Screen share subscription quality based on CPU/network at subscription time
        if (track.kind === Track.Kind.Video && publication.source === Track.Source.ScreenShare) {
          const cpu = this.adaptiveQuality.cpuPressure();
          const net = this.localNetworkQuality();
          const screenQuality =
            cpu === 'critical' || net === ConnectionQuality.Lost ? VideoQuality.LOW
            : cpu === 'serious' || net === ConnectionQuality.Poor ? VideoQuality.MEDIUM
            : VideoQuality.HIGH; // good conditions → full quality for spotlight view
          publication.setVideoQuality(screenQuality);
          console.log(`🖥️ Screen share sub quality: ${VideoQuality[screenQuality]} (cpu:${cpu} net:${ConnectionQuality[net]})`);
        }

        // Seed quality map with Unknown immediately so the bar renders (grey) rather than nothing
        this.remoteParticipantsQuality.update(prev => {
          if (prev.has(participant.identity)) return prev; // keep existing quality if already known
          const next = new Map(prev);
          next.set(participant.identity, ConnectionQuality.Unknown);
          return next;
        });

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

    // Handle Quality Change — update signals only; setVideoQuality is handled by startQualityMonitoring
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
      this.activeSpeakers.set(speakerID ?? []); // M1: signal update
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
      // await this.picoKoalaService.init();
      // await this.picoKoalaService.start();

      // let df3Track: MediaStreamTrack | null = null;
      // try {
      //   console.log('[DF3] Starting getCleanTrack()...');
      //   df3Track = await this.df3.getCleanTrack();
      //   this.df3.debugAudioPipeline();
      //   console.log('[DF3] Track state:', df3Track?.readyState);
      //   console.log('[DF3] Track enabled:', df3Track?.enabled);
      //   console.log('[DF3] Track muted:', df3Track?.muted);
      //   console.log('[DF3] Track settings:', df3Track?.getSettings());
      //   console.log('[DF3] ✅ getCleanTrack() succeeded:', this.df3.executionProvider);
      // } catch (df3Error: any) {
      //   // Log the FULL error so we can see what actually failed
      //   console.error('[DF3] ❌ getCleanTrack() failed:', df3Error);
      //   console.error('[DF3] ❌ Error message:', df3Error?.message);
      //   console.error('[DF3] ❌ Error stack:', df3Error?.stack);
      // }

      // Connect to the LiveKit room
      // await ensures we wait until initial signaling is done
      await room.connect(response.url, response.token);
      this.meetingRoomStatus = "connected"
      this.localParticipantIdentity = room.localParticipant.identity;
      console.log('Room connected:', this.loggedinProfileid);

      // ai-coustics noise cancellation




      // ── Quality tracking ──────────────────────────────────────────────────
      try {
        await this.initQualityTracking();
        this.startQualityTimers();
      } catch (qualityTrackError) {
        console.log(qualityTrackError)
      }
      // ─────────────────────────────────────────────────────────────────────

      this.startQualityMonitoring(room);

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log(`👤 Participant connected: ${participant.identity}`);
      });

      // 1. Enable mic — returns the publication directly
      const micPub = await room.localParticipant.setMicrophoneEnabled(true, {
        sampleRate: 48000,
        channelCount: 2,
        echoCancellation: true
      });
      this.micPublication = micPub as LocalTrackPublication;

      // 2. Get LocalAudioTrack via .track property (correct for v1.x)
      const livekitMicTrack = micPub?.track as LocalAudioTrack;
      if (!livekitMicTrack) throw new Error('No mic track found');

      // 3. Create MediaStream from LiveKit's raw mic track
      const rawStream = new MediaStream([livekitMicTrack.mediaStreamTrack]);

      // 4. Process through ai-coustics
      const cleanStream = await this.aicoustics.createCleanStream(rawStream);
      const cleanMediaTrack = cleanStream.getAudioTracks()[0];

      // 5. Replace LiveKit's track with ai-coustics clean track
      await livekitMicTrack.replaceTrack(cleanMediaTrack, true);

      console.log('🎙️ ai-coustics track replaced successfully');
      // Enable camera with explicit simulcast publish options (not relying on publishDefaults alone).
      // getCameraConstraints() → capture resolution/fps; getPublishOptions() → VP8 simulcast layers.
      const cameraConstraints = this.adaptiveQuality.getCameraConstraints(initialTier);
      const publishOptions    = this.adaptiveQuality.getPublishOptions(initialTier);
      await room.localParticipant.setCameraEnabled(true, cameraConstraints, publishOptions);

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

      // Raw track applyConstraints removed — setCameraEnabled(true, cameraConstraints) already sets them.
      // Calling applyConstraints() again on the live track forces camera renegotiation → video freeze.
      // const tierCfg = cameraConstraints.resolution;
      // const rawMediaTrack = videoTrack?.mediaStreamTrack;
      // if (rawMediaTrack) { await rawMediaTrack.applyConstraints({...}); }
      const settings = videoTrack?.mediaStreamTrack?.getSettings();
      if (settings) console.log(`📹 Camera opened: ${settings.width}x${settings.height}@${settings.frameRate}fps`);

      // Start adaptive quality monitoring BEFORE blur so the baseline CPU reading
      // is taken before the blur processor adds its load (warm-up window prevents
      // premature downgrades during the first 15 seconds).
      this.adaptiveQuality.startMonitoring(room);

      // C6: Default blur is 'none' — blur processor adds heavy per-frame canvas load.
      // User can enable blur via UI button after joining. This eliminates the main freeze source at call start.
      // Previous: defaulted to 'high' (or 'none' only if CPU was already critical at join time).
      // const cpuAtJoin = this.adaptiveQuality.cpuPressure();
      // const defaultBlur: 'none' | 'high' = (cpuAtJoin === 'critical' || cpuAtJoin === 'serious') ? 'none' : 'high';
      this.blurLevel = 'none'; // blur off by default — user enables via UI
      console.log('📹 Blur off by default — enable via UI button');


      // try {
      //   await this.picoKoalaService.publishToRoom(room);
      //   console.log('🎙️ Koala noise-suppressed audio published');
      // } catch (koalaPublishError) {
      //   // Fallback: if Koala publish fails, use standard mic
      //   console.warn('Koala publish failed, falling back to standard mic:', koalaPublishError);
      //   await room.localParticipant.setMicrophoneEnabled(true, {
      //     noiseSuppression: true,
      //     echoCancellation: true,
      //   });
      // }



      // ────────────────
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
    // this.activeSpeakers = []; // M1: was plain array
    this.activeSpeakers.set([]); // M1: signal reset
    this.localParticipantIdentity = '';
    // this.blurLevel = 'none'; // C6: reset to 'high' to match class default (not 'none')
    this.blurLevel = 'high';
    this.screenShareTrack.set(null);
    this.screenShareParticipantId.set(null);
    this.meetingRoomStatus = "left"

    // 3. Cleanup when leaving
    // await this.picoKoalaService.stop();
    // await this.picoKoalaService.release();
    await this.aicoustics.stop();

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

  toggleMute() {
  if (!this.micPublication) return;
  const value = this.isAudioMuted();
  if (value) {
    (this.micPublication as LocalTrackPublication).unmute();
    this.isMicMuted.set(false);
  } else {
    (this.micPublication as LocalTrackPublication).mute();
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

  /**
   * Network bars for the LOCAL participant.
   * Reads from localNetworkQuality (self-reported uplink to the SFU) so the bar
   * is consistent — Person A always sees their own quality, not how others receive them.
   */
  getLocalNetworkBars(): { bars: number; color: string } {
    const quality = this.localNetworkQuality();
    switch (quality) {
      case ConnectionQuality.Excellent: return { bars: 4, color: '#4caf50' };
      case ConnectionQuality.Good:      return { bars: 3, color: '#ffb300' };
      case ConnectionQuality.Poor:      return { bars: 1, color: '#e53935' };
      case ConnectionQuality.Lost:      return { bars: 0, color: '#e53935' };
      default:                          return { bars: 0, color: '#888' };
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
      const publishOptions    = this.adaptiveQuality.getPublishOptions(this.adaptiveQuality.currentTier());
      await room.localParticipant.setCameraEnabled(true, cameraConstraints, publishOptions);

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
    // M2: use remoteParticipantTracks() computed signal instead of allocating new array each call
    // const remoteTracks = Array.from(this.remoteParticipants().values());
    return this.remoteParticipantTracks().some(track => track.trackPublication.source === Track.Source.ScreenShare);
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
    // M2: use remoteParticipantTracks() computed signal instead of allocating new array
    // const remoteTracks = Array.from(this.remoteParticipants().values());
    const remoteScreenShare = this.remoteParticipantTracks().find(
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
    // C2: Screen share resolution + encoding based on current network/CPU tier.
    // Publishing full-HD on a low-tier connection saturates uplink → camera freeze + audio loss.
    const tier = this.adaptiveQuality.currentTier();

    // Map tier to ScreenSharePresets (official LiveKit presets with encoding config)
    const screenPreset =
      (tier === 'minimal' || tier === 'low') ? ScreenSharePresets.h720fps5     // ~400 kbps budget
      : tier === 'medium'                    ? ScreenSharePresets.h720fps15    // ~1 Mbps budget
      :                                        ScreenSharePresets.h1080fps15;  // ~2.5 Mbps budget

    // Previous hardcoded approach (no tier check):
    // const screenTracks = await createLocalScreenTracks({ audio: false, resolution: { width: 1920, height: 1080 } });
    // const screenResolution = (tier === 'low' || tier === 'minimal') ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
    const screenTracks = await createLocalScreenTracks({
      audio: false,
      resolution: screenPreset.resolution,
    });

    for (const track of screenTracks) {
      // C2: publish with tier-matched encoding instead of no options (which defaults to max bitrate)
      await this.room()?.localParticipant.publishTrack(track, {
        videoEncoding: screenPreset.encoding,
        simulcast: false, // screen share is single-layer — simulcast not applicable
      });
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
        this.cachedBlurProcessor = null;
        this.cachedBlurRadius = 0;
        console.log('🔲 Blur removed');
      } else {
        const blurRadius = level === 'mid' ? 5 : 10; // Reduced: was 6/15 — lighter per-frame load
        if (!this.cachedBlurProcessor || this.cachedBlurRadius !== blurRadius) {
          // Only create + attach processor when radius changes or first time
          const blur = BackgroundProcessor({ mode: 'background-blur', blurRadius });
          await videoTrack.setProcessor(blur);
          this.cachedBlurProcessor = blur;
          this.cachedBlurRadius = blurRadius;
          console.log(`🔲 Blur applied: ${level} (radius: ${blurRadius})`);
        } else {
          // Same radius already active — re-attach cached processor to new track (camera re-enable)
          await videoTrack.setProcessor(this.cachedBlurProcessor);
          console.log(`🔲 Blur re-attached: ${level} (radius: ${blurRadius})`);
        }
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

  returnRemoteParticipantTrack(): TrackInfo[] {
    return this.remoteParticipantTracks();
  }

  getVideoParticipantCount(): number {
    // M11: Count all video publications (camera AND screen share) — each is a distinct tile in the grid
    // Including screen share means the grid adapts correctly when someone shares (tiles get smaller,
    // which triggers adaptiveStream to request lower quality for the smaller camera tiles)
    // Previous code excluded screen share: remote.trackPublication.source !== Track.Source.ScreenShare
    const remoteVideoCount = this.remoteParticipantTracks().filter(
      remote => remote.trackPublication.kind === 'video'
    ).length;
    return 1 + remoteVideoCount; // +1 for local participant
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
  private readonly QUALITY_CHANGE_COOLDOWN = 5000; // M12: cooldown removed from setParticipantQuality() downgrade path
  // C4: qualityCheckInterval was declared but never assigned a setInterval() — dead code, commented out
  // private qualityCheckInterval: ReturnType<typeof setInterval> | null = null;

  private startQualityMonitoring(room: Room) {
    room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
      // Local participant quality is handled by localNetworkQuality signal
      if (participant.identity === room.localParticipant.identity) return;

      console.log(`📶 ${participant.identity} connection: ${ConnectionQuality[quality] ?? quality}`);

      // Full native: update UI quality bars ONLY — no setVideoQuality() calls.
      // adaptiveStream + SFU congestion control handle all subscription layer decisions natively.
      // Previous manual cap logic kept as comment for reference:
      // networkCap = Good→HIGH, Poor→MEDIUM, Lost→LOW
      // cpuCap = critical→LOW, serious→MEDIUM, else→HIGH
      // targetQuality = Math.min(networkCap, cpuCap)
      // if (targetQuality < HIGH) setParticipantQuality(videoPub, participant.identity, targetQuality)
      this.remoteParticipantsQuality.update(prev => {
        const next = new Map(prev);
        next.set(participant.identity, quality);
        return next;
      });
    });
  }

  private setParticipantQuality(
    publication: RemoteTrackPublication,
    participantId: string,
    quality: VideoQuality
  ) {
    // M12: Removed the 5s QUALITY_CHANGE_COOLDOWN check for downgrade caps.
    // With A1 fix, this method is only called when quality < HIGH (i.e. downgrade caps only).
    // Downgrades must respond immediately to bad network — cooldown would delay response by 5–15s.
    // const now = Date.now();
    // const lastChange = this.lastQualityChange.get(participantId) || 0;
    // if (now - lastChange < this.QUALITY_CHANGE_COOLDOWN) {
    //   console.log(`⏳ Skipping quality change for ${participantId} (cooldown)`);
    //   return;
    // }

    // Keep 1s debounce to prevent rapid-fire calls on unstable quality events
    const pending = this.qualityChangeDebounce.get(participantId);
    if (pending) clearTimeout(pending);

    const timeout = setTimeout(() => {
      publication.setVideoQuality(quality);
      this.lastQualityChange.set(participantId, Date.now());
      console.log(`📺 Quality cap applied: ${participantId} → ${VideoQuality[quality] ?? quality}`);
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
      // M5: filter by nominated:true instead of state==='succeeded'
      // state=succeeded can match multiple pairs during network handoff (old pair lingers briefly);
      // nominated:true is set on exactly ONE pair — the one actively carrying traffic
      // if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
      if (stat.type === 'candidate-pair' && stat.nominated === true) {
        network.rtt = parseFloat(((stat.currentRoundTripTime ?? 0) * 1000).toFixed(1));
        network.availableBandwidth = Math.round((stat.availableOutgoingBitrate ?? 0) / 1000);
      }
      if (stat.type === 'local-candidate') {
        network.iceType = stat.candidateType ?? 'unknown';
      }
    });

    // ── Subscriber stats ─────────────────────────────────────────────────────
    const subStats = await subPC.getStats();

    // Accumulate across all inbound-rtp video streams (one per remote participant).
    // Previously the last entry silently overwrote prior ones, making freeze/loss unreliable.
    let videoIn = { resolution: 'unknown', fps: 0, packetsReceived: 0, packetsLost: 0, freezeCount: 0, freezeDuration: 0, jitter: 0 };
    let videoInCount = 0;
    let audioIn = { jitter: 0 };

    subStats.forEach((stat: any) => {
      if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
        videoInCount++;
        videoIn.packetsReceived += stat.packetsReceived ?? 0;
        videoIn.packetsLost    += stat.packetsLost ?? 0;
        videoIn.freezeCount    += stat.freezeCount ?? 0;
        videoIn.freezeDuration += stat.totalFreezesDuration ?? 0;
        videoIn.jitter         += (stat.jitter ?? 0) * 1000;
        videoIn.fps            += Math.round(stat.framesPerSecond ?? 0);
        videoIn.resolution      = `${stat.frameWidth ?? 0}x${stat.frameHeight ?? 0}`;
      }
      if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
        audioIn.jitter = parseFloat(((stat.jitter ?? 0) * 1000).toFixed(1));
      }
    });

    if (videoInCount > 1) {
      videoIn.fps    = Math.round(videoIn.fps / videoInCount);
      videoIn.jitter = videoIn.jitter / videoInCount;
    }
    videoIn.freezeDuration = parseFloat(videoIn.freezeDuration.toFixed(2));
    videoIn.jitter         = parseFloat(videoIn.jitter.toFixed(1));

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
    // C5: local identity never exists in remoteParticipantsQuality — was always 'Unknown'
    // const localQuality = this.remoteParticipantsQuality().get(this.localParticipantIdentity) ?? 'Unknown';
    const localQuality = ConnectionQuality[this.localNetworkQuality()] ?? 'Unknown';

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
    }, 60_000);

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
