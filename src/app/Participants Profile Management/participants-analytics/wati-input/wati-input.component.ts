import { Component, Inject } from '@angular/core';
import { doc, docData, DocumentReference, Firestore, query, where, getDocs, serverTimestamp, setDoc, collection, orderBy, limit, getDoc } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { WatiService } from '../../../wati.service';
import { AuthguardService } from '../../../authguard.service';
import { Subject, takeUntil, forkJoin, debounceTime, distinctUntilChanged } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgIf } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import * as XLSX from 'xlsx';
import { getStorage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export type ParamFillType = 'static' | 'metadata' | 'excel';

export interface TemplateParam {
  name: string;
  fillType: ParamFillType;
  staticValue?: string;
  metadataField?: string;
  excelColumn?: string;
}

const FAVOURITES_KEY = 'wati_favourite_templates';

@Component({
  selector: 'app-wati-input',
  standalone: true,
  imports: [
    MatFormFieldModule, FormsModule, NgIf, MatInputModule, MatSelectModule,
    NgxMatSelectSearchModule, MatButtonModule, CommonModule, MatTabsModule,
    MatCheckboxModule, MatIconModule, MatCardModule, MatProgressSpinnerModule,
    MatChipsModule, MatProgressBarModule, MatRadioModule, MatTooltipModule,
    MatDividerModule, MatDatepickerModule, MatNativeDateModule,
  ],
  templateUrl: './wati-input.component.html',
  styleUrl: './wati-input.component.css'
})
export class WatiInputComponent {

  showFormatGuide = false;
  searchCategory = '';
  searchSubCategory = '';
  templateType = 'Standard';
  notes = '';
  selectedCategory = '';
  selectedSubCategory = '';
  searchTemplate = '';
  testNumbers = '';
  searchProfile = '';
  newTestNumber = '';
  searchRecent = '';
  filteredRecentTemplates: any[] = [];
  favouriteTemplates: any[] = [];
  favouriteIds: Set<string> = new Set<string>();

  uploadedFile: File | null = null;
  excelData: any[] = [];
  excelHeaders: string[] = [];
  phoneNumbers: string[] = [];
  validNumbers: string[] = [];
  invalidNumbers: string[] = [];
  isValidatingNumbers = false;
  showValidationResults = false;
  fileUploadUrl = '';
  isUploadingFile = false;

  templateParamNames: string[] = [];
  templateParams: TemplateParam[] = [];
  metadataFields: string[] = [];
  isLoadingMetadataFields = false;

  selectedTemplate: any = {};
  mapProfile: Record<string, any> = {};
  selectedQueuedTemplate: any = null;
  queuedRecipients: any[] = [];

  bufferDoc: any = {
    profileid: [], createdby: null, date: new Date(), status: 'created',
    body: '', templateid: '', broadcastname: '', notes: '', watitemplateid: '',
    wati_msgid: [], params: [], validated: true, serverurl: '', serverid: '',
    numbers: [], numbermap: {}, parameterConfig: [], paramFillMode: 'static' as ParamFillType,
  };

  templateCategories: any[] = [];
  templateSubCategories: any[] = [];
  watiTemplates: any[] = [];
  filteredTemplates: any[] = [];
  displayTemplates: any[] = [];
  recentTemplates: any[] = [];
  queuedTemplates: any[] = [];
  profiles: any[] = [];
  filteredProfiles: any[] = [];
  selectedProfiles: any[] = [];
  testNumbersList: any[] = [];
  serverUrls: any[] = [];

  isTemplateAvailable = true;
  isTestMode = false;
  isLoading = false;
  isSearching = false;
  showRecipients = false;
  isLoadingProfiles = false;
  isLoadingQueued = false;
  isQueuedTemplate = false;
  isLoadingQueuedRecipients = false;
  isSendingQueued = false;

  readonly DISPLAY_LIMIT = 50;
  hasMoreTemplates = false;

  categoryCollectionSnapShot: DocumentReference;
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();
  private profileSearchSubject = new Subject<string>();
  workshopTitle = '';

  // ── Schedule ──────────────────────────────────────────────────────────
  isScheduled = false;
  scheduleDate: Date | null = null;
  scheduleHour = '';
  scheduleMinute = '';
  schedulePeriod: 'AM' | 'PM' = 'AM';
  hours: string[] = [];
  minutes: string[] = [];

  // ── WATI Categories ───────────────────────────────────────────────────
  watiCategories: { id: string; name: string }[] = [];
  selectedWatiCategory = '';
  newWatiCategoryName = '';
  isAddingCategory = false;
  manageCategoryDialogOpen = false;

  // ── Parameter Presets ─────────────────────────────────────────────────
  private readonly PARAM_PRESETS_KEY = 'wati_param_presets';
  savedPresets: { name: string; params: TemplateParam[] }[] = [];
  selectedPresetName = '';
  newPresetName = '';
  showPresetSaveInput = false;

  private readonly SEND_FUNCTION_URL = 'https://sendwhatsappbroadcast-rhdwzw46ya-uc.a.run.app';
  private readonly PROD_SEND_FUNCTION_URL = 'https://sendwhatsappbroadcast-kakybqnyrq-uc.a.run.app';

  constructor(
    private firestore: Firestore,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<WatiInputComponent>,
    private watiService: WatiService,
    private auth: AuthguardService,
    private snackBar: MatSnackBar,
    private http: HttpClient,
  ) {
    this.loadWatiCategories();
    this.categoryCollectionSnapShot = doc(this.firestore, 'email validators', 'templateCategories');
    docData(this.categoryCollectionSnapShot).pipe(takeUntil(this.destroy$)).subscribe((d: any) => {
      this.templateCategories = d['categories'];
      this.templateSubCategories = d['subcategories'];
    });

    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(t => { this.searchTemplate = t; this.applyFiltersAndLimit(); this.isSearching = false; });
    this.profileSearchSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(t => this.performProfileSearch(t));

    // Build schedule picker arrays
    this.hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    this.minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

    if (this.data) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const tag = `${pad(now.getDate())}_${pad(now.getMonth() + 1)}_${now.getFullYear()}_${pad(now.getHours())}_${pad(now.getMinutes())}`;
      this.bufferDoc.profileid = data.map((e: any) => e.profileid);
      this.bufferDoc.broadcastname = (this.bufferDoc.profileid.length === 1)
        ? `Individual_${tag}` : `Broadcast_${tag}`;
      this.auth.getRoles().then((e: any) => this.bufferDoc.createdby = e['profile_ref'].id);
    } else {
      this.dialogRef.close();
    }

    this.loadFavourites();
    this.loadTemplatesFromAllServers();
    this.loadRecentTemplates();
    this.loadQueuedTemplates();
    this.loadProfiles();
    this.loadMetadataFields();
    this.loadWorkshopTitle();
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ── Scroll helper ─────────────────────────────────────────────────────
  private scrollToConfigureParams() {
    setTimeout(() => {
      document.getElementById('configure-params-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  async loadWorkshopTitle() {
    try {
      const snap = await getDocs(collection(this.firestore, 'workshopconfiguration'));
      if (!snap.empty) {
        const data = snap.docs[0].data();
        this.workshopTitle = data?.['detailpage']?.['title'] ?? '';
        const p = this.templateParams.find(p => p.name === 'workshoptitle');
        if (p && !p.staticValue) {
          p.staticValue = this.workshopTitle;
          this.updatePreview();
        }
      }
    } catch (e) {
      console.error('Error loading workshop title', e);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // FAVOURITES
  // ══════════════════════════════════════════════════════════════════════

  private loadFavourites() {
    try {
      const raw = localStorage.getItem(FAVOURITES_KEY);
      if (raw) {
        this.favouriteTemplates = JSON.parse(raw);
        this.favouriteIds = new Set(this.favouriteTemplates.map((t: any) => this.favouriteKey(t)));
      }
    } catch { this.favouriteTemplates = []; }
  }

  async loadWatiCategories() {
    try {
      const snap = await getDoc(doc(this.firestore, 'classify', 'waticategories'));
      this.watiCategories = snap.exists() ? (snap.data()?.['categories'] || []) : [];
    } catch (e) { console.error('Error loading wati categories', e); }
  }

  getWatiCategoryName(categoryId: string | null): string {
    if (!categoryId) return '—';
    return this.watiCategories.find(c => c.id === categoryId)?.name ?? '—';
  }

  async addWatiCategory() {
    const name = this.newWatiCategoryName.trim();
    if (!name) return;
    if (this.watiCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      this.snackBar.open(`"${name}" already exists`, 'Close', { duration: 2000 }); return;
    }
    this.isAddingCategory = true;
    try {
      const newItem = { id: doc(collection(this.firestore, '_')).id, name };
      const updated = [...this.watiCategories, newItem];
      await setDoc(doc(this.firestore, 'classify', 'waticategories'), { categories: updated }, { merge: true });
      this.watiCategories = updated;
      this.selectedWatiCategory = newItem.id;
      this.newWatiCategoryName = '';
      this.manageCategoryDialogOpen = false;
      this.snackBar.open('Category added', 'Close', { duration: 2000 });
    } catch (e) { console.error(e); this.snackBar.open('Failed to add category', 'Close', { duration: 2000 }); }
    finally { this.isAddingCategory = false; }
  }

  private persistFavourites() {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(this.favouriteTemplates));
    this.favouriteIds = new Set(this.favouriteTemplates.map((t: any) => this.favouriteKey(t)));
  }

  private favouriteKey(t: any): string { return `${t.elementName}__${t.serverid ?? t.servername ?? ''}`; }
  isFavourite(t: any): boolean { return this.favouriteIds.has(this.favouriteKey(t)); }

  toggleFavourite(event: Event, t: any) {
    event.stopPropagation();
    const key = this.favouriteKey(t);
    if (this.favouriteIds.has(key)) {
      if (!confirm('Remove from Favourites?')) return;
      this.favouriteTemplates = this.favouriteTemplates.filter(f => this.favouriteKey(f) !== key);
      this.snackBar.open('Removed from favourites', 'Close', { duration: 2000 });
    } else {
      this.favouriteTemplates = [t, ...this.favouriteTemplates];
      this.snackBar.open('Added to favourites ★', 'Close', { duration: 2000 });
    }
    this.persistFavourites();
  }

  selectFavouriteTemplate(t: any) {
    this.resetQueuedTemplateState();
    this.selectedTemplate = { ...t };
    this.bufferDoc.serverurl = t.serverurl;
    this.bufferDoc.serverid = t.serverid;
    this.isTemplateAvailable = false;
    getDocs(query(collection(this.firestore, 'wati templates'), where('templateid', '==', t.id)))
      .then(snap => {
        if (!snap.empty) {
          this.isTemplateAvailable = true;
          const data = snap.docs[0].data();
          Object.assign(this.selectedTemplate, { docid: data['docid'], category: data['category'], subcategory: data['subcategory'], notes: data['notes'], templateid: data['templateid'] });
        }
      }).catch(e => console.error(e));
    this.initParamConfig(this.parseTemplateParams(t.bodyOriginal || ''));
    this.snackBar.open(`Template "${t.elementName}" selected`, 'OK', { duration: 2000 });
    this.scrollToConfigureParams();
  }

  // ══════════════════════════════════════════════════════════════════════
  // RECENT TAB SEARCH
  // ══════════════════════════════════════════════════════════════════════
  onSearchRecent() {
    const s = this.searchRecent.toLowerCase().trim();
    if (!s) { this.filteredRecentTemplates = [...this.recentTemplates]; return; }
    this.filteredRecentTemplates = this.recentTemplates.filter(t =>
      t.watitemplateid?.toLowerCase().includes(s) || t.broadcastname?.toLowerCase().includes(s) ||
      t.serverid?.toLowerCase().includes(s) || t.notes?.toLowerCase().includes(s)
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // METADATA / PARAM PARSING
  // ══════════════════════════════════════════════════════════════════════
  async loadMetadataFields() {
    this.isLoadingMetadataFields = true;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'participant metadata'), limit(1)));
      if (!snap.empty) this.metadataFields = Object.keys(snap.docs[0].data()).sort();
    } catch (e) { console.error('Error loading metadata fields', e); }
    finally { this.isLoadingMetadataFields = false; }
  }

  private parseTemplateParams(body: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const names: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(body)) !== null) { if (!names.includes(m[1])) names.push(m[1]); }
    return names;
  }

  private initParamConfig(paramNames: string[]) {
    const headerBody = this.selectedTemplate['header']?.['headerOriginal'] || '';
    const headerParams = this.parseTemplateParams(headerBody);
    const allParams = [...new Set([...headerParams, ...paramNames])];

    this.templateParamNames = allParams;
    this.templateParams = allParams.map(name => {
      const existing = this.templateParams.find(p => p.name === name);
      return existing ?? { name, fillType: 'static', staticValue: '', metadataField: '', excelColumn: '' };
    });
    this.updatePreview();
    this.loadPresetsForTemplate();
  }

  // ══════════════════════════════════════════════════════════════════════
  // PREVIEW
  // ══════════════════════════════════════════════════════════════════════
  getFormattedPreviewHtml(): string {
    if (!this.selectedTemplate?.['bodyOriginal']) return '';
    let body: string = this.selectedTemplate['bodyOriginal'];
    body = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    this.templateParams.forEach(p => {
      const raw = `{{${p.name}}}`;
      let cls = 'chip-static', disp = p.staticValue || raw;
      if (p.fillType === 'metadata') { cls = 'chip-metadata'; disp = p.metadataField ? `[${p.metadataField}]` : raw; }
      else if (p.fillType === 'excel') { cls = 'chip-excel'; disp = p.excelColumn ? `[${p.excelColumn}]` : raw; }
      body = body.split(raw).join(`<span class="${cls}">${disp}</span>`);
    });
    body = body.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>').replace(/_([^_\n]+)_/g, '<em>$1</em>').replace(/\n/g, '<br>');
    return body;
  }

  onParamValueChange() { this.updatePreview(); }
  private updatePreview() { }
  setParamFillType(param: TemplateParam, type: ParamFillType) { param.fillType = type; this.updatePreview(); }

  // ══════════════════════════════════════════════════════════════════════
  // LOAD DATA
  // ══════════════════════════════════════════════════════════════════════
  async loadTemplatesFromAllServers() {
    this.isLoading = true;
    let watiData: Record<string, any> = {};
    const watiDoc = await getDoc(doc(this.firestore, 'classify', 'wati'));
    if (watiDoc.exists()) {
      watiData = watiDoc.data();
      this.serverUrls = Object.keys(watiData);
      this.auth.openSnackBar(`Fetching ${this.serverUrls.length} - Servers Templates`, 'OK', 600);
    } else { this.auth.openSnackBar('No Wati Server Found', 'OK', 600); this.isLoading = false; return; }

    forkJoin(this.serverUrls.map(sid => this.watiService.getTemplates(sid, watiData))).subscribe({
      next: (responses: any[][]) => {
        this.watiTemplates = [];
        responses.forEach((templates, idx) => {
          const sid = this.serverUrls[idx], cfg = watiData[sid];
          templates.filter(t => t.status?.toLowerCase() === 'approved').forEach(t => {
            t.serverid = sid; t.servername = cfg.watiname; t.serverurl = cfg.endpoint;
            this.watiTemplates.push(t);
          });
        });
        this.watiTemplates.sort((a, b) => b['lastModified'] - a['lastModified']);
        this.applyFiltersAndLimit();
        this.isLoading = false;
      },
      error: () => { this.snackBar.open('Error loading templates', 'Close', { duration: 3000 }); this.isLoading = false; }
    });
  }

  async loadRecentTemplates() {
    try {
      const snap = await getDocs(query(collection(this.firestore, 'wati templates'), orderBy('date', 'desc'), limit(10)));
      this.recentTemplates = snap.docs.map(d => ({ id: d.id, ...d.data(), watitemplateid: d.data()['watitemplateid'] ?? d.data()['templatename'] ?? '' }));
      this.filteredRecentTemplates = [...this.recentTemplates];
    } catch (e) { console.error('Error loading recent templates', e); }
  }

  async loadQueuedTemplates() {
    this.isLoadingQueued = true;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'wati archive'), where('status', '==', 'queued'), orderBy('queuedAt', 'desc'), limit(20)));
      this.queuedTemplates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error(e); }
    finally { this.isLoadingQueued = false; }
  }

  async loadProfiles() {
    this.isLoadingProfiles = true;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'profile_data'), orderBy('name', 'asc')));
      this.profiles = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p['number']);
      this.filteredProfiles = [...this.profiles];
      snap.docs.forEach(d => { const pd = d.data(); if (pd['number']) this.mapProfile[d.id] = { id: d.id, ...pd }; });
    } catch (e) { console.error(e); }
    finally { this.isLoadingProfiles = false; }
  }

  // ══════════════════════════════════════════════════════════════════════
  // TEMPLATE SELECTION
  // ══════════════════════════════════════════════════════════════════════
  isTemplatePresent(): boolean { return Object.keys(this.selectedTemplate).length !== 0; }

  applyFiltersAndLimit() {
    let filtered = [...this.watiTemplates];

    if (this.searchTemplate.trim()) {
      const s = this.searchTemplate.toLowerCase();
      filtered = filtered.filter(t =>
        t.elementName?.toLowerCase().includes(s) ||
        t.category?.toLowerCase().includes(s) ||
        t.servername?.toLowerCase().includes(s) ||
        t.bodyOriginal?.toLowerCase().includes(s));
    }

    this.filteredTemplates = filtered;
    this.hasMoreTemplates = filtered.length > this.DISPLAY_LIMIT;
    this.displayTemplates = filtered.slice(0, this.DISPLAY_LIMIT);
  }

  onSearchTemplate() { this.isSearching = true; this.searchSubject.next(this.searchTemplate); }
  filterTemplates() { this.applyFiltersAndLimit(); }
  loadMoreTemplates() {
    const n = this.displayTemplates.length;
    this.displayTemplates = [...this.displayTemplates, ...this.filteredTemplates.slice(n, n + this.DISPLAY_LIMIT)];
    this.hasMoreTemplates = this.displayTemplates.length < this.filteredTemplates.length;
  }
  getTemplatesCountInfo(): string {
    if (this.isLoading) return 'Loading…';
    if (this.isSearching) return 'Searching…';
    return `Showing ${this.displayTemplates.length} of ${this.filteredTemplates.length} templates`;
  }

  onSearchProfile() { this.profileSearchSubject.next(this.searchProfile); }
  private performProfileSearch(term: string) {
    if (!term.trim()) { this.filteredProfiles = [...this.profiles]; return; }
    const s = term.toLowerCase();
    this.filteredProfiles = this.profiles.filter(p => p.name?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s) || p.number?.includes(s));
  }

  isCategorySelected(): boolean {
    return !!this.selectedWatiCategory;
  }

  async onTemplateChange(event: any) {
    this.resetQueuedTemplateState();
    this.selectedTemplate = event.value;
    this.bufferDoc.serverurl = event.value.serverurl;
    this.bufferDoc.serverid = event.value.serverid;
    this.isTemplateAvailable = false;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'wati templates'), where('templateid', '==', event.value['id'])));
      if (!snap.empty) {
        this.isTemplateAvailable = true;
        const data = snap.docs[0].data();
        Object.assign(this.selectedTemplate, { docid: data['docid'], category: data['category'], subcategory: data['subcategory'], notes: data['notes'], templateid: data['templateid'] });
      }
    } catch (e) { console.error(e); this.isTemplateAvailable = false; }
    this.initParamConfig(this.parseTemplateParams(event.value['bodyOriginal'] || ''));
    this.scrollToConfigureParams();
  }

  async selectRecentTemplate(template: any) {
    this.resetQueuedTemplateState();

    const liveMatch = this.watiTemplates.find(t =>
      t.id === template.templateid || t.elementName === (template.watitemplateid ?? template.templatename)
    );

    this.selectedTemplate = liveMatch ? { ...liveMatch } : {
      elementName: template.watitemplateid ?? template.templatename ?? '', bodyOriginal: template.textbody ?? template.htmlbody ?? '',
      serverurl: template.serverurl ?? '', serverid: template.serverid ?? '', servername: template.servername ?? '',
      id: template.templateid ?? '', templateid: template.templateid ?? '', docid: template.id,
      category: template.category ?? null, subcategory: template.subcategory ?? null, notes: template.notes ?? '',
    };

    this.bufferDoc.serverurl = this.selectedTemplate['serverurl'] ?? '';
    this.bufferDoc.serverid = this.selectedTemplate['serverid'] ?? '';
    this.isTemplateAvailable = false;

    try {
      const snap = await getDocs(query(collection(this.firestore, 'wati templates'), where('templateid', '==', this.selectedTemplate['id'])));
      if (!snap.empty) {
        this.isTemplateAvailable = true;
        const data = snap.docs[0].data();
        Object.assign(this.selectedTemplate, { docid: data['docid'], category: data['category'], subcategory: data['subcategory'], notes: data['notes'], templateid: data['templateid'] });
      }
    } catch (e) { console.error(e); this.isTemplateAvailable = false; }

    this.initParamConfig(this.parseTemplateParams(this.selectedTemplate['bodyOriginal'] || ''));
    this.scrollToConfigureParams();
  }

  async selectQueuedTemplate(template: any) {
    this.resetQueuedTemplateState();
    this.isQueuedTemplate = true;
    this.selectedQueuedTemplate = template;
    const found = this.watiTemplates.find(t => t.elementName === template.templateData?.elementName && t.serverurl === template.serverurl);
    const tplData = found ?? {
      elementName: template.templateData?.elementName ?? template.watitemplateid ?? '',
      bodyOriginal: template.body ?? template.templateData?.bodyOriginal ?? '',
      serverurl: template.serverurl ?? '', serverid: template.serverid ?? '',
      servername: template.templateData?.servername ?? '', id: template.templateid ?? '',
      templateid: template.templateid ?? '', docid: template.id,
      category: template.category ?? null, subcategory: template.subcategory ?? null, notes: template.notes ?? '',
    };
    this.selectedTemplate = found ? found : tplData;
    this.bufferDoc.serverurl = template.serverurl ?? '';
    this.bufferDoc.serverid = template.serverid ?? '';
    this.bufferDoc.broadcastname = template.broadcastname ?? '';
    this.bufferDoc.profileid = template.profileid ?? [];
    this.bufferDoc.numbers = template.numbers || [];
    this.bufferDoc.numbermap = template.numbermap || {};
    if (found) { this.bufferDoc.notes = template.notes; }
    this.isTemplateAvailable = true;
    this.showRecipients = true;
    if (template.parameterConfig?.length) {
      this.templateParams = template.parameterConfig;
      this.templateParamNames = this.templateParams.map(p => p.name);
      this.updatePreview();
    } else {
      this.initParamConfig(this.parseTemplateParams(this.selectedTemplate['bodyOriginal'] || ''));
    }
    await this.loadQueuedRecipients(template.profileid);
    this.scrollToConfigureParams();
  }

  async loadQueuedRecipients(profileIds: string[]) {
    if (!profileIds?.length) { this.queuedRecipients = []; return; }
    this.isLoadingQueuedRecipients = true;
    try {
      const recipients: any[] = [];
      for (const id of profileIds) {
        const snap = await getDocs(query(collection(this.firestore, 'profiles'), where('__name__', '==', id)));
        if (!snap.empty) recipients.push({ profileid: id, ...snap.docs[0].data() });
      }
      this.queuedRecipients = recipients;
      this.bufferDoc.profileid = profileIds;
    } catch (e) { console.error(e); }
    finally { this.isLoadingQueuedRecipients = false; }
  }

  resetQueuedTemplateState() { this.isQueuedTemplate = false; this.selectedQueuedTemplate = null; this.queuedRecipients = []; }

  // ══════════════════════════════════════════════════════════════════════
  // EXCEL HELPERS
  // ══════════════════════════════════════════════════════════════════════
  hasExcelParam(): boolean { return this.templateParams.some(p => p.fillType === 'excel'); }
  getExcelMappedParams(): TemplateParam[] { return this.templateParams.filter(p => p.fillType === 'excel'); }
  isColumnMapped(header: string): boolean { return this.templateParams.some(p => p.fillType === 'excel' && p.excelColumn === header); }
  isPhoneColumn(header: string): boolean { return ['phone', 'number', 'mobile', 'contact', 'phonenumber', 'phone_number'].some(k => header.toLowerCase().includes(k)); }
  isParamConfigValid(): boolean { return !this.templateParams.some(p => p.fillType === 'excel' && !p.excelColumn); }

  private buildParamConfigForSave(): TemplateParam[] {
    return this.templateParams.map(p => ({
      name: p.name, fillType: p.fillType,
      staticValue: p.fillType === 'static' ? (p.staticValue || '') : null,
      metadataField: p.fillType === 'metadata' ? (p.metadataField || '') : null,
      excelColumn: p.fillType === 'excel' ? (p.excelColumn || '') : null,
    }));
  }

  private getDominantFillMode(): ParamFillType {
    if (!this.templateParams.length) return 'static';
    const counts = { static: 0, metadata: 0, excel: 0 };
    this.templateParams.forEach(p => counts[p.fillType]++);
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as ParamFillType;
  }

  downloadSampleExcel() {
    const paramCols = this.templateParams.map(p => p.name);
    const headers = ['phone', ...paramCols, 'name'];
    const rows = [
      ['+919876543210', ...paramCols.map(n => this.getSampleValue(n)), 'Rahul Sharma'],
      ['+918765432109', ...paramCols.map(n => this.getSampleValue2(n)), 'Priya Patel'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recipients');
    XLSX.writeFile(wb, `${this.selectedTemplate?.['elementName'] || 'template'}_recipients_sample.xlsx`);
    this.snackBar.open('Sample Excel downloaded', 'Close', { duration: 4000 });
  }

  getSampleValue(n: string): string {
    const m: Record<string, string> = { name: 'Rahul Sharma', sedate: '25th July 2025', date: '25th July 2025', time: '10:00 AM', amount: '₹5000', course: 'Leadership Program', link: 'https://zoom.us/j/123456', code: 'ABC123', batch: 'Batch 7' };
    return m[n.toLowerCase()] ?? `Sample ${n}`;
  }
  getSampleValue2(n: string): string {
    const m: Record<string, string> = { name: 'Priya Patel', sedate: '26th July 2025', date: '26th July 2025', time: '2:00 PM', amount: '₹7500', course: 'Executive Coaching', link: 'https://zoom.us/j/789012', code: 'XYZ789', batch: 'Batch 8' };
    return m[n.toLowerCase()] ?? `Sample ${n} 2`;
  }

  scrollToExcelUpload() { setTimeout(() => document.getElementById('excel-upload-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && this.isExcelFile(file)) { this.uploadedFile = file; this.processExcelFile(file); }
    else { this.snackBar.open('Please select a valid Excel file (.xlsx or .xls)', 'Close', { duration: 3000 }); }
    event.target.value = '';
  }

  private isExcelFile(file: File): boolean {
    return ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.type) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  }

  private processExcelFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        this.excelData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        if (this.excelData.length > 0) this.excelHeaders = (this.excelData[0] as any[]).map(h => h?.toString().trim() || '');
        this.extractPhoneNumbers();
        if (this.phoneNumbers.length > 0) this.validatePhoneNumbers();
        else this.snackBar.open('No phone numbers found.', 'Close', { duration: 5000 });
      } catch { this.snackBar.open('Error processing Excel file', 'Close', { duration: 3000 }); }
    };
    reader.readAsArrayBuffer(file);
  }

  private extractPhoneNumbers() {
    if (this.excelData.length < 2) return;
    const headers = this.excelData[0] as any[];
    const phoneIdx = headers.findIndex(h => ['phone', 'number', 'mobile', 'contact', 'phonenumber', 'phone_number'].some(k => h?.toString().toLowerCase().trim()?.includes(k)));
    if (phoneIdx === -1) { this.snackBar.open('Phone column not found.', 'Close', { duration: 5000 }); return; }
    this.phoneNumbers = [];
    for (let i = 1; i < this.excelData.length; i++) {
      const val = this.excelData[i][phoneIdx];
      if (val) { const c = this.cleanPhoneNumber(val.toString()); if (c) this.phoneNumbers.push(c); }
    }
  }

  private cleanPhoneNumber(phone: string): string {
    let c = phone.replace(/[^\d+]/g, '');
    if (!c.startsWith('+') && c.length === 10) c = '+91' + c;
    return c;
  }

  private async validatePhoneNumbers() {
    this.isValidatingNumbers = true;
    this.validNumbers = []; this.invalidNumbers = [];
    try {
      const existing = new Set<string>(this.data.map((d: any) => d?.['number'] || d?.['phonenumber']).filter(Boolean).map((n: string) => this.cleanPhoneNumber(n.toString())));
      this.phoneNumbers.forEach(p => (existing.has(p) ? this.validNumbers : this.invalidNumbers).push(p));
      this.showValidationResults = true;
      this.snackBar.open(`Validated: ${this.validNumbers.length} valid, ${this.invalidNumbers.length} not found`, 'Close', { duration: 5000 });
    } catch { this.snackBar.open('Error validating phone numbers', 'Close', { duration: 3000 }); }
    finally { this.isValidatingNumbers = false; }
  }

  removeUploadedFile() {
    this.uploadedFile = null; this.excelData = []; this.excelHeaders = [];
    this.phoneNumbers = []; this.validNumbers = []; this.invalidNumbers = [];
    this.showValidationResults = false; this.fileUploadUrl = '';
    this.templateParams.forEach(p => { if (p.fillType === 'excel') p.excelColumn = ''; });
    this.updatePreview();
  }

  private async uploadFileToStorage(): Promise<string> {
    if (!this.uploadedFile) return '';
    this.isUploadingFile = true;
    try {
      const storage = getStorage();
      const snap = await uploadBytes(ref(storage, `wati-uploads/${Date.now()}_${this.uploadedFile.name}`), this.uploadedFile);
      this.fileUploadUrl = await getDownloadURL(snap.ref);
      return this.fileUploadUrl;
    } catch { this.snackBar.open('Error uploading file', 'Close', { duration: 3000 }); return ''; }
    finally { this.isUploadingFile = false; }
  }

  // ══════════════════════════════════════════════════════════════════════
  // RECIPIENTS / TEST
  // ══════════════════════════════════════════════════════════════════════
  onShowRecipients() { this.showRecipients = !this.showRecipients; }
  getRecipientCount() { return this.bufferDoc.profileid.length; }
  getRecipientList() {
    if (this.isQueuedTemplate) return this.bufferDoc.profileid.map((id: string) => ({ name: this.mapProfile[id]?.['name'], email: this.mapProfile[id]?.['email'], profile: this.mapProfile[id]?.['profile'] }));
    return this.data || [];
  }
  canUploadExcel() { return this.isTemplatePresent() && !this.isTestMode; }

  private populateNumbersAndMap() {
    this.bufferDoc.numbers = []; this.bufferDoc.numbermap = {};
    this.bufferDoc.profileid.forEach((id: string) => {
      const p = this.mapProfile[id];
      if (p) { const num = p.phone || p.phoneNumber || p.number || ''; if (num) { this.bufferDoc.numbers.push(num); this.bufferDoc.numbermap[num] = id; } }
    });
  }

  async sendQueuedTemplate() {
    if (!this.selectedQueuedTemplate) { this.snackBar.open('No queued template selected', 'Close', { duration: 3000 }); return; }
    const archiveid = this.selectedQueuedTemplate['docid'] ?? this.selectedQueuedTemplate['id'];
    if (!archiveid) { this.snackBar.open('Archive ID not found', 'Close', { duration: 3000 }); return; }
    this.isSendingQueued = true;
    try {
      const projectId = (environment as any)['projectId'] ?? (environment as any)['firebase']?.['projectId'] ?? '';
      await this.http.post(this.PROD_SEND_FUNCTION_URL, { archiveid, projectId }, { headers: { 'Content-Type': 'application/json' } }).toPromise();
      this.snackBar.open('Message sent successfully!', 'Close', { duration: 4000 });
      this.dialogRef.close({ status: 'sent', archiveid });
    } catch (e: any) { this.snackBar.open(`Failed: ${e?.error?.message ?? e?.message ?? 'Unknown error'}`, 'Close', { duration: 5000 }); }
    finally { this.isSendingQueued = false; }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUBMIT HELPERS
  // ══════════════════════════════════════════════════════════════════════
  private async ensureTemplateExists(docID: string) {
    if (this.isTemplateAvailable) return;
    const existing = await getDocs(query(collection(this.firestore, 'wati templates'), where('templateid', '==', this.selectedTemplate['id'])));
    if (!existing.empty) { this.isTemplateAvailable = true; return; }
    await setDoc(doc(this.firestore, 'wati templates', docID), {
      active: false, docid: docID, date: serverTimestamp(), createdby: this.auth.uid,
      textbody: this.selectedTemplate['bodyOriginal'], htmlbody: this.selectedTemplate['bodyOriginal'],
      templatelayout: '', templatename: this.selectedTemplate['elementName'], templatetype: this.templateType,
      category: null, subcategory: null, templatevalidated: true, templatestatus: 'created',
      watistatus: 'approved', serverurl: this.selectedTemplate['serverurl'], serverid: this.selectedTemplate['serverid'],
      notes: this.notes, type: 'whatsapp', templateid: this.selectedTemplate['id'], watitemplateid: this.selectedTemplate['elementName'],
    });
    await this.loadRecentTemplates();
  }

  private buildArchiveDoc(archiveid: string, status: string): any {
    const archiveDoc: any = {
      ...this.bufferDoc, docid: archiveid, body: this.selectedTemplate['bodyOriginal'],
      templateid: this.isTemplateAvailable ? this.selectedTemplate['templateid'] : this.selectedTemplate['id'],
      watitemplateid: this.selectedTemplate['elementName'],
      serverurl: this.selectedTemplate['serverurl'], serverid: this.selectedTemplate['serverid'],
      templatevalidated: status === 'created', status,
      pending: this.bufferDoc.numbers,
      notes: this.isTemplateAvailable ? this.selectedTemplate['notes'] : this.notes,
      parameterConfig: this.buildParamConfigForSave(), paramFillMode: this.getDominantFillMode(),
      templateData: { ...this.selectedTemplate },
      watiCategory: this.selectedWatiCategory || null,
      workshopTitle: this.workshopTitle,
    };
    if (status === 'queued') { archiveDoc.queuedAt = serverTimestamp(); archiveDoc.templatevalidated = false; }
    if (this.uploadedFile && this.fileUploadUrl) {
      archiveDoc.excelFile = {
        originalName: this.uploadedFile.name, downloadUrl: this.fileUploadUrl,
        uploadedAt: serverTimestamp(), totalNumbers: this.phoneNumbers.length,
        validNumbers: this.validNumbers.length, invalidNumbers: this.invalidNumbers.length,
        invalidNumbersList: this.invalidNumbers, headers: this.excelHeaders,
      };
    }
    if (this.selectedTemplate['customParams']) this.selectedTemplate['customParams'].forEach((e: any) => archiveDoc.params.push(e['paramName']));
    return archiveDoc;
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUBMIT
  // ══════════════════════════════════════════════════════════════════════
  async onSubmit() {
    if (!this.isTemplatePresent()) { this.snackBar.open('Select a template first', 'Close', { duration: 3000 }); return; }
    if (this.isQueuedTemplate) { await this.sendQueuedTemplate(); return; }
    if (this.uploadedFile) await this.uploadFileToStorage();
    const docID = doc(collection(this.firestore, 'wati templates')).id;
    await this.ensureTemplateExists(docID);
    const archiveid = doc(collection(this.firestore, 'wati archive')).id;
    this.populateNumbersAndMap();
    await setDoc(doc(this.firestore, 'wati archive', archiveid), this.buildArchiveDoc(archiveid, 'created'))
      .then(() => this.dialogRef.close({ status: 'success', archiveid }))
      .catch(() => this.dialogRef.close({ status: 'failed' }));
  }

  async addtoQueueFunction() {
    if (!this.isTemplatePresent()) { this.snackBar.open('Select a template first', 'Close', { duration: 3000 }); return; }
    if (this.uploadedFile) await this.uploadFileToStorage();
    const docID = doc(collection(this.firestore, 'wati templates')).id;
    await this.ensureTemplateExists(docID);
    const archiveid = doc(collection(this.firestore, 'wati archive')).id;
    this.populateNumbersAndMap();
    await setDoc(doc(this.firestore, 'wati archive', archiveid), this.buildArchiveDoc(archiveid, 'queued'))
      .then(() => { this.snackBar.open('Added to queue', 'Close', { duration: 3000 }); this.dialogRef.close('queued'); })
      .catch(() => this.dialogRef.close('failed'));
  }

  closeDialog() { this.dialogRef.close(null); }

  // ══════════════════════════════════════════════════════════════════════
  // SCHEDULE
  // ══════════════════════════════════════════════════════════════════════
  onScheduleToggle() {
    if (this.isScheduled) {
      const def = new Date(Date.now() + 3600000);
      this.scheduleDate = def;
      let h = def.getHours();
      this.schedulePeriod = h >= 12 ? 'PM' : 'AM';
      if (h === 0) h = 12; else if (h > 12) h -= 12;
      this.scheduleHour = String(h).padStart(2, '0');
      const rm = Math.ceil(def.getMinutes() / 5) * 5;
      this.scheduleMinute = String(rm >= 60 ? 0 : rm).padStart(2, '0');
    } else { this.scheduleDate = null; this.scheduleHour = ''; this.scheduleMinute = ''; }
  }

  getScheduledDateTime(): Date | null {
    if (!this.scheduleDate || !this.scheduleHour || !this.scheduleMinute) return null;
    const d = new Date(this.scheduleDate);
    let h = parseInt(this.scheduleHour, 10);
    if (this.schedulePeriod === 'AM' && h === 12) h = 0;
    else if (this.schedulePeriod === 'PM' && h !== 12) h += 12;
    d.setHours(h, parseInt(this.scheduleMinute, 10), 0, 0);
    return d;
  }

  isScheduleValid(): boolean {
    if (!this.isScheduled) return true;
    const dt = this.getScheduledDateTime();
    return dt !== null && dt > new Date();
  }

  getSchedulePreviewText(): string {
    const dt = this.getScheduledDateTime();
    if (!dt) return '';
    return dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  }

  dateFilter = (d: Date | null): boolean => {
    if (!d) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return d >= today;
  };

  setQuickDate(option: 'today' | 'tomorrow' | 'nextWeek') {
    const d = new Date();
    if (option === 'tomorrow') d.setDate(d.getDate() + 1);
    else if (option === 'nextWeek') d.setDate(d.getDate() + 7);
    this.scheduleDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  isQuickDate(option: 'today' | 'tomorrow' | 'nextWeek'): boolean {
    if (!this.scheduleDate) return false;
    const d = new Date();
    if (option === 'tomorrow') d.setDate(d.getDate() + 1);
    else if (option === 'nextWeek') d.setDate(d.getDate() + 7);
    return this.scheduleDate.getFullYear() === d.getFullYear() && this.scheduleDate.getMonth() === d.getMonth() && this.scheduleDate.getDate() === d.getDate();
  }

  async onScheduleSubmit() {
    if (!this.isTemplatePresent()) { this.snackBar.open('Select a template first', 'Close', { duration: 3000 }); return; }
    if (!this.isScheduleValid()) { this.snackBar.open('Select a valid future date and time', 'Close', { duration: 3000 }); return; }
    if (this.uploadedFile) await this.uploadFileToStorage();
    const docID = doc(collection(this.firestore, 'wati templates')).id;
    await this.ensureTemplateExists(docID);
    const archiveid = doc(collection(this.firestore, 'wati archive')).id;
    this.populateNumbersAndMap();
    const scheduledAt = this.getScheduledDateTime()!;
    const archiveDoc = this.buildArchiveDoc(archiveid, 'scheduled');
    archiveDoc.scheduledAt = scheduledAt;
    archiveDoc.scheduledDateISO = scheduledAt.toISOString();
    await setDoc(doc(this.firestore, 'wati archive', archiveid), archiveDoc)
      .then(() => { this.snackBar.open(`Scheduled for ${this.getSchedulePreviewText()}`, 'Close', { duration: 4000 }); this.dialogRef.close({ status: 'scheduled', archiveid }); })
      .catch(() => this.dialogRef.close({ status: 'failed' }));
  }

  // ══════════════════════════════════════════════════════════════════════
  // PARAMETER PRESETS
  // ══════════════════════════════════════════════════════════════════════
  private getPresetStorageKey(): string { return `${this.PARAM_PRESETS_KEY}__${this.selectedTemplate?.['elementName'] || ''}__${this.selectedTemplate?.['serverid'] || ''}`; }

  loadPresetsForTemplate() {
    this.savedPresets = []; this.selectedPresetName = '';
    if (!this.selectedTemplate?.['elementName']) return;
    try { const raw = localStorage.getItem(this.getPresetStorageKey()); if (raw) this.savedPresets = JSON.parse(raw); } catch { this.savedPresets = []; }
  }

  saveCurrentParamsAsPreset() {
    const name = this.newPresetName.trim();
    if (!name) { this.snackBar.open('Enter a preset name', 'Close', { duration: 2000 }); return; }
    this.savedPresets = this.savedPresets.filter(p => p.name !== name);
    this.savedPresets.unshift({ name, params: this.templateParams.map(p => ({ ...p })) });
    localStorage.setItem(this.getPresetStorageKey(), JSON.stringify(this.savedPresets));
    this.snackBar.open(`Preset "${name}" saved`, 'Close', { duration: 2000 });
    this.newPresetName = ''; this.showPresetSaveInput = false;
  }

  applyPreset(preset: { name: string; params: TemplateParam[] }) {
    for (const saved of preset.params) {
      const t = this.templateParams.find(p => p.name === saved.name);
      if (t) { t.fillType = saved.fillType; t.staticValue = saved.staticValue || ''; t.metadataField = saved.metadataField || ''; t.excelColumn = saved.excelColumn || ''; }
    }
    this.selectedPresetName = preset.name;
    this.updatePreview();
    this.snackBar.open(`Preset "${preset.name}" applied`, 'Close', { duration: 2000 });
  }

  deletePreset(event: Event, preset: { name: string; params: TemplateParam[] }) {
    event.stopPropagation();
    this.savedPresets = this.savedPresets.filter(p => p.name !== preset.name);
    localStorage.setItem(this.getPresetStorageKey(), JSON.stringify(this.savedPresets));
    if (this.selectedPresetName === preset.name) this.selectedPresetName = '';
    this.snackBar.open(`Preset deleted`, 'Close', { duration: 2000 });
  }
}
