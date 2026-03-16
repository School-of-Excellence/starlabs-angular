import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-progress',
  imports: [
    MatProgressSpinnerModule
  ],
  templateUrl: './loading-progress.component.html',
  styleUrl: './loading-progress.component.css'
})
export class LoadingProgressComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogData : any
  ) {}
}
