import { ChangeDetectionStrategy, Component, Input, Pipe, PipeTransform } from '@angular/core';

/**
 * Inline icon for the New Users screen (design 2026-11-16, "Heritage Ledger").
 *
 * Usage: `<svg nxIcon="tag" class="nx-ic nx-ic--sm"></svg>`. The shapes are inlined from the mockup's sprite
 * (redesign sprite.html) instead of `<use href="#i-…">`: index.html has `<base href="/">`, and fragment
 * references resolve against the base URL in Safari and Firefox. Stroke, size and colour come from the
 * screen's `.nx-ic` rules (stroke: currentColor, fill: none). Always decorative (aria-hidden).
 */
@Component({
  selector: 'svg[nxIcon]',
  standalone: true,
  host: { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  @switch (nxIcon) {
    @case ('search') { <svg:circle cx="11" cy="11" r="6.5"/><svg:path d="M20 20l-4.2-4.2"/> }
    @case ('x') { <svg:path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/> }
    @case ('chev-down') { <svg:path d="M6.5 9.5L12 15l5.5-5.5"/> }
    @case ('chev-up') { <svg:path d="M6.5 14.5L12 9l5.5 5.5"/> }
    @case ('chev-left') { <svg:path d="M14.5 6.5L9 12l5.5 5.5"/> }
    @case ('chev-right') { <svg:path d="M9.5 6.5L15 12l-5.5 5.5"/> }
    @case ('first') { <svg:path d="M16.5 6.5L11 12l5.5 5.5M7.5 6.5v11"/> }
    @case ('last') { <svg:path d="M7.5 6.5L13 12l-5.5 5.5M16.5 6.5v11"/> }
    @case ('tag') { <svg:path d="M3.8 12.6V5a1.2 1.2 0 0 1 1.2-1.2h7.6a1.2 1.2 0 0 1 .85.35l7.3 7.3a1.2 1.2 0 0 1 0 1.7l-7.6 7.6a1.2 1.2 0 0 1-1.7 0l-7.3-7.3a1.2 1.2 0 0 1-.35-.85z"/><svg:circle cx="8.3" cy="8.3" r="1.3"/> }
    @case ('calendar') { <svg:rect x="3.5" y="5" width="17" height="15.5" rx="2"/><svg:path d="M3.5 9.8h17M8 3v4M16 3v4"/> }
    @case ('workshop') { <svg:rect x="3" y="4" width="18" height="12" rx="1.5"/><svg:path d="M12 16v4.5M8 20.5h8M7 12l3-3 2.5 2 4-4"/> }
    @case ('convert') { <svg:path d="M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5"/> }
    @case ('columns') { <svg:rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><svg:path d="M9.2 4.5v15M14.8 4.5v15"/> }
    @case ('file-up') { <svg:path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><svg:path d="M13.5 3.5v5h5M12 17.5v-6M9.5 14L12 11.5l2.5 2.5"/> }
    @case ('pencil') { <svg:path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.5 18.5z"/><svg:path d="M14 7l3 3"/> }
    @case ('plus') { <svg:path d="M12 5.5v13M5.5 12h13"/> }
    @case ('arrow-down') { <svg:path d="M12 5v14M6.5 13.5L12 19l5.5-5.5"/> }
    @case ('arrow-up') { <svg:path d="M12 19V5M6.5 10.5L12 5l5.5 5.5"/> }
    @case ('sort') { <svg:path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4"/> }
    @case ('download') { <svg:path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/> }
    @case ('send') { <svg:path d="M20.5 3.5L10.2 13.8M20.5 3.5l-6.3 17-4-6.7-6.7-4z"/> }
    @case ('filter') { <svg:path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><svg:circle cx="15" cy="7" r="2"/><svg:circle cx="9" cy="17" r="2"/> }
    @case ('check') { <svg:path d="M5 12.5l4.5 4.5L19 7.5"/> }
    @case ('minus') { <svg:path d="M6 12h12"/> }
    @case ('mail') { <svg:rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><svg:path d="M4 7l8 6 8-6"/> }
    @case ('chat') { <svg:path d="M5.3 18.7l1-3.4A7.5 7.5 0 1 1 8.8 18z"/><svg:path d="M9.4 9.4c.3 2.2 2.1 4 4.3 4.4l.9-1.1 1.6.7-.3 1.3c-3.1.2-6.4-2.9-6.3-6.1l1.3-.3.7 1.6z"/> }
    @case ('bell') { <svg:path d="M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5l1.5 1.5h-14z"/><svg:path d="M10 20.5a2 2 0 0 0 4 0"/> }
    @case ('link') { <svg:path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><svg:path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/> }
    @case ('copy') { <svg:rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><svg:path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/> }
    @case ('lock') { <svg:rect x="5" y="10.5" width="14" height="10" rx="1.5"/><svg:path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2"/> }
    @case ('shield') { <svg:path d="M12 3.5l7 2.8v5.2c0 4.3-3 7.8-7 9-4-1.2-7-4.7-7-9V6.3z"/><svg:path d="M9 12l2.2 2.2L15.5 10"/> }
    @case ('users') { <svg:circle cx="9" cy="8.5" r="3.5"/><svg:path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><svg:path d="M15.5 5.3a3.5 3.5 0 0 1 0 6.4M17.5 14.8c1.8.6 3 2.1 3.5 4.7"/> }
    @case ('search-off') { <svg:circle cx="11" cy="11" r="6.5"/><svg:path d="M20 20l-4.2-4.2M9 9l4 4M13 9l-4 4"/> }
    @case ('alert') { <svg:circle cx="12" cy="12" r="8.5"/><svg:path d="M12 7.5v5.5M12 16.3v.2"/> }
    @case ('refresh') { <svg:path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><svg:path d="M19.5 4.5v4h-4"/> }
    @case ('info') { <svg:circle cx="12" cy="12" r="8.5"/><svg:path d="M12 11v5.5M12 7.8v.2"/> }
    @case ('sheet') { <svg:rect x="4" y="3.5" width="16" height="17" rx="1.5"/><svg:path d="M4 9h16M4 14.5h16M10 3.5v17"/> }
    @case ('eye-off') { <svg:path d="M3.5 3.5l17 17M10.6 6.2A9 9 0 0 1 12 6c5 0 8.4 4.4 9 6-.3.8-1.2 2.3-2.6 3.6M6.4 7.6C4.6 8.9 3.4 10.7 3 12c.6 1.6 4 6 9 6 1.4 0 2.7-.3 3.8-.9M9.9 10a3 3 0 0 0 4.1 4.1"/> }
    @case ('user-check') { <svg:circle cx="10" cy="8.5" r="3.5"/><svg:path d="M3.5 19.5c.6-3.3 3.2-5 6.5-5 1.4 0 2.6.3 3.6.9M15 17.5l2 2 4-4.5"/> }
    @case ('undo') { <svg:path d="M9 7.5L5 11.5l4 4"/><svg:path d="M5 11.5h9.5a4.5 4.5 0 0 1 0 9H11"/> }
  }
  `,
})
export class NxIconComponent {
  /** Icon name, as in the mockup sprite (search, x, chev-down, tag, calendar, …). */
  @Input({ required: true }) nxIcon = '';
}

/**
 * The icon a sortable header shows: arrow-up / arrow-down on the active column, `sort` elsewhere.
 * With `isDefault`, the column also shows arrow-down while nothing is sorted (the data order is newest first):
 * a visual hint only, MatSort stays inactive, so no th carries aria-sort ascending/descending.
 */
@Pipe({ name: 'nxSortIcon', standalone: true, pure: true })
export class NxSortIconPipe implements PipeTransform {
  transform(key: string, active: string | null | undefined, direction: string | null | undefined, isDefault = false): string {
    if (active && active === key && direction) return direction === 'asc' ? 'arrow-up' : 'arrow-down';
    if (isDefault && (!active || !direction)) return 'arrow-down';
    return 'sort';
  }
}
