import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { ParticipantStore } from '../../core/participant.store';

export type BulkAction =
  | 'email'
  | 'whatsapp'
  | 'notify'
  | 'tag'
  | 'addToList'
  | 'subscription'
  | 'remarks'
  | 'products'
  | 'playlist'
  | 'export'
  | 'checklist'
  | 'evolution'
  | 'broadcast'
  | 'interim'
  | 'wishlist';

@Component({
  selector: 'app-bulk-action-bar',
  standalone: true,
  imports: [MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.selectedCount() > 0) {
      <div class="bar">
        <div class="count">
          <span class="num">{{ store.selectedCount() }}</span>
          <span>selected</span>
          @if (store.hiddenSelectedCount() > 0) {
            <span class="hidden">{{ store.hiddenSelectedCount() }} hidden by filters</span>
          }
          <button class="link" (click)="store.clearSelection()">Clear</button>
        </div>

        <div class="actions">
          <button class="act" [matMenuTriggerFor]="comm">
            <span class="material-symbols-rounded">campaign</span> Communicate
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button class="act" [matMenuTriggerFor]="org">
            <span class="material-symbols-rounded">label</span> Organize
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button class="act" [matMenuTriggerFor]="upd">
            <span class="material-symbols-rounded">edit_note</span> Update
            <span class="material-symbols-rounded chev">expand_more</span>
          </button>
          <button class="act primary" (click)="action.emit('evolution')">
            <span class="material-symbols-rounded">insights</span> Evolution
          </button>
          <button class="act" [matMenuTriggerFor]="more" aria-label="More actions">
            <span class="material-symbols-rounded">more_horiz</span>
          </button>
        </div>
      </div>

      <mat-menu #more="matMenu">
        <button mat-menu-item (click)="action.emit('broadcast')">
          <span class="material-symbols-rounded mi">podcasts</span> Broadcast in Breakthroughs
        </button>
        <button mat-menu-item (click)="action.emit('interim')">
          <span class="material-symbols-rounded mi">description</span> Manage interim report
        </button>
        <button mat-menu-item (click)="action.emit('wishlist')">
          <span class="material-symbols-rounded mi">favorite</span> Evolution wishlist
        </button>
      </mat-menu>

      <mat-menu #comm="matMenu">
        <button mat-menu-item (click)="action.emit('email')">
          <span class="material-symbols-rounded mi">mail</span> Send email
        </button>
        <button mat-menu-item (click)="action.emit('whatsapp')">
          <span class="material-symbols-rounded mi">chat</span> Send WhatsApp
        </button>
        <button mat-menu-item (click)="action.emit('notify')">
          <span class="material-symbols-rounded mi">notifications</span> In-app notification
        </button>
      </mat-menu>

      <mat-menu #org="matMenu">
        <button mat-menu-item (click)="action.emit('tag')">
          <span class="material-symbols-rounded mi">sell</span> Manage tags
        </button>
        <button mat-menu-item (click)="action.emit('addToList')">
          <span class="material-symbols-rounded mi">playlist_add</span> Save as list
        </button>
        <button mat-menu-item (click)="action.emit('playlist')">
          <span class="material-symbols-rounded mi">queue_music</span> Recommend playlist
        </button>
      </mat-menu>

      <mat-menu #upd="matMenu">
        <button mat-menu-item (click)="action.emit('remarks')">
          <span class="material-symbols-rounded mi">sticky_note_2</span> Add remark
        </button>
        <button mat-menu-item (click)="action.emit('subscription')">
          <span class="material-symbols-rounded mi">event_repeat</span> Extend subscription
        </button>
        <button mat-menu-item (click)="action.emit('products')">
          <span class="material-symbols-rounded mi">inventory_2</span> Add products
        </button>
      </mat-menu>
    }
  `,
  styles: [
    `
      .bar {
        position: absolute;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 9px 12px 9px 18px;
        background: #16222e;
        color: #fff;
        border-radius: 14px;
        box-shadow: var(--pi-shadow-lg);
        z-index: 40;
        animation: rise 0.18s ease;
      }
      @keyframes rise {
        from {
          opacity: 0;
          transform: translate(-50%, 8px);
        }
        to {
          opacity: 1;
          transform: translate(-50%, 0);
        }
      }
      .count {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 13.5px;
        color: #c4ced8;
        white-space: nowrap;
      }
      .hidden {
        font-size: 11.5px;
        color: #f0b34a;
        background: rgba(240, 149, 0, 0.16);
        padding: 2px 8px;
        border-radius: 999px;
      }
      .num {
        background: var(--pi-accent-2);
        color: #fff;
        font-weight: 700;
        font-size: 13px;
        padding: 2px 9px;
        border-radius: 999px;
      }
      .link {
        border: none;
        background: none;
        color: #8fb6c0;
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        padding: 0 2px;
      }
      .link:hover {
        color: #fff;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 6px;
        border-left: 1px solid #2c3a48;
        padding-left: 14px;
      }
      .act {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        padding: 0 12px;
        border: none;
        border-radius: 9px;
        background: transparent;
        color: #e6edf3;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.1s ease;
        white-space: nowrap;
      }
      .act:hover {
        background: #243341;
      }
      .act .material-symbols-rounded {
        font-size: 18px;
      }
      .act .chev {
        font-size: 16px;
        opacity: 0.6;
        margin-left: -2px;
      }
      .act.primary {
        background: var(--pi-accent-2);
      }
      .act.primary:hover {
        background: #0fa0a4;
      }
      .mi {
        margin-right: 8px;
        font-size: 19px;
        vertical-align: middle;
        color: var(--pi-text-2);
      }
    `,
  ],
})
export class BulkActionBarComponent {
  readonly store = inject(ParticipantStore);
  readonly action = output<BulkAction>();
}
