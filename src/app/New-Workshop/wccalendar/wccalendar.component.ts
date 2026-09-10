import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { AddEventDialogComponent } from './add-event-dialog/add-event-dialog.component';
import { EventDetailsDialogComponent } from './event-details-dialog/event-details-dialog.component';

/** Raw `workshopcampaigncalendar` document (field names as stored in Firestore). */
export interface CalendarEvent {
  id: string;
  title: string;
  type: string;              // newusertags doc id (type=='wccalendar'); legacy docs hold a plain name
  startdate: any;            // Firestore Timestamp
  enddate: any;              // Firestore Timestamp
  allday: boolean;
  location: string;          // newusertags doc id (type=='location'), '' when none
  note: string;
  showinapp: boolean;        // whether the event is exposed to the participant app
  deleted?: boolean;         // soft delete — docs are never removed, only flagged
  repeat: string;            // 'none' for now
  repeatuntil: any;          // null for now
}

export interface EventTypeMeta {
  label: string;
  cls: string;               // event chip class
  dot: string;               // legend dot class
  pill: string;              // month-header pill class
}

/** The four reference color slots; dynamic types cycle through them by list order. */
export const TYPE_PALETTE: Omit<EventTypeMeta, 'label'>[] = [
  { cls: 'cal-event-ws',   dot: 'dot-ws',   pill: 'mchip-ws' },
  { cls: 'cal-event-camp', dot: 'dot-camp', pill: 'mchip-camp' },
  { cls: 'cal-event-mc',   dot: 'dot-mc',   pill: 'mchip-mc' },
  { cls: 'cal-event-web',  dot: 'dot-web',  pill: 'mchip-web' }
];

/** Palette slots for events created before types moved to newusertags (plain-name `type`). */
const LEGACY_TYPE_SLOTS: Record<string, number> = {
  workshop: 0, campaign: 1, masterclass: 2, webinar: 3
};

export function tsToDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
}

/**
 * All-day dates are stored as UTC-midnight Timestamps and must be read back
 * through UTC accessors — using local accessors would shift the calendar day
 * for viewers in a different timezone than the event's creator.
 */
export function eventDayNum(value: any): number | null {
  const d = tsToDate(value);
  if (!d) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function fmtEventDate(value: any): string {
  const d = tsToDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

interface LegendVM {
  name: string;
  dot: string;
}

interface PillVM {
  text: string;              // "2 Workshops"
  pill: string;
}

interface ChipVM {
  event: CalendarEvent;
  cls: string;
  label: string;             // "W CTD Launch Campaign" (letter only on the start day)
  tooltip: string;
}

interface DayVM {
  num: number;
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  chips: ChipVM[];
  moreCount: number;
  allEvents: CalendarEvent[];
}

interface MonthVM {
  title: string;             // "July 2026"
  sub: string;               // "1 workshop · 2 campaigns · 5 total events"
  pills: PillVM[];
  days: DayVM[];
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
/** Chips shown per day cell before collapsing into "+N more". */
const MAX_CHIPS = 3;
const MONTHS_SHOWN = 3;

@Component({
  selector: 'app-wccalendar',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './wccalendar.component.html',
  styleUrl: './wccalendar.component.css'
})
export class WccalendarComponent implements OnInit, OnDestroy {

  readonly dow = DOW;
  months: MonthVM[] = [];
  legend: LegendVM[] = [];
  loading = true;

  private events: CalendarEvent[] = [];
  /** Tag id -> resolved meta; also keyed by legacy plain-name types. */
  private typeMeta: Record<string, EventTypeMeta> = {};
  /** Location tag id -> name (newusertags, type=='location'). */
  private locationNames: Record<string, string> = {};
  /** First of the first displayed month. */
  private viewStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  private subs: Subscription[] = [];

  constructor(private firestore: Firestore, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.subs.push(collectionData(
      query(collection(this.firestore, 'newusertags'), where('type', '==', 'wccalendar')),
      { idField: 'id' }
    ).subscribe({
      next: rows => {
        const types = (rows as any[])
          .map(r => ({ id: r.id as string, name: (r.name || '').toString() }))
          .filter(t => t.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        const meta: Record<string, EventTypeMeta> = {};
        types.forEach((t, i) => {
          meta[t.id] = { ...TYPE_PALETTE[i % TYPE_PALETTE.length], label: t.name };
        });
        Object.entries(LEGACY_TYPE_SLOTS).forEach(([name, slot]) => {
          if (!meta[name]) {
            meta[name] = { ...TYPE_PALETTE[slot], label: name[0].toUpperCase() + name.slice(1) };
          }
        });
        this.typeMeta = meta;
        this.legend = types.map(t => ({ name: t.name, dot: meta[t.id].dot }));
        this.rebuild();
      },
      error: err => console.error('Error loading event types:', err)
    }));

    this.subs.push(collectionData(
      query(collection(this.firestore, 'newusertags'), where('type', '==', 'location')),
      { idField: 'id' }
    ).subscribe({
      next: rows => {
        this.locationNames = Object.fromEntries(
          (rows as any[]).map(r => [r.id as string, (r.name || '').toString()])
        );
        this.rebuild();
      },
      error: err => console.error('Error loading locations:', err)
    }));

    this.subs.push(collectionData(
      collection(this.firestore, 'workshopcampaigncalendar'), { idField: 'id' }
    ).subscribe({
      next: rows => {
        // Soft delete: flagged docs stay in Firestore but never render.
        // Filtered client-side so legacy docs without the field still show.
        this.events = (rows as CalendarEvent[])
          .filter(e => e.deleted !== true)
          .filter(e => eventDayNum(e.startdate) !== null && eventDayNum(e.enddate) !== null);
        this.loading = false;
        this.rebuild();
      },
      error: err => {
        console.error('Error loading calendar events:', err);
        this.loading = false;
      }
    }));
    this.rebuild();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  metaFor(type: string): EventTypeMeta {
    return this.typeMeta[type] || {
      ...TYPE_PALETTE[(type || '').length % TYPE_PALETTE.length],
      label: 'Event'
    };
  }

  // ── Navigation ──────────────────────────
  prevMonth(): void {
    this.viewStart = new Date(this.viewStart.getFullYear(), this.viewStart.getMonth() - 1, 1);
    this.rebuild();
  }

  nextMonth(): void {
    this.viewStart = new Date(this.viewStart.getFullYear(), this.viewStart.getMonth() + 1, 1);
    this.rebuild();
  }

  goToday(): void {
    this.viewStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    this.rebuild();
  }

  get rangeLabel(): string {
    const first = this.viewStart;
    const last = new Date(first.getFullYear(), first.getMonth() + MONTHS_SHOWN - 1, 1);
    const sameYear = first.getFullYear() === last.getFullYear();
    const firstLbl = MONTH_NAMES[first.getMonth()].slice(0, 3) + (sameYear ? '' : ` ${first.getFullYear()}`);
    return `${firstLbl} — ${MONTH_NAMES[last.getMonth()].slice(0, 3)} ${last.getFullYear()}`;
  }

  // ── Dialogs ──────────────────────────
  openAddEvent(event?: CalendarEvent, presetStart?: string): void {
    this.dialog.open(AddEventDialogComponent, {
      width: '460px',
      maxWidth: '95vw',
      autoFocus: false,
      panelClass: 'wc-dark-panel',
      backdropClass: 'wc-dark-backdrop',
      data: event ? { event } : presetStart ? { presetStart } : null
    });
  }

  openChip(chip: ChipVM, ev: MouseEvent): void {
    ev.stopPropagation();
    this.openDetails([chip.event]);
  }

  /** Clicking a day cell (not a chip) creates a new event on that date. */
  openDay(day: DayVM): void {
    if (!day.inMonth) return;
    const y = day.date.getFullYear();
    const mm = String(day.date.getMonth() + 1).padStart(2, '0');
    const dd = String(day.date.getDate()).padStart(2, '0');
    this.openAddEvent(undefined, `${y}-${mm}-${dd}`);
  }

  /** "+N more" opens the full day list instead of the create dialog. */
  openMore(day: DayVM, ev: MouseEvent): void {
    ev.stopPropagation();
    this.openDetails(day.allEvents, day.date);
  }

  private openDetails(events: CalendarEvent[], date?: Date): void {
    const meta: Record<string, EventTypeMeta> = {};
    events.forEach(e => { meta[e.type] = this.metaFor(e.type); });
    this.dialog.open(EventDetailsDialogComponent, {
      width: '460px',
      maxWidth: '95vw',
      autoFocus: false,
      panelClass: 'wc-dark-panel',
      backdropClass: 'wc-dark-backdrop',
      data: { events, date: date ?? null, meta, locations: this.locationNames }
    }).afterClosed().subscribe(res => {
      if (res?.edit) this.openAddEvent(res.edit as CalendarEvent);
    });
  }

  // ── Month building ──────────────────────────
  private rebuild(): void {
    const months: MonthVM[] = [];
    for (let i = 0; i < MONTHS_SHOWN; i++) {
      const d = new Date(this.viewStart.getFullYear(), this.viewStart.getMonth() + i, 1);
      months.push(this.buildMonth(d.getFullYear(), d.getMonth()));
    }
    this.months = months;
  }

  private buildMonth(y: number, m: number): MonthVM {
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const firstDow = first.getDay();
    const daysInMonth = last.getDate();
    // Grid cells are compared as UTC day numbers, matching eventDayNum().
    const cellNum = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const firstNum = cellNum(first);
    const lastNum = cellNum(last);
    const todayNum = cellNum(new Date());

    const monthEvents = this.events.filter(e =>
      eventDayNum(e.startdate)! <= lastNum && eventDayNum(e.enddate)! >= firstNum
    );

    // Per-type counts drive the subtitle and header pills (types are dynamic now).
    const byType = new Map<string, number>();
    monthEvents.forEach(e => byType.set(e.type, (byType.get(e.type) || 0) + 1));
    const typeCounts = [...byType.entries()]
      .map(([type, count]) => ({ count, meta: this.metaFor(type) }))
      .sort((a, b) => b.count - a.count || a.meta.label.localeCompare(b.meta.label));

    const days: DayVM[] = [];

    // Leading days from the previous month (dimmed, number only — as in the reference).
    for (let i = 0; i < firstDow; i++) {
      const d = new Date(y, m, 1 - firstDow + i);
      days.push({ num: d.getDate(), date: d, inMonth: false, isToday: false, chips: [], moreCount: 0, allEvents: [] });
    }

    // Actual days.
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
      const date = new Date(y, m, dnum);
      const t = Date.UTC(y, m, dnum);
      const dayEvents = monthEvents
        .filter(e => eventDayNum(e.startdate)! <= t && eventDayNum(e.enddate)! >= t)
        .sort((a, b) => {
          const diff = eventDayNum(a.startdate)! - eventDayNum(b.startdate)!;
          return diff !== 0 ? diff : (a.title || '').localeCompare(b.title || '');
        });

      const visible = dayEvents.length > MAX_CHIPS ? dayEvents.slice(0, MAX_CHIPS) : dayEvents;
      const chips: ChipVM[] = visible.map(e => {
        const meta = this.metaFor(e.type);
        const isStart = eventDayNum(e.startdate) === t;
        const extras = [this.locationNames[e.location], e.note].filter(Boolean).join(' · ');
        return {
          event: e,
          cls: meta.cls,
          label: (isStart ? meta.label[0].toUpperCase() + ' ' : '') + (e.title || '(untitled)'),
          tooltip: (e.title || '') + (extras ? ' — ' + extras : '')
        };
      });

      days.push({
        num: dnum,
        date,
        inMonth: true,
        isToday: t === todayNum,
        chips,
        moreCount: dayEvents.length - visible.length,
        allEvents: dayEvents
      });
    }

    // Trailing days to complete the final week row.
    const trailing = (7 - days.length % 7) % 7;
    for (let i = 1; i <= trailing; i++) {
      const d = new Date(y, m + 1, i);
      days.push({ num: i, date: d, inMonth: false, isToday: false, chips: [], moreCount: 0, allEvents: [] });
    }

    const total = monthEvents.length;
    // Reference subtitle format, but driven by the two most frequent types.
    const subParts = typeCounts.slice(0, 2)
      .map(tc => `${tc.count} ${tc.meta.label.toLowerCase()}${tc.count !== 1 ? 's' : ''}`);
    subParts.push(`${total} total event${total !== 1 ? 's' : ''}`);

    return {
      title: `${MONTH_NAMES[m]} ${y}`,
      sub: subParts.join(' · '),
      pills: typeCounts.slice(0, 3).map(tc => ({
        text: `${tc.count} ${tc.meta.label}${tc.count !== 1 ? 's' : ''}`,
        pill: tc.meta.pill
      })),
      days
    };
  }
}
