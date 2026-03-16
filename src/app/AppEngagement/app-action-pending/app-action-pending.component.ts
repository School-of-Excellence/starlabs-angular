import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { collection,onSnapshot,query, orderBy, collectionSnapshots, Firestore, getDocs } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { MatDialog } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { AddPendingActionComponent } from './add-pending-action/add-pending-action.component';
@Component({
  selector: 'app-app-action-pending',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule
  ],
  templateUrl: './app-action-pending.component.html',
  styleUrl: './app-action-pending.component.css'
})
export class AppActionPendingComponent implements OnInit{
 @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  profileList = [];
  deliveryFormList = [];
  quizlist = [];
  arenaVideoAskList = [];
  displayedColumns: string[] = ['profilename', 'formname', 'videoaskname', 'mandatory', 'quizquestion','lastupdate', 'edit'];

  mapVideoAsk = {}
  mapForm = {};
  mapQuiz = {};
  mapProfile = {};
  mapMandatoryActions = {
    // "currentael": "Current AEL",
    // "previousael": "Previous AEL",
    // "evolutionprogress": "Evolution Progress",
    "monthlyinterimreport": "Monthly Interim Report"
  };

  appPendingActionList = new MatTableDataSource();
  
  constructor(
    private firestore:Firestore,
    private guard: AuthguardService,
    public dialog: MatDialog,
  ) {
    // guard.getRoles().then(async roles=>{
    //   if(roles["ah"] || roles["admin"] || roles["developer"]){
        this.guard.getProfileMap().then(e => {
          this.mapProfile = e.map;
          this.profileList = e.list
        }).then(() =>{
          this.getAllAction();
          this.getPendingAction();
        });
      // }
    // });
  }
  ngOnInit(): void {}

  async getAllAction() {
    // Form
    const formsRef = collection(this.firestore, 'delivery forms');
    const q = query(formsRef, orderBy('formname'));
    const formsSnapshot = await getDocs(q);
    formsSnapshot.forEach(form => {
      const formData = form.data();
      this.mapForm[form.id] = formData["formname"];
      this.deliveryFormList.push(formData);
    });
    // quiz
    const quizRef = collection(this.firestore, 'quiz');
    const quiz = query(quizRef);
    const quizSnapshot = await getDocs(quiz);
    quizSnapshot.forEach(quizz => {
      const quizData = quizz.data();
      this.mapQuiz[quizz.id] = quizData["question"];
      this.quizlist.push(quizData);
    });

    // Arena Video Ask
    const arenaVideoAskRef = collection(this.firestore, 'arenavideoask');
    const Query = query(arenaVideoAskRef, orderBy('title')); // Order by title or any field you prefer
    const querySnapshot = await getDocs(Query);
    querySnapshot.docs.forEach(doc =>{
      var data = doc.data()
      this.mapVideoAsk[doc.id] = data["title"]
      this.arenaVideoAskList.push({...data, docid: doc.id})
    })
  };

  getPendingAction() {
    const appActionPendingRef = collection(this.firestore, 'appactionpending');

    onSnapshot(appActionPendingRef, (snapshot) => {
      const list: any[] = [];

      snapshot.forEach(document => {
        const docData: any = document.data();

        docData["profilename"] = this.mapProfile[document.id];
        docData["profileid"] = document.id;

        docData["videoaskname"] =
          (docData["videoaskpending"] ?? []).map(e => this.mapVideoAsk[e.id]);

        docData["formname"] =
          (docData["formspending"] ?? []).map(e => this.mapForm[e.id]);

        docData["quizquestion"] =
          (docData["quiz"] ?? []).map(e => this.mapQuiz[e.id]);

        const mandatoryAction = docData["mandatoryaction"] ?? [];
        const hasQuizPending = docData["quizquestion"].length !== 0;

        if (
          docData["formname"].length !== 0 ||
          docData["videoaskname"].length !== 0 ||
          mandatoryAction.length !== 0 ||
          hasQuizPending
        ) {
          list.push(docData);
        }
      });

      this.appPendingActionList.data = list;
      this.appPendingActionList.sort = this.sort;
      this.appPendingActionList.paginator = this.paginator;
    });
  }


  filterTable(value){
    this.appPendingActionList.filter = value;
  };

  updatePendingAction(data){
    this.dialog.open(AddPendingActionComponent, {
      disableClose: true,
      autoFocus: false,
      data: {
        profilelist: this.profileList,
        formlist: this.deliveryFormList,
        quizlist: this.quizlist,
        mandatoryaction: this.mapMandatoryActions,
        videoask: this.arenaVideoAskList,
        data: data
      }
    });
  };
}

