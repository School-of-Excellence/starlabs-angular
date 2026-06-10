// metadata-cf-deep.spec.ts — DEEPER productsdata_to_pmd projections (the CF the first pass only touched
// for activeproduct[] in PA-CF-03). productsdata_to_pmd rebuilds the WHOLE product rollup on the profile
// across all its participantsproduct rows (participantmetadata.js:523-569):
//   • status "completed"        -> consumedproducts[]
//   • status "ongoing"/"initiated" -> activeproduct[]
//   • status null               -> unconsumedproducts[]
//   • productcount[productId]   -> how many rows reference that product
//
//   PA-CF-04 flipping the product ongoing->completed moves its id from activeproduct[] to
//            consumedproducts[] (the CF recomputed both arrays from the row set).
//   PA-CF-05 a SECOND participantsproduct row for the same product makes the CF's productcount map read
//            2 for that product id (the CF aggregated across rows).
//
// CF-side-effect, no browser. We drive the seeded inputs on a DEDICATED profile (prodProfile, off p0/p1)
// and assert the CF output, never a value the test wrote. The CF only fires on a real status/package
// change (participantmetadata.js:495), so each helper makes the subsequent change a true change. The
// SalesCRM webhook inside the CF is swallowed server-side (recon §External) — we assert Firestore only.
import { test, expect } from '@playwright/test';
import {
  profProfileIds, profDocIds, resetProductCf, setProductCfStatus, addProductCfSibling, deleteProductCfSibling,
} from './support/profiles';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.PROF_RUNID || 'prof';
const CF_TIMEOUT = 60_000;
const P1 = profDocIds.P1; // the products doc id PPCF points at (run-prefixed)
const P2 = profDocIds.P2; // a second products doc id

test.describe('Profiles — productsdata_to_pmd deep projections (assert CF output)', () => {
  // Each case owns the product-CF subject; reset to a single ongoing P1 row before mutating.
  test.beforeEach(async () => { await resetProductCf(); });
  test.afterEach(async () => { await deleteProductCfSibling(); });

  // ===========================================================================================
  // PA-CF-04 — ongoing -> completed moves the product id activeproduct[] -> consumedproducts[]
  // ===========================================================================================
  test('PA-CF-04 completing the product moves its id from activeproduct[] to consumedproducts[]', async () => {
    // Baseline after reset: the single ongoing row puts P1 in activeproduct[] (the CF computed this).
    await pollUntil(
      () => getDoc('participant metadata', profProfileIds.prodProfile),
      (d) => !!d && Array.isArray(d.activeproduct) && (d.activeproduct as string[]).includes(P1),
      { label: 'PA-CF-04 (pre): activeproduct[] includes P1 while ongoing', timeoutMs: CF_TIMEOUT, intervalMs: 1000 },
    );

    // Flip the row to completed — the action productsdata_to_pmd reacts to.
    await setProductCfStatus('completed');

    // [ASSERT] the CF recomputed both arrays: P1 now in consumedproducts[] and OUT of activeproduct[].
    const md = await pollUntil(
      () => getDoc('participant metadata', profProfileIds.prodProfile),
      (d) => !!d
        && Array.isArray(d.consumedproducts) && (d.consumedproducts as string[]).includes(P1)
        && Array.isArray(d.activeproduct) && !(d.activeproduct as string[]).includes(P1),
      { label: 'PA-CF-04: consumedproducts[] gains P1 and activeproduct[] drops it', timeoutMs: CF_TIMEOUT, intervalMs: 1000 },
    );
    expect(md!.consumedproducts, 'PA-CF-04: CF moved P1 into consumedproducts[]').toContain(P1);
    expect(md!.activeproduct, 'PA-CF-04: CF removed P1 from activeproduct[]').not.toContain(P1);
  });

  // ===========================================================================================
  // PA-CF-05 — the productcount map aggregates across rows referencing the same product
  // ===========================================================================================
  test('PA-CF-05 a second row for the same product makes the CF productcount map read 2', async () => {
    // Baseline after reset: one ongoing P1 row -> productcount[P1] == 1 (the CF computed this).
    await pollUntil(
      () => getDoc('participant metadata', profProfileIds.prodProfile),
      (d) => !!d && !!(d.productcount as Record<string, number> | undefined) && (d.productcount as Record<string, number>)[P1] === 1,
      { label: 'PA-CF-05 (pre): productcount[P1] == 1 with one row', timeoutMs: CF_TIMEOUT, intervalMs: 1000 },
    );

    // Add a SECOND participantsproduct row for the SAME product (P1), ongoing — the CF re-aggregates.
    await addProductCfSibling(P1, 'ongoing');

    // [ASSERT] the CF's productcount map now reads 2 for P1 (aggregated across the two rows).
    const md = await pollUntil(
      () => getDoc('participant metadata', profProfileIds.prodProfile),
      (d) => !!d && !!(d.productcount as Record<string, number> | undefined) && (d.productcount as Record<string, number>)[P1] === 2,
      { label: 'PA-CF-05: productcount[P1] == 2 after a second row', timeoutMs: CF_TIMEOUT, intervalMs: 1000 },
    );
    expect((md!.productcount as Record<string, number>)[P1], 'PA-CF-05: CF aggregated productcount across rows').toBe(2);
  });
});
