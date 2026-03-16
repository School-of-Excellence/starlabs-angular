import { Component, ElementRef, inject, OnInit, ViewChild, AfterViewInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, FormsModule } from '@angular/forms';
import { AngularEditorModule, AngularEditorConfig } from '@kolkov/angular-editor';
import { collection, deleteDoc, doc, Firestore, getDoc, getDocs, updateDoc, serverTimestamp, setDoc, query, where, orderBy } from '@angular/fire/firestore';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { Observable, of, Subject, timer } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, map, catchError, takeUntil } from 'rxjs/operators';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// Angular Material Imports
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { AuthguardService } from '../../authguard.service';
import { TemplateCreatorComponent } from "../template-creator/template-creator.component";
import { MatExpansionModule } from "@angular/material/expansion";

interface EmailTemplate {
  docid: string;
  templatename: string;
  templatealias: string;
  category: string;
  subcategory: string;
  subject: string;
  htmlbody: string;
  textbody: string;
  notes: string;
  createdby: string;
  date: any;
  active: boolean;
  type: string;
  templatevalidated: boolean;
  templatetype: string;
  templatestatus: string;
  postmarkstatus: string;
  templatelayout: string;
  templatemodel: Object;
}

@Component({
  selector: 'app-create-email-template',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    AngularEditorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MatTooltipModule,
    MatSliderModule,
    MatButtonToggleModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatExpansionModule
],
  templateUrl: './create-email-template.component.html',
  styleUrls: ['./create-email-template.component.css'],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({ height: '0px', opacity: 0 }),
        animate('300ms ease-in', style({ height: '*', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-out', style({ height: '0px', opacity: 0 }))
      ])
    ])
  ]
})
export class CreateEmailTemplateComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  templateForm: FormGroup;
  buttonForm: FormGroup;
  imageForm: FormGroup;
  imageEditForm: FormGroup;
  categories = [];
  subCategories = [];
  isLoading = false;
  isMobilePreview = false;
  showButtonForm = false;
  showImageForm = false;
  showImageEditForm = false;
  isUploadingImage = false;
  selectedFile: File | null = null;
  editingImageElement: HTMLImageElement | null = null;
  originalImageData: any = null;

  // New properties for template management with Mat Table Data Source
  existingTemplates: EmailTemplate[] = [];
  dataSource = new MatTableDataSource<EmailTemplate>([]);
  displayedColumns: string[] = ['templatename', 'category', 'subcategory', 'status', 'validated', 'date', 'actions'];
  isCheckingName = false;
  isCheckingAlias = false;
  currentEditingTemplate: EmailTemplate | null = null;
  isEditMode = false;
  viewMode: 'create' | 'list' | 'preview' = 'list';
  previewTemplate: EmailTemplate | null = null;

  // Filter properties
  searchTerm = '';
  selectedCategory = '';
  selectedSubCategory = '';
  selectedStatus = '';
  selectedValidation = '';
  showFilters = false;

  // Pagination properties
  totalResults = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];

  // Angular Editor configuration
  editorConfig: AngularEditorConfig = {
    editable: true,
    spellcheck: false,
    height: '300px',
    minHeight: '200px',
    maxHeight: 'auto',
    width: '100%',
    minWidth: '0',
    translate: 'yes',
    enableToolbar: true,
    showToolbar: true,
    placeholder: 'Enter text here...',
    defaultParagraphSeparator: '',
    defaultFontName: '',
    defaultFontSize: '',
    fonts: [
      { class: 'arial', name: 'Arial' },
      { class: 'times-new-roman', name: 'Times New Roman' },
      { class: 'calibri', name: 'Calibri' },
      { class: 'comic-sans-ms', name: 'Comic Sans MS' }
    ],
    customClasses: [
      {
        name: 'quote',
        class: 'quote',
      },
      {
        name: 'redText',
        class: 'redText'
      },
      {
        name: 'titleText',
        class: 'titleText',
        tag: 'h1',
      },
    ],
    sanitize: false,
    toolbarPosition: 'top',
    toolbarHiddenButtons: []
  };
  mapprofileuid = {};
  private destroy$ = new Subject<void>();

  constructor(private fb: FormBuilder, private authguard: AuthguardService, private cdr:ChangeDetectorRef, private sanitizer: DomSanitizer) {
    this.templateForm = this.fb.group({
      templateName: ['',
        [Validators.required, Validators.pattern(/^[a-zA-Z0-9\s._-]+$/)],
        [this.templateNameAsyncValidator.bind(this)]
      ],
      templateAlias: ['',
        [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]+$/)],
        [this.templateAliasAsyncValidator.bind(this)]
      ],
      category: ['', Validators.required],
      subCategory: ['', Validators.required],
      subject: ['', Validators.required],
      body: ['', Validators.required],
      notes: ['']
    });

    this.buttonForm = this.fb.group({
      buttonText: ['Call to Action', Validators.required],
      buttonUrl: ['https://example.com', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
      buttonColor: ['#28a745', Validators.required],
      buttonTextColor: ['#ffffff', Validators.required],
      buttonSize: ['large', Validators.required]
    });

    this.imageForm = this.fb.group({
      imageUrl: ['', Validators.required],
      imageAlt: ['Image description', Validators.required],
      imageWidth: ['400', Validators.required],
      imageHeight: ['auto'],
      imageAlignment: ['center', Validators.required],
      isResponsive: [true]
    });

    this.imageEditForm = this.fb.group({
      imageUrl: ['', Validators.required],
      imageAlt: ['Image description', Validators.required],
      imageWidth: ['400', [Validators.required, Validators.min(50), Validators.max(1200)]],
      imageHeight: ['auto'],
      imageAlignment: ['center', Validators.required],
      isResponsive: [false]
    });

    // Configure custom filter predicate for the data source
    this.dataSource.filterPredicate = this.createFilter();
  }

  ngOnInit(): void {
    this.authguard.getProfileMap().then((data) => {
      this.mapprofileuid = data.mapUserId;
    })
    this.loadCategoriesAndSubCategories();
    this.loadExistingTemplates();
  }

  

  ngAfterViewInit(): void {
    // Connect paginator and sort to the data source
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // Set up custom sorting for date field
    this.dataSource.sortingDataAccessor = (item: EmailTemplate, property: string) => {
      switch (property) {
        case 'date':
          return item.date?.toDate ? item.date.toDate().getTime() : 0;
        case 'templatename':
          return item.templatename.toLowerCase();
        case 'category':
          return item.category.toLowerCase();
        case 'subcategory':
          return item.subcategory.toLowerCase();
        case 'status':
          return item.templatestatus.toLowerCase();
        case 'validated':
          return item.templatevalidated ? 1 : 0;
        default:
          return item[property as keyof EmailTemplate] as string;
      }
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next
    this.destroy$.complete()
  }

  // Custom filter function for complex filtering
  createFilter(): (data: EmailTemplate, filter: string) => boolean {
    return (data: EmailTemplate, filter: string): boolean => {
      // Parse the filter object
      const filterObject = JSON.parse(filter);

      // Search term filter
      if (filterObject.searchTerm) {
        const searchLower = filterObject.searchTerm.toLowerCase();
        const searchMatch = data.templatename.toLowerCase().includes(searchLower) ||
          data.templatealias.toLowerCase().includes(searchLower) ||
          data.subject.toLowerCase().includes(searchLower) ||
          (data.notes && data.notes.toLowerCase().includes(searchLower));
        if (!searchMatch) return false;
      }

      // Category filter
      if (filterObject.selectedCategory && data.category !== filterObject.selectedCategory) {
        return false;
      }

      // Sub-category filter
      if (filterObject.selectedSubCategory && data.subcategory !== filterObject.selectedSubCategory) {
        return false;
      }

      // Status filter
      if (filterObject.selectedStatus && data.templatestatus !== filterObject.selectedStatus) {
        return false;
      }

      // Validation filter
      if (filterObject.selectedValidation) {
        const isValidated = filterObject.selectedValidation === 'validated';
        if (data.templatevalidated !== isValidated) {
          return false;
        }
      }

      return true;
    };
  }

  // Async validators for template name and alias
  templateNameAsyncValidator(control: AbstractControl): Observable<ValidationErrors | null> {
    if (!control.value || control.value.length < 2) {
      return of(null);
    }

    this.isCheckingName = true;

    return timer(500).pipe(
      switchMap(() => this.checkTemplateNameExists(control.value, this.currentEditingTemplate?.docid)),
      map(exists => {
        this.isCheckingName = false;
        return exists ? { templateNameExists: true } : null;
      }),
      catchError(() => {
        this.isCheckingName = false;
        return of(null);
      })
    );
  }

  templateAliasAsyncValidator(control: AbstractControl): Observable<ValidationErrors | null> {
    if (!control.value || control.value.length < 2) {
      return of(null);
    }

    this.isCheckingAlias = true;

    return timer(500).pipe(
      switchMap(() => this.checkTemplateAliasExists(control.value, this.currentEditingTemplate?.docid)),
      map(exists => {
        this.isCheckingAlias = false;
        return exists ? { templateAliasExists: true } : null;
      }),
      catchError(() => {
        this.isCheckingAlias = false;
        return of(null);
      })
    );
  }

  async checkTemplateNameExists(name: string, excludeDocId?: string): Promise<boolean> {
    try {
      const templatesRef = collection(this.firestore, 'email templates');
      const q = query(templatesRef, where('templatename', '==', name));
      const querySnapshot = await getDocs(q);

      if (excludeDocId) {
        return querySnapshot.docs.some(doc => doc.id !== excludeDocId);
      }

      return !querySnapshot.empty;
    } catch (error) {
      console.error('Error checking template name:', error);
      return false;
    }
  }

  async checkTemplateAliasExists(alias: string, excludeDocId?: string): Promise<boolean> {
    try {
      const templatesRef = collection(this.firestore, 'email templates');
      const q = query(templatesRef, where('templatealias', '==', alias));
      const querySnapshot = await getDocs(q);

      if (excludeDocId) {
        return querySnapshot.docs.some(doc => doc.id !== excludeDocId);
      }

      return !querySnapshot.empty;
    } catch (error) {
      console.error('Error checking template alias:', error);
      return false;
    }
  }

  async loadExistingTemplates(): Promise<void> {
    this.isLoading = true;
    try {
      const templatesRef = collection(this.firestore, 'email templates');
      const querySnapshot = await getDocs(query(templatesRef,orderBy('date','desc')));

      this.existingTemplates = querySnapshot.docs.map(doc => ({
        docid: doc.id,
        ...doc.data()
      } as EmailTemplate));

      // Update the data source
      this.dataSource.data = this.existingTemplates;
      this.totalResults = this.existingTemplates.length;

      // Apply current filters
      this.applyFilters();

      console.log('Loaded templates:', this.existingTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
      this.showSnackBar('Error loading templates');
    } finally {
      this.isLoading = false;
    }
  }

  // Filter methods
  applyFilters(): void {
    const filterValue = JSON.stringify({
      searchTerm: this.searchTerm.trim(),
      selectedCategory: this.selectedCategory,
      selectedSubCategory: this.selectedSubCategory,
      selectedStatus: this.selectedStatus,
      selectedValidation: this.selectedValidation
    });

    this.dataSource.filter = filterValue;

    // Reset to first page when filtering
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }

    // Update total results count
    this.totalResults = this.dataSource.filteredData.length;
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onCategoryFilterChange(): void {
    this.selectedSubCategory = ''; // Reset subcategory when category changes
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedCategory = '';
    this.selectedSubCategory = '';
    this.selectedStatus = '';
    this.selectedValidation = '';
    this.applyFilters();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  getFilteredSubCategories(): string[] {
    if (!this.selectedCategory) {
      return this.subCategories;
    }
    // You might want to implement category-specific subcategories here
    return this.subCategories;
  }

  getUniqueStatuses(): string[] {
    const statuses = [...new Set(this.existingTemplates.map(t => t.templatestatus))];
    return statuses.filter(status => status); // Remove empty values
  }

  // Get current page data for display
  getCurrentPageData(): EmailTemplate[] {
    return this.dataSource.filteredData;
  }

  // Get total filtered results count
  getFilteredResultsCount(): number {
    return this.dataSource.filteredData.length;
  }

  // Get current page info
  getPageInfo(): string {
    if (!this.paginator) return '';

    const startIndex = this.paginator.pageIndex * this.paginator.pageSize + 1;
    const endIndex = Math.min((this.paginator.pageIndex + 1) * this.paginator.pageSize, this.getFilteredResultsCount());

    return `${startIndex}-${endIndex} of ${this.getFilteredResultsCount()}`;
  }

  async loadCategoriesAndSubCategories(): Promise<void> {
    this.isLoading = true;
    try {
      const categoriesCollection = doc(collection(this.firestore, 'email validators'), 'templateCategories');
      const categoriesSnapshot = await getDoc(categoriesCollection);

      this.categories = categoriesSnapshot.data()?.['categories'] || [];
      this.subCategories = categoriesSnapshot.data()?.['subcategories'] || [];

      console.log('Categories loaded:', this.categories);
      console.log('Subcategories loaded:', this.subCategories);

    } catch (error) {
      console.error('Error loading categories and subcategories from Firestore:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // View management methods
  switchToCreateView(): void {
    this.viewMode = 'create';
    this.isEditMode = false;
    this.currentEditingTemplate = null;
    this.onReset();
  }

  switchToListView(): void {
    this.viewMode = 'list';
    this.loadExistingTemplates();
  }

  switchToPreviewView(template: EmailTemplate): void {
    this.viewMode = 'preview';
    this.previewTemplate = template;
  }

  // Template management methods
  editTemplate(template: EmailTemplate): void {
    this.isEditMode = true;
    this.currentEditingTemplate = template;
    this.viewMode = 'create';

    // Populate form with template data
    this.templateForm.patchValue({
      templateName: template.templatename,
      templateAlias: template.templatealias,
      category: template.category,
      subCategory: template.subcategory,
      subject: template.subject,
      body: template.htmlbody,
      notes: template.notes,
    });
  }

  async approveTemplate(template: EmailTemplate): Promise<void> {
    try {
      const templateDoc = doc(this.firestore, 'email templates', template.docid);
      await updateDoc(templateDoc, {
        templatevalidated: true,
        templatestatus: 'created',
        approvedby: this.authguard.uid,
        approvedDate: serverTimestamp()
      });

      this.showSnackBar('Template approved successfully');
      this.loadExistingTemplates();
    } catch (error) {
      console.error('Error approving template:', error);
      this.showSnackBar('Error approving template');
    }
  }

  async deleteTemplate(template: EmailTemplate): Promise<void> {
    if (confirm('Are you sure you want to delete this template?')) {
      try {
        const templateDoc = doc(this.firestore, 'email templates', template.docid);
        await updateDoc(templateDoc, { delete: true });

        this.showSnackBar('Template deleted successfully');
        this.loadExistingTemplates();
      } catch (error) {
        console.error('Error deleting template:', error);
        this.showSnackBar('Error deleting template');
      }
    }
  }

  async duplicateTemplate(template: EmailTemplate): Promise<void> {
    const newTemplate = {
      ...template,
      templatename: template.templatename + ' (Copy)',
      templatealias: template.templatealias + '_copy_' + Date.now(),
      templatevalidated: false,
      templatestatus: 'duplicated',
      postmarktemplateid: null,
      postmarkstatus: 'pending',
      active: false,
      createdby: this.authguard.uid,
      templatemodel : template.templatemodel,
      date: serverTimestamp()
    };

    try {
      const emailTemplatesDocRef = doc(collection(this.firestore, 'email templates'));
      newTemplate.docid = emailTemplatesDocRef.id;
      await setDoc(emailTemplatesDocRef, newTemplate);
      this.showSnackBar('Template duplicated successfully');
      this.loadExistingTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      this.showSnackBar('Error duplicating template');
    }
  }

  // Utility methods
  showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top'
    });
  }

  getStatusColor(template: EmailTemplate): string {
    if (template.templatevalidated) return 'primary';
    if (template.templatestatus === 'created') return 'accent';
    return 'warn';
  }

  getStatusText(template: EmailTemplate): string {
    if (template.templatevalidated) return 'Approved';
    if (template.templatestatus === 'created') return 'Pending';
    return 'Draft';
  }

  formatDate(date: any): string {
    if (date?.toDate) {
      return date.toDate().toLocaleDateString();
    }
    return 'N/A';
  }

  // Image resize functionality with improved detection
  onImageClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const target = event.target as HTMLElement;
    console.log('Clicked element:', target);

    // Check if clicked element is an image or contains an image
    let imgElement: HTMLImageElement | null = null;

    if (target.tagName === 'IMG') {
      imgElement = target as HTMLImageElement;
    } else {
      // Look for image within clicked element
      imgElement = target.querySelector('img');
    }

    if (imgElement) {
      console.log('Found image element:', imgElement);
      this.startImageEdit(imgElement);
    }
  }

  startImageEdit(imgElement: HTMLImageElement): void {
    // Hide other forms
    this.showButtonForm = false;
    this.showImageForm = false;

    // Store reference to the image being edited
    this.editingImageElement = imgElement;

    // Extract current properties from the image element
    const computedStyle = window.getComputedStyle(imgElement);
    const currentWidth = imgElement.getAttribute('data-width') ||
      imgElement.style.width ||
      computedStyle.width || '400';
    const currentHeight = imgElement.getAttribute('data-height') ||
      imgElement.style.height ||
      computedStyle.height || 'auto';
    const currentAlignment = imgElement.getAttribute('data-alignment') || 'center';
    const currentResponsive = imgElement.getAttribute('data-responsive') === 'true';

    // Store original data for reset functionality
    this.originalImageData = {
      url: imgElement.src,
      alt: imgElement.alt,
      width: parseInt(currentWidth.replace('px', '')) || 400,
      height: currentHeight === 'auto' ? 'auto' : parseInt(currentHeight.replace('px', '')),
      alignment: currentAlignment,
      isResponsive: currentResponsive
    };

    console.log('Editing image with data:', this.originalImageData);

    // Populate the edit form
    this.imageEditForm.patchValue({
      imageUrl: imgElement.src,
      imageAlt: imgElement.alt,
      imageWidth: this.originalImageData.width,
      imageHeight: this.originalImageData.height,
      imageAlignment: this.originalImageData.alignment,
      isResponsive: this.originalImageData.isResponsive
    });

    // Show the edit form
    this.showImageEditForm = true;
  }

  updateImageInline(): void {
    if (this.imageEditForm.valid && this.editingImageElement) {
      const formValues = this.imageEditForm.value;
      console.log('Updating image with values:', formValues);

      // Build new styles
      let imageStyle = 'border-radius: 8px; margin: 20px 0; display: block; max-width: 100%; cursor: pointer;';
      let containerStyle = '';

      if (formValues.isResponsive) {
        imageStyle += ' width: 100%; height: auto;';
      } else {
        imageStyle += ` width: ${formValues.imageWidth}px;`;
        if (formValues.imageHeight !== 'auto' && formValues.imageHeight) {
          imageStyle += ` height: ${formValues.imageHeight}px;`;
        } else {
          imageStyle += ' height: auto;';
        }
      }

      // Set alignment
      switch (formValues.imageAlignment) {
        case 'center':
          containerStyle = 'text-align: center;';
          break;
        case 'right':
          containerStyle = 'text-align: right;';
          break;
        case 'left':
          containerStyle = 'text-align: left;';
          break;
      }

      // Update the image element directly
      this.editingImageElement.src = formValues.imageUrl;
      this.editingImageElement.alt = formValues.imageAlt;
      this.editingImageElement.style.cssText = imageStyle;
      this.editingImageElement.setAttribute('data-width', formValues.imageWidth.toString());
      this.editingImageElement.setAttribute('data-height', formValues.imageHeight.toString());
      this.editingImageElement.setAttribute('data-alignment', formValues.imageAlignment);
      this.editingImageElement.setAttribute('data-responsive', formValues.isResponsive.toString());

      // Update container alignment if it exists
      const container = this.editingImageElement.closest('.email-image-container') as HTMLElement;
      if (container) {
        container.style.cssText = containerStyle + ' ' + container.style.cssText.replace(/text-align:[^;]*;?/g, '');
      }

      // Update the form control with the modified content
      const editorElement = document.querySelector('.angular-editor-textarea');
      if (editorElement) {
        this.templateForm.patchValue({
          body: editorElement.innerHTML
        });
      }

      console.log('Image updated successfully');
      this.cancelImageEdit();
    }
  }

  resetImageToOriginal(): void {
    if (this.originalImageData) {
      this.imageEditForm.patchValue({
        imageUrl: this.originalImageData.url,
        imageAlt: this.originalImageData.alt,
        imageWidth: this.originalImageData.width,
        imageHeight: this.originalImageData.height,
        imageAlignment: this.originalImageData.alignment,
        isResponsive: this.originalImageData.isResponsive
      });
    }
  }

  setImagePresetSize(width: number, height: string): void {
    this.imageEditForm.patchValue({
      imageWidth: width,
      imageHeight: height,
      isResponsive: false
    });
  }

  setImageResponsive(): void {
    this.imageEditForm.patchValue({
      isResponsive: true,
      imageWidth: 100,
      imageHeight: 'auto'
    });
  }

  cancelImageEdit(): void {
    this.showImageEditForm = false;
    this.editingImageElement = null;
    this.originalImageData = null;
    this.imageEditForm.reset();
  }

  getImagePreviewText(): string {
    const form = this.imageEditForm.value;
    if (form.isResponsive) {
      return 'Responsive Image (100% width)';
    }
    return `${form.imageWidth}px × ${form.imageHeight === 'auto' ? 'auto' : form.imageHeight + 'px'}`;
  }

  addButton(): void {
    const currentContent = this.templateForm.get('body')?.value || '';
    const buttonHtml = `<button style="background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; font-size: 14px; font-weight: 500; transition: background-color 0.3s ease;" onmouseover="this.style.backgroundColor='#0056b3'" onmouseout="this.style.backgroundColor='#007bff'">Click Me</button>`;

    this.templateForm.patchValue({
      body: currentContent + ' ' + buttonHtml
    });
  }

  addCTAButton(): void {
    this.buttonForm.patchValue({
      buttonText: 'Call to Action',
      buttonUrl: 'https://example.com',
      buttonColor: '#28a745',
      buttonTextColor: '#ffffff',
      buttonSize: 'large'
    });
    this.showButtonForm = true;
    this.showImageForm = false;
  }

  insertButton(): void {
    if (this.buttonForm.valid) {
      const formValues = this.buttonForm.value;
      const currentContent = this.templateForm.get('body')?.value || '';

      const padding = formValues.buttonSize === 'large' ? '14px 28px' :
        formValues.buttonSize === 'small' ? '8px 16px' : '10px 20px';
      const fontSize = formValues.buttonSize === 'large' ? '16px' :
        formValues.buttonSize === 'small' ? '14px' : '15px';

      const buttonHtml = `<div style="text-align: center; margin: 20px 0;">
        <a href="${formValues.buttonUrl}" target="_blank" style="display: inline-block; background-color: ${formValues.buttonColor}; color: ${formValues.buttonTextColor}; padding: ${padding}; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: ${fontSize}; border: none; cursor: pointer; font-family: Arial, sans-serif; letter-spacing: 0.5px; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${formValues.buttonText}</a>
      </div>`;

      this.templateForm.patchValue({
        body: currentContent + buttonHtml
      });

      this.showButtonForm = false;
    }
  }

  addImage(): void {
    this.imageForm.patchValue({
      imageUrl: '',
      imageAlt: 'Image description',
      imageWidth: '400',
      imageHeight: 'auto',
      imageAlignment: 'center',
      isResponsive: true
    });
    this.selectedFile = null;
    this.showImageForm = true;
    this.showButtonForm = false;
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      console.log('File selected:', file.name);
    }
  }

  async uploadImage(): Promise<void> {
    if (!this.selectedFile) {
      this.showSnackBar('Please select an image file first');
      return;
    }

    this.isUploadingImage = true;
    try {
      const timestamp = new Date().getTime();
      const fileName = `email-images/${timestamp}_${this.selectedFile.name}`;
      const storageRef = ref(this.storage, fileName);

      const snapshot = await uploadBytes(storageRef, this.selectedFile);
      const downloadURL = await getDownloadURL(snapshot.ref);

      this.imageForm.patchValue({
        imageUrl: downloadURL
      });

      console.log('Image uploaded successfully:', downloadURL);
      this.showSnackBar('Image uploaded successfully!');

    } catch (error) {
      console.error('Error uploading image:', error);
      this.showSnackBar('Error uploading image. Please try again.');
    } finally {
      this.isUploadingImage = false;
    }
  }

  insertImage(): void {
    if (this.imageForm.valid) {
      const formValues = this.imageForm.value;
      const currentContent = this.templateForm.get('body')?.value || '';

      let imageStyle = 'border-radius: 8px; margin: 20px 0; display: block; max-width: 100%; cursor: pointer;';
      let containerStyle = 'text-align: center;';

      if (formValues.isResponsive) {
        imageStyle += ' width: 100%; height: auto;';
      } else {
        imageStyle += ` width: ${formValues.imageWidth}px;`;
        if (formValues.imageHeight !== 'auto') {
          imageStyle += ` height: ${formValues.imageHeight}px;`;
        } else {
          imageStyle += ' height: auto;';
        }
      }

      if (formValues.imageAlignment === 'center') {
        containerStyle = 'text-align: center;';
      } else if (formValues.imageAlignment === 'right') {
        containerStyle = 'text-align: right;';
      } else {
        containerStyle = 'text-align: left;';
      }

      // Create image with proper data attributes and click handling
      const imageHtml = `<div style="${containerStyle}" class="email-image-container" data-image-editable="true">
        <img src="${formValues.imageUrl}" 
             alt="${formValues.imageAlt}" 
             style="${imageStyle}" 
             data-width="${formValues.imageWidth}" 
             data-height="${formValues.imageHeight}" 
             data-alignment="${formValues.imageAlignment}" 
             data-responsive="${formValues.isResponsive}" 
             class="editable-image"
             onclick="event.stopPropagation(); return false;">
      </div>`;

      this.templateForm.patchValue({
        body: currentContent + imageHtml
      });

      this.showImageForm = false;
      this.selectedFile = null;

      console.log('Image inserted with click handling');
    }
  }

  cancelButtonForm(): void {
    this.showButtonForm = false;
  }

  cancelImageForm(): void {
    this.showImageForm = false;
  }

  togglePreviewMode(): void {
    this.isMobilePreview = !this.isMobilePreview;
  }

  onTemplateNameChange(): void {
    const templateName = this.templateForm.get('templateName')?.value;
    if (templateName && !this.isEditMode) {
      const alias = templateName.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');
      this.templateForm.get('templateAlias')?.setValue(alias);
    }
  }

  getPreviewContent(): SafeHtml {
    if (this.viewMode === 'preview' && this.previewTemplate) {
      return this.sanitizer.bypassSecurityTrustHtml(this.previewTemplate.htmlbody);
    }
    
    const content = this.templateForm.get('body')?.value || '';
    return this.sanitizer.bypassSecurityTrustHtml(content);
  }

  getPreviewSubject(): string {
    if (this.viewMode === 'preview' && this.previewTemplate) {
      return this.previewTemplate.subject;
    }
    return this.templateForm.get('subject')?.value || 'Email Subject';
  }

  getCurrentTime(): string {
    return new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  async onSubmit(): Promise<void> {
    const action = this.isEditMode ? 'Update' : 'Create';
    const check = confirm(`Are you sure to ${action} the template?`);

    if (this.templateForm.valid && check) {
      try {
        var oParser = new DOMParser();
        var oDOM = oParser.parseFromString(this.templateForm.value.body, "text/html");
        var textContent = oDOM.body.innerText;

        if (this.isEditMode && this.currentEditingTemplate) {
          const templateDoc = doc(this.firestore, 'email templates', this.currentEditingTemplate.docid);
          const updateData = {
            templatename: this.templateForm.value.templateName,
            templatealias: this.templateForm.value.templateAlias,
            category: this.templateForm.value.category,
            subcategory: this.templateForm.value.subCategory,
            subject: this.templateForm.value.subject,
            notes: this.templateForm.value.notes || '',
            textbody: textContent,
            htmlbody: this.templateForm.value.body,
            updatedBy: this.authguard.uid,
            updatedDate: serverTimestamp(),
            templatestatus: 'updated',
            templatevalidated: false,
            templatemodel: this.extractVariables(this.templateForm.value.body)
          };

          await updateDoc(templateDoc, updateData);
          this.showSnackBar('Template updated successfully!');

        } else {
          // Create new template
          const emailTemplatesDocRef = doc(collection(this.firestore, 'email templates'));

          const templateData = {
            templatename: this.templateForm.value.templateName,
            templatealias: this.templateForm.value.templateAlias,
            category: this.templateForm.value.category,
            subcategory: this.templateForm.value.subCategory,
            subject: this.templateForm.value.subject,
            notes: this.templateForm.value.notes || '',
            createdby: this.authguard.uid,
            date: serverTimestamp(),
            active: false,
            docid: emailTemplatesDocRef.id,
            type: 'email',
            textbody: textContent,
            templatevalidated: false,
            templatetype: 'Standard',
            templatestatus: 'created',
            htmlbody: this.templateForm.value.body,
            postmarkstatus: 'pending',
            templatelayout: "",
            templatemodel: this.extractVariables(this.templateForm.value.body)
          };

          await setDoc(emailTemplatesDocRef, templateData);
          this.showSnackBar('Template created successfully!');
        }

        this.onReset();
        this.loadExistingTemplates();

      } catch (error) {
        console.error('Error saving template:', error);
        this.showSnackBar('Error saving template. Please try again.');
      }
    } else {
      Object.keys(this.templateForm.controls).forEach(key => {
        this.templateForm.get(key)?.markAsTouched();
      });
    }
  }

  // extractVariables(template: string){

  //   const regex = /{{(.*?)}}/g;
  //   const matches = template.match(regex) || [];

  //   const variables = [];

  //   matches.forEach(match => {
  //     const key = match.replace(/{{|}}/g, '').trim();
  //     variables.push(key); // you can assign default values here if needed
  //   });

  //   return variables;
  // }

  extractVariables(template: string) {
    const regex = /{{(.*?)}}/g;

    // Force TS to treat as string[]
    const matches: string[] = template.match(regex) || [];

    const variables = [];

    matches.forEach(match => {
      const key = match?.replace(/{{|}}/g, '').trim();
      variables.push(key); // you can assign default values here if needed
    });

    return variables;
  }


  onReset(): void {
    this.templateForm.reset();
    this.isEditMode = false;
    this.currentEditingTemplate = null;
    this.showButtonForm = false;
    this.showImageForm = false;
    this.showImageEditForm = false;
  }

  refreshForm(): void {
    this.onReset();
    console.log('Form refreshed');
  }

  onEditorContentChange(content: any): void {
    this.templateForm.patchValue({ body: content }, { emitEvent: false });
    this.cdr.detectChanges();
  }

  // Getter methods for easy access to form controls
  get templateName() { return this.templateForm.get('templateName'); }
  get templateAlias() { return this.templateForm.get('templateAlias'); }
  get category() { return this.templateForm.get('category'); }
  get subCategory() { return this.templateForm.get('subCategory'); }
  get subject() { return this.templateForm.get('subject'); }
  get body() { return this.templateForm.get('body'); }
}