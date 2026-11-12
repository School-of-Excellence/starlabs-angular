// jc-health-theme-consistency: ONE light/dark source for all four Journey Coach Health tabs
// (qa/jc-health-ux-review.md T1-T10). The host .jchd-wrap resolves --jx-* tokens for the current mode;
// the embedded journeycoach-dashboard (Onboarding tab) and the Ev. Prep board read them. The embed takes
// its dark flag from the host and never from its own jcdTheme key. Every check goes RED on revert.
import { readFileSync } from 'node:fs';

const J = 'src/app/Journey Onboarding/';
const read = (p) => readFileSync(J + p, 'utf8');
const hHtml = read('journey-coach-health-dashboard/journey-coach-health-dashboard.component.html');
const hCss = read('journey-coach-health-dashboard/journey-coach-health-dashboard.component.css');
const jTs = read('journeycoach-dashboard/journeycoach-dashboard.component.ts');
const jCss = read('journeycoach-dashboard/journeycoach-dashboard.component.css');
const eCss = read('jc-evprep-board/jc-evprep-board.component.css');
const eHtml = read('jc-evprep-board/jc-evprep-board.component.html');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const embedBlock = (() => { const i = jCss.indexOf('.jcd-root.jcd-embed, .jcd-root.jcd-embed.jcd-dark {'); return i < 0 ? '' : jCss.slice(i, jCss.indexOf('}', i)); })();
const navBlock = hHtml.slice(hHtml.indexOf('data-testid="jx-tabbar"'), hHtml.indexOf('</nav>'));

check('TC1', 'host binds its resolved mode into the embed: [hostDark]="isDark"',
  () => /<app-journeycoach-dashboard [^>]*\[embedOnboarding\]="true"[^>]*\[hostDark\]="isDark"/.test(hHtml));
check('TC2', 'embed input hostDark drives darkMode in embed mode',
  () => /@Input\(\) set hostDark\(v: boolean\)[\s\S]{0,200}if \(this\.embedOnboarding\) \{ this\.darkMode = this\.hostDarkValue;/.test(jTs));
check('TC3', 'embed mode never reads jcdTheme (ngOnInit branches on embedOnboarding first)',
  () => /if \(this\.embedOnboarding\) this\.darkMode = this\.hostDarkValue;\s*else \{ try \{ this\.darkMode = localStorage\.getItem\('jcdTheme'\)/.test(jTs));
check('TC4', 'global jcd-dark overlay class is removed when the dashboard is destroyed',
  () => /destroyRef\.onDestroy\(\(\) => \{ try \{ this\.overlayContainer\.getContainerElement\(\)\.classList\.remove\('jcd-dark'\)/.test(jTs));
check('TC5', 'host publishes the shared --jx-* tokens from its own mode tokens',
  () => /--jx-surface: var\(--surface\)/.test(hCss) && /--jx-ink: var\(--ink\)/.test(hCss) && /--jx-red: var\(--sem-red\)/.test(hCss));
check('TC6', 'embed aliases both palettes (redesign + legacy) to --jx-* in light AND dark',
  () => ['--panel: var(--jx-surface', '--card: var(--jx-surface', '--ink: var(--jx-ink', '--text: var(--jx-ink',
         '--line: var(--jx-line', '--border: var(--jx-line', '--accent: var(--jx-blue', '--red: var(--jx-red',
         '--amber: var(--jx-amber', '--green: var(--jx-green'].every(t => embedBlock.includes(t)));
check('TC7', 'embed card shell + toolbar follow the host (radius/shadow, transparent date bar)',
  () => /\.jcd-root\.jcd-embed \.card \{ border: 0; border-radius: var\(--jx-radius/.test(jCss)
     && /\.jcd-root\.jcd-embed \.top \{ background: transparent;/.test(jCss));
check('TC8', 'one theme toggle, in the tab bar (visible on all four tabs)',
  () => /data-testid="jx-theme-toggle"/.test(navBlock) && (hHtml.match(/\(click\)="toggleTheme\(\)"/g) || []).length === 1);
check('TC9', 'no hard-coded light-mode grey text left in the host (Health legend, participant email)',
  () => !/color: rgba\(60, 60, 67, 0\.7\)/.test(hCss));
check('TC10', 'Ev. Prep pills/chips/banner use host semantic tokens, no light hex fills',
  () => !/#fef3c7|#dcfce7|#fef2f2|#fcd34d|#86efac|#fecaca/.test(eCss) && /evp-btn--next \{ color: var\(--sem-orange-fg/.test(eCss));
check('TC11', 'Ev. Prep card shell reads the host radius/shadow',
  () => /\.evp-board \{[^}]*border-radius: var\(--jx-radius/.test(eCss));
check('TC12', 'Ev. Prep drag preview stays inside the themed board',
  () => /cdkDrag \[cdkDragData\]="c" cdkDragPreviewContainer="parent"/.test(eHtml));
check('TC13', 'native inputs in the embed follow the host mode, not the OS',
  () => /\.jcd-root\.jcd-embed \{ color-scheme: light; \}/.test(jCss) && /\.jcd-root\.jcd-embed\.jcd-dark \{ color-scheme: dark; \}/.test(jCss));
for (const [id, name, src] of [['TC14', 'host css', hCss], ['TC15', 'embed css', jCss], ['TC16', 'evprep css', eCss]])
  check(id, `${name} braces balanced`, () => src.split('{').length === src.split('}').length);

if (failed) { console.error(`\n${failed} theme-consistency check(s) FAILED.`); process.exit(1); }
console.log('\nAll theme-consistency checks passed.');
