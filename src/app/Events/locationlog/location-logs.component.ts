/**
 * "All logs" tab — every location report, not just the latest per participant.
 *
 * Differences from the Live Tracking tab that matter:
 *  - It shows raw documents, so one participant appears many times.
 *  - Rows can be deleted. Permanently: Firestore has no recycle bin and this
 *    dashboard has no undo, so every delete goes through a dialog that names
 *    the count and the affected participants.
 *  - Reads are cursor-paginated ("Load more") rather than a single bounded
 *    scan, because this tab is explicitly for digging through history.
 *
 * Filtering is client-side over the pages loaded so far, and the UI says so.
 * The honest alternative — server-side `where(profileid)` — needs a composite
 * index on (profileid, created) that this project does not have, and silently
 * filtering only what happens to be loaded while *implying* a full search would
 * be worse than stating the bound.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import {
  ConfirmDeleteDialogComponent,
  ConfirmDeleteData,
} from './confirm-delete-dialog.component';
import { Coordinates, LocationLog } from './location.model';
import { LocationlogService, LogCursor } from './locationlog.service';
import {
  calculateDistance,
  deriveStatus,
  formatCoordinate,
  formatDistance,
  formatRelativeTime,
  getAvatarGradient,
  getAvatarInitials,
  getStatusText,
} from './location.utils';

/** Documents fetched per "Load more". */
const PAGE_SIZE = 100;

/** How the log list is ordered. */
type LogSort = 'newest' | 'oldest' | 'participant';

/** Date-range presets — the useful ones for auditing a location feed. */
type LogDateFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'older7';

/** A log joined to its participant name, ready to render. */
interface LogRow extends LocationLog {
  readonly name: string;
  readonly initials: string;
  readonly distanceMeters: number | null;
}

@Component({
  selector: 'app-location-logs',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './location-logs.component.html',
  styleUrl: './location-logs.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationLogsComponent implements OnInit {
  /** Reference point from the parent, so distances agree across both tabs. */
  @Input() reference: Coordinates | null = null;

  private readonly service = inject(LocationlogService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly displayedColumns = [
    'select',
    'participant',
    'when',
    'coordinates',
    'distance',
    'actions',
  ] as const;

  readonly loading = signal(false);
  readonly deleting = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);

  /** Every log loaded so far, newest first. */
  private readonly logs = signal<readonly LocationLog[]>([]);
  private readonly names = signal<ReadonlyMap<string, string>>(new Map());
  private cursor: LogCursor = null;

  readonly selectedIds = signal<ReadonlySet<string>>(new Set());

  // ── Filters ───────────────────────────────────────────────────────────────
  readonly searchControl = new FormControl<string>('', { nonNullable: true });
  readonly search = signal('');
  readonly participantFilter = signal<string>('all');
  readonly dateFilter = signal<LogDateFilter>('all');
  readonly sort = signal<LogSort>('newest');

  readonly dateOptions: readonly { value: LogDateFilter; label: string }[] = [
    { value: 'all', label: 'Any time' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7', label: 'Last 7 days' },
    { value: 'older7', label: 'Older than 7 days' },
  ];

  readonly sortOptions: readonly { value: LogSort; label: string }[] = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'participant', label: 'Participant A → Z' },
  ];

  /** Template helpers. */
  readonly formatCoordinate = formatCoordinate;
  readonly formatDistance = formatDistance;
  readonly getAvatarGradient = getAvatarGradient;
  readonly getStatusText = getStatusText;

  /** Logs joined to names and distances. */
  private readonly rows = computed<readonly LogRow[]>(() => {
    const names = this.names();
    const reference = this.reference;

    return this.logs().map((log) => {
      const name = names.get(log.profileid) ?? log.profileid;
      return {
        ...log,
        name,
        initials: getAvatarInitials(name),
        distanceMeters: reference
          ? calculateDistance(reference, { latitude: log.latitude, longitude: log.longitude })
          : null,
      };
    });
  });

  /** Participants present in the loaded pages, for the filter dropdown. */
  readonly participantOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const row of this.rows()) {
      if (!seen.has(row.profileid)) seen.set(row.profileid, row.name);
    }
    return [...seen.entries()]
      .map(([profileid, name]) => ({ profileid, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Filtered + sorted rows — what the table renders. */
  readonly visibleRows = computed<readonly LogRow[]>(() => {
    const search = this.search();
    const participant = this.participantFilter();
    const range = dateRange(this.dateFilter());

    const filtered = this.rows().filter((row) => {
      if (participant !== 'all' && row.profileid !== participant) return false;
      if (search && !row.name.toLowerCase().includes(search)) return false;
      if (range) {
        const at = row.created.getTime();
        if (at < range.from || at >= range.to) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    switch (this.sort()) {
      case 'oldest':
        return sorted.sort((a, b) => a.created.getTime() - b.created.getTime());
      case 'participant':
        return sorted.sort(
          (a, b) => a.name.localeCompare(b.name) || b.created.getTime() - a.created.getTime(),
        );
      default:
        return sorted.sort((a, b) => b.created.getTime() - a.created.getTime());
    }
  });

  readonly loadedCount = computed(() => this.logs().length);
  readonly visibleCount = computed(() => this.visibleRows().length);
  readonly selectedCount = computed(() => this.selectedIds().size);

  /** True when every visible row is selected — drives the header checkbox. */
  readonly allVisibleSelected = computed(() => {
    const visible = this.visibleRows();
    if (visible.length === 0) return false;
    const selected = this.selectedIds();
    return visible.every((row) => selected.has(row.id));
  });

  readonly someVisibleSelected = computed(() => {
    const selected = this.selectedIds();
    return this.visibleRows().some((row) => selected.has(row.id)) && !this.allVisibleSelected();
  });

  readonly filtersActive = computed(
    () => this.search() !== '' || this.participantFilter() !== 'all' || this.dateFilter() !== 'all',
  );

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => this.search.set(value.trim().toLowerCase()));

    this.loadFirstPage();
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  /** Discard everything loaded and start again from the newest document. */
  reload(): void {
    this.cursor = null;
    this.logs.set([]);
    this.selectedIds.set(new Set());
    this.loadPage();
  }

  loadMore(): void {
    this.loadPage();
  }

  private loadFirstPage(): void {
    this.loadPage();
  }

  private loadPage(): void {
    if (this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    this.service
      .listLogs(PAGE_SIZE, this.cursor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.cursor = page.cursor;
          this.hasMore.set(page.hasMore);
          this.logs.update((existing) => [...existing, ...page.logs]);
          this.resolveNames();
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          this.error.set(
            err instanceof Error ? err.message : 'Could not load logs. Please try again.',
          );
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  /** Names are memoised in the service, so this only costs a read per new id. */
  private resolveNames(): void {
    const ids = [...new Set(this.logs().map((log) => log.profileid))];
    if (ids.length === 0) return;

    this.service
      .resolveNames(ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((names) => {
        this.names.set(names);
        this.cdr.markForCheck();
      });
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleRow(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /**
   * Select or clear every *visible* row.
   *
   * Scoped to what the filters currently show, never the whole loaded set —
   * a "select all" that quietly includes rows you filtered out is how people
   * delete things they did not mean to.
   */
  toggleAllVisible(): void {
    const visible = this.visibleRows();
    const allSelected = this.allVisibleSelected();

    this.selectedIds.update((current) => {
      const next = new Set(current);
      for (const row of visible) {
        if (allSelected) next.delete(row.id);
        else next.add(row.id);
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  setParticipant(profileid: string): void {
    this.participantFilter.set(profileid);
  }

  setDateFilter(value: LogDateFilter): void {
    this.dateFilter.set(value);
  }

  setSort(value: LogSort): void {
    this.sort.set(value);
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.search.set('');
    this.participantFilter.set('all');
    this.dateFilter.set('all');
  }

  // ── Deleting ──────────────────────────────────────────────────────────────

  deleteRow(row: LogRow): void {
    this.confirmAndDelete([row.id], [row.name]);
  }

  deleteSelected(): void {
    const selected = this.selectedIds();
    const rows = this.rows().filter((row) => selected.has(row.id));
    this.confirmAndDelete(
      rows.map((row) => row.id),
      [...new Set(rows.map((row) => row.name))],
    );
  }

  private confirmAndDelete(ids: readonly string[], participants: readonly string[]): void {
    if (ids.length === 0) return;

    const data: ConfirmDeleteData = { count: ids.length, participants };

    this.dialog
      .open(ConfirmDeleteDialogComponent, { data, width: '440px', autoFocus: false })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) this.performDelete(ids);
      });
  }

  private performDelete(ids: readonly string[]): void {
    this.deleting.set(true);

    this.service
      .deleteLogs(ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (count) => {
          const removed = new Set(ids);
          this.logs.update((existing) => existing.filter((log) => !removed.has(log.id)));
          this.selectedIds.update((current) => {
            const next = new Set(current);
            for (const id of ids) next.delete(id);
            return next;
          });
          this.deleting.set(false);
          this.cdr.markForCheck();
          this.snackBar.open(`Deleted ${count} log${count === 1 ? '' : 's'}`, undefined, {
            duration: 3000,
          });
        },
        error: (err: unknown) => {
          this.deleting.set(false);
          this.cdr.markForCheck();
          this.snackBar.open(
            err instanceof Error ? `Delete failed: ${err.message}` : 'Delete failed.',
            'Dismiss',
            { duration: 6000 },
          );
        },
      });
  }

  // ── Display helpers ───────────────────────────────────────────────────────

  relativeTime(date: Date): string {
    return formatRelativeTime(date, Date.now());
  }

  absoluteTime(date: Date): string {
    return date.toLocaleString();
  }

  statusOf(date: Date): string {
    return deriveStatus(date, Date.now());
  }

  trackById(_index: number, row: LogRow): string {
    return row.id;
  }
}

/** Millisecond bounds for a date preset, or null for "any time". */
function dateRange(filter: LogDateFilter): { from: number; to: number } | null {
  const now = Date.now();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const startOfToday = midnight.getTime();
  const day = 24 * 60 * 60 * 1000;

  switch (filter) {
    case 'today':
      return { from: startOfToday, to: Infinity };
    case 'yesterday':
      return { from: startOfToday - day, to: startOfToday };
    case 'last7':
      return { from: now - 7 * day, to: Infinity };
    case 'older7':
      return { from: -Infinity, to: now - 7 * day };
    default:
      return null;
  }
}
