import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Component, OnInit, inject } from '@angular/core';
import { addDoc, collection, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, where } from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

type Stage = { stagename: string; stagetype: string; refid: string };

@Component({
  selector: 'app-evolution-prep-variation',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DragDropModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './evolutionprep-variation.component.html',
  styleUrl: './evolutionprep-variation.component.css',
})
export class EvolutionPrepVariationComponent implements OnInit {
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);

  stageTypes = [
    { value: 'ael', label: 'AEL screen' },
    { value: 'form', label: 'Form' },
    { value: 'videoask', label: 'VideoAsk' },
  ];

  variations: any[] = [];
  forms: any[] = [];
  videoAsks: any[] = [];
  loading = true;
  loadError = '';

  editorOpen = false;
  editingId: string | null = null;
  saving = false;
  errors: string[] = [];
  deleteTarget: any = null;

  stages = new FormArray<FormGroup>([]);
  editor = this.fb.group({ variationname: '', stages: this.stages });

  ngOnInit(): void {
    this.loadAll();
  }

  async loadAll() {
    this.loading = true;
    this.loadError = '';
    try {
      const [v, f, a] = await Promise.all([
        getDocs(query(collection(this.firestore, 'evolution prep variation'), orderBy('variationname'))),
        getDocs(query(collection(this.firestore, 'delivery forms'), orderBy('formname'))),
        getDocs(query(collection(this.firestore, 'arenavideoask'), orderBy('title'))),
      ]);
      this.variations = v.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.forms = f.docs.map((d) => ({ id: d.id, label: d.data()['formname'] }));
      this.videoAsks = a.docs.map((d) => ({ id: d.id, label: d.data()['title'] }));
    } catch (error) {
      console.error(error);
      this.loadError = 'Could not load variations. Try again.';
    }
    this.loading = false;
  }

  openNew() {
    this.editingId = null;
    this.errors = [];
    this.editor.patchValue({ variationname: '' });
    this.stages.clear();
    this.addStage();
    this.editorOpen = true;
  }

  openEdit(row: any) {
    this.editingId = row.id;
    this.errors = [];
    this.editor.patchValue({ variationname: row.variationname });
    this.stages.clear();
    row.stages.forEach((s: any) => this.addStage(s));
    this.editorOpen = true;
  }

  addStage(s: any = {}) {
    this.stages.push(
      this.fb.nonNullable.group({
        stagename: s.stagename ?? '',
        stagetype: s.stagetype ?? 'form',
        refid: s.reference?.id ?? '',
      }),
    );
  }

  removeStage(i: number) {
    this.stages.removeAt(i);
  }

  drop(e: CdkDragDrop<unknown>) {
    const group = this.stages.at(e.previousIndex);
    this.stages.removeAt(e.previousIndex);
    this.stages.insert(e.currentIndex, group);
  }

  onTypeChange(group: FormGroup) {
    group.controls['refid'].setValue('');
  }

  async save() {
    const name = (this.editor.value.variationname ?? '').trim();
    const rows = this.stages.getRawValue() as Stage[];

    this.errors = [];
    if (!name) {
      this.errors.push('Enter a variation name.');
    }
    if (rows.length === 0) {
      this.errors.push('Add at least one stage.');
    }
    rows.forEach((s, i) => {
      if (!s.stagename.trim()) {
        this.errors.push(`Stage ${i + 1}: enter a stage name.`);
      }
      if (s.stagetype !== 'ael' && !s.refid) {
        this.errors.push(`Stage ${i + 1}: choose a reference.`);
      }
    });
    if (this.errors.length > 0) {
      return;
    }

    this.saving = true;
    try {
      const data = {
        variationname: name,
        stages: rows.map((s) => ({
          stagename: s.stagename.trim(),
          stagetype: s.stagetype,
          reference: s.stagetype === 'ael' ? null : doc(this.firestore, s.stagetype === 'form' ? 'delivery forms' : 'arenavideoask', s.refid),
        })),
      };

      if (this.editingId) {
        await setDoc(doc(this.firestore, 'evolution prep variation', this.editingId), data);
      } else {
        await addDoc(collection(this.firestore, 'evolution prep variation'), data);
      }
      this.editorOpen = false;
      await this.loadAll();
    } catch (error) {
      console.error(error);
      this.errors = ['Could not save. Try again.'];
    }
    this.saving = false;
  }

  async confirmDelete() {
    try {
      await deleteDoc(doc(this.firestore, 'evolution prep variation', this.deleteTarget.id));
      this.deleteTarget = null;
      await this.loadAll();
    } catch (error) {
      console.error(error);
    }
  }
}
