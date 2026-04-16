import { Component, inject, Input, OnInit, OnDestroy, Output, EventEmitter, ViewChildren, QueryList, ElementRef, signal } from '@angular/core';
import { ConnectivityAlertComponent } from './connectivity-alert.component';
import { MatDialogRef } from '@angular/material/dialog';
import { doc, Firestore , getDoc,collection , query, where, getDocs,setDoc,deleteDoc,updateDoc,arrayUnion, serverTimestamp, QueryDocumentSnapshot, waitForPendingWrites} from '@angular/fire/firestore';
import { ActivatedRoute, Router} from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FormGroup,FormBuilder, Validators, FormControl, FormArray, ReactiveFormsModule}from'@angular/forms';
import { DomSanitizer} from '@angular/platform-browser';
import { AbstractControl, ValidatorFn } from '@angular/forms';
import { MatSelectionListChange } from '@angular/material/list';
import { FormTemplatePreviewComponent } from '../form-template-preview/form-template-preview.component';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { AuthguardService } from '../../../authguard.service';
import { FormOptionComponent } from '../form-option/form-option.component';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTimepickerModule } from '@angular/material/timepicker';

function minArrayLength(min: number): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    if (control.value && control.value.length < min) {
      return { 'minArrayLength': { valid: false, actualLength: control.value.length, minCount: min } };
    }
    return null;
  };
}

function maxArrayLength(max: number): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    if (control.value && control.value.length > max) {
      return { 'maxArrayLength': { valid: false, actualLength: control.value.length, maxCount: max } };
    }
    return null;
  };
}

export interface FlippingQuestionValue {
  [key: string]: string;
}

@Component({
  selector: 'app-formtemplate',
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
    MatTimepickerModule,
    MatTooltipModule
  ],
  providers: [
    provideNativeDateAdapter()
  ],
  templateUrl: './formtemplate.component.html',
  styleUrl: './formtemplate.component.css'
})
export class FormtemplateComponent {
  @Input() participantformtemplateid:any
  @Input() inlineFormId: string = null;
  @Input() inlineQueueId: string = null;
  // clientform:any
  submittedClientForm
  showcontent : boolean = false
  deliveryForm:FormGroup
  formpatch:any
  queueId:any
  patchformid : any

  profileid: any;
  draftDocid:string
  private firestore = inject(Firestore)
  private auth = inject(AuthguardService)
  currentUserId:string
  userProfile:any
  queueData:any
  participantQueueToken:any
  // form submit
  submissionComplete: boolean = false;
  submittedFormName: string = '';

  @Input() isInline: boolean = false;
  @Output() formSubmitted = new EventEmitter<void>();

  // --- Draft save status (shown in form header) ---
  draftSaveStatus: 'idle' | 'saving' | 'saved' | 'failed' = 'idle';
  draftSavedAt: Date | null = null;
  draftSaveError: string | null = null;
  private draftSaveEpoch = 0;
  private autoSaveDebounceTimer: any = null;
  private readonly AUTOSAVE_DEBOUNCE_MS = 600;

  // --- Connectivity monitoring ---
  connectivityDialogRef: MatDialogRef<ConnectivityAlertComponent> | null = null;
  private connectivityPingTimer: any = null;
  private connectivityState: 'good' | 'bad' = 'good';
  private badSince: number | null = null;
  private readonly BAD_DEBOUNCE_MS = 3000;
  private onlineHandler = () => this.evaluateConnectivity();
  private offlineHandler = () => this.evaluateConnectivity(true);
  private connectionChangeHandler = () => this.evaluateConnectivity();

  constructor(
    private route : ActivatedRoute,
    private dialog : MatDialog,
    private fb : FormBuilder,
    private router : Router,
    public sanitizer: DomSanitizer
  ) {
    this.deliveryForm = this.fb.group({})
    this.draftDocid = doc(collection(this.firestore,"temporary_forms")).id;
  }

  closeTab(): void {
    window.close();
  }

  ngOnDestroy() {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    const conn = (navigator as any).connection;
    conn?.removeEventListener?.('change', this.connectionChangeHandler);
    if (this.connectivityPingTimer) clearInterval(this.connectivityPingTimer);
    this.connectivityDialogRef?.close();
  }

  private startConnectivityMonitoring() {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    const conn = (navigator as any).connection;
    conn?.addEventListener?.('change', this.connectionChangeHandler);
    this.connectivityPingTimer = setInterval(() => this.pingConnectivity(), 15000);
    this.evaluateConnectivity();
  }

  private async pingConnectivity() {
    if (!navigator.onLine) {
      this.evaluateConnectivity(true);
      return;
    }
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      await fetch('https://www.gstatic.com/generate_204?ts=' + started, {
        method: 'GET', cache: 'no-store', mode: 'no-cors', signal: ctrl.signal
      });
      clearTimeout(t);
      const rtt = Date.now() - started;
      this.evaluateConnectivity(false, rtt);
    } catch {
      this.evaluateConnectivity(true);
    }
  }

  private isBadConnection(forceOffline = false, rtt?: number): boolean {
    if (forceOffline || !navigator.onLine) return true;
    const conn = (navigator as any).connection;
    if (conn?.effectiveType && ['slow-2g', '2g'].includes(conn.effectiveType)) return true;
    if (conn?.downlink != null && conn.downlink > 0 && conn.downlink < 0.3) return true;
    if (rtt != null && rtt > 4000) return true;
    return false;
  }

  private evaluateConnectivity(forceOffline = false, rtt?: number) {
    const bad = this.isBadConnection(forceOffline, rtt);
    if (bad) {
      if (this.badSince == null) this.badSince = Date.now();
      const sustained = Date.now() - this.badSince >= this.BAD_DEBOUNCE_MS || forceOffline || !navigator.onLine;
      if (sustained && this.connectivityState !== 'bad') {
        this.connectivityState = 'bad';
        this.handleBadConnection();
      }
    } else {
      this.badSince = null;
      if (this.connectivityState !== 'good') {
        this.connectivityState = 'good';
        this.connectivityDialogRef?.close();
        this.connectivityDialogRef = null;
      }
    }
  }

  private async handleBadConnection() {
    if (this.formpatch) return; // preview/patch mode - no drafts
    if (this.connectivityDialogRef) return;

    const offline = !navigator.onLine;
    this.connectivityDialogRef = this.dialog.open(ConnectivityAlertComponent, {
      disableClose: true,
      width: '420px',
      data: { offline, draftStatus: 'saving' }
    });

    const inst = this.connectivityDialogRef.componentInstance;
    inst.setOffline(offline);

    if (this.showcontent && this.deliveryForm) {
      inst.setDraftStatus('saving');
      try {
        // Cancel any pending debounced save; force an immediate one so the draft
        // is guaranteed in-flight before we block the UI.
        if (this.autoSaveDebounceTimer) {
          clearTimeout(this.autoSaveDebounceTimer);
          this.autoSaveDebounceTimer = null;
        }
        await this._performAutoSave(this.deliveryForm.getRawValue());
        inst.setDraftStatus('saved');
      } catch (err) {
        console.error('Draft save failed during bad connection:', err);
        inst.setDraftStatus('failed');
      }
    } else {
      inst.setDraftStatus('idle');
    }

    inst.setOffline(!navigator.onLine);
  }

  async ngOnInit() {
    this.startConnectivityMonitoring();
     // Get queue ID from route params
    this.queueId = this.inlineQueueId ?? this.route.snapshot.queryParams['queueid'] ?? null;
    this.formpatch = ![null,undefined].includes(this.route.snapshot.queryParams['patchdata']) ? true : (![null,undefined].includes(this.participantformtemplateid) ? true : false)

    // Get user ID and roles in constructor
    await this.initializeUserData();

    // If queue ID exists, fetch queue data
    if (this.queueId) {
      await this.initializeQueueData();
    }
  }

  ngAfterViewInit(){
    // console.log(" ngAfterViewInit participantformtemplateid",this.participantformtemplateid);

    // console.log(this.formpatch);
    // this.queueId = this.route.snapshot.queryParams['queueid'] ?? null
    this.patchformid = this.inlineFormId ?? this.route.snapshot.queryParams['id']
    this.getFormsOption();
    this.profileid = this.route.snapshot.queryParams['profileid'] ?? null
    console.log(this.route.snapshot.queryParams['patchdata']);
    // console.log("queueid",this.queueId);
    console.log(this.route.snapshot.queryParams['id'], "---", this.participantformtemplateid?.formid)

    const deliveryFormsId = this.inlineFormId ?? this.route.snapshot.queryParams['id'] ?? this.participantformtemplateid?.formid
    const deliveryFormCollectionDoc = doc(collection(this.firestore,'delivery forms'),deliveryFormsId)
    getDoc(deliveryFormCollectionDoc).then(async snap => {
      this.submittedClientForm = snap.data()
      console.log('from : ',this.submittedClientForm.formarray)
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
        let formsByClientPath = ![null,undefined].includes(this.participantformtemplateid) ? doc(this.firestore,"formsByClient",this.participantformtemplateid.docid).path  : null
        getDoc(doc(this.firestore,this.route.snapshot.queryParams['patchdata'] ?? formsByClientPath)).then(async formsByClientSnap => {
          //form setup start
          this.submittedClientForm = formsByClientSnap.data()
           console.log('from : ',this.submittedClientForm.formarray)
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
      this.submittedClientForm['formarray'] = this.submittedClientForm['formarray']?.map((form)=>{
        if(['video'].includes(form.type)){
          let url = form.options[0];
          url += (url.includes('?')?'&':'?') + 'ngsw-bypass';
          form.options = [url]
        }
        return form
      })
      // console.log('modified : ',this.submittedClientForm)
    })
  }
  // url + (url.includes('?')?'&':'?') + 'ngsw-bypass';
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
      const queueDocRef = doc(this.firestore, 'queue generation', this.queueId!);
      const queueDoc = await getDoc(queueDocRef);

      if (queueDoc.exists()) {
        this.queueData = queueDoc.data();
      }

      // Get participant queue token
      const tokenCollectionRef = collection(this.firestore, 'queue_token');
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

    if (![null, undefined, '', 0, false].includes(item?.mincount)) {
      validators.push(minArrayLength(item.mincount!));
    }

    if (![null, undefined, '', 0, false].includes(item?.maxcount)) {
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
    if (this.deliveryForm.invalid) {
      this.deliveryForm.markAllAsTouched();
      const firstInvalidControl = Object.keys(this.deliveryForm.controls).find(
        key => this.deliveryForm.controls[key].invalid
      );
      if (firstInvalidControl) {
        const el = document.querySelector(
          `[formcontrolname="${firstInvalidControl}"], [ng-reflect-name="${firstInvalidControl}"]`
        );
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (el as HTMLElement).focus?.();
        }
      }
      return;
    }
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
      this.submittedClientForm['formid'] = this.inlineFormId ?? this.patchformid ?? null;

      console.log(this.submittedClientForm);

      // Submit the form
      await this.submitFormData(nextstage);

      loadingRef.close();
      if (this.queueId) {
        this.submittedFormName = this.submittedClientForm['formname'];
        this.submissionComplete = true;
        if (this.isInline) {
          setTimeout(() => {
            this.formSubmitted.emit();
          }, 1500);
        }
      } else {
        this.router.navigateByUrl("/");
      }

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
      const queueDocRef = doc(this.firestore, 'queue generation', this.queueId);
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
      const variationDocRef = doc(this.firestore, 'queue variation', variationId);
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
    console.log("submitformdata", this.submittedClientForm['docid']);
    const formDocRef = doc(this.firestore, 'formsByClient', this.submittedClientForm['docid']);
    await setDoc(formDocRef, this.submittedClientForm);

    // Delete draft
    if (this.draftDocid) {
      const draftDocRef = doc(this.firestore, 'temporary_forms', this.draftDocid);
      await deleteDoc(draftDocRef);
      console.log("Draft deleted");
    }

    // Handle post-submission updates
    if (!this.queueId && this.route.snapshot.queryParams['data']) {
      // Update delivery status for non-queue submissions
      const dataDocRef = doc(this.firestore, this.route.snapshot.queryParams['data']);
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
    const tokenDocRef = doc(this.firestore, 'queue_token', this.participantQueueToken.docid);
    await updateDoc(tokenDocRef, updatedData);

    // Create stage log
    const logDocId = doc(collection(this.firestore, 'queue stage log')).id;
    const logDocRef = doc(this.firestore, 'queue stage log', logDocId);
    updatedData["logdocid"] = logDocId;
    updatedData["movedby"] = this.profileid
    updatedData["movedthrough"] = 'form'
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
          const existingFormDocRef = doc(this.firestore, patchDataPath);
          const existingFormDoc = await getDoc(existingFormDocRef);

          if (existingFormDoc.exists()) {
            // Create log entry in formsByClient log collection
            const logDocRef = doc(this.firestore, 'formsByClient log', this.draftDocid);
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

          console.log('this submitedclientform : ',this.submittedClientForm);

          // Set form metadata
          this.submittedClientForm['docid'] = this.draftDocid;

          // Get user roles for editedby field
          const roles = await this.auth.getRoles();
          this.submittedClientForm["editedby"] = roles.profile_ref.id;

          this.submittedClientForm['date'] = new Date();
          this.submittedClientForm['formid'] = this.inlineFormId ?? this.patchformid ?? null;
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

  autoSave(value: any) {
    // Debounce: reset the timer on every keystroke; only actually save once
    // the user pauses typing for AUTOSAVE_DEBOUNCE_MS.
    this.draftSaveStatus = 'saving';
    if (this.autoSaveDebounceTimer) clearTimeout(this.autoSaveDebounceTimer);
    this.autoSaveDebounceTimer = setTimeout(() => {
      this.autoSaveDebounceTimer = null;
      this._performAutoSave(value).catch(() => {});
    }, this.AUTOSAVE_DEBOUNCE_MS);
  }

  private async _performAutoSave(value: any) {
    console.log(value);
    console.log(this.submittedClientForm)

    const myEpoch = ++this.draftSaveEpoch;
    this.draftSaveStatus = 'saving';
    this.draftSaveError = null;

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
      this.submittedClientForm['formid'] = this.inlineFormId ?? this.patchformid ?? null;

      console.log(this.submittedClientForm);

      // Save to temporary_forms collection using modern Firebase syntax
      const tempFormDocRef = doc(this.firestore, 'temporary_forms', this.draftDocid);
      // Fire the local write (resolves from local cache quickly).
      setDoc(tempFormDocRef, this.submittedClientForm, { merge: true })
        .catch(err => {
          console.error("setDoc failed:", err);
          if (myEpoch === this.draftSaveEpoch) {
            this.draftSaveStatus = 'failed';
            this.draftSaveError = err?.message ?? 'Unknown error';
          }
        });

      // Wait until Firestore has actually acknowledged ALL pending writes from the server.
      // This is what guarantees the draft is really in the DB, not just queued locally.
      await waitForPendingWrites(this.firestore);

      // Only the latest autoSave call may flip to 'saved' — stale earlier calls are ignored.
      if (myEpoch === this.draftSaveEpoch) {
        this.draftSaveStatus = 'saved';
        this.draftSavedAt = new Date();
        console.log("Temporary form submitted (server-acked)");
      }

    } catch (error: any) {
      console.error("Error during auto save:", error);
      if (myEpoch === this.draftSaveEpoch) {
        this.draftSaveStatus = 'failed';
        this.draftSaveError = error?.message ?? 'Unknown error';
      }
      throw error;
    }
  }

  async getFormsOption() {
    if(this.formpatch) {
      console.log("This is a preview form. Drafts are disabled.")
      return
    }
    console.log("Forms Draft");

    try {
      const draftforms: QueryDocumentSnapshot[] = [];
      console.log(this.profileid);

      // Query temporary_forms collection with modern Firebase syntax
      const tempFormsCollectionRef = collection(this.firestore, 'temporary_forms');
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
                const form = draftforms[0].data();
                this.draftDocid = form['docid'];

        const sortedDrafts = draftforms.sort((a, b) => {
          const dateA = a.data()['date']?.toDate()?.getTime() ?? 0;
          const dateB = b.data()['date']?.toDate()?.getTime() ?? 0;
          return dateB - dateA;
        });

        const dialogRef = this.dialog.open(FormOptionComponent, {
          data: { drafts: [sortedDrafts[0]] },
          disableClose: true
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (result && result.type === 'draft') {
            const selectedDraft = result.doc.data();
            this.draftDocid = selectedDraft['docid'];

            let h = 0;
            for (let i = 0; i < selectedDraft['formarray'].length; i++) {
              const element = selectedDraft['formarray'][i];
              if (!['label', 'video', 'audio'].includes(element['type'])) {
                element['formcontrol'] = `control${h}`;
                h++;
                if (!['array', 'date'].includes(element['type'])) {
                  this.deliveryForm.get(element['formcontrol'])?.patchValue(element['value'] ?? null);
                  if (element['flipping'] === true) {
                    this.submittedClientForm.formarray[i]['flippingquestion']['value'] = element['flippingquestion']['value'] || {};
                  }
                } else if (element['type'] === 'date') {
                  const dateValue = (element['value'] !== undefined && element['value'] !== null)
                    ? element['value']?.toDate() : null;
                  this.deliveryForm.get(element['formcontrol'])?.patchValue(dateValue);
                } else if (element['type'] === 'array') {
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

}
