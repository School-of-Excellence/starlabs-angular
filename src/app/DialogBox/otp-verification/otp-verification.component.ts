import { CommonModule } from '@angular/common';
import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Auth, PhoneAuthProvider, RecaptchaVerifier, signInWithCredential } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, interval, take } from 'rxjs';

@Component({
  selector: 'app-otp-verification',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './otp-verification.component.html',
  styleUrl: './otp-verification.component.css'
})
export class OtpVerificationComponent implements OnInit, OnDestroy {
  @ViewChild('otpFirst') otpFirstField!: ElementRef;

  otpValues: string[] = ['', '', '', '', '', ''];
  canResend: boolean = false;
  countdownTime: number = 90; // 1 minute 30 seconds
  private countdownSubscription: Subscription | null = null;

  recaptcha: RecaptchaVerifier = null
  countryCode = ""
  phoneNumber = ""
  hiddenNumber = ""
  phoneVerificationcode = null

  loading = false
  
  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogdata,
    public dialogRef: MatDialogRef<any>,
    public auth: Auth,
    public snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {    
    this.countryCode = this.dialogdata["countrycode"]
    this.phoneNumber = this.dialogdata["phonenumber"]
    for (let i = 0; i < this.phoneNumber.length; i++) {
      const number = this.phoneNumber[i];
      if((this.phoneNumber.length - i) > 4){
        this.hiddenNumber = this.hiddenNumber + "x"
      }
      else{
        this.hiddenNumber = this.hiddenNumber + number
      }
    }
    this.setupReCaptcha()
  }

  ngOnDestroy(): void {
    console.log("Destroy")
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
    }
    this.recaptcha?.clear()
  }

  setupReCaptcha(){
    console.log("Setting reCaptcha...")
    this.recaptcha = new RecaptchaVerifier(this.auth, 'recaptcha',{
      'size':'invisible',
      'callback': () => {
        console.log('reCAPTCHA solved');
      },
      'expired-callback': () => {
        // Response expired. Ask user to solve reCAPTCHA again.
        console.log('reCAPTCHA expired');
        this.snackBar.open('reCAPTCHA expired. Please try again.', null, {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
        });
      },
      'error-callback': (error: any) => {
        console.error('reCAPTCHA error:', error);
        this.snackBar.open('reCAPTCHA error. Please refresh and try again.', null, {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
        });
      },
    });

    // Send Request
    this.requestFirebaseOTP()
    // Focus on the first input field when component initializes
    setTimeout(() => {
      this.otpFirstField?.nativeElement.focus();
    }, 0);
    // Start the countdown for resend button
    this.startCountdown();
  }

  async requestFirebaseOTP(){
    this.loading = true
    try {
      var phoneAuthProvider = new PhoneAuthProvider(this.auth)
      await phoneAuthProvider.verifyPhoneNumber(this.countryCode + this.phoneNumber, this.recaptcha).then(async phoneVerificationcode=>{
        this.phoneVerificationcode = phoneVerificationcode
        console.log("OTP Sent")
        this.snackBar.open("OTP sent to your number. Please check your messages, including spam.", null, {
          duration : 6000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
        })
      }).catch(err=>{
        console.log(err)
        this.snackBar.open("Unable to Send OTP: " + err.message, null, {
          duration : 5000,
          horizontalPosition: 'right',
          verticalPosition: 'top',
        })
      })
    } catch (exception) {
      console.log("Exception", exception)
      this.snackBar.open("Unable to Send OTP: " + exception, null, {
        duration : 5000,
        horizontalPosition: 'right',
        verticalPosition: 'top',
      })
    }
    this.loading = false
  }

  isOtpValid(): boolean {
    return this.otpValues.every(val => /^\d$/.test(val));
  }

  async verifyOtp() {
    if (this.isOtpValid()) {
      this.loading = true
      try {
        const otp = this.otpValues.join('');
        console.log('Verifying OTP:', otp);
        const credential = PhoneAuthProvider.credential(this.phoneVerificationcode, otp);
        await signInWithCredential(this.auth, credential).then(async ()=>{
          await this.auth.signOut()
          console.log("OTP Verified")
          this.dialogRef.close(true)
        }).catch(err=>{
          console.log(err)
          this.loading = false
          this.snackBar.open(err.message, null, {
            duration : 5000,
            horizontalPosition: 'right',
            verticalPosition: 'top',
          })
        })
      } catch (exception) {
        console.log(exception)
        this.loading = false
        this.snackBar.open(exception.message, null, {
          duration : 5000,
          horizontalPosition: 'right',
          verticalPosition: 'top',
        })
      }
      this.loading = false
    }
  }

  resendOtp(): void {
    if (this.canResend) {
      console.log('Resending OTP...');
      this.requestFirebaseOTP()
      
      // Reset countdown
      this.canResend = false;
      this.countdownTime = 90;
      this.startCountdown();
      
      // Clear existing OTP fields
      this.otpValues = ['', '', '', '', '', ''];
      
      // Focus on the first field
      setTimeout(() => {
        this.otpFirstField?.nativeElement.focus();
      }, 0);
    }
  }

  onKeyUp(event: KeyboardEvent, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // If backspace, focus on previous input
    if (event.key === 'Backspace' && index > 0 && !value) {
      const prevInput = input.previousElementSibling as HTMLInputElement;
      if (prevInput) {
        prevInput.focus();
      }
      return;
    }

    // If the input has a value and it's not the last one, focus on next input
    if (value && index < this.otpValues.length - 1) {
      const nextInput = input.nextElementSibling as HTMLInputElement;
      if (nextInput) {
        nextInput.focus();
      }
    }

    // Allow only numbers
    if (/^\d$/.test(value)) {
      this.otpValues[index] = value;
    } else {
      this.otpValues[index] = '';
      input.value = '';
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    
    if (!event.clipboardData) {
      return;
    }

    const pastedText = event.clipboardData.getData('text');
    const pastedDigits = pastedText.replace(/\D/g, '').split('').slice(0, this.otpValues.length);
    
    // Populate the available digits from the pasted content
    for (let i = 0; i < pastedDigits.length; i++) {
      if (i < this.otpValues.length) {
        this.otpValues[i] = pastedDigits[i];
        
        // Update input field value
        const inputs = document.querySelectorAll('.otp-input') as NodeListOf<HTMLInputElement>;
        if (inputs[i]) {
          inputs[i].value = pastedDigits[i];
        }
        
        // Focus on the next empty field or the last field
        if (i === pastedDigits.length - 1 && i < this.otpValues.length - 1) {
          if (inputs[i + 1]) {
            inputs[i + 1].focus();
          }
        } else if (i === this.otpValues.length - 1 || i === pastedDigits.length - 1) {
          if (inputs[i]) {
            inputs[i].focus();
          }
        }
      }
    }
  }

  startCountdown(): void {
    // Cancel any existing subscription
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
    }
    
    this.countdownTime = 90; // 1 minute 30 seconds
    this.canResend = false;
    
    this.countdownSubscription = interval(1000).pipe(take(this.countdownTime + 1)).subscribe(() => {
      this.countdownTime--;  
      if (this.countdownTime <= 0) {
        this.canResend = true;
        if (this.countdownSubscription) {
          this.countdownSubscription.unsubscribe();
          this.countdownSubscription = null;
        }
      }
    });
  }

  formatCountdown(): string {
    const minutes = Math.floor(this.countdownTime / 60);
    const seconds = this.countdownTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  closeDialog(){
    this.dialogRef.close(false)
  }
}
