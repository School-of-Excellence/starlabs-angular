// import { Component, Inject } from '@angular/core';
// import { collection, Firestore, getDocs } from '@angular/fire/firestore';
// import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
// import { AuthguardService } from '../../../authguard.service';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { FormsModule } from '@angular/forms';
// import { CommonModule, NgIf } from '@angular/common';
// import { MatSelectModule } from '@angular/material/select';
// import { MatButtonModule } from '@angular/material/button';
// import { MatInputModule } from '@angular/material/input';
// import { MatDatepickerModule } from '@angular/material/datepicker';
// import { MatNativeDateModule } from '@angular/material/core';
// import { Timestamp } from '@angular/fire/firestore';

// @Component({
//   selector: 'app-map-recommendedplaylist-toparticipant.component',
//   imports: [
//     MatFormFieldModule,
//     FormsModule,
//     NgIf,
//     MatSelectModule,
//     MatButtonModule,
//     CommonModule,
//     MatInputModule,
//     MatDatepickerModule,
//     MatNativeDateModule

//   ],
//   templateUrl: './map-recommendedplaylist-toparticipant.component.component.html',
//   styleUrl: './map-recommendedplaylist-toparticipant.component.component.css'
// })
// export class MapRecommendedplaylistToparticipantComponentComponent {
//   bufferDoc = {
//     profileid:[],
//     eiflix :[],
//     solarvoice:[],
//     generalcontent:[],
//     createdby:null,
//     date:new Date(),
//     expiredate:null,
//     status:'created',
//     title : null,
//     description:null,
//     notes:null,
//     personalised:false,
//     recommendedby:null,
//   }
//   eiflixSeries = []
//   solarVoicePlaylist = []
//   generalContent = []
//   minDate = new Date();
//   //filter
//   filterSeriesName:string = ''
//   filterPlaylistName: String = '';
//   filterContentName: String = '';
//   //personalised curation who recommended
//   eisList:any [] = []
//   filterRecommendedName:string =""
//   constructor(
//     private firestore : Firestore,
//     @Inject(MAT_DIALOG_DATA) public data: any,
//     public dialogRef :MatDialogRef<MapRecommendedplaylistToparticipantComponentComponent>,
//     private auth : AuthguardService
//   ) {
//     console.log(this.data,'console dialog dataaa');
      
//     if(this.data){
//       this.bufferDoc.profileid = this.data.participantlist.map(e => e.profileid)
//       this.bufferDoc.personalised = this.data.personalised
//       //logged in user
//       this.auth.getRoles().then( e => this.bufferDoc.createdby = e['profile_ref'].id)
//       //eiflix
//       const seriesCollRef = collection(this.firestore,"series")
//       getDocs(seriesCollRef).then(async snap => {
//         this.eiflixSeries = snap.docs.map(e =>{
//           let element = e.data()
//           element['ref'] = e.ref
//           return element
//         })
//       })
//       const solarVoiceCollRef = collection(this.firestore,"solar voice playlist")
//       getDocs(solarVoiceCollRef).then(async snap => {
//         this.solarVoicePlaylist = snap.docs.map(e => {
//           let element = e.data()
//           element['ref'] = e.ref
//           return element
//         })
//       })
//       const contentCollRef = collection(this.firestore,"content_urls")
//       getDocs(contentCollRef).then(async snap => {
//         this.generalContent = snap.docs.map(e => {
//           let element = e.data()
//           element['ref'] = e.ref
//           return element
//         })
//       })
//       const users_rolesCollRef = collection(this.firestore,"users_roles")
//       getDocs(users_rolesCollRef).then(async snap => {
//         this.eisList = snap.docs.map(e => e.data())
//         console.log(this.eisList);
//       })
//     }else{
//       this.dialogRef.close()
//     }
//   }

//   ngOnInit(): void {}

//   filterSeries(){
//     return this.eiflixSeries.filter(e => e['seriesName'].toLowerCase().includes(this.filterSeriesName.trim().toLowerCase()))
//   }

//   filterPlaylist(){
//     return this.solarVoicePlaylist.filter(e => e['name'].toLowerCase().includes(this.filterPlaylistName.trim().toLowerCase()))
//   }

//   filterContent(){
//     return this.generalContent.filter(e => e['title'].toLowerCase().includes(this.filterContentName.trim().toLowerCase()))
//   }

//   filterEis(){
//     return this.eisList.filter(e => e['name'].toLowerCase().includes(this.filterRecommendedName.trim().toLowerCase()))
//   }

//   onSubmit(){
//     if(this.bufferDoc.expiredate){
//       this.bufferDoc.expiredate = Timestamp.fromDate(this.bufferDoc.expiredate);
//     }
//     if(!this.bufferDoc.personalised){
//       delete this.bufferDoc.recommendedby
//       this.dialogRef.close(this.bufferDoc)
//     }else{
//       let element = this.bufferDoc.recommendedby
//       console.log(element,'cosoleelemetn');
//       this.bufferDoc.recommendedby = element.id
//       this.bufferDoc['recommendedbyname'] = element.name
//       this.dialogRef.close(this.bufferDoc)
//     }
//   }
//   onDialogCancel(){
//     this.dialogRef.close()
//   }
//   formValidation():boolean {
//     let validated = true
//     if(this.bufferDoc.eiflix.length != 0 || this.bufferDoc.solarvoice.length != 0 || this.bufferDoc.generalcontent.length != 0){
//       if(this.bufferDoc.title != null){
//         if(this.bufferDoc.title.trim().length != 0) validated = false
//       }
//     }
//     return validated
//   }
// }
import { Component, Inject } from '@angular/core';
import { collection, Firestore, getDocs } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgIf } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Timestamp } from '@angular/fire/firestore';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-map-recommendedplaylist-toparticipant.component',
  imports: [
    MatFormFieldModule,
    FormsModule,
    NgIf,
    MatSelectModule,
    MatButtonModule,
    CommonModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './map-recommendedplaylist-toparticipant.component.component.html',
  styleUrl: './map-recommendedplaylist-toparticipant.component.component.css'
})
export class MapRecommendedplaylistToparticipantComponentComponent {
  bufferDoc = {
    profileid: [],
    eiflix: [],
    solarvoice: [],
    generalcontent: [],
    createdby: null,
    date: new Date(),
    expiredate: null,
    status: 'created',
    title: null,
    description: null,
    notes: null,
    personalised: false,
    recommendedby: null,
  };

  eiflixSeries = [];
  solarVoicePlaylist = [];
  generalContent = [];
  minDate = new Date();
  filterSeriesName: string = '';
  filterPlaylistName: string = '';
  filterContentName: string = '';
  eisList: any[] = [];
  filterRecommendedName: string = '';
  submitted = false;
  validationErrors: string[] = [];

  constructor(
    private firestore: Firestore,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<MapRecommendedplaylistToparticipantComponentComponent>,
    private auth: AuthguardService
  ) {
    if (this.data) {
      this.bufferDoc.profileid = this.data.participantlist.map(e => e.profileid);
      this.auth.getRoles().then(e => this.bufferDoc.createdby = e['profile_ref'].id);

      getDocs(collection(this.firestore, 'series')).then(snap => {
        this.eiflixSeries = snap.docs.map(e => {
          let element = e.data();
          element['ref'] = e.ref;
          return element;
        });
      });

      getDocs(collection(this.firestore, 'solar voice playlist')).then(snap => {
        this.solarVoicePlaylist = snap.docs.map(e => {
          let element = e.data();
          element['ref'] = e.ref;
          return element;
        });
      });

      getDocs(collection(this.firestore, 'content_urls')).then(snap => {
        this.generalContent = snap.docs.map(e => {
          let element = e.data();
          element['ref'] = e.ref;
          return element;
        });
      });

      getDocs(collection(this.firestore, 'users_roles')).then(snap => {
        this.eisList = snap.docs.map(e => e.data());
      });
    } else {
      this.dialogRef.close();
    }
  }

  ngOnInit(): void {}

  filterSeries() {
    return this.eiflixSeries.filter(e => e['seriesName'].toLowerCase().includes(this.filterSeriesName.trim().toLowerCase()));
  }

  filterPlaylist() {
    return this.solarVoicePlaylist.filter(e => e['name'].toLowerCase().includes(this.filterPlaylistName.trim().toLowerCase()));
  }

  filterContent() {
    return this.generalContent.filter(e => e['title'].toLowerCase().includes(this.filterContentName.trim().toLowerCase()));
  }

  filterEis() {
    return this.eisList.filter(e => e['name'].toLowerCase().includes(this.filterRecommendedName.trim().toLowerCase()));
  }

  validate(): string[] {
    const errors: string[] = [];
    const hasContent = this.bufferDoc.eiflix.length > 0 || this.bufferDoc.solarvoice.length > 0 || this.bufferDoc.generalcontent.length > 0;

    if (!hasContent) {
      errors.push('Select at least one Eiflix Series, SolarVoice Playlist, or General Content');
    }
    if (!this.bufferDoc.title || !this.bufferDoc.title.trim()) {
      errors.push('Title is required');
    }
    if (this.bufferDoc.personalised && !this.bufferDoc.recommendedby) {
      errors.push('Recommended By is required for personalised curation');
    }
    return errors;
  }

  onSubmit() {
    this.submitted = true;
    this.validationErrors = this.validate();

    if (this.validationErrors.length > 0) {
      return;
    }

    if (this.bufferDoc.expiredate) {
      this.bufferDoc.expiredate = Timestamp.fromDate(this.bufferDoc.expiredate);
    }

    if (!this.bufferDoc.personalised) {
      delete this.bufferDoc.recommendedby;
      this.dialogRef.close(this.bufferDoc);
    } else {
      let element = this.bufferDoc.recommendedby;
      this.bufferDoc.recommendedby = element.profile_ref.id
      this.bufferDoc['recommendedbyname'] = element.name;
      this.dialogRef.close(this.bufferDoc);
    }
  }

  onDialogCancel() {
    this.dialogRef.close();
  }
}