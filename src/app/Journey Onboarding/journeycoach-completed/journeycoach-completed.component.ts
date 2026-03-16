import { CommonModule, DatePipe } from '@angular/common';
import { Component, Inject, ViewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { OnboardingRemarkComponent } from '../onboarding-remark/onboarding-remark.component';
import { collection, Firestore, getDocs, getFirestore, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-journeycoach-completed',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatTableModule,
    MatPaginatorModule,
    MatInputModule,
  ],
  templateUrl: './journeycoach-completed.component.html',
  styleUrl: './journeycoach-completed.component.css'
})
export class JourneycoachCompletedComponent {

  loading: boolean = true;

  coachesList: string[] = [];
  journeyCompletedData = [];
  displayedColumns: string[] = ['name', 'mobileNumber', 'journey', 'purchasedate', 'onboardedby', 'onboardeddate', 'completeddate'];
  dataSource = new MatTableDataSource<any>([]);

  mapProfile: any = {};
  mapjourneyname: any = {};
  mapMetaData: any = {};
  mapPhone: any = {};

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  filterForm;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private firestore: Firestore,
    private guard: AuthguardService,
    private dialog: MatDialog,
    public datepipe: DatePipe,
    private fb: FormBuilder,
  ) { 
    this.filterForm = this.fb.group({
      name:[''],
      onboardedby: [''],
      dateRange: this.fb.group({
        start: [''],
        end: ['']
      })
    });
    this.loading = true;
    this.mapMetaData = data.metaData;
    this.mapProfile = data.mapProfile;
    this.mapPhone = data.mapPhone;
    this.mapjourneyname = data.mapJourney;

    // this.journeyCompletedData = data.completed.map((item)=>({...item, onboardedtime:![null,undefined,''].includes(item.onboardedtime) ? new Date(item.onboardedtime.toDate()) : null, subscriptionend:![null,undefined,''].includes(item.subscriptionend) ? new Date(item.subscriptionend.toDate()) : null}))

    // Extract coaches for filter dropdown
    getDocs(query(collection(this.firestore,"users_roles"),where("journeycoach", "==", true))).then((coach) => {
      for (let i = 0; i < coach.docs.length; i++) {
        const docData = coach.docs[i];
        this.coachesList.push(docData.data()['profile_ref'].id)
      }
    });
    console.log(this.journeyCompletedData);

    getDocs(query(collection(this.firestore,"participantjourneyproduct"),where("journeystatus","==","completed"))).then((pjpdoc)=>{
      if(pjpdoc.docs.length != 0){
        for (let i = 0; i < pjpdoc.docs.length; i++) {
          const pjpData = pjpdoc.docs[i].data();
          pjpData['subscriptionend'] = ![null,undefined,''].includes(pjpData['subscriptionend']) ? pjpData['subscriptionend'].toDate() : null;
          pjpData['onboardedtime'] = ![null,undefined,''].includes(pjpData['onboardedtime']) ? pjpData['onboardedtime'].toDate() : null;
          this.journeyCompletedData.push(pjpData)
        }
      }
      this.dataSource.data = this.journeyCompletedData
      this.loading = false;
    });
    
   }

  ngOnInit() {
    // Subscribe to filter changes
    this.filterForm.valueChanges.subscribe(() => {
      this.applyFilters();
    });
  }

  ngAfterViewInit() {
    // Set up pagination and sorting after view initialization
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }
  applyFilters() {
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      // Get filter values
      const filterValue = JSON.parse(filter);
      const onboardedby = filterValue.onboardedby;
      const startDate = filterValue.dateRange.start ? new Date(filterValue.dateRange.start) : null;
      const endDate = filterValue.dateRange.end ? new Date(filterValue.dateRange.end) : null;
      
      // Apply coach filter
      const coachMatch = !onboardedby || this.mapProfile[data.onboardedby?.[0]?.id] === onboardedby;
      
      // Apply date range filter
      let dateMatch = true;
      let isMatch = true;
      if (startDate && endDate) {
        const completedDate = data.subscriptionend ? new Date(data.subscriptionend) : null;
        dateMatch = completedDate ? (completedDate >= startDate && completedDate <= endDate) : false;
      }

      const searchTerm = filterValue.name ? filterValue.name.trim().toLowerCase() : '';
      const name = this.mapProfile[data['profileid']] ? this.mapProfile[data['profileid']] : '';

      if (searchTerm && name) {
        isMatch = isMatch && name.toLowerCase().includes(searchTerm);
      }
      
      // Return true if all filters match
      return coachMatch && dateMatch && isMatch;
    };
    
    // Apply the filter
    this.dataSource.filter = JSON.stringify(this.filterForm.value);
    
    // If paginator exists, go back to first page
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  viewReport(element) {
    element['name'] = this.mapProfile[element['profileid']]
    element['viewreport'] = true;
    element['mapProfile'] = this.mapProfile;
    element['mapJourney'] = this.mapjourneyname;
    
    if (![null, undefined, ''].includes(element['journeyref'])) {
      element['journeyname'] = this.mapjourneyname[element['journeyref'].id]?.['journey'] || '';
    };
    if (![null, undefined, ''].includes(element['activejourney'])) {
      element['journeyname'] = element['activejourney']
    };
    this.dialog.open(OnboardingRemarkComponent, { 
      data: element,
      autoFocus: false,
      panelClass: 'custom-dialog-container'
    });
  }

  resetFilters() {
    this.filterForm.reset({
      onboardedby: '',
      dateRange: {
        start: '',
        end: ''
      }
    });
    this.dataSource.filter = '';
  }

}
