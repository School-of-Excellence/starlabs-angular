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
    CommonModule
  ],
  templateUrl: './subscription-dialog.component.html',
  styleUrl: './subscription-dialog.component.css'
})
export class SubscriptionDialogComponent {
  
  participantdata = ["select","participant", "activejourney", "subscriptionend"]
  dataSource:MatTableDataSource<any> = new MatTableDataSource()
  selection = new SelectionModel(true, []);
  subscriptionform : FormGroup

  constructor(
    @Inject(MAT_DIALOG_DATA) public data:any, 
    public dialogRef: MatDialogRef<any>, 
    private formbuilder: FormBuilder,
    private firestore: Firestore
  ) {
    console.log(data);
    this.dataSource.data = data
  }

  ngOnInit(): void {
    this.subscriptionform = this.formbuilder.group ({
      duration: [, {validators: [Validators.required, Validators.pattern('^[1-9]\\d*$')], updateOn:"change"}],
      reason: [, {validators: [Validators.required], updateOn:"change"}],
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
    this.isAllSelected() ? this.selection.clear(): this.dataSource.data.forEach(row => this.selection.select(row));
  }

  checkboxLabel(row?): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`;
  }

  cancel(){
    console.log('cancel');
    this.dialogRef.close(null)
  }

  submit(){
    var selectedrow = this.dataSource.data.filter(row => this.selection.isSelected(row))
    var profiledata = {
      input : this.subscriptionform.value,
      data : selectedrow
    }
    console.log(profiledata);
    if(this.subscriptionform.valid){
      this.dialogRef.close(profiledata)
    }
  }
}
