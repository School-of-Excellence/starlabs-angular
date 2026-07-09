import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore, collection, query, orderBy, where, getDocs, doc, getDoc
} from '@angular/fire/firestore';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';

import { AuthguardService } from '../../authguard.service';

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
  variations: Record<string, string>;   // variationId → variationname (from `queue variation`)
}

// A stage column = one stage of one selected queue (merged across all selected queues).
interface StageCol {
  queueId: string;
  queueName: string;
  stage: string;
  key: string;            // queueId + '|' + stage
  label: string;          // stage (or "stage · queue" when >1 queue selected)
}

// Step 3 — one participant. Metadata columns + a token per selected queue.
interface StageRow {
  profileid: string;
  name: string;
  email: string;
  phone: string;
  customerStatus: string;
  status: string;
  // by queueId: current stage, slot bookings, and completion dates (previousstage → logdate ms)
  tokens: Record<string, { currentstage: string; selectedstageslot: any; completedAt: Record<string, number> }>;
  metaMissing: boolean;
}

const PAST_WINDOW_MS = 180 * 86400000;

type Step = 'events' | 'arenas' | 'participants';

@Component({
  selector: 'app-events-stage-data',
  standalone: true,
  imports: [CommonModule, FormsModule, MatPaginatorModule],
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
  loadingStage = false;
  stageError = false;
  searchStage = '';
  stagePageIndex = 0;
  stagePageSize = 25;

  queues: QueueOption[] = [];            // all live queues (+ mapped ones)
  selectedQueueIds: string[] = [];       // multi-select
  loadingQueue = false;
  mergedStages: StageCol[] = [];         // stages of all selected queues, merged
  addedCols: StageCol[] = [];            // stage columns the operator added
  colToAdd = '';                         // dropdown selection (a StageCol.key)

  // Filters
  requestFilter = '';    // '' | 'requested' | 'approved'
  stageFilter = '';      // '' | a stage name | '__none' (not in any selected queue)
  customerFilter = '';   // '' | a customerstatus value
  variationFilter = '';  // '' | a variation name | '__none' (no booked slot → unknown variation)
  completedFrom = '';    // yyyy-mm-dd — stage completion date range
  completedTo = '';
  slotFrom = '';         // yyyy-mm-dd — slot start-date range
  slotTo = '';
  notBookedOnly = false; // show only participants with an unbooked (not-completed, no-slot) stage

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
    this.requestFilter = '';
    this.stageFilter = '';
    this.customerFilter = '';
    this.variationFilter = '';
    this.completedFrom = ''; this.completedTo = '';
    this.slotFrom = ''; this.slotTo = '';
    this.notBookedOnly = false;
    this.step = 'participants';
    await this.loadParticipants(row);
    await this.loadQueues(row);
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

      const rows: StageRow[] = await Promise.all([...statusByPid.keys()].map(async pid => {
        const reqStatus = statusByPid.get(pid) ?? 'approved';
        try {
          const metaSnap = await getDoc(doc(this.firestore, 'participant metadata', pid));
          const m: any = metaSnap.exists() ? metaSnap.data() : null;
          return {
            profileid: pid,
            name: m?.['name'] ?? '',
            email: m?.['email'] ?? '',
            phone: (m?.['phonenumber'] ?? m?.['number'] ?? '')?.toString?.() ?? '',
            customerStatus: m?.['customerstatus'] ?? '',
            status: reqStatus, tokens: {}, metaMissing: !m
          } as StageRow;
        } catch {
          return {
            profileid: pid, name: '', email: '', phone: '', customerStatus: '',
            status: reqStatus, tokens: {}, metaMissing: true
          } as StageRow;
        }
      }));

      rows.sort((a, b) => (a.name || 'zzz').localeCompare(b.name || 'zzz'));
      this.stageRows = rows;
    } catch (err) {
      console.log('stage-data participants load failed', err);
      this.stageError = true;
    } finally {
      this.loadingStage = false;
    }
  }

  // Load ALL live queues; default-select the queue(s) mapped to this arena event.
  private async loadQueues(row: ArenaRow) {
    this.loadingQueue = true;
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const todayStart = now.getTime();

      const qSnap = await getDocs(query(
        collection(this.firestore, 'queue generation'), orderBy('queueenddate', 'desc')));

      const queues: QueueOption[] = [];
      qSnap.docs.forEach(d => {
        const q = d.data();
        if (q['delete'] == true) return;
        const end = this.toMillis(q['queueenddate']);
        const mapped = (q['arenaeventidlist'] ?? []).includes(row.docid);
        const isLive = !end || end >= todayStart;
        if (!isLive && !mapped) return;
        queues.push({
          id: d.id, name: q['queuename'] ?? 'Queue', ref: d.ref,
          stages: Array.isArray(q['stages']) ? q['stages'] : [],
          mapped, endValue: end, variations: {}
        });
      });
      queues.sort((a, b) => (Number(b.mapped) - Number(a.mapped)) || (b.endValue - a.endValue));
      this.queues = queues;
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
  async toggleQueue(id: string, checked: boolean) {
    this.selectedQueueIds = checked
      ? [...this.selectedQueueIds, id]
      : this.selectedQueueIds.filter(q => q !== id);
    await this.loadSelectedTokens();
  }

  // Merge the stages of all selected queues, then load their tokens onto the rows.
  private async loadSelectedTokens() {
    this.buildMergedStages();
    // Clear tokens for queues no longer selected.
    const selected = new Set(this.selectedQueueIds);
    this.stageRows.forEach(r => {
      Object.keys(r.tokens).forEach(qid => { if (!selected.has(qid)) delete r.tokens[qid]; });
    });
    if (!this.selectedQueueIds.length) return;
    this.loadingQueue = true;
    try {
      await Promise.all(this.selectedQueueIds.map(async qid => {
        const q = this.queues.find(x => x.id === qid);
        if (!q || this.stageRows.some(r => r.tokens[qid])) return;   // already loaded
        // Token (current stage + slots), stage log (completion dates), and variations in parallel.
        const [tokSnap, logSnap, varSnap] = await Promise.all([
          getDocs(query(collection(this.firestore, 'queue_token'), where('queueref', '==', q.ref))),
          getDocs(query(collection(this.firestore, 'queue stage log'), where('queueref', '==', q.ref))),
          getDocs(query(collection(this.firestore, 'queue variation'), where('queueref', '==', q.ref)))
        ]);
        const vmap: Record<string, string> = {};
        varSnap.docs.forEach(d => { vmap[d.id] = d.data()['variationname'] ?? d.id; });
        q.variations = vmap;
        // Token: keep the LATEST one per profile (by logdate) — for the slot bookings.
        const byPid = new Map<string, { ms: number; currentstage: string; selectedstageslot: any }>();
        tokSnap.docs.forEach(d => {
          const x = d.data();
          if (x['delete'] === true) return;
          const pid = x['profile_id'] ?? x['profileid'];
          if (!pid) return;
          const ms = this.toMillis(x['logdate']);
          const prev = byPid.get(pid);
          if (!prev || ms >= prev.ms) {
            byPid.set(pid, { ms, currentstage: x['currentstage'] ?? '', selectedstageslot: x['selectedstageslot'] ?? {} });
          }
        });
        // Stage log per profile: current stage = the LATEST entry's `currentstage`; and
        // completion date per stage = latest logdate of the doc that moved them OUT (`previousstage`).
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
        this.stageRows.forEach(r => {
          const t = byPid.get(r.profileid);
          const latest = latestByPid.get(r.profileid);
          const completedAt = completedByPid.get(r.profileid) ?? {};
          if (t || latest || Object.keys(completedAt).length) {
            r.tokens[qid] = {
              // Current stage from the latest stage-log entry; fall back to the token.
              currentstage: latest?.currentstage ?? t?.currentstage ?? '',
              selectedstageslot: t?.selectedstageslot ?? {},
              completedAt
            };
          }
        });
      }));
    } catch (e) {
      console.log('queue token load failed', e);
    } finally {
      this.loadingQueue = false;
    }
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
  removeCol(key: string) { this.addedCols = this.addedCols.filter(c => c.key !== key); }
  addAllCols() { this.addedCols = [...this.mergedStages]; }
  clearCols() { this.addedCols = []; }

  // ---- Per (queue, stage) computations ----
  private token(r: StageRow, col: StageCol) { return r.tokens[col.queueId]; }
  crossedStage(r: StageRow, col: StageCol): boolean {
    const q = this.queues.find(x => x.id === col.queueId);
    const t = this.token(r, col);
    if (!q || !t) return false;
    const ci = q.stages.indexOf(t.currentstage);
    const si = q.stages.indexOf(col.stage);
    return ci > -1 && si > -1 && ci > si;
  }
  completedLabel(r: StageRow, col: StageCol): string {
    return this.crossedStage(r, col) ? 'Completed' : 'Not completed';
  }
  isBooked(r: StageRow, col: StageCol): boolean {
    const t = this.token(r, col);
    return !!(t && t.selectedstageslot && t.selectedstageslot[col.stage]);
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
      return ms ? 'Completed ' + this.formatDate(ms) : 'Completed';
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
    return this.addedCols.map(c => {
      let completed = 0, booked = 0, notBooked = 0;
      rows.forEach(r => {
        if (this.crossedStage(r, c)) completed++;
        else if (this.isBooked(r, c)) booked++;
        else notBooked++;
      });
      return { label: c.label, completed, notCompleted: booked + notBooked, booked, notBooked };
    });
  }

  // "Not booked" = has at least one stage that is NOT completed and has NO slot booked.
  // Checked across the added stage columns (or all merged stages if none added yet).
  private notBookedCols(): StageCol[] { return this.addedCols.length ? this.addedCols : this.mergedStages; }
  isNotBooked(r: StageRow): boolean {
    return this.notBookedCols().some(c => !this.crossedStage(r, c) && !this.isBooked(r, c));
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
  }
  goToArenas() {
    if (!this.selectedEvent) return this.goToEvents();
    this.step = 'arenas';
    this.selectedArena = null;
    this.stageRows = [];
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

  // All completion dates / slot start-dates for a participant across the selected queues.
  private allCompletedMs(r: StageRow): number[] {
    const out: number[] = [];
    this.selectedQueueIds.forEach(qid => {
      const rec = r.tokens[qid]?.completedAt ?? {};
      Object.values(rec).forEach(ms => { if (ms) out.push(ms as number); });
    });
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
  get isStageFiltered(): boolean {
    return this.searchStage.trim().length > 0 || !!this.requestFilter || !!this.stageFilter || !!this.customerFilter
      || !!this.variationFilter || !!this.completedFrom || !!this.completedTo || !!this.slotFrom || !!this.slotTo || this.notBookedOnly;
  }
  onStagePage(e: PageEvent) { this.stagePageIndex = e.pageIndex; this.stagePageSize = e.pageSize; }
  onStageSearch() { this.stagePageIndex = 0; }
  onFilterChange() { this.stagePageIndex = 0; }
  clearFilters() {
    this.searchStage = ''; this.requestFilter = ''; this.stageFilter = ''; this.customerFilter = '';
    this.variationFilter = '';
    this.completedFrom = ''; this.completedTo = ''; this.slotFrom = ''; this.slotTo = '';
    this.notBookedOnly = false;
    this.stagePageIndex = 0;
  }

  // ---- CSV export (base columns + each added stage column's Completed / Slot) ----
  exportCsv() {
    if (!this.selectedArena || !this.filteredStageRows.length) return;
    const esc = (v: any) => {
      const s = (v ?? '').toString();
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const header = ['Name', 'Email', 'Phone', 'Customer status', 'Request', 'Variation', 'Current stage'];
    this.addedCols.forEach(c => header.push(`${c.label} - Completed`, `${c.label} - Slot booking`));
    const lines = [header.map(esc).join(',')];
    this.filteredStageRows.forEach(r => {
      const cells = [r.name, r.email, r.phone, r.customerStatus, r.status, this.variationsDisplay(r), this.currentStagesDisplay(r)];
      this.addedCols.forEach(c => {
        cells.push(this.completedLabel(r, c));
        cells.push(this.slotCell(r, c));
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
