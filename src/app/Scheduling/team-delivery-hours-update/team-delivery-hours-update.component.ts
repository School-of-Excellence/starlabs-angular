import { CommonModule, DatePipe } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, or, query, setDoc, where } from '@angular/fire/firestore';
import { FormGroup, FormBuilder, FormArray, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-team-delivery-hours-update',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatButtonModule,
    MatInputModule,
    MatCheckboxModule
  ],
  templateUrl: './team-delivery-hours-update.component.html',
  styleUrl: './team-delivery-hours-update.component.css'
})
export class TeamDeliveryHoursUpdateComponent {
  loggedinPID
  selectedSpecialist
  specialistWeekOffDays = []
  filteredSpecialist = ""
  specialistList = []
  weekdays = [
    {displayname: "Sunday", id: "sunday"},
    {displayname: "Monday", id: "monday"},
    {displayname: "Tuesday", id: "tuesday"},
    {displayname: "Wednesday", id: "wednesday"},
    {displayname: "Thursday", id: "thursday"},
    {displayname: "Friday", id: "friday"},
    {displayname: "Saturday", id: "saturday"},
  ]
  weekForm:FormGroup
  timezone = {
    hour: 0,
    minute: 0,
    name: Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  loading:boolean = false
  superadmin:boolean
  allowTimesheet:boolean

  constructor(
    public formbuilder: FormBuilder,
    public firestore: Firestore,
    public datePipe: DatePipe,
    public guard: AuthguardService,
    public dialogRef:MatDialogRef<any>,
    @Inject(MAT_DIALOG_DATA) public dialogData: any,
  ) {
    this.weekForm = this.formbuilder.group({
      sunday: this.formbuilder.array([]),
      monday: this.formbuilder.array([]),
      tuesday: this.formbuilder.array([]),
      wednesday: this.formbuilder.array([]),
      thursday: this.formbuilder.array([]),
      friday: this.formbuilder.array([]),
      saturday: this.formbuilder.array([]),
    })
    var zone = datePipe.transform(new Date(), "ZZZZZ").split(":")
    this.timezone.hour = Number(zone[0])
    this.timezone.minute = Number(zone[1])
    console.log(zone, this.timezone)
    if(dialogData != undefined || dialogData != null){
      this.selectedSpecialist = dialogData
      this.onSpecialistSelect()
    }
    
    guard.getRoles().then(async roles=>{
      this.superadmin = roles["admin"] || roles["scheduler"] || roles["ah"] || roles["capacityplanner"] || roles["integrator"]
      this.loggedinPID = roles["profile_ref"].id
      if(this.superadmin){
        this.allowTimesheet = true
      }
      else{
        this.selectedSpecialist = roles.profile_ref.id
        var docRef = doc(firestore, "deliverytime/"+this.selectedSpecialist)
        await getDoc(docRef).then(timing=>{
          if(timing.exists()){
            this.allowTimesheet = false
          }
          else{
            this.allowTimesheet = true
            if(this.selectedSpecialist != dialogData) this.onSpecialistSelect()
          }
        })
      }
    })
  }

  ngOnInit(): void {
    var collectionRef = collection(this.firestore, "users_roles")
    var queryRef = query(collectionRef, or(where("eis", "==", true), where("changeagent", "==", true)))
    getDocs(queryRef).then(userRole=>{
      var data = []
      var document = userRole.docs.map(e => e.data())
      for (let i = 0; i < document.length; i++) {
        const user = document[i];
        data.push({
          name: user["name"],
          profileid: user["profile_ref"].id
        })
      }
      this.specialistList = data
    })
  }

  slots(field:string):FormArray {
    return this.weekForm.get(field) as FormArray
  }

  addSlot(field:string){
    var slotField = this.formbuilder.group({
      starttime : [,Validators.required],
      endtime : [,Validators.required],
    })
    slotField.get("starttime").updateValueAndValidity()
    slotField.get("endtime").updateValueAndValidity()
    slotField.get("endtime").disable()
    this.slots(field).push(slotField)
  }

  removeSlot(field:string, index){
    this.slots(field).removeAt(index)
  }

  clearEverydaySlots(){
    for (let i = 0; i < this.weekdays.length; i++) {
      const id = this.weekdays[i].id;
      this.slots(id).clear()
    }
  }

  addAllDaySlot(){
    for (let i = 0; i < this.weekdays.length; i++) {
      const id = this.weekdays[i].id;
      this.addSlot(id)
    }
  }

  returnSpecialist(){
    return this.specialistList.filter(e => e.name.toLowerCase().includes(this.filteredSpecialist.toLowerCase()))
  }

  async onSpecialistSelect(){
    this.clearEverydaySlots()
    this.loading = true
    var docRef = doc(this.firestore, "deliverytime/"+this.selectedSpecialist)
    console.log(docRef.path)
    await getDoc(docRef).then(timing=>{
      if(timing.exists()){
        var data = timing.data()
        console.log(data)
        this.specialistWeekOffDays = data["weekoff"] ?? []
        for (let i = 0; i < this.weekdays.length; i++) {
          const day = this.weekdays[i].id
          const daytime = data[this.weekdays[i].id] ?? []
          if(daytime.length == 0){
            this.addSlot(day)
            this.updateWeekOff(day, true)
          }
          for (let j = 0; j < daytime.length; j++) {
            this.addSlot(day)
            const time = daytime[j];
            this.weekForm.get(day)["controls"][j].get("starttime").setValue(time["starttime"])
            this.onStartDateChange(day, j)
            this.weekForm.get(day)["controls"][j].get("endtime").setValue(time["endtime"])
            this.onEndDateChange(day, j)
          }
        }
      }
      else{
        this.addAllDaySlot()
      }
    })
    this.loading = false
  }

  updateWeekOff(day, value){
    if(value){
      this.specialistWeekOffDays.push(day)
    }
    else{
      var index = this.specialistWeekOffDays.indexOf(day)
      if(index != -1){
        this.specialistWeekOffDays.splice(index, 1)
      }
    }
    this.onDayOffUpdate(day, value)
  }

  onDayOffUpdate(day, value){
    if(value){
      this.weekForm.get(day)['controls'].forEach(field =>{
        field.controls.starttime.disable()
        field.controls.endtime.disable()
      })
    }
    else{
      this.weekForm.get(day)['controls'].forEach(field =>{
        field.controls.starttime.enable()
        field.controls.endtime.enable()
      })
    }
  }

  onStartDateChange(day, index){
    var value = this.weekForm.get(day)['controls'][index].controls.starttime.value
    if(value != null && value != undefined && value != ''){
      this.weekForm.get(day)['controls'][index].controls.endtime.enable()
    }
    else{
      this.weekForm.get(day)['controls'][index].controls.endtime.disable()
    }
    this.weekForm.get(day)['controls'][index].controls.endtime.setValue(null)
  }

  onEndDateChange(day, index){
    var date = new Date()
    var startDateList = this.weekForm.get(day)['controls'][index].controls.starttime.value.split(":")
    var endDateList = this.weekForm.get(day)['controls'][index].controls.endtime.value.split(":")
    var startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startDateList[0], startDateList[1])
    var endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endDateList[0], endDateList[1])
    var timedifference = ((endDate.getHours()*60 + endDate.getMinutes()) - (startDate.getHours()*60 + startDate.getMinutes()))
    if(timedifference >= 30){
      this.weekForm.get(day)['controls'][index].controls.endtime.setErrors(null)
    }
    else{
      this.weekForm.get(day)['controls'][index].controls.endtime.setErrors({invalid : true})
    }
  }

  async updateSchedule(){
    if(this.weekForm.valid){
      this.loading = true
      var formData = this.weekForm.value

      var newData = {
        weekoff: this.specialistWeekOffDays,
        profileid: this.selectedSpecialist,
        lastmodification: new Date(),
        timezone: this.timezone,
        updatedby: this.loggedinPID
      }

      for (let day of this.weekdays) {
        const dayId = day.id
        if(!this.specialistWeekOffDays.includes(dayId)){
          newData[dayId] = formData[day.id].filter(slot => 
            slot.starttime && slot.endtime
          )
        }
      }

      console.log(newData)
      // data["onDayOffUpdate"] = this.specialistWeekOffDays
      // data["profileid"] = this.selectedSpecialist
      // data["lastmodification"] = new Date()
      // data["timezone"] = this.timezone
      // data['updatedby'] = this.loggedinPID

      var docRef = doc(this.firestore, "deliverytime/"+this.selectedSpecialist)
      await setDoc(docRef, newData).then(()=>{
        this.guard.generateSpecialistSlot(newData["profileid"])
        this.dialogRef.close()
      }).catch(err=>{
        alert(err)
      })
      this.loading = false
    }
  }

  close(){
    this.dialogRef.close()
  }
}