/**
 * Live Location Tracking dashboard.
 *
 * Shows one row per participant — their *latest* reported position — with
 * distance from the admin's own device, freshness status, filtering, sorting,
 * a details drawer and a free (Leaflet/OpenStreetMap) map.
 *
 * Architecture notes:
 *  - All state is RxJS, consumed through the async pipe under OnPush. There are
 *    no manual `subscribe()` calls in the render path and therefore nothing to
 *    unsubscribe; the one imperative subscription that does exist (the search
 *    input) is torn down by `takeUntilDestroyed`.
 *  - `clock$` ticks every 30s so relative timestamps and status chips age
 *    without needing a Firestore round trip.
 *  - Firestore reads are one-shot and bounded — see LocationlogService.
 */

import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  animate,
  query as animQuery,
  stagger,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  interval,
  map,
  merge,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
  timer,
} from 'rxjs';

import { LocationMapComponent } from './location-map.component';
import {
  Coordinates,
  DEFAULT_FILTERS,
  DashboardStats,
  DistanceBand,
  FreshnessFilter,
  GeolocationState,
  LocationFilters,
  ParticipantLocation,
  SortKey,
  TimeWindow,
} from './location.model';
import { LatestLocationsResult, LocationlogService, SCAN_LIMIT } from './locationlog.service';
import {
  calculateDistance,
  deriveStatus,
  distanceBounds,
  formatCoordinate,
  formatDistance,
  formatRelativeTime,
  getAvatarGradient,
  getAvatarInitials,
  getStatusColor,
  getStatusHint,
  getStatusText,
  googleMapsUrl,
  startOfDay,
  timeWindowBounds,
  trackByProfile,
} from './location.utils';

/** Auto-refresh cadence. */
const AUTO_REFRESH_MS = 30_000;

/** Relative timestamps and status chips are recomputed on this cadence. */
const CLOCK_TICK_MS = 30_000;

/** Above this many rows the table is swapped for a virtualised card list. */
const VIRTUAL_SCROLL_THRESHOLD = 100;

/** Row height used by the virtual scroll viewport, in px. Must match the CSS. */
export const VIRTUAL_ROW_HEIGHT = 88;

/** A pickable option in one of the filter dropdowns. */
interface FilterOption<T> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

/** What the template renders, assembled in one place to keep the HTML dumb. */
interface DashboardView {
  readonly participants: readonly ParticipantLocation[];
  readonly stats: DashboardStats;
  readonly virtualise: boolean;
  /** How many facets are narrowing the list — drives the "Clear" affordance. */
  readonly activeFilterCount: number;
}

@Component({
  selector: 'app-locationlog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ScrollingModule,
    LocationMapComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSidenavModule,
    MatSlideToggleModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './locationlog.component.html',
  styleUrl: './locationlog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('320ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
    ]),
    trigger('slideInPanel', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(24px)' }),
        animate('280ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
    ]),
    trigger('staggerCards', [
      transition(':enter', [
        animQuery(
          '.ll-stat-card',
          [
            style({ opacity: 0, transform: 'translateY(16px)' }),
            stagger(60, [
              animate(
                '340ms cubic-bezier(0.22, 1, 0.36, 1)',
                style({ opacity: 1, transform: 'none' }),
              ),
            ]),
          ],
          { optional: true },
        ),
      ]),
    ]),
  ],
})
export class LocationlogComponent {
  private readonly service = inject(LocationlogService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Template-visible helpers (Angular templates cannot call bare imports). */
  readonly formatDistance = formatDistance;
  readonly formatCoordinate = formatCoordinate;
  readonly getStatusColor = getStatusColor;
  readonly getStatusText = getStatusText;
  readonly getStatusHint = getStatusHint;
  readonly getAvatarInitials = getAvatarInitials;
  readonly getAvatarGradient = getAvatarGradient;
  readonly googleMapsUrl = googleMapsUrl;
  readonly trackByProfile = trackByProfile;
  readonly virtualRowHeight = VIRTUAL_ROW_HEIGHT;
  readonly scanLimit = SCAN_LIMIT;

  readonly displayedColumns: readonly string[] = [
    'avatar',
    'name',
    'lastUpdated',
    'distance',
    'coordinates',
    'status',
    'action',
  ];

  /**
   * Filter vocabulary.
   *
   * Every option here is derivable from the three fields a location document
   * actually has (`created`, `geopoint`, `profileid`) — nothing assumes a
   * status flag, a device state or any other stored signal.
   */
  readonly freshnessOptions: readonly FilterOption<FreshnessFilter>[] = [
    { value: 'all', label: 'Any' },
    { value: 'live', label: 'Live', hint: 'Reported in the last 10 minutes' },
    { value: 'recent', label: 'Recent', hint: 'Reported in the last hour' },
    { value: 'stale', label: 'Stale', hint: 'Last report is over an hour old' },
  ];

  readonly timeWindowOptions: readonly FilterOption<TimeWindow>[] = [
    { value: 'all', label: 'Any time' },
    { value: 'hour', label: 'Last hour' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'week', label: 'Last 7 days' },
    { value: 'older', label: 'Older than 7 days' },
  ];

  readonly distanceOptions: readonly FilterOption<DistanceBand>[] = [
    { value: 'all', label: 'Any distance' },
    { value: 'within1', label: 'Within 1 km' },
    { value: 'within5', label: 'Within 5 km' },
    { value: 'within10', label: 'Within 10 km' },
    { value: 'beyond10', label: 'Farther than 10 km' },
    { value: 'beyond25', label: 'Farther than 25 km' },
    { value: 'beyond50', label: 'Farther than 50 km' },
    { value: 'unknown', label: 'Distance unknown' },
  ];

  readonly sortOptions: readonly FilterOption<SortKey>[] = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'nearest', label: 'Nearest first' },
    { value: 'farthest', label: 'Farthest first' },
    { value: 'nameAsc', label: 'Name A → Z' },
    { value: 'nameDesc', label: 'Name Z → A' },
  ];

  readonly searchControl = new FormControl<string>('', { nonNullable: true });

  // ── Inputs ────────────────────────────────────────────────────────────────
  private readonly manualRefresh$ = new BehaviorSubject<void>(undefined);
  private readonly autoRefreshOn$ = new BehaviorSubject<boolean>(false);
  private readonly filters$ = new BehaviorSubject<LocationFilters>(DEFAULT_FILTERS);
  private readonly sortKey$ = new BehaviorSubject<SortKey>('newest');
  private readonly adminLocation$ = new BehaviorSubject<GeolocationState>({
    coords: null,
    error: null,
    loading: false,
  });
  private readonly selectedProfileId$ = new BehaviorSubject<string | null>(null);
  private readonly loadingState$ = new BehaviorSubject<boolean>(true);
  private readonly errorState$ = new BehaviorSubject<string | null>(null);

  /** Wall clock, so "2 minutes ago" ages on its own. */
  private readonly clock$: Observable<number> = this.isBrowser
    ? timer(0, CLOCK_TICK_MS).pipe(
        map(() => Date.now()),
        shareReplay({ bufferSize: 1, refCount: true }),
      )
    : of(Date.now());

  // ── Public template state ─────────────────────────────────────────────────
  readonly loading = this.loadingState$.asObservable();
  readonly error = this.errorState$.asObservable();
  readonly autoRefresh = this.autoRefreshOn$.asObservable();
  readonly filters = this.filters$.asObservable();
  readonly sortKey = this.sortKey$.asObservable();
  readonly adminLocation = this.adminLocation$.asObservable();
  readonly now$ = this.clock$;
  readonly selectedId = this.selectedProfileId$.asObservable();

  /** Just the coordinates, for the map's admin marker. */
  readonly adminCoords: Observable<Coordinates | null> = this.adminLocation$.pipe(
    map((state) => state.coords),
  );

  /** Handset + portrait tablet get the card layout instead of the table. */
  readonly isHandset$ = this.breakpoints
    .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
    .pipe(
      map((state) => state.matches),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

  /**
   * Every refresh trigger: first paint, the Refresh button, and — while the
   * toggle is on — a 30s interval. `switchMap` on the toggle cancels the
   * interval the moment auto-refresh is switched off.
   */
  private readonly refreshTrigger$ = merge(
    this.manualRefresh$,
    this.autoRefreshOn$.pipe(
      switchMap((on) => (on && this.isBrowser ? interval(AUTO_REFRESH_MS) : EMPTY)),
    ),
  );

  /**
   * Locations joined to participant names. One `switchMap` chain — no nested
   * subscriptions — and errors are trapped so a failed refresh does not kill
   * the stream for every later refresh.
   */
  private readonly latest$: Observable<{
    result: LatestLocationsResult;
    names: ReadonlyMap<string, string>;
  }> = this.refreshTrigger$.pipe(
    tap(() => {
      this.loadingState$.next(true);
      this.errorState$.next(null);
    }),
    switchMap(() =>
      this.service.latestLocations().pipe(
        switchMap((result) =>
          this.service
            .resolveNames(result.logs.map((log) => log.profileid))
            .pipe(map((names) => ({ result, names }))),
        ),
        catchError((err: unknown) => {
          this.errorState$.next(
            err instanceof Error ? err.message : 'Could not load locations. Please try again.',
          );
          return of({
            result: { logs: [], truncated: false, documentsScanned: 0 } as LatestLocationsResult,
            names: new Map<string, string>() as ReadonlyMap<string, string>,
          });
        }),
      ),
    ),
    tap(() => this.loadingState$.next(false)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** True when the scan hit its cap — surfaced so the bound is never silent. */
  readonly truncated: Observable<boolean> = this.latest$.pipe(map(({ result }) => result.truncated));

  readonly documentsScanned: Observable<number> = this.latest$.pipe(
    map(({ result }) => result.documentsScanned),
  );

  /** Latest position per participant, enriched with name, distance and status. */
  private readonly participants$: Observable<readonly ParticipantLocation[]> = combineLatest([
    this.latest$,
    this.adminLocation$,
    this.clock$,
  ]).pipe(
    map(([{ result, names }, admin, now]) =>
      result.logs.map<ParticipantLocation>((log) => {
        const coords: Coordinates = { latitude: log.latitude, longitude: log.longitude };
        const name = names.get(log.profileid) ?? log.profileid;
        return {
          profileid: log.profileid,
          name,
          initials: getAvatarInitials(name),
          latitude: log.latitude,
          longitude: log.longitude,
          created: log.created,
          distanceMeters: admin.coords ? calculateDistance(admin.coords, coords) : null,
          status: deriveStatus(log.created, now),
        };
      }),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** Stats are computed over the *unfiltered* set — they describe the fleet. */
  private readonly stats$: Observable<DashboardStats> = combineLatest([
    this.participants$,
    this.clock$,
  ]).pipe(
    map(([participants, now]) => {
      const midnight = startOfDay(now);
      const withDistance = participants.filter(
        (p): p is ParticipantLocation & { distanceMeters: number } => p.distanceMeters !== null,
      );

      const farthest = withDistance.reduce<(ParticipantLocation & { distanceMeters: number }) | null>(
        (best, p) => (best === null || p.distanceMeters > best.distanceMeters ? p : best),
        null,
      );

      return {
        total: participants.length,
        live: participants.filter((p) => p.status === 'live').length,
        updatedToday: participants.filter((p) => p.created.getTime() >= midnight).length,
        averageDistanceMeters: withDistance.length
          ? withDistance.reduce((sum, p) => sum + p.distanceMeters, 0) / withDistance.length
          : null,
        farthestMeters: farthest?.distanceMeters ?? null,
        farthestName: farthest?.name ?? null,
      };
    }),
  );

  /** Everything the list and map render, in one subscription. */
  readonly view$: Observable<DashboardView> = combineLatest([
    this.participants$,
    this.filters$,
    this.sortKey$,
    this.stats$,
    this.clock$,
  ]).pipe(
    map(([participants, filters, sortKey, stats, now]) => {
      const filtered = this.applyFilters(participants, filters, now);
      return {
        participants: this.applySort(filtered, sortKey),
        stats,
        virtualise: filtered.length > VIRTUAL_SCROLL_THRESHOLD,
        activeFilterCount: countActiveFilters(filters),
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** The participant behind the details drawer, kept in sync with refreshes. */
  readonly selected$: Observable<ParticipantLocation | null> = combineLatest([
    this.participants$,
    this.selectedProfileId$,
  ]).pipe(
    map(([participants, id]) => (id ? participants.find((p) => p.profileid === id) ?? null : null)),
  );

  constructor() {
    // Search box feeds the filter state, debounced so typing does not re-sort
    // the list on every keystroke.
    this.searchControl.valueChanges
      .pipe(
        debounceTime(200),
        map((value) => value.trim().toLowerCase()),
        distinctUntilChanged(),
        startWith(''),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((search) => this.patchFilters({ search }));

    this.requestAdminLocation();
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /** Manual refresh. Re-reads locations; cached names are reused. */
  refresh(): void {
    this.manualRefresh$.next();
  }

  toggleAutoRefresh(enabled: boolean): void {
    this.autoRefreshOn$.next(enabled);
    this.snackBar.open(
      enabled ? 'Auto refresh on — every 30 seconds' : 'Auto refresh off',
      undefined,
      { duration: 2200 },
    );
  }

  setFreshness(freshness: FreshnessFilter): void {
    this.patchFilters({ freshness });
  }

  setTimeWindow(timeWindow: TimeWindow): void {
    this.patchFilters({ timeWindow });
  }

  setDistance(distance: DistanceBand): void {
    this.patchFilters({ distance });
  }

  setSort(sortKey: SortKey): void {
    this.sortKey$.next(sortKey);
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.filters$.next(DEFAULT_FILTERS);
  }

  /** Shortcut used by the "Farthest" stat card — jump straight to the outliers. */
  showFarthest(): void {
    this.patchFilters({ distance: 'all' });
    this.setSort('farthest');
  }

  /** "Locate" action — highlights the row, centres the map, opens the drawer. */
  select(participant: ParticipantLocation): void {
    this.selectedProfileId$.next(participant.profileid);
  }

  /** Marker click: centre and highlight, but do not open the drawer over the map. */
  selectFromMap(profileid: string): void {
    this.selectedProfileId$.next(profileid);
  }

  closeDetails(): void {
    this.selectedProfileId$.next(null);
  }

  /** Opens the coordinates in Google Maps in a new tab. */
  openInGoogleMaps(participant: ParticipantLocation, event?: Event): void {
    event?.stopPropagation();
    if (!this.isBrowser) return;
    window.open(googleMapsUrl(participant.latitude, participant.longitude), '_blank', 'noopener');
  }

  /** Relative label. `now` comes from the clock stream so it ages on its own. */
  relativeTime(date: Date, now: number): string {
    return formatRelativeTime(date, now);
  }

  /** Absolute timestamp for tooltips and the drawer timeline. */
  absoluteTime(date: Date): string {
    return date.toLocaleString();
  }

  /**
   * Ask the browser for the admin's position. Guarded for SSR — there is no
   * `navigator` on the server — and a denied prompt degrades to "distance
   * unknown" rather than an empty dashboard.
   */
  requestAdminLocation(): void {
    if (!this.isBrowser || !('geolocation' in navigator)) {
      this.adminLocation$.next({
        coords: null,
        error: 'Geolocation is not available in this browser.',
        loading: false,
      });
      return;
    }

    this.adminLocation$.next({ coords: null, error: null, loading: true });

    navigator.geolocation.getCurrentPosition(
      (position) =>
        this.adminLocation$.next({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          error: null,
          loading: false,
        }),
      (error) =>
        this.adminLocation$.next({
          coords: null,
          error:
            error.code === error.PERMISSION_DENIED
              ? 'Location permission denied — distances and distance filters are unavailable.'
              : 'Could not determine your location.',
          loading: false,
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  // ── Pure view logic ───────────────────────────────────────────────────────

  private patchFilters(patch: Partial<LocationFilters>): void {
    this.filters$.next({ ...this.filters$.value, ...patch });
  }

  private applyFilters(
    participants: readonly ParticipantLocation[],
    filters: LocationFilters,
    now: number,
  ): ParticipantLocation[] {
    const bounds = distanceBounds(filters.distance);
    const window = timeWindowBounds(filters.timeWindow, now);

    return participants.filter((p) => {
      if (filters.search && !p.name.toLowerCase().includes(filters.search)) {
        return false;
      }

      if (filters.freshness !== 'all' && p.status !== filters.freshness) {
        return false;
      }

      if (window) {
        const at = p.created.getTime();
        if (at < window.from || at >= window.to) return false;
      }

      if (filters.distance === 'unknown') {
        return p.distanceMeters === null;
      }

      if (bounds) {
        // Rows with no distance cannot satisfy a distance band — with the admin
        // position unknown there is nothing to measure against.
        if (p.distanceMeters === null) return false;
        if (p.distanceMeters < bounds.min || p.distanceMeters >= bounds.max) return false;
      }

      return true;
    });
  }

  private applySort(
    participants: readonly ParticipantLocation[],
    sortKey: SortKey,
  ): ParticipantLocation[] {
    const sorted = [...participants];

    switch (sortKey) {
      case 'oldest':
        return sorted.sort((a, b) => a.created.getTime() - b.created.getTime());
      case 'nearest':
        // Unknown distances sink to the bottom rather than sorting as zero.
        return sorted.sort(
          (a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
        );
      case 'farthest':
        return sorted.sort((a, b) => (b.distanceMeters ?? -1) - (a.distanceMeters ?? -1));
      case 'nameAsc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'nameDesc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      default:
        return sorted.sort((a, b) => b.created.getTime() - a.created.getTime());
    }
  }
}

/** How many facets are currently narrowing the list. */
function countActiveFilters(filters: LocationFilters): number {
  let count = 0;
  if (filters.search) count++;
  if (filters.freshness !== 'all') count++;
  if (filters.timeWindow !== 'all') count++;
  if (filters.distance !== 'all') count++;
  return count;
}
