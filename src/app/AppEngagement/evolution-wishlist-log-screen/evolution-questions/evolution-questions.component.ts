import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { Firestore,where, collection, getDocs, query, doc, updateDoc,setDoc, orderBy, CollectionReference,writeBatch, collectionData } from '@angular/fire/firestore';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSort, MatSortModule} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../../authguard.service';
import { MatButtonModule } from '@angular/material/button';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AngularFireStorage } from '@angular/fire/compat/storage';

@Component({
  selector: 'app-evolution-questions',
  standalone: true,
  imports:[CommonModule,MatFormFieldModule,MatIconModule,MatButtonModule,
    MatSlideToggleModule,DragDropModule, MatInputModule,MatSortModule,
    MatTableModule,ReactiveFormsModule,  MatSelectModule, MatOptionModule,
    MatPaginatorModule,],
  templateUrl: './evolution-questions.component.html',
  styleUrls: ['./evolution-questions.component.css']
})
export class EvolutionQuestionsComponent implements OnInit {
  Question: string = '';
  questions: any[] = [];
  questionForm: FormGroup;
  hintforname = "*Use {{participantname}} to include participant's name in the question"
  loading: boolean = true;
  disableButton: boolean = false;
  disableQuestion: boolean = true;
  sno: number = 0; 
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  displayedColumns: string[] = ["sno", "question", "type", "options", "disable"];
  dataSource = new MatTableDataSource();
  dropTable(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.questions, event.previousIndex, event.currentIndex);
    this.updateSerialNumbers();
  }
  updateSerialNumbers() {
    const batch = writeBatch(this.firestore);
    this.questions.forEach((question, index) => {
      const docRef = doc(this.firestore, "evolutionwishlistquestions", question.docid);
      batch.update(docRef, { sno: index + 1 });
    });
    batch.commit()
      .then(() => {
        console.log("S.No updated");
        this.getAllQuestionsAndSerialNumber();
      })
      .catch((error) => {
        console.error("Error", error);
      });
  }//
  constructor(
    public firestore: Firestore, 
    private guard: AuthguardService,
    private storage: AngularFireStorage,
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<EvolutionQuestionsComponent>,
    private fb: FormBuilder
  ) { 
    this.initForm();
  }
  ngOnInit(): void {
    this.getAllQuestionsAndSerialNumber();
  }

  initForm() {
    this.questionForm = this.fb.group({
      question: ['', Validators.required],
      type: ['textarea', Validators.required],
      sno: [{value: this.sno, disabled: true}],
      options: this.fb.array([]),
      videoUrl: ['', []], 
      audioUrl: ['', []], 
      askanswer: [false],
      needAdditionalInput: [false], // Checkbox for additional input
      additionalInputLabel: ['', []] // Input for additional input label  
    });
  
    this.questionForm.get('type').valueChanges.subscribe(value => {
      const videoUrlControl = this.questionForm.get('videoUrl');
      const audioUrlControl = this.questionForm.get('audioUrl');      
      videoUrlControl.clearValidators();
      audioUrlControl.clearValidators();
      
      if (value === 'video') {
        videoUrlControl.setValidators([
          Validators.required,
          Validators.pattern(/^https?:\/\/.+/)
        ]);
      } else if (value === 'audio') {
        audioUrlControl.setValidators([
          Validators.required,
          Validators.pattern(/^https?:\/\/.+/)
        ]);
      }
      
      videoUrlControl.updateValueAndValidity();
      audioUrlControl.updateValueAndValidity();
    
      if (value === 'radio' || value === 'checkbox') {
        if (this.options.length === 0) {
          this.addOption();
        }
      } else {
        this.options.clear();
      }
    });
  }
  get options() {
    return this.questionForm.get('options') as FormArray;
  }

  addOption() {
    this.options.push(this.fb.control('', Validators.required));
  }

  removeOption(index: number) {
    this.options.removeAt(index);
  }
  getAllQuestionsAndSerialNumber() {
    const questionsRef = collection(this.firestore, "evolutionwishlistquestions");
    const q = query(questionsRef, orderBy("sno", "asc"));
    getDocs(q).then(snapshot => {
        if (!snapshot.empty) {
          const data = snapshot.docs.map(doc => ({
            docid: doc.id,
            ...doc.data() as any
          }));
          const lastSno = Math.max(...data.map(q => q.sno), 0);
          this.sno = lastSno + 1;
          if (this.questionForm) {
            this.questionForm.patchValue({
              sno: this.sno
            });
          }
          this.questions = data;
          this.dataSource.data = this.questions;
          this.dataSource.paginator = this.paginator;
        } else {
          this.sno = 1;
          if (this.questionForm) {
            this.questionForm.patchValue({
              sno: this.sno
            });
          }
        }
  
        this.disableQuestion = false;
      })
      .catch(error => {
        console.error("Error fetching data:", error);
        this.sno = 1;
        if (this.questionForm) {
          this.questionForm.patchValue({
            sno: this.sno
          });
        }
      });
  }
  toggleQuestionStatus(element: any) {
    const questionRef = doc(this.firestore, "evolutionwishlistquestions", element.docid);
    updateDoc(questionRef, {
        enabled: !element.enabled
        }).then(() => {
        console.log('Question status updated');
        }).catch((error) => {
        console.error('Error updating question status', error);
        });
    }
  addEvolution() {
    if (this.questionForm.invalid) {
      alert('Please fill all required fields');
      return;
    }
    this.disableButton = true;
    this.disableQuestion = true;
    const formValue = this.questionForm.value;
    const questionRefs = doc(collection(this.firestore, "evolutionwishlistquestions"));
    const documentId = questionRefs.id;
    const questionData: any = {
      docid: documentId,
      question: formValue.question,
      type: formValue.type,
      sno: this.sno,
      created: new Date(),
      enabled: true,
    };
    if (formValue.type === 'radio' || formValue.type === 'checkbox') {
      questionData.options = formValue.options;
      if (formValue.needAdditionalInput) {
        questionData.additionalradioinput = formValue.additionalInputLabel; // Add the additional input field
      }
    }
    if (formValue.type === 'video') {
      questionData.videoUrl = formValue.videoUrl;
      questionData.askanswer = formValue.askanswer;
    }
    if (formValue.type === 'audio') {
      questionData.audioUrl = formValue.audioUrl;
      questionData.askanswer = formValue.askanswer;
    }
    const questionRef = doc(this.firestore, "evolutionwishlistquestions", documentId);
    setDoc(questionRef, questionData)
      .then(() => {
        this.disableButton = false;
        console.log('added');
        this.questionForm.reset({
          type: 'textarea',
          sno: this.sno + 1,
          videoUrl: '',
          audioUrl: '',
          askanswer: false,
          needAdditionalInput: false, // Reset the checkbox
          additionalInputLabel: '' // Reset the additional input label  
        });
        this.options.clear();
        this.getAllQuestionsAndSerialNumber();
        this.disableQuestion = false;
      })
      .catch((error) => {
        console.error('Error', error);
        this.disableButton = false;
      });
    }
  }
  // getAllQuestionsAndSerialNumber() {
  //   this.firestore.collection("evolutionwishlistquestions",ref => ref.orderBy("sno", "asc"))
  //     .get()
  //     .toPromise()
  //     .then(snapshot => {
  //       if (!snapshot.empty) {
  //         const data = snapshot.docs.map(doc => ({
  //           docid: doc.id,
  //           ...doc.data() as any
  //         }));
  //         const lastSno = Math.max(...data.map(q => q.sno), 0);
  //         this.sno = lastSno + 1;
  //         this.questions = data;
  //         this.dataSource.data = this.questions;
  //         this.dataSource.paginator = this.paginator;
  //         // this.dataSource.sort = this.sort;
  //       } else {
  //         this.sno = 1;
  //       }
  
  //       this.disableQuestion = false;
  //     })
  //     .catch(error => {
  //       console.error("Error fetching data:", error);
  //       this.sno = 1;
  //     });
  // }
  // addEvolution() {
  //   this.disableButton = true;
  //   this.disableQuestion = true;
  //   if (!this.Question) {
  //     alert('Please create the question and save');
  //     this.disableButton = false;
  //     this.disableQuestion = false;
  //     return;
  //   }
