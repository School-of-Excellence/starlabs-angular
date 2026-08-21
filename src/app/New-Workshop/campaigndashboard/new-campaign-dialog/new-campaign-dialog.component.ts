import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Firestore, collection, collectionData, doc, setDoc, serverTimestamp, Timestamp
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

interface Tag {
  id: string;
  name: string;
}

interface CampaignAsset {
  type: string;
  name: string;
  url: string;
}

@Component({
  selector: 'app-new-campaign-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatChipsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './new-campaign-dialog.component.html',
  styleUrl: './new-campaign-dialog.component.css'
})
export class NewCampaignDialogComponent implements OnInit {
  campaignName = '';
  startDate: Date | null = null;
  endDate: Date | null = null;
  segment = '';

  expectedSaleValue: number | null = null;
  achievedSalesValue = 0;
  numberOfSales = 0;

  readonly channelOptions = ['Email', 'WhatsApp', 'SMS', 'Ads', 'Webinar'];
  channelSelected = new Set<string>();

  noteDraft = '';
  manualNotes: string[] = [];

  readonly assetTypes = [
    'Email', 'Whatsapp', 'Google Doc', 'Google sheet', 'Landing Page',
    'Ad Creative', 'Script', 'Video', 'Other'
  ];
  assetType = '';
  assetName = '';
  assetUrl = '';
  campaignAssets: CampaignAsset[] = [];

  tags: Tag[] = [];
  loadingTags = true;
  isSaving = false;

  constructor(
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<NewCampaignDialogComponent>
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const ref = collection(this.firestore, 'newusertags');
      const rows = (await firstValueFrom(collectionData(ref, { idField: 'id' }))) as any[];
      this.tags = rows
        .map(r => ({ id: r.id, name: (r.name || '').toString() }))
        .filter(t => t.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error('Error loading segments:', err);
      this.snackBar.open('Error loading segments.', 'Close', { duration: 3000 });
    } finally {
      this.loadingTags = false;
    }
  }

  toggleChannel(channel: string): void {
    if (this.channelSelected.has(channel)) this.channelSelected.delete(channel);
    else this.channelSelected.add(channel);
  }

  isChannelSelected(channel: string): boolean {
    return this.channelSelected.has(channel);
  }

  addNote(): void {
    const note = this.noteDraft.trim();
    if (!note) return;
    this.manualNotes = [...this.manualNotes, note];
    this.noteDraft = '';
  }

  removeNote(index: number): void {
    this.manualNotes = this.manualNotes.filter((_, i) => i !== index);
  }

  get canAddAsset(): boolean {
    return !!this.assetType && !!this.assetName.trim();
  }

  addAsset(): void {
    if (!this.canAddAsset) return;
    this.campaignAssets = [...this.campaignAssets, {
      type: this.assetType,
      name: this.assetName.trim(),
      url: this.assetUrl.trim()
    }];
    this.assetType = '';
    this.assetName = '';
    this.assetUrl = '';
  }

  removeAsset(index: number): void {
    this.campaignAssets = this.campaignAssets.filter((_, i) => i !== index);
  }

  get canSave(): boolean {
    return !!this.campaignName.trim() && !!this.startDate && !!this.endDate && !!this.segment;
  }

  async save(): Promise<void> {
    if (this.isSaving) return;
    if (!this.canSave) {
      this.snackBar.open('Fill Campaign Name, Start Date, End Date and Segment.', 'Close', { duration: 3000 });
      return;
    }
    if (this.endDate! < this.startDate!) {
      this.snackBar.open('End Date cannot be before Start Date.', 'Close', { duration: 3000 });
      return;
    }

    // Pull in anything typed but not yet added, so it isn't silently lost.
    if (this.noteDraft.trim()) this.addNote();
    if (this.canAddAsset) this.addAsset();

    this.isSaving = true;
    try {
      const ref = doc(collection(this.firestore, 'eiflixcampaign'));
      await setDoc(ref, {
        id: ref.id,
        campaignname: this.campaignName.trim(),
        startdate: Timestamp.fromDate(this.startDate!),
        enddate: Timestamp.fromDate(this.endDate!),
        segment: this.segment,
        expectedsalevalue: this.expectedSaleValue ?? 0,
        achievedsalesvalue: this.achievedSalesValue ?? 0,
        numberofsales: this.numberOfSales ?? 0,
        channels: [...this.channelSelected],
        manualnotes: this.manualNotes,
        campaignassets: this.campaignAssets,
        created: serverTimestamp(),
        updated: serverTimestamp()
      });
      this.snackBar.open('Campaign saved.', 'Close', { duration: 2500 });
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Error saving campaign:', err);
      this.snackBar.open('Error saving campaign.', 'Close', { duration: 3000 });
      this.isSaving = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
