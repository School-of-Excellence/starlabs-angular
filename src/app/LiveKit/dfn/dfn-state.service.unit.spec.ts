// dfn-state.service.unit.spec.ts — unit tests for the shared DeepFilterNet settings state.
//
// WHY UNIT: signals plus a message handler. `new DfnStateService()` works standalone (signals need no
// injection context), and the LiveKit Room is a hand-rolled double that records its listeners, so the
// data-message path can be driven directly. No TestBed, no LiveKit connection.
//
// WHAT IT PROTECTS: every participant's tile badge shows the levels that person is sending at. The failure
// that matters is a malformed message from one participant breaking the badges for everyone.
import { DfnStateService } from './dfn-state.service';

/** Minimal Room stand-in: records on/off and lets a test fire DataReceived. */
const makeRoom = () => {
  const listeners = new Map<any, Function[]>();
  const room: any = {
    on: (evt: any, fn: Function) => { listeners.set(evt, [...(listeners.get(evt) ?? []), fn]); return room; },
    off: (evt: any, fn: Function) => {
      listeners.set(evt, (listeners.get(evt) ?? []).filter((f) => f !== fn));
      return room;
    },
    emit: (evt: any, ...args: any[]) => (listeners.get(evt) ?? []).forEach((f) => f(...args)),
    listenerCount: (evt: any) => (listeners.get(evt) ?? []).length,
    listeners,
  };
  return room;
};

const encode = (obj: any) => new TextEncoder().encode(JSON.stringify(obj));
const participant = (identity: string) => ({ identity }) as any;

/** The event key the service subscribes with — read back from the double so the test does not guess it. */
const dataEvent = (room: any) => [...room.listeners.keys()][0];

describe('DfnStateService', () => {
  let svc: DfnStateService;
  beforeEach(() => { svc = new DfnStateService(); });

  // =============================================================================================
  // OPU-15 — update / infoFor
  // =============================================================================================
  describe('OPU-15 state', () => {
    it('starts empty', () => {
      expect(svc.map()).toEqual({});
      expect(svc.infoFor('anyone')).toBeUndefined();
    });

    it('stores settings per identity', () => {
      svc.update('alice', { dfn: true, atten: 60, norm: 1 });
      expect(svc.infoFor('alice')).toEqual({ dfn: true, atten: 60, norm: 1 });
    });

    it('keeps participants independent', () => {
      svc.update('alice', { dfn: true, atten: 60, norm: 1 });
      svc.update('bob', { dfn: false, atten: 0, norm: 0 });
      expect(svc.infoFor('alice')!.dfn).toBeTrue();
      expect(svc.infoFor('bob')!.dfn).toBeFalse();
    });

    it('replaces a participant entry on update', () => {
      svc.update('alice', { dfn: true, atten: 60, norm: 1 });
      svc.update('alice', { dfn: false, atten: 10, norm: 0 });
      expect(svc.infoFor('alice')).toEqual({ dfn: false, atten: 10, norm: 0 });
    });

    it('writes a NEW map object so the signal actually notifies', () => {
      // `map.update(m => ({...m, [id]: info}))` — mutating in place would leave tile badges stale.
      const before = svc.map();
      svc.update('alice', { dfn: true, atten: 60, norm: 1 });
      expect(svc.map()).not.toBe(before);
    });

    it('returns undefined for an unknown or missing identity', () => {
      expect(svc.infoFor('nobody')).toBeUndefined();
      expect(svc.infoFor(undefined)).toBeUndefined();
    });
  });

  // =============================================================================================
  // OPU-16 — start / stop lifecycle
  // =============================================================================================
  describe('OPU-16 lifecycle', () => {
    it('subscribes to the room on start', () => {
      const room = makeRoom();
      svc.start(room);
      expect(room.listenerCount(dataEvent(room))).toBe(1);
    });

    it('unsubscribes on stop and clears the map', () => {
      const room = makeRoom();
      svc.start(room);
      svc.update('alice', { dfn: true, atten: 1, norm: 1 });
      svc.stop();
      expect(room.listenerCount(dataEvent(room))).toBe(0);
      expect(svc.map()).toEqual({});
    });

    it('detaches from the previous room when started again', () => {
      // start() calls stop() first — without it, a reconnect would leave the old room subscribed and
      // stale identities would keep updating badges.
      const first = makeRoom();
      const second = makeRoom();
      svc.start(first);
      svc.start(second);
      expect(first.listenerCount(dataEvent(first))).toBe(0);
      expect(second.listenerCount(dataEvent(second))).toBe(1);
    });

    it('is safe to stop without ever starting', () => {
      expect(() => svc.stop()).not.toThrow();
    });

    it('ignores messages after stop', () => {
      const room = makeRoom();
      const evt = () => dataEvent(room);
      svc.start(room);
      const key = evt();
      svc.stop();
      room.emit(key, encode({ type: 'dfn', dfn: true, atten: 5, norm: 1 }), participant('alice'));
      expect(svc.infoFor('alice')).toBeUndefined();
    });
  });

  // =============================================================================================
  // OPU-17 — the data-message handler
  // =============================================================================================
  describe('OPU-17 DataReceived handling', () => {
    let room: any;
    let key: any;
    beforeEach(() => { room = makeRoom(); svc.start(room); key = dataEvent(room); });

    it('records settings from a well-formed dfn message', () => {
      room.emit(key, encode({ type: 'dfn', dfn: true, atten: 60, norm: 1 }), participant('alice'));
      expect(svc.infoFor('alice')).toEqual({ dfn: true, atten: 60, norm: 1 });
    });

    it('coerces the flag to a boolean and the levels to numbers', () => {
      room.emit(key, encode({ type: 'dfn', dfn: 1, atten: '60', norm: '0.5' }), participant('bob'));
      expect(svc.infoFor('bob')).toEqual({ dfn: true, atten: 60, norm: 0.5 });
    });

    it('ignores a message of another type', () => {
      room.emit(key, encode({ type: 'chat', text: 'hello' }), participant('alice'));
      expect(svc.infoFor('alice')).toBeUndefined();
    });

    it('ignores a message with no participant', () => {
      room.emit(key, encode({ type: 'dfn', dfn: true, atten: 1, norm: 1 }), undefined);
      expect(svc.map()).toEqual({});
    });

    it('swallows malformed JSON instead of breaking every other badge', () => {
      // One participant sending junk must not take the handler down for the room.
      expect(() => room.emit(key, new TextEncoder().encode('{not json'), participant('alice'))).not.toThrow();
      room.emit(key, encode({ type: 'dfn', dfn: true, atten: 2, norm: 1 }), participant('bob'));
      expect(svc.infoFor('bob')!.atten).toBe(2);
    });

    it('records NaN when a level is unparseable, rather than throwing', () => {
      // Number('loud') is NaN. Pinned so the badge-rendering side knows it must tolerate NaN.
      room.emit(key, encode({ type: 'dfn', dfn: true, atten: 'loud', norm: 1 }), participant('alice'));
      expect(Number.isNaN(svc.infoFor('alice')!.atten)).toBeTrue();
    });
  });
});
