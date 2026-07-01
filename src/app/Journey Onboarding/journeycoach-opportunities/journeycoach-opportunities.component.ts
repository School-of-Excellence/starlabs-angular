import { CommonModule, DatePipe } from '@angular/common';
import { Component, Inject, ViewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { OnboardingRemarkComponent } from '../onboarding-remark/onboarding-remark.component';
import { addDoc, collection, collectionSnapshots, deleteDoc, doc, docSnapshots, DocumentReference, Firestore, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-journeycoach-opportunities',
  imports: [
    ProfilePictureComponent,
    MatProgressSpinnerModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    ReactiveFormsModule,
    FormsModule,
    MatSelectModule,
    MatDatepickerModule,
    MatTooltipModule,
    MatPaginatorModule
  ],
  templateUrl: './journeycoach-opportunities.component.html',
  styleUrl: './journeycoach-opportunities.component.css'
})
export class JourneycoachOpportunitiesComponent {
loading: boolean = true;
  onboardingdata = [];
  displayedColumns: string[] = ['name', 'mobileNumber', 'journey', 'purchasedate', 'onboardedby', 'onboardeddate', 'opportunity', 'action'];
  dataSource = new MatTableDataSource<any>([]);

  // For the dashboard
  opportunityStats = {
    total: 0,
    continuity: 0,
    upgrade: 0,
    referral: 0,
    addon: 0
  };
  
  // For the consumed opportunities dashboard
  consumedStats = {
    total: 0,
    continuity: 0,
    upgrade: 0,
    referral: 0,
    addon: 0
  };

  filterForm;

  mapProfile: any = {};
  mapjourneyname: any = {};
  mapMetaData: any = {};
  mapPhone: any = {};
  
  coachesList: string[] = [];
  opportunityTypes: string[] = ['All', 'Continuity', 'Upgrade', 'Referral', 'Add-on'];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

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
      opportunityType: [''],
      dateRange: this.fb.group({
        start: [''],
        end: ['']
      }),
      purchasedate:this.fb.group({
        start: [''],
        end: ['']
      }),
    });
    this.loading = true;
    this.mapMetaData = data.metaData;
    this.mapProfile = data.mapProfile;
    this.mapPhone = data.mapPhone;
    this.mapjourneyname = data.mapJourney

    // Extract coaches for filter dropdown
    getDocs(query(collection(this.firestore,"users_roles"),where("journeycoach", "==", true))).then((coach) => {
      for (let i = 0; i < coach.docs.length; i++) {
        const docData = coach.docs[i];
        this.coachesList.push(docData.data()['profile_ref'].id)
      }
    });
    
  }

  ngOnInit(): void {
    this.fetchdata();
    
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

  async fetchdata() {
    this.onboardingdata = [];
    getDocs(query(collection(this.firestore,"participantjourneyproduct"),where('onboarded', '==', true))).then(snap => {
      this.onboardingdata = [];
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        if ((![null,undefined].includes(element['opportunities']) && element['opportunities'].length > 0) || (![null,undefined].includes(element['opportunities_consumed']) && element['opportunities_consumed'].length > 0)) {
          element['generalnotes'] = this.mapMetaData[element['profileid']]?.['generalnotes'] || [];
          element['onboardedtime'] = ![null, undefined, ''].includes(element['onboardedtime']) ? element['onboardedtime'].toDate() : null;
          // Add empty array if opportunities_consumed doesn't exist
          if ([null,undefined,''].includes(element['opportunities_consumed'])) {
            element['opportunities_consumed'] = [];
          }
          
          this.onboardingdata.push(element);
        }
      };

      // Update the table data source
      this.dataSource.data = this.onboardingdata;
      
      // Update opportunity statistics and consumed statistics
      this.updateOpportunityStats();
    }).then(() => {
      setTimeout(() => {
        this.loading = false;
      }, 1000);
    });
  }

  updateOpportunityStats() {
    // Reset stats
    this.opportunityStats = {
      total: 0,
      continuity: 0,
      upgrade: 0,
      referral: 0,
      addon: 0
    };
    
    this.consumedStats = {
      total: 0,
      continuity: 0,
      upgrade: 0,
      referral: 0,
      addon: 0
    };

    // Calculate stats from filtered data
    this.dataSource.filteredData.forEach((item) => {
      // Count available opportunities
      if (item.opportunities && Array.isArray(item.opportunities)) {
        this.opportunityStats.total += item.opportunities.length;
        
        // Count by categories
        if (![null, undefined, ''].includes(item.opportunities) && item.opportunities.length != 0) {
          item.opportunities.forEach((opp) => {            
            if (opp === 'Continuity') this.opportunityStats.continuity++;
            else if (opp === 'Upgrade') this.opportunityStats.upgrade++;
            else if (opp === 'Referral') this.opportunityStats.referral++;
            else if (opp === 'Add-on') this.opportunityStats.addon++;
          });
        }
      }
      
      // Count consumed opportunities
      if (item.opportunities_consumed && Array.isArray(item.opportunities_consumed)) {
        this.consumedStats.total += item.opportunities_consumed.length;
        
        // Count by categories
        if (![null, undefined, ''].includes(item.opportunities_consumed) && item.opportunities_consumed.length != 0) {
          item.opportunities_consumed.forEach((opp) => {            
            if (opp === 'Continuity') this.consumedStats.continuity++;
            else if (opp === 'Upgrade') this.consumedStats.upgrade++;
            else if (opp === 'Referral') this.consumedStats.referral++;
            else if (opp === 'Add-on') this.consumedStats.addon++;
          });
        }
      }
    });
  }

  applyFilters() {
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      // Get filter values
      const filterValue = JSON.parse(filter);
      const onboardedby = filterValue.onboardedby;
      const opportunityType = filterValue.opportunityType;
      const startDate = filterValue.dateRange.start ? new Date(filterValue.dateRange.start) : null;
      const endDate = filterValue.dateRange.end ? new Date(filterValue.dateRange.end) : null;

      const purchasestartDate = filterValue.purchasedate.start ? new Date(filterValue.purchasedate.start) : null;
      const purchaseendDate = filterValue.purchasedate.end ? new Date(filterValue.purchasedate.end) : null;  
      // Apply coach filter
      const coachMatch = !onboardedby || this.mapProfile[data.onboardedby?.[0]?.id] === onboardedby;
      
      // Apply opportunity type filter
      let opportunityMatch = true;
      if (opportunityType && opportunityType !== 'All') {
        opportunityMatch = data.opportunities?.includes(opportunityType) || data.opportunities_consumed?.includes(opportunityType);
      }

      const searchTerm = filterValue.name ? filterValue.name.trim().toLowerCase() : '';
      const name = this.mapProfile[data['profileid']] ? this.mapProfile[data['profileid']] : '';

      let isMatch = true;
      if (searchTerm && name) {
        isMatch = isMatch && name.toLowerCase().includes(searchTerm);
      }
      
      // Apply date range filter
      let dateMatch = true;
      if (startDate && endDate) {
        const onboardedDate = data.onboardedtime ? new Date(data.onboardedtime) : null;
        dateMatch = onboardedDate ? (onboardedDate >= startDate && onboardedDate <= endDate) : false;
      }
      
      let purchasedateMatch = true;
      if (purchasestartDate && purchaseendDate) {
        const purchaseDate = data.purchasedate ? new Date(data.purchasedate.toDate()) : null;
        dateMatch = purchaseDate ? (purchaseDate >= startDate && purchaseDate <= endDate) : false;
      }
      
      // Return true if all filters match
      return coachMatch && opportunityMatch && dateMatch && purchasedateMatch && isMatch;
    };
    
    // Apply the filter
    this.dataSource.filter = JSON.stringify(this.filterForm.value);
    
    // Update opportunity stats after filtering
    this.updateOpportunityStats();
    
    // If paginator exists, go back to first page
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  resetFilters() {
    this.filterForm.reset({
      onboardedby: '',
      opportunityType: '',
      dateRange: {
        start: '',
        end: ''
      },
      purchasedate:{
        start: '',
        end: '',
      }
    });
    this.dataSource.filter = '';
    this.updateOpportunityStats();
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
  
  getOpportunityStatusLabel(element: any, opportunity: string): string {
    if (element.opportunities_consumed && element.opportunities_consumed.includes(opportunity)) {
      return 'Consumed';
    } else if (element.opportunities && element.opportunities.includes(opportunity)) {
      return 'Available';
    }
    return '';
  }
  
  getOpportunityStatusClass(element: any, opportunity: string): string {
    if (element.opportunities_consumed && element.opportunities_consumed.includes(opportunity)) {
      return 'consumed';
    } else if (element.opportunities && element.opportunities.includes(opportunity)) {
      return 'available';
    }
    return '';
  }
}
