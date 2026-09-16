import { Component, HostListener, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HELP_SECTIONS, HelpSection, FIELD_REFERENCE, FieldNote } from '../wc2-help';

/**
 * The configuration guide behind the "i" button on /workshopconfig/:id.
 *
 * Two views: the narrative Guide, and a Reference listing every setting on the
 * screen with what it does. Content lives in `wc2-help.ts` and was written from
 * the behaviour of the EiFlix user app, so it explains what a setting does for
 * the learner. No stored field name appears anywhere.
 */
@Component({
  selector: 'app-wc2-help-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './wc2-help-dialog.component.html',
  styleUrls: ['./wc2-help-dialog.component.css'],
})
export class Wc2HelpDialogComponent {
  readonly sections: HelpSection[] = HELP_SECTIONS;
  readonly allFields: FieldNote[] = FIELD_REFERENCE;
  readonly groups: FieldNote['group'][] = ['Enrollment page', 'Settings', 'Challenges'];

  view: 'guide' | 'reference' = 'guide';
  active = 0;
  /** Search box — applies to whichever view is open. */
  q = '';
  /** Reference filter: show only the settings the app ignores. */
  onlyUnused = false;

  constructor(
    public dialogRef: MatDialogRef<Wc2HelpDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { section?: number; view?: 'guide' | 'reference' } | null,
  ) {
    if (data?.view) this.view = data.view;
    if (data?.section != null && data.section >= 0 && data.section < this.sections.length) {
      this.active = data.section;
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.dialogRef.close(); }

  setView(v: 'guide' | 'reference'): void {
    this.view = v;
    this.q = '';
    this.scrollTop();
  }

  select(i: number): void { this.active = i; this.scrollTop(); }

  private scrollTop(): void { document.querySelector('.hlp-body')?.scrollTo({ top: 0 }); }

  // ───────────────────────── guide view ─────────────────────────
  /**
   * The section list, indexed ONCE.
   *
   * This must not be rebuilt inside the getter: `*ngFor` tracks items by
   * identity, so returning freshly-created wrappers on every change-detection
   * pass makes Angular destroy and recreate all nine buttons continuously —
   * a click's mousedown lands on a node that no longer exists by mouseup, and
   * nothing in the list can be clicked. Filtering this array preserves the
   * identities, so the rows are created once and stay put.
   */
  private readonly indexed: { s: HelpSection; i: number }[] =
    HELP_SECTIONS.map((s, i) => ({ s, i }));

  /** Pre-lowercased haystack per section, so search does no work per keystroke. */
  private readonly haystack: string[] = HELP_SECTIONS.map(s =>
    (s.title + ' ' + s.body.join(' ') + ' ' + (s.steps || []).join(' ') + ' ' + (s.warnings || []).join(' ')).toLowerCase());

  get shown(): { s: HelpSection; i: number }[] {
    const q = this.q.trim().toLowerCase();
    if (!q) return this.indexed;
    return this.indexed.filter(x => this.haystack[x.i].includes(q));
  }

  /** Identity for *ngFor — the section's fixed position. */
  trackSection = (_: number, x: { i: number }) => x.i;
  /** Identity for *ngFor over settings — the control name is unique. */
  trackField = (_: number, f: FieldNote) => f.key;

  get current(): HelpSection | null {
    const list = this.shown;
    if (!list.length) return null;
    return list.some(x => x.i === this.active) ? this.sections[this.active] : this.sections[list[0].i];
  }

  get currentIndex(): number {
    const list = this.shown;
    if (!list.length) return -1;
    return list.some(x => x.i === this.active) ? this.active : list[0].i;
  }

  // ─────────────────────── reference view ───────────────────────
  /** Every setting matching the search box and the unused filter. */
  get matches(): FieldNote[] {
    const q = this.q.trim().toLowerCase();
    return this.allFields.filter(f =>
      (!this.onlyUnused || f.unused) &&
      (!q || (f.label + ' ' + f.hint + ' ' + f.detail).toLowerCase().includes(q)));
  }

  /** The matches for one tab, live settings first so the useful ones lead. */
  inGroup(g: FieldNote['group']): FieldNote[] {
    return this.matches
      .filter(f => f.group === g)
      .sort((a, b) => (a.unused === b.unused ? 0 : a.unused ? 1 : -1));
  }

  get unusedCount(): number { return this.allFields.filter(f => f.unused).length; }
}
