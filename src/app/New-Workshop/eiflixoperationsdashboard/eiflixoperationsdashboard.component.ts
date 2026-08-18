import { Component, OnDestroy, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject, takeUntil } from 'rxjs';

/**
 * One stat card on the operations dashboard. The dashboard is config-driven:
 * add a new entry to `cards` (plus its bucket rule in splitUsers) and the
 * grid, counts and side panel all pick it up with zero template changes.
 */
interface OpsCard {
  key: string;
  title: string;
  caption: string;
  icon: string;
  accent: 'indigo' | 'emerald';
  /** Full Firestore docs for this bucket — the panel receives everything. */
  users: any[];
  /** Animated display value (counts up to users.length). */
  displayCount: number;
  /** Pending count-up frame, cancelled when a newer emission arrives. */
  rafId?: number;
}

@Component({
  selector: 'app-eiflixoperationsdashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule, A11yModule],
  templateUrl: './eiflixoperationsdashboard.component.html',
  styleUrl: './eiflixoperationsdashboard.component.css',
  animations: [
    trigger('fade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('240ms ease', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease', style({ opacity: 0 }))
      ])
    ]),
    trigger('slide', [
      transition(':enter', [
        style({ transform: 'translateX(100%)' }),
        animate('340ms cubic-bezier(0.22, 1, 0.36, 1)', style({ transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('240ms cubic-bezier(0.55, 0, 0.55, 0.2)', style({ transform: 'translateX(100%)' }))
      ])
    ])
  ]
})
export class EiflixoperationsdashboardComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private destroy$ = new Subject<void>();

  readonly reducedMotion =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  today = new Date();
  loading = true;
  loadError = false;

  cards: OpsCard[] = [
    {
      key: 'total-new-users',
      title: 'Total New Users',
      caption: 'Signed up · not yet moved to paid',
      icon: 'person_add',
      accent: 'indigo',
      users: [],
      displayCount: 0
    },
    {
      key: 'new-users-to-paid',
      title: 'New Users to Paid',
      caption: 'Moved to existing / paid profiles',
      icon: 'workspace_premium',
      accent: 'emerald',
      users: [],
      displayCount: 0
    }
  ];

  activeCard: OpsCard | null = null;

  ngOnInit(): void {
    const ref = collection(this.firestore, 'new_user_data');
    collectionData(ref, { idField: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.splitUsers(data);
          this.loading = false;
          this.loadError = false;
        },
        error: (err) => {
          console.error('eiflixoperationsdashboard: new_user_data load failed', err);
          this.loading = false;
          this.loadError = true;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (typeof cancelAnimationFrame !== 'undefined') {
      for (const card of this.cards) {
        if (card.rafId !== undefined) cancelAnimationFrame(card.rafId);
      }
    }
    this.unlockScroll();
  }

  /**
   * Bucket the raw docs into the cards, newest first. Display strings are
   * precomputed once per emission so change detection never re-formats rows.
   */
  private splitUsers(data: any[]): void {
    const sorted = data
      .map(u => ({
        ...u,
        createdLabel: this.formatCreated(u.created),
        initialsLabel: this.initials(u.name)
      }))
      .sort((a, b) => (this.toDate(b.created)?.getTime() || 0) - (this.toDate(a.created)?.getTime() || 0));
    for (const card of this.cards) {
      card.users = sorted.filter(u =>
        card.key === 'new-users-to-paid' ? u.movedtoexist === true : u.movedtoexist !== true
      );
      this.animateCount(card, card.users.length);
    }
    // Keep an open panel in sync with realtime updates.
    if (this.activeCard) {
      this.activeCard = this.cards.find(c => c.key === this.activeCard!.key) || null;
    }
  }

  /** Ease the card number from its current value to the new total. */
  private animateCount(card: OpsCard, to: number): void {
    if (card.rafId !== undefined && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(card.rafId);
      card.rafId = undefined;
    }
    if (this.reducedMotion || typeof requestAnimationFrame === 'undefined' || card.displayCount === to) {
      card.displayCount = to;
      return;
    }
    const from = card.displayCount;
    const duration = 700;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      card.displayCount = Math.round(from + (to - from) * eased);
      card.rafId = t < 1 ? requestAnimationFrame(tick) : undefined;
    };
    card.rafId = requestAnimationFrame(tick);
  }

  openPanel(card: OpsCard): void {
    this.activeCard = card;
    this.lockScroll();
  }

  closePanel(): void {
    this.activeCard = null;
    this.unlockScroll();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.activeCard) this.closePanel();
  }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    return new Date(value);
  }

  private formatCreated(value: any): string {
    const date = this.toDate(value);
    return date ? formatDate(date, 'MMM d, y · h:mm a', 'en-US') : '—';
  }

  initials(name: string | undefined | null): string {
    if (!name?.trim()) return '·';
    const parts = name.trim().split(/\s+/);
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  private lockScroll(): void {
    if (typeof document !== 'undefined') document.body.classList.add('eod-scroll-lock');
  }

  private unlockScroll(): void {
    if (typeof document !== 'undefined') document.body.classList.remove('eod-scroll-lock');
  }
}
