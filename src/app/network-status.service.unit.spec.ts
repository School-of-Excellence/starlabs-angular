// network-status.service.unit.spec.ts — unit tests for the online/offline status stream.
//
// WHY UNIT: the service is an rxjs pipeline over browser events plus a periodic reachability probe. The
// HttpClient is a hand-rolled double, so no TestBed and no network — what is under test is the DECISION
// logic: what the service concludes from a probe that succeeds, one that fails, and the browser's own
// online/offline events.
//
// NOTE FOR REVIEWERS: the probe URL is a THIRD-PARTY endpoint baked into the source
// (jsonplaceholder.typicode.com — network-status.service.ts:13). These tests never let a real request
// out; every construction here passes a double. Flagged because a production connectivity check that
// depends on someone else's demo API is worth a look on its own.
import { of, throwError } from 'rxjs';
import { NetworkStatusService } from './network-status.service';

/**
 * Let the rxjs timer(0, …) emission and its awaited probe settle.
 *
 * A microtask flush is NOT enough: timer() schedules on rxjs's async scheduler, i.e. a real macrotask, so
 * the probe does not run until the event loop turns. Hence a genuine setTimeout rather than
 * `await Promise.resolve()` — the mistake this helper originally made.
 */
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const httpOk = () => ({ get: () => of({ status: 200 }) }) as any;
const httpFail = () => ({ get: () => throwError(() => new Error('offline')) }) as any;

describe('NetworkStatusService', () => {
  // =============================================================================================
  // SHU-60 — the probe decides the status
  // =============================================================================================
  describe('SHU-60 reachability probe', () => {
    it('reports online when the probe succeeds', async () => {
      const svc = new NetworkStatusService(httpOk());
      await settle();
      expect(svc.isOnline).toBeTrue();
    });

    it('reports offline when the probe fails, even though navigator.onLine is true', async () => {
      // The whole point of the probe: a captive portal or a dead uplink still reports navigator.onLine
      // true, so the browser flag alone is not trustworthy.
      const svc = new NetworkStatusService(httpFail());
      await settle();
      expect(svc.isOnline).toBeFalse();
    });

    it('requests the configured probe endpoint, observing the full response', async () => {
      const calls: any[] = [];
      const http: any = { get: (url: string, opts: any) => { calls.push({ url, opts }); return of({}); } };
      new NetworkStatusService(http);
      await settle();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0].url).toMatch(/^https?:\/\//);
      expect(calls[0].opts).toEqual({ observe: 'response' });
    });

    it('starts from navigator.onLine before any probe resolves', () => {
      // The BehaviorSubject seeds from the browser flag so the first render is not falsely offline.
      const svc = new NetworkStatusService({ get: () => of({}) } as any);
      expect(svc.isOnline).toBe(navigator.onLine);
    });
  });

  // =============================================================================================
  // SHU-61 — the observable stream
  // =============================================================================================
  describe('SHU-61 onlineStatus$', () => {
    it('emits the current value to a late subscriber', async () => {
      const svc = new NetworkStatusService(httpOk());
      await settle();
      let seen: boolean | null = null;
      svc.onlineStatus$.subscribe((v) => (seen = v));
      expect(seen).toBe(svc.isOnline);
    });

    it('keeps isOnline and the stream in agreement', async () => {
      const svc = new NetworkStatusService(httpFail());
      await settle();
      let seen: boolean | null = null;
      svc.onlineStatus$.subscribe((v) => (seen = v));
      expect(seen).toBe(false);
      expect(svc.isOnline).toBeFalse();
    });
  });

  // =============================================================================================
  // SHU-62 — browser offline event
  // =============================================================================================
  describe('SHU-62 browser events', () => {
    it('goes offline immediately on the window offline event, without waiting for a probe', async () => {
      // An offline event is authoritative and cheap — the pipeline short-circuits to false rather than
      // spending a request to confirm what the browser already knows.
      const svc = new NetworkStatusService(httpOk());
      await settle();
      window.dispatchEvent(new Event('offline'));
      await settle();
      expect(svc.isOnline).toBeFalse();
    });

    it('re-probes on the window online event and can recover', async () => {
      const svc = new NetworkStatusService(httpOk());
      await settle();
      window.dispatchEvent(new Event('offline'));
      await settle();
      expect(svc.isOnline).toBeFalse();

      window.dispatchEvent(new Event('online'));
      await settle();
      expect(svc.isOnline).toBeTrue();
    });

    it('stays offline after an online event when the probe still fails', async () => {
      // The browser says the interface is back; the probe says the internet is not. The probe wins.
      const svc = new NetworkStatusService(httpFail());
      await settle();
      window.dispatchEvent(new Event('online'));
      await settle();
      expect(svc.isOnline).toBeFalse();
    });
  });
});
