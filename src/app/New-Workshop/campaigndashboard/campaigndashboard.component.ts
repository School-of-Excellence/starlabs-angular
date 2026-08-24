import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { NewCampaignDialogComponent } from './new-campaign-dialog/new-campaign-dialog.component';

export interface CampaignAsset {
  type: string;
  name: string;
  url: string;
}

/** Raw `eiflixcampaign` document (field names as stored in Firestore). */
export interface Campaign {
  id: string;
  campaignname: string;
  startdate: any;            // Firestore Timestamp
  enddate: any;              // Firestore Timestamp
  segment: string;           // newusertags doc id
  expectedsalevalue: number;
  achievedsalesvalue: number;
  numberofsales: number;
  channels: string[];
  manualnotes: string[];
  campaignassets: CampaignAsset[];
}

type CampaignStatus = 'live' | 'sched' | 'ended';

interface AssetView extends CampaignAsset {
  icon: string;
}

interface CampaignCard {
  id: string;
  name: string;
  dateRange: string;
  segmentName: string;
  expected: string;
  achieved: string;
  achievedColor: string;
  sales: number;
  pct: number;
  barColor: string;
  status: CampaignStatus;
  statusLabel: string;
  notes: string;
  assets: AssetView[];
  raw: Campaign;
}

const ASSET_ICONS: Record<string, string> = {
  'Email': '✉', 'WhatsApp': '💬', 'Whatsapp': '💬',
  'Google Doc': '📄', 'Google Sheet': '📊', 'Google sheet': '📊',
  'Landing Page': '🌐', 'Ad Creative': '🎨',
  'Script': '📝', 'Video': '🎬', 'Other': '📎'
};

const STATUS_ORDER: Record<CampaignStatus, number> = { live: 0, sched: 1, ended: 2 };

/** A pasted URL without a scheme ("www.x.com/y") would otherwise resolve relative to the app origin. */
export function normalizeUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) return trimmed;
  return 'https://' + trimmed;
}

@Component({
  selector: 'app-campaigndashboard',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './campaigndashboard.component.html',
  styleUrl: './campaigndashboard.component.css'
})
export class CampaigndashboardComponent implements OnInit, OnDestroy {

  cards: CampaignCard[] = [];
  loading = true;
  /** Progress bars render at 0 first, then animate to their value. */
  barsReady = false;

  private campaigns: Campaign[] = [];
  private tagNames = new Map<string, string>();
  private subs: Subscription[] = [];

  constructor(private firestore: Firestore, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.subs.push(
      collectionData(collection(this.firestore, 'newusertags'), { idField: 'id' })
        .subscribe({
          next: rows => {
            this.tagNames = new Map(
              (rows as any[]).map(r => [r.id as string, (r.name || '').toString()])
            );
            this.rebuildCards();
          },
          error: err => console.error('Error loading segments:', err)
        })
    );

    this.subs.push(
      collectionData(collection(this.firestore, 'eiflixcampaign'), { idField: 'id' })
        .subscribe({
          next: rows => {
            this.campaigns = rows as Campaign[];
            this.loading = false;
            this.rebuildCards();
          },
          error: err => {
            console.error('Error loading campaigns:', err);
            this.loading = false;
          }
        })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  openNewCampaignDialog(): void {
    this.openDialog();
  }

  openEditDialog(campaign: Campaign): void {
    this.openDialog(campaign);
  }

  private openDialog(campaign?: Campaign): void {
    this.dialog.open(NewCampaignDialogComponent, {
      width: '950px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      data: campaign ? { campaign } : null
    });
  }

  private rebuildCards(): void {
    const cards = this.campaigns.map(c => this.toCard(c));
    cards.sort((a, b) => {
      const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (order !== 0) return order;
      const aStart = this.toDate(a.raw.startdate)?.getTime() ?? 0;
      const bStart = this.toDate(b.raw.startdate)?.getTime() ?? 0;
      return a.status === 'ended' ? bStart - aStart : aStart - bStart;
    });
    this.cards = cards;

    if (!this.barsReady && cards.length) {
      setTimeout(() => { this.barsReady = true; }, 150);
    }
  }

  private toCard(c: Campaign): CampaignCard {
    const start = this.toDate(c.startdate);
    const end = this.toDate(c.enddate);
    const expected = Number(c.expectedsalevalue) || 0;
    const achieved = Number(c.achievedsalesvalue) || 0;
    const pct = expected > 0 ? Math.max(0, Math.min(100, Math.round((achieved / expected) * 100))) : 0;
    const status = this.statusOf(start, end);

    return {
      id: c.id,
      name: c.campaignname || '(untitled)',
      dateRange: `${this.fmtDate(start)} — ${this.fmtDate(end)}`,
      segmentName: this.tagNames.get(c.segment) || '',
      expected: this.fmtInr(expected),
      achieved: this.fmtInr(achieved),
      achievedColor: pct >= 80 ? 'var(--grn-tx)' : pct >= 50 ? 'var(--ora-tx)' : 'var(--red-tx)',
      sales: Number(c.numberofsales) || 0,
      pct,
      barColor: pct >= 80 ? 'var(--grn)' : pct >= 50 ? 'var(--ora)' : 'var(--mag)',
      status,
      statusLabel: status === 'live' ? '🔴 Live' : status === 'sched' ? '⏰ Scheduled' : '✔ Ended',
      notes: (c.manualnotes || []).join(' · '),
      assets: (c.campaignassets || []).map(a => ({
        ...a,
        url: normalizeUrl(a.url),
        icon: ASSET_ICONS[a.type] || '📎'
      })),
      raw: c
    };
  }

  private statusOf(start: Date | null, end: Date | null): CampaignStatus {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start && this.dayStart(start) > today) return 'sched';
    if (end && this.dayStart(end) < today) return 'ended';
    return 'live';
  }

  private dayStart(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    return null;
  }

  private fmtDate(d: Date | null): string {
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private fmtInr(value: number): string {
    return new Intl.NumberFormat('en-IN').format(value);
  }
}
