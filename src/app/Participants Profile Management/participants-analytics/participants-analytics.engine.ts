/**
 * Participants Analytics Engine (pure, dependency-free).
 *
 * The rules behind the Participants Analytics screen: how a participant's age is derived from a date of
 * birth, which journey label their customer status resolves to, which event counts as their last
 * attended one, how the UP!/CPM computed columns are totalled, which participants survive the
 * consumed/unconsumed product filters, how a saved filter is emptied of blank criteria and rendered as
 * the human-readable "filter text" banner, and the dozen typeahead filters behind the dropdowns.
 *
 * Extracted from ParticipantsAnalyticsComponent (3,986 lines) on 2026-09-10, following the pattern set by
 * delivery-dashboard.engine.ts and content-analytics.engine.ts. The logic is UNCHANGED — same comparison
 * operators, same string spellings, same guards, same off-by-one in calculateAge, same mutation of the
 * caller's Date. Several oddities are marked DEFECT below and pinned by tests rather than fixed, because
 * this is a refactor and not a bug-fix.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs. Every function takes its inputs as arguments and returns a value,
 *   so the rules can be exercised offline instead of standing up a component that injects a Firestore, an
 *   HttpClient, an Injector, a FormBuilder, a MatDialog and eleven child dialogs.
 * - As methods on that component these rules were only reachable through a rendered table. An e2e case
 *   could assert that a row said "36" — it could not tell a correct birthday boundary from an off-by-one,
 *   so a shifted boundary passed silently.
 * - These are product decisions. Which product ids roll into the UP! column, whether "greater than or
 *   equal to" is spelled `gtoreqto` or `groreqto`, and whether a discontinued participant shows their
 *   last-subscribed or last-completed journey all change what an operator reads off this screen.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads Firestore, opens a dialog, writes a saved search, exports Excel, or walks the
 *   checklist collections. Where a method mixed both, only the pure core moved.
 * - filterAtcModel() and anything else that reads ATC data. ATC is out of scope for this extraction and
 *   is left on the component untouched.
 * - The stray `console.log` calls inside calculateAge() and getLastAttendedEventForParticipant() are not
 *   reproduced here. They are debug noise, not behaviour.
 */

// =================================================================================================
// Computed-column product ids — the component's own literals, kept as exported constants so a test
// pins the membership rather than re-typing it.
// =================================================================================================

/** Product ids that roll into the "UP! count" column (component getUpLiveCount, line 3152). */
export const UP_LIVE_PRODUCT_IDS: readonly string[] = [
  '0ayiNALL1HDVvCXDHcZ4',
  'N0MhGQnxP9S8TdavuRJR',
  'Rq9cu2Z3FSuILXdwYtca',
];

/** Product ids that roll into the "CPM count" column (component getCPMCount, line 3163). */
export const CPM_PRODUCT_IDS: readonly string[] = [
  'AED3TRIhKpyCtIWQvQMc',
  'TnlqL6gUvDSx105YIPC5',
  'TxnrP4kevFZCPHFtxj7Z',
  'ZvANGjeQnKeIbGXiY0un',
];

// =================================================================================================
// Shapes — only the fields the rules actually touch are modelled.
// =================================================================================================

/** Per-participant product tallies: productId -> counts. */
export interface ProductCounts {
  consumedCount?: number;
  unConsumedCount?: number;
}

/** One consumed/unconsumed product criterion off the filter dialog. */
export interface ProductFilter {
  productId?: string;
  /** One of 'equalto' | 'gtoreqto' | 'lsoreqto' | 'groreqto' — see DEFECT 3. */
  comparison?: string;
  count?: number;
}

/** One row of the raw product data the product filters are applied to. */
export interface RawProductRow {
  profileId?: string;
  products?: Record<string, ProductCounts>;
  [key: string]: any;
}

/** The buckets returnFilterText()/saveSearchedFilter() sort a filter key into. */
export interface FilterKeyGroups {
  range: readonly string[];
  numberrange: readonly string[];
  arraystring: readonly string[];
  arrayarray: readonly string[];
  string: readonly string[];
  number: readonly string[];
  stringarray: readonly string[];
}

// =================================================================================================
// Age
// =================================================================================================

/**
 * Age in whole years from a date of birth, as the table's Age column shows it.
 *
 * `now` is injectable so a test can freeze the clock; the default preserves the component's original
 * `new Date()` behaviour exactly, including the midnight truncation.
 *
 * DEFECT 1 (pinned, not fixed): this MUTATES the Date it is handed — `date.setFullYear(currentYear)` is
 * applied to the caller's own object when `d` is a plain Date rather than a Firestore Timestamp. Calling
 * it twice on the same Date returns 0 the second time, because the birth year has been overwritten.
 */
export function calculateAge(d: any, now: number = Date.now()): number | string {
  const date = d?.toDate ? d.toDate() : d;
  const currentDate: Date = new Date(now);
  currentDate.setHours(0, 0, 0, 0);
  if (!date?.toDateString) {
    return '';
  }
  const age = (currentDate.getFullYear() - date.getFullYear()) - 1;
  date.setFullYear(currentDate.getFullYear());
  return date <= currentDate ? age + 1 : age;
}

// =================================================================================================
// Computed columns
// =================================================================================================

/**
 * Total consumed count across a set of product ids for one participant.
 *
 * Backs both the "UP! count" and "CPM count" columns; the two component methods differed only in the id
 * list. Returns 0 for an unknown participant so the column renders a number rather than a blank.
 *
 * DEFECT 2 (pinned, not fixed): the component's return type is `number | string`, but no branch can ever
 * return a string — the "not found" case returns the number 0. Any template or export that special-cases
 * a string here is dead code.
 */
export function productConsumedTotal(
  participantProducts: Record<string, ProductCounts> | null | undefined,
  productIds: readonly string[],
): number | string {
  if (!participantProducts) {
    return 0;
  }
  return productIds.reduce((total, productId) => {
    const count = participantProducts[productId]?.consumedCount || 0;
    return total + count;
  }, 0);
}

/** "UP! count" column. `profileId` is checked exactly as the component checked it. */
export function upLiveCount(
  profileId: string | null | undefined,
  participantProductMap: Record<string, Record<string, ProductCounts>> | null | undefined,
): number | string {
  if ([null, undefined, ''].includes(profileId as any) || !participantProductMap?.[profileId as string]) {
    return 0;
  }
  return productConsumedTotal(participantProductMap![profileId as string], UP_LIVE_PRODUCT_IDS);
}

/** "CPM count" column. */
export function cpmCount(
  profileId: string | null | undefined,
  participantProductMap: Record<string, Record<string, ProductCounts>> | null | undefined,
): number | string {
  if ([null, undefined, ''].includes(profileId as any) || !participantProductMap?.[profileId as string]) {
    return 0;
  }
  return productConsumedTotal(participantProductMap![profileId as string], CPM_PRODUCT_IDS);
}

// =================================================================================================
// Journey + last attended event
// =================================================================================================

/**
 * Which journey label to show for a participant, chosen by their customer status.
 *
 * DEFECT 4 (pinned, not fixed): only three statuses are handled. Any other value — including a missing
 * status, which the component coalesces to `null` — falls through to the empty string, so a participant
 * whose status has not been set shows a blank journey rather than their active one. Note also that a
 * recognised status with an unmapped journey id returns `undefined`, not `''`, so the two "no journey"
 * cases are not interchangeable downstream.
 */
export function journeyForParticipant(
  metadata: Record<string, any>,
  mapfiltervalues: Record<string, any>,
): any {
  const customerStatus = metadata['customerstatus'] ?? null;

  if (customerStatus === 'active') {
    return mapfiltervalues[metadata['activejourney']];
  } else if (customerStatus === 'non active') {
    return mapfiltervalues[metadata['lastcompletedjourney']];
  } else if (customerStatus === 'discontinued') {
    return mapfiltervalues[metadata['lastsubscribedjourney']];
  }
  return '';
}

/** Just enough of an event doc for the last-attended rule. */
export interface EventEndDate {
  end_date?: { toDate?: () => Date } | null;
}

/**
 * The id of the latest event this participant attended, by event end date.
 *
 * Events with no resolvable end date are skipped entirely rather than treated as very old.
 *
 * DEFECT 5 (pinned, not fixed): the comparison is `<=`, so when two events share an end date the one
 * encountered LAST in `Object.values(productevent).flat()` wins. That iteration order is Firestore
 * document-key order, not anything meaningful, so same-day events resolve arbitrarily.
 */
export function lastAttendedEventId(
  metadata: Record<string, any> | null | undefined,
  eventCollectionMap: Record<string, EventEndDate> | null | undefined,
): string | undefined {
  const productEvent = metadata?.['productevent'] ?? {};
  const attendedEventIds: any[] = Object.values(productEvent).flat();
  let lastAttendedEvent: { eventId: any; endDate: Date } | null = null;

  for (const eventId of attendedEventIds) {
    const endDate = eventCollectionMap?.[eventId]?.end_date?.toDate?.() ?? null;
    if ([null, undefined, ''].includes(endDate as any)) {
      continue;
    }

    if (
      [null, undefined, ''].includes(lastAttendedEvent as any) ||
      (lastAttendedEvent as any)?.endDate?.getTime() <= (endDate as Date)?.getTime()
    ) {
      lastAttendedEvent = { eventId, endDate: endDate as Date };
    }
  }

  return lastAttendedEvent?.eventId;
}

// =================================================================================================
// Tags
// =================================================================================================

/** Tags present on the current version but not the previous one. */
export function tagsAdded(current: any, previous: any): string[] {
  const curr = current.profiletags || [];
  const prev = previous.profiletags || [];
  return curr.filter((t: string) => !prev.includes(t));
}

/**
 * Tags present on the previous version but not the current one.
 *
 * DEFECT 6 (pinned, not fixed): neither direction de-duplicates. A tag stored twice on one version is
 * reported twice in the tag-history diff, so the history panel can show "added: coach, coach".
 */
export function tagsRemoved(current: any, previous: any): string[] {
  const curr = current.profiletags || [];
  const prev = previous.profiletags || [];
  return prev.filter((t: string) => !curr.includes(t));
}

// =================================================================================================
// Product filters
// =================================================================================================

/**
 * The human-readable label for one product criterion — what the chip above the table says.
 *
 * DEFECT 3 (pinned, not fixed) — THE SPELLING SPLIT. This function recognises `gtoreqto` for
 * "Greater than or Equal To", while the matcher below (matchesProductFilters) tests for `groreqto`.
 * The two spellings are different strings, so at most one of them can be right. Whichever the dialog
 * actually writes, one half of the feature is silently wrong: either the chip shows the raw token
 * `gtoreqto`, or the filter falls through to its equality default and a "greater than or equal to 3"
 * criterion quietly matches only participants with exactly 3.
 */
export function productFilterLabel(
  product: ProductFilter | null | undefined,
  productMap: Record<string, any>,
): string {
  if (!product) return '';

  let comparison: any = product?.comparison;

  if (comparison == 'equalto') {
    comparison = 'Equal To';
  } else if (comparison == 'gtoreqto') {
    comparison = 'Greater than or Equal To';
  } else if (comparison == 'lsoreqto') {
    comparison = 'Less than or Equal To';
  }

  return `${productMap[product?.productId as string]?.product} ${comparison} ${product?.count}`;
}

/**
 * Does one participant's product tallies satisfy every consumed AND every unconsumed criterion?
 *
 * Empty criteria lists pass. A product the participant has no row for fails immediately, even for a
 * "less than or equal to" criterion that arguably should pass at zero.
 *
 * DEFECT 7 (pinned, not fixed): an unrecognised `comparison` — including the `gtoreqto` spelling that
 * productFilterLabel() understands — falls through to the `==` equality default rather than being
 * rejected or logged.
 */
export function matchesProductFilters(
  products: Record<string, ProductCounts> | null | undefined,
  consumed: ProductFilter[],
  unconsumed: ProductFilter[],
): boolean {
  let matchesConsumed = consumed.length === 0;
  let matchesUnconsumed = unconsumed.length === 0;

  if (consumed.length > 0) {
    matchesConsumed = consumed.every((filter) => {
      const productData = products?.[filter.productId as string];

      if (!productData) return false;

      if (filter.comparison === 'equalto') {
        return productData.consumedCount == filter.count;
      } else if (filter.comparison === 'groreqto') {
        return (productData.consumedCount as number) >= (filter.count as number);
      } else if (filter.comparison === 'lsoreqto') {
        return (productData.consumedCount as number) <= (filter.count as number);
      }
      return productData.consumedCount == filter.count;
    });
  }

  if (unconsumed.length > 0) {
    matchesUnconsumed = unconsumed.every((filter) => {
      const productData = products?.[filter.productId as string];
      if (!productData) return false;

      if (filter.comparison === 'equalto') {
        return productData.unConsumedCount == filter.count;
      } else if (filter.comparison === 'groreqto') {
        return (productData.unConsumedCount as number) >= (filter.count as number);
      } else if (filter.comparison === 'lsoreqto') {
        return (productData.unConsumedCount as number) <= (filter.count as number);
      }

      return productData.unConsumedCount == filter.count;
    });
  }

  return matchesConsumed && matchesUnconsumed;
}

/**
 * profileId -> raw row, for every participant surviving the product filters.
 *
 * Absent raw data yields an empty map rather than throwing, which is what keeps the screen usable before
 * the product collection has loaded.
 */
export function participantsMatchingProductFilters(
  rawProductsData: RawProductRow[] | null | undefined,
  consumed: ProductFilter[],
  unconsumed: ProductFilter[],
): Record<string, RawProductRow> {
  const participants: Record<string, RawProductRow> = {};
  if (rawProductsData) {
    rawProductsData.forEach((p) => {
      if (matchesProductFilters(p.products, consumed, unconsumed)) {
        participants[p['profileId']] = p;
      }
    });
  }
  return participants;
}

// =================================================================================================
// Saved-filter cleanup + filter-text banner
// =================================================================================================

/**
 * Drop every criterion that is blank, so a half-filled form is not saved or described as a real filter.
 *
 * Returns a NEW object; the component's two copies of this loop (returnFilterText and
 * saveSearchedFilter) both mutated a shallow clone, which is the same thing from the caller's side.
 *
 * A key is dropped when it is null/undefined, when it is a date or number range missing either end, or
 * when it is an array-valued key that is empty.
 */
export function stripBlankFilters(
  filterdata: Record<string, any>,
  groups: FilterKeyGroups,
): Record<string, any> {
  const data = Object.assign({}, filterdata);
  for (const key in data) {
    if (data[key] === null || data[key] === undefined) delete data[key];
    else if (groups.range.includes(key)) {
      if (
        data[key]['start'] === null || data[key]['start'] === undefined ||
        data[key]['end'] === null || data[key]['end'] === undefined
      ) delete data[key];
    }
    else if ([...groups.arraystring, ...groups.arrayarray].includes(key)) {
      if (data[key].length === 0) delete data[key];
    }
    else if (groups.numberrange.includes(key)) {
      if (
        data[key]['start'] === null || data[key]['start'] === undefined ||
        data[key]['end'] === null || data[key]['end'] === undefined
      ) delete data[key];
    }
  }
  return data;
}

/**
 * The "filter text" banner above the table — one line per active criterion, joined by " (AND) \n".
 *
 * `formatDate` is a parameter rather than a DatePipe so the engine stays free of Angular; the component
 * passes `(d) => this.datepipe.transform(d, 'MMM d, y')`, which is exactly what it used before.
 *
 * Returns `null` when nothing is active, which is the sentinel the template checks with `*ngIf`.
 *
 * DEFECT 8 (pinned, not fixed): a key that belongs to NO group contributes nothing at all, silently. It
 * is still applied to the query — `object`, `stringmaparray` and `numbermapnumber` keys all filter the
 * table — but the banner never mentions them, so an operator can be looking at a filtered table whose
 * banner claims a filter that is not the one in force.
 */
export function buildFilterText(
  filterdata: Record<string, any>,
  groups: FilterKeyGroups,
  mapfiltervalues: Record<string, any>,
  formatDate: (value: any) => string | null,
): string | null {
  const data = stripBlankFilters(filterdata, groups);
  let filterText: string | null = null;
  const filterdataClone = Object.assign({}, data);

  for (const key in filterdataClone) {
    if (groups.arraystring.includes(key) || groups.arrayarray.includes(key)) {
      const filterValues = filterdataClone[key];
      let text = '';
      if (groups.arrayarray.includes(key) && Array.isArray(filterValues)) {
        const mappedValues = filterValues
          .map((value) => mapfiltervalues[value] || value)
          .join(' (OR) ');
        text = `${filterText == null ? '' : ' (AND) \n'}"${key}" is equal to ${mappedValues}`;
      }
      else if (groups.arraystring.includes(key) && Array.isArray(filterValues)) {
        const mappedValues = filterValues
          .map((value) => mapfiltervalues[value] || value)
          .join(' (OR) ');
        text = `${filterText == null ? '' : ' (AND) \n'}"${key}" is equal to ${mappedValues}`;
      }
      filterText = (filterText ?? '') + text;
    }
    else if (groups.string.includes(key) || groups.number.includes(key) || groups.stringarray.includes(key)) {
      const text = `${filterText == null ? '' : ' (AND) \n'}"${key}" is equal to ${mapfiltervalues[filterdataClone[key]] ? mapfiltervalues[filterdataClone[key]] : filterdataClone[key]}`;
      filterText = (filterText ?? '') + text;
    }
    else if (groups.range.includes(key)) {
      const text = `${filterText == null ? '' : ' (AND) \n'}"${key}" From ${formatDate(filterdataClone[key]['start'])} To ${formatDate(filterdataClone[key]['end'])}`;
      filterText = (filterText ?? '') + text;
    }
    else if (groups.numberrange.includes(key)) {
      const text = `${filterText == null ? '' : ' (AND) \n'}"${key}" From ${filterdataClone[key]['start']} To ${filterdataClone[key]['end']}`;
      filterText = (filterText ?? '') + text;
    }
  }
  return filterText;
}

/**
 * Which product-criteria keys are blank and should be removed, and whether more than one product filter
 * survives — the component refuses to run a search with two or more product criteria at once.
 *
 * Split out of searchValidation(), which mixed the decision with the deletions. The component still
 * performs the deletions; this function only decides.
 *
 * DEFECT 9 (pinned, not fixed): the whole check is skipped unless `productcount` is set. Two product
 * criteria without a productcount sail straight through the validation that exists to stop them.
 */
export function productSearchValidation(
  filterdata: Record<string, any>,
): { removeKeys: string[]; tooManyProductFilters: boolean } {
  const removeKeys: string[] = [];
  const validation: boolean[] = [];

  if (filterdata['productcount'] != null && filterdata['productcount'] != undefined) {
    const productarray = Object.keys(filterdata).filter((e) =>
      ['unconsumedproducts', 'consumedproducts', 'activeproduct'].includes(e),
    );
    for (let i = 0; i < productarray.length; i++) {
      const element = productarray[i];
      if (filterdata[element].length != 0) validation.push(true);
      else {
        removeKeys.push(element);
        validation.push(false);
      }
    }
  }
  return {
    removeKeys,
    tooManyProductFilters: validation.filter((e) => e).length > 1,
  };
}

// =================================================================================================
// Typeahead filters behind the dropdowns
// =================================================================================================

/**
 * The shared shape of the eight `on*Search()` methods: normalise the query (null/'' become ''), then
 * keep every option whose trimmed lower-cased label CONTAINS it.
 *
 * `selector` pulls the label off the option — `e.journey`, `e.mode`, `e.name`, `e.queuename`,
 * `e.product`, or the identity for the plain string lists.
 */
export function filterOptions<T>(
  list: T[] | null | undefined,
  query: string | null | undefined,
  selector: (item: T) => string,
): T[] {
  if (list != null) {
    const filterValue = (query != null && query !== '') ? query.trim().toLowerCase() : '';
    return list.filter((e) => selector(e).trim().toLowerCase().includes(filterValue));
  }
  return [];
}

/**
 * The tier dropdown, which does NOT share the rule above.
 *
 * DEFECT 10 (pinned, not fixed): tier matching is a PREFIX test (`indexOf(filterValue) === 0`) and the
 * tier label is never trimmed, while every sibling dropdown is a trimmed substring test. Typing "old"
 * finds nothing in a list containing "Gold", and a tier stored as " Gold" is unreachable by any query.
 */
export function filterTierOptions<T extends { tier?: string }>(
  tierlist: T[] | null | undefined,
  query: string | null | undefined,
): T[] {
  if (tierlist != null) {
    const filterValue = (query != null && query !== '') ? query.trim().toLowerCase() : '';
    return tierlist.filter((e) => (e.tier as string).toLowerCase().indexOf(filterValue) === 0);
  }
  return [];
}

/** The saved-search list box. An empty query returns the unfiltered list rather than an empty one. */
export function filterSavedFilters<T extends { label?: string }>(
  savedfilterquery: T[],
  query: string | null | undefined,
): T[] {
  return ![null, undefined, ''].includes(query as any)
    ? savedfilterquery.filter((e: any) => e.label?.toLowerCase().trim().includes(query?.toLowerCase().trim()))
    : savedfilterquery;
}

/**
 * The "add column" picker.
 *
 * DEFECT 11 (pinned, not fixed): `columnsDisplayed` is built by a spread literal containing a stray
 * double comma (component line 199, `...this.arrayarray, , ...this.range`). That elision leaves a HOLE
 * in the array, so `columnsDisplayed.length` counts one more entry than actually exists. `filter` skips
 * holes, so this function does not throw — but any caller that trusts `.length`, or that maps rather
 * than filters over the same array, gets an `undefined` column and an unguarded `.toLowerCase()` on it.
 * Note too that `search` is not guarded here: it is only safe because the component initialises
 * `searchColumn` to `''`.
 */
export function filterColumns(columns: any[], search: string): any[] {
  return columns.filter((e) => e.toLowerCase().trim().includes(search.toLowerCase().trim()));
}

/** How many times a product id appears in a participant's product array. */
export function countMatchingProducts(productarray: Array<any>, productvalue: string): number {
  return productarray.filter((e) => e === productvalue).length;
}

// =================================================================================================
// Table selection
// =================================================================================================

/** Whether the header checkbox should read as fully selected. */
export function isAllSelected(numSelected: number, numRows: number): boolean {
  return numSelected === numRows;
}

/**
 * The aria-label for a row checkbox.
 *
 * DEFECT 12 (pinned, not fixed): the row label reads `row.position + 1`, but participant rows carry no
 * `position` field — they are Firestore profile docs. Every row therefore announces itself to a screen
 * reader as "select row NaN".
 */
export function checkboxLabel(
  row: any | undefined,
  allSelected: boolean,
  isRowSelected: (row: any) => boolean,
): string {
  if (!row) {
    return `${allSelected ? 'deselect' : 'select'} all`;
  }
  return `${isRowSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`;
}
