/**
 * Domain model for the Live Location Tracking dashboard.
 *
 * Firestore shape this maps from:
 *   /locationlogs/{autoId}          -> { created: Timestamp, geopoint: GeoPoint, profileid: string }
 *   /participant metadata/{profileid} -> { name: string, ... }
 */

/** A single raw location report, normalised out of Firestore primitives. */
export interface LocationLog {
  /** Firestore document id of the log entry. */
  readonly id: string;
  /** Owning participant — document id in `participant metadata`. */
  readonly profileid: string;
  readonly latitude: number;
  readonly longitude: number;
  /** `created` Timestamp converted to a JS Date. */
  readonly created: Date;
}

/** The slice of `participant metadata` the dashboard needs. */
export interface Participant {
  readonly profileid: string;
  readonly name: string;
}

/** Freshness bucket derived from how long ago the participant last reported. */
export type LocationStatus = 'online' | 'recent' | 'offline';

/** A participant joined to their latest location, ready for rendering. */
export interface ParticipantLocation {
  readonly profileid: string;
  readonly name: string;
  /** Uppercase initials for the avatar, e.g. "John David" -> "JD". */
  readonly initials: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly created: Date;
  /** Straight-line distance from the admin, in metres. `null` until geolocation resolves. */
  readonly distanceMeters: number | null;
  readonly status: LocationStatus;
}

/** Aggregate counters shown in the header stat cards. */
export interface DashboardStats {
  readonly total: number;
  /** Reported within the last 10 minutes. */
  readonly online: number;
  /** Reported at any point since local midnight. */
  readonly updatedToday: number;
  /** Mean distance in metres across participants with a known distance. */
  readonly averageDistanceMeters: number | null;
}

/** A latitude/longitude pair (the admin's own position, or a participant's). */
export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** How the participant list is ordered. */
export type SortKey = 'newest' | 'distance' | 'name';

/** Status facet for the filter bar. */
export type StatusFilter = 'all' | 'online' | 'offline' | 'today';

/** Every user-controlled narrowing applied to the participant list. */
export interface LocationFilters {
  readonly search: string;
  readonly status: StatusFilter;
  /** Radius in kilometres, or `null` for "any distance". Ignored without an admin position. */
  readonly radiusKm: number | null;
}

/** Result of asking the browser for the admin's position. */
export interface GeolocationState {
  readonly coords: Coordinates | null;
  readonly error: string | null;
  readonly loading: boolean;
}
