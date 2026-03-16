import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore } from '@angular/fire/firestore';
import { ref, deleteObject, Storage } from '@angular/fire/storage';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subject, takeUntil } from 'rxjs';
import { LearningMaterialAddDialogComponent } from './learning-material-add-dialog/learning-material-add-dialog.component';

@Component({
  selector: 'app-learning-material',
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './learning-material.component.html',
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})
export class LearningMaterialComponent {
  displayedColumns: string[] = ['sno', 'name', 'description', 'files', 'date', 'edit', 'delete'];
  dataSource = new MatTableDataSource<any>();

  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) this.dataSource.paginator = paginator;
  }
  @ViewChild(MatSort) set matSort(sort: MatSort) {
    if (sort) this.dataSource.sort = sort;
  }

  private subscription = new Subject<void>();

  constructor(private firestore: Firestore, private storage: Storage, private dialog: MatDialog) {
    const materialRef = collection(this.firestore, 'learning-materials');
    collectionSnapshots(materialRef)
      .pipe(takeUntil(this.subscription))
      .subscribe((snapshot) => {
        this.dataSource.data = snapshot.map((d) => ({ id: d.id, ...d.data() }));
      });
  }

  ngOnInit() {
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const search = filter.trim().toLowerCase();
      return (
        (data.name || '').toLowerCase().includes(search) ||
        (data.description || '').toLowerCase().includes(search)
      );
    };
  }

  ngOnDestroy() {
    this.subscription.next();
    this.subscription.complete();
  }

  openUploadDialog() {
    this.dialog.open(LearningMaterialAddDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      height: '90vh',
      data: { editMode: false },
    });
  }

  onEdit(row: any) {
    this.dialog.open(LearningMaterialAddDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      height: '90vh',
      data: { editMode: true, materialId: row.id, material: row },
    });
  }

  async onDelete(row: any) {
    if (confirm('Are you sure you want to delete this material?')) {
      try {
        const files: any[] = row.files || [];
        for (const file of files) {
          if (file.storagePath) {
            try {
              await deleteObject(ref(this.storage, file.storagePath));
            } catch (e) {
              console.warn('Failed to delete file:', file.storagePath, e);
            }
          }
        }
        await deleteDoc(doc(this.firestore, 'learning-materials', row.id));
      } catch (err) {
        console.error('Error deleting:', err);
      }
    }
  }

  applyFilter(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dataSource.filter = value.trim().toLowerCase();
  }
}