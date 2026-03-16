import { CommonModule, DatePipe } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { Firestore, collection, doc, getDocs, orderBy, query, setDoc, where, writeBatch } from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { AuthguardService } from '../../authguard.service';
import { MatDatepickerModule } from '@angular/material/datepicker';

@Component({
  selector: 'app-add-appointment-availability',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './add-appointment-availability.component.html',
  styleUrl: './add-appointment-availability.component.css'
})
export class AddAppointmentAvailabilityComponent implements OnInit {

  loggedPID:string
  adminRole:boolean
  schedulerRole:boolean

  dataForm:FormGroup

  selectedUser:string = null
  myAppointment = []
  mapAppointment = {}
  profilelist = []
  minDate
  endDateError = ""
  loading:boolean = false
  otherAvailabilityList = [{
    start: new Date(),
    end: new Date(),
  }]
  shadowingRoles = []
  filtereduser = ""

  constructor(
    @Inject(MAT_DIALOG_DATA) public dialogData : any,
    private dialogRef: MatDialogRef<any>,
    private formbuilder: FormBuilder,
    private firestore: Firestore,
    public guard: AuthguardService,
    public datepipe : DatePipe
  ){
    this.dataForm = this.formbuilder.group({
      slotList : this.formbuilder.array([])
    })

    this.minDate = datepipe.transform(new Date(), "yyyy-MM-dd")
    guard.getRoles().then(async data=>{
      this.loggedPID = data.profile_ref.id
      console.log(this.loggedPID)
      this.adminRole = (data.admin ?? false) || (data.ah ?? false)
      this.schedulerRole = data.scheduler != null ? data.scheduler : false
      if(!this.adminRole && !this.schedulerRole){
        this.selectedUser = this.loggedPID
        this.onProfileSelect()
      }
    })
  }

  ngOnInit(): void {
    this.profilelist = this.dialogData["profilelist"]
    var appointmentList = this.dialogData["appointmentlist"] ?? []
    for (let i = 0; i < appointmentList.length; i++) {
      const element = appointmentList[i];
      this.mapAppointment["appointmenttype/"+element["id"]] = {
        name : element["appointmenttype"],
        duration : element["duration"],
      }
    }
    console.log(appointmentList)
    console.log(this.mapAppointment)
  }

  returnClient(){
    return this.profilelist.filter(e => e.name.toLowerCase().includes(this.filtereduser.toLowerCase()))
  }

  slots():FormArray {
    return this.dataForm.get("slotList") as FormArray
  }

  addSlot(){
    var slotField = this.formbuilder.group({
      appointment : [null, Validators.required],
      date : [null, Validators.required],
      starttime : [null, Validators.required],
      endtime : [null, Validators.required],
    })
    slotField.get("appointment").updateValueAndValidity()
    slotField.get("date").updateValueAndValidity()
    slotField.get("starttime").updateValueAndValidity()
    slotField.get("endtime").updateValueAndValidity()
    slotField.get("starttime").disable()
    slotField.get("endtime").disable()
    this.slots().push(slotField)
  }

  removeSlot(index){
    this.slots().removeAt(index)
  }

  getOtherAvailabilities(){
    var startTime = new Date()
    startTime.setHours(0, 0, 0, 0)
    this.otherAvailabilityList = []
    var collectionRef = collection(this.firestore, "availability")
    var queryFilter = query(collectionRef, where("profileref", "==", doc(this.firestore, "profile_data/"+this.selectedUser)), where("starttime", ">=", startTime))
    getDocs(queryFilter).then(availability=>{
      availability.forEach(doc=>{
        this.otherAvailabilityList.push({
          start: doc.data()["starttime"].toDate(),
          end: doc.data()["endtime"].toDate()
        })
      })
    }).then(()=>{
      console.log(this.otherAvailabilityList)
    }).catch(err=>{
      console.log(err)
    })
  }

  async onProfileSelect(){
    console.log(this.selectedUser)
    this.myAppointment = []
    this.loading = true
    var appointmentCollection = collection(this.firestore, "appointments")
    var appointmentQueryFilter = query(appointmentCollection, where("hosts", "array-contains", doc(this.firestore, "profile_data/"+this.selectedUser)), where("endtime", "<=", new Date()), orderBy("endtime", "desc"))
    await getDocs(appointmentQueryFilter).then(async previousAppt=>{
      var proceed = previousAppt.size == 0 ? true : (previousAppt.docs[0].data()["cancelled"] || previousAppt.docs[0].data()["attended"])
      if(proceed){
        this.getOtherAvailabilities()
        var eisRoleCollection = collection(this.firestore, "Roles-To-EIS")
        var eisRoleQueryFilter = query(eisRoleCollection, where("assigned_eis", "array-contains", doc(this.firestore, "profile_data/"+this.selectedUser)))
        await getDocs(eisRoleQueryFilter).then(async assignedRoles=>{
          var roles = []
          assignedRoles.forEach(doc=>{
            roles.push(doc.data()["assigned_role_ref"]["path"])
          })
          if(roles.length != 0){
            var apptRoleCollection = collection(this.firestore, "AppointmentType-To-Roles")
            await getDocs(apptRoleCollection).then(appointment=>{ // ref=>ref.where("required_role", "array-contains-any", roles)
              var data = []
              for (let i = 0; i < appointment.docs.length; i++) {
                const doc = appointment.docs[i];
                var required = doc.data()["required_role"] ?? []
                var additional = doc.data()["additional_role"] ?? []
                var requiredPath = []
                var additionalPath = []
                required.forEach(ref=>{
                  requiredPath.push(ref.path)
                })
                additional.forEach(ref=>{
                  additionalPath.push(ref.path)
                })
                for (let a = 0; a < roles.length; a++) {
                  const rolePath = roles[a];
                  if(requiredPath.includes(rolePath)){
                    data.push(doc.data()["assigned_appttype_ref"]["path"])
                    break
                  }
                  else if(additionalPath.includes(rolePath) && !this.shadowingRoles.includes(rolePath)){
                    data.push(doc.data()["assigned_appttype_ref"]["path"])
                    break
                  }
                }
              }
              data = Array.from(new Set(data))
              console.log(data)
              data.sort((a,b) => this.mapAppointment[a]["name"].localeCompare(this.mapAppointment[b]["name"]))
              this.myAppointment = data
              console.log(this.myAppointment)
            })
          }
        })
        this.slots().clear()
        this.addSlot()
      }
      else{
        var oldApptName = this.mapAppointment[previousAppt.docs[0].data()["appointment"].path]["name"]
        alert("The last appointment '" + oldApptName + "' Status is not updated by the specialist. Please update to proceed.")
      }
    })
    this.loading = false
  }

  onAppointSelect(index, event){
    var selectedAppointment = this.dataForm.get('slotList')['controls'][index].controls.appointment
    if(selectedAppointment.value.includes(1)){
      selectedAppointment.setValue(this.myAppointment);
      event._selected = true;
    }
    else{
      event._selected = this.myAppointment.length == selectedAppointment.value.length;
    }
    console.log(selectedAppointment.value)
    var endTime = this.dataForm.get('slotList')['controls'][index].controls.endtime.value
    if(endTime != null && endTime != undefined && endTime != ''){
      this.onEndDateChange(index)
    }
  }

  deSelectAll(index, event){
    var selectedAppointment = this.dataForm.get('slotList')['controls'][index].controls.appointment
    if(event._selected==false) {
      selectedAppointment.setValue([]);
    }
  }

  onDateChange(index){
    var dateStart = this.dataForm.get('slotList')['controls'][index].controls.date.value
    console.log(dateStart)
    if(dateStart != null){
      this.dataForm.get('slotList')['controls'][index].controls.starttime.enable()
    }
    else{
      this.dataForm.get('slotList')['controls'][index].controls.starttime.disable()
      this.dataForm.get('slotList')['controls'][index].controls.starttime.setValue(null)
      this.dataForm.get('slotList')['controls'][index].controls.endtime.disable()
      this.dataForm.get('slotList')['controls'][index].controls.endtime.setValue(null)
    }
  }

  onStartDateChange(index){
    var value = this.dataForm.get('slotList')['controls'][index].controls.starttime.value
    console.log(value)
    if(value != null && value != undefined && value != ''){
      this.dataForm.get('slotList')['controls'][index].controls.endtime.enable()
    }
    else{
      this.dataForm.get('slotList')['controls'][index].controls.endtime.disable()
    }
    this.dataForm.get('slotList')['controls'][index].controls.endtime.setValue(null)
  }

  onEndDateChange(index){
    console.log(this.dataForm.get('slotList')['controls'][index].controls.endtime.value)
    var maximumMinutes
    var selectedAppointment = this.dataForm.get('slotList')['controls'][index].controls.appointment.value
    console.log(selectedAppointment)
    var totalDuration = []
    for (let i = 0; i < selectedAppointment.length; i++) {
      const element = selectedAppointment[i];
      totalDuration.push(this.mapAppointment[element].duration)
    }
    if(totalDuration.length != 0){
      console.log(totalDuration)
      totalDuration.sort((a, b) => b - a)
      maximumMinutes = totalDuration[0]
      console.log(maximumMinutes)
    }
    var date = this.dataForm.get('slotList')['controls'][index].controls.date.value
    var startDateList = this.dataForm.get('slotList')['controls'][index].controls.starttime.value.split(":")
    var endDateList = this.dataForm.get('slotList')['controls'][index].controls.endtime.value.split(":")
    var startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startDateList[0], startDateList[1])
    var endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endDateList[0], endDateList[1])
    console.log(startDate)
    console.log(endDate)
    var timedifference = ((endDate.getHours()*60 + endDate.getMinutes()) - (startDate.getHours()*60 + startDate.getMinutes()))
    console.log(timedifference)
    if(timedifference >= maximumMinutes){
      this.dataForm.get('slotList')['controls'][index].controls.endtime.setErrors(null)
    }
    else{
      this.dataForm.get('slotList')['controls'][index].controls.endtime.setErrors({invalid : true})
      this.endDateError = maximumMinutes + " Minutes difference required"
    }
  }

  validateAvailabilityExists(slots):boolean{
    var result:boolean = true
    for (let i = 0; i < slots.length; i++) {
      const element = slots[i];
      var date = element.date
      var startDateList = element.starttime.split(":")
      var endDateList = element.endtime.split(":")
      var starttime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startDateList[0], startDateList[1])
      var endtime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endDateList[0], endDateList[1])
      var available = this.otherAvailabilityList.filter(e => (starttime >= e.start && starttime < e.end) || (endtime >= e.start && endtime <= e.end) || (e.start >= starttime && e.start <= endtime)).length
      if(available != 0){
        result = false
        alert(`You have already given availability similar to the row ${i+1}. Please avoid giving mulitiple availability in same time range`)
        break
      }
    }
    return result
  }

  async onSubmit(value){
    if(this.dataForm.valid){
      console.log(value)
      if(value.slotList.length != 0){
        if(this.validateAvailabilityExists(value.slotList)){
          this.loading = true
          const batch = writeBatch(this.firestore)
          for (let i = 0; i < value.slotList.length; i++) {
            const element = value.slotList[i];
            var selectedAppointments = element.appointment
            console.log(selectedAppointments)
            var date = element.date
            var startDateList = element.starttime.split(":")
            var endDateList = element.endtime.split(":")
      
            var starttime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startDateList[0], startDateList[1], 0, 0)
            var endtime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endDateList[0], endDateList[1], 0, 0)
            console.log(starttime)
            console.log(endtime)

            var appointments = []
            selectedAppointments.forEach(path=>{
              appointments.push(doc(this.firestore, path))
            })

            var docID = doc(collection(this.firestore, 'availability')).id
            batch.set(doc(this.firestore, "availability/"+docID), {
              id: docID,
              starttime: starttime,
              endtime: endtime,
              profileref: doc(this.firestore, "profile_data/"+this.selectedUser),
              appointments: appointments,
            })
          }
          await batch.commit().then(() =>{
            this.loading = false
            this.dataForm.reset()
            this.close()
          }).catch(err =>{
            console.log(err)
            this.loading = false
            alert(err)
          })
        }
      }
      else{
        alert("Select At least one Appointment and Make Slot(s)")
      }
    }
  }

  close(){
    this.dialogRef.close()
  }
}
