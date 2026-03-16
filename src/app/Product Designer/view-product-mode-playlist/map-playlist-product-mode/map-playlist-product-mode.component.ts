import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, Firestore, getDocs } from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
@Component({
  selector: 'app-map-playlist-product-mode',
  imports: [
    MatSelectModule,
    FormsModule,
    DragDropModule,
    MatPaginatorModule,
    ReactiveFormsModule,
    MatSortModule,
    CommonModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule
  ],
  templateUrl: './map-playlist-product-mode.component.html',
  styleUrl: './map-playlist-product-mode.component.css'
})
export class MapPlaylistProductModeComponent {
productList = []
  modesList = []
  eiflixSeriesList = []
  solarVoicePlaylist = []
  generalContentPlaylist = []
  modePlaylistDoc={
    docid : null,
    productref:null,
    mode:null,
    solarvoice:[],
    eiflix:[],
    generalcontent:[],
    messages:[]
  }
  filterSeriesName:string = ""
  filterPlaylistName:string = ""
  filterContentName:string = ""
  filterProductName:String = ""
  constructor(
    private firestore :Firestore,
    @Inject(MAT_DIALOG_DATA) public data : any,
    public dialogRef :  MatDialogRef<MapPlaylistProductModeComponent>
  ){
    console.log(this.data.docdata);
    
    if(this.data.docdata != null){
      for (const key in this.data.docdata) {
        this.modePlaylistDoc[key] = !['eiflix','solarvoice','generalcontent','messages'].includes(key) ? (this.data.docdata[key] ?? null) : (this.data.docdata[key] ?? [])
      }
    }
    this.fetchPlaylist()
  }
  async fetchPlaylist(){
    const productsRef = collection(this.firestore,'products')
    const modesRef = collection(this.firestore,'modes')
    const seriesRef = collection(this.firestore,'series')
    const solarvoiceplaylistRef = collection(this.firestore,'solar voice playlist')
    const contenturlsRef = collection(this.firestore,'content_urls')


    try {
      const getProductsRef = await getDocs(productsRef)
      this.productList = getProductsRef.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
    } catch (error) {
      console.error(error)
    }

    try {
      const getmodesRef = await getDocs(modesRef)
      this.modesList = getmodesRef.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
    } catch (error) {
      console.error(error)
    }

    try {
      const getseriesRef = await getDocs(seriesRef)
      this.eiflixSeriesList = getseriesRef.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
    } catch (error) {
      console.error(error)
    }

    try {
      const getsolarvoiceplaylistRef = await getDocs(solarvoiceplaylistRef)
      this.solarVoicePlaylist = getsolarvoiceplaylistRef.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
    } catch (error) {
      console.error(error)
    }

    try {
      const getcontenturlsRef = await getDocs(contenturlsRef)
      this.generalContentPlaylist = getcontenturlsRef.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
    } catch (error) {
      console.error(error)
    }
  }
  ngOnInit(): void {}

  filterProduct(){
    return this.productList.filter(e => e['product'].toLowerCase().includes(this.filterProductName.trim().toLowerCase()))
  }

  filterSeries(){
    return this.eiflixSeriesList.filter(e => e['seriesName'].toLowerCase().includes(this.filterSeriesName.trim().toLowerCase()))
  }

  filterPlaylist(){
    return this.solarVoicePlaylist.filter(e => e['name'].toLowerCase().includes(this.filterPlaylistName.trim().toLowerCase()))
  }

  filterContent(){
    return this.generalContentPlaylist.filter(e => e['title'].toLowerCase().includes(this.filterContentName.trim().toLowerCase()))
  }

  onMessageInput(event:Event){
    const value = (event.target as HTMLInputElement).value;
    this.modePlaylistDoc.messages.unshift(value);
    (event.target as HTMLInputElement).value = null
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.modePlaylistDoc.messages, event.previousIndex, event.currentIndex);
  }
  onMessageDelete(index:number){
    this.modePlaylistDoc.messages.splice(index,1)
  }

  formValidation():boolean {
    let validated = true
    if(this.modePlaylistDoc.eiflix.length != 0 || this.modePlaylistDoc.solarvoice.length != 0 || this.modePlaylistDoc.generalcontent.length != 0){
      if(this.modePlaylistDoc.productref != null && this.modePlaylistDoc.mode != null){
        if(this.data.validationdoc.length != 0){
          if(this.data.validationdoc.filter(e => e.productref.id === this.modePlaylistDoc.productref.id && e.mode === this.modePlaylistDoc.mode).length != 0){
            if(this.modePlaylistDoc.docid === null) alert("document already exist")
            else{validated = false}
          }else{
            validated = false
          }
        }else{
          validated = false
        }
      }
    }else{
      alert("please select one playlist")
    }
    return validated
  }

  onDialogCancel(){
      this.dialogRef.close()
  }

  onSubmit(){
    if(!this.formValidation()){
      this.dialogRef.close(this.modePlaylistDoc)
    }
  }

  compareFn(e1:any, e2:any): boolean {  
    return e1 && e2 ? e1.id === e2.id : e1 === e2;
  }

}
