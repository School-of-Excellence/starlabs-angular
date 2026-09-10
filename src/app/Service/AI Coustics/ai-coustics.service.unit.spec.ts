// ai-coustics.service.unit.spec.ts — unit tests for the AI Coustics WebSocket audio filter.
//
// WHY UNIT: init() is a connection state machine — connect, resolve on open, reject on error, reject on a
// 10s timeout, and short-circuit when already initialised. That is decision logic, and it is exactly what
// is impractical to exercise in e2e: you cannot make a real backend fail to open a socket on demand.
//
// SCOPE, stated plainly: only init() is covered. processStream() constructs a real AudioContext, registers
// two AudioWorklet modules from inline source, and wires MediaStream nodes — none of which can be
// meaningfully faked without reimplementing Web Audio, and a test that did so would assert the fake. That
// belongs to a live-call e2e case, not here.
//
// NO NETWORK: WebSocket is replaced with a double for the duration of each test and restored afterwards.
import { AiCousticsService } from './ai-coustics.service';

/** Records constructed sockets and lets a test fire open/error at will. */
class FakeSocket {
  static made: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  binaryType = '';
  constructor(public url: string) { FakeSocket.made.push(this); }
  open() { this.onopen?.(); }
  fail() { this.onerror?.(new Event('error')); }
}

describe('AiCousticsService', () => {
  let originalWebSocket: any;

  beforeEach(() => {
    FakeSocket.made = [];
    originalWebSocket = (window as any).WebSocket;
    (window as any).WebSocket = FakeSocket as any;
  });

  afterEach(() => { (window as any).WebSocket = originalWebSocket; });

  // =============================================================================================
  // SHU-70 — connecting
  // =============================================================================================
  describe('SHU-70 init connects', () => {
    it('opens a socket and resolves once it is open', async () => {
      const svc = new AiCousticsService();
      const p = svc.init();
      expect(FakeSocket.made.length).toBe(1);
      FakeSocket.made[0].open();
      await expectAsync(p).toBeResolved();
    });

    it('asks for binary frames, because the protocol sends raw PCM', () => {
      const svc = new AiCousticsService();
      svc.init().catch(() => {});
      expect(FakeSocket.made[0].binaryType).toBe('arraybuffer');
      FakeSocket.made[0].open();
    });

    it('connects to the configured backend url, defaulting to empty when unset', () => {
      // environment.aicWebSocketUrl ?? '' — an unset config yields '' rather than 'undefined', so the
      // failure is a clean connection error instead of a request to a literal undefined host.
      const svc = new AiCousticsService();
      svc.init().catch(() => {});
      expect(typeof FakeSocket.made[0].url).toBe('string');
      expect(FakeSocket.made[0].url).not.toContain('undefined');
      FakeSocket.made[0].open();
    });
  });

  // =============================================================================================
  // SHU-71 — failure paths
  // =============================================================================================
  describe('SHU-71 init failures', () => {
    it('rejects with an actionable message when the socket errors', async () => {
      const svc = new AiCousticsService();
      const p = svc.init();
      FakeSocket.made[0].fail();
      await expectAsync(p).toBeRejectedWithError(/backend running/i);
    });

    it('rejects after the 10 second timeout when the socket never opens', async () => {
      jasmine.clock().install();
      try {
        const svc = new AiCousticsService();
        const p = svc.init();
        p.catch(() => {});           // attach early so the rejection is never unhandled
        jasmine.clock().tick(10_000);
        await expectAsync(p).toBeRejectedWithError(/timed out after 10s/i);
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('does NOT time out once the socket has opened', async () => {
      jasmine.clock().install();
      try {
        const svc = new AiCousticsService();
        const p = svc.init();
        FakeSocket.made[0].open();
        jasmine.clock().tick(60_000);   // well past the timeout — it must have been cleared
        await expectAsync(p).toBeResolved();
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('leaves the service uninitialised after a failure, so a retry reconnects', async () => {
      const svc = new AiCousticsService();
      const p = svc.init();
      FakeSocket.made[0].fail();
      await expectAsync(p).toBeRejected();

      const retry = svc.init();
      expect(FakeSocket.made.length).toBe(2);   // a second socket, not a silent no-op
      FakeSocket.made[1].open();
      await expectAsync(retry).toBeResolved();
    });
  });

  // =============================================================================================
  // SHU-72 — the already-initialised short circuit
  // =============================================================================================
  describe('SHU-72 idempotent init', () => {
    it('opens no second socket once initialised', async () => {
      const svc = new AiCousticsService();
      const first = svc.init();
      FakeSocket.made[0].open();
      await first;

      await svc.init();
      expect(FakeSocket.made.length).toBe(1);
    });

    it('resolves immediately on a repeat call', async () => {
      const svc = new AiCousticsService();
      const first = svc.init();
      FakeSocket.made[0].open();
      await first;
      await expectAsync(svc.init()).toBeResolved();
    });
  });
});
