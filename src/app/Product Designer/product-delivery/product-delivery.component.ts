import { Component, ViewChild } from '@angular/core';
import { collection, collectionData, collectionSnapshots, Firestore, orderBy, query } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSortModule } from '@angular/material/sort';

@Component({
  selector: 'app-product-delivery',
  imports: [
    MatFormFieldModule,
    MatPaginatorModule,
    MatTableModule,
    MatSortModule,
    CommonModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './product-delivery.component.html',
  styleUrl: './product-delivery.component.css'
})
export class ProductDeliveryComponent {
@ViewChild(MatPaginator) paginator : MatPaginator;
  productDeliveryHeading = ["product", "sequence", "action"]
  productDeliverySource:MatTableDataSource<any> = new MatTableDataSource()
  mapProduct = {}
  mapDelivery = {}
  private subscription = new Subject<void>();

  constructor(public firestore: Firestore, public dialog: MatDialog, public guard: AuthguardService, public router: Router) {
    // this.guard.getRoles().then(roleData=>{
    //   if(roleData["integrator"] || roleData["admin"] || roleData["ah"]){
    //     console.log("Good")
    //   }
    //   else{
    //     alert("Unauthorized Access")
    //     this.router.navigateByUrl('/')
    //   }
    // })
    // Product
    const productRef = collection(this.firestore,"products")
    collectionSnapshots(productRef).pipe(takeUntil(this.subscription)).subscribe(prod =>{
      for (let i = 0; i < prod.length; i++) {
        const productDoc = prod[i];
        this.mapProduct[productDoc.ref.path] = productDoc.data()["product"]
      }      
    })

    // Appointment
    const appointmenttypeRef = collection(this.firestore,"appointmenttype")
    const appointmenttypeQuery = query(appointmenttypeRef,orderBy('appointmenttype'))
    collectionSnapshots(appointmenttypeQuery).pipe(takeUntil(this.subscription)).subscribe(appt =>{
      for (let i = 0; i < appt.length; i++) {
        const apptDoc = appt[i];
        this.mapDelivery[apptDoc.ref.path] = {
          name: apptDoc.data()["appointmenttype"],
          type: "Appointment"
        }
      }
    })

    // Form
    const deliveryformsRef = collection(this.firestore,"delivery forms")
    const deliveryformsQuery = query(deliveryformsRef,orderBy('formname'))
    collectionSnapshots(deliveryformsQuery).pipe(takeUntil(this.subscription)).subscribe(form =>{
      for (let i = 0; i < form.length; i++) {
        const formDoc = form[i];
        this.mapDelivery[formDoc.ref.path] = {
          name: formDoc.data()["formname"],
          type: "Form"
        }
      }
    })

    // Report
    const deliveryreportRef = collection(this.firestore,"delivery report")
    const deliveryreportQuery = query(deliveryreportRef,orderBy('reportname'))
    collectionSnapshots(deliveryreportQuery).pipe(takeUntil(this.subscription)).subscribe(report =>{
      for (let i = 0; i < report.length; i++) {
        const reportDoc = report[i];
        this.mapDelivery[reportDoc.ref.path] = {
          name: reportDoc.data()["reportname"],
          type: "Report"
        }
      }
    })

    // Event
    const deliveryeventsRef = collection(this.firestore,"delivery events")
    const deliveryeventsQuery = query(deliveryeventsRef,orderBy('eventname'))
    collectionSnapshots(deliveryeventsQuery).pipe(takeUntil(this.subscription)).subscribe(event =>{
      for (let i = 0; i < event.length; i++) {
        const eventDoc = event[i];
        this.mapDelivery[eventDoc.ref.path] = {
          name: eventDoc.data()["eventname"],
          type: "Event"
        }
      }
    })

    // Queue
    const deliveryqueueRef = collection(this.firestore,"delivery queue")
    const deliveryqueueQuery = query(deliveryqueueRef,orderBy('queuename'))
    collectionSnapshots(deliveryqueueQuery).pipe(takeUntil(this.subscription)).subscribe(queue =>{
      for (let i = 0; i < queue.length; i++) {
        const queueDoc = queue[i];
        this.mapDelivery[queueDoc.ref.path] = {
          name: queueDoc.data()["queuename"],
          type: "Queue"
        }
      }
    })

    // Fieldwork
    const deliveryfieldworkRef = collection(this.firestore,"delivery fieldwork")
    const deliveryfieldworkQuery = query(deliveryfieldworkRef,orderBy('fieldworkname'))
    collectionSnapshots(deliveryfieldworkQuery).pipe(takeUntil(this.subscription)).subscribe(fieldwork =>{
      for (let i = 0; i < fieldwork.length; i++) {
        const fieldworkDoc = fieldwork[i];
        this.mapDelivery[fieldworkDoc.ref.path] = {
          name: fieldworkDoc.data()["fieldworkname"],
          type: "Fieldwork"
        }
      }
    })

  }

  ngOnInit(): void {
    const productToDeliverySequenceRef = collection(this.firestore,"productToDeliverySequence")
    collectionSnapshots(productToDeliverySequenceRef).pipe(takeUntil(this.subscription)).subscribe(productDelivery =>{
      var data = []
      for (let i = 0; i < productDelivery.length; i++) {
        const snapshot = productDelivery[i];
        var snapdata = snapshot.data()
        snapdata['product'] = snapdata['product']['path']
        for (let i = 0; i < snapdata['deliveryoptions'].length; i++) {
          const element = snapdata['deliveryoptions'][i];
          for (let j = 0; j < element['deliverysequence'].length; j++) {
            const seqelement = element['deliverysequence'][j];
            if(seqelement['activity']){
              seqelement['activity'] = seqelement['activity']['path']
            }
          }
        }
        data.push({
          product: snapdata["product"],
          sequence: snapdata["deliveryoptions"],
          docid: snapshot.id
        })
      }
      /*
      for (let i = 0; i < productDelivery.length; i++) {
        const snapshot = productDelivery[i].payload.doc;
        var snapdata = snapshot.data()
        var sequenceList = []
        var deliverydescription = []
        for (let j = 0; j < snapdata["deliverysequence"].length; j++) {
          const sequence = snapdata["deliverysequence"][j];
          sequenceList.push(sequence.path) 
          if(snapdata["deliverydescription"] != null){
            deliverydescription.push({
              label: snapdata["deliverydescription"][j].label,
              description: snapdata["deliverydescription"][j].description,
            })
          }
          else{
            deliverydescription.push({
              label: "",
              description: "",
            })
          }
        }
        data.push({
          product: snapdata["product"]["path"],
          sequence: sequenceList,
          deliverydescription: deliverydescription,
          docid: snapshot.id
        })
      }
      */
      this.productDeliverySource.data = data
      this.productDeliverySource.paginator = this.paginator
    })
  }
  ngOnDestroy(){
    this.subscription.next()
    this.subscription.complete()
  }
  addDelivery(){
    /*
    window.scrollTo({
      top : 0,
    })
    this.dialog.open(DeliverySequenceComponent, {
      disableClose: true,
      maxHeight: "90vh"
    })
    */
    this.router.navigateByUrl(`/deliverysequence`)
  }
  

  editDelivery(data){
    /*
    window.scrollTo({
      top : 0,
    })
    this.dialog.open(DeliverySequenceComponent, {
      data: data,
      disableClose: true,
      maxHeight: "90vh"
    })
    */
    this.router.navigateByUrl(`/deliverysequence?data=${data.docid}`)
  }

}
