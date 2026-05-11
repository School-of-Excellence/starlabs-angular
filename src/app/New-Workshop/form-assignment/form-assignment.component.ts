import { Component, inject, Input, OnInit } from '@angular/core';
import { doc, Firestore , getDoc,collection , query, where, getDocs,setDoc,deleteDoc,updateDoc,arrayUnion, serverTimestamp, QueryDocumentSnapshot, Timestamp, getFirestore} from '@angular/fire/firestore';
import { ActivatedRoute, Router} from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FormGroup,FormBuilder, Validators, FormControl, FormArray, ReactiveFormsModule, FormsModule}from'@angular/forms';
import { DomSanitizer} from '@angular/platform-browser';
import { AbstractControl, ValidatorFn } from '@angular/forms';
import { MatSelectionListChange } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatListModule } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { FormOptionComponent } from '../../Product Designer/delivery-set/form-option/form-option.component';
import { FormTemplatePreviewComponent } from '../../Product Designer/delivery-set/form-template-preview/form-template-preview.component';

function minArrayLength(min: number): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    if (control.value && control.value.length < min) {
      return { 'minArrayLength': { valid: false, actualLength: control.value.length } };
    }
    return null;
  };
}

function maxArrayLength(max: number): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    if (control.value && control.value.length > max) {
      return { 'maxArrayLength': { valid: false, actualLength: control.value.length } };
    }
    return null;
  };
}

export interface FlippingQuestionValue {
  [key: string]: string;
}

@Component({
  selector: 'app-form-assignment',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatSelectModule,
    MatSliderModule,
    MatListModule,
    MatRadioModule,
    MatButtonModule,
    MatInputModule,
    MatCheckboxModule,
    MatTimepickerModule
  ],
  providers: [
    provideNativeDateAdapter()
  ],  templateUrl: './form-assignment.component.html',
  styleUrl: './form-assignment.component.css'
})
export class FormAssignmentComponent {
@Input() participantformtemplateid:any
  // clientform:any

  //for workshop review
  isOldResult: boolean = false;
  oldResultIndex: number | null = null;
  oldResultNotes: string[] = [];
  isCompletedAssignment: boolean = false;
  completionNotes: string[] = [];
  reviewProfileId: string | null = null;
  workshopRef: string | null = null;
  challengeIndex: number | null = null;
  subChallengeIndex: number | null = null;
  reviewId: string | null = null;
  showReviewButtons: boolean = false;

  reviewNotesForm: FormArray<FormControl<string>>;



  submittedClientForm
  showcontent : boolean = false
  deliveryForm:FormGroup
  formpatch:any
  queueId:any
  patchformid : any

  profileid: any;
  draftDocid:string
  firestoreDefault = getFirestore()
  private firestoreForms = getFirestore('firestore-forms')
  private auth = inject(AuthguardService)
  currentUserId:string
  userProfile:any
  queueData:any
  participantQueueToken:any

  constructor(
    private route : ActivatedRoute,
    private dialog : MatDialog,
    private fb : FormBuilder,
    private router : Router,
    public sanitizer: DomSanitizer
  ) {
    this.deliveryForm = this.fb.group({})
    this.draftDocid = doc(collection(this.firestoreForms,"temporary_forms")).id;
    this.reviewNotesForm = this.fb.array([
      this.fb.control('', []) // Start with one empty note
    ]);
  }

  async ngOnInit() {
     // Get queue ID from route params
    this.queueId = this.route.snapshot.queryParams['queueid'] ?? null;
    
    // Get user ID and roles in constructor
    await this.initializeUserData();
    
    // If queue ID exists, fetch queue data
    if (this.queueId) {
      await this.initializeQueueData();
    }
    //for workshop form 
    this.reviewProfileId = this.route.snapshot.queryParams['profileid'] || null;
    this.workshopRef = this.route.snapshot.queryParams['workshopref'] || null;
    this.challengeIndex = this.route.snapshot.queryParams['challengeIndex'] ? 
      +this.route.snapshot.queryParams['challengeIndex'] : null;
    this.subChallengeIndex = this.route.snapshot.queryParams['subChallengeIndex'] ? 
      +this.route.snapshot.queryParams['subChallengeIndex'] : null;
    this.reviewId = this.route.snapshot.queryParams['reviewid'] || null;

    // Show review buttons only if all review parameters are present
    this.showReviewButtons = !!(this.reviewProfileId && this.workshopRef && 
      this.challengeIndex !== null && this.subChallengeIndex !== null && this.reviewId);
    this.isOldResult = this.route.snapshot.queryParams['isOldResult'] === 'true';
    this.oldResultIndex = this.route.snapshot.queryParams['oldResultIndex'] ? 
      +this.route.snapshot.queryParams['oldResultIndex'] : null;
    
    // Parse old result notes if they exist
    if (this.route.snapshot.queryParams['oldResultNotes']) {
      try {
        this.oldResultNotes = JSON.parse(this.route.snapshot.queryParams['oldResultNotes']);
      } catch (error) {
        console.error('Error parsing old result notes:', error);
        this.oldResultNotes = [];
      }
    }

    // Update show review buttons logic to disable for old results
    this.showReviewButtons = !!(
      this.reviewProfileId && 
      this.workshopRef && 
      this.challengeIndex !== null && 
      this.subChallengeIndex !== null && 
      this.reviewId &&
      !this.isOldResult // Disable review buttons for old results
    );

    // If viewing old result, populate the notes in the form
    if (this.isOldResult && this.oldResultNotes.length > 0) {
      this.populateOldResultNotes();
    }
    this.isCompletedAssignment = this.route.snapshot.queryParams['isCompletedAssignment'] === 'true';
    
    // Parse completion notes if they exist
    if (this.route.snapshot.queryParams['completionNotes']) {
      try {
        this.completionNotes = JSON.parse(this.route.snapshot.queryParams['completionNotes']);
      } catch (error) {
        console.error('Error parsing completion notes:', error);
        this.completionNotes = [];
      }
    }

    // Update show review buttons logic to disable for completed assignments
    this.showReviewButtons = !!(
      this.reviewProfileId && 
      this.workshopRef && 
      this.challengeIndex !== null && 
      this.subChallengeIndex !== null && 
      this.reviewId &&
      !this.isOldResult && // Disable review buttons for old results
      !this.isCompletedAssignment // Disable review buttons for completed assignments
    );

    // If viewing completed assignment, populate the completion notes in the form
    if (this.isCompletedAssignment && this.completionNotes.length > 0) {
      this.populateCompletionNotes();
    }
  }
  private populateCompletionNotes() {
    // Clear existing notes
    while (this.reviewNotesForm.length > 0) {
      this.reviewNotesForm.removeAt(0);
    }

    // Add completion notes
    this.completionNotes.forEach(note => {
      this.reviewNotesForm.push(this.fb.control(note, []));
    });

    // Ensure there's at least one empty note field if no completion notes
    if (this.reviewNotesForm.length === 0) {
      this.reviewNotesForm.push(this.fb.control('', []));
    }

    // Disable all note controls when viewing completed assignments
    if (this.isCompletedAssignment) {
      this.reviewNotesForm.controls.forEach(control => {
        control.disable();
      });
    }
  }
  populateOldResultNotes() {
    // Clear existing notes
    while (this.reviewNotesForm.length > 0) {
      this.reviewNotesForm.removeAt(0);
    }

    // Add notes from old result
    this.oldResultNotes.forEach(note => {
      this.reviewNotesForm.push(this.fb.control(note, []));
    });

    // Ensure there's at least one empty note field
    if (this.reviewNotesForm.length === 0) {
      this.reviewNotesForm.push(this.fb.control('', []));
    }

    // Disable all note controls when viewing old results
    if (this.isOldResult) {
      this.reviewNotesForm.controls.forEach(control => {
        control.disable();
      });
    }
  }
  ngAfterViewInit(){
    // console.log(" ngAfterViewInit participantformtemplateid",this.participantformtemplateid);
    this.formpatch  = ![null,undefined].includes(this.route.snapshot.queryParams['patchdata']) ? true : (![null,undefined].includes(this.participantformtemplateid) ? true : false)
    // console.log(this.formpatch);
    // this.queueId = this.route.snapshot.queryParams['queueid'] ?? null
    this.patchformid = this.route.snapshot.queryParams['id']
    this.profileid = this.route.snapshot.queryParams['profileid'] ?? null
    console.log(this.route.snapshot.queryParams['patchdata']);
    // console.log("queueid",this.queueId);
    console.log(this.route.snapshot.queryParams['id'], "---", this.participantformtemplateid?.formid)

    const deliveryFormsId = this.route.snapshot.queryParams['id'] ?? this.participantformtemplateid.formid
    const deliveryFormCollectionDoc = doc(collection(this.firestoreDefault,'delivery forms'),deliveryFormsId)
    getDoc(deliveryFormCollectionDoc).then(async snap => {
      this.submittedClientForm = snap.data()
      this.dialog.closeAll()
      if([null,undefined].includes(this.route.snapshot.queryParams['patchdata']) && [null,undefined].includes(this.participantformtemplateid)){
        console.log("new");
        // this.clientform = snap.data()
        console.log(snap.data());
        let n = 0
        for (let i = 0; i < this.submittedClientForm.formarray.length; i++){
          const item = this.submittedClientForm.formarray[i];
          console.log(i);
          console.log(item.type);
          if(!['label','video','audio'].includes(item.type)){
            this.submittedClientForm.formarray[i]['formcontrol'] = `control${n}`
            console.log(item.formcontrol);
            n++
            if(!['array'].includes(item.type)){
              const validators = this.buildValidators(item);
              let  initialValue = this.buildInitialValue(item)
              this.deliveryForm.addControl(item.formcontrol,new FormControl(initialValue,validators))
            }else{
              this.deliveryForm.addControl(item.formcontrol,new FormArray([
                this.createFormArray(item.formcontrol,item.array)
              ]))
            }
          }
        }
        console.log(this.deliveryForm)
        this.showcontent = true
      }else if(![null,undefined].includes(this.route.snapshot.queryParams['patchdata']) || ![null,undefined].includes(this.participantformtemplateid)){
        // console.log("view");
        let formsByClientPath = ![null,undefined].includes(this.participantformtemplateid) ? doc(this.firestoreForms,"formsByClient",this.participantformtemplateid.docid).path  : null
        getDoc(doc(this.firestoreForms,this.route.snapshot.queryParams['patchdata'] ?? formsByClientPath)).then(async formsByClientSnap => {
          //form setup start
          this.submittedClientForm = formsByClientSnap.data()
          let n = 0
          for (let i = 0; i < this.submittedClientForm['formarray'].length; i++){
            const item = this.submittedClientForm['formarray'][i];
            console.log(item);
            if(!['label','video','audio'].includes(item.type)){
              this.submittedClientForm.formarray[i]['formcontrol'] = `control${n}`
              console.log(item.formcontrol);
              n++
              if(!['array'].includes(item.type)){
                const validators = this.buildValidators(item);
                let  initialValue = this.buildInitialValue(item)
                this.deliveryForm.addControl(item.formcontrol,new FormControl(initialValue,validators))
              }else{
                this.deliveryForm.addControl(item.formcontrol,new FormArray([
                  this.createFormArray(item.formcontrol,item.array)
                ]))
              }
            }
          }
          //form setup ended and form patch started
          n = 0 
          for (let i = 0; i < this.submittedClientForm['formarray'].length; i++) {
            const element = this.submittedClientForm['formarray'][i];
            if(!['label','video','audio'].includes(element['type'])){
              element['formcontrol']=`control${n}`
              n++
              if(!['array','date'].includes(element['type'])){
                this.deliveryForm.get(element['formcontrol']).patchValue(element['value'] ?? null)
              }else if(element['type'] == 'date'){
                this.deliveryForm.get(element['formcontrol']).patchValue(element['value'] != undefined && element['value'] != null ? element['value']?.toDate() : null)
              }else if(element['type'] == 'array'){
                for (let j = 0; j < element['value'].length; j++) {
                  if(j != 0 ){
                    this.onAdd(element['formcontrol'],element['array'])
                  }
                  for (let k = 0; k < element['array'].length; k++) {
                    const arrayelement = element['array'][k];
                    arrayelement['formarraycontrol'] = `arraycontrol${k}`
                    let x = this.deliveryForm.get(element['formcontrol']) as FormArray
                    if(!['date','label','array'].includes(arrayelement['type'])){
                      x.at(j)?.get(arrayelement['formarraycontrol']).patchValue(element['value'][j][arrayelement['fieldname']] ?? element['value'][j][arrayelement['formarraycontrol']] ?? null)
                    }else if(arrayelement['type'] == 'date'){
                      x.at(j)?.get(arrayelement['formarraycontrol']).patchValue(element['value'][j][arrayelement['fieldname']] != undefined ? element['value'][j][arrayelement['fieldname']]?.toDate(): element['value'][j][arrayelement['formarraycontrol']]?.toDate() ?? null)
                    }
                  }
                }
              }
            }
          }
          //formpatch ended
          this.showcontent = true
        })
      }//patch value if condition
    })
  }

  private async initializeUserData() {
    try {
      this.currentUserId = await this.auth.getuid();
      const roles = await this.auth.getRoles();
      this.userProfile = roles;
      this.profileid = this.profileid ?? roles.profile_ref.id;
      this.getFormsOption();
    } catch (error) {
      console.error('Error initializing user data:', error);
    }
  }

  private async initializeQueueData() {
    try {
      // Get queue document
      const queueDocRef = doc(this.firestoreDefault, 'queue generation', this.queueId!);
      const queueDoc = await getDoc(queueDocRef);
      
      if (queueDoc.exists()) {
        this.queueData = queueDoc.data();
      }

      // Get participant queue token
      const tokenCollectionRef = collection(this.firestoreDefault, 'queue_token');
      const tokenQuery = query(
        tokenCollectionRef,
        where('queueref', '==', queueDocRef),
        where('stagestatus', '==', 'Approved'),
        where('tokenstatus', '==', 'Active'),
        where('profile_id', '==', this.profileid)
      );

      const tokenSnapshot = await getDocs(tokenQuery);
      this.participantQueueToken = tokenSnapshot.docs.length > 0 ? {
        ...tokenSnapshot.docs[0].data(),
        ref: tokenSnapshot.docs[0].ref,
        docid: tokenSnapshot.docs[0].id
      } : null;

    } catch (error) {
      console.error('Error initializing queue data:', error);
    }
  }

  buildValidators(item:any):ValidatorFn[]{
    const validators: ValidatorFn[] = [];
    if (item?.required) {
      if (['Checkbox'].includes(item?.type || '')) {
        validators.push(Validators.requiredTrue);
      } else {
        validators.push(Validators.required);
      }
    }

    if (['email'].includes(item?.type || '')) {
      validators.push(Validators.email);
    }

    if (![null, undefined, '', 0].includes(item?.mincount)) {
      validators.push(minArrayLength(item.mincount!));
    }

    if (![null, undefined, '', 0].includes(item?.maxcount)) {
      validators.push(maxArrayLength(item.maxcount!));
    }
    return validators;
  }

  buildInitialValue(item:any){
    let  initialValue = null
    if(['Checkbox'].includes(item.type)){
      initialValue = false
    }else if(['multicheckbox','MultiSelect'].includes(item.type)){
      initialValue = []
    }
    return initialValue
  }

  createFormArray(fieldcontrol,array){
    fieldcontrol = this.fb.group({})
    for (let i = 0; i < array.length; i++) {
      const option = array[i];
      option['formarraycontrol'] = `arraycontrol${i}`
      const validators = this.buildValidators(option)
      const initialValue = this.buildInitialValue(option)
      fieldcontrol.addControl(option.formarraycontrol,new FormControl(initialValue,validators))
    }
    return fieldcontrol
  }

  onMultiSelectionChange(event:MatSelectionListChange,formcontrol:string,formobj:any,index:number){
    if(this.submittedClientForm.formarray[index]['flipping'] === true){
      this.submittedClientForm.formarray[index]['flippingquestion']['value'] = this.submittedClientForm.formarray[index]['flippingquestion']['value'] || {}
      let obj = {}
      for (let i = 0; i < event.source._value.length; i++) {
        const element = event.source._value[i];
        obj[element] = this.submittedClientForm.formarray[index]['flippingquestion']['value'][element] || null
      }
      this.submittedClientForm.formarray[index]['flippingquestion']['value'] = Object.assign({},obj)
    }
  }

  onSliderValueChange(event,control,array){
    control.value = array[event.value - 1]
  }

  onSliderFlippingValueChange(event,flippingvalue:string,formobj:any,index:number){
    console.log(event.target.value,flippingvalue,formobj)
    this.submittedClientForm.formarray[index]['flippingquestion']['value'][flippingvalue] = event.target.value
  }

  onAdd(fieldname,array){
    let y =  this.deliveryForm.get(fieldname) as FormArray
    y.push(this.createFormArray(fieldname,array))
  }

  onRemove(fieldname,index){
    let y =  this.deliveryForm.get(fieldname) as FormArray
    y.removeAt(index)
  }

  getFormArrayControl(fieldname:string){
    return (this.deliveryForm.get(fieldname) as FormArray).controls
  }

  getFormArray(fieldname:string){
    return (this.deliveryForm.get(fieldname) as FormArray)
  }

  async onSubmit(value: any) {
    const previewRef = this.dialog.open(FormTemplatePreviewComponent, {
      width: '800px',
      maxWidth: '95vw',
      maxHeight: "90vh",
      data: {
        formData: this.submittedClientForm,
        formValues: value
      },
      disableClose: true
    });

    previewRef.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await this.processFormSubmission(value);
      }
    });
  }

   private async processFormSubmission(value: any) {
    this.deliveryForm.reset();
    
    const loadingRef = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Submitting Please Wait ..." },
      disableClose: true
    });

    try {
      // Process form array values
      this.processFormArrayValues(value);
      
      // Process array type controls
      this.processArrayTypeControls();

      // Set user and profile data (already available from constructor)
      this.submittedClientForm['loginid'] = this.currentUserId;
      this.submittedClientForm['profileid'] = this.profileid;

      // Handle queue-related data
      let nextstage = null;
      if (this.queueId) {
        await this.handleQueueSubmission();
        nextstage = await this.getNextStage();
      }

      // Set submission metadata
      this.submittedClientForm['date'] = new Date();
      this.submittedClientForm['docid'] = this.draftDocid;
      this.submittedClientForm["submittedin"] = "starlabs";

      console.log(this.submittedClientForm);

      // Submit the form
      await this.submitFormData(nextstage);
      
      loadingRef.close();
      this.router.navigateByUrl("/");

    } catch (error) {
      console.error('Error during form submission:', error);
      loadingRef.close();
    }
  }

  private processFormArrayValues(value: any) {
    let n = 0;
    for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
      const element = this.submittedClientForm.formarray[i];
      if (!['label', 'video', 'audio'].includes(element['type'])) {
        element["value"] = (value[`control${n}`] !== undefined && value[`control${n}`] !== null) 
          ? value[`control${n}`] : null;
        n++;
      }
    }
  }

  private processArrayTypeControls() {
    for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
      const formelement = this.submittedClientForm.formarray[i];
      
      if (formelement['type'] === 'array' && 
          ![null, undefined].includes(this.submittedClientForm.formarray[i]['value'])) {
        
        // Map arraycontrol keys to field names
        for (let j = 0; j < this.submittedClientForm.formarray[i]['value'].length; j++) {
          const valueObj = this.submittedClientForm.formarray[i]['value'][j];
          
          for (const key in valueObj) {
            const index = Object.keys(valueObj).indexOf(key);
            const formcontrol = `arraycontrol${index}`;
            
            if (formelement['array'][index] && formelement['array'][index]['fieldname']) {
              valueObj[formelement['array'][index]['fieldname']] = valueObj[formcontrol];
            }
          }
        }

        // Remove arraycontrol keys
        for (let j = 0; j < this.submittedClientForm.formarray[i]['value'].length; j++) {
          const valueObj = this.submittedClientForm.formarray[i]['value'][j];
          
          for (const key in valueObj) {
            const index = Object.keys(valueObj).indexOf(key);
            const formcontrol = `arraycontrol${index}`;
            delete valueObj[formcontrol];
          }
        }
      }
    }
  }

  private async handleQueueSubmission() {
    if (this.queueId) {
      const queueDocRef = doc(this.firestoreDefault, 'queue generation', this.queueId);
      this.submittedClientForm['queueref'] = queueDocRef;
      
      if (this.participantQueueToken) {
        this.submittedClientForm['queuetokenref'] = this.participantQueueToken.ref;
        this.submittedClientForm['stagename'] = this.participantQueueToken['currentstage'];
      }
    }
  }

  private async getNextStage(): Promise<string | null> {
    if (!this.participantQueueToken || !this.submittedClientForm['stagename']) {
      return null;
    }

    const currentStage = this.submittedClientForm['stagename'];
    const variationId = this.participantQueueToken['variationid'];

    if (variationId) {
      // Get next stage from variation
      const variationDocRef = doc(this.firestoreDefault, 'queue variation', variationId);
      const variationDoc = await getDoc(variationDocRef);
      
      if (variationDoc.exists()) {
        const stages = variationDoc.data()['stages'];
        const currentIndex = stages.indexOf(currentStage);
        return currentIndex !== -1 && currentIndex < stages.length - 1 
          ? stages[currentIndex + 1] : null;
      }
    } else if (this.queueData) {
      // Get next stage from queue data
      const stages = this.queueData['stages'];
      const currentIndex = stages.indexOf(currentStage);
      return currentIndex !== -1 && currentIndex < stages.length - 1 
        ? stages[currentIndex + 1] : null;
    }

    return null;
  }

  private async submitFormData(nextstage: string | null) {
    // Submit form to formsByClient collection
    const formDocRef = doc(this.firestoreForms, 'formsByClient', this.submittedClientForm['docid']);
    await setDoc(formDocRef, this.submittedClientForm);

    // Delete draft
    if (this.draftDocid) {
      const draftDocRef = doc(this.firestoreForms, 'temporary_forms', this.draftDocid);
      await deleteDoc(draftDocRef);
      console.log("Draft deleted");
    }

    // Handle post-submission updates
    if (!this.queueId && this.route.snapshot.queryParams['data']) {
      // Update delivery status for non-queue submissions
      const dataDocRef = doc(this.firestoreDefault, this.route.snapshot.queryParams['data']);
      await updateDoc(dataDocRef, {
        fileref: arrayUnion(formDocRef),
        status: "completed"
      });
      await this.auth.updateDeliveryStatus(formDocRef.path, "completed");
      
    } else if (this.participantQueueToken && nextstage) {
      // Update queue token for queue submissions
      await this.updateQueueToken(nextstage);
    }
  }

  private async updateQueueToken(nextstage: string) {
    if (!this.participantQueueToken) return;

    const tokenUpdate = {
      previousstage: this.submittedClientForm['stagename'],
      currentstage: nextstage,
      logdate: serverTimestamp(),
      stagestatus: "Approved",
      quicknotes: null,
      cwmentoring: null,
      cwshadowing: null,
      cwperson: null,
      diagnosticmentoring: null,
      diagnosticshadowing: null,
      diagnosticperson: null,
      people_involved: [],
      arenaid: null,
      liveassignmentid: null,
    };

    const updatedData = { ...this.participantQueueToken, ...tokenUpdate };

    // Update queue token
    const tokenDocRef = doc(this.firestoreDefault, 'queue_token', this.participantQueueToken.docid);
    await updateDoc(tokenDocRef, updatedData);

    // Create stage log
    const logDocId = doc(collection(this.firestoreDefault, 'queue stage log')).id;
    const logDocRef = doc(this.firestoreDefault, 'queue stage log', logDocId);
    updatedData["logdocid"] = logDocId;
    await setDoc(logDocRef, updatedData);
  }


  async onUpdate(value: any) {
    console.log(value);

    const previewRef = this.dialog.open(FormTemplatePreviewComponent, {
      width: '800px',
      maxWidth: '95vw',
      data: {
        formData: this.submittedClientForm,
        formValues: value
      },
      disableClose: true
    });

    previewRef.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        const loadingRef = this.dialog.open(LoadingProgressComponent, {
          data: { msg: "Submitting Please Wait ..." },
          disableClose: true
        });

        try {
          // Get existing form data and create log entry
          const patchDataPath = this.route.snapshot.queryParams['patchdata'];
          const existingFormDocRef = doc(this.firestoreForms, patchDataPath);
          const existingFormDoc = await getDoc(existingFormDocRef);
          
          if (existingFormDoc.exists()) {
            // Create log entry in formsByClient log collection
            const logDocRef = doc(this.firestoreForms, 'formsByClient log', this.draftDocid);
            await setDoc(logDocRef, existingFormDoc.data());
          }

          // Process form array values - same logic as before
          let n = 0;
          for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
            const element = this.submittedClientForm.formarray[i];
            if (!['label', 'video', 'audio'].includes(element['type'])) {
              element["value"] = (value[`control${n}`] !== undefined && value[`control${n}`] !== null) 
                ? value[`control${n}`] : null;
              n++;
            }
          }

          console.log("second loop started");

          // Process array type controls - same logic as before
          for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
            const formelement = this.submittedClientForm.formarray[i];
            
            if (formelement['type'] === 'array' && 
                ![null, undefined].includes(this.submittedClientForm.formarray[i]['value'])) {
              
              // Map arraycontrol keys to field names
              for (let j = 0; j < this.submittedClientForm.formarray[i]['value'].length; j++) {
                const valueObj = this.submittedClientForm.formarray[i]['value'][j];
                
                for (const key in valueObj) {
                  const index = Object.keys(valueObj).indexOf(key);
                  const formcontrol = `arraycontrol${index}`;
                  
                  if (formelement['array'][index] && formelement['array'][index]['fieldname']) {
                    valueObj[formelement['array'][index]['fieldname']] = valueObj[formcontrol];
                  }
                }
              }

              // Remove arraycontrol keys
              for (let j = 0; j < this.submittedClientForm.formarray[i]['value'].length; j++) {
                const valueObj = this.submittedClientForm.formarray[i]['value'][j];
                
                for (const key in valueObj) {
                  const index = Object.keys(valueObj).indexOf(key);
                  const formcontrol = `arraycontrol${index}`;
                  delete valueObj[formcontrol];
                }
              }
            }
          }

          console.log(this.submittedClientForm);

          // Set form metadata
          this.submittedClientForm['docid'] = this.draftDocid;
          
          // Get user roles for editedby field
          const roles = await this.auth.getRoles();
          this.submittedClientForm["editedby"] = roles.profile_ref.id;
          
          this.submittedClientForm['date'] = new Date();
          this.submittedClientForm['formid'] = this.patchformid;
          this.submittedClientForm["submittedin"] = "starlabs";

          console.log(this.submittedClientForm);

          // Update the document using merge option
          await setDoc(existingFormDocRef, this.submittedClientForm, { merge: true });
          
          loadingRef.close();

        } catch (error) {
          console.error('Error during form update:', error);
          loadingRef.close();
        }
      }
    });
  }

  async autoSave(value: any) {
    console.log(value);
    console.log(this.submittedClientForm)
    
    try {
      // Process form array values
      let e = 0;
      for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
        const element = this.submittedClientForm.formarray[i];
        
        if (!['label', 'video', 'audio'].includes(element['type'])) {
          console.log(value[`control${e}`]);
          element["value"] = (value[`control${e}`] !== undefined && value[`control${e}`] !== null) 
            ? value[`control${e}`] : null;
          e++;
        }
      }

      // Get user roles and set profile ID
      this.submittedClientForm['profileid'] = this.profileid

      console.log("Auto Saving Started");

      // Set form metadata
      this.submittedClientForm['queueid'] = this.queueId;
      this.submittedClientForm['date'] = new Date();
      this.submittedClientForm['docid'] = this.draftDocid;
      this.submittedClientForm['formid'] = this.patchformid;

      console.log(this.submittedClientForm);

      // Save to temporary_forms collection using modern Firebase syntax
      const tempFormDocRef = doc(this.firestoreForms, 'temporary_forms', this.draftDocid);
      await setDoc(tempFormDocRef, this.submittedClientForm, { merge: true });
      
      console.log("Temporary form submitted");

    } catch (error) {
      console.error("Error during auto save:", error);
    }
  }

  async getFormsOption() {
    console.log("Forms Draft");
    
    try {
      const draftforms: QueryDocumentSnapshot[] = [];
      console.log(this.profileid);
      
      // Query temporary_forms collection with modern Firebase syntax
      const tempFormsCollectionRef = collection(this.firestoreDefault, 'temporary_forms');
      const draftQuery = query(
        tempFormsCollectionRef,
        where('formid', '==', this.patchformid),
        where('profileid', '==', this.profileid)
      );
      
      const draftSnapshot = await getDocs(draftQuery);
      console.log(draftSnapshot.docs.length);
      
      if (!draftSnapshot.empty) {
        draftSnapshot.docs.forEach(draftDoc => {
          draftforms.push(draftDoc);
        });
      } else {
        console.log("No Drafts Found");
      }

      // If drafts found, open dialog
      if (draftforms.length !== 0) {
        const dialogRef = this.dialog.open(FormOptionComponent, {
          data: {
            drafts: draftforms,
            mapProfile: {}
          },
          autoFocus: false,
          maxHeight: "90vh",
          disableClose: true
        });

        dialogRef.afterClosed().subscribe((selectedForm) => {
          if (selectedForm != null) {
            const form = selectedForm.doc.data();
            this.draftDocid = form['docid'];

            // Process form array and populate form controls
            let h = 0;
            for (let i = 0; i < form['formarray'].length; i++) {
              const element = form['formarray'][i];
              if (!['label', 'video', 'audio'].includes(element['type'])) {
                element['formcontrol'] = `control${h}`;
                h++;
                console.log("flipping",element,element['flipping'])
                // Handle different field types
                if (!['array', 'date'].includes(element['type'])) {
                  // Regular form controls
                  this.deliveryForm.get(element['formcontrol'])?.patchValue(element['value'] ?? null);
                  if(element['flipping'] === true){
                    this.submittedClientForm.formarray[i]['flippingquestion']['value'] = element['flippingquestion']['value'] || {}
                  }
                  
                } else if (element['type'] === 'date') {
                  // Date form controls
                  const dateValue = (element['value'] !== undefined && element['value'] !== null) 
                    ? element['value']?.toDate() 
                    : null;
                  this.deliveryForm.get(element['formcontrol'])?.patchValue(dateValue);
                  
                } else if (element['type'] === 'array') {
                  // Array form controls
                  this.processArrayFormControl(element);
                }
              }
            }
          }
        });
      }

    } catch (error) {
      console.error("Error getting forms option:", error);
    }
  }

  private processArrayFormControl(element: any) {
    if (!element['value'] || !Array.isArray(element['value'])) return;

    for (let j = 0; j < element['value'].length; j++) {
      // Add new form array group if not the first item
      if (j !== 0) {
        this.onAdd(element['formcontrol'], element['array']);
      }

      // Process each array element
      for (let k = 0; k < element['array'].length; k++) {
        const arrayelement = element['array'][k];
        arrayelement['formarraycontrol'] = `arraycontrol${k}`;
        
        const formArrayControl = this.deliveryForm.get(element['formcontrol']) as FormArray;
        const arrayGroup = formArrayControl.at(j);

        if (!['date', 'label', 'array'].includes(arrayelement['type'])) {
          // Regular array form controls
          const value = element['value'][j][arrayelement['fieldname']] 
            ?? element['value'][j][arrayelement['formarraycontrol']] 
            ?? null;
          arrayGroup?.get(arrayelement['formarraycontrol'])?.patchValue(value);
          
        } else if (arrayelement['type'] === 'date') {
          // Date array form controls
          let dateValue = null;
          
          if (element['value'][j][arrayelement['fieldname']] !== undefined) {
            dateValue = element['value'][j][arrayelement['fieldname']]?.toDate();
          } else if (element['value'][j][arrayelement['formarraycontrol']]) {
            dateValue = element['value'][j][arrayelement['formarraycontrol']]?.toDate();
          }
          
          arrayGroup?.get(arrayelement['formarraycontrol'])?.patchValue(dateValue);
        }
      }
    }
  }
  //for workshop form
  addNote() {
    if (this.canAddNote()) {
      this.reviewNotesForm.push(this.fb.control('', []));
    }
  }

  removeNote(index: number) {
    if (this.canRemoveNote()) {
      this.reviewNotesForm.removeAt(index);
    }
  }

  canAddNote(): boolean {
    if (this.isOldResult || this.isCompletedAssignment) return false;
    const lastNoteIndex = this.reviewNotesForm.length - 1;
    const lastNote = this.reviewNotesForm.at(lastNoteIndex);
    return lastNote.value && lastNote.value.trim().length > 0;
  }

  canRemoveNote(): boolean {
    if (this.isOldResult || this.isCompletedAssignment) return false;
    return this.reviewNotesForm.length > 1;
  }

  getNonEmptyNotes(): string[] {
    return this.reviewNotesForm.value.filter((note: string) => note && note.trim().length > 0);
  }

  getNotesControls() {
    return this.reviewNotesForm.controls;
  }

  // Updated status update methods
  async completeAssignment() {
    if (!this.showReviewButtons || this.isOldResult || this.isCompletedAssignment) return;
    if (!this.showReviewButtons) return;

    try {
      const notes = this.getNonEmptyNotes();
      await this.updateAssignmentStatus('completed', notes);
      console.log('Assignment marked as completed');
      window.close();
    } catch (error) {
      console.error('Error completing assignment:', error);
    }
  }

  async reworkAssignment() {
     if (!this.showReviewButtons || this.isOldResult || this.isCompletedAssignment) return;
    if (!this.showReviewButtons) return;

    try {
      const notes = this.getNonEmptyNotes();
      await this.updateAssignmentStatus('rework', notes);
      console.log('Assignment marked for rework');
      window.close();
    } catch (error) {
      console.error('Error marking assignment for rework:', error);
    }
  }
private async updateAssignmentStatus(status: 'completed' | 'rework', notes: string[] = []) {
  if (!this.workshopRef || this.challengeIndex === null || this.subChallengeIndex === null) {
    throw new Error('Missing required parameters for status update');
  }

  // Get the participant workshop document
  const workshopDocRef = doc(this.firestoreDefault, this.workshopRef);
  const workshopSnap = await getDoc(workshopDocRef);

  if (!workshopSnap.exists()) {
    throw new Error('Workshop document not found');
  }

  const workshopData = workshopSnap.data();
  let challenges = [...(workshopData['challenges'] || [])];

  // Ensure we have the challenge structure
  if (!challenges[this.challengeIndex]) {
    throw new Error('Challenge not found');
  }

  if (!challenges[this.challengeIndex].challenges || 
      !challenges[this.challengeIndex].challenges[this.subChallengeIndex]) {
    throw new Error('Sub-challenge not found');
  }

  const subChallenge = challenges[this.challengeIndex].challenges[this.subChallengeIndex];

  if (status === 'completed') {
    // Handle completion
    subChallenge.status = status;
    subChallenge.completed = Timestamp.now();
    subChallenge.reviewedby = this.currentUserId;
    
    // Add notes if provided
    if (notes.length > 0) {
      subChallenge.completionNotes = notes;
    }

    // Check if this is the last sub-challenge in the main challenge
    const mainChallenge = challenges[this.challengeIndex];
    const allSubChallenges = mainChallenge.challenges;
    
    // Check if all sub-challenges in this main challenge are now completed
    const allSubChallengesCompleted = allSubChallenges.every((sub: any) => 
      sub.status === 'completed'
    );

    if (allSubChallengesCompleted) {
      // Mark the main challenge as completed
      challenges[this.challengeIndex] = {
        ...mainChallenge,
        status: 'completed',
        completed: Timestamp.now(),
        completedAt: Timestamp.now() // Alternative field name like in Flutter code
      };
      
      console.log(`Main challenge ${this.challengeIndex} marked as completed - all sub-challenges finished`);
    }
    
  } else if (status === 'rework') {
    // Handle rework - preserve old result before updating status
    
    // Initialize oldresult array if it doesn't exist
    if (!subChallenge.oldresult) {
      subChallenge.oldresult = [];
    }

    // Create a map with the current result reference, date, and notes
    const oldResultEntry = {
      result: subChallenge.result, // This should be the current DocumentReference
      date: Timestamp.now(),
      notes: notes // Add notes array to the oldresult entry
    };

    // Add the old result to the array
    subChallenge.oldresult.push(oldResultEntry);

    // Update status and other fields
    subChallenge.status = status;
    subChallenge.reworkRequestedAt = Timestamp.now();
    subChallenge.reviewedby = this.currentUserId;

    // If main challenge was previously completed, revert it back since we're requesting rework
    const mainChallenge = challenges[this.challengeIndex];
    if (mainChallenge.status === 'completed') {
      challenges[this.challengeIndex] = {
        ...mainChallenge,
        status: 'inprogress', 
        completed: null, // Clear completion timestamp
        completedAt: null // Clear alternative completion timestamp
      };
      
      console.log(`Main challenge ${this.challengeIndex} reverted from completed due to rework request`);
    }
  }

  // Update the challenges array
  challenges[this.challengeIndex].challenges[this.subChallengeIndex] = subChallenge;

  // Update the document
  await updateDoc(workshopDocRef, {
    challenges: challenges
  });

  console.log(`Assignment status updated to: ${status}`);
  if (status === 'rework') {
    console.log('Old result preserved in oldresult array with notes');
  } else if (status === 'completed') {
    console.log('Sub-challenge completed, checked main challenge completion status');
  }
}
getNotePlaceholder(): string {
  if (this.isOldResult) {
    return 'Review note from previous submission';
  } else if (this.isCompletedAssignment) {
    return 'Completion note from review';
  } else {
    return 'Enter your note here...';
  }
} 
}