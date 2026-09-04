import { Component, OnDestroy, OnInit, AfterViewInit, HostListener, NgZone, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormBuilder, FormGroup, FormArray, FormControl, AbstractControl, Validators,
  ReactiveFormsModule, FormsModule
} from '@angular/forms';
import {
  Firestore, DocumentSnapshot, doc, docSnapshots, updateDoc, setDoc, collection, collectionSnapshots,
  getDocs, query, where, Timestamp, getDocFromServer } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { DateAdapter } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { AuthguardService } from '../../authguard.service';

import { EnrollmentDateAdapter, WC2_MONTHS as MONTHS } from './wc2-date-adapter';
import { WorkshopChallengesv2Component } from './challenges/workshop-challengesv2.component';
import { WorkshopSettingsv2Component } from './settings/workshop-settingsv2.component';

interface SectionDef {
  id: string;
  title: string;
  group: 'Basics' | 'Page content' | 'Lists' | 'Extras';
  controls?: string[];   // plain controls that belong to the section
  array?: string;        // a FormArray the section is built on
  max?: number;          // item limit (when the array has one)
  required?: string;     // control that must be filled
  special?: 'testimonials';
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'blocked' | 'saved' | 'error';

/**
 * Workshop Configuration v2 — Enrollment Page.
 *
 * Reads/writes the SAME `workshopconfiguration/{id}.detailpage` map as the legacy editor
 * (/workshopconfigold/:id). Form model, patch and build logic are ported from
 * workshop-configuration.component.ts unchanged; only the chrome and UX are new.
 */
@Component({
  selector: 'app-workshop-configurationv2',
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, DragDropModule,
    MatDatepickerModule, MatTimepickerModule, MatSnackBarModule,
    NgxEditorModule, WorkshopChallengesv2Component, WorkshopSettingsv2Component,
  ],
  providers: [{ provide: DateAdapter, useClass: EnrollmentDateAdapter }],
  templateUrl: './workshop-configurationv2.component.html',
  styleUrl: './workshop-configurationv2.component.css'
})
export class WorkshopConfigurationv2Component implements OnInit, AfterViewInit, OnDestroy {
  // ───────────────────────── page state ─────────────────────────
  workshopId: string | null = null;
  workshopData: any = null;
  documentsize = '';
  docPercent = 0;
  loading = true;
  notFound = false;
  loadError = false;
  /** No document yet for this id: the editor works on defaults and the first save creates it. */
  isNew = false;
  /** Root-level `workshoptype` (mandatory, outside detailpage). */
  workshoptypeCtrl = new FormControl('', Validators.required);
  readonly workshopTypes = [
    { value: 'liveworkshop', label: 'Live workshop' },
    { value: 'evergreenworkshop', label: 'Evergreen workshop' },
    { value: 'cpworkshop', label: 'CP workshop' },
  ];
  private lastSavedWorkshoptype = '';
  readonly tabs = ['Enrollment Page', 'Challenges', 'Settings'];
  activeTab = 0;
  @ViewChild(WorkshopChallengesv2Component) challengesCmp?: WorkshopChallengesv2Component;
  @ViewChild(WorkshopSettingsv2Component) settingsCmp?: WorkshopSettingsv2Component;

  // ───────────────────────── form ─────────────────────────
  detailPageForm!: FormGroup;
  private hasInitializedForms = false;
  private isSaving = false;
  private lastSavedDetailpage: any = null;
  saving = false;
  saveError = false;
  justSaved = false;
  private savedTimer: any = null;
  submitAttempted = false;

  // ───────────────────────── reference data ─────────────────────────
  iconData: any[] = [];
  thumbnailData: any[] = [];
  private iconNameByUrl: Record<string, string> = {};
  videoasktemplate: any[] = [];
  testimonialData: any[] = [];
  allLoadedTestimonials: any[] = [];
  selectedTemplatesForFilter: string[] = [];
  testimonialMap: { [key: string]: { profileid: string, uploaded: any, videourl: string } } = {};
  testimonialsDirty = false;
  mapProfile: Record<string, string> = {};

  // ───────────────────────── rich text ─────────────────────────
  richTextFields = [
    { key: 'description', label: 'Workshop description', placeholder: 'Enter a detailed workshop description…', required: true },
    { key: 'joinus', label: 'Join us section', placeholder: 'Enter join us content…', required: false },
  ];
  editors: { [key: string]: Editor } = {};
  dynamicEditors: { [key: string]: Editor } = {};
  toolbarFull: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    [{ heading: ['h1', 'h2', 'h3'] }],
    ['bullet_list', 'ordered_list'],
    ['link', 'text_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];
  toolbarTitle: Toolbar = [
    ['bold', 'italic', 'underline'],
    [{ heading: ['h1', 'h2'] }],
    ['bullet_list', 'link'],
  ];
  toolbarItem: Toolbar = [
    ['bold', 'italic', 'underline'],
    ['bullet_list'],
  ];

  // ───────────────────────── section configs (same keys/limits as legacy) ─────────────────────────
  fieldSections = [
    { key: 'learnings', title: 'What you\'ll learn', placeholder: 'Enter a learning objective' },
    { key: 'prerequisites', title: 'Requirements', placeholder: 'Enter a requirement' },
    { key: 'workshopfor', title: 'Who is this workshop for?', placeholder: 'Enter a target audience' },
    { key: 'hometags', title: 'Hometags', placeholder: 'Enter a hometag' },
  ];
  iconWithTextSections = [
    { key: 'sneakpeak', title: 'Sneak peak', maxItems: 9, maxLength: 300, placeholder: 'One line about this' },
    { key: 'workshopoverview', title: 'Overview', maxItems: 9, maxLength: 300, placeholder: 'One line about this' },
    { key: 'knowinfo', title: 'Know info', maxItems: 9, maxLength: 300, placeholder: 'One line about this' },
  ];
  readonly faqMax = 20;
  readonly faqAnswerMax = 600;
  readonly templatesMax = 10;

  sections: SectionDef[] = [
    { id: 'workshoptype', title: 'Workshop type', group: 'Basics', controls: [] },
    { id: 'info', title: 'Workshop information', group: 'Basics', controls: ['title', 'shortdescription', 'whyworkshop', 'thumbnailImage', 'titleVideo'] },
    { id: 'pricing', title: 'Pricing & CTA', group: 'Basics', controls: ['day', 'enrollbuttonname', 'pricestriked', 'price'] },
    { id: 'schedule', title: 'Schedule', group: 'Basics', controls: ['registrationStartDate', 'registrationStartTime', 'registrationEndDate', 'registrationEndTime', 'workshopStartDate', 'workshopStartTime', 'workshopEndDate', 'workshopEndTime'] },
    { id: 'blocks', title: 'Page blocks', group: 'Page content', array: 'dynamicenrollment' },
    { id: 'description', title: 'Description & Join us', group: 'Page content', controls: ['description', 'joinus'], required: 'description' },
    { id: 'sneakpeak', title: 'Sneak peak', group: 'Page content', array: 'sneakpeak', max: 9 },
    { id: 'knowinfo', title: 'Know info', group: 'Page content', array: 'knowinfo', max: 9 },
    { id: 'faq', title: 'FAQ', group: 'Page content', array: 'faq', max: 20 },
    { id: 'learnings', title: 'What you\'ll learn', group: 'Lists', array: 'learnings' },
    { id: 'prerequisites', title: 'Requirements', group: 'Lists', array: 'prerequisites' },
    { id: 'workshopfor', title: 'Who is this for', group: 'Lists', array: 'workshopfor' },
    { id: 'outcome', title: 'Outcomes', group: 'Lists', array: 'outcome' },
    { id: 'primarylyTaught', title: 'Skills taught', group: 'Lists', array: 'primarylyTaught' },
    { id: 'hometags', title: 'Hometags', group: 'Lists', array: 'hometags' },
    { id: 'testimonials', title: 'Testimonials', group: 'Extras', special: 'testimonials' },
    { id: 'workshopoverview', title: 'Overview', group: 'Extras', array: 'workshopoverview', max: 9 },
  ];
  /** Render order of the icon+text cards: these two in Page content, Overview last. */
  readonly iconSectionsTop = ['sneakpeak', 'knowinfo'];
  iconSectionByKey(key: string) { return this.iconWithTextSections.find(s => s.key === key)!; }
  readonly groups: SectionDef['group'][] = ['Basics', 'Page content', 'Lists', 'Extras'];
  collapsed = new Set<string>();
  activeSection = 'workshoptype';

  // ───────────────────────── UI state ─────────────────────────
  openPopover: string | null = null;
  popSearch = '';
  skillDraft = '';
  leaveDialog: { resolve: (leave: boolean) => void, sections: string } | null = null;

  // dynamic blocks bookkeeping (as legacy)
  private deUidCounter = 0;
  deCollapsedUids = new Set<string>();

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firestore: Firestore,
    private fb: FormBuilder,
    private storage: Storage,
    private snackBar: MatSnackBar,
    private guard: AuthguardService,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>,
  ) {}

  // ═══════════════════════════ lifecycle ═══════════════════════════
  ngOnInit(): void {
    this.initializeForm();
    this.workshopId = this.route.snapshot.paramMap.get('id');
    if (!this.workshopId) { this.loading = false; this.notFound = true; return; }
    this.loadReferenceData();
    this.loadWorkshopData();
  }

  ngOnDestroy(): void {
    this.scrollEl?.removeEventListener('scroll', this.onScroll);
    this.destroy$.next();
    this.destroy$.complete();
    Object.values(this.editors).forEach(e => e?.destroy());
    this.destroyAllDynEditors();
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = true; }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.openPopover) return;
    const target = event.target as HTMLElement;
    if (!target.closest('[data-pop]')) this.closePopover();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closePopover(); }

  // ───────── scroll spy: the app shell scrolls mat-drawer-content, not the window ─────────
  private scrollEl: HTMLElement | Window | null = null;
  private scrollTicking = false;
  private readonly onScroll = () => {
    if (this.scrollTicking || this.activeTab !== 0) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.scrollTicking = false;
      const containerTop = this.scrollEl instanceof HTMLElement ? this.scrollEl.getBoundingClientRect().top : 0;
      const threshold = containerTop + 72;
      let current = this.sections[0].id;
      for (const s of this.sections) {
        const el = document.getElementById('sec-' + s.id);
        if (el && el.getBoundingClientRect().top <= threshold) current = s.id;
      }
      if (current !== this.activeSection) this.zone.run(() => { this.activeSection = current; });
    });
  };

  ngAfterViewInit(): void {
    let el: HTMLElement | null = this.host.nativeElement.parentElement;
    while (el && el !== document.body) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      el = el.parentElement;
    }
    this.scrollEl = el && el !== document.body ? el : window;
    this.zone.runOutsideAngular(() => this.scrollEl!.addEventListener('scroll', this.onScroll, { passive: true }));
  }

  onWindowScroll(): void { this.onScroll(); }

  // ═══════════════════════════ form model (ported) ═══════════════════════════
  private initializeForm(): void {
    const richTextControls: any = {};
    this.richTextFields.forEach(f => {
      richTextControls[f.key] = ['', f.required ? Validators.required : []];
      this.editors[f.key] = new Editor();
    });
    this.detailPageForm = this.fb.group({
      title: [''],
      type: ['workshop'],   // always 'workshop' — not editable in v2, still written to the document
      shortdescription: [''],
      day: [''],
      price: [''],
      enrollbuttonname: [''],
      whyworkshop: [''],
      pricestriked: [''],
      bonussection: [''],
      enablebonus: [false],
      bonushead: [''],
      bonus1: [''],
      bonus2: [''],
      bonusfooter: [''],
      selectedTaxonomies: [[]],
      selectedTestimonials: [[]],
      ...richTextControls,
      primarylyTaught: this.fb.array([]),
      thumbnailImage: [''],
      titleVideo: [''],
      registrationStartDate: [''],
      registrationStartTime: [null],
      registrationEndDate: [''],
      registrationEndTime: [null],
      workshopStartDate: [''],
      workshopStartTime: [null],
      workshopEndDate: [''],
      workshopEndTime: [null],
      learnings: this.fb.array([this.fb.control('')]),
      prerequisites: this.fb.array([this.fb.control('')]),
      workshopfor: this.fb.array([this.fb.control('')]),
      workshopoverview: this.fb.array([]),
      sneakpeak: this.fb.array([]),
      knowinfo: this.fb.array([]),
      faq: this.fb.array([]),
      outcome: this.fb.array([]),
      hometags: this.fb.array([]),
      dynamicenrollment: this.fb.array([]),
    });
    this.detailPageForm.get('selectedTestimonials')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((selectedIds: string[]) => this.onTestimonialSelect(selectedIds || []));
    this.detailPageForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.justSaved && this.detailPageForm.dirty) this.justSaved = false;
      if (this.saveError && this.detailPageForm.dirty) this.saveError = false;
    });
  }

  private loadReferenceData(): void {
    collectionSnapshots(collection(this.firestore, 'workshop images')).pipe(takeUntil(this.destroy$)).subscribe(docs => {
      this.iconData = []; this.thumbnailData = []; this.iconNameByUrl = {};
      docs.forEach(d => {
        const data: any = d.data();
        const docWithId = { id: d.id, ...data };
        if (data['type'] === 'icon') { this.iconData.push(docWithId); this.iconNameByUrl[data['imageUrl']] = data['description'] || ''; }
        else if (data['type'] === 'thumbnail') this.thumbnailData.push(docWithId);
      });
    });
    collectionSnapshots(collection(this.firestore, 'arenavideoask')).pipe(takeUntil(this.destroy$)).subscribe(snaps => {
      this.videoasktemplate = snaps.map(d => ({ id: d.id, ...(d.data() as any) }));
    });
    Promise.all([this.guard.getProfileMap(), this.guard.getProfileMapNewUser()])
      .then(([e, f]: any[]) => { this.mapProfile = { ...(e?.map || {}), ...(f?.map || {}) }; })
      .catch(err => console.error('Error loading profile maps:', err));
  }

  private loadWorkshopData(): void {
    const ref = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
    docSnapshots(ref).pipe(takeUntil(this.destroy$)).subscribe({
      next: (snapshot: DocumentSnapshot<any>) => {
        const fromCache = snapshot.metadata.fromCache;   // read before exists() narrows the type away
        if (!snapshot.exists()) {
          // A cache-only miss (offline, or a remembered "no such document") says nothing about the
          // server. Treating it as "new" would let the first save setDoc() over a real workshop, so
          // ask the server once and only then decide.
          if (fromCache) { this.confirmMissingOnServer(ref); return; }
          this.enterNewMode();
          return;
        }
        this.loading = false; this.loadError = false;
        // The document showed up from somewhere other than our own write (connectivity came back,
        // or it was created elsewhere): the defaults must give way to the real data.
        if (this.isNew && !this.isSaving && !snapshot.metadata.hasPendingWrites) this.hasInitializedForms = false;
        this.isNew = false; this.notFound = false;
        this.workshopData = snapshot.data();
        // Patch once, on first real load (never off the back of our own writes) — as legacy.
        if (!this.hasInitializedForms && !this.isSaving && !snapshot.metadata.hasPendingWrites) {
          this.patchDetailPageData(this.workshopData);
          this.lastSavedDetailpage = this.workshopData.detailpage || null;
          this.lastSavedWorkshoptype = this.workshopData.workshoptype || '';
          this.hasInitializedForms = true;
          setTimeout(() => this.onWindowScroll());
        }
        const bytes = new TextEncoder().encode(JSON.stringify(this.workshopData)).length;
        const kb = bytes / 1024;
        this.documentsize = `${kb.toFixed(0)} KB / 1 MB`;
        this.docPercent = Math.min(100, Math.round(kb / 1024 * 100));
      },
      error: err => { console.error('Error fetching workshop data:', err); this.loading = false; this.loadError = true; }
    });
  }

  /** Server-confirmed miss: this id has no document yet, the defaults are the form. */
  private enterNewMode(): void {
    this.loading = false; this.loadError = false;
    this.isNew = true; this.notFound = false; this.workshopData = null;
    this.hasInitializedForms = true;   // later snapshots must not re-patch over what the operator types
  }

  private async confirmMissingOnServer(ref: any): Promise<void> {
    try {
      const fresh = await getDocFromServer(ref);
      if (this.workshopData) return;   // the listener delivered the real document meanwhile
      if (!fresh.exists()) this.enterNewMode();
      // else: the listener delivers the real document (a doc change against the cached miss)
    } catch (err) {
      console.error('Could not confirm the workshop on the server:', err);
      this.loading = false; this.loadError = true;
    }
  }

  private patchDetailPageData(data: any): void {
    this.workshoptypeCtrl.setValue(data?.workshoptype || '', { emitEvent: false });
    this.workshoptypeCtrl.markAsPristine();
    // No detailpage (a new workshop, or Discard on one) still runs the whole reset so every
    // array is cleared and the form ends up pristine — an early return left Discard a no-op.
    const hasDetailpage = !!data?.detailpage;
    const dp = data?.detailpage || {};
    const richTextPatches: any = {};
    this.richTextFields.forEach(field => { richTextPatches[field.key] = dp[field.key] || ''; });
    this.testimonialMap = dp['testimonialmap'] ? { ...dp['testimonialmap'] } : {};

    this.detailPageForm.patchValue({
      title: dp.title || '',
      type: dp.type || 'workshop',
      shortdescription: dp.shortdescription || '',
      day: dp.day || '',
      enrollbuttonname: dp.enrollbuttonname || '',
      price: dp.price || '',
      pricestriked: dp.pricestriked || '',
      enablebonus: dp.enablebonus || false,
      bonussection: dp.bonussection || '',
      bonushead: dp.bonushead || '',
      bonus1: dp.bonus1 || '',
      bonus2: dp.bonus2 || '',
      bonusfooter: dp.bonusfooter || '',
      selectedTaxonomies: dp.selectedTaxonomies || [],
      selectedTestimonials: dp['testimonialmap'] ? Object.keys(dp['testimonialmap']) : [],
      whyworkshop: dp.whyworkshop || '',
      ...richTextPatches,
      thumbnailImage: dp.thumbnailImage || '',
      titleVideo: dp.titleVideo || '',
      registrationStartDate: this.convertTimestamp(dp.registrationStartDate),
      registrationEndDate: this.convertTimestamp(dp.registrationEndDate),
      workshopStartDate: this.convertTimestamp(dp.workshopStartDate),
      workshopEndDate: this.convertTimestamp(dp.workshopEndDate),
      registrationStartTime: this.convertTimestamp(dp.registrationStartDate),
      registrationEndTime: this.convertTimestamp(dp.registrationEndDate),
      workshopStartTime: this.convertTimestamp(dp.workshopStartDate),
      workshopEndTime: this.convertTimestamp(dp.workshopEndDate),
    }, { emitEvent: false });
    // Keep the raw saved HTML in the model: the mounted editors normalise what they display.
    this.richTextFields.forEach(f => this.detailPageForm.get(f.key)?.setValue(dp[f.key] || '', { emitModelToViewChange: false, emitEvent: false }));

    const skills = this.getFormArray('primarylyTaught');
    skills.clear();
    (dp.primarylyTaught || []).forEach((s: string) => skills.push(this.fb.control(s)));

    this.fieldSections.forEach(section => {
      const arr = this.getFormArray(section.key);
      arr.clear();
      (dp[section.key] || []).forEach((v: string) => arr.push(this.fb.control(v)));
      if (!hasDetailpage) arr.push(this.fb.control(''));   // the one empty row initializeForm starts with
    });

    [...this.iconWithTextSections.map(s => s.key), 'faq'].forEach(key => {
      const arr = this.getFormArray(key);
      arr.clear();
      (dp[key] || []).forEach((item: any) => arr.push(this.fb.group({ question: [item.question || ''], answer: [item.answer || ''] })));
    });

    const outcomeArray = this.getFormArray('outcome');
    outcomeArray.clear();
    (dp['outcome'] || []).forEach((item: any) => outcomeArray.push(this.fb.group({ value: [item?.value || ''], title: [item?.title || ''] })));

    this.destroyAllDynEditors();
    this.deCollapsedUids.clear();
    this.dynamicBlocks.clear();
    const deBlocks = Array.isArray(dp['dynamicenrollment']) ? [...dp['dynamicenrollment']] : [];
    deBlocks.sort((a: any, b: any) => (a?.sequence || 0) - (b?.sequence || 0)).forEach((block: any) => {
      const g = this.makeDynBlock(block?.type, block?.data);
      this.deCollapsedUids.add(g.get('uid')?.value);
      this.dynamicBlocks.push(g);
    });

    this.detailPageForm.markAsPristine();
    this.detailPageForm.markAsUntouched();
    this.testimonialsDirty = false;
    this.submitAttempted = false;
  }

  private buildDetailPageData(): any {
    const formValue = this.detailPageForm.value;
    const data: any = { ...formValue };

    [...this.iconWithTextSections.map(s => s.key), 'faq'].forEach(key => {
      data[key] = this.getFormArray(key).value.map((item: any) => ({ question: item.question, answer: item.answer }));
    });

    data.dynamicenrollment = this.dynamicBlocks.controls.map((c, idx) => {
      const v: any = c.value;
      const block: any = { type: v.type, sequence: idx + 1, data: {} };
      block.data.title1 = v.title1 || '';
      block.data.title2 = v.title2 || '';
      block.data.border = !!v.border;
      if (v.type === 'icontext') {
        block.data.icontext = (Array.isArray(v.icontext) ? v.icontext : []).map((it: any) => ({ value1: it?.value1 || '', value2: it?.value2 || '' }));
      } else {
        block.data.content = v.content || '';
      }
      return block;
    });

    delete data.selectedTestimonials;
    data.testimonialmap = this.testimonialMap;
    const merge = (date: Date, time: Date) => { const d = this.mergeDateTime(date, time); return d ? Timestamp.fromDate(d) : null; };
    data.registrationStartDate = merge(data.registrationStartDate, data.registrationStartTime);
    data.registrationEndDate = merge(data.registrationEndDate, data.registrationEndTime);
    data.workshopStartDate = merge(data.workshopStartDate, data.workshopStartTime);
    data.workshopEndDate = merge(data.workshopEndDate, data.workshopEndTime);
    delete data.registrationStartTime;
    delete data.registrationEndTime;
    delete data.workshopStartTime;
    delete data.workshopEndTime;
    return data;
  }

  private convertTimestamp(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    if (typeof value?.toDate === 'function') return value.toDate();
    return value;
  }

  private mergeDateTime(date: Date, time: Date): Date | null {
    if (!date) return null;
    const merged = new Date(date);
    if (time) merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return merged;
  }

  // ═══════════════════════════ save / discard ═══════════════════════════
  get saveState(): SaveState {
    if (this.saving) return 'saving';
    if (this.saveError) return 'error';
    if (this.detailPageForm.invalid || this.workshoptypeCtrl.invalid) return 'blocked';
    if (this.enrollmentDirty()) return 'dirty';
    if (this.justSaved) return 'saved';
    return 'idle';
  }

  /** Enrollment tab only. */
  enrollmentDirty(): boolean {
    return !!this.detailPageForm && (this.detailPageForm.dirty || this.testimonialsDirty || this.workshoptypeCtrl.dirty);
  }
  get blockedReason(): string {
    if (this.workshoptypeCtrl.invalid) return 'Workshop type is required';
    return 'Description is required';
  }
  setWorkshopType(value: string): void {
    this.workshoptypeCtrl.setValue(value); this.workshoptypeCtrl.markAsDirty();
    this.closePopover();
  }
  workshopTypeLabel(value: string): string { return this.workshopTypes.find(t => t.value === value)?.label || ''; }

  /** Any tab (route guard + browser close). */
  hasUnsavedChanges(): boolean {
    return this.enrollmentDirty() || !!this.challengesCmp?.hasUnsavedChanges() || !!this.settingsCmp?.hasUnsavedChanges();
  }

  get editedSectionsText(): string {
    return this.sections.filter(s => this.isSectionDirty(s)).map(s => s.title).join(' · ');
  }

  async saveDetailPage(): Promise<void> {
    if (!this.workshopId) return;
    this.submitAttempted = true;
    if (this.detailPageForm.invalid || this.workshoptypeCtrl.invalid) {
      this.detailPageForm.get('description')?.markAsTouched();
      this.workshoptypeCtrl.markAsTouched();
      return;
    }
    this.saving = true;
    this.isSaving = true;
    this.saveError = false;
    try {
      const detailPageData = this.buildDetailPageData();
      const ref = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
      const fields = { detailpage: detailPageData, workshoptype: this.workshoptypeCtrl.value || '' };
      if (this.isNew) {
        // First save creates the document with what the old create step wrote besides the tab payload.
        await setDoc(ref, { created: Timestamp.now(), docid: this.workshopId, ...fields });
      } else {
        await updateDoc(ref, fields);
      }
      this.lastSavedWorkshoptype = fields.workshoptype;
      this.workshoptypeCtrl.markAsPristine();
      // Keep an independent copy of the testimonial map: removeTestimonialFromMap mutates
      // this.testimonialMap in place, and Discard must restore what was actually saved.
      this.lastSavedDetailpage = { ...detailPageData, testimonialmap: { ...this.testimonialMap } };
      this.detailPageForm.markAsPristine();
      this.testimonialsDirty = false;
      this.justSaved = true;
      if (this.savedTimer) clearTimeout(this.savedTimer);
      this.savedTimer = setTimeout(() => { this.justSaved = false; }, 4000);
    } catch (error) {
      console.error('Error saving detail page:', error);
      this.saveError = true;
    } finally {
      this.isSaving = false;
      this.saving = false;
    }
  }

  discardChanges(): void {
    if (this.saving) return;
    const detailpage = this.lastSavedDetailpage || this.workshopData?.detailpage || null;
    this.patchDetailPageData({ detailpage, workshoptype: this.lastSavedWorkshoptype });
    this.saveError = false;
    this.justSaved = false;
  }

  /** Route guard + tab switch: resolves true when the user chooses to leave. */
  confirmLeave(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) return Promise.resolve(true);
    const parts = [
      this.enrollmentDirty() ? this.editedSectionsText : '',
      this.challengesCmp?.hasUnsavedChanges() ? this.challengesCmp.editedSetsText : '',
      this.settingsCmp?.hasUnsavedChanges() ? this.settingsCmp.editedSectionsText : '',
    ].filter(Boolean);
    return new Promise<boolean>(resolve => {
      this.leaveDialog = { resolve, sections: parts.join(' · ') };
    });
  }

  answerLeave(leave: boolean): void {
    const d = this.leaveDialog;
    this.leaveDialog = null;
    d?.resolve(leave);
  }

  async selectTab(i: number): Promise<void> {
    if (i === this.activeTab) return;
    if (this.saving || this.challengesCmp?.saving || this.settingsCmp?.saving) return;   // a discard must never race a pending write
    const leavingDirty = this.activeTab === 0 ? this.enrollmentDirty()
      : this.activeTab === 1 ? !!this.challengesCmp?.hasUnsavedChanges()
      : !!this.settingsCmp?.hasUnsavedChanges();
    if (leavingDirty) {
      const sections = this.activeTab === 0 ? this.editedSectionsText
        : this.activeTab === 1 ? (this.challengesCmp?.editedSetsText || '')
        : (this.settingsCmp?.editedSectionsText || '');
      const leave = await new Promise<boolean>(resolve => { this.leaveDialog = { resolve, sections }; });
      if (!leave) return;
      if (this.activeTab === 0) this.discardChanges();
      else if (this.activeTab === 1) this.challengesCmp?.discardChanges();
      else this.settingsCmp?.discardChanges();
    }
    this.activeTab = i;
    if (i === 1) setTimeout(() => this.challengesCmp?.refreshSpy());
    if (i === 2) setTimeout(() => this.settingsCmp?.refreshSpy());
  }

  // ═══════════════════════════ navigation ═══════════════════════════
  backToWorkshops(): void { this.router.navigate(['/workshops']); }
  openLegacyEditor(): void { if (this.workshopId) this.router.navigate(['/workshopconfigold', this.workshopId]); }
  openImageUpload(): void {
    const url = this.router.serializeUrl(this.router.createUrlTree(['/workshop_image_upload']));
    window.open(url, '_blank');
  }

  get title(): string {
    return this.detailPageForm?.get('title')?.value || this.workshopData?.detailpage?.title || (this.isNew ? 'New workshop' : 'Untitled workshop');
  }

  // ═══════════════════════════ sections / rail ═══════════════════════════
  sectionsIn(group: string): SectionDef[] { return this.sections.filter(s => s.group === group); }
  sectionDef(id: string): SectionDef { return this.sections.find(s => s.id === id)!; }
  summary(id: string): string { return this.sectionSummary(this.sectionDef(id)); }
  /** Header text: the live hint when open, the content summary when collapsed. */
  headHint(id: string, hint: string): string { return this.isCollapsed(id) ? this.summary(id) : hint; }

  isCollapsed(id: string): boolean { return this.collapsed.has(id); }
  toggleSection(id: string): void { this.collapsed.has(id) ? this.collapsed.delete(id) : this.collapsed.add(id); }
  collapseAll(): void { this.sections.forEach(s => this.collapsed.add(s.id)); }
  expandAll(): void { this.collapsed.clear(); }

  jumpTo(id: string): void {
    this.collapsed.delete(id);
    this.activeSection = id;
    const el = document.getElementById('sec-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  sectionCount(s: SectionDef): string {
    if (s.special === 'testimonials') { const n = Object.keys(this.testimonialMap).length; return n ? String(n) : ''; }
    if (!s.array) return '';
    const n = this.getFormArray(s.array).length;
    if (s.max) return `${n}/${s.max}`;
    return n ? String(n) : '';
  }

  sectionHasContent(s: SectionDef): boolean {
    if (s.id === 'workshoptype') return !!this.workshoptypeCtrl.value;
    if (s.special === 'testimonials') return Object.keys(this.testimonialMap).length > 0;
    if (s.array) return this.getFormArray(s.array).controls.some(c => this.controlHasValue(c));
    return (s.controls || []).some(k => this.controlHasValue(this.detailPageForm.get(k)));
  }

  sectionNeedsAttention(s: SectionDef): boolean {
    if (s.id === 'workshoptype') return this.workshoptypeCtrl.invalid;
    if (!s.required) return false;
    return !this.plainText(this.detailPageForm.get(s.required)?.value);
  }

  isSectionDirty(s: SectionDef): boolean {
    if (s.id === 'workshoptype') return this.workshoptypeCtrl.dirty;
    if (s.special === 'testimonials') return this.testimonialsDirty || !!this.detailPageForm.get('selectedTestimonials')?.dirty;
    if (s.array) return !!this.detailPageForm.get(s.array)?.dirty;
    return (s.controls || []).some(k => !!this.detailPageForm.get(k)?.dirty);
  }

  private controlHasValue(c: AbstractControl | null): boolean {
    if (!c) return false;
    const v = c.value;
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return this.plainText(v).length > 0;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.length > 0;
    if (v instanceof Date) return true;
    if (typeof v === 'object') return Object.values(v).some(x => typeof x === 'string' ? x.trim().length > 0 : !!x);
    return !!v;
  }

  plainText(html: any): string {
    return (html || '').toString().replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** One-line summary shown in a collapsed section header. */
  sectionSummary(s: SectionDef): string {
    const f = this.detailPageForm;
    const first = (key: string, pick: (v: any) => string, n = 2) =>
      this.getFormArray(key).controls.map(c => pick(c.value)).filter(Boolean).slice(0, n).join(' · ');
    switch (s.id) {
      case 'workshoptype': return this.workshopTypeLabel(this.workshoptypeCtrl.value) || 'Not chosen';
      case 'info': return f.get('title')?.value || 'Empty';
      case 'pricing': return [f.get('price')?.value, f.get('enrollbuttonname')?.value].filter(Boolean).join(' · ') || 'Empty';
      case 'schedule': {
        const a = f.get('workshopStartDate')?.value, b = f.get('workshopEndDate')?.value;
        return a && b ? `${this.shortDate(a)} to ${this.shortDate(b)}` : 'No dates yet';
      }
      case 'blocks': return this.dynamicBlocks.length ? this.dynamicBlocks.controls.slice(0, 2).map(b => this.blockSummary(b)).join(' · ') : 'No blocks yet';
      case 'description': return this.plainText(f.get('description')?.value).slice(0, 60) || 'Empty';
      case 'sneakpeak': case 'workshopoverview': case 'knowinfo':
        return first(s.id, v => this.iconName(v?.question)) || 'No items yet';
      case 'faq': return first('faq', v => v?.question, 1) || 'No questions yet';
      case 'learnings': case 'prerequisites': case 'workshopfor': case 'hometags': case 'primarylyTaught':
        return first(s.id, v => v) || 'Empty';
      case 'outcome': return first('outcome', v => [v?.value, v?.title].filter(Boolean).join(' ')) || 'Empty';
      case 'testimonials': { const n = Object.keys(this.testimonialMap).length; return n ? `${n} featured` : 'None featured'; }
      default: return '';
    }
  }

  // ═══════════════════════════ generic field helpers ═══════════════════════════
  getFormArray(key: string): FormArray { return this.detailPageForm.get(key) as FormArray; }
  ctrl(key: string): FormControl { return this.detailPageForm.get(key) as FormControl; }
  len(key: string): number { return (this.detailPageForm.get(key)?.value || '').length; }

  toggleControl(c: AbstractControl | null): void {
    if (!c) return;
    c.setValue(!c.value); c.markAsDirty();
  }

  // dates
  shortDate(d: any): string {
    const date = d instanceof Date ? d : this.convertTimestamp(d);
    return date ? `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}` : '';
  }
  spanText(startKey: string, startTime: string, endKey: string, endTime: string): string {
    const a = this.mergeDateTime(this.ctrl(startKey).value, this.ctrl(startTime).value);
    const b = this.mergeDateTime(this.ctrl(endKey).value, this.ctrl(endTime).value);
    if (!a || !b) return '';
    const days = Math.round((b.getTime() - a.getTime()) / 86400000);
    if (days < 0) return 'Ends before it starts';
    return days === 1 ? '1 day' : `${days} days`;
  }
  clearPair(dateKey: string, timeKey: string): void {
    this.ctrl(dateKey).setValue(null); this.ctrl(timeKey).setValue(null);
    this.ctrl(dateKey).markAsDirty();
  }

  // ═══════════════════════════ list sections (ported) ═══════════════════════════
  addField(key: string): void {
    const arr = this.getFormArray(key);
    if (!this.isAllFilled(key)) return;
    arr.push(this.fb.control('')); arr.markAsDirty();
  }
  removeField(key: string, index: number): void {
    const arr = this.getFormArray(key);
    arr.removeAt(index); arr.markAsDirty();
  }
  isAllFilled(key: string): boolean {
    return this.getFormArray(key).controls.every(c => c.value && c.valid);
  }

  drop(event: CdkDragDrop<any>, key: string): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getFormArray(key);
    if (!arr) return;
    const item = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex);
    arr.insert(event.currentIndex, item);
    arr.markAsDirty();
  }

  // icon + text sections & FAQ
  addIconWithText(key: string, maxItems: number): void {
    const arr = this.getFormArray(key);
    if (arr.length >= maxItems) return;
    arr.push(this.fb.group({ question: [''], answer: [''] })); arr.markAsDirty();
  }
  removeIconWithText(key: string, index: number): void {
    const arr = this.getFormArray(key);
    if (index >= 0) { arr.removeAt(index); arr.markAsDirty(); }
  }
  answerLen(key: string, i: number): number { return (this.getFormArray(key).at(i).get('answer')?.value || '').length; }

  // outcomes
  get outcomeArray(): FormArray { return this.getFormArray('outcome'); }
  addOutcome(): void { this.outcomeArray.push(this.fb.group({ value: [''], title: [''] })); this.outcomeArray.markAsDirty(); }
  removeOutcome(i: number): void { if (i >= 0) { this.outcomeArray.removeAt(i); this.outcomeArray.markAsDirty(); } }

  // skills (chips)
  get primarylyTaughtArray(): FormArray { return this.getFormArray('primarylyTaught'); }
  addSkill(raw: string): void {
    const value = (raw || '').trim();
    this.skillDraft = '';
    if (!value) return;
    const exists = this.primarylyTaughtArray.value.includes(value);
    if (!exists) { this.primarylyTaughtArray.push(this.fb.control(value)); this.primarylyTaughtArray.markAsDirty(); }
  }
  onSkillKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); this.addSkill(this.skillDraft); }
  }
  removeSkill(i: number): void { if (i >= 0) { this.primarylyTaughtArray.removeAt(i); this.primarylyTaughtArray.markAsDirty(); } }

  // ═══════════════════════════ dynamic blocks (ported) ═══════════════════════════
  get dynamicBlocks(): FormArray { return this.getFormArray('dynamicenrollment'); }
  dynIcons(blockIndex: number): FormArray { return this.dynamicBlocks.at(blockIndex)?.get('icontext') as FormArray; }

  private makeDynIcon(item: any = {}): FormGroup {
    const uid = 'i' + (++this.deUidCounter);
    return this.fb.group({ uid: [uid], value1: [item?.value1 || ''], value2: [item?.value2 || ''] });
  }
  private makeDynBlock(type: string = 'richtext', data: any = {}): FormGroup {
    const uid = 'b' + (++this.deUidCounter);
    const icons = Array.isArray(data?.icontext) ? data.icontext : [];
    const iconArray: FormArray = this.fb.array([]);
    icons.forEach((it: any) => iconArray.push(this.makeDynIcon(it)));
    if (type === 'icontext' && iconArray.length === 0) iconArray.push(this.makeDynIcon());
    return this.fb.group({
      uid: [uid], type: [type || 'richtext'], title1: [data?.title1 || ''], title2: [data?.title2 || ''],
      border: [!!data?.border], content: [data?.content || ''], icontext: iconArray
    });
  }
  addDynBlock(): void { this.dynamicBlocks.push(this.makeDynBlock('richtext')); this.dynamicBlocks.markAsDirty(); }
  isBlockCollapsed(block: AbstractControl): boolean { return this.deCollapsedUids.has(block.get('uid')?.value); }
  toggleBlockCollapsed(block: AbstractControl): void {
    const uid = block.get('uid')?.value;
    this.deCollapsedUids.has(uid) ? this.deCollapsedUids.delete(uid) : this.deCollapsedUids.add(uid);
  }
  trackDynBlock = (_: number, block: AbstractControl) => block.get('uid')?.value;
  trackDynIcon = (_: number, item: AbstractControl) => item.get('uid')?.value;
  blockSummary(block: AbstractControl): string {
    const text = this.plainText(block.get('title1')?.value);
    return text ? text.slice(0, 60) : 'Untitled block';
  }
  removeDynBlock(index: number): void {
    if (index < 0 || index >= this.dynamicBlocks.length) return;
    this.destroyBlockEditors(this.dynamicBlocks.at(index) as FormGroup);
    this.dynamicBlocks.removeAt(index); this.dynamicBlocks.markAsDirty();
  }
  setDynType(index: number, type: 'richtext' | 'icontext'): void {
    const block = this.dynamicBlocks.at(index) as FormGroup;
    if (!block || block.get('type')?.value === type) return;
    block.get('type')?.setValue(type); block.get('type')?.markAsDirty();
    if (type === 'icontext' && this.dynIcons(index).length === 0) this.dynIcons(index).push(this.makeDynIcon());
  }
  addDynIcon(blockIndex: number): void { this.dynIcons(blockIndex)?.push(this.makeDynIcon()); this.dynamicBlocks.markAsDirty(); }
  removeDynIcon(blockIndex: number, itemIndex: number): void {
    const arr = this.dynIcons(blockIndex);
    if (!arr || itemIndex < 0 || itemIndex >= arr.length) return;
    this.destroyIconEditors(this.dynamicBlocks.at(blockIndex) as FormGroup, arr.at(itemIndex) as FormGroup);
    arr.removeAt(itemIndex); this.dynamicBlocks.markAsDirty();
  }
  deKey(block: AbstractControl, field: string): string { return `de_${block.get('uid')?.value}_${field}`; }
  deIconKey(block: AbstractControl, item: AbstractControl, field: string): string {
    return `de_${block.get('uid')?.value}_ic_${item.get('uid')?.value}_${field}`;
  }
  getDynEditor(key: string): Editor {
    if (!this.dynamicEditors[key]) this.dynamicEditors[key] = new Editor();
    return this.dynamicEditors[key];
  }
  private destroyIconEditors(block: FormGroup, item: FormGroup): void {
    const key = this.deIconKey(block, item, 'value2');
    this.dynamicEditors[key]?.destroy(); delete this.dynamicEditors[key];
  }
  private destroyBlockEditors(block: FormGroup): void {
    ['title1', 'title2', 'content'].forEach(f => { const k = this.deKey(block, f); this.dynamicEditors[k]?.destroy(); delete this.dynamicEditors[k]; });
    (block.get('icontext') as FormArray)?.controls.forEach(item => this.destroyIconEditors(block, item as FormGroup));
  }
  private destroyAllDynEditors(): void {
    Object.values(this.dynamicEditors).forEach(e => e?.destroy());
    this.dynamicEditors = {};
  }

  // ═══════════════════════════ popovers (icon / taxonomy / templates / testimonials) ═══════════════════════════
  togglePopover(id: string): void {
    if (this.openPopover === id) { this.closePopover(); return; }
    this.openPopover = id; this.popSearch = '';
  }
  closePopover(): void { this.openPopover = null; this.popSearch = ''; }

  iconName(url: string): string { return url ? (this.iconNameByUrl[url] || 'Icon') : ''; }
  get filteredIcons(): any[] {
    const q = this.popSearch.trim().toLowerCase();
    return q ? this.iconData.filter(i => (i.description || '').toLowerCase().includes(q)) : this.iconData;
  }
  pickIcon(control: AbstractControl | null, url: string): void {
    if (!control) return;
    control.setValue(url); control.markAsDirty();
    this.closePopover();
  }

  templateTitle(id: string): string { return this.videoasktemplate.find(t => t.id === id)?.title || id; }
  isTemplateSelected(id: string): boolean { return this.selectedTemplatesForFilter.includes(id); }
  toggleTemplate(id: string): void {
    const cur = this.selectedTemplatesForFilter;
    if (cur.includes(id)) this.onTemplateFilterChange(cur.filter(x => x !== id));
    else if (cur.length < this.templatesMax) this.onTemplateFilterChange([...cur, id]);
  }
  get filteredTemplates(): any[] {
    const q = this.popSearch.trim().toLowerCase();
    return q ? this.videoasktemplate.filter(t => (t.title || '').toLowerCase().includes(q)) : this.videoasktemplate;
  }

  testimonialName(profileid: string): string { return this.mapProfile[profileid] || profileid || 'Participant'; }
  isTestimonialSelected(id: string): boolean { return (this.ctrl('selectedTestimonials').value || []).includes(id); }
  toggleTestimonial(id: string): void {
    const c = this.ctrl('selectedTestimonials');
    const cur: string[] = c.value || [];
    c.setValue(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
    c.markAsDirty(); this.testimonialsDirty = true;
  }
  get filteredTestimonials(): any[] {
    const q = this.popSearch.trim().toLowerCase();
    return q ? this.testimonialData.filter(t => this.testimonialName(t.profileid).toLowerCase().includes(q)) : this.testimonialData;
  }

  // ═══════════════════════════ testimonials (ported) ═══════════════════════════
  onTestimonialSelect(selectedIds: string[]): void {
    const newMap: { [key: string]: { profileid: string, uploaded: any, videourl: string } } = { ...this.testimonialMap };
    const currentFormIds = selectedIds || [];
    currentFormIds.forEach(id => {
      if (!newMap[id]) {
        const t = this.testimonialData.find(x => x.id === id);
        if (t) {
          newMap[id] = {
            profileid: t.profileid || '',
            uploaded: t.uploaded || null,
            videourl: t?.hls?.url_stream && t.hls.url_stream.trim() !== '' ? t.hls.url_stream : (t.fileurl || null),
          };
        }
      }
    });
    const loadedIds = this.testimonialData.map(t => t.id);
    Object.keys(newMap).forEach(id => { if (!currentFormIds.includes(id) && loadedIds.includes(id)) delete newMap[id]; });
    this.testimonialMap = newMap;
  }

  removeTestimonialFromMap(id: string): void {
    delete this.testimonialMap[id];
    const cur = this.ctrl('selectedTestimonials').value || [];
    this.ctrl('selectedTestimonials').setValue(cur.filter((x: string) => x !== id), { emitEvent: false });
    this.testimonialsDirty = true;
  }

  getTestimonialsFromMap(): Array<{ id: string, profileid: string, uploaded: any, videourl: string }> {
    return Object.keys(this.testimonialMap).map(id => ({ id, ...this.testimonialMap[id] }));
  }
  trackByTestimonialId(_: number, item: any): string { return item.id; }

  formatUploadedDate(timestamp: any): string {
    if (!timestamp) return '';
    let date: Date;
    if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else if (timestamp instanceof Date) date = timestamp;
    else date = new Date(timestamp);
    return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  async loadTestimonialsForTemplates(templateIds: string[]): Promise<void> {
    if (!templateIds || templateIds.length === 0) { this.testimonialData = []; this.allLoadedTestimonials = []; return; }
    try {
      const batches: string[][] = [];
      for (let i = 0; i < templateIds.length; i += 10) batches.push(templateIds.slice(i, i + 10));
      const all: any[] = [];
      for (const batch of batches) {
        const q = query(collection(this.firestore, 'participantvideoask'), where('videoaskid', 'in', batch));
        const snap = await getDocs(q);
        all.push(...snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }
      const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
      this.allLoadedTestimonials = unique;
      this.testimonialData = unique;
    } catch (error) {
      console.error('Error loading testimonials:', error);
    }
  }

  onTemplateFilterChange(selectedIds: string[]): void {
    if (selectedIds.length > this.templatesMax) selectedIds = selectedIds.slice(0, this.templatesMax);
    this.selectedTemplatesForFilter = selectedIds;
    if (selectedIds.length > 0) this.loadTestimonialsForTemplates(selectedIds);
    else this.testimonialData = [];
  }

  // ═══════════════════════════ uploads (ported) ═══════════════════════════
  uploadThumbnail(): void { this.uploadTo('image/*', 'workshop/thumbnail', 'thumbnailImage', 'Thumbnail'); }
  uploadVideo(): void { this.uploadTo('video/*', 'workshop/video', 'titleVideo', 'Video'); }

  private uploadTo(accept: string, folder: string, controlKey: string, label: string): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = accept;
    fileInput.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const fileRef = ref(this.storage, `${folder}/${file.name}`);
      try {
        await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(fileRef);
        this.zone.run(() => {
          this.ctrl(controlKey).setValue(downloadURL); this.ctrl(controlKey).markAsDirty();
          this.snackBar.open(`${label} uploaded successfully!`, 'Close', { duration: 2000, panelClass: 'sx-snack' });
        });
      } catch (error) {
        console.error(`Error uploading ${label.toLowerCase()}:`, error);
        this.snackBar.open(`Error uploading ${label.toLowerCase()}. Please try again.`, 'Close', { duration: 2000, panelClass: 'sx-snack' });
      }
    };
    fileInput.click();
  }
}
