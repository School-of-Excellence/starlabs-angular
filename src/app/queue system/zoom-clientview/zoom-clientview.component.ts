import { Component, OnInit, NgZone } from '@angular/core';
import { collection, doc, docData, Firestore, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { ZoomMtg } from '@zoom/meetingsdk';
import { HttpClient } from '@angular/common/http';
import { Storage } from '@angular/fire/storage';
import * as RecordRTC from 'recordrtc';
import { AuthguardService } from '../../authguard.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import html2canvas from 'html2canvas';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

type zoomConfig = {
  meetingNumber: string | number;
  userName: string;
  userEmail?: string;
  passWord?: string;
  customerKey?: string;
  tk?: string;
  zak?: string;
  sdkKey?: string;
  signature: string;
  recordingToken?: string;
  childToken?: string;
  success: Function;
  error: Function;
}

@Component({
  selector: 'app-zoom-clientview',
  imports: [
    CommonModule,
    MatIconModule
  ],
  templateUrl: './zoom-clientview.component.html',
  styleUrl: './zoom-clientview.component.css'
})
export class ZoomClientviewComponent {
  mediaRecorder: any;
  recordedChunks: Blob[] = [];
  bufferSize = 5;
  buffer: Blob[] = [];
  isRecording = false;
  afterClickChunks: Blob[] = [];

  zoomdata: any;
  hostname: string;
  profileid: any;
  profileHost: boolean;
  screenshots: any = [];
  collectiontype: any;
  documentId: any;
  private subscription: Subscription;

  isJoined: boolean = false;

  // Participant "wait for specialist" state (queue/studio flow only)
  waitingForSpecialist: boolean = false;
  participantName: string = '';
  specialistName: string = '';
  private waitingSub: Subscription | null = null;

  // "Meeting ended / link invalid" state
  meetingEnded: boolean = false;
  endedReason: 'completed' | 'cancelled' | 'expired' | 'notfound' | '' = '';

  // Participant heartbeat — keeps `participantLastSeenAt` fresh so the
  // specialist UI can detect when the participant has closed the tab.
  private heartbeatTimer: any = null;
  private unloadHandler: ((ev?: any) => void) | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds

  // Specialist heartbeat — refreshes `specialistLastSeenAt` so participants
  // can tell the specialist is still actually in the meeting. Without this,
  // a stale `specialistJoinedAt` would persist after the specialist leaves /
  // generates a new link, and the next participant would skip the wait
  // screen and try to join an empty room.
  private specialistHeartbeatTimer: any = null;
  private specialistUnloadHandler: ((ev?: any) => void) | null = null;
  private readonly SPECIALIST_PRESENCE_FRESHNESS_MS = 30000; // 30s window
  private readonly SPECIALIST_HEARTBEAT_INTERVAL_MS = 10000; // 10s beat

  // Background-tab attention grabbers (used when the gate releases)
  private originalTitle: string = '';
  private titleFlashTimer: any = null;
  private titleVisibilityHandler: (() => void) | null = null;
  private chimeLoopTimer: any = null;
  private chimeVisibilityHandler: (() => void) | null = null;

  // Recording-prompt state (host only)
  private remoteParticipantCount: number = 0;
  private recordingStatus: 'started' | 'paused' | 'stopped' | 'unknown' = 'unknown';
  private recordingPromptSnackRef: any = null;
  private recordingPromptTimer: any = null;
  private recordingPromptDismissedAt: number = 0;
  private readonly RECORDING_PROMPT_COOLDOWN_MS = 30000; // re-prompt 30s after dismiss

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private ngZone: NgZone,
    private storage: Storage,
    private http: HttpClient,
    private guard: AuthguardService,
    private snackBar: MatSnackBar
  ) {
    this.route.params.subscribe(data => {
      console.log(data);
      console.log("docid", data['id']);
      this.documentId = data['id'];
      this.collectiontype = data['collectiontype'];

      const collectionMap = {
        'queue': 'live assignment',
        'appointment': 'appointments'
      };
      const collectionName = collectionMap[this.collectiontype];
      getDoc(doc(this.firestore, collectionName, this.documentId)).then(snap => {
        console.log("docid", snap.id);
        if (!snap.exists()) {
          // Doc doesn't exist — link is truly invalid/expired
          this.ngZone.run(() => {
            this.meetingEnded = true;
            this.endedReason = 'notfound';
          });
          return;
        }
        this.zoomdata = snap.data();
        console.log("zoom data", this.zoomdata);
        this.startmeeting();
      }).catch(err => {
        console.warn('Could not load meeting doc', err);
        this.ngZone.run(() => {
          this.meetingEnded = true;
          this.endedReason = 'notfound';
        });
      });
    });
  }

  ngOnInit(): void {}

  // Start a 10s heartbeat that refreshes `participantLastSeenAt` so the
  // specialist UI can tell whether the participant is still on the page.
  // Also wires a `pagehide` cleanup that tries to clear `participantReadyAt`
  // when the tab is closed (best effort — may not always complete).
  private startParticipantHeartbeat() {
    if (this.heartbeatTimer || this.collectiontype !== 'queue' || this.profileHost) return;
    if (!this.documentId) return;

    const liveAssignmentRef = doc(this.firestore, 'live assignment', this.documentId);

    const beat = () => {
      updateDoc(liveAssignmentRef, { participantLastSeenAt: serverTimestamp() })
        .catch(err => console.warn('Heartbeat failed', err));
    };
    beat();
    this.heartbeatTimer = setInterval(beat, this.HEARTBEAT_INTERVAL_MS);

    // On tab close, try one final cleanup so the specialist's "Ready to join"
    // pill disappears immediately rather than waiting for the heartbeat to age out.
    this.unloadHandler = () => {
      try {
        updateDoc(liveAssignmentRef, { participantReadyAt: null }).catch(() => {});
      } catch {}
    };
    window.addEventListener('pagehide', this.unloadHandler);
  }

  private stopParticipantHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.unloadHandler) {
      window.removeEventListener('pagehide', this.unloadHandler);
      this.unloadHandler = null;
    }
  }

  // Specialist heartbeat — same idea as the participant heartbeat.
  // Updates `specialistLastSeenAt` every 10s; on tab close clears both
  // `specialistJoinedAt` and `specialistLastSeenAt` so the next participant
  // arrival enters the wait screen immediately rather than skipping it
  // because of a stale flag.
  private startSpecialistHeartbeat() {
    if (this.specialistHeartbeatTimer) return;
    if (!this.profileHost || this.collectiontype !== 'queue' || !this.documentId) return;

    const ref = doc(this.firestore, 'live assignment', this.documentId);
    const beat = () => {
      updateDoc(ref, { specialistLastSeenAt: serverTimestamp() })
        .catch(err => console.warn('Specialist heartbeat failed', err));
    };
    beat();
    this.specialistHeartbeatTimer = setInterval(beat, this.SPECIALIST_HEARTBEAT_INTERVAL_MS);

    this.specialistUnloadHandler = () => {
      try {
        updateDoc(ref, {
          specialistJoinedAt: null,
          specialistLastSeenAt: null
        }).catch(() => {});
      } catch {}
    };
    window.addEventListener('pagehide', this.specialistUnloadHandler);
  }

  private stopSpecialistHeartbeat() {
    if (this.specialistHeartbeatTimer) {
      clearInterval(this.specialistHeartbeatTimer);
      this.specialistHeartbeatTimer = null;
    }
    if (this.specialistUnloadHandler) {
      window.removeEventListener('pagehide', this.specialistUnloadHandler);
      this.specialistUnloadHandler = null;
    }
  }

  // Returns true when the specialist is actually present (joined AND heartbeat fresh).
  // Falls back to legacy `specialistJoinedAt`-only check if the heartbeat field
  // isn't present (older deployments).
  private isSpecialistPresent(data: any): boolean {
    if (!data?.['specialistJoinedAt']) return false;
    const hasLastSeenField = data && 'specialistLastSeenAt' in data;
    const lastSeen = data?.['specialistLastSeenAt'];
    if (!hasLastSeenField) return true; // legacy fallback — no heartbeat yet
    if (lastSeen == null) return false; // explicitly cleared on leave
    const ms = typeof lastSeen?.toMillis === 'function'
      ? lastSeen.toMillis()
      : (lastSeen instanceof Date ? lastSeen.getTime() : 0);
    if (!ms) return false;
    return (Date.now() - ms) < this.SPECIALIST_PRESENCE_FRESHNESS_MS;
  }

  // -------------------- Attention grabbers --------------------
  // Ask early so the browser shows its native permission prompt while the
  // participant is reading the waiting copy. If they grant, we'll be able
  // to send a system notification when the specialist joins.
  private async requestNotificationPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch {}
  }

  // Called the instant `specialistJoinedAt` flips. Fires all three signals.
  private alertParticipant() {
    this.startChimeLoop();
    this.showSystemNotification();
    this.startTitleFlash();
  }

  // Repeat the chime every 3s while the tab is hidden. Stops the moment
  // the participant returns to the tab (visibilitychange) or component dies.
  private startChimeLoop() {
    if (this.chimeLoopTimer) return;
    // Always play once immediately.
    this.playChime();
    // If the tab is already visible the participant has seen us — no looping.
    if (!document.hidden) return;

    this.chimeLoopTimer = setInterval(() => {
      if (document.hidden) {
        this.playChime();
      } else {
        this.stopChimeLoop();
      }
    }, 3000);

    this.chimeVisibilityHandler = () => {
      if (!document.hidden) this.stopChimeLoop();
    };
    document.addEventListener('visibilitychange', this.chimeVisibilityHandler);
  }

  private stopChimeLoop() {
    if (this.chimeLoopTimer) {
      clearInterval(this.chimeLoopTimer);
      this.chimeLoopTimer = null;
    }
    if (this.chimeVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.chimeVisibilityHandler);
      this.chimeVisibilityHandler = null;
    }
  }

  // Programmatic chime via Web Audio API — two short notes (C5 → E5).
  // No asset required; works in background tabs in all modern browsers.
  private playChime() {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.45);
      });
      setTimeout(() => ctx.close?.().catch?.(() => {}), 900);
    } catch (e) {
      console.warn('Could not play chime', e);
    }
  }

  private showSystemNotification() {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      const n = new Notification('Specialist joined call', {
        body: 'Switch back to the meeting tab to join the call.',
        icon: '/favicon.ico',
        tag: 'specialist-ready',
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      console.warn('Could not show notification', e);
    }
  }

  // Flash the tab title until the participant returns to the tab.
  private startTitleFlash() {
    if (this.titleFlashTimer) return;
    if (!this.originalTitle) this.originalTitle = document.title || 'Meeting';

    // If the tab is already visible, no need to flash — they'll see the join screen.
    if (!document.hidden) return;

    let on = true;
    this.titleFlashTimer = setInterval(() => {
      document.title = on ? '🔴 Specialist joined call — Join now!' : this.originalTitle;
      on = !on;
    }, 1000);

    this.titleVisibilityHandler = () => {
      if (!document.hidden) this.stopTitleFlash();
    };
    document.addEventListener('visibilitychange', this.titleVisibilityHandler);
  }

  private stopTitleFlash() {
    if (this.titleFlashTimer) {
      clearInterval(this.titleFlashTimer);
      this.titleFlashTimer = null;
    }
    if (this.originalTitle) {
      document.title = this.originalTitle;
    }
    if (this.titleVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.titleVisibilityHandler);
      this.titleVisibilityHandler = null;
    }
  }

  // -------------------- Recording prompt (host-side) --------------------
  // When 2+ participants are present and recording isn't running, prompt
  // the host. Re-check on user join/leave and on recording status change.
  private wireRecordingListeners() {
    try {
      const ZM: any = ZoomMtg as any;
      // Instead of trying to count join/leave events (which include self and
      // can double-fire on reconnects), poll a snapshot of the attendee list.
      // Snapshot subtracts self, so it's accurate at all times.
      ZM.inMeetingServiceListener('onUserJoin', () => this.refreshRemoteCountSnapshot());
      ZM.inMeetingServiceListener('onUserLeave', () => this.refreshRemoteCountSnapshot());
      ZM.inMeetingServiceListener('onUserUpdate', () => this.refreshRemoteCountSnapshot());
      const handleRecordingChange = (data: any) => {
        const s: string = (data?.recordingStatus || data?.status || '').toLowerCase();
        let newStatus: 'started' | 'paused' | 'stopped' | 'unknown' = this.recordingStatus;
        if (s.includes('paus')) newStatus = 'paused';
        else if (s.includes('stop') || s.includes('end')) newStatus = 'stopped';
        else if (s.includes('start') || s.includes('record')) newStatus = 'started';

        if (newStatus !== this.recordingStatus) {
          this.recordingStatus = newStatus;
          // Status changed → cooldown from a previous dismiss is no longer
          // relevant. Reset so the new state can prompt immediately.
          this.recordingPromptDismissedAt = 0;
        }
        this.evaluateRecordingPrompt();
      };
      ZM.inMeetingServiceListener('onRecordingStatusChange', handleRecordingChange);
      // Some SDK builds use this older event name
      ZM.inMeetingServiceListener('onRecordChange', handleRecordingChange);
    } catch (e) {
      console.warn('Could not wire Zoom recording listeners', e);
    }

    // After a short delay, query the current attendees list so we catch
    // any participants who were already in the call when the host (re)joined.
    // The user-join listener only fires for NEW joins, so on page refresh
    // we'd miss the existing remote users without this snapshot.
    setTimeout(() => this.refreshRemoteCountSnapshot(), 3000);

    // Poll every 10s continuously so the prompt re-appears if the host
    // dismissed it without starting the recording. Also refreshes the
    // count snapshot every cycle as a belt-and-braces measure.
    this.recordingPromptTimer = setInterval(() => {
      this.refreshRemoteCountSnapshot();
      this.evaluateRecordingPrompt();
    }, 10000);
  }

  // Snapshot the current attendee count (host + remote users) via Zoom SDK.
  // Best-effort — different SDK builds expose slightly different APIs.
  private refreshRemoteCountSnapshot() {
    try {
      const ZM: any = ZoomMtg as any;
      if (typeof ZM.getAttendeeslist !== 'function') return;
      ZM.getAttendeeslist({
        success: (res: any) => {
          const list = res?.result?.attendeesList || res?.attendeesList || res?.result || res || [];
          if (Array.isArray(list)) {
            // exclude self
            this.remoteParticipantCount = Math.max(0, list.length - 1);
            this.evaluateRecordingPrompt();
          }
        }
      });
    } catch (e) { /* silent */ }
  }

  private evaluateRecordingPrompt() {
    // Recording is on → close any open prompt and exit. This handles the
    // "paused → started" or "stopped → started" transition mid-call.
    if (this.recordingStatus === 'started') {
      if (this.recordingPromptSnackRef) {
        try { this.recordingPromptSnackRef.dismiss(); } catch {}
        this.recordingPromptSnackRef = null;
      }
      this.recordingPromptDismissedAt = 0;
      return;
    }

    // `remoteParticipantCount` is already self-excluded (snapshot subtracts 1).
    // Only prompt when at least one OTHER person is in the room.
    const otherPresent = this.remoteParticipantCount >= 1;
    // Only prompt when we KNOW recording is paused or stopped. 'unknown' is
    // silent (too many false positives when SDK events don't fire).
    const recordingOff = this.recordingStatus === 'stopped'
                      || this.recordingStatus === 'paused';

    if (!otherPresent || !recordingOff) return;
    if (this.recordingPromptSnackRef) return; // already showing
    // Cooldown: don't re-prompt within 30s of last dismiss (unless status
    // changed, which clears the cooldown via the listener above).
    if (this.recordingPromptDismissedAt &&
        Date.now() - this.recordingPromptDismissedAt < this.RECORDING_PROMPT_COOLDOWN_MS) {
      return;
    }

    const msg = this.recordingStatus === 'paused'
      ? 'Recording is paused. Please resume the recording now.'
      : 'Recording has stopped. Please start the recording again now.';
    this.ngZone.run(() => {
      this.recordingPromptSnackRef = this.snackBar.open(msg, 'Dismiss', {
        duration: 0,
        horizontalPosition: 'center',
        verticalPosition: 'top',
        panelClass: ['recording-prompt-snack']
      });
      this.recordingPromptSnackRef.afterDismissed().subscribe(() => {
        this.recordingPromptSnackRef = null;
        this.recordingPromptDismissedAt = Date.now();
      });
    });
  }

  private stopRecordingListeners() {
    if (this.recordingPromptTimer) {
      clearInterval(this.recordingPromptTimer);
      this.recordingPromptTimer = null;
    }
    if (this.recordingPromptSnackRef) {
      try { this.recordingPromptSnackRef.dismiss(); } catch {}
      this.recordingPromptSnackRef = null;
    }
  }
  // -------------------- end attention grabbers --------------------

  ngOnDestroy() {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.clearScreenshots();
    this.waitingSub?.unsubscribe();
    this.waitingSub = null;
    this.stopParticipantHeartbeat();
    this.stopTitleFlash();
    this.stopChimeLoop();
    this.stopRecordingListeners();

    // Stop the specialist heartbeat and best-effort clear both presence flags
    // so the next participant arrival lands on the wait screen rather than
    // skipping it because of a stale `specialistJoinedAt`.
    this.stopSpecialistHeartbeat();
    if (this.profileHost && this.collectiontype === 'queue' && this.documentId &&
        this.zoomdata?.['status'] === 'live') {
      updateDoc(doc(this.firestore, 'live assignment', this.documentId), {
        specialistJoinedAt: null,
        specialistLastSeenAt: null
      }).catch(err => console.warn('Could not clear specialist presence on leave', err));
    }
  }

  loadScreenshots() {
    this.screenshots = JSON.parse(localStorage.getItem('screenshots') || '[]');
  }

  async startmeeting() {
    // ---------------- Validity gate ----------------
    // For the studio (queue) flow, the live assignment doc must be in 'live'
    // status. Any other status ('completed', 'cancelled', etc.) means the
    // session has ended and this link is no longer valid.
    if (this.collectiontype === 'queue') {
      const status = this.zoomdata?.['status'];
      if (status && status !== 'live') {
        this.ngZone.run(() => {
          this.meetingEnded = true;
          this.endedReason = status === 'completed' ? 'completed'
                           : status === 'cancelled' ? 'cancelled'
                           : 'expired';
        });
        return;
      }
    }

    // Resolve roles once
    if (!this.profileid) {
      await this.guard.getRoles().then(async roles => {
        this.profileid = roles.profile_ref.id;
        const hosts = this.collectiontype === 'queue'
          ? this.zoomdata["pairing"]
          : this.zoomdata["hosts"].map(ref => ref.id);
        this.profileHost = hosts.includes(this.profileid);
        console.log(this.profileHost ? "Host" : "Participant");
      });
    }

    // ---------------- Specialist-wait gate (studio queue flow) ----------------
    // For the studio flow the participant should not enter Zoom until the
    // specialist is actually inside the meeting. We use a `specialistJoinedAt`
    // timestamp on the `live assignment` document. The HOST sets this flag
    // only after Zoom's join() success callback fires (see ZoomMtg.join below),
    // so the participant never joins an empty room.
    if (this.collectiontype === 'queue' && !this.profileHost) {
      const liveAssignmentRef = doc(this.firestore, 'live assignment', this.documentId);

      // Tell the specialist that the participant has arrived on the meeting screen
      // and is ready to join. This fires regardless of whether the specialist is in
      // yet — the specialist UI watches this flag to show a "ready" indicator.
      try {
        await updateDoc(liveAssignmentRef, {
          participantReadyAt: serverTimestamp(),
          participantLastSeenAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('Could not mark participantReadyAt', err);
      }

      // Start a heartbeat so the specialist UI can tell when the participant
      // closes the tab (heartbeat stops → "Ready to join" disappears).
      this.startParticipantHeartbeat();

      if (!this.isSpecialistPresent(this.zoomdata)) {
        // Participant arrived before the specialist is in the meeting → wait.
        // (Either the specialist has never joined, or they joined earlier and
        // have since left — heartbeat is stale.)
        // Try to surface the participant's name for the waiting copy.
        try {
          const participantId = this.zoomdata?.['participantid'] || this.zoomdata?.['token']?.['profile_id'];
          if (participantId) {
            const partSnap = await getDocs(query(
              collection(this.firestore, 'profile_data'),
              where('profileid', '==', participantId)
            ));
            if (!partSnap.empty) {
              this.participantName = partSnap.docs[0].data()['name'] || '';
            }
          }
        } catch {}

        this.ngZone.run(() => { this.waitingForSpecialist = true; });

        // Ask for notification permission early — the prompt will appear while
        // they read the waiting copy, well before the gate releases.
        this.requestNotificationPermission();

        this.waitingSub = docData(liveAssignmentRef).subscribe((data: any) => {
          // Doc disappeared (deleted while waiting)
          if (!data) {
            this.waitingSub?.unsubscribe();
            this.waitingSub = null;
            this.stopParticipantHeartbeat();
            this.ngZone.run(() => {
              this.waitingForSpecialist = false;
              this.meetingEnded = true;
              this.endedReason = 'notfound';
            });
            return;
          }
          // Session ended (specialist marked stage complete / cancelled)
          if (data['status'] && data['status'] !== 'live') {
            this.waitingSub?.unsubscribe();
            this.waitingSub = null;
            this.stopParticipantHeartbeat();
            this.ngZone.run(() => {
              this.waitingForSpecialist = false;
              this.meetingEnded = true;
              this.endedReason = data['status'] === 'completed' ? 'completed'
                               : data['status'] === 'cancelled' ? 'cancelled'
                               : 'expired';
            });
            return;
          }
          // Specialist is actually present (joined AND heartbeat fresh) →
          // release the gate. We re-check freshness here so a stale flag
          // from an earlier session doesn't prematurely release the wait.
          if (this.isSpecialistPresent(data)) {
            this.waitingSub?.unsubscribe();
            this.waitingSub = null;
            this.zoomdata = data;
            this.ngZone.run(() => { this.waitingForSpecialist = false; });
            // Grab attention if the participant has the tab in the background
            this.alertParticipant();
            // Re-enter startmeeting — gate is now satisfied, Zoom will initialise.
            this.startmeeting();
          }
        });

        return; // Bail out — Zoom will be initialised after specialist joins.
      }
    }
    // ---------------- end gate ----------------

    var profileData = {};
    await getDocs(query(collection(this.firestore, 'profile_data'), where('profileid', '==', this.profileid))).then(snap => {
      this.hostname = snap.docs[0].data()['name'];
      profileData = snap.docs[0].data();
      console.log(this.hostname);
    });

    if (this.zoomdata && this.zoomdata['zoomdata']) {

      // ← ADDED: Diagnostic check for gallery view support
      console.log('=== GALLERY VIEW DIAGNOSTICS ===');
      console.log('crossOriginIsolated:', (window as any).crossOriginIsolated);
      console.log('SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined');
      if (!(window as any).crossOriginIsolated) {
        console.warn('⚠️ Page is NOT cross-origin isolated. Gallery view will NOT work.');
        console.warn('⚠️ Fix: Ensure coi-serviceworker.js is loaded and COOP/COEP headers are set.');
      }
      // ← END ADDED

      ZoomMtg.setZoomJSLib('https://source.zoom.us/3.13.2/lib', '/av');

      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      ZoomMtg.i18n.load('en-US');
      document.getElementById('zmmtg-root')?.style.setProperty('display', 'block');
      console.log("ng zone start");

      this.ngZone.runOutsideAngular(() => {
        console.log("zoom");

        ZoomMtg.init({
          leaveUrl: this.profileHost
            ? `${window.location.origin}/dynamicstudio`
            : `${window.location.origin}/participantstudio`,
          patchJsMedia: true,
          defaultView: 'gallery',
          success: (success: any) => {
            this.ngZone.run(() => {
              this.isJoined = true;
            });
            console.log(success);
            var zoomConfig: zoomConfig = {
              sdkKey: "rjad2eLZSIKlamaIwi09tw",
              signature: this.profileHost
                ? this.zoomdata['hostsignature']
                : this.zoomdata['participantsignature'],
              meetingNumber: this.zoomdata['zoomdata']['id'],
              passWord: this.zoomdata['zoomdata']['password'],
              userName: this.hostname,
              userEmail: this.profileHost
                ? this.zoomdata['zoomdata']['host_email']
                : profileData["email"],
              success: (success: any) => {
                console.log(success);
                console.log("zoom successfully joined");

                // Host has actually entered the Zoom meeting — release any
                // participant waiting on the studio gate, and start the
                // heartbeat so participants can tell when the host leaves.
                if (this.profileHost && this.collectiontype === 'queue') {
                  updateDoc(doc(this.firestore, 'live assignment', this.documentId), {
                    specialistJoinedAt: serverTimestamp(),
                    specialistLastSeenAt: serverTimestamp()
                  }).catch(err => console.warn('Could not mark specialistJoinedAt', err));
                  this.startSpecialistHeartbeat();
                }

                // Participant successfully joined Zoom → stop the heartbeat
                // (Zoom presence is the source of truth from now on).
                if (!this.profileHost) {
                  this.stopParticipantHeartbeat();
                }

                // Host only: wire in-meeting listeners to prompt about recording
                if (this.profileHost) {
                  this.wireRecordingListeners();
                }

                this.snackBar.open(
                  'Reminder: You can click the Capture button or press the Tab key to take a video clip',
                  'Close',
                  {
                    duration: 1000,
                    horizontalPosition: 'center',
                    verticalPosition: 'top'
                  }
                );
              },
              error: (error: any) => {
                console.log(error);
              }
            };
            if (this.profileHost) {
              zoomConfig["zak"] = this.zoomdata['zak'];
            } else {
              zoomConfig["customerKey"] = this.profileid;
            }
            ZoomMtg.join(zoomConfig);
          },
          error: (error: any) => {
            console.log(error);
          }
        });
      });
    }
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  async onClick() {
    try {
      const clickTimestamp = new Date().toISOString();
      const clipTiming = {
        timestamp: clickTimestamp,
        capturedby: this.profileid
      };
      var data;
      await getDoc(doc(this.firestore, 'live assignment', this.zoomdata['docid'])).then(snap => {
        data = snap.data();
      });
      console.log(data);

      let clipTimings = data['cliptimings'] ? data.cliptimings : [];
      clipTimings.push(clipTiming);
      await updateDoc(doc(this.firestore, 'live assignment', this.zoomdata['docid']), { cliptimings: clipTimings });

      console.log('Clip timing updated successfully:', clipTiming);
      this.showPopup();
      this.captureScreenshot();
    } catch (error) {
      console.error('Error updating clip timing:', error);
    }
  }

  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      this.onClick();
    }
  }

  showPopup(): void {
    this.snackBar.open('Clip captured', 'Close', {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  captureScreenshot() {
    const targetElement = document.querySelector('#zmmtg-root') as HTMLElement;
    if (targetElement) {
      html2canvas(targetElement, { useCORS: true, allowTaint: true }).then(canvas => {
        const dataURL = canvas.toDataURL('image/png');
        this.saveScreenshot(dataURL);
        this.updateSlider(dataURL);
      }).catch(error => {
        console.error('Error capturing screenshot:', error);
      });
    } else {
      console.error('Target element not found.');
    }
  }

  saveScreenshot(dataURL: string) {
    const screenshots = JSON.parse(localStorage.getItem('screenshots') || '[]');
    screenshots.push(dataURL);
    localStorage.setItem('screenshots', JSON.stringify(screenshots));
  }

  updateSlider(dataURL: string) {
    this.screenshots.push(dataURL);
  }

  clearScreenshots() {
    localStorage.removeItem('screenshots');
    this.screenshots = [];
  }
}