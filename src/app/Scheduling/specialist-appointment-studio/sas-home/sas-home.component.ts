import { Component, Input, OnInit, ViewContainerRef } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Firestore, doc, deleteDoc, QueryDocumentSnapshot } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { AuthguardService } from '../../../authguard.service';
import { AppointmentDetailComponent } from '../../appointment-detail/appointment-detail.component';
import { SpecialistAppointmentService, ApptRow, Specialist } from '../specialist-appointment.service';
import { SasPeriodBarComponent } from '../sas-period-bar/sas-period-bar.component';
import { SasLoaderComponent } from '../sas-loader/sas-loader.component';
import { SasAddAvailabilityComponent } from '../sas-add-availability/sas-add-availability.component';
import {
  AvailWindow, Hours, Period, apptStatus, ApptStatus, hoursSummary, fmtHours, periodOf, sameDay,
  windowState, WindowState, mondayOf, openMinutes, windowStatus, NO_SHOW_REASON,
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
  imports: [DatePipe, DecimalPipe, FormsModule, MatIconModule, MatMenuModule, MatSnackBarModule, SasLoaderComponent, SasPeriodBarComponent],
  templateUrl: './sas-home.component.html',
})
export class SasHomeComponent implements OnInit {
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
    private router: Router,
  ) {}

  async ngOnInit() {
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
      const inP = <T extends { start: Date }>(x: T) => x.start >= p.from && x.start < p.to;
      const pWins = wins.filter(inP), pAppts = appts.map(r => r.appt).filter(inP);
      this.hours = hoursSummary(pWins, pAppts);
      this.openMin = pWins.reduce((a, w) => a + openMinutes(w, this.now), 0);
      this.upcoming = up.filter(r => !r.appt.cancelled && !r.appt.attended && r.appt.end > this.now);
      if (this.showCalendar) this.buildCalendar(wins, appts, p);
    } catch (e) {
      if (run !== this.loadRun) return;
      console.error('Specialist appointment studio: load failed', e);
      this.snack.open('Could not load appointments. Try again.', 'OK', { duration: 5000 });
    }
    this.loading = false;
  }

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
    if (period.mode === 'week') {
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
  gotoWeek(d: Date) { this.period = periodOf('week', d); this.load(); }

  /* ---------- actions ---------- */
  addAvailability(date?: Date) {
    const profileId = this.mode === 'self' ? this.svc.profileId : (this.specialistId || null);
    this.dialog.open(SasAddAvailabilityComponent, {
      data: { profileId, specialists: this.mode === 'all' ? this.specialists : [], date },
      panelClass: 'sas-dialog-panel', autoFocus: false, disableClose: true, maxWidth: '96vw',
      viewContainerRef: this.vcr, // so the dialog gets this screen's SpecialistAppointmentService
    }).afterClosed().subscribe(saved => { if (saved) this.load(); });
  }

  /* Same rule as appointment-availability onrowdelete: only while nothing is booked in it. */
  async deleteWindow(w: AvailWindow, ev: Event) {
    ev.stopPropagation();
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
