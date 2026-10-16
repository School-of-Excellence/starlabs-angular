/* Specialists for an ATC, taken from the appointment it was prescribed in.
   Join (all default Firestore, read-only):
     appointments.hostRole            { "eisroles/<roleId>": [profile_data ref | "profile_data/<pid>"] }
     AppointmentType-To-Roles         atcrequired, atcrolemap { <roleId>: <bigactivity id> }
     bigactivity                      activity, atcproperty
   For each role → activity in atcrolemap, the people who hosted that role fill that activity.
   Pure (no Angular / Firestore) so it is unit-testable; the component does the reads. */

export interface AtcActivity { docid: string; activity: string; atcproperty?: string | null; }

export interface AppointmentSpecialistRow {
  activityId: string;
  activity: string;
  atcproperty: string | null;
  label: string;          // AUTHOR / OBSERVER / MENTOR / CA / the raw property
  profilePaths: string[]; // "profile_data/<pid>" — the same shape the page's pickers store
}

const LABELS: Record<string, string> = { author: 'AUTHOR', observer: 'OBSERVER', mentoring: 'MENTOR', assigned_to: 'CA' };

export function propertyLabel(atcproperty: string | null | undefined): string {
  return atcproperty ? (LABELS[atcproperty] ?? atcproperty.toUpperCase()) : '';
}

/* hostRole values are profile_data DocumentReferences from booking, but older writers stored path strings. */
function toProfilePath(h: any): string | null {
  if (typeof h === 'string') return h.includes('/') ? h : 'profile_data/' + h;
  return typeof h?.path === 'string' ? h.path : null;
}

/* One row per role in atcrolemap whose activity is a known bigactivity, in atcrolemap order.
   Returns [] when the type does not require an ATC. A role nobody hosted gives a row with no people. */
export function appointmentSpecialistRows(
  appointment: { hostRole?: Record<string, any[]> | null } | null,
  mapping: { atcrequired?: boolean; atcrolemap?: Record<string, string> | null } | null,
  activities: AtcActivity[],
): AppointmentSpecialistRow[] {
  if (!appointment || mapping?.atcrequired !== true) return [];
  const byId = new Map(activities.map(a => [a.docid, a]));
  const hostRole = appointment.hostRole ?? {};
  const rows: AppointmentSpecialistRow[] = [];
  for (const [roleId, activityId] of Object.entries(mapping.atcrolemap ?? {})) {
    const act = typeof activityId === 'string' ? byId.get(activityId) : undefined;
    if (!act) continue;
    const hosts = hostRole['eisroles/' + roleId] ?? [];
    const profilePaths = Array.from(new Set((Array.isArray(hosts) ? hosts : []).map(toProfilePath).filter((p): p is string => !!p)));
    const existing = rows.find(r => r.activityId === act.docid);
    if (existing) {
      // two roles mapped to the same activity: one row, both roles' hosts
      profilePaths.forEach(p => { if (!existing.profilePaths.includes(p)) existing.profilePaths.push(p); });
      continue;
    }
    rows.push({
      activityId: act.docid,
      activity: act.activity,
      atcproperty: act.atcproperty ?? null,
      label: propertyLabel(act.atcproperty),
      profilePaths,
    });
  }
  return rows;
}
