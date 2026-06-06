/**
 * openvidu.stub.ts — OpenVidu / LiveKit external stub (PLAN §5, recon studio.md §4 + §SS-11,
 * recon cf.md §C).
 *
 * WHAT THE REAL APP DOES WITH OPENVIDU / LIVEKIT
 *  - Specialist clicks Start Meeting (openVidu studio) → `joinOpenViduRoom()`
 *    (dynamic-studio.component.ts:2572) creates/activates `openviduroom/{liveassignmentid}` via
 *    `guard.createOpenViduRoom(...)` (authguard.service.ts:1793) and opens
 *    `/joinroom/<liveassignmentid>` (ts:2622). roomid === sessionid === liveassignmentid.
 *  - `/joinroom/:roomid` (JoinOpenviduCallComponent) subscribes to `openviduroom/{roomid}`
 *    (docData, join-openvidu-call.component.ts:137) to render the pre-join container, then on
 *    "Join Call" POSTs the Cloud Function `createOpenViduToken`
 *    { roomName, participantName, participantId } with 503/SCALING_IN_PROGRESS retry
 *    (ts:448-477) and calls `room.connect(url, token)` against the LiveKit SDK (ts:408).
 *  - Host room controls hit further CFs (all onRequest, recon cf.md §C):
 *    `openViduCloseRoom` (ts:515), `openViduStartRecording` (ts:721), `openViduStopRecording`
 *    (ts:739), `kickParticipant` (ts:912), `muteParticipant` (ts:958).
 *
 * STUB BEHAVIOUR (PLAN §5 OpenVidu/LiveKit row — ROUTING ONLY)
 *  - Stub the `openviduroom` doc (so the pre-join container resolves a title) and the
 *    `createOpenViduToken` CF (return a fake { url, token }). Stub the room-control CFs as 200
 *    no-ops with invocation capture.
 *  - ASSERT ROUTING ONLY: the spec asserts navigation to `/joinroom/:id` and that the pre-join
 *    controls render (recon studio.md SS-11). We deliberately do NOT assert deep LiveKit
 *    track/grid/active-speaker/blur state — there is no media server in the test project
 *    (PLAN §2.2 SS-11 ⚠️, §2.6 #4). `room.connect()` will fail against the fake url; that is
 *    EXPECTED and out of scope — drive assertions up to the routing/pre-join boundary.
 *  - Never opens a real LiveKit/OpenVidu window.
 *
 * Anti-circularity: the spec asserts the route the APP navigated to and the title the APP read
 * from the (stubbed-or-seeded) `openviduroom` doc — values the app produced — never a value the
 * test wrote into the token response.
 */
import type { Page } from '@playwright/test';
import {
  CallRecorder, cfRoute, fulfillJson, parseQuery, parseBody, installNoRealWindowGuard,
} from './stub-util';

/** The LiveKit token-endpoint response the app expects: `{ url, token }` (join-openvidu-call.ts:408,458). */
export interface SyntheticLiveKitToken {
  url: string;
  token: string;
}

export interface OpenViduStubOptions {
  /** Override the synthetic token endpoint response. */
  token?: Partial<SyntheticLiveKitToken>;
  /**
   * If true, the `createOpenViduToken` endpoint first returns 503 SCALING_IN_PROGRESS once,
   * then succeeds — exercises the app's retry loop (join-openvidu-call.ts:448-477). Default false.
   */
  simulateScalingRetryOnce?: boolean;
  /** Shared recorder for invocation capture; one is created if omitted. */
  recorder?: CallRecorder;
}

/** A stable synthetic LiveKit token payload (the url is intentionally fake — no media server). */
export function syntheticLiveKitToken(over: Partial<SyntheticLiveKitToken> = {}): SyntheticLiveKitToken {
  return {
    url: 'wss://livekit.stub.invalid',
    token: 'stub.livekit.jwt.token',
    ...over,
  };
}

/** The room-control CFs that are stubbed as 200 no-ops (routing/assert scope, recon cf.md §C). */
const ROOM_CONTROL_FNS = [
  'openViduCloseRoom',
  'openViduStartRecording',
  'openViduStopRecording',
  'kickParticipant',
  'muteParticipant',
  'CheckMasternodeStatus',
] as const;

/**
 * Install the OpenVidu/LiveKit stub on a page. Stubs the token CF + room-control CFs and
 * guards against a real media window. The `openviduroom` doc itself is a Firestore doc — stub
 * it via `seedOpenViduRoom()` (see EMULATOR NOTE), not page.route.
 *
 * @returns the CallRecorder capturing token + room-control invocations.
 */
export function installOpenViduStub(page: Page, opts: OpenViduStubOptions = {}): CallRecorder {
  const recorder = opts.recorder ?? new CallRecorder();
  let scalingServed = false;

  installNoRealWindowGuard(page, 'openvidu.stub');

  // LiveKit token mint (POST). Optionally fail once with 503 to exercise the retry path.
  void page.route(cfRoute('createOpenViduToken'), async route => {
    const req = route.request();
    const url = req.url();
    recorder.record({
      fn: 'createOpenViduToken', url, method: req.method(),
      query: parseQuery(url), body: parseBody(req), at: Date.now(),
    });
    if (req.method() === 'OPTIONS') { await fulfillJson(route, 204, {}); return; }

    if (opts.simulateScalingRetryOnce && !scalingServed) {
      scalingServed = true;
      // The app retries on 503 / SCALING_IN_PROGRESS (join-openvidu-call.ts:448-477).
      await fulfillJson(route, 503, { error: 'SCALING_IN_PROGRESS' });
      return;
    }
    await fulfillJson(route, 200, syntheticLiveKitToken(opts.token));
  });

  // Room-control CFs → 200 no-op + capture (assert button wiring / invocation, not media effect).
  for (const fn of ROOM_CONTROL_FNS) {
    void page.route(cfRoute(fn), async route => {
      const req = route.request();
      const url = req.url();
      recorder.record({
        fn, url, method: req.method(), query: parseQuery(url), body: parseBody(req), at: Date.now(),
      });
      await fulfillJson(route, 200, { ok: true, stubbed: fn });
    });
  }

  return recorder;
}

/**
 * EMULATOR NOTE — `openviduroom` doc + `createOpenViduRoom` (recon studio.md §3j, cf.md §C):
 * The pre-join container at `/joinroom/:id` resolves its title from the `openviduroom/{roomid}`
 * Firestore doc (docData stream, join-openvidu-call.ts:137-159), and the studio writes that doc
 * via the APP-SIDE `guard.createOpenViduRoom()` (authguard.service.ts:1793) — both Firestore,
 * not network calls, so page.route cannot supply them. Options:
 *   (a) Let the real `joinOpenViduRoom()` flow run end-to-end: the app itself writes
 *       `openviduroom/{liveassignmentid}` then routes to /joinroom — assert the route + that
 *       the title the app read back matches the seeded live-assignment title. The token CF and
 *       room-control CFs are still page.route-stubbed by `installOpenViduStub`.
 *   (b) For a /joinroom-direct spec (navigate straight to /joinroom/:id without the studio
 *       click), stand the room doc in with `seedOpenViduRoom()` BEFORE navigating — a
 *       PRECONDITION stand-in, not a circular read-back. `room.connect()` will still fail
 *       against the fake LiveKit url; stop assertions at the pre-join/routing boundary
 *       (PLAN §2.2 SS-11 ⚠️ — no deep track/grid state).
 * NONE of the LiveKit/AWS media CFs (`onEventOpenVidu`, `awsEventWebhook`, …) are deployed to
 * the emulator codebase (recon cf.md §C) — they are onRequest/onSchedule media routing only.
 */

/**
 * Admin-SDK stand-in for the `openviduroom` doc so `/joinroom/:id` can render its pre-join
 * container without driving the full studio Start-Meeting flow. Shape mirrors
 * `createOpenViduRoom` (recon studio.md §3j). Default DB; allowlist-guarded; never production.
 */
export async function seedOpenViduRoom(
  roomId: string,
  o: { title?: string; queueId?: string; participantId?: string; hosts?: string[]; active?: boolean } = {},
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { db } = require('../../lib/participant-sim.js') as { db: () => any };
  await db().collection('openviduroom').doc(roomId).set(
    {
      active: o.active ?? true,
      createddate: new Date(),
      sessiontype: 'live assignment',
      sessionid: roomId,
      roomid: roomId,
      hosts: o.hosts ?? [],
      participantid: o.participantId ?? null,
      title: o.title ?? `Stub Room ${roomId}`,
      metadata: { queueid: o.queueId ?? null },
    },
    { merge: true },
  );
}
