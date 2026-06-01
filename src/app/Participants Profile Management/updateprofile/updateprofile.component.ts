import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit ,HostListener } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { doc, Firestore, serverTimestamp, setDoc, writeBatch } from '@angular/fire/firestore';
import { FormGroup, Validators, FormBuilder, FormsModule, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
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
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { CountryPhoneService, CountryPhone } from '../../Service/country-phone service/country-phone.service';

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
    MatSnackBarModule,
    FormsModule,
    MatSelectModule,
    MatIconModule,
  ],
  templateUrl: './updateprofile.component.html',
  styleUrl: './updateprofile.component.css'
})
export class UpdateprofileComponent {

  loading:boolean = false
  newprofile:boolean
  existingProfile = []
  profileForm: FormGroup
  emailLocked: boolean = false;
  originalProfile: any;
  countries: CountryPhone[];
  selectedCountry: CountryPhone;
  phoneMaxLength: number = 10;
  countrySearchText: string = '';
  countryDropdownOpen: boolean = false;

  get filteredCountries(): CountryPhone[] {
    const q = this.countrySearchText.toLowerCase();
    if (!q) return this.countries;
    return this.countries.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.includes(q) || c.iso.toLowerCase().includes(q)
    );
  }

  get phoneHint(): string {
    if (!this.selectedCountry) return '';
    return `${this.selectedCountry.digits} digits required (${this.selectedCountry.name})`;
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let val = input.value.replace(/\D/g, '').slice(0, this.phoneMaxLength);
    this.profileForm.get('number')!.setValue(val, { emitEvent: false });
    input.value = val;
  }

  private _syncCountry(code: string): void {
    const found = this.countryPhoneService.getByCode(code);
    this.selectedCountry = found ?? { name: 'Unknown', code, iso: '', digits: 10, flag: '' };
    this.phoneMaxLength = this.selectedCountry.digits;
  }

  toggleCountryDropdown(): void {
    this.countryDropdownOpen = !this.countryDropdownOpen;
    if (this.countryDropdownOpen) this.countrySearchText = '';
  }

  selectCountry(country: CountryPhone): void {
    this.profileForm.get('countrycode')!.setValue(country.code);
    this.countryDropdownOpen = false;
    this.countrySearchText = '';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.country-dropdown-wrapper')) {
      this.countryDropdownOpen = false;
    }
  }

  noWhitespaceValidator(control: AbstractControl): ValidationErrors | null {
    if (control.value != null && control.value.trim().length === 0) {
      return { whitespace: true };
    }
    return null;
  }

  constructor(public auth: AngularFireAuth, public formbuilder: FormBuilder, public countryPhoneService: CountryPhoneService, public firestore : Firestore, public dialogRef : MatDialogRef<any>, @Inject(MAT_DIALOG_DATA) public dialogData : any, public http: HttpClient, private snackBar: MatSnackBar) {

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
    this.originalProfile = dialogData.profile;
    this.countries = countryPhoneService.countries;
    this._syncCountry('+91');

    let isFirstLoad = true;
    this.profileForm.get('countrycode')!.valueChanges.subscribe(code => {
      this._syncCountry(code);
      if (!isFirstLoad) {
        this.profileForm.get('number')!.setValue(null);
      }
      isFirstLoad = false;
      this.profileForm.get('number')!.setValidators([
        Validators.required,
        Validators.pattern(this.countryPhoneService.getPatternForCode(code))
      ]);
      this.profileForm.get('number')!.updateValueAndValidity();
    });
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
      const code = data.countrycode ?? '+91';
      this._syncCountry(code);
      this.profileForm.get('number')!.setValidators([
        Validators.required,
        Validators.pattern(this.countryPhoneService.getPatternForCode(code))
      ]);
      this.profileForm.get('number')!.updateValueAndValidity();
    }
    if (this.dialogData.profile?.user_ref) {
      this.emailLocked = true;
      this.profileForm.get('email')?.disable();
    }
  }

  ngOnInit() {
  }

  async changeEmail() {
    const input = prompt('Enter new email');
    if (!input) return;
    const newEmail = input.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      alert('Please enter a valid email address');
      return;
    }
    console.log('Entered Email:', newEmail);
    const profileId = this.dialogData.profile.profileid;
    const profileRef = doc(this.firestore, 'profile_data', profileId);
    const oldProfile = { ...this.dialogData.profile };
    const data: any = this.dialogData.profile;
    const currentEmail = (data.email || '').toLowerCase();
    console.log('Old Email:', currentEmail);
    if (newEmail === currentEmail) {
      alert('Same email already exists');
      return;
    }

    const existingMap = data.user_ref_existing || {};
    const currentUid = data.user_ref?.id || null;
    if (existingMap.hasOwnProperty(newEmail)) {
      const uid = existingMap[newEmail];
      const updatedMap = { ...existingMap };
      updatedMap[currentEmail] = currentUid;
      await setDoc(profileRef, {
        email: newEmail,
        user_ref: doc(this.firestore, 'user_data', uid),
        user_ref_existing: updatedMap
      }, { merge: true });
      var salesCRMURL = null
      var watsonURL = null

      if (environment.firebase.projectId === "starlabs-test") {
        salesCRMURL = "https://us-central1-salescrm-test-19.cloudfunctions.net/updateprofilebio";
        watsonURL = "https://us-central1-watson-test-19.cloudfunctions.net/updateprofilebio"
      } else {
        salesCRMURL = 'https://us-central1-salesleadcrm.cloudfunctions.net/updateprofilebio';
        watsonURL = 'https://us-central1-watsonproduction-becde.cloudfunctions.net/updateprofilebio';
      }

      let postData = {
        newData : {
          profileid: profileId,
          name: this.profileForm.get('firstname')?.value + " " + this.profileForm.get('lastname')?.value,
          firstname: this.profileForm.get('firstname')?.value,
          lastname: this.profileForm.get('lastname')?.value,
          email: newEmail,
          number: this.profileForm.get('number')?.value,
          countrycode: this.profileForm.get('countrycode')?.value
        },
        oldData:{
          profileid: oldProfile.profileid,
          name: oldProfile.name,
          firstname: oldProfile.firstname,
          lastname: oldProfile.lastname,
          email: oldProfile.email,
          number: oldProfile.number,
          countrycode: oldProfile.countrycode
        }
      }
      console.log('CRM Payload (REVERT):', postData);
      this.http.post(salesCRMURL, postData).subscribe({
        next: (res) => console.log('SalesCRM success', res),
        error: (err) => console.log('SalesCRM error', err)
      });

      this.http.post(watsonURL, postData).subscribe({
        next: (res) => console.log('Watson success', res),
        error: (err) => console.log('Watson error', err)
      });

      this.dialogData.profile.email = newEmail;
      this.dialogData.profile.user_ref = doc(this.firestore, 'user_data', uid);
      this.profileForm.patchValue({ email: newEmail });
      // this.originalProfile = { ...this.dialogData.profile };

      this.profileForm.controls['email'].disable();
      this.emailLocked = true;
      alert('Email reverted');
      return;
    }

   const alreadyExists = this.existingProfile.some(p => p.email?.toLowerCase() === newEmail && p.profileid !== profileId);
   const existsInHistory = this.existingProfile.some(p => p.profileid !== profileId && Object.keys(p.user_ref_existing || {}).includes(newEmail));

    if (alreadyExists || existsInHistory) {
      const owner = this.existingProfile.find(p => p.profileid !== profileId && (p.email?.toLowerCase() === newEmail || Object.keys(p.user_ref_existing || {}).includes(newEmail)));
      if(owner?.email?.toLowerCase() === newEmail){
        alert(`${newEmail} is currently used by ${owner?.name}`);
      } else {
        alert(`${newEmail} is linked with ${owner?.name}`);
      }
      return;
    }
    const updatedMap = { ...existingMap };
    if (currentUid) {
      updatedMap[currentEmail] = currentUid;
    }
    await setDoc(profileRef, {
      email: newEmail,
      user_ref: null,
      user_ref_existing: updatedMap
    }, { merge: true });
    var salesCRMURL = null
    var watsonURL = null
    if (environment.firebase.projectId === "starlabs-test") {
      salesCRMURL = "https://us-central1-salescrm-test-19.cloudfunctions.net/updateprofilebio";
      watsonURL = "https://us-central1-watson-test-19.cloudfunctions.net/updateprofilebio"
    } else {
      salesCRMURL = 'https://us-central1-salesleadcrm.cloudfunctions.net/updateprofilebio';
      watsonURL = 'https://us-central1-watsonproduction-becde.cloudfunctions.net/updateprofilebio';
    }

    let postData = {
      newData : {
        profileid: profileId,
        name: this.profileForm.get('firstname')?.value + " " + this.profileForm.get('lastname')?.value,
        firstname: this.profileForm.get('firstname')?.value,
        lastname: this.profileForm.get('lastname')?.value,
        email: newEmail,
        number: this.profileForm.get('number')?.value,
        countrycode: this.profileForm.get('countrycode')?.value
      },
      oldData:{
        profileid: oldProfile.profileid,
        name: oldProfile.name,
        firstname: oldProfile.firstname,
        lastname: oldProfile.lastname,
        email: oldProfile.email,
        number: oldProfile.number,
        countrycode: oldProfile.countrycode
      }
    }
    console.log('CRM Payload (Normal):', postData);
    this.http.post(salesCRMURL, postData).subscribe({
      next: (res) => console.log('SalesCRM success', res),
      error: (err) => console.log('SalesCRM error', err)
    });

    this.http.post(watsonURL, postData).subscribe({
      next: (res) => console.log('Watson success', res),
      error: (err) => console.log('Watson error', err)
    });

    this.dialogData.profile.email = newEmail;
    this.dialogData.profile.user_ref = null;
    this.dialogData.profile.user_ref_existing = updatedMap;
    this.profileForm.patchValue({ email: newEmail });
    // this.originalProfile = { ...this.dialogData.profile };

    this.profileForm.controls['email'].enable();
    this.emailLocked = false;
    alert('Email updated');
    this.dialogRef.close();
  }

  getFilteredEmails(): string[] {
    const map = this.dialogData.profile?.user_ref_existing || {};
    const currentEmail = this.dialogData.profile?.email?.toLowerCase();
    return Object.keys(map).filter(email => email.toLowerCase() !== currentEmail).sort();
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
      else if(this.existingProfile.some(p => p.profileid !== this.dialogData.profile?.profileid && (p.email?.toLowerCase() === email || Object.keys(p.user_ref_existing || {}).includes(email)))){
        const owner = this.existingProfile.find(p => p.profileid !== this.dialogData.profile?.profileid && (p.email?.toLowerCase() === email || Object.keys(p.user_ref_existing || {}).includes(email)));
        if(owner.email?.toLowerCase() === email){
          result = `${email} is currently used by ${owner.name}`
        } else {
          result = `${email} is linked with ${owner.name}`
        }
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
    var profilevalue = this.profileForm.getRawValue();
    profilevalue["email"] = profilevalue["email"].toLowerCase()
    console.log(profilevalue)
    try {
      if(this.profileForm.valid){
        this.loading = true
        var profile_id = this.newprofile ? doc(this.firestore, 'profile_data').id : this.dialogData.profile.profileid;
        var role_id = this.newprofile ? doc(this.firestore, 'users_roles').id : (this.dialogData.profile.role_ref?.id || this.dialogData.profile.profileid);
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
          const latestData: any = this.dialogData.profile || {};
          const existingMap = latestData.user_ref_existing || {};
          const typedEmail = profilevalue["email"].toLowerCase();
          if (existingMap.hasOwnProperty(typedEmail)) {
            const restoredUid = existingMap[typedEmail];
            if (restoredUid && typeof restoredUid === 'string' && restoredUid.trim() !== '') {
              profilevalue["user_ref"] = doc(this.firestore, 'user_data', restoredUid);
            }
          } else {
            profilevalue["user_ref"] = latestData.user_ref || null;
          }
          batch.set(profile_dataRef, {
            ...profilevalue,
            user_ref_existing: latestData.user_ref_existing || {}
          }, { merge: true });
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
                  profileid: this.originalProfile.profileid,
                  name: this.originalProfile.name,
                  firstname: this.originalProfile.firstname,
                  lastname: this.originalProfile.lastname,
                  email: this.originalProfile.email,
                  number: this.originalProfile.number,
                  countrycode: this.originalProfile.countrycode
                }
              }
              // console.log('CRM Payload (SUBMIT):', postData);
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
