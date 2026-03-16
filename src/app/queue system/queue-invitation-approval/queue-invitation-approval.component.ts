import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subscription, timer } from 'rxjs';

type GameType = 'target' | 'memory';

@Component({
  selector: 'app-queue-invitation-approval',
  imports: [
    CommonModule,
    MatButtonModule
  ],
  templateUrl: './queue-invitation-approval.component.html',
  styleUrls: ['./queue-invitation-approval.component.css']
})
export class QueueInvitationApprovalComponent implements OnInit, OnDestroy {

  subscription!: Subscription;
  expiryInSeconds!: number;

  // GAME STATE
  gameActive = true;
  activeGame: GameType = 'target';
  score = 0;

  // TARGET GAME
  target = { x: 0, y: 0 };
  targetTimeout: any;

  // MEMORY GAME
  emojis = ['🎮','🎯','🎲','🎪','🎨','🎭','🎸','🎺'];
  cards: any[] = [];
  flipped: any[] = [];

  constructor(
    public dialogRef: MatDialogRef<QueueInvitationApprovalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit(): void {
    this.initMemoryGame();
    this.spawnTarget();

    this.subscription = timer(0, 1000).subscribe(() => {
      this.expiryInSeconds = this.getTimeDiff();

      if (this.expiryInSeconds <= 0) {
        this.gameActive = false;
        this.subscription.unsubscribe();
        if (this.targetTimeout) clearTimeout(this.targetTimeout);
        this.dialogRef.close('invitation cancelled');
      }
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
    if (this.targetTimeout) clearTimeout(this.targetTimeout);
  }

  getTimeDiff(): number {
    const expiry = this.data.expirydate.toDate().getTime();
    return Math.max(0, Math.trunc((expiry - Date.now()) / 1000));
  }

  /* ---------------- TARGET GAME ---------------- */

  spawnTarget() {
    if (!this.gameActive || this.activeGame !== 'target') return;

    this.target = {
      x: Math.random() * 85,
      y: Math.random() * 85
    };

    // Auto-respawn after 1.5 seconds
    if (this.targetTimeout) clearTimeout(this.targetTimeout);
    this.targetTimeout = setTimeout(() => {
      if (this.gameActive && this.activeGame === 'target') {
        this.spawnTarget();
      }
    }, 1000);
  }

  effects: { id: number; x: number; y: number; text: string }[] = [];
  effectId = 0;

  hitTarget() {
    if (!this.gameActive) return;

    this.score += 10;

    // add +10 effect
    const id = this.effectId++;
    this.effects.push({
      id,
      x: this.target.x,
      y: this.target.y,
      text: '+10'
    });

    // remove effect after animation
    setTimeout(() => {
      this.effects = this.effects.filter(e => e.id !== id);
    }, 600);

    this.spawnTarget();
  }

  /* ---------------- MEMORY GAME ---------------- */

  initMemoryGame() {
    const deck = [...this.emojis, ...this.emojis]
      .sort(() => Math.random() - 0.5)
      .map(e => ({ emoji: e, flipped: false, matched: false }));

    this.cards = deck;
    this.flipped = [];
  }

  flipCard(card: any) {
    if (!this.gameActive || card.flipped || card.matched || this.flipped.length === 2) return;

    card.flipped = true;
    this.flipped.push(card);

    if (this.flipped.length === 2) {
      setTimeout(() => this.checkMatch(), 600);
    }
  }

  checkMatch() {
    const [a, b] = this.flipped;

    if (a.emoji === b.emoji) {
      a.matched = b.matched = true;
      this.score += 20;
      
      // Check if all matched
      if (this.cards.every(c => c.matched)) {
        this.score += 50;
      }
    } else {
      a.flipped = b.flipped = false;
    }

    this.flipped = [];
  }

  /* ---------------- UI ---------------- */

  switchGame(game: GameType) {
    this.activeGame = game;
    if (this.targetTimeout) clearTimeout(this.targetTimeout);
    
    if (game === 'target') {
      this.spawnTarget();
    }
    if (game === 'memory') {
      this.initMemoryGame();
    }
  }

  cancel() {
    this.dialogRef.close('invitation cancelled');
  }
}