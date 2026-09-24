import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, PLATFORM_ID, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, collection, deleteField, doc, getDocs, serverTimestamp, writeBatch } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
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
    loadParticipants: async () => {
      // journey names label each participant's journey id in the tables (see segment-board.facts.ts)
      const [people, journeys] = await Promise.all([getDocs(collection(this.firestore, PARTICIPANTS_COLLECTION)), this.journeys()]);
      const journeyNames = new Map(journeys.map(j => [j.id, j.name]));
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
      const [journeys, products] = await Promise.all([this.journeys(), getDocs(collection(this.firestore, 'products'))]);
      return {
        journeys,
        products: products.docs.map(p => ({ id: p.id, name: String(p.data()['product'] ?? p.id) })),
        countDefaults: { upCount: [], cpmCount: [] },   // products are picked on each condition
      };
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
