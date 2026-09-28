import { Component, Inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Firestore, collection, doc, writeBatch } from '@angular/fire/firestore';
import { SpecialistAppointmentService, Specialist, TypeOption } from '../specialist-appointment.service';
import { Interval, daysBetween, fmtHours, overlapsAny, previewSlots, sameDay } from '../sas-logic';
import { SasLoaderComponent } from '../sas-loader/sas-loader.component';

export interface AddAvailabilityData { profileId: string | null; specialists: Specialist[]; date?: Date; }
interface StaticRow { typePath: string | null; start: string; }

/* Add availability. Auto = give a range and computeSlot cuts the start times (no flag).
   Static = the specialist's own slots: per slot a delivery type and a start time, ending after that type's
   duration; several per day. Each slot is saved as its own fixed: true doc, so computeSlot makes exactly it.
   Writes the same availability doc shape as add-appointment-availability. Hook prefix: saa */
@Component({
  selector: 'app-sas-add-availability',
  imports: [DatePipe, FormsModule, MatIconModule, MatSelectModule, SasLoaderComponent],
  // The .sas-dialog box lives on an inner wrapper: MatDialog gives the component host
  // `display: contents` (mat-mdc-dialog-component-host), which drops any width/padding set on it.
  templateUrl: './sas-add-availability.component.html',
})
export class SasAddAvailabilityComponent implements OnInit {
  readonly DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  readonly fmtHours = fmtHours;

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

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: AddAvailabilityData,
    private ref: MatDialogRef<SasAddAvailabilityComponent>,
    private firestore: Firestore,
    public svc: SpecialistAppointmentService,
  ) {
    this.profileId = data.profileId;
    const d0 = data.date && data.date >= this.today ? data.date : this.today;
    this.monthAnchor = new Date(d0.getFullYear(), d0.getMonth(), 1);
    if (data.date && data.date >= this.today) { this.from = new Date(d0); this.to = new Date(d0); }
  }

  ngOnInit() { if (this.profileId) this.loadProfile(); }

  async loadProfile() {
    this.types = []; this.picked.clear(); this.blocked = null; this.error = '';
    if (!this.profileId) return;
    this.loadingTypes = true;
    const id = this.profileId;
    try {
      const [blocked, types, existing] = await Promise.all([
        this.svc.unmarkedLastAppointment(id), this.svc.typesFor(id), this.svc.futureIntervals(id),
      ]);
      if (id !== this.profileId) return;       // the specialist changed while loading
      this.blocked = blocked; this.types = types; this.existing = existing;
    } catch (e: any) {
      this.error = 'Could not load this specialist\'s delivery types. ' + (e?.message ?? '');
    }
    this.loadingTypes = false;
  }

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
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  }
  private mins(hhmm: string) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
  windowMin(): number {
    if (!this.startTime || !this.endTime) return 0;
    return this.mins(this.endTime) - this.mins(this.startTime);
  }

  /* ---------- Static: the specialist's own slots, per picked date ----------
     Each date has its own rows; a row = one delivery type + a start time, ending after that type's
     duration. Saved as one fixed availability doc per slot. */
  private dayRows = new Map<string, StaticRow[]>();
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
  private intervals(): { d: Date; s: Date; e: Date; typePath: string; n: number }[] {
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
    if (this.mode === 'auto') {
      if (!this.picked.size) return 'Choose at least one delivery type.';
    }
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
      const batch = writeBatch(this.firestore);
      const profileref = this.svc.profileRef(this.profileId!);
      const put = (data: Record<string, any>) => {
        const id = doc(collection(this.firestore, 'availability')).id;
        batch.set(doc(this.firestore, 'availability/' + id), { id, profileref, ...data });
      };
      if (this.mode === 'auto') {
        const appointments = this.pickedTypes().map(t => doc(this.firestore, t.path));
        for (const d of this.dates()) put({ starttime: this.at(d, this.startTime), endtime: this.at(d, this.endTime), appointments });
      } else {
        // One fixed doc per slot, holding only its own type: computeSlot writes exactly that slot.
        for (const x of this.intervals()) put({ starttime: x.s, endtime: x.e, appointments: [doc(this.firestore, x.typePath)], fixed: true });
      }
      await batch.commit();
      this.ref.close(true);
    } catch (e: any) {
      this.error = String(e?.message ?? e);
      this.saving = false;
    }
  }

  close() { this.ref.close(false); }
}
