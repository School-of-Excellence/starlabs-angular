import { SelectionModel } from '@angular/cdk/collections';
import { CdkDrag,CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, doc, Firestore, getDocs, orderBy, DocumentReference, query, writeBatch,arrayUnion } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask } from '@angular/fire/storage';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { LoadingComponent } from '../../../DialogBox/loading/loading.component';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-add-series',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    CommonModule,FormsModule,
    MatSelectModule,
    MatCheckboxModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    DragDropModule,
    MatCheckboxModule,
    CdkDrag,
    MatIconModule
  ],
  templateUrl: './add-series.component.html',
  styleUrl: './add-series.component.css'
})
export class AddSeriesComponent {

  displayedColumns : string[] = ['Select', 'Title', 'Description', 'Thumbnail', 'Episode']
  dataSource = new MatTableDataSource()

  @ViewChild(MatPaginator) paginator : MatPaginator | any;
  @ViewChild(MatSort) sort : MatSort | any;

  masterSelected!:boolean;
   checklist:any;
   checkedList:any;
   selection = new SelectionModel<any>(
    true, 
    []
    );
   selectedRows : any []=[]
   seriesName: any
   description: any
   category : any [] = []
   selectedCategory : any 


   
   video! : File
   image!: File
   heroImage: File
   File!: File;
   imageUrl: any;
   videoUrl : any;
   tabledata : any = []
   crossmatch: any;
   crossmatcherrormessage: any
   selectedtier : any = []
   tier: any = []
   id: string;
   heroImageUrl: any = ''

  getloading(){
    return this.dialog.open(LoadingComponent,{disableClose:true})
  }
  private subscription = new Subject<void>();

  constructor(private domSanitizer: DomSanitizer, private firestore: Firestore, private storage: Storage, private router: Router, public route: ActivatedRoute, public dialog: MatDialog) { 
    const episodeRef = collection(this.firestore,'episodes')
    const episodeQuery = query(episodeRef,orderBy('date', 'desc'))
    collectionSnapshots(episodeQuery).pipe(takeUntil(this.subscription)).subscribe((snapshotData) => {
      let snapshot =  snapshotData.map(doc=>({id:doc.id,...doc.data()}))
      this.dataSource.data = snapshot;
      this.dataSource.paginator = this.paginator;
      // this.dataSource.sort = this.sort;
    });
    const categoryRef = collection(this.firestore,'category')
    getDocs(categoryRef).then(res => {
      for(let i=0; i<res.docs.length; i++){
        this.category.push(res.docs[i].data());
      }
      // console.log(this.category)
    })
    const seriesRef = collection(this.firestore,'series')
    getDocs(seriesRef).then((res) => {
      for(let i=0; i<res.docs.length; i++){
         this.tabledata.push(res.docs[i].data())
        //  console.log(this.tabledata)
      }
    })

    const tierRef = collection(this.firestore,'tier')
    getDocs(tierRef).then((res)=>{
      for(let i=0; i<res.docs.length; i++){
        this.tier.push(res.docs[i].data())
      }
      // console.log(this.tier)
    })

  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }


  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  masterToggle() {
    this.isAllSelected() ?
        this.selection.clear() :
        this.dataSource.data.forEach(row => this.selection.select(row));
  }

  updateSelectedRows(event: any) {
    // console.log(event);
    
    // console.log(this.selection);
    
    this.selectedRows = this.selection.selected;
    
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.selectedRows, event.previousIndex, event.currentIndex);
  }

  previewImage(event: any) {
    this.image = event.target.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(this.image);
    reader.onload = () => {
     if(typeof reader.result === 'string') {
       this.imageUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
     } else {
       console.log(Error)
     }
    }
  }

  previewheroImage(event: any){
    this.heroImage = event.target.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(this.heroImage);
    reader.onload = () => {
     if(typeof reader.result === 'string') {
       this.heroImageUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
     } else {
       console.log(Error)
     }
    }
  }

  previewVideo(event: any) {
  
    this.video = event.target.files[0];
    // console.log(this.video)
    const reader = new FileReader();
    reader.readAsDataURL(this.video);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        this.videoUrl = this.domSanitizer.bypassSecurityTrustUrl(reader.result);
  
      } else {
        console.log(Error)
      }
    };
  }

  async onUpload(seriesName: any, description: any, selectedCategory: any) {
    let seriesRefs: DocumentReference[] = [];
    for (let i = 0; i < this.selectedRows.length; i++) {
      const episodesref = doc(this.firestore,'episodes',this.selectedRows[i]['id'])
      seriesRefs.push(episodesref);
    }
    let tierRefs: any = []
    for ( let i = 0; i< this.selectedtier.length; i++) {
      const tierref = doc(this.firestore,'tier',this.selectedtier[i])
      tierRefs.push(tierref)
    }
    let categoryRefs = selectedCategory ? doc(this.firestore,'category',selectedCategory) : null;
    console.log("Series", seriesRefs, "Tires", tierRefs, "Catergory", categoryRefs);

    let loadingref = this.getloading();
    var batch = writeBatch(this.firestore)
    //create id syntax
    //this.id = this.firestore.createId();
    this.id = doc(collection(this.firestore,'series')).id
    var uploadedHero = null;
    var uploadedImage = null;

    if(this.heroImage){
      const heroImageStorageRef = ref(this.storage,`images/${Date.now()}_${this.heroImage.name}`);
      try {
        const heroSnapshot = await uploadBytes(heroImageStorageRef, this.heroImage);
        const heroImageUrl = await getDownloadURL(heroSnapshot.ref);
        console.log(heroImageUrl);
        this.heroImageUrl = heroImageUrl;
        uploadedHero = heroImageUrl;
      } catch (error) {
        console.error(error); 
      }
    }

    try {
      const imageStorageRef = ref(this.storage,`images/${Date.now()}_${this.image.name}`);
      const imageSnapshot = await uploadBytes(imageStorageRef, this.image);
      const imageUrl = await getDownloadURL(imageSnapshot.ref);
      uploadedImage = imageUrl;      
    } catch (error) {
      console.error('Image upload failed:', error);
      loadingref.close();
      return; 
    }

    var seriesData = {
      id: this.id,
      seriesName: seriesName,
      description: description,
      category: categoryRefs || null,
      tier: tierRefs,
      sequence: seriesRefs,
      imageUrl: uploadedImage,
      heroImageUrl : uploadedHero,
      order : 1,
      date: new Date()
    }
    console.log(seriesData)
    batch.set(doc(this.firestore,'series',this.id), seriesData)
    seriesRefs.forEach(ref => {
      batch.update(ref, {
        series: arrayUnion(doc(this.firestore,'series',this.id))
      })
    });

    await batch.commit();
    loadingref.close();
    this.router.navigateByUrl('seriesdashboard');
  }
  
  

  onCancel(){
    this.router.navigateByUrl('seriesdashboard')
  }

  onSelect(){
     var duplicateNameCheck = this.tabledata.some((e:any) => e.seriesName.trim().toLowerCase() === this.seriesName.trim().toLowerCase())
       this.crossmatch = duplicateNameCheck
       this.crossmatcherrormessage =  duplicateNameCheck ? "series name Already Exit": false
    }

    ApplyFilter(event : Event){
      const filterValue = (event.target as HTMLInputElement).value
      this.dataSource.filter = filterValue.trim().toLowerCase()
    }


}
