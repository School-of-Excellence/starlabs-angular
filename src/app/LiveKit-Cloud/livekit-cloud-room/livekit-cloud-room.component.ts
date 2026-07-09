// import { PicoKoalaService } from './../../Service/PicoVoice Koala/pico-koala.service';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, computed, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, createLocalScreenTracks, LocalAudioTrack, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track, LocalTrackPublication, VideoQuality, ScreenSharePresets, VideoPreset } from 'livekit-client';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { ActivatedRoute } from '@angular/router';
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
// LiveKit-Cloud variant: noise filtering is Krisp (Cloud-only), handled by the standalone
// <app-krisp-controls> component. DFN is intentionally NOT used here (no COEP/SAB needed).
// DfnState (tile badges) + jitter controller are generic and reused from the LiveKit folder.
import { DfnStateService } from '../../LiveKit/dfn/dfn-state.service';
import { startJitterController } from '../../LiveKit/dfn/jitter-buffer';
import { KrispControlsComponent } from '../krisp/krisp-controls.component';

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
  selector: 'app-livekit-cloud-room',
  imports: [
    OpenviduVideoElementComponent,
    OpenviduAudioElementComponent,
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    CdkDrag,
    KrispControlsComponent
  ],
  templateUrl: './livekit-cloud-room.component.html',
  styleUrl: './livekit-cloud-room.component.css'
})
export class LivekitCloudRoomComponent implements AfterViewInit, OnDestroy {

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

  // Server Subscription
  serverSubscription = new Subject<void>();

  // UI States
  loading = true;
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

  // ── Audio: noise filtering is Krisp, owned by <app-krisp-controls> (see template).
  //    Only the generic per-track jitter controllers live here (reused from the LiveKit port).
  private jitterStops = new Map<string, () => void>();
  // Cache active blur processor — avoids recreating the canvas pipeline on every camera re-enable
  private cachedBlurProcessor: any = null;
  private cachedBlurRadius: number = 0;

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
    // LiveKit Cloud is fully managed and always available — there is NO AWS master/media node to
    // poll (that's the self-hosted flow). Skip the infrastructure health check and go straight to
    // requesting devices / preparing the participant.
    this.prepareParticipant();
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
        // Adaptive jitter buffer on each remote audio track (exact videoconference port).
        if (track.kind === Track.Kind.Audio) {
          this.jitterStops.set(publication.trackSid, startJitterController(track));
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

        console.log('Tracked', this.remoteParticipants());
      }
    );

    // Handle remote track removal
    room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        const stop = this.jitterStops.get(publication.trackSid);
        if (stop) { stop(); this.jitterStops.delete(publication.trackSid); }

        this.remoteParticipants.update((prev) => {
          const next = new Map(prev);
          next.delete(publication.trackSid);
          return next;
        });

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

      // Publish the mic (LiveKit-managed) with the browser's default DSP. The noise filter
      // (Off / Native / Krisp) is applied by <app-krisp-controls>, which attaches the Krisp
      // TrackProcessor to this published mic track and manages device-switch re-enable.
      await room.localParticipant.setMicrophoneEnabled(true, {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      });

      // Expose this component so the audio A/B test can be driven from the console:
      //   await __lk.audioDiag()
      // Both environment files ship production:true, so the old `!environment.production`
      // gate never fired and __lk was never attached (diag unreachable on every build).
      // Attach in non-prod OR opt-in via `?diag=1` (or `#diag`) on the URL — read-only stats,
      // safe to enable on the deployed test site for the choppiness A/B.
      if (typeof window !== 'undefined') {
        const optIn = /(?:[?&]diag=1)|(?:#diag)/.test(window.location.search + window.location.hash);
        if (!environment.production || optIn) {
          (window as any).__lk = this;
          console.log('%c[diag] ready — run: await __lk.audioDiag()', 'color:#4caf50;font-weight:bold');
        }
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
    // LiveKit Cloud has no capacity-scaling handshake (fully managed), so no 503 retry loop.
    // The CF (createLivekitCloudToken) makes the LiveKit identity unique per request, so two
    // tabs of the same user no longer collide and evict each other.
    const participantId = this.loggedinProfileid || `user-${Date.now()}`;
    const participantName = this.loggedinProfileRole["name"] || 'Guest';

    return await firstValueFrom(
      this.httpClient.post<any>(`https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/createLivekitCloudToken`, {
        roomName,
        participantName,
        participantId
      })
    );
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

    // Tear down: jitter controllers + shared filter-state plumbing. The Krisp processor is
    // owned/torn-down by <app-krisp-controls> (its own ngOnDestroy stops the processor).
    this.jitterStops.forEach(stop => stop());
    this.jitterStops.clear();
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
        const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/livekitCloudCloseRoom`;
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

  async startScreenShare() {
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
    }
    console.log("Screen sharing started");
    this.isLocalScreenSharing.set(true);
  }

  stopScreenShare() {
    const pub = this.getLocalTrackPublication(Track.Source.ScreenShare);
    if (pub) {
      this.room()?.localParticipant.unpublishTrack(pub.track!);
      pub.track?.stop();
      console.log("Screen sharing stopped");
      this.isLocalScreenSharing.set(false);
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
      const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/livekitCloudStartRecording`;
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
        const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/livekitCloudStopRecording`;
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
    } catch (error) {
      console.error('🔴 Blur error:', error);
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
      const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/livekitCloudKickParticipant`;

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
  async audioDiag(windowSec = 6): Promise<any> {
    const room = this.room();
    if (!room) { console.warn('[diag] not connected to a call'); return; }

    const micPub = this.getLocalTrackPublication(Track.Source.Microphone);
    const micTrack: any = micPub?.audioTrack;
    const proc = micTrack?.getProcessor?.();
    const filter = {
      processorName: proc?.name ?? null,                 // 'livekit-noise-filter' when Krisp is active
      krispEnabled: proc?.isEnabled?.() ?? null,         // true only when Krisp is actually processing
      processedTrackLive: proc?.processedTrack?.readyState ?? null,
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

    console.log('%c[diag] Krisp filter status', 'font-weight:bold;color:#4caf50', filter);
    console.log('%c[diag] CLIENT load (blur/CPU — A/B blur off vs on)', 'font-weight:bold;color:#9c27b0', client);
    console.log('%c[diag] UPLINK (this mic → SFU) — works solo', 'font-weight:bold;color:#2196f3');
    console.table([uplink]);
    console.log('%c[diag] DOWNLINK (remote talkers → you) — needs a second participant speaking', 'font-weight:bold;color:#ff9800');
    console.table(rows.length ? rows : [{ note: 'no remote audio streams — join a 2nd participant to measure downlink breakup' }]);
    console.log(`[diag] window ${dt.toFixed(1)}s · GOOD: conceal <15 ms/s, loss <1%, jitter <30 ms, rtt <120 ms, pair host/srflx (NOT relay)`);
    console.log('[diag] BAD breakup: conceal >50 ms/s, loss >2%, rtt >250 ms, or pair contains "relay"');
    return { filter, client, uplink, downlink: rows };
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

      const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/livekitCloudMuteParticipant`;

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
