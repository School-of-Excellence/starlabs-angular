// Login smoke: sign in as a seeded operator/admin and see where the app lands
// (validates Firebase Auth + the app's post-login role/profile resolution against the test project).
const { chromium } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'http://localhost:4200';
const EMAIL = process.env.EMAIL;     // e.g. admin+<testrunid>@example.com
const PASS = process.env.PASS || 'Test!1234';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.message || e).slice(0, 160)));
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByPlaceholder(/email/i).fill(EMAIL).catch(async () => {
    await page.locator('input[type="email"], input[formcontrolname="email"]').first().fill(EMAIL);
  });
  await page.locator('input[type="password"], input[formcontrolname="password"]').first().fill(PASS);
  await page.getByRole('button', { name: /login/i }).click().catch(() => {});
  await page.waitForTimeout(7000);
  const url = page.url();
  const body = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 300);
  await page.screenshot({ path: 'smoke-login.png' }).catch(() => {});
  console.log('after-login url :', url);
  console.log('logged in?      :', !url.includes('/login'));
  console.log('body[0:300]     :', JSON.stringify(body));
  console.log('errors (' + errors.length + '):'); errors.slice(0, 12).forEach(e => console.log('   • ' + e));
  await browser.close();
  process.exit(0);
})();
