import { Component, Input, OnInit, OnDestroy, AfterViewInit, HostListener, NgZone, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, FormControl, AbstractControl, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Firestore, doc, updateDoc, collection, collectionSnapshots, getDocs, query, where, orderBy, Timestamp } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { DateAdapter } from '@angular/material/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EnrollmentDateAdapter, WC2_MONTHS as MONTHS } from '../wc2-date-adapter';
import { UpdateDeliveryComponent } from '../../../Product Designer/delivery-set/update-delivery/update-delivery.component';
import { QuizComponent } from '../../quiz/quiz.component';
import { UploadEpisodeDialogComponent } from '../../../content/episodes-dashboard/upload-episode-dialog/upload-episode-dialog.component';

type SaveState = 'idle' | 'dirty' | 'saving' | 'blocked' | 'saved' | 'error';

interface ConfirmDialog {
  title: string;
  body: string;
  bodyStrong?: string;
  bodyTail?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/**
 * Workshop Configuration v2 — Challenges tab.
 *
 * Reads/writes the SAME `workshopconfiguration/{id}.challenges` array as the legacy editor.
 * Form groups (set + activity), patch, save, type-change clearing, evolution-mapping rules,
 * drag reorder and the Workshop-Active freeze are ported from the legacy component; only the
 * chrome and UX follow the approved mockups (challenges-page-ui.html, challenges-activity-types.html).
 */
@Component({
  selector: 'app-workshop-challengesv2',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DragDropModule, MatDatepickerModule, MatTimepickerModule, MatSnackBarModule, NgxEditorModule],
  providers: [{ provide: DateAdapter, useClass: EnrollmentDateAdapter }],
  templateUrl: './workshop-challengesv2.component.html',
  styleUrl: './workshop-challengesv2.component.css'
})
export class WorkshopChallengesv2Component implements OnInit, AfterViewInit, OnDestroy {
  @Input() workshopId: string | null = null;
  @Input() iconData: any[] = [];
  @Input() thumbnailData: any[] = [];
  @Input() documentsize = '';
  @Input() docPercent = 0;

  private _data: any = null;
  @Input() set workshopData(v: any) {
    this._data = v;
    if (v && !this.hasInitializedForm) {
      this.patchChallengeData(v);
      this.lastSavedChallenges = Array.isArray(v.challenges) ? v.challenges : [];
      this.hasInitializedForm = true;
      setTimeout(() => this.onScroll());
    }
  }
  get workshopData(): any { return this._data; }
  private _isNew = false;
  /** No document yet: the empty curriculum is the form; the first save creates the document. */
  @Input() set isNew(v: boolean) {
    this._isNew = !!v;
    if (this._isNew && !this.hasInitializedForm) { this.hasInitializedForm = true; this.lastSavedChallenges = []; }
  }
  get isNew(): boolean { return this._isNew; }

  // ───────────────────────── form ─────────────────────────
  challengesPageForm!: FormGroup;
  hasInitializedForm = false;
  private isSaving = false;
  private lastSavedChallenges: any[] = [];
  saving = false;
  saveError = false;
  justSaved = false;
  private savedTimer: any = null;

  // ───────────────────────── reference data (as legacy) ─────────────────────────
  videocontent: any[] = [];
  audiocontent: any[] = [];
  deliveryforms: any[] = [];
  videoAsk: any[] = [];
  quiz: any[] = [];
  refTitleMap: Record<string, string> = {};
  workshopCategoriesMap: Record<string, string> = {};
  private iconNameByUrl: Record<string, string> = {};

  readonly challengetype = ['video', 'audio', 'form', 'videoask', 'quiz', 'assignment', 'resource', 'offer', 'note', 'evolutionmapping'];
  readonly typeLabels: Record<string, string> = {
    video: 'Video', audio: 'Audio', form: 'Form', videoask: 'VideoAsk', quiz: 'Quiz', assignment: 'Assignment',
    resource: 'Resource', offer: 'Offer', note: 'Note', evolutionmapping: 'Evolution mapping', zoomcall: 'Zoom call'
  };
  readonly uploadTypes = ['pdf', 'doc', 'image', 'video', 'audio', 'any'];

  // evolution mapping trackers (as legacy)
  evolutionMappingCount = 0;
  selectedEvolutionTypes: { [key: string]: string } = {};
  evolutionMappingActivities: string[] = [];

  // rich text (keyed by activity challengeid so reorder/insert never re-indexes)
  editors: { [key: string]: Editor } = {};
  toolbarFull: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    [{ heading: ['h1', 'h2', 'h3'] }],
    ['bullet_list', 'ordered_list'],
    ['link', 'text_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];

  // ───────────────────────── UI state ─────────────────────────
  openSets = new Set<string>();
  openActs = new Set<string>();
  activeSetId = '';
  openPopover: string | null = null;
  popSearch = '';
  confirmDialog: ConfirmDialog | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private storage: Storage,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>,
  ) {
    this.challengesPageForm = this.fb.group({ challenges: this.fb.array([]) });
  }

  // ═══════════════════════════ lifecycle ═══════════════════════════
  ngOnInit(): void {
    this.loadContent();
    this.getForms();
    this.getVideoAsk();
    this.getQuiz();
    this.getWorkshopCategories();
    this.challengesPageForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.justSaved && this.challengesPageForm.dirty) this.justSaved = false;
      if (this.saveError && this.challengesPageForm.dirty) this.saveError = false;
    });
  }

  ngOnDestroy(): void {
    this.scrollEl?.removeEventListener('scroll', this.onScroll);
    this.destroy$.next();
    this.destroy$.complete();
    Object.values(this.editors).forEach(e => e?.destroy());
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.openPopover) return;
    if (!(event.target as HTMLElement).closest('[data-pop]')) this.closePopover();
  }
  @HostListener('document:keydown.escape')
  onEscape(): void { this.closePopover(); }

  // scroll spy on the shell's scroll container (mat-drawer-content)
  private scrollEl: HTMLElement | Window | null = null;
  private scrollTicking = false;
  private readonly onScroll = () => {
    if (this.scrollTicking || this.host.nativeElement.hidden) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.scrollTicking = false;
      const containerTop = this.scrollEl instanceof HTMLElement ? this.scrollEl.getBoundingClientRect().top : 0;
      const threshold = containerTop + 72;
      let current = '';
      for (const set of this.challengesArray.controls) {
        const id = set.get('challengeid')?.value;
        const el = document.getElementById('set-' + id);
        if (el && el.getBoundingClientRect().top <= threshold) current = id;
        if (!current) current = id;
      }
      if (current !== this.activeSetId) this.zone.run(() => { this.activeSetId = current; });
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

  // ═══════════════════════════ reference data (ported) ═══════════════════════════
  private loadContent(): void {
    getDocs(collection(this.firestore, 'episodes')).then(snap => {
      this.videocontent = snap.docs.map(e => {
        const element: any = e.data();
        element['ref'] = e.ref;
        this.refTitleMap[element['ref'].path] = element['title'];
        return element;
      });
    });
    getDocs(collection(this.firestore, 'solar voice audios')).then(snap => {
      this.audiocontent = snap.docs.map(e => {
        const element: any = e.data();
        element['ref'] = e.ref;
        this.refTitleMap[element['ref'].path] = element['name'];
        return element;
      });
    });
  }
  getForms(): void {
    const deliveryforms = query(collection(this.firestore, 'delivery forms'), where('formfor', '==', 'workshop'), orderBy('formname'));
    getDocs(deliveryforms).then(snap => {
      this.deliveryforms = snap.docs.map(e => {
        const element: any = e.data();
        element['ref'] = e.ref;
        this.refTitleMap[element['ref'].path] = element['formname'];
        return element;
      });
    });
  }
  getVideoAsk(): void {
    collectionSnapshots(collection(this.firestore, 'arenavideoask')).pipe(takeUntil(this.destroy$)).subscribe(snap => {
      this.videoAsk = snap.map(e => {
        const element: any = e.data();
        element['ref'] = e.ref;
        this.refTitleMap[element['ref'].path] = element['title'];
        return element;
      }).filter(e => e['title'] !== undefined);
    });
  }
  getQuiz(): void {
    collectionSnapshots(collection(this.firestore, 'quiz')).pipe(takeUntil(this.destroy$)).subscribe(snap => {
      this.quiz = snap.map(e => {
        const element: any = e.data();
        element['ref'] = e.ref;
        this.refTitleMap[element['ref'].path] = element['question'];
        return element;
      });
    });
  }
  async getWorkshopCategories(): Promise<void> {
    if (!this.workshopId) return;
    try {
      const q = query(collection(this.firestore, 'workshopcategory'), where('workshopid', '==', this.workshopId));
      const snap = await getDocs(q);
      this.workshopCategoriesMap = snap.docs.reduce((acc: any, d) => { acc[d.id] = (d.data() as any).name; return acc; }, {});
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }
  /** Saved "Selected Categories" (Settings → Access → Category based) — the only source, as legacy. */
  get uniqueWorkshopCategories(): string[] {
    const cats: string[] = this._data?.['categoriesforthisworkshop'] || [];
    return Array.from(new Set(cats));
  }
  catName(id: string): string { return this.workshopCategoriesMap[id] || id; }
  get isActive(): boolean { return !!this._data?.['active']; }

  // ═══════════════════════════ form model (ported) ═══════════════════════════
  get challengesArray(): FormArray { return this.challengesPageForm.get('challenges') as FormArray; }
  getChallengeArray(curriculumGroup: AbstractControl): FormArray { return curriculumGroup.get('challenges') as FormArray; }
  generateId(): string { return Math.random().toString(36).substring(2, 10) + Date.now().toString(36); }

  addCurriculum(): void {
    const curriculumGroup = this.fb.group({
      type: ['challenge', Validators.required],   // v2: segmented control has no empty state → new sets start as Activity
      challengeid: [this.generateId()],
      zoomlink: [''],
      status: [undefined],
      hidezoom: [null],
      completedzoomurl: [''],
      zoomvideoref: [null],
      headicon: [''],
      heading: [''],
      subheading: [''],
      workshopcategory: [[]],
      facilitator: [[]],
      facilitatoronly: [null],
      description: [''],
      duedate: [''],
      duetime: [''],
      startdate: [''],
      starttime: [''],
      startlivecall: [''],
      challenges: this.fb.array([])
    });
    this.challengesArray.push(curriculumGroup);
    curriculumGroup.markAsDirty();   // bubbles to the array/form and names the new set in the save bar
    const id = curriculumGroup.get('challengeid')?.value;
    this.openSets.add(id);
    this.activeSetId = id;
    setTimeout(() => document.getElementById('set-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  private newActivityGroup(): FormGroup {
    return this.fb.group({
      challengeid: [this.generateId()],
      zoomattend: [[]],
      name: [''],
      description: [''],
      type: [''],
      startdate: [''],
      starttime: [''],
      contentref: [null],
      quizref: [[]],
      thumbnail: [''],
      assignmenttype: [''],
      reviewassignemnt: [null],
      previewvideo: [null],
      uploadedresource: [''],
      uploadedresourcetitle: [''],
      uploadedfilename: [''],
      submissionformat: [''],
      assignmenttopic: [''],
      rewardhead: [''],
      rewarddescription: [''],
      evolutionmappingtitle: [''],
      evolutionmappingdescription: [''],
      finalevolution: [null],
      finalevolutiontype: [''],
      rewardlink: [''],
      notehead: [''],
      notedescription: [''],
      notedescriptionrich: [''],
      assignmentdescriptionrich: [''],
      assignmentdescription: [''],
      uploadtype: [''],
      zoomlinkchallenge: [''],
      meetdate: [''],
      finalbeforeafter: [false]
    });
  }

  addSubChallenge(curriculumGroup: AbstractControl, afterIndex?: number): void {
    const challengeArray = this.getChallengeArray(curriculumGroup);
    const insertIndex = (afterIndex === undefined || afterIndex === null) ? challengeArray.length : afterIndex + 1;
    const challengeGroup = this.newActivityGroup();
    if (insertIndex >= challengeArray.length) challengeArray.push(challengeGroup);
    else challengeArray.insert(insertIndex, challengeGroup);
    challengeArray.markAsDirty();
    this.rebuildActivityIds();
    const newId = challengeGroup.get('challengeid')?.value;
    this.openActs.add(newId);
    this.openSets.add(curriculumGroup.get('challengeid')?.value);
    this.closePopover();
    setTimeout(() => {
      const el = document.querySelector(`[data-activity-id="${newId}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  removeCurriculum(index: number): void {
    const set = this.challengesArray.at(index);
    const count = this.getChallengeArray(set).length;
    const isZoom = set.get('type')?.value === 'zoomcall';
    this.confirm({
      title: `Delete "${this.setTitle(set, index)}"?`,
      body: isZoom ? 'This Zoom call is removed from the curriculum when you save. Participants who already started it lose access.' : 'This set and its ',
      bodyStrong: isZoom ? undefined : (count === 1 ? '1 activity' : `${count} activities`),
      bodyTail: isZoom ? undefined : ' are removed from the curriculum when you save. Participants who already started it lose access.',
      confirmLabel: 'Delete set', cancelLabel: 'Keep', danger: true,
    }).then(ok => {
      if (!ok) return;
      this.getChallengeArray(set).controls.forEach(a => this.destroyEditors(a));
      this.openSets.delete(set.get('challengeid')?.value);
      this.challengesArray.removeAt(index);
      this.challengesArray.markAsDirty();
      this.rebuildActivityIds();
    });
  }

  removeSubChallenge(curriculumGroup: AbstractControl, index: number): void {
    const challengeArray = this.getChallengeArray(curriculumGroup);
    const act = challengeArray.at(index);
    this.confirm({
      title: `Delete "${act.get('name')?.value || 'Activity ' + (index + 1)}"?`,
      body: 'This activity is removed from the set when you save.',
      confirmLabel: 'Delete activity', cancelLabel: 'Keep', danger: true,
    }).then(ok => {
      if (!ok) return;
      this.destroyEditors(act);
      this.openActs.delete(act.get('challengeid')?.value);
      challengeArray.removeAt(index);
      challengeArray.markAsDirty();
      this.rebuildActivityIds();
    });
  }

  /** Recompute the evolution trackers from the form (legacy rebuildActivityIds + a count resync). */
  private rebuildActivityIds(): void {
    const newSelectedTypes: any = {};
    const newEvolutionMappingActivities: string[] = [];
    this.challengesArray.controls.forEach((curriculumGroup, challengeIndex) => {
      this.getChallengeArray(curriculumGroup).controls.forEach((subChallenge, activityIndex) => {
        const newActivityId = this.generateActivityId(challengeIndex, activityIndex);
        if (subChallenge.get('finalevolution')?.value) {
          newEvolutionMappingActivities.push(newActivityId);
          const evolutionType = subChallenge.get('finalevolutiontype')?.value;
          if (evolutionType) newSelectedTypes[newActivityId] = evolutionType;
        }
      });
    });
    this.selectedEvolutionTypes = newSelectedTypes;
    this.evolutionMappingActivities = newEvolutionMappingActivities;
    this.evolutionMappingCount = newEvolutionMappingActivities.length;
  }

  removeQuizFromSelection(subChallengeGroup: AbstractControl, index: number): void {
    const quizrefArray = [...(subChallengeGroup.get('quizref')?.value || [])];
    quizrefArray.splice(index, 1);
    subChallengeGroup.get('quizref')?.setValue(quizrefArray);
    subChallengeGroup.get('quizref')?.markAsDirty();
  }

  /** Legacy onTypeChange: nulls every type-specific field. */
  private onTypeChange(challengeGroup: AbstractControl): void {
    ['contentref', 'thumbnail', 'zoomlinkchallenge', 'meetdate', 'assignmenttype', 'reviewassignemnt', 'previewvideo',
      'uploadedresource', 'uploadedresourcetitle', 'uploadedfilename', 'rewardhead', 'rewarddescription',
      'evolutionmappingtitle', 'evolutionmappingdescription', 'finalevolution', 'finalevolutiontype', 'rewardlink',
      'notehead', 'notedescription', 'assignmenttopic', 'assignmentdescription', 'submissionformat', 'uploadtype']
      .forEach(k => challengeGroup.get(k)?.setValue(null));
    challengeGroup.get('quizref')?.setValue([]);
    this.rebuildActivityIds();   // keeps the evolution counter honest after a mapped VideoAsk changes type
  }

  private patchChallengeData(data: any): void {
    const challengesArray = this.challengesArray;
    Object.values(this.editors).forEach(e => e?.destroy());
    this.editors = {};
    challengesArray.clear();
    this.evolutionMappingCount = 0;
    this.selectedEvolutionTypes = {};
    this.evolutionMappingActivities = [];
    if (!data?.challenges) { this.challengesPageForm.markAsPristine(); return; }

    (data.challenges as any[]).forEach((challenge: any, challengeIndex: number) => {
      const curriculumGroup = this.fb.group({
        type: [challenge.type || ''],
        challengeid: [challenge['challengeid'] || this.generateId()],
        zoomattend: [challenge['zoomattend'] || []],
        zoomlink: [challenge.zoomlink || ''],
        completedzoomurl: [challenge.completedzoomurl || ''],
        zoomvideoref: [challenge.zoomvideoref || null],
        status: [challenge.status || undefined],
        hidezoom: [challenge.hidezoom ?? false],
        startlivecall: [challenge.startlivecall || ''],
        headicon: [challenge.headicon || ''],
        heading: [challenge.heading || ''],
        subheading: [challenge.subheading || ''],
        workshopcategory: [challenge.workshopcategory || []],
        facilitator: [challenge.facilitator || []],
        facilitatoronly: [challenge.facilitatoronly ?? false],
        description: [challenge.description || ''],
        duedate: [this.convertTimestamp(challenge.duedate)],
        duetime: [this.convertTimestamp(challenge.duetime)],
        startdate: [this.convertTimestamp(challenge.startdate) || ''],
        starttime: [this.convertTimestamp(challenge.starttime) || ''],
        challenges: this.fb.array([]),
      });
      const subChallengeArray = curriculumGroup.get('challenges') as FormArray;
      (challenge.challenges || []).forEach((c: any, activityIndex: number) => {
        if (c.finalevolution) {
          const activityId = this.generateActivityId(challengeIndex, activityIndex);
          this.evolutionMappingCount++;
          this.evolutionMappingActivities.push(activityId);
          if (c.finalevolutiontype) this.selectedEvolutionTypes[activityId] = c.finalevolutiontype;
        }
        subChallengeArray.push(this.fb.group({
          name: [c.name || ''],
          challengeid: [c['challengeid'] || this.generateId()],
          zoomattend: [c['zoomattend']],
          description: [c.description || ''],
          type: [c.type || ''],
          contentref: [c.contentref || ''],
          quizref: [c.quizref || []],
          thumbnail: [c.thumbnail || ''],
          assignmenttype: [c.assignmenttype || ''],
          reviewassignemnt: [c.reviewassignemnt || null],
          previewvideo: [c.previewvideo || null],
          uploadedresource: [c.uploadedresource || ''],
          uploadedresourcetitle: [c.uploadedresourcetitle || ''],
          uploadedfilename: [c.uploadedfilename || ''],
          submissionformat: [c.submissionformat || ''],
          assignmenttopic: [c.assignmenttopic || ''],
          rewardhead: [c.rewardhead || ''],
          rewarddescription: [c.rewarddescription || ''],
          evolutionmappingtitle: [c.evolutionmappingtitle || ''],
          evolutionmappingdescription: [c.evolutionmappingdescription || ''],
          finalevolution: [c.finalevolution || null],
          finalevolutiontype: [c.finalevolutiontype || ''],
          rewardlink: [c.rewardlink || ''],
          notehead: [c.notehead || ''],
          notedescription: [c.notedescription || ''],
          notedescriptionrich: [c.notedescriptionrich || ''],
          assignmentdescriptionrich: [c.assignmentdescriptionrich || ''],
          assignmentdescription: [c.assignmentdescription || ''],
          uploadtype: [c.uploadtype || ''],
          zoomlinkchallenge: [c.zoomlinkchallenge || ''],
          meetdate: [this.convertTimestamp(c.meetdate) || ''],
          finalbeforeafter: [c.finalbeforeafter || false]
        }));
      });
      challengesArray.push(curriculumGroup);
    });
    if (!this.activeSetId || !challengesArray.controls.some(s => this.setId(s) === this.activeSetId)) {
      this.activeSetId = challengesArray.length ? this.setId(challengesArray.at(0)) : '';
    }
    this.challengesPageForm.markAsPristine();
    this.challengesPageForm.markAsUntouched();
  }

  private convertTimestamp(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    if (typeof value?.toDate === 'function') return value.toDate();
    return value;
  }

  // ═══════════════════════════ save / discard (ported) ═══════════════════════════
  hasUnsavedChanges(): boolean { return !!this.challengesPageForm && this.challengesPageForm.dirty; }

  get editedSetsText(): string {
    const named = this.challengesArray.controls.map((s, i) => s.dirty ? `Set ${i + 1}` : '').filter(Boolean);
    if (named.length) return named.join(' · ');
    return this.challengesArray.dirty ? 'Curriculum (sets added, removed or reordered)' : '';
  }

  /** Why Save is disabled when the form is invalid (only pickers can make it so today). */
  get blockedReason(): string {
    if (this.isNew) return 'Save the Enrollment page first — it creates the workshop';
    const dt = ['startdate', 'starttime', 'duedate', 'duetime'];
    if (this.challengesArray.controls.some(s => dt.some(k => s.get(k)?.invalid))) return 'A date or time is invalid';
    if (this.challengesArray.controls.some(s => s.get('type')?.invalid)) return 'A set has no type';
    return 'The curriculum has an invalid field';
  }

  /** Parent calls this when the tab becomes visible so the rail highlights a set immediately. */
  refreshSpy(): void { this.onScroll(); }

  /** Activities without a type — shown as a warning (the legacy had no rule; saving stays possible). */
  get untypedWarning(): string {
    const noType: number[] = [], untypedActs: number[] = [];
    this.challengesArray.controls.forEach((s, i) => {
      if (!s.get('type')?.value) noType.push(i + 1);
      else if (s.get('type')?.value !== 'zoomcall' && this.getChallengeArray(s).controls.some(a => !a.get('type')?.value)) untypedActs.push(i + 1);
    });
    const parts: string[] = [];
    if (noType.length) parts.push(noType.length === 1 ? `Set ${noType[0]} has no type.` : `Sets ${noType.join(', ')} have no type.`);
    if (untypedActs.length) parts.push(untypedActs.length === 1 ? `Set ${untypedActs[0]} has an activity with no type.` : `Sets ${untypedActs.join(', ')} have activities with no type.`);
    return parts.join(' ');
  }
  setHasUntyped(set: AbstractControl): boolean {
    if (!set.get('type')?.value) return true;
    return set.get('type')?.value !== 'zoomcall' && this.getChallengeArray(set).controls.some(a => !a.get('type')?.value);
  }

  get saveState(): SaveState {
    if (this.saving) return 'saving';
    if (this.saveError) return 'error';
    if (this.challengesPageForm.invalid) return 'blocked';
    if (this.isNew && this.hasUnsavedChanges()) return 'blocked';   // only the Enrollment save creates the document
    if (this.hasUnsavedChanges()) return 'dirty';
    if (this.justSaved) return 'saved';
    return 'idle';
  }

  async saveChallengesPage(): Promise<void> {
    if (!this.workshopId || !this.hasInitializedForm || this.isNew) return;
    if (this.challengesPageForm.invalid) return;
    this.saving = true;
    this.isSaving = true;
    this.saveError = false;
    try {
      const challengesData = this.challengesPageForm.value.challenges.map((challenge: any) => {
        const cleaned = { ...challenge };
        if (!cleaned.status) delete cleaned.status;
        return cleaned;
      });
      const docRef = doc(this.firestore, `workshopconfiguration/${this.workshopId}`);
      await updateDoc(docRef, { challenges: challengesData });
      this.lastSavedChallenges = challengesData;
      this.challengesPageForm.markAsPristine();
      this.justSaved = true;
      if (this.savedTimer) clearTimeout(this.savedTimer);
      this.savedTimer = setTimeout(() => { this.justSaved = false; }, 4000);
    } catch (error) {
      console.error('Error saving challenges:', error);
      this.saveError = true;
    } finally {
      this.isSaving = false;
      this.saving = false;
    }
  }

  discardChanges(): void {
    if (this.saving) return;   // never revert from a stale snapshot while a write is pending
    const keepOpen = new Set(this.openSets);
    this.patchChallengeData({ challenges: this.lastSavedChallenges });
    this.openSets = keepOpen;
    this.openActs.clear();
    this.saveError = false;
    this.justSaved = false;
  }

  // ═══════════════════════════ evolution mapping (ported) ═══════════════════════════
  generateActivityId(challengeIndex: number, activityIndex: number): string { return `challenge_${challengeIndex}_activity_${activityIndex}`; }
  getAvailableEvolutionTypes(challengeIndex: number, activityIndex: number): string[] {
    const activityId = this.generateActivityId(challengeIndex, activityIndex);
    const currentSelection = this.selectedEvolutionTypes[activityId];
    const usedTypes = Object.values(this.selectedEvolutionTypes);
    return ['before', 'after'].filter(type => type === currentSelection || !usedTypes.includes(type));
  }
  canEnableEvolutionMapping(challengeIndex: number, activityIndex: number): boolean {
    const activityId = this.generateActivityId(challengeIndex, activityIndex);
    return this.evolutionMappingCount < 2 || this.evolutionMappingActivities.includes(activityId);
  }
  toggleFinalEvolution(challengeIndex: number, activityIndex: number, sub: AbstractControl): void {
    const next = !sub.get('finalevolution')?.value;
    if (next && !this.canEnableEvolutionMapping(challengeIndex, activityIndex)) return;
    sub.get('finalevolution')?.setValue(next);
    sub.get('finalevolution')?.markAsDirty();
    this.onEvolutionMappingToggle({ checked: next }, challengeIndex, activityIndex, sub as FormGroup);
  }
  onEvolutionMappingToggle(event: any, challengeIndex: number, activityIndex: number, subChallengeGroup: FormGroup): void {
    const activityId = this.generateActivityId(challengeIndex, activityIndex);
    if (event.checked) {
      if (this.evolutionMappingCount >= 2) {
        subChallengeGroup.get('finalevolution')?.setValue(false);
        this.snackBar.open('Only 2 activities can have Final Evolution Mapping enabled', 'Close', { duration: 3000, panelClass: 'sx-snack' });
        return;
      }
      this.evolutionMappingCount++;
      this.evolutionMappingActivities.push(activityId);
      const availableTypes = this.getAvailableEvolutionTypes(challengeIndex, activityIndex);
      if (availableTypes.length > 0) {
        subChallengeGroup.get('finalevolutiontype')?.setValue(availableTypes[0]);
        this.selectedEvolutionTypes[activityId] = availableTypes[0];
      }
    } else {
      this.evolutionMappingCount--;
      this.evolutionMappingActivities = this.evolutionMappingActivities.filter(id => id !== activityId);
      delete this.selectedEvolutionTypes[activityId];
      subChallengeGroup.get('finalevolutiontype')?.setValue('');
    }
  }
  setEvolutionType(selectedType: string, challengeIndex: number, activityIndex: number, sub: AbstractControl): void {
    if (!this.getAvailableEvolutionTypes(challengeIndex, activityIndex).includes(selectedType)) return;
    sub.get('finalevolutiontype')?.setValue(selectedType);
    sub.get('finalevolutiontype')?.markAsDirty();
    const activityId = this.generateActivityId(challengeIndex, activityIndex);
    if (selectedType) this.selectedEvolutionTypes[activityId] = selectedType;
    else delete this.selectedEvolutionTypes[activityId];
    this.closePopover();
  }
  canEnableFinalBeforeAfter(): boolean {
    const selectedTypes = Object.values(this.selectedEvolutionTypes);
    return selectedTypes.includes('before') && selectedTypes.includes('after');
  }
  toggleFinalBeforeAfter(sub: AbstractControl): void {
    const next = !sub.get('finalbeforeafter')?.value;
    if (next && !this.canEnableFinalBeforeAfter()) {
      this.snackBar.open('Both "before" and "after" types must be selected in VideoAsk activities first', 'Close', { duration: 3000, panelClass: 'sx-snack' });
      return;
    }
    sub.get('finalbeforeafter')?.setValue(next);
    sub.get('finalbeforeafter')?.markAsDirty();
  }
  get evolutionSlots(): { before: boolean, after: boolean } {
    const used = Object.values(this.selectedEvolutionTypes);
    return { before: used.includes('before'), after: used.includes('after') };
  }
  freeEvolutionSlotText(): string {
    const s = this.evolutionSlots;
    if (s.before && s.after) return 'Both slots are used.';
    if (!s.before && !s.after) return 'Both "before" and "after" are still free.';
    return `"${s.before ? 'After' : 'Before'}" is still free.`;
  }

  // ═══════════════════════════ set & activity editing ═══════════════════════════
  setSetType(set: AbstractControl, type: 'challenge' | 'zoomcall'): void {
    if (set.get('type')?.value === type) return;
    set.get('type')?.setValue(type); set.get('type')?.markAsDirty();   // legacy never clears the other side's fields
  }
  toggleBool(control: AbstractControl | null): void {
    if (!control) return;
    control.setValue(!control.value); control.markAsDirty();
  }
  setCompleted(set: AbstractControl, on: boolean): void {
    set.get('status')?.setValue(on ? 'completed' : null); set.get('status')?.markAsDirty();
  }
  isCategorySelected(set: AbstractControl, id: string): boolean { return (set.get('workshopcategory')?.value || []).includes(id); }
  toggleCategory(set: AbstractControl, id: string): void {
    const c = set.get('workshopcategory'); const cur: string[] = c?.value || [];
    c?.setValue(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]); c?.markAsDirty();
  }

  /** Activity type change: confirm before clearing when any type field holds a value (legacy cleared silently). */
  async changeActivityType(sub: AbstractControl, type: string): Promise<void> {
    if (sub.get('type')?.value === type) { this.closePopover(); return; }
    this.closePopover();
    const hadTypeData = ['contentref', 'thumbnail', 'assignmenttype', 'reviewassignemnt', 'previewvideo', 'uploadedresource',
      'uploadedresourcetitle', 'rewardhead', 'rewarddescription', 'rewardlink', 'evolutionmappingtitle', 'evolutionmappingdescription',
      'finalevolution', 'notehead', 'notedescription', 'assignmenttopic', 'assignmentdescription', 'submissionformat', 'uploadtype',
      'zoomlinkchallenge', 'meetdate'].some(k => { const v = sub.get(k)?.value; return Array.isArray(v) ? v.length > 0 : !!v; })
      || (sub.get('quizref')?.value || []).length > 0;
    if (hadTypeData) {
      const ok = await this.confirm({
        title: `Change type to ${this.typeLabels[type]}?`,
        body: `This clears the ${this.typeLabels[sub.get('type')?.value] || 'current'} fields of "${sub.get('name')?.value || 'this activity'}". Name and description are kept.`,
        confirmLabel: 'Change type', cancelLabel: 'Keep', danger: false,
      });
      if (!ok) return;
    }
    sub.get('type')?.setValue(type); sub.get('type')?.markAsDirty();
    this.onTypeChange(sub);
  }

  setAssignmentType(sub: AbstractControl, t: 'form' | 'question'): void {
    if (sub.get('assignmenttype')?.value === t) return;
    sub.get('assignmenttype')?.setValue(t); sub.get('assignmenttype')?.markAsDirty();
  }
  setSubmissionFormat(sub: AbstractControl, f: 'upload' | 'text'): void {
    if (sub.get('submissionformat')?.value === f) return;
    sub.get('submissionformat')?.setValue(f); sub.get('submissionformat')?.markAsDirty();
  }

  // refs
  compareFn(a: any, b: any): boolean { return a && b ? a.id === b.id : false; }
  compareRefs(a: any, b: any): boolean { if (!a || !b) return a === b; return a.path === b.path; }
  sameRef(a: any, b: any): boolean {
    if (!a || !b) return a === b;
    if (a.path && b.path) return a.path === b.path;
    return this.compareFn(a, b);
  }
  refLabel(r: any): string { return r?.path ? (this.refTitleMap[r.path] || r.id || 'Untitled') : ''; }
  pickRef(control: AbstractControl | null, value: any): void {
    if (!control) return;
    control.setValue(value); control.markAsDirty();
    this.closePopover();
  }
  isQuizSelected(sub: AbstractControl, r: any): boolean { return (sub.get('quizref')?.value || []).some((q: any) => this.sameRef(q, r)); }
  toggleQuiz(sub: AbstractControl, r: any): void {
    const cur: any[] = [...(sub.get('quizref')?.value || [])];
    const i = cur.findIndex(q => this.sameRef(q, r));
    if (i >= 0) cur.splice(i, 1); else cur.push(r);
    sub.get('quizref')?.setValue(cur); sub.get('quizref')?.markAsDirty();
  }
  filtered(list: any[], labelOf: (x: any) => string): any[] {
    const q = this.popSearch.trim().toLowerCase();
    return q ? list.filter(x => (labelOf(x) || '').toLowerCase().includes(q)) : list;
  }
  get filteredEpisodes(): any[] { return this.filtered(this.videocontent, x => this.refLabel(x.ref)); }
  get filteredAudios(): any[] { return this.filtered(this.audiocontent, x => this.refLabel(x.ref)); }
  get filteredForms(): any[] { return this.filtered(this.deliveryforms, x => this.refLabel(x.ref)); }
  get filteredVideoAsk(): any[] { return this.filtered(this.videoAsk, x => this.refLabel(x.ref)); }
  get filteredQuiz(): any[] { return this.filtered(this.quiz, x => this.refLabel(x.ref)); }
  get filteredIcons(): any[] { return this.filtered(this.iconData, x => x.description); }
  get filteredThumbs(): any[] { return this.filtered(this.thumbnailData, x => x.description); }
  get filteredCategories(): string[] { return this.filtered(this.uniqueWorkshopCategories, id => this.catName(id)); }
  iconName(url: string): string {
    if (!url) return '';
    if (!Object.keys(this.iconNameByUrl).length || !this.iconNameByUrl[url]) {
      this.iconData.forEach(i => { this.iconNameByUrl[i.imageUrl] = i.description || ''; });
    }
    return this.iconNameByUrl[url] || 'Icon';
  }
  thumbName(url: string): string { return this.thumbnailData.find(t => t.imageUrl === url)?.description || (url ? 'Thumbnail' : ''); }

  // popovers
  togglePopover(id: string): void { if (this.openPopover === id) this.closePopover(); else { this.openPopover = id; this.popSearch = ''; } }
  closePopover(): void { this.openPopover = null; this.popSearch = ''; }

  // expand / collapse
  setId(set: AbstractControl): string { return set.get('challengeid')?.value; }
  actId(act: AbstractControl): string { return act.get('challengeid')?.value; }
  isSetOpen(set: AbstractControl): boolean { return this.openSets.has(this.setId(set)); }
  toggleSet(set: AbstractControl): void { const id = this.setId(set); this.openSets.has(id) ? this.openSets.delete(id) : this.openSets.add(id); }
  isActOpen(act: AbstractControl): boolean { return this.openActs.has(this.actId(act)); }
  toggleAct(act: AbstractControl): void { const id = this.actId(act); this.openActs.has(id) ? this.openActs.delete(id) : this.openActs.add(id); }
  jumpToSet(set: AbstractControl): void {
    const id = this.setId(set);
    this.openSets.add(id); this.activeSetId = id;
    document.getElementById('set-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Track by control identity: patchChallengeData rebuilds the groups, so their views (and every
  // formControlName binding inside) must be recreated; drag reorder moves the same instances.
  trackBySet = (_: number, set: AbstractControl) => set;
  trackByAct = (_: number, act: AbstractControl) => act;

  // drag & drop (ported; frozen while Active)
  dropChallengeOuter(event: CdkDragDrop<any>): void {
    if (this.isActive || event.previousIndex === event.currentIndex) return;
    const moved = this.challengesArray.at(event.previousIndex);
    this.challengesArray.removeAt(event.previousIndex);
    this.challengesArray.insert(event.currentIndex, moved);
    this.challengesArray.markAsDirty();
    this.rebuildActivityIds();
  }
  dropChallenge(curriculum: AbstractControl, event: CdkDragDrop<any>): void {
    if (this.isActive || event.previousIndex === event.currentIndex) return;
    const formArray = this.getChallengeArray(curriculum);
    const movingControl = formArray.at(event.previousIndex);
    formArray.removeAt(event.previousIndex);
    formArray.insert(event.currentIndex, movingControl);
    formArray.markAsDirty();
    this.rebuildActivityIds();
  }

  // ═══════════════════════════ display helpers ═══════════════════════════
  getChallengeTypeDisplay(type: string): string { return ({ challenge: 'Activity', zoomcall: 'Zoom Call' } as any)[type] || type; }
  typeLabel(type: string): string { return this.typeLabels[type] || type || 'Choose type'; }
  typeClass(type: string): string {
    const map: Record<string, string> = { video: 'b-video', audio: 'b-audio', form: 'b-form', videoask: 'b-videoask', quiz: 'b-quiz',
      assignment: 'b-assignment', resource: 'b-resource', offer: 'b-offer', note: 'b-note', evolutionmapping: 'b-evolution', zoomcall: 'b-zoom' };
    return map[type] || 'b-resource';
  }
  setTitle(set: AbstractControl, i: number): string { return set.get('heading')?.value || `Set ${i + 1}`; }
  fmtDate(d: any): string {
    const date = d instanceof Date ? d : this.convertTimestamp(d);
    return date ? `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` : '';
  }
  fmtTime(d: any): string {
    const date = d instanceof Date ? d : this.convertTimestamp(d);
    return date ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
  }
  fmtDateTime(d: any, t: any): string {
    const date = this.fmtDate(d);
    if (!date) return '';
    const time = this.fmtTime(t);
    return time ? `${date} ${time}` : date;
  }
  weekday(d: any): string {
    const date = d instanceof Date ? d : this.convertTimestamp(d);
    return date ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()] : '';
  }
  setMeta(set: AbstractControl): string[] {
    const parts: string[] = [];
    if (set.get('type')?.value === 'zoomcall') {
      const when = this.fmtDateTime(set.get('duedate')?.value, set.get('duetime')?.value);
      if (when) parts.push(`${this.weekday(set.get('duedate')?.value)} ${when}`);
      parts.push(set.get('status')?.value === 'completed' ? 'Completed' : 'Not completed');
      if (set.get('zoomvideoref')?.value || set.get('completedzoomurl')?.value) parts.push('Recording linked');
      return parts;
    }
    const acts = this.getChallengeArray(set).controls;
    parts.push(`${acts.length} ${acts.length === 1 ? 'activity' : 'activities'}`);
    const when = this.fmtDateTime(set.get('startdate')?.value, set.get('starttime')?.value);
    if (when) parts.push(`Unlocks ${when}`);
    const cats: string[] = set.get('workshopcategory')?.value || [];
    if (cats.length) parts.push(cats.map(c => this.catName(c)).join(', '));
    else if (acts.length) parts.push(Array.from(new Set(acts.map(a => this.typeLabel(a.get('type')?.value)).filter(x => x !== 'Choose type'))).slice(0, 4).join(' · '));
    return parts;
  }
  actMeta(act: AbstractControl): string {
    const t = act.get('type')?.value;
    const ref = act.get('contentref')?.value;
    switch (t) {
      case 'video': return [act.get('previewvideo')?.value ? 'Preview on' : 'Preview off', this.refLabel(ref)].filter(Boolean).join(' · ');
      case 'audio': return ['Solar Voice', this.refLabel(ref)].filter(Boolean).join(' · ');
      case 'form': return this.refLabel(ref);
      case 'videoask': return this.refLabel(ref);
      case 'quiz': { const n = (act.get('quizref')?.value || []).length; return n ? `${n} ${n === 1 ? 'quiz' : 'quizzes'}` : ''; }
      case 'assignment': return act.get('assignmenttype')?.value === 'form' ? ['Form', this.refLabel(ref)].filter(Boolean).join(' · ') : (act.get('assignmenttype')?.value === 'question' ? 'Question' : '');
      case 'resource': return act.get('uploadedresourcetitle')?.value || act.get('uploadedfilename')?.value || '';
      case 'offer': return act.get('rewardhead')?.value || '';
      case 'note': return act.get('notehead')?.value || '';
      case 'evolutionmapping': return act.get('evolutionmappingtitle')?.value || '';
      case 'zoomcall': return act.get('zoomlinkchallenge')?.value || '';
      default: return '';
    }
  }
  get totals(): { sets: number, activities: number, calls: number } {
    let activities = 0, calls = 0;
    this.challengesArray.controls.forEach(s => {
      if (s.get('type')?.value === 'zoomcall') calls++;
      else if (s.get('type')?.value === 'challenge') activities += this.getChallengeArray(s).length;
    });
    return { sets: this.challengesArray.length, activities, calls };
  }

  // ═══════════════════════════ rich text ═══════════════════════════
  getEditor(act: AbstractControl, field: 'notedescriptionrich' | 'assignmentdescriptionrich'): Editor {
    const key = `${this.actId(act)}_${field}`;
    if (!this.editors[key]) this.editors[key] = new Editor();
    return this.editors[key];
  }
  private destroyEditors(act: AbstractControl): void {
    ['notedescriptionrich', 'assignmentdescriptionrich'].forEach(f => {
      const key = `${this.actId(act)}_${f}`;
      this.editors[key]?.destroy(); delete this.editors[key];
    });
  }

  // ═══════════════════════════ uploads & launchers (ported) ═══════════════════════════
  uploadResource(subChallengeGroup: AbstractControl): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '*/*';
    fileInput.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const fileRef = ref(this.storage, `workshop/resource/${file.name}`);
      try {
        await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(fileRef);
        this.zone.run(() => {
          subChallengeGroup.get('uploadedresource')?.setValue(downloadURL);
          subChallengeGroup.get('uploadedfilename')?.setValue(file.name);
          subChallengeGroup.get('uploadedresource')?.markAsDirty();
          this.snackBar.open('Uploaded successfully!', 'Close', { duration: 2000, panelClass: 'sx-snack' });
        });
      } catch (error) {
        console.error('Error uploading:', error);
        this.snackBar.open('Error uploading. Please try again.', 'Close', { duration: 2000, panelClass: 'sx-snack' });
      }
    };
    fileInput.click();
  }
  openResourceLink(url: string): void { if (url) window.open(url, '_blank'); }

  open(type: 'form' | 'videoask' | 'quiz'): void {
    if (type === 'form') {
      const dialogRef = this.dialog.open(UpdateDeliveryComponent, {
        data: null, disableClose: true, maxWidth: '100%', maxHeight: '100%', height: '90%', width: '90%', panelClass: 'full-screen-modal',
      });
      dialogRef.afterClosed().subscribe(() => this.getForms());
    } else if (type === 'videoask') {
      const url = this.router.serializeUrl(this.router.createUrlTree(['/createarenavideoasktemplate']));
      window.open(url, '_blank');
    } else if (type === 'quiz') {
      this.dialog.open(QuizComponent, { data: null, disableClose: true, height: '90vh', width: '90vw', maxWidth: '1200px', maxHeight: '800px' });
      // quiz list is a live snapshot — no reload needed
    }
  }
  openUploadDialog(): void {
    const dialogRef = this.dialog.open(UploadEpisodeDialogComponent, {
      width: '95vw', maxWidth: '1400px', height: '90vh', panelClass: 'upload-episode-dialog-panel',
    });
    dialogRef.afterClosed().subscribe(() => this.loadContent());   // v2: a freshly uploaded episode appears in the Recording list
  }

  // ═══════════════════════════ confirm dialog ═══════════════════════════
  private confirm(opts: Omit<ConfirmDialog, 'resolve'>): Promise<boolean> {
    return new Promise<boolean>(resolve => { this.confirmDialog = { ...opts, resolve }; });
  }
  answerConfirm(ok: boolean): void {
    const d = this.confirmDialog;
    this.confirmDialog = null;
    d?.resolve(ok);
  }
}
