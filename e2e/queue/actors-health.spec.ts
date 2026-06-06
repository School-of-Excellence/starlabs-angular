// @ts-nocheck
// "Usable for every actor" health checks: each actor logs in and their primary screen
// renders without a FATAL runtime error. Stubbed externals (FCM/messaging, blocked
// notifications, network ERR_FAILED to stubbed endpoints) are ignored; a real uncaught
// app exception (pageerror) or a hard crash fails the test.
import { test, expect, Page } from '@playwright/test';
import { loginAs, actors } from './support/actors';

const IGNORABLE = [
  /messaging\/permission-blocked/i, /unable to fetch FCM/i,
  /ERR_FAILED/i, /Failed to load resource/i, /permission was not granted/i,
  /posthog/i, /picovoice/i,
];
const isFatal = (msg: string) => !IGNORABLE.some(re => re.test(msg));

const EVIDENCE = 'evidence';
async function openAsActor(page: Page, email: string, route: string, shot?: string) {
  const fatals: string[] = [];
  page.on('pageerror', e => { const m = (e.message || String(e)); if (isFatal(m)) fatals.push('PAGEERROR: ' + m.slice(0, 200)); });
  await loginAs(page, email);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const onRoute = page.url().includes(route.replace(/^\//, ''));
  const body = (await page.evaluate(() => document.body.innerText).catch(() => '')) || '';
  if (shot) await page.screenshot({ path: `${EVIDENCE}/${shot}.png`, fullPage: true }).catch(() => {});
  return { fatals, onRoute, body };
}

test.describe('All actors — primary screens are usable (render without fatal error)', () => {
  test('OPERATOR — Queue Manager board', async ({ page }) => {
    const r = await openAsActor(page, actors.operatorAdmin, '/dynamicqueuemanager', 'actor-operator-board');
    expect(r.onRoute, 'should stay on the board route (not bounced to /login)').toBeTruthy();
    expect(r.body).toContain('Queue Manager');
    expect(r.fatals, r.fatals.join('\n')).toHaveLength(0);
  });

  test('SPECIALIST — Dynamic Studio', async ({ page }) => {
    const r = await openAsActor(page, actors.specialist(0), '/dynamicstudio', 'actor-specialist-studio');
    expect(r.onRoute, 'specialist should reach the studio (role-gated)').toBeTruthy();
    expect(r.body.length, 'studio should render content').toBeGreaterThan(20);
    expect(r.fatals, r.fatals.join('\n')).toHaveLength(0);
  });

  test('SPECIALIST — Arena Studio Activity', async ({ page }) => {
    const r = await openAsActor(page, actors.specialist(0), '/arenastudioactivity', 'actor-specialist-arena');
    expect(r.onRoute).toBeTruthy();
    expect(r.fatals, r.fatals.join('\n')).toHaveLength(0);
  });

  test('BIG — BIG Dashboard', async ({ page }) => {
    const r = await openAsActor(page, actors.big(0), '/big-dashboard', 'actor-big-dashboard');
    expect(r.onRoute, 'BIG provider should reach the dashboard').toBeTruthy();
    expect(r.body.length, 'dashboard should render content').toBeGreaterThan(20);
    expect(r.fatals, r.fatals.join('\n')).toHaveLength(0);
  });

  test('BIG — Participant Assignment Board', async ({ page }) => {
    const r = await openAsActor(page, actors.big(0), '/particiant_assignment_board', 'actor-big-assignment');
    expect(r.onRoute).toBeTruthy();
    expect(r.fatals, r.fatals.join('\n')).toHaveLength(0);
  });
});
