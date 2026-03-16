import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, DocumentReference, Firestore, getDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AddTierComponent } from './add-tier/add-tier.component';
import { AssignSeriesComponent } from './assign-series/assign-series.component';
import { AssignUserComponent } from './assign-user/assign-user.component';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {MatTabsModule} from '@angular/material/tabs';

@Component({
  selector: 'app-access-screen',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    MatDatepickerModule,
    MatButtonModule,
    MatOptionModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatSelectModule,
    MatTabsModule
  ],
  templateUrl: './access-screen.component.html',
  // styleUrl: './access-screen.component.css'
  styleUrls: ['../../content-upload-version2/content-upload-shared.css'],
})
export class AccessScreenComponent {
  //  'Delete'
  displayedColumnstier: string[] = [ 'Tier', 'Edit'];
  dataSource_tier = new MatTableDataSource();
  // 'Delete'
  displayedColumnsAssigntier: string[] = [ 'Series', 'Tier', 'Edit'];
  dataSource_assigntier = new MatTableDataSource();
  // 'Delete'
  displayedColumnsAssignuser: string[] = [ 'UserName', 'email', 'Tier', 'Edit'];
  dataSource_assignuser = new MatTableDataSource();

  @ViewChild('paginator_tier') paginator_tier : MatPaginator | any
  @ViewChild('sort_tier') sort_tier : MatSort | any

  @ViewChild('paginator_assigntier') paginator_assigntier : MatPaginator | any
  @ViewChild('sort_assigntier') sort_assigntier : MatSort | any

  @ViewChild('paginator_assignuser') paginator_assignuser : MatPaginator | any
  @ViewChild('sort_assignuser') sort_assignuser : MatSort | any
  seriesName: any;
  tierRefs: any;
  private subscription = new Subject<void>();

  constructor(private dialog: MatDialog, private firestore: Firestore) { 
    const tierRef = collection(this.firestore,'tier')
    collectionSnapshots(tierRef).pipe(takeUntil(this.subscription)).subscribe(snapshotData => {
      let snapshot = snapshotData.map(doc =>({id:doc.id,...doc.data()}))
      this.dataSource_tier.data = snapshot;
      console.log(snapshot)
      this.dataSource_tier.paginator =  this.paginator_tier
      this.dataSource_tier.sort =  this.sort_tier
    })


    // this.firestore.collection('series').valueChanges().subscribe(snapshot => {
    //   const tierPromises: Promise<any>[] = [];
    //   const tiersData: any[] = [];
    
    //   snapshot.forEach((doc: any) => {
    //     const tierRefs = doc['tier'];
    //     tierRefs.forEach((tierRef: any) => {
    //       tierPromises.push(tierRef.get());
    //       this.seriesName = doc['seriesName']
    //     });
    //   });
    
    //   Promise.all(tierPromises).then(tiers => {
    //     tiers.forEach((tierDoc: any) => {
    //       const tierData = tierDoc.data();
    //       tiersData.push({
    //         seriesName: this.seriesName, 
    //         tier: tierData.tier 
    //       });
    //     });
    
    //     console.log(tiersData);
    
    //     // Rest of your code to update the table with tiersData
    //     this.dataSource_assigntier.data = tiersData;
    //     this.dataSource_tier.paginator = this.paginator_tier;
    //     this.dataSource_tier.sort = this.sort_tier;
    //   }).catch(error => {
    //     console.error('Error retrieving tiers:', error);
    //   });
    // });
    const seriesRef = collection(this.firestore,'series')
    collectionSnapshots(seriesRef).pipe(takeUntil(this.subscription)).subscribe(snapshot => {
      const tierPromises: Promise<any>[] = [];
      const tiersData: any[] = [];

      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data();
        const tierRefs = data['tier'];
        const seriesName = data['seriesName'];
        const id = docSnap.id;

        const seriesTiers: any[] = [];

        if (Array.isArray(tierRefs)) {
          tierRefs.forEach((tierRef: DocumentReference<any>) => {
            tierPromises.push(
              getDoc(tierRef).then((tierDoc: any) => {
                const tierData = tierDoc.data();
                seriesTiers.push(tierData?.tier ?? 'Unknown');
              })
            );
          });
        }

        tiersData.push({
          id,
          seriesName,
          tiers: seriesTiers,
        });
      });

      Promise.all(tierPromises).then(() => {
        console.log(tiersData);
        this.dataSource_assigntier.data = tiersData;
        this.dataSource_assigntier.paginator = this.paginator_assigntier;
        this.dataSource_assigntier.sort = this.sort_assigntier;
      }).catch(error => {
        console.error('Error retrieving tiers:', error);
      });
    });
    
    const userRef = collection(this.firestore,'user')
    collectionSnapshots(userRef).pipe(takeUntil(this.subscription)).subscribe(snapshotData => {
      let snapshot = snapshotData.map(doc =>({id:doc.id,...doc.data()}))
      this.dataSource_assignuser.data = snapshot
      this.dataSource_assignuser.paginator = this.paginator_assignuser
      this.dataSource_assignuser.sort = this.sort_assignuser
    })

  }

  ngOnInit(): void {
  }

  ApplyFilterTier(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource_tier.filter = filterValue.trim().toLowerCase()
   }
  ApplyFilterSeries(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource_assigntier.filter = filterValue.trim().toLowerCase()
   }
  ApplyFilterUser(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource_assignuser.filter = filterValue.trim().toLowerCase()
   }

   openDialog(){
    this.dialog.open(AddTierComponent,{
      data : {
        add : true
      }
    })
    }

    onEditDialog(id:any, tier:any) {
      console.log(id,tier,'testasdasdas')
      this.dialog.open(AddTierComponent,{
        data: {
          edit : true,
          id : id,
          tier : tier
        }
      })
    }
  
    onDeleteDialog(id:any) {
      this.dialog.open(AddTierComponent,{
        data : {
          delete : true,
          id : id
        }
      })
    }

    onAssignEditDialog(doc){
      console.log(doc)
      this.dialog.open(AssignSeriesComponent,{
        data : {
          edit : true,
          seriesName : doc.seriesName,
          id : doc.id,
          tier:doc.tiers
        }
      })
    }

    onAssignDeleteDialog(id: any){
      console.log(id)
      this.dialog.open(AssignSeriesComponent,{
        data : {
          delete : true,
          id : id
        }
      })
    } 

    oneditDialog(doc:any){
      console.log(doc.id)
      this.dialog.open(AssignUserComponent,{
        data : {
          edit : true,
          username : doc.username,
          id : doc.id,
          tier : doc.tier
        }
      })
    }

    ondeleteDialog(id: any){
      this.dialog.open(AssignUserComponent,{
        data : {
          delete : true,
          id : id
        }
      })
    } 


}
