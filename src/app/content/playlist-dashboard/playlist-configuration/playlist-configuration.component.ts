import { SelectionModel } from '@angular/cdk/collections';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, Inject, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, doc, Firestore, getDocs, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { DomSanitizer } from '@angular/platform-browser';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage } from '@angular/fire/storage';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';

@Component({
  selector: 'app-playlist-configuration',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatIconModule,
    MatPaginatorModule,
    MatChipsModule,
    MatTableModule,
    MatSortModule,
    FormsModule,
    MatCheckboxModule,
    CdkDropList,  
    CdkDrag,
    MatButtonModule,
    MatDialogModule,
  ],
  templateUrl: './playlist-configuration.component.html',
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css'],
})
export class PlaylistConfigurationComponent {
  displayedColumns: string[] = ['Select', 'Audio', 'Name', 'tags'];
  dataSource = new MatTableDataSource();
  audioList: any[] = [];

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

  // selection = new SelectionModel<any>(true, []);
  selection = new SelectionModel<any>(true, [], true, (a, b) => a.id === b.id);
  selectedRows: any[] = [];
  rearrangedSequence: any[] = [];
  crossmatch: boolean | undefined;
  crossmatcherrormessage: string | boolean = '';
  tabledata: any[] = [];
  playlistName: any;
  description: any;
  isPrivate: boolean = false;
  isEditMode: boolean = false;
  docId: string = null;
  playlistReceivedDoc: any = null;
  mapAudio: any = {};
  private audioLoaded = false;
  private pendingPatchRefs: any[] = [];
  tags: any[] = [];
  mapTaxonomy: any = {};
  taxonomyList: any[] = [];
  filteredTaxonomyList: any[] = [];
  private subscription = new Subject<void>();
  imageUrl: any;
  imageFile: File | null = null;
  currentImageUrl: string | null = null;

  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private domSanitizer: DomSanitizer,
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<PlaylistConfigurationComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.docId = this.data?.id || null;
    this.isEditMode = this.docId != null;

    const solarVoiceAudioRef = collection(this.firestore, 'solar voice audios');
    const solarVoicePlaylistRef = collection(this.firestore, 'solar voice playlist');
      collectionSnapshots(solarVoiceAudioRef)
        .pipe(takeUntil(this.subscription))
        .subscribe((snapshot) => {
          this.audioList = snapshot.map((d) => {
            const data = { id: d.id, ...d.data() };
            this.mapAudio[data['id']] = data;
            return data;
          });
          this.dataSource.data = this.audioList;
          this.audioLoaded = true;
          if (this.isEditMode && this.pendingPatchRefs.length > 0) {
            this.patchSelection(this.pendingPatchRefs);
            this.pendingPatchRefs = [];
          }
          if (this.rearrangedSequence.length > 0) {
            this.rearrangedSequence = this.rearrangedSequence.map((r) => {
              const fresh = this.audioList.find((a) => a.id === r.id);
              return fresh ? { ...fresh } : r;
            });
            this.selectedRows = [...this.selection.selected];
          }
        });
    // collectionSnapshots(solarVoiceAudioRef)
    //   .pipe(takeUntil(this.subscription))
    //   .subscribe((snapshot) => {
    //     this.audioList = snapshot.map((d) => {
    //       const data = { id: d.id, ...d.data() };
    //       this.mapAudio[data['id']] = data;
    //       return data;
    //     });
    //     this.dataSource.data = this.audioList;
    //     this.audioLoaded = true;
    //     if (this.isEditMode && this.pendingPatchRefs.length > 0) {
    //       this.patchSelection(this.pendingPatchRefs);
    //       this.pendingPatchRefs = [];
    //     }
    //   });

    getDocs(solarVoicePlaylistRef).then((res) => {
      for (let i = 0; i < res.docs.length; i++) {
        this.tabledata.push(res.docs[i].data());
        if (this.isEditMode && res.docs[i].id === this.docId) {
          this.playlistReceivedDoc = res.docs[i].data();
          this.playlistName = this.playlistReceivedDoc['name'];
          this.description = this.playlistReceivedDoc['description'];
          this.isPrivate = this.playlistReceivedDoc['private'] ?? false;
          this.tags = this.playlistReceivedDoc['tags'] ?? [];
          this.currentImageUrl = this.playlistReceivedDoc['imageurl'] ?? null;
          this.imageUrl = this.currentImageUrl;
          const audioRefs = this.playlistReceivedDoc['sequence'] || [];
          if (this.audioLoaded) {
            this.patchSelection(audioRefs);
          } else {
            this.pendingPatchRefs = audioRefs;
          }
          this.filteredTaxonomyList = this.taxonomyList.filter((e) => !this.tags.includes(e.id));
        }
      }
    });

    const atcTaxonomyRef = collection(this.firestore, 'atc taxonomy');
    collectionSnapshots(atcTaxonomyRef)
      .pipe(takeUntil(this.subscription))
      .subscribe((snap) => {
        const snapshot = snap.map((d) => ({ id: d.id, ...d.data() }));
        this.taxonomyList = snapshot;
        for (const element of snapshot) {
          this.mapTaxonomy[element['id']] = element['name'];
        }
        this.filteredTaxonomyList = this.isEditMode
          ? this.taxonomyList.filter((e) => !this.tags.includes(e.id))
          : this.taxonomyList;
      });
  }

  private patchSelection(audioRefs: any[]) {
    const audioDocData: any[] = [];
    for (let j = 0; j < audioRefs.length; j++) {
      const refId = audioRefs[j].id;
      const found = this.audioList.find((a) => a.id === refId);
      if (found) {
        audioDocData.push(found);
      }
    }
    if (audioDocData.length > 0) {
      this.selection.clear();
      this.selection.select(...audioDocData);
      this.selectedRows = [...audioDocData];
      this.rearrangedSequence = audioDocData.map((e) => ({ ...e }));
    }
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  isAllSelected() {
    return this.selection.selected.length === this.dataSource.data.length;
  }

  masterToggle() {
    if (this.isAllSelected()) {
      this.selection.clear();
      this.selectedRows = [];
      this.rearrangedSequence = [];
    } else {
      this.dataSource.data.forEach((row) => this.selection.select(row));
      this.selectedRows = [...this.selection.selected];
      this.rearrangedSequence = this.selection.selected.map((e) => ({ ...e }));
    }
  }

  updateSelectedRows(_event: any) {
    this.selectedRows = [...this.selection.selected];
    const currentIds = new Set(this.rearrangedSequence.map((r) => r.id));
    const selectedIds = new Set(this.selection.selected.map((s) => s.id));
    this.rearrangedSequence = this.rearrangedSequence.filter((r) => selectedIds.has(r.id));
    for (const sel of this.selection.selected) {
      if (!currentIds.has(sel.id)) {
        this.rearrangedSequence.push({ ...sel });
      }
    }
  }

  drop(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.rearrangedSequence, event.previousIndex, event.currentIndex);
  }

  getPreviewList() {
    return this.rearrangedSequence;
  }

  async onSubmit() {
    const playlistRefs = [];
    const previewList = this.getPreviewList();
    for (let i = 0; i < previewList.length; i++) {
      const audioDocRef = doc(this.firestore, 'solar voice audios', previewList[i]['id']);
      playlistRefs.push(audioDocRef);
    }

    let imageurl = this.currentImageUrl || null;

    if (this.imageFile) {
      const loadingRef = this.dialog.open(LoadingProgressComponent, {
        data: { msg: 'Uploading please wait....' },
        disableClose: true,
      });
      try {
        const filePath = `solar voice images/${Date.now()}_${this.imageFile.name}`;
        const imageRef = ref(this.storage, filePath);
        await uploadBytes(imageRef, this.imageFile);
        imageurl = await getDownloadURL(imageRef);
        if (this.currentImageUrl) {
          const oldImageRef = ref(this.storage, this.currentImageUrl);
          await deleteObject(oldImageRef).catch(() => {});
        }
      } catch (error) {
        console.error('Image upload failed:', error);
      } finally {
        loadingRef.close();
      }
    }

    if (this.isEditMode) {
      const playlistDocRef = doc(this.firestore, 'solar voice playlist', this.docId);
      await setDoc(playlistDocRef, {
        id: this.docId,
        name: this.playlistName,
        description: this.description,
        sequence: playlistRefs,
        date: serverTimestamp(),
        private: this.isPrivate,
        tags: this.tags,
        imageurl: imageurl,
      })
        .then(() => {
          console.log('Playlist updated');
          this.dialogRef.close(true);
        })
        .catch((err) => console.error(err));
    } else {
      const playlistCollectionRef = collection(this.firestore, 'solar voice playlist');
      const newDocRef = doc(playlistCollectionRef);
      const id = newDocRef.id;
      await setDoc(newDocRef, {
        id: id,
        name: this.playlistName,
        description: this.description,
        sequence: playlistRefs,
        date: new Date(),
        private: this.isPrivate,
        tags: this.tags,
        imageurl: imageurl,
      })
        .then(() => {
          console.log('Playlist created');
          this.dialogRef.close(true);
        })
        .catch((err) => console.error(err));
    }
  }

  onselect() {
    const name = this.playlistName;
    const isDuplicate = this.tabledata.some(
      (e) => e.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (
      this.isEditMode &&
      this.playlistReceivedDoc?.name?.trim().toLowerCase() === name.trim().toLowerCase()
    ) {
      this.crossmatch = false;
      this.crossmatcherrormessage = '';
      return;
    }
    this.crossmatch = isDuplicate;
    this.crossmatcherrormessage = isDuplicate ? 'Given name already exists' : '';
  }

  ApplyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  onTagSearch(event: any) {
    const value = ![null, undefined, ''].includes(event.target.value)
      ? event.target.value.trim().toLowerCase()
      : '';
    this.filteredTaxonomyList = this.taxonomyList.filter(
      (e) => e['name'].toLowerCase().indexOf(value) === 0
    );
  }

  onTagSelect(tagid: string) {
    this.tags.push(tagid);
    this.filteredTaxonomyList = this.taxonomyList.filter((e) => !this.tags.includes(e.id));
  }

  onTagRemove(index: number) {
    this.tags.splice(index, 1);
    this.filteredTaxonomyList = this.taxonomyList.filter((e) => !this.tags.includes(e.id));
  }

  previewImage(event: any) {
    this.imageFile = event.target.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(this.imageFile);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.imageUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
      }
    };
  }

  removeImage() {
    this.imageFile = null;
    this.imageUrl = null;
    this.currentImageUrl = null;
  }

  onClose() {
    this.dialogRef.close(false);
  }
}