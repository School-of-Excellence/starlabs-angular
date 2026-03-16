import { Component, OnInit } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDocs, orderBy, query, where } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-queue-venue',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    FormsModule,
    DragDropModule,
    MatFormFieldModule,
    MatButtonModule,
  ],
  templateUrl: './queue-venue.component.html',
  styleUrl: './queue-venue.component.css'
})
export class QueueVenueComponent {
  draganddropData=[]
  connectedTo=[]
  loading=true
  queuelist=[]
  hide=true

  constructor(public firestore: Firestore, public dialog: MatDialog,private router:Router, public guard: AuthguardService, private snackBar: MatSnackBar) { 
  
    this.loading=true
    this.guard.getRoles().then(roleData=>{
      // if(roleData["integrator"] || roleData["admin"] || roleData["ah"]){
        console.log("Good")

        getDocs(collection(this.firestore, 'queue generation')).then(res=>{
          for (let i = 0; i < res.docs.length; i++) {
            const element = res.docs[i];
           var data={}
           data['queueref'] = element.ref.path
           data['queuedata'] = element.data()
            this.queuelist.push(data)     
          }

          this.loading = false
        });

      // }
      // else{
      //   alert("Unauthorized Access")
      //   this.router.navigateByUrl('/')
      // }
    })

  }

  ngOnInit(): void {

  }

  drop(event: CdkDragDrop<any[]>) {
    if (event.previousContainer === event.container) {
      // Moving within the same list
      moveItemInArray(
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    } else {
      // Moving between different lists
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
  }

  drag(event: MatRadioChange){
    this.hide = false
    const value = event.value
    console.log(value);

    const loadingref = this.dialog.open(LoadingProgressComponent,{
      data:{
        msg:"Loading please \nwait........"
      }
    })
    
    collectionData(query(collection(this.firestore, 'queue_token'), where("queueref","==", doc(this.firestore, value.queueref)), where("tokenstatus","==","Active"), orderBy("logdate", "asc"))).subscribe(res=>{
      console.log(res)
      this.draganddropData=[]

      for (let i = 0; i < value.queuedata.stages.length; i++) {
        const element = value.queuedata.stages[i];
  
        var alldata={}
  
        alldata['heading']=element
        alldata['data']=[] 
    
        this.draganddropData.push(alldata)
      }

      var data=[]
      res.forEach(doc=>{
        data.push(doc)
      })
      

      for (let i = 0; i < this.draganddropData.length; i++) {

        for (let j = 0; j < data.length; j++) {
                
        if(this.draganddropData[i].heading == data[j]["currentstage"]){
  
        let x = this.draganddropData[i].data.some(item=>item.docid == data[j]["docid"] )
  
        if(x == false){
        
          this.draganddropData[i].data.push(data[j])
          
        }
      }
    }
    }    
    for (let week of this.draganddropData) {
  
      if(this.connectedTo.includes(week.heading) == false){
      this.connectedTo.push(week.heading)
    }     
   };
    loadingref.close()
    })
  }
}
