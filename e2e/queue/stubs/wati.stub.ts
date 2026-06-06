/**
 * wati.stub.ts — Wati / WhatsApp-broadcast external stub (PLAN §5 Wati row, recon cf.md §0.6).
 *
 * WHAT THE REAL APP DOES WITH WATI
 *  - `WatiService` (src/app/wati.service.ts) is the only WhatsApp surface the web app calls:
 *      • templates: GET  https://live-mt-server.wati.io/<serverid>/api/v1/getMessageTemplates
 *                   (wati.service.ts:22)
 *      • broadcast: POST https://live-server-<serverid>.wati.io/api/v1/sendTemplateMessages/
 *                   (wati.service.ts:24, sendBroadcastMessage() :72-87) with
 *                   { messages: [{ to, message }, …] } and a Bearer token.
 *  - On the queue side, the WhatsApp/WATI welcome+branch is ALSO a CF side-effect
 *    (`onQueueStageChange`), but the seeder sets `queue generation.iscommunicationsdisabled =
 *    true` and the CF's WATI sends are commented out (recon cf.md §0.6) — so the CF never sends.
 *
 * STUB BEHAVIOUR (PLAN §5: "No-op stub; assert button enable/disable + selection gating only")
 *  - No-op any wati.io request (templates fetch + broadcast send) and CAPTURE the invocation.
 *  - The spec asserts ONLY the APP's selection-gating UI: the broadcast/send button is disabled
 *    with an empty selection and enabled once recipients are selected (OP-09). It does NOT assert
 *    message delivery. If a spec drives the send, it can additionally assert this stub captured a
 *    broadcast with the expected recipient count (`messages.length`), proving the app built the
 *    payload from the real selection — but delivery itself is never asserted.
 *  - Never sends a real WhatsApp message.
 *
 * Anti-circularity: this stub asserts nothing. Selection-gating is a value the APP computed from
 * the real board selection; the optional recipient-count check reads the payload the APP built,
 * not a value the test wrote.
 */
import type { Page } from '@playwright/test';
import {
  CallRecorder, fulfillJson, parseQuery, parseBody, CORS_HEADERS,
} from './stub-util';

export interface WatiStubOptions {
  /** Shared recorder for invocation capture; one is created if omitted. */
  recorder?: CallRecorder;
}

/**
 * Install the Wati/WhatsApp stub on a page: no-op every wati.io call (templates + broadcast) and
 * capture each. Returns the CallRecorder so a spec can assert `count('wati-broadcast')` and the
 * recipient count in the captured body — never delivery.
 */
export function installWatiStub(page: Page, opts: WatiStubOptions = {}): CallRecorder {
  const recorder = opts.recorder ?? new CallRecorder();

  // Broadcast / template-send endpoints (live-server-<serverid>.wati.io).
  void page.route('**/*wati.io/**/sendTemplateMessages*', async route => {
    const req = route.request();
    const url = req.url();
    recorder.record({
      fn: 'wati-broadcast', url, method: req.method(), query: parseQuery(url), body: parseBody(req), at: Date.now(),
    });
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' }); return; }
    // Wati's real success shape varies; the app only logs the response, so a generic OK is enough.
    await fulfillJson(route, 200, { result: 'success', stubbed: 'wati', delivered: false });
  });

  // Single-template send (sendTemplateMessage?whatsappNumber=…) — same no-op + capture.
  void page.route('**/*wati.io/**/sendTemplateMessage*', async route => {
    const req = route.request();
    const url = req.url();
    recorder.record({
      fn: 'wati-send', url, method: req.method(), query: parseQuery(url), body: parseBody(req), at: Date.now(),
    });
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' }); return; }
    await fulfillJson(route, 200, { result: 'success', stubbed: 'wati', delivered: false });
  });

  // Template list fetch — return an empty template set so the comms UI renders without a real call.
  void page.route('**/*wati.io/**/getMessageTemplates*', async route => {
    const req = route.request();
    const url = req.url();
    recorder.record({
      fn: 'wati-templates', url, method: req.method(), query: parseQuery(url), at: Date.now(),
    });
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' }); return; }
    await fulfillJson(route, 200, { messageTemplates: [], link: null });
  });

  return recorder;
}

/**
 * EMULATOR NOTE — WATI on `onQueueStageChange` (recon cf.md §0.6, §1): the queue-stage WATI
 * welcome/branch is CF-side and is skipped because the seeder sets
 * `queue generation.iscommunicationsdisabled = true` (seed-test-project.js:230) and the CF's
 * WATI sends are commented out. There is nothing to intercept server-side; keep the seed's
 * `iscommunicationsdisabled = true`. The observable proof a stage moved is the
 * `participant touchpoint` / `notificationrecord` doc the CF wrote (recon cf.md §1) — assert
 * that, never a WhatsApp delivery.
 */
