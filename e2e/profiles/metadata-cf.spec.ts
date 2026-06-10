// metadata-cf.spec.ts — Cloud-Function side-effect cases (the strongest anti-circular form: assert a
// value the deployed CF COMPUTED + WROTE to `participant metadata`, vs the seeded inputs).
//
//   PA-CF-01 profiledata_to_participantmetadata: mutating profile_data.name propagates to
//            participant metadata.name (participantmetadata.js:12). We change the name via the admin SDK
//            (NOT a value we then read back blind — we read the OTHER doc the CF wrote).
//   PA-CF-02 journey_to_pmd: a single ongoing journey with a future subscriptionend drives
//            participant metadata.customerstatus -> 'active' + activejourney -> the journeyref id
//            (participantmetadata.js:329-353). The CF computed the status from the journey set.
//   PA-CF-03 productsdata_to_pmd: an ongoing participantsproduct adds the product id to
//            participant metadata.activeproduct[] (participantmetadata.js:471+). The CF computed the array.
//
// These need NO browser; they drive the seeded Firestore inputs and assert the CF output. Webhook
// calls inside the CFs (SalesCRM/Watson) are swallowed server-side (recon §External / risk #9) — we
// assert the Firestore write, never the webhook. NO composite index required.
import { test, expect } from '@playwright/test';
import { profProfileIds, resetCfProfileName, setCfProfileName } from './support/profiles';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.PROF_RUNID || 'prof';

// CF triggers can take a few seconds to fire + write on the real test project.
const CF_TIMEOUT = 60_000;

test.describe('Profiles — participant-metadata Cloud Functions (assert CF output)', () => {
  // ===========================================================================================
  // PA-CF-01 — profile_data name change -> participant metadata name (sync CF)
  // ===========================================================================================
  test('PA-CF-01 mutating profile_data.name propagates to participant metadata.name', async () => {
    const cfPid = profProfileIds.cfProfile;
    // Precondition: reset to a known ORIGINAL name so the mutation below is a real change (the CF only
    // fires on a field change — recon gotcha #8). This is the seeded baseline, not the asserted value.
    const original = `CF Origin Name ${RUN}`;
    await resetCfProfileName(cfPid, original);

    // Mutate the name to a NEW unique value (the action the CF reacts to).
    const updated = `CF Updated Name ${RUN}-${Date.now()}`;
    await setCfProfileName(cfPid, updated);

    // [ASSERT] the CF wrote the new name through to participant metadata/<cfPid>.name
    // (participantmetadata.js:39-44). We poll the OTHER doc the CF wrote — never the profile_data we set.
    const after = await pollUntil(
      () => getDoc('participant metadata', cfPid),
      (d) => !!d && d.name === updated,
      { label: 'PA-CF-01: participant metadata.name synced by the CF', timeoutMs: CF_TIMEOUT },
    );
    expect(after!.name).toBe(updated);
  });

  // ===========================================================================================
  // PA-CF-02 — ongoing journey -> participant metadata.customerstatus 'active' + activejourney
  // ===========================================================================================
  test('PA-CF-02 the seeded ongoing journey drives participant metadata.customerstatus -> "active"', async () => {
    // The seeder wrote exactly ONE participantjourneyproduct for p0 (journeystatus:'ongoing',
    // journeyref:journey/<J1>, subscriptionend in the future) and journey_to_pmd fired on that write.
    // The CF's "active" path requires precisely: 1 ongoing journey, 0 cancelled, 0 completed, and a
    // future subscriptionend (participantmetadata.js:348). Assert the status the CF computed.
    const md = await pollUntil(
      () => getDoc('participant metadata', profProfileIds.p0),
      (d) => !!d && d.customerstatus === 'active',
      { label: 'PA-CF-02: customerstatus computed to "active" by journey_to_pmd', timeoutMs: CF_TIMEOUT },
    );
    expect(md!.customerstatus, 'PA-CF-02: CF computed customerstatus active').toBe('active');
    // The CF also set activejourney to the journeyref id it resolved (participantmetadata.js:350).
    expect(md!.activejourney, 'PA-CF-02: CF set activejourney to the seeded journey id').toBe(`${RUN}_J1`);
  });

  // ===========================================================================================
  // PA-CF-03 — ongoing product -> participant metadata.activeproduct[] includes the product id
  // ===========================================================================================
  test('PA-CF-03 the seeded ongoing product is added to participant metadata.activeproduct[]', async () => {
    // The seeder wrote participantsproduct PP0 (profileid:p0, productref:products/<P1>, status:'ongoing')
    // and productsdata_to_pmd fired on that write, computing the activeproduct/consumedproducts arrays.
    const md = await pollUntil(
      () => getDoc('participant metadata', profProfileIds.p0),
      (d) => !!d && Array.isArray(d.activeproduct) && (d.activeproduct as string[]).includes(`${RUN}_P1`),
      { label: 'PA-CF-03: activeproduct[] includes the seeded product id', timeoutMs: CF_TIMEOUT },
    );
    expect(md!.activeproduct, 'PA-CF-03: CF added the product id to activeproduct[]')
      .toContain(`${RUN}_P1`);
  });
});
