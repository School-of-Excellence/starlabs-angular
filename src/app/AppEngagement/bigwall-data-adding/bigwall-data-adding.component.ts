import { Component, OnInit,ViewChild} from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, docSnapshots, Firestore, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, Unsubscribe, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import { Subscription } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { firstValueFrom } from 'rxjs';
import { ChangeDetectorRef } from '@angular/core';
import { ParticipantReportsComponent } from './participant-reports/participant-reports.component';
import { SelectAchievementpostComponent } from './select-achievementpost/select-achievementpost.component';
import { SelectCommunitypostComponent } from './select-communitypost/select-communitypost.component';
import {MatTabsModule} from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatOptionModule } from '@angular/material/core';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { VideoasktranscribeComponent } from "./videoasktranscribe/videoasktranscribe.component";

@Component({
  selector: 'app-bigwall-data-adding',
  standalone:true,
  imports: [
    MatFormFieldModule,
    MatTableModule,
    MatSelectModule,
    MatInputModule,
    MatOptionModule,
    MatIconModule,
    MatButtonModule,
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    ParticipantReportsComponent,
    SelectAchievementpostComponent,
    SelectCommunitypostComponent,
    MatTabsModule,
    MatPaginatorModule,
    MatSortModule,
    VideoasktranscribeComponent
],
  templateUrl: './bigwall-data-adding.component.html',
  styleUrls: ['./bigwall-data-adding.component.css']
})
export class BigwallDataAddingComponent implements OnInit {
  eventList:any[]=[]
  selectedEventId: string;
  arenaHighlightsSubscription: Unsubscribe | null = null;
  mapProfile = {};
  //participant reports
  participantDataSource = new MatTableDataSource()
  participantDisplayedColumns = ['name','anonymous','created', 'title','description','image','delete'];
  // pinned achievement
  pinnedAchievementDataSource = new MatTableDataSource()
  pinnedAchievementDisplayedColumns = ['name', 'created', 'private','postcategory','paralleltrajectory','pinned','delete'];
  //un pinned achievement
  unPinnedAchievementDataSource = new MatTableDataSource()
  unPinnedAchievementDisplayedColumns = ['name', 'created', 'private','postcategory','paralleltrajectory','pinned','delete'];
  //pinned community post
  pinnedCommunityDataSource = new MatTableDataSource()
  pinnedCommunityDisplayedColumns = ['eventref','categoryname', 'type', 'created','pinned','delete'];
  // un pinned community post
  unPinnedCommunityDataSource = new MatTableDataSource()
  unPinnedCommunityDisplayedColumns = ['eventref','categoryname', 'type', 'created','pinned','delete'];
  //pinned Video Ask
  pinnedVideoaskDataSource = new MatTableDataSource()
  pinnedVideoaskDisplayedColummns = ['participant', 'event', 'fileurl',"uploaded",'pinned','delete'];
  // un pinned community post
  unPinnedVideoaskDataSource = new MatTableDataSource()
  unPinnedVideoaskDisplayedColummns = ['participant', 'event', 'fileurl',"uploaded",'pinned','delete'];
  //
  mapPostCategory = {}
  mapEvent = {}
  mapProfileData = {}
  constructor(private firestore:Firestore,
    private guard: AuthguardService,
    private cdRef: ChangeDetectorRef ,
    private afs: Firestore,
  ) { 
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
    });
      const eventRef = collection(this.firestore, 'event collection');
      const eventQuery = query(eventRef, orderBy('name'));
      getDocs(eventQuery).then(snap => {      this.eventList = snap.docs.map(e => {
        let element = e.data()
        element["id"] = e.id 
        this.mapEvent[e.id] = e.data()['name']
        return element
      })
      this.cdRef.detectChanges()

    })
    const postRef = collection(this.firestore, 'post_categories');
    const postQuery = query(postRef, orderBy('type'));
    getDocs(postQuery).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i];
        this.mapPostCategory[element.id] = element.data()
      }
      // console.log(this.mapPostCategory);
    })
    const profileRef = collection(this.firestore, 'profile_data');
    const profileQuery = query(profileRef, orderBy('name'));
    getDocs(profileQuery).then(async profileSnap => {
      for (let i = 0; i < profileSnap.docs.length; i++) {
        const elementData = profileSnap.docs[i].data()
        this.mapProfileData[elementData['profileid']] = elementData
      }
    })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(){
     if (this.arenaHighlightsSubscription) {
      this.arenaHighlightsSubscription();
      this.arenaHighlightsSubscription = null;
    }
  }
   testHLS(hlsUrl: string | null | undefined) {
    if (hlsUrl) {
      console.log('Playing HLS stream:', hlsUrl);
      window.open(hlsUrl, '_blank');
    } else {
      console.warn('No HLS stream available for this item.');
    }
  }
  onEventSelect(event){
      this.selectedEventId = event.value;
      const eventDocRef = doc(this.firestore, 'event collection', this.selectedEventId);
      const highlightsQuery = query( collection(this.firestore, 'arena highlights'), where('eventref', '==', eventDocRef) );
      this.arenaHighlightsSubscription = onSnapshot(highlightsQuery, (snapshot) => {
      const snap = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.participantDataSource.data = snap.filter(e => e['from']  === 'participantreports')
      this.pinnedAchievementDataSource.data = snap.filter(e => e['pinned'] === true && e['from'] === 'achievement')
      this.unPinnedAchievementDataSource.data = snap.filter(e => (e['pinned'] === false || e['pinned'] === undefined)  && e['from']  === 'achievement')
      this.pinnedCommunityDataSource.data = snap.filter(e => e['pinned'] === true && e['from']  === 'communitypost')
      this.unPinnedCommunityDataSource.data = snap.filter(e => (e['pinned'] === false || e['pinned'] === undefined) && e['from']  === 'communitypost')
      this.pinnedVideoaskDataSource.data = snap.filter(e => e['pinned'] === true && e['from']  === 'arena videoask')
      this.unPinnedVideoaskDataSource.data = snap.filter(e => (e['pinned'] === false || e['pinned'] === undefined) && e['from']  === 'arena videoask')
    })
  }

  onPinnedDoc(doc:any){
    let id = doc['from'] === "achievement" ? doc['postid'] : doc['docid']
    const docRef = doc(this.firestore, 'arena highlights', id); // create document reference
    updateDoc(docRef, { pinned: true });
  }
  unPinnedDoc(doc: any) {
  const id = doc['from'] === 'achievement' ? doc['postid'] : doc['docid'];
  const docRef = doc(this.firestore, 'arena highlights', id);
  updateDoc(docRef, { pinned: false });
}
  onDelete(doc:any){
    console.log("delete");
    let id = doc['from'] === "achievement" ? doc['postid'] : doc['docid']
    console.log("idd",id);
    const docRef = doc(this.firestore, 'arena highlights', id);
    deleteDoc(docRef).then(() => {
      console.log("Document successfully deleted!");
    }).catch(error => {
      console.error("Error removing document: ", error);
    });
  }
}
