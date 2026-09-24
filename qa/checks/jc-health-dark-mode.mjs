// Dark-mode theming (991970f9 / 9dbde118 / 795201e0 / 7aa70441), re-applied onto origin's component
// after the 2026-09-24 merge. Origin had no theming at all.
//
// The CDK overlays (slide-over, its log composer, log-call and set-health dialogs) render OUTSIDE
// .jchd-wrap, so they cannot inherit data-theme — they are darkened by the jchd-overlay-dark
// panelClass, whose rules live in the global src/styles.css. Miss a panelClass and that overlay
// renders light-on-dark; these checks are the revert guard for each one.
import { readFileSync } from 'node:fs';

const D = 'src/app/Journey Onboarding/journey-coach-health-dashboard/';
const ts = readFileSync(D + 'journey-coach-health-dashboard.component.ts', 'utf8');
const html = readFileSync(D + 'journey-coach-health-dashboard.component.html', 'utf8');
const css = readFileSync(D + 'journey-coach-health-dashboard.component.css', 'utf8');
const global = readFileSync('src/styles.css', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

check('DM1', 'theme state + THEME_KEY persistence',
  () => /theme: 'dark' \| 'light' \| null = null;/.test(ts) && /THEME_KEY = 'jchd-theme'/.test(ts));
check('DM2', 'isDark falls back to prefers-color-scheme',
  () => /matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches/.test(ts));
check('DM3', 'toggleTheme persists to localStorage',
  () => /toggleTheme\(\): void \{[\s\S]{0,200}localStorage\.setItem\(this\.THEME_KEY/.test(ts));
check('DM4', 'the stored theme is restored in ngOnInit',
  () => /localStorage\.getItem\(this\.THEME_KEY\)/.test(ts));
check('DM5', 'data-theme is bound on .jchd-wrap',
  () => /class="jchd-wrap"[^>]*\[attr\.data-theme\]="theme"/.test(html));
check('DM6', 'header toggle present and labelled',
  () => /class="jchd-theme-toggle"[\s\S]{0,160}\(click\)="toggleTheme\(\)"/.test(html)
     && /isDark \? 'light_mode' : 'dark_mode'/.test(html));

// every CDK overlay must carry the dark panelClass — one per overlay that escapes .jchd-wrap
check('DM7', 'slide-over overlay gets jchd-overlay-dark',
  () => /panelClass: this\.isDark \? \['jchd-slideover-panel', 'jchd-overlay-dark'\] : 'jchd-slideover-panel'/.test(ts));
check('DM8', 'slide-over is told isDark (its composer opens its own overlay)',
  () => /isDark: this\.isDark,/.test(ts));
check('DM9', 'log-call dialog gets jchd-overlay-dark',
  () => /LogCallDialogComponent[\s\S]{0,200}panelClass: this\.isDark \? 'jchd-overlay-dark' : undefined/.test(ts));
check('DM10', 'set-health dialog gets jchd-overlay-dark',
  () => /SetHealthStateDialogComponent[\s\S]{0,300}panelClass: this\.isDark \? 'jchd-overlay-dark' : undefined/.test(ts));
check('DM11', 'log composer overlay gets jchd-overlay-dark (slide-over side)',
  () => /panelClass: this\.data\.isDark \? \['jchd-logcomposer-panel', 'jchd-overlay-dark'\] : 'jchd-logcomposer-panel'/
        .test(readFileSync(D + 'participant-slideover.component.ts', 'utf8')));

check('DM12', 'dark token block exists on .jchd-wrap[data-theme="dark"]',
  () => /\.jchd-wrap\[data-theme="dark"\]\s*\{/.test(css));
check('DM13', 'the theme toggle is styled',
  () => /\.jchd-theme-toggle/.test(css));
check('DM14', 'jchd-overlay-dark rules live in the GLOBAL stylesheet (overlays escape component scope)',
  () => /\.jchd-overlay-dark/.test(global) && !/\.jchd-overlay-dark/.test(css));

// structural guard for the union-merge class of defect that already bit once
for (const [id, name, src] of [['DM15', 'component css', css], ['DM16', 'src/styles.css', global]])
  check(id, `${name} braces balanced`, () => src.split('{').length === src.split('}').length);

if (failed) { console.error(`\n${failed} dark-mode check(s) FAILED — theming has regressed.`); process.exit(1); }
console.log('\nAll dark-mode checks passed.');
