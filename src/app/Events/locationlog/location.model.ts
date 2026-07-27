/**
 * Domain model for the Live Location Tracking dashboard.
 *
 * Firestore shape this maps from:
 *   /locationlogs/{autoId}            -> { created: Timestamp, geopoint: GeoPoint, profileid: string }
 *   /participant metadata/{profileid} -> { name: string, ... }
 *
 * Note that a location document carries only three fields. Everything the
 * dashboard filters, sorts or colours by is *derived* from those three — there
 * is no stored status, no "is online" flag, no device state. See
 * `deriveStatus()` in location.utils.ts for exactly how freshness is computed.
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

/**
 * Freshness bucket, derived purely from `created`.
 *
 * Deliberately *not* called online/offline: a location log tells us when a
 * device last reported, never whether it is currently connected. A phone that
 * is powered on but has not written a log is indistinguishable from one that is
 * switched off, so the labels promise only what the data supports.
 */
export type LocationStatus = 'live' | 'recent' | 'stale';

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
  readonly live: number;
  /** Reported at any point since local midnight. */
  readonly updatedToday: number;
  /** Mean distance in metres across participants with a known distance. */
  readonly averageDistanceMeters: number | null;
  /** Largest known distance — the "who is furthest out" number. */
  readonly farthestMeters: number | null;
  /** Name of the farthest participant, for the card subtitle. */
  readonly farthestName: string | null;
}

/** A latitude/longitude pair (the admin's own position, or a participant's). */
export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * How the participant list is ordered.
 *
 * Each key is a (column, direction) pair rather than a bare column, so the
 * "Sort by" dropdown and the sortable table headers can drive the same single
 * piece of state and never disagree with each other.
 */
export type SortKey =
  | 'newest'
  | 'oldest'
  | 'nearest'
  | 'farthest'
  | 'nameAsc'
  | 'nameDesc'
  | 'statusFresh'
  | 'statusStale';

/** Freshness facet. Mirrors LocationStatus plus an "any" option. */
export type FreshnessFilter = 'all' | 'live' | 'recent' | 'stale';

/** When the latest report landed. Independent of the freshness facet. */
export type TimeWindow = 'all' | 'hour' | 'today' | 'yesterday' | 'week' | 'older';

/**
 * Distance facet. Includes *outward* bands ("beyond 10 km") so the far-flung
 * participants are as findable as the nearby ones, plus `unknown` for rows with
 * no distance because geolocation was denied or unavailable.
 */
export type DistanceBand =
  | 'all'
  | 'within1'
  | 'within5'
  | 'within10'
  | 'beyond10'
  | 'beyond25'
  | 'beyond50'
  | 'unknown'
  /** A radius typed by hand — see `CustomDistance`. */
  | 'custom';

/** Unit for a hand-entered radius. Metres matter at campus/venue scale. */
export type DistanceUnit = 'm' | 'km';

/** Which side of the radius to keep. */
export type DistanceDirection = 'within' | 'beyond';

/**
 * A radius typed by the operator rather than chosen from the presets.
 *
 * The value is kept exactly as entered, with its unit, rather than normalised
 * to metres up front: "0.5 km" and "500 m" are the same radius but not the same
 * thing to read back in the UI, and round-tripping through metres would rewrite
 * what the operator typed.
 */
export interface CustomDistance {
  /** Null while the box is empty or holds something unparseable. */
  readonly value: number | null;
  readonly unit: DistanceUnit;
  readonly direction: DistanceDirection;
}

/** Inclusive-min / exclusive-max metre bounds for a distance band. */
export interface DistanceBounds {
  readonly min: number;
  readonly max: number;
}

/** Every user-controlled narrowing applied to the participant list. */
export interface LocationFilters {
  readonly search: string;
  readonly freshness: FreshnessFilter;
  readonly timeWindow: TimeWindow;
  readonly distance: DistanceBand;
  /** Only consulted when `distance` is 'custom'. */
  readonly customDistance: CustomDistance;
}

/** Where the reference point came from. Shown so the number is never mystery. */
export type ReferenceSource = 'manual' | 'device' | 'participant' | 'place' | 'map';

/** One hit from the place search. */
export interface PlaceResult {
  /** Short name for the primary line, e.g. "Vettuvankeni". */
  readonly label: string;
  /** Full comma-separated address, shown underneath to disambiguate. */
  readonly displayName: string;
  /** Nominatim's category, e.g. "suburb" / "city" — shown as a small chip. */
  readonly kind: string;
  readonly coords: Coordinates;
}

/**
 * The point every distance on the dashboard is measured *from*.
 *
 * Deliberately explicit rather than "wherever this browser happens to be": an
 * admin reviewing participants is often nowhere near the place that matters
 * (reviewing from home, from a different city, on a VPN), so a device fix is
 * one option among several rather than the automatic default.
 */
export interface ReferencePoint {
  readonly coords: Coordinates;
  readonly source: ReferenceSource;
  /** Human label for the source, e.g. a participant's name. */
  readonly label: string;
}

/** Transient state while asking the browser for a device fix. */
export interface DeviceLocationState {
  readonly error: string | null;
  readonly loading: boolean;
}

/** Neutral starting point for the filter bar. */
export const DEFAULT_FILTERS: LocationFilters = {
  search: '',
  freshness: 'all',
  timeWindow: 'all',
  distance: 'all',
  customDistance: { value: null, unit: 'km', direction: 'within' },
};
