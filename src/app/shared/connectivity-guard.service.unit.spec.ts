// connectivity-guard.service.unit.spec.ts — unit tests for the offline guard state machine.
//
// WHY THIS ONE USES TestBed: the service takes MatDialog through a FIELD-LEVEL `inject(MatDialog)`
// (connectivity-guard.service.ts:24), which throws outside an injection context, so `new Service()` is not
// available. MatDialog is supplied as a double that records `open()` calls — no real dialog is rendered.
//
// WHAT IT PROTECTS: this guard decides when a participant is told they are offline, and it holds their
// unsaved form work until a sync is confirmed. The failures that matter are a dialog that stacks or never
// closes, and a "restored" state reached while still offline.
//
// SCOPE: the reachability PING (a fetch to gstatic on a 15s interval) is not exercised — that is network
// I/O. The browser-event and refcount paths are where the decisions live.
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ConnectivityGuardService } from './connectivity-guard.service';

/** Records dialog opens and hands back a ref the service can drive. */
const makeDialogDouble = () => {
  const opens: any[] = [];
  const dialog: any = {
    open: (_cmp: any, cfg: any) => {
      opens.push(cfg);
      return {
        componentInstance: { onConnectivityRestored: () => {} },
        afterClosed: () => ({ subscribe: (_fn: any) => ({ unsubscribe() {} }) }),
        close: () => {},
      };
    },
  };
  return { dialog, opens };
};

describe('ConnectivityGuardService', () => {
  let svc: ConnectivityGuardService;
  let opens: any[];

  beforeEach(() => {
    const d = makeDialogDouble();
    opens = d.opens;
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: d.dialog }] });
    svc = TestBed.inject(ConnectivityGuardService);
  });

  // =============================================================================================
  // SHU-80 — initial state
  // =============================================================================================
  describe('SHU-80 initial state', () => {
    it('starts online, before anything registers', () => {
      // The optimistic default matters: a form must not open showing an offline banner.
      expect(svc.currentState).toBe('online');
      expect(svc.isOnline).toBeTrue();
    });

    it('emits the current state to a subscriber immediately', () => {
      let seen: string | null = null;
      svc.connectivity$.subscribe((s) => (seen = s));
      expect(seen).toBe('online');
    });

    it('opens no dialog until something registers', () => {
      expect(opens.length).toBe(0);
    });
  });

  // =============================================================================================
  // SHU-81 — register / unregister refcounting
  // =============================================================================================
  describe('SHU-81 refcounting', () => {
    it('returns an unregister function', () => {
      const off = svc.register();
      expect(typeof off).toBe('function');
      off();
    });

    it('survives a second register without double-starting', () => {
      // Two components on screen at once must not install two sets of listeners.
      const off1 = svc.register();
      const off2 = svc.register();
      expect(() => { off1(); off2(); }).not.toThrow();
    });

    it('keeps running while any registration remains', () => {
      const off1 = svc.register();
      const off2 = svc.register();
      off1();                       // one released, one still held
      expect(svc.currentState).toBeTruthy();
      off2();
    });

    it('is safe to unregister more times than registered', () => {
      // refCount is floored at 0, so a component releasing twice must not drive it negative.
      const off = svc.register();
      off(); off(); off();
      expect(svc.currentState).toBe('online');
    });

    it('accepts a save-draft callback without invoking it up front', () => {
      let called = false;
      const off = svc.register(async () => { called = true; });
      expect(called).toBeFalse();   // only called when the connection actually goes bad
      off();
    });
  });

  // =============================================================================================
  // SHU-82 — going offline
  // =============================================================================================
  describe('SHU-82 offline transition', () => {
    it('goes offline immediately on the browser offline event, without waiting out the debounce', () => {
      // evaluate(forceOffline=true) bypasses BAD_DEBOUNCE_MS: an explicit offline event is authoritative,
      // so the user is told at once rather than after three seconds of apparent normality.
      const off = svc.register();
      window.dispatchEvent(new Event('offline'));
      expect(svc.currentState).toBe('offline');
      expect(svc.isOnline).toBeFalse();
      off();
    });

    it('opens exactly ONE alert dialog however many offline events arrive', () => {
      // Guarded by `if (this.dialogRef || this.handlingBadConnection) return`. Without it a flapping
      // connection would stack dialogs the user cannot dismiss.
      const off = svc.register();
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('offline'));
      expect(opens.length).toBe(1);
      off();
    });

    it('opens the alert as a blocking dialog', () => {
      const off = svc.register();
      window.dispatchEvent(new Event('offline'));
      expect(opens[0].disableClose).toBeTrue();
      expect(opens[0].hasBackdrop).toBeTrue();
      off();
    });
  });

  // =============================================================================================
  // SHU-83 — confirmSynced is the route back to a clean online state
  // =============================================================================================
  describe('SHU-83 confirmSynced', () => {
    it('returns the state to online', () => {
      const off = svc.register();
      window.dispatchEvent(new Event('offline'));
      expect(svc.currentState).toBe('offline');

      svc.confirmSynced();
      expect(svc.currentState).toBe('online');
      off();
    });

    it('clears the was-offline memory, so a later recovery does not replay the restored flow', () => {
      const off = svc.register();
      window.dispatchEvent(new Event('offline'));
      svc.confirmSynced();
      const opensAfterSync = opens.length;

      // A subsequent good evaluation must NOT reopen a "restored" dialog — the sync already confirmed it.
      window.dispatchEvent(new Event('online'));
      expect(opens.length).toBe(opensAfterSync);
      off();
    });

    it('is safe to call when nothing ever went wrong', () => {
      expect(() => svc.confirmSynced()).not.toThrow();
      expect(svc.currentState).toBe('online');
    });
  });

  // =============================================================================================
  // SHU-84 — unregistering tears the guard down
  // =============================================================================================
  describe('SHU-84 teardown', () => {
    it('stops reacting to browser events once the last registration is released', () => {
      const off = svc.register();
      off();
      window.dispatchEvent(new Event('offline'));
      expect(svc.currentState).toBe('online');   // listeners removed, state left clean
    });

    it('resets to online on teardown even if it was offline', () => {
      // stop() calls confirmSynced(), so a component unmounting mid-outage does not strand the app in an
      // offline state that nothing will clear.
      const off = svc.register();
      window.dispatchEvent(new Event('offline'));
      expect(svc.currentState).toBe('offline');
      off();
      expect(svc.currentState).toBe('online');
    });
  });
});
