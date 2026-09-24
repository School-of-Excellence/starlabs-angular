/**
 * Workshop Dashboard Access — the pure rules.
 *
 * Two independent layers decide what a person may do:
 *
 *  1. **Global lists** (one document, shared by every workshop). Someone on the
 *     dashboard-admin list can do everything on every workshop dashboard; the
 *     other two lists gate the workshop editor and the new-users screen.
 *  2. **Per-workshop grants** (one document per workshop, same id as the
 *     workshop). A person gets exactly the actions ticked for them.
 *
 * **Nothing is open by default, with no exceptions.** A person who has not been
 * picked gets nothing: an empty list blocks everyone, not no-one. There is no
 * built-in account and no hard-coded id anywhere in here — every answer comes
 * from the two documents these screens read.
 *
 * The consequence is deliberate: while both lists are empty, nobody can open the
 * editor either. The first names have to be put into the shared document
 * directly, once, before anyone can use these screens.
 *
 * No Firestore reads live here on purpose: everything below is a pure function
 * so the rules can be unit-tested without a database.
 */

export type WorkshopAccessKey =
  | 'sendcommunication'
  | 'qanda'
  | 'diagnose'
  | 'clear'
  | 'enroll'
  | 'export'
  | 'extend'
  | 'participantprogress'
  | 'allassignments'
  | 'allforms'
  | 'allvideoask';

export interface WorkshopAccessKeyDef {
  key: WorkshopAccessKey;
  label: string;
  /** One line shown under the tick — what the person can actually do. */
  help: string;
  /** Evergreen workshops only. */
  evergreenOnly?: boolean;
}

/** The order these appear in the editor and in the dashboard's own access summary. */
export const WORKSHOP_ACCESS_KEYS: WorkshopAccessKeyDef[] = [
  {
    key: 'sendcommunication',
    label: 'Send communication',
    help: 'The Communication button in the dashboard header and the email, WhatsApp and notification actions in the side panel.',
  },
  { key: 'qanda', label: 'Q & A', help: 'Open the questions and answers of this workshop.' },
  { key: 'diagnose', label: 'Diagnose', help: 'Check why a profile can or cannot enroll in this workshop.' },
  { key: 'clear', label: 'Clear', help: 'Clear this workshop’s participant progress.' },
  { key: 'enroll', label: 'Enroll', help: 'Enroll someone into this workshop by hand.' },
  {
    key: 'export',
    label: 'Export',
    help: 'Download the people in the side panel, the participant progress list and the forms sheet.',
  },
  {
    key: 'extend',
    label: 'Extend workshop access',
    help: 'Give a participant more days after they finish. Evergreen workshops only.',
    evergreenOnly: true,
  },
  {
    key: 'participantprogress',
    label: 'Participant progress',
    help: 'Open a participant from the list to see their data, move them to the next step and review their assignment.',
  },
  { key: 'allassignments', label: 'All Assignments', help: 'Expand and read every assignment submission.' },
  { key: 'allforms', label: 'All Forms', help: 'Expand and read every form submission.' },
  { key: 'allvideoask', label: 'All VideoAsk', help: 'Expand and play every VideoAsk reply.' },
];

export const WORKSHOP_ACCESS_KEY_SET: ReadonlySet<string> =
  new Set(WORKSHOP_ACCESS_KEYS.map(k => k.key));

export function accessLabel(key: string): string {
  return WORKSHOP_ACCESS_KEYS.find(k => k.key === key)?.label || key;
}

/** The three global lists, as stored in the one shared document. */
export interface WorkshopAdminLists {
  /** Everything, on every workshop dashboard. */
  dashboardAdmins: string[];
  /** May create, edit, duplicate a workshop and flip its switches. */
  editAccess: string[];
  /** May open the new users screen. */
  newUsersAccess: string[];
}

export const EMPTY_ADMIN_LISTS: WorkshopAdminLists = {
  dashboardAdmins: [],
  editAccess: [],
  newUsersAccess: [],
};

/** profileid → the actions ticked for that person on one workshop. */
export type WorkshopAccessGrants = Record<string, WorkshopAccessKey[]>;

function asIdList(value: any): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    const id = (v ?? '').toString().trim();
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

/** Read the shared document defensively — any field may be missing or the wrong shape. */
export function readAdminLists(data: any): WorkshopAdminLists {
  return {
    dashboardAdmins: asIdList(data?.workshopdashboardadmin),
    editAccess: asIdList(data?.workshopeditaccess),
    newUsersAccess: asIdList(data?.workshopnewusersaccess),
  };
}

/** Read one workshop's grants, dropping unknown actions and people with nothing ticked. */
export function readGrants(data: any): WorkshopAccessGrants {
  const raw = data?.dashboardaccess;
  const out: WorkshopAccessGrants = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const profileid of Object.keys(raw)) {
    const keys = asIdList(raw[profileid]).filter(k => WORKSHOP_ACCESS_KEY_SET.has(k)) as WorkshopAccessKey[];
    if (keys.length) out[profileid] = keys;
  }
  return out;
}

/** Same order as the editor, so a saved document reads the same way twice. */
export function normaliseGrants(grants: WorkshopAccessGrants): WorkshopAccessGrants {
  const out: WorkshopAccessGrants = {};
  for (const profileid of Object.keys(grants || {}).sort()) {
    const set = new Set(grants[profileid] || []);
    const keys = WORKSHOP_ACCESS_KEYS.filter(k => set.has(k.key)).map(k => k.key);
    if (keys.length) out[profileid] = keys;
  }
  return out;
}

/**
 * One person's permissions on one workshop dashboard.
 *
 * `enforced` is false while nobody is a dashboard admin — the screen then behaves
 * exactly as it did before this feature existed.
 */
export class WorkshopAccess {
  readonly profileId: string;
  private readonly granted: ReadonlySet<string>;
  readonly admins: readonly string[];

  constructor(profileId: string | null | undefined, grants: WorkshopAccessGrants, admins: string[]) {
    this.profileId = (profileId || '').toString();
    this.admins = admins || [];
    this.granted = new Set(this.profileId ? (grants?.[this.profileId] || []) : []);
  }

  /** Everything on this dashboard, on every workshop. Only the picked people. */
  get isAdmin(): boolean {
    return !!this.profileId && this.admins.includes(this.profileId);
  }

  can(key: WorkshopAccessKey): boolean {
    if (this.isAdmin) return true;
    return this.granted.has(key);
  }

  /** Everything this person may do — for the "no access" explanation on screen. */
  get keys(): WorkshopAccessKey[] {
    if (this.isAdmin) return WORKSHOP_ACCESS_KEYS.map(k => k.key);
    return WORKSHOP_ACCESS_KEYS.filter(k => this.granted.has(k.key)).map(k => k.key);
  }

  /** Nothing at all on this dashboard: the screen itself is closed to them. */
  get isLockedOut(): boolean { return !this.isAdmin && this.granted.size === 0; }

  /** Some, but not all, of the dashboard. */
  get isPartial(): boolean { return !this.isAdmin && this.granted.size > 0; }
}

/** What every screen starts from: nothing, until the real answer is read. */
export const NO_ACCESS = new WorkshopAccess(null, {}, []);

/** Create, edit, duplicate a workshop and flip its switches. Only the people picked. */
export function canEditWorkshops(profileId: string | null | undefined, lists: WorkshopAdminLists): boolean {
  return !!profileId && (lists?.editAccess || []).includes(profileId);
}

/** Open the new users screen. Only the people picked. */
export function canOpenNewUsers(profileId: string | null | undefined, lists: WorkshopAdminLists): boolean {
  return !!profileId && (lists?.newUsersAccess || []).includes(profileId);
}
