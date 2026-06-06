// Probe the board DOM after selecting the queue: find how per-stage names + counts render.
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:4200';
const EMAIL = process.env.EMAIL || 'admin+run1@example.com';
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  await page.goto(BASE);
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill('Test!1234');
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 30000 });
  await page.goto(BASE + '/dynamicqueuemanager', { waitUntil: 'domcontentloaded' });
  await page.getByText('TEST 30-stage L3rqCr', { exact: false }).first().click();
  await page.waitForTimeout(6000);
  // Dump candidate stage/count structures: elements whose text looks like "Stage (N)" or has a count badge.
  const info = await page.evaluate(() => {
    const out = { classes: {}, stageLike: [], totals: [] };
    document.querySelectorAll('*').forEach(el => {
      const t = (el.className && typeof el.className === 'string') ? el.className : '';
      if (/stage|column|count|badge|token|kanban|card/i.test(t)) out.classes[t] = (out.classes[t] || 0) + 1;
    });
    // text nodes like "Something (12)"
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length === 0) {
        const tx = (el.textContent || '').trim();
        if (/^\(?\d+\)?$/.test(tx) && tx.length <= 4) out.totals.push({ cls: el.className, tx });
        if (/\(\s*\d+\s*\)\s*$/.test(tx) && tx.length < 60) out.stageLike.push(tx);
      }
    });
    return out;
  });
  console.log('=== class names containing stage/column/count/badge/token/card ===');
  Object.entries(info.classes).sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([c,n]) => console.log(`  ${n}x  ${c}`));
  console.log('=== text like "Name (N)" (' + info.stageLike.length + ') ===');
  info.stageLike.slice(0, 40).forEach(t => console.log('  ' + t));
  console.log('=== bare number badges (' + info.totals.length + ') ===');
  info.totals.slice(0, 30).forEach(t => console.log(`  "${t.tx}"  cls=${t.cls}`));
  await b.close(); process.exit(0);
})();
