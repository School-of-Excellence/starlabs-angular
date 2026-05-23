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
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import {
  Firestore, collection, collectionData, doc, getDocs,
  getDoc, orderBy, query, setDoc, updateDoc, where
} from '@angular/fire/firestore';
import { AuthguardService } from '../../../authguard.service';
import { Observable } from 'rxjs';

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
    DragDropModule,
  ],
  templateUrl: './add-pipeline-dialog.component.html',
  styleUrl: './add-pipeline-dialog.component.css',
  encapsulation: ViewEncapsulation.None
})
export class AddPipelineDialogComponent {

  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  categoriesList: any[] = [];
  dealStagesList: DealStage[] = [];
  selectedStageIds: string[] = [];
  ownerlist: any[] = [];
  leadslist: any[] = [];
  dealStages$!: Observable<DealStage[]>;

  hidecategory: boolean = true;
  isDeveloper: boolean = false;

  pipelineform: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<AddPipelineDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formbuilder: FormBuilder,
    private firestore: Firestore,
    private guard: AuthguardService,
    private snackBar: MatSnackBar
  ) {
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
      pipeline_visibleto: [[]],
      hidden: [false],
    });
  }

  async ngOnInit() {
    const categoryRef = doc(this.firestore, 'pipeline_categories', 'categories');
    const categoryDoc = await getDoc(categoryRef);
    if (categoryDoc.exists()) {
      this.categoriesList = categoryDoc.data()['categories'];
    }

    await this.loadDealStages();
    await this.checkDeveloperAccess();

    if (this.data?.type === 'edit' && this.data?.pipelineid) {
      const pipelinesRef = doc(this.firestore, 'pipelines', this.data.pipelineid);
      const pipelinesDoc = await getDoc(pipelinesRef);
      if (pipelinesDoc.exists()) {
        const details = pipelinesDoc.data();
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
        });
      }
    }
  }

  async loadDealStages() {
    const dealStagesCollection = collection(this.firestore, 'dealstage');
    const q = query(dealStagesCollection, orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    this.dealStagesList = [];
    snapshot.forEach(d => {
      this.dealStagesList.push({ id: d.id, ...d.data() } as DealStage);
    });
    this.dealStages$ = collectionData(q, { idField: 'id' }) as Observable<DealStage[]>;
    this.dealStages$.subscribe(stages => {
      this.dealStagesList = stages;
    });
  }

  async checkDeveloperAccess() {
    try {
      const userRolesRef = collection(this.firestore, 'userRoles');
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
    if (event.key === 'Enter') {
      event.preventDefault();
      const input = event.target as HTMLInputElement;
      const value = input.value.trim();
      if (value) {
        this.categoriesList = [...this.categoriesList, value];
        input.value = '';
      }
    }
  }

  addCategory(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) this.categoriesList = [...this.categoriesList, value];
    event.chipInput!.clear();
  }

  removeCategory(index: number): void {
    this.categoriesList = this.categoriesList.filter((_: any, i: number) => i !== index);
  }

  async saveCategory() {
    const pipelineCategoriesRef = doc(this.firestore, 'pipeline_categories', 'categories');
    await updateDoc(pipelineCategoriesRef, { categories: this.categoriesList }).then(() => {
      this.snackBar.open('Category Updated Successfully', 'Close', { duration: 3000 });
      this.hidecategory = true;
    }).catch(() => {
      this.snackBar.open('Error updating category', 'Close', { duration: 3000 });
    });
  }

  async save(value: any) {
    const id = this.data?.type === 'add'
      ? doc(collection(this.firestore, 'pipelines')).id
      : this.data.pipelineid;

    const pipelineRef = doc(this.firestore, 'pipelines', id);
    const selectedStageNames = this.selectedStageIds.map(sid => this.getStageNameById(sid));

    const pipelineData: any = {
      id,
      updatedDate: new Date(),
      pipelinename: value.pipelinename.toLowerCase(),
      dealstage: selectedStageNames,
      dealstageIds: this.selectedStageIds,
      category: value.category,
      columns: [null, undefined, ''].includes(value.columns) ? [] : value.columns,
      delete: value.delete == true ? false : true,
      description: value.description,
      pipelinedynamic: value.pipelinedynamic,
      assignleads: value.assignleads,
      presaleowner: value.presaleowner || [],
      pipeline_visibleto: value.pipeline_visibleto || [],
      hidden: value.hidden || false,
    };

    if (this.data?.type === 'add') {
      pipelineData['createdDate'] = new Date();
      pipelineData['createdby'] = this.guard.uid;
      pipelineData['pipelineid'] = id;
    }

    const ref = this.data?.type === 'add'
      ? setDoc(pipelineRef, pipelineData)
      : updateDoc(pipelineRef, pipelineData);

    await ref.then(() => {
      this.snackBar.open('Pipeline Saved Successfully', 'Close', { duration: 3000 });
      this.dialogRef.close(true);
    }).catch(err => {
      this.snackBar.open('Error Saving Pipeline', 'Close', { duration: 3000 });
      console.log(err);
    });
  }
}
