import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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
  query,
  setDoc,
  serverTimestamp,
  where
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

interface ConfigOption {
  key: string;                                  // unique library value
  label: string;                                // shown in the library / rows
  type: 'comingsoon' | 'ads' | 'masterclass' | 'homeseries' | 'ad';
  id?: string;                                  // eiflixhomeseries / eiflixhomewidgets doc id
}

interface RowGroup {
  kind: 'ads' | 'other';
  indices: number[];
}

@Component({
  selector: 'app-eiflixhomeconfig',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
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
  dirty = false;

  // The old 'Ads' widget entry is gone — ads are now picked individually
  // (see adOptions) and paired two-per-row in the saved structure.
  staticOptions: ConfigOption[] = [
    { key: 'comingsoon', label: 'Coming Soon', type: 'comingsoon' },
    { key: 'masterclass', label: 'Masterclass', type: 'masterclass' }
  ];
  seriesOptions: ConfigOption[] = [];
  // Ads created in the Ads tab (eiflixhomewidgets, widgettype == 'ads').
  adOptions: ConfigOption[] = [];
  private optionByKey: Record<string, ConfigOption> = {};

  // Library rail state.
  librarySearch = '';
  filteredStatic: ConfigOption[] = [];
  filteredSeries: ConfigOption[] = [];
  filteredAds: ConfigOption[] = [];
  private addedKeys = new Set<string>();

  // Layout list state: which row group is expanded (keyed by the group's
  // first item key so it survives reorders).
  expandedKey: string | null = null;
  groupsView: RowGroup[] = [];

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
      items: this.fb.array([])
    });
  }

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  async ngOnInit(): Promise<void> {
    try {
      // Options: static widgets + every eiflixhomeseries title + every ad
      // created in the Ads tab.
      const seriesRef = collection(this.firestore, 'eiflixhomeseries');
      const adsRef = query(
        collection(this.firestore, 'eiflixhomewidgets'),
        where('widgettype', '==', 'ads')
      );
      const [series, ads] = await Promise.all([
        firstValueFrom(collectionData(seriesRef, { idField: 'id' })) as Promise<any[]>,
        firstValueFrom(collectionData(adsRef, { idField: 'id' })) as Promise<any[]>
      ]);
      this.seriesOptions = series
        .map(s => ({
          key: 'series:' + s.id,
          label: (s.title || 'Untitled series').toString(),
          type: 'homeseries' as const,
          id: s.id
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      this.adOptions = ads
        .map(a => ({
          key: 'ad:' + a.id,
          label: (a.title || 'Untitled ad').toString(),
          type: 'ad' as const,
          id: a.id
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      this.reindexOptions();

      // Existing config (single document) to prefill.
      const snap = await getDoc(doc(this.firestore, 'classify', 'eiflixwebapp'));
      const homeconfig: any[] = snap.exists() && Array.isArray(snap.data()?.['homeconfig'])
        ? snap.data()!['homeconfig']
        : [];
      this.hydrate(homeconfig);
      this.applyLibraryFilter();
      // Any edit after hydration marks unsaved work (structural ops that
      // suppress events set the flag themselves).
      this.form.valueChanges.subscribe(() => (this.dirty = true));
    } catch (err) {
      console.error('Error loading EiFlix home config:', err);
    } finally {
      this.loading = false;
    }
  }

  private reindexOptions(): void {
    this.optionByKey = {};
    [...this.staticOptions, ...this.seriesOptions, ...this.adOptions]
      .forEach(o => (this.optionByKey[o.key] = o));
  }

  private hydrate(homeconfig: any[]): void {
    homeconfig.forEach(entry => {
      const type = entry?.type || (entry?.seriesref ? 'homeseries' : entry?.value);

      // Ads entry: one homeconfig index holds up to two ad maps (the home
      // screen renders them as one row). Each map becomes its own item row.
      if (type === 'ads' && Array.isArray(entry?.ads)) {
        entry.ads.forEach((ad: any) => {
          const adId = ad?.value || ad?.adref?.id;
          if (!adId) return;
          const key = 'ad:' + adId;
          // If the referenced ad no longer exists, keep it visible.
          if (!this.optionByKey[key]) {
            const opt: ConfigOption = { key, label: ad?.label || key, type: 'ad', id: adId };
            this.adOptions.push(opt);
            this.optionByKey[key] = opt;
          }
          this.items.push(this.makeItem(key, ad?.title, ad?.subtitle, ad?.showto));
        });
        return;
      }

      // Legacy 'Ads' WIDGET entry (pre-redesign) — the widget was removed, so
      // drop it; it disappears from the doc on the next save.
      if (type === 'ads') return;

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

      this.items.push(this.makeItem(key, entry?.title, entry?.subtitle, entry?.showto, entry?.enabletag, entry?.tags));
    });
    this.rebuildGroups();
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

  // ── Library rail ──────────────────────────────────────────────────────

  onSearch(value: string): void {
    this.librarySearch = value || '';
    this.applyLibraryFilter();
  }

  private applyLibraryFilter(): void {
    const q = this.librarySearch.trim().toLowerCase();
    const match = (list: ConfigOption[]) =>
      !q ? [...list] : list.filter(o => o.label.toLowerCase().includes(q));
    this.filteredStatic = match(this.staticOptions);
    this.filteredSeries = match(this.seriesOptions);
    this.filteredAds = match(this.adOptions);
  }

  get libraryEmpty(): boolean {
    return this.filteredStatic.length === 0
      && this.filteredSeries.length === 0
      && this.filteredAds.length === 0;
  }

  isAdded(key: string): boolean {
    return this.addedKeys.has(key);
  }

  addOption(opt: ConfigOption): void {
    if (this.addedKeys.has(opt.key)) return;
    this.items.push(this.makeItem(opt.key, opt.label));
    this.dirty = true;
    this.rebuildGroups();

    // Expand the row that received the new item (a second ad joins the
    // previous single-ad group, whose key is the first ad's).
    const lastIndex = this.items.length - 1;
    const target = this.groupsView.find(g => g.indices.includes(lastIndex));
    this.expandedKey = target ? this.groupKey(target) : opt.key;
    setTimeout(() =>
      document.getElementById('grp-' + this.expandedKey)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  // ── Per-item helpers used by the template ─────────────────────────────

  keyOf(i: number): string { return this.items.at(i)?.get('key')?.value || ''; }
  titleOf(i: number): string { return this.items.at(i)?.get('title')?.value || ''; }
  showtoOf(i: number): string { return this.items.at(i)?.get('showto')?.value || 'both'; }
  enabletagOf(i: number): boolean { return !!this.items.at(i)?.get('enabletag')?.value; }
  typeOf(i: number): string { return this.optionType(this.keyOf(i)); }
  nameOf(i: number): string { return this.optionLabel(this.keyOf(i)); }
  tagCount(i: number): number { return this.itemTags(i)?.length || 0; }

  setShowTo(index: number, value: string): void {
    this.items.at(index)?.get('showto')?.setValue(value);
  }

  showToLabel(value: string): string {
    return this.showToOptions.find(s => s.value === value)?.label || 'Both';
  }

  typeIcon(type: string): string {
    switch (type) {
      case 'comingsoon': return 'event_note';
      case 'masterclass': return 'school';
      case 'homeseries': return 'subscriptions';
      case 'ad': return 'campaign';
      default: return 'widgets';
    }
  }

  typeLabel(type: string): string {
    switch (type) {
      case 'comingsoon': return 'Widget';
      case 'masterclass': return 'Widget';
      case 'homeseries': return 'Home Series';
      case 'ad': return 'Ad';
      default: return type;
    }
  }

  // Home Series per-item tag helpers (max 3 tags).
  itemTags(index: number): FormArray {
    return this.items.at(index)?.get('tags') as FormArray;
  }

  addTagInput(index: number, input: HTMLInputElement): void {
    const arr = this.itemTags(index);
    const value = (input.value || '').trim();
    if (!arr || !value || arr.length >= 3) return;
    arr.push(this.fb.control(value));
    input.value = '';
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

  removeItem(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    this.items.removeAt(index);
    this.dirty = true;
    this.rebuildGroups();
  }

  removeGroup(g: RowGroup): void {
    [...g.indices].sort((a, b) => b - a).forEach(i => this.items.removeAt(i));
    this.dirty = true;
    this.rebuildGroups();
  }

  // ── Row grouping: consecutive ads share one row (= one saved home row,
  // max 2 ads), exactly mirroring the save-time pairing. Cached so typing
  // in inputs doesn't rebuild the DOM every change-detection run. ─────────

  rebuildGroups(): void {
    const groups: RowGroup[] = [];
    let buf: number[] = [];
    const flush = () => {
      if (buf.length) { groups.push({ kind: 'ads', indices: buf }); buf = []; }
    };
    this.items.controls.forEach((c, i) => {
      if (this.optionType(c.get('key')?.value) === 'ad') {
        buf.push(i);
        if (buf.length === 2) flush();
      } else {
        flush();
        groups.push({ kind: 'other', indices: [i] });
      }
    });
    flush();
    this.groupsView = groups;

    this.addedKeys = new Set(this.items.controls.map(c => c.get('key')?.value));
    if (this.expandedKey && !groups.some(g => this.groupKey(g) === this.expandedKey)) {
      this.expandedKey = null;
    }
  }

  groupKey(g: RowGroup): string {
    return this.keyOf(g.indices[0]) || 'row';
  }

  isExpanded(g: RowGroup): boolean {
    return this.expandedKey === this.groupKey(g);
  }

  toggleGroup(g: RowGroup): void {
    const key = this.groupKey(g);
    this.expandedKey = this.expandedKey === key ? null : key;
  }

  trackGroup = (_: number, g: RowGroup): string => this.groupKey(g);

  groupLabel(g: RowGroup): string {
    return g.indices.map(i => this.nameOf(i)).join('  +  ');
  }

  adNames(g: RowGroup): string {
    return g.indices.map(i => this.nameOf(i)).join(' · ');
  }

  /** Drag moves a whole row — for an ads row, both ads move together. */
  dropGroup(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const groups = [...this.groupsView];
    const [moved] = groups.splice(event.previousIndex, 1);
    groups.splice(event.currentIndex, 0, moved);

    const controls = groups.flatMap(g => g.indices).map(i => this.items.at(i));
    while (this.items.length) this.items.removeAt(0, { emitEvent: false });
    controls.forEach(c => this.items.push(c, { emitEvent: false }));
    this.dirty = true;
    this.rebuildGroups();
  }

  async save(): Promise<void> {
    if (this.isSaving) return;
    if (this.items.length === 0) {
      this.snackBar.open('Add at least one item from the library.', 'Close', { duration: 3000 });
      return;
    }

    this.isSaving = true;

    // Consecutive ad rows are paired: one homeconfig index carries up to TWO
    // ad maps (the home screen shows two ads per row), each with a reference
    // to the ad doc created in the Ads tab.
    const homeconfig: any[] = [];
    let adsBuffer: any[] = [];
    const flushAds = () => {
      if (adsBuffer.length === 0) return;
      homeconfig.push({ type: 'ads', label: 'Ads', ads: adsBuffer });
      adsBuffer = [];
    };

    this.items.controls.forEach(c => {
      const v = c.value;
      const opt = this.optionByKey[v.key];

      if (opt?.type === 'ad' && opt.id) {
        adsBuffer.push({
          value: opt.id,
          label: opt.label,
          adref: doc(this.firestore, 'eiflixhomewidgets', opt.id),
          title: (v.title || '').trim(),
          subtitle: (v.subtitle || '').trim(),
          showto: (v.showto || 'both').toLowerCase()
        });
        if (adsBuffer.length === 2) flushAds();
        return;
      }
      flushAds();

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
      homeconfig.push(base);
    });
    flushAds();

    try {
      const ref = doc(this.firestore, 'classify', 'eiflixwebapp');
      // merge so the existing widgettype array (and any other fields) survive.
      await setDoc(ref, { homeconfig, homeconfigupdated: serverTimestamp() }, { merge: true });
      this.dirty = false;
      this.snackBar.open('Home configuration saved.', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Error saving home config:', err);
      this.snackBar.open('Error saving. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }
}
