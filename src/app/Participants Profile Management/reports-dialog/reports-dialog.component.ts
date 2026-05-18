
import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { Router } from '@angular/router';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { collection, Firestore, getDocs, getFirestore, query, where } from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-reports-dialog',
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    
  ],
  templateUrl: './reports-dialog.component.html',
  styleUrl: './reports-dialog.component.css'
})
export class ReportsDialogComponent {
  mapProfile = {};
  selectedTab = 0;
  selectedTabName: string;
  interimLogId: any;
  askAH: any;
  loveLetter:any;
  crossOver:any;
  loading = true;
  profileid:any;
  developerAccess:boolean = false
  dobMap = {};
  dob:any;
  displayedColumns: string[] = ['sno','created', 'name', 'Progress', 'Type','Hour' ,'SavedYears'];
  // displayedColumns: string[] = ['Date', 'Adjustment', 'Progress', 'Type','Hour' ,'SavedYears'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  evolutionData: any[] = [];
  tabledata = [];
  reportDisplayNames: { [key: string]: string } = {
    crossover: 'Cross Over Metric',
    evolutionprogress: 'Evolution Progress',
    loveletter: 'Love Letter',
    askah: 'Ask A&H'
  };
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    this.dataSource.paginator = this.paginator;
  }

  @ViewChild(MatSort) set matSort(sort: MatSort) {
    this.dataSource.sort = this.sort;
  }
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private firestore: Firestore,
    public guard: AuthguardService,
    public datepipe: DatePipe,
    public location: Location,
    public router: Router,
  ) {
    this.loading = true;
    guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
      this.dobMap = e.dob;
      this.loading = false; 
    });
    guard.getRoles().then(async roles=>{
      this.developerAccess = roles.developer ?? false
      console.log("developerAccessdeveloperAccess",this.developerAccess);
    })
    this.interimLogId = this.data.element.docid;
    this.profileid = this.data.element.profileid;
  }

  ngOnInit(): void {
    this.selectedTabName = this.data.element.reports[this.selectedTab];
    this.fetchData();
    console.log(this.data);
    
  }
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }
  
  fetchData(): void {
    this.loading = true;

    const askAHPromise = getDocs(query(collection(this.firestore,'ask AH'),where('interimlogid', '==', this.interimLogId))).then((askah) => {
      askah.docs.forEach((doc) => {
        const askahData = doc.data();
        this.askAH = askahData;
      });
    });

    const loveLetterPromise = getDocs(query(collection(this.firestore, 'love letter'), where('interimlogid', '==', this.interimLogId))).then((loveletter) => {
      loveletter.docs.forEach((doc) => {
        const loveLetterData = doc.data();
        this.loveLetter = loveLetterData;
      });
    });

    const firestoreATC = getFirestore("firestore-atc");
    const evolutionDataPromise = getDocs(query(collection(firestoreATC, 'atc_alpha'), where('profileid', '==', this.profileid))).then((snapshot) => {
      console.log("Date of birth",this.dobMap[this.data.element.profileid]);
      const dobTimestamp = this.dobMap[this.data.element.profileid];
      const birthDate = new Date(dobTimestamp.seconds * 1000);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear() - (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);
  
      const remainingYears = 80 - age; 
      const evolutionPromises = snapshot.docs.map(async (docSnap) => {
        const correctionsRef = collection(docSnap.ref, 'corrections');
        const q = query(correctionsRef, where('totalhoursaved', '!=', null));
      
        const correctionsSnapshot = await getDocs(q);
      
        correctionsSnapshot.docs.forEach((subColDoc) => {
          const subCollectionData = subColDoc.data();
      
          const hours = subCollectionData['totalhoursaved']['hourValue'] ?? 0.0;
          const type = subCollectionData['totalhoursaved']['type'];
      
          let savedYears = 0;
          if (type === 'Day') {
            savedYears = (hours * 365 * (80 - age)) / (24 * 365);
          } else if (type === 'Week') {
            savedYears = (hours * 52 * (80 - age)) / (24 * 365);
          }
      
          const obj = {
            created: subCollectionData['created'],
            name: subCollectionData['name'],
            Progress: subCollectionData['totalhoursaved']['sliderValue'],
            Type: type,
            Hour: hours,
            SavedYears: savedYears,
          };
      
          this.evolutionData.push(obj);
        });
      });
      return Promise.all(evolutionPromises);
    });

    const crossOverPromise = getDocs(query(collection(this.firestore, 'interim crossover'), where('interimlogid', '==', this.interimLogId))).then((crossover) => {
      crossover.docs.forEach((doc) => {
        const crossOverData = doc.data();
        this.crossOver = crossOverData;
      });
    })


    Promise.all([askAHPromise, loveLetterPromise, evolutionDataPromise, crossOverPromise]).then(() => {
      this.dataSource.data = this.evolutionData; 
      this.loading = false;
    }).catch(error => {
      console.error("Error fetching data: ", error);
      this.loading = false;
    });
    this.ngAfterViewInit();
  }
  closeDialog(): void {
    this.dialogRef.close(); 
  }
  selectTab(index: number, report: string): void {
    this.selectedTab = index;
    this.selectedTabName = report;
    console.log("selected report", report);
    console.log("selected index", index);
  }
}
