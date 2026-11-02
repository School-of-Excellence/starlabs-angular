import { Component, HostListener, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { A11yModule } from '@angular/cdk/a11y';
import { CommunicationSendersService } from '../workshop-dashboard/communication/communication-senders.service';
import { Firestore, Timestamp, collection, getDocs, query, where } from '@angular/fire/firestore';
import {
  ED2_FREE_JOURNEY, ED2_NO_JOURNEY, ED2_STATUSES, Ed2Activity, Ed2Dim, Ed2Filter, Ed2JourneyRow, Ed2Person, Ed2SortKey, Ed2Status, Ed2StatusFilter,
  Ed2Totals, ed2Activity, ed2ByStatus, ed2Csv, ed2Duration, ed2FreeUsers, ed2LeftOut, ed2PaidIds, ed2JourneyName, ed2Journeys, ed2Matches, ed2MonthRange, ed2Options,
  ed2People, ed2Recipients, ed2Slices, ed2SortOptions, ed2SourceLabel, ed2StatusLabel, ed2Totals,
} from './engagementdashboardv2.model';

/** Which people the side panel lists. */
type PanelShow = 'engaged' | 'notEngaged' | 'all';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Engagement dashboard v2 (operator 2026-11-02). First section: CONTENT engagement, month by month.
 * Population = `participant metadata` where customerstatus is 'active' or 'non active' (read once).
 * A person is engaged in the chosen month when their profileid has a `content analytics` doc whose
 * logdate falls inside it. Grouped by journey (activejourney, else lastcompletedjourney).
 */
@Component({
  selector: 'app-engagementdashboardv2',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, A11yModule],
  templateUrl: './engagementdashboardv2.component.html',
  styleUrl: './engagementdashboardv2.component.css',
})
export class Engagementdashboardv2Component implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  /** The workshop dashboard's Email / WhatsApp / Notification send paths (operator 2026-11-03). */
  private senders = inject(CommunicationSendersService);
  private dialog = inject(MatDialog);

  readonly months = MONTHS;
  readonly statuses = ED2_STATUSES;
  readonly noJourney = ED2_NO_JOURNEY;
  readonly freeJourney = ED2_FREE_JOURNEY;
  readonly statusLabel = ed2StatusLabel;
  readonly duration = ed2Duration;

  // ── Month ──
  year = new Date().getFullYear();
  month = new Date().getMonth();
  pickerOpen = false;
  pickerYear = this.year;

  // ── Data ──
  /** Population + journey names: read once for the whole dashboard. */
  private base: Promise<void> | null = null;
  private metas: { id: string; data: any }[] = [];
  /** `new_user_data` people not moved to existing — the free users (operator 2026-11-03). */
  private nuds: { id: string; data: any }[] = [];
  /** The paid population's profileids: someone in both lists counts once, as paid. */
  private paidIds = new Set<string>();
  journeyNames = new Map<string, string>();
  /** Per-month activity, kept so going back to a month is instant. */
  private activityByMonth = new Map<string, Ed2Activity>();
  /** The month on screen. */
  private activity: Ed2Activity | null = null;
  /**
   * Set for a PAST month: status then comes from each person's subscription dates (operator 2026-11-03);
   * null for the current month, which uses the live customerstatus.
   */
  private pastMonth: { start: Date; end: Date } | null = null;
  /** Past month only: people who could not be placed in it (not customers yet / no dates). */
  leftOut: { notYet: number; undated: number } | null = null;
  private token = 0;
  private destroyed = false;

  /** First load (nothing to show yet). */
  loading = true;
  /** A later month change — the current figures stay up under a thin progress line. */
  refreshing = false;
  error = '';

  people: Ed2Person[] = [];
  statusFilter: Ed2StatusFilter = 'all';
  shown: Ed2Person[] = [];
  totals: Ed2Totals = ed2Totals([]);
  journeys: Ed2JourneyRow[] = [];
  sortKey: Ed2SortKey = 'total';
  sortDir: 'asc' | 'desc' = 'desc';

  // ── Source filters (From, Platform), operator 2026-11-03 — nothing picked = every value ──
  menuOpen: Ed2Dim | null = null;
  filter: Ed2Filter = { from: [], platform: [] };
  options: Record<Ed2Dim, { key: string; label: string }[]> = { from: [], platform: [] };
  /** Every spelling seen in any month loaded, so a picked value keeps its label in a month without it. */
  private knownLabels: Record<Ed2Dim, Map<string, string>> = { from: new Map(), platform: new Map() };

  // ── Side panel ──
  panelOpen = false;
  panelJourney: string | null = null;
  panelShow: PanelShow = 'engaged';
  panelSearch = '';
  panelList: Ed2Person[] = [];
  /** Panel rows opened to show their sources. */
  expanded = new Set<string>();
  /** How many of the people listed each channel can reach (the Communication dialog's counts). */
  panelWithEmail = 0;
  panelWithPhone = 0;

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.token++;
  }

  // ───────────────────────── Month ─────────────────────────

  get monthLabel(): string {
    return `${new Date(this.year, this.month, 1).toLocaleString('en-US', { month: 'long' })} ${this.year}`;
  }
  get isCurrentMonth(): boolean {
    const now = new Date();
    return this.year === now.getFullYear() && this.month === now.getMonth();
  }
  /** No month after the current one. */
  isFuture(year: number, month: number): boolean {
    const now = new Date();
    return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());
  }
  get canNextYear(): boolean { return this.pickerYear < new Date().getFullYear(); }

  shiftMonth(by: number): void {
    const d = new Date(this.year, this.month + by, 1);
    if (this.isFuture(d.getFullYear(), d.getMonth())) return;
    this.setMonth(d.getFullYear(), d.getMonth());
  }
  togglePicker(): void {
    this.pickerYear = this.year;
    this.pickerOpen = !this.pickerOpen;
    this.menuOpen = null;
  }
  pickMonth(month: number): void {
    if (this.isFuture(this.pickerYear, month)) return;
    this.pickerOpen = false;
    this.setMonth(this.pickerYear, month);
  }
  private setMonth(year: number, month: number): void {
    if (year === this.year && month === this.month) return;
    this.year = year;
    this.month = month;
    void this.load();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event?: KeyboardEvent): void {
    // A composer (or anything else in a dialog) owns Escape while it is open — never close the panel
    // underneath it, which would also pull keyboard focus out of the open dialog.
    if (event?.defaultPrevented || this.dialog.openDialogs.length) return;
    if (this.pickerOpen) this.pickerOpen = false;
    else if (this.menuOpen) this.menuOpen = null;
    else if (this.panelOpen) this.closePanel();
  }

  // ───────────────────────── Loading ─────────────────────────

  async load(): Promise<void> {
    const token = ++this.token;
    const key = `${this.year}-${this.month}`;
    this.error = '';
    if (this.people.length) this.refreshing = true;
    else this.loading = true;
    try {
      const [, activity] = await Promise.all([this.loadBase(), this.loadActivity(key)]);
      if (token !== this.token || this.destroyed) return;
      this.zone.run(() => {
        this.activity = activity;
        this.pastMonth = this.isCurrentMonth ? null : ed2MonthRange(this.year, this.month);
        this.setOptions();
        this.buildPeople(activity);
        this.loading = false;
        this.refreshing = false;
        this.recompute();
      });
    } catch (err) {
      console.error('Engagement dashboard: load failed', err);
      if (token !== this.token || this.destroyed) return;
      this.zone.run(() => {
        this.loading = false;
        this.refreshing = false;
        this.error = 'Could not load the engagement data. Check your connection and try again.';
      });
    }
  }

  /**
   * `participant metadata` (active + non active only), `new_user_data` (free users) and the journey names —
   * once per visit. new_user_data is read whole and filtered here: Firestore cannot match "movedtoexist is
   * not true" because documents without the field never match a query on it.
   */
  private loadBase(): Promise<void> {
    if (!this.base) {
      this.base = (async () => {
        const [metaSnap, journeySnap, nudSnap] = await Promise.all([
          getDocs(query(collection(this.firestore, 'participant metadata'), where('customerstatus', 'in', [...ED2_STATUSES]))),
          getDocs(collection(this.firestore, 'journey')),
          getDocs(collection(this.firestore, 'new_user_data')),
        ]);
        this.metas = metaSnap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
        this.paidIds = ed2PaidIds(this.metas);
        this.nuds = nudSnap.docs.map((d) => ({ id: d.id, data: d.data() || {} })).filter((n) => n.data['movedtoexist'] !== true);
        const names = new Map<string, string>();
        journeySnap.docs.forEach((d) => {
          const data: any = d.data() || {};
          const name = String(data['journey'] ?? '').trim();
          if (!name) return;
          names.set(d.id, name);
          if (data['id'] !== undefined && data['id'] !== null && String(data['id']).trim()) names.set(String(data['id']).trim(), name);
        });
        this.journeyNames = names;
      })().catch((err) => {
        this.base = null;   // a failed read is not cached — Retry reads the population again
        throw err;
      });
    }
    return this.base;
  }

  /**
   * One month of `content analytics` (logdate >= start and <= end), read as four back-to-back slices in
   * parallel — never the whole collection. The month's end is taken to the last NANOSECOND of 23:59:59
   * (logdate is stored to the microsecond), so a view at 23:59:59.9995 is not lost between two months.
   */
  private async loadActivity(key: string): Promise<Ed2Activity> {
    const cached = this.activityByMonth.get(key);
    if (cached) return cached;
    const { start, end } = ed2MonthRange(this.year, this.month);
    const snaps = await Promise.all(ed2Slices(start, end, 4).map((s) =>
      getDocs(query(
        collection(this.firestore, 'content analytics'),
        where('logdate', '>=', Timestamp.fromDate(s.from)),
        s.last
          ? where('logdate', '<=', new Timestamp(Math.floor(s.to.getTime() / 1000), 999_999_999))
          : where('logdate', '<', Timestamp.fromDate(s.to)),
      ))));
    const activity = ed2Activity(snaps.flatMap((snap) => snap.docs.map((d) => d.data())));
    this.activityByMonth.set(key, activity);
    return activity;
  }

  retry(): void {
    void this.load();
  }

  // ───────────────────────── Views ─────────────────────────

  setStatus(filter: Ed2StatusFilter): void {
    this.statusFilter = filter;
    this.recompute();
  }

  // ───────────────────────── Source filters ─────────────────────────

  /** Each field's values this month, plus any picked value the month lacks (so it can still be un-picked). */
  private setOptions(): void {
    const activity = this.activity;
    if (!activity) return;
    (['from', 'platform'] as Ed2Dim[]).forEach((dim) => {
      activity.labels[dim].forEach((label, key) => this.knownLabels[dim].set(key, label));
      const opts = ed2Options(activity, dim);
      const seen = new Set(opts.map((o) => o.key));
      this.filter[dim].filter((k) => !seen.has(k)).forEach((key) => opts.push({ key, label: ed2SourceLabel(key, this.knownLabels[dim], dim) }));
      this.options[dim] = ed2SortOptions(opts, dim);
    });
  }
  toggleMenu(dim: Ed2Dim): void {
    this.menuOpen = this.menuOpen === dim ? null : dim;
    this.pickerOpen = false;
  }
  isOn(dim: Ed2Dim, key: string): boolean {
    return this.filter[dim].includes(key);
  }
  toggleOption(dim: Ed2Dim, key: string): void {
    const picked = this.filter[dim];
    this.filter = { ...this.filter, [dim]: picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key] };
    this.applyFilter();
  }
  clearDim(dim: Ed2Dim): void {
    this.filter = { ...this.filter, [dim]: [] };
    this.applyFilter();
  }
  /** Any filter away from its default (status or a source). */
  get hasFilters(): boolean {
    return this.statusFilter !== 'all' || this.filter.from.length > 0 || this.filter.platform.length > 0;
  }
  /** One click back to everyone, every source, every platform. The month stays. */
  clearAll(): void {
    this.menuOpen = null;
    this.statusFilter = 'all';
    this.filter = { from: [], platform: [] };
    this.applyFilter();
  }
  private applyFilter(): void {
    if (!this.activity) { this.recompute(); return; }
    this.buildPeople(this.activity);
    this.recompute();
  }
  /** Paid people (live status, or placed by dates in a past month) followed by the free users. */
  private buildPeople(activity: Ed2Activity): void {
    const month = this.pastMonth ?? undefined;
    const free = ed2FreeUsers(this.nuds, activity, this.paidIds, this.filter, month);
    this.people = [...ed2People(this.metas, activity, this.filter, month), ...free.people];
    if (this.pastMonth) {
      const paid = ed2LeftOut(this.metas, this.pastMonth);
      this.leftOut = { notYet: paid.notYet + free.notYet, undated: paid.undated };
    } else {
      this.leftOut = null;
    }
  }
  /** "All sources" / "All platforms", the one picked, or "N picked". */
  summary(dim: Ed2Dim): string {
    const picked = this.filter[dim];
    if (!picked.length) return dim === 'from' ? 'All sources' : 'All platforms';
    if (picked.length === 1) return this.options[dim].find((o) => o.key === picked[0])?.label ?? '1 picked';
    return `${picked.length} ${dim === 'from' ? 'sources' : 'platforms'}`;
  }
  /** The picked values as one readable line, for the section caption. */
  pickedLabels(dim: Ed2Dim): string {
    return this.filter[dim].map((k) => this.options[dim].find((o) => o.key === k)?.label ?? k).join(', ');
  }

  sortBy(key: Ed2SortKey): void {
    if (this.sortKey === key) this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
    else { this.sortKey = key; this.sortDir = key === 'name' ? 'asc' : 'desc'; }
    this.journeys = ed2Journeys(this.shown, this.journeyNames, this.sortKey, this.sortDir);
  }
  sortIcon(key: Ed2SortKey): string {
    if (this.sortKey !== key) return 'unfold_more';
    return this.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }
  ariaSort(key: Ed2SortKey): string {
    if (this.sortKey !== key) return 'none';
    return this.sortDir === 'asc' ? 'ascending' : 'descending';
  }

  private recompute(): void {
    this.shown = ed2ByStatus(this.people, this.statusFilter);
    this.totals = ed2Totals(this.shown);
    this.journeys = ed2Journeys(this.shown, this.journeyNames, this.sortKey, this.sortDir);
    if (this.panelOpen) this.refreshPanel();
  }

  share(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
  }

  // ───────────────────────── Side panel ─────────────────────────

  openPanel(journeyId: string | null, show: PanelShow): void {
    this.panelJourney = journeyId;
    this.panelShow = show;
    this.panelSearch = '';
    this.panelOpen = true;
    this.pickerOpen = false;
    this.menuOpen = null;
    this.expanded = new Set();
    this.refreshPanel();
  }
  toggleExpand(profileid: string): void {
    const next = new Set(this.expanded);
    if (next.has(profileid)) next.delete(profileid);
    else next.add(profileid);
    this.expanded = next;
  }
  closePanel(): void {
    this.panelOpen = false;
  }
  setPanelShow(show: PanelShow): void {
    this.panelShow = show;
    this.refreshPanel();
  }

  get panelTitle(): string {
    return this.panelJourney === null ? 'All journeys' : ed2JourneyName(this.panelJourney, this.journeyNames);
  }
  get panelScope(): Ed2Person[] {
    return this.panelJourney === null ? this.shown : this.shown.filter((p) => p.journeyId === this.panelJourney);
  }
  get panelEngagedCount(): number { return this.panelScope.filter((p) => p.engaged).length; }
  get panelNotEngagedCount(): number { return this.panelScope.filter((p) => !p.engaged).length; }

  refreshPanel(): void {
    const list = this.panelScope.filter((p) =>
      (this.panelShow === 'all' || (this.panelShow === 'engaged') === p.engaged) && ed2Matches(p, this.panelSearch));
    // Engaged: most watched first. Otherwise by name.
    this.panelList = list.sort((a, b) =>
      (this.panelShow === 'engaged' ? b.seconds - a.seconds : 0) || (a.name || a.email).localeCompare(b.name || b.email));
    let email = 0, phone = 0;
    // WhatsApp counts with the sender's own rule: a phone AND a name (it skips anyone without a name).
    for (const p of this.panelList) { if (p.email) email++; if (p.phonenumber && p.name) phone++; }
    this.panelWithEmail = email;
    this.panelWithPhone = phone;
  }

  // ── Send: the same composers as the workshop dashboard's Communication dialog, to the people listed ──
  sendEmail(): void { void this.senders.email(ed2Recipients(this.panelList)); }
  sendWhatsapp(): void { void this.senders.whatsapp(ed2Recipients(this.panelList)); }
  sendNotification(): void { void this.senders.notification(ed2Recipients(this.panelList)); }

  exportPanel(): void {
    if (!this.panelList.length) return;
    const csv = ed2Csv(this.panelList, this.journeyNames, (d) => formatDate(d, 'd MMM y', 'en-US'));
    const what = this.panelShow === 'engaged' ? 'engaged' : this.panelShow === 'notEngaged' ? 'not-engaged' : 'all';
    const scope = (this.panelTitle || 'journey').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-engagement-${this.year}-${String(this.month + 1).padStart(2, '0')}-${scope}-${what}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  journeyLabel(id: string): string {
    return ed2JourneyName(id, this.journeyNames);
  }

  trackRow = (_: number, r: Ed2JourneyRow) => r.id;
  trackPerson = (_: number, p: Ed2Person) => p.profileid;
  statusClass(s: Ed2Status): string { return s === 'active' ? 'is-active' : s === 'free' ? 'is-free' : 'is-nonactive'; }
}
