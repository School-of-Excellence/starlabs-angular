import { Component, Input, OnInit } from '@angular/core';
import { arrayUnion, collection, doc, Firestore, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FormGroup, FormBuilder, Validators, FormControl, FormArray, ReactiveFormsModule } from '@angular/forms';
import { SafeResourceUrl, DomSanitizer } from '@angular/platform-browser';
import { AbstractControl, ValidatorFn } from '@angular/forms';
import { MatSlider, MatSliderModule } from '@angular/material/slider';
import { MatListModule, MatListOption, MatSelectionListChange } from '@angular/material/list';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { FormOptionComponent } from '../../Product Designer/delivery-set/form-option/form-option.component';
import { AuthguardService } from '../../authguard.service';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';

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

@Component({
  selector: 'app-form-based-submission',
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule,
    MatDatepickerModule,
    MatSelectModule,
    MatListModule,
    MatRadioModule,
    MatSliderModule

  ],
  templateUrl: './form-based-submission.component.html',
  styleUrl: './form-based-submission.component.css'
})
export class FormBasedSubmissionComponent {

  @Input() participantformtemplateid: any
  clientform: any
  submittedClientForm
  showcontent: boolean = false
  reviewLastForm: boolean;
  viewFilledForm: boolean;
  viewCompleted: boolean;
  reviewNotes: [];
  deliveryForm: FormGroup
  formpatch: any
  queueId: any
  participantAssignmentId: any
  patchformid: any
  reviewAccess: boolean = false;
  submissionAccess: boolean = false;
  profileid: any;
  draftDocid
  cohortsref: any;
  marathonref: any;
  currentstatus: any;
  loggedInProfileId: any = null
  constructor(
    private route: ActivatedRoute,
    private afs: Firestore,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private auth: AuthguardService,
    private router: Router,
    public sanitizer: DomSanitizer
  ) {
    this.deliveryForm = this.fb.group({})
    this.draftDocid = doc(collection(this.afs, 'bigformassignment')).id;
    this.auth.getRoles().then(async roles => {
      if (roles["ah"] || roles["admin"] || roles["developer"]) {
        this.reviewAccess = true;
      }
      else {
        this.reviewAccess = false;
      }
      if (roles['profile_ref'].id === this.route.snapshot.queryParams['profileid']) {
        // console.log("access")
        this.submissionAccess = true
      } else {
        this.submissionAccess = false
        // alert("Unauthorized Access")
        // this.router.navigateByUrl('/')
      }
      this.loggedInProfileId = roles['profile_ref'].id
      console.log("profileid from url", this.route.snapshot.queryParams['profileid']);
      console.log("loggedInProfileIdloggedInProfileId", this.loggedInProfileId);
    })
  }
  initForm() {
    this.notesForm = this.fb.group({
      notes: this.fb.array([
        this.createNoteControl()
      ])
    });
  }
  ngOnInit(): void {
    this.initForm();

    // this.deliveryForm.valueChanges.pipe(
    //   debounceTime(1000),
    //   distinctUntilChanged()
    // ).subscribe((formData:any) => {
    //   this.autoSave(this.deliveryForm.value);
    // })
  }



  ngAfterViewInit() {
    // console.log(" ngAfterViewInit participantformtemplateid",this.participantformtemplateid);
    this.formpatch = ![null, undefined].includes(this.route.snapshot.queryParams['patchdata']) ? true : (![null, undefined].includes(this.participantformtemplateid) ? true : false)
    // console.log(this.formpatch);
    this.queueId = this.route.snapshot.queryParams['queueid'] ?? null
    this.patchformid = this.route.snapshot.queryParams['id']
    this.profileid = this.route.snapshot.queryParams['profileid'] ?? null
    this.participantAssignmentId = this.route.snapshot.queryParams['participantAssignmentId']
    console.log("patch dataaa", this.route.snapshot.queryParams['patchdata']);
    // console.log("queueid",this.queueId);
    console.log(this.route.snapshot.queryParams['id'], "---", this.participantformtemplateid?.formid)
    console.log(this.participantAssignmentId, 'this.participantAssignmentId');
    console.log(this.profileid, 'this.profileid');
    console.log(this.participantformtemplateid, 'this.participantformtemplateid');
    console.log("reviewform notes", this.route.snapshot.queryParams['reviewNotes']);
    this.reviewLastForm = this.route.snapshot.queryParams['reviewLast']
    this.viewFilledForm = this.route.snapshot.queryParams['viewFilledForm']
    this.viewCompleted = this.route.snapshot.queryParams['viewCompleted']
    this.reviewNotes = this.route.snapshot.queryParams['reviewNotes'] ? JSON.parse(decodeURIComponent(this.route.snapshot.queryParams['reviewNotes'])) : [];

    // console.log(this.profileid, 'this.profileid');


    getDoc(doc(this.afs, 'big participants assignments', this.participantAssignmentId)).then(res => {
      console.log(res.data());
      this.currentstatus = res.data()['status']
      this.cohortsref = res.data()['cohortsref']
      this.marathonref = res.data()['marathonref']
    })
    getDoc(doc(this.afs, 'delivery forms', this.route.snapshot.queryParams['id'] ?? this.participantformtemplateid.formid)).then(async snap => {
      this.submittedClientForm = snap.data()
      this.dialog.closeAll()
      if ([null, undefined].includes(this.route.snapshot.queryParams['patchdata']) && [null, undefined].includes(this.participantformtemplateid)) {
        // console.log("new");
        this.clientform = snap.data()
        let n = 0
        for (let i = 0; i < this.clientform.formarray.length; i++) {
          const item = this.clientform.formarray[i];
          if (!['label', 'video', 'audio'].includes(item.type)) {
            this.clientform.formarray[i]['formcontrol'] = `control${n}`
            n++
            if (!['email', 'array', 'Checkbox', 'multicheckbox'].includes(item.type)) {
              this.deliveryForm.addControl(item.formcontrol, item.required ? new FormControl(null, Validators.required) : new FormControl(null,))
            } else if (['email'].includes(item.type)) {
              this.deliveryForm.addControl(item.formcontrol, item.required ? new FormControl(null, [Validators.required, Validators.email]) : new FormControl(null,))
            } else if (['Checkbox'].includes(item.type)) {
              this.deliveryForm.addControl(item.formcontrol, item.required ? new FormControl(false, Validators.requiredTrue) : new FormControl(false,))
            } else if (['multicheckbox'].includes(item.type)) {
              this.deliveryForm.addControl(item.formcontrol, item.required ? new FormControl([],
                [Validators.required, item.mincount != undefined ? minArrayLength(item.mincount) : null, item.maxcount != undefined ? maxArrayLength(item.maxcount) : null]) : new FormControl([],))
            } else if (['array'].includes(item.type)) {
              this.deliveryForm.addControl(item.formcontrol, new FormArray([
                this.createFormArray(item.formcontrol, item.array)
              ]))
            }
          }
        }
        this.showcontent = true
      } else if (![null, undefined].includes(this.route.snapshot.queryParams['patchdata']) || ![null, undefined].includes(this.participantformtemplateid)) {
        // console.log("view");
        // let formsByClientPath = ![null,undefined].includes(this.participantformtemplateid) ? this.afs.collection("bigformassignment").doc(this.participantformtemplateid.docid).ref.path : null
        let formsByClientPath = doc(this.afs, "bigformassignment", this.route.snapshot.queryParams['patchdata'])
        getDoc(formsByClientPath).then(async formsByClientSnap => {
          // this.afs.doc(this.route.snapshot.queryParams.patchdata ?? formsByClientPath).get().toPromise().then(async formsByClientSnap => {
          //form setup start
          this.clientform = formsByClientSnap.data()
          let n = 0
          for (let i = 0; i < this.clientform['formarray'].length; i++) {
            const item = this.clientform['formarray'][i];
            console.log(item);

            if (!['label', 'video', 'audio'].includes(item.type)) {
              item['formcontrol'] = `control${n}`
              n++
              if (!['email', 'array', 'Checkbox', 'multicheckbox'].includes(item.type)) {
                this.deliveryForm.addControl(item.formcontrol, item.required ? new FormControl(null, Validators.required) : new FormControl(null,))
              } else if (['email'].includes(item.type)) {
                this.deliveryForm.addControl(item.formcontrol, item.required ? new FormControl(null, [Validators.required, Validators.email]) : new FormControl(null,))
              } else if (['Checkbox'].includes(item.type)) {
                this.deliveryForm.addControl(item.formcontrol, item.required ? new FormControl(false, Validators.requiredTrue) : new FormControl(false,))
              } else if (['multicheckbox'].includes(item.type)) {
                this.deliveryForm.addControl(item.formcontrol, item.required ? new FormControl([],
                  [Validators.required, item.mincount != undefined ? minArrayLength(item.mincount) : null, item.maxcount != undefined ? maxArrayLength(item.maxcount) : null]) : new FormControl([],))
              } else if (['array'].includes(item.type)) {
                this.deliveryForm.addControl(item.formcontrol, new FormArray([
                  this.createFormArray(item.formcontrol, item.array)
                ]))
              }
            }
          }
          //form setup ended and form patch started
          n = 0
          for (let i = 0; i < this.clientform['formarray'].length; i++) {
            const element = this.clientform['formarray'][i];
            if (!['label', 'video', 'audio'].includes(element['type'])) {
              element['formcontrol'] = `control${n}`
              n++
              if (!['array', 'date'].includes(element['type'])) {
                this.deliveryForm.get(element['formcontrol']).patchValue(element['value'] ?? null)
              } else if (element['type'] == 'date') {
                this.deliveryForm.get(element['formcontrol']).patchValue(element['value'] != undefined && element['value'] != null ? element['value']?.toDate() : null)
              } else if (element['type'] == 'array') {
                for (let j = 0; j < element['value'].length; j++) {
                  if (j != 0) {
                    this.onAdd(element['formcontrol'], element['array'])
                  }
                  for (let k = 0; k < element['array'].length; k++) {
                    const arrayelement = element['array'][k];
                    arrayelement['formarraycontrol'] = `arraycontrol${k}`
                    let x = this.deliveryForm.get(element['formcontrol']) as FormArray
                    if (!['date', 'label', 'array'].includes(arrayelement['type'])) {
                      x.at(j)?.get(arrayelement['formarraycontrol']).patchValue(element['value'][j][arrayelement['fieldname']] ?? element['value'][j][arrayelement['formarraycontrol']] ?? null)
                    } else if (arrayelement['type'] == 'date') {
                      x.at(j)?.get(arrayelement['formarraycontrol']).patchValue(element['value'][j][arrayelement['fieldname']] != undefined ? element['value'][j][arrayelement['fieldname']]?.toDate() : element['value'][j][arrayelement['formarraycontrol']]?.toDate() ?? null)
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
    }).then(() => {
      this.getFormsOption();
    })
  }

  createFormArray(fieldcontrol, array) {
    fieldcontrol = this.fb.group({})
    for (let i = 0; i < array.length; i++) {
      const option = array[i];
      option['formarraycontrol'] = `arraycontrol${i}`
      if (!['email', 'Checkbox'].includes(option.type)) {
        fieldcontrol.addControl(option.formarraycontrol, option.required ? new FormControl(null, Validators.required) : new FormControl(null,))
      } else if (['email'].includes(option.type)) {
        fieldcontrol.addControl(option.formarraycontrol, option.required ? new FormControl(null, [Validators.required, Validators.email]) : new FormControl(null,))
      } else if (['Checkbox'].includes(option.type)) {
        fieldcontrol.addControl(option.formarraycontrol, option.required ? new FormControl(false, Validators.requiredTrue) : new FormControl(false,))
      }
    }
    return fieldcontrol
  }

  onMultiSelectionChange(event: MatSelectionListChange, formcontrol: string, formobj: any) {
    if (formobj['flipping'] == true) {
      formobj['flippingquestion']['value'] = formobj['flippingquestion']['value'] || {}
      const obj = {}
      for (let i = 0; i < event.source._value.length; i++) {
        const element = event.source._value[i];
        if (i < 3) {
          obj[element] = formobj['flippingquestion']['value'][element] || formobj['flippingquestion']['options'][0]
        }
      }
      formobj['flippingquestion']['value'] = Object.assign({}, obj)
    }
  }

  onSliderValueChange(event, control, array) {
    control.value = array[event.value - 1]
  }

  onSliderFlippingValueChange(event, flippingvalue, formobj) {
    formobj['flippingquestion']['value'][flippingvalue] = formobj['flippingquestion']['options'][event.value - 1]
  }

  onAdd(fieldname, array) {
    let y = this.deliveryForm.get(fieldname) as FormArray
    y.push(this.createFormArray(fieldname, array))
  }

  onRemove(fieldname, index) {
    let y = this.deliveryForm.get(fieldname) as FormArray
    y.removeAt(index)
  }

  async onSubmit(value: any) {
    if (confirm("Are You Sure ? ")) {
      this.deliveryForm.reset()
      const loadingRef = this.dialog.open(LoadingProgressComponent, {
        data: { msg: "Submitting Please Wait ..." },
        disableClose: true
      })
      console.log(value);
      let n = 0
      for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
        const element = this.submittedClientForm.formarray[i];
        if (!['label', 'video', 'audio'].includes(element['type'])) {
          element["value"] = (value[`control${n}`] != undefined || value[`control${n}`] != null) ? value[`control${n}`] : null
          n++
        }
      }
      // in type array value object key stored as arraycontrol below code to update formcontroname to field name
      for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
        const formelement = this.submittedClientForm.formarray[i]
        if (formelement['type'] === 'array') {
          // console.log(formelement['type']);
          // console.log(formelement);
          if (![null, undefined].includes(this.submittedClientForm.formarray[i]['value'])) {
            for (let j = 0; j < this.submittedClientForm.formarray[i]['value'].length; j++) {
              for (const key in this.submittedClientForm.formarray[i]['value'][j]) {
                let index = Object.keys(this.submittedClientForm.formarray[i]['value'][j]).indexOf(key)
                // console.log(index);
                let formcontrol = `arraycontrol${index}`
                this.submittedClientForm.formarray[i]['value'][j][formelement['array'][index]['fieldname']] = this.submittedClientForm.formarray[i]['value'][j][formcontrol]
                // delete this.submittedClientForm.formarray[i]['value'][j][formcontrol]
              }
            }
            for (let j = 0; j < this.submittedClientForm.formarray[i]['value'].length; j++) {
              for (const key in this.submittedClientForm.formarray[i]['value'][j]) {
                let index = Object.keys(this.submittedClientForm.formarray[i]['value'][j]).indexOf(key)
                // console.log(index);
                let formcontrol = `arraycontrol${index}`
                // this.submittedClientForm.formarray[i]['value'][j][formelement['array'][index]['fieldname']] = this.submittedClientForm.formarray[i]['value'][j][formcontrol]
                delete this.submittedClientForm.formarray[i]['value'][j][formcontrol]
              }
            }
          }
        }
      }
      // console.log(this.submittedClientForm);
      // this.submittedClientForm['formvalue'] = value
      await this.auth.getuid().then(e => { this.submittedClientForm['loginid'] = e })
      //harish
      await this.auth.getRoles().then(e => { this.submittedClientForm['profileid'] = this.profileid == null ? e.profile_ref.id : this.profileid })
      let queuelist = null
      let nextstage = null
      let participantQueueToken = null
      this.submittedClientForm['date'] = new Date()
      this.submittedClientForm['docid'] = this.draftDocid
      this.submittedClientForm['formid'] = this.clientform['docid']
      this.submittedClientForm["submittedin"] = "starlabs"
      this.submittedClientForm["assignmentid"] = this.queueId
      this.submittedClientForm['participantassignmentid'] = this.participantAssignmentId
      this.submittedClientForm['marathonref'] = this.marathonref
      this.submittedClientForm['cohortsref'] = this.cohortsref
      console.log(this.submittedClientForm);
      loadingRef.close()
      await setDoc(doc(this.afs, 'bigformassignment', this.submittedClientForm['docid']), this.submittedClientForm).then(async () => {
        const activityref = doc(this.afs, 'bigformassignment', this.submittedClientForm['docid']);
        const formTemplate = this.submittedClientForm['formid'];
        await updateDoc(doc(this.afs, "big participants assignments", this.participantAssignmentId), {
          status: "review",
          activityref: activityref,
          formtemplate: formTemplate
        }).then(() => {
          console.log("status updated ");
        }).catch(err => {
          console.log(err)
        });
        // tempory forms deleting selected draft
        // await this.afs.collection("big_temporary_forms").doc(this.draftDocid).delete().then(()=>{console.log("Draft delected")}).catch((error)=>{console.log(error,"Error while deleting draft")});
        //nanda delete draft
        try {
          const draftQuery = await getDocs(query(collection(this.afs, "big_temporary_forms"),
            where("formid", "==", this.patchformid || this.clientform['docid']),
            where("profileid", "==", this.profileid)
          ));
          const batch = writeBatch(this.afs);
          draftQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          console.log(`Deleted ${draftQuery.docs.length} draft documents`);
        } catch (error) {
          console.error("Error deleting drafts:", error);
        }
        let Ref = doc(this.afs, 'bigformassignment', this.submittedClientForm['docid'])
        if ([null, undefined].includes(this.queueId) && ![null, undefined].includes(this.route.snapshot.queryParams['data'])) {
          await updateDoc(doc(this.route.snapshot.queryParams['data']), {
            fileref: arrayUnion(Ref),
            status: "completed"
          })
          await this.auth.updateDeliveryStatus(Ref.path, "completed")
        } else {
          if (participantQueueToken != null) {
            /* updating queue token and log */
            let token = {
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
            }
            let data = { ...participantQueueToken, ...token }
            
            await updateDoc(doc(this.afs, "queue_token", data["docid"]), data).catch(err => {
              console.log(err);
            });
            var logdocid = doc(collection(this.afs, 'queue stage log')).id;
            data["logdocid"] = logdocid;
            data["movedby"] = this.loggedInProfileId
            data["movedthrough"] = 'form'
            await setDoc(doc(this.afs, "queue stage log", logdocid), data).catch(err => {
              console.log(err);
            });
            /* end*/
          }
        }
        loadingRef.close()
        this.router.navigateByUrl("/")
      }).catch(err => {
        console.log(err);
      })
    }
  }

  async onUpdate(value: any) {
    console.log(value);

    if (confirm("Are You Sure ? ")) {
      // this.deliveryForm.reset()
      const loadingRef = this.dialog.open(LoadingProgressComponent, {
        data: { msg: "Submitting Please Wait ..." },
        disableClose: true
      })

      // let path = this.route.snapshot.queryParams.patchdata;
      // let parts = path.split("/");
      // let id = parts[1];
      // console.log(id);



      let n = 0
      for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
        const element = this.submittedClientForm.formarray[i];
        if (!['label', 'video', 'audio'].includes(element['type'])) {
          element["value"] = (value[`control${n}`] != undefined || value[`control${n}`] != null) ? value[`control${n}`] : null
          n++
        }
      }
      console.log("second loop started");

      // in type array value object key stored as arraycontrol below code to update formcontroname to field name
      for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
        const formelement = this.submittedClientForm.formarray[i]
        if (formelement['type'] === 'array') {
          // console.log(formelement['type']);
          // console.log(formelement);
          if (![null, undefined].includes(this.submittedClientForm.formarray[i]['value'])) {
            for (let j = 0; j < this.submittedClientForm.formarray[i]['value'].length; j++) {
              for (const key in this.submittedClientForm.formarray[i]['value'][j]) {
                let index = Object.keys(this.submittedClientForm.formarray[i]['value'][j]).indexOf(key)
                // console.log(index);
                let formcontrol = `arraycontrol${index}`
                this.submittedClientForm.formarray[i]['value'][j][formelement['array'][index]['fieldname']] = this.submittedClientForm.formarray[i]['value'][j][formcontrol]
                // delete this.submittedClientForm.formarray[i]['value'][j][formcontrol]
              }
            }
            for (let j = 0; j < this.submittedClientForm.formarray[i]['value'].length; j++) {
              for (const key in this.submittedClientForm.formarray[i]['value'][j]) {
                let index = Object.keys(this.submittedClientForm.formarray[i]['value'][j]).indexOf(key)
                // console.log(index);
                let formcontrol = `arraycontrol${index}`
                // this.submittedClientForm.formarray[i]['value'][j][formelement['array'][index]['fieldname']] = this.submittedClientForm.formarray[i]['value'][j][formcontrol]
                delete this.submittedClientForm.formarray[i]['value'][j][formcontrol]
              }
            }
          }
        }
      }
      console.log(this.submittedClientForm);


      // await this.auth.getuid().then(e => {this.submittedClientForm['loginid'] = e})
      this.submittedClientForm['docid'] = this.draftDocid
      await this.auth.getRoles().then(e => { this.submittedClientForm["editedby"] = e.profile_ref.id })
      this.submittedClientForm['date'] = new Date()
      this.submittedClientForm['formid'] = this.patchformid
      this.submittedClientForm["submittedin"] = "starlabs"
      this.submittedClientForm["assignmentid"] = this.queueId
      this.submittedClientForm['participantassignmentid'] = this.participantAssignmentId
      this.submittedClientForm['marathonref'] = this.marathonref
      this.submittedClientForm['cohortsref'] = this.cohortsref
      console.log(this.submittedClientForm);
      await setDoc(doc(this.route.snapshot.queryParams['patchdata']), this.submittedClientForm, { merge: true })
      loadingRef.close()
    }
  }

  async autoSave(value) {
    if (this.submissionAccess) {
      if (!this.formpatch) {
        console.log("Auto Saving not patch", this.submissionAccess, this.formpatch);
        console.log(value);
        let e = 0;
        for (let i = 0; i < this.submittedClientForm.formarray.length; i++) {
          const element = this.submittedClientForm.formarray[i];
          if (!['label', 'video', 'audio'].includes(element['type'])) {
            console.log(value[`control${e}`]);

            element["value"] = (value[`control${e}`] != undefined || value[`control${e}`] != null) ? value[`control${e}`] : null
            e++
          }
        }

        await this.auth.getRoles().then(e => { this.submittedClientForm['profileid'] = this.profileid == null ? e.profile_ref.id : this.profileid });
        console.log("Auto Saving Started");
        // this.submittedClientForm['queueid'] = this.queueId;
        this.submittedClientForm['date'] = new Date();
        this.submittedClientForm['docid'] = this.draftDocid
        this.submittedClientForm['formid'] = this.patchformid
        console.log(this.submittedClientForm)
        await setDoc(doc(this.afs, "big_temporary_forms", this.draftDocid), this.submittedClientForm, { merge: true }).then(() => {
          console.log("Temporary form submitted ");
        }).catch(err => {
          console.log(err)
        });
        if (this.currentstatus != 'ongoing') {
          await updateDoc(doc(this.afs, "big participants assignments", this.participantAssignmentId), {
            status: "ongoing"
          }).then(() => {
            console.log("status updated ");
          }).catch(err => {
            console.log(err)
          });
        }
      } else {
        console.log("no auto save when patch");

      }
    } else {
      console.log("No access different profile");

    }
  }

  async getFormsOption() {
    console.log("Forms Draft");
    var draftforms = [];
    await getDocs(query(collection(this.afs, "big_temporary_forms"), where("formid", "==", this.patchformid), where("profileid", "==", this.profileid))).then(draft => {
      if (draft.docs.length != 0) {
        for (let k = 0; k < draft.docs.length; k++) {
          const draftDoc = draft.docs[k];
          draftforms.push(draftDoc)
        }
      } else {
        console.log("No Drafts Found");
      }
    });
    if (draftforms.length != 0) {
      var dialogRef = this.dialog.open(FormOptionComponent, {
        data: {
          drafts: draftforms,
          mapProfile: {}
        },
        autoFocus: false,
        maxHeight: "90vh",
        disableClose: true
      })
      firstValueFrom(dialogRef.afterClosed()).then(selectedForm => {
        if (selectedForm != null) {
          // this.submittedClientForm['docid'] = selectedForm['docid']
          var form = selectedForm.doc.data();
          this.draftDocid = form['docid']

          let h = 0
          for (let i = 0; i < form['formarray'].length; i++) {
            const element = form['formarray'][i];
            if (!['label', 'video', 'audio'].includes(element['type'])) {
              element['formcontrol'] = `control${h}`
              h++
              if (!['array', 'date'].includes(element['type'])) {
                this.deliveryForm.get(element['formcontrol']).patchValue(element['value'] ?? null)
              } else if (element['type'] == 'date') {
                this.deliveryForm.get(element['formcontrol']).patchValue(element['value'] != undefined && element['value'] != null ? element['value']?.toDate() : null)
              } else if (element['type'] == 'array') {
                for (let j = 0; j < element['value'].length; j++) {
                  if (j != 0) {
                    this.onAdd(element['formcontrol'], element['array'])
                  }
                  for (let k = 0; k < element['array'].length; k++) {
                    const arrayelement = element['array'][k];
                    arrayelement['formarraycontrol'] = `arraycontrol${k}`
                    let x = this.deliveryForm.get(element['formcontrol']) as FormArray
                    if (!['date', 'label', 'array'].includes(arrayelement['type'])) {
                      x.at(j)?.get(arrayelement['formarraycontrol']).patchValue(element['value'][j][arrayelement['fieldname']] ?? element['value'][j][arrayelement['formarraycontrol']] ?? null)
                    } else if (arrayelement['type'] == 'date') {
                      x.at(j)?.get(arrayelement['formarraycontrol']).patchValue(element['value'][j][arrayelement['fieldname']] != undefined ? element['value'][j][arrayelement['fieldname']]?.toDate() : element['value'][j][arrayelement['formarraycontrol']]?.toDate() ?? null)
                    }
                  }
                }
              }
            }
          }

        }
      })
    }
  }
  //nanda
  //notes
  notesForm: FormGroup;

  // constructor(private fb: FormBuilder) {}

  // ngOnInit() {
  //   this.initForm();
  // }



  get notesArray() {
    return this.notesForm.get('notes') as FormArray;
  }

  createNoteControl() {
    return this.fb.control('', Validators.required);
  }

  addNote() {
    this.notesArray.push(this.createNoteControl());
  }

  removeNote(index: number) {
    this.notesArray.removeAt(index);
  }

  reworkNotes() {
    if (this.notesForm.valid) {
      console.log('Rework clicked', this.notesForm.value);
      console.log(this.participantAssignmentId);
      console.log(this.route.snapshot.queryParams['patchdata']);
      const patchKey = this.route.snapshot.queryParams['patchdata'];
      const notes = this.notesForm.value.notes;
      const activityref = doc(this.afs, "bigformassignment", patchKey);
      const activitylog = [
        {
          activityreference: activityref,
          notes,
          reviewdate: new Date(),
          reviewer: this.loggedInProfileId
        }
      ];
      getDoc(doc(this.afs, "big participants assignments", this.participantAssignmentId)).then(docSnapshot => {
        const existingActivityLog = docSnapshot.exists() ? docSnapshot.data()['activitylog'] || [] : [];
        const updatedActivityLog = [...existingActivityLog, ...activitylog];
        return updateDoc(doc(this.afs, "big participants assignments", this.participantAssignmentId), {
          activitylog: updatedActivityLog,
          status: "rework",
          // status: "initiated",
          activityref: null,
        });
      })
        .then(() => {
          console.log("New activity log added");
          this.router.navigateByUrl("/")
        })
        .catch(err => {
          console.log(err);
        });
    } else {
      console.log('else');
      this.notesForm.markAllAsTouched();
    }
  }



  completeNotes() {
    if (this.notesForm.valid) {
      console.log('completed clicked', this.notesForm.value);
      console.log(this.participantAssignmentId);
      console.log(this.route.snapshot.queryParams['patchdata']);
      const notes = this.notesForm.value.notes;
      updateDoc(doc(this.afs, "big participants assignments", this.participantAssignmentId), {
        // status: "rework",
        status: "completed",
        summary: notes
      }).then(() => {
        console.log("completed");
        this.router.navigateByUrl("/")
      }).catch(err => {
        console.log(err);
      });

    } else {
      console.log('else');
      this.notesForm.markAllAsTouched();
    }
  }
}
