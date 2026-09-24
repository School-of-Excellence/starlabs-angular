import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ParticipantStore } from '../core/participant.store';
import { ChecklistDef } from '../core/checklists';
import { Participant } from '../models/participant.model';

@Component({
  selector: 'app-checklist-viewer-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg wide">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">checklist</span></span>
        <div>
          <h2>{{ data.def.label }}</h2>
          <p>{{ data.def.description }}</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        @if (!data.def.wired) {
          <div class="notwired">
            <span class="material-symbols-rounded">cloud_off</span>
            <p>{{ data.def.note }}</p>
          </div>
        } @else if (data.participants.length === 0) {
          <div class="notwired">
            <span class="material-symbols-rounded">task_alt</span>
            <p>Nothing to reconcile — no participants match this checklist.</p>
          </div>
        } @else {
          <div class="cnt">{{ data.participants.length }} participant{{ data.participants.length === 1 ? '' : 's' }} to review</div>
          <table class="cl">
            <thead><tr><th>Participant</th><th>Status</th><th>Journey</th><th>Products</th></tr></thead>
            <tbody>
              @for (p of data.participants.slice(0, 250); track p.profileid) {
                <tr>
                  <td><div class="nm">{{ p.name }}</div><div class="em">{{ p.email }}</div></td>
                  <td>{{ p.customerstatus === 'none' ? '—' : p.customerstatus }}</td>
                  <td>{{ p.activejourney ? journeyMap()[p.activejourney] : '—' }}</td>
                  <td>{{ p.activeproduct.length }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (data.participants.length > 250) {
            <p class="more">Showing first 250 of {{ data.participants.length }}.</p>
          }
        }
      </div>

      <div class="dlg-foot">
        <button class="btn btn-primary" (click)="ref.close()">Done</button>
      </div>
    </div>
  `,
  styles: [
    `
      .cnt { font-size: 13px; color: var(--pi-text-2); margin-bottom: 10px; }
      .cl { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--pi-text-3); padding: 0 12px 8px; border-bottom: 1px solid var(--pi-border); }
      td { padding: 9px 12px; border-bottom: 0.5px solid var(--pi-border); vertical-align: middle; }
      .nm { font-weight: 600; }
      .em { font-size: 11px; color: var(--pi-text-3); }
      .more { text-align: center; color: var(--pi-text-3); font-size: 12.5px; margin-top: 12px; }
      .notwired { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 40px 20px; color: var(--pi-text-2); }
      .notwired .material-symbols-rounded { font-size: 40px; color: var(--pi-text-3); }
      .notwired p { margin: 0; font-size: 13.5px; max-width: 36ch; }
    `,
  ],
})
export class ChecklistViewerDialogComponent {
  readonly ref = inject(MatDialogRef<ChecklistViewerDialogComponent>);
  readonly data = inject<{ def: ChecklistDef; participants: Participant[] }>(MAT_DIALOG_DATA);
  private readonly store = inject(ParticipantStore);

  readonly journeyMap = computed<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const j of this.store.reference().journeys) m[j.id] = j.name;
    return m;
  });
}
