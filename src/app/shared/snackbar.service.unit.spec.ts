// snackbar.service.unit.spec.ts — unit tests for the shared snackbar wrapper.
//
// WHY UNIT: the service is a thin facade over MatSnackBar, so what is worth pinning is not "does Material
// work" — it does — but the DEFAULTS this app standardises on: the 'Close' action, 2s duration, and the
// centre/top placement. Those are the things a passing edit can change silently, and they are the reason
// this wrapper exists instead of injecting MatSnackBar everywhere.
//
// No TestBed: MatSnackBar is passed as a hand-rolled double that records its arguments.
import { SnackbarService } from './snackbar.service';

interface OpenCall { message: string; action: string; config: any; }

const makeService = () => {
  const calls: OpenCall[] = [];
  const snackBarDouble: any = {
    open: (message: string, action: string, config: any) => { calls.push({ message, action, config }); },
  };
  return { svc: new SnackbarService(snackBarDouble), calls };
};

describe('SnackbarService', () => {
  // =============================================================================================
  // SHU-21 — the house defaults
  // =============================================================================================
  describe('SHU-21 defaults', () => {
    it('defaults the action to Close and the duration to 2000ms', () => {
      const { svc, calls } = makeService();
      svc.show('Saved');
      expect(calls[0].message).toBe('Saved');
      expect(calls[0].action).toBe('Close');
      expect(calls[0].config.duration).toBe(2000);
    });

    it('always places the snackbar centre-top', () => {
      // The placement is deliberate and not overridable through this API — pinned so it stays consistent
      // across every screen that uses the wrapper.
      const { svc, calls } = makeService();
      svc.show('Saved');
      expect(calls[0].config.horizontalPosition).toBe('center');
      expect(calls[0].config.verticalPosition).toBe('top');
    });
  });

  // =============================================================================================
  // SHU-22 — overrides
  // =============================================================================================
  describe('SHU-22 overrides', () => {
    it('accepts a custom action label', () => {
      const { svc, calls } = makeService();
      svc.show('Deleted', 'Undo');
      expect(calls[0].action).toBe('Undo');
    });

    it('accepts a custom duration', () => {
      const { svc, calls } = makeService();
      svc.show('Working', 'Close', 9000);
      expect(calls[0].config.duration).toBe(9000);
    });

    it('keeps the placement even when action and duration are overridden', () => {
      const { svc, calls } = makeService();
      svc.show('Working', 'Undo', 500);
      expect(calls[0].config.horizontalPosition).toBe('center');
      expect(calls[0].config.verticalPosition).toBe('top');
    });

    it('passes an empty message straight through rather than substituting one', () => {
      const { svc, calls } = makeService();
      svc.show('');
      expect(calls[0].message).toBe('');
    });

    it('opens once per call', () => {
      const { svc, calls } = makeService();
      svc.show('a');
      svc.show('b');
      expect(calls.map((c) => c.message)).toEqual(['a', 'b']);
    });
  });
});
