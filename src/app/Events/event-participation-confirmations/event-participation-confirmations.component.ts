import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore, collection, query, orderBy, where, getDocs
} from '@angular/fire/firestore';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthguardService } from '../../authguard.service';
import { ProductFunnelComponent } from './product-funnel.component';

interface OverviewRow {
  arena: any;
  eventName: string;
  productName: string;
  initial: string;
  avatarColor: string;
  dateLabel: string;
  endValue: number;
  startValue: number;
  isToday: boolean;
  potential: number | null;
  requested: number | null;
  approved: number | null;
  eligible: number | null;
  notEligible: number | null;
  frozen: boolean;
  eligibleLoaded: boolean;
  error: boolean;
}

interface OpenTab {
  key: string;
  arena: any;
  eventName: string;
  productName: string;
  eventEnd: number;
}

const TABS_KEY = 'epc_open_tabs';
const AVATAR_COLORS = ['#0a84ff', '#5856d6', '#30b0c7', '#ff9500', '#af52de', '#ff2d55', '#0fa37f'];
const PAST_WINDOW_MS = 180 * 86400000;

@Component({
  selector: 'app-event-participation-confirmations',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTabsModule, MatButtonModule, MatIconModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule, MatPaginatorModule, ProductFunnelComponent
  ],
  templateUrl: './event-participation-confirmations.component.html',
  styleUrl: './event-participation-confirmations.component.css'
})
export class EventParticipationConfirmationsComponent {

  mapProduct: Record<string, string> = {};
  overviewRows: OverviewRow[] = [];
  openTabs: OpenTab[] = [];
  selectedIndex = 0;
  loadingOverview = true;
  loadError = false;
  searchOverview = '';
  mode: 'upcoming' | 'past' = 'upcoming';

  pageIndex = 0;
  pageSize = 15;
  private tabsRestored = false;

  constructor(public firestore: Firestore, public guard: AuthguardService) {
    this.loadOverview();
  }

  async loadOverview() {
    this.loadingOverview = true;
    this.loadError = false;
    try {
      this.mapProduct = await this.guard.getProductMap();

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const todayStart = now.getTime();
      const todayEnd = todayStart + 86400000 - 1;
      const pastFloor = todayStart - PAST_WINDOW_MS;
      const inWindow = (end: number) =>
        this.mode === 'past' ? (end < todayStart && end >= pastFloor) : (end >= todayStart);

      const [eventSnap, queueSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'event collection'), orderBy('end_date', 'desc'))),
        getDocs(query(collection(this.firestore, 'queue generation'), orderBy('queueenddate', 'desc')))
      ]);

      const mapEvent: Record<string, any> = {};
      const refs: any[] = [];
      eventSnap.docs.forEach(d => {
        const data = d.data();
        const end = this.toMillis(data['end_date']);
        if (data['delete'] != true && inWindow(end)) {
          mapEvent[d.id] = { name: data['name'], end, start: this.toMillis(data['start_date']) };
          refs.push(d.ref);
        }
      });
      queueSnap.docs.forEach(d => {
        const data = d.data();
        const end = this.toMillis(data['queueenddate']);
        if (data['delete'] != true && inWindow(end)) {
          mapEvent[d.id] = { name: data['queuename'], end, start: this.toMillis(data['queuestartdate']) };
          refs.push(d.ref);
        }
      });

      const arenas: any[] = [];
      for (let i = 0; i < refs.length; i += 10) {
        const chunk = refs.slice(i, i + 10);
        const snap = await getDocs(query(
          collection(this.firestore, 'arena events'), where('eventref', 'in', chunk)));
        snap.docs.forEach(d => { const a = d.data(); if (a['delete'] != true) arenas.push(a); });
      }

      const rows: OverviewRow[] = arenas
        .filter(a => a['eventref'] && mapEvent[a['eventref'].id])
        .map(a => {
          const ev = mapEvent[a['eventref'].id];
          const start = ev?.start ?? 0;
          const end = ev?.end ?? 0;
          const eventName = ev?.name ?? 'Event';
          const productName = this.mapProduct[a['productref']?.id] ?? 'Product';
          const row: OverviewRow = {
            arena: a,
            eventName,
            productName,
            initial: this.initialFor(productName),
            avatarColor: this.avatarColorFor(a['docid'] || eventName),
            dateLabel: this.formatRange(start, end),
            endValue: end, startValue: start,
            isToday: !!start && start <= todayEnd && end >= todayStart,
            potential: null, requested: null, approved: null,
            eligible: null, notEligible: null, frozen: false, eligibleLoaded: false, error: false
          };
          const snap = a['epc_snapshot'];
          if (snap) {
            row.potential = snap['potential'] ?? null;
            row.requested = snap['requested'] ?? null;
            row.approved = snap['approved'] ?? null;
            row.eligible = snap['eligible'] ?? null;
            row.notEligible = (snap['noProduct'] ?? 0) + (snap['inQueue'] ?? 0);
            row.frozen = true;
            row.eligibleLoaded = true;
          }
          return row;
        });
      rows.sort((x, y) => (y.endValue - x.endValue) || x.eventName.localeCompare(y.eventName));
      this.overviewRows = rows;
      this.loadingOverview = false;

      if (!this.tabsRestored) { this.restoreTabs(); this.tabsRestored = true; }
      this.computePageEligibility();
    } catch (err) {
      console.log(err);
      this.loadError = true;
      this.loadingOverview = false;
    }
  }

  retry() { this.loadOverview(); }

  setMode(m: 'upcoming' | 'past') {
    if (this.mode === m) return;
    this.mode = m;
    this.pageIndex = 0;
    this.searchOverview = '';
    this.overviewRows = [];
    this.loadOverview();
  }

  private async computePageEligibility() {
    const pending = this.pagedRows.filter(r => !r.eligibleLoaded);
    const CHUNK = 4;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async r => {
        try {
          const arena = r.arena;
          const [eprSnap, owners, active] = await Promise.all([
            getDocs(query(collection(this.firestore, 'event participation request'),
              where('arenaeventid', '==', arena['docid']), where('status', 'in', ['requested', 'approved']))),
            this.getOwners(arena['productref']),
            this.getActive(arena['eventref'])
          ]);
          const requestedIds = new Set<string>();
          const approvedIds = new Set<string>();
          eprSnap.docs.forEach(d => {
            const x = d.data();
            const pid = x['profileid'];
            if (!pid) return;
            if (x['status'] == 'approved') approvedIds.add(pid);
            else if (x['status'] == 'requested') requestedIds.add(pid);
          });
          approvedIds.forEach(p => requestedIds.delete(p));
          let eligible = 0;
          requestedIds.forEach(p => { if (owners.has(p) && !active.has(p)) eligible++; });
          r.potential = owners.size;
          r.requested = requestedIds.size;
          r.approved = approvedIds.size;
          r.eligible = eligible;
          r.notEligible = requestedIds.size - eligible;
          r.error = false;
          r.eligibleLoaded = true;
        } catch (e) {
          console.log('overview eligibility load failed', e);
          r.error = true;
          r.eligibleLoaded = true;
        }
      }));
    }
  }

  private ownersCache = new Map<string, Set<string>>();
  private activeCache = new Map<string, Set<string>>();
  private async getOwners(productref: any): Promise<Set<string>> {
    const key = productref?.id ?? String(productref);
    const cached = this.ownersCache.get(key);
    if (cached) return cached;
    const snap = await getDocs(query(collection(this.firestore, 'participantsproduct'),
      where('productref', '==', productref), where('status', '==', null)));
    const set = new Set<string>();
    snap.docs.forEach(d => { const x = d.data(); if (x['profileid']) set.add(x['profileid']); });
    this.ownersCache.set(key, set);
    return set;
  }
  private async getActive(eventref: any): Promise<Set<string>> {
    const key = eventref?.id ?? String(eventref);
    const cached = this.activeCache.get(key);
    if (cached) return cached;
    const snap = await getDocs(query(collection(this.firestore, 'queue_token'),
      where('queueref', '==', eventref)));
    const set = new Set<string>();
    snap.docs.forEach(d => {
      const x = d.data();
      if ((x['tokenstatus'] ?? '').toString().toLowerCase() == 'active' && x['profile_id']) set.add(x['profile_id']);
    });
    this.activeCache.set(key, set);
    return set;
  }

  private initialFor(name: string): string {
    const m = (name || '').trim();
    return m ? m[0].toUpperCase() : '?';
  }
  private avatarColorFor(key: string): string {
    const k = key || '';
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

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
  formatRange(start: number, end: number): string {
    if (start && end && start !== end) return this.formatDate(start) + ' – ' + this.formatDate(end);
    return this.formatDate(end || start);
  }

  get filteredRows(): OverviewRow[] {
    const s = this.searchOverview.trim().toLowerCase();
    if (!s) return this.overviewRows;
    return this.overviewRows.filter(r =>
      r.eventName.toLowerCase().includes(s) || r.productName.toLowerCase().includes(s));
  }
  get pagedRows(): OverviewRow[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredRows.slice(start, start + this.pageSize);
  }
  get isFiltered(): boolean { return this.searchOverview.trim().length > 0; }

  onPage(e: PageEvent) { this.pageIndex = e.pageIndex; this.pageSize = e.pageSize; this.computePageEligibility(); }
  onSearch() { this.pageIndex = 0; this.computePageEligibility(); }

  openProduct(row: OverviewRow) {
    const key = row.arena['docid'];
    const existing = this.openTabs.findIndex(t => t.key === key);
    if (existing >= 0) { this.selectedIndex = existing + 1; return; }
    this.openTabs.push({ key, arena: row.arena, eventName: row.eventName, productName: row.productName, eventEnd: row.endValue });
    this.selectedIndex = this.openTabs.length;
    this.saveTabs();
  }

  onRowKey(e: KeyboardEvent, row: OverviewRow) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openProduct(row); }
  }

  closeTab(i: number, ev?: Event) {
    ev?.stopPropagation();
    this.openTabs.splice(i, 1);
    if (i + 1 < this.selectedIndex) this.selectedIndex--;
    else if (this.selectedIndex > this.openTabs.length) this.selectedIndex = this.openTabs.length;
    this.saveTabs();
  }

  private saveTabs() {
    try { localStorage.setItem(TABS_KEY, JSON.stringify(this.openTabs.map(t => t.key))); } catch { }
  }
  private restoreTabs() {
    let keys: string[] = [];
    try { keys = JSON.parse(localStorage.getItem(TABS_KEY) || '[]'); } catch { keys = []; }
    if (!Array.isArray(keys) || !keys.length) return;
    this.openTabs = [];
    const seen = new Set<string>();
    keys.forEach(k => {
      if (seen.has(k)) return;
      seen.add(k);
      const row = this.overviewRows.find(r => r.arena['docid'] === k);
      if (row) this.openTabs.push({ key: k, arena: row.arena, eventName: row.eventName, productName: row.productName, eventEnd: row.endValue });
    });
    this.saveTabs();
  }
}
