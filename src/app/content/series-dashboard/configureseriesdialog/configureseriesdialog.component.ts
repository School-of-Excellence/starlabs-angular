import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  collection,
  collectionSnapshots,
  doc,
  DocumentReference,
  Firestore,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  arrayUnion,
  serverTimestamp,
} from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage } from '@angular/fire/storage';
import { Subject, takeUntil } from 'rxjs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-configureseriesdialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    CdkDropList,
    CdkDrag,
    MatSlideToggleModule
  ],
  templateUrl: './configureseriesdialog.component.html',
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css'],
})
export class ConfigureseriesdialogComponent {
  isEditMode = false;
  docId: string | null = null;
  seriesReceivedDoc: any = null;
  seriesName = '';
  description = '';
  selectedTier: string[] = [];
  tierList: any[] = [];
  crossmatch = false;
  crossmatcherrormessage = '';
  allSeriesData: any[] = [];
  heroImageFile: File | null = null;
  heroImagePreview: string | ArrayBuffer | null = null;
  existingHeroImageUrl: string | null = null;
  thumbImageFile: File | null = null;
  thumbImagePreview: string | ArrayBuffer | null = null;
  existingThumbImageUrl: string | null = null;
  episodeList: any[] = [];
  filteredEpisodeList: any[] = [];
  mapEpisodes: { [id: string]: any } = {};
  selectedEpisodeIds: string[] = [];
  rearrangedSequence: any[] = [];
  private pendingSequenceRefs: any[] | null = null;
  // freetier = false;
  type: 'free' | 'exclusive' | 'tier' = 'tier';
  saving = false;
  private subscription = new Subject<void>();

  constructor(
    private firestore: Firestore,
    private storage: Storage,
    private dialogRef: MatDialogRef<ConfigureseriesdialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: { seriesId: string | null }
  ) {
    this.docId = data?.seriesId || null;
    this.isEditMode = this.docId != null;
    const episodesRef = collection(this.firestore, 'episodes');
    const episodesQuery = query(episodesRef, orderBy('date', 'desc'));
    collectionSnapshots(episodesQuery)
      .pipe(takeUntil(this.subscription))
      .subscribe((snapshot) => {
        this.episodeList = snapshot.map((d) => {
          const ep = { id: d.id, ...d.data() };
          this.mapEpisodes[ep.id] = ep;
          return ep;
        });
        this.filteredEpisodeList = [...this.episodeList];
        if (this.pendingSequenceRefs) {
          this.patchEpisodeSelection(this.pendingSequenceRefs);
        }
      });
    const tierRef = collection(this.firestore, 'tier');
    getDocs(tierRef).then((res) => {
      this.tierList = res.docs.map((d) => d.data());
    });
    const seriesRef = collection(this.firestore, 'series');
    getDocs(seriesRef).then((res) => {
      this.allSeriesData = res.docs.map((d) => d.data());
      if (this.isEditMode) {
        const found = res.docs.find((d) => d.id === this.docId);
        if (found) {
          this.seriesReceivedDoc = found.data();
          this.seriesName = this.seriesReceivedDoc['seriesName'] || '';
          this.description = this.seriesReceivedDoc['description'] || '';
          this.existingHeroImageUrl = this.seriesReceivedDoc['heroImageUrl'] || null;
          this.existingThumbImageUrl = this.seriesReceivedDoc['imageUrl'] || null;
          this.type = this.seriesReceivedDoc['type'] || 'tier';
          // const tierRefs: any[] = this.seriesReceivedDoc['tier'] || [];
          if (this.type === 'tier') {
            const tierRefs: any[] = this.seriesReceivedDoc['tier'] || [];
            this.selectedTier = tierRefs.map((t: any) =>
              t instanceof DocumentReference ? t.id : t
            );
          } else {
            this.selectedTier = [];
          }
          // this.selectedTier = tierRefs.map((t: any) =>
          //   t instanceof DocumentReference ? t.id : t
          // );
          const sequenceRefs: any[] = this.seriesReceivedDoc['sequence'] || [];
          this.pendingSequenceRefs = sequenceRefs;
          if (this.episodeList.length > 0) {
            this.patchEpisodeSelection(sequenceRefs);
          }
        }
      }
    });
  }

  ngOnDestroy() {
    this.subscription.next();
    this.subscription.complete();
  }
  ontypeChange() {
    if (this.type !== 'tier') {
      this.selectedTier = [];
    }
  }
  private patchEpisodeSelection(sequenceRefs: any[]) {
    const ids: string[] = [];
    const orderedEpisodes: any[] = [];

    for (const seqRef of sequenceRefs) {
      const refId = seqRef instanceof DocumentReference ? seqRef.id : seqRef?.id;
      if (refId && this.mapEpisodes[refId]) {
        ids.push(refId);
        orderedEpisodes.push({ ...this.mapEpisodes[refId] });
      }
    }

    this.selectedEpisodeIds = ids;
    this.rearrangedSequence = orderedEpisodes;
  }

  onNameCheck() {
    const name = (this.seriesName || '').trim().toLowerCase();
    if (!name) {
      this.crossmatch = false;
      return;
    }
    if (
      this.isEditMode &&
      this.seriesReceivedDoc?.seriesName?.trim().toLowerCase() === name
    ) {
      this.crossmatch = false;
      this.crossmatcherrormessage = '';
      return;
    }
    const isDuplicate = this.allSeriesData.some(
      (s) => (s.seriesName || '').trim().toLowerCase() === name
    );
    this.crossmatch = isDuplicate;
    this.crossmatcherrormessage = isDuplicate ? 'Series name already exists' : '';
  }

  onHeroImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.heroImageFile = input.files[0];
    const reader = new FileReader();
    reader.onload = () => (this.heroImagePreview = reader.result);
    reader.readAsDataURL(this.heroImageFile);
  }

  removeHeroImage() {
    this.heroImageFile = null;
    this.heroImagePreview = null;
    this.existingHeroImageUrl = null;
  }

  onThumbImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.thumbImageFile = input.files[0];
    const reader = new FileReader();
    reader.onload = () => (this.thumbImagePreview = reader.result);
    reader.readAsDataURL(this.thumbImageFile);
  }

  removeThumbImage() {
    this.thumbImageFile = null;
    this.thumbImagePreview = null;
    this.existingThumbImageUrl = null;
  }
  // onEpisodeSearch(event: Event) {
  //   const value = (event.target as HTMLInputElement).value.trim().toLowerCase();
  //   if (!value) {
  //     this.filteredEpisodeList = [...this.episodeList];
  //   } else {
  //     this.filteredEpisodeList = this.episodeList.filter((ep) =>
  //       (ep.title || '').toLowerCase().includes(value)
  //     );
  //   }
  // }
  onEpisodeSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim().toLowerCase();
    if (!value) {
      this.filteredEpisodeList = [...this.episodeList];
      return;
    }
    const filtered = this.episodeList.filter((ep) =>
      (ep.title || '').toLowerCase().includes(value)
    );
    const selectedEpisodes = this.episodeList.filter((ep) =>
      this.selectedEpisodeIds.includes(ep.id)
    );
    const combinedMap = new Map<string, any>();
    [...filtered, ...selectedEpisodes].forEach((ep) => {
      combinedMap.set(ep.id, ep);
    });
    this.filteredEpisodeList = Array.from(combinedMap.values());
  }
  onEpisodeSelectionChange() {
    const currentIds = new Set(this.rearrangedSequence.map((r) => r.id));
    const selectedSet = new Set(this.selectedEpisodeIds);
    this.rearrangedSequence = this.rearrangedSequence.filter((r) => selectedSet.has(r.id));
    for (const id of this.selectedEpisodeIds) {
      if (!currentIds.has(id) && this.mapEpisodes[id]) {
        this.rearrangedSequence.push({ ...this.mapEpisodes[id] });
      }
    }
  }
  removeFromSequence(id: string) {
    this.selectedEpisodeIds = this.selectedEpisodeIds.filter((eid) => eid !== id);
    this.rearrangedSequence = this.rearrangedSequence.filter((r) => r.id !== id);
  }
  drop(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.rearrangedSequence, event.previousIndex, event.currentIndex);
  }
  async onSubmit() {
    this.saving = true;
    try {
      const sequenceRefs: DocumentReference[] = this.rearrangedSequence.map((ep) =>
        doc(this.firestore, 'episodes', ep.id)
      );
      let tierRefs: DocumentReference[] | null = null;

      if (this.type === 'tier') {
        tierRefs = this.selectedTier.map((tid) =>
          doc(this.firestore, 'tier', tid)
        );
      }
      // const tierRefs: DocumentReference[] = this.selectedTier.map((tid) =>
      //   doc(this.firestore, 'tier', tid)
      // );
      let imageUrl = this.existingThumbImageUrl;
      let heroImageUrl = this.existingHeroImageUrl;
      if (this.thumbImageFile) {
        const thumbRef = ref(this.storage, `images/${Date.now()}_${this.thumbImageFile.name}`);
        const thumbSnap = await uploadBytes(thumbRef, this.thumbImageFile);
        imageUrl = await getDownloadURL(thumbSnap.ref);
        if (this.isEditMode && this.seriesReceivedDoc?.['imageUrl']) {
          try {
            await deleteObject(ref(this.storage, this.seriesReceivedDoc['imageUrl']));
          } catch (e) {
            console.warn('Failed to delete old thumbnail:', e);
          }
        }
      }

      if (this.heroImageFile) {
        const heroRef = ref(this.storage, `images/${Date.now()}_${this.heroImageFile.name}`);
        const heroSnap = await uploadBytes(heroRef, this.heroImageFile);
        heroImageUrl = await getDownloadURL(heroSnap.ref);
        if (this.isEditMode && this.seriesReceivedDoc?.['heroImageUrl']) {
          try {
            await deleteObject(ref(this.storage, this.seriesReceivedDoc['heroImageUrl']));
          } catch (e) {
            console.warn('Failed to delete old hero image:', e);
          }
        }
      }

      if (this.isEditMode) {
        const seriesDocRef = doc(this.firestore, 'series', this.docId!);
        const updateData: any = {
          seriesName: this.seriesName,
          description: this.description,
          type: this.type,
          sequence: sequenceRefs,
          updateddate: new Date(),
        };
        if (this.type === 'tier') {
          updateData.tier = tierRefs;
        } else {
          updateData.tier = [];
        }
        if (imageUrl) updateData.imageUrl = imageUrl;
        if (heroImageUrl) updateData.heroImageUrl = heroImageUrl;

        await updateDoc(seriesDocRef, updateData);
      } else {
        const seriesCollectionRef = collection(this.firestore, 'series');
        const newDocRef = doc(seriesCollectionRef);
        const id = newDocRef.id;
        const batch = writeBatch(this.firestore);
        batch.set(newDocRef, {
          id: id,
          seriesName: this.seriesName,
          description: this.description,
          type: this.type,
          tier: this.type === 'tier' ? tierRefs : [],
          sequence: sequenceRefs,
          imageUrl: imageUrl,
          heroImageUrl: heroImageUrl,
          order: 1,
          date: new Date(),
        });
        sequenceRefs.forEach((epRef) => {
          batch.update(epRef, {
            series: arrayUnion(newDocRef),
          });
        });
        await batch.commit();
      }
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Error saving series:', err);
    } finally {
      this.saving = false;
    }
  }
}