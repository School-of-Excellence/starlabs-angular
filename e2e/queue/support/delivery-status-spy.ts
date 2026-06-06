// delivery-status-spy.ts — capture the ARGUMENTS the operator board passes to
// `guard.updateDeliveryStatus(apptPath, status, { eventRequestRef })` (PLAN §4 gap-10 / cf.md §9).
//
// WHY a dev-global wrap and NOT a page.route stub:
//   `updateDeliveryStatus` is an APP-SIDE method on AuthguardService (src/app/authguard.service.ts:889),
//   invoked in-process by the board on a final-stage move (…component.ts:2982) and on Complete-Queue
//   (…component.ts:3822). It performs a Firestore writeBatch — it is NOT a network call to a Cloud
//   Function, so the stub layer (e2e/queue/stubs/*, which intercepts `page.route` CF URLs) cannot see
//   it. To assert ARGUMENT CORRECTNESS (the right `/queue_token/{T}` path + status `completed` +
//   `eventRequestRef`), we wrap the method on the LIVE component's `guard` instance and record each
//   invocation's arguments — the values the PRODUCT computed, never a value the test wrote
//   (anti-circular: we assert the app's own derived path/status/ref, plus the Firestore deliverables
//   side-effect when seeded — see OP-07).
//
// HOW the wrap reaches the instance: the board component (`app-dynamic-queue-manager-clone`) injects
//   `public guard: AuthguardService` (…component.ts:1520). Angular's dev-mode debug global
//   `window.ng.getComponent(hostEl)` returns that component instance; we replace
//   `instance.guard.updateDeliveryStatus` with a recorder that pushes `{ apptPath, status,
//   hasEventRequestRef }` onto `window.__deliveryStatusCalls` and then calls the original (so the real
//   Firestore write still happens and OP-07's deliverables read-back stays valid). The served e2e app
//   is a DEV build (environment.emulator.ts / development → production:false; main.ts only
//   enableProdMode() when !isDevMode()), so `window.ng` is present — the SAME mechanism
//   big-planner.page.ts relies on. If the app were a prod build, install() throws a clear error.
//
// The 3rd argument is `{ eventRequestRef: <Firestore Query> }` — a Query object is NOT JSON-
//   serialisable and cannot cross the page→node boundary, so we record only a BOOLEAN
//   `hasEventRequestRef` (whether the options carried a non-null eventRequestRef). That is exactly what
//   the gap-10 assertion needs: the call carried an eventRequestRef (a wrong/absent ref completes the
//   wrong record). The path + status DO serialise and are recorded verbatim.

import { Page, expect } from '@playwright/test';

/** One captured `updateDeliveryStatus` invocation (only JSON-safe fields cross the boundary). */
export interface DeliveryStatusCall {
  /** 1st arg `apptPath` — the value the board derived: `doc(fs,"/queue_token/"+docid).path`
   *  resolves to `"queue_token/{docid}"` (Firestore `DocumentReference.path` strips the leading "/"). */
  apptPath: string;
  /** 2nd arg `status` — `"completed"` on both the final-move and Complete-Queue call sites. */
  status: string;
  /** Whether the 3rd arg carried a non-null `eventRequestRef` (the event-participation-request query). */
  hasEventRequestRef: boolean;
  /** Epoch ms at capture (ordering). */
  at: number;
}

const HOST = 'app-dynamic-queue-manager-clone';
const STORE = '__deliveryStatusCalls';

/**
 * Wrap `guard.updateDeliveryStatus` on the live board component so every call's args are recorded.
 * Idempotent per page: re-installing re-points the wrapper at the (same) original and resets the store.
 * Must be called AFTER the board component has mounted (a queue is loading/loaded) so `getComponent`
 * resolves — call it right after `board.selectQueue(...)`.
 *
 * Throws if the dev global or the component is unavailable (prod build / board not mounted).
 */
export async function installDeliveryStatusSpy(page: Page): Promise<void> {
  const ok = await page.evaluate(
    ({ host, store }) => {
      const w = window as unknown as {
        ng?: { getComponent?: (el: Element) => unknown };
        [k: string]: unknown;
      };
      const el = document.querySelector(host);
      if (!el) return { ok: false, reason: 'board component not mounted yet' };
      if (!w.ng || typeof w.ng.getComponent !== 'function') {
        return { ok: false, reason: 'window.ng.getComponent unavailable (needs a DEV build)' };
      }
      const cmp = w.ng.getComponent(el) as { guard?: Record<string, unknown> } | null;
      if (!cmp || !cmp.guard) return { ok: false, reason: 'component has no `guard` instance' };

      const guard = cmp.guard as Record<string, unknown> & {
        updateDeliveryStatus?: (...a: unknown[]) => unknown;
        __origUpdateDeliveryStatus?: (...a: unknown[]) => unknown;
      };
      // Preserve the genuine original across re-installs.
      const original = guard.__origUpdateDeliveryStatus || guard.updateDeliveryStatus;
      if (typeof original !== 'function') return { ok: false, reason: 'guard.updateDeliveryStatus is not a function' };
      guard.__origUpdateDeliveryStatus = original;

      (w as Record<string, unknown>)[store] = []; // reset capture buffer

      guard.updateDeliveryStatus = function (this: unknown, ...args: unknown[]) {
        try {
          const opts = (args[2] || {}) as { eventRequestRef?: unknown };
          const rec = {
            apptPath: typeof args[0] === 'string' ? (args[0] as string) : String(args[0]),
            status: typeof args[1] === 'string' ? (args[1] as string) : String(args[1]),
            hasEventRequestRef: opts.eventRequestRef != null,
            at: Date.now(),
          };
          ((w as Record<string, unknown>)[store] as unknown[]).push(rec);
        } catch {
          /* never let capture break the real call */
        }
        // Call the real method so the product's Firestore writeBatch still runs (OP-07 read-back).
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      };
      return { ok: true, reason: '' };
    },
    { host: HOST, store: STORE },
  );

  if (!ok.ok) {
    throw new Error(
      `installDeliveryStatusSpy: could not wrap guard.updateDeliveryStatus (${ok.reason}). ` +
        `Install it after the board (\`${HOST}\`) has mounted, on a DEV build (window.ng present).`,
    );
  }
}

/** Read every captured call so far (in invocation order). Snapshot — safe to call repeatedly. */
export async function readDeliveryStatusCalls(page: Page): Promise<DeliveryStatusCall[]> {
  return page.evaluate((store) => {
    const w = window as unknown as Record<string, unknown>;
    const arr = (w[store] as DeliveryStatusCall[] | undefined) || [];
    // structuredClone-safe plain copy
    return arr.map((c) => ({ apptPath: c.apptPath, status: c.status, hasEventRequestRef: c.hasEventRequestRef, at: c.at }));
  }, STORE) as Promise<DeliveryStatusCall[]>;
}

/**
 * Poll until at least `min` calls have been captured (the board fires the call asynchronously after the
 * move's writeBatch commits), then return all captured calls. Fails the test with a descriptive message
 * if `min` is never reached within `timeoutMs`.
 */
export async function waitForDeliveryStatusCalls(
  page: Page,
  min: number,
  timeoutMs = 20_000,
): Promise<DeliveryStatusCall[]> {
  await expect
    .poll(async () => (await readDeliveryStatusCalls(page)).length, {
      timeout: timeoutMs,
      intervals: [200, 400, 800],
      message: `waitForDeliveryStatusCalls: expected >= ${min} updateDeliveryStatus call(s), none/too few captured. Was the spy installed before the move, and did the move reach the FINAL stage / Complete-Queue path?`,
    })
    .toBeGreaterThanOrEqual(min);
  return readDeliveryStatusCalls(page);
}
