import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

export interface ParticipantIssue {
  participantId: string;
  participantName: string;
  zones?: string[]; // For conflicts
  selectedZone?: string; // User selection
}

export interface DialogData {
  type: 'unassigned' | 'conflict';
  participants: ParticipantIssue[];
  zoneMap: { [zoneId: string]: string }; // zoneId -> zoneName
}

@Component({
  selector: 'app-resolve-participant-zone',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    ProfilePictureComponent
  ],
  templateUrl: './resolve-participant-zone.component.html',
  styleUrl: './resolve-participant-zone.component.css'
})
export class ResolveParticipantZoneComponent {

  mapProfile = {}

  // Zones in play across the conflicts - one "Apply <zone>" button each
  zoneOptions: { zoneId: string, zoneName: string }[] = [];

  constructor(
    public dialogRef: MatDialogRef<any>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.mapProfile = data["mapProfile"]
    this.buildZoneOptions();
  }

  // Collect every zone that at least one conflicted participant is eligible for
  private buildZoneOptions(): void {
    const zoneIds = new Set<string>();
    (this.data.participants || []).forEach(p => {
      (p.zones || []).forEach(zoneId => zoneIds.add(zoneId));
    });

    this.zoneOptions = Array.from(zoneIds)
      .map(zoneId => ({
        zoneId: zoneId,
        zoneName: this.data.zoneMap[zoneId] || zoneId
      }))
      .sort((a, b) => a.zoneName.localeCompare(b.zoneName));
  }

  // Bulk select: tick this zone for everyone eligible for it
  applyZoneToAll(zoneId: string): void {
    (this.data.participants || []).forEach(p => {
      if ((p.zones || []).includes(zoneId)) {
        p.selectedZone = zoneId;
      }
    });
  }

  // Close dialog without action
  onClose(): void {
    this.dialogRef.close();
  }

  // Submit conflict resolutions
  onSubmit(): void {
    // Check all conflicts have selected zones
    const allSelected = this.data.participants.every(p => p.selectedZone);
    
    if (!allSelected) {
      alert('Please select a zone for all participants');
      return;
    }
    
    this.dialogRef.close(this.data.participants);
  }

  // Get dialog title
  get title(): string {
    return this.data.type === 'unassigned' ? 'Unassigned Participants' : 'Resolve Zone Conflicts';
  }

  // Get dialog message
  get message(): string {
    return this.data.type === 'unassigned' ? 
    'The following participants are not assigned to any zone. Please assign them before submitting.' : 
    'The following participants are assigned to multiple zones. Please select the correct zone for each.';
  }
}
