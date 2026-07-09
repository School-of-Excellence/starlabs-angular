import { Component, OnInit, NgZone, HostListener } from '@angular/core';
import { arrayUnion, collection, doc, docData, Firestore, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from '@angular/fire/firestore';
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

  // Safari-only custom control bar. Confirmed (bisect 2026-07-06): Safari does
  // NOT paint the Zoom SDK 6.1.0 control bar (present + clickable but invisible)
  // — inherent SDK/Safari bug, not fixable from CSS. So on Safari we render our
  // OWN bar (plain Angular DOM paints fine) wired to the real Zoom actions.
  isSafariBrowser = false;
  customMuted = false;
  private zoomUserId: number | string | null = null;

  // Custom mic/camera device menu (anchored to the caret). Zoom's own menu works
  // in Safari but appears dislocated, so we read its items and show them here.
  menuKind: '' | 'audio' | 'video' | 'more' = '';
  menuItems: { label: string; checked: boolean; header: boolean }[] = [];
  menuLeft = 0;          // px, anchored to the clicked caret
  menuBottom = 150;      // px from viewport bottom
  private nativeMenuItems: (HTMLElement | null)[] = [];

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

  // In-call popup shown after Prescribe ATC reuses an already-open Studio tab
  // (the browser can't foreground that tab for us, so we tell the host here).
  prescribeHintVisible: boolean = false;
  private prescribeHintTimer: any = null;

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
          const leaveWrite = updateDoc(ref, {
            specialistLeftAt: serverTimestamp(),
            participantLeftAt: serverTimestamp()
          }).catch(err => console.warn('Could not stamp leave on meeting end (host)', err));
          // Return the host to the Studio tab that launched this meeting instead
          // of loading a fresh /dynamicstudio via Zoom's leaveUrl (which spawns a
          // duplicate Studio). Pass the leave write so the tab isn't closed until
          // that stamp is durable. See returnToStudioTab().
          this.returnToStudioTab(leaveWrite);
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

  // When the host ends the call, go back to the EXISTING Dynamic Studio tab
  // instead of letting Zoom's `leaveUrl` load a fresh /dynamicstudio (which
  // leaves the original Studio open AND adds a duplicate). The host opened this
  // meeting from Studio via `window.open`, so that tab is our `window.opener`.
  // Ping it to come forward (BroadcastChannel, same one Prescribe ATC uses) and
  // close THIS tab — closing an opener-spawned tab returns the browser to the
  // opener, so the host lands back on their existing Studio page. If there's no
  // opener (deep-linked straight to /openmeeting), do nothing and let Zoom's
  // leaveUrl fallback run.
  private returnToStudioTab(leaveWrite?: Promise<unknown>): void {
    let opener: Window | null = null;
    try { opener = window.opener; } catch { opener = null; }
    if (!opener || opener.closed) return; // nothing to return to → leaveUrl fallback
    try {
      const ch = new BroadcastChannel('starlabs-dynamic-studio');
      ch.postMessage({ type: 'focus-studio' });
      setTimeout(() => { try { ch.close(); } catch {} }, 400);
    } catch { /* BroadcastChannel unsupported — window.close still returns to the opener */ }
    try { opener.focus(); } catch { /* cross-tab focus can be blocked; the close below still returns focus */ }
    // Close only once the leave stamp is durable — whichever comes first:
    //   • the write settles (server-ack when online → the stamp definitely
    //     landed), or
    //   • a 700ms cap (offline/slow: the mutation is already in Firestore's
    //     multi-tab IndexedDB queue, shared with the still-open Studio tab, so
    //     it syncs from there even though this tab goes away).
    // This prioritises the "Call ended" stamp over racing Zoom's leaveUrl,
    // instead of a blind fixed delay.
    const cap = new Promise<void>(res => setTimeout(res, 700));
    Promise.race([Promise.resolve(leaveWrite), cap])
      .then(() => { try { window.close(); } catch {} });
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
        // Zoom Client View (SDK 6.1.0) fires `onRecordingChange` with the state on
        // `data.recording` as a STRING — verified live: { recording: 'recording' }
        // while running, { recording: 'pause' } when paused (and 'stop'/'none'
        // shapes for stopped). Read `data.recording` FIRST; keep the other field
        // names + a numeric fallback for other SDK builds.
        let newStatus: 'started' | 'paused' | 'stopped' | 'unknown' = this.recordingStatus;
        const numeric =
          typeof data === 'number' ? data :
          typeof data?.state === 'number' ? data.state :
          typeof data?.action === 'number' ? data.action : null;
        if (numeric !== null) {
          // SDK numeric enum: { stop: 0, start: 1, pause: 2 }
          newStatus = numeric === 2 ? 'paused' : numeric === 1 ? 'started' : numeric === 0 ? 'stopped' : newStatus;
          console.log('[recording-prompt] status event code=', numeric, 'payload=', data);
        } else {
          const raw = (
            data?.recording ??
            data?.state ??
            data?.recordingStatus ??
            data?.status ??
            (typeof data === 'string' ? data : '')
          ).toString();
          const s: string = raw.toLowerCase();
          console.log('[recording-prompt] status event raw=', raw, 'payload=', data);
          // Order matters — "none"/"stop" must classify as stopped before the
          // 'record' check would label it 'started'. "pause"/"Paused" must hit the
          // paused branch before 'record' steals it.
          if (s.includes('not') || s.includes('stop') || s.includes('end') || s.includes('disconnect') || s.includes('none')) {
            newStatus = 'stopped';
          } else if (s.includes('paus')) {
            newStatus = 'paused';
          } else if (s.includes('start') || s.includes('record') || s.includes('connect') || s.includes('resume')) {
            newStatus = 'started';
          }
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
        }
        this.evaluateRecordingPrompt();
      };
      // The Client View SDK 6.1.0 event is `onRecordingChange` (verified against
      // the bundled SDK — it's the only recording event that exists). The names
      // used before, `onRecordingStatusChange` / `onRecordChange`, do NOT exist
      // in this SDK, so pause/stop was NEVER received → recordingStatus stayed
      // 'unknown' → the "resume recording" prompt never opened. Register the
      // correct event; keep the old names as harmless fallbacks for other builds.
      ZM.inMeetingServiceListener('onRecordingChange', handleRecordingChange);
      ZM.inMeetingServiceListener('onRecordingStatusChange', handleRecordingChange);
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

  // Called from the overlay's primary "Resume recording" button. The Meeting SDK
  // exposes no working record-control API (ZoomMtg.record is a no-op stub in
  // 6.1.0), BUT the Client View renders its toolbar into #zmmtg-root in THIS
  // document, so we can trigger Zoom's own Resume/Start Recording control by
  // clicking it directly. On success the SDK fires onRecordingChange → 'started'
  // which closes the prompt via evaluateRecordingPrompt; we also hide optimistically.
  resumeRecordingNow() {
    const root: ParentNode = document.getElementById('zmmtg-root') || document;
    // Paused → "Resume Recording"; stopped → a "Record"/"Start Recording" control.
    const wanted = this.recordingPromptKind === 'paused'
      ? ['resume recording']
      : ['resume recording', 'start recording', 'record'];
    const labelOf = (el: Element) =>
      (el.getAttribute('aria-label') || (el as HTMLElement).title || el.textContent || '').trim().toLowerCase();
    const matches = Array.from(root.querySelectorAll('button,[role="button"],[aria-label]'))
      .filter(el => wanted.some(w => labelOf(el) === w)) as HTMLElement[];
    // Prefer a visible control; fall back to any match.
    const btn = matches.find(el => el.offsetParent !== null || el.getClientRects().length > 0) || matches[0];
    if (btn) {
      btn.click();
      this.recordingPromptVisible = false;
    } else {
      console.warn('[recording-prompt] could not find Zoom Resume/Record control to click');
      this.snackBar.open(
        'Please use the Record control at the top of the Zoom window to resume.',
        'Close',
        { duration: 4000, horizontalPosition: 'center', verticalPosition: 'top' }
      );
    }
  }

  private stopRecordingListeners() {
    if (this.recordingPromptTimer) {
      clearInterval(this.recordingPromptTimer);
      this.recordingPromptTimer = null;
    }
    this.recordingPromptVisible = false;
  }
  // -------------------- end attention grabbers --------------------

  // ---- Safari-only custom control bar ----
  private safariSyncTimer: any = null;
  private initSafariControls(): void {
    // Reliable Safari detection: UA has "Safari" but none of the other engines
    // that also include "Safari" in their UA (Chrome/Chromium/CriOS/Edge/Android
    // WebView/Firefox-iOS). The previous negative-lookahead regex mis-fired.
    const ua = navigator.userAgent || '';
    const isSafari =
      /safari/i.test(ua) && !/chrome|chromium|crios|edg|edgios|android|fxios|opr|opera/i.test(ua);
    // Runs inside runOutsideAngular (join callback) — flip the flag inside the
    // zone or the *ngIf that shows the bar never re-evaluates.
    this.ngZone.run(() => { this.isSafariBrowser = isSafari; });
    if (!isSafari || this.safariSyncTimer) return;
    // Mirror the mic/video state from the NATIVE control bar's own button labels
    // ("Mute"/"Unmute", "Start Video"/"Stop Video") — the source of truth. The
    // earlier getCurrentUser/bVideoOn path was unreliable, so the toggle UI
    // lagged/reversed. Poll on a short timer; only re-enter Angular on a real
    // change. Runs outside Angular. Cleared in ngOnDestroy.
    this.ngZone.runOutsideAngular(() => {
      this.safariSyncTimer = setInterval(() => this.syncNativeState(), 500);
    });
    this.syncNativeState();
  }

  private stopSafariControls(): void {
    if (this.safariSyncTimer) { clearInterval(this.safariSyncTimer); this.safariSyncTimer = null; }
  }

  // Derive the true mic/video state from the native footer buttons' combined
  // text + aria-label ("Mute"/"Unmute" → muted; "Start/Stop Video" → off/on).
  // Robust to whether the SDK renders a visible label span or only aria.
  private syncNativeState(): void {
    const nodes = Array.from(document.querySelectorAll('#zmmtg-root .footer-button-base__button'));
    let muted: boolean | null = null;
    let videoOn: boolean | null = null;
    for (const el of nodes) {
      const t = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      if (muted === null && /\bmute\b|\bunmute\b/.test(t) && !/mute all/.test(t)) {
        muted = /unmute/.test(t);              // "unmute" shown ⇒ currently muted
      }
      if (videoOn === null && /\bvideo\b/.test(t)) {
        if (/stop/.test(t)) videoOn = true;    // "stop video" ⇒ on
        else if (/start/.test(t)) videoOn = false;
      }
    }
    const nextMuted = muted === null ? this.customMuted : muted;
    const nextVideo = videoOn === null ? this.customVideoOn : videoOn;
    if (nextMuted !== this.customMuted || nextVideo !== this.customVideoOn) {
      this.ngZone.run(() => { this.customMuted = nextMuted; this.customVideoOn = nextVideo; });
    }
  }

  toggleCustomMute(): void {
    // Click the native Mute/Unmute button; the poll reflects the new state.
    this.clickNativeControl(/\b(un)?mute\b/i);
  }

  leaveCall(): void {
    const ZM: any = ZoomMtg as any;
    try { ZM.leaveMeeting({}); }
    catch { try { ZM.leaveMeeting({ confirm: false }); } catch { /* no-op */ } }
  }

  // Host: end the meeting for everyone.
  endForAll(): void {
    const ZM: any = ZoomMtg as any;
    try { ZM.endMeeting({}); }
    catch { try { ZM.leaveMeeting({}); } catch { /* no-op */ } }
  }

  // ---- Controls with no Client-View API: click the (invisible) native button ----
  // The SDK control bar is in the DOM but unpainted in Safari; its buttons are
  // still real + clickable, so we proxy to them. Match by visible label text
  // (English — the app loads en-US) or aria-label.
  private clickNativeControl(match: RegExp): boolean {
    const nodes = document.querySelectorAll(
      '#zmmtg-root .footer-button-base__button, #zmmtg-root .footer__leave-btn, #zmmtg-root [class*="footer"][role="button"]'
    );
    for (const el of Array.from(nodes)) {
      const t = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).trim();
      if (match.test(t)) { (el as HTMLElement).click(); return true; }
    }
    return false;
  }

  // Camera on/off — no Client-View API, so click the native Start/Stop Video
  // button. The native-state poll (syncNativeState) reflects the real state.
  customVideoOn = false;
  toggleVideo(): void {
    this.clickNativeControl(/\bvideo\b/i);
  }

  // Screen share — click the native Share button (API path is unreliable here).
  shareScreen(): void {
    const ZM: any = ZoomMtg as any;
    try { if (typeof ZM.startScreenShare === 'function') { ZM.startScreenShare({}); return; } } catch { /* fall through */ }
    this.clickNativeControl(/\bshare\b/i);
  }

  // Participants panel / Chat panel — toggle the native panels (they render as
  // side panels, which DO paint; only the bottom bar was the problem).
  toggleParticipants(): void { this.clickNativeControl(/participant/i); }
  toggleChat(): void { this.clickNativeControl(/\bchat\b/i); }

  // Raise / lower hand.
  customHandRaised = false;
  toggleHand(): void {
    const ZM: any = ZoomMtg as any;
    const next = !this.customHandRaised;
    try {
      if (next && typeof ZM.raiseHand === 'function') ZM.raiseHand({});
      else if (!next && typeof ZM.lowerHand === 'function') ZM.lowerHand({});
      else this.clickNativeControl(/hand/i);
      this.customHandRaised = next;
    } catch { this.clickNativeControl(/hand/i); }
  }

  // ---- Device / More dropdowns, anchored to the clicked button ----
  toggleDeviceMenu(kind: 'audio' | 'video' | 'more', ev: Event): void {
    ev.stopPropagation();
    if (this.menuKind === kind) { this.closeDeviceMenu(); return; }
    // Anchor the menu above the clicked control (clamped to the viewport).
    const caret = ev.currentTarget as HTMLElement;
    const r = caret.getBoundingClientRect();
    this.menuLeft = Math.max(8, Math.min(r.left + r.width / 2 - 140, window.innerWidth - 288));
    this.menuBottom = Math.max(8, window.innerHeight - r.top + 8);
    // Open Zoom's native menu (it paints in Safari), read its items, then hide
    // it and show our own copy anchored here. Two reads (fast + slower) in case
    // the portal renders late.
    if (kind === 'more') this.clickNativeMore();
    else this.clickNativeControl(kind === 'audio' ? /more audio/i : /more video/i);
    setTimeout(() => this.readNativeMenu(kind), 120);
    setTimeout(() => { if (this.menuKind === kind && this.menuItems.length <= 1) this.readNativeMenu(kind); }, 380);
  }

  // The standalone "More" button (label "More" / "More meeting controls") — NOT
  // the "More audio/video controls" carets.
  private clickNativeMore(): boolean {
    const nodes = document.querySelectorAll('#zmmtg-root .footer-button-base__button');
    for (const el of Array.from(nodes)) {
      const t = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      if (/\bmore\b/.test(t) && !/audio|video/.test(t)) { (el as HTMLElement).click(); return true; }
    }
    return false;
  }

  // Find the device menu for THIS kind only — search strictly within the kind's
  // own `.audio-option-menu` / `.video-option-menu` subtree (searching generic
  // dropdowns cross-matched the wrong menu).
  private findDeviceMenu(kind: 'audio' | 'video' | 'more'): Element | null {
    if (kind === 'more') {
      // The More popup — a visible dropdown/menu that is NOT the audio/video
      // option menu. Pick the visible one with the most items.
      const cands = Array.from(document.querySelectorAll(
        '.more-button__pop-menu, [class*="more"][class*="menu"], .dropdown-menu, [role="menu"], [class*="option-menu"]'
      ));
      let best: Element | null = null; let bestN = 0;
      for (const c of cands) {
        if (c.closest('.audio-option-menu, .video-option-menu')) continue;
        if (/audio-option|video-option/.test('' + (c as HTMLElement).className)) continue;
        if (!c.getClientRects().length) continue;
        const n = c.querySelectorAll('a, li').length;
        if (n > bestN) { bestN = n; best = c; }
      }
      return best;
    }
    const base = kind === 'audio' ? '.audio-option-menu' : '.video-option-menu';
    const cands = Array.from(document.querySelectorAll(
      `${base}, ${base} .dropdown-menu, ${base} ul, ${base} [role="menu"]`
    ));
    let best: Element | null = null; let bestN = 0;
    for (const c of cands) {
      if (!c.getClientRects().length) continue;          // not rendered
      const n = c.querySelectorAll('a, li').length;
      if (n > bestN) { bestN = n; best = c; }
    }
    return best || document.querySelector(base);
  }

  private readNativeMenu(kind: 'audio' | 'video' | 'more'): void {
    const menu = this.findDeviceMenu(kind);
    const items: { label: string; checked: boolean; header: boolean }[] = [];
    const refs: (HTMLElement | null)[] = [];
    if (menu) {
      const rows = Array.from(menu.querySelectorAll('li, a, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'));
      const seen = new Set<string>();
      for (const row of rows) {
        // Skip a container li that only wraps an <a> we'll also see.
        if (row.tagName === 'LI' && row.querySelector('a, [role^="menuitem"]')) continue;
        const label = (row.textContent || '').replace(/\s+/g, ' ').trim();
        if (!label || label.length > 90 || seen.has(label)) continue;
        seen.add(label);
        const clickable = row.tagName === 'A' || /menuitem/i.test(row.getAttribute('role') || '') || !!(row as HTMLElement).onclick;
        const cls = '' + (row as HTMLElement).className;
        const checked = /checked|selected|active/i.test(cls) || row.getAttribute('aria-checked') === 'true'
          || !!row.querySelector('[class*="check"], [class*="selected"], .zm-icon-checkmark');
        items.push({ label, checked, header: !clickable });
        refs.push(row as HTMLElement);
      }
    }
    // Hide the native (dislocated) menu now that we've mirrored it.
    if (menu) { (menu as HTMLElement).style.visibility = 'hidden'; }
    this.nativeMenuItems = refs;
    this.ngZone.run(() => { this.menuItems = items; this.menuKind = kind; });
  }

  clickDeviceItem(i: number, item: { header: boolean }): void {
    if (item.header) return;
    const el = this.nativeMenuItems[i];
    if (el) { el.style.visibility = ''; el.click(); }
    this.closeDeviceMenu();
  }

  closeDeviceMenu(): void {
    this.nativeMenuItems = [];
    this.ngZone.run(() => { this.menuKind = ''; this.menuItems = []; });
    try { document.body.click(); } catch { /* dismiss native popup */ }
  }

  // Close on any click outside the menu/pill (both stop propagation).
  @HostListener('document:click')

  ngOnDestroy() {
    window.removeEventListener('keydown', this.boundKeyDown);
    this.stopSafariControls();
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
          // Host lands back on their Dynamic Studio; a participant is sent to
          // the queue web screen (NOT the participant studio) after the host
          // ends the call.
          leaveUrl: this.profileHost
            ? `${window.location.origin}/dynamicstudio`
            : `${window.location.origin}/queue-web`,
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

                // Safari: stand up our own control bar (SDK bar is invisible in
                // Safari). No-op on Chrome.
                this.initSafariControls();

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

  onClick() {
    const clipTiming = {
      timestamp: new Date().toISOString(),
      capturedby: this.profileid
    };
    // Give instant feedback — the snackbar and the frame grab must NOT wait on
    // Firestore. Previously the snackbar only appeared after an awaited getDoc +
    // updateDoc round-trip, so "capture" felt sluggish.
    this.showPopup();
    this.captureScreenshot();
    // Persist the clip timing in the background. arrayUnion appends atomically,
    // so we skip the read-modify-write getDoc entirely (one round-trip, not two).
    updateDoc(doc(this.firestore, 'live assignment', this.zoomdata['docid']), {
      cliptimings: arrayUnion(clipTiming)
    })
      .then(() => console.log('Clip timing updated successfully:', clipTiming))
      .catch(error => console.error('Error updating clip timing:', error));
  }

  // For now: just open the Prescribe ATC step in a new tab (front). The stable
  // window name makes repeat clicks reuse + refocus that same tab. Zoom call is
  // never navigated.
  goToPrescribeAtc() {
    const url = `${window.location.origin}/dynamicstudio?step=prescribe-atc`;
    window.open(url, 'starlabsDynamicStudio');
  }

  private showPrescribeHint() {
    this.prescribeHintVisible = true;
    if (this.prescribeHintTimer) clearTimeout(this.prescribeHintTimer);
    // Auto-dismiss so it doesn't linger over the call.
    this.prescribeHintTimer = setTimeout(
      () => this.ngZone.run(() => { this.prescribeHintVisible = false; }),
      12000
    );
  }

  dismissPrescribeHint() {
    this.prescribeHintVisible = false;
    if (this.prescribeHintTimer) { clearTimeout(this.prescribeHintTimer); this.prescribeHintTimer = null; }
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