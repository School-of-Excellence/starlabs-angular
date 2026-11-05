/**
 * People Send dialog — the shape every caller passes in (operator 2026-10-21).
 *
 * The dialog is shared by many screens and loads NOTHING itself: the caller hands over the people
 * it already has, and the dialog only lists, searches, sorts, pages and selects them.
 */
export interface PeopleSendRow {
  name: string;
  email: string;
  /** Country code with its leading "+" (e.g. "+91"), or '' when unknown. */
  countrycode: string;
  phonenumber: string;
  /** "New user" / "Existing" — whatever the caller decides; '' when it doesn't say. */
  usertype: string;
  journey: string;
}

/** What a caller's Send handler reports back; the dialog shows `message`. */
export interface PeopleSendResult {
  ok: boolean;
  message: string;
}

export interface PeopleSendDialogData {
  /** Heading, e.g. "Send to Slack". */
  title: string;
  /** Line under the heading, e.g. "Hot Leads Today". */
  subtitle?: string;
  rows: PeopleSendRow[];
  /**
   * What Send does — decided by the caller, never by the dialog (operator 2026-10-28). Given the
   * selected people in the table's order. Without it, Send stays inert.
   */
  send?: (rows: PeopleSendRow[]) => Promise<PeopleSendResult>;
}

/** Any caller's row -> a complete PeopleSendRow (missing values become ''). */
export function toPeopleSendRow(r: any): PeopleSendRow {
  const s = (v: any) => (v === null || v === undefined ? '' : String(v)).trim();
  // Stored as countryCode or countrycode, with or without the "+" — normalised to "+91".
  let cc = s(r?.countrycode ?? r?.countryCode);
  if (cc && !cc.startsWith('+')) cc = '+' + cc;
  return {
    name: s(r?.name), email: s(r?.email), countrycode: cc, phonenumber: s(r?.phonenumber),
    usertype: s(r?.usertype), journey: s(r?.journey),
  };
}

/** The phone as shown and exported: "+91 9876543210", or just the number when there is no code. */
export function peopleSendPhone(r: PeopleSendRow): string {
  if (!r.phonenumber) return '';
  return r.countrycode ? `${r.countrycode} ${r.phonenumber.replace(/^\+/, '')}` : r.phonenumber;
}

/** The search box: name, email, phone or journey contains the text (case-insensitive). */
export function peopleSendMatches(r: PeopleSendRow, text: string): boolean {
  const q = (text || '').trim().toLowerCase();
  if (!q) return true;
  return [r.name, r.email, peopleSendPhone(r), r.usertype, r.journey].some(v => v.toLowerCase().includes(q));
}

/** One CSV cell: quoted when it holds a comma, quote or line break; quotes doubled. */
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** The selected people as CSV text (header + one line each), in the order given. */
export function peopleSendCsv(rows: PeopleSendRow[]): string {
  const lines = [['Name', 'Email', 'Phone', 'User Type', 'Journey']];
  rows.forEach(r => lines.push([r.name, r.email, peopleSendPhone(r), r.usertype, r.journey]));
  return lines.map(l => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** A file name from the dialog title and today's date, e.g. "send-to-slack-2026-10-22.csv". */
export function peopleSendFileName(title: string, today: Date = new Date()): string {
  const slug = (title || 'people').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'people';
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return `${slug}-${d}.csv`;
}
