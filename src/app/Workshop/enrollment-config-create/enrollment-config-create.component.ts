import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, inject, Inject, ViewChild } from '@angular/core';
import { collection, doc, Firestore, getDoc, setDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent ,MatAutocomplete} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-enrollment-config-create',
  imports: [
    DragDropModule,
    MatFormFieldModule,
    FormsModule,
    MatInputModule,
    CommonModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule
  ],
  templateUrl: './enrollment-config-create.component.html',
  styleUrl: './enrollment-config-create.component.css'
})
export class EnrollmentConfigCreateComponent {
  list:any[] = []
  mapList = {}
  enrollment = {
    docid:null,
    label:null,
    layout:[{}]
  }
  selectedLayoutIndex:number = 0
  loading:boolean = false

  private firestore  = inject(Firestore)
  @ViewChild(MatAutocomplete) autoA:MatAutocomplete
  constructor(
    private _snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<EnrollmentConfigCreateComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) 
  { 
    getDoc(doc(this.firestore,"enrollment section config","51DWhTg7n44wxjT0wAo6")).then(snap => {
      console.log(snap.exists());
      
      this.list = snap.data()['list']
      console.log(this.list);
      for (let i = 0; i < this.list.length; i++) {
        const element = this.list[i];
        this.mapList[element.name] = element
      }
      this.loading = true
    })
  }

  ngOnInit(): void {
    console.log(this.data);
    
    if(this.data.type === 'add'){
      this.enrollment.docid = doc(collection(this.firestore,"eiflix enrolment")).id
    }
    if(this.data.type === 'edit'){
      this.enrollment.docid = this.data.doc.docid
      this.enrollment.label = this.data.doc.label
      this.enrollment.layout = this.data.doc.layout
    }
  }

  // non action
  onTextSearch(index:number,event:Event){
    let searchValue = (event.target as HTMLInputElement).value.trim()
    let textValue = ![null,undefined,""].includes(searchValue) ? searchValue.toLowerCase() : "";
    this.list[index]['filteredoptions'] = this.list[index]['options'].filter(e => e.toLowerCase().indexOf(textValue) === 0)
  }

  openSnackBar(message:string) {
    this._snackBar.open(message,null, {
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      duration:1000
    });
  }

  addlayout(){
    this.enrollment.layout.push({})
  }

  removelayout(){
    this.enrollment.layout.splice(this.selectedLayoutIndex,1)
    this.onSubmit()
  }

  onRemoveImageMap(mainindex:number,layoutkey:string,key:string){
    delete this.enrollment.layout[mainindex][layoutkey][key]
    this.onSubmit()
  }

  //action
  onTextEnter(index:number,event:Event){
    let searchValue = (event.target as HTMLInputElement).value.trim()
    this.list[index].value = this.list[index].value ?? []
    this.list[index].value.push(searchValue)
    this.addValueToEnrollementlayout(this.list[index].name,this.list[index].value);
    (event.target as HTMLInputElement).value = ""
  }

  onAddText(index:number,event:Event){
    let searchValue = (event.target as HTMLInputElement).value.trim()
    this.list[index].value = searchValue
    this.addValueToEnrollementlayout(this.list[index].name,this.list[index].value);
    (event.target as HTMLInputElement).value = ""
  }

  onRemoveArrayValue(mainindex:number,subindex:number){
    this.list[mainindex].value.splice(subindex,1)
    this.addValueToEnrollementlayout(this.list[mainindex].name,this.list[mainindex].value)
  }

  onSelectedArrayMultiple(mainindex:number,event:MatAutocompleteSelectedEvent){
    this.list[mainindex].value = this.list[mainindex].value ?? []
    this.list[mainindex].value.push(event.option.viewValue)
    this.addValueToEnrollementlayout(this.list[mainindex].name,this.list[mainindex].value)
  }

  onSelectedArray(mainindex:number,event:MatAutocompleteSelectedEvent){
    this.list[mainindex].value = event.option.viewValue 
    this.addValueToEnrollementlayout(this.list[mainindex].name,this.list[mainindex].value)
  }

  onAddImageMap(mainindex:number,event:Event){
    let eventvalue = (event.target as HTMLInputElement).value.trim()
    let filtervalue = !["",null,undefined].includes(eventvalue) ? eventvalue.trim() : ""
    let key = filtervalue.split("size")[1]
    if(key != undefined && key.includes("w") && key.includes("h")){
      this.list[mainindex].value = this.list[mainindex].value ?? {}
      this.list[mainindex].value[key] = eventvalue
      this.addValueToEnrollementlayout(this.list[mainindex].name,this.list[mainindex].value)
    }else{
      this.openSnackBar("Invalid url")
    }
    (event.target as HTMLInputElement).value = ""
  }

  addValueToEnrollementlayout(key:string,value:any){
    this.enrollment.layout[this.selectedLayoutIndex][key] = value
    this.onSubmit()
  }

  onCancel(){
    this.dialogRef.close()
  }

  drop(layoutindex:number,key:string,event: CdkDragDrop<any[]>) {
    moveItemInArray(this.enrollment.layout[layoutindex][key] , event.previousIndex, event.currentIndex);
    this.onSubmit()
  }

  onLayoutArrayValueRemove(mainindex:number,layoutkey:string,index:number){
    this.enrollment.layout[mainindex][layoutkey].splice(index,1)
    this.onSubmit()
  }

  onLayoutTextValueRemove(mainindex:number,layoutkey:string){
    delete this.enrollment.layout[mainindex][layoutkey]
    this.onSubmit()
  }

  getColorValue(index:number,event:any) {
    const selectedColor = event.target.value;
    this.list[index].value = selectedColor
    this.addValueToEnrollementlayout(this.list[index].name,this.list[index].value)
  }

  onLayoutChange(){
    for (let i = 0; i < this.list.length; i++) {
      const element = this.list[i];
      if(this.enrollment.layout[this.selectedLayoutIndex].hasOwnProperty(element['name'])){
        element.value = this.enrollment.layout[this.selectedLayoutIndex][element['name']]
      }else element.value = null
    }
  }

  onSubmit(){
    setDoc(doc(this.firestore,"eiflix enrolment",this.enrollment.docid),this.enrollment,{merge:true}).then(() => {
      // this.dialogRef.close()
    })
  }
}
