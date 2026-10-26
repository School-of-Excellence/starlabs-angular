import { Pipe, PipeTransform } from '@angular/core';

export interface ProfileOption {
  id: string;
  name: string;
  email: string;
  /** lowercase "name email", precomputed so search never re-lowercases per keystroke */
  haystack: string;
  /** photo resolved from the cached profile map — '' means default avatar */
  photo: string;
}

export interface ProfileIndex {
  list: ProfileOption[];
  byId: Map<string, ProfileOption>;
}

/**
 * Options to render in a Profiles <mat-select>.
 *
 * Closed panel: only the selected profiles (mat-select needs those options to
 * exist to keep its selection/trigger). Open panel: the selected profiles plus
 * every search match; selected-but-not-matching ones stay rendered but hidden so
 * the multi-select never drops them. Pure pipe → recomputed only when the
 * selection array, search text or open state changes, not on every CD pass.
 */
@Pipe({ name: 'profileOptions', standalone: true })
export class ProfileOptionsPipe implements PipeTransform {
  transform(index: ProfileIndex, selected: string[] | null | undefined, search: string, open: boolean): { p: ProfileOption; hidden: boolean }[] {
    const selectedIds = Array.isArray(selected) ? selected : [];
    if (!open) {
      return selectedIds
        .map(id => index.byId.get(id))
        .filter((p): p is ProfileOption => !!p)
        .map(p => ({ p, hidden: false }));
    }
    const text = (search || '').toLowerCase();
    const selectedSet = new Set(selectedIds);
    const out: { p: ProfileOption; hidden: boolean }[] = [];
    for (const p of index.list) {
      const matches = text === '' || p.haystack.includes(text);
      if (matches || selectedSet.has(p.id)) {
        out.push({ p, hidden: !matches });
      }
    }
    return out;
  }
}

/** Icon options: the full ~1000-icon list only while the panel is (or has been) open. */
@Pipe({ name: 'iconOptions', standalone: true })
export class IconOptionsPipe implements PipeTransform {
  transform(icons: string[], selected: string | null | undefined, open: boolean): string[] {
    if (open) return icons;
    return selected && icons.includes(selected) ? [selected] : [];
  }
}
