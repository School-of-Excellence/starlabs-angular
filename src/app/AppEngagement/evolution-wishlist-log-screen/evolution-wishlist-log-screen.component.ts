import { Component,ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { AuthguardService } from '../../authguard.service';
import { Firestore,where, collection, getDocs, query, doc, updateDoc, orderBy, CollectionReference, collectionData } from '@angular/fire/firestore';
import { EvolutionWishlistLogComponent } from '../evolution-wishlist-log/evolution-wishlist-log.component';
import { EvolutionQuestionsComponent } from './evolution-questions/evolution-questions.component';
import { inject } from '@angular/core';
import { Router,RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
@Component({
  selector: 'app-evolution-wishlist-log-screen',
  imports: [CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    RouterModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,],
    animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
  templateUrl: './evolution-wishlist-log-screen.component.html',
  styleUrl: './evolution-wishlist-log-screen.component.css'
})
export class EvolutionWishlistLogScreenComponent {
   questionsMap = {};
    mapProfile = {}
    @ViewChild(MatPaginator) paginator: MatPaginator;
    @ViewChild(MatSort) sort: MatSort;
    displayedColumns: string[] = ["name", "type", "created", "status","contacts","sent","wishlist","reinitiate","delete"];
    dataSource = new MatTableDataSource();
    wishlistlogSubscription: Subscription
    questionsOrder = [];
    initiatedCount = 0;
    completedCount = 0;
    notcompletedCount = 0;
    cancelledCount = 0;
    expandedElement: any = null;
    totalSharedContacts: number = 0;
    totalCompletedContacts: number = 0;
    received: boolean = false;
    fullAccess:boolean = false;
    profilesWithInitiatedStatus: Set<string> = new Set<string>();
    constructor(
      public guard: AuthguardService,
      public firestore: Firestore,
      public router: Router,
      public dialog: MatDialog,
      private http: HttpClient,
    ) {
    guard.getRoles().then(async roles=>{
      if(roles["developer"]){
        this.fullAccess = true;
        console.log("Good")
      }
      // var superrole = roles["admin"] || roles["ah"] || roles["developer"]
      // if(superrole){
          const profileRef = collection(firestore, 'profile_data');
          const profileSnapshot = await getDocs(profileRef);
          profileSnapshot.forEach(doc => {
            var data = doc.data()
            this.mapProfile[doc.id] = data["name"]
          })
          const logRef = collection(firestore, 'evolutionwishlistlog') as CollectionReference<any>;
          const logQuery = query(logRef, orderBy('created', 'desc'));
          this.wishlistlogSubscription = collectionData(logQuery, { idField: 'docId' }).subscribe(log => {
          const logList: any[] = [];
          const mostRecentMap = new Map<string, any>();
          this.completedCount = 0
          this.initiatedCount = 0
          this.notcompletedCount = 0
          this.cancelledCount = 0
          this.totalSharedContacts = 0
          this.totalCompletedContacts = 0 
          this.profilesWithInitiatedStatus.clear()
          log.forEach(data=>{
            if (data["status"] === 'initiated') {
              this.profilesWithInitiatedStatus.add(data["profileid"]);
            }
            data["name"] = this.mapProfile[data["profileid"]]
            // data["created"] = data["created"].toDate()
            if (data["created"]) {
              data["created"] = data["created"].toDate();
            } else {
              data["created"] = null;
            }
            data["status"] = data["status"]?.toString()
            data["type"] = data["type"]?.toString()
            data["contacts"] = data["contacts"];
            data["received"] = data["received"]?.toDate()
            data["sent"] = data["sent"]?.toDate()
            data["completed"] = data["completed"]?.toDate()
            data["docid"] = data["docid"]?.toString()
            data["closedbeforeshare"] = data["closedbeforeshare"]
            data["disableReinitiate"] = this.profilesWithInitiatedStatus.has(data["profileid"]);
            if (data["contacts"] && Array.isArray(data["contacts"])) {
              data["submittedCount"] = data["contacts"].filter(contact => contact.submitted === true).length;
              if (data['status'] === 'sended' || data['status'] === 'completed') {
                this.totalSharedContacts += data["contacts"].length;
              }
              this.totalCompletedContacts += data["submittedCount"];
            } else {
              data["submittedCount"] = 0;
            }
            const existingEntry = mostRecentMap.get(data["profileid"]);
            if (!existingEntry || data["created"] > existingEntry["created"]) {
              mostRecentMap.set(data["profileid"], data);
            }
            if (data['status'] == 'completed') {
              this.completedCount ++;
            } else if (data['status'] == 'initiated') {
              this.initiatedCount ++
            } else if (data['status'] == 'sended') {
              this.notcompletedCount ++
            } else if (data['status'] == 'cancelled') {
              this.cancelledCount ++
            }
            // logList.push(data)
          })
          log.forEach(data => {
            data["isMostRecent"] = mostRecentMap.get(data["profileid"]) === data;
            logList.push(data);
          });
          this.dataSource.data = logList
          this.dataSource.sort = this.sort
          this.dataSource.paginator = this.paginator
        })
        this.initializeQuestions()
      // }
      // else{
      //   alert("No Access")
      //   router.navigateByUrl("/")
      // }
    })
  }
  ngOnInit(): void {
  }

  ngOnDestroy(){
    this.wishlistlogSubscription?.unsubscribe()
  }
  initializeQuestions() {
    const questionsRef = collection(this.firestore, 'evolutionwishlistquestions');
    const q = query(questionsRef, where('enabled', '==', true));
    getDocs(q)
      .then(snapshot => {
        const tempQuestions = [];
        snapshot.forEach(doc => {
          const id = doc.id;
          const question = doc.data()['question'];
          const sno = doc.data()['sno']
          this.questionsMap[id] = question;
          tempQuestions.push({
            id: id,
            question: question,
            sno: sno
          });
        });
        this.questionsOrder = tempQuestions.sort((a, b) => a.sno - b.sno);
      })
      .catch(error => {
        console.error('Error fetching questions:', error);
      });
  }

  filterData(value){
    this.dataSource.filter = value
  }
  cancelInitiated(row: any) {
    this.received = false;
    const confirmDownload = confirm(`Are you sure you want to cancel ${this.mapProfile[row.profileid]}'s wishlist?`);
    if (confirmDownload) {
      const docRef = doc(this.firestore, 'evolutionwishlistlog', row['docid']);
      updateDoc(docRef, {
        closedbeforeshare: true,
        status: 'cancelled',
      })
      .then(() => {
          console.log('cancelled', row);
          // this.resendAfterCancel(row.profileid)
      })
      .catch((error) => {
          console.error('Error', error);
      }); 
    }
  }
  resendAfterCancel(row:any){
    this.received = false;
    if (row.status === 'cancelled') {
      console.log("direct reinitiate");
      var dialogRef = this.dialog.open(EvolutionWishlistLogComponent, {
        data: [row.profileid],
        autoFocus: false,
        maxHeight: "90vh",
        maxWidth: "90vw"
      });
    } else {
      console.log("cancel and reinitiate");
      const confirmDownload = confirm(`Are you sure you want to cancel and re-initiate ${this.mapProfile[row.profileid]}'s wishlist?`);
      if (confirmDownload) {
        const docRef = doc(this.firestore, 'evolutionwishlistlog', row['docid']);
        updateDoc(docRef, {
        closedbeforeshare: true,
        status: 'cancelled',
      })
        .then(() => {
          console.log('cancelled', row);
          var dialogRef = this.dialog.open(EvolutionWishlistLogComponent, {
            data: [row.profileid],
            autoFocus: false,
            maxHeight: "90vh",
            maxWidth: "90vw"
          });
        })
        .catch((error) => {
            console.error('Error', error);
        }); 
      } 
    }
  }
  // cancelInitiated(row: any) {
  //   this.received = false;
  //   const confirmDownload = confirm(`Are you sure you want to cancel ${this.mapProfile[row.profileid]}'s wishlist?`);
  //   if (confirmDownload) {
  //     // console.log("row status check",row);
  //     console.log("row status check",row['contacts']);
  //     if (row.status === 'initiated') {
  //       this.firestore.collection("evolutionwishlistlog").doc(row['docid']).update({
  //         "closedbeforeshare":true,
  //         "status":'cancelled',
  //       })
  //       .then(() => {
  //           console.log('cancelled', row);
  //       })
  //       .catch((error) => {
  //           console.error('Error', error);
  //       }); 
  //     } else if (row.status === 'sended'){
  //       console.log("row.status === 'sended'");
  //       const submitted = row['contacts'].some(contact=>contact.submitted === true);
  //       if (submitted) {
  //         this.received = true;
  //       }
  //       if (this.received === true) {
  //         const updateContacts = row['contacts'].map(contact =>{
  //           if (!contact.submitted) {
  //             return {...contact, status:'cancelled'};
  //           }
  //           return contact;
  //         })
  //         this.firestore.collection("evolutionwishlistlog").doc(row['docid']).update({
  //           "mannualcompleted":true,
  //           "status":'completed',
  //           "contacts": updateContacts,
  //         })
  //         .then(() => {
  //             console.log('cancelled', row);
  //         })
  //         .catch((error) => {
  //             console.error('Error', error);
  //         }); 
  //       } else {
  //         this.firestore.collection("evolutionwishlistlog").doc(row['docid']).update({
  //           "closedbeforeshare":true,
  //           "status":'cancelled',
  //         })
  //         .then(() => {
  //             console.log('cancelled', row);
  //         })
  //         .catch((error) => {
  //             console.error('Error', error);
  //         }); 
  //       }
  //     }
  //   }
  // }
  reload(row: any) {
    const confirmDownload = confirm(`Are you sure you want to re-enable the wishlist share option for ${this.mapProfile[row.profileid]}?`);
    if (confirmDownload) {
      const docRef = doc(this.firestore, "evolutionwishlistlog" ,row['docid']);
      updateDoc(docRef, {
        "closedbeforeshare":false,
        "status":'initiated',
        "reenabled":new Date(),
      })
      .then(() => {
          console.log('updated', row);
      })
      .catch((error) => {
          console.error('Error', error);
      });
      
    }
  }

  export() {
    if (!this.dataSource || !this.dataSource.data || this.dataSource.data.length === 0) {
      alert("No data available to export");
      return;
    }
    const csvHeader = [
      "Participant Name", 
      "Contact Name",
      "Contact Type", 
      "Contact Info", 
      "Contact Status",
    ];
    
    const questionHeaders = this.questionsOrder.map(q => {
      const questionText = this.questionsMap[q.id] || `Question ${q.sno}`;
      return this.escapeCSV(questionText);
    });
    const allHeaders = [...csvHeader, ...questionHeaders];
    const csvData = [];
    const headerRow = allHeaders.map(header => this.escapeCSV(header)).join(',');
    csvData.push(headerRow);
    this.dataSource.data.forEach(row => {
      const profileName = row["name"] || "";
      const type = row["type"] == 'familyandpeers' ? 'FAMILY AND PEERS' : 'SELF';
      const created = row["created"] ? this.formatDate(row["created"]) : "";
      const status = row["status"] || "";
      if (row["contacts"] && Array.isArray(row["contacts"]) && row["contacts"].length > 0) {
        row["contacts"].forEach(contact => {
          const contactName = contact.name || "";
          const contactType = contact.type || "";
          const contactInfo = contact.contact || "";
          const contactStatus = contact.status || "";
          const submittedDate = contact.submitteddate ? this.formatDate(contact.submitteddate.toDate()) : "";
          const rowData = [
            this.escapeCSV(profileName),
            // this.escapeCSV(type),
            // this.escapeCSV(created),
            // this.escapeCSV(status),
            this.escapeCSV(contactName),
            this.escapeCSV(contactType),
            this.escapeCSV(contactInfo),
            this.escapeCSV(contactStatus),
            // this.escapeCSV(submittedDate)
          ];
          
          if (contact.wishlistquestionmap && contact.status === 'received') {
            this.questionsOrder.forEach(orderedQuestion => {
              const questionId = orderedQuestion.id;
              const answer = contact.wishlistquestionmap[questionId] || "";
              const additionalKey = questionId + 'Additional';
              const additionalInfo = contact[additionalKey] ? `\nAdditional information: ${contact[additionalKey]}` : "";
              const fullAnswer = additionalInfo ? answer + additionalInfo : answer;
              
              rowData.push(this.escapeCSV(fullAnswer));
            });
          } else {
            this.questionsOrder.forEach(() => rowData.push(""));
          }
          
          csvData.push(rowData.join(','));
        });
      } else {
        const rowData = [
          this.escapeCSV(profileName),
          // this.escapeCSV(type),
          // this.escapeCSV(created),
          // this.escapeCSV(status),
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          ""
        ];
        
        this.questionsOrder.forEach(() => rowData.push(""));
        
        csvData.push(rowData.join(','));
      }
    });

    const csvString = csvData.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const date = new Date();
    const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    link.setAttribute('download', `evolution_wishlist_log_${formattedDate}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private escapeCSV(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    const stringValue = String(value);
    
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }
  private formatDate(date: Date): string {
    if (!date) return '';
    return date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  }
  createQuestion() {
    var dialogRef = this.dialog.open(EvolutionQuestionsComponent, { 
      // disableClose: true,
      autoFocus: false,
      width: '90%',
      height: '85%',
    });
    dialogRef.afterClosed().subscribe(value => {  
    });
  }
}

