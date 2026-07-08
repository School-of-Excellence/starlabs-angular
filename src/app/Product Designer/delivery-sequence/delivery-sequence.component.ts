import { Component } from '@angular/core';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, collectionSnapshots, doc, Firestore, getDoc, getDocs, orderBy, query, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { CdkDragDrop, moveItemInArray, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-delivery-sequence',
  imports: [
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatInputModule,
    CommonModule,
    MatChipsModule,
    MatRadioModule,
    MatSelectModule,
    MatCardModule,
    CdkDragPlaceholder,
    CdkDropList
  ],
  templateUrl: './delivery-sequence.component.html',
  styleUrl: './delivery-sequence.component.css'
})
export class DeliverySequenceComponent {

  mapdeliveries = {}
  existingProducts = []
  productList = []
  deliveryList = []

  data = null
  producttodelivery = {}
  nonexistingproductlist
  private subscription = new Subject<void>();

  get loadingref(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg:"Please wait processing"},disableClose:true})
  }
  
  constructor(public firestore: Firestore, public formbuilder:FormBuilder,public route : ActivatedRoute,private dialog : MatDialog,private router : Router ) {

   this.data = this.route.snapshot.queryParams['data'] != null ?  this.route.snapshot.queryParams['data'] : null
  console.log(this.data);
  
    if(this.data != null){
      const productToDeliverySequenceDocRef = doc(this.firestore, "productToDeliverySequence", this.data);
      getDoc(productToDeliverySequenceDocRef).then(async snap => {
        this.producttodelivery = snap.data()
        // Convert the stored Firestore refs -> path strings IN PLACE: the two-way-bound edit form renders
        // these strings, and onproducttodeliverysubmit() converts the SAME strings back to refs before
        // setDoc (the load-bearing round-trip — keep the path-string shape). Null-guard every hop: a mapping
        // may be authored with a delivery option that has NO deliverysequence (e.g. the seeded jny_PDS1 ->
        // deliveryoptions:[{deliverytype:'Standard Delivery'}]) or a null activity, which pre-guard threw
        // "Cannot read properties of undefined" inside this .then() and stranded the form. Normalize
        // deliveryoptions/deliverysequence to arrays in place so BOTH the form binding and the submit walk
        // are safe; `?.path ?? value` tolerates an already-string path (idempotent).
        this.producttodelivery['product'] = this.producttodelivery['product']?.path ?? this.producttodelivery['product'] ?? null
        this.producttodelivery['deliveryoptions'] = this.producttodelivery['deliveryoptions'] ?? []
        for (let i = 0; i < this.producttodelivery['deliveryoptions'].length; i++) {
          let element = this.producttodelivery['deliveryoptions'][i]
          element['deliverysequence'] = element['deliverysequence'] ?? []
          for (let j = 0; j < element['deliverysequence'].length; j++) {
            const seqelement = element['deliverysequence'][j];
            seqelement['activity'] = seqelement['activity']?.path ?? seqelement['activity'] ?? null
          }
        }
        console.log(this.producttodelivery);
      })
    }else{
      this.producttodelivery = {
        product : null,
        deliveryoptions : [
          {
            deliverytype:null,
            deliverysequence:[
              {
                activity:null,
                label : null,
                description:null
              }
            ]
          }
        ]
      }
    }
    //
  }

  ngOnInit(): void {
    const productRef = collection(this.firestore,'products')
    const productQuery = query(productRef,orderBy('product'))
    const productToDeliverySequenceRef = collection(this.firestore,'productToDeliverySequence')
    collectionSnapshots(productQuery).pipe(takeUntil(this.subscription)).subscribe( async product=>{
      var data = []
      for (let i = 0; i < product.length; i++) {
        const doc = product[i];
        data.push({
          name: doc.data()["product"],
          path: doc.ref.path
        })
      }
      this.productList = data
      if(this.data == null){
        getDocs(productToDeliverySequenceRef).then(sequence=>{
          for (let i = 0; i < sequence.docs.length; i++) {
            const doc = sequence.docs[i];
            this.existingProducts.push(doc.data()["product"]["path"])
          }
          this.nonexistingproductlist = this.productList.filter(e => {
            if(!this.existingProducts.some(item => item === e.path)){
              return e
            }
          })
        })
      }else{
        this.nonexistingproductlist = this.productList
        console.log(this.nonexistingproductlist);
        
      }
    })

    var apptList = []
    var eventList = []
    var formList = []
    var reportList = []
    var queueList = []
    var fieldworkList = []
    // Appointment
    const appointmenttypeRef = collection(this.firestore,'appointmenttype')
    const appointmenttypeQuery = query(appointmenttypeRef,orderBy('appointmenttype'))
    collectionSnapshots(appointmenttypeQuery).pipe(takeUntil(this.subscription)).subscribe(appt=>{
      var data = []
      for (let i = 0; i < appt.length; i++) {
        const apptDoc = appt[i];
        data.push({
          type: "Appointment",
          deliveryname: apptDoc.data()["appointmenttype"],
          path: apptDoc.ref.path
        })
        this.mapdeliveries[apptDoc.ref.path] = apptDoc.data()["appointmenttype"]
      }
      apptList = data
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliveryList = list
    })

    // Form
    const deliveryformsRef = collection(this.firestore,'delivery forms')
    const deliveryformsQuery = query(deliveryformsRef,orderBy('formname'))
    collectionSnapshots(deliveryformsQuery).pipe(takeUntil(this.subscription)).subscribe(form=>{
      var data = []
      for (let i = 0; i < form.length; i++) {
        const formDoc = form[i];
        data.push({
          type: "Form",
          deliveryname: formDoc.data()["formname"],
          path: formDoc.ref.path
        })
        this.mapdeliveries[formDoc.ref.path] = formDoc.data()["formname"]
      }
      formList = data
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliveryList = list
    })

    // Report
    const deliveryreportRef = collection(this.firestore,'delivery report')
    const deliveryreportQuery = query(deliveryreportRef,orderBy('reportname'))
    collectionSnapshots(deliveryreportQuery).pipe(takeUntil(this.subscription)).subscribe(report=>{
      var data = []
      for (let i = 0; i < report.length; i++) {
        const reportDoc = report[i];
        data.push({
          type: "Report",
          deliveryname: reportDoc.data()["reportname"],
          path: reportDoc.ref.path
        })
        this.mapdeliveries[reportDoc.ref.path] = reportDoc.data()["reportname"]
      }
      reportList = data
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliveryList = list
    })

    // Event
    const deliveryeventsRef = collection(this.firestore,'delivery events')
    const deliveryeventsQuery = query(deliveryeventsRef,orderBy('eventname'))
    collectionSnapshots(deliveryeventsQuery).pipe(takeUntil(this.subscription)).subscribe(event=>{
      var data = []
      for (let i = 0; i < event.length; i++) {
        const eventDoc = event[i];
        data.push({
          type: "Events",
          deliveryname: eventDoc.data()["eventname"],
          path: eventDoc.ref.path
        })
        this.mapdeliveries[eventDoc.ref.path] = eventDoc.data()["eventname"]
      }
      eventList = data
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliveryList = list
    })

    // Queue
    const deliveryqueueRef = collection(this.firestore,'delivery queue')
    const deliveryqueueQuery = query(deliveryqueueRef,orderBy('queuename'))
    collectionSnapshots(deliveryqueueQuery).pipe(takeUntil(this.subscription)).subscribe(queue=>{
      var data = []
      for (let i = 0; i < queue.length; i++) {
        const queueDoc = queue[i];
        data.push({
          type: "Queue",
          deliveryname: queueDoc.data()["queuename"],
          path: queueDoc.ref.path
        })
        this.mapdeliveries[queueDoc.ref.path] = queueDoc.data()["queuename"]
      }
      queueList = data
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliveryList = list
    })

     // Field Work
    const deliveryfieldworkRef = collection(this.firestore,'delivery fieldwork')
    const deliveryfieldworkQuery = query(deliveryfieldworkRef,orderBy('fieldworkname'))
    collectionSnapshots(deliveryfieldworkQuery).pipe(takeUntil(this.subscription)).subscribe(fieldwork=>{
      var data = []
      for (let i = 0; i < fieldwork.length; i++) {
        const workDoc = fieldwork[i];
        data.push({
          type: "Queue",
          deliveryname: workDoc.data()["fieldworkname"],
          path: workDoc.ref.path
        })
        this.mapdeliveries[workDoc.ref.path] = workDoc.data()["fieldworkname"]
      }
      fieldworkList = data
      var list = [...apptList, ...eventList, ... formList, ...reportList, ...queueList, ...fieldworkList]
      this.deliveryList = list
    })
  }

  adddelvierysequence(index){
    this.producttodelivery['deliveryoptions'][index]['deliverysequence'].push(
      {
        activity:null,
        label : null,
        description:null
      }
    )
  }

  removedeliverysequence(index,seq){
    this.producttodelivery['deliveryoptions'][index]['deliverysequence'].splice(seq,1)
  }

  adddelvieryoption(){
    this.producttodelivery['deliveryoptions'].push(
      {
        deliverytype:null,
        deliverysequence:[
          {
            activity:null,
            label : null,
            description:null
          }
        ]
      }
    )
  }

  removedeliveryoption(index){
    this.producttodelivery['deliveryoptions'].splice(index,1)
  }

  async onproducttodeliverysubmit(){
    console.log(this.producttodelivery);
    if(confirm("are you sure want to submit")){
      let loadingref = this.loadingref
      // let obj = {...Object.assign({},this.producttodelivery)}
      // let obj = JSON.parse(JSON.stringify(this.producttodelivery))
      let obj = this.producttodelivery
      // obj['product'] = this.firestore.doc(obj['product']).ref
       obj['product'] = doc(this.firestore, obj['product']);
      for (let i = 0; i < obj['deliveryoptions'].length; i++) {
        const element = obj['deliveryoptions'][i];
        for (let j = 0; j < element['deliverysequence'].length; j++) {
          const seqelement = element['deliverysequence'][j];
          seqelement['activity'] = doc(this.firestore, seqelement['activity']);
        }
      }
      console.log(obj);
      const Id = this.data != null ? this.data : doc(collection(this.firestore, 'productToDeliverySequence')).id;
      console.log(this.producttodelivery);
      const docRef = doc(this.firestore, 'productToDeliverySequence', Id);
      try {
        await setDoc(docRef, obj);
        console.log("Document successfully updated");
        loadingref.close();
        this.router.navigateByUrl('/productdelivery');
      } catch (err) {
        console.log(err);
      }
    }
  }

  pdrop(event: CdkDragDrop<string[]>,index) {
    moveItemInArray(this.producttodelivery['deliveryoptions'][index]['deliverysequence'], event.previousIndex, event.currentIndex);
  }
  ngOnDestroy(){
    this.subscription.next()
    this.subscription.complete()
  }
}