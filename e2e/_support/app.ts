import { Page, expect } from '@playwright/test';
import { assertNotExcluded } from './excluded-routes';

// Test users that match e2e/fixtures/firestore-seed.json (emulator only).
export const TEST_USERS = {
  admin:       { email: 'admin@example.test', password: 'Test123!', profileid: 'prof-admin' },
  participant: { email: 'participant@example.test', password: 'Test123!', profileid: 'prof-participant' },
};

/**
 * Sign in via the app's /login screen (Firebase Auth, email/password).
 * TODO(D-002): the app must connect to the Auth+Firestore emulator (connectAuthEmulator/connectFirestoreEmulator
 * behind an env flag) and the seed must create these Auth users. Until then these specs are skip-guarded.
 */
export async function login(page: Page, who: keyof typeof TEST_USERS): Promise<void> {
  const u = TEST_USERS[who];
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(u.email);
  await page.getByLabel(/password/i).fill(u.password);
  await page.getByRole('button', { name: /log\s?in|sign\s?in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Navigate to an in-app route, refusing ATC-excluded ones. */
export async function goToRoute(page: Page, route: string): Promise<void> {
  assertNotExcluded(route);
  await page.goto(route);
}
