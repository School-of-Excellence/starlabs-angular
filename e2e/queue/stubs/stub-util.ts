/**
 * stub-util.ts — shared plumbing for the external-integration stubs (PLAN §5).
 *
 * Every stub in this folder intercepts a network call the REAL Angular app makes to an
 * external service (Zoom Web SDK / regen CF, LiveKit token + room-control CFs, FCM, Wati,
 * sendBatchEmail) and fulfils it with a synthetic response so a Playwright spec can drive
 * the real UI WITHOUT touching the live external service or opening real windows.
 *
 * Why a path-glob matcher (not a project-id host match): the app calls Cloud Functions at
 *   https://us-central1-<projectId>.cloudfunctions.net/<name>      (cloud target)
 *   http://127.0.0.1:5001/<projectId>/us-central1/<name>           (emulator target)
 * The PLAN/recon forbid hardcoding the project id (anti-circularity + safety), and the host
 * differs between the two targets. Matching on the FUNCTION NAME segment of the path works
 * for both. Use `cfRoute(name)` to build the glob a spec passes to `page.route`.
 *
 * Anti-circularity note: these stubs ONLY stand in for the external boundary. They never
 * assert product behaviour and they never write to Firestore. A spec asserts the value the
 * APP/CF computed (e.g. a `live assignment.zoomdata.start_url`, a route change to /joinroom)
 * AFTER the stubbed boundary responds — never a value the test itself produced. CF-backed
 * effects (the Firestore-trigger functions `studioZoomLink`, `bulkReadyInvitation`, the FCM
 * sender `notifyMobileApp`, …) are NOT page.route-interceptable; each stub documents the
 * emulator-side handling for those in an EMULATOR NOTE.
 */
import type { Page, Route, Request } from '@playwright/test';

/** A single captured stubbed call — the invocation-capture record the FCM/Wati/email/CF stubs collect. */
export interface StubCall {
  /** The matched Cloud-Function name (or external label), e.g. "createOpenViduToken". */
  fn: string;
  /** Full request URL as the app issued it. */
  url: string;
  /** HTTP method. */
  method: string;
  /** Parsed query params (Zoom regen passes liveassignmentid/zoomdata here). */
  query: Record<string, string>;
  /** Parsed JSON body when the request sent one (POST token/room-control calls), else undefined. */
  body?: unknown;
  /** Epoch ms at interception — lets a spec assert ordering / that a call fired at all. */
  at: number;
}

/** Collects stubbed invocations so a spec can assert "called N times / with these args" (no delivery). */
export class CallRecorder {
  readonly calls: StubCall[] = [];
  record(c: StubCall): void { this.calls.push(c); }
  /** Count of captured calls, optionally filtered to one function name. */
  count(fn?: string): number {
    return fn ? this.calls.filter(c => c.fn === fn).length : this.calls.length;
  }
  /** All captured calls for one function name (in invocation order). */
  forFn(fn: string): StubCall[] { return this.calls.filter(c => c.fn === fn); }
  /** The most-recent captured call (optionally for one function), or undefined if none. */
  last(fn?: string): StubCall | undefined {
    const list = fn ? this.forFn(fn) : this.calls;
    return list.length ? list[list.length - 1] : undefined;
  }
  clear(): void { this.calls.length = 0; }
}

/**
 * Build a `page.route` URL glob that matches a Cloud Function by NAME across both targets
 * (cloud `*.cloudfunctions.net/<name>` and emulator `.../us-central1/<name>`), with or
 * without a trailing query string or path suffix.
 */
export function cfRoute(fnName: string): string {
  return `**/${fnName}*`;
}

/** Parse a request URL's query string into a flat string map (best-effort; empty on failure). */
export function parseQuery(url: string): Record<string, string> {
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { out[k] = v; });
    return out;
  } catch {
    return {};
  }
}

/** Parse a request's POST body as JSON, tolerating empty/non-JSON bodies. */
export function parseBody(request: Request): unknown {
  try {
    const raw = request.postData();
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return request.postData() ?? undefined;
  }
}

/** Common CORS headers so a stubbed `fulfill` does not trip the browser's preflight checks. */
export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': '*',
};

/**
 * Fulfil a route with JSON (+ CORS). OPTIONS preflights get a bare 204 so the real POST/GET
 * that follows is the one captured/answered.
 */
export async function fulfillJson(route: Route, status: number, json: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
    return;
  }
  await route.fulfill({
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(json),
  });
}

/**
 * Guard that fails loudly if a stub is asked to open a real external window.
 * Stubs call this defensively; specs should never see a real Zoom/LiveKit popup.
 */
export function installNoRealWindowGuard(page: Page, label: string): void {
  page.on('popup', async popup => {
    const url = popup.url();
    if (/zoom\.us|zoom\.com|livekit|openvidu/i.test(url)) {
      throw new Error(`[${label}] a REAL external window opened (${url}); stub did not intercept it`);
    }
  });
}
