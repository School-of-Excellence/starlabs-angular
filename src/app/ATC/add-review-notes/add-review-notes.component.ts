import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-add-review-notes',
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './add-review-notes.component.html',
  styleUrl: './add-review-notes.component.css'
})
export class AddReviewNotesComponent {
  commentBox = ""

  constructor(
    public dailogRef: MatDialogRef<any>,
    @Inject(MAT_DIALOG_DATA) public dailogData: any,
  ) { }

  ngOnInit(): void {
  }

  onClose(){
    this.dailogRef.close()
  }

  onConfirm(){
    this.dailogRef.close(this.commentBox)
  }
}
