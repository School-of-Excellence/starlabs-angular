import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDoc, getDocs, getFirestore, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

@Component({
  selector: 'app-product-dialog',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatTableModule,
    MatPaginatorModule,
    MatInputModule,
    
  ],  templateUrl: './product-dialog.component.html',
  styleUrl: './product-dialog.component.css'
})
export class ProductDialogComponent {
  
  participantjourneyproduct: any;

  journeyList:any=[];

  mapjourneyname = {};
  mapproductname = {};
  mapparticipantproduct = {};
  mapProductStatus = {};
  mappackagename = {};

  selectedJourney:Object = null;

  loading:boolean=true;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data:any, 
    public dialogRef: MatDialogRef<any>,
    private firestore: Firestore,
    public guard: AuthguardService
  ) {
    console.log(data);
    this.participantjourneyproduct = data
  }

  ngOnInit(): void {
    this.fetchData()
  }

  async fetchData(){
    
    this.loading = true;
    this.mapjourneyname = this.participantjourneyproduct['mapJourney']
    this.mapproductname = this.participantjourneyproduct['mapProduct'] 
    this.mappackagename = this.participantjourneyproduct['mapPackage'] 
    getDocs(query(collection(this.firestore,"participantjourneyproduct"),where("profileid","==",this.participantjourneyproduct['profileid']))).then((pjpdoc)=>{
      if(pjpdoc.docs.length != 0){
        for (let i = 0; i < pjpdoc.docs.length; i++) {
          const pjpData = pjpdoc.docs[i].data();
          this.journeyList.push(pjpData);
        }
      }else{
        this.loading = false;
      }
    });
    await getDocs(query(collection(this.firestore,"participantsproduct"),where("profileid","==",this.participantjourneyproduct['profileid']))).then((res) => {
      if(res.docs.length != 0){
        for (let i = 0; i < res.docs.length; i++) {
          const doc = res.docs[i];
          this.mapProductStatus[doc.id] = doc.data();
        }
      }
    });
     
    this.loading = false;
  } 

  async products(journey){
    if([null,undefined].includes(this.selectedJourney)){
      this.selectedJourney = journey;
      this.selectedJourney['bonus'] = [];
      this.selectedJourney['products'] = [];
      console.log(this.mappackagename);
      
      for (let i = 0; i < this.selectedJourney['participantproducts'].length; i++) {
        const product = this.selectedJourney['participantproducts'][i];
        console.log(this.mappackagename[this.mapProductStatus[product['participantproductid']]['packageref'].id]);
  
        if(![null,undefined,''].includes(this.mappackagename[this.mapProductStatus[product['participantproductid']]['packageref'].id])){
          console.log(this.mappackagename[this.mapProductStatus[product['participantproductid']]['packageref'].id]['package']);
          
          if(this.mappackagename[this.mapProductStatus[product['participantproductid']]['packageref'].id] == 'Bonus'){
            this.selectedJourney['bonus'].push(product)
          }else{
            this.selectedJourney['products'].push(product)
          }
        }
      }
    }else{
      this.selectedJourney = null;
      // this.selectedJourney['bonus'] = [];
      // this.selectedJourney['products'] = [];
    }

  }

  getStatusClass(status: string | null | undefined): string {
    if (!status || status === '') {
      return 'no-status';
    }
    
    // Convert status to lowercase to handle any capitalization variations
    const statusLower = status.toLowerCase();
    
    switch (statusLower) {
      case 'completed':
        return 'completed';
      case 'initiated':
        return 'initiated';
      case 'ongoing':
        return 'ongoing';
      case 'shifted':
        return 'shifted';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'no-status';
    }
  }

}
