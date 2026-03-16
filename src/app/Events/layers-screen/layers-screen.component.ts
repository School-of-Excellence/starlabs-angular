import { Component, OnInit, ViewChild ,inject} from '@angular/core';
import { FormGroup, Validators, FormBuilder, FormArray, FormsModule } from '@angular/forms';
import { doc, Firestore ,getDocs,updateDoc,writeBatch  } from '@angular/fire/firestore';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { AuthguardService } from '../../authguard.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTable, MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AddLayersComponent } from './add-layers/add-layers.component';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { collection, query, where, onSnapshot} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { CdkDropList, CdkDragDrop, DragDropModule,moveItemInArray  } from '@angular/cdk/drag-drop';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatSortModule } from '@angular/material/sort';
import { Storage } from '@angular/fire/storage';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-layers-screen',
  standalone:true,
  imports:[
    CommonModule,
    FormsModule,
    MatInputModule,
    MatTableModule,
    DragDropModule,
    MatSortModule,
    MatOptionModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatSlideToggleModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './layers-screen.component.html',
  styleUrls: ['./layers-screen.component.css']
})
export class LayersScreenComponent implements OnInit {
  layerForm: FormGroup;
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('table', {static: true}) table: MatTable<any>;
  dragDisabled = true;
  displayedColumns: string[] = ['position', 'title','description', 'action', 'delete'];
  dataSource = new MatTableDataSource();
  levelSubscription: (() => void) | null = null;
  events: any = []
  selectedevent: any;
  images = []
  previewImages: any = [];
  loading:boolean = false
  imageUrls: any[];
  uploaded: boolean = false;
  url: any;
  mapEvents: any = {};
  showtable: boolean = false;
  filter: any;

  constructor(private formbuilder: FormBuilder, 
    private firestore: Firestore,
    private storage: Storage, 
    public dialog: MatDialog, 
    public guard: AuthguardService) {
    this.layerForm = this.formbuilder.group ({
      title: ['', {validators: [Validators.required], updateOn:"change"}],
      description:[,{validators: [Validators.required], updateOn:"change"}],
      event:[,{validators: [Validators.required], updateOn:"change"}],
      sequence: [, {validators: [Validators.required], updateOn:"change"}],
      additionalDescriptions: this.formbuilder.array([]) 
     })
     const eventCollectionRef = collection(this.firestore, 'event collection');
     getDocs(eventCollectionRef).then(snapshot => {     
       for (let j = 0; j < snapshot.docs.length; j++) {
        const element = snapshot.docs[j];
        const elementData = element.data();
        this.mapEvents[element.id] = elementData
        elementData['docid'] = element.id
        this.events.push(elementData)
        console.log(this.events)
      }
    })
  }

  ngOnInit(): void {
  }

  onEventSelected(){
    this.showtable = true
    console.log(this.selectedevent);
    this.guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        const eventRef = doc(this.firestore, 'event collection', this.selectedevent);
        const q = query(collection(this.firestore, 'arenalayers'), where('eventref', '==', eventRef)  );
        if (this.levelSubscription) this.levelSubscription();
        this.levelSubscription = onSnapshot(q, (snapshot) => {
          const list = snapshot.docs.map(doc => doc.data());          
          this.dataSource.data = list.sort((a, b) => (a["sequence"] ?? 0) - (b["sequence"] ?? 0))
          this.dataSource.sort = this.sort
          this.dataSource.paginator = this.paginator
          console.log(list)
        })
      // }
    })
  }

  filterTable(value){ 
    this.dataSource.filter = value
  }

  returnFilterEvent(){
    return this.events.filter(
      e => e.name && e.name.toLowerCase().includes(this.filter?.toLowerCase() || "")
    )
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const reader = new FileReader();
        reader.onload = () => {
          const imageDataURL = reader.result as string;
          this.previewImages.push(imageDataURL);
        };
        reader.readAsDataURL(files[i]);
        this.images.push(files[i]);
      }
    }
    console.log(this.previewImages);
    console.log(this.images);
  }
  
  ngOnDestroy() {
  if (this.levelSubscription) {
    this.levelSubscription(); 
  }
  }

  onDrop(event: CdkDragDrop<any[]>): void {
    console.log(event)
    this.dragDisabled = true;
    moveItemInArray(this.dataSource.data, event.previousIndex, event.currentIndex);
    this.dataSource.data = this.dataSource.data;
    const batch = writeBatch(this.firestore); 
    this.dataSource.data.forEach((item, index)=>{
     const docRef = doc(this.firestore, 'arenalayers', item["docid"]); 
     batch.update(docRef, {
     sequence: index + 1
    });
  });
    batch.commit()
    console.log(event.currentIndex);
  }

  updateLayer(value){
    this.dialog.open(AddLayersComponent, {
      data: {
        layerdata: value ?? {
          title: null,
          event:  null,
          description : null,
          docid : null,
          sequence: this.dataSource.data.length + 1
        },
      },
      maxHeight: "90vh",
      maxWidth: "90vw",
      disableClose: true,
      autoFocus: false,
    })
  }
  
  onToggle(event: MatSlideToggleChange, row: any) {
    const docRef = doc(this.firestore, 'arenalayers', row['docid']);
     updateDoc(docRef, {
     delete: event.checked
    }).then(() => {
        console.log("Document updated successfully");
    }).catch(error => {
        console.error("Error updating document: ", error);
    });
}
}


