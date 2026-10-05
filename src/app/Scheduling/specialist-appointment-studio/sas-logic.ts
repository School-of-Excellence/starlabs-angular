/* Pure logic for the Specialist Appointment Studio: no Firestore, no Angular, so it is unit-testable.
   Firestore Timestamps are converted to Date by the caller (see toDate in the service). */

export type ViewRole = 'ah' | 'mentor' | 'cw' | null;

/* users_roles flag keys per view. The user can switch between every view they hold a role for
   ("View as"); the default is the highest in VIEW_ORDER. A mentor with no product (users_roles.productowner,
   ticked in Profile list) still gets the Mentor view, which then says no product is assigned; it is only
   skipped as the default when they have another view to land on. */
export const AH_KEYS = ['admin', 'ah', 'ahmember', 'developer', 'tester', 'scheduler'];
export const MENTOR_KEYS = ['mentor'];
export const CW_KEYS = ['eis', 'journeycoach', 'changeagent'];
export const VIEW_ORDER: Exclude<ViewRole, null>[] = ['mentor', 'ah', 'cw'];
export const VIEW_LABEL: Record<Exclude<ViewRole, null>, string> = { mentor: 'Mentor Specialist', ah: 'A&H Team', cw: 'CW Specialist' };

export const ownsProduct = (roles: Record<string, any> | null | undefined) =>
  !!roles && Array.isArray(roles['productowner']) && roles['productowner'].length > 0;

export function availableViews(roles: Record<string, any> | null | undefined): Exclude<ViewRole, null>[] {
  if (!roles) return [];
  const on = (keys: string[]) => keys.some(k => roles[k] === true);
  const has = { mentor: on(MENTOR_KEYS), ah: on(AH_KEYS), cw: on(CW_KEYS) };
  return VIEW_ORDER.filter(v => has[v]);
}

/* The view the screen opens on. */
export function resolveViewRole(roles: Record<string, any> | null | undefined): ViewRole {
  const views = availableViews(roles);
  const usable = views.filter(v => v !== 'mentor' || ownsProduct(roles));
  return usable[0] ?? views[0] ?? null;
}

export interface Interval { start: Date; end: Date; }

export const minutesBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 60000);

/* Total minutes covered by a set of intervals, overlapping time counted once. */
export function unionMinutes(list: Interval[]): number {
  const sorted = list.filter(i => i.end > i.start).sort((a, b) => a.start.getTime() - b.start.getTime());
  let total = 0, curS: Date | null = null, curE: Date | null = null;
  for (const i of sorted) {
    if (!curE || i.start > curE) {
      if (curS && curE) total += minutesBetween(curS, curE);
      curS = i.start; curE = i.end;
    } else if (i.end > curE) {
      curE = i.end;
    }
  }
  if (curS && curE) total += minutesBetween(curS, curE);
  return total;
}

/* An availability window as the screen uses it: the doc's own time plus its per-type slot arrays. */
/* index = position in the doc's per-type slot array (what booking writes back to). */
export interface Slot { typeId: string; start: Date; end: Date; booked: boolean; available: boolean; index?: number; }
export interface AvailWindow { id: string; profileId: string; start: Date; end: Date; typeIds: string[]; slots: Slot[]; }

export const windowMinutes = (w: AvailWindow) => minutesBetween(w.start, w.end);

/* Booked time inside a window. computeSlot cuts overlapping slots per type, so union them. */
export const bookedMinutes = (w: AvailWindow) => unionMinutes(w.slots.filter(s => s.booked));

/* A slot someone can still book: free and not started yet. */
const bookable = (s: Slot, now: Date) => s.available && !s.booked && s.start > now;

export type WindowState = 'open' | 'full' | 'ended' | 'unused';
export function windowState(w: AvailWindow, now: Date): WindowState {
  if (w.slots.some(s => bookable(s, now))) return 'open';
  if (w.end > now) return 'full';
  return w.slots.some(s => s.booked) ? 'ended' : 'unused';
}

/* What a window reads as. An open window that already holds a booking is "Partly booked": computeSlot
   cuts several start times per window, so one can be booked while another is still free. */
export function windowLabel(w: AvailWindow, now: Date): string {
  const st = windowState(w, now);
  if (st === 'open') return w.slots.some(s => s.booked) ? 'Partly booked' : 'Open for booking';
  return st === 'full' ? 'Fully booked' : st === 'ended' ? 'Ended' : 'Unused';
}

/* A window's status from its bookings (operator rules, 2026-09-29), first match wins:
   1. a live booking whose time has passed and is not marked       → Completion pending
   2. window over, every live booking marked completed             → Completed
   3. window over, no live booking: some were cancelled → Cancelled, none at all → Unused
   4. window not over: bookable time left → Partly booked (has bookings) / Open for booking;
      nothing bookable left → Fully booked (has bookings) / Unused
   "Live" = not cancelled. */
export const WINDOW_STATUSES = [
  'Open for booking', 'Partly booked', 'Fully booked', 'Completion pending', 'Completed', 'Cancelled', 'Unused',
] as const;
export type WindowStatus = typeof WINDOW_STATUSES[number];

export function windowStatus(w: AvailWindow, sessions: Appt[], now: Date): WindowStatus {
  const live = sessions.filter(a => !a.cancelled);
  if (live.some(a => a.end <= now && !a.attended)) return 'Completion pending';
  if (w.end <= now) {
    if (live.length) return 'Completed';
    return sessions.length ? 'Cancelled' : 'Unused';
  }
  if (openMinutes(w, now) > 0) return live.length ? 'Partly booked' : 'Open for booking';
  return live.length ? 'Fully booked' : 'Unused';
}

/* Open time = the time still bookable: free, future slots, overlap across types counted once.
   So open time > 0 exactly when the window is 'open', and leftover minutes too short for any
   session never count as open. */
export const openMinutes = (w: AvailWindow, now: Date) => unionMinutes(w.slots.filter(s => bookable(s, now)));

/* A specialist's status for a set of windows (e.g. this week) and their sessions. */
export type AvailStatus = 'In session' | 'Available' | 'Fully booked' | 'No availability';
export function availStatus(windows: AvailWindow[], appts: Appt[], now: Date): AvailStatus {
  if (appts.some(a => !a.cancelled && a.start <= now && a.end > now)) return 'In session';
  if (windows.some(w => openMinutes(w, now) > 0)) return 'Available';
  return windows.some(w => w.end > now) ? 'Fully booked' : 'No availability';
}

/* ---------- Appointments ---------- */
/* MarkAppointmentStatusComponent stores a no-show as cancelled with this reason. The screen never shows
   "no-show": it is a cancellation like any other, and this reason text is hidden. */
export const NO_SHOW_REASON = "Client didn't show up";

export interface Appt {
  id: string; start: Date; end: Date; attended: boolean; cancelled: boolean;
  cancelledReason: string | null; hostIds: string[]; participantId: string | null;
  typeId: string | null; productId: string | null; zoomUrl: string | null;
}

export type ApptStatus = 'Completed' | 'Cancelled' | 'In session' | 'Pending' | 'Booked';
export function apptStatus(a: Appt, now: Date): ApptStatus {
  if (a.attended && !a.cancelled) return 'Completed';
  if (a.cancelled) return 'Cancelled';
  if (a.start <= now && a.end > now) return 'In session';
  if (a.end <= now) return 'Pending';
  return 'Booked';
}

/* ---------- Hours summary ---------- */
export interface Hours {
  availMin: number; bookedMin: number; deliveredMin: number; unutilisedMin: number;
  cancelledMin: number; pct: number; completed: number;
}

/* Available = window hours · Booked = booked slot time · Delivered = attended & not cancelled ·
   Unutilised = Available − Delivered · Utilisation = Delivered ÷ Available. */
export function hoursSummary(windows: AvailWindow[], appts: Appt[]): Hours {
  const availMin = windows.reduce((a, w) => a + windowMinutes(w), 0);
  const bookedMin = windows.reduce((a, w) => a + bookedMinutes(w), 0);
  let deliveredMin = 0, cancelledMin = 0, completed = 0;
  for (const x of appts) {
    const m = minutesBetween(x.start, x.end);
    if (x.attended && !x.cancelled) { deliveredMin += m; completed++; }
    else if (x.cancelled) cancelledMin += m;
  }
  return {
    availMin, bookedMin, deliveredMin, cancelledMin, completed,
    unutilisedMin: Math.max(0, availMin - deliveredMin),
    pct: availMin ? (deliveredMin / availMin) * 100 : 0,
  };
}

/* 50 → "50 min", 60 → "1h", 70 → "1h 10m", 1590 → "26h 30m". Never days (operator, 2026-10-01). */
export function fmtHours(min: number): string {
  const m = Math.round(min), h = Math.floor(m / 60), r = m % 60;
  if (!h) return r + ' min';
  return r ? `${h}h ${r}m` : `${h}h`;
}

/* ---------- Slot preview: mirrors computeSlot (starlabs-cloud-function appointment.js) ----------
   Types are taken longest first; a start is offered every 30 minutes and kept only if the slot
   fits before the window ends. */
export interface TypeDur { id: string; duration: number; }
export function previewSlots(start: Date, end: Date, types: TypeDur[]): Record<string, Interval[]> {
  const out: Record<string, Interval[]> = {};
  const sorted = [...types].sort((a, b) => b.duration - a.duration);
  for (const t of sorted) {
    const list: Interval[] = [];
    let s = new Date(start);
    while (end > s) {
      const e = new Date(s.getTime() + t.duration * 60000);
      if (end >= e) list.push({ start: new Date(s), end: e });
      s = new Date(s.getTime() + 30 * 60000);
    }
    out[t.id] = list;
  }
  return out;
}

/* ---------- Period ---------- */
/* 'day' is offered on the calendar screens only (Home, Overview); see SasPeriodBarComponent.allowDay. */
export type PeriodMode = 'day' | 'week' | 'month';
export interface Period { mode: PeriodMode; from: Date; to: Date; }

export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/* from is inclusive, to is exclusive. */
export function periodOf(mode: PeriodMode, anchor: Date): Period {
  if (mode === 'day') {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    return { mode, from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1) };
  }
  if (mode === 'week') {
    const from = mondayOf(anchor);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    return { mode, from, to };
  }
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  return { mode, from, to };
}

export function shiftPeriod(p: Period, dir: 1 | -1): Period {
  const a = new Date(p.from);
  if (p.mode === 'day') a.setDate(a.getDate() + dir);
  else if (p.mode === 'week') a.setDate(a.getDate() + 7 * dir);
  else a.setMonth(a.getMonth() + dir);
  return periodOf(p.mode, a);
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/* Dates from a to b inclusive, at local midnight. */
export function daysBetween(a: Date, b: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const last = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  while (d <= last && out.length < 62) { out.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return out;
}

/* True when [s,e) overlaps any interval (same rule as add-appointment-availability's validateAvailabilityExists). */
export const overlapsAny = (s: Date, e: Date, list: Interval[]) =>
  list.some(i => (s >= i.start && s < i.end) || (e > i.start && e <= i.end) || (i.start >= s && i.start < e));

/* ---------- Filters (Home: product + appointment types + booked / not booked) ---------- */
export type BookedFilter = 'all' | 'booked' | 'open';
export interface SasFilter { productId: string | null; typeIds: string[] | null; booked: BookedFilter; }
export const NO_FILTER: SasFilter = { productId: null, typeIds: null, booked: 'all' };

/* A window cut down to the picked types: only their slots, and the window's time trimmed to the span of
   those slots, so hours count only the matching slots (operator, 2026-10-01). null = nothing matches.
   A window whose slots are not generated yet keeps its own time. */
export function scopeWindow(w: AvailWindow, typeIds: string[] | null): AvailWindow | null {
  if (!typeIds) return w;
  const ids = w.typeIds.filter(t => typeIds.includes(t));
  if (!ids.length) return null;
  const slots = w.slots.filter(s => ids.includes(s.typeId));
  if (!slots.length) return { ...w, typeIds: ids, slots };
  const start = new Date(Math.min(...slots.map(s => s.start.getTime())));
  const end = new Date(Math.max(...slots.map(s => s.end.getTime())));
  return { ...w, typeIds: ids, slots, start, end };
}

/* A session matches when its type is picked and, with a product picked, it belongs to that product. */
export function apptMatches(a: Appt, f: SasFilter): boolean {
  if (f.typeIds && !(a.typeId && f.typeIds.includes(a.typeId))) return false;
  if (f.productId && a.productId && a.productId !== f.productId) return false;
  return true;
}

/* Booked / Not booked for a window: booked = holds a booked slot; not booked = still has a bookable slot. */
export function windowMatchesBooked(w: AvailWindow, b: BookedFilter, now: Date): boolean {
  if (b === 'booked') return w.slots.some(s => s.booked);
  if (b === 'open') return w.slots.some(s => bookable(s, now));
  return true;
}

/* ---------- Day view: one column per delivery type, listing slots ----------
   Shown: bookable slots (free, future) and booked slots. A booked slot carries its session when one
   matches (same specialist, same start, same type); sessions outside any slot are added to their
   type's column too. Cancelled sessions are left out (they free the slot again). Blocked (overlap) and past unbooked slots are hidden (operator, 2026-10-01). */
/* members: in the all-specialists view a joint type's slot at one time is shown once for everyone free then. */
export interface DayEntry { start: Date; end: Date; profileId: string; typeId: string; w: AvailWindow | null; appt: Appt | null; booked: boolean; members?: string[]; }
export interface DayColumn { typeId: string; entries: DayEntry[]; }

export function dayColumns(wins: AvailWindow[], sessions: Appt[], now: Date, booked: BookedFilter = 'all'): DayColumn[] {
  const cols = new Map<string, DayEntry[]>();
  const add = (e: DayEntry) => cols.set(e.typeId, [...(cols.get(e.typeId) ?? []), e]);
  const used = new Set<string>(), live = sessions.filter(a => !a.cancelled);
  for (const w of wins) for (const s of w.slots) {
    if (!s.booked && !bookable(s, now)) continue;
    // Once per host: a collaborative session fills each host's booked slot.
    const appt = s.booked ? live.find(a => !used.has(a.id + '|' + w.profileId) && a.typeId === s.typeId && a.hostIds.includes(w.profileId)
      && a.start.getTime() === s.start.getTime()) ?? null : null;
    if (appt) used.add(appt.id + '|' + w.profileId);
    add({ start: s.start, end: s.end, profileId: w.profileId, typeId: s.typeId, w, appt, booked: s.booked });
  }
  const placed = new Set([...used].map(k => k.split('|')[0]));
  for (const a of live) if (!placed.has(a.id) && a.typeId) {
    add({ start: a.start, end: a.end, profileId: a.hostIds[0] ?? '', typeId: a.typeId, w: null, appt: a, booked: true });
  }
  const keep = (e: DayEntry) => booked === 'all' || (booked === 'booked') === e.booked;
  return [...cols.entries()]
    .map(([typeId, entries]) => ({ typeId, entries: entries.filter(keep).sort((a, b) => a.start.getTime() - b.start.getTime()) }))
    .filter(c => c.entries.length);
}

/* Group by type: one column per type, ordered by label. Sort by time: a single column (typeId '')
   holding every slot in time order (operator, 2026-10-05). */
export type SlotGrouping = 'type' | 'time';
export function groupColumns(cols: DayColumn[], by: SlotGrouping, label: (typeId: string) => string): DayColumn[] {
  if (by === 'type') return [...cols].sort((a, b) => label(a.typeId).localeCompare(label(b.typeId)));
  const entries = cols.flatMap(c => c.entries).sort((a, b) => a.start.getTime() - b.start.getTime()
    || label(a.typeId).localeCompare(label(b.typeId)) || a.profileId.localeCompare(b.profileId));
  return entries.length ? [{ typeId: '', entries }] : [];
}

/* ---------- Join ---------- */
export const JOIN_LEAD_MIN = 5;
/* Join opens 5 minutes before the start and closes at the end (operator, 2026-10-01). */
export function joinOpen(a: Appt, now: Date): boolean {
  return now.getTime() >= a.start.getTime() - JOIN_LEAD_MIN * 60000 && now < a.end;
}

/* ---------- Joint delivery types (operator, 2026-10-05) ----------
   A type that needs more than one specialist role at the same time (AppointmentType-To-Roles.required_role
   has 2+ roles, e.g. EI Diagnostics + EI Implementation). It is bookable at a time only when every role has a
   different free person starting then — the same rule as book-appointment's merge. */
export interface JointType { roles: string[]; eis: Record<string, string[]>; }    // role path → profile ids

const minuteKey = (d: Date) => Math.floor(d.getTime() / 60000);

export class JointIndex {
  /* typeId|minute → role → people with a free slot of that type starting then */
  private free = new Map<string, Map<string, Set<string>>>();

  constructor(private types: Map<string, JointType>, wins: AvailWindow[], now: Date) {
    for (const w of wins) for (const s of w.slots) {
      const jt = types.get(s.typeId);
      if (!jt || !s.available || s.booked || s.start <= now) continue;
      const key = s.typeId + '|' + minuteKey(s.start);
      const byRole = this.free.get(key) ?? new Map<string, Set<string>>();
      for (const role of jt.roles) if ((jt.eis[role] ?? []).includes(w.profileId)) {
        byRole.set(role, (byRole.get(role) ?? new Set()).add(w.profileId));
      }
      this.free.set(key, byRole);
    }
  }

  isJoint(typeId: string) { return this.types.has(typeId); }
  roles(typeId: string) { return this.types.get(typeId)?.roles ?? []; }

  /* Every team that could take the type at that start: one different free person per role. */
  teams(typeId: string, start: Date): string[][] {
    const jt = this.types.get(typeId), byRole = this.free.get(typeId + '|' + minuteKey(start));
    if (!jt || !byRole) return [];
    const out: string[][] = [];
    const walk = (i: number, team: string[]) => {
      if (i === jt.roles.length) { out.push(team); return; }
      for (const p of byRole.get(jt.roles[i]) ?? []) if (!team.includes(p)) walk(i + 1, [...team, p]);
    };
    walk(0, []);
    return out;
  }

  /* Who could take it with this person at that start (empty = not bookable yet). */
  partners(typeId: string, start: Date, profileId: string): string[] {
    const set = new Set<string>();
    this.teams(typeId, start).filter(t => t.includes(profileId)).forEach(t => t.forEach(p => p !== profileId && set.add(p)));
    return [...set];
  }

  /* The roles with nobody free at that start. */
  uncovered(typeId: string, start: Date): string[] {
    const byRole = this.free.get(typeId + '|' + minuteKey(start));
    return this.roles(typeId).filter(r => !(byRole?.get(r)?.size));
  }

  /* The roles nobody else is free for at that start — what the slot is waiting for. */
  missing(typeId: string, start: Date, profileId: string): string[] {
    const jt = this.types.get(typeId), byRole = this.free.get(typeId + '|' + minuteKey(start));
    if (!jt) return [];
    const own = jt.roles.find(r => (jt.eis[r] ?? []).includes(profileId));
    return jt.roles.filter(r => r !== own && ![...(byRole?.get(r) ?? [])].some(p => p !== profileId));
  }
}

/* All-specialists view: a joint type's column shows each time once — open slots at the same start merged
   into one entry listing everyone free then, a booked session once however many hosts it has.
   Joint columns go last. */
export function collapseJoint(cols: DayColumn[], idx: JointIndex): DayColumn[] {
  const out = cols.map(c => {
    if (!idx.isJoint(c.typeId) && c.typeId !== '') return c;
    const seen = new Map<string, DayEntry>(), entries: DayEntry[] = [];
    for (const e of c.entries) {
      if (!idx.isJoint(e.typeId)) { entries.push(e); continue; }
      const key = e.booked ? 'b|' + (e.appt?.id ?? e.profileId + e.start.getTime()) : 'o|' + e.typeId + '|' + e.start.getTime();
      const hit = seen.get(key);
      if (hit) { if (!hit.booked && !hit.members!.includes(e.profileId)) hit.members!.push(e.profileId); continue; }
      const copy = { ...e, members: e.booked ? (e.appt?.hostIds ?? [e.profileId]) : [e.profileId] };
      seen.set(key, copy);
      entries.push(copy);
    }
    return { ...c, entries };
  });
  return [...out.filter(c => !idx.isJoint(c.typeId)), ...out.filter(c => idx.isJoint(c.typeId))];
}
