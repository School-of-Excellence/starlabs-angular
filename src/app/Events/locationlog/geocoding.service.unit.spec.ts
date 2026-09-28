// geocoding.service.unit.spec.ts — unit tests for the Nominatim place search / reverse lookup.
//
// WHY THIS ONE USES TestBed, unlike the rest of the unit suite: the service takes its HttpClient via a
// FIELD-LEVEL `inject(HttpClient)` (geocoding.service.ts:47), which throws outside an injection context —
// `new GeocodingService()` is not an option. TestBed with provideHttpClientTesting is the standard way in,
// and it also gives the HttpTestingController needed to assert the OUTGOING requests, which is half of
// what matters here.
//
// NO NETWORK: every request is intercepted. The real Nominatim endpoint is never called.
//
// WHAT IT PROTECTS: this picker sits beside a manual coordinate entry, so the design decision throughout is
// "degrade, never throw" — a search that errors is worse than one that finds nothing. These tests pin that.
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  let svc: GeocodingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(GeocodingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // =============================================================================================
  // EVTU-15 — search: request shape
  // =============================================================================================
  describe('EVTU-15 search request', () => {
    it('queries Nominatim with the trimmed term and a small result limit', () => {
      svc.search('  chennai  ').subscribe();
      const req = http.expectOne((r) => r.url.includes('/search'));
      expect(req.request.params.get('q')).toBe('chennai');
      expect(req.request.params.get('format')).toBe('jsonv2');
      expect(req.request.params.get('limit')).toBe('6');   // a picker, not a directory
      req.flush([]);
    });

    it('makes NO request for an empty or whitespace-only query', () => {
      // Guards against a request per keystroke while the box is being cleared.
      svc.search('').subscribe();
      svc.search('   ').subscribe();
      http.expectNone(() => true);
    });

    it('returns an empty list for an empty query', (done) => {
      svc.search('').subscribe((rows) => {
        expect(rows).toEqual([]);
        done();
      });
    });
  });

  // =============================================================================================
  // EVTU-16 — search: caching
  // =============================================================================================
  describe('EVTU-16 search caching', () => {
    it('does not re-hit the API for a repeated query', () => {
      svc.search('chennai').subscribe();
      http.expectOne((r) => r.url.includes('/search')).flush([]);
      svc.search('chennai').subscribe();
      http.expectNone((r) => r.url.includes('/search'));   // served from cache
    });

    it('treats case and surrounding whitespace as the same query', () => {
      // The cache key is trimmed + lowercased, so re-typing with different casing must not re-fetch.
      svc.search('Chennai').subscribe();
      http.expectOne((r) => r.url.includes('/search')).flush([]);
      svc.search('  CHENNAI ').subscribe();
      http.expectNone((r) => r.url.includes('/search'));
    });

    it('fetches separately for a different query', () => {
      svc.search('chennai').subscribe();
      http.expectOne((r) => r.params.get('q') === 'chennai').flush([]);
      svc.search('mumbai').subscribe();
      http.expectOne((r) => r.params.get('q') === 'mumbai').flush([]);
    });

    it('replays the cached result to a later subscriber', (done) => {
      svc.search('chennai').subscribe();
      http.expectOne((r) => r.url.includes('/search'))
        .flush([{ lat: '13.08', lon: '80.27', name: 'Chennai', display_name: 'Chennai, India' }]);

      svc.search('chennai').subscribe((rows) => {
        expect(rows.length).toBe(1);
        done();
      });
    });
  });

  // =============================================================================================
  // EVTU-17 — search: response handling degrades rather than throwing
  // =============================================================================================
  describe('EVTU-17 search results', () => {
    it('maps rows into place results', (done) => {
      svc.search('chennai').subscribe((rows) => {
        expect(rows.length).toBe(1);
        expect(rows[0].coords.latitude).toBeCloseTo(13.08, 2);
        expect(rows[0].coords.longitude).toBeCloseTo(80.27, 2);
        done();
      });
      http.expectOne((r) => r.url.includes('/search'))
        .flush([{ lat: '13.08', lon: '80.27', name: 'Chennai', display_name: 'Chennai, India' }]);
    });

    it('drops rows that carry no usable coordinates instead of emitting NaN', (done) => {
      svc.search('junk').subscribe((rows) => {
        expect(rows.length).toBe(1);
        done();
      });
      http.expectOne((r) => r.url.includes('/search')).flush([
        { name: 'No coords' },
        { lat: 'not-a-number', lon: '80.27', name: 'Bad lat' },
        { lat: '13.08', lon: '80.27', name: 'Good', display_name: 'Good, India' },
      ]);
    });

    it('returns an empty list on a network error rather than erroring the picker', (done) => {
      // The manual-coordinate fallback sits right beside this box; a throw would take the whole panel down.
      svc.search('chennai').subscribe({
        next: (rows) => { expect(rows).toEqual([]); done(); },
        error: () => fail('search must not error'),
      });
      http.expectOne((r) => r.url.includes('/search'))
        .flush('boom', { status: 500, statusText: 'Server Error' });
    });

    it('returns an empty list when the API responds with no rows', (done) => {
      svc.search('nowhere').subscribe((rows) => { expect(rows).toEqual([]); done(); });
      http.expectOne((r) => r.url.includes('/search')).flush([]);
    });
  });

  // =============================================================================================
  // EVTU-18 — reverse lookup
  // =============================================================================================
  describe('EVTU-18 reverse', () => {
    it('queries the reverse endpoint with the coordinates', () => {
      svc.reverse({ latitude: 13.08, longitude: 80.27 }).subscribe();
      const req = http.expectOne((r) => r.url.includes('/reverse'));
      expect(req.request.params.get('lat')).toBe('13.08');
      expect(req.request.params.get('lon')).toBe('80.27');
      expect(req.request.params.get('zoom')).toBe('14');
      req.flush({});
    });

    it('resolves a short label for the place', (done) => {
      svc.reverse({ latitude: 13.08, longitude: 80.27 }).subscribe((label) => {
        expect(label).toBeTruthy();
        done();
      });
      http.expectOne((r) => r.url.includes('/reverse'))
        .flush({ name: 'Vettuvankeni', display_name: 'Vettuvankeni, Chennai, India' });
    });

    it('resolves null on an HTTP error, because the caller always has coordinates anyway', (done) => {
      svc.reverse({ latitude: 13.08, longitude: 80.27 }).subscribe({
        next: (label) => { expect(label).toBeNull(); done(); },
        error: () => fail('reverse must not error'),
      });
      http.expectOne((r) => r.url.includes('/reverse'))
        .flush('nope', { status: 404, statusText: 'Not Found' });
    });

    it('resolves null when the response carries no usable name', (done) => {
      svc.reverse({ latitude: 0, longitude: 0 }).subscribe((label) => {
        expect(label).toBeNull();
        done();
      });
      http.expectOne((r) => r.url.includes('/reverse')).flush({});
    });

    it('does NOT cache reverse lookups — each call hits the API', () => {
      // Only `search` is cached; a coordinate label is requested per pick.
      svc.reverse({ latitude: 1, longitude: 2 }).subscribe();
      http.expectOne((r) => r.url.includes('/reverse')).flush({});
      svc.reverse({ latitude: 1, longitude: 2 }).subscribe();
      http.expectOne((r) => r.url.includes('/reverse')).flush({});
    });
  });
});
