import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
  EVPREP_BOARDS, EVPREP_SAMPLE, EvPrepBoard, EvPrepDoc, EvPrepNote, EvPrepStage,
  canMove, daysInStage, groupByStage, neighbourStage, stageOf,
} from './evprep-board.config';

/** One card on a board. */
export interface EvPrepCard extends EvPrepDoc {
  name: string;
  email: string | null;
  journey: string | null;
  coach: string | null;
  since: Date | null;
}

interface PendingMove { card: EvPrepCard; board: EvPrepBoard; from: EvPrepStage; to: EvPrepStage; }

/**
 * Ev. Preparation tab of Journey Coach Health: two kanban boards (New Participants, Attended 1 uP!
 * and above). DESIGN PREVIEW (operator 2026-11-11, "just show the design now, no wiring"): sample
 * cards only, no Firestore reads or writes; moves (drag or Next / back, each with a required note)
 * change this page only and reset on reload. The move box is an in-page overlay, not a MatDialog.
 */
@Component({
  selector: 'app-jc-evprep-board',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './jc-evprep-board.component.html',
  styleUrls: ['./jc-evprep-board.component.css'],
})
export class JcEvprepBoardComponent {
  readonly boards = EVPREP_BOARDS;
  cards: EvPrepCard[] = EVPREP_SAMPLE.map(s => ({
    ...s,
    since: new Date(Date.now() - s.days * 86400000),
  }));
  /** cols[boardKey][stageKey] -> cards in that column. Rebuilt from `cards` after every change. */
  cols: Record<string, Record<string, EvPrepCard[]>> = {};

  pending: PendingMove | null = null;
  moveNote = '';
  moveTouched = false;
  lastMovedId: string | null = null;

  constructor() { this.regroup(); }

  regroup(): void {
    const byName = (a: EvPrepCard, b: EvPrepCard) => a.name.localeCompare(b.name);
    this.cols = {};
    for (const b of this.boards) {
      const g = groupByStage(b.key, this.cards);
      for (const k of Object.keys(g)) g[k].sort(byName);
      this.cols[b.key] = g;
    }
  }

  boardTotal(b: EvPrepBoard): number {
    return b.stages.reduce((n, s) => n + (this.cols[b.key]?.[s.key]?.length ?? 0), 0);
  }

  listId(b: EvPrepBoard, s: EvPrepStage): string { return `evp-${b.key}-${s.key}`; }
  connectedTo(b: EvPrepBoard): string[] { return b.stages.map(s => this.listId(b, s)); }
  initials(n: string): string { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase(); }

  days(c: EvPrepCard): number { return daysInStage(c.since); }
  next(b: EvPrepBoard, c: EvPrepCard): EvPrepStage | null { return neighbourStage(b.key, c.stage, 1); }
  prev(b: EvPrepBoard, c: EvPrepCard): EvPrepStage | null { return neighbourStage(b.key, c.stage, -1); }

  /** Drop onto another column of the same board opens the move box; nothing changes until it is saved. */
  onDrop(b: EvPrepBoard, to: EvPrepStage, ev: CdkDragDrop<string>): void {
    const card = ev.item.data as EvPrepCard;
    if (!card || ev.previousContainer === ev.container) return;
    this.askMove(b, card, to);
  }

  askMove(b: EvPrepBoard, card: EvPrepCard, to: EvPrepStage | null): void {
    const from = stageOf(b, card.stage);
    if (!to || !from || !canMove(b.key, card.stage, to.key)) return;
    this.pending = { card, board: b, from, to };
    this.moveNote = '';
    this.moveTouched = false;
  }

  closeMove(): void { this.pending = null; }

  confirmMove(): void {
    this.moveTouched = true;
    const p = this.pending;
    const text = this.moveNote.trim();
    if (!p || !text) return;
    const note: EvPrepNote = { by: '', at: new Date(), note: text, fromStage: p.from.label, toStage: p.to.label };
    p.card.stage = p.to.key;
    p.card.since = new Date();
    p.card.notes = [...(p.card.notes ?? []), note];
    this.lastMovedId = p.card.profileid;
    this.regroup();
    this.pending = null;
  }

  pastNotes(c: EvPrepCard): EvPrepNote[] { return [...(c.notes ?? [])].reverse(); }
}
