import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

interface ConfigOption {
  key: string;                                  // unique select value
  label: string;                                // shown in the option / trigger
  type: 'comingsoon' | 'ads' | 'masterclass' | 'homeseries';
  id?: string;                                  // eiflixhomeseries doc id
}

@Component({
  selector: 'app-eiflixhomeconfig',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    DragDropModule
  ],
  templateUrl: './eiflixhomeconfig.component.html',
  styleUrl: './eiflixhomeconfig.component.css'
})
export class EiflixHomeConfigComponent implements OnInit {
  form: FormGroup;
  loading = true;
  isSaving = false;

  staticOptions: ConfigOption[] = [
    { key: 'comingsoon', label: 'Coming Soon', type: 'comingsoon' },
    { key: 'ads', label: 'Ads', type: 'ads' },
    { key: 'masterclass', label: 'Masterclass', type: 'masterclass' }
  ];
  seriesOptions: ConfigOption[] = [];
  private optionByKey: Record<string, ConfigOption> = {};

  readonly showToOptions = [
    { value: 'new', label: 'New' },
    { value: 'exist', label: 'Exist' },
    { value: 'both', label: 'Both' }
  ];

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      selected: [[] as string[]],
      items: this.fb.array([])
    });
  }

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get selectedControl() {
    return this.form.get('selected');
  }

  async ngOnInit(): Promise<void> {
    try {
      // Options: static widgets + every eiflixhomeseries title.
      const seriesRef = collection(this.firestore, 'eiflixhomeseries');
      const series = (await firstValueFrom(collectionData(seriesRef, { idField: 'id' }))) as any[];
      this.seriesOptions = series
        .map(s => ({
          key: 'series:' + s.id,
          label: (s.title || 'Untitled series').toString(),
          type: 'homeseries' as const,
          id: s.id
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      this.reindexOptions();

      // Existing config (single document) to prefill.
      const snap = await getDoc(doc(this.firestore, 'classify', 'eiflixwebapp'));
      const homeconfig: any[] = snap.exists() && Array.isArray(snap.data()?.['homeconfig'])
        ? snap.data()!['homeconfig']
        : [];
      this.hydrate(homeconfig);
    } catch (err) {
      console.error('Error loading EiFlix home config:', err);
    } finally {
      this.loading = false;
    }
  }

  private reindexOptions(): void {
    this.optionByKey = {};
    [...this.staticOptions, ...this.seriesOptions].forEach(o => (this.optionByKey[o.key] = o));
  }

  private hydrate(homeconfig: any[]): void {
    const keys: string[] = [];
    homeconfig.forEach(entry => {
      const type = entry?.type || (entry?.seriesref ? 'homeseries' : entry?.value);
      const id = entry?.id || entry?.seriesref?.id || entry?.value;
      const key = type === 'homeseries' ? 'series:' + id : type;

      // If a referenced series option no longer exists, keep it visible.
      if (!this.optionByKey[key]) {
        const opt: ConfigOption = {
          key,
          label: entry?.label || key,
          type: type === 'homeseries' ? 'homeseries' : type,
          id: type === 'homeseries' ? id : undefined
        };
        if (type === 'homeseries') this.seriesOptions.push(opt);
        this.optionByKey[key] = opt;
      }

      keys.push(key);
      this.items.push(this.makeItem(key, entry?.title, entry?.subtitle, entry?.showto, entry?.enabletag, entry?.tags));
    });
    this.selectedControl?.setValue(keys, { emitEvent: false });
  }

  private makeItem(
    key: string, title = '', subtitle = '', showto = 'both',
    enabletag = false, tags: any = []
  ): FormGroup {
    // tags is an array of strings, max 3 (index 0..2). Home Series items only.
    const tagList = (Array.isArray(tags) ? tags : []).slice(0, 3).map((t: any) => (t ?? '').toString());
    return this.fb.group({
      key: [key],
      title: [title || ''],
      subtitle: [subtitle || ''],
      showto: [showto || 'both'],
      enabletag: [!!enabletag],
      tags: this.fb.array(tagList.map(t => this.fb.control(t)))
    });
  }

  // Home Series per-item tag helpers (max 3 tags).
  itemTags(index: number): FormArray {
    return this.items.at(index)?.get('tags') as FormArray;
  }

  addTag(index: number): void {
    const arr = this.itemTags(index);
    if (arr && arr.length < 3) arr.push(this.fb.control(''));
  }

  removeTag(index: number, tagIndex: number): void {
    const arr = this.itemTags(index);
    if (arr && tagIndex >= 0 && tagIndex < arr.length) arr.removeAt(tagIndex);
  }

  optionLabel(key: string): string {
    return this.optionByKey[key]?.label || key;
  }

  optionType(key: string): string {
    return this.optionByKey[key]?.type || '';
  }

  selectedLabels(): string {
    const keys: string[] = this.selectedControl?.value || [];
    return keys.map(k => this.optionLabel(k)).join(', ');
  }

  // Keep one config row per selected option, preserving typed values.
  onSelectedChange(keys: string[]): void {
    const selected = keys || [];

    for (let i = this.items.length - 1; i >= 0; i--) {
      if (!selected.includes(this.items.at(i).get('key')?.value)) {
        this.items.removeAt(i);
      }
    }

    const existing = this.items.controls.map(c => c.get('key')?.value);
    selected.forEach(key => {
      if (!existing.includes(key)) {
        this.items.push(this.makeItem(key, this.optionLabel(key)));
      }
    });
  }

  removeItem(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    this.items.removeAt(index);
    this.syncSelectedFromItems();
  }

  drop(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const ctrl = this.items.at(event.previousIndex);
    this.items.removeAt(event.previousIndex);
    this.items.insert(event.currentIndex, ctrl);
    this.syncSelectedFromItems();
  }

  private syncSelectedFromItems(): void {
    const keys = this.items.controls.map(c => c.get('key')?.value);
    this.selectedControl?.setValue(keys, { emitEvent: false });
  }

  async save(): Promise<void> {
    if (this.isSaving) return;
    if (this.items.length === 0) {
      this.snackBar.open('Select at least one item to configure.', 'Close', { duration: 3000 });
      return;
    }

    this.isSaving = true;

    const homeconfig = this.items.controls.map(c => {
      const v = c.value;
      const opt = this.optionByKey[v.key];
      const base: any = {
        type: opt?.type || '',
        label: opt?.label || v.key,
        title: (v.title || '').trim(),
        subtitle: (v.subtitle || '').trim(),
        showto: (v.showto || 'both').toLowerCase()
      };
      if (opt?.type === 'homeseries' && opt.id) {
        base.value = opt.id;
        base.seriesref = doc(this.firestore, 'eiflixhomeseries', opt.id);
        base.enabletag = !!v.enabletag;
        // Array of strings, max 3.
        base.tags = (Array.isArray(v.tags) ? v.tags : [])
          .map((t: any) => (t ?? '').toString().trim())
          .filter(Boolean)
          .slice(0, 3);
      } else {
        base.value = opt?.type || v.key;
      }
      return base;
    });

    try {
      const ref = doc(this.firestore, 'classify', 'eiflixwebapp');
      // merge so the existing widgettype array (and any other fields) survive.
      await setDoc(ref, { homeconfig, homeconfigupdated: serverTimestamp() }, { merge: true });
      this.snackBar.open('Home configuration saved.', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Error saving home config:', err);
      this.snackBar.open('Error saving. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }
}
