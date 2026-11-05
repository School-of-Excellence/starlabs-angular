// A `time` answer is stored as "HH:mm" — 24-hour, zero-padded (operator, 2026-11-03).
//
// WHY A CONVERTER AND NOT JUST THE RAW CONTROL VALUE: `matTimepicker`'s control value is a Date, so
// patching and saving it as-is put a Date in Firestore (a Timestamp) — which the Flutter app reads as a
// string and crashed on, and which the preview dialogs printed as "Timestamp(seconds=…)". The string is now
// the stored shape everywhere; each UI converts at its own boundary and nothing else in the pipeline cares.
//
// Reads accept the three shapes the data actually holds, so no migration is needed and no old answer breaks:
//   - a Firestore Timestamp, written by the web before this change
//   - "H:m" unpadded, written by the Flutter app before this change
//   - a date-time string, which is what a Date becomes once it has been through JSON (a localStorage draft)
//   - "HH:mm", written by both from now on
// An answer heals itself the next time it is saved. Once nothing is left but "HH:mm", the first two branches
// can go.

const pad = (n: number) => n.toString().padStart(2, '0');

const fromDate = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Whatever a time field holds → "HH:mm", or null when it holds nothing usable. */
export function timeToString(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toDate === 'function') return fromDate(value.toDate()); // Firestore Timestamp
  if (value instanceof Date) return fromDate(value);
  const parts = value.toString().split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (parts.length >= 2 && Number.isFinite(hours) && Number.isFinite(minutes)) {
    return `${pad(hours)}:${pad(minutes)}`;
  }
  // not "H:m" — the remaining shape a time answer can arrive in is a date-time string, which is what a Date
  // becomes once it has been through JSON (a localStorage draft, an export). Blank is worse than converting it.
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : fromDate(parsed);
}

/** The same value → a Date for `matTimepicker`, which has no string form. The date part is today's and is
 *  never stored: the control is read back through timeToString on save. */
export function timeToDate(value: any): Date | null {
  const hhmm = timeToString(value);
  if (hhmm === null) return null;
  const [hours, minutes] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}
