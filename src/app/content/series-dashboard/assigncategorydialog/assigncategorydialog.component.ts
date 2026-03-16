import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  collection,
  collectionSnapshots,
  doc,
  DocumentReference,
  Firestore,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-assign-category-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    MatChipsModule,
    CdkDropList,
    CdkDrag,
  ],
  templateUrl: './assigncategorydialog.component.html',
  styleUrls: ['../../../content-upload-version2/content-upload-shared.css'],
})
export class AssignCategoryDialogComponent {
  selectedCategoryId: string = '';
  categoryName: string = '';
  newCategoryName: string = '';
  isCategoryLocked: boolean = false;
  allCategories: any[] = [];
  duplicateError: boolean = false;
  allSeriesList: any[] = [];
  filteredSeriesList: any[] = [];
  seriesMap: { [id: string]: any } = {};

  selectedSeriesIds: string[] = [];
  originalSeriesIds: string[] = [];

  saving = false;
  private subscription = new Subject<void>();

  constructor(
    private firestore: Firestore,
    private dialogRef: MatDialogRef<AssignCategoryDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      categoryId: string | null;
      categoryName: string | null;
      allCategories: any[];
    }
  ) {
    this.allCategories = data.allCategories || [];
    if (data.categoryId) {
      this.selectedCategoryId = data.categoryId;
      this.categoryName = data.categoryName || '';
      this.isCategoryLocked = true;
    }
    const seriesRef = collection(this.firestore, 'series');
    collectionSnapshots(seriesRef)
      .pipe(takeUntil(this.subscription))
      .subscribe((snapshot) => {
        this.allSeriesList = snapshot.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        for (const s of this.allSeriesList) {
          this.seriesMap[s.id] = s;
        }
        this.filteredSeriesList = [...this.allSeriesList];
        if (this.selectedCategoryId) {
          this.loadSequenceForCategory(this.selectedCategoryId);
        }
      });
  }

  ngOnDestroy() {
    this.subscription.next();
    this.subscription.complete();
  }
  private async loadSequenceForCategory(categoryId: string) {
    try {
      const catDocRef = doc(this.firestore, 'category', categoryId);
      const catSnap = await getDoc(catDocRef);

      if (catSnap.exists()) {
        const sequenceRefs: any[] = catSnap.data()?.['sequence'] || [];
        const assignedIds: string[] = [];

        for (const ref of sequenceRefs) {
          if (ref && ref instanceof DocumentReference) {
            assignedIds.push(ref.id);
          }
        }

        // this.selectedSeriesIds = [...assignedIds];
        // this.originalSeriesIds = [...assignedIds];
        this.selectedSeriesIds = [...assignedIds];
        this.originalSeriesIds = [...assignedIds];
        this.originalOrder = [...assignedIds];
      }
    } catch (err) {
      console.error('Error loading sequence:', err);
    }
  }
  onCategoryNameType() {
    const typed = this.newCategoryName.trim().toLowerCase();
    if (!typed) {
      this.duplicateError = false;
      return;
    }
    this.duplicateError = this.allCategories.some(
      (c) => (c['category'] || c['name'] || '').trim().toLowerCase() === typed
    );
  }

  onSeriesSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim().toLowerCase();
    if (!value) {
      this.filteredSeriesList = [...this.allSeriesList];
      return;
    }
    const filtered = this.allSeriesList.filter((s) =>
      (s.seriesName || '').toLowerCase().includes(value)
    );
    const selectedSeries = this.allSeriesList.filter((s) =>
      this.selectedSeriesIds.includes(s.id)
    );
    const combinedMap = new Map<string, any>();
    [...filtered, ...selectedSeries].forEach((s) => {
      combinedMap.set(s.id, s);
    });
    this.filteredSeriesList = Array.from(combinedMap.values());
  }
  originalOrder: string[] = [];
  onSelectionChange() {
    const existingOrder = this.selectedSeriesIds.filter(id => this.selectedSeriesIds.includes(id));
    const previousSet = new Set(this.originalOrder || []);
    const newIds = this.selectedSeriesIds.filter(id => !previousSet.has(id));
    const kept = (this.originalOrder || []).filter(id => this.selectedSeriesIds.includes(id));
    this.selectedSeriesIds = [...kept, ...newIds];
    this.originalOrder = [...this.selectedSeriesIds];
  }
  removeSeries(id: string) {
    this.selectedSeriesIds = this.selectedSeriesIds.filter((sid) => sid !== id);
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.selectedSeriesIds, event.previousIndex, event.currentIndex);
  }
  async onSave() {
    this.saving = true;

    try {
      const sequenceRefs: DocumentReference[] = this.selectedSeriesIds.map((id) =>
        doc(this.firestore, 'series', id)
      );

      if (this.isCategoryLocked) {
        const catDocRef = doc(this.firestore, 'category', this.selectedCategoryId);
        await updateDoc(catDocRef, { sequence: sequenceRefs });
      } else {
        const categoryCollectionRef = collection(this.firestore, 'category');
        const newDocRef = doc(categoryCollectionRef);
        const id = newDocRef.id;

        await setDoc(newDocRef, {
          id: id,
          category: this.newCategoryName.trim(),
          date: serverTimestamp(),
          sequence: sequenceRefs,
        });
      }
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Error saving:', err);
    } finally {
      this.saving = false;
    }
  }
}