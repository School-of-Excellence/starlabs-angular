// import { PicoKoalaService } from './../../Service/PicoVoice Koala/pico-koala.service';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, computed, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, createLocalScreenTracks, LocalAudioTrack, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, LocalTrackPublication, VideoQuality, ScreenSharePresets, VideoPreset } from 'livekit-client';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { doc, docData, getDoc, Firestore } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { OpenviduVideoElementComponent } from '../../OpenVidu/openvidu-video-element/openvidu-video-element.component';
import { CommonModule } from '@angular/common';
import { OpenviduAudioElementComponent } from '../../OpenVidu/openvidu-audio-element/openvidu-audio-element.component';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { BackgroundProcessor } from "@livekit/track-processors";
import { InstanceStatusService } from '../../instance-status.service';
import { MatDividerModule } from '@angular/material/divider';
import { AdaptiveQualityService } from '../../Service/AdaptiveQuality/adaptive-quality.service';
import { VideoLayoutService, LayoutMode } from '../../Service/VideoLayout/video-layout.service';
// Patched DFN build (adds makeupGain + post-DFN gate); vendored from the videoconference
// repo because npm deepfilternet3-noise-filter@1.2.1 lacks these. See vendor/.../package.json.
import { DeepFilterNoiseFilterProcessor } from '../dfn/vendor/deepfilternet3-noise-filter';
import { DfnStateService } from '../dfn/dfn-state.service';
import { startJitterController, setJitterMax, getJitterMax, jitterTargets } from '../dfn/jitter-buffer';

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
  selector: 'app-join-livekit-call',
  imports: [
    OpenviduVideoElementComponent,
    OpenviduAudioElementComponent,
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    CdkDrag
  ],
  templateUrl: './join-livekit-call.component.html',
  styleUrl: './join-livekit-call.component.css'
})
export class JoinLivekitCallComponent implements AfterViewInit, OnDestroy {

  loggedinProfileid = null
  loggedinProfileRole = {}

  // Map Participant
  room = signal<Room | undefined>(undefined)
  localParticipant = signal<LocalVideoTrack | undefined>(undefined)
  remoteParticipants = signal<Map<string, TrackInfo>>(new Map());
  remoteParticipantsQuality = signal<Map<string, ConnectionQuality>>(new Map());
  remoteParticipantsMute = signal<Map<string, boolean>>(new Map());
  localNetworkQuality = signal<ConnectionQuality>(ConnectionQuality.Unknown);
  activeSpeakers = signal<string[]>([]);
  isLocalScreenSharing = signal<boolean>(false);

  // Meta Data
  roomDetail: RoomInfo | undefined | null;
  roomSubscription = new Subject<void>();

  // Media backend provider for this room: 'oci' (default) | 'aws' | 'do'.
  // Resolved from the ?provider= query param (manual testing) or the Firestore room field.
  provider: 'aws' | 'do' | 'oci' = 'oci';

  // Server Subscription
  serverSubscription = new Subject<void>();

  // UI States
  loading = true;
  meetingRoomStatus: null | "servercheck" | "serverstarting" | "serverfailed" | "connecting" | "connected" | "left" | "ended" = "servercheck"
  // Fullscreen Enable
  isFullscreen = false;
  @ViewChild('meetingContainer') meetingContainer!: ElementRef;
  // Hidden video that auto-enters Picture-in-Picture when the user switches tabs (Chrome/Edge
  // via the autoPictureInPicture attribute; no-op elsewhere). Its source is chosen by priority:
  // remote screen share → active speaker (holding the last) → name card if their camera is off.
  @ViewChild('pipVideo') pipVideo?: ElementRef<HTMLVideoElement>;
  private lastActiveSpeaker: string | null = null;
  private pipCanvas: HTMLCanvasElement | null = null;
  private pipVisibilityHandler: (() => void) | null = null;
  private pipNameCardCache: { name: string; stream: MediaStream } | null = null;
  /** True while the user has Picture-in-Picture turned on for this call (persists across tab switches). */
  pipEnabled = false;
  private pipAttachedTrack: RemoteTrack | LocalVideoTrack | null = null;

  // "Open Journey Plan" (bottom-center) — shown only for journey-coach/onboarding
  // appointments (twin of the appointment-studio button; opens /journeysupport/<client>).
  journeyPlanProfileId: string | null = null;

  // Permission
  cameraStatus: 'granted' | 'denied' | 'prompt' = 'prompt';
  micStatus: 'granted' | 'denied' | 'prompt' = 'prompt';
  isRequesting = false;

  blurLevel: 'none' | 'mid' | 'high' = 'none';
  localParticipantIdentity = '';

  // Diagnostics opt-in (?diag=1 / #diag) — also gates the advanced DFN sliders in the UI.
  diagEnabled = false;

  // Device selection (Zoom-style menus). Lists refresh on 'devicechange'.
  mics: MediaDeviceInfo[] = [];
  cameras: MediaDeviceInfo[] = [];
  speakers: MediaDeviceInfo[] = [];
  selectedMicId = '';
  selectedCameraId = '';
  selectedSpeakerId = '';
  private deviceChangeHandler: (() => void) | null = null;

  private previewStream: MediaStream | null = null;

  // ── DeepFilterNet3 (exact videoconference TrackProcessor architecture) ──────
  private static readonly DFN_PROCESSOR_NAME = 'deepfilternet3-noise-filter';
  private dfnProc: DeepFilterNoiseFilterProcessor | null = null;
  private dfnBroadcastTimer: any = null;
  private jitterStops = new Map<string, () => void>();
  // Remote CAMERA tracks by participant identity — the jitter controller holds each one to
  // the audio playout delay for lip-sync (see startJitterController).
  private remoteVideoTracks = new Map<string, RemoteTrack>();
  // UI state — exact defaults from DfnControls.tsx
  dfnEnabled = (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4) >= 4; // off on <4-core devices
  dfnAtten = 80;        // attenuation / noiseReductionLevel (0–100)
  dfnNorm = 1.2;        // makeup gain (1.0–2.5)
  dfnNormOn = true;     // normalize toggle
  dfnGateOn = true;     // gate toggle
  dfnGateDb = -45;      // gate threshold dBFS (-70…-25)
  dfnPanelOpen = false; // tuning popover visibility
  get dfnEffNorm(): number { return this.dfnNormOn ? this.dfnNorm : 1.0; }
  // Cache active blur processor — avoids recreating the canvas pipeline on every camera re-enable
  private cachedBlurProcessor: any = null;
  private cachedBlurRadius: number = 0;

  // Screen-share sidebar width (px), user-draggable via the divider. Dragging the divider
  // left widens the sidebar (more participant video), right widens the screen share.
  screenSidebarWidth = signal<number>(280);

  /** Start a horizontal drag on the screen-share divider to resize the participant sidebar. */
  startSidebarResize(event: MouseEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.screenSidebarWidth();
    const onMove = (e: MouseEvent) => {
      // Divider moving left (clientX decreases) → wider sidebar. Clamp to sane bounds.
      const delta = startX - e.clientX;
      this.screenSidebarWidth.set(Math.min(700, Math.max(180, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Layout mode computed from participant count and screen share state
  layoutMode = computed<LayoutMode>(() => {
    const remoteVideoCount = this.getRemoteVideoCount();
    const hasScreenShare = this.isLocalScreenSharing() || this.returnRemoteParticipantTrack().some(t => t.trackPublication.source === Track.Source.ScreenShare);
    // this.getActiveScreenShare() != null;

    if (hasScreenShare) return 'screen-share';  // Screen share layout
    if (remoteVideoCount === 0) return 'grid';   // 1 participant = grid (not solo)
    if (remoteVideoCount === 1) return 'spotlight'; // 2 participants = spotlight
    return 'grid';  // 3+ participants = grid
  });

  constructor(
    public firestore: Firestore,
    public route: ActivatedRoute,
    private router: Router,
    public httpClient: HttpClient,
    public guard: AuthguardService,
    public dialog: MatDialog,
    private infraService: InstanceStatusService,
    private adaptiveQuality: AdaptiveQualityService,
    public videoLayout: VideoLayoutService,
    public dfnState: DfnStateService,
    // public picoKoalaService : PicoKoalaService
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

            // Resolve which media backend (cloud) hosts this room's OpenVidu Elastic cluster.
            // NB: the existing `provider` field means system (openvidu vs livekit-cloud) and is
            // rewritten to "openvidu" by createOpenViduToken — so the cloud selector uses a SEPARATE
            // `mediaProvider` field. Priority: ?provider= query param (manual A/B) → mediaProvider → 'oci'.
            const requestedProvider = (this.route.snapshot.queryParamMap.get("provider") || data["mediaProvider"] || "oci").toString().toLowerCase()
            this.provider = requestedProvider === "do" ? "do" : requestedProvider === "aws" ? "aws" : "oci"

            console.log("Provider", this.provider)

            // Prepare Call - Only when screen launched first time.
            // checkServer() is provider-aware: it gates on the matching cloud's status doc
            // (AWS_System / OCI_System) and shows "server starting…" until the master is
            // running with ≥1 healthy media node — essential for instant meetings, where the
            // server was fired moments ago and boots for several minutes. DO has no status
            // doc yet, so it skips the gate (capacity handled by the 503 retry).
            if(this.roomDetail.title == ""){
              if(this.provider === "do") this.prepareParticipant()
              else this.checkServer()
            }

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

        // Journey-plan button gate: room id == appointment docid for appointment sessions.
        // Non-appointment rooms (live assignment / private) simply have no matching doc.
        getDoc(doc(this.firestore, "appointments", id)).then(appt => {
          const a = appt.exists() ? appt.data() : null
          if (a && (a["journeycoach"] || a["onboarding"]) && a["bookedby"]?.id) {
            this.journeyPlanProfileId = a["bookedby"].id
          }
        }).catch(err => console.log("Journey-plan appointment lookup failed:", err))

        this.loading = false
      })
    }
  }

  /** Bottom-center toolbar button — same target as appointment-studio's Open Journey Plan. */
  openJourneyPlan(): void {
    if (!this.journeyPlanProfileId) return
    const url = this.router.createUrlTree(['/journeysupport', this.journeyPlanProfileId]).toString()
    window.open(url, '_blank')
  }

  ngOnDestroy(): void {
    // 3. Stop adaptive quality monitoring (synchronous)
    this.adaptiveQuality.stopMonitoring();

    // 4. Cancel canvas pipeline (synchronous)
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
    // Watch the status doc of the cloud hosting THIS room (poll + event-push keep it fresh).
    const status$ = this.provider === "oci" ? this.infraService.getOciStatus() : this.infraService.getStatus();
    status$.pipe(takeUntil(this.serverSubscription)).subscribe({
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

      const isHardBlock = err.name === 'NotAllowedError' && err.message?.includes('Permission dismissed') === false;

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

    // Share DFN settings across participants (tile badges) for this room.
    this.dfnState.start(room);

    // Handle incoming remote tracks
    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        // Remember the participant's camera track so the jitter controller can lip-sync it.
        if (track.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
          this.remoteVideoTracks.set(participant.identity, track);
        }

        // Adaptive jitter buffer on each remote audio track (exact videoconference port).
        // Pass a live getter for this participant's camera track so video is held to the
        // same playout delay as audio → lip-synced (camera may subscribe before/after audio).
        if (track.kind === Track.Kind.Audio) {
          this.jitterStops.set(
            publication.trackSid,
            startJitterController(track, () => this.remoteVideoTracks.get(participant.identity))
          );
        }

        // A4: Screen share subscription quality based on CPU/network at subscription time
        if (track.kind === Track.Kind.Video && publication.source === Track.Source.ScreenShare) {
          const cpu = this.adaptiveQuality.cpuPressure();
          const net = this.localNetworkQuality();
          const screenQuality =
          cpu === 'critical' || net === ConnectionQuality.Lost ? VideoQuality.LOW :
          cpu === 'serious' || net === ConnectionQuality.Poor ? VideoQuality.MEDIUM : VideoQuality.HIGH; // good conditions → full quality for spotlight view
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

        this.resolvePipSource(); // new remote video / screen share may change the PiP source
        console.log('Tracked', this.remoteParticipants());
      }
    );

    // Handle remote track removal
    room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        const stop = this.jitterStops.get(publication.trackSid);
        if (stop) { stop(); this.jitterStops.delete(publication.trackSid); }

        if (track.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
          this.remoteVideoTracks.delete(participant.identity);
        }

        this.remoteParticipants.update((prev) => {
          const next = new Map(prev);
          next.delete(publication.trackSid);
          return next;
        });

        this.resolvePipSource(); // a departed track may change the PiP source
        console.log('UnTracked', this.remoteParticipants());
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

        if (quality === ConnectionQuality.Lost && participant.identity !== room.localParticipant.identity) {
          this.resolvePipSource();
        }
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
      } else if (publication.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
        console.log('[pip] remote camera muted:', participant.identity);
        this.resolvePipSource();
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
      } else if (publication.kind === Track.Kind.Video && publication.source === Track.Source.Camera) {
        // Camera back on — PiP should switch from the name card back to live video.
        console.log('[pip] remote camera unmuted:', participant.identity);
        this.resolvePipSource();
      }
    });

    // Track Active Speakers
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      var speakerID = speakers.map(e => e.identity)

      console.log("Active Speakers:", speakerID);
      this.activeSpeakers.set(speakerID ?? []); // M1: signal update
      this.resolvePipSource(); // keep PiP on the current speaker
    });

    // Clean up state maps when a participant disconnects — prevents memory leak
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      const identity = participant.identity;
      this.remoteParticipantsQuality.update(prev => { const next = new Map(prev); next.delete(identity); return next; });
      this.remoteParticipantsMute.update(prev => { const next = new Map(prev); next.delete(identity); return next; });
      this.remoteVideoTracks.delete(identity);
      this.remoteParticipants.update(prev => {
        const next = new Map(prev);
        for (const [sid, info] of prev) {
          if (info.participantIdentity === identity) next.delete(sid);
        }
        return next;
      });
      if (this.lastActiveSpeaker === identity) this.lastActiveSpeaker = null;
      console.log('Participant disconnected, state cleaned:', identity);
      this.resolvePipSource(); // pick a new target
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

      // ── KOALA: Init BEFORE room.connect() so This captures mic, runs the noise suppression pipeline, and produces a clean MediaStreamTrack — all before the room handshake begins.
      // await this.picoKoalaService.init();
      // await this.picoKoalaService.start();

      // Connect to the LiveKit room
      // await ensures we wait until initial signaling is done
      await room.connect(response.url, response.token);
      this.meetingRoomStatus = "connected"
      this.localParticipantIdentity = room.localParticipant.identity;
      console.log('Room connected:', this.loggedinProfileid);

      // Enable camera with explicit simulcast publish options (not relying on publishDefaults alone).
      // getCameraConstraints() → capture resolution/fps; getPublishOptions() → VP8 simulcast layers.
      const cameraConstraints = this.adaptiveQuality.getCameraConstraints(initialTier);
      const publishOptions    = this.adaptiveQuality.getPublishOptions(initialTier);
      await room.localParticipant.setCameraEnabled(true, cameraConstraints, publishOptions);

      const videoTrack = room.localParticipant.videoTrackPublications.values().next().value?.track;
      this.localParticipant.set(videoTrack);

      // Start adaptive quality monitoring BEFORE blur so the baseline CPU reading
      // is taken before the blur processor adds its load (warm-up window prevents
      // premature downgrades during the first 15 seconds).
      this.adaptiveQuality.startMonitoring(room);

      // Publish the mic (LiveKit-managed), then apply the DeepFilterNet3 TrackProcessor —
      // the exact videoconference architecture. LiveKit owns the track lifecycle
      // (mute / device-switch), so no separate raw-stream handling needed.
      //
      // CAPTURE CONSTRAINTS — the fix (proven 2026-07-06): DFN must receive RAW mic audio.
      // Chrome's noiseSuppression + AGC pre-GATE the signal (measured: 12% of frames gated to
      // near-silence, 196 dB quiet-spread) before DFN sees it; DFN then chokes on the pre-gated
      // signal and deletes speech → the "choppy" voice. Feeding DFN raw audio (as captured by the
      // offline oracle) is clean. So when DFN is ON, capture with NS/EC/AGC OFF and let DFN be the
      // sole noise processor; when DFN is OFF, use Chrome's own processing for a clean bare mic.
      // These constraints must be set at CAPTURE — applyConstraints() on a live track is ignored
      // by Chrome for NS/EC/AGC.
      await room.localParticipant.setMicrophoneEnabled(true, {
        noiseSuppression: !this.dfnEnabled,
        echoCancellation: !this.dfnEnabled,
        autoGainControl: !this.dfnEnabled,
      });
      await this.applyDfnProcessor();
      this.logMicProcessingState('initial mic set');
      this.startDfnBroadcast();

      // Expose this component so the audio A/B test can be driven from the console:
      //   await __lk.audioDiag()
      // Both environment files ship production:true, so the old `!environment.production`
      // gate never fired and __lk was never attached (diag unreachable on every build).
      // Attach in non-prod OR opt-in via `?diag=1` (or `#diag`) on the URL — read-only stats,
      // safe to enable on the deployed test site for the choppiness A/B.
      if (typeof window !== 'undefined') {
        const optIn = /(?:[?&]diag=1)|(?:#diag)/.test(window.location.search + window.location.hash);
        this.diagEnabled = !environment.production || optIn;
        if (this.diagEnabled) {
          (window as any).__lk = this;
          console.log('%c[diag] ready — run: await __lk.audioDiag()', 'color:#4caf50;font-weight:bold');
        }
      }

      // Populate device menus now that permissions are granted (labels are only exposed
      // after getUserMedia succeeds) and keep them fresh as devices are plugged/unplugged.
      await this.refreshDevices();
      this.deviceChangeHandler = () => void this.refreshDevices();
      navigator.mediaDevices?.addEventListener?.('devicechange', this.deviceChangeHandler);

      // Default to the built-in system mic on join (not the OS default, which may be a
      // Bluetooth headset in HFP mode → low-quality/choppy). Only switch if it isn't already.
      // Label patterns: macOS "MacBook Pro Microphone (Built-in)"; Windows laptops expose
      // the internal mic as "Microphone Array (…)".
      const builtInMic = this.mics.find(m => /built[\s-]?in|internal|macbook|microphone array/i.test(m.label));
      if (builtInMic && builtInMic.deviceId !== this.selectedMicId) {
        await this.selectMic(builtInMic.deviceId);
      }

      // Prime the PiP source and arm auto-PiP.
      this.setupAutoPip();
      this.resolvePipSource();

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
            participantId,
            provider: this.provider
          })
        );
      } catch (error: any) {
        if (error.status === 503 && error.error?.code === 'SCALING_IN_PROGRESS') {
          retryCount++;
          // Surface the server's actual reason (differs per provider/failure: AWS capacity
          // gate vs "Media node not ready") instead of a blanket capacity message.
          const serverMessage = error.error?.message || 'System at capacity';
          if (retryCount > 3) throw new Error(serverMessage);

          const wait = error.error?.retryAfter || 60;
          console.log(`Token 503 (${this.provider}): ${serverMessage} — retry in ${wait}s`);
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
    this.clearPip();

    const currentRoom = this.room();
    // Remove all listeners BEFORE disconnect so RoomEvent.Disconnected doesn't re-trigger leaveRoom
    currentRoom?.removeAllListeners();
    await currentRoom?.disconnect();

    // Tear down DFN: broadcast timer, jitter controllers, processor, shared state.
    if (this.dfnBroadcastTimer) { clearInterval(this.dfnBroadcastTimer); this.dfnBroadcastTimer = null; }
    this.jitterStops.forEach(stop => stop());
    this.jitterStops.clear();
    this.remoteVideoTracks.clear();
    this.lastActiveSpeaker = null;
    if (this.pipVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.pipVisibilityHandler);
      this.pipVisibilityHandler = null;
    }
    if (this.deviceChangeHandler) {
      navigator.mediaDevices?.removeEventListener?.('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
    try { (this.dfnProc as any)?.destroy?.(); } catch (_) {}
    this.dfnProc = null;
    this.dfnState.stop();

    // Reset all variables
    this.room.set(undefined);
    this.localParticipant.set(undefined);
    this.remoteParticipants.set(new Map());
    this.remoteParticipantsQuality.set(new Map());
    this.remoteParticipantsMute.set(new Map());
    // this.activeSpeakers = []; // M1: was plain array
    this.activeSpeakers.set([]); // M1: signal reset
    this.localParticipantIdentity = '';
    // Reset blur to OFF on leave — matches the class default ('none') and the DFN reference,
    // which runs no video blur. Background blur (per-frame segmentation) competes for CPU with
    // the single-threaded DeepFilterNet3 AudioWorklet; auto-forcing 'high' here silently starved
    // the DFN worklet on rejoin → choppy audio. Blur stays a manual, opt-in choice (blur menu).
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
      return Array.from(room.localParticipant.audioTrackPublications.values()).find(pub => pub.source === source);
    } else {
      return Array.from(room.localParticipant.videoTrackPublications.values()).find(pub => pub.source === source);
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

  /**
   * DIAGNOSTIC (validation phase): whenever the mic input is set or changed, report whether
   * the captured signal is RAW or already PROCESSED. "Processed" here = the browser reports
   * NS/EC/AGC active on the track (`getSettings()`), which includes the Bluetooth-HFP case
   * where the device forces its own noise cancellation and the browser reflects NS=true.
   * NOTE: purely on-device/system DSP the browser doesn't know about (e.g. AirPods onboard NC,
   * macOS Voice Isolation) is invisible to this API and will still read as RAW.
   */
  private logMicProcessingState(context: string): void {
    try {
      const micTrack = this.getLocalTrackPublication(Track.Source.Microphone)?.audioTrack as LocalAudioTrack | undefined;
      const mst = micTrack?.mediaStreamTrack;
      if (!mst) { console.warn(`[mic-check] (${context}) no local mic track yet`); return; }
      const s = (mst.getSettings() as any) ?? {};
      const processed = s.noiseSuppression === true || s.echoCancellation === true || s.autoGainControl === true;
      console.log(
        `%c[mic-check] (${context}) "${mst.label}" → ${processed ? 'PROCESSED (browser-level NS/EC/AGC active)' : 'RAW'}`,
        `font-weight:bold;color:${processed ? '#ff9800' : '#4caf50'}`,
        {
          noiseSuppression: s.noiseSuppression,
          echoCancellation: s.echoCancellation,
          autoGainControl: s.autoGainControl,
          voiceIsolation: s.voiceIsolation,
          sampleRate: s.sampleRate,
          dfnEnabled: this.dfnEnabled,
        },
      );
    } catch (e) { console.warn(`[mic-check] (${context}) failed:`, e); }
  }

  // ── DeepFilterNet3 control methods (exact DfnControls.tsx behaviour) ─────────

  /** Apply or remove the DFN TrackProcessor on the local mic + set input constraints. */
  private async applyDfnProcessor(): Promise<void> {
    const micTrack = this.getLocalTrackPublication(Track.Source.Microphone)?.audioTrack as LocalAudioTrack | undefined;
    if (!micTrack) return;

    try {
      if (this.dfnEnabled) {
        if (!this.dfnProc) {
          if (!DeepFilterNoiseFilterProcessor.isSupported()) {
            console.warn('DeepFilterNet3 not supported on this browser');
            return;
          }
          // Clock-domain: force the mic track onto a 48 kHz AudioContext (no drift).
          try {
            const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
            const t = micTrack as any;
            if (AC && typeof t.setAudioContext === 'function' && t.audioContext?.sampleRate !== 48000) {
              t.setAudioContext(new AC({ sampleRate: 48000 }));
            }
          } catch (_) {}
          const proc = new DeepFilterNoiseFilterProcessor({
            sampleRate: 48000,
            noiseReductionLevel: this.dfnAtten,
            enabled: true,
            makeupGain: this.dfnEffNorm,
            gateEnabled: this.dfnGateOn,
            gateThresholdDb: this.dfnGateDb,
            assetConfig: { cdnUrl: '/assets/df3' },
          });
          this.dfnProc = proc;
          await micTrack.setProcessor(proc as any);
        }
      } else if (this.dfnProc) {
        this.dfnProc = null;
        await micTrack.stopProcessor();
      }

      // Input constraints: when DFN is ON keep the input RAW (all of Chrome's NS/EC/AGC +
      // voiceIsolation OFF) so DFN is the sole noise processor and never sees pre-gated audio;
      // when OFF, enable Chrome's own NS/EC/AGC + voiceIsolation for a clean bare mic.
      // NOTE: NS/EC/AGC are honoured at CAPTURE (setMicrophoneEnabled above) — Chrome ignores them
      // via applyConstraints on a live track. This call still carries voiceIsolation, and keeps the
      // toggle state coherent; the reliable switch is the capture constraints on (re)publish.
      try {
        const mst = micTrack.mediaStreamTrack;
        if (mst) {
          // Core raw constraints only — NO voiceIsolation (non-standard; it throws
          // OverconstrainedError on devices like the MacBook mic that CAN still do raw,
          // which wrongly looked like "can't do raw" and disabled DFN).
          const constraints = this.dfnEnabled
            ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
          await mst.applyConstraints(constraints as unknown as MediaTrackConstraints);
        }
      } catch (ce: any) {
        // Diagnostic-only for now: DFN is NO LONGER auto-disabled when a device can't provide
        // raw audio (the old Bluetooth-HFP guard). We first want to observe, per device, whether
        // the input is actually raw or processed — see logMicProcessingState() — and decide the
        // policy from that evidence.
        console.warn('[dfn] applyConstraints failed (keeping DFN):', String(ce?.constraint || '') || ce?.name, ce?.message);
      }
    } catch (e) {
      console.error('DFN control error', e);
    }
  }

  /** Broadcast this participant's DFN settings so peers can badge the tile (every 3 s). */
  private broadcastDfn(): void {
    const room = this.room();
    if (!room) return;
    const id = room.localParticipant?.identity;
    const info = { dfn: this.dfnEnabled, atten: this.dfnAtten, norm: this.dfnEffNorm };
    if (id) this.dfnState.update(id, info);
    if (!id) return;
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'dfn', ...info })),
        { reliable: true },
      );
    } catch (_) {}
  }

  private startDfnBroadcast(): void {
    this.broadcastDfn();
    this.dfnBroadcastTimer = setInterval(() => this.broadcastDfn(), 3000);
  }

  /**
   * Noise-cancellation mode (the Audio-menu two options):
   *  'builtin' — browser/inbuilt noise + echo cancellation + AGC, DFN off.
   *  'dfn'     — DeepFilterNet3 on RAW capture (all inbuilt processing off), as designed.
   * NS/EC/AGC are only honoured at CAPTURE (Chrome ignores applyConstraints on a live track —
   * proven 2026-07-06), so flipping the mode mid-call must re-acquire the mic via
   * restartTrack. deviceId must be included: restart() drops the other audio constraints
   * when no deviceId is present.
   */
  async setNcMode(mode: 'builtin' | 'dfn'): Promise<void> {
    const wantDfn = mode === 'dfn';
    if (wantDfn === this.dfnEnabled) return;
    this.dfnEnabled = wantDfn;

    const micTrack = this.getLocalTrackPublication(Track.Source.Microphone)?.audioTrack as LocalAudioTrack | undefined;
    if (micTrack) {
      // Going to built-in: detach DFN BEFORE the capture restart.
      if (!wantDfn && this.dfnProc) {
        this.dfnProc = null;
        try { await micTrack.stopProcessor(); } catch (_) {}
      }
      const deviceId = this.selectedMicId || micTrack.mediaStreamTrack?.getSettings?.()?.deviceId || undefined;
      try {
        await micTrack.restartTrack({
          deviceId,
          echoCancellation: !wantDfn,
          noiseSuppression: !wantDfn,
          autoGainControl: !wantDfn,
        });
      } catch (e) { console.warn('[nc] mic capture restart failed:', e); }
      // Going to DFN: attach the processor to the fresh raw track.
      this.dfnProc = null;
      await this.applyDfnProcessor();
    }

    this.logMicProcessingState(`nc mode → ${mode}`);
    this.broadcastDfn();
  }

  /** Master DFN on/off (diag NR-Tune panel) — routes through the same mode switch. */
  async toggleDfn(): Promise<void> {
    await this.setNcMode(this.dfnEnabled ? 'builtin' : 'dfn');
  }

  onDfnAttenChange(v: number): void {
    this.dfnAtten = v;
    try { this.dfnProc?.setSuppressionLevel(v); } catch (_) {}
    this.broadcastDfn();
  }

  onDfnNormOnChange(on: boolean): void {
    this.dfnNormOn = on;
    try { this.dfnProc?.setMakeupGain(this.dfnEffNorm); } catch (_) {}
    this.broadcastDfn();
  }

  onDfnNormChange(v: number): void {
    this.dfnNorm = v;
    try { this.dfnProc?.setMakeupGain(this.dfnEffNorm); } catch (_) {}
    this.broadcastDfn();
  }

  onDfnGateOnChange(on: boolean): void {
    this.dfnGateOn = on;
    try { this.dfnProc?.setGateEnabled(on); } catch (_) {}
  }

  onDfnGateDbChange(v: number): void {
    this.dfnGateDb = v;
    try { this.dfnProc?.setGateThreshold(v); } catch (_) {}
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
    if (!room || room.state !== 'connected') return;
    try {
      const isCurrentlyEnabled = room.localParticipant.isCameraEnabled;

      if (isCurrentlyEnabled) {
        await room.localParticipant.setCameraEnabled(false);
        console.log('📷 Camera disabled');
      } else {
        const cameraConstraints = this.adaptiveQuality.getCameraConstraints(this.adaptiveQuality.currentTier());
        const publishOptions    = this.adaptiveQuality.getPublishOptions(this.adaptiveQuality.currentTier());
        await room.localParticipant.setCameraEnabled(true, cameraConstraints, publishOptions);

        if (this.blurLevel !== 'none') {
          await this.applyBlur(this.blurLevel);
        }

        console.log('📷 Camera enabled');
      }
    } catch (e: any) {
      console.warn('[toggleCamera] failed:', e?.name, e?.message);
    }
  }

  isScreenSharing(): boolean {
    const screenSharePub = this.getLocalTrackPublication(Track.Source.ScreenShare);
    return screenSharePub !== undefined && !screenSharePub.isMuted;
  }

  isAnyoneScreenSharing(): boolean {
    return this.returnRemoteParticipantTrack().some(track => track.trackPublication.source === Track.Source.ScreenShare);
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
    const remoteScreenShare = this.returnRemoteParticipantTrack().find(
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

  // ── Picture-in-Picture (auto on tab switch) ───────────────────────────────

  /** identity → display name for remote participants (from the tracked publications). */
  private remoteNames(): Map<string, string> {
    const m = new Map<string, string>();
    this.remoteParticipants().forEach(v => { if (!m.has(v.participantIdentity)) m.set(v.participantIdentity, v.participantName); });
    return m;
  }

  /** Arm automatic Picture-in-Picture. Chrome fires the mediaSession 'enterpictureinpicture'
   *  action when the user leaves a tab that has active camera/mic + a registered handler —
   *  the documented conferencing auto-PiP path (the bare attribute alone is unreliable). */
  private setupAutoPip(): void {
    const el = this.pipVideo?.nativeElement;
    if (!el) return;
    (el as any).autoPictureInPicture = true;
    el.disablePictureInPicture = false;

    // ── Auto-PiP eligibility snapshot (diagnosis step 1) ──────────────────────
    // Logs every capability Chrome needs for automatic PiP on tab switch, so a failed
    // auto-pop can be pinned to the exact missing prerequisite from the console alone.
    const chromeVer = (navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/) || [])[1] ?? null;
    console.log('%c[pip] eligibility snapshot', 'font-weight:bold;color:#03a9f4', {
      browser: navigator.userAgent,
      chromeMajorVersion: chromeVer,
      chromeAutoPipViaMediaSession: chromeVer ? (Number(chromeVer) >= 134 ? 'YES (>=134)' : `NO (Chrome ${chromeVer} < 134)`) : 'not Chrome',
      pictureInPictureEnabled: (document as any).pictureInPictureEnabled ?? false,
      requestPictureInPicture: 'requestPictureInPicture' in HTMLVideoElement.prototype,
      autoPictureInPictureAttr: 'autoPictureInPicture' in HTMLVideoElement.prototype,
      mediaSession: 'mediaSession' in navigator,
      documentPiP: 'documentPictureInPicture' in window,
      isInstalledPwa: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    });

    el.addEventListener('enterpictureinpicture', () => { this.pipEnabled = true; console.log('[pip] entered'); });
    el.addEventListener('leavepictureinpicture', () => { this.pipEnabled = false; console.log('[pip] left'); });

    // Belt-and-suspenders auto-PiP. mediaSession action = the "official" hook; the
    // visibilitychange handler = the one that actually fires reliably, because Chrome permits
    // requestPictureInPicture without a fresh gesture WHILE the tab is capturing camera/mic.
    if ('mediaSession' in navigator && 'setActionHandler' in navigator.mediaSession) {
      try {
        // Chrome's auto-PiP eligibility wants an ACTIVE media session, not just a registered
        // handler. Metadata + playbackState is what marks the session active (the remote
        // <audio> elements provide the audible playback that anchors it).
        try {
          (navigator.mediaSession as any).metadata = new MediaMetadata({
            title: 'Live meeting',
            artist: 'StarLabs',
          });
        } catch (me) { console.warn('[pip] MediaMetadata failed:', me); }
        (navigator.mediaSession as any).playbackState = 'playing';
        navigator.mediaSession.setActionHandler('enterpictureinpicture' as any, () => {
          console.log('[pip] mediaSession enterpictureinpicture FIRED');
          this.enterPipAuto();
        });
        console.log('[pip] armed A: mediaSession enterpictureinpicture handler registered');
      } catch (e) {
        console.warn('[pip] armed A FAILED: enterpictureinpicture action unsupported by this browser', e);
      }
    } else {
      console.warn('[pip] armed A FAILED: no mediaSession API');
    }

    // NOTE: we do NOT call requestPictureInPicture() from visibilitychange — Chrome rejects it
    // without a user gesture (confirmed: NotAllowedError). The only gesture-free auto-enter paths
    // are (A) the mediaSession enterpictureinpicture action above, or the autoPictureInPicture
    // attribute — both Chrome-internal. This listener only EXITS PiP when returning to the tab.
    // Persistent PiP: once the user turns PiP on (togglePip), it stays on across tab switches AND
    // while the tab is focused, until they turn it off or leave the call. We deliberately do NOT
    // exit on return — re-entering later would need a fresh user gesture Chrome will not grant on
    // a tab switch (confirmed: NotAllowedError). Chrome's own auto-action (armed above) may
    // additionally open PiP on tab-hide where it's eligible (installed PWA / production origin).
    this.pipVisibilityHandler = () => {
      if (!document.hidden) return;
      console.log('[pip] tab hidden', { pipOn: this.pipEnabled, inPip: !!(document as any).pictureInPictureElement, hasSource: !!el.srcObject });
    };
    document.addEventListener('visibilitychange', this.pipVisibilityHandler);
  }

  private async waitForPipMetadata(el: HTMLVideoElement, timeoutMs = 2000): Promise<boolean> {
    if (el.readyState >= 1) return true;
    return new Promise<boolean>(resolve => {
      let done = false;
      const onReady = () => {
        if (done) return;
        done = true;
        el.removeEventListener('loadedmetadata', onReady);
        resolve(true);
      };
      el.addEventListener('loadedmetadata', onReady, { once: true });
      setTimeout(() => {
        if (done) return;
        done = true;
        el.removeEventListener('loadedmetadata', onReady);
        resolve(el.readyState >= 1);
      }, timeoutMs);
    });
  }

  /** Attempt to enter PiP automatically (on tab hide). No-op if already in PiP or no source. */
  private async enterPipAuto(): Promise<void> {
    const el = this.pipVideo?.nativeElement;
    if (!el || (document as any).pictureInPictureElement) return;
    this.resolvePipSource();                            // refresh to the best current source (remote, name card, or our own screen share)
    if (!el.srcObject) { console.log('[pip] auto skipped — no source to show'); return; }
    try {
      await el.play().catch(() => {});
      const ready = await this.waitForPipMetadata(el);
      if (!ready) { console.log('[pip] auto skipped — metadata never loaded'); return; }
      await (el as any).requestPictureInPicture();
      console.log('[pip] entered (auto)');
    } catch (e: any) {
      console.warn('[pip] auto request failed:', e?.name, e?.message);
    }
  }

  /** Manual PiP toggle (from the Video menu) — a real user gesture, so requestPictureInPicture
   *  is always allowed. Also the reliable way to verify PiP works regardless of auto-PiP. */
  async togglePip(): Promise<void> {
    const el = this.pipVideo?.nativeElement;
    if (!el) return;
    if (!('requestPictureInPicture' in HTMLVideoElement.prototype)) {
      alert('Picture-in-Picture is not supported in this browser (use Chrome, Edge, or Safari).');
      return;
    }
    try {
      if ((document as any).pictureInPictureElement) {
        this.pipEnabled = false;
        await (document as any).exitPictureInPicture();
        return;
      }
      // Prefer the active remote; if alone, pop out your OWN video so PiP still works.
      this.resolvePipSource();
      if (!el.srcObject) {
        const localTrack = this.localParticipant();
        if (localTrack) this.setPipTrack(localTrack);
      }
      if (!el.srcObject) { alert('No video available to show in Picture-in-Picture. Turn your camera on or wait for a participant.'); return; }
      // Safari: transient user activation does NOT survive awaits — request PiP in the
      // same task as the click when frames are already there (the normal case, since the
      // pip video plays continuously). Only fall back to waiting when data isn't ready.
      el.play().catch(() => {});
      const ready = await this.waitForPipMetadata(el);
      if (!ready) {
        alert('Video is still loading — please try Picture-in-Picture again in a moment.');
        return;
      }
      await (el as any).requestPictureInPicture();
      this.pipEnabled = true;
      console.log('[pip] entered (manual)');
    } catch (e: any) {
      console.warn('[pip] manual request failed:', e?.name, e?.message);
      alert('Could not open Picture-in-Picture: ' + (e?.message || e?.name || 'unknown error'));
    }
  }

  // reported this participant's connection as Lost.
  private isRemoteConnectionLost(identity: string): boolean {
    return this.remoteParticipantsQuality().get(identity) === ConnectionQuality.Lost;
  }


  // True if the given remote participant's camera publication is currently muted (camera off).
  private isRemoteCameraMuted(identity: string): boolean {
    const pub = this.returnRemoteParticipantTrack().find(
      t => t.participantIdentity === identity && t.trackPublication.source === Track.Source.Camera
    );
    return pub?.trackPublication.isMuted ?? true; // no publication at all = treat as not-live
  }

  /** Choose what the PiP window shows and attach it. Safe to call on any relevant change. */
  private resolvePipSource(): void {
    const el = this.pipVideo?.nativeElement;
    if (!el) return;

    // 1. A REMOTE screen share wins (scenario 4).
    const share = this.getActiveScreenShare();
    if (share && !share.isLocal && share.track) {
      this.setPipTrack(share.track);
      return;
    }

    // 2. Active speaker, remote only, holding the last one when nobody is talking (scenario 3).
    const speaking = this.activeSpeakers().filter(id => id !== this.localParticipantIdentity);
    if (speaking[0]) this.lastActiveSpeaker = speaking[0];

    const names = this.remoteNames();
    let target = this.lastActiveSpeaker && names.has(this.lastActiveSpeaker) ? this.lastActiveSpeaker : null;
    if (target && this.isRemoteConnectionLost(target)) {
      // Don't keep PiP pinned to a speaker whose connection just dropped — look for someone else.
      target = null;
    }
    if (!target) {
      // Prefer a remote whose connection isn't already reported Lost; fall back to any remote.
      target = Array.from(names.keys()).find(id => !this.isRemoteConnectionLost(id)) ?? names.keys().next().value ?? null;
    }
    if (!target) {
      // No remote yet — keep PiP meaningful (never clearPip() here: that would close a PiP the
      // user deliberately enabled). Priority: our own screen share → our own camera → a card.
      const localShareTrack = share && share.isLocal ? share.track : null;
      const localCam = this.localParticipant();
      if (localShareTrack) this.setPipTrack(localShareTrack);
      else if (localCam && (localCam as any).mediaStreamTrack?.readyState === 'live') this.setPipTrack(localCam);
      else this.setPipStream(this.nameCardStream('Waiting for others…'));
      return;
    }

    const camTrack = this.remoteVideoTracks.get(target);
    const muted = this.isRemoteCameraMuted(target);
    const lost = this.isRemoteConnectionLost(target);
    console.log('[pip] resolve →', { target, hasCamTrack: !!camTrack, muted, lost });
    if (camTrack && !muted && !lost) {
      this.setPipTrack(camTrack);
    } else if (lost) {
      // Connection reported Lost — show a transitional card instead of freezing on the last
      this.setPipStream(this.nameCardStream(`${names.get(target) || target} — reconnecting…`));
    } else {
      // Camera off → show a name card, same idea as the grid placeholder (scenario 5).
      this.setPipStream(this.nameCardStream(names.get(target) || target));
    }
  }

  private setPipTrack(track: RemoteTrack | LocalVideoTrack): void {
    const el = this.pipVideo?.nativeElement;
    if (!el) return;
    if (this.pipAttachedTrack === track && el.srcObject) return;

    if (this.pipAttachedTrack) {
      try { this.pipAttachedTrack.detach(el); } catch (_) {}
    }
    this.pipAttachedTrack = track;
    el.srcObject = null;

    track.attach(el); // builds a fresh stream + registers the element with LiveKit
    el.muted = true;
    (el as any).autoPictureInPicture = true;
    el.play().catch(err => { if (err?.name !== 'AbortError') console.warn('[pip] play failed:', err?.name, err?.message); });
  }

  /** Attach a stream to the hidden PiP video (muted — audio plays via the normal elements). */
    private setPipStream(stream: MediaStream): void {
    const el = this.pipVideo?.nativeElement;
    if (!el) return;

    if (this.pipAttachedTrack) {
      try { this.pipAttachedTrack.detach(el); } catch (_) {}
      this.pipAttachedTrack = null;
    }

    const current = el.srcObject as MediaStream | null;
    const same = current && current.getVideoTracks()[0]?.id === stream.getVideoTracks()[0]?.id;
    if (!same) {
      el.srcObject = stream;
      el.muted = true;
      (el as any).autoPictureInPicture = true;
      el.play().catch(err => { if (err?.name !== 'AbortError') console.warn('[pip] play failed:', err?.name, err?.message); });
    }
  }

  /** Render a participant's initials/name onto a canvas and return it as a video stream. */
  private nameCardStream(name: string): MediaStream {
    if (this.pipNameCardCache && this.pipNameCardCache.name === name) return this.pipNameCardCache.stream;
    if (!this.pipCanvas) {
      this.pipCanvas = document.createElement('canvas');
      this.pipCanvas.width = 320; this.pipCanvas.height = 180;
    }
    const c = this.pipCanvas, ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, c.width, c.height);
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(c.width / 2, 70, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initial, c.width / 2, 70);
    ctx.font = '16px sans-serif'; ctx.fillText(name, c.width / 2, 140);
    // 15 fps (not 1) so the first frame lands promptly — enterPipAuto()/togglePip() wait for it
    // before requestPictureInPicture(), and a slow first frame would stall or reject the request.
    const stream = (c as any).captureStream(15);
    this.pipNameCardCache = { name, stream };
    return stream;
  }

  private clearPip(): void {
    try {
      if ((document as any).pictureInPictureElement) {
        (document as any).exitPictureInPicture?.();
      }
    } catch {}

    const el = this.pipVideo?.nativeElement;
    if (el) {
      if (this.pipAttachedTrack) { try { this.pipAttachedTrack.detach(el); } catch (_) {} }
      el.srcObject = null;
    }
    this.pipAttachedTrack = null;
    this.pipEnabled = false;
    this.pipNameCardCache = null;
  }

  // ── Device selection (mic / speaker / camera) ─────────────────────────────

  /** Enumerate input/output devices and sync the current selections. */
  async refreshDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.mics     = devices.filter(d => d.kind === 'audioinput');
      this.cameras  = devices.filter(d => d.kind === 'videoinput');
      this.speakers = devices.filter(d => d.kind === 'audiooutput');

      const room = this.room();
      // Reflect what LiveKit currently has active (falls back to the first device's id).
      this.selectedMicId    = (room?.getActiveDevice?.('audioinput')  as string) || this.selectedMicId    || this.mics[0]?.deviceId    || '';
      this.selectedCameraId = (room?.getActiveDevice?.('videoinput')  as string) || this.selectedCameraId || this.cameras[0]?.deviceId || '';
      this.selectedSpeakerId= (room?.getActiveDevice?.('audiooutput') as string) || this.selectedSpeakerId || this.speakers[0]?.deviceId|| '';
    } catch (e) {
      console.warn('refreshDevices failed:', e);
    }
  }

  async selectMic(deviceId: string): Promise<void> {
    const room = this.room();
    if (!room || room.state !== 'connected') return;
    try {
      await room.switchActiveDevice('audioinput', deviceId);
      this.selectedMicId = deviceId;
      // switchActiveDevice creates a NEW mic track. dfnProc still references the OLD track's
      // processor, so applyDfnProcessor() would skip re-attaching → the new device (e.g. a
      // Bluetooth headset) would publish with Chrome's NS/AGC pre-gating and no DFN → choppy.
      // Drop the stale processor so applyDfnProcessor re-attaches DFN with RAW capture
      // (NS/EC/AGC off) to the new track. This is what guarantees raw input on device switch.
      this.dfnProc = null;
      await this.applyDfnProcessor();
      this.logMicProcessingState('mic changed');
    } catch (e) { console.warn('selectMic failed:', e); }
  }

  async selectCamera(deviceId: string): Promise<void> {
    try { await this.room()?.switchActiveDevice('videoinput', deviceId); this.selectedCameraId = deviceId; }
    catch (e) { console.warn('selectCamera failed:', e); }
  }

  async selectSpeaker(deviceId: string): Promise<void> {
    this.selectedSpeakerId = deviceId;

    // LiveKit path — stores room.options.audioOutput so tracks subscribed LATER inherit the
    // sink, and applies setSinkId to the elements it has in its bookkeeping. (audiooutput
    // switching uses setSinkId — Chrome/Edge; Safari neither lists outputs nor supports it.)
    try { await this.room()?.switchActiveDevice('audiooutput', deviceId); }
    catch (e) { console.warn('[speaker] switchActiveDevice failed:', e); }

    // Direct path — the LiveKit path alone was observed NOT to change the output device in
    // Chrome, so guarantee every rendered <audio> element follows, and log each element's
    // resulting sinkId as evidence.
    const els = Array.from(document.querySelectorAll('audio')) as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void>; sinkId?: string })[];
    await Promise.all(els.map(async el => {
      if (typeof el.setSinkId !== 'function') { console.warn('[speaker] setSinkId unsupported on this browser'); return; }
      try { await el.setSinkId(deviceId); }
      catch (e) { console.warn(`[speaker] element "${el.id || '?'}" setSinkId failed:`, e); }
    }));
    const label = this.speakers.find(s => s.deviceId === deviceId)?.label || deviceId;
    console.log(`[speaker] output → "${label}"`, els.map(el => ({ element: el.id || '?', sinkId: el.sinkId })));
  }

  async startScreenShare() {
    const room = this.room();
    if (!room || room.state !== 'connected') return;
    try {
    // C2: Screen share resolution + encoding based on current network/CPU tier.
    // Publishing full-HD on a low-tier connection saturates uplink → camera freeze + audio loss.
    const tier = this.adaptiveQuality.currentTier();

    // Map tier to ScreenSharePresets (official LiveKit presets with encoding config)
    var screenPreset: VideoPreset

    if(tier === 'minimal' || tier === 'low'){
      screenPreset = ScreenSharePresets.h720fps5 // ~400 kbps budget
    }
    else if(tier === 'medium'){
      screenPreset = ScreenSharePresets.h720fps15    // ~1 Mbps budget
    }
    else{
      screenPreset = ScreenSharePresets.h1080fps15;  // ~2.5 Mbps budget
    }

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

      // Browser-native "Stop sharing" (the Chrome bar / OS control) ends the capture track
      // WITHOUT going through our stopScreenShare(), so isLocalScreenSharing stayed true and
      // the layout froze on a blank screen-share box. Listen for the track's own end and run
      // the same cleanup — the local equivalent of the remote TrackUnsubscribed handler.
      track.mediaStreamTrack.addEventListener('ended', () => {
        console.log("Screen share track ended (browser stop) — resetting layout");
        this.stopScreenShare();
      });
    }
    console.log("Screen sharing started");
    this.isLocalScreenSharing.set(true);
    this.resolvePipSource();
    } catch (e: any) {
      console.warn('[startScreenShare] failed:', e?.name, e?.message);
    }
  }

  stopScreenShare() {
    const pub = this.getLocalTrackPublication(Track.Source.ScreenShare);
    if (pub) {
      this.room()?.localParticipant.unpublishTrack(pub.track!);
      pub.track?.stop();
      console.log("Screen sharing stopped");
    }
    // Always reset the flag (even if the publication is already gone from a browser-native
    // stop) so the layout leaves screen-share mode. Idempotent — safe to call twice.
    this.isLocalScreenSharing.set(false);
    this.resolvePipSource();
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
        this.httpClient.post(url, { roomId, provider: this.provider })
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
          this.httpClient.post(url, { egressId: egressId, roomId: this.roomDetail.roomId, provider: this.provider })
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
    const fsEl = document.fullscreenElement as HTMLElement | null;
    this.isFullscreen = !!fsEl;
    // CDK menu/overlay panels render in `.cdk-overlay-container` appended to <body>, which is
    // OUTSIDE a fullscreened sub-element — so mat-menus (audio/video/end-call) were invisible
    // and unclickable in fullscreen. Relocate the overlay container INTO the fullscreen element
    // while fullscreen, and back to <body> on exit. This is the real fix (not disabling menus).
    const overlay = document.querySelector('.cdk-overlay-container') as HTMLElement | null;
    if (!overlay) return;
    if (fsEl) fsEl.appendChild(overlay);
    else document.body.appendChild(overlay);
  }

  toggleFullscreen() {
    const elem = this.meetingContainer.nativeElement;

    if (!document.fullscreenElement) {
      elem.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    // isFullscreen is updated by onFullscreenChange (the authoritative event).
  }

  // Guard against overlapping blur operations (a 2nd click mid-apply stacked processors → freeze).
  private blurBusy = false;

  /** Apply background blur at a given level, or remove it. No-op if already at that level. */
  async applyBlur(level: 'none' | 'mid' | 'high') {
    if (level === this.blurLevel) return;   // ignore re-selecting the same option (was re-running)
    if (this.blurBusy) return;              // ignore clicks while a change is in flight
    this.blurBusy = true;

    const cameraPub = this.getLocalTrackPublication(Track.Source.Camera);
    if (!cameraPub || !cameraPub.videoTrack) {
      console.warn('⚠️ No camera track for blur');
      this.blurBusy = false;
      return;
    }
    const videoTrack = cameraPub.videoTrack;

    try {
      if (level === 'none') {
        if (this.cachedBlurProcessor) {
          await videoTrack.stopProcessor();
          this.cachedBlurProcessor = null;
          this.cachedBlurRadius = 0;
        }
        console.log('🔲 Blur removed');
      } else {
        const blurRadius = level === 'mid' ? 5 : 10;
        if (this.cachedBlurProcessor) {
          // REUSE the running pipeline — just change the radius. Creating a NEW processor +
          // setProcessor on every change stacked multiple segmentation pipelines (each running
          // per-frame ML), which starved the CPU → freeze on the 2nd/3rd apply. switchTo()
          // updates in place with no new pipeline.
          await this.cachedBlurProcessor.switchTo({ mode: 'background-blur', blurRadius });
          console.log(`🔲 Blur updated: ${level} (radius: ${blurRadius})`);
        } else {
          // First time: create once. SELF-HOSTED assets (root cause of the ORIGINAL freeze):
          // the page runs under COEP require-corp (coi-serviceworker), which blocks the
          // MediaPipe wasm/model if fetched from a CDN → setProcessor stalls. Serving them
          // same-origin (like DFN) makes it COEP-immune.
          const blur = BackgroundProcessor({
            mode: 'background-blur',
            blurRadius,
            assetPaths: {
              tasksVisionFileSet: '/assets/mediapipe/wasm',
              modelAssetPath: '/assets/mediapipe/selfie_segmenter.tflite',
            },
          });
          await videoTrack.setProcessor(blur);
          this.cachedBlurProcessor = blur;
          console.log(`🔲 Blur applied: ${level} (radius: ${blurRadius})`);
        }
        this.cachedBlurRadius = blurRadius;
      }
      this.blurLevel = level;
    } catch (error) {
      console.error('🔴 Blur error:', error);
    } finally {
      this.blurBusy = false;
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
    return  Array.from(this.remoteParticipants().values());
  }

  getVideoParticipantCount(): number {
    // M11: Count all video publications (camera AND screen share) — each is a distinct tile in the grid
    // Including screen share means the grid adapts correctly when someone shares (tiles get smaller,
    // which triggers adaptiveStream to request lower quality for the smaller camera tiles)
    // Previous code excluded screen share: remote.trackPublication.source !== Track.Source.ScreenShare
    const remoteVideoCount = this.returnRemoteParticipantTrack().filter(
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

  // ── PiP interaction methods ────────────────────────────────────────────

  pipDragPosition = { x: 0, y: 0 };
  private isDragging = false;

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
   * DEV audio diagnostic. Run from the browser console: `await __lk.audioDiag()`.
   * Samples WebRTC stats over `windowSec`, then prints:
   *  1. DFN status — whether the DeepFilterNet3 processor is actually attached to the mic.
   *  2. The selected ICE candidate pair — host/srflx = direct (good), relay = TURN fallback (breakup).
   *  3. Per remote stream: packet-loss %, jitter, and CONCEALMENT ms/s — the objective
   *     "audio breaking up" metric (decoder inventing samples for late/lost packets).
   * Use it for the recording A/B: run with recording OFF, then ON; if conceal/loss/jitter
   * jump when recording starts, the composite egress is starving the media node.
   */
  /** A/B knob for the audio-playout ceiling. `__lk.jitterMax(600)` restores the old value. */
  jitterMax(ms?: number): number {
    if (typeof ms === 'number') setJitterMax(ms);
    return getJitterMax();
  }

  async audioDiag(windowSec = 6): Promise<any> {
    const room = this.room();
    if (!room) { console.warn('[diag] not connected to a call'); return; }

    const micPub = this.getLocalTrackPublication(Track.Source.Microphone);
    const micTrack: any = micPub?.audioTrack;
    const dfn = {
      processorAttached: !!this.dfnProc,
      processorName: micTrack?.getProcessor?.()?.name ?? null,   // expect 'deepfilternet3-noise-filter'
      enabled: this.dfnEnabled,
      attenuation: this.dfnAtten,
      makeupGain: this.dfnEffNorm,
      gate: this.dfnGateOn ? `${this.dfnGateDb} dBFS` : 'off',
      micSampleRate: micTrack?.mediaStreamTrack?.getSettings?.()?.sampleRate ?? '?',
    };

    const readAudio = async (track: any) => {
      const out: any = { inbound: null, pair: null, cands: {} };
      const rep: RTCStatsReport | undefined = await track?.getRTCStatsReport?.();
      rep?.forEach((s: any) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') out.inbound = s;
        if (s.type === 'candidate-pair' && (s.nominated || s.state === 'succeeded')) out.pair = s;
        if (s.type === 'local-candidate' || s.type === 'remote-candidate') out.cands[s.id] = s;
      });
      return out;
    };

    const remoteAudio = this.returnRemoteParticipantTrack()
      .filter(t => t.trackPublication.kind === 'audio')
      .map(t => ({ id: t.participantName, track: (t.trackPublication as any).audioTrack }));

    const snap = async () => ({
      t: performance.now(),
      remotes: await Promise.all(remoteAudio.map(async r => ({ id: r.id, ...(await readAudio(r.track)) }))),
    });

    // Local uplink (publisher transport) — works even solo: candidate pair + outbound + SFU-reported uplink RTT/loss
    const readLocal = async () => {
      const out: any = { outbound: null, remoteInbound: null, pair: null, cands: {} };
      const rep: RTCStatsReport | undefined = await micTrack?.getRTCStatsReport?.();
      rep?.forEach((s: any) => {
        if (s.type === 'outbound-rtp' && s.kind === 'audio') out.outbound = s;
        if (s.type === 'remote-inbound-rtp' && s.kind === 'audio') out.remoteInbound = s;
        if (s.type === 'candidate-pair' && (s.nominated || s.state === 'succeeded')) out.pair = s;
        if (s.type === 'local-candidate' || s.type === 'remote-candidate') out.cands[s.id] = s;
      });
      return out;
    };

    const la = await readLocal();
    const a = await snap();
    await new Promise(r => setTimeout(r, windowSec * 1000));
    const b = await snap();
    const lb = await readLocal();
    const dt = (b.t - a.t) / 1000;

    const pairType = (s: any) => {
      if (!s?.pair) return 'unknown (no nominated pair)';
      const lc = s.cands[s.pair.localCandidateId];
      const rc = s.cands[s.pair.remoteCandidateId];
      return `${lc?.candidateType ?? '?'} ↔ ${rc?.candidateType ?? '?'}`;
    };

    const uplink = {
      'pair (uplink)': pairType(lb),
      'rtt ms': lb.remoteInbound?.roundTripTime != null ? (lb.remoteInbound.roundTripTime * 1000).toFixed(0) : '?',
      'uplink loss %': lb.remoteInbound?.fractionLost != null ? (lb.remoteInbound.fractionLost * 100).toFixed(2) : '?',
      'uplink jitter ms': lb.remoteInbound?.jitter != null ? (lb.remoteInbound.jitter * 1000).toFixed(1) : '?',
      'nacks': (lb.outbound?.nackCount ?? 0) - (la.outbound?.nackCount ?? 0),
      'pkts sent': (lb.outbound?.packetsSent ?? 0) - (la.outbound?.packetsSent ?? 0),
      'dtx active': lb.outbound?.packetsSent != null && la.outbound?.packetsSent != null
        ? (((lb.outbound.packetsSent - la.outbound.packetsSent) / dt) < 40 ? 'YES (silence-gated)' : 'no (~50pps)') : '?',
    };

    const rows: any[] = [];
    b.remotes.forEach((rb: any, idx: number) => {
      const i1 = rb.inbound, i0 = a.remotes[idx]?.inbound;
      if (!i1) return;
      const recvd = (i1.packetsReceived ?? 0) - (i0?.packetsReceived ?? 0);
      const lost  = (i1.packetsLost ?? 0) - (i0?.packetsLost ?? 0);
      const concealed = (i1.concealedSamples ?? 0) - (i0?.concealedSamples ?? 0);
      const lossPct = (recvd + lost) > 0 ? (100 * lost / (recvd + lost)) : 0;
      const concealMsPerS = (concealed / 48000) * 1000 / dt;
      rows.push({
        stream: `remote:${rb.id}`,
        'loss %': lossPct.toFixed(2),
        'jitter ms': ((i1.jitter ?? 0) * 1000).toFixed(1),
        'conceal ms/s': concealMsPerS.toFixed(1),
        'pair': pairType(rb),
      });
    });

    // Client-side load — correlate CPU pressure / blur with downlink conceal for the
    // blur-starvation A/B. DeepFilterNet3 runs single-threaded WASM in an AudioWorklet; if the
    // renderer is starved (heavy blur + simulcast) the worklet underruns → choppy DFN output.
    let cpuPressure: string = '?';
    try { cpuPressure = (this.adaptiveQuality as any)?.cpuPressure?.() ?? '?'; } catch (_) {}
    const client = {
      blurLevel: this.blurLevel,
      cpuPressure,
      hardwareConcurrency: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? '?') : '?',
      crossOriginIsolated: typeof window !== 'undefined' ? (window as any).crossOriginIsolated : '?',
    };

    // A/V SYNC A/B: the current audio playout delay per remote track. This is the extra lag
    // audio carries relative to video (lip-sync drift). Compare the OLD ceiling (600) vs the
    // NEW (300): run __lk.jitterMax(600), let it settle, audioDiag(); then __lk.jitterMax(300),
    // settle, audioDiag(). Audio should stay clean (conceal <15 ms/s) while playout — and thus
    // drift — roughly halves.
    const playout = { 'JB ceiling ms': getJitterMax(), 'live targets ms': Array.from(jitterTargets.values()) };

    console.log('%c[diag] DFN status', 'font-weight:bold;color:#4caf50', dfn);
    console.log('%c[diag] CLIENT load (blur/CPU — A/B blur off vs on)', 'font-weight:bold;color:#9c27b0', client);
    console.log('%c[diag] A/V SYNC (audio playout delay — lower = tighter lip-sync)', 'font-weight:bold;color:#e91e63', playout);
    console.log('%c[diag] UPLINK (this mic → SFU) — works solo', 'font-weight:bold;color:#2196f3');
    console.table([uplink]);
    console.log('%c[diag] DOWNLINK (remote talkers → you) — needs a second participant speaking', 'font-weight:bold;color:#ff9800');
    console.table(rows.length ? rows : [{ note: 'no remote audio streams — join a 2nd participant to measure downlink breakup' }]);
    console.log(`[diag] window ${dt.toFixed(1)}s · GOOD: conceal <15 ms/s, loss <1%, jitter <30 ms, rtt <120 ms, pair host/srflx (NOT relay)`);
    console.log('[diag] BAD breakup: conceal >50 ms/s, loss >2%, rtt >250 ms, or pair contains "relay"');
    console.log('[diag] A/B sync: __lk.jitterMax(600) vs __lk.jitterMax(300) — watch "live targets ms" fall while conceal stays low');
    return { dfn, client, playout, uplink, downlink: rows };
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
