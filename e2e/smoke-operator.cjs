// Operator end-to-end smoke: login -> land in app -> open the queue manager board.
const { chromium } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'http://localhost:4200';
const EMAIL = process.env.EMAIL || 'admin+run1@example.com';
const PASS = process.env.PASS || 'Test!1234';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [], dialogs = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.message || e).slice(0, 160)));
  page.on('dialog', async d => { dialogs.push(d.type() + ': ' + d.message().slice(0, 160)); await d.accept().catch(() => {}); });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('input[type="email"], input[formcontrolname="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[formcontrolname="password"]').first().fill(PASS);
  await page.getByRole('button', { name: /login/i }).click().catch(() => {});
  await page.waitForTimeout(7000);
  const afterLogin = page.url();
  const loggedIn = !afterLogin.includes('/login');
  console.log('after-login url :', afterLogin, '| loggedIn:', loggedIn);

  let boardUrl = '', boardBody = '';
  if (loggedIn) {
    await page.goto(BASE + '/dynamicqueuemanager', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(6000);
    boardUrl = page.url();
    boardBody = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
    await page.screenshot({ path: 'smoke-operator-board.png', fullPage: false }).catch(() => {});
  }
  console.log('board url       :', boardUrl);
  console.log('board reached?  :', boardUrl.includes('dynamicqueuemanager'));
  console.log('board body      :', JSON.stringify(boardBody));
  console.log('dialogs (' + dialogs.length + '):'); dialogs.slice(0, 8).forEach(d => console.log('   • ' + d));
  console.log('errors (' + errors.length + '):'); errors.slice(0, 10).forEach(e => console.log('   • ' + e));
  await browser.close();
  process.exit(0);
})();
