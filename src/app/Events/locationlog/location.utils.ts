/**
 * Pure helpers for the Live Location Tracking dashboard.
 *
 * Everything here is side-effect free and independently testable — no Firestore,
 * no Angular, no DOM. Keep it that way.
 */

import {
  Coordinates,
  DistanceBand,
  DistanceBounds,
  LocationStatus,
  ParticipantLocation,
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
