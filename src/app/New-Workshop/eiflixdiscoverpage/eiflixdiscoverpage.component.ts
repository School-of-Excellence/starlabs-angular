import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgxEditorModule, Editor, Toolbar } from 'ngx-editor';
import { PickerModule } from '@ctrl/ngx-emoji-mart';
import {
  Firestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from '@angular/fire/firestore';
import { MediaUploadComponent } from './media-upload/media-upload.component';
import { Subscription } from 'rxjs';

/** Shared shape for a configurable field card. */
interface BaseField {
  key: string;      // Firestore field name inside classify/eiflixdiscoverpage
  label: string;    // shown on the card header
  icon: string;     // Material icon ligature
  hint: string;     // short helper line under the label
}

/** A rich-text (ngx-editor) field. */
interface RichField extends BaseField {
  placeholder: string;
}

/** A plain single-line text field. */
interface TextField extends BaseField {
  placeholder: string;
}

/** A media-upload field backed by Firebase Storage. */
interface MediaField extends BaseField {
  type: 'video' | 'image';
}

@Component({
  selector: 'app-eiflixdiscoverpage',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    NgxEditorModule,
    PickerModule,
    MediaUploadComponent
  ],
  templateUrl: './eiflixdiscoverpage.component.html',
  styleUrl: './eiflixdiscoverpage.component.css'
})
export class EiflixdiscoverpageComponent implements OnInit, OnDestroy {
  /** classify/<DOC_ID> — the single document this page manages. */
  private static readonly DOC_ID = 'eiflixdiscoverpage';

  form: FormGroup;
  loading = true;
  isSaving = false;

  /** One ProseMirror editor instance per field, keyed by field.key. */
  editors: { [key: string]: Editor } = {};

  /** Lazily-created editors for rich fields nested inside FormArray rows. */
  private letterEditors: { [key: string]: Editor } = {};
  private adEditors: { [key: string]: Editor } = {};

  /** Options for the love-letter participant select: {profileid = doc id, name}. */
  participantOptions: { profileid: string; name: string }[] = [];

  /** Snapshot of the last-loaded/saved values, used to reset & detect changes. */
  private pristine: Record<string, string> = {};

  /** Full document as last loaded, so the size meter also counts any other fields. */
  private docData: Record<string, any> = {};

  /** Firestore hard limit: ~1 MiB per document. */
  readonly maxDocBytes = 1_048_576;

  /** Per-change caches so the template-bound getters don't re-scan the whole
   *  document on every change-detection pass. Invalidated on any form change. */
  private _bytesCache: number | null = null;
  private _dirtyCache: boolean | null = null;
  private formSub?: Subscription;

  /** Section bodies stay mounted; the sidebar picks which pane is visible. */
  section1Open = true;
  section2Open = true;
  section3Open = true;
  section4Open = true;
  section5Open = true;
  section6Open = true;
  section7Open = true;
  section8Open = true;

  /** Which section pane is currently shown (driven by the left navigator). */
  activeSection = 1;

  /** Left-navigator model: one entry per section. */
  readonly sections = [
    { id: 1, title: 'Discover', icon: 'home' },
    { id: 2, title: 'Coverage & Awards', icon: 'verified' },
    { id: 3, title: 'Science in Action', icon: 'science' },
    { id: 4, title: 'AH Videos', icon: 'video_library' },
    { id: 5, title: 'Excellence Installation', icon: 'auto_awesome' },
    { id: 6, title: 'Reflection of Growth', icon: 'favorite' },
    { id: 7, title: 'Live From The Arena', icon: 'stadium' },
    { id: 8, title: 'Antano & Prodigies', icon: 'workspace_premium' }
  ];

  /** Index of the award row whose emoji picker is currently open (null = none). */
  openEmojiRow: number | null = null;

  /** JSON snapshots of the loaded/saved array fields, for dirty-checking & reset. */
  private pristineProofs = '[]';
  private pristinePublications = '[]';
  private pristineAwards = '[]';
  private pristineScienceVideos = '[]';
  private pristineAhVideos = '[]';
  private pristineEiVideos = '[]';
  private pristineLoveLetters = '[]';
  private pristineLiveArenaVideos = '[]';
  private pristineProdigiesVideos = '[]';
  private pristineAds = '[]';

  /** Rich-text (ngx-editor) fields. Add new fields here to extend the page. */
  readonly richFields: RichField[] = [
    {
      key: 'welcometext',
      label: 'Welcome Text',
      icon: 'waving_hand',
      hint: 'A short, warm greeting shown at the top of the Discover page.',
      placeholder: 'Welcome to your next breakthrough…'
    },
    {
      key: 'title',
      label: 'Title',
      icon: 'title',
      hint: 'The main headline of the Discover page.',
      placeholder: 'Discover'
    },
    {
      key: 'subtitle',
      label: 'Subtitle',
      icon: 'subtitles',
      hint: 'A supporting line displayed just under the title.',
      placeholder: 'Handpicked journeys, masterclasses and more.'
    },
    {
      key: 'description',
      label: 'Description',
      icon: 'description',
      hint: 'A longer paragraph describing what participants will discover.',
      placeholder: 'Tell your audience what makes this experience special…'
    }
  ];

  /** Plain single-line text fields. */
  readonly textFields: TextField[] = [
    {
      key: 'orientationbuttonname',
      label: 'Orientation Button Name',
      icon: 'smart_button',
      hint: 'The label shown on the orientation button.',
      placeholder: 'e.g. Watch orientation'
    },
    {
      key: 'bigbuttonname',
      label: 'B!G Button Name',
      icon: 'smart_button',
      hint: 'The label shown on the primary B!G button.',
      placeholder: 'e.g. Get started'
    },
    {
      key: 'bigjourneyurl',
      label: 'B!G Journey URL',
      icon: 'link',
      hint: 'The link the B!G journey button points to.',
      placeholder: 'https://…'
    }
  ];

  /** Media-upload fields (Firebase Storage). Add more here to reuse the uploader. */
  readonly mediaFields: MediaField[] = [
    {
      key: 'orientationvideo',
      label: 'Orientation Video',
      icon: 'movie',
      hint: 'Upload the orientation video — video files only.',
      type: 'video'
    },
    {
      key: 'orientationthumbnail',
      label: 'Orientation Thumbnail',
      icon: 'image',
      hint: 'Upload the thumbnail image — image files only.',
      type: 'image'
    }
  ];

  /** Section 2 rich-text (ngx-editor) fields. */
  readonly section2RichFields: RichField[] = [
    {
      key: 'coveragetitle',
      label: 'Coverage Title',
      icon: 'campaign',
      hint: 'Heading shown above the press coverage / recognition strip.',
      placeholder: 'As featured in…'
    }
  ];

  /** Section 3 "The Science in Action" rich-text (ngx-editor) fields. */
  readonly section3RichFields: RichField[] = [
    {
      key: 'scienceinactionhead',
      label: 'Science in Action — Head',
      icon: 'science',
      hint: 'Small heading/eyebrow above the section.',
      placeholder: 'The Science in Action'
    },
    {
      key: 'scienceinactiontitle',
      label: 'Science in Action — Title',
      icon: 'title',
      hint: 'The main title of the section.',
      placeholder: 'See the method at work'
    },
    {
      key: 'scienceinactioncontext',
      label: 'Science in Action — Context',
      icon: 'notes',
      hint: 'Supporting paragraph / context for the section.',
      placeholder: 'Describe what these videos demonstrate…'
    }
  ];

  /** Section 4 plain single-line text fields. */
  readonly section4TextFields: TextField[] = [
    {
      key: 'videotitle',
      label: 'Video Title',
      icon: 'video_label',
      hint: 'Heading shown above the AH videos.',
      placeholder: 'e.g. Featured videos'
    }
  ];

  /** Section 5 "What is Excellence Installation?" rich-text (ngx-editor) fields. */
  readonly section5RichFields: RichField[] = [
    { key: 'eihead', label: 'EI — Head', icon: 'auto_awesome', hint: 'Small heading/eyebrow above the section.', placeholder: 'What is Excellence Installation?' },
    { key: 'eititle', label: 'EI — Title', icon: 'title', hint: 'The main title of the section.', placeholder: 'Installing excellence, step by step' },
    { key: 'eicontent', label: 'EI — Content', icon: 'notes', hint: 'Supporting paragraph / content for the section.', placeholder: 'Explain Excellence Installation…' },
    { key: 'atchead', label: 'ATC — Head', icon: 'psychology', hint: 'Heading above the Adjustment / Time / Consequences block.', placeholder: 'The A·T·C framework' },
    { key: 'atcdescription', label: 'ATC — Description', icon: 'subject', hint: 'Closing description shown below the A·T·C block.', placeholder: 'Describe the ATC framework…' }
  ];

  /** Section 5 plain single-line text fields (video title + the A·T·C pairs). */
  readonly section5TextFields: TextField[] = [
    { key: 'eivideostitle', label: 'EI Videos Title', icon: 'video_label', hint: 'Heading shown above the EI videos.', placeholder: 'e.g. Watch it in action' },
    { key: 'adjustmenttitle', label: 'Adjustment — Title', icon: 'tune', hint: '', placeholder: 'Adjustment' },
    { key: 'adjustmentexplain', label: 'Adjustment — Explain', icon: 'tune', hint: '', placeholder: 'Explain the adjustment…' },
    { key: 'Timettitle', label: 'Time — Title', icon: 'schedule', hint: '', placeholder: 'Time' },
    { key: 'timeexplain', label: 'Time — Explain', icon: 'schedule', hint: '', placeholder: 'Explain the time…' },
    { key: 'consequencestitle', label: 'Consequences — Title', icon: 'flag', hint: '', placeholder: 'Consequences' },
    { key: 'consequencesexplain', label: 'Consequences — Explain', icon: 'flag', hint: '', placeholder: 'Explain the consequences…' }
  ];

  /** Section 6 "Reflection of Growth" rich-text fields. */
  readonly section6RichFields: RichField[] = [
    { key: 'loveletterhead', label: 'Love Letter — Head', icon: 'favorite', hint: 'Small heading/eyebrow above the section.', placeholder: 'Reflection of Growth' },
    { key: 'lovelettertitle1', label: 'Love Letter — Title 1', icon: 'title', hint: 'First title line.', placeholder: 'From the people we serve' },
    { key: 'lovelettertitle2', label: 'Love Letter — Title 2', icon: 'title', hint: 'Second title line.', placeholder: 'In their own words' },
    { key: 'lovelettercontent', label: 'Love Letter — Content', icon: 'notes', hint: 'Supporting paragraph / content.', placeholder: 'Introduce the letters…' }
  ];

  /** Section 7 "Live From The Arena" rich-text fields. */
  readonly section7RichFields: RichField[] = [
    { key: 'livearenahead', label: 'Live Arena — Head', icon: 'stadium', hint: 'Small heading/eyebrow above the section.', placeholder: 'Live From The Arena' },
    { key: 'livearenatitle', label: 'Live Arena — Title', icon: 'title', hint: 'The main title of the section.', placeholder: 'See it happen live' }
  ];

  /** Section 8 "Antano & Prodigies" rich-text fields. */
  readonly section8RichFields: RichField[] = [
    { key: 'prodigieshead', label: 'Prodigies — Head', icon: 'workspace_premium', hint: 'Small heading/eyebrow above the section.', placeholder: 'Antano & Prodigies' },
    { key: 'prodigiestitle1', label: 'Prodigies — Title 1', icon: 'title', hint: 'First title line.', placeholder: 'Meet the prodigies' },
    { key: 'prodigiestitle2', label: 'Prodigies — Title 2', icon: 'title', hint: 'Second title line.', placeholder: 'Extraordinary journeys' },
    { key: 'prodigiescontent', label: 'Prodigies — Content', icon: 'notes', hint: 'Supporting paragraph / content.', placeholder: 'Introduce the prodigies…' }
  ];

  /** Section 8 footer rich field (rendered last, after the Ads block). */
  readonly section8FooterRich: RichField[] = [
    { key: 'rightsreserved', label: 'Rights Reserved', icon: 'copyright', hint: 'Footer / rights-reserved line (last field on the page).', placeholder: '© All rights reserved' }
  ];

  /** Section 8 plain single-line text fields. */
  readonly section8TextFields: TextField[] = [
    { key: 'adtag', label: 'Ad Tag', icon: 'sell', hint: 'A short tag/label shown on the ad.', placeholder: 'e.g. Limited seats' }
  ];

  /** Storage folder every uploader on this page writes into. */
  readonly storageFolder = 'eiflixdiscover';

  /** All ngx-editor rich fields across every section. */
  get allRichFields(): RichField[] {
    return [
      ...this.richFields, ...this.section2RichFields, ...this.section3RichFields,
      ...this.section5RichFields, ...this.section6RichFields, ...this.section7RichFields,
      ...this.section8RichFields, ...this.section8FooterRich
    ];
  }

  /** Every scalar (non-array) persisted field key, across all sections. */
  private get allFields(): BaseField[] {
    return [
      ...this.allRichFields, ...this.textFields, ...this.section4TextFields,
      ...this.section5TextFields, ...this.section8TextFields, ...this.mediaFields
    ];
  }

  /** Premium, full-featured toolbar shared by every editor. */
  readonly toolbar: Toolbar = [
    ['bold', 'italic', 'underline', 'strike'],
    ['code', 'blockquote'],
    ['ordered_list', 'bullet_list'],
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    ['link'],
    ['text_color', 'background_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
    ['horizontal_rule', 'format_clear']
  ];

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private snackBar: MatSnackBar
  ) {
    const group: Record<string, any> = {};
    this.allFields.forEach(f => (group[f.key] = ['']));
    group['proofsinnumber'] = this.fb.array([]);
    group['publicationStrip'] = this.fb.array([]);
    group['awardsandrecognition'] = this.fb.array([]);
    group['scienceinactionvideos'] = this.fb.array([]);
    group['ahvideos'] = this.fb.array([]);
    group['eivideos'] = this.fb.array([]);
    group['loveletters'] = this.fb.array([]);
    group['livearenavideos'] = this.fb.array([]);
    group['prodigiesvideos'] = this.fb.array([]);
    group['adsleftmap'] = this.fb.array([]);
    this.form = this.fb.group(group);
  }

  async ngOnInit(): Promise<void> {
    // One editor per rich-text field (all sections).
    this.allRichFields.forEach(f => (this.editors[f.key] = new Editor()));

    // Any form change invalidates the cached size/dirty computations.
    this.formSub = this.form.valueChanges.subscribe(() => this.invalidateCaches());

    try {
      const snap = await getDoc(
        doc(this.firestore, 'classify', EiflixdiscoverpageComponent.DOC_ID)
      );
      const data = snap.exists() ? snap.data() : {};
      this.docData = snap.exists() ? { ...data } : {};

      const patch: Record<string, string> = {};
      this.allFields.forEach(f => (patch[f.key] = (data?.[f.key] ?? '').toString()));

      this.form.patchValue(patch, { emitEvent: false });
      // Store the pristine baseline in normalized form so it matches what save()
      // writes — otherwise trimming/empty-HTML collapse would read as "dirty".
      this.pristine = {};
      this.allFields.forEach(f => (this.pristine[f.key] = this.normalizeScalar(f.key, patch[f.key])));
      this.invalidateCaches();

      // Hydrate the proofs-in-number array of maps.
      const proofs = Array.isArray(data?.['proofsinnumber']) ? data['proofsinnumber'] : [];
      this.proofRows.clear();
      proofs.forEach((p: any) => this.proofRows.push(this.makeProofRow(p?.number, p?.proof)));
      if (this.proofRows.length === 0) this.proofRows.push(this.makeProofRow());
      this.pristineProofs = JSON.stringify(this.serializeProofs());

      // Hydrate the publication-strip array of strings.
      const pubs = Array.isArray(data?.['publicationStrip']) ? data['publicationStrip'] : [];
      this.pubRows.clear();
      pubs.forEach((p: any) => this.pubRows.push(this.fb.control((p ?? '').toString())));
      if (this.pubRows.length === 0) this.pubRows.push(this.fb.control(''));
      this.pristinePublications = JSON.stringify(this.serializePublications());

      // Hydrate the awards-and-recognition array of maps.
      const awards = Array.isArray(data?.['awardsandrecognition']) ? data['awardsandrecognition'] : [];
      this.awardRows.clear();
      awards.forEach((a: any) =>
        this.awardRows.push(this.makeAwardRow(a?.organization, a?.department, a?.awardanddate, a?.emoji))
      );
      if (this.awardRows.length === 0) this.awardRows.push(this.makeAwardRow());
      this.pristineAwards = JSON.stringify(this.serializeAwards());

      // Hydrate the Science-in-Action videos array of maps.
      const scienceVideos = Array.isArray(data?.['scienceinactionvideos']) ? data['scienceinactionvideos'] : [];
      this.scienceVideoRows.clear();
      scienceVideos.forEach((v: any) =>
        this.scienceVideoRows.push(this.makeScienceVideoRow(v?.thumbnail, v?.video))
      );
      if (this.scienceVideoRows.length === 0) this.scienceVideoRows.push(this.makeScienceVideoRow());
      this.pristineScienceVideos = JSON.stringify(this.serializeScienceVideos());

      // Hydrate the AH videos array of maps.
      const ahvideos = Array.isArray(data?.['ahvideos']) ? data['ahvideos'] : [];
      this.ahVideoRows.clear();
      ahvideos.forEach((v: any) =>
        this.ahVideoRows.push(this.makeAhVideoRow(v?.videoname, v?.video, v?.thumbnail))
      );
      if (this.ahVideoRows.length === 0) this.ahVideoRows.push(this.makeAhVideoRow());
      this.pristineAhVideos = JSON.stringify(this.serializeAhVideos());

      // Hydrate the Excellence-Installation videos array of maps.
      const eivideos = Array.isArray(data?.['eivideos']) ? data['eivideos'] : [];
      this.eiVideoRows.clear();
      eivideos.forEach((v: any) => this.eiVideoRows.push(this.makeEiVideoRow(v?.thumbnail, v?.video)));
      if (this.eiVideoRows.length === 0) this.eiVideoRows.push(this.makeEiVideoRow());
      this.pristineEiVideos = JSON.stringify(this.serializeEiVideos());

      // Participant options for the love-letter select (collection: "participant metadata").
      try {
        const pmSnap = await getDocs(collection(this.firestore, 'participant metadata'));
        this.participantOptions = pmSnap.docs
          .map(d => ({ profileid: d.id, name: (d.data()?.['name'] ?? d.id).toString() }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch (e) {
        console.error('Error loading participant metadata:', e);
      }

      // Hydrate Section 6 love letters: [{profileid, letter(rich)}].
      const loveletters = Array.isArray(data?.['loveletters']) ? data['loveletters'] : [];
      this.loveLetterRows.clear();
      loveletters.forEach((l: any) => this.loveLetterRows.push(this.makeLoveLetterRow(l?.profileid, l?.letter)));
      if (this.loveLetterRows.length === 0) this.loveLetterRows.push(this.makeLoveLetterRow());
      this.pristineLoveLetters = JSON.stringify(this.serializeLoveLetters());

      // Hydrate Section 7 live-arena videos: [{thumbnail, video}].
      const livearenavideos = Array.isArray(data?.['livearenavideos']) ? data['livearenavideos'] : [];
      this.liveArenaVideoRows.clear();
      livearenavideos.forEach((v: any) => this.liveArenaVideoRows.push(this.makeLiveArenaVideoRow(v?.thumbnail, v?.video)));
      if (this.liveArenaVideoRows.length === 0) this.liveArenaVideoRows.push(this.makeLiveArenaVideoRow());
      this.pristineLiveArenaVideos = JSON.stringify(this.serializeLiveArenaVideos());

      // Hydrate Section 8 prodigies videos: [{thumbnail, video}].
      const prodigiesvideos = Array.isArray(data?.['prodigiesvideos']) ? data['prodigiesvideos'] : [];
      this.prodigiesVideoRows.clear();
      prodigiesvideos.forEach((v: any) => this.prodigiesVideoRows.push(this.makeProdigiesVideoRow(v?.thumbnail, v?.video)));
      if (this.prodigiesVideoRows.length === 0) this.prodigiesVideoRows.push(this.makeProdigiesVideoRow());
      this.pristineProdigiesVideos = JSON.stringify(this.serializeProdigiesVideos());

      // Hydrate Section 8 ads: [{head,title1,title2,content (rich), buttonname, buttonbelowtext, proof:[{number,proof}]}].
      const ads = Array.isArray(data?.['adsleftmap']) ? data['adsleftmap'] : [];
      this.adRows.clear();
      ads.forEach((a: any) => this.adRows.push(this.makeAdRow(a)));
      if (this.adRows.length === 0) this.adRows.push(this.makeAdRow());
      this.pristineAds = JSON.stringify(this.serializeAds());
    } catch (err) {
      console.error('Error loading EiFlix discover config:', err);
      this.snackBar.open('Could not load the saved content.', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.formSub?.unsubscribe();
    Object.values(this.editors).forEach(editor => editor?.destroy());
    Object.values(this.letterEditors).forEach(editor => editor?.destroy());
    Object.values(this.adEditors).forEach(editor => editor?.destroy());
  }

  /** Drop the memoized size/dirty results so the next read recomputes. */
  private invalidateCaches(): void {
    this._bytesCache = null;
    this._dirtyCache = null;
  }

  /** True when any field differs from the last loaded/saved snapshot (memoized). */
  get isDirty(): boolean {
    if (this._dirtyCache === null) this._dirtyCache = this.computeIsDirty();
    return this._dirtyCache;
  }

  private computeIsDirty(): boolean {
    const scalarsDirty = this.allFields.some(
      f => this.normalizeScalar(f.key, this.form.get(f.key)?.value) !== (this.pristine[f.key] ?? '')
    );
    const proofsDirty = JSON.stringify(this.serializeProofs()) !== this.pristineProofs;
    const pubsDirty = JSON.stringify(this.serializePublications()) !== this.pristinePublications;
    const awardsDirty = JSON.stringify(this.serializeAwards()) !== this.pristineAwards;
    const scienceVideosDirty = JSON.stringify(this.serializeScienceVideos()) !== this.pristineScienceVideos;
    const ahVideosDirty = JSON.stringify(this.serializeAhVideos()) !== this.pristineAhVideos;
    const eiVideosDirty = JSON.stringify(this.serializeEiVideos()) !== this.pristineEiVideos;
    const loveLettersDirty = JSON.stringify(this.serializeLoveLetters()) !== this.pristineLoveLetters;
    const liveArenaDirty = JSON.stringify(this.serializeLiveArenaVideos()) !== this.pristineLiveArenaVideos;
    const prodigiesDirty = JSON.stringify(this.serializeProdigiesVideos()) !== this.pristineProdigiesVideos;
    const adsDirty = JSON.stringify(this.serializeAds()) !== this.pristineAds;
    return scalarsDirty || proofsDirty || pubsDirty || awardsDirty || scienceVideosDirty
      || ahVideosDirty || eiVideosDirty || loveLettersDirty || liveArenaDirty || prodigiesDirty || adsDirty;
  }

  /* ---------- proofs-in-number (array of maps) ---------- */

  get proofRows(): FormArray {
    return this.form.get('proofsinnumber') as FormArray;
  }

  /** Number of configurable fields inside Section 1 (incl. the proofs list). */
  get sectionFieldCount(): number {
    return this.richFields.length + this.textFields.length + this.mediaFields.length + 1;
  }

  makeProofRow(numberVal = '', proofVal = ''): FormGroup {
    return this.fb.group({
      number: [numberVal || ''],
      proof: [proofVal || '']
    });
  }

  addProof(): void {
    this.proofRows.push(this.makeProofRow());
  }

  removeProof(index: number): void {
    if (index < 0 || index >= this.proofRows.length) return;
    this.proofRows.removeAt(index);
    // Always keep at least one editable row visible.
    if (this.proofRows.length === 0) this.proofRows.push(this.makeProofRow());
  }

  /** Proof rows as clean {number, proof} maps, dropping fully-empty rows. */
  private serializeProofs(): { number: string; proof: string }[] {
    return this.proofRows.controls
      .map(c => ({
        number: (c.get('number')?.value ?? '').toString().trim(),
        proof: (c.get('proof')?.value ?? '').toString().trim()
      }))
      .filter(r => r.number !== '' || r.proof !== '');
  }

  /* ---------- Section 2: publication strip (array of strings) ---------- */

  get pubRows(): FormArray {
    return this.form.get('publicationStrip') as FormArray;
  }

  /** Fields shown inside Section 2 (coverage title + the two lists). */
  get section2FieldCount(): number {
    return this.section2RichFields.length + 2;
  }

  addPublication(): void {
    this.pubRows.push(this.fb.control(''));
  }

  removePublication(index: number): void {
    if (index < 0 || index >= this.pubRows.length) return;
    this.pubRows.removeAt(index);
    if (this.pubRows.length === 0) this.pubRows.push(this.fb.control(''));
  }

  /** Publication rows as a clean string[], dropping empty entries. */
  private serializePublications(): string[] {
    return this.pubRows.controls
      .map(c => (c.value ?? '').toString().trim())
      .filter(v => v !== '');
  }

  /* ---------- Section 2: awards & recognition (array of maps) ---------- */

  get awardRows(): FormArray {
    return this.form.get('awardsandrecognition') as FormArray;
  }

  makeAwardRow(organization = '', department = '', awardanddate = '', emoji = ''): FormGroup {
    return this.fb.group({
      organization: [organization || ''],
      department: [department || ''],
      awardanddate: [awardanddate || ''],
      emoji: [emoji || '']
    });
  }

  addAward(): void {
    this.awardRows.push(this.makeAwardRow());
  }

  removeAward(index: number): void {
    if (index < 0 || index >= this.awardRows.length) return;
    this.awardRows.removeAt(index);
    // Keep the open emoji picker pointed at its own row after the shift.
    if (this.openEmojiRow === index) {
      this.openEmojiRow = null;
    } else if (this.openEmojiRow !== null && this.openEmojiRow > index) {
      this.openEmojiRow--;
    }
    if (this.awardRows.length === 0) this.awardRows.push(this.makeAwardRow());
  }

  /** Show/hide the emoji picker for a given award row. */
  toggleEmoji(index: number): void {
    this.openEmojiRow = this.openEmojiRow === index ? null : index;
  }

  /** Store the picked native emoji character on the row and close the picker. */
  pickEmoji(index: number, event: any): void {
    const native = event?.emoji?.native ?? '';
    this.awardRows.at(index)?.get('emoji')?.setValue(native);
    this.openEmojiRow = null;
  }

  clearEmoji(index: number): void {
    this.awardRows.at(index)?.get('emoji')?.setValue('');
  }

  /** Award rows as clean maps, dropping rows where every field is empty. */
  private serializeAwards(): { organization: string; department: string; awardanddate: string; emoji: string }[] {
    return this.awardRows.controls
      .map(c => ({
        organization: (c.get('organization')?.value ?? '').toString().trim(),
        department: (c.get('department')?.value ?? '').toString().trim(),
        awardanddate: (c.get('awardanddate')?.value ?? '').toString().trim(),
        emoji: (c.get('emoji')?.value ?? '').toString().trim()
      }))
      .filter(r => r.organization !== '' || r.department !== '' || r.awardanddate !== '' || r.emoji !== '');
  }

  /* ---------- Section 3: Science-in-Action videos (array of {thumbnail, video} uploads) ---------- */

  get scienceVideoRows(): FormArray {
    return this.form.get('scienceinactionvideos') as FormArray;
  }

  /** Fields shown inside Section 3 (3 rich fields + the videos list). */
  get section3FieldCount(): number {
    return this.section3RichFields.length + 1;
  }

  makeScienceVideoRow(thumbnail = '', video = ''): FormGroup {
    return this.fb.group({
      thumbnail: [thumbnail || ''],
      video: [video || '']
    });
  }

  addScienceVideo(): void {
    this.scienceVideoRows.push(this.makeScienceVideoRow());
  }

  removeScienceVideo(index: number): void {
    if (index < 0 || index >= this.scienceVideoRows.length) return;
    this.scienceVideoRows.removeAt(index);
    if (this.scienceVideoRows.length === 0) this.scienceVideoRows.push(this.makeScienceVideoRow());
  }

  /** Science video rows as clean {thumbnail, video} maps, dropping fully-empty rows. */
  private serializeScienceVideos(): { thumbnail: string; video: string }[] {
    return this.scienceVideoRows.controls
      .map(c => ({
        thumbnail: (c.get('thumbnail')?.value ?? '').toString().trim(),
        video: (c.get('video')?.value ?? '').toString().trim()
      }))
      .filter(r => r.thumbnail !== '' || r.video !== '');
  }

  /* ---------- Section 4: AH videos (array of maps w/ media uploads) ---------- */

  get ahVideoRows(): FormArray {
    return this.form.get('ahvideos') as FormArray;
  }

  /** Fields shown inside Section 4 (video title + the videos list). */
  get section4FieldCount(): number {
    return this.section4TextFields.length + 1;
  }

  makeAhVideoRow(videoname = '', video = '', thumbnail = ''): FormGroup {
    return this.fb.group({
      videoname: [videoname || ''],
      video: [video || ''],
      thumbnail: [thumbnail || '']
    });
  }

  addAhVideo(): void {
    this.ahVideoRows.push(this.makeAhVideoRow());
  }

  removeAhVideo(index: number): void {
    if (index < 0 || index >= this.ahVideoRows.length) return;
    this.ahVideoRows.removeAt(index);
    if (this.ahVideoRows.length === 0) this.ahVideoRows.push(this.makeAhVideoRow());
  }

  /** AH video rows as clean maps, dropping rows where every field is empty. */
  private serializeAhVideos(): { videoname: string; video: string; thumbnail: string }[] {
    return this.ahVideoRows.controls
      .map(c => ({
        videoname: (c.get('videoname')?.value ?? '').toString().trim(),
        video: (c.get('video')?.value ?? '').toString().trim(),
        thumbnail: (c.get('thumbnail')?.value ?? '').toString().trim()
      }))
      .filter(r => r.videoname !== '' || r.video !== '' || r.thumbnail !== '');
  }

  /* ---------- Section 5: Excellence-Installation videos (array of {thumbnail, video} uploads) ---------- */

  get eiVideoRows(): FormArray {
    return this.form.get('eivideos') as FormArray;
  }

  /** Fields shown inside Section 5 (5 rich + 7 text + the videos list). */
  get section5FieldCount(): number {
    return this.section5RichFields.length + this.section5TextFields.length + 1;
  }

  makeEiVideoRow(thumbnail = '', video = ''): FormGroup {
    return this.fb.group({ thumbnail: [thumbnail || ''], video: [video || ''] });
  }

  addEiVideo(): void {
    this.eiVideoRows.push(this.makeEiVideoRow());
  }

  removeEiVideo(index: number): void {
    if (index < 0 || index >= this.eiVideoRows.length) return;
    this.eiVideoRows.removeAt(index);
    if (this.eiVideoRows.length === 0) this.eiVideoRows.push(this.makeEiVideoRow());
  }

  /** EI video rows as clean {thumbnail, video} maps, dropping fully-empty rows. */
  private serializeEiVideos(): { thumbnail: string; video: string }[] {
    return this.eiVideoRows.controls
      .map(c => ({
        thumbnail: (c.get('thumbnail')?.value ?? '').toString().trim(),
        video: (c.get('video')?.value ?? '').toString().trim()
      }))
      .filter(r => r.thumbnail !== '' || r.video !== '');
  }

  /* ---------- shared normalizers for array sub-fields ---------- */

  private normText(v: any): string {
    return (v ?? '').toString().trim();
  }

  private normRich(v: any): string {
    const raw = (v ?? '').toString().trim();
    return this.isEmptyHtml(raw) ? '' : raw;
  }

  /* ---------- Section 6: love letters [{profileid (select), letter (rich)}] ---------- */

  get loveLetterRows(): FormArray {
    return this.form.get('loveletters') as FormArray;
  }

  get section6FieldCount(): number {
    return this.section6RichFields.length + 1;
  }

  /** Lazily-created rich editor for a love-letter row. */
  getLetterEditor(index: number): Editor {
    const key = 'll_' + index;
    if (!this.letterEditors[key]) this.letterEditors[key] = new Editor();
    return this.letterEditors[key];
  }

  makeLoveLetterRow(profileid = '', letter = ''): FormGroup {
    return this.fb.group({ profileid: [profileid || ''], letter: [letter || ''] });
  }

  addLoveLetter(): void {
    this.loveLetterRows.push(this.makeLoveLetterRow());
  }

  removeLoveLetter(index: number): void {
    if (index < 0 || index >= this.loveLetterRows.length) return;
    this.loveLetterRows.removeAt(index);
    if (this.loveLetterRows.length === 0) this.loveLetterRows.push(this.makeLoveLetterRow());
  }

  private serializeLoveLetters(): { profileid: string; letter: string }[] {
    return this.loveLetterRows.controls
      .map(c => ({
        profileid: this.normText(c.get('profileid')?.value),
        letter: this.normRich(c.get('letter')?.value)
      }))
      .filter(l => l.profileid !== '' || l.letter !== '');
  }

  /* ---------- Section 7: live-arena videos [{thumbnail, video}] ---------- */

  get liveArenaVideoRows(): FormArray {
    return this.form.get('livearenavideos') as FormArray;
  }

  get section7FieldCount(): number {
    return this.section7RichFields.length + 1;
  }

  makeLiveArenaVideoRow(thumbnail = '', video = ''): FormGroup {
    return this.fb.group({ thumbnail: [thumbnail || ''], video: [video || ''] });
  }

  addLiveArenaVideo(): void {
    this.liveArenaVideoRows.push(this.makeLiveArenaVideoRow());
  }

  removeLiveArenaVideo(index: number): void {
    if (index < 0 || index >= this.liveArenaVideoRows.length) return;
    this.liveArenaVideoRows.removeAt(index);
    if (this.liveArenaVideoRows.length === 0) this.liveArenaVideoRows.push(this.makeLiveArenaVideoRow());
  }

  private serializeLiveArenaVideos(): { thumbnail: string; video: string }[] {
    return this.liveArenaVideoRows.controls
      .map(c => ({ thumbnail: this.normText(c.get('thumbnail')?.value), video: this.normText(c.get('video')?.value) }))
      .filter(r => r.thumbnail !== '' || r.video !== '');
  }

  /* ---------- Section 8: prodigies videos + ads ---------- */

  get prodigiesVideoRows(): FormArray {
    return this.form.get('prodigiesvideos') as FormArray;
  }

  get section8FieldCount(): number {
    return this.section8RichFields.length + this.section8FooterRich.length + this.section8TextFields.length + 2;
  }

  makeProdigiesVideoRow(thumbnail = '', video = ''): FormGroup {
    return this.fb.group({ thumbnail: [thumbnail || ''], video: [video || ''] });
  }

  addProdigiesVideo(): void {
    this.prodigiesVideoRows.push(this.makeProdigiesVideoRow());
  }

  removeProdigiesVideo(index: number): void {
    if (index < 0 || index >= this.prodigiesVideoRows.length) return;
    this.prodigiesVideoRows.removeAt(index);
    if (this.prodigiesVideoRows.length === 0) this.prodigiesVideoRows.push(this.makeProdigiesVideoRow());
  }

  private serializeProdigiesVideos(): { thumbnail: string; video: string }[] {
    return this.prodigiesVideoRows.controls
      .map(c => ({ thumbnail: this.normText(c.get('thumbnail')?.value), video: this.normText(c.get('video')?.value) }))
      .filter(r => r.thumbnail !== '' || r.video !== '');
  }

  // ---- ads (adsleftmap): array of maps, each with 4 rich fields, 2 inputs & a nested proof array ----

  get adRows(): FormArray {
    return this.form.get('adsleftmap') as FormArray;
  }

  /** Lazily-created rich editor for an ad row's rich field (head/title1/title2/content). */
  getAdEditor(index: number, field: string): Editor {
    const key = 'ad_' + index + '_' + field;
    if (!this.adEditors[key]) this.adEditors[key] = new Editor();
    return this.adEditors[key];
  }

  makeAdRow(a: any = {}): FormGroup {
    const proofs = Array.isArray(a?.proof) ? a.proof : [];
    const proofArray = proofs.length
      ? this.fb.array(proofs.map((p: any) => this.makeProofRow(p?.number, p?.proof)))
      : this.fb.array([this.makeProofRow()]);
    return this.fb.group({
      head: [a?.head || ''],
      title1: [a?.title1 || ''],
      title2: [a?.title2 || ''],
      content: [a?.content || ''],
      buttonname: [a?.buttonname || ''],
      buttonbelowtext: [a?.buttonbelowtext || ''],
      proof: proofArray
    });
  }

  addAd(): void {
    this.adRows.push(this.makeAdRow());
  }

  removeAd(index: number): void {
    if (index < 0 || index >= this.adRows.length) return;
    this.adRows.removeAt(index);
    if (this.adRows.length === 0) this.adRows.push(this.makeAdRow());
  }

  /** The nested proof FormArray for a given ad row. */
  adProofRows(index: number): FormArray {
    return this.adRows.at(index)?.get('proof') as FormArray;
  }

  addAdProof(index: number): void {
    this.adProofRows(index)?.push(this.makeProofRow());
  }

  removeAdProof(adIndex: number, proofIndex: number): void {
    const arr = this.adProofRows(adIndex);
    if (!arr || proofIndex < 0 || proofIndex >= arr.length) return;
    arr.removeAt(proofIndex);
    if (arr.length === 0) arr.push(this.makeProofRow());
  }

  private serializeAds(): any[] {
    return this.adRows.controls
      .map(c => {
        const proof = (c.get('proof') as FormArray).controls
          .map(pc => ({ number: this.normText(pc.get('number')?.value), proof: this.normText(pc.get('proof')?.value) }))
          .filter(p => p.number !== '' || p.proof !== '');
        return {
          head: this.normRich(c.get('head')?.value),
          title1: this.normRich(c.get('title1')?.value),
          title2: this.normRich(c.get('title2')?.value),
          content: this.normRich(c.get('content')?.value),
          buttonname: this.normText(c.get('buttonname')?.value),
          buttonbelowtext: this.normText(c.get('buttonbelowtext')?.value),
          proof
        };
      })
      .filter(a =>
        a.head !== '' || a.title1 !== '' || a.title2 !== '' || a.content !== '' ||
        a.buttonname !== '' || a.buttonbelowtext !== '' || a.proof.length > 0
      );
  }

  /* ---------- document size meter (Firestore ~1 MiB / document) ---------- */

  /** Live estimate of the Firestore document size, in bytes, as it would be saved (memoized). */
  get documentBytes(): number {
    if (this._bytesCache === null) this._bytesCache = this.computeDocumentBytes();
    return this._bytesCache;
  }

  private computeDocumentBytes(): number {
    const data: Record<string, any> = { ...this.docData };
    // Every scalar goes through the same normalization used at save time.
    this.allFields.forEach(f => {
      data[f.key] = this.normalizeScalar(f.key, this.form.get(f.key)?.value);
    });
    data['proofsinnumber'] = this.serializeProofs();
    data['publicationStrip'] = this.serializePublications();
    data['awardsandrecognition'] = this.serializeAwards();
    data['scienceinactionvideos'] = this.serializeScienceVideos();
    data['ahvideos'] = this.serializeAhVideos();
    data['eivideos'] = this.serializeEiVideos();
    data['loveletters'] = this.serializeLoveLetters();
    data['livearenavideos'] = this.serializeLiveArenaVideos();
    data['prodigiesvideos'] = this.serializeProdigiesVideos();
    data['adsleftmap'] = this.serializeAds();
    data['updatedAt'] = new Date(); // serverTimestamp() counts as 8 bytes
    return this.firestoreDocSize(data);
  }

  /** Percentage of the 1 MB limit used, rounded to one decimal. */
  get documentPercent(): number {
    return Math.round((this.documentBytes / this.maxDocBytes) * 1000) / 10;
  }

  /** Progress-bar width, capped at 100%. */
  get sizeBarWidth(): number {
    return Math.min(100, (this.documentBytes / this.maxDocBytes) * 100);
  }

  /** Colour band for the meter. */
  get sizeLevel(): 'ok' | 'warn' | 'danger' {
    const pct = (this.documentBytes / this.maxDocBytes) * 100;
    if (pct >= 90) return 'danger';
    if (pct >= 70) return 'warn';
    return 'ok';
  }

  get documentUsedLabel(): string {
    return this.formatBytes(this.documentBytes);
  }

  get documentLimitLabel(): string {
    return '1 MB';
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 2 : kb < 100 ? 1 : 0)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  }

  // ---- Firestore storage-size model (per official docs) ----

  private firestoreDocSize(fields: Record<string, any>): number {
    // Document-name size for classify/<DOC_ID> (+16), plus 32 bytes of doc overhead.
    let total =
      this.strSize('classify') +
      this.strSize(EiflixdiscoverpageComponent.DOC_ID) +
      16 + 32;
    for (const key of Object.keys(fields)) {
      if (fields[key] === undefined) continue;
      total += this.strSize(key) + this.valueSize(fields[key]);
    }
    return total;
  }

  /** A string/ID contributes its UTF-8 byte length + 1. */
  private strSize(str: string): number {
    return this.utf8Len(str) + 1;
  }

  private valueSize(value: any): number {
    if (value === null || value === undefined) return 1;
    if (value instanceof Date) return 8;
    // Firestore Timestamp (loaded doc)
    if (typeof value?.toDate === 'function' ||
        (typeof value?.seconds === 'number' && typeof value?.nanoseconds === 'number')) return 8;
    // DocumentReference (loaded doc)
    if (typeof value?.path === 'string' && typeof value?.id === 'string') {
      return String(value.path).split('/').reduce((s: number, seg: string) => s + this.strSize(seg), 0) + 16;
    }
    const t = typeof value;
    if (t === 'string') return this.utf8Len(value) + 1;
    if (t === 'boolean') return 1;
    if (t === 'number') return 8;
    if (Array.isArray(value)) return value.reduce((s, v) => s + this.valueSize(v), 0);
    if (t === 'object') {
      let sum = 0;
      for (const k of Object.keys(value)) sum += this.strSize(k) + this.valueSize(value[k]);
      return sum + 32;
    }
    return 0;
  }

  /** Platform-independent UTF-8 byte length (works in browser & SSR). */
  private utf8Len(str: string): number {
    let bytes = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i++; } // surrogate pair
      else bytes += 3;
    }
    return bytes;
  }

  /** Editor content is "empty" when it is blank or just an empty paragraph. */
  private isEmptyHtml(html: string): boolean {
    const stripped = (html || '').replace(/<p>\s*<\/p>|<br\s*\/?>|&nbsp;|\s/gi, '');
    return stripped.length === 0;
  }

  /**
   * Canonical form of a scalar field's value — the single source of truth used by
   * save, the size meter, the pristine snapshot and the dirty check so they never
   * disagree. Rich fields collapse empty markup to ''; all scalars are trimmed.
   */
  private normalizeScalar(key: string, value: any): string {
    const raw = (value ?? '').toString().trim();
    const isRich = this.allRichFields.some(f => f.key === key);
    return isRich && this.isEmptyHtml(raw) ? '' : raw;
  }

  reset(): void {
    this.form.patchValue({ ...this.pristine });

    const proofs = JSON.parse(this.pristineProofs || '[]');
    this.proofRows.clear();
    proofs.forEach((p: any) => this.proofRows.push(this.makeProofRow(p?.number, p?.proof)));
    if (this.proofRows.length === 0) this.proofRows.push(this.makeProofRow());

    const pubs = JSON.parse(this.pristinePublications || '[]');
    this.pubRows.clear();
    pubs.forEach((p: any) => this.pubRows.push(this.fb.control((p ?? '').toString())));
    if (this.pubRows.length === 0) this.pubRows.push(this.fb.control(''));

    const awards = JSON.parse(this.pristineAwards || '[]');
    this.awardRows.clear();
    awards.forEach((a: any) =>
      this.awardRows.push(this.makeAwardRow(a?.organization, a?.department, a?.awardanddate, a?.emoji))
    );
    if (this.awardRows.length === 0) this.awardRows.push(this.makeAwardRow());
    this.openEmojiRow = null;

    const scienceVideos = JSON.parse(this.pristineScienceVideos || '[]');
    this.scienceVideoRows.clear();
    scienceVideos.forEach((v: any) =>
      this.scienceVideoRows.push(this.makeScienceVideoRow(v?.thumbnail, v?.video))
    );
    if (this.scienceVideoRows.length === 0) this.scienceVideoRows.push(this.makeScienceVideoRow());

    const ahvideos = JSON.parse(this.pristineAhVideos || '[]');
    this.ahVideoRows.clear();
    ahvideos.forEach((v: any) =>
      this.ahVideoRows.push(this.makeAhVideoRow(v?.videoname, v?.video, v?.thumbnail))
    );
    if (this.ahVideoRows.length === 0) this.ahVideoRows.push(this.makeAhVideoRow());

    const eivideos = JSON.parse(this.pristineEiVideos || '[]');
    this.eiVideoRows.clear();
    eivideos.forEach((v: any) => this.eiVideoRows.push(this.makeEiVideoRow(v?.thumbnail, v?.video)));
    if (this.eiVideoRows.length === 0) this.eiVideoRows.push(this.makeEiVideoRow());

    const loveletters = JSON.parse(this.pristineLoveLetters || '[]');
    this.loveLetterRows.clear();
    loveletters.forEach((l: any) => this.loveLetterRows.push(this.makeLoveLetterRow(l?.profileid, l?.letter)));
    if (this.loveLetterRows.length === 0) this.loveLetterRows.push(this.makeLoveLetterRow());

    const livearenavideos = JSON.parse(this.pristineLiveArenaVideos || '[]');
    this.liveArenaVideoRows.clear();
    livearenavideos.forEach((v: any) => this.liveArenaVideoRows.push(this.makeLiveArenaVideoRow(v?.thumbnail, v?.video)));
    if (this.liveArenaVideoRows.length === 0) this.liveArenaVideoRows.push(this.makeLiveArenaVideoRow());

    const prodigiesvideos = JSON.parse(this.pristineProdigiesVideos || '[]');
    this.prodigiesVideoRows.clear();
    prodigiesvideos.forEach((v: any) => this.prodigiesVideoRows.push(this.makeProdigiesVideoRow(v?.thumbnail, v?.video)));
    if (this.prodigiesVideoRows.length === 0) this.prodigiesVideoRows.push(this.makeProdigiesVideoRow());

    const ads = JSON.parse(this.pristineAds || '[]');
    this.adRows.clear();
    ads.forEach((a: any) => this.adRows.push(this.makeAdRow(a)));
    if (this.adRows.length === 0) this.adRows.push(this.makeAdRow());

    this.snackBar.open('Changes reverted.', 'Close', { duration: 1800 });
  }

  async save(): Promise<void> {
    // Nothing to save, or a save already in flight.
    if (this.isSaving || !this.isDirty) return;

    // Never issue a write we know Firestore will reject (~1 MiB doc cap).
    if (this.documentBytes > this.maxDocBytes) {
      this.snackBar.open(
        `Content is ${this.documentUsedLabel} — over the 1 MB Firestore limit. Remove some content and try again.`,
        'Close',
        { duration: 5000 }
      );
      return;
    }

    this.isSaving = true;

    const payload: Record<string, any> = { updatedAt: serverTimestamp() };
    this.allFields.forEach(f => {
      payload[f.key] = this.normalizeScalar(f.key, this.form.get(f.key)?.value);
    });
    payload['proofsinnumber'] = this.serializeProofs();
    payload['publicationStrip'] = this.serializePublications();
    payload['awardsandrecognition'] = this.serializeAwards();
    payload['scienceinactionvideos'] = this.serializeScienceVideos();
    payload['ahvideos'] = this.serializeAhVideos();
    payload['eivideos'] = this.serializeEiVideos();
    payload['loveletters'] = this.serializeLoveLetters();
    payload['livearenavideos'] = this.serializeLiveArenaVideos();
    payload['prodigiesvideos'] = this.serializeProdigiesVideos();
    payload['adsleftmap'] = this.serializeAds();

    try {
      // merge:true — never clobber other fields on classify/eiflixdiscoverpage.
      await setDoc(
        doc(this.firestore, 'classify', EiflixdiscoverpageComponent.DOC_ID),
        payload,
        { merge: true }
      );

      this.allFields.forEach(f => (this.pristine[f.key] = payload[f.key]));
      this.pristineProofs = JSON.stringify(payload['proofsinnumber']);
      this.pristinePublications = JSON.stringify(payload['publicationStrip']);
      this.pristineAwards = JSON.stringify(payload['awardsandrecognition']);
      this.pristineScienceVideos = JSON.stringify(payload['scienceinactionvideos']);
      this.pristineAhVideos = JSON.stringify(payload['ahvideos']);
      this.pristineEiVideos = JSON.stringify(payload['eivideos']);
      this.pristineLoveLetters = JSON.stringify(payload['loveletters']);
      this.pristineLiveArenaVideos = JSON.stringify(payload['livearenavideos']);
      this.pristineProdigiesVideos = JSON.stringify(payload['prodigiesvideos']);
      this.pristineAds = JSON.stringify(payload['adsleftmap']);
      this.invalidateCaches(); // pristine changed → recompute dirty/size
      this.snackBar.open('Discover page saved.', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Error saving discover config:', err);
      this.snackBar.open('Error saving. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }
}
