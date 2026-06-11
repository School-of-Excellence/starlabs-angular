import { Component, Inject, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Firestore, collection, query, where, getDocs,
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
}

interface TicketItem { subject: string; status: string; date: Date | null; }

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
          <h2 class="so-name" id="so-title">{{ row.name }}</h2>
          <div class="so-meta">
            <span class="so-num">{{ row.number || '—' }}</span>
            <span class="so-dot">·</span>
            <span class="so-tier">{{ row.atcmodel || 'No tier' }}</span>
          </div>
        </div>
        <div class="so-head-actions">
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

        <!-- Tickets -->
        <section class="so-sec" aria-live="polite">
          <h3 class="so-sec-h">Tickets <span class="so-count">{{ row.openTickets }}</span></h3>
          <div *ngIf="ticketsLoading" class="so-skel-group">
            <div class="so-skel"></div><div class="so-skel"></div>
          </div>
          <ng-container *ngIf="!ticketsLoading">
            <ul class="so-list" *ngIf="tickets.length; else noTickets">
              <li *ngFor="let t of tickets" class="so-list-row">
                <span class="so-list-main">{{ t.subject || 'Support ticket' }}</span>
                <span class="so-list-side">
                  <span class="so-status">{{ t.status }}</span>
                  <span class="so-sub" *ngIf="t.date">{{ t.date | date:'shortDate' }}</span>
                </span>
              </li>
            </ul>
            <ng-template #noTickets><p class="so-empty">No open tickets.</p></ng-template>
          </ng-container>
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
        <a mat-stroked-button class="so-act" [routerLink]="['/userprofile', row.profileid]" (click)="close()">
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
    .so-meta { margin-top: 3px; color: var(--so-ink2); font-size: 12.5px; }
    .so-dot { margin: 0 6px; color: var(--so-muted); }
    .so-tier { text-transform: uppercase; letter-spacing: 0.02em; font-size: 11.5px; color: var(--so-ink2); }

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
    .so-status { font-size: 11.5px; font-weight: 600; color: #c25e00; text-transform: capitalize; }

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
  }

  async ngOnInit(): Promise<void> {
    await this.loadTickets();
  }

  private async loadTickets(): Promise<void> {
    const pid = this.row.profileid;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'clientissue'), where('clientid', '==', pid)));
      const items: TicketItem[] = [];
      snap.forEach(d => {
        const data: any = d.data();
        const status = data['status']?.status ?? 'open';
        if ((status ?? '').toLowerCase() !== 'open') return;
        // 'issue' is the human-readable subject on clientissue docs (same field the
        // Customer Support screens display). Fall back to a clean label, never a raw id.
        const issue = typeof data['issue'] === 'string' ? data['issue'].trim() : '';
        items.push({
          subject: issue || `Support ticket · ${status}`,
          status,
          date: this.toDate(data['reporteddate']) ?? this.toDate(data['doccreateddate']) ?? this.toDate(data['createddate']) ?? this.toDate(data['date']),
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
