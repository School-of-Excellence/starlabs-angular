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
  // Pending auto-remove timers for capture chips (cleared on teardown).
  private clipChipTimers: any[] = [];
  private readonly CLIP_CHIP_TTL_MS = 10000; // auto-remove each capture chip after 10s
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

  // Participant presence — pagehide cleanup clears the presence one-shots on
  // tab close. The 10s `participantLastSeenAt` heartbeat was REMOVED
  // (see specs/plans/2026-06-24-presence-heartbeat-removal.md). Presence is now
  // derived from participantReadyAt / participantInCallAt / participantLeftAt.
  private unloadHandler: ((ev?: any) => void) | null = null;

  // Specialist presence — pagehide cleanup stamps `specialistLeftAt` on tab
  // close. The 10s `specialistLastSeenAt` heartbeat was REMOVED. Presence is
  // now derived from `specialistJoinedAt && !specialistLeftAt`.
  private specialistUnloadHandler: ((ev?: any) => void) | null = null;

  // Background-tab attention grabbers (used when the gate releases)
  private originalTitle: string = '';
  private titleFlashTimer: any = null;
  private titleVisibilityHandler: (() => void) | null = null;
  private chimeLoopTimer: any = null;
  private chimeVisibilityHandler: (() => void) | null = null;

  // Recording-prompt state (host only)
  private remoteParticipantCount: number = 0;
  private recordingStatus: 'started' | 'paused' | 'stopped' | 'unknown' = 'unknown';
  private recordingPromptTimer: any = null;
  private recordingPromptDismissedAt: number = 0;
  // Stable bound reference so addEventListener/removeEventListener match.
  // Using `this.handleKeyDown.bind(this)` inline at both sites produced two
  // DIFFERENT function objects, so the window 'keydown' listener was never
  // removed — leaking this component (and its Zoom SDK instance) on every visit.
  private readonly boundKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private readonly RECORDING_PROMPT_COOLDOWN_MS = 30000; // re-prompt 30s after dismiss

  // Big-center recording overlay (host only). Replaces the older snackbar.
  recordingPromptVisible: boolean = false;
  recordingPromptKind: 'paused' | 'stopped' = 'stopped';
  // Set when the host explicitly confirms recording is running. Suppresses the
  // prompt for good — needed because some Zoom SDK builds never fire
  // `onRecordingStatusChange`, so we can't detect the started state ourselves
  // and would otherwise nag forever even while recording IS on. A genuine later
  // 'stopped'/'paused' event resets this so a real stop still re-prompts.
  private recordingConfirmedByHost: boolean = false;

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

  // Wire a `pagehide` cleanup so that on tab close the participant's presence
  // one-shots are cleared immediately: `participantReadyAt`/`participantInCallAt`
  // nulled and `participantLeftAt` stamped, so the specialist's "Ready to join"
  // pill disappears and the arena shows "Participant left". Best-effort — does
  // NOT fire on crash/sleep/network-drop (accepted; see plan). The 10s heartbeat
  // was removed — presence is derived purely from these one-shots.
  private startParticipantHeartbeat() {
    if (this.unloadHandler || this.collectiontype !== 'queue' || this.profileHost) return;
    if (!this.documentId) return;

    const liveAssignmentRef = doc(this.firestore, 'live assignment', this.documentId);

    this.unloadHandler = () => {
      try {
        updateDoc(liveAssignmentRef, {
          participantReadyAt: null,
          participantInCallAt: null,
          participantLeftAt: serverTimestamp()
        }).catch(() => {});
      } catch {}
    };
    window.addEventListener('pagehide', this.unloadHandler);
  }

  private stopParticipantHeartbeat() {
    if (this.unloadHandler) {
      window.removeEventListener('pagehide', this.unloadHandler);
      this.unloadHandler = null;
    }
  }

  // Wire a `pagehide` cleanup so that on tab close the SPECIALIST's leave is
  // stamped (`specialistLeftAt`). Keep `specialistJoinedAt` as the historical
  // call-start time. We deliberately do NOT touch participant fields — they may
  // still be in the call. The 10s heartbeat was removed — presence is derived
  // from `specialistJoinedAt && !specialistLeftAt`.
  private startSpecialistHeartbeat() {
    if (this.specialistUnloadHandler) return;
    if (!this.profileHost || this.collectiontype !== 'queue' || !this.documentId) return;

    const ref = doc(this.firestore, 'live assignment', this.documentId);

    this.specialistUnloadHandler = () => {
      try {
        updateDoc(ref, {
          specialistLeftAt: serverTimestamp()
        }).catch(() => {});
      } catch {}
    };
    window.addEventListener('pagehide', this.specialistUnloadHandler);
  }

  private stopSpecialistHeartbeat() {
    if (this.specialistUnloadHandler) {
      window.removeEventListener('pagehide', this.specialistUnloadHandler);
      this.specialistUnloadHandler = null;
    }
  }

  // Specialist is present when they joined the Zoom call and have not left.
  // (Heartbeat removed — see plan. No freshness/legacy-fallback path: the
  // legacy branch ignored `specialistLeftAt` and would read "present" after a
  // clean leave.)
  private isSpecialistPresent(data: any): boolean {
    if (!data?.['specialistJoinedAt']) return false;
    if (data?.['specialistLeftAt']) return false;
    return true;
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

  // -------------------- Meeting-end leave stamp (both roles) --------------------
  // Stamp the leave the instant the Zoom meeting ends/disconnects — BEFORE the
  // SDK's `leaveUrl` redirect fires. This write enters the Firestore
  // offline-cache queue and syncs reliably across the hard redirect, whereas a
  // bare pagehide write races the navigation and often never lands (and there
  // is no heartbeat staleness fallback anymore). meetingStatus 3 = disconnected.
  private meetingEndStamped = false;
  private wireMeetingEndListener() {
    if (this.collectiontype !== 'queue' || !this.documentId) return;
    try {
      const ZM: any = ZoomMtg as any;
      ZM.inMeetingServiceListener('onMeetingStatus', (data: any) => {
        const status = data?.meetingStatus;
        if (status !== 3) return; // 3 = disconnected/ended
        // Left / ended the call → hide the in-call controls (Capture / Prescribe ATC).
        this.ngZone.run(() => { this.isJoined = false; });
        if (this.meetingEndStamped) return;
        this.meetingEndStamped = true;
        const ref = doc(this.firestore, 'live assignment', this.documentId);
        if (this.profileHost) {
          // Host ending the call = "End meeting for all" → everyone is gone.
          // Stamp BOTH leaves so the arena flips to "Call ended" even if the
          // participant's own client can't write before its redirect.
          updateDoc(ref, {
            specialistLeftAt: serverTimestamp(),
            participantLeftAt: serverTimestamp()
          }).catch(err => console.warn('Could not stamp leave on meeting end (host)', err));
        } else {
          updateDoc(ref, {
            participantLeftAt: serverTimestamp()
          }).catch(err => console.warn('Could not stamp leave on meeting end (participant)', err));
        }
      });
    } catch (e) {
      console.warn('Could not wire Zoom meeting-end listener', e);
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
        // The Zoom Web SDK's onRecordingStatusChange passes { state: '...' }
        // (e.g. 'Recording', 'Paused', 'Stopped', 'Connecting'). Earlier code
        // read recordingStatus/status which don't exist on this event, so the
        // object fell through to "[object Object]" and the status never
        // updated — leaving the prompt stuck on 'paused' after resume.
        // Read `state` first, then the other shapes for older SDK builds.
        const raw = (
          data?.state ??
          data?.recordingStatus ??
          data?.status ??
          (typeof data === 'string' ? data : '')
        ).toString();
        const s: string = raw.toLowerCase();
        console.log('[recording-prompt] status event raw=', raw, 'payload=', data);
        let newStatus: 'started' | 'paused' | 'stopped' | 'unknown' = this.recordingStatus;
        // Order matters — "NotRecording"/"Stopped" must classify as stopped
        // before the 'record' check would label it 'started'. "Paused" /
        // "PauseRecord" must hit the paused branch before 'record' steals it.
        if (s.includes('not') || s.includes('stop') || s.includes('end') || s.includes('disconnect')) {
          newStatus = 'stopped';
        } else if (s.includes('paus')) {
          newStatus = 'paused';
        } else if (s.includes('start') || s.includes('record') || s.includes('connect') || s.includes('resume')) {
          newStatus = 'started';
        }

        if (newStatus !== this.recordingStatus) {
          console.log('[recording-prompt] status', this.recordingStatus, '→', newStatus);
          this.recordingStatus = newStatus;
          // Status changed → cooldown from a previous dismiss is no longer
          // relevant. Reset so the new state can prompt immediately.
          this.recordingPromptDismissedAt = 0;
          // If recording is now on, close any open prompt right away.
          if (newStatus === 'started') {
            this.ngZone.run(() => { this.recordingPromptVisible = false; });
          }
          // A genuine later stop/pause means the host's earlier "recording is
          // on" confirmation no longer holds — allow the prompt to re-appear.
          if (newStatus === 'stopped' || newStatus === 'paused') {
            this.recordingConfirmedByHost = false;
          }
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

    // Poll every 5s continuously so the prompt re-appears if the host
    // dismissed it without starting the recording. Also refreshes the
    // count snapshot every cycle as a belt-and-braces measure.
    this.recordingPromptTimer = setInterval(() => {
      this.refreshRemoteCountSnapshot();
      this.evaluateRecordingPrompt();
    }, 5000);
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
    // Host explicitly confirmed recording is running → never nag. This is the
    // escape hatch for SDK builds that don't emit recording-status events.
    if (this.recordingConfirmedByHost) {
      if (this.recordingPromptVisible) {
        this.ngZone.run(() => { this.recordingPromptVisible = false; });
      }
      return;
    }

    // Recording is on → close any open prompt and exit. This handles the
    // "paused → started" or "stopped → started" transition mid-call.
    if (this.recordingStatus === 'started') {
      if (this.recordingPromptVisible) {
        this.ngZone.run(() => { this.recordingPromptVisible = false; });
      }
      this.recordingPromptDismissedAt = 0;
      return;
    }

    // `remoteParticipantCount` is already self-excluded (snapshot subtracts 1).
    // Only prompt when at least one OTHER person is in the room.
    const otherPresent = this.remoteParticipantCount >= 1;
    // Only prompt on a POSITIVE off-signal — an explicit 'paused' or 'stopped'
    // recording event from Zoom. We deliberately do NOT treat 'unknown' as off.
    //
    // Previously 'unknown' (no recording event seen yet) was treated as off
    // after an 8s grace. But several Zoom SDK builds never emit the initial
    // 'Recording'/'started' event when recording is already running, so the
    // status stayed 'unknown' forever and the host got nagged with
    // "recording is not running" *while recording was actually on*. That false
    // alarm is the exact bug we're fixing. By requiring an explicit pause/stop
    // event, the prompt fires only when Zoom tells us recording really stopped
    // or paused — never as a guess.
    const recordingOff = this.recordingStatus === 'paused'
                      || this.recordingStatus === 'stopped';
    console.debug('[recording-prompt] evaluate', {
      status: this.recordingStatus,
      remote: this.remoteParticipantCount,
      recordingOff,
    });
    if (!otherPresent || !recordingOff) return;
    if (this.recordingPromptVisible) return; // already showing
    // Cooldown: don't re-prompt within 30s of last dismiss (unless status
    // changed, which clears the cooldown via the listener above).
    if (this.recordingPromptDismissedAt &&
        Date.now() - this.recordingPromptDismissedAt < this.RECORDING_PROMPT_COOLDOWN_MS) {
      return;
    }

    this.ngZone.run(() => {
      this.recordingPromptKind = this.recordingStatus === 'paused' ? 'paused' : 'stopped';
      this.recordingPromptVisible = true;
    });
  }

  // Called from the big center overlay's Dismiss button.
  dismissRecordingPrompt() {
    this.recordingPromptVisible = false;
    this.recordingPromptDismissedAt = Date.now();
  }

  // Called from the overlay's "Recording is on — stop reminding me" button.
  // The host asserts recording is running; suppress the prompt until a real
  // stop/pause event proves otherwise. Fixes the loop where the SDK never
  // reports the 'started' state and the prompt nags even while recording.
  confirmRecordingOn() {
    this.recordingConfirmedByHost = true;
    this.recordingStatus = 'started';
    this.recordingPromptVisible = false;
    this.recordingPromptDismissedAt = 0;
  }

  private stopRecordingListeners() {
    if (this.recordingPromptTimer) {
      clearInterval(this.recordingPromptTimer);
      this.recordingPromptTimer = null;
    }
    this.recordingPromptVisible = false;
  }
  // -------------------- end attention grabbers --------------------

  ngOnDestroy() {
    window.removeEventListener('keydown', this.boundKeyDown);
    this.clearScreenshots();
    this.waitingSub?.unsubscribe();
    this.waitingSub = null;
    this.stopParticipantHeartbeat();
    this.stopTitleFlash();
    this.stopChimeLoop();
    this.stopRecordingListeners();

    // On in-app route change (ngOnDestroy fires; pagehide does NOT), stamp the
    // leave so presence clears. pagehide handles clean tab close; this handles
    // navigation away. The unload listeners were just removed by the stop*
    // calls above, so there is no double-fire.
    this.stopSpecialistHeartbeat();
    if (this.collectiontype === 'queue' && this.documentId &&
        this.zoomdata?.['status'] === 'live') {
      if (this.profileHost) {
        // Specialist left. Keep `specialistJoinedAt` as the historical call
        // start time; stamp the leave. Do NOT touch participant fields — they
        // may still be in the call.
        updateDoc(doc(this.firestore, 'live assignment', this.documentId), {
          specialistLeftAt: serverTimestamp()
        }).catch(err => console.warn('Could not stamp specialistLeftAt on leave', err));
      } else {
        // Participant left (route change). Clear presence one-shots and stamp
        // the leave — mirrors the pagehide cleanup so a navigation-away doesn't
        // leave a stale "waiting"/"in call" until aged out.
        updateDoc(doc(this.firestore, 'live assignment', this.documentId), {
          participantReadyAt: null,
          participantInCallAt: null,
          participantLeftAt: serverTimestamp()
        }).catch(err => console.warn('Could not stamp participantLeftAt on leave', err));
      }
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
        // Clear `participantLeftAt` too so a refresh (which stamps a leave via
        // pagehide) self-heals back to "waiting" on re-init.
        await updateDoc(liveAssignmentRef, {
          participantReadyAt: serverTimestamp(),
          participantLeftAt: null
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

      // Self-hosted SDK assets (served from /zoom via angular.json). Zoom's CDN
      // (source.zoom.us) stopped publishing the Client View /ui bundle for 4.x+,
      // so the only way to run 6.x is to host dist/{lib,ui} ourselves.
      ZoomMtg.setZoomJSLib(`${window.location.origin}/zoom/lib`, '/av');

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
            // NOTE: this is the SDK *init* success — the meeting isn't joined
            // yet. `isJoined` (which gates the in-call Capture / Prescribe ATC
            // buttons) is flipped in the ZoomMtg.join success below, so those
            // controls only appear once the user is actually inside the call.
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

                // Now actually inside the meeting — reveal the in-call controls
                // (Capture / Prescribe ATC). Runs outside Angular (join is fired
                // inside runOutsideAngular), so re-enter the zone to update the view.
                this.ngZone.run(() => {
                  this.isJoined = true;
                });

                // Host has actually entered the Zoom meeting — release any
                // participant waiting on the studio gate, and start the
                // heartbeat so participants can tell when the host leaves.
                //   specialistJoinedAt = call START (preserved across leave/
                //                        rejoin so it represents the original
                //                        time the call began)
                if (this.profileHost && this.collectiontype === 'queue') {
                  // Host (re)entered Zoom. Clear `specialistLeftAt` (in case
                  // they had bounced) so presence reads "in call" again, and
                  // stamp `specialistJoinedAt` ONLY if it isn't already set so
                  // the call-start time is preserved across leave/rejoin.
                  const update: any = {
                    specialistLeftAt: null
                  };
                  if (!this.zoomdata?.['specialistJoinedAt']) {
                    update.specialistJoinedAt = serverTimestamp();
                  }
                  updateDoc(doc(this.firestore, 'live assignment', this.documentId), update)
                    .catch(err => console.warn('Could not mark specialistJoinedAt', err));
                  this.startSpecialistHeartbeat();
                }

                // Participant successfully joined Zoom → record the
                // "in call" timestamp so the arena can show the participant
                // as actually inside the meeting (not just at the wait
                // screen). We keep the heartbeat running so the arena can
                // still detect tab close. `participantReadyAt` is cleared
                // because they're no longer at the wait screen.
                // `participantLeftAt` is cleared in case they had bounced and
                // are now back.
                if (!this.profileHost && this.collectiontype === 'queue') {
                  updateDoc(doc(this.firestore, 'live assignment', this.documentId), {
                    participantInCallAt: serverTimestamp(),
                    participantReadyAt: null,
                    participantLeftAt: null
                  }).catch(err => console.warn('Could not mark participantInCallAt', err));
                }

                // Host only: wire in-meeting listeners to prompt about recording
                if (this.profileHost) {
                  this.wireRecordingListeners();
                }

                // Both roles: stamp the leave reliably the instant the meeting
                // ends ("End meeting for all" / leave), BEFORE the leaveUrl
                // redirect — pagehide alone races the navigation and there is no
                // heartbeat fallback anymore. See wireMeetingEndListener.
                this.wireMeetingEndListener();

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
    window.addEventListener('keydown', this.boundKeyDown);
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

  // Jump the specialist to the "Prescribe ATC" step of Dynamic Studio WITHOUT
  // leaving the Zoom call. If a Dynamic Studio tab is already open (same origin),
  // ask it (via BroadcastChannel) to switch to the step and focus itself. If no
  // studio tab answers within a short window, open one in a NEW tab. Either way
  // the current Zoom route is never navigated away from.
  goToPrescribeAtc() {
    const step = 'prescribe-atc';
    const url = `${window.location.origin}/dynamicstudio?step=${step}`;
    try {
      const channel = new BroadcastChannel('starlabs-dynamic-studio');
      let acked = false;
      channel.onmessage = (ev: MessageEvent) => {
        if (ev?.data?.type === 'studio-here') acked = true;
      };
      // Ping any open studio tab to navigate + focus.
      channel.postMessage({ type: 'goto-step', step });
      // No studio tab answered → open a fresh one (deep-links via ?step=).
      setTimeout(() => {
        if (!acked) window.open(url, '_blank');
        channel.close();
      }, 350);
    } catch {
      // BroadcastChannel unsupported → just open a new tab.
      window.open(url, '_blank');
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
    // The chip is only a still screenshot marker (not playable) and the clip
    // TIMING is already saved to Firestore, so it doesn't need to linger. Auto-
    // remove this chip from the on-screen slider after a short window.
    const timer = setTimeout(() => {
      this.ngZone.run(() => {
        const i = this.screenshots.indexOf(dataURL);
        if (i > -1) this.screenshots.splice(i, 1);
      });
      // keep the localStorage backup in sync
      try {
        const arr = JSON.parse(localStorage.getItem('screenshots') || '[]');
        const j = arr.indexOf(dataURL);
        if (j > -1) { arr.splice(j, 1); localStorage.setItem('screenshots', JSON.stringify(arr)); }
      } catch {}
      const t = this.clipChipTimers.indexOf(timer);
      if (t > -1) this.clipChipTimers.splice(t, 1);
    }, this.CLIP_CHIP_TTL_MS);
    this.clipChipTimers.push(timer);
  }

  clearScreenshots() {
    this.clipChipTimers.forEach(t => clearTimeout(t));
    this.clipChipTimers = [];
    localStorage.removeItem('screenshots');
    this.screenshots = [];
  }
}