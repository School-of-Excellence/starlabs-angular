/**
 * fcm.stub.ts — FCM / push-notification external stub (PLAN §5 FCM row, recon cf.md §0.6 + §C).
 *
 * WHAT ACTUALLY SENDS FCM
 *  - Push is a CF-SIDE side-effect, not a browser call. `onQueueStageChange` (recon cf.md §1)
 *    and `inviteToStudio` (cf.md §4) write `notificationrecord` docs; `notifyMobileApp`
 *    (communication.js, onDocumentCreated `notificationrecord/{id}`, cf.md §C) is what would
 *    push to a device. Per recon cf.md §0.6 the WATI/Slack/FCM sends are commented out across
 *    the CF, and the seeder sets `queue generation.iscommunicationsdisabled = true` so the
 *    comms branch is skipped anyway. There is therefore NOTHING to deliver in the test env.
 *
 * STUB BEHAVIOUR (PLAN §5: "Stub/no-op the FCM send; assert Firestore touchpoint/log writes
 * instead of device delivery")
 *  - No-op any push/FCM call the BROWSER might make (web-push subscription, FCM HTTP v1, the
 *    `@angular/fire` messaging send/registration endpoints) and CAPTURE the invocation so a
 *    spec can assert it was/was not attempted. We never deliver and never register a real SW push.
 *  - The PRIMARY assertion for a spec stays on Firestore: the `participant touchpoint` /
 *    `notificationrecord` doc the CF wrote (recon cf.md §1/§4) — read that back, NOT a device
 *    delivery. This stub exists only to keep a stray client push from escaping the test.
 *
 * Anti-circularity: this stub asserts nothing itself; the CF read-back (a touchpoint/record the
 * CF wrote against a seeded token move) is the proof the notification path ran — never a value
 * the test wrote.
 */
import type { Page } from '@playwright/test';
import {
  CallRecorder, fulfillJson, parseQuery, parseBody, CORS_HEADERS,
} from './stub-util';

export interface FcmStubOptions {
  /** Shared recorder for invocation capture; one is created if omitted. */
  recorder?: CallRecorder;
}

/**
 * Browser-side push endpoints to no-op. These are the surfaces a web client could hit; the CF
 * sender (`notifyMobileApp`) is server-side and unreachable from page.route — see file header.
 */
const PUSH_URL_GLOBS = [
  '**/fcm.googleapis.com/**',                 // FCM HTTP / HTTP v1 send
  '**/fcmregistrations.googleapis.com/**',    // FCM web registration
  '**/firebaseinstallations.googleapis.com/**', // installations (token mint for messaging)
  '**/*googleapis.com/**/sendMessage*',       // generic messaging send variants
  '**/notifyMobileApp*',                      // CF name, on the off chance it is exposed as HTTP
] as const;

/**
 * Install the FCM/push stub on a page: no-op every browser-issued push/registration call and
 * capture each one. Returns the CallRecorder (assert `count()===0` to prove the app did not try
 * to deliver client-side, or inspect captures if a spec drives a registration path).
 */
export function installFcmStub(page: Page, opts: FcmStubOptions = {}): CallRecorder {
  const recorder = opts.recorder ?? new CallRecorder();

  for (const glob of PUSH_URL_GLOBS) {
    void page.route(glob, async route => {
      const req = route.request();
      const url = req.url();
      recorder.record({
        fn: 'fcm', url, method: req.method(), query: parseQuery(url), body: parseBody(req), at: Date.now(),
      });
      if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' }); return; }
      // No-op success: shape is irrelevant (the app does not block on push delivery).
      await fulfillJson(route, 200, { stubbed: 'fcm', delivered: false });
    });
  }

  return recorder;
}

/**
 * EMULATOR NOTE — `notifyMobileApp` (communication.js, onDocumentCreated `notificationrecord/{id}`,
 * recon cf.md §C): this is the actual FCM sender and it is a Firestore-triggered CF, so it cannot
 * be page.route-stubbed. In the emulator/cloud target either (a) do NOT deploy the
 * `communication.js` senders (they only emit a push, no further Firestore read-back — recon
 * cf.md §C), or (b) deploy them harmlessly: with FCM sends commented out / no device registered,
 * the push is a no-op and the only observable remains the `notificationrecord` doc the upstream
 * trigger wrote. Specs assert THAT doc (recon cf.md §1/§4), never a delivery.
 */
