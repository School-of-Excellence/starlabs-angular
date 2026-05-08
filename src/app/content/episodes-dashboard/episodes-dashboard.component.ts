import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, Firestore, orderBy, query } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';
import { AddEpisodeComponent } from './add-episode/add-episode.component';
import { UploadEpisodeDialogComponent } from './upload-episode-dialog/upload-episode-dialog.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { AuthguardService } from '../../authguard.service';
import { MatSortModule } from '@angular/material/sort';

@Component({
  selector: 'app-episodes-dashboard',
  imports: [
    MatTableModule,
    MatFormFieldModule,
    MatPaginatorModule,
    MatInputModule,
    MatChipsModule,
    CommonModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    MatSortModule
  ],
  templateUrl: './episodes-dashboard.component.html',
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})
export class EpisodesDashboardComponent {
  displayedColumns: string[] = ['Title', 'Referencetitle', 'Duration', 'added', 'convertedtohls', 'videosize', 'Series', 'Edit', 'Delete'];
  dataSource = new MatTableDataSource();

  @ViewChild(MatPaginator) paginator: MatPaginator | any;
  @ViewChild(MatSort) sort: MatSort | any;

  mapTaxonomy: { [key: string]: string } = {};

  private subscription = new Subject<void>();

  constructor(
    public dialog: MatDialog,
    private firestore: Firestore,
    public authguard: AuthguardService,
  ) {
    const episodesRef = collection(this.firestore, 'episodes');
    const episodeQuery = query(episodesRef, orderBy('date', 'desc'));
    collectionSnapshots(episodeQuery).pipe(takeUntil(this.subscription)).subscribe((episodesData) => {
      const snapshotData = episodesData.map(doc => ({ id: doc.id, ...doc.data() }));
      this.dataSource.data = snapshotData;
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.dataSource.sortingDataAccessor = (item: any, headerSort: string) => {
        switch (headerSort) {
          case 'Title': return item.title?.toLowerCase() ?? '';
          case 'Referencetitle': return item.reftitle?.toLowerCase() ?? '';
          case 'Duration': return item.duration ?? 0;
          case 'added': return item.date?.toDate().getTime() ?? 0;
          case 'videosize': return item.videoSize ?? 0;
          case 'Series': return item.imagesize ?? 0;
        }
      };
    });

    const atctaxonomyRef = collection(this.firestore, 'atc taxonomy');
    collectionSnapshots(atctaxonomyRef).pipe(takeUntil(this.subscription)).subscribe(snapshot => {
      const snap = snapshot.map(doc => ({ id: doc.id, ...doc.data() }));
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        this.mapTaxonomy[element['id']] = element['name'];
      }
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  openUploadDialog() {
    this.dialog.open(UploadEpisodeDialogComponent, {
      width: '95vw',
      maxWidth: '1400px',
      height: '90vh',
      panelClass: 'upload-episode-dialog-panel',
    });
  }

  openEditDialog(row: any) {
    this.dialog.open(UploadEpisodeDialogComponent, {
      width: '95vw',
      maxWidth: '1400px',
      height: '90vh',
      panelClass: 'upload-episode-dialog-panel',
      data: { edit: true, row },
    });
  }

  openDeleteDialog(id: any, srt: any, imageUrl: any, videoUrl: any, screenshot: string) {
    this.dialog.open(AddEpisodeComponent, {
      data: {
        delete: true,
        id,
        imageUrl,
        srt,
        videoUrl,
        screenshot,
      },
    });
  }

  ApplyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }
}
