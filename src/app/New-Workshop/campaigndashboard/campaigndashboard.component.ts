import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NewCampaignDialogComponent } from './new-campaign-dialog/new-campaign-dialog.component';

@Component({
  selector: 'app-campaigndashboard',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatDialogModule],
  templateUrl: './campaigndashboard.component.html',
  styleUrl: './campaigndashboard.component.css'
})
export class CampaigndashboardComponent {

  constructor(private dialog: MatDialog) {}

  openNewCampaignDialog(): void {
    this.dialog.open(NewCampaignDialogComponent, {
      width: '950px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false
    });
  }
}
