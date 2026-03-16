import { Component, OnInit,Inject } from '@angular/core';
import { Firestore,  DocumentReference , collectionData, where, query, collection, serverTimestamp, doc, arrayUnion, setDoc, docSnapshots} from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA,MatDialog,MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../authguard.service';
import { LoadingProgressComponent } from '../loading-progress/loading-progress.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-in-app-message-input',
  imports: [
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    FormsModule,
    MatSelectModule,
    CommonModule,
    MatButtonModule,
    NgxMatSelectSearchModule,

  ],
  templateUrl: './in-app-message-input.component.html',
  styleUrl: './in-app-message-input.component.css'
})
export class InAppMessageInputComponent {
  bufferDoc = {
    profileid:[],
    createdby:null,
    date:new Date(),
    status:'created',
    title : null,
    subtitle : null,
    description:null,
    notes:null,
    broadcastname: ""
  }

  // Array declarations
  templateArray = [];
  templateCategories = [];
  templateSubCategories = [];

  // Object declarations
  selectedTemplate = {};

  // String declarations
  view:string = 'create';
  templateType:string = "Standard";
  searchCategory: string = "";
  searchSubCategory: string = "";
  broadcastname = "";

  templateForm : FormGroup 
  private subscription = new Subject<void>()
  categoryCollectionSnapShot: any;
viewmode: any;



  constructor(
    private firestore : Firestore,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef :MatDialogRef<InAppMessageInputComponent>,
    private auth : AuthguardService,
    private formbuilder: FormBuilder,
    public dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router : Router,
  ){
    const categoryCollectionSnapShot = doc(this.firestore,"email validators","templateCategories")
    docSnapshots(categoryCollectionSnapShot).pipe(takeUntil(this.subscription)).subscribe((docdata)=>{
      let data = { id: docdata.id, ...docdata.data() };
      this.templateCategories = data['categories'] ?? []
      this.templateSubCategories = data['subcategories'] ?? []
    });
    this.templateForm  = this.formbuilder.group ({
      templateName: ['',{validators: [Validators.required]}],
      templateAlias: ['',{validators: [Validators.required], updateOn: "change" }],
      templateCategory: ['',{validators: [Validators.required], updateOn: "change" }],
      templateSubCategory: ['',{validators: [Validators.required], updateOn: "change" }],
    });
    if(this.data){
      this.bufferDoc.profileid = data.map(e => e.profileid)
      //logged in user
      this.auth.getRoles().then( e => this.bufferDoc.createdby = e['profile_ref'].id)
    }else{
      this.dialogRef.close()
    }
  }

  ngOnInit(): void {
    this.fetchTemplates();

    this.categoryCollectionSnapShot.valueChanges().subscribe((data)=>{
      this.templateCategories = data['categories'] ?? []
      this.templateSubCategories = data['subcategories'] ?? []
    });
  }

  async fetchTemplates() {
    collectionData(query(collection(this.firestore,"inapp templates"), where("templatevalidated","==",true))).pipe(takeUntil(this.subscription)).subscribe((templates)=>{
      if(templates.length != 0) {
        this.templateArray = [];
        for (let i = 0; i < templates.length; i++) {
          const templatedata = templates[i];          
          this.templateArray.push(templatedata);
        }
      } else {
        console.log("Templates Not Found");
      }
    })
  }

  isTemplatePresent(): boolean {
    return Object.keys(this.selectedTemplate).length != 0;
  }

  onTemplateChange(event: any): void {
    this.selectedTemplate = event.value;
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }

  async onSubmit(formValue){

    const dialogref = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Sending InApp Message"
      },
      disableClose: true
    });
      
    try {
      if(this.view == 'select') {
        if(this.selectedTemplate['description'].trim().length != 0){
          this.bufferDoc['title'] = this.selectedTemplate['title'];
          this.bufferDoc['subtitle'] = this.selectedTemplate['subtitle'];
          this.bufferDoc['description'] = this.selectedTemplate['description'];
          this.bufferDoc['notes'] = this.selectedTemplate['notes']
          this.dialogRef.close(this.bufferDoc);
          this.openSnackBar("InApp Message Sent Successfully", "OK");
          dialogref.close();
        }
      } else if(this.view == 'create') {
        if(this.bufferDoc['description'].trim().length != 0){
          let docID = doc(collection(this.firestore, 'inapp templates')).id;
          let data = {
            active: false,
            docid : docID,
            date : serverTimestamp(),
            createdby : this.auth.uid,
            templatealias : formValue['templateAlias'],
            templatelayout : "",
            templatename : formValue['templateName'],
            templatetype : this.templateType,
            category : formValue['templateCategory'],
            subcategory : formValue['templateSubCategory'],
            templatevalidated : false,
            templatestatus : "created" , 
            type : "inappmessage",
            title: [null, undefined, ""].includes(this.bufferDoc['title']) ? "" : this.bufferDoc['title'],
            subtitle: [null, undefined, ""].includes(this.bufferDoc['subtitle']) ? "" : this.bufferDoc['subtitle'],
            description: [null, undefined, ""].includes(this.bufferDoc['description']) ? "" : this.bufferDoc['description'],
            notes: [null, undefined, ""].includes(this.bufferDoc['notes']) ? "" : this.bufferDoc['notes']
          }
          this.dialogRef.close(data);
          // this.firestore.collection('inapp templates').doc(docID).set(data, {merge: true}).then(()=>{
          //   console.log("Done Creating In App Message");
          //   this.openSnackBar("Done Creating In App Message", "OK");
          // }).catch((error)=>{
          //   console.log("Error Creating In App Message", error);
          //   this.openSnackBar("Error Creating In App Message", "OK");
          // })
        }
      }
    } catch {
      dialogref.close();
      this.openSnackBar("Error Sending Inapp Message", "OK");
    }

  }

  sendValidation(){
    let check = false;
    let formValue = this.templateForm.value;
    if(this.view == 'select'){
      check = [null,undefined,''].includes(this.bufferDoc['title']) || [null,undefined,''].includes(this.bufferDoc['subtitle']) ? true : false;
    }else{
      check = [null,undefined,''].includes(formValue['templateAlias']) 
        || [null,undefined,''].includes(formValue['templateName']) 
        || [null,undefined,''].includes(formValue['templateCategory'])
        || [null,undefined,''].includes(formValue['templateSubCategory'])
        || [null,undefined,''].includes(this.bufferDoc['title'])
        || [null,undefined,''].includes(this.bufferDoc['subtitle']) ? true : false;
    }
    return check
  }

  createTemplate(){
    this.dialogRef.close();
    this.router.navigateByUrl('/communication')
  }

  addCategory(){
    const categoryCollectionRef = doc(this.firestore,"email validators","templateCategories")
    setDoc(categoryCollectionRef, {
      categories : arrayUnion(this.searchCategory)
    },{merge:true}).then(()=>{
      console.log("Category Added Successfully");
      this.templateForm.controls['templateCategory'].setValue(this.searchCategory);
      this.searchCategory = "";
    }).catch((error)=>{
      console.log("Oops Error While Adding Category",error);
    });
  }
  
  
  addSubCategory(){
    const categoryCollectionRef = doc(this.firestore,"email validators","templateCategories")
    setDoc(categoryCollectionRef,{
      subcategories : arrayUnion(this.searchSubCategory)
    },{merge:true}).then(()=>{
      console.log("Category Added Successfully");
      this.templateForm.controls['templateSubCategory'].setValue(this.searchSubCategory);
      this.searchSubCategory = "";
    }).catch((error)=>{
      console.log("Oops Error While Adding Category",error);
    });
  }
  
  onSearchCategory(){
    let returnData = this.templateCategories;
    if(![null,undefined,""].includes(this.searchCategory)){
      return returnData.filter((e)=>e.includes(this.searchCategory));
    }else{
      return this.templateCategories;
    }
  }
  
  onSearchSubCategory(){
    let returnData = this.templateSubCategories;
    if(![null,undefined,""].includes(this.searchSubCategory)){
      return returnData.filter((e)=>e.includes(this.searchSubCategory));
    }else{
      return this.templateSubCategories;
    }
  }

  formValidation():boolean {
    if (
      this.bufferDoc.title != null && this.bufferDoc.title.trim().length !== 0 &&
      this.bufferDoc.subtitle != null && this.bufferDoc.subtitle.trim().length !== 0 &&
      this.bufferDoc.description != null && this.bufferDoc.description.trim().length !== 0
    ) {
      return false;
    }
    
    return true;
  }

}
