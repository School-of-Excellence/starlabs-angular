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
import { collection, doc, Firestore, getDocs, setDoc , query , where , limit  ,getDoc, serverTimestamp} from '@angular/fire/firestore';
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
  playlistNameMap = {};

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
          this.playlistNameMap[e.id] = element['seriesName'];
          return element;
        });
      });

      getDocs(collection(this.firestore, 'solar voice playlist')).then(snap => {
        this.solarVoicePlaylist = snap.docs.map(e => {
          let element = e.data();
          element['ref'] = e.ref;
          this.playlistNameMap[e.id] = element['name'];
          return element;
        });
      });

      getDocs(collection(this.firestore, 'content_urls')).then(snap => {
        this.generalContent = snap.docs.map(e => {
          let element = e.data();
          element['ref'] = e.ref;
          this.playlistNameMap[e.id] = element['title'];
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

  // submit function to create bufferdoc and send communications
  async onSubmit() {
    try {
      this.submitted = true;
      this.validationErrors = this.validate();
      const bufferMixDocData = { ...this.bufferDoc };

      if (this.validationErrors.length > 0) {
        return;
      }

      if (bufferMixDocData.expiredate) {
        bufferMixDocData.expiredate = Timestamp.fromDate(
          bufferMixDocData.expiredate,
        );
      }

      if (!bufferMixDocData.personalised) {
        delete bufferMixDocData.recommendedby;
      } else {
        let element = bufferMixDocData.recommendedby;
        bufferMixDocData.recommendedby = element.profile_ref.id;
        bufferMixDocData['recommendedbyname'] = element.name;
      }

      let docid = doc(collection(this.firestore, 'buffermix archive')).id;
      bufferMixDocData['docid'] = docid;

      // creating buffer doc
      await setDoc(doc(this.firestore, 'buffermix archive', docid), this.bufferDoc);
      console.log('Successfully buffer doc has been created');

      const contentTypes = ['eiflix', 'solarvoice', 'generalcontent'];
      const platform = [];
      const playlist = [];
      
      contentTypes.forEach((type) => {
        if (bufferMixDocData[type]?.length > 0) {
          if (type === "eiflix") {
            platform.push('EIFLIX');
          } else if (type === "solarvoice") {
            platform.push('Solar Voice')
          } else if (type === "generalcontent") {
            platform.push('General Content');
          }

            bufferMixDocData[type].forEach(async (docref) => {
              if (docref) {
                const playlistid = docref?.id ?? '';
                playlist.push(this.playlistNameMap[playlistid] ?? "");
              }
            });
          
        }
      });

      // sending communications
      await Promise.all([this.sendEmailMessageForPlaylist(platform , playlist , bufferMixDocData) , this.sendWatiMessage(platform , playlist , bufferMixDocData) , this.sendAppNotification(bufferMixDocData)]);
      console.log('All communication have been send');
      this.dialogRef.close();

    } catch (error) {
      console.error(error);
      this.dialogRef.close();
    }
  }

  // function to send email messages to participants
  async sendEmailMessageForPlaylist(platform : string[] , playlist : string[] , bufferDoc: any) {
    const emailTemplateAlias = 'app_rec_v1';
    let templateData = {};
    const emailTo = [];
    const emailMap = {};

    this.data.participantlist.forEach((profile)=>{
      if (![null , undefined , ''].includes(profile['email'])) {
        emailTo.push(profile['email']);
        emailMap[profile['email']] = profile?.profileid
      }
    });
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${p(now.getDate())}_${p(now.getMonth() + 1)}_${now.getFullYear()}_${p(now.getHours())}_${p(now.getMinutes())}`;
    const broadcastname = bufferDoc?.profileid.length === 1
      ? `Individual_${stamp}` : `Broadcast_${stamp}`;

    var clientModal = {
      _variableConfigs: {
        name: 'analytics',
        deeplink: 'static',
        platform: 'static',
        playlist: 'static',
      },
      name: 'name',
      platform: platform?.join(', ') ?? '',
      playlist: playlist.join(', ') ?? '',
      deeplink: `https://breakthroughs.app/recommended/${bufferDoc['docid']}`,
    };
    await getDocs(query(collection(this.firestore, 'email templates'), where('templatealias', '==', emailTemplateAlias), limit(1))).then((templatedoc) => {
      if (templatedoc.docs.length != 0) {
        templateData = templatedoc.docs[0].data();
        console.log('Email Template', templateData);

        const docRef = doc(collection(this.firestore, 'email archive'))
        const docid = docRef.id;

        // email archive configurations
        var map = {
          docid: docid,
          body: templateData['htmlbody'],
          broadcastname: broadcastname,
          createdby: 'automated',
          datamodel: clientModal,
          attachments: [],
          postmarkAttachments: [],
          date: new Date(),
          emailid: emailTo,
          emailmap: emailMap,
          fileUrl: '',
          from: 'fulfillment@antanoharini.com',
          notes: '',
          postmarktemplateid: "45282775",
          profileid: bufferDoc["profileid"] ?? [],
          sent: [],
          status: 'send',
          servername: templateData['servername'] || null,
          subject: templateData['subject'],
          templatedocid: templateData['docid'],
          templateid: templateData['templateid'] || emailTemplateAlias || null,
        }

        setDoc(docRef, map, { merge: true }).then(() => {
            console.log('Email Archieved Created Successfull')
          }).catch(err => {
            console.log('Error in create email archieve doc')
            console.error(err);
        })
      } else {
        console.error('NO Document Found in EMail Templates');
      }
    }).catch((error) => console.error(error))
  }

  // function to send wati messages to participants
  async sendWatiMessage(platform : string[] , playlist : string[] , bufferDoc: any){
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tag = `${pad(now.getDate())}_${pad(now.getMonth() + 1)}_${now.getFullYear()}_${pad(now.getHours())}_${pad(now.getMinutes())}`;
    const broadcastname = this.bufferDoc.profileid.length === 1 ? `Individual_${tag}` : `Broadcast_${tag}`;
    const docRef = doc(collection(this.firestore , 'wati archive'));

    const numbers = [];
    const numberMap = {};
    const eventWatiServerId = '101723';
    const watitemplateid = 'app_rec_v4'

    this.data.participantlist.forEach((profile)=>{
      if (![null , undefined , ''].includes(profile['phonenumber'])) {
        numbers.push(profile['phonenumber']);
        numberMap[profile['phonenumber']] = profile?.profileid
      }
    });

    let waticontent = {
      phonenumber: numbers,
      body: {
        parameters: [
          { name: 'name' },
          { name: 'platform', value: platform?.join(', ') ?? '' },
          { name: 'playlist', value: playlist.join(', ') ?? '' },
          { name: 'deeplink', value: `https://breakthroughs.app/recommended/${bufferDoc['docid']}` },
        ],
        broadcast_name: 'app_rec_v4',
        template_name: 'app_rec_v4',
      },
    };

    // parameter creation for wati communication
    const parameterConfig = waticontent['body']['parameters'].map((param) => {
      if (param.name === 'name') {
        return {
          excelColumn: null,
          fillType: 'metadata',
          metadataField: 'name',
          name: param.name,
          staticValue: null,
        };
      } else {
        return {
          excelColumn: null,
          fillType: 'static',
          metadataField: null,
          name: param.name,
          staticValue: param.value,
        };
      }
    });


    var map = {
			docid: docRef.id,
			body : null,
			numbers: numbers,
			createdby: null,
			date: new Date(),
			numbermap: numberMap,
			broadcastname: broadcastname,
			paramFillMode: 'static',
			parameterConfig: parameterConfig,
			params: [],
			profileid: bufferDoc['profileid'] ?? [],
			sentAt : new Date(),
			serverid: eventWatiServerId,
			serverurl: `https://live-mt-server.wati.io/${eventWatiServerId}`,
			status: 'sent',
			templateid: null,
			templatevalidated: true,
			validated: true,
			watitemplateid: watitemplateid
		};

    await setDoc(docRef , map).then(()=>{
      console.log('Trigger Wati Message');
    }).catch((error)=>{
      console.log('error in sending wati message');
      console.error(error)
    })
  }

  // function to send app notification messages to participants
  async sendAppNotification(bufferDoc : any){
    var docref = doc(collection(this.firestore , "notificationrecord"));
    var notificationRecordData = {
      title: bufferDoc['title'] ?? '',
      message: 'A new playlist has been recommended for you on the Breakthroughs App',
      subtitle: null,
      date: serverTimestamp(),
      notificationimage: null,
      notificationtype: null,
      landingpage: `https://breakthroughs.app/recommended/${bufferDoc['docid']}` ,
      sticky: false,
      logged: true,
      profileid: bufferDoc['profileid'] ?? [],
      success: false
    }
    await setDoc(docref, notificationRecordData).then(() =>{
      console.log("Notification Record Saved");
    }).catch(err =>{
      console.log("Unable to store Notification Record", err)
    })
  }

  onDialogCancel() {
    this.dialogRef.close();
  }
}