/**
 * Place search for the Live Location Tracking dashboard.
 *
 * Nominatim (OpenStreetMap's own geocoder): free, no API key, no billing.
 *
 * Why a `fetch`/XHR rather than an embedded map picker — the obvious way to
 * "pick a location" would be clicking a pin on a map, but this app is served
 * cross-origin isolated (COEP) for the Zoom SDK, and under COEP every
 * third-party iframe is blocked *silently*. A CORS request is not: verified
 * against a local server sending `COEP: credentialless`, where
 * `crossOriginIsolated === true` and this exact query still returned results.
 * So searching by name works in production; a map picker would not.
 *
 * Nominatim's usage policy caps automated use at roughly one request per
 * second and asks that clients not hammer it for autocomplete. The component
 * debounces and requires a minimum query length, `switchMap` cancels superseded
 * requests, and identical queries are served from an in-memory cache.
 */

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, throwError, timeout } from 'rxjs';

import { Coordinates, PlaceResult } from './location.model';

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

/** Results per query. Small on purpose — this is a picker, not a directory. */
const RESULT_LIMIT = 6;

/** Give up rather than leave the picker spinning on a slow network. */
const REQUEST_TIMEOUT_MS = 8_000;

/** Raw Nominatim row. Only the fields actually used are modelled. */
interface NominatimPlace {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  addresstype?: string;
  type?: string;
}

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);

  /** Query -> results. Re-typing a search must not re-hit the API. */
  private readonly cache = new Map<string, Observable<readonly PlaceResult[]>>();

  /**
   * Search for places by name. Returns an empty list rather than erroring on a
   * network failure — a picker that throws is worse than one that finds
   * nothing, because the manual-coordinate fallback is right beside it.
   */
  search(query: string): Observable<readonly PlaceResult[]> {
    const normalised = query.trim().toLowerCase();
    if (!normalised) return of([]);

    const cached = this.cache.get(normalised);
    if (cached) return cached;

    const request = this.http
      .get<NominatimPlace[]>(NOMINATIM_SEARCH, {
        params: {
          q: query.trim(),
          format: 'jsonv2',
          limit: RESULT_LIMIT,
          addressdetails: 0,
        },
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((rows) => rows.map(toPlaceResult).filter((row): row is PlaceResult => row !== null)),
        catchError(() => of([] as readonly PlaceResult[])),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    this.cache.set(normalised, request);
    return request;
  }

  /**
   * Name a coordinate pair, so a location picked from a participant row or a
   * device fix can be labelled "Vettuvankeni" instead of a bare number pair.
   * Falls back to null; the caller always has coordinates to show regardless.
   */
  reverse(coords: Coordinates): Observable<string | null> {
    return this.http
      .get<NominatimPlace>(NOMINATIM_REVERSE, {
        params: {
          lat: coords.latitude,
          lon: coords.longitude,
          format: 'jsonv2',
          zoom: 14,
          addressdetails: 0,
        },
      })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        map((row) => shortLabel(row) ?? null),
        catchError((error: unknown) =>
          error instanceof HttpErrorResponse ? of(null) : throwError(() => error),
        ),
        catchError(() => of(null)),
      );
  }
}

function toPlaceResult(row: NominatimPlace): PlaceResult | null {
  const latitude = Number(row.lat);
  const longitude = Number(row.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!row.display_name) return null;

  return {
    label: shortLabel(row) ?? row.display_name,
    displayName: row.display_name,
    kind: row.addresstype ?? row.type ?? '',
    coords: { latitude, longitude },
  };
}

/**
 * "Vettuvankeni" out of "Vettuvankeni, East Coast Road, CMWSSB Division 192,
 * Chennai, Tamil Nadu, India" — the full string is kept for the second line.
 */
function shortLabel(row: NominatimPlace): string | null {
  if (row.name?.trim()) return row.name.trim();
  const first = row.display_name?.split(',')[0]?.trim();
  return first || null;
}
