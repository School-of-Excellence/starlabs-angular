// web-invitation.page.ts — page object for the PARTICIPANT web studio-invitation accept/deny overlay.
//
// VERDICT (recon studio.md §5): accept/deny IS a WEB route, fully drivable by Playwright — it does
// NOT require the participant simulator. The overlay is `WebStudioInvitationComponent`
// (src/app/web-studio-invitation/web-studio-invitation.component.{ts,html}), mounted at route
// `/queue-web` (QueueWebVersion1Component, app.routes.ts:319). So this page object exposes the full
// surface: open(token), isShown(), accept(), deny(). The participant-sim (e2e/lib/participant-sim.js)
// is a FALLBACK only (write `studioinvitation.clientresponse` directly) when a second browser
// context is impractical — it is NOT used here.
//
// ANTI-CIRCULARITY (the point of the rebuild): this page object only (a) DRIVES the real Angular UI
// (real testid locator → real click) and (b) READS render state the APP computed (overlay visible /
// success modal visible / the stage name the app bound). It NEVER asserts `read == X` right after
// writing `X`. The product reaction to accept/deny — a `live assignment` + pairing flip on accept,
// NOTHING on deny (dynamic-studio.ts:559-576) — is asserted by the SPEC against the CF/app OUTPUT
// against a KNOWN seeded precondition, not in here.
//
// HOW THE OVERLAY APPEARS (do not fake it): the component's own listener
// (web-studio-invitation.component.ts:49-103) opens the overlay PURELY from the `studioinvitation`
// Firestore stream — query `profileid==P && queueref==Q && clientresponse==null && expirydate>now`.
// A spec causes that doc via the REAL specialist "Bring To Studio" action (SS-04, the product path),
// then drives this overlay. Because the listener is an `onSnapshot` stream, every visibility read
// here uses `expect.poll` (per SHARED CONVENTIONS: collectionData / live streams are async).
//
// SELECTORS — testid-first (testids.md → web-studio-invitation.component.html):
//   web-inv-overlay     `.inv-overlay`        — shown iff `studioInvitation && !invitationAccepted` (html:2)
//   web-inv-accept-btn  `.inv-btn--accept`    — `acceptInvitation()` → clientresponse:'approved' (html:53, ts:117-124)
//   web-inv-later-btn   `.inv-btn--later`     — onJoinLater() then confirmJoinLater() → 'denied' (html:56-58, ts:126-136)
//   web-inv-success-btn success "Got it"      — closes the post-accept modal (html:89)
// The success backdrop (`.inv-success-backdrop`/`.inv-success-dialog`, html:64-91) has NO testid; the
// only hooked element inside it is `web-inv-success-btn`, so post-accept success is detected by that
// button's visibility. The stage-name span (`.inv-stage-name`, html:11/23) has NO testid either — see
// RISKS; stageName() falls back to that stable class.

import { expect, Locator, Page } from '@playwright/test';
import { loginAsBigParticipant, LANDING_ROUTES, LoginOpts } from '../support/auth';
import { TESTRUNID } from '../support/actors';

/** Route that hosts <app-web-studio-invitation> (auth.ts LANDING_ROUTES.bigParticipant === '/queue-web'). */
const QUEUE_WEB_ROUTE = LANDING_ROUTES.bigParticipant; // '/queue-web'

/** data-testid values shipped on the real template (recon testids.md). */
const TID = {
  overlay: 'web-inv-overlay',
  accept: 'web-inv-accept-btn',
  later: 'web-inv-later-btn',
  success: 'web-inv-success-btn',
} as const;

/** Identifies which seeded participant to land on /queue-web as. `index` maps to the seeder's
 *  `participant<index>+<TESTRUNID>@example.com` (auth.ts participantEmail); `email` overrides it.
 *  This is the participant the `studioinvitation` was created FOR (its `profileid`). */
export interface ParticipantIdentity {
  /** 0-based seeded participant index (seeder: participant0..participantN). Default 0. */
  index?: number;
  /** Explicit participant email (overrides `index`). */
  email?: string;
}

export class WebInvitationPage {
  readonly page: Page;
  readonly overlay: Locator;
  readonly acceptBtn: Locator;
  readonly laterBtn: Locator;
  readonly successBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.overlay = page.locator(`[data-testid="${TID.overlay}"]`);
    this.acceptBtn = page.locator(`[data-testid="${TID.accept}"]`);
    this.laterBtn = page.locator(`[data-testid="${TID.later}"]`);
    this.successBtn = page.locator(`[data-testid="${TID.success}"]`);
  }

  /**
   * Log in as the invited participant and land on /queue-web (the route hosting the overlay).
   *
   * `token` selects WHICH participant — by 0-based seeded index, by explicit email, or (default) 0.
   * The overlay itself is NOT opened by this call: it appears only once a matching `studioinvitation`
   * exists in Firestore (created by the REAL specialist "Bring To Studio" action, SS-04). Sequencing
   * is the spec's job — typically: seed/cause the invite, THEN `open(participant)`, THEN `isShown()`.
   *
   * baseURL is supplied by the Playwright config (never a hardcoded project id) — loginAsBigParticipant
   * navigates relative to it and waits for the /queue-web guard to admit the participant.
   *
   * @returns the participant email actually logged in as.
   */
  async open(token: ParticipantIdentity = {}, opts: LoginOpts = {}): Promise<string> {
    // PRECONDITION: the participant route grant (see ensureQueueWebRouteGrant) must exist BEFORE login,
    // or the authGuard denies /queue-web and the overlay component never mounts (the SS-05..SS-08 timeout).
    await ensureQueueWebRouteGrant();
    const email = await loginAsBigParticipant(this.page, token.index ?? 0, {
      ...opts,
      email: token.email ?? opts.email,
      landingRoute: opts.landingRoute ?? QUEUE_WEB_ROUTE,
    });
    return email;
  }

  /**
   * Is the invite overlay currently shown? This is an APP-COMPUTED render decision: the template
   * renders `.inv-overlay` iff `studioInvitation && !invitationAccepted` (html:2) — i.e. iff the
   * component's Firestore listener matched a live, unexpired, unanswered invite for this participant.
   * Reading it (rather than a value the test wrote) keeps SS-05 anti-circular.
   *
   * Single-shot truth — use `waitUntilShown()` for the async stream settle.
   */
  async isShown(): Promise<boolean> {
    return this.overlay.isVisible();
  }

  /**
   * Poll until the overlay is shown (the `onSnapshot` stream is async — SHARED CONVENTIONS require
   * expect.poll for stream-driven reads). Use after the spec has caused the `studioinvitation`.
   * @param timeout ms (default 30000 — covers Firestore stream + CF fan-out latency).
   */
  async waitUntilShown(timeout = 30_000): Promise<void> {
    await expect
      .poll(() => this.isShown(), {
        timeout,
        message: 'web studio-invitation overlay did not appear (studioinvitation stream never matched this participant)',
      })
      .toBe(true);
  }

  /** Poll until the overlay is GONE (e.g. after deny/expiry the component `_closeInvitation()`s it). */
  async waitUntilHidden(timeout = 30_000): Promise<void> {
    await expect
      .poll(() => this.isShown(), { timeout, message: 'web studio-invitation overlay did not close' })
      .toBe(false);
  }

  /**
   * The stage name the APP bound into the overlay (`studioInvitation.stage`, html:11/23). Reads what
   * the app rendered from the invite stream — safe to assert against the KNOWN seeded token stage.
   * NOTE: no testid exists for this span (see RISKS); anchored on the stable `.inv-stage-name` class
   * scoped inside the overlay.
   */
  async stageName(): Promise<string> {
    return (await this.overlay.locator('.inv-stage-name').first().innerText()).trim();
  }

  /**
   * ACCEPT the invitation (real click). The component sets `invitationAccepted=true` (the overlay
   * disappears immediately, `*ngIf="...&& !invitationAccepted"`) and writes
   * `studioinvitation.clientresponse:'approved'` (ts:120-122); the success modal
   * (`web-inv-success-btn`) then renders (`*ngIf="invitationAccepted"`, html:64). Back in the
   * specialist's /dynamicstudio, the listener (`createdby==profileid`) reacts by calling
   * `assignStudio()` → the §3a `live assignment` + pairing flip — assert THAT product output in the
   * spec, not here.
   *
   * We DRIVE the real click and confirm the APP's own post-accept render (the success modal). We do
   * NOT read back the value we triggered.
   */
  async accept(): Promise<void> {
    await this.waitUntilShown();
    await this.acceptBtn.click();
    // App-computed confirmation: the overlay closes and the success modal renders.
    await this.waitUntilHidden();
    await expect(this.successBtn).toBeVisible();
  }

  /**
   * DENY the invitation via the real two-step "I'll join later" → "Confirm Join Later" flow.
   * The single `.inv-btn--later` button is reused across both states (html:56-58):
   *   1st click → onJoinLater() flips `joinLaterConfirm=true` (label becomes "Confirm Join Later");
   *   2nd click → confirmJoinLater() writes `clientresponse:'denied'` (ts:131-135) then closes.
   * Both are REAL clicks. The product reaction is NONE — no `live assignment` (dynamic-studio.ts:
   * 573-576 only alerts) — which the spec asserts against the seeded precondition.
   */
  async deny(): Promise<void> {
    await this.waitUntilShown();
    await this.laterBtn.click(); // onJoinLater(): show the confirmation state
    // The same button now confirms the denial; the spec drives the second REAL click.
    await this.laterBtn.click(); // confirmJoinLater(): writes clientresponse:'denied' + closes
    // App-computed confirmation: deny closes the overlay and shows NO success modal.
    await this.waitUntilHidden();
    await expect(this.successBtn).toBeHidden();
  }

  /** Dismiss the post-accept success modal ("Got it, Thanks!" → `_closeInvitation()`, html:89). */
  async dismissSuccess(): Promise<void> {
    await this.successBtn.click();
  }
}

/**
 * PRECONDITION: grant the participant role access to `/queue-web` via a `dashboard` route-config doc.
 *
 * WHY (root cause of the SS-05..SS-08 "overlay never appeared" timeout): the participant lands on
 * `/queue-web` (QueueWebVersion1Component), which is `canActivate: [authGuard]` (app.routes.ts:319).
 * The authGuard resolves the route's allowed roles/profileids from the `dashboard` collection
 * (`routeConfig(cleanUrl)`, authguard.service.ts:320-348) where `cleanUrl == '/queue-web'`. The shared
 * seeder grants every OTHER driven screen a `dashboard` doc (DRIVEN_ROUTES, seed-test-project.js:143)
 * but OMITS `/queue-web`, so `routeConfig('/queue-web')` returns EMPTY roles + EMPTY profiles → the
 * guard's `hasAccess` is false AND both lists are empty → it opens the "No roles or profiles configured"
 * dialog and returns false (auth.guard.ts). Navigation is cancelled with NO redirect (the
 * `router.navigate(['/EISDashboard'])` line is commented out), so the URL can still read `/queue-web`
 * (letting open()'s waitForURL pass) while the component is BLOCKED from mounting — the overlay listener
 * never starts and `waitUntilShown` times out.
 *
 * This writes the missing route-config doc granting the `participant` role (every seeded participant's
 * users_roles doc carries `participant:true`, so `getRoles()` → `rolesArray` includes 'participant',
 * making `hasAccess` true). It is PRECONDITION SETUP ONLY — route infrastructure the seeder should have
 * provided — exactly the same category as the spec's existing `getDocRefUpdate` / `ensureStageAcceptsSeededForm`
 * precondition writes, and it is asserted by NOTHING (the specs assert the app/CF accept/deny output).
 * Verified live: with this doc the guard logs `has access: true` and admits the participant; without it the
 * participant is denied and the overlay never renders. ALSO returned as a seedRequest so the shared seeder
 * grants `/queue-web` natively (then this becomes an idempotent no-op).
 *
 * Idempotent (deterministic doc id, merge). Goes through the allowlist-guarded participant-sim handle, so
 * it can only ever touch the dedicated test project / emulator (never production).
 */
async function ensureQueueWebRouteGrant(): Promise<void> {
  // participant-sim lives at e2e/lib/ — this page object is at e2e/queue/pages/, so it is TWO levels up
  // (the specs that require it are at e2e/queue/, hence their `../lib`; a page object needs `../../lib`).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { db } = require('../../lib/participant-sim');
  const docId = `${TESTRUNID}_dash__queue_web`;
  await db()
    .collection('dashboard')
    .doc(docId)
    .set(
      {
        route: '/queue-web',
        label: 'Queue Web (participant overlay)',
        // Grant by the participant ROLE (every seeded participant has users_roles.participant==true), so the
        // guard's role check (rolesArray.some(r => routeConfigRoles.includes(r))) admits ALL participants.
        roles: ['participant'],
        profileid: [],
        showInSidenav: false,
        order: 0,
        children: [],
        testrunid: TESTRUNID,
        _testdata: true,
      },
      { merge: true },
    );
}

/** Convenience factory mirroring the suite's lightweight style. */
export function webInvitationPage(page: Page): WebInvitationPage {
  return new WebInvitationPage(page);
}
