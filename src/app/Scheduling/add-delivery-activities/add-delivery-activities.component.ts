import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, orderBy, query, writeBatch } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-add-delivery-activities',
  imports: [
    CommonModule,
    FormsModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './add-delivery-activities.component.html',
  styleUrl: './add-delivery-activities.component.css'
})
export class AddDeliveryActivitiesComponent implements OnInit {

  loading: boolean = true
  saving: boolean = false
  profileid: string
  participantproductid: string
  productName: string
  mapdeliveries: { [path: string]: string } = {}
  deliveryList: Array<{ path: string, type: string }> = []
  selectedActivities: Array<{ path: string, type: string }> = []

  constructor(
    public firestore: Firestore,
    @Inject(MAT_DIALOG_DATA) public dialogdata: any,
    public dialogRef: MatDialogRef<any>,
  ) {
    this.profileid = dialogdata["profileid"]
    this.participantproductid = dialogdata["participantproductid"]
    this.productName = dialogdata["productName"] ?? "this product"
  }

  async ngOnInit() {
    this.loading = true
    await this.loadDeliveryActivities()
    this.loading = false
  }

  async loadDeliveryActivities() {
    const collections: Array<{ path: string, nameField: string, type: string, orderField?: string }> = [
      { path: "appointmenttype", nameField: "appointmenttype", type: "appointment" },
      { path: "delivery forms", nameField: "formname", type: "form", orderField: "formname" },
      { path: "delivery report", nameField: "reportname", type: "report", orderField: "reportname" },
      { path: "delivery events", nameField: "eventname", type: "event", orderField: "eventname" },
      { path: "delivery queue", nameField: "queuename", type: "queue", orderField: "queuename" },
      { path: "delivery fieldwork", nameField: "fieldworkname", type: "fieldwork", orderField: "fieldworkname" },
    ]
    for (const c of collections) {
      const ref = collection(this.firestore, c.path)
      const q = c.orderField ? query(ref, orderBy(c.orderField)) : ref
      const snap = await getDocs(q)
      for (const docSnap of snap.docs) {
        this.mapdeliveries[docSnap.ref.path] = docSnap.data()[c.nameField]
        this.deliveryList.push({ path: docSnap.ref.path, type: c.type })
      }
    }
    this.deliveryList.sort((a, b) => this.mapdeliveries[a.path].localeCompare(this.mapdeliveries[b.path]))
  }

  close() {
    this.dialogRef.close()
  }

  async submit() {
    if (this.selectedActivities == null || this.selectedActivities.length === 0) {
      alert("Please select at least one activity to add.")
      return
    }
    this.saving = true

    const sequenceRef = doc(this.firestore, "participantdeliverysequence", this.profileid)
    const sequenceSnap = await getDoc(sequenceRef)
    if (!sequenceSnap.exists()) {
      alert("Delivery sequence not found for this participant.")
      this.saving = false
      return
    }
    const sequenceData = sequenceSnap.data()
    const products: any[] = sequenceData["products"] ?? []
    const productIdx = products.findIndex(p => p["participantproductid"] === this.participantproductid)
    if (productIdx === -1) {
      alert("Product not found in the delivery sequence.")
      this.saving = false
      return
    }

    const product = products[productIdx]
    product["delivery"] = product["delivery"] ?? []

    const batch = writeBatch(this.firestore)

    for (const activity of this.selectedActivities) {
      const newSequenceID = doc(collection(this.firestore, 'deliverables')).id
      const newSequenceRef = doc(this.firestore, "deliverables", newSequenceID)
      batch.set(newSequenceRef, {
        deliveryref: doc(this.firestore, activity.path),
        fileref: [],
        participantproductid: this.participantproductid,
        profileid: this.profileid,
        status: null,
        type: activity.type,
      })
      product["delivery"].push({
        sequenceref: newSequenceRef,
        status: null,
        type: activity.type,
      })
    }

    products[productIdx] = product
    batch.set(sequenceRef, { products: products, profileid: this.profileid }, { merge: true })

    await batch.commit()

    this.saving = false
    this.dialogRef.close(true)
  }
}
