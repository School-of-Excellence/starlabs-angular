import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { AddPipelineDialogComponent } from './add-pipeline-dialog/add-pipeline-dialog.component';

@Component({
  selector: 'app-onboarding-pipeline',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './onboarding-pipeline.component.html',
  styleUrl: './onboarding-pipeline.component.css'
})
export class OnboardingPipelineComponent {

  constructor(private dialog: MatDialog) {}

  openAddPipeline() {
    this.dialog.open(AddPipelineDialogComponent, {
      width: '70vw',
      maxWidth: '1200px',
      autoFocus: false,
      data: { type: 'add' }
    });
  }
}
