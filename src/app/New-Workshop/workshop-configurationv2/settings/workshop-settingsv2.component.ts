import { Component, Input, OnInit, OnDestroy, AfterViewInit, HostListener, NgZone, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, FormControl, AbstractControl, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Firestore, doc, updateDoc, collection, collectionSnapshots, getDocs, query, where, orderBy } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthguardService } from '../../../authguard.service';
import { WorkshopCategoryComponent } from '../../workshop-category/workshop-category.component';

type SaveState = 'idle' | 'dirty' | 'blocked' | 'saving' | 'saved' | 'error';

interface SectionDef { id: string; title: string; group: 'General' | 'Access' | 'Communication'; controls: string[]; }

/**
 * Workshop Configuration v2 — Settings tab.
 *
 * Writes the SAME 53 root-level fields of `workshopconfiguration/{id}` as the legacy
 * `saveSettings` (same keys, same defaults, same transforms), reads them with the same
 * `patchSettingsData` defaults, and keeps the legacy form mechanics (evergreen children
 * enabled/disabled with the toggle, daily arrays sized to Workshop days, profile picker
 * buckets, category-in-use guard, cohorts max 2). Only the chrome follows the approved
 * mockups (settings-page-ui.html, settings-states.html).
 */
@Component({
  selector: 'app-workshop-settingsv2',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DragDropModule, MatSnackBarModule, NgxEditorModule],
  templateUrl: './workshop-settingsv2.component.html',
  styleUrl: './workshop-settingsv2.component.css'
})
export class WorkshopSettingsv2Component implements OnInit, AfterViewInit, OnDestroy {
  @Input() workshopId: string | null = null;
  @Input() documentsize = '';
  @Input() docPercent = 0;

  private _data: any = null;
  @Input() set workshopData(v: any) {
    this._data = v;
    if (v && !this.hasInitializedForm) {
      this.patchSettingsData(v);
      this.lastSaved = v;
      this.hasInitializedForm = true;
      setTimeout(() => this.onScroll());
    }
  }
  get workshopData(): any { return this._data; }
  private _isNew = false;
  /** No document yet: defaults are the form; the first save creates the document. */
  @Input() set isNew(v: boolean) {
    this._isNew = !!v;
    if (this._isNew && !this.hasInitializedForm) { this.hasInitializedForm = true; this.lastSaved = null; }
  }
  get isNew(): boolean { return this._isNew; }

  // ───────────────────────── form ─────────────────────────
  settingsForm!: FormGroup;
  hasInitializedForm = false;
  private isSaving = false;
  private lastSaved: any = null;
  saving = false;
  saveError = false;
  justSaved = false;
  private savedTimer: any = null;

  // ───────────────────────── reference data (as legacy) ─────────────────────────
  journeyData: any[] = [];
  tierData: any[] = [];
  chatgroupslist: any[] = [];
  bigCohorts: any[] = [];
  workshopCategories: any[] = [];
  workshopCategoriesMap: Record<string, string> = {};
  names: { id: string, name: string }[] = [];
  newNames: { id: string, name: string }[] = [];
  profileNameMap: Record<string, string> = {};
  newProfileNameMap: Record<string, string> = {};
  private newIdSet = new Set<string>();
  regularSelections: Record<string, string[]> = {};
  newSelections: Record<string, string[]> = {};
  readonly managedProfilePaths = ['testusers', 'facilitatorprofiles', 'referallowedusers.referallowedusers', 'evergreenaccessto.selected'];
  private previousValue: string[] = [];
  private previousValueCohorts: string[] = [];
  private dailyCommunicationBuffer: string[] = [];
  private dailyCommunicationBuffer2: string[] = [];

  readonly customerStatuses = ['non active', 'active', 'discontinued', 'none', 'banned', 'late'];
  readonly financialStatuses = ['fully paid', 'regular', 'discontinued', 'locked', 'defaulted', 'banned', 'late'];
  readonly activityChannels = ['workshop-logs', 'workshop-subscriber-activity'];
  readonly cpwelcomeFields = [
    { key: 'abovediagnosticsheading', label: 'Above Diagnostics · heading', placeholder: 'Enter heading to show for abovediagnostics .', hint: 'Shown to Above Diagnostics participants when they enrolled' },
    { key: 'abovediagnosticsdescription', label: 'Above Diagnostics · description', placeholder: 'Enter Description to show for abovediagnostics .', hint: 'Shown to Above Diagnostics participants when they enrolled' },
    { key: 'facilitatorheading', label: 'Facilitators · heading', placeholder: 'Enter heading to show for Facilitators .', hint: 'Shown to Facilitators participants when they enrolled' },
    { key: 'facilitatordescription', label: 'Facilitators · description', placeholder: 'Enter Description to show for Facilitators .', hint: 'Shown to Facilitators participants when they enrolled' },
  ];
  cpwelcomeeditors: { [key: string]: Editor } = {};
  toolbarFull: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    [{ heading: ['h1', 'h2', 'h3'] }],
    ['bullet_list', 'ordered_list'],
    ['link', 'text_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];

  // ───────────────────────── sections / rail ─────────────────────────
  sections: SectionDef[] = [
    { id: 'mode', title: 'Mode & visibility', group: 'General', controls: ['testmode', 'testusers', 'active', 'webactive', 'homescreenwidget', 'qanda', 'enableshare', 'enablesharemessage', 'breakdown', 'triggerFunction'] },
    { id: 'audience', title: 'Audience', group: 'Access', controls: ['activeparticipants', 'newusersonly', 'journeybased', 'selectedjourneys', 'tierbased', 'selectedtiers', 'facilitator', 'facilitatorprofiles'] },
    { id: 'category', title: 'Category based', group: 'Access', controls: ['categorybased', 'categoriesforthisworkshop', 'cohortcategoriesforthisworkshop', 'cohortsforthisworkshop', 'categorythumbnail', 'categoryVideo', 'cpwelcomemessage'] },
    { id: 'evergreen', title: 'Evergreen workshop', group: 'Access', controls: ['evergreenWorkshop', 'evergreenWorkshopMeta', 'referralworkshop', 'refercount', 'referralcodestartswith', 'referralmessage', 'referraldialogmessage', 'payment', 'paymentmap', 'referallowedusers', 'evergreenaccessto'] },
    { id: 'logs', title: 'Logs & chat', group: 'Communication', controls: ['workshopactivitychannel', 'selectedgroup'] },
    { id: 'mail', title: 'Mail template', group: 'Communication', controls: ['mailTemplate'] },
    { id: 'messages', title: 'Messages', group: 'Communication', controls: ['enrollwattimessage', 'enrolledcongrats', 'enrollmentnotallowedmessage', 'enrollmentnotallowedmessagenew'] },
    { id: 'hero', title: 'Hero', group: 'Communication', controls: ['hero', 'heromobile', 'heroHeading', 'heroDescription', 'heroshowtype', 'heroImage', 'heroImageMobile', 'heroVideo', 'heroAccent'] },
  ];
  readonly groups: SectionDef['group'][] = ['General', 'Access', 'Communication'];
  collapsed = new Set<string>();
  activeSection = 'mode';

  // ───────────────────────── UI state ─────────────────────────
  openPopover: string | null = null;
  popSearch = '';
  popTab: 'regular' | 'new' = 'regular';
  selectedDay = 0;
  uploading: Record<string, boolean> = {};

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private storage: Storage,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private guard: AuthguardService,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>,
  ) {
    this.initializeForm();
    this.wireFormRules();   // before the first workshopData patch, as legacy subscribes before load
  }

  // ═══════════════════════════ lifecycle ═══════════════════════════
  ngOnInit(): void {
    this.cpwelcomeFields.forEach(f => { this.cpwelcomeeditors[f.key] = new Editor(); });
    this.loadReferenceData();
    this.settingsForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.justSaved && this.settingsForm.dirty) this.justSaved = false;
      if (this.saveError && this.settingsForm.dirty) this.saveError = false;
    });
  }

  ngOnDestroy(): void {
    this.scrollEl?.removeEventListener('scroll', this.onScroll);
    this.destroy$.next();
    this.destroy$.complete();
    Object.values(this.cpwelcomeeditors).forEach(e => e?.destroy());
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.openPopover) return;
    if (!(event.target as HTMLElement).closest('[data-pop]')) this.closePopover();
  }
  @HostListener('document:keydown.escape')
  onEscape(): void { this.closePopover(); }

  // scroll spy on the shell's scroll container
  private scrollEl: HTMLElement | Window | null = null;
  private scrollTicking = false;
  private readonly onScroll = () => {
    if (this.scrollTicking || this.host.nativeElement.hidden) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.scrollTicking = false;
      const containerTop = this.scrollEl instanceof HTMLElement ? this.scrollEl.getBoundingClientRect().top : 0;
      const threshold = containerTop + 72;
      let current = this.sections[0].id;
      for (const s of this.sections) {
        const el = document.getElementById('st-' + s.id);
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
  refreshSpy(): void { this.onScroll(); }

  // ═══════════════════════════ form model (ported verbatim) ═══════════════════════════
  private initializeForm(): void {
    this.settingsForm = this.fb.group({
      active: [false],
      webactive: [false],
      homescreenwidget: [false],
      qanda: [false],
      breakdown: [false],
      enableshare: [false],
      enablesharemessage: [''],
      triggerFunction: [false],
      activeparticipants: [false],
      evergreenWorkshop: [false],
      evergreenWorkshopMeta: this.fb.group({
        workshopDays: [{ value: null, disabled: true }, [Validators.min(1)]],
        lastChallengeMessage: [{ value: '', disabled: true }],
        dailyCommunication: this.fb.array([this.fb.control({ value: '', disabled: true })]),
        dailyCommunication2: this.fb.array([this.fb.control({ value: '', disabled: true })])
      }),
      referralworkshop: [false],
      refercount: [null],
      referralcodestartswith: ['', [Validators.pattern(/^[A-Z]*$/)]],
      referralmessage: [''],
      referraldialogmessage: [''],
      enrollmentnotallowedmessage: [''],
      enrollmentnotallowedmessagenew: [''],
      payment: [false],
      paymentmap: this.fb.group({
        amount: [null], amountstriked: [null], api: [''], id: [''], paymentfor: [''], customerstatus: [[]], financialstatus: [[]], hint: ['']
      }),
      referallowedusers: this.fb.group({ all: [false], referallowedusers: [[] as string[]], newuserreferallowed: [false] }),
      evergreenaccessto: this.fb.group({ all: [false], new: [false], selected: [[] as string[]] }),
      cpwelcomemessage: this.fb.group({ abovediagnosticsdescription: [''], abovediagnosticsheading: [''], facilitatordescription: [''], facilitatorheading: [''] }),
      newusersonly: [false],
      journeybased: [false],
      tierbased: [false],
      categorybased: [false],
      testmode: [false],
      facilitator: [false],
      hero: [false],
      heromobile: [false],
      heroHeading: [''],
      heroDescription: [''],
      heroshowtype: [''],
      heroImage: [''],
      heroImageMobile: [''],
      heroVideo: [''],
      heroAccent: ['', [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]],
      testusers: [[]],
      facilitatorprofiles: [[]],
      selectedgroup: [''],
      enrollwattimessage: [''],
      enrolledcongrats: [''],
      loginlogchannel: ['workshop-logs'],
      workshopactivitychannel: ['workshop-logs'],
      selectedjourneys: [[]],
      selectedtiers: [[]],
      categoriesforthisworkshop: [[]],
      cohortcategoriesforthisworkshop: [[]],
      cohortsforthisworkshop: [[]],
      categorythumbnail: [''],
      categoryVideo: [''],
      mailTemplate: this.fb.group({ subject: [''], description: [''], liveCallText: [''] })
    });
  }

  /** Legacy ngOnInit subscriptions: category-in-use revert, evergreen enable/disable, days → arrays. */
  private wireFormRules(): void {
    this.settingsForm.get('categoriesforthisworkshop')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((newValue: string[]) => {
      if (this.previousValue && this.previousValue.length > 0) {
        const removedIds = this.previousValue.filter(id => !newValue?.includes(id));
        for (const categoryId of removedIds) {
          if (this.isCategoryUsed(categoryId)) {
            this.settingsForm.get('categoriesforthisworkshop')?.setValue(this.previousValue, { emitEvent: false });
            this.snackBar.open('This category is already used in one or more challenges. Cannot remove.', 'Close', { duration: 3000, panelClass: 'sx-snack' });
            return;
          }
        }
      }
      this.previousValue = [...(newValue || [])];
    });
    this.previousValue = [...(this.settingsForm.get('categoriesforthisworkshop')?.value || [])];

    this.settingsForm.get('evergreenWorkshop')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      const meta = this.settingsForm.get('evergreenWorkshopMeta') as FormGroup;
      if (value) {
        meta.get('workshopDays')?.enable();
        meta.get('workshopDays')?.setValidators([Validators.required, Validators.min(1)]);
        meta.get('lastChallengeMessage')?.enable();
        this.getDailyCommunicationArray().controls.forEach(c => c.enable());
        this.getDailyCommunication2Array().controls.forEach(c => c.enable());
      } else {
        meta.get('workshopDays')?.disable();
        meta.get('workshopDays')?.clearValidators();
        meta.get('lastChallengeMessage')?.disable();
        this.getDailyCommunicationArray().controls.forEach(c => c.disable());
        this.getDailyCommunication2Array().controls.forEach(c => c.disable());
      }
      meta.get('workshopDays')?.updateValueAndValidity();
      meta.get('lastChallengeMessage')?.updateValueAndValidity();
    });
    this.settingsForm.get('evergreenWorkshopMeta.workshopDays')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((days: number) => {
      this.syncDailyCommunicationArray(days);
      if (this.selectedDay >= this.getDailyCommunicationArray().length) this.selectedDay = Math.max(0, this.getDailyCommunicationArray().length - 1);
    });
    this.settingsForm.get('cohortcategoriesforthisworkshop')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((newValue: string[]) => {
      if (this.previousValueCohorts && this.previousValueCohorts.length > 0) {
        const removedIds = this.previousValueCohorts.filter(id => !newValue?.includes(id));
        for (const categoryId of removedIds) {
          if (this.isCategoryUsed(categoryId)) {
            this.settingsForm.get('cohortcategoriesforthisworkshop')?.setValue(this.previousValueCohorts, { emitEvent: false });
            this.snackBar.open('This category is already used in one or more challenges. Cannot remove.', 'Close', { duration: 3000, panelClass: 'sx-snack' });
            return;
          }
        }
      }
      this.previousValueCohorts = [...(newValue || [])];
    });
    this.previousValueCohorts = [...(this.settingsForm.get('cohortcategoriesforthisworkshop')?.value || [])];
  }

  syncDailyCommunicationArray(days: number): void {
    if (!days || days < 1) return;
    const isEnabled = this.settingsForm.get('evergreenWorkshop')?.value;
    this.syncOneDailyArray(this.getDailyCommunicationArray(), this.dailyCommunicationBuffer, days, isEnabled);
    this.syncOneDailyArray(this.getDailyCommunication2Array(), this.dailyCommunicationBuffer2, days, isEnabled);
  }
  private syncOneDailyArray(arr: FormArray, buffer: string[], days: number, isEnabled: boolean): void {
    arr.controls.forEach((ctrl, i) => { buffer[i] = ctrl.value || buffer[i] || ''; });
    while (arr.length > days) arr.removeAt(arr.length - 1);
    while (arr.length < days) {
      const index = arr.length;
      arr.push(this.fb.control({ value: buffer[index] || '', disabled: !isEnabled }));
    }
  }
  getDailyCommunicationArray(): FormArray { return this.settingsForm.get('evergreenWorkshopMeta.dailyCommunication') as FormArray; }
  getDailyCommunication2Array(): FormArray { return this.settingsForm.get('evergreenWorkshopMeta.dailyCommunication2') as FormArray; }

  patchSettingsData(data: any): void {
    if (!data || typeof data !== 'object') return;
    this.settingsForm.patchValue({
      active: data['active'] || false,
      webactive: data['webactive'] || false,
      homescreenwidget: data['homescreenwidget'] || false,
      qanda: data['qanda'] || false,
      breakdown: data['breakdown'] || false,
      enableshare: data['enableshare'] || false,
      enablesharemessage: data['enablesharemessage'] || '',
      triggerFunction: data['triggerFunction'] || false,
      activeparticipants: data['activeparticipants'] || false,
      evergreenWorkshop: data['evergreenWorkshop'] || false,
      evergreenWorkshopMeta: {
        workshopDays: data['evergreenWorkshopMeta']?.workshopDays ?? null,
        lastChallengeMessage: data['evergreenWorkshopMeta']?.lastChallengeMessage ?? '',
      },
      referralworkshop: data['referralworkshop'] || false,
      refercount: data['refercount'] ?? null,
      referralcodestartswith: data['referralcodestartswith'] ?? '',
      referralmessage: data['referralmessage'] ?? '',
      referraldialogmessage: data['referraldialogmessage'] ?? '',
      enrollmentnotallowedmessage: data['enrollmentnotallowedmessage'] ?? '',
      enrollmentnotallowedmessagenew: data['enrollmentnotallowedmessagenew'] ?? '',
      payment: data['payment'] || false,
      paymentmap: {
        amount: data['paymentmap']?.amount ?? null,
        amountstriked: data['paymentmap']?.amountstriked ?? null,
        api: data['paymentmap']?.api ?? '',
        id: data['paymentmap']?.id ?? '',
        paymentfor: data['paymentmap']?.paymentfor ?? '',
        customerstatus: Array.isArray(data['paymentmap']?.customerstatus) ? data['paymentmap'].customerstatus : [],
        financialstatus: Array.isArray(data['paymentmap']?.financialstatus) ? data['paymentmap'].financialstatus : [],
        hint: data['paymentmap']?.hint ?? '',
      },
      referallowedusers: {
        all: data['referallowedusers']?.all || false,
        referallowedusers: data['referallowedusers']?.referallowedusers || [],
        newuserreferallowed: data['referallowedusers']?.newuserreferallowed || false,
      },
      evergreenaccessto: {
        all: data['evergreenaccessto']?.all || false,
        new: data['evergreenaccessto']?.new || false,
        selected: data['evergreenaccessto']?.selected || [],
      },
      cpwelcomemessage: {
        abovediagnosticsdescription: data['cpwelcomemessage']?.abovediagnosticsdescription ?? '',
        abovediagnosticsheading: data['cpwelcomemessage']?.abovediagnosticsheading ?? '',
        facilitatordescription: data['cpwelcomemessage']?.facilitatordescription ?? '',
        facilitatorheading: data['cpwelcomemessage']?.facilitatorheading ?? '',
      },
      newusersonly: data['newusersonly'] || false,
      journeybased: data['journeybased'] || false,
      tierbased: data['tierbased'] || false,
      categorybased: data['categorybased'] || false,
      testmode: data['testmode'] || false,
      facilitator: data['facilitator'] || false,
      testusers: data['testusers'] || [],
      facilitatorprofiles: data['facilitatorprofiles'] || [],
      selectedgroup: data['selectedgroup'] || null,
      enrollwattimessage: data['enrollwattimessage'] || null,
      enrolledcongrats: data['enrolledcongrats'] ?? '',
      loginlogchannel: data['loginlogchannel'] || 'workshop-logs',
      workshopactivitychannel: data['workshopactivitychannel'] || 'workshop-logs',
      mailTemplate: data['mailTemplate'] || null,
      selectedjourneys: data['selectedjourneys'] || [],
      selectedtiers: data['selectedtiers'] || [],
      categoriesforthisworkshop: data['categoriesforthisworkshop'] || [],
      cohortcategoriesforthisworkshop: data['cohortcategoriesforthisworkshop'] || [],
      cohortsforthisworkshop: data['cohortsforthisworkshop'] || [],
      categorythumbnail: data['categorythumbnail'] || '',
      categoryVideo: data['categoryVideo'] || '',
      hero: data['hero'] || false,
      heromobile: data['heromobile'] || false,
      heroHeading: data['heroHeading'] || '',
      heroDescription: data['heroDescription'] || '',
      heroshowtype: data['heroshowtype'] || '',
      heroImage: data['heroImage'] || '',
      heroImageMobile: data['heroImageMobile'] || '',
      heroVideo: data['heroVideo'] || '',
      heroAccent: data['heroAccent'] || '',
    });

    // ngx-editor normalises what it displays and echoes it back into the control; keep the
    // raw saved HTML in the model so an untouched field is written back byte-for-byte.
    this.cpwelcomeFields.forEach(f => this.settingsForm.get('cpwelcomemessage.' + f.key)?.setValue(data['cpwelcomemessage']?.[f.key] ?? '', { emitModelToViewChange: false, emitEvent: false }));

    const isEvergreenEnabled = !!data['evergreenWorkshop'];
    const workshopDays = data['evergreenWorkshopMeta']?.workshopDays || 0;
    const savedComms: string[] = data['evergreenWorkshopMeta']?.dailyCommunication || [];
    const savedComms2: string[] = data['evergreenWorkshopMeta']?.dailyCommunication2 || [];
    this.dailyCommunicationBuffer = [...savedComms];
    this.dailyCommunicationBuffer2 = [...savedComms2];
    const dailyArray = this.getDailyCommunicationArray();
    const dailyArray2 = this.getDailyCommunication2Array();
    dailyArray.clear();
    dailyArray2.clear();
    for (let i = 0; i < workshopDays; i++) {
      dailyArray.push(this.fb.control({ value: savedComms[i] || '', disabled: !isEvergreenEnabled }));
      dailyArray2.push(this.fb.control({ value: savedComms2[i] || '', disabled: !isEvergreenEnabled }));
    }
    if (isEvergreenEnabled) {
      const meta = this.settingsForm.get('evergreenWorkshopMeta') as FormGroup;
      meta.get('workshopDays')?.enable();
      meta.get('lastChallengeMessage')?.enable();
      dailyArray.controls.forEach(c => c.enable());
      dailyArray2.controls.forEach(c => c.enable());
    }
    this.managedProfilePaths.forEach(p => this.syncSplit(p));
    this.previousValue = [...(this.settingsForm.get('categoriesforthisworkshop')?.value || [])];
    this.previousValueCohorts = [...(this.settingsForm.get('cohortcategoriesforthisworkshop')?.value || [])];
    this.selectedDay = 0;
    this.settingsForm.markAsPristine();
    this.settingsForm.markAsUntouched();
  }

  /** The legacy updateDoc payload — 53 root fields, same defaults and transforms. */
  private buildPayload(): any {
    const g = (k: string) => this.settingsForm.get(k)?.value;
    return {
      active: g('active') || false,
      webactive: g('webactive') || false,
      homescreenwidget: g('homescreenwidget') || false,
      qanda: g('qanda') || false,
      breakdown: g('breakdown') || false,
      enableshare: g('enableshare') || false,
      enablesharemessage: g('enablesharemessage') || '',
      triggerFunction: g('triggerFunction') || false,
      activeparticipants: g('activeparticipants') || false,
      evergreenWorkshop: g('evergreenWorkshop') || false,
      evergreenWorkshopMeta: g('evergreenWorkshopMeta') ?? null,
      referralworkshop: g('referralworkshop') || false,
      refercount: g('refercount') ?? null,
      referralcodestartswith: g('referralcodestartswith') || '',
      referralmessage: g('referralmessage') || '',
      referraldialogmessage: g('referraldialogmessage') || '',
      enrollmentnotallowedmessage: g('enrollmentnotallowedmessage') || '',
      enrollmentnotallowedmessagenew: g('enrollmentnotallowedmessagenew') || '',
      payment: g('payment') || false,
      paymentmap: g('paymentmap') ?? null,
      referallowedusers: g('referallowedusers') ?? null,
      evergreenaccessto: g('evergreenaccessto') ?? null,
      cpwelcomemessage: g('cpwelcomemessage') ?? null,
      newusersonly: g('newusersonly') || false,
      journeybased: g('journeybased') || false,
      tierbased: g('tierbased') || false,
      categorybased: g('categorybased') || false,
      testmode: g('testmode') || false,
      facilitator: g('facilitator') || false,
      facilitatorprofiles: g('facilitatorprofiles') || [],
      selectedgroup: g('selectedgroup') || null,
      loginlogchannel: g('loginlogchannel') || null,
      enrollwattimessage: g('enrollwattimessage') || null,
      enrolledcongrats: g('enrolledcongrats') || '',
      workshopactivitychannel: g('workshopactivitychannel') || null,
      mailTemplate: g('mailTemplate') || null,
      testusers: g('testusers') || [],
      selectedjourneys: g('selectedjourneys') || [],
      selectedtiers: g('selectedtiers') || [],
      categoriesforthisworkshop: g('categoriesforthisworkshop') || [],
      cohortcategoriesforthisworkshop: g('cohortcategoriesforthisworkshop') || [],
      cohortsforthisworkshop: g('cohortsforthisworkshop') || [],
      categorythumbnail: g('categorythumbnail') || '',
      categoryVideo: g('categoryVideo') || '',
      hero: g('hero') || false,
      heromobile: g('heromobile') || false,
      heroHeading: g('heroHeading') || '',
      heroDescription: g('heroDescription') || '',
      heroshowtype: g('heroshowtype') || '',
      heroImage: g('heroImage') || '',
      heroImageMobile: g('heroImageMobile') || '',
      heroVideo: g('heroVideo') || '',
      heroAccent: (g('heroAccent') || '').trim().toUpperCase(),
    };
  }

  // ═══════════════════════════ save / discard ═══════════════════════════
  hasUnsavedChanges(): boolean { return !!this.settingsForm && this.settingsForm.dirty; }
  get editedSectionsText(): string { return this.sections.filter(s => this.isSectionDirty(s)).map(s => s.title).join(' · '); }
  isSectionDirty(s: SectionDef): boolean { return s.controls.some(k => !!this.settingsForm.get(k)?.dirty); }

  get saveState(): SaveState {
    if (this.saving) return 'saving';
    if (this.saveError) return 'error';
    if (this.isNew && this.hasUnsavedChanges()) return 'blocked';   // only the Enrollment save creates the document
    if (this.hasUnsavedChanges()) return 'dirty';
    if (this.justSaved) return 'saved';
    return 'idle';
  }
  /** The only reason Settings ever blocks: the workshop document does not exist yet. */
  get blockedReason(): string { return 'Save the Enrollment page first — it creates the workshop'; }
  /** Warnings only — the legacy never blocked a save. */
  get saveWarning(): string {
    const w: string[] = [];
    if (this.v('evergreenWorkshop') && !(this.settingsForm.get('evergreenWorkshopMeta.workshopDays')?.value >= 1)) w.push('Workshop days is empty');
    if (this.settingsForm.get('heroAccent')?.invalid) w.push('Hero accent colour is not a six-digit hex');
    if (this.settingsForm.get('referralcodestartswith')?.invalid) w.push('Referral code prefix has non-letters');
    return w.join(' · ');
  }

  async saveSettings(): Promise<void> {
    if (!this.workshopId || !this.hasInitializedForm || this.isNew) return;
    this.saving = true;
    this.isSaving = true;
    this.saveError = false;
    try {
      const payload = this.buildPayload();
      const docRef = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
      await updateDoc(docRef, payload);
      this.lastSaved = payload;
      this.settingsForm.markAsPristine();
      this.justSaved = true;
      if (this.savedTimer) clearTimeout(this.savedTimer);
      this.savedTimer = setTimeout(() => { this.justSaved = false; }, 4000);
    } catch (error) {
      console.error('Error saving settings:', error);
      this.saveError = true;
    } finally {
      this.isSaving = false;
      this.saving = false;
    }
  }

  discardChanges(): void {
    if (this.saving) return;
    this.patchSettingsData(this.lastSaved || this._data || {});
    this.saveError = false;
    this.justSaved = false;
  }

  // ═══════════════════════════ reference data (ported) ═══════════════════════════
  private loadReferenceData(): void {
    Promise.all([this.guard.getProfileMap(), this.guard.getProfileMapNewUser()]).then(([e, f]: any[]) => {
      const mapProfile = e?.map || {};
      const mapProfileNew = f?.map || {};
      this.names = Object.keys(mapProfile).map(key => ({ id: key, name: mapProfile[key] })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.newNames = Object.keys(mapProfileNew).map(key => ({ id: key, name: mapProfileNew[key] })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.profileNameMap = this.names.reduce((acc: any, n) => { acc[n.id] = n.name; return acc; }, {});
      this.newProfileNameMap = this.newNames.reduce((acc: any, n) => { acc[n.id] = n.name; return acc; }, {});
      this.newIdSet = new Set(this.newNames.map(n => n.id));
      this.managedProfilePaths.forEach(p => this.syncSplit(p));
    }).catch(err => console.error('Error loading profile maps:', err));

    collectionSnapshots(collection(this.firestore, 'journey')).pipe(takeUntil(this.destroy$)).subscribe(snaps => {
      this.journeyData = snaps.map(d => ({ id: d.id, ...(d.data() as any) }));
    });
    collectionSnapshots(collection(this.firestore, 'tier')).pipe(takeUntil(this.destroy$)).subscribe(snaps => {
      this.tierData = snaps.map(d => ({ id: d.id, ...(d.data() as any) }));
    });
    getDocs(query(collection(this.firestore, 'supportchat'), where('type', '==', 'group'))).then(snap => {
      const groups = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      this.chatgroupslist = groups.sort((a: any, b: any) => {
        const aTime = a.created_on?.seconds || a.created_on || 0;
        const bTime = b.created_on?.seconds || b.created_on || 0;
        return bTime - aTime;
      });
    }).catch(err => console.error('Error loading chat groups:', err));
    this.getbigCohorts();
    this.getWorkshopCategories();
  }
  async getbigCohorts(): Promise<void> {
    try {
      const snap = await getDocs(query(collection(this.firestore, 'big cohorts'), orderBy('createddate', 'desc')));
      this.bigCohorts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (error) { console.error('Error fetching cohorts:', error); }
  }
  async getWorkshopCategories(): Promise<void> {
    if (!this.workshopId) return;
    try {
      const snap = await getDocs(query(collection(this.firestore, 'workshopcategory'), where('workshopid', '==', this.workshopId)));
      this.workshopCategories = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      this.workshopCategoriesMap = this.workshopCategories.reduce((acc: any, cat) => { acc[cat.id] = cat.name; return acc; }, {});
    } catch (error) { console.error('Error fetching categories:', error); }
  }

  // ═══════════════════════════ generic helpers ═══════════════════════════
  v(key: string): any { return this.settingsForm.get(key)?.value; }
  ctrl(key: string): FormControl { return this.settingsForm.get(key) as FormControl; }
  toggleField(key: string): void {
    const c = this.settingsForm.get(key); if (!c) return;
    this.closePopover();
    c.setValue(!c.value); c.markAsDirty();   // legacy onToggleChange: setValue only
  }
  setField(key: string, value: any): void {
    const c = this.settingsForm.get(key); if (!c) return;
    c.setValue(value); c.markAsDirty();
    this.closePopover();
  }
  toggleInArray(key: string, id: string): void {
    const c = this.settingsForm.get(key); if (!c) return;
    const cur: any[] = c.value || [];
    c.setValue(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]); c.markAsDirty();
  }
  inArray(key: string, id: string): boolean { return (this.settingsForm.get(key)?.value || []).includes(id); }
  countOn(keys: string[]): number { return keys.filter(k => !!this.v(k)).length; }
  filtered<T>(list: T[], labelOf: (x: T) => string): T[] {
    const q = this.popSearch.trim().toLowerCase();
    return q ? list.filter(x => (labelOf(x) || '').toLowerCase().includes(q)) : list;
  }
  togglePopover(id: string, tab: 'regular' | 'new' = 'regular'): void {
    if (this.openPopover === id) { this.closePopover(); return; }
    this.openPopover = id; this.popSearch = ''; this.popTab = tab;
  }
  closePopover(): void { this.openPopover = null; this.popSearch = ''; }
  isCollapsed(id: string): boolean { return this.collapsed.has(id); }
  toggleSection(id: string): void { this.collapsed.has(id) ? this.collapsed.delete(id) : this.collapsed.add(id); }
  collapseAll(): void { this.sections.forEach(s => this.collapsed.add(s.id)); }
  expandAll(): void { this.collapsed.clear(); }
  sectionsIn(group: string): SectionDef[] { return this.sections.filter(s => s.group === group); }
  jumpTo(id: string): void {
    this.collapsed.delete(id); this.activeSection = id;
    document.getElementById('st-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  railHint(id: string): string {
    switch (id) {
      case 'mode': return `${this.countOn(['testmode', 'active', 'webactive', 'homescreenwidget', 'qanda', 'enableshare', 'breakdown', 'triggerFunction'])} on`;
      case 'audience': return `${this.countOn(['activeparticipants', 'newusersonly', 'journeybased', 'tierbased', 'facilitator'])} on`;
      case 'category': return this.v('categorybased') ? 'On' : 'Off';
      case 'evergreen': return this.v('evergreenWorkshop') ? 'On' : 'Off';
      case 'hero': { const a = []; if (this.v('hero')) a.push('Web'); if (this.v('heromobile')) a.push('Mobile'); return a.join(' · ') || 'Off'; }
      default: return '';
    }
  }
  railHasContent(id: string): boolean {
    const s = this.sections.find(x => x.id === id)!;
    return s.controls.some(k => { const val = this.v(k); return Array.isArray(val) ? val.length > 0 : typeof val === 'object' && val ? Object.values(val).some(x => Array.isArray(x) ? x.length : !!x) : !!val; });
  }

  // ═══════════════════════════ people picker (legacy buckets) ═══════════════════════════
  nameFor(id: string): string { return this.profileNameMap[id] || this.newProfileNameMap[id] || id; }
  isNewUser(id: string): boolean { return this.newIdSet.has(id); }
  private syncSplit(path: string): void {
    const all: string[] = this.settingsForm.get(path)?.value || [];
    this.newSelections[path] = all.filter(id => this.newIdSet.has(id));
    this.regularSelections[path] = all.filter(id => !this.newIdSet.has(id));
  }
  onProfileSelectChange(path: string, isNew: boolean, selected: string[]): void {
    if (isNew) this.newSelections[path] = selected || []; else this.regularSelections[path] = selected || [];
    const combined = [...(this.regularSelections[path] || []), ...(this.newSelections[path] || [])];
    this.settingsForm.get(path)?.setValue(Array.from(new Set(combined)));
    this.settingsForm.get(path)?.markAsDirty();
  }
  togglePerson(path: string, id: string, isNew: boolean): void {
    this.syncSplit(path);
    const bucket = isNew ? (this.newSelections[path] || []) : (this.regularSelections[path] || []);
    const next = bucket.includes(id) ? bucket.filter(x => x !== id) : [...bucket, id];
    const dir = isNew ? this.newNames : this.names;   // legacy mat-select emitted the bucket in option order
    next.sort((a, b) => dir.findIndex(n => n.id === a) - dir.findIndex(n => n.id === b));
    this.onProfileSelectChange(path, isNew, next);
  }
  removeProfileId(path: string, id: string): void {
    const all: string[] = this.settingsForm.get(path)?.value || [];
    this.settingsForm.get(path)?.setValue(all.filter(x => x !== id));
    this.settingsForm.get(path)?.markAsDirty();
    this.syncSplit(path);
  }
  get filteredNames(): { id: string, name: string }[] { return this.filtered(this.names, n => n.name); }
  get filteredNewNames(): { id: string, name: string }[] { return this.filtered(this.newNames, n => n.name); }
  peopleCount(path: string): number { return (this.settingsForm.get(path)?.value || []).length; }

  // ═══════════════════════════ journeys / tiers / chat / cohorts ═══════════════════════════
  journeyName(id: string): string { return this.journeyData.find(j => j.id === id)?.journey || id; }
  tierName(id: string): string { return this.tierData.find(t => t.id === id)?.tier || id; }
  groupName(id: string): string { return this.chatgroupslist.find(g => g.id === id)?.group_name || ''; }
  cohortLabel(c: any): string { return `${c.name} - (${c.participantidlist?.length || 0} Participants)`; }
  cohortLabelById(id: string): string { const c = this.bigCohorts.find(x => x.id === id); return c ? this.cohortLabel(c) : id; }
  cohortNameById(id: string): string { return this.bigCohorts.find(x => x.id === id)?.name || id; }
  get filteredJourneys(): any[] { return this.filtered(this.journeyData, j => j.journey); }
  get filteredTiers(): any[] { return this.filtered(this.tierData, t => t.tier); }
  get filteredGroups(): any[] { return this.filtered(this.chatgroupslist, g => g.group_name); }
  get filteredCohorts(): any[] { return this.filtered(this.bigCohorts, c => c.name); }
  isCohortDisabled(cohortId: string): boolean {
    const selected: string[] = this.v('cohortsforthisworkshop') || [];
    return selected.length >= 2 && !selected.includes(cohortId);
  }
  toggleCohort(id: string): void {
    if (!this.inArray('cohortsforthisworkshop', id) && this.isCohortDisabled(id)) return;   // max 2, as legacy
    this.toggleInArray('cohortsforthisworkshop', id);
  }

  // ═══════════════════════════ categories (ported guard, dialog, order) ═══════════════════════════
  catName(id: string): string { return this.workshopCategoriesMap[id] ?? ''; }
  catLabel(c: any): string { return `${c.name} (${c.description})`; }
  isCategoryUsed(categoryId: string): boolean {
    return !!this._data?.challenges?.some((challenge: any) => challenge.workshopcategory?.includes(categoryId));
  }
  usedBySets(categoryId: string): string {
    const sets: number[] = [];
    (this._data?.challenges || []).forEach((c: any, i: number) => { if (c.workshopcategory?.includes(categoryId)) sets.push(i + 1); });
    return sets.map(n => `Set ${n}`).join(' · ');
  }
  get filteredCategories(): any[] { return this.filtered(this.workshopCategories, c => this.catLabel(c)); }
  toggleWorkshopCategory(id: string): void {
    if (this.inArray('categoriesforthisworkshop', id)) { this.removecategoriesforthisworkshop(id); return; }
    this.toggleInArray('categoriesforthisworkshop', id);   // appends → keeps the saved drag order
  }
  removecategoriesforthisworkshop(categoryId: string): void {
    if (this.isCategoryUsed(categoryId)) {
      this.snackBar.open('This category is already used in one or more challenges. Cannot remove.', 'Close', { duration: 3000, panelClass: 'sx-snack' });
      return;
    }
    const c = this.settingsForm.get('categoriesforthisworkshop'); const cur: string[] = c?.value || [];
    c?.setValue(cur.filter(id => id !== categoryId)); c?.markAsDirty();
  }
  removeCohortcategoriesforthisworkshop(categoryId: string): void {
    if (this.isCategoryUsed(categoryId)) {
      this.snackBar.open('This category is already used in one or more challenges. Cannot remove.', 'Close', { duration: 3000, panelClass: 'sx-snack' });
      return;
    }
    const c = this.settingsForm.get('cohortcategoriesforthisworkshop'); const cur: string[] = c?.value || [];
    c?.setValue(cur.filter(id => id !== categoryId)); c?.markAsDirty();
  }
  dropCategory(event: CdkDragDrop<string[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const currentOrder: string[] = [...(this.v('categoriesforthisworkshop') || [])];
    moveItemInArray(currentOrder, event.previousIndex, event.currentIndex);
    const c = this.settingsForm.get('categoriesforthisworkshop'); c?.setValue(currentOrder); c?.markAsDirty();
  }
  createCategory(): void {
    const dialogRef = this.dialog.open(WorkshopCategoryComponent, { width: '400px', data: { mode: 'create', workshopid: this.workshopId } });
    dialogRef.afterClosed().subscribe(() => this.getWorkshopCategories());
  }
  editCategory(category: any): void {
    const dialogRef = this.dialog.open(WorkshopCategoryComponent, { width: '400px', data: { mode: 'edit', category } });
    dialogRef.afterClosed().subscribe(() => this.getWorkshopCategories());
  }

  // ═══════════════════════════ evergreen days ═══════════════════════════
  get dayCount(): number { return this.getDailyCommunicationArray().length; }
  /** Bind by instance: FormControlName never re-attaches when its name changes. */
  dayCtrl(arr: FormArray, i: number): FormControl { return arr.at(i) as FormControl; }
  get dayIndexes(): number[] { return Array.from({ length: this.dayCount }, (_, i) => i); }
  dayHasContent(i: number): boolean {
    return !!(this.getDailyCommunicationArray().at(i)?.value || this.getDailyCommunication2Array().at(i)?.value);
  }
  get daysLabel(): string { const n = this.dayCount; return n ? `${n} ${n === 1 ? 'day' : 'days'}` : 'no days'; }

  // ═══════════════════════════ referral / hero accent (ported) ═══════════════════════════
  onReferralCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = (input.value || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (input.value !== cleaned) input.value = cleaned;
    this.settingsForm.get('referralcodestartswith')?.setValue(cleaned);
    this.settingsForm.get('referralcodestartswith')?.markAsDirty();
  }
  onReferralMessageInput(event: Event): void {
    const input = event.target as HTMLTextAreaElement;
    const cleaned = (input.value || '').replace(/[\r\n]+/g, ' ');
    if (input.value !== cleaned) input.value = cleaned;
    this.settingsForm.get('referralmessage')?.setValue(cleaned);
    this.settingsForm.get('referralmessage')?.markAsDirty();
  }
  get heroAccentSwatch(): string {
    const val = (this.v('heroAccent') || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(val) ? val : '#FFFFFF';
  }
  onHeroAccentSwatch(event: Event): void {
    const value = (event.target as HTMLInputElement).value || '';
    this.settingsForm.patchValue({ heroAccent: value.toUpperCase() });
    this.settingsForm.get('heroAccent')?.markAsDirty();
  }

  // ═══════════════════════════ uploads (ported paths & messages) ═══════════════════════════
  pickFile(kind: 'heroImage' | 'heroImageMobile' | 'heroVideo' | 'categorythumbnail' | 'categoryVideo'): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'heroVideo' || kind === 'categoryVideo' ? 'video/*' : 'image/*';
    input.onchange = () => { const file = input.files?.[0]; if (file) this.uploadFile(kind, file); };
    input.click();
  }
  onDrop(kind: 'heroImage' | 'heroImageMobile' | 'heroVideo', event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.uploadFile(kind, file);
  }
  onDragOver(event: DragEvent): void { event.preventDefault(); }
  private async uploadFile(kind: 'heroImage' | 'heroImageMobile' | 'heroVideo' | 'categorythumbnail' | 'categoryVideo', file: File): Promise<void> {
    const isHero = kind.startsWith('hero');
    const path = kind === 'categorythumbnail' ? `workshop/thumbnail/${file.name}`
      : kind === 'categoryVideo' ? `workshop/video/${file.name}`
      : `workshops/${this.workshopId}/hero_${Date.now()}`;
    this.uploading[kind] = true;
    try {
      const fileRef = ref(this.storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      this.zone.run(() => {
        this.settingsForm.get(kind)?.setValue(url);
        this.settingsForm.get(kind)?.markAsDirty();
        if (kind === 'categorythumbnail') this.snackBar.open('Thumbnail uploaded successfully!', 'Close', { duration: 2000, panelClass: 'sx-snack' });
        if (kind === 'categoryVideo') this.snackBar.open('Video uploaded successfully!', 'Close', { duration: 2000, panelClass: 'sx-snack' });
      });
    } catch (error) {
      console.error(isHero ? (kind === 'heroVideo' ? 'Video upload failed:' : 'Image upload failed:') : 'Error uploading:', error);
      const msg = kind === 'heroVideo' ? 'Video upload failed' : isHero ? 'Image upload failed'
        : kind === 'categorythumbnail' ? 'Error uploading thumbnail. Please try again.' : 'Error uploading video. Please try again.';
      this.zone.run(() => this.snackBar.open(msg, 'Close', { duration: 2000, panelClass: 'sx-snack' }));
    } finally {
      this.zone.run(() => { this.uploading[kind] = false; });
    }
  }
  removeHeroAsset(field: 'heroImage' | 'heroImageMobile' | 'heroVideo'): void {
    this.settingsForm.get(field)?.setValue('');   // config only; the Storage file stays, as legacy
    this.settingsForm.get(field)?.markAsDirty();
  }
}
