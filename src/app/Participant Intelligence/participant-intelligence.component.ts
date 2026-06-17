import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as XLSX from 'xlsx';

import { ParticipantStore } from './core/participant.store';
import { ParticipantDataService } from './data/participant-data.service';
import { FirestoreParticipantDataService } from './data/firestore-participant-data.service';
import { COLUMN_DEF_MAP } from './data/column-catalog';
import { Participant } from './models/participant.model';

import { FilterRailComponent } from './components/filter-rail/filter-rail.component';
import { ActiveFilterChipsComponent } from './components/active-filter-chips/active-filter-chips.component';
import { AudienceSwitcherComponent } from './components/audience-switcher/audience-switcher.component';
import { ParticipantTableComponent } from './components/participant-table/participant-table.component';
import { BulkActionBarComponent, BulkAction } from './components/bulk-action-bar/bulk-action-bar.component';
import { ColumnConfigComponent } from './components/column-config/column-config.component';
import { SignalsPanelComponent } from './components/signals-panel/signals-panel.component';

import { PromptDialogComponent } from './dialogs/prompt-dialog.component';
import { RemarksDialogComponent } from './dialogs/remarks-dialog.component';
import { TagManagerDialogComponent } from './dialogs/tag-manager-dialog.component';
import { SubscriptionDialogComponent, SubscriptionResult } from './dialogs/subscription-dialog.component';
import { EmailComposerDialogComponent, ComposerResult } from './dialogs/email-composer-dialog.component';
import { WhatsappComposerDialogComponent } from './dialogs/whatsapp-composer-dialog.component';
import { ManageAudiencesDialogComponent } from './dialogs/manage-audiences-dialog.component';
import { QuickComposeDialogComponent, QuickComposeData } from './dialogs/quick-compose-dialog.component';
import { EvolutionDialogComponent } from './dialogs/evolution-dialog.component';

@Component({
  selector: 'app-participant-intelligence',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatMenuModule,
    MatTooltipModule,
    FilterRailComponent,
    ActiveFilterChipsComponent,
    AudienceSwitcherComponent,
    ParticipantTableComponent,
    BulkActionBarComponent,
    ColumnConfigComponent,
    SignalsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participant-intelligence.component.html',
  styleUrl: './participant-intelligence.component.css',
  providers: [ParticipantStore, { provide: ParticipantDataService, useClass: FirestoreParticipantDataService }],
})
export class ParticipantIntelligenceComponent implements OnInit {
  readonly store = inject(ParticipantStore);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly injector = inject(Injector);

  // dialogs that inject ParticipantStore must resolve THIS screen's store instance
  private dlg(width: string): MatDialogConfig {
    return { panelClass: 'pi-dialog', width, injector: this.injector };
  }

  readonly railOpen = signal(true);
  readonly insightsOpen = signal(true);
  readonly pendingEmails = signal(2);
  readonly pendingWati = signal(0);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  ngOnInit(): void {
    this.store.init();
  }

  get search(): string {
    return this.store.filter().search;
  }
  set search(v: string) {
    this.store.setSearch(v);
  }

  toggleRail(): void {
    this.railOpen.update((v) => !v);
  }

  toggleInsights(): void {
    this.insightsOpen.update((v) => !v);
  }

  refresh(): void {
    this.store.init();
    this.snack.open('Refreshed', '', { duration: 1500 });
  }

  snackQueued(channel: 'email' | 'whatsapp'): void {
    const n = channel === 'email' ? this.pendingEmails() : this.pendingWati();
    const label = channel === 'email' ? 'email' : 'WhatsApp';
    this.snack.open(n ? `${n} ${label} broadcast(s) queued` : `No ${label} broadcasts queued`, 'Dismiss', { duration: 2500 });
  }

  saveAudience(): void {
    this.dialog
      .open(PromptDialogComponent, {
        panelClass: 'pi-dialog',
        width: '440px',
        data: {
          title: 'Save as audience',
          subtitle: `${this.store.filteredCount()} participants match the current filter.`,
          label: 'Audience name',
          placeholder: 'e.g. Active gold-tier renewals',
          confirmText: 'Save audience',
          icon: 'bookmark_add',
        },
      })
      .afterClosed()
      .subscribe((name?: string) => {
        if (name) {
          this.store.saveCurrentAsAudience(name);
          this.snack.open(`Saved audience "${name}"`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  openManageAudiences(): void {
    this.dialog.open(ManageAudiencesDialogComponent, this.dlg('720px'));
  }

  // ---- bulk actions ----
  handleBulk(action: BulkAction): void {
    const count = this.store.selectedCount();
    if (count === 0) return;
    switch (action) {
      case 'email':
        return this.composeEmail();
      case 'whatsapp':
        return this.composeWhatsapp();
      case 'notify':
        return this.notify();
      case 'tag':
        this.dialog.open(TagManagerDialogComponent, { ...this.dlg('520px'), data: { count } });
        return;
      case 'addToList':
        return this.saveAsList();
      case 'subscription':
        return this.extendSubscription();
      case 'remarks':
        return this.addRemark();
      case 'products':
        return this.addProducts();
      case 'playlist':
        return this.recommendPlaylist();
      case 'evolution':
        this.dialog.open(EvolutionDialogComponent, {
          ...this.dlg('760px'),
          data: { participants: this.store.selectedParticipants() },
        });
        return;
      case 'export':
        return this.export(true);
      default:
        return;
    }
  }

  private composeEmail(): void {
    this.dialog
      .open(EmailComposerDialogComponent, { panelClass: 'pi-dialog', width: '640px', data: { count: this.store.selectedCount() } })
      .afterClosed()
      .subscribe((r?: ComposerResult) => {
        if (!r) return;
        if (r.action === 'queue') {
          this.pendingEmails.update((n) => n + 1);
          this.snack.open(`Queued email to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
        } else {
          this.snack.open(`Email sent to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  private composeWhatsapp(): void {
    this.dialog
      .open(WhatsappComposerDialogComponent, { panelClass: 'pi-dialog', width: '640px', data: { count: this.store.selectedCount() } })
      .afterClosed()
      .subscribe((r?: ComposerResult) => {
        if (!r) return;
        if (r.action === 'queue') {
          this.pendingWati.update((n) => n + 1);
          this.snack.open(`Queued WhatsApp to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
        } else {
          this.snack.open(`WhatsApp sent to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  private notify(): void {
    const data: QuickComposeData = {
      icon: 'notifications',
      title: 'In-app notification',
      subtitle: `${this.store.selectedCount()} registered participants will receive this.`,
      fields: [
        { key: 'title', label: 'Title', type: 'text', placeholder: 'Notification title' },
        { key: 'body', label: 'Message', type: 'textarea', placeholder: 'What do you want them to know?' },
      ],
      confirmText: 'Send notification',
      confirmIcon: 'send',
      note: 'UI prototype on mock data — nothing is actually delivered.',
    };
    this.dialog
      .open(QuickComposeDialogComponent, { panelClass: 'pi-dialog', width: '480px', data })
      .afterClosed()
      .subscribe((r) => {
        if (r) this.snack.open(`Notification sent to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
      });
  }

  private saveAsList(): void {
    this.dialog
      .open(PromptDialogComponent, {
        panelClass: 'pi-dialog',
        width: '440px',
        data: {
          title: 'Save as list',
          subtitle: `${this.store.selectedCount()} participants will be saved as a static list.`,
          label: 'List name',
          placeholder: 'e.g. March outreach',
          confirmText: 'Create list',
          icon: 'playlist_add',
        },
      })
      .afterClosed()
      .subscribe((name?: string) => {
        if (name) {
          this.store.saveSelectionAsList(name);
          this.snack.open(`Created list "${name}" with ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  private extendSubscription(): void {
    this.dialog
      .open(SubscriptionDialogComponent, { panelClass: 'pi-dialog', width: '460px', data: { count: this.store.selectedCount() } })
      .afterClosed()
      .subscribe((r?: SubscriptionResult) => {
        if (!r) return;
        const n = this.store.selectedCount();
        this.store.extendSubscriptionForSelected(r.newEndIso);
        this.snack.open(`Extended subscription for ${n} participants`, 'Dismiss', { duration: 3000 });
      });
  }

  private addRemark(): void {
    this.dialog
      .open(RemarksDialogComponent, { panelClass: 'pi-dialog', width: '480px', data: { count: this.store.selectedCount() } })
      .afterClosed()
      .subscribe((note?: string) => {
        if (note) {
          const n = this.store.selectedCount();
          this.store.addRemarkToSelected(note);
          this.snack.open(`Added remark to ${n} participants`, 'Dismiss', { duration: 3000 });
        }
      });
  }

  private addProducts(): void {
    const data: QuickComposeData = {
      icon: 'inventory_2',
      title: 'Add products',
      subtitle: `Add products to ${this.store.selectedCount()} participants.`,
      fields: [
        {
          key: 'products',
          label: 'Products',
          type: 'multiselect',
          options: this.store.reference().products.map((p) => ({ value: p.id, label: p.name })),
        },
      ],
      confirmText: 'Add products',
      confirmIcon: 'check',
    };
    this.dialog
      .open(QuickComposeDialogComponent, { panelClass: 'pi-dialog', width: '480px', data })
      .afterClosed()
      .subscribe((r) => {
        if (r) this.snack.open(`Added products to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
      });
  }

  private recommendPlaylist(): void {
    const data: QuickComposeData = {
      icon: 'queue_music',
      title: 'Recommend playlist',
      subtitle: `Curate content for ${this.store.selectedCount()} participants.`,
      fields: [
        { key: 'title', label: 'Playlist title', type: 'text', placeholder: 'e.g. Momentum reset' },
        {
          key: 'content',
          label: 'Content',
          type: 'multiselect',
          options: [
            { value: 'eiflix', label: 'EIFLIX series' },
            { value: 'solar', label: 'SolarVoice' },
            { value: 'general', label: 'General content' },
          ],
        },
      ],
      confirmText: 'Recommend',
      confirmIcon: 'check',
    };
    this.dialog
      .open(QuickComposeDialogComponent, { panelClass: 'pi-dialog', width: '480px', data })
      .afterClosed()
      .subscribe((r) => {
        if (r) this.snack.open(`Recommended playlist to ${this.store.selectedCount()} participants`, 'Dismiss', { duration: 3000 });
      });
  }

  // ---- export / import ----
  export(selectedOnly: boolean): void {
    const source = selectedOnly ? this.store.selectedParticipants() : this.store.filtered();
    if (!source.length) {
      this.snack.open('Nothing to export', '', { duration: 2000 });
      return;
    }
    const rows = source.map((p) => this.exportRow(p));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participants');
    XLSX.writeFile(wb, `participants_${new Date().toISOString().slice(0, 10)}.xlsx`);
    this.snack.open(`Exported ${rows.length} participants`, 'Dismiss', { duration: 2500 });
  }

  private exportRow(p: Participant): Record<string, string | number> {
    const jm = this.nameMap(this.store.reference().journeys);
    const pm = this.nameMap(this.store.reference().products);
    const tm = this.nameMap(this.store.reference().tiers);
    const tagm = this.nameMap(this.store.reference().tags);
    return {
      Name: p.name,
      Email: p.email,
      Phone: `${p.countrycode} ${p.phonenumber}`,
      'Customer status': p.customerstatus,
      'Financial status': p.financialstatus,
      Registered: p.registered ? 'Yes' : 'No',
      'Active journey': p.activejourney ? jm[p.activejourney] : '',
      'Active products': p.activeproduct.map((id) => pm[id] ?? id).join('; '),
      Tier: p.tier.map((id) => tm[id] ?? id).join('; '),
      Tags: p.profiletags.map((id) => tagm[id] ?? id).join('; '),
      'ATC count': p.atccount,
      'Subscription end': p.subscriptionend ? p.subscriptionend.slice(0, 10) : '',
      'EMI status': p.emiStatus,
    };
  }

  private nameMap(arr: { id: string; name: string }[]): Record<string, string> {
    const m: Record<string, string> = {};
    for (const a of arr) m[a.id] = a.name;
    return m;
  }

  triggerImport(): void {
    this.fileInput()?.nativeElement.click();
  }

  downloadSample(): void {
    const ws = XLSX.utils.json_to_sheet([{ email: this.store.all()[0]?.email ?? 'name@example.com' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    XLSX.writeFile(wb, 'participant_import_sample.xlsx');
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        const emails = new Set(
          json.map((r) => String(r['email'] ?? r['Email'] ?? '').trim().toLowerCase()).filter(Boolean)
        );
        const matched = this.store.all().filter((p) => emails.has(p.email.toLowerCase()));
        this.store.selectIds(matched.map((p) => p.profileid));
        this.snack.open(`Matched and selected ${matched.length} of ${emails.size} emails`, 'Dismiss', { duration: 3500 });
      } catch {
        this.snack.open('Could not read that file', 'Dismiss', { duration: 3000 });
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  protected readonly columnMap = COLUMN_DEF_MAP;
}
