// auth.ts — role login helpers for the queue e2e suite.
//
// These wrap the EXISTING `loginAs` (real Angular login form) from actors.ts — they do NOT
// re-implement the login form (the working selectors live in actors.ts loginAs, and the recon
// says those must not change). Each helper logs in as a seeded actor of the right role, then
// resolves once the actor's LANDING route has actually mounted (i.e. the data-driven route
// guard let them in), so a wrong-role bounce surfaces as a clear timeout instead of a silent
// "still on the wrong page".
//
// Actor → role → landing route (from the seeder roles + recon route map):
//   operator   admin  ['admin']                       -> /dynamicqueuemanager   (operator.md)
//   specialist        ['admin','changeagent']         -> /dynamicstudio         (studio.md SS-00)
//   big admin         ['admin','eventcoordinator']    -> /big-dashboard         (big.md BIG-00)
//   big participant   (seeded participant user)       -> /queue-web             (studio.md §5, app.routes.ts:319)
//
// NOTE on "big participant": the seeder has no dedicated BIG-participant STAFF kind — ordinary
// participants are `participant<idx>+<TESTRUNID>@example.com` (seed-test-project.js planSeed()).
// The participant-facing web surface is `/queue-web` (QueueWebVersion1Component, authGuard), which
// hosts the web-studio-invitation accept/deny overlay. loginAsBigParticipant logs in as that
// participant and lands there.
import { Page } from '@playwright/test';
import { loginAs, actors, PASSWORD, TESTRUNID } from './actors';

/** Landing routes each role is expected to reach after login (path segments, query-stripped). */
export const LANDING_ROUTES = {
  operator: '/dynamicqueuemanager',
  specialist: '/dynamicstudio',
  bigAdmin: '/big-dashboard',
  bigParticipant: '/queue-web',
} as const;

export interface LoginOpts {
  /** Override the landing route to confirm (defaults to the role's LANDING_ROUTES entry). */
  landingRoute?: string;
  /** Max time to wait for the landing route to mount. Default 30000ms. */
  timeoutMs?: number;
  /** Override the actor email (defaults to the seeded actor for the role). */
  email?: string;
}

/**
 * Log in via the real login form, then navigate to `landingRoute` and wait until the URL is on
 * that route (the guard admitted the actor). loginAs already resolves off /login; we then push to
 * the role's landing surface so the helper's postcondition is "this actor is on their screen".
 */
async function loginAndLand(page: Page, email: string, landingRoute: string, timeoutMs = 30_000): Promise<void> {
  await loginAs(page, email, PASSWORD);
  // Go to the role's landing surface (loginAs lands on the app's default route, which varies by role).
  if (!page.url().includes(landingRoute.replace(/^\//, ''))) {
    await page.goto(landingRoute, { waitUntil: 'domcontentloaded' });
  }
  // Confirm the guard admitted us (not bounced to /login or held on the previous page).
  await page.waitForURL((u) => u.pathname.includes(landingRoute.replace(/^\//, '')), { timeout: timeoutMs });
}

/** Log in as the seeded OPERATOR admin and land on the Queue Manager board (/dynamicqueuemanager). */
export async function loginAsOperator(page: Page, opts: LoginOpts = {}): Promise<string> {
  const email = opts.email || actors.operatorAdmin;
  await loginAndLand(page, email, opts.landingRoute || LANDING_ROUTES.operator, opts.timeoutMs);
  return email;
}

/**
 * Log in as a seeded SPECIALIST (studio member) and land on Dynamic Studio (/dynamicstudio).
 * @param i which specialist (0-based; the seeder creates specialist0..specialist9).
 */
export async function loginAsSpecialist(page: Page, i = 0, opts: LoginOpts = {}): Promise<string> {
  const email = opts.email || actors.specialist(i);
  await loginAndLand(page, email, opts.landingRoute || LANDING_ROUTES.specialist, opts.timeoutMs);
  return email;
}

/**
 * Log in as a seeded BIG provider (admin/eventcoordinator) and land on the BIG Dashboard
 * (/big-dashboard).
 * @param i which BIG provider (0-based; the seeder creates big0..big3).
 */
export async function loginAsBigAdmin(page: Page, i = 0, opts: LoginOpts = {}): Promise<string> {
  const email = opts.email || actors.big(i);
  await loginAndLand(page, email, opts.landingRoute || LANDING_ROUTES.bigAdmin, opts.timeoutMs);
  return email;
}

/**
 * Log in as a seeded PARTICIPANT and land on the participant web surface (/queue-web), which hosts
 * the web-studio-invitation accept/deny overlay (studio.md §5). Used to drive the participant side
 * of a studio invite without the native Flutter app.
 * @param i which participant (0-based; the seeder creates participant0..participantN per the plan).
 */
export async function loginAsBigParticipant(page: Page, i = 0, opts: LoginOpts = {}): Promise<string> {
  const email = opts.email || participantEmail(i);
  await loginAndLand(page, email, opts.landingRoute || LANDING_ROUTES.bigParticipant, opts.timeoutMs);
  return email;
}

/**
 * Log in as a seeded EIS-ONLY specialist (`changeagent` role; NONE of developer/admin/ah) and land
 * on /EISDashboard (the default route, always admitted by authGuard). This actor is deliberately
 * non-privileged: it is ADMITTED past authGuard on staff screens (its role + profileid are granted in
 * the dashboard route-config) but must be BOUNCED by the hardcoded roleGuard on sensitive screens like
 * /arenastudioactivity. Used by the SS-15b negative role-gate test.
 * @param i which eis-only actor (0-based; the seeder creates eisonly0..).
 */
export async function loginAsEisOnly(page: Page, i = 0, opts: LoginOpts = {}): Promise<string> {
  const email = opts.email || actors.eisOnly(i);
  await loginAndLand(page, email, opts.landingRoute || '/EISDashboard', opts.timeoutMs);
  return email;
}

/** Seeded participant email convention (seed-test-project.js: `participant<idx>+<TESTRUNID>@example.com`). */
export function participantEmail(i = 0): string {
  return `participant${i}+${TESTRUNID}@example.com`;
}
