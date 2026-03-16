import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { collection, doc, Firestore, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from '@angular/fire/firestore';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';


@Component({
  selector: 'app-add-purchase',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatInputModule,
  ],
  templateUrl: './add-purchase.component.html',
  styleUrl: './add-purchase.component.css'
})
export class AddPurchaseComponent {
  newCustomer:boolean
  puchaseTypeOption = ["Journey", "Product"]
  journeyOption = []
  productOption = []
  purchaseForm: FormGroup 
  existingProfile = []
  loading:boolean = false

  constructor(
    public firestore: Firestore,
    public dialogref: MatDialogRef<any>,
    @Inject(MAT_DIALOG_DATA) public dialogData : any,
    public formbuilder: FormBuilder
  ) {
    this.purchaseForm = this.formbuilder.group({
      // purchasetype: [, {validators: [Validators.required], updateOn: 'change'}],
      journeyref: [, {validators: [Validators.required], updateOn: 'change'}],
      // productref: [[], {validators: [], updateOn: 'change'}],
    })

    this.newCustomer = dialogData["newcustomer"]
    this.existingProfile = dialogData.existingprofile
    if(this.newCustomer){
      this.purchaseForm.addControl("name", new FormControl(null, [Validators.required]))
      this.purchaseForm.addControl("email", new FormControl(null, [Validators.required, Validators.email]))
      this.purchaseForm.addControl("countrycode", new FormControl("+91", [Validators.required]))
      this.purchaseForm.addControl("number", new FormControl(null, [Validators.required, Validators.pattern("^[0-9]*$")]))
    }
    else{
      this.purchaseForm.addControl("profileid", new FormControl(dialogData["profile"]["profileid"], [Validators.required]))
    }
    this.purchaseForm.updateValueAndValidity()
    const journeyRef = collection(this.firestore, 'journey')
    getDocs(query(journeyRef, orderBy('journey'))).then(journey=>{
      this.journeyOption = journey.docs.map(e => e.data())
    })
    const productRef = collection(this.firestore, 'products')
    getDocs(query(productRef, orderBy('product'))).then(product=>{
      this.productOption = product.docs.map(e => e.data())
    })
  }

  ngOnInit(): void {
    
  }

 

  async addPurchase(){
    if(this.purchaseForm.valid){
      if(this.newCustomer){
        await this.createNewProfile()
      }
      else{
        await this.storePurchase()
      }
    }
  }

  async validation():Promise<string>{
    var result = null;
    var email = this.purchaseForm.controls["email"].value
    var number = this.purchaseForm.controls["number"].value
    if(email != null && email != undefined){
      var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      var validateEmail = re.test(String(email.toLowerCase()))
      var validateEmailDuplicate = (this.existingProfile.filter(e => e.email == email.toLowerCase()).length) > (this.newCustomer ? 0 : 1)
      console.log(validateEmailDuplicate)
      if(!validateEmail){
        result = "Invalid Email Format!"
      }
      else if(validateEmailDuplicate){
        result = "Email ID already exists!"
      }
      else if(this.dialogData.profile != null && this.dialogData.profile.email != email.toLowerCase() && this.dialogData.profile.user_ref != null){
        result = this.dialogData.profile.email + " has already registered as Firebase user"
      }
    }
    if(number != null && number != undefined){
      var validateNumberDuplicate = (this.existingProfile.filter(e => e.number == number).length) > (this.newCustomer ? 0 : 1)
      console.log(validateNumberDuplicate)
      if(result == null && validateNumberDuplicate){
        result = "Number already exists!"
      }
    }
    return result
  }

  async createNewProfile(){
    var formValue = this.purchaseForm.value
    var profilevalue = {}
    this.loading = true
    var profile_id = doc(collection(this.firestore, 'profile_data')).id;
    var role_id =  doc(collection(this.firestore, 'users_roles')).id;
    var validation = await this.validation()
    if(validation == null){
      profilevalue["name"] = formValue["name"]
      profilevalue["email"] = formValue["email"]
      profilevalue["countrycode"] = formValue["countrycode"]
      profilevalue["number"] = formValue["number"]
      profilevalue["created"] = serverTimestamp()
      profilevalue["enable"] = true
      profilevalue["block"] = false
      profilevalue["profileid"] = profile_id
      profilevalue["role_ref"] =  doc(this.firestore, 'users_roles', role_id)
      profilevalue["user_ref"] = null
      profilevalue["lastmodifieddate"] = new Date()
      const profileRef = doc(this.firestore, 'profile_data', profile_id)
      const userRoleRef = doc(this.firestore, 'users_roles', role_id)
      await setDoc(profileRef, profilevalue, {merge: true}).then(async ()=>{
        await setDoc(userRoleRef, {
          name : profilevalue["name"],
          profile_ref : profileRef,
          participant: true
        },{merge: true})
      })
      console.log("New Profile:", profilevalue)
      this.purchaseForm.addControl("profileid", new FormControl(profile_id, [Validators.required]))
      await this.storePurchase()
    }
    else{
      alert(validation)
    }
    this.loading = false
  }

  async storePurchase(){
    var purchaseValue = this.purchaseForm.value
    this.loading = true
    var participantJourneyProduct = doc(collection(this.firestore, 'participantjourneyproduct')).id
    var journeyProductPurchase = doc(collection(this.firestore, 'journeyproductpurchase')).id
    var purchaseData = {
      "docid": journeyProductPurchase,
      "journeyref": null,
      "productref": [],
      "participantjourneyproductref": doc(this.firestore, 'participantjourneyproduct', participantJourneyProduct),
      "profileid": purchaseValue["profileid"],
      "purchasetype": "journey", // purchaseValue["purchasetype"].toLowerCase(),
      "watsonpurchaseid": null,
      "watsonpurchaselabel": null
    }
    var journeyproductData = {
      "docid": participantJourneyProduct,
      "journeyref": null,
      "journeystatus": null,
      "productref": [],
      "participantproducts": [],
      "profileid": purchaseValue["profileid"],
      "purchaseref": doc(this.firestore, 'journeyproductpurchase',journeyProductPurchase),
      "subscriptionstart": null,
      "subscriptionend": null,
    }
    // if(purchaseValue["purchasetype"].toLowerCase() == "journey"){
      var journeyreference = doc(this.firestore, "journey", purchaseValue["journeyref"]) 
      purchaseData["journeyref"] = journeyreference
      journeyproductData["journeyref"] = journeyreference

      purchaseValue["productref"] = []
      const journeytoproduct = collection(this.firestore, 'journey-to-product')
      await getDocs(query(journeytoproduct, where("journey", "==", journeyreference), limit(1))).then(journeyProduct=>{
        journeyProduct.docs.forEach(e => {
          purchaseValue["productref"] = (e.data()["product"] ?? []).map(e => e.id)
        })
      })
    // }
    var productreference = purchaseValue["productref"].map(e => doc(this.firestore, 'product', e))
    purchaseData["productref"] = productreference
    journeyproductData["productref"] = productreference
    productreference.forEach(e =>{
      journeyproductData["participantproducts"].push({
        productref: e,
        participantproductid: null
      })
    })
    console.log(purchaseData, journeyproductData)
    const participantjourneyproductRef = doc(this.firestore, 'participantjourneyproduct', participantJourneyProduct)
    const journeyproductpurchaseRef = doc(this.firestore, 'journeyproductpurchase', journeyProductPurchase)
    await setDoc(participantjourneyproductRef, journeyproductData).then(async ()=>{
      await setDoc(journeyproductpurchaseRef, purchaseData).catch(err => {
        console.log(err)
      }).catch(err =>{
        console.log(err)
      })
    })
    this.loading = false
    this.close(true)
  }

  close(value){
    this.dialogref.close(value)
  }
}
