import { Component, ViewChild } from '@angular/core';
import { CreateChallengeComponent } from '../create-challenge/create-challenge.component';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, takeUntil } from 'rxjs';
import { collection, collectionData, deleteDoc, doc, Firestore } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-challenge-view',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './challenge-view.component.html',
  styleUrl: './challenge-view.component.css'
})
export class ChallengeViewComponent {

  displayedColumns: string[] = ['label','tasks','edit','delete'];
  dataSource = new MatTableDataSource()
  private subscription = new Subject<void>();

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  mapWorkshop = {}

  constructor(
    private firestore:Firestore,
    public dialog:MatDialog
  ) { 
    // this.firestore.collection("eiflix workshop").get().toPromise().then(snap => {
    //   for (let i = 0; i < snap.docs.length; i++) {
    //     const element = snap.docs[i].data();
    //     this.mapWorkshop[element['docid']] = element
    //   }
      const eiflixworkshopchallengesRef = collection(this.firestore,'eiflix workshop challenges')
      collectionData(eiflixworkshopchallengesRef).pipe(takeUntil(this.subscription)).subscribe(challengesnapData => {
        // let challengesnap = challengesnapData.map(doc =>({...{id:doc.id},...doc.data()}))
        // for (let i = 0; i < challengesnap.length; i++) {
        //   const element = challengesnap[i];
        //   element['workshopname'] = this.mapWorkshop[element['workshopref'].id]['title']
        // }
        console.log(challengesnapData);
        
        this.ngAfterViewInit(challengesnapData)
      })
    // })
  }

  ngOnInit(): void {}


  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }

  ngAfterViewInit(tabledata){
    this.dataSource.data = tabledata ?? []
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  onOpenDialog(type:string,doc:any){
    this.dialog.open(CreateChallengeComponent,{
      data:{
        type:type,
        doc:doc
      },
      disableClose:true,
      width:"95%",
      height:"95%"
    })
  }

  async onDeleteDoc(docData:any){
    console.log(docData);
    
    const eiflixworkshopchallengesRef = doc(this.firestore,'eiflix workshop challenges',docData['docid'])
    await deleteDoc(eiflixworkshopchallengesRef)
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

}
