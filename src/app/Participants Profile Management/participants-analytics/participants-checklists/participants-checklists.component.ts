import { Component, Inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { collection, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import { AuthguardService } from '../../../authguard.service';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';


export interface DialogData {
  type: string;
  checklistData: any[];
  columns: { key: string; header: string }[];
}
@Component({
  selector: 'app-participants-checklists',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ],
  templateUrl: './participants-checklists.component.html',
  styleUrl: './participants-checklists.component.css'
})
export class ParticipantsChecklistsComponent {
  formattedType: string;
  totalRecords: number;
  processedTableData: any[] = [];
  columns: any[];
  mapjourney = {}

  constructor(public dialogRef: MatDialogRef<ParticipantsChecklistsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData, private guard: AuthguardService){
      this.guard.getJourneyMap().then(e => {
        this.mapjourney = e
      })
      this.columns = data.columns;
      this.totalRecords = data.checklistData.length;
      this.formattedType = this.formatColumnHeader(data.type);
      this.processTableData(data.checklistData);
  }

  processTableData(rawData: any[]) {
    this.processedTableData = rawData.map(item => {
      const processedRow: any = {};
      this.columns.forEach(column => {
        processedRow[column.key] = this.formatCellValue(item[column.key]);
      });
      return processedRow;
    });
  }

  formatColumnHeader(column: string): string {
    return column
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  formatCellValue(value: any): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return value.toString();
  }


  close() {
    this.dialogRef.close();
  }

 

}
