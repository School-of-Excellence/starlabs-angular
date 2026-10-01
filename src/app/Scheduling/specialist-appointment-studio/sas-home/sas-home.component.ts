import { Component, Input, NgZone, OnDestroy, OnInit, ViewContainerRef } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Firestore, doc, deleteDoc, writeBatch, QueryDocumentSnapshot } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { AuthguardService } from '../../../authguard.service';
import { AppointmentDetailComponent } from '../../appointment-detail/appointment-detail.component';
import { SpecialistAppointmentService, ApptRow, Specialist } from '../specialist-appointment.service';
import { SasPeriodBarComponent } from '../sas-period-bar/sas-period-bar.component';
import { SasLoaderComponent } from '../sas-loader/sas-loader.component';
import { SasAddAvailabilityComponent } from '../sas-add-availability/sas-add-availability.component';
import { SasFilterBarComponent } from '../sas-filter-bar/sas-filter-bar.component';
import { SasWindowDetailComponent, WindowDetailResult } from '../sas-window-detail/sas-window-detail.component';
import {
  AvailWindow, Hours, Period, apptStatus, ApptStatus, hoursSummary, fmtHours, periodOf, sameDay,
  windowState, WindowState, mondayOf, openMinutes, windowStatus, NO_SHOW_REASON,
  SasFilter, NO_FILTER, scopeWindow, apptMatches, windowMatchesBooked, dayColumns, DayColumn, DayEntry,
  joinOpen, JOIN_LEAD_MIN,
} from '../sas-logic';

type PastFilter = 'pending' | 'completed' | 'cancelled';
const PAST_PAGE = 10;          // rows added per Load more
const PAST_FETCH = 25;         // appointments read per Firestore page
const PAST_MAX_FETCHES = 8;    // per click, so a rare status can't read the whole history in one go
interface Day { date: Date; windows: { w: AvailWindow; state: WindowState; label: string; sessions: ApptRow[]; open: number }[]; loose: ApptRow[]; }
interface MonthCell { date: Date; out: boolean; lines: { label: string; color: string }[]; more: number; }

const STATUS_PILL: Record<ApptStatus, string> = {
  Completed: 'is-success', Cancelled: 'is-neutral', 'In session': 'is-solid', Pending: 'is-warning', Booked: '',
};
const STATUS_CHIP: Record<ApptStatus, string> = {
  Completed: 'st-done', Cancelled: 'st-off', 'In session': 'st-live', Pending: 'st-warn', Booked: 'st-booked',
};
const STATE_LABEL: Record<WindowState, string> = { open: 'Open for booking', full: 'Fully booked', ended: 'Ended', unused: 'Unused' };
const STATE_DOT: Record<WindowState, string> = { open: 'var(--bt-success)', full: 'var(--bt-primary)', ended: 'var(--bt-ink-25)', unused: 'var(--bt-ink-25)' };

/* Home for CW and Mentor (mode 'self' = the logged-in profile only) and the A&H Overview
   (mode 'all' = every specialist, with a specialist filter). Hook prefix: sah */
@Component({
  selector: 'app-sas-home',
  imports: [
    DatePipe, DecimalPipe, FormsModule, MatIconModule, MatMenuModule, MatSnackBarModule, MatTooltipModule,
    SasLoaderComponent, SasPeriodBarComponent, SasFilterBarComponent,
  ],
  templateUrl: './sas-home.component.html',
})
export class SasHomeComponent implements OnInit, OnDestroy {
  @Input() mode: 'self' | 'all' = 'self';

  readonly DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly STATE_LABEL = STATE_LABEL;
  readonly fmtHours = fmtHours;

  period: Period = periodOf('week', new Date());
  specialists: Specialist[] = [];
  specialistId = '';          // mode 'all': '' = everyone

  loading = true;
  greeting = '';
  subtitle = '';
  hours: Hours | null = null;
  openMin = 0;
  days: Day[] = [];
  month: MonthCell[] = [];
  /* Day view: one column per delivery type (operator, 2026-10-01). */
  dayCols: DayColumn[] = [];
  /* Product · types · booked filter. Product and types apply everywhere; booked only to the calendar. */
  filter: SasFilter = NO_FILTER;
  /* Bulk delete: the period's windows (filtered by product and types), future + unbooked selectable. */
  availList: AvailWindow[] = [];
  selected = new Set<string>();
  deleting = false;
  /* Join opens 5 min before start; this clock re-checks every 30 s without a reload. */
  clock = new Date();
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private raw: { wins: AvailWindow[]; appts: ApptRow[]; up: ApptRow[] } = { wins: [], appts: [], up: [] };
  upcoming: ApptRow[] = [];
  /* Past sessions load lazily: PAST_PAGE matching rows at a time, newest first, via Load more. */
  past: ApptRow[] = [];
  pastFilter: PastFilter = 'pending';
  pastLoading = false;
  pastDone = false;
  private pastCursor: QueryDocumentSnapshot | null = null;
  private pastRun = 0;
  now = new Date();

  constructor(
    public svc: SpecialistAppointmentService, private guard: AuthguardService, private firestore: Firestore,
    private dialog: MatDialog, private snack: MatSnackBar, private datepipe: DatePipe, private vcr: ViewContainerRef,
    private router: Router, private zone: NgZone,
  ) {}

  async ngOnInit() {
    // Outside the zone so the app (and tests) still settle; back inside only to tick the clock.
    this.zone.runOutsideAngular(() => this.clockTimer = setInterval(() => this.zone.run(() => this.clock = new Date()), 30000));
    await this.svc.init();
    const h = new Date().getHours();
    const first = (this.svc.name(this.svc.profileId) || '').split(' ')[0];
    this.greeting = `Good ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}${first && first !== '—' ? ', ' + first : ''}`;
    if (this.mode === 'all') {
      this.subtitle = 'Every specialist\'s availability, sessions and utilisation.';
      this.specialists = await this.svc.specialists();
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
  get showCalendar() { return true; }                 // A&H 'All specialists' shows everyone's calendar
  get allMode() { return this.hostIds === null; }
  get showSpecialistCol() { return this.hostIds === null; }

  private loadRun = 0;
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
      this.snack.open('Could not load appointments. Try again.', 'OK', { duration: 5000 });
    }
    this.loading = false;
  }

  ngOnDestroy() { if (this.clockTimer) clearInterval(this.clockTimer); }

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
    this.dayCols = p.mode === 'day'
      ? dayColumns(pWins, pAppts, this.now, f.booked).sort((a, b) => this.typeLabel(a.typeId).localeCompare(this.typeLabel(b.typeId)))
      : [];
    const ids = new Set(pWins.map(w => w.id));
    this.availList = this.raw.wins.filter(w => ids.has(w.id))
      .sort((a, b) => a.start.getTime() - b.start.getTime() || this.svc.name(a.profileId).localeCompare(this.svc.name(b.profileId)));
    this.selected = new Set([...this.selected].filter(id => this.availList.some(w => w.id === id && this.canDelete(w))));
  }

  onFilter(f: SasFilter) {
    const scopeChanged = f.productId !== this.filter.productId || String(f.typeIds) !== String(this.filter.typeIds);
    this.filter = f;
    this.apply();
    if (scopeChanged) this.loadPast(true);
  }

  get filterScope(): 'all' | 'mentor' | 'cw' { return this.mode === 'all' ? 'all' : this.svc.viewRole === 'mentor' ? 'mentor' : 'cw'; }

  private buildCalendar(wins: AvailWindow[], live: ApptRow[], period: Period) {
    const dayOf = (d: Date) => {
      const ws = wins.filter(w => sameDay(w.start, d))
        .sort((a, b) => a.start.getTime() - b.start.getTime() || this.svc.name(a.profileId).localeCompare(this.svc.name(b.profileId)));
      const used = new Set<string>();
      const windows = ws.map(w => {
        // A session belongs to a window of the same specialist that it starts inside.
        const sessions = live.filter(r => sameDay(r.appt.start, d) && r.appt.hostIds.includes(w.profileId)
            && r.appt.start >= w.start && r.appt.start < w.end && !used.has(r.appt.id))
          .sort((a, b) => a.appt.start.getTime() - b.appt.start.getTime());
        sessions.forEach(r => used.add(r.appt.id));
        return { w, state: windowState(w, this.now), label: windowStatus(w, sessions.map(r => r.appt), this.now) as string, sessions, open: openMinutes(w, this.now) };
      });
      const loose = live.filter(r => sameDay(r.appt.start, d) && !used.has(r.appt.id));
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
            label: `${this.t(x.w.start)}–${this.t(x.w.end)}${x.sessions.length ? ' · ' + x.sessions.length + ' booked' : ''}`,
            color: STATE_DOT[x.state],
          }));
        }
        this.month.push({ date: d, out: d.getMonth() !== mo, lines: lines.slice(0, 3), more: Math.max(0, lines.length - 3) });
      }
      this.days = [];
    }
  }

  t(d: Date) { return this.datepipe.transform(d, 'H:mm') ?? ''; }
  isToday(d: Date) { return sameDay(d, this.now); }
  isFutureDay(d: Date) { const x = new Date(this.now); x.setHours(0, 0, 0, 0); return d >= x; }

  status(r: ApptRow): ApptStatus { return apptStatus(r.appt, this.now); }
  pillClass(r: ApptRow) { return STATUS_PILL[this.status(r)]; }
  chipClass(r: ApptRow) { return STATUS_CHIP[this.status(r)]; }
  typeName(r: ApptRow) { return (r.appt.typeId && this.svc.mapAppointment[r.appt.typeId]) || 'Appointment'; }
  hostNames(r: ApptRow) { return r.appt.hostIds.map(h => this.svc.name(h)).join(', '); }

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
      this.snack.open('Could not load past sessions. Try again.', 'OK', { duration: 5000 });
    }
    if (run === this.pastRun) this.pastLoading = false;
  }

  onPastFilter() { this.loadPast(true); }
  reasonShown(r: ApptRow) { return r.appt.cancelled && r.appt.cancelledReason && r.appt.cancelledReason !== NO_SHOW_REASON; }

  onPeriod(p: Period) { this.period = p; this.load(); }
  onSpecialist() { this.load(); }
  /* A date picked in Month view or a day header in Week view opens that day (operator, 2026-10-01). */
  gotoDay(d: Date) { this.period = periodOf('day', d); this.load(); }

  typeLabel(id: string) { return this.svc.mapAppointment[id] ?? id; }
  typeDuration(id: string) { return fmtHours(this.svc.mapAppointmentData[id]?.['duration'] ?? 0); }
  /* Hover text on a calendar window: its delivery types. */
  typeNames(w: AvailWindow) { return w.typeIds.map(t => this.typeLabel(t)).join(', '); }

  /* ---------- Day view ---------- */
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
    this.dialog.open(SasAddAvailabilityComponent, {
      data: { profileId, specialists: this.mode === 'all' ? this.specialists : [], date },
      panelClass: 'sas-dialog-panel', autoFocus: false, disableClose: true, maxWidth: '96vw',
      viewContainerRef: this.vcr, // so the dialog gets this screen's SpecialistAppointmentService
    }).afterClosed().subscribe(saved => { if (saved) this.load(); });
  }

  /* Availability details for a calendar window. The dialog gets the unfiltered window, so it lists
     every type the window offers, and every session booked in it. */
  openWindow(w: AvailWindow) {
    const full = this.raw.wins.find(x => x.id === w.id) ?? w;
    const sessions = this.raw.appts.filter(r => r.appt.hostIds.includes(full.profileId)
      && r.appt.start >= full.start && r.appt.start < full.end).sort((a, b) => a.appt.start.getTime() - b.appt.start.getTime());
    this.dialog.open(SasWindowDetailComponent, {
      data: { w: full, sessions }, panelClass: 'sas-dialog-panel', autoFocus: false, maxWidth: '96vw', viewContainerRef: this.vcr,
    }).afterClosed().subscribe((res: WindowDetailResult) => {
      if (res && 'delete' in res) this.deleteWindow(full);
      else if (res && 'open' in res) this.openDetail(res.open);
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
        const batch = writeBatch(this.firestore);
        ids.slice(i, i + 400).forEach(id => batch.delete(doc(this.firestore, 'availability/' + id)));
        await batch.commit();
      }
      this.selected = new Set();
      this.snack.open(`${ids.length} availability window${ids.length === 1 ? '' : 's'} deleted.`, undefined, { duration: 3000 });
      await this.load();
    } catch (e) {
      console.error('Specialist appointment studio: bulk delete failed', e);
      this.snack.open('Could not delete. Try again.', 'OK', { duration: 5000 });
    }
    this.deleting = false;
  }

  /* ---------- Join: 5 minutes before the start until the end ---------- */
  canJoin(r: ApptRow) { return joinOpen(r.appt, this.clock); }
  joinTip(r: ApptRow): string {
    if (this.canJoin(r)) return '';
    if (r.appt.end <= this.clock) return 'This session has ended';
    const opens = new Date(r.appt.start.getTime() - JOIN_LEAD_MIN * 60000);
    return `Opens at ${this.t(opens)}${sameDay(opens, this.clock) ? '' : ' on ' + this.datepipe.transform(opens, 'd MMM')}`;
  }

  /* Same rule as appointment-availability onrowdelete: only while nothing is booked in it. */
  async deleteWindow(w: AvailWindow, ev?: Event) {
    ev?.stopPropagation();
    if (w.slots.some(s => s.booked)) { alert('Booking were already made. Please ask client to cancel it'); return; }
    if (!confirm('Delete this day Slot?')) return;
    try {
      await deleteDoc(doc(this.firestore, 'availability/' + w.id));
      this.snack.open('Availability deleted.', undefined, { duration: 3000 });
      this.load();
    } catch (e) { alert(e); }
  }

  /* The appointment calendar's dialog: details, Update Status (when pending) and, for A&H, Cancel. */
  openDetail(r: ApptRow) {
    const isAh = this.svc.viewRole === 'ah';
    const ref = this.dialog.open(AppointmentDetailComponent, {
      data: this.svc.buildMeta(r, { disableCancel: !isAh }), disableClose: true, autoFocus: false,
    });
    ref.afterClosed().subscribe(data => {
      if (data != null && isAh) this.guard.cancelAppointment(data);
      // Update Status opens MarkAppointmentStatusComponent; reload once that has closed too.
      const reload = () => setTimeout(() => this.load(), 800);
      if (this.dialog.openDialogs.length) this.dialog.afterAllClosed.pipe(take(1)).subscribe(reload);
      else reload();
    });
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
}
