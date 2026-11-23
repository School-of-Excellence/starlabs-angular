import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, doc, documentId, Firestore, getDocs, query, where } from '@angular/fire/firestore';
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

// Activity collection -> the field holding its display name + the type label shown in the list.
// Mirrors the activity pickers in delivery-sequence.component.ts (VideoAsk = arenavideoask.title).
const DELIVERY_SOURCES: Record<string, { field: string, type: string }> = {
  'appointmenttype': { field: 'appointmenttype', type: 'Appointment' },
  'delivery forms': { field: 'formname', type: 'Form' },
  'delivery report': { field: 'reportname', type: 'Report' },
  'delivery events': { field: 'eventname', type: 'Event' },
  'delivery queue': { field: 'queuename', type: 'Queue' },
  'delivery fieldwork': { field: 'fieldworkname', type: 'Fieldwork' },
  'arenavideoask': { field: 'title', type: 'VideoAsk' },
}

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
  private fetchedPaths = new Set<string>()
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
    // Products and delivery activities are NOT loaded up front any more. Only the documents that
    // productToDeliverySequence actually references are fetched — see resolveNames().
  }

  ngOnInit(): void {
    const productToDeliverySequenceRef = collection(this.firestore,"productToDeliverySequence")
    collectionSnapshots(productToDeliverySequenceRef).pipe(takeUntil(this.subscription)).subscribe(productDelivery =>{
      var data = []
      for (let i = 0; i < productDelivery.length; i++) {
        const snapshot = productDelivery[i];
        const snapdata = snapshot.data()
        // Build a FRESH derived view-model per emit — never mutate snapdata. collectionSnapshots
        // re-emits on every change (and may hand back the same underlying objects), so writing the
        // resolved `.path` back onto snapdata['product'] / seqelement['activity'] would, on the next
        // emit, run ['path'] on an already-string value (-> undefined) and the deliverysequence loop
        // would throw "Cannot read properties of undefined (reading 'length')" — collapsing the table
        // to zero rows. Reading each ref's path into NEW objects/arrays is idempotent
        // (`?.path ?? value` tolerates an already-string path) and null-safe (a mapping with no
        // deliverysequence yet maps to []).
        const productPath = snapdata['product']?.path ?? snapdata['product'] ?? null
        const sequence = (snapdata['deliveryoptions'] ?? []).map(element => ({
          ...element,
          deliverysequence: (element['deliverysequence'] ?? []).map(seqelement => ({
            ...seqelement,
            activity: seqelement['activity']?.path ?? seqelement['activity'] ?? null,
          })),
        }))
        data.push({
          product: productPath,
          sequence: sequence,
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
      this.resolveNames(data)
    })
  }

  // Fetch ONLY the product + activity docs the mappings reference, once each. Paths are grouped by
  // collection and read with documentId() 'in' queries (Firestore caps 'in' at 30 values per query),
  // all in parallel. A path already fetched is skipped, so a re-emit of productToDeliverySequence only
  // reads newly mapped docs. Names are read once — a rename shows after the screen is reopened.
  private async resolveNames(rows: any[]) {
    const idsByCollection: Record<string, string[]> = {}
    const add = (path: string) => {
      if (path == null || this.fetchedPaths.has(path)) return
      const ref = doc(this.firestore, path)
      const coll = ref.parent.id
      // Same as before: an activity in a collection this screen has no name field for renders blank.
      if (coll !== 'products' && DELIVERY_SOURCES[coll] == null) return
      this.fetchedPaths.add(path);
      (idsByCollection[coll] ??= []).push(ref.id)
    }
    for (const row of rows) {
      add(row.product)
      for (const option of row.sequence) {
        for (const seq of option.deliverysequence) {
          add(seq.activity)
        }
      }
    }

    const reads = []
    for (const coll of Object.keys(idsByCollection)) {
      const ids = idsByCollection[coll]
      for (let i = 0; i < ids.length; i += 30) {
        reads.push(getDocs(query(collection(this.firestore, coll), where(documentId(), 'in', ids.slice(i, i + 30)))))
      }
    }
    const results = await Promise.all(reads)

    const mapProduct = { ...this.mapProduct }
    const mapDelivery = { ...this.mapDelivery }
    for (const snap of results) {
      for (const d of snap.docs) {
        const coll = d.ref.parent.id
        if (coll === 'products') {
          mapProduct[d.ref.path] = d.data()['product']
        } else {
          mapDelivery[d.ref.path] = {
            name: d.data()[DELIVERY_SOURCES[coll].field],
            type: DELIVERY_SOURCES[coll].type
          }
        }
      }
    }
    this.mapProduct = mapProduct
    this.mapDelivery = mapDelivery
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
