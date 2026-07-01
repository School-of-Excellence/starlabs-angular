import { Component, Inject, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Firestore, collection, query, where, getDocs,
  doc, getDoc, getFirestore, DocumentReference,
} from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  CoachHealthState, ActivityType, COACH_HEALTH_OPTIONS, coachHealthLabel,
} from './coach-health.types';

/** Minimal shape of a portfolio row this panel reads. Mirrors the dashboard's PortfolioRow
 *  (kept structural so we don't need to export the dashboard's private interface). */
export interface SlideoverRow {
  profileid: string;
  name: string;
  number: string | null;
  email: string | null;
  coachname: string;          // current coach display name ('—' when unassigned)
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
  coachHealthState: { state: CoachHealthState; note: string; date: Date | null } | null;
  priority: number;
  priorityBand: 'High' | 'Medium' | 'Low';
  reason: string;
  goingQuiet: boolean;
  flagged: boolean;
  renewalWindow: boolean;
  lapsed: boolean;
  notStarted: boolean;
  balance: number | null;
  totalpurchasevalue: number | null;
}

/** One display row of the unified activity timeline (mapped by the dashboard from
 *  healthtracker_activity), newest first. The panel is presentational — it renders these. */
export interface SlideoverActivityItem {
  type: ActivityType;
  actorName: string;
  date: Date | null;
  note: string;
  // type-specific extras, all optional (only the ones relevant to the type are set)
  outcome?: string | null;       // call
  state?: CoachHealthState | null; // health
  flagged?: boolean;             // flag
  dueDate?: Date | null;         // schedule
  action?: string | null;        // coach_change: assign | reassign | unassign
  fromCoachName?: string | null; // coach_change
  toCoachName?: string | null;   // coach_change
}

/** Payload the inline Log composer hands back to the dashboard via onLog(type, payload). Only the
 *  fields for the chosen `type` are populated; the dashboard maps these to the right write. */
export interface SlideoverLogPayload {
  outcome?: 'reached' | 'noanswer' | 'scheduled' | 'other';  // call
  note?: string;                                             // all types
  nextActionDate?: Date | null;                              // call
  state?: CoachHealthState;                                  // health
  dueDate?: Date | null;                                     // schedule
}

/** Dialog data for the slide-over. The panel is presentational: the DASHBOARD owns every Firestore
 *  read/write. The Log composer, flag toggle and coach control delegate via these callbacks; the
 *  activity timeline + coaches list are passed in (the dashboard one-shot-loads the timeline). */
export interface SlideoverData {
  row: SlideoverRow;
  coaches: { id: string; name: string }[];
  activity: SlideoverActivityItem[];
  // inline Log composer submit (Call / Health / Schedule / Note). Dashboard maps type -> write.
  onLog: (type: ActivityType, payload: SlideoverLogPayload) => void;
  // toggle the participant's global flag (star), carrying an optional short note.
  onToggleFlag: (note: string) => void;
  // assign / reassign (coachId) or unassign (null) the participant's coach.
  onAssignCoach: (coachIdOrNull: string | null) => void;
  // current addressed state + whether the participant has any active Needs-Attention issue, and the
  // mark/re-open callback (dashboard snapshots the active issues and writes the 'addressed' event).
  addressed: boolean;
  needsAttention: boolean;
  onMarkAddressed: (next: boolean) => void;
}

interface TicketItem { subject: string; status: string; category: string; date: Date | null; }
interface EventItem { name: string; date: Date | null; attended: boolean | null; statusLabel: string; }
interface AppointmentItem { name: string; start: Date | null; end: Date | null; statusLabel: string; statusKind: 'done' | 'ongoing' | 'cancelled'; }
interface FormItem { name: string; date: Date | null; }
interface ReportItem { types: string; status: string; date: Date | null; }
interface BreakthroughItem { message: string; date: Date | null; }
interface AelItem { status: string; date: Date | null; }
interface CoachNoteItem { text: string; author: string; date: Date | null; }

/** Composer type switch options. */
type ComposerType = 'call' | 'health' | 'schedule' | 'note';

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
    CommonModule, FormsModule, RouterLink, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule,
  ],
  providers: [DatePipe],
  template: `
    <div class="so-root">
      <!-- Header -->
      <header class="so-header">
        <div class="so-id">
          <h2 class="so-name" id="so-title">
            <button type="button" class="so-copy so-copy-name" (click)="copy(row.name, 'name')"
                    [matTooltip]="copied === 'name' ? 'Copied!' : 'Copy name'">{{ row.name }}</button>
          </h2>
          <div class="so-meta">
            <button type="button" class="so-copy" *ngIf="row.email" (click)="copy(row.email, 'email')"
                    [matTooltip]="copied === 'email' ? 'Copied!' : 'Copy email'">{{ row.email }}</button>
            <span class="so-dot" *ngIf="row.email && row.number">·</span>
            <button type="button" class="so-copy" *ngIf="row.number" (click)="copy(row.number, 'phone')"
                    [matTooltip]="copied === 'phone' ? 'Copied!' : 'Copy phone'">{{ row.number }}</button>
            <span class="so-num" *ngIf="!row.email && !row.number">—</span>
          </div>
        </div>
        <div class="so-head-actions">
          <button class="so-flag-btn" type="button" *ngIf="data.needsAttention || addressedLocal"
                  [class.is-addressed]="addressedLocal" [attr.aria-pressed]="addressedLocal"
                  aria-label="Mark addressed" (click)="toggleAddressed()"
                  [matTooltip]="addressedLocal ? 'Addressed — click to re-open' : 'Mark addressed (clears Needs Attention until a new issue)'">
            <mat-icon>{{ addressedLocal ? 'task_alt' : 'radio_button_unchecked' }}</mat-icon>
            <span>{{ addressedLocal ? 'Addressed' : 'Mark addressed' }}</span>
          </button>
          <button class="so-flag-btn" type="button" [class.is-flagged]="row.flagged"
                  [attr.aria-pressed]="row.flagged" aria-label="Flag participant" (click)="toggleFlag()">
            <mat-icon>{{ row.flagged ? 'flag' : 'outlined_flag' }}</mat-icon>
            <span>{{ row.flagged ? 'Flagged' : 'Flag' }}</span>
          </button>
          <button class="so-close" type="button" matTooltip="Close" aria-label="Close panel" (click)="close()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
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
          </dl>
        </section>

        <!-- Events: last attended (past) + genuinely upcoming (today/future) -->
        <section class="so-sec" aria-live="polite">
          <button type="button" class="so-sec-h so-sec-toggle" [attr.aria-expanded]="!isCollapsed('events')" (click)="toggleCollapsed('events')">
            <span>Events <span class="so-count" *ngIf="!eventsLoading">{{ upcomingEvents.length }} upcoming</span></span>
            <mat-icon class="so-chev" [class.open]="!isCollapsed('events')">expand_more</mat-icon>
          </button>
          <div *ngIf="eventsLoading" class="so-skel-group"><div class="so-skel"></div><div class="so-skel"></div></div>
          <ng-container *ngIf="!eventsLoading">
            <!-- Last attended stays always visible (not part of the collapse) -->
            <dl class="so-kv">
              <div>
                <dt>Last attended</dt>
                <dd *ngIf="lastAttendedEvent">{{ lastAttendedEvent.name }}<span class="so-sub" *ngIf="lastAttendedEvent.date"> · {{ lastAttendedEvent.date | date:'mediumDate' }}</span></dd>
                <dd *ngIf="!lastAttendedEvent" class="so-muted">None yet</dd>
              </div>
            </dl>
            <div *ngIf="!isCollapsed('events')">
              <p class="so-group-label">Upcoming</p>
              <ul class="so-list" *ngIf="upcomingEvents.length; else noUpcoming">
                <li *ngFor="let e of (upcomingEvents | slice:0:(isShowAll('events') ? upcomingEvents.length : 3))" class="so-list-row">
                  <span class="so-list-main">{{ e.name }}</span>
                  <span class="so-list-side">
                    <span class="so-pill so-pill-neutral" *ngIf="e.statusLabel">{{ e.statusLabel }}</span>
                    <span class="so-sub" *ngIf="e.date">{{ e.date | date:'shortDate' }}</span>
                  </span>
                </li>
              </ul>
              <button type="button" class="so-showall" *ngIf="upcomingEvents.length > 3" (click)="toggleShowAll('events')">
                {{ isShowAll('events') ? 'Show less' : 'Show all (' + upcomingEvents.length + ')' }}
              </button>
              <ng-template #noUpcoming><p class="so-empty">No upcoming events.</p></ng-template>
            </div>
          </ng-container>
        </section>

        <!-- Appointments -->
        <section class="so-sec" aria-live="polite">
          <button type="button" class="so-sec-h so-sec-toggle" [attr.aria-expanded]="!isCollapsed('appointments')" (click)="toggleCollapsed('appointments')">
            <span>Appointments <span class="so-count" *ngIf="!apptsLoading">{{ appointments.length }}</span></span>
            <mat-icon class="so-chev" [class.open]="!isCollapsed('appointments')">expand_more</mat-icon>
          </button>
          <div *ngIf="!isCollapsed('appointments')">
            <div *ngIf="apptsLoading" class="so-skel-group"><div class="so-skel"></div><div class="so-skel"></div></div>
            <ng-container *ngIf="!apptsLoading">
              <ul class="so-list" *ngIf="appointments.length; else noAppts">
                <li *ngFor="let a of (appointments | slice:0:apptVisible)" class="so-list-row">
                  <span class="so-list-main">{{ a.name }}</span>
                  <span class="so-list-side">
                    <span class="so-pill" [ngClass]="apptPillClass(a.statusKind)">{{ a.statusLabel }}</span>
                    <span class="so-sub" *ngIf="a.start || a.end">
                      {{ a.start ? (a.start | date:'MMM d, y, h:mm a') : '—' }} → {{ a.end ? (a.end | date:'h:mm a') : '—' }}
                    </span>
                  </span>
                </li>
              </ul>
              <div class="so-appt-actions" *ngIf="appointments.length > APPT_PAGE">
                <button type="button" class="so-showall" *ngIf="apptVisible < appointments.length" (click)="showMoreAppts()">
                  Show {{ apptPageNext() }} more
                </button>
                <button type="button" class="so-showall" *ngIf="apptVisible >= appointments.length" (click)="resetAppts()">
                  Show less
                </button>
                <span class="so-sub">{{ (apptVisible < appointments.length ? apptVisible : appointments.length) }} of {{ appointments.length }}</span>
              </div>
              <ng-template #noAppts><p class="so-empty">No appointments.</p></ng-template>
            </ng-container>
          </div>
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

        <!-- Assigned coach -->
        <section class="so-sec">
          <h3 class="so-sec-h">Assigned coach</h3>
          <div class="so-coach-row">
            <span class="so-coach-current">{{ currentCoachName || 'Unassigned' }}</span>
            <select class="so-coach-select" [ngModel]="currentCoachId" (ngModelChange)="onAssignCoach($event)"
                    aria-label="Assign coach">
              <option [ngValue]="'__unassign__'">Unassign</option>
              <option *ngFor="let c of data.coaches" [ngValue]="c.id">{{ c.name }}</option>
            </select>
          </div>
        </section>

        <!-- Coach notes -->
        <section class="so-sec" aria-live="polite">
          <button type="button" class="so-sec-h so-sec-toggle" [attr.aria-expanded]="!isCollapsed('notes')" (click)="toggleCollapsed('notes')">
            <span>Coach notes <span class="so-count" *ngIf="!coachNotesLoading">{{ coachNotes.length }}</span></span>
            <mat-icon class="so-chev" [class.open]="!isCollapsed('notes')">expand_more</mat-icon>
          </button>
          <div *ngIf="!isCollapsed('notes')">
            <div *ngIf="coachNotesLoading" class="so-skel-group"><div class="so-skel"></div><div class="so-skel"></div></div>
            <ng-container *ngIf="!coachNotesLoading">
              <ul class="so-notes" *ngIf="coachNotes.length; else noNotes">
                <li *ngFor="let n of (coachNotes | slice:0:(isShowAll('notes') ? coachNotes.length : 3))" class="so-cnote">
                  <p class="so-cnote-text">{{ n.text }}</p>
                  <div class="so-cnote-meta">
                    <span class="so-cnote-author">{{ n.author }}</span>
                    <span class="so-sub" *ngIf="n.date">{{ n.date | date:'mediumDate' }}</span>
                  </div>
                </li>
              </ul>
              <button type="button" class="so-showall" *ngIf="coachNotes.length > 3" (click)="toggleShowAll('notes')">
                {{ isShowAll('notes') ? 'Show less' : 'Show all (' + coachNotes.length + ')' }}
              </button>
              <ng-template #noNotes><p class="so-empty">No coach notes yet.</p></ng-template>
            </ng-container>
          </div>
        </section>

        <!-- Tickets -->
        <section class="so-sec" aria-live="polite">
          <button type="button" class="so-sec-h so-sec-toggle" [attr.aria-expanded]="!isCollapsed('tickets')" (click)="toggleCollapsed('tickets')">
            <span>Tickets <span class="so-count" *ngIf="!ticketsLoading">{{ tickets.length }}</span></span>
            <mat-icon class="so-chev" [class.open]="!isCollapsed('tickets')">expand_more</mat-icon>
          </button>
          <div *ngIf="!isCollapsed('tickets')">
            <div *ngIf="ticketsLoading" class="so-skel-group">
              <div class="so-skel"></div><div class="so-skel"></div>
            </div>
            <ng-container *ngIf="!ticketsLoading">
              <ul class="so-list" *ngIf="tickets.length; else noTickets">
                <li *ngFor="let t of (tickets | slice:0:(isShowAll('tickets') ? tickets.length : 3))" class="so-list-row">
                  <span class="so-list-main">
                    {{ t.subject || 'Support ticket' }}
                    <span class="so-cat" *ngIf="t.category">{{ t.category }}</span>
                  </span>
                  <span class="so-list-side">
                    <span class="so-status">{{ t.status }}</span>
                    <span class="so-sub" *ngIf="t.date">{{ t.date | date:'shortDate' }}</span>
                  </span>
                </li>
              </ul>
              <button type="button" class="so-showall" *ngIf="tickets.length > 3" (click)="toggleShowAll('tickets')">
                {{ isShowAll('tickets') ? 'Show less' : 'Show all (' + tickets.length + ')' }}
              </button>
              <ng-template #noTickets><p class="so-empty">No tickets.</p></ng-template>
            </ng-container>
          </div>
        </section>

        <!-- Forms filled -->
        <section class="so-sec" aria-live="polite">
          <button type="button" class="so-sec-h so-sec-toggle" [attr.aria-expanded]="!isCollapsed('forms')" (click)="toggleCollapsed('forms')">
            <span>Forms filled <span class="so-count" *ngIf="!formsLoading">{{ forms.length }}</span></span>
            <mat-icon class="so-chev" [class.open]="!isCollapsed('forms')">expand_more</mat-icon>
          </button>
          <div *ngIf="!isCollapsed('forms')">
            <div *ngIf="formsLoading" class="so-skel-group"><div class="so-skel"></div><div class="so-skel"></div></div>
            <ng-container *ngIf="!formsLoading">
              <ul class="so-list" *ngIf="forms.length; else noForms">
                <li *ngFor="let f of (forms | slice:0:(isShowAll('forms') ? forms.length : 3))" class="so-list-row">
                  <span class="so-list-main">{{ f.name }}</span>
                  <span class="so-list-side"><span class="so-sub" *ngIf="f.date">{{ f.date | date:'shortDate' }}</span></span>
                </li>
              </ul>
              <button type="button" class="so-showall" *ngIf="forms.length > 3" (click)="toggleShowAll('forms')">
                {{ isShowAll('forms') ? 'Show less' : 'Show all (' + forms.length + ')' }}
              </button>
              <ng-template #noForms><p class="so-empty">No forms filled.</p></ng-template>
            </ng-container>
          </div>
        </section>

        <!-- Interim reports -->
        <section class="so-sec" aria-live="polite">
          <button type="button" class="so-sec-h so-sec-toggle" [attr.aria-expanded]="!isCollapsed('interim')" (click)="toggleCollapsed('interim')">
            <span>Interim reports <span class="so-count" *ngIf="!reportsLoading">{{ reports.length }}</span></span>
            <mat-icon class="so-chev" [class.open]="!isCollapsed('interim')">expand_more</mat-icon>
          </button>
          <div *ngIf="!isCollapsed('interim')">
            <div *ngIf="reportsLoading" class="so-skel-group"><div class="so-skel"></div><div class="so-skel"></div></div>
            <ng-container *ngIf="!reportsLoading">
              <ul class="so-list" *ngIf="reports.length; else noReports">
                <li *ngFor="let r of (reports | slice:0:(isShowAll('interim') ? reports.length : 3))" class="so-list-row">
                  <span class="so-list-main">{{ r.types || 'Report' }}</span>
                  <span class="so-list-side">
                    <span class="so-status" *ngIf="r.status">{{ r.status }}</span>
                    <span class="so-sub" *ngIf="r.date">{{ r.date | date:'shortDate' }}</span>
                  </span>
                </li>
              </ul>
              <button type="button" class="so-showall" *ngIf="reports.length > 3" (click)="toggleShowAll('interim')">
                {{ isShowAll('interim') ? 'Show less' : 'Show all (' + reports.length + ')' }}
              </button>
              <ng-template #noReports><p class="so-empty">No interim reports.</p></ng-template>
            </ng-container>
          </div>
        </section>

        <!-- Breakthroughs -->
        <section class="so-sec" aria-live="polite">
          <button type="button" class="so-sec-h so-sec-toggle" [attr.aria-expanded]="!isCollapsed('breakthroughs')" (click)="toggleCollapsed('breakthroughs')">
            <span>Breakthroughs <span class="so-count" *ngIf="!breakthroughsLoading">{{ breakthroughs.length }}</span></span>
            <mat-icon class="so-chev" [class.open]="!isCollapsed('breakthroughs')">expand_more</mat-icon>
          </button>
          <div *ngIf="!isCollapsed('breakthroughs')">
            <div *ngIf="breakthroughsLoading" class="so-skel-group"><div class="so-skel"></div><div class="so-skel"></div></div>
            <ng-container *ngIf="!breakthroughsLoading">
              <ul class="so-list" *ngIf="breakthroughs.length; else noBt">
                <li *ngFor="let b of (breakthroughs | slice:0:(isShowAll('breakthroughs') ? breakthroughs.length : 3))" class="so-list-row">
                  <span class="so-list-main so-clamp">{{ b.message || 'Breakthrough' }}</span>
                  <span class="so-list-side"><span class="so-sub" *ngIf="b.date">{{ b.date | date:'shortDate' }}</span></span>
                </li>
              </ul>
              <button type="button" class="so-showall" *ngIf="breakthroughs.length > 3" (click)="toggleShowAll('breakthroughs')">
                {{ isShowAll('breakthroughs') ? 'Show less' : 'Show all (' + breakthroughs.length + ')' }}
              </button>
              <ng-template #noBt><p class="so-empty">No breakthroughs posted.</p></ng-template>
            </ng-container>
          </div>
        </section>

        <!-- AEL -->
        <section class="so-sec" aria-live="polite">
          <button type="button" class="so-sec-h so-sec-toggle" [attr.aria-expanded]="!isCollapsed('ael')" (click)="toggleCollapsed('ael')">
            <span>AEL <span class="so-count" *ngIf="!aelLoading">{{ ael.length }}</span></span>
            <mat-icon class="so-chev" [class.open]="!isCollapsed('ael')">expand_more</mat-icon>
          </button>
          <div *ngIf="!isCollapsed('ael')">
            <div *ngIf="aelLoading" class="so-skel-group"><div class="so-skel"></div><div class="so-skel"></div></div>
            <ng-container *ngIf="!aelLoading">
              <ul class="so-list" *ngIf="ael.length; else noAel">
                <li *ngFor="let x of (ael | slice:0:(isShowAll('ael') ? ael.length : 3))" class="so-list-row">
                  <span class="so-list-main"><span class="so-status">{{ x.status || '—' }}</span></span>
                  <span class="so-list-side"><span class="so-sub" *ngIf="x.date">{{ x.date | date:'shortDate' }}</span></span>
                </li>
              </ul>
              <button type="button" class="so-showall" *ngIf="ael.length > 3" (click)="toggleShowAll('ael')">
                {{ isShowAll('ael') ? 'Show less' : 'Show all (' + ael.length + ')' }}
              </button>
              <ng-template #noAel><p class="so-empty">No AEL records.</p></ng-template>
            </ng-container>
          </div>
        </section>

        <!-- Activity timeline (unified log, newest first) -->
        <section class="so-sec" aria-live="polite">
          <h3 class="so-sec-h">Activity timeline</h3>
          <ul class="so-tl" *ngIf="data.activity?.length; else noActivity">
            <li *ngFor="let a of data.activity" class="so-tl-row">
              <span class="so-tl-dot" [ngClass]="activityDotClass(a.type)"></span>
              <div class="so-tl-body">
                <div class="so-tl-top">
                  <span class="so-tl-tag">{{ activityLabel(a) }}</span>
                  <span class="so-tl-date">{{ relativeDate(a.date) }}</span>
                </div>
                <p class="so-tl-actor" *ngIf="a.actorName">{{ a.actorName }}</p>
                <p class="so-tl-desc" *ngIf="a.note">{{ a.note }}</p>
              </div>
            </li>
          </ul>
          <ng-template #noActivity>
            <p class="so-empty">No activity recorded yet.</p>
          </ng-template>
        </section>
      </div>

      <!-- Footer: single Log button reveals an inline composer (Call / Health / Schedule / Note) -->
      <footer class="so-footer">
        <a mat-stroked-button class="so-act" [routerLink]="['/userprofile', row.profileid]"
           target="_blank" rel="noopener">
          Open profile
        </a>
        <button mat-flat-button color="primary" class="so-act so-act-log" type="button"
                (click)="openComposer()">
          <mat-icon>add</mat-icon> Log
        </button>
      </footer>
    </div>

    <!-- Log composer — opened as a centered Material dialog on top of the side sheet -->
    <ng-template #composerTpl>
      <div class="so-composer">
        <div class="so-comp-top">
          <div class="so-comp-titles">
            <div class="so-comp-eyebrow">New log</div>
            <h3 class="so-comp-title">{{ row.name }}</h3>
          </div>
          <button class="so-comp-x" type="button" aria-label="Cancel" (click)="cancelComposer()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <div class="so-seg" role="tablist" aria-label="Log type">
          <button type="button" class="so-seg-btn" [class.on]="composerType==='call'"
                  role="tab" [attr.aria-selected]="composerType==='call'" (click)="composerType='call'">Call</button>
          <button type="button" class="so-seg-btn" [class.on]="composerType==='health'"
                  role="tab" [attr.aria-selected]="composerType==='health'" (click)="composerType='health'">Health</button>
          <button type="button" class="so-seg-btn" [class.on]="composerType==='schedule'"
                  role="tab" [attr.aria-selected]="composerType==='schedule'" (click)="composerType='schedule'">Schedule</button>
          <button type="button" class="so-seg-btn" [class.on]="composerType==='note'"
                  role="tab" [attr.aria-selected]="composerType==='note'" (click)="composerType='note'">Note</button>
        </div>

        <div class="so-comp-fields">
          <!-- Call -->
          <ng-container *ngIf="composerType==='call'">
            <label class="so-field">
              <span class="so-field-l">Outcome</span>
              <select class="so-input" [(ngModel)]="callOutcome">
                <option value="reached">Reached</option>
                <option value="noanswer">No answer</option>
                <option value="scheduled">Scheduled</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label class="so-field">
              <span class="so-field-l">Note</span>
              <textarea class="so-input" rows="2" [(ngModel)]="composerNote" placeholder="What was discussed / agreed"></textarea>
            </label>
            <label class="so-field">
              <span class="so-field-l">Next action date (optional)</span>
              <input class="so-input" type="date" [(ngModel)]="callNextDate" />
            </label>
          </ng-container>

          <!-- Health -->
          <ng-container *ngIf="composerType==='health'">
            <div class="so-field">
              <span class="so-field-l">Health state</span>
              <div class="so-state-pick">
                <button type="button" class="so-state-opt" *ngFor="let h of healthOptions"
                        [class.on]="healthChoice===h" (click)="healthChoice=h">{{ healthLabel(h) }}</button>
              </div>
            </div>
            <label class="so-field">
              <span class="so-field-l">Note (optional)</span>
              <textarea class="so-input" rows="2" [(ngModel)]="composerNote" placeholder="Why this assessment / context"></textarea>
            </label>
          </ng-container>

          <!-- Schedule -->
          <ng-container *ngIf="composerType==='schedule'">
            <label class="so-field">
              <span class="so-field-l">Due date</span>
              <input class="so-input" type="date" [(ngModel)]="scheduleDate" />
            </label>
            <label class="so-field">
              <span class="so-field-l">Note (optional)</span>
              <textarea class="so-input" rows="2" [(ngModel)]="composerNote" placeholder="What to follow up on"></textarea>
            </label>
          </ng-container>

          <!-- Note -->
          <ng-container *ngIf="composerType==='note'">
            <label class="so-field">
              <span class="so-field-l">Note</span>
              <textarea class="so-input" rows="3" [(ngModel)]="composerNote" placeholder="Add a note"></textarea>
            </label>
          </ng-container>
        </div>

        <div class="so-comp-actions">
          <button type="button" class="so-btn so-btn-ghost" (click)="cancelComposer()">Cancel</button>
          <button type="button" class="so-btn so-btn-primary" [disabled]="!composerValid()" (click)="submitComposer()">Save</button>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host {
      --so-bg: #ffffff; --so-ink: #1c1c1e; --so-ink2: rgba(60,60,67,.6); --so-muted: rgba(60,60,67,.45);
      --so-border: rgba(60,60,67,.12); --so-border-soft: rgba(60,60,67,.08);
      --so-accent: #007aff; --so-accent-soft: rgba(0,122,255,.08);
      --so-mono: -apple-system, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif;
      --so-tnum: 'tnum';
      display: block; height: 100%;
      /* scoped iOS / SF Pro font — applies to the slide-over panel only */
      font-family: -apple-system, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .so-root {
      display: flex; flex-direction: column; height: 100%; background: var(--so-bg);
      color: var(--so-ink); font-size: 13px;
    }
    .num, .so-num, .so-tl-date, .so-count, .so-sub, .so-status {
      font-family: var(--so-mono); font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum'; letter-spacing: -0.01em;
    }

    .so-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 18px 20px 12px; border-bottom: 1px solid var(--so-border);
    }
    .so-name { margin: 0; font-size: 22px; font-weight: 700; line-height: 1.15; letter-spacing: -0.4px; }
    .so-meta { margin-top: 3px; color: var(--so-ink2); font-size: 12.5px; display: flex; align-items: baseline; flex-wrap: wrap; }
    .so-dot { margin: 0 6px; color: var(--so-muted); }
    /* copyable name / email / phone — look like text, behave like a button */
    .so-copy {
      border: none; background: transparent; padding: 0; margin: 0; cursor: pointer;
      font: inherit; color: inherit; text-align: left; border-radius: 4px;
      transition: background .12s ease, color .12s ease;
    }
    .so-copy:hover { color: var(--so-accent); background: rgba(10,106,224,.08); }
    .so-copy-name { font-size: 22px; font-weight: 700; line-height: 1.15; letter-spacing: -0.4px; }

    .so-close {
      flex: 0 0 auto; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
      border: none; border-radius: 999px; background: rgba(118,118,128,.12); color: var(--so-ink2);
      cursor: pointer; transition: background-color .12s ease, color .12s ease, transform .06s ease;
    }
    .so-close:hover { background: var(--so-border-soft); color: var(--so-ink); }
    .so-close:active { transform: scale(0.94); }
    .so-close mat-icon { font-size: 18px; width: 18px; height: 18px; }

    .so-head-actions { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 8px; }
    .so-flag {
      width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
      border: none; border-radius: 999px; background: rgba(118,118,128,.12); color: var(--so-muted);
      cursor: pointer; transition: background-color .12s ease, color .12s ease, border-color .12s ease, transform .06s ease;
    }
    .so-flag:hover { background: rgba(118,118,128,.2); color: var(--so-ink2); }
    .so-flag:active { transform: scale(0.94); }
    .so-flag.is-flagged { color: #c25e00; background: rgba(255,149,0,.16); }
    .so-flag.is-flagged mat-icon { animation: so-star-pop 0.28s cubic-bezier(0.2, 0.8, 0.2, 1); }
    .so-flag mat-icon { font-size: 18px; width: 18px; height: 18px; transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
    @keyframes so-star-pop {
      0% { transform: scale(0.7); }
      55% { transform: scale(1.18); }
      100% { transform: scale(1); }
    }

    .so-pills { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 20px 0; }
    .so-pill {
      display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 999px;
      font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums;
    }
    .so-pill.band-high { color: #d70015; background: rgba(255,59,48,.12); border: none; }
    .so-pill.band-med  { color: #c25e00; background: rgba(255,149,0,.14); border: none; }
    .so-pill.band-low  { color: rgba(60,60,67,.6); background: rgba(120,120,128,.12); border: none; }
    .so-pill-health { color: #4a48b8; background: rgba(88,86,214,.12); border: none; }
    .so-chip {
      display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px;
      font-size: 11.5px; font-weight: 600; text-transform: capitalize;
      color: var(--so-ink2); background: rgba(120,120,128,.12); border: none;
    }
    .so-chip-quiet { color: #c25e00; background: rgba(255,149,0,.14); }

    .so-reason { margin: 10px 20px 0; font-size: 12.5px; color: var(--so-ink2); }

    .so-body {
      flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 8px 0 16px;
      scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;
    }
    .so-body::-webkit-scrollbar { width: 9px; }
    .so-body::-webkit-scrollbar-thumb {
      background: #cdd6e3; border-radius: 999px;
      border: 2px solid var(--so-bg); background-clip: padding-box;
    }
    .so-body::-webkit-scrollbar-thumb:hover { background: #aebccd; background-clip: padding-box; }
    .so-body::-webkit-scrollbar-track { background: transparent; }

    .so-sec { padding: 14px 20px; border-top: 1px solid var(--so-border-soft); }
    .so-sec:first-child { border-top: none; }
    .so-sec-h {
      margin: 0 0 9px; font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.07em; color: var(--so-muted);
    }
    .so-count {
      margin-left: 4px; padding: 0 6px; border-radius: 999px; font-size: 11px;
      color: var(--so-ink2); background: var(--so-border-soft); font-variant-numeric: tabular-nums;
    }

    /* collapsible section header — keeps the .so-sec-h look but becomes a full-width toggle */
    .so-sec-toggle {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      width: 100%; padding: 0; border: none; background: transparent; cursor: pointer;
      font: inherit; text-align: left;
      margin: 0 0 9px; font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.07em; color: var(--so-muted);
    }
    .so-sec-toggle:hover { color: var(--so-ink2); }
    .so-chev {
      flex: 0 0 auto; font-size: 18px; width: 18px; height: 18px; color: var(--so-muted);
      transition: transform .18s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .so-chev.open { transform: rotate(180deg); }
    @media (prefers-reduced-motion: reduce) { .so-chev { transition: none; } }

    /* borderless accent text button — Show all / Show less */
    .so-showall {
      display: inline-block; margin: 8px 0 0; padding: 0; border: none; background: transparent;
      color: var(--so-accent); font: inherit; font-size: 12.5px; font-weight: 600;
      text-align: left; cursor: pointer;
    }
    .so-showall:hover { text-decoration: underline; }

    .so-kv { margin: 0; display: grid; grid-template-columns: 1fr; gap: 7px; }
    .so-kv > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .so-kv dt { margin: 0; color: var(--so-ink2); font-size: 12px; flex: 0 0 auto; }
    .so-kv dd { margin: 0; text-align: right; font-weight: 600; color: var(--so-ink); font-size: 12.5px; }
    .so-kv dd.cap { text-transform: capitalize; }
    .so-sub { color: var(--so-muted); font-weight: 500; }

    .so-health { display: flex; align-items: center; gap: 8px; }
    .so-note { margin: 8px 0 0; font-size: 12.5px; color: var(--so-ink2); }
    .so-empty { margin: 0; font-size: 12.5px; color: var(--so-muted); }
    .so-muted { color: var(--so-muted); }
    .so-group-label {
      margin: 12px 0 6px; font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--so-muted);
    }

    /* coach notes — stacked cards: full note text + author/date footer */
    .so-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .so-cnote {
      padding: 10px 12px; border-radius: 12px; background: var(--so-surface-soft, rgba(120,120,128,.06));
      border: 1px solid var(--so-border-soft);
    }
    .so-cnote-text { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--so-ink); white-space: pre-wrap; }
    .so-cnote-meta {
      display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-top: 6px;
      font-size: 11.5px;
    }
    .so-cnote-author { font-weight: 600; color: var(--so-ink2); }

    .so-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .so-list-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .so-list-main { font-size: 12.5px; color: var(--so-ink); }
    .so-list-side { display: flex; align-items: baseline; gap: 8px; flex: 0 0 auto; }
    .so-status { font-size: 11.5px; font-weight: 600; color: #c25e00; text-transform: capitalize; }

    /* status pills for events / appointments (compact, list-side) */
    .so-list-side .so-pill { padding: 1px 8px; font-size: 11px; }
    .so-pill-ok { color: #1d7a3a; background: rgba(52,199,89,.14); border: none; }
    .so-pill-neutral { color: rgba(60,60,67,.6); background: rgba(120,120,128,.12); border: none; }
    .so-pill-amber { color: #c25e00; background: rgba(255,149,0,.14); border: none; }
    .so-pill-cancel { color: #d70015; background: rgba(255,59,48,.12); border: none; }

    /* ticket category soft chip */
    .so-cat {
      display: inline-block; margin-left: 7px; padding: 1px 8px; border-radius: 999px;
      font-size: 10.5px; font-weight: 600; vertical-align: middle; text-transform: capitalize;
      color: var(--so-ink2); background: var(--so-border-soft);
    }
    /* clamp long breakthrough snippets to two lines */
    .so-clamp {
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; max-width: 100%;
    }

    .so-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .so-tl-row { display: grid; grid-template-columns: 12px 1fr; gap: 10px; }
    .so-tl-dot { width: 8px; height: 8px; border-radius: 999px; margin-top: 5px; }
    .so-tl-dot.is-touch { background: var(--so-accent); }
    .so-tl-dot.is-event { background: #5856d6; }
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
    @media (prefers-reduced-motion: reduce) {
      .so-skel { animation: none; }
      .so-flag mat-icon, .so-flag.is-flagged mat-icon { transition: none; animation: none; }
    }

    .so-footer {
      flex: 0 0 auto; display: flex; gap: 8px; padding: 12px 20px;
      border-top: 1px solid var(--so-border); background: var(--so-bg);
    }
    .so-act {
      flex: 1 1 0; min-width: 0;
      transition: transform 0.08s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .so-act:active { transform: scale(0.98); }
    .so-act-log mat-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 2px; vertical-align: middle; }

    /* flag button with label */
    .so-flag-btn {
      display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px;
      border: none; border-radius: 999px; background: rgba(118,118,128,.12); color: var(--so-ink2);
      font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
      transition: background-color .12s ease, color .12s ease, transform .06s ease;
    }
    .so-flag-btn:hover { background: rgba(118,118,128,.2); color: var(--so-ink); }
    .so-flag-btn:active { transform: scale(0.96); }
    .so-flag-btn.is-flagged { color: #c25e00; background: rgba(255,149,0,.16); }
    .so-flag-btn mat-icon { font-size: 17px; width: 17px; height: 17px; }

    /* assigned coach control */
    .so-coach-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .so-coach-current { font-size: 13px; font-weight: 600; color: var(--so-ink); }
    .so-coach-select {
      font: inherit; font-size: 12.5px; padding: 6px 10px; border-radius: 9px;
      border: 1px solid var(--so-border); background: #fff; color: var(--so-ink); cursor: pointer;
      max-width: 55%;
    }

    /* timeline actor line */
    .so-tl-actor { margin: 1px 0 0; font-size: 11.5px; color: var(--so-muted); font-weight: 500; }
    .so-tl-dot.is-call { background: var(--so-accent); }
    .so-tl-dot.is-health { background: #34c759; }
    .so-tl-dot.is-schedule { background: #ff9500; }
    .so-tl-dot.is-note { background: #8e8e93; }
    .so-tl-dot.is-flag { background: #ff2d55; }
    .so-tl-dot.is-coach { background: #5856d6; }

    /* Log composer — centered premium popup. Re-declares the design tokens here: the composer
       renders from a TemplateRef into a CDK overlay (outside :host), so it can't inherit the
       host-scoped CSS variables (--so-accent etc.) — without this, accents resolve to nothing. */
    .so-composer {
      --so-bg: #ffffff; --so-ink: #1c1c1e; --so-ink2: rgba(60,60,67,.6); --so-muted: rgba(60,60,67,.45);
      --so-border: rgba(60,60,67,.12); --so-border-soft: rgba(60,60,67,.08);
      --so-accent: #007aff; --so-accent-soft: rgba(0,122,255,.08);
      background: #ffffff; color: var(--so-ink); padding: 22px 24px 22px;
      font-family: -apple-system, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif;
    }
    .so-comp-top {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px;
    }
    .so-comp-eyebrow {
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--so-muted);
    }
    .so-comp-title {
      margin: 3px 0 0; font-size: 19px; font-weight: 700; letter-spacing: -0.35px; color: var(--so-ink); line-height: 1.15;
    }
    .so-seg {
      display: flex; padding: 3px; border-radius: 11px; background: rgba(118,118,128,.12); margin-bottom: 18px;
    }
    .so-seg-btn {
      flex: 1 1 0; border: none; background: transparent; color: var(--so-ink2);
      font: inherit; font-size: 13px; font-weight: 500; padding: 7px 6px; border-radius: 8px; cursor: pointer;
      letter-spacing: -0.1px;
      transition: color .2s ease, background-color .2s ease, transform .06s ease;
    }
    .so-seg-btn.on {
      background: #fff; color: var(--so-ink); font-weight: 600;
      box-shadow: 0 3px 8px rgba(0,0,0,.10), 0 1px 1px rgba(0,0,0,.04);
    }
    .so-seg-btn:active { transform: scale(.97); }
    .so-comp-x {
      flex: 0 0 auto; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
      border: none; border-radius: 999px; background: rgba(118,118,128,.12); color: var(--so-ink2); cursor: pointer;
      transition: background-color .12s ease, transform .06s ease;
    }
    .so-comp-x:hover { background: rgba(118,118,128,.2); }
    .so-comp-x:active { transform: scale(.94); }
    .so-comp-x mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .so-comp-fields { display: flex; flex-direction: column; gap: 14px; }
    .so-field { display: flex; flex-direction: column; gap: 6px; }
    .so-field-l { font-size: 11px; font-weight: 600; color: var(--so-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .so-input {
      font: inherit; font-size: 15px; padding: 11px 13px; border-radius: 11px;
      border: 1px solid transparent; background-color: rgba(118,118,128,.10); color: var(--so-ink);
      width: 100%; box-sizing: border-box; -webkit-appearance: none; appearance: none;
      transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease;
    }
    .so-input::placeholder { color: var(--so-muted); }
    .so-input:focus {
      outline: none; background-color: #fff; border-color: var(--so-accent);
      box-shadow: 0 0 0 3px var(--so-accent-soft);
    }
    select.so-input {
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");
      background-repeat: no-repeat; background-position: right 13px center; padding-right: 36px;
    }
    textarea.so-input { resize: vertical; min-height: 64px; line-height: 1.4; }
    .so-state-pick { display: flex; flex-wrap: wrap; gap: 8px; }
    .so-state-opt {
      border: 1px solid var(--so-border); background: #fff; color: var(--so-ink2);
      font: inherit; font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 999px; cursor: pointer;
      transition: background-color .15s ease, color .15s ease, border-color .15s ease, transform .06s ease;
    }
    .so-state-opt:active { transform: scale(.96); }
    .so-state-opt.on { background: var(--so-accent); color: #fff; border-color: var(--so-accent); }
    .so-comp-actions { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 22px; }
    .so-btn {
      font: inherit; font-size: 15px; font-weight: 600; padding: 10px 20px; border-radius: 11px; border: none; cursor: pointer;
      transition: background-color .15s ease, transform .06s ease, opacity .15s ease;
    }
    .so-btn:active { transform: scale(.97); }
    .so-btn-ghost { background: transparent; color: var(--so-ink2); }
    .so-btn-ghost:hover { background: rgba(118,118,128,.1); }
    .so-btn-primary { background: var(--so-accent); color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.10); }
    .so-btn-primary:hover { background: #0a6ae0; }
    .so-btn-primary:disabled { opacity: .4; cursor: default; box-shadow: none; }
  `],
})
export class ParticipantSlideoverComponent implements OnInit {
  row: SlideoverRow;

  tickets: TicketItem[] = [];
  ticketsLoading = true;

  // ---- per-participant intel sections (one-shot, scoped, parallel) ----
  events: EventItem[] = [];
  upcomingEvents: EventItem[] = [];      // event date today or later
  lastAttendedEvent: EventItem | null = null;  // most recent past event he attended
  eventsLoading = true;
  appointments: AppointmentItem[] = [];
  apptsLoading = true;
  // appointments paginate client-side: show APPT_PAGE at a time, "Show 15 more" reveals the next page.
  readonly APPT_PAGE = 15;
  apptVisible = this.APPT_PAGE;

  // transient "Copied!" feedback for the copyable header fields ('name' | 'email' | 'phone').
  copied: string | null = null;
  forms: FormItem[] = [];
  formsLoading = true;
  reports: ReportItem[] = [];
  reportsLoading = true;
  breakthroughs: BreakthroughItem[] = [];
  breakthroughsLoading = true;
  ael: AelItem[] = [];
  aelLoading = true;
  coachNotes: CoachNoteItem[] = [];
  coachNotesLoading = true;

  // How many rows each intel section FETCHES (most-recent-first). Display defaults to the
  // first 3 (the template slice handles that); a larger fetch lets "Show all" reveal real data.
  private readonly sectionCap = 50;

  // ---- collapsible list sections + top-3 / show-all state ----
  // Reference-heavy sections start collapsed; events/appointments/tickets start open.
  collapsed = new Set<string>(['forms', 'interim', 'breakthroughs', 'ael']);
  showAll = new Set<string>();

  // Secondary Firestore instance that holds the forms data (mirrors userprofile's
  // `firestoreForms = getFirestore('firestore-forms')`). May be null if it can't be obtained.
  private readonly firestoreForms: Firestore | null = (() => {
    try { return getFirestore('firestore-forms') as unknown as Firestore; }
    catch { return null; }
  })();

  // Interim-report type-code -> human label (mirrors userprofile.mapReport).
  private readonly reportLabels: Record<string, string> = {
    crossover: 'AEL Crossover Metric',
    evolutionprogress: 'Evolution Progress',
    loveletter: 'A&H Love Letter',
    askah: 'Ask A&H',
  };

  // Coach-set health scale options for the composer's 5-state picker.
  healthOptions: CoachHealthState[] = COACH_HEALTH_OPTIONS;

  // ---- Log composer state ----
  // The composer renders from #composerTpl into a centered Material dialog on top of the side sheet.
  @ViewChild('composerTpl') composerTpl!: TemplateRef<unknown>;
  private composerRef: MatDialogRef<unknown> | null = null;
  composerOpen = false;
  composerType: ComposerType = 'call';
  composerNote = '';
  callOutcome: 'reached' | 'noanswer' | 'scheduled' | 'other' = 'reached';
  callNextDate = '';                                  // yyyy-mm-dd from <input type="date">
  healthChoice: CoachHealthState = 'NEUTRAL';
  scheduleDate = '';                                  // yyyy-mm-dd

  constructor(
    private firestore: Firestore,
    private ref: MatDialogRef<ParticipantSlideoverComponent>,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: SlideoverData,
  ) {
    this.row = data.row;
    this.addressedLocal = data.addressed;
  }

  // local mirror of the addressed state so the button reflects the toggle immediately
  addressedLocal = false;
  /** Mark this participant addressed (or re-open). Delegates the write to the dashboard. */
  toggleAddressed(): void {
    this.addressedLocal = !this.addressedLocal;
    this.data.onMarkAddressed(this.addressedLocal);
  }

  ngOnInit(): void {
    // Fire every scoped read in parallel; each owns its own loading flag and degrades
    // independently, so a slow/denied section never blocks the rest of the panel.
    void this.loadTickets();
    void this.loadEvents();
    void this.loadAppointments();
    void this.loadForms();
    void this.loadReports();
    void this.loadBreakthroughs();
    void this.loadAel();
    void this.loadCoachNotes();
  }

  private async loadTickets(): Promise<void> {
    const pid = this.row.profileid;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'clientissue'), where('clientid', '==', pid)));
      const items: TicketItem[] = [];
      snap.forEach(d => {
        const data: any = d.data();
        const status = data['status']?.status ?? 'open';
        // 'issue' is the human-readable subject on clientissue docs (same field the
        // Customer Support screens display). Fall back to a clean label, never a raw id.
        const issue = typeof data['issue'] === 'string' ? data['issue'].trim() : '';
        const category = typeof data['category'] === 'string' ? data['category'].trim() : '';
        items.push({
          subject: issue || `Support ticket · ${status}`,
          status,
          category,
          date: this.toDate(data['reporteddate']) ?? this.toDate(data['doccreateddate']) ?? this.toDate(data['createddate']) ?? this.toDate(data['date']),
        });
      });
      // Open tickets first (most actionable), then most recent.
      items.sort((a, b) => {
        const ao = a.status.toLowerCase() === 'open' ? 0 : 1;
        const bo = b.status.toLowerCase() === 'open' ? 0 : 1;
        return ao !== bo ? ao - bo : (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
      });
      this.tickets = items.slice(0, this.sectionCap);
    } catch (e) {
      console.warn('slideover tickets read failed', e);
    } finally {
      this.ticketsLoading = false;
    }
  }

  /** EVENTS — `event participation request` where profileid == pid. Resolve each `eventref`
   *  (points to `event collection` or `queue generation`) to a name + start date. Capped. */
  private async loadEvents(): Promise<void> {
    const pid = this.row.profileid;
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'event participation request'),
        where('profileid', '==', pid),
      ));
      const rows = snap.docs.map(d => d.data() as any).filter(d => d['eventref']);
      // Resolve EVERY event ref (bounded by the participant's own count) so we have the real EVENT
      // date — upcoming vs past is decided by that date, not the request's status field.
      const items: EventItem[] = await Promise.all(rows.slice(0, 40).map(async (d) => {
        const status = (d['status'] ?? '').toString().toLowerCase();
        let name = 'Event';
        let date: Date | null = this.toDate(d['createdon']);
        try {
          const ref = d['eventref'] as DocumentReference;
          const evSnap = await getDoc(ref);
          if (evSnap.exists()) {
            const ev: any = evSnap.data();
            if (ref.parent.id === 'queue generation') {
              name = ev['queuename'] || 'Queue event';
              date = this.toDate(ev['queuestartdate']) ?? date;
            } else {
              name = ev['name'] || 'Event';
              date = this.toDate(ev['start_date']) ?? date;
            }
          }
        } catch { /* ref read denied/missing — keep fallback name + request date */ }
        return {
          name,
          date,
          attended: status === 'attended',
          statusLabel: status ? status.charAt(0).toUpperCase() + status.slice(1) : '',
        };
      }));
      this.events = items;
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
      this.upcomingEvents = items
        .filter(e => e.date && e.date.getTime() >= startToday.getTime())
        .sort((a, b) => (a.date!.getTime()) - (b.date!.getTime()))   // soonest first
        .slice(0, this.sectionCap);
      this.lastAttendedEvent = items
        .filter(e => e.attended && e.date)
        .sort((a, b) => (b.date!.getTime()) - (a.date!.getTime()))[0] ?? null;   // most recent
    } catch (e) {
      console.warn('slideover events read failed', e);
    } finally {
      this.eventsLoading = false;
    }
  }

  /** APPOINTMENTS — `appointments` where bookedby == profile_data/pid. Status from attended/cancelled.
   *  Resolve each `appointment` ref to its appointmenttype name (scoped, capped — at most 5 ref reads). */
  private async loadAppointments(): Promise<void> {
    const pid = this.row.profileid;
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'appointments'),
        where('bookedby', '==', doc(this.firestore, 'profile_data', pid)),
      ));
      const rows = snap.docs.map(d => d.data() as any);
      // sort by endtime, most recent first
      rows.sort((a, b) => (this.toDate(b['endtime'])?.getTime() ?? 0) - (this.toDate(a['endtime'])?.getTime() ?? 0));
      // Resolve each DISTINCT appointment-type ref once (there are only a handful of types), so we can
      // keep ALL of the participant's appointments without an unbounded number of ref reads.
      const distinctRefs = new Map<string, DocumentReference>();
      for (const d of rows) {
        const ref = d['appointment'] as DocumentReference | undefined;
        if (ref && !distinctRefs.has(ref.path)) distinctRefs.set(ref.path, ref);
      }
      const nameByRef = new Map<string, string>();
      await Promise.all([...distinctRefs.values()].map(async (ref) => {
        try {
          const aSnap = await getDoc(ref);
          if (aSnap.exists()) nameByRef.set(ref.path, (aSnap.data() as any)['appointmenttype'] || 'Appointment');
        } catch { /* denied/missing — falls back below */ }
      }));
      this.appointments = rows.map((d) => {
        const cancelled = d['cancelled'] === true;
        const attended = d['attended'] === true;
        const ref = d['appointment'] as DocumentReference | undefined;
        const statusKind: 'done' | 'ongoing' | 'cancelled' = cancelled ? 'cancelled' : (attended ? 'done' : 'ongoing');
        return {
          name: (ref && nameByRef.get(ref.path)) || 'Appointment',
          start: this.toDate(d['starttime']),
          end: this.toDate(d['endtime']),
          statusLabel: cancelled ? 'Cancelled' : (attended ? 'Completed' : 'Scheduled'),
          statusKind,
        };
      });
      this.apptVisible = this.APPT_PAGE;
    } catch (e) {
      console.warn('slideover appointments read failed', e);
    } finally {
      this.apptsLoading = false;
    }
  }

  /** FORMS FILLED — `formsByClient` in the SECONDARY `firestore-forms` instance, where profileid == pid.
   *  If the named instance couldn't be obtained, degrade to an empty state. Capped. */
  private async loadForms(): Promise<void> {
    const pid = this.row.profileid;
    if (!this.firestoreForms) { this.formsLoading = false; return; }
    try {
      const snap = await getDocs(query(
        collection(this.firestoreForms, 'formsByClient'),
        where('profileid', '==', pid),
      ));
      const items: FormItem[] = snap.docs.map(d => {
        const data: any = d.data();
        return { name: (data['formname'] ?? 'Form').toString(), date: this.toDate(data['date']) };
      });
      items.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      this.forms = items.slice(0, this.sectionCap);
    } catch (e) {
      console.warn('slideover forms read failed', e);
    } finally {
      this.formsLoading = false;
    }
  }

  /** INTERIM REPORTS — `interimreport log` where profileid == pid. Show report types + status + last update. */
  private async loadReports(): Promise<void> {
    const pid = this.row.profileid;
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'interimreport log'),
        where('profileid', '==', pid),
      ));
      const items: ReportItem[] = snap.docs.map(d => {
        const data: any = d.data();
        const codes: string[] = Array.isArray(data['reports']) ? data['reports'] : [];
        const types = codes.map(c => this.reportLabels[c] ?? c).join(', ');
        return {
          types,
          status: (data['status'] ?? '').toString(),
          date: this.toDate(data['lastupdate']) ?? this.toDate(data['createdon']),
        };
      });
      items.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      this.reports = items.slice(0, this.sectionCap);
    } catch (e) {
      console.warn('slideover interim reports read failed', e);
    } finally {
      this.reportsLoading = false;
    }
  }

  /** BREAKTHROUGHS — `Achievements/posts/postcollection` where profileid == pid. Short snippet + date. */
  private async loadBreakthroughs(): Promise<void> {
    const pid = this.row.profileid;
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'Achievements/posts/postcollection'),
        where('profileid', '==', pid),
      ));
      const items: BreakthroughItem[] = snap.docs.map(d => {
        const data: any = d.data();
        const msg = (data['postmessage'] ?? data['paralleltrajectory'] ?? '').toString().trim();
        return { message: msg, date: this.toDate(data['created']) };
      });
      items.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      this.breakthroughs = items.slice(0, this.sectionCap);
    } catch (e) {
      console.warn('slideover breakthroughs read failed', e);
    } finally {
      this.breakthroughsLoading = false;
    }
  }

  /** AEL — `participant AEL` where profileid == pid, orderBy created desc. Status + date. Capped. */
  private async loadAel(): Promise<void> {
    const pid = this.row.profileid;
    try {
      // No orderBy here — a (profileid + created) composite index isn't deployed; sort client-side.
      const snap = await getDocs(query(
        collection(this.firestore, 'participant AEL'),
        where('profileid', '==', pid),
      ));
      this.ael = snap.docs
        .map(d => {
          const data: any = d.data();
          return { status: (data['status'] ?? '').toString(), date: this.toDate(data['created']) };
        })
        .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
        .slice(0, this.sectionCap);
    } catch (e) {
      console.warn('slideover AEL read failed', e);
    } finally {
      this.aelLoading = false;
    }
  }

  /** COACH NOTES — `participant metadata` doc (id == profileid), nested `notes.ahnotes[]`
   *  ({ givenby, ahnotes, date }). This is the A&H CRM coach-notes surface and is readable here
   *  (unlike healthtracker_activity, which has no dev rule). Authors (givenby = a coach profileid)
   *  are resolved to names from their own `participant metadata` docs in one parallel batch. */
  private async loadCoachNotes(): Promise<void> {
    const pid = this.row.profileid;
    try {
      const snap = await getDoc(doc(this.firestore, 'participant metadata', pid));
      const raw: any[] = (snap.data() as any)?.['notes']?.['ahnotes'] ?? [];
      const items: CoachNoteItem[] = raw
        .map(n => ({
          text: (n?.['ahnotes'] ?? '').toString().trim(),
          givenby: (n?.['givenby'] ?? '').toString(),
          date: this.toDate(n?.['date']),
        }))
        .filter(n => n.text)
        .map(n => ({ text: n.text, author: '', date: n.date, givenby: n.givenby } as any));

      // Resolve distinct author ids -> names in parallel; fall back to 'Coach' if missing.
      const ids = [...new Set(items.map((n: any) => n.givenby).filter(Boolean))];
      const names = new Map<string, string>();
      await Promise.all(ids.map(async id => {
        try {
          const a = await getDoc(doc(this.firestore, 'participant metadata', id));
          const name = (a.data() as any)?.['name'];
          if (name) names.set(id, name.toString());
        } catch { /* leave unresolved */ }
      }));

      this.coachNotes = items
        .map((n: any) => ({ text: n.text, date: n.date, author: names.get(n.givenby) || 'Coach' }))
        .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
        .slice(0, this.sectionCap);
    } catch (e) {
      console.warn('slideover coach notes read failed', e);
    } finally {
      this.coachNotesLoading = false;
    }
  }

  // ---- collapsible list sections + top-3 / show-all ----
  /** Toggle a list section open/collapsed. */
  toggleCollapsed(key: string): void {
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
  }
  isCollapsed(key: string): boolean { return this.collapsed.has(key); }

  /** Toggle a list section between top-3 and its full list. */
  toggleShowAll(key: string): void {
    if (this.showAll.has(key)) this.showAll.delete(key);
    else this.showAll.add(key);
  }
  isShowAll(key: string): boolean { return this.showAll.has(key); }

  /** Appointments pager: reveal the next page of APPT_PAGE; "Show less" collapses back to one page. */
  showMoreAppts(): void { this.apptVisible = Math.min(this.appointments.length, this.apptVisible + this.APPT_PAGE); }
  resetAppts(): void { this.apptVisible = this.APPT_PAGE; }
  apptPageNext(): number { return Math.min(this.APPT_PAGE, this.appointments.length - this.apptVisible); }

  /** Copy a header field (name / email / phone) to the clipboard with brief "Copied!" feedback. */
  async copy(value: string | null, field: string): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.copied = field;
      setTimeout(() => { if (this.copied === field) this.copied = null; }, 1500);
    } catch { /* clipboard unavailable — no-op */ }
  }

  /** Pill class for an appointment status kind. */
  apptPillClass(kind: 'done' | 'ongoing' | 'cancelled'): string {
    return kind === 'done' ? 'so-pill-ok' : (kind === 'cancelled' ? 'so-pill-cancel' : 'so-pill-amber');
  }

  healthLabel(s: CoachHealthState | null | undefined): string {
    return coachHealthLabel(s);
  }

  bandClass(band: 'High' | 'Medium' | 'Low'): string {
    return band === 'High' ? 'band-high' : band === 'Medium' ? 'band-med' : 'band-low';
  }

  // ---- Assigned coach control ----
  get currentCoachName(): string {
    return this.row.coachname && this.row.coachname !== '—' ? this.row.coachname : '';
  }
  get currentCoachId(): string {
    const name = this.currentCoachName;
    return this.data.coaches?.find(c => c.name === name)?.id ?? '';
  }
  /** Dropdown change: '__unassign__' -> unassign (null); a coach id -> assign/reassign. */
  onAssignCoach(value: string): void {
    if (value === '__unassign__') { this.data.onAssignCoach(null); return; }
    this.data.onAssignCoach(value);
  }

  /** Header flag toggle: prompt for an optional short note, then delegate (parent owns the write). */
  toggleFlag(): void {
    const note = (window.prompt(this.row.flagged ? 'Remove flag — optional note:' : 'Flag — optional note:', '') ?? '').trim();
    this.data.onToggleFlag(note);
  }

  // ---- Log composer (centered dialog over the side sheet) ----
  /** Open the composer template as its own centered Material dialog. */
  openComposer(): void {
    this.composerOpen = true;
    this.composerRef = this.dialog.open(this.composerTpl, {
      width: 'min(560px, 92vw)',
      maxHeight: '85vh',
      panelClass: 'jchd-logcomposer-panel',
      autoFocus: false,
      restoreFocus: true,
    });
    this.composerRef.afterClosed().subscribe(() => { this.composerOpen = false; });
  }

  cancelComposer(): void {
    this.composerRef?.close();
    this.composerOpen = false;
    this.resetComposer();
  }

  private resetComposer(): void {
    this.composerType = 'call';
    this.composerNote = '';
    this.callOutcome = 'reached';
    this.callNextDate = '';
    this.healthChoice = 'NEUTRAL';
    this.scheduleDate = '';
  }

  /** Submit is valid when the chosen type has its required input (note types need a note; schedule
   *  needs a due date; call/health always have a selected value). */
  composerValid(): boolean {
    if (this.composerType === 'note') return !!this.composerNote.trim();
    if (this.composerType === 'schedule') return !!this.scheduleDate;
    return true;
  }

  submitComposer(): void {
    if (!this.composerValid()) return;
    const note = this.composerNote.trim();
    if (this.composerType === 'call') {
      this.data.onLog('call', { outcome: this.callOutcome, note, nextActionDate: this.parseDate(this.callNextDate) });
    } else if (this.composerType === 'health') {
      this.data.onLog('health', { state: this.healthChoice, note });
    } else if (this.composerType === 'schedule') {
      this.data.onLog('schedule', { dueDate: this.parseDate(this.scheduleDate), note });
    } else {
      this.data.onLog('note', { note });
    }
    // Optimistic: the dashboard owns the write (fire-and-forget) and already reflects row-level fields
    // (last touch / health) on the shared row object. The activity timeline is one-shot-loaded at open,
    // so prepend the new entry here too — otherwise the log only appears after a refresh/reopen.
    this.data.activity = [{
      type: this.composerType as ActivityType,
      actorName: 'You',
      date: new Date(),
      note,
      outcome: this.composerType === 'call' ? this.callOutcome : null,
      state: this.composerType === 'health' ? this.healthChoice : null,
      flagged: false,
      dueDate: this.composerType === 'schedule' ? this.parseDate(this.scheduleDate) : null,
      action: null, fromCoachName: null, toCoachName: null,
    }, ...(this.data.activity ?? [])];
    this.composerRef?.close();
    this.composerOpen = false;
    this.resetComposer();
  }

  // ---- activity timeline display helpers ----
  activityDotClass(type: ActivityType): string {
    switch (type) {
      case 'call': return 'is-call';
      case 'health': return 'is-health';
      case 'schedule': return 'is-schedule';
      case 'note': return 'is-note';
      case 'flag': return 'is-flag';
      case 'coach_change': return 'is-coach';
      default: return 'is-note';
    }
  }

  /** Short label for one activity event, type-aware. */
  activityLabel(a: SlideoverActivityItem): string {
    switch (a.type) {
      case 'call': return a.outcome ? `Call · ${this.titleCase(a.outcome)}` : 'Call';
      case 'health': return `Health · ${coachHealthLabel(a.state ?? null)}`;
      case 'schedule': return a.dueDate ? `Schedule · due ${this.shortDate(a.dueDate)}` : 'Schedule';
      case 'note': return 'Note';
      case 'flag': return a.flagged ? 'Flagged' : 'Flag removed';
      case 'coach_change': {
        const act = (a.action ?? '').toLowerCase();
        if (act === 'unassign') return `Coach removed${a.fromCoachName ? ` · ${a.fromCoachName}` : ''}`;
        if (act === 'reassign') return `Coach changed · ${a.fromCoachName ?? '—'} → ${a.toCoachName ?? '—'}`;
        return `Coach assigned${a.toCoachName ? ` · ${a.toCoachName}` : ''}`;
      }
      default: return 'Activity';
    }
  }

  /** Compact relative date label ("today", "3d ago", or a short date for older). */
  relativeDate(d: Date | null): string {
    if (!d) return '—';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    return this.shortDate(d);
  }

  private shortDate(d: Date): string {
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }
  private titleCase(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  /** Parse a yyyy-mm-dd value from <input type="date"> into a local Date (or null). */
  private parseDate(v: string): Date | null {
    if (!v) return null;
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
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
