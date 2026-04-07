import { Component, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { DeleteSeriesComponent } from './delete-series/delete-series.component';
import { ConfigureseriesdialogComponent } from './configureseriesdialog/configureseriesdialog.component';
import { collection, collectionSnapshots, Firestore } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-series-dashboard',
  imports: [
    MatTableModule,
    MatInputModule,
    CommonModule,
    MatPaginatorModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    MatSelectModule,
    FormsModule,
    MatTooltipModule
  ],
  templateUrl: './series-dashboard.component.html',
  styleUrls: ['../../content-upload-version2/content-upload-shared.css'],
})
export class SeriesDashboardComponent {
  displayedColumns: string[] = ['Series Name','type', 'Copy', 'Copyeiflix', 'Edit', 'Delete'];
  dataSource = new MatTableDataSource();
  tierfilter: string = 'all';

  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.dataSource.paginator = paginator;
    }
  }

  private subscription = new Subject<void>();

  constructor(private firestore: Firestore, public dialog: MatDialog,
    public clipboard: Clipboard,
    private snackBar: MatSnackBar,
  ) {
    const seriesRef = collection(this.firestore, 'series');
    collectionSnapshots(seriesRef)
      .pipe(takeUntil(this.subscription))
      .subscribe((snapshotData) => {
        const snapshot = snapshotData.map((d) => ({ id: d.id, ...d.data() }));
        this.dataSource.data = snapshot;
      });
  }

  // ngOnInit(): void {}
  ngOnInit(): void {
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const [search, typeFilter] = filter.split('||');
      const matchesSearch = !search || 
        (data.seriesName || '').toLowerCase().includes(search);
    const matchesType =
      typeFilter === 'all' ||
      data.type === typeFilter;
      return matchesSearch && matchesType;
    };
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  onClick() {
    this.dialog.open(ConfigureseriesdialogComponent, {
      width: '1200px',
      maxWidth: '95vw',
      height: '90vh',
      data: { seriesId: null },
    });
  }

  onEdit(row: any) {
    this.dialog.open(ConfigureseriesdialogComponent, {
      width: '1200px',
      maxWidth: '95vw',
      height: '90vh',
      data: { seriesId: row.id },
    });
  }

  ondelete(id: any) {
    this.dialog.open(DeleteSeriesComponent, {
      width: '400px',
      data: { delete: true, id: id },
    });
  }

  ApplyFilter(event: Event) {
      const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
      this.dataSource.filter = filterValue + '||' + this.tierfilter;
    }

    applytierfilter() {
      const input = document.querySelector<HTMLInputElement>('.search-box .ib-input');
      const search = input?.value?.trim().toLowerCase() || '';
      this.dataSource.filter = search + '||' + this.tierfilter;
    }
  openSnackBar(message:string,action:string) {
    this.snackBar.open(message,action,{ duration: 2000})
  }

  copyToClipboard(data, site) {
    console.log('copied');
    this.openSnackBar(`${data.seriesName} copied! Ready to share 🚀`, "OK");
    const url = `https://${site}/eiflix/${data.id}`;
    this.clipboard.copy(url);
  }
}