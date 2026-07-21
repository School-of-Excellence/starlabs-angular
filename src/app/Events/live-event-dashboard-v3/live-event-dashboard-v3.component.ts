import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AtcBuckets, DayAttendance, EventData, JourneyCount, LiveEventDataService, PanelParticipant, QueueData
} from './live-event-data.service';

// First-timer definition — lifted verbatim from first-timers-dashboard:
// a participant is a first timer when their consumedproducts do NOT include the
// event's excluded/hero product id (environment-specific).
function getExcludedProductId(): string {
  if (environment.firebase.projectId === 'starlabs-test') { return 'BKqbQ5slQtuYhljMOkKk'; }
  if (environment.firebase.projectId === 'fir-sample-aae4a') { return '0ayiNALL1HDVvCXDHcZ4'; }
  return '0ayiNALL1HDVvCXDHcZ4';
}
const EXCLUDED_PRODUCT_ID = getExcludedProductId();

/** One row of the Participant Data table — one per registered profileId. */
interface PdRow {
  profileId: string; name: string; email: string; journeyId: string; ft: boolean;
  atcBucket: number;            // 0 full · 1 partial · 2 unvalidated · 3 none · -1 unknown
  atcPct: number | null;        // SEAM 5
  adjDone: number; adjPending: number; procDone: number; procPending: number;
  attd: number;                 // distinct days present
}
interface PdFilter {
  q: string; journey: string; type: string; atc: string;
  pctOp: '>=' | '<=' | '<'; pctVal: number; presentOn: string; absentOn: string;
}

/**
 * live-event-dashboard-v3 — Phase 1 (shell + Frontend Row 1).
 *
 * Data comes from LiveEventDataService (subscriptions lifted verbatim from the
 * existing dashboards — see that file). This component owns only presentation
 * aggregation (matching the prototype markup) plus five USER-OWNED seams that
 * are stubbed to safe placeholders and MUST be filled by the operator.
 *
 * Prototype reference: live-event-dashboard.html (structure/CSS only).
 * Out of scope this phase: Attendance, Procedure Tracking, Participant Data,
 * Video Ask Tags, Arena Followup, Backend view, Zones view.
 */

interface QuartileRow { cls: string; label: string; count: number; width: number; profileIds: string[]; }

@Component({
  selector: 'app-live-event-dashboard-v3',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [LiveEventDataService],
  templateUrl: './live-event-dashboard-v3.component.html',
  styleUrl: './live-event-dashboard-v3.component.css',
  host: { '(document:keydown.escape)': 'onEscape()', '(document:click)': 'closeDropdowns()' }
})
export class LiveEventDashboardV3Component implements OnInit, OnDestroy {

  activeView: 'frontend' | 'backend' | 'zones' = 'frontend';

  // ATC legend labels/colors — presentation constants from the prototype (ATC_META).
  readonly atcMeta: { label: string; color: string }[] = [
    { label: 'Fully validated ATC', color: 'var(--ok)' },
    { label: 'Partially validated — some ATCs pending', color: 'var(--ok-2)' },
    { label: 'Unvalidated — awaiting review', color: 'var(--warn)' },
    { label: 'No ATC on record', color: 'var(--alert)' }
  ];

  // drill-down panel state
  panelOpen = false;
  panelEyebrow = 'Participants';
  panelTitle = '';
  panelSub = '';
  panelSearch = '';
  private panelRows: PanelParticipant[] = [];

  private sub: Subscription | null = null;

  constructor(public data: LiveEventDataService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub = this.data.changed$.subscribe(() => {
      // Keep the service's first-timer set (used by procedure scope filter) in sync
      // with seam 3 so "First timers" resolves against the same registered universe.
      this.data.setFirstTimerIds(this.data.eventParticipantProfileIds.filter(id => this.isFirstTimer(id)));
      this.cdr.detectChanges();
    });
    this.data.init();
  }

  ngOnDestroy(): void {
    // The service is a component-level provider, so Angular calls its own
    // ngOnDestroy (which tears down the Firestore subscriptions). We only
    // release our view subscription here.
    if (this.sub) { this.sub.unsubscribe(); this.sub = null; }
  }

  // ==========================================================================
  // USER-OWNED SEAMS — stubbed. Do NOT fill these in code review; the operator
  // owns the logic. Each lists the inputs already wired in.
  // ==========================================================================

  /**
   * SEAM 1 (C-3) — hero number = the "Generated" count from V2 (the operator's
   * confirmed definition). That is V2 `scannedCount`: unique profileids scanned
   * in for the selected event (arena e-ticket, active==true), lifted verbatim in
   * `LiveEventDataService.subscribeToETickets`.
   * Note: still per selected event (V2 semantics), not summed across all ongoing
   * events/queues — that cross-event aggregation remains MISSING from Phase 0.
   */
  getHeroApprovedAttended(): number | null {
    if (!this.data.selectedEvent) { return null; }
    return this.data.scannedCount;
  }

  /** Hero click → the generated (scanned-in) participants, like V2 openScannedPanel. */
  openHero(): void {
    this.openPanel('Generated', this.data.selectedEvent?.['name'] || '', this.data.scannedProfileIds);
  }

  /**
   * SEAM 2 (C-1) — ATC buckets for the ATC card.
   * Inputs available: V1 `mapvalidatedATC`/`mapunvalidatedATC` + the 3-way rules
   * (validated / unvalidated / none), OR V2 arenaOverview.atcCompleted/
   * atcToValidate/atcNotCompleted. "Partial" has no existing definition.
   * Return zero buckets → the bar/legend render empty until filled.
   */
  getAtcBuckets(): AtcBuckets {
    // CONFIRMED (C-1): V2 basis. full = validated atc_alpha only ·
    // partial = has both validated + atc_to_validate · unvalidated = to-validate
    // only · none = neither. Partitioned in LiveEventDataService.recomputeAtcBuckets.
    return this.data.atcBuckets;
  }

  /**
   * SEAM 3 (C-4) — first-timer flag for the Participants split.
   * Inputs available: FT `firstTimerProfileIds` (hardcoded EXCLUDED_PRODUCT_ID
   * in consumedproducts) vs V2 `firstTimeProfileIds` (dynamic hero-event
   * products). Return false → everyone counts as "Repeat" until filled.
   */
  isFirstTimer(profileId: string): boolean {
    // CONFIRMED (C-4): first-timers-dashboard logic — first timer = has NOT
    // consumed the excluded/hero product (participant metadata `consumedproducts`).
    const meta = this.data.participantMetadataMap[profileId];
    const consumed: string[] = (meta && meta['consumedproducts']) || [];
    return !consumed.includes(EXCLUDED_PRODUCT_ID);
  }

  /**
   * SEAM 4 (C-5) — journey id → column label + ordering.
   * `data.journeyCounts` already supplies dynamic ids/counts/names. Default here
   * returns the journey doc's own name (existing data, not invented); the
   * operator owns any short-code mapping (uP!/LYL/…) and column ordering.
   */
  journeyLabel(journeyId: string): string {
    // USER-OWNED (C-5): map to short labels / fixed order if desired.
    const j = this.data.mapJourneyData[journeyId];
    return (j && (j['journey'] || j['name'])) || journeyId;
  }

  /**
   * SEAM 5 (C-6) — per-participant completion ratio feeding the quartile rows.
   * Prototype intent: (adjDone + doerProcDone) / (adjTot + cwOpps), execution-
   * based. Real per-participant fields are the operator's to decide.
   * Return null → quartile rows render structure with zero counts.
   */
  participantCompletionRatio(p: PanelParticipant): number | null {
    // USER-OWNED (C-6): define the real ratio; null = "unknown" (excluded).
    return null;
  }

  // ==========================================================================
  // SHELL — chips / hero / tabs
  // ==========================================================================
  get ongoingCount(): number { return this.data.ongoingEvents.length + this.data.ongoingQueues.length; }

  selectEventChip(event: EventData): void { this.data.selectEvent(event); }
  toggleQueueChip(queue: QueueData): void { this.data.toggleQueue(queue); }

  isActiveEvent(event: EventData): boolean {
    return !!this.data.selectedEvent && this.pathOf(this.data.selectedEvent.docref) === this.pathOf(event.docref);
  }
  isActiveQueue(queue: QueueData): boolean { return this.data.isQueueSelected(queue); }

  setView(view: 'frontend' | 'backend' | 'zones'): void { this.activeView = view; }

  // ---- Event + Queue selectors (FT-style searchable dropdowns, v3-styled) -----
  eventDropdownOpen = false;
  eventSearch = '';
  queueDropdownOpen = false;
  queueSearch = '';

  closeDropdowns(): void { this.eventDropdownOpen = false; this.queueDropdownOpen = false; }
  onEscape(): void { this.closePanel(); this.closeDropdowns(); }

  // Event (single-select)
  toggleEventDropdown(): void { this.queueDropdownOpen = false; this.eventDropdownOpen = !this.eventDropdownOpen; if (this.eventDropdownOpen) { this.eventSearch = ''; } }
  pickEvent(e: EventData): void { this.data.selectEvent(e); this.eventDropdownOpen = false; }
  get filteredEvents(): EventData[] {
    const t = this.eventSearch.toLowerCase().trim();
    return t ? this.data.eventsList.filter(e => (e.name || '').toLowerCase().includes(t)) : this.data.eventsList;
  }
  isOngoingEvent(e: EventData): boolean { return this.data.ongoingEvents.some(o => this.pathOf(o.docref) === this.pathOf(e.docref)); }

  // Queue (multi-select — stays open while toggling, mirrors FT)
  toggleQueueDropdown(): void { this.eventDropdownOpen = false; this.queueDropdownOpen = !this.queueDropdownOpen; if (this.queueDropdownOpen) { this.queueSearch = ''; } }
  pickQueue(q: QueueData): void { this.data.toggleQueue(q); }
  queueName(q: QueueData): string { return q.name || q['queuename'] || 'Queue'; }
  isOngoingQueue(q: QueueData): boolean { return this.data.ongoingQueues.some(o => this.pathOf(o.docref) === this.pathOf(q.docref)); }
  get filteredQueues(): QueueData[] {
    const t = this.queueSearch.toLowerCase().trim();
    return t ? this.data.queuesList.filter(q => this.queueName(q).toLowerCase().includes(t)) : this.data.queuesList;
  }
  get selectedQueueLabel(): string {
    const n = this.data.selectedQueues.length;
    if (!n) { return 'Select queues…'; }
    if (n === 1) { return this.queueName(this.data.selectedQueues[0]); }
    return n + ' queues selected';
  }

  // ==========================================================================
  // ATC card (fed by SEAM 2)
  // ==========================================================================
  get atcBuckets(): AtcBuckets { return this.getAtcBuckets(); }
  get atcTotal(): number { const b = this.atcBuckets; return b.full + b.partial + b.unvalidated + b.none; }
  atcBucketValue(i: number): number {
    const b = this.atcBuckets; return [b.full, b.partial, b.unvalidated, b.none][i];
  }
  private atcBucketIds(i: number): string[] {
    const b = this.atcBuckets; return [b.fullIds, b.partialIds, b.unvalidatedIds, b.noneIds][i];
  }
  openAtcBucket(i: number): void {
    this.openPanel(this.atcMeta[i].label, this.data.selectedEvent?.['name'] || '', this.atcBucketIds(i));
  }

  // ==========================================================================
  // Adjustments & Procedures (apBody)
  // ==========================================================================
  get adjTotal(): number { return this.data.totalAdjustmentCount; }
  get adjDone(): number { return this.data.totalAdjustmentCompletedCount; }
  get adjPending(): number { return this.data.totalAdjustmentPendingCount; }
  get adjPct(): number { return this.adjTotal ? Math.round((this.adjDone / this.adjTotal) * 100) : 0; }

  get procTotal(): number { return this.data.procTotals.total; }
  get procDone(): number { return this.data.procTotals.done; }
  get procPending(): number { return this.data.procTotals.pending; }
  get procPct(): number { return this.data.overallProgressPct; }

  get liveCount(): number { return this.data.liveChangeworkTotal; }
  openLive(): void {
    const list = this.data.liveChangeworkList;
    this.openPanelRows('LIVE in the Arena', "Running right now · who's doing what",
      list.map(x => ({ ...this.data.buildParticipantFromProfileId(x.profileId, true), _meta: x.proc })));
  }

  // Quartile distribution (fed by SEAM 5). null ratios are excluded → zero counts.
  get completionQuartiles(): QuartileRow[] {
    const parts = this.data.eventParticipantProfileIds.map(id => this.data.buildParticipantFromProfileId(id, false));
    const ratios = parts.map(p => ({ p, r: this.participantCompletionRatio(p) })).filter(x => x.r !== null) as { p: PanelParticipant; r: number }[];
    const total = this.data.eventParticipantProfileIds.length;
    const defs: { cls: string; label: string; test: (r: number) => boolean }[] = [
      { cls: 'q100', label: '100%', test: r => r >= 1 },
      { cls: 'q75', label: '75%+', test: r => r >= 0.75 },
      { cls: 'q50', label: '50%+', test: r => r >= 0.5 },
      { cls: 'q25', label: '25%+', test: r => r >= 0.25 },
      { cls: 'q0', label: 'Below 25%', test: r => r < 0.25 }
    ];
    return defs.map(d => {
      const list = ratios.filter(x => d.test(x.r));
      return { cls: d.cls, label: d.label, count: list.length, width: total ? Math.round((list.length / total) * 100) : 0, profileIds: list.map(x => x.p.profileid) };
    });
  }

  // ==========================================================================
  // Participants split (ptTable) — journeys dynamic (C-5), ft via SEAM 3
  // ==========================================================================
  get participantJourneys(): JourneyCount[] { return this.data.journeyCounts.filter(j => j.count > 0); }
  get participantTotal(): number { return this.data.eventParticipantProfileIds.length; }

  /** flat [{profileId, journeyId}] over registered participants that have a journey */
  private ptEntries(): { profileId: string; journeyId: string }[] {
    const out: { profileId: string; journeyId: string }[] = [];
    this.participantJourneys.forEach(j => j.profileIds.forEach(pid => out.push({ profileId: pid, journeyId: j.journeyId })));
    return out;
  }

  private ptFilter(journeyId: string | 'all', ft: boolean | null): { profileId: string; journeyId: string }[] {
    return this.ptEntries().filter(e =>
      (journeyId === 'all' || e.journeyId === journeyId) &&
      (ft === null || this.isFirstTimer(e.profileId) === ft));
  }

  ptCount(journeyId: string | 'all', ft: boolean | null): number { return this.ptFilter(journeyId, ft).length; }

  openPt(journeyId: string | 'all', ft: boolean | null): void {
    const ids = this.ptFilter(journeyId, ft).map(e => e.profileId);
    const jLabel = journeyId === 'all' ? '' : ' · ' + this.journeyLabel(journeyId);
    const t = (ft === true ? 'First timers' : ft === false ? 'Repeat participants' : 'All participants') + jLabel;
    this.openPanel(t, this.data.selectedEvent?.['name'] || '', ids);
  }

  // ==========================================================================
  // PHASE 2 SEAMS (USER-OWNED — stubbed)
  // ==========================================================================
  /** CONFIRMED — per-day video-ask count = participantvideoask uploaded on that
   *  day (service subscribeToVideoAsk), scoped to the universe. null while the
   *  video-ask data hasn't loaded yet → cell shows "—". */
  getVideoAskByDay(day: DayAttendance): number | null {
    if (!this.data.videoAskLoaded) { return null; }
    return this.getVideoAskIdsByDay(day).length;
  }
  getVideoAskIdsByDay(day: DayAttendance): string[] {
    const ids = this.data.videoAskByDay[day.date] || [];
    return ids.filter(id => this.data.eventParticipantProfileIds.includes(id));
  }

  /** SEAM — day-over-day attendance change. null → delta chip hidden. */
  attendanceDelta(day: DayAttendance): number | null { return null; }

  /** SEAM — present that day ∧ no recording that day. Not surfaced in #attGrid
   *  (belongs to the Backend Video Ask Review, Phase 4); stub ready for reuse. */
  getMissingRecordingByDay(day: DayAttendance): string[] { return []; }

  // ==========================================================================
  // Daily Attendance (#attGrid) — V2 dayWiseAttendance / subscribeToAttendance
  // ==========================================================================
  get attDays(): DayAttendance[] { return this.data.dayWiseAttendance; }
  get attHasDays(): boolean { return this.data.dayWiseAttendance.length > 0; }
  get attRange(): string {
    const days = this.data.dayWiseAttendance;
    if (!days.length) { return ''; }
    const fmt = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
    const currentDay = days.filter(d => !d.isFuture).length;
    return `${fmt(days[0].date)} – ${fmt(days[days.length - 1].date)} · Day ${Math.max(1, currentDay)} of ${days.length}`;
  }
  // Universe = arena e-ticket set (FT), so the grid's totals/absent all reconcile.
  get attTotalApproved(): number { return this.data.eventParticipantProfileIds.length; }
  get attAbsentToday(): number { const t = this.data.dayWiseAttendance.find(d => d.isToday); return t ? t.absentProfileIds.length : 0; }
  get attNeverAttended(): number { return this.data.allDayAbsentProfileIds.length; }

  attWeekday(day: DayAttendance): string {
    const [y, m, d] = day.date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
  }
  attDayLabel(day: DayAttendance): string { return day.isToday ? 'Today' : 'Day ' + day.day; }
  attTodayBarPct(day: DayAttendance): number {
    const va = this.getVideoAskByDay(day);
    if (va === null || !day.count) { return 0; }
    return Math.round((va / day.count) * 100);
  }

  openAttDay(day: DayAttendance): void {
    if (day.isFuture) { return; }
    this.openPanel(`Attendance · ${this.attDayLabel(day)} · ${this.attWeekday(day)}`, this.data.selectedEvent?.['name'] || '', day.presentProfileIds);
  }
  openAttTotal(): void { this.openPanel('Total approved', this.data.selectedEvent?.['name'] || '', this.data.eventParticipantProfileIds); }
  openAttAbsentToday(): void { const t = this.data.dayWiseAttendance.find(d => d.isToday); this.openPanel('Absent today', this.data.selectedEvent?.['name'] || '', t ? t.absentProfileIds : []); }
  openAttNever(): void { this.openPanel('Never attended', 'Approved but no scan on any day · critical', this.data.allDayAbsentProfileIds); }
  openAttVideo(day: DayAttendance): void { this.openPanel(`Video Ask · ${this.attDayLabel(day)}`, this.data.selectedEvent?.['name'] || '', this.getVideoAskIdsByDay(day)); }

  // ==========================================================================
  // Procedure Tracking (#procRows) — FT calculateProcedureData (registered universe)
  // ==========================================================================
  procOpen = true;
  toggleProc(): void { this.procOpen = !this.procOpen; }

  get procIds(): string[] { return this.data.sortedProcedureIds; }
  procName(id: string): string { return this.data.mapProcedureNames[id] || id; }
  private procStat(id: string) { return this.data.mapProcedureData[id]; }
  procOpp(id: string): number { return this.procStat(id)?.totalOpportunities.count || 0; }
  procCompleted(id: string): number { return this.procStat(id)?.totalCompleted.count || 0; }
  procDoerNotStarted(id: string): number { return this.procStat(id)?.doerNotStarted.count || 0; }
  procDoerCompleted(id: string): number { return this.procStat(id)?.doerCompleted.count || 0; }
  procBenNotStarted(id: string): number { return this.procStat(id)?.beneficierNotStarted.count || 0; }
  procBenCompleted(id: string): number { return this.procStat(id)?.beneficierCompleted.count || 0; }
  procLive(id: string): number { return this.procStat(id)?.liveChangework.count || 0; }
  procCompletionPct(id: string): number { return this.data.completionPct(id); }

  get procCount(): number { return this.data.sortedProcedureIds.length; }
  get procLiveTotal(): number { return this.data.liveChangeworkTotal; }
  get procMeta(): string { return `${this.procCount} procedures · opportunities, doer & beneficiary progress, live now`; }
  get procDayFilter(): string { return this.data.procDayFilter; }

  get procDayChips(): { value: string; label: string; active: boolean }[] {
    const chips = [{ value: 'all', label: 'All Days', active: this.data.procDayFilter === 'all' }];
    this.data.dayWiseAttendance.filter(d => !d.isFuture).forEach(d => {
      chips.push({ value: d.date, label: d.isToday ? `D${d.day} · Today` : `D${d.day} · ${this.attWeekday(d)}`, active: this.data.procDayFilter === d.date });
    });
    return chips;
  }
  setProcDay(value: string): void { this.data.setProcedureDay(value); }
  get procScope(): 'all' | 'firstTimers' { return this.data.participantFilter; }
  setProcScope(scope: 'all' | 'firstTimers'): void { this.data.setProcedureScope(scope); }
  get procScopeAllCount(): number { return this.data.eventParticipantProfileIds.length; }
  get procScopeFtCount(): number { return this.data.eventParticipantProfileIds.filter(id => this.isFirstTimer(id)).length; }

  openProcCell(id: string, kind: 'dns' | 'dc' | 'bns' | 'bc' | 'live'): void {
    const s = this.procStat(id); if (!s) { return; }
    let ids: string[] = []; let label = '';
    if (kind === 'dns') { ids = s.doerNotStarted.data as string[]; label = 'As Doer · Not started'; }
    else if (kind === 'dc') { ids = (s.doerCompleted.data as any[]).map(d => d.doerId); label = 'As Doer · Completed'; }
    else if (kind === 'bns') { ids = s.beneficierNotStarted.data as string[]; label = 'As Beneficiary · Not started'; }
    else if (kind === 'bc') { ids = (s.beneficierCompleted.data as any[]).map(d => d.beneficiaryId); label = 'As Beneficiary · Completed'; }
    else { ids = (s.liveChangework.data as any[]).map(d => d.doerId); label = 'Live now'; }
    const scopeL = this.procScope === 'firstTimers' ? 'First Timers' : 'Overall';
    const dayL = this.procDayFilter === 'all' ? 'All Days' : this.procDayFilter;
    this.openPanel(`${this.procName(id)} · ${label}`, `${scopeL} · ${dayL}`, ids.filter(Boolean));
  }
  openProcLive(): void { this.openLive(); }

  // ==========================================================================
  // Participant Data table (#pdTable) — V1 aggregateData + customfilter + CSV
  // ==========================================================================
  pdOpen = false;
  pdShown = 15;
  pdSortK: keyof PdRow = 'name';
  pdSortD = 1;
  pdFilter: PdFilter = this.defaultPdFilter();
  readonly atcShort = ['Full', 'Partial', 'Unval', 'None'];
  readonly pdCols: { k: keyof PdRow; label: string }[] = [
    { k: 'name', label: 'Name' }, { k: 'atcBucket', label: 'ATC' }, { k: 'atcPct', label: 'ATC %' },
    { k: 'adjDone', label: 'Adj. Done' }, { k: 'adjPending', label: 'Adj. Pending' },
    { k: 'procDone', label: 'Proc. Done' }, { k: 'procPending', label: 'Proc. Pending' }, { k: 'attd', label: 'Attd' }
  ];
  private defaultPdFilter(): PdFilter { return { q: '', journey: 'all', type: 'all', atc: 'all', pctOp: '>=', pctVal: 0, presentOn: 'any', absentOn: 'any' }; }
  togglePd(): void { this.pdOpen = !this.pdOpen; }
  pdClear(): void { this.pdFilter = this.defaultPdFilter(); this.pdShown = 15; }
  pdMore(): void { this.pdShown += 25; }
  pdOnFilterChange(): void { this.pdShown = 15; }

  private bucketOf(profileId: string): number {
    const b = this.data.atcBuckets;
    if (b.fullIds.includes(profileId)) { return 0; }
    if (b.partialIds.includes(profileId)) { return 1; }
    if (b.unvalidatedIds.includes(profileId)) { return 2; }
    if (b.noneIds.includes(profileId)) { return 3; }
    return -1;
  }
  private buildPdRow(profileId: string): PdRow {
    const meta = this.data.participantMetadataMap[profileId] || {};
    const agg = this.data.participantAtc[profileId] || { adjDone: 0, adjPending: 0, procDone: 0, procPending: 0 } as any;
    const ratio = this.participantCompletionRatio(this.data.buildParticipantFromProfileId(profileId, false));
    return {
      profileId, name: meta['name'] || 'Unknown', email: meta['email'] || '',
      journeyId: meta['activejourney'] || '', ft: this.isFirstTimer(profileId),
      atcBucket: this.bucketOf(profileId), atcPct: ratio === null ? null : Math.round(ratio * 100),
      adjDone: agg.adjDone, adjPending: agg.adjPending, procDone: agg.procDone, procPending: agg.procPending,
      attd: (this.data.mapAttendence[profileId]?.length) || 0
    };
  }
  get pdAllRows(): PdRow[] { return this.data.eventParticipantProfileIds.map(id => this.buildPdRow(id)); }

  private pdMatch(r: PdRow): boolean {
    const f = this.pdFilter;
    const q = f.q.toLowerCase().trim();
    if (q && !(r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))) { return false; }
    if (f.journey !== 'all' && r.journeyId !== f.journey) { return false; }
    if (f.type !== 'all' && r.ft !== (f.type === 'ft')) { return false; }
    if (f.atc !== 'all' && r.atcBucket !== +f.atc) { return false; }
    if (r.atcPct !== null) {
      if (f.pctOp === '>=' && !(r.atcPct >= f.pctVal)) { return false; }
      if (f.pctOp === '<=' && !(r.atcPct <= f.pctVal)) { return false; }
      if (f.pctOp === '<' && !(r.atcPct < f.pctVal)) { return false; }
    } else if (f.pctVal > 0) { return false; } // unknown % excluded once a threshold is set
    if (f.presentOn !== 'any') { const day = this.data.dayWiseAttendance.find(d => d.date === f.presentOn); if (!day || !day.presentProfileIds.includes(r.profileId)) { return false; } }
    if (f.absentOn !== 'any') { const day = this.data.dayWiseAttendance.find(d => d.date === f.absentOn); if (day && day.presentProfileIds.includes(r.profileId)) { return false; } }
    return true;
  }
  get pdFilteredRows(): PdRow[] {
    const rows = this.pdAllRows.filter(r => this.pdMatch(r));
    const k = this.pdSortK, d = this.pdSortD;
    return rows.sort((a, b) => {
      const va = a[k] as any, vb = b[k] as any;
      if (typeof va === 'string' || typeof vb === 'string') { return String(va).localeCompare(String(vb)) * d; }
      return (((va ?? -1) as number) - ((vb ?? -1) as number)) * d;
    });
  }
  get pdVisibleRows(): PdRow[] { return this.pdFilteredRows.slice(0, this.pdShown); }
  get pdTotalDays(): number { return this.data.dayWiseAttendance.length; }
  get pdDayOptions(): DayAttendance[] { return this.data.dayWiseAttendance.filter(d => !d.isFuture); }
  pdSort(k: keyof PdRow): void { if (this.pdSortK === k) { this.pdSortD *= -1; } else { this.pdSortK = k; this.pdSortD = k === 'name' ? 1 : -1; } }
  pdAtcLabel(b: number): string { return b >= 0 ? this.atcShort[b] : '—'; }
  openPdRow(r: PdRow): void { this.openPanel(r.name, this.data.selectedEvent?.['name'] || '', [r.profileId]); }

  pdExport(): void {
    const esc = (s: any) => `"${String(s).replace(/"/g, '""')}"`;
    const header = ['Name', 'Email', 'Journey', 'Type', 'ATC Status', 'ATC %', 'Adj Done', 'Adj Pending', 'Proc Done', 'Proc Pending', 'Attended Days'];
    const lines = [header.join(',')];
    this.pdFilteredRows.forEach(r => {
      lines.push([esc(r.name), esc(r.email), esc(this.journeyLabel(r.journeyId)), r.ft ? 'First timer' : 'Repeat',
        this.pdAtcLabel(r.atcBucket), r.atcPct === null ? '' : r.atcPct, r.adjDone, r.adjPending, r.procDone, r.procPending, `${r.attd}/${this.pdTotalDays}`].join(','));
    });
    const name = (this.data.selectedEvent?.['name'] || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = name + '-participants.csv';
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ==========================================================================
  // Video Ask Tags (#tagScroll) — WHOLE SECTION is USER-OWNED (C-7)
  // ==========================================================================
  private readonly tagPalette = ['var(--alert)', 'var(--warn)', 'var(--ok)', 'var(--accent)', 'var(--z-500)', '#c7366f', 'var(--ok-2)'];

  /** CONFIRMED (C-7) — taxonomy = V2: classify/eventtags.videoasktags, loaded in
   *  the service. Colors cycle a fixed palette (taxonomy is dynamic). */
  getTagTaxonomy(): { id: string; label: string; color: string }[] {
    return this.data.videoAskTags.map((t, i) => ({ id: t, label: t, color: this.tagPalette[i % this.tagPalette.length] }));
  }

  /** CONFIRMED (C-7) — one tag per participant via TAXONOMY-ORDER PRIORITY: the
   *  first taxonomy tag the participant carries (metadata `videoasktags`). Note:
   *  "latest-wins" isn't possible — metadata tags are an unordered array with no
   *  timestamps — so priority order is the only well-defined single-tag rule. */
  getParticipantTag(profileId: string): string | null {
    const meta = this.data.participantMetadataMap[profileId];
    const tags: string[] = (meta && meta['videoasktags']) || [];
    if (!tags.length) { return null; }
    for (const t of this.data.videoAskTags) { if (tags.includes(t)) { return t; } }
    return null; // participant has tags, but none in the taxonomy
  }

  get tagGroups(): { id: string; label: string; color: string; profileIds: string[] }[] {
    const tax = this.getTagTaxonomy();
    if (!tax.length) { return []; }
    const byTag: { [id: string]: string[] } = {};
    tax.forEach(t => { byTag[t.id] = []; });
    this.data.eventParticipantProfileIds.forEach(pid => {
      const tag = this.getParticipantTag(pid);
      if (tag && byTag[tag]) { byTag[tag].push(pid); }
    });
    return tax.filter(t => byTag[t.id].length > 0).map(t => ({ ...t, profileIds: byTag[t.id] }));
  }
  openTag(g: { label: string; profileIds: string[] }): void {
    this.openPanel(`Tag · ${g.label}`, `${this.data.selectedEvent?.['name'] || ''} · daily Video Ask review`, g.profileIds);
  }
  participantName(profileId: string): string { return this.data.participantMetadataMap[profileId]?.['name'] || 'Unknown'; }

  // ==========================================================================
  // Arena Followup (#fuGrid) — 3 cards: Irregular, Not Doing CW, CW Not Received
  // ==========================================================================
  fuDay = '';        // '' = today; otherwise a 'yyyy-mm-dd' event day
  fuTime = '09:00';  // cutoff (V2 arenaFollowupTimeFilter)

  /** Target day for Irregular — the picked day, else today. */
  get fuTargetDate(): string {
    if (this.fuDay) { return this.fuDay; }
    const today = this.data.dayWiseAttendance.find(d => d.isToday);
    return today ? today.date : new Date().toLocaleDateString('en-CA');
  }
  /** V2 calculateIrregularParticipants — late scan-in after the cutoff. */
  getIrregularParticipants(): string[] { return this.data.irregularParticipantIds(this.fuTargetDate, this.fuTime); }
  get fuPastDays(): DayAttendance[] { return this.data.dayWiseAttendance.filter(d => d.isPast); }

  get fuNotDoingCW(): string[] { return this.data.notDoingCWIds; }
  get fuCWNotReceived(): string[] { return this.data.cwNotReceivedIds; }
  get fuIrregular(): string[] { return this.getIrregularParticipants(); }

  // The 2 non-Irregular cards (Irregular is rendered first — it has controls).
  get fuCards(): { label: string; title: string; color: string; eyebrow: string; ids: string[] }[] {
    return [
      { label: 'Not Doing CW', title: 'Not doing changework', color: 'var(--warn)', eyebrow: 'Throughout event', ids: this.fuNotDoingCW },
      { label: 'CW Not Received', title: 'Changework not received', color: 'var(--warn)', eyebrow: 'Throughout event', ids: this.fuCWNotReceived }
    ];
  }
  openFu(title: string, ids: string[]): void { this.openPanel(title, this.data.selectedEvent?.['name'] || '', ids); }

  // ==========================================================================
  // Drill-down panel
  // ==========================================================================
  openPanel(title: string, sub: string, profileIds: string[]): void {
    this.openPanelRows(title, sub, profileIds.map(id => this.data.buildParticipantFromProfileId(id, false)));
  }
  private openPanelRows(title: string, sub: string, rows: PanelParticipant[]): void {
    this.panelTitle = title;
    this.panelSub = sub;
    this.panelSearch = '';
    this.panelRows = rows.slice().sort((a, b) => a.name.localeCompare(b.name));
    this.panelOpen = true;
  }
  get panelParticipants(): PanelParticipant[] {
    const q = this.panelSearch.toLowerCase().trim();
    if (!q) { return this.panelRows; }
    return this.panelRows.filter(p => p.name.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q));
  }
  get panelCount(): number { return this.panelParticipants.length; }
  closePanel(): void { this.panelOpen = false; }

  initials(name: string): string {
    return (name || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  private pathOf(ref: any): string { return ref && ref.path ? ref.path : String(ref); }
}
