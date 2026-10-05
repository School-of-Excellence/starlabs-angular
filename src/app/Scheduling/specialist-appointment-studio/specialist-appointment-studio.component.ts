import { Component, NgZone, OnDestroy, OnInit, TemplateRef, ViewChild, ViewEncapsulation } from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Firestore, collection, doc, deleteDoc, writeBatch, QueryDocumentSnapshot } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { firstValueFrom, take } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { AppointmentDetailComponent } from '../appointment-detail/appointment-detail.component';
import { BookAppointmentComponent } from '../book-appointment/book-appointment.component';
import {
  AppointmentBookingService, Bookable, BookSlot, EisSlot, RolePlan, TypeRoles, slotGapMessage,
} from '../book-appointment/appointment-booking.service';
import {
  SpecialistAppointmentService, ApptRow, Specialist, Team, TypeOption, ProductBreakdown, TypeBreakdown,
  FilterProduct, FilterType,
} from './specialist-appointment.service';
import {
  ViewRole, VIEW_LABEL, ownsProduct, AvailWindow, AvailStatus, Hours, Interval, Period, PeriodMode, ApptStatus,
  WindowState, WindowStatus, WINDOW_STATUSES, SasFilter, NO_FILTER, BookedFilter, DayColumn, DayEntry, SlotGrouping, Appt,
  apptStatus, availStatus, hoursSummary, fmtHours, periodOf, shiftPeriod, sameDay, mondayOf, openMinutes, windowState,
  windowStatus, scopeWindow, apptMatches, windowMatchesBooked, dayColumns, groupColumns, joinOpen, JOIN_LEAD_MIN,
  NO_SHOW_REASON, daysBetween, overlapsAny, previewSlots,
} from './sas-logic';

/* Specialist Appointment Studio: centralised appointments for CW specialists, mentor specialists and the
   A&H team, as ONE component (operator, 2026-10-05: no sub-components). Each tab's logic is a plain class
   below; the shared pieces (period bar, filter bar, person picker, loader) and the dialogs are
   <ng-template>s in the one template — MatDialog opens a TemplateRef as well as a component.
   Pure rules live in sas-logic.ts; Firestore reads in SpecialistAppointmentService; the booking write in
   AppointmentBookingService (shared with Book Appointment).
   Plans: specs/plans/2026-09-29-centralised-appointments.md, 2026-10-01-…-round1.md, 2026-10-05-…-round2.md.
   Hook prefix: sas */

export type SasTab = 'home' | 'team' | 'overview' | 'mentors' | 'util' | 'book' | 'settings';
interface NavItem { tab: SasTab; label: string; icon: string; }

/* The left nav belongs to this screen only. "View as" lists every view the user holds a role for
   (Mentor, A&H, CW); it opens on the highest usable one. */
export const NAV: Record<Exclude<ViewRole, null>, NavItem[]> = {
  cw: [{ tab: 'home', label: 'Home', icon: 'home' }],
  mentor: [{ tab: 'home', label: 'Home', icon: 'home' }, { tab: 'team', label: 'My Team', icon: 'group' }],
  ah: [
    { tab: 'overview', label: 'Overview', icon: 'dashboard' },
    { tab: 'mentors', label: 'Mentors', icon: 'supervisor_account' },
    { tab: 'util', label: 'Utilisation', icon: 'insights' },
    { tab: 'book', label: 'Book Session', icon: 'event_available' },
    { tab: 'settings', label: 'Delivery Type Details', icon: 'tune' },
  ],
};

const APPT_PILL: Record<ApptStatus, string> = {
  Completed: 'is-success', Cancelled: 'is-neutral', 'In session': 'is-solid', Pending: 'is-warning', Booked: '',
};
const APPT_CHIP: Record<ApptStatus, string> = {
  Completed: 'st-done', Cancelled: 'st-off', 'In session': 'st-live', Pending: 'st-warn', Booked: 'st-booked',
};
const WINDOW_PILL: Record<WindowStatus, string> = {
  'Open for booking': 'is-success', 'Partly booked': 'is-success', 'Fully booked': '', 'Completion pending': 'is-warning',
  Completed: 'is-success', Cancelled: 'is-neutral', Unused: 'is-neutral',
};
const STATE_DOT: Record<WindowState, string> = { open: 'var(--bt-success)', full: 'var(--bt-primary)', ended: 'var(--bt-ink-25)', unused: 'var(--bt-ink-25)' };
const byStart = (a: ApptRow, b: ApptRow) => a.appt.start.getTime() - b.appt.start.getTime();
const roleLabel = (s: Specialist) => (s.role === 'mentor' ? 'Mentor' : 'CW');

/* ======================================================================================
   Shared pieces (rendered by <ng-template>s: #periodBarTpl, #filterBarTpl, #personTpl)
   ====================================================================================== */

/* Day / Week / Month · previous / next · Today. Day only where allowDay (the calendar screens); there
   Today opens today's Day view. */
export class PeriodBar {
  constructor(public period: Period, private changed: (p: Period) => void, public allowDay = false, public allowMonth = true) {}
  emit(p: Period) { this.period = p; this.changed(p); }
  shift(dir: 1 | -1) { this.emit(shiftPeriod(this.period, dir)); }
  today() { this.emit(periodOf(this.allowDay ? 'day' : this.period.mode, new Date())); }
  setMode(m: PeriodMode) { if (m !== this.period.mode) this.emit(periodOf(m, this.period.from)); }
}

/* A searchable person dropdown (ngx-mat-select-search). allLabel adds a first option with value ''. */
export interface PersonOption { id: string; name: string; sub?: string; }
export class PersonPicker {
  q = '';
  disabled = false;
  constructor(public people: PersonOption[], public value: string | null, private picked: (v: string | null) => void,
    public placeholder: string, public label: string, public allLabel: string | null = null) {}
  get shown(): PersonOption[] {
    const q = this.q.trim().toLowerCase();
    return q ? this.people.filter(p => p.name.toLowerCase().includes(q)) : this.people;
  }
  pick(v: string | null) {
    if (v === undefined) return;          // the search row is an option without a value
    this.value = v;
    this.picked(v);
  }
}

/* Product · Delivery types · (Booked / Not booked). Picking a product limits the type list to that
   product's delivery-sequence types (sequence order), all ticked (operator, 2026-10-05). Options per
   scope: SpecialistAppointmentService.filterOptions. Booked / Not booked is Home only. */
export class FilterBar {
  loading = true;
  products: FilterProduct[] = [];
  types: FilterType[] = [];
  productId: string | null = null;
  typeIds: string[] = [];
  booked: BookedFilter = 'all';
  readonly ready: Promise<void>;

  constructor(svc: SpecialistAppointmentService, scope: 'all' | 'mentor' | 'cw', profileId: string,
    public showBooked: boolean, private changed: (f: SasFilter) => void) {
    this.ready = svc.filterOptions(scope, profileId)
      .then(o => { this.products = o.products; this.types = o.types; })
      .catch(e => console.error('Specialist appointment studio: filter options failed', e))
      .then(() => { this.loading = false; });
  }

  /* The type list: the picked product's types in delivery-sequence order, else every option. */
  get shownTypes(): FilterType[] {
    const p = this.products.find(x => x.id === this.productId);
    if (!p) return this.types;
    return p.typeIds.map(id => this.types.find(t => t.id === id)).filter((t): t is FilterType => !!t);
  }
  get active() { return !!this.productId || this.typeIds.length > 0 || this.booked !== 'all'; }

  onProduct() {
    const p = this.products.find(x => x.id === this.productId);
    this.typeIds = p ? [...p.typeIds] : [];
    this.emit();
  }
  setBooked(b: BookedFilter) { this.booked = b; this.emit(); }
  clear() { this.productId = null; this.typeIds = []; this.booked = 'all'; this.emit(); }

  /* No type ticked: with a product, its own types (possibly none, which matches nothing); without one,
     no type filter. */
  emit() {
    const p = this.products.find(x => x.id === this.productId);
    const typeIds = this.typeIds.length ? [...this.typeIds] : p ? [...p.typeIds] : null;
    this.changed({ productId: this.productId, typeIds, booked: this.booked });
  }
}

/* ======================================================================================
   Home (CW / Mentor: mode 'self') and Overview (A&H: mode 'all')
   ====================================================================================== */
type PastFilter = 'pending' | 'completed' | 'cancelled';
const PAST_PAGE = 10;          // rows added per Load more
const PAST_FETCH = 25;         // appointments read per Firestore page
const PAST_MAX_FETCHES = 8;    // per click, so a rare status can't read the whole history in one go
interface CalDay { date: Date; windows: { w: AvailWindow; state: WindowState; label: string; sessions: ApptRow[]; open: number }[]; loose: ApptRow[]; }
interface MonthCell { date: Date; out: boolean; lines: { label: string; color: string }[]; more: number; }

export class HomeTab {
  readonly bar: PeriodBar;
  readonly filterBar: FilterBar;
  picker: PersonPicker | null = null;
  specialists: Specialist[] = [];
  specialistId = '';          // mode 'all': '' = everyone

  loading = true;
  greeting = '';
  subtitle = '';
  hours: Hours | null = null;
  openMin = 0;
  days: CalDay[] = [];
  month: MonthCell[] = [];
  /* Day view: one column per delivery type (operator, 2026-10-01), or one time-ordered list. */
  dayCols: DayColumn[] = [];
  /* Any filter on → Week lists slots instead of windows, so a slot is booked or not booked, never both
     (operator, 2026-10-05). Month shows open / booked counts. */
  slotMode = false;
  slotDays: { date: Date; cols: DayColumn[] }[] = [];
  groupBy: SlotGrouping = 'type';
  /* Product · types · booked filter. Product and types apply everywhere; booked only to the calendar. */
  filter: SasFilter = NO_FILTER;
  /* Bulk delete: the period's windows (filtered by product and types), future + unbooked selectable. */
  availList: AvailWindow[] = [];
  selected = new Set<string>();
  deleting = false;
  upcoming: ApptRow[] = [];
  /* Past sessions load lazily: PAST_PAGE matching rows at a time, newest first, via Load more. */
  past: ApptRow[] = [];
  pastFilter: PastFilter = 'pending';
  pastLoading = false;
  pastDone = false;
  now = new Date();
  private pastCursor: QueryDocumentSnapshot | null = null;
  private pastRun = 0;
  private loadRun = 0;
  private raw: { wins: AvailWindow[]; appts: ApptRow[]; up: ApptRow[] } = { wins: [], appts: [], up: [] };

  constructor(private h: SpecialistAppointmentStudioComponent, public mode: 'self' | 'all') {
    this.bar = new PeriodBar(periodOf('week', new Date()), () => this.load(), true);
    const scope = mode === 'all' ? 'all' : h.svc.viewRole === 'mentor' ? 'mentor' : 'cw';
    this.filterBar = new FilterBar(h.svc, scope, h.svc.profileId, true, f => this.onFilter(f));
  }

  get period() { return this.bar.period; }
  get svc() { return this.h.svc; }

  async init() {
    await this.svc.init();
    const hr = new Date().getHours();
    const first = (this.svc.name(this.svc.profileId) || '').split(' ')[0];
    this.greeting = `Good ${hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening'}${first && first !== '—' ? ', ' + first : ''}`;
    if (this.mode === 'all') {
      this.subtitle = 'Every specialist\'s availability, sessions and utilisation.';
      this.specialists = await this.svc.specialists();
      this.picker = new PersonPicker(this.specialists.map(s => ({ id: s.profileId, name: s.name, sub: roleLabel(s) })), '',
        v => { this.specialistId = v || ''; this.load(); }, 'All specialists', 'Specialist', 'All specialists');
    } else {
      const owned: string[] = this.svc.roles['productowner'] ?? [];
      this.subtitle = this.svc.viewRole === 'mentor'
        ? `Mentor${owned.length ? ' · product owner for ' + owned.join(', ') : ''}. Your utilisation, your calendar and your sessions.`
        : 'CW Specialist. Your utilisation, your calendar and your sessions.';
    }
    await this.load();
  }

  /* Whose data: the logged-in profile, one picked specialist, or everyone (null). */
  get hostIds(): string[] | null {
    if (this.mode === 'self') return [this.svc.profileId];
    return this.specialistId ? [this.specialistId] : null;
  }
  get allMode() { return this.hostIds === null; }

  /* Reloads everything for the current period and specialist. A newer call wins: an older one that
     finishes late (e.g. after a quick "next week") must not overwrite the newer period's data. */
  async load() {
    const run = ++this.loadRun;
    this.loading = true;
    this.now = new Date();
    const ids = this.hostIds, p = this.period;
    const upTo = new Date(this.now); upTo.setDate(upTo.getDate() + (ids ? 60 : 30));
    const upFrom = new Date(this.now); upFrom.setHours(0, 0, 0, 0);
    // The month grid shows whole weeks, so fetch from its first Monday to cover the edges.
    const calFrom = p.mode === 'month' ? mondayOf(p.from) : p.from;
    const calTo = p.mode === 'month' ? new Date(calFrom.getTime() + 42 * 86400000) : p.to;
    try {
      this.loadPast(true);
      const [wins, appts, up] = await Promise.all([
        this.svc.windows(ids, calFrom, calTo),
        this.svc.appointments(ids, calFrom, calTo),
        this.svc.appointments(ids, upFrom, upTo, ids ? 0 : 300),
      ]);
      if (run !== this.loadRun) return;
      this.raw = { wins, appts, up };
      this.apply();
    } catch (e) {
      if (run !== this.loadRun) return;
      console.error('Specialist appointment studio: load failed', e);
      this.h.snack.open('Could not load appointments. Try again.', 'OK', { duration: 5000 });
    }
    this.loading = false;
  }

  /* Everything below the period bar from the fetched data and the filter; no Firestore reads, so a
     filter change is instant. Windows are cut to the picked types (scopeWindow) before any hours. */
  private apply() {
    const f = this.filter, p = this.period;
    const inP = <T extends { start: Date }>(x: T) => x.start >= p.from && x.start < p.to;
    const wins = this.raw.wins.map(w => scopeWindow(w, f.typeIds)).filter((w): w is AvailWindow => !!w);
    const appts = this.raw.appts.filter(r => apptMatches(r.appt, f));
    const pWins = wins.filter(inP), pAppts = appts.map(r => r.appt).filter(inP);
    this.hours = hoursSummary(pWins, pAppts);
    this.openMin = pWins.reduce((a, w) => a + openMinutes(w, this.now), 0);
    this.upcoming = this.raw.up.filter(r => !r.appt.cancelled && !r.appt.attended && r.appt.end > this.now && apptMatches(r.appt, f));
    // Booked / Not booked narrows the calendar only; Not booked hides the sessions.
    this.buildCalendar(wins.filter(w => windowMatchesBooked(w, f.booked, this.now)), f.booked === 'open' ? [] : appts, p);
    this.slotMode = !!f.productId || !!f.typeIds || f.booked !== 'all';
    const all = appts.map(r => r.appt);
    this.dayCols = p.mode === 'day' ? this.slotCols(p.from, pWins, pAppts) : [];
    this.slotDays = this.slotMode && p.mode === 'week' ? this.days.map(d => ({ date: d.date, cols: this.slotCols(d.date, wins, all) })) : [];
    if (this.slotMode && p.mode === 'month') {
      this.month = this.month.map(c => {
        const entries = dayColumns(wins.filter(w => sameDay(w.start, c.date)), all.filter(a => sameDay(a.start, c.date)), this.now, f.booked)
          .flatMap(x => x.entries);
        const open = entries.filter(e => !e.booked).length, booked = entries.length - open;
        const lines = [
          ...(open ? [{ label: `${open} open`, color: STATE_DOT.open }] : []),
          ...(booked ? [{ label: `${booked} booked`, color: STATE_DOT.full }] : []),
        ];
        return { ...c, lines, more: 0 };
      });
    }
    const ids = new Set(pWins.map(w => w.id));
    this.availList = this.raw.wins.filter(w => ids.has(w.id))
      .sort((a, b) => a.start.getTime() - b.start.getTime() || this.svc.name(a.profileId).localeCompare(this.svc.name(b.profileId)));
    this.selected = new Set([...this.selected].filter(id => this.availList.some(w => w.id === id && this.canDelete(w))));
  }

  /* One day's slots, grouped by type or in time order. */
  private slotCols(d: Date, wins: AvailWindow[], appts: Appt[]): DayColumn[] {
    const cols = dayColumns(wins.filter(w => sameDay(w.start, d)), appts.filter(a => sameDay(a.start, d)), this.now, this.filter.booked);
    return groupColumns(cols, this.groupBy, id => this.h.typeLabel(id));
  }

  setGroup(g: SlotGrouping) { if (g !== this.groupBy) { this.groupBy = g; this.apply(); } }

  onFilter(f: SasFilter) {
    const scopeChanged = f.productId !== this.filter.productId || String(f.typeIds) !== String(this.filter.typeIds);
    this.filter = f;
    this.apply();
    if (scopeChanged) this.loadPast(true);
  }

  private buildCalendar(wins: AvailWindow[], live: ApptRow[], period: Period) {
    const dayOf = (d: Date): CalDay => {
      const ws = wins.filter(w => sameDay(w.start, d))
        .sort((a, b) => a.start.getTime() - b.start.getTime() || this.svc.name(a.profileId).localeCompare(this.svc.name(b.profileId)));
      // A session belongs to a window of the same specialist that it starts inside, once per specialist:
      // a collaborative session shows under every host's window (operator, 2026-10-05).
      const used = new Set<string>(), key = (r: ApptRow, who: string) => r.appt.id + '|' + who;
      const windows = ws.map(w => {
        const sessions = live.filter(r => sameDay(r.appt.start, d) && r.appt.hostIds.includes(w.profileId)
            && r.appt.start >= w.start && r.appt.start < w.end && !used.has(key(r, w.profileId))).sort(byStart);
        sessions.forEach(r => used.add(key(r, w.profileId)));
        return { w, state: windowState(w, this.now), label: windowStatus(w, sessions.map(r => r.appt), this.now) as string, sessions, open: openMinutes(w, this.now) };
      });
      const placed = new Set([...used].map(k => k.split('|')[0]));
      const loose = live.filter(r => sameDay(r.appt.start, d) && !placed.has(r.appt.id));
      return { date: d, windows, loose };
    };
    if (period.mode === 'day') {
      this.days = [dayOf(period.from)];
      this.month = [];
    } else if (period.mode === 'week') {
      this.days = Array.from({ length: 7 }, (_, i) => dayOf(new Date(period.from.getFullYear(), period.from.getMonth(), period.from.getDate() + i)));
      this.month = [];
    } else {
      const start = mondayOf(period.from), mo = period.from.getMonth();
      this.month = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (i >= 35 && d.getMonth() !== mo) break;
        const day = dayOf(d);
        let lines: { label: string; color: string }[];
        if (this.allMode) {
          // Everyone at once: a count per day instead of every window.
          const people = new Set(day.windows.map(x => x.w.profileId)).size;
          const booked = [...day.windows.flatMap(x => x.sessions), ...day.loose].filter(r => !r.appt.cancelled).length;
          lines = day.windows.length || booked ? [
            { label: `${people} specialist${people === 1 ? '' : 's'} · ${day.windows.length} window${day.windows.length === 1 ? '' : 's'}`, color: STATE_DOT.open },
            { label: `${booked} booked`, color: STATE_DOT.full },
          ] : [];
        } else {
          lines = day.windows.map(x => ({
            label: `${this.h.t(x.w.start)}–${this.h.t(x.w.end)}${x.sessions.length ? ' · ' + x.sessions.length + ' booked' : ''}`,
            color: STATE_DOT[x.state],
          }));
        }
        this.month.push({ date: d, out: d.getMonth() !== mo, lines: lines.slice(0, 3), more: Math.max(0, lines.length - 3) });
      }
      this.days = [];
    }
  }

  isToday(d: Date) { return sameDay(d, this.now); }
  isFutureDay(d: Date) { const x = new Date(this.now); x.setHours(0, 0, 0, 0); return d >= x; }
  status(r: ApptRow): ApptStatus { return apptStatus(r.appt, this.now); }
  pillClass(r: ApptRow) { return APPT_PILL[this.status(r)]; }
  chipClass(r: ApptRow) { return APPT_CHIP[this.status(r)]; }
  hostNames(r: ApptRow) { return r.appt.hostIds.map(id => this.svc.name(id)).join(', '); }

  /* Completed · Cancelled · Status updation pending (ended, not marked). */
  private pastMatches(r: ApptRow): boolean {
    if (!apptMatches(r.appt, this.filter)) return false;
    const s = this.status(r), f = this.pastFilter;
    return f === 'pending' ? s === 'Pending' : f === 'completed' ? s === 'Completed' : s === 'Cancelled';
  }

  /* Fetch raw pages (newest first) until PAST_PAGE more rows match the filter, or nothing older is left.
     reset = start again (new filter, specialist or reload). A newer call cancels an older one. */
  async loadPast(reset: boolean) {
    const run = reset ? ++this.pastRun : this.pastRun;
    if (reset) { this.past = []; this.pastCursor = null; this.pastDone = false; }
    if (this.pastDone || (this.pastLoading && !reset)) return;
    this.pastLoading = true;
    const host = this.hostIds ? this.hostIds[0] : null;
    let found = 0;
    try {
      for (let i = 0; i < PAST_MAX_FETCHES && found < PAST_PAGE && !this.pastDone; i++) {
        const page = await this.svc.pastPage(host, this.pastCursor, PAST_FETCH);
        if (run !== this.pastRun) return;
        this.pastCursor = page.cursor;
        this.pastDone = page.done;
        const hits = page.rows.filter(r => this.pastMatches(r));
        this.past = [...this.past, ...hits];
        found += hits.length;
      }
    } catch (e) {
      console.error('Specialist appointment studio: past sessions failed', e);
      this.h.snack.open('Could not load past sessions. Try again.', 'OK', { duration: 5000 });
    }
    if (run === this.pastRun) this.pastLoading = false;
  }

  reasonShown(r: ApptRow) { return r.appt.cancelled && r.appt.cancelledReason && r.appt.cancelledReason !== NO_SHOW_REASON; }

  /* A date picked in Month view or a day header in Week view opens that day (operator, 2026-10-01). */
  gotoDay(d: Date) { this.bar.period = periodOf('day', d); this.load(); }

  /* ---------- Day view / filtered Week entries ---------- */
  entryRow(e: DayEntry): ApptRow | null { return e.appt ? this.raw.appts.find(r => r.appt.id === e.appt!.id) ?? null : null; }
  entryStatus(e: DayEntry): string {
    if (!e.booked) return 'Open';
    if (!e.appt) return 'Booked';
    const s = apptStatus(e.appt, this.now);
    return s === 'Pending' ? 'Completion pending' : s;
  }
  entryClass(e: DayEntry) {
    if (!e.booked) return 'sas-slot s-open';
    const row = this.entryRow(e);
    return row ? 'sas-slot is-sess ' + this.chipClass(row) : 'sas-slot s-full';
  }
  entryClick(e: DayEntry) {
    const row = this.entryRow(e);
    if (row) this.openDetail(row);
    else if (e.w) this.openWindow(e.w);
  }

  /* ---------- actions ---------- */
  addAvailability(date?: Date) {
    const profileId = this.mode === 'self' ? this.svc.profileId : (this.specialistId || null);
    this.h.openAdd({ profileId, specialists: this.mode === 'all' ? this.specialists : [], date }).then(saved => { if (saved) this.load(); });
  }

  /* Availability details for a calendar window. The dialog gets the unfiltered window, so it lists
     every type the window offers, and every session booked in it. */
  openWindow(w: AvailWindow) {
    const full = this.raw.wins.find(x => x.id === w.id) ?? w;
    const sessions = this.raw.appts.filter(r => r.appt.hostIds.includes(full.profileId)
      && r.appt.start >= full.start && r.appt.start < full.end).sort(byStart);
    this.h.openWindow(full, sessions).then(res => {
      if (res === 'delete') this.deleteWindow(full);
      else if (res) this.openDetail(res);
    });
  }

  /* ---------- Bulk delete (operator, 2026-10-01): future windows with nothing booked ---------- */
  canDelete(w: AvailWindow) { return w.start > this.now && !w.slots.some(s => s.booked); }
  get selectable() { return this.availList.filter(w => this.canDelete(w)); }
  get allSelected() { return this.selectable.length > 0 && this.selectable.every(w => this.selected.has(w.id)); }
  toggleAll() { this.selected = this.allSelected ? new Set() : new Set(this.selectable.map(w => w.id)); }
  toggle(w: AvailWindow) {
    const s = new Set(this.selected);
    if (s.has(w.id)) s.delete(w.id); else s.add(w.id);
    this.selected = s;
  }
  windowLabelOf(w: AvailWindow) {
    const sessions = this.raw.appts.filter(r => r.appt.hostIds.includes(w.profileId) && r.appt.start >= w.start && r.appt.start < w.end);
    return windowStatus(w, sessions.map(r => r.appt), this.now);
  }

  async deleteSelected() {
    // Re-check against the latest data: a slot may have been booked since the list was built.
    const ids = this.availList.filter(w => this.selected.has(w.id) && this.canDelete(w)).map(w => w.id);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} availability window${ids.length === 1 ? '' : 's'}?`)) return;
    this.deleting = true;
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(this.h.firestore);
        ids.slice(i, i + 400).forEach(id => batch.delete(doc(this.h.firestore, 'availability/' + id)));
        await batch.commit();
      }
      this.selected = new Set();
      this.h.snack.open(`${ids.length} availability window${ids.length === 1 ? '' : 's'} deleted.`, undefined, { duration: 3000 });
      await this.load();
    } catch (e) {
      console.error('Specialist appointment studio: bulk delete failed', e);
      this.h.snack.open('Could not delete. Try again.', 'OK', { duration: 5000 });
    }
    this.deleting = false;
  }

  /* Same rule as appointment-availability onrowdelete: only while nothing is booked in it. */
  async deleteWindow(w: AvailWindow, ev?: Event) {
    ev?.stopPropagation();
    if (w.slots.some(s => s.booked)) { alert('Booking were already made. Please ask client to cancel it'); return; }
    if (!confirm('Delete this day Slot?')) return;
    try {
      await deleteDoc(doc(this.h.firestore, 'availability/' + w.id));
      this.h.snack.open('Availability deleted.', undefined, { duration: 3000 });
      this.load();
    } catch (e) { alert(e); }
  }

  openDetail(r: ApptRow) { this.h.openAppointment(r, () => this.load()); }
}

/* ======================================================================================
   Team table: one row per EIS; opening a row shows every availability window in the period with its
   status and the sessions booked in it. Used by My Team and by an opened Mentors row.
   ====================================================================================== */
interface Participant { id: string; productId: string | null; next: ApptRow | null; }
interface AvailEntry { w: AvailWindow; state: WindowState; status: WindowStatus; openMin: number; sessions: ApptRow[]; }
export interface TeamRow {
  id: string; name: string; status: AvailStatus; openWeekMin: number; hours: Hours; participants: Participant[];
  avail: AvailEntry[];      // every window in the period, oldest first
  outside: ApptRow[];       // sessions in the period that sit in no window
}
export interface TeamSummary { hours: Hours; openWeekMin: number; participants: number; members: number; }

export class TeamTable {
  rows: TeamRow[] = [];
  open: string | null = null;
  loading = true;
  availFilter: WindowStatus | '' = '';
  q = '';                 // name search: matches the EIS or any of their participants

  constructor(private h: SpecialistAppointmentStudioComponent, public members: string[], private period: () => Period,
    private summary: ((s: TeamSummary) => void) | null = null) {}

  get svc() { return this.h.svc; }
  get shown(): TeamRow[] {
    const t = this.q.trim().toLowerCase();
    if (!t) return this.rows;
    return this.rows.filter(r => r.name.toLowerCase().includes(t) || r.participants.some(p => this.svc.name(p.id).toLowerCase().includes(t)));
  }

  async load() {
    this.loading = true;
    const ids = this.members, period = this.period();
    if (!ids.length) { this.rows = []; this.loading = false; this.emit([], [], [], []); return; }
    const now = new Date(), wk = mondayOf(now), wkEnd = new Date(wk.getTime() + 7 * 86400000);
    const upTo = new Date(now.getTime() + 60 * 86400000);
    const [wins, appts, weekWins, upcoming] = await Promise.all([
      this.svc.windows(ids, period.from, period.to),
      this.svc.appointments(ids, period.from, period.to),
      this.svc.windows(ids, wk, wkEnd),
      this.svc.appointments(ids, now, upTo),
    ]);
    this.rows = ids.map(id => {
      const mine = (l: AvailWindow[]) => l.filter(w => w.profileId === id);
      const myAppts = appts.filter(r => r.appt.hostIds.includes(id));
      const myUp = upcoming.filter(r => r.appt.hostIds.includes(id) && !r.appt.cancelled && !r.appt.attended).sort(byStart);
      const openWeekMin = mine(weekWins).reduce((a, w) => a + openMinutes(w, now), 0);
      const status = availStatus(mine(weekWins), [...myAppts, ...myUp].map(r => r.appt), now);
      const people = new Map<string, Participant>();
      // Everyone they have a live booking with. Not limited to the mentor's products: about a quarter of
      // appointments carry no productid, so a product filter showed 0 for EIS who clearly had bookings.
      [...myAppts, ...myUp].filter(r => !r.appt.cancelled).forEach(r => {
        const p = r.appt.participantId;
        if (p && !people.has(p)) people.set(p, { id: p, productId: r.appt.productId, next: myUp.find(u => u.appt.participantId === p) ?? null });
      });
      const used = new Set<string>();
      const avail: AvailEntry[] = mine(wins).sort((a, b) => a.start.getTime() - b.start.getTime()).map(w => {
        const sessions = myAppts.filter(r => !used.has(r.appt.id) && r.appt.start >= w.start && r.appt.start < w.end).sort(byStart);
        sessions.forEach(r => used.add(r.appt.id));
        return { w, state: windowState(w, now), status: windowStatus(w, sessions.map(r => r.appt), now), openMin: openMinutes(w, now), sessions };
      });
      return {
        id, name: this.svc.name(id), status, openWeekMin, hours: hoursSummary(mine(wins), myAppts.map(r => r.appt)),
        participants: [...people.values()], avail, outside: myAppts.filter(r => !used.has(r.appt.id)).sort(byStart),
      } as TeamRow;
    }).sort((a, b) => a.name.localeCompare(b.name));
    this.emit(wins, appts, weekWins, this.rows);
    this.loading = false;
  }

  private emit(wins: AvailWindow[], appts: ApptRow[], weekWins: AvailWindow[], rows: TeamRow[]) {
    if (!this.summary) return;
    const now = new Date();
    this.summary({
      hours: hoursSummary(wins, appts.map(r => r.appt)),
      openWeekMin: weekWins.reduce((a, w) => a + openMinutes(w, now), 0),
      participants: new Set(rows.flatMap(r => r.participants.map(p => p.id))).size,
      members: rows.length,
    });
  }

  toggle(id: string) { this.open = this.open === id ? null : id; this.availFilter = ''; }
  initials(n: string) { return n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
  statusClass(s: AvailStatus) { return s === 'In session' ? 'is-solid' : s === 'Available' ? 'is-success' : 'is-neutral'; }
  /* The open row's windows, narrowed by the status filter. */
  filteredAvail(r: TeamRow): AvailEntry[] { return this.availFilter ? r.avail.filter(a => a.status === this.availFilter) : r.avail; }
  statusCount(r: TeamRow, st: WindowStatus) { return r.avail.filter(a => a.status === st).length; }
  apptPill(r: ApptRow) { return APPT_PILL[apptStatus(r.appt, new Date())]; }
  apptLabel(r: ApptRow) { const s = apptStatus(r.appt, new Date()); return s === 'Pending' ? 'Completion pending' : s; }
}

/* ======================================================================================
   Mentor · My Team. Products from users_roles.productowner (Profile list, Product Owner); each opens to
   the appointment types in its delivery sequence, their roles and the EIS on each role. The team is every
   EIS found that way. The search filters names in both lists.
   ====================================================================================== */
export class TeamTab {
  readonly bar: PeriodBar;
  owned: string[] = [];
  products: ProductBreakdown[] = [];
  loadingProducts = true;
  team: Team | null = null;
  table: TeamTable | null = null;
  sum: TeamSummary | null = null;
  open = new Set<string>();
  initialising = true;
  private _q = '';

  constructor(private h: SpecialistAppointmentStudioComponent) {
    this.bar = new PeriodBar(periodOf('week', new Date()), () => this.table?.load());
  }

  get q() { return this._q; }
  set q(v: string) { this._q = v; if (this.table) this.table.q = v; }
  get term() { return this._q.trim().toLowerCase(); }

  async init() {
    await this.h.svc.init();
    this.owned = this.h.svc.roles['productowner'] ?? [];
    this.initialising = false;
    if (!this.owned.length) return;
    [this.products, this.team] = await Promise.all([this.h.svc.productsFor(this.owned), this.h.svc.teamForAtcModels(this.owned)]);
    this.loadingProducts = false;
    this.table = new TeamTable(this.h, this.team.memberIds, () => this.bar.period, s => this.sum = s);
    this.table.q = this._q;
    await this.table.load();
  }

  /* EIS names on a role, narrowed to the search when there is one. */
  eisNames(ids: string[]): string[] {
    const names = ids.map(id => this.h.svc.name(id)).sort((a, b) => a.localeCompare(b));
    return this.term ? names.filter(n => n.toLowerCase().includes(this.term)) : names;
  }
  typeMatches(t: TypeBreakdown) { return t.roles.some(r => this.eisNames(r.eisIds).length); }
  productMatches(p: ProductBreakdown) { return p.types.some(t => this.typeMatches(t)); }
  anyProductMatch() { return this.products.some(p => this.productMatches(p)); }
  eisCount(p: ProductBreakdown) { return new Set(p.types.flatMap(t => t.roles.flatMap(r => r.eisIds))).size; }
  /* While searching, every product with a match is open so the names are visible. */
  isOpen(p: ProductBreakdown) { return this.term ? this.productMatches(p) : this.open.has(p.id); }
  toggle(id: string) { this.open.has(id) ? this.open.delete(id) : this.open.add(id); }
}

/* ======================================================================================
   A&H · Mentors: every mentor with their owned products, team size, participants and team utilisation
   (mentor + team). A row opens that mentor's team table.
   ====================================================================================== */
interface MentorRow { m: Specialist; team: Team; participants: number; hours: Hours; }

export class MentorsTab {
  readonly bar: PeriodBar;
  rows: MentorRow[] = [];
  open: string | null = null;
  table: TeamTable | null = null;
  loading = true;
  total: Hours = hoursSummary([], []);
  totalEis = 0;

  constructor(private h: SpecialistAppointmentStudioComponent) {
    this.bar = new PeriodBar(periodOf('month', new Date()), () => this.load());
  }

  init() { return this.load(); }

  async load() {
    this.loading = true;
    const svc = this.h.svc, period = this.bar.period;
    await svc.init();
    const mentors = await svc.mentors();
    const [teams, wins, appts] = await Promise.all([
      Promise.all(mentors.map(m => svc.teamForAtcModels(m.productowner))),
      svc.windows(null, period.from, period.to),
      svc.appointments(null, period.from, period.to),
    ]);
    this.rows = mentors.map((m, i) => {
      const ids = new Set([m.profileId, ...teams[i].memberIds]);
      const mine = appts.filter(r => r.appt.hostIds.some(id => ids.has(id)));
      const onProd = mine.filter(r => r.appt.productId && teams[i].productIds.includes(r.appt.productId));
      return {
        m, team: teams[i],
        participants: new Set(onProd.map(r => r.appt.participantId).filter(Boolean)).size,
        hours: hoursSummary(wins.filter(w => ids.has(w.profileId)), mine.map(r => r.appt)),
      };
    });
    const allIds = new Set(this.rows.flatMap(r => [r.m.profileId, ...r.team.memberIds]));
    this.totalEis = new Set(this.rows.flatMap(r => r.team.memberIds)).size;
    this.total = hoursSummary(wins.filter(w => allIds.has(w.profileId)),
      appts.filter(r => r.appt.hostIds.some(id => allIds.has(id))).map(r => r.appt));
    this.loading = false;
    if (this.open) this.table?.load();
  }

  toggle(r: MentorRow) {
    this.open = this.open === r.m.profileId ? null : r.m.profileId;
    this.table = this.open ? new TeamTable(this.h, r.team.memberIds, () => this.bar.period) : null;
    this.table?.load();
  }
}

/* ======================================================================================
   A&H · Utilisation: per-specialist hours with date, role, product and search filters. Same formulas as
   Home. Product = products.atcmodel; it keeps the EIS on that product's team.
   ====================================================================================== */
export class UtilTab {
  readonly bar: PeriodBar;
  role: '' | 'mentor' | 'cw' = '';
  product = '';
  productTeam: Set<string> | null = null;
  q = '';
  products: string[] = [];
  loading = true;
  productLoading = false;
  private specialists: Specialist[] = [];
  private rows: { s: Specialist; h: Hours }[] = [];

  constructor(private h: SpecialistAppointmentStudioComponent) {
    this.bar = new PeriodBar(periodOf('month', new Date()), () => this.load());
  }

  async init() {
    [this.specialists, this.products] = await Promise.all([this.h.svc.specialists(), this.h.svc.atcModels()]);
    await this.load();
  }

  /* One pass: group the period's windows and appointments by specialist, then summarise each. */
  async load() {
    this.loading = true;
    const p = this.bar.period;
    const [wins, appts] = await Promise.all([this.h.svc.windows(null, p.from, p.to), this.h.svc.appointments(null, p.from, p.to)]);
    const w = new Map<string, AvailWindow[]>(), a = new Map<string, ApptRow[]>();
    wins.forEach(x => w.set(x.profileId, [...(w.get(x.profileId) ?? []), x]));
    appts.forEach(x => x.appt.hostIds.forEach(id => a.set(id, [...(a.get(id) ?? []), x])));
    this.rows = this.specialists.map(s => ({ s, h: hoursSummary(w.get(s.profileId) ?? [], (a.get(s.profileId) ?? []).map(r => r.appt)) }));
    this.loading = false;
  }

  async onProduct() {
    if (!this.product) { this.productTeam = null; return; }
    this.productLoading = true;
    this.productTeam = new Set((await this.h.svc.teamForAtcModels([this.product])).memberIds);
    this.productLoading = false;
  }

  get shown(): { s: Specialist; h: Hours }[] {
    const q = this.q.trim().toLowerCase();
    return this.rows.filter(({ s }) =>
      (!this.role || s.role === this.role) && (!this.productTeam || this.productTeam.has(s.profileId)) && (!q || s.name.toLowerCase().includes(q)));
  }

  /* Sum of the shown rows; utilisation recomputed from the summed hours. */
  get total(): Hours {
    const t = hoursSummary([], []);
    for (const { h } of this.shown) {
      t.availMin += h.availMin; t.bookedMin += h.bookedMin; t.deliveredMin += h.deliveredMin;
      t.cancelledMin += h.cancelledMin; t.completed += h.completed;
    }
    t.unutilisedMin = Math.max(0, t.availMin - t.deliveredMin);
    t.pct = t.availMin ? (t.deliveredMin / t.availMin) * 100 : 0;
    return t;
  }
}

/* ======================================================================================
   A&H · Delivery Type Details: delivery types and their length, view only.
   ====================================================================================== */
interface TypeRow { id: string; name: string; duration: number; group: boolean; maxbooking: number | null; changework: boolean; }

export class SettingsTab {
  rows: TypeRow[] = [];
  q = '';
  loading = true;

  constructor(private h: SpecialistAppointmentStudioComponent) {}

  async init() {
    await this.h.svc.init();
    this.rows = Object.entries(this.h.svc.mapAppointmentData).map(([id, d]: [string, any]) => ({
      id, name: d['appointmenttype'] ?? id, duration: d['duration'] ?? 0, group: !!d['groupappointment'],
      maxbooking: d['maxbooking'] ?? null, changework: !!d['ischangeworkrequired'],
    })).sort((a, b) => a.name.localeCompare(b.name));
    this.loading = false;
  }

  get shown() {
    const q = this.q.trim().toLowerCase();
    return q ? this.rows.filter(r => r.name.toLowerCase().includes(q)) : this.rows;
  }
}

/* ======================================================================================
   A&H · Book Session: Calendar (default) or By participant (the existing book-appointment, narrowed by
   the filter). Calendar: open slots for the picked product's delivery types; a collaborative type only
   shows times when every required role is free (AppointmentBookingService.mergeSlots). Needs a product
   and a delivery type (operator, 2026-10-05).
   ====================================================================================== */
interface BookGroup { typeId: string; slots: { typeId: string; slot: BookSlot }[]; }

export class BookTab {
  readonly filterBar: FilterBar;
  readonly bar: PeriodBar;
  filter: SasFilter = NO_FILTER;
  mode: 'calendar' | 'participant' = 'calendar';
  groupBy: SlotGrouping = 'type';
  loading = false;
  days: { date: Date; groups: BookGroup[] }[] = [];
  /* Per picked type with nothing to book in the period: why, naming the roles it needs (operator, 2026-10-05). */
  gaps: string[] = [];
  private slots: { typeId: string; slot: BookSlot }[] = [];
  private bases = new Map<string, TypeRoles>();
  private bookables = new Map<string, Promise<Bookable[]>>();
  private run = 0;

  constructor(private h: SpecialistAppointmentStudioComponent) {
    this.filterBar = new FilterBar(h.svc, 'all', h.svc.profileId, false, f => { this.filter = f; this.load(); });
    this.bar = new PeriodBar(periodOf('week', new Date()), () => this.load(), true, false);
  }

  get ready() { return !!this.filter.productId && !!this.filter.typeIds?.length; }

  /* Free, future slots of every specialist who holds a required role, merged per type. */
  async load() {
    const run = ++this.run;
    this.slots = []; this.days = []; this.gaps = [];
    if (!this.ready) return;
    this.loading = true;
    try {
      const typeIds = this.filter.typeIds!, now = new Date(), p = this.bar.period;
      const [wins, bases] = await Promise.all([
        this.h.svc.windows(null, p.from, p.to),
        Promise.all(typeIds.map(t => this.baseFor(t))),
      ]);
      if (run !== this.run) return;
      const out: { typeId: string; slot: BookSlot }[] = [];
      const when = p.mode === 'day' ? 'on ' + this.h.datepipe.transform(p.from, 'd MMM') : 'in the week of ' + this.h.datepipe.transform(p.from, 'd MMM');
      typeIds.forEach((t, i) => {
        const base = bases[i];
        const free: EisSlot[] = [];
        for (const role of base.required) for (const w of wins) {
          if (!w.typeIds.includes(t)) continue;
          const path = (base.eis[role] ?? []).find(x => x.split('/').pop() === w.profileId);
          if (!path) continue;
          for (const s of w.slots) {
            if (s.typeId === t && !s.booked && s.available && s.start > now && s.index != null) {
              free.push({ slotstart: s.start, slotend: s.end, docid: w.id, index: s.index, eisprofile: path, appointmentrole: role });
            }
          }
        }
        const merged = this.h.booking.mergeSlots(free, base.required, id => this.h.svc.name(id));
        merged.forEach(slot => out.push({ typeId: t, slot }));
        if (!merged.length) {
          this.gaps.push(slotGapMessage(this.h.typeLabel(t), base.required, base.eis, new Set(free.map(f => f.appointmentrole)),
            role => this.h.svc.mapRoles[role.split('/').pop()!] ?? 'another', when));
        }
      });
      this.slots = out;
      this.build();
    } catch (e) {
      if (run !== this.run) return;
      console.error('Specialist appointment studio: open slots failed', e);
      this.h.snack.open('Could not load open slots. Try again.', 'OK', { duration: 5000 });
    }
    if (run === this.run) this.loading = false;
  }

  private baseFor(typeId: string): Promise<TypeRoles> {
    const hit = this.bases.get(typeId);
    if (hit) return Promise.resolve(hit);
    return this.h.booking.typeRoles(typeId).then(b => { this.bases.set(typeId, b); return b; });
  }

  private build() {
    const p = this.bar.period, n = p.mode === 'day' ? 1 : 7, f = p.from, label = (id: string) => this.h.typeLabel(id);
    this.days = Array.from({ length: n }, (_, i) => new Date(f.getFullYear(), f.getMonth(), f.getDate() + i)).map(date => {
      const mine = this.slots.filter(x => sameDay(x.slot.start, date));
      let groups: BookGroup[];
      if (this.groupBy === 'type') {
        const ids = [...new Set(mine.map(x => x.typeId))].sort((a, b) => label(a).localeCompare(label(b)));
        groups = ids.map(typeId => ({ typeId, slots: mine.filter(x => x.typeId === typeId) }));
      } else {
        const sorted = [...mine].sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime() || label(a.typeId).localeCompare(label(b.typeId)));
        groups = sorted.length ? [{ typeId: '', slots: sorted }] : [];
      }
      return { date, groups };
    });
  }

  setGroup(g: SlotGrouping) { if (g !== this.groupBy) { this.groupBy = g; this.build(); } }
  openDay(d: Date) { this.bar.period = periodOf('day', d); this.load(); }

  pick(typeId: string, slot: BookSlot) {
    const productId = this.filter.productId!, key = productId + '|' + typeId;
    if (!this.bookables.has(key)) this.bookables.set(key, this.h.booking.bookableParticipants(productId, typeId));
    this.h.openBookSlot({ typeId, productId, slot, base: this.bases.get(typeId)!, bookables: this.bookables.get(key)! }).then(changed => {
      if (!changed) return;
      this.bookables.delete(key);    // the booked participant's activity is now ongoing
      this.load();
    });
  }
}

/* ======================================================================================
   Dialogs (rendered by <ng-template>s: #addTpl, #windowTpl, #bookSlotTpl)
   ====================================================================================== */

/* Add availability. Auto = give a range and computeSlot cuts the start times. Static = the specialist's own
   slots: per slot a delivery type and a start time, ending after that type's duration; several per day.
   Each static slot is its own availability doc with only its type and a window exactly one duration long,
   so the unchanged computeSlot cuts exactly that one slot. Same doc shape as add-appointment-availability. */
export interface AddAvailabilityData { profileId: string | null; specialists: Specialist[]; date?: Date; }
interface StaticRow { typePath: string | null; start: string; }

export class AddDialog {
  readonly DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  ref: MatDialogRef<unknown, boolean> | null = null;
  picker: PersonPicker | null = null;
  profileId: string | null;
  mode: 'auto' | 'static' | null = 'auto';     // Auto configuration is selected by default
  types: TypeOption[] = [];
  picked = new Set<string>();
  existing: Interval[] = [];
  blocked: string | null = null;     // name of an unmarked appointment that blocks adding
  loadingTypes = false;
  monthAnchor: Date;
  from: Date | null = null;
  to: Date | null = null;
  picking = false;
  startTime = '09:00';
  endTime = '12:00';
  error = '';
  saving = false;
  today = new Date(new Date().setHours(0, 0, 0, 0));
  private dayRows = new Map<string, StaticRow[]>();

  constructor(private h: SpecialistAppointmentStudioComponent, public data: AddAvailabilityData) {
    this.profileId = data.profileId;
    const d0 = data.date && data.date >= this.today ? data.date : this.today;
    this.monthAnchor = new Date(d0.getFullYear(), d0.getMonth(), 1);
    if (data.date && data.date >= this.today) { this.from = new Date(d0); this.to = new Date(d0); }
    if (data.specialists.length && !data.profileId) {
      this.picker = new PersonPicker(data.specialists.map(s => ({ id: s.profileId, name: s.name, sub: roleLabel(s) })), null,
        v => { this.profileId = v || null; this.loadProfile(); }, 'Choose a specialist', 'Specialist');
    }
  }

  async loadProfile() {
    this.types = []; this.picked.clear(); this.blocked = null; this.error = '';
    if (!this.profileId) return;
    this.loadingTypes = true;
    const id = this.profileId;
    try {
      const [blocked, types, existing] = await Promise.all([
        this.h.svc.unmarkedLastAppointment(id), this.h.svc.typesFor(id), this.h.svc.futureIntervals(id),
      ]);
      if (id !== this.profileId) return;       // the specialist changed while loading
      this.blocked = blocked; this.types = types; this.existing = existing;
    } catch (e: any) {
      this.error = 'Could not load this specialist\'s delivery types. ' + (e?.message ?? '');
    }
    this.loadingTypes = false;
  }

  /* Auto: Select all delivery types at once (operator, 2026-10-05). */
  get allPicked() { return this.types.length > 0 && this.types.every(t => this.picked.has(t.path)); }
  toggleAllTypes() { this.picked = this.allPicked ? new Set() : new Set(this.types.map(t => t.path)); }
  toggleType(t: TypeOption) { this.picked.has(t.path) ? this.picked.delete(t.path) : this.picked.add(t.path); }
  pickedTypes(): TypeOption[] { return this.types.filter(t => this.picked.has(t.path)); }

  /* ---------- single-month range calendar: first click = start, second click = end ---------- */
  monthCells(): (Date | null)[] {
    const first = this.monthAnchor, lead = (first.getDay() + 6) % 7;
    const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))];
  }
  shiftMonth(dir: number) { this.monthAnchor = new Date(this.monthAnchor.getFullYear(), this.monthAnchor.getMonth() + dir, 1); }
  canGoBack() { return this.monthAnchor > new Date(this.today.getFullYear(), this.today.getMonth(), 1); }
  pickDay(d: Date) {
    if (!this.picking || !this.from || d < this.from) { this.from = d; this.to = d; this.picking = true; }
    else { this.to = d; this.picking = false; }
  }
  inRange(d: Date) { return !!this.from && !!this.to && d >= this.from && d <= this.to; }
  isEdge(d: Date) { return (!!this.from && sameDay(d, this.from)) || (!!this.to && sameDay(d, this.to)); }
  isToday(d: Date) { return sameDay(d, this.today); }
  dates(): Date[] { return this.from && this.to ? daysBetween(this.from, this.to) : []; }

  private at(d: Date, hhmm: string): Date {
    const [hh, mm] = hhmm.split(':').map(Number);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
  }
  private mins(hhmm: string) { const [hh, mm] = hhmm.split(':').map(Number); return hh * 60 + mm; }
  windowMin(): number { return !this.startTime || !this.endTime ? 0 : this.mins(this.endTime) - this.mins(this.startTime); }

  /* ---------- Static: per picked date, rows of one delivery type + a start time ---------- */
  dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  /* The rows for a date; a date seen for the first time starts with one empty slot. */
  rowsFor(d: Date): StaticRow[] {
    const k = this.dayKey(d);
    if (!this.dayRows.has(k)) this.dayRows.set(k, [{ typePath: null, start: '' }]);
    return this.dayRows.get(k)!;
  }
  typeOf(r: StaticRow) { return this.types.find(t => t.path === r.typePath) ?? null; }
  rowEndMin(r: StaticRow): number | null { const t = this.typeOf(r); return t && r.start ? this.mins(r.start) + t.duration : null; }
  rowEnd(r: StaticRow): string {
    const e = this.rowEndMin(r);
    if (e == null) return '—';
    return new Date(2000, 0, 1, Math.floor(e / 60), e % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  /* A new slot starts empty: the specialist picks the type and start time, the end follows. */
  addRow(d: Date) { this.dayRows.set(this.dayKey(d), [...this.rowsFor(d), { typePath: null, start: '' }]); }
  removeRow(d: Date, i: number) { this.dayRows.set(this.dayKey(d), this.rowsFor(d).filter((_, k) => k !== i)); }
  /* Copy the first day's slots onto every other picked date. */
  copyToAll() {
    const [first, ...rest] = this.dates();
    if (!first) return;
    const src = this.rowsFor(first);
    rest.forEach(d => this.dayRows.set(this.dayKey(d), src.map(r => ({ ...r }))));
  }
  slotCount() { return this.dates().reduce((a, d) => a + this.rowsFor(d).length, 0); }
  private dayLabel(d: Date) { return d.toDateString().slice(0, 10); }

  /* The start times computeSlot will cut for one day (same every day of the range). */
  preview(): { t: TypeOption; starts: Date[]; fits: boolean }[] {
    const base = this.from ?? this.today, s = this.at(base, this.startTime), e = this.at(base, this.endTime);
    const byId = previewSlots(s, e, this.pickedTypes().map(t => ({ id: t.path, duration: t.duration })));
    return this.pickedTypes().map(t => ({ t, starts: (byId[t.path] ?? []).map(x => x.start), fits: (byId[t.path] ?? []).length > 0 }));
  }

  /* Every [start,end) the save would write. */
  intervals(): { d: Date; s: Date; e: Date; typePath: string; n: number }[] {
    const out: { d: Date; s: Date; e: Date; typePath: string; n: number }[] = [];
    for (const d of this.dates()) {
      if (this.mode === 'auto') {
        if (this.pickedTypes().length) out.push({ d, s: this.at(d, this.startTime), e: this.at(d, this.endTime), typePath: '', n: 0 });
      } else {
        this.rowsFor(d).forEach((r, i) => {
          const t = this.typeOf(r);
          if (t && r.start) { const s = this.at(d, r.start); out.push({ d, s, e: new Date(s.getTime() + t.duration * 60000), typePath: t.path, n: i + 1 }); }
        });
      }
    }
    return out;
  }

  private validate(): string {
    if (!this.profileId) return 'Choose the specialist.';
    if (this.blocked) return `The last appointment '${this.blocked}' Status is not updated by the specialist. Please update to proceed.`;
    if (!this.mode) return 'Choose Auto configuration or Static.';
    if (this.mode === 'auto' && !this.picked.size) return 'Choose at least one delivery type.';
    if (!this.from || !this.to || this.picking) return 'Choose the dates: the first day, then the last day.';
    if (this.mode === 'static') {
      if (!this.slotCount()) return 'Add at least one slot.';
      for (const d of this.dates()) {
        const rows = this.rowsFor(d), day = this.dayLabel(d);
        const bad = rows.findIndex(r => !r.typePath || !r.start);
        if (bad >= 0) return `${day}, slot ${bad + 1}: choose the delivery type and the start time.`;
        const late = rows.findIndex(r => (this.rowEndMin(r) ?? 0) > 24 * 60);
        if (late >= 0) return `${day}, slot ${late + 1} runs past midnight. Choose an earlier start time.`;
        for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
          const a = rows[i], b = rows[j];
          if (this.mins(a.start) < this.rowEndMin(b)! && this.mins(b.start) < this.rowEndMin(a)!) return `${day}: slots ${i + 1} and ${j + 1} overlap. Change a start time.`;
        }
      }
    }
    if (this.mode === 'auto') {
      if (this.windowMin() <= 0) return 'The end time must be after the start time.';
      const longest = Math.max(...this.pickedTypes().map(t => t.duration));
      if (this.windowMin() < longest) return `${longest} Minutes difference required for the selected delivery types.`;
    }
    const all = this.intervals();
    const past = all.find(x => x.s <= new Date());
    if (past) return past.n ? `Slot ${past.n} on ${past.d.toDateString().slice(4, 10)} has already started. Choose a later time or date.`
                             : 'That time has already passed. Choose a later date or time.';
    const clash = all.filter(x => overlapsAny(x.s, x.e, this.existing));
    if (clash.length) {
      const days = [...new Set(clash.map(x => x.d.toDateString().slice(4, 10)))].join(', ');
      return `This overlaps availability already given on ${days}. Change the time or the dates.`;
    }
    return '';
  }

  async save() {
    this.error = this.validate();
    if (this.error) return;
    this.saving = true;
    try {
      const fs = this.h.firestore, batch = writeBatch(fs), profileref = this.h.svc.profileRef(this.profileId!);
      const put = (data: Record<string, any>) => {
        const id = doc(collection(fs, 'availability')).id;
        batch.set(doc(fs, 'availability/' + id), { id, profileref, ...data });
      };
      if (this.mode === 'auto') {
        const appointments = this.pickedTypes().map(t => doc(fs, t.path));
        for (const d of this.dates()) put({ starttime: this.at(d, this.startTime), endtime: this.at(d, this.endTime), appointments });
      } else {
        // One doc per slot, holding only its own type, window = one duration: computeSlot writes exactly that slot.
        for (const x of this.intervals()) put({ starttime: x.s, endtime: x.e, appointments: [doc(fs, x.typePath)] });
      }
      await batch.commit();
      this.ref?.close(true);
    } catch (e: any) {
      this.error = String(e?.message ?? e);
      this.saving = false;
    }
  }

  close() { this.ref?.close(false); }
}

/* Availability details: what a window offers (delivery types with length, slots given / booked / still open)
   and the sessions booked in it. Delete only while nothing is booked and it has not started.
   Closes with 'delete' or the session to open. */
export class WindowDialog {
  ref: MatDialogRef<unknown, 'delete' | ApptRow | undefined> | null = null;
  readonly now = new Date();
  readonly types: { id: string; name: string; duration: number; given: number; booked: number; open: number }[];
  readonly status: string;
  readonly canDelete: boolean;

  constructor(h: SpecialistAppointmentStudioComponent, public w: AvailWindow, public sessions: ApptRow[]) {
    this.types = w.typeIds.map(id => {
      const slots = w.slots.filter(s => s.typeId === id), meta = h.svc.mapAppointmentData[id] ?? {};
      return {
        id, name: meta['appointmenttype'] ?? id, duration: meta['duration'] ?? 0, given: slots.length,
        booked: slots.filter(s => s.booked).length,
        open: slots.filter(s => s.available && !s.booked && s.start > this.now).length,
      };
    });
    this.status = windowStatus(w, sessions.map(r => r.appt), this.now);
    this.canDelete = w.start > this.now && !w.slots.some(s => s.booked);
  }

  statusOf(r: ApptRow) { const s = apptStatus(r.appt, this.now); return s === 'Pending' ? 'Completion pending' : s; }
}

/* Book a participant into a calendar slot. Only participants with the product active and this delivery
   type ready, and whose assigned specialists (customer_eismapping) fit the slot's specialists. Writes through
   AppointmentBookingService.book, the same write as Book Appointment. Closes with true once booked. */
export interface BookSlotData { typeId: string; productId: string; slot: BookSlot; base: TypeRoles; bookables: Promise<Bookable[]>; }

export class BookSlotDialog {
  ref: MatDialogRef<unknown, boolean> | null = null;
  loading = true;
  saving = false;
  picker: PersonPicker | null = null;
  excluded = 0;
  participantId: string | null = null;
  readonly ready: Promise<void>;
  private eligible = new Map<string, { b: Bookable; plan: RolePlan }>();

  constructor(private h: SpecialistAppointmentStudioComponent, public data: BookSlotData) {
    this.ready = this.init();
  }

  private async init() {
    try {
      const all = await this.data.bookables;
      for (const b of all) {
        const plan = this.h.booking.planForSlot(this.data.base, b, this.data.slot);
        if (plan) this.eligible.set(b.participantId, { b, plan });
      }
      this.excluded = all.length - this.eligible.size;
      const people = [...this.eligible.keys()].map(id => ({ id, name: this.h.svc.name(id) })).sort((a, b) => a.name.localeCompare(b.name));
      this.picker = new PersonPicker(people, null, v => this.participantId = v || null, 'Choose a participant', 'Participant');
    } catch (e) {
      console.error('Specialist appointment studio: participants failed', e);
      this.h.snack.open('Could not load participants. Try again.', 'OK', { duration: 5000 });
    }
    this.loading = false;
  }

  get typeName() { return this.h.svc.mapAppointment[this.data.typeId] ?? 'session'; }

  async book() {
    const hit = this.participantId ? this.eligible.get(this.participantId) : null;
    if (!hit) return;
    this.saving = true;
    if (this.picker) this.picker.disabled = true;
    try {
      const result = await this.h.booking.book({
        slot: this.data.slot, typeId: this.data.typeId, plan: hit.plan, participantId: hit.b.participantId,
        target: hit.b.target, loggedinPID: this.h.svc.profileId,
      });
      this.h.snack.open(result === 'unavailable' ? 'This slot was just taken. Pick another one.' : `Booked ${this.h.svc.name(hit.b.participantId)}.`,
        result === 'unavailable' ? 'OK' : undefined, { duration: result === 'unavailable' ? 5000 : 3000 });
      this.ref?.close(true);
    } catch (e) {
      console.error('Specialist appointment studio: booking failed', e);
      this.h.snack.open('Could not book. Try again.', 'OK', { duration: 5000 });
      this.saving = false;
      if (this.picker) this.picker.disabled = false;
    }
  }
}

/* ======================================================================================
   The component
   ====================================================================================== */
@Component({
  selector: 'app-specialist-appointment-studio',
  imports: [
    DatePipe, DecimalPipe, NgTemplateOutlet, FormsModule, MatIconModule, MatMenuModule, MatProgressSpinnerModule,
    MatSelectModule, MatSnackBarModule, MatTooltipModule, NgxMatSelectSearchModule, BookAppointmentComponent,
  ],
  templateUrl: './specialist-appointment-studio.component.html',
  styleUrl: './specialist-appointment-studio.component.css',
  encapsulation: ViewEncapsulation.None,
  providers: [SpecialistAppointmentService, DatePipe],
})
export class SpecialistAppointmentStudioComponent implements OnInit, OnDestroy {
  readonly VIEW_LABEL = VIEW_LABEL;
  readonly DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly WINDOW_STATUSES = WINDOW_STATUSES;
  readonly WINDOW_PILL = WINDOW_PILL;
  readonly fmtHours = fmtHours;

  loading = true;
  viewRole: ViewRole = null;
  views: Exclude<ViewRole, null>[] = [];
  noProduct = false;          // Mentor view, but no product owner assigned
  nav: NavItem[] = [];
  tab: SasTab = 'home';

  /* The open tab's state; a new one each time a tab opens, so every tab loads fresh. */
  home: HomeTab | null = null;
  team: TeamTab | null = null;
  mentors: MentorsTab | null = null;
  util: UtilTab | null = null;
  settings: SettingsTab | null = null;
  book: BookTab | null = null;
  /* The open dialogs' state. */
  add: AddDialog | null = null;
  win: WindowDialog | null = null;
  bookSlot: BookSlotDialog | null = null;

  /* Join opens 5 min before start; this clock re-checks every 30 s without a reload. */
  clock = new Date();
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  @ViewChild('addTpl', { static: true }) addTpl!: TemplateRef<unknown>;
  @ViewChild('windowTpl', { static: true }) windowTpl!: TemplateRef<unknown>;
  @ViewChild('bookSlotTpl', { static: true }) bookSlotTpl!: TemplateRef<unknown>;

  constructor(
    public svc: SpecialistAppointmentService, public booking: AppointmentBookingService, public firestore: Firestore,
    public snack: MatSnackBar, private dialog: MatDialog, public datepipe: DatePipe, private guard: AuthguardService,
    private router: Router, private zone: NgZone,
  ) {}

  async ngOnInit() {
    // Outside the zone so the app (and tests) still settle; back inside only to tick the clock.
    this.zone.runOutsideAngular(() => this.clockTimer = setInterval(() => this.zone.run(() => this.clock = new Date()), 30000));
    try {
      await this.svc.init();
      this.views = this.svc.views;
      this.setView(this.svc.viewRole);
    } catch (e) {
      console.error('Specialist appointment studio: init failed', e);
    }
    this.loading = false;
  }

  ngOnDestroy() { if (this.clockTimer) clearInterval(this.clockTimer); }

  /* View as: switch to another view the user holds a role for. The tab opens fresh with the new view. */
  setView(v: ViewRole) {
    this.viewRole = v;
    this.svc.viewRole = v;
    this.noProduct = v === 'mentor' && !ownsProduct(this.svc.roles);
    this.nav = v && !this.noProduct ? NAV[v] : [];
    this.go(this.nav[0]?.tab ?? 'home', !this.nav.length);
  }

  get showSide() { return this.nav.length > 1 || this.views.length > 1; }

  go(tab: SasTab, skipLoad = false) {
    this.tab = tab;
    this.home = this.team = this.mentors = this.util = this.settings = this.book = null;
    if (!skipLoad) {
      const start = (x: { init?: () => Promise<unknown> } | null) => x?.init?.().catch(e => console.error('Specialist appointment studio: tab failed', e));
      if (tab === 'home' || tab === 'overview') start(this.home = new HomeTab(this, tab === 'home' ? 'self' : 'all'));
      else if (tab === 'team') start(this.team = new TeamTab(this));
      else if (tab === 'mentors') start(this.mentors = new MentorsTab(this));
      else if (tab === 'util') start(this.util = new UtilTab(this));
      else if (tab === 'settings') start(this.settings = new SettingsTab(this));
      else if (tab === 'book') this.book = new BookTab(this);
    }
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  /* ---------- dialogs ---------- */
  private readonly dialogBox = { panelClass: 'sas-dialog-panel', autoFocus: false, maxWidth: '96vw' } as const;

  openAdd(data: AddAvailabilityData): Promise<boolean> {
    this.add = new AddDialog(this, data);
    if (this.add.profileId) this.add.loadProfile();
    const ref = this.dialog.open<unknown, unknown, boolean>(this.addTpl, { ...this.dialogBox, disableClose: true });
    this.add.ref = ref;
    return firstValueFrom(ref.afterClosed()).then(v => { this.add = null; return !!v; });
  }

  openWindow(w: AvailWindow, sessions: ApptRow[]): Promise<'delete' | ApptRow | undefined> {
    this.win = new WindowDialog(this, w, sessions);
    const ref = this.dialog.open<unknown, unknown, 'delete' | ApptRow>(this.windowTpl, this.dialogBox);
    this.win.ref = ref;
    return firstValueFrom(ref.afterClosed()).then(v => { this.win = null; return v; });
  }

  openBookSlot(data: BookSlotData): Promise<boolean> {
    this.bookSlot = new BookSlotDialog(this, data);
    const ref = this.dialog.open<unknown, unknown, boolean>(this.bookSlotTpl, { ...this.dialogBox, disableClose: true });
    this.bookSlot.ref = ref;
    return firstValueFrom(ref.afterClosed()).then(v => { this.bookSlot = null; return !!v; });
  }

  /* The appointment calendar's dialog: details, Update Status (when pending) and, for A&H, Cancel. */
  openAppointment(r: ApptRow, reload: () => void) {
    const isAh = this.svc.viewRole === 'ah';
    const ref = this.dialog.open(AppointmentDetailComponent, {
      data: this.svc.buildMeta(r, { disableCancel: !isAh }), disableClose: true, autoFocus: false,
    });
    ref.afterClosed().subscribe(data => {
      if (data != null && isAh) this.guard.cancelAppointment(data);
      // Update Status opens MarkAppointmentStatusComponent; reload once that has closed too.
      const again = () => setTimeout(reload, 800);
      if (this.dialog.openDialogs.length) this.dialog.afterAllClosed.pipe(take(1)).subscribe(again);
      else again();
    });
  }

  /* ---------- Join: 5 minutes before the start until the end ---------- */
  canJoin(r: ApptRow) { return joinOpen(r.appt, this.clock); }
  joinTip(r: ApptRow): string {
    if (this.canJoin(r)) return '';
    if (r.appt.end <= this.clock) return 'This session has ended';
    const opens = new Date(r.appt.start.getTime() - JOIN_LEAD_MIN * 60000);
    return `Opens at ${this.t(opens)}${sameDay(opens, this.clock) ? '' : ' on ' + this.datepipe.transform(opens, 'd MMM')}`;
  }

  /* Join opens the appointment's Zoom meeting inside the app (AppointmentZoomViewComponent,
     /openappointmentzoom/:id) in a new tab. That viewer reads appointments/{id}.zoomdata and only
     starts when it is there, so say so here instead of opening an empty tab. */
  join(r: ApptRow) {
    if (!this.canJoin(r)) return;
    if (!r.raw?.['zoomdata']) {
      this.snack.open('This session has no Zoom meeting yet.', 'OK', { duration: 4000 });
      return;
    }
    const url = this.router.serializeUrl(this.router.createUrlTree(['/openappointmentzoom', r.appt.id]));
    window.open(url, '_blank');
  }

  async copyZoom(r: ApptRow) {
    if (!r.appt.zoomUrl) { this.snack.open('No Zoom link on this session yet.', 'OK', { duration: 3000 }); return; }
    try { await navigator.clipboard.writeText(r.appt.zoomUrl); this.snack.open('Zoom link copied.', undefined, { duration: 2500 }); }
    catch { this.snack.open(r.appt.zoomUrl, 'OK', { duration: 8000 }); }
  }

  /* ---------- template helpers ---------- */
  t(d: Date) { return this.datepipe.transform(d, 'H:mm') ?? ''; }
  periodLabel(p: Period): string {
    if (p.mode === 'day') return this.datepipe.transform(p.from, 'EEE, d MMM y') ?? '';
    const last = new Date(p.to.getTime() - 86400000);
    return p.mode === 'week'
      ? `${this.datepipe.transform(p.from, 'd MMM')} – ${this.datepipe.transform(last, 'd MMM y')}`
      : this.datepipe.transform(p.from, 'MMMM y') ?? '';
  }
  typeLabel(id: string) { return this.svc.mapAppointment[id] ?? id; }
  typeDuration(id: string) { return fmtHours(this.svc.mapAppointmentData[id]?.['duration'] ?? 0); }
  typeName(r: ApptRow) { return (r.appt.typeId && this.svc.mapAppointment[r.appt.typeId]) || 'Appointment'; }
  /* Hover text on a calendar window, and the delivery-type column: its delivery types. */
  typeNames(w: AvailWindow) { return w.typeIds.map(id => this.typeLabel(id)).join(', '); }
  isToday(d: Date) { return sameDay(d, new Date()); }
  pct(n: number) { return n > 100 ? 100 : n; }
}
