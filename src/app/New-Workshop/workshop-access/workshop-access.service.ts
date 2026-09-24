import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import {
  EMPTY_ADMIN_LISTS,
  NO_ACCESS,
  WorkshopAccess,
  WorkshopAccessGrants,
  WorkshopAdminLists,
  normaliseGrants,
  readAdminLists,
  readGrants,
} from './workshop-access.model';

/** One choosable person, as shown in the access pickers. */
export interface WorkshopPerson { id: string; name: string; email: string; }

/** The one shared document that holds the three global lists. */
const ADMIN_COLLECTION = 'static meta data';
const ADMIN_DOC = 'Workshop Admin';
/** One document per workshop, carrying the same id as the workshop itself. */
const SETTINGS_COLLECTION = 'workshopsettings';
/**
 * The picker list, kept in the app's own IndexedDB cache (10-minute life, the
 * same store the profile map uses). Without it every visit re-read the whole
 * participant collection — the other pickers on this screen never did, because
 * they read the profile map, which has always been cached.
 */
const DIRECTORY_CACHE_KEY = 'cache_workshopAccessDirectory';

/**
 * Reads and writes who may do what on the workshop screens.
 *
 * The global lists are read once per session and shared by every screen that
 * asks — the workshops list, the editor, the new-users screen and each
 * dashboard all need the same answer, and none of them should pay for a
 * separate read. `refreshAdminLists()` re-reads after the editor saves.
 */
@Injectable({ providedIn: 'root' })
export class WorkshopAccessService {
  private firestore = inject(Firestore);
  private guard = inject(AuthguardService);

  private adminListsPromise: Promise<WorkshopAdminLists> | null = null;
  private profileIdPromise: Promise<string | null> | null = null;
  private directoryPromise: Promise<WorkshopPerson[]> | null = null;

  /**
   * Everyone who can be given access, read from the participant directory only —
   * new users are deliberately not offered here. Read once per session: it is a
   * whole-collection read and every picker asks the same question.
   */
  getParticipantDirectory(): Promise<WorkshopPerson[]> {
    if (!this.directoryPromise) {
      this.directoryPromise = (async () => {
        try {
          const cached = await this.guard.getCache(DIRECTORY_CACHE_KEY);
          if (Array.isArray(cached) && cached.length) return cached as WorkshopPerson[];
        } catch (err) {
          console.warn('Participant directory cache unavailable:', err);
        }
        try {
          const res: any = await this.guard.getParticipantMetaMap();
          const docdata = res?.docdata || {};
          const people: WorkshopPerson[] = Object.keys(docdata)
            .map(id => ({
              id,
              name: (docdata[id]?.name ?? '').toString().trim(),
              email: (docdata[id]?.email ?? '').toString().trim(),
            }))
            .filter(p => p.name || p.email)
            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
          // Store only what a picker needs — three short strings per person —
          // rather than the whole participant document.
          this.guard.setCache(DIRECTORY_CACHE_KEY, people).catch(() => { });
          return people;
        } catch (err) {
          console.error('Could not read the participant directory:', err);
          return [];
        }
      })();
    }
    return this.directoryPromise;
  }

  /** The signed-in person's profileid, or null when it cannot be resolved. */
  currentProfileId(): Promise<string | null> {
    if (!this.profileIdPromise) {
      this.profileIdPromise = (async () => {
        try {
          const roles: any = await this.guard.getRoles();
          return roles?.['profile_ref']?.id || null;
        } catch (err) {
          console.error('Could not resolve the signed-in profile:', err);
          return null;
        }
      })();
    }
    return this.profileIdPromise;
  }

  getAdminLists(): Promise<WorkshopAdminLists> {
    if (!this.adminListsPromise) {
      this.adminListsPromise = (async () => {
        try {
          const snap = await getDoc(doc(this.firestore, ADMIN_COLLECTION, ADMIN_DOC));
          return readAdminLists(snap.exists() ? snap.data() : null);
        } catch (err) {
          // One retry: a single failed read would otherwise close every screen,
          // because nobody has access unless a list says so.
          console.error('Could not read the workshop admin lists, retrying:', err);
          try {
            const snap = await getDoc(doc(this.firestore, ADMIN_COLLECTION, ADMIN_DOC));
            return readAdminLists(snap.exists() ? snap.data() : null);
          } catch (retryErr) {
            console.error('Could not read the workshop admin lists:', retryErr);
            this.adminListsPromise = null;   // so the next screen tries again
            return { ...EMPTY_ADMIN_LISTS };
          }
        }
      })();
    }
    return this.adminListsPromise;
  }

  refreshAdminLists(): Promise<WorkshopAdminLists> {
    this.adminListsPromise = null;
    return this.getAdminLists();
  }

  async saveAdminLists(lists: WorkshopAdminLists): Promise<void> {
    await setDoc(
      doc(this.firestore, ADMIN_COLLECTION, ADMIN_DOC),
      {
        workshopdashboardadmin: lists.dashboardAdmins || [],
        workshopeditaccess: lists.editAccess || [],
        workshopnewusersaccess: lists.newUsersAccess || [],
      },
      { merge: true },
    );
    this.adminListsPromise = Promise.resolve({
      dashboardAdmins: [...(lists.dashboardAdmins || [])],
      editAccess: [...(lists.editAccess || [])],
      newUsersAccess: [...(lists.newUsersAccess || [])],
    });
  }

  async getWorkshopGrants(workshopId: string): Promise<WorkshopAccessGrants> {
    if (!workshopId) return {};
    try {
      const snap = await getDoc(doc(this.firestore, SETTINGS_COLLECTION, workshopId));
      return readGrants(snap.exists() ? snap.data() : null);
    } catch (err) {
      console.error('Could not read the dashboard access for this workshop:', err);
      return {};
    }
  }

  /**
   * The workshop's access document carries the workshop's own id so the
   * collection can be read on its own without joining back to the workshop.
   */
  async saveWorkshopGrants(workshopId: string, grants: WorkshopAccessGrants, savedBy?: string | null): Promise<void> {
    if (!workshopId) return;
    await setDoc(
      doc(this.firestore, SETTINGS_COLLECTION, workshopId),
      {
        workshopid: workshopId,
        dashboardaccess: normaliseGrants(grants),
        updatedat: serverTimestamp(),
        ...(savedBy ? { updatedby: savedBy } : {}),
      },
      { merge: true },
    );
  }

  /** Everything one dashboard needs: who I am, what I was granted, who the admins are. */
  async accessFor(workshopId: string): Promise<WorkshopAccess> {
    try {
      const [profileId, lists, grants] = await Promise.all([
        this.currentProfileId(),
        this.getAdminLists(),
        this.getWorkshopGrants(workshopId),
      ]);
      return new WorkshopAccess(profileId, grants, lists.dashboardAdmins);
    } catch (err) {
      console.error('Could not resolve dashboard access:', err);
      return NO_ACCESS;
    }
  }
}
