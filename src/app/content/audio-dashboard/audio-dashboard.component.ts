import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, Firestore, getDocs } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { Storage, UploadTask } from '@angular/fire/storage';
import { AddAudioComponent } from './add-audio/add-audio.component';
import { Subject, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-audio-dashboard',
  imports: [
    MatFormFieldModule,
    MatTableModule,
    CommonModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    FormsModule,
  ],
  templateUrl: './audio-dashboard.component.html',
  styleUrls: ['../../content-upload-version2/content-upload-shared.css', './audio-dashboard.component.css']
})
export class AudioDashboardComponent {

  title = 'solar-voice-webapp';
  pageTitle = 'audio-dashboard';
  userRole: any;

  displayedColumns: string[] = ['thumbnail', 'name', 'date', 'size', 'duration', 'playlists', 'tags', 'actions'];
  dataSource: MatTableDataSource<any> = new MatTableDataSource();

  private _paginator!: MatPaginator;
  private _sort!: MatSort;

  @ViewChild(MatPaginator) set paginator(p: MatPaginator) {
    this._paginator = p;
    if (p) this.dataSource.paginator = p;
  }
  @ViewChild(MatSort) set sort(s: MatSort) {
    this._sort = s;
    if (s) this.dataSource.sort = s;
  }

  private destroy$ = new Subject<void>();

  audiolist: any[] = [];
  allAudioList: any[] = [];
  file!: File;
  task!: UploadTask;
  fileName: any;
  tabledata: any[] = [];
  isUploading = false;
  mapTaxonomy: { [key: string]: string } = {};
  availableTags: { id: string; name: string }[] = [];
  audioSizeCache: { [url: string]: string } = {};
  activeTagFilters: string[] = [];
  dateSortDirection: 'asc' | 'desc' = 'desc';
  tagSelectOpen = false;
  currentlyPlaying: string | null = null;
  downloadingIds = new Set<string>();
  downloadProgress: { [id: string]: number } = {};
  private activeAudio: HTMLAudioElement | null = null;
  playerRow: any = null;
  playerProgress = 0;
  playerCurrentTime = 0;
  playerDuration = 0;
  playerIsPlaying = false;
  private animFrameId: any = null;

  // Playlist mapping: audioId -> playlist names[]
  audioPlaylistMap: { [audioId: string]: string[] } = {};

  constructor(
    private firestore: Firestore,
    public dialog: MatDialog,
    private router: Router,
    private storage: Storage
  ) {
    this.isUploading = true;

    const audiosRef = collection(this.firestore, 'solar voice audios');
    collectionSnapshots(audiosRef)
      .pipe(takeUntil(this.destroy$))
      .subscribe(snap => {
        this.allAudioList = snap.map(d => ({ id: d.id, ...d.data() }));
        this.isUploading = false;
        this.applyFilters();
      });

    const taxRef = collection(this.firestore, 'atc taxonomy');
    getDocs(taxRef).then(snap => {
      this.availableTags = [];
      snap.docs.forEach(d => {
        const data = d.data();
        this.mapTaxonomy[d.id] = data['name'];
        this.availableTags.push({ id: d.id, name: data['name'] });
      });
      this.availableTags.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Load playlists and build audio -> playlist name mapping
    const playlistRef = collection(this.firestore, 'solar voice playlist');
    collectionSnapshots(playlistRef)
      .pipe(takeUntil(this.destroy$))
      .subscribe(snap => {
        const map: { [audioId: string]: string[] } = {};
        snap.forEach(d => {
          const data = d.data();
          const playlistName = data['name'] || 'Unnamed Playlist';
          const sequence: any[] = data['sequence'] || [];
          for (const ref of sequence) {
            const audioId = ref.id || ref;
            if (!map[audioId]) {
              map[audioId] = [];
            }
            if (!map[audioId].includes(playlistName)) {
              map[audioId].push(playlistName);
            }
          }
        });
        this.audioPlaylistMap = map;
      });
  }

  ngOnInit() {}

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopAudio();
    this.stopProgressLoop();
  }

  private applyFilters() {
    let list = [...this.allAudioList];

    if (this.activeTagFilters.length) {
      list = list.filter(a => a.tags?.some((t: string) => this.activeTagFilters.includes(t)));
    }

    list.sort((a, b) => {
      const da = this.ts(a.date), db = this.ts(b.date);
      return this.dateSortDirection === 'asc' ? da - db : db - da;
    });

    this.audiolist = list;
    this.dataSource.data = list;

    setTimeout(() => {
      if (this._paginator) {
        this.dataSource.paginator = this._paginator;
        this._paginator.firstPage();
      }
      if (this._sort) {
        this.dataSource.sort = this._sort;
        this.dataSource.sortingDataAccessor = (item: any, headerSort: string) => {
          switch (headerSort) {
            case 'name':return item.name?. toLocaleLowerCase() ?? '';
            case 'date': return item.date?.toDate().getTime() ?? 0;
            case 'size': return item.sizeBytes ?? 0;
            case 'duration': return item.duration ?? 0;
          }
        };
      }
    });
  }

  ApplyFilter(event: Event) {
    this.dataSource.filter = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }

  filterByTags() { this.applyFilters(); }

  removeTagFilter(id: string) {
    this.activeTagFilters = this.activeTagFilters.filter(t => t !== id);
    this.applyFilters();
  }

  clearTagFilter(e: Event) {
    e.stopPropagation();
    this.activeTagFilters = [];
    this.applyFilters();
  }

  toggleDateSort() {
    this.dateSortDirection = this.dateSortDirection === 'desc' ? 'asc' : 'desc';
    this.applyFilters();
  }

  private ts(d: any): number {
    if (!d) return 0;
    if (typeof d.toMillis === 'function') return d.toMillis();
    if (d.seconds) return d.seconds * 1000;
    return new Date(d).getTime();
  }

  formatDate(d: any): string {
    if (!d) return '—';
    let date: Date;
    if (typeof d.toDate === 'function') date = d.toDate();
    else if (d.seconds) date = new Date(d.seconds * 1000);
    else date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getPlaylistNames(audioId: string): string[] {
    return this.audioPlaylistMap[audioId] || [];
  }

  togglePlay(row: any) {
    const el = document.getElementById('audio-' + row.id) as HTMLAudioElement;
    if (!el) return;

    if (this.currentlyPlaying === row.id) {
      el.pause();
      this.playerIsPlaying = false;
      this.stopProgressLoop();
    } else {
      this.stopAudio();
      this.playerRow = row;
      this.currentlyPlaying = row.id;
      this.activeAudio = el;
      this.playerIsPlaying = true;
      this.playerProgress = 0;
      this.playerCurrentTime = 0;
      this.playerDuration = el.duration || 0;

      el.play().catch(e => console.error('Play error:', e));
      this.startProgressLoop();
    }
  }

  resumePlayer() {
    if (this.activeAudio) {
      this.activeAudio.play().catch(e => console.error('Play error:', e));
      this.playerIsPlaying = true;
      this.startProgressLoop();
    }
  }

  pausePlayer() {
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.playerIsPlaying = false;
      this.stopProgressLoop();
    }
  }

  closePlayer() {
    this.stopAudio();
    this.playerRow = null;
    this.playerIsPlaying = false;
    this.playerProgress = 0;
    this.playerCurrentTime = 0;
    this.playerDuration = 0;
  }

  onPlayerSeek(event: MouseEvent, trackEl: HTMLElement) {
    if (!this.activeAudio) return;
    const rect = trackEl.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    this.activeAudio.currentTime = pct * this.activeAudio.duration;
    this.playerProgress = pct * 100;
    this.playerCurrentTime = this.activeAudio.currentTime;
  }

  onAudioEnded(row: any) {
    if (this.currentlyPlaying === row.id) {
      this.playerIsPlaying = false;
      this.playerProgress = 100;
      this.stopProgressLoop();
    }
  }

  private startProgressLoop() {
    this.stopProgressLoop();
    const update = () => {
      if (this.activeAudio) {
        this.playerCurrentTime = this.activeAudio.currentTime;
        this.playerDuration = this.activeAudio.duration || 0;
        this.playerProgress = this.playerDuration > 0
          ? (this.playerCurrentTime / this.playerDuration) * 100
          : 0;
      }
      this.animFrameId = requestAnimationFrame(update);
    };
    this.animFrameId = requestAnimationFrame(update);
  }

  private stopProgressLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private stopAudio() {
    this.stopProgressLoop();
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.currentTime = 0;
    }
    this.currentlyPlaying = null;
    this.activeAudio = null;
  }

  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
  
  formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '—';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

  openDialog() {
    this.dialog.open(AddAudioComponent, {
      maxHeight: '90vh', width: '600px',
      data: { add: true }
    });
  }

  async downloadAudio(row: any) {
    if (!row?.url || this.downloadingIds.has(row.id)) return;
    this.downloadingIds.add(row.id);
    this.downloadProgress[row.id] = 0;
    try {
      const response = await fetch(row.url);
      if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
      const blob = await this.readBlobWithProgress(response, row.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = this.downloadFileName(row, blob.type);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch (error) {
      console.error('Audio download failed, opening the file directly instead:', error);
      window.open(row.url, '_blank');
    } finally {
      this.downloadingIds.delete(row.id);
      delete this.downloadProgress[row.id];
    }
  }

  // stream the body so 100MB+ files show live % instead of a frozen button
  private async readBlobWithProgress(response: Response, rowId: string): Promise<Blob> {
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !total) return response.blob();
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        this.downloadProgress[rowId] = Math.min(99, Math.floor((received / total) * 100));
      }
    }
    return new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' });
  }

  private downloadFileName(row: any, mimeType: string): string {
    const base = String(row.name || 'audio').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'audio';
    const urlPath = decodeURIComponent(String(row.url).split('?')[0]);
    const extMatch = urlPath.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (extMatch) return `${base}.${extMatch[1].toLowerCase()}`;
    const mimeToExt: { [type: string]: string } = {
      'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
      'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
    };
    return `${base}.${mimeToExt[(mimeType || '').split(';')[0].trim()] || 'mp3'}`;
  }

  onaudioedit(id: any, url: any, name: any, description: any, imageUrl: any, tags: any, hlsurl: any) {
    this.dialog.open(AddAudioComponent, {
      maxHeight: '90vh', width: '600px',
      data: { edit: true, id, url, name, description, hlsurl, imageUrl, tags: tags ?? [] }
    });
  }

  onaudiodelete(id: any, url: any, imageurl: any) {
    this.dialog.open(AddAudioComponent, { width: '400px', data: { delete: true, id, url, imageurl } });
  }

  onnavigate() {
    this.router.navigateByUrl('/audio-dashboard');
    this.pageTitle = 'audio-dashboard';
  }
}