import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ParticipantStore } from '../../core/participant.store';

@Component({
  selector: 'app-active-filter-chips',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.chips().length || store.activeSignal()) {
      <div class="bar">
        @if (store.activeSignal(); as sig) {
          <button class="chip signal" (click)="store.clearSignal()">
            <span class="material-symbols-rounded lead-ic">insights</span>
            <span class="txt">{{ sig.label }}</span>
            <span class="material-symbols-rounded">close</span>
          </button>
        }
        @if (store.chips().length) {
          <span class="lead">Filters</span>
          @for (chip of store.chips(); track chip.label) {
            <button class="chip" (click)="store.removeChip(chip)">
              <span class="txt">{{ chip.label }}</span>
              <span class="material-symbols-rounded">close</span>
            </button>
          }
        }
        <button class="clear" (click)="store.clearFilter()">Clear all</button>
      </div>
    }
  `,
  styles: [
    `
      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 7px;
        padding: 10px 18px;
        border-bottom: 1px solid var(--pi-border);
        background: var(--pi-surface);
      }
      .lead {
        font-size: 12px;
        font-weight: 600;
        color: var(--pi-text-3);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-right: 2px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: 1px solid var(--pi-border-strong);
        background: var(--pi-surface);
        color: var(--pi-text);
        font-size: 12.5px;
        font-weight: 500;
        font-family: inherit;
        padding: 4px 6px 4px 11px;
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.1s ease;
      }
      .chip:hover {
        border-color: var(--pi-status-banned);
        color: var(--pi-status-banned);
        background: var(--pi-status-banned-bg);
      }
      .chip .material-symbols-rounded {
        font-size: 15px;
      }
      .chip.signal {
        border-color: var(--pi-accent);
        color: var(--pi-accent-text);
        background: var(--pi-accent-bg);
        font-weight: 600;
      }
      .chip.signal:hover {
        border-color: var(--pi-status-banned);
        color: var(--pi-status-banned);
        background: var(--pi-status-banned-bg);
      }
      .chip.signal .lead-ic {
        font-size: 16px;
      }
      .clear {
        border: none;
        background: none;
        color: var(--pi-accent);
        font-size: 12.5px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        padding: 4px 8px;
        margin-left: 2px;
      }
      .clear:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class ActiveFilterChipsComponent {
  readonly store = inject(ParticipantStore);
}
