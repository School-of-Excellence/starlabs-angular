import { SelectionModel } from '@angular/cdk/collections';
import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, doc, Firestore, getDocs, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { EditImageComponent } from '../../edit-image/edit-image.component';
import { CdkDrag,CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatHint, MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-edit',
  imports: [
    MatFormFieldModule,
    MatHint,
    CommonModule,
    MatInputModule,
    ReactiveFormsModule,
    FormsModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatPaginatorModule,
    MatTableModule,
    MatCheckboxModule,
    CdkDropList, 
    CdkDrag,
  ],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css'
})
export class EditComponent {

  displayedColumns : string[] = ['Select','Audio', 'Name','tags']
  dataSource = new MatTableDataSource()
  
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;
  
  masterSelected!:boolean;
  checklist:any;
  checkedList:any;
  selection = new SelectionModel<any>(true, []);
  selectedRows : any []=[]
  patchvalue:any[] = []
  crossmatch: boolean | undefined
  crossmatcherrormessage!: string | boolean;
  errormessage : string | undefined
  tabledata : any []=[]
  checked : boolean = true
  playlistName : any
  description: any
  showupdatewindow : boolean = true
  getSequenceDoc
  playlistReceivedDoc= null
  audioUrl
  docId : string = null
  audioList = []
  mapAudio = {}
  private:boolean = false
  rearrangedSequence = []

  tags = []
  mapTaxonomy = {}
  taxonomyList = []
  taxonomySubscription:Subscription
  filteredTaxonomyList = []
  private subscription = new Subject<void>();

  constructor(
    private firestore:Firestore,
    private route : ActivatedRoute, 
    public router: Router, 
    public dialog: MatDialog
  ) { 
    const solarVoiceAudioRef = collection(this.firestore,'solar voice audios')
    const solarvoiceplaylistRef = collection(this.firestore,'solar voice playlist')

    getDocs(solarVoiceAudioRef).then(snapshot=>{
      this.audioList= snapshot.docs.map(e => {
        let element = e.data()
        this.mapAudio[element['id']] = element
        return element
      })
      getDocs(solarvoiceplaylistRef).then(async (res)=>{
        this.docId = this.route.snapshot.queryParams['id']
        for(let i = 0;i < res.docs.length; i++){        
          this.tabledata.push(res.docs[i].data())
          if(res.docs[i].id == this.docId){
            this.playlistReceivedDoc = res.docs[i].data()
            this.private = this.playlistReceivedDoc['private'] ?? false
            this.playlistName = res.docs[i].data()['name']
            this.description = res.docs[i].data()['description']
            let audioRefs = this.playlistReceivedDoc['sequence']
            let audioDocData = [];
            for(let j = 0; j < audioRefs.length; j++){
              audioDocData.push(this.mapAudio[audioRefs[j].id])
            }
            this.patchvalue = audioDocData
            this.tags = res.docs[i].data()['tags'] ?? []
            this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.tags.includes(e.id))
          }
        }
        this.ngAferViewInit()
      })
    })

    const atctaxonomyRef = collection(this.firestore, "atc taxonomy");  
    collectionSnapshots(atctaxonomyRef).pipe(takeUntil(this.subscription)).subscribe(snap => {
      let snapshot = snap.map(doc => ({id:doc.id,...doc.data()}))
      this.taxonomyList = snapshot
      for (let i = 0; i < snapshot.length; i++) {
        const element = snapshot[i];
        this.mapTaxonomy[element['id']] = element['name']
      }
      this.filteredTaxonomyList = this.taxonomyList
    })

  }

  ngOnInit(): void {}

  onimageedit(docId:string){
    this.dialog.open(EditImageComponent,{
      data:{
        edit : true,
        id : docId,
        imageurl:this.playlistReceivedDoc['imageurl'] ?? null
      }
    })
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }
  
  onHtmlload(){
    this.ngOnInit()
    this.ngAferViewInit()
  }

  ngAferViewInit(){
    this.dataSource.data = this.audioList
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    // let filterdata = this.audioList.filter(e => this.patchvalue.some(opt => opt.id === e.id))
    let filterdata = []
    for (let i = 0; i < this.patchvalue.length; i++) {
      filterdata.push(this.audioList.filter(e => e.id == this.patchvalue[i].id)[0])
    }
    // let filterdata2 = this.audioList.filter(e => this.patchvalue.some(opt => opt.id != e.id))
    // console.log(filterdata)
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

  updateSelectedRows(){
    this.selectedRows = this.selection.selected;
    this.rearrangedSequence = Object.assign([],this.selection.selected.map(e => Object.assign({},e)))
  }

  drop(event: CdkDragDrop<string[]>) {
    // moveItemInArray(this.selectedRows, event.previousIndex, event.currentIndex);
    moveItemInArray(this.rearrangedSequence, event.previousIndex, event.currentIndex);
  }
  
  async onSubmit(playlistName:string,docId:string,description:string){
    let playlistrefs =[]
    // console.log(this.rearrangedSequence.map(e => e.title));
    
    for( let i=0; i<this.rearrangedSequence.length; i++){
      const solarvoiceaudiosDoc = doc(this.firestore,'solar voice audios',this.rearrangedSequence[i]['id'])
      playlistrefs.push(solarvoiceaudiosDoc)
    }
    const solarvoiceplaylistDoc = doc(this.firestore,'solar voice playlist',docId)
    await setDoc(solarvoiceplaylistDoc,{
      id : docId,
      name : playlistName,
      description: description,
      sequence: playlistrefs,
      date: serverTimestamp(),
      private:this.private,
      tags:this.tags
    }).then(() => {
      console.log("doc updated");
      // this.router.navigateByUrl("/playlistdashboard")
    }).catch(err=>{ console.log(err);
    })
  }

  oncancel(){
    this.router.navigateByUrl("/playlistdashboard")
  }

  onselect(){
    let name = this.playlistName
    const duplicateNameCheck = this.tabledata.some(e=>e.name.trim().toLowerCase() === name.trim().toLowerCase())
    this.crossmatch = duplicateNameCheck
    this.crossmatcherrormessage =  duplicateNameCheck ? "Given Name Already Exit": false
  }

  ApplyFilter(event : Event){
    const filterValue = (event.target as HTMLInputElement).value
    this.dataSource.filter = filterValue.trim().toLowerCase()
  }

  onTagSearch(event){
    let value = ![null,undefined,""].includes(event.target.value) ? event.target.value.trim().toLowerCase() :""
    this.filteredTaxonomyList = this.taxonomyList.filter(e => e['name'].toLowerCase().indexOf(value) === 0)
  }

  onTagSelect(tagid){
    this.tags.push(tagid)
    this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.tags.includes(e.id))
  }

  onTagRemove(index){
    this.tags.splice(index,1)
    this.filteredTaxonomyList = this.taxonomyList.filter(e => !this.tags.includes(e.id))
  }

}
