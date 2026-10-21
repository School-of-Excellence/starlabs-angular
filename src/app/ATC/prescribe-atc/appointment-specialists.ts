/* Specialists for an ATC, taken from the appointment it was prescribed in.
   Join (all default Firestore, read-only; only the participant's own appointment and its type's mapping):
     appointments.hostRole            { "eisroles/<roleId>": [profile_data ref | "profile_data/<pid>"] }  — roles + people
     appointments.appointmentrole     [eisroles ref]            — fallback list of roles when hostRole is empty
     AppointmentType-To-Roles         atcrequired, atcrolemap { <roleId>: [<bigactivity id>, …] }
     bigactivity                      activity, atcproperty
   role → activity → atcproperty; the role's hosts fill that one activity (the rest stay for manual entry).
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

/* No ?appointmentid=: the participant's usable appointments, newest first. cancelled === false, typed, dated, and
   not after today: a past day must be attended; today's counts even before its status is updated (prescribing
   right after the session). Future days never count. The caller checks each one's own type mapping in order. */
export function completedNewestFirst<T extends AppointmentSummary>(appointments: T[], now: Date = new Date()): T[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return appointments
    .filter(a => a.cancelled === false && !!a.typeId && !!a.start && a.start < startOfTomorrow
      && (a.attended === true || a.start >= startOfToday))
    .sort((a, b) => b.start!.getTime() - a.start!.getTime());
}

/* prescribeATC (participant + "What is the ATC given for?" chosen): the newest usable appointment whose type is one
   of the ATC types for that model (AppointmentType-To-Roles atcrequired + atcmodel) and that the logged-in
   specialist hosted. null = nothing to prefill (the specialist fills the pickers manually). */
export function pickAtcAppointment(
  appointments: (AppointmentSummary & { hostIds: string[] })[], atcTypeIds: Set<string>, hostId: string, now: Date = new Date(),
): string | null {
  const mine = appointments.filter(a => !!a.typeId && atcTypeIds.has(a.typeId) && !!hostId && a.hostIds.includes(hostId));
  return completedNewestFirst(mine, now)[0]?.id ?? null;
}

/* hostRole values are profile_data DocumentReferences from booking, but older writers stored path strings. */
function toProfilePath(h: any): string | null {
  if (typeof h === 'string') return h.includes('/') ? h : 'profile_data/' + h;
  return typeof h?.path === 'string' ? h.path : null;
}

/* Every specialist on the appointment, as profile ids: hostRole's people plus hosts[] (refs or path strings). */
export function appointmentHostIds(appointment: { hostRole?: Record<string, any[]> | null; hosts?: any[] | null } | null): string[] {
  const ids = new Set<string>();
  const add = (h: any) => { const p = toProfilePath(h); if (p) ids.add(p.split('/').pop()!); };
  Object.values(appointment?.hostRole ?? {}).forEach(list => (Array.isArray(list) ? list : []).forEach(add));
  (Array.isArray(appointment?.hosts) ? appointment!.hosts! : []).forEach(add);
  return [...ids];
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

/* atcrolemap value -> activity ids: an array (current shape) or a single id string (older docs). */
export function activityIdsOf(value: unknown): string[] {
  if (Array.isArray(value)) return Array.from(new Set(value.filter((v): v is string => typeof v === 'string' && !!v)));
  return typeof value === 'string' && value ? [value] : [];
}

/* One row per (role, activity) on the appointment that maps to a known bigactivity: role -> activity -> atcproperty, with the
   role's hosts. Roles come from hostRole's keys (who hosted what); when hostRole is empty, from appointmentrole,
   else every atcrolemap role. [] when the type has no ATC. */
export function appointmentSpecialistRows(
  appointment: { hostRole?: Record<string, any[]> | null; appointmentrole?: any[] | null } | null,
  mapping: { atcrequired?: boolean; atcrolemap?: Record<string, string | string[]> | null } | null,
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
    const hosts = hostRole['eisroles/' + roleId] ?? [];
    const profilePaths = Array.from(new Set((Array.isArray(hosts) ? hosts : []).map(toProfilePath).filter((p): p is string => !!p)));
    // a role maps to one or more activities ({roleId: [activityId, …]}; older docs: a single string)
    for (const activityId of activityIdsOf(roleMap[roleId])) {
      const act = byId.get(activityId);
      if (!act) continue;
      rows.push({
        roleId,
        activityId: act.docid,
        activity: act.activity,
        atcproperty: act.atcproperty ?? null,
        label: propertyLabel(act.atcproperty),
        profilePaths: [...profilePaths],
      });
    }
  }
  return rows;
}
