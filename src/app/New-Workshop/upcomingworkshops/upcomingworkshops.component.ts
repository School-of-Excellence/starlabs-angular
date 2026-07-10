import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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
import { UpcomingworkshopresponsesComponent } from './upcomingworkshopresponses/upcomingworkshopresponses.component';

@Component({
  selector: 'app-upcomingworkshops',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './upcomingworkshops.component.html',
  styleUrl: './upcomingworkshops.component.css'
})
export class UpcomingworkshopsComponent implements OnInit {
  dataSource = new MatTableDataSource<any>([]);
  loading = true;
  displayedColumns = [
    'eventdate',
    'title',
    'type',
    'cost',
    'location',
    'seats',
    'confirmed',
    'showconfirmedseat',
    'show',
    'view',
    'actions'
  ];

  // The table lives behind *ngIf, so it isn't in the DOM during ngAfterViewInit.
  // Setter-based ViewChild wires sort/paginator the moment the table renders.
  @ViewChild(MatSort) set matSort(ms: MatSort) {
    if (ms) this.dataSource.sort = ms;
  }
  @ViewChild(MatPaginator) set matPaginator(mp: MatPaginator) {
    if (mp) this.dataSource.paginator = mp;
  }

  constructor(
    private firestore: Firestore,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  private datePipe = new DatePipe('en-US');

  ngOnInit(): void {
    // Search across every column, using the same text the table shows
    // (formatted dates, seat labels, and boolean chip labels included).
    this.dataSource.filterPredicate = (w: any, filter: string) => {
      const eventDate = this.toDate(w.eventdate);
      const haystack = [
        this.datePipe.transform(eventDate, 'mediumDate'),
        w.title,
        w.with,
        w.type,
        w.cost,
        w.location,
        w.buttonname,
        w.unlimitedseat ? 'unlimited' : (w.totalseats ?? ''),
        w.confirmed != null ? w.confirmed : 0,
        w.showconfirmedseat ? 'confirmed seats yes' : 'confirmed seats no',
        w.show ? 'visible' : 'hidden'
      ]
        .filter(v => v !== null && v !== undefined && v !== '')
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    };

    // Sort accessors so date/number columns sort correctly.
    this.dataSource.sortingDataAccessor = (w: any, id: string) => {
      switch (id) {
        case 'eventdate':
          return this.toDate(w.eventdate)?.getTime() || 0;
        case 'seats':
          return w.unlimitedseat ? Number.MAX_SAFE_INTEGER : (w.totalseats ?? 0);
        case 'confirmed':
          return w.confirmed ?? 0;
        default:
          return (w[id] ?? '').toString().toLowerCase();
      }
    };

    const ref = collection(this.firestore, 'upcomingworkshops');
    const q = query(ref, orderBy('eventdate', 'asc'));
    collectionData(q, { idField: 'id' }).subscribe({
      next: (data) => {
        this.dataSource.data = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading upcoming workshops:', err);
        this.loading = false;
      }
    });
  }

  applyFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value || '';
    this.dataSource.filter = value.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
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

  openResponses(workshop: any): void {
    this.dialog.open(UpcomingworkshopresponsesComponent, {
      width: '95vw',
      maxWidth: '1200px',
      maxHeight: '90vh',
      autoFocus: false,
      panelClass: 'upcoming-responses-panel',
      data: {
        workshopId: workshop.docid || workshop.id,
        title: workshop.title || ''
      }
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
