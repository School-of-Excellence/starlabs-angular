import { ENTER, COMMA } from '@angular/cdk/keycodes';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, query, updateDoc, where } from '@angular/fire/firestore';
import { FormGroup, FormBuilder, FormControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipInputEvent } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-evolution-wishlist-form',
  imports: [
    CommonModule, 
    FormsModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    MatToolbarModule,
    MatRadioModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './evolution-wishlist-form.component.html',
  styleUrl: './evolution-wishlist-form.component.css'
})
export class EvolutionWishlistFormComponent {
  videoUrl = "https://firebasestorage.googleapis.com/v0/b/test-environment-841c3.appspot.com/o/Surprise%20Content%2FThe%20Lion%20Sleeps%20Tonight%20%20-%20By%20timon%20and%20pumbaa%20_%20The%20Lion%20King%202019.mp4?alt=media&token=6b4aa5b5-8802-498e-9d55-08712fa46bf4"
  questions = [
  ];  
  form:FormGroup;
  addOnBlur = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  data:any = {}
  docData:any = {}
  formSubmitionStatus = 'notsubmitted'
  loaded:boolean = false
  widgetid = "evolutionwishlist"
  participantModeChecklistDoc:any = null
  errormessage = "Invalid Link."
  participantname:string = null
  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private route: ActivatedRoute
  ) {
    this.form = this.fb.group({
      // 'name':[null,[Validators.required]],
      // 'email':[null,[Validators.required,Validators.email]],
      // 'relationship' :[null,[Validators.required]],
    })
    this.data = JSON.parse(decodeURIComponent(this.route.snapshot.queryParams["data"]));
    this.participantname = this.data.profilename ?? null;
    this.initializeQuestions();
  
    if (![null, undefined].includes(this.data) && this.data.docid) {
      var docRef = doc(firestore, "evolutionwishlistlog", this.data.docid)
      getDoc(docRef).then(evolutionsnap => {
        if (evolutionsnap.exists) {
          this.docData = evolutionsnap.data();
          const hasCancelledContact = this.docData.contacts.some(contact => contact.status === 'cancelled');
          // if (hasCancelledContact) {
          //   this.formSubmitionStatus = 'documentnull';
          //   this.errormessage = "Invalid link";
          //   this.loaded = true;
          //   return;
          // }
          // if (this.docData.status === 'cancelled') {
          //   this.formSubmitionStatus = 'documentnull';
          //   this.errormessage = "Invalid link";
          //   this.loaded = true;
          //   return;
          // }
          for (let i = 0; i < this.docData.contacts.length; i++) {
            const element = this.docData.contacts[i];
            if (element['contact'] === this.data['contact']) {
              if (element['submitted'] === true) {
                this.formSubmitionStatus = 'submitted';
              }
            }
          }
          this.loaded = true;
        } else {
          this.formSubmitionStatus = 'documentnull';
          this.errormessage = "Invalid link";
          this.loaded = true;
        }
      }).catch((err) => {
        this.formSubmitionStatus = 'documentnull';
        this.errormessage = "Invalid link";
        this.loaded = true;
      });
    } else {
      this.formSubmitionStatus = 'documentnull';
      this.errormessage = "Invalid link";
      this.loaded = true;
    }
  }
  initializeQuestions() {
    var collectionRef = collection(this.firestore, "evolutionwishlistquestions")
    var queryRef = query(collectionRef, where("enabled", "==", true))
    getDocs(queryRef).then(snapshot => {
      this.questions = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const controlName = doc.id;
        const label = data['question'];
        const sno = data['sno'];
        const type = data['type'] || 'textarea';
        const options = data['options'] || [];
        const videoUrl = data['videoUrl'] || '';
        const audioUrl = data['audioUrl'] || ''; 
        const askanswer = data['askanswer'] === true; 
        const additionalradioinput = data['additionalradioinput'] || ''; 

        this.questions.push({
          controlName,
          label,
          sno,
          type,
          options,
          videoUrl,
          audioUrl,
          askanswer,
          additionalradioinput
        });
        if (!this.form.contains(controlName)) {
          let initialValue;
          let validators = [Validators.required];

          switch(type) {
            case 'checkbox':
              initialValue = [];
              break;
            case 'email':
              initialValue = null;
              validators.push(Validators.email);
              break;
            case 'video':
            case 'audio':
              if (askanswer) {
                initialValue = null;
              } else {
                initialValue = null;
                validators = []; 
              }
              break;
            default:
              initialValue = null;
              break;
          }
          this.form.addControl(controlName, this.fb.control(initialValue, validators));
        }
        if (additionalradioinput) {
          this.form.addControl(controlName + 'Additional', this.fb.control(''));
          this.form.get(controlName).valueChanges.subscribe(value => {
            const additionalControl = this.form.get(controlName + 'Additional');
            if (value === additionalradioinput) {
              additionalControl.setValidators([Validators.required]);
            } else {
              additionalControl.clearValidators();
              additionalControl.setValue('');
            }
            additionalControl.updateValueAndValidity();
          });
        }
      });

      this.questions.sort((a, b) => a.sno - b.sno);
    })
    .catch(error => {
      console.error('Error fetching questions:', error);
    });
  }
  // evolution-wishlist-form.component.ts
  isOptionChecked(controlName: string, option: string): boolean {
    const control = this.form.get(controlName);
    return control ? control.value?.includes(option) : false;
  }

  onCheckboxChange(event: any, controlName: string, option: string) {
    const control = this.form.get(controlName);
    if (!control) return;

    const currentValue = control.value || [];
    
    if (event.checked) {
      control.setValue([...currentValue, option]);
    } else {
      control.setValue(currentValue.filter((item: string) => item !== option));
    }
  }

  ngOnInit(): void {}

  addKeywordFromInput(event:MatChipInputEvent) {
    let value = event.value
    if(value){
      const control = this.form.get("wishlist") as FormControl;
      const currentValues = control.value || []
      control.setValue([...currentValues,value]);
      event.input.value = "";
      control.markAsTouched()
    }
  }
  onRadioChange(event: any, question: any) {
    const additionalControl = this.form.get(question.controlName + 'Additional');
    
    if (event.value === question.additionalradioinput) {
      // Add required validator when the "Other" option is selected
      additionalControl.setValidators([Validators.required]);
    } else {
      // Remove required validator when any other option is selected
      additionalControl.clearValidators();
      // Reset the value when switching away from this option
      additionalControl.setValue('');
    }
    
    // Update the control's validity
    additionalControl.updateValueAndValidity();
  }
  removeKeyword(index:number) {
    // this.form.get("wishlist").value.splice(index,1);
    const control = this.form.get("wishlist") as FormControl;
    const currentValues = control.value || [];
    currentValues.splice(index, 1);
    control.setValue(currentValues);
    control.markAsTouched();  // Mark as touched to trigger validation
  }
  onSubmit() {
    this.loaded = false;
    let formvalue = this.form.value;
    formvalue['submitteddate'] = new Date();
    formvalue['status'] = "received";
    formvalue['submitted'] = true;    
    const wishlistquestionmap = {};
    this.questions.forEach(question => {
      wishlistquestionmap[question.controlName] = formvalue[question.controlName];
    });
  
    for (let i = 0; i < this.docData.contacts.length; i++) {
      const element = this.docData.contacts[i];
      if (element['contact'] === this.data['contact']) {
        this.docData.contacts[i] = {
          ...this.docData.contacts[i],
          ...formvalue,
          wishlistquestionmap: wishlistquestionmap,
        };  
        this.questions.forEach(question => {
          delete this.docData.contacts[i][question.controlName];
        });
      }
    }
  
    console.log(this.docData, "Updated Document Data");
    console.log(formvalue, this.docData);    
    
    // Update the Firestore document
    var docRef = doc(this.firestore, "evolutionwishlistlog", this.docData["docid"])
    updateDoc(docRef, this.docData).then(async () => {
      this.formSubmitionStatus = 'submitted';
      this.loaded = true;
    });
  }
}
