// import { Component, ViewChild } from '@angular/core';
// import { MatDialog } from '@angular/material/dialog';
// import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
// import { MatSort, MatSortModule } from '@angular/material/sort';
// import { MatTableDataSource, MatTableModule } from '@angular/material/table';
// import { Subject, Subscription, takeUntil } from 'rxjs';
// import { AuthguardService } from '../../authguard.service';
// import { UpdateAdsComponent } from './update-ads/update-ads.component';
// import { collection, collectionSnapshots, Firestore } from '@angular/fire/firestore';
// import { CommonModule } from '@angular/common';
// import { MatButtonModule } from '@angular/material/button';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { MatInputModule } from '@angular/material/input';
// import { MatIconModule } from '@angular/material/icon';

// @Component({
//   selector: 'app-click-ads',
//   imports: [
//     MatFormFieldModule,
//     MatInputModule,
//     CommonModule,
//     MatButtonModule,
//     MatTableModule,
//     MatIconModule,
//     MatPaginatorModule,
//     MatSortModule,
//   ],
//   templateUrl: './click-ads.component.html',
//   styleUrl: './click-ads.component.css'
// })
// export class ClickAdsComponent {
//   displayedColumns: string[] = ['paymentlink','deeplinkinternal','calltoaction','startdate','enddate', 'size', 'image_url','image', 'delete', 'action'];
//   dataSource = new MatTableDataSource();
//   @ViewChild(MatPaginator) paginator: MatPaginator;
//   @ViewChild(MatSort) sort: MatSort;
//   private subscription = new Subject<void>();

//   constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore) {
//     guard.getRoles().then(roles=>{
//       if(roles["developer"] || roles["admin"] || roles["ah"]){
//         const adsRef = collection(this.firestore,"ads")
//         collectionSnapshots(adsRef).pipe(takeUntil(this.subscription)).subscribe(listData=>{
//           let list = listData.map(doc =>({id:doc.id,...doc.data()}))
//           this.ngAfterViewInit(list)
//         })
//       }
//     })
//   }

//   ngOnInit(): void {}

//   ngAfterViewInit(list){
//     this.dataSource.data = list || []
//     this.dataSource.sort = this.sort
//     this.dataSource.paginator = this.paginator
//   }

//   ngOnDestroy(): void {
//     this.subscription.next();
//     this.subscription.complete();
//   }
//   filterTable(value){
//     this.dataSource.filter = value
//   }

//   openImage(url){
//     window.open(url, "_blank")
//   }

//   updateStory(value){
//     this.dialog.open(UpdateAdsComponent, {
//       data: {
//         addata: value
//       },
//       // maxHeight: "90vh",
//       // maxWidth: "90vw",
//       disableClose: true,
//       autoFocus: false,
//     })
//   }

// }





import { Component, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { UpdateAdsComponent } from './update-ads/update-ads.component';
import { collection, collectionSnapshots, Firestore } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-click-ads',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatButtonModule,
    MatTableModule,
    MatIconModule,
    MatPaginatorModule,
    MatSortModule,
  ],
  templateUrl: './click-ads.component.html',
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})
export class ClickAdsComponent {
  displayedColumns: string[] = ['paymentlink', 'deeplinkinternal', 'calltoaction', 'startdate', 'enddate', 'size', 'image_url', 'image', 'delete', 'action'];
  dataSource = new MatTableDataSource();

  private _paginator!: MatPaginator;
  private _sort!: MatSort;

  @ViewChild(MatPaginator) set paginator(p: MatPaginator) {
    this._paginator = p;
    if (p) this.dataSource.paginator = p;
  }
  @ViewChild(MatSort) set sort(s: MatSort) {
    this._sort = s;
    if (s) this.dataSource.sort = s;
  }

  private subscription = new Subject<void>();

  constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore) {
    guard.getRoles().then(roles => {
      // if (roles['developer'] || roles['admin'] || roles['ah']) {
        const adsRef = collection(this.firestore, 'ads');
        collectionSnapshots(adsRef).pipe(takeUntil(this.subscription)).subscribe(listData => {
          const list = listData.map(doc => ({ id: doc.id, ...doc.data() }));
          this.dataSource.data = list;
          setTimeout(() => {
            if (this._paginator) this.dataSource.paginator = this._paginator;
            if (this._sort) this.dataSource.sort = this._sort;
          });
        });
      // }
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  filterTable(value: string) {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }

  openImage(url: string) {
    window.open(url, '_blank');
  }

  updateStory(value: any) {
    this.dialog.open(UpdateAdsComponent, {
      maxHeight: '90vh', width: '600px',
      data: { addata: value },
      disableClose: true,
      autoFocus: false,
    });
  }
}