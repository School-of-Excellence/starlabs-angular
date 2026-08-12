import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  deleteDoc,
  writeBatch
} from '@angular/fire/firestore';
import { CreateupcomingworkshopsComponent } from './createupcomingworkshops/createupcomingworkshops.component';
import { UpcomingworkshopresponsesComponent } from './upcomingworkshopresponses/upcomingworkshopresponses.component';
import { HomeseriesComponent } from './homeseries/homeseries.component';
import { EiflixHomeConfigComponent } from './eiflixhomeconfig/eiflixhomeconfig.component';

@Component({
  selector: 'app-upcomingworkshops',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    DragDropModule,
    EiflixHomeConfigComponent
  ],
  templateUrl: './upcomingworkshops.component.html',
  styleUrl: './upcomingworkshops.component.css'
})
export class UpcomingworkshopsComponent implements OnInit {
  loading = true;
  private datePipe = new DatePipe('en-US');

  // Tab 1 — Upcoming Workshops (widgettype === 'comingsoon').
  comingsoonData = new MatTableDataSource<any>([]);
  comingsoonColumns = [
    'drag',
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

  // Tab 2 — Ads (widgettype === 'ads').
  adsData = new MatTableDataSource<any>([]);
  adsColumns = [
    'drag',
    'head',
    'headright',
    'title',
    'subtitle',
    'description',
    'footer',
    'buttonname',
    'navigationlink',
    'show',
    'actions'
  ];

  // Tab 3 — Home Series (collection: eiflixhomeseries).
  seriesData = new MatTableDataSource<any>([]);
  seriesColumns = ['title', 'episodes', 'created', 'actions'];

  // Each table renders behind *ngIf inside its own tab, so use named,
  // setter-based ViewChild refs to wire sort/paginator when each appears.
  @ViewChild('csSort') set csSort(s: MatSort) {
    if (s) this.comingsoonData.sort = s;
  }
  @ViewChild('csPaginator') set csPaginator(p: MatPaginator) {
    if (p) this.comingsoonData.paginator = p;
  }
  @ViewChild('adsSort') set adsSort(s: MatSort) {
    if (s) this.adsData.sort = s;
  }
  @ViewChild('adsPaginator') set adsPaginator(p: MatPaginator) {
    if (p) this.adsData.paginator = p;
  }
  @ViewChild('hsSort') set hsSort(s: MatSort) {
    if (s) this.seriesData.sort = s;
  }
  @ViewChild('hsPaginator') set hsPaginator(p: MatPaginator) {
    if (p) this.seriesData.paginator = p;
  }

  constructor(
    private firestore: Firestore,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.setupComingSoon();
    this.setupAds();
    this.setupSeries();

    // One live read of the whole collection, partitioned by widgettype.
    // (No server orderBy — ads docs have no eventdate and would be dropped.)
    const ref = collection(this.firestore, 'eiflixhomewidgets');
    collectionData(ref, { idField: 'id' }).subscribe({
      next: (data: any[]) => {
        this.comingsoonData.data = data
          .filter(w => w.widgettype === 'comingsoon')
          .sort((a, b) => this.orderOf(a) - this.orderOf(b));

        this.adsData.data = data
          .filter(w => w.widgettype === 'ads')
          .sort((a, b) => this.orderOf(a) - this.orderOf(b));

        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading home widgets:', err);
        this.loading = false;
      }
    });

    // Home series live from its own collection.
    const seriesRef = collection(this.firestore, 'eiflixhomeseries');
    collectionData(seriesRef, { idField: 'id' }).subscribe({
      next: (data: any[]) => {
        this.seriesData.data = data
          .sort((a, b) => (this.toDate(b.created)?.getTime() || 0) - (this.toDate(a.created)?.getTime() || 0));
      },
      error: (err) => console.error('Error loading home series:', err)
    });
  }

  private setupComingSoon(): void {
    this.comingsoonData.filterPredicate = (w: any, filter: string) => {
      const haystack = [
        this.datePipe.transform(this.toDate(w.eventdate), 'mediumDate'),
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

    this.comingsoonData.sortingDataAccessor = (w: any, id: string) => {
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
  }

  private setupAds(): void {
    this.adsData.filterPredicate = (w: any, filter: string) => {
      const haystack = [
        w.head,
        w.headright,
        w.title,
        w.subtitle,
        w.description,
        w.footer,
        w.buttonname,
        w.navigationlink,
        w.show ? 'visible' : 'hidden'
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    };

    this.adsData.sortingDataAccessor = (w: any, id: string) =>
      (w[id] ?? '').toString().toLowerCase();
  }

  private setupSeries(): void {
    this.seriesData.filterPredicate = (s: any, filter: string) => {
      const episodeTitles = (Array.isArray(s.homeseries) ? s.homeseries : [])
        .map((h: any) => h?.title || '')
        .join(' ');
      const haystack = [s.title, episodeTitles].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(filter);
    };

    this.seriesData.sortingDataAccessor = (s: any, id: string) => {
      switch (id) {
        case 'episodes':
          return Array.isArray(s.homeseries) ? s.homeseries.length : 0;
        case 'created':
          return this.toDate(s.created)?.getTime() || 0;
        default:
          return (s[id] ?? '').toString().toLowerCase();
      }
    };
  }

  seriesCount(s: any): number {
    return Array.isArray(s.homeseries) ? s.homeseries.length : 0;
  }

  applyComingSoonFilter(event: Event): void {
    this.comingsoonData.filter = ((event.target as HTMLInputElement).value || '').trim().toLowerCase();
    this.comingsoonData.paginator?.firstPage();
  }

  applyAdsFilter(event: Event): void {
    this.adsData.filter = ((event.target as HTMLInputElement).value || '').trim().toLowerCase();
    this.adsData.paginator?.firstPage();
  }

  applySeriesFilter(event: Event): void {
    this.seriesData.filter = ((event.target as HTMLInputElement).value || '').trim().toLowerCase();
    this.seriesData.paginator?.firstPage();
  }

  toDate(value: any): Date | null {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    return new Date(value);
  }

  private orderOf(w: any): number {
    return typeof w?.order === 'number' ? w.order : Number.MAX_SAFE_INTEGER;
  }

  dropComingSoon(event: CdkDragDrop<any[]>): void {
    this.reorder(this.comingsoonData, event);
  }

  dropAds(event: CdkDragDrop<any[]>): void {
    this.reorder(this.adsData, event);
  }

  // Persist row order after a drag. Reassigns `order` = 1..n across the whole
  // set and writes only the docs whose order changed.
  private async reorder(ds: MatTableDataSource<any>, event: CdkDragDrop<any[]>): Promise<void> {
    // Reordering only makes sense on the natural (order) sequence.
    if (ds.sort && ds.sort.active && ds.sort.direction) {
      this.snackBar.open('Clear column sorting to reorder rows.', 'Close', { duration: 3000 });
      return;
    }
    if (ds.filter) {
      this.snackBar.open('Clear the search to reorder rows.', 'Close', { duration: 3000 });
      return;
    }

    const size = ds.paginator?.pageSize ?? ds.data.length;
    const pageIndex = ds.paginator?.pageIndex ?? 0;
    const from = pageIndex * size + event.previousIndex;
    const to = pageIndex * size + event.currentIndex;
    if (from === to) return;

    const data = ds.data.slice();
    moveItemInArray(data, from, to);

    const batch = writeBatch(this.firestore);
    data.forEach((row, i) => {
      const newOrder = i + 1;
      if (row.order !== newOrder) {
        row.order = newOrder;
        const id = row.docid || row.id;
        if (id) batch.update(doc(this.firestore, 'eiflixhomewidgets', id), { order: newOrder });
      }
    });

    ds.data = data; // optimistic; the live listener re-sorts to the same order
    try {
      await batch.commit();
    } catch (err) {
      console.error('Error saving new order:', err);
      this.snackBar.open('Error saving order. Please try again.', 'Close', { duration: 3000 });
    }
  }

  // --- Coming Soon dialog ---
  openDialog(widget?: any): void {
    this.dialog.open(CreateupcomingworkshopsComponent, {
      width: '720px',
      maxWidth: '95vw',
      panelClass: 'upcoming-dialog-panel',
      autoFocus: false,
      data: {
        widgettype: 'comingsoon',
        ...(widget ? { mode: 'edit', widget } : {})
      }
    });
  }

  // --- Ads dialog (same component, different fields) ---
  // Wider/taller than the coming-soon dialog: the auto-notification and wati
  // schedules need the room.
  openAdsDialog(widget?: any): void {
    this.dialog.open(CreateupcomingworkshopsComponent, {
      width: '1100px',
      maxWidth: '95vw',
      maxHeight: '94vh',
      panelClass: 'upcoming-dialog-panel',
      autoFocus: false,
      data: {
        widgettype: 'ads',
        ...(widget ? { mode: 'edit', widget } : {})
      }
    });
  }

  // --- Home Series dialog ---
  openHomeSeriesDialog(series?: any): void {
    this.dialog.open(HomeseriesComponent, {
      width: '1040px',
      maxWidth: '95vw',
      maxHeight: '92vh',
      panelClass: 'upcoming-dialog-panel',
      autoFocus: false,
      data: series ? { mode: 'edit', series } : null
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

  async deleteWidget(widget: any): Promise<void> {
    return this.deleteFrom('eiflixhomewidgets', widget);
  }

  async deleteSeries(series: any): Promise<void> {
    return this.deleteFrom('eiflixhomeseries', series);
  }

  private async deleteFrom(collectionName: string, item: any): Promise<void> {
    const id = item.docid || item.id;
    if (!id) return;
    if (!confirm(`Delete "${item.title || 'this item'}"?`)) return;
    try {
      await deleteDoc(doc(this.firestore, collectionName, id));
      this.snackBar.open('Deleted.', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Error deleting item:', err);
      this.snackBar.open('Error deleting. Please try again.', 'Close', { duration: 3000 });
    }
  }
}
