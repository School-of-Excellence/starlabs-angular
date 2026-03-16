import { Component, ViewChild } from '@angular/core';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { MatDialog } from '@angular/material/dialog';
import { Clipboard } from '@angular/cdk/clipboard';
import { collection, collectionSnapshots, Firestore, getDoc, getDocs } from '@angular/fire/firestore';''
import { UpdatePlaylistadsComponent } from './update-playlistads/update-playlistads.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule, MatIconButton } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-playlist-ads',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatIconModule,
    MatPaginatorModule,
    CommonModule,
    MatButtonModule

  ],
  templateUrl: './playlist-ads.component.html',
  styleUrl: './playlist-ads.component.css'
})
export class PlaylistAdsComponent {


  displayedColumns: string[] = ['adstitle', 'adsdescription', 'adslink', 'adstype', 'startdate', 'enddate', 'available', 'playlist', 'action'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  mapGeneralContent = {}
  contentList = []
  adsPlaylistSubscription: Subscription
  private subscription = new Subject<void>();

  constructor(public guard: AuthguardService, public dialog: MatDialog, public firestore: Firestore, public clipboard: Clipboard) {
    guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        const contenturlsRef = collection(this.firestore,"content_urls")
        getDocs(contenturlsRef).then(async contentSnap => {
          for (let i = 0; i < contentSnap.docs.length; i++) {
            const element = contentSnap.docs[i].data();
            this.mapGeneralContent[element['docid']] = element['title']
            this.contentList.push(element)
          }
        })
        const adsplaylistRef = collection(this.firestore,"adsplaylist")
        collectionSnapshots(adsplaylistRef).pipe(takeUntil(this.subscription)).subscribe(listData=>{
          let list = listData.map(doc => ({id:doc.id,...doc.data()}))
          this.ngAfterViewInit(list)
        })
      // }
    })
  }

  ngOnInit(): void {}

  ngAfterViewInit(list){
    this.dataSource.data = list || []
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }
  
  filterTable(value){
    this.dataSource.filter = value
  }

  updatePlaylist(value){
    this.dialog.open(UpdatePlaylistadsComponent, {
      data: {
        adsplaylist: value,
        contentlist: this.contentList,
        contentMap : this.mapGeneralContent
       },
      maxHeight: "90vh",
      maxWidth: "90vw",
      disableClose: true,
      autoFocus: false,
    })
  }

  copyToClipboard(data){
    var url = "https://breakthroughs.app/content/adsplaylist/" + data["docid"]
    this.clipboard.copy(url)
  }

}
