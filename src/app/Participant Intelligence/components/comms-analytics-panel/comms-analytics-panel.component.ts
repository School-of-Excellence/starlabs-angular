import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ParticipantStore } from '../../core/participant.store';
import { CommsChannel, CommsChannelStats } from '../../models/participant.model';

@Component({
  selector: 'app-comms-analytics-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="comms" (click)="$event.stopPropagation()">
      <div class="head">
        <span class="material-symbols-rounded">campaign</span>
        <span>Communications analytics</span>
      </div>

      @if (!store.commsAnalytics()) {
        <div class="loading">Loading analytics…</div>
      } @else {
        @for (ch of channels; track ch.key) {
          <div class="channel">
            <div class="ch-head">
              <span class="ch-ic material-symbols-rounded">{{ ch.icon }}</span>
              <span class="ch-name">{{ ch.label }}</span>
              <span class="ch-total">{{ stats(ch.key).total | number }}</span>
            </div>
            <div class="stats">
              <span class="stat sent"><b>{{ stats(ch.key).sent | number }}</b> sent</span>
              <span class="stat queued"><b>{{ stats(ch.key).queued | number }}</b> queued</span>
              <span class="stat failed"><b>{{ stats(ch.key).failed | number }}</b> failed</span>
            </div>
            @if (stats(ch.key).recent.length) {
              <div class="recent">
                @for (c of stats(ch.key).recent; track c.name) {
                  <div class="row">
                    <span class="r-name" [title]="c.name">{{ c.name }}</span>
                    <span class="r-meta">
                      <span class="r-recip">{{ c.recipients | number }}</span>
                      <span class="r-status tone-{{ tone(c.status) }}">{{ c.status }}</span>
                      <span class="r-date">{{ fmtDate(c.date) }}</span>
                    </span>
                  </div>
                }
              </div>
            } @else {
              <div class="empty">No recent campaigns</div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .comms {
        width: 380px;
        max-height: 70vh;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
        color: var(--pi-text);
        padding: 14px 16px 10px;
        border-bottom: 1px solid var(--pi-border);
        position: sticky;
        top: 0;
        background: var(--pi-surface);
      }
      .head .material-symbols-rounded {
        font-size: 19px;
        color: var(--pi-accent);
      }
      .loading,
      .empty {
        padding: 14px 16px;
        font-size: 12.5px;
        color: var(--pi-text-3);
      }
      .channel {
        padding: 12px 16px;
        border-bottom: 1px solid #eef1f4;
      }
      .ch-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .ch-ic {
        font-size: 18px;
        color: var(--pi-text-2);
      }
      .ch-name {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--pi-text);
      }
      .ch-total {
        margin-left: auto;
        font-size: 13.5px;
        font-weight: 700;
        color: var(--pi-text);
        font-variant-numeric: tabular-nums;
      }
      .stats {
        display: flex;
        gap: 14px;
        margin-bottom: 10px;
      }
      .stat {
        font-size: 12px;
        color: var(--pi-text-2);
      }
      .stat b {
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .stat.sent b {
        color: var(--pi-status-active);
      }
      .stat.queued b {
        color: var(--pi-status-late);
      }
      .stat.failed b {
        color: var(--pi-status-banned);
      }
      .recent {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 0;
      }
      .r-name {
        flex: 1;
        font-size: 12.5px;
        color: var(--pi-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .r-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .r-recip {
        font-size: 11.5px;
        color: var(--pi-text-3);
        font-variant-numeric: tabular-nums;
      }
      .r-status {
        font-size: 10.5px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        text-transform: capitalize;
      }
      .r-date {
        font-size: 11px;
        color: var(--pi-text-3);
        width: 52px;
        text-align: right;
      }
      .tone-active {
        color: var(--pi-status-active);
        background: var(--pi-status-active-bg);
      }
      .tone-late {
        color: var(--pi-status-late);
        background: var(--pi-status-late-bg);
      }
      .tone-banned {
        color: var(--pi-status-banned);
        background: var(--pi-status-banned-bg);
      }
      .tone-none {
        color: var(--pi-status-none);
        background: var(--pi-status-none-bg);
      }
    `,
  ],
})
export class CommsAnalyticsPanelComponent {
  readonly store = inject(ParticipantStore);

  readonly channels: { key: CommsChannel; label: string; icon: string }[] = [
    { key: 'email', label: 'Email', icon: 'mail' },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
    { key: 'notification', label: 'Notifications', icon: 'notifications' },
  ];

  stats(key: CommsChannel): CommsChannelStats {
    const a = this.store.commsAnalytics();
    return a ? a[key] : { total: 0, queued: 0, sent: 0, failed: 0, recent: [] };
  }

  tone(status: string): string {
    const s = status.toLowerCase();
    if (['sent', 'created', 'validated', 'delivered', 'completed', 'success', 'approved'].includes(s)) return 'active';
    if (s === 'queued' || s === 'scheduled' || s === 'pending') return 'late';
    if (s === 'failed' || s === 'rejected' || s === 'error') return 'banned';
    return 'none';
  }

  fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
}
