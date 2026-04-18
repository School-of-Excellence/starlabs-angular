import { Component, OnInit, ViewChild } from '@angular/core';
import { Firestore, collection, collectionData,query, where, getDocs,doc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Storage, ref as afRef, uploadBytes as afUploadBytes, getDownloadURL as afGetDownloadURL } from '@angular/fire/storage';
import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer } from '@angular/platform-browser';
import { MatFormFieldModule } from '@angular/material/form-field';
import { LiveEvolutionMappingComponent } from '../evolution-mapping/live-evolution-mapping/live-evolution-mapping.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthguardService } from '../../authguard.service';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { EvolutionMappingAddV2Component } from './evolution-mapping-add-v2/evolution-mapping-add-v2.component';

interface LiveEvolutionMapping {
  profileid: string;
  title: string;
  live: boolean;
  videolist: any[];  
}

@Component({
  selector: 'app-evolution-mapping-v2',
  imports: [MatPaginatorModule, MatSort,MatFormFieldModule,CommonModule,FormsModule,MatTooltipModule,MatIconModule,MatTabsModule,MatSelectModule,MatTableModule,MatCheckboxModule,MatInputModule,MatButtonModule],
  templateUrl: './evolution-mapping-v2.component.html',
  styleUrl: './evolution-mapping-v2.component.css'
})
export class EvolutionMappingV2Component {
      mapProfile = {};
    mapVideoTitle: {} = {};
    tabledata: any[] = [];
    profileOptions: any[] = [];
    profileOptionsLive: any[] = [];
    selectedProfileId: string; 
    selectedProfileIdLive: string; 
    selection = new Set<any>();
    displayedColumns: string[] = ['Select','Name', 'Title', 'video', 'Date', 'Edit', 'Delete'];
    displayedColumns2: string[] = ['Name','Livestatus', 'Title','VideoList'];
    dataSource = new MatTableDataSource();
    dataSource2 = new MatTableDataSource();
    @ViewChild(MatPaginator) paginator: MatPaginator;
    @ViewChild(MatSort) sort: MatSort;
    searchTerm: string;
    originalData: any[] = [];
    originalLiveData: any[] = [];
    selectedLiveStatus: boolean | null = null;
    searchTitle: string = '';
    searchTitleTab1:string ='';
    globalSearchTab1: string = '';
    globalSearchTab2: string = '';
    constructor(
      public firestore: Firestore,
      private guard: AuthguardService,
      private storage: Storage,
      public dialog: MatDialog,
      public router: Router,
      private snackBar: MatSnackBar,
      private sanitizer: DomSanitizer,  
    ) { 
      this.dataSource = new MatTableDataSource();
      // this.dataSource2 = new MatTableDataSource();
      // this.guard.getProfileMap().then(e => {
      //   this.mapProfile = e.map;
      // });
    }

    // ngOnInit(): void {
    //   this.getEvolutionMapping();
    //   this.getLiveEvolutionMapping()
    // }

    async ngOnInit(): Promise<void> {
      const e = await this.guard.getProfileMap();
      this.mapProfile = e.map;

      // Now it's safe to fetch — mapProfile is populated
      await this.getEvolutionMapping();
      await this.getLiveEvolutionMapping();
    }

    ngAfterViewInit() {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      // this.dataSource2.paginator = this.paginator;
      // this.dataSource2.sort = this.sort;
    }
    isSelected(row: any): boolean {
      return Array.from(this.selection).some(item => item.docid === row.docid);
    }
    toggleSelection(event: any, row: any): boolean {
      const existingSelection = Array.from(this.selection).find(item => item.docid === row.docid);
      const firstSelectedProfileId = this.selection.size > 0 ? Array.from(this.selection)[0].profileid : null;

      if (existingSelection) {
        this.selection.delete(existingSelection);
        return true;
      } else {
        if (!firstSelectedProfileId || row.profileid === firstSelectedProfileId) {
          this.selection.add({
            docid: row.docid,
            profileid: row.profileid,
            title: row.title,
            videourl: row.videourl,
            recordeddate: row.recordeddate,
            created: row.created,
            name: this.mapProfile[row.profileid]
          });
          return true;
        } else {
          event.source.checked = false;
          setTimeout(() => {
            event.source.checked = false;
          });

          this.snackBar.open('You can only select rows with the same participant.', 'Close', {
            duration: 2000,
          });
          return false;
        }
      }
    }

    // toggleSelection(event: any, row: any) {
    //   const existingSelection = Array.from(this.selection).find(item => item.docid === row.docid);
    //   const firstSelectedProfileId = this.selection.size > 0 ? Array.from(this.selection)[0].profileid : null;

    //   if (existingSelection) {
    //     this.selection.delete(existingSelection);
    //   } else {
    //     if (!firstSelectedProfileId || row.profileid === firstSelectedProfileId) {
    //       this.selection.add({
    //         docid: row.docid,
    //         profileid: row.profileid,
    //         title: row.title,
    //         videourl: row.videourl,
    //         recordeddate: row.recordeddate,
    //         created: row.created,
    //         name: this.mapProfile[row.profileid]
    //       });
    //     } else {
    //       event.source.checked = false;
    //       setTimeout(() => {
    //         event.source.checked = false;
    //       });
          
    //       this.snackBar.open('You can only select rows with the same participant.', 'Close', {
    //         duration: 2000,
    //       });
    //       return false;
    //     }
    //   }
    //   console.log('Selected Row:', row);
    //   console.log('All Selected Rows:', Array.from(this.selection));
    // }
    async getEvolutionMapping() {
      this.mapVideoTitle = {};
      const evolutionRef = collection(this.firestore, 'evolutionmappingvideo');
      const q = query(evolutionRef, where('deleted', '!=', true));
      const res = await getDocs(q);

      const mapData: any[] = [];
      res.forEach((doc) => {
        const data: any = doc.data();
        this.mapVideoTitle[data.videourl] = data.title;
        mapData.push({
          docid: data.docid,
          profileid: data.profileid,
          title: data.title,
          videourl: data.videourl,
          recordeddate: data.recordeddate,
          created: data.created,
          urllive: data.urllive,
        });
      });

      // mapData.sort((a, b) => b.created.toDate() - a.created.toDate());
      mapData.sort((a, b) => {
        const aTime = a.created?.toDate?.().getTime() ?? 0;
        const bTime = b.created?.toDate?.().getTime() ?? 0;
        return bTime - aTime;
      });
      this.originalData = [...mapData];
      this.dataSource.data = mapData;

      const uniqueProfiles = Array.from(new Set(mapData.map(i => i.profileid)));

      // this.profileOptions = uniqueProfiles.map(id => ({
      //   id,
      //   name: this.mapProfile[id],
      // })).sort((a, b) => a.name.localeCompare(b.name));

      const orphans = uniqueProfiles.filter(id => !this.mapProfile[id]);
      if (orphans.length) {
        console.warn('Evolution mapping has orphan profileids (participant deleted?):', orphans);
      }
      
      this.profileOptions = uniqueProfiles.map(id => ({
        id,
        name: this.mapProfile[id] ?? '(Unknown participant)',
      })).sort((a, b) => a.name.localeCompare(b.name));
    }

    // getEvolutionMapping() {
    // this.mapVideoTitle = {};
    //   this.firestore.collection('evolutionmappingvideo', ref => ref.where("deleted", '!=', true)).get().toPromise().then((res) => {
    //     const mapData = [];
    //     res.docs.forEach((doc) => {
    //       this.mapVideoTitle[doc.data()['videourl']] = doc.data()['title'];
    //       const evolutionMapData = doc.data();
    //       let obj = {
    //         docid: evolutionMapData['docid'],
    //         profileid: evolutionMapData['profileid'],
    //         title: evolutionMapData['title'],
    //         videourl: evolutionMapData['videourl'],
    //         recordeddate: evolutionMapData['recordeddate'],
    //         created: evolutionMapData['created'],
    //         urllive:evolutionMapData['urllive'],

    //       };
    //       mapData.push(obj);
    //     });
    //     mapData.sort((a, b) => b['created'].toDate() - a['created'].toDate());
    //     this.originalData = [...mapData];
    //     this.dataSource.data = mapData;       
    //     const uniqueProfiles = Array.from(new Set(mapData.map(item => item.profileid)));
    //     this.profileOptions = uniqueProfiles.map(id => ({
    //       id: id,
    //       name: this.mapProfile[id]
    //     })).sort((a, b) => a.name.localeCompare(b.name));
    //   });  
    // }
    // getLiveEvolutionMapping() {
    //   this.firestore.collection('liveevolutionmapping',ref=>ref.where('videolist', '>', [])).get().toPromise().then((res) => {
    //     const mapLiveData = [];
    //     res.docs.forEach((doc) => {
    //       const evolutionMapData = doc.data();
    //       let obj = {
    //         // docid: evolutionMapData['docid'],
    //         profileid: evolutionMapData['profileid'],
    //         title: evolutionMapData['title'],
    //         live:evolutionMapData['live'],
    //         videolist: evolutionMapData['videolist'] || []
    //         // recordeddate: evolutionMapData['recordeddate'],
    //         // created: evolutionMapData['created'],
    //       };
    //       mapLiveData.push(obj);
    //     });
    //     // mapLiveData.sort((a, b) => b['created'].toDate() - a['created'].toDate());
    //     this.originalLiveData = [...mapLiveData];
    //     this.dataSource2.data = mapLiveData;       
    //     const uniqueProfiles = Array.from(new Set(mapLiveData.map(item => item.profileid)));
    //     this.profileOptionsLive = uniqueProfiles.map(id => ({
    //       id: id,
    //       name: this.mapProfile[id]
    //     })).sort((a, b) => a.name.localeCompare(b.name));
    //   });  
    // }
    async getLiveEvolutionMapping() {
  // Initialize empty maps
    const mapLiveData: any[] = [];

    // Create reference to the collection
    const liveEvolutionRef = collection(this.firestore, 'liveevolutionmapping');

    // Create Firestore query
    const q = query(liveEvolutionRef, where('videolist', '>', []));

    // Fetch query results
    const res = await getDocs(q);

    // Process documents
    res.forEach((doc) => {
      const data: any = doc.data();

      const obj = {
        profileid: data.profileid,
        title: data.title,
        live: data.live,
        videolist: data.videolist || []
      };

      mapLiveData.push(obj);
    });

    // Assign to local variables
    this.originalLiveData = [...mapLiveData];
    this.dataSource2.data = mapLiveData;

    // Build unique profile dropdown
    const uniqueProfiles = Array.from(new Set(mapLiveData.map(item => item.profileid)));
    // this.profileOptionsLive = uniqueProfiles
    //   .map(id => ({
    //     id,
    //     name: this.mapProfile[id]
    //   }))
    //   .sort((a, b) => a.name.localeCompare(b.name));
      this.profileOptionsLive = uniqueProfiles.map(id => ({
        id,
        name: this.mapProfile[id] ?? '(Unknown participant)',
      })).sort((a, b) => a.name.localeCompare(b.name));
    }
    // applyProfileFilter() {
    //   let filteredData = [...this.originalData];
    //   if (this.selectedProfileId) {
    //     filteredData = filteredData.filter(
    //       item => item.profileid === this.selectedProfileId
    //     );
    //   }
    //   if (this.searchTitleTab1 && this.searchTitleTab1.trim() !== '') {
    //     const searchTerm = this.searchTitleTab1.toLowerCase().trim();
    //     filteredData = filteredData.filter(
    //       item => item.title.toLowerCase().includes(searchTerm)
    //     );
    //   }
  
    //   this.dataSource.data = filteredData;  
    // }
    applyProfileFilter() {
        let filteredData = [...this.originalData];
        
        // Filter by profile
        if (this.selectedProfileId) {
            filteredData = filteredData.filter(
                item => item.profileid === this.selectedProfileId
            );
        }
        
        // Filter by title
        if (this.searchTitleTab1 && this.searchTitleTab1.trim() !== '') {
            const searchTerm = this.searchTitleTab1.toLowerCase().trim();
            filteredData = filteredData.filter(
                item => item.title.toLowerCase().includes(searchTerm)
            );
        }
        
        // Global search across all columns
        if (this.globalSearchTab1 && this.globalSearchTab1.trim() !== '') {
            const searchTerm = this.globalSearchTab1.toLowerCase().trim();
            filteredData = filteredData.filter(item => {
                const name = (this.mapProfile[item.profileid] || '').toString().toLowerCase();
                const title = (item.title || '').toString().toLowerCase();
                const date = item.recordeddate ? 
                    new Date(item.recordeddate.toDate()).toLocaleDateString().toLowerCase() : '';
                
                return name.includes(searchTerm) || 
                       title.includes(searchTerm) || 
                       date.includes(searchTerm);
            });
        }

        this.dataSource.data = filteredData;
    }
    applyProfileFilterLive() {
        let filteredData = [...this.originalLiveData];
        
        // Filter by profile
        if (this.selectedProfileIdLive) {
            filteredData = filteredData.filter(
                item => item.profileid === this.selectedProfileIdLive
            );
        }
        
        // Filter by status
        if (this.selectedLiveStatus !== null) {
            filteredData = filteredData.filter(
                item => item.live === this.selectedLiveStatus
            );
        }
        
        // Filter by title
        if (this.searchTitle && this.searchTitle.trim() !== '') {
            const searchTerm = this.searchTitle.toLowerCase().trim();
            filteredData = filteredData.filter(
                item => item.title.toLowerCase().includes(searchTerm)
            );
        }
        
        // Global search across all columns
        if (this.globalSearchTab2 && this.globalSearchTab2.trim() !== '') {
            const searchTerm = this.globalSearchTab2.toLowerCase().trim();
            filteredData = filteredData.filter(item => {
                const name = (this.mapProfile[item.profileid] || '').toString().toLowerCase();
                const title = (item.title || '').toString().toLowerCase();
                const status = item.live ? 'live' : 'not live';
                
                return name.includes(searchTerm) || 
                       title.includes(searchTerm) || 
                       status.includes(searchTerm);
            });
        }

        this.dataSource2.data = filteredData;
    }

    clearGlobalSearchTab1() {
        this.globalSearchTab1 = '';
        this.applyProfileFilter();
    }

    clearGlobalSearchTab2() {
        this.globalSearchTab2 = '';
        this.applyProfileFilterLive();
    }
    // applyProfileFilterLive() {
    //   let filteredData = [...this.originalLiveData];
    //   if (this.selectedProfileIdLive) {
    //     filteredData = filteredData.filter(
    //       item => item.profileid === this.selectedProfileIdLive
    //     );
    //   }
    //   if (this.selectedLiveStatus !== null) {
    //     filteredData = filteredData.filter(
    //       item => item.live === this.selectedLiveStatus
    //     );
    //   }
    //   if (this.searchTitle && this.searchTitle.trim() !== '') {
    //     const searchTerm = this.searchTitle.toLowerCase().trim();
    //     filteredData = filteredData.filter(
    //       item => item.title.toLowerCase().includes(searchTerm)
    //     );
    //   }
  
    //   this.dataSource2.data = filteredData;  
    //   // let filteredData = [...this.originalLiveData];  
    //   // if (this.selectedProfileIdLive) {
    //   //   filteredData = filteredData.filter(
    //   //     item => item.profileid === this.selectedProfileIdLive
    //   //   );
    //   // }
    //   // if (this.selectedLiveStatus !== null) {
    //   //   filteredData = filteredData.filter(
    //   //       item => item.live === this.selectedLiveStatus
    //   //   );
    //   // }
    //   // this.dataSource2.data = filteredData;
    // }
  
    // applyProfileFilterLive() {
    //   if (this.selectedProfileIdLive) {
    //     this.dataSource2.data = this.originalLiveData.filter(
    //       item => item.profileid === this.selectedProfileIdLive
    //     );
    //   } else {
    //     this.dataSource2.data = [...this.originalLiveData];
    //   }
    // }
    addEvolution() {
      var dialogRef = this.dialog.open(EvolutionMappingAddV2Component, { 
        disableClose: true,
        autoFocus: false,
        width: '90%',
        maxWidth: '1100px',
        height: 'auto',
        maxHeight: '90vh',
      });
      dialogRef.afterClosed().subscribe(value => {  
        this.getEvolutionMapping();
      });
    }

    edit(row: any) {
      var dialogRef = this.dialog.open(EvolutionMappingAddV2Component, { 
        data: row,
        disableClose: true,
        autoFocus: false,
        width: '90%',
        maxWidth: '1100px',
        height: 'auto',
        maxHeight: '90vh',
      });
      dialogRef.afterClosed().subscribe(value => {  
        this.getEvolutionMapping();
      });
    }
    videoPlay(row: any) {
      const videoUrl = row;
      if (videoUrl) {
        window.open(videoUrl, '_blank');
      } else {
        console.error('No video URL provided for row:', row);
      }
    }
    // confirmDelete(row: any) {
    //   const confirmDownload = confirm(`Are you sure you want to delete ${this.mapProfile[row.profileid]}'s ${row.title}?`);
    //   if (confirmDownload) {
    //     this.firestore.collection("evolutionmappingvideo").doc(row.docid).update({
    //       deleted: true
    //     })
    //     .then(value => {
    //       this.getEvolutionMapping();
    //     });
    //   }
    // }
    async confirmDelete(row: any) {
      const confirmDelete = confirm(`Are you sure you want to delete ${this.mapProfile[row.profileid]}'s ${row.title}?`);

      if (confirmDelete) {
        try {
          // Create reference to document
          const docRef = doc(this.firestore, 'evolutionmappingvideo', row.docid);

          // Update the deleted flag
          await updateDoc(docRef, { deleted: true });

          // Refresh the data
          this.getEvolutionMapping();

        } catch (error) {
          console.error('Error deleting document:', error);
        }
      }
    }
    clearSelection() {
      this.selection.clear();
    }
    makeLive(row:any){
      var dialogRef = this.dialog.open(LiveEvolutionMappingComponent, { 
        data: row == null ? this.selection : row,
        disableClose: true,
        autoFocus: false,
        width: '90%',
        height: '95%',
      });
      dialogRef.afterClosed().subscribe(value => {  
        this.getEvolutionMapping();
        this.getLiveEvolutionMapping();
        this.clearSelection();
      });
      console.log('making live Selected Rows:', Array.from(this.selection));
    }
    sanitize(url: string) {
      return this.sanitizer.bypassSecurityTrustUrl(url);
    }
  }