import { Component, OnInit, ViewChild } from '@angular/core';
import { collection, Firestore, getDocs, query, where, doc, collectionData, orderBy } from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AuthguardService } from '../../authguard.service';
import { ValidateTemplateComponent } from '../validate-template/validate-template.component';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';


@Component({
  selector: 'app-email-validation-from-analytics',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    FormsModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './email-validation-from-analytics.component.html',
  styleUrls: ['./email-validation-from-analytics.component.css']
})
export class EmailValidationFromAnalyticsComponent implements OnInit {

  displayedColumns: string[] = ['profileid', 'subject', 'createdby','date','status','mailstatus', 'test', 'validate'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  tableData = [];
  mapProfile = {};

  constructor(
    private firestore : Firestore,
    private auth : AuthguardService,
    public dialog : MatDialog, 
    private snackBar: MatSnackBar,
    private http: HttpClient
  ) { 
    collectionData(query(collection(this.firestore, 'email pending validation'),orderBy('date','desc'))).subscribe(snap => {
      this.tableData = snap
      this.auth.getProfileMap().then(e => this.mapProfile = e.docdata)
      this.ngAfterViewInit()
    })
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(){
    this.dataSource.data = this.tableData
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }


  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }

  async sendTestMail(value) {
    const docData = value;
    await getDocs(query(collection(this.firestore, 'profile_data'),where("user_ref", "==", doc(collection(this.firestore, 'user_data'),this.auth.uid)))).then((profile)=>{
      if(profile.docs.length != 0) {
        docData['emailvalidators'].push(profile.docs[0].data()['profileid'])
      }
    });
    if(docData['emailvalidators'].length != 0) {
      let batchArray = [];
      for (let i = 0; i < docData['emailvalidators'].length; i++) {
        const element = docData['emailvalidators'][i];
        let mailoptions = {
          From: "support@intl.soexcellence.com", 
          To: this.mapProfile[element]['email'],
          TemplateAlias: docData['templateid'],
          TemplateModel:{
            subject:eval('`'+docData['subject']+'`'),
            body:eval('`'+docData['body']+'`')
          }
        }
        batchArray.push(mailoptions);

        if(i+1 == docData['emailvalidators'].length) {          
          try {
            const url = "https://us-central1-starlabs-test.cloudfunctions.net/sendValidationMail";          
            const response = await this.http.post(url, { data: batchArray }).toPromise();
            console.log('Success message:', response['message']);
            this.snackBar.open(response['message'], 'Close');
          } catch (error: any) {
            console.error('Error:', error);
            this.snackBar.open('Error sending mail', 'Close');
          }
        }
      }
    }
  }

  onSubmit(doc){

    let dialogRef = this.dialog.open(ValidateTemplateComponent,{
      data : {
        data: doc,
        mapprofile: this.mapProfile
      },
      width : "60vw"
    });
  }

}
