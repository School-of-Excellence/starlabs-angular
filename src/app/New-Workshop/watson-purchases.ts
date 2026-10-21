/**
 * Watson purchases — shared by the EiFlix operations dashboard (New Users to Paid hover card) and the
 * workshop dashboard (Sale Achieved card). READ-ONLY: StarLabs reads Watson, it never writes to it
 * (operator directive, 2026-10-14).
 */
import { formatDate } from '@angular/common';
import { getApp, getApps, initializeApp } from '@angular/fire/app';
import { getFirestore } from '@angular/fire/firestore';
import { environment } from '../../environments/environment';

export interface WatsonPurchaseRow { date: Date | null; product: string; amount: number | null; }

/**
 * One row per product bought, from Watson `ParticipantPurchases`: purchase date, product, and `fee` — the
 * price before GST (the doc stores `gst` and `gross` separately). Cancelled purchases are left out.
 * Oldest first.
 */
export function watsonPurchaseRows(purchaseDocs: any[]): WatsonPurchaseRow[] {
  return purchaseDocs
    .filter((p) => p?.['cancelled'] !== true && String(p?.['purchasestatus'] ?? '').toLowerCase() !== 'cancelled')
    .map((p) => {
      const ts = p?.['purchasedate_ts'];
      let date: Date | null = ts?.toDate ? ts.toDate() : null;
      if (!date && typeof p?.['purchasedate'] === 'string') {
        const [y, m, d] = p['purchasedate'].split('-').map(Number);   // 'yyyy-mm-dd', local date
        date = y && m && d ? new Date(y, m - 1, d) : null;
      }
      const fee = Number(p?.['fee']);
      return {
        date: date && !isNaN(date.getTime()) ? date : null,
        product: String(p?.['product'] ?? '').trim(),   // '' when missing — the card then shows no name line
        amount: Number.isFinite(fee) ? fee : null
      };
    })
    .sort((x, y) => (x.date?.getTime() ?? Infinity) - (y.date?.getTime() ?? Infinity));
}

/** A Firestore Timestamp, Date, 'yyyy-mm-dd' (read as LOCAL) or other date string -> Date, else null. */
export function anyToDate(v: any): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
    const [y, m, d] = v.trim().split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Sale Achieved window: registration start (start of day) to ONE CALENDAR MONTH after the workshop end
 * (end of day). A month-end start is clamped (31 Jan + 1 month = 28/29 Feb, not 3 Mar).
 * Null when either date is missing — there is no window to count in.
 */
export function saleWindow(registrationStart: any, workshopEnd: any): { start: Date; end: Date } | null {
  const s = anyToDate(registrationStart);
  const e = anyToDate(workshopEnd);
  if (!s || !e) return null;
  const start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
  const lastDayNextMonth = new Date(e.getFullYear(), e.getMonth() + 2, 0).getDate();
  const end = new Date(e.getFullYear(), e.getMonth() + 1, Math.min(e.getDate(), lastDayNextMonth), 23, 59, 59, 999);
  return { start, end };
}

/** Purchases dated inside the window (undated purchases cannot be placed, so they are left out). */
export function purchasesInWindow(rows: WatsonPurchaseRow[], win: { start: Date; end: Date }): WatsonPurchaseRow[] {
  return rows.filter((r) => !!r.date && r.date >= win.start && r.date <= win.end);
}

/**
 * Rupees with INDIAN digit grouping, rounded to the rupee: 20694876 -> "₹2,06,94,876" (operator 2026-10-14).
 * Uses the browser's Intl ('en-IN') rather than Angular's formatCurrency, which would need the en-IN locale
 * data registered app-wide. Master Class Purchase already formats this way.
 */
export function formatRupees(v: number): string {
  return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');
}

export function purchaseLabels(r: WatsonPurchaseRow): WatsonPurchaseRow & { dateLabel: string; amountLabel: string } {
  return { ...r, dateLabel: r.date ? formatDate(r.date, 'd MMM y', 'en-US') : '—', amountLabel: r.amount === null ? '—' : formatRupees(r.amount) };
}

/**
 * The Watson Firestore, initialised exactly as AuthguardService.initializeWatson does; null when this
 * build has no Watson config (the emulator build, deliberately). READ-ONLY use only.
 */
export function watsonFirestore(): any | null {
  const cfg = (environment as any)['watson'];
  if (!cfg) return null;
  if (!getApps().some((a) => a.name === 'watson')) initializeApp(cfg, 'watson');
  return getFirestore(getApp('watson'));
}

/**
 * Sale Achieved matching, pure so it can be unit-tested without Watson:
 *   enrolled profileid -> email -> EVERY Watson participant with that email (case-insensitive)
 *   -> their ParticipantPurchases -> only purchases dated inside the window.
 * Returns one entry per enrolled person with at least one purchase in the window, biggest buyer first.
 */
export function buildSaleBuyers(
  emailByProfile: Map<string, string>,
  participantDocs: { id: string; data: any }[],
  purchaseDocs: any[],
  win: { start: Date; end: Date },
): { profileid: string; rows: WatsonPurchaseRow[]; total: number }[] {
  const pidsByEmail = new Map<string, Set<string>>();
  for (const d of participantDocs) {
    const key = String(d.data?.['email'] ?? '').trim().toLowerCase();
    const pid = d.data?.['id'] ?? d.id;
    if (!key || pid === undefined || pid === null) continue;
    if (!pidsByEmail.has(key)) pidsByEmail.set(key, new Set());
    pidsByEmail.get(key)!.add(String(pid));
  }
  const docsByPid = new Map<string, any[]>();
  for (const p of purchaseDocs) {
    const key = String(p?.['participantid']);
    if (!docsByPid.has(key)) docsByPid.set(key, []);
    docsByPid.get(key)!.push(p);
  }
  const out: { profileid: string; rows: WatsonPurchaseRow[]; total: number }[] = [];
  emailByProfile.forEach((email, profileid) => {
    const pids = pidsByEmail.get(String(email).trim().toLowerCase());
    if (!pids) return;
    const rows = purchasesInWindow(watsonPurchaseRows([...pids].flatMap((pid) => docsByPid.get(pid) || [])), win);
    if (!rows.length) return;
    out.push({ profileid, rows, total: rows.reduce((a, r) => a + (r.amount ?? 0), 0) });
  });
  return out.sort((a, b) => b.total - a.total);
}

/**
 * Sale Achieved panel order (operator 2026-10-14) — the panel SORTS, it does not filter:
 *  'amount' → biggest total first; 'recent' → latest purchase first. Ties keep a stable name order.
 * Entries carry `saleTotal` (number) and `saleLastDate` (ms of their latest purchase in the window).
 */
export function sortSaleBuyers<T extends { saleTotal?: number; saleLastDate?: number; name?: string }>(
  list: T[], by: 'amount' | 'recent',
): T[] {
  const key = (p: T) => (by === 'amount' ? p.saleTotal ?? 0 : p.saleLastDate ?? 0);
  return [...list].sort((a, b) => key(b) - key(a) || String(a.name ?? '').localeCompare(String(b.name ?? '')));
}

/**
 * Sale Achieved export: ONE ROW PER PURCHASE, in panel order, each person's purchases oldest first —
 * person details repeated so every row stands alone in a spreadsheet. Amount is a number (rupees).
 */
export function saleExportRows(buyers: any[]): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];
  for (const b of buyers) {
    for (const p of b.salePurchases || []) {
      rows.push({
        'Participant Name': b.name || 'N/A',
        'Email': b.metadata?.email || '',
        'Phone': b.metadata?.phonenumber || '',
        'Purchase Date': p.dateLabel || '',
        'Product': p.product || '',
        'Amount': typeof p.amount === 'number' ? Math.round(p.amount) : '',
      });
    }
  }
  return rows;
}
