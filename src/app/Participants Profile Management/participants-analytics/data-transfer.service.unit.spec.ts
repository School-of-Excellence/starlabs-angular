// data-transfer.service.unit.spec.ts — unit tests for the cross-tab data handoff.
//
// WHY UNIT: the service parks a payload in localStorage, builds a URL carrying the key, and opens a new
// tab. Router is a hand-rolled double and window.open is stubbed, so no TestBed and no real navigation.
// Karma runs a real Chrome, so localStorage here is the real thing rather than a fake that agrees with
// itself.
//
// WHAT IT PROTECTS: this is how analytics screens hand a selection to a second tab. If the key and the
// query parameter ever disagree, the new tab opens to an empty screen — a failure that looks like a data
// problem rather than a wiring one.
import { DataTransferService } from './data-transfer.service';

/** Records what was asked for, and returns a URL tree whose toString() is inspectable. */
const makeRouterDouble = () => {
  const calls: { commands: any[]; extras: any }[] = [];
  const router: any = {
    createUrlTree: (commands: any[], extras: any) => {
      calls.push({ commands, extras });
      const qp = extras?.queryParams ?? {};
      const query = Object.keys(qp).map((k) => `${k}=${encodeURIComponent(qp[k])}`).join('&');
      return { toString: () => `${commands.join('/')}${query ? '?' + query : ''}` };
    },
  };
  return { router, calls };
};

describe('DataTransferService', () => {
  let opened: { url: string; target: string }[];
  let originalOpen: typeof window.open;

  beforeEach(() => {
    opened = [];
    originalOpen = window.open;
    (window as any).open = (url: string, target: string) => { opened.push({ url, target }); return null; };
  });

  afterEach(() => {
    (window as any).open = originalOpen;
    Object.keys(localStorage)
      .filter((k) => k.startsWith('dt_test_'))
      .forEach((k) => localStorage.removeItem(k));
  });

  // =============================================================================================
  // SHU-23 — setData parks the payload and opens the target tab
  // =============================================================================================
  describe('SHU-23 setData', () => {
    it('stores the payload under the given key, JSON-encoded', () => {
      const { router } = makeRouterDouble();
      const svc = new DataTransferService(router);
      svc.setData({ ids: [1, 2, 3] }, 'userprofile', 'dt_test_a');
      expect(JSON.parse(localStorage.getItem('dt_test_a')!)).toEqual({ ids: [1, 2, 3] });
    });

    it('builds the route from the navigation url with a leading slash', () => {
      const { router, calls } = makeRouterDouble();
      new DataTransferService(router).setData({}, 'userprofile', 'dt_test_b');
      expect(calls[0].commands).toEqual(['/userprofile']);
    });

    it('passes the SAME key as the localStorageItemName query parameter', () => {
      // The one invariant that matters: the receiving tab reads this parameter to find the payload. If the
      // key and the parameter ever diverge, the new tab opens to nothing.
      const { router, calls } = makeRouterDouble();
      new DataTransferService(router).setData({ a: 1 }, 'userprofile', 'dt_test_c');
      expect(calls[0].extras.queryParams.localStorageItemName).toBe('dt_test_c');
      expect(localStorage.getItem('dt_test_c')).not.toBeNull();
    });

    it('opens the built url in a new tab', () => {
      const { router } = makeRouterDouble();
      new DataTransferService(router).setData({ a: 1 }, 'userprofile', 'dt_test_d');
      expect(opened.length).toBe(1);
      expect(opened[0].target).toBe('_blank');
      expect(opened[0].url).toContain('localStorageItemName=dt_test_d');
    });

    it('round-trips nested payloads', () => {
      const { router } = makeRouterDouble();
      const payload = { rows: [{ id: 'a', tags: ['x'] }], meta: { n: null } };
      new DataTransferService(router).setData(payload, 'userprofile', 'dt_test_e');
      expect(JSON.parse(localStorage.getItem('dt_test_e')!)).toEqual(payload);
    });

    it('overwrites a payload stored under a reused key', () => {
      const { router } = makeRouterDouble();
      const svc = new DataTransferService(router);
      svc.setData({ v: 1 }, 'userprofile', 'dt_test_f');
      svc.setData({ v: 2 }, 'userprofile', 'dt_test_f');
      expect(JSON.parse(localStorage.getItem('dt_test_f')!)).toEqual({ v: 2 });
    });
  });

  // =============================================================================================
  // SHU-24 — clearData removes what this instance handed over
  // =============================================================================================
  describe('SHU-24 clearData', () => {
    it('removes every key this instance stored', () => {
      const { router } = makeRouterDouble();
      const svc = new DataTransferService(router);
      svc.setData({ v: 1 }, 'u', 'dt_test_g');
      svc.setData({ v: 2 }, 'u', 'dt_test_h');
      svc.clearData();
      expect(localStorage.getItem('dt_test_g')).toBeNull();
      expect(localStorage.getItem('dt_test_h')).toBeNull();
    });

    it('leaves keys stored by anything else alone', () => {
      const { router } = makeRouterDouble();
      const svc = new DataTransferService(router);
      localStorage.setItem('dt_test_other', 'keep me');
      svc.setData({ v: 1 }, 'u', 'dt_test_i');
      svc.clearData();
      expect(localStorage.getItem('dt_test_other')).toBe('keep me');
      localStorage.removeItem('dt_test_other');
    });

    it('is safe to call when nothing was stored', () => {
      const { router } = makeRouterDouble();
      expect(() => new DataTransferService(router).clearData()).not.toThrow();
    });

    it('KEEPS the key list after clearing, so the tracked list only ever grows', () => {
      // Pinned as current behaviour: clearData() removes the localStorage entries but never empties
      // `localStorageName`. Harmless for a short-lived instance, but a long-lived root service accumulates
      // the list, and a later clearData() re-removes keys that a subsequent setData may have re-created.
      const { router } = makeRouterDouble();
      const svc = new DataTransferService(router);
      svc.setData({ v: 1 }, 'u', 'dt_test_j');
      svc.clearData();
      expect(svc.localStorageName.length).toBe(1);

      svc.setData({ v: 2 }, 'u', 'dt_test_j');
      expect(svc.localStorageName.length).toBe(2);   // the same key is tracked twice
      svc.clearData();
      expect(localStorage.getItem('dt_test_j')).toBeNull();
    });
  });
});
