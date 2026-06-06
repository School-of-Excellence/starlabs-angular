/**
 * zoom.stub.ts — Zoom external stub (PLAN §5, recon studio.md §4, recon cf.md §2).
 *
 * WHAT THE REAL APP DOES WITH ZOOM
 *  - `regenerateZoomLink()` issues an HTTP GET to the Cloud Function
 *      `studioZoomLinkRegenerate?liveassignmentid=<id>&zoomdata=<json>`
 *    (dynamic-studio.component.ts:1628 test / :1632 prod). This is the ONLY Zoom call the
 *    web app makes directly over the network — so it is the one `page.route` can intercept.
 *  - `navigateMeeting(liveAssignment)` opens `/openmeeting/<docid>/queue` in a NEW TAB and the
 *    Zoom Web SDK lives in that route's component (out of the studio recon's file set). The
 *    SS-11 guard we care about fires BEFORE any window opens: if `zoomdata.start_url` is
 *    missing or === 'Link Broken' the app `alert()`s and does NOT navigate
 *    (dynamic-studio.component.ts:2278-2281). So the broken-link assertion never needs a real
 *    Zoom window; we only stub the data + guard against an accidental popup.
 *  - `zoomdata` itself ({ start_url, join_url, id, password, host_email }) is written onto the
 *    `live assignment/{id}` doc by the Firestore-trigger CF `studioZoomLink` on live-assignment
 *    CREATE — NOT by a call the browser makes. That is NOT page.route-interceptable; see the
 *    EMULATOR NOTE below and use `seedSyntheticZoomData()` to stand it in directly.
 *
 * STUB BEHAVIOUR (PLAN §5 Zoom row)
 *  - Healthy mode: `studioZoomLinkRegenerate` returns synthetic zoomdata
 *    { start_url, join_url, id, password }.
 *  - Broken-link mode: returns 'Link Broken' (string) / null start_url so the SS-11 guard test
 *    can assert the app's broken-link alert + no navigation.
 *  - Never opens a real Zoom window (installNoRealWindowGuard).
 *
 * Anti-circularity: the spec asserts a value the APP computed AFTER this boundary responds
 * (the regen-feedback UI state, or — for `studioZoomLink` — the CF-written
 * `live assignment.zoomdata.start_url`). This stub only supplies the external response.
 */
import type { Page } from '@playwright/test';
import {
  CallRecorder, cfRoute, fulfillJson, parseQuery, installNoRealWindowGuard,
} from './stub-util';

/** The synthetic Zoom payload shape the CF normally writes / the regen endpoint returns. */
export interface SyntheticZoomData {
  start_url: string;
  join_url: string;
  id: string | number;
  password: string;
  host_email: string;
}

export interface ZoomStubOptions {
  /**
   * 'healthy'  → regen returns full synthetic zoomdata (default).
   * 'broken'   → regen returns start_url 'Link Broken' (matches the CF's own fallback,
   *              recon cf.md §2 — deterministic across emulator + cloud).
   * 'null-link'→ regen returns start_url null (the other broken variant the guard handles).
   */
  mode?: 'healthy' | 'broken' | 'null-link';
  /** Override the synthetic payload (e.g. a known id a spec wants to assert). */
  zoomData?: Partial<SyntheticZoomData>;
  /** Shared recorder for invocation capture; one is created if omitted. */
  recorder?: CallRecorder;
}

/** A stable synthetic Zoom payload (deterministic ids so specs can assert exact values). */
export function syntheticZoomData(over: Partial<SyntheticZoomData> = {}): SyntheticZoomData {
  return {
    start_url: 'https://zoom.us/s/stub-start-0000?role=host',
    join_url: 'https://zoom.us/j/stub-join-0000',
    id: '0000000000',
    password: 'stubpass',
    host_email: 'soe1@soexcellence.com',
    ...over,
  };
}

/** The broken-link sentinel zoomdata the CF writes when there is no free Zoom account / openVidu studio. */
export function brokenZoomData(): Pick<SyntheticZoomData, 'host_email' | 'start_url'> {
  // Mirrors recon cf.md §2 (queuesystem.js:810/935): { host_email:'soe1@soexcellence.com', start_url:'Link Broken' }.
  return { host_email: 'soe1@soexcellence.com', start_url: 'Link Broken' };
}

/**
 * Install the Zoom stub on a page. Intercepts the `studioZoomLinkRegenerate` CF call and
 * returns synthetic (or broken) zoomdata; guards against any real Zoom popup.
 *
 * @returns the CallRecorder capturing each regen invocation (assert count/args in the spec).
 */
export function installZoomStub(page: Page, opts: ZoomStubOptions = {}): CallRecorder {
  const recorder = opts.recorder ?? new CallRecorder();
  const mode = opts.mode ?? 'healthy';

  installNoRealWindowGuard(page, 'zoom.stub');

  // The only network Zoom call the web app makes: regenerate link (HTTP GET CF).
  void page.route(cfRoute('studioZoomLinkRegenerate'), async route => {
    const req = route.request();
    const url = req.url();
    recorder.record({ fn: 'studioZoomLinkRegenerate', url, method: req.method(), query: parseQuery(url), at: Date.now() });

    if (mode === 'broken') {
      await fulfillJson(route, 200, { ...brokenZoomData() });
      return;
    }
    if (mode === 'null-link') {
      await fulfillJson(route, 200, { start_url: null, join_url: null, id: null, password: null, host_email: 'soe1@soexcellence.com' });
      return;
    }
    await fulfillJson(route, 200, syntheticZoomData(opts.zoomData));
  });

  return recorder;
}

/**
 * EMULATOR NOTE — `studioZoomLink` (Firestore trigger, recon cf.md §2):
 * This CF fires on `live assignment/{id}` CREATE and writes `zoomdata` onto that same doc; it
 * is NOT a request the browser issues, so `page.route` cannot stub it. Two ways to make the
 * SS-06/SS-11 zoomdata read-back deterministic against the emulator/cloud target:
 *   (a) Let the deployed CF run with the 6 DUMMY Zoom secrets (recon cf.md §6). The real Zoom
 *       API call fails and the CF takes its fallback path, writing
 *       `zoomdata.start_url === 'Link Broken'` — IF the studio pairing has `openvidu:true`
 *       (queuesystem.js:810) or there is no free zoomaccount (queuesystem.js:935). Seed
 *       `queue studio pairing/{studioid}.openvidu = true` (or an empty `zoomaccount` set) and
 *       assert `live assignment/{id}.zoomdata.start_url === 'Link Broken'`.
 *   (b) When the CF is NOT deployed to the chosen target (pure-UI emulator runs), stand the CF
 *       in by writing the synthetic payload directly with `seedSyntheticZoomData()` BEFORE the
 *       spec reads the Start-Meeting button — this is a PRECONDITION stand-in (allowed), not a
 *       circular read-back: the spec still asserts the APP's guard behaviour, not this value.
 */

/**
 * Admin-SDK stand-in for the `studioZoomLink` CF when it is not deployed to the target: write
 * synthetic `zoomdata` onto a `live assignment/{id}` doc so the studio Start-Meeting UI hydrates.
 * Pass `broken:true` to write the 'Link Broken' sentinel for the guard test.
 *
 * Uses the same Admin-SDK client + allowlist guard as the rest of the harness
 * (e2e/lib/participant-sim.js → e2e/lib/test-project.js). Default DB. Never touches production.
 *
 * NOTE: requires `firebase-admin` (already a dependency of the e2e package); import lazily so
 * this module stays usable from a pure page.route spec that never seeds.
 */
export async function seedSyntheticZoomData(
  liveAssignmentId: string,
  o: { broken?: boolean; zoomData?: Partial<SyntheticZoomData> } = {},
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { db } = require('../../lib/participant-sim.js') as { db: () => any };
  const zoomdata = o.broken ? brokenZoomData() : syntheticZoomData(o.zoomData);
  await db().collection('live assignment').doc(liveAssignmentId).set(
    { zoomdata, zoomlinkrequired: true },
    { merge: true },
  );
}
