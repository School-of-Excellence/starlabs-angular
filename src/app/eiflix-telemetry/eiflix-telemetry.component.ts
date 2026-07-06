import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthguardService } from '../authguard.service';

/**
 * EiFlix · Sessions & Timeline
 *
 * Reads the FLAT Firestore collection `telemetry_logs` (one document per log,
 * same field names as docs/TELEMETRY.md), then aggregates the rows in-memory
 * into users[] -> sessions[] -> logs[] for the timeline view.
 *
 * Each log carries a `profileid`. The display name is resolved from the
 * `map` (profileid/docId -> name) returned by BOTH AuthguardService maps:
 *   - getProfileMap()         (profile_data)
 *   - getProfileMapNewUser()  (profile_dataNewUser)
 */
@Component({
  selector: 'app-eiflix-telemetry',
  imports: [CommonModule, FormsModule],
  templateUrl: './eiflix-telemetry.component.html',
  styleUrl: './eiflix-telemetry.component.css'
})
export class EiflixTelemetryComponent implements OnInit {
  collectionName = 'telemetry_logs';

  loading = true;
  error = '';

  users: any[] = [];
  totalLogs = 0;
  totalSessions = 0;
  totalErrors = 0;

  // selection + filter state (mirrors the reference page's `S`)
  ui = 0;                       // selected user index
  query = '';                   // rail search text
  fType = 'all';                // type filter
  fLevel = 'all';               // level filter
  from: string | null = null;   // date range (YYYY-MM-DD, local)
  to: string | null = null;
  open = new Set<string>();     // expanded session ids

  mainVM: any = null;           // precomputed view-model for the selected user
  tzName = 'local';

  // profileid -> name, merged from both AuthguardService profile maps
  profileNameMap: { [id: string]: string } = {};

  // ----- overview dashboard (second tab) — reuses the SAME fetched logs -----
  tab: 'overview' | 'sessions' = 'overview';
  allLogs: any[] = [];          // flat telemetry_logs rows kept from load() (no re-query)
  ovWin = 30;                   // overview time window in days (0 = all time)
  ovPlat = 'all';               // overview platform filter
  ovVM: any = null;             // overview view-model
  ovIconSafe: { [k: string]: SafeHtml } = {};

  // ----- "Crashes & errors" table (search / filter / sort / paginate / expand) -----
  feedSearch = '';
  feedLevel: 'all' | 'error' | 'fatal' = 'all';
  feedSort: 'time' | 'user' | 'type' | 'screen' = 'time';
  feedDir: 'asc' | 'desc' = 'desc';
  feedPage = 0;
  feedPageSize = 8;
  feedExpanded = new Set<string>();
  feedVM: any = { rows: [], total: 0, pageCount: 1, page: 0, from: 0, to: 0 };
  private LV: { [k: string]: string } = { debug: '#5d6678', info: '#60a5fa', warning: '#fbbf24', error: '#f87171', fatal: '#ef4444' };

  typeChips = [
    { k: 'all', label: 'all', c: '' },
    { k: 'navigation', label: 'nav', c: 'var(--blue)' },
    { k: 'network', label: 'network', c: 'var(--violet)' },
    { k: 'event', label: 'event', c: 'var(--green)' },
    { k: 'error', label: 'error', c: 'var(--red)' },
  ];
  levelChips = [
    { k: 'all', label: 'all', c: '' },
    { k: 'info', label: 'info', c: 'var(--mid)' },
    { k: 'warning', label: 'warning', c: 'var(--amber)' },
    { k: 'error', label: 'error', c: 'var(--red)' },
    { k: 'fatal', label: 'fatal', c: 'var(--red-deep)' },
  ];

  // ---- Intl formatters (render in the viewer's local timezone) ----
  private DTF_date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  private DTF_dateShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  private DTF_time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  private DTF_timeSec = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

  // node icons keyed by log type
  private ICN: { [k: string]: string } = {
    navigation: '<rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 8h18M9 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    network: '<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 9.5a15 15 0 0 1 20 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="20" r="1.2" fill="currentColor"/>',
    netoff: '<path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3-2.2M16 10.8A10 10 0 0 1 19 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="20" r="1.2" fill="currentColor"/>',
    event: '<path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    error: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  // overview panel / kpi icons (inner SVG; wrapped + sanitized once in the constructor)
  private OVIC: { [k: string]: string } = {
    check: '<path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    crash: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    bug: '<path d="M9 3 8 5m7-2 1 2M5 9a7 7 0 0 1 14 0v5a7 7 0 1 1-14 0V9ZM2 13h3m14 0h3M4 8l2 2m14-2-2 2M5 18l2-1m12 1-2-1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    bolt: '<path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    wifi: '<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 9.5a15 15 0 0 1 20 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="20" r="1.2" fill="currentColor"/>',
    clock: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    users: '<circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 6m4.5 8.5a5 5 0 0 0-3.5-4.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 18l9 5 9-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    nav: '<rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 8h18M9 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    device: '<rect x="7" y="2" width="10" height="20" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M11 18h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    pkg: '<path d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2Zm0 0v9m0 0 8-4.5M12 11 4 6.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  };

  constructor(
    private firestore: Firestore,
    public auth: AuthguardService,
    private san: DomSanitizer,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    try {
      const p = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
        .formatToParts(new Date()).find(x => x.type === 'timeZoneName');
      this.tzName = p ? p.value : 'local';
    } catch { this.tzName = 'local'; }
    for (const k of Object.keys(this.OVIC)) {
      this.ovIconSafe[k] = this.san.bypassSecurityTrustHtml('<svg viewBox="0 0 24 24" fill="none">' + this.OVIC[k] + '</svg>');
    }
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.load();
    }
  }

  /** Selected user (used by the date-range inputs for min/max). */
  get selUser(): any { return this.users[this.ui]; }

  /** Rail list filtered by the search query (keeps each user's real index). */
  get railUsers(): any[] {
    const q = this.query.trim().toLowerCase();
    const out: any[] = [];
    this.users.forEach((u, idx) => {
      if (!q || (u.name + ' ' + u.deviceModel).toLowerCase().includes(q)) {
        out.push({ idx, name: u.name, initials: u.initials, sev: u.severity, deviceModel: u.deviceModel, sessionCount: u.sessionCount, totalLogs: u.totalLogs });
      }
    });
    return out;
  }

  // ========================== data loading ==========================

  async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      // 1) profileid -> name, from BOTH profile maps
      const [pMap, nMap] = await Promise.all([
        this.auth.getProfileMap().catch(() => null),
        this.auth.getProfileMapNewUser().catch(() => null),
      ]);
      this.profileNameMap = Object.assign({}, (nMap && nMap.map) || {}, (pMap && pMap.map) || {});

      // 2) read the flat telemetry_logs collection
      const snap = await getDocs(collection(this.firestore, this.collectionName));
      const logs: any[] = [];
      snap.forEach(d => {
        const raw: any = d.data() || {};
        const client = this.toIso(raw.clientTimestamp) || this.toIso(raw.serverTimestamp);
        if (!client) return; // skip rows with no usable timestamp
        logs.push(Object.assign({}, raw, {
          id: raw.id || d.id,
          clientTimestamp: client,
          serverTimestamp: this.toIso(raw.serverTimestamp) || client,
        }));
      });

      this.allLogs = logs;
      this.buildUsers(logs);
      this.boot();
      this.computeOverview();
    } catch (e: any) {
      console.error('telemetry load error', e);
      this.error = 'Could not load ' + this.collectionName + ' — ' + (e && e.message ? e.message : e);
      this.users = [];
      this.mainVM = null;
      this.allLogs = [];
      this.ovVM = null;
    } finally {
      this.loading = false;
    }
  }

  reload(): void { this.load(); }

  // ========================== overview dashboard (2nd tab) ==========================

  /** Overview view-model, or null when not ready / nothing in range. */
  get ovView(): any { return (this.ovVM && !this.ovVM.empty) ? this.ovVM : null; }

  setTab(t: 'overview' | 'sessions'): void { this.tab = t; }
  setOvWin(n: number): void { this.ovWin = n; this.computeOverview(); }
  setOvPlat(p: string): void { this.ovPlat = p; this.computeOverview(); }

  // ----- crashes & errors table: search / filter / sort / paginate / expand -----
  applyFeed(): void {
    const all: any[] = (this.ovVM && this.ovVM.errors) ? this.ovVM.errors : [];
    const q = this.feedSearch.trim().toLowerCase();
    let rows = all.filter(r =>
      (this.feedLevel === 'all' || r.level === this.feedLevel) &&
      (!q || (r.msg + ' ' + r.errorType + ' ' + r.name + ' ' + r.route).toLowerCase().includes(q))
    );
    const key = this.feedSort, dir = this.feedDir === 'asc' ? 1 : -1;
    rows = rows.slice().sort((a, b) => {
      let av: any, bv: any;
      if (key === 'time') { av = a.ts; bv = b.ts; }
      else if (key === 'user') { av = a.name; bv = b.name; }
      else if (key === 'type') { av = a.errorType; bv = b.errorType; }
      else { av = a.route; bv = b.route; }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / this.feedPageSize));
    if (this.feedPage >= pageCount) this.feedPage = pageCount - 1;
    if (this.feedPage < 0) this.feedPage = 0;
    const startIdx = this.feedPage * this.feedPageSize;
    this.feedVM = {
      rows: rows.slice(startIdx, startIdx + this.feedPageSize),
      total, pageCount, page: this.feedPage,
      from: total ? startIdx + 1 : 0,
      to: Math.min(startIdx + this.feedPageSize, total),
    };
  }
  onFeedSearch(): void { this.feedPage = 0; this.applyFeed(); }
  setFeedLevel(lv: 'all' | 'error' | 'fatal'): void { this.feedLevel = lv; this.feedPage = 0; this.applyFeed(); }
  setFeedSort(key: 'time' | 'user' | 'type' | 'screen'): void {
    if (this.feedSort === key) this.feedDir = this.feedDir === 'asc' ? 'desc' : 'asc';
    else { this.feedSort = key; this.feedDir = key === 'time' ? 'desc' : 'asc'; }
    this.feedPage = 0; this.applyFeed();
  }
  feedPrev(): void { if (this.feedPage > 0) { this.feedPage--; this.applyFeed(); } }
  feedNext(): void { if (this.feedPage < this.feedVM.pageCount - 1) { this.feedPage++; this.applyFeed(); } }
  toggleFeedRow(id: string): void { if (this.feedExpanded.has(id)) this.feedExpanded.delete(id); else this.feedExpanded.add(id); }

  private ovAvg(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  private ovPctl(a: number[], p: number): number { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; }
  private TYC(t: string): string { return ({ navigation: '#60a5fa', network: '#a78bfa', event: '#34d399', error: '#f87171' } as any)[t] || '#9aa3b7'; }
  private relAgo(t: number): string { const s = Math.round((Date.now() - t) / 1000); if (s < 60) return s + 's ago'; const m = Math.floor(s / 60); if (m < 60) return m + 'm ago'; const h = Math.floor(m / 60); if (h < 24) return h + 'h ago'; return Math.floor(h / 24) + 'd ago'; }

  private donutSegs(items: any[]): any {
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const r = 54, c = 2 * Math.PI * r; let off = 0;
    const segs = items.map(i => {
      const len = i.value / total * c;
      const seg = { label: i.label, value: i.value, color: i.color, dash: len + ' ' + (c - len), offset: -off, pct: Math.round(i.value / total * 100) };
      off += len; return seg;
    });
    return { segs };
  }

  /** Build the overview dashboard from the SAME logs fetched in load() — no re-query. */
  computeOverview(): void {
    const now = Date.now();
    const cut = this.ovWin ? now - this.ovWin * 86400000 : 0;
    const L = this.allLogs.filter(l => this.ms(l.clientTimestamp) >= cut && (this.ovPlat === 'all' || l.platform === this.ovPlat));
    if (!L.length) { this.ovVM = { empty: true }; return; }

    const sessions = new Set<string>(), users = new Set<string>(), crashSess = new Set<string>();
    const byLevel: any = {}, byType: any = {};
    const loads: number[] = [], lats: number[] = []; let slow = 0, offline = 0;
    const codes: any = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, none: 0 };
    const days: any = {}, sigs: any = {}, screenLoad: any = {}, screenViews: any = {};
    const platUsers: any = { android: new Set(), ios: new Set() };
    const verUsers: any = {}, devUsers: any = {};

    for (const l of L) {
      sessions.add(l.sessionId); users.add(l.userId);
      byLevel[l.level] = (byLevel[l.level] || 0) + 1;
      byType[l.type] = (byType[l.type] || 0) + 1;
      if (l.level === 'fatal') crashSess.add(l.sessionId);
      const md = l.metadata || {};
      if (md.loadSeconds != null) loads.push(md.loadSeconds);
      const dk = this.localDateKey(l.clientTimestamp);
      const d = days[dk] = days[dk] || { info: 0, warning: 0, error: 0, fatal: 0, debug: 0 };
      d[l.level] = (d[l.level] || 0) + 1;

      if (l.type === 'navigation') {
        const sc = md.screenName || l.currentRoute;
        if (sc) { screenViews[sc] = (screenViews[sc] || 0) + 1; if (md.loadSeconds != null) (screenLoad[sc] = screenLoad[sc] || []).push(md.loadSeconds); }
      }
      if (l.type === 'network') {
        if (md.event === 'connectivity_change') { if (md.online === false) offline++; }
        else {
          if (md.slow) slow++;
          if (md.latencyMs != null) lats.push(md.latencyMs);
          const sc = md.statusCode;
          if (sc == null) codes.none++; else if (sc < 300) codes['2xx']++; else if (sc < 400) codes['3xx']++; else if (sc < 500) codes['4xx']++; else codes['5xx']++;
        }
      }
      if (l.level === 'error' || l.level === 'fatal') {
        const key = (l.errorType || 'Error') + ' · ' + (l.message || '').replace(/^FATAL · /, '').slice(0, 64);
        const g = sigs[key] = sigs[key] || { errorType: l.errorType || 'Error', msg: (l.message || '').replace(/^FATAL · /, ''), count: 0, users: new Set(), last: 0, fatal: false };
        g.count++; g.users.add(l.userId); g.last = Math.max(g.last, this.ms(l.clientTimestamp)); if (l.level === 'fatal') g.fatal = true;
      }
      if (platUsers[l.platform]) platUsers[l.platform].add(l.userId);
      (verUsers[l.appVersion] = verUsers[l.appVersion] || new Set()).add(l.userId);
      (devUsers[l.deviceModel] = devUsers[l.deviceModel] || new Set()).add(l.userId);
    }

    const total = L.length;
    const crashes = byLevel.fatal || 0, errors = byLevel.error || 0, warnings = byLevel.warning || 0;
    const crashFree = sessions.size ? Math.round((1 - crashSess.size / sessions.size) * 1000) / 10 : 100;
    const avgLoad = Math.round(this.ovAvg(loads) * 100) / 100;
    const p95lat = Math.round(this.ovPctl(lats, 0.95));
    const avgLat = Math.round(this.ovAvg(lats));
    const crashUsers = new Set(L.filter(l => l.level === 'fatal').map(l => l.userId)).size;

    // activity timeline (stacked by severity)
    const order = ['info', 'warning', 'error', 'fatal'];
    const dayKeys = Object.keys(days).sort();
    const tlMax = Math.max(1, ...dayKeys.map(k => order.reduce((s, lv) => s + (days[k][lv] || 0), 0)));
    const step = Math.max(1, Math.ceil(dayKeys.length / 8));
    const tlCols = dayKeys.map((k, i) => {
      const d = days[k]; const tot = order.reduce((s, lv) => s + (d[lv] || 0), 0);
      const segs = order.filter(lv => d[lv]).map(lv => ({ color: this.LV[lv], h: d[lv] / tlMax * 100 }));
      return { segs, title: this.dateShort(k) + ' — ' + tot + ' logs · ' + (d.error || 0) + ' err · ' + (d.fatal || 0) + ' fatal', label: i % step === 0 ? this.dateShort(k) : '' };
    });

    const typeDonut = this.donutSegs(['navigation', 'network', 'event', 'error'].map(t => ({ label: t, value: byType[t] || 0, color: this.TYC(t) })));

    const sigList = (Object.values(sigs) as any[]).sort((a, b) => b.count - a.count).slice(0, 6)
      .map(g => ({ errorType: g.errorType, msg: g.msg, count: g.count, users: g.users.size, last: g.last ? this.relAgo(g.last) : '—', fatal: g.fatal }));

    const slowScreens: any[] = Object.keys(screenLoad).map(sc => {
      const arr = screenLoad[sc]; const p95 = this.ovPctl(arr, 0.95);
      return { label: sc, p95, disp: (Math.round(p95 * 100) / 100) + 's', sub: 'avg ' + (Math.round(this.ovAvg(arr) * 100) / 100) + 's · ' + arr.length + ' samples', color: p95 >= 3 ? 'var(--red)' : p95 >= 1.5 ? 'var(--amber)' : 'var(--green)', pct: 0 };
    }).sort((a, b) => b.p95 - a.p95).slice(0, 6);
    const slowMax = Math.max(1, ...slowScreens.map(s => s.p95));
    slowScreens.forEach(s => s.pct = Math.max(3, s.p95 / slowMax * 100));

    const codeTotal = (Object.values(codes) as number[]).reduce((s, x) => s + x, 0) || 1;
    const codeColors: any = { '2xx': 'var(--green)', '3xx': 'var(--blue)', '4xx': 'var(--amber)', '5xx': 'var(--red)', none: 'var(--red-deep)' };
    const codeRows = Object.keys(codes).map(k => ({ k, v: codes[k], pct: codes[k] / codeTotal * 100, color: codeColors[k] }));

    const svMax = Math.max(1, ...(Object.values(screenViews) as number[]));
    const topScreens = Object.keys(screenViews).map(sc => ({ label: sc, value: screenViews[sc], pct: Math.max(3, screenViews[sc] / svMax * 100) })).sort((a, b) => b.value - a.value).slice(0, 7);

    const platDonut = this.donutSegs([{ label: 'android', value: platUsers.android.size, color: '#3ddc84' }, { label: 'ios', value: platUsers.ios.size, color: '#dfe3ea' }]);
    const verMax = Math.max(1, ...(Object.values(verUsers) as any[]).map(s => s.size));
    const verItems = Object.keys(verUsers).map(v => ({ label: 'v' + v, value: verUsers[v].size, disp: verUsers[v].size + ' users', pct: Math.max(3, verUsers[v].size / verMax * 100) })).sort((a, b) => b.value - a.value);
    const devMax = Math.max(1, ...(Object.values(devUsers) as any[]).map(s => s.size));
    const devItems = Object.keys(devUsers).map(dv => ({ label: dv, value: devUsers[dv].size, disp: devUsers[dv].size + ' users', pct: Math.max(3, devUsers[dv].size / devMax * 100) })).sort((a, b) => b.value - a.value).slice(0, 6);

    const errorRows = L.filter(l => l.level === 'error' || l.level === 'fatal').sort((a, b) => this.ms(b.clientTimestamp) - this.ms(a.clientTimestamp)).map(l => {
      const name = this.profileNameMap[l.profileid] || ('UID ' + String(l.userId || '').slice(0, 6));
      return {
        id: l.id, ts: this.ms(l.clientTimestamp), time: this.fmtClock(l.clientTimestamp),
        date: this.dateShort(this.localDateKey(l.clientTimestamp)), rel: this.relAgo(this.ms(l.clientTimestamp)),
        name, initials: this.initials(name), platform: l.platform || '', level: l.level, fatal: l.level === 'fatal',
        errorType: l.errorType || l.level, route: l.currentRoute || '—', msg: (l.message || '').replace(/^FATAL · /, ''),
        stackTrace: l.stackTrace || '', source: (l.metadata && l.metadata.source) || '', sessionId: l.sessionId || '',
      };
    });

    const kpis = [
      { accent: 'var(--green)', icon: 'check', label: 'Crash-free sessions', value: crashFree + '%', vclass: crashFree >= 99 ? 'good' : crashFree >= 95 ? 'warn' : 'bad', sub: crashSess.size + ' of ' + sessions.size + ' crashed' },
      { accent: 'var(--red-deep)', icon: 'crash', label: 'Crashes (fatal)', value: crashes, vclass: crashes ? 'bad' : 'good', sub: 'across ' + crashUsers + ' users' },
      { accent: 'var(--red)', icon: 'bug', label: 'Errors', value: errors, vclass: errors ? 'bad' : 'good', sub: (total ? Math.round(errors / total * 1000) / 10 : 0) + '% of logs' },
      { accent: 'var(--amber)', icon: 'bolt', label: 'Warnings', value: warnings, vclass: warnings ? 'warn' : 'good', sub: 'incl. ' + slow + ' slow · ' + offline + ' offline' },
      { accent: 'var(--violet)', icon: 'wifi', label: 'Slow requests', value: slow, vclass: slow ? 'warn' : 'good', sub: '≥2.5s · p95 ' + p95lat + 'ms' },
      { accent: 'var(--blue)', icon: 'clock', label: 'Avg screen load', value: avgLoad + 's', vclass: avgLoad >= 2 ? 'bad' : avgLoad >= 1 ? 'warn' : 'good', sub: 'p95 network ' + p95lat + 'ms' },
      { accent: 'var(--signal)', icon: 'users', label: 'Active users', value: users.size, vclass: 'sig', sub: sessions.size + ' sessions' },
      { accent: '#7c8aff', icon: 'layers', label: 'Total logs', value: total.toLocaleString(), vclass: 'hi', sub: 'nav ' + (byType.navigation || 0) + ' · net ' + (byType.network || 0) },
    ];

    this.ovVM = {
      empty: false, kpis, totalDisp: total.toLocaleString(), users: users.size,
      netCount: byType.network || 0,
      slowRate: byType.network ? Math.round(slow / byType.network * 1000) / 10 : 0,
      p95lat, p95Class: p95lat >= 3000 ? 'bad' : p95lat >= 1500 ? 'warn' : 'good', avgLat, offline,
      tlCols, tlMax, typeDonut, sigList, slowScreens, codeRows, topScreens, platDonut, verItems, devItems, errors: errorRows,
    };
    this.feedPage = 0;
    this.feedExpanded.clear();
    this.applyFeed();
  }

  /** Group flat log rows into users[] -> sessions[] -> logs[]. */
  private buildUsers(logs: any[]): void {
    const byUser: { [uid: string]: any } = {};

    for (const l of logs) {
      const uid = l.userId || l.profileid || 'unknown';
      let u = byUser[uid];
      if (!u) {
        u = byUser[uid] = {
          userId: uid, profileid: l.profileid || '', platform: l.platform || '',
          deviceModel: l.deviceModel || '', appVersion: l.appVersion || '', environment: l.environment || '',
          _sessions: {} as { [sid: string]: any[] }, _logs: [] as any[],
        };
      }
      // keep the most recent non-empty descriptors
      if (l.profileid) u.profileid = l.profileid;
      if (l.deviceModel) u.deviceModel = l.deviceModel;
      if (l.appVersion) u.appVersion = l.appVersion;
      if (l.environment) u.environment = l.environment;
      if (l.platform) u.platform = l.platform;

      const sid = l.sessionId || '—';
      (u._sessions[sid] = u._sessions[sid] || []).push(l);
      u._logs.push(l);
    }

    const users = Object.keys(byUser).map(uid => {
      const u = byUser[uid];

      const sessions = Object.keys(u._sessions).map(sid => {
        const slogs = (u._sessions[sid] as any[]).slice()
          .sort((a, b) => this.ms(a.clientTimestamp) - this.ms(b.clientTimestamp));
        const t = slogs.map((x: any) => this.ms(x.clientTimestamp));
        return {
          sessionId: sid, logs: slogs,
          start: Math.min(...t), end: Math.max(...t),
          severity: this.severityOf(slogs),
        };
      }).sort((a, b) => b.start - a.start); // most-recent session first

      const times = (u._logs as any[]).map((x: any) => this.ms(x.clientTimestamp));
      const name = this.profileNameMap[u.profileid] || '';
      const displayName = name || ('UID ' + String(u.userId).slice(0, 6));

      return {
        userId: u.userId, profileid: u.profileid, platform: u.platform,
        deviceModel: u.deviceModel, appVersion: u.appVersion, environment: u.environment,
        sessions, sessionCount: sessions.length, totalLogs: u._logs.length, logs: u._logs,
        severity: this.severityOf(u._logs),
        name: displayName,
        initials: this.initials(name || displayName),
        dateMin: this.localDateKey(Math.min(...times)),
        dateMax: this.localDateKey(Math.max(...times)),
        lastActivity: Math.max(...times),
      };
    }).sort((a, b) => b.lastActivity - a.lastActivity); // most recently active user first

    this.users = users;
    this.totalLogs = logs.length;
    this.totalSessions = users.reduce((n, u) => n + u.sessionCount, 0);
    this.totalErrors = logs.filter(l => l.level === 'error' || l.level === 'fatal').length;
  }

  private boot(): void {
    if (!this.users.length) { this.mainVM = null; return; }
    let idx = this.users.findIndex(u => u.logs.some((l: any) => l.level === 'fatal'));
    if (idx < 0) idx = 0;
    this.selectUser(idx);
  }

  // ========================== interactions ==========================

  selectUser(idx: number): void {
    this.ui = idx;
    const u = this.users[idx];
    if (!u) { this.mainVM = null; return; }
    this.from = u.dateMin;
    this.to = u.dateMax;
    this.fType = 'all';
    this.fLevel = 'all';
    this.open = new Set<string>();
    if (u.sessions[0]) this.open.add(u.sessions[0].sessionId); // expand latest
    this.recomputeMain();
  }

  toggleSession(id: string): void {
    if (this.open.has(id)) this.open.delete(id); else this.open.add(id);
    this.recomputeMain();
  }

  setType(k: string): void { this.fType = k; this.recomputeMain(); }
  setLevel(k: string): void { this.fLevel = k; this.recomputeMain(); }

  resetDates(): void {
    const u = this.users[this.ui];
    if (u) { this.from = u.dateMin; this.to = u.dateMax; }
    this.recomputeMain();
  }

  // ========================== main view-model ==========================

  recomputeMain(): void {
    const u = this.users[this.ui];
    if (!u) { this.mainVM = null; return; }

    const logs: any[] = u.logs;
    const byLevel: any = {};
    for (const l of logs) byLevel[l.level] = (byLevel[l.level] || 0) + 1;
    const errors = byLevel.error || 0, fatals = byLevel.fatal || 0, warns = byLevel.warning || 0;
    const sev = (fatals || errors) ? 'err' : warns ? 'warn' : 'ok';
    const sevText = fatals ? 'has crashes' : errors ? 'has errors' : warns ? 'warnings' : 'healthy';

    const recentSess = u.sessions[0];
    const dmLog = recentSess ? recentSess.logs[recentSess.logs.length - 1] : logs[0];
    const dm = (dmLog && dmLog.deviceMetadata) || {};

    const from = this.from, to = this.to;
    const inRange = (l: any) => { const k = this.localDateKey(l.clientTimestamp); return (!from || k >= from) && (!to || k <= to); };

    const shownLogs = logs.filter(inRange);
    const tC: any = { all: shownLogs.length };
    const lC: any = { all: shownLogs.length };
    ['navigation', 'network', 'event', 'error'].forEach(t => tC[t] = shownLogs.filter((l: any) => l.type === t).length);
    ['info', 'warning', 'error', 'fatal'].forEach(t => lC[t] = shownLogs.filter((l: any) => l.level === t).length);

    const sessions = u.sessions.filter((s: any) => s.logs.some(inRange)).map((s: any) => this.sessionVM(s));

    this.mainVM = {
      name: u.name || String(u.userId).slice(0, 10),
      initials: u.initials,
      sev, sevText,
      device: dm.marketingName || u.deviceModel,
      os: dmLog ? dmLog.osVersion : '',
      appVersion: u.appVersion,
      profileid: u.profileid,
      environment: u.environment,
      platform: u.platform,
      sessionCount: u.sessionCount,
      totalLogs: u.totalLogs,
      activeFrom: this.dateShort(u.dateMin),
      activeTo: this.dateShort(u.dateMax),
      errors, fatals,
      errCls: fatals ? 'bad' : errors ? 'warn' : 'good',
      networkVal: dm.networkQuality || (dmLog ? dmLog.networkType : '') || '—',
      networkCls: (dm.networkQuality === 'poor' || dm.networkQuality === 'fair') ? 'warn' : 'good',
      locale: dm.locale || '—',
      tC, lC,
      sessions,
      tznote: `${sessions.length} session${sessions.length === 1 ? '' : 's'} in range · most recent first · times in your local timezone (${this.tzName})`,
    };
  }

  private sessionVM(s: any): any {
    const start = s.start, end = s.end;
    const sev = s.severity;
    const sevText = sev === 'err'
      ? (s.logs.some((l: any) => l.level === 'fatal') ? 'crashed' : 'errors')
      : sev === 'warn' ? 'warnings' : 'healthy';

    const dateLabel = this.fmtDate(start);
    const rng = this.sameDay(start, end)
      ? `${dateLabel} · ${this.fmtTime(start)} → ${this.fmtTime(end)}`
      : `${this.fmtDate(start)} ${this.fmtTime(start)} → ${this.fmtDate(end)} ${this.fmtTime(end)}`;

    const path = this.journey(s.logs);
    const byType: any = {};
    for (const l of s.logs) byType[l.type] = (byType[l.type] || 0) + 1;
    const open = this.open.has(s.sessionId);

    const crumbs = path.map((name, i) => ({ text: name, origin: i === 0, last: i === path.length - 1 }));

    const vis = open
      ? s.logs.filter((l: any) => (this.fType === 'all' || l.type === this.fType) && (this.fLevel === 'all' || l.level === this.fLevel))
      : [];
    const steps = vis.map((l: any, i: number) => this.stepVM(l, i, vis.length - 1, start));

    return {
      sessionId: s.sessionId, open, rng,
      dur: this.fmtDur(end - start),
      sev, sevText,
      screens: path.length,
      logsCount: s.logs.length,
      dots: { nav: byType.navigation || 0, net: byType.network || 0, evt: byType.event || 0, err: byType.error || 0 },
      crumbs, steps,
    };
  }

  private stepVM(l: any, i: number, lastIdx: number, startMs: number): any {
    return {
      last: i === lastIdx,
      abs: this.fmtClock(l.clientTimestamp),
      rel: this.relStr(this.ms(l.clientTimestamp) - startMs),
      level: l.level,
      type: l.type,
      cardCls: l.level === 'fatal' ? 'fatal' : l.level === 'error' ? 'error' : '',
      title: l.message || l.type,
      iconHtml: this.nodeIconHtml(l),
      chips: this.chipsFor(l),
      stackTrace: l.stackTrace || '',
    };
  }

  // ========================== derived helpers ==========================

  private journey(logs: any[]): string[] {
    const sorted = logs.slice().sort((a, b) => this.ms(a.clientTimestamp) - this.ms(b.clientTimestamp));
    const p: string[] = [];
    for (const l of sorted) {
      const r = (l.type === 'navigation' && l.metadata && l.metadata.screenName) ? l.metadata.screenName : l.currentRoute;
      if (r && p[p.length - 1] !== r) p.push(r);
    }
    return p;
  }

  private severityOf(logs: any[]): string {
    let w = 'ok';
    for (const l of logs) {
      if (l.level === 'fatal' || l.level === 'error') return 'err';
      if (l.level === 'warning') w = 'warn';
    }
    return w;
  }

  private chipsFor(l: any): { cls: string; text: string; clock?: boolean }[] {
    const md = l.metadata || {};
    const out: { cls: string; text: string; clock?: boolean }[] = [];
    if (l.type === 'navigation') {
      let sec = md.loadSeconds;
      if (sec == null) { const m = (l.message || '').match(/\(([\d.]+)s\)/); if (m) sec = parseFloat(m[1]); }
      if (sec != null) out.push({ cls: this.loadSecClass(sec), text: `${Number(sec).toFixed(2)}s load`, clock: true });
      if (md.action) out.push({ cls: '', text: md.action });
      if (md.previousScreen) out.push({ cls: '', text: `from ${md.previousScreen}` });
    } else if (l.type === 'network') {
      if (md.event === 'connectivity_change') {
        out.push({ cls: md.online ? 'good' : 'bad', text: `${md.from} → ${md.to}` });
        out.push({ cls: md.online ? 'good' : 'bad', text: md.online ? 'online' : 'offline' });
      } else {
        if (md.method) out.push({ cls: 'vio', text: md.method });
        if (md.statusCode != null) out.push({ cls: md.statusCode >= 500 ? 'bad' : md.statusCode >= 400 ? 'warn' : 'good', text: String(md.statusCode) });
        else out.push({ cls: 'bad', text: 'no response' });
        if (md.latencyMs != null) out.push({ cls: this.latClass(md.latencyMs), text: `${md.latencyMs}ms` });
        if (md.slow) out.push({ cls: 'warn', text: 'SLOW' });
      }
    } else if (l.type === 'event') {
      if (md.query != null) out.push({ cls: '', text: `"${md.query}"` });
      if (md.results != null) out.push({ cls: '', text: `${md.results} results` });
      if (md.theme) out.push({ cls: '', text: `theme: ${md.theme}` });
      if (md.step) out.push({ cls: '', text: `step ${md.step}` });
      if (md.seriesId) out.push({ cls: '', text: `series ${String(md.seriesId).slice(0, 6)}…` });
      if (md.episodeId) out.push({ cls: '', text: `ep ${String(md.episodeId).slice(0, 6)}…` });
    } else if (l.type === 'error') {
      if (l.errorType) out.push({ cls: 'bad', text: l.errorType });
      if (md.source) out.push({ cls: '', text: md.source });
    }
    if (!(l.type === 'network' && md.event === 'connectivity_change') && l.networkType)
      out.push({ cls: l.networkType === 'none' ? 'bad' : 'info', text: l.networkType === 'none' ? 'offline' : l.networkType });
    return out;
  }

  private nodeIconHtml(l: any): SafeHtml {
    let inner: string;
    if (l.type === 'network') {
      const md = l.metadata || {};
      inner = md.online === false ? this.ICN['netoff'] : this.ICN['network'];
    } else {
      inner = this.ICN[l.type] || this.ICN['event'];
    }
    return this.san.bypassSecurityTrustHtml(`<svg viewBox="0 0 24 24" fill="none">${inner}</svg>`);
  }

  // ---- time / formatting helpers (ported from the reference page) ----
  private ms(s: any): number { return new Date(s).getTime(); }
  private fmtDate(x: any): string { return this.DTF_date.format(new Date(x)); }
  private fmtTime(x: any): string { return this.DTF_time.format(new Date(x)); }
  private fmtClock(x: any): string { return this.DTF_timeSec.format(new Date(x)); }
  private dateShort(key: string): string { return this.DTF_dateShort.format(new Date(key)); }
  private sameDay(a: any, b: any): boolean {
    const x = new Date(a), y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }
  private pad(n: number): string { return String(n).padStart(2, '0'); }
  private relStr(msDiff: number): string {
    const s = Math.max(0, Math.round(msDiff / 1000));
    return s < 60 ? `+0:${this.pad(s)}` : `+${Math.floor(s / 60)}:${this.pad(s % 60)}`;
  }
  private fmtDur(msDiff: number): string {
    const s = Math.round(msDiff / 1000);
    return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`
      : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  }
  private localDateKey(x: any): string {
    const d = new Date(x);
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  }
  private initials(s: string): string {
    if (!s) return '··';
    const m = s.match(/User\s*(\d+)/i);
    if (m) return 'U' + m[1];
    const parts = s.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }
  private loadSecClass(sec: number): string { return sec >= 3 ? 'bad' : sec >= 1 ? 'warn' : 'good'; }
  private latClass(msV: number): string { return msV >= 2000 ? 'bad' : msV >= 800 ? 'warn' : 'good'; }

  /** Normalise a Firestore Timestamp / Date / epoch / ISO string to an ISO string. */
  private toIso(v: any): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') { const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toISOString(); }
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
    if (typeof v.toDate === 'function') { try { return v.toDate().toISOString(); } catch { /* ignore */ } }
    if (typeof v.seconds === 'number') {
      return new Date(v.seconds * 1000 + (v.nanoseconds ? v.nanoseconds / 1e6 : 0)).toISOString();
    }
    return '';
  }
}
