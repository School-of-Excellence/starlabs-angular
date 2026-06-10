// globalTeardown for the mobile e2e suite — ROTATING REPORT ARCHIVE.
//
// WHY: Playwright's HTML reporter overwrites `playwright-report-mobile/` every run, so a new run wipes
// the previous run's screenshots/report. This teardown snapshots each completed run's report into a
// rotating archive and keeps the last N (default 10), so old evidence survives. Best-effort — never
// throws into the run. Override the keep-count with MOBILE_REPORT_KEEP, or disable with
// MOBILE_REPORT_ARCHIVE=0.
//
// Browse an archived run with:  cd e2e && npx playwright show-report playwright-report-mobile-archive/<stamp>
const fs = require('fs');
const path = require('path');

const KEEP = Number(process.env.MOBILE_REPORT_KEEP || 10);
const REPORT = path.resolve(__dirname, '../../playwright-report-mobile');
const ARCHIVE = path.resolve(__dirname, '../../playwright-report-mobile-archive');

module.exports = async () => {
  if (process.env.MOBILE_REPORT_ARCHIVE === '0') return;
  try {
    if (!fs.existsSync(path.join(REPORT, 'index.html'))) return; // nothing written this run
    fs.mkdirSync(ARCHIVE, { recursive: true });
    // Sortable timestamp dir name (YYYY-MM-DD_HH-MM-SS). new Date() is fine here (Node teardown, not a workflow).
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const dest = path.join(ARCHIVE, stamp);
    fs.cpSync(REPORT, dest, { recursive: true });
    // Prune oldest beyond KEEP (names are timestamp-sortable).
    const dirs = fs
      .readdirSync(ARCHIVE)
      .filter((d) => { try { return fs.statSync(path.join(ARCHIVE, d)).isDirectory(); } catch { return false; } })
      .sort();
    for (const d of dirs.slice(0, Math.max(0, dirs.length - KEEP))) {
      fs.rmSync(path.join(ARCHIVE, d), { recursive: true, force: true });
    }
    // eslint-disable-next-line no-console
    console.log(`[archive] saved run report → playwright-report-mobile-archive/${stamp} (kept last ${KEEP})`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[archive] skipped:', e && e.message);
  }
};
