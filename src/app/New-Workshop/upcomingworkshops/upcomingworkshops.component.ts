import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  deleteDoc,
  query,
  orderBy
} from '@angular/fire/firestore';
import { CreateupcomingworkshopsComponent } from './createupcomingworkshops/createupcomingworkshops.component';

@Component({
  selector: 'app-upcomingworkshops',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './upcomingworkshops.component.html',
  styleUrl: './upcomingworkshops.component.css'
})
export class UpcomingworkshopsComponent implements OnInit {
  workshops: any[] = [];
  loading = true;
  displayedColumns = [
    'eventdate',
    'title',
    'type',
    'cost',
    'location',
    'seats',
    'showconfirmedseat',
    'show',
    'actions'
  ];

  constructor(
    private firestore: Firestore,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const ref = collection(this.firestore, 'upcomingworkshops');
    const q = query(ref, orderBy('eventdate', 'asc'));
    collectionData(q, { idField: 'id' }).subscribe({
      next: (data) => {
        this.workshops = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading upcoming workshops:', err);
        this.loading = false;
      }
    });
  }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    return new Date(value);
  }

  openDialog(workshop?: any): void {
    this.dialog.open(CreateupcomingworkshopsComponent, {
      width: '720px',
      maxWidth: '95vw',
      panelClass: 'upcoming-dialog-panel',
      autoFocus: false,
      data: workshop ? { mode: 'edit', workshop } : null
    });
  }

  async deleteWorkshop(workshop: any): Promise<void> {
    const id = workshop.docid || workshop.id;
    if (!id) return;
    if (!confirm(`Delete "${workshop.title || 'this workshop'}"?`)) return;
    try {
      await deleteDoc(doc(this.firestore, 'upcomingworkshops', id));
      this.snackBar.open('Workshop deleted.', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Error deleting workshop:', err);
      this.snackBar.open('Error deleting. Please try again.', 'Close', { duration: 3000 });
    }
  }
}
