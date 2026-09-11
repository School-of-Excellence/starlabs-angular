import { Component, DestroyRef, ElementRef, Input, OnChanges, ViewEncapsulation, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Firestore, QueryConstraint, Timestamp, collection, getDocs, query, where } from '@angular/fire/firestore';
import { CROSSOVER_AREAS, EVO_RESULT_OF, mountInterimReportDashboard } from './interim-report-dashboard.script';

// STARLABS Interim Report Dashboard, extracted from the design file.
// ShadowDom keeps the design's page-level CSS isolated from the rest of the app.
// Summary strip, Crossover Meter and Evolution Progress read Firestore (see
// specs/plans/2026-09-11-interim-dashboard-crossover.md and 2026-09-12-interim-dashboard-evolution.md);
// Love Letter and Asks still show the design's mock data.
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

  /** the DATE filter — one Material range picker; defaults to today */
  range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  private firestore = inject(Firestore);
  private dashboard: { refresh(): void } | null = null;

  constructor() {
    this.range.setValue(this.defaultRange());
    // the picker sets start first and end second — reload once the range is complete (or cleared)
    this.range.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(({ start, end }) => {
      if (!!start === !!end) this.dashboard?.refresh();
    });

    const host: HTMLElement = inject(ElementRef).nativeElement;
    afterNextRender(() => {
      this.dashboard = mountInterimReportDashboard(host.shadowRoot, {
        load: (from, to) => this.loadPool(from, to),
        getRange: () => ({ from: this.range.value.start ?? null, to: this.range.value.end ?? null }),
        resetRange: () => this.range.setValue(this.defaultRange()),
      });
    });
  }

  ngOnChanges(): void {
    this.dashboard?.refresh();
  }

  /** opens (and Clear resets) on today only — the query covers 00:00 to 23:59:59.999 */
  private defaultRange(): { start: Date; end: Date } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return { start: today, end: new Date(today) };
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

    const [cross, evo, love, ask] = await Promise.all([
      this.latestByLog('interim crossover', ids),
      this.latestByLog('interim evolutionprogress', ids),
      this.latestByLog('love letter', ids),
      this.latestByLog('ask AH', ids),
    ]);
    return logs.docs.map((d, i) => this.toMember(d.id, d.data(),
      { cross: cross.get(d.id), evo: evo.get(d.id), love: love.get(d.id), ask: ask.get(d.id) }, i));
  }

  /** latest doc (by `created`) per interimlogid — `in` takes at most 30 values per query */
  private async latestByLog(collectionName: string, ids: string[]): Promise<Map<string, any>> {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const snaps = await Promise.all(chunks.map(chunk =>
      getDocs(query(collection(this.firestore, collectionName), where('interimlogid', 'in', chunk)))));
    const latest = new Map<string, any>();
    const millis = (t: any) => (t?.toMillis ? t.toMillis() : 0);
    snaps.forEach(snap => snap.docs.forEach(d => {
      const x = d.data();
      const prev = latest.get(x['interimlogid']);
      if (!prev || millis(x['created']) >= millis(prev['created'])) latest.set(x['interimlogid'], x);
    }));
    return latest;
  }

  private toMember(logId: string, log: any, docs: { cross?: any; evo?: any; love?: any; ask?: any }, i: number) {
    const profiles = () => this.profiles || {};
    const crossDoc = docs.cross, evoDoc = docs.evo;

    // love letter / ask AH tags — the same booleans the Love Letter / Ask A&H tabs toggle (read-only here)
    const tagsOf = (d: any) => ({
      happy: d['liked'] === true,
      attention: d['tagged'] === true,
      opportunity: d['opportunity'] === true,
      critical: d['critical'] === true,
      resolved: d['resolved'] === true,
      resolvedOn: (d['resolveddetails']?.['time']?.toDate?.() ?? null) as Date | null,
      get resolvedBy(): string | null {
        const id = d['resolveddetails']?.['user'];
        return id ? (profiles()[id]?.['name'] || '—') : null;
      },
    });
    const loveText = String(docs.love?.['loveletter'] ?? '').trim();
    const love = loveText ? { text: loveText, tags: tagsOf(docs.love) } : null;
    const ahText = String(docs.ask?.['askah'] ?? '').trim();
    const instText = String(docs.ask?.['installationaskah'] ?? '').trim();
    const asks = ahText || instText ? { ah: ahText || null, inst: instText || null, tags: tagsOf(docs.ask) } : null;
    const reports: string[] = Array.isArray(log['reports']) ? log['reports'] : [];
    const metric = crossDoc?.['metric'] || {};
    const cross: Record<string, number | null> = {};
    const goal: Record<string, string | null> = {};
    const jumped: Record<string, string | null> = {};   // metric[area].jumpedfrom — the goal before a level jump
    const levelChanges: { area: string; from: string; to: string }[] = [];

    CROSSOVER_AREAS.forEach(area => {
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
      journey: '—',
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
