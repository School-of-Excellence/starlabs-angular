import { Component, ViewChild } from '@angular/core';
import { UpdateHealthstoryComponent } from './update-healthstory/update-healthstory.component';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { MatDialog } from '@angular/material/dialog';
import { collection, collectionSnapshots, Firestore } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-health-stories',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatIconModule,
    MatPaginatorModule,
    CommonModule,
    MatButtonModule
  ],
  templateUrl: './health-stories.component.html',
  // styleUrl: './health-stories.component.css'
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})
export class HealthStoriesComponent {

  displayedColumns: string[] = ['subject', 'description', 'delete', 'images', 'action'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  healthStoriesSubscription: Subscription
  private subscription = new Subject<void>();

  constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore) {
    guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        const healthstoryRef = collection(this.firestore,"health stories")
        collectionSnapshots(healthstoryRef).pipe(takeUntil(this.subscription)).subscribe(listData=>{
          let list = listData.map(doc =>({id:doc.id,...doc.data()}))
          this.ngAfterViewInit(list)
        });
      // }
    });
  }

  ngOnInit(): void {}

  ngAfterViewInit(list){
    this.dataSource.data = list || []
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  filterTable(value){
    this.dataSource.filter = value
  }

  openImage(url){
    window.open(url, '_blank')
  }

  updateStory(value){
    this.dialog.open(UpdateHealthstoryComponent, {
      data: {
        story: value
      },
      maxHeight: "90vh",
      maxWidth: "90vw",
      disableClose: true,
      autoFocus: false,
    })
  }

}
