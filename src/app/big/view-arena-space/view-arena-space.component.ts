import { Component, OnInit } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { AuthguardService } from '../../authguard.service';
import { Subject, takeUntil } from 'rxjs';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ArenaSpaceDialogComponent } from '../arena-space-dialog/arena-space-dialog.component';

@Component({
  selector: 'app-view-arena-space',
  imports: [
    ReactiveFormsModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    NgxMatSelectSearchModule,
    MatButtonModule,
    MatTooltipModule,
    CommonModule,
    MatIconModule,
    MatFormFieldModule

  ],
  templateUrl: './view-arena-space.component.html',
  styleUrl: './view-arena-space.component.css'
})
export class ViewArenaSpaceComponent {
  
   // String declarations 
   filteredProfile: string = "";

   // Array declarations
   arenaArray = [];
   tempArenaArray = [];
   participantNames = [];
   spaceNames = [];
   typeNames = [];
   paginatedData: any[] = [];
   participantsArray = [];
   spaceArray = [];
   typeArray = [];
   eventsArray = []; 
   marathonArray = [];
   cohortsArray = [];
   assignmentArray = [];
   arenaSapceData = [];
 
   tableFields = ['Timing', 'Participant Name/Names', 'A&H Space', 'Doer Name', 'Cohorts', 'Engagement', 'Consultation Summary'];
   docFields = ['date', 'participantslist', 'cohortsid', 'spaceid', 'mentor', 'pivottype', 'summary'];
 
   Math = Math;
   
   subscription = new Subject<void>
   // Object declarations
   mapProfileName = {};
   mapSpaceName = {};
   mapTypeName = {};
   mapProfileID = {};
   mapSpaceID = {};
   mapCohortsName = {};
   mapTypeID = {};
 
   // Numeric declarations
   pageSize: number = 10; // Items per page
   currentPage: number = 1; // Current page
   totalItems: number = 0; // Total number of items
 
   filterform: FormGroup 
fileds: any;
 
   constructor(private firestore: Firestore,
     private dialog: MatDialog,
     private fb: FormBuilder,
     private authguard : AuthguardService
   ) {
    this.filterform = this.fb.group({
      profile: [[],],
      space: [[],],
      type: [[],],
      event: [[],],
      marathon: [[],],
      assignment: [[],],
      cohorts: [[],]
    })
      getDocs(collection(this.firestore,"profile_data")).then((profile)=>{
        if(profile.docs.length != 0) {
         for (let i = 0; i < profile.docs.length; i++) {
           const element = profile.docs[i].data();
           this.participantsArray.push(element['profileid']);
           this.participantNames.push(element['name']);
           this.mapProfileName[element['name']] = element['profileid'];
           this.mapProfileID[element['profileid']] = element;
         }
        } else {
         console.log("No Profile Data Found");
        }
      })
 
      getDocs(collection(this.firestore,"A&H_Space_Name")).then((space)=>{
        if(space.docs.length != 0) {
          for (let i = 0; i < space.docs.length; i++) {
           const element = space.docs[i].data();
           this.spaceArray.push(element);
           this.spaceNames.push(element['spacename']);
           this.mapSpaceName[element['spacename']] = element['docid'];
           this.mapSpaceID[element['docid']] = element['spacename'];
          }
        } else {
         console.log("No Space Found");
        }
      })
 
      getDocs(collection(this.firestore,"A&H_Space_Type")).then((type)=>{
        if(type.docs.length != 0) {
          for (let i = 0; i < type.docs.length; i++) {
            const element = type.docs[i].data();
            this.typeArray.push(element);
            this.typeNames.push(element['typename']);
            this.mapTypeName[element['typename']] = element['docid'];
            this.mapTypeID[element['docid']] = element['typename'];
          }
        } else {
          console.log("No Type Found");
        }
      })
 
      getDocs(collection(this.firestore,"event collection")).then((events)=>{
        if(events.docs.length != 0) {
          for (let i = 0; i < events.docs.length; i++) {
            const docid = events.docs[i].id;
            const element = events.docs[i].data();
            element['docid'] = docid;
            element['eventref'] = events.docs[i].id
            this.eventsArray.push(element);
          }
        } else {
          console.log("No Events Found");
        }
      })
 
      getDocs(collection(this.firestore,"big marathon")).then((marathon)=>{
        if(marathon.docs.length != 0) {
          for (let i = 0; i < marathon.docs.length; i++) {
            const element = marathon.docs[i].data();
            this.marathonArray.push(element);
          }
        } else {
          console.log("No Marathon Found");
        }
      })
 
      getDocs(collection(this.firestore,"big cohorts")).then((cohorts)=>{
        if(cohorts.docs.length != 0) {
          for (let i = 0; i < cohorts.docs.length; i++) {
            const element = cohorts.docs[i].data();
            this.cohortsArray.push(element);
            this.mapCohortsName[cohorts.docs[i].id] = element
          }
        } else {
          console.log("No Cohorts Found");
        }
      })
 
      getDocs(collection(this.firestore,"big assignment")).then((assignment)=>{
        if(assignment.docs.length != 0) {
          for (let i = 0; i < assignment.docs.length; i++) {
            const element = assignment.docs[i].data();
            this.assignmentArray.push(element);
          }
        } else {
          console.log("No Assignment Found");
        }
      })
 
      collectionData(query(collection(this.firestore,"arenaspace"), orderBy("date", "desc"))).pipe(takeUntil(this.subscription)).subscribe((arena)=>{
        let tempArray = [];
        if(arena.length != 0) {
          for (let i = 0; i < arena.length; i++) {
            const element = arena[i];
            
            let map = {}
            map['Participant Name/Names'] = element['participantslist'].map((e)=>this.mapProfileID[e]['name']);
            map['Doer Name'] = element['mentor'].map((e)=>this.mapProfileID[e]['name']);
            map['A&H Space'] = this.mapSpaceID[element['spaceid']],
            map['Engagement'] = this.mapTypeID[element['pivottype']],
            map['Consultation Summary'] = element['summary']
            map['Timing'] = element['date']
            map['docid'] = element['docid']
            map['Cohorts'] = element['cohortsid'].map((e)=>this.mapCohortsName[e]['name'])
            map['validated'] = element['validated']
            tempArray.push(map);
            this.arenaSapceData.push(element);
            if(i+1 == arena.length) {
              this.arenaArray = tempArray;
              this.tempArenaArray = tempArray;
              this.totalItems = this.arenaArray.length;
              this.updatePaginatedData();
            }
          }
        } else {
          console.log("No arena found");
        }
      })
    }
 
   ngOnInit() {
 
   }

   ngOnDestroy(){
    this.subscription.next();
    this.subscription.complete();
   }
 
   // function to filter the data 
   formfilter(value) {
     console.log("value", value);
 
     this.arenaArray = this.tempArenaArray.filter((e)=> {    
       let participants = e['Participant Name/Names'].split(',').map(name => this.mapProfileName[name.trim()]);
       
       if ((value.profile.length != 0 ? value.profile.some(item => participants?.includes(item)) : true)
         && (value.space.length != 0 ? value.space.some(item => e['A&H Space']?.includes(item))  : true)
         && (value.type.length != 0 ? value.type.some(item => e['Engagement']?.includes(item))  : true)
         && (value.event.length != 0 ? value.event.some(item => e.eventref.id?.includes(item))  : true)
         && (value.marathon.length != 0 ? value.marathon.some(item => e.marathonref.id ?.includes(item))  : true)
         && (value.assignment.length != 0 ? value.assignment.some(item => e.assignmentref.id?.includes(item))  : true)
         && (value.cohorts.length != 0 ? value.cohorts.some(item => e.cohortsref.id?.includes(item)) : true)){
         return e;
       }
     })
 
     this.totalItems = this.arenaArray.length;
     this.updatePaginatedData();
   }
 
   clearFilter(){
     this.filterform.reset();
   }
 
   // function to open dialog 
    openDialog(document, index) {
      this.dialog.open(ArenaSpaceDialogComponent, {
        data: {
  
          participantList : this.participantsArray,
          participantNames : this.participantNames,
          mapProfile : this.mapProfileID,
          mapProfileName : this.mapProfileName,
  
          spaceList : this.spaceArray,
          spaceNames : this.spaceNames,
          mapSpaceName : this.mapSpaceName,
          mapSpaceID : this.mapSpaceID,
  
          typeList : this.typeArray,
          cohortsArray : this.cohortsArray,
          typeNames : this.typeNames,
          mapTypeName : this.mapTypeName,
          mapTypeID : this.mapTypeID,
  
          metaData : this.arenaSapceData.find((e)=>e['docid'] == document['docid'])
        },
        disableClose:true,
        panelClass: 'custom-dialog-container',
      })
      // dialogref.afterClosed().subscribe((result)=>{
      //   if(result['validation']) {
      //     this.arenaArray[index]['errornotes'] = '';
      //   } else {
      //     this.arenaArray[index][type] = result['value'];
      //   }
  
      //   for (let i = 0; i < this.arenaArray.length; i++) {
      //     this.arenaArray[i]['validation'] = false;
      //     this.arenaArray[i]['uploaded'] = false;
      //     this.arenaArray[i]['errornotes'] = '';
      //     let participants = this.arenaArray[i]['Participant Name/Names'].split(',').map(name => name.trim());
      //     let doer = this.arenaArray[i]['Doer Name'].split(',').map(name => name.trim());          
      //     let space = this.arenaArray[i]['A&H Space'];
      //     let type = this.arenaArray[i]['Engagement'];
  
      //     for (let j = 0; j < participants.length; j++) {
      //       const element = participants[j];
      //       if(this.arenaArray[i]['validation'] == false) {
      //         if(!this.participantNames.includes(element)) {
      //           this.arenaArray[i]['validation'] = true;
      //           this.arenaArray[i]['errornotes'] = this.arenaArray[i]['errornotes'] == '' ? `${'Check Participant Names'} ${'-'} ${element}` : this.arenaArray[i]['errornotes'] + ',' + `${'Check Participant Names'} ${'-'} ${element}`;
      //         }
      //       }
      //     }
  
      //     for (let k = 0; k < doer.length; k++) {
      //       const element = doer[k];
      //       if(this.arenaArray[i]['validation'] == false) {
      //         if(!this.participantNames.includes(element)) {
      //           this.arenaArray[i]['validation'] = true;
      //           this.arenaArray[i]['errornotes'] = this.arenaArray[i]['errornotes'] == '' ? `${'Check Doer Names'} ${'-'} ${element}` : this.arenaArray[i]['errornotes'] + ',' + `${'Check Doer Names'} ${'-'} ${element}`;
      //         }
      //       }
      //     }
  
      //     if(!this.spaceNames.includes(space)) {
      //       this.arenaArray[i]['validation'] = true;
      //       this.arenaArray[i]['errornotes'] = this.arenaArray[i]['errornotes'] == '' ? 'A&H Space Not Available' : this.arenaArray[i]['errornotes'] + ',' + 'A&H Space Not Available';
      //     }
  
      //     if(!this.typeNames.includes(type)) {
      //       this.arenaArray[i]['validation'] = true;
      //       this.arenaArray[i]['errornotes'] = this.arenaArray[i]['errornotes'] == '' ? 'Engagement Not Available' : this.arenaArray[i]['errornotes'] + ',' + 'Engagement Not Available';
      //     }
      //   }
      // })
    }
 
   // function to upload data 
   uploadData(data, index) {
     if(this.arenaArray[index]['uploaded'] == false) {
       let docid = data['docid'];
       let participantslist = [];
       let mentor = [];
       let participants = data['Participant Name/Names'].split(',').map(name => name.trim());
       let doer = data['Doer Name'].split(',').map(name => name.trim());  
 
       for (let i = 0; i < participants.length; i++) {
         const element = participants[i];
         participantslist.push(this.mapProfileName[element])
       }
 
       for (let i = 0; i < doer.length; i++) {
         const element = doer[i];
         mentor.push(this.mapProfileName[element])
       }
 
       var map = {
         docid: docid,
         createddate:new Date(),
         date: data['Timing'],
         participantslist: participantslist,
         spaceid: this.mapSpaceName[data['A&H Space']],
         mentor: mentor,
         pivottype: this.mapTypeName[data['Engagement']],
         summary: data['Consultation Summary'],
         eventref: data['eventref'],
         cohortsref: data['cohortsref'],
         assignmentref: data['assignmentref'],
         marathonref: data['marathonref'],
       }
 
        setDoc(doc(this.firestore,'arenaspace',docid),map).then(()=>{
         this.arenaArray[index]['uploaded'] = true;
         console.log("Uploaded Successfully");
        }).catch((error)=>{
         this.arenaArray[index]['uploaded'] = false;
         console.log('Error', error);
        })
       
        this.totalItems = this.arenaArray.length;
        this.updatePaginatedData();
     }
   }
 
   // function to export file to excel
   exportCSV() {
 
     let exportData = [];
 
     for(let i = 0; i < this.arenaArray.length; i++ ) {
       var map = {};
       for(let j = 0; j < this.tableFields.length; j++ ) {
         let field = this.tableFields[j]
         map[field] = this.arenaArray[i][field]
       }
       exportData.push(map);
 
       if(i+1 == this.arenaArray.length) {
         console.log('data', exportData)
         const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(exportData);
         const wb: XLSX.WorkBook = XLSX.utils.book_new();
         XLSX.utils.book_append_sheet(wb, ws, 'Events Data');
     
         /* save to file */
         XLSX.writeFile(wb, 'Events Data');
       }
     }
  
   }
 
   // function to filter profile 
   returnFilterProflie() {
     return this.participantsArray.filter(e => e['name']?.toLowerCase().includes(this.filteredProfile?.toLowerCase())).sort((a, b) => a['name']?.toLowerCase().localeCompare(b['name']?.toLowerCase()))
   }
 
   // Update paginated data based on current page and page size
   updatePaginatedData(): void {
     const startIndex = (this.currentPage - 1) * this.pageSize;
     const endIndex = startIndex + this.pageSize;
     this.paginatedData = this.arenaArray.slice(startIndex, endIndex);
   }
 
   // Go to specific page
   goToPage(page: number): void {
     if (page >= 1 && page <= this.totalPages) {
       this.currentPage = page;
       this.updatePaginatedData();
     }
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
 
   validateArenaSpace(data, index){
 
     let check = confirm("Are you sure wnat to Mark validated");
 
     if(check){
 
        updateDoc(doc(this.firestore,"arenaspace",data['docid']),{
          validated : true
        }).then(()=>{
          console.log("Validated Successfully");
          this.authguard.openSnackBar("Validated Successfully","OK")
        }).catch((error)=>{
          console.log("Oops Error while Validating Arena Space");
          this.authguard.openSnackBar("Oops Error while Validating Arena Space","OK")
        });
 
     }
 
   }
}
