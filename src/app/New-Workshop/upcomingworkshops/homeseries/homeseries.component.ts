import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

interface EpisodeOption {
  id: string;
  title: string;
}

@Component({
  selector: 'app-homeseries',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    DragDropModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './homeseries.component.html',
  styleUrl: './homeseries.component.css'
})
export class HomeseriesComponent implements OnInit {
  form: FormGroup;
  isSaving = false;
  isEditMode = false;
  loadingEpisodes = true;
  private docId: string | null = null;

  episodes: EpisodeOption[] = [];
  episodeSearch = '';
  private episodeTitleMap: Record<string, string> = {};

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<HomeseriesComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      selectedEpisodes: [[] as string[]],
      homeseries: this.fb.array([])
    });
  }

  get homeseries(): FormArray {
    return this.form.get('homeseries') as FormArray;
  }

  get selectedEpisodesControl() {
    return this.form.get('selectedEpisodes');
  }

  async ngOnInit(): Promise<void> {
    // Load episode titles for the searchable multi-select.
    try {
      const ref = collection(this.firestore, 'episodes');
      const rows = (await firstValueFrom(collectionData(ref, { idField: 'id' }))) as any[];
      this.episodes = rows
        .map(r => ({ id: r.id, title: (r.title || '').toString() }))
        .filter(e => e.title)
        .sort((a, b) => a.title.localeCompare(b.title));
      this.episodeTitleMap = {};
      this.episodes.forEach(e => (this.episodeTitleMap[e.id] = e.title));
    } catch (err) {
      console.error('Error loading episodes:', err);
    } finally {
      this.loadingEpisodes = false;
    }

    // Edit mode: hydrate overall title + per-episode rows.
    if (this.data?.mode === 'edit' && this.data?.series) {
      this.isEditMode = true;
      const s = this.data.series;
      this.docId = s.docid || s.id || null;
      const arr: any[] = Array.isArray(s.homeseries) ? s.homeseries : [];
      const ids: string[] = [];
      arr.forEach(item => {
        const epId = item?.episoderef?.id || item?.episoderef?._key?.path?.segments?.slice(-1)[0] || '';
        if (epId) ids.push(epId);
        this.homeseries.push(this.makeGroup(epId, item?.title, item?.footer, item?.headtag, item?.subtitle));
      });
      this.form.patchValue({ title: s.title || '', selectedEpisodes: ids });
    }
  }

  filteredEpisodes(): EpisodeOption[] {
    const term = (this.episodeSearch || '').toLowerCase().trim();
    if (!term) return this.episodes;
    return this.episodes.filter(e => e.title.toLowerCase().includes(term));
  }

  episodeTitle(id: string): string {
    return this.episodeTitleMap[id] || id;
  }

  private makeGroup(episodeId: string, title = '', footer = '', headtag = '', subtitle = ''): FormGroup {
    return this.fb.group({
      episodeId: [episodeId],
      title: [title || ''],
      footer: [footer || ''],
      headtag: [headtag || ''],
      subtitle: [subtitle || '']
    });
  }

  // Keep one input-group per selected episode, preserving already-entered values.
  onEpisodesChange(ids: string[]): void {
    const selected = ids || [];

    // Remove groups whose episode was deselected.
    for (let i = this.homeseries.length - 1; i >= 0; i--) {
      const epId = this.homeseries.at(i).get('episodeId')?.value;
      if (!selected.includes(epId)) {
        this.homeseries.removeAt(i);
      }
    }

    // Add groups for newly selected episodes (prefill title with episode title).
    const existingIds = this.homeseries.controls.map(c => c.get('episodeId')?.value);
    selected.forEach(id => {
      if (!existingIds.includes(id)) {
        this.homeseries.push(this.makeGroup(id, this.episodeTitle(id)));
      }
    });
  }

  // Remove a single episode card and keep the select value in sync.
  removeEpisode(index: number): void {
    if (index < 0 || index >= this.homeseries.length) return;
    this.homeseries.removeAt(index);
    this.syncSelectedFromArray();
  }

  // Drag-and-drop reorder — this is the stored array order.
  dropEpisode(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const ctrl = this.homeseries.at(event.previousIndex);
    this.homeseries.removeAt(event.previousIndex);
    this.homeseries.insert(event.currentIndex, ctrl);
    this.syncSelectedFromArray();
  }

  // Mirror the current card order/selection back onto the multi-select control.
  private syncSelectedFromArray(): void {
    const ids = this.homeseries.controls.map(c => c.get('episodeId')?.value);
    this.selectedEpisodesControl?.setValue(ids, { emitEvent: false });
  }

  async save(): Promise<void> {
    if (this.isSaving) return;
    if (this.form.get('title')?.invalid) {
      this.form.get('title')?.markAsTouched();
      this.snackBar.open('Please enter a title.', 'Close', { duration: 3000 });
      return;
    }
    if (this.homeseries.length === 0) {
      this.snackBar.open('Please select at least one episode.', 'Close', { duration: 3000 });
      return;
    }

    this.isSaving = true;

    const homeseries = this.homeseries.controls.map(c => {
      const v = c.value;
      return {
        title: (v.title || '').trim(),
        footer: (v.footer || '').trim(),
        headtag: (v.headtag || '').trim(),
        subtitle: (v.subtitle || '').trim(),
        episoderef: doc(this.firestore, 'episodes', v.episodeId)
      };
    });

    const payload: any = {
      title: (this.form.get('title')?.value || '').trim(),
      homeseries
    };

    try {
      if (this.isEditMode && this.docId) {
        const ref = doc(this.firestore, 'eiflixhomeseries', this.docId);
        await updateDoc(ref, payload);
      } else {
        const ref = doc(collection(this.firestore, 'eiflixhomeseries'));
        await setDoc(ref, {
          ...payload,
          docid: ref.id,
          created: serverTimestamp()
        });
      }
      this.snackBar.open('Home series saved.', 'Close', { duration: 2000 });
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving home series:', error);
      this.snackBar.open('Error saving. Please try again.', 'Close', { duration: 3000 });
      this.isSaving = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
