import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ENTER, COMMA } from '@angular/cdk/keycodes';
import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { FormGroup, Validators, FormBuilder, FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormArray } from '@angular/forms';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { Observable, Subject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatNativeDateModule } from '@angular/material/core';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthguardService } from '../../authguard.service';

@Component({
  selector: 'app-queue-creation-v3',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatProgressSpinnerModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatIconModule,
    MatAutocompleteModule,
    MatDividerModule,
    MatButtonModule,
    DragDropModule,
    NgxMatSelectSearchModule,
    MatSlideToggleModule
  ],
  templateUrl: './queue-creation-v3.component.html',
  styleUrl: './queue-creation-v3.component.css'
})
export class QueueCreationV3Component {


  @ViewChild('stepper') stepper: MatStepper;
  editingVariation: boolean[] = [];
  latestAddedIndex: number | null = null;
  showAddVariationForm: boolean = false
  currentStageIndex: number = 0
  queueform: FormGroup
  selectable = true;
  removable = true;
  addOnBlur = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  profilelist = []
  filterprofile = ""
  filterpackageeligibility = ""
  venueList: any[] = []
  stageActionTypes = ["Form", "Link", "VideoAsk", "EvolutionMapping"]
  formTemplateList = []
  videoAskList = []
  // newly added
  mapProductToDeliverySequence: any = {}
  productsList = []
  allProductsList = []
  mapProduct = {}
  mapProductToMode = {}
  mapDeliveryEvents = {}
  mapDeliveryForms = {}
  mapDeliveryQueue = {}
  mapDeliveryAppointment = {}
  mapVideoAskData = {}
  studioWidgetList = [
    { value: "addunvalidatedatc", name: "Prescribe ATC (Requires Validation)" },
    { value: "addvalidatedatc", name: "Prescribe ATC (Not Requires Validation)" },
    { value: "prescribedvalidatedatc", name: "List Validated ATC" },
    { value: "prescribedunvalidatedatc", name: "List Unvalidated ATC" },
    { value: "assignedatc", name: "List ATC Assigned to Them" },
    { value: "assignprocedure", name: "Assign Changeagent to Procedures" },
    { value: "viewtripleatc", name: "View Triple ATC" },
    { value: "movetonextqueue", name: "Move Participants to next month review" },
    { value: "validateael", name: "Validate Current AEL" },
    { value: "previousatc", name: "Previous ATC History" },
    { value: "loveletters", name: "Love Letters" },
    { value: "evolutionwishlist", name: "Evolution Wishlist" }
  ]

  //big activity
  bigactivity = []
  mapBigActivity = {}
  activityCtrl = new FormControl('')
  filteredActivity: Observable<any>;
  loading: boolean = true;
  // ATC Model
  atcModelList = []
  touchedVariations: Set<string> = new Set();

  showErrorMessages: boolean = false
  private subscription = new Subject<void>();

  constructor(public dialogRef: MatDialogRef<any>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public formbuilder: FormBuilder,
    private authguard: AuthguardService,
    public dialog: MatDialog,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    public clipboard: Clipboard) {
    this.queueform = this.formbuilder.group({
      queuename: [, { validators: [Validators.required], updateOn: "change" }],
      queuementor: [[], { validators: [Validators.required], updateOn: "change" }],
      queueadmin: [[], { validators: [Validators.required], updateOn: "change" }],
      zoomlinkrequired: [false, { validators: [], updateOn: "change" }],
      iscommunicationsdisabled: [false, { validators: [], updatedOn: "change" }],
      enablezoommeetingsdk: [false, { validators: [], updateOn: "change" }],
      queuewelcometemplate: [, { validators: [Validators.required], updateOn: "change" }],
      stages: [[], { validators: [Validators.required], updateOn: "change" }],
      queuestartdate: [, { validators: [Validators.required], updateOn: "change" }],
      queueenddate: [, { validators: [Validators.required], updateOn: "change" }],
      venue: [null, { validators: [Validators.required], updateOn: "change" }],
      packageeligibility: [[],],
      lastregistrationdate: [null, { validators: [Validators.required], updateOn: "change" }],
      queuewelcometitle: [null, { validators: [Validators.required], updateOn: "change" }],
      queuewelcomedescription: [null, { validators: [Validators.required], updateOn: "change" }],
      queuedmessage: [null, { validators: [Validators.required], updateOn: "change" }],
      waitingmessage: [null, { validators: [Validators.required], updateOn: "change" }],
      queuevariation: this.formbuilder.array([]),
      stageproperty: this.formbuilder.array([]),
      stagegroup: this.formbuilder.array([]),
      queuetargetcapacity: [null, { validators: [Validators.required], updateOn: "change" }],
      totalcapacity: [null, { validators: [Validators.required], updateOn: "change" }],
      description: [null, { validators: [Validators.required], updateOn: "change" }],
      introdescription: [null, { validators: [Validators.required], updateOn: "change" }],
      products: this.formbuilder.array([])
    });


    if (data != null) {
      console.log(data);

      // this.removable = false
      this.queueform.patchValue({
        queuename: data.queuename,
        queuementor: data.queuementor,
        queueadmin: data.queueadmin,
        zoomlinkrequired: data.zoomlinkrequired ?? false,
        iscommunicationsdisabled: data.iscommunicationsdisabled ?? false,
        enablezoommeetingsdk: data.enablezoommeetingsdk ?? false,
        queuewelcometemplate: data.queuewelcometemplate ?? null,
        stages: data.stages,
        queuestartdate: data.queuestartdate.toDate(),
        queueenddate: data.queueenddate.toDate(),
        venue: data.venue ?? null,
        lastregistrationdate: ![null, undefined].includes(data.lastregistrationdate) ? data.lastregistrationdate.toDate() : null,
        queuewelcometitle: data.queuewelcomemessage?.title ?? null,
        queuewelcomedescription: data.queuewelcomemessage?.description ?? null,
        queuetargetcapacity: data.queuetargetcapacity ?? null,
        queuedmessage: data.queuedmessage ?? null,
        waitingmessage: data.waitingmessage ?? null,
        totalcapacity: data.totalcapacity ?? null,
        description: data.description ?? null,
        introdescription : data.introdescription ?? null,
      });

      // Get EVent Arena
      var arenaCollection = collection(this.firestore, "arena events")
      var queueRef = doc(this.firestore, "queue generation", data.docid)
      getDocs(query(arenaCollection, where("eventref", "==", queueRef))).then(arenaEvent =>{
        var otherEventData = arenaEvent.docs.map(e => e.data())
        otherEventData.sort((a, b) => a["delete"] - b["delete"])
        for (let i = 0; i < otherEventData.length; i++) {
          const element = otherEventData[i];
          this.productsArray.push(
            this.formbuilder.group({
              heroevent: [element["heroevent"] ?? false, {validators: [Validators.required], update:"change"}],
              title: [element["title"], {validators: [Validators.required], update:"change"}],
              productref: [element['productref'], { validators: [Validators.required], update: "change" }],
              startdate: [element['startdate'].toDate(), { validators: [Validators.required], update: "change" }],
              enddate: [element['enddate'].toDate(), { validators: [Validators.required], update: "change" }],
              deliveryref: [element['deliveryref'],],
              docid: [element['docid'],],
              delete: [element['delete'],],
            })
          )
          this.productsArray.controls[i].get("productref").disable()
        }
      })

      this.authguard.getProductList().then((product)=> this.allProductsList = product)

      /*
      if (data['arenaeventidlist'] != undefined) {
        for (let i = 0; i < data['arenaeventidlist'].length; i++) {
          const elementid = data['arenaeventidlist'][i];
          if (elementid && typeof elementid === 'string' && elementid.trim() !== '') {
            getDoc(doc(this.firestore, "arena events", elementid)).then(arenaEventSnap => {
              if (arenaEventSnap.exists()) {
                const element = arenaEventSnap.data()
                this.productsArray.push(
                  this.formbuilder.group({
                    heroevent: [element["heroevent"] ?? false, {validators: [Validators.required], update:"change"}],
                    title: [element["title"], {validators: [Validators.required], update:"change"}],
                    productref: [element['productref'], { validators: [Validators.required], update: "change" }],
                    startdate: [element['startdate'].toDate(), { validators: [Validators.required], update: "change" }],
                    enddate: [element['enddate'].toDate(), { validators: [Validators.required], update: "change" }],
                    deliveryref: [element['deliveryref'],],
                    docid: [element['docid'],],
                    delete: [element['delete'],],
                  })
                )
              } else {
                console.log("arenaeventidlist", elementid, "doc doesn't exist");
              }
            }).catch(err => {
              console.log("err", err);
            })
          }
        }
      } else {
        this.addproductsArray()
      }
      */

      if (data.queuevariation != null) {
        for (let i = 0; i < data.queuevariation.length; i++) {
          const variation = data.queuevariation[i];
          if (variation && typeof variation === 'string' && variation.trim() !== '') {
            getDoc(doc(this.firestore, 'queue variation', variation)).then(doc => {
              console.log("variation Check")
              if (doc.exists()) {
                var data = doc.data()
                this.variationArray.push(
                  this.formbuilder.group({
                    variationname: [data["variationname"] ?? null, { validators: [Validators.required], updateOn: "change" }],
                    variation: [data["stages"] ?? [], { validators: [Validators.required], updateOn: "change" }],
                    atcmodel: [data["atcmodel"] ?? null, { validators: [], updateOn: "change" }],
                    docid: [doc.id, { validators: [Validators.required], updateOn: "change" }],
                  })
                )
              }
            })
          }
        }
      }
      if (data["stageproperty"] == null) {
        data["stages"].forEach(stage => {
          this.addStageProperty(stage)
        })
      }
      else {
        var grouppedStage = {}
        let mainIndex = 0
        data["stages"].forEach(async (stage, stageIndex) => {
          if (data["stageproperty"][stage] == null) data["stageproperty"][stage] = {}
          var property = data["stageproperty"][stage]

          var actionResources: any;
          if (property["actiontype"] == "form") {
            actionResources = property["actionresource"]?.id;
          } else if (property["actiontype"] == "videoask") {

            if (typeof (property["actionresource"]) == 'string') {
              actionResources.push(property["actionresource"])
            } else if (property["actionresource"]?.length != 0) {
              var resources = [];
              for (let j = 0; j < property["actionresource"].length; j++) {
                const element = property["actionresource"][j];
                resources.push(element.id)
              }
              actionResources = resources;
            }
          } else {
            actionResources = property["actionresource"]
          }

          this.stagePropertyArray.push(this.formbuilder.group({
            stage: [stage, { validators: [Validators.required], updateOn: "change" }],
            selfmovable: [property["selfmovable"], { validators: [], updateOn: "change" }],
            actiontype: [property["actiontype"], { validators: [], updateOn: "change" }],
            // actionresource: [["form", "videoask"].includes(property["actiontype"]) ? property["actionresource"]?.id : property["actionresource"], {validators: [], updateOn:"change"}],
            actionresource: [actionResources, { validators: [], updateOn: "change" }],
            calltoaction: [property["calltoaction"], { validators: [], updateOn: "change" }],
            messageheader: [property["messageheader"], { validators: [], updateOn: "change" }],
            minwatingminutes: [property["minwatingminutes"], { validators: [], updateOn: "change" }],
            maxwatingminutes: [property["maxwatingminutes"], { validators: [], updateOn: "change" }],
            stagemessage: [property["stagemessage"], { validators: [], updateOn: "change" }],
            stageexplanation: [property["stageexplanation"], { validators: [], updateOn: "change" }],
            // stagenote is now a list of { stage, note } pairs (populated
            // below from the saved map). The selected stage need NOT be the
            // stage being configured.
            stagenote: this.formbuilder.array([]),
            participantform: [property["participantform"] ?? [], { validators: [], updateOn: "change" }],
            //new studio property
            studiowidgets: [property["studiowidgets"] ?? [], { validators: [], updateOn: "change" }],
            compulsoryactivity: this.formbuilder.array([]),
            nextstage: this.formbuilder.array([]),
            implementationstages: [property["implementationstages"] ?? [], { validators: [], updateOn: "change" }],
            studiostagegrouping: this.formbuilder.group({
              mandatorystage: [property["mandatorystagegrouping"] ?? [], { validators: [], updateOn: "change" }],
              optionalstage: [property["optionalstagegrouping"] ?? [], { validators: [], updateOn: "change" }],
              activitymapping: this.formbuilder.array([]),
            }),
            // Check Finance
            checkfinance: [property["checkfinance"] ?? false, { validators: [], updateOn: "change" }],
            enablezoom: [property["enablezoom"] ?? false, { validators: [], updateOn: "change" }],
            // Studio Properties
            // cwcalltoaction: [property["cwcalltoaction"] ?? null, {validators: [], updateOn:"change"}],
            // cwstage: [property["cwstage"] ?? null, {validators: [], updateOn:"change"}],
            // consultationcalltoaction: [property["consultationcalltoaction"] ?? null, {validators: [], updateOn:"change"}],
            // consultationstage: [property["consultationstage"] ?? null, {validators: [], updateOn:"change"}],
            // nextcalltoaction: [property["nextcalltoaction"] ?? null, {validators: [], updateOn:"change"}],
            // nextstage: [property["nextstage"] ?? null, {validators: [], updateOn:"change"}],
          }));

          (property["transferactivityproperty"] ?? []).forEach(property => {
            this.getActivityMappingArray(stageIndex).push(
              this.formbuilder.group({
                activity: [property["activity"], { validators: [Validators.required], updateOn: "change" }],
                newactivity: [property["newactivity"] ?? null, { validators: [Validators.required], updateOn: "change" }],
                sameperson: [property["sameperson"] ?? false, { validators: [Validators.required], updateOn: "change" }],
              })
            )
          })
          /*
          if(property["transferactivity"] != null){
            Object.keys(property["transferactivity"]).forEach(mapping=>{
              this.getActivityMappingArray(stageIndex).push(
                this.formbuilder.group({
                  activity: [mapping, {validators: [Validators.required], updateOn:"change"}],
                  newactivity: [property["transferactivity"][mapping] ?? null, {validators: [Validators.required], updateOn:"change"}]
                })
              )
            })
          }
          */
          if (property["stagegroup"] != null) {
            grouppedStage[property["stagegroup"]] = grouppedStage[property["stagegroup"]] ?? []
            grouppedStage[property["stagegroup"]].push(stage)
          }
          if (property['compulsoryactivity'] != null) {
            let compulsoryActivityArray = Object.values(property['compulsoryactivity'])
            compulsoryActivityArray.forEach(activity => {
              // Harish
              const activityArray = Array.isArray(activity) ? activity : [];
              this.getCompulsoryActivityArray(mainIndex)?.push(
                this.formbuilder.control(activityArray)
              );

              // this.getCompulsoryActivityArray(mainIndex)?.push(
              //   this.formbuilder.group({
              //     [`${this.getCompulsoryActivityArray(mainIndex).length}`]: [activity, { validators: [], updateOn: "change" }]
              //   })
              // )
            })

          }
          if (property['nextstage'] != null) {
            property['nextstage'].forEach(obj => {
              this.getNextStageArray(mainIndex).push(
                this.formbuilder.group({
                  stage: [obj['stage'], { validators: [], updateOn: "change" }],
                  calltoaction: [obj['calltoaction'], { validators: [], updateOn: "change" }],
                  markascompleted: [obj['markascompleted'] ?? false, { validators: [], updateOn: "change" }],
                  variations: [obj['variations'] ?? [], { validators: [control => control.value?.length === 0 ? { required: true } : null], updateOn: "change" }]
                })
              )
            })
          }
          // Stage notes — saved as an ARRAY [{ stage, note }] (new format) or
          // a legacy MAP { [stage]: note }. Rebuild the FormArray rows from
          // either shape so each can be edited / deleted.
          if (property['stagenote'] != null) {
            const sn = property['stagenote']
            const rows: { stage: string; note: any }[] = Array.isArray(sn)
              ? sn.map((r: any) => ({ stage: r?.['stage'], note: r?.['note'] }))
              : (typeof sn === 'object'
                  ? Object.keys(sn).map(k => ({ stage: k, note: sn[k] }))
                  : [])
            rows.forEach(r => {
              if (!r.stage) return
              this.getStageNoteArray(mainIndex).push(
                this.formbuilder.group({
                  stage: [r.stage, { validators: [], updateOn: "change" }],
                  note: [r.note, { validators: [], updateOn: "change" }],
                })
              )
            })
          }
          // Invitation Stage Group

          mainIndex++
        })
        Object.keys(grouppedStage).forEach(group => {
          this.stageGroupArray.push(this.formbuilder.group({
            groupname: [group, { validators: [Validators.required], updateOn: "change" }],
            stages: [grouppedStage[group], { validators: [Validators.required], updateOn: "change" }],
          }))
        })
      }
    } else {
      this.addproductsArray()
    }
    getDocs(query(collection(this.firestore, 'arenavideoask'), orderBy('title'))).then(videoask => {
      console.log("Video Ask Check")
      for (let i = 0; i < videoask.docs.length; i++) {
        const template = videoask.docs[i];
        var templateData = template.data()
        this.mapVideoAskData[template.id] = template.data();
        templateData["docid"] = template.id
        this.videoAskList.push(templateData)
      }
      this.loading = false;
    });

    getDocs(collection(this.firestore, 'event location')).then(venuesnap => { this.venueList = venuesnap.docs.map(e => e.data()) })
    getDocs(query(collection(this.firestore, 'delivery forms'), orderBy('formname'))).then(form => {
      console.log("Forms Check")
      for (let i = 0; i < form.docs.length; i++) {
        const template = form.docs[i];
        var templateData = template.data()
        if ([null, undefined].includes(templateData['delete'])) {
          console.log(template.id, 'form docid');

          templateData["docid"] = template.id
          this.formTemplateList.push(templateData)
        }
      }
    });

    getDocs(collection(this.firestore, 'bigactivity')).then(snap => {
      this.bigactivity = snap.docs.map(e => {
        let element = e.data()
        this.mapBigActivity[element['docid']] = element['activity']
        return element
      })
      // console.log(this.bigactivity);
      this.ngOnInit()
    })
    //getting products list
    getDocs(query(collection(this.firestore, 'products'), where("mode", "in", ["Event Mode", "Big Mode"]))).then(async snap => {
      this.productsList = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        return element
      })
      // console.log(this.productsList)
      this.atcModelList = this.productsList.filter(e => (e["atcmodel"] ?? "").trim().length != 0).map(e => e["atcmodel"])
      this.atcModelList = Array.from(new Set(this.atcModelList))
      this.productsList.forEach(e => { this.mapProduct[e['id']] = e['product'] })
      this.productsList.forEach(e => { this.mapProductToMode[e['id']] = e['mode'] })
      for (let i = 0; i < this.productsList.length; i = i + 10) {
        const element = this.productsList.slice(i, i + 10).map(e => doc(this.firestore, "products", e['id']))
        await getDocs(query(collection(this.firestore, 'productToDeliverySequence'), where("product", "in", element))).then(productDeliverySnap => {
          productDeliverySnap.forEach(doc => {
            let productDeliveryElement = doc.data()
            this.mapProductToDeliverySequence[productDeliveryElement['product'].id] = productDeliveryElement['deliveryoptions']
          })
        })
      }
      console.log(this.mapProductToMode)
      console.log(this.mapProductToDeliverySequence, 'this.mapProductToDeliverySequence')
    })
    //get delivery events forms queue
    // getDocs(collection(this.firestore, 'delivery events')).then((snap) => {
    //   snap.forEach(doc => {
    //     this.mapDeliveryEvents[doc.id] = doc.data()['eventname']
    //   })
    // })
    // getDocs(collection(this.firestore, 'delivery forms')).then((snap) => {
    //   snap.forEach(doc => {
    //     this.mapDeliveryForms[doc.id] = doc.data()['formname']
    //   })
    // })
    // getDocs(collection(this.firestore, 'delivery queue')).then((snap) => {
    //   snap.forEach(doc => {
    //     this.mapDeliveryQueue[doc.id] = doc.data()['queuename']
    //   })
    // })
    // getDocs(collection(this.firestore, 'appointmenttype')).then((snap) => {
    //   snap.forEach(doc => {
    //     this.mapDeliveryAppointment[doc.id] = doc.data()['appointmenttype']
    //   })
    // })
    //
    this.fetchUserRoles("cache")
    this.fetchUserRoles("default")
  }

  fetchUserRoles(source: any) {
    getDocs(query(collection(this.firestore, 'users_roles'), orderBy('name'))).then(profile => {
      console.log("Roles Check", source)
      var list = []
      for (let i = 0; i < profile.docs.length; i++) {
        const profiledata = profile.docs[i].data();
        list.push({
          name: profiledata["name"],
          id: profiledata["profile_ref"].id
        })
      }
      this.profilelist = list
    })
  }

  ngOnInit(): void {
    this.filteredActivity = this.activityCtrl.valueChanges.pipe(
      startWith(null),
      map((activity: string | null) => activity ? this._filteractivity(activity) : this.bigactivity.slice()));
  }


  // add products
  get productsArray() {
    return this.queueform.get("products") as FormArray
  }

  addproductsArray() {
    return this.productsArray.push(
      this.formbuilder.group({
        heroevent: [false, {validators: [Validators.required], update:"change"}],
        title: [, {validators: [Validators.required], update:"change"}],
        productref: [, { validators: [Validators.required], update: "change" }],
        startdate: [, { validators: [Validators.required], update: "change" }],
        enddate: [, { validators: [Validators.required], update: "change" }],
        deliveryref: [null,],
        delete: [false,],
        docid: [doc(collection(this.firestore, 'arena events')).id,],
      })
    )
  }

  removeproductsArray(index: number) {
    if (this.productsArray.controls[index].value['deliveryref'] != null && this.data != null) {
      this.productsArray.controls[index].value['delete'] = true
      // if (confirm("Are you surewant to delete")) {
      //   updateDoc(doc(this.firestore, 'arena events', this.productsArray.controls[index].value['docid']), {
      //     delete: true
      //   })
      //   this.productsArray.controls[index].value['delete'] = true
      // }
    } else {
      this.productsArray.removeAt(index)
    }
  }

  returnprofile(): Array<any> {
    var data = []
    data = this.profilelist.filter(e => e["name"].toLowerCase().includes(this.filterprofile.toLowerCase()))
    return data
  }

  returnPackageEligibility(): Array<any> {
    var data = []
    data = this.allProductsList.filter(e => e["product"].toLowerCase().includes(this.filterpackageeligibility.toLowerCase()))
    return data
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 2000 })
  }

  // Queue Add/Remove Stage
  addStage(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) {
      this.queueform.get('stages').value.push(value);
      this.addStageProperty(value)
    }
    this.queueform.get('stages').updateValueAndValidity();
    event.input.value = null
  }

  removeStage(stages: String): void {
    const index = this.queueform.get('stages').value.indexOf(stages);
    if (index >= 0) {
      this.queueform.get('stages').value.splice(index, 1);
      this.removeStageProperty(stages)
    }
    this.queueform.get('stages').updateValueAndValidity();
  }

  // Queue Set Stage Properties
  get stagePropertyArray(): FormArray {
    return this.queueform.get('stageproperty') as FormArray
  }

  setStageProperty(stage) {
    return this.formbuilder.group({
      stage: [stage, { validators: [Validators.required], updateOn: "change" }],
      selfmovable: [false, { validators: [], updateOn: "change" }],
      actiontype: [null, { validators: [], updateOn: "change" }],
      actionresource: [null, { validators: [], updateOn: "change" }],
      calltoaction: [null, { validators: [], updateOn: "change" }],
      messageheader: [null, { validators: [], updateOn: "change" }],
      minwatingminutes: [null, { validators: [], updateOn: "change" }],
      maxwatingminutes: [null, { validators: [], updateOn: "change" }],
      stagemessage: [null, { validators: [], updateOn: "change" }],
      stageexplanation: [null, { validators: [], updateOn: "change" }],
      stagenote: this.formbuilder.array([]),
      participantform: [[], { validators: [], updateOn: "change" }],
      // new studio property
      studiowidgets: [[], { validators: [], updateOn: "change" }],
      compulsoryactivity: this.formbuilder.array([]),
      nextstage: this.formbuilder.array([]),
      implementationstages: [[], { validators: [], updateOn: "change" }],
      studiostagegrouping: this.formbuilder.group({
        mandatorystage: [[], { validators: [], updateOn: "change" }],
        optionalstage: [[], { validators: [], updateOn: "change" }],
        activitymapping: this.formbuilder.array([]),
      }),
      // Check Finance
      checkfinance: [false, { validators: [], updateOn: "change" }],
      enablezoom:[false,{ validators: [], updateOn: "change" }]
      // Studio Property
      // cwcalltoaction: [null, {validators: [], updateOn:"change"}],
      // cwstage: [null, {validators: [], updateOn:"change"}],
      // consultationcalltoaction: [null, {validators: [], updateOn:"change"}],
      // consultationstage: [null, {validators: [], updateOn:"change"}],
      // nextcalltoaction: [null, {validators: [], updateOn:"change"}],
      // nextstage: [null, {validators: [], updateOn:"change"}],
    });
  }

  addStageProperty(stage) {
    this.stagePropertyArray.push(this.setStageProperty(stage))
  }

  removeStageProperty(stage) {
    var index = this.stagePropertyArray.value.findIndex(e => e["stage"] == stage)
    console.log(stage, this.stagePropertyArray.value[index])
    if (index != -1) {
      this.stagePropertyArray.removeAt(index)
    }
  }

  //compulsoryactivity
  getCompulsoryActivityArray(index: number): FormArray {
    return this.stagePropertyArray.controls[index].get("compulsoryactivity") as FormArray
  }

  // addcompulsoryactivity(mainIndex:number){
  //   return this.getCompulsoryActivityArray(mainIndex).push(
  //     this.formbuilder.group({
  //       [`${this.getCompulsoryActivityArray(mainIndex).length}`]: [[], {validators: [], updateOn:"change"}]
  //     })
  //   )
  // }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  private _filteractivity(value: any) {
    const filterValue = value != null && value != "" ? value.toLowerCase() : value;
    return this.bigactivity.filter(e => e.activity.toLowerCase().includes(filterValue));
  }

  // removeActivity(activitydocid,mainIndex,index){
  //   // console.log("removeActivity",activitydocid,mainIndex,index);
  //   // console.log(this.getCompulsoryActivityArray(mainIndex).controls[index].value[index]);
  //   // console.log(this.getCompulsoryActivityArray(mainIndex).value);
  //   const getindex = this.getCompulsoryActivityArray(mainIndex).controls[index].value[index].findIndex(id=> id === activitydocid);
  //   // console.log("getindex",getindex);
  //   if (getindex >= 0) {
  //     this.getCompulsoryActivityArray(mainIndex).controls[index].value[index].splice(getindex, 1);
  //   }
  // }

  // removecompulsoryactivity(mainIndex: number, subArrayIndex: number) {
  //   return this.getCompulsoryActivityArray(mainIndex).removeAt(subArrayIndex)
  // }

  removecompulsoryactivity(mainIndex: number, subArrayIndex: number) {
    const compulsoryArray = this.getCompulsoryActivityArray(mainIndex);

    compulsoryArray.removeAt(subArrayIndex);

    // Force the parent form to recognize the change
    compulsoryArray.markAsDirty();
    compulsoryArray.updateValueAndValidity();
    this.stagePropertyArray.updateValueAndValidity();

    // If you have a main form
    if (this.queueform) {
      this.queueform.updateValueAndValidity();
    }
  }

  updateCompulsoryActivity(control, i, j, event) {
    // console.log(control,i,j,event);
    this.getCompulsoryActivityArray(i).controls[j].patchValue(event.value)
    // console.log(this.getCompulsoryActivityArray(i));
  }

  addcompulsoryactivity(mainIndex: number) {
    // Just add a FormControl that holds an array, not a FormGroup
    return this.getCompulsoryActivityArray(mainIndex).push(
      this.formbuilder.control([], { validators: [], updateOn: "change" })
    )
  }

  // Simplified getActivityControlValue method
  getActivityControlValue(stageIndex: number, activityIndex: number): any[] {
    const compulsoryActivityArray = this.getCompulsoryActivityArray(stageIndex);
    const activityControl = compulsoryActivityArray.at(activityIndex) as FormControl;
    return activityControl?.value || [];
  }

  // Simplified addSelectedActivity method
  addSelectedActivity(activityDocId: string, stageIndex: number, activityIndex: number): void {
    console.log(activityDocId, stageIndex, activityIndex);
    const compulsoryActivityArray = this.getCompulsoryActivityArray(stageIndex);
    const activityControl = compulsoryActivityArray.at(activityIndex) as FormControl;
    if (![null, undefined].includes(activityControl)) {
      const currentValue = activityControl.value ?? [];
      if (!currentValue.includes(activityDocId)) {
        const updatedValue = [...currentValue, activityDocId];
        activityControl.setValue(updatedValue);
        activityControl.updateValueAndValidity();
      }
    }
  }

  // Simplified removeActivity method
  removeActivity(activitydocid: string, mainIndex: number, index: number): void {
    const compulsoryActivityArray = this.getCompulsoryActivityArray(mainIndex);
    const activityControl = compulsoryActivityArray.at(index) as FormControl;

    if (activityControl) {
      const currentValue = activityControl.value || [];
      const getindex = currentValue.findIndex(id => id === activitydocid);

      if (getindex >= 0) {
        const updatedValue = [...currentValue];
        updatedValue.splice(getindex, 1);
        activityControl.setValue(updatedValue);
        activityControl.updateValueAndValidity();
      }
    }
  }

  // Studio Stage Grouping
  getActivityMappingArray(index: number): FormArray {
    return this.stagePropertyArray.controls[index].get("studiostagegrouping.activitymapping") as FormArray
  }

  updateActivityMapping(index) {
    var mapActivities = {}
    this.getActivityMappingArray(index).controls.forEach(activity => {
      mapActivities[activity.value["activity"]] = activity.value["newactivity"]
    })
    var mandatory = this.stagePropertyArray.controls[index].get("studiostagegrouping").value["mandatorystage"] ?? []
    var optional = this.stagePropertyArray.controls[index].get("studiostagegrouping").value["optionalstage"] ?? []
    console.log(mandatory, optional)
    var activities = []
    this.stagePropertyArray.controls.forEach(stage => {
      var stageProperty = stage.value
      if (mandatory.includes(stageProperty["stage"]) || optional.includes(stageProperty["stage"])) {
        Object.values(stageProperty["compulsoryactivity"] ?? {}).forEach((value, i) => {
          activities = activities.concat(value[i])
        })
      }
    })
    activities = Array.from(new Set(activities))
    console.log("Activity List", activities)
    this.getActivityMappingArray(index).clear()
    activities.forEach(activity => {
      this.getActivityMappingArray(index).push(
        this.formbuilder.group({
          activity: [activity, { validators: [Validators.required], updateOn: "change" }],
          newactivity: [mapActivities[activity] ?? null, { validators: [Validators.required], updateOn: "change" }],
          sameperson: [false, { validators: [Validators.required], updateOn: "change" }],
        })
      )
    })
  }

  // nextstage
  getNextStageArray(index: number): FormArray {
    return this.stagePropertyArray.controls[index].get("nextstage") as FormArray
  }

addNextStage(mainIndex: number) {
  return this.getNextStageArray(mainIndex).push(
    this.formbuilder.group({
      stage: [null, { validators: [], updateOn: "change" }],
      calltoaction: [null, { validators: [], updateOn: "change" }],
      markascompleted: [false,],
      variations: [[], { validators: [control => control.value?.length === 0 ? { required: true } : null], updateOn: "change" }]
    })
  )
}

  removeNextStage(mainIndex: number, subArrayIndex: number) {
    return this.getNextStageArray(mainIndex).removeAt(subArrayIndex)
  }

  // ---- Stage notes (per-stage list of { stage, note }) ----
  // Each note targets a SELECTED stage (not necessarily the stage being
  // configured). In the studio it shows only when the participant's
  // variation includes that selected stage.
  getStageNoteArray(index: number): FormArray {
    return this.stagePropertyArray.controls[index].get("stagenote") as FormArray
  }
  addStageNote(mainIndex: number) {
    return this.getStageNoteArray(mainIndex).push(
      this.formbuilder.group({
        stage: [null, { validators: [], updateOn: "change" }],
        note: [null, { validators: [], updateOn: "change" }],
      })
    )
  }
  removeStageNote(mainIndex: number, subArrayIndex: number) {
    return this.getStageNoteArray(mainIndex).removeAt(subArrayIndex)
  }

  // Queue Setup Variation
  get variationArray(): FormArray {
    return this.queueform.get('queuevariation') as FormArray
  }

  createVariation() {
    return this.formbuilder.group({
      variationname: [null, { validators: [Validators.required], updateOn: "change" }],
      variation: [[], { validators: [Validators.required], updateOn: "change" }],
      atcmodel: [null, { validators: [], updateOn: "change" }],
      docid: [doc(collection(this.firestore, 'queue variation')).id, { validators: [Validators.required], updateOn: "change" }],
    });
  }

  addVariation() {
    this.showAddVariationForm = true
    this.variationArray.push(this.createVariation())
  }

  removeVariation(index) {
    if (confirm("Sure, do you want to delete this variation?")) {
      var variationid = this.variationArray.controls[index].value.docid
      deleteDoc(doc(this.firestore, 'queue variation', variationid)).catch(e => {
        console.log(e)
      })

      this.variationArray.removeAt(index)
    }
  }

  // Stage Group
  get stageGroupArray(): FormArray {
    return this.queueform.get("stagegroup") as FormArray
  }

  creatStageGroup() {
    return this.formbuilder.group({
      groupname: [null, { validators: [Validators.required], updateOn: "change" }],
      stages: [[], { validators: [Validators.required], updateOn: "change" }],
    })
  }

  addStageGroup() {
    this.stageGroupArray.push(this.creatStageGroup())
  }

  removeStageGroup(index) {
    this.stageGroupArray.removeAt(index)
  }

  copyText(formtemplateid: string) {
    // console.log(this.data.docid,formtemplateid);
    // if(![null,undefined].includes(this.data.docid) && ![![null,undefined].includes(formtemplateid)]){
    let url = "https://star-labs.web.app/formtemplate?id=" + formtemplateid + "&type=form&queueid=" + this.data.docid
    this.clipboard.copy(url)
    // }
  }

  onsubmit(value: any) {
    console.log(value);
    if (this.queueform.valid) {
      if (!this.validationFn()) {
        var batch = writeBatch(this.firestore)
        const loadingref = this.dialog.open(LoadingProgressComponent, {
          disableClose: true,
          data: {
            msg: "loading..."
          }
        })
        value.stagegroup = value.stagegroup ?? []
        var eventStartDate = new Date(value.queuestartdate)
        eventStartDate.setHours(5, 30, 0, 0)
        var eventEndDate = new Date(value.queueenddate)
        eventEndDate.setHours(23, 59, 59, 0)

        var queuewelcomemessage = {
          title: [null, undefined, ""].includes(value.queuewelcometitle) ? null : value.queuewelcometitle,
          description: [null, undefined, ""].includes(value.queuewelcomedescription) ? null : value.queuewelcomedescription
        }
        var metadata = {
          queuename: value.queuename,
          queueadmin: value.queueadmin,
          queuementor: value.queuementor,
          zoomlinkrequired: value.zoomlinkrequired,
          iscommunicationsdisabled: value.iscommunicationsdisabled,
          enablezoommeetingsdk: value.enablezoommeetingsdk,
          queuewelcometemplate: value.queuewelcometemplate,
          stages: value.stages,
          packageeligibility: value.packageeligibility,
          queuewelcomemessage,
          // isahrequired : value.isahrequired,
          // ahperson : value.ahperson,
          // ischangeworkreq: value.ischangeworkreq,
          // changeworkperson: value.changeworkperson,
          // isdiagnosticsrequired: value.isdiagnosticsrequired,
          // diagnosticsperson: value.diagnosticsperson,
          // isreviewrequired: value.isreviewrequired,
          // reviewperson : value.reviewperson,
          // isconsultationrequired: value.isconsultationrequired,
          // consultationperson: value.consultationperson,
          // isvideologrequired: value.isvideologrequired,
          // videologperson: value.videologperson,
          queuestartdate: eventStartDate,
          queueenddate: eventEndDate,
          venue: value.venue,
          lastregistrationdate: value.lastregistrationdate,
          queuedmessage: value.queuedmessage ?? null,
          waitingmessage: value.waitingmessage ?? null,
          // queuedates:value.formarray,
          queuevariation: value.queuevariation.map(e => e.docid),
          queuetargetcapacity: value.queuetargetcapacity,
          totalcapacity: value.totalcapacity,
          description: value.description,
          introdescription:value.introdescription,
          stageproperty: {},
          stagegroup: value.stagegroup.map(e => e["groupname"]),
          // products:value.products,
          // productsreflist:value.products.map(e => e['productref'])
          arenaeventidlist: value.products.filter(e => e["delete"] != true).map(e => e['docid'])
        }
        if (this.data == null) {
          metadata["docid"] = doc(collection(this.firestore, 'queue generation')).id
          metadata["created"] = new Date()
        }
        else {
          metadata["docid"] = this.data.docid
          metadata["modified"] = new Date()
        }
        // Stage properties
        value.stageproperty.forEach(property => {
          metadata["stageproperty"][property["stage"]] = {
            selfmovable: property["selfmovable"] ?? false,
            actiontype: property["actiontype"] ?? null,
            // actionresource: property["actiontype"] == "form" ? this.firestore.collection("delivery forms").doc(property["actionresource"]).ref : property["actiontype"] == "link" ? property["actionresource"] : null,
            calltoaction: (property["calltoaction"] ?? "").trim().length == 0 ? null : property["calltoaction"],
            messageheader: (property["messageheader"] ?? "").trim().length == 0 ? null : property["messageheader"],
            minwatingminutes: property["minwatingminutes"] ?? null,
            maxwatingminutes: property["maxwatingminutes"] ?? null,
            stagemessage: (property["stagemessage"] ?? "").trim().length == 0 ? null : property["stagemessage"],
            stageexplanation: (property["stageexplanation"] ?? "").trim().length == 0 ? null : property["stageexplanation"],
            // Serialize the { stage, note } rows into an ARRAY (not a map).
            // Arrays are REPLACED wholesale by Firestore's set(merge:true),
            // whereas a nested map would deep-merge and never drop deleted
            // keys — which is why deletes weren't sticking. Skip rows with no
            // stage or empty note.
            stagenote: (() => {
              const rows = property["stagenote"] ?? []
              const out: any[] = []
              for (const row of rows) {
                const s = row?.["stage"]
                const n = (row?.["note"] ?? "").trim()
                if (s && n.length > 0) out.push({ stage: s, note: n })
              }
              return out.length === 0 ? null : out
            })(),
            participantform: property["participantform"].length == 0 ? null : property["participantform"],
            // new studio property
            studiowidgets: property["studiowidgets"] ?? null,
            nextstage: property["nextstage"] ?? null,
            implementationstages: property["implementationstages"] ?? [],
            // Check Finance
            checkfinance: property["checkfinance"] ?? false,
            enablezoom:property["enablezoom"] ?? false,
            // Studio Property
            // cwcalltoaction: (property["cwcalltoaction"] ?? "").trim().length == 0 ? null : property["cwcalltoaction"],
            // cwstage: property["cwstage"] ?? null,
            // consultationcalltoaction: (property["consultationcalltoaction"] ?? "").trim().length == 0 ? null : property["consultationcalltoaction"],
            // consultationstage: property["consultationstage"] ?? null,
            // nextcalltoaction: (property["nextcalltoaction"] ?? "").trim().length == 0 ? null : property["nextcalltoaction"],
            // nextstage: property["nextstage"] ?? null,
          }
          if (property["actiontype"] == "form") {
            metadata["stageproperty"][property["stage"]]["actionresource"] = doc(this.firestore, "delivery forms", property["actionresource"])
          }
          else if (property["actiontype"] == "videoask") {

            var resources = [];
            for (let i = 0; i < property["actionresource"].length; i++) {
              const resourceDocId = property["actionresource"][i];
              resources.push(doc(this.firestore, 'arenavideoask', resourceDocId))
            }

            metadata["stageproperty"][property["stage"]]["actionresource"] = resources
            // metadata["stageproperty"][property["stage"]]["actionresource"] = this.firestore.collection("arenavideoask").doc(property["actionresource"]?.id).ref
          }
          else if (property["actiontype"] == "link" || property["actiontype"] == "evolutionmapping") {
            metadata["stageproperty"][property["stage"]]["actionresource"] = property["actionresource"]
          }

          if (property['compulsoryactivity'] != null || property['compulsoryactivity'] != undefined) {
            metadata["stageproperty"][property["stage"]]['compulsoryactivity'] = {}
            property['compulsoryactivity'].forEach((element, index) => {
              metadata["stageproperty"][property["stage"]]['compulsoryactivity'][`${index}`] = element
            })
          } else {
            metadata["stageproperty"][property["stage"]]['compulsoryactivity'] = null
          }
          // Activity Stage Grouping Studio
          metadata["stageproperty"][property["stage"]]["mandatorystagegrouping"] = property["studiostagegrouping"]["mandatorystage"] ?? null
          metadata["stageproperty"][property["stage"]]["optionalstagegrouping"] = property["studiostagegrouping"]["optionalstage"] ?? null
          metadata["stageproperty"][property["stage"]]["transferactivityproperty"] = property["studiostagegrouping"]["activitymapping"]
          metadata["stageproperty"][property["stage"]]["transferactivity"] = {};
          (property["studiostagegrouping"]["activitymapping"] ?? []).forEach(mapping => {
            metadata["stageproperty"][property["stage"]]["transferactivity"][mapping["activity"]] = mapping["newactivity"]
          })
        })
        // Stage Group
        var groupedStages = []
        value.stagegroup.forEach(grouped => {
          var groupname = grouped["groupname"]
          grouped["stages"].forEach(stage => {
            metadata["stageproperty"][stage]["stagegroup"] = groupname
            groupedStages.push(stage)
          })
        })
        value.stages.forEach(stage => {
          if (!groupedStages.includes(stage)) {
            metadata["stageproperty"][stage]["stagegroup"] = null
          }
        })
        // Create Variation
        value.queuevariation.forEach(async variation => {
          batch.set(doc(this.firestore, 'queue variation', variation.docid), {
            variationname: variation.variationname,
            stages: variation.variation,
            queueref: doc(this.firestore, 'queue generation', metadata["docid"]),
            atcmodel: variation.atcmodel,
          })

        })
        console.log(metadata);

        let queueRef = doc(this.firestore,"queue generation", metadata["docid"])
        batch.set(queueRef, metadata, { merge: true })

        for (let i = 0; i < value.products.length; i++){
          const productid = value.products[i]['productref'].id;
          if(value.products[i]['deliveryref'] === null){
            if(this.mapProductToDeliverySequence.hasOwnProperty(productid)){
              let findeventactivity = null
              if(this.mapProductToMode[productid] === "Event Mode"){
                findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery queue") === 0)
              }
              else if(this.mapProductToMode[productid] === "Big Mode"){
                findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery fieldwork") === 0)
              }

              if(findeventactivity != null){
                var arenaEventRef = doc(this.firestore, "arena events", value.products[i]['docid'])
                var arenaEventStart = new Date(value.products[i]['startdate'])
                arenaEventStart.setHours(5, 30, 0, 0)
                var arenaEventEnd = new Date(value.products[i]['enddate'])
                arenaEventEnd.setHours(23, 59, 59, 0)
                var arenaEventData:any = {
                  heroevent: value.products[i]['heroevent'] ?? false,
                  title: value.products[i]['title'], 
                  docid:value.products[i]['docid'],
                  startdate: arenaEventStart,
                  enddate: arenaEventEnd,
                  productref:value.products[i]['productref'],
                  eventref: queueRef,
                  deliveryref:findeventactivity['activity'],
                  delete:value.products[i]['delete'],
                  venue:value.venue,
                  type:"queue",
                  eventname:value.queuename,
                }
                batch.set(arenaEventRef, arenaEventData, {merge:true})
              }
              else{
                console.log("Delivery Event/Fieldwork not found")
              }
            }
            else{
              console.log("selected product not mapped to delivery sequence");
            }
          }
          else{
            console.log("Already Arena Event Exists");
            var arenaEventRef = doc(this.firestore, "arena events", value.products[i]['docid'])
            var arenaEventData:any = {
              heroevent: value.products[i]['heroevent'] ?? false,
              title: value.products[i]['title'], 
              startdate:value.products[i]['startdate'],
              enddate:value.products[i]['enddate'],
              delete:value.products[i]['delete'],
              venue:value.venue,
              type:"queue",
              eventname:value.queuename,
            }
            batch.update(arenaEventRef, arenaEventData, {merge:true})
          }
        }
        
        /*
        let eventRef = doc(this.firestore, 'queue generation', metadata["docid"])
        for (let i = 0; i < value.products.length; i++) {
          const productid = value.products[i]['productref'].id;
          console.log(productid, 'productid');

          if (this.mapProductToDeliverySequence.hasOwnProperty(productid)) {
            console.log(productid, 'productid');

            let findeventactivity = value.products[i]['deliveryref'] ?? null
            if (this.mapProductToMode[productid] === "Event Mode" && findeventactivity === null) {
              findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery queue") === 0)['activity']
            } else if (findeventactivity === null) {
              findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'][0]['activity']
            }
            // console.log("findeventactivity",![null,undefined].includes(findeventactivity) ? findeventactivity.path : findeventactivity,value['products'][i]);
            await setDoc(doc(this.firestore, 'arena events', value.products[i]['docid']), {
              docid: value.products[i]['docid'],
              startdate: value.products[i]['startdate'],
              enddate: value.products[i]['enddate'],
              productref: value.products[i]['productref'],
              eventref: eventRef,
              deliveryref: findeventactivity,
              delete: value.products[i]['delete'],
              venue: value.venue,
              type: "queue",
              eventname: value.queuename
            }, { merge: true })
          }
        }
        */

        batch.commit().catch(err =>{
          console.log(err)
          alert(err)
        })
        
        this.dialogRef.close()
        loadingref.close()
      } else {
        alert("No Delivery Queue Assigned to the product")
      }
    }
    // else{
    //   console.log("Invalid", this.queueform.errors)
    // }
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  goback() {
    this.stepper.previous()
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.queueform.controls["stages"].value, event.previousIndex, event.currentIndex);
    this.queueform.controls["stages"].updateValueAndValidity()
  }

  compareFn(c1: any, c2: any): boolean {
    return c1 && c2 ? c1.id === c2.id : c1 === c2;
  }

  validationFn(): boolean {
    let validated = []
    let value = this.queueform.getRawValue()
    console.log(value)
    for (let i = 0; i < value.products.length; i++) {
      const productid = value.products[i]['productref'].id;
      if (value.products[i]['deliveryref'] === null) {
        if (this.mapProductToDeliverySequence.hasOwnProperty(productid)) {
          let findeventactivity = null
          console.log(this.mapProductToDeliverySequence[productid], 'product');
          console.log(this.mapProductToMode[productid]);

          if (this.mapProductToMode[productid] === "Event Mode") {
            console.log(this.mapProductToMode[productid], 'working')
            findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'].find(e => e['activity'].path.indexOf("delivery queue") === 0)
          } else findeventactivity = this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1]['deliverysequence'][0]
          console.log(this.mapProductToDeliverySequence[productid][this.mapProductToDeliverySequence[productid].length - 1])
          console.log("findeventactivity", findeventactivity);
          if (findeventactivity != undefined && findeventactivity != null) {
            if (findeventactivity['activity'] != undefined) validated.push(false)
            else validated.push(true)
          } else validated.push(true)
        } else validated.push(true)
      }
    }
    console.log(validated.includes(true));
    return validated.includes(true)
  }

  dropVideoAsk(event: CdkDragDrop<string[]>, index) {
    moveItemInArray(this.stagePropertyArray.controls[index].get('actionresource').value, event.previousIndex, event.currentIndex);
  }


  proceedToNextstage() {
    this.showErrorMessages = false
    console.log(this.stepper.selectedIndex);

    if (this.stepper.selectedIndex === 0) {
      if (this.queueform.get('queuename').valid && this.queueform.get('queuementor').valid &&
        this.queueform.get('queueadmin').valid && this.queueform.get('queuestartdate').valid &&
        this.queueform.get('queueenddate').valid && this.queueform.get('venue').valid &&
        this.queueform.get('description').valid && this.queueform.get('introdescription').valid && this.queueform.get('queuetargetcapacity').valid &&
        this.queueform.get('totalcapacity').valid && this.queueform.get('queuewelcometemplate').valid &&
        this.queueform.get('queuedmessage').valid && this.queueform.get('lastregistrationdate').valid && 
        this.queueform.get('queuedmessage').valid && 
        this.queueform.get('waitingmessage').valid && 
        this.queueform.get('queuewelcometitle').valid && 
        this.queueform.get('queuewelcomedescription').valid 
      ) {
        this.stepper.next();
      }
      else {
        this.showErrorMessages = true
      }
    } else if (this.stepper.selectedIndex === 1 || this.stepper.selectedIndex === 3) {
      this.stepper.next();
    } else if (this.stepper.selectedIndex === 2) {
      let missingVariations = [];
      for (let i = 0; i < this.stagePropertyArray.controls.length; i++) {
        const stageControl = this.stagePropertyArray.controls[i];
        const stageName = stageControl.get('stage').value;
        const nextstageArray = stageControl.get('nextstage') as FormArray;
        for (let j = 0; j < nextstageArray.controls.length; j++) {
          const nextstageControl = nextstageArray.controls[j];
          const variations = nextstageControl.get('variations').value;
          const calltoaction = nextstageControl.get('calltoaction').value;
          if (!variations || variations.length === 0) {
            missingVariations.push(
              `Stage "${stageName}" → Button "${calltoaction || 'Unnamed Button'}"`
            );
          }
        }
      }
      if (missingVariations.length > 0) {
        alert("Please select applicable variations for the following:\n\n" + missingVariations.join("\n"));
      } else {
        this.stepper.next();
      }
    }
  }



  // Start editing a variation
  editVariation(index: number): void {
    this.showAddVariationForm = true
    this.editingVariation[index] = true;
  }


  // Get CSS class for workflow stage based on stage name
  getStageClass(stageName: string): string {
    if (stageName.toLowerCase().includes('start')) {
      return 'stage-start';
    } else if (stageName.toLowerCase().includes('review')) {
      return 'stage-review';
    } else if (stageName.toLowerCase().includes('report')) {
      return 'stage-report';
    } else if (stageName.toLowerCase().includes('completed')) {
      return 'stage-completed';
    } else {
      return 'stage-default';
    }
  }



  // When saving a variation, reset the latest added index
  saveVariation(index: number): void {
    if (this.latestAddedIndex === index) {
      this.latestAddedIndex = null;
    }
    this.editingVariation[index] = false;
  }

  // When canceling editing, also reset the latest added index
  cancelEditVariation(index: number): void {
    if (this.latestAddedIndex === index) {
      this.variationArray.removeAt(index);
      this.latestAddedIndex = null;
    } else {
      this.showAddVariationForm = false
      this.editingVariation[index] = false;
    }
  }

  selectStage(index: number) {
    this.currentStageIndex = index; // Update the current stage index
  }

  getNamesByIds(ids: number[]): string {
    return ids
      .map(id => {
        const profile = this.returnprofile().find(p => p.id === id);
        return profile ? profile.name : null;
      })
      .filter(name => name)
      .join(', ');
  }

  onSelectAllVariations(stageIndex: number, nextStageIndex: number) {
    const control = this.getNextStageArray(stageIndex).controls[nextStageIndex].get('variations');
    const allDocids = this.variationArray.controls.map(v => v.value.docid);
    const currentValue = control.value ?? [];
    const allSelected = allDocids.every(id => currentValue.includes(id));
    if (allSelected) {
      control.setValue([]);
    } else {
      control.setValue(allDocids);
    }
  }

}