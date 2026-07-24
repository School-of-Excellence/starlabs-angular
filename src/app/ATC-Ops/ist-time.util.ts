import { Timestamp } from '@angular/fire/firestore';

/**
 * IST (Asia/Kolkata, UTC+05:30) day-boundary helpers.
 * The ATC pipeline windows "today" on IST midnight, NOT the browser's local
 * midnight — centralize the math here so every panel agrees.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +05:30
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for the current IST day (used as rollup/dropoff doc ids). */
export function todayIST(now: number = Date.now()): string {
  // Shift epoch into IST wall-clock, then read the date parts in UTC.
  const istWall = new Date(now + IST_OFFSET_MS);
  const y = istWall.getUTCFullYear();
  const m = String(istWall.getUTCMonth() + 1).padStart(2, '0');
  const d = String(istWall.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Firestore Timestamp for IST midnight of the current IST day (UTC instant). */
export function todayStartIST(now: number = Date.now()): Timestamp {
  const istWallMs = now + IST_OFFSET_MS;
  const istMidnightWallMs = Math.floor(istWallMs / DAY_MS) * DAY_MS;
  const utcEpochMs = istMidnightWallMs - IST_OFFSET_MS;
  return Timestamp.fromMillis(utcEpochMs);
}

/** `YYYY-MM-DD` string for `daysAgo` IST days before today (inclusive-friendly range building). */
export function istDateNDaysAgo(daysAgo: number, now: number = Date.now()): string {
  return todayIST(now - daysAgo * DAY_MS);
}

/** Trailing window of IST date strings, oldest → newest (length = days, includes today). */
export function istDateWindow(days: number, now: number = Date.now()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(istDateNDaysAgo(i, now));
  return out;
}

/** Matches an IST day id (`YYYY-MM-DD`) — the rollup writes `firstSeen` in this form. */
const IST_DAY_ID = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Normalize a Firestore Timestamp | Date | millis | IST day id to millis (or null). */
export function toMillis(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  // `scope_enhancement_atc_usage_lifetime.firstSeen` is a plain IST day string,
  // not a Timestamp (se_atc_usage.js writes `firstSeen = dateStr`). Resolve it to
  // IST midnight so it agrees with todayStartIST() rather than rendering as null.
  if (typeof v === 'string') {
    const m = IST_DAY_ID.exec(v);
    if (!m) return null;
    const utcMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(utcMidnight) ? null : utcMidnight - IST_OFFSET_MS;
  }
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
}

/** Normalize a Firestore Timestamp | Date | millis to a JS Date (or null). */
export function toDate(v: any): Date | null {
  const ms = toMillis(v);
  return ms == null ? null : new Date(ms);
}
