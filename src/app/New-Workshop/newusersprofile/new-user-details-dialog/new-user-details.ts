import { DatePipe } from '@angular/common';

/**
 * New Users · person details dialog (plan specs/plans/2026-11-18-new-user-details-dialog.md).
 * Pure helpers: every label the dialog shows and the one write it makes. No Firestore, no DOM, so the
 * unit spec can pin each rule. Not a component on purpose (a hook-less *.component.ts fails the gate).
 *
 * The rules mirror the New Users table (newusersprofile.component.ts buildVm / dateMs / computeTagNames)
 * so a person reads the same in the row and in the dialog.
 */

/** Shown for an empty value. */
export const NIL = '—';

/** The table's Created format ('d MMM y, h:mm a'), in the browser's local time. */
export const DATE_FORMAT = 'd MMM y, h:mm a';

const datePipe = new DatePipe('en-US');

/** The one write a flip makes. Field names live here only, never in the UI. */
export interface HoldWrite {
  deliveryonhold: boolean;
  deliveryonholdby: { time: unknown; user: string };
}

/** Who made the last hold change and when (from the stored map). */
export interface HoldBy {
  user: string;
  ms: number | null;
}

/** Everything the dialog shows, as text. */
export interface NewUserDetailsView {
  name: string;
  email: string;
  initials: string;
  phone: string;
  status: string;
  account: 'Enabled' | 'Disabled';
  enabled: boolean;
  created: string;
  lastLogin: string;
  converted: 'Yes' | 'No';
  movedOn: string;
  tags: string[];
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

/** Epoch ms of a Timestamp, Date, string or number; null when missing or unparseable (the table's dateMs). */
export function toMs(value: any): number | null {
  if (!value) return null;
  let ms: number;
  try {
    if (typeof value?.toMillis === 'function') ms = value.toMillis();
    else if (typeof value?.toDate === 'function') ms = value.toDate()?.getTime();
    else ms = new Date(value).getTime();
  } catch {
    return null;
  }
  return Number.isFinite(ms) ? ms : null;
}

/** 'd MMM y, h:mm a' for an epoch, or '' when there is none. */
export function formatWhen(ms: number | null): string {
  if (ms == null) return '';
  return datePipe.transform(new Date(ms), DATE_FORMAT) || '';
}

/** A stored date as the table writes it, or `empty` when missing. */
export function dateLabel(value: unknown, empty = NIL): string {
  return formatWhen(toMs(value)) || empty;
}

export function nameLabel(u: any): string {
  return text(u?.name) || NIL;
}

export function emailLabel(u: any): string {
  return text(u?.email) || NIL;
}

/** "+91 98765 43210"; just the number without a code; "—" without a number. */
export function phoneLabel(u: any): string {
  const number = text(u?.phonenumber);
  if (!number) return NIL;
  const cc = text(u?.countryCode);
  return cc ? `${cc} ${number}` : number;
}

/** "active" -> "Active" (first letter only; the rest as stored). "—" when missing, blank or not text. */
export function statusLabel(u: any): string {
  const s = typeof u?.status === 'string' ? u.status.trim() : '';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : NIL;
}

/** The table's Status rule: any truthy value is Enabled. */
export function accountLabel(u: any): 'Enabled' | 'Disabled' {
  return u?.enable ? 'Enabled' : 'Disabled';
}

/** The screen's Conversion wording: only a stored true counts. */
export function convertedLabel(u: any): 'Yes' | 'No' {
  return u?.movedtoexist === true ? 'Yes' : 'No';
}

export function createdLabel(u: any): string {
  return dateLabel(u?.created);
}

export function lastLoginLabel(u: any): string {
  return dateLabel(u?.last_login, 'Never');
}

export function movedOnLabel(u: any): string {
  return dateLabel(u?.movedon);
}

/** The table's tag names: each id through the map, in the person's own order; unknown ids are dropped. */
export function tagNamesOf(u: any, tagMap: Record<string, string> | null | undefined): string[] {
  const ids: unknown[] = Array.isArray(u?.tags) ? u.tags : [];
  const map = tagMap || {};
  return ids
    .map(id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(map, id) ? map[id] : ''))
    .filter((n): n is string => typeof n === 'string' && !!n);
}

/** The table's initials: first and last word, one word, the email's first letter, or "?". */
export function initialsOf(name: string, email: string): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  return email ? email[0].toUpperCase() : '?';
}

/** Missing (or anything but true) means off. */
export function isOnHold(u: any): boolean {
  return u?.deliveryonhold === true;
}

/** The stored "who and when", or null when nothing has been recorded. */
export function holdByOf(u: any): HoldBy | null {
  const b = u?.deliveryonholdby;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  let user = '';
  if (typeof b.user === 'string') user = b.user.trim();
  else if (b.user && typeof b.user === 'object' && typeof b.user.id === 'string') user = b.user.id.trim();
  return { user, ms: toMs(b.time) };
}

/**
 * "Turned on by Nanda · 18 Nov 2026, 2:10 PM" / "Turned off by …". The name is left out when it can't be
 * found, the date when none is stored.
 */
export function holdCaption(on: boolean, name: string | null | undefined, ms: number | null): string {
  const verb = on ? 'Turned on' : 'Turned off';
  const who = (name || '').trim();
  const head = who ? `${verb} by ${who}` : verb;
  const when = formatWhen(ms);
  return when ? `${head} · ${when}` : head;
}

/**
 * The single updateDoc payload for a flip, on or off: the new value plus who and when (the operator chose
 * "record every change"). `time` is the caller's serverTimestamp(). null without a profile id: no write.
 */
export function buildHoldWrite(next: boolean, profileId: string | null | undefined, time: unknown): HoldWrite | null {
  const user = typeof profileId === 'string' ? profileId.trim() : '';
  if (!user) return null;
  return { deliveryonhold: next === true, deliveryonholdby: { time, user } };
}

/** Every displayed value for one person. */
export function detailsView(u: any, tagMap: Record<string, string> | null | undefined): NewUserDetailsView {
  const account = accountLabel(u);
  return {
    name: nameLabel(u),
    email: emailLabel(u),
    initials: initialsOf(text(u?.name), text(u?.email)),
    phone: phoneLabel(u),
    status: statusLabel(u),
    account,
    enabled: account === 'Enabled',
    created: createdLabel(u),
    lastLogin: lastLoginLabel(u),
    converted: convertedLabel(u),
    movedOn: movedOnLabel(u),
    tags: tagNamesOf(u, tagMap),
  };
}
