import { Component, inject,OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { Inject } from '@angular/core'; 
import { collection,onSnapshot,query, orderBy, collectionData,collectionSnapshots, Firestore,doc,setDoc,getDocs, where } from '@angular/fire/firestore';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { merge, Subject, takeUntil } from 'rxjs';
import { arrayUnion, writeBatch } from 'firebase/firestore';
@Component({
  selector: 'app-add-pending-action',
  imports: [CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatSelectModule,
    FormsModule
  ],
  standalone: true,
  templateUrl: './add-pending-action.component.html',
  styleUrl: './add-pending-action.component.css'
})
export class AddPendingActionComponent implements OnInit {
  private formbuilder = inject(FormBuilder);
  activityForm : FormGroup = this.formbuilder.group ({
    selectedprofile: [null, {validators: [Validators.required], updateOn:"change"}],
    selectedform: [[]],
    selectedaction: [[]],
    videoaskpending: [[]],
    quiz:[[]]
  })
  profileList = [];
  deliveryFormList = [];
  filteredDeliveryFormList = []
  quizList = [];
  filteredQuizList = []
  filteredArenaVideoAskList = [];
  arenaVideoAskList = [];

  mandatoryAction = {};

  searchvideoask = new FormControl('');
  searchdeliveryform = new FormControl('');
  searchQuiz = new FormControl('');
  textSubscription = new Subject<void>();

  disableProfile = false

  constructor(
    private firestore: Firestore,
    private dialogRef: MatDialogRef<AddPendingActionComponent>,
    @Inject(MAT_DIALOG_DATA) public dialogdata: any
  ) {

    console.log(this.dialogdata);

    this.profileList = this.dialogdata["bulk"] == true ? [] : this.dialogdata["profilelist"].sort((a, b) => a["name"].localeCompare(b["name"]));
    this.deliveryFormList = this.dialogdata["formlist"] ?? [];
    this.filteredDeliveryFormList = [...this.deliveryFormList];
    this.quizList = this.dialogdata["quiz"] ?? [];
    this.filteredQuizList = [...this.quizList];
    this.mandatoryAction = this.dialogdata["mandatoryaction"] ?? {"monthlyinterimreport": "Monthly Interim Report"};
    this.arenaVideoAskList = this.dialogdata['videoask'] ?? [];
    this.filteredArenaVideoAskList = [...this.arenaVideoAskList];

    if(this.dialogdata["data"] != null){
      var patchData = this.dialogdata["data"];
      this.disableProfile = true;
      this.activityForm.patchValue({
        selectedprofile: patchData["profileid"],
        selectedform: (patchData["formspending"] ?? []).map(e => e.id),
        quiz: (patchData["quiz"] ?? []).map(e => e.id),
        selectedaction: patchData["mandatoryaction"],
        videoaskpending: (patchData['videoaskpending'] ?? []).map(e => e.id)
      });
      this.activityForm.controls["selectedprofile"].disable()
    }
    else if(this.dialogdata["bulk"] == true){
      this.disableProfile = true;
      this.activityForm.patchValue({
        selectedprofile: this.dialogdata["profilelist"],
      });
      this.activityForm.controls["selectedprofile"].disable()
    }


    // Arena Video Ask
    if(this.arenaVideoAskList.length == 0){
      const arenaVideoAskRef = collection(this.firestore, 'arenavideoask');
      const Query = query(arenaVideoAskRef, orderBy('title'));
      getDocs(Query).then(querySnapshot =>{
        querySnapshot.docs.forEach(doc =>{
          var data = doc.data()
          this.arenaVideoAskList.push({...data, docid: doc.id})
        })
        this.filteredArenaVideoAskList = [...this.arenaVideoAskList]
      })
    }

    // Form
    if(this.deliveryFormList.length == 0){
      const formsRef = collection(this.firestore, 'delivery forms');
      const Query = query(formsRef, orderBy('formname'));
      getDocs(Query).then(formsSnapshot =>{
        formsSnapshot.forEach(form => {
          const formData = form.data();
          this.deliveryFormList.push(formData);
        });
        this.filteredDeliveryFormList = [...this.deliveryFormList]
      });
    }

    // quiz
    if (this.quizList.length === 0) {
      const quizRef = collection(this.firestore, 'quiz');
      const q = query(quizRef, where('type', '==', 'withoutResponse'));
      getDocs(q).then(quizSnapshot => {
        const allQuizzes = quizSnapshot.docs.map(doc => ({
          ...doc.data(),
          docId: doc.id
        }));
        this.quizList = allQuizzes.filter(quiz => quiz['active'] === true);
        this.filteredQuizList = [...this.quizList];
      });

    }


  }

  ngOnInit(): void {
    // Subscribe to search control changes
    this.searchvideoask.valueChanges.pipe(takeUntil(this.textSubscription)).subscribe(searchTerm => {
      this.filterArenaVideoAsk(searchTerm || '');
    });
    this.searchdeliveryform.valueChanges.pipe(takeUntil(this.textSubscription)).subscribe(searchTerm => {
      this.filterDeliveryForm(searchTerm || '');
    });
    this.searchQuiz.valueChanges.pipe(takeUntil(this.textSubscription)).subscribe(searchTerm => {
      this.filterQuiz(searchTerm || '');
    });
    
  }

  ngOnDestroy(){
    this.textSubscription.next()
    this.textSubscription?.complete()
  }

  async onSubmit() {
    const value = this.activityForm.getRawValue();
    console.log(value);
    if (this.activityForm.valid) {
      const formRefs = (value["selectedform"] ?? []).map((formId: string) =>
        doc(this.firestore, 'delivery forms', formId)
      );
      const quizRefs = (value["quiz"] ?? []).map((quizId: string) =>
        doc(this.firestore, 'quiz', quizId)
      );
      const arenaVideoAskRefs = (value["videoaskpending"] ?? []).map((docId: string) =>
        doc(this.firestore, 'arenavideoask', docId)
      );
      

      // Bulk Update
      if(this.dialogdata["bulk"] == true){
        let data =  {
          mandatoryaction: value['selectedaction'],
          formspending: formRefs,
          quiz:arrayUnion(...quizRefs),
          lastupdate: new Date(),
          videoaskpending: arenaVideoAskRefs
        }
        console.log("Batch update",value["selectedprofile"])
        var batch = writeBatch(this.firestore)
        value["selectedprofile"].forEach(profileid =>{
          batch.set(doc(this.firestore, 'appactionpending', profileid),data,{merge:true});
        })
        await batch.commit()
        this.close()
      }
      // Profile-Wise Update
      else{
        let data =  {
          mandatoryaction: value['selectedaction'],
          formspending: formRefs,
          quiz:quizRefs,
          lastupdate: new Date(),
          videoaskpending: arenaVideoAskRefs
        }
        await setDoc(doc(this.firestore, 'appactionpending', value['selectedprofile']),data);
        this.close();
      }
    }
  };

  filterArenaVideoAsk(searchTerm: string) {
    if (!searchTerm) {
      this.filteredArenaVideoAskList = [...this.arenaVideoAskList];
      return;
    }
    
    this.filteredArenaVideoAskList = this.arenaVideoAskList.filter(item => 
      (item.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.description?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }

  filterDeliveryForm(searchTerm: string) {
    if (!searchTerm) {
      this.filteredDeliveryFormList = [...this.deliveryFormList];
      return;
    }
    
    this.filteredDeliveryFormList = this.deliveryFormList.filter(item => 
      (item.formname?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }

  filterQuiz(searchTerm: string) {
    if (!searchTerm) {
      this.filteredQuizList = [...this.quizList];
      return;
    }
    
    this.filteredQuizList = this.quizList.filter(item => 
      (item.question?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }
  
  close(){
    this.dialogRef.close()
  };
  
}