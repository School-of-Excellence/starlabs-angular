import { SelectionModel } from '@angular/cdk/collections';
import {CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, ViewChild } from '@angular/core';
import { collection, collectionSnapshots, doc, Firestore, getDocs, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { ActivatedRoute } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { EditImageComponent } from '../../edit-image/edit-image.component';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-solar-playlist',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatIconModule,
    MatPaginatorModule,
    MatChipsModule,
    MatTableModule,
    FormsModule,
    CommonModule,
    MatCheckboxModule,
    CdkDropList, 
    CdkDrag,
    MatButtonModule
  ],
  templateUrl: './solar-playlist.component.html',
  styleUrl: './solar-playlist.component.css'
})
export class SolarPlaylistComponent {
displayedColumns : string[] = ['Select','Audio', 'Name','tags']
  dataSource = new MatTableDataSource()
  audioList:any [] = []
  
  @ViewChild(MatPaginator) paginator : MatPaginator | undefined;
  @ViewChild(MatSort) sort : MatSort | undefined;
  
  masterSelected!:boolean;
  checklist:any;
  checkedList:any;
  selection = new SelectionModel<any>(true, []);
  selectedRows : any []=[]

  crossmatch: boolean | undefined
  crossmatcherrormessage!: string | boolean;
  errormessage : string | undefined
  tabledata : any []=[]
  checked : boolean = true
  playlistName : any
  description : any
  
  getSequenceDoc
  playlistReceivedDoc= null

  private:boolean = false
  
  tags = []
  mapTaxonomy = {}
  taxonomyList = []
  taxonomySubscription:Subscription
  filteredTaxonomyList:any [] = []
  private subscription = new Subject<void>();
  
  constructor(private firestore:Firestore,private route : ActivatedRoute,public dialog: MatDialog) { 
    const solarvoiceaudiosref = collection(this.firestore,'solar voice audios')
    collectionSnapshots(solarvoiceaudiosref).pipe(takeUntil(this.subscription)).subscribe(snapshot=>{
      this.audioList = snapshot.map(doc=>({id:doc.id,...doc.data()}))
      this.ngAfterViewInit()
    })
    const solarvoiceplaylistref = collection(this.firestore,'solar voice playlist')
    getDocs(solarvoiceplaylistref).then((res)=>{
      for(let i=0;i<res.docs.length; i++){
        this.tabledata.push(res.docs[i].data())
        console.log(this.tabledata)
      }
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

  ngAfterViewInit(){
    this.dataSource.data = this.audioList
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }
  
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  openDialog(){
    this.dialog.open(EditImageComponent,{ data : { add : true } })
  }
  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }
  masterToggle() {
    this.isAllSelected() ?
    this.selection.clear() :
    this.dataSource.data.forEach(row => this.selection.select(row));
  }

  updateSelectedRows(event) {
    this.selectedRows = this.selection.selected;
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.selectedRows, event.previousIndex, event.currentIndex);
  }
  
  async onSubmit(playlistName: any, description:any){
    let playlistrefs =[]
    for( let i=0; i<this.selectedRows.length; i++){
      const solarvoiceaudiosref = doc(this.firestore,'solar voice audios',this.selectedRows[i]['id'])
      playlistrefs.push(solarvoiceaudiosref)
    }
    const solarvoiceplaylistref = collection(this.firestore,'solar voice playlist')
    const docRef = doc(solarvoiceplaylistref)
    let id = docRef.id;
    await setDoc(docRef,{
      id : id,
      name : playlistName,
      description : description,
      sequence: playlistrefs,
      date: new Date(),
      private:this.private,
      tags:this.tags
    }).then(() => {
      this.playlistName = ''
      this.description = ''
      this.selectedRows = []
      this.selection.clear();
    }).catch(err=>{
      console.log(err);
    })
  }

  onselect(){
    let name = this.playlistName
    const duplicateNameCheck = this.tabledata.some(e => e.name.trim().toLowerCase() === name.trim().toLowerCase())
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
