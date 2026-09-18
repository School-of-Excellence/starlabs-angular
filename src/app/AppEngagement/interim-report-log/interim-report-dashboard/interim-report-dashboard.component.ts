import {
  Component, DestroyRef, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild, ViewEncapsulation,
  afterNextRender, inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCalendarCellClassFunction, MatDateRangePicker, MatDatepickerModule } from '@angular/material/datepicker';
import {
  Firestore, QueryConstraint, Timestamp, arrayUnion, collection, doc, documentId, getCountFromServer, getDocs, query,
  serverTimestamp, updateDoc, where,
} from '@angular/fire/firestore';
import * as XLSX from 'xlsx';
import { CROSSOVER_AREAS, EVO_RESULT_OF, mountInterimReportDashboard } from './interim-report-dashboard.script';

/** love letter / ask AH tag → the same boolean + details fields the Love Letter / Ask A&H tabs write */
const TAG_FIELD: Record<string, [string, string]> = {
  happy: ['liked', 'likedetails'],
  attention: ['tagged', 'tagdetails'],
  opportunity: ['opportunity', 'opportunitydetails'],
  critical: ['critical', 'criticaldetails'],
  resolved: ['resolved', 'resolveddetails'],
};
const TAG_COLLECTION = { love: 'love letter', ask: 'ask AH' } as const;
type TagKind = keyof typeof TAG_COLLECTION;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const toDate = (t: any): Date | null => t?.toDate?.() ?? (t instanceof Date ? t : null);

// STARLABS Interim Report Dashboard, extracted from the design file.
// ShadowDom keeps the design's page-level CSS isolated from the rest of the app.
// Every section reads Firestore (plans in specs/plans/2026-09-1*-interim-dashboard-*.md);
// love letter / ask AH tags and notes are written here too (2026-09-15-interim-dashboard-tagging.md).
@Component({
  selector: 'app-interim-report-dashboard',
  imports: [ReactiveFormsModule, MatDatepickerModule],
  templateUrl: './interim-report-dashboard.component.html',
  styleUrl: './interim-report-dashboard.component.css',
  encapsulation: ViewEncapsulation.ShadowDom
})
export class InterimReportDashboardComponent implements OnChanges {
  /** profile_data keyed by doc id — the Log tab's mapProfiles, so names are not fetched twice */
  @Input() profiles: Record<string, any> = {};
  /** the signed-in profile — recorded on tags and notes, as the Love Letter / Ask A&H tabs do */
  @Input() profileId: string | null = null;
  /** participants picked in the grids / lists, for the parent's WhatsApp / email / notification composers */
  @Output() send = new EventEmitter<{ channel: 'whatsapp' | 'email' | 'notification'; profileids: string[] }>();

  @ViewChild('rangePicker') rangePicker?: MatDateRangePicker<Date>;

  /** the DATE filter — one Material range picker; defaults to the current month */
  range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  private firestore = inject(Firestore);
  private dashboard: { refresh(): void } | null = null;

  /** days with at least one interimreport log (the calendar dots), loaded a month at a time */
  private reportDays = new Set<string>();
  private monthsLoaded = new Set<string>();

  /** JOURNEY / EVENT filter sources — read once when the dashboard mounts */
  private journeys: { id: string; name: string }[] = [];
  private events: { id: string; name: string; on: string }[] = [];
  private journeyName = new Map<string, string>();
  private attendeeCache = new Map<string, Set<string>>();
  private filtersReady: Promise<void> = Promise.resolve();

  dateClass: MatCalendarCellClassFunction<Date> = (date, view) => {
    if (view !== 'month') return '';
    this.loadMonth(date);
    return this.reportDays.has(dayKey(date)) ? 'irl-has-report' : '';
  };

  constructor() {
    this.range.setValue(this.defaultRange());
    // the picker sets start first and end second — reload once the range is complete (or cleared)
    this.range.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(({ start, end }) => {
      if (!!start === !!end) this.dashboard?.refresh();
    });

    const host: HTMLElement = inject(ElementRef).nativeElement;
    afterNextRender(() => {
      this.filtersReady = this.loadFilters();
      this.dashboard = mountInterimReportDashboard(host.shadowRoot, {
        load: (from, to) => this.loadPool(from, to),
        journeys: () => this.journeys,
        events: () => this.events,
        attendees: id => this.attendees(id),
        openProfile: profileid => { if (profileid) window.open(`/userprofile/${profileid}`, '_blank'); },
        send: (channel, profileids) => this.send.emit({ channel, profileids }),
        exportXlsx: (name, headers, rows) => this.exportXlsx(name, headers, rows),
        getRange: () => ({ from: this.range.value.start ?? null, to: this.range.value.end ?? null }),
        resetRange: () => this.range.setValue(this.defaultRange()),
        setTag: (kind, d, key, on) => this.setTag(kind, d, key, on),
        addNote: (kind, d, text) => this.addNote(kind, d, text),
      });
    });
  }

  ngOnChanges(): void {
    this.dashboard?.refresh();
  }

  /** opens (and Clear resets) on the current month — the query covers the 1st 00:00 to the last day 23:59:59.999 */
  private defaultRange(): { start: Date; end: Date } {
    const now = new Date();
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
  }

  /** the JOURNEY and EVENT dropdowns — one read of each collection per dashboard mount */
  private async loadFilters(): Promise<void> {
    const [jSnap, eSnap] = await Promise.all([
      getDocs(collection(this.firestore, 'journey')),
      getDocs(collection(this.firestore, 'event collection')),
    ]);
    this.journeys = jSnap.docs.map(d => {
      const x = d.data() as any;
      const name = String(x['journey'] ?? x['name'] ?? '').trim() || d.id;
      this.journeyName.set(d.id, name);
      return { id: d.id, name };
    }).sort((a, b) => a.name.localeCompare(b.name));

    this.events = eSnap.docs.map(d => {
      const x = d.data() as any;
      const start = toDate(x['start_date'] ?? x['startdate'] ?? x['eventdate']);
      return {
        id: d.id,
        name: String(x['name'] ?? x['eventname'] ?? '').trim() || d.id,
        on: start ? start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
        _t: start ? start.getTime() : 0,
      } as any;
    }).sort((a: any, b: any) => b._t - a._t);   // newest event first
    this.dashboard?.refresh();
  }

  /** profileids that attended one event — `event participation request` by eventref + status, cached */
  private async attendees(eventId: string): Promise<Set<string>> {
    const hit = this.attendeeCache.get(eventId);
    if (hit) return hit;
    const snap = await getDocs(query(collection(this.firestore, 'event participation request'),
      where('eventref', '==', doc(this.firestore, 'event collection', eventId)),
      where('status', '==', 'attended')));
    const ids = new Set<string>(snap.docs.map(d => String(d.data()['profileid'] ?? '')).filter(Boolean));
    this.attendeeCache.set(eventId, ids);
    return ids;
  }

  /** the journey each participant belongs to — activejourney, else lastcompletedjourney, else lastsubscribedjourney */
  private async journeysOf(profileIds: string[]): Promise<Map<string, { id: string; name: string }>> {
    const ids = [...new Set(profileIds.filter(Boolean))];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const snaps = await Promise.all(chunks.map(chunk =>
      getDocs(query(collection(this.firestore, 'participant metadata'), where(documentId(), 'in', chunk)))));
    const out = new Map<string, { id: string; name: string }>();
    snaps.forEach(snap => snap.docs.forEach(d => {
      const m = d.data() as any;
      const jid = [m['activejourney'], m['lastcompletedjourney'], m['lastsubscribedjourney']]
        .find(v => typeof v === 'string' && v.trim());
      if (jid) out.set(d.id, { id: jid, name: this.journeyName.get(jid) || jid });
    }));
    return out;
  }

  /** every list on the dashboard exports through here */
  private exportXlsx(name: string, headers: string[], rows: (string | number)[][]): void {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h, i) =>
      ({ wch: Math.min(60, Math.max(12, ...[h, ...rows.map(r => String(r[i] ?? ''))].map(v => String(v).length + 2))) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${(name.replace(/[^\w\- ]+/g, '').trim() || 'interim-report')} ${stamp}.xlsx`);
  }

  /** count interimreport log docs created in [from, to) — an aggregation, so no documents are downloaded */
  private countLogs(from: Date, to: Date): Promise<number> {
    return getCountFromServer(query(collection(this.firestore, 'interimreport log'),
      where('createdon', '>=', Timestamp.fromDate(from)), where('createdon', '<', Timestamp.fromDate(to))))
      .then(snap => snap.data().count);
  }

  /** find the month's days with an interimreport log once, then repaint the open calendar so the dots show.
   *  One count for the month (1 read); only if it is non-zero, one count per day (1 read each). */
  private loadMonth(date: Date): void {
    const y = date.getFullYear(), m = date.getMonth(), key = `${y}-${m}`;
    if (this.monthsLoaded.has(key)) return;
    this.monthsLoaded.add(key);
    this.countLogs(new Date(y, m, 1), new Date(y, m + 1, 1))
      .then(total => !total ? [] : Promise.all(
        Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) =>
          this.countLogs(new Date(y, m, i + 1), new Date(y, m, i + 2))
            .then(n => { if (n) this.reportDays.add(dayKey(new Date(y, m, i + 1))); }))))
      .then(days => {
        // MatCalendar re-runs dateClass on updateTodaysDate(); the open calendar is only reachable through the picker
        if (days.length) (this.rangePicker as any)?._componentRef?.instance?._calendar?.updateTodaysDate();
      })
      .catch(() => this.monthsLoaded.delete(key));
  }

  /** toggle one tag on a love letter / ask AH doc — local first so the dashboard repaints at once */
  private async setTag(kind: TagKind, d: any, key: string, on: boolean): Promise<void> {
    const [flag, details] = TAG_FIELD[key];
    const prev = { [flag]: d[flag], [details]: d[details] };
    d[flag] = on;
    d[details] = on ? { user: this.profileId, time: new Date() } : null;
    try {
      await updateDoc(doc(this.firestore, TAG_COLLECTION[kind], d._id), {
        [flag]: on,
        [details]: on ? { user: this.profileId, time: serverTimestamp() } : null,
      });
    } catch (err) {
      Object.assign(d, prev);
      throw err;
    }
  }

  /** append a note — same {notes, user, time} shape the Love Letter / Ask A&H notes panel writes */
  private async addNote(kind: TagKind, d: any, text: string): Promise<void> {
    const note = { notes: text, user: this.profileId, time: Timestamp.now() };
    const prev = d['notes'];
    d['notes'] = [...(Array.isArray(prev) ? prev : []), note];
    try {
      await updateDoc(doc(this.firestore, TAG_COLLECTION[kind], d._id), { notes: arrayUnion(note) });
    } catch (err) {
      d['notes'] = prev;
      throw err;
    }
  }

  /** one member per interimreport log created in the range, with its latest crossover + evolution record */
  private async loadPool(from: Date | null, to: Date | null): Promise<any[]> {
    const constraints: QueryConstraint[] = [];
    if (from) constraints.push(where('createdon', '>=', Timestamp.fromDate(from)));
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      constraints.push(where('createdon', '<=', Timestamp.fromDate(end)));
    }
    const logs = await getDocs(query(collection(this.firestore, 'interimreport log'), ...constraints));
    const ids = logs.docs.map(d => d.id);
    await this.filtersReady;   // journey names are needed to label each participant's journey
    const journeys = await this.journeysOf(logs.docs.map(d => d.data()['profileid']));

    const [cross, evo, love, ask] = await Promise.all([
      this.latestByLog('interim crossover', ids),
      this.latestByLog('interim evolutionprogress', ids),
      this.latestByLog('love letter', ids),
      this.latestByLog('ask AH', ids),
    ]);
    return logs.docs.map((d, i) => this.toMember(d.id, d.data(), {
      cross: cross.get(d.id), evo: evo.get(d.id), love: love.get(d.id), ask: ask.get(d.id),
      journey: journeys.get(d.data()['profileid']),
    }, i));
  }

  /** latest doc (by `created`) per interimlogid, with its doc id as `_id` — `in` takes at most 30 values per query */
  private async latestByLog(collectionName: string, ids: string[]): Promise<Map<string, any>> {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const snaps = await Promise.all(chunks.map(chunk =>
      getDocs(query(collection(this.firestore, collectionName), where('interimlogid', 'in', chunk)))));
    const latest = new Map<string, any>();
    const millis = (t: any) => (t?.toMillis ? t.toMillis() : 0);
    snaps.forEach(snap => snap.docs.forEach(d => {
      const x = { ...d.data(), _id: d.id };
      const prev = latest.get(x['interimlogid']);
      if (!prev || millis(x['created']) >= millis(prev['created'])) latest.set(x['interimlogid'], x);
    }));
    return latest;
  }

  private toMember(logId: string, log: any,
    docs: { cross?: any; evo?: any; love?: any; ask?: any; journey?: { id: string; name: string } }, i: number) {
    const profiles = () => this.profiles || {};
    const crossDoc = docs.cross, evoDoc = docs.evo;

    // love letter / ask AH tags — getters over the raw doc, so a tag set from the dashboard shows at once
    const tagsOf = (d: any) => ({
      get happy() { return d['liked'] === true; },
      get attention() { return d['tagged'] === true; },
      get opportunity() { return d['opportunity'] === true; },
      get critical() { return d['critical'] === true; },
      get resolved() { return d['resolved'] === true; },
      get resolvedOn(): Date | null { return toDate(d['resolveddetails']?.['time']); },
      get resolvedBy(): string | null {
        const id = d['resolveddetails']?.['user'];
        return id ? (profiles()[id]?.['name'] || '—') : null;
      },
    });
    // notes, oldest first — {notes, user, time} as the Love Letter / Ask A&H tabs store them
    const notesOf = (d: any) => (Array.isArray(d['notes']) ? d['notes'] : []).map((n: any) => ({
      text: String(n?.['notes'] ?? ''),
      by: profiles()[n?.['user']]?.['name'] || '—',
      on: toDate(n?.['time']),
    }));
    const loveText = String(docs.love?.['loveletter'] ?? '').trim();
    const love = loveText
      ? { text: loveText, doc: docs.love, tags: tagsOf(docs.love), get notes() { return notesOf(docs.love); } }
      : null;
    const ahText = String(docs.ask?.['askah'] ?? '').trim();
    const instText = String(docs.ask?.['installationaskah'] ?? '').trim();
    const asks = ahText || instText
      ? { ah: ahText || null, inst: instText || null, doc: docs.ask, tags: tagsOf(docs.ask), get notes() { return notesOf(docs.ask); } }
      : null;
    const reports: string[] = Array.isArray(log['reports']) ? log['reports'] : [];
    const metric = crossDoc?.['metric'] || {};
    const cross: Record<string, number | null> = {};
    const goal: Record<string, string | null> = {};
    const jumped: Record<string, string | null> = {};   // metric[area].jumpedfrom — the goal before a level jump
    const levelChanges: { area: string; from: string; to: string }[] = [];

    // The life areas are NOT a fixed five: the Flutter app builds `participant AEL.crossovermetric`
    // (and this doc's `metric`) from that participant's ATC model `category` list, so the keys differ
    // per model. Read the keys the doc actually carries — a hard-coded list rendered every unmatched
    // area as "Left blank" and showed a metric for only the areas whose names happened to line up.
    const areaKeys: string[] = Object.keys(metric).length ? Object.keys(metric) : [];
    areaKeys.forEach(area => {
      const m = metric[area] || {};
      const n = m['metric'] === null || m['metric'] === undefined || m['metric'] === '' ? NaN : Number(m['metric']);
      cross[area] = Number.isFinite(n) ? Math.round(n) : null;
      goal[area] = m['startpoint'] || m['endpoint'] ? `${m['startpoint'] ?? '—'} → ${m['endpoint'] ?? '—'}` : null;
      jumped[area] = m['jumpedfrom'] || null;
      if (m['jumpedfrom']) levelChanges.push({ area, from: m['jumpedfrom'], to: m['endpoint'] ?? '—' });
    });

    // Evolution: outcome, reason and time per adjustment — the adjustment text is never used
    const adjs = (Array.isArray(evoDoc?.['adjustments']) ? evoDoc['adjustments'] : []).map((a: any) => ({
      res: EVO_RESULT_OF[a?.['sliderValue']] ?? null,
      nc: a?.['nochangevalue'] ?? null,
      per: a?.['type'] === 'Day' ? 'day' : a?.['type'] === 'Week' ? 'week' : null,
      hours: Number(a?.['hourValue']) || 0,
      years: Number(a?.['savedyears']) || 0,
    }));
    const storedYears = Number(evoDoc?.['summary']?.['savedyears']);
    const evoYears = Number.isFinite(storedYears)
      ? storedYears
      : adjs.reduce((t: number, a: any) => t + a.years, 0);

    const created: Date | null = log['createdon']?.toDate?.() ?? null;
    return {
      real: true,
      i,
      uid: logId,
      profileid: log['profileid'],
      get nm(): string { return profiles()[log['profileid']]?.['name'] || '—'; },
      sub: created ? `Sent ${created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : '',
      journeyId: docs.journey?.id ?? null,
      journey: docs.journey?.name ?? '—',
      reports,
      submitted: log['status'] === 'completed',
      opened: reports.length > 0,
      hasCross: !!crossDoc,
      cross,
      goal,
      jumped,
      levelChanges,
      hasEvo: !!evoDoc,
      adjs,
      age: evoDoc?.['age'] ?? null,
      evoYears,
      love,
      asks,
    };
  }
}
