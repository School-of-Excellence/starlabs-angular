import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, Firestore, orderBy, query } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';
import { Router } from '@angular/router';
import { AddEpisodeComponent } from './add-episode/add-episode.component';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { AuthguardService } from '../../authguard.service';

type ChipFilter = 'all' | 'hlspending' | 'nosrt';

@Component({
  selector: 'app-episodes-dashboard',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    CommonModule,
    MatIconModule,
    FormsModule,
    MatSortModule
  ],
  templateUrl: './episodes-dashboard.component.html',
  styleUrls: ['./episodes-dashboard.component.css']
})
export class EpisodesDashboardComponent {
  displayedColumns: string[] = ['Title', 'Duration', 'added', 'convertedtohls', 'srt', 'videosize', 'imagesize', 'actions'];
  dataSource = new MatTableDataSource();

  @ViewChild(MatPaginator) paginator: MatPaginator | any;
  @ViewChild(MatSort) sort: MatSort | any;

  mapTaxonomy: { [key: string]: string } = {};

  searchText = '';
  activeChip: ChipFilter = 'all';
  stats = { total: 0, sizeBytes: 0, hlsPct: 0, hlsPending: 0, srtPct: 0, srtMissing: 0 };

  private subscription = new Subject<void>();

  constructor(
    public dialog: MatDialog,
    private firestore: Firestore,
    public authguard: AuthguardService,
    private router: Router,
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
          case 'Duration': return item.duration ?? 0;
          case 'added': return item.date?.toDate().getTime() ?? 0;
          case 'srt': return item.srt ? 1 : 0;
          case 'videosize': return item.videoSizeBytes ?? 0;
          case 'imagesize': return item.imagesize ?? 0;
        }
      };
      this.dataSource.filterPredicate = (row: any) => this.matchesFilters(row);
      this.computeStats(snapshotData);
      this.refreshFilter();
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

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  private computeStats(rows: any[]): void {
    const total = rows.length;
    const sizeBytes = rows.reduce((s, r) => s + (r.videoSizeBytes ?? 0) + (r.imagesize ?? 0), 0);
    const hlsDone = rows.filter(r => r.convertedtohls).length;
    const srtDone = rows.filter(r => r.srt).length;
    this.stats = {
      total,
      sizeBytes,
      hlsPct: total ? Math.round(hlsDone / total * 100) : 0,
      hlsPending: total - hlsDone,
      srtPct: total ? Math.round(srtDone / total * 100) : 0,
      srtMissing: total - srtDone,
    };
  }

  private matchesFilters(row: any): boolean {
    const text = this.searchText.trim().toLowerCase();
    const matchesText = !text
      || (row.title ?? '').toLowerCase().includes(text)
      || (row.reftitle ?? '').toLowerCase().includes(text);
    const matchesChip = this.activeChip === 'all'
      || (this.activeChip === 'hlspending' && !row.convertedtohls)
      || (this.activeChip === 'nosrt' && !row.srt);
    return matchesText && matchesChip;
  }

  refreshFilter(): void {
    // MatTableDataSource skips the predicate on an empty filter string, so feed
    // it a composite key whenever any filter is active
    this.dataSource.filter = (!this.searchText.trim() && this.activeChip === 'all')
      ? '' : `${this.activeChip}::${this.searchText.trim().toLowerCase()}`;
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  setChip(chip: ChipFilter): void {
    this.activeChip = chip;
    this.refreshFilter();
  }

  fmtSize(bytes: number | null | undefined, kbBelowMb = false): string {
    if (!bytes && bytes !== 0) return '—';
    const GB = 1024 * 1024 * 1024, MB = 1024 * 1024;
    if (bytes >= GB) return (bytes / GB).toFixed(2) + ' GB';
    if (bytes >= MB) return (bytes / MB).toFixed(kbBelowMb ? 2 : 1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  openUploadStudio(): void {
    const base = this.router.url.startsWith('/content-upload-v2') ? '/content-upload-v2/videodashboard' : '/videodashboard';
    this.router.navigate([base + '/upload']);
  }

  openEditInStudio(row: any): void {
    const base = this.router.url.startsWith('/content-upload-v2') ? '/content-upload-v2/videodashboard' : '/videodashboard';
    this.router.navigate([base + '/upload'], { queryParams: { edit: row.id } });
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
}
