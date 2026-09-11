import { Component, Inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  collection, getDocs, getFirestore, query, where, DocumentReference,
} from '@angular/fire/firestore';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

/** One person, whichever collection they came from. */
export interface CommRow {
  profileid: string;
  name: string;
  email: string;
  phone: string;
  /** Dial code without the plus sign, e.g. "91". */
  countryCode: string;
  kind: 'exist' | 'new';
  journeyId: string;
  journey: string;
  customerstatus: string;
  enrolled: boolean;
  /** For the senders, which read metadata['phonenumber'] etc. */
  metadata: any;
  /** Lower-cased once at build time so search is a single `includes` per row. */
  hay: string;
  /** Lower-cased sort keys, so sorting never lower-cases inside the comparator. */
  keys: { name: string; email: string; phone: string; journey: string; customerstatus: string };
}

/** The dashboard hands these in so the dialog reuses its send paths unchanged. */
export interface CommSenders {
  email: (recipients: any[]) => void | Promise<void>;
  whatsapp: (recipients: any[]) => void | Promise<void>;
  notification: (recipients: any[]) => void | Promise<void>;
}

/**
 * Communication — reach anyone, enrolled in this workshop or not.
 *
 * The dashboard deliberately loads participant metadata only for the enrolled
 * profiles (a `where('profileid','in',…)` batch per 30), because the collection
 * is large. This dialog is the one place that loads it whole, on demand, so the
 * side panel's WhatsApp / email / notification tools can also reach people who
 * have NOT enrolled. It opens only when asked, and everything it reads is a
 * one-shot `getDocs` — nothing here is a live listener.
 *
 * New-user rule (same as the dashboard): a `new_user_data` document with
 * `movedtoexist: true` is an EXISTING person; their live details come from
 * `participant metadata`.
 */
@Component({
  selector: 'app-communication-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatTableModule, MatSortModule, MatPaginatorModule,
    MatCheckboxModule, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule, MatProgressBarModule,
  ],
  templateUrl: './communication-dialog.component.html',
  styleUrls: ['./communication-dialog.component.css'],
})
export class CommunicationDialogComponent implements OnInit, OnDestroy {
  private get db() { return getFirestore(); }

  workshopId = '';
  workshopTitle = '';
  private workshopRef!: DocumentReference;
  private send!: CommSenders;

  loading = true;
  loadError = '';
  /** How many documents each read returned — shown so the load is auditable. */
  counts = { metadata: 0, newUsers: 0, moved: 0, enrolled: 0 };

  // ── data ──
  private all: CommRow[] = [];
  journeyNames: { [id: string]: string } = {};
  dataSource = new MatTableDataSource<CommRow>([]);
  displayedColumns = ['select', 'name', 'email', 'phone', 'journey', 'customerstatus', 'enrolled'];

  // The table lives inside *ngIf="!loading", so these only exist after the load —
  // a plain ngAfterViewInit would see undefined. Setters attach them whenever they appear.
  private paginator?: MatPaginator;
  @ViewChild(MatSort) set sortRef(sort: MatSort | undefined) { this.dataSource.sort = sort ?? null; }
  @ViewChild(MatPaginator) set paginatorRef(p: MatPaginator | undefined) { this.paginator = p; this.dataSource.paginator = p ?? null; }

  // ── filters ──
  audience: 'all' | 'exist' | 'new' = 'all';
  enrollment: 'all' | 'enrolled' | 'not' = 'all';
  search = '';
  statusFilters: string[] = [];
  journeyFilters: string[] = [];
  countryFilters: string[] = [];
  needPhone = false;
  needEmail = false;
  /** View the ticked people only — for a last look before sending. */
  onlySelected = false;

  // Typing re-filters once the operator pauses, not on every keystroke.
  private search$ = new Subject<string>();
  private searchSub: Subscription = this.search$.pipe(debounceTime(180), distinctUntilChanged())
    .subscribe(() => this.applyFilters());

  // ── selection — independent of the filters: a tick survives any search ──
  selected = new Set<string>();
  selectedRows: CommRow[] = [];
  selectedOpen = true;
  /** Chips are cheap, but 20 000 of them are not; the rest is a "+N more". */
  readonly chipLimit = 300;

  // ── derived once per filter/selection change, never per change-detection pass ──
  shown: CommRow[] = [];
  shownCount = 0;
  selectedShownCount = 0;
  recipientCount = 0;
  withPhone = 0;
  withEmail = 0;
  statusOptions: string[] = [];
  journeyOptions: { id: string; name: string }[] = [];
  countryOptions: string[] = [];

  constructor(
    public dialogRef: MatDialogRef<CommunicationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      workshopId: string; workshopTitle?: string; workshopRef: DocumentReference; send: CommSenders;
    },
  ) {
    this.workshopId = data?.workshopId || '';
    this.workshopTitle = data?.workshopTitle || '';
    this.workshopRef = data?.workshopRef;
    this.send = data?.send;
  }

  ngOnInit(): void {
    this.dataSource.sortingDataAccessor = (row, col) => {
      switch (col) {
        case 'enrolled': return row.enrolled ? 1 : 0;
        case 'phone': return row.keys.phone;
        default: return (row.keys as any)[col] ?? '';
      }
    };
    this.load();
  }

  ngOnDestroy(): void { this.searchSub.unsubscribe(); }

  // ───────────────────────────── loading ─────────────────────────────
  private str(v: any): string { return v === null || v === undefined ? '' : String(v).trim(); }

  /**
   * Merges the two people collections into one row per person. Pure — no
   * Firestore — so it can be tested against fixtures.
   *
   * Precedence: a `participant metadata` document always wins. A `new_user_data`
   * document only adds a row when nothing in metadata covers that id; a moved one
   * (`movedtoexist: true`) becomes an EXISTING row in that case, a fresh one a NEW
   * row. Note the country-code spelling differs between the two collections.
   */
  buildRows(
    meta: { id: string; data: any }[],
    newUsers: { id: string; data: any }[],
    enrolledIds: Set<string>,
  ): { rows: CommRow[]; fresh: number; moved: number } {
    const rows = new Map<string, CommRow>();

    meta.forEach(({ id: docId, data: m }) => {
      const id = this.str(m['profileid']) || docId;
      const journeyId = this.str(m['activejourney']);
      rows.set(id, this.indexed({
        profileid: id,
        name: this.str(m['name']),
        email: this.str(m['email']),
        phone: this.str(m['phonenumber']),
        countryCode: this.str(m['countrycode'] ?? m['countryCode']).replace(/^\+/, ''),   // metadata: lowercase
        kind: 'exist',
        journeyId,
        journey: journeyId ? (this.journeyNames[journeyId] || journeyId) : '',
        customerstatus: this.str(m['customerstatus']),
        enrolled: enrolledIds.has(id),
        metadata: m,
        hay: '', keys: null as any,
      }));
    });

    let fresh = 0, moved = 0;
    newUsers.forEach(({ id, data: n }) => {
      const isMoved = n['movedtoexist'] === true;
      if (isMoved) moved++; else fresh++;
      if (rows.has(id)) return;                      // metadata already covers this person
      rows.set(id, this.indexed({
        profileid: id,
        name: this.str(n['name']),
        email: this.str(n['email']),
        phone: this.str(n['phonenumber']),
        countryCode: this.str(n['countryCode'] ?? n['countrycode']).replace(/^\+/, ''),  // new_user_data: camelCase
        kind: isMoved ? 'exist' : 'new',
        journeyId: '', journey: '', customerstatus: '',
        enrolled: enrolledIds.has(id),
        metadata: n,
        hay: '', keys: null as any,
      }));
    });

    return { rows: Array.from(rows.values()), fresh, moved };
  }

  /** Computes the search haystack and sort keys once, when the row is built. */
  private indexed(r: CommRow): CommRow {
    r.keys = {
      name: r.name.toLowerCase(), email: r.email.toLowerCase(),
      phone: (r.countryCode + r.phone).toLowerCase(),
      journey: r.journey.toLowerCase(), customerstatus: r.customerstatus.toLowerCase(),
    };
    r.hay = `${r.keys.name} ${r.keys.email} ${r.keys.phone} ${r.phone} ${r.keys.journey} ${r.keys.customerstatus}`;
    return r;
  }

  /** Replaces the people list and re-applies the current filters. */
  useRows(rows: CommRow[]): void {
    this.all = rows;
    const statuses = new Set<string>(), countries = new Set<string>(), journeys = new Map<string, string>();
    rows.forEach(r => {
      if (r.kind === 'exist' && r.customerstatus) statuses.add(r.customerstatus);
      if (r.kind === 'exist' && r.journeyId) journeys.set(r.journeyId, r.journey);
      if (r.countryCode) countries.add(r.countryCode);
    });
    this.statusOptions = Array.from(statuses).sort();
    this.journeyOptions = Array.from(journeys, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    this.countryOptions = Array.from(countries).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    this.applyFilters();
  }

  private async load(): Promise<void> {
    this.loading = true; this.loadError = '';
    try {
      const [metaSnap, newSnap, enrolledSnap, journeySnap] = await Promise.all([
        getDocs(collection(this.db, 'participant metadata')),
        getDocs(collection(this.db, 'new_user_data')),
        getDocs(query(collection(this.db, 'workshop participant enrolled'), where('workshopref', '==', this.workshopRef))),
        getDocs(collection(this.db, 'journey')),
      ]);

      journeySnap.docs.forEach(d => { this.journeyNames[d.id] = this.str(d.data()?.['journey']) || d.id; });

      const enrolledIds = new Set<string>();
      enrolledSnap.docs.forEach(d => { const id = this.str(d.data()?.['profileid']); if (id) enrolledIds.add(id); });

      const built = this.buildRows(
        metaSnap.docs.map(d => ({ id: d.id, data: d.data() || {} })),
        newSnap.docs.map(d => ({ id: d.id, data: d.data() || {} })),
        enrolledIds,
      );
      this.counts = { metadata: metaSnap.size, newUsers: built.fresh, moved: built.moved, enrolled: enrolledIds.size };
      const rows = new Map(built.rows.map(r => [r.profileid, r]));

      this.useRows(Array.from(rows.values()));
    } catch (e: any) {
      console.error('Communication dialog load failed:', e);
      this.loadError = e?.message ? `Could not load people: ${e.message}` : 'Could not load people.';
    } finally {
      this.loading = false;
    }
  }

  // ───────────────────────────── filters ─────────────────────────────
  /** Existing-only filters are meaningless on new users, so they are hidden then. */
  get showExistFilters(): boolean { return this.audience !== 'new'; }

  private matches(r: CommRow, q: string): boolean {
    if (this.onlySelected && !this.selected.has(r.profileid)) return false;
    if (this.audience !== 'all' && r.kind !== this.audience) return false;
    if (this.enrollment === 'enrolled' && !r.enrolled) return false;
    if (this.enrollment === 'not' && r.enrolled) return false;
    if (this.statusFilters.length && !this.statusFilters.includes(r.customerstatus)) return false;
    if (this.journeyFilters.length && !this.journeyFilters.includes(r.journeyId)) return false;
    if (this.countryFilters.length && !this.countryFilters.includes(r.countryCode)) return false;
    if (this.needPhone && !r.phone) return false;
    if (this.needEmail && !r.email) return false;
    return !q || r.hay.includes(q);
  }

  /** One pass over the people, only when a filter actually changes. Nothing is re-queried. */
  applyFilters(): void {
    const q = this.search.trim().toLowerCase();
    this.shown = this.all.filter(r => this.matches(r, q));
    this.shownCount = this.shown.length;
    this.dataSource.data = this.shown;          // the data source only sorts + paginates
    if (this.paginator) this.paginator.firstPage();
    this.refreshCounts();
  }

  onSearchInput(): void { this.search$.next(this.search); }
  clearSearch(): void { this.search = ''; this.applyFilters(); }

  toggleMulti(list: string[], value: string): void {
    const i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1); else list.push(value);
    this.applyFilters();
  }

  setAudience(a: 'all' | 'exist' | 'new'): void {
    this.audience = a;
    if (a === 'new') { this.statusFilters = []; this.journeyFilters = []; }
    this.applyFilters();
  }
  setEnrollment(e: 'all' | 'enrolled' | 'not'): void { this.enrollment = e; this.applyFilters(); }

  /** Resets the view. The selection is not a filter and is left alone. */
  clearFilters(): void {
    this.audience = 'all'; this.enrollment = 'all'; this.search = '';
    this.statusFilters = []; this.journeyFilters = []; this.countryFilters = [];
    this.needPhone = false; this.needEmail = false; this.onlySelected = false;
    this.applyFilters();
  }
  get activeFilterCount(): number {
    return (this.audience !== 'all' ? 1 : 0) + (this.enrollment !== 'all' ? 1 : 0)
      + this.statusFilters.length + this.journeyFilters.length + this.countryFilters.length
      + (this.needPhone ? 1 : 0) + (this.needEmail ? 1 : 0) + (this.search.trim() ? 1 : 0)
      + (this.onlySelected ? 1 : 0);
  }

  // ───────────────────────────── selection ─────────────────────────────
  get allShownSelected(): boolean { return this.shownCount > 0 && this.selectedShownCount === this.shownCount; }
  get someShownSelected(): boolean { return this.selectedShownCount > 0 && !this.allShownSelected; }

  toggleRow(r: CommRow): void {
    this.selected.has(r.profileid) ? this.selected.delete(r.profileid) : this.selected.add(r.profileid);
    this.onlySelected ? this.applyFilters() : this.refreshCounts();
  }
  /** Ticks or unticks everyone currently shown; ticks made under other filters are kept. */
  toggleAllShown(): void {
    if (this.allShownSelected) this.shown.forEach(r => this.selected.delete(r.profileid));
    else this.shown.forEach(r => this.selected.add(r.profileid));
    this.onlySelected ? this.applyFilters() : this.refreshCounts();
  }
  clearSelection(): void {
    this.selected.clear();
    this.onlySelected = false;
    this.applyFilters();
  }
  toggleOnlySelected(): void { this.onlySelected = !this.onlySelected; this.applyFilters(); }

  /**
   * Who a send goes to: every ticked person — under whatever filters they were
   * ticked — or everyone shown when nothing is ticked.
   */
  get recipients(): CommRow[] { return this.selected.size ? this.selectedRows : this.shown; }

  /** "Balaji, Nanda, Ravi +4 more" for the collapsed panel header. */
  get selectedPreview(): string {
    const names = this.selectedRows.slice(0, 4).map(r => r.name || r.email || r.profileid);
    const rest = this.selectedRows.length - names.length;
    return names.join(', ') + (rest > 0 ? ` +${rest} more` : '');
  }

  private refreshCounts(): void {
    let n = 0;
    for (const r of this.shown) if (this.selected.has(r.profileid)) n++;
    this.selectedShownCount = n;
    this.selectedRows = this.selected.size ? this.all.filter(r => this.selected.has(r.profileid)) : [];
    const rec = this.selected.size ? this.selectedRows : this.shown;
    this.recipientCount = rec.length;
    let phone = 0, email = 0;
    for (const r of rec) { if (r.phone) phone++; if (r.email) email++; }
    this.withPhone = phone; this.withEmail = email;
  }

  /** The shape the dashboard's senders expect: { profileid, name, metadata }. */
  private asParticipants(rows: CommRow[]): any[] {
    return rows.map(r => ({
      profileid: r.profileid,
      name: r.name,
      metadata: {
        ...r.metadata,
        name: r.name,
        email: r.email,
        phonenumber: r.phone,
        // The senders read countryCode || countrycode — give them both.
        countryCode: r.countryCode, countrycode: r.countryCode,
      },
    }));
  }

  sendEmail(): void { this.send?.email(this.asParticipants(this.recipients)); }
  sendWhatsapp(): void { this.send?.whatsapp(this.asParticipants(this.recipients)); }
  sendNotification(): void { this.send?.notification(this.asParticipants(this.recipients)); }

  // ───────────────────────────── display ─────────────────────────────
  fullPhone(r: CommRow): string { return r.phone ? (r.countryCode ? `+${r.countryCode} ${r.phone}` : r.phone) : ''; }
  trackRow = (_: number, r: CommRow) => r.profileid;
  close(): void { this.dialogRef.close(); }
}
