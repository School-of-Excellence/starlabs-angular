/**
 * Sale Achieved dialog — the pure logic behind the full-screen list (plan: specs/plans/2026-11-23-sale-achieved-dialog.md).
 *
 * The dialog adds NO read: it shows the buyers the dashboard's Sale Achieved card already loaded from Watson
 * (READ-ONLY). Everything here is a function of that list plus the dialog's own tools — the From / To range,
 * the search and the sort — so it is unit-tested without Watson (sale-achieved.unit.spec.ts).
 *
 * The range, sort, total and export rows reuse the shared Sale Achieved helpers in ../../watson-purchases
 * (saleBuyersInRange, sortSaleBuyers, saleBuyersTotal, saleExportRows, formatRupees); this file adds the search, the
 * table's row shapes, the export's file name, and the split into New Sales / Funnel Sales / Upgrades
 * (classifySalePurchases, saleSectionsView, saleSectionsExportRows — plan section "Addition: New Sales, Funnel Sales
 * and Upgrades").
 *
 * Deliberately NOT named *.component.ts: the hub readiness gate treats every new component file as a screen.
 */
import {
  anyToDate, formatRupees, isPaidAmount, isZeroRupees, saleBuyersInRange, saleBuyersTotal, saleExportRows, sortSaleBuyers,
} from '../../watson-purchases';

export type SaleSort = 'amount' | 'recent';
export type SaleLookupStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * What the dashboard hands the dialog. LIVE: the dashboard implements the data members as getters over its own
 * Sale Achieved state, so a dialog opened while the lookup is still running shows the loading state and fills in
 * when the lookup lands (a one-time copy would freeze it on "loading").
 */
export interface SaleAchievedSource {
  /** The card's lookup state: 'idle' / 'loading' = still running, 'unavailable' = no Watson in this build. */
  readonly status: SaleLookupStatus;
  /** The buyers, as the card built them: name, metadata, salePurchases (oldest first), saleTotal, saleLastDate. */
  readonly buyers: any[];
  /** "Bought 07 Nov 2026 – 06 Jan 2027", or why there is no window. */
  readonly windowLabel: string;
  /** The window's ends as 'yyyy-mm-dd' ('' without a window) — the date pickers' min / max. */
  readonly min: string;
  readonly max: string;
  readonly workshopTitle: string;
  /** The dashboard's export right (the side panel's Export follows the same right). */
  readonly canExport: boolean;
  /**
   * Every profileid that has a `new_user_data` doc, WHATEVER its moved-to-existing mark (absent, false or true) — the
   * dialog's "EiFlix New User" chip (operator 2026-11-23). Live, like the rest: empty until the dashboard's
   * new_user_data read lands, then the chip appears. Only the dialog reads it this way; the dashboard's own New rules
   * (isNewUserProfile) are unchanged. A new Set only when the dashboard's map is replaced.
   */
  readonly newUserIds: ReadonlySet<string>;
  /** The dashboard's own CSV writer + download (createCSVContent + downloadCSV). */
  download(rows: Record<string, string | number>[], fileName: string): void;
}

/** Buyer filter (operator 2026-11-23): everyone, only "EiFlix New User" buyers (a new_user_data doc), or the others. */
export type SaleBuyerType = 'all' | 'eiflix' | 'others';

export interface SaleTools {
  from: string;
  to: string;
  query: string;
  sort: SaleSort;
  /** Products picked (exact names). Empty or absent = every product. Only those purchases count. */
  products?: string[];
  buyerType?: SaleBuyerType;
  /** Per PURCHASE, in rupees; null / undefined = open end. Only purchases inside count. */
  minAmount?: number | null;
  maxAmount?: number | null;
  /** Only people with 2 or more paid purchases in the sale window (across New Sales / Funnel / Upgrades). */
  repeatOnly?: boolean;
}

const numOrNull = (v: any): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Any tool that narrows the list is set (the header then reads "Shown … of <all>"). The sort is not a filter. */
export function saleToolsNarrow(t: SaleTools): boolean {
  return !!(t.from || t.to || str(t.query) || (t.products && t.products.length) || (t.buyerType && t.buyerType !== 'all')
    || numOrNull(t.minAmount) !== null || numOrNull(t.maxAmount) !== null || t.repeatOnly);
}

/**
 * The purchase-level filters (operator 2026-11-23): only purchases of the picked products, and only purchases whose
 * amount is inside min..max (a reversed pair is swapped), count. Each buyer's total, label and latest date are
 * recomputed from what is left; a buyer left with nothing drops out. No such filter set returns the list untouched.
 */
export function filterSalePurchases(buyers: any[], tools: SaleTools): any[] {
  const picked = new Set((tools.products || []).map((p) => str(p)).filter(Boolean));
  let lo = numOrNull(tools.minAmount);
  let hi = numOrNull(tools.maxAmount);
  if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
  if (!picked.size && lo === null && hi === null) return buyers || [];
  const out: any[] = [];
  for (const b of buyers || []) {
    const rows = (b?.salePurchases || []).filter((p: any) => {
      if (picked.size && !picked.has(str(p?.product))) return false;
      const amt = Number(p?.amount);
      if ((lo !== null || hi !== null) && !Number.isFinite(amt)) return false;
      return (lo === null || amt >= lo) && (hi === null || amt <= hi);
    });
    if (!rows.length) continue;
    const total = rows.reduce((a: number, r: any) => a + (Number(r?.amount) || 0), 0);
    const last = Math.max(...rows.map((r: any) => (r?.date instanceof Date ? r.date.getTime() : 0)));
    out.push({ ...b, salePurchases: rows, saleTotal: total, saleTotalLabel: formatRupees(total), saleLastDate: last });
  }
  return out;
}

/** The Product filter's choices: every product name among the buyers' PAID purchases, A→Z (blank names left out). */
export function saleProductOptions(buyers: any[]): string[] {
  const names = new Set<string>();
  for (const b of buyers || []) for (const p of b?.salePurchases || []) { const n = str(p?.product); if (n && isPaidAmount(p?.amount)) names.add(n); }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** One purchase line under an expanded buyer. */
export interface SalePurchaseLine {
  dateLabel: string;
  product: string;
  amountLabel: string;
}

/** One table row (one buyer), in the shape the template reads. */
export interface SaleBuyerRow {
  /** Stable per person — keeps a row's expanded state across a reload of the buyers. */
  key: string;
  name: string;
  email: string;
  /** The email cut before each '@' and '.', so a long address wraps there (<wbr>) instead of mid-word. */
  emailParts: string[];
  phone: string;
  /** Has a new_user_data doc (moved to existing or not) — the "EiFlix New User" chip after the name. */
  eiflixNew: boolean;
  count: number;
  totalLabel: string;
  latestLabel: string;
  /** Newest first. */
  purchases: SalePurchaseLine[];
}

export interface SaleDialogView {
  /** The buyers shown (range and search applied, sorted) — what the export writes. */
  buyers: any[];
  rows: SaleBuyerRow[];
  total: number;
  totalLabel: string;
  count: number;
  /** A range or a search is set — the figures above are of a subset, so the header says "of <all>". */
  filtered: boolean;
  /** Every buyer the card loaded, before the range and the search. */
  allTotalLabel: string;
  allCount: number;
}

const str = (v: any): string => (v === null || v === undefined ? '' : String(v).trim());

export function buyerEmail(b: any): string {
  return str(b?.metadata?.['email']);
}

/**
 * The phone as the dialog shows it: the dial code (participant metadata spells it `countrycode`, new_user_data
 * `countryCode`) and the number, joined by a no-break space so "+91 9820000006" never splits. '' without a number.
 */
export function buyerPhone(b: any): string {
  const m = b?.metadata || {};
  const num = str(m['phonenumber']);
  if (!num) return '';
  // A number already stored with its dial code ("+91…") keeps it once.
  let code = num.startsWith('+') ? '' : str(m['countrycode'] ?? m['countryCode']);
  if (/^\d+$/.test(code)) code = '+' + code;
  return [code, num].filter(Boolean).join('\u00a0');
}

/**
 * Search (case-insensitive): name or email contains the query, or the phone does. A query that is only digits once
 * spaces, '+', '-', '.' and brackets are dropped is matched against the phone's DIGITS, so "+91 98200" finds
 * "+91 9820000006" and "9820000006" finds "+91 98200 00006". A blank query keeps everyone.
 */
export function matchesSaleSearch(b: any, query: string): boolean {
  const q = str(query).toLowerCase();
  if (!q) return true;
  if (str(b?.name).toLowerCase().includes(q)) return true;
  if (buyerEmail(b).toLowerCase().includes(q)) return true;
  const phone = buyerPhone(b);
  const qDigits = q.replace(/[\s+\-.()]/g, '');
  if (qDigits && /^\d+$/.test(qDigits)) return phone.replace(/\D/g, '').includes(qDigits);
  return phone.toLowerCase().includes(q);
}

/** "a.b@c.com" -> ["a", ".b", "@c", ".com"]: the line-break points of an email. [] without one. */
export function emailBreakParts(email: string): string[] {
  const e = str(email);
  return e ? e.split(/(?=[@.])/) : [];
}

/** A buyer's purchases, newest first (the card stores them oldest first). Undated ones go last. */
export function purchasesNewestFirst(b: any): any[] {
  const t = (p: any) => (p?.date instanceof Date ? p.date.getTime() : -Infinity);
  return [...(b?.salePurchases || [])].sort((x, y) => t(y) - t(x));
}

/**
 * The ids behind the "EiFlix New User" chip, from the dashboard's new_user_data map (profileid -> doc, as
 * readNewUserData loads it): EVERY key — a doc's moved-to-existing mark (absent, false or true) is not looked at.
 */
export function eiflixNewUserIds(newUserData: Record<string, unknown> | null | undefined): ReadonlySet<string> {
  return new Set(Object.keys(newUserData || {}).filter((id) => !!str(id)));
}

/**
 * The dialog's "EiFlix New User" (operator 2026-11-23): the buyer's profileid has a new_user_data doc — even one marked
 * moved to existing. Deliberately NOT the dashboard's isNewUserProfile (which leaves moved-to-existing people out).
 */
export function isEiflixNewBuyer(b: any, newUserIds?: ReadonlySet<string> | null): boolean {
  const id = str(b?.profileid);
  return !!id && !!newUserIds?.has(id);
}

export function toSaleRow(b: any, newUserIds?: ReadonlySet<string> | null): SaleBuyerRow {
  const purchases = purchasesNewestFirst(b);
  return {
    key: str(b?.profileid) || str(b?.name),
    name: str(b?.name) || 'Unknown',
    email: buyerEmail(b),
    emailParts: emailBreakParts(buyerEmail(b)),
    phone: buyerPhone(b),
    eiflixNew: isEiflixNewBuyer(b, newUserIds),
    count: purchases.length,
    totalLabel: b?.saleTotalLabel || formatRupees(Number(b?.saleTotal) || 0),
    latestLabel: purchases[0]?.dateLabel || '—',
    purchases: purchases.map((p) => ({
      dateLabel: p?.dateLabel || '—',
      product: str(p?.product),
      amountLabel: p?.amountLabel || (typeof p?.amount === 'number' ? formatRupees(p.amount) : '—'),
    })),
  };
}

/**
 * What the dialog shows for its tools: the range first (only purchases inside it count; a buyer left with none
 * drops out; totals recomputed — saleBuyersInRange), then the search, then the sort (amount = biggest total first,
 * recent = latest purchase first, ties by name — sortSaleBuyers). The total and the count are of the buyers shown;
 * with a range or a search set (`filtered`), the header also shows the figures of every buyer (`allTotalLabel`).
 * `newUserIds` only marks rows (the "EiFlix New User" chip) — it never filters, sorts or searches.
 */
export function saleDialogView(
  buyers: any[], tools: SaleTools, newUserIds?: ReadonlySet<string> | null, keepBuyer?: ((b: any) => boolean) | null,
): SaleDialogView {
  // A ₹0 buyer is never listed or counted (operator 2026-11-23) — neither overall nor after the range, where a
  // buyer's in-range purchases can add up to ₹0 even though their window total does not.
  const all = (buyers || []).filter((b) => !isZeroRupees(Number(b?.saleTotal) || 0));
  const ranged = saleBuyersInRange(all, tools.from, tools.to);
  // Product and amount pick purchases (totals follow), then the ₹0 drop again.
  const narrowed = filterSalePurchases(ranged, tools).filter((b) => !isZeroRupees(Number(b?.saleTotal) || 0));
  // Buyer-level filters: EiFlix New User or not, the caller's own rule (repeat buyers), then the search.
  const type = tools.buyerType || 'all';
  const searched = narrowed
    .filter((b) => type === 'all' || (type === 'eiflix') === isEiflixNewBuyer(b, newUserIds))
    .filter((b) => !keepBuyer || keepBuyer(b))
    .filter((b) => matchesSaleSearch(b, tools.query));
  const shown = sortSaleBuyers(searched, tools.sort);
  const total = saleBuyersTotal(shown);
  return {
    buyers: shown, rows: shown.map((b) => toSaleRow(b, newUserIds)), total, totalLabel: formatRupees(total), count: shown.length,
    filtered: saleToolsNarrow(tools),
    allTotalLabel: formatRupees(saleBuyersTotal(all)),
    allCount: all.length,
  };
}

/**
 * The phone for the spreadsheet, as TWO cells — the dial code (digits only) and the number — the way the repo's
 * other phone exports write it ('Country Code', 'Phone'). One "+91 9820000006" cell would start with '+', which
 * Excel and Google Sheets read as a formula (#NULL! / #ERROR!). A number stored with its own dial code
 * ("+44 7700 900123") is split at its first separator; with none, the '+' is dropped so the cell stays text-safe.
 */
export function exportPhoneParts(b: any): { code: string; number: string } {
  const m = b?.metadata || {};
  let num = str(m['phonenumber']);
  let code = str(m['countrycode'] ?? m['countryCode']).replace(/\D/g, '');
  if (!num) return { code: '', number: '' };
  if (num.startsWith('+')) {
    const split = /^\+(\d{1,4})[\s\-.]+(.+)$/.exec(num);
    if (split) {
      code = split[1];
      num = split[2].trim();
    } else {
      const digits = num.replace(/^\++/, '');
      // "+919820000006" with countrycode 91: the stored dial code is the prefix — keep the two apart.
      if (code && digits.startsWith(code) && digits.length > code.length) num = digits.slice(code.length);
      else { code = ''; num = digits; }
    }
  }
  return { code, number: num };
}

/**
 * A text cell a spreadsheet would read as a formula — one starting with '=', '+', '-' or '@' (or a tab / carriage
 * return, which some of them skip before looking) — gets a leading apostrophe, the usual "this is text" mark, so it
 * opens as the same readable text instead of being evaluated (CSV injection). Numbers and other text are unchanged.
 */
export function csvTextCell<T extends string | number>(v: T): T | string {
  return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/**
 * Export rows for what is shown: ONE ROW PER PURCHASE with the buyer's name, email and phone (saleExportRows —
 * the dashboard's CSV writer has one sheet, so there is no separate Buyers sheet). Each buyer's purchases stay
 * oldest first, as saleExportRows writes them. The phone is two columns, 'Country Code' then 'Phone'
 * (exportPhoneParts), so it never starts with '+'; and every text cell goes through csvTextCell, so a name, email or
 * product that starts with a formula character stays text.
 */
export function saleDialogExportRows(shown: any[]): Record<string, string | number>[] {
  const out: Record<string, string | number>[] = [];
  for (const b of shown || []) {
    const phone = exportPhoneParts(b);
    for (const r of saleExportRows([b])) {
      const row: Record<string, string | number> = {
        'Participant Name': r['Participant Name'],
        'Email': r['Email'],
        'Country Code': phone.code,
        'Phone': phone.number,
        'Purchase Date': r['Purchase Date'],
        'Product': r['Product'],
        'Amount': r['Amount'],
      };
      for (const k of Object.keys(row)) row[k] = csvTextCell(row[k]);
      out.push(row);
    }
  }
  return out;
}

/**
 * The side panel's Sale Achieved file name, kept as it was: workshop-sale-achieved-<workshop>-<yyyy-mm-dd>.csv.
 * PRE-EXISTING, kept on purpose: the date is toISOString's, i.e. the UTC day — in IST before 05:30 that is yesterday.
 */
export function saleExportFileName(workshopTitle: string, now: Date = new Date()): string {
  return `workshop-sale-achieved-${str(workshopTitle) || 'workshop'}-${now.toISOString().split('T')[0]}.csv`;
}

// ==================== New Sales / Funnel Sales / Upgrades (operator 2026-11-23) ====================
// "1st sale" = a person's FIRST PURCHASE EVER: their earliest paid, dated purchase across their whole Watson history
// (saleFirstPaidMs, set by the dashboard from every purchase it already reads — firstSaleMs in watson-purchases).
// Each paid purchase inside the sale window goes into exactly ONE section:
//   new     — it is the person's first sale (every purchase at that same moment — one checkout — ties as first);
//   funnel  — the person's first sale is inside this window, and this purchase came after it;
//   upgrade — the person's first sale was before the window.
// So a new customer who bought again is in New Sales (the first purchase) AND in Funnel Sales (the rest).
// The type comes from the person's whole history, so the From / To range never changes it — the range only picks
// which of the window's purchases are shown.

export type SaleType = 'new' | 'funnel' | 'upgrade';
export const SALE_TYPES: readonly SaleType[] = ['new', 'funnel', 'upgrade'];

/** What each section is called on screen and in the export's "Type" column. No field names. */
export const SALE_TYPE_TEXT: Readonly<Record<SaleType, { title: string; note: string; exportLabel: string }>> = {
  new: { title: 'New Sales', note: 'Their first purchase ever', exportLabel: 'New Sale' },
  funnel: { title: 'Funnel Sales', note: 'Bought again after a first purchase in this window', exportLabel: 'Funnel' },
  upgrade: { title: 'Upgrades', note: 'First purchase was before this window', exportLabel: 'Upgrade' },
};

/** The window's first moment from the dialog's `min` ('yyyy-mm-dd', the registration start's day, LOCAL midnight —
 *  the same moment saleWindow starts at). null without a window. */
export function saleWindowStartMs(min: string): number | null {
  const d = anyToDate(str(min));
  return d ? d.getTime() : null;
}

/**
 * Splits ONE person's in-window purchases into the three sections. Only PAID, DATED lines are sales (isPaidAmount:
 * shows as more than ₹0); the rest are not listed anywhere.
 * `firstPaidMs` is their first sale ever. The person's own paid in-window lines are part of that history, so the first
 * sale can never be later than the earliest of them — taking the earlier of the two also covers a buyer that carries
 * no first-sale moment (every in-window purchase after their earliest one is then Funnel).
 * `windowStartMs` null (no window) places the first sale inside: later purchases are Funnel.
 */
export function classifySalePurchases<P extends { date?: Date | null; amount?: number | null }>(
  purchases: P[], firstPaidMs: number | null | undefined, windowStartMs: number | null,
): Record<SaleType, P[]> {
  const out: Record<SaleType, P[]> = { new: [], funnel: [], upgrade: [] };
  const paid = (purchases || []).filter((p) => p?.date instanceof Date && !isNaN(p.date.getTime()) && isPaidAmount(p.amount));
  if (!paid.length) return out;
  let first = Math.min(...paid.map((p) => (p.date as Date).getTime()));
  if (typeof firstPaidMs === 'number' && Number.isFinite(firstPaidMs) && firstPaidMs < first) first = firstPaidMs;
  const firstInWindow = windowStartMs === null || first >= windowStartMs;
  for (const p of paid) {
    const t = (p.date as Date).getTime();
    out[t === first ? 'new' : firstInWindow ? 'funnel' : 'upgrade'].push(p);
  }
  return out;
}

/** The section's copy of a buyer: only that section's purchases, with the total, label and latest date recomputed. */
function sectionBuyer(b: any, type: SaleType, rows: any[]): any {
  const total = rows.reduce((a, r) => a + (Number(r?.amount) || 0), 0);
  return {
    ...b, saleType: type, salePurchases: rows, saleTotal: total, saleTotalLabel: formatRupees(total),
    saleLastDate: Math.max(...rows.map((r) => (r.date as Date).getTime())),
  };
}

/** Every buyer split into the three sections (a person can be in more than one). A section copy totalling ₹0 is
 *  dropped. Purchases stay oldest first, as the card stores them. The buyers handed in are not changed. */
export function saleTypeBuyers(buyers: any[], windowStartMs: number | null): Record<SaleType, any[]> {
  const out: Record<SaleType, any[]> = { new: [], funnel: [], upgrade: [] };
  for (const b of buyers || []) {
    const split = classifySalePurchases(b?.salePurchases || [], b?.saleFirstPaidMs, windowStartMs);
    for (const type of SALE_TYPES) {
      if (!split[type].length) continue;
      const copy = sectionBuyer(b, type, split[type]);
      if (!isZeroRupees(copy.saleTotal)) out[type].push(copy);
    }
  }
  return out;
}

/** One person, whichever sections they are in — for the unique buyer count. */
export function saleBuyerKey(b: any): string {
  return str(b?.profileid) || str(b?.name);
}

export interface SaleSectionView extends SaleDialogView {
  type: SaleType;
  title: string;
  note: string;
}

export interface SaleSectionsView {
  /** Always the three, in order: New Sales, Funnel Sales, Upgrades. */
  sections: SaleSectionView[];
  new: SaleSectionView;
  funnel: SaleSectionView;
  upgrade: SaleSectionView;
  /** Of what is shown (range and search applied): the sum of the three sections, and the UNIQUE buyers in them. */
  total: number;
  totalLabel: string;
  count: number;
  /** A range or a search is set. */
  filtered: boolean;
  /** Every paid purchase in the window, before the range and the search; unique buyers. */
  allTotal: number;
  allTotalLabel: string;
  allCount: number;
}

/**
 * The dialog's three sections. Each one runs the same tools as before (saleDialogView: range — which only picks the
 * purchases shown, never their type — then the ₹0 drop, the search and the sort), so search and sort are shared.
 * The overall figures add the sections up; the buyer count is UNIQUE (a new customer who bought again is one buyer,
 * though they are in New Sales and Funnel Sales). `newUserIds` marks a person's row in every section they are in.
 */
export function saleSectionsView(
  buyers: any[], tools: SaleTools, windowStartMs: number | null, newUserIds?: ReadonlySet<string> | null,
): SaleSectionsView {
  const typed = saleTypeBuyers(buyers, windowStartMs);
  // Repeat buyers = 2 or more paid purchases in the whole sale window, counted across the three sections (a new
  // customer's first purchase is in New Sales and the rest in Funnel — together they are one repeat buyer).
  const windowCount = new Map<string, number>();
  for (const t of SALE_TYPES) for (const b of typed[t]) {
    windowCount.set(saleBuyerKey(b), (windowCount.get(saleBuyerKey(b)) || 0) + (b.salePurchases?.length || 0));
  }
  const keep = tools.repeatOnly ? (b: any) => (windowCount.get(saleBuyerKey(b)) || 0) >= 2 : null;
  const sections = SALE_TYPES.map((type): SaleSectionView => ({
    ...saleDialogView(typed[type], tools, newUserIds, keep), type, title: SALE_TYPE_TEXT[type].title, note: SALE_TYPE_TEXT[type].note,
  }));
  const unique = (lists: any[][]) => new Set(lists.flatMap((l) => l.map(saleBuyerKey))).size;
  const total = sections.reduce((a, s) => a + s.total, 0);
  const allTotal = SALE_TYPES.reduce((a, t) => a + saleBuyersTotal(typed[t]), 0);
  return {
    sections, new: sections[0], funnel: sections[1], upgrade: sections[2],
    total, totalLabel: formatRupees(total), count: unique(sections.map((s) => s.buyers)),
    filtered: saleToolsNarrow(tools),
    allTotal, allTotalLabel: formatRupees(allTotal), allCount: unique(SALE_TYPES.map((t) => typed[t])),
  };
}

/** Export of what is shown: one row per purchase as before (saleDialogExportRows), section by section, with a
 *  "Type" column first — New Sale / Funnel / Upgrade. */
export function saleSectionsExportRows(view: SaleSectionsView): Record<string, string | number>[] {
  const out: Record<string, string | number>[] = [];
  for (const s of view?.sections || []) {
    for (const row of saleDialogExportRows(s.buyers)) out.push({ 'Type': SALE_TYPE_TEXT[s.type].exportLabel, ...row });
  }
  return out;
}
