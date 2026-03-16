import { SelectionModel } from '@angular/cdk/collections';
import { CdkDrag,CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, ViewChild } from '@angular/core';
import { collection, doc, Firestore, getDocs, orderBy, query, updateDoc } from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ref, uploadBytes, getDownloadURL, deleteObject, Storage, UploadTask } from '@angular/fire/storage';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-edit-series',
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
  ],  templateUrl: './edit-series.component.html',
  styleUrl: './edit-series.component.css'
})
export class EditSeriesComponent {

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
  patchvalue: any
  seriesName: any
  description : any
  category : any = []
  selectedCategory : any 
  tier : any = []
  selectedTier = [] 
  video! : File
  image! : File
  heroImage!: File
  File! : File
  imageUrl : any
  videoUrl : any
  tabledata : any = []
  seriesReceivedDoc : any = {}
  id
  showupdatewindow : boolean | undefined
  prevVideoUrl
  prevImageUrl
  heroImageUrl: any;
  episodeList : any = []
  mapEpisodes:any = {}
  docId: any;
  rearrangedSequence = []
 
  constructor(
    private router: Router, 
    private route: ActivatedRoute, 
    private firestore: Firestore, 
    private domSanitizer: DomSanitizer, 
    private storage: Storage,
    private _snackBar: MatSnackBar
  ) {
    // this.firestore.collection('episodes', ref => ref.orderBy('date', 'desc')).valueChanges().subscribe(snapshot => {
    //   this.episodeList = snapshot;
    // })
    this.id  = this.route.snapshot.queryParams['id']
    const episodesRef = collection(this.firestore,'episodes')
    const episodesQuery = query(episodesRef,orderBy('date', 'desc'))
    getDocs(episodesQuery).then(snapshot => {
      this.episodeList = snapshot.docs.map(e => {
        let element = e.data();
        this.mapEpisodes[element['id']] = element;
        return element
      })
      console.log(this.episodeList);
      const seriesRef = collection(this.firestore,'series')
      getDocs(seriesRef).then( async (res) => {
        this.docId = this.route.snapshot.queryParams['id']
        // console.log(this.docId)
        for(let i=0;i<res.docs.length;i++){
          this.tabledata.push(res.docs[i].data())
          // console.log(res.docs[i].data())
          // console.log(res.docs[i].id)
          if(res.docs[i].id == this.docId) {
            console.log(res.docs[i].id)
            this.seriesReceivedDoc = res.docs[i].data();
            console.log(this.seriesReceivedDoc);
            
            this.seriesName = this.seriesReceivedDoc['seriesName']
            this.description = this.seriesReceivedDoc['description']
            if (this.seriesReceivedDoc['category']) {
              const categoryRef = this.seriesReceivedDoc['category'];
              this.selectedCategory = categoryRef.id;
            }
            this.selectedTier = this.seriesReceivedDoc['tier'] || [];
            let episodeRefs = this.seriesReceivedDoc['sequence']
            let episodesDocs: any[] = [];
            for(let i=0; i<episodeRefs.length;i++){
              if(this.mapEpisodes.hasOwnProperty(episodeRefs[i].id)){
                episodesDocs.push(this.mapEpisodes[episodeRefs[i].id])
              }
            }
            this.patchvalue = episodesDocs
            console.log(this.patchvalue);
          }
        }
        this.ngAferViewInit();
      })
    })
    

    // let id  = this.route.snapshot.queryParams['id']
    // console.log(id)
    const categoryRef = collection(this.firestore,'category')
    getDocs(categoryRef).then(res => {
      for(let i=0; i<res.docs.length; i++){
        this.category.push(res.docs[i].data());
      }
      console.log(this.category)
    })

    // this.firestore.collection('solar voice playlist').get().toPromise().then(async (res)=>{
    //   this.docId = this.route.snapshot.queryParams['id']
    //   for(let i = 0;i < res.docs.length; i++){        
    //     this.tabledata.push(res.docs[i].data())
    //     if(res.docs[i].id == this.docId){
    //       this.playlistReceivedDoc = res.docs[i].data()
    //       this.private = this.playlistReceivedDoc['private'] ?? false
    //       this.playlistName = res.docs[i].data()['name']
    //       this.description = res.docs[i].data()['description']
    //       let audioRefs = this.playlistReceivedDoc['sequence']
    //       let audioDocData = [];
    //       for(let j = 0; j < audioRefs.length; j++){
    //         audioDocData.push(this.mapAudio[audioRefs[j].id])
    //       }
    //       this.patchvalue = audioDocData
    //     }
    //   }


    // firestore.collection('series').get().toPromise().then((res)=>{
    //   for(let i=0;i<res.docs.length; i++){
    //     this.tabledata.push(res.docs[i].data())
    //     console.log(this.tabledata)
    //   }

    //   res.docs.forEach(doc =>{
    //     if(doc['id'] == id){
    //       console.log(id)
    //       this.seriesReceivedDoc = doc.data()
    //       console.log(this.seriesReceivedDoc)
    //       this.seriesName = this.seriesReceivedDoc['seriesName']
    //       console.log(this.seriesName);
    //       this.description = this.seriesReceivedDoc['description']
    //       console.log(this.description)
    //       // this.category = this.seriesReceivedDoc['category']
    //       console.log(this.category)
    //       let episodeRefs = this.seriesReceivedDoc['sequence']
    //       console.log(episodeRefs);
    //       let imageUrl = this.seriesReceivedDoc['imageUrl']

    //       console.log(imageUrl)
    //       let episodesDocs: any[] = [];
    //       for(let i=0; i<episodeRefs.length; i++){
    //         episodeRefs[i].get().then((doc: { data: () => any; })=>{
    //           console.log(doc.data());
              
    //          episodesDocs.push(doc.data())
             
    //         })
    //         console.log(episodesDocs);

    //         this.patchvalue = episodesDocs
    //       }
    //     }
    //     this.ngAferViewInit()
    //   })
    // })
  }

  ngOnInit(): void {}
  
  onHtmlload(){
    this.ngOnInit()
    this.ngAferViewInit()
  }

  ngAferViewInit(){
    // this.dataSource.data = this.episodeList
    this.dataSource.data = []
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    let filterdata = (this.episodeList || []).filter(l => (this.patchvalue || []).map(e => e.id).includes(l.id))
    // for (let i = 0; i < this.patchvalue.length || []; i++) {
    //   filterdata.push(this.episodeList.filter(e => e.id == this.patchvalue[i].id)[0])
    // }
    console.log(filterdata)

    // let filterdata2 = this.episodeList.filter(e => this.patchvalue.some(opt => opt.id != e.id))
    // console.log(filterdata2);
    
    // let data = [...filterdata, ...filterdata2]

    let data = this.episodeList
    
    // data = data.filter((x, i, a) => a.indexOf(x) == i)
    this.dataSource.data = data;  
    this.selection.select(...filterdata)
    this.updateSelectedRows()
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

  updateSelectedRows() {
    // console.log(this.selection);
    this.selectedRows = this.selection.selected;
    this.rearrangedSequence = Object.assign([],this.selection.selected.map(e => Object.assign({},e)))
    console.log(this.rearrangedSequence.map(e =>e.title));
    
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.rearrangedSequence, event.previousIndex, event.currentIndex);
    console.log(this.rearrangedSequence.map(e =>e.title));
    
  }
  dropItem(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.patchvalue, event.previousIndex, event.currentIndex);
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

  previewVideo(event: any) {
    this.video = event.target.files[0];
    console.log(this.video)
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

  //   onSubmit(id){
  //     let seriesRefs: any[] = [];
  //     for (let i = 0; i < this.selectedRows.length; i++) {
  //       seriesRefs.push(this.firestore.collection('episodes').doc(this.selectedRows[i]['id']).ref);
  //       console.log(this.firestore.collection('episodes').doc(this.selectedRows[i]['id']).ref);
  //     }
  //     console.log(seriesRefs);

  //     const imageStorageRef = this.storage.ref(`images/${Date.now()}_${this.image.name}`);
  //     imageStorageRef.put(this.image).then(() => {
  //     imageStorageRef.getDownloadURL().subscribe(imageUrl => {
  //     const seriesDocRef = this.firestore.collection('series').doc(id);

  //     // Fetch the current sequence array from the document
  //     seriesDocRef.get().toPromise().then(docSnapshot => {
  //     const currentSequence = docSnapshot.data()['sequence'] || [];

  //       // Merge the current sequence with the newly selected episodes
  //     const updatedSequence = [...currentSequence, ...seriesRefs];

  //     seriesDocRef.update({
  //       seriesName: this.seriesName,
  //       description: this.description,
  //       category: this.selectedCategory,
  //       tier: this.selectedTier,
  //       imageUrl: this.imageUrl,
  //       videoUrl: this.videoUrl,
  //       sequence: updatedSequence,
  //       date: firebase.firestore.FieldValue.serverTimestamp()
  //       }).then(() => {
  //         console.log(this.selectedCategory);
  //         this.router.navigateByUrl('/series-dashboard');
  //       }).catch((err: any) => {
  //         console.log(err);
  //       });
  //     });
  //   });
  // });

  //  seriesRefs.forEach(ref => {
  //   console.log(seriesRefs);
  //   ref.update({
  //     series: firebase.firestore.FieldValue.arrayUnion(this.firestore.collection('series').doc(this.id).ref)
  //   }).catch((err: any) => {
  //     console.log(err);
  //   });
  //   console.log(this.firestore.collection('series').doc(id).ref);
  // });

  // }

  openSnackBar(message: string, action: string) {
    this._snackBar.open(message, action);
  }

  async onSubmit() {
    let seriesRefs: any[] = [];
    console.log(this.rearrangedSequence.map(e => e.title));
    for (let i = 0; i < this.rearrangedSequence.length; i++) {
      seriesRefs.push(doc(this.firestore,'episodes',this.rearrangedSequence[i]['id']));
      // console.log(this.firestore.collection('episodes').doc(this.selectedRows[i]['id']).ref);
    }
    console.log(seriesRefs);
    //
    let categoryRefs = this.selectedCategory ? doc(this.firestore,'category',this.selectedCategory) : null;
    console.log(categoryRefs)
    //
    const seriesDocRef = doc(this.firestore,'series',this.docId);
    console.log(seriesDocRef.path);
    
    // Fetch the current sequence array from the document
    // seriesDocRef.get().toPromise().then(docSnapshot => {
      // const currentSequence = docSnapshot.data()['sequence'] || [];
      // Rearrange the sequence based on the order in the UI only if items were rearranged
      // const rearrangedSequence = this.patchvalue.map(row => this.firestore.collection('episodes').doc(row.id).ref);
      // Merge the current sequence with the newly selected episodes
      // const updatedSequence = [...currentSequence, ...seriesRefs];
      // Prepare the data object for updating the series document
      const seriesData: any = {
        seriesName: this.seriesName,
        description: this.description,
        category: categoryRefs || null,
        tier: this.selectedTier,
        // heroImageUrl : this.heroImage,
        date: new Date(),
        sequence:seriesRefs
      };

      // Check if items were rearranged
      // if (JSON.stringify(rearrangedSequence) !== JSON.stringify(currentSequence)) {
      //   seriesData.sequence = rearrangedSequence; // Include the rearranged sequence in the data object
      // } else {
      //   seriesData.sequence = currentSequence; // Use the current sequence if no rearrangement occurred
      // }
      

      // Check if the image field has been edited
      if (this.image) {
        const imageStorageRef = ref(this.storage, `images/${Date.now()}_${this.image.name}`);
        await uploadBytes(imageStorageRef, this.image).then(async () => {
          const imageUrl = await getDownloadURL(imageStorageRef);
          if (this.seriesReceivedDoc['imageUrl']) {
            const oldRef = ref(this.storage, this.seriesReceivedDoc['imageUrl']);
            await deleteObject(oldRef).then(() => {
              console.log("Old image deleted");
            }).catch(err => {
              console.error("Error deleting old image", err);
            });
          }
          seriesData['imageUrl'] = imageUrl;
          console.log("series image url", imageUrl);
          this.submitToFirestore(seriesDocRef, seriesData);
        });
      }

      else if (this.heroImage) {
        const heroStorageRef = ref(this.storage, `images/${Date.now()}_${this.heroImage.name}`);
        await uploadBytes(heroStorageRef, this.heroImage).then(async () => {
          const heroImageUrl = await getDownloadURL(heroStorageRef);
          if (this.seriesReceivedDoc['heroImageUrl']) {
            const oldRef = ref(this.storage, this.seriesReceivedDoc['heroImageUrl']);
            await deleteObject(oldRef).then(() => {
              console.log("Old hero image deleted");
            }).catch(err => {
              console.error("Error deleting old hero image", err);
            });
          }
          seriesData['heroImageUrl'] = heroImageUrl;
          console.log("Hero image URL", heroImageUrl);
          this.submitToFirestore(seriesDocRef, seriesData);
        });
      }

      else {
        this.submitToFirestore(seriesDocRef,seriesData)
        // Image field is not edited, update the series document without changing the imageUrl
        // seriesDocRef.update(seriesData).then(() => {
        //   // Update the series field in the selected episodes with the reference to the series document
        //   seriesRefs.forEach(ref => {
        //     ref.update({
        //       series: firebase.firestore.FieldValue.arrayUnion(seriesDocRef)
        //     }).catch((err: any) => {
        //       console.log(err);
        //     });
        //   });
        //   console.log(this.selectedCategory);
        //   this.router.navigateByUrl('/series-dashboard');
        // }).catch((err: any) => {
        //   console.log(err);
        // });
      }
      
      
    // });
  }

  submitToFirestore(ref,data){
    console.log("seriesData",data);
    updateDoc(ref,data).then(() => {
      this.openSnackBar("Document Updated","Close")
    }).catch(err => {
      console.log(err);
    })
    this.router.navigateByUrl('/seriesdashboard');
  }


  oncancel(){
    this.router.navigateByUrl("/seriesdashboard")
  }

  ApplyFilter(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource.filter = filterValue.trim().toLowerCase()
  }
  
}
