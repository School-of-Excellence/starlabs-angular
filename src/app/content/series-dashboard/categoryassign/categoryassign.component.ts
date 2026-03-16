import { Component, ViewChild } from '@angular/core';
import {
  collection,
  collectionSnapshots,
  DocumentReference,
  Firestore,
  getDoc,
} from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, combineLatest, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { AssignCategoryDialogComponent } from '../assigncategorydialog/assigncategorydialog.component';

@Component({
  selector: 'app-categoryassign',
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    MatButtonModule,
  ],
  templateUrl: './categoryassign.component.html',
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css'],
})
export class CategoryassignComponent {
  displayedColumns: string[] = ['categoryName', 'series', 'Edit'];
  dataSource = new MatTableDataSource<any>();
  loading = true;

  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.dataSource.paginator = paginator;
    }
  }
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) {
      this.dataSource.sort = sort;
    }
  }

  private subscription = new Subject<void>();

  allCategories: any[] = [];
  allSeries: any[] = [];
  seriesMap: { [id: string]: any } = {};

  constructor(private firestore: Firestore, private dialog: MatDialog) {
    const categoriesRef = collection(this.firestore, 'category');
    const seriesRef = collection(this.firestore, 'series');

    combineLatest([
      collectionSnapshots(categoriesRef),
      collectionSnapshots(seriesRef),
    ])
      .pipe(takeUntil(this.subscription))
      .subscribe(([catSnap, seriesSnap]) => {
        this.allSeries = seriesSnap.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        for (const s of this.allSeries) {
          this.seriesMap[s.id] = s;
        }
        this.allCategories = catSnap.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        const categoryRows: any[] = [];
        for (const cat of this.allCategories) {
          const sequenceRefs: any[] = cat['sequence'] || [];
          const assignedSeries: any[] = [];
          for (const ref of sequenceRefs) {
            if (ref && ref instanceof DocumentReference) {
              const found = this.seriesMap[ref.id];
              if (found) {
                assignedSeries.push(found);
              }
            }
          }

          categoryRows.push({
            categoryId: cat.id,
            categoryName: cat['category'] || cat['name'] || cat.id,
            seriesList: assignedSeries,
            seriesNames: assignedSeries.map((s) => s.seriesName).join(', '),
          });
        }

        categoryRows.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
        this.dataSource.data = categoryRows;
        this.loading = false;
      });
  }

  ngOnInit() {
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const search = filter.trim().toLowerCase();
      const cat = (data.categoryName || '').toLowerCase();
      const series = (data.seriesNames || '').toLowerCase();
      return cat.includes(search) || series.includes(search);
    };
  }

  ngOnDestroy() {
    this.subscription.next();
    this.subscription.complete();
  }

  openAssignDialog(row?: any) {
    this.dialog.open(AssignCategoryDialogComponent, {
      width: '520px',
      data: {
        categoryId: row?.categoryId || null,
        categoryName: row?.categoryName || null,
        allCategories: this.allCategories,
      },
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }
}