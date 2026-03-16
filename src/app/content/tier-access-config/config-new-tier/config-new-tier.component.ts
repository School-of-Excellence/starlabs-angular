import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, doc, Firestore, getDocs, setDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-config-new-tier',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    FormsModule,
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule
  ],
  templateUrl: './config-new-tier.component.html',
  styleUrl: './config-new-tier.component.css'
})
export class ConfigNewTierComponent {
tierAccessForm = {
    docid:null,
    tierid:null,
    tieraccessby:null,
    biglevel:[],
    productaccess:{},
  }

  tierList = []
  levelList = []
  journeyList = []
  productList = []
  mapJourney = {}
  atcModelList = []

  constructor(
    private firestore:Firestore,
    private dialogRef: MatDialogRef<ConfigNewTierComponent>,
    @Inject(MAT_DIALOG_DATA) public data:any
    ){
    const tierRef = collection(this.firestore,"tier")
    getDocs(tierRef).then(snap => {
      this.tierList = snap.docs.map(e => e.data())
      if(this.data.type === 'add'){
        this.tierAccessForm.biglevel.push({
          atcmodel:null,
          biglevelid : []
        })
        const tieraccessconfigRef = collection(this.firestore,"tier access config")
        getDocs(tieraccessconfigRef).then(tierConfigSnap => {
          let accessdata = tierConfigSnap.docs.map(e => e.data()['tierid'])
          this.tierList = this.tierList.filter(e => !accessdata.includes(e.id))
        })
      }
    })
    const biglevelRef = collection(this.firestore,"biglevel")
    getDocs(biglevelRef).then(snap => {
      this.levelList = snap.docs.map(e => e.data())
    })
    const journeyRef = collection(this.firestore,"journey")
    getDocs(journeyRef).then(snap => {
      this.journeyList = snap.docs.map(e => e.data())
      for (let i = 0; i < this.journeyList.length; i++) {
        const element = this.journeyList[i];
        this.mapJourney[element['id']] = element['journey']
      }
    })
    const productsRef = collection(this.firestore,"products")
    getDocs(productsRef).then(snap => {
      this.productList = snap.docs.map(e => e.data())
      this.atcModelList = []
      for (let i = 0; i < this.productList.length; i++) {
        if(![null,undefined].includes(this.productList[i]['atcmodel'])){
          if(!this.atcModelList.includes(this.productList[i]['atcmodel'])){
            this.atcModelList.push(this.productList[i]['atcmodel'])
          }
        }
      }
    })
    if(this.data.type === 'add'){
      this.tierAccessForm.docid = doc(collection(this.firestore,'tier access config')).id
    }
  }

  ngOnInit():void{
    if(this.data.type === 'edit'){
      let dialogData = Object.assign({},this.data.doc)
      console.log(dialogData);
      this.tierAccessForm = {
        docid:dialogData['docid'],
        tierid:dialogData['tierid'],
        tieraccessby:dialogData['tieraccessby'],
        biglevel:dialogData['biglevel'] ?? [],
        productaccess:{},
      }
      for (const key in Object.assign({},dialogData['productaccess'])) {
        this.tierAccessForm.productaccess[key] = Object.assign([],dialogData['productaccess'][key])
      }
      if(dialogData['biglevel'] === undefined && dialogData['tieraccessby'] === "biglevel"){
        this.tierAccessForm.biglevel.push({
          atcmodel:null,
          biglevelid : dialogData['biglevelid']
        })
      }
    }
  }

  addactivejourney(journeyid:string){
    console.log("add journey",journeyid);
    this.tierAccessForm.productaccess[journeyid] = [{
      productid:null,
      count:1
    }]
    console.log(this.data.doc);
    
  }

  removeactivejourney(journeyid:string){
    console.log("remove journey",journeyid);
    delete this.tierAccessForm.productaccess[journeyid]
  }

  addproduct(journeyid:string){
    this.tierAccessForm.productaccess[journeyid].push(
      {
        productid:null,
        count:1
      }
    )
  }

  removeproduct(journeyid:string,index:number){
    this.tierAccessForm.productaccess[journeyid].splice(index,1)
  }

  onaddbiglevel(){
    this.tierAccessForm.biglevel.push({
      atcmodel:null,
      biglevelid : []
    })
  }
  onremovebiglevel(index){
    this.tierAccessForm.biglevel.splice(index,1)
  }

  onFormValidation():boolean{
    let valid = false
      if(this.tierAccessForm['tieraccessby'] === 'product'){
        for (const journey in this.tierAccessForm['productaccess']){
          for (let i = 0; i < this.tierAccessForm['productaccess'][journey].length; i++) {
            const element = this.tierAccessForm['productaccess'][journey][i];
            if(element['productid'] === null) valid = true
          }
        }
        if(this.tierAccessForm.tierid === null) valid = true
      }
      if(this.tierAccessForm['tieraccessby'] === 'biglevel'){
        if(this.tierAccessForm['biglevel'].length === 0) valid = true
        if(this.tierAccessForm.tierid === null) valid = true
      }
    return valid
  }

  onSubmit(){
    if(confirm("are you sure want to submit")){
      if(this.tierAccessForm.tieraccessby === "biglevel"){
        this.tierAccessForm.productaccess = {}
      }
      if(this.tierAccessForm.tieraccessby === 'product'){
        this.tierAccessForm.biglevel = []
      }
      console.log(this.tierAccessForm);
      const tieraccessconfigRef = doc(this.firestore,"tier access config",this.tierAccessForm.docid)
      setDoc(tieraccessconfigRef,this.tierAccessForm,{merge:true}).then(() => {
        this.dialogRef.close();
      })
      .catch((error) => {
        console.error(error);
      });
    }
  }

  closedialog(){
    this.dialogRef.close()
  }


}
