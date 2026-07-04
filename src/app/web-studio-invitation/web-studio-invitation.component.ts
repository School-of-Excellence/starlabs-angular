import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import {Firestore, collection, doc, query, where, limit,onSnapshot, updateDoc, DocumentReference} from '@angular/fire/firestore';

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
    const q = query(
      collection(this.firestore, 'studioinvitation'),
      where('profileid',      '==', this.profileid),
      where('queueref',       '==', this.queueref),
      where('clientresponse', '==', 'approved'),
      limit(1)
    );

    this.approvedInvitationUnsub = onSnapshot(q, (snap) => {
      if (this.inStudio) return; // already assigned → Join Meeting governs
      // A live pending-invitation overlay takes precedence — never stack the
      // waiting card on top of a fresh invite the participant still has to act on.
      const pendingOverlayOpen = this.invitationDialogOpen && !this.invitationAccepted && !!this.studioInvitation;
      if (!snap.empty) {
        // Only auto-restore on a fresh load. During an in-session accept the
        // success card (invitationAccepted && !waitingForStudio) is already up
        // and its "Got it" drives the transition — don't skip past it.
        if (!pendingOverlayOpen && !this.invitationAccepted && !this.waitingForStudio) {
          this.invitationAccepted = true;
          this.waitingForStudio   = true;
        }
      } else if (this.waitingForStudio && !this.inStudio) {
        // Approved invite gone while still waiting (not assigned) → back to queue.
        this._closeInvitation();
      }
    });
  }

  private StudioInvitationListener(): void {

    const q = query(
      collection(this.firestore, 'studioinvitation'),
      where('profileid',      '==', this.profileid),
      where('queueref',       '==', this.queueref),
      where('clientresponse', '==', null),
      where('expirydate',     '>',  new Date()),
      limit(1)
    );

    this.studioInvitationUnsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        if (this.invitationDialogOpen && !this.invitationAccepted) {
          this._closeInvitation();
        }
        return;
      }

      const invDoc = snap.docs[0];
      const invData = invDoc.data();
      const secondsRemaining = Math.floor(
        (invData['expirydate'].toDate().getTime() - Date.now()) / 1000
      );

      if (secondsRemaining <= 0) return;

      if (!this.invitationDialogOpen) {
        this.invitationDialogOpen   = true;
        this.studioInvitationPath   = invDoc.ref.path;
        this.studioInvitation       = invData;
        this.invitationSeconds      = secondsRemaining;
        this.invitationTotalSeconds = secondsRemaining;
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

      } else {
        this.invitationSeconds = secondsRemaining;
      }
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