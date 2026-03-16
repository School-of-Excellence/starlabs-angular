import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { arrayUnion, collection, collectionSnapshots, doc, Firestore, setDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule, MatLabel } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-group-dialog',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatLabel,
    MatInputModule,
    MatChipsModule,
    CommonModule,
    MatButtonModule

  ],
  templateUrl: './group-dialog.component.html',
  styleUrl: './group-dialog.component.css'
})
export class GroupDialogComponent  {

  tagForm: FormGroup;
  showTagInput: boolean = false;
  selectedTags: any =[]; 
  tableData:any=[]
  filteredTaxonomyList:any [] = []
  particpantsTags:any=[];
  tagsData: { [key: string]: any } = {};
  filteredTagsData: { [key: string]: any } = {};

  constructor(
    public dialogRef: MatDialogRef<GroupDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formBuilder: FormBuilder,
    private firestore:Firestore
  ) { 
     
    collectionSnapshots(collection(firestore,"big tags")).subscribe(tagsvaluedocs=>{
      for (let index = 0; index < tagsvaluedocs.length; index++) {
        const element = tagsvaluedocs[index].data();
        this.tagsData[element["id"]]=element
      }
      this.filteredTagsData = { ...this.tagsData };
    })
  
  }

  ngOnInit(): void {
    this.tagForm = this.formBuilder.group({
      newTag:["",[Validators.required]]
    });
  }

  addTagField() {
    this.showTagInput = true;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onTagSearch(event: any) {
    const searchQuery = event.target.value.toLowerCase();
  
    // Filter the tagsData based on the search query
    this.filteredTagsData = Object.keys(this.tagsData)
      .filter(key => this.tagsData[key].tagName.toLowerCase().includes(searchQuery))
      .reduce((obj, key) => {
        obj[key] = this.tagsData[key];
        return obj;
      }, {});
  }
  
  // Function to check if a tag is selected
  isTagSelected(tag: any): boolean {
    return this.selectedTags.includes(tag.tagName);  
  }
  
  // TrackBy function for optimal rendering
  trackById(index: number, item: any): string {
    return item.key;
  }
  



  addtags(){
    if(this.tagForm.valid){
      let id = doc(collection(this.firestore,"big tags")).id;
      setDoc(doc(this.firestore,"big tags",id),{
        id:id,
        tagName:this.tagForm.value.newTag,
        created :new Date(),
      }, {merge : true}) 
      this.showTagInput = false;
      this.tagForm.reset();
    }
  }



  toggleTagSelection(tag: any): void {
    const tagIndex = this.selectedTags.indexOf(tag.tagName);
    if (tagIndex > -1) {
      this.selectedTags.splice(tagIndex, 1);
    } else {
      this.selectedTags.push(tag.tagName);
    }
    this.selectedTags = [...this.selectedTags];
    
  }
  addcancaltags(){
    this.showTagInput = false;
  }

  addparticipantTags(){ 
    if(this.selectedTags.length != 0){
      for (let i = 0; i < this.data.selectedRows.length; i++) {
        const element = this.data.selectedRows[i];
        setDoc(doc(this.firestore,"big participants tags",element['profileid']),{
          id:element["profileid"],
          tags: arrayUnion(...this.selectedTags),
          created :new Date(),
        },{merge : true}) 
      }
      this.dialogRef.close();
    }
  }
}
