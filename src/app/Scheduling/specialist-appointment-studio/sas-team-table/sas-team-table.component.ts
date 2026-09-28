import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SpecialistAppointmentService, ApptRow } from '../specialist-appointment.service';
import { SasLoaderComponent } from '../sas-loader/sas-loader.component';
import {
  AvailWindow, AvailStatus, ApptStatus, Hours, Period, WindowState, hoursSummary, fmtHours, openMinutes, mondayOf,
  availStatus, apptStatus, windowState, windowStatus, WindowStatus, WINDOW_STATUSES,
} from '../sas-logic';

interface Participant { id: string; productId: string | null; next: ApptRow | null; }
/* One availability window the EIS gave, with what is booked in it. */
interface AvailEntry { w: AvailWindow; state: WindowState; status: WindowStatus; openMin: number; sessions: ApptRow[]; }
export interface TeamRow {
  id: string; name: string; status: AvailStatus;
  openWeekMin: number; hours: Hours; participants: Participant[];
  avail: AvailEntry[];      // every window in the period, oldest first
  outside: ApptRow[];       // sessions in the period that sit in no window
}

const STATUS_PILL: Record<WindowStatus, string> = {
  'Open for booking': 'is-success', 'Partly booked': 'is-success', 'Fully booked': '', 'Completion pending': 'is-warning',
  Completed: 'is-success', Cancelled: 'is-neutral', Unused: 'is-neutral',
};
const APPT_PILL: Record<ApptStatus, string> = {
  Completed: 'is-success', Cancelled: 'is-neutral', 'In session': 'is-solid', Pending: 'is-warning', Booked: '',
};
export interface TeamSummary { hours: Hours; openWeekMin: number; participants: number; members: number; }

/* One row per team member (EIS). Opening a row shows every availability window they gave in the period,
   its booking status and the sessions booked in it (appointment type, participant, status), then the
   participants they work with on the mentor's products. Loads its own data. Hook prefix: stt */
@Component({
  selector: 'app-sas-team-table',
  imports: [DatePipe, DecimalPipe, FormsModule, MatIconModule, SasLoaderComponent],
  templateUrl: './sas-team-table.component.html',
})
export class SasTeamTableComponent implements OnChanges {
  @Input({ required: true }) members: string[] = [];
  @Input() productIds: string[] = [];
  @Input({ required: true }) period!: Period;
  @Input() q = '';                 // name search: matches the EIS or any of their participants
  @Output() summary = new EventEmitter<TeamSummary>();

  get shown(): TeamRow[] {
    const t = this.q.trim().toLowerCase();
    if (!t) return this.rows;
    return this.rows.filter(r => r.name.toLowerCase().includes(t) || r.participants.some(p => this.svc.name(p.id).toLowerCase().includes(t)));
  }

  readonly fmtHours = fmtHours;
  rows: TeamRow[] = [];
  open: string | null = null;
  loading = true;
  productNames: Record<string, string> = {};

  constructor(public svc: SpecialistAppointmentService) {}

  async ngOnChanges(changes: SimpleChanges) {
    // Typing in the search only filters; reload only when members, products or period change.
    if (Object.keys(changes).every(k => k === 'q')) return;
    this.loading = true;
    const ids = this.members;
    if (!ids.length) { this.rows = []; this.loading = false; this.emit([], [], [], []); return; }
    const now = new Date(), wk = mondayOf(now), wkEnd = new Date(wk.getTime() + 7 * 86400000);
    const upTo = new Date(now.getTime() + 60 * 86400000);
    const [wins, appts, weekWins, upcoming, products] = await Promise.all([
      this.svc.windows(ids, this.period.from, this.period.to),
      this.svc.appointments(ids, this.period.from, this.period.to),
      this.svc.windows(ids, wk, wkEnd),
      this.svc.appointments(ids, now, upTo),
      this.svc.productMap(),
    ]);
    this.productNames = products;
    this.rows = ids.map(id => {
      const mine = (l: AvailWindow[]) => l.filter(w => w.profileId === id);
      const myAppts = appts.filter(r => r.appt.hostIds.includes(id));
      const myUp = upcoming.filter(r => r.appt.hostIds.includes(id) && !r.appt.cancelled && !r.appt.attended)
        .sort((a, b) => a.appt.start.getTime() - b.appt.start.getTime());
      const openWeekMin = mine(weekWins).reduce((a, w) => a + openMinutes(w, now), 0);
      const status = availStatus(mine(weekWins), [...myAppts, ...myUp].map(r => r.appt), now);
      const people = new Map<string, Participant>();
      // Everyone they have a live booking with. Not limited to the mentor's products: about a quarter of
      // appointments carry no productid, so a product filter showed 0 for EIS who clearly had bookings.
      [...myAppts, ...myUp].filter(r => !r.appt.cancelled).forEach(r => {
        const p = r.appt.participantId;
        if (p && !people.has(p)) people.set(p, { id: p, productId: r.appt.productId, next: myUp.find(u => u.appt.participantId === p) ?? null });
      });
      const byStart = (a: ApptRow, b: ApptRow) => a.appt.start.getTime() - b.appt.start.getTime();
      const used = new Set<string>();
      const avail: AvailEntry[] = mine(wins).sort((a, b) => a.start.getTime() - b.start.getTime()).map(w => {
        const sessions = myAppts.filter(r => !used.has(r.appt.id) && r.appt.start >= w.start && r.appt.start < w.end).sort(byStart);
        sessions.forEach(r => used.add(r.appt.id));
        return { w, state: windowState(w, now), status: windowStatus(w, sessions.map(r => r.appt), now), openMin: openMinutes(w, now), sessions };
      });
      return {
        id, name: this.svc.name(id), status,
        openWeekMin, hours: hoursSummary(mine(wins), myAppts.map(r => r.appt)), participants: [...people.values()],
        avail, outside: myAppts.filter(r => !used.has(r.appt.id)).sort(byStart),
      } as TeamRow;
    }).sort((a, b) => a.name.localeCompare(b.name));
    this.emit(wins, appts, weekWins, this.rows);
    this.loading = false;
  }

  private emit(wins: AvailWindow[], appts: ApptRow[], weekWins: AvailWindow[], rows: TeamRow[]) {
    const now = new Date();
    this.summary.emit({
      hours: hoursSummary(wins, appts.map(r => r.appt)),
      openWeekMin: weekWins.reduce((a, w) => a + openMinutes(w, now), 0),
      participants: new Set(rows.flatMap(r => r.participants.map(p => p.id))).size,
      members: rows.length,
    });
  }

  toggle(id: string) { this.open = this.open === id ? null : id; this.availFilter = ''; }
  initials(n: string) { return n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
  statusClass(s: TeamRow['status']) { return s === 'In session' ? 'is-solid' : s === 'Available' ? 'is-success' : 'is-neutral'; }
  readonly STATUS_PILL = STATUS_PILL;
  readonly WINDOW_STATUSES = WINDOW_STATUSES;
  availFilter: WindowStatus | '' = '';

  /* The open row's windows, narrowed by the status filter. */
  filteredAvail(r: TeamRow): AvailEntry[] { return this.availFilter ? r.avail.filter(a => a.status === this.availFilter) : r.avail; }
  statusCount(r: TeamRow, st: WindowStatus) { return r.avail.filter(a => a.status === st).length; }
  apptStatus(r: ApptRow): ApptStatus { return apptStatus(r.appt, new Date()); }
  apptPill(r: ApptRow) { return APPT_PILL[this.apptStatus(r)]; }
  apptLabel(r: ApptRow) { const s = this.apptStatus(r); return s === 'Pending' ? 'Completion pending' : s; }
  typeNames(w: AvailWindow) { return w.typeIds.map(t => this.svc.mapAppointment[t] ?? t).join(', '); }
  typeName(r: ApptRow) { return (r.appt.typeId && this.svc.mapAppointment[r.appt.typeId]) || 'Appointment'; }
}
