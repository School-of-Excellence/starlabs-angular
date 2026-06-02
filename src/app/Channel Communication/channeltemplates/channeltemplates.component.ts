import {Component,inject,OnInit,AfterViewInit,OnDestroy,ViewChild,ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, FormsModule,FormArray} from '@angular/forms';
import { NgxEditorModule, Editor, Toolbar ,toHTML } from 'ngx-editor';
import {arrayUnion,collection,doc,Firestore,getDoc,getDocs,setDoc,updateDoc,serverTimestamp,query,where,orderBy} from '@angular/fire/firestore';
import { Storage, ref as sref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable, of, Subject, timer } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatRadioModule } from '@angular/material/radio';
import { AuthguardService } from '../../authguard.service';
import { PickerModule } from '@ctrl/ngx-emoji-mart';


export type TemplateStatus = 'pending' | 'approved' | 'rework';
export type HeaderType = 'none' | 'text' | 'image' | 'video' | 'document';

export interface TimelineEntry {
  date: any;
  action: string;
  actionby: string;
  notes: string;
}

export interface CategoryItem {
  id: string;
  name: string;
}

export interface ChannelTemplate {
  docid: string;
  templatename: string;
  templateid: string;
  category: string;
  headertype: HeaderType;
  headervalue: string;
  htmlbody: string;
  textbody: string;
  footer: string;
  status: TemplateStatus;
  createdby: string;
  createddate: any;
  approvedby?: string;
  approveddate?: any;
  updatedby?: string;
  updateddate?: any;
  timeline: TimelineEntry[];
  templatemodel?: string[];
  links?: { label: string; url: string }[];
  files?: { name: string; url: string }[];
  active?: boolean;
  delete?: boolean;
}

@Component({
  selector: 'app-channeltemplates',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgxEditorModule,
    MatSlideToggleModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MatTooltipModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatRadioModule,
    PickerModule
  ],
  templateUrl: './channeltemplates.component.html',
  styleUrls: ['./channeltemplates.component.css'],
})
export class ChannelTemplatesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  private firestore = inject(Firestore);
  private snackBar  = inject(MatSnackBar);
  private storage   = inject(Storage);

  // view & state
  viewMode: 'list' | 'create' | 'preview' = 'list';
  isEditMode = false;
  currentEditingTemplate: ChannelTemplate | null = null;
  previewTemplate: ChannelTemplate | null = null;
  isLoading = false;
  isCheckingName = false;
  isSaving = false;

  // data
  existingTemplates: ChannelTemplate[] = [];
  dataSource = new MatTableDataSource<ChannelTemplate>([]);
  displayedColumns: string[] = [
    'templatename', 'category', 'headertype', 'status', 'date', 'actions'
  ];

  // categories
  categories: CategoryItem[] = [];
  isCategoriesLoading = false;

  // filters
  searchTerm = '';
  selectedCategory = '';
  selectedStatus: '' | TemplateStatus = '';

  // pagination
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  totalResults = 0;
  statusCounts = { pending: 0, approved: 0, rework: 0 };

  // manage categories dialog
  manageDialogOpen = false;
  newCategoryName = '';

  // header input
  headerInputMode: 'url' | 'upload' = 'url';
  isUploadingHeader = false;
  previousHeaderType: HeaderType = 'none';

  // header type options
  headerTypes: { value: HeaderType; label: string; icon: string }[] = [
    { value: 'none',     label: 'None',     icon: 'block'       },
    { value: 'text',     label: 'Text',     icon: 'text_fields' },
    { value: 'image',    label: 'Image',    icon: 'image'       },
    { value: 'video',    label: 'Video',    icon: 'videocam'    },
    { value: 'document', label: 'Document', icon: 'description' }
  ];

  templateForm: FormGroup;
  editor!: Editor;
  htmlBodyContent = '';
  previewHtml: SafeHtml = '';

  toolbar: Toolbar = [
    ['bold', 'italic'],
    ['underline', 'strike'],
    ['ordered_list', 'bullet_list'],
    ['link'],
    ['text_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
  ];

  showButtons = true;
  maxButtons  = 5;
  showEmojiPicker = false;

  templateFiles: { name: string; url: string }[] = [];
  isUploadingFile = false;
  extractedLinks: { label: string; url: string }[] = [];

  // profile uid map
  mapprofileuid: Record<string, any> = {};

  // destroy signal
  private destroy$ = new Subject<void>();
  private originalTemplateName = '';

  constructor(
    private fb: FormBuilder,
    private authguard: AuthguardService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
  ) {
    this.templateForm = this.fb.group({
      templatename: ['',
        [Validators.required, Validators.pattern(/^[a-zA-Z0-9\s._&!()-]+$/)],
        [this.templateNameAsyncValidator.bind(this)]
      ],
      category:    ['', Validators.required],
      headertype:  ['none', Validators.required],
      headervalue: [''],
      htmlbody:    ['', Validators.required],
      textbody:    [''],
      footer:      ['', Validators.maxLength(60)],
      buttons:     this.fb.array([])
    });

    this.dataSource.filterPredicate = this.createFilter();
  }

  //  Lifecycle 
  ngOnInit(): void {
    this.editor = new Editor();
    this.templateForm.get('htmlbody')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(val => {
      if (!val) {
        this.htmlBodyContent = '';
        this.previewHtml = '';
        return;
      }
      try {
        this.htmlBodyContent = typeof val === 'string' ? val : toHTML(val, this.editor.schema);
      } catch {
        this.htmlBodyContent = '';
      }
      this.extractedLinks = this.extractLinks(this.htmlBodyContent);
      this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(this.htmlBodyContent);
    });

    this.authguard.getProfileMap().then(data => {
      this.mapprofileuid = data.mapUserId || {};
    });

    this.loadCategories();
    this.loadTemplates();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.paginator) this.dataSource.paginator = this.paginator;
      if (this.sort) {
        this.dataSource.sort = this.sort;
        this.setupSorting();
      }
    });
  }

  ngOnDestroy(): void {
    this.editor.destroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Tabel

  private setupSorting(): void {
    this.dataSource.sortingDataAccessor = (item: ChannelTemplate, property: string) => {
      switch (property) {
        case 'date':         return item.createddate?.toDate ? item.createddate.toDate().getTime() : 0;
        case 'templatename': return item.templatename?.toLowerCase() || '';
        case 'category':     return item.category?.toLowerCase() || '';
        case 'headertype':   return item.headertype?.toLowerCase() || '';
        case 'status':       return item.status?.toLowerCase() || '';
        default:             return (item as any)[property] || '';
      }
    };
  }

  private reconnectTableBindings(): void {
    setTimeout(() => {
      if (this.paginator && this.dataSource.paginator !== this.paginator) {
        this.dataSource.paginator = this.paginator;
      }
      if (this.sort && this.dataSource.sort !== this.sort) {
        this.dataSource.sort = this.sort;
        this.setupSorting();
      }
    });
  }

  // Load Data 

  async loadCategories(): Promise<void> {
    this.isCategoriesLoading = true;
    try {
      const ref  = doc(collection(this.firestore, 'classify'), 'channelcategories');
      const snap = await getDoc(ref);
      this.categories = snap.exists() ? (snap.data()?.['categories'] || []) : [];
    } catch (err) {
      console.error('Error loading categories:', err);
      this.categories = [];
    } finally {
      this.isCategoriesLoading = false;
      this.cdr.detectChanges();
    }
  }

  async loadTemplates(): Promise<void> {
    this.isLoading = true;
    try {
      const ref  = collection(this.firestore, 'channeltemplates');
      const snap = await getDocs(query(ref, orderBy('createddate', 'desc')));
      this.existingTemplates = snap.docs
        .map(d => ({ docid: d.id, ...d.data() } as ChannelTemplate))
        .filter(t => !t.delete);
      this.dataSource.data = this.existingTemplates;
      this.totalResults    = this.existingTemplates.length;
      this.statusCounts = {
        pending:  this.existingTemplates.filter(t => t.status === 'pending').length,
        approved: this.existingTemplates.filter(t => t.status === 'approved').length,
        rework:   this.existingTemplates.filter(t => t.status === 'rework').length
      };
      this.applyFilters();
    } catch (err) {
      console.error('Error loading templates:', err);
      this.showSnackBar('Error loading templates');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
      this.reconnectTableBindings();
    }
  }

  //  Filters 

  createFilter(): (data: ChannelTemplate, filter: string) => boolean {
    return (data: ChannelTemplate, filter: string): boolean => {
      const f = JSON.parse(filter);
      if (f.searchTerm) {
        const s = f.searchTerm.toLowerCase();
        const match =
          (data.templatename || '').toLowerCase().includes(s) ||
          (data.templateid   || '').toLowerCase().includes(s) ||
          (data.category     || '').toLowerCase().includes(s) ||
          (data.htmlbody     || '').toLowerCase().includes(s);
        if (!match) return false;
      }
      if (f.selectedCategory && data.category !== f.selectedCategory) return false;
      if (f.selectedStatus   && data.status   !== f.selectedStatus)   return false;
      return true;
    };
  }

  applyFilters(): void {
    this.dataSource.filter = JSON.stringify({
      searchTerm:       this.searchTerm.trim(),
      selectedCategory: this.selectedCategory,
      selectedStatus:   this.selectedStatus,
    });
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
    this.totalResults = this.dataSource.filteredData.length;
  }

  clearFilters(): void {
    this.searchTerm       = '';
    this.selectedCategory = '';
    this.selectedStatus   = '';
    this.applyFilters();
  }

  // Preview 
  switchToPreviewView(t: ChannelTemplate): void {
    this.viewMode      = 'preview';
    this.previewTemplate = t;
    this.previewHtml   = this.sanitizer.bypassSecurityTrustHtml(t.htmlbody || '');
  }

  getPreviewHeader(): string {
    return this.viewMode === 'preview' && this.previewTemplate
      ? this.previewTemplate.headervalue
      : (this.templateForm.get('headervalue')?.value || '');
  }

  getPreviewHeaderType(): HeaderType {
    return this.viewMode === 'preview' && this.previewTemplate
      ? this.previewTemplate.headertype
      : (this.templateForm.get('headertype')?.value || 'none');
  }

  getPreviewFooter(): string {
    return this.viewMode === 'preview' && this.previewTemplate
      ? this.previewTemplate.footer
      : (this.templateForm.get('footer')?.value || '');
  }

  // Template Actions 
  editTemplate(t: ChannelTemplate): void {
    this.isEditMode = true;
    this.currentEditingTemplate = t;
    this.viewMode = 'create';
    this.templateForm.patchValue({
      templatename: t.templatename,
      category:     t.category,
      headertype:   t.headertype,
      headervalue:  t.headervalue,
      htmlbody:     t.htmlbody,
      textbody:     t.textbody,
      footer:       t.footer
    });
    this.originalTemplateName = t.templatename;
    this.htmlBodyContent = t.htmlbody || '';
    this.previewHtml     = this.sanitizer.bypassSecurityTrustHtml(t.htmlbody || '');
    this.templateFiles   = t['files'] ? [...t['files']] : [];
    this.extractedLinks  = this.extractLinks(t.htmlbody || '');
    while (this.buttons.length) this.buttons.removeAt(0);
    (t['buttons'] || []).forEach((b: any) =>
      this.buttons.push(this.fb.group({ label: [b.label], url: [b.url] }))
    );
    this.templateForm.get('templatename')?.setValidators([
      Validators.required,
      Validators.pattern(/^[a-zA-Z0-9\s._&!()-]+$/),
      (control) => (t.status === 'approved' && control.value === this.originalTemplateName)
        ? { nameUnchanged: true } : null
    ]);
    this.templateForm.get('templatename')?.setAsyncValidators(this.templateNameAsyncValidator.bind(this));
    this.templateForm.get('templatename')?.updateValueAndValidity();
  }

  async approveTemplate(t: ChannelTemplate): Promise<void> {
    if (!confirm('Approve this template?')) return;
    try {
      const ref = doc(this.firestore, 'channeltemplates', t.docid);
      await updateDoc(ref, {
        status:       'approved',
        approvedby:   this.authguard.uid,
        approveddate: serverTimestamp(),
        timeline:     arrayUnion({
          date: new Date(), action: 'Approved',
          actionby: this.authguard.uid, notes: 'Template approved'
        })
      });
      this.showSnackBar('Template approved');
      this.loadTemplates();
    } catch (err) {
      console.error(err);
      this.showSnackBar('Error approving template');
    }
  }

  async reworkTemplate(t: ChannelTemplate): Promise<void> {
    const notes = prompt('What needs rework?');
    if (notes === null) return;
    try {
      const ref = doc(this.firestore, 'channeltemplates', t.docid);
      await updateDoc(ref, {
        status:   'rework',
        timeline: arrayUnion({
          date: new Date(), action: 'Rework',
          actionby: this.authguard.uid, notes: notes.trim() || 'Sent for rework'
        })
      });
      this.showSnackBar('Template sent for rework');
      this.loadTemplates();
    } catch (err) {
      console.error(err);
      this.showSnackBar('Error sending for rework');
    }
  }

  async deleteTemplate(t: ChannelTemplate): Promise<void> {
    if (!confirm(`Delete template "${t.templatename}"?`)) return;
    try {
      await updateDoc(doc(this.firestore, 'channeltemplates', t.docid), { delete: true });
      this.showSnackBar('Template deleted');
      this.loadTemplates();
    } catch (err) {
      console.error(err);
      this.showSnackBar('Error deleting template');
    }
  }

  async duplicateTemplate(t: ChannelTemplate): Promise<void> {
    try {
      const newRef = doc(collection(this.firestore, 'channeltemplates'));
      await setDoc(newRef, {
        ...t,
        docid:        newRef.id,
        templatename: t.templatename + ' (Copy)',
        templateid:   t.templateid + '_copy',
        status:       'pending',
        createdby:    this.authguard.uid,
        createddate:  serverTimestamp(),
        approvedby:   null,
        approveddate: null,
        updatedby:    null,
        updateddate:  null,
        timeline:     [{ date: new Date(), action: 'Created',
          actionby: this.authguard.uid, notes: `Duplicated from "${t.templatename}"` }],
        active: true,
        delete: false
      });
      this.showSnackBar('Template duplicated successfully');
      this.loadTemplates();
    } catch (err) {
      console.error(err);
      this.showSnackBar('Error duplicating template');
    }
  }

  // Submit
  async onSubmit(submitForApproval: boolean): Promise<void> {
    if (!this.templateForm.valid) {
      Object.keys(this.templateForm.controls).forEach(k =>
        this.templateForm.get(k)?.markAsTouched()
      );
      return;
    }
    if (!this.htmlBodyContent.trim()) {
      this.showSnackBar('Message body is required');
      return;
    }

    const action = this.isEditMode ? 'update' : 'create';
    const verb   = submitForApproval ? 'submit for approval' : 'save as draft';
    if (!confirm(`Are you sure you want to ${action} and ${verb}?`)) return;

    this.isSaving = true;
    try {
      const f         = this.templateForm.getRawValue();
      const tplId     = this.generateTemplateId(f.templatename);
      const variables = this.extractVariables(this.htmlBodyContent);
      const textbody  = this.stripHtml(this.htmlBodyContent);
      const tlEntry: TimelineEntry = {
        date:     new Date(),
        action:   'Submitted',
        actionby: this.authguard.uid,
        notes:    this.isEditMode ? 'Resubmitted for approval' : 'Submitted for approval'
      };

      if (this.isEditMode && this.currentEditingTemplate) {
        if (this.currentEditingTemplate.status === 'approved') {
          // Approved — create new doc, original untouched
          const newRef = doc(collection(this.firestore, 'channeltemplates'));
          await setDoc(newRef, {
            docid:         newRef.id,
            templatename:  f.templatename,
            templateid:    tplId,
            category:      f.category,
            headertype:    f.headertype,
            headervalue:   f.headervalue || '',
            htmlbody:      this.htmlBodyContent,
            textbody:      textbody,
            footer:        f.footer || '',
            status:        'pending',
            createdby:     this.authguard.uid,
            createddate:   serverTimestamp(),
            templatemodel: variables,
            timeline:      [tlEntry],
            active:        true,
            delete:        false,
            buttons:       this.buttons.value,
            links:         this.extractedLinks,
            files:         this.templateFiles,
            derivedfrom:   this.currentEditingTemplate.docid,
          });
          this.showSnackBar('New template created from approved template');
        } else {
          // Pending / Rework — update existing doc
          await updateDoc(doc(this.firestore, 'channeltemplates', this.currentEditingTemplate.docid), {
            templatename:  f.templatename,
            templateid:    tplId,
            category:      f.category,
            headertype:    f.headertype,
            headervalue:   f.headervalue || '',
            htmlbody:      this.htmlBodyContent,
            textbody:      textbody,
            footer:        f.footer || '',
            status:        'pending',
            updatedby:     this.authguard.uid,
            updateddate:   serverTimestamp(),
            templatemodel: variables,
            timeline:      arrayUnion(tlEntry),
            buttons:       this.buttons.value,
            links:         this.extractedLinks,
            files:         this.templateFiles,
          });
          this.showSnackBar('Template updated successfully');
        }
      } else {
        const newRef = doc(collection(this.firestore, 'channeltemplates'));
        await setDoc(newRef, {
          docid:         newRef.id,
          templatename:  f.templatename,
          templateid:    tplId,
          category:      f.category,
          headertype:    f.headertype,
          headervalue:   f.headervalue || '',
          htmlbody:      this.htmlBodyContent,
          textbody:      textbody,
          footer:        f.footer || '',
          status:        'pending',
          createdby:     this.authguard.uid,
          createddate:   serverTimestamp(),
          templatemodel: variables,
          timeline:      [tlEntry],
          active:        true,
          delete:        false,
          buttons:       this.buttons.value,
          links:         this.extractedLinks,
          files:         this.templateFiles,
        });
        this.showSnackBar('Template created successfully');
      }

      this.onReset();
      this.viewMode = 'list';
      this.loadTemplates();

    } catch (err) {
      console.error('Error saving template:', err);
      this.showSnackBar('Error saving template. Please try again.');
    } finally {
      this.isSaving = false;
    }
  }

  //  Form Helpers
  onReset(confirm: boolean = false): void {
    if (confirm && !window.confirm('Reset the form? All unsaved changes will be lost.')) return;
    this.templateForm.get('templatename')?.clearValidators();
    this.templateForm.get('templatename')?.clearAsyncValidators();
    this.templateForm.get('templatename')?.setValidators([
      Validators.required,
      Validators.pattern(/^[a-zA-Z0-9\s._&!()-]+$/)
    ]);
    this.templateForm.get('templatename')?.setAsyncValidators(this.templateNameAsyncValidator.bind(this));
    this.templateForm.get('templatename')?.updateValueAndValidity();
    this.templateForm.reset({ headertype: 'none' });
    this.isEditMode             = false;
    this.currentEditingTemplate = null;
    this.htmlBodyContent        = '';
    this.previewHtml            = '';
    this.headerInputMode        = 'url';
    this.previousHeaderType     = 'none';
    this.originalTemplateName   = '';
    this.templateFiles          = [];
    this.extractedLinks         = [];
    while (this.buttons.length) this.buttons.removeAt(0);
  }

  generateTemplateId(name: string): string {
    return (name || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_&]/g, '');
  }

  extractVariables(template: string): string[] {
    const matches = template.match(/{{(.*?)}}/g) || [];
    const variables = new Set<string>();
    matches.forEach(m => {
      const key = m.replace(/{{|}}/g, '').trim();
      if (key) variables.add(key);
    });
    return Array.from(variables);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractLinks(html: string): { label: string; url: string }[] {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('a'))
      .filter(a => a.href && !a.href.startsWith('javascript'))
      .map(a => ({ label: a.textContent?.trim() || a.href, url: a.href }));
  }

  // Header 
  get showHeaderValue(): boolean {
    return this.templateForm.get('headertype')?.value !== 'none';
  }

  get headerValueLabel(): string {
    const map: Record<string, string> = {
      text: 'Header Text', image: 'Image URL',
      video: 'Video URL',  document: 'Document URL'
    };
    return map[this.templateForm.get('headertype')?.value] || 'Header Value';
  }

  onHeaderTypeChange(type: HeaderType): void {
    const currentValue = this.templateForm.get('headervalue')?.value;
    if (currentValue) {
      if (!confirm('You have already added a header. Switching type will remove it. Continue?')) {
        setTimeout(() => {
          this.templateForm.patchValue({ headertype: this.previousHeaderType }, { emitEvent: false });
        });
        return;
      }
    }
    this.previousHeaderType = type;
    this.templateForm.patchValue({ headertype: type, headervalue: '' });
    this.headerInputMode = 'url';
  }

  removeHeaderUpload(): void {
    this.templateForm.patchValue({ headervalue: '' });
  }

  // File Upload 
  async uploadFile(event: Event, type: 'header' | 'body'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    if (type === 'body' && file.size > 10 * 1024 * 1024) {
      this.showSnackBar(`"${file.name}" exceeds 10MB limit`);
      input.value = '';
      return;
    }

    if (type === 'header') this.isUploadingHeader = true;
    else this.isUploadingFile = true;

    try {
      const folder  = type === 'header' ? 'oneway-headers' : 'oneway-files';
      const fileRef = sref(this.storage, `${folder}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      if (type === 'header') {
        this.templateForm.patchValue({ headervalue: url });
      } else {
        const label = prompt('Enter a name for this file:', file.name.replace(/\.[^/.]+$/, ''));
        if (label === null) return;
        this.templateFiles.push({ name: label.trim() || file.name, url });
      }
      this.showSnackBar(`"${file.name}" uploaded successfully`);
    } catch (err) {
      console.error(err);
      this.showSnackBar('Upload failed');
    } finally {
      if (type === 'header') this.isUploadingHeader = false;
      else this.isUploadingFile = false;
      input.value = '';
    }
  }

  removeFile(index: number): void {
    this.templateFiles.splice(index, 1);
  }

  // Buttons

  addButton(): void {
    if (this.buttons.length >= this.maxButtons) return;
    this.buttons.push(this.fb.group({
      label: ['', [Validators.required, Validators.maxLength(50)]],
      url:   ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]]
    }));
  }

  removeButton(index: number): void {
    this.buttons.removeAt(index);
  }

  // Emoji
  addEmoji(event: any): void {
    this.editor.commands.insertText(event.emoji.native).exec();
    this.showEmojiPicker = false;
    setTimeout(() => {
      const val = this.templateForm.get('htmlbody')?.value;
      if (val) {
        try {
          this.htmlBodyContent = typeof val === 'string' ? val : toHTML(val, this.editor.schema);
        } catch { this.htmlBodyContent = ''; }
        this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(this.htmlBodyContent);
      }
    }, 50);
  }

  //Categories
  openManageDialog(event: Event): void {
    event.stopPropagation();
    this.newCategoryName  = '';
    this.manageDialogOpen = true;
  }

  closeManageDialog(): void {
    this.manageDialogOpen = false;
    this.newCategoryName  = '';
  }

  async addCategory(): Promise<void> {
    const name = this.newCategoryName.trim();
    if (!name) return;
    if (this.categories.some(c => c.name === name)) {
      this.showSnackBar(`"${name}" already exists`);
      return;
    }
    this.isSaving = true;
    try {
      const newItem: CategoryItem = {
        id:   doc(collection(this.firestore, '_')).id,
        name: name
      };
      const updated = [...this.categories, newItem];
      await setDoc(doc(collection(this.firestore, 'classify'), 'channelcategories'),
        { categories: updated }, { merge: true });
      this.categories      = updated;
      this.newCategoryName = '';
      this.showSnackBar('Category added successfully');
      this.templateForm.patchValue({ category: newItem.id });
      this.closeManageDialog();
    } catch (err) {
      console.error(err);
      this.showSnackBar('Failed to add category');
    } finally { this.isSaving = false; }
  }

  async removeCategory(item: CategoryItem): Promise<void> {
    if (!confirm(`Remove category "${item.name}"?`)) return;
    this.isSaving = true;
    try {
      const updated = this.categories.filter(c => c.id !== item.id);
      await setDoc(doc(collection(this.firestore, 'classify'), 'channelcategories'),
        { categories: updated }, { merge: true });
      this.categories = updated;
      this.showSnackBar('Category removed successfully');
    } catch (err) {
      console.error(err);
      this.showSnackBar('Failed to remove category');
    } finally { this.isSaving = false; }
  }

  //  Validators 
  templateNameAsyncValidator(control: AbstractControl): Observable<ValidationErrors | null> {
    if (!control.value || control.value.length < 2) return of(null);
    this.isCheckingName = true;
    return timer(500).pipe(
      switchMap(() => this.checkTemplateNameExists(control.value, this.currentEditingTemplate?.docid)),
      map(exists => { this.isCheckingName = false; return exists ? { templateNameExists: true } : null; }),
      catchError(() => { this.isCheckingName = false; return of(null); }),
      takeUntil(this.destroy$)
    );
  }

  async checkTemplateNameExists(name: string, excludeDocId?: string): Promise<boolean> {
    try {
      const snap = await getDocs(query(collection(this.firestore, 'channeltemplates'), where('templatename', '==', name)));
      if (excludeDocId) return snap.docs.some(d => d.id !== excludeDocId);
      return !snap.empty;
    } catch (err) {
      console.error('Error checking template name:', err);
      return false;
    }
  }

  // Display Helpers
  showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

  getStatusColor(t: ChannelTemplate): 'primary' | 'accent' | 'warn' {
    if (t.status === 'approved') return 'primary';
    if (t.status === 'rework')   return 'warn';
    return 'accent';
  }

  getStatusIcon(t: ChannelTemplate): string {
    if (t.status === 'approved') return 'check_circle';
    if (t.status === 'rework')   return 'replay';
    return 'schedule';
  }

  getStatusText(t: ChannelTemplate): string {
    if (t.status === 'approved') return 'Approved';
    if (t.status === 'rework')   return 'Rework';
    return 'Pending';
  }

  getCategoryName(id: string): string {
    return this.categories.find(c => c.id === id)?.name || id;
  }

  formatDate(date: any): string {
    if (date?.toDate) return date.toDate().toLocaleDateString();
    if (date instanceof Date) return date.toLocaleDateString();
    return 'N/A';
  }

  // Getter
  get buttons(): FormArray { return this.templateForm.get('buttons') as FormArray; }
}