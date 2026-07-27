/**
 * Pure helpers for the Live Location Tracking dashboard.
 *
 * Everything here is side-effect free and independently testable — no Firestore,
 * no Angular, no DOM. Keep it that way.
 */

import { Coordinates, LocationStatus, ParticipantLocation } from './location.model';

/** Mean Earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

/** A participant is "online" if they reported within this window. */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000;

/** Between the online window and this, the participant is "recent" (amber). */
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

  if (elapsed < 0) return 'just now';
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

/** Freshness bucket for a report timestamp. */
export function deriveStatus(created: Date, now: number = Date.now()): LocationStatus {
  const elapsed = now - created.getTime();
  if (elapsed <= ONLINE_WINDOW_MS) return 'online';
  if (elapsed <= RECENT_WINDOW_MS) return 'recent';
  return 'offline';
}

/** CSS custom-property-friendly colour token for a status. */
export function getStatusColor(status: LocationStatus): string {
  switch (status) {
    case 'online':
      return 'var(--ll-success)';
    case 'recent':
      return 'var(--ll-warning)';
    default:
      return 'var(--ll-danger)';
  }
}

/** Label shown on the status chip. */
export function getStatusText(status: LocationStatus): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'recent':
      return 'Recent';
    default:
      return 'Offline';
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
  let hash = 0;
  for (let i = 0; i < profileid.length; i++) {
    hash = (hash * 31 + profileid.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 58%), hsl(${(hue + 38) % 360} 72% 46%))`;
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

/** Local midnight for the given clock — the boundary for "updated today". */
export function startOfDay(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
