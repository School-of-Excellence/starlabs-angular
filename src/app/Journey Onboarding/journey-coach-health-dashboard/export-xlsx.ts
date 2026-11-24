import * as XLSX from 'xlsx';

/** One worksheet: a header row followed by data rows (array-of-arrays). */
export interface ExportSheet { name: string; rows: unknown[][]; }

/** Shared "Export" for the JC Health dialogs (2026-11-20). Writes one .xlsx with one sheet per
 *  non-empty list, named `<fileBase>_<YYYY-MM-DD>.xlsx`. Same library + file naming as the
 *  Onboarding tab's existing dialog exports, so every download from the screen looks alike. */
export function exportXlsx(fileBase: string, sheets: ExportSheet[]): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    if (s.rows.length < 2) continue;   // header only → nothing to export on this sheet
    let name = (s.name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
    for (let i = 2; used.has(name); i++) name = `${name.slice(0, 28)} ${i}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows as any[][]), name);
  }
  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data']]), 'Export');
  const safe = fileBase.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
  XLSX.writeFile(wb, `${safe}_${isoDay(new Date())}.xlsx`);
}

/** 'YYYY-MM-DD HH:mm' in local time ('' for nothing / an invalid date). Midnight drops the time. */
export function fmtExportDate(v: unknown): string {
  const d = toDate(v);
  if (!d) return '';
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return hm === '00:00' ? isoDay(d) : `${isoDay(d)} ${hm}`;
}

/** Generic list → sheet rows: the union of the items' keys (first-seen order) as the header, dates
 *  formatted, arrays of plain values joined, nested objects left out. For dialog lists whose items
 *  are already display-shaped (the slide-over sections). */
export function objectsToRows(items: readonly object[]): unknown[][] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const it of items) for (const k of Object.keys(it ?? {})) {
    if (seen.has(k)) continue;
    const v = (it as any)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && !toDate(v)) continue;   // nested object
    seen.add(k); keys.push(k);
  }
  const cell = (v: any): unknown => {
    if (v == null) return '';
    const d = toDate(v);
    if (d) return fmtExportDate(d);
    if (Array.isArray(v)) return v.filter(x => x == null || typeof x !== 'object').join(', ');
    return typeof v === 'object' ? '' : v;
  };
  return [keys.map(humanize), ...items.map(it => keys.map(k => cell((it as any)[k])))];
}

function toDate(v: any): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v && typeof v.toDate === 'function') { try { return v.toDate(); } catch { return null; } }   // Firestore Timestamp
  return null;
}
function pad(n: number): string { return String(n).padStart(2, '0'); }
function isoDay(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
/** 'profileid' → 'Profileid', 'dueDate' → 'Due date', 'actor_name' → 'Actor name'. */
function humanize(k: string): string {
  const s = k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
