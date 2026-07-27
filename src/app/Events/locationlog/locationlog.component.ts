/**
 * Live Location Tracking dashboard.
 *
 * Shows one row per participant — their *latest* reported position — with
 * distance from the admin's own device, freshness status, filtering, sorting
 * and a details drawer.
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
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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

import {
  Coordinates,
  DashboardStats,
  GeolocationState,
  LocationFilters,
  ParticipantLocation,
  SortKey,
  StatusFilter,
} from './location.model';
import { LatestLocationsResult, LocationlogService, SCAN_LIMIT } from './locationlog.service';
import {
  calculateDistance,
  deriveStatus,
  formatCoordinate,
  formatDistance,
  formatRelativeTime,
  getAvatarGradient,
  getAvatarInitials,
  getStatusColor,
  getStatusText,
  googleMapsUrl,
  startOfDay,
  trackByProfile,
} from './location.utils';

/** Auto-refresh cadence, per spec. */
const AUTO_REFRESH_MS = 30_000;

/** Relative timestamps and status chips are recomputed on this cadence. */
const CLOCK_TICK_MS = 30_000;

/** Above this many rows the table is swapped for a virtualised card list. */
const VIRTUAL_SCROLL_THRESHOLD = 100;

/** Row height used by the virtual scroll viewport, in px. Must match the CSS. */
export const VIRTUAL_ROW_HEIGHT = 88;

/** What the template renders, assembled in one place to keep the HTML dumb. */
interface DashboardView {
  readonly participants: readonly ParticipantLocation[];
  readonly stats: DashboardStats;
  readonly virtualise: boolean;
}

@Component({
  selector: 'app-locationlog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ScrollingModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
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
            stagger(70, [
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
    'latitude',
    'longitude',
    'status',
    'action',
  ];

  readonly searchControl = new FormControl<string>('', { nonNullable: true });

  // ── Inputs ────────────────────────────────────────────────────────────────
  private readonly manualRefresh$ = new BehaviorSubject<void>(undefined);
  private readonly autoRefreshOn$ = new BehaviorSubject<boolean>(false);
  private readonly filters$ = new BehaviorSubject<LocationFilters>({
    search: '',
    status: 'all',
    radiusKm: null,
  });
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
      const known = participants
        .map((p) => p.distanceMeters)
        .filter((d): d is number => d !== null);

      return {
        total: participants.length,
        online: participants.filter((p) => p.status === 'online').length,
        updatedToday: participants.filter((p) => p.created.getTime() >= midnight).length,
        averageDistanceMeters: known.length
          ? known.reduce((sum, d) => sum + d, 0) / known.length
          : null,
      };
    }),
  );

  /** Everything the list section renders, in one subscription. */
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
      };
    }),
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

  setStatusFilter(status: StatusFilter): void {
    this.patchFilters({ status });
  }

  setRadiusFilter(radiusKm: number | null): void {
    this.patchFilters({ radiusKm });
  }

  setSort(sortKey: SortKey): void {
    this.sortKey$.next(sortKey);
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.filters$.next({ search: '', status: 'all', radiusKm: null });
  }

  /** "Locate" action — highlights the row and opens the details drawer. */
  select(participant: ParticipantLocation): void {
    this.selectedProfileId$.next(participant.profileid);
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
              ? 'Location permission denied — distances are unavailable.'
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
    const midnight = startOfDay(now);
    const radiusMeters = filters.radiusKm === null ? null : filters.radiusKm * 1000;

    return participants.filter((p) => {
      if (filters.search && !p.name.toLowerCase().includes(filters.search)) {
        return false;
      }

      switch (filters.status) {
        case 'online':
          if (p.status !== 'online') return false;
          break;
        case 'offline':
          if (p.status === 'online') return false;
          break;
        case 'today':
          if (p.created.getTime() < midnight) return false;
          break;
        default:
          break;
      }

      // Without an admin position every distance is null; the radius facet is
      // disabled in the UI, but guard anyway so it can never empty the list.
      if (radiusMeters !== null && p.distanceMeters !== null && p.distanceMeters > radiusMeters) {
        return false;
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
      case 'distance':
        // Unknown distances sink to the bottom rather than sorting as zero.
        return sorted.sort(
          (a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
        );
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return sorted.sort((a, b) => b.created.getTime() - a.created.getTime());
    }
  }
}
