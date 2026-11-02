// Web screenshots for the WiSH / EI Solution ATC manuals. EMULATOR app only (localhost:4300).
'use strict';
const hubRequire = require('module').createRequire('/Users/m1/Documents/starlabs-e2e-tests/package.json');
const { chromium } = hubRequire('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:4300';
const OUT = path.join(__dirname, 'shots', 'web');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv.slice(2);
const tid = (id) => `[data-testid="${id}"]`;
const log = (...a) => console.log('[cap]', ...a);

function wav() {
  const n = 8000, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 3000), 44 + i * 2);
  return b;
}

async function shot(target, name, opts = {}) {
  const file = path.join(OUT, `${name}.jpg`);
  await target.screenshot({ path: file, type: 'jpeg', quality: 85, animations: 'disabled', ...opts });
  log('saved', name);
}
async function settle(page, ms = 1200) { await page.waitForTimeout(ms); }
async function closeDialog(page) {
  const dlg = page.locator('mat-dialog-container').last();
  if (!(await dlg.count())) return;
  for (const sel of [tid('ca-dialog-ref-1'), tid('mard-close-1'), tid('pabs-close')]) {
    const b = dlg.locator(sel); if (await b.count()) { await b.first().click(); await settle(page, 800); return; }
  }
  const b = dlg.getByRole('button', { name: /^\s*(Cancel|Close|close)\s*$/ });
  if (await b.count()) { await b.first().click(); await settle(page, 800); return; }
  await closeDialog(page);
}
async function tall(page, h) { await page.setViewportSize({ width: 1440, height: h }); await settle(page, 600); }

async function pick(page, select, labels, multiple = false) {
  const field = select.locator('xpath=ancestor::mat-form-field[1]');
  const panel = page.locator('.cdk-overlay-pane .mat-mdc-select-panel').last();
  for (let i = 0; i < 30 && !(await panel.isVisible()); i++) {
    if (await field.count()) await field.click(); else await select.click();
    await page.waitForTimeout(700);
  }
  for (const l of labels) await panel.locator('mat-option').filter({ hasText: l }).first().click();
  if (multiple) await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.locator(tid('lgn-email')).fill('kavya.rao@example.com');
  await page.locator(tid('lgn-password')).fill('Test!1234');
  await page.locator(tid('lgn-button-2')).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
  await settle(page, 2000);
}

async function startFresh(page) {
  const btn = page.locator(tid('atco-close'));
  try { await btn.waitFor({ state: 'visible', timeout: 6000 }); await btn.click(); await settle(page); } catch { /* no draft dialog */ }
}

async function openPrescribe(page, participant, model) {
  await page.goto(`${BASE}/prescribeATC`);
  const sel = page.locator(tid('patc-participant'));
  await sel.waitFor({ timeout: 30000 });
  for (let i = 0; i < 60 && (await sel.getAttribute('aria-disabled')) !== 'false'; i++) await page.waitForTimeout(500);
  await pick(page, sel, [participant]);
  await startFresh(page);
  const prod = page.locator(tid('patc-product'));
  for (let i = 0; i < 60 && (await prod.getAttribute('aria-disabled')) !== 'false'; i++) await page.waitForTimeout(500);
  await pick(page, prod, [new RegExp(`^\\s*${model}\\s*$`)]);
  await settle(page, 4000); // appointment lookup fills the specialists
}

async function sections(page, pre) {
  await page.locator(tid('patc-points')).scrollIntoViewIfNeeded(); await settle(page, 600);
  await shot(page, `${pre}-prescribe-notes`);
  await page.locator(tid('patc-visible-checkbox')).scrollIntoViewIfNeeded(); await settle(page, 600);
  await shot(page, `${pre}-prescribe-validation`);
  await shot(page, `${pre}-prescribe-panel`, { clip: { x: 1042, y: 62, width: 398, height: 838 } });
}

const steps = {
  async config(page) {
    await page.goto(`${BASE}/atcmodel`); await page.getByText('WiSH Clarity Call').first().waitFor({ timeout: 30000 }); await settle(page, 2500);
    await shot(page, 'cfg-atcmodel-list');
    await tall(page, 1500);
    for (const [name, file] of [['WiSH', 'cfg-atcmodel-dialog-wish'], ['EI Solution', 'cfg-atcmodel-dialog-ei']]) {
      const row = page.locator('tr').filter({ has: page.locator('td', { hasText: new RegExp(`^\\s*${name}\\s*$`) }) }).first();
      await row.locator(tid('va-on-edit-dialog-2')).click();
      const dlg = page.locator('mat-dialog-container').last();
      await dlg.waitFor(); await settle(page, 2000);
      await shot(dlg, file);
      await closeDialog(page);
    }
    await page.locator(tid('va-on-open-dialog-1')).click();
    const cdlg = page.locator('mat-dialog-container').last(); await cdlg.waitFor(); await settle(page, 1200);
    await shot(cdlg, 'cfg-atcmodel-dialog-create');
    await closeDialog(page);

    await tall(page, 900);
    await page.goto(`${BASE}/mapappointmentrole`); await page.getByText('WiSH Diagnostics').first().waitFor({ timeout: 30000 }); await settle(page, 2000);
    await shot(page, 'cfg-maprole-list');
    for (const [name, file] of [['WiSH Diagnostics', 'cfg-maprole-dialog-wish'], ['EI Solution Session', 'cfg-maprole-dialog-ei']]) {
      const row = page.locator('tr').filter({ hasText: name }).first();
      await tall(page, 1500);
      await row.locator(tid('mar-update-data-2')).click();
      const dlg = page.locator('mat-dialog-container').last(); await dlg.waitFor(); await settle(page, 2500);
      await shot(dlg, file);
      const card = dlg.locator(tid('mard-atc-card-3'));
      if (await card.count()) await shot(card, `${file}-atccard`);
      await closeDialog(page); await tall(page, 900);
    }

    await page.goto(`${BASE}/deliveryactivities`); await settle(page, 5000);
    const f = page.getByLabel('Filter'); if (await f.count()) { await f.first().fill('WiSH'); await settle(page, 1500); }
    await shot(page, 'cfg-delivery-forms');
    const fl = page.getByLabel('Filter'); if (await fl.count()) { await fl.first().fill('Life Report'); await settle(page, 1500); }
    const edit = page.locator(tid('ds1-edit-delivery-3')).first();
    if (await edit.count()) {
      await edit.click(); const dlg = page.locator('mat-dialog-container').last(); await dlg.waitFor(); await settle(page, 2500);
      await shot(dlg, 'cfg-delivery-form-dialog'); await closeDialog(page);
    }

    await page.goto(`${BASE}/bigactivity`); await settle(page, 5000);
    await shot(page, 'cfg-bigactivity');
    const be = page.locator(tid('bact-update-account-2')).first();
    if (await be.count()) {
      await be.click(); const dlg = page.locator('mat-dialog-container').last(); await dlg.waitFor(); await settle(page, 1500);
      await shot(dlg, 'cfg-bigactivity-dialog'); await closeDialog(page);
    }
  },

  async wishPrescribe(page) {
    await openPrescribe(page, 'Neha Kapoor', 'WiSH');
    await shot(page, 'wish-prescribe-top');
    const card = page.locator(tid('patc-outcome-card'));
    const rows = [['Health', 'Sleep by 10:30 pm on weeknights'], ['Career', 'Present at the quarterly review with confidence']];
    for (let i = 0; i < rows.length; i++) {
      await page.locator(tid('patc-outcome-area')).nth(i).fill(rows[i][0]);
      await page.locator(tid('patc-outcome-expected')).nth(i).fill(rows[i][1]);
      await page.locator(tid('patc-outcome-expected')).nth(i).blur();
    }
    await settle(page);
    await card.scrollIntoViewIfNeeded(); await shot(card, 'wish-prescribe-outcomes');
    const authors = page.locator('#atcfield-author');
    if (await authors.count()) { await authors.scrollIntoViewIfNeeded(); await settle(page, 500); await shot(page, 'wish-prescribe-specialists'); }
    const adj = page.locator(tid('patc-adj-0'));
    await adj.locator(tid('patc-adj-text')).fill('Protect the evening wind-down\n\nOutcome - Wakes up rested');
    await adj.locator(tid('patc-adj-text')).blur();
    await pick(page, adj.locator(tid('patc-adj-awareness')), [/^\s*Aware\s*$/]);
    await adj.locator(tid('patc-adj-years')).fill('2'); await adj.locator(tid('patc-adj-years')).blur();
    await pick(page, adj.locator(tid('patc-proc-name')).first(), ['Digital sunset at 9 pm']);
    await settle(page, 1500);
    await adj.scrollIntoViewIfNeeded(); await shot(adj, 'wish-prescribe-adjustment');
    await page.locator(tid('patc-points')).fill('Screens late at night; tired mornings');
    await page.locator(tid('patc-points')).blur();
    await page.locator(tid('patc-casenotes')).fill('Keen to start; prefers small daily steps.');
    await page.locator(tid('patc-casenotes')).blur();
    await page.locator(tid('patc-audio-input')).setInputFiles({ name: 'changework-brief.wav', mimeType: 'audio/wav', buffer: wav() });
    await settle(page, 4000);
    await sections(page, 'wish');
    await page.locator(tid('patc-submit')).click();
    const dlg = page.locator('mat-dialog-container').last();
    try { await dlg.waitFor({ timeout: 10000 }); await settle(page, 1000); await shot(dlg, 'wish-prescribe-confirm'); await page.locator(tid('aael-back')).click(); }
    catch { await shot(page, 'wish-prescribe-submit-blocked'); }
  },

  async eiPrescribe(page) {
    await openPrescribe(page, 'Arjun Pillai', 'EI Solution');
    await shot(page, 'ei-prescribe-top');
    const asks = [['Self', 'Stop raising my voice when deadlines slip'], ['Spouse', 'Be present at dinner instead of on the phone']];
    for (let i = 0; i < asks.length; i++) {
      if (i > 0) await page.locator(tid('patc-ask-add')).click();
      await pick(page, page.locator(tid('patc-ask-by')).nth(i), [asks[i][0]]);
      await page.locator(tid('patc-ask-for')).nth(i).fill(asks[i][1]);
      await page.locator(tid('patc-ask-for')).nth(i).blur();
    }
    await settle(page);
    const card = page.locator(tid('patc-ask-card')); await card.scrollIntoViewIfNeeded(); await shot(card, 'ei-prescribe-ask');
    const authors = page.locator('#atcfield-author');
    if (await authors.count()) { await authors.scrollIntoViewIfNeeded(); await settle(page, 500); await shot(page, 'ei-prescribe-specialists'); }
    const adj = page.locator(tid('patc-adj-0'));
    await adj.locator(tid('patc-adj-text')).fill('Pause before responding under pressure');
    await adj.locator(tid('patc-adj-text')).blur();
    await pick(page, adj.locator(tid('patc-adj-awareness')), [/^\s*Unaware\s*$/]);
    await adj.locator(tid('patc-adj-years')).fill('4'); await adj.locator(tid('patc-adj-years')).blur();
    await pick(page, adj.locator(tid('patc-proc-name')).first(), ['Pause-and-name the feeling']);
    await settle(page, 1500);
    await adj.scrollIntoViewIfNeeded(); await shot(adj, 'ei-prescribe-adjustment');
    await page.locator(tid('patc-points')).fill('Snaps when interrupted; regrets it later');
    await page.locator(tid('patc-points')).blur();
    await page.locator(tid('patc-casenotes')).fill('Open to feedback from spouse.');
    await page.locator(tid('patc-casenotes')).blur();
    await page.locator(tid('patc-audio-input')).setInputFiles({ name: 'changework-brief.wav', mimeType: 'audio/wav', buffer: wav() });
    await settle(page, 4000);
    await sections(page, 'ei');
    await page.locator(tid('patc-submit')).click();
    const dlg = page.locator('mat-dialog-container').last();
    try { await dlg.waitFor({ timeout: 10000 }); await settle(page, 1000); await shot(dlg, 'ei-prescribe-confirm'); await page.locator(tid('aael-back')).click(); }
    catch { await shot(page, 'ei-prescribe-submit-blocked'); }
  },

  async view(page) {
    await page.goto(`${BASE}/viewprescribedATC`);
    await page.locator(tid('vatc-forms-count')).first().waitFor({ timeout: 30000 }); await settle(page, 2500);
    await shot(page, 'view-list');
    for (const [who, pre] of [['Asha Menon', 'wish'], ['Rahul Verma', 'ei']]) {
      const row = page.locator('[data-testid^="vatc-row-"]').filter({ hasText: who }).first();
      await row.scrollIntoViewIfNeeded(); await shot(row, `${pre}-view-collapsed`);
      await row.locator(tid('vatc-toggle-full')).click();
      await page.locator(tid('vatc-forms-card')).first().waitFor({ timeout: 30000 }); await settle(page, 2500);
      await shot(page.locator(tid('vatc-forms-card')).first(), `${pre}-view-forms-card`);
      const tpl = page.locator(tid(pre === 'wish' ? 'vatc-outcome-card' : 'vatc-ask-card')).first();
      if (await tpl.count()) await shot(tpl, `${pre}-view-template-card`);
      if (pre === 'ei') {
        const rc = page.locator(tid('vatc-review-card')).first();
        await rc.scrollIntoViewIfNeeded(); await shot(rc, 'ei-view-review-log');
        await rc.locator(tid('vatc-review-text')).fill('Check-in: Rahul paused before replying in two tense meetings.');
        await settle(page, 400); await shot(rc, 'ei-view-review-typing');
        const sd = rc.locator(tid('vatc-review-show-deleted'));
        if (await sd.count()) { await sd.click(); await settle(page, 800); await shot(rc, 'ei-view-review-show-deleted'); await sd.click(); }
        const del = rc.locator(tid('vatc-review-delete')).first();
        if (await del.count()) { await del.click(); await settle(page, 800); await shot(rc, 'ei-view-review-delete-confirm'); const c = page.getByRole('button', { name: /^\s*Cancel\s*$/ }).last(); if (await c.count()) await c.click(); }
        await rc.locator(tid('vatc-review-text')).fill('');
      }
      
      // View answer overlay for the first submitted form
      const va = page.locator(tid('vatc-forms-card')).first().locator(tid('vatc-form-view')).first();
      if (await va.count()) {
        await va.click(); await settle(page, 2500);
        const ov = page.locator(tid('fov-panel-3'));
        if (await ov.count()) { await shot(ov, `${pre}-view-answer`); await page.locator(tid('fov-close-2')).click(); await settle(page, 800); }
      }
      if (pre === 'wish') {
        const wd = page.locator(tid('vatc-forms-card')).first().locator(tid('vatc-form-revoke')).first();
        if (await wd.count()) { await wd.click(); await settle(page, 800); const d = page.locator('mat-dialog-container').last(); if (await d.count()) { await shot(d, 'wish-view-withdraw-confirm'); await page.keyboard.press('Escape'); await settle(page, 600); } }
        const ed = page.locator(tid('vatc-forms-card')).first().locator(tid('vatc-form-edit')).first();
        if (await ed.count()) {
          const [pop] = await Promise.all([page.context().waitForEvent('page', { timeout: 15000 }), ed.click()]);
          await page.goto('about:blank');
          await pop.setViewportSize({ width: 1440, height: 900 });
          await pop.waitForLoadState(); await settle(pop, 6000);
          await shot(pop, 'wish-form-edit-screen');
          await pop.close();
          await page.goto(`${BASE}/viewprescribedATC`);
          await page.locator(tid('vatc-forms-count')).first().waitFor({ timeout: 30000 }); await settle(page, 2000);
          continue;
        }
      }
      await row.locator(tid('vatc-toggle-full')).click(); await settle(page, 1000);
    }
  },

  async formedit(page) {
    await page.goto(`${BASE}/viewprescribedATC`);
    await page.locator(tid('vatc-forms-count')).first().waitFor({ timeout: 30000 }); await settle(page, 2500);
    const row = page.locator('[data-testid^="vatc-row-"]').filter({ hasText: 'Asha Menon' }).first();
    await row.locator(tid('vatc-toggle-full')).click();
    await page.locator(tid('vatc-forms-card')).first().waitFor({ timeout: 30000 }); await settle(page, 2500);
    const ed = page.locator(tid('vatc-forms-card')).first().locator(tid('vatc-form-edit')).first();
    const [pop] = await Promise.all([page.context().waitForEvent('page', { timeout: 15000 }), ed.click()]);
    await page.goto('about:blank');
    await pop.setViewportSize({ width: 1440, height: 900 });
    await pop.waitForLoadState(); await settle(pop, 6000);
    await shot(pop, 'wish-form-edit-screen');
    await pop.close();
  },

  async after(page) {
    await page.goto(`${BASE}/viewprescribedATC`);
    await page.locator(tid('vatc-forms-count')).first().waitFor({ timeout: 30000 }); await settle(page, 2500);
    for (const [who, pre] of [['Asha Menon', 'wish'], ['Rahul Verma', 'ei']]) {
      const row = page.locator('[data-testid^="vatc-row-"]').filter({ hasText: who }).first();
      await row.locator(tid('vatc-toggle-full')).click();
      await page.locator(tid('vatc-forms-card')).first().waitFor({ timeout: 30000 }); await settle(page, 2500);
      await shot(page.locator(tid('vatc-forms-card')).first(), `${pre}-view-forms-card-after`);
      await row.locator(tid('vatc-toggle-full')).click(); await settle(page, 1000);
    }
  },

  async edit(page) {
    for (const [id, pre] of [['manual_atc_wish_asha', 'wish'], ['manual_atc_ei_rahul', 'ei']]) {
      await page.goto(`${BASE}/editATC/${id}/alpha`); await settle(page, 9000);
      await shot(page, `${pre}-edit-top`);
      const panel = page.locator(tid('eatc-version-line')).first();
      if (await panel.count()) { const box = panel.locator('xpath=ancestor::*[contains(@class,"panel") or contains(@class,"card")][1]'); await shot((await box.count()) ? box : panel, `${pre}-edit-panel`); }
      
      await page.locator(tid('eatc-submit')).click(); await settle(page, 2000);
      const dlg = page.locator('mat-dialog-container').last();
      if (await dlg.count()) { await shot(dlg, `${pre}-edit-preview`); const c = page.locator(tid('pabs-close')); if (await c.count()) await c.click(); else await page.keyboard.press('Escape'); }
    }
  },

  // 2026-11-02 update: the three-part Forms card per participant, and the optional sponsor-form send
  async sponsor(page) {
    for (const [who, pre, sponsor] of [['Asha Menon', 'wish', 'Ravi'], ['Rahul Verma', 'ei', 'Meera']]) {
      await tall(page, 1400);
      await page.goto(`${BASE}/viewprescribedATC`);
      await page.locator(tid('vatc-forms-count')).first().waitFor({ timeout: 30000 }); await settle(page, 2500);
      const row = page.locator('[data-testid^="vatc-row-"]').filter({ hasText: who }).first();
      await row.scrollIntoViewIfNeeded();
      await row.locator(tid('vatc-toggle-full')).click();
      const card = row.locator(tid('vatc-forms-card'));
      await card.waitFor({ timeout: 30000 }); await settle(page, 3500);
      await card.scrollIntoViewIfNeeded(); await shot(card, `${pre}-view-forms-card`);
      const sp = card.locator(tid('vatc-form-row')).filter({ hasText: 'Sponsor Feedback' }).first();
      await sp.locator(tid('vatc-form-send')).click();
      const dlg = row.locator(tid('vatc-sponsor-dialog'));
      await dlg.waitFor({ timeout: 10000 }); await settle(page, 600);
      await dlg.locator(tid('vatc-sponsor-search')).fill(sponsor); await settle(page, 800);
      await shot(dlg, `${pre}-sponsor-search`);
      await dlg.locator(tid('vatc-sponsor-option')).first().click(); await settle(page, 500);
      await shot(dlg, `${pre}-sponsor-dialog`);
      await dlg.locator(tid('vatc-sponsor-send')).click(); await settle(page, 3000);
      await card.scrollIntoViewIfNeeded(); await shot(card, `${pre}-view-forms-card-sponsor`);
      await tall(page, 900);
    }
  },
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await login(page);
  for (const [name, fn] of Object.entries(steps)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    try { log('step', name); await fn(page); } catch (e) { log('FAILED', name, e.message.split('\n')[0]); await shot(page, `zz-fail-${name}`).catch(() => {}); }
  }
  await browser.close();
})();
