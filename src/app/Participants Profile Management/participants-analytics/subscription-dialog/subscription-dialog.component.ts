import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule, DatePipe } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../../authguard.service';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';

@Component({
  selector: 'app-subscription-dialog',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatCheckboxModule,
    MatButtonModule,
    DatePipe,
    CommonModule,
    MatSelectModule,
    MatDatepickerModule

  ],
  templateUrl: './subscription-dialog.component.html',
  styleUrl: './subscription-dialog.component.css'
})
export class SubscriptionDialogComponent {

  participantdata = ["select", "participant", "activejourney", "subscriptionend", "customerstatus"]
  dataSource: MatTableDataSource<any> = new MatTableDataSource()
  selection = new SelectionModel(true, []);
  subscriptionform: FormGroup;
  mapJourney = {};
  profilesNeedAttention = [];
  showProfilesNeedAttention = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private formbuilder: FormBuilder,
    private authguard: AuthguardService,
    private firestore: Firestore
  ) {
    console.log(data);
    this.dataSource.data = data
    authguard.getJourneyMap().then((map) => this.mapJourney = map);
  }

  ngOnInit(): void {
    this.subscriptionform = this.formbuilder.group({
      extendtype: ['duration', { validators: [Validators.required], updateOn: "change" }],
      duration: [, { validators: [Validators.pattern('^[1-9]\\d*$')], updateOn: "change" }],
      reason: [, { validators: [Validators.required], updateOn: "change" }],
      date: [, { updateOn: "change" }]
    })
    this.selectAllRows();
  }

  selectAllRows() {
    this.dataSource.data.forEach(row => this.selection.select(row));
  }


  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }


  masterToggle() {
    console.log(this.isAllSelected());
    this.isAllSelected() ? this.selection.clear() : this.dataSource.data.forEach(row => this.selection.select(row));
    this.updateProfilesNeedAttention();
  }

  selectRow(row){
    this.selection.toggle(row);
    this.updateProfilesNeedAttention();
  }

  checkboxLabel(row?): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`;
  }

  cancel() {
    console.log('cancel');
    this.dialogRef.close(null)
  }

  submit() {
    var selectedrow = this.dataSource.data.filter(row => this.selection.isSelected(row))
    var profiledata = {
      input: this.subscriptionform.value,
      data: selectedrow
    }
    console.log(profiledata);
    this.dialogRef.close(profiledata)
  }

  getJourneyForParticipant(metadata) {
    const customerStatus = metadata['customerstatus'] ?? null;

    if (customerStatus === 'active') {
      return this.mapJourney[metadata['activejourney']];
    } else if (customerStatus === 'non active') {
      return this.mapJourney[metadata['lastcompletedjourney']];
    }

    return ''
  }

  getParticipantSubscriptionStatus(metadata) {
    const customerStatus = metadata['customerstatus'] ?? null;

    if (customerStatus === 'active') {
      return metadata['subscriptionend']?.toDate() ?? '';
    } else if (customerStatus === 'non active') {
      return metadata['lastsubscriptionend']?.toDate() ?? '';
    }

    return ''
  }

  getRevisedColumn(element) {
    const subscriptionEndDate = this.getParticipantSubscriptionStatus(element);
    
    if (subscriptionEndDate ===  '') {
      return ''
    }
    const extendType = this.subscriptionform.get('extendtype').value;
    let value = this.subscriptionform.get(extendType).value
    if(extendType === 'duration'){
      const date = new Date(subscriptionEndDate);
      date.setMonth(date.getMonth() + value);
      value = date; 
    }
    return value
  }

  get displayColumns() : string[] {
    const extendType = this.subscriptionform.get('extendtype').value;
    const cond = ![null , undefined , ''].includes(extendType) &&  ![null , undefined , ''].includes(this.subscriptionform.get(extendType).value)
    return cond ? [...this.participantdata , 'extendeddate'] : this.participantdata
  }

  updateProfilesNeedAttention(){
    const arr = [];
    var selectedrow = this.data.filter(row => this.selection.isSelected(row));
    selectedrow.forEach((element) => {
      const subscriptionEndDate = this.getParticipantSubscriptionStatus(element);
      const extendType = this.subscriptionform.get('extendtype').value;
      let value = this.subscriptionform.get(extendType).value
      const extendDateCond = extendType === 'date' && value && value?.getTime() < subscriptionEndDate?.getTime()
      if( subscriptionEndDate === '' || extendDateCond){
        arr.push(element['profileid']);
      }

    })
    this.profilesNeedAttention = arr;
    if(arr.length === 0){
      this.filterTable(false)
    }
  }

  filterTable(value : boolean){
    this.showProfilesNeedAttention = value;
    let data = [...this.data];
    if(this.showProfilesNeedAttention && this.profilesNeedAttention.length > 0){
      data = data.filter((element)=> this.profilesNeedAttention.includes(element['profileid']));
    }
    this.dataSource.data = data;
  }
  
  disableSubmitButton(){
    let result = this.subscriptionform.invalid;
    const extendType = this.subscriptionform.get('extendtype').value;
  
    if (extendType === 'date' && ( [null , undefined , ''].includes(this.subscriptionform.value.date) || this.profilesNeedAttention.length > 0) ) {
      result = true;
    } else if(extendType === 'duration' && [null , undefined , ''].includes(this.subscriptionform.value.duration)){
      result = true;
    }

    var selectedrow = this.data.filter(row => this.selection.isSelected(row));
    if(selectedrow.length === 0){
      result = true;
    }

    return result
  }

  onExtendTypeSelect(){
    this.subscriptionform.get('date').setValue(null);
    this.subscriptionform.get('duration').setValue(null);
    this.profilesNeedAttention = [];
    this.showProfilesNeedAttention = false;
  }

}
