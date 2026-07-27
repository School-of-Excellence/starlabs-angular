/**
 * Live Location Tracking dashboard.
 *
 * Shows one row per participant — their *latest* reported position — with
 * distance from the admin's own device, freshness status, filtering, sorting,
 * and a details drawer.
 *
 * There is no embedded map by design — coordinates are shown as text and the
 * "Open in Google Maps" action hands off to a real map application.
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
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
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

import {
  Coordinates,
  DEFAULT_FILTERS,
  DashboardStats,
  DistanceBand,
  FreshnessFilter,
  DeviceLocationState,
  LocationFilters,
  ParticipantLocation,
  ReferencePoint,
  SortKey,
  TimeWindow,
} from './location.model';
import { LatestLocationsResult, LocationlogService, SCAN_LIMIT } from './locationlog.service';
import {
  SORT_TO_HEADER,
  calculateDistance,
  clampPageIndex,
  deriveStatus,
  distanceBounds,
  formatCoordinate,
  formatDistance,
  formatRelativeTime,
  getAvatarGradient,
  getAvatarInitials,
  getStatusHint,
  getStatusText,
  googleMapsUrl,
  isValidLatitude,
  isValidLongitude,
  parseCoordinatePair,
  sortKeyFromHeader,
  sortParticipants,
  startOfDay,
  timeWindowBounds,
  trackByProfile,
} from './location.utils';

/** Auto-refresh cadence. */
const AUTO_REFRESH_MS = 30_000;

/** Relative timestamps and status chips are recomputed on this cadence. */
const CLOCK_TICK_MS = 30_000;

/** Where the chosen reference point is remembered between visits. */
const REFERENCE_STORAGE_KEY = 'locationlog_reference_point';

/** Rows per page, and the choices offered in the paginator. */
const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** A pickable option in one of the filter dropdowns. */
interface FilterOption<T> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

/** What the template renders, assembled in one place to keep the HTML dumb. */
interface DashboardView {
  /** The current page only — this is what the table and card list render. */
  readonly participants: readonly ParticipantLocation[];
  readonly stats: DashboardStats;
  /** Rows surviving the filters, across all pages. Drives the paginator. */
  readonly filteredCount: number;
  readonly pageIndex: number;
  readonly pageSize: number;
  /** How many facets are narrowing the list — drives the "Clear" affordance. */
  readonly activeFilterCount: number;
  /** Sort state in the shape a Material sort header expects. */
  readonly sortActive: string;
  readonly sortDirection: 'asc' | 'desc';
}

@Component({
  selector: 'app-locationlog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSortModule,
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
  private readonly sanitizer = inject(DomSanitizer);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Whether the drawer can show an embedded map.
   *
   * The embed is a plain Google Maps iframe — no API key, no billing, no SDK.
   * The one thing that stops it is cross-origin isolation: under
   * `COEP: require-corp` *or* `credentialless` the browser blocks every
   * third-party iframe, and it does so **silently** — no console error, just a
   * blank rectangle. This app opts into isolation app-wide via
   * coi-serviceworker.js (the Zoom SDK needs SharedArrayBuffer), so on the
   * deployed site the embed cannot render and the drawer shows a fallback
   * instead of a mystery blank box.
   *
   * Verified both ways with a local probe: COEP credentialless -> blocked,
   * no COEP -> the map renders.
   */
  readonly canEmbedMap = this.isBrowser && window.crossOriginIsolated !== true;

  /**
   * Memoised iframe URLs, keyed by coordinates.
   *
   * The template must not build a fresh SafeResourceUrl per change detection
   * pass: a new object identity re-assigns the iframe `src`, which reloads the
   * map. The clock ticks every 30s, so an unmemoised URL would visibly reload
   * the drawer map twice a minute.
   */
  private readonly embedUrlCache = new Map<string, SafeResourceUrl>();

  /** Template-visible helpers (Angular templates cannot call bare imports). */
  readonly formatDistance = formatDistance;
  readonly formatCoordinate = formatCoordinate;
  readonly getStatusText = getStatusText;
  readonly getStatusHint = getStatusHint;
  readonly getAvatarInitials = getAvatarInitials;
  readonly getAvatarGradient = getAvatarGradient;
  readonly googleMapsUrl = googleMapsUrl;
  readonly trackByProfile = trackByProfile;
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
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
    { value: 'statusFresh', label: 'Status · live first' },
    { value: 'statusStale', label: 'Status · stale first' },
  ];

  readonly searchControl = new FormControl<string>('', { nonNullable: true });

  // ── Inputs ────────────────────────────────────────────────────────────────
  private readonly manualRefresh$ = new BehaviorSubject<void>(undefined);
  private readonly autoRefreshOn$ = new BehaviorSubject<boolean>(false);
  private readonly filters$ = new BehaviorSubject<LocationFilters>(DEFAULT_FILTERS);
  private readonly sortKey$ = new BehaviorSubject<SortKey>('newest');
  private readonly pageIndex$ = new BehaviorSubject<number>(0);
  private readonly pageSize$ = new BehaviorSubject<number>(DEFAULT_PAGE_SIZE);
  private readonly reference$ = new BehaviorSubject<ReferencePoint | null>(null);
  private readonly deviceState$ = new BehaviorSubject<DeviceLocationState>({
    error: null,
    loading: false,
  });
  private readonly pickerOpen$ = new BehaviorSubject<boolean>(false);
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
  readonly reference = this.reference$.asObservable();
  readonly deviceState = this.deviceState$.asObservable();
  readonly pickerOpen = this.pickerOpen$.asObservable();
  readonly now$ = this.clock$;
  readonly selectedId = this.selectedProfileId$.asObservable();

  /** Just the coordinates of the reference point, or null while unset. */
  readonly referenceCoords: Observable<Coordinates | null> = this.reference$.pipe(
    map((point) => point?.coords ?? null),
  );

  /** Inputs for the manual coordinate entry form. */
  readonly latControl = new FormControl<string>('', { nonNullable: true });
  readonly lngControl = new FormControl<string>('', { nonNullable: true });
  readonly pickerError = signal<string | null>(null);

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
    this.reference$,
    this.clock$,
  ]).pipe(
    map(([{ result, names }, reference, now]) =>
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
          distanceMeters: reference ? calculateDistance(reference.coords, coords) : null,
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

  /** Everything the list renders, in one subscription. */
  readonly view$: Observable<DashboardView> = combineLatest([
    this.participants$,
    this.filters$,
    this.sortKey$,
    this.stats$,
    this.clock$,
    this.pageIndex$,
    this.pageSize$,
  ]).pipe(
    map(([participants, filters, sortKey, stats, now, pageIndex, pageSize]) => {
      const filtered = this.applyFilters(participants, filters, now);
      const sorted = sortParticipants(filtered, sortKey);

      const safeIndex = clampPageIndex(pageIndex, sorted.length, pageSize);
      const start = safeIndex * pageSize;

      const header = SORT_TO_HEADER[sortKey];

      return {
        participants: sorted.slice(start, start + pageSize),
        stats,
        filteredCount: sorted.length,
        pageIndex: safeIndex,
        pageSize,
        activeFilterCount: countActiveFilters(filters),
        sortActive: header.active,
        sortDirection: header.direction,
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

    // Restore the previously chosen reference point. Nothing is requested from
    // the browser automatically — picking the point is the operator's call.
    const stored = this.readStoredReference();
    if (stored) {
      this.reference$.next(stored);
    }
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

  /** Sort from the dropdown. Returns to page 1 — page 4 of the old order is
   *  meaningless once the order changes. */
  setSort(sortKey: SortKey): void {
    this.sortKey$.next(sortKey);
    this.pageIndex$.next(0);
  }

  /**
   * Sort from a clickable table header. Translates the (column, direction) pair
   * back into the same `SortKey` state the dropdown writes, so the two controls
   * stay in lockstep. Clearing a sort (Material's third click) falls back to
   * newest-first rather than leaving the list in an arbitrary order.
   */
  onSortChange(sort: Sort): void {
    this.setSort(sortKeyFromHeader(sort.active, sort.direction) ?? 'newest');
  }

  /** Paginator moved, or the page size changed. */
  onPage(event: PageEvent): void {
    this.pageSize$.next(event.pageSize);
    this.pageIndex$.next(event.pageIndex);
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.filters$.next(DEFAULT_FILTERS);
    this.pageIndex$.next(0);
  }

  /** Shortcut used by the "Farthest" stat card — jump straight to the outliers. */
  showFarthest(): void {
    this.patchFilters({ distance: 'all' });
    this.setSort('farthest');
  }

  /** "Locate" action — highlights the row and opens the details drawer. */
  select(participant: ParticipantLocation): void {
    this.selectedProfileId$.next(participant.profileid);
  }

  closeDetails(): void {
    this.selectedProfileId$.next(null);
  }

  /**
   * Keyless Google Maps embed for the drawer.
   *
   * `output=embed` on the plain maps.google.com URL renders an interactive map
   * in an iframe with no API key and no billing account — unlike the official
   * Maps Embed API, which requires both. It is a long-standing but undocumented
   * URL, so if Google ever retires it the drawer degrades to the same fallback
   * that cross-origin isolation triggers, and the "Open in Google Maps" button
   * keeps working regardless.
   */
  mapEmbedUrl(participant: ParticipantLocation): SafeResourceUrl {
    const key = `${participant.latitude},${participant.longitude}`;
    const cached = this.embedUrlCache.get(key);
    if (cached) return cached;

    const url = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://maps.google.com/maps?q=${key}&z=16&hl=en&output=embed`,
    );
    this.embedUrlCache.set(key, url);
    return url;
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

  // ── Reference point ───────────────────────────────────────────────────────

  togglePicker(): void {
    const opening = !this.pickerOpen$.value;
    this.pickerOpen$.next(opening);

    if (opening) {
      // Seed the inputs with the current point so "adjust slightly" is easy.
      const current = this.reference$.value;
      this.latControl.setValue(current ? String(current.coords.latitude) : '');
      this.lngControl.setValue(current ? String(current.coords.longitude) : '');
      this.pickerError.set(null);
    }
  }

  /**
   * Accept a pasted "lat, lng" pair in either field and split it across both.
   *
   * Copying a coordinate pair out of Google Maps — or out of this dashboard's
   * own coordinates column — puts both numbers on the clipboard together, and
   * having to hand-split them is a needless papercut.
   */
  onCoordinatePaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const parsed = parseCoordinatePair(text);
    if (!parsed) return;

    event.preventDefault();
    this.latControl.setValue(String(parsed.latitude));
    this.lngControl.setValue(String(parsed.longitude));
    this.pickerError.set(null);
  }

  /** Commit the manually typed coordinates as the reference point. */
  applyManualReference(): void {
    const parsed = parseCoordinatePair(`${this.latControl.value}, ${this.lngControl.value}`);

    if (!parsed) {
      this.pickerError.set(
        'Enter a valid latitude (-90 to 90) and longitude (-180 to 180).',
      );
      return;
    }

    this.setReference({
      coords: parsed,
      source: 'manual',
      label: 'Custom location',
    });
  }

  /** Use a participant's own latest position as the reference point. */
  useParticipantAsReference(participant: ParticipantLocation): void {
    this.setReference({
      coords: { latitude: participant.latitude, longitude: participant.longitude },
      source: 'participant',
      label: participant.name,
    });
  }

  /**
   * Ask the browser for a device fix — only ever on an explicit click.
   *
   * This is no longer done automatically on load: the browser reports wherever
   * the admin's machine happens to be, which is regularly not the place the
   * distances should be measured from (reviewing from home, a different city,
   * behind a VPN). Silently anchoring every distance to that was wrong.
   */
  useDeviceAsReference(): void {
    if (!this.isBrowser || !('geolocation' in navigator)) {
      this.deviceState$.next({
        error: 'Geolocation is not available in this browser.',
        loading: false,
      });
      return;
    }

    this.deviceState$.next({ error: null, loading: true });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.deviceState$.next({ error: null, loading: false });
        this.setReference({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          source: 'device',
          label: 'This device',
        });
      },
      (error) =>
        this.deviceState$.next({
          error:
            error.code === error.PERMISSION_DENIED
              ? 'Location permission denied. Enter coordinates manually instead.'
              : 'Could not read this device’s location. Enter coordinates manually instead.',
          loading: false,
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  /** Drop the reference point — distances and distance filters go unavailable. */
  clearReference(): void {
    this.reference$.next(null);
    this.deviceState$.next({ error: null, loading: false });
    this.patchFilters({ distance: 'all' });
    this.writeStoredReference(null);
    this.snackBar.open('Reference location cleared', undefined, { duration: 2200 });
  }

  private setReference(point: ReferencePoint): void {
    this.reference$.next(point);
    this.pickerOpen$.next(false);
    this.pickerError.set(null);
    this.pageIndex$.next(0);
    this.writeStoredReference(point);
    this.snackBar.open(`Measuring distances from ${point.label}`, undefined, { duration: 2600 });
  }

  /**
   * Persist the choice. Re-picking a location on every page load would defeat
   * the point of choosing it manually.
   */
  private writeStoredReference(point: ReferencePoint | null): void {
    if (!this.isBrowser) return;
    try {
      if (point) {
        localStorage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify(point));
      } else {
        localStorage.removeItem(REFERENCE_STORAGE_KEY);
      }
    } catch {
      // Private browsing or a full quota — the dashboard still works, the
      // choice just will not survive a reload.
    }
  }

  private readStoredReference(): ReferencePoint | null {
    if (!this.isBrowser) return null;
    try {
      const raw = localStorage.getItem(REFERENCE_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as ReferencePoint;
      // Validate rather than trust: storage is user-writable and a bad value
      // would poison every distance on the page.
      if (
        !parsed?.coords ||
        !isValidLatitude(parsed.coords.latitude) ||
        !isValidLongitude(parsed.coords.longitude)
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  // ── Pure view logic ───────────────────────────────────────────────────────

  /** Any filter change returns to page 1 — the old page number no longer
   *  refers to the same rows. */
  private patchFilters(patch: Partial<LocationFilters>): void {
    this.filters$.next({ ...this.filters$.value, ...patch });
    this.pageIndex$.next(0);
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
