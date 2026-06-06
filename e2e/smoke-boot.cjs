// Runtime boot smoke: load the served app, capture console/page errors, screenshot.
// Verifies the Angular app actually initializes against the test project (not just serves HTML).
const { chromium } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'http://localhost:4200';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.message || e).slice(0, 200)));
  const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => ({ _err: e.message }));
  await page.waitForTimeout(4000);
  const title = await page.title().catch(() => '?');
  const bodyText = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 400);
  const url = page.url();
  await page.screenshot({ path: 'smoke-boot.png', fullPage: false }).catch(() => {});
  console.log('HTTP status :', resp && resp.status ? resp.status() : JSON.stringify(resp));
  console.log('final url   :', url);
  console.log('title       :', title);
  console.log('body[0:400] :', JSON.stringify(bodyText));
  console.log('console/page errors (' + errors.length + '):');
  errors.slice(0, 15).forEach(e => console.log('   • ' + e));
  await browser.close();
  process.exit(0);
})();
