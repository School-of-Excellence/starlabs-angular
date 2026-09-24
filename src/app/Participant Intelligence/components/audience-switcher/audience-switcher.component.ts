import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ParticipantStore } from '../../core/participant.store';
import { Audience, AudienceKind } from '../../models/participant.model';

@Component({
  selector: 'app-audience-switcher',
  standalone: true,
  imports: [MatMenuModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="trigger" [matMenuTriggerFor]="menu">
      <span class="material-symbols-rounded lead">groups</span>
      <span class="label">{{ activeName() }}</span>
      <span class="material-symbols-rounded chev">expand_more</span>
    </button>

    <mat-menu #menu="matMenu" class="aud-menu" xPosition="before">
      <div class="menu-head" (click)="$event.stopPropagation()">Audiences</div>
      @for (kind of kinds; track kind.key) {
        @if (byKind(kind.key).length) {
          <div class="group-label" (click)="$event.stopPropagation()">
            <span class="material-symbols-rounded">{{ kind.icon }}</span>{{ kind.label }}
          </div>
          @for (aud of byKind(kind.key); track aud.id) {
            <button mat-menu-item class="aud-item" (click)="store.loadAudience(aud.id)">
              <span class="dot" [class.on]="store.activeAudienceId() === aud.id"></span>
              <span class="aud-name">{{ aud.name }}</span>
              <span class="aud-count">{{ aud.count }}</span>
              @if (aud.isDefault) {
                <span class="material-symbols-rounded star" matTooltip="Default">star</span>
              }
            </button>
          }
        }
      }
      <div class="menu-foot">
        <button mat-menu-item (click)="manage.emit()">
          <span class="material-symbols-rounded">tune</span> Manage audiences
        </button>
      </div>
    </mat-menu>
  `,
  styles: [
    `
      .trigger {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 38px;
        padding: 0 10px 0 12px;
        border: 1px solid var(--pi-border-strong);
        border-radius: var(--pi-radius);
        background: var(--pi-surface);
        font-family: inherit;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--pi-text);
        cursor: pointer;
        max-width: 280px;
      }
      .trigger:hover {
        border-color: var(--pi-accent);
      }
      .lead {
        font-size: 19px;
        color: var(--pi-accent);
      }
      .label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chev {
        font-size: 19px;
        color: var(--pi-text-3);
        margin-left: auto;
      }
      .menu-head {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--pi-text-3);
        padding: 12px 16px 6px;
      }
      .group-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--pi-text-2);
        padding: 8px 16px 4px;
      }
      .group-label .material-symbols-rounded {
        font-size: 15px;
      }
      .aud-item {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .aud-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .aud-count {
        font-size: 12px;
        color: var(--pi-text-3);
        font-variant-numeric: tabular-nums;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: transparent;
        border: 1.5px solid var(--pi-border-strong);
        flex-shrink: 0;
      }
      .dot.on {
        background: var(--pi-accent);
        border-color: var(--pi-accent);
      }
      .star {
        font-size: 16px;
        color: #d8a200;
      }
      .menu-foot {
        border-top: 1px solid var(--pi-border);
        margin-top: 4px;
      }
    `,
  ],
})
export class AudienceSwitcherComponent {
  readonly store = inject(ParticipantStore);

  // Outputs declared the modern way to keep the template simple.
  readonly manage = output();

  readonly kinds: { key: AudienceKind; label: string; icon: string }[] = [
    { key: 'filter', label: 'Saved filters', icon: 'filter_alt' },
    { key: 'list', label: 'Lists', icon: 'format_list_bulleted' },
    { key: 'segment', label: 'Segments', icon: 'donut_small' },
  ];

  readonly activeName = computed(() => {
    const id = this.store.activeAudienceId();
    if (!id) return 'All participants';
    return this.store.audiences().find((a) => a.id === id)?.name ?? 'All participants';
  });

  byKind(kind: AudienceKind): Audience[] {
    return this.store.audiences().filter((a) => a.kind === kind);
  }
}
