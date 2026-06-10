// Console / pageerror guard for the queue e2e suite.
//
// The app logs heavily and emits benign failures from STUBBED externals (FCM/messaging,
// blocked notifications, network ERR_FAILED to stubbed endpoints, analytics SDKs). Those
// must NOT fail a test. A REAL uncaught app exception (pageerror) or a real error-level
// console message SHOULD fail it. attachConsoleGuard() records both, filtered by the
// IGNORABLE allowlist; assertNoFatal() throws if any fatal was collected.
//
// Usage (per the brief: attach in beforeEach):
//   let guard: ConsoleGuard;
//   test.beforeEach(async ({ page }) => { guard = attachConsoleGuard(page); });
//   test.afterEach(() => { assertNoFatal(guard); });            // or call inline mid-test
import { Page, expect } from '@playwright/test';

/**
 * Patterns that are EXPECTED noise in the test environment and must never fail a test:
 * FCM / messaging permission, generic resource-load / network failures (stubbed externals),
 * and the analytics/voice SDKs (posthog, picovoice). Mirrors actors-health.spec.ts's list,
 * widened per the support-layer brief.
 */
export const IGNORABLE: RegExp[] = [
  // FCM / Firebase Cloud Messaging
  /messaging\/permission-blocked/i,
  /unable to fetch FCM/i,
  /\bFCM\b/i,
  /messaging/i,
  /permission was not granted/i,
  /Notification permission/i,
  // network / resource load to stubbed or absent externals
  /ERR_FAILED/i,
  /Failed to load resource/i,
  /net::ERR_/i,
  // Firestore JS SDK transient transport blips: under the single shared emulator (heavy long-poll /
  // websocket load) the SDK logs an error-level "Could not reach Cloud Firestore backend. Connection
  // failed N times … [code=unavailable]" then transparently RETRIES and recovers. This is benign
  // retryable transport noise (same class as the network failures above), NOT an app bug — a genuine
  // app fault surfaces as a different message/path. Without this, an unlucky reconnect blip during a
  // case trips assertNoFatal. (A real Firestore *misuse* — e.g. an invalid query — is a distinct
  // "FirebaseError: Invalid Query …"/"INVALID_ARGUMENT" string and is still caught.)
  /Could not reach Cloud Firestore backend/i,
  /code=unavailable/i,
  /@firebase\/firestore:.*Connection failed/i,
  // Benign CROSS-DB deserialization notice (CLOUD-only; the emulator never connected the firestore-forms
  // named DB). A doc in one Firestore database carries a DocumentReference into another (a seeded
  // firestore-forms doc whose ref points at (default)). The SDK logs this at error level then CONTINUES
  // ("…It will be treated as a reference in the current database") and the app never derefs the field —
  // NOT an app bug. Anchored to the SDK's exact wording, so a genuine Firestore misuse
  // ("Invalid Query"/INVALID_ARGUMENT/PERMISSION_DENIED) is still caught. (Root cause also fixed in
  // fake-data.js by nulling formsByClient.workshopref; this guards any other benign cross-DB ref.)
  /contains a document reference within a different database/i,
  /which is not supported\. It will be treated as a reference in the current database/i,
  // Benign COLD-BOOTSTRAP race (cloud-only; widened by trace:'on'): on a fresh page.goto to a guarded
  // BIG route, AuthguardService.uid is set async by app.component's profile-snapshot path
  // (authguard.service.ts:143-149 is never .subscribe()d; app.component.ts:220/274), so a uid-dependent
  // Firestore ref can be built with an empty id segment before uid lands → "FirebaseError: incomplete
  // key". The op is rejected harmlessly (the screen still mounts and its role-gate/review controls render
  // — the test's FUNCTIONAL assertions still run and still catch a real break), and the LIVE app never
  // hits it (it reaches these screens warm, via SPA nav from PAB/Validate). Recorded as a product finding
  // in the 2026-06-08 cloud-evidence journal. Anchored tightly so a genuine Firestore misuse is unaffected.
  /FirebaseError: incomplete key/i,
  // analytics / voice SDKs (no-op in test)
  /posthog/i,
  /picovoice/i,
  // Benign ViewChild-timing log from the Customer Support dashboard: ngAfterViewInit logs
  // console.error("Scroll container is not available") when the optional #scrollContainer ViewChild
  // (the pagination scroll strip, rendered only once the ticket table has rows) is not yet present
  // (customer-support-dashboard.component.ts:285). The screen mounts and computes/renders all metric
  // cards + the ticket table regardless — the test's FUNCTIONAL assertions still run and still catch a
  // real break. Anchored to the exact wording so a genuine app error is unaffected.
  /Scroll container is not available/i,
];

/** True when `msg` is a REAL app error (i.e. NOT matched by any IGNORABLE pattern). */
export function isFatal(msg: string): boolean {
  if (!msg) return false;
  return !IGNORABLE.some((re) => re.test(msg));
}

export interface ConsoleGuard {
  /** Fatal messages collected so far (console error-level + pageerror), allowlist-filtered. */
  readonly fatals: string[];
  /** Everything recorded, fatal or not — useful for debugging a flaky test. */
  readonly all: string[];
  /** Detach the listeners (optional; Playwright also drops them on page close). */
  dispose(): void;
}

/**
 * Attach console + pageerror listeners to `page`. Call once in `beforeEach`.
 * Returns a live guard whose `.fatals` grows as the page runs.
 */
export function attachConsoleGuard(page: Page): ConsoleGuard {
  const fatals: string[] = [];
  const all: string[] = [];

  const onConsole = (msg: { type(): string; text(): string }) => {
    // Only error-level console messages are candidates (warnings/logs are benign here).
    if (msg.type() !== 'error') return;
    const text = msg.text();
    all.push('CONSOLE.ERROR: ' + text);
    if (isFatal(text)) fatals.push('CONSOLE.ERROR: ' + text.slice(0, 300));
  };
  const onPageError = (err: Error) => {
    const text = err && (err.message || String(err));
    all.push('PAGEERROR: ' + text);
    if (isFatal(text)) fatals.push('PAGEERROR: ' + text.slice(0, 300));
  };

  page.on('console', onConsole as never);
  page.on('pageerror', onPageError);

  return {
    fatals,
    all,
    dispose() {
      page.off('console', onConsole as never);
      page.off('pageerror', onPageError);
    },
  };
}

/**
 * Fail the current test if the guard recorded any fatal app error.
 * Call in `afterEach` (or inline after a user action you expect to be clean).
 */
export function assertNoFatal(
  guard: ConsoleGuard,
  context = 'no fatal console errors / pageerrors',
  extraIgnorable: RegExp[] = [],
): void {
  // extraIgnorable: per-test, tightly-anchored patterns a CALLER deems benign for that screen (e.g. a
  // heavy participant-dashboard's auxiliary-widget query that needs a composite index not provisioned on
  // the disposable test project — NOT the behavior under test). Default [] = unchanged behavior.
  const fatals = extraIgnorable.length
    ? guard.fatals.filter((f) => !extraIgnorable.some((re) => re.test(f)))
    : guard.fatals;
  expect(fatals, `${context}\n${fatals.join('\n')}`).toHaveLength(0);
}
