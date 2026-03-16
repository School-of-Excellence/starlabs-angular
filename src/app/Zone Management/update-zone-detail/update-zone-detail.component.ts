import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ZoneDialogData {
  zonedata?: any; // Existing zone data for edit mode
  teammemberlist: any[]; // List of available team member
}

export interface ZoneDialogResult {
  zonename: string;
  starttime: string | Date;
  coordinators: string[];
  mentors: string[];
}

@Component({
  selector: 'app-update-zone-detail',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './update-zone-detail.component.html',
  styleUrl: './update-zone-detail.component.css'
})
export class UpdateZoneDetailComponent {
  // Form data
  zoneName: string = '';
  startTime: string = '';
  selectedCoordinators: string[] = [];
  selectedMentors: string[] = [];

  constructor(
    public dialogRef: MatDialogRef<any>,
    @Inject(MAT_DIALOG_DATA) public data: ZoneDialogData
  ) {
    // If edit mode, populate form with existing data
    if (data.zonedata) {
      const zoneData = data.zonedata
      this.zoneName = zoneData["zonename"] || '';
      this.startTime = this.formatTimeForInput(zoneData["starttime"]);
      this.selectedCoordinators = zoneData["coordinators"] || [];
      this.selectedMentors = zoneData["mentors"] || [];
    }
  }

  // Format Firestore timestamp to HTML time input format
  formatTimeForInput(timestamp: any): string {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toISOString().slice(0, 16); // Returns YYYY-MM-DDTHH:MM
    } catch {
      return '';
    }
  }


  // Cancel and close dialog
  onCancel(): void {
    this.dialogRef.close();
  }

  // Save and return data
  onSave(): void {
    if (!this.zoneName.trim()) {
      alert('Zone name is required');
      return;
    }

    const result: ZoneDialogResult = {
      zonename: this.zoneName.trim(),
      starttime: (this.startTime ?? "").trim().length == 0 ? null : new Date(this.startTime),
      coordinators: this.selectedCoordinators,
      mentors: this.selectedMentors
    };

    this.dialogRef.close(result);
  }

  // Get dialog title
  get dialogTitle(): string {
    return this.data.zonedata ? 'Edit Zone' : 'Create New Zone';
  }

  // Get save button text
  get saveButtonText(): string {
    return this.data.zonedata ? 'Update Zone' : 'Create Zone';
  }
}
