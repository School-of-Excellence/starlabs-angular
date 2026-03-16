import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { arrayUnion, collection, collectionData, doc, Firestore, getDocs, query, setDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import * as XLSX from 'xlsx';
import { MatStepper } from '@angular/material/stepper';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { AuthguardService } from '../../authguard.service';
import {MatStepperModule} from '@angular/material/stepper';
import { CommonModule } from '@angular/common';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-create-arena-space',
  imports: [
    MatStepperModule,
    CommonModule,
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    NgxMatSelectSearchModule,
    MatIconModule,
    MatDatepickerModule,
    MatButtonModule
  ],
  templateUrl: './create-arena-space.component.html',
  styleUrl: './create-arena-space.component.css'
})
export class CreateArenaSpaceComponent {

  @ViewChild('inputFile') inputFile: ElementRef;
  // dataSheet = new Subject();

  subscription = new Subject<void>

  // String declarations
  selectedType: string = "manual";
  eventType: string = "";
  eventName: string = "";
  cohortName: string = "";
  selectedSpace: string = "";
  selectedSpaceType: string = "";
  filteredMentor:string = "";
  filteredProfile:string = null;
  filteredArenaSpace:string = null;
  filteredArenaSpaceType:string = null;
  fileName: string = null;
  filteredCohorts: string = null;

  // Array declarations
  documentlist = [];
  tableFields = ['Timing', 'Participant Name/Names', 'A&H Space', 'Doer Name', 'Engagement', 'Consultation Summary'];
  participantNames = [];
  spaceNames = [];
  typeNames = [];
  cohortsNames = [];
  eventArray = [];
  cohortsArray = [];
  selectedTypeChips:string[] =[];
  marathonList = [];
  cohortsList = [];
  paginatedData: any[] = [];
  newArenaSpaceList = [];
  newArenaSpaceListDisplay = [];
  paginatedDataNew = [];
  arenaSpaceList = [];

  // Boolean declarations
  isExcelFile: boolean = true;
  loading:boolean = true;
  importSheetValidated:boolean = false;


  // null declarations 
  eventref: null;
  assignmentref: null;
  marathonref: null;

  // Object declarations
  mapProfileName = {};
  mapSpaceName = {};
  mapTypeName = {};
  mapCohortsName = {};
  participantNameExistInDatabase = {};
  spaceNamesExistInDatabase = {};
  typeNamesExistInDatabase = {};
  mapProfile = {};
  mapSpace = {};
  mapSpaceType = {};
  mapArenaSpace = {};
  arenaSpaceData = {};
  mapCohorts = {};
  pendingMap:Object = null;
  uploadFields = {
    'Timing': '',
    'Participant Name/Names': '',
    'A&H Space': '',
    'Doer Name': '',
    'Engagement': '',
    'Consultation Summary': '',
    'validation': false,
    'errornotes': '',
    'uploaded': false
  };

  // Numeric declarations
  pageSize: number = 10; // Items per page
  currentPage: number = 1; // Current page
  totalItems: number = 0; // Total number of items
  showInput:number = null;

  eventDate;
  selectedTime;
  Math = Math;
  @ViewChild('stepper') stepper: MatStepper;


  
  constructor(private firestore: Firestore,
    public dialog: MatDialog,
    private authguard : AuthguardService,
  ) {
    getDocs(collection(this.firestore,"profile_data")).then((profile)=>{
      if(profile.docs.length != 0) {
        for (let i = 0; i < profile.docs.length; i++) {
          const element = profile.docs[i].data();
          this.participantNames.push(element['name']);
          this.mapProfileName[element['name']] = element['profileid'];
          this.mapProfile[element['profileid']] = element
        }
      } else {
        console.log("No Profile Data Found");
      }
    })
    
    getDocs(collection(this.firestore,"A&H_Space_Name")).then((space)=>{
      if(space.docs.length != 0) {
        for (let i = 0; i < space.docs.length; i++) {
          const element = space.docs[i].data();
          this.spaceNames.push(element['spacename']);
          this.mapSpaceName[element['spacename']] = element['docid'];
          this.mapSpace[element['docid']] = element['spacename']
        }
      } else {
        console.log("No Space Found");
      }
    })

    getDocs(collection(this.firestore,"A&H_Space_Type")).then((type)=>{
      if(type.docs.length != 0) {
        for (let i = 0; i < type.docs.length; i++) {
          const element = type.docs[i].data();
          this.typeNames.push(element['typename']);
          this.mapTypeName[element['typename']] = element['docid'];
          this.mapSpaceType[element['docid']] = element['typename']
        }
      } else {
        console.log("No Type Found");
      }
    });

    collectionData(collection(this.firestore,"arenaspace")).pipe(takeUntil(this.subscription)).subscribe((a_spacedoc)=>{
      
      this.mapArenaSpace = {};
      this.arenaSpaceList = [];

      if(a_spacedoc.length != 0){
        for (let i = 0; i < a_spacedoc.length; i++) {
          const arenaspaceData = a_spacedoc[i];
          this.mapArenaSpace[arenaspaceData['summary'].replace(/[^a-zA-Z]/g, '')] = arenaspaceData
          this.arenaSpaceList.push(arenaspaceData['summary'].replace(/[^a-zA-Z]/g, ''));
        }
      }

    });    
    
    this.loading = false;
  }

  ngOnInit(): void {
  }

  // function when import of excel 
  onChange(evt:Event) {
    let data:any[];
    // const target: DataTransfer = <DataTransfer>evt.target;
    const target = evt.target as HTMLInputElement
    const file = target.files[0];
    this.fileName = file.name;
    console.log('Selected File:', this.fileName);
    this.isExcelFile = target.files && target.files[0] && /\.(xls|xlsx|csv)$/i.test(target.files[0].name)
    if(target.files.length > 1){
      this.inputFile.nativeElement.value = '';
      return alert("more files are selected.Please select a single file")
    }

    if(this.isExcelFile){
      const reader: FileReader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        /* read workbook */
        const bstr: string = e.target.result as string;
        const wb: XLSX.WorkBook = XLSX.read(bstr, { type: 'binary', cellDates: true,cellText:true});

        /* grab first sheet */
        const wsname: string = wb.SheetNames[0];
        const ws: XLSX.WorkSheet = wb.Sheets[wsname];

        /* save data */
        data = XLSX.utils.sheet_to_json(ws);

        data = data.map(e => {
          return Object.fromEntries(
            Object.entries(e).map(([key,value]) => [key.trim(),value])
          )
        })
        // console.log(Object.keys(data[0]),this.tableFields);
        
        if(data.length != 0 && this.tableFields.every((e:string) => Object.keys(data[0]).includes(e)) == false){
          return alert("The headings in the imported sheet are incorrect.Please correct them")
        }

        this.documentlist = data;
        
        for (let i = 0; i < this.documentlist.length; i++) {

          this.documentlist[i]['validation'] = false;
          this.documentlist[i]['uploaded'] = false;
          this.documentlist[i]['errornotes'] = '';

          if(i > 0 && [null, undefined, ""].includes(this.documentlist[i]['A&H Space'])) {
            this.documentlist[i]['A&H Space'] = this.documentlist[i-1]['A&H Space'];
          }

          if(i > 0 && [null, undefined, ""].includes(this.documentlist[i]['Timing'])) {
            this.documentlist[i]['Timing'] = this.documentlist[i-1]['Timing'];
          }
          let participants = this.splitByCommaWithNullishCheck(this.documentlist[i]['Participant Name/Names']);
          let doer = this.splitByCommaWithNullishCheck(this.documentlist[i]['Doer Name']);
          console.log(doer);
                
          let space = this.checkNullUndefined(this.documentlist[i]['A&H Space']);
          let type = this.checkNullUndefined(this.documentlist[i]['Engagement']);
          // console.log("PARTICIPANTS",participants);
          // console.log("DOER",doer);
          // console.log("Space",space);
          // console.log("TYPE",type);
          
          for (let j = 0; j < participants.length; j++) {
            const element = participants[j];
            
            // if(this.documentlist[i]['validation'] == false) {
              // if(!this.participantNames.includes(element)){
                this.participantNameExistInDatabase[element] = {profile:[],cohorts:[]}
                // this.documentlist[i]['validation'] = true;
                // this.documentlist[i]['errornotes'] = this.documentlist[i]['errornotes'] == '' ? `${'Check Participant Names'} ${'-'} ${element}` : this.documentlist[i]['errornotes'] + ',' + `${'Check Participant Names'} ${'-'} ${element}`;
              // }
            // }
          }

          for (let k = 0; k < doer.length; k++) {
            const element = doer[k];
            // if(this.documentlist[i]['validation'] == false) {
              // if(!this.participantNames.includes(element)) {
                this.participantNameExistInDatabase[element] = {profile:[],cohorts:[]}
                // this.documentlist[i]['validation'] = true;
                // this.documentlist[i]['errornotes'] = this.documentlist[i]['errornotes'] == '' ? `${'Check Doer Names'} ${'-'} ${element}` : this.documentlist[i]['errornotes'] + ',' + `${'Check Doer Names'} ${'-'} ${element}`;
              // }
            // }
          }

          // if(!this.spaceNames.includes(space)) {
            this.spaceNamesExistInDatabase[space] = null
          //   this.documentlist[i]['validation'] = true;
          //   this.documentlist[i]['errornotes'] = this.documentlist[i]['errornotes'] == '' ? 'A&H Space Not Available' : this.documentlist[i]['errornotes'] + ',' + 'A&H Space Not Available';
          // }

          // if(!this.typeNames.includes(type)) {
            this.typeNamesExistInDatabase[type] = null;
            // this.documentlist[i]['validation'] = true;
            // this.documentlist[i]['errornotes'] = this.documentlist[i]['errornotes'] == '' ? 'Engagement Not Available' : this.documentlist[i]['errornotes'] + ',' + 'Engagement Not Available';
          // }

          if(i+1 == data.length) {
            this.totalItems = data.length;
            this.updatePaginatedData();
          }
        }

      };

      reader.onerror = (error) => {
        console.error('error reading file:',error);
        this.inputFile.nativeElement.value = ""
      }

      reader.readAsArrayBuffer(target.files[0]);

      // reader.onloadend = (e) => {
      //   for (let i = 0; i < this.documentlist.length; i++) {
      //     const element = this.documentlist[i];
      //     this.keys = Object.keys(data[0]) 
      //     this.dataSheet.next(data);
      //   }
      // };
      this.stepper.next();
    }else{
      this.inputFile.nativeElement.value = '';
    }
  }

  hasProfile(value: any): boolean {
    return Array.isArray(value?.profile) && value.profile.length > 0;
  }
  

  // function to filter profile 
  returnFilterProflie() {
    const filterText = ![null,undefined,""].includes(this.filteredProfile) ? this.filteredProfile.toLowerCase().trim() : ""
    return this.participantNames.filter((e:string) => e?.toLowerCase().includes(filterText))
  }

  returnMentor(){
    const filterText = ![null,undefined,""].includes(this.filteredMentor) ? this.filteredMentor.toLowerCase().trim() : ""
    return this.participantNames.filter((e:string) => e?.toLowerCase().includes(filterText))
  }

  // function to filter profile 
  returnArenaSpace() {
    const filterText = ![null,undefined,""].includes(this.filteredArenaSpace) ? this.filteredArenaSpace.toLowerCase().trim() : ""
    return this.spaceNames.filter((e:string) => e?.toLowerCase().includes(filterText))
  }

  // function to filter profile 
  returnArenaSpaceType() {
    const filterText = ![null,undefined,""].includes(this.filteredArenaSpaceType) ? this.filteredArenaSpaceType.toLowerCase().trim() : ""
    return this.typeNames.filter((e:string) => e?.toLowerCase().includes(filterText))
  }

  // function to filter profile 
  returnCohorts() {
    const filterText = ![null,undefined,""].includes(this.filteredCohorts) ? this.filteredCohorts.toLowerCase().trim() : ""
    return this.cohortsNames.filter((e:string) => e?.toLowerCase().includes(filterText))
  }

  // fucntion to update ref data 
  updateref() {

    let document = this.eventArray.find((e)=> e['name'] == this.eventName);
    this.eventref = document['docref'];

    if(this.eventType != 'Live Event'){

      let marathon = this.eventArray.find((e)=>e['name'] === this.eventName && ![null,undefined,''].includes(e['bigmarathonref']))
      
      if(marathon){
        getDocs(query(collection(this.firestore,'big cohorts'),where("marathonref","==",marathon['bigmarathonref']))).then((cohorts)=> {
          console.log( "COHORTS Length",cohorts.docs.length);
          if(cohorts.docs.length != 0) {
            for(let j = 0; j < cohorts.docs.length; j++) {
              const cohortsData = cohorts.docs[j].data();
              cohortsData['docid'] = cohorts.docs[j].id;
              this.cohortsNames.push(cohortsData['name']);
              this.mapCohortsName[cohortsData['name']] = cohortsData;
              this.mapCohorts[cohortsData['docid']] = cohortsData
            }
          } else {
            console.log("No Cohorts Found");
            this.authguard.openSnackBar("No CoHorts Found","OK",600);
          }
          
        });

        
      }else{
        this.authguard.openSnackBar("No Marathon in the Selected Event","OK",600);
      }
  
    }
    
  }

  // function to get ref data 
  getRefData() {
    this.eventArray = [];
    this.eventref = null;
    this.assignmentref = null;
    this.marathonref = null;
    if(this.eventType == 'Live Event' || this.eventType == 'Big Accelerator Event') {
      getDocs(collection(this.firestore,'event collection')).then((event)=> {
        if(event.docs.length != 0) {
          for(let i = 0; i < event.docs.length; i++) {
            let element = event.docs[i].data();
            element['docref'] = event.docs[i].ref
            if(this.eventType == 'Live Event') {
              // if([null, undefined, ""].includes(element['bigmarathonref'])) {
                this.eventArray.push(element);
              // }
            } else {
              this.eventArray.push(element);
            }
          }
        } else {
          console.log("No Event Found")
        }
      });

    } else {
      getDocs(collection(this.firestore,'big assignment')).then((big)=>{
        if(big.docs.length != 0) {
          for(let i = 0; i < big.docs.length; i++) {
            let element = big.docs[i].data();
            element['docref'] = big.docs[i].ref
            this.eventArray.push(element);
          }
        } else {
          console.log('No Big Assignments Found')
        }
      })
    }
  }

  // function to update timestamp to selected date 
  updateTimestamp() {
    const [hours, minutes] = this.selectedTime.split(':').map(Number);    
    const eventDate = new Date(this.eventDate);
    eventDate.setHours(hours);
    eventDate.setMinutes(minutes);
    this.eventDate = eventDate;
    console.log("event date 0", this.eventDate);
    
  }

  // function to export sample excel 
  async downloadsample() {
    const dataToExport = [];
    const headers = this.tableFields;
    dataToExport.push(headers);

    // Generate worksheet and workbook
    const worksheet: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(dataToExport);
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'A&H Touchpoints');

    // Export to Excel
    XLSX.writeFile(workbook, 'A&H Touchpoints.xlsx');
  }

  // function to add row to table 
  addrow() {
    this.documentlist.push({
      'Timing': '',
      'Participant Name/Names': '',
      'A&H Space': '',
      'Doer Name': '',
      'Engagement': '',
      'Consultation Summary': '',
      'validation': false,
      'errornotes': '',
      'uploaded': false
    });
    this.totalItems = this.documentlist.length;
    this.updatePaginatedData();
  }

  // function to remove row from table 
  removerow() {
    this.documentlist = this.documentlist.slice(0, -1);
    this.totalItems = this.documentlist.length;
    this.updatePaginatedData();
  }

   // Update paginated data based on current page and page size
   updatePaginatedData(): void {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedData = this.documentlist.slice(startIndex, endIndex);
  }

  // Update paginated data based on current page and page size
  updatePaginatedDataNew(): void {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedDataNew = this.newArenaSpaceList.slice(startIndex, endIndex);
  }

  // Go to specific page
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePaginatedData();
    }
  }

  hasProfileOrCohorts(value: any): boolean {
    const hasProfiles = Array.isArray(value?.profile) && value.profile.length > 0;
    const hasCohorts = Array.isArray(value?.cohorts) && value.cohorts.length > 0;
    return hasProfiles || hasCohorts;
  }
  

  // Go to next page
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePaginatedData();
    }
  }

  // Go to previous page
  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePaginatedData();
    }
  }

  // Get array of page numbers for pagination
  get pageNumbers(): number[] {
    const pageCount = this.totalPages;
    const visiblePages = 5; // Number of page buttons to show
    
    let startPage = Math.max(1, this.currentPage - Math.floor(visiblePages / 2));
    let endPage = startPage + visiblePages - 1;
    
    if (endPage > pageCount) {
      endPage = pageCount;
      startPage = Math.max(1, endPage - visiblePages + 1);
    }
    
    return Array.from({ length: (endPage - startPage) + 1 }, (_, i) => startPage + i);
  }

  // Calculate total number of pages
  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize);
  }

  checkNullUndefined(val:string){
    return ![null,undefined,""].includes(val) ? val : null
  }

  splitByCommaWithNullishCheck(val:string):string[]{
    return ![null,undefined,""].includes(val) ? val.split(',').map((name:string) => name.trim()) : [];
  }

  onPatchNamesToDocumentList(){
    
  }

  selectOption(type: string) {
    this.selectedType = type;
    this.stepper.next();
  }

  onValidateImportSheet(){

    this.pendingMap = null;
    let pending = [];
    for (const element of [this.participantNameExistInDatabase,this.spaceNamesExistInDatabase,this.typeNamesExistInDatabase]) {
      for (const key in element) {
        console.log(typeof(element[key]));
        if(typeof(element[key]) != 'string' && element[key] != null){
          if(element[key]['profile'].length === 0){

            if(element[key]['cohorts'].length === 0){
              console.log(key,element[key]);
              // error = error + `${key} ,`
              pending.push(key)
            }
          }
        }else{
          if(element[key] === null || element[key] === undefined){
            console.log(key,element[key]);
            // error = error + `${key} ,`
            pending.push(key)
          }
        }
      }
    }

    if(pending.length != 0){
      this.pendingMap = {
        "title" : "The Below Given Names are Not Mapped",
        "pendinglist" : pending
      }
      // error = error + '  these names are not mapped as per database'
      // alert(error);
    }else{
      this.pendingMap = null;
      this.importSheetValidated = false;
      this.newArenaSpaceList = [];
      this.newArenaSpaceListDisplay = [];
      for (let i = 0; i < this.documentlist.length; i++) {
        let participants = this.splitByCommaWithNullishCheck(this.documentlist[i]['Participant Name/Names']);
        let participantsid = [];
        let doer = this.splitByCommaWithNullishCheck(this.documentlist[i]['Doer Name']);
        let doerid = []       
        let space = this.checkNullUndefined(this.documentlist[i]['A&H Space']);
        let spaceid = null
        let type = this.checkNullUndefined(this.documentlist[i]['Engagement']);
        let spacetypeid = null;
        let cohortsid = [];

        for (let j = 0; j < participants.length; j++) {
          const name = participants[j];
          console.log(this.participantNameExistInDatabase);
          
          if(this.participantNameExistInDatabase[name]){
            if(this.participantNameExistInDatabase[name]['profile'].length != 0){
              
              let profiles = this.participantNameExistInDatabase[name]['profile'];
              if (Array.isArray(profiles)) {
                const profileIds = profiles.map(profile => this.mapProfileName[profile]);
                participantsid.push(...profileIds);
              } else {
                participantsid.push(this.mapProfileName[profiles]);
              }

            }
            if(this.participantNameExistInDatabase[name]['cohorts'].length != 0){
              
              let co_horts = this.participantNameExistInDatabase[name]['cohorts'];
              if (Array.isArray(co_horts)) {
                const cohortsIds = co_horts.map(e => this.mapCohortsName[e]['docid']);
                cohortsid.push(...cohortsIds);
              } else {
                cohortsid.push(this.mapCohortsName[co_horts]['docid']);
              }
              
              for (const cohorts of this.participantNameExistInDatabase[name]['cohorts']){
                participantsid = [...participantsid,...this.mapCohortsName[cohorts]['participantidlist']]
              }

            }
          }
        }
        console.log(doer);
        
        for (let k = 0; k < doer.length; k++) {
          const name = doer[k];
          if(this.participantNameExistInDatabase[name]){
            if(this.participantNameExistInDatabase[name]['profile']){
              doerid = this.participantNameExistInDatabase[name]['profile'].map((e)=>this.mapProfileName[e]);
            }
          }
        }

        spaceid = this.mapSpaceName[this.spaceNamesExistInDatabase[space]];
        spacetypeid = this.mapTypeName[this.typeNamesExistInDatabase[type]];

        const docID = this.arenaSpaceList.includes(this.documentlist[i]['Consultation Summary'].replace(/[^a-zA-Z]/g, '')) ? this.mapArenaSpace[this.documentlist[i]['Consultation Summary'].replace(/[^a-zA-Z]/g, '')]['docid'] : doc(collection(this.firestore, 'arenaspace')).id;

        let obj = {
          'Timing': this.documentlist[i]['Timing'],
          'Participant Name/Names': [...new Set(participantsid)],
          'A&H Space': spaceid,
          'Doer Name': [...new Set(doerid)],
          'Engagement': spacetypeid,
          'Consultation Summary': this.documentlist[i]['Consultation Summary'],
          'validation': false,
          'errornotes': '',
          'uploaded': false,
          'exist' : this.arenaSpaceList.includes(this.documentlist[i]['Consultation Summary'].replace(/[^a-zA-Z]/g, '')) ? true : false,
          'docid' : docID,
        }
        
        let displayObj = {
          'Timing' : this.documentlist[i]['Timing'],
          'Participant Name/Names': [...new Set(participantsid.map((item)=> this.mapProfile[item]['name'] || 'Not Found' ))],
          'A&H Space': this.mapSpace[spaceid],
          'Doer Name': [...new Set(doerid.map((item)=> this.mapProfile[item]['name'] || 'Not Found' ))],
          'Engagement': this.mapSpaceType[spacetypeid],
          'Consultation Summary': this.documentlist[i]['Consultation Summary'],
          'validation': false,
          'errornotes': '',
          'uploaded': false,
          'exist' : this.arenaSpaceList.includes(this.documentlist[i]['Consultation Summary'].replace(/[^a-zA-Z]/g, '')) ? true : false,
          'docid' : docID,
        }
        if(cohortsid.length != 0){
          obj['Cohorts'] = [...new Set(cohortsid)]
          displayObj['Cohorts'] = [...new Set(cohortsid.map((item)=> this.mapCohorts[item]['name'] || 'Not Found' ))]
        }
        this.newArenaSpaceList.push(obj);
        this.newArenaSpaceListDisplay.push(displayObj)

      }
      let tableHeading = this.tableFields.filter((e)=>e !== 'Cohorts');
      this.tableFields = tableHeading;
      if(this.newArenaSpaceList.filter((e)=>![null,undefined,''].includes(e['Cohorts'])).length != 0){
        this.tableFields.splice(2, 0, "Cohorts");
      }
      console.log(this.newArenaSpaceList);
      console.log(this.newArenaSpaceListDisplay);
    }
  }

  async createArenaManually(){
    console.log(this.arenaSpaceData);

    let check = confirm("Are you sure do you want to create an this Arena Space")

    if(check){

      const loadingref = this.dialog.open(LoadingProgressComponent, {
        data: {
          msg: "Creating Arena Space"
        },
        disableClose: true
      });

      var map = {
        docid: doc(collection(this.firestore,'arenaspace')).id,
        date: this.eventDate,
        participantslist: arrayUnion(...this.arenaSpaceData['participantslist'].map((e)=>this.mapProfileName[e])),
        spaceid: this.mapSpaceName[this.arenaSpaceData['spaceid']],
        mentor: this.arenaSpaceData['mentor'].map((e)=>this.mapProfileName[e]),
        pivottype: this.mapTypeName[this.arenaSpaceData['pivottype']],
        summary: this.arenaSpaceData['summary'],
        eventref: this.eventref,
        cohortsid: arrayUnion(...this.arenaSpaceData['cohortsid'].length != 0 ? this.arenaSpaceData['cohortsid'].map((e)=>this.mapCohortsName[e]['docid']) : []),
        assignmentref: this.assignmentref,
        marathonref: this.marathonref,
        createddate : new Date(),
        validated : false,
        delete : false,
      }
      console.log(map);
      
      await setDoc(doc(this.firestore,'arenaspace',map['docid']), map,{merge:true}).then(()=>{
        console.log("Arena Space Created Successfully");
        this.authguard.openSnackBar("Arena Space Created Successfully","OK",600);
        this.arenaSpaceData = {};
        loadingref.close();
      }).catch((error)=>{
        console.log('Error', error);
        this.arenaSpaceData = {};
        this.authguard.openSnackBar("Error" + error,"OK",600);
        loadingref.close();
      });

    }

  }

   // function to upload data 
   async uploadData(data, index) {
    console.log(data);
    
    let check = confirm("Are you sure do you want to create an this Arena Space")

    if(check){

      const loadingref = this.dialog.open(LoadingProgressComponent, {
        data: {
          msg: "Creating Arena Space"
        },
        disableClose: true
      });

      const [hours, minutes] = data['Timing'].split(':').map(Number);    
      const eventDate = new Date(this.eventDate);
      eventDate.setHours(hours);
      eventDate.setMinutes(minutes);
      this.eventDate = eventDate;
      
      let finalData = this.newArenaSpaceList.find((e)=>e['docid'] == data['docid']);
      [null,undefined,''].includes(finalData['Cohorts']) ? finalData['Cohorts'] = [] : finalData['Cohorts']
      var map = {
        docid: finalData['docid'],
        date: this.eventDate,
        participantslist: finalData['Participant Name/Names'],
        spaceid: finalData['A&H Space'],
        mentor: finalData['Doer Name'],
        pivottype: finalData['Engagement'],
        summary: finalData['Consultation Summary'],
        eventref: this.eventref,
        cohortsid: finalData['Cohorts'],
        assignmentref: this.assignmentref,
        marathonref: this.marathonref,
        validated : false,
        delete : false,
      }

      if(finalData['exist'] == true){
        map['updateddate'] = new Date()
      }else{
        map['createddate'] = new Date()
      }

      console.log("UploadingData",map);
      
      await setDoc(doc(this.firestore,'arenaspace',map['docid']),{
        docid: finalData['docid'],
        date: this.eventDate,
        participantslist: arrayUnion(...finalData['Participant Name/Names']),
        spaceid: finalData['A&H Space'],
        mentor: finalData['Doer Name'],
        pivottype: finalData['Engagement'],
        summary: finalData['Consultation Summary'],
        eventref: this.eventref,
        cohortsid: [null,undefined,''].includes(finalData['Cohorts']) ? arrayUnion(...[]) : (finalData['Cohorts'].length != 0 ? arrayUnion(...finalData['Cohorts']) : arrayUnion(...[])),
        assignmentref: this.assignmentref,
        marathonref: this.marathonref,
        validated : false,
        delete : false,
        [finalData['exist'] == true ? 'updateddate' : 'createddate' ]: new Date()
      },{merge:true}).then(()=>{
        console.log("Arena Space Created Successfully");
        this.authguard.openSnackBar("Arena Space Created Successfully","OK",600);
        loadingref.close();
      }).catch((error)=>{
        console.log('Error', error);
        this.authguard.openSnackBar("Error" + error,"OK",600);
        loadingref.close();
      });
  
      if (index !== -1) {
        this.newArenaSpaceListDisplay.splice(index, 1);
        this.newArenaSpaceList.splice(index, 1);
      }
    }

  }

  onUploadAll(){

    let check = confirm("Are you sure do you want to create an All Arena Space");

    if(check){

      const loadingref = this.dialog.open(LoadingProgressComponent, {
        data: {
          msg: "Creating Arena Space"
        },
        disableClose: true
      });

      const batch = writeBatch(this.firestore);

      for (let i = 0; i < this.newArenaSpaceList.length; i++) {
        const arenaSpace = this.newArenaSpaceList[i];

        const docRef = doc(this.firestore,"arenaspace",arenaSpace['docid'])
        
        const [hours, minutes] = arenaSpace['Timing'].split(':').map(Number);    
        const eventDate = new Date(this.eventDate);
        eventDate.setHours(hours);
        eventDate.setMinutes(minutes);
        this.eventDate = eventDate;

        let map = {
          docid: arenaSpace['docid'],
          createddate:new Date(),
          date: this.eventDate,
          participantslist: arrayUnion(...arenaSpace['Participant Name/Names']),
          spaceid: arenaSpace['A&H Space'],
          mentor: arenaSpace['Doer Name'],
          pivottype: arenaSpace['Engagement'],
          summary: arenaSpace['Consultation Summary'],
          eventref: this.eventref,
          cohortsid: [null,undefined,''].includes(arenaSpace['Cohorts']) ? arrayUnion(...[]) : (arenaSpace['Cohorts'].length != 0 ? arrayUnion(...arenaSpace['Cohorts']) : arrayUnion(...[])),
          assignmentref: this.assignmentref,
          marathonref: this.marathonref,
          validated : false,
          delete : false,
        }

        if(arenaSpace['exist'] == true){
          map['updateddate'] = new Date()
        }else{
          map['createddate'] = new Date()
        }
        console.log(map);
        
        batch.set(docRef,{
          docid: arenaSpace['docid'],
          createddate:new Date(),
          date: this.eventDate,
          participantslist: arrayUnion(...arenaSpace['Participant Name/Names']),
          spaceid: arenaSpace['A&H Space'],
          mentor: arenaSpace['Doer Name'],
          pivottype: arenaSpace['Engagement'],
          summary: arenaSpace['Consultation Summary'],
          eventref: this.eventref,
          cohortsid: [null,undefined,''].includes(arenaSpace['Cohorts']) ? arrayUnion(...[]) : (arenaSpace['Cohorts'].length != 0 ? arrayUnion(...arenaSpace['Cohorts']) : arrayUnion(...[])),
          assignmentref: this.assignmentref,
          marathonref: this.marathonref,
          validated : false,
          delete : false,
          [arenaSpace['exist'] == true ? 'updateddate' : 'createddate' ]: new Date()
        });

        if((i+1) === this.newArenaSpaceList.length){

          batch.commit().then(()=>{
            console.log("Batch Commited");
            console.log("All Arena Space Created Successfully");
            this.authguard.openSnackBar("All Arena Space Created Successfully","OK",600);
            loadingref.close();
          }).catch((error)=>{
            console.log('Error', error);
            this.authguard.openSnackBar("Error" + error,"OK",600);
            loadingref.close();
          });

        }

      }

    }

  }

  removeData(index){
    if (index !== -1) {
      this.newArenaSpaceListDisplay.splice(index, 1);
      this.newArenaSpaceList.splice(index, 1);
    }
  }

}
