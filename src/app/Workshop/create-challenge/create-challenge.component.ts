import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ENTER, COMMA } from '@angular/cdk/keycodes';
import { Component, Inject } from '@angular/core';
import { FormGroup, Validators, FormBuilder, FormArray, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipGrid, MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import {DragDropModule } from '@angular/cdk/drag-drop';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-create-challenge',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    CommonModule,
    MatDividerModule,
    ReactiveFormsModule,
    FormsModule,
    MatChipsModule,
    MatSelectModule,
    MatIconModule,
    MatAutocompleteModule,
    DragDropModule,
    MatCheckboxModule,
    MatChipGrid
  ],
  templateUrl: './create-challenge.component.html',
  styleUrl: './create-challenge.component.css',
})
export class CreateChallengeComponent {
  
  workshopChallengeForm!: FormGroup; 

  tasktype:string[] = ['videoask','form','videocontent','audio','evolutionmapping','livecall']

  mapTypeDataList={
    videoask:[],
    form:[],
    videocontent:[],
    audio:[],
    evolutionmapping:[],
    livecall:[]
  }

  mapTypeToFilteredDataList={
    videoask:[],
    form:[],
    videocontent:[],
    audio:[],
    evolutionmapping:[],
    livecall:[]
  }

  mapTypeToName = {
    videoask:'title',
    form:'formname',
    videocontent:'title',
    audio:'name',
    evolutionmapping:'title',
    livecall:null,
  }

  workshopList = []

  clonedTask:string [] = []

  get groupChallengeForm(){
    return this.workshopChallengeForm.get("groupchallenge") as FormGroup
  }

  get taskPropertyGroup(){
    return this.workshopChallengeForm.get("taskproperty") as FormGroup
  }
  getRewards(formGroupName: string) {
    return this.groupChallengeForm.get(formGroupName).get('rewards') as FormArray;
  }
  selectable = true;
  removable = true;
  separatorKeysCodes: number[] = [ENTER, COMMA]

  pathToDisplayName = {}
  constructor(
    public fb:FormBuilder,
    private firestore:Firestore,
    public dialogRef:MatDialogRef<CreateChallengeComponent>,
    private _snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) { 
    this.workshopChallengeForm = this.fb.group({
      // workshopref:[null,Validators.required],
      label:[null,Validators.required],
      bonuschallenge:[false,],
      tasks:[[],],
      groupchallenge:this.fb.group({}),
      taskproperty:this.fb.group({}),
      docid:[null,Validators.required]
    })
    const episodesRef = collection(this.firestore,'episodes')
    getDocs(episodesRef).then(snap => {
      this.mapTypeDataList.videocontent = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        this.pathToDisplayName[element['ref'].path] = element['title']
        return element
      })
      this.mapTypeToFilteredDataList.videocontent = this.mapTypeDataList.videocontent
      
    })//id//title
    const solarvoiceaudiosRef = collection(this.firestore,'solar voice audios')
    getDocs(solarvoiceaudiosRef).then(snap => {
      this.mapTypeDataList.audio = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        this.pathToDisplayName[element['ref'].path] = element['name']
        return element
      })
      console.log(this.mapTypeDataList.audio);
      
      this.mapTypeToFilteredDataList.audio = this.mapTypeDataList.audio
    })//id//name
    const deliveryformsRef = collection(this.firestore,'delivery forms')
    getDocs(deliveryformsRef).then(snap => {
      this.mapTypeDataList.form = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        this.pathToDisplayName[element['ref'].path] = element['formname']
        return element
      })
      this.mapTypeToFilteredDataList.form = this.mapTypeDataList.form
    })//docid//formname
    const arenavideoaskRef = collection(this.firestore,'arenavideoask')
    getDocs(arenavideoaskRef).then(snap => {
      this.mapTypeDataList.videoask = snap.docs.map(e => {
        let element = e.data()
        element['ref'] = e.ref
        this.pathToDisplayName[element['ref'].path] = element['title']
        return element
      }).filter(e => e['title'] != undefined)
      console.log(this.mapTypeDataList.videoask);
      
      this.mapTypeToFilteredDataList.videoask = this.mapTypeDataList.videoask
      this.mapTypeDataList.evolutionmapping = this.mapTypeDataList.videoask
      this.mapTypeToFilteredDataList.evolutionmapping = this.mapTypeDataList.videoask
    })//docid//title
    const eiflixworkshopRef = collection(this.firestore,'eiflix workshop')
    getDocs(eiflixworkshopRef).then(snap => {
      this.workshopList = snap.docs.map(e => e.data())
    })//docid//title
  }

  ngOnInit(): void {
    if(this.data.type === 'edit'){
      console.log("dialog data",this.data.doc);
      
      this.workshopChallengeForm.patchValue({
        // workshopref:this.data.doc.workshopref.id,
        label:this.data.doc.label,
        bonuschallenge:this.data.doc.bonuschallenge ?? false,
        tasks:this.data.doc.tasks,
        docid:this.data.doc.docid
      })
      for (const key in this.data.doc.groupchallenge) {
        this.groupChallengeForm.addControl(
          key,
          this.fb.group({
            challengename:[key,],
            title:[this.data.doc.groupchallenge[key]['title'],Validators.required],
            description:[this.data.doc.groupchallenge[key]['description'],],
            calltoaction:[this.data.doc.groupchallenge[key]['calltoaction'],],
            icon:[this.data.doc.groupchallenge[key]['icon'],]
          })
        );
        if(Array.isArray(this.data.doc.groupchallenge[key]['rewards'])){
          (this.groupChallengeForm.get(key) as FormGroup).addControl('rewards',new FormArray([]));
          let rewardarray = (this.groupChallengeForm.get(key).get('rewards') as FormArray)
          for (let j = 0; j < this.data.doc.groupchallenge[key]['rewards'].length; j++) {
            const element = this.data.doc.groupchallenge[key]['rewards'][j];
            rewardarray.push(
              this.fb.group({
                title:[element['title'] ?? null],
                image:[element['image'] ?? null],
                availablecount:[element['availablecount'] ?? null],
                rewardlink:[element['rewardlink'] ?? null]
              })
            )
          }
        }else{
          delete this.data.doc.groupchallenge[key]['rewards']
        }
      }
      for (const key in this.data.doc.taskproperty) {
        let toConvertStartDate = this.data.doc.taskproperty[key]['startdate']
        this.taskPropertyGroup.addControl(key,this.fb.group({
          type:[this.data.doc.taskproperty[key]['type'],Validators.required],
          reference:[this.data.doc.taskproperty[key]['reference'],Validators.length],
          title:[this.data.doc.taskproperty[key]['title'],Validators.required],
          description:[this.data.doc.taskproperty[key]['description'],],
          keypoints:[this.data.doc.taskproperty[key]['keypoints'] ?? [],],
          startdate:[![null,undefined].includes(toConvertStartDate) ? toConvertStartDate.toDate() : null,],
          calltoaction:[this.data.doc.taskproperty[key]['calltoaction'],],
          challengename:[this.data.doc.taskproperty[key]['challengename'],],
          icon:[this.data.doc.taskproperty[key]['icon'],],
          thumbnail:[this.data.doc.taskproperty[key]['thumbnail'],]
        }))
      }
    }
    if(this.data.type === 'add'){
      this.workshopChallengeForm.patchValue({
        docid:doc(collection(this.firestore,'eiflix workshop challenges')).id
      })
    }
    this.workshopChallengeForm.valueChanges.pipe(
      debounceTime(1000),
      distinctUntilChanged()
    ).subscribe((formData:any) => {
      this.onSubmit()
    })
  }

  // task releated
  onTaskRemove(formkey:string,index:number){
    let taskprop = this.workshopChallengeForm.get(formkey).value[index]
    this.taskPropertyGroup.removeControl(taskprop)
    this.workshopChallengeForm.get(formkey).value.splice(index,1)
    this.clonedTask = Object.assign([],this.workshopChallengeForm.get('tasks').value)
    this.onSubmit()
  }

  onTaskwrite(event:Event){
    let textvalue = !["",null,undefined].includes((event.target as HTMLInputElement).value.trim()) ? (event.target as HTMLInputElement).value.trim() : ""
    if(textvalue.length != 0){
      this.workshopChallengeForm.get('tasks').value.push(textvalue)
      this.clonedTask = Object.assign([],this.workshopChallengeForm.get('tasks').value)
      this.taskPropertyGroup.addControl(textvalue,this.fb.group({
        type:[null,Validators.required],
        reference:[[],Validators.length],
        title:[null,Validators.required],
        description:[null,],
        keypoints:[[],],
        startdate:[null,],
        calltoaction:[null,],
        challengename:[null,],
        icon:[{},],
        thumbnail:[{},]
      }))
      this.onSubmit()
    }
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.workshopChallengeForm.get('tasks').value, event.previousIndex, event.currentIndex);
    this.clonedTask = Object.assign([],this.workshopChallengeForm.get('tasks').value)
    this.onSubmit()
  }

  //challenge releated

  onCreateChallenge(event:Event){
    let textvalue = !["",null,undefined].includes((event.target as HTMLInputElement).value.trim()) ? (event.target as HTMLInputElement).value.trim() : ""
    if(textvalue.length != 0){
      this.groupChallengeForm.addControl(
        textvalue,
        this.fb.group({
          challengename:[textvalue,],
          title:[null,Validators.required],
          description:[null,],
          calltoaction:[null,],
          icon:[{},]
        })
      )
      this.onSubmit()
    } 
  }

  onRemoveChallenge(challengeName:string){
    this.groupChallengeForm.removeControl(challengeName)
    this.onSubmit()
  }

  onAddRewards(formgroupname:FormGroup,formgroupkey:string){
    if(Array.isArray(formgroupname.get(formgroupkey).value['rewards'])){      
      let array = (formgroupname.get(formgroupkey).get('rewards') as FormArray);
      array.push(this.fb.group({
          title:[null,],
          image:[null,],
          availablecount:[null,],
          rewardlink:[null,]
        })
      )
    }else{
      let group = (formgroupname.get(formgroupkey) as FormGroup);
      group.addControl('rewards',new FormArray([
          this.fb.group({
            title:[null,],
            image:[null,],
            availablecount:[null,],
            rewardlink:[null,]
          })
        ])
      )
    }
  }

  onRemoveRewards(formgroupname:FormGroup,formgroupkey:string,index:number){
    let array = (formgroupname.get(formgroupkey).get('rewards') as FormArray);
    array.removeAt(index)
  }

  onAddRewardsImage(formgroupname:FormGroup,formgroupkey:string,index:number,event:MatChipInputEvent,key:string){
    let eventvalue = event.value.trim()
    let filtervalue = !["",null,undefined].includes(eventvalue) ? eventvalue.trim() : ""
    let array = (formgroupname.get(formgroupkey).get('rewards') as FormArray);
    array.controls[index].value[key] = filtervalue;
    this.onSubmit();
    event.chipInput.clear()
  }

  onRemoveRewardsImage(formgroupname:FormGroup,formgroupkey:string,index:number,key:string){
    let array = (formgroupname.get(formgroupkey).get('rewards') as FormArray);
    array.controls[index].value[key] = null
    this.onSubmit();
  }

  selected(formgroupkey:string,event:MatAutocompleteSelectedEvent): void {
    if(!['evolutionmapping','videoask'].includes(this.taskPropertyGroup.get(formgroupkey).value['type'])){
      if(this.taskPropertyGroup.get(formgroupkey).value['reference'].length == 0){
        this.taskPropertyGroup.get(formgroupkey).value['reference'].push(event.option.value)
        this.onSubmit()
      }else {
        this.openSnackBar("Value must not exceed one")
      }
    }else{
      this.taskPropertyGroup.get(formgroupkey).value['reference'].push(event.option.value)
      this.onSubmit()
    }
  }

  onAddLiveCallReference(formgroupkey:string,event:MatChipInputEvent){
    let textvalue = !["",null,undefined].includes(event.value.trim()) ? event.value.trim() : ""
    if(textvalue.length != 0){
      if(this.taskPropertyGroup.get(formgroupkey).value['reference'].length == 0){
        this.taskPropertyGroup.get(formgroupkey).value['reference'].push(textvalue)
        this.onSubmit()
      }else {
        this.openSnackBar("Value must not exceed one")
      }
    }
    event.chipInput.clear()
  }

  onTextSearch(array:Array<any []>,event:Event,type:string){
    console.log(array,event,type);
    let eventvalue = (event.target as HTMLInputElement).value.trim()
    let filtervalue = !["",null,undefined].includes(eventvalue) ? eventvalue : ""
    return this.mapTypeToFilteredDataList[type] = array.filter(e => e[this.mapTypeToName[type]].toLowerCase().includes(filtervalue))
  }

  onRemoveReference(formgroupkey:string,index){
    this.taskPropertyGroup.get(formgroupkey).value['reference'].splice(index,1)
    this.onSubmit()
  }

  onAddImage(formgroupname:FormGroup,formgroupkey:string,valueprop:string,event:MatChipInputEvent){
    let eventvalue = event.value.trim()
    let filtervalue = !["",null,undefined].includes(eventvalue) ? eventvalue.trim() : ""
    let key = filtervalue.split("size")[1]
    if(key != undefined && key.includes("w") && key.includes("h")){
      formgroupname.get(formgroupkey).value[valueprop][key] = filtervalue;
      this.onSubmit()
    }else{
      this.openSnackBar("Invalid url")
    }
    event.chipInput.clear()
  }

  onRemoveImage(formgroupname:FormGroup,formgroupkey:string,valueprop:string,key){
    delete formgroupname.get(formgroupkey).value[valueprop][key]
    this.onSubmit()
  }

  onKeyPointRemove(groupKey:string,index:number){
    this.taskPropertyGroup.get(groupKey).value['keypoints'].splice(index,1)
    this.onSubmit()
  }

  onKeyPointWrite(groupKey:string,event:Event){
    let textvalue = !["",null,undefined].includes((event.target as HTMLInputElement).value.trim()) ? (event.target as HTMLInputElement).value.trim() : ""
    if(textvalue.length != 0){
      this.taskPropertyGroup.get(groupKey).value['keypoints'].push(textvalue)
      this.onSubmit()
    }
  }

  onDateChange(event:any,formgroupkey:string){
    this.taskPropertyGroup.get(formgroupkey).value['startdate'] = new Date(event.target.value)
    event.target.value = null
    this.onSubmit()
  }

  openSnackBar(message:string) {
    this._snackBar.open(message,null, {
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      duration:1000
    });
  }

  onSubmit(){
      let challenges = []
      let formelement = this.workshopChallengeForm.value
      console.log(formelement);
      
      for (let i = 0; i < formelement['tasks'].length; i++) {
        const key = formelement['tasks'][i];
        if([null,undefined].includes(formelement['taskproperty'][key]['challengename'])){
          challenges.push(Object.assign({},formelement['taskproperty'][key]))
        }else{
          let findindex = challenges.findIndex(e => e['challengename'] === formelement['taskproperty'][key]['challengename'] )
          if(findindex != -1){
            challenges[findindex]['tasks'] = challenges[findindex]['tasks'] || []
            challenges[findindex]['tasks'].push(Object.assign({},formelement['taskproperty'][key]))
          }else{
            challenges.push(Object.assign({},formelement['groupchallenge'][formelement['taskproperty'][key]['challengename']]))
            challenges[challenges.length - 1]['tasks'] = [Object.assign({},formelement['taskproperty'][key])]
          }
        }
      }
      formelement['challenges'] = challenges
      if(this.data.type === 'add'){
        const eiflixworkshopchallengesRef = doc(this.firestore,'eiflix workshop challenges',formelement['docid'])
        setDoc(eiflixworkshopchallengesRef,formelement).then(() => {
          this.openSnackBar("Form updated")
        }).catch(err => {
          console.log(err);
        })
      }else{
        const eiflixworkshopchallengesRef = doc(this.firestore,'eiflix workshop challenges',formelement['docid'])
        updateDoc(eiflixworkshopchallengesRef,formelement).then(() => {
          this.openSnackBar("Form updated")
        }).catch(err => {
          console.log(err);
        })
      }
  }

}
