import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ParticipantStore } from '../core/participant.store';

@Component({
  selector: 'app-tag-manager-dialog',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dlg">
      <div class="dlg-head">
        <span class="ic"><span class="material-symbols-rounded">sell</span></span>
        <div>
          <h2>Manage tags</h2>
          <p>{{ data.count }} participant{{ data.count === 1 ? '' : 's' }} selected.</p>
        </div>
        <button class="x" (click)="ref.close()"><span class="material-symbols-rounded">close</span></button>
      </div>

      <div class="dlg-body">
        <label class="dlg-label">Select tags</label>
        <div class="tagwrap">
          @for (t of store.reference().tags; track t.id) {
            <button class="tagchip" [class.on]="picked().has(t.id)" (click)="toggle(t.id)">
              {{ t.name }}
              @if (picked().has(t.id)) {
                <span class="material-symbols-rounded">check</span>
              }
            </button>
          }
        </div>

        <div class="create">
          <label class="dlg-label">Create a new tag</label>
          <div class="create-row">
            <input class="dlg-input" [(ngModel)]="newTag" placeholder="Tag name" (keyup.enter)="create()" />
            <button class="btn btn-ghost" [disabled]="newTag.trim().length < 2" (click)="create()">
              <span class="material-symbols-rounded">add</span> Create
            </button>
          </div>
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn btn-danger spacer" [disabled]="picked().size === 0" (click)="apply('remove')">
          <span class="material-symbols-rounded">label_off</span> Remove from {{ data.count }}
        </button>
        <button class="btn btn-ghost" (click)="ref.close()">Cancel</button>
        <button class="btn btn-primary" [disabled]="picked().size === 0" (click)="apply('add')">
          <span class="material-symbols-rounded">check</span> Assign to {{ data.count }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .tagwrap {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 22px;
      }
      .tagchip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: 1px solid var(--pi-border-strong);
        background: #fff;
        color: var(--pi-text);
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        padding: 7px 12px;
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.1s ease;
      }
      .tagchip:hover {
        border-color: var(--pi-accent);
      }
      .tagchip.on {
        background: var(--pi-accent);
        border-color: var(--pi-accent);
        color: #fff;
      }
      .tagchip .material-symbols-rounded {
        font-size: 16px;
      }
      .create {
        border-top: 1px solid var(--pi-border);
        padding-top: 16px;
      }
      .create-row {
        display: flex;
        gap: 10px;
      }
      .create-row .dlg-input {
        flex: 1;
      }
      .create-row .btn {
        flex-shrink: 0;
      }
    `,
  ],
})
export class TagManagerDialogComponent {
  readonly ref = inject(MatDialogRef<TagManagerDialogComponent>);
  readonly data = inject<{ count: number }>(MAT_DIALOG_DATA);
  readonly store = inject(ParticipantStore);
  private readonly snack = inject(MatSnackBar);

  readonly picked = signal<Set<string>>(new Set());
  newTag = '';

  toggle(id: string): void {
    this.picked.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  create(): void {
    const name = this.newTag.trim();
    if (name.length < 2) return;
    const tag = this.store.createTag(name, ['journey coach']);
    this.toggle(tag.id);
    this.newTag = '';
  }

  apply(mode: 'add' | 'remove'): void {
    const ids = [...this.picked()];
    if (mode === 'add') this.store.addTagsToSelected(ids);
    else this.store.removeTagsFromSelected(ids);
    this.snack.open(`${mode === 'add' ? 'Assigned' : 'Removed'} ${ids.length} tag(s) on ${this.data.count} participants`, 'Dismiss', { duration: 3000 });
    this.ref.close(true);
  }
}
