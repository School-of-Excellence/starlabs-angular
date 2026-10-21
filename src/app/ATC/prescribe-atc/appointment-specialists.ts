/* Specialists for an ATC, taken from the appointment it was prescribed in.
   Join (all default Firestore, read-only; only the participant's own appointment and its type's mapping):
     appointments.hostRole            { "eisroles/<roleId>": [profile_data ref | "profile_data/<pid>"] }  — roles + people
     appointments.appointmentrole     [eisroles ref]            — fallback list of roles when hostRole is empty
     AppointmentType-To-Roles         atcrequired, atcrolemap { <roleId>: <bigactivity id> }
     bigactivity                      activity, atcproperty
   role → activity → atcproperty; the role's hosts then fill EVERY activity of that property.
   Pure (no Angular / Firestore) so it is unit-testable; the component does the reads. */

export interface AtcActivity { docid: string; activity: string; atcproperty?: string | null; }

export interface AppointmentSpecialistRow {
  roleId: string;         // eisroles id from appointment.appointmentrole
  activityId: string;     // the bigactivity this role maps to (AppointmentType-To-Roles.atcrolemap)
  activity: string;
  atcproperty: string | null;
  label: string;          // AUTHOR / OBSERVER / MENTOR / CA / the raw property
  profilePaths: string[]; // who hosted the role: "profile_data/<pid>", the shape the page's pickers store
}

const LABELS: Record<string, string> = { author: 'AUTHOR', observer: 'OBSERVER', mentoring: 'MENTOR', assigned_to: 'CA' };

export function propertyLabel(atcproperty: string | null | undefined): string {
  return atcproperty ? (LABELS[atcproperty] ?? atcproperty.toUpperCase()) : '';
}

export interface AppointmentSummary { id: string; start: Date | null; attended?: boolean; cancelled?: boolean; typeId: string | null; }

/* No ?appointmentid=: the participant's usable appointments, newest first. Not cancelled, typed, dated, and
   not after today: a past day must be attended; today's counts even before its status is updated (prescribing
   right after the session). Future days never count. The caller checks each one's own type mapping in order. */
export function completedNewestFirst(appointments: AppointmentSummary[], now: Date = new Date()): AppointmentSummary[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return appointments
    .filter(a => a.cancelled !== true && !!a.typeId && !!a.start && a.start < startOfTomorrow
      && (a.attended === true || a.start >= startOfToday))
    .sort((a, b) => b.start!.getTime() - a.start!.getTime());
}

/* hostRole values are profile_data DocumentReferences from booking, but older writers stored path strings. */
function toProfilePath(h: any): string | null {
  if (typeof h === 'string') return h.includes('/') ? h : 'profile_data/' + h;
  return typeof h?.path === 'string' ? h.path : null;
}

/* eisroles ids on the appointment (appointmentrole: refs from booking, or path strings), or null when absent. */
export function appointmentRoleIds(appointment: { appointmentrole?: any[] | null } | null): string[] | null {
  const list = appointment?.appointmentrole;
  if (!Array.isArray(list)) return null;
  return list.map(r => (typeof r === 'string' ? r.split('/').pop() : r?.id)).filter((id): id is string => !!id);
}

/* eisroles ids that have a host on the appointment: the keys of hostRole ("eisroles/<id>" -> <id>). */
export function hostRoleIds(appointment: { hostRole?: Record<string, any[]> | null } | null): string[] {
  return Object.keys(appointment?.hostRole ?? {})
    .filter(k => k.startsWith('eisroles/'))
    .map(k => k.split('/').pop()!)
    .filter(Boolean);
}

/* One row per role on the appointment that maps to a known bigactivity: role -> activity -> atcproperty, with the
   role's hosts. Roles come from hostRole's keys (who hosted what); when hostRole is empty, from appointmentrole,
   else every atcrolemap role. [] when the type has no ATC. */
export function appointmentSpecialistRows(
  appointment: { hostRole?: Record<string, any[]> | null; appointmentrole?: any[] | null } | null,
  mapping: { atcrequired?: boolean; atcrolemap?: Record<string, string> | null } | null,
  activities: AtcActivity[],
): AppointmentSpecialistRow[] {
  if (!appointment || mapping?.atcrequired !== true) return [];
  const byId = new Map(activities.map(a => [a.docid, a]));
  const hostRole = appointment.hostRole ?? {};
  const roleMap = mapping.atcrolemap ?? {};
  const hosted = hostRoleIds(appointment);
  const roles = hosted.length ? hosted : (appointmentRoleIds(appointment) ?? Object.keys(roleMap));
  const rows: AppointmentSpecialistRow[] = [];
  for (const roleId of Array.from(new Set(roles))) {
    const activityId = roleMap[roleId];
    const act = typeof activityId === 'string' ? byId.get(activityId) : undefined;
    if (!act) continue;
    const hosts = hostRole['eisroles/' + roleId] ?? [];
    rows.push({
      roleId,
      activityId: act.docid,
      activity: act.activity,
      atcproperty: act.atcproperty ?? null,
      label: propertyLabel(act.atcproperty),
      profilePaths: Array.from(new Set((Array.isArray(hosts) ? hosts : []).map(toProfilePath).filter((p): p is string => !!p))),
    });
  }
  return rows;
}

/* A role's specialist covers every activity of its property: all author activities, all observer activities, ...
   Returns property -> the union of its roles' specialists. */
export function specialistsByProperty(rows: AppointmentSpecialistRow[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    if (!r.atcproperty) continue;
    const list = out[r.atcproperty] ?? (out[r.atcproperty] = []);
    r.profilePaths.forEach(p => { if (!list.includes(p)) list.push(p); });
  }
  return out;
}
