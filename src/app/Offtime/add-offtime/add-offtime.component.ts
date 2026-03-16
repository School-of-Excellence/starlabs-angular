import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, FormArray, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { collection, doc, Firestore, getDocs, or, query, setDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-add-offtime',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatDatepickerModule,
    MatIconModule,
    MatCheckboxModule,
    MatButtonModule
  ],
  templateUrl: './add-offtime.component.html',
  styleUrl: './add-offtime.component.css'
})
export class AddOfftimeComponent implements OnInit {
  loading:boolean = true
  superRole:boolean
  minDate
  filteredname:string = ""
  specialistList = []
  selectedSpecialist:string

  dateRange:boolean = false
  offtimeForm:FormGroup

  constructor(public guard: AuthguardService, public formbuilder: FormBuilder, public firestore: Firestore, public dialogref: MatDialogRef<any>, public datepipe: DatePipe) {
    this.offtimeForm = this.formbuilder.group({
      offtime : this.formbuilder.array([])
    })
    guard.getRoles().then(async roles=>{
      this.mapData()
      var admin = roles["admin"] ?? false
      var scheduler = roles["scheduler"] ?? false
      var ah = roles["ah"] ?? false
      var capacityplanner = roles["capacityplanner"] ?? false
      var integrator = roles["integrator"] ?? false
      this.superRole = admin || ah || scheduler || capacityplanner || integrator
      if(!this.superRole){
        this.selectedSpecialist = roles["profile_ref"].id
      }
      this.loading = false
    })
  }

  ngOnInit(): void {
    this.addSlot()
    this.minDate = this.datepipe.transform(new Date(), "yyyy-MM-dd")
  }

  async mapData(){
    var collectionRef = collection(this.firestore, "users_roles")
    var queryRef = query(collectionRef, or(where("eis", "==", true), where("changeagent", "==", true)))
    getDocs(queryRef).then(profileData=>{
      var data =[]
      for (let i = 0; i < profileData.docs.length; i++) {
        const specialist = profileData.docs[i].data();
        data.push({
          name: specialist["name"],
          id: specialist["profile_ref"].id
        })
      }
      this.specialistList = data
    })
  }

  returnSpecialist(){
    return this.specialistList.filter(e => e.name.toLowerCase().includes(this.filteredname.toLowerCase()))
  }

  slots():FormArray {
    return this.offtimeForm.get("offtime") as FormArray
  }

  addSlot(){
    var slotField = this.formbuilder.group({
      startdate : [,Validators.required],
      enddate : [, this.dateRange ? Validators.required : null],
      starttime : [,Validators.required],
      endtime : [,Validators.required],
      fullday: [false]
    })
    slotField.get("startdate").updateValueAndValidity()
    slotField.get("enddate").updateValueAndValidity()
    slotField.get("starttime").updateValueAndValidity()
    slotField.get("endtime").updateValueAndValidity()
    slotField.get("endtime").disable()
    this.slots().push(slotField)
  }

  removeSlot(index){
    this.slots().removeAt(index)
  }

  onSpecialistSelected(){
    this.slots().clear()
    this.addSlot()
  }

  onStartTimeChange(index){
    var value = this.offtimeForm.get('offtime')['controls'][index].controls.starttime.value
    if(value != null && value != undefined && value != ''){
      this.offtimeForm.get('offtime')['controls'][index].controls.endtime.enable()
      this.onEndTimeChange(index)
    }
    else{
      this.offtimeForm.get('offtime')['controls'][index].controls.endtime.disable()
    }
  }

  onEndTimeChange(index){
    var value = this.offtimeForm.get('offtime')['controls'][index].controls.endtime.value
    if(value != null && value != undefined && value != ''){
      var date = new Date()
      var startDateList = this.offtimeForm.get('offtime')['controls'][index].controls.starttime.value.split(":")
      var endDateList = this.offtimeForm.get('offtime')['controls'][index].controls.endtime.value.split(":")
      var startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startDateList[0], startDateList[1])
      var endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endDateList[0], endDateList[1])
      var timedifference = ((endDate.getHours()*60 + endDate.getMinutes()) - (startDate.getHours()*60 + startDate.getMinutes()))
      if(timedifference >= 1){
        this.offtimeForm.get('offtime')['controls'][index].controls.endtime.setErrors(null)
      }
      else{
        this.offtimeForm.get('offtime')['controls'][index].controls.endtime.setErrors({invalid : true})
      }
    }
  }

  onChecked(index, value){
    if(value){
      this.offtimeForm.get('offtime')['controls'][index].controls.starttime.disable()
      this.offtimeForm.get('offtime')['controls'][index].controls.endtime.disable()
    }
    else{
      this.offtimeForm.get('offtime')['controls'][index].controls.starttime.enable()
      this.offtimeForm.get('offtime')['controls'][index].controls.endtime.enable()
    }
  }

  submit(){
    if(this.offtimeForm.valid){
      this.loading = true
      var value = this.offtimeForm.getRawValue().offtime
      console.log(value)

      for (let i = 0; i < value.length; i++) {
        const time = value[i];
        var data = {}
        if(this.dateRange){
          var startDate = time.startdate
          var endDate = time.enddate
          var batch = writeBatch(this.firestore)
          for (let j = startDate.getDate(); j <= endDate.getDate(); j++) {
            var date = new Date(new Date(startDate).setDate(j))
            var starttime = new Date(new Date(date).setHours(time.fullday ? 0 : time.starttime.split(":")[0], time.fullday ? 0 : time.starttime.split(":")[1], 0 ,0))
            var endtime = new Date(new Date(date).setHours(time.fullday ? 23 : time.endtime.split(":")[0], time.fullday ? 59 : time.endtime.split(":")[1], 0 ,0))
            data = {
              date: date,
              starttime: starttime,
              endtime: endtime,
              fullday: time.fullday,
              profileid: this.selectedSpecialist,
              status: null,
              docid: doc(collection(this.firestore,"offtime")).id
            }
            console.log(data)
            batch.set(doc(this.firestore, "offtime/"+data["docid"]), data)
          }
          batch.commit().then(() =>{
            this.dialogref.close()
          })
        }
        else{
          var starttime = new Date(new Date(time.startdate).setHours(time.fullday ? 0 : time.starttime.split(":")[0], time.fullday ? 0 : time.starttime.split(":")[1], 0 ,0))
          var endtime = new Date(new Date(time.startdate).setHours(time.fullday ? 23 : time.endtime.split(":")[0], time.fullday ? 59 : time.endtime.split(":")[1], 0 ,0))
          data = {
            date: time.startdate,
            starttime: starttime,
            endtime: endtime,
            fullday: time.fullday,
            profileid: this.selectedSpecialist,
            status: null,
            docid: doc(collection(this.firestore,"offtime")).id
          }
          console.log(data)
          setDoc(doc(this.firestore, "offtime/"+data["docid"]), data).then(() =>{
            this.dialogref.close()
          })
        }
      }
    }
  }
}