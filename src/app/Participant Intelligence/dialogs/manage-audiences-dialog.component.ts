import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantStore } from '../core/participant.store';
import { AudienceKind } from '../models/participant.model';

@Component({
  selector: 'app-manage-audiences-dialog',
  standalone: true,
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg wide">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">tune</span></span>
        <div>
          <h2>Manage audiences</h2>
          <p>Saved filters, lists and segments in one place.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <table class="aud-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th class="num">Members</th>
              <th>Created by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (a of store.audiences(); track a.id) {
              <tr>
                <td>
                  <button class="link" (click)="load(a.id)">{{ a.name }}</button>
                  @if (a.live) {
                    <span class="pi-badge live">Live</span>
                  }
                </td>
                <td><span class="kind">{{ kindLabel(a.kind) }}</span></td>
                <td class="num">{{ a.count }}</td>
                <td class="by">{{ a.createdBy }}</td>
                <td class="row-actions">
                  <button class="ic" [class.on]="a.isDefault" matTooltip="Set as default" (click)="store.setDefaultAudience(a.id)">
                    <span class="material-symbols-rounded">star</span>
                  </button>
                  @if (a.kind === 'list') {
                    <button class="ic" [class.on]="a.live" matTooltip="Toggle live" (click)="store.toggleListLive(a.id)">
                      <span class="material-symbols-rounded">{{ a.live ? 'toggle_on' : 'toggle_off' }}</span>
                    </button>
                  }
                  <button class="ic del" matTooltip="Delete" (click)="store.deleteAudience(a.id)">
                    <span class="material-symbols-rounded">delete</span>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (store.audiences().length === 0) {
          <div class="empty">No audiences yet. Build a filter and save it as an audience.</div>
        }
      </div>

      <div class="dlg-foot">
        <button class="btn btn-primary" (click)="ref.close()">Done</button>
      </div>
    </div>
  `,
  styles: [
    `
      .aud-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13.5px;
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
      }
      th.num {
        text-align: right;
      }
      td {
        padding: 11px 12px;
        border-bottom: 1px solid #eef1f4;
        vertical-align: middle;
      }
      td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      td.by {
        color: var(--pi-text-2);
      }
      .link {
        border: none;
        background: none;
        font-family: inherit;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--pi-text);
        cursor: pointer;
        padding: 0;
      }
      .link:hover {
        color: var(--pi-accent);
      }
      .pi-badge.live {
        background: var(--pi-status-active-bg);
        color: var(--pi-status-active);
        margin-left: 8px;
      }
      .kind {
        font-size: 12px;
        color: var(--pi-text-2);
        background: var(--pi-surface-3);
        padding: 3px 9px;
        border-radius: 6px;
      }
      .row-actions {
        display: flex;
        justify-content: flex-end;
        gap: 2px;
      }
      .ic {
        border: none;
        background: none;
        color: var(--pi-text-3);
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        display: inline-flex;
      }
      .ic:hover {
        background: var(--pi-surface-3);
        color: var(--pi-text);
      }
      .ic.on {
        color: #d8a200;
      }
      .ic.del:hover {
        color: var(--pi-status-banned);
      }
      .ic .material-symbols-rounded {
        font-size: 19px;
      }
      .empty {
        text-align: center;
        color: var(--pi-text-3);
        padding: 30px;
        font-size: 13.5px;
      }
    `,
  ],
})
export class ManageAudiencesDialogComponent {
  readonly ref = inject(MatDialogRef<ManageAudiencesDialogComponent>);
  readonly store = inject(ParticipantStore);

  kindLabel(k: AudienceKind): string {
    return k === 'filter' ? 'Saved filter' : k === 'list' ? 'List' : 'Segment';
  }
  load(id: string): void {
    this.store.loadAudience(id);
    this.ref.close();
  }
}
