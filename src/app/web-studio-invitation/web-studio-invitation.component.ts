import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import {Firestore, collection, doc, query, where, onSnapshot, updateDoc, DocumentReference} from '@angular/fire/firestore';

@Component({
  selector: 'app-web-studio-invitation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './web-studio-invitation.component.html',
  styleUrls: ['./web-studio-invitation.component.css']
})
export class WebStudioInvitationComponent implements OnInit, OnChanges, OnDestroy {

  @Input() profileid!: string;
  @Input() queueref!: DocumentReference;
  @Input() useremail: string = '';
  // True once the specialist has assigned this participant to the studio
  // (queue token status === 'instudio'). Bound from queue-web's isInStudio().
  // When it flips true we dismiss the accepted/waiting overlay so the Join
  // Meeting screen underneath becomes visible.
  @Input() inStudio: boolean = false;
  // True when the participant is actively engaged in another queue-web screen
  // (an inline form, Evolution Mapping, or already in-studio). While this is
  // true the "Invitation Accepted / waiting" overlay is suppressed so it can't
  // block those screens — e.g. a stale/leftover approved invite must not cover a
  // form the participant is filling. Bound from queue-web.
  @Input() busyElsewhere: boolean = false;

  studioInvitation: Record<string, any> | null = null;
  studioInvitationPath: string | null = null;
  invitationSeconds: number = 0;
  invitationTotalSeconds: number = 0;
  joinLaterConfirm: boolean = false;
  invitationAccepted: boolean = false;
  // After the participant taps "Got it", we keep a persistent "Invitation
  // Accepted — waiting for the specialist" status instead of dropping them back
  // on the bare queue screen. Cleared when they go instudio (Join Meeting).
  waitingForStudio: boolean = false;

  private invitationDialogOpen: boolean = false;
  private studioInvitationUnsub: (() => void) | null = null;
  private approvedInvitationUnsub: (() => void) | null = null;
  private invitationInterval: ReturnType<typeof setInterval> | null = null;
  private chimeInterval: ReturnType<typeof setInterval> | null = null;
  

  readonly RING_CIRCUMFERENCE = 2 * Math.PI * 54;

  constructor(private firestore: Firestore) {}

  ngOnInit(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.profileid && this.queueref && !this.studioInvitationUnsub) {
      this.StudioInvitationListener();
    }
    if (this.profileid && this.queueref && !this.approvedInvitationUnsub) {
      this.ApprovedInvitationListener();
    }
    // Specialist has brought the participant into the studio → drop the
    // accepted/waiting overlay so the Join Meeting screen shows through.
    if (changes['inStudio'] && this.inStudio && (this.invitationAccepted || this.waitingForStudio)) {
      this._closeInvitation();
    }
    // Participant moved into another queue-web screen (form / evolution mapping
    // / studio) → drop the waiting overlay so it can't block that screen. The
    // approved-invite listener will re-surface it if they come back and it's
    // still genuinely pending.
    if (changes['busyElsewhere'] && this.busyElsewhere && (this.invitationAccepted || this.waitingForStudio)) {
      this._closeInvitation();
    }
  }

  ngOnDestroy(): void {
    this.studioInvitationUnsub?.();
    this.approvedInvitationUnsub?.();
    if (this.invitationInterval) clearInterval(this.invitationInterval);
    if (this.chimeInterval) { clearInterval(this.chimeInterval); this.chimeInterval = null; }
  }

  // Reload-robust waiting state. The pending-invite listener only queries
  // `clientresponse == null`, so after a refresh an already-accepted (approved)
  // invite is invisible to it and the "waiting for the specialist" card is lost.
  // This second listener re-surfaces that status on load and clears it if the
  // approved invite disappears (the specialist assigns → the invite doc is
  // deleted, and `inStudio` also flips so the Join Meeting screen shows).
  private ApprovedInvitationListener(): void {
    // Equality-only query (no composite index needed); staleness + newest-first
    // are handled in code below.
    const q = query(
      collection(this.firestore, 'studioinvitation'),
      where('profileid',      '==', this.profileid),
      where('queueref',       '==', this.queueref),
      where('clientresponse', '==', 'approved')
    );

    this.approvedInvitationUnsub = onSnapshot(q, (snap) => {
      if (this.inStudio) return; // already assigned → Join Meeting governs
      // Don't surface (or resurface) the waiting overlay while the participant is
      // busy on another screen — it would block that screen.
      if (this.busyElsewhere) return;
      // A live pending-invitation overlay takes precedence — never stack the
      // waiting card on top of a fresh invite the participant still has to act on.
      const pendingOverlayOpen = this.invitationDialogOpen && !this.invitationAccepted && !!this.studioInvitation;
      // Ignore STALE approved invites: an invite whose expiry has already passed
      // (e.g. a leftover round-robin invite that was never assigned/cleaned up)
      // must not resurface the blocking overlay on a normal queue visit. A
      // genuine just-accepted invite still has its expiry in the future. Pick the
      // newest non-expired approved invite, in code (no orderBy/index).
      const nowMs = Date.now();
      const fresh = snap.docs
        .filter(d => (d.data()['expirydate']?.toDate?.().getTime?.() ?? 0) > nowMs)
        .sort((a, b) => b.data()['expirydate'].toDate().getTime() - a.data()['expirydate'].toDate().getTime());
      const notStale = fresh.length > 0;
      if (notStale) {
        // Only auto-restore on a fresh load. During an in-session accept the
        // success card (invitationAccepted && !waitingForStudio) is already up
        // and its "Got it" drives the transition — don't skip past it.
        if (!pendingOverlayOpen && !this.invitationAccepted && !this.waitingForStudio) {
          this.invitationAccepted = true;
          this.waitingForStudio   = true;
        }
      } else if (this.waitingForStudio && !this.inStudio) {
        // Approved invite gone or expired while still waiting → back to queue.
        this._closeInvitation();
      }
    });
  }

  private StudioInvitationListener(): void {

    // Keep the `expirydate > now` filter in the query (server-side). This uses
    // the ASCENDING composite index that already exists in every project — only
    // a DESCENDING `orderBy` would have needed a new index, so we still pick the
    // newest in code (below) rather than via orderBy.
    const q = query(
      collection(this.firestore, 'studioinvitation'),
      where('profileid',      '==', this.profileid),
      where('queueref',       '==', this.queueref),
      where('clientresponse', '==', null),
      where('expirydate',     '>',  new Date())
    );

    this.studioInvitationUnsub = onSnapshot(q, (snap) => {
      // The query already excludes expired invites; sort what's left NEWEST-first
      // (latest expirydate == most recently created) and take [0]. The client
      // filter is kept as a belt-and-braces guard against clock skew.
      const nowMs = Date.now();
      const docs = snap.docs
        .filter(d => (d.data()['expirydate']?.toDate?.().getTime?.() ?? 0) > nowMs)
        .sort((a, b) => b.data()['expirydate'].toDate().getTime() - a.data()['expirydate'].toDate().getTime());

      if (docs.length === 0) {
        if (this.invitationDialogOpen && !this.invitationAccepted) {
          this._closeInvitation();
        }
        return;
      }

      const invDoc = docs[0];
      const invData = invDoc.data();
      // Countdown START value. Prefer the invite's intended window
      // (`durationSeconds`, a plain number) so the timer is driven purely by a
      // LOCAL 1-second interval — immune to clock skew / timezone differences
      // between the specialist and participant devices (a device's clock can be
      // wrong, but it still measures elapsed seconds correctly). Only fall back
      // to the clock-based `expirydate − now` for older invites that predate the
      // `durationSeconds` field.
      const durationSec = Number(invData['durationSeconds']);
      const startSeconds = (!isNaN(durationSec) && durationSec > 0)
        ? durationSec
        : Math.floor((invData['expirydate'].toDate().getTime() - Date.now()) / 1000);

      if (startSeconds <= 0) return;

      if (!this.invitationDialogOpen) {
        this.invitationDialogOpen   = true;
        this.studioInvitationPath   = invDoc.ref.path;
        this.studioInvitation       = invData;
        this.invitationSeconds      = startSeconds;
        this.invitationTotalSeconds = startSeconds;
        this.joinLaterConfirm       = false;
        this.invitationAccepted     = false;
        // A fresh pending invitation supersedes any leftover "waiting for the
        // specialist" state (e.g. a prior approved invite that was never
        // assigned) — the participant must act on this new invite first, so the
        // overlay takes precedence over the waiting card.
        this.waitingForStudio       = false;

        if (this.invitationInterval) clearInterval(this.invitationInterval);
        this.invitationInterval = setInterval(() => {
          if (this.invitationSeconds > 0) {
            this.invitationSeconds--;
          } else {
            clearInterval(this.invitationInterval!);
            this.invitationInterval = null;
            if (!this.invitationAccepted) this._closeInvitation();
          }
        }, 1000);

        this.playChime();
        this.chimeInterval = setInterval(() => this.playChime(), 2000);

      }
      // (No else re-sync: once the dialog is open the LOCAL interval owns the
      // countdown. Re-reading a clock-based remaining here would reintroduce
      // skew and cause the timer to jump.)
    });
  }

  _closeInvitation(): void {
    if (this.invitationInterval) { clearInterval(this.invitationInterval); this.invitationInterval = null; }
    if (this.chimeInterval) { clearInterval(this.chimeInterval); this.chimeInterval = null; }
    this.invitationDialogOpen   = false;
    this.studioInvitation       = null;
    this.studioInvitationPath   = null;
    this.invitationSeconds      = 0;
    this.invitationTotalSeconds = 0;
    this.joinLaterConfirm       = false;
    this.invitationAccepted     = false;
    this.waitingForStudio       = false;
  }

  // "Got it, Thanks!" — the participant has read the acceptance confirmation.
  // Instead of closing back to the bare queue, keep a persistent "waiting for
  // the specialist" status until they're assigned to the studio (inStudio).
  acknowledgeAccepted(): void {
    this.waitingForStudio = true;
  }

  async acceptInvitation(): Promise<void> {
    if (this.invitationInterval) clearInterval(this.invitationInterval);
    if (this.chimeInterval) { clearInterval(this.chimeInterval); this.chimeInterval = null; }
    this.invitationAccepted = true;
    try {
      await updateDoc(doc(this.firestore, this.studioInvitationPath!), { clientresponse: 'approved' });
    } catch (err) { console.error('Accept invitation error', err); }
  }

  onJoinLater(): void {
    if (this.chimeInterval) { clearInterval(this.chimeInterval); this.chimeInterval = null; }
    this.joinLaterConfirm = true;
  }

  async confirmJoinLater(): Promise<void> {
    try {
      await updateDoc(doc(this.firestore, this.studioInvitationPath!), { clientresponse: 'denied' });
    } catch (err) { console.error('Deny invitation error', err); }
    this._closeInvitation();
  }

  get invitationRingOffset(): number {
    if (this.invitationTotalSeconds === 0) return this.RING_CIRCUMFERENCE;
    return this.RING_CIRCUMFERENCE * (1 - this.invitationSeconds / this.invitationTotalSeconds);
  }

  formatInvitationTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}`;
  }

  get isInvitationUrgent(): boolean {
    return this.invitationSeconds <= 15 && this.invitationSeconds > 0;
  }

  private playChime(): void {
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume().then(() => {
        const now = ctx.currentTime;
        const tone = (freq: number, start: number, dur: number, vol: number, wave: OscillatorType = 'triangle') => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = wave;
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(vol, start + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
          osc.start(start);
          osc.stop(start + dur);
        };
        tone(528,  now,        1.2, 0.06);  
        tone(660,  now + 0.20, 1.2, 0.07);  
        tone(792,  now + 0.40, 1.2, 0.07);  
        tone(1056, now + 0.65, 1.8, 0.08);  
      });
    } catch (e) {}
  }
}