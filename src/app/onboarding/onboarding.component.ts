import {
  Component, OnInit, ChangeDetectionStrategy,
  ChangeDetectorRef, inject
} from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import {
  Firestore, doc, setDoc, collection, DocumentReference
} from '@angular/fire/firestore';
import { title } from 'process';

@Component({
  selector: 'app-journey-onboarding-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatInputModule, MatFormFieldModule, MatButtonModule,
    MatSelectModule, MatIconModule,
  ],
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JourneyOnboardingFormComponent implements OnInit {

  private firestore = inject(Firestore);
  private fb        = inject(FormBuilder);
  private cdr       = inject(ChangeDetectorRef);

  currentSlide = 1;
  totalSlides  = 3;
  loading      = false;
  submitted    = false;

  screenorderInput = '';
  screenorderTags: string[] = [
    'intro', 'journeyOverview', 'journeyDescripition', 'subscription',
    'journeyExperience', 'productOverview', 'aelSelection', 'onboarding', 'congratulations',
  ];

  form!: FormGroup;
  readonly productTypeOptions = ['queue', 'event', 'others'] as const;

  ngOnInit(): void { this.buildForm(); }

  private buildForm(): void {
    this.form = this.fb.group({

      // ── SLIDE 1: classify/journeyorientation ─────────────────────
      duration:     ['', Validators.required],   // stored as string e.g. "30"
      introduction: this.fb.array([this.newIntroItem()]),

      // ── SLIDE 2: classify/timecompression ────────────────────────
      tc_intro:              ['', Validators.required],
      tc_description:        [''],
      tc_contentdescription: [''],
      // contenturl: array of reference paths e.g. /content_urls/abc123
      contenturl: this.fb.array([this.newContentUrl()]),

      // ── SLIDE 3: journeyonboardingdetail/{docid} ─────────────────
      docid: ['', Validators.required],

      eventdescripition: this.fb.group({
        title:                ['', Validators.required],
        intro:                ['', Validators.required],
        overview:             [''],
        overviewdescripition: [''],
        goalvideourl:         [''],  // reference path: /content_urls/xxx
        introduction:         [''],
        introductionvideo:    [''],  // storage url
      }),

      // overviewvideo is at ROOT level of the document (not inside eventdescripition)
      overviewvideo: [''],           // reference path: /content_urls/xxx

      journeydetail: this.fb.group({
        intro:        [''],
        descripition: [''],
        imageurl:     [''],
      }),

      journeypath: this.fb.group({
        intro:        [''],
        descripition: [''],
        imageurl:     [''],
        journeyref:   [''],          // reference path: /journey/xxx
      }),

      otherdescripition: this.fb.group({
        title:        [''],
        descripition: [''],
      }),

      subscription: this.fb.group({
        descripition: [''],
        imageurl:     [''],
      }),

      productincluded: this.fb.array([this.newProduct()]),

      queuedescripition: this.fb.group({
        descripition: [''],
        atcmodel: this.fb.group({
          title:        [''],
          descripition: [''],
        }),
      }),

      processdetails: this.fb.group({
        title:        [''],          // "Personalized uP! Diagnostics & Consultation"
        descripition: [''],
        processimage: [''],
        step: this.fb.array([this.newProcessStep()]),
      }),
    });
  }

  // ─── Factories ───────────────────────────────────────────────────────────────
  newIntroItem(): FormGroup {
    return this.fb.group({ title: [''], description: [''] });
  }
  newContentUrl(): FormGroup {
    // stores a reference path string like /content_urls/6jYa37LSRXPZNCdHILt5
    return this.fb.group({ path: [''] });
  }
  newProduct(): FormGroup {
    return this.fb.group({ title: [''], descripition: [''], type: ['queue'] });
  }
  newProcessStep(): FormGroup {
    return this.fb.group({ title: [''], descripition: [''], imageurl: [''] });
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────
  get introductionItems(): FormArray { return this.form.get('introduction') as FormArray; }
  get contentUrls(): FormArray       { return this.form.get('contenturl') as FormArray; }
  get productincluded(): FormArray   { return this.form.get('productincluded') as FormArray; }
  get processSteps(): FormArray      { return this.form.get('processdetails.step') as FormArray; }

  // ─── Add / Remove ────────────────────────────────────────────────────────────
  addIntroItem(): void               { this.introductionItems.push(this.newIntroItem()); }
  removeIntroItem(i: number): void   { this.introductionItems.removeAt(i); }

  addContentUrl(): void              { this.contentUrls.push(this.newContentUrl()); }
  removeContentUrl(i: number): void  { this.contentUrls.removeAt(i); }

  addProduct(): void                 { this.productincluded.push(this.newProduct()); }
  removeProduct(i: number): void     { this.productincluded.removeAt(i); }

  addProcessStep(): void             { this.processSteps.push(this.newProcessStep()); }
  removeProcessStep(i: number): void { this.processSteps.removeAt(i); }

  // ─── Tag input ───────────────────────────────────────────────────────────────
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

  // ─── Navigation ──────────────────────────────────────────────────────────────
  nextSlide(): void {
    if (this.currentSlide === 1 && !this.validateFields(['duration'])) return;
    if (this.currentSlide === 2 && !this.validateFields(['tc_intro'])) return;
    if (this.currentSlide < this.totalSlides) { this.currentSlide++; this.cdr.markForCheck(); }
  }
  prevSlide(): void {
    if (this.currentSlide > 1) { this.currentSlide--; this.cdr.markForCheck(); }
  }
  goToSlide(n: number): void {
    if (n >= 1 && n <= this.totalSlides) { this.currentSlide = n; this.cdr.markForCheck(); }
  }

  // ─── Validation ──────────────────────────────────────────────────────────────
  private validateFields(paths: string[]): boolean {
    let valid = true;
    paths.forEach(path => {
      const ctrl = this.form.get(path);
      if (ctrl) { ctrl.markAsTouched(); if (ctrl.invalid) valid = false; }
    });
    this.cdr.markForCheck();
    return valid;
  }
  isInvalid(path: string): boolean {
    const ctrl = this.form.get(path);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }

  // ─── Helper: convert path string to Firestore DocumentReference ─────────────
  private toRef(path: string): DocumentReference | null {
    if (!path?.trim()) return null;
    try {
      // path like "/content_urls/abc123" or "content_urls/abc123"
      const clean = path.trim().replace(/^\//, '');
      return doc(this.firestore, clean) as DocumentReference;
    } catch {
      return null;
    }
  }

  // ─── Submit → Firestore ──────────────────────────────────────────────────────
  async onSubmit(): Promise<void> {
    ['docid', 'eventdescripition.title', 'eventdescripition.intro'].forEach(p => {
      this.form.get(p)?.markAsTouched();
    });
    if (this.form.invalid) { this.cdr.markForCheck(); return; }

    this.loading = true;
    this.cdr.markForCheck();

    try {
      const v = this.form.value;

      // ── 1. classify/journeyorientation ──────────────────────────
      const orientationPayload = {
        duration: String(v.duration),   // always store as string
        introduction: v.introduction.map((item: any) => ({
          title:       item.title       ?? '',
          description: item.description ?? '',
        })),
      };
      await setDoc(
        doc(this.firestore, 'classify', 'journeyorientation'),
        orientationPayload,
        { merge: true }
      );

      // ── 2. classify/timecompression ─────────────────────────────
      // contenturl must be stored as array of DocumentReferences
      const contentRefs = v.contenturl
        .map((c: any) => this.toRef(c.path))
        .filter((r: DocumentReference | null) => r !== null);

      const timePayload = {
        intro:              v.tc_intro              ?? '',
        description:        v.tc_description        ?? '',
        contentdescription: v.tc_contentdescription ?? '',
        contenturl:         contentRefs,
      };
      await setDoc(
        doc(this.firestore, 'classify', 'timecompression'),
        timePayload,
        { merge: true }
      );

      // ── 3. journeyonboardingdetail/{docid} ──────────────────────
      const ed = v.eventdescripition;
      const onboardingPayload: any = {
        docid: v.docid,
        eventdescripition: {
          intro:                ed.intro                ?? '',
          overview:             ed.overview             ?? '',
          overviewdescripition: ed.overviewdescripition ?? '',
          title:                ed.title                ?? '',
        },
        // stored as Firestore reference
        goalvideourl:         this.toRef(ed.goalvideourl),
        introduction:         ed.introduction         ?? '',
        introductionvideo:    ed.introductionvideo    ?? '',
        journeydetail: {
          descripition: v.journeydetail.descripition ?? '',
          intro:        v.journeydetail.intro        ?? '',
          imageurl:     v.journeydetail.imageurl     ?? '',
        },
        journeypath: {
          descripition: v.journeypath.descripition ?? '',
          imageurl:     v.journeypath.imageurl     ?? '',
          intro:        v.journeypath.intro        ?? '',
          // stored as Firestore reference
        },
        journeyref:   this.toRef(v.journeypath.journeyref),
        otherdescripition: {
          descripition: v.otherdescripition.descripition ?? '',
          title:        v.otherdescripition.title        ?? '',
        },
        // overviewvideo is at ROOT level, stored as Firestore reference
        overviewvideo: this.toRef(v.overviewvideo),
        productincluded: v.productincluded.map((p: any) => ({
          descripition: p.descripition ?? '',
          title:        p.title        ?? '',
          type:         p.type         ?? 'queue',
        })),
        queuedescripition: {
          atcmodel: {
            descripition: v.queuedescripition.atcmodel.descripition ?? '',
            title:        v.queuedescripition.atcmodel.title        ?? '',
          },
          descripition: v.queuedescripition.descripition ?? '',
          processdetails: {
            descripition: v.processdetails.descripition ?? '',
            step: v.processdetails.step.map((s: any) => ({
              descripition: s.descripition ?? '',
              imageurl:     s.imageurl     ?? '',
              title:        s.title        ?? '',
            })),
            title:        v.processdetails.title        ?? '',
          },
          processimage: v.processdetails.processimage ?? '',
          title:        v.queuedescripition.title ?? '',
        },
        screenorder: [...this.screenorderTags],
        subscription: {
          descripition: v.subscription.descripition ?? '',
          imageurl:     v.subscription.imageurl     ?? '',
        },
      };

      await setDoc(
        doc(this.firestore, 'journeyonboardingdetail', v.docid),
        onboardingPayload,
        { merge: true }
      );

      this.submitted = true;
      this.cdr.markForCheck();

    } catch (err) {
      console.error('Firestore save error:', err);
      alert('Save failed — check console.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  // ─── Reset ───────────────────────────────────────────────────────────────────
  resetForm(): void {
    this.form.reset();
    this.screenorderTags = [
      'intro', 'journeyOverview', 'journeyDescripition', 'subscription',
      'journeyExperience', 'productOverview', 'aelSelection', 'onboarding', 'congratulations',
    ];
    this.submitted    = false;
    this.currentSlide = 1;
    this.cdr.markForCheck();
  }
}
