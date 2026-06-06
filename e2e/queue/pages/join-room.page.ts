// join-room.page.ts — page object for the OpenVidu / LiveKit room route `/joinroom/:roomid`
// (JoinOpenviduCallComponent, src/app/OpenVidu/join-openvidu-call/join-openvidu-call.component.*).
//
// SCOPE (recon studio.md SS-11 + §4, openvidu.stub.ts header): this is the ROUTING / PRE-JOIN
// boundary only. We assert the route resolved and the local-preview controls the APP rendered —
// NOT deep LiveKit track/grid/active-speaker state. There is no media server in the test project,
// so `room.connect()` against the synthetic LiveKit url WILL fail; that is expected and out of
// scope. Drive assertions up to the pre-join screen.
//
// STUBBED MEDIA — two pieces are required for the pre-join screen to render and for the methods
// here to be meaningful; the caller wires them in `beforeEach` (this page object does NOT install
// them, to keep one source of truth):
//   1. getUserMedia: the real `prepareParticipant()` calls navigator.mediaDevices.getUserMedia
//      ({video,audio}) (join-openvidu-call.component.ts:224). Headless Chromium with the queue
//      config's Desktop-Chrome project must be launched with fake media so the grant resolves to
//      `granted` rather than `denied`. The spec's project/use should add launch args
//      `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` (see RISKS in the
//      page-object return — the queue config currently does NOT set these). `enableFakeMedia()`
//      below grants the Permissions API so the prompt never blocks; combined with the launch flags
//      the camera/mic resolve to granted.
//   2. createOpenViduToken + room-control CFs + the `openviduroom/{roomid}` doc: install via
//      `installOpenViduStub(page)` / `installAllExternalStubs(page)` and stand the room doc in with
//      `seedOpenViduRoom(roomId, …)` BEFORE `open()` for a /joinroom-direct spec (a PRECONDITION
//      stand-in, not a circular read-back — openvidu.stub.ts EMULATOR NOTE option (b)). For the
//      end-to-end studio flow, let the real `joinOpenViduRoom()` write the doc and route here.
//
// ANTI-CIRCULARITY: the reading methods return numbers the APP computed from ITS OWN state machine
// and Firestore stream — `routeResolved()` reflects the component reaching its pre-join state
// (driven by the `openviduroom` docData subscription + server-status flow, ts:137-163,190-214),
// and `localPreviewControlsVisible()` counts the pre-join control buttons the app's `*ngIf`
// (`!room() && !loading && meetingRoomStatus == null`, html:19/67-74) chose to render. Neither
// asserts a value this page object wrote.
//
// SELECTORS — testid-first per SHARED CONVENTIONS, from e2e/queue/recon/testids.md
// (join-openvidu-call.component.html section):
//   joinroom-prejoin     → .prejoin-container          (pre-join screen mounted)
//   joinroom-enable-btn  → "Enable Access" .btn-enable (prepareParticipant)
//   joinroom-join-btn    → "Join Call" .btn-join        (joinCall; disabled until cam+mic granted)
//   joinroom-connected   → .zoom-container              (connected shell — NOT asserted here)
import { Page, Locator, expect } from '@playwright/test';

/** data-testid hooks shipped on the join-openvidu-call template (recon/testids.md). */
export const JOINROOM_TESTIDS = {
  prejoin: 'joinroom-prejoin',
  enableBtn: 'joinroom-enable-btn',
  joinBtn: 'joinroom-join-btn',
  connected: 'joinroom-connected',
} as const;

/**
 * How long to wait for the room route to resolve its pre-join state. The component must: read the
 * `openviduroom/{id}` docData (async Firestore stream), run the server-status check, then flip
 * `loading=false` / `meetingRoomStatus=null` (ts:137-163,190-214). collectionData/docData are
 * async — every read below uses expect.poll with this budget.
 */
const RESOLVE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

export class JoinRoomPage {
  readonly page: Page;

  // testid-first locators (stable across the mutually-exclusive *ngIf branches).
  readonly prejoin: Locator;
  readonly enableBtn: Locator;
  readonly joinBtn: Locator;
  readonly connected: Locator;

  constructor(page: Page) {
    this.page = page;
    this.prejoin = page.getByTestId(JOINROOM_TESTIDS.prejoin);
    this.enableBtn = page.getByTestId(JOINROOM_TESTIDS.enableBtn);
    this.joinBtn = page.getByTestId(JOINROOM_TESTIDS.joinBtn);
    this.connected = page.getByTestId(JOINROOM_TESTIDS.connected);
  }

  /** The room route path for a given room id (== liveassignmentid; recon studio.md SS-11). */
  static routeFor(roomId: string): string {
    return `/joinroom/${roomId}`;
  }

  /**
   * Grant camera + microphone via the Permissions API so `prepareParticipant()`'s
   * getUserMedia prompt resolves without a manual dialog. This handles the PERMISSION prompt;
   * the actual fake video/audio TRACKS still require the browser launch flags
   * `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` (see file header
   * RISKS) — without them, getUserMedia may still reject and cameraStatus becomes 'denied'.
   * Safe to call before navigation; no-op if the context does not support granting.
   */
  async enableFakeMedia(): Promise<void> {
    try {
      await this.page.context().grantPermissions(['camera', 'microphone'], {
        origin: new URL(this.page.url() || 'http://localhost:4200').origin,
      });
    } catch {
      // Some channels reject unknown permission names or a blank origin; the launch flags are the
      // real media source, so a failure here is non-fatal — surfaced as a RISK, not thrown.
    }
  }

  /**
   * Navigate to `/joinroom/:roomid` and wait until the component has mounted past its initial
   * `loading` state. Uses the page's configured baseURL (relative goto) — never hardcodes a host
   * or project id (SHARED CONVENTIONS). Grants media permission first so the pre-join screen can
   * reach a granted camera/mic state.
   *
   * PRECONDITION (caller): the `openviduroom/{id}` doc must exist+active (seed via
   * `seedOpenViduRoom(id, …)` for a direct spec, or let the real studio Start-Meeting flow write
   * it) and `installOpenViduStub(page)` must be active, else the route will sit in a server-check /
   * `ended` state rather than resolving the pre-join container.
   *
   * @param roomId the room id (liveassignmentid).
   */
  async open(roomId: string): Promise<void> {
    await this.enableFakeMedia();
    await this.page.goto(JoinRoomPage.routeFor(roomId), { waitUntil: 'domcontentloaded' });
    // Confirm the SPA router actually landed on this route (guard admitted us; not bounced).
    await this.page.waitForURL((u) => u.pathname.includes(`/joinroom/${roomId}`), {
      timeout: RESOLVE_TIMEOUT_MS,
    });
    // Re-grant now that the real origin is known (the pre-goto origin may have been a fallback).
    await this.enableFakeMedia();
  }

  /**
   * READING METHOD (app-computed) — has the room route RESOLVED to its interactive pre-join state?
   * Returns the count of pre-join containers the APP rendered: 1 once the component has read the
   * `openviduroom` doc, cleared `loading`, and reached `meetingRoomStatus == null` (the prejoin
   * `*ngIf`, html:19); 0 while still loading / in a server-check / ended state. Polls because the
   * docData + server-status flow is async (ts:137-214).
   *
   * Anti-circularity: this is a value the app's own state machine produced (which template branch
   * it mounted), not a value the test wrote.
   *
   * @returns 1 when the pre-join screen has resolved, 0 otherwise (asserted to settle within the
   *          resolve budget).
   */
  async routeResolved(): Promise<number> {
    let count = 0;
    await expect
      .poll(
        async () => {
          count = await this.prejoin.count();
          return count;
        },
        {
          message:
            'join-room route did not resolve to its pre-join container (joinroom-prejoin). ' +
            'Check the openviduroom/{roomid} doc is active and the OpenVidu stub is installed.',
          timeout: RESOLVE_TIMEOUT_MS,
          intervals: [POLL_INTERVAL_MS],
        },
      )
      .toBeGreaterThan(0);
    return count;
  }

  /**
   * READING METHOD (app-computed) — how many local-preview CONTROL buttons did the app render on
   * the pre-join screen? The pre-join controls (Enable Access + Join Call) live inside the
   * `.prejoin-container` `*ngIf` (html:67-74), so this count is 2 exactly when the app has resolved
   * the pre-join state and rendered both controls, and 0 when it has not (connected / ended /
   * loading). Polls the live (async) DOM.
   *
   * Anti-circularity: counts what the APP's `*ngIf` chose to mount; the page object never injects
   * these nodes.
   *
   * @returns the number of visible pre-join control buttons (expected 2 on a resolved pre-join).
   */
  async localPreviewControlsVisible(): Promise<number> {
    // Scope strictly to the pre-join control buttons so a stray connected-room button can't inflate
    // the count. Both carry shipped testids (joinroom-enable-btn / joinroom-join-btn).
    const controls = this.page.locator(
      `[data-testid="${JOINROOM_TESTIDS.enableBtn}"], [data-testid="${JOINROOM_TESTIDS.joinBtn}"]`,
    );
    let visible = 0;
    await expect
      .poll(
        async () => {
          // Count only the ones actually visible (the app may keep a hidden branch in some states).
          const total = await controls.count();
          let v = 0;
          for (let i = 0; i < total; i++) {
            if (await controls.nth(i).isVisible()) v++;
          }
          visible = v;
          return v;
        },
        {
          message:
            'pre-join local-preview controls (Enable Access / Join Call) did not render. ' +
            'Did the route resolve (routeResolved) and the openviduroom doc become active?',
          timeout: RESOLVE_TIMEOUT_MS,
          intervals: [POLL_INTERVAL_MS],
        },
      )
      .toBeGreaterThan(0);
    return visible;
  }

  /**
   * ACTION METHOD — click "Enable Access" to request devices (real click → `prepareParticipant()`,
   * html:68 / ts:216). After this, on a fake-media context the camera/mic statuses flip to
   * 'granted' and the Join Call button becomes enabled. The button is disabled while `isRequesting`
   * — Playwright's actionability wait handles that.
   */
  async clickEnableAccess(): Promise<void> {
    await this.enableBtn.click();
  }

  /**
   * ACTION METHOD — click "Join Call" (real click → `joinCall()`, html:71 / ts:255). The button is
   * `[disabled]` until both camera and mic are 'granted' (html:72), so Playwright will wait for the
   * app to enable it before clicking. This pushes `meetingRoomStatus='connecting'` and attempts
   * `room.connect()` against the (stubbed, fake) LiveKit url — which is expected to fail with no
   * media server; do NOT assert connected-room state after this (recon studio.md SS-11 ⚠️).
   */
  async clickJoinCall(): Promise<void> {
    await this.joinBtn.click();
  }
}
