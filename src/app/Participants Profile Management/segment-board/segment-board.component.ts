import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, PLATFORM_ID, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, WriteBatch, collection, collectionGroup, deleteField, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Storage, getDownloadURL, ref as ref_, uploadBytes } from '@angular/fire/storage';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { environment } from '../../../environments/environment.development';
import { AhNotificationComponent } from '../participants-analytics/ah-notification/ah-notification.component';
import { EmailInputComponent } from '../participants-analytics/email-input/email-input.component';
import { WatiInputComponent } from '../participants-analytics/wati-input/wati-input.component';
import { MapRecommendedplaylistToparticipantComponentComponent } from '../participants-analytics/map-recommendedplaylist-toparticipant.component/map-recommendedplaylist-toparticipant.component.component';
import { GroupHistoryEntry, HistoryEntry, MigrationResult, MigrationRow, OrderUpdate, SegmentBoardStore, SegmentGroup, mountSegmentBoard } from './segment-board.engine';
import { toParticipant } from './segment-board.facts';

// Same drag-and-drop library and version the standalone prototype uses (Arrange + sequence list).
const SORTABLE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js';
// Master segment configuration: one doc per segment, doc id = a Firestore auto id (older docs: a name slug, see the migration).
const CONFIG_COLLECTION = 'segmentboardconfig';
// Each segment's refreshed list: doc id = segment id, { segmentname, segmentid, profilelist, lastupdated }.
const LIST_COLLECTION = 'segmentboardlist';
const PARTICIPANTS_COLLECTION = 'participant metadata';
// Change history: a subcollection of each segment's config doc only (no top-level collection), append-only.
const HISTORY_SUBCOLLECTION = 'segmenthistory';
// Segment groups (reference labels): one doc per group, soft delete only; their history is a subcollection of the group doc.
const GROUPS_COLLECTION = 'segmentboardgroups';
const GROUP_HISTORY_SUBCOLLECTION = 'grouphistory';

/**
 * Segment Board: the "Segment Board (standalone).html" design, hosted as a component.
 * Master segments tab only. Segment configuration is stored in `segmentboardconfig`; participants are the
 * `participant metadata` docs; "Refresh list" builds each segment's list and stores it in `segmentboardlist`.
 * Encapsulation is off because the board renders with innerHTML; every rule in the CSS is
 * scoped to .sb-root instead.
 */
@Component({
  selector: 'app-segment-board',
  standalone: true,
  templateUrl: './segment-board.component.html',
  styleUrls: ['./segment-board.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class SegmentBoardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('root', { static: true }) root!: ElementRef<HTMLElement>;
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private dialog = inject(MatDialog);
  private storage = inject(Storage);
  private http = inject(HttpClient);
  private authguard = inject(AuthguardService);
  /** profileid -> the full `participant metadata` doc, as the B!G Cohorts dialogs expect (mapParticipantMetaData there). */
  private meta = new Map<string, any>();
  private unmount: (() => void) | null = null;
  private destroyed = false;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    await this.loadSortable();
    if (this.destroyed) return;
    this.unmount = mountSegmentBoard(this.root.nativeElement, this.store);
  }

  /** Reads and writes segmentboardconfig for the board. */
  private store: SegmentBoardStore = {
    load: async () => {
      const snap = await getDocs(collection(this.firestore, CONFIG_COLLECTION));
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    },
    saveSegment: async (segment, { isNew, orderUpdates, history, groupHistory }) => {
      const pid = await this.profileId();
      const batch = writeBatch(this.firestore);
      const data: Record<string, unknown> = { ...segment };
      delete data['createdAt']; delete data['createdBy']; delete data['updatedAt']; delete data['updatedBy']; delete data['_stored'];
      if (isNew) {
        batch.set(doc(this.firestore, CONFIG_COLLECTION, segment.id), { ...data, createdAt: serverTimestamp(), createdBy: pid });
      } else {
        if (!segment.description) data['description'] = deleteField();
        if (!segment.groupid) data['groupid'] = deleteField();
        batch.set(doc(this.firestore, CONFIG_COLLECTION, segment.id), { ...data, updatedAt: serverTimestamp(), updatedBy: pid }, { merge: true });
      }
      // one order: a new card moves the ones after it; same batch, so order and history never disagree
      this.writeOrder(batch, orderUpdates, pid);
      this.writeHistory(batch, history, pid);
      this.writeGroupHistory(batch, groupHistory, pid);
      await batch.commit();
    },
    saveDisplayOrder: async (updates, history) => {
      const pid = await this.profileId();
      const batch = writeBatch(this.firestore);
      this.writeOrder(batch, updates, pid);
      this.writeHistory(batch, history, pid);
      await batch.commit();
    },
    archiveSegment: async (id, history) => {
      const pid = await this.profileId();
      const batch = writeBatch(this.firestore);
      batch.update(doc(this.firestore, CONFIG_COLLECTION, id), { archived: true, archivedAt: serverTimestamp(), archivedBy: pid });
      this.writeHistory(batch, history, pid);
      await batch.commit();
    },
    unarchiveSegment: async (id, place, history) => {
      // back on the board: at the end of the board, and at the end of the sequence if automated
      const pid = await this.profileId();
      const batch = writeBatch(this.firestore);
      batch.update(doc(this.firestore, CONFIG_COLLECTION, id), {
        ...place, archived: deleteField(), archivedAt: deleteField(), archivedBy: deleteField(),
        updatedAt: serverTimestamp(), updatedBy: pid,
      });
      this.writeHistory(batch, history, pid);
      await batch.commit();
    },
    newSegmentId: () => doc(collection(this.firestore, CONFIG_COLLECTION)).id,
    profileNames: async ids => {
      const out: Record<string, string> = {};
      await Promise.all(ids.map(async id => {
        const d = await getDoc(doc(this.firestore, 'profile_data', id)).catch(() => null);
        out[id] = d?.exists() ? String(d.data()?.['name'] ?? '') : '';
      }));
      return out;
    },
    migrationPreview: () => this.migrationPreview(),
    runMigration: (rows, progress) => this.runMigration(rows, progress),
    // no deleteSegment: archiving is the only delete, so every segment keeps its history
    loadHistory: async segmentId => {
      // all of one segment's entries, sorted here: entries not yet backfilled have `at` instead of `updatedat`,
      // and an orderBy('updatedat') query would leave them out
      const snap = await getDocs(collection(this.firestore, CONFIG_COLLECTION, segmentId, HISTORY_SUBCOLLECTION));
      return this.newestFirst(snap.docs.map(d => this.historyRow(d.id, d.data())));
    },
    loadAllHistory: async max => {
      // every segment's subcollection in one query; needs a collection-group index on segmenthistory.updatedat (desc)
      const snap = await getDocs(query(collectionGroup(this.firestore, HISTORY_SUBCOLLECTION), orderBy('updatedat', 'desc'), limit(max)));
      return snap.docs.map(d => this.historyRow(d.id, d.data()));
    },
    historyNeedsBackfill: async () => {
      const snap = await getDocs(query(collectionGroup(this.firestore, HISTORY_SUBCOLLECTION), orderBy('at', 'desc'), limit(1)));
      return !snap.empty;
    },
    loadGroups: async () => {
      const snap = await getDocs(collection(this.firestore, GROUPS_COLLECTION));
      return snap.docs.map(d => ({ id: d.id, name: String(d.data()['name'] ?? d.id), order: Number(d.data()['order'] ?? 0), deleted: d.data()['deleted'] === true }));
    },
    createGroup: async (name, order) => {
      const pid = await this.profileId();
      const ref = doc(collection(this.firestore, GROUPS_COLLECTION));
      const batch = writeBatch(this.firestore);
      batch.set(ref, { name, order, deleted: false, createdAt: serverTimestamp(), createdBy: pid, updatedAt: serverTimestamp(), updatedBy: pid });
      this.writeGroupHistory(batch, [{ groupid: ref.id, action: 'create', changes: { name: { from: null, to: name } }, summary: `Created “${name}”` }], pid);
      await batch.commit();
      return { id: ref.id, name, order, deleted: false } as SegmentGroup;
    },
    renameGroup: async (id, from, to) => {
      const pid = await this.profileId();
      const batch = writeBatch(this.firestore);
      batch.update(doc(this.firestore, GROUPS_COLLECTION, id), { name: to, updatedAt: serverTimestamp(), updatedBy: pid });
      this.writeGroupHistory(batch, [{ groupid: id, action: 'rename', changes: { name: { from, to } }, summary: `Renamed “${from}” → “${to}”` }], pid);
      await batch.commit();
    },
    deleteGroup: async (id, name, segments) => {
      // soft delete: the group doc stays (deleted: true) so history still names it; its id leaves every segment
      const pid = await this.profileId();
      const ids = segments.map(x => x.id);
      for (let i = 0; i === 0 || i < segments.length; i += 200) {
        const batch = writeBatch(this.firestore);
        if (i === 0) {
          batch.update(doc(this.firestore, GROUPS_COLLECTION, id), { deleted: true, deletedAt: serverTimestamp(), deletedBy: pid, updatedAt: serverTimestamp(), updatedBy: pid });
          this.writeGroupHistory(batch, [{ groupid: id, action: 'delete', changes: { deleted: { from: false, to: true }, segments: { added: [], removed: ids } },
            summary: `Deleted “${name}”${ids.length ? `; removed from ${ids.length} segment${ids.length === 1 ? '' : 's'}` : ''}` }], pid);
        }
        for (const x of segments.slice(i, i + 200)) {
          batch.update(doc(this.firestore, CONFIG_COLLECTION, x.id), { groupid: deleteField(), updatedAt: serverTimestamp(), updatedBy: pid });
          this.writeHistory(batch, [{ segmentid: x.id, segmentname: x.name, action: 'edit', changedfields: ['groupid'],
            changes: { groupid: { from: id, to: null } }, summary: `Group removed: ${name} (group deleted)` }], pid);
        }
        await batch.commit();
      }
    },
    loadGroupHistory: async groupId => {
      const snap = await getDocs(collection(this.firestore, GROUPS_COLLECTION, groupId, GROUP_HISTORY_SUBCOLLECTION));
      return this.newestFirst(snap.docs.map(d => this.historyRow(d.id, d.data())));
    },
    loadParticipants: async () => {
      // journey names label each participant's journey id in the tables (see segment-board.facts.ts).
      // orderBy('name') on purpose: like Participants Analytics, docs with no `name` field are left out, so the counts match.
      const [people, journeys] = await Promise.all([getDocs(query(collection(this.firestore, PARTICIPANTS_COLLECTION), orderBy('name'))), this.journeys()]);
      const journeyNames = new Map(journeys.map(j => [j.id, j.name]));
      this.meta = new Map(people.docs.map(d => [d.id, d.data()]));
      return people.docs.map(d => toParticipant(d.id, d.data(), journeyNames));
    },
    readTable: async file => {
      // CSV, .xlsx and .xls through the xlsx package the app already ships; first sheet, every cell as text
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][]).map(r => r.map(c => String(c ?? ''))) : [];
    },
    loadCatalog: async () => {
      const [journeys, products, modes, events, queues] = await Promise.all([
        this.journeys(), getDocs(collection(this.firestore, 'products')),
        getDocs(query(collection(this.firestore, 'modes'), orderBy('sequence', 'asc'))),
        // Live events filter: every event; Queue filter: every queue and its stages
        getDocs(collection(this.firestore, 'event collection')).catch(() => null),
        getDocs(collection(this.firestore, 'queue generation')).catch(() => null),
      ]);
      return {
        journeys,
        events: (events?.docs ?? []).map(e => ({ id: e.id, name: String(e.data()['name'] ?? e.id), date: e.data()['start_date']?.toDate?.() ?? null })),
        queues: (queues?.docs ?? []).map(q => ({
          id: q.id, name: String(q.data()['queuename'] ?? q.id),
          stages: (Array.isArray(q.data()['stages']) ? q.data()['stages'] : []).map((st: any) => String(st?.['stagename'] ?? '')).filter(Boolean),
        })),
        modes: modes.docs.map(m => ({ id: m.id, name: String(m.data()['mode'] ?? m.id).trim() })).filter(m => m.name),
        products: products.docs.map(p => ({ id: p.id, name: String(p.data()['product'] ?? p.id) })),
        countDefaults: { upCount: [], cpmCount: [] },   // products are picked on each condition
      };
    },
    communicate: (channel, profileIds) => {
      const people = profileIds.map(id => this.meta.get(id)).filter(Boolean);
      return channel === 'app' ? this.sendNotification(people) : channel === 'email' ? this.sendEmail(people) : this.sendWhatsapp(people);
    },
    recommendPlaylist: async profileIds => {
      const people = profileIds.map(id => this.meta.get(id)).filter(Boolean);
      // the dialog saves the recommendation itself (same as B!G Cohorts: sendCohortRecommendedPlaylist)
      const ref = this.dialog.open(MapRecommendedplaylistToparticipantComponentComponent, {
        data: { participantlist: people }, minWidth: '500px', disableClose: true,
      });
      const result = await firstValueFrom(ref.afterClosed());
      return result == null ? null : `Recommended playlist to ${people.length} participant${people.length === 1 ? '' : 's'}`;
    },
    loadQueueTokens: async () => {
      // as Participants Analytics / Participant Intelligence: active, approved tokens only
      const snap = await getDocs(query(collection(this.firestore, 'queue_token'), where('stagestatus', '==', 'Approved'), where('tokenstatus', '==', 'Active')));
      return snap.docs.map(d => ({ profileId: d.data()['profile_id'], queueId: d.data()['queueref']?.id, stage: String(d.data()['currentstage'] ?? '') }));
    },
    loadConfirmed: async eventIds => {
      // approved participation requests for the picked events; Firestore `in` takes at most 30 values per query
      const out: Record<string, string[]> = {};
      for (const id of eventIds) out[id] = [];
      for (let i = 0; i < eventIds.length; i += 30) {
        const refs = eventIds.slice(i, i + 30).map(id => doc(this.firestore, 'event collection', id));
        const snap = await getDocs(query(collection(this.firestore, 'event participation request'), where('eventref', 'in', refs), where('status', '==', 'approved')));
        for (const d of snap.docs) {
          const eventId = d.data()['eventref']?.id, pid = d.data()['profileid'];
          if (eventId && pid && out[eventId]) out[eventId].push(pid);
        }
      }
      return out;
    },
    loadLists: async () => {
      const snap = await getDocs(collection(this.firestore, LIST_COLLECTION));
      return snap.docs.map(d => {
        const data = d.data();
        return { segmentid: data['segmentid'] ?? d.id, profilelist: data['profilelist'] ?? [], lastupdated: data['lastupdated']?.toDate?.() ?? null };
      });
    },
    saveLists: async lists => {
      // one batch per 450 lists (Firestore allows 500 writes per batch)
      for (let i = 0; i < lists.length; i += 450) {
        const batch = writeBatch(this.firestore);
        for (const l of lists.slice(i, i + 450)) {
          batch.set(doc(this.firestore, LIST_COLLECTION, l.segmentid), {
            segmentname: l.segmentname, segmentid: l.segmentid, profilelist: l.profilelist, lastupdated: serverTimestamp(),
          });
        }
        await batch.commit();
      }
    },
  };

  // ---- Send communication: the B!G Cohorts dashboard's dialogs and send paths (cohort-management.component.ts) ----

  /** App notification (AhNotificationComponent): image upload, then a notification record for every app user. */
  private async sendNotification(people: any[]): Promise<string | null> {
    const ref = this.dialog.open(AhNotificationComponent, { width: '60vw', maxHeight: '90vh', disableClose: true, autoFocus: false });
    const result = await firstValueFrom(ref.afterClosed());
    if (result == null) return null;
    const profileID = people.filter(p => p['firebaseuserref'] != null).map(p => p['profileid']);
    let notificationimage = null;
    if (result['notificationimage'] != null) {
      const filepath = 'Notification Images/' + new Date().toISOString() + result['notificationimage'].name;
      try {
        const upload = await uploadBytes(ref_(this.storage, filepath), result['notificationimage']);
        notificationimage = await getDownloadURL(upload.ref);
      } catch (error) {
        console.log('file upload error', error);
      }
    }
    await this.authguard.saveNotificationRecord({
      title: result['title'], message: result['message'], subtitle: result['subtitle'] ?? null,
      notificationtype: 'ahupdate', notificationimage, sticky: result['sticky'], logged: true,
      landingpage: result['landingpage'], profileid: profileID,
    });
    this.authguard.openSnackBar(`A&H Update sent to ${profileID.length} app user${profileID.length === 1 ? '' : 's'}`, 'OK', 3000);
    return `App notification to ${profileID.length} app user${profileID.length === 1 ? '' : 's'}`;
  }

  /** Email (EmailInputComponent): queue / send through `email archive`, or POST sendBatchEmail once validated. */
  private async sendEmail(people: any[]): Promise<string | null> {
    const ref = this.dialog.open(EmailInputComponent, { data: people, minWidth: '600px', disableClose: true });
    const result = await firstValueFrom(ref.afterClosed());
    if (result == null) return null;
    if (result['status'] == 'queued' || result['status'] == 'send') {
      try {
        await setDoc(doc(collection(this.firestore, 'email archive'), result['docid']), result, { merge: true });
        this.authguard.openSnackBar(result['status'] == 'queued' ? 'Successfully Added to Queue' : 'Email Sent Successfully', 'OK', 600);
      } catch (err) {
        console.log(err);
        this.authguard.openSnackBar('Error Sending Email', 'OK', 600);
        return null;
      }
    } else if (result['status'] == 'validated') {
      const url = environment.firebase.projectId == 'starlabs-test' ? 'https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail'
        : environment.firebase.projectId == 'fir-sample-aae4a' ? 'https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail' : null;
      if (url) {
        const data = { ...result, archiveid: result['docid'] };
        this.http.post(url, JSON.stringify(data), { responseType: 'text', headers: new HttpHeaders().set('Content-Type', 'application/json') })
          .subscribe({ error: err => console.log('Error: ' + err) });
      }
    }
    return `Email (${result['status']}) to ${people.length} participant${people.length === 1 ? '' : 's'}`;
  }

  /** WhatsApp (WatiInputComponent): the dialog sends through Wati itself and reports success or failure. */
  private async sendWhatsapp(people: any[]): Promise<string | null> {
    const ref = this.dialog.open(WatiInputComponent, { data: people, width: '70vw', height: '80vh', disableClose: true });
    const result = await firstValueFrom(ref.afterClosed());
    if (result == null) return null;
    if (result == 'success') {
      this.authguard.openSnackBar('Wati Message Sent Successfully', 'OK', 600);
      return `WhatsApp to ${people.length} participant${people.length === 1 ? '' : 's'}`;
    }
    if (result == 'failed') this.authguard.openSnackBar('Sending Wati Message Failed', 'OK', 600);
    return null;
  }

  /** `journey` docs as { id, name }, read once and shared by the catalogue and the participant loader. */
  private journeysP: Promise<{ id: string; name: string }[]> | null = null;
  private journeys() {
    return this.journeysP ??= getDocs(collection(this.firestore, 'journey'))
      .then(s => s.docs.map(j => ({ id: j.id, name: String(j.data()['journey'] ?? j.id) })));
  }

  /** displayIndex for every moved card, sequence for automated ones. */
  private writeOrder(batch: WriteBatch, updates: OrderUpdate[], pid: string) {
    for (const u of updates) {
      batch.update(doc(this.firestore, CONFIG_COLLECTION, u.id), {
        displayIndex: u.displayIndex, ...(u.sequence !== undefined ? { sequence: u.sequence } : {}),
        updatedAt: serverTimestamp(), updatedBy: pid,
      });
    }
  }

  /** One doc per changed segment in segmentboardconfig/{id}/segmenthistory: what changed, when (server time) and who (profile id). */
  private writeHistory(batch: WriteBatch, history: HistoryEntry[], pid: string) {
    for (const h of history) {
      batch.set(doc(collection(this.firestore, CONFIG_COLLECTION, h.segmentid, HISTORY_SUBCOLLECTION)), { ...h, updatedat: serverTimestamp(), updatedby: pid });
    }
  }

  /** One doc per group event in segmentboardgroups/{id}/grouphistory, with updatedby (profile id) and updatedat. */
  private writeGroupHistory(batch: WriteBatch, entries: GroupHistoryEntry[], pid: string) {
    for (const g of entries) {
      const { groupid, ...rest } = g;
      batch.set(doc(collection(this.firestore, GROUPS_COLLECTION, groupid, GROUP_HISTORY_SUBCOLLECTION)), { ...rest, updatedat: serverTimestamp(), updatedby: pid });
    }
  }

  private newestFirst<T extends { at: Date | null }>(rows: T[]): T[] {
    return rows.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  }

  /**
   * The signed-in user's profile id: the profile_data doc linked to user_data/{uid} (as authService.username()).
   * Read once. No fallback to the email: a write without a profile id is refused.
   */
  private profileIdP: Promise<string> | null = null;
  private profileId(): Promise<string> {
    return this.profileIdP ??= (async () => {
      const uid = this.auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in.');
      const snap = await getDocs(query(collection(this.firestore, 'profile_data'), where('user_ref', '==', doc(this.firestore, 'user_data', uid)), limit(1)));
      const d = snap.docs[0];
      const pid = d ? String(d.data()['profileid'] ?? d.id) : '';
      if (!pid) throw new Error('No profile found for your sign-in, so the change can’t be recorded against you.');
      return pid;
    })().catch(e => { this.profileIdP = null; throw e; });
  }

  // ---- One-time migration: name-slug ids -> auto ids; createdBy / updatedBy / archivedBy email -> profile id ----

  /** Every segment that still needs it, with what would change. Reads only. */
  private async migrationPreview(): Promise<{ rows: MigrationRow[]; history: { count: number; unresolved: number } }> {
    const [configs, lists] = await Promise.all([getDocs(collection(this.firestore, CONFIG_COLLECTION)), getDocs(collection(this.firestore, LIST_COLLECTION))]);
    const listSize = new Map(lists.docs.map(l => [l.id, (l.data()['profilelist'] ?? []).length as number]));
    const emailToPid = new Map<string, string | null>();
    const rows: MigrationRow[] = [];
    for (const c of configs.docs) {
      const d = c.data();
      if (d['migratedto']) continue;
      const move = !/^[A-Za-z0-9]{20}$/.test(c.id);
      const who: MigrationRow['who'] = {};
      for (const k of ['createdBy', 'updatedBy', 'archivedBy']) {
        const v = String(d[k] ?? '');
        if (!v.includes('@')) continue;
        if (!emailToPid.has(v)) emailToPid.set(v, await this.profileIdForEmail(v));
        who[k] = { from: v, to: emailToPid.get(v) ?? null };
      }
      if (!move && !Object.keys(who).length) continue;
      const hist = await getDocs(collection(this.firestore, CONFIG_COLLECTION, c.id, HISTORY_SUBCOLLECTION));
      rows.push({
        oldId: c.id, newId: move ? doc(collection(this.firestore, CONFIG_COLLECTION)).id : null,
        name: String(d['name'] ?? c.id), archived: !!d['archived'], listSize: listSize.has(c.id) ? listSize.get(c.id)! : null,
        historyCount: hist.size, who,
      });
    }
    const old = await this.oldHistoryEntries();
    let unresolved = 0;
    for (const h of old) if (!(await this.byToProfileId(h.data()['by']))) unresolved++;
    return { rows, history: { count: old.length, unresolved } };
  }

  /** Segment history entries still on the old fields (`at` / `by`), across every segment. */
  private async oldHistoryEntries() {
    return (await getDocs(query(collectionGroup(this.firestore, HISTORY_SUBCOLLECTION), orderBy('at', 'asc')))).docs;
  }

  /** The old `by` → a profile id: by.profileid, else by.email, else by.uid via profile_data.user_ref. Cached. */
  private byCache = new Map<string, string | null>();
  private async byToProfileId(by: any): Promise<string | null> {
    if (!by) return null;
    if (by.profileid) return String(by.profileid);
    const key = String(by.email || by.uid || '');
    if (!key) return null;
    if (this.byCache.has(key)) return this.byCache.get(key)!;
    let pid: string | null = by.email ? await this.profileIdForEmail(String(by.email)) : null;
    if (!pid && by.uid) {
      const snap = await getDocs(query(collection(this.firestore, 'profile_data'), where('user_ref', '==', doc(this.firestore, 'user_data', String(by.uid))), limit(1)));
      pid = snap.docs[0] ? String(snap.docs[0].data()['profileid'] ?? snap.docs[0].id) : null;
    }
    this.byCache.set(key, pid);
    return pid;
  }

  /** at -> updatedat, by -> updatedby (profile id). An editor that can't be found keeps its `by`; `at` is renamed anyway. */
  private async backfillHistory(): Promise<number> {
    const old = await this.oldHistoryEntries();
    let n = 0;
    for (let i = 0; i < old.length; i += 400) {
      const batch = writeBatch(this.firestore);
      for (const h of old.slice(i, i + 400)) {
        const d = h.data(), pid = await this.byToProfileId(d['by']);
        batch.update(h.ref, { updatedat: d['at'], at: deleteField(), ...(pid ? { updatedby: pid, by: deleteField() } : {}) });
        n++;
      }
      await batch.commit();
    }
    return n;
  }

  private async profileIdForEmail(email: string): Promise<string | null> {
    for (const e of [...new Set([email, email.toLowerCase()])]) {
      const snap = await getDocs(query(collection(this.firestore, 'profile_data'), where('email', '==', e), limit(1)));
      if (snap.docs[0]) return String(snap.docs[0].data()['profileid'] ?? snap.docs[0].id);
    }
    return null;
  }

  /**
   * Per segment: history copies first (same doc ids, so a re-run overwrites instead of duplicating), then one batch with
   * the new config doc, its list under the new id, the old list removed, a `migrate` entry and the old config retired
   * (archived + migratedto). Then saved Participant Intelligence filters are remapped old id -> new id.
   */
  private async runMigration(rows: MigrationRow[], progress: (done: number, total: number) => void): Promise<MigrationResult> {
    const pid = await this.profileId();
    const result: MigrationResult = { moved: 0, whoFixed: 0, filtersRemapped: 0, historyUpdated: 0, failed: [] };
    const idMap = new Map<string, string>();
    let done = 0;
    for (const r of rows) {
      try {
        const oldRef = doc(this.firestore, CONFIG_COLLECTION, r.oldId);
        const snap = await getDoc(oldRef);
        if (!snap.exists() || snap.data()['migratedto']) { done++; progress(done, rows.length); continue; }   // already done
        const data = snap.data();
        const whoFix: Record<string, string> = {};
        for (const [k, w] of Object.entries(r.who)) if (w.to) whoFix[k] = w.to;
        if (!r.newId) {
          if (Object.keys(whoFix).length) { await updateDoc(oldRef, whoFix); result.whoFixed++; }
          done++; progress(done, rows.length); continue;
        }
        const newId = r.newId;
        const hist = await getDocs(collection(this.firestore, CONFIG_COLLECTION, r.oldId, HISTORY_SUBCOLLECTION));
        for (let i = 0; i < hist.docs.length; i += 400) {
          const b = writeBatch(this.firestore);
          for (const h of hist.docs.slice(i, i + 400)) {
            b.set(doc(this.firestore, CONFIG_COLLECTION, newId, HISTORY_SUBCOLLECTION, h.id), { ...h.data(), segmentid: newId, copiedfrom: r.oldId });
          }
          await b.commit();
        }
        const list = await getDoc(doc(this.firestore, LIST_COLLECTION, r.oldId));
        const b = writeBatch(this.firestore);
        b.set(doc(this.firestore, CONFIG_COLLECTION, newId), { ...data, ...whoFix, id: newId, legacyid: r.oldId });
        if (list.exists()) {
          b.set(doc(this.firestore, LIST_COLLECTION, newId), { ...list.data(), segmentid: newId });
          b.delete(list.ref);
        }
        b.set(doc(this.firestore, CONFIG_COLLECTION, newId, HISTORY_SUBCOLLECTION, 'migrate'), {
          segmentid: newId, segmentname: r.name, action: 'migrate', changedfields: ['id'],
          changes: { id: { from: r.oldId, to: newId } }, summary: `Moved to a random id (was ${r.oldId})`,
          updatedat: serverTimestamp(), updatedby: pid,
        });
        b.update(oldRef, { archived: true, migratedto: newId, migratedAt: serverTimestamp(), migratedBy: pid });
        await b.commit();
        idMap.set(r.oldId, newId);
        result.moved++;
        if (Object.keys(whoFix).length) result.whoFixed++;
      } catch (e: any) {
        result.failed.push({ id: r.oldId, error: e?.message || String(e) });
      }
      done++; progress(done, rows.length);
    }
    if (idMap.size) result.filtersRemapped = await this.remapSavedFilters(idMap);
    // last, so the history copied to the new ids above is renamed too
    result.historyUpdated = await this.backfillHistory();
    return result;
  }

  /** Participant Intelligence saved filters (searchquery) pick segments by id in pifilter.journeysegments / exclude.journeysegments. */
  private async remapSavedFilters(idMap: Map<string, string>): Promise<number> {
    const snap = await getDocs(collection(this.firestore, 'searchquery'));
    let n = 0;
    for (const d of snap.docs) {
      const f = d.data()['pifilter'];
      if (!f) continue;
      const map = (a: unknown) => Array.isArray(a) ? a.map(x => idMap.get(x) ?? x) : a;
      const inc = map(f['journeysegments']), exc = map(f['exclude']?.['journeysegments']);
      const changed = JSON.stringify(inc) !== JSON.stringify(f['journeysegments']) || JSON.stringify(exc) !== JSON.stringify(f['exclude']?.['journeysegments']);
      if (!changed) continue;
      const upd: Record<string, unknown> = {};
      if (Array.isArray(inc)) upd['pifilter.journeysegments'] = inc;
      if (Array.isArray(exc)) upd['pifilter.exclude.journeysegments'] = exc;
      await updateDoc(d.ref, upd);
      n++;
    }
    return n;
  }

  /** Both shapes read the same: updatedat / updatedby (now), at / by (entries written before 2026-10-22, until backfilled). */
  private historyRow(id: string, d: any) {
    const at = (d['updatedat'] ?? d['at'])?.toDate?.() ?? null;
    const by = typeof d['updatedby'] === 'string' ? { profileid: d['updatedby'] } : d['by'] ?? null;
    return { ...d, id, at, by };
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unmount?.();
  }

  /** Loads SortableJS once; if it fails, the board still works with Arrange disabled. */
  private loadSortable(): Promise<void> {
    if ((window as any).Sortable) return Promise.resolve();
    return new Promise(resolve => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SORTABLE_SRC}"]`);
      const script = existing ?? document.createElement('script');
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => resolve(), { once: true });
      if (!existing) {
        script.src = SORTABLE_SRC;
        document.head.appendChild(script);
      }
    });
  }
}
