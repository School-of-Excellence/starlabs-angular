import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { collection, collectionData, Firestore ,getDocs, query ,doc,where,serverTimestamp, setDoc} from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatChip, MatChipsModule ,MatChipEvent, MatChipSelectionChange} from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Subject, takeUntil } from 'rxjs';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-qr-scanner',
  imports: [
    ReactiveFormsModule,
    MatInputModule,
    FormsModule,
    CommonModule,
    MatFormFieldModule,
    MatChipsModule,
    ZXingScannerModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './qr-scanner.component.html',
  styleUrl: './qr-scanner.component.css'
})
export class QrScannerComponent {

  Form : FormGroup 
  qrResultString: string;
  enable : boolean = true
  processingResult: boolean = false;
  product : any
  products = []
  mapprofileimage = {}
  profile
  checkticket
  ticketApproved = false
  ticketdenied
  showscanner: boolean = false
  mapArenaETicket = {}
  event
  events: any = [];
  eventnotactive : boolean = false
  eventyettostart: boolean = false;
  eticket: any;
  maplog = {}
  usedticket: boolean = false;
  //
  scannedParticipantEligibleProducts = []
  productSelected = null
  mapProduct = {}
  // observale
  private destroy$ = new Subject<void>();
  private firestore = inject(Firestore)
  constructor(
    private formbuilder: FormBuilder
  ) {
    
    this.Form = this.formbuilder.group ({
      event: [null, {validators: [Validators.required]}],
      product:[[],{validators: [Validators.required]}],
    })

    const productsCollRef = collection(this.firestore,"products")
    getDocs(productsCollRef).then(res => {
      for (let i = 0; i < res.docs.length; i++) {
        const element = res.docs[i].data();
        this.products.push(element)
        this.mapProduct[element['id']] = element['product']
      }
    })

    const eventCollRef = collection(this.firestore,"event collection")
    getDocs(eventCollRef).then(snapshot => {
      this.events = []
      for (let i = 0; i < snapshot.docs.length; i++) {
        const ref = snapshot.docs[i].ref;
        const element = snapshot.docs[i].data()
        if(element['end_date'].toDate() >= new Date()){
          element['path'] = ref.path
          this.events.push(element)
        }
      }
    })

    const profileDataCollRef = collection(this.firestore,"profile_data")
    getDocs(profileDataCollRef).then(profile => {
      for (let j = 0; j < profile.docs.length; j++) {
        const element = profile.docs[j].data();
        this.mapprofileimage[element['profileid']] = element
      }
    })

    collectionData(collection(this.firestore,'arena e-ticket log')).pipe(takeUntil(this.destroy$)).subscribe(snap => {
      for (let k = 0; k < snap.length; k++) {
        const element = snap[k];
        this.maplog[element['docid']] = element
      }
    })
    
   }

  ngOnInit(): void {}

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  returnFilterProduct(){
    return this.products.filter(e => e.product && e.product.toLowerCase().includes(this.product?.toLowerCase() || ''));
  }

  returnFilterEvent(){
    return this.events.filter(e => e.name && e.name.toLowerCase().includes(this.event?.toLowerCase() || ""))
  }
  
  clearResult(): void {
    this.showscanner = true
    this.qrResultString = null;
    this.ticketApproved = false
    this.ticketdenied = false
    this.eventnotactive = false
    this.eventyettostart = false
    this.usedticket = false
  }

  onProductSelected(eventchip:MatChipSelectionChange){
    if(![null,undefined].includes(eventchip.source.value)){
      this.Form.patchValue({
        event:eventchip.source.value
      })
      if(![null,undefined].includes(this.Form.get("event").value)){
        var selectedeventpath = this.Form.get("event").value
          let eventRef = doc(this.firestore,selectedeventpath)
          collectionData(query(collection(this.firestore,"arena e-ticket"),where("eventref","==",eventRef))).pipe(takeUntil(this.destroy$)).subscribe(eventSnap => {
            for (let i = 0; i < eventSnap.length; i++) {
              const element = eventSnap[i];
              this.mapArenaETicket[element['profileid']] = element 
            }
            // console.log(this.mapArenaETicket);
            this.showscanner = true
          })  
      }else{
        alert("selected event is in incorrect format contact developer")
      }
    }else{
      this.showscanner = false
    }
  }

  onCodeResult(resultString: string) {
    this.showscanner = false
    if(this.processingResult){
      alert("processingResult true")
      return;
    }else{
      this.processingResult = true;
      this.qrResultString = resultString;
      try {
        this.eticket = JSON.parse(this.qrResultString);
      } catch (error) {
        this.eticket = this.qrResultString;
      }
      console.log("E-Ticket", this.eticket)

      var profileid = this.eticket['profileid']
      var uniqueid = this.eticket['uniqueid']

      this.checkticket = this.mapArenaETicket[profileid]
      let getEvent = this.events.filter(e => e['path'] === this.Form.get("event").value)
      const eventStartDate = getEvent[0]['start_date'].toDate();
      const eventEndDate = getEvent[0]['end_date'].toDate();
      // console.log(eventStartDate,eventEndDate);
      const currentDate = new Date();
      if(this.checkticket != undefined && this.checkticket['active'] === true){
        if(currentDate.getTime() < eventStartDate.getTime()){
          this.eventyettostart = true;
          console.log("this.eventyettostart",this.eventyettostart);
        }else if(currentDate.getTime() > eventEndDate.getTime()){
          this.eventnotactive = true;
          console.log("eventnotactive",this.eventnotactive);
        }else if(this.maplog[uniqueid] != undefined){
          console.log("this.usedticket",this.usedticket);
          this.usedticket = true
        }else{
          this.scannedParticipantEligibleProducts = this.checkticket['producteligible'] || []
        }
        this.processingResult = false;
      }
      else{
        this.ticketApproved = false
        this.ticketdenied = true
        this.processingResult = false;
      }
    }
  }

  afterProductSelect(){
    console.log(this.productSelected);
    this.scannedParticipantEligibleProducts = []
    var profileid = this.eticket['profileid']
    var uniqueid = this.eticket['uniqueid']
    console.log(this.qrResultString, this.checkticket['eventref'],this.checkticket['docid']);
    let id = uniqueid
    let productref = doc(this.firestore,"products",this.productSelected)
    let eticketref = doc(this.firestore,"arena e-ticket",this.checkticket['docid'])
    let data = {
      docid : id,
      product : productref,
      logdate : serverTimestamp(),
      profileid : profileid,
      eventref : this.checkticket['eventref'],
      eticketref : eticketref
    }
    setDoc(doc(this.firestore,"arena e-ticket log",id),data)
    console.log('successfully submitted');
    this.profile  = this.mapprofileimage[profileid]
    this.processingResult = false;
    this.ticketApproved = true
  }
}
