import { Pipe, PipeTransform } from '@angular/core';

/** How to read the searchable text of one item: a property name, or a function (e.g. a name looked
 *  up from a profile map). */
export type NameGetter<T> = string | ((item: T) => string | null | undefined);

/** Case-insensitive "contains" filter for the dialog name searches (2026-11-20). Every word typed
 *  must appear, in any order ("rao pri" finds "Priya Rao"). Empty term → the list as is. */
export function nameSearch<T>(list: readonly T[] | null | undefined, term: string | null | undefined, get: NameGetter<T>): T[] {
  const items = (list ?? []) as T[];
  const words = (term ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const read = typeof get === 'function' ? get : (x: T) => (x as any)?.[get];
  return items.filter(x => {
    const text = String(read(x) ?? '').toLowerCase();
    return words.every(w => text.includes(w));
  });
}

/** Template form: `*ngFor="let p of list | nameSearch:query:'name'"`. Pure, so it only re-runs when
 *  the list, the query or the getter changes. */
@Pipe({ name: 'nameSearch', standalone: true, pure: true })
export class NameSearchPipe implements PipeTransform {
  transform<T>(list: readonly T[] | null | undefined, term: string | null | undefined, get: NameGetter<T>): T[] {
    return nameSearch(list, term, get);
  }
}
