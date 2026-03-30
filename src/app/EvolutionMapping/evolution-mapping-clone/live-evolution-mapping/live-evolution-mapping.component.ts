import { Component, Inject, OnInit, ViewChild} from '@angular/core';
import { Firestore, collection,writeBatch, collectionData,query, where,getDoc,setDoc, getDocs,doc, updateDoc, deleteDoc ,serverTimestamp} from '@angular/fire/firestore';
import { Storage, ref as afRef, uploadBytes as afUploadBytes, getDownloadURL as afGetDownloadURL } from '@angular/fire/storage';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { arrayRemove } from 'firebase/firestore';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { AuthguardService } from '../../../authguard.service';
import { VideoPlayerComponent } from '../../video-player.component';
import { MatButtonModule } from '@angular/material/button';


@Component({
  selector: 'app-live-evolution-mapping',
  imports: [MatPaginatorModule, DragDropModule, MatTabsModule, MatIconModule, CommonModule, MatProgressBarModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatTableModule, FormsModule, VideoPlayerComponent,MatButtonModule],
  templateUrl: './live-evolution-mapping.component.html',
  styleUrl: './live-evolution-mapping.component.css'
})
export class LiveEvolutionMappingComponent {
  mapProfile: {} = {};
  mapVideoTitle: {} = {};
  loading:boolean = true;
  disableButton:boolean = false;
  searchTerm: string = '';
  selectedProfile: string | null = null;
  filteredKeys: string[] = [];  
  title: string = '';
  videourl: string = '';
  liveStatus:boolean = true;
  isMake:boolean;
  recordedDate: Date | null = null;
  obj: {}
  displayedColumns: string[] = ['title','videoUrl', 'actions'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  constructor(
    public firestore: Firestore, 
    private guard: AuthguardService,
    private storage: Storage,
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<LiveEvolutionMappingComponent>,
    @Inject(MAT_DIALOG_DATA) public data : any,
    public router: Router,
  ) { 
    this.dataSource = new MatTableDataSource();
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
    }).then(value=>{
      // this.loading = false;
    })
  }

  ngOnInit(): void {
    this.liveData()
    this.isMake = this.data instanceof Set ? true : false;
  }
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }
  closeDialog() {
    this.dialogRef.close();
  }
  profileid:string = "";
  async liveData() {
    this.loading = true
    this.obj = {
      profileid: null,
      title: this.title,
      videolist: [],
      live: this.liveStatus,
      created: serverTimestamp(),
    };

    if (this.data instanceof Set) {
      Array.from(this.data).forEach(item => {
        if (!this.obj['profileid']) {
          this.obj['profileid'] = item['profileid'];
        }
        this.obj['videolist'].push(item['videourl']);
      });
    }

    // this.profileid = this.data instanceof Set ? this.obj['profileid'] : this.data;
    // this.mapVideoTitle = {};
    // const videoDocs = await this.firestore.collection("evolutionmappingvideo", ref => ref.where('profileid', '==', this.profileid)).get().toPromise();
    // videoDocs.docs.forEach((element) => {
    //   this.mapVideoTitle[element.data()['videourl']] = element.data()['title'];
    // });

    // const participantDoc = await this.firestore.collection("liveevolutionmapping").doc(this.profileid).get().toPromise();
    // if (participantDoc.exists) {
    //   const participantLive = participantDoc.data();
    //   this.dataSource.data = participantLive['videolist'] || [];
    //   console.log("participantlive", participantLive);
    //   this.title = participantLive['title'] || null;
    //   this.liveStatus = participantLive['live'] || null;
    // }
    this.profileid = this.data instanceof Set ? this.obj['profileid'] : this.data;

    // Initialize map
    this.mapVideoTitle = {};

    // 🔹 1. Fetch evolution mapping videos for this profile
    const evolutionRef = collection(this.firestore, 'evolutionmappingvideo');
    const q = query(evolutionRef, where('profileid', '==', this.profileid));
    const videoSnapshot = await getDocs(q);

    videoSnapshot.forEach((element) => {
      const data = element.data();
      this.mapVideoTitle[data['videourl']] = data['title'];
    });

    // 🔹 2. Fetch participant's live mapping document
    const liveDocRef = doc(this.firestore, 'liveevolutionmapping', this.profileid);
    const participantDoc = await getDoc(liveDocRef);

    if (participantDoc.exists()) {
      const participantLive = participantDoc.data();
      this.dataSource.data = participantLive['videolist'] || [];
      console.log('participantLive:', participantLive);

      this.title = participantLive['title'] || null;
      this.liveStatus = participantLive['live'] || null;
    }

    this.loading = false
  }
  // deleteVideo(element: string) {
  //   if (!this.profileid) return;
  //   const evolutionMapLiveCollection = this.firestore.collection("liveevolutionmapping").doc(this.profileid);
  //   evolutionMapLiveCollection.update({
  //     videolist: firebase.firestore.FieldValue.arrayRemove(element)
  //   }).then(async () => {
  //     const evolutionMapCollection = this.firestore.collection("evolutionmappingvideo",ref=>ref.where("videourl",'==',element))
  //       const snapshot = await evolutionMapCollection.get().toPromise();
  //       if (!snapshot.empty) {
  //           const doc = snapshot.docs[0];
  //           await doc.ref.update({ urllive: false });
  //       } else {
  //           console.warn("No videourl:", element);
  //       }
  //     this.dataSource.data = this.dataSource.data.filter(video => video !== element);
  //   }).catch(error => {
  //     console.error("Error", error);
  //   });
  // }
  async deleteVideo(element: string) {
    if (!this.profileid) return;

    try {
      // 🔹 1. Remove video from liveevolutionmapping's videolist
      const liveDocRef = doc(this.firestore, 'liveevolutionmapping', this.profileid);
      await updateDoc(liveDocRef, {
        videolist: arrayRemove(element)
      });

      // 🔹 2. Find matching video in evolutionmappingvideo by videourl
      const evolutionMapCollection = collection(this.firestore, 'evolutionmappingvideo');
      const q = query(evolutionMapCollection, where('videourl', '==', element));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const targetDoc = snapshot.docs[0];
        await updateDoc(targetDoc.ref, { urllive: false });
      } else {
        console.warn('⚠️ No matching videourl found:', element);
      }

      // 🔹 3. Update local dataSource
      this.dataSource.data = this.dataSource.data.filter((video: any) => video !== element);

    } catch (error) {
      console.error('❌ Error removing video:', error);
    }
  }
  async drop(event: CdkDragDrop<string[]>) {
    const previousIndex = this.dataSource.data.findIndex((video) => video === event.item.data);
    moveItemInArray(this.dataSource.data, previousIndex, event.currentIndex);
    this.dataSource.data = this.dataSource.data;
    await this.updateVideoListInFirestore();
  }

  // async updateVideoListInFirestore() {
  //   if (!this.profileid) return;

  //   const evolutionMapLiveCollection = this.firestore.collection("liveevolutionmapping").doc(this.profileid);
  //   await evolutionMapLiveCollection.update({
  //     videolist: this.dataSource.data
  //   });
  // }
  async updateVideoListInFirestore() {
    if (!this.profileid) return;

    try {
      // 🔹 Create reference to the document
      const liveDocRef = doc(this.firestore, 'liveevolutionmapping', this.profileid);

      // 🔹 Update videolist field
      await updateDoc(liveDocRef, {
        videolist: this.dataSource.data
      });

      console.log('✅ Video list updated successfully in Firestore');
    } catch (error) {
      console.error('❌ Error updating video list in Firestore:', error);
    }
  }
  // async makeLive() {
  //   this.disableButton = true
  //   if (this.data.size !== 0) {
  //     this.obj['title'] = this.title;
  //     this.obj['live'] = this.liveStatus;
  //     if (!this.title || this.title.trim() === '') {
  //       alert("title is mandatory");
  //       this.disableButton = false;
  //     } else {
  //       console.log(this.obj, "log obj");
  //       const evolutionMapCollection = this.firestore.collection("liveevolutionmapping").doc(this.profileid);
  //       const doc = await evolutionMapCollection.get().toPromise();
  //       if (doc.exists) {
  //         const existingData = doc.data();
  //         const updatedVideolist = Array.from(new Set([...existingData['videolist'] || [], ...this.obj['videolist']]));
  //         const updateObj = {
  //           videolist: updatedVideolist,
  //           live: this.obj['live'],
  //           title: this.obj['title'],
  //           lastupdated: firebase.firestore.FieldValue.serverTimestamp(),
  //         };
  //         await evolutionMapCollection.set(updateObj, { merge: true }).then(async result=>{
  //           const updatePromises = updatedVideolist.map(videoUrl => {
  //             return this.firestore.collection("evolutionmappingvideo",ref=>ref.where("videourl", "==", videoUrl))
  //               .get()
  //               .toPromise()
  //               .then(querySnapshot => {
  //                 const batch = this.firestore.firestore.batch();
  //                 querySnapshot.forEach(doc => {
  //                   batch.update(doc.ref, { urllive: true });
  //                 });
  //                 return batch.commit();
  //               });
  //           });  
  //           await Promise.all(updatePromises);
  //           this.disableButton = false
  //           this.closeDialog()
  //         });
  //         console.log("Document successfully updated!");
  //       } else {
  //         await evolutionMapCollection.set(this.obj).then(async result=>{
  //           const updatePromises = this.obj['videolist'].map(videoUrl => {
  //             return this.firestore.collection("evolutionmappingvideo",ref=>ref.where("videourl", "==", videoUrl))
  //               .get()
  //               .toPromise()
  //               .then(querySnapshot => {
  //                 const batch = this.firestore.firestore.batch();
  //                 querySnapshot.forEach(doc => {
  //                   batch.update(doc.ref, { urllive: true });
  //                 });
  //                 return batch.commit();
  //               });
  //           });
    
  //           // Wait for all updates to complete
  //           await Promise.all(updatePromises);
  //           this.disableButton = false;
  //           this.closeDialog()
  //         });
  //         console.log("Document successfully created!");
  //       }
  //       await this.liveData();
  //     }
  //   }
  // }
  async makeLive() {
    this.disableButton = true;

    // Ensure data is valid
    if (!this.data || this.data.size === 0) {
      this.disableButton = false;
      return;
    }

    // Prepare object for Firestore
    this.obj['title'] = this.title;
    this.obj['live'] = this.liveStatus;

    if (!this.title || this.title.trim() === '') {
      alert("Title is mandatory");
      this.disableButton = false;
      return;
    }

    console.log("makeLive obj:", this.obj);

    try {
      // 🔹 Reference to participant's live document
      const liveDocRef = doc(this.firestore, 'liveevolutionmapping', this.profileid);
      const docSnap = await getDoc(liveDocRef);

      if (docSnap.exists()) {
        // --- Existing document: update videolist and info ---
        const existingData = docSnap.data();
        const updatedVideolist = Array.from(
          new Set([...(existingData['videolist'] || []), ...(this.obj['videolist'] || [])])
        );

        const updateObj = {
          videolist: updatedVideolist,
          live: this.obj['live'],
          title: this.obj['title'],
          lastupdated: serverTimestamp(),
        };

        await setDoc(liveDocRef, updateObj, { merge: true });

        // --- Update all referenced videos (set urllive = true) ---
        const updatePromises = updatedVideolist.map(async (videoUrl: string) => {
          const q = query(collection(this.firestore, 'evolutionmappingvideo'), where('videourl', '==', videoUrl));
          const querySnapshot = await getDocs(q);

          const batch = writeBatch(this.firestore);
          querySnapshot.forEach(videoDoc => {
            batch.update(videoDoc.ref, { urllive: true });
          });

          await batch.commit();
        });

        await Promise.all(updatePromises);
        console.log('✅ Document successfully updated!');
      } else {
        // --- New document creation ---
        await setDoc(liveDocRef, {
          ...this.obj,
          lastupdated: serverTimestamp(),
        });

        const updatePromises = (this.obj['videolist'] || []).map(async (videoUrl: string) => {
          const q = query(collection(this.firestore, 'evolutionmappingvideo'), where('videourl', '==', videoUrl));
          const querySnapshot = await getDocs(q);

          const batch = writeBatch(this.firestore);
          querySnapshot.forEach(videoDoc => {
            batch.update(videoDoc.ref, { urllive: true });
          });

          await batch.commit();
        });

        await Promise.all(updatePromises);
        console.log('✅ Document successfully created!');
      }

      // Refresh live data after operation
      await this.liveData();

      this.disableButton = false;
      this.closeDialog();

    } catch (error) {
      console.error('❌ Error in makeLive:', error);
      this.disableButton = false;
    }
  }
}