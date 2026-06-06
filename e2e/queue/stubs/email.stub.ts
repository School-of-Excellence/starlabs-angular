/**
 * email.stub.ts — sendBatchEmail external stub (PLAN §5 sendBatchEmail row).
 *
 * WHAT THE REAL APP DOES WITH EMAIL
 *  - The queue board's comms `sendEmail(tokens)` opens an `EmailInputComponent`; on a
 *    `status == 'validated'` result it POSTs the Cloud Function
 *      https://us-central1-<projectId>.cloudfunctions.net/sendBatchEmail
 *    with a JSON body (the email-archive payload + `archiveid`), responseType text
 *    (dynamic-queue-manager-clone.component.ts:4273-4331, URL built :4306-4311). The BIG
 *    dashboard and other screens call the SAME `sendBatchEmail` endpoint
 *    (big-dashboard.component.ts:1348, participants-analytics, big-cohort-clone, …).
 *  - For a `status == 'queued'|'send'` result the app instead writes an `email archive`
 *    Firestore doc (no network send) — that path is server-driven and not intercepted here.
 *
 * STUB BEHAVIOUR (PLAN §5: "No-op stub; assert invocation count, not delivery")
 *  - No-op the `sendBatchEmail` POST and CAPTURE the invocation. The spec asserts the
 *    INVOCATION COUNT / that the call fired with a body the app built — never that an email was
 *    delivered. Response is `text` (the app reads it as text), so we fulfil with a plain-text body.
 *  - Never sends a real email.
 *
 * IMPORTANT TARGET CAVEAT: the queue board builds the URL only when
 * `projectId === 'starlabs-test'` or `'fir-sample-aae4a'` (ts:4307-4310). On the dedicated test
 * project (`slabs-queue-e2e-exdcz`) the URL stays `undefined`, so the app POSTs to a relative
 * `undefined` path. We therefore register BOTH globs: the well-formed sendBatchEmail glob (cloud
 * host, any project) AND a fallback "undefined"-URL POST glob, so the call is captured regardless
 * of how the app resolved the URL. A spec asserting the email path on the test project should
 * expect the "undefined"-URL capture (and may treat the unresolved-URL branch as a finding).
 *
 * Anti-circularity: this stub asserts nothing; the spec's assertion (invocation fired / count)
 * reads the request the APP issued from the real selection — not a value the test wrote.
 */
import type { Page } from '@playwright/test';
import {
  CallRecorder, cfRoute, fulfillJson, parseQuery, parseBody, CORS_HEADERS,
} from './stub-util';

export interface EmailStubOptions {
  /** Shared recorder for invocation capture; one is created if omitted. */
  recorder?: CallRecorder;
}

/**
 * Install the sendBatchEmail stub on a page: no-op every `sendBatchEmail` POST (and the
 * unresolved-`undefined`-URL fallback for the test project) and capture each. Returns the
 * CallRecorder so a spec can assert `count('sendBatchEmail')` — never delivery.
 */
export function installEmailStub(page: Page, opts: EmailStubOptions = {}): CallRecorder {
  const recorder = opts.recorder ?? new CallRecorder();

  const handler = async (route: import('@playwright/test').Route) => {
    const req = route.request();
    const url = req.url();
    recorder.record({
      fn: 'sendBatchEmail', url, method: req.method(), query: parseQuery(url), body: parseBody(req), at: Date.now(),
    });
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' }); return; }
    // The app reads the response as text (responseType:'text') — fulfil text, not JSON.
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/plain', ...CORS_HEADERS }, body: 'stubbed: sendBatchEmail (not delivered)' });
  };

  // Well-formed cloud endpoint (matches any projectId host, both targets).
  void page.route(cfRoute('sendBatchEmail'), handler);
  // Test-project fallback: projectId not in the app's hardcoded allowlist ⇒ URL is `undefined`.
  void page.route('**/undefined', handler);

  return recorder;
}

/**
 * EMULATOR NOTE — `sendBatchEmail` is an `onRequest` HTTP Cloud Function (Postmark sender). It is
 * NOT one of the asserted Firestore-trigger read-backs (recon cf.md §1-§11) and is not part of
 * the emulator codebase; the stub above fully covers it at the browser boundary. The `queued`/
 * `send` branch writes an `email archive` doc directly (no network) — if a spec needs to prove
 * that path, read the `email archive` doc the APP wrote (it carries `type:'queue'` and
 * `metadata.queueref`), not an email delivery.
 */
