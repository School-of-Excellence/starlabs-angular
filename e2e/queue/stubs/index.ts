/**
 * stubs/index.ts — barrel + one-call installer for the external-integration stubs (PLAN §5).
 *
 * A spec that drives any studio/comms surface should install ALL externals in `beforeEach` so a
 * stray Zoom/LiveKit/FCM/Wati/email call can never escape the test or open a real window:
 *
 *   import { installAllExternalStubs } from '../stubs';
 *   let stubs: ExternalStubs;
 *   test.beforeEach(({ page }) => { stubs = installAllExternalStubs(page); });
 *   // … drive UI …
 *   expect(stubs.email.count('sendBatchEmail')).toBe(0);  // no send on empty selection (OP-09)
 *
 * Each `.recorder`/returned CallRecorder captures invocations for the "no delivery, assert
 * invocation" checks (FCM/Wati/email) and the routing checks (OpenVidu token + room controls).
 *
 * For Zoom 'broken'/'null-link' guard tests, install Zoom separately with the desired mode:
 *   installZoomStub(page, { mode: 'broken' });
 */
import type { Page } from '@playwright/test';
import { CallRecorder } from './stub-util';
import { installZoomStub, type ZoomStubOptions } from './zoom.stub';
import { installOpenViduStub, type OpenViduStubOptions } from './openvidu.stub';
import { installFcmStub } from './fcm.stub';
import { installWatiStub } from './wati.stub';
import { installEmailStub } from './email.stub';

export * from './stub-util';
export * from './zoom.stub';
export * from './openvidu.stub';
export * from './fcm.stub';
export * from './wati.stub';
export * from './email.stub';

/** The recorders returned by `installAllExternalStubs` (one per external boundary). */
export interface ExternalStubs {
  zoom: CallRecorder;
  openvidu: CallRecorder;
  fcm: CallRecorder;
  wati: CallRecorder;
  email: CallRecorder;
}

export interface InstallAllOptions {
  zoom?: ZoomStubOptions;
  openvidu?: OpenViduStubOptions;
}

/**
 * Install every external stub on a page in one call. Returns the per-boundary recorders.
 * Zoom defaults to 'healthy' — pass `{ zoom: { mode: 'broken' } }` for the broken-link guard test.
 */
export function installAllExternalStubs(page: Page, opts: InstallAllOptions = {}): ExternalStubs {
  return {
    zoom: installZoomStub(page, opts.zoom),
    openvidu: installOpenViduStub(page, opts.openvidu),
    fcm: installFcmStub(page),
    wati: installWatiStub(page),
    email: installEmailStub(page),
  };
}
