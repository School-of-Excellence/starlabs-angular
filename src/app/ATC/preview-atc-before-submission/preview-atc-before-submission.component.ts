import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-preview-atc-before-submission',
  imports: [
    MatIconModule,
    MatButtonModule,
    CommonModule,
    DragDropModule,
    
  ],
  templateUrl: './preview-atc-before-submission.component.html',
  styleUrl: './preview-atc-before-submission.component.css'
})
export class PreviewAtcBeforeSubmissionComponent {
  adjustmentOrder = []
  mapProcedure = {}

  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogData: any,
    public dialogRef: MatDialogRef<any>
  ) {
    this.adjustmentOrder = dialogData["adjustmentlist"]
    this.mapProcedure = dialogData["mapprocedure"]
  }

  ngOnInit(): void {
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.adjustmentOrder, event.previousIndex, event.currentIndex);
  }

  onClose(){
    this.dialogRef.close(null)
  }

  onConfirm(){
    this.dialogRef.close(this.adjustmentOrder)
  }

}
