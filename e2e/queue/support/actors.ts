import { Page, expect } from '@playwright/test';

// The seeded test run. Override with TESTRUNID to point at a different seed.
export const TESTRUNID = process.env.TESTRUNID || 'run1';
export const PASSWORD = 'Test!1234';

// Staff actor emails follow the seeder's convention (see seed-test-project.js planSeed()).
export const actors = {
  operatorAdmin: `admin+${TESTRUNID}@example.com`,
  operatorMentor: `mentor+${TESTRUNID}@example.com`,
  specialist: (i = 0) => `specialist${i}+${TESTRUNID}@example.com`,
  big: (i = 0) => `big${i}+${TESTRUNID}@example.com`,
  // EIS-ONLY specialist: `changeagent` role, NONE of developer/admin/ah (seed-test-project.js makeStaff
  // eisOnly). Used by the SS-15b negative role-gate test to prove roleGuard denies a non-privileged actor.
  eisOnly: (i = 0) => `eisonly${i}+${TESTRUNID}@example.com`,
};

export const QUEUE_NAME = process.env.QUEUE_NAME || 'TEST 30-stage L3rqCr';

/** Log in through the real Angular login screen; resolves once routed off /login. */
export async function loginAs(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/');
  await page.locator('input[type="email"], input[formcontrolname="email"]').first().fill(email);
  await page.locator('input[type="password"], input[formcontrolname="password"]').first().fill(password);
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 30_000 });
}
