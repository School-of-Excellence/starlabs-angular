import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { SnackbarService } from '../../shared/snackbar.service';
import { WhatsAppProgressData, WhatsappProgressDialogComponent } from '../whatsapp-progress-dialog.component';
import { environment } from '../../../environments/environment.development';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SelectionModel } from '@angular/cdk/collections';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch
} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { AssignTagsDialogComponent } from './assign-tags-dialog/assign-tags-dialog.component';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';

@Component({
  selector: 'app-newusersprofile',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatChipsModule,
    MatMenuModule,
    MatDatepickerModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './newusersprofile.component.html',
  styleUrl: './newusersprofile.component.css'
})
export class NewusersprofileComponent implements OnInit, OnDestroy {
  dataSource = new MatTableDataSource<any>([]);
  loading = true;
  private readonly baseColumns =
    ['select', 'name', 'phonenumber', 'email', 'created', 'enable', 'referredby', 'tags'];
  // The `workshop` column appears only while the workshop filter is active.
  displayedColumns = [...this.baseColumns];
  // Keyed by user id so selection survives live data refreshes.
  selection = new SelectionModel<string>(true, []);
  applyingBulk = false;
  private datePipe = new DatePipe('en-US');

  // ---- export ----
  showExport = false;
  exportColumns: { key: string; label: string; value: (u: any) => string }[] = [
    { key: 'name', label: 'Name', value: u => u.name || '' },
    { key: 'countryCode', label: 'Country Code', value: u => u.countryCode || '' },
    { key: 'phonenumber', label: 'Phone', value: u => u.phonenumber || '' },
    { key: 'email', label: 'Email', value: u => u.email || '' },
    { key: 'created', label: 'Created', value: u => this.datePipe.transform(this.toDate(u.created), 'medium') || '' },
    { key: 'enable', label: 'Status', value: u => (u.enable ? 'Enabled' : 'Disabled') },
    { key: 'referredby', label: 'Referred By', value: u => this.referredBy(u) },
    { key: 'tags', label: 'Tags', value: u => this.tagNames(u).join(', ') }
  ];
  // Default: all columns selected.
  selectedExportKeys: string[] = this.exportColumns.map(c => c.key);
  // Workshop titles export column — offered only while the workshop filter is
  // active; titles come from the cached enrolled reads, same as the table column.
  private readonly workshopExportColumn = {
    key: 'workshop',
    label: 'Workshop',
    value: (u: any) => this.workshopNames(u).join(', ')
  };
  // What the export panel offers right now (base + Workshop when filtering).
  exportColumnsView = this.exportColumns;

  // tag id -> name, from the newusertags collection (live).
  tagMap: Record<string, string> = {};

  // Table renders behind *ngIf, so wire sort/paginator via setter ViewChild.
  @ViewChild(MatSort) set matSort(ms: MatSort) {
    if (ms) this.dataSource.sort = ms;
  }
  @ViewChild(MatPaginator) set matPaginator(mp: MatPaginator) {
    if (mp) this.dataSource.paginator = mp;
  }

  // profileId -> name, from authguard.service getParticipantMetaMap().
  private metaMap: Record<string, string> = {};

  // "Send communication" panel + tag-based selection state.
  showComm = false;
  allTags: { id: string; name: string }[] = [];
  selectByTagMode: 'all' | 'any' = 'all';
  selectByTagIds = new Set<string>();
  // Date range filter on the `created` column.
  startDate: Date | null = null;
  endDate: Date | null = null;
  // Workshop filter: options from workshopconfiguration (label detailpage.title),
  // matching rows via `workshop participant enrolled` (workshopref -> profileid).
  workshopOptions: { id: string; title: string }[] = [];
  selectedWorkshopIds = new Set<string>();
  workshopFilterLoading = false;
  // profileids enrolled in any selected workshop; null while inactive/loading.
  private workshopProfileIds: Set<string> | null = null;
  // workshop id -> enrolled profileids, so re-selections don't refetch.
  private enrolledCache = new Map<string, string[]>();
  // profileid -> selected workshop ids (drives the `workshop` column) — built
  // from the per-workshop cache only, never a collection-wide read.
  private workshopsByProfile = new Map<string, string[]>();
  private workshopTitleById: Record<string, string> = {};
  // Guards against out-of-order async results; bumped to invalidate in-flight loads.
  private workshopFilterToken = 0;
  // Bumped when the async load lands so the filter string changes and re-runs.
  private workshopFilterVersion = 0;
  private destroy$ = new Subject<void>();

  constructor(
    private firestore: Firestore,
    private authguard: AuthguardService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    private snackbarService: SnackbarService
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.authguard.getParticipantMetaMap()
      .then(res => (this.metaMap = res?.map || {}))
      .catch(err => console.error('Error loading participant meta map:', err));
    collectionData(collection(this.firestore, 'newusertags'), { idField: 'id' }).subscribe({
      next: (rows: any[]) => {
        const map: Record<string, string> = {};
        rows.forEach(r => (map[r.id] = (r.name || '').toString()));
        this.tagMap = map;
        this.allTags = rows
          .map(r => ({ id: r.id, name: (r.name || '').toString() }))
          .filter(t => t.name)
          .sort((a, b) => a.name.localeCompare(b.name));
      },
      error: (err) => console.error('Error loading tags:', err)
    });

    // Workshop filter options: every workshopconfiguration doc, titled by
    // detailpage.title.
    getDocs(collection(this.firestore, 'workshopconfiguration'))
      .then(snap => {
        this.workshopOptions = snap.docs
          .map(d => ({
            id: d.id,
            title: (d.data()?.['detailpage']?.['title'] || 'Untitled workshop').toString()
          }))
          .sort((a, b) => a.title.localeCompare(b.title));
        const titles: Record<string, string> = {};
        this.workshopOptions.forEach(w => (titles[w.id] = w.title));
        this.workshopTitleById = titles;
      })
      .catch(err => console.error('Error loading workshops:', err));

    // Combined filter: free-text search (all columns) AND tag filter.
    // The filter string encodes both so both apply together.
    this.dataSource.filterPredicate = (u: any, filter: string) => {
      let q = '';
      let tags: string[] = [];
      let mode: 'all' | 'any' = 'all';
      let start: number | null = null;
      let end: number | null = null;
      try {
        const f = JSON.parse(filter);
        q = f.q || '';
        tags = f.tags || [];
        mode = f.mode || 'all';
        start = f.start ?? null;
        end = f.end ?? null;
      } catch {
        q = (filter || '').toLowerCase();
      }

      // Text search across every column.
      if (q) {
        const haystack = [
          u.name,
          u.countryCode,
          u.phonenumber,
          u.email,
          this.datePipe.transform(this.toDate(u.created), 'medium'),
          u.enable ? 'enabled active' : 'disabled inactive',
          this.referredBy(u),
          this.tagNames(u).join(' ')
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Tag filter — show only profiles matching the chosen tags.
      if (tags.length) {
        const userTags: string[] = Array.isArray(u.tags) ? u.tags : [];
        const tagMatch = mode === 'all'
          ? tags.every(t => userTags.includes(t))
          : tags.some(t => userTags.includes(t));
        if (!tagMatch) return false;
      }

      // Date range filter on the `created` column.
      if (start != null || end != null) {
        const created = this.toDate(u.created)?.getTime();
        if (created == null) return false;
        if (start != null && created < start) return false;
        if (end != null && created > end) return false;
      }

      // Workshop filter — only profiles enrolled in a selected workshop.
      // The enrolled set lives on `this` (not the filter string); while it is
      // still loading, show nothing rather than a flash of unfiltered rows.
      if (this.selectedWorkshopIds.size) {
        if (!this.workshopProfileIds) return false;
        const pid = (u.profileid || this.rowId(u) || '').toString();
        if (!this.workshopProfileIds.has(pid)) return false;
      }

      return true;
    };

    this.dataSource.sortingDataAccessor = (u: any, id: string) => {
      switch (id) {
        case 'created':
          return this.toDate(u.created)?.getTime() || 0;
        case 'enable':
          return u.enable ? 1 : 0;
        case 'referredby':
          return this.referredBy(u).toLowerCase();
        default:
          return (u[id] ?? '').toString().toLowerCase();
      }
    };

    const ref = collection(this.firestore, 'new_user_data');
    collectionData(ref, { idField: 'id' }).subscribe({
      next: (data: any[]) => {
        this.dataSource.data = data
          .sort((a, b) => (this.toDate(b.created)?.getTime() || 0) - (this.toDate(a.created)?.getTime() || 0));
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading new users:', err);
        this.loading = false;
      }
    });
  }

  searchText = '';

  applyFilter(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value || '';
    this.refreshFilter();
  }

  get hasAnyFilter(): boolean {
    return !!(this.searchText || this.selectByTagIds.size > 0 || this.hasDateFilter
      || this.selectedWorkshopIds.size > 0);
  }

  clearAllFilters(): void {
    this.searchText = '';
    this.selectByTagIds.clear();
    this.startDate = null;
    this.endDate = null;
    this.resetWorkshopFilter();
    this.refreshFilter();
  }

  // Rebuild the datasource filter from search + tags + date range.
  private refreshFilter(): void {
    // Start = beginning of the start day, End = end of the end day (inclusive).
    const start = this.startDate
      ? new Date(this.startDate.getFullYear(), this.startDate.getMonth(), this.startDate.getDate(), 0, 0, 0, 0).getTime()
      : null;
    const end = this.endDate
      ? new Date(this.endDate.getFullYear(), this.endDate.getMonth(), this.endDate.getDate(), 23, 59, 59, 999).getTime()
      : null;

    this.dataSource.filter = JSON.stringify({
      q: this.searchText.trim().toLowerCase(),
      tags: [...this.selectByTagIds],
      mode: this.selectByTagMode,
      start,
      end,
      // The predicate reads the workshop state off `this`; these only make the
      // filter string change so the table re-filters.
      workshops: [...this.selectedWorkshopIds],
      wv: this.workshopFilterVersion
    });
    this.dataSource.paginator?.firstPage();
  }

  onDateChange(): void {
    this.refreshFilter();
  }

  clearDates(): void {
    this.startDate = null;
    this.endDate = null;
    this.refreshFilter();
  }

  get hasDateFilter(): boolean {
    return !!(this.startDate || this.endDate);
  }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    return new Date(value);
  }

  // Subscriber -> "Subscriber"; else the refferedprofile value if present.
  isSubscriber(u: any): boolean {
    return u?.subscriber === true;
  }

  referredBy(u: any): string {
    if (this.isSubscriber(u)) return 'Subscriber';
    const rp = u?.refferedprofile;
    if (rp === null || rp === undefined || rp === '') return '';
    // refferedprofile may be an id string or a DocumentReference.
    const key = typeof rp === 'object' ? (rp.id || '') : rp.toString();
    if (!key) return '';
    // Map the id to a name; fall back to the id if not found.
    return this.metaMap[key] || key;
  }

  // Resolve a user's tag ids to their names.
  tagNames(u: any): string[] {
    const ids: string[] = Array.isArray(u?.tags) ? u.tags : [];
    return ids.map(id => this.tagMap[id]).filter(Boolean);
  }

  openTags(user: any): void {
    this.dialog.open(AssignTagsDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      data: { user }
    });
  }

  // Toolbar "Tags" button: opens the same dialog in manage mode (create tags +
  // All Tags / copy segment), not tied to a specific user.
  openTagsManager(): void {
    this.dialog.open(AssignTagsDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      data: { mode: 'manage' }
    });
  }

  // ---- row selection ----
  rowId(u: any): string {
    return u?.id || u?.docid || '';
  }

  isAllSelected(): boolean {
    const rows = this.dataSource.filteredData;
    return rows.length > 0 && rows.every(r => this.selection.isSelected(this.rowId(r)));
  }

  someSelected(): boolean {
    return this.selection.hasValue() && !this.isAllSelected();
  }

  masterToggle(): void {
    if (this.isAllSelected()) {
      this.dataSource.filteredData.forEach(r => this.selection.deselect(this.rowId(r)));
    } else {
      this.dataSource.filteredData.forEach(r => this.selection.select(this.rowId(r)));
    }
  }

  clearSelection(): void {
    this.selection.clear();
    this.showExport = false;
  }

  // ---- export ----
  toggleExport(): void {
    this.showExport = !this.showExport;
  }

  selectAllExportColumns(): void {
    this.selectedExportKeys = this.exportColumnsView.map(c => c.key);
  }

  exportExcel(): void {
    if (this.workshopFilterLoading) {
      this.snackBar.open('Workshop filter is still loading. Please wait.', 'Close', { duration: 3000 });
      return;
    }
    const cols = this.exportColumnsView.filter(c => this.selectedExportKeys.includes(c.key));
    if (cols.length === 0) {
      this.snackBar.open('Select at least one column to export.', 'Close', { duration: 3000 });
      return;
    }
    const byId = new Map<string, any>(this.dataSource.data.map(u => [this.rowId(u), u]));
    const users = this.selection.selected.map(id => byId.get(id)).filter(Boolean);
    if (users.length === 0) {
      this.snackBar.open('No profiles selected.', 'Close', { duration: 3000 });
      return;
    }

    // Build rows in the chosen column order (read-only — no DB writes).
    const rows = users.map(u => {
      const row: Record<string, string> = {};
      cols.forEach(c => (row[c.label] = c.value(u)));
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: cols.map(c => c.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'New Users');
    const stamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `new_users_${stamp}.xlsx`);
    this.snackBar.open(`Exported ${users.length} profile${users.length === 1 ? '' : 's'}.`, 'Close', { duration: 2500 });
  }

  // ---- bulk add tags ----
  openBulkTags(): void {
    const ids = this.selection.selected;
    if (!ids.length) return;
    const byId = new Map<string, any>(this.dataSource.data.map(u => [this.rowId(u), u]));
    const users = ids.map(id => byId.get(id)).filter(Boolean);
    const ref = this.dialog.open(AssignTagsDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      data: { mode: 'bulk', users }
    });
    ref.afterClosed().subscribe((result: any) => {
      if (result && (result.add?.length || result.remove?.length)) {
        this.applyTagsToUsers(users, result.add || [], result.remove || []);
      }
    });
  }

  private async applyTagsToUsers(users: any[], add: string[], remove: string[]): Promise<void> {
    this.applyingBulk = true;
    const batch = writeBatch(this.firestore);
    let changed = 0;

    users.forEach(u => {
      const id = this.rowId(u);
      if (!id) return;
      const existing: string[] = Array.isArray(u.tags) ? u.tags : [];
      // Start from existing, drop removed, add new — Set dedupes so an
      // already-present tag is never duplicated.
      const set = new Set(existing);
      remove.forEach(t => set.delete(t));
      add.forEach(t => set.add(t));
      const merged = [...set];
      const didChange =
        add.some(t => !existing.includes(t)) || remove.some(t => existing.includes(t));
      if (didChange) {
        batch.update(doc(this.firestore, 'new_user_data', id), { tags: merged });
        changed++;
      }
    });

    try {
      if (changed > 0) await batch.commit();
      this.snackBar.open(
        changed > 0
          ? `Tags updated for ${changed} user${changed === 1 ? '' : 's'}.`
          : 'No changes were needed.',
        'Close',
        { duration: 2500 }
      );
      this.selection.clear();
    } catch (err) {
      console.error('Error applying bulk tags:', err);
      this.snackBar.open('Error updating tags. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.applyingBulk = false;
    }
  }

  // ---- filter by tags (mat-menu) ----
  // Selecting tags filters the table to show only matching profiles.
  setTagMode(mode: 'all' | 'any'): void {
    this.selectByTagMode = mode;
    this.refreshFilter();
  }

  toggleTagSelect(id: string): void {
    if (this.selectByTagIds.has(id)) this.selectByTagIds.delete(id);
    else this.selectByTagIds.add(id);
    this.refreshFilter();
  }

  clearTagFilter(): void {
    this.selectByTagIds.clear();
    this.refreshFilter();
  }

  matchCount(): number {
    return this.dataSource.filteredData.length;
  }

  // ---- filter by workshops (mat-menu, same UI as filter by tags) ----
  toggleWorkshopSelect(id: string): void {
    if (this.selectedWorkshopIds.has(id)) this.selectedWorkshopIds.delete(id);
    else this.selectedWorkshopIds.add(id);
    this.updateDisplayedColumns();
    this.refreshWorkshopFilter();
  }

  // Resolve the selected workshops' doc refs against `workshop participant
  // enrolled` (workshopref == ref) and keep only rows whose profileid is
  // enrolled in at least one of them. Reads are per-workshop and cached —
  // never a scan of the whole (huge) enrolled collection.
  private async refreshWorkshopFilter(): Promise<void> {
    const ids = [...this.selectedWorkshopIds];
    const token = ++this.workshopFilterToken;

    if (!ids.length) {
      this.workshopProfileIds = null;
      this.workshopsByProfile.clear();
      this.workshopFilterLoading = false;
      this.refreshFilter();
      return;
    }

    this.workshopFilterLoading = true;
    this.workshopProfileIds = null; // predicate hides rows while loading
    // Clear now (not just on completion) so a mid-load export can't read the
    // previous selection's titles.
    this.workshopsByProfile.clear();
    this.refreshFilter();

    try {
      const uncached = ids.filter(id => !this.enrolledCache.has(id));
      await Promise.all(uncached.map(async id => {
        const workshopref = doc(this.firestore, 'workshopconfiguration', id);
        const snap = await getDocs(query(
          collection(this.firestore, 'workshop participant enrolled'),
          where('workshopref', '==', workshopref)
        ));
        this.enrolledCache.set(
          id,
          snap.docs.map(d => (d.data()?.['profileid'] || '').toString()).filter(Boolean)
        );
      }));
      if (token !== this.workshopFilterToken) return; // superseded by a newer change
      const set = new Set<string>();
      const byProfile = new Map<string, string[]>();
      ids.forEach(id => (this.enrolledCache.get(id) || []).forEach(p => {
        set.add(p);
        const list = byProfile.get(p) || [];
        list.push(id);
        byProfile.set(p, list);
      }));
      this.workshopProfileIds = set;
      this.workshopsByProfile = byProfile;
    } catch (err) {
      console.error('Error loading enrolled participants:', err);
      if (token === this.workshopFilterToken) {
        this.workshopProfileIds = new Set();
        this.workshopsByProfile.clear();
      }
    } finally {
      if (token === this.workshopFilterToken) {
        this.workshopFilterLoading = false;
        this.workshopFilterVersion++;
        this.refreshFilter();
      }
    }
  }

  clearWorkshopFilter(): void {
    this.resetWorkshopFilter();
    this.refreshFilter();
  }

  private resetWorkshopFilter(): void {
    this.selectedWorkshopIds.clear();
    this.workshopProfileIds = null;
    this.workshopsByProfile.clear();
    this.workshopFilterLoading = false;
    this.workshopFilterToken++; // invalidate any in-flight load
    this.updateDisplayedColumns();
  }

  private updateDisplayedColumns(): void {
    const active = this.selectedWorkshopIds.size > 0;
    const wasActive = this.displayedColumns.includes('workshop');
    this.displayedColumns = active ? [...this.baseColumns, 'workshop'] : [...this.baseColumns];
    this.exportColumnsView = active
      ? [...this.exportColumns, this.workshopExportColumn]
      : this.exportColumns;

    // Sync the export chip selection only when the filter turns on/off, so a
    // manual deselection isn't fought on every workshop toggle.
    if (active === wasActive) return;
    if (active) {
      if (!this.selectedExportKeys.includes('workshop')) {
        this.selectedExportKeys = [...this.selectedExportKeys, 'workshop'];
      }
    } else {
      this.selectedExportKeys = this.selectedExportKeys.filter(k => k !== 'workshop');
    }
  }

  // Titles for the `workshop` column: the selected workshops this profile is
  // enrolled in, from the cached per-workshop reads.
  workshopNames(u: any): string[] {
    const pid = (u.profileid || this.rowId(u) || '').toString();
    return (this.workshopsByProfile.get(pid) || [])
      .map(id => this.workshopTitleById[id])
      .filter(Boolean);
  }

  toggleComm(): void {
    this.showComm = !this.showComm;
  }

  // ============ Send communication (ported verbatim from workshop-dashboard) ============
  // Selected profiles shaped like the dashboard's participants ({ profileid, metadata }).
  private get filteredParticipants(): any[] {
    const byId = new Map<string, any>(this.dataSource.data.map(u => [this.rowId(u), u]));
    return this.selection.selected
      .map(id => byId.get(id))
      .filter(Boolean)
      .map(u => ({
        profileid: u.profileid || this.rowId(u),
        metadata: {
          name: u.name,
          email: u.email,
          phonenumber: u.phonenumber,
          countryCode: u.countryCode || u.countrycode || ''
        }
      }));
  }

  private readonly WHATSAPP_CHUNK_SIZE = 200;
  private readonly CHUNK_DELAY_MS = 1000;

  // ============ Email composer (ported from participants-analytics) ============
  // EmailInputComponent reads `profileid`, `email` and `name` off each entry, so
  // pass the raw user doc with profileid resolved the same way the rest of this
  // component does.
  private get emailRecipients(): any[] {
    const byId = new Map<string, any>(this.dataSource.data.map(u => [this.rowId(u), u]));
    return this.selection.selected
      .map(id => byId.get(id))
      .filter(u => u && u.email)
      .map(u => ({ ...u, profileid: u.profileid || this.rowId(u) }));
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }

  sendEmailToSelectedParicipant() {
    const recipients = this.emailRecipients;
    if (recipients.length === 0) {
      this.openSnackBar('No selected profile has an email address', 'OK');
      return;
    }

    let dialogRef = this.dialog.open(EmailInputComponent, {
      data: recipients,
      minWidth: "600px",
      disableClose: true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        console.log(result);

        const docRef = doc(collection(this.firestore, "email archive"), result['docid']);
        if (result['status'] == 'queued' || result['status'] == 'send') {
          await setDoc(docRef, result, { merge: true }).then(() => {
            this.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : "Email Sent Successfully", "OK");
          }).catch(err => {
            console.log(err);
            this.openSnackBar("Error Sending Email", "OK");
          });
        } else if (result['status'] == 'validated') {
          let url: string;
          if (environment.firebase.projectId == 'starlabs-test') {
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          } else if (environment.firebase.projectId == 'fir-sample-aae4a') {
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }
          console.log("EMAIL :", url);
          let data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url, JSON.stringify(data), {
            responseType: 'text',
            headers: new HttpHeaders().set('Content-Type', 'application/json'),
          }).subscribe({
            next: (response) => {
              console.log('response', response);
            },
            error: (err) => {
              console.log(err);
              console.log("Error: " + err);
            }
          });
        }

      }
    })
  }

  async sendMail() {
    const { SendmessagesComponent } = await import('../workshop-dashboard/sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'mail' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleDialogResult(result);
    });
  }

  async sendWatti() {
    const { SendmessagesComponent } = await import('../workshop-dashboard/sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'whatsapp' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleWhatsappChunked(result);
    });
  }

  private async handleWhatsappChunked(result: any) {
    if (result?.action !== 'sent' || result.type !== 'whatsapp') {
      return;
    }

    const { templateName, customParams } = result;
    const participants = this.filteredParticipants
      .filter(participant => {
        const metadata = participant['metadata'];
        return metadata && metadata['phonenumber'] && metadata['name'];
      })
      .map(participant => {
        const metadata = participant['metadata'];
        const name = metadata['name'];
        let cc = metadata['countryCode'] || metadata['countrycode'] || '';
        cc = cc.trim();
        if (cc && !cc.startsWith('+')) cc = '+' + cc;
        let phone = metadata['phonenumber']?.toString().trim() || '';
        phone = phone.replace(/^\+/, '');
        const phonenumber = cc ? `${cc}${phone}` : phone;
        const processedParams = customParams.map((param: any) => ({
          name: param.name,
          value: param.value.replace(/\{\{name\}\}/g, name)
        }));
        return { phonenumber, name, customParams: processedParams };
      });

    if (participants.length === 0) {
      this.snackbarService.show('No valid participants found');
      return;
    }

    const progressDialog = this.dialog.open(WhatsappProgressDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        totalParticipants: participants.length,
        templateName: templateName
      } as WhatsAppProgressData
    });
    const progressComponent = progressDialog.componentInstance;
    const chunks = this.chunkArray(participants, this.WHATSAPP_CHUNK_SIZE);
    const totalChunks = chunks.length;
    progressComponent.updateProgress({ totalChunks });

    let totalSuccess = 0;
    let totalFailed = 0;
    let allErrors: string[] = [];
    let isCancelled = false;
    const cancelSubscription = progressComponent.cancel$.subscribe(() => {
      isCancelled = true;
    });

    const url = this.getCloudFunctionUrl('workshopprogressmessage');
    for (let i = 0; i < chunks.length; i++) {
      if (isCancelled) {
        console.log('Sending cancelled by user');
        break;
      }

      const chunk = chunks[i];
      const chunkIndex = i + 1;

      progressComponent.updateProgress({
        currentChunk: chunkIndex,
        isProcessingChunk: true
      });

      try {
        const chunkPayload = {
          type: 'whatsapp',
          templateName,
          participants: chunk,
          chunkInfo: {
            chunkIndex,
            totalChunks,
            chunkSize: chunk.length
          }
        };

        const response = await firstValueFrom(
          this.http.post<any>(url, chunkPayload, { responseType: 'json' })
        );

        console.log(`Chunk ${chunkIndex}/${totalChunks} response:`, response);
        const chunkSuccess = response.successCount || chunk.length;
        const chunkFailed = response.failureCount || 0;
        totalSuccess += chunkSuccess;
        totalFailed += chunkFailed;
        if (response.errors && Array.isArray(response.errors)) {
          allErrors = [...allErrors, ...response.errors];
        }

        progressComponent.updateProgress({
          processedCount: totalSuccess + totalFailed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          isProcessingChunk: false,
          errors: response.errors || [],
          watiErrors: response.watiErrors || []
        });

      } catch (error: any) {
        console.error(`Failed to send chunk ${chunkIndex}:`, error);
        totalFailed += chunk.length;
        const errorMessage = `Chunk ${chunkIndex} failed: ${error.message || 'Unknown error'}`;
        allErrors.push(errorMessage);

        progressComponent.updateProgress({
          processedCount: totalSuccess + totalFailed,
          successCount: totalSuccess,
          failedCount: totalFailed,
          isProcessingChunk: false,
          errors: [errorMessage]
        });
      }
      if (i < chunks.length - 1 && !isCancelled) {
        await this.delay(this.CHUNK_DELAY_MS);
      }
    }
    cancelSubscription.unsubscribe();

    let finalStatus: 'success' | 'partial' | 'error';
    if (isCancelled) {
      finalStatus = totalSuccess > 0 ? 'partial' : 'error';
    } else if (totalFailed === 0) {
      finalStatus = 'success';
    } else if (totalSuccess > 0) {
      finalStatus = 'partial';
    } else {
      finalStatus = 'error';
    }
    progressComponent.complete(finalStatus);
    const dialogResult = await firstValueFrom(progressDialog.afterClosed());
    console.log('Final sending result:', dialogResult);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCloudFunctionUrl(functionName: string): string {
    const projectId = environment.firebase.projectId;
    const projectUrlMap: Record<string, string> = {
      'test-environment-841c3': `https://us-central1-test-environment-841c3.cloudfunctions.net/${functionName}`,
      'starlabs-test': `https://us-central1-starlabs-test.cloudfunctions.net/${functionName}`,
      'fir-sample-aae4a': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
      'launch-your-legacy-development': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
    };
    return projectUrlMap[projectId] || '';
  }

  private async handleDialogResult(result: any) {
    if (result?.action === 'sent') {
      if (result.type === 'mail') {
        const { subject, message } = result;
        const recipients = this.filteredParticipants
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['email'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            return { email: metadata['email'], name: metadata['name'] };
          });

        if (recipients.length === 0) {
          this.snackbarService.show('No valid recipients found');
          return;
        }

        const bulkPayload = { type: 'mail', subject, message, recipients };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        try {
          const response = await firstValueFrom(this.http.post(url, bulkPayload, { responseType: 'json' }));
          const res = response as any;
          const successfulSends = res.successCount || 0;
          const failedSends = res.failureCount || 0;
          const totalParticipants = recipients.length;

          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `Message successfully sent to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Sent to ${successfulSends} participants. Failed to send to ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);
        } catch (error) {
          console.error('Failed to send bulk emails:', error);
          this.snackbarService.show('Failed to send bulk emails');
        }

      } else if (result.type === 'whatsapp') {
        const { templateName, customParams } = result;
        const participants = this.filteredParticipants
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['phonenumber'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            const name = metadata['name'];
            let cc = metadata['countryCode'] || metadata['countrycode'] || '';
            cc = cc.trim();
            if (cc && !cc.startsWith('+')) cc = '+' + cc;
            let phone = metadata['phonenumber']?.toString().trim() || '';
            phone = phone.replace(/^\+/, '');
            const fullPhoneNumber = cc ? `${cc}${phone}` : phone;
            const processedParams = customParams.map((param: any) => ({
              name: param.name,
              value: param.value.replace(/\{\{name\}\}/g, name)
            }));
            return { phonenumber: fullPhoneNumber, name, customParams: processedParams };
          });

        if (participants.length === 0) {
          this.snackbarService.show('No valid participants found');
          return;
        }

        const bulkPayload = { type: 'whatsapp', templateName, participants };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        try {
          const response = await firstValueFrom(this.http.post(url, bulkPayload, { responseType: 'json' }));
          const res = response as any;
          const successfulSends = res.successCount || 0;
          const failedSends = res.failureCount || 0;
          const totalParticipants = participants.length;
          const broadcastName = res.broadcastName || ' ';
          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `WhatsApp broadcast "${broadcastName}" sent successfully to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Broadcast "${broadcastName}": Sent to ${successfulSends} participants. Failed: ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send WhatsApp message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);
        } catch (error) {
          console.error('Failed to send bulk WhatsApp:', error);
          this.snackbarService.show('Failed to send bulk WhatsApp messages');
        }
      }
    } else if (result?.action === 'closed') {
      console.log('closed');
    }
  }

  async sendNotificationinBreakthrough() {
    const { AhNotificationComponent } = await import(
      '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component'
    );
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      width: "60vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
      data: this.filteredParticipants
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        var profileID = this.filteredParticipants.map(p => p.profileid);
        var notificationimage = null;
        if (result["notificationimage"] != null) {
          const { getDownloadURL, ref, uploadBytes } = await import('@angular/fire/storage');
          const { getStorage } = await import('firebase/storage');
          const { getApp } = await import('firebase/app');
          const storage = getStorage(getApp());
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(storage, filepath);
            const uploadResult = await uploadBytes(storageRef, result['notificationimage']);
            notificationimage = await getDownloadURL(uploadResult.ref);
          } catch (error) {
            console.log('file upload error', error);
          }
        }
        this.authguard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true,
          landingpage: result["landingpage"],
          profileid: profileID,
          receivingapp: result["receivingapp"] ?? "breakthroughsapp",
        }).then(() => {
          alert("A&H Update sent to App user " + profileID.length.toString());
        });
      }
    });
  }
}



//https://eiflix.com?segment=nRpMxgeTYEzhGHEeigrL
// https://eiflix.com/eiflix?segment=3ZLQDG4RiVklI2HUz00D,nRpMxgeTYEzhGHEeigrL