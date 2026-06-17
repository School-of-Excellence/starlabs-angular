import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ParticipantStore } from '../../core/participant.store';
import { SIGNALS, SIGNAL_CATEGORIES, SignalCategory, SignalDef } from '../../core/signals';

@Component({
  selector: 'app-signals-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      @for (cat of categories; track cat.key) {
        <div class="cat">
          <span class="cat-head">{{ cat.label }}</span>
          <div class="cards">
            @for (s of byCat(cat.key); track s.id) {
              <button
                class="card sev-{{ s.severity }}"
                [class.active]="store.signalId() === s.id"
                [class.empty]="count(s.id) === 0"
                [disabled]="count(s.id) === 0"
                [title]="s.description"
                (click)="store.applySignal(s.id)"
              >
                <span class="count">{{ count(s.id) | number }}</span>
                <span class="label">{{ s.label }}</span>
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .panel {
        display: flex;
        gap: 22px;
        padding: 14px 18px;
        overflow-x: auto;
        background: var(--pi-surface-2);
        border-bottom: 1px solid var(--pi-border);
      }
      .cat {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex-shrink: 0;
      }
      .cat-head {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--pi-text-3);
      }
      .cards {
        display: flex;
        gap: 8px;
      }
      .card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
        width: 132px;
        min-height: 64px;
        padding: 9px 11px 10px;
        border: 1px solid var(--pi-border);
        border-left: 3px solid var(--pi-border-strong);
        border-radius: var(--pi-radius);
        background: var(--pi-surface);
        font-family: inherit;
        cursor: pointer;
        text-align: left;
        transition: all 0.1s ease;
      }
      .card:hover:not(:disabled) {
        border-color: var(--pi-accent);
        box-shadow: var(--pi-shadow-sm);
      }
      .card.active {
        border-color: var(--pi-accent);
        background: var(--pi-accent-bg);
        box-shadow: 0 0 0 1px var(--pi-accent);
      }
      .card.empty {
        cursor: default;
        opacity: 0.5;
      }
      .count {
        font-size: 19px;
        font-weight: 700;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        color: var(--pi-text);
      }
      .label {
        font-size: 11.5px;
        font-weight: 500;
        line-height: 1.25;
        color: var(--pi-text-2);
      }
      .sev-critical {
        border-left-color: var(--pi-status-banned);
      }
      .sev-critical .count {
        color: var(--pi-status-banned);
      }
      .sev-warn {
        border-left-color: var(--pi-status-late);
      }
      .sev-warn .count {
        color: var(--pi-status-late);
      }
      .sev-opportunity {
        border-left-color: var(--pi-accent);
      }
      .sev-opportunity .count {
        color: var(--pi-accent);
      }
      .card.empty .count {
        color: var(--pi-text-3);
      }
    `,
  ],
})
export class SignalsPanelComponent {
  readonly store = inject(ParticipantStore);
  readonly categories = SIGNAL_CATEGORIES;

  byCat(cat: SignalCategory): SignalDef[] {
    return SIGNALS.filter((s) => s.category === cat);
  }
  count(id: string): number {
    return this.store.signalCounts()[id] ?? 0;
  }
}
