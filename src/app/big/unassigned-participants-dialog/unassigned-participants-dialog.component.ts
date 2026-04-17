import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-unassigned-participants-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    FormsModule
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

  // Multi-select state
  selectMode = false;
  selectedIds = new Set<string>();

  // Cohort picker
  cohortsList: any[] = [];
  filteredCohortsList: any[] = [];
  cohortSearchQuery = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<UnassignedParticipantsDialogComponent>
  ) {
    this.participants = data?.participants || [];
    this.filteredParticipants = [...this.participants];
    this.mapProfile = data?.mapProfile || {};
    this.mapAcceleratorEvent = data?.mapAcceleratorEvent || {};
    this.cohortsList = data?.cohortsList || [];
    this.filteredCohortsList = [...this.cohortsList];
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

  onCohortSearch() {
    const q = this.cohortSearchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredCohortsList = [...this.cohortsList];
    } else {
      this.filteredCohortsList = this.cohortsList.filter(c => (c.name || '').toLowerCase().includes(q));
    }
  }

  toggleSelectMode() {
    this.selectMode = !this.selectMode;
    if (!this.selectMode) this.selectedIds.clear();
  }

  participantKey(p: any): string {
    return p.participantId || p.id || p.docid || p.name;
  }

  isChecked(p: any): boolean {
    return this.selectedIds.has(this.participantKey(p));
  }

  toggleChecked(p: any, ev?: Event) {
    if (ev) ev.stopPropagation();
    const k = this.participantKey(p);
    if (this.selectedIds.has(k)) this.selectedIds.delete(k);
    else this.selectedIds.add(k);
  }

  selectAll() {
    const keys = this.filteredParticipants.map(p => this.participantKey(p));
    const anyUnchecked = keys.some(k => !this.selectedIds.has(k));
    if (anyUnchecked) keys.forEach(k => this.selectedIds.add(k));
    else keys.forEach(k => this.selectedIds.delete(k));
  }

  assignToCohort(cohort: any) {
    if (this.selectedIds.size === 0) return;
    // Map selected keys back to participant IDs that the parent can use.
    const ids = this.filteredParticipants
      .filter(p => this.selectedIds.has(this.participantKey(p)))
      .map(p => p.participantId || p.id || this.participantKey(p));
    this.dialogRef.close({ action: 'assign', participantIds: ids, cohort });
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
