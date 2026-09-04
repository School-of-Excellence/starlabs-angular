import { Component, ElementRef, inject, Inject, ViewChild } from '@angular/core';
import { Firestore,collection,doc,updateDoc,setDoc,getDoc, orderBy,query, collectionData, where, getDocs, QuerySnapshot, DocumentReference, addDoc, getCountFromServer, writeBatch} from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { CommonModule, DatePipe } from '@angular/common';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { Subject, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AutoCompleteWithChipComponent } from '../../../form-element/auto-complete-with-chip/auto-complete-with-chip.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage } from '@angular/fire/storage';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-update-event-detail',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatDatepickerModule,
    CommonModule,
    MatDividerModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatDialogModule,
    MatChipsModule,
    MatAutocompleteModule,
    AutoCompleteWithChipComponent,
    MatSlideToggleModule,
    NgxMatSelectSearchModule,
    MatCheckboxModule,
  ],
  providers:[provideNativeDateAdapter()],
  templateUrl: './update-event-detail.component.html',
  styleUrl: './update-event-detail.component.css'
})
export class UpdateEventDetailComponent {

  @ViewChild('fileupload') fileuploadref : ElementRef<HTMLInputElement>;

  loading:boolean = true;

  capturedData:Object = {};
  mapProduct:Object = {};
  mapProductToMode:Object = {};
  mapDeliveryEvents:Object = {};
  mapDeliveryForms:Object = {};
  mapDeliveryQueue:Object = {};
  mapDeliveryAppointment:Object = {};
  mapDeliveryFieldwork:Object = {};
  mapProductToDeliverySequence:Object = {};
  productImages: { [key: number]: { file: File | null, previewurl: string | null, url: string | null } } = {};

  eventDocID:string= null;
  generatedToken:string= null;

  venueList:Array<any> = [];
  ahmemberList:Array<any> = [];
  productsList:Array<any> = [];
  bigMarathonList:Array<any> = [];
  atcModelList:Array<any> = [];
  eventcount:number= 0;

  eventform : FormGroup

  eventimage : any  = {
    file : null,
    previewurl:null,
    url:null
  };

  journeyList : any = [];
  cohortsList : any = [];

  // filter search 
  filterJourney = '';
  filterCohort = '';

  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)
  constructor(
    @Inject(MAT_DIALOG_DATA) public data:any, 
    public dialogRef: MatDialogRef<any>,
    // private firestore: Firestore,
    public guard: AuthguardService,
    public formbuilder : FormBuilder,
    public pipe : DatePipe,
    public dialogData : MatDialog,
    private storage : Storage
  ) { 
    console.log("DialogMetaData",data);
    this.capturedData = data
    if(this.capturedData['edit']){
      this.eventDocID = this.capturedData['eventDocId'];
      this.fetchEvent();
      this.fetchData();
    }else{
      this.eventDocID = this.capturedData['eventDocId'];
      this.fetchData();
    }
  }

  ngOnInit() {
     this.eventform  = this.formbuilder.group({
      eventname : [, {validators: [Validators.required], update:"change"}],
      atcmodel : [, {validators: [], update:"change"}],
      startdate : [, {validators: [Validators.required], update:"change"}],
      enddate : [, {validators: [Validators.required], update:"change"}],
      venue : [, {validators: [Validators.required], update:"change"}],
      address : [, {validators: [Validators.required], update:"change"}],
      hosts : [, {validators: [Validators.required], update:"change"}],
      lastregistrationdate: [null, {validators: [Validators.required], updateOn:"change"}],
      notifyparticipants: [false, {validators: [Validators.required], updateOn:"change"}],
      addtocalendar: [false, {validators: [Validators.required], updateOn:"change"}],
      description: [, {validators: [Validators.required], updateOn:"change"}],
      bigdescription: [, {validators: [Validators.required], updateOn:"change"}],
      products:this.formbuilder.array([]),
      bigmarathonref: [null,],
      ctaconfig : this.formbuilder.group({
        confirmparticipation : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], updateOn:"change"}],
          description : [' ', {validators: [Validators.required], update:"change"}],
        }),
        addon : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : [' ', {validators: [Validators.required], update:"change"}],
        }),
        upgrade : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : [' ', {validators: [Validators.required], update:"change"}],
        }),
        continuity : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : [' ', {validators: [Validators.required], update:"change"}],
        }),
        nocta : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : [' ', {validators: [Validators.required], update:"change"}],
        })
      })
    });
  }

  get productsArray(){
    return this.eventform.get("products") as FormArray
  }

  getProductConsumption(productIndex){
    return this.productsArray.controls[productIndex]?.get('eligibility.productconsumption') as FormArray
  }

  get loadingref (){
    return this.dialogData.open(LoadingProgressComponent,{
      data:{
        msg:"Please wait ....."
      },
      disableClose:true
    })
  }

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  // addproductsArray(){
  //   const newIndex = this.productsArray.length;
  //   this.productImages[newIndex] = { file: null, previewurl: null, url: null };
  //   return this.productsArray.push(
  //     this.formbuilder.group({
  //       heroevent: [false, {validators: [Validators.required], update:"change"}],
  //       title: [, {validators: [Validators.required], update:"change"}],
  //       productref : [, {validators: [Validators.required], update:"change"}],
  //       startdate : [, {validators: [Validators.required], update:"change"}],
  //       enddate : [, {validators: [Validators.required], update:"change"}],
  //       deliveryref:[null,],
  //       delete:[false,],
  //       docid:[doc(collection(this.firestore,"arena events")).id,],
  //       image:[null,],
  //     })
  //   )
  // }

  // surya
  addproductsArray(){
    const newIndex = this.productsArray.length;
    this.productImages[newIndex] = { file: null, previewurl: null, url: null };
    return this.productsArray.push(
      this.formbuilder.group({
        heroevent: [false, {validators: [Validators.required], update:"change"}],
        title: [, {validators: [Validators.required], update:"change"}],
        productref : [, {validators: [Validators.required], update:"change"}],
        startdate : [, {validators: [Validators.required], update:"change"}],
        enddate : [, {validators: [Validators.required], update:"change"}],
        deliveryref:[null,],
        delete:[false,],
        docid:[doc(collection(this.firestore,"arena events")).id,],
        image:[null,],
        eligibility: this.formbuilder.group({
          journeyid: [[], { validators: [Validators.required], update: "change" }],
          cohortid: [[]],
          customerstatus: [['active'], { validators: [Validators.required], update: "change" }],
          productconsumption: this.formbuilder.array([]),
        })
      })
    )
  }

  onCustomerStatsChange(option, index: number, checked: boolean) {
    console.log(index)
    const control = this.productsArray.controls[index].get('eligibility.customerstatus');
    const currentValue: string[] = control?.value || [];

    if (checked) {
      control?.setValue([...currentValue, option]);
    } else {
      control?.setValue(
        currentValue.filter(value => value !== option)
      );
    }
  }

  removeproductsArray(index:number){
    if(this.productsArray.controls[index].value['deliveryref'] != null){
      this.productsArray.controls[index].value['delete'] = true
      // if(confirm("Are you surewant to delete")){
      //   updateDoc(doc(this.firestore,"arena events",this.productsArray.controls[index].value['docid']),{
      //     delete:true
      //   })
      //   this.productsArray.controls[index].value['delete'] = true
      //   this.productsArray.removeAt(index)
      // }
    }else{
      this.productsArray.removeAt(index)
    }
  }


  // function to add product consumption ( surya )
  addProductConsumption(productIndex){
    const product = this.getProductConsumption(productIndex);
    if (!product) {
      console.log('Invalid index');
      return
    }
    return product.push(
      this.formbuilder.group({
        productid: [null, {validators: [Validators.required], update:"change"}],
        operator: [null, {validators: [Validators.required], update:"change"}],
        count : [null, {validators: [Validators.required], update:"change"}],
      })
    )
  }

  // function to add product consumption ( surya )
  removeProductConsumption(productIndex , productConsumpIndex){
    const product = this.getProductConsumption(productIndex);
    if (product) {
      product.removeAt(productConsumpIndex);
    }
  }

  async fetchEvent(){

    getCountFromServer(collection(this.firestore, "event collection")).then(list =>{
      this.eventcount = list.data()["count"]
    }) 

    getDoc(doc(this.firestore,"event collection",this.eventDocID)).then(async eventDoc=>{
      var eventData = eventDoc.data()
      var hosts = [];
      if(![null,undefined,''].includes(eventData["hosts"])){
        eventData["hosts"].forEach(host=>{
          hosts.push(host.path)
        });
      }
      console.log("Event Data", eventData);
      this.eventimage.url = eventData["image"]
      this.eventform.controls["eventname"].setValue(eventData["name"])
      this.eventform.controls["atcmodel"].setValue(eventData["atcmodel"])
      var startDate = this.pipe.transform(eventData["start_date"].toDate(), "yyyy-MM-dd")
      var endDate = this.pipe.transform(eventData["end_date"].toDate(), "yyyy-MM-dd")
      this.eventform.controls["startdate"].setValue(startDate)
      this.eventform.controls["enddate"].setValue(endDate)
      this.eventform.controls["venue"].setValue(eventData["venue"])
      this.eventform.controls["address"].setValue(eventData["address"])
      this.eventform.controls["hosts"].setValue(hosts)
      this.eventform.controls["lastregistrationdate"].setValue(![null,undefined].includes(eventData["lastregistrationdate"]) ? eventData["lastregistrationdate"].toDate() : null)
      this.eventform.controls["notifyparticipants"].setValue(![null,undefined].includes(eventData["notifyparticipants"]) ? eventData["notifyparticipants"] : false)
      this.eventform.controls["addtocalendar"].setValue(![null,undefined].includes(eventData["addtocalendar"]) ? eventData["addtocalendar"] : false)
      this.eventform.controls["description"].setValue(eventData["description"])
      this.eventform.controls["bigdescription"].setValue(eventData["bigdescription"])
      this.eventform.controls["bigmarathonref"].setValue(eventData["bigmarathonref"])

      this.eventform.controls['ctaconfig'].patchValue( this.formbuilder.group({
        confirmparticipation : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : [' ', {validators: [Validators.required], update:"change"}],
        }),
        addon : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : [' ', {validators: [Validators.required], update:"change"}],
        }),
        upgrade : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : ['', {validators: [Validators.required], update:"change"}],
        }),
        continuity : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : [' ', {validators: [Validators.required], update:"change"}],
        }),
        nocta : this.formbuilder.group({
          button : [' ', {validators: [Validators.required], update:"change"}],
          description : ['', {validators: [Validators.required], update:"change"}],
        })
      }))

      // Get EVent Arena
      var arenaCollection = collection(this.firestore, "arena events")
      await getDocs(query(arenaCollection, where("eventref", "==", eventDoc.ref))).then(arenaEvent =>{
        var otherEventData = arenaEvent.docs.map(e => e.data())
        otherEventData.sort((a, b) => a["delete"] - b["delete"])
        for (let i = 0; i < otherEventData.length; i++) {
          const element = otherEventData[i];
          const productConsumption = element['eligibility']?.['productconsumption'] ?? [];
          this.productsArray.push(
            this.formbuilder.group({
              heroevent: [element['heroevent'] ?? false, {validators: [Validators.required], update:"change"}],
              title: [element['title'], {validators: [Validators.required], update:"change"}],
              productref : [element['productref'], {validators: [Validators.required], update:"change"}],
              startdate : [element['startdate'].toDate(), {validators: [Validators.required], update:"change"}],
              enddate : [element['enddate'].toDate(), {validators: [Validators.required], update:"change"}],
              deliveryref:[element['deliveryref'],],
              docid:[element['docid'],],
              delete:[element['delete'],],
              image:[element['image'] ?? null,],
              eligibility: this.formbuilder.group({
                journeyid: [element['eligibility']?.['journeyid'] ?? [], { validators: [Validators.required], update: "change" }],
                cohortid: [element['eligibility']?.['cohortid'] ?? []],
                customerstatus: [element['eligibility']?.['customerstatus'] ?? ['active'], { validators: [Validators.required], update: "change" }],
                productconsumption: this.formbuilder.array([])
              })
            })
          );

          // block to patch product consumption
          if (productConsumption.length > 0) {
            const productConsumptionArray = this.getProductConsumption(i);
            console.log('product consum')
            productConsumption.forEach((productConsump)=>{
              productConsumptionArray.push(
                this.formbuilder.group({
                  productid: [productConsump['productid'] ?? null, { validators: [Validators.required], update: "change" }],
                  operator: [productConsump['operator'] ?? null, { validators: [Validators.required], update: "change" }],
                  count: [productConsump['count'] ?? null, { validators: [Validators.required], update: "change" }],
                }))
            })
          }

          this.productsArray.controls[i].get("productref").disable()
          this.productImages[i] = { file: null, previewurl: null, url: element['image'] ?? null };
        }
      })

      /*
      if(eventData['arenaeventidlist'] != undefined && eventData['arenaeventidlist'].length != 0){
        for (let i = 0; i < eventData['arenaeventidlist'].length; i++) {
          const elementid = eventData['arenaeventidlist'][i];
          console.log(elementid);
          await getDoc(doc(this.firestore,"arena events",elementid)).then(arenaEventSnap => {
            if(arenaEventSnap.exists()){
              const element = arenaEventSnap.data()
              console.log(element);
              this.productsArray.push(
                this.formbuilder.group({
                  productref : [element['productref'], {validators: [Validators.required], update:"change"}],
                  startdate : [element['startdate'].toDate(), {validators: [Validators.required], update:"change"}],
                  enddate : [element['enddate'].toDate(), {validators: [Validators.required], update:"change"}],
                  deliveryref:[element['deliveryref'],],
                  docid:[element['docid'],],
                  delete:[element['delete'],],
                })
              )
              this.productsArray.controls[i].disable()
            }
          })
        } 
      }else{
        // this.addproductsArray()
      }
      */
    })
  }

  async fetchData(){

    const eventLocationCollRef = collection(this.firestore,"event location")
    const q = query(eventLocationCollRef,orderBy('location'))
    collectionData(q).pipe(takeUntil(this.destroy$)).subscribe(venue=>{
      this.venueList = venue
    })

    const users_rolesCollRef = collection(this.firestore,"users_roles")
    const users_rolesQuery = query(users_rolesCollRef,where("ahmember", "==", true),orderBy("name"))
    collectionData(users_rolesQuery).pipe(takeUntil(this.destroy$)).subscribe(async ahmembers=>{
      var memberLists = []
      ahmembers.forEach(member=>{
        memberLists.push({
          name: member["name"],
          profile: member["profile_ref"]["path"],
        })
      })
      this.ahmemberList = memberLists
    })

    //getting products list
    const productsCollRef = collection(this.firestore,"products")
    const productsQuery = query(productsCollRef,where("mode","in",["Installation Event Mode","Big Mode"]))
    getDocs(productsQuery).then(async snap => {
      this.productsList = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
      this.productsList.forEach(e =>{this.mapProduct[e['id']] = e['product']})
      this.productsList.forEach(e =>{this.mapProductToMode[e['id']] = e['mode']})
      for (let i = 0; i < this.productsList.length; i = i+10) {
        const element = this.productsList.slice(i,i+10).map(e => doc(this.firestore,"products",e['id']))
        const ptdsCollRef = collection(this.firestore,"productToDeliverySequence")
        const ptdsQuery = query(ptdsCollRef,where("product","in",element))
        await getDocs(ptdsQuery).then(productDeliverySnap => {
          productDeliverySnap.forEach(doc => {
            let productDeliveryElement = doc.data()
            this.mapProductToDeliverySequence[productDeliveryElement['product'].id]=productDeliveryElement['deliveryoptions']
          })
        })
      }
    })

    // fetch journey ( surya )
    const journeyList = [];
    getDocs(collection(this.firestore , 'journey')).then((journeySnap)=>{
      journeySnap.docs.forEach((journeyRef)=>{
        const journey = journeyRef.data();
        journeyList.push({
          ...journey,
          docid : journeyRef.id
        })
      });

      this.journeyList = journeyList;
    }).catch((error)=>console.log('error in fetching journey ' , error));

    //get delivery events forms queue
    const delEventsCollRef = collection(this.firestore,"delivery events")
    getDocs(delEventsCollRef).then((snap) => {
      snap.forEach(doc => {
        this.mapDeliveryEvents[doc.id] = doc.data()['eventname']
      })
    })

    const delFormsCollRef = collection(this.firestore,"delivery forms")
    getDocs(delFormsCollRef).then((snap) => {
      snap.forEach(doc => {
        this.mapDeliveryForms[doc.id] = doc.data()['formname']
      })
    })

    const delQueueCollRef = collection(this.firestore,"delivery queue")
    getDocs(delQueueCollRef).then((snap) => {
      snap.forEach(doc => {
        this.mapDeliveryQueue[doc.id] = doc.data()['queuename']
      })
    })

    const appTypeCollRef = collection(this.firestore,"appointmenttype")
    getDocs(appTypeCollRef).then((snap) => {
      snap.forEach(doc => {
        this.mapDeliveryAppointment[doc.id] = doc.data()['appointmenttype']
      })
    })

    const fieldworkCollRef = collection(this.firestore, "delivery fieldwork")
    getDocs(fieldworkCollRef).then((snap) => {
      snap.forEach(doc => {
        this.mapDeliveryFieldwork[doc.id] = doc.data()['fieldworkname']
      })
    })
    

    const bigMarathonCollRef = collection(this.firestore,"big marathon")
    getDocs(bigMarathonCollRef).then(snap => {
      this.bigMarathonList = snap.docs.map(e => {
        let element = e.data()
        element["ref"] = e.ref
        return element
      })
    });

    const atcModelCollRef = collection(this.firestore, "atc model");
    getDocs(atcModelCollRef).then((snap)=> {
      this.atcModelList = snap.docs.map((e)=> {
        let element = e.data();
        return element;
      })
    })

    // fetch cohorts ( surya )
    this.fetchCohorts();
    this.loading = false;
  }

  // function to fetch cohorts
  async fetchCohorts(){
    const marathonref = collection(this.firestore , 'big marathon');
    const cohortsref = collection(this.firestore , 'big cohorts');
    try{
      const currentMarathon = (await getDocs(query(marathonref , where('status' , '==' , 'live')))).docs.map((d)=>d.ref);
      const cohortsQuery = query(cohortsref , where('marathonref' , 'in' , currentMarathon));
      const cohorts = await getDocs(cohortsQuery);
      this.cohortsList = cohorts.docs.map((docref)=>docref.data());
    }catch(error){
      console.log('error fetching cohorts' , error)
    }
  }

  compareFn(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.id === c2.id : c1 === c2;
  }

  generateToken(){
    var eventname = this.eventform.controls["eventname"].value.toString().toLocaleLowerCase()
    var eventVenue = this.eventform.controls["venue"].value != null ? this.eventform.controls["venue"].value.toString().toLocaleLowerCase() : "venue"
    var newToken = eventname + " " + eventVenue + " " + this.eventcount.toString().toLocaleLowerCase()
    this.generatedToken = newToken.split(" ").join("_")
    console.log(this.generatedToken)
  }

  async saveEventDetail(value){
    console.log( this.eventimage.url);

    Object.keys(this.eventform.controls).forEach((key)=>{
      console.log(key)
      console.log(this.eventform.controls[key].valid)
    })
    if(this.eventform.valid){
      console.log(value)
      if(!this.validationFn()){
        var batch = writeBatch(this.firestore)
        const loading = this.loadingref;
        var hostRef = []
        value.hosts.forEach((host:string)=>{
          hostRef.push(doc(this.firestore,host))
        })
        var eventid = this.eventDocID
        var eventStartDate = new Date(value.startdate)
        eventStartDate.setHours(5, 30, 0, 0)
        var eventEndDate = new Date(value.enddate)
        eventEndDate.setHours(23, 59, 59, 0)
        var eventData = {
          name: value.eventname,
          atcmodel: value.atcmodel ?? null,
          start_date: eventStartDate,
          end_date: eventEndDate,
          venue: value.venue,
          address: value.address,
          hosts: hostRef,
          lastregistrationdate:value.lastregistrationdate,
          notifyparticipants:value.notifyparticipants,
          addtocalendar:value.addtocalendar,
          description: value.description,
          bigdescription: value.bigdescription,
          bigmarathonref:value.bigmarathonref || null,
          arenaeventidlist:value.products.filter(e => e["delete"] != true).map(e => e['docid']),
          image: this.eventimage.url ?? null,
        }
        if(!this.capturedData['edit']){
          this.generateToken()
          eventData["event_id"] = this.generatedToken
        }

        let eventRef = doc(this.firestore,"event collection", eventid)
        batch.set(eventRef, eventData, {merge: true})
        for (let i = 0; i < value.products.length; i++){
          const productid = value.products[i]['productref'].id;
          if(value.products[i]['deliveryref'] === null){
            if(this.mapProductToDeliverySequence.hasOwnProperty(productid)){
              let findeventactivity = null
              if(this.mapProductToMode[productid] === "Installation Event Mode"){
                findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery events") === 0)
              }
              else if(this.mapProductToMode[productid] === "Big Mode"){
                findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery fieldwork") === 0)
              }
              // else findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'][0]

              if(findeventactivity != null){
                var arenaEventRef = doc(this.firestore, "arena events", value.products[i]['docid'])
                var arenaEventStart = new Date(value.products[i]['startdate'])
                arenaEventStart.setHours(5, 30, 0, 0)
                var arenaEventEnd = new Date(value.products[i]['enddate'])
                arenaEventEnd.setHours(23, 59, 59, 0)
                var arenaEventData:any = {
                  heroevent: value.products[i]['heroevent'] ?? false,
                  title: value.products[i]['title'], 
                  docid:value.products[i]['docid'],
                  startdate: arenaEventStart,
                  enddate: arenaEventEnd,
                  productref:value.products[i]['productref'],
                  eventref:eventRef,
                  deliveryref:findeventactivity['activity'],
                  delete:value.products[i]['delete'],
                  venue:value.venue,
                  type:"event",
                  eventname:value.eventname,
                  bigmarathonref:value.bigmarathonref || null,
                  image: value.products[i]['image'] ?? null,
                  eligibility: {
                    journeyid: value?.products[i]?.eligibility['journeyid'] ?? [],
                    cohortid: value?.products[i]?.eligibility['cohortid'] ?? [],
                    customerstatus: value?.products[i]?.eligibility['customerstatus'] ?? [],
                    productconsumption: value?.products[i]?.eligibility['productconsumption'] ?? []
                  }
                }
                batch.set(arenaEventRef, arenaEventData, {merge:true})
              }
              else{
                console.log("Delivery Event/Fieldwork not found")
              }
              /*
              console.log("findeventactivity",findeventactivity['activity'].path);
              await setDoc(doc(this.firestore,"arena events",value.products[i]['docid']),{
                docid:value.products[i]['docid'],
                startdate:value.products[i]['startdate'],
                enddate:value.products[i]['enddate'],
                productref:value.products[i]['productref'],
                eventref:eventRef,
                deliveryref:findeventactivity['activity'],
                delete:value.products[i]['delete'],
                venue:value.venue,
                type:"event",
                eventname:value.eventname,
                bigmarathonref:value.bigmarathonref || null,
              },{merge:true})
              */
            }else{
              console.log("selected product not mapped to delivery sequence");
            }
          }else{
            console.log("Already Arena Event Exists");
            var arenaEventRef = doc(this.firestore, "arena events", value.products[i]['docid'])
            var arenaEventData:any = {
              heroevent: value.products[i]['heroevent'] ?? false,
              title: value.products[i]['title'], 
              startdate:value.products[i]['startdate'],
              enddate:value.products[i]['enddate'],
              delete:value.products[i]['delete'],
              venue:value.venue,
              type:"event",
              eventname:value.eventname,
              bigmarathonref:value.bigmarathonref || null,
              image: value.products[i]['image'] ?? null,
              eligibility: {
                journeyid: value?.products[i]?.eligibility['journeyid'] ?? [],
                cohortid: value?.products[i]?.eligibility['cohortid'] ?? [],
                customerstatus: value?.products[i]?.eligibility['customerstatus'] ?? [],
                productconsumption: value?.products[i]?.eligibility['productconsumption'] ?? []
              }
            }
            batch.update(arenaEventRef, arenaEventData, {merge:true})
          }
        }
        /*
        await setDoc(doc(this.firestore,"event collection", eventid), eventData, {merge: true}).then(async () => {
          let eventRef = doc(this.firestore,"event collection", eventid)
          for (let i = 0; i < value.products.length; i++){
            const productid = value.products[i]['productref'].id;
            if(value.products[i]['deliveryref'] === null){
              if(this.mapProductToDeliverySequence.hasOwnProperty(productid)){
                let findeventactivity = null
                if(this.mapProductToMode[productid] === "Installation Event Mode"){
                  findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery events") === 0)
                }else findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'][0]
                console.log("findeventactivity",findeventactivity['activity'].path);
                await setDoc(doc(this.firestore,"arena events",value.products[i]['docid']),{
                  docid:value.products[i]['docid'],
                  startdate:value.products[i]['startdate'],
                  enddate:value.products[i]['enddate'],
                  productref:value.products[i]['productref'],
                  eventref:eventRef,
                  deliveryref:findeventactivity['activity'],
                  delete:value.products[i]['delete'],
                  venue:value.venue,
                  type:"event",
                  eventname:value.eventname,
                  bigmarathonref:value.bigmarathonref || null,
                },{merge:true})
              }else{
                console.log("selected product not mapped to delivery sequence");
              }
            }else{
              console.log("Already Arena Event Exists");
            }
          }
        })
        */
       await batch.commit().catch(err =>{
        console.log(err)
        alert(err)
       })
        loading.close();
        this.dialogRef.close();
        this.guard.openSnackBar("Event Updated Successfully", "OK",600);
      }else {
        alert("No Delivery Events Assigned to the product")
      }
    }else {
      console.log('Form is Invalid');
      
    }
  }

  validationFn(): boolean {
    let validated = []
    let value = this.eventform.getRawValue()
    for (let i = 0; i < value.products.length; i++) {
      const productid = value.products[i]['productref'].id;
      if (value.products[i]['deliveryeventref'] === null) {
        if (this.mapProductToDeliverySequence.hasOwnProperty(productid)) {
          let findeventactivity = null
          if (this.mapProductToMode[productid] === "Installation Event Mode") {
            findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery events") === 0)
          } else findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'][0]
          console.log("findeventactivity", findeventactivity);
          if (findeventactivity != undefined && findeventactivity != null) {
            if (findeventactivity['activity'] != undefined) validated.push(false)
            else validated.push(true)
          } else validated.push(true)
        } else validated.push(true)
      }
    }
    return validated.includes(true)
  }

  uploadImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files && files.length > 0) {
      const file = files[0];
      this.eventimage.file = file;

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        this.eventimage.previewurl = reader.result as string;
      };
      this.submitImageToStorage()
    }
  }

  async submitImageToStorage() {
    try {
      const filepath = "eventimages/" + this.eventimage.file.name;
      const storageRef = ref(this.storage, filepath);
      const uploadResult = await uploadBytes(storageRef, this.eventimage.file);
      const downloadURL = await getDownloadURL(uploadResult.ref);
      this.eventimage.url = downloadURL;

      console.log("image uploaded successfully");
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  }

  async onImageRemove() {
    if (this.eventimage.previewurl != null || this.eventimage.url === null) {
      // Removing preview of newly selected image (not yet uploaded)
      console.log("Removing new image preview");
      this.eventimage.previewurl = null;
      this.eventimage.file = null;
      this.fileuploadref.nativeElement.value = '';
    } else if (this.eventimage.url != null) {
      // Removing existing image from storage
      console.log("Removing existing image from storage");
      if (confirm("Are you sure you want to delete this image?")) {
        try {
          // Extract the file path from the Firebase Storage URL
          const decodedUrl = decodeURIComponent(this.eventimage.url);
          const pathMatch = decodedUrl.match(/\/o\/(.+?)\?/);

          if (pathMatch && pathMatch[1]) {
            const filePath = pathMatch[1];
            const storageRef = ref(this.storage, filePath);
            await deleteObject(storageRef);

            this.eventimage.url = null;
            this.eventimage.previewurl = null;
            this.eventimage.file = null;
            if (this.fileuploadref?.nativeElement) {
              this.fileuploadref.nativeElement.value = '';
            }

            console.log("Image deleted successfully from storage");

            // Update Firestore to remove image URL
            if (this.eventDocID) {
              await updateDoc(doc(this.firestore, "event collection", this.eventDocID), {
                image: null
              });
            }
          } else {
            console.error("Could not extract file path from URL");
          }
        } catch (error) {
          console.error("Error deleting image:", error);
          alert("Failed to delete image. Please try again.");
        }
      }
    }
  }

  uploadProductImage(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files && files.length > 0) {
      const file = files[0];
      this.productImages[index].file = file;

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        this.productImages[index].previewurl = reader.result as string;
      };
      this.submitProductImageToStorage(index);
    }
  }

  async submitProductImageToStorage(index: number) {
    try {
      const filepath = "arenaevents/" + this.productImages[index].file.name;
      const storageRef = ref(this.storage, filepath);
      const uploadResult = await uploadBytes(storageRef, this.productImages[index].file);
      const downloadURL = await getDownloadURL(uploadResult.ref);
      this.productImages[index].url = downloadURL;
      this.productsArray.controls[index].patchValue({ image: downloadURL });

      console.log("Product image uploaded successfully");
    } catch (error) {
      console.error("Error uploading product image:", error);
    }
  }

  async onProductImageRemove(index: number) {
    if (this.productImages[index].previewurl != null && this.productImages[index].url === null) {
      // Removing preview of newly selected image (not yet uploaded)
      console.log("Removing new image preview");
      this.productImages[index].previewurl = null;
      this.productImages[index].file = null;
    } else if (this.productImages[index].url != null) {
      // Removing existing image from storage
      console.log("Removing existing image from storage");
      if (confirm("Are you sure you want to delete this image?")) {
        try {
          const decodedUrl = decodeURIComponent(this.productImages[index].url);
          const pathMatch = decodedUrl.match(/\/o\/(.+?)\?/);

          if (pathMatch && pathMatch[1]) {
            const filePath = pathMatch[1];
            const storageRef = ref(this.storage, filePath);
            
            try {
              await deleteObject(storageRef);
              console.log("Product image deleted successfully from storage");
            } catch (storageError: any) {
              if (storageError?.code === "storage/object-not-found") {
                console.warn( "Image does not exist in Firebase Storage. Clearing image reference anyway:",filePath);
              } else {
                throw storageError;
              }
            }
            
            this.productImages[index].url = null;
            this.productImages[index].previewurl = null;
            this.productImages[index].file = null;
            this.productsArray.controls[index].patchValue({ image: null });

            console.log("Product image deleted successfully from storage");

            // Update Firestore to remove image URL
            const docid = this.productsArray.controls[index].value['docid'];
            if (docid) {
              await updateDoc(doc(this.firestore, "arena events", docid), {
                image: null
              });
            }
          } else {
            console.error("Could not extract file path from URL");
          }
        } catch (error) {
          console.error("Error deleting product image:", error);
          alert("Failed to delete image. Please try again.");
        }
      }
    }
  }

  /*
  async updateEvent(value){
    if(this.eventform.valid){
      console.log(value)
      if(!this.validationFn()){
        const loading = this.loadingref;
        var hostRef = []
        value.hosts.forEach((host:string)=>{
          hostRef.push(doc(this.firestore,host))
        })
        await updateDoc(doc(this.firestore,"event collection",this.eventDocID),{
          name: value.eventname,
          atcmodel: value.atcmodel ?? null,
          start_date: new Date(value.startdate),
          end_date: new Date(value.enddate),
          venue: value.venue,
          address: value.address,
          hosts: hostRef,
          lastregistrationdate:value.lastregistrationdate,
          notifyparticipants:value.notifyparticipants,
          addtocalendar:value.addtocalendar,
          description: value.description,
          bigmarathonref:value.bigmarathonref || null,
          arenaeventidlist:value.products.map(e => e['docid'])
        }).then(async () => {
          let eventRef = doc(this.firestore,"event collection",this.eventDocID)
          for (let i = 0; i < value.products.length; i++){
            const productid = value.products[i]['productref'].id;
            if(value.products[i]['deliveryref'] === null){
              if(this.mapProductToDeliverySequence.hasOwnProperty(productid)){
                let findeventactivity = null
                if(this.mapProductToMode[productid] === "Installation Event Mode"){
                  findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery events") === 0)
                }else findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'][0]
                console.log("findeventactivity",findeventactivity['activity'].path);
                await setDoc(doc(this.firestore,"arena events",value.products[i]['docid']),{
                  docid:value.products[i]['docid'],
                  startdate:value.products[i]['startdate'],
                  enddate:value.products[i]['enddate'],
                  productref:value.products[i]['productref'],
                  eventref:eventRef,
                  deliveryref:findeventactivity['activity'],
                  delete:value.products[i]['delete'],
                  venue:value.venue,
                  type:"event",
                  eventname:value.eventname,
                  bigmarathonref:value.bigmarathonref || null,
                },{merge:true})
              }else{
                console.log("selected product not mapped to delivery sequence");
              }
            }else{
              console.log("selected product is not mapped to delivery ref");
            }
          }
        })
        loading.close();
        this.dialogRef.close();
        this.guard.openSnackBar("Event Updated Successfully", "OK");
      }else {
        alert("No Delivery Events Assigned to the product")
      }
    }
  }

  async createEvent(value){
    console.log(value)
    if(this.eventform.valid){
      if(!this.validationFn()){
        const loading = this.loadingref;
        var hostRef = []
        for (let i = 0; i < value.hosts.length; i++) {
          hostRef.push(doc(this.firestore,value.hosts[i]))
        }
        addDoc(collection(this.firestore,"event collection"),{
          name : value.eventname,
          start_date : new Date(value.startdate),
          end_date : new Date(value.enddate),
          venue : value.venue,
          address : value.address,
          event_id :  this.generatedToken,
          hosts: hostRef,
          lastregistrationdate:value.lastregistrationdate,
          notifyparticipants:value.notifyparticipants,
          addtocalendar:value.notifyparticipants,
          description: value.description,
          bigmarathonref:value.bigmarathonref || null,
          arenaeventidlist:value.products.map(e => e['docid'])
        }).then(async (eventRef) => {
          for (let i = 0; i < value.products.length; i++) {
            const productid = value.products[i]['productref'].id;
            if(this.mapProductToDeliverySequence.hasOwnProperty(productid)){
              let findeventactivity = null
              if(this.mapProductToMode[productid] === "Installation Event Mode"){
                findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery events") === 0)
              }else {findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'][0]}
              console.log("findeventactivity",findeventactivity['activity'].path);
              await setDoc(doc(this.firestore,"arena events",value.products[i]['docid']),{
                docid:value.products[i]['docid'],
                startdate:value.products[i]['startdate'],
                enddate:value.products[i]['enddate'],
                productref:value.products[i]['productref'],
                eventref:eventRef,
                deliveryref:findeventactivity['activity'],
                delete:value.products[i]['delete'],
                venue:value.venue,
                type:"event",
                eventname:value.eventname,
                bigmarathonref:value.bigmarathonref || null,
              },{merge:true})
            }else{
              console.log("selected product is mapped to delivery sequence",this.mapProduct[productid]);
            }
          }
        })
        this.eventform.reset();
        loading.close();
        this.eventform.patchValue({
          notifyparticipants: false,
          addtocalendar: false,
        })
        this.generatedToken= null;
        this.dialogRef.close();
        this.guard.openSnackBar("Event Created", "OK");
      }else {
        alert("No Delivery Events Assigned to the product")
      }
    }
  }
  */

  onJourneySearch(){
    if (this.journeyList != null) {
      const filterValue = (this.filterJourney != null && this.filterJourney != '') ? this.filterJourney.trim().toLowerCase() : ''
      return this.journeyList.filter(e => e?.journey?.trim().toLowerCase().includes(filterValue))
    }
    return []
  }

   onCohortSearch(){
    if (this.cohortsList != null) {
      const filterValue = (this.filterCohort != null && this.filterCohort != '') ? this.filterCohort.trim().toLowerCase() : ''
      return this.cohortsList.filter(e => e?.name?.trim().toLowerCase().includes(filterValue))
    }
    return []
  }
}
