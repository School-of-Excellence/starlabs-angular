import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

interface CohortParticipant {
  profileid: string;
  name: string;
  email: string;
}

interface CohortParticipantsData {
  cohortName: string;
  participants: CohortParticipant[];
}

@Component({
  selector: 'app-cohort-participants-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    ProfilePictureComponent
  ],
  templateUrl: './cohort-participants-dialog.component.html',
  styleUrl: './cohort-participants-dialog.component.css'
})
export class CohortParticipantsDialogComponent {
  searchTerm = ''

  constructor(
    public dialogRef: MatDialogRef<CohortParticipantsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CohortParticipantsData
  ) {}

  get filtered(): CohortParticipant[] {
    const s = this.searchTerm.trim().toLowerCase()
    if (!s) return this.data.participants
    return this.data.participants.filter(p =>
      p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s)
    )
  }

  trackById(index: number, p: CohortParticipant): string {
    return p.profileid
  }

  close(): void {
    this.dialogRef.close()
  }
}
