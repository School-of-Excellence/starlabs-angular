import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-unassigned-participants-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    MatIconModule
  ],
  templateUrl: './unassigned-participants-dialog.component.html',
  styleUrl: './unassigned-participants-dialog.component.css'
})
export class UnassignedParticipantsDialogComponent {
  
  participants: any[] = [];
  filteredParticipants: any[] = [];
  searchQuery: string = '';
  mapProfile: any = {};
  mapAcceleratorEvent: any = {};

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<UnassignedParticipantsDialogComponent>
  ) {
    this.participants = data?.participants || [];
    this.filteredParticipants = [...this.participants];
    this.mapProfile = data?.mapProfile || {};
    this.mapAcceleratorEvent = data?.mapAcceleratorEvent || {};
  }

  onSearch() {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredParticipants = [...this.participants];
    } else {
      this.filteredParticipants = this.participants.filter(p => {
        const name = (p.name || '').toLowerCase();
        const eventName = (p.eventName || '').toLowerCase();
        return name.includes(query) || eventName.includes(query);
      });
    }
  }

   getSourceLabel(participant: any): string {
    if (participant.inEventRequest && participant.inBigInvitation) {
      return 'Event & BIG';
    } else if (participant.inEventRequest) {
      return 'Event Request';
    } else if (participant.inBigInvitation) {
      return 'BIG Invitation';
    }
    return 'Unknown';
  }

  getSourceClass(participant: any): string {
    if (participant.inEventRequest && participant.inBigInvitation) {
      return 'both';
    } else if (participant.inEventRequest) {
      return 'event-request';
    } else if (participant.inBigInvitation) {
      return 'big-invite';
    }
    return '';
  }

  onClose() {
    this.dialogRef.close();
  }

  getInitial(name: string): string {
    return (name || 'P')[0].toUpperCase();
  }
}