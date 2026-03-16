import { CommonModule } from '@angular/common';
import { Component, inject, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore } from '@angular/fire/firestore';
import { MatChip, MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { SolarPlaylistComponent } from "./solar-playlist/solar-playlist.component";
import { EditComponent } from "./edit/edit.component";
import { MatButtonModule } from '@angular/material/button';
import { RouterOutlet, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PlaylistConfigurationComponent } from './playlist-configuration/playlist-configuration.component';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Clipboard } from '@angular/cdk/clipboard';

@Component({
  selector: 'app-playlist-dashboard',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatIcon,
    MatPaginatorModule,
    MatChipsModule,
    MatTableModule,
    MatButtonModule,
    RouterOutlet,
    MatSnackBarModule
],
  templateUrl: './playlist-dashboard.component.html',
  // styleUrl: './playlist-dashboard.component.css'
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})
export class PlaylistDashboardComponent {

  displayedColumns: string[] = ['Name','tags', 'Copy', 'Edit', 'Delete'];
  dataSource = new MatTableDataSource();
  voicePlaylist = []

  @ViewChild(MatPaginator) paginator : MatPaginator | undefined;
  // @ViewChild(MatSort) sort : MatSort | undefined;
  private subscription = new Subject<void>();
  private route = inject(ActivatedRoute);
  playlist:any
  playlistName : any
  selectedRows : any
  
  showParent : boolean = true
  showchild : boolean = false
  mode:string = ""

  tags = []
  mapTaxonomy = {}
  taxonomyList = []
  taxonomySubscription:Subscription

  constructor(public router: Router, private firestore: Firestore, private dialog:MatDialog, public clipboard: Clipboard,
    private snackBar: MatSnackBar,
  ){ 
    const solarvoiceplaylistRef = collection(this.firestore,'solar voice playlist')
    collectionSnapshots(solarvoiceplaylistRef).pipe(takeUntil(this.subscription)).subscribe(snapshot=>{
      this.voicePlaylist = snapshot.map(doc=>({id:doc.id,...doc.data()}))
      this.ngAfterViewInit()
    })
    const atctaxonomyRef = collection(this.firestore,'atc taxonomy')
    collectionSnapshots(atctaxonomyRef).pipe(takeUntil(this.subscription)).subscribe(snap => {
      let snapdata = snap.map(doc=> ({id:doc.id,...doc.data()}))
      this.taxonomyList = snapdata
      for (let i = 0; i < snapdata.length; i++) {
        const element = snapdata[i];
        this.mapTaxonomy[element['id']] = element['name']
      }
    })
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntil(this.subscription)
      )
      .subscribe((e: NavigationEnd) => {
        const hasChild = e.urlAfterRedirects.includes('add-playlist') || 
                        e.urlAfterRedirects.includes('edit-playlist');
        this.showParent = !hasChild;
        this.showchild = hasChild;
      });
  }

  ngOnInit(): void {}
  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }
  ngAfterViewInit(){
    this.dataSource.data = this.voicePlaylist
    this.dataSource.paginator = this.paginator
    // this.dataSource.sort = this.sort
  }

  // onClick(){
  //   this.showParent = false
  //   this.showchild = true
  //   this.mode = "add"
  //   this.router.navigateByUrl("/content-upload-v2/add-playlist")
  // }

  // onedit(id:any){
  //   this.showParent = false
  //   this.showchild = true
  //   this.mode = "edit"
  //   this.router.navigateByUrl(`/content-upload-v2/edit-playlist?id=${id['id']}`)
  // }
  // onClick() {
  // this.router.navigateByUrl('/content-upload-v2/playlistdashboard/add-playlist');
  // }

  // onedit(id: any) {
  //   this.router.navigateByUrl(`/content-upload-v2/playlistdashboard/edit-playlist?id=${id['id']}`);
  // }
// Remove RouterOutlet, PlaylistConfigurationComponent from imports array
// Remove ActivatedRoute, NavigationEnd, filter imports
// Remove showParent/showchild/mode properties and router.events subscription

  onClick() {
    const dialogRef = this.dialog.open(PlaylistConfigurationComponent, {
      data: { id: null },
      width: '95vw',
      maxWidth: '1200px',
      height: '90vh',
      panelClass: 'playlist-dialog',
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // Data refreshes automatically via collectionSnapshots
      }
    });
  }

  onedit(row: any) {
    const dialogRef = this.dialog.open(PlaylistConfigurationComponent, {
      data: { id: row['id'] },
      width: '95vw',
      maxWidth: '1200px',
      height: '90vh',
      panelClass: 'playlist-dialog',
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // Data refreshes automatically via collectionSnapshots
      }
    });
  }
  async ondelete(id:any){
    console.log(id);
    if(confirm("Are you sure ? ")){
      try {
        const solarvoiceplaylistRef = doc(this.firestore,'solar voice playlist',id)
        await deleteDoc(solarvoiceplaylistRef)
      } catch (error) {
        console.error(error);
        
      }
    }
  }

  ApplyFilter(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource.filter = filterValue.trim().toLowerCase()
  }

  // navigateToParentDiv(){
  //   this.showParent = true
  //   this.showchild = false
  //   this.mode = ""
  //   this.router.navigateByUrl("/playlistdashboard")
  // }

  navigateToParentDiv() {
    this.router.navigateByUrl('/content-upload-v2/playlistdashboard');
  }
  openSnackBar(message:string,action:string) {
    this.snackBar.open(message,action,{ duration: 2000})
  }
  copyToClipboard(data){
    this.openSnackBar(`${data.name} copied! Ready to share 🚀`, "OK");
    var url = "https://breakthroughs.app/content/solarvoice/" + data["id"]
    this.clipboard.copy(url)
  }
}
