import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, inject, EnvironmentInjector, runInInjectionContext  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { MatInputModule }     from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule }    from '@angular/material/button';
import { MatSelectModule }    from '@angular/material/select';
import { MatIconModule }      from '@angular/material/icon';
import { MatTableModule }     from '@angular/material/table';
import { Firestore, doc, setDoc, collection, getDoc, collectionData, getDocs, DocumentReference } from '@angular/fire/firestore';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Storage, ref as storageRef, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { catchError } from 'rxjs/operators';
import { Auth, user } from '@angular/fire/auth';
import { authState } from '@angular/fire/auth';
import { switchMap, map } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

export type ModalType = 'orientation' | 'timecompression' | 'detail' | 'applocked' | null;

export interface ContentUrlOption {
  id: string;
  title: string;
  type: string;
  url: string;
  thumbnailUrl: string;
  path: string;
}

/** Option from the `journey` collection */
export interface JourneyOption {
  id: string;
  label: string;   // display name shown in dropdown
  path: string;    // e.g. "journey/HUyBaaUc1J4iqeH2E8Ey"
}

export interface JourneyOnboardingRow {
  docid: string;
  journeyTitle: string;
  lastUpdated: string;
  updatedBy: string;
  raw?: any;
}

/** Generates a Firestore-style random 20-character document ID */
function generateDocId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 20; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

@Component({
  selector: 'app-journey-onboarding-detail',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatInputModule, MatFormFieldModule, MatButtonModule,
    MatSelectModule, MatIconModule, MatTableModule, DragDropModule
  ],
  templateUrl: './journey-onboarding-detail.component.html',
  styleUrls: ['./journey-onboarding-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JourneyOnboardingDetailComponent implements OnInit {

  private firestore = inject(Firestore);
  private storage   = inject(Storage);
  private fb        = inject(FormBuilder);
  private cdr       = inject(ChangeDetectorRef);
  private auth = inject(Auth);
  private injector = inject(EnvironmentInjector);
  private currentUserName = 'Admin'; // fallback

  // ── Modal state ───────────────────────────────────────────────
  activeModal: ModalType = null;

  // ── Table ─────────────────────────────────────────────────────
  displayedColumns = ['journey', 'lastUpdated'];
  tableRows: JourneyOnboardingRow[] = [];

  // ── content_urls options ───────────────────────────────────────
  contentUrlOptions: ContentUrlOption[] = [];
  contentUrlsLoading = false;

  // ── Journey options (from `journey` collection) ────────────────
  journeyOptions: JourneyOption[] = [];
  journeyOptionsLoading = false;

  /**
   * True when the detail modal was opened by clicking a table row (edit mode).
   * In edit mode the journey dropdown is shown but disabled.
   */
  isEditMode = false;
  detailSaveToast = false;
  detailSaveError = '';

  // ── Selected single-ref previews ───────────────────────────────
  selectedRefs: Record<string, ContentUrlOption | null> = {};

  // ── Image previews / pending uploads ──────────────────────────
  imagePreviews: Record<string, string> = {};
  pendingFiles:  Record<string, File>   = {};

  // ── Orientation form ──────────────────────────────────────────
  orientationForm!: FormGroup;
  orientationSaving = false;
  orientationSaved  = false;

  // ── Time Compression form ─────────────────────────────────────
  timeCompressionForm!: FormGroup;
  timeCompressionSaving = false;
  timeCompressionSaved  = false;

  // ── Product bottom sheet ───────────────────────────────────────
  productSheetOpen = false;
  activeProductType: 'queue' | 'event' | 'others' | null = null;
  productSheetTitle = '';
  showProcessStepsPage = false;

  // ── Detail form ───────────────────────────────────────────────
  detailForm!: FormGroup;
  detailLoading   = false;
  detailSubmitted = false;
  editingIndex: number | null = null;
  journeySelected = false;
  screenorderInput = '';
  solarVoiceOptions: any[] = [];
  seriesOptions: any[] = [];
  appLockedForm!: FormGroup;
  previewData: any = {};
  currentPage = 1;
  detailTabIndex = 0;
  readonly detailTabs = [
    { label: 'Intro',            screen: 'intro' },
    { label: 'Journey Overview', screen: 'journeyOverview' },
    { label: 'Journey Desc.',    screen: 'journeyDescripition' },
    { label: 'Subscription',     screen: 'subscription' },
    { label: 'Experience',       screen: 'journeyExperience' },
    { label: 'Product Overview', screen: 'productOverview' },
  ];
  screenorderTags = [
    'intro',               // 0
    'journeyOverview',     // 1
    'journeyDescripition', // 2
    'subscription',        // 3
    'journeyExperience',   // 4
    'eventDescription',    // 5
    'otherDescription',    // 6
    'queueDescription',    // 7
    'processSteps',
    'productOverview',     // 8
  ];

  readonly productTypeOptions = ['queue', 'event', 'others'] as const;
  showProductDetailsPage: 'event' | 'queue' | 'others' | null = null;

  // ── Tick indicators ───────────────────────────────────────────
  get isOrientationFilled(): boolean { return !!(this.orientationForm?.value?.duration); }
  get isTimeCompressionFilled(): boolean { return !!(this.timeCompressionForm?.value?.tc_intro); }
  get isDetailFilled(): boolean { return this.tableRows.length > 0; }

  // ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.buildOrientationForm();
    this.buildTimeCompressionForm();
    this.buildDetailForm();
    this.loadTable();
    this.loadContentUrls();
    this.loadJourneys();
    this.loadSolarVoiceAudios();
    this.loadSeries();
    this.loadAppLockedData();
    this.buildAppLockedForm();
    this.loadOrientationData();
    this.loadTimeCompressionData();
    this.currentUserName$.subscribe(name => {
      this.currentUserName = name;
    });
    authState(this.auth).subscribe(user => {
      // console.log('AUTH USER:', user);
    });
  }

  currentUserName$: Observable<string> = authState(this.auth).pipe(
    switchMap(user => {
      if (!user?.uid) return of('Admin');

      return collectionData(collection(this.firestore, 'profile_data')).pipe(
        map((profiles: any[]) => {
          const profile = profiles.find(p => p.uid === user.uid);
          return profile?.name || user.email || 'Admin';
        })
      );
    })
  );

  // ─────────────────────────────────────────────────────────────
  // Load `journey` collection for dropdown
  // ─────────────────────────────────────────────────────────────
  private async loadJourneys(): Promise<void> {
    this.journeyOptionsLoading = true;
    this.cdr.markForCheck();
    try {
      const snap = await getDocs(collection(this.firestore, 'journey'));
      this.journeyOptions = snap.docs.map(d => {
        const data = d.data() as any;
        // Use the best available label field; fall back to the doc ID
        const label = data.journey ?? data.name ?? data.title ?? data.type ?? d.id;
        return { id: d.id, label, path: `journey/${d.id}` } as JourneyOption;
      });
    } catch (err) {
      console.error('Failed to load journey collection:', err);
    } finally {
      this.journeyOptionsLoading = false;
      this.cdr.markForCheck();
    }
  }

  drop(event: CdkDragDrop<string[]>, field: string) {
    const list = [...this.appLockedForm.value[field]];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.appLockedForm.patchValue({
      [field]: list
    });
    this.cdr.markForCheck();
    this.saveAppLocked();
  }

  openPreviewSheet(type: string): void {
    if (type === 'queue') this.currentScreen = 'queueDescription';
    else if (type === 'event') this.currentScreen = 'eventDescription';
    else this.currentScreen = 'otherDescription';

    // Also open the corresponding sub-page in the form panel
    this.showProductDetailsPage = type as 'event' | 'queue' | 'others';
    this.showProcessStepsPage = false;
    this.detailTabIndex = 4;
    this.cdr.markForCheck();
  }

  openProduct(type: string) {
    if (type === 'queue') {
      this.currentScreen = 'queueDescription';
    } else if (type === 'event') {
      this.currentScreen = 'eventDescription';
    } else {
      this.currentScreen = 'otherDescription';
    }
  }

  closeProductSheet(): void {
    this.productSheetOpen = false;
    this.activeProductType = null;
    this.detailTabIndex = 4;
    this.currentScreen = 'intro';
    this.cdr.markForCheck();
  }

  openProcessSteps(): void {
    this.showProcessStepsPage = true;
    this.currentScreen = 'processSteps';
    this.cdr.markForCheck();
  }

  goBackToQueue(): void {
    this.showProcessStepsPage = false;
    this.showFullProcess = false;
    this.currentScreen = 'queueDescription';
    this.cdr.markForCheck();
  }

  nextDetailTab(): void {
    if (this.detailTabIndex >= this.detailTabs.length - 1) return;
    if (!this.isTabFilled(this.detailTabIndex)) {
      this.detailForm.markAllAsTouched();
      this.cdr.markForCheck();
      return;
    }
    this.detailTabIndex++;
    this.currentScreen = this.detailTabs[this.detailTabIndex].screen;
    this.cdr.markForCheck();
  }

  prevDetailTab(): void {
    if (this.detailTabIndex > 0) {
      this.detailTabIndex--;
      this.currentScreen = this.detailTabs[this.detailTabIndex].screen;
      this.productSheetOpen = false;
      this.activeProductType = null;
      this.cdr.markForCheck();
    }
  }

  hasProductType(type: string): boolean {
    return this.productincluded.controls.some(
      c => c.get('type')?.value === type
    );
  }

  // CHANGE TO match new tab order
  isTabFilled(tabIndex: number): boolean {
    const v = this.detailForm?.value;
    if (!v) return false;
    switch (tabIndex) {
      case 0: return !!(v.introduction || v.introductionvideo);
      case 1: return !!(v.overviewdescription || v.overviewvideoDocId);
      case 2: return !!(v.journeydetail?.intro || v.journeydetail?.descripition);
      case 3: return !!(v.subscription?.imageurl || this.imagePreviews['subscription_imageurl']);
      case 4: return (v.productincluded ?? []).some((p: any) => p.title);
      case 5: return !!(v.journeydetail?.intro || v.journeydetail?.imageurl);
      default: return false;
    }
  }

  showFullProcess = false;

  toggleFullProcess(): void {
    this.showFullProcess = !this.showFullProcess;
    this.cdr.markForCheck();
  }

  onTabChange(index: number, tab: any) {
    this.showFullProcess = false;
    this.showProductDetailsPage = null;
    this.showProcessStepsPage = false;
    this.detailTabIndex = index;
    this.currentScreen = tab.screen;
    this.productSheetOpen = false;
    this.activeProductType = null;
    this.cdr.markForCheck();
  }

  getSelectedContentUrlIds(): string[] {
    return this.contentUrls.controls
      .map(c => c.get('docId')?.value)
      .filter(Boolean);
  }

  onTcMultiSelect(ids: string[]): void {
    const cuArr = this.contentUrls;
    while (cuArr.length) cuArr.removeAt(0);
    ids.filter(Boolean).forEach(id => {
      const opt = this.contentUrlOptions.find(o => o.id === id);
      cuArr.push(this.newContentUrl({
        docId: id,
        path: `content_urls/${id}`,
        title: opt?.title ?? '',
        thumbnailUrl: opt?.thumbnailUrl ?? '',
      }));
    });
    this.cdr.markForCheck();
  }

  dropContentUrls(event: CdkDragDrop<string[]>): void {
    const arr = this.contentUrls;
    const ctrl = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex);
    arr.insert(event.currentIndex, ctrl);
    this.cdr.markForCheck();
  }

  isScreen(name: string): boolean {
    return this.currentScreen === name;
  }

  currentScreen = 'intro';

  buildPreview(v: any) {
    this.previewData = {
      intro: {
        name: this.getJourneyName(v.journeyrefDocId),
        intro: v.eventdescripition?.intro || '',
        video: v.introductionvideo
      },

      journeyOverview: {
        title: this.getJourneyName(v.journeyrefDocId),
        overviewVideo: v.overviewvideo,
        goalVideo: v.eventdescripition?.goalvideourl
      },

      journeyDescripition: v.journeydescription,

      subscription: v.subscription,

      journeyExperience: v.productincluded || [],

      productOverview: v.journeydescription
    };

    this.cdr.markForCheck();
  }

  getSolarVoiceName(id: string): string {
    return this.solarVoiceOptions.find(x => x.id === id)?.name || id;
  }

  getContentTitle(id: string): string {
    return this.contentUrlOptions.find(x => x.id === id)?.title || id;
  }

  getSeriesName(id: string): string {
    return this.seriesOptions.find(x => x.id === id)?.name || id;
  }

  getJourneyName(id: string): string {
    if (!id) return '';

    return this.journeyOptions.find(j => j.id === id)?.label || id;
  }

  private async loadSeries() {
    const snap = await getDocs(collection(this.firestore, 'series'));
    this.seriesOptions = snap.docs.map(d => ({
      id: d.id,
      name: d.data()['seriesName'] || d.id,
      path: `series/${d.id}`
    }));
  }

  private buildAppLockedForm(): void {
    this.appLockedForm = this.fb.group({
      solarvoiceplaylist: [[]],
      generalcontentplaylist: [[]],
      eiflixplaylist: [[]],
    });
  }

  async saveAppLocked(): Promise<void> {
    const v = this.appLockedForm.value;

    const payload = {
      // ✅ FIXED
      solarvoiceplaylist: v.solarvoiceplaylist.map((id: string) =>
        this.toRef(`solar voice playlist/${id}`)
      ),

      generalcontentplaylist: v.generalcontentplaylist.map((id: string) =>
        this.toRef(`content_urls/${id}`)
      ),

      eiflixplaylist: v.eiflixplaylist.map((id: string) =>
        this.toRef(`series/${id}`)
      ),
    };

    await setDoc(
      doc(this.firestore, 'classify', 'applockedcontent'),
      payload,
      { merge: true }
    );

    console.log('Saved applockedcontent:', payload);
  }

  private async loadAppLockedData() {
    const snap = await getDoc(doc(this.firestore, 'classify', 'applockedcontent'));
    if (!snap.exists()) return;

    const d = snap.data() as any;

    this.appLockedForm.patchValue({
      solarvoiceplaylist: (d.solarvoiceplaylist || []).map((r: any) => r.id),
      generalcontentplaylist: (d.generalcontentplaylist || []).map((r: any) => r.id),
      eiflixplaylist: (d.eiflixplaylist || []).map((r: any) => r.id),
    });
  }

  private async loadOrientationData(): Promise<void> {
    try {
      const snap = await getDoc(doc(this.firestore, 'classify', 'journeyorientation'));
      if (!snap.exists()) return;
      const d = snap.data() as any;
      // Rebuild intro FormArray to match saved length
      const introArr = this.introItems;
      while (introArr.length > 0) introArr.removeAt(0);
      const introData: any[] = d.introduction ?? [{}];
      introData.forEach((item: any) => introArr.push(this.newIntroItem(item)));
      this.orientationForm.patchValue({ duration: d.duration ?? '' });
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to load orientation data:', err);
    }
  }

  private async loadTimeCompressionData(): Promise<void> {
    try {
      const snap = await getDoc(doc(this.firestore, 'classify', 'timecompression'));
      if (!snap.exists()) return;
      const d = snap.data() as any;
      // Rebuild contenturl FormArray
      const cuArr = this.contentUrls;
      while (cuArr.length > 0) cuArr.removeAt(0);
      const cuData: any[] = d.contenturl ?? [{}];
      cuData.forEach((ref: any) => {
        // ref is a Firestore DocumentReference — extract the id
        const refId = ref?.id ?? '';
        const opt = this.contentUrlOptions.find(o => o.id === refId) ?? null;
        cuArr.push(this.newContentUrl({
          docId:        refId,
          path:         refId ? `content_urls/${refId}` : '',
          title:        opt?.title        ?? '',
          thumbnailUrl: opt?.thumbnailUrl ?? '',
        }));
      });
      this.timeCompressionForm.patchValue({
        tc_intro:              d.intro              ?? '',
        tc_description:        d.description        ?? '',
        tc_contentdescription: d.contentdescription ?? '',
      });
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to load time compression data:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Load content_urls collection
  // ─────────────────────────────────────────────────────────────
  private async loadContentUrls(): Promise<void> {
    this.contentUrlsLoading = true;
    this.cdr.markForCheck();
    try {
      const snap = await getDocs(collection(this.firestore, 'content_urls'));
      this.contentUrlOptions = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id:           d.id,
          title:        data.title ?? d.id,
          type:         data.type  ?? 'unknown',
          url:          data.url   ?? data.url_download ?? '',
          thumbnailUrl: data.thumbnail ?? data.url_thumbnail ?? data.thumbnailhls?.url_preview ?? '',
          path:         `content_urls/${d.id}`,
        } as ContentUrlOption;
      });
    } catch (err) {
      console.error('Failed to load content_urls:', err);
    } finally {
      this.contentUrlsLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async loadSolarVoiceAudios() {
    const snap = await getDocs(collection(this.firestore, 'solar voice playlist'));
    this.solarVoiceOptions = snap.docs.map(d => ({
      id: d.id,
      name: d.data()['name'] || d.id,
      path: `content_urls/${d.id}` // ⚠️ matches your DB pattern
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Modal navigation
  // ─────────────────────────────────────────────────────────────
  openModal(modal: ModalType): void {
    if (modal === 'detail') {
      this.currentScreen = 'intro';
      this.detailTabIndex = 0;
      this.isEditMode      = false;
      this.buildDetailForm();
      this.detailSubmitted = false;
      this.imagePreviews   = {};
      this.pendingFiles    = {};
      this.selectedRefs    = {};
      this.journeySelected = false;
      this.showProductDetailsPage = null;
      this.showProcessStepsPage = false;
    }
    this.activeModal = modal;
    this.cdr.markForCheck();
  }

  openAddDetail(): void {
    this.isEditMode      = false;
    this.journeySelected = false;
    this.buildDetailForm();
    this.detailSubmitted = false;
    this.imagePreviews   = {};
    this.pendingFiles    = {};
    this.detailTabIndex = 0;
    this.selectedRefs    = {};
    this.activeModal     = 'detail';
    this.cdr.markForCheck();
  }


  get availableJourneyOptions(): JourneyOption[] {
    const usedIds = new Set<string>();
    for (const r of this.tableRows) {
      const raw = r.raw?.journeyref;
      if (!raw) continue;
      if (raw?.id) { usedIds.add(raw.id); continue; }
      if (typeof raw === 'string' && raw.trim()) {
        usedIds.add(raw.trim().replace(/^\/?journey\//, ''));
      }
    }
    return this.journeyOptions.filter(j => !usedIds.has(j.id));
  }

  closeModal(): void {
    this.activeModal  = null;
    this.editingIndex = null;
    this.isEditMode   = false;
    this.showProductDetailsPage = null;
    this.showProcessStepsPage = false;
    this.cdr.markForCheck();
  }

  // editRow(row: JourneyOnboardingRow, index: number): void {
  //   this.editingIndex    = index;
  //   this.isEditMode      = true;   // journey dropdown becomes read-only
  //   this.detailSubmitted = false;
  //   this.imagePreviews   = {};
  //   this.pendingFiles    = {};
  //   this.selectedRefs    = {};
  //   this.buildDetailForm(row.raw);
  //   this.activeModal     = 'detail';
  //   this.cdr.markForCheck();
  //   this.journeySelected = true;
  // }
  // In editRow(), replace the direct buildDetailForm call:

      editRow(row: JourneyOnboardingRow, index: number): void {
        this.editingIndex    = index;
        this.isEditMode      = true;
        this.detailSubmitted = false;
        this.imagePreviews   = {};
        this.pendingFiles    = {};
        this.selectedRefs    = {};
        this.detailTabIndex  = 0;
        // this.currentIndex    = 0;

        this.buildDetailForm(row.raw);

        const raw = row.raw;
        if (raw?.introductionvideo)
          this.imagePreviews['introductionvideo'] = raw.introductionvideo;
        if (raw?.journeypath?.imageurl)
          this.imagePreviews['journeypath_imageurl'] = raw.journeypath.imageurl;
        if (raw?.journeydetail?.imageurl)
          this.imagePreviews['journeydetail_imageurl'] = raw.journeydetail.imageurl;
        if (raw?.subscription?.imageurl)
          this.imagePreviews['subscription_imageurl'] = raw.subscription.imageurl;
        if (raw?.queuedescripition?.processimage)
          this.imagePreviews['processimage'] = raw.queuedescripition.processimage;
        (raw?.queuedescripition?.processdetails?.step ?? []).forEach((s: any, i: number) => {
          if (s?.imageurl) this.imagePreviews[`step_imageurl_${i}`] = s.imageurl;
        });

        this.activeModal     = 'detail';
        this.journeySelected = true;
        this.cdr.markForCheck();
      }

  // ─────────────────────────────────────────────────────────────
  // Form builders
  // ─────────────────────────────────────────────────────────────
  private buildOrientationForm(): void {
    this.orientationForm = this.fb.group({
      duration:     ['', Validators.required],
      introduction: this.fb.array([this.newIntroItem()]),
    });
  }

  private buildTimeCompressionForm(): void {
    this.timeCompressionForm = this.fb.group({
      tc_intro:              ['', Validators.required],
      tc_description:        [''],
      tc_contentdescription: [''],
      contenturl:            this.fb.array([this.newContentUrl()]),
    });
  }

  private buildDetailForm(prefill?: any): void {
    const p = prefill ?? {};

    // docid: keep existing when editing; auto-generate for new entries
    const docid = p.docid ?? generateDocId();

    // Resolve journeyref → extract the doc ID for the dropdown binding.
    // Firestore may store it as a DocumentReference object, a path string, or nothing.
    let journeyDocId = '';
    const rawRef = p.journeyref;
    if (rawRef) {
      if (typeof rawRef === 'string') {
        journeyDocId = rawRef.replace(/^\/?journey\//, '');
      } else if (rawRef?.path) {
        journeyDocId = (rawRef.path as string).replace(/^journey\//, '');
      } else if (rawRef?.id) {
        journeyDocId = rawRef.id;
      }
    }
    // if (p.overviewvideo) {
    //   const id = typeof p.overviewvideo === 'string'
    //     ? p.overviewvideo.replace('content_urls/', '')
    //     : p.overviewvideo?.id;

    //   this.detailForm.patchValue({
    //     overviewvideoDocId: id
    //   });

    //   this.selectedRefs['overviewvideo'] =
    //     this.contentUrlOptions.find(o => o.id === id) ?? null;
    // }

    // if (p.goalvideourl) {
    //   const id = typeof p.goalvideourl === 'string'
    //     ? p.goalvideourl.replace('content_urls/', '')
    //     : p.goalvideourl?.id;

    //   (this.detailForm.get('eventdescripition') as FormGroup)
    //     .patchValue({
    //       goalvideourlDocId: id
    //     });

    //   this.selectedRefs['goalvideourl'] =
    //     this.contentUrlOptions.find(o => o.id === id) ?? null;
    // }


    this.detailForm = this.fb.group({
      docid:          [docid],
      journeyrefDocId:[{ value: journeyDocId, disabled: !!prefill }, Validators.required],
      journeyref:     [p.journeyref ?? ''],
      overviewvideoDocId: [''],

      eventdescripition: this.fb.group({
        title:                [p.eventdescripition?.title                ?? '', Validators.required],
        intro:                [p.eventdescripition?.intro                ?? '', Validators.required],
        overview:             [p.eventdescripition?.overview             ?? '', Validators.required],
        overviewdescripition: [p.eventdescripition?.overviewdescripition ?? '', Validators.required],
        goalvideourlDocId:    [''],
        goalvideourl:         [''],
      }),

      introduction:        [p.introduction      ?? '', Validators.required],
      introductionvideo:   [p.introductionvideo ?? '', Validators.required],
      overviewdescription: [p.overviewdescription ?? '', Validators.required],
      overviewvideo:       [p.overviewvideo ?? ''],

      journeydetail: this.fb.group({
        intro:        [p.journeydetail?.intro        ?? '', Validators.required],
        descripition: [p.journeydetail?.descripition ?? '', Validators.required],
        imageurl:     [p.journeydetail?.imageurl     ?? '', Validators.required],
      }),

      journeypath: this.fb.group({
        intro:        [p.journeypath?.intro        ?? ''],
        descripition: [p.journeypath?.descripition ?? ''],
        imageurl:     [p.journeypath?.imageurl     ?? ''],
      }),

      otherdescripition: this.fb.group({
        title:        [p.otherdescripition?.title        ?? '', Validators.required],
        descripition: [p.otherdescripition?.descripition ?? '', Validators.required],
      }),

      subscription: this.fb.group({
        descripition: [p.subscription?.descripition ?? '', Validators.required],
        imageurl:     [p.subscription?.imageurl     ?? '', Validators.required],
      }),

      productincluded: this.fb.array(
        (p.productincluded ?? [{}]).map((x: any) => this.newProduct(x))
      ),

      queuedescripition: this.fb.group({
        title:        [p.queuedescripition?.title        ?? ''],
        descripition: [p.queuedescripition?.descripition ?? ''],
        atcmodel: this.fb.group({
          title:        [p.queuedescripition?.atcmodel?.title        ?? ''],
          descripition: [p.queuedescripition?.atcmodel?.descripition ?? ''],
        }),
        processimage: [p.queuedescripition?.processimage ?? ''],
        processdetails: this.fb.group({
          title:        [p.queuedescripition?.processdetails?.title        ?? ''],
          descripition: [p.queuedescripition?.processdetails?.descripition ?? ''],
          step: this.fb.array(
            (p.queuedescripition?.processdetails?.step ?? [{}]).map((x: any) => this.newProcessStep(x))
          ),
        }),
      }),
    });

    // ── Patch reference fields AFTER form is built ──────────────
    if (p.overviewvideo) {
      const id = typeof p.overviewvideo === 'string'
        ? p.overviewvideo.replace('content_urls/', '')
        : p.overviewvideo?.id ?? '';
      if (id) {
        this.detailForm.patchValue({ overviewvideoDocId: id });
        this.selectedRefs['overviewvideo'] =
          this.contentUrlOptions.find(o => o.id === id) ?? null;
      }
    }

    if (p.eventdescripition?.goalvideourl || p.goalvideourl) {
      const raw = p.eventdescripition?.goalvideourl ?? p.goalvideourl;
      const id = typeof raw === 'string'
        ? raw.replace('content_urls/', '')
        : raw?.id ?? '';
      if (id) {
        (this.detailForm.get('eventdescripition') as FormGroup)
          .patchValue({ goalvideourlDocId: id });
        this.selectedRefs['goalvideourl'] =
          this.contentUrlOptions.find(o => o.id === id) ?? null;
      }
    }
    this.detailForm.valueChanges.subscribe(v => {
      this.buildPreview(v);
    });
    // if (prefill?.screenorder) this.screenorderTags = [...prefill.screenorder];
    this.currentScreen = 'intro';
  }

  // ─────────────────────────────────────────────────────────────
  // Factories
  // ─────────────────────────────────────────────────────────────
  newIntroItem(v?: any): FormGroup {
    return this.fb.group({ title: [v?.title ?? ''], description: [v?.description ?? ''] });
  }
  newContentUrl(v?: any): FormGroup {
    return this.fb.group({
      docId:        [v?.docId        ?? ''],
      path:         [v?.path         ?? ''],
      title:        [v?.title        ?? ''],
      thumbnailUrl: [v?.thumbnailUrl ?? ''],
    });
  }

  newProduct(v?: any): FormGroup {
    return this.fb.group({
      title:        [v?.title        ?? '', Validators.required],
      descripition: [v?.descripition ?? '', Validators.required],
      type:         [v?.type         ?? 'queue', Validators.required],
    });
  }

  newProcessStep(v?: any): FormGroup {
    return this.fb.group({
      title:        [v?.title        ?? ''],
      descripition: [v?.descripition ?? ''],
      imageurl:     [v?.imageurl     ?? ''],
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────
  get introItems(): FormArray      { return this.orientationForm.get('introduction') as FormArray; }
  get contentUrls(): FormArray     { return this.timeCompressionForm.get('contenturl') as FormArray; }
  get productincluded(): FormArray { return this.detailForm.get('productincluded') as FormArray; }
  get processSteps(): FormArray {
    return this.detailForm.get('queuedescripition.processdetails.step') as FormArray;
  }
  addIntroItem(): void               { this.introItems.push(this.newIntroItem()); }
  removeIntroItem(i: number): void   { this.introItems.removeAt(i); }
  addContentUrl(): void              { this.contentUrls.push(this.newContentUrl()); }
  removeContentUrl(i: number): void  { this.contentUrls.removeAt(i); }
  addProduct(): void                 { this.productincluded.push(this.newProduct()); }
  removeProduct(i: number): void     { this.productincluded.removeAt(i); }
  addProcessStep(): void             { this.processSteps.push(this.newProcessStep()); }
  removeProcessStep(i: number): void { this.processSteps.removeAt(i); }

  // ─────────────────────────────────────────────────────────────
  // Journey ref selection handler
  // ─────────────────────────────────────────────────────────────
  onJourneyRefSelect(journeyDocId: string): void {
    this.journeySelected = !!journeyDocId;
    this.detailForm.patchValue({
      journeyref: journeyDocId ? `journey/${journeyDocId}` : '',
    });
    this.cdr.markForCheck();
  }

  /** Display label for the selected journey (edit-mode readonly view) */
  get selectedJourneyLabel(): string {
    const id = this.detailForm?.get('journeyrefDocId')?.value;
    if (!id) return '—';
    return this.journeyOptions.find(j => j.id === id)?.label ?? id;
  }

  // ─────────────────────────────────────────────────────────────
  // Content URL selection handlers
  // ─────────────────────────────────────────────────────────────
  onTcContentUrlSelect(docId: string, index: number): void {
    const opt   = this.contentUrlOptions.find(o => o.id === docId);
    const group = this.contentUrls.at(index) as FormGroup;
    group.patchValue({
      path:         opt ? `content_urls/${opt.id}` : '',
      title:        opt?.title        ?? '',
      thumbnailUrl: opt?.thumbnailUrl ?? '',
    });
    this.cdr.markForCheck();
  }

  onSingleRefSelect(docId: string, fieldKey: string): void {
    const opt = this.contentUrlOptions.find(o => o.id === docId) ?? null;
    this.selectedRefs[fieldKey] = opt;
    const path = opt ? `content_urls/${opt.id}` : '';

    if (fieldKey === 'overviewvideo') {
      this.detailForm.patchValue({
        overviewvideoDocId: docId,
        overviewvideo:      path,
      });
    } else if (fieldKey === 'goalvideourl') {
      (this.detailForm.get('eventdescripition') as FormGroup).patchValue({
        goalvideourlDocId: docId,
        goalvideourl:      path,
      });
    }

    this.cdr.markForCheck();
  }

  // ─────────────────────────────────────────────────────────────
  // Image upload handlers
  // ─────────────────────────────────────────────────────────────
  triggerFileInput(slot: string): void {
    (document.getElementById(`file-${slot}`) as HTMLInputElement)?.click();
  }

  onFileChange(event: Event, slot: string, formPath: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingFiles[slot] = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreviews[slot] = reader.result as string;
      this.detailForm.get(formPath)?.setValue(reader.result as string);
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  onStepFileChange(event: Event, stepIndex: number): void {
    const slot = `step_imageurl_${stepIndex}`;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingFiles[slot] = file;
    const reader = new FileReader();
    reader.onload = () => { this.imagePreviews[slot] = reader.result as string; this.cdr.markForCheck(); };
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  clearImage(event: MouseEvent, slot: string, formPath: string): void {
    event.stopPropagation();
    delete this.imagePreviews[slot];
    delete this.pendingFiles[slot];
    this.detailForm.get(formPath)?.setValue('');
    this.detailForm.get(formPath)?.markAsTouched();
    this.cdr.markForCheck();
  }

  clearStepImage(event: MouseEvent, stepIndex: number): void {
    event.stopPropagation();
    const slot = `step_imageurl_${stepIndex}`;
    delete this.imagePreviews[slot];
    delete this.pendingFiles[slot];
    (this.processSteps.at(stepIndex) as FormGroup).patchValue({ imageurl: '' });
    (this.processSteps.at(stepIndex) as FormGroup).get('imageurl')?.markAsTouched();
    this.cdr.markForCheck();
  }

  private async uploadPendingFiles(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    await Promise.all(Object.entries(this.pendingFiles).map(async ([slot, file]) => {
      const path = `journey_onboarding/${Date.now()}_${slot}_${file.name}`;
      const sRef = storageRef(this.storage, path);
      await runInInjectionContext(this.injector, async () => {
        await uploadBytes(sRef, file);
        result[slot] = await getDownloadURL(sRef);
      });
    }));
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // Tag input
  // ─────────────────────────────────────────────────────────────
  onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const val = this.screenorderInput.trim().replace(',', '');
      if (val && !this.screenorderTags.includes(val)) this.screenorderTags.push(val);
      this.screenorderInput = '';
    } else if (event.key === 'Backspace' && !this.screenorderInput && this.screenorderTags.length) {
      this.screenorderTags.pop();
    }
  }
  removeTag(i: number): void { this.screenorderTags.splice(i, 1); }

  isInvalid(form: FormGroup, path: string): boolean {
    const ctrl = form.get(path);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  // ─────────────────────────────────────────────────────────────
  // Load table
  // _lastUpdated and _updatedBy are written by saveDetail() below.
  // ─────────────────────────────────────────────────────────────
  private loadTable(): void {
    collectionData(collection(this.firestore, 'journeyonboardingdetail'), { idField: 'docid' })
      .pipe(catchError(() => of([])))
      .subscribe(async (docs: any[]) => {
        const rows = await Promise.all(docs.map(async d => {
          let journeyTitle = d.docid; // fallback
          const rawRef = d.journeyref;
          try {
            if (rawRef?.path) {
              // It's a Firestore DocumentReference object
              const jSnap = await getDoc(doc(this.firestore, rawRef.path));
              if (jSnap.exists()) {
                const jd = jSnap.data() as any;
                journeyTitle = jd.journey ?? jd.name ?? jd.title ?? jd.type ?? jSnap.id;
              }
            } else if (typeof rawRef === 'string' && rawRef.trim()) {
              const jSnap = await getDoc(doc(this.firestore, rawRef.trim()));
              if (jSnap.exists()) {
                const jd = jSnap.data() as any;
                journeyTitle = jd.journey ?? jd.name ?? jd.title ?? jd.type ?? rawRef;
              }
            }
          } catch (err) {
            console.error('Failed to resolve journeyref for', d.docid, err);
          }
          return {
            docid:        d.docid,
            journeyTitle,
            lastUpdated:  d.lastUpdated ?? '—',
            updatedBy:    d.updatedBy   ?? '—',
            raw:          d,
          };
        }));
        this.tableRows = rows;
        this.cdr.markForCheck();
      });
  }

  // ─────────────────────────────────────────────────────────────
  // Save — Orientation
  // ─────────────────────────────────────────────────────────────
  async saveOrientation(): Promise<void> {
    this.orientationForm.markAllAsTouched();
    if (this.orientationForm.invalid) { this.cdr.markForCheck(); return; }
    this.orientationSaving = true; this.cdr.markForCheck();
    try {
      const v = this.orientationForm.value;
      await setDoc(doc(this.firestore, 'classify', 'journeyorientation'), {
        duration:     String(v.duration),
        introduction: v.introduction.map((i: any) => ({ title: i.title ?? '', description: i.description ?? '' })),
      }, { merge: true });
      this.orientationSaved = true;
      setTimeout(() => { this.orientationSaved = false; this.cdr.markForCheck(); }, 2500);
    } catch (err) { console.error(err); alert('Save failed — check console.'); }
    finally { this.orientationSaving = false; this.cdr.markForCheck(); }
  }

  // ─────────────────────────────────────────────────────────────
  // Save — Time Compression
  // ─────────────────────────────────────────────────────────────
  async saveTimeCompression(): Promise<void> {
    this.timeCompressionForm.markAllAsTouched();
    if (this.timeCompressionForm.invalid) { this.cdr.markForCheck(); return; }
    this.timeCompressionSaving = true; this.cdr.markForCheck();
    try {
      const v = this.timeCompressionForm.value;
      const refs = v.contenturl
        .filter((c: any) => c.path)
        .map((c: any) => this.toRef(c.path))
        .filter(Boolean);
      await setDoc(doc(this.firestore, 'classify', 'timecompression'), {
        intro:              v.tc_intro              ?? '',
        description:        v.tc_description        ?? '',
        contentdescription: v.tc_contentdescription ?? '',
        contenturl:         refs,
      }, { merge: true });
      this.timeCompressionSaved = true;
      setTimeout(() => { this.timeCompressionSaved = false; this.cdr.markForCheck(); }, 2500);
    } catch (err) { console.error(err); alert('Save failed — check console.'); }
    finally { this.timeCompressionSaving = false; this.cdr.markForCheck(); }
  }

  // ─────────────────────────────────────────────────────────────
  // Save — Detail
  // Writes _lastUpdated (human-readable timestamp) and _updatedBy
  // so the table columns show correct values immediately.
  // ─────────────────────────────────────────────────────────────
  async saveDetail(): Promise<void> {
    console.log('Save clicked — form valid:', this.detailForm.valid, '| invalid fields:',
      Object.keys((this.detailForm as any).controls).filter(k => this.detailForm.get(k)?.invalid)
    );

    this.detailForm.markAllAsTouched();
    if (this.detailForm.invalid) { this.cdr.markForCheck(); return; }

    this.detailLoading = true; this.cdr.markForCheck();
    try {
      const uploadedUrls = await this.uploadPendingFiles();

      const v = this.detailForm.getRawValue();
      const ed = v.eventdescripition;

      const introVideoUrl   = uploadedUrls['introductionvideo']     ?? v.introductionvideo             ?? '';
      const jdImageUrl = uploadedUrls['journeydetail_imageurl'] ?? v.journeydetail?.imageurl ?? '';
      const jpImageUrl = uploadedUrls['journeypath_imageurl']   ?? v.journeypath?.imageurl   ?? '';
      const subImageUrl     = uploadedUrls['subscription_imageurl']  ?? v.subscription?.imageurl       ?? '';
      const processImageUrl = uploadedUrls['processimage'] ?? v.queuedescripition?.processimage ?? '';

      const steps = (v.queuedescripition?.processdetails?.step ?? []).map((s: any, i: number) => ({
        title:        s.title        ?? '',
        descripition: s.descripition ?? '',
        imageurl:     uploadedUrls[`step_imageurl_${i}`] ?? s.imageurl ?? '',
      }));

      // Human-readable timestamp displayed directly in the table column
      const now = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const overviewVideoPath = v.overviewvideoDocId ? `content_urls/${v.overviewvideoDocId}` : (v.overviewvideo ?? '');
      const payload: any = {

        docid:        v.docid,
        lastUpdated: now,      // ← "Last time updated" column
        updatedBy:   this.currentUserName,  // ← "Updated by" column
        journeyref:   this.toRef(v.journeyref ?? ''),
        eventdescripition: {
          title:                ed.title                ?? '',
          intro:                ed.intro                ?? '',
          overview:             ed.overview             ?? '',
          overviewdescripition: ed.overviewdescripition ?? '',
        },
        goalvideourl:      this.toRef(ed.goalvideourl ?? ''),
        introduction:      v.introduction ?? '',
        introductionvideo: introVideoUrl,
        overviewdescription: v.overviewdescription ?? '',
        overviewvideo:       this.toRef(overviewVideoPath),
        journeydetail: {
          intro:        v.journeydetail?.intro        ?? '',
          descripition: v.journeydetail?.descripition ?? '',
          imageurl:     jdImageUrl,
        },
        journeypath: {
          intro:        v.journeypath?.intro        ?? '',
          descripition: v.journeypath?.descripition ?? '',
          imageurl:     jpImageUrl,
        },
        otherdescripition: {
          title:        v.otherdescripition?.title        ?? '',
          descripition: v.otherdescripition?.descripition ?? '',
        },
        // overviewvideo:   this.toRef(v.overviewvideo ?? ''),
        productincluded: (v.productincluded ?? []).map((p: any) => ({
          title:        p.title        ?? '',
          descripition: p.descripition ?? '',
          type:         p.type         ?? 'queue',
        })),
        queuedescripition: {
          title: v.queuedescripition?.title ?? '',
          descripition: v.queuedescripition?.descripition ?? '',
          atcmodel: {
            title:        v.queuedescripition?.atcmodel?.title        ?? '',
            descripition: v.queuedescripition?.atcmodel?.descripition ?? '',
          },
          processimage: processImageUrl,
          processdetails: {
            title:        v.queuedescripition?.processdetails?.title        ?? '',
            descripition: v.queuedescripition?.processdetails?.descripition ?? '',
            step:         steps,
          },
        },
        screenorder:  [...this.screenorderTags],
        subscription: {
          descripition: v.subscription?.descripition ?? '',
          imageurl:     subImageUrl,
        },
      };
      console.log('overviewdescription being saved:', v.overviewdescription);

      await setDoc(doc(this.firestore, 'journeyonboardingdetail', v.docid), payload, { merge: true ,});
      this.detailSubmitted = true;
      this.detailSaveToast = true;
      this.editingIndex    = null;
      this.pendingFiles    = {};
      this.cdr.markForCheck();
    } catch (err) {
      console.error(err);
      alert('Save failed — check console.');
    } finally {
      this.detailLoading = false;
      this.cdr.markForCheck();
    }
  }

  isVideoUrl(url: string | null): boolean {
    if (!url) return false;
    return url.includes('.mp4')
      || url.includes('.webm')
      || url.includes('.mov')
      || url.includes('video/')
      || (url.includes('video') && !url.includes('image'));
  }

  async fixUpdatedBy(): Promise<void> {
    const snap = await getDocs(collection(this.firestore, 'journeyonboardingdetail'));

    for (const d of snap.docs) {
      await setDoc(doc(this.firestore, 'journeyonboardingdetail', d.id), {
        updatedBy: this.currentUserName
      }, { merge: true });
    }

    console.log('Updated all documents');
  }

  goToProductDetailsTab(type: string): void {
    if (!type) return;
    this.showProductDetailsPage = type as 'event' | 'queue' | 'others';
    this.showProcessStepsPage = false;
    this.detailTabIndex = 4; // ← always switch to Experience tab first
    if (type === 'queue') this.currentScreen = 'queueDescription';
    else if (type === 'event') this.currentScreen = 'eventDescription';
    else this.currentScreen = 'otherDescription';
    this.cdr.markForCheck();
  }

  goBackToExperience(): void {
    this.showFullProcess = false;
    this.currentScreen = 'journeyExperience';
    this.cdr.markForCheck();
  }
  goBackToExperienceTab(): void {
    this.showProductDetailsPage = null;
    this.showProcessStepsPage = false;
    this.currentScreen = 'journeyExperience';
    this.detailTabIndex = 4;
    this.cdr.markForCheck();
  }

  private toRef(path: any): DocumentReference | null {
    if (!path) return null;

    // If already a Firestore reference → return as is
    if (typeof path === 'object' && path.path) {
      return path as DocumentReference;
    }

    // If string → process
    if (typeof path === 'string') {
      const cleaned = path.trim();
      if (!cleaned) return null;
      try {
        return doc(this.firestore, cleaned.replace(/^\//, '')) as DocumentReference;
      } catch {
        return null;
      }
    }

    return null;
  }
}
