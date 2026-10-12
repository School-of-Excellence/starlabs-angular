import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, PLATFORM_ID, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, collection, deleteField, doc, getDocs, orderBy, query, serverTimestamp, setDoc, where, writeBatch } from '@angular/fire/firestore';
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
import { SegmentBoardStore, mountSegmentBoard } from './segment-board.engine';
import { toParticipant } from './segment-board.facts';

// Same drag-and-drop library and version the standalone prototype uses (Arrange + sequence list).
const SORTABLE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js';
// Master segment configuration: one doc per segment, doc id = segment id.
const CONFIG_COLLECTION = 'segmentboardconfig';
// Each segment's refreshed list: doc id = segment id, { segmentname, segmentid, profilelist, lastupdated }.
const LIST_COLLECTION = 'segmentboardlist';
const PARTICIPANTS_COLLECTION = 'participant metadata';

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
    saveSegment: async (segment, { isNew, sequenceUpdates }) => {
      const batch = writeBatch(this.firestore);
      const data: Record<string, unknown> = { ...segment };
      delete data['createdAt']; delete data['createdBy']; delete data['updatedAt']; delete data['updatedBy'];
      if (isNew) {
        batch.set(doc(this.firestore, CONFIG_COLLECTION, segment.id), { ...data, createdAt: serverTimestamp(), createdBy: this.userId() });
      } else {
        if (!segment.description) data['description'] = deleteField();
        batch.set(doc(this.firestore, CONFIG_COLLECTION, segment.id), { ...data, updatedAt: serverTimestamp(), updatedBy: this.userId() }, { merge: true });
      }
      // a new automated segment shifts the ones after it down: same batch, so the sequence never has gaps or duplicates
      for (const u of sequenceUpdates) {
        batch.update(doc(this.firestore, CONFIG_COLLECTION, u.id), { sequence: u.sequence, updatedAt: serverTimestamp(), updatedBy: this.userId() });
      }
      await batch.commit();
    },
    saveDisplayOrder: async ids => {
      const batch = writeBatch(this.firestore);
      ids.forEach((id, i) => batch.update(doc(this.firestore, CONFIG_COLLECTION, id), { displayIndex: i }));
      await batch.commit();
    },
    archiveSegment: async id => {
      const batch = writeBatch(this.firestore);
      batch.update(doc(this.firestore, CONFIG_COLLECTION, id), { archived: true, archivedAt: serverTimestamp(), archivedBy: this.userId() });
      await batch.commit();
    },
    unarchiveSegment: async (id, place) => {
      // back on the board: at the end of the board, and at the end of the sequence if automated
      const batch = writeBatch(this.firestore);
      batch.update(doc(this.firestore, CONFIG_COLLECTION, id), {
        ...place, archived: deleteField(), archivedAt: deleteField(), archivedBy: deleteField(),
        updatedAt: serverTimestamp(), updatedBy: this.userId(),
      });
      await batch.commit();
    },
    deleteSegment: async id => {
      // only reachable from the Archived view; removes the config and its saved list together
      const batch = writeBatch(this.firestore);
      batch.delete(doc(this.firestore, CONFIG_COLLECTION, id));
      batch.delete(doc(this.firestore, LIST_COLLECTION, id));
      await batch.commit();
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

  private userId(): string {
    const u = this.auth.currentUser;
    return u?.email || u?.uid || 'unknown';
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
