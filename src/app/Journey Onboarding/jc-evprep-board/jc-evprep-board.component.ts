import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
  Firestore, Timestamp, arrayUnion, collection, collectionData, doc, documentId, getDocs, query, setDoc, updateDoc, where,
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import {
  ACTIVE_STATUSES, EVPREP_BOARDS, EVPREP_LIVE_FROM, EVPREP_SAMPLE, EvPrepBoard, EvPrepDoc, EvPrepNote, EvPrepStage,
  EvPrepVariation, LIVE_DONE, LIVE_START, PrepUpdate, canMove, chunk, daysInStage, groupByStage, isRemovedSale,
  liveStages, neighbourStage, normaliseVariation, planPrepMove, prepColumn, prepNeighbour, stageKey, stageOf, yetToStart,
} from './evprep-board.config';

/** One card on a board. `id` is unique per card: the prep doc id, or 'yet:' + profileid, or the sample id. */
export interface EvPrepCard extends EvPrepDoc {
  id: string;
  name: string;
  email: string | null;
  journey: string | null;
  coach: string | null;
  since: Date | null;
  /** Live board only: the `evolution prep` doc behind the card (absent for Yet to start and for samples). */
  prep?: any;
  variationName?: string | null;
}

interface PendingMove {
  card: EvPrepCard; board: EvPrepBoard; from: EvPrepStage; to: EvPrepStage;
  /** Starting a prep from Yet to start: the operator must pick a variation. */
  start?: boolean;
}

/**
 * Ev. Preparation tab of Journey Coach Health: two kanban boards.
 * - New Participants is LIVE (operator 2026-11-11): Onboarded (Yet to start) | one column per stage of the
 *   `evolution prep variation` docs | Ready for SE, read from `evolution prep` + `participantjourneyproduct`.
 *   Moves write `evolution prep` (journey-pipeline schema) and append the required note.
 * - Attended 1 uP! and above stays a DESIGN PREVIEW on sample cards until its entry rule is defined.
 * The move box is an in-page overlay, not a MatDialog.
 */
@Component({
  selector: 'app-jc-evprep-board',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './jc-evprep-board.component.html',
  styleUrls: ['./jc-evprep-board.component.css'],
})
export class JcEvprepBoardComponent implements OnInit, OnDestroy {
  /** New board's stages are replaced by the live columns once the variations load. */
  boards: EvPrepBoard[] = EVPREP_BOARDS.map(b => ({ ...b, stages: b.key === 'new' ? liveStages([]) : b.stages }));
  readonly liveFrom = EVPREP_LIVE_FROM;

  /** Returning-board sample cards (design preview). */
  sampleCards: EvPrepCard[] = EVPREP_SAMPLE.filter(s => s.board === 'returning').map(s => ({
    ...s, id: 'sample:' + s.profileid, since: new Date(Date.now() - s.days * 86400000),
  }));
  /** New-board live cards, rebuilt from Firestore. */
  liveCards: EvPrepCard[] = [];
  /** cols[boardKey][stageKey] -> cards in that column. Rebuilt after every change. */
  cols: Record<string, Record<string, EvPrepCard[]>> = {};

  loading = true;
  loadError = '';
  variations: EvPrepVariation[] = [];

  pending: PendingMove | null = null;
  moveNote = '';
  moveTouched = false;
  moveVariationId = '';
  moveError = '';
  saving = false;
  lastMovedId: string | null = null;

  private preps: any[] = [];
  private pjps: any[] = [];
  private excludedProfiles = new Set<string>();
  private journeyNames: Record<string, string> = {};
  private meta: Record<string, { name?: string; email?: string }> = {};
  private sub?: Subscription;

  constructor(private firestore: Firestore, private guard: AuthguardService) { this.regroup(); }

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  // ─── Data ──────────────────────────────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    this.loading = true;
    this.loadError = '';
    this.sub?.unsubscribe();
    try {
      const [vSnap, jSnap, pjpSnap] = await Promise.all([
        getDocs(collection(this.firestore, 'evolution prep variation')),
        getDocs(collection(this.firestore, 'journey')),
        // Bounded by onboarded date (single-field range, no composite index); new + onboarded filtered below.
        getDocs(query(collection(this.firestore, 'participantjourneyproduct'),
          where('onboardedtime', '>=', Timestamp.fromDate(EVPREP_LIVE_FROM)))),
      ]);
      this.variations = vSnap.docs.map(d => normaliseVariation(d.id, d.data()));
      this.journeyNames = {};
      jSnap.docs.forEach(d => { this.journeyNames[d.id] = (d.data() as any)?.journey || d.id; });
      this.pjps = pjpSnap.docs.map(d => ({ ...(d.data() as any), docid: d.id }))
        .filter(r => r.onboarded === true && r.journeytype === 'new');
      await this.loadExclusions();
      this.boards = this.boards.map(b => (b.key === 'new' ? { ...b, stages: liveStages(this.variations) } : b));

      // Live: active + completed preps. Re-emits after every write, so moves show without a reload.
      this.sub = collectionData(query(collection(this.firestore, 'evolution prep'),
        where('status', 'in', [...ACTIVE_STATUSES, 'completed'])), { idField: '_id' })
        .subscribe({
          next: async (rows: any[]) => {
            this.preps = rows.map(r => ({ ...r, docid: r.docid || r._id }));
            await this.loadNames();
            this.rebuildLive();
            this.loading = false;
          },
          error: (e: any) => this.fail(e),
        });
    } catch (e: any) {
      this.fail(e);
    }
  }

  private fail(e: any): void {
    this.loading = false;
    this.loadError = e?.code === 'permission-denied'
      ? 'You do not have access to the evolution prep data.'
      : 'Could not load the evolution prep data.';
  }

  /** Exclusion rule needs the sale: fetch only the sales leads behind the loaded onboardings (batched by id). */
  private async loadExclusions(): Promise<void> {
    const byLead = new Map<string, string>();
    for (const r of this.pjps) { const id = r.salesleadsref?.id; if (id) byLead.set(id, r.profileid); }
    this.excludedProfiles = new Set();
    for (const ids of chunk([...byLead.keys()])) {
      const snap = await getDocs(query(collection(this.firestore, 'salesleads'), where(documentId(), 'in', ids)));
      snap.docs.forEach(d => { if (isRemovedSale(d.data())) this.excludedProfiles.add(byLead.get(d.id)!); });
    }
  }

  /** Names/emails only for participants on the board (batched 'in' queries; never the whole collection). */
  private async loadNames(): Promise<void> {
    const want = new Set<string>();
    this.pjps.forEach(r => r.profileid && want.add(r.profileid));
    this.preps.forEach(p => p.profileid && want.add(p.profileid));
    const missing = [...want].filter(id => !(id in this.meta));
    for (const ids of chunk(missing)) {
      const snap = await getDocs(query(collection(this.firestore, 'participant metadata'), where('profileid', 'in', ids)));
      snap.docs.forEach(d => { const m: any = d.data(); this.meta[m.profileid] = { name: m.name, email: m.email }; });
      ids.forEach(id => { if (!(id in this.meta)) this.meta[id] = {}; });
    }
  }

  private rebuildLive(): void {
    const journeyOf = (profileid: string) => {
      const r = this.pjps.find(x => x.profileid === profileid);
      const id = r?.journeyref?.id;
      return id ? (this.journeyNames[id] || null) : null;
    };
    const card = (id: string, profileid: string, stage: string, since: Date | null, extra: Partial<EvPrepCard> = {}): EvPrepCard => ({
      id, profileid, board: 'new', stage, since,
      name: this.meta[profileid]?.name || 'Unnamed participant',
      email: this.meta[profileid]?.email || null,
      journey: journeyOf(profileid), coach: null, ...extra,
    });
    const toDate = (t: any): Date | null => (t?.toDate ? t.toDate() : t instanceof Date ? t : null);

    const yet = yetToStart(this.pjps, this.preps).filter(r => !this.excludedProfiles.has(r.profileid))
      .map(r => card('yet:' + r.profileid, r.profileid, LIVE_START, toDate(r.onboardedtime)));

    const live = this.preps
      .filter(p => p.status !== 'completed' || (toDate(p.createdon)?.getTime() ?? 0) >= EVPREP_LIVE_FROM.getTime())
      .map(p => ({ p, col: prepColumn(p) }))
      .filter(x => !!x.col)
      .map(({ p, col }) => card(p.docid, p.profileid, col!, toDate(p.stagesince) || toDate(p.createdon), {
        prep: p, notes: p.notes || [], variationName: this.variation(p.variationid)?.variationname || null,
      }));

    this.liveCards = [...yet, ...live];
    this.regroup();
  }

  private variation(id: string): EvPrepVariation | undefined { return this.variations.find(v => v.variationid === id); }

  regroup(): void {
    const byName = (a: EvPrepCard, b: EvPrepCard) => a.name.localeCompare(b.name);
    this.cols = {};
    for (const b of this.boards) {
      const src = b.key === 'new' ? this.liveCards : this.sampleCards;
      const g = b.key === 'new' ? this.groupLive(b, src) : groupByStage(b.key, src);
      for (const k of Object.keys(g)) g[k].sort(byName);
      this.cols[b.key] = g;
    }
  }

  /** Live columns come from the variations, so bucket by the board's own stage list (unknown stages are left out). */
  private groupLive(b: EvPrepBoard, cards: EvPrepCard[]): Record<string, EvPrepCard[]> {
    const out: Record<string, EvPrepCard[]> = {};
    for (const s of b.stages) out[s.key] = [];
    for (const c of cards) if (out[c.stage]) out[c.stage].push(c);
    return out;
  }

  // ─── View helpers ─────────────────────────────────────────────────────────────────────────────

  isLive(b: EvPrepBoard): boolean { return b.key === 'new'; }

  boardTotal(b: EvPrepBoard): number {
    return b.stages.reduce((n, s) => n + (this.cols[b.key]?.[s.key]?.length ?? 0), 0);
  }

  listId(b: EvPrepBoard, s: EvPrepStage): string { return `evp-${b.key}-${s.key}`; }
  connectedTo(b: EvPrepBoard): string[] { return b.stages.map(s => this.listId(b, s)); }
  initials(n: string): string { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase(); }

  days(c: EvPrepCard): number { return daysInStage(c.since); }

  next(b: EvPrepBoard, c: EvPrepCard): EvPrepStage | null {
    if (!this.isLive(b)) return neighbourStage(b.key, c.stage, 1);
    if (c.stage === LIVE_START) return this.firstStageCol(b);
    const k = prepNeighbour(this.variation(c.prep?.variationid), c.prep ?? {}, 1);
    return k ? stageOf(b, k) ?? null : null;
  }

  prev(b: EvPrepBoard, c: EvPrepCard): EvPrepStage | null {
    if (!this.isLive(b)) return neighbourStage(b.key, c.stage, -1);
    if (c.stage === LIVE_START) return null;
    const k = prepNeighbour(this.variation(c.prep?.variationid), c.prep ?? {}, -1);
    return k ? stageOf(b, k) ?? null : null;
  }

  /** Label target for "Start" on a Yet-to-start card: the first stage column (the variation picked decides the real one). */
  private firstStageCol(b: EvPrepBoard): EvPrepStage | null {
    return b.stages.length > 2 ? b.stages[1] : null;
  }

  // ─── Moves ────────────────────────────────────────────────────────────────────────────────────

  /** Drop onto another column of the same board opens the move box; nothing changes until it is saved. */
  onDrop(b: EvPrepBoard, to: EvPrepStage, ev: CdkDragDrop<string>): void {
    const card = ev.item.data as EvPrepCard;
    if (!card || ev.previousContainer === ev.container) return;
    this.askMove(b, card, to);
  }

  askMove(b: EvPrepBoard, card: EvPrepCard, to: EvPrepStage | null): void {
    const from = stageOf(b, card.stage);
    if (!to || !from || from.key === to.key) return;
    if (!this.isLive(b) && !canMove(b.key, card.stage, to.key)) return;
    this.pending = { card, board: b, from, to, start: this.isLive(b) && card.stage === LIVE_START };
    this.moveNote = '';
    this.moveTouched = false;
    this.moveVariationId = '';
    this.moveError = '';
    // Focus the note field once the box renders (keyboard users land where the required input is).
    setTimeout(() => (document.getElementById('evp-move-note') as HTMLTextAreaElement | null)?.focus(), 0);
    if (this.pending.start) {
      if (to.key === LIVE_DONE) { this.moveError = 'Start the preparation first; it cannot jump to Ready for SE.'; }
    } else if (this.isLive(b)) {
      const plan = planPrepMove(this.variation(card.prep?.variationid), to.key);
      if (plan.block) this.moveError = plan.block;
    }
  }

  /** Variations offered when starting: those whose first stage is the column the card was dropped on (any, from Next). */
  startOptions(): EvPrepVariation[] {
    const p = this.pending;
    if (!p?.start) return [];
    const withStages = this.variations.filter(v => v.stages.length > 0);
    const dropped = withStages.filter(v => p.to.key === this.firstKey(v));
    return dropped.length ? dropped : withStages;
  }

  private firstKey(v: EvPrepVariation): string { return v.stages.length ? stageKey(v.stages[0]) : ''; }

  closeMove(): void { if (!this.saving) this.pending = null; }
  /** Escape closes the move box (jc-health-ux-review F10). */
  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.pending) this.closeMove(); }

  async confirmMove(): Promise<void> {
    this.moveTouched = true;
    const p = this.pending;
    const text = this.moveNote.trim();
    if (!p || !text || this.saving) return;
    if (p.start && !this.moveVariationId) return;
    if (this.moveError) return;

    if (!this.isLive(p.board)) {
      // Returning board: design preview, the move stays on this page.
      const note: EvPrepNote = { by: '', at: new Date(), note: text, fromStage: p.from.label, toStage: p.to.label };
      p.card.stage = p.to.key;
      p.card.since = new Date();
      p.card.notes = [...(p.card.notes ?? []), note];
      this.lastMovedId = p.card.id;
      this.regroup();
      this.pending = null;
      return;
    }

    this.saving = true;
    try {
      const by = this.actorId();
      if (!by) { this.moveError = 'Your profile could not be found. Sign in again and retry.'; return; }
      const now = Timestamp.now();
      if (p.start) {
        await this.startPrep(p.card, this.moveVariationId, text, by, now);
      } else {
        const plan = planPrepMove(this.variation(p.card.prep?.variationid), p.to.key);
        if (plan.block || !plan.update) { this.moveError = plan.block || 'This move is not allowed.'; return; }
        await this.writeMove(p.card, plan.update, p.from.label, p.to.label, text, by, now);
      }
      this.lastMovedId = p.start ? null : p.card.id;
      this.pending = null;
    } catch (e: any) {
      if (e?.code === 'blocked') return; // moveError already says why
      this.moveError = e?.code === 'permission-denied' ? 'You do not have permission to save this move.' : 'The move could not be saved. Try again.';
    } finally {
      this.saving = false;
    }
  }

  private async startPrep(card: EvPrepCard, variationid: string, text: string, by: string, now: Timestamp): Promise<void> {
    const v = this.variation(variationid);
    if (!v || v.stages.length === 0) { this.moveError = 'This variation has no stages.'; throw { code: 'blocked' }; }
    // Same guard as journey-pipeline: one running prep per participant and variation (filtered here, no composite index).
    const mine = await getDocs(query(collection(this.firestore, 'evolution prep'), where('profileid', '==', card.profileid)));
    if (mine.docs.some(d => { const x: any = d.data(); return x.variationid === variationid && ACTIVE_STATUSES.includes(x.status); })) {
      this.moveError = 'A preparation with this variation is already running for this participant.';
      throw { code: 'blocked' };
    }
    const ref = doc(collection(this.firestore, 'evolution prep'));
    const note: EvPrepNote = { by, at: now, note: text, fromStage: 'Onboarded', toStage: v.stages[0] };
    await setDoc(ref, {
      docid: ref.id,
      profileid: card.profileid,
      variationid,
      currentstage: v.stages[0],
      completedstages: [],
      status: 'initiated',
      createdon: now,
      createdby: by,
      stagesince: now,
      updatedby: by,
      updatedon: now,
      notes: [note],
    });
  }

  private async writeMove(card: EvPrepCard, u: PrepUpdate, fromLabel: string, toLabel: string, text: string, by: string, now: Timestamp): Promise<void> {
    const note: EvPrepNote = { by, at: now, note: text, fromStage: fromLabel, toStage: toLabel };
    await updateDoc(doc(this.firestore, 'evolution prep', card.prep.docid), {
      currentstage: u.currentstage,
      completedstages: u.completedstages,
      status: u.status,
      stagesince: now,
      updatedby: by,
      updatedon: now,
      notes: arrayUnion(note),
    });
  }

  /** Coach profile id for createdby / note.by (same source coach-health uses). */
  private actorId(): string | null {
    const profile: any = this.guard.loggedinProfile;
    return profile?.['profileid'] || null;
  }

  pastNotes(c: EvPrepCard): EvPrepNote[] { return [...(c.notes ?? [])].reverse(); }
  noteDate(n: EvPrepNote): Date | null { const a: any = n.at; return a?.toDate ? a.toDate() : a instanceof Date ? a : null; }
}
