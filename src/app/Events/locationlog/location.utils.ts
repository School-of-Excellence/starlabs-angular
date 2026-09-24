/**
 * Pure helpers for the Live Location Tracking dashboard.
 *
 * Everything here is side-effect free and independently testable — no Firestore,
 * no Angular, no DOM. Keep it that way.
 */

import {
  Coordinates,
  CustomDistance,
  DistanceBand,
  DistanceBounds,
  LocationStatus,
  ParticipantLocation,
  SortKey,
  TimeWindow,
} from './location.model';

/** Mean Earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

/** A participant is "live" if their latest report landed within this window. */
export const LIVE_WINDOW_MS = 10 * 60 * 1000;

/** Between the live window and this, the participant is "recent" (amber). */
export const RECENT_WINDOW_MS = 60 * 60 * 1000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points, in metres (Haversine).
 *
 * Accurate to ~0.5% — far tighter than GPS noise at the scales this dashboard
 * displays, and cheap enough to run per row on every change detection pass.
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Human-readable distance: metres below 1 km, kilometres above.
 * Returns an em dash when the distance is unknown (geolocation denied/pending).
 */
export function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) {
    return '—';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/**
 * "just now" / "2 minutes ago" / "Yesterday" / "12 Mar 2026".
 *
 * `now` is injectable so callers can freeze the clock (tests, and so a single
 * render pass produces a consistent set of labels).
 */
export function formatRelativeTime(date: Date, now: number = Date.now()): string {
  const elapsed = now - date.getTime();

  if (elapsed < 60_000) return 'just now';

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24 && isSameDay(date, new Date(now))) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  if (isYesterday(date, new Date(now))) {
    return 'Yesterday';
  }

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Freshness bucket for a report timestamp.
 *
 * This is the *entire* mechanism behind the status column and the Live/Recent/
 * Stale filter. A location document stores only `created`, `geopoint` and
 * `profileid` — there is no connectivity signal to read — so status answers
 * "how long ago did this device last report?" and nothing more.
 */
export function deriveStatus(created: Date, now: number = Date.now()): LocationStatus {
  const elapsed = now - created.getTime();
  if (elapsed <= LIVE_WINDOW_MS) return 'live';
  if (elapsed <= RECENT_WINDOW_MS) return 'recent';
  return 'stale';
}

/** Label shown on the status chip. */
export function getStatusText(status: LocationStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'recent':
      return 'Recent';
    default:
      return 'Stale';
  }
}

/**
 * Freshness rank for sorting: live (0) → recent (1) → stale (2).
 * Kept next to `deriveStatus` so the two orderings can never drift apart.
 */
export function statusRank(status: LocationStatus): number {
  switch (status) {
    case 'live':
      return 0;
    case 'recent':
      return 1;
    default:
      return 2;
  }
}

/** Tooltip spelling out what the status actually means. */
export function getStatusHint(status: LocationStatus): string {
  switch (status) {
    case 'live':
      return 'Reported within the last 10 minutes';
    case 'recent':
      return 'Reported within the last hour';
    default:
      return 'Last reported over an hour ago';
  }
}

/**
 * Avatar initials: first letter of the first and last name parts.
 * "John David" -> "JD", "Priya" -> "P", "" -> "?".
 */
export function getAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Deterministic avatar gradient so a participant keeps the same colour between
 * renders and refreshes. Hue is derived from the profile id, not the index.
 */
export function getAvatarGradient(profileid: string): string {
  const hue = hashHue(profileid);
  return `linear-gradient(135deg, hsl(${hue} 68% 56%), hsl(${(hue + 38) % 360} 68% 44%))`;
}

/**
 * Two-way map between the single `SortKey` state and the (column, direction)
 * pair a Material sort header speaks.
 *
 * One source of truth is what keeps the "Sort by" dropdown and the clickable
 * table headers from contradicting each other — change one and the other
 * visibly follows.
 */
export const SORT_TO_HEADER: Readonly<
  Record<SortKey, { readonly active: string; readonly direction: 'asc' | 'desc' }>
> = {
  newest: { active: 'lastUpdated', direction: 'desc' },
  oldest: { active: 'lastUpdated', direction: 'asc' },
  nearest: { active: 'distance', direction: 'asc' },
  farthest: { active: 'distance', direction: 'desc' },
  nameAsc: { active: 'name', direction: 'asc' },
  nameDesc: { active: 'name', direction: 'desc' },
  statusFresh: { active: 'status', direction: 'asc' },
  statusStale: { active: 'status', direction: 'desc' },
};

/** Reverse lookup: a clicked header back to the sort state it represents. */
export function sortKeyFromHeader(active: string, direction: 'asc' | 'desc' | ''): SortKey | null {
  if (!direction) return null;
  return (
    (Object.keys(SORT_TO_HEADER) as SortKey[]).find(
      (key) =>
        SORT_TO_HEADER[key].active === active && SORT_TO_HEADER[key].direction === direction,
    ) ?? null
  );
}

/**
 * Order participants by the given key. Returns a new array — the input may be
 * a shared, frozen slice of dashboard state.
 *
 * Unknown distances sink to the bottom of *both* distance orders rather than
 * sorting as zero, and status ties break by recency so the order is stable
 * rather than arbitrary.
 */
export function sortParticipants(
  participants: readonly ParticipantLocation[],
  sortKey: SortKey,
): ParticipantLocation[] {
  const sorted = [...participants];

  switch (sortKey) {
    case 'oldest':
      return sorted.sort((a, b) => a.created.getTime() - b.created.getTime());
    case 'nearest':
      return sorted.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    case 'farthest':
      return sorted.sort((a, b) => (b.distanceMeters ?? -1) - (a.distanceMeters ?? -1));
    case 'nameAsc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'nameDesc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'statusFresh':
      return sorted.sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) || b.created.getTime() - a.created.getTime(),
      );
    case 'statusStale':
      return sorted.sort(
        (a, b) =>
          statusRank(b.status) - statusRank(a.status) || a.created.getTime() - b.created.getTime(),
      );
    default:
      return sorted.sort((a, b) => b.created.getTime() - a.created.getTime());
  }
}

/**
 * Clamp a page index against a list that may have shrunk under it.
 *
 * A filter change or a refresh can leave the stored index past the end, and an
 * out-of-range page renders as empty with no obvious way back.
 */
export function clampPageIndex(pageIndex: number, totalRows: number, pageSize: number): number {
  const lastPage = Math.max(0, Math.ceil(totalRows / pageSize) - 1);
  return Math.min(Math.max(0, pageIndex), lastPage);
}

/** `trackBy` for every participant list/table in the dashboard. */
export function trackByProfile(_index: number, item: ParticipantLocation): string {
  return item.profileid;
}

/** Deep link that opens the coordinates in Google Maps. */
export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/** Coordinate formatted for display — 6 dp is ~11 cm, plenty. */
export function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

export const isValidLatitude = (value: number): boolean =>
  Number.isFinite(value) && value >= -90 && value <= 90;

export const isValidLongitude = (value: number): boolean =>
  Number.isFinite(value) && value >= -180 && value <= 180;

/**
 * Parse a pasted coordinate pair into latitude/longitude.
 *
 * Accepts what people actually paste out of Google Maps and out of this very
 * dashboard: `12.940029, 80.253343`, whitespace- or semicolon-separated, and
 * optional N/S/E/W suffixes as Firestore's own console renders them
 * (`12.94° N, 80.25° E`). Returns null on anything it cannot read with
 * confidence — a silently wrong reference point would corrupt every distance
 * on the page.
 */
export function parseCoordinatePair(input: string): Coordinates | null {
  const cleaned = input.trim().replace(/[°]/g, ' ');
  if (!cleaned) return null;

  const parts = cleaned
    .split(/[,;]|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2 || parts.length > 4) return null;

  const numbers: number[] = [];
  const hemispheres: string[] = [];

  for (const part of parts) {
    const hemisphere = /^[NSEW]$/i.exec(part);
    if (hemisphere) {
      hemispheres.push(part.toUpperCase());
      continue;
    }
    const value = Number(part);
    if (!Number.isFinite(value)) return null;
    numbers.push(value);
  }

  if (numbers.length !== 2) return null;

  let [latitude, longitude] = numbers;

  // "12.94 N, 80.25 E" — apply the sign the hemisphere implies.
  if (hemispheres.length === 2) {
    if (hemispheres[0] === 'S') latitude = -Math.abs(latitude);
    if (hemispheres[0] === 'N') latitude = Math.abs(latitude);
    if (hemispheres[1] === 'W') longitude = -Math.abs(longitude);
    if (hemispheres[1] === 'E') longitude = Math.abs(longitude);
  } else if (hemispheres.length !== 0) {
    return null;
  }

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;

  return { latitude, longitude };
}

/**
 * Metre bounds for a distance band. Outward bands ("beyond 10 km") are open at
 * the top; `all` and `unknown` are handled by the caller, not by bounds.
 */
export function distanceBounds(band: DistanceBand): DistanceBounds | null {
  switch (band) {
    case 'within1':
      return { min: 0, max: 1_000 };
    case 'within5':
      return { min: 0, max: 5_000 };
    case 'within10':
      return { min: 0, max: 10_000 };
    case 'beyond10':
      return { min: 10_000, max: Infinity };
    case 'beyond25':
      return { min: 25_000, max: Infinity };
    case 'beyond50':
      return { min: 50_000, max: Infinity };
    default:
      return null;
  }
}

/** A hand-entered radius converted to metres. Null when nothing usable. */
export function customDistanceMeters(custom: CustomDistance): number | null {
  const { value, unit } = custom;
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return unit === 'km' ? value * 1000 : value;
}

/**
 * Metre bounds for a hand-entered radius.
 *
 * `within` is inclusive of the radius itself — someone typing "500 m" means
 * "500 m or nearer", not "up to 499". `beyond` is therefore exclusive, so the
 * two directions partition the participants with no row falling through both
 * or neither.
 */
export function customDistanceBounds(custom: CustomDistance): DistanceBounds | null {
  const meters = customDistanceMeters(custom);
  if (meters === null) return null;

  return custom.direction === 'within'
    ? { min: 0, max: nextAfter(meters) }
    : { min: nextAfter(meters), max: Infinity };
}

/** Human summary of a custom radius, e.g. "Within 750 m", for the filter chip. */
export function describeCustomDistance(custom: CustomDistance): string | null {
  if (customDistanceMeters(custom) === null) return null;
  const verb = custom.direction === 'within' ? 'Within' : 'Farther than';
  return `${verb} ${custom.value} ${custom.unit}`;
}

/**
 * Smallest step above a value, so an inclusive upper bound can be expressed
 * against the exclusive `max` that `distanceBounds` uses everywhere else.
 */
function nextAfter(value: number): number {
  return value + Number.EPSILON * Math.max(1, Math.abs(value));
}

/**
 * Millisecond bounds for a time window, relative to `now`.
 * Returns `null` for "any time".
 */
export function timeWindowBounds(
  window: TimeWindow,
  now: number = Date.now(),
): { from: number; to: number } | null {
  const midnight = startOfDay(now);

  switch (window) {
    case 'hour':
      return { from: now - 60 * 60 * 1000, to: Infinity };
    case 'today':
      return { from: midnight, to: Infinity };
    case 'yesterday':
      return { from: midnight - 24 * 60 * 60 * 1000, to: midnight };
    case 'week':
      return { from: now - 7 * 24 * 60 * 60 * 1000, to: Infinity };
    case 'older':
      return { from: -Infinity, to: now - 7 * 24 * 60 * 60 * 1000 };
    default:
      return null;
  }
}

/** Local midnight for the given clock — the boundary for "updated today". */
export function startOfDay(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function hashHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(date: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}
