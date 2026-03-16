import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, collectionSnapshots, doc, Firestore, getDocs, orderBy, query, setDoc } from '@angular/fire/firestore';
import { FormGroup, Validators, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable, Subject } from 'rxjs';
import { startWith, map, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-map-journey-product',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    DragDropModule,
    MatButtonModule,
    CommonModule,
    MatCheckboxModule
  ],
  templateUrl: './map-journey-product.component.html',
  styleUrl: './map-journey-product.component.css'
})
export class MapJourneyProductComponent {

  existingJourneys = []
  journeyList = []
  productList = []
  productOrder = []
  mapProduct = {}
  journeyProductForm
  loading:boolean = false

  subscription = new Subject<void>();

  constructor(public firestore: Firestore, public formbuilder:FormBuilder, @Inject(MAT_DIALOG_DATA) public data:any, public dialogRef: MatDialogRef<any>) {
    console.log(this.data)
    this.journeyProductForm = this.formbuilder.group({
      journey: [,{validators: [Validators.required], updateOn : "change"}],
      product: [,{validators: [Validators.required], updateOn:"change"}],
      journeyrequiredjourneycoach: [false,]
    })
    if(this.data != null){
      var value = this.data
      this.journeyProductForm.patchValue({
        product: value.product,
        journey: value.journey,
        journeyrequiredjourneycoach: value.journeyrequiredjourneycoach
      })
      this.productOrder = value.product
    }
  }

  ngOnInit(): void {
    if(this.data == null){
      const journeyproductCollection = collection(this.firestore, 'journey-to-product')
      getDocs(journeyproductCollection).then(sequence=>{
        for (let i = 0; i < sequence.docs.length; i++) {
          const doc = sequence.docs[i];
          this.existingJourneys.push(doc.data()["journey"]["path"])
        }
      })
    }

    const journeyCollection = collection(this.firestore, 'journey')
    collectionSnapshots(journeyCollection).pipe(takeUntil(this.subscription)).subscribe(journey => {
      var data = []
      for (let i = 0; i < journey.length; i++) {
        const doc = journey[i];
        data.push({
          name: doc.data()["journey"],
          path: doc.ref.path
        })
      }
      this.journeyList = data
    })

    const productCollection = collection(this.firestore, 'products')
    const productquery = query(productCollection, orderBy('product'))
    collectionSnapshots(productquery).pipe(takeUntil(this.subscription)).subscribe(product=>{
      var data = []
      for (let i = 0; i < product.length; i++) {
        const doc = product[i];
        this.mapProduct[doc.ref.path] = doc.data()["product"]
        data.push({
          name: doc.data()["product"],
          path: doc.ref.path
        })
      }
      this.productList = data
    })
  }

  onJourneySelect(value){
    if(this.existingJourneys.includes(value)){
      this.journeyProductForm.controls.journey.setErrors({exists: true})
    }
    else{
      this.journeyProductForm.controls.journey.setErrors(null)
    }
  }

  onProductSelect(){
    var data = this.journeyProductForm.get("product").value
    var neworder = this.productOrder
    for (let i = 0; i < data.length; i++) {
      const delivery = data[i];
      if(!neworder.includes(delivery)){
        neworder.push(delivery)
      }
    }
    for (let i = 0; i < neworder.length; i++) {
      const delivery = neworder[i];
      if(!data.includes(delivery)){
        neworder.splice(i, 1)
      }
    }
    this.productOrder = neworder
  }

  addAgain(item){
    this.productOrder.push(item)
  }
  
  remove(index){
    this.productOrder.splice(index, 1)
    if(this.productOrder.length == 0){
      this.journeyProductForm.patchValue({
        deliverysequence: []
      })
    }
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.productOrder, event.previousIndex, event.currentIndex);
  }

  async updateJourneyProduct(){
    this.loading = true
    if(this.journeyProductForm.valid && this.productOrder.length != 0){
      var journeyid = this.journeyProductForm.get("journey").value
      var journey = doc(this.firestore, journeyid)
      const productRefs = this.productOrder.map(productPath =>
        doc(this.firestore, productPath)
      );
      const journeyRequiredCoach = this.journeyProductForm.get('journeyrequiredjourneycoach')?.value;

      const id = this.data?.docid ?? doc(collection(this.firestore, 'journey-to-product')).id;

      const dataToSave = {
        journey: journey,
        product: productRefs,
        journeyrequiredjourneycoach: journeyRequiredCoach
      };

      try {
        const docRef = doc(this.firestore, `journey-to-product/${id}`);
        await setDoc(docRef, dataToSave);
        this.close(); 
      } catch (error) {
        console.error('Error saving document:', error);
      }
    }
    this.loading = false
  }
    

  close(){
    this.dialogRef.close()
  }

}
