import { Component, inject, OnInit, Inject } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { collection, collectionData, doc, Firestore, updateDoc, deleteDoc, addDoc, query, orderBy, getDocs, Unsubscribe, onSnapshot, where, getDoc } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ReactiveFormsModule } from '@angular/forms';
import { Timestamp } from 'firebase/firestore';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatCardModule,
    MatDividerModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule
  ],
  templateUrl: './quiz.component.html',
  styleUrl: './quiz.component.css'
})
export class QuizComponent implements OnInit {
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  quizForm!: FormGroup;
  quizCollection = collection(this.firestore, 'quiz');
  quizList: any[] = [];
  isEdit = false;
  editingId: string | null = null;

  eventList:any[]=[]
  selectedEventId: string;
  arenaeventsSubscription: Unsubscribe | null = null;
  productsList: {
    productRef: any;
    productName: string;
  }[] = [];
  productloaded:boolean = false;
  productloading:boolean = false;
  bigCohorts: any[] = [];


  constructor(
    public dialogRef: MatDialogRef<QuizComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
      const eventRef = collection(this.firestore, 'event collection');
      const eventQuery = query(eventRef, orderBy('name'));
      getDocs(eventQuery).then(snap => {      
        this.eventList = snap.docs.map(e => {
        let element = e.data()
        element["id"] = e.id 
        element['ref'] = doc(this.firestore, 'event collection', e.id)
        return element
      })
    })
    this.getCohorts();
  }
  async getCohorts(): Promise<void> {
    const bigCohortsRef = collection(this.firestore, 'big cohorts');
    const q = query(bigCohortsRef, orderBy('createddate', 'desc'));
    const snap = await getDocs(q);

    this.bigCohorts = snap.docs.map(d => ({
      id: d.id,
      ref: d.ref,
      ...d.data()
    }));
  }

  ngOnInit() {
    this.initForm();
    this.fetchQuiz();
    this.handleTypeChange(); 
    if (this.data) {
      setTimeout(() => {
        this.editQuiz(this.data);
      });
    }
  }
  ngOnDestroy(){
     if (this.arenaeventsSubscription) {
      this.arenaeventsSubscription();
      this.arenaeventsSubscription = null;
    }
  }
async onEventSelect(event: any): Promise<void> {
  this.productloaded = false;
  this.productloading = true;
  this.productsList = [];

  const eventDocRef = event.value;

  return new Promise((resolve) => {
    const arenaeventsQuery = query(
      collection(this.firestore, 'arena events'),
      where('eventref', '==', eventDocRef)
    );

    this.arenaeventsSubscription = onSnapshot(arenaeventsQuery, async (snapshot) => {
      const productPromises = snapshot.docs
        .map(snap => snap.data())
        .filter(d => d['productref'])
        .map(async (d: any) => {
          const productSnap = await getDoc(d.productref);
          return productSnap.exists()
            ? {
                productRef: d.productref,
                productName: productSnap.data()['product']
              }
            : null;
        });

      const results = await Promise.all(productPromises);
      this.productsList = results.filter(Boolean);

      this.productloading = false;
      this.productloaded = true;

      resolve();
    });
  });
}


  handleTypeChange() {
    this.quizForm.get('type')?.valueChanges.subscribe(type => {
      this.optionsArray.controls.forEach(option => {
        const cohortCtrl = option.get('cohortref');
        if (type === 'withoutResponse') {
          cohortCtrl?.enable();
        } else {
          cohortCtrl?.reset();
          cohortCtrl?.disable();
        }
      });
      
      const eventCtrl = this.quizForm.get('eventref');
      const productCtrl = this.quizForm.get('productref');
      const activeCtrl = this.quizForm.get('active');
      
      if (type === 'withoutResponse') {
        eventCtrl?.setValidators([Validators.required]);
        // Remove productref validator to make it optional
        productCtrl?.clearValidators();
        eventCtrl?.enable();
        productCtrl?.enable();
        activeCtrl?.enable();
        activeCtrl?.setValue(true);
        this.optionsArray.clearValidators();
        this.optionsArray.updateValueAndValidity();
        this.optionsArray.controls.forEach(c =>
          c.get('isCorrect')?.setValue(false)
        );
      } else {
        eventCtrl?.reset();
        productCtrl?.reset();
        activeCtrl?.reset();
        eventCtrl?.clearValidators();
        productCtrl?.clearValidators();
        eventCtrl?.disable();
        productCtrl?.disable();
        activeCtrl?.disable();
        this.optionsArray.setValidators(this.atLeastOneCorrectValidator);
        this.optionsArray.updateValueAndValidity();
      }

      eventCtrl?.updateValueAndValidity();
      productCtrl?.updateValueAndValidity();
      activeCtrl?.updateValueAndValidity();
    });
  }



  initForm() {
    this.quizForm = this.fb.group({
      question: ['', [Validators.required, Validators.minLength(10)]],
      type: ['withResponse', Validators.required],
      eventref: [null],
      productref: [[], []],
      // productref: [null],
      active: [false], 
      options: this.fb.array([
        this.createOption(),
      ], [this.atLeastOneCorrectValidator])
    });
    this.quizForm.get('active')?.disable();
  }

  get optionsArray(): FormArray {
    return this.quizForm.get('options') as FormArray;
  }

  createOption(): FormGroup {
    return this.fb.group({
      text: ['', [Validators.required, Validators.minLength(1)]],
      explanation: [''],
      isCorrect: [false],
      cohortref: [null] 
    });
  }
  atLeastOneCorrectValidator(formArray: FormArray) {
    const hasCorrect = formArray.controls.some(control => 
      control.get('isCorrect')?.value === true
    );
    return hasCorrect ? null : { noCorrectAnswer: true };
  }

  addOption() {
    // if (this.optionsArray.length < 10) {
      this.optionsArray.push(this.createOption());
    // } else {
    //   this.snackBar.open('Maximum 10 options allowed', 'Close', { duration: 3000 });
    // }
  }

  removeOption(index: number) {
    if (this.optionsArray.length > 1) {
      this.optionsArray.removeAt(index);
    } else {
      this.snackBar.open('Minimum 1 options required', 'Close', { duration: 3000 });
    }
  }

  async fetchQuiz() {
    collectionData(this.quizCollection, { idField: 'id' }).subscribe(data => {
      this.quizList = data;
    });
  }

  async saveQuiz() {
    if (this.quizForm.invalid) {
      this.markFormGroupTouched(this.quizForm);
      
      if (
        this.quizForm.get('type')?.value === 'withResponse' &&
        this.optionsArray.hasError('noCorrectAnswer')
      ) {
        this.snackBar.open(
          'Please select at least one correct answer',
          'Close',
          { duration: 3000 }
        );
        return;
      }

      return;
    }
    const formValue = this.quizForm.value;
    if (formValue.productref?.length === 0) {
      formValue.productref = null;
    }

    try {
      if (this.isEdit && this.editingId) {
        const quizDoc = doc(this.firestore, 'quiz', this.editingId);
        await updateDoc(quizDoc, this.quizForm.value);
        this.snackBar.open('Quiz updated successfully!', 'Close', { duration: 3000 });
      } else {
        const docRef = await addDoc(this.quizCollection, {
          ...this.quizForm.value,
          createdAt: Timestamp.now()
        });
        await updateDoc(docRef, { docId: docRef.id });
        this.snackBar.open('Quiz created successfully!', 'Close', { duration: 3000 });
      }

      this.resetForm();
    } catch (error) {
      this.snackBar.open('Error saving quiz. Please try again.', 'Close', { duration: 3000 });
    }
  }


  async editQuiz(quiz: any) {
    this.isEdit = true;
    this.editingId = quiz.id;
    if (!this.bigCohorts.length) {
      await this.getCohorts();
    }

    this.quizForm.get('eventref')?.enable();
    this.quizForm.get('productref')?.enable();
    this.quizForm.get('active')?.enable();

    this.quizForm.patchValue({
      question: quiz.question,
      type: quiz.type || 'withResponse',
      active: quiz.active ?? false
    });

    if (quiz.type === 'withoutResponse') {
      await this.patchEventAndProduct(quiz);
    }


    this.optionsArray.clear();

    quiz.options.forEach((opt: any) => {
      const matchedCohort = this.bigCohorts.find(
        c => c.ref.path === opt.cohortref?.path
      );

      this.optionsArray.push(this.fb.group({
        text: [opt.text, [Validators.required, Validators.minLength(1)]],
        explanation: [opt.explanation],
        isCorrect: [opt.isCorrect],
        cohortref: [matchedCohort ? matchedCohort.ref : null] // ✅ KEY FIX
      }));
    });
  }

  async patchEventAndProduct(quiz: any) {
    const matchedEvent = this.eventList.find(
      e => e.ref?.path === quiz.eventref?.path
    );
    if (!matchedEvent) return;
    this.quizForm.get('eventref')?.setValue(matchedEvent.ref);
    await this.onEventSelect({ value: matchedEvent.ref });
    const selectedProducts = this.productsList
      .filter(p =>
        quiz.productref?.some((ref: any) => ref.path === p.productRef.path)
      )
      .map(p => p.productRef);

    this.quizForm.get('productref')?.setValue(selectedProducts);

  }



  setCorrectAnswer(index: number): void {
    this.optionsArray.controls.forEach((control, i) => {
      control.get('isCorrect')?.setValue(i === index);
    });
  }

  async deleteQuiz(id: string) {
    try {
      const quizDoc = doc(this.firestore, 'quiz', id);
      await deleteDoc(quizDoc);
      this.snackBar.open('Quiz deleted successfully!', 'Close', { duration: 3000 });
    } catch (error) {
      this.snackBar.open('Error deleting quiz. Please try again.', 'Close', { duration: 3000 });
    }
  }

  resetForm() {
    this.quizForm.reset();
    this.optionsArray.clear();
    for (let i = 0; i < 2; i++) this.optionsArray.push(this.createOption());
    this.isEdit = false;
    this.editingId = null;
  }

  closeDialog() {
    this.dialogRef.close();
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        control.controls.forEach(c => {
          if (c instanceof FormGroup) {
            this.markFormGroupTouched(c);
          }
        });
      }
    });
  }

  getErrorMessage(controlName: string): string {
    const control = this.quizForm.get(controlName);
    if (control?.hasError('required')) {
      return `${controlName} is required`;
    }
    if (control?.hasError('minlength')) {
      return `${controlName} must be at least ${control.errors?.['minlength'].requiredLength} characters`;
    }
    return '';
  }

  getOptionErrorMessage(index: number, controlName: string): string {
    const control = this.optionsArray.at(index).get(controlName);
    if (control?.hasError('required')) {
      return `${controlName} is required`;
    }
    if (control?.hasError('minlength')) {
      return `${controlName} must be at least ${control.errors?.['minlength'].requiredLength} characters`;
    }
    return '';
  }
}