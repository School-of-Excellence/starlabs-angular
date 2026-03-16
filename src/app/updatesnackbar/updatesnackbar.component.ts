import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';

@Component({
  selector: 'app-updatesnackbar',
  imports: [
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './updatesnackbar.component.html',
  styleUrl: './updatesnackbar.component.css'
})
export class UpdatesnackbarComponent {
  constructor(
    @Inject(MAT_SNACK_BAR_DATA) public data: {
      onUpdate: () => void;
      // onDismiss: () => void;
    }
  ) {}

  update() {
    this.data.onUpdate();
  }

  // dismiss() {
  //   this.data.onDismiss();
  // }
}
