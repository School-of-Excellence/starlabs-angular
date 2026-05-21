import { Component, OnInit, ViewChild,  } from '@angular/core';
import { collection, collectionData, Firestore, where , query, orderBy, doc, setDoc, updateDoc, writeBatch } from '@angular/fire/firestore';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Router, RouterModule } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { BigEventInvitationComponent } from '../event-opportunity-dashboard/big-event-invitation/big-event-invitation.component';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { QueueCreationV3Component } from '../queue-creation-v3/queue-creation-v3.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { CommonModule } from '@angular/common';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';


@Component({
  selector: 'app-queue-list',
  imports: [
    MatFormFieldModule,
    MatTableModule,
    MatInputModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    RouterModule,
    MatSlideToggleModule,
    CommonModule,
    MatNativeDateModule,
    MatDatepickerModule,
    MatDialogModule
  ],
  templateUrl: './queue-list.component.html',
  styleUrl: './queue-list.component.css'
})
export class QueueListComponent {
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  queueColumns = ["menu","queuename", "queuestartdate", "stages", "action","delete"]
  queueSource = new MatTableDataSource();
  
  private subscription = new Subject<void>()
  constructor(public firestore: Firestore, public dialog: MatDialog,private router:Router, public guard: AuthguardService) {
    // this.guard.getRoles().then(roleData=>{
    //   if(roleData["integrator"] || roleData["admin"] || roleData["ah"]){
    //     console.log("Good")
    //   }
    //   else{
    //     alert("Unauthorized Access")
    //     this.router.navigateByUrl('/')
    //   }
    // })
    collectionData(query(collection(this.firestore, 'queue generation'), orderBy("queuestartdate", "desc")), {idField: 'id'}).pipe(takeUntil(this.subscription)).subscribe(data => {
      this.queueSource.data = data
      this.queueSource.sort = this.sort
      this.queueSource.paginator = this.paginator
    })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(){
    this.subscription.complete();
    this.subscription.next();
  }

  applyFilter(value){
    this.queueSource.filter = value
  }

  cloneQueue(queue){
    if(confirm("Sure, do you want to clone this queue?")){
      queue["docid"] = doc(collection(this.firestore, 'queue generation')).id
      queue["queuename"] = queue["queuename"] + " - Clone"
      queue["queuevariation"] = null
      queue["arenaeventidlist"] = []
      setDoc(doc(this.firestore, 'queue generation', queue["docid"]), queue).then(()=>{
        console.log(queue)
        alert("Success")
      }).catch(err =>{
        console.log(err)
      })
    }
  }

  // createQueue(data){
  //   window.scrollTo({
  //     top : 0,
  //     behavior : 'smooth',
  //   })
  //   this.dialog.open(QueueCreationComponent, {
  //     data: data != null ? Object.assign({}, data) : null,
  //     autoFocus: false,
  //     disableClose: true,
  //     maxHeight: "98vh",
  //     maxWidth: "98vw"
  //   })
  // }

  createQueue(data){
    window.scrollTo({
      top : 0,
      behavior : 'smooth',
    })
    console.log("row",data)
    this.dialog.open(QueueCreationV3Component, {
      data: data != null ? Object.assign({}, data) : null,
      autoFocus: false,
      disableClose: true,
      height: "100vh",
      width: "100vw",
      maxWidth: "100vw",
      // panelClass :'full-width-dialog'
    })
  }

  inviteParticipant(data){
    console.log(data)
    window.scrollTo({
      top : 0,
      behavior : 'smooth',
    })
    this.dialog.open(BigEventInvitationComponent, {
      data: Object.assign({}, data),
      autoFocus: false,
      disableClose: true,
      width: '60%',
      height: '50%'
    })
  }

  planstudioPairing(queue){
    console.log(queue)
    this.router.navigateByUrl("arenastudiopairing/"+queue["docid"])
  }

  async onDelete(event: any, document: any) {
    try {
      const batch = writeBatch(this.firestore);
  
      const queueDocRef = doc(this.firestore, 'queue generation', document['docid']);
      batch.update(queueDocRef, { delete: event.checked });
  
      document['arenaeventidlist'].forEach(id => {
        const arenaDocRef = doc(this.firestore, 'arena events', id);
        batch.update(arenaDocRef, { delete: event.checked });
      });
  
      await batch.commit();
      console.log('Batch update completed successfully');
    } catch (error) {
      console.error('Error in batch update:', error);
    }
  }
}
