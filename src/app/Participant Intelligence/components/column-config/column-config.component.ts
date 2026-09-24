import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantStore } from '../../core/participant.store';
import { COLUMN_DEF_MAP } from '../../data/column-catalog';

@Component({
  selector: 'app-column-config',
  standalone: true,
  imports: [MatMenuModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="tbtn" [matMenuTriggerFor]="menu" matTooltip="Configure columns">
      <span class="material-symbols-rounded">view_column</span>
      <span class="lbl">Columns</span>
    </button>

    <mat-menu #menu="matMenu" class="col-menu">
      <div class="head" (click)="$event.stopPropagation()">
        <span>Visible columns</span>
        <button class="reset" (click)="store.resetColumns()">Reset</button>
      </div>
      <div class="list" (click)="$event.stopPropagation()">
        @for (key of store.columnOrder(); track key) {
          <div class="row">
            <span class="name">{{ label(key) }}</span>
            <div class="row-actions">
              <button class="ic" [class.on]="store.pinned().has(key)" matTooltip="Pin to front" (click)="store.togglePin(key)" [disabled]="key === 'name'">
                <span class="material-symbols-rounded">push_pin</span>
              </button>
              <button class="ic" matTooltip="Move up" (click)="store.moveColumn(key, -1)">
                <span class="material-symbols-rounded">arrow_upward</span>
              </button>
              <button class="ic" matTooltip="Move down" (click)="store.moveColumn(key, 1)">
                <span class="material-symbols-rounded">arrow_downward</span>
              </button>
              <button class="ic del" matTooltip="Remove" (click)="store.removeColumn(key)" [disabled]="key === 'name'">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
          </div>
        }
      </div>
      @if (available().length) {
        <div class="head sub" (click)="$event.stopPropagation()">Add column</div>
        <div class="add-list" (click)="$event.stopPropagation()">
          @for (def of available(); track def.key) {
            <button class="add" (click)="store.addColumn(def.key)">
              <span class="material-symbols-rounded">add</span>{{ def.label }}
            </button>
          }
        </div>
      }
    </mat-menu>
  `,
  styles: [
    `
      .tbtn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 38px;
        padding: 0 12px;
        border: 1px solid var(--pi-border-strong);
        border-radius: var(--pi-radius);
        background: var(--pi-surface);
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        color: var(--pi-text);
        cursor: pointer;
      }
      .tbtn:hover {
        border-color: var(--pi-accent);
      }
      .tbtn .material-symbols-rounded {
        font-size: 19px;
        color: var(--pi-text-2);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--pi-text-3);
        padding: 12px 16px 6px;
      }
      .head.sub {
        border-top: 1px solid var(--pi-border);
        margin-top: 4px;
      }
      .reset {
        border: none;
        background: none;
        color: var(--pi-accent);
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .list,
      .add-list {
        max-height: 300px;
        overflow-y: auto;
        padding: 0 8px 6px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 8px;
        border-radius: 7px;
      }
      .row:hover {
        background: var(--pi-surface-3);
      }
      .name {
        font-size: 13px;
        color: var(--pi-text);
      }
      .row-actions {
        display: flex;
        gap: 1px;
      }
      .ic {
        border: none;
        background: none;
        color: var(--pi-text-3);
        cursor: pointer;
        padding: 3px;
        display: inline-flex;
        border-radius: 5px;
      }
      .ic:hover:not(:disabled) {
        color: var(--pi-text);
        background: #e7ebef;
      }
      .ic.on {
        color: var(--pi-accent);
      }
      .ic.del:hover:not(:disabled) {
        color: var(--pi-status-banned);
      }
      .ic:disabled {
        opacity: 0.3;
        cursor: default;
      }
      .ic .material-symbols-rounded {
        font-size: 16px;
      }
      .add {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        border: none;
        background: none;
        font-family: inherit;
        font-size: 13px;
        color: var(--pi-text-2);
        padding: 6px 8px;
        border-radius: 7px;
        cursor: pointer;
        text-align: left;
      }
      .add:hover {
        background: var(--pi-accent-bg);
        color: var(--pi-accent-text);
      }
      .add .material-symbols-rounded {
        font-size: 16px;
      }
    `,
  ],
})
export class ColumnConfigComponent {
  readonly store = inject(ParticipantStore);
  readonly available = computed(() => this.store.availableColumns());

  label(key: string): string {
    return COLUMN_DEF_MAP[key]?.label ?? key;
  }
}
