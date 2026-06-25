import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDocs, orderBy, query, serverTimestamp, where, writeBatch } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatButtonModule } from '@angular/material/button';
import { ProfilePictureComponent } from '../../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-big-event-invitation',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatSelectModule,
    FormsModule,
    MatDatepickerModule,
    NgxMatSelectSearchModule,
    MatDialogModule,
    MatButtonModule,
    ProfilePictureComponent
  ],
  templateUrl: './big-event-invitation.component.html',
  styleUrl: './big-event-invitation.component.css'
})
export class BigEventInvitationComponent {

  preapproved = true
  selectedProduct = null
  bigProduct = []
  loading:boolean = false
  expirydate = null
  invitedParticipants = []
  profileList = []
  mapProfile = {}
  selectedProfiles = []
  filterText = ""
  bigMarathonList = []
  eventList = []
  bigmarathonref = null
  // selectedevent = null
  // mapEvent = {}
  isSubmitting:boolean = false
  
  get loadingRef(){
    return this.dialog.open(LoadingProgressComponent,{
      data:{
        msg:"submitting please wait"
      },
      disableClose:true
    })
  }
  constructor(
    public firestore: Firestore, 
    @Inject(MAT_DIALOG_DATA) public dialogData : any, 
    public dialogRef: MatDialogRef<BigEventInvitationComponent>,
    public dialog : MatDialog
  ){ 
    getDocs(query(collection(this.firestore, 'big marathon'), where("status","==","live"))).then(snap => {
      this.bigMarathonList = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
    })
   
    getDocs(query(collection(this.firestore,'biginvitation'), where("eventref", "==", doc(this.firestore,"queue generation", this.dialogData.docid)))).then(invited=>{
      var invitedid = []
      invited.docs.forEach(doc=>{
        var data = doc.data()
        this.invitedParticipants.push(data)
        invitedid.push(data["profileid"])
      })
      // if(invited.size != 0){
      //   this.expirydate = invited.docs[0].data()["expirydate"]?.toDate()
      // }
      getDocs(query(collection(this.firestore,'profile_data'), orderBy('name'))).then(profile=>{
        for (let i = 0; i < profile.docs.length; i++) {
          const doc = profile.docs[i];
          var data = doc.data()
          this.mapProfile[doc.id] = data["name"]
          if(!invitedid.includes(doc.id)) this.profileList.push(data)
        }
      })
    })
    getDocs(query(collection(this.firestore, 'products'), where("mode", "==", "Big Mode"))).then(product=>{
      this.bigProduct = product.docs.map(e => e.data())
    })
  }

  ngOnInit(): void {
    
  }

  returnprofile():Array<any>{
    var data = []
    data = this.profileList.filter(e => e["name"].toLowerCase().includes(this.filterText.toLowerCase()))
    return data
  }

  close(){
    this.dialogRef.close()
  }

  // getEvent(){
  //   this.firestore.collection('event participation request')
  // }

  async sendInvitation(){
    if(this.isSubmitting) return
    this.isSubmitting = true
    // this.loadingRef
    const batch = writeBatch(this.firestore);
    
    
    if(this.selectedProfiles.length != 0 && this.expirydate != null){
      this.selectedProfiles.forEach(e=>{
        var docid = doc(collection(this.firestore, 'biginvitation')).id
        batch.set(
          doc(this.firestore, 'biginvitation', docid),
          {
            created: serverTimestamp(),
            docid: docid,
            eventref: doc(this.firestore,'queue generation',this.dialogData.docid),
            eventtype: "queue",
            expirydate: this.expirydate,
            profileid: e,
            status: this.preapproved ? "accepted" : "pending",
            productref: doc(this.firestore,'products', this.selectedProduct),
            bigmarathonref:this.bigmarathonref
          }
        )
       
      })
     
      await batch.commit()
      this.isSubmitting = false
      // this.loadingRef.close()
      this.close()
    }else{
      this.loadingRef.close()
      alert("Dont leave these field empty 'expiry date & participants selection & big marathon")
    }
  }

}
