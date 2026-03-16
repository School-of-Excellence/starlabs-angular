import { Component, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDocs, setDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MapPlaylistProductModeComponent } from './map-playlist-product-mode/map-playlist-product-mode.component';
import { Subscription } from 'rxjs';
import { MatFormFieldControl, MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-view-product-mode-playlist',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    CommonModule,
    MatIconModule,
    MatPaginatorModule,
    MatButtonModule,
    MatSelectModule,
    MatSortModule
  ],
  templateUrl: './view-product-mode-playlist.component.html',
  styleUrl: './view-product-mode-playlist.component.css'
})
export class ViewProductModePlaylistComponent {
displayedColumns: string[] = ['productref', 'mode', 'eiflix', 'solarvoice','generalcontent','messages','edit'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  tableData = []
  mapProduct = {}
  mapEiflix = {}
  mapSolarVoice = {}
  mapGeneralContent = {}
  productmodeplaylistSubscription : Subscription
  constructor(
    private firestore : Firestore,
    public dialog : MatDialog
  ) { 
    const productmodeplaylistRef = collection(this.firestore,'product mode playlist')
    this.productmodeplaylistSubscription = collectionData(productmodeplaylistRef,{idField:'id'}).subscribe(doc =>{
      this.tableData = doc
      this.ngAfterViewInit()
    })
    this.fetchPlaylist()
  }
  ngOnDestroy(){
    if (this.productmodeplaylistSubscription) {
      this.productmodeplaylistSubscription.unsubscribe()
    }  
  }
  ngOnInit(): void {
  }

  async fetchPlaylist(){
    const productsRef = collection(this.firestore,'products')
    const seriesRef = collection(this.firestore,'series')
    const solarvoiceplaylistRef = collection(this.firestore,'solar voice playlist')
    const contenturlsRef = collection(this.firestore,'content_urls')

    try {
      const getProductsRef = await getDocs(productsRef)
      for (let i = 0; i < getProductsRef.docs.length; i++) {
        const element = getProductsRef.docs[i].data();
        this.mapProduct[element['id']] = element['product']
      }
    } catch (error) {
      console.error(error)
    }

    try {
      const getseriesRef = await getDocs(seriesRef)
      for (let i = 0; i < getseriesRef.docs.length; i++) {
        const element = getseriesRef.docs[i].data();
        this.mapEiflix[element['id']] = element['seriesName']
      }
    } catch (error) {
      console.error(error)
    }

    try {
      const getsolarvoiceplaylistRef = await getDocs(solarvoiceplaylistRef)
      for (let i = 0; i < getsolarvoiceplaylistRef.docs.length; i++) {
        const element = getsolarvoiceplaylistRef.docs[i].data();
        this.mapSolarVoice[element['id']] = element['name']
      }
    } catch (error) {
      console.error(error)
    }

    try {
      const getcontenturlsRef = await getDocs(contenturlsRef)
      for (let i = 0; i < getcontenturlsRef.docs.length; i++) {
        const element = getcontenturlsRef.docs[i].data();
        this.mapGeneralContent[element['docid']] = element['title']
      }
    } catch (error) {
      console.error(error)
    }
  }
  ngAfterViewInit(){
    this.dataSource.data = this.tableData
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onEdit(docData:any){
    let dialogRef = this.dialog.open(MapPlaylistProductModeComponent,{
      data:{
        docdata:docData,
        validationdoc:this.tableData
      },
      width:'70%',
      height:"90%",
      // width:"100vw",
      // height:"100vh",
      disableClose:true
    })
    dialogRef.afterClosed().subscribe(async result => {
      const productmodeplaylistRef = collection(this.firestore,'product mode playlist')
      const productmodeplaylistDoc = doc(productmodeplaylistRef)
      console.log(result);
      if(![null,undefined].includes(result)){
        result['docid'] = result['docid'] ?? productmodeplaylistDoc.id
        console.log(result);     
        const docRef = doc(productmodeplaylistRef, result['docid']);
        try {
          await setDoc(docRef, result, { merge: true });
        } catch (error) {
         console.error(error) 
        }
      }
    })
  }

}
