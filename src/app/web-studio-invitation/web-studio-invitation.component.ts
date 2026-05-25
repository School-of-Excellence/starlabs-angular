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

  studioInvitation: Record<string, any> | null = null;
  studioInvitationPath: string | null = null;
  invitationSeconds: number = 0;
  invitationTotalSeconds: number = 0;
  joinLaterConfirm: boolean = false;
  invitationAccepted: boolean = false;

  private invitationDialogOpen: boolean = false;
  private studioInvitationUnsub: (() => void) | null = null;
  private invitationInterval: ReturnType<typeof setInterval> | null = null;
  private chimeInterval: ReturnType<typeof setInterval> | null = null;
  

  readonly RING_CIRCUMFERENCE = 2 * Math.PI * 54;

  constructor(private firestore: Firestore) {}

  ngOnInit(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.profileid && this.queueref && !this.studioInvitationUnsub) {
      this.StudioInvitationListener();
    }
  }

  ngOnDestroy(): void {
    this.studioInvitationUnsub?.();
    if (this.invitationInterval) clearInterval(this.invitationInterval);
    if (this.chimeInterval) { clearInterval(this.chimeInterval); this.chimeInterval = null; }
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