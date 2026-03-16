import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-view-notification-participants',
  imports: [
    CommonModule
  ],
  templateUrl: './view-notification-participants.component.html',
  styleUrl: './view-notification-participants.component.css'
})
export class ViewNotificationParticipantsComponent {
  selectedFilter: 'all' | 'active' | 'inactive' | 'no-token' = 'all';

  constructor(
    public dialogRef: MatDialogRef<ViewNotificationParticipantsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {

  }

  returnStatus(profileid: string): string {
    var status = '';
    if ([null, undefined].includes(this.data.appNotificationProfiles[profileid])) {
      status = 'No Token';
    } else {
      if (this.data.appNotificationProfiles[profileid]) {
        status = 'Active';
      } else {
        status = 'Inactive';
      }
    }
    return status;
  }

  // Check if profile has active token
  isActive(profileid: string): boolean {
    return this.data.appNotificationProfiles[profileid] === true;
  }

  // Check if profile has inactive token
  isInactive(profileid: string): boolean {
    return this.data.appNotificationProfiles[profileid] === false;
  }

  // Check if profile has no token
  isNoToken(profileid: string): boolean {
    return [null, undefined].includes(this.data.appNotificationProfiles[profileid]);
  }

  // Get count of active profiles
  getActiveCount(): number {
    return this.data.currentQueueParticipants.filter((id: string) => 
      this.isActive(id)
    ).length;
  }

  // Get count of inactive profiles
  getInactiveCount(): number {
    return this.data.currentQueueParticipants.filter((id: string) => 
      this.isInactive(id)
    ).length;
  }

  // Get count of profiles with no token
  getNoTokenCount(): number {
    return this.data.currentQueueParticipants.filter((id: string) => 
      this.isNoToken(id)
    ).length;
  }

  // Get initials from name for avatar
  getInitials(name: string): string {
    if (!name) return '?';
    
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  // Filter participants by status
  filterByStatus(filter: 'all' | 'active' | 'inactive' | 'no-token'): void {
    this.selectedFilter = filter;
  }

  // Get filtered participants based on selected filter
  getFilteredParticipants(): string[] {
    switch (this.selectedFilter) {
      case 'active':
        return this.data.currentQueueParticipants.filter((id: string) => this.isActive(id));
      case 'inactive':
        return this.data.currentQueueParticipants.filter((id: string) => this.isInactive(id));
      case 'no-token':
        return this.data.currentQueueParticipants.filter((id: string) => this.isNoToken(id));
      case 'all':
      default:
        return this.data.currentQueueParticipants;
    }
  }

  // Export to Excel
  exportToExcel(): void {
    // Prepare data for export
    const exportData = this.getFilteredParticipants().map((profileid, index) => {
      return {
        'S.No': index + 1,
        'Name': this.data.mapProfile[profileid] || 'Unknown',
        'Status': this.returnStatus(profileid)
      };
    });

    // Create worksheet
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  // S.No
      { wch: 30 }, // Name
      { wch: 20 }  // Status
    ];

    // Create workbook
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    
    // Get sheet name based on filter
    let sheetName = 'All Participants';
    switch (this.selectedFilter) {
      case 'active':
        sheetName = 'Active Participants';
        break;
      case 'inactive':
        sheetName = 'Inactive Participants';
        break;
      case 'no-token':
        sheetName = 'No Token Participants';
        break;
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generate file name with date
    const date = new Date();
    const fileName = `Notification_Participants_${this.selectedFilter}.xlsx`;

    // Save file
    XLSX.writeFile(wb, fileName);
  }
}