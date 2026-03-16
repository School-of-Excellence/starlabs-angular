import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { firstValueFrom, lastValueFrom } from 'rxjs';
// Firebase v9+ imports (modular SDK)
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,getAuth,onAuthStateChanged} from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { environment } from '../../environments/environment';
import { OtpVerificationComponent } from '../DialogBox/otp-verification/otp-verification.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})

export class LoginComponent implements OnInit {
  loading = false;
  loginform: FormGroup;
  registerform: FormGroup;
  visiblePassword: boolean = false;
  registerUser = false;
  routeParams: string | null = null;
  // OTP validation
  otpValidation = {
    number: "",
    success: false
  };
  constructor(
    public firestore: Firestore,         
    public auth: Auth,            
    public router: Router,
    public formbuilder: FormBuilder,
    public route: ActivatedRoute,
    public snackBar: MatSnackBar,
    public http: HttpClient,
    public dialog: MatDialog,
  ) {
    this.loginform = this.formbuilder.group({
      email: ['', { validators: [Validators.required, Validators.email], updateOn: "change" }],
      password: ['', { validators: [Validators.required], updateOn: "change" }],
    });

    this.registerform = this.formbuilder.group({
      name: ['', { validators: [Validators.required], updateOn: "change" }],
      countrycode: ["+91", { validators: [Validators.required], updateOn: "change" }],
      number: ['', { validators: [Validators.required, Validators.pattern("^[0-9]*$")], updateOn: "change" }],
      email: ['', { validators: [Validators.required, Validators.email], updateOn: "change" }],
      password: ['', { validators: [Validators.required, Validators.minLength(6)], updateOn: "change" }],
      confirmpassword: ['', { validators: [Validators.required], updateOn: "change" }],
    });
    this.routeParams = this.route.snapshot.queryParams['returnUrl'];
    console.log("Navigate after login", this.routeParams)
    // Subscribe to route params
    // this.route.queryParams.subscribe(data => {
    //   if (data != null) {
    //     console.log(data);
    //     this.routeParams = data["returnUrl"];
    //     const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
    //       if (user) {
    //         console.log('Logged in as:', user.email);
    //         this.router.navigateByUrl(this.routeParams != null ? this.routeParams : '/EISDashboard');
    //       } else {
    //         console.log('Not logged in');
    //       }
    //       // Immediately unsubscribe after first check
    //       unsubscribe();
    //     });
    //   }
    // });
  }

  ngOnInit() {
    // Initialize component
  }

  async phoneAuthentication(countrycode: string, number: string): Promise<boolean> {
    return true;
    /*
    let value: boolean;
    if (countrycode.length !== 0 && number.length !== 0) {
      const phoneAuth = this.dialog.open(OtpVerificationComponent, {
        data: {
          countrycode: countrycode,
          phonenumber: number
        },
        disableClose: true,
        autoFocus: false
      });
      
      try {
        const result = await firstValueFrom(phoneAuth.afterClosed());
        value = result === true;
      } catch (error) {
        console.error('Phone authentication dialog error:', error);
        value = false;
      }
    } else {
      this.snackBar.open("Unable to authenticate user's phone number. Contact customer support.", '', {
        duration: 3000,
        horizontalPosition: 'right',
        verticalPosition: 'top',
      });
      value = false;
    }
    return value;
    */
  }
  
  async dologin(value: any): Promise<void> {
    if (this.loginform.valid) {
      console.log("signing in...");
      this.loading = true;
      
      try {
        // Create query for profile data
        const profileQuery = query(
          collection(this.firestore, "profile_data"),
          where("email", "==", value.email.toLowerCase())
        );
        
        const profileSnapshot = await getDocs(profileQuery);
        
        if (profileSnapshot.size === 0) {
          alert("No Profile found for the given E-mail ID, Try again.");
        } else {
          const profileDoc = profileSnapshot.docs[0];
          const profileDocData = profileDoc.data();
          
          if (profileDocData['number'] == null) {
            alert("Your mobile number is required for verification. Contact administrator to update.");
          } else {
            const code = profileDocData['countrycode'] != null ? profileDocData['countrycode'].toString() : "+91";
            const number = profileDocData['number'].toString();
            
            try {
              // Get role document
              const roleDocRef = doc(this.firestore, profileDocData['role_ref']['path']);
              const roleDocSnap = await getDoc(roleDocRef);
              
              if (roleDocSnap.exists()) {
                const roleData = roleDocSnap.data() ?? {};
                const participant = roleData?.['participant'] ?? false;
                await this.signInUser(value.email.toLowerCase(), value.password, code, number);
              } else {
                alert("Role data not found. Contact Administrator");
              }
            } catch (err) {
              alert(err);
              console.log(err);
            }
          }
        }
      } catch (err) {
        alert(err);
        console.log(err);
      }
    }
    this.loading = false;
  }
  
  async signInUser(email: string, password: string, code: string, number: string): Promise<void> {
    var phoneverified = (this.otpValidation.number == number && this.otpValidation.success) ? true : await this.phoneAuthentication(code, number)
    console.log("Phone Verification", phoneverified)
    if(phoneverified){
      this.otpValidation.number = number;
      this.otpValidation.success = true;
      try {
        const user = await signInWithEmailAndPassword(this.auth, email, password);
        this.loading = false;
        console.log(user);
        this.router.navigateByUrl(this.routeParams != null ? this.routeParams : '/EISDashboard');
      } catch (err) {
        alert(err);
        console.log(err);
      }
    }
  }
  
  checkpassword(): void {
    if (this.registerform.controls['password'].value === this.registerform.controls['confirmpassword'].value) {
      this.registerform.controls['confirmpassword'].setErrors(null);
    } else {
      this.registerform.controls['confirmpassword'].setErrors({ error: true });
    }
  }
  
  async checkProfile(email: string, number: string): Promise<boolean> {
    let validation: boolean;
    let url: string;
    
    if (environment.firebase.projectId === "test-environment-841c3") {
      console.log("Old Test");
      url = "https://us-central1-watson-9878.cloudfunctions.net/starlabs_userverification?email=" + email;
    }else if (environment.firebase.projectId === "starlabs-test") {
      console.log("New Test");
      url = "https://us-central1-watson-test-19.cloudfunctions.net/starlabs_userverification?email=" + email;
    } else if (environment.firebase.projectId === "fir-sample-aae4a" || environment.firebase.projectId === "launch-your-legacy-development") {
      console.log("Production");
      url = "https://us-central1-watsonproduction-becde.cloudfunctions.net/starlabs_userverification?email=" + email;
    }
  
    try {
      const result = await firstValueFrom(this.http.get(url));
      console.log(result);  
      if (result) {
        validation = true;
      } else {
        validation = false;
        alert("The given Email or Phone number is not registered in our database. Please contact administrator");
      }
    } catch (error) {
      console.error('Profile verification error:', error);
      validation = false;
      alert("Error verifying profile. Please try again or contact administrator");
    }    
    return validation;
  }
  
  formatName(name: string): string {
    const list = name.split(' ');
    let value = "";    
    for (let i = 0; i < list.length; i++) {
      if (list[i] !== "" && list[i] !== "\t") {
        const element = list[i].toString().trim();
        const word = element[0].toString().toUpperCase();
        if (word.length !== 0) {
          const other = element.toString().substring(1).toLowerCase();
          const subname = word + other;
          value = value + " " + subname;
        }
      }
    }
    return value.trim();
  }
  
  async doregister(value: any): Promise<void> {
    console.log(window.location);
    this.loading = true;
    console.log(value)
    if (this.registerform.valid) {
      try {
        const verification = await this.checkProfile(value.email.toLowerCase(), value.number);
        
        if (verification) {
          console.log("Verified from Watson");
          const phoneVerified = await this.phoneAuthentication(value.countrycode, value.number.toString());
          
          if (phoneVerified) {
            try {
              const user = await createUserWithEmailAndPassword(this.auth, value.email.toLowerCase(), value.password);
              
              // Set user document
              const userDocRef = doc(this.firestore, "user", user.user.uid);
              await setDoc(userDocRef, {
                email: value.email.toLowerCase(),
                id: user.user.uid,
                username: this.formatName(value.name),
              });
              
              // Set user_data document
              const userDataDocRef = doc(this.firestore, "user_data", user.user.uid);
              await setDoc(userDataDocRef, {
                name: this.formatName(value.name),
                countrycode: value.countrycode,
                number: value.number.toString(),
                email: value.email.toLowerCase()
              });
              
              this.registerform.reset();
              this.registerUser = false;
              await signOut(this.auth);
              alert("Successfully registered");
              this.router.navigateByUrl('/login');
            } catch (err: any) {
              alert(err.message);
            }
          }
        }
      } catch (error) {
        console.error('Registration error:', error);
        alert("Registration failed. Please try again.");
      }
    }
    this.loading = false;
  }
  
  
  resetPassword(): void {
    const email = window.prompt("Enter registered Email-ID to receive link to reset your password", 
      this.loginform.controls['email'].value ?? "");
    
    if (email && email.length !== 0) {
      sendPasswordResetEmail(this.auth, email.toLowerCase().trim()).then(() => {
        alert("Reset password mail successfully sent to your EmailID");
      }).catch(err => {
        console.log(err);
        alert(err.message);
      });
    }
  }

}