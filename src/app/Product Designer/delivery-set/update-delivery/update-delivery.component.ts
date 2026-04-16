import { Component, ElementRef, inject, Inject, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { Firestore,doc,collection,query,getDoc,getDocs, collectionData, collectionSnapshots, setDoc, updateDoc, orderBy } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, Validators,FormArray, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';

@Component({
  selector: 'app-update-delivery',
  imports: [
    ReactiveFormsModule,
    CommonModule,
    FormsModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatDividerModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatCheckboxModule,
    MatSlideToggleModule
  ],
  templateUrl: './update-delivery.component.html',
  styleUrl: './update-delivery.component.css'
})

export class UpdateDeliveryComponent {

  @ViewChildren('textarea0') textareas0: QueryList<ElementRef<HTMLTextAreaElement>>;
  @ViewChildren('textarea1') textareas1: QueryList<ElementRef<HTMLTextAreaElement>>;
  @ViewChildren('textarea2') textareas2: QueryList<ElementRef<HTMLTextAreaElement>>;
  @ViewChildren('textarea3') textareas3: QueryList<ElementRef<HTMLTextAreaElement>>;
  @ViewChildren('textarea4') textareas4: QueryList<ElementRef<HTMLTextAreaElement>>;

  loading:boolean = false
  selectedType = null
  typeList = ["Appointment", "Form", "Report", "Events", "Queue", "Fieldwork"]

  // Event
  eventlists = []

  // Queue
  queueLists = []

  appointmentform : FormGroup
  formform : FormGroup
  reportform : FormGroup
  eventform : FormGroup
  queueform : FormGroup
  fieldworkform : FormGroup

  get formarray():FormArray{ return this.formform.get('formarray') as FormArray }

  values={
    label:false,
    Text:false,
    Paragraph:false,
    number:false,
    DropDown:true,
    MultiSelect:true,
    date:false,
    time:false,
    Checkbox:false,
    radio:true,
    array:false,
    email:false,
    multicheckbox:true,
    video:true,
    slider:true,
    audio:true,
    // videoask:true
  }

  maxMinFor = ['MultiSelect','multicheckbox']
  flippingFor = ['MultiSelect','multicheckbox']

  keys = Object.keys(this.values)
  value_f_t = Object.keys(this.values).filter(e => this.values[e])

  // selectable = true;
  // removable = true;
  editable = true
  addOnBlur = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  Options= {}
  data = null

  private firestore = inject(Firestore)
  private destroy$ = new Subject<void>()
  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogdata:any,
    public dialogRef: MatDialogRef<any>,
    private formbuilder: FormBuilder,
    private _snackBar: MatSnackBar
  ){
    // form initiation
      this.appointmentform = this.formbuilder.group ({
        appointmentname: [, {validators: [Validators.required], updateOn : "change"}],
        duration: [, {validators: [Validators.required], updateOn:"change"}],
        ischangeworkrequired: [false, {validators: [], updateOn:"change"}],
        groupappointment: [false, {validators: [], updateOn:"change"}],
        maxbooking: [1, {validators: [], updateOn:"change"}],
        docid: [, {}]
      })

      this.formform = this.formbuilder.group ({
        formname: ['',{validators: [Validators.required], updateOn : "change"}],
        formtype:[null,{validators:[Validators.required]}],
        formfor:[null,],
        formarray:this.formbuilder.array([this.createFormarray()]),
        formdescription: [null,],
        docid: [doc(collection(this.firestore,"delivery forms")).id, {}]
      })

      this.reportform = this.formbuilder.group ({
        reportname: [,{validators: [Validators.required], updateOn : "change"}],
        // reportdescription: [null,],
        docid: [, {}]
      })

      this.eventform = this.formbuilder.group ({
        eventname: [,{validators: [Validators.required], updateOn : "change"}],
        // events: [,{validators: [Validators.required], updateOn : "change"}],
        docid: [, {}]
      })

      this.queueform = this.formbuilder.group ({
        queuename: [,{validators: [Validators.required], updateOn : "change"}],
        // queue: [null,{validators: [], updateOn : "change"}],
        // queuelist: [[],{validators: [], updateOn : "change"}],
        docid: [, {}]
      })

      this.fieldworkform = this.formbuilder.group ({
        fieldworkname: [,{validators: [Validators.required], updateOn : "change"}],
        docid: [, {}]
      })
    //
    if(dialogdata != null){
      console.log(dialogdata)
      this.data = dialogdata
      this.selectedType = dialogdata.type
      if(this.selectedType == "Appointment"){
        this.appointmentform.patchValue({
          appointmentname: dialogdata.deliveryname,
          duration: dialogdata.duration,
          ischangeworkrequired: dialogdata.ischangeworkrequired ?? false,
          groupappointment: dialogdata.groupappointment ?? false,
          maxbooking: dialogdata.maxbooking ?? null,
          docid: dialogdata.docid
        })
      }
      else if(this.selectedType == "Form"){
        const formCollectionDoc = doc(collection(this.firestore,"delivery forms"),dialogdata.docid)
        getDoc(formCollectionDoc).then(snap => {
          this.formform.patchValue({
            formname: dialogdata.deliveryname,
            formtype:[null,undefined].includes(snap.data()['formtype']) ? null : snap.data()['formtype'],
            formfor:[null,undefined].includes(snap.data()['formfor']) ? null : snap.data()['formfor'],
            formdescription:[null,undefined].includes(snap.data()['formdescription']) ? null : snap.data()['formdescription'],
            docid: dialogdata.docid
          });
          for(let i = 0;i < snap.data()['formarray'].length ; i++){
            if(snap.data()['formarray'][i].type != 'array'){
              this.formarray.at(i).patchValue({
                fieldname : snap.data()['formarray'][i].fieldname,
                fielddescription : [null,undefined].includes(snap.data()['formarray'][i]['fielddescription']) ? null : snap.data()['formarray'][i]['fielddescription'],
                fieldnotes : [null,undefined].includes(snap.data()['formarray'][i]['fieldnotes']) ? null : snap.data()['formarray'][i]['fieldnotes'],
                type:snap.data()['formarray'][i].type,
                options:snap.data()['formarray'][i].options,
                required:[null,undefined].includes(snap.data()['formarray'][i].required) ? false : snap.data()['formarray'][i].required,
                flipping:[null,undefined].includes(snap.data()['formarray'][i].flipping) ? false : snap.data()['formarray'][i].flipping,
                maxcount: [null,undefined].includes(snap.data()['formarray'][i].maxcount) ? null : snap.data()['formarray'][i].maxcount,
                mincount: [null,undefined].includes(snap.data()['formarray'][i].mincount) ? null : snap.data()['formarray'][i].mincount,
              })
              if(snap.data()['formarray'][i].flipping){
                let flippingFormGroup = (this.formarray.controls[i] as FormGroup);
                flippingFormGroup.addControl("flippingquestion",this.formbuilder.group({
                  fieldname:[snap.data()['formarray'][i]['flippingquestion']['fieldname'],{validators:[Validators.required],updateOn:"change"}],
                  fielddescription:[snap.data()['formarray'][i]['flippingquestion']['fielddescription']],
                  type:[snap.data()['formarray'][i]['flippingquestion']['type'],{validators:[Validators.required]}],
                  options:[snap.data()['formarray'][i]['flippingquestion']['options'],],
                  required:[snap.data()['formarray'][i]['flippingquestion']['required'],]
                }))
              }
            }else if(snap.data()['formarray'][i].type === 'array'){
              if(snap.data()['formarray'][i].array.length != 0){
                this.formarray.at(i).patchValue({
                  fieldname : snap.data()['formarray'][i].fieldname,
                  type:snap.data()['formarray'][i].type,
                  fielddescription : [null,undefined].includes(snap.data()['formarray'][i]['fielddescription']) ? null : snap.data()['formarray'][i]['fielddescription'],
                  fieldnotes : [null,undefined].includes(snap.data()['formarray'][i]['fieldnotes']) ? null : snap.data()['formarray'][i]['fieldnotes'],
                  maxitems: [null,undefined].includes(snap.data()['formarray'][i].maxitems) ? null : snap.data()['formarray'][i].maxitems,
                })
                for (let j = 0; j < snap.data()['formarray'][i].array.length; j++) {
                  const element = snap.data()['formarray'][i].array[j];
                  this.addSubFormControl(i).then(x => {
                    this.getSubFormArray(i).at(j).patchValue({
                      fieldname : element.fieldname,
                      type:element.type,
                      options:element.options,
                      required:element.required
                    })
                  })
                  }
              }
            }
            if(i !=  snap.data()['formarray'].length - 1){
              this.formarray.push(this.createFormarray())
            }
          }
          // this.scrollHeightTrigger(snap.data())
        })
      }
      else if(this.selectedType == "Report"){
        const reportCollectionDoc = doc(collection(this.firestore,"delivery report"),dialogdata.docid)
        getDoc(reportCollectionDoc).then(snap => {
          this.reportform.patchValue({
            reportname: dialogdata.deliveryname,
            reportdescription : [null,undefined].includes(snap.data()['reportdescription']) ? null : snap.data()['reportdescription'],
            docid: dialogdata.docid
          })
        })
      }
      else if(this.selectedType == "Events"){
        this.eventform.setValue({
          eventname: dialogdata.deliveryname,
          events: dialogdata.events,
          docid: dialogdata.docid
        })
      }
      else if(this.selectedType == "Queue"){
        this.queueform.setValue({
          queuename: dialogdata.deliveryname,
          // queue: dialogdata.queue,
          // queuelist:dialogdata.queuelist ?? [],
          docid: dialogdata.docid
        })
      }
      else if(this.selectedType == "Fieldwork"){
        this.fieldworkform.patchValue({
          fieldworkname:  dialogdata.deliveryname,
          docid: dialogdata.docid
        })
      }
    }
    //event collection
    const eventCollection = collection(this.firestore,"event collection")
    const eventQ = query(eventCollection,orderBy("name"))
    collectionSnapshots(eventQ).pipe(takeUntil(this.destroy$)).subscribe(events => {
      var data = []
      for (let i = 0; i < events.length; i++) {
        const doc = events[i];
        data.push({
          path: doc.ref.path,
          name: doc.data()["name"]
        })
      }
      this.eventlists = data
    })
    // queue generation
    const queueGenerationCollection = collection(this.firestore,"queue generation")
    const queueGenerationQ = query(queueGenerationCollection,orderBy("queuename"))
    getDocs(queueGenerationQ).then(queue => {
      var data = []
      for (let i = 0; i < queue.docs.length; i++) {
        const element = queue.docs[i];
        data.push({
          name: element.data()["queuename"],
          path: element.ref.path
        })
      }
      this.queueLists = data
    })
  }

  ngOnInit(): void {
    //form valuchanges trigger
    console.log(this.formform);
    this.formarray.valueChanges.pipe(
      debounceTime(1000),
      distinctUntilChanged()
    ).subscribe(formdata => {
      // console.log(formdata);
      this.submitForm(this.formform.value)
    })
  }

  closeDialog(){
    this.dialogRef.close()
  }

  ngAfterViewInit() {
    if(this.selectedType == "Form"){
      setTimeout(() => {
        document.getElementById('fd').style.height = 'auto'
        document.getElementById('fd').style.height = document.getElementById('fd').scrollHeight + "px"
        for (let i = 0; i < this.textareas0.length; i++) {
          this.adjustHeight0(i)
        }
        for (let i = 0; i < this.textareas1.length; i++) {
          this.adjustHeight1(i)
        }
        for (let i = 0; i < this.textareas2.length; i++) {
          this.adjustHeight2(i)
        }
        for (let i = 0; i < this.textareas3.length; i++) {
          this.adjustHeight3(i)
        }
        for (let i = 0; i < this.textareas4.length; i++) {
          this.adjustHeight4(i)
        }
      },2000)
    }
  }

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  adjustHeight0(index: number) {
    this.textareas0.toArray()[index].nativeElement.style.height = 'auto';
    this.textareas0.toArray()[index].nativeElement.style.height = this.textareas0.toArray()[index].nativeElement.scrollHeight + 'px';
  }

  adjustHeight1(index: number) {
    this.textareas1.toArray()[index].nativeElement.style.height = 'auto';
    this.textareas1.toArray()[index].nativeElement.style.height = this.textareas1.toArray()[index].nativeElement.scrollHeight + 'px';
  }

  adjustHeight2(index: number) {
    this.textareas2.toArray()[index].nativeElement.style.height = 'auto';
    this.textareas2.toArray()[index].nativeElement.style.height = this.textareas2.toArray()[index].nativeElement.scrollHeight + 'px';
  }

  adjustHeight3(index: number) {
    this.textareas3.toArray()[index].nativeElement.style.height = 'auto';
    this.textareas3.toArray()[index].nativeElement.style.height = this.textareas3.toArray()[index].nativeElement.scrollHeight + 'px';
  }

  adjustHeight4(index: number) {
    this.textareas4.toArray()[index].nativeElement.style.height = 'auto';
    this.textareas4.toArray()[index].nativeElement.style.height = this.textareas4.toArray()[index].nativeElement.scrollHeight + 'px';
  }

  submitAppointment(value){
    if(this.appointmentform.valid){
      console.log(value)
      this.loading = true
      var docid = value.docid ?? doc(collection(this.firestore,"appointmenttype")).id
      const docRef = doc(this.firestore,"appointmenttype",docid)
      setDoc(docRef,{
        appointmenttype: value.appointmentname,
        duration: value.duration,
        ischangeworkrequired: value.ischangeworkrequired,
        groupappointment: value.groupappointment,
        maxbooking: value.groupappointment ? value.maxbooking : null,
        id: docid
      },{merge:true}).then(()=>{
        this.closeDialog()
      }).catch(err=>{
        this.loading = false
        alert(err)
      })
    }
  }

  submitReport(value){
    if(this.reportform.valid){
      console.log(value)
      this.loading = true
      var docid = value.docid ?? doc(collection(this.firestore,"delivery report")).id
      const docRef = doc(this.firestore,"delivery report",docid)
      setDoc(docRef,{
        reportname: value.reportname
      },{merge:true}).then(()=>{
        this.closeDialog()
      }).catch(err=>{
        this.loading = false
        alert(err)
      })
    }
  }

  submitEvents(value){
    if(this.eventform.valid){
      console.log(value)
      this.loading = true
      var docid = value.docid ?? doc(collection(this.firestore,"delivery events")).id
      const docRef = doc(this.firestore,"delivery events",docid)
      setDoc(docRef,{
        eventname: value.eventname,
        // events: value.events.map((path) => doc(this.firestore,path))
      },{merge:true}).then(()=>{
        this.closeDialog()
      }).catch(err=>{
        this.loading = false
        alert(err)
      })
    }
  }

  submitQueue(value){
    if(this.queueform.valid){
      console.log(value)
      this.loading = true
      var docid = value.docid ?? doc(collection(this.firestore,"delivery queue")).id
      const docRef = doc(this.firestore,"delivery queue",docid)
      // var queueRefList = []
      // if(value['queuelist'].length != 0){
      //   for (let i = 0; i < value['queuelist'].length; i++) {
      //     const element = value['queuelist'][i];
      //     queueRefList.push(doc(this.firestore,element))
      //   }
      // }
      setDoc(docRef,{
        queuename: value.queuename,
        // queue: doc(this.firestore,value.queue),
        // queuelist:queueRefList
      }, {merge: true}).then(()=>{
        this.closeDialog()
      }).catch(err=>{
        this.loading = false
        alert(err)
      })
    }
  }

  submitFieldwork(value){
    if(this.fieldworkform.valid){
      console.log(value)
      this.loading = true
      var docid = value.docid ?? doc(collection(this.firestore,"delivery fieldwork")).id
      const docRef = doc(this.firestore,"delivery fieldwork",docid)
      setDoc(docRef,{
        fieldworkname: value.fieldworkname,
        docid: docid
      }, {merge: true}).then(()=>{
        this.closeDialog()
      }).catch(err=>{
        this.loading = false
        alert(err)
      })
    }
  }

  // Form Related Function start

  onTypeSelect(value,mainindex){
    if(value === 'array'){
      this.getSubFormArray(mainindex)
      this.addSubFormControl(mainindex)
    }
  }

  createFormarray(){
    return this.formbuilder.group({
      fieldname:[null,{validators:[Validators.required],updateOn:"change"}],
      fielddescription: [null],
      fieldnotes: [null],
      type:[null,{Validators:[Validators.required],updateOn:"change"}],
      options:[[],],
      maxcount:[null,],
      mincount:[null,],
      maxitems:[null,],
      flipping:[false,],
      required:[false,],
      array:this.formbuilder.array([])
    })
  }

  addarray(index){
    // this.formarray.push(this.createFormarray())
    this.formarray.insert(index+1,this.createFormarray())
  }

  removearray(index){this.formarray.removeAt(index)}

  add(event:MatChipInputEvent,i:number,type:string):void {
    // console.log(type);
    let condition:boolean = ['video','audio'].includes(type) ? this.formarray.controls[i].get('options').value.length >= 1 ? true : false : false
    // console.log("condition",condition);
    if(!condition){
      this.formarray.controls[i].get('options').value.push(event.value)
      event.input.value = null
    }else{
      alert("For video and audio type you can't enter more than one url")
      event.input.value = null;
    }
  }
​
  remove(i:number,j:number) {
    this.formarray.controls[i].get('options').value.splice(j,1)
  }
​

  getSubFormArray(mainindex):FormArray{
    return this.formarray.at(mainindex).get('array') as FormArray;
  }

  newSubFormControl():FormGroup{
   return  this.formbuilder.group({
      fieldname:[null,{validators:[Validators.required],updateOn:"change"}],
      type:[null,{Validators:[Validators.required],updateOn:"change"}],
      options:[[],],
      required:[false,],
    })
  }

  async addSubFormControl(index){
    return this.getSubFormArray(index).push(this.newSubFormControl());
  }

  removeSubFormControl(mainIndex,subIndex){
    return this.getSubFormArray(mainIndex).removeAt(subIndex)
  }

  addSubFormOption(event:MatChipInputEvent,mainindex:number,subindex:number):void {
      this.getSubFormArray(mainindex).controls[subindex].get('options').value.push(event.value.trim())
      event.value = null;
      this.submitForm(this.formform.value);
  }

  removeSubFormOption(mainindex,subindex,optionindex){
    this.getSubFormArray(mainindex).controls[subindex].get('options').value.splice(optionindex,1)
    this.submitForm(this.formform.value)
  }

  addFlippingGroup(index:number){
    let flippingFormGroup = (this.formarray.controls[index] as FormGroup);
    flippingFormGroup.addControl("flippingquestion",this.formbuilder.group({
      fieldname:[null,{validators:[Validators.required],updateOn:"change"}],
      fielddescription:[null],
      type:[null,{validators:[Validators.required]}],
      options:[[],],
      required:[false,]
    }))
  }

  addFlippingQuestionOption(event:MatChipInputEvent,arrayIndex:number){
    this.formarray.controls[arrayIndex].get("flippingquestion").get("options").value.push(event.value.trim())
    event.input.value = null
    this.submitForm(this.formform.value)
  }

  removeFlippingQuestionOption(arrayIndex:number,chipIndex:number){
    this.formarray.controls[arrayIndex].get("flippingquestion").get("options").value.splice(chipIndex,1)
    this.submitForm(this.formform.value)
  }

  onFlippingValueChange(arrayIndex:number){
    if(this.formarray.controls[arrayIndex].get('flipping').value){
      this.addFlippingGroup(arrayIndex)
    }else{
      let flippingFormGroup = (this.formarray.controls[arrayIndex] as FormGroup);
      flippingFormGroup.removeControl("flippingquestion")
    }
  }

  submitForm(value){
    if(this.formform.valid){
      console.log("Started Submitting");
      for (let i = 0; i < value.formarray.length; i++) {
        const element = value.formarray[i];
        if(!['array'].includes(element.type) && !this.value_f_t.includes(element.type)){
          element.array = []
          element.options = []
        }else if(this.value_f_t.includes(element.type)){
          element.array = []
        }else if(['array'].includes(element.type)){
          element.options = []
          for (let j = 0; j < element.array.length; j++) {
            const secElement = element.array[j];
            if(!this.value_f_t.includes(secElement.type)){
              secElement.options = []
            }
          }
        }
      }
      let col = "delivery forms"
      // this.loading = true
      var docid = value.docid ?? doc(collection(this.firestore,col)).id
      value['docid'] = docid
      console.log(value);
      const docRef = doc(this.firestore,col,docid)
      setDoc(docRef, this.stripUndefined(value), {merge:true}).then(()=>{
        console.log("Submitted");
        this.openSnackBar("Form Updated")
        // this.closeDialog()
      }).catch(err=>{
        this.loading = false
        alert(err)
      })
    }
  }
  // Add this method to the class
  private stripUndefined(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.stripUndefined(item));
    } else if (obj !== null && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => [k, this.stripUndefined(v)])
      );
    }
    return obj;
  }
  // Form Related Function End

  openSnackBar(message:string) {
    this._snackBar.open(message,null, {
      horizontalPosition:'center',
      verticalPosition: 'bottom',
      duration:500
    });
  }

  deleteForm(){
    let col = "delivery forms"
    this.loading = true
    console.log(this.data);
    if(this.data != null){
      var docid = this.data['docid']
      const docRef = doc(this.firestore,col,docid)
      updateDoc(docRef,{
        delete : true
      }).then(()=> {
        this.openSnackBar("Form Deleted")
        this.closeDialog()
      }).catch(err=>{
        this.loading = false
        alert(err)
      })
    }
  }
  // report Related Function End
}
