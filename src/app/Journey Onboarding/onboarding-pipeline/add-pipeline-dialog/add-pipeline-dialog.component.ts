import { Component, Inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { getApp } from '@angular/fire/app';
import {
  Firestore, collection, doc, getDocs,
  getDoc, getFirestore, limit, orderBy, query, setDoc, updateDoc, where
} from 'firebase/firestore';
import { AuthguardService } from '../../../authguard.service';

interface DealStage {
  id?: string;
  stageName: string;
  description: string;
  createdDate: any;
  order: number;
}

@Component({
  selector: 'app-add-pipeline-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatTooltipModule,
    DragDropModule,
  ],
  templateUrl: './add-pipeline-dialog.component.html',
  styleUrl: './add-pipeline-dialog.component.css',
  encapsulation: ViewEncapsulation.None
})
export class AddPipelineDialogComponent {

  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  // Salescrm Firestore instance (initialized in ngOnInit after guard.initializeSalescrm())
  private salescrmDb!: Firestore;

  categoriesList: any[] = [];
  originalCategories: Set<string> = new Set();
  dealStagesList: DealStage[] = [];
  selectedStageIds: string[] = [];
  ownerlist: any[] = [];
  leadslist: any[] = [];

  hidecategory: boolean = true;
  isDeveloper: boolean = false;

  pipelineform: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<AddPipelineDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formbuilder: FormBuilder,
    private guard: AuthguardService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    // Default the creator into the visibility list when adding a new
    // pipeline, so they can see what they just created on the listing
    // screen (which filters by pipeline_visibleto.includes(salescrmUserId)).
    const defaultVisibleTo: string[] =
      this.data?.type === 'add' && this.data?.currentSalescrmUserId
        ? [this.data.currentSalescrmUserId]
        : [];

    this.pipelineform = this.formbuilder.group({
      pipelinename: [null, { validators: [Validators.required], updateOn: 'change' }],
      stages: [[], { validators: [Validators.required], updateOn: 'change' }],
      columns: [[]],
      category: [null, { validators: [Validators.required], updateOn: 'change' }],
      description: [null],
      delete: [false],
      pipelinedynamic: [false],
      assignleads: [false],
      presaleowner: [[]],
      pipeline_visibleto: [defaultVisibleTo],
      hidden: [false],
      journeyexperience: [false],
    });
  }

  async ngOnInit() {
    await this.guard.initializeSalescrm();
    this.salescrmDb = getFirestore(getApp('salescrm'));

    const isEdit = this.data?.type === 'edit' && !!this.data?.pipelineid;

    // Patch form ASAP from the pipeline doc — don't wait for supporting
    // dropdown data (categories, owners, stages, lead fields). Selected
    // values bind by ID/string, so dropdowns will highlight the right
    // options once their lists arrive.
    if (isEdit) {
      const pipelineRef = doc(this.salescrmDb, 'pipelines', this.data.pipelineid);
      getDoc(pipelineRef).then(snap => {
        if (snap.exists()) this.patchPipelineForm(snap.data());
      }).catch(err => console.error('[add-pipeline] pipeline doc load failed:', err));
    }

    // Run all supporting data loads in parallel.
    Promise.all([
      this.loadCategories(),
      this.loadDealStages(),
      this.loadOwners(),
      this.loadLeadFields(),
      this.checkDeveloperAccess(),
    ]).catch(err => console.error('[add-pipeline] supporting data load failed:', err));
  }

  private patchPipelineForm(details: any) {
    this.selectedStageIds = details['dealstageIds'] || [];
    this.pipelineform.patchValue({
      pipelinename: details['pipelinename'],
      columns: details['columns'],
      stages: this.selectedStageIds,
      category: [null, undefined, ''].includes(details['category']) ? null : details['category'],
      description: [null, undefined, ''].includes(details['description']) ? null : details['description'],
      delete: details['delete'] == false ? true : false,
      pipelinedynamic: details['pipelinedynamic'] || false,
      assignleads: details['assignleads'] || false,
      presaleowner: details['presaleowner'],
      pipeline_visibleto: details['pipeline_visibleto'] || [],
      hidden: details['hidden'] || false,
      journeyexperience: details['journeyexperience'] || false,
    });
  }

  async loadCategories() {
    const categoryRef = doc(this.salescrmDb, 'pipeline_categories', 'categories');
    const categoryDoc = await getDoc(categoryRef);
    if (categoryDoc.exists()) {
      this.categoriesList = categoryDoc.data()['categories'] || [];
      this.originalCategories = new Set<string>(this.categoriesList);
    }
  }

  async loadDealStages() {
    const dealStagesCollection = collection(this.salescrmDb, 'dealstage');
    const q = query(dealStagesCollection, orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    this.dealStagesList = [];
    snapshot.forEach(d => {
      this.dealStagesList.push({ id: d.id, ...d.data() } as DealStage);
    });
  }

  async loadOwners() {
    const userRef = collection(this.salescrmDb, 'userRegister');
    const snapshot = await getDocs(query(userRef, orderBy('owner', 'asc')));
    this.ownerlist = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async loadLeadFields() {
    const leadRef = collection(this.salescrmDb, 'leads');
    const snapshot = await getDocs(query(leadRef, limit(1)));
    const fields = new Set<string>();
    snapshot.forEach(d => Object.keys(d.data()).forEach(k => fields.add(k)));
    this.leadslist = Array.from(fields);
  }

  async checkDeveloperAccess() {
    try {
      const userRolesRef = collection(this.salescrmDb, 'userRoles');
      const q = query(userRolesRef, where('profile_uid', '==', this.guard.uid));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        this.isDeveloper = querySnapshot.docs[0].data()['crm_manager'] === true;
      }
    } catch {
      this.isDeveloper = false;
    }
  }

  getStageNameById(stageId: string): string {
    const stage = this.dealStagesList.find(s => s.id === stageId);
    return stage ? stage.stageName : '';
  }

  onStageSelectionChange(selectedIds: string[]) {
    this.selectedStageIds = selectedIds;
    this.updateFormStages();
  }

  removeStageFromSelection(stageId: string) {
    this.selectedStageIds = this.selectedStageIds.filter(id => id !== stageId);
    this.updateFormStages();
  }

  updateFormStages() {
    const selectedStageNames = this.selectedStageIds.map(id => this.getStageNameById(id));
    this.pipelineform.get('stages')?.setValue(selectedStageNames);
  }

  dropStage(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.selectedStageIds, event.previousIndex, event.currentIndex);
    this.updateFormStages();
  }

  addCategoryFromInput(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const input = event.target as HTMLInputElement;
      this.flushCategoryInput(input);
    }
  }

  /** Auto-add the typed text as a chip when the user tabs/clicks away. */
  addCategoryOnBlur(input: HTMLInputElement): void {
    this.flushCategoryInput(input);
  }

  /** Push the input's current value into the chip list (deduped, trimmed). */
  private flushCategoryInput(input: HTMLInputElement): void {
    const value = (input.value || '').trim();
    if (!value) return;
    if (this.categoriesList.includes(value)) {
      input.value = '';
      return;
    }
    this.categoriesList = [...this.categoriesList, value];
    input.value = '';
  }

  addCategory(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) this.categoriesList = [...this.categoriesList, value];
    event.chipInput!.clear();
  }

  isOriginalCategory(item: string): boolean {
    return this.originalCategories.has(item);
  }

  removeCategory(index: number): void {
    const item = this.categoriesList[index];
    if (this.isOriginalCategory(item)) return;
    this.categoriesList = this.categoriesList.filter((_: any, i: number) => i !== index);
  }

  async saveCategory(input?: HTMLInputElement) {
    // Flush any text the user typed but didn't press Enter on.
    if (input) this.flushCategoryInput(input);

    const pipelineCategoriesRef = doc(this.salescrmDb, 'pipeline_categories', 'categories');
    await updateDoc(pipelineCategoriesRef, { categories: this.categoriesList }).then(() => {
      this.snackBar.open('Category Updated Successfully', 'Close', { duration: 3000 });
      this.hidecategory = true;
      this.originalCategories = new Set<string>(this.categoriesList);
    }).catch(() => {
      this.snackBar.open('Error updating category', 'Close', { duration: 3000 });
    });
  }

  /**
   * Always include the current salescrm user in the visibility list so the
   * creator can find the pipeline they just made. De-duplicates and drops
   * empty entries.
   */
  private buildVisibleToList(raw: any): string[] {
    const list: string[] = Array.isArray(raw) ? raw.filter(x => !!x) : [];
    const me = this.data?.currentSalescrmUserId;
    if (me && !list.includes(me)) list.push(me);
    return list;
  }

  /** Compute the list of missing required fields for a friendly error message. */
  private missingFields(): string[] {
    const c = this.pipelineform.controls;
    const missing: string[] = [];
    if (c['pipelinename'].invalid) missing.push('Pipeline name');
    if (c['category'].invalid) missing.push('Category');
    if (this.selectedStageIds.length === 0) missing.push('At least one stage');
    return missing;
  }

  async save(value: any) {
    console.log('[add-pipeline] save invoked', {
      type: this.data?.type,
      valid: this.pipelineform.valid,
      selectedStageIds: this.selectedStageIds,
      salescrmDbReady: !!this.salescrmDb,
      value,
    });

    // Pre-flight: surface missing fields instead of silently doing nothing.
    const missing = this.missingFields();
    if (missing.length > 0) {
      this.pipelineform.markAllAsTouched();
      this.snackBar.open(
        'Missing required: ' + missing.join(', '),
        'Close',
        { duration: 4000 }
      );
      return;
    }

    if (!this.salescrmDb) {
      this.snackBar.open(
        'Salescrm not connected. Reload the page and try again.',
        'Close',
        { duration: 4000 }
      );
      return;
    }

    try {
      const id = this.data?.type === 'add'
        ? doc(collection(this.salescrmDb, 'pipelines')).id
        : this.data.pipelineid;

      const pipelineRef = doc(this.salescrmDb, 'pipelines', id);
      const selectedStageNames = this.selectedStageIds.map(sid => this.getStageNameById(sid));

      const pipelineData: any = {
        id,
        updatedDate: new Date(),
        pipelinename: (value.pipelinename || '').toString().toLowerCase(),
        dealstage: selectedStageNames,
        dealstageIds: this.selectedStageIds,
        category: value.category,
        columns: Array.isArray(value.columns) ? value.columns : [],
        delete: value.delete == true ? false : true,
        description: value.description ?? null,
        pipelinedynamic: !!value.pipelinedynamic,
        assignleads: !!value.assignleads,
        presaleowner: Array.isArray(value.presaleowner) ? value.presaleowner : [],
        pipeline_visibleto: this.buildVisibleToList(value.pipeline_visibleto),
        hidden: !!value.hidden,
        journeyexperience: !!value.journeyexperience,
      };

      if (this.data?.type === 'add') {
        pipelineData['createdDate'] = new Date();
        pipelineData['createdby'] = this.guard.uid;
        pipelineData['pipelineid'] = id;
      }

      console.log('[add-pipeline] writing to salescrm /pipelines/' + id, pipelineData);

      if (this.data?.type === 'add') {
        await setDoc(pipelineRef, pipelineData);
      } else {
        await updateDoc(pipelineRef, pipelineData);
      }

      this.snackBar.open(
        this.data?.type === 'add' ? 'Pipeline created' : 'Pipeline updated',
        'Close',
        { duration: 2500 }
      );
      this.dialogRef.close(true);
    } catch (err: any) {
      console.error('[add-pipeline] save failed:', err);
      this.snackBar.open(
        'Save failed: ' + (err?.message || err || 'unknown error'),
        'Close',
        { duration: 5000 }
      );
    }
  }
}
