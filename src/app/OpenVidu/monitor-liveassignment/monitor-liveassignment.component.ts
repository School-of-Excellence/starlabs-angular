import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, signal } from '@angular/core';
import { firstValueFrom, lastValueFrom, Subject, takeUntil } from 'rxjs';
import { ConnectionQuality, Participant, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track } from 'livekit-client';
import { collection, collectionData, Firestore, limit, query, where } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { OpenviduVideoElementComponent } from '../openvidu-video-element/openvidu-video-element.component';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { DfnInfo } from '../../LiveKit/dfn/dfn-state.service';
import { OpenviduAudioElementComponent } from '../openvidu-audio-element/openvidu-audio-element.component';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatDialog } from '@angular/material/dialog';
import { InstanceStatusService, InfrastructureStatus } from '../../instance-status.service';
import { MatIconModule } from '@angular/material/icon';


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
    OpenviduAudioElementComponent,
    MatIconModule
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

  // Per-participant state — compound key "roomId:::identity"
  participantsMute    = signal<Map<string, boolean>>(new Map());
  participantsQuality = signal<Map<string, ConnectionQuality>>(new Map());
  // Noise-reduction state per participant, from their DFN data broadcasts. The shared
  // DfnStateService only tracks one room; the monitor watches many, so we keep our own
  // per-room map (same pattern as mute/quality above).
  participantsDfn     = signal<Map<string, DfnInfo>>(new Map());
  activeSpeakersMap: { [roomId: string]: string[] } = {};

  // Room connection state — true while connecting, false once connected
  roomConnecting = signal<Map<string, boolean>>(new Map());

  infraStatus: InfrastructureStatus | null = null;
  // OCI twin of infraStatus — separate doc (OCI_System/instance_status), same shape.
  ociInfraStatus: InfrastructureStatus | null = null;
  // Which cloud is allowed to act (openvidu server/mediaprovider). Drives which cards
  // render, which controls are live, and both CF controllers' lifecycle gates.
  activeProvider: 'aws' | 'oci' = 'aws';
  infraActionInProgress = false;
  // Separate in-progress flag so OCI clicks don't disable AWS buttons (and vice versa).
  ociActionInProgress = false;
  infraError: string | null = null;
  infraSuccess: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    public http: HttpClient,
    public firestore: Firestore,
    public guard: AuthguardService,
    public dialog: MatDialog,
    private infraService: InstanceStatusService
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

      if(roles["developer"]) {
        this.loadInfrastructureStatus();
        this.loadOciInfrastructureStatus();
        this.loadActiveProvider();
      }
    })
  }

  ngOnInit() {
    
  }

  ngOnDestroy() {
    this.subscription.next();
    this.subscription.complete();

    this.roomConnections.forEach(room => {
      room.disconnect();
      room?.removeAllListeners();
    });
    this.roomConnections.clear();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async joinRoom(roomName:string){
    // Initialize a new Room object
    const room = new Room({
      adaptiveStream: true,
      reconnectPolicy: {
        nextRetryDelayInMs: (context) => {
          const delays = [1_000, 2_000, 5_000, 10_000];
          return delays[Math.min(context.retryCount, delays.length - 1)];
        }
      }
    });
    this.roomConnections.set(roomName, room);
    this.mapOpenViduRooms.update((value) =>{
      value.set(roomName, new Map())
      return value;
    })
    this.roomConnecting.update(m => { m.set(roomName, true); return m; });

    // Block audio subscriptions by default — only subscribe when actively listening
    room.on(
      RoomEvent.TrackPublished,
      (publication: RemoteTrackPublication) => {
        if (publication.kind === Track.Kind.Audio) {
          publication.setSubscribed(this.listeningRoom === roomName);
        }
      }
    );

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
        // Clean up per-participant state immediately
        this.participantsMute.update(m => { m.delete(`${roomName}:::${participant.identity}`); return m; });
        this.participantsQuality.update(m => { m.delete(`${roomName}:::${participant.identity}`); return m; });
        this.participantsDfn.update(m => { m.delete(`${roomName}:::${participant.identity}`); return m; });

        // Count non-ghost participants
        const participantJoined = (this.mapOpenViduRoom[roomName] ?? {})["participantjoined"] ?? []

        // livekit-client v2: remoteParticipants (Map) replaces the v1 `participants`
        const nonGhostParticipants = Array.from(room.remoteParticipants.values()).filter(
          (p: RemoteParticipant) => !p.identity.includes(this.ghostID) && participantJoined.includes(p.identity)
        );
        
        // Disconnect only if no real participants remain (only ghosts left)
        if (nonGhostParticipants.length === 0) {
          console.log('All real participants left, disconnecting ghost');
          this.leaveRoom(roomName);
        }
      }
    );

    // Track mute state
    room.on(RoomEvent.TrackMuted, (publication, participant: Participant) => {
      if (publication.kind === Track.Kind.Audio)
        this.participantsMute.update(m => { m.set(`${roomName}:::${participant.identity}`, true); return m; });
    });

    room.on(RoomEvent.TrackUnmuted, (publication, participant: Participant) => {
      if (publication.kind === Track.Kind.Audio)
        this.participantsMute.update(m => { m.delete(`${roomName}:::${participant.identity}`); return m; });
    });

    // Track network quality
    room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
      this.participantsQuality.update(m => { m.set(`${roomName}:::${participant.identity}`, quality); return m; });
    });

    // Track each participant's noise-reduction (DFN) state from their data broadcasts.
    // Same message shape the join screen sends: { type:'dfn', dfn, atten, norm }.
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg && msg.type === 'dfn' && participant) {
          this.participantsDfn.update(m => {
            m.set(`${roomName}:::${participant.identity}`, { dfn: !!msg.dfn, atten: Number(msg.atten), norm: Number(msg.norm) });
            return m;
          });
        }
      } catch {}
    });

    // Track active speakers
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      this.activeSpeakersMap = { ...this.activeSpeakersMap, [roomName]: speakers.map(s => s.identity) };
    });

    // Seed initial mute + quality for participants who join after Monitor connects
    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      const key = `${roomName}:::${participant.identity}`;
      const isMuted = Array.from(participant.audioTrackPublications.values()).some(p => p.isMuted);
      if (isMuted) this.participantsMute.update(m => { m.set(key, true); return m; });
      this.participantsQuality.update(m => { m.set(key, participant.connectionQuality); return m; });
    });

    try {
      // Request a new token
      const response = await this.getToken(roomName);
      console.log('Token received:', response);

      // Connect to the LiveKit room
      // await ensures we wait until initial signaling is done
      await room.connect(response.url, response.token);
      console.log('Room connected:', this.loggedinProfileid);
      this.roomConnecting.update(m => { m.set(roomName, false); return m; });

      // Seed initial mute + quality state for participants already in the room
      room.remoteParticipants.forEach((participant: RemoteParticipant) => {
        const key = `${roomName}:::${participant.identity}`;
        const isMuted = Array.from(participant.audioTrackPublications.values()).some(p => p.isMuted);
        if (isMuted) this.participantsMute.update(m => { m.set(key, true); return m; });
        this.participantsQuality.update(m => { m.set(key, participant.connectionQuality); return m; });
      });

      // Ghost observer — LiveKit does not publish camera/mic unless explicitly enabled
      // await room.localParticipant.setCameraEnabled(false);
      // await room.localParticipant.setMicrophoneEnabled(false);

    } catch (error: any) {
      // Handle connection errors gracefully
      console.log(error)
      console.log('There was an error connecting to the room:', error?.error?.errorMessage || error?.message || error);
      this.leaveRoom(roomName);
    }
  }

  // Get LiveKit Token
  async getToken(roomID: string) {
    // const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/createOpenViduToken`;

    // const participantName = this.loggedinProfileRole["name"] + this.ghostID
    // const participantId = this.loggedinProfileid + this.ghostID

    // const response = await lastValueFrom(
    //   this.http.post<{url: string, token: string }>(url, { roomName, participantName, participantId })
    // );

    // return response;

    const roomName = roomID;
    const participantId = (this.loggedinProfileid || `user-${Date.now()}`) + this.ghostID;
    const participantName = (this.loggedinProfileRole["name"] || 'Guest') + this.ghostID;

    console.log({roomName, participantId, participantName})

    // Cloud rooms: fully-managed token endpoint — no capacity/503 handshake, so no retry loop.
    if (this.getProvider(roomID) === 'livekit-cloud') {
      return await firstValueFrom(
        this.http.post<any>(`https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/createLivekitCloudToken`, {
          roomName,
          participantName,
          participantId
        })
      );
    }

    // OpenVidu self-hosted: existing capacity-aware retry loop. The room's mediaProvider
    // (aws/oci) tells the token function which cluster to issue for. Missing mediaProvider
    // == oci (matches the join-livekit-call fallback and the server-side default), so the
    // monitor joins the same cluster the participants do.
    const mediaProvider = this.mapOpenViduRoom[roomID]?.['mediaProvider'] || 'oci';
    let retryCount = 0;

    while (retryCount <= 3) {
      try {
        return await firstValueFrom(
          this.http.post<any>(`https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/createOpenViduToken`, {
            roomName,
            participantName,
            participantId,
            provider: mediaProvider
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

  async endCall(RoomId){
    if(confirm("Sure, do you want to close this meeting for all?")){
      var progress = this.dialog.open(LoadingProgressComponent, {data:{msg: "Ending Call..."},disableClose:true})
      try {
        // Close on the correct backend for this room's provider.
        const closeFn = this.getProvider(RoomId) === 'livekit-cloud' ? 'livekitCloudCloseRoom' : 'openViduCloseRoom';
        const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/${closeFn}`;
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

    // Clear all per-room participant state
    this.participantsMute.update(m => {
      for (const key of Array.from(m.keys()))
        if (key.startsWith(`${RoomId}:::`)) m.delete(key);
      return m;
    });
    this.participantsQuality.update(m => {
      for (const key of Array.from(m.keys()))
        if (key.startsWith(`${RoomId}:::`)) m.delete(key);
      return m;
    });
    this.participantsDfn.update(m => {
      for (const key of Array.from(m.keys()))
        if (key.startsWith(`${RoomId}:::`)) m.delete(key);
      return m;
    });
    delete this.activeSpeakersMap[RoomId];
    this.roomConnecting.update(m => { m.delete(RoomId); return m; });

    // Stop listening if the user was watching this room
    if (this.listeningRoom === RoomId) this.toggleListening(RoomId);

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
    const prev = this.listeningRoom;
    this.listeningRoom = (prev === roomId) ? null : roomId;

    // Unsubscribe audio from the room we stopped listening to
    if (prev) this.setAudioSubscription(prev, false);

    // Subscribe audio for the room we are now listening to
    if (this.listeningRoom) this.setAudioSubscription(this.listeningRoom, true);
  }

  private setAudioSubscription(roomId: string, subscribe: boolean) {
    const room = this.roomConnections.get(roomId);
    if (!room) return;
    room.remoteParticipants.forEach(participant => {
      participant.audioTrackPublications.forEach(pub => pub.setSubscribed(subscribe));
    });
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

  loadInfrastructureStatus() {
    this.infraService.getStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          
          if (status) {
            this.infraStatus = status;
            console.log(this.infraStatus, 'getStatus()');
          }
        },
        error: (err) => {
          console.error('Infrastructure status error:', err);
        }
      });
  }

  loadOciInfrastructureStatus() {
    this.infraService.getOciStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          if (status) {
            this.ociInfraStatus = status;
          }
        },
        error: (err) => {
          console.error('OCI infrastructure status error:', err);
        }
      });
  }

  getOciMasterState(): string {
    return this.ociInfraStatus?.master?.state || 'unknown';
  }

  getOciMasterStateClass(): string {
    const state = this.ociInfraStatus?.master?.state;
    if (state === 'running') return 'state-running';
    if (state === 'stopped') return 'state-stopped';
    if (state === 'starting' || state === 'stopping') return 'state-transitioning';
    return 'state-unknown';
  }

  getOciMediaStateClass(): string {
    const status = this.ociInfraStatus?.media?.scalingStatus;
    if (status === 'stable') return 'state-stable';
    if (status === 'scaling-up' || status === 'scaling-down') return 'state-transitioning';
    return 'state-unknown';
  }

  loadActiveProvider() {
    this.infraService.getActiveProvider()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.activeProvider = data?.activeprovider === 'oci' ? 'oci' : 'aws';
        },
        error: (err) => {
          console.error('Active provider read error:', err);
        }
      });
  }

  async switchProvider(provider: 'aws' | 'oci') {
    if (provider === this.activeProvider) return;
    if (!confirm(`Switch active media provider to ${provider.toUpperCase()}? New rooms and the schedulers will use ${provider.toUpperCase()} from now on.`)) return;
    try {
      await this.infraService.setActiveProvider(provider);
      this.infraSuccess = `Active provider switched to ${provider.toUpperCase()}`;
      setTimeout(() => this.infraSuccess = null, 5000);
    } catch (err: any) {
      this.infraError = err?.message || 'Failed to switch provider';
    }
  }

  /** Inactive-provider danger: anything of that cloud still up? (master running or media present) */
  isInactiveServerRunning(provider: 'aws' | 'oci'): boolean {
    if (provider === this.activeProvider) return false;
    const status = provider === 'aws' ? this.infraStatus : this.ociInfraStatus;
    if (!status) return false;
    const masterUp = status.master?.state === 'running' || status.master?.state === 'starting';
    const mediaUp = (status.media?.instanceStates?.total || 0) > 0 || (status.media?.desiredCapacity || 0) > 0;
    return masterUp || mediaUp;
  }

  // ---- OCI manual controls (twins of the AWS handlers below; shared alert strip) ----

  startOciMasterNode() {
    if (!confirm('Start OCI master node?')) return;
    this.ociActionInProgress = true;
    this.infraError = null;
    this.infraService.startOciMaster()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.infraSuccess = 'OCI master node starting...';
          this.ociActionInProgress = false;
          setTimeout(() => this.infraSuccess = null, 5000);
        },
        error: (err) => {
          this.infraError = err.error?.error || 'Failed to start OCI master';
          this.ociActionInProgress = false;
        }
      });
  }

  stopOciMasterNode() {
    if (!confirm('Stop OCI master node?')) return;
    this.ociActionInProgress = true;
    this.infraError = null;
    this.infraService.stopOciMaster()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.infraSuccess = 'OCI master node stopping...';
          this.ociActionInProgress = false;
          setTimeout(() => this.infraSuccess = null, 5000);
        },
        error: (err) => {
          this.infraError = err.error?.error || 'Failed to stop OCI master';
          this.ociActionInProgress = false;
        }
      });
  }

  scaleOciMediaUp() {
    this.ociActionInProgress = true;
    this.infraError = null;
    this.infraService.scaleOciUp()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.infraSuccess = 'OCI media scaling up...';
          this.ociActionInProgress = false;
          setTimeout(() => this.infraSuccess = null, 5000);
        },
        error: (err) => {
          this.infraError = err.error?.error || 'Failed to scale OCI media up';
          this.ociActionInProgress = false;
        }
      });
  }

  scaleOciMediaDown() {
    if (!confirm('Scale down OCI media nodes?')) return;
    this.ociActionInProgress = true;
    this.infraError = null;
    this.infraService.scaleOciDown()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.infraSuccess = 'OCI media scaling down...';
          this.ociActionInProgress = false;
          setTimeout(() => this.infraSuccess = null, 5000);
        },
        error: (err) => {
          this.infraError = err.error?.error || 'Failed to scale OCI media down';
          this.ociActionInProgress = false;
        }
      });
  }

  canStartOciMaster(): boolean {
    return this.ociInfraStatus?.master?.state === 'stopped' && !this.ociActionInProgress;
  }

  canStopOciMaster(): boolean {
    return this.ociInfraStatus?.master?.state === 'running' && !this.ociActionInProgress;
  }

  canScaleOciUp(): boolean {
    return !this.ociActionInProgress &&
           !!this.ociInfraStatus?.media &&
           this.ociInfraStatus.media.desiredCapacity < this.ociInfraStatus.media.maxSize;
  }

  canScaleOciDown(): boolean {
    return !this.ociActionInProgress &&
           !!this.ociInfraStatus?.media &&
           this.ociInfraStatus.media.desiredCapacity > this.ociInfraStatus.media.minSize;
  }

  startMasterNode() {
    if (!confirm('Start master node?')) return;

    this.infraActionInProgress = true;
    this.infraError = null;

    this.infraService.startMaster()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.infraSuccess = 'Master node starting...';
          this.infraActionInProgress = false;
          setTimeout(() => this.infraSuccess = null, 5000);
        },
        error: (err) => {
          this.infraError = err.error?.error || 'Failed to start';
          this.infraActionInProgress = false;
        }
      });
  }

  stopMasterNode() {
    if (!confirm('Stop master node?')) return;

    this.infraActionInProgress = true;
    this.infraError = null;

    this.infraService.stopMaster()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.infraSuccess = 'Master node stopping...';
          this.infraActionInProgress = false;
          setTimeout(() => this.infraSuccess = null, 5000);
        },
        error: (err) => {
          this.infraError = err.error?.error || 'Failed to stop';
          this.infraActionInProgress = false;
        }
      });
  }

  scaleMediaUp() {
    this.infraActionInProgress = true;
    this.infraError = null;

    this.infraService.scaleUp()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.infraSuccess = 'Scaling up...';
          this.infraActionInProgress = false;
          setTimeout(() => this.infraSuccess = null, 5000);
        },
        error: (err) => {
          this.infraError = err.error?.error || 'Failed to scale up';
          this.infraActionInProgress = false;
        }
      });
  }

  scaleMediaDown() {
    if (!confirm('Scale down?')) return;

    this.infraActionInProgress = true;
    this.infraError = null;

    this.infraService.scaleDown()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.infraSuccess = 'Scaling down...';
          this.infraActionInProgress = false;
          setTimeout(() => this.infraSuccess = null, 5000);
        },
        error: (err) => {
          this.infraError = err.error?.error || 'Failed to scale down';
          this.infraActionInProgress = false;
        }
      });
  }

  canStartMaster(): boolean {
    return this.infraStatus?.master?.state === 'stopped' && !this.infraActionInProgress;
  }

  canStopMaster(): boolean {
    return this.infraStatus?.master?.state === 'running' && !this.infraActionInProgress;
  }

  canScaleUp(): boolean {
    return !this.infraActionInProgress && 
           !!this.infraStatus?.media &&
           this.infraStatus.media.desiredCapacity < this.infraStatus.media.maxSize;
  }

  canScaleDown(): boolean {
    return !this.infraActionInProgress && 
           !!this.infraStatus?.media &&
           this.infraStatus.media.desiredCapacity > this.infraStatus.media.minSize;
  }

  getMasterState(): string {
    return this.infraStatus?.master?.state || 'unknown';
  }

  getMasterStateClass(): string {
    const state = this.infraStatus?.master?.state;
    if (state === 'running') return 'state-running';
    if (state === 'stopped') return 'state-stopped';
    if (state === 'starting' || state === 'stopping') return 'state-transitioning';
    return 'state-unknown';
  }

  getMediaStateClass(): string {
    const status = this.infraStatus?.media?.scalingStatus;
    if (status === 'stable') return 'state-stable';
    if (status === 'scaling-up' || status === 'scaling-down') return 'state-transitioning';
    return 'state-unknown';
  }

  /** Which backend this room runs on. Missing provider == self-hosted (default). */
  getProvider(roomId: string): 'livekit-cloud' | 'openvidu' {
    return this.mapOpenViduRoom[roomId]?.['provider'] === 'livekit-cloud' ? 'livekit-cloud' : 'openvidu';
  }

  /** Human label for the provider badge (reflects the actual media backend). */
  getProviderLabel(roomId: string): string {
    if (this.getProvider(roomId) === 'livekit-cloud') return 'LiveKit Cloud';
    const media = (this.mapOpenViduRoom[roomId]?.['mediaProvider'] || 'oci').toString().toUpperCase();
    return `OpenVidu ${media}`;
  }

  isParticipantMuted(roomId: string, identity: string): boolean {
    return this.participantsMute().get(`${roomId}:::${identity}`) ?? false;
  }

  /** Noise-reduction state for a participant, or undefined if not yet broadcast. */
  getDfnInfo(roomId: string, identity: string): DfnInfo | undefined {
    return this.participantsDfn().get(`${roomId}:::${identity}`);
  }

  isActiveSpeaker(roomId: string, identity: string): boolean {
    return (this.activeSpeakersMap[roomId] ?? []).includes(identity);
  }

  /** Mobile-style signal bars — mirrors JoinOpenviduCallComponent.getNetworkBars(). */
  getNetworkBars(roomId: string, identity: string): { bars: number; color: string } {
    const quality = this.participantsQuality().get(`${roomId}:::${identity}`);
    switch (quality) {
      case ConnectionQuality.Excellent: return { bars: 4, color: '#4caf50' };
      case ConnectionQuality.Good:      return { bars: 3, color: '#ffb300' };
      case ConnectionQuality.Poor:      return { bars: 1, color: '#e53935' };
      default:                          return { bars: 0, color: '#888' };
    }
  }
}
