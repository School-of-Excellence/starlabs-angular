// wishlist-form.spec.ts — the PUBLIC Evolution Wishlist Form (/evolutionwishlist, NO authGuard): a
// participant-facing shareable link. Three cases:
//   • PM-19 invalid link        → the app renders its computed "Invalid link" error state.
//   • PM-08 submit              → the app writes the matching contact submitted:true + wishlistquestionmap.
//   • PM-09 CF auto-complete    → evolutionFamilyWishlistOnWrite flips status→'completed' (skip-guarded:
//                                 this CF is NOT in the test project's deployed set).
//
// Recon: e2e/recon-allcomp/product-modes.md (PM-08, PM-09, PM-19). The form
// (evolution-wishlist-form.component.ts) parses ?data=JSON({docid,contact,profilename}), loads
// evolutionwishlistlog/<docid> + the enabled evolutionwishlistquestions, and on Submit writes the
// updated contact back (:244-278). NB: the public route has no authGuard, so these cases do NOT log in.
//
// Anti-circularity:
//   • PM-19 asserts the app's OWN error state from a missing-docid link (no Firestore write at all).
//   • PM-08 seeds the contact submitted:false → asserts the APP wrote submitted:true + a non-empty
//     wishlistquestionmap. Never the seeded false. We seed status:'sended' (NEVER 'sent'), so the CF's
//     external-send branch is never reached → no real Wati/Postmark.
//   • PM-09 seeds status:'sended' + the contact already 'received' → asserts the CF-written
//     status:'completed' (the all-contacts-received branch). The trivial re-trigger write is a
//     precondition mutation, never the asserted value.
import { test, expect } from '@playwright/test';
import {
  installModeStubs, modeIds, modeContent, modeProfileIds,
  resetWishlistFormSubject, resetWishlistCfDoneSubject, encodeWishlistFormData, isWishlistCfDeployed,
} from './support/modes';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.MODE_RUNID || 'mode';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const seed = require('../fixtures/seed-test-project');

test.describe('Modes — public Evolution Wishlist Form (submit write + invalid link; CF gated)', () => {
  // ===========================================================================================
  // PM-19 — a link with no docid renders the app's "Invalid link" error state (no write)
  // ===========================================================================================
  test('PM-19 an invalid/expired wishlist link renders the Invalid-link error state', async ({ page }) => {
    // No console-guard assertion: the form may log a benign parse/read note on the invalid-link path.
    await installModeStubs(page);
    // data={} is valid JSON but carries no docid → the constructor's else-branch sets
    // formSubmitionStatus='documentnull' + errormessage='Invalid link' (evolution-wishlist-form.ts:107-110).
    // (A wholly-missing ?data would throw in JSON.parse; {} exercises the app's intended guard cleanly.)
    await page.goto(`/evolutionwishlist?data=${encodeURIComponent('{}')}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/evolutionwishlist/, { timeout: 30_000 });

    // [ASSERT] the app rendered its error state — the <h1>{{errormessage}}</h1> in .error-message.
    await expect(page.locator('.error-message'), 'PM-19: the invalid-link error panel must render').toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.error-message'), 'PM-19: the computed error message reads "Invalid link"').toContainText(/invalid link/i);
    // The form itself must NOT render (no form-container in the documentnull state).
    await expect(page.locator('.form-container'), 'PM-19: no form is shown on an invalid link').toHaveCount(0);
  });

  // ===========================================================================================
  // PM-08 — submitting the form marks the matching contact submitted:true + wishlistquestionmap
  // ===========================================================================================
  test('PM-08 submitting the public form marks the contact submitted:true with a wishlistquestionmap', async ({ page }) => {
    const guard: ConsoleGuard = attachConsoleGuard(page);
    await installModeStubs(page);

    // Precondition (anti-circular): the wishlist doc is status:'sended' with the single gmail contact
    // submitted:false. Reset so the assertion is re-run-stable (and never 'sent' → no external send).
    await resetWishlistFormSubject(modeIds.EWL_FORM, modeProfileIds.participant0, modeContent.formContact);
    const before = await getDoc('evolutionwishlistlog', modeIds.EWL_FORM);
    const beforeContact = (before!.contacts as Record<string, unknown>[]).find((c) => c.contact === modeContent.formContact);
    expect(beforeContact!.submitted, 'PM-08: seeded contact starts submitted:false').not.toBe(true);

    // Build the public link the responder would receive: ?data=JSON({docid, contact, profilename}).
    const data = encodeWishlistFormData(modeIds.EWL_FORM, modeContent.formContact, `participant0+${RUN}@example.com`);
    await page.goto(`/evolutionwishlist?data=${data}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/evolutionwishlist/, { timeout: 30_000 });

    // [REAL-UI] the form renders one enabled textarea question (controlName == the seeded question doc
    // id). Fill it so the form becomes valid, then click Submit. The Submit button is disabled until
    // form.valid && questions.length>0.
    await expect(page.locator('.form-container'), 'PM-08: the form must render for a valid link').toBeVisible({ timeout: 30_000 });
    const answer = page.locator('.form-container textarea').first();
    await expect(answer, 'PM-08: the seeded textarea question must render').toBeVisible({ timeout: 15_000 });
    await answer.fill('My wish for them is accelerated growth.');
    const submit = page.getByRole('button', { name: /Submit/i });
    await expect(submit, 'PM-08: Submit enables once the form is valid').toBeEnabled({ timeout: 10_000 });
    await submit.click();

    // The success panel confirms the app processed the submit.
    await expect(page.locator('.success-message'), 'PM-08: the submit success panel must render').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the app's updateDoc wrote the matching contact submitted:true + a non-empty
    // wishlistquestionmap. Polled — the value the PRODUCT wrote (test seeded submitted:false).
    const after = await pollUntil(
      () => getDoc('evolutionwishlistlog', modeIds.EWL_FORM),
      (d) => {
        if (!d) return false;
        const c = (d.contacts as Record<string, unknown>[]).find((x) => x.contact === modeContent.formContact);
        return !!c && c.submitted === true;
      },
      { label: 'PM-08: form contact → submitted:true', timeoutMs: 30_000 },
    );
    const contact = (after!.contacts as Record<string, unknown>[]).find((x) => x.contact === modeContent.formContact)!;
    expect(contact.submitted, 'PM-08: the app marked the contact submitted').toBe(true);
    const qmap = contact.wishlistquestionmap as Record<string, unknown> | undefined;
    expect(qmap && Object.keys(qmap).length, 'PM-08: the app stored a non-empty wishlistquestionmap').toBeTruthy();

    // No FATAL console error (a clean public form). assertNoFatal after the assertions so a render error
    // would still surface the functional failure first.
    assertNoFatal(guard, 'PM-08 wishlist form submit: no fatal console errors / pageerrors');
  });

  // ===========================================================================================
  // PM-09 — CF evolutionFamilyWishlistOnWrite auto-completes when all contacts are received
  //   (SKIP-GUARDED: this App-Engagement CF is NOT deployed to the test project — only
  //    calculateParticipantMode + the *_to_pmd family + the queue CFs are.)
  // ===========================================================================================
  test('PM-09 all-contacts-received triggers the wishlist CF to write status:"completed"', async () => {
    // Runtime CF-liveness probe: if evolutionFamilyWishlistOnWrite is not deployed, skip with a reason
    // (per the harness rule: gate CF cases whose CF is not deployed). Confirmed NOT deployed at authoring
    // time; this guard keeps the case correct if a future deploy adds it.
    const deployed = await isWishlistCfDeployed();
    test.skip(!deployed,
      'evolutionFamilyWishlistOnWrite (wishlist.js) is not deployed to slabs-queue-e2e-exdcz — the ' +
      'test project deploys only calculateParticipantMode + the *_to_pmd family + the queue CFs. ' +
      'Seeded preconditions remain; this asserts the CF-written status:"completed" when it is deployed.');

    // Precondition (anti-circular): status:'sended' with the single contact already 'received' (the
    // all-received tally the CF :91 branch checks). NEVER 'sent'.
    await resetWishlistCfDoneSubject(modeIds.EWL_CFDONE, modeProfileIds.participant1, modeContent.cfContact);
    const before = await getDoc('evolutionwishlistlog', modeIds.EWL_CFDONE);
    expect(before!.status, 'PM-09: subject starts status:"sended"').toBe('sended');

    // [TRIGGER] a trivial re-trigger write (admin) so the onWrite CF re-evaluates. This is a precondition
    // mutation, not the asserted value.
    const admin = seed.initAdmin();
    await admin.firestore().collection('evolutionwishlistlog').doc(modeIds.EWL_CFDONE)
      .update({ _retrigger: Date.now() });

    // [ASSERT] the CF wrote status:'completed' (all contacts received). Polled up to 60s (cloud CF latency).
    const after = await pollUntil(
      () => getDoc('evolutionwishlistlog', modeIds.EWL_CFDONE),
      (d) => !!d && d.status === 'completed',
      { label: 'PM-09: wishlist CF → status:"completed"', timeoutMs: 60_000, intervalMs: 1500 },
    );
    expect(after!.status, 'PM-09: the CF computed the completed status').toBe('completed');
  });
});
