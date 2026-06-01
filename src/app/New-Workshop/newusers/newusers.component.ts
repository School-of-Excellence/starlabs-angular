import { Component, Inject, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { Firestore } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { collection, getDocs } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment.development';
import { SnackbarService } from '../../shared/snackbar.service';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { Optional } from '@angular/core';

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
  standalone: true,
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
    MatCheckboxModule,
    RouterModule
],
  templateUrl: './newusers.component.html',
  styleUrl: './newusers.component.css'
})
export class NewusersComponent implements AfterViewInit, OnDestroy {
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
  activeFilter: 'all' | 'subscribers' = 'all';
  selectedUsers: any[] = [];
  participantMetadata: any = {}; 
  loggedinProfile: string = null;
  workshopId: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private firestore: Firestore,
    private dialog: MatDialog,
    private guard: AuthguardService,
    private snackbarService: SnackbarService,
    private http: HttpClient,
    private route: ActivatedRoute,
    public router: Router
    
    
  ) {
    this.processUserData();

    const participantRef = collection(this.firestore, 'participant metadata');
    getDocs(participantRef).then((snapshot) => {
      snapshot.forEach((doc) => {
        this.participantMetadata[doc.id] = doc.data();
      });
    });

  }
  ngOnDestroy(): void {
    this.destroy$.next();   
    this.destroy$.complete();
  }

  async ngOnInit() {
    try {
      this.selectedUsers = [];
      const roles = await this.guard.getRoles();
      this.loggedinProfile = roles["profile_ref"].id;
    } catch (error) {
      console.error("Error loading profile:", error);
    }
    this.workshopId = this.route.snapshot.paramMap.get('id');
    if (!this.workshopId) {
      this.workshopId = this.route.snapshot.queryParamMap.get('workshopId');
    }
      await this.loadUserData();
  }

  private async loadUserData() {
  try {
    const userRef = collection(this.firestore, 'new_user_data');
    const userSnap = await getDocs(userRef);
    this.mapProfile = {};
    userSnap.forEach(doc => {
      const data = doc.data();
      data['id'] = doc.id;
      this.mapProfile[doc.id] = data;
    });
    this.processUserData(); 
  } catch (err) {
    console.error('Error loading users:', err);
  }
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
    this.activeFilter = 'all'; 
    this.selectedUsers = [];                                          
    this.dataSource.data = this.originalData;
  }

  SubscribersOnly() {
    this.activeFilter = 'subscribers';
    this.selectedUsers = [];
    this.dataSource.data = this.originalData.filter(u => u.subscriber === true);
  }
  
  isAllSelected() {
    return this.selectedUsers.length > 0 &&
      this.selectedUsers.length === this.dataSource.data.length;
  }

  masterToggle(event: any) {
    if (event.checked) {
      this.selectedUsers = this.dataSource.data.map(user => ({
        profileid: user.id,
        name: user.name,
        metadata: user
      }));
    } else {
      this.selectedUsers = [];
    }
  }

  toggleUser(user: any, event: any) {
    if (event.checked) {
      this.selectedUsers.push({
        profileid: user.id,
        name: user.name,
        metadata: user
      });
    } else {
      this.selectedUsers = this.selectedUsers.filter(
        u => u.profileid !== user.id
      );
    }
  }

  isUserSelected(user: any): boolean {
    return this.selectedUsers.some(u => u.profileid === user.id);
  }

  async sendMail() {
    const { SendmessagesComponent } = await import('../workshop-dashboard/sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'mail' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleDialogResult(result);
    });
  }

  async sendWatti() {
    const { SendmessagesComponent } = await import('../workshop-dashboard/sendmessages/sendmessages.component');
    const ref = this.dialog.open(SendmessagesComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { type: 'whatsapp' }
    });

    ref.afterClosed().subscribe(async (result) => {
      await this.handleDialogResult(result);
    });
  }

  private getCloudFunctionUrl(functionName: string): string {
      const projectId = environment.firebase.projectId;
      const projectUrlMap: Record<string, string> = {
        'test-environment-841c3': `https://us-central1-test-environment-841c3.cloudfunctions.net/${functionName}`,
        'starlabs-test': `https://us-central1-starlabs-test.cloudfunctions.net/${functionName}`,
        'fir-sample-aae4a': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
        'launch-your-legacy-development': `https://us-central1-fir-sample-aae4a.cloudfunctions.net/${functionName}`,
      };
      return projectUrlMap[projectId] || '';
    }

    private async handleDialogResult(result: any) {
    if (result?.action === 'sent') {
      if (result.type === 'mail') {
        const { subject, message } = result;
        const recipients = this.selectedUsers
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['email'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            return { email: metadata['email'], name: metadata['name'] };
          });

        if (recipients.length === 0) {
          this.snackbarService.show('No valid recipients found');
          return;
        }
        const bulkPayload = { type: 'mail', subject, message, recipients };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        try {
          const response = await firstValueFrom(this.http.post(url, bulkPayload, { responseType: 'json' }));
          const res = response as any;
          const successfulSends = res.successCount || 0;
          const failedSends = res.failureCount || 0;
          const totalParticipants = recipients.length;

          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `Message successfully sent to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Sent to ${successfulSends} participants. Failed to send to ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);
          this.selectedUsers = [];
        } catch (error) {
          console.error('Failed to send bulk emails:', error);
          this.snackbarService.show('Failed to send bulk emails');
        }

      } else if (result.type === 'whatsapp') {
        const { templateName, customParams } = result;
        const participants = this.selectedUsers
          .filter(participant => {
            const metadata = participant['metadata'];
            return metadata && metadata['phonenumber'] && metadata['name'];
          })
          .map(participant => {
            const metadata = participant['metadata'];
            const name = metadata['name'];
            let cc = metadata['countryCode'] || metadata['countrycode'] || '';
            cc = cc.trim();
            if (cc && !cc.startsWith('+')) cc = '+' + cc;
            let phone = metadata['phonenumber']?.toString().trim() || '';
            phone = phone.replace(/^\+/, '');
            const fullPhoneNumber = cc ? `${cc}${phone}` : phone;
            const processedParams = customParams.map((param: any) => ({
              name: param.name,
              value: param.value.replace(/\{\{name\}\}/g, name)
            }));
            return { phonenumber: fullPhoneNumber, name, customParams: processedParams };
          });

        if (participants.length === 0) {
          this.snackbarService.show('No valid participants found');
          return;
        }

        const bulkPayload = { type: 'whatsapp', templateName, participants };
        const url = this.getCloudFunctionUrl('workshopprogressmessage');

        try {
          const response = await firstValueFrom(this.http.post(url, bulkPayload, { responseType: 'json' }));
          const res = response as any;
          const successfulSends = res.successCount || 0;
          const failedSends = res.failureCount || 0;
          const totalParticipants = participants.length;
          const broadcastName = res.broadcastName || ' ';
          let snackBarMessage = '';
          if (successfulSends === totalParticipants) {
            snackBarMessage = `WhatsApp broadcast "${broadcastName}" sent successfully to all ${totalParticipants} participants!`;
          } else if (successfulSends > 0) {
            snackBarMessage = `Broadcast "${broadcastName}": Sent to ${successfulSends} participants. Failed: ${failedSends}.`;
          } else {
            snackBarMessage = `Failed to send WhatsApp message to all participants.`;
          }
          this.snackbarService.show(snackBarMessage);
          this.selectedUsers = [];
        } catch (error) {
          console.error('Failed to send bulk WhatsApp:', error);
          this.snackbarService.show('Failed to send bulk WhatsApp messages');
        }
      }
    } else if (result?.action === 'closed') {
      console.log('closed');
    }
  }

    async sendNotificationinBreakthrough() {
    const { AhNotificationComponent } = await import(
      '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component'
    );
    let dialogRef = this.dialog.open(AhNotificationComponent, {
      width: "60vw",
      maxHeight: "90vh",
      disableClose: true,
      autoFocus: false,
      data: this.selectedUsers
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if (result != null && result != undefined) {
        var profileID = this.selectedUsers.map(p => p.profileid);
        var notificationimage = null;
        if (result["notificationimage"] != null) {
          const { getDownloadURL, ref, uploadBytes } = await import('@angular/fire/storage');
          const { inject } = await import('@angular/core');
          const { getStorage } = await import('firebase/storage');
          const { getApp } = await import('firebase/app');
          const storage = getStorage(getApp());
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(storage, filepath);
            const uploadResult = await uploadBytes(storageRef, result['notificationimage']);
            notificationimage = await getDownloadURL(uploadResult.ref);
          } catch (error) {
            console.log('file upload error', error);
          }
        }
        this.guard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true,
          landingpage: result["landingpage"],
          profileid: profileID,
        }).then(() => {
          alert("A&H Update sent to App user " + profileID.length.toString());
          this.selectedUsers = [];
        });
      }
    });
  }
}
