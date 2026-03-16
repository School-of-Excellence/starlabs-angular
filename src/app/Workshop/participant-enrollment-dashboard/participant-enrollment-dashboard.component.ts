import { Component, inject } from '@angular/core';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, collectionData, Firestore, getDocs ,doc, where, query, writeBatch, updateDoc} from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { DeleteParticipantEnrollmentComponent } from '../delete-participant-enrollment/delete-participant-enrollment.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-participant-enrollment-dashboard',
  imports: [
    MatFormFieldModule,
    FormsModule,
    CommonModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule

  ],
  templateUrl: './participant-enrollment-dashboard.component.html',
  styleUrl: './participant-enrollment-dashboard.component.css'
})
export class ParticipantEnrollmentDashboardComponent {

  tasklist:any[] = []
  mapProfileToWorkshop = {}
  workshop:any[] = []
  workshopParticipantList = []
  // workshopSubscription:Subscription
  // participantWorkshopSubscription:Subscription

  mapProfileData = {}
  mapUserRefToProfile = {}
  selectedWorkshopAccessAdmin = []
  loggedinprofileid = null

  mapWorkshopChallenges = {}
  challengedoc = null

  selectedProfile = []
  selectedProfileAttendance:boolean = false
  selectedTask = null

  mapTaskToProfileList = {}
  mapProfileToLivecallAttendance = {}

  get loadingdialog(){
    return this.dialog.open(LoadingProgressComponent,{
      data:{
        msg:"processing please wait ...."
      },
      disableClose:true
    })
  }

  bonusChallengeList = []
  showbonus:boolean = false

  selectedWorkshop:any = null

  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)
  constructor(
    private authguard :AuthguardService,
    private dialog : MatDialog
  ){
    collectionData(collection(this.firestore,"eiflix workshop")).pipe(takeUntil(this.destroy$)).subscribe(snap => {
      this.workshop = snap
    })

    this.authguard.getProfileMap().then(e => {
      this.mapProfileData = e.docdata
      for (const key in this.mapProfileData) {
        if(![null,undefined].includes(this.mapProfileData[key]['user_ref'])){
          this.mapUserRefToProfile[this.mapProfileData[key]['user_ref'].id] = this.mapProfileData[key]['profileid']
        }
      }
    })

    this.authguard.getRoles().then(roles => this.loggedinprofileid = roles.profile_ref.id)
    
    getDocs(collection(this.firestore,"eiflix workshop challenges")).then((snap) => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapWorkshopChallenges[element['docid']]=element
        if(element['bonuschallenge'] === true){
          this.bonusChallengeList.push(element)
        }
      }
    })
  }

  ngOnInit(): void {}

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  onSelectWorkshop(option:any){
    console.log(option);
    
    let loadingref = this.loadingdialog
    const workshopRef = doc(this.firestore,"eiflix workshop",option['docid'])
    this.selectedWorkshop = option
    this.challengedoc = this.mapWorkshopChallenges[option['challengeref'].id]
    this.selectedWorkshopAccessAdmin = this.selectedWorkshop['workshopadmin'].map(e => this.mapUserRefToProfile[e.id])
    this.tasklist = [...this.mapWorkshopChallenges[option['challengeref'].id]['tasks'] ,...['completed', 'missing']]
    console.log(this.tasklist);
    
    collectionData(query(collection(this.firestore,"eiflix participant workshop"),where('workshopref','==',workshopRef))).pipe(takeUntil(this.destroy$))
    .subscribe(snap => {
      // this.tasklist = snap.length != 0 ? snap[0]['tasks'] : []
      this.workshopParticipantList = snap
      this.mapTaskToProfileList = {}
      this.mapProfileToLivecallAttendance = {}
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        this.mapProfileToWorkshop[element['profileid']] = element
        // let taskname = element['tasks'][element['tasks'].length - 1]
        // if(element['taskproperty'][taskname] == undefined) console.log(taskname, element["docid"])
        // if((element['taskproperty'][taskname] ?? {})['status'] === 'completed'){
        //   this.mapTaskToProfileList['completed'] = this.mapTaskToProfileList['completed'] || []
        //   this.mapTaskToProfileList['completed'].push(element['profileid'])
        // }

        var mainTaskList = (element["tasks"] ?? []).filter(e => (element["taskproperty"][e] ?? {})["type"] != "livecall")
        // Completed
        var completedTask = mainTaskList.every(e => (element["taskproperty"][e] ?? {})["status"] == "completed")
        if(completedTask){
          this.mapTaskToProfileList['completed'] = this.mapTaskToProfileList['completed'] || []
          this.mapTaskToProfileList['completed'].push(element['profileid'])
        }

        // Missing
        var filterReady = mainTaskList.filter(e => (element["taskproperty"][e] ?? {})["status"] == "ready")
        if(filterReady.length == 0){
          if(mainTaskList.filter(e => element["taskproperty"][e]["status"] == null || element["taskproperty"][e]["status"] == undefined).length != 0){
            this.mapTaskToProfileList['missing'] = this.mapTaskToProfileList['missing'] || []
            this.mapTaskToProfileList['missing'].push(element['profileid'])
          }
        }

        for (let j = 0; j < element['tasks'].length; j++) {
          const task = element['tasks'][j];
          if(element['taskproperty'][task]['type'] === 'livecall'){
            this.mapProfileToLivecallAttendance[element['profileid']] = this.mapProfileToLivecallAttendance[element['profileid']] || []
            this.mapProfileToLivecallAttendance[element['profileid']].push(![null,undefined].includes(element['taskproperty'][task]['attended']) ? element['taskproperty'][task]['attended'] : false)
          }
          this.mapTaskToProfileList[task] = this.mapTaskToProfileList[task] || []
          if(element['taskproperty'][task]['status'] === 'ready'){
            this.mapTaskToProfileList[task].push(element['profileid'])
            break;
          }
        }
      }
      loadingref.close()
    })
  }

  checkChallengeReady(taskname:string,taskproperty:any,profileid:string):boolean{
    let readystatus = false
    // console.log(taskname,taskproperty[taskname]['status']);
    if(taskproperty[taskname]['status'] === 'ready'){
      readystatus = true
    }
    return readystatus
  }

  onSelectProfile(taskname:string,profileid:string,event:MatCheckboxChange){
    if(event.checked){
      if(this.selectedTask === null){
        this.selectedTask = taskname
        this.selectedProfile.push(profileid)
      }else{
        if(this.selectedTask === taskname)this.selectedProfile.push(profileid)
        else event.source.checked = false
      }
    }else{
      let findIndex = this.selectedProfile.findIndex(e => e===profileid)
      if(findIndex != -1){
        this.selectedProfile.splice(findIndex,1)
        if(this.selectedProfile.length === 0) this.selectedTask = null
      }
    }
    // console.log('this.selectedProfile',this.selectedProfile);
    
  }

  onSelectAllProfile(taskname:string,event:MatCheckboxChange){
    if(event.checked){
      this.selectedTask = taskname
      this.selectedProfile = this.mapTaskToProfileList[taskname]
    }else{
      this.selectedProfile = []
      this.selectedTask = null
    }
    // this.checkIndeterminate(taskname)
    // console.log('this.selectedProfile',this.selectedProfile);

  }

  markAttendedForSelectedProfile(event:MatCheckboxChange){
    this.selectedProfileAttendance = event.checked
  }

  checkIndeterminate(taskname:string):boolean{
    let validate = null
    if(![null,undefined].includes(this.mapTaskToProfileList[taskname]) && this.mapTaskToProfileList[taskname].length != 0){
      if(this.mapTaskToProfileList[taskname].some(e => this.selectedProfile.includes(e))){
        if(this.mapTaskToProfileList[taskname].length === this.selectedProfile.length) validate = false
        else validate = true
      }
    }
    return validate
  }

  allSelected(taskname:string){
    let validate = false
    if(![null,undefined].includes(this.mapTaskToProfileList[taskname]) && this.mapTaskToProfileList[taskname].length != 0){
      if(this.mapTaskToProfileList[taskname].some(e => this.selectedProfile.includes(e))){
        if(this.mapTaskToProfileList[taskname].length === this.selectedProfile.length) validate = true
      }
    }
    return validate
  }


  async onMoveProfile(taskname:string,movetotaskname:string){
    if(this.mapTaskToProfileList[taskname].length != 0 && this.mapTaskToProfileList[taskname].some((e:string) => this.selectedProfile.includes(e))){
      let loadingref = this.loadingdialog
      let batch = writeBatch(this.firestore)
      for (let i = 0; i < this.selectedProfile.length; i++) {
        const profileid = this.selectedProfile[i];
        let ref = doc(this.firestore,"eiflix participant workshop",this.mapProfileToWorkshop[profileid]['docid'])
        this.mapProfileToWorkshop[profileid]['taskproperty'][taskname]['status'] = 'completed'
        this.mapProfileToWorkshop[profileid]['taskproperty'][movetotaskname]['status'] = 'ready'
        if(this.selectedProfileAttendance === true){
          this.mapProfileToWorkshop[profileid]['taskproperty'][taskname]['attended'] = true
        }
        batch.update(ref,this.mapProfileToWorkshop[profileid])
        if(i != 0 && i%450 === 0){
          batch.commit().then(() => {
            batch = writeBatch(this.firestore)
            console.log("batch commited",450%i);
          })
        }
      }
      await batch.commit().then(() => {
        this.selectedProfile = []
        this.selectedProfileAttendance = false
        this.selectedTask = null
        console.log("commit Done");
        loadingref.close()
      })
    }else{
      alert("please select a profile")
    }
  }

  onSelectBonusChallenge(bonuschallengedoc:any){
    if(confirm("Are you sure want to update bonus challenege all participant in the selected workshop")){
      let loadingref = this.loadingdialog
      if(!bonuschallengedoc['tasks'].some((e:string) => this.challengedoc['tasks'].includes(e))){
        if(!Object.keys(bonuschallengedoc['groupchallenge']).some((e:string) => Object.keys(this.challengedoc['groupchallenge']).includes(e))){
          bonuschallengedoc['tasks'].forEach((e:string) => {
            this.challengedoc['tasks'].push(e)
          });
          this.challengedoc['groupchallenge'] = {...this.challengedoc['groupchallenge'],...bonuschallengedoc['groupchallenge']}
          this.challengedoc['taskproperty'] = {...this.challengedoc['taskproperty'],...bonuschallengedoc['taskproperty']}
          updateDoc(doc(this.firestore,"eiflix workshop challenges",this.challengedoc.docid),this.challengedoc)
          let allProfile = []
          for (const key in this.mapTaskToProfileList){
            allProfile = [...allProfile , ...this.mapProfileToWorkshop[key]]
          }
          let batch = writeBatch(this.firestore)
          for (let i = 0; i < allProfile.length; i++) {
            const profileid = allProfile[i];
            bonuschallengedoc['tasks'].forEach((e:string) => {
              this.mapProfileToWorkshop[profileid]['tasks'].push(e)
              this.mapProfileToWorkshop[profileid]['groupchallenge'] = {...this.mapProfileToWorkshop[profileid]['groupchallenge'],...bonuschallengedoc['groupchallenge']}
              this.mapProfileToWorkshop[profileid]['taskproperty'] = {...this.mapProfileToWorkshop[profileid]['taskproperty'],...bonuschallengedoc['taskproperty']}
            });
            let ref = doc(this.firestore,"eiflix participant workshop",this.mapProfileToWorkshop[profileid]['docid'])
            batch.update(ref,this.mapProfileToWorkshop[profileid])
            if(i != 0 && i%450 === 0){
              batch.commit().then(() => {
                batch = writeBatch(this.firestore)
                console.log("batch commited",i%450);
                
              })
            }
          }
          batch.commit().then(() => {
            console.log("batch commit done");
            loadingref.close()
          })
        }else{
          alert("bonus challenge 'group challenege' has same name in workshop challenege 'group challenge'");
          loadingref.close()
        }
      }else{
        alert("bonus challenge task has same name in workshop challenege task");
        loadingref.close()
      }
    }
  }

  totalParticipantEnrolled(){
    let n = 0
    for (const key in this.mapTaskToProfileList) {
      n = n + (this.mapTaskToProfileList[key] != undefined ? this.mapTaskToProfileList[key].length : 0)
    }
    return n
  }

  async onParticipantDelete(profileid:string){
    let profilelist = this.workshopParticipantList.filter(e => e['profileid'] === profileid)
    let dialogref = this.dialog.open(DeleteParticipantEnrollmentComponent,{
      data:profilelist,
      disableClose:true,
      width:"80vw"
    })
    dialogref.afterClosed().subscribe(async (result) => {
      console.log(result);
      if(result.length != 0){
        let batch = writeBatch(this.firestore)
        for (let i = 0; i < result.length; i++) {
          const element = result[i].value;
          // console.log(element);
          let challengeref = doc(this.firestore,"eiflix participant workshop",element['docid'])
          batch.delete(challengeref);
          await getDocs(query(collection(this.firestore,"eiflix participant enrolled"),where("participantchallengeref","==",challengeref)))
          .then(enrolmentdata => {
            if(enrolmentdata.docs.length != 0){
              batch.delete(enrolmentdata.docs[0].ref);
            }
          })
        }
        batch.commit().then(() => {
          console.log("done");
        })
      }
    })
  }

  async exportCSV(){
    var data = []
    let element = Object.keys(this.mapTaskToProfileList)
    for (let i = 0; i < element.length; i++) {
      for (let j = 0; j < this.mapTaskToProfileList[element[i]].length; j++) {
        const e = this.mapTaskToProfileList[element[i]][j];
        data.push({
          task: element[i],
          participant: this.mapProfileData[e]['name'],
          email:this.mapProfileData[e]['email'],
          phonenumber:this.mapProfileData[e]['number'],
          countrycode:this.mapProfileData[e]['countrycode']
        })
      }
    }
    console.log(JSON.stringify(data))
    this.downloadFile(data, new Date().toDateString() + " " + this.selectedWorkshop['title'])
  }

  downloadFile(data,filename = 'data') {
    let csvData = this.ConvertToCSV(data, ["task","participant","email","phonenumber","countrycode"]);
    console.log(csvData)
    let blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    let dwldLink = document.createElement("a");
    let url = URL.createObjectURL(blob);
    let isSafariBrowser = navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1;
    if (isSafariBrowser) {  //if Safari open in new window to save file with random filename.
      dwldLink.setAttribute("target", "_blank");
    }
    dwldLink.setAttribute("href", url);
    dwldLink.setAttribute("download", filename + ".csv");
    dwldLink.style.visibility = "hidden";
    document.body.appendChild(dwldLink);
    dwldLink.click();
    document.body.removeChild(dwldLink);
  }

  ConvertToCSV(objArray, headerList) {
    let array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    let row = 'Index,';

    for (let index in headerList) {
      row += headerList[index] + ',';
    }
    row = row.slice(0, -1);
    str += row + '\r\n';
    for (let i = 0; i < array.length; i++) {
      let line = (i + 1) + '';
      for (let index in headerList) {
        let head = headerList[index];
        line += ',' + array[i][head];
      }
      str += line + '\r\n';
    }
    return str;
  }

  resetParticipant(profileid){
    let profilelist = this.workshopParticipantList.filter(e => e['profileid'] === profileid)
    console.log(profilelist)
    if(confirm("Reset All Process and move to First Stage")){
      if(profilelist.length != 0){
        var selectedProfile = profilelist[0]
        var taskList = selectedProfile["tasks"]
        var taskProperty = selectedProfile["taskproperty"]
        for (let i = 0; i < taskList.length; i++) {
          const taskelement = taskList[i];
          if(i == 0){
            taskProperty[taskelement]["status"] = "ready"
          }
          else{
            taskProperty[taskelement]["status"] = null
          }
        }
        console.log(profilelist)
        updateDoc(doc(this.firestore,"eiflix participant workshop",selectedProfile["docid"]),{
          taskproperty: taskProperty
        })
      }
    }
  }
}
