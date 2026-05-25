import { Component, Inject, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { deleteDoc, doc, Firestore } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { debounceTime, firstValueFrom, Subject, takeUntil } from 'rxjs';
import { collection, getDocs } from '@angular/fire/firestore';

export interface UserProfile {
  name: string;
  email: string;
  created: any;
  phonenumber: string;
  countryCode: string;
  countryandnumber: string;
  // profileid: string;
  enable: boolean;
  refferedby: string;
  id: string;
  uid: string;
  status: string;
  registrationMethod: string;
  emailVerified: boolean;
  workshoponly: boolean;
  reffercode:string;
  subscriber?: boolean;
}

@Component({
  selector: 'app-newusers',
  
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatButtonModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule
],
  templateUrl: './newusers.component.html',
  styleUrl: './newusers.component.css'
})
export class NewusersComponent implements AfterViewInit {
  mapProfile: any = {};
  displayedColumns: string[] = [
    'select',
    'name', 
    'email', 
    'created', 
    'phoneWithCode', 
    //  'profileid', 
    'enable', 
    'refferedby', 
  ];
  showSubscribersOnly = false;
  originalData: UserProfile[] = [];

  dataSource = new MatTableDataSource<UserProfile>();
  
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  subscribersCount: number;
  selectedUsers: any[] = [];
   filteredParticipants: any[] = [];


  constructor(
    public dialogRef: MatDialogRef<NewusersComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore,
    private dialog: MatDialog,
    private guard: AuthguardService,
  ) {
    const participantRef = collection(this.firestore, 'participant metadata');
    getDocs(participantRef).then((snapshot) => {
      snapshot.forEach((doc) => {
        this.mapProfile[doc.id] = doc.data();
      });
      this.processUserData();
    });
    console.log("New user profiles", data.mapProfile);
    this.mapProfile = data.mapProfile;
    this.processUserData();
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.dataSource.filterPredicate = (data: UserProfile, filter: string) => {
      const searchStr = filter.toLowerCase();
      return data.name.toLowerCase().includes(searchStr) ||
             data.email.toLowerCase().includes(searchStr) ||
            //  data.profileid.toLowerCase().includes(searchStr) ||
             data.refferedby.toLowerCase().includes(searchStr) ||
             (data.countryCode + data.phonenumber).toLowerCase().includes(searchStr);
    };
  }
  processUserData() {
    const usersArray: UserProfile[] = [];
    Object.keys(this.mapProfile).forEach(key => {
      const user = this.mapProfile[key];
      usersArray.push({
        name: user.name || '',
        email: user.email || '',
        created: new Date(user.created.seconds * 1000).toLocaleString() || null,
        phonenumber: user.phonenumber || '',
        countryCode: user.countryCode || '',
        countryandnumber: `${user.countryCode} ${user.phonenumber}` || '',
        // profileid: user.profileid || '',
        enable: user.enable || false,
        refferedby: user.refferedprofile || '',
        reffercode: user.refferedby || '',
        id: user.id || key,
        uid: user.uid || '',
        status: user.status || '',
        registrationMethod: user.registrationMethod || '',
        emailVerified: user.emailVerified || false,
        workshoponly: user.workshoponly || false,
        subscriber: user.subscriber || false
      });
    });

    this.originalData = usersArray;
    this.subscribersCount = this.originalData.filter(u => u.subscriber === true).length;
    this.dataSource.data = usersArray;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  AllUsers() {
    this.dataSource.data = this.originalData;
  }

  SubscribersOnly() {
    this.dataSource.data = this.originalData.filter(u => u.subscriber === true);
  }
  
  isAllSelected() {
    return this.selectedUsers.length === this.dataSource.data.length;
  }

  masterToggle(event: any) {
    if (event.checked) {
      this.selectedUsers = [...this.dataSource.data];
    } else {
      this.selectedUsers = [];
    }
  }

  toggleUser(user: any, event: any) {
    if (event.checked) {
      this.selectedUsers.push(user);
    } else {
      this.selectedUsers = this.selectedUsers.filter(
        u => u.id !== user.id
      );
    }
  }

  // async sendMail() {
  //   const { SendmessagesComponent } = await import('../workshop-dashboard/sendmessages/sendmessages.component');
  //   const ref = this.dialog.open(SendmessagesComponent, {
  //     width: '1000px',
  //     maxWidth: '95vw',
  //     maxHeight: '90vh',
  //     data: { type: 'mail' }
  //   });

  //   ref.afterClosed().subscribe(async (result) => {
  //   });
  // }
  // async sendWatti() {
  //   const { SendmessagesComponent } = await import('../workshop-dashboard/sendmessages/sendmessages.component');
  //   const ref = this.dialog.open(SendmessagesComponent, {
  //     width: '1000px',
  //     maxWidth: '95vw',
  //     maxHeight: '90vh',
  //     data: { type: 'whatsapp' }
  //   });

  //   ref.afterClosed().subscribe(async (result) => {
  //   });
  // }
  //   sendNotificationinBreakthrough(){
      
  //   }


}
