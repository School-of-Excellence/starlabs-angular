import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { collection, deleteDoc, doc, DocumentReference, Firestore, getDocs, orderBy, query, setDoc, updateDoc } from '@angular/fire/firestore';
import { FormGroup, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage } from '@angular/fire/storage';
import { NgIf, NgFor, CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-dialog-add-product',
  imports: [
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    CommonModule,
    MatCheckboxModule,
    MatInputModule,
    NgIf,
    NgFor,
    MatFormFieldModule,
    MatChipsModule,
    MatRadioModule,
    MatSelectModule,
    MatTableModule,
    
  ],
  templateUrl: './dialog-add-product.component.html',
  styleUrl: './dialog-add-product.component.css'
})
export class DialogAddProductComponent {
@ViewChild('fileupload') fileuploadref : ElementRef<HTMLInputElement>
  addProductForm!: FormGroup
  productarray = []
  dialogtitle
  submitbutton
  crossmatch:boolean
  croosmatcherrormessage
  delete = false
  modeList = [
    "Installation Event Mode",
    "Big Mode",
    "Event Mode",
    "Integration Mode",
    "Priority Mode",
    "Preparation Mode",
    "Performance Mode",
    "Journey Priority Planning Mode",
    "Extended Performance Mode",
    "Early Preparation Mode",
    "Journey Planning Mode",
    "Exploration Mode",
    "After Extended Performance Mode",
    "Snooze Mode",
    "Investment Mode"
  ] 
  productimage : any  = {
    file : null,
    previewurl:null,
    url:null
  };
  deliveryTypeList = []
  deliveryPlanningOption = ["normal", "priority"]
  atcModelList = []
  videos = [];
  get loadingDialog(){
    return this.dialog.open(LoadingProgressComponent,{
      data:{
        msg : "uploading Please wait"
      },
      disableClose:true
    })
  }
  constructor(
    public dialogref:MatDialogRef<DialogAddProductComponent>,
    @Inject(MAT_DIALOG_DATA) public data : any,
    private dialog:MatDialog,
    private fb : FormBuilder,private afs: Firestore,
    private storage : Storage
  ) {
    this.submitbutton = this.data !== null ? "Update" : "Submit"
    this.dialogtitle = this.data !== null ? "Edit Product" : "Add Product"
    this.initializeForm()
    if(this.data){
      if(this.data.delete){
        this.delete = this.data.delete
      }if(this.data.product){
        this.addProductForm.patchValue({
          product : data.product,
          // count : data.count,
          originalfee:data.originalfee ?? 0,
          minimumRequiredAmount : data.minimumrequiredamount,
          atcmodel : data.atcmodel,
          unlimited : data.unlimited != null ? data.unlimited : false,
          mode:data.mode,
          deliveryplanning:data.deliveryplanning,
          integrationdays: data.integrationdays ?? null,
          performancedays: data.performancedays ?? null,
          extendedperformancedays: data.extendedperformancedays ?? null,
          delaydays: data.delaydays ?? null,
          deliverytype: (data.deliverytype ?? []).map(e => e.path),
          directive: data.directive ?? null,
          type : data.type ?? null,
          modeflow: data.modeflow ?? [],
          // category:data.category ?? []
          selfbooking: data?.selfbooking ?? false,
          playlist : data.playlist ?? []
        })
        this.productimage.url = data.image
      }
    }   
    this.productFetch()
    /////////// end
  }
  async productFetch(){
  const productsRef = collection(this.afs,'products')
  try {
    const getProduct = await getDocs(productsRef)
    for (let i = 0; i < getProduct.docs.length; i++) {
      const doc = getProduct.docs[i]
      const productName = doc.data()['product']  
      const docmatch = this.productarray.some((item: string) => item === productName);
      if (!docmatch) {
        this.productarray.push(productName);
      }
    }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }
  initializeForm(){
      this.addProductForm = this.fb.group ({
      product: [,{validators : [Validators.required],updateOn : "change"}],
      // count:[,{validators : [Validators.required],updateOn : "change"}],
      deliveryplanning: [,{validators : [Validators.required],updateOn : "change"}],
      mode: [,{validators : [Validators.required],updateOn : "change"}],
      originalfee: [0,{validators : [Validators.required],updateOn : "change"}],
      minimumRequiredAmount: [,{validators : [Validators.required],updateOn : "change"}],
      atcmodel: [,{validators : [Validators.required],updateOn : "change"}],
      unlimited: [false,{validators : [Validators.required],updateOn : "change"}],
      integrationdays: [,{validators : [],updateOn : "change"}],
      performancedays: [,{validators : [],updateOn : "change"}],
      extendedperformancedays: [,{validators : [],updateOn : "change"}],
      delaydays: [,{validators : [],updateOn : "change"}],
      deliverytype: [[] ,{validators : [],updateOn : "change"}],
      // category: [[] ,{validators : [],updateOn : "change"}],
      directive: [null ,{validators : [],updateOn : "change"}],
      type : [,{validators : [Validators.required],updateOn : "change"}],
      modeflow: [[],{validators : [Validators.required],updateOn : "change"}],
      selfbooking: [false,{validators : [Validators.required],updateOn : "change"}],
      playlist: [[],{validators : [],updateOn : "change"}],
    })
  }
  ngOnInit(): void {
    this.fetchAtcQueueEvents()
  }
  async fetchAtcQueueEvents(){
    const deliveryeventsRef = collection(this.afs,'delivery events')
    const deliveryqueueRef = collection(this.afs,'delivery queue')
    const atcmodelRef = collection(this.afs,'atc model')

    const deliveryeventsQuery = query(deliveryeventsRef,orderBy('eventname'))
    const deliveryqueueQuery = query(deliveryqueueRef,orderBy('queuename'))

    try {
      const getatcmodel = await getDocs(atcmodelRef)
      this.atcModelList = getatcmodel.docs.map(e => e.data())

    } catch (error) {
      console.error(error)
    }

    try {
      const getdeliveryevents = await getDocs(deliveryeventsQuery)
      let queueList = []
      for (let i = 0; i < getdeliveryevents.docs.length; i++) {
        const doc = getdeliveryevents.docs[i]  
        queueList.push({
          deliveryname: doc.data()["queuename"],
          deliverypath: doc.ref.path,
          type: "queue"
        })
      }
      this.deliveryTypeList = [...this.deliveryTypeList, ...queueList]
    } catch (error) {
      console.error(error)
    }

    try {
      const getdeliveryqueue = await getDocs(deliveryqueueQuery)
      let eventList = []
      for (let i = 0; i < getdeliveryqueue.docs.length; i++) {
        const doc = getdeliveryqueue.docs[i]  
        eventList.push({
          deliveryname: doc.data()["eventname"],
          deliverypath: doc.ref.path,
          type: "event"
        })
      }
      this.deliveryTypeList = [...this.deliveryTypeList, ...eventList]
    } catch (error) {
      console.error(error)
    }

    getDocs(query(collection(this.afs,"content_urls"))).then((content) => {
      this.videos = content.docs.map(e => ({docref: e.ref,...e.data()}));
    })

  }

  onvaluechange(event){
    // console.log(event);
    const match = this.productarray.some((items) => {
      // console.log(items);
      let a = event?.replace(/ /g, "").toLowerCase()
      let b = items.replace(/ /g, "").toLowerCase()
      // console.log(a);
      // console.log(b);
      return a === b
    })
    // console.log(match );
    this.crossmatch = match
    return this.croosmatcherrormessage = match === true ? event + " already exist .Choose another role" : false
  }

  ////form validation
  getErrorMessage(){
    if(this.addProductForm.get('product').hasError('required')){
      return 'you must enter a Product'
    }

    if(this.addProductForm.get('minimumRequiredAmount').hasError('required')){
      return 'you must enter a minimum amount required for pre-delivery'
    }
    if(this.addProductForm.get('atcmodel').hasError('required')){
      return 'you must enter a ATC Model for this product'
    } else {
      return ''
    }
  }
  ///on form submit
  async onformsubmit(value) {
    this.addProductForm.reset();
    let loading = this.loadingDialog
    const productData = {
      product: value.product,
      mode: value.mode,
      deliverytype: value.mode === "Event Mode" ? value.deliverytype.map((e: string) => doc(this.afs, e)) : null,
      minimumrequiredamount: value.minimumRequiredAmount,
      atcmodel: value.atcmodel,
      unlimited: value.unlimited,
      integrationdays: value.integrationdays ?? null,
      delaydays: value.delaydays ?? null,
      image: this.productimage.url ?? null,
      directive: value.directive,
      originalfee: value.originalfee ?? 0,
      deliveryplanning: value.deliveryplanning,
      performancedays: value.performancedays ?? null,
      extendedperformancedays: value.extendedperformancedays ?? null,
      type: value.type ?? null,
      modeflow: value.modeflow,
      selfbooking: value.selfbooking,
      playlist: (value.playlist ?? []).length == 0 ? value.playlist : null
    };
    if (this.data !== null) {
      const productDoc = doc(this.afs, "products", this.data.id);
      await updateDoc(productDoc, productData).then( () => {
        this.addProductForm.reset()
        console.log("edit document  succesfully updated to database");
        loading.close()
        this.dialogref.close()
      }).catch( err => {
        console.log(err);
        loading.close()
      })
    } else {
      const newDocRef = doc(collection(this.afs, "products"));
      const newProductData = {
        id: newDocRef.id,
        ...productData
      };
      await setDoc(newDocRef, newProductData).then( () => {
        this.addProductForm.reset()
        this.productimage = {
          file:null,
          previewurl :null,
          url : null
        }
        console.log("form successfully submitted");
        loading.close()
      }).catch( (err) => {
        console.log(err);
        loading.close()
      })
    }
  }
  //////
  ondelete(id){
    // console.log(id);
    const productRef = collection(this.afs,'products')
    const productDoc = doc(productRef,id)
    deleteDoc(productDoc).then(() =>{
      console.log("document successfully deleted");
      this.dialogref.close()
    })
  }
  ////
  onCancel(){
    this.dialogref.close()
  }
  ///
  uploadImage(file){
    // console.log(file);
    const reader = new FileReader()
    if(file){
      this.productimage.file = file[0]
      reader.readAsDataURL(file[0])
      reader.onload = (e) => {
        // console.log(e);
        this.productimage.previewurl = reader.result as string
      }
    }
  }
  async submitImageToStorage(){
    try {
      const filepath = "productimages/" + this.productimage.file.name;
      const storageRef = ref(this.storage, filepath);
      const uploadResult = await uploadBytes(storageRef, this.productimage.file);
      const downloadURL = await getDownloadURL(uploadResult.ref);
      this.productimage.url = downloadURL;
      
      console.log("image uploaded successfully");
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  }

  async onImageRemove(){
    if(this.productimage.previewurl != null && this.productimage.url === null){
      console.log("on adding new product image");
      this.productimage.previewurl = null
      this.productimage.file = null
      this.fileuploadref.nativeElement.value = null
    }else if(this.productimage.previewurl === null && this.productimage.url != null){
      console.log("onedit product image");
      try {
        const storageRef = ref(this.storage, this.productimage.url);
        await deleteObject(storageRef);
        this.productimage.url = null;
        console.log("Image deleted successfully");
      } catch (error) {
        console.error("Error deleting image:", error);
      }
    }
  }

  compareRef(o1: any, o2: any): boolean {
    return o1 && o2 && o1.path === o2.path;
  }
}

