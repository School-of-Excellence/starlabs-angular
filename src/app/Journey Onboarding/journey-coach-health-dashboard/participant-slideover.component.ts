import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  Firestore, collection, query, where, getDocs,
} from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { HealthState } from './health-score.engine';
import { LogCallDialogComponent } from './log-call-dialog.component';
import { SetHealthStateDialogComponent } from './set-health-state-dialog.component';

/** Minimal shape of a portfolio row this panel reads. Mirrors the dashboard's PortfolioRow
 *  (kept structural so we don't need to export the dashboard's private interface). */
export interface SlideoverRow {
  profileid: string;
  name: string;
  number: string | null;
  atcmodel: string | null;
  productType: string;
  journeyname: string;
  journeystatus: string;
  customerstatus: string | null;
  financialstatus: string | null;
  subscriptionend: Date | null;
  daysToRenewal: number | null;
  lastcoachdate: Date | null;
  daysSinceCoach: number | null;
  openTickets: number;
  recentEventRequest: { eventName: string; date: Date | null; status: string } | null;
  coachHealthState: { state: HealthState; note: string; date: Date | null } | null;
  priority: number;
  priorityBand: 'High' | 'Medium' | 'Low';
  reason: string;
  goingQuiet: boolean;
  renewalWindow: boolean;
  lapsed: boolean;
  notStarted: boolean;
  balance: number | null;
  totalpurchasevalue: number | null;
}

interface TicketItem { subject: string; status: string; date: Date | null; }
interface EventItem { eventName: string; date: Date | null; status: string; }
interface TouchpointItem { date: Date | null; outcome: string | null; note: string; contacted: boolean; }

type TimelineItem =
  | { kind: 'touchpoint'; date: Date | null; outcome: string | null; note: string; contacted: boolean }
  | { kind: 'event'; date: Date | null; eventName: string; status: string };

/**
 * Participant slide-over: a right-side overlay sheet opened from the dashboard's name cell.
 * Receives the in-memory PortfolioRow via MAT_DIALOG_DATA and, on init, runs single-profile
 * scoped reads (same collections/fields as the parent's loaders) for tickets, event requests
 * and touchpoints — so the coach gets the full picture without navigating to /userprofile.
 * Touchpoint reads are guarded: on permission-denied (prod rules not yet deployed) it degrades
 * gracefully instead of failing the whole panel.
 */
@Component({
  selector: 'app-participant-slideover',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule,
  ],
  providers: [DatePipe],
  template: `
    <div class="so-root">
      <!-- Header -->
      <header class="so-header">
        <div class="so-id">
          <h2 class="so-name">{{ row.name }}</h2>
          <div class="so-meta">
            <span class="so-num">{{ row.number || '—' }}</span>
            <span class="so-dot">·</span>
            <span class="so-tier">{{ row.atcmodel || 'No tier' }}</span>
          </div>
        </div>
        <button class="so-close" type="button" matTooltip="Close" aria-label="Close panel" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <div class="so-pills">
        <span class="so-pill" [ngClass]="bandClass(row.priorityBand)">
          {{ row.priorityBand }} · {{ row.priority }}
        </span>
        <span class="so-chip" *ngIf="row.customerstatus">{{ row.customerstatus }}</span>
        <span class="so-chip so-chip-quiet" *ngIf="row.goingQuiet">Going quiet</span>
      </div>

      <p class="so-reason" *ngIf="row.reason">{{ row.reason }}</p>

      <div class="so-body">
        <!-- Journey -->
        <section class="so-sec">
          <h3 class="so-sec-h">Journey</h3>
          <dl class="so-kv">
            <div><dt>Journey</dt><dd>{{ row.journeyname || '—' }}</dd></div>
            <div><dt>Status</dt><dd>{{ row.journeystatus || '—' }}</dd></div>
            <div><dt>Product</dt><dd class="cap">{{ row.productType || '—' }}</dd></div>
          </dl>
        </section>

        <!-- Finance -->
        <section class="so-sec">
          <h3 class="so-sec-h">Finance</h3>
          <dl class="so-kv">
            <div><dt>Financial status</dt><dd>{{ row.financialstatus || '—' }}</dd></div>
            <div><dt>Balance</dt><dd class="num">{{ row.balance != null ? (row.balance | number) : '—' }}</dd></div>
            <div><dt>Total purchase</dt><dd class="num">{{ row.totalpurchasevalue != null ? (row.totalpurchasevalue | number) : '—' }}</dd></div>
            <div>
              <dt>Renewal</dt>
              <dd class="num">
                {{ row.subscriptionend ? (row.subscriptionend | date:'mediumDate') : '—' }}
                <span class="so-sub" *ngIf="row.daysToRenewal != null">({{ row.daysToRenewal }}d)</span>
              </dd>
            </div>
          </dl>
        </section>

        <!-- Engagement -->
        <section class="so-sec">
          <h3 class="so-sec-h">Engagement</h3>
          <dl class="so-kv">
            <div>
              <dt>Last touch</dt>
              <dd class="num">
                {{ row.lastcoachdate ? (row.lastcoachdate | date:'mediumDate') : 'Never' }}
                <span class="so-sub" *ngIf="row.daysSinceCoach != null">({{ row.daysSinceCoach }}d ago)</span>
              </dd>
            </div>
            <div><dt>Going quiet</dt><dd>{{ row.goingQuiet ? 'Yes' : 'No' }}</dd></div>
            <div *ngIf="row.recentEventRequest">
              <dt>Recent event</dt>
              <dd>{{ row.recentEventRequest.eventName }}<span class="so-sub"> · {{ row.recentEventRequest.status }}</span></dd>
            </div>
          </dl>
        </section>

        <!-- Coach health -->
        <section class="so-sec">
          <h3 class="so-sec-h">Coach health</h3>
          <ng-container *ngIf="row.coachHealthState as h; else noHealth">
            <div class="so-health">
              <span class="so-pill so-pill-health">{{ healthLabel(h.state) }}</span>
              <span class="so-sub" *ngIf="h.date">{{ h.date | date:'mediumDate' }}</span>
            </div>
            <p class="so-note" *ngIf="h.note">{{ h.note }}</p>
          </ng-container>
          <ng-template #noHealth><p class="so-empty">No coach assessment yet.</p></ng-template>
        </section>

        <!-- Tickets -->
        <section class="so-sec">
          <h3 class="so-sec-h">Tickets <span class="so-count">{{ row.openTickets }}</span></h3>
          <div *ngIf="ticketsLoading" class="so-skel-group">
            <div class="so-skel"></div><div class="so-skel"></div>
          </div>
          <ng-container *ngIf="!ticketsLoading">
            <ul class="so-list" *ngIf="tickets.length; else noTickets">
              <li *ngFor="let t of tickets" class="so-list-row">
                <span class="so-list-main">{{ t.subject || 'Issue' }}</span>
                <span class="so-list-side">
                  <span class="so-status">{{ t.status }}</span>
                  <span class="so-sub" *ngIf="t.date">{{ t.date | date:'shortDate' }}</span>
                </span>
              </li>
            </ul>
            <ng-template #noTickets><p class="so-empty">No open tickets.</p></ng-template>
          </ng-container>
        </section>

        <!-- Activity timeline -->
        <section class="so-sec">
          <h3 class="so-sec-h">Activity timeline</h3>
          <div *ngIf="timelineLoading" class="so-skel-group">
            <div class="so-skel"></div><div class="so-skel"></div><div class="so-skel"></div>
          </div>
          <p class="so-empty" *ngIf="!timelineLoading && touchpointsBlocked">
            Touchpoint history will appear once call-logging is enabled.
          </p>
          <ng-container *ngIf="!timelineLoading">
            <ul class="so-tl" *ngIf="timeline.length; else noTl">
              <li *ngFor="let it of timeline" class="so-tl-row">
                <span class="so-tl-dot" [ngClass]="it.kind === 'event' ? 'is-event' : 'is-touch'"></span>
                <div class="so-tl-body">
                  <div class="so-tl-top">
                    <span class="so-tl-date">{{ it.date ? (it.date | date:'mediumDate') : '—' }}</span>
                    <span class="so-tl-tag">{{ it.kind === 'event' ? 'Event' : (it.outcome || 'Call') }}</span>
                  </div>
                  <p class="so-tl-desc" *ngIf="it.kind === 'event'">
                    {{ it.eventName }} <span class="so-sub">· {{ it.status }}</span>
                  </p>
                  <p class="so-tl-desc" *ngIf="it.kind === 'touchpoint' && it.note">{{ it.note }}</p>
                </div>
              </li>
            </ul>
            <ng-template #noTl>
              <p class="so-empty" *ngIf="!touchpointsBlocked">No activity recorded yet.</p>
            </ng-template>
          </ng-container>
        </section>
      </div>

      <!-- Footer actions -->
      <footer class="so-footer">
        <a mat-stroked-button class="so-act" [routerLink]="['/userprofile', row.profileid]" (click)="close()">
          Open full profile
        </a>
        <button mat-stroked-button class="so-act" type="button" (click)="logCall()">Log call</button>
        <button mat-flat-button color="primary" class="so-act" type="button" (click)="setHealth()">Set health</button>
      </footer>
    </div>
  `,
  styles: [`
    :host {
      --so-bg: #ffffff; --so-ink: #0f172a; --so-ink2: #475569; --so-muted: #94a3b8;
      --so-border: #e8edf3; --so-border-soft: #f1f5f9; --so-accent: #2563eb; --so-accent-soft: #eff6ff;
      --so-tnum: 'tnum';
      display: block; height: 100%;
    }
    .so-root {
      display: flex; flex-direction: column; height: 100%; background: var(--so-bg);
      color: var(--so-ink); font-size: 13px;
    }
    .num, .so-num, .so-tl-date { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }

    .so-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 18px 20px 12px; border-bottom: 1px solid var(--so-border);
    }
    .so-name { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.2; letter-spacing: -0.01em; }
    .so-meta { margin-top: 3px; color: var(--so-ink2); font-size: 12.5px; }
    .so-dot { margin: 0 6px; color: var(--so-muted); }
    .so-tier { text-transform: uppercase; letter-spacing: 0.02em; font-size: 11.5px; color: var(--so-ink2); }

    .so-close {
      flex: 0 0 auto; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--so-border); border-radius: 8px; background: #fff; color: var(--so-ink2);
      cursor: pointer; transition: background-color .12s ease, color .12s ease, transform .06s ease;
    }
    .so-close:hover { background: var(--so-border-soft); color: var(--so-ink); }
    .so-close:active { transform: scale(0.94); }
    .so-close mat-icon { font-size: 18px; width: 18px; height: 18px; }

    .so-pills { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 20px 0; }
    .so-pill {
      display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px;
      font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums;
    }
    .so-pill.band-high { color: #be123c; background: #fff1f2; border: 1px solid #fecdd3; }
    .so-pill.band-med  { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; }
    .so-pill.band-low  { color: #475569; background: #f1f5f9; border: 1px solid #e2e8f0; }
    .so-pill-health { color: #6d28d9; background: #f5f3ff; border: 1px solid #ddd6fe; }
    .so-chip {
      display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 6px;
      font-size: 11.5px; font-weight: 600; text-transform: capitalize;
      color: var(--so-ink2); background: var(--so-border-soft); border: 1px solid var(--so-border);
    }
    .so-chip-quiet { color: #b45309; background: #fffbeb; border-color: #fde68a; }

    .so-reason { margin: 10px 20px 0; font-size: 12.5px; color: var(--so-ink2); }

    .so-body { flex: 1 1 auto; overflow-y: auto; padding: 8px 0 16px; }

    .so-sec { padding: 14px 20px; border-top: 1px solid var(--so-border-soft); }
    .so-sec:first-child { border-top: none; }
    .so-sec-h {
      margin: 0 0 9px; font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--so-muted);
    }
    .so-count {
      margin-left: 4px; padding: 0 6px; border-radius: 999px; font-size: 11px;
      color: var(--so-ink2); background: var(--so-border-soft); font-variant-numeric: tabular-nums;
    }

    .so-kv { margin: 0; display: grid; grid-template-columns: 1fr; gap: 7px; }
    .so-kv > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .so-kv dt { margin: 0; color: var(--so-ink2); font-size: 12px; flex: 0 0 auto; }
    .so-kv dd { margin: 0; text-align: right; font-weight: 600; color: var(--so-ink); font-size: 12.5px; }
    .so-kv dd.cap { text-transform: capitalize; }
    .so-sub { color: var(--so-muted); font-weight: 500; }

    .so-health { display: flex; align-items: center; gap: 8px; }
    .so-note { margin: 8px 0 0; font-size: 12.5px; color: var(--so-ink2); }
    .so-empty { margin: 0; font-size: 12.5px; color: var(--so-muted); }

    .so-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .so-list-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .so-list-main { font-size: 12.5px; color: var(--so-ink); }
    .so-list-side { display: flex; align-items: baseline; gap: 8px; flex: 0 0 auto; }
    .so-status { font-size: 11.5px; font-weight: 600; color: #b45309; text-transform: capitalize; }

    .so-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .so-tl-row { display: grid; grid-template-columns: 12px 1fr; gap: 10px; }
    .so-tl-dot { width: 8px; height: 8px; border-radius: 999px; margin-top: 5px; }
    .so-tl-dot.is-touch { background: var(--so-accent); }
    .so-tl-dot.is-event { background: #6d28d9; }
    .so-tl-body { min-width: 0; }
    .so-tl-top { display: flex; align-items: baseline; gap: 8px; }
    .so-tl-date { font-size: 12px; font-weight: 600; color: var(--so-ink); }
    .so-tl-tag { font-size: 11px; font-weight: 600; color: var(--so-ink2); text-transform: capitalize; }
    .so-tl-desc { margin: 2px 0 0; font-size: 12.5px; color: var(--so-ink2); word-break: break-word; }

    .so-skel-group { display: flex; flex-direction: column; gap: 8px; }
    .so-skel {
      height: 14px; border-radius: 6px;
      background: linear-gradient(90deg, #eef2f7 0%, #f6f9fc 50%, #eef2f7 100%);
      background-size: 200% 100%; animation: so-shimmer 1.2s ease-in-out infinite;
    }
    .so-skel:nth-child(2) { width: 70%; }
    .so-skel:nth-child(3) { width: 85%; }
    @keyframes so-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

    .so-footer {
      flex: 0 0 auto; display: flex; gap: 8px; padding: 12px 20px;
      border-top: 1px solid var(--so-border); background: var(--so-bg);
    }
    .so-act { flex: 1 1 0; min-width: 0; }
  `],
})
export class ParticipantSlideoverComponent implements OnInit {
  row: SlideoverRow;

  tickets: TicketItem[] = [];
  events: EventItem[] = [];
  touchpoints: TouchpointItem[] = [];
  timeline: TimelineItem[] = [];

  ticketsLoading = true;
  timelineLoading = true;
  touchpointsBlocked = false;

  constructor(
    private firestore: Firestore,
    private dialog: MatDialog,
    private ref: MatDialogRef<ParticipantSlideoverComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { row: SlideoverRow },
  ) {
    this.row = data.row;
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadTickets(), this.loadTimeline()]);
  }

  private async loadTickets(): Promise<void> {
    const pid = this.row.profileid;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'clientissue'), where('clientid', '==', pid)));
      const items: TicketItem[] = [];
      snap.forEach(d => {
        const data: any = d.data();
        if ((data['status']?.status ?? '').toLowerCase() !== 'open') return;
        items.push({
          subject: typeof data['subject'] === 'string' ? data['subject'] : (data['title'] ?? 'Issue'),
          status: data['status']?.status ?? 'open',
          date: this.toDate(data['doccreateddate']) ?? this.toDate(data['createddate']) ?? this.toDate(data['date']),
        });
      });
      items.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      this.tickets = items;
    } catch (e) {
      console.warn('slideover tickets read failed', e);
    } finally {
      this.ticketsLoading = false;
    }
  }

  private async loadTimeline(): Promise<void> {
    const pid = this.row.profileid;
    await Promise.all([this.loadEvents(pid), this.loadTouchpoints(pid)]);

    const items: TimelineItem[] = [];
    for (const t of this.touchpoints) {
      items.push({ kind: 'touchpoint', date: t.date, outcome: t.outcome, note: t.note, contacted: t.contacted });
    }
    for (const ev of this.events) {
      items.push({ kind: 'event', date: ev.date, eventName: ev.eventName, status: ev.status });
    }
    items.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    this.timeline = items;
    this.timelineLoading = false;
  }

  private async loadEvents(pid: string): Promise<void> {
    try {
      const snap = await getDocs(query(collection(this.firestore, 'event participation request'), where('profileid', '==', pid)));
      const items: EventItem[] = [];
      snap.forEach(d => {
        const data: any = d.data();
        items.push({
          eventName: typeof data['eventname'] === 'string' ? data['eventname']
            : (typeof data['eventref']?.id === 'string' ? data['eventref'].id : '—'),
          date: this.toDate(data['doccreateddate']),
          status: typeof data['status'] === 'string' ? data['status'] : 'requested',
        });
      });
      this.events = items;
    } catch (e) {
      console.warn('slideover events read failed', e);
    }
  }

  /** Touchpoint read is guarded: prod security rules may not be deployed yet, in which case
   *  a permission-denied is expected — degrade gracefully rather than failing the whole panel. */
  private async loadTouchpoints(pid: string): Promise<void> {
    try {
      const snap = await getDocs(query(collection(this.firestore, 'healthtracker_touchpoint'), where('profileid', '==', pid)));
      const items: TouchpointItem[] = [];
      snap.forEach(d => {
        const data: any = d.data();
        items.push({
          date: this.toDate(data['date']),
          outcome: typeof data['outcome'] === 'string' ? data['outcome'] : null,
          note: typeof data['note'] === 'string' ? data['note'] : '',
          contacted: data['contacted'] === true,
        });
      });
      this.touchpoints = items;
    } catch (e: any) {
      const code = (e?.code ?? '').toString();
      if (code.includes('permission-denied') || /permission/i.test(e?.message ?? '')) {
        this.touchpointsBlocked = true;
      } else {
        console.warn('slideover touchpoints read failed', e);
      }
    }
  }

  healthLabel(s: HealthState | null | undefined): string {
    switch (s) {
      case 'HAPPY': return 'Happy';
      case 'NEUTRAL': return 'Neutral';
      case 'SAD': return 'Sad';
      case 'EVANGELIST': return 'Evangelist';
      default: return '—';
    }
  }

  bandClass(band: 'High' | 'Medium' | 'Low'): string {
    return band === 'High' ? 'band-high' : band === 'Medium' ? 'band-med' : 'band-low';
  }

  /** Reuse the existing Log-call dialog the same way the parent does (write still depends on rules). */
  logCall(): void {
    this.dialog.open(LogCallDialogComponent, { data: { name: this.row.name }, autoFocus: false });
  }

  /** Reuse the existing Set-health-state dialog the same way the parent does. */
  setHealth(): void {
    this.dialog.open(SetHealthStateDialogComponent, {
      data: { name: this.row.name, current: this.row.coachHealthState?.state ?? null },
      autoFocus: false,
    });
  }

  close(): void { this.ref.close(); }

  private toDate(v: any): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
}
