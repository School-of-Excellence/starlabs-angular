import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore, collection, query, orderBy, where, getDocs, doc, getDoc, setDoc, updateDoc
} from '@angular/fire/firestore';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import * as XLSX from 'xlsx';

import { AuthguardService } from '../../authguard.service';
import { SearchableSelectComponent, SsOption } from './searchable-select.component';

// Step 1 — an event from `event collection`.
interface EventRow {
  id: string;
  ref: any;
  name: string;
  dateLabel: string;
  endValue: number;
  startValue: number;
  isToday: boolean;
}

// Step 2 — an arena event under the chosen event (one per product).
interface ArenaRow {
  arena: any;
  docid: string;
  productName: string;
  type: string;
}

// A live queue (queue generation). `mapped` = its arenaeventidlist contains this arena.
interface QueueOption {
  id: string;
  name: string;
  ref: any;
  stages: string[];       // ordered stage names (the `stages` field — matches token.currentstage)
  mapped: boolean;        // this queue is linked to the current arena event
  endValue: number;
  live: boolean;          // true if the queue is live (no end date or end date >= today)
  variations: Record<string, string>;   // variationId → variationname (from `queue variation`)
  arenaeventidlist: string[];  // arena docids this queue serves (→ products, via `arena events`)
  productIds: string[];        // product ids this queue is mapped to (resolved from arenaeventidlist)
}

// A stage column = one stage of one selected queue (merged across all selected queues).
interface StageCol {
  queueId: string;
  queueName: string;
  stage: string;
  key: string;            // queueId + '|' + stage
  label: string;          // stage (or "stage · queue" when >1 queue selected)
}

interface CombinedCol {
  id: string;                       // unique id
  name: string;                     // operator-typed column name
  byQueue: Record<string, string>;  // queueId -> stage (only the queues the operator mapped)
}

// Step 3 — one participant. Metadata columns + a token per selected queue.
interface StageRow {
  profileid: string;
  name: string;
  email: string;
  phone: string;
  customerStatus: string;
  status: string;
  journeyId: string;             // journey chosen by customerstatus (active/non active/other)
  unconsumedProducts: string[];  // product ids still unconsumed (participant metadata)
  activeProducts: string[];      // product ids currently being consumed (participant metadata: activeproduct)
  // by queueId: current stage, slot bookings, completion dates (previousstage → logdate ms), and
  // lastMs = most recent token/stage-log activity time in that queue (for "most recent" picks).
  tokens: Record<string, { currentstage: string; selectedstageslot: any; completedAt: Record<string, number>; lastMs: number }>;
  metaMissing: boolean;
}

const PAST_WINDOW_MS = 180 * 86400000;

type Step = 'events' | 'arenas' | 'queues' | 'plan';

@Component({
  selector: 'app-events-stage-data',
  standalone: true,
  imports: [CommonModule, FormsModule, MatPaginatorModule, SearchableSelectComponent],
  templateUrl: './events-stage-data.component.html',
  styleUrl: './events-stage-data.component.css'
})
export class EventsStageDataComponent {

  step: Step = 'events';
  mapProduct: Record<string, string> = {};

  // ---- Step 1: events ----
  eventRows: EventRow[] = [];
  loadingEvents = true;
  eventsError = false;
  searchEvents = '';
  mode: 'upcoming' | 'past' = 'upcoming';
  eventPageIndex = 0;
  eventPageSize = 10;
  selectedEvent: EventRow | null = null;

  // ---- Step 2: arena events ----
  arenaRows: ArenaRow[] = [];
  loadingArenas = false;
  arenasError = false;
  selectedArena: ArenaRow | null = null;

  // ---- Step 3: queues + participants + dynamic stage columns ----
  stageRows: StageRow[] = [];
  private loadedTokenQueues = new Set<string>();   // selected queues whose tokens + members are loaded
  loadingStage = false;
  stageError = false;
  searchStage = '';
  stagePageIndex = 0;
  stagePageSize = 25;

  queues: QueueOption[] = [];            // all live queues (+ mapped ones)
  queueLimit = 5;                        // Step 3: show 5 at a time, "Load more" reveals the rest
  selectedQueueIds: string[] = [];       // multi-select
  loadingQueue = false;
  mergedStages: StageCol[] = [];         // stages of all selected queues, merged
  addedCols: StageCol[] = [];            // stage columns the operator added
  colToAdd = '';                         // dropdown selection (a StageCol.key)
  combinedCols: CombinedCol[] = [];      // operator-defined cross-queue stage columns (Step 4)
  builderName = '';                      // Step 4 builder: column name
  builderSel: Record<string, string> = {}; // Step 4 builder: queueId -> picked stage
  private combinedSeq = 0;               // id counter for combined columns

  // ---- Cohort summary (top of step 3) ----
  summaryLoaded = false;
  summaryLoading = false;
  private journeyIdByPid = new Map<string, string>();   // pid -> journey docId
  summaryRequested = { active: 0, nonactive: 0, total: 0 };
  summaryApproved = { active: 0, nonactive: 0, total: 0 };
  summaryInQueue = { active: 0, nonactive: 0, total: 0 };
  summaryApprovedNotQueued = { active: 0, nonactive: 0, total: 0 };  // approved but no queue token
  cardFilter = '';   // quick-filter the table by a clicked cohort card ('inqueue'|'requested'|'approved'|'approved-nq'|'ready')
  selectedParticipant: StageRow | null = null;   // row opened in the detail side panel
  summaryReady = { active: 0, nonactive: 0, total: 0 };
  summaryDfu = { active: 0, nonactive: 0, total: 0 };   // #5 DFU Ongoing (active product outside the selected queues)

  // ---- Per-arena journey group config ----
  journeyGroups: { name: string; journeyIds: string[] }[] = [];
  private groupsDocId: string | null = null;
  groupsEditorOpen = false;
  configOpen = false;

  // ---- Per-arena "ready" stage config (stored in the same config doc) ----
  readyStages: string[] = [];
  readyStageByQueue: Record<string, string> = {};   // queueId -> the stage that marks "ready for the event"
  readyCfgOpen = false;                              // collapsed by default to save space

  // ---- Configurable definitions (persisted in the SAME per-arena config doc, Alt A) ----
  stageDefs: { id: string; label: string; byQueue: Record<string, string> }[] = [];  // #4/#6 named "Yet to Complete <stage>"
  queueEligibility: Record<string, string[]> = {};   // #3 per-queue eligible unconsumed-product group
  dfuProductIds: string[] = [];                      // #5 optional narrowing of DFU-ongoing to a product set
  private stageDefSeq = 0;
  eligibilityFilter = '';                            // #3 filter: show only participants eligible for this queueId

  // Filters
  requestFilter = '';    // '' | 'requested' | 'approved'
  stageFilter = '';      // '' | a stage name | '__none' (not in any selected queue)
  customerFilter = '';   // '' | a customerstatus value
  variationFilter = '';  // '' | a variation name | '__none' (no booked slot → unknown variation)
  completedFrom = '';    // yyyy-mm-dd — stage completion date range
  completedTo = '';
  completedStage = '';   // '' = any stage | a stage name — which stage the date range applies to
  slotFrom = '';         // yyyy-mm-dd — slot start-date range
  slotTo = '';
  notBookedOnly = false; // show only participants with an unbooked (not-completed, no-slot) stage
  filtersOpen = false;   // Step 4: the collapsible filter panel toggle

  // ---- Journey / segments / products reference data (loaded once, cached) ----
  journeyMap: Record<string, string> = {};      // journeyId → journey name
  profileSegments: Record<string, string[]> = {}; // profileId → segment names
  private refDataPromise: Promise<void> | null = null;  // memoized one-shot ref-data load

  // New filters
  segmentFilter = '';                           // '' | a segment name
  journeyFilters: string[] = [];                // selected journeys (multi-select filter)
  productFilter = '';                           // '' | a product id (checked against unconsumedproducts)
  productMode: 'only' | 'exclude' = 'only';     // show only / remove those who have the product unconsumed

  // ---- Sheet reconcile: import a sheet and diff it against the table participants ----
  showReconcile = false;
  reconcileError = '';
  reconcileFileName = '';
  sheetCount = 0;                                        // rows read from the sheet
  matchedCount = 0;                                      // table participants also present in the sheet
  extraInTable: StageRow[] = [];                         // in table, NOT in sheet
  extraInSheet: { name: string; email: string }[] = []; // in sheet, NOT in table

  constructor(public firestore: Firestore, public guard: AuthguardService) {
    this.loadEvents();
  }

  // ===========================================================================
  // Step 1 — events from `event collection`
  // ===========================================================================
  async loadEvents() {
    this.loadingEvents = true;
    this.eventsError = false;
    try {
      this.mapProduct = await this.guard.getProductMap();

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const todayStart = now.getTime();
      const todayEnd = todayStart + 86400000 - 1;
      const pastFloor = todayStart - PAST_WINDOW_MS;
      const inWindow = (end: number) =>
        this.mode === 'past' ? (end < todayStart && end >= pastFloor) : (end >= todayStart);

      const snap = await getDocs(query(collection(this.firestore, 'event collection'), orderBy('end_date', 'desc')));
      const rows: EventRow[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        const end = this.toMillis(data['end_date']);
        if (data['delete'] == true || !inWindow(end)) return;
        const start = this.toMillis(data['start_date']);
        const name = data['name'] ?? 'Event';
        rows.push({
          id: d.id, ref: d.ref, name,
          dateLabel: this.formatRange(start, end),
          endValue: end, startValue: start,
          isToday: !!start && start <= todayEnd && end >= todayStart
        });
      });
      rows.sort((x, y) => (y.endValue - x.endValue) || x.name.localeCompare(y.name));
      this.eventRows = rows;
      this.loadingEvents = false;
    } catch (err) {
      console.log('stage-data events load failed', err);
      this.eventsError = true;
      this.loadingEvents = false;
    }
  }

  retryEvents() { this.loadEvents(); }

  setMode(m: 'upcoming' | 'past') {
    if (this.mode === m) return;
    this.mode = m;
    this.eventPageIndex = 0;
    this.searchEvents = '';
    this.eventRows = [];
    this.loadEvents();
  }

  // ===========================================================================
  // Step 2 — arena events for the chosen event
  // ===========================================================================
  async selectEvent(row: EventRow) {
    this.selectedEvent = row;
    this.selectedArena = null;
    this.arenaRows = [];
    this.step = 'arenas';
    await this.loadArenas(row);
  }

  async loadArenas(event: EventRow) {
    this.loadingArenas = true;
    this.arenasError = false;
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'arena events'), where('eventref', '==', event.ref)));
      const rows: ArenaRow[] = [];
      snap.docs.forEach(d => {
        const a = d.data();
        if (a['delete'] == true) return;
        const productName = this.mapProduct[a['productref']?.id] ?? 'Product';
        rows.push({ arena: a, docid: a['docid'] ?? d.id, productName, type: a['type'] ?? 'event' });
      });
      rows.sort((x, y) => x.productName.localeCompare(y.productName));
      this.arenaRows = rows;
    } catch (err) {
      console.log('stage-data arenas load failed', err);
      this.arenasError = true;
    } finally {
      this.loadingArenas = false;
    }
  }

  // ===========================================================================
  // Step 3 — queues, participants, and per-stage columns
  // ===========================================================================
  async selectArena(row: ArenaRow) {
    this.selectedArena = row;
    this.stageRows = [];
    this.searchStage = '';
    this.stagePageIndex = 0;
    this.queues = [];
    this.selectedQueueIds = [];
    this.mergedStages = [];
    this.addedCols = [];
    this.colToAdd = '';
    this.combinedCols = [];
    this.builderName = '';
    this.builderSel = {};
    this.requestFilter = '';
    this.stageFilter = '';
    this.customerFilter = '';
    this.variationFilter = '';
    this.segmentFilter = '';
    this.journeyFilters = [];
    this.productFilter = ''; this.productMode = 'only'; this.eligibilityFilter = '';
    this.completedFrom = ''; this.completedTo = ''; this.completedStage = '';
    this.slotFrom = ''; this.slotTo = '';
    this.notBookedOnly = false;
    this.cardFilter = '';
    this.selectedParticipant = null;
    this.showReconcile = false; this.reconcileError = ''; this.reconcileFileName = '';
    this.extraInTable = []; this.extraInSheet = []; this.sheetCount = 0; this.matchedCount = 0;
    this.summaryLoaded = false;
    this.groupsEditorOpen = false;
    this.configOpen = false;
    this.readyStages = [];
    this.readyStageByQueue = {};
    this.step = 'queues';   // Step 3: pick the relevant queues; Step 4 ('plan') shows them.
    this.loadRefData();   // journey names + segment membership (cached, non-blocking)
    await this.loadJourneyGroups(row.docid);
    await this.loadParticipants(row);
    await this.loadQueues(row);
  }

  // Journey field is chosen by customer status:
  //   active → activejourney, non active → lastcompletedjourney, else → lastsubscribedjourney.
  private pickJourneyId(m: any): string {
    if (!m) return '';
    const cs = (m['customerstatus'] ?? '').toString().trim().toLowerCase();
    const id = cs === 'active' ? m['activejourney']
      : cs === 'non active' ? m['lastcompletedjourney']
      : m['lastsubscribedjourney'];
    return (id ?? '').toString();
  }

  // Load journey names and segment membership once, then cache (memoized so concurrent
  // callers await the SAME load instead of racing / re-reading).
  private loadRefData(): Promise<void> {
    return this.refDataPromise ??= this.doLoadRefData();
  }
  private async doLoadRefData(): Promise<void> {
    try {
      const [journeyMap, segSnap, listSnap] = await Promise.all([
        this.guard.getJourneyMap(),
        getDocs(collection(this.firestore, 'segments')),
        getDocs(collection(this.firestore, 'participant list'))
      ]);
      this.journeyMap = journeyMap ?? {};

      // segmentId → name
      const segName: Record<string, string> = {};
      segSnap.docs.forEach(d => { segName[d.id] = d.data()['segmentname'] ?? d.id; });

      // profileId → set of segment names, via each participant list's profilelist + segmentid back-ref.
      const bySeg: Record<string, Set<string>> = {};
      listSnap.docs.forEach(d => {
        const data = d.data();
        const profiles: string[] = data['profilelist'] ?? [];
        const segIds: string[] = data['segmentid'] ?? [];
        if (!profiles.length || !segIds.length) return;
        const names = segIds.map(id => segName[id]).filter(Boolean) as string[];
        if (!names.length) return;
        profiles.forEach(pid => {
          (bySeg[pid] ??= new Set<string>());
          names.forEach(n => bySeg[pid].add(n));
        });
      });
      const flat: Record<string, string[]> = {};
      Object.keys(bySeg).forEach(pid => { flat[pid] = [...bySeg[pid]]; });
      this.profileSegments = flat;
    } catch (e) {
      console.log('stage-data ref data load failed', e);
      this.refDataPromise = null;   // allow a later retry
    }
  }

  // Build a StageRow from a profile's participant-metadata doc. `status` is the arena
  // request status ('requested' | 'approved') or '' for a queue-only member.
  private async buildRowFromMeta(pid: string, status: string): Promise<StageRow> {
    try {
      const metaSnap = await getDoc(doc(this.firestore, 'participant metadata', pid));
      const m: any = metaSnap.exists() ? metaSnap.data() : null;
      return {
        profileid: pid,
        name: m?.['name'] ?? '',
        email: m?.['email'] ?? '',
        phone: (m?.['phonenumber'] ?? m?.['number'] ?? '')?.toString?.() ?? '',
        customerStatus: m?.['customerstatus'] ?? '',
        journeyId: this.pickJourneyId(m),
        unconsumedProducts: Array.isArray(m?.['unconsumedproducts']) ? m['unconsumedproducts'].map((p: any) => (p ?? '').toString()) : [],
        activeProducts: Array.isArray(m?.['activeproduct']) ? m['activeproduct'].map((p: any) => (p ?? '').toString()) : [],
        status, tokens: {}, metaMissing: !m
      } as StageRow;
    } catch {
      return { profileid: pid, name: '', email: '', phone: '', customerStatus: '', journeyId: '', unconsumedProducts: [], activeProducts: [], status, tokens: {}, metaMissing: true } as StageRow;
    }
  }

  // Requested + approved participation requests → participant metadata columns.
  private async loadParticipants(row: ArenaRow) {
    this.loadingStage = true;
    this.stageError = false;
    try {
      const eprSnap = await getDocs(query(
        collection(this.firestore, 'event participation request'),
        where('arenaeventid', '==', row.docid),
        where('status', 'in', ['requested', 'approved'])));

      // Dedupe by participant; if they have both a requested and an approved doc, approved wins.
      const statusByPid = new Map<string, string>();
      eprSnap.docs.forEach(d => {
        const x = d.data();
        const pid = x['profileid'];
        if (!pid) return;
        const s = x['status'] ?? 'requested';
        if (statusByPid.get(pid) === 'approved') return;
        statusByPid.set(pid, s);
      });

      const rows: StageRow[] = await Promise.all(
        [...statusByPid.keys()].map(pid => this.buildRowFromMeta(pid, statusByPid.get(pid) ?? 'approved')));

      rows.sort((a, b) => (a.name || 'zzz').localeCompare(b.name || 'zzz'));
      this.stageRows = rows;
      this.loadedTokenQueues = new Set();   // fresh cohort: no queue tokens/members loaded yet
      // Summary is computed after queue members are unioned in (see loadSelectedTokens).
    } catch (err) {
      console.log('stage-data participants load failed', err);
      this.stageError = true;
    } finally {
      this.loadingStage = false;
    }
  }

  // ---- Cohort summary: journey meta (record-level) + group config ----
  // Journey per participant = the same customerstatus-driven pick used by the main table's
  // Journey column (`pickJourneyId` → active/last-completed/last-subscribed), already stored on
  // each StageRow.journeyId. No `participantjourneyproduct` read.
  private async loadJourneyMeta(): Promise<void> {
    await this.loadRefData();   // journeyMap (journeyId → name) is loaded once and reused — no extra 'journey' read
    this.journeyIdByPid = new Map();
    (this.stageRows || []).forEach(r => { if (r.journeyId) this.journeyIdByPid.set(r.profileid, r.journeyId); });
  }

  // Per-arena journey group config, persisted in `stage opportunity count` (kind='journeygroups').
  private async loadJourneyGroups(arenaeventid: string): Promise<void> {
    this.journeyGroups = []; this.groupsDocId = null; this.readyStages = [];
    this.stageDefs = []; this.queueEligibility = {}; this.dfuProductIds = [];
    try {
      const snap = await getDocs(query(collection(this.firestore, 'stage opportunity count'),
        where('kind', '==', 'journeygroups'), where('arenaeventid', '==', arenaeventid)));
      if (!snap.empty) {
        // Multiple docs can exist from earlier saves — always use the most recently updated one.
        const d = snap.docs.reduce((a, b) =>
          (((b.data() as any)['updated']?.toMillis?.() ?? 0) >= ((a.data() as any)['updated']?.toMillis?.() ?? 0)) ? b : a);
        this.groupsDocId = d.id;
        const data = d.data() as any;
        this.journeyGroups = (data['groups'] || []).map((g: any) => ({ name: g.name || '', journeyIds: g.journeyIds || [] }));
        this.readyStages = (data['readyStages'] || []);
        this.stageDefs = (data['stageDefs'] || []).map((s: any) => ({ id: s.id || ('sd' + (++this.stageDefSeq)), label: s.label || '', byQueue: s.byQueue || {} }));
        this.queueEligibility = data['queueEligibility'] || {};
        this.dfuProductIds = data['dfuProductIds'] || [];
      }
    } catch (e) { console.error('load journey groups failed', e); }
  }
  // Persist the arena config doc (journey groups + ready stages) to the single `journeygroups` doc.
  private async saveArenaConfig(): Promise<void> {
    const arenaeventid = this.selectedArena?.docid; if (!arenaeventid) return;
    const groups = this.journeyGroups.filter(g => (g.name || '').trim()).map(g => ({ name: g.name.trim(), journeyIds: g.journeyIds || [] }));
    const readyStages = this.readyStages;
    const stageDefs = this.stageDefs.filter(s => (s.label || '').trim()).map(s => ({ id: s.id, label: s.label.trim(), byQueue: s.byQueue || {} }));
    const queueEligibility = this.queueEligibility;
    const dfuProductIds = this.dfuProductIds;
    const payload: any = { groups, readyStages, stageDefs, queueEligibility, dfuProductIds, updated: new Date() };
    if (this.groupsDocId) {
      await updateDoc(doc(this.firestore, 'stage opportunity count', this.groupsDocId), payload);
    } else {
      const id = doc(collection(this.firestore, 'stage opportunity count')).id;
      await setDoc(doc(this.firestore, 'stage opportunity count', id), { kind: 'journeygroups', arenaeventid, ...payload });
      this.groupsDocId = id;
    }
  }
  async saveJourneyGroups(): Promise<void> {
    if (!this.selectedArena?.docid) return;
    try {
      await this.saveArenaConfig();
      this.groupsEditorOpen = false;
      this.computeCohortSummary();
    } catch (e: any) { console.error('save journey groups failed', e); alert('Could not save groups: ' + (e?.code || e?.message || e)); }
  }
  async saveReadyStages(): Promise<void> {
    if (!this.selectedArena?.docid) return;
    try {
      await this.saveArenaConfig();
    } catch (e: any) { console.error('save ready stages failed', e); }
  }

  // ---- Ready-stage config helpers ----
  get readyStageOptions(): string[] {
    const seen = new Set<string>(); const out: string[] = [];
    this.mergedStages.forEach(s => { if (!seen.has(s.stage)) { seen.add(s.stage); out.push(s.stage); } });
    return out;
  }
  isReadyStage(stage: string): boolean { return this.readyStages.includes(stage); }
  toggleReadyStage(stage: string): void {
    this.readyStages = this.readyStages.includes(stage)
      ? this.readyStages.filter(s => s !== stage)
      : [...this.readyStages, stage];
    this.computeCohortSummary();
    this.saveReadyStages();
  }
  addJourneyGroup(): void { this.journeyGroups = [...this.journeyGroups, { name: '', journeyIds: [] }]; }
  removeJourneyGroup(i: number): void { this.journeyGroups = this.journeyGroups.filter((_, idx) => idx !== i); }
  toggleGroupJourney(i: number, journeyId: string): void {
    const g = this.journeyGroups[i]; const has = g.journeyIds.includes(journeyId);
    g.journeyIds = has ? g.journeyIds.filter(x => x !== journeyId) : [...g.journeyIds, journeyId];
  }
  isInGroup(i: number, journeyId: string): boolean { return this.journeyGroups[i]?.journeyIds.includes(journeyId); }

  // The pickable set = journeys actually present in this arena's cohort (with headcounts).
  get cohortJourneys(): { id: string; name: string; count: number }[] {
    const m = new Map<string, number>();
    (this.stageRows || []).forEach(r => { const jid = this.journeyIdByPid.get(r.profileid); if (jid) m.set(jid, (m.get(jid) || 0) + 1); });
    return [...m.entries()].map(([id, count]) => ({ id, name: this.journeyMap[id] || id, count })).sort((a, b) => b.count - a.count);
  }

  // Journey-wise split: every journey is its own row; a named local group collapses its journeys into one row.
  get summaryJourneyRows(): { key: string; label: string; reqA: number; reqNA: number; appA: number; appNA: number; readyA: number; readyNA: number }[] {
    const isActive = (r: any) => String(r.customerStatus ?? '').toLowerCase().trim() === 'active';
    const groupNames = this.journeyGroups.map(g => (g.name || '').trim()).filter(Boolean);
    const keyOf = (pid: string): string => {
      const jid = this.journeyIdByPid.get(pid);
      if (jid) {
        const g = this.journeyGroups.find(gr => (gr.name || '').trim() && gr.journeyIds.includes(jid));
        if (g) return g.name.trim();
        return this.journeyMap[jid] ?? jid;
      }
      return 'Other';
    };
    const jr: Record<string, any> = {};
    (this.stageRows || []).forEach(r => {
      const k = keyOf(r.profileid);
      const b = jr[k] ??= { key: k, label: k, reqA: 0, reqNA: 0, appA: 0, appNA: 0, readyA: 0, readyNA: 0 };
      const act = isActive(r);
      if (r.status === 'requested') act ? b.reqA++ : b.reqNA++;
      else if (r.status === 'approved') act ? b.appA++ : b.appNA++;
      if (this.isReady(r)) act ? b.readyA++ : b.readyNA++;
    });
    const groups = groupNames.filter(n => jr[n]).map(n => jr[n]);
    const rest = Object.keys(jr).filter(k => !groupNames.includes(k))
      .sort((a, b) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)).map(k => jr[k]);
    return [...groups, ...rest];
  }

  pct(n: number, total: number): number { return total > 0 ? Math.round(n / total * 100) : 0; }

  // Whole cohort = everyone requested or approved for the arena (matches the participants table).
  get cohortTotal(): number { return this.summaryRequested.total + this.summaryApproved.total; }
  // Requested/approved but not holding a token in any selected queue (the "5 of 6" gap).
  get notInQueue(): number { return Math.max(0, this.cohortTotal - this.summaryInQueue.total); }
  // The actual participants behind that gap — surfaced as their own card so they're easy to spot/action.
  get notInQueueRows(): StageRow[] { return (this.stageRows || []).filter(r => !this.inSelectedQueue(r)); }

  // ---- Queue-scoped predicates (only count against ticked queues) ----
  // "Unattended Participants" is a parking stage — those people don't count as actively in the queue.
  private isUnattendedStage(s: string): boolean { return (s || '').trim().toLowerCase() === 'unattended participants'; }
  // In a selected queue AND not parked at the Unattended Participants stage.
  private inSelectedQueue(r: any): boolean {
    return this.selectedQueueIds.some(qid => {
      const t = r.tokens?.[qid];
      return !!t && !this.isUnattendedStage(t.currentstage);
    });
  }
  // #5 DFU Ongoing — the participant is actively consuming a product OUTSIDE the selected
  // queue(s): an activeproduct that no selected queue is mapped to. These people are available
  // for planning / follow-up. Relies on the queue→product mapping resolved in loadSelectedTokens.
  private selectedQueueProductIds(): Set<string> {
    const s = new Set<string>();
    this.selectedQueueIds.forEach(qid => (this.queues.find(q => q.id === qid)?.productIds ?? []).forEach(p => s.add(p)));
    return s;
  }
  isDfuOngoing(r: StageRow): boolean {
    if (!r.activeProducts.length) return false;
    const covered = this.selectedQueueProductIds();
    return r.activeProducts.some(p => !covered.has(p));
  }
  // #3 — a participant is "eligible" for a queue when they still hold (unconsumed) at least one of
  // that queue's configured eligible products. Several products can be grouped under one queue;
  // adding a product to the group needs no code change.
  isEligibleFor(r: StageRow, qid: string): boolean {
    return (this.queueEligibility[qid] || []).some(p => r.unconsumedProducts.includes(p));
  }
  isEligibleProduct(qid: string, productId: string): boolean {
    return (this.queueEligibility[qid] || []).includes(productId);
  }
  toggleEligibleProduct(qid: string, productId: string): void {
    const cur = this.queueEligibility[qid] || [];
    this.queueEligibility[qid] = cur.includes(productId) ? cur.filter(p => p !== productId) : [...cur, productId];
    this.saveArenaConfig().catch(e => console.error('save eligibility failed', e));
  }
  // Ready for the event = approved AND, in some selected queue, their current stage is at or
  // past the operator-picked "ready" stage for that queue (using the queue's ordered stage list).
  private isReady(r: any): boolean {
    if (r.status !== 'approved') return false;
    const norm = (s: string) => (s || '').trim().toLowerCase();
    return this.selectedQueueIds.some(qid => {
      const ready = this.readyStageByQueue[qid];
      const cs = r.tokens?.[qid]?.currentstage;
      if (!ready || !cs || this.isUnattendedStage(cs)) return false;
      const stages = (this.queues.find(x => x.id === qid)?.stages ?? []).map(norm);
      const readyIdx = stages.indexOf(norm(ready));
      const curIdx = stages.indexOf(norm(cs));
      return readyIdx >= 0 && curIdx >= 0 && curIdx >= readyIdx;
    });
  }
  // Set a queue's "ready" stage and recompute the Ready count.
  setReadyStage(qid: string, stage: string) {
    this.readyStageByQueue[qid] = stage;
    this.computeCohortSummary().catch(e => console.log('cohort summary failed', e));
  }
  // Compact one-line summary of the ready stages (for the collapsed picker).
  get readyStageSummary(): string {
    return this.selectedQueues.filter(q => this.readyStageByQueue[q.id])
      .map(q => `${q.name}: ${this.readyStageByQueue[q.id]}`).join(' · ');
  }

  private async computeCohortSummary(): Promise<void> {
    this.summaryLoading = true;   // keep prior data visible during a recompute; just flag "updating"
    try {
      const rows = this.stageRows || [];
      await this.loadJourneyMeta();
      const isActive = (r: any) => String(r.customerStatus ?? '').toLowerCase().trim() === 'active';
      const seg = (pred: (r: any) => boolean) => { let a = 0, n = 0; rows.filter(pred).forEach(r => isActive(r) ? a++ : n++); return { active: a, nonactive: n, total: a + n }; };
      this.summaryRequested = seg(r => r.status === 'requested');
      this.summaryApproved = seg(r => r.status === 'approved');
      this.summaryInQueue = seg(r => this.inSelectedQueue(r));
      this.summaryReady = seg(r => this.isReady(r));
      this.summaryApprovedNotQueued = seg(r => r.status === 'approved' && !this.inSelectedQueue(r));
      this.summaryDfu = seg(r => this.isDfuOngoing(r));
      this.summaryLoaded = true;   // summaryJourneyRows is a reactive getter (grouping updates live)
    } finally {
      this.summaryLoading = false;
    }
  }

  // Load ALL live queues; default-select the queue(s) mapped to this arena event.
  private async loadQueues(row: ArenaRow) {
    this.loadingQueue = true;
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const todayStart = now.getTime();
      const eightAgo = new Date(todayStart);
      eightAgo.setMonth(eightAgo.getMonth() - 8);
      const eightMonthsAgo = eightAgo.getTime();

      const qSnap = await getDocs(query(
        collection(this.firestore, 'queue generation'), orderBy('queueenddate', 'desc')));

      const queues: QueueOption[] = [];
      qSnap.docs.forEach(d => {
        const q = d.data();
        if (q['delete'] == true) return;
        const end = this.toMillis(q['queueenddate']);
        const arenaList: string[] = Array.isArray(q['arenaeventidlist']) ? q['arenaeventidlist'] : [];
        const mapped = arenaList.includes(row.docid);
        const isLive = !end || end >= todayStart;
        const recentlyEnded = !!end && end >= eightMonthsAgo;
        if (!isLive && !mapped && !recentlyEnded) return;
        queues.push({
          id: d.id, name: q['queuename'] ?? 'Queue', ref: d.ref,
          stages: Array.isArray(q['stages']) ? q['stages'] : [],
          mapped, endValue: end, live: isLive, variations: {},
          arenaeventidlist: arenaList, productIds: []
        });
      });
      queues.sort((a, b) => (Number(b.mapped) - Number(a.mapped)) || (b.endValue - a.endValue));
      this.queues = queues;
      this.queueLimit = 5;   // reset the "show 5" window for the new arena's queues
      // Pre-select the mapped queue(s) so the relevant one(s) load by default.
      this.selectedQueueIds = queues.filter(q => q.mapped).map(q => q.id);
      if (this.selectedQueueIds.length) await this.loadSelectedTokens();
    } catch (e) {
      console.log('stage-data queue load failed', e);
    } finally {
      this.loadingQueue = false;
    }
  }

  // ---- Queue multi-select ----
  isQueueSelected(id: string): boolean { return this.selectedQueueIds.includes(id); }
  // Step 3 shows queues in batches of 5; "Load more" grows queueLimit.
  get visibleQueues(): QueueOption[] { return this.queues.slice(0, this.queueLimit); }
  loadMoreQueues() { this.queueLimit += 5; }
  // "Ended" pill label for a queue, e.g. "Oct 2025" (empty if no end date).
  queueEndLabel(q: QueueOption): string {
    if (!q.endValue) return '';
    return new Date(q.endValue).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  async toggleQueue(id: string, checked: boolean) {
    this.selectedQueueIds = checked
      ? [...this.selectedQueueIds, id]
      : this.selectedQueueIds.filter(q => q !== id);
    await this.loadSelectedTokens();
  }

  // Load the selected queues' tokens AND union in every active queue member as a participant,
  // so the table + "Total in queue" reflect the whole queue — not just this arena's cohort.
  private async loadSelectedTokens() {
    this.buildMergedStages();
    const selected = new Set(this.selectedQueueIds);
    // Clear tokens for deselected queues and forget those queues.
    this.stageRows.forEach(r => {
      Object.keys(r.tokens).forEach(qid => { if (!selected.has(qid)) delete r.tokens[qid]; });
    });
    [...this.loadedTokenQueues].forEach(qid => { if (!selected.has(qid)) this.loadedTokenQueues.delete(qid); });
    // Drop queue-only members (no arena request/approval) who are no longer in any selected queue.
    this.stageRows = this.stageRows.filter(r => !!r.status || Object.keys(r.tokens).length > 0);
    if (!this.selectedQueueIds.length) {
      this.computeCohortSummary().catch(e => console.log('cohort summary failed', e));
      return;
    }
    this.loadingQueue = true;
    try {
      // 1) Load each not-yet-loaded queue's tokens / stage log / variations.
      const toLoad = this.selectedQueueIds.filter(qid => !this.loadedTokenQueues.has(qid));
      const loaded = (await Promise.all(toLoad.map(async qid => {
        const q = this.queues.find(x => x.id === qid);
        if (!q) return null;
        const [tokSnap, logSnap, varSnap] = await Promise.all([
          getDocs(query(collection(this.firestore, 'queue_token'), where('queueref', '==', q.ref))),
          getDocs(query(collection(this.firestore, 'queue stage log'), where('queueref', '==', q.ref))),
          getDocs(query(collection(this.firestore, 'queue variation'), where('queueref', '==', q.ref))),
          this.resolveQueueProducts(q)   // #8/#5: which product(s) this queue is mapped to
        ]);
        const vmap: Record<string, string> = {};
        varSnap.docs.forEach(d => { vmap[d.id] = d.data()['variationname'] ?? d.id; });
        q.variations = vmap;
        // Active tokens → the queue membership; keep the latest per profile (for slot bookings).
        const byPid = new Map<string, { ms: number; currentstage: string; selectedstageslot: any }>();
        tokSnap.docs.forEach(d => {
          const x = d.data();
          if (x['delete'] === true) return;
          if (x['tokenstatus'] !== 'Active') return;
          const pid = x['profile_id'] ?? x['profileid'];
          if (!pid) return;
          const ms = this.toMillis(x['logdate']);
          const prev = byPid.get(pid);
          if (!prev || ms >= prev.ms) byPid.set(pid, { ms, currentstage: x['currentstage'] ?? '', selectedstageslot: x['selectedstageslot'] ?? {} });
        });
        const latestByPid = new Map<string, { ms: number; currentstage: string }>();
        const completedByPid = new Map<string, Record<string, number>>();
        logSnap.docs.forEach(d => {
          const x = d.data();
          const pid = x['profile_id'] ?? x['profileid'];
          if (!pid) return;
          const ms = this.toMillis(x['logdate']);
          if (!ms) return;
          const cur = x['currentstage'];
          if (cur) { const p = latestByPid.get(pid); if (!p || ms > p.ms) latestByPid.set(pid, { ms, currentstage: cur }); }
          const prevStage = x['previousstage'];
          if (prevStage) {
            const rec = completedByPid.get(pid) ?? {};
            if (!rec[prevStage] || ms > rec[prevStage]) rec[prevStage] = ms;
            completedByPid.set(pid, rec);
          }
        });
        return { qid, byPid, latestByPid, completedByPid };
      }))).filter(Boolean) as { qid: string; byPid: Map<string, { ms: number; currentstage: string; selectedstageslot: any }>; latestByPid: Map<string, { ms: number; currentstage: string }>; completedByPid: Map<string, Record<string, number>> }[];

      // 2) Union in active queue members who aren't already participants (fetch their metadata; status '').
      const knownPids = new Set(this.stageRows.map(r => r.profileid));
      const newPids = new Set<string>();
      loaded.forEach(pq => pq.byPid.forEach((_v, pid) => { if (!knownPids.has(pid)) newPids.add(pid); }));
      if (newPids.size) {
        const newRows = await Promise.all([...newPids].map(pid => this.buildRowFromMeta(pid, '')));
        this.stageRows = [...this.stageRows, ...newRows];
      }

      // 3) Assign tokens to every participant for the freshly-loaded queues.
      loaded.forEach(({ qid, byPid, latestByPid, completedByPid }) => {
        this.stageRows.forEach(r => {
          const t = byPid.get(r.profileid);
          const latest = latestByPid.get(r.profileid);
          const completedAt = completedByPid.get(r.profileid) ?? {};
          if (t || latest || Object.keys(completedAt).length) {
            r.tokens[qid] = { currentstage: latest?.currentstage ?? t?.currentstage ?? '', selectedstageslot: t?.selectedstageslot ?? {}, completedAt, lastMs: Math.max(latest?.ms ?? 0, t?.ms ?? 0) };
          }
        });
        this.loadedTokenQueues.add(qid);
      });
      this.stageRows = [...this.stageRows].sort((a, b) => (a.name || 'zzz').localeCompare(b.name || 'zzz'));
    } catch (e) {
      console.log('queue token load failed', e);
    } finally {
      this.loadingQueue = false;
    }
    this.computeCohortSummary().catch(e => console.log('cohort summary failed', e));
  }

  // Resolve a queue's product ids once, from its arena events (docid ∈ arenaeventidlist).
  // Chunked to respect Firestore's `in` limit. Drives #8 (current stage) and #5 (DFU ongoing).
  private async resolveQueueProducts(q: QueueOption): Promise<void> {
    if (q.productIds.length || !q.arenaeventidlist.length) return;
    const prods = new Set<string>();
    try {
      for (let i = 0; i < q.arenaeventidlist.length; i += 30) {
        const chunk = q.arenaeventidlist.slice(i, i + 30).filter(Boolean);
        if (!chunk.length) continue;
        const snap = await getDocs(query(collection(this.firestore, 'arena events'), where('docid', 'in', chunk)));
        snap.docs.forEach(d => { const pid = (d.data() as any)['productref']?.id; if (pid) prods.add(pid); });
      }
      q.productIds = [...prods];
    } catch (e) { console.log('resolve queue products failed', e); }
  }

  // ---- Merged stage columns ----
  private buildMergedStages() {
    const multi = this.selectedQueueIds.length > 1;
    const cols: StageCol[] = [];
    this.selectedQueueIds.forEach(qid => {
      const q = this.queues.find(x => x.id === qid);
      if (!q) return;
      q.stages.forEach(stage => cols.push({
        queueId: qid, queueName: q.name, stage, key: qid + '|' + stage,
        label: multi ? `${stage} · ${q.name}` : stage
      }));
    });
    this.mergedStages = cols;
    // Drop added columns / stage filter that no longer exist.
    const validKeys = new Set(cols.map(c => c.key));
    this.addedCols = this.addedCols.filter(c => validKeys.has(c.key));
    this.syncCompletedStage();
    if (this.stageFilter && this.stageFilter !== '__none' && !this.currentStageOptions.includes(this.stageFilter)) {
      this.stageFilter = '';
    }
  }

  get availableCols(): StageCol[] {
    const added = new Set(this.addedCols.map(c => c.key));
    return this.mergedStages.filter(c => !added.has(c.key));
  }
  addCol() {
    const c = this.mergedStages.find(x => x.key === this.colToAdd);
    if (c && !this.addedCols.some(a => a.key === c.key)) {
      // keep in merged order
      const added = new Set([...this.addedCols.map(a => a.key), c.key]);
      this.addedCols = this.mergedStages.filter(x => added.has(x.key));
    }
    this.colToAdd = '';
  }
  removeCol(key: string) { this.addedCols = this.addedCols.filter(c => c.key !== key); this.syncCompletedStage(); }
  addAllCols() { this.addedCols = [...this.mergedStages]; }
  clearCols() { this.addedCols = []; this.syncCompletedStage(); }

  // ---- Step 4: combined stage-column builder ----
  ssStagesFor(qid: string): SsOption[] {
    const q = this.queues.find(x => x.id === qid);
    return this.ssFrom(q?.stages ?? [], 'Any stage');
  }
  setBuilderStage(qid: string, stage: string) { this.builderSel[qid] = stage; }
  get builderCanAdd(): boolean {
    return !!this.builderName.trim() && this.selectedQueueIds.some(qid => !!this.builderSel[qid]);
  }
  addCombinedCol() {
    if (!this.builderCanAdd) return;
    const byQueue: Record<string, string> = {};
    this.selectedQueueIds.forEach(qid => { if (this.builderSel[qid]) byQueue[qid] = this.builderSel[qid]; });
    this.combinedCols.push({ id: 'cc' + (++this.combinedSeq), name: this.builderName.trim(), byQueue });
    this.builderName = '';
    this.builderSel = {};
    this.syncCompletedStage();
  }
  removeCombinedCol(id: string) {
    this.combinedCols = this.combinedCols.filter(c => c.id !== id);
    this.syncCompletedStage();
  }
  // Mapping summary for a combined column, e.g. [{queueName:'MIG', stage:'Diagnostics'}].
  combinedColTags(cc: CombinedCol): { queueName: string; stage: string }[] {
    return this.selectedQueueIds
      .filter(qid => cc.byQueue[qid])
      .map(qid => ({ queueName: this.queues.find(q => q.id === qid)?.name ?? '', stage: cc.byQueue[qid] }));
  }
  // Resolve a combined column to the single (queue, stage) to display for THIS participant:
  // prefer a mapped queue they are in AND have crossed; else booked; else first present; else null.
  private resolveCombined(r: StageRow, cc: CombinedCol): StageCol | null {
    const present = this.selectedQueueIds.filter(qid => cc.byQueue[qid] && r.tokens[qid]);
    if (!present.length) return null;
    const toCol = (qid: string): StageCol => ({
      queueId: qid, queueName: this.queues.find(q => q.id === qid)?.name ?? '',
      stage: cc.byQueue[qid], key: qid + '|' + cc.byQueue[qid], label: cc.name
    });
    const crossed = present.find(qid => this.crossedStage(r, toCol(qid)));
    if (crossed) return toCol(crossed);
    const booked = present.find(qid => this.isBooked(r, toCol(qid)));
    return toCol(booked ?? present[0]);
  }
  combinedCrossed(r: StageRow, cc: CombinedCol): boolean {
    const col = this.resolveCombined(r, cc); return col ? this.crossedStage(r, col) : false;
  }
  combinedCompletedLabel(r: StageRow, cc: CombinedCol): string {
    const col = this.resolveCombined(r, cc); return col ? this.completedLabel(r, col) : '';
  }
  combinedSlotCell(r: StageRow, cc: CombinedCol): string {
    const col = this.resolveCombined(r, cc); return col ? this.slotCell(r, col) : '';
  }
  combinedSlotKind(r: StageRow, cc: CombinedCol): 'done' | 'booked' | 'none' {
    const col = this.resolveCombined(r, cc); return col ? this.slotKind(r, col) : 'none';
  }

  // Stages available to the "Completed date" stage picker = only the added table columns.
  get completedStageOptions(): string[] {
    return [...new Set(this.addedCols.map(c => c.stage))];
  }
  // Drop the completed-date stage selection if its column is no longer in the table.
  private syncCompletedStage() {
    if (this.completedStage && !this.combinedCols.some(c => c.id === this.completedStage)) this.completedStage = '';
  }

  // ---- Per (queue, stage) computations ----
  private token(r: StageRow, col: StageCol) { return r.tokens[col.queueId]; }
  // A stage is COMPLETED only when the participant's activity history records a transition OUT
  // of that specific stage (`completedAt[stage]`, built from `queue stage log` previousstage
  // entries in loadSelectedTokens). This is activity-based, NOT queue-position-based: if a
  // participant skipped a stage (no log entry for it) and moved to a later one, the skipped
  // stage is not completed. The position concept ("reached or passed a point") is a different
  // thing and lives separately in `isReady` — do not route it through here.
  crossedStage(r: StageRow, col: StageCol): boolean {
    return this.completedMs(r, col) > 0;
  }
  completedLabel(r: StageRow, col: StageCol): string {
    return this.crossedStage(r, col) ? 'Completed' : 'Not completed';
  }
  // A slot counts as "booked" only if it is LIVE or UPCOMING — a fully-past appointment
  // (enddate before now; or, with no enddate, a start before today) is not an active booking,
  // so it reads as "Not booked" and surfaces the participant for rebooking.
  isBooked(r: StageRow, col: StageCol): boolean {
    const slot = this.token(r, col)?.selectedstageslot?.[col.stage];
    return !!slot && this.slotIsActive(slot);
  }
  // Live (end at/after now) or upcoming; a dateless slot stays counted (cannot classify it).
  private slotIsActive(slot: any): boolean {
    const end = this.toMillis(slot['enddate']);
    if (end) return end >= Date.now();
    const start = this.toMillis(slot['startdate']);
    if (start) { const t = new Date(); t.setHours(0, 0, 0, 0); return start >= t.getTime(); }
    return true;
  }
  private slotStartMs(r: StageRow, col: StageCol): number {
    return this.toMillis(this.token(r, col)?.selectedstageslot?.[col.stage]?.['startdate']);
  }
  slotBooking(r: StageRow, col: StageCol): string {
    const slot = this.token(r, col)?.selectedstageslot?.[col.stage];
    if (!slot) return '';
    const start = this.toMillis(slot['startdate']);
    const end = this.toMillis(slot['enddate']);
    if (!start) return '';
    const time = this.formatTime(start) + (end ? ' – ' + this.formatTime(end) : '');
    return this.formatDate(start) + (time.trim() ? ', ' + time : '');
  }
  // Completion date of a stage = logdate of the stage-log doc that moved them out of it.
  completedMs(r: StageRow, col: StageCol): number {
    return this.token(r, col)?.completedAt?.[col.stage] ?? 0;
  }
  // The "Slot booking" cell: completed → completion date; else booked → slot; else not booked.
  slotCell(r: StageRow, col: StageCol): string {
    if (this.crossedStage(r, col)) {
      const ms = this.completedMs(r, col);
      return ms ? 'Completed ' + this.formatDate(ms) : 'Completed · no date';
    }
    if (this.isBooked(r, col)) return this.slotBooking(r, col) || 'Booked';
    return 'Not booked';
  }
  // Visual kind for the slot cell pill: completed / booked / none.
  slotKind(r: StageRow, col: StageCol): 'done' | 'booked' | 'none' {
    if (this.crossedStage(r, col)) return 'done';
    if (this.isBooked(r, col)) return 'booked';
    return 'none';
  }

  // Per-added-stage summary over the CURRENTLY FILTERED rows (the dashboard "pivot").
  get stageSummaries(): { label: string; completed: number; notCompleted: number; booked: number; notBooked: number }[] {
    const rows = this.filteredStageRows;
    return this.combinedCols.map(cc => {
      let completed = 0, booked = 0, notBooked = 0;
      rows.forEach(r => {
        const col = this.resolveCombined(r, cc);
        if (col && this.crossedStage(r, col)) completed++;
        else if (col && this.isBooked(r, col)) booked++;
        else notBooked++;
      });
      return { label: cc.name, completed, notCompleted: booked + notBooked, booked, notBooked };
    });
  }

  // "Not booked" = has at least one stage that is NOT completed and has NO slot booked.
  // Checked across the added stage columns (or all merged stages if none added yet).
  private notBookedCols(): StageCol[] { return this.addedCols.length ? this.addedCols : this.mergedStages; }
  isNotBooked(r: StageRow): boolean {
    if (!this.combinedCols.length) return this.notBookedCols().some(c => !this.crossedStage(r, c) && !this.isBooked(r, c));
    return this.combinedCols.some(cc => { const col = this.resolveCombined(r, cc); return !!col && !this.crossedStage(r, col) && !this.isBooked(r, col); });
  }

  // A participant's current stage(s) across the selected queues.
  private rowCurrentStages(r: StageRow): string[] {
    const out: string[] = [];
    this.selectedQueueIds.forEach(qid => { const cs = r.tokens[qid]?.currentstage; if (cs) out.push(cs); });
    return out;
  }
  currentStagesDisplay(r: StageRow): string {
    const multi = this.selectedQueueIds.length > 1;
    const parts: string[] = [];
    this.selectedQueueIds.forEach(qid => {
      const cs = r.tokens[qid]?.currentstage;
      if (cs) { const q = this.queues.find(x => x.id === qid); parts.push(multi ? `${cs} (${q?.name})` : cs); }
    });
    return parts.join(', ');
  }
  get currentStageOptions(): string[] {
    const set = new Set<string>();
    this.selectedQueueIds.forEach(qid => {
      const q = this.queues.find(x => x.id === qid);
      q?.stages.forEach(s => set.add(s));
    });
    return [...set];
  }
  // Selected queues in display order → one "Current stage" column each.
  get selectedQueues(): QueueOption[] {
    return this.selectedQueueIds.map(qid => this.queues.find(q => q.id === qid)).filter(Boolean) as QueueOption[];
  }
  currentStageFor(r: StageRow, qid: string): string {
    return r.tokens[qid]?.currentstage ?? '';
  }
  // #8 — a queue is "active" for a participant when its mapped product(s) include one of the
  // participant's currently-active products (metadata activeproduct).
  private queueMatchesActiveProduct(r: StageRow, qid: string): boolean {
    if (!r.activeProducts.length) return false;
    const prods = this.queues.find(q => q.id === qid)?.productIds ?? [];
    return prods.some(p => r.activeProducts.includes(p));
  }
  // One "Current stage" cell: the stage of the queue mapped to the participant's currently active
  // product; when several apply, the most recently active one (latest token/log activity). Falls
  // back to the most-recent selected-queue stage when no active-product mapping is available.
  currentStagePairs(r: StageRow): { stage: string; queueName: string }[] {
    const withStage = this.selectedQueueIds.filter(qid => r.tokens[qid]?.currentstage);
    if (!withStage.length) return [];
    const active = withStage.filter(qid => this.queueMatchesActiveProduct(r, qid));
    const pick = (active.length ? active : withStage)
      .reduce((best, qid) => (r.tokens[qid].lastMs >= (r.tokens[best]?.lastMs ?? -1) ? qid : best));
    return [{ stage: r.tokens[pick].currentstage, queueName: this.queues.find(x => x.id === pick)?.name ?? '' }];
  }

  // ---- Journey (customerstatus-driven) + Segments displays ----
  journeyDisplay(r: StageRow): string {
    if (!r.journeyId) return '';
    return this.journeyMap[r.journeyId] ?? r.journeyId;
  }
  segmentsDisplay(r: StageRow): string {
    return (this.profileSegments[r.profileid] ?? []).join(', ');
  }
  private rowSegments(r: StageRow): string[] {
    return this.profileSegments[r.profileid] ?? [];
  }
  // Only segments that actually appear among the loaded participants (not every segment in the system).
  get segmentOptions(): string[] {
    const set = new Set<string>();
    this.stageRows.forEach(r => this.rowSegments(r).forEach(s => set.add(s)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  // Journeys that actually appear among the loaded participants.
  get journeyOptions(): string[] {
    const set = new Set<string>();
    this.stageRows.forEach(r => { const j = this.journeyDisplay(r); if (j) set.add(j); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  // ---- Product filter options (from the products collection map) ----
  get productOptions(): { id: string; name: string }[] {
    return Object.entries(this.mapProduct)
      .map(([id, name]) => ({ id, name: name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  productName(pid: string): string { return this.mapProduct[pid] || pid; }
  // #3 config: products not yet in a queue's eligible group (for the "+ Add product" picker).
  ssEligibleAddOpts(qid: string): SsOption[] {
    const chosen = new Set(this.queueEligibility[qid] || []);
    return [{ value: '', label: '+ Add product' }, ...this.productOptions.filter(p => !chosen.has(p.id)).map(p => ({ value: p.id, label: p.name }))];
  }
  // #3 filter: only queues that actually have an eligible-product group configured.
  get ssEligibilityOpts(): SsOption[] {
    const qs = this.selectedQueues.filter(q => (this.queueEligibility[q.id] || []).length);
    return [{ value: '', label: 'Any' }, ...qs.map(q => ({ value: q.id, label: q.name }))];
  }

  // ---- Searchable-dropdown option lists (SsOption = {value,label}) ----
  private ssFrom(values: string[], allLabel?: string, tail?: { value: string; label: string }): SsOption[] {
    const out: SsOption[] = [];
    if (allLabel !== undefined) out.push({ value: '', label: allLabel });
    values.forEach(v => out.push({ value: v, label: v }));
    if (tail) out.push(tail);
    return out;
  }
  readonly ssRequestOpts: SsOption[] = [
    { value: '', label: 'All' }, { value: 'requested', label: 'Requested' }, { value: 'approved', label: 'Approved' }
  ];
  readonly ssProductModeOpts: SsOption[] = [
    { value: 'only', label: 'Show only' }, { value: 'exclude', label: 'Remove' }
  ];
  get ssStageOpts(): SsOption[] { return this.ssFrom(this.currentStageOptions, 'All', { value: '__none', label: 'Not in queue' }); }
  get ssCustomerOpts(): SsOption[] { return this.ssFrom(this.customerStatusOptions, 'All'); }
  get ssVariationOpts(): SsOption[] { return this.ssFrom(this.variationOptions, 'All', { value: '__none', label: 'No variation' }); }
  get ssSegmentOpts(): SsOption[] { return this.ssFrom(this.segmentOptions, 'All'); }
  get ssJourneyOpts(): SsOption[] { return this.ssFrom(this.journeyOptions, 'All'); }
  get ssCompletedStageOpts(): SsOption[] {
    return [{ value: '', label: 'Any stage' }, ...this.combinedCols.map(c => ({ value: c.id, label: c.name }))];
  }
  get ssProductOpts(): SsOption[] {
    return [{ value: '', label: 'Any' }, ...this.productOptions.map(p => ({ value: p.id, label: p.name }))];
  }
  get ssAddColOpts(): SsOption[] {
    return [{ value: '', label: 'Select stage' }, ...this.availableCols.map(c => ({ value: c.key, label: c.label }))];
  }

  // A participant's variation in a queue = the variationid on their first booked slot
  // (queue-planner convention: variation is inferred from bookings, not stored on the token).
  private variationInQueue(r: StageRow, qid: string): string {
    const q = this.queues.find(x => x.id === qid);
    const slots = r.tokens[qid]?.selectedstageslot ?? {};
    const first = slots[Object.keys(slots)[0]];
    const vid = first?.['variationid'];
    return vid ? (q?.variations[vid] ?? '') : '';
  }
  private rowVariations(r: StageRow): string[] {
    const out: string[] = [];
    this.selectedQueueIds.forEach(qid => { const v = this.variationInQueue(r, qid); if (v) out.push(v); });
    return out;
  }
  variationsDisplay(r: StageRow): string {
    return [...new Set(this.rowVariations(r))].join(', ');
  }
  get variationOptions(): string[] {
    const set = new Set<string>();
    this.selectedQueueIds.forEach(qid => {
      const q = this.queues.find(x => x.id === qid);
      Object.values(q?.variations ?? {}).forEach(v => { if (v) set.add(v); });
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  // ===========================================================================
  // Navigation
  // ===========================================================================
  goToEvents() {
    this.step = 'events';
    this.selectedEvent = null;
    this.selectedArena = null;
    this.arenaRows = [];
    this.stageRows = [];
    this.summaryLoaded = false;
  }
  goToArenas() {
    if (!this.selectedEvent) return this.goToEvents();
    this.step = 'arenas';
    this.selectedArena = null;
    this.stageRows = [];
    this.summaryLoaded = false;
  }
  // Step 3 — back to the queue picker; keeps the current selection and loaded data.
  goToQueues() {
    if (!this.selectedArena) return this.goToArenas();
    this.step = 'queues';
  }
  // Step 4 — the plan for the selected queues (only meaningful with ≥1 queue).
  goToPlan() {
    if (!this.selectedQueueIds.length) return;
    this.step = 'plan';
  }

  // ===========================================================================
  // Filtering / paging
  // ===========================================================================
  get filteredEvents(): EventRow[] {
    const s = this.searchEvents.trim().toLowerCase();
    if (!s) return this.eventRows;
    return this.eventRows.filter(r => r.name.toLowerCase().includes(s));
  }
  get pagedEvents(): EventRow[] {
    const start = this.eventPageIndex * this.eventPageSize;
    return this.filteredEvents.slice(start, start + this.eventPageSize);
  }
  get isEventFiltered(): boolean { return this.searchEvents.trim().length > 0; }
  onEventPage(e: PageEvent) { this.eventPageIndex = e.pageIndex; this.eventPageSize = e.pageSize; }
  onEventSearch() { this.eventPageIndex = 0; }

  get customerStatusOptions(): string[] {
    const set = new Set<string>();
    this.stageRows.forEach(r => { if (r.customerStatus) set.add(r.customerStatus); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  // Completion dates that the "Completed date" filter matches against. Scoped to the
  // stage columns actually shown (added, or all merged stages if none added yet) and to
  // stages the participant has genuinely crossed — so the filter agrees with the visible
  // "Completed" pills instead of matching on stages that aren't displayed.
  private allCompletedMs(r: StageRow): number[] {
    if (!this.combinedCols.length) {
      return this.mergedStages.filter(c => this.crossedStage(r, c)).map(c => this.completedMs(r, c)).filter(ms => ms > 0);
    }
    const cols = this.completedStage ? this.combinedCols.filter(c => c.id === this.completedStage) : this.combinedCols;
    const out: number[] = [];
    cols.forEach(cc => { const col = this.resolveCombined(r, cc); if (col && this.crossedStage(r, col)) { const ms = this.completedMs(r, col); if (ms > 0) out.push(ms); } });
    return out;
  }
  private allSlotStartMs(r: StageRow): number[] {
    const out: number[] = [];
    this.selectedQueueIds.forEach(qid => {
      const slots = r.tokens[qid]?.selectedstageslot ?? {};
      Object.values(slots).forEach((slot: any) => { const ms = this.toMillis(slot?.['startdate']); if (ms) out.push(ms); });
    });
    return out;
  }
  private inDateRange(ms: number, fromStr: string, toStr: string): boolean {
    if (fromStr && ms < new Date(fromStr + 'T00:00:00').getTime()) return false;
    if (toStr && ms > new Date(toStr + 'T23:59:59').getTime()) return false;
    return true;
  }

  get filteredStageRows(): StageRow[] {
    const s = this.searchStage.trim().toLowerCase();
    const compActive = !!this.completedFrom || !!this.completedTo;
    const slotActive = !!this.slotFrom || !!this.slotTo;
    return this.stageRows.filter(r => {
      if (this.cardFilter === 'inqueue' && !this.inSelectedQueue(r)) return false;
      if (this.cardFilter === 'requested' && r.status !== 'requested') return false;
      if (this.cardFilter === 'approved' && r.status !== 'approved') return false;
      if (this.cardFilter === 'approved-nq' && !(r.status === 'approved' && !this.inSelectedQueue(r))) return false;
      if (this.cardFilter === 'ready' && !this.isReady(r)) return false;
      if (this.cardFilter === 'dfu' && !this.isDfuOngoing(r)) return false;
      if (this.requestFilter && r.status !== this.requestFilter) return false;
      const cs = this.rowCurrentStages(r);
      if (this.stageFilter === '__none') { if (cs.length) return false; }
      else if (this.stageFilter && !cs.includes(this.stageFilter)) return false;
      if (this.customerFilter && r.customerStatus !== this.customerFilter) return false;
      if (this.variationFilter) {
        const vs = this.rowVariations(r);
        if (this.variationFilter === '__none') { if (vs.length) return false; }
        else if (!vs.includes(this.variationFilter)) return false;
      }
      if (this.segmentFilter && !this.rowSegments(r).includes(this.segmentFilter)) return false;
      if (this.journeyFilters.length && !this.journeyFilters.includes(this.journeyDisplay(r))) return false;
      if (this.productFilter) {
        const has = r.unconsumedProducts.includes(this.productFilter);
        if (this.productMode === 'only' && !has) return false;   // keep only those who have it unconsumed
        if (this.productMode === 'exclude' && has) return false;  // remove those who have it unconsumed
      }
      if (this.eligibilityFilter && !this.isEligibleFor(r, this.eligibilityFilter)) return false;
      if (this.notBookedOnly && !this.isNotBooked(r)) return false;
      if (compActive && !this.allCompletedMs(r).some(ms => this.inDateRange(ms, this.completedFrom, this.completedTo))) return false;
      if (slotActive && !this.allSlotStartMs(r).some(ms => this.inDateRange(ms, this.slotFrom, this.slotTo))) return false;
      if (!s) return true;
      return r.name.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        r.phone.toLowerCase().includes(s) ||
        r.customerStatus.toLowerCase().includes(s) ||
        cs.join(' ').toLowerCase().includes(s);
    });
  }
  get pagedStageRows(): StageRow[] {
    const start = this.stagePageIndex * this.stagePageSize;
    return this.filteredStageRows.slice(start, start + this.stagePageSize);
  }
  // Active filters as removable chips (excludes the free-text search, which has its own field).
  get activeFilters(): { label: string; clear: () => void }[] {
    const out: { label: string; clear: () => void }[] = [];
    const clr = (fn: () => void) => { fn(); this.onFilterChange(); };
    if (this.requestFilter) out.push({ label: this.requestFilter, clear: () => clr(() => this.requestFilter = '') });
    if (this.stageFilter) out.push({ label: 'Stage: ' + (this.stageFilter === '__none' ? 'Not in queue' : this.stageFilter), clear: () => clr(() => this.stageFilter = '') });
    if (this.customerFilter) out.push({ label: this.customerFilter, clear: () => clr(() => this.customerFilter = '') });
    if (this.variationFilter) out.push({ label: 'Variation: ' + (this.variationFilter === '__none' ? 'None' : this.variationFilter), clear: () => clr(() => this.variationFilter = '') });
    if (this.segmentFilter) out.push({ label: 'Segment: ' + this.segmentFilter, clear: () => clr(() => this.segmentFilter = '') });
    this.journeyFilters.forEach(j => out.push({ label: 'Journey: ' + j, clear: () => clr(() => this.journeyFilters = this.journeyFilters.filter(x => x !== j)) }));
    if (this.productFilter) out.push({ label: 'Product: ' + this.productFilter, clear: () => clr(() => { this.productFilter = ''; this.productMode = 'only'; }) });
    if (this.eligibilityFilter) out.push({ label: 'Eligible: ' + (this.queues.find(q => q.id === this.eligibilityFilter)?.name ?? ''), clear: () => clr(() => this.eligibilityFilter = '') });
    if (this.completedFrom || this.completedTo) out.push({ label: 'Completed ' + (this.completedFrom || '…') + ' – ' + (this.completedTo || '…'), clear: () => clr(() => { this.completedFrom = ''; this.completedTo = ''; this.completedStage = ''; }) });
    if (this.slotFrom || this.slotTo) out.push({ label: 'Slot ' + (this.slotFrom || '…') + ' – ' + (this.slotTo || '…'), clear: () => clr(() => { this.slotFrom = ''; this.slotTo = ''; }) });
    if (this.notBookedOnly) out.push({ label: 'Not booked', clear: () => clr(() => this.notBookedOnly = false) });
    return out;
  }
  get activeFilterCount(): number { return this.activeFilters.length; }
  get isStageFiltered(): boolean {
    return this.searchStage.trim().length > 0 || !!this.requestFilter || !!this.stageFilter || !!this.customerFilter
      || !!this.variationFilter || !!this.segmentFilter || this.journeyFilters.length > 0 || !!this.productFilter
      || !!this.completedFrom || !!this.completedTo || !!this.slotFrom || !!this.slotTo || this.notBookedOnly || !!this.eligibilityFilter;
  }
  onStagePage(e: PageEvent) { this.stagePageIndex = e.pageIndex; this.stagePageSize = e.pageSize; }
  onStageSearch() { this.stagePageIndex = 0; }
  onFilterChange() { this.stagePageIndex = 0; }
  // Clicking a cohort card quick-filters the table to that subset (click the active card again to clear).
  toggleCardFilter(key: string) { this.cardFilter = this.cardFilter === key ? '' : key; this.stagePageIndex = 0; }
  toggleJourneyFilter(j: string) {
    this.journeyFilters = this.journeyFilters.includes(j) ? this.journeyFilters.filter(x => x !== j) : [...this.journeyFilters, j];
    this.onFilterChange();
  }
  isJourneyFiltered(j: string): boolean { return this.journeyFilters.includes(j); }
  openParticipant(r: StageRow) { this.selectedParticipant = r; }
  closeParticipant() { this.selectedParticipant = null; }
  clearFilters() {
    this.searchStage = ''; this.requestFilter = ''; this.stageFilter = ''; this.customerFilter = '';
    this.variationFilter = ''; this.segmentFilter = ''; this.journeyFilters = []; this.productFilter = ''; this.productMode = 'only'; this.eligibilityFilter = '';
    this.completedFrom = ''; this.completedTo = ''; this.completedStage = '';
    this.slotFrom = ''; this.slotTo = '';
    this.notBookedOnly = false;
    this.cardFilter = '';
    this.stagePageIndex = 0;
  }

  // ---- CSV export (base columns + each added stage column's Completed / Slot) ----
  exportCsv() {
    if (!this.selectedArena || !this.filteredStageRows.length) return;
    const esc = (v: any) => {
      const s = (v ?? '').toString();
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const multiQ = this.selectedQueues.length > 1;
    const header = ['Name', 'Email', 'Phone', 'Customer status', 'Journey', 'Segments', 'Request', 'Variation'];
    this.selectedQueues.forEach(q => header.push(multiQ ? `Current stage · ${q.name}` : 'Current stage'));
    this.combinedCols.forEach(cc => header.push(`${cc.name} - Completed`, `${cc.name} - Slot booking`));
    const lines = [header.map(esc).join(',')];
    this.filteredStageRows.forEach(r => {
      const cells = [r.name, r.email, r.phone, r.customerStatus, this.journeyDisplay(r), this.segmentsDisplay(r), r.status, this.variationsDisplay(r)];
      this.selectedQueues.forEach(q => cells.push(this.currentStageFor(r, q.id)));
      this.combinedCols.forEach(cc => {
        cells.push(this.combinedCompletedLabel(r, cc));
        cells.push(this.combinedSlotCell(r, cc));
      });
      lines.push(cells.map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stage-data_${(this.selectedArena.productName || 'event').replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===========================================================================
  // Sheet reconcile — import a sheet (Name and/or Email column) and diff it
  // against the participants currently loaded in the table.
  // ===========================================================================
  private normEmail(s: any): string { return (s ?? '').toString().trim().toLowerCase(); }
  private normName(s: any): string { return (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' '); }

  onImportSheet(event: any) {
    const file = event.target?.files?.[0];
    if (event.target) event.target.value = '';   // allow re-importing the same file
    if (!file) return;
    this.reconcileError = '';
    this.reconcileFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][]) || [];
        if (!rows.length) { this.reconcileError = 'The sheet is empty.'; this.showReconcile = true; return; }
        const headers = (rows[0] || []).map(h => (h ?? '').toString().trim().toLowerCase());
        let emailIdx = headers.findIndex(h => h === 'email');
        if (emailIdx === -1) emailIdx = headers.findIndex(h => h.includes('email'));
        let nameIdx = headers.findIndex(h => h === 'name');
        if (nameIdx === -1) nameIdx = headers.findIndex(h => h.includes('name'));
        if (emailIdx === -1 && nameIdx === -1) {
          this.reconcileError = 'No "Name" or "Email" column found in the sheet header.';
          this.showReconcile = true; return;
        }
        this.reconcile(rows.slice(1), emailIdx, nameIdx);
      } catch (err) {
        console.log('sheet import failed', err);
        this.reconcileError = 'Could not read the file. Use a .xlsx / .csv with a Name or Email column.';
        this.showReconcile = true;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  private reconcile(dataRows: any[][], emailIdx: number, nameIdx: number) {
    const sheet = dataRows.map(r => ({
      name: nameIdx > -1 ? (r[nameIdx] ?? '').toString().trim() : '',
      email: emailIdx > -1 ? (r[emailIdx] ?? '').toString().trim() : ''
    })).filter(s => s.name || s.email);

    const tableEmails = new Set<string>(), tableNames = new Set<string>();
    this.stageRows.forEach(r => {
      const e = this.normEmail(r.email); if (e) tableEmails.add(e);
      const n = this.normName(r.name); if (n) tableNames.add(n);
    });
    const sheetEmails = new Set<string>(), sheetNames = new Set<string>();
    sheet.forEach(s => {
      const e = this.normEmail(s.email); if (e) sheetEmails.add(e);
      const n = this.normName(s.name); if (n) sheetNames.add(n);
    });

    // A person is a match if EITHER their email OR their name is present on the other side.
    this.extraInSheet = sheet.filter(s => {
      const e = this.normEmail(s.email), n = this.normName(s.name);
      return !((e && tableEmails.has(e)) || (n && tableNames.has(n)));
    });
    this.extraInTable = this.stageRows.filter(r => {
      const e = this.normEmail(r.email), n = this.normName(r.name);
      return !((e && sheetEmails.has(e)) || (n && sheetNames.has(n)));
    });

    this.sheetCount = sheet.length;
    this.matchedCount = this.stageRows.length - this.extraInTable.length;
    this.showReconcile = true;
  }

  closeReconcile() { this.showReconcile = false; }

  exportReconcile() {
    const esc = (v: any) => {
      const s = (v ?? '').toString();
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = ['Source,Name,Email'];
    this.extraInTable.forEach(r => lines.push(['In table, not in sheet', r.name, r.email].map(esc).join(',')));
    this.extraInSheet.forEach(s => lines.push(['In sheet, not in table', s.name, s.email].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sheet-diff_${(this.selectedArena?.productName || 'event').replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===========================================================================
  // Display helpers
  // ===========================================================================
  toMillis(d: any): number {
    try {
      if (d?.toMillis) return d.toMillis();
      if (d?.toDate) return d.toDate().getTime();
      if (d) return new Date(d).getTime();
    } catch { }
    return 0;
  }
  formatDate(ms: number): string {
    return ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }
  formatTime(ms: number): string {
    return ms ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  }
  formatRange(start: number, end: number): string {
    if (start && end && start !== end) return this.formatDate(start) + ' – ' + this.formatDate(end);
    return this.formatDate(end || start);
  }
}
