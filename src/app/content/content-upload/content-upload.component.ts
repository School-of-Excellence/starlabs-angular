import { Component, ViewChild } from '@angular/core';
import { FormControl, FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { lastValueFrom, Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, where } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
import { ContentUploadDialogComponent } from './content-upload-dialog/content-upload-dialog.component';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import * as XLSX from 'xlsx';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { MatSortModule } from '@angular/material/sort';

@Component({
  selector: 'app-content-upload',
  imports: [
    MatFormFieldModule,
    MatProgressBarModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSnackBarModule,
    MatSortModule
  ],
  templateUrl: './content-upload.component.html',
  // styleUrl: './content-upload.component.css'
  styleUrls: ['../../content-upload-version2/content-upload-shared.css']
})
export class ContentUploadComponent {

  loggedinUser: any;
  loggedinProfileid: any;
  loading: boolean = true;
  myControl = new FormControl('');
  contentDataList = [];


  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  displayedColumns: string[] = ['serialNo', 'added', 'title', 'videosize', 'thumbnailsize','duration' ,'available', 'convertedtohls', 'tags', 'edit'];
  // displayedColumns: string[] = ['serialNo', 'added', 'title', 'thumbnail', 'thumbnailsize', 'available', 'convertedtohls', 'tags', 'edit', 'delete'];
  contentData = new MatTableDataSource();
  mapTaxonomy = {}
  private subscription = new Subject<void>();
  constructor(
    private fb: FormBuilder,
    private storage: Storage,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private firestore: Firestore,
    public guardservice: AuthguardService,
    public clipboard: Clipboard,
    public httpClient: HttpClient
  ) {
    this.loading = true
    guardservice.getuid().then(async uid => {
      this.loggedinUser = uid
      const userdataRef = doc(this.firestore, 'user_data', uid)
      const profiledataRef = collection(this.firestore, 'profile_data')
      const profiledataQuery = query(profiledataRef, where("user_ref", "==", userdataRef))
      getDocs(profiledataQuery).then(profileData => {
        this.loggedinProfileid = profileData.docs[0].id
      })
      this.loading = false
      const contenturlsRef = collection(this.firestore, 'content_urls')
      const contenturlsQuery = query(contenturlsRef, orderBy('added', 'desc',))
      collectionSnapshots(contenturlsQuery).pipe(takeUntil(this.subscription)).subscribe(content => {
        this.contentDataList = [];
        for (let i = 0; i < content.length; i++) {
          var element = content[i].data();
          if (element['docid'] == null) {
            element['docid'] = content[i].id
          }
          this.contentDataList.push(element)
        }
        this.contentData.data = this.contentDataList
        this.contentData.sort = this.sort
        this.contentData.sortingDataAccessor = (item: any, headerSort: string) => {
          switch (headerSort) {
            case 'added': return item.added?.toDate().getTime() ?? 0;
            case 'title': return item.title?.toLowerCase() ?? '';
            case 'videosize': return item.videoSize ?? 0;
            case 'duration': return item.duration ?? 0;
          }
        };
        this.contentData.paginator = this.paginator
      })
      const atctaxonomyRef = collection(this.firestore, 'atc taxonomy')
      collectionSnapshots(atctaxonomyRef).pipe(takeUntil(this.subscription)).subscribe(snapData => {
        let snap = snapData.map(doc => ({ id: doc.id, ...doc.data() }))
        for (let i = 0; i < snap.length; i++) {
          const element = snap[i];
          this.mapTaxonomy[element['id']] = element['name']
        }
      })

    });

  }

  ngOnInit() { }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 2000 })
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.contentData.filter = filterValue.trim().toLowerCase();

    if (this.contentData.paginator) {
      this.contentData.paginator.firstPage();
    }
  }
  formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '—';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }
  editContent(currentcontent) {
    this.dialog.open(ContentUploadDialogComponent, {
      disableClose: true,
      data: currentcontent,
      maxHeight: "90vh",
      minWidth: "90vw"
    })
  }
  newContent() {
    this.dialog.open(ContentUploadDialogComponent, {
      disableClose: true,
      data: null,
      maxHeight: "90vh",
      minWidth: "90vw"
    })
  }

  uploadToPublitio(contentData){
    console.log(contentData)

    if(!contentData["convertedtohls"] && [null, "upload failed"].includes(contentData["hlsstatus"])){
      if(confirm("Sure, do you want to enable HSL?")){
        const url = `https://us-central1-${environment.firebase.projectId}.cloudfunctions.net/uploadContentToPublitio?contentid=${contentData['docid']}&contenttype=generalcontent`;
        console.log(url)
        lastValueFrom(
          this.httpClient.get(url)
        ).then(value =>{
          console.log(value)
        });
      }
    }

  }

  async deleteContent(currentcontent) {
    console.log(currentcontent);
    let confirmdialog = confirm('Are you sure want the delete this content');
    if (!confirmdialog) return;
    try {
      if (currentcontent['url'] != null) {
        const urlRef = ref(this.storage, currentcontent['url'])
        await deleteObject(urlRef);
      }
      if (currentcontent['thumbnail'] != null) {
        const thumbnailRef = ref(this.storage, currentcontent['thumbnail'])
        await deleteObject(thumbnailRef);
      }
      const contenturlsRef = doc(this.firestore, 'content_urls', currentcontent['docid'])
      await deleteDoc(contenturlsRef)
      this.openSnackBar("Successfully Content Deleted", "")
    } catch (error) {
      console.error(error);
      this.openSnackBar("Something went wrong", "");
    }
  }
  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }
  copyToClipboard(data) {
    console.log('copied')
    this.openSnackBar(`${data.title} copied! Ready to share 🚀`, "OK");
    var url = "https://breakthroughs.app/generalcontent/" + data["docid"]
    this.clipboard.copy(url)
  }

  formatDate(date: any) {
    if (!date) return '';
    if (date?.toDate) {
      return date.toDate().toDateString();
    } else if (date?.toDateString) {
      return date?.toDateString()
    }

    return date;
  }

  exportToExcel() {
    const data = this.contentData.filteredData;
    const sheetData: any[][] = [];

    // Header
    sheetData.push([
      'S.No',
      'Added',
      'Title',
      'Thumb',
      'Size',
      'Available',
      'HLS',
      'Tags',
      'URL'
    ]);

    data.forEach((item: any , index) => {
      const tags = (item.tags || []).map((tag)=>this.mapTaxonomy[tag] || '')?.join(',');
      const size = `${(item?.thumbnailsize / 1000 ).toFixed(2)} KB`
       var url = "https://breakthroughs.app/generalcontent/" + item["docid"] || ''
        sheetData.push([
          index + 1,
          this.formatDate(item.added) || '',
          item?.title || '',
          item?.thumbnail == null ? 'Missing' : 'Uploaded' , 
          size,
          item.available ? 'Yes' : 'No',
          item.convertedtohls ? 'Yes' : 'No',
          tags || '',
          url
        ]);

    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    // worksheet['!merges'] = merges;

    // Optional column widths
    worksheet['!cols'] = [
      { wch: 10 },
      { wch: 18 },
      { wch: 40 },
      { wch: 18 },
      { wch: 15 },
      { wch: 22 },
      { wch: 15 },
      { wch: 30 },
      { wch: 50 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Content Upload');

    XLSX.writeFile(
      workbook,
      `content_upload_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  }


}
