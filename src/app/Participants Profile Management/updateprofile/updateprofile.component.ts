import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { doc, Firestore, serverTimestamp, setDoc, writeBatch } from '@angular/fire/firestore';
import { FormGroup, Validators, FormBuilder, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';


@Component({
  selector: 'app-updateprofile',
  imports: [
    MatFormFieldModule,
    ReactiveFormsModule,
    CommonModule,
    MatButtonModule,
    MatCheckboxModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule
  ],
  templateUrl: './updateprofile.component.html',
  styleUrl: './updateprofile.component.css'
})
export class UpdateprofileComponent {

  loading:boolean = false
  newprofile:boolean
  existingProfile = []
  profileForm: FormGroup 

  noWhitespaceValidator(control: AbstractControl): ValidationErrors | null {
    if (control.value != null && control.value.trim().length === 0) {
      return { whitespace: true };
    }
    return null;
  }

  constructor(public auth: AngularFireAuth,public formbuilder: FormBuilder, public firestore : Firestore, public dialogRef : MatDialogRef<any>, @Inject(MAT_DIALOG_DATA) public dialogData : any, public http: HttpClient,private snackBar: MatSnackBar) {

    this.profileForm =  this.formbuilder.group({
      // name: [, {validators: [Validators.required], updateOn: 'change'}],
      firstname: [, {validators: [Validators.required, this.noWhitespaceValidator], updateOn: 'change'}],
      lastname: [, {validators: [Validators.required, this.noWhitespaceValidator], updateOn: 'change'}],
      dateofbirth: [, {updateOn: 'change'}],
      email: [, {validators: [Validators.required, Validators.email], updateOn: 'change'}],
      countrycode: ["+91", {validators: [Validators.required], updateOn: 'change'}],
      number: [, {validators: [Validators.required, Validators.pattern("^[0-9]*$")], updateOn: 'change'}],
      deliveryonhold: [false,{}],
      enable:[false,{}],
      enableahcrm:[false,{}],
      testuser:[false,{}],
    })


    console.log(dialogData)
    this.existingProfile = dialogData.existingprofile
    this.newprofile = dialogData.profile == null
    if(!this.newprofile){
      var data = dialogData.profile
      var splitName = data["name"].trim().split(" ")
      this.profileForm.patchValue({
        // name: data.name,        
        firstname: data.firstname ?? (splitName.length > 1 ? splitName.slice(0, splitName.length - 1).join(" ") : splitName[0]),
        lastname: data.lastname ?? splitName.length > 1 ? splitName[splitName.length -1] : null,
        dateofbirth: data.dateofbirth ? data.dateofbirth.toDate() : null,
        email: data.email,
        countrycode: data.countrycode,
        number: data.number,
        deliveryonhold: data.deliveryonhold ?? false,
        enable: data.enable ?? false,
        enableahcrm: data.enableahcrm ?? false,
        testuser: data.testuser ?? false
      })
    }
  }

  ngOnInit() {
  }

  async validation():Promise<string>{
    var result = null;
    var email = this.profileForm.controls["email"].value?.toLowerCase()
    var number = this.profileForm.controls["number"].value
    if(email != null && email != undefined){
      var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      var validateEmail = re.test(String(email.toLowerCase()))
      var validateEmailDuplicate = (this.existingProfile.filter(e => e["email"]?.toLowerCase() == email.toLowerCase()).length) > (this.newprofile ? 0 : 1)
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
    /*
    if(number != null && number != undefined){
      var validateNumberDuplicate = (this.existingProfile.filter(e => e.number == number).length) > (this.newprofile == null ? 0 : 1)
      console.log(validateNumberDuplicate)
      if(result == null && validateNumberDuplicate){
        result = "Number already exists!"
      }
    }
    */
    return result
  }

  async createProfile(){
    var profilevalue = this.profileForm.value
    profilevalue["email"] = profilevalue["email"].toLowerCase()
    console.log(profilevalue)
    try {
      if(this.profileForm.valid){
        this.loading = true
        var profile_id = this.newprofile ? doc(this.firestore, 'profile_data').id : this.dialogData.profile.profileid;
        var role_id = this.newprofile ? doc(this.firestore, 'users_roles').id : this.dialogData.profile.role_ref.id;
        var validation = await this.validation()
        if(validation == null){
          if(this.newprofile){
            profilevalue["created"] = serverTimestamp()
            profilevalue["enable"] = true
            profilevalue["enableahcrm"] = false
            profilevalue["block"] = false
            profilevalue["profileid"] = profile_id
            profilevalue["role_ref"] = doc(this.firestore, "users_roles", role_id)
            profilevalue["user_ref"] = null
          }
          profilevalue["name"] = profilevalue["firstname"].trim() + " " + profilevalue["lastname"].trim()
          profilevalue['lastmodifieddate'] = new Date()
          const profile_dataRef = doc(this.firestore, 'profile_data', profile_id)
          const users_rolesRef = doc(this.firestore, "users_roles", role_id)
          const metadataRef = doc(this.firestore, "participant metadata", profile_id)

          var batch = writeBatch(this.firestore)
          batch.set(profile_dataRef, profilevalue, {merge: true})
          batch.set(users_rolesRef, {
            name : profilevalue.name,
            profile_ref : profile_dataRef,
            participant: true
          }, {merge: true})
          batch.set(metadataRef, {
            name : profilevalue.name,
            firstname: profilevalue.firstname,
            lastname: profilevalue.lastname,
            email : profilevalue.email,
            profileid: profile_id
          }, {merge: true})
          batch.commit().then(() =>{
            var salesCRMURL = null
            var watsonURL = null
            if (environment.firebase.projectId === "starlabs-test") {
              console.log("New Test");
              salesCRMURL = "https://us-central1-salescrm-test-19.cloudfunctions.net/updateprofilebio";
              watsonURL = "https://us-central1-watson-test-19.cloudfunctions.net/updateprofilebio"
            } else if (environment.firebase.projectId === "fir-sample-aae4a" || environment.firebase.projectId === "launch-your-legacy-development") {
              salesCRMURL = 'https://us-central1-salesleadcrm.cloudfunctions.net/updateprofilebio';
              watsonURL = 'https://us-central1-watsonproduction-becde.cloudfunctions.net/updateprofilebio';
            }

            if(salesCRMURL != null && watsonURL != null){
              // var params = `?email=${profilevalue.email}&name=${profilevalue.name}&firstname=${profilevalue.firstname}&lastname=${profilevalue.lastname}&number=${profilevalue.number}&countrycode=${profilevalue.countrycode}`
              // this.http.get(salesCRMURL+params),
              // this.http.get(watsonURL+params)

              // let postData = {
              //   name:profilevalue.name,
              //   firstname:profilevalue.firstname,
              //   lastname:profilevalue.lastname,
              //   email:profilevalue.email,
              //   number:profilevalue.number,
              //   countrycode:profilevalue.countrycode
              // }

              let postData = {
                newData : {
                  profileid:this.dialogData.profile.profileid,
                  name:profilevalue.name,
                  firstname:profilevalue.firstname,
                  lastname:profilevalue.lastname,
                  email:profilevalue.email,
                  number:profilevalue.number,
                  countrycode:profilevalue.countrycode
                },
                oldData:{
                  profileid:this.dialogData.profile.profileid,
                  name:this.dialogData.profile.name,
                  firstname:this.dialogData.profile.firstname,
                  lastname:this.dialogData.profile.lastname,
                  email:this.dialogData.profile.email,
                  number:this.dialogData.profile.number,
                  countrycode:this.dialogData.profile.countrycode
                }
              }
              console.log(postData);
              
              var promises = Promise.all([
                this.http.post(salesCRMURL, postData).subscribe({
                  next: (response) => {
                    console.log('SalesCRM Response', response);
                    this.openSnackBar(`SalesCRM : ${response['message']}`, 'OK');
                  },
                  error: (err) => {
                    console.log(err);
                    this.openSnackBar(`Oops SalesCRM Update Status : ${err}`, 'OK');
                    console.log("SalesCRM Error: " + err);
                  }
                }),
                this.http.post(watsonURL, postData).subscribe({
                  next: (response) => {
                    console.log('WATSON Response', response);
                    this.openSnackBar(`Watson : ${response['message']}`, 'OK');
                  },
                  error: (err) => {
                    console.log(err);
                    console.log("WATSON Error: " + err);
                    this.openSnackBar(`Oops Watson Update Status : ${err}`, 'OK');
                  }
                })
              ]);
              promises.then((result) =>{
                console.log(result);
                // batch.commit();
              }).catch(err =>{
                console.log(err)
              });
            }
            this.close();
          }).catch(err =>{
            console.log(err);
            alert(err);
          });
          // await setDoc(profile_dataRef, profilevalue , {merge: true}).then(async () => {
          //   await setDoc(doc(this.firestore,"users_roles", role_id), {
          //     name : profilevalue.name,
          //     profile_ref : profile_dataRef,
          //     participant: true
          //   }, {merge: true})
          // })
        }
        else{
          alert(validation)
        }
        this.loading = false
      }
    } catch (err) {
      console.log(err)
      this.loading = false
    }
  }

  close(){
    this.dialogRef.close()
  }

  openSnackBar(message:string,action:string) {
    setTimeout(() => {
    return this.snackBar.open(message,action,{ duration: 2000})
    }, 1000);
  }


}
