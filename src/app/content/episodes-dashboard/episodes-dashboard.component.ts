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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { AuthguardService } from '../../authguard.service';
import { MatSortModule } from '@angular/material/sort';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

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
    MatCheckboxModule,
    FormsModule,
    MatSortModule
  ],
  templateUrl: './episodes-dashboard.component.html',
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})
export class EpisodesDashboardComponent {
  displayedColumns: string[] = ['select', 'Title', 'Referencetitle', 'Duration', 'added', 'convertedtohls', 'srt', 'videosize', 'Series', 'Edit', 'Delete'];
  dataSource = new MatTableDataSource();

  readonly maxSelection = 5;
  selectedRows: any[] = [];
  reconverting = false;

  @ViewChild(MatPaginator) paginator: MatPaginator | any;
  @ViewChild(MatSort) sort: MatSort | any;

  mapTaxonomy: { [key: string]: string } = {};

  private subscription = new Subject<void>();

  constructor(
    public dialog: MatDialog,
    private firestore: Firestore,
    public authguard: AuthguardService,
    private http: HttpClient,
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
          case 'srt': return item.srt ? 1 : 0;
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

  isEligible(row: any): boolean {
    return typeof row?.videoUrl === 'string' && row.videoUrl.includes('eiflix.appspot.com');
  }

  isSelected(row: any): boolean {
    return this.selectedRows.some(r => r.id === row.id);
  }

  isSelectionDisabled(row: any): boolean {
    return !this.isSelected(row) && this.selectedRows.length >= this.maxSelection;
  }

  toggleSelection(row: any) {
    if (this.isSelected(row)) {
      this.selectedRows = this.selectedRows.filter(r => r.id !== row.id);
    } else if (this.selectedRows.length < this.maxSelection) {
      this.selectedRows = [...this.selectedRows, row];
    }
  }

  reconvertSelected() {
    if (this.reconverting || this.selectedRows.length === 0) return;

    const ids = this.selectedRows.map(r => r.id);
    console.log('Reconverting HLS for episodes:', ids, this.selectedRows);

    const confirmed = confirm(`Trigger HLS reconversion for ${ids.length} episode(s)?`);
    if (!confirmed) return;

    const baseUrl = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net`;
    const url = `${baseUrl}/reconvertEpisodesHLS?ids=${encodeURIComponent(ids.join(','))}`;

    this.reconverting = true;
    this.http.get(url).subscribe({
      next: (res) => {
        console.log('reconvertEpisodesHLS response:', res);
        this.reconverting = false;
        this.selectedRows = [];
      },
      error: (err) => {
        console.log('reconvertEpisodesHLS error:', err);
        this.reconverting = false;
      },
    });
  }
}
