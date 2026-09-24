import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { saveAs } from 'file-saver';
import { ParticipantStore } from '../core/participant.store';
import { Participant } from '../models/participant.model';

interface Row {
  name: string;
  journey: string;
  tier: string;
  atc: number;
  consumed: number;
  score: number;
}

@Component({
  selector: 'app-evolution-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg wide">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">insights</span></span>
        <div>
          <h2>Participant evolution summary</h2>
          <p>{{ rows().length }} participants — engagement snapshot.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <table class="evo">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Journey</th>
              <th>Tier</th>
              <th class="num">ATC</th>
              <th class="num">Consumed</th>
              <th class="num">Engagement</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows().slice(0, 200); track r.name) {
              <tr>
                <td>{{ r.name }}</td>
                <td>{{ r.journey }}</td>
                <td>{{ r.tier }}</td>
                <td class="num">{{ r.atc }}</td>
                <td class="num">{{ r.consumed }}</td>
                <td class="num">
                  <span class="score" [style.width.%]="bar(r.score)"></span>
                  <b>{{ r.score }}</b>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (rows().length > 200) {
          <p class="more">Showing first 200 of {{ rows().length }}. Export for the full set.</p>
        }
      </div>

      <div class="dlg-foot">
        <button class="btn btn-ghost spacer" (click)="ref.close()">Close</button>
        <button class="btn btn-primary" (click)="exportCsv()">
          <span class="material-symbols-rounded">download</span> Export CSV
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .evo {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th {
        text-align: left;
        font-size: 11.5px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--pi-text-3);
        padding: 0 12px 8px;
        border-bottom: 1px solid var(--pi-border);
        position: sticky;
        top: 0;
        background: var(--pi-surface);
      }
      th.num,
      td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      td {
        padding: 9px 12px;
        border-bottom: 1px solid #eef1f4;
      }
      td.num {
        position: relative;
      }
      .score {
        position: absolute;
        left: 12px;
        bottom: 4px;
        height: 3px;
        background: var(--pi-accent);
        border-radius: 2px;
        opacity: 0.5;
      }
      .more {
        text-align: center;
        color: var(--pi-text-3);
        font-size: 12.5px;
        margin-top: 12px;
      }
    `,
  ],
})
export class EvolutionDialogComponent {
  readonly ref = inject(MatDialogRef<EvolutionDialogComponent>);
  readonly data = inject<{ participants: Participant[] }>(MAT_DIALOG_DATA);
  private readonly store = inject(ParticipantStore);

  readonly rows = computed<Row[]>(() => {
    const jm = this.map(this.store.reference().journeys);
    const tm = this.map(this.store.reference().tiers);
    return this.data.participants
      .map((p) => ({
        name: p.name,
        journey: p.activejourney ? jm[p.activejourney] : '—',
        tier: p.tier.length ? tm[p.tier[0]] : '—',
        atc: p.atccount,
        consumed: p.consumedproducts.length,
        score: p.atccount * 2 + p.consumedproducts.length * 3,
      }))
      .sort((a, b) => b.score - a.score);
  });

  private map(arr: { id: string; name: string }[]): Record<string, string> {
    const m: Record<string, string> = {};
    for (const a of arr) m[a.id] = a.name;
    return m;
  }

  bar(score: number): number {
    const max = Math.max(...this.rows().map((r) => r.score), 1);
    return Math.round((score / max) * 100);
  }

  exportCsv(): void {
    const header = ['Participant', 'Journey', 'Tier', 'ATC', 'Consumed', 'Engagement'];
    const lines = this.rows().map((r) => [r.name, r.journey, r.tier, r.atc, r.consumed, r.score].join(','));
    const csv = '﻿' + [header.join(','), ...lines].join('\n');
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'participant-evolution-summary.csv');
  }
}
